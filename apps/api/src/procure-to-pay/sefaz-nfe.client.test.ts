import { gzipSync } from 'node:zlib';

import { BadGatewayException } from '@nestjs/common';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';

import {
  buildDistributionEnvelope,
  parseManifestationResponse,
  parseSefazDistributionResponse,
  signedManifestationEvent,
} from './sefaz-nfe.client.js';

describe('SEFAZ NF-e response parsing', () => {
  it('descompresses a distribution batch without reordering its NSUs', () => {
    const first = zipped('<resNFe><chNFe>1</chNFe></resNFe>');
    const second = zipped('<nfeProc><NFe>documento</NFe></nfeProc>');
    const result = parseSefazDistributionResponse(
      distributionResponse(
        '138',
        '000000000000010',
        '000000000000012',
        `<docZip NSU="000000000000012" schema="procNFe_v4.00.xsd">${first}</docZip>` +
          `<docZip NSU="000000000000011" schema="resNFe_v1.01.xsd">${second}</docZip>`,
      ),
    );
    expect(result.documents.map((document) => document.nsu)).toEqual([
      '000000000000012',
      '000000000000011',
    ]);
    expect(result.documents[0]?.xml.toString()).toContain('resNFe');
    expect(result.lastNsu).toBe('000000000000010');
    expect(result.maxNsu).toBe('000000000000012');
  });

  it('accepts no-document and consumption-warning statuses', () => {
    expect(
      parseSefazDistributionResponse(
        distributionResponse('137', '15', '15', ''),
      ).documents,
    ).toEqual([]);
    expect(
      parseSefazDistributionResponse(
        distributionResponse('656', '15', '20', ''),
      ).statusCode,
    ).toBe('656');
  });

  it('preserves an alphanumeric CNPJ in the distribution envelope', () => {
    const envelope = buildDistributionEnvelope(
      'PRODUCTION',
      '12.ABC.345/01DE-35',
      '15',
    );

    expect(envelope).toContain('<CNPJ>12ABC34501DE35</CNPJ>');
    expect(envelope).toContain('<ultNSU>000000000000015</ultNSU>');
    expect(() =>
      buildDistributionEnvelope('PRODUCTION', '12ABC34501DE34', '15'),
    ).toThrow(BadGatewayException);
  });

  it('rejects malformed compressed documents and refused statuses', () => {
    expect(() =>
      parseSefazDistributionResponse(
        distributionResponse(
          '138',
          '1',
          '2',
          '<docZip NSU="2" schema="procNFe_v4.00.xsd">bm90LWd6aXA=</docZip>',
        ),
      ),
    ).toThrow();
    expect(() =>
      parseSefazDistributionResponse(
        distributionResponse('999', '1', '1', ''),
      ),
    ).toThrow(BadGatewayException);
  });

  it('parses an accepted manifestation and rejects a refused event', () => {
    expect(parseManifestationResponse(manifestationResponse('135'))).toEqual({
      protocol: '123456789',
      statusCode: '135',
      statusMessage: 'Evento registrado',
    });
    expect(() => parseManifestationResponse(manifestationResponse('573'))).not.toThrow();
    expect(() => parseManifestationResponse(manifestationResponse('999'))).toThrow(
      BadGatewayException,
    );
  });

  it('creates a verifiable XMLDSig manifestation with the A1 key', () => {
    const credentials = testPkcs12('secret');
    const signed = signedManifestationEvent({
      accessKey: '3'.repeat(44),
      environment: 'HOMOLOGATION',
      manifestation: 'SCIENCE',
      passphrase: 'secret',
      pfx: credentials.pfx,
      reason: null,
      taxpayerDocument: '11.222.333/0001-81',
    });
    const signatureXml = signed.match(
      /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">[\s\S]*?<\/Signature>/,
    )?.[0];
    expect(signatureXml).toBeTruthy();
    const verifier = new SignedXml({
      getCertFromKeyInfo: () => null,
      publicCert: credentials.certificatePem,
    });
    verifier.loadSignature(signatureXml!);
    expect(verifier.checkSignature(signed)).toBe(true);
    expect(verifier.getSignedReferences()).toHaveLength(1);
  });
});

function testPkcs12(passphrase: string): { certificatePem: string; pfx: Buffer } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01T00:00:00.000Z');
  certificate.validity.notAfter = new Date('2028-01-01T00:00:00.000Z');
  const attributes = [{ name: 'commonName', value: 'E-Gestao Test Certificate' }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [certificate],
    passphrase,
    { algorithm: '3des' },
  );
  return {
    certificatePem: forge.pki.certificateToPem(certificate),
    pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'),
  };
}

function zipped(xml: string): string {
  return gzipSync(Buffer.from(xml)).toString('base64');
}

function distributionResponse(
  status: string,
  lastNsu: string,
  maxNsu: string,
  documents: string,
): string {
  return `<soap:Envelope><soap:Body><nfeDistDFeInteresseResponse>` +
    `<nfeDistDFeInteresseResult><retDistDFeInt>` +
    `<cStat>${status}</cStat><xMotivo>Resultado</xMotivo>` +
    `<ultNSU>${lastNsu}</ultNSU><maxNSU>${maxNsu}</maxNSU>` +
    `<loteDistDFeInt>${documents}</loteDistDFeInt>` +
    `</retDistDFeInt></nfeDistDFeInteresseResult>` +
    `</nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
}

function manifestationResponse(status: string): string {
  return `<soap:Envelope><soap:Body><nfeRecepcaoEventoResponse>` +
    `<nfeRecepcaoEventoResult><retEnvEvento><cStat>128</cStat>` +
    `<retEvento><infEvento><cStat>${status}</cStat><xMotivo>Evento registrado</xMotivo>` +
    `<nProt>123456789</nProt></infEvento></retEvento>` +
    `</retEnvEvento></nfeRecepcaoEventoResult>` +
    `</nfeRecepcaoEventoResponse></soap:Body></soap:Envelope>`;
}
