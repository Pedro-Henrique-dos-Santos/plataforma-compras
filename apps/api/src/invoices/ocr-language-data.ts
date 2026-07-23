import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

type PackagedLanguageData = {
  code: string;
  gzip: boolean;
  langPath: string;
};

export type PortugueseOcrLanguageData = {
  filePath: string;
  gzip: boolean;
  langPath: string;
  source: 'BUNDLED' | 'CONFIGURED';
};

const require = createRequire(import.meta.url);
const packagedLanguageData = require(
  '@tesseract.js-data/por',
) as PackagedLanguageData;

export function resolvePortugueseOcrLanguageData(
  configuredPath?: string,
): PortugueseOcrLanguageData {
  const override = configuredPath?.trim();
  if (override) {
    return resolveLanguageDirectory(resolve(override), 'CONFIGURED');
  }

  const packageRoot = dirname(packagedLanguageData.langPath);
  const accurateModelPath = join(packageRoot, '4.0.0_best_int');
  const bundledPath = hasPortugueseModel(accurateModelPath)
    ? accurateModelPath
    : packagedLanguageData.langPath;

  return resolveLanguageDirectory(bundledPath, 'BUNDLED');
}

function resolveLanguageDirectory(
  langPath: string,
  source: PortugueseOcrLanguageData['source'],
): PortugueseOcrLanguageData {
  const compressedPath = join(langPath, 'por.traineddata.gz');
  if (existsSync(compressedPath)) {
    return {
      filePath: compressedPath,
      gzip: true,
      langPath,
      source,
    };
  }

  const uncompressedPath = join(langPath, 'por.traineddata');
  if (existsSync(uncompressedPath)) {
    return {
      filePath: uncompressedPath,
      gzip: false,
      langPath,
      source,
    };
  }

  throw new Error(
    `Dados OCR de portugues nao encontrados em ${langPath}. Esperado por.traineddata.gz ou por.traineddata.`,
  );
}

function hasPortugueseModel(langPath: string): boolean {
  return (
    existsSync(join(langPath, 'por.traineddata.gz')) ||
    existsSync(join(langPath, 'por.traineddata'))
  );
}
