import { z } from 'zod';

import {
  isValidCnpj,
  organizationDocumentSchema,
} from './organizations.js';

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Informe uma data valida.');

export const monetaryValueSchema = z.number().finite().nonnegative().max(999_999_999_999.99);

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

const editableOptionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  ).optional();

export const costCenterSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CostCenter = z.infer<typeof costCenterSchema>;

export const createCostCenterInputSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
});
export type CreateCostCenterInput = z.infer<typeof createCostCenterInputSchema>;

export const updateCostCenterInputSchema = z
  .object({
    code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Informe ao menos um campo para alterar.',
  });
export type UpdateCostCenterInput = z.infer<typeof updateCostCenterInputSchema>;

export const supplierStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type SupplierStatus = z.infer<typeof supplierStatusSchema>;

export const paymentChannelSchema = z.enum([
  'PIX',
  'CARD_LINK',
  'BOLETO',
  'BANK_TRANSFER',
  'OTHER',
]);
export type PaymentChannel = z.infer<typeof paymentChannelSchema>;

export const pixKeyTypeSchema = z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM']);
export type PixKeyType = z.infer<typeof pixKeyTypeSchema>;

const paymentUrlSchema = z
  .string()
  .trim()
  .url('Informe um link de pagamento valido.')
  .max(500)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'O link de pagamento precisa usar HTTPS.' },
  );

const optionalUrl = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  paymentUrlSchema.nullable(),
);

const editableOptionalUrl = z.preprocess(
  (value) => (value === '' ? null : value),
  paymentUrlSchema.nullable(),
).optional();

export const supplierSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().max(160).nullable(),
  document: z.string().trim().max(18).nullable(),
  category: z.string().trim().max(100).nullable(),
  operationNature: z.string().trim().max(100).nullable(),
  paymentMethod: z.string().trim().max(80).nullable(),
  pixKeyType: pixKeyTypeSchema.nullable(),
  pixKey: z.string().trim().max(160).nullable(),
  pixBeneficiaryName: z.string().trim().max(160).nullable(),
  pixBeneficiaryDocument: z.string().trim().max(18).nullable(),
  paymentLink: paymentUrlSchema.nullable(),
  defaultCostCenterId: z.string().uuid().nullable(),
  defaultCostCenterName: z.string().trim().max(120).nullable(),
  email: z.string().email().max(255).nullable(),
  phone: z.string().trim().max(30).nullable(),
  status: supplierStatusSchema,
  notes: z.string().max(2_000).nullable(),
  priceCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierInputSchema = z
  .object({
    legalName: z.string().trim().min(2).max(160),
    tradeName: optionalText(160),
    document: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      organizationDocumentSchema.nullable(),
    ),
    category: optionalText(100),
    operationNature: optionalText(100),
    paymentMethod: optionalText(80),
    pixKeyType: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      pixKeyTypeSchema.nullable(),
    ).optional(),
    pixKey: optionalText(160).optional(),
    pixBeneficiaryName: optionalText(160).optional(),
    pixBeneficiaryDocument: optionalText(18).optional(),
    paymentLink: optionalUrl.optional(),
    defaultCostCenterId: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().uuid().nullable(),
    ),
    email: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().trim().toLowerCase().email().max(255).nullable(),
    ),
    phone: optionalText(30),
    notes: optionalText(2_000),
  })
  .superRefine(validatePixFields);
export type CreateSupplierInput = z.infer<typeof createSupplierInputSchema>;

export const updateSupplierInputSchema = z
  .object({
    legalName: z.string().trim().min(2).max(160).optional(),
    tradeName: editableOptionalText(160),
    document: z.preprocess(
      (value) => (value === '' ? null : value),
      organizationDocumentSchema.nullable(),
    ).optional(),
    category: editableOptionalText(100),
    operationNature: editableOptionalText(100),
    paymentMethod: editableOptionalText(80),
    pixKeyType: z.preprocess(
      (value) => (value === '' ? null : value),
      pixKeyTypeSchema.nullable(),
    ).optional(),
    pixKey: editableOptionalText(160),
    pixBeneficiaryName: editableOptionalText(160),
    pixBeneficiaryDocument: editableOptionalText(18),
    paymentLink: editableOptionalUrl,
    defaultCostCenterId: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().uuid().nullable(),
    ).optional(),
    email: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().trim().toLowerCase().email().max(255).nullable(),
    ).optional(),
    phone: editableOptionalText(30),
    notes: editableOptionalText(2_000),
    status: supplierStatusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Informe ao menos um campo para alterar.',
  })
  .superRefine((value, context) => {
    const hasType = value.pixKeyType !== undefined;
    const hasKey = value.pixKey !== undefined;
    if (hasType !== hasKey) {
      context.addIssue({
        code: 'custom',
        message: 'Altere o tipo e a chave Pix em conjunto.',
        path: hasType ? ['pixKey'] : ['pixKeyType'],
      });
      return;
    }
    if (hasType && hasKey) {
      validatePixFields(
        {
          pixBeneficiaryDocument: value.pixBeneficiaryDocument ?? null,
          pixBeneficiaryName: value.pixBeneficiaryName ?? null,
          pixKeyType: value.pixKeyType ?? null,
          pixKey: value.pixKey ?? null,
        },
        context,
      );
    } else if (value.pixBeneficiaryDocument !== undefined) {
      validatePixFields(
        {
          pixBeneficiaryDocument: value.pixBeneficiaryDocument,
          pixBeneficiaryName: value.pixBeneficiaryName,
        },
        context,
      );
    }
  });
export type UpdateSupplierInput = z.infer<typeof updateSupplierInputSchema>;

export const priceStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'INACTIVE']);
export type PriceStatus = z.infer<typeof priceStatusSchema>;

export const priceSourceSchema = z.enum(['MANUAL', 'CSV', 'INVOICE', 'GOOGLE_SHEETS']);
export type PriceSource = z.infer<typeof priceSourceSchema>;

export const supplierPriceSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierName: z.string().trim().min(2).max(160),
  itemCode: z.string().trim().max(80).nullable(),
  description: z.string().trim().min(2).max(240),
  unit: z.string().trim().max(30).nullable(),
  initialPrice: monetaryValueSchema.nullable(),
  negotiatedPrice: monetaryValueSchema,
  savingsPercentage: z.number().finite().nullable(),
  validFrom: isoDateSchema.nullable(),
  validUntil: isoDateSchema.nullable(),
  status: priceStatusSchema,
  source: priceSourceSchema,
  notes: z.string().max(2_000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SupplierPrice = z.infer<typeof supplierPriceSchema>;

export const supplierPriceItemInputSchema = z
  .object({
    itemCode: optionalText(80),
    description: z.string().trim().min(2).max(240),
    unit: optionalText(30),
    initialPrice: monetaryValueSchema.nullable().optional().default(null),
    negotiatedPrice: monetaryValueSchema,
    validFrom: isoDateSchema.nullable().optional().default(null),
    validUntil: isoDateSchema.nullable().optional().default(null),
    source: priceSourceSchema.optional().default('MANUAL'),
    notes: optionalText(2_000),
  })
  .refine(
    (value) => !value.validFrom || !value.validUntil || value.validUntil >= value.validFrom,
    { message: 'A validade final deve ser igual ou posterior a inicial.', path: ['validUntil'] },
  );
export type SupplierPriceItemInput = z.infer<typeof supplierPriceItemInputSchema>;

export const createSupplierPriceInputSchema = supplierPriceItemInputSchema.and(
  z.object({ supplierId: z.string().uuid() }),
);
export type CreateSupplierPriceInput = z.infer<typeof createSupplierPriceInputSchema>;

export const updateSupplierPriceInputSchema = z
  .object({
    itemCode: editableOptionalText(80),
    description: z.string().trim().min(2).max(240).optional(),
    unit: editableOptionalText(30),
    initialPrice: monetaryValueSchema.nullable().optional(),
    negotiatedPrice: monetaryValueSchema.optional(),
    validFrom: isoDateSchema.nullable().optional(),
    validUntil: isoDateSchema.nullable().optional(),
    status: priceStatusSchema.optional(),
    source: priceSourceSchema.optional(),
    notes: editableOptionalText(2_000),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Informe ao menos um campo para alterar.',
  });
export type UpdateSupplierPriceInput = z.infer<typeof updateSupplierPriceInputSchema>;

export const importSupplierPricesInputSchema = z.object({
  supplierId: z.string().uuid(),
  items: z.array(supplierPriceItemInputSchema).min(1).max(1_000),
});
export type ImportSupplierPricesInput = z.infer<typeof importSupplierPricesInputSchema>;

export const supplierPriceImportResultSchema = z.object({
  total: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});
export type SupplierPriceImportResult = z.infer<typeof supplierPriceImportResultSchema>;

function validatePixFields(
  value: {
    pixBeneficiaryDocument?: string | null;
    pixBeneficiaryName?: string | null;
    pixKeyType?: PixKeyType | null;
    pixKey?: string | null;
  },
  context: z.RefinementCtx,
) {
  const pixKeyType = value.pixKeyType ?? null;
  const pixKey = value.pixKey ?? null;
  if ((pixKeyType === null) !== (pixKey === null)) {
    context.addIssue({
      code: 'custom',
      message: 'Informe o tipo e a chave Pix em conjunto.',
      path: pixKeyType === null ? ['pixKeyType'] : ['pixKey'],
    });
    return;
  }
  const beneficiaryDocument = value.pixBeneficiaryDocument ?? null;
  if (
    beneficiaryDocument &&
    !isValidCpf(beneficiaryDocument) &&
    !isValidCnpj(beneficiaryDocument)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'O documento do beneficiario Pix e invalido.',
      path: ['pixBeneficiaryDocument'],
    });
  }
  if (!pixKeyType || !pixKey) return;
  const valid = {
    CPF: isValidCpf(pixKey),
    CNPJ: isValidCnpj(pixKey),
    EMAIL: z.string().email().safeParse(pixKey).success,
    PHONE: /^\+[1-9]\d{9,14}$/.test(pixKey),
    RANDOM: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      pixKey,
    ),
  }[pixKeyType];
  if (!valid) {
    context.addIssue({
      code: 'custom',
      message: 'A chave Pix nao corresponde ao tipo selecionado.',
      path: ['pixKey'],
    });
  }
}

function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce(
        (total, digit, index) =>
          total + Number(digit) * (length + 1 - index),
        0,
      );
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return (
    checkDigit(9) === Number(digits[9]) &&
    checkDigit(10) === Number(digits[10])
  );
}
