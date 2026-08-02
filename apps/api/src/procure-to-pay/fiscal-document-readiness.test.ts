import { describe, expect, it } from 'vitest';

import { missingReadableFiscalDocumentFields } from './fiscal-document-readiness.js';

describe('fiscal document readiness', () => {
  it('accepts a readable uploaded document without requiring a SEFAZ access key', () => {
    expect(
      missingReadableFiscalDocumentFields({
        fileAvailable: true,
        invoiceNumber: '2180224',
        issuedAt: new Date('2026-07-13T00:00:00.000Z'),
        issuerDocument: '12.345.678/0001-95',
        itemCount: 1,
        total: 1_464.69,
      }),
    ).toEqual([]);
  });

  it('rejects a placeholder number and incomplete extraction', () => {
    expect(
      missingReadableFiscalDocumentFields({
        fileAvailable: true,
        invoiceNumber: '000',
        issuedAt: null,
        issuerDocument: null,
        itemCount: 0,
        total: null,
      }),
    ).toEqual(['invoiceNumber', 'issuerDocument', 'issuedAt', 'total', 'items']);
  });

  it('requires the 44-digit access key for an automatic SEFAZ match', () => {
    expect(
      missingReadableFiscalDocumentFields(
        {
          accessKey: '123',
          fileAvailable: true,
          invoiceNumber: '12345',
          issuedAt: new Date('2026-07-13T00:00:00.000Z'),
          issuerDocument: '12.345.678/0001-95',
          itemCount: 1,
          total: 100,
        },
        { requireAccessKey: true },
      ),
    ).toEqual(['accessKey']);
  });
});
