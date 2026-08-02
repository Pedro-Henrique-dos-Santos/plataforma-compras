import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  organizationDocumentSchema,
  supplierCnpjLookupSchema,
  type SupplierCnpjLookup,
} from '@compras/contracts';
import { z } from 'zod';

const providerResponseSchema = z
  .object({
    bairro: z.string().nullish(),
    cep: z.union([z.string(), z.number()]).nullish(),
    cnae_fiscal_descricao: z.string().nullish(),
    cnpj: z.union([z.string(), z.number()]),
    complemento: z.string().nullish(),
    ddd_telefone_1: z.union([z.string(), z.number()]).nullish(),
    descricao_situacao_cadastral: z.string().nullish(),
    descricao_tipo_de_logradouro: z.string().nullish(),
    email: z.string().nullish(),
    logradouro: z.string().nullish(),
    municipio: z.string().nullish(),
    nome_fantasia: z.string().nullish(),
    numero: z.union([z.string(), z.number()]).nullish(),
    razao_social: z.string(),
    uf: z.string().nullish(),
  })
  .passthrough();

@Injectable()
export class CnpjLookupService {
  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.timeoutMs = Number(config.get<string>('CNPJ_LOOKUP_TIMEOUT_MS', '6000'));
  }

  async lookup(rawDocument: string): Promise<SupplierCnpjLookup> {
    const parsedDocument = organizationDocumentSchema.safeParse(rawDocument);
    if (!parsedDocument.success) {
      throw new BadRequestException('Informe um CNPJ valido para consultar.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(parsedDocument.data)}`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );
      if (response.status === 404) {
        throw new NotFoundException('CNPJ nao encontrado na base publica consultada.');
      }
      if (!response.ok) {
        throw new BadGatewayException(
          'A consulta publica de CNPJ esta indisponivel no momento.',
        );
      }

      const provider = providerResponseSchema.safeParse(await response.json());
      if (!provider.success) {
        throw new BadGatewayException(
          'A consulta de CNPJ retornou dados em um formato inesperado.',
        );
      }
      const data = provider.data;
      const document = organizationDocumentSchema.safeParse(String(data.cnpj));
      if (!document.success || document.data !== parsedDocument.data) {
        throw new BadGatewayException('A consulta de CNPJ retornou outro documento.');
      }

      const lookup = supplierCnpjLookupSchema.safeParse({
        document: document.data,
        legalName: limited(data.razao_social, 160),
        tradeName: limited(data.nome_fantasia, 160),
        email: normalizedEmail(data.email),
        phone: limited(data.ddd_telefone_1, 30),
        postalCode: postalCode(data.cep),
        street: street(data.descricao_tipo_de_logradouro, data.logradouro),
        addressNumber: limited(data.numero, 30),
        addressComplement: limited(data.complemento, 100),
        district: limited(data.bairro, 100),
        city: limited(data.municipio, 100),
        state: state(data.uf),
        registrationStatus: limited(data.descricao_situacao_cadastral, 80),
        primaryActivity: limited(data.cnae_fiscal_descricao, 240),
        source: 'BRASIL_API',
        queriedAt: new Date().toISOString(),
      });
      if (!lookup.success) {
        throw new BadGatewayException(
          'A consulta de CNPJ retornou dados cadastrais incompletos.',
        );
      }
      return lookup.data;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException('A consulta de CNPJ excedeu o tempo limite.');
      }
      throw new BadGatewayException(
        'Nao foi possivel acessar a consulta publica de CNPJ.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function limited(value: string | number | null | undefined, maximum: number) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? text.slice(0, maximum) : null;
}

function normalizedEmail(value: string | null | undefined): string | null {
  const email = limited(value, 255)?.toLowerCase() ?? null;
  return email && z.string().email().safeParse(email).success ? email : null;
}

function postalCode(value: string | number | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

function state(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function street(type: string | null | undefined, name: string | null | undefined) {
  const streetName = name?.trim() ?? '';
  const streetType = type?.trim() ?? '';
  if (!streetName) return null;
  if (!streetType || streetName.toLowerCase().startsWith(streetType.toLowerCase())) {
    return streetName.slice(0, 160);
  }
  return `${streetType} ${streetName}`.slice(0, 160);
}
