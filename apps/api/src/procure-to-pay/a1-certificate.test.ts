import { describe, expect, it } from 'vitest';

import { extractCertificateDocuments } from './a1-certificate.js';

describe('A1 certificate identity extraction', () => {
  it('finds numeric and alphanumeric CNPJ values in certificate subjects', () => {
    expect(
      extractCertificateDocuments([
        'HUMAN CLINIC LTDA:11222333000181',
        'SERIALNUMBER=12ABC34501DE35',
        'OU=12.ABC.345/01DE-35',
      ]),
    ).toEqual(['11222333000181', '12ABC34501DE35']);
  });

  it('ignores invalid identifiers', () => {
    expect(
      extractCertificateDocuments(['CN=EMPRESA TESTE:11111111111111']),
    ).toEqual([]);
  });
});
