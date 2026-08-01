import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChangeReceivableStatusInput,
  CreateReceivableInput,
  CreateReceivableSettlementInput,
  Receivable,
  ReceivableFilters,
  ReceivablesReport,
  UpdateReceivableInput,
} from '@compras/contracts';
import { Prisma, type PrismaClient } from '@compras/database';

import { currentBusinessIsoDate } from '../common/business-date.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { ReceivablesRepository } from './receivables.repository.js';

const include = {
  settlements: {
    include: { createdBy: true },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.ReceivableInclude;

type RecordWithSettlements = Prisma.ReceivableGetPayload<{ include: typeof include }>;

export class PrismaReceivablesRepository extends ReceivablesRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async list(
    organizationId: string,
    filters: ReceivableFilters,
  ): Promise<Receivable[]> {
    const today = currentBusinessIsoDate();
    const rows = await this.prisma.receivable.findMany({
      where: receivableWhere(organizationId, filters, today),
      include,
      orderBy: [{ dueDate: 'asc' }, { customerName: 'asc' }],
    });
    return rows.map((row) => toReceivable(row, today));
  }

  async report(
    organizationId: string,
    filters: ReceivableFilters,
  ): Promise<ReceivablesReport> {
    const rows = await this.list(organizationId, filters);
    return buildReport(rows, 'DATABASE');
  }

  async create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateReceivableInput,
  ): Promise<Receivable> {
    const id = await this.prisma.$transaction(async (transaction) => {
      const receivable = await transaction.receivable.create({
        data: {
          organizationId,
          createdById: actor.id,
          customerName: input.customerName,
          customerDocument: input.customerDocument,
          description: input.description,
          category: input.category,
          documentNumber: input.documentNumber,
          invoiceNumber: input.invoiceNumber,
          issuedAt: input.issuedAt ? date(input.issuedAt) : null,
          dueDate: date(input.dueDate),
          expectedAt: input.expectedAt ? date(input.expectedAt) : null,
          amount: input.amount,
          source: input.source,
          notes: input.notes,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'CREATE',
          resource: 'receivable',
          resourceId: receivable.id,
          metadata: {
            amount: input.amount,
            customerName: input.customerName,
            dueDate: input.dueDate,
          },
        },
      });
      return receivable.id;
    });
    return this.require(organizationId, id);
  }

  async update(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateReceivableInput,
  ): Promise<Receivable> {
    const current = await this.requireRecord(organizationId, id);
    if (current.status === 'CANCELLED') {
      throw new BadRequestException('Reative a conta antes de editar.');
    }
    const receivedAmount = settlementTotal(current);
    if (input.amount !== undefined && input.amount + 0.001 < receivedAmount) {
      throw new BadRequestException('O valor nao pode ser menor que o total ja recebido.');
    }
    const issuedAt = input.issuedAt === undefined ? isoDate(current.issuedAt) : input.issuedAt;
    const dueDate = input.dueDate ?? isoDate(current.dueDate)!;
    if (issuedAt && dueDate < issuedAt) {
      throw new BadRequestException('O vencimento deve ser igual ou posterior a emissao.');
    }
    const { expectedUpdatedAt: _expectedUpdatedAt, ...changes } = input;
    const normalizedChanges = {
      ...changes,
      ...(input.issuedAt !== undefined && {
        issuedAt: input.issuedAt ? date(input.issuedAt) : null,
      }),
      ...(input.dueDate !== undefined && { dueDate: date(input.dueDate) }),
      ...(input.expectedAt !== undefined && {
        expectedAt: input.expectedAt ? date(input.expectedAt) : null,
      }),
      ...(input.amount !== undefined && {
        status: statusFor(input.amount, receivedAmount),
      }),
    };
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.receivable.updateMany({
        where: {
          id,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: normalizedChanges,
      });
      if (updated.count !== 1) throw conflict();
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'receivable',
          resourceId: id,
          metadata: changes,
        },
      });
    });
    return this.require(organizationId, id);
  }

  async settle(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: CreateReceivableSettlementInput,
  ): Promise<Receivable> {
    const current = await this.requireRecord(organizationId, id);
    if (current.status === 'CANCELLED') {
      throw new BadRequestException('Uma conta cancelada nao pode receber baixa.');
    }
    const alreadyReceived = settlementTotal(current);
    const balance = round(Number(current.amount) - alreadyReceived);
    if (input.amount > balance + 0.001) {
      throw new BadRequestException('A baixa nao pode superar o saldo em aberto.');
    }
    try {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.receivable.updateMany({
          where: {
            id,
            organizationId,
            updatedAt: new Date(input.expectedUpdatedAt),
            status: { not: 'CANCELLED' },
          },
          data: {
            status: statusFor(Number(current.amount), alreadyReceived + input.amount),
          },
        });
        if (updated.count !== 1) throw conflict();
        const settlement = await transaction.receivableSettlement.create({
          data: {
            organizationId,
            receivableId: id,
            amount: input.amount,
            receivedAt: date(input.receivedAt),
            transactionId: input.transactionId,
            notes: input.notes,
            createdById: actor.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'receivable_settlement',
            resourceId: settlement.id,
            metadata: {
              amount: input.amount,
              receivableId: id,
              receivedAt: input.receivedAt,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (isUniqueConstraint(error)) {
        throw new ConflictException('Esse identificador de recebimento ja foi registrado.');
      }
      throw error;
    }
    return this.require(organizationId, id);
  }

  async changeStatus(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangeReceivableStatusInput,
  ): Promise<Receivable> {
    const current = await this.requireRecord(organizationId, id);
    if (current.status === input.status) return toReceivable(current, currentBusinessIsoDate());
    if (input.status === 'CANCELLED' && current.settlements.length) {
      throw new BadRequestException('Uma conta com recebimentos nao pode ser cancelada.');
    }
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.receivable.updateMany({
        where: {
          id,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: { status: input.status },
      });
      if (updated.count !== 1) throw conflict();
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'receivable_status',
          resourceId: id,
          metadata: { from: current.status, to: input.status },
        },
      });
    });
    return this.require(organizationId, id);
  }

  private async requireRecord(organizationId: string, id: string) {
    const row = await this.prisma.receivable.findFirst({
      where: { id, organizationId },
      include,
    });
    if (!row) throw new NotFoundException('Conta a receber nao encontrada.');
    return row;
  }

  private async require(organizationId: string, id: string): Promise<Receivable> {
    return toReceivable(await this.requireRecord(organizationId, id), currentBusinessIsoDate());
  }
}

function receivableWhere(
  organizationId: string,
  filters: ReceivableFilters,
  today: string,
): Prisma.ReceivableWhereInput {
  return {
    organizationId,
    ...(filters.status === 'OVERDUE'
      ? {
          status: { in: ['OPEN', 'PARTIALLY_RECEIVED'] },
          dueDate: { lt: date(today) },
        }
      : filters.status
        ? { status: filters.status }
        : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          dueDate: {
            ...(filters.dateFrom && { gte: date(filters.dateFrom) }),
            ...(filters.dateTo && { lte: date(filters.dateTo) }),
          },
        }
      : {}),
    ...(filters.search && {
      OR: [
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { customerDocument: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { documentNumber: { contains: filters.search, mode: 'insensitive' } },
        { invoiceNumber: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
  };
}

function toReceivable(row: RecordWithSettlements, today: string): Receivable {
  const receivedAmount = settlementTotal(row);
  const amount = Number(row.amount);
  const balance = round(Math.max(0, amount - receivedAmount));
  return {
    id: row.id,
    customerName: row.customerName,
    customerDocument: row.customerDocument,
    description: row.description,
    category: row.category,
    documentNumber: row.documentNumber,
    invoiceNumber: row.invoiceNumber,
    issuedAt: isoDate(row.issuedAt),
    dueDate: isoDate(row.dueDate)!,
    expectedAt: isoDate(row.expectedAt),
    amount,
    receivedAmount,
    balance,
    status: row.status,
    overdue:
      row.status !== 'RECEIVED' &&
      row.status !== 'CANCELLED' &&
      isoDate(row.dueDate)! < today,
    source: row.source,
    notes: row.notes,
    settlements: row.settlements.map((settlement) => ({
      id: settlement.id,
      amount: Number(settlement.amount),
      receivedAt: isoDate(settlement.receivedAt)!,
      transactionId: settlement.transactionId,
      notes: settlement.notes,
      createdById: settlement.createdById,
      createdByName: settlement.createdBy.name,
      createdAt: settlement.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildReport(
  rows: Receivable[],
  dataSource: ReceivablesReport['dataSource'],
): ReceivablesReport {
  const today = currentBusinessIsoDate();
  const dueLimit = new Date(`${today}T00:00:00.000Z`);
  dueLimit.setUTCDate(dueLimit.getUTCDate() + 30);
  const dueIn30Days = dueLimit.toISOString().slice(0, 10);
  return {
    dataSource,
    generatedAt: new Date().toISOString(),
    totals: {
      open: round(rows.reduce((sum, row) => sum + row.balance, 0)),
      overdue: round(
        rows.filter((row) => row.overdue).reduce((sum, row) => sum + row.balance, 0),
      ),
      dueIn30Days: round(
        rows
          .filter(
            (row) =>
              row.status !== 'CANCELLED' &&
              row.status !== 'RECEIVED' &&
              row.dueDate >= today &&
              row.dueDate <= dueIn30Days,
          )
          .reduce((sum, row) => sum + row.balance, 0),
      ),
      received: round(rows.reduce((sum, row) => sum + row.receivedAmount, 0)),
      rowCount: rows.length,
    },
    rows,
  };
}

function settlementTotal(row: Pick<RecordWithSettlements, 'settlements'>): number {
  return round(row.settlements.reduce((sum, settlement) => sum + Number(settlement.amount), 0));
}

function statusFor(amount: number, received: number) {
  if (received >= amount - 0.001) return 'RECEIVED' as const;
  return received > 0 ? ('PARTIALLY_RECEIVED' as const) : ('OPEN' as const);
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function conflict() {
  return new ConflictException('A conta foi alterada por outro usuario. Atualize os dados.');
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
