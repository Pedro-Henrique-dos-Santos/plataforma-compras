import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CostCenter,
  GoogleSheetsConnectorStatus,
  GoogleSheetsIntegration,
  GoogleSheetsIntegrationInput,
  PurchaseSummary,
  SheetSyncAction,
  SheetSyncPreview,
  SheetSyncResult,
  Supplier,
  SupplierPrice,
  UpdateSupplierInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { ProcurementRepository } from '../procurement/procurement.repository.js';
import { AutomationRepository } from './automation.repository.js';
import { readExcelWorkbook } from './excel-workbook.reader.js';
import { GoogleSheetsReader } from './google-sheets.reader.js';
import {
  costCenterCode,
  normalizeText,
  parseSheetWorkbook,
} from './sheet-sync.parser.js';
import type {
  ParsedSheetPayload,
  ParsedSheetPrice,
  ParsedSheetPurchase,
  ParsedSheetSupplier,
  PlannedSheetOperation,
  SheetSyncPayload,
  SheetWorkbook,
  StoredGoogleSheetsIntegration,
} from './sheet-sync.types.js';

@Injectable()
export class GoogleSheetsSyncService {
  constructor(
    @Inject(AutomationRepository)
    private readonly automation: AutomationRepository,
    @Inject(ProcurementRepository)
    private readonly procurement: ProcurementRepository,
    @Inject(GoogleSheetsReader)
    private readonly reader: GoogleSheetsReader,
  ) {}

  async getStatus(organizationId: string): Promise<GoogleSheetsConnectorStatus> {
    const [stored, connector] = await Promise.all([
      this.automation.getGoogleSheetsIntegration(organizationId),
      Promise.resolve(this.reader.connectorInfo()),
    ]);
    return {
      ...connector,
      integration: stored ? enrichIntegration(stored, connector) : null,
    };
  }

  async configure(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: GoogleSheetsIntegrationInput,
  ): Promise<GoogleSheetsIntegration> {
    const saved = await this.automation.upsertGoogleSheetsIntegration(
      actor,
      organizationId,
      input,
    );
    return enrichIntegration(saved, this.reader.connectorInfo());
  }

  async preview(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<SheetSyncPreview> {
    const integration = await this.requireIntegration(organizationId);
    const workbook = await this.reader.readWorkbook(integration);
    return this.createPreview(actor, organizationId, integration, workbook);
  }

  async previewWorkbook(
    actor: AuthenticatedIdentity,
    organizationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<SheetSyncPreview> {
    if (!file) {
      throw new BadRequestException('Selecione um arquivo Excel para gerar a previa.');
    }
    const integration = await this.requireIntegration(organizationId);
    const workbook = await readExcelWorkbook(file.buffer, file.originalname);
    return this.createPreview(actor, organizationId, integration, workbook);
  }

  private async createPreview(
    actor: AuthenticatedIdentity,
    organizationId: string,
    integration: StoredGoogleSheetsIntegration,
    workbook: SheetWorkbook,
  ): Promise<SheetSyncPreview> {
    if (!integration.enabled) {
      throw new BadRequestException('A integracao Google Sheets esta desativada.');
    }
    const parsed = parseSheetWorkbook(workbook, integration);
    const [centers, suppliers, prices, purchases] = await Promise.all([
      this.procurement.listCostCenters(organizationId, { includeInactive: true }),
      this.procurement.listSuppliers(organizationId),
      this.procurement.listSupplierPrices(organizationId),
      this.procurement.listPurchases(organizationId),
    ]);
    const catalog = completeSupplierCatalog(parsed, suppliers);
    const planned = planSheetSync(catalog, centers, suppliers, prices, purchases);
    const snapshotHash = createHash('sha256')
      .update(JSON.stringify(workbook.tables))
      .digest('hex');
    const createdAt = new Date().toISOString();
    const savedIntegration = await this.automation.upsertGoogleSheetsIntegration(
      actor,
      organizationId,
      {
        spreadsheetId: integration.spreadsheetId,
        spreadsheetTitle: workbook.spreadsheetTitle,
        itemsSheetName: integration.itemsSheetName,
        installmentsSheetName: integration.installmentsSheetName,
        suppliersSheetName: integration.suppliersSheetName,
        pricesSheetName: integration.pricesSheetName,
        headerRow: integration.headerRow,
        enabled: integration.enabled,
      },
    );
    const preview = {
      spreadsheetTitle: workbook.spreadsheetTitle,
      snapshotHash,
      actions: planned.actions,
      totals: buildTotals(planned.actions, catalog.sourceRows),
      createdAt,
    };
    const run = await this.automation.createSheetSyncRun({
      actorId: actor.id,
      organizationId,
      integrationId: savedIntegration.id,
      snapshotHash,
      payload: planned,
      preview,
    });
    return run.preview;
  }

  async apply(
    actor: AuthenticatedIdentity,
    organizationId: string,
    runId: string,
  ): Promise<SheetSyncResult> {
    const run = await this.automation.getSheetSyncRun(organizationId, runId);
    if (!run) {
      throw new NotFoundException('Previa de sincronizacao nao encontrada.');
    }
    if (run.status === 'APPLIED' && run.result) {
      return run.result;
    }
    const claimed = await this.automation.claimSheetSyncRun(organizationId, runId);
    if (!claimed) {
      throw new ConflictException(
        'Esta previa ja esta sendo aplicada ou precisa ser gerada novamente.',
      );
    }

    try {
      const result = await this.applyPayload(actor, organizationId, runId, run.payload);
      await this.automation.markSheetSyncApplied(actor, organizationId, runId, result);
      return result;
    } catch (error) {
      await this.automation.markSheetSyncFailed(
        organizationId,
        runId,
        safeErrorMessage(error),
      );
      throw error;
    }
  }

  private async applyPayload(
    actor: AuthenticatedIdentity,
    organizationId: string,
    runId: string,
    payload: SheetSyncPayload,
  ): Promise<SheetSyncResult> {
    const operationByKey = new Map(payload.operations.map((operation) => [operation.key, operation]));
    let centers = await this.procurement.listCostCenters(organizationId, {
      includeInactive: true,
    });
    let costCentersCreated = 0;
    for (const centerName of collectCostCenterNames(payload)) {
      const key = `cost-center:${normalizeText(centerName)}`;
      if (operationByKey.get(key)?.action !== 'CREATE') continue;
      const created = await this.procurement.createCostCenter(actor, organizationId, {
        code: uniqueCenterCode(centerName, centers),
        name: centerName,
      });
      centers = [...centers, created];
      costCentersCreated += 1;
    }

    let suppliers = await this.procurement.listSuppliers(organizationId);
    let suppliersCreated = 0;
    let suppliersUpdated = 0;
    for (const source of payload.suppliers) {
      const key = `supplier:${source.sourceKey}`;
      const operation = operationByKey.get(key);
      if (!operation || !['CREATE', 'UPDATE'].includes(operation.action)) continue;
      const centerId = source.costCenterName
        ? findCenter(centers, source.costCenterName)?.id ?? null
        : null;
      const existing = findSupplier(suppliers, source.document, source.legalName);
      if (operation.action === 'CREATE' && !existing) {
        let created = await this.procurement.createSupplier(actor, organizationId, {
          legalName: source.legalName,
          tradeName: source.tradeName,
          document: source.document,
          category: source.category,
          operationNature: source.operationNature,
          paymentMethod: source.paymentMethod,
          defaultCostCenterId: centerId,
          email: source.email,
          phone: source.phone,
          notes: source.notes ?? 'Cadastro automatico pela sincronizacao Google Sheets.',
        });
        if (!source.active) {
          created = await this.procurement.updateSupplier(
            actor,
            organizationId,
            created.id,
            { status: 'INACTIVE' },
          );
        }
        suppliers = [...suppliers, created];
        suppliersCreated += 1;
        continue;
      }
      if (existing) {
        const updated = await this.procurement.updateSupplier(
          actor,
          organizationId,
          existing.id,
          supplierUpdate(source, centerId),
        );
        suppliers = suppliers.map((supplier) =>
          supplier.id === updated.id ? updated : supplier,
        );
        suppliersUpdated += 1;
      }
    }

    let pricesCreated = 0;
    let pricesUpdated = 0;
    const pricesBySupplier = new Map<string, ParsedSheetPrice[]>();
    for (const price of payload.prices) {
      const operation = operationByKey.get(`price:${price.sourceKey}`);
      if (!operation || !['CREATE', 'UPDATE'].includes(operation.action)) continue;
      const supplier = findSupplier(suppliers, price.supplierDocument, price.supplierName);
      if (!supplier) {
        throw new BadRequestException(`Fornecedor nao localizado para o item ${price.description}.`);
      }
      const values = pricesBySupplier.get(supplier.id) ?? [];
      values.push(price);
      pricesBySupplier.set(supplier.id, values);
    }
    for (const [supplierId, values] of pricesBySupplier) {
      const imported = await this.procurement.importSupplierPrices(actor, organizationId, {
        supplierId,
        items: values.map((price) => ({
          itemCode: price.itemCode,
          description: price.description,
          unit: price.unit,
          initialPrice: price.initialPrice,
          negotiatedPrice: price.negotiatedPrice,
          validFrom: price.validFrom,
          validUntil: price.validUntil,
          source: 'GOOGLE_SHEETS',
          notes: price.notes,
        })),
      });
      pricesCreated += imported.created;
      pricesUpdated += imported.updated;
    }

    let purchasesCreated = 0;
    let invoicesAttached = 0;
    for (const purchase of payload.purchases) {
      const key = `purchase:${purchase.sourceKey}`;
      const operation = operationByKey.get(key);
      if (!operation) continue;
      if (operation.action === 'ATTACH_INVOICE' && operation.targetId && purchase.invoiceNumber) {
        await this.procurement.attachPurchaseInvoice(actor, organizationId, operation.targetId, {
          invoiceNumber: purchase.invoiceNumber,
        });
        invoicesAttached += 1;
        continue;
      }
      if (operation.action !== 'CREATE') continue;
      const supplier = findSupplier(
        suppliers,
        purchase.supplierDocument,
        purchase.supplierName,
      );
      if (!supplier) {
        throw new BadRequestException(`Fornecedor nao localizado para o pedido ${purchase.number}.`);
      }
      const purchaseTotal = calculatePurchaseTotal(purchase);
      const installmentTotal = roundMoney(
        purchase.installments.reduce((total, installment) => total + installment.amount, 0),
      );
      const installments =
        purchase.installments.length && Math.abs(installmentTotal - purchaseTotal) <= 0.01
          ? purchase.installments.map((installment) => ({
              dueDate: installment.dueDate,
              amount: installment.amount,
            }))
          : [];
      await this.procurement.createPurchase(actor, organizationId, {
        number: purchase.number,
        invoiceNumber: purchase.invoiceNumber,
        supplierId: supplier.id,
        issuedAt: purchase.issuedAt,
        category: purchase.category,
        operationNature: purchase.operationNature,
        paymentMethod: purchase.paymentMethod,
        notes: purchase.notes,
        source: 'GOOGLE_SHEETS',
        sourceReference: purchase.number,
        items: purchase.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          negotiatedPrice: item.negotiatedPrice,
          costCenterId: item.costCenterName
            ? findCenter(centers, item.costCenterName)?.id ?? null
            : null,
          allocations: [],
        })),
        installments,
      });
      purchasesCreated += 1;
    }

    const completedAt = new Date().toISOString();
    return {
      runId,
      suppliersCreated,
      suppliersUpdated,
      costCentersCreated,
      pricesCreated,
      pricesUpdated,
      purchasesCreated,
      invoicesAttached,
      duplicatesSkipped: payload.actions.filter((action) => action.action === 'SKIP_DUPLICATE').length,
      ignored: payload.actions.filter((action) => action.action === 'SKIP_OUT_OF_SCOPE').length,
      invalid: payload.actions.filter((action) => action.action === 'INVALID').length,
      completedAt,
    };
  }

  private async requireIntegration(
    organizationId: string,
  ): Promise<StoredGoogleSheetsIntegration> {
    const integration = await this.automation.getGoogleSheetsIntegration(organizationId);
    if (!integration) {
      throw new NotFoundException('Configure a planilha antes de iniciar a sincronizacao.');
    }
    return integration;
  }
}

export function completeSupplierCatalog(
  parsed: ParsedSheetPayload,
  currentSuppliers: Supplier[],
): ParsedSheetPayload {
  const suppliers = parsed.suppliers.map((supplier) => ({ ...supplier }));
  const ensure = (source: {
    supplierDocument: string | null;
    supplierName: string;
    rowNumber: number;
    category: string | null;
    costCenterName: string | null;
    operationNature?: string | null;
    paymentMethod?: string | null;
  }) => {
    let supplier = suppliers.find(
      (candidate) =>
        (source.supplierDocument && candidate.document === source.supplierDocument) ||
        normalizeText(candidate.legalName) === normalizeText(source.supplierName) ||
        (candidate.tradeName &&
          normalizeText(candidate.tradeName) === normalizeText(source.supplierName)),
    );
    if (!supplier) {
      const current = findSupplier(
        currentSuppliers,
        source.supplierDocument,
        source.supplierName,
      );
      supplier = {
        sourceKey: source.supplierDocument || normalizeText(source.supplierName),
        rowNumber: source.rowNumber,
        externalId: null,
        document: source.supplierDocument,
        legalName: source.supplierName,
        tradeName: null,
        email: null,
        phone: null,
        category: source.category,
        operationNature: source.operationNature ?? null,
        paymentMethod: source.paymentMethod ?? null,
        costCenterName: source.costCenterName,
        notes: current ? null : 'Cadastro automatico pela sincronizacao Google Sheets.',
        active: current?.status !== 'INACTIVE',
      };
      suppliers.push(supplier);
      return;
    }
    supplier.category ||= source.category;
    supplier.costCenterName ||= source.costCenterName;
    supplier.operationNature ||= source.operationNature ?? null;
    supplier.paymentMethod ||= source.paymentMethod ?? null;
  };
  for (const price of parsed.prices) {
    ensure(price);
  }
  for (const purchase of parsed.purchases) {
    ensure({
      ...purchase,
      rowNumber: purchase.rowNumbers[0] ?? 1,
      costCenterName: purchase.items.find((item) => item.costCenterName)?.costCenterName ?? null,
    });
  }
  return { ...parsed, suppliers };
}

export function planSheetSync(
  parsed: ParsedSheetPayload,
  centers: CostCenter[],
  suppliers: Supplier[],
  prices: SupplierPrice[],
  purchases: PurchaseSummary[],
): SheetSyncPayload {
  const actions: SheetSyncAction[] = [...parsed.issues];
  const operations: PlannedSheetOperation[] = parsed.issues.map((issue) => ({
    key: issue.key,
    action: issue.action,
  }));
  const push = (action: SheetSyncAction, targetId?: string) => {
    actions.push(action);
    operations.push({ key: action.key, action: action.action, ...(targetId && { targetId }) });
  };

  for (const name of collectCostCenterNames(parsed)) {
    const key = `cost-center:${normalizeText(name)}`;
    const existing = findCenter(centers, name);
    push({
      key,
      entity: 'COST_CENTER',
      action: existing ? 'SKIP_DUPLICATE' : 'CREATE',
      rowNumbers: sourceRowsForCenter(parsed, name),
      label: name,
      reason: existing
        ? 'Centro de custo ja cadastrado nesta empresa.'
        : 'Novo centro de custo identificado na planilha.',
      amount: null,
    });
  }

  for (const source of parsed.suppliers) {
    const key = `supplier:${source.sourceKey}`;
    const existing = findSupplier(suppliers, source.document, source.legalName);
    const needsUpdate = existing ? supplierNeedsUpdate(existing, source) : false;
    const action = existing ? (needsUpdate ? 'UPDATE' : 'SKIP_DUPLICATE') : 'CREATE';
    push(
      {
        key,
        entity: 'SUPPLIER',
        action,
        rowNumbers: [source.rowNumber],
        label: source.tradeName ?? source.legalName,
        reason:
          action === 'CREATE'
            ? 'Fornecedor ainda nao cadastrado nesta empresa.'
            : action === 'UPDATE'
              ? 'O cadastro existente sera completado com dados da planilha.'
              : 'Fornecedor ja esta atualizado.',
        amount: null,
      },
      existing?.id,
    );
  }

  const priceKeys = new Set<string>();
  for (const source of parsed.prices) {
    const key = `price:${source.sourceKey}`;
    if (priceKeys.has(key)) {
      push({
        key: `${key}:duplicate:${source.rowNumber}`,
        entity: 'PRICE',
        action: 'INVALID',
        rowNumbers: [source.rowNumber],
        label: source.description,
        reason: 'Preco repetido na propria planilha.',
        amount: source.negotiatedPrice,
      });
      continue;
    }
    priceKeys.add(key);
    if (!source.active) {
      push({
        key,
        entity: 'PRICE',
        action: 'SKIP_OUT_OF_SCOPE',
        rowNumbers: [source.rowNumber],
        label: source.description,
        reason: 'Preco inativo na planilha de origem.',
        amount: source.negotiatedPrice,
      });
      continue;
    }
    const supplier = findSupplier(suppliers, source.supplierDocument, source.supplierName);
    const existing = supplier
      ? prices.find(
          (price) =>
            price.supplierId === supplier.id &&
            (source.itemCode
              ? normalizeText(price.itemCode ?? '') === normalizeText(source.itemCode)
              : normalizeText(price.description) === normalizeText(source.description) &&
                normalizeText(price.unit ?? '') === normalizeText(source.unit ?? '')),
        )
      : undefined;
    const changed = existing ? priceNeedsUpdate(existing, source) : false;
    const action = existing ? (changed ? 'UPDATE' : 'SKIP_DUPLICATE') : 'CREATE';
    push(
      {
        key,
        entity: 'PRICE',
        action,
        rowNumbers: [source.rowNumber],
        label: `${source.supplierName} | ${source.description}`,
        reason:
          action === 'CREATE'
            ? 'Novo valor negociado identificado.'
            : action === 'UPDATE'
              ? 'O valor negociado cadastrado esta diferente da planilha.'
              : 'Valor negociado ja esta atualizado.',
        amount: source.negotiatedPrice,
      },
      existing?.id,
    );
  }

  for (const source of parsed.purchases) {
    const key = `purchase:${source.sourceKey}`;
    const total = calculatePurchaseTotal(source);
    const supplier = findSupplier(suppliers, source.supplierDocument, source.supplierName);
    const exactNumber = purchases.find(
      (purchase) =>
        normalizeText(purchase.number) === normalizeText(source.number) ||
        normalizeText(purchase.sourceReference ?? '') === normalizeText(source.number),
    );
    if (exactNumber) {
      const sameSupplier = supplier
        ? exactNumber.supplierId === supplier.id
        : normalizeText(exactNumber.supplierName) === normalizeText(source.supplierName);
      if (!sameSupplier) {
        push({
          key,
          entity: 'PURCHASE',
          action: 'INVALID',
          rowNumbers: source.rowNumbers,
          label: source.number,
          reason: 'O numero do pedido ja existe para outro fornecedor.',
          amount: total,
        });
      } else if (source.invoiceNumber && !exactNumber.invoiceNumber) {
        push(
          {
            key,
            entity: 'PURCHASE',
            action: 'ATTACH_INVOICE',
            rowNumbers: source.rowNumbers,
            label: source.number,
            reason: 'A compra ja existe e recebera apenas o numero da nota fiscal ausente.',
            amount: total,
          },
          exactNumber.id,
        );
      } else if (
        source.invoiceNumber &&
        exactNumber.invoiceNumber &&
        normalizeText(source.invoiceNumber) !== normalizeText(exactNumber.invoiceNumber)
      ) {
        push({
          key,
          entity: 'PURCHASE',
          action: 'INVALID',
          rowNumbers: source.rowNumbers,
          label: source.number,
          reason: 'O pedido existente possui outro numero de nota fiscal.',
          amount: total,
        });
      } else {
        push(duplicatePurchaseAction(key, source, total, 'Pedido ja cadastrado.'));
      }
      continue;
    }
    const invoiceMatch = source.invoiceNumber
      ? purchases.find(
          (purchase) =>
            supplier?.id === purchase.supplierId &&
            normalizeText(purchase.invoiceNumber ?? '') === normalizeText(source.invoiceNumber ?? ''),
        )
      : undefined;
    if (invoiceMatch) {
      push(duplicatePurchaseAction(key, source, total, 'Nota fiscal ja cadastrada.'));
      continue;
    }
    const valueMatches = purchases.filter(
      (purchase) =>
        normalizeText(purchase.supplierName) === normalizeText(source.supplierName) &&
        Math.abs(purchase.total - total) <= 0.01 &&
        !purchase.invoiceNumber,
    );
    if (source.invoiceNumber && valueMatches.length === 1) {
      push(
        {
          key,
          entity: 'PURCHASE',
          action: 'ATTACH_INVOICE',
          rowNumbers: source.rowNumbers,
          label: source.number,
          reason: 'Fornecedor e valor coincidem com uma compra sem NF; somente a nota sera completada.',
          amount: total,
        },
        valueMatches[0]?.id,
      );
      continue;
    }
    if (source.invoiceNumber && valueMatches.length > 1) {
      push({
        key,
        entity: 'PURCHASE',
        action: 'INVALID',
        rowNumbers: source.rowNumbers,
        label: source.number,
        reason: 'Mais de uma compra tem o mesmo fornecedor e valor; a NF exige revisao manual.',
        amount: total,
      });
      continue;
    }
    const installmentsTotal = roundMoney(
      source.installments.reduce((sum, installment) => sum + installment.amount, 0),
    );
    const installmentNote =
      source.installments.length && Math.abs(installmentsTotal - total) > 0.01
        ? ' As parcelas divergentes serao ignoradas sem bloquear a compra.'
        : '';
    push({
      key,
      entity: 'PURCHASE',
      action: 'CREATE',
      rowNumbers: source.rowNumbers,
      label: `${source.number} | ${source.supplierName}`,
      reason: `Nova compra validada para importacao.${installmentNote}`,
      amount: total,
    });
  }

  return { ...parsed, actions, operations };
}

function collectCostCenterNames(payload: ParsedSheetPayload): string[] {
  const values = [
    ...payload.suppliers.map((supplier) => supplier.costCenterName),
    ...payload.prices.map((price) => price.costCenterName),
    ...payload.purchases.flatMap((purchase) =>
      purchase.items.map((item) => item.costCenterName),
    ),
  ].filter((name): name is string => Boolean(name));
  return [...new Map(values.map((name) => [normalizeText(name), name])).values()];
}

function sourceRowsForCenter(payload: ParsedSheetPayload, name: string): number[] {
  const target = normalizeText(name);
  const rows = [
    ...payload.suppliers
      .filter((supplier) => normalizeText(supplier.costCenterName ?? '') === target)
      .map((supplier) => supplier.rowNumber),
    ...payload.prices
      .filter((price) => normalizeText(price.costCenterName ?? '') === target)
      .map((price) => price.rowNumber),
    ...payload.purchases.flatMap((purchase) =>
      purchase.items
        .filter((item) => normalizeText(item.costCenterName ?? '') === target)
        .map((item) => item.rowNumber),
    ),
  ];
  return [...new Set(rows)].slice(0, 500);
}

function findCenter(centers: CostCenter[], name: string): CostCenter | undefined {
  const target = normalizeText(name);
  return centers.find(
    (center) =>
      normalizeText(center.name) === target || normalizeText(center.code) === target,
  );
}

function findSupplier<T extends Pick<Supplier, 'id' | 'legalName' | 'tradeName' | 'document'>>(
  suppliers: T[],
  document: string | null,
  name: string,
): T | undefined {
  const normalizedName = normalizeText(name);
  return suppliers.find(
    (supplier) =>
      (document && supplier.document?.replace(/\D/g, '') === document.replace(/\D/g, '')) ||
      normalizeText(supplier.legalName) === normalizedName ||
      normalizeText(supplier.tradeName ?? '') === normalizedName,
  );
}

function supplierNeedsUpdate(existing: Supplier, source: ParsedSheetSupplier): boolean {
  const comparisons: Array<[string | null, string | null]> = [
    [existing.tradeName, source.tradeName],
    [existing.document?.replace(/\D/g, '') ?? null, source.document],
    [existing.category, source.category],
    [existing.operationNature, source.operationNature],
    [existing.paymentMethod, source.paymentMethod],
    [existing.defaultCostCenterName, source.costCenterName],
    [existing.email, source.email],
    [existing.phone, source.phone],
  ];
  return (
    existing.status !== (source.active ? 'ACTIVE' : 'INACTIVE') ||
    comparisons.some(
      ([current, incoming]) =>
        incoming !== null && normalizeText(current ?? '') !== normalizeText(incoming),
    )
  );
}

function supplierUpdate(
  source: ParsedSheetSupplier,
  defaultCostCenterId: string | null,
): UpdateSupplierInput {
  return {
    legalName: source.legalName,
    ...(source.tradeName !== null && { tradeName: source.tradeName }),
    ...(source.document !== null && { document: source.document }),
    ...(source.category !== null && { category: source.category }),
    ...(source.operationNature !== null && { operationNature: source.operationNature }),
    ...(source.paymentMethod !== null && { paymentMethod: source.paymentMethod }),
    ...(source.costCenterName !== null && { defaultCostCenterId }),
    ...(source.email !== null && { email: source.email }),
    ...(source.phone !== null && { phone: source.phone }),
    ...(source.notes !== null && { notes: source.notes }),
    status: source.active ? 'ACTIVE' : 'INACTIVE',
  };
}

function priceNeedsUpdate(existing: SupplierPrice, source: ParsedSheetPrice): boolean {
  return (
    Math.abs(existing.negotiatedPrice - source.negotiatedPrice) > 0.0001 ||
    Math.abs((existing.initialPrice ?? 0) - (source.initialPrice ?? 0)) > 0.0001 ||
    existing.validFrom !== source.validFrom ||
    existing.validUntil !== source.validUntil ||
    normalizeText(existing.unit ?? '') !== normalizeText(source.unit ?? '')
  );
}

function calculatePurchaseTotal(purchase: ParsedSheetPurchase): number {
  return roundMoney(
    purchase.items.reduce(
      (total, item) =>
        total + item.quantity * (item.negotiatedPrice ?? item.unitPrice),
      0,
    ),
  );
}

function duplicatePurchaseAction(
  key: string,
  source: ParsedSheetPurchase,
  total: number,
  reason: string,
): SheetSyncAction {
  return {
    key,
    entity: 'PURCHASE',
    action: 'SKIP_DUPLICATE',
    rowNumbers: source.rowNumbers,
    label: `${source.number} | ${source.supplierName}`,
    reason,
    amount: total,
  };
}

function buildTotals(actions: SheetSyncAction[], sourceRows: number) {
  return {
    sourceRows,
    ready: actions.filter((action) => action.action === 'CREATE').length,
    updates: actions.filter(
      (action) => action.action === 'UPDATE' || action.action === 'ATTACH_INVOICE',
    ).length,
    duplicates: actions.filter((action) => action.action === 'SKIP_DUPLICATE').length,
    ignored: actions.filter((action) => action.action === 'SKIP_OUT_OF_SCOPE').length,
    invalid: actions.filter((action) => action.action === 'INVALID').length,
  };
}

function enrichIntegration(
  integration: StoredGoogleSheetsIntegration,
  connector: {
    configured: boolean;
    mode: 'DEMO' | 'GOOGLE_SERVICE_ACCOUNT' | 'UNCONFIGURED';
    serviceAccountEmail: string | null;
  },
): GoogleSheetsIntegration {
  return {
    ...integration,
    connectorConfigured: connector.configured,
    connectorMode: connector.mode,
    serviceAccountEmail: connector.serviceAccountEmail,
  };
}

function uniqueCenterCode(name: string, centers: CostCenter[]): string {
  const base = costCenterCode(name);
  if (!centers.some((center) => center.code.toUpperCase() === base.toUpperCase())) {
    return base;
  }
  const suffix = createHash('sha256').update(name).digest('hex').slice(0, 6).toUpperCase();
  return `${base.slice(0, 33)}-${suffix}`.slice(0, 40);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1_000) : 'Falha inesperada na sincronizacao.';
}
