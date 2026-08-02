import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@compras/database';
import type {
  AuditAction,
  AuditChange,
  PurchaseAuditFilters,
  PurchaseAuditEventType,
  PurchaseAuditPage,
} from '@compras/contracts';

import { DatabaseService } from '../database/database.service.js';

const purchaseEventTypes = [
  { value: 'purchase', label: 'Dados do pedido' },
  { value: 'purchase_workflow_stage', label: 'Etapa do pedido' },
  { value: 'purchase_status', label: 'Situacao do pedido' },
  { value: 'purchase_approval', label: 'Solicitacao de aprovacao' },
  { value: 'purchase_approval_decision', label: 'Decisao de aprovacao' },
  { value: 'purchase_invoice', label: 'Referencia fiscal' },
] as const;

const purchaseResources = purchaseEventTypes.map((option) => option.value);
const directPurchaseResources = new Set([
  'purchase',
  'purchase_workflow_stage',
  'purchase_status',
  'purchase_invoice',
]);

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { id: true; name: true } } };
}>;

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listPurchaseEvents(
    organizationId: string,
    filters: PurchaseAuditFilters,
  ): Promise<PurchaseAuditPage> {
    if (!this.database.enabled) {
      return emptyPage(filters);
    }

    const prisma = this.database.prisma;
    const targetPurchase = filters.purchaseDisplayNumber
      ? await prisma.purchase.findFirst({
          where: {
            organizationId,
            displaySequence: filters.purchaseDisplayNumber,
          },
          select: { id: true },
        })
      : null;

    if (filters.purchaseDisplayNumber && !targetPurchase) {
      const actors = await this.listActors(organizationId);
      return { ...emptyPage(filters), actors };
    }

    const requestIds = targetPurchase
      ? (
          await prisma.purchaseApprovalRequest.findMany({
            where: { organizationId, purchaseId: targetPurchase.id },
            select: { id: true },
          })
        ).map((request) => request.id)
      : [];

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      resource: filters.eventType ?? { in: purchaseResources },
      ...(filters.actorUserId && { actorUserId: filters.actorUserId }),
      ...(filters.action && { action: filters.action }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: businessDateStart(filters.dateFrom) }),
          ...(filters.dateTo && { lte: businessDateEnd(filters.dateTo) }),
        },
      }),
      ...(targetPurchase && {
        OR: [
          {
            resource: { in: [...directPurchaseResources] },
            resourceId: targetPurchase.id,
          },
          { metadata: { path: ['purchaseId'], equals: targetPurchase.id } },
          ...requestIds.map((requestId) => ({
            metadata: { path: ['requestId'], equals: requestId },
          })),
        ],
      }),
    };

    const skip = (filters.page - 1) * filters.pageSize;
    const [rows, total, actors] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filters.pageSize,
      }),
      prisma.auditLog.count({ where }),
      this.listActors(organizationId),
    ]);

    const items = await enrichEvents(prisma, organizationId, rows);
    return {
      items,
      actors,
      eventTypes: [...purchaseEventTypes],
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.pageSize),
    };
  }

  private async listActors(organizationId: string) {
    if (!this.database.enabled) return [];
    const users = await this.database.prisma.user.findMany({
      where: {
        auditEvents: {
          some: {
            organizationId,
            resource: { in: purchaseResources },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return users;
  }
}

async function enrichEvents(
  prisma: DatabaseService['prisma'],
  organizationId: string,
  rows: AuditRow[],
): Promise<PurchaseAuditPage['items']> {
  const approvalRequestIds = new Set<string>();
  const purchaseIds = new Set<string>();

  for (const row of rows) {
    const metadata = asObject(row.metadata);
    if (directPurchaseResources.has(row.resource) && row.resourceId) {
      purchaseIds.add(row.resourceId);
    }
    const metadataPurchaseId = textValue(metadata?.['purchaseId']);
    if (metadataPurchaseId) purchaseIds.add(metadataPurchaseId);
    const requestId =
      textValue(metadata?.['requestId']) ??
      (row.resource === 'purchase_approval' ? row.resourceId : null);
    if (requestId) approvalRequestIds.add(requestId);
  }

  const approvalRequests = approvalRequestIds.size
    ? await prisma.purchaseApprovalRequest.findMany({
        where: {
          organizationId,
          id: { in: [...approvalRequestIds] },
        },
        select: { id: true, purchaseId: true },
      })
    : [];
  const purchaseByRequest = new Map(
    approvalRequests.map((request) => [request.id, request.purchaseId]),
  );
  for (const request of approvalRequests) purchaseIds.add(request.purchaseId);

  const purchases = purchaseIds.size
    ? await prisma.purchase.findMany({
        where: { organizationId, id: { in: [...purchaseIds] } },
        select: { id: true, displaySequence: true, number: true },
      })
    : [];
  const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));

  return rows.map((row) => {
    const metadata = asObject(row.metadata);
    const requestId =
      textValue(metadata?.['requestId']) ??
      (row.resource === 'purchase_approval' ? row.resourceId : null);
    const purchaseId =
      (directPurchaseResources.has(row.resource) ? row.resourceId : null) ??
      textValue(metadata?.['purchaseId']) ??
      (requestId ? purchaseByRequest.get(requestId) ?? null : null);
    const purchase = purchaseId ? purchaseById.get(purchaseId) : null;
    return {
      id: row.id,
      action: row.action,
      eventType: row.resource as PurchaseAuditEventType,
      eventLabel: eventLabel(row.resource, metadata),
      purchaseId: purchase?.id ?? null,
      purchaseDisplayNumber: purchase?.displaySequence ?? null,
      purchaseNumber: purchase?.number ?? null,
      actorUserId: row.actorUserId,
      actorName:
        row.actor?.name ?? (row.actorUserId ? 'Usuario removido' : 'Automacao do sistema'),
      reason: textValue(metadata?.['reason']) ?? textValue(metadata?.['comment']),
      changes: auditChanges(row.action, row.resource, metadata),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

function auditChanges(
  action: AuditAction,
  resource: string,
  metadata: Record<string, unknown> | null,
): AuditChange[] {
  if (!metadata) return [];
  const before = asObject(metadata['before']);
  const after = asObject(metadata['after']);
  if (before || after) {
    const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    return [...fields]
      .filter((field) => !sameValue(before?.[field], after?.[field]))
      .map((field) => ({
        field,
        before: displayValue(before?.[field]),
        after: displayValue(after?.[field]),
      }));
  }

  if ('from' in metadata || 'to' in metadata) {
    return [
      {
        field: inferredTransitionField(resource),
        before: displayValue(metadata['from']),
        after: displayValue(metadata['to']),
      },
    ];
  }

  return Object.entries(metadata)
    .filter(([field]) => !technicalFields.has(field))
    .map(([field, value]) => ({
      field,
      before: action === 'DELETE' ? displayValue(value) : null,
      after: action === 'DELETE' ? null : displayValue(value),
    }));
}

const technicalFields = new Set([
  'expectedUpdatedAt',
  'purchaseId',
  'requestId',
  'ruleId',
]);

function eventLabel(resource: string, metadata: Record<string, unknown> | null): string {
  if (resource === 'purchase') return 'Dados do pedido';
  if (resource === 'purchase_workflow_stage') return 'Etapa do pedido alterada';
  if (resource === 'purchase_status') return 'Situacao do pedido alterada';
  if (resource === 'purchase_approval') return 'Pedido enviado para aprovacao';
  if (resource === 'purchase_approval_decision') {
    const decision = textValue(metadata?.['decision']);
    if (decision === 'APPROVED') return 'Pedido aprovado';
    if (decision === 'REJECTED') return 'Pedido reprovado';
    return 'Decisao de aprovacao';
  }
  if (resource === 'purchase_invoice') return 'Referencia fiscal alterada';
  return purchaseEventTypes.find((option) => option.value === resource)?.label ?? resource;
}

function inferredTransitionField(resource: string): string {
  if (resource === 'purchase_workflow_stage') return 'workflowStage';
  if (resource === 'purchase_status') return 'status';
  return 'value';
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function displayValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function businessDateStart(value: string): Date {
  return new Date(`${value}T00:00:00.000-03:00`);
}

function businessDateEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999-03:00`);
}

function emptyPage(filters: PurchaseAuditFilters): PurchaseAuditPage {
  return {
    items: [],
    actors: [],
    eventTypes: [...purchaseEventTypes],
    page: filters.page,
    pageSize: filters.pageSize,
    total: 0,
    totalPages: 0,
  };
}
