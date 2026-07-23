import { Inject, Injectable } from '@nestjs/common';
import { createCanvas } from '@napi-rs/canvas';
import { invoiceUploadConstraints } from '@compras/contracts';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { type InvoiceExtractionResult } from './invoice-extraction.utils.js';
import { extractInvoiceFromText } from './invoice-text.extractor.js';
import { OcrEngine } from './ocr-engine.js';

@Injectable()
export class InvoicePdfParser {
  constructor(@Inject(OcrEngine) private readonly ocr: OcrEngine) {}

  async parse(buffer: Buffer): Promise<InvoiceExtractionResult> {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });
    const document = await loadingTask.promise;
    try {
      if (document.numPages > invoiceUploadConstraints.maximumPdfPages) {
        throw new Error(
          `O PDF possui ${document.numPages} paginas; o limite e ${invoiceUploadConstraints.maximumPdfPages}.`,
        );
      }
      const text = await extractSearchableText(document);
      if (isSearchableInvoiceText(text)) {
        return extractInvoiceFromText(text, 'PDF_TEXT');
      }
      const images = await renderPages(document);
      let recognized: string;
      try {
        recognized = await this.ocr.recognize(images);
      } catch {
        throw new Error(
          'Nao foi possivel executar o OCR gratuito. Configure os dados do idioma portugues ou tente novamente.',
        );
      }
      if (!isSearchableInvoiceText(recognized)) {
        throw new Error('O OCR nao encontrou texto suficiente para conferir a nota fiscal.');
      }
      return extractInvoiceFromText(recognized, 'PDF_OCR');
    } finally {
      document.cleanup();
      await loadingTask.destroy();
    }
  }
}

export function isSearchableInvoiceText(value: string): boolean {
  const compact = value.replace(/\s/g, '');
  if (compact.length < 80) return false;
  const alphanumeric = compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return alphanumeric / compact.length >= 0.55;
}

async function extractSearchableText(
  document: Awaited<ReturnType<typeof getDocument>['promise']>,
): Promise<string> {
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      if (!isTextItem(item)) continue;
      pageText += `${item.str}${item.hasEOL ? '\n' : ' '}`;
    }
    pages.push(pageText);
  }
  return pages.join('\n\n');
}

async function renderPages(
  document: Awaited<ReturnType<typeof getDocument>['promise']>,
): Promise<Buffer[]> {
  const images: Buffer[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    const renderParameters = {
      canvasContext: context,
      viewport,
    } as unknown as Parameters<typeof page.render>[0];
    await page.render(renderParameters).promise;
    images.push(canvas.toBuffer('image/png'));
  }
  return images;
}

function isTextItem(value: unknown): value is { hasEOL?: boolean; str: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'str' in value &&
    typeof (value as { str?: unknown }).str === 'string'
  );
}
