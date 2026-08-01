import { gunzipSync } from 'node:zlib';
import { request } from 'node:https';

import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isValidCnpj,
  normalizeBrazilianDocument,
  normalizeNfeAccessKey,
  type FiscalEnvironment,
  type RecipientManifestation,
} from '@compras/contracts';
import { XMLParser } from 'fast-xml-parser';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (tagName) => stripNamespace(tagName) === 'docZip',
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
  trimValues: true,
});

export type SefazDistributedDocument = {
  nsu: string;
  schema: string;
  xml: Buffer;
};

export type SefazDistributionResult = {
  documents: SefazDistributedDocument[];
  lastNsu: string;
  maxNsu: string;
  statusCode: string;
  statusMessage: string;
};

export type SefazManifestationResult = {
  protocol: string | null;
  statusCode: string;
  statusMessage: string;
};

@Injectable()
export class SefazNfeClient {
  private readonly homologationUrl: string;
  private readonly productionUrl: string;
  private readonly manifestationHomologationUrl: string;
  private readonly manifestationProductionUrl: string;
  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.homologationUrl = config.get<string>(
      'SEFAZ_NFE_DISTRIBUTION_HOMOLOGATION_URL',
      'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    );
    this.productionUrl = config.get<string>(
      'SEFAZ_NFE_DISTRIBUTION_PRODUCTION_URL',
      'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    );
    this.manifestationHomologationUrl = config.get<string>(
      'SEFAZ_NFE_MANIFESTATION_HOMOLOGATION_URL',
      'https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    );
    this.manifestationProductionUrl = config.get<string>(
      'SEFAZ_NFE_MANIFESTATION_PRODUCTION_URL',
      'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    );
    this.timeoutMs = config.get<number>('SEFAZ_REQUEST_TIMEOUT_MS', 30_000);
  }

  async distribute(input: {
    environment: FiscalEnvironment;
    lastNsu: string;
    passphrase: string;
    pfx: Buffer;
    taxpayerDocument: string;
  }): Promise<SefazDistributionResult> {
    const url =
      input.environment === 'PRODUCTION'
        ? this.productionUrl
        : this.homologationUrl;
    const body = buildDistributionEnvelope(
      input.environment,
      input.taxpayerDocument,
      input.lastNsu,
    );
    const response = await postSoap({
      action:
        'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse',
      body,
      passphrase: input.passphrase,
      pfx: input.pfx,
      timeoutMs: this.timeoutMs,
      url,
    });
    return parseSefazDistributionResponse(response);
  }

  async manifest(input: {
    accessKey: string;
    environment: FiscalEnvironment;
    manifestation: RecipientManifestation;
    passphrase: string;
    pfx: Buffer;
    reason: string | null;
    taxpayerDocument: string;
  }): Promise<SefazManifestationResult> {
    const url =
      input.environment === 'PRODUCTION'
        ? this.manifestationProductionUrl
        : this.manifestationHomologationUrl;
    const event = signedManifestationEvent(input);
    const response = await postSoap({
      action:
        'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento',
      body: manifestationEnvelope(event),
      passphrase: input.passphrase,
      pfx: input.pfx,
      timeoutMs: this.timeoutMs,
      url,
    });
    return parseManifestationResponse(response);
  }
}

export function parseSefazDistributionResponse(
  response: string,
): SefazDistributionResult {
  const parsed = parser.parse(response) as unknown;
  let result = findByKey(parsed, 'nfeDistDFeInteresseResult');
  if (typeof result === 'string') {
    result = parser.parse(decodeXml(result)) as unknown;
  }
  const responseNode =
    asRecord(findByKey(result ?? parsed, 'retDistDFeInt')) ??
    asRecord(result);
  if (!responseNode) {
    throw new BadGatewayException('A SEFAZ retornou uma resposta nao reconhecida.');
  }
  const statusCode = textValue(responseNode['cStat']);
  const statusMessage = textValue(responseNode['xMotivo']);
  const lastNsu = padNsu(textValue(responseNode['ultNSU']));
  const maxNsu = padNsu(textValue(responseNode['maxNSU']));
  if (!statusCode) {
    throw new BadGatewayException('A resposta da SEFAZ nao informou o status.');
  }
  if (!['137', '138', '656'].includes(statusCode)) {
    throw new BadGatewayException(
      `Consulta de NF-e recusada pela SEFAZ (${statusCode}): ${statusMessage || 'sem detalhe'}.`,
    );
  }
  const batch = asRecord(responseNode['loteDistDFeInt']);
  const zipped = arrayValue(batch?.['docZip']).slice(0, 50);
  const documents = zipped.map((entry) => {
    const record = asRecord(entry);
    const encoded = record ? textValue(record['#text']) : textValue(entry);
    const nsu = padNsu(record ? textValue(record['@_NSU']) : '');
    const schema = record ? textValue(record['@_schema']) : '';
    if (!encoded || !nsu || !schema) {
      throw new BadGatewayException('A SEFAZ retornou um documento incompleto.');
    }
    const compressed = Buffer.from(encoded, 'base64');
    if (!compressed.length || compressed.length > 10 * 1024 * 1024) {
      throw new BadGatewayException('Documento compactado da SEFAZ fora do limite.');
    }
    const xml = gunzipSync(compressed, { maxOutputLength: 20 * 1024 * 1024 });
    return { nsu, schema, xml };
  });
  return {
    documents,
    lastNsu,
    maxNsu,
    statusCode,
    statusMessage,
  };
}

export function buildDistributionEnvelope(
  environment: FiscalEnvironment,
  taxpayerDocument: string,
  lastNsu: string,
): string {
  const tpAmb = environment === 'PRODUCTION' ? '1' : '2';
  const cnpj = normalizeBrazilianDocument(taxpayerDocument);
  if (!isValidCnpj(cnpj)) {
    throw new BadGatewayException('CNPJ invalido para a distribuicao de NF-e.');
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <cUF>91</cUF><versaoDados>1.01</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
          <tpAmb>${tpAmb}</tpAmb><cUFAutor>91</cUFAutor><CNPJ>${escapeXml(cnpj)}</CNPJ>
          <distNSU><ultNSU>${padNsu(lastNsu)}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

export function signedManifestationEvent(input: {
  accessKey: string;
  environment: FiscalEnvironment;
  manifestation: RecipientManifestation;
  passphrase: string;
  pfx: Buffer;
  reason: string | null;
  taxpayerDocument: string;
}): string {
  const event = manifestationDefinition(input.manifestation);
  const accessKey = normalizeNfeAccessKey(input.accessKey);
  const taxpayerDocument = normalizeBrazilianDocument(input.taxpayerDocument);
  if (!/^[A-Z0-9]{44}$/.test(accessKey) || !isValidCnpj(taxpayerDocument)) {
    throw new BadGatewayException('Chave de acesso ou CNPJ invalido para manifestacao.');
  }
  const eventId = `ID${event.code}${accessKey}01`;
  const justification =
    input.manifestation === 'OPERATION_NOT_PERFORMED'
      ? `<xJust>${escapeXml(input.reason ?? '')}</xJust>`
      : '';
  const content =
    `<infEvento Id="${eventId}">` +
    `<cOrgao>91</cOrgao>` +
    `<tpAmb>${input.environment === 'PRODUCTION' ? '1' : '2'}</tpAmb>` +
    `<CNPJ>${taxpayerDocument}</CNPJ>` +
    `<chNFe>${accessKey}</chNFe>` +
    `<dhEvento>${brazilTimestamp()}</dhEvento>` +
    `<tpEvento>${event.code}</tpEvento>` +
    `<nSeqEvento>1</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>${event.description}</descEvento>${justification}</detEvento>` +
    `</infEvento>`;
  const credentials = extractSigningCredentials(input.pfx, input.passphrase);
  const unsignedEvent =
    `<evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `${content}</evento>`;
  const signature = new SignedXml({
    canonicalizationAlgorithm:
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${credentials.certificateBase64}</X509Certificate></X509Data>`,
    privateKey: credentials.privateKeyPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  });
  signature.addReference({
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    xpath: `//*[local-name(.)='infEvento' and @Id='${eventId}']`,
  });
  signature.computeSignature(unsignedEvent, {
    location: {
      action: 'after',
      reference: `//*[local-name(.)='infEvento' and @Id='${eventId}']`,
    },
  });
  return (
    `<envEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<idLote>${String(Date.now()).padStart(15, '0').slice(-15)}</idLote>` +
    `${signature.getSignedXml()}` +
    `</envEvento>`
  );
}

function manifestationEnvelope(event: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><cUF>91</cUF><versaoDados>1.00</versaoDados></nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><nfeDadosMsg>${event}</nfeDadosMsg></nfeRecepcaoEvento>
  </soap12:Body>
</soap12:Envelope>`;
}

export function parseManifestationResponse(response: string): SefazManifestationResult {
  const parsed = parser.parse(response) as unknown;
  let result = findByKey(parsed, 'nfeRecepcaoEventoResult');
  if (typeof result === 'string') result = parser.parse(decodeXml(result)) as unknown;
  const batch = asRecord(findByKey(result ?? parsed, 'retEnvEvento')) ?? asRecord(result);
  if (!batch) throw new BadGatewayException('A SEFAZ retornou uma manifestacao nao reconhecida.');
  const batchStatus = textValue(batch.cStat);
  if (batchStatus && batchStatus !== '128') {
    throw new BadGatewayException(
      `Lote de manifestacao recusado pela SEFAZ (${batchStatus}): ${textValue(batch.xMotivo) || 'sem detalhe'}.`,
    );
  }
  const event = asRecord(findByKey(batch, 'infEvento'));
  if (!event) throw new BadGatewayException('A SEFAZ nao retornou o resultado do evento.');
  const statusCode = textValue(event.cStat);
  const statusMessage = textValue(event.xMotivo);
  if (!['135', '136', '573'].includes(statusCode)) {
    throw new BadGatewayException(
      `Manifestacao recusada pela SEFAZ (${statusCode || 'sem status'}): ${statusMessage || 'sem detalhe'}.`,
    );
  }
  return {
    protocol: textValue(event.nProt) || null,
    statusCode,
    statusMessage,
  };
}

function manifestationDefinition(
  manifestation: RecipientManifestation,
): { code: string; description: string } {
  return {
    SCIENCE: { code: '210210', description: 'Ciencia da Operacao' },
    CONFIRMATION: { code: '210200', description: 'Confirmacao da Operacao' },
    UNKNOWN_OPERATION: { code: '210220', description: 'Desconhecimento da Operacao' },
    OPERATION_NOT_PERFORMED: { code: '210240', description: 'Operacao nao Realizada' },
  }[manifestation];
}

function extractSigningCredentials(
  pfx: Buffer,
  passphrase: string,
): { certificateBase64: string; privateKeyPem: string } {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    const store = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
    const certBagOid = forge.pki.oids.certBag;
    const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag;
    if (!certBagOid || !keyBagOid) throw new Error('PKCS12 OIDs unavailable');
    const certificates = store.getBags({ bagType: certBagOid });
    const certificate = certificates[certBagOid]?.find(
      (bag: forge.pkcs12.Bag) => bag.cert,
    )?.cert;
    const keys = store.getBags({ bagType: keyBagOid });
    const privateKey = keys[keyBagOid]?.find((bag: forge.pkcs12.Bag) => bag.key)?.key;
    if (!certificate || !privateKey) throw new Error('credentials missing');
    const certificateDer = forge.asn1
      .toDer(forge.pki.certificateToAsn1(certificate))
      .getBytes();
    return {
      certificateBase64: Buffer.from(certificateDer, 'binary').toString('base64'),
      privateKeyPem: forge.pki.privateKeyToPem(privateKey),
    };
  } catch {
    throw new BadGatewayException('Nao foi possivel assinar a manifestacao com o certificado A1.');
  }
}

function brazilTimestamp(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const localAsUtc = Date.parse(`${local}Z`);
  const offsetMinutes = Math.round((localAsUtc - now.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `${local}${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function postSoap(input: {
  action: string;
  body: string;
  passphrase: string;
  pfx: Buffer;
  timeoutMs: number;
  url: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = new URL(input.url);
    const operation = request(
      target,
      {
        method: 'POST',
        pfx: input.pfx,
        passphrase: input.passphrase,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        headers: {
          Accept: 'application/soap+xml, text/xml',
          'Content-Length': Buffer.byteLength(input.body),
          'Content-Type':
            `application/soap+xml; charset=utf-8; action="${input.action}"`,
          'User-Agent': 'E-Gestao-Compras/1.0',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 25 * 1024 * 1024) {
            response.destroy(new Error('SEFAZ response exceeded the limit'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (!response.statusCode || response.statusCode >= 400) {
            reject(
              new BadGatewayException(
                `A SEFAZ respondeu com HTTP ${response.statusCode ?? 0}.`,
              ),
            );
            return;
          }
          resolve(body);
        });
      },
    );
    operation.setTimeout(input.timeoutMs, () => {
      operation.destroy(new Error('SEFAZ request timed out'));
    });
    operation.on('error', () => {
      reject(
        new ServiceUnavailableException(
          'Nao foi possivel consultar a distribuicao de NF-e na SEFAZ.',
        ),
      );
    });
    operation.end(input.body);
  });
}

function findByKey(value: unknown, key: string, depth = 0): unknown {
  if (depth > 30) return null;
  const record = asRecord(value);
  if (!record) return null;
  for (const [candidate, nested] of Object.entries(record)) {
    if (stripNamespace(candidate).toLowerCase() === key.toLowerCase()) return nested;
  }
  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const result = findByKey(item, key, depth + 1);
        if (result !== null) return result;
      }
    } else {
      const result = findByKey(nested, key, depth + 1);
      if (result !== null) return result;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const record = asRecord(value);
  return record ? textValue(record['#text']) : '';
}

function stripNamespace(value: string): string {
  return value.includes(':') ? value.split(':').at(-1) ?? value : value;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function padNsu(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.padStart(15, '0').slice(-15);
}
