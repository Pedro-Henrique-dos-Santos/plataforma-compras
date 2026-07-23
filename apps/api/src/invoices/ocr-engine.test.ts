import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tesseract = vi.hoisted(() => ({
  createWorker: vi.fn(),
}));

vi.mock('tesseract.js', () => ({
  createWorker: tesseract.createWorker,
  OEM: { LSTM_ONLY: 1 },
}));

import { OcrEngine } from './ocr-engine.js';
import { resolvePortugueseOcrLanguageData } from './ocr-language-data.js';

describe('OcrEngine', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the bundled accurate Portuguese model without runtime downloads', async () => {
    const worker = mockWorker(['pagina 1', 'pagina 2']);
    tesseract.createWorker.mockResolvedValue(worker);

    const engine = new OcrEngine(new ConfigService({}));
    await expect(
      engine.recognize([Buffer.from('one'), Buffer.from('two')]),
    ).resolves.toBe('pagina 1\n\npagina 2');

    const bundled = resolvePortugueseOcrLanguageData();
    expect(bundled.source).toBe('BUNDLED');
    expect(bundled.langPath).toContain('4.0.0_best_int');
    expect(tesseract.createWorker).toHaveBeenCalledWith(
      'por',
      1,
      expect.objectContaining({
        cacheMethod: 'readOnly',
        gzip: true,
        langPath: bundled.langPath,
      }),
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('accepts an explicit uncompressed language directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'compras-ocr-'));
    try {
      await writeFile(join(directory, 'por.traineddata'), 'fixture');
      const worker = mockWorker(['texto']);
      tesseract.createWorker.mockResolvedValue(worker);

      const engine = new OcrEngine(
        new ConfigService({ OCR_LANGUAGE_DATA_PATH: directory }),
      );
      await engine.recognize([Buffer.from('image')]);

      expect(tesseract.createWorker).toHaveBeenCalledWith(
        'por',
        1,
        expect.objectContaining({
          cacheMethod: 'readOnly',
          gzip: false,
          langPath: directory,
        }),
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('fails fast when an override does not contain Portuguese data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'compras-ocr-empty-'));
    try {
      expect(
        () =>
          new OcrEngine(
            new ConfigService({ OCR_LANGUAGE_DATA_PATH: directory }),
          ),
      ).toThrow(/Dados OCR de portugues nao encontrados/);
      expect(tesseract.createWorker).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function mockWorker(texts: string[]) {
  return {
    recognize: vi.fn(
      async () => ({ data: { text: texts.shift() ?? '' } }),
    ),
    terminate: vi.fn(async () => undefined),
  };
}
