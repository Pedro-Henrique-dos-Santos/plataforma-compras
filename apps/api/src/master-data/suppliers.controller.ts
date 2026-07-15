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
  createSupplierInputSchema,
  type CreateSupplierInput,
  type OrganizationSummary,
  supplierStatusSchema,
  updateSupplierInputSchema,
  type UpdateSupplierInput,
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
  search: z.string().trim().max(160).optional(),
  status: supplierStatusSchema.optional(),
});

@Controller('suppliers')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class SuppliersController {
  constructor(
    @Inject(MasterDataService)
    private readonly masterData: MasterDataService,
  ) {}

  @Get()
  @RequirePermission('supplier:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>,
  ) {
    return this.masterData.listSuppliers(organization.id, query);
  }

  @Post()
  @RequirePermission('supplier:write')
  create(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createSupplierInputSchema)) input: CreateSupplierInput,
  ) {
    return this.masterData.createSupplier(actor, organization.id, input);
  }

  @Patch(':id')
  @RequirePermission('supplier:write')
  update(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSupplierInputSchema)) input: UpdateSupplierInput,
  ) {
    return this.masterData.updateSupplier(actor, organization.id, id, input);
  }
}
