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
  createCostCenterInputSchema,
  type CreateCostCenterInput,
  type OrganizationSummary,
  updateCostCenterInputSchema,
  type UpdateCostCenterInput,
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
  search: z.string().trim().max(120).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

@Controller('cost-centers')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class CostCentersController {
  constructor(
    @Inject(MasterDataService)
    private readonly masterData: MasterDataService,
  ) {}

  @Get()
  @RequirePermission('cost-center:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>,
  ) {
    return this.masterData.listCostCenters(organization.id, query);
  }

  @Post()
  @RequirePermission('cost-center:write')
  create(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createCostCenterInputSchema)) input: CreateCostCenterInput,
  ) {
    return this.masterData.createCostCenter(actor, organization.id, input);
  }

  @Patch(':id')
  @RequirePermission('cost-center:write')
  update(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCostCenterInputSchema)) input: UpdateCostCenterInput,
  ) {
    return this.masterData.updateCostCenter(actor, organization.id, id, input);
  }
}
