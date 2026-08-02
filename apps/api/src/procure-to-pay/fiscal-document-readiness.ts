export type FiscalDocumentReadinessInput = {
  accessKey?: string | null;
  fileAvailable: boolean;
  invoiceNumber: string | null;
  issuedAt: Date | null;
  issuerDocument: string | null;
  itemCount: number;
  total: number | null;
};

export type FiscalDocumentRequiredField =
  | 'accessKey'
  | 'file'
  | 'invoiceNumber'
  | 'issuedAt'
  | 'issuerDocument'
  | 'items'
  | 'total';

export function missingReadableFiscalDocumentFields(
  input: FiscalDocumentReadinessInput,
  options: { requireAccessKey?: boolean } = {},
): FiscalDocumentRequiredField[] {
  const missing: FiscalDocumentRequiredField[] = [];
  const invoiceDigits = input.invoiceNumber?.replace(/\D/g, '') ?? '';
  const issuerDigits = input.issuerDocument?.replace(/\D/g, '') ?? '';
  const accessKeyDigits = input.accessKey?.replace(/\D/g, '') ?? '';

  if (!input.fileAvailable) missing.push('file');
  if (!invoiceDigits || /^0+$/.test(invoiceDigits)) missing.push('invoiceNumber');
  if (![11, 14].includes(issuerDigits.length)) missing.push('issuerDocument');
  if (!input.issuedAt || Number.isNaN(input.issuedAt.getTime())) missing.push('issuedAt');
  if (input.total === null || !Number.isFinite(input.total) || input.total <= 0) {
    missing.push('total');
  }
  if (!Number.isInteger(input.itemCount) || input.itemCount <= 0) missing.push('items');
  if (options.requireAccessKey && accessKeyDigits.length !== 44) missing.push('accessKey');

  return missing;
}
