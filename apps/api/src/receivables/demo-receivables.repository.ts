import { randomUUID } from 'node:crypto';

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
  ReceivableSettlement,
  ReceivablesReport,
  UpdateReceivableInput,
} from '@compras/contracts';

import { currentBusinessIsoDate } from '../common/business-date.js';
import {
  DEMO_USER_ID,
  EXAMPLE_COMPANY_ID,
  HUMAN_CLINIC_ID,
} from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { buildReport } from './prisma-receivables.repository.js';
import { ReceivablesRepository } from './receivables.repository.js';

type StoredReceivable = Omit<Receivable, 'balance' | 'overdue' | 'receivedAmount'> & {
  organizationId: string;
};

export class DemoReceivablesRepository extends ReceivablesRepository {
  private readonly rows = seedReceivables();

  async list(
    organizationId: string,
    filters: ReceivableFilters,
  ): Promise<Receivable[]> {
    const term = normalize(filters.search ?? '');
    return this.rows
      .filter((row) => row.organizationId === organizationId)
      .map(toReceivable)
      .filter((row) => {
        if (filters.status === 'OVERDUE' && !row.overdue) return false;
        if (filters.status && filters.status !== 'OVERDUE' && row.status !== filters.status) {
          return false;
        }
        if (filters.dateFrom && row.dueDate < filters.dateFrom) return false;
        if (filters.dateTo && row.dueDate > filters.dateTo) return false;
        if (!term) return true;
        return normalize(
          `${row.customerName} ${row.customerDocument ?? ''} ${row.description} ${row.documentNumber ?? ''} ${row.invoiceNumber ?? ''}`,
        ).includes(term);
      })
      .sort(
        (left, right) =>
          left.dueDate.localeCompare(right.dueDate) ||
          left.customerName.localeCompare(right.customerName, 'pt-BR'),
      );
  }

  async report(
    organizationId: string,
    filters: ReceivableFilters,
  ): Promise<ReceivablesReport> {
    return buildReport(await this.list(organizationId, filters), 'DEMO');
  }

  async create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateReceivableInput,
  ): Promise<Receivable> {
    const now = new Date().toISOString();
    const row: StoredReceivable = {
      id: randomUUID(),
      organizationId,
      customerName: input.customerName,
      customerDocument: input.customerDocument,
      description: input.description,
      category: input.category,
      documentNumber: input.documentNumber,
      invoiceNumber: input.invoiceNumber,
      issuedAt: input.issuedAt,
      dueDate: input.dueDate,
      expectedAt: input.expectedAt,
      amount: input.amount,
      status: 'OPEN',
      source: input.source,
      notes: input.notes,
      settlements: [],
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return toReceivable(row);
  }

  async update(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateReceivableInput,
  ): Promise<Receivable> {
    const row = this.require(organizationId, id);
    assertVersion(row, input.expectedUpdatedAt);
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('Reative a conta antes de editar.');
    }
    const received = receivedTotal(row.settlements);
    if (input.amount !== undefined && input.amount + 0.001 < received) {
      throw new BadRequestException('O valor nao pode ser menor que o total ja recebido.');
    }
    const issuedAt = input.issuedAt === undefined ? row.issuedAt : input.issuedAt;
    const dueDate = input.dueDate ?? row.dueDate;
    if (issuedAt && dueDate < issuedAt) {
      throw new BadRequestException('O vencimento deve ser igual ou posterior a emissao.');
    }
    const { expectedUpdatedAt: _expectedUpdatedAt, ...changes } = input;
    Object.assign(row, changes);
    if (input.amount !== undefined) row.status = statusFor(input.amount, received);
    row.updatedAt = nextTimestamp(row.updatedAt);
    return toReceivable(row);
  }

  async settle(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: CreateReceivableSettlementInput,
  ): Promise<Receivable> {
    const row = this.require(organizationId, id);
    assertVersion(row, input.expectedUpdatedAt);
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('Uma conta cancelada nao pode receber baixa.');
    }
    if (
      input.transactionId &&
      this.rows.some(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.settlements.some(
            (settlement) => settlement.transactionId === input.transactionId,
          ),
      )
    ) {
      throw new ConflictException('Esse identificador de recebimento ja foi registrado.');
    }
    const received = receivedTotal(row.settlements);
    const balance = round(row.amount - received);
    if (input.amount > balance + 0.001) {
      throw new BadRequestException('A baixa nao pode superar o saldo em aberto.');
    }
    row.settlements.push({
      id: randomUUID(),
      amount: input.amount,
      receivedAt: input.receivedAt,
      transactionId: input.transactionId,
      notes: input.notes,
      createdById: actor.id,
      createdByName: actor.name,
      createdAt: new Date().toISOString(),
    });
    row.status = statusFor(row.amount, received + input.amount);
    row.updatedAt = nextTimestamp(row.updatedAt);
    return toReceivable(row);
  }

  async changeStatus(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangeReceivableStatusInput,
  ): Promise<Receivable> {
    const row = this.require(organizationId, id);
    if (row.status === input.status) return toReceivable(row);
    assertVersion(row, input.expectedUpdatedAt);
    if (input.status === 'CANCELLED' && row.settlements.length) {
      throw new BadRequestException('Uma conta com recebimentos nao pode ser cancelada.');
    }
    row.status = input.status;
    row.updatedAt = nextTimestamp(row.updatedAt);
    return toReceivable(row);
  }

  private require(organizationId: string, id: string): StoredReceivable {
    const row = this.rows.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!row) throw new NotFoundException('Conta a receber nao encontrada.');
    return row;
  }
}

function seedReceivables(): StoredReceivable[] {
  return [
    seed(
      '81000000-0000-4000-8000-000000000001',
      HUMAN_CLINIC_ID,
      'Operadora de Saude Exemplo',
      'Faturamento de convenio',
      '2026-08-10',
      18_500,
      [],
    ),
    seed(
      '81000000-0000-4000-8000-000000000002',
      HUMAN_CLINIC_ID,
      'Empresa Conveniada Exemplo',
      'Servicos clinicos corporativos',
      '2026-07-25',
      9_200,
      [settlement('2026-07-24', 3_200)],
    ),
    seed(
      '82000000-0000-4000-8000-000000000001',
      EXAMPLE_COMPANY_ID,
      'Cliente demonstrativo',
      'Receita operacional',
      '2026-08-15',
      6_400,
      [],
    ),
  ];
}

function seed(
  id: string,
  organizationId: string,
  customerName: string,
  description: string,
  dueDate: string,
  amount: number,
  settlements: ReceivableSettlement[],
): StoredReceivable {
  return {
    id,
    organizationId,
    customerName,
    customerDocument: null,
    description,
    category: 'Receita de servicos',
    documentNumber: null,
    invoiceNumber: null,
    issuedAt: '2026-07-20',
    dueDate,
    expectedAt: dueDate,
    amount,
    status: statusFor(amount, receivedTotal(settlements)),
    source: 'MANUAL',
    notes: null,
    settlements,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
  };
}

function settlement(receivedAt: string, amount: number): ReceivableSettlement {
  return {
    id: randomUUID(),
    amount,
    receivedAt,
    transactionId: null,
    notes: 'Baixa demonstrativa.',
    createdById: DEMO_USER_ID,
    createdByName: 'Proprietario da plataforma',
    createdAt: `${receivedAt}T12:00:00.000Z`,
  };
}

function toReceivable(row: StoredReceivable): Receivable {
  const receivedAmount = receivedTotal(row.settlements);
  const { organizationId: _organizationId, ...data } = row;
  return {
    ...structuredClone(data),
    receivedAmount,
    balance: round(Math.max(0, row.amount - receivedAmount)),
    overdue:
      row.status !== 'RECEIVED' &&
      row.status !== 'CANCELLED' &&
      row.dueDate < currentBusinessIsoDate(),
  };
}

function receivedTotal(settlements: ReceivableSettlement[]): number {
  return round(settlements.reduce((sum, item) => sum + item.amount, 0));
}

function statusFor(amount: number, received: number): Receivable['status'] {
  if (received >= amount - 0.001) return 'RECEIVED';
  return received > 0 ? 'PARTIALLY_RECEIVED' : 'OPEN';
}

function assertVersion(row: StoredReceivable, expected: string) {
  if (row.updatedAt !== expected) {
    throw new ConflictException('A conta foi alterada por outro usuario. Atualize os dados.');
  }
}

function nextTimestamp(previous: string) {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
