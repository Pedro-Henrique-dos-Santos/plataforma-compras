import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWorker, OEM } from 'tesseract.js';

@Injectable()
export class OcrEngine {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async recognize(images: Buffer[]): Promise<string> {
    const languageDataPath = this.config.get<string>('OCR_LANGUAGE_DATA_PATH');
    const worker = await createWorker(
      'por',
      OEM.LSTM_ONLY,
      languageDataPath ? { langPath: languageDataPath } : undefined,
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
