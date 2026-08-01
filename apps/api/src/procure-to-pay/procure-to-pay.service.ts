import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isValidCnpj,
  normalizeBrazilianDocument,
  normalizeNfeAccessKey,
  type ConfigureFiscalIntegrationMetadata,
  type AttachPixQrInput,
  type CreateGoodsReceiptInput,
  type CreatePaymentApprovalRuleInput,
  type FiscalIntegration,
  type FiscalDocumentFilters,
  type FiscalDocumentSummary,
  type FiscalSyncResult,
  type GoodsReceipt,
  type ManifestFiscalDocumentInput,
  type PayableKanbanCard,
  type PayableKanbanFilters,
  type PaymentApprovalMode,
  type PaymentApprovalTask,
  type PaymentApprovalRule,
  type PaymentInstructionInput,
  type PaymentSettings,
  type PaymentSettlementInput,
  type ReceiptFiscalItemOption,
  type ReceiptResponsibility,
  type ReceiptResponsibilityInput,
  type RecordPaymentApprovalDecisionInput,
  type RequestAdvancePaymentInput,
  type ReviewFiscalDocumentMatchInput,
  type SubmitPaymentApprovalInput,
  type UpdatePaymentApprovalRuleInput,
  type UpdatePaymentSettingsInput,
} from '@compras/contracts';
import { Prisma, type PrismaClient } from '@compras/database';
import { XMLParser } from 'fast-xml-parser';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { isPlatformOwner } from '../domain/identity.js';
import { parseInvoiceXml } from '../invoices/invoice-xml.parser.js';
import { ProcurementRepository } from '../procurement/procurement.repository.js';
import { inspectA1Certificate } from './a1-certificate.js';
import { CredentialCipher } from './credential-cipher.js';
import { exactItemMatches, hasPurchaseReference } from './fiscal-matching.js';
import { titleIsMatched } from './payment-reconciliation.js';
import { validatePaymentInstruction } from './pix-validation.js';
import { ProcureToPayStorage } from './procure-to-pay.storage.js';
import { SefazNfeClient } from './sefaz-nfe.client.js';

const titleInclude = {
  purchase: {
    include: {
      supplier: true,
      fiscalDocumentLinks: { include: { invoiceDocument: true } },
      items: {
        include: {
          receiptItems: { include: { receipt: true } },
        },
      },
    },
  },
  fiscalDocument: {
    include: {
      fiscalItems: {
        include: { receiptItems: { include: { receipt: true } } },
      },
    },
  },
  instructionSnapshots: { orderBy: { version: 'desc' }, take: 1 },
  settlements: { include: { createdBy: true }, orderBy: { createdAt: 'asc' } },
  approvalTitles: {
    include: { request: { include: { participants: true } } },
  },
} satisfies Prisma.InstallmentInclude;

type TitleRecord = Prisma.InstallmentGetPayload<{ include: typeof titleInclude }>;
type PaymentRuleRecord = Prisma.PaymentApprovalRuleGetPayload<{
  include: { approvers: { include: { user: true } } };
}>;
type ReceiptRecord = Prisma.GoodsReceiptGetPayload<{
  include: { confirmedBy: true; items: { include: { purchaseItem: true } } };
}>;
type ResponsibilityRecord = Prisma.ReceiptResponsibilityGetPayload<{
  include: { user: true; costCenter: true };
}>;
type FiscalDocumentSummaryRecord = Prisma.InvoiceDocumentGetPayload<{
  include: { purchaseLinks: { include: { purchase: true } } };
}>;
type DemoInstruction = PayableKanbanCard['instruction'];
type DemoAdvance = { evidencePath: string; reason: string };
type DemoSettlement = PayableKanbanCard['settlements'][number];
type DemoPaymentRule = PaymentApprovalRule & { organizationId: string };
type DemoReceipt = GoodsReceipt & { organizationId: string };
type DemoResponsibility = ReceiptResponsibility & { organizationId: string };
type DemoApprovalTask = PaymentApprovalTask & {
  organizationId: string;
  participantUserIds: string[];
};

type UploadedBinary = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const fiscalParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (tagName) => ['det', 'dup'].includes(stripNamespace(tagName)),
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
  trimValues: true,
});

@Injectable()
export class ProcureToPayService {
  private readonly demoMode: boolean;
  private readonly fiscalRolloutMode: 'SHADOW' | 'EXACT_MATCH' | 'AUTO_SCIENCE';
  private readonly demoFiscal = new Map<string, FiscalIntegration>();
  private readonly demoInstructions = new Map<string, DemoInstruction>();
  private readonly demoPaymentStages = new Map<string, PayableKanbanCard['stage']>();
  private readonly demoReceipts: DemoReceipt[] = [];
  private readonly demoResponsibilities: DemoResponsibility[] = [];
  private readonly demoRules: DemoPaymentRule[] = [];
  private readonly demoApprovalTasks = new Map<string, DemoApprovalTask>();
  private readonly demoAdvances = new Map<string, DemoAdvance>();
  private readonly demoSettlements = new Map<string, DemoSettlement[]>();
  private readonly demoSettings = new Map<string, PaymentSettings>();
  private readonly demoTitleIds = new Map<string, string>();

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProcurementRepository)
    private readonly procurement: ProcurementRepository,
    @Inject(ProcureToPayStorage) private readonly storage: ProcureToPayStorage,
    @Inject(CredentialCipher) private readonly cipher: CredentialCipher,
    @Inject(SefazNfeClient) private readonly sefaz: SefazNfeClient,
  ) {
    this.demoMode = isDemoMode(config);
    this.fiscalRolloutMode = config.get<
      'SHADOW' | 'EXACT_MATCH' | 'AUTO_SCIENCE'
    >('FISCAL_ROLLOUT_MODE', 'SHADOW');
  }

  async listPayables(
    organizationId: string,
    filters: PayableKanbanFilters,
  ): Promise<PayableKanbanCard[]> {
    if (this.demoMode) return this.listDemoPayables(organizationId, filters);
    const rows = await this.prisma.installment.findMany({
      where: {
        organizationId,
        purchase: { status: { not: 'CANCELLED' } },
        ...(filters.supplierId && {
          purchase: { status: { not: 'CANCELLED' }, supplierId: filters.supplierId },
        }),
        ...(filters.stage && { paymentStage: filters.stage }),
        ...(filters.dateFrom || filters.dateTo
          ? {
              dueDate: {
                ...(filters.dateFrom && { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }),
                ...(filters.dateTo && { lte: new Date(`${filters.dateTo}T00:00:00.000Z`) }),
              },
            }
          : {}),
      },
      include: titleInclude,
      orderBy: [{ dueDate: 'asc' }, { purchase: { number: 'asc' } }, { sequence: 'asc' }],
    });
    const search = normalize(filters.search ?? '');
    return rows
      .map(toPayableCard)
      .filter((card) =>
        search
          ? normalize(
              `${card.purchaseNumber} ${card.supplierName} ${card.invoiceNumbers.join(' ')}`,
            ).includes(search)
          : true,
      );
  }

  async getPaymentSettings(organizationId: string): Promise<PaymentSettings> {
    if (this.demoMode) {
      return this.demoSettings.get(organizationId) ?? emptyPaymentSettings();
    }
    const settings = await this.prisma.paymentSettings.findUnique({
      where: { organizationId },
    });
    return settings
      ? {
          approvalMode: settings.approvalMode,
          segregationEnabled: settings.segregationEnabled,
          notificationChannel: settings.notificationChannel,
          notificationRecipient: settings.notificationRecipient,
          updatedAt: settings.updatedAt.toISOString(),
        }
      : emptyPaymentSettings();
  }

  async updatePaymentSettings(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdatePaymentSettingsInput,
  ): Promise<PaymentSettings> {
    const { expectedUpdatedAt, ...settingsInput } = input;
    if (this.demoMode) {
      const current = this.demoSettings.get(organizationId);
      if (
        (current && (!expectedUpdatedAt || current.updatedAt !== expectedUpdatedAt)) ||
        (!current && expectedUpdatedAt)
      ) {
        throw new ConflictException('As configuracoes financeiras foram alteradas por outro usuario.');
      }
      const settings: PaymentSettings = {
        ...settingsInput,
        updatedAt: new Date().toISOString(),
      };
      this.demoSettings.set(organizationId, settings);
      if (settings.approvalMode === 'DISABLED') {
        for (const [requestId, task] of this.demoApprovalTasks) {
          if (task.organizationId !== organizationId) continue;
          task.titles.forEach((title) =>
            this.demoPaymentStages.set(title.installmentId, 'MATCHING_REQUIRED'),
          );
          this.demoApprovalTasks.delete(requestId);
        }
        const cards = await this.listDemoPayables(organizationId, {});
        cards
          .filter(canRequestApproval)
          .forEach((card) => this.demoPaymentStages.set(card.id, 'READY_TO_PAY'));
      }
      return settings;
    }
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.paymentSettings.findUnique({
        where: { organizationId },
      });
      if (current) {
        if (!expectedUpdatedAt || current.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new ConflictException(
            'As configuracoes financeiras foram alteradas por outro usuario.',
          );
        }
        const updated = await transaction.paymentSettings.updateMany({
          where: {
            organizationId,
            updatedAt: new Date(expectedUpdatedAt),
          },
          data: settingsInput,
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'As configuracoes financeiras foram alteradas por outro usuario.',
          );
        }
      } else {
        if (expectedUpdatedAt) {
          throw new ConflictException(
            'As configuracoes financeiras foram criadas por outro usuario.',
          );
        }
        await transaction.paymentSettings.create({
          data: { organizationId, ...settingsInput },
        });
      }
      if (settingsInput.approvalMode === 'DISABLED') {
        const candidates = await transaction.installment.findMany({
          where: {
            organizationId,
            paymentStage: { in: ['MATCHING_REQUIRED', 'AWAITING_APPROVAL'] },
            purchase: { status: { not: 'CANCELLED' } },
          },
          include: titleInclude,
        });
        const pendingRequestIds = [
          ...new Set(
            candidates.flatMap((title) =>
              title.approvalTitles
                .filter((approvalTitle) => approvalTitle.request.status === 'PENDING')
                .map((approvalTitle) => approvalTitle.request.id),
            ),
          ),
        ];
        if (pendingRequestIds.length) {
          await transaction.paymentApprovalRequest.updateMany({
            where: {
              organizationId,
              id: { in: pendingRequestIds },
              status: 'PENDING',
            },
            data: { status: 'CANCELLED', resolvedAt: new Date() },
          });
          await transaction.installment.updateMany({
            where: {
              organizationId,
              paymentStage: 'AWAITING_APPROVAL',
              approvalTitles: {
                some: { requestId: { in: pendingRequestIds } },
              },
            },
            data: { paymentStage: 'MATCHING_REQUIRED' },
          });
          await transaction.auditLog.createMany({
            data: pendingRequestIds.map((requestId) => ({
              actorUserId: actor.id,
              organizationId,
              action: 'UPDATE' as const,
              resource: 'payment_approval_request',
              resourceId: requestId,
              metadata: {
                reason: 'PAYMENT_APPROVAL_DISABLED',
                status: 'CANCELLED',
              },
            })),
          });
        }
        const eligibleIds = candidates
          .filter(
            (title) =>
              title.instructionSnapshots.length > 0 && titleIsMatched(title),
          )
          .map((title) => title.id);
        if (eligibleIds.length) {
          await transaction.installment.updateMany({
            where: { organizationId, id: { in: eligibleIds } },
            data: { paymentStage: 'READY_TO_PAY' },
          });
          await transaction.auditLog.createMany({
            data: eligibleIds.map((installmentId) => ({
              actorUserId: actor.id,
              organizationId,
              action: 'UPDATE' as const,
              resource: 'payment_approval_skipped',
              resourceId: installmentId,
              metadata: {
                mode: 'DISABLED',
                reason: 'PAYMENT_APPROVAL_DISABLED',
              },
            })),
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'payment_settings',
          resourceId: organizationId,
          metadata: settingsInput,
        },
      });
    });
    return this.getPaymentSettings(organizationId);
  }

  async listPaymentRules(organizationId: string): Promise<PaymentApprovalRule[]> {
    if (this.demoMode) {
      return this.demoRules
        .filter((rule) => rule.organizationId === organizationId)
        .map(({ organizationId: _organizationId, ...rule }) => rule);
    }
    const rules = await this.prisma.paymentApprovalRule.findMany({
      where: { organizationId },
      include: { approvers: { include: { user: true } } },
      orderBy: { minimumAmount: 'asc' },
    });
    return rules.map(toPaymentRule);
  }

  async createPaymentRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreatePaymentApprovalRuleInput,
  ): Promise<PaymentApprovalRule> {
    if (this.demoMode) {
      if (
        this.demoRules.some(
          (rule) =>
            rule.organizationId === organizationId &&
            rule.minimumAmount === input.minimumAmount,
        )
      ) {
        throw new ConflictException('Ja existe uma regra financeira com esse valor minimo.');
      }
      const now = new Date().toISOString();
      const rule: DemoPaymentRule = {
        id: randomUUID(),
        organizationId,
        ...input,
        approvers: input.approverUserIds.map((userId) => ({
          userId,
          name: userId === actor.id ? actor.name : 'Aprovador financeiro',
          email: userId === actor.id ? actor.email : `${userId}@demo.local`,
          phone: userId === actor.id ? actor.phone ?? null : null,
        })),
        createdAt: now,
        updatedAt: now,
      };
      this.demoRules.push(rule);
      return stripOrganization(rule);
    }
    const approvers = await this.requirePaymentApprovers(
      organizationId,
      input.approverUserIds,
      input.notificationChannel,
    );
    try {
      const rule = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.paymentApprovalRule.create({
          data: {
            organizationId,
            name: input.name,
            minimumAmount: input.minimumAmount,
            requiredApprovals: input.requiredApprovals,
            notificationChannel: input.notificationChannel,
            active: input.active,
            approvers: {
              create: approvers.map((approver) => ({
                organizationId,
                userId: approver.id,
              })),
            },
          },
          include: { approvers: { include: { user: true } } },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'payment_approval_rule',
            resourceId: created.id,
            metadata: { minimumAmount: input.minimumAmount, name: input.name },
          },
        });
        return created;
      });
      return toPaymentRule(rule);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Ja existe uma regra financeira com esse valor minimo.');
      }
      throw error;
    }
  }

  async updatePaymentRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdatePaymentApprovalRuleInput,
  ): Promise<PaymentApprovalRule> {
    if (this.demoMode) {
      const index = this.demoRules.findIndex(
        (rule) => rule.organizationId === organizationId && rule.id === id,
      );
      if (index < 0) throw new NotFoundException('Regra financeira nao encontrada.');
      const current = this.demoRules[index]!;
      if (current.updatedAt !== input.expectedUpdatedAt) {
        throw new ConflictException('A regra financeira foi alterada por outro usuario.');
      }
      const updated: DemoPaymentRule = {
        ...current,
        ...input,
        approvers: input.approverUserIds.map((userId) => ({
          userId,
          name: userId === actor.id ? actor.name : 'Aprovador financeiro',
          email: userId === actor.id ? actor.email : `${userId}@demo.local`,
          phone: userId === actor.id ? actor.phone ?? null : null,
        })),
        updatedAt: new Date().toISOString(),
      };
      this.demoRules[index] = updated;
      return stripOrganization(updated);
    }
    const current = await this.prisma.paymentApprovalRule.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Regra financeira nao encontrada.');
    const approvers = await this.requirePaymentApprovers(
      organizationId,
      input.approverUserIds,
      input.notificationChannel,
    );
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.paymentApprovalRule.updateMany({
        where: { id, organizationId, updatedAt: new Date(input.expectedUpdatedAt) },
        data: {
          active: input.active,
          minimumAmount: input.minimumAmount,
          name: input.name,
          notificationChannel: input.notificationChannel,
          requiredApprovals: input.requiredApprovals,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A regra financeira foi alterada por outro usuario.');
      }
      await transaction.paymentApprovalRuleApprover.deleteMany({
        where: { organizationId, ruleId: id },
      });
      await transaction.paymentApprovalRuleApprover.createMany({
        data: approvers.map((approver) => ({
          organizationId,
          ruleId: id,
          userId: approver.id,
        })),
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'payment_approval_rule',
          resourceId: id,
          metadata: { minimumAmount: input.minimumAmount, name: input.name },
        },
      });
    });
    const rule = await this.prisma.paymentApprovalRule.findFirstOrThrow({
      where: { id, organizationId },
      include: { approvers: { include: { user: true } } },
    });
    return toPaymentRule(rule);
  }

  async savePaymentInstruction(
    actor: AuthenticatedIdentity,
    organizationId: string,
    installmentId: string,
    input: PaymentInstructionInput,
  ): Promise<PayableKanbanCard> {
    if (this.demoMode) {
      const card = await this.requireDemoCard(organizationId, installmentId);
      if (card.updatedAt !== input.expectedUpdatedAt) {
        throw new ConflictException('O titulo foi alterado por outro usuario.');
      }
      const validation = validatePaymentInstruction(input, card.balance);
      const instruction: DemoInstruction = {
        id: randomUUID(),
        version: (card.instruction?.version ?? 0) + 1,
        paymentChannel: input.paymentChannel,
        paymentReference: input.paymentReference ?? null,
        pixKeyType: input.pixKeyType ?? null,
        pixKey: input.pixKey ?? null,
        beneficiaryName: input.beneficiaryName ?? null,
        beneficiaryDocument: input.beneficiaryDocument ?? null,
        pixCopyPaste: input.pixCopyPaste ?? null,
        hasPixQrImage: false,
        notes: input.notes ?? null,
        validationWarnings: validation.warnings,
        fingerprint: validation.fingerprint,
        createdAt: new Date().toISOString(),
      };
      this.demoInstructions.set(installmentId, instruction);
      const settings = await this.getPaymentSettings(organizationId);
      this.demoPaymentStages.set(
        installmentId,
        settings.approvalMode === 'DISABLED' && card.received && card.invoiceNumbers.length
          ? 'READY_TO_PAY'
          : 'MATCHING_REQUIRED',
      );
      return this.requireDemoCard(organizationId, installmentId);
    }
    const title = await this.requireTitle(organizationId, installmentId);
    if (title.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ConflictException('O titulo foi alterado por outro usuario.');
    }
    const card = toPayableCard(title);
    const validation = validatePaymentInstruction(input, card.balance, {
      document: title.purchase.supplier.pixBeneficiaryDocument,
      name: title.purchase.supplier.pixBeneficiaryName,
    });
    const settings = await this.getPaymentSettings(organizationId);
    const eligible = titleIsMatched(title);
    const approvalSkipped = settings.approvalMode === 'DISABLED' && eligible;
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.installment.updateMany({
        where: {
          id: installmentId,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: {
          paymentChannel: input.paymentChannel,
          paymentReference:
            input.paymentReference ?? input.pixCopyPaste ?? input.pixKey ?? null,
          paymentNotes: input.notes ?? null,
          paymentStage:
            approvalSkipped ? 'READY_TO_PAY' : 'MATCHING_REQUIRED',
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('O titulo foi alterado por outro usuario.');
      }
      const latest = await transaction.paymentInstructionSnapshot.aggregate({
        where: { organizationId, installmentId },
        _max: { version: true },
      });
      await transaction.paymentInstructionSnapshot.create({
        data: {
          organizationId,
          installmentId,
          version: (latest._max.version ?? 0) + 1,
          paymentChannel: input.paymentChannel,
          paymentReference: input.paymentReference ?? null,
          pixKeyType: input.pixKeyType ?? null,
          pixKey: input.pixKey ?? null,
          beneficiaryName: input.beneficiaryName ?? null,
          beneficiaryDocument: input.beneficiaryDocument ?? null,
          pixCopyPaste: input.pixCopyPaste ?? null,
          notes: input.notes ?? null,
          validationWarnings: validation.warnings,
          fingerprint: validation.fingerprint,
          createdById: actor.id,
        },
      });
      await invalidatePendingPaymentApprovals(
        transaction,
        organizationId,
        installmentId,
        actor.id,
      );
      if (approvalSkipped) {
        await transaction.installment.update({
          where: { id: installmentId },
          data: { paymentStage: 'READY_TO_PAY' },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'payment_approval_skipped',
            resourceId: installmentId,
            metadata: { mode: 'DISABLED', reason: 'PAYMENT_INSTRUCTION_UPDATED' },
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'payment_instruction',
          resourceId: installmentId,
          metadata: {
            fingerprint: validation.fingerprint,
            paymentChannel: input.paymentChannel,
            warnings: validation.warnings,
          },
        },
      });
    });
    return toPayableCard(await this.requireTitle(organizationId, installmentId));
  }

  async attachPixQrImage(
    actor: AuthenticatedIdentity,
    organizationId: string,
    installmentId: string,
    input: AttachPixQrInput,
    image: UploadedBinary,
  ): Promise<PayableKanbanCard> {
    validateQrImage(image);
    const settings = await this.getPaymentSettings(organizationId);
    if (this.demoMode) {
      const card = await this.requireDemoCard(organizationId, installmentId);
      if (card.updatedAt !== input.expectedUpdatedAt || !card.instruction) {
        throw new ConflictException('O titulo ou a instrucao foi alterado.');
      }
      if (card.instruction.paymentChannel !== 'PIX') {
        throw new BadRequestException('O QR so pode ser anexado a uma instrucao Pix.');
      }
      const sha256 = createHash('sha256').update(image.buffer).digest('hex');
      this.demoInstructions.set(installmentId, {
        ...card.instruction,
        id: randomUUID(),
        version: card.instruction.version + 1,
        hasPixQrImage: true,
        fingerprint: createHash('sha256')
          .update(`${card.instruction.fingerprint}|${sha256}`)
          .digest('hex'),
        createdAt: new Date().toISOString(),
      });
      this.demoPaymentStages.set(
        installmentId,
        settings.approvalMode === 'DISABLED' && card.received && card.invoiceNumbers.length > 0
          ? 'READY_TO_PAY'
          : 'MATCHING_REQUIRED',
      );
      return this.requireDemoCard(organizationId, installmentId);
    }
    const title = await this.requireTitle(organizationId, installmentId);
    const current = title.instructionSnapshots[0];
    if (!current || title.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ConflictException('O titulo ou a instrucao foi alterado.');
    }
    if (current.paymentChannel !== 'PIX') {
      throw new BadRequestException('O QR so pode ser anexado a uma instrucao Pix.');
    }
    const sha256 = createHash('sha256').update(image.buffer).digest('hex');
    const storagePath = await this.storage.save(
      organizationId,
      'payment-instruction',
      image.originalname,
      image.mimetype,
      image.buffer,
    );
    const fingerprint = createHash('sha256')
      .update(`${current.fingerprint}|${sha256}`)
      .digest('hex');
    const nextStage =
      settings.approvalMode === 'DISABLED' && titleIsMatched(title)
        ? 'READY_TO_PAY'
        : 'MATCHING_REQUIRED';
    try {
      await this.prisma.$transaction(async (transaction) => {
        const changed = await transaction.installment.updateMany({
          where: {
            id: installmentId,
            organizationId,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: { paymentStage: nextStage },
        });
        if (changed.count !== 1) throw new ConflictException('O titulo foi alterado.');
        await transaction.paymentInstructionSnapshot.create({
          data: {
            organizationId,
            installmentId,
            version: current.version + 1,
            paymentChannel: current.paymentChannel,
            paymentReference: current.paymentReference,
            pixKeyType: current.pixKeyType,
            pixKey: current.pixKey,
            beneficiaryName: current.beneficiaryName,
            beneficiaryDocument: current.beneficiaryDocument,
            pixCopyPaste: current.pixCopyPaste,
            pixQrStoragePath: storagePath,
            pixQrFileName: image.originalname,
            pixQrSha256: sha256,
            notes: current.notes,
            validationWarnings: current.validationWarnings ?? [],
            fingerprint,
            createdById: actor.id,
          },
        });
        await invalidatePendingPaymentApprovals(
          transaction,
          organizationId,
          installmentId,
          actor.id,
        );
        if (nextStage === 'READY_TO_PAY') {
          await transaction.installment.update({
            where: { id: installmentId },
            data: { paymentStage: 'READY_TO_PAY' },
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              organizationId,
              action: 'UPDATE',
              resource: 'payment_approval_skipped',
              resourceId: installmentId,
              metadata: { mode: 'DISABLED', reason: 'PIX_QR_UPDATED' },
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'payment_instruction_qr',
            resourceId: installmentId,
            metadata: { fingerprint, fileSha256: sha256 },
          },
        });
      });
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      throw error;
    }
    return toPayableCard(await this.requireTitle(organizationId, installmentId));
  }

  async requestAdvancePayment(
    actor: AuthenticatedIdentity,
    organizationId: string,
    installmentId: string,
    input: RequestAdvancePaymentInput,
    evidence: UploadedBinary,
  ): Promise<PayableKanbanCard> {
    validateAdvanceEvidence(evidence);
    if (this.demoMode) {
      const card = await this.requireDemoCard(organizationId, installmentId);
      if (card.updatedAt !== input.expectedUpdatedAt || card.balance <= 0.001) {
        throw new ConflictException('O titulo foi alterado ou ja esta liquidado.');
      }
      const evidencePath = await this.storage.save(
        organizationId,
        'payment-advance',
        evidence.originalname,
        evidence.mimetype,
        evidence.buffer,
      );
      const previous = this.demoAdvances.get(installmentId);
      this.demoAdvances.set(installmentId, { evidencePath, reason: input.reason });
      this.demoPaymentStages.set(installmentId, 'MATCHING_REQUIRED');
      if (previous) await this.storage.remove(previous.evidencePath).catch(() => undefined);
      return this.requireDemoCard(organizationId, installmentId);
    }

    const title = await this.requireTitle(organizationId, installmentId);
    if (
      title.updatedAt.toISOString() !== input.expectedUpdatedAt ||
      toPayableCard(title).balance <= 0.001
    ) {
      throw new ConflictException('O titulo foi alterado ou ja esta liquidado.');
    }
    const evidencePath = await this.storage.save(
      organizationId,
      'payment-advance',
      evidence.originalname,
      evidence.mimetype,
      evidence.buffer,
    );
    try {
      await this.prisma.$transaction(async (transaction) => {
        const changed = await transaction.installment.updateMany({
          where: {
            id: installmentId,
            organizationId,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: {
            advancePayment: true,
            advanceReason: input.reason,
            advanceEvidencePath: evidencePath,
            paymentStage: 'MATCHING_REQUIRED',
          },
        });
        if (changed.count !== 1) throw new ConflictException('O titulo foi alterado.');
        await invalidatePendingPaymentApprovals(
          transaction,
          organizationId,
          installmentId,
          actor.id,
        );
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'advance_payment_request',
            resourceId: installmentId,
            metadata: {
              evidenceSha256: createHash('sha256').update(evidence.buffer).digest('hex'),
              reason: input.reason,
            },
          },
        });
      });
    } catch (error) {
      await this.storage.remove(evidencePath).catch(() => undefined);
      throw error;
    }
    if (title.advanceEvidencePath) {
      await this.storage.remove(title.advanceEvidencePath).catch(() => undefined);
    }
    return toPayableCard(await this.requireTitle(organizationId, installmentId));
  }

  async advanceEvidenceFileUrl(
    organizationId: string,
    installmentId: string,
  ): Promise<{ expiresAt: string; url: string }> {
    if (this.demoMode) await this.requireDemoCard(organizationId, installmentId);
    const path = this.demoMode
      ? this.demoAdvances.get(installmentId)?.evidencePath
      : (await this.requireTitle(organizationId, installmentId)).advanceEvidencePath;
    if (!path) throw new NotFoundException('Documento do adiantamento nao encontrado.');
    return {
      url: await this.storage.createSignedUrl(path, 300),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async submitPaymentApproval(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: SubmitPaymentApprovalInput,
  ): Promise<PayableKanbanCard[]> {
    const requestedIds = [...new Set(input.installmentIds)];
    const settings = await this.getPaymentSettings(organizationId);
    if (this.demoMode) {
      const selected = await Promise.all(
        requestedIds.map((id) => this.requireDemoCard(organizationId, id)),
      );
      const purchaseId = requireSinglePurchase(selected);
      if (selected[0]!.purchaseUpdatedAt !== input.expectedUpdatedAt) {
        throw new ConflictException('O pedido foi alterado por outro usuario.');
      }
      const extraordinaryAdvance = selected.some((card) => card.advancePayment);
      assertAdvanceSelection(selected);
      const effectiveMode = extraordinaryAdvance ? 'PER_TITLE' : settings.approvalMode;
      validateTitlesForApproval(
        selected,
        effectiveMode === 'PER_TITLE' ? 'PER_TITLE' : 'PER_PURCHASE_SNAPSHOT',
      );
      const eligible =
        effectiveMode === 'PER_PURCHASE_SNAPSHOT'
          ? (await this.listDemoPayables(organizationId, {})).filter(
              (card) =>
                card.purchaseId === purchaseId &&
                !card.advancePayment &&
                canRequestApproval(card),
            )
          : selected;
      validateTitlesForApproval(eligible, effectiveMode);
      if (effectiveMode === 'DISABLED') {
        eligible.forEach((card) => this.demoPaymentStages.set(card.id, 'READY_TO_PAY'));
        return Promise.all(eligible.map((card) => this.requireDemoCard(organizationId, card.id)));
      }
      const total = roundMoney(eligible.reduce((sum, card) => sum + card.balance, 0));
      const rule = this.demoRules
        .filter(
          (candidate) =>
            candidate.organizationId === organizationId &&
            candidate.active &&
            candidate.minimumAmount <= total,
        )
        .sort((left, right) => right.minimumAmount - left.minimumAmount)[0];
      if (!rule) {
        throw new BadRequestException(
          'Nenhuma regra financeira ativa atende ao valor destes titulos.',
        );
      }
      const requiredApprovals = extraordinaryAdvance ? 2 : rule.requiredApprovals;
      if (rule.approvers.length < requiredApprovals) {
        throw new BadRequestException(
          'Adiantamentos exigem uma regra com pelo menos dois aprovadores distintos.',
        );
      }
      const requestId = randomUUID();
      const task: DemoApprovalTask = {
        organizationId,
        participantUserIds: rule.approvers.map((approver) => approver.userId),
        requestId,
        purchaseId,
        purchaseNumber: eligible[0]!.purchaseNumber,
        supplierName: eligible[0]!.supplierName,
        mode: effectiveMode,
        ruleName: extraordinaryAdvance ? `${rule.name} | Adiantamento extraordinario` : rule.name,
        amount: total,
        requiredApprovals,
        approvedCount: 0,
        submittedByName: actor.name,
        submittedAt: new Date().toISOString(),
        titles: eligible.map((card) => ({
          installmentId: card.id,
          sequence: card.sequence,
          dueDate: card.dueDate,
          amount: card.balance,
          instructionFingerprint: card.instruction!.fingerprint,
        })),
      };
      this.demoApprovalTasks.set(requestId, task);
      eligible.forEach((card) => this.demoPaymentStages.set(card.id, 'AWAITING_APPROVAL'));
      return Promise.all(eligible.map((card) => this.requireDemoCard(organizationId, card.id)));
    }

    const initiallySelected = await this.prisma.installment.findMany({
      where: { organizationId, id: { in: requestedIds } },
      include: titleInclude,
    });
    if (initiallySelected.length !== requestedIds.length) {
      throw new NotFoundException('Um ou mais titulos nao foram encontrados.');
    }
    const purchaseId = requireSinglePurchase(initiallySelected);
    const purchase = initiallySelected[0]!.purchase;
    if (purchase.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ConflictException('O pedido foi alterado por outro usuario.');
    }
    const initiallySelectedCards = initiallySelected.map(toPayableCard);
    const extraordinaryAdvance = initiallySelectedCards.some((card) => card.advancePayment);
    assertAdvanceSelection(initiallySelectedCards);
    const effectiveMode = extraordinaryAdvance ? 'PER_TITLE' : settings.approvalMode;
    validateTitlesForApproval(
      initiallySelectedCards,
      effectiveMode === 'PER_TITLE' ? 'PER_TITLE' : 'PER_PURCHASE_SNAPSHOT',
    );
    const candidateTitles =
      effectiveMode === 'PER_PURCHASE_SNAPSHOT'
        ? await this.prisma.installment.findMany({
            where: {
              organizationId,
              purchaseId,
              paymentStage: 'MATCHING_REQUIRED',
              advancePayment: false,
            },
            include: titleInclude,
          })
        : initiallySelected;
    const titles =
      effectiveMode === 'PER_PURCHASE_SNAPSHOT'
        ? candidateTitles.filter((title) => canRequestApproval(toPayableCard(title)))
        : candidateTitles;
    const cards = titles.map(toPayableCard);
    validateTitlesForApproval(cards, effectiveMode);

    if (effectiveMode === 'DISABLED') {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.installment.updateMany({
          where: { organizationId, id: { in: titles.map((title) => title.id) } },
          data: { paymentStage: 'READY_TO_PAY' },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'payment_approval_skipped',
            resourceId: purchaseId,
            metadata: { installmentIds: titles.map((title) => title.id), mode: 'DISABLED' },
          },
        });
      });
      return Promise.all(
        titles.map(async (title) => toPayableCard(await this.requireTitle(organizationId, title.id))),
      );
    }

    const total = roundMoney(cards.reduce((sum, card) => sum + card.balance, 0));
    const rule = await this.prisma.paymentApprovalRule.findFirst({
      where: { organizationId, active: true, minimumAmount: { lte: total } },
      include: { approvers: { include: { user: true } } },
      orderBy: { minimumAmount: 'desc' },
    });
    if (!rule) {
      throw new BadRequestException(
        'Nenhuma regra financeira ativa atende ao valor destes titulos.',
      );
    }
    const requiredApprovals = extraordinaryAdvance ? 2 : rule.requiredApprovals;
    if (rule.approvers.length < requiredApprovals) {
      throw new BadRequestException(
        'Adiantamentos exigem uma regra com pelo menos dois aprovadores distintos.',
      );
    }
    const approvers = await this.requirePaymentApprovers(
      organizationId,
      rule.approvers.map((approver) => approver.userId),
      rule.notificationChannel,
    );
    await this.prisma.$transaction(
      async (transaction) => {
        const currentPurchase = await transaction.purchase.findFirst({
          where: { id: purchaseId, organizationId },
          select: { updatedAt: true },
        });
        if (!currentPurchase || currentPurchase.updatedAt.toISOString() !== input.expectedUpdatedAt) {
          throw new ConflictException('O pedido foi alterado por outro usuario.');
        }
        const currentTitles = await transaction.installment.findMany({
          where: { organizationId, id: { in: titles.map((title) => title.id) } },
          include: titleInclude,
        });
        const expectedTitles = new Map(titles.map((title) => [title.id, title]));
        if (
          currentTitles.length !== titles.length ||
          currentTitles.some((title) => {
            const expected = expectedTitles.get(title.id);
            const card = toPayableCard(title);
            return (
              !expected ||
              title.updatedAt.getTime() !== expected.updatedAt.getTime() ||
              !canRequestApproval(card)
            );
          })
        ) {
          throw new ConflictException(
            'Um dos titulos mudou durante a preparacao da aprovacao.',
          );
        }
        const request = await transaction.paymentApprovalRequest.create({
          data: {
            organizationId,
            purchaseId,
            ruleId: rule.id,
            submittedById: actor.id,
            mode: effectiveMode,
            ruleNameSnapshot: extraordinaryAdvance
              ? `${rule.name} | Adiantamento extraordinario`
              : rule.name,
            amountSnapshot: total,
            requiredApprovals,
            participants: {
              create: approvers.map((approver) => ({
                organizationId,
                userId: approver.id,
                nameSnapshot: approver.name,
                recipientSnapshot: approver.recipient,
                channel: rule.notificationChannel,
              })),
            },
            titles: {
              create: cards.map((card) => ({
                organizationId,
                installmentId: card.id,
                amountSnapshot: card.balance,
                instructionFingerprint: card.instruction!.fingerprint,
              })),
            },
          },
        });
        const updated = await transaction.installment.updateMany({
          where: {
            organizationId,
            id: { in: titles.map((title) => title.id) },
            paymentStage: 'MATCHING_REQUIRED',
          },
          data: { paymentStage: 'AWAITING_APPROVAL' },
        });
        if (updated.count !== titles.length) {
          throw new ConflictException('Um dos titulos mudou durante a solicitacao.');
        }
        await transaction.notificationOutbox.createMany({
          data: approvers.map((approver) => ({
            organizationId,
            deduplicationKey: `${request.id}:payment-approval:${approver.id}`,
            eventType: 'PAYMENT_APPROVAL_REQUESTED',
            channel: rule.notificationChannel,
            recipient: approver.recipient,
            subject: extraordinaryAdvance
              ? `Adiantamento da compra ${purchase.number} aguardando aprovacao extraordinaria`
              : `Titulos da compra ${purchase.number} aguardando aprovacao`,
            payload: {
              approvalRequestId: request.id,
              purchaseId,
              purchaseNumber: purchase.number,
              supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
              titleCount: titles.length,
              total,
            },
          })),
          skipDuplicates: true,
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'payment_approval_request',
            resourceId: request.id,
            metadata: {
              installmentIds: titles.map((title) => title.id),
              mode: effectiveMode,
              extraordinaryAdvance,
              total,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return Promise.all(
      titles.map(async (title) => toPayableCard(await this.requireTitle(organizationId, title.id))),
    );
  }

  async listPaymentApprovalTasks(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<PaymentApprovalTask[]> {
    if (this.demoMode) {
      return [...this.demoApprovalTasks.values()]
        .filter(
          (task) =>
            task.organizationId === organizationId &&
            task.participantUserIds.includes(actor.id),
        )
        .map(stripDemoApprovalTask);
    }
    const rows = await this.prisma.paymentApprovalParticipant.findMany({
      where: {
        organizationId,
        userId: actor.id,
        decision: 'PENDING',
        request: { status: 'PENDING' },
      },
      include: {
        request: {
          include: {
            participants: true,
            purchase: { include: { supplier: true } },
            submittedBy: true,
            titles: { include: { installment: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ request }) => ({
      requestId: request.id,
      purchaseId: request.purchaseId,
      purchaseNumber: request.purchase.number,
      supplierName: request.purchase.supplier.tradeName ?? request.purchase.supplier.legalName,
      mode: request.mode,
      ruleName: request.ruleNameSnapshot,
      amount: Number(request.amountSnapshot),
      requiredApprovals: request.requiredApprovals,
      approvedCount: request.participants.filter((participant) => participant.decision === 'APPROVED').length,
      submittedByName: request.submittedBy.name,
      submittedAt: request.submittedAt.toISOString(),
      titles: request.titles.map((title) => ({
        installmentId: title.installmentId,
        sequence: title.installment.sequence,
        dueDate: toDateOnly(title.installment.dueDate),
        amount: Number(title.amountSnapshot),
        instructionFingerprint: title.instructionFingerprint,
      })),
    }));
  }

  async recordPaymentApprovalDecision(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: RecordPaymentApprovalDecisionInput,
  ): Promise<void> {
    if (this.demoMode) {
      const task = this.demoApprovalTasks.get(input.requestId);
      if (!task || task.organizationId !== organizationId || !task.participantUserIds.includes(actor.id)) {
        throw new NotFoundException('Aprovacao financeira pendente nao encontrada.');
      }
      if (input.decision === 'REJECTED') {
        task.titles.forEach((title) => this.demoPaymentStages.set(title.installmentId, 'MATCHING_REQUIRED'));
        this.demoApprovalTasks.delete(task.requestId);
        return;
      }
      task.participantUserIds = task.participantUserIds.filter((id) => id !== actor.id);
      task.approvedCount += 1;
      if (task.approvedCount >= task.requiredApprovals) {
        task.titles.forEach((title) => this.demoPaymentStages.set(title.installmentId, 'READY_TO_PAY'));
        this.demoApprovalTasks.delete(task.requestId);
      }
      return;
    }

    await this.prisma.$transaction(
      async (transaction) => {
        const participant = await transaction.paymentApprovalParticipant.findFirst({
          where: {
            organizationId,
            requestId: input.requestId,
            userId: actor.id,
            decision: 'PENDING',
            request: { status: 'PENDING' },
          },
          include: {
            request: {
              include: {
                participants: true,
                titles: { include: { installment: { include: titleInclude } } },
                purchase: { include: { supplier: true, approvalRequests: { include: { participants: true } } } },
                submittedBy: true,
              },
            },
          },
        });
        if (!participant) {
          throw new NotFoundException('Aprovacao financeira pendente nao encontrada.');
        }
        const settings = await transaction.paymentSettings.findUnique({ where: { organizationId } });
        if (settings?.segregationEnabled && participatedInPurchaseApproval(actor.id, participant.request)) {
          throw new ForbiddenException(
            'A segregacao de funcoes impede este usuario de aprovar o pagamento.',
          );
        }
        const changed = await transaction.paymentApprovalParticipant.updateMany({
          where: { id: participant.id, organizationId, decision: 'PENDING' },
          data: { decision: input.decision, comment: input.comment, decidedAt: new Date() },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Esta aprovacao ja foi decidida.');
        }
        const request = participant.request;
        const installmentIds = request.titles.map((title) => title.installmentId);
        if (input.decision === 'REJECTED') {
          await transaction.paymentApprovalRequest.update({
            where: { id: request.id },
            data: { status: 'REJECTED', resolvedAt: new Date() },
          });
          await transaction.installment.updateMany({
            where: { organizationId, id: { in: installmentIds } },
            data: { paymentStage: 'MATCHING_REQUIRED' },
          });
          await createPaymentResolutionNotification(transaction, {
            channel: participant.channel,
            eventType: 'PAYMENT_APPROVAL_REJECTED',
            organizationId,
            recipient: recipientForChannel(request.submittedBy, participant.channel),
            requestId: request.id,
            subject: `Pagamento da compra ${request.purchase.number} reprovado`,
            payload: {
              comment: input.comment,
              purchaseId: request.purchaseId,
              purchaseNumber: request.purchase.number,
              supplierName:
                request.purchase.supplier.tradeName ??
                request.purchase.supplier.legalName,
              total: moneySum(
                request.titles.map((title) => title.amountSnapshot),
              ),
            },
          });
        } else {
          const approvedCount = request.participants.filter(
            (candidate) => candidate.decision === 'APPROVED',
          ).length + 1;
          if (approvedCount >= request.requiredApprovals) {
            const invalidSnapshot = request.titles.some((title) => {
              const currentInstruction = title.installment.instructionSnapshots[0];
              const reconciliationValid = title.installment.advancePayment
                ? Boolean(
                    title.installment.advanceEvidencePath &&
                      title.installment.advanceReason,
                  )
                : titleIsMatched(title.installment);
              return (
                !currentInstruction ||
                currentInstruction.fingerprint !== title.instructionFingerprint ||
                !reconciliationValid
              );
            });
            if (invalidSnapshot) {
              throw new ConflictException(
                'A instrucao de pagamento ou a conciliacao mudou durante a aprovacao.',
              );
            }
            await transaction.paymentApprovalRequest.update({
              where: { id: request.id },
              data: { status: 'APPROVED', resolvedAt: new Date() },
            });
            await transaction.installment.updateMany({
              where: { organizationId, id: { in: installmentIds }, paymentStage: 'AWAITING_APPROVAL' },
              data: { paymentStage: 'READY_TO_PAY' },
            });
            if (settings?.notificationChannel && settings.notificationRecipient) {
              await createPaymentResolutionNotification(transaction, {
                channel: settings.notificationChannel,
                eventType: 'PAYMENT_RELEASED',
                organizationId,
                recipient: settings.notificationRecipient,
                requestId: request.id,
                subject: `Pagamento da compra ${request.purchase.number} liberado`,
                payload: {
                  purchaseId: request.purchaseId,
                  purchaseNumber: request.purchase.number,
                  supplierName:
                    request.purchase.supplier.tradeName ??
                    request.purchase.supplier.legalName,
                  titleCount: installmentIds.length,
                  total: moneySum(
                    request.titles.map((title) => title.amountSnapshot),
                  ),
                },
              });
            }
          }
        }
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'payment_approval_decision',
            resourceId: participant.id,
            metadata: { comment: input.comment, decision: input.decision, requestId: request.id },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async settlePayment(
    actor: AuthenticatedIdentity,
    organizationId: string,
    installmentId: string,
    input: PaymentSettlementInput,
    proof: UploadedBinary,
  ): Promise<PayableKanbanCard> {
    validatePaymentProof(proof);
    if (this.demoMode) {
      const card = await this.requireDemoCard(organizationId, installmentId);
      if (card.updatedAt !== input.expectedUpdatedAt) {
        throw new ConflictException('O titulo foi alterado por outro usuario.');
      }
      if (!['READY_TO_PAY', 'PARTIALLY_PAID'].includes(card.stage)) {
        throw new BadRequestException('O titulo ainda nao esta liberado para pagamento.');
      }
      if (input.amount > card.balance + 0.001) {
        throw new BadRequestException('O valor da baixa excede o saldo do titulo.');
      }
      const settlements = this.demoSettlements.get(installmentId) ?? [];
      if (settlements.some((settlement) => settlement.transactionId === input.transactionId)) {
        throw new ConflictException('Esse identificador bancario ja foi registrado.');
      }
      const settlement: DemoSettlement = {
        id: randomUUID(),
        amount: input.amount,
        paidAt: input.paidAt,
        transactionId: input.transactionId,
        proofFileName: proof.originalname,
        createdByName: actor.name,
        createdAt: new Date().toISOString(),
      };
      settlements.push(settlement);
      this.demoSettlements.set(installmentId, settlements);
      const fullyPaid = roundMoney(card.paidAmount + input.amount) >= card.amount;
      this.demoPaymentStages.set(
        installmentId,
        fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
      );
      if (fullyPaid) {
        const purchase = await this.procurement.getPurchase(organizationId, card.purchaseId);
        const purchaseTitles = (await this.listDemoPayables(organizationId, {})).filter(
          (candidate) => candidate.purchaseId === card.purchaseId,
        );
        if (
          purchase.workflowStage === 'RECEIVED' &&
          purchaseTitles.length > 0 &&
          purchaseTitles.every((candidate) => candidate.stage === 'PAID')
        ) {
          await this.procurement.changePurchaseWorkflowStage(
            actor,
            organizationId,
            card.purchaseId,
            {
              expectedUpdatedAt: purchase.updatedAt,
              stage: 'COMPLETED',
              reason: 'Pedido integralmente recebido e sem saldo financeiro.',
            },
          );
        }
      }
      return this.requireDemoCard(organizationId, installmentId);
    }

    const title = await this.requireTitle(organizationId, installmentId);
    if (title.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ConflictException('O titulo foi alterado por outro usuario.');
    }
    if (!['READY_TO_PAY', 'PARTIALLY_PAID'].includes(title.paymentStage)) {
      throw new BadRequestException('O titulo ainda nao esta liberado para pagamento.');
    }
    const settings = await this.getPaymentSettings(organizationId);
    if (settings.segregationEnabled) {
      const approvedByActor = title.approvalTitles.some((approvalTitle) =>
        approvalTitle.request.participants.some(
          (participant) => participant.userId === actor.id && participant.decision === 'APPROVED',
        ),
      );
      if (approvedByActor) {
        throw new ForbiddenException(
          'A segregacao de funcoes impede o aprovador financeiro de registrar a propria baixa.',
        );
      }
    }
    const current = toPayableCard(title);
    if (input.amount > current.balance + 0.001) {
      throw new BadRequestException('O valor da baixa excede o saldo do titulo.');
    }
    const sha256 = createHash('sha256').update(proof.buffer).digest('hex');
    const storagePath = await this.storage.save(
      organizationId,
      'payment-proof',
      proof.originalname,
      proof.mimetype,
      proof.buffer,
    );
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const fresh = await transaction.installment.findFirst({
            where: { id: installmentId, organizationId },
            include: { settlements: true },
          });
          if (!fresh || fresh.updatedAt.toISOString() !== input.expectedUpdatedAt) {
            throw new ConflictException('O titulo foi alterado por outro usuario.');
          }
          const paidBefore = moneySum(fresh.settlements.map((settlement) => settlement.amount));
          if (roundMoney(paidBefore + input.amount) > Number(fresh.amount) + 0.001) {
            throw new BadRequestException('O valor da baixa excede o saldo do titulo.');
          }
          const settlement = await transaction.paymentSettlement.create({
            data: {
              organizationId,
              installmentId,
              amount: input.amount,
              paidAt: new Date(`${input.paidAt}T00:00:00.000Z`),
              transactionId: input.transactionId,
              proofFileName: proof.originalname,
              proofMimeType: proof.mimetype,
              proofSize: proof.size,
              proofSha256: sha256,
              proofStoragePath: storagePath,
              createdById: actor.id,
            },
          });
          const paidTotal = roundMoney(paidBefore + input.amount);
          const paid = paidTotal >= Number(fresh.amount) - 0.001;
          await transaction.installment.update({
            where: { id: installmentId },
            data: {
              paymentStage: paid ? 'PAID' : 'PARTIALLY_PAID',
              paidAt: paid ? new Date(`${input.paidAt}T00:00:00.000Z`) : null,
            },
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              organizationId,
              action: 'CREATE',
              resource: 'payment_settlement',
              resourceId: settlement.id,
              metadata: {
                amount: input.amount,
                installmentId,
                proofSha256: sha256,
                transactionId: input.transactionId,
              },
            },
          });
          if (settings.notificationChannel && settings.notificationRecipient) {
            await createPaymentResolutionNotification(transaction, {
              channel: settings.notificationChannel,
              eventType: paid ? 'PAYMENT_SETTLED' : 'PAYMENT_PARTIALLY_SETTLED',
              organizationId,
              recipient: settings.notificationRecipient,
              requestId: settlement.id,
              subject: paid
                ? `Pagamento da compra ${title.purchase.number} liquidado`
                : `Baixa parcial registrada na compra ${title.purchase.number}`,
              payload: {
                amount: input.amount,
                installmentId,
                paidTotal,
                purchaseId: fresh.purchaseId,
                purchaseNumber: title.purchase.number,
                remainingBalance: Math.max(0, roundMoney(Number(fresh.amount) - paidTotal)),
                supplierName:
                  title.purchase.supplier.tradeName ??
                  title.purchase.supplier.legalName,
                total: Number(fresh.amount),
              },
            });
          }
          await completePurchaseIfEligible(transaction, organizationId, fresh.purchaseId, actor.id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'O identificador bancario ou o comprovante ja foi registrado.',
        );
      }
      throw error;
    }
    return toPayableCard(await this.requireTitle(organizationId, installmentId));
  }

  async listGoodsReceipts(
    organizationId: string,
    purchaseId: string,
  ): Promise<GoodsReceipt[]> {
    if (this.demoMode) {
      return this.demoReceipts
        .filter(
          (receipt) =>
            receipt.organizationId === organizationId && receipt.purchaseId === purchaseId,
        )
        .map(stripOrganization);
    }
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: { organizationId, purchaseId },
      include: {
        confirmedBy: true,
        items: { include: { purchaseItem: true } },
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return receipts.map(toGoodsReceipt);
  }

  async listReceiptFiscalItems(
    organizationId: string,
    purchaseId: string,
  ): Promise<ReceiptFiscalItemOption[]> {
    if (this.demoMode) return [];
    const items = await this.prisma.fiscalDocumentItem.findMany({
      where: {
        organizationId,
        matchedPurchaseItemId: { not: null },
        invoiceDocument: {
          purchaseLinks: {
            some: {
              organizationId,
              purchaseId,
              matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] },
            },
          },
        },
      },
      include: {
        invoiceDocument: true,
        receiptItems: { where: { receipt: { status: 'CONFIRMED' } } },
      },
      orderBy: [
        { invoiceDocument: { fiscalIssuedAt: 'asc' } },
        { invoiceDocumentId: 'asc' },
        { sequence: 'asc' },
      ],
    });
    return items.map((item) => {
      const quantity = Number(item.quantity);
      const receivedQuantity = quantitySum(
        item.receiptItems.map((receiptItem) => receiptItem.quantity),
      );
      return {
        id: item.id,
        invoiceDocumentId: item.invoiceDocumentId,
        invoiceNumber: item.invoiceDocument.invoiceNumber,
        purchaseItemId: item.matchedPurchaseItemId!,
        description: item.description,
        quantity,
        receivedQuantity,
        remainingQuantity: Math.max(0, roundQuantity(quantity - receivedQuantity)),
      };
    });
  }

  async createGoodsReceipt(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: CreateGoodsReceiptInput,
  ): Promise<GoodsReceipt> {
    if (this.demoMode) {
      const purchase = await this.procurement.getPurchase(organizationId, purchaseId);
      if (purchase.updatedAt !== input.expectedPurchaseUpdatedAt) {
        throw new ConflictException('O pedido foi alterado por outro usuario.');
      }
      if (!['SUPPLIER_INVOICED', 'RECEIVED'].includes(purchase.workflowStage)) {
        throw new BadRequestException('Vincule a NF-e antes de confirmar o recebimento.');
      }
      const previous = this.demoReceipts.filter(
        (receipt) => receipt.organizationId === organizationId && receipt.purchaseId === purchaseId,
      );
      validateReceiptQuantities(
        purchase.items,
        previous.flatMap((receipt) => receipt.items),
        input.items,
      );
      const now = new Date().toISOString();
      const receipt: DemoReceipt = {
        id: randomUUID(),
        organizationId,
        purchaseId,
        status: 'CONFIRMED',
        receivedAt: input.receivedAt,
        confirmedById: actor.id,
        confirmedByName: actor.name,
        notes: input.notes,
        items: input.items.map((item) => ({
          id: randomUUID(),
          purchaseItemId: item.purchaseItemId,
          description:
            purchase.items.find((candidate) => candidate.id === item.purchaseItemId)?.description ??
            'Item',
          quantity: item.quantity,
        })),
        createdAt: now,
      };
      this.demoReceipts.push(receipt);
      const totals = new Map<string, number>();
      [...previous.flatMap((item) => item.items), ...receipt.items].forEach((item) => {
        totals.set(
          item.purchaseItemId,
          (totals.get(item.purchaseItemId) ?? 0) + item.quantity,
        );
      });
      const fullyReceived = purchase.items.every(
        (item) => (totals.get(item.id) ?? 0) >= item.quantity - 0.0001,
      );
      if (fullyReceived && purchase.workflowStage === 'SUPPLIER_INVOICED') {
        await this.procurement.changePurchaseWorkflowStage(
          actor,
          organizationId,
          purchaseId,
          {
            expectedUpdatedAt: purchase.updatedAt,
            stage: 'RECEIVED',
            reason: 'Recebimento integral confirmado.',
          },
        );
      }
      return stripOrganization(receipt);
    }

    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      include: {
        items: {
          include: {
            receiptItems: { where: { receipt: { status: 'CONFIRMED' } } },
          },
        },
        fiscalDocumentLinks: true,
      },
    });
    if (!purchase) throw new NotFoundException('Pedido nao encontrado.');
    if (purchase.updatedAt.toISOString() !== input.expectedPurchaseUpdatedAt) {
      throw new ConflictException('O pedido foi alterado por outro usuario.');
    }
    if (
      !['SUPPLIER_INVOICED', 'RECEIVED'].includes(purchase.workflowStage) ||
      !purchase.fiscalDocumentLinks.some((link) =>
        ['MATCHED_EXACT', 'MATCHED_MANUAL'].includes(link.matchStatus),
      )
    ) {
      throw new BadRequestException('Vincule e confira a NF-e antes do recebimento.');
    }
    await this.assertReceiptResponsibility(actor, organizationId, purchase.items);
    validateReceiptQuantities(
      purchase.items,
      purchase.items.flatMap((item) =>
        item.receiptItems.map((receiptItem) => ({
          purchaseItemId: item.id,
          quantity: Number(receiptItem.quantity),
        })),
      ),
      input.items,
    );
    let receiptId = '';
    await this.prisma.$transaction(
      async (transaction) => {
        const fresh = await transaction.purchase.findFirst({
          where: { id: purchaseId, organizationId },
          include: {
            items: {
              include: {
                receiptItems: { where: { receipt: { status: 'CONFIRMED' } } },
              },
            },
          },
        });
        if (!fresh || fresh.updatedAt.toISOString() !== input.expectedPurchaseUpdatedAt) {
          throw new ConflictException('O pedido foi alterado por outro usuario.');
        }
        validateReceiptQuantities(
          fresh.items,
          fresh.items.flatMap((item) =>
            item.receiptItems.map((receiptItem) => ({
              purchaseItemId: item.id,
              quantity: Number(receiptItem.quantity),
            })),
          ),
          input.items,
        );
        await this.validateReceiptFiscalItems(
          transaction,
          organizationId,
          purchaseId,
          input,
        );
        const receipt = await transaction.goodsReceipt.create({
          data: {
            organizationId,
            purchaseId,
            receivedAt: new Date(`${input.receivedAt}T00:00:00.000Z`),
            confirmedById: actor.id,
            notes: input.notes,
            items: {
              create: input.items.map((item) => ({
                organizationId,
                purchaseItemId: item.purchaseItemId,
                invoiceDocumentItemId: item.invoiceDocumentItemId,
                quantity: item.quantity,
              })),
            },
          },
        });
        receiptId = receipt.id;
        const totals = new Map<string, number>();
        fresh.items.forEach((item) => {
          totals.set(
            item.id,
            quantitySum(item.receiptItems.map((receiptItem) => receiptItem.quantity)) +
              input.items
                .filter((receiptItem) => receiptItem.purchaseItemId === item.id)
                .reduce((sum, receiptItem) => sum + receiptItem.quantity, 0),
          );
        });
        const fullyReceived = fresh.items.every(
          (item) => (totals.get(item.id) ?? 0) >= Number(item.quantity) - 0.0001,
        );
        if (fullyReceived && fresh.workflowStage !== 'RECEIVED') {
          await transaction.purchase.update({
            where: { id: purchaseId },
            data: { workflowStage: 'RECEIVED' },
          });
          await transaction.purchaseStageHistory.create({
            data: {
              organizationId,
              purchaseId,
              fromStage: fresh.workflowStage,
              toStage: 'RECEIVED',
              changedById: actor.id,
              reason: 'Recebimento integral confirmado.',
            },
          });
        } else {
          await transaction.purchase.update({
            where: { id: purchaseId },
            data: { updatedAt: new Date() },
          });
        }
        await refreshPaymentEligibility(
          transaction,
          organizationId,
          purchaseId,
          actor.id,
        );
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'goods_receipt',
            resourceId: receipt.id,
            metadata: { itemCount: input.items.length, purchaseId },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const receipt = await this.prisma.goodsReceipt.findFirstOrThrow({
      where: { id: receiptId, organizationId },
      include: { confirmedBy: true, items: { include: { purchaseItem: true } } },
    });
    return toGoodsReceipt(receipt);
  }

  async listReceiptResponsibilities(organizationId: string): Promise<ReceiptResponsibility[]> {
    if (this.demoMode) {
      return this.demoResponsibilities
        .filter((responsibility) => responsibility.organizationId === organizationId)
        .map(stripOrganization);
    }
    const rows = await this.prisma.receiptResponsibility.findMany({
      where: { organizationId },
      include: { user: true, costCenter: true },
      orderBy: [{ costCenter: { name: 'asc' } }, { user: { name: 'asc' } }],
    });
    return rows.map(toReceiptResponsibility);
  }

  async addReceiptResponsibility(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: ReceiptResponsibilityInput,
  ): Promise<ReceiptResponsibility> {
    if (this.demoMode) {
      const responsibility: DemoResponsibility = {
        id: randomUUID(),
        organizationId,
        userId: input.userId,
        userName: input.userId === actor.id ? actor.name : 'Responsavel pelo recebimento',
        costCenterId: input.costCenterId,
        costCenterName: input.costCenterId ? 'Centro de custo' : null,
      };
      this.demoResponsibilities.push(responsibility);
      return stripOrganization(responsibility);
    }
    const [membership, costCenter] = await Promise.all([
      this.prisma.organizationMembership.findFirst({
        where: { organizationId, userId: input.userId, status: 'ACTIVE', user: { active: true } },
        include: { user: true },
      }),
      input.costCenterId
        ? this.prisma.costCenter.findFirst({
            where: { organizationId, id: input.costCenterId, active: true },
          })
        : Promise.resolve(null),
    ]);
    if (!membership) throw new BadRequestException('O responsavel precisa ser um usuario ativo da empresa.');
    if (input.costCenterId && !costCenter) throw new BadRequestException('Centro de custo invalido.');
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const responsibility = await transaction.receiptResponsibility.create({
          data: { organizationId, userId: input.userId, costCenterId: input.costCenterId },
          include: { user: true, costCenter: true },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'receipt_responsibility',
            resourceId: responsibility.id,
            metadata: input,
          },
        });
        return responsibility;
      });
      return toReceiptResponsibility(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Essa responsabilidade ja esta cadastrada.');
      }
      throw error;
    }
  }

  async removeReceiptResponsibility(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<void> {
    if (this.demoMode) {
      const index = this.demoResponsibilities.findIndex(
        (responsibility) => responsibility.organizationId === organizationId && responsibility.id === id,
      );
      if (index < 0) throw new NotFoundException('Responsabilidade nao encontrada.');
      this.demoResponsibilities.splice(index, 1);
      return;
    }
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.receiptResponsibility.deleteMany({
        where: { id, organizationId },
      });
      if (removed.count !== 1) throw new NotFoundException('Responsabilidade nao encontrada.');
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'DELETE',
          resource: 'receipt_responsibility',
          resourceId: id,
        },
      });
    });
  }

  async getFiscalIntegration(organizationId: string): Promise<FiscalIntegration> {
    if (this.demoMode) {
      return this.demoFiscal.get(organizationId) ?? emptyFiscalIntegration(this.fiscalRolloutMode);
    }
    const integration = await this.prisma.fiscalIntegration.findUnique({
      where: { organizationId },
    });
    return integration
      ? toFiscalIntegration(integration, this.fiscalRolloutMode)
      : emptyFiscalIntegration(this.fiscalRolloutMode);
  }

  async configureFiscalIntegration(
    actor: AuthenticatedIdentity,
    organizationId: string,
    metadata: ConfigureFiscalIntegrationMetadata,
    certificate: UploadedBinary,
  ): Promise<FiscalIntegration> {
    const { expectedUpdatedAt, ...configuration } = metadata;
    validateCertificateFile(certificate);
    const inspected = inspectA1Certificate(
      certificate.buffer,
      configuration.certificatePassphrase,
    );
    if (
      inspected.documents.length > 0 &&
      !inspected.documents.includes(configuration.taxpayerDocument)
    ) {
      throw new BadRequestException(
        'O certificado A1 nao pertence ao CNPJ fiscal informado.',
      );
    }
    if (this.demoMode) {
      const current = this.demoFiscal.get(organizationId);
      if (
        (current && (!expectedUpdatedAt || current.updatedAt !== expectedUpdatedAt)) ||
        (!current && expectedUpdatedAt)
      ) {
        throw new ConflictException(
          'A integracao fiscal foi alterada por outro usuario.',
        );
      }
      const now = new Date().toISOString();
      const integration: FiscalIntegration = {
        configured: true,
        rolloutMode: this.fiscalRolloutMode,
        environment: configuration.environment,
        taxpayerDocument: configuration.taxpayerDocument,
        certificateFingerprint: inspected.fingerprint,
        certificateExpiresAt: inspected.expiresAt.toISOString(),
        status: 'READY',
        manifestationMode: configuration.manifestationMode,
        lastNsu: '000000000000000',
        maxNsu: '000000000000000',
        lastSyncedAt: null,
        nextPollAt: null,
        lastError: null,
        updatedAt: now,
      };
      this.demoFiscal.set(organizationId, integration);
      return integration;
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { document: true },
    });
    const organizationDocument = normalizeBrazilianDocument(organization?.document ?? '');
    if (!organizationDocument) {
      throw new BadRequestException(
        'Cadastre o CNPJ da empresa antes de configurar a consulta da SEFAZ.',
      );
    }
    if (organizationDocument !== configuration.taxpayerDocument) {
      throw new BadRequestException(
        'O CNPJ fiscal precisa ser o mesmo CNPJ cadastrado para esta empresa.',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.fiscalIntegration.findUnique({
        where: { organizationId },
      });
      const integrationData = {
        environment: configuration.environment,
        taxpayerDocument: configuration.taxpayerDocument,
        certificateEncrypted: this.cipher.encrypt(certificate.buffer),
        certificatePassphraseEncrypted: this.cipher.encrypt(
          Buffer.from(configuration.certificatePassphrase, 'utf8'),
        ),
        certificateFingerprint: inspected.fingerprint,
        certificateExpiresAt: inspected.expiresAt,
        manifestationMode: configuration.manifestationMode,
        lastNsu: '000000000000000',
        maxNsu: '000000000000000',
        lastError: null,
        lastSyncedAt: null,
        nextPollAt: null,
        status: 'READY' as const,
      };
      if (current) {
        if (!expectedUpdatedAt || current.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new ConflictException(
            'A integracao fiscal foi alterada por outro usuario.',
          );
        }
        const updated = await transaction.fiscalIntegration.updateMany({
          where: {
            organizationId,
            updatedAt: new Date(expectedUpdatedAt),
          },
          data: integrationData,
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'A integracao fiscal foi alterada por outro usuario.',
          );
        }
      } else {
        if (expectedUpdatedAt) {
          throw new ConflictException(
            'A integracao fiscal foi criada por outro usuario.',
          );
        }
        await transaction.fiscalIntegration.create({
          data: {
            organizationId,
            ...integrationData,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'fiscal_integration',
          resourceId: organizationId,
          metadata: {
            certificateExpiresAt: inspected.expiresAt.toISOString(),
            certificateFingerprint: inspected.fingerprint,
            certificateDocuments: inspected.documents,
            certificateSubject: inspected.subject,
            environment: configuration.environment,
            manifestationMode: configuration.manifestationMode,
          },
        },
      });
    });
    return this.getFiscalIntegration(organizationId);
  }

  async revokeFiscalIntegration(
    actor: AuthenticatedIdentity,
    organizationId: string,
    expectedUpdatedAt: string,
  ): Promise<void> {
    if (this.demoMode) {
      const current = this.demoFiscal.get(organizationId);
      if (!current) {
        throw new NotFoundException('Integracao fiscal nao configurada.');
      }
      if (current.updatedAt !== expectedUpdatedAt) {
        throw new ConflictException(
          'A integracao fiscal foi alterada por outro usuario.',
        );
      }
      this.demoFiscal.delete(organizationId);
      return;
    }
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.fiscalIntegration.findUnique({
        where: { organizationId },
        select: { updatedAt: true },
      });
      if (!current) {
        throw new NotFoundException('Integracao fiscal nao configurada.');
      }
      if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new ConflictException(
          'A integracao fiscal foi alterada por outro usuario.',
        );
      }
      const removed = await transaction.fiscalIntegration.deleteMany({
        where: {
          organizationId,
          updatedAt: new Date(expectedUpdatedAt),
        },
      });
      if (removed.count !== 1) {
        throw new ConflictException(
          'A integracao fiscal foi alterada por outro usuario.',
        );
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'DELETE',
          resource: 'fiscal_integration',
          resourceId: organizationId,
        },
      });
    });
  }

  async testFiscalIntegration(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<FiscalIntegration> {
    if (this.demoMode) {
      const integration = this.demoFiscal.get(organizationId);
      if (!integration) throw new NotFoundException('Integracao fiscal nao configurada.');
      return integration;
    }
    const integration = await this.prisma.fiscalIntegration.findUnique({
      where: { organizationId },
    });
    if (!integration) throw new NotFoundException('Integracao fiscal nao configurada.');
    if (integration.certificateExpiresAt.getTime() <= Date.now()) {
      await this.prisma.fiscalIntegration.update({
        where: { organizationId },
        data: {
          status: 'CERTIFICATE_EXPIRED',
          lastError: 'O certificado A1 esta vencido.',
          nextPollAt: null,
        },
      });
      throw new ServiceUnavailableException('O certificado A1 esta vencido.');
    }
    const certificate = this.cipher.decrypt(integration.certificateEncrypted);
    const passphrase = this.cipher
      .decrypt(integration.certificatePassphraseEncrypted)
      .toString('utf8');
    const inspected = inspectA1Certificate(certificate, passphrase);
    if (inspected.fingerprint !== integration.certificateFingerprint) {
      throw new ServiceUnavailableException(
        'A integridade do certificado fiscal armazenado nao foi confirmada.',
      );
    }
    if (
      inspected.documents.length > 0 &&
      !inspected.documents.includes(
        normalizeBrazilianDocument(integration.taxpayerDocument),
      )
    ) {
      throw new ServiceUnavailableException(
        'O certificado fiscal armazenado nao pertence ao CNPJ configurado.',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.fiscalIntegration.update({
        where: { organizationId },
        data: { status: 'READY', lastError: null },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'fiscal_integration',
          resourceId: organizationId,
          metadata: {
            certificateExpiresAt: inspected.expiresAt.toISOString(),
            certificateFingerprint: inspected.fingerprint,
            testOnly: true,
          },
        },
      });
    });
    return this.getFiscalIntegration(organizationId);
  }

  async syncFiscalNow(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<FiscalSyncResult> {
    return this.syncFiscalOrganization(organizationId, actor.id, true);
  }

  async syncDueFiscalOrganizations(): Promise<void> {
    if (this.demoMode) return;
    await this.enqueueFiscalCertificateAlerts();
    const due = await this.prisma.fiscalIntegration.findMany({
      where: {
        status: { in: ['READY', 'BACKOFF', 'ERROR'] },
        OR: [{ nextPollAt: null }, { nextPollAt: { lte: new Date() } }],
      },
      select: { organizationId: true },
      take: 25,
    });
    for (const integration of due) {
      await this.syncFiscalOrganization(integration.organizationId, null, false).catch(
        () => undefined,
      );
    }
  }

  private async enqueueFiscalCertificateAlerts(): Promise<void> {
    const now = new Date();
    const warningLimit = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
    const integrations = await this.prisma.fiscalIntegration.findMany({
      where: { certificateExpiresAt: { lte: warningLimit } },
      take: 100,
    });
    for (const integration of integrations) {
      const expired = integration.certificateExpiresAt <= now;
      if (expired && integration.status !== 'CERTIFICATE_EXPIRED') {
        await this.prisma.fiscalIntegration.update({
          where: { organizationId: integration.organizationId },
          data: {
            lastError: 'O certificado A1 esta vencido.',
            nextPollAt: null,
            status: 'CERTIFICATE_EXPIRED',
          },
        });
      }
      const [paymentSettings, approvalSettings] = await Promise.all([
        this.prisma.paymentSettings.findUnique({
          where: { organizationId: integration.organizationId },
        }),
        this.prisma.approvalSettings.findUnique({
          where: { organizationId: integration.organizationId },
        }),
      ]);
      const channel =
        paymentSettings?.notificationChannel ?? approvalSettings?.financeChannel;
      const recipient =
        paymentSettings?.notificationRecipient ?? approvalSettings?.financeRecipient;
      if (!channel || !recipient) continue;
      const eventType = expired
        ? 'FISCAL_CERTIFICATE_EXPIRED'
        : 'FISCAL_CERTIFICATE_EXPIRING';
      await this.prisma.notificationOutbox.createMany({
        data: [
          {
            organizationId: integration.organizationId,
            deduplicationKey: `${eventType.toLowerCase()}:${integration.certificateExpiresAt.toISOString()}`,
            eventType,
            channel,
            recipient,
            subject: expired
              ? 'Certificado A1 fiscal vencido'
              : 'Certificado A1 fiscal proximo do vencimento',
            payload: {
              expiresAt: integration.certificateExpiresAt.toISOString(),
              taxpayerDocument: integration.taxpayerDocument,
            },
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  async listFiscalDocuments(
    organizationId: string,
    filters: FiscalDocumentFilters,
  ): Promise<FiscalDocumentSummary[]> {
    if (this.demoMode) return [];
    const rows = await this.prisma.invoiceDocument.findMany({
      where: {
        organizationId,
        ...(filters.matchStatus && { matchStatus: filters.matchStatus }),
        ...(filters.dateFrom || filters.dateTo
          ? {
              fiscalIssuedAt: {
                ...(filters.dateFrom && { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }),
                ...(filters.dateTo && { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) }),
              },
            }
          : {}),
      },
      include: {
        purchaseLinks: { include: { purchase: true } },
      },
      orderBy: [{ fiscalIssuedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    const search = normalize(filters.search ?? '');
    return rows
      .map(toFiscalDocumentSummary)
      .filter((document) =>
        search
          ? normalize(
              `${document.invoiceNumber ?? ''} ${document.accessKey ?? ''} ${document.issuerDocument ?? ''} ${document.matches.map((match) => match.purchaseNumber).join(' ')}`,
            ).includes(search)
          : true,
      );
  }

  async reviewFiscalDocumentMatch(
    actor: AuthenticatedIdentity,
    organizationId: string,
    documentId: string,
    input: ReviewFiscalDocumentMatchInput,
  ): Promise<FiscalDocumentSummary> {
    if (this.demoMode) throw new BadRequestException('Nao ha documentos fiscais no modo demonstrativo.');
    const document = await this.prisma.invoiceDocument.findFirst({
      where: { id: documentId, organizationId },
      include: { fiscalItems: true },
    });
    if (!document) throw new NotFoundException('Documento fiscal nao encontrado.');
    if (document.updatedAt.toISOString() !== input.expectedDocumentUpdatedAt) {
      throw new ConflictException('O documento fiscal foi alterado por outro usuario.');
    }
    if (input.decision === 'REJECT') {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.purchaseInvoiceLink.updateMany({
          where: { organizationId, invoiceDocumentId: documentId },
          data: { matchStatus: 'REJECTED', matchedById: actor.id, matchReason: input.reason },
        });
        const changed = await transaction.invoiceDocument.updateMany({
          where: {
            id: documentId,
            organizationId,
            updatedAt: new Date(input.expectedDocumentUpdatedAt),
          },
          data: { matchStatus: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date() },
        });
        if (changed.count !== 1) {
          throw new ConflictException('O documento fiscal foi alterado por outro usuario.');
        }
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'fiscal_document_match',
            resourceId: documentId,
            metadata: { decision: 'REJECT', reason: input.reason },
          },
        });
      });
      return this.requireFiscalDocumentSummary(organizationId, documentId);
    }
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: input.purchaseId!, organizationId },
      include: { supplier: true, items: true },
    });
    if (!purchase) throw new NotFoundException('Pedido nao encontrado.');
    if (purchase.updatedAt.toISOString() !== input.expectedPurchaseUpdatedAt) {
      throw new ConflictException('O pedido foi alterado por outro usuario.');
    }
    const hasDivergence =
      normalizeBrazilianDocument(purchase.supplier.document ?? '') !==
        normalizeBrazilianDocument(document.issuerDocument ?? '') ||
      !document.fiscalTotal ||
      Number(document.fiscalTotal) > Number(purchase.total) + 0.01;
    if (!input.reason) {
      throw new BadRequestException('Informe a justificativa da conciliacao fiscal manual.');
    }
    await this.prisma.$transaction(
      async (transaction) => {
        const changed = await transaction.purchase.updateMany({
          where: {
            id: purchase.id,
            organizationId,
            updatedAt: new Date(input.expectedPurchaseUpdatedAt!),
          },
          data: {
            invoiceNumber: purchase.invoiceNumber ?? document.invoiceNumber,
            workflowStage:
              purchase.workflowStage === 'PURCHASE_ORDER'
                ? 'SUPPLIER_INVOICED'
                : purchase.workflowStage,
          },
        });
        if (changed.count !== 1) throw new ConflictException('O pedido foi alterado por outro usuario.');
        await transaction.purchaseInvoiceLink.upsert({
          where: {
            organizationId_purchaseId_invoiceDocumentId: {
              organizationId,
              purchaseId: purchase.id,
              invoiceDocumentId: documentId,
            },
          },
          create: {
            organizationId,
            purchaseId: purchase.id,
            invoiceDocumentId: documentId,
            matchStatus: 'MATCHED_MANUAL',
            matchedById: actor.id,
            matchReason: input.reason ?? 'Vinculo confirmado em revisao humana.',
          },
          update: {
            matchStatus: 'MATCHED_MANUAL',
            matchedById: actor.id,
            matchReason: input.reason ?? 'Vinculo confirmado em revisao humana.',
          },
        });
        const changedDocument = await transaction.invoiceDocument.updateMany({
          where: {
            id: documentId,
            organizationId,
            updatedAt: new Date(input.expectedDocumentUpdatedAt),
          },
          data: {
            purchaseId: purchase.id,
            matchStatus: 'MATCHED_MANUAL',
            reviewedById: actor.id,
            reviewedAt: new Date(),
          },
        });
        if (changedDocument.count !== 1) {
          throw new ConflictException('O documento fiscal foi alterado por outro usuario.');
        }
        if (purchase.workflowStage === 'PURCHASE_ORDER') {
          await transaction.purchaseStageHistory.create({
            data: {
              organizationId,
              purchaseId: purchase.id,
              fromStage: 'PURCHASE_ORDER',
              toStage: 'SUPPLIER_INVOICED',
              changedById: actor.id,
              reason: 'NF-e vinculada apos revisao humana.',
            },
          });
        }
        await matchFiscalItemsByDescription(transaction, organizationId, purchase, document);
        if (document.fiscalTotal) {
          await assignInstallmentsToFiscalDocument(
            transaction,
            organizationId,
            purchase.id,
            documentId,
            Number(document.fiscalTotal),
          );
        }
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'fiscal_document_match',
            resourceId: documentId,
            metadata: {
              decision: 'MATCH',
              purchaseId: purchase.id,
              reason: input.reason,
              divergence: hasDivergence,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.requireFiscalDocumentSummary(organizationId, documentId);
  }

  async manifestFiscalDocument(
    actor: AuthenticatedIdentity,
    organizationId: string,
    documentId: string,
    input: ManifestFiscalDocumentInput,
  ): Promise<FiscalDocumentSummary> {
    if (input.manifestation === 'OPERATION_NOT_PERFORMED' && (input.reason?.length ?? 0) < 15) {
      throw new BadRequestException('Informe uma justificativa com pelo menos 15 caracteres.');
    }
    if (this.demoMode) throw new BadRequestException('Nao ha documentos fiscais no modo demonstrativo.');
    const [document, integration] = await Promise.all([
      this.prisma.invoiceDocument.findFirst({ where: { id: documentId, organizationId } }),
      this.prisma.fiscalIntegration.findUnique({ where: { organizationId } }),
    ]);
    if (!document?.accessKey || document.fiscalModel !== '55') {
      throw new BadRequestException('A manifestacao exige uma NF-e modelo 55 com chave de acesso.');
    }
    if (document.updatedAt.toISOString() !== input.expectedDocumentUpdatedAt) {
      throw new ConflictException('O documento fiscal foi alterado por outro usuario.');
    }
    if (!integration) throw new BadRequestException('Integracao fiscal nao configurada.');
    assertCertificateValid(integration.certificateExpiresAt);
    const result = await this.sefaz.manifest({
      accessKey: document.accessKey,
      environment: integration.environment,
      manifestation: input.manifestation,
      passphrase: this.cipher.decrypt(integration.certificatePassphraseEncrypted).toString('utf8'),
      pfx: this.cipher.decrypt(integration.certificateEncrypted),
      reason: input.reason,
      taxpayerDocument: normalizeBrazilianDocument(integration.taxpayerDocument),
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.invoiceDocument.update({
        where: { id: documentId },
        data: { manifestation: input.manifestation, manifestedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'fiscal_manifestation',
          resourceId: documentId,
          metadata: {
            manifestation: input.manifestation,
            protocol: result.protocol,
            reason: input.reason,
            statusCode: result.statusCode,
          },
        },
      });
    });
    return this.requireFiscalDocumentSummary(organizationId, documentId);
  }

  async fiscalDocumentFileUrl(
    organizationId: string,
    documentId: string,
  ): Promise<{ expiresAt: string; url: string }> {
    if (this.demoMode) throw new NotFoundException('Documento fiscal nao encontrado.');
    const document = await this.prisma.invoiceDocument.findFirst({
      where: { id: documentId, organizationId },
      select: { storagePath: true },
    });
    if (!document) throw new NotFoundException('Documento fiscal nao encontrado.');
    return temporaryFileAccess(await this.storage.createSignedUrl(document.storagePath));
  }

  async paymentProofFileUrl(
    organizationId: string,
    settlementId: string,
  ): Promise<{ expiresAt: string; url: string }> {
    if (this.demoMode) throw new NotFoundException('Comprovante nao encontrado.');
    const settlement = await this.prisma.paymentSettlement.findFirst({
      where: { id: settlementId, organizationId },
      select: { proofStoragePath: true },
    });
    if (!settlement) throw new NotFoundException('Comprovante nao encontrado.');
    return temporaryFileAccess(await this.storage.createSignedUrl(settlement.proofStoragePath));
  }

  async pixQrFileUrl(
    organizationId: string,
    installmentId: string,
  ): Promise<{ expiresAt: string; url: string }> {
    if (this.demoMode) throw new NotFoundException('Imagem de QR Pix nao encontrada.');
    const snapshot = await this.prisma.paymentInstructionSnapshot.findFirst({
      where: { organizationId, installmentId, pixQrStoragePath: { not: null } },
      orderBy: { version: 'desc' },
      select: { pixQrStoragePath: true },
    });
    if (!snapshot?.pixQrStoragePath) throw new NotFoundException('Imagem de QR Pix nao encontrada.');
    return temporaryFileAccess(await this.storage.createSignedUrl(snapshot.pixQrStoragePath));
  }

  private async syncFiscalOrganization(
    organizationId: string,
    actorUserId: string | null,
    force: boolean,
  ): Promise<FiscalSyncResult> {
    if (this.demoMode) {
      const integration = this.demoFiscal.get(organizationId);
      if (!integration?.configured) throw new BadRequestException('Integracao fiscal nao configurada.');
      return {
        fetched: 0,
        created: 0,
        duplicated: 0,
        reviewRequired: 0,
        lastNsu: integration.lastNsu,
        maxNsu: integration.maxNsu,
      };
    }
    const integration = await this.prisma.fiscalIntegration.findUnique({
      where: { organizationId },
    });
    if (!integration) throw new BadRequestException('Integracao fiscal nao configurada.');
    assertCertificateValid(integration.certificateExpiresAt);
    if (!force && integration.nextPollAt && integration.nextPollAt > new Date()) {
      return {
        fetched: 0,
        created: 0,
        duplicated: 0,
        reviewRequired: 0,
        lastNsu: integration.lastNsu,
        maxNsu: integration.maxNsu,
      };
    }
    const staleLock = new Date(Date.now() - 10 * 60_000);
    const locked = await this.prisma.fiscalIntegration.updateMany({
      where: {
        organizationId,
        OR: [{ status: { not: 'SYNCING' } }, { updatedAt: { lt: staleLock } }],
      },
      data: { status: 'SYNCING', lastError: null },
    });
    if (locked.count !== 1) {
      throw new ConflictException('Ja existe uma sincronizacao fiscal em andamento.');
    }
    try {
      const pfx = this.cipher.decrypt(integration.certificateEncrypted);
      const passphrase = this.cipher
        .decrypt(integration.certificatePassphraseEncrypted)
        .toString('utf8');
      const response = await this.sefaz.distribute({
        environment: integration.environment,
        lastNsu: integration.lastNsu,
        passphrase,
        pfx,
        taxpayerDocument: normalizeBrazilianDocument(integration.taxpayerDocument),
      });
      let created = 0;
      let duplicated = 0;
      let reviewRequired = 0;
      for (const distributed of response.documents) {
        const processed = await this.processDistributedFiscalDocument(
          organizationId,
          normalizeBrazilianDocument(integration.taxpayerDocument),
          distributed,
        );
        if (processed.created) created += 1;
        else duplicated += 1;
        if (processed.reviewRequired) reviewRequired += 1;
        if (
          this.fiscalRolloutMode === 'AUTO_SCIENCE' &&
          integration.manifestationMode === 'AUTO_SCIENCE' &&
          processed.document?.matchStatus === 'MATCHED_EXACT' &&
          !processed.document.manifestation &&
          processed.document.accessKey
        ) {
          const manifestation = await this.sefaz.manifest({
            accessKey: processed.document.accessKey,
            environment: integration.environment,
            manifestation: 'SCIENCE',
            passphrase,
            pfx,
            reason: null,
            taxpayerDocument: normalizeBrazilianDocument(integration.taxpayerDocument),
          });
          await this.prisma.$transaction(async (transaction) => {
            await transaction.invoiceDocument.update({
              where: { id: processed.document!.id },
              data: { manifestation: 'SCIENCE', manifestedAt: new Date() },
            });
            await transaction.auditLog.create({
              data: {
                actorUserId: null,
                organizationId,
                action: 'UPDATE',
                resource: 'fiscal_manifestation',
                resourceId: processed.document!.id,
                metadata: {
                  automatic: true,
                  manifestation: 'SCIENCE',
                  protocol: manifestation.protocol,
                  statusCode: manifestation.statusCode,
                },
              },
            });
          });
        }
      }
      const hasMore = BigInt(response.lastNsu) < BigInt(response.maxNsu);
      const nextPollAt = new Date(
        Date.now() + (hasMore && response.documents.length ? 60_000 : 60 * 60_000),
      );
      await this.prisma.$transaction(async (transaction) => {
        await transaction.fiscalIntegration.update({
          where: { organizationId },
          data: {
            lastNsu: response.lastNsu,
            maxNsu: response.maxNsu,
            lastSyncedAt: new Date(),
            nextPollAt,
            status: response.statusCode === '656' ? 'BACKOFF' : 'READY',
            lastError: response.statusCode === '656' ? response.statusMessage : null,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId,
            organizationId,
            action: 'IMPORT',
            resource: 'sefaz_distribution',
            resourceId: organizationId,
            metadata: {
              created,
              duplicated,
              fetched: response.documents.length,
              lastNsu: response.lastNsu,
              maxNsu: response.maxNsu,
              reviewRequired,
              rolloutMode: this.fiscalRolloutMode,
            },
          },
        });
      });
      return {
        fetched: response.documents.length,
        created,
        duplicated,
        reviewRequired,
        lastNsu: response.lastNsu,
        maxNsu: response.maxNsu,
      };
    } catch (error) {
      const certificateExpired = integration.certificateExpiresAt.getTime() <= Date.now();
      const message = safeErrorMessage(error);
      await this.prisma.fiscalIntegration.update({
        where: { organizationId },
        data: {
          lastError: message,
          nextPollAt: new Date(Date.now() + 15 * 60_000),
          status: certificateExpired ? 'CERTIFICATE_EXPIRED' : 'BACKOFF',
        },
      });
      throw error;
    }
  }

  private async processDistributedFiscalDocument(
    organizationId: string,
    taxpayerDocument: string,
    distributed: { nsu: string; schema: string; xml: Buffer },
  ): Promise<{
    created: boolean;
    document: FiscalDocumentSummary | null;
    reviewRequired: boolean;
  }> {
    const duplicate = await this.prisma.invoiceDocument.findFirst({
      where: { organizationId, sefazNsu: distributed.nsu },
      include: { purchaseLinks: { include: { purchase: true } } },
    });
    if (duplicate) {
      const document = toFiscalDocumentSummary(duplicate);
      return {
        created: false,
        document,
        reviewRequired: document.matchStatus === 'REVIEW_REQUIRED',
      };
    }
    const metadata = extractNfeMetadata(distributed.xml);
    const isFullNfe = metadata.fiscalModel === '55' && metadata.items.length > 0;
    let extraction: ReturnType<typeof parseInvoiceXml> | null = null;
    if (isFullNfe) {
      try {
        extraction = parseInvoiceXml(distributed.xml);
      } catch {
        extraction = null;
      }
    }
    const sha256 = createHash('sha256').update(distributed.xml).digest('hex');
    const fileName = `${metadata.accessKey ?? distributed.nsu}.xml`;
    const storagePath = await this.storage.save(
      organizationId,
      'fiscal',
      fileName,
      'application/xml',
      distributed.xml,
    );
    let documentId = '';
    try {
      const created = await this.prisma.invoiceDocument.create({
        data: {
          organizationId,
          invoiceNumber: metadata.invoiceNumber,
          accessKey: metadata.accessKey,
          source: 'SEFAZ',
          sefazNsu: distributed.nsu,
          fiscalModel: metadata.fiscalModel,
          issuerDocument: metadata.issuerDocument,
          recipientDocument: metadata.recipientDocument,
          fiscalIssuedAt: metadata.issuedAt,
          fiscalTotal: metadata.total,
          matchStatus: 'UNMATCHED',
          fileName,
          mimeType: 'application/xml',
          kind: 'XML',
          size: distributed.xml.length,
          sha256,
          storagePath,
          status: isFullNfe && extraction ? 'READY' : 'REVIEW_REQUIRED',
          parser: extraction?.parser ?? `SEFAZ_${distributed.schema}`.slice(0, 80),
          confidence: extraction ? 1 : null,
          parsedData: extraction
            ? (extraction.extraction as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          warnings: [
            ...(extraction?.warnings ?? []),
            ...(!isFullNfe ? ['Documento resumido ou fora do modelo 55; revisao necessaria.'] : []),
          ],
          errors: [],
          processedAt: new Date(),
          fiscalItems: {
            create: metadata.items.map((item) => ({
              organizationId,
              sequence: item.sequence,
              itemCode: item.itemCode,
              purchaseReference: item.purchaseReference,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
      });
      documentId = created.id;
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.invoiceDocument.findFirst({
          where: {
            organizationId,
            OR: [
              { sefazNsu: distributed.nsu },
              ...(metadata.accessKey ? [{ accessKey: metadata.accessKey }] : []),
              { sha256 },
            ],
          },
          include: { purchaseLinks: { include: { purchase: true } } },
        });
        const document = existing ? toFiscalDocumentSummary(existing) : null;
        return {
          created: false,
          document,
          reviewRequired: document?.matchStatus === 'REVIEW_REQUIRED',
        };
      }
      throw error;
    }

    let matched = false;
    if (
      this.fiscalRolloutMode !== 'SHADOW' &&
      isFullNfe &&
      extraction &&
      metadata.recipientDocument === taxpayerDocument
    ) {
      matched = await this.tryExactFiscalMatch(organizationId, documentId, metadata);
    }
    if (!matched) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.invoiceDocument.update({
          where: { id: documentId },
          data: { matchStatus: 'REVIEW_REQUIRED', status: 'REVIEW_REQUIRED' },
        });
        await enqueueFiscalDivergenceNotification(transaction, organizationId, documentId, metadata);
      });
    }
    const document = await this.requireFiscalDocumentSummary(organizationId, documentId);
    return {
      created: true,
      document,
      reviewRequired: document.matchStatus === 'REVIEW_REQUIRED',
    };
  }

  private async tryExactFiscalMatch(
    organizationId: string,
    documentId: string,
    metadata: NfeMetadata,
  ): Promise<boolean> {
    if (!metadata.issuerDocument || !metadata.total || !metadata.items.length) return false;
    const candidates = await this.prisma.purchase.findMany({
      where: {
        organizationId,
        status: { not: 'CANCELLED' },
        workflowStage: { in: ['PURCHASE_ORDER', 'SUPPLIER_INVOICED'] },
      },
      include: {
        supplier: true,
        items: true,
        fiscalDocumentLinks: {
          where: { matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] } },
          include: { invoiceDocument: { include: { fiscalItems: true } } },
        },
      },
      take: 250,
    });
    const exact = candidates
      .map((purchase) => ({
        purchase,
        itemMatches: exactItemMatches(
          purchase,
          metadata.items,
          metadata.total,
        ),
      }))
      .filter(
        ({ purchase, itemMatches }) =>
          normalizeBrazilianDocument(purchase.supplier.document ?? '') ===
            metadata.issuerDocument &&
          hasPurchaseReference(purchase, metadata.purchaseReferences) &&
          itemMatches !== null,
      );
    if (exact.length !== 1) return false;
    const { purchase, itemMatches } = exact[0]!;
    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.purchaseInvoiceLink.create({
          data: {
            organizationId,
            purchaseId: purchase.id,
            invoiceDocumentId: documentId,
            matchStatus: 'MATCHED_EXACT',
            matchReason: 'CNPJ, referencia, itens, quantidades e valores conferidos exatamente.',
          },
        });
        await transaction.invoiceDocument.update({
          where: { id: documentId },
          data: {
            purchaseId: purchase.id,
            matchStatus: 'MATCHED_EXACT',
            status: 'READY',
          },
        });
        for (const match of itemMatches!) {
          await transaction.fiscalDocumentItem.update({
            where: {
              organizationId_invoiceDocumentId_sequence: {
                organizationId,
                invoiceDocumentId: documentId,
                sequence: match.sequence,
              },
            },
            data: { matchedPurchaseItemId: match.purchaseItemId },
          });
        }
        await assignInstallmentsToFiscalDocument(
          transaction,
          organizationId,
          purchase.id,
          documentId,
          metadata.total!,
        );
        if (purchase.workflowStage === 'PURCHASE_ORDER') {
          await transaction.purchase.update({
            where: { id: purchase.id },
            data: {
              invoiceNumber: purchase.invoiceNumber ?? metadata.invoiceNumber,
              workflowStage: 'SUPPLIER_INVOICED',
            },
          });
          await transaction.purchaseStageHistory.create({
            data: {
              organizationId,
              purchaseId: purchase.id,
              fromStage: 'PURCHASE_ORDER',
              toStage: 'SUPPLIER_INVOICED',
              changedById: null,
              reason: 'NF-e vinculada automaticamente por correspondencia exata.',
            },
          });
        } else if (!purchase.invoiceNumber) {
          await transaction.purchase.update({
            where: { id: purchase.id },
            data: { invoiceNumber: metadata.invoiceNumber },
          });
        }
        await transaction.auditLog.create({
          data: {
            actorUserId: null,
            organizationId,
            action: 'UPDATE',
            resource: 'fiscal_document_match',
            resourceId: documentId,
            metadata: { automatic: true, purchaseId: purchase.id },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return true;
  }

  private async validateReceiptFiscalItems(
    database: Pick<PrismaClient, 'fiscalDocumentItem'>,
    organizationId: string,
    purchaseId: string,
    input: CreateGoodsReceiptInput,
  ): Promise<void> {
    const fiscalIds = input.items
      .map((item) => item.invoiceDocumentItemId)
      .filter((id): id is string => Boolean(id));
    if (!fiscalIds.length) return;
    const fiscalItems = await database.fiscalDocumentItem.findMany({
      where: {
        organizationId,
        id: { in: fiscalIds },
        invoiceDocument: {
          purchaseLinks: {
            some: {
              purchaseId,
              matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] },
            },
          },
        },
      },
      include: { receiptItems: { where: { receipt: { status: 'CONFIRMED' } } } },
    });
    if (fiscalItems.length !== new Set(fiscalIds).size) {
      throw new BadRequestException('Um item fiscal nao pertence a uma NF-e vinculada ao pedido.');
    }
    for (const item of input.items) {
      if (!item.invoiceDocumentItemId) continue;
      const fiscal = fiscalItems.find((candidate) => candidate.id === item.invoiceDocumentItemId)!;
      if (fiscal.matchedPurchaseItemId !== item.purchaseItemId) {
        throw new BadRequestException('O item fiscal nao corresponde ao item recebido.');
      }
      const previouslyReceived = quantitySum(
        fiscal.receiptItems.map((receiptItem) => receiptItem.quantity),
      );
      const inThisReceipt = input.items
        .filter((candidate) => candidate.invoiceDocumentItemId === fiscal.id)
        .reduce((sum, candidate) => sum + candidate.quantity, 0);
      if (previouslyReceived + inThisReceipt > Number(fiscal.quantity) + 0.0001) {
        throw new BadRequestException(
          `A quantidade recebida excede a quantidade da NF-e para ${fiscal.description}.`,
        );
      }
    }
  }

  private async assertReceiptResponsibility(
    actor: AuthenticatedIdentity,
    organizationId: string,
    items: Array<{ costCenterId: string | null }>,
  ): Promise<void> {
    if (isPlatformOwner(actor.platformRoles)) return;
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId: actor.id, status: 'ACTIVE' },
    });
    if (membership?.role === 'ORGANIZATION_ADMIN') return;
    const responsibilities = await this.prisma.receiptResponsibility.findMany({
      where: { organizationId, userId: actor.id },
    });
    if (responsibilities.some((responsibility) => responsibility.costCenterId === null)) return;
    const requiredCostCenters = [
      ...new Set(items.map((item) => item.costCenterId).filter((id): id is string => Boolean(id))),
    ];
    if (
      requiredCostCenters.length > 0 &&
      requiredCostCenters.every((id) =>
        responsibilities.some((responsibility) => responsibility.costCenterId === id),
      )
    ) {
      return;
    }
    throw new ForbiddenException('Este usuario nao e responsavel pelo recebimento deste pedido.');
  }

  private async requirePaymentApprovers(
    organizationId: string,
    userIds: string[],
    channel: 'EMAIL' | 'WHATSAPP',
  ): Promise<Array<{ id: string; name: string; recipient: string }>> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(userIds)] },
        active: true,
        memberships: { some: { organizationId, status: 'ACTIVE' } },
      },
    });
    if (users.length !== new Set(userIds).size) {
      throw new BadRequestException('Todos os aprovadores precisam ser usuarios ativos da empresa.');
    }
    return users.map((user) => {
      const recipient = recipientForChannel(user, channel);
      if (!recipient) {
        throw new BadRequestException(
          `O aprovador ${user.name} nao possui ${channel === 'EMAIL' ? 'e-mail' : 'telefone'} valido.`,
        );
      }
      return { id: user.id, name: user.name, recipient };
    });
  }

  private async requireTitle(
    organizationId: string,
    installmentId: string,
  ): Promise<TitleRecord> {
    const title = await this.prisma.installment.findFirst({
      where: { id: installmentId, organizationId },
      include: titleInclude,
    });
    if (!title) throw new NotFoundException('Titulo financeiro nao encontrado.');
    return title;
  }

  private async requireFiscalDocumentSummary(
    organizationId: string,
    documentId: string,
  ): Promise<FiscalDocumentSummary> {
    const document = await this.prisma.invoiceDocument.findFirst({
      where: { id: documentId, organizationId },
      include: { purchaseLinks: { include: { purchase: true } } },
    });
    if (!document) throw new NotFoundException('Documento fiscal nao encontrado.');
    return toFiscalDocumentSummary(document);
  }

  private async listDemoPayables(
    organizationId: string,
    filters: PayableKanbanFilters,
  ): Promise<PayableKanbanCard[]> {
    const report = await this.procurement.getAccountsPayable(organizationId, {});
    const cards = report.rows
      .filter((row) => row.sequence > 0 && row.dueDate)
      .map((row) => {
        const key = `${organizationId}:${row.purchaseId}:${row.sequence}`;
        const id = this.demoTitleIds.get(key) ?? randomUUID();
        this.demoTitleIds.set(key, id);
        const settlements = this.demoSettlements.get(id) ?? [];
        const paidAmount = row.paidAt
          ? row.amount
          : roundMoney(settlements.reduce((sum, settlement) => sum + settlement.amount, 0));
        const instruction = this.demoInstructions.get(id) ?? legacyDemoInstruction(row);
        const invoiceNumbers = row.invoiceNumber ? [row.invoiceNumber] : [];
        const received = ['RECEIVED', 'COMPLETED'].includes(row.workflowStage);
        const advance = this.demoAdvances.get(id);
        const stage =
          this.demoPaymentStages.get(id) ??
          (row.paidAt ? 'PAID' : 'MATCHING_REQUIRED');
        return {
          id,
          purchaseId: row.purchaseId,
          purchaseNumber: row.purchaseNumber,
          purchaseUpdatedAt: row.purchaseUpdatedAt,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          sequence: row.sequence,
          dueDate: row.dueDate!,
          amount: row.amount,
          paidAmount,
          balance: Math.max(0, roundMoney(row.amount - paidAmount)),
          stage,
          overdue: stage !== 'PAID' && row.dueDate! < toDateOnly(new Date()),
          invoiceNumbers,
          received,
          advancePayment: Boolean(advance),
          advanceReason: advance?.reason ?? null,
          hasAdvanceEvidence: Boolean(advance),
          instruction,
          settlements,
          approval: null,
          updatedAt: row.purchaseUpdatedAt,
        } satisfies PayableKanbanCard;
      });
    const search = normalize(filters.search ?? '');
    return cards.filter(
      (card) =>
        (!filters.stage || card.stage === filters.stage) &&
        (!filters.supplierId || card.supplierId === filters.supplierId) &&
        (!filters.dateFrom || card.dueDate >= filters.dateFrom) &&
        (!filters.dateTo || card.dueDate <= filters.dateTo) &&
        (!search ||
          normalize(`${card.purchaseNumber} ${card.supplierName} ${card.invoiceNumbers.join(' ')}`).includes(search)),
    );
  }

  private async requireDemoCard(
    organizationId: string,
    installmentId: string,
  ): Promise<PayableKanbanCard> {
    const card = (await this.listDemoPayables(organizationId, {})).find(
      (candidate) => candidate.id === installmentId,
    );
    if (!card) throw new NotFoundException('Titulo financeiro nao encontrado.');
    return card;
  }

  private get prisma(): PrismaClient {
    return this.database.prisma;
  }
}

function emptyPaymentSettings(): PaymentSettings {
  return {
    approvalMode: 'DISABLED',
    segregationEnabled: false,
    notificationChannel: null,
    notificationRecipient: null,
    updatedAt: null,
  };
}

function emptyFiscalIntegration(
  rolloutMode: FiscalIntegration['rolloutMode'],
): FiscalIntegration {
  return {
    configured: false,
    rolloutMode,
    environment: 'HOMOLOGATION',
    taxpayerDocument: null,
    certificateFingerprint: null,
    certificateExpiresAt: null,
    status: 'NOT_CONFIGURED',
    manifestationMode: 'MANUAL',
    lastNsu: '000000000000000',
    maxNsu: '000000000000000',
    lastSyncedAt: null,
    nextPollAt: null,
    lastError: null,
    updatedAt: null,
  };
}

function toPaymentRule(rule: PaymentRuleRecord): PaymentApprovalRule {
  return {
    id: rule.id,
    name: rule.name,
    minimumAmount: Number(rule.minimumAmount),
    requiredApprovals: rule.requiredApprovals,
    notificationChannel: rule.notificationChannel,
    active: rule.active,
    approvers: rule.approvers.map(({ user }) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    })),
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function toPayableCard(title: TitleRecord): PayableKanbanCard {
  const amount = Number(title.amount);
  const settlementTotal = moneySum(title.settlements.map((settlement) => settlement.amount));
  const paidAmount = title.paidAt && settlementTotal === 0 ? amount : settlementTotal;
  const balance = Math.max(0, roundMoney(amount - paidAmount));
  const instruction = title.instructionSnapshots[0];
  const latestApproval = [...title.approvalTitles]
    .sort(
      (left, right) =>
        right.request.submittedAt.getTime() - left.request.submittedAt.getTime(),
    )
    .find((approvalTitle) =>
      ['PENDING', 'APPROVED', 'REJECTED'].includes(approvalTitle.request.status),
    );
  const invoices = new Set<string>();
  for (const link of title.purchase.fiscalDocumentLinks) {
    if (
      ['MATCHED_EXACT', 'MATCHED_MANUAL'].includes(link.matchStatus) &&
      link.invoiceDocument.invoiceNumber
    ) {
      invoices.add(link.invoiceDocument.invoiceNumber);
    }
  }
  if (title.fiscalDocument?.invoiceNumber) invoices.add(title.fiscalDocument.invoiceNumber);
  return {
    id: title.id,
    purchaseId: title.purchaseId,
    purchaseNumber: title.purchase.number,
    purchaseUpdatedAt: title.purchase.updatedAt.toISOString(),
    supplierId: title.purchase.supplierId,
    supplierName: title.purchase.supplier.tradeName ?? title.purchase.supplier.legalName,
    sequence: title.sequence,
    dueDate: toDateOnly(title.dueDate),
    amount,
    paidAmount,
    balance,
    stage: balance <= 0.001 ? 'PAID' : title.paymentStage,
    overdue: balance > 0.001 && toDateOnly(title.dueDate) < toDateOnly(new Date()),
    invoiceNumbers: [...invoices],
    received: titleIsMatched(title),
    advancePayment: title.advancePayment,
    advanceReason: title.advanceReason,
    hasAdvanceEvidence: title.advanceEvidencePath !== null,
    instruction: instruction
      ? {
          id: instruction.id,
          version: instruction.version,
          paymentChannel: instruction.paymentChannel,
          paymentReference: instruction.paymentReference,
          pixKeyType: instruction.pixKeyType,
          pixKey: instruction.pixKey,
          beneficiaryName: instruction.beneficiaryName,
          beneficiaryDocument: instruction.beneficiaryDocument,
          pixCopyPaste: instruction.pixCopyPaste,
          hasPixQrImage: instruction.pixQrStoragePath !== null,
          notes: instruction.notes,
          validationWarnings: jsonStringArray(instruction.validationWarnings),
          fingerprint: instruction.fingerprint,
          createdAt: instruction.createdAt.toISOString(),
        }
      : null,
    settlements: title.settlements.map((settlement) => ({
      id: settlement.id,
      amount: Number(settlement.amount),
      paidAt: toDateOnly(settlement.paidAt),
      transactionId: settlement.transactionId,
      proofFileName: settlement.proofFileName,
      createdByName: settlement.createdBy.name,
      createdAt: settlement.createdAt.toISOString(),
    })),
    approval: latestApproval
      ? {
          requestId: latestApproval.request.id,
          status: latestApproval.request.status,
          approvedCount: latestApproval.request.participants.filter(
            (participant) => participant.decision === 'APPROVED',
          ).length,
          requiredApprovals: latestApproval.request.requiredApprovals,
        }
      : null,
    updatedAt: title.updatedAt.toISOString(),
  };
}

function toGoodsReceipt(receipt: ReceiptRecord): GoodsReceipt {
  return {
    id: receipt.id,
    purchaseId: receipt.purchaseId,
    status: receipt.status,
    receivedAt: toDateOnly(receipt.receivedAt),
    confirmedById: receipt.confirmedById,
    confirmedByName: receipt.confirmedBy.name,
    notes: receipt.notes,
    items: receipt.items.map((item) => ({
      id: item.id,
      purchaseItemId: item.purchaseItemId,
      description: item.purchaseItem.description,
      quantity: Number(item.quantity),
    })),
    createdAt: receipt.createdAt.toISOString(),
  };
}

function toReceiptResponsibility(
  responsibility: ResponsibilityRecord,
): ReceiptResponsibility {
  return {
    id: responsibility.id,
    userId: responsibility.userId,
    userName: responsibility.user.name,
    costCenterId: responsibility.costCenterId,
    costCenterName: responsibility.costCenter?.name ?? null,
  };
}

function toFiscalIntegration(
  integration: {
    environment: FiscalIntegration['environment'];
    taxpayerDocument: string;
    certificateFingerprint: string;
    certificateExpiresAt: Date;
    status: FiscalIntegration['status'];
    manifestationMode: FiscalIntegration['manifestationMode'];
    lastNsu: string;
    maxNsu: string;
    lastSyncedAt: Date | null;
    nextPollAt: Date | null;
    lastError: string | null;
    updatedAt: Date;
  },
  rolloutMode: FiscalIntegration['rolloutMode'],
): FiscalIntegration {
  return {
    configured: true,
    rolloutMode,
    environment: integration.environment,
    taxpayerDocument: normalizeBrazilianDocument(integration.taxpayerDocument),
    certificateFingerprint: integration.certificateFingerprint,
    certificateExpiresAt: integration.certificateExpiresAt.toISOString(),
    status: integration.status,
    manifestationMode: integration.manifestationMode,
    lastNsu: integration.lastNsu,
    maxNsu: integration.maxNsu,
    lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
    nextPollAt: integration.nextPollAt?.toISOString() ?? null,
    lastError: integration.lastError,
    updatedAt: integration.updatedAt.toISOString(),
  };
}

function toFiscalDocumentSummary(
  document: FiscalDocumentSummaryRecord,
): FiscalDocumentSummary {
  return {
    id: document.id,
    invoiceNumber: document.invoiceNumber,
    accessKey: document.accessKey,
    source: document.source,
    fiscalModel: document.fiscalModel,
    issuerDocument: document.issuerDocument,
    recipientDocument: document.recipientDocument,
    issuedAt: document.fiscalIssuedAt?.toISOString() ?? null,
    total: document.fiscalTotal === null ? null : Number(document.fiscalTotal),
    matchStatus: document.matchStatus,
    manifestation: document.manifestation,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    matches: document.purchaseLinks.map((link) => ({
      id: link.id,
      invoiceDocumentId: document.id,
      purchaseId: link.purchaseId,
      purchaseNumber: link.purchase.number,
      status: link.matchStatus,
      reason: link.matchReason,
      createdAt: link.createdAt.toISOString(),
    })),
  };
}

function validateTitlesForApproval(
  cards: PayableKanbanCard[],
  mode: PaymentApprovalMode,
): void {
  if (!cards.length) throw new BadRequestException('Nenhum titulo elegivel foi encontrado.');
  if (mode === 'PER_TITLE' && cards.length !== 1) {
    throw new BadRequestException('No modo por titulo, envie uma parcela de cada vez.');
  }
  for (const card of cards) {
    if (!canRequestApproval(card)) {
      throw new BadRequestException(
        `O titulo ${card.purchaseNumber}/${card.sequence} ainda nao esta conciliado ou nao possui instrucao de pagamento.`,
      );
    }
  }
}

function canRequestApproval(card: PayableKanbanCard): boolean {
  return (
    card.stage === 'MATCHING_REQUIRED' &&
    card.balance > 0.001 &&
    card.instruction !== null &&
    (card.advancePayment
      ? card.hasAdvanceEvidence && Boolean(card.advanceReason)
      : card.received && card.invoiceNumbers.length > 0)
  );
}

function assertAdvanceSelection(cards: PayableKanbanCard[]): void {
  const advances = cards.filter((card) => card.advancePayment);
  if (advances.length > 0 && (advances.length !== cards.length || cards.length !== 1)) {
    throw new BadRequestException(
      'Cada adiantamento deve ser enviado sozinho para aprovacao extraordinaria.',
    );
  }
}

function requireSinglePurchase<T extends { purchaseId: string }>(values: T[]): string {
  if (!values.length) throw new BadRequestException('Nenhum titulo foi selecionado.');
  const purchaseIds = new Set(values.map((value) => value.purchaseId));
  if (purchaseIds.size !== 1) {
    throw new BadRequestException('Uma aprovacao agrupada nao pode misturar pedidos.');
  }
  return values[0]!.purchaseId;
}

function stripOrganization<T extends { organizationId: string }>(
  value: T,
): Omit<T, 'organizationId'> {
  const { organizationId: _organizationId, ...result } = value;
  return result;
}

function stripDemoApprovalTask(task: DemoApprovalTask): PaymentApprovalTask {
  const {
    organizationId: _organizationId,
    participantUserIds: _participantUserIds,
    ...result
  } = task;
  return result;
}

function legacyDemoInstruction(
  row: {
    paymentChannel: PayableKanbanCard['instruction'] extends infer _T
      ? 'PIX' | 'CARD_LINK' | 'BOLETO' | 'BANK_TRANSFER' | 'OTHER' | null
      : never;
    paymentNotes: string | null;
    paymentReference: string | null;
  },
): DemoInstruction {
  if (!row.paymentChannel) return null;
  const createdAt = new Date(0).toISOString();
  const raw = `${row.paymentChannel}|${row.paymentReference ?? ''}|${row.paymentNotes ?? ''}`;
  return {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    paymentChannel: row.paymentChannel,
    paymentReference: row.paymentReference,
    pixKeyType: null,
    pixKey: null,
    beneficiaryName: null,
    beneficiaryDocument: null,
    pixCopyPaste: row.paymentChannel === 'PIX' ? row.paymentReference : null,
    hasPixQrImage: false,
    notes: row.paymentNotes,
    validationWarnings: ['Instrucao migrada dos campos de compatibilidade.'],
    fingerprint: createHash('sha256').update(raw).digest('hex'),
    createdAt,
  };
}

function validateReceiptQuantities(
  purchaseItems: Array<{ id: string; description: string; quantity: unknown }>,
  previousItems: Array<{ purchaseItemId: string; quantity: unknown }>,
  requestedItems: CreateGoodsReceiptInput['items'],
): void {
  const requestedByItem = new Map<string, number>();
  for (const requested of requestedItems) {
    requestedByItem.set(
      requested.purchaseItemId,
      (requestedByItem.get(requested.purchaseItemId) ?? 0) + requested.quantity,
    );
  }
  for (const [purchaseItemId, requested] of requestedByItem) {
    const purchaseItem = purchaseItems.find((item) => item.id === purchaseItemId);
    if (!purchaseItem) throw new BadRequestException('Um item recebido nao pertence ao pedido.');
    const previous = previousItems
      .filter((item) => item.purchaseItemId === purchaseItemId)
      .reduce((sum, item) => sum + numeric(item.quantity), 0);
    if (previous + requested > numeric(purchaseItem.quantity) + 0.0001) {
      throw new BadRequestException(
        `A quantidade recebida excede o pedido para ${purchaseItem.description}.`,
      );
    }
  }
}

function validatePaymentProof(file: UploadedBinary): void {
  if (!file?.buffer?.length) throw new BadRequestException('Anexe o comprovante do pagamento.');
  if (file.size > 10 * 1024 * 1024) {
    throw new BadRequestException('O comprovante deve ter no maximo 10 MB.');
  }
  const pdf = file.buffer.subarray(0, 4).toString('ascii') === '%PDF';
  const png = file.buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const jpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  if (!pdf && !png && !jpeg) {
    throw new BadRequestException('O comprovante precisa ser PDF, PNG ou JPEG valido.');
  }
  if (
    (pdf && file.mimetype !== 'application/pdf') ||
    (png && file.mimetype !== 'image/png') ||
    (jpeg && !['image/jpeg', 'image/jpg'].includes(file.mimetype))
  ) {
    throw new BadRequestException('O tipo declarado do comprovante nao corresponde ao arquivo.');
  }
}

function validateAdvanceEvidence(file: UploadedBinary): void {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Anexe o documento que justifica o adiantamento.');
  }
  validatePaymentProof(file);
}

function validateCertificateFile(file: UploadedBinary): void {
  if (!file?.buffer?.length) throw new BadRequestException('Anexe o certificado A1 em PFX ou P12.');
  if (file.size > 5 * 1024 * 1024) {
    throw new BadRequestException('O certificado A1 deve ter no maximo 5 MB.');
  }
  if (file.buffer[0] !== 0x30 || !/\.(pfx|p12)$/i.test(file.originalname)) {
    throw new BadRequestException('O certificado precisa ser um arquivo PFX ou P12 valido.');
  }
}

function validateQrImage(file: UploadedBinary): void {
  if (!file?.buffer?.length) throw new BadRequestException('Anexe uma imagem do QR Pix.');
  if (file.size > 5 * 1024 * 1024) {
    throw new BadRequestException('A imagem do QR Pix deve ter no maximo 5 MB.');
  }
  const png = file.buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const jpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  if (!png && !jpeg) throw new BadRequestException('Use uma imagem PNG ou JPEG valida para o QR Pix.');
}

function assertCertificateValid(expiresAt: Date): void {
  if (expiresAt.getTime() <= Date.now()) {
    throw new ServiceUnavailableException(
      'O certificado A1 esta vencido. Substitua-o antes de consultar a SEFAZ.',
    );
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function temporaryFileAccess(url: string): { expiresAt: string; url: string } {
  return { expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), url };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    return Number(String(value));
  }
  return 0;
}

function moneySum(values: unknown[]): number {
  return roundMoney(values.reduce<number>((sum, value) => sum + numeric(value), 0));
}

function quantitySum(values: unknown[]): number {
  return roundQuantity(values.reduce<number>((sum, value) => sum + numeric(value), 0));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1_000);
  return 'Falha desconhecida durante a sincronizacao fiscal.';
}

function recipientForChannel(
  user: { email: string; phone?: string | null },
  channel: 'EMAIL' | 'WHATSAPP',
): string {
  return channel === 'EMAIL' ? user.email.trim() : user.phone?.trim() ?? '';
}

function participatedInPurchaseApproval(
  userId: string,
  request: {
    purchase: {
      approvalRequests: Array<{
        submittedById: string;
        participants: Array<{ userId: string; decision: string }>;
      }>;
    };
  },
): boolean {
  return request.purchase.approvalRequests.some(
    (approval) =>
      approval.submittedById === userId ||
      approval.participants.some(
        (participant) => participant.userId === userId && participant.decision === 'APPROVED',
      ),
  );
}

async function invalidatePendingPaymentApprovals(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  installmentId: string,
  actorUserId: string,
): Promise<void> {
  const pending = await transaction.paymentApprovalRequest.findMany({
    where: {
      organizationId,
      status: { in: ['PENDING', 'APPROVED'] },
      titles: { some: { installmentId } },
    },
    include: { titles: true },
  });
  if (!pending.length) return;
  const requestIds = pending.map((request) => request.id);
  const installmentIds = [...new Set(pending.flatMap((request) => request.titles.map((title) => title.installmentId)))];
  await transaction.paymentApprovalRequest.updateMany({
    where: {
      organizationId,
      id: { in: requestIds },
      status: { in: ['PENDING', 'APPROVED'] },
    },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
  });
  await transaction.installment.updateMany({
    where: {
      organizationId,
      id: { in: installmentIds },
      paymentStage: { in: ['AWAITING_APPROVAL', 'READY_TO_PAY', 'PARTIALLY_PAID'] },
    },
    data: { paymentStage: 'MATCHING_REQUIRED' },
  });
  await transaction.auditLog.createMany({
    data: pending.map((request) => ({
      actorUserId,
      organizationId,
      action: 'UPDATE' as const,
      resource: 'payment_approval_request',
      resourceId: request.id,
      metadata: {
        installmentId,
        reason: 'PAYMENT_DATA_CHANGED',
        status: 'CANCELLED',
      },
    })),
  });
}

async function createPaymentResolutionNotification(
  transaction: Prisma.TransactionClient,
  input: {
    channel: 'EMAIL' | 'WHATSAPP';
    eventType: string;
    organizationId: string;
    payload: Prisma.InputJsonValue;
    recipient: string;
    requestId: string;
    subject: string;
  },
): Promise<void> {
  if (!input.recipient) return;
  await transaction.notificationOutbox.create({
    data: {
      organizationId: input.organizationId,
      deduplicationKey: `${input.requestId}:${input.eventType.toLowerCase()}`,
      eventType: input.eventType,
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject,
      payload: input.payload,
    },
  });
}

async function refreshPaymentEligibility(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  purchaseId: string,
  actorUserId: string,
): Promise<void> {
  const settings = await transaction.paymentSettings.findUnique({ where: { organizationId } });
  const titles = await transaction.installment.findMany({
    where: {
      organizationId,
      purchaseId,
      paymentStage: 'MATCHING_REQUIRED',
    },
    include: titleInclude,
  });
  if (settings?.approvalMode !== 'DISABLED') return;
  const eligibleIds = titles
    .filter((title) => title.instructionSnapshots.length > 0 && titleIsMatched(title))
    .map((title) => title.id);
  if (eligibleIds.length) {
    await transaction.installment.updateMany({
      where: { organizationId, id: { in: eligibleIds }, paymentStage: 'MATCHING_REQUIRED' },
      data: { paymentStage: 'READY_TO_PAY' },
    });
    await transaction.auditLog.createMany({
      data: eligibleIds.map((installmentId) => ({
        actorUserId,
        organizationId,
        action: 'UPDATE' as const,
        resource: 'payment_approval_skipped',
        resourceId: installmentId,
        metadata: {
          mode: 'DISABLED',
          reason: 'RECEIPT_RECONCILIATION_COMPLETED',
        },
      })),
    });
  }
}

async function completePurchaseIfEligible(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  purchaseId: string,
  actorUserId: string,
): Promise<void> {
  const purchase = await transaction.purchase.findFirst({
    where: { id: purchaseId, organizationId },
    include: {
      installments: true,
      items: {
        include: { receiptItems: { where: { receipt: { status: 'CONFIRMED' } } } },
      },
    },
  });
  if (!purchase || purchase.workflowStage !== 'RECEIVED' || !purchase.installments.length) return;
  const fullyReceived = purchase.items.every(
    (item) =>
      quantitySum(item.receiptItems.map((receiptItem) => receiptItem.quantity)) >=
      Number(item.quantity) - 0.0001,
  );
  if (!fullyReceived || purchase.installments.some((installment) => installment.paymentStage !== 'PAID')) {
    return;
  }
  await transaction.purchase.update({
    where: { id: purchaseId },
    data: { workflowStage: 'COMPLETED' },
  });
  await transaction.purchaseStageHistory.create({
    data: {
      organizationId,
      purchaseId,
      fromStage: 'RECEIVED',
      toStage: 'COMPLETED',
      changedById: actorUserId,
      reason: 'Pedido integralmente recebido, conciliado e sem saldo financeiro.',
    },
  });
}

async function assignInstallmentsToFiscalDocument(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  purchaseId: string,
  fiscalDocumentId: string,
  fiscalTotal: number,
): Promise<void> {
  const titles = await transaction.installment.findMany({
    where: { organizationId, purchaseId, fiscalDocumentId: null },
    orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
  });
  const target = Math.round(fiscalTotal * 100);
  let sum = 0;
  const selected: string[] = [];
  for (const title of titles) {
    const cents = Math.round(Number(title.amount) * 100);
    if (sum + cents > target) break;
    sum += cents;
    selected.push(title.id);
    if (sum === target) break;
  }
  if (sum !== target || !selected.length) return;
  await transaction.installment.updateMany({
    where: { organizationId, id: { in: selected }, fiscalDocumentId: null },
    data: { fiscalDocumentId },
  });
}

async function enqueueFiscalDivergenceNotification(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  documentId: string,
  metadata: NfeMetadata,
): Promise<void> {
  const [paymentSettings, approvalSettings] = await Promise.all([
    transaction.paymentSettings.findUnique({ where: { organizationId } }),
    transaction.approvalSettings.findUnique({ where: { organizationId } }),
  ]);
  const channel = paymentSettings?.notificationChannel ?? approvalSettings?.financeChannel;
  const recipient = paymentSettings?.notificationRecipient ?? approvalSettings?.financeRecipient;
  if (!channel || !recipient) return;
  await transaction.notificationOutbox.create({
    data: {
      organizationId,
      deduplicationKey: `${documentId}:fiscal-review-required`,
      eventType: 'FISCAL_REVIEW_REQUIRED',
      channel,
      recipient,
      subject: `NF-e ${metadata.invoiceNumber ?? metadata.accessKey ?? documentId} requer revisao`,
      payload: {
        accessKey: metadata.accessKey,
        documentId,
        invoiceNumber: metadata.invoiceNumber,
        issuerDocument: metadata.issuerDocument,
        total: metadata.total,
      },
    },
  });
}

async function matchFiscalItemsByDescription(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  purchase: { items: Array<{ id: string; description: string; unitPrice: unknown; negotiatedPrice: unknown }> },
  document: { id: string; fiscalItems: Array<{ id: string; description: string; unitPrice: unknown }> },
): Promise<void> {
  for (const fiscalItem of document.fiscalItems) {
    const candidates = purchase.items.filter(
      (purchaseItem) =>
        normalize(purchaseItem.description) === normalize(fiscalItem.description) &&
        Math.abs(
          numeric(purchaseItem.negotiatedPrice ?? purchaseItem.unitPrice) - numeric(fiscalItem.unitPrice),
        ) <= 0.0001,
    );
    if (candidates.length === 1) {
      await transaction.fiscalDocumentItem.update({
        where: { id: fiscalItem.id },
        data: { matchedPurchaseItemId: candidates[0]!.id },
      });
    }
  }
}

type NfeMetadataItem = {
  description: string;
  itemCode: string | null;
  purchaseReference: string | null;
  quantity: number;
  sequence: number;
  total: number;
  unit: string | null;
  unitPrice: number;
};

type NfeMetadata = {
  accessKey: string | null;
  fiscalModel: string | null;
  invoiceNumber: string | null;
  issuerDocument: string | null;
  issuedAt: Date | null;
  items: NfeMetadataItem[];
  purchaseReferences: string[];
  recipientDocument: string | null;
  total: number | null;
};

function extractNfeMetadata(xml: Buffer): NfeMetadata {
  let parsed: unknown;
  try {
    parsed = fiscalParser.parse(xml.toString('utf8').replace(/^\uFEFF/, '')) as unknown;
  } catch {
    throw new BadRequestException('A SEFAZ retornou um XML fiscal invalido.');
  }
  const infNfe = findFiscalObject(parsed, 'infNFe');
  const summary = findFiscalObject(parsed, 'resNFe');
  if (!infNfe && !summary) {
    return {
      accessKey: null,
      fiscalModel: null,
      invoiceNumber: null,
      issuerDocument: null,
      issuedAt: null,
      items: [],
      purchaseReferences: [],
      recipientDocument: null,
      total: null,
    };
  }
  if (!infNfe) {
    const accessKey = normalizedAccessKey(fiscalText(summary?.chNFe));
    return {
      accessKey,
      fiscalModel: accessKey?.slice(20, 22) ?? '55',
      invoiceNumber: accessKey ? String(Number(accessKey.slice(25, 34))) : null,
      issuerDocument: normalizedDocument(fiscalText(summary?.CNPJ ?? summary?.CPF)),
      issuedAt: fiscalDate(fiscalText(summary?.dhEmi)),
      items: [],
      purchaseReferences: [],
      recipientDocument: null,
      total: fiscalNumber(summary?.vNF),
    };
  }
  const ide = fiscalRecord(infNfe.ide);
  const emit = fiscalRecord(infNfe.emit);
  const dest = fiscalRecord(infNfe.dest);
  const total = fiscalRecord(fiscalRecord(infNfe.total).ICMSTot);
  const items = fiscalArray(infNfe.det)
    .map((entry, index): NfeMetadataItem | null => {
      const detail = fiscalRecord(entry);
      const product = fiscalRecord(detail.prod);
      const description = fiscalText(product.xProd);
      const quantity = fiscalNumber(product.qCom);
      const unitPrice = fiscalNumber(product.vUnCom);
      const lineTotal = fiscalNumber(product.vProd);
      if (!description || quantity === null || unitPrice === null || lineTotal === null) return null;
      const declaredSequence = Number(fiscalText(detail['@_nItem']));
      return {
        sequence: Number.isInteger(declaredSequence) && declaredSequence > 0 ? declaredSequence : index + 1,
        itemCode: fiscalText(product.cProd).slice(0, 80) || null,
        purchaseReference: fiscalText(product.xPed).slice(0, 80) || null,
        description: description.slice(0, 240),
        quantity,
        unit: fiscalText(product.uCom).slice(0, 30) || null,
        unitPrice,
        total: lineTotal,
      };
    })
    .filter((item): item is NfeMetadataItem => item !== null);
  const identifier = fiscalText(infNfe['@_Id']);
  const accessKey = normalizedAccessKey(identifier);
  const references = items
    .map((item) => item.purchaseReference)
    .filter((value): value is string => Boolean(value));
  const additional = findFiscalObject(infNfe, 'infAdic');
  const additionalText = [fiscalText(additional?.infCpl), fiscalText(additional?.infAdFisco)]
    .filter(Boolean)
    .join(' ');
  if (additionalText) references.push(additionalText);
  const purchaseNode = findFiscalObject(infNfe, 'compra');
  const purchaseReference = fiscalText(purchaseNode?.xPed);
  if (purchaseReference) references.push(purchaseReference);
  return {
    accessKey,
    fiscalModel: fiscalText(ide.mod) || accessKey?.slice(20, 22) || null,
    invoiceNumber: fiscalText(ide.nNF) || null,
    issuerDocument: normalizedDocument(fiscalText(emit.CNPJ ?? emit.CPF)),
    recipientDocument: normalizedDocument(fiscalText(dest.CNPJ ?? dest.CPF)),
    issuedAt: fiscalDate(fiscalText(ide.dhEmi ?? ide.dEmi)),
    total: fiscalNumber(total.vNF),
    items,
    purchaseReferences: [...new Set(references)],
  };
}

function findFiscalObject(
  value: unknown,
  key: string,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 30) return null;
  const record = fiscalRecordOrNull(value);
  if (!record) return null;
  for (const [candidate, nested] of Object.entries(record)) {
    if (stripNamespace(candidate).toLowerCase() === key.toLowerCase()) {
      return fiscalRecordOrNull(nested);
    }
  }
  for (const nested of Object.values(record)) {
    for (const item of fiscalArray(nested)) {
      const result = findFiscalObject(item, key, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function fiscalRecord(value: unknown): Record<string, unknown> {
  return fiscalRecordOrNull(value) ?? {};
}

function fiscalRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fiscalArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function fiscalText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const record = fiscalRecordOrNull(value);
  return record ? fiscalText(record['#text']) : '';
}

function fiscalNumber(value: unknown): number | null {
  const parsed = Number(fiscalText(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function fiscalDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedAccessKey(value: string): string | null {
  const accessKey = normalizeNfeAccessKey(value);
  return /^[A-Z0-9]{44}$/.test(accessKey) ? accessKey : null;
}

function normalizedDocument(value: string): string | null {
  const document = normalizeBrazilianDocument(value);
  if (/^\d{11}$/.test(document)) return document;
  return isValidCnpj(document) ? document : null;
}

function stripNamespace(value: string): string {
  return value.split(':').at(-1) ?? value;
}
