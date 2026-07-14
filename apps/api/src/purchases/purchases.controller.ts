import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createPurchaseInputSchema,
  type CreatePurchaseInput,
  isoDateSchema,
  type OrganizationSummary,
  purchaseImportInputSchema,
  type PurchaseImportInput,
  purchaseStatusSchema,
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
import { PurchasesService } from './purchases.service.js';

const querySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: purchaseStatusSchema.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});

@Controller('purchases')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class PurchasesController {
  constructor(
    @Inject(PurchasesService)
    private readonly purchases: PurchasesService,
  ) {}

  @Get()
  @RequirePermission('purchase:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>,
  ) {
    return this.purchases.list(organization.id, query);
  }

  @Post()
  @RequirePermission('purchase:write')
  create(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createPurchaseInputSchema)) input: CreatePurchaseInput,
  ) {
    return this.purchases.create(actor, organization.id, input);
  }

  @Post('import')
  @RequirePermission('purchase:write')
  import(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(purchaseImportInputSchema)) input: PurchaseImportInput,
  ) {
    return this.purchases.import(actor, organization.id, input);
  }
}
