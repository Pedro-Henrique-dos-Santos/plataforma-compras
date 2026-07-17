import { describe, expect, it } from 'vitest';

import { reportDataSourceLabel } from './ReportsView';

describe('report data source label', () => {
  it('does not identify an unfinished request as demonstration data', () => {
    expect(reportDataSourceLabel(undefined)).toBe('Carregando dados');
  });

  it('identifies database and demonstration reports explicitly', () => {
    expect(reportDataSourceLabel('DATABASE')).toBe('Dados da empresa');
    expect(reportDataSourceLabel('DEMO')).toBe('Dados de demonstracao');
  });
});
