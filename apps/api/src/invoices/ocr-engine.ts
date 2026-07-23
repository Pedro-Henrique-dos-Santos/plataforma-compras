import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWorker, OEM } from 'tesseract.js';

import {
  resolvePortugueseOcrLanguageData,
  type PortugueseOcrLanguageData,
} from './ocr-language-data.js';

@Injectable()
export class OcrEngine {
  private readonly languageData: PortugueseOcrLanguageData;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.languageData = resolvePortugueseOcrLanguageData(
      config.get<string>('OCR_LANGUAGE_DATA_PATH'),
    );
  }

  async recognize(images: Buffer[]): Promise<string> {
    const worker = await createWorker(
      'por',
      OEM.LSTM_ONLY,
      {
        cacheMethod: 'readOnly',
        gzip: this.languageData.gzip,
        langPath: this.languageData.langPath,
      },
    );
    try {
      const pages: string[] = [];
      for (const image of images) {
        const result = await worker.recognize(image);
        pages.push(result.data.text);
      }
      return pages.join('\n\n');
    } finally {
      await worker.terminate();
    }
  }
}
