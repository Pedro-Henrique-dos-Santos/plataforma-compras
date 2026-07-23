import { z } from 'zod';

import { organizationDocumentSchema } from './organizations.js';

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

export const supplierSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().max(160).nullable(),
  document: z.string().trim().max(18).nullable(),
  category: z.string().trim().max(100).nullable(),
  operationNature: z.string().trim().max(100).nullable(),
  paymentMethod: z.string().trim().max(80).nullable(),
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

export const createSupplierInputSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  tradeName: optionalText(160),
  document: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    organizationDocumentSchema.nullable(),
  ),
  category: optionalText(100),
  operationNature: optionalText(100),
  paymentMethod: optionalText(80),
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
});
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
