import { basename, extname } from 'node:path';

import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { CellValue, Worksheet } from 'exceljs';
import { sheetWorkbookUploadConstraints } from '@compras/contracts';

import type { SheetWorkbook } from './sheet-sync.types.js';

const MAX_WORKSHEETS = 40;
const MAX_ROWS_PER_SHEET = 10_000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_CELL_TEXT_LENGTH = 10_000;

export async function readExcelWorkbook(
  buffer: Buffer,
  originalName: string,
): Promise<SheetWorkbook> {
  validateFile(buffer, originalName);

  try {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = Uint8Array.from(buffer).buffer;
    await workbook.xlsx.load(arrayBuffer);
    if (!workbook.worksheets.length) {
      throw new BadRequestException('O arquivo Excel nao possui abas para importar.');
    }
    if (workbook.worksheets.length > MAX_WORKSHEETS) {
      throw new BadRequestException(
        `O arquivo excede o limite de ${MAX_WORKSHEETS} abas.`,
      );
    }

    const tables: SheetWorkbook['tables'] = {};
    for (const worksheet of workbook.worksheets) {
      tables[worksheet.name] = {
        name: worksheet.name,
        values: worksheetValues(worksheet),
      };
    }

    return {
      spreadsheetTitle: workbookTitle(workbook.title, originalName),
      tables,
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      'Nao foi possivel ler o arquivo. Exporte novamente a planilha no formato XLSX.',
    );
  }
}

function validateFile(buffer: Buffer, originalName: string): void {
  if (!buffer.length) {
    throw new BadRequestException('Selecione um arquivo Excel para importar.');
  }
  if (buffer.length > sheetWorkbookUploadConstraints.maximumBytes) {
    throw new BadRequestException('O arquivo Excel excede o limite de 10 MB.');
  }
  if (extname(originalName).toLowerCase() !== '.xlsx') {
    throw new BadRequestException('Envie uma planilha no formato XLSX.');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('O arquivo enviado nao e um XLSX valido.');
  }
}

function worksheetValues(worksheet: Worksheet): unknown[][] {
  let maximumRow = 0;
  let maximumColumn = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (!hasValue(cell.value)) return;
      maximumRow = Math.max(maximumRow, rowNumber);
      maximumColumn = Math.max(maximumColumn, columnNumber);
    });
  });

  if (maximumRow > MAX_ROWS_PER_SHEET || maximumColumn > MAX_COLUMNS_PER_SHEET) {
    throw new BadRequestException(
      `A aba ${worksheet.name} excede o limite de ${MAX_ROWS_PER_SHEET} linhas ou ${MAX_COLUMNS_PER_SHEET} colunas.`,
    );
  }

  const values: unknown[][] = [];
  for (let rowNumber = 1; rowNumber <= maximumRow; rowNumber += 1) {
    const row: unknown[] = [];
    for (let columnNumber = 1; columnNumber <= maximumColumn; columnNumber += 1) {
      row.push(normalizeCellValue(worksheet.getCell(rowNumber, columnNumber).value));
    }
    values.push(row);
  }
  return values;
}

function hasValue(value: CellValue): boolean {
  return value !== null && value !== undefined && value !== '';
}

function normalizeCellValue(value: CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') return limitedText(value);

  const structured = value as unknown as Record<string, unknown>;
  if ('result' in structured && structured.result !== undefined) {
    return normalizeCellValue(structured.result as CellValue);
  }
  if (Array.isArray(structured.richText)) {
    return limitedText(
      structured.richText
        .map((part) => String((part as Record<string, unknown>).text ?? ''))
        .join(''),
    );
  }
  if (typeof structured.text === 'string') return limitedText(structured.text);
  return null;
}

function limitedText(value: string): string {
  return value.slice(0, MAX_CELL_TEXT_LENGTH);
}

function workbookTitle(title: string | undefined, originalName: string): string {
  const fallback = basename(originalName, extname(originalName));
  const value = title?.trim() || fallback.trim() || 'Planilha importada';
  return value.slice(0, 160);
}
