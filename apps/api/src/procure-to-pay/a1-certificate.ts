import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import {
  isValidCnpj,
  normalizeBrazilianDocument,
} from '@compras/contracts';
import forge from 'node-forge';

export type A1CertificateMetadata = {
  documents: string[];
  expiresAt: Date;
  fingerprint: string;
  subject: string;
};

export function inspectA1Certificate(
  pfx: Buffer,
  passphrase: string,
): A1CertificateMetadata {
  try {
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(pfx.toString('binary')),
    );
    const store = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
    const certBagOid = forge.pki.oids.certBag;
    const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag;
    if (!certBagOid || !keyBagOid) throw new Error('PKCS12 OIDs unavailable');
    const bags = store.getBags({ bagType: certBagOid });
    const certificate = bags[certBagOid]?.find((bag: forge.pkcs12.Bag) => bag.cert)?.cert;
    const keyBags = store.getBags({
      bagType: keyBagOid,
    });
    const privateKey = keyBags[keyBagOid]?.find(
      (bag: forge.pkcs12.Bag) => bag.key,
    )?.key;
    if (!certificate || !privateKey) {
      throw new Error('certificate or private key missing');
    }
    const der = forge.asn1
      .toDer(forge.pki.certificateToAsn1(certificate))
      .getBytes();
    const expiresAt = certificate.validity.notAfter;
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('O certificado A1 esta vencido.');
    }
    const subjectValues = certificate.subject.attributes.map(
      (attribute: { value?: unknown }) => String(attribute.value ?? ''),
    );
    return {
      documents: extractCertificateDocuments(subjectValues),
      expiresAt,
      fingerprint: createHash('sha256')
        .update(Buffer.from(der, 'binary'))
        .digest('hex'),
      subject: certificate.subject.attributes
        .map(
          (attribute: { name?: string; shortName?: string; value?: unknown }) =>
            `${attribute.shortName ?? attribute.name}=${String(attribute.value)}`,
        )
        .join(', '),
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      'Nao foi possivel abrir o certificado A1. Confira o arquivo e a senha.',
    );
  }
}

export function extractCertificateDocuments(values: string[]): string[] {
  const documents = new Set<string>();
  for (const value of values) {
    const normalized = value.toUpperCase();
    const candidates = [
      ...(normalized.match(/[A-Z0-9]{14}/g) ?? []),
      ...(normalized.match(
        /[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}\/?[A-Z0-9]{4}-?\d{2}/g,
      ) ?? []),
    ];
    for (const candidate of candidates) {
      const document = normalizeBrazilianDocument(candidate);
      if (isValidCnpj(document)) documents.add(document);
    }
  }
  return [...documents];
}
