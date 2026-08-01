import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CnpjLookupService } from './cnpj-lookup.service.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CnpjLookupService', () => {
  it('maps the public provider response without persisting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          bairro: 'Centro',
          cep: '01001000',
          cnae_fiscal_descricao: 'Servicos administrativos',
          cnpj: '43043093000144',
          complemento: 'Sala 10',
          ddd_telefone_1: '1130000000',
          descricao_situacao_cadastral: 'ATIVA',
          descricao_tipo_de_logradouro: 'Praca',
          email: 'CONTATO@EXAMPLE.COM',
          logradouro: 'da Se',
          municipio: 'Sao Paulo',
          nome_fantasia: 'Empresa Exemplo',
          numero: '100',
          razao_social: 'Empresa Exemplo Ltda',
          uf: 'sp',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new CnpjLookupService({
      get: () => '6000',
    } as never);

    await expect(service.lookup('43.043.093/0001-44')).resolves.toMatchObject({
      document: '43043093000144',
      legalName: 'Empresa Exemplo Ltda',
      tradeName: 'Empresa Exemplo',
      email: 'contato@example.com',
      postalCode: '01001000',
      street: 'Praca da Se',
      city: 'Sao Paulo',
      state: 'SP',
      registrationStatus: 'ATIVA',
      source: 'BRASIL_API',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects invalid documents before calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new CnpjLookupService({ get: () => '6000' } as never);

    await expect(service.lookup('123')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing public registration without leaking provider details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 404 })),
    );
    const service = new CnpjLookupService({ get: () => '6000' } as never);

    await expect(service.lookup('43043093000144')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
