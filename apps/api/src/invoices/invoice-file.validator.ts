import path from 'node:path';

import { BadRequestException } from '@nestjs/common';
import {
  invoiceUploadConstraints,
  type InvoiceDocumentKind,
} from '@compras/contracts';
import { fileTypeFromBuffer } from 'file-type';

export type UploadedInvoiceFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type ValidatedInvoiceFile = {
  buffer: Buffer;
  fileName: string;
  kind: InvoiceDocumentKind;
  mimeType: string;
  size: number;
};

export async function validateInvoiceFile(
  file: UploadedInvoiceFile | undefined,
): Promise<ValidatedInvoiceFile> {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Selecione um arquivo PDF ou XML valido.');
  }
  const size = file.buffer.length;
  const detected = await fileTypeFromBuffer(file.buffer);
  const isPdf = detected?.mime === 'application/pdf' || hasPdfSignature(file.buffer);
  const xmlText = isPdf ? '' : decodeXml(file.buffer);
  const isXml = Boolean(xmlText);
  if (!isPdf && !isXml) {
    throw new BadRequestException('O conteudo enviado nao e um PDF ou XML valido.');
  }

  const kind: InvoiceDocumentKind = isPdf ? 'PDF' : 'XML';
  const limit = isPdf
    ? invoiceUploadConstraints.maximumPdfBytes
    : invoiceUploadConstraints.maximumXmlBytes;
  if (size > limit) {
    const maximum = Math.round(limit / 1024 / 1024);
    throw new BadRequestException(`O arquivo excede o limite de ${maximum} MB.`);
  }
  if (isXml && /<!DOCTYPE|<!ENTITY/i.test(xmlText)) {
    throw new BadRequestException('XML com declaracoes externas nao e permitido.');
  }

  return {
    buffer: file.buffer,
    fileName: sanitizeFileName(file.originalname, kind),
    kind,
    mimeType: isPdf ? 'application/pdf' : 'application/xml',
    size,
  };
}

function hasPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function decodeXml(buffer: Buffer): string {
  if (buffer.subarray(0, Math.min(buffer.length, 4_096)).includes(0)) return '';
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  return text.startsWith('<') && text.endsWith('>') ? text : '';
}

function sanitizeFileName(
  originalName: string,
  kind: InvoiceDocumentKind,
): string {
  const extension = kind === 'PDF' ? '.pdf' : '.xml';
  const base = path
    .basename(originalName || `documento${extension}`, path.extname(originalName))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return `${base || 'documento-fiscal'}${extension}`;
}
