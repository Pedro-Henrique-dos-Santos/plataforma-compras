import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  isValidCnpj,
  normalizeBrazilianDocument,
  type PaymentInstructionInput,
  type PixKeyType,
} from '@compras/contracts';

export type ValidatedPaymentInstruction = {
  fingerprint: string;
  warnings: string[];
};

export type ExpectedPixBeneficiary = {
  document?: string | null;
  name?: string | null;
};

export function validatePaymentInstruction(
  input: PaymentInstructionInput,
  expectedAmount: number,
  expectedBeneficiary?: ExpectedPixBeneficiary,
): ValidatedPaymentInstruction {
  const warnings: string[] = [];
  if (input.paymentChannel === 'PIX') {
    if (input.pixKey && input.pixKeyType) {
      assertPixKey(input.pixKeyType, input.pixKey);
    }
    if (input.beneficiaryDocument) {
      const document = normalizeBrazilianDocument(input.beneficiaryDocument);
      if (!isValidCpf(document) && !isValidCnpj(document)) {
        throw new BadRequestException('O documento do beneficiario Pix e invalido.');
      }
    }
    if (
      expectedBeneficiary?.document &&
      input.beneficiaryDocument &&
      normalizeBrazilianDocument(expectedBeneficiary.document) !==
        normalizeBrazilianDocument(input.beneficiaryDocument)
    ) {
      throw new BadRequestException(
        'O documento do beneficiario Pix diverge do cadastro do fornecedor.',
      );
    }
    if (
      expectedBeneficiary?.name &&
      input.beneficiaryName &&
      !sameBeneficiary(expectedBeneficiary.name, input.beneficiaryName)
    ) {
      throw new BadRequestException(
        'O nome do beneficiario Pix diverge do cadastro do fornecedor.',
      );
    }
    if (input.pixCopyPaste) {
      const payload = parsePixPayload(input.pixCopyPaste);
      if (
        payload.amount !== null &&
        Math.abs(payload.amount - expectedAmount) > 0.01
      ) {
        throw new BadRequestException(
          'O valor do Pix copia e cola diverge do saldo do titulo.',
        );
      }
      if (
        payload.pixKey &&
        input.pixKey &&
        normalizePixKey(payload.pixKey) !== normalizePixKey(input.pixKey)
      ) {
        throw new BadRequestException(
          'A chave do Pix copia e cola diverge da chave informada.',
        );
      }
      if (!payload.amount) {
        warnings.push('O Pix copia e cola nao fixa o valor do pagamento.');
      }
      if (
        payload.merchantName &&
        input.beneficiaryName &&
        !sameBeneficiary(payload.merchantName, input.beneficiaryName)
      ) {
        throw new BadRequestException(
          'O beneficiario do Pix copia e cola diverge da instrucao informada.',
        );
      }
    }
    if (!input.beneficiaryName) {
      warnings.push('Nome do beneficiario Pix nao informado.');
    }
    if (!input.beneficiaryDocument) {
      warnings.push('Documento do beneficiario Pix nao informado.');
    }
  }
  return {
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          beneficiaryDocument: normalizeBrazilianDocument(input.beneficiaryDocument ?? ''),
          beneficiaryName: normalize(input.beneficiaryName),
          notes: input.notes ?? null,
          paymentChannel: input.paymentChannel,
          paymentReference: input.paymentReference ?? null,
          pixCopyPaste: compactPix(input.pixCopyPaste),
          pixKey: input.pixKey?.trim() ?? null,
          pixKeyType: input.pixKeyType ?? null,
        }),
      )
      .digest('hex'),
    warnings,
  };
}

export function parsePixPayload(value: string): {
  amount: number | null;
  merchantName: string | null;
  pixKey: string | null;
  transactionId: string | null;
} {
  const payload = compactPix(value);
  if (!payload || payload.length > 1_000) {
    throw new BadRequestException('O codigo Pix copia e cola e invalido.');
  }
  const crcMarker = payload.lastIndexOf('6304');
  if (crcMarker < 0 || crcMarker + 8 !== payload.length) {
    throw new BadRequestException('O codigo Pix nao possui um CRC valido.');
  }
  const expected = payload.slice(-4).toUpperCase();
  const calculated = crc16(payload.slice(0, -4));
  if (expected !== calculated) {
    throw new BadRequestException('O CRC do codigo Pix copia e cola e invalido.');
  }
  const fields = parseTlv(payload);
  if (fields.get('00') !== '01') {
    throw new BadRequestException('O formato do codigo Pix nao e BR Code versao 01.');
  }
  if (fields.get('53') !== '986' || fields.get('58')?.toUpperCase() !== 'BR') {
    throw new BadRequestException('A moeda ou o pais do codigo Pix e invalido.');
  }
  const merchantAccount = [...fields.entries()]
    .filter(([id]) => Number(id) >= 26 && Number(id) <= 51)
    .map(([, nested]) => parseTlv(nested))
    .find((nested) => nested.get('00')?.toUpperCase() === 'BR.GOV.BCB.PIX');
  if (!merchantAccount) {
    throw new BadRequestException('O codigo nao identifica uma conta Pix oficial.');
  }
  const amountText = fields.get('54');
  const amount = amountText ? Number(amountText) : null;
  if (amountText && (!Number.isFinite(amount) || amount === null || amount <= 0)) {
    throw new BadRequestException('O valor informado no codigo Pix e invalido.');
  }
  const additional = fields.get('62');
  const additionalFields = additional ? parseTlv(additional) : new Map<string, string>();
  return {
    amount,
    merchantName: fields.get('59')?.trim() || null,
    pixKey: merchantAccount.get('01')?.trim() || null,
    transactionId: additionalFields.get('05')?.trim() || null,
  };
}

function parseTlv(payload: string): Map<string, string> {
  const result = new Map<string, string>();
  const bytes = Buffer.from(payload, 'utf8');
  let cursor = 0;
  while (cursor < bytes.length) {
    const id = bytes.subarray(cursor, cursor + 2).toString('ascii');
    const lengthText = bytes.subarray(cursor + 2, cursor + 4).toString('ascii');
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) {
      throw new BadRequestException('A estrutura EMV do codigo Pix e invalida.');
    }
    const length = Number(lengthText);
    const start = cursor + 4;
    const end = start + length;
    if (end > bytes.length) {
      throw new BadRequestException('A estrutura EMV do codigo Pix esta incompleta.');
    }
    result.set(id, bytes.subarray(start, end).toString('utf8'));
    cursor = end;
  }
  return result;
}

function crc16(value: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function assertPixKey(type: PixKeyType, value: string): void {
  const valid = {
    CPF: isValidCpf(value),
    CNPJ: isValidCnpj(value),
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    PHONE: /^\+[1-9]\d{9,14}$/.test(value),
    RANDOM: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  }[type];
  if (!valid) {
    throw new BadRequestException('A chave Pix nao corresponde ao tipo selecionado.');
  }
}

function isValidCpf(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const digit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((total, current, index) => total + Number(current) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(digits[9]) && digit(10) === Number(digits[10]);
}

function compactPix(value: string | null | undefined): string | null {
  return value ? value.trim() : null;
}

function normalizePixKey(value: string): string {
  return value.trim().toLowerCase();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function normalize(value: string | null | undefined): string | null {
  return value?.trim().toLocaleUpperCase('pt-BR') ?? null;
}

function sameBeneficiary(left: string, right: string): boolean {
  const normalizeName = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase();
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}
