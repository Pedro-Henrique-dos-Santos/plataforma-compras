import { describe, expect, it } from 'vitest';

import { validateInvoiceFile } from './invoice-file.validator.js';

describe('invoice file validation', () => {
  it('identifies PDF content by its signature and sanitizes the name', async () => {
    const result = await validateInvoiceFile({
      buffer: Buffer.from('%PDF-1.4\n% document'),
      mimetype: 'application/octet-stream',
      originalname: '../../Nota Fiscal 123.EXE',
      size: 20,
    });
    expect(result.kind).toBe('PDF');
    expect(result.fileName).toBe('Nota-Fiscal-123.pdf');
  });

  it('accepts plain XML even when the browser sends a generic MIME type', async () => {
    const result = await validateInvoiceFile({
      buffer: Buffer.from('<?xml version="1.0"?><nfeProc></nfeProc>'),
      mimetype: 'text/plain',
      originalname: 'nota.xml',
      size: 43,
    });
    expect(result.kind).toBe('XML');
    expect(result.mimeType).toBe('application/xml');
  });

  it('rejects XML external declarations', async () => {
    await expect(
      validateInvoiceFile({
        buffer: Buffer.from('<?xml version="1.0"?><!DOCTYPE doc><doc></doc>'),
        mimetype: 'application/xml',
        originalname: 'unsafe.xml',
        size: 50,
      }),
    ).rejects.toThrow('declaracoes externas');
  });

  it('rejects executable or unknown content', async () => {
    await expect(
      validateInvoiceFile({
        buffer: Buffer.from('MZ executable content'),
        mimetype: 'application/pdf',
        originalname: 'fake.pdf',
        size: 21,
      }),
    ).rejects.toThrow('nao e um PDF ou XML');
  });
});
