import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createSupplierPriceInputSchema,
  type CreateSupplierPriceInput,
  importSupplierPricesInputSchema,
  type ImportSupplierPricesInput,
  type OrganizationSummary,
  priceStatusSchema,
  updateSupplierPriceInputSchema,
  type UpdateSupplierPriceInput,
} from '@compras/contracts';
import { z } from 'zod';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { MasterDataService } from './master-data.service.js';

const querySchema = z.object({
  search: z.string().trim().max(240).optional(),
  status: priceStatusSchema.optional(),
  supplierId: z.string().uuid().optional(),
});

@Controller('supplier-prices')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class SupplierPricesController {
  constructor(
    @Inject(MasterDataService)
    private readonly masterData: MasterDataService,
  ) {}

  @Get()
  @RequirePermission('price:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>,
  ) {
    return this.masterData.listSupplierPrices(organization.id, query);
  }

  @Post()
  @RequirePermission('price:write')
  create(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createSupplierPriceInputSchema))
    input: CreateSupplierPriceInput,
  ) {
    return this.masterData.createSupplierPrice(actor, organization.id, input);
  }

  @Post('import')
  @RequirePermission('price:write')
  import(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(importSupplierPricesInputSchema))
    input: ImportSupplierPricesInput,
  ) {
    return this.masterData.importSupplierPrices(actor, organization.id, input);
  }

  @Patch(':id')
  @RequirePermission('price:write')
  update(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSupplierPriceInputSchema))
    input: UpdateSupplierPriceInput,
  ) {
    return this.masterData.updateSupplierPrice(actor, organization.id, id, input);
  }
}
