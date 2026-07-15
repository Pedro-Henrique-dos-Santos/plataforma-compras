import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { readExcelWorkbook } from './excel-workbook.reader.js';

describe('Excel workbook reader', () => {
  it('reads XLSX values, formula results and preserves source row numbers', async () => {
    const source = new ExcelJS.Workbook();
    source.title = 'Planilha de compras';
    const sheet = source.addWorksheet('Itens do Pedido');
    sheet.getCell('A1').value = 'Numero do Pedido';
    sheet.getCell('A3').value = 'PED-1';
    sheet.getCell('B3').value = { formula: '1+1', result: 2 };

    const buffer = Buffer.from(await source.xlsx.writeBuffer());
    const workbook = await readExcelWorkbook(buffer, 'compras.xlsx');

    expect(workbook.spreadsheetTitle).toBe('Planilha de compras');
    expect(workbook.tables['Itens do Pedido']?.values).toEqual([
      ['Numero do Pedido', null],
      [null, null],
      ['PED-1', 2],
    ]);
  });

  it('rejects files that are not valid XLSX workbooks', async () => {
    await expect(
      readExcelWorkbook(Buffer.from('not-an-xlsx'), 'compras.xlsx'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      readExcelWorkbook(Buffer.from('PK-invalid'), 'compras.xlsm'),
    ).rejects.toThrow('formato XLSX');
  });
});
