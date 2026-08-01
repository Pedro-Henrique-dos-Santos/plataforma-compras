import { describe, expect, it } from 'vitest';

import { parseInvoiceXml } from './invoice-xml.parser.js';

const nfeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe35260711222333000181550010000012341000012345">
      <ide><natOp>Compra de materiais</natOp><nNF>1234</nNF><dhEmi>2026-07-14T09:30:00-03:00</dhEmi></ide>
      <emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor Exemplo Ltda</xNome></emit>
      <det nItem="1"><prod><xProd>Luva de procedimento</xProd><qCom>2.0000</qCom><uCom>CX</uCom><vUnCom>50.0000</vUnCom><vProd>100.00</vProd></prod></det>
      <total><ICMSTot><vNF>100.00</vNF></ICMSTot></total>
      <cobr><dup><nDup>001</nDup><dVenc>2026-08-14</dVenc><vDup>100.00</vDup></dup></cobr>
      <pag><detPag><tPag>15</tPag><vPag>100.00</vPag></detPag></pag>
    </infNFe>
  </NFe>
</nfeProc>`;

function nfseXml(description: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <CompNfse><Nfse><InfNfse>
    <Numero>987</Numero><DataEmissao>2026-07-13</DataEmissao>
    <PrestadorServico><RazaoSocial>Servicos Exemplo Ltda</RazaoSocial><IdentificacaoPrestador><Cnpj>11222333000181</Cnpj></IdentificacaoPrestador></PrestadorServico>
    <Servico><Valores><ValorServicos>500.00</ValorServicos></Valores><Discriminacao>${description}</Discriminacao></Servico>
  </InfNfse></Nfse></CompNfse>`;
}

describe('invoice XML parser', () => {
  it('extracts structured NF-e fields, items, payment and installments', () => {
    const result = parseInvoiceXml(Buffer.from(nfeXml));
    expect(result.parser).toBe('NFE_XML');
    expect(result.extraction).toMatchObject({
      invoiceNumber: '1234',
      supplierDocument: '11222333000181',
      supplierName: 'Fornecedor Exemplo Ltda',
      issuedAt: '2026-07-14',
      total: 100,
      paymentMethod: 'Boleto bancario',
      triageStatus: 'IN_SCOPE',
    });
    expect(result.extraction.items).toHaveLength(1);
    expect(result.extraction.installments).toEqual([
      { amount: 100, dueDate: '2026-08-14' },
    ]);
    expect(result.extraction.accessKey).toHaveLength(44);
  });

  it('preserves alphanumeric CNPJ and access key fields', () => {
    const accessKey = '35260712ABC34501DE35550010000000011123456789';
    const result = parseInvoiceXml(
      Buffer.from(
        nfeXml
          .replace(
            '35260711222333000181550010000012341000012345',
            accessKey,
          )
          .replace(
            '<CNPJ>11222333000181</CNPJ>',
            '<CNPJ>12ABC34501DE35</CNPJ>',
          ),
      ),
    );

    expect(result.extraction.supplierDocument).toBe('12ABC34501DE35');
    expect(result.extraction.accessKey).toBe(accessKey);
  });

  it('keeps maintenance NFS-e in the purchasing review flow', () => {
    const result = parseInvoiceXml(
      Buffer.from(nfseXml('Manutencao preventiva dos equipamentos da clinica')),
    );
    expect(result.parser).toBe('NFSE_XML');
    expect(result.extraction.triageStatus).toBe('IN_SCOPE');
    expect(result.extraction.total).toBe(500);
    expect(result.extraction.items[0]?.description).toContain('Manutencao');
  });

  it('marks personal medical services as outside purchasing scope', () => {
    const result = parseInvoiceXml(
      Buffer.from(nfseXml('Servicos medicos prestados pela Dra Maria Souza')),
    );
    expect(result.extraction.triageStatus).toBe('OUT_OF_SCOPE');
    expect(result.extraction.triageReason).toContain('fora do escopo');
  });
});
