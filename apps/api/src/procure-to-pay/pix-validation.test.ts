import { BadRequestException } from '@nestjs/common';
import type { PaymentInstructionInput } from '@compras/contracts';
import { describe, expect, it } from 'vitest';

import { parsePixPayload, validatePaymentInstruction } from './pix-validation.js';

describe('Pix payment instruction validation', () => {
  it('accepts a valid EMV payload and verifies amount and beneficiary', () => {
    const pixCopyPaste = pixPayload(100, 'HUMAN CLINIC');
    expect(parsePixPayload(pixCopyPaste)).toMatchObject({
      amount: 100,
      merchantName: 'HUMAN CLINIC',
      pixKey: '11222333000181',
      transactionId: '***',
    });

    const result = validatePaymentInstruction(
      instruction({ pixCopyPaste, beneficiaryName: 'Human Clinic' }),
      100,
    );
    expect(result.fingerprint).toHaveLength(64);
  });

  it('rejects CRC, amount and beneficiary divergences', () => {
    const valid = pixPayload(100, 'FORNECEDOR TESTE');
    expect(() => parsePixPayload(`${valid.slice(0, -1)}0`)).toThrow(BadRequestException);
    expect(() =>
      validatePaymentInstruction(instruction({ pixCopyPaste: valid }), 99),
    ).toThrow('diverge do saldo');
    expect(() =>
      validatePaymentInstruction(
        instruction({
          beneficiaryName: 'OUTRO BENEFICIARIO',
          pixCopyPaste: valid,
        }),
        100,
      ),
    ).toThrow('diverge da instrucao');
  });

  it('rejects invalid keys and changes the fingerprint when a reference changes', () => {
    expect(() =>
      validatePaymentInstruction(
        instruction({ pixKey: '11111111111', pixKeyType: 'CPF' }),
        100,
      ),
    ).toThrow('nao corresponde');
    const first = validatePaymentInstruction(
      instruction({ paymentReference: 'boleto-1', paymentChannel: 'BOLETO' }),
      100,
    );
    const second = validatePaymentInstruction(
      instruction({ paymentReference: 'boleto-2', paymentChannel: 'BOLETO' }),
      100,
    );
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it('rejects beneficiary data that diverges from the supplier record', () => {
    expect(() =>
      validatePaymentInstruction(instruction(), 100, {
        document: '45.723.174/0001-10',
        name: 'Fornecedor Teste',
      }),
    ).toThrow('diverge do cadastro do fornecedor');
    expect(() =>
      validatePaymentInstruction(instruction(), 100, {
        document: '11.222.333/0001-81',
        name: 'Outra Empresa',
      }),
    ).toThrow('diverge do cadastro do fornecedor');
  });
});

function instruction(
  overrides: Partial<PaymentInstructionInput> = {},
): PaymentInstructionInput {
  return {
    expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
    paymentChannel: 'PIX',
    paymentReference: null,
    pixKeyType: 'CNPJ',
    pixKey: '11222333000181',
    beneficiaryName: 'Fornecedor Teste',
    beneficiaryDocument: '11222333000181',
    pixCopyPaste: null,
    notes: null,
    ...overrides,
  };
}

function pixPayload(amount: number, merchantName: string): string {
  const fields = [
    tlv('00', '01'),
    tlv('26', tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', '11222333000181')),
    tlv('53', '986'),
    tlv('54', amount.toFixed(2)),
    tlv('58', 'BR'),
    tlv('59', merchantName),
    tlv('60', 'SAO PAULO'),
    tlv('62', tlv('05', '***')),
    '6304',
  ].join('');
  return `${fields}${crc16(fields)}`;
}

function tlv(id: string, value: string): string {
  return `${id}${String(Buffer.byteLength(value, 'utf8')).padStart(2, '0')}${value}`;
}

function crc16(value: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
