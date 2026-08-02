import 'reflect-metadata';

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { GoogleSheetsController } from '../automation/google-sheets.controller.js';
import { AuditController } from '../audit/audit.controller.js';
import { AuthController } from '../auth/auth.controller.js';
import { ALLOW_PENDING_LEGAL_ACCEPTANCE } from '../auth/legal-acceptance.decorator.js';
import { DashboardController } from '../dashboard/dashboard.controller.js';
import { HealthController } from '../health/health.controller.js';
import { InvoiceDocumentsController } from '../invoices/invoice-documents.controller.js';
import { CostCentersController } from '../master-data/cost-centers.controller.js';
import { SupplierPricesController } from '../master-data/supplier-prices.controller.js';
import { SuppliersController } from '../master-data/suppliers.controller.js';
import { MembersController } from '../organizations/members.controller.js';
import { OrganizationsController } from '../organizations/organizations.controller.js';
import { ApprovalsController } from '../purchases/approvals.controller.js';
import { PayablesController } from '../purchases/payables.controller.js';
import { PurchasesController } from '../purchases/purchases.controller.js';
import { ProcureToPayController } from '../procure-to-pay/procure-to-pay.controller.js';
import { ReceivablesController } from '../receivables/receivables.controller.js';
import { ReportsController } from '../reports/reports.controller.js';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator.js';

type ControllerClass = {
  name: string;
  prototype: object;
};

type RouteHandler = {
  handler: object;
  methodName: string;
};

const tenantControllers: ControllerClass[] = [
  AuditController,
  GoogleSheetsController,
  CostCentersController,
  DashboardController,
  InvoiceDocumentsController,
  MembersController,
  ApprovalsController,
  PayablesController,
  PurchasesController,
  ProcureToPayController,
  ReceivablesController,
  ReportsController,
  SupplierPricesController,
  SuppliersController,
];

const allControllers: ControllerClass[] = [
  ...tenantControllers,
  AuthController,
  HealthController,
  OrganizationsController,
];

const expectedControllerFiles = [
  'audit/audit.controller.ts',
  'auth/auth.controller.ts',
  'automation/google-sheets.controller.ts',
  'dashboard/dashboard.controller.ts',
  'health/health.controller.ts',
  'invoices/invoice-documents.controller.ts',
  'master-data/cost-centers.controller.ts',
  'master-data/supplier-prices.controller.ts',
  'master-data/suppliers.controller.ts',
  'organizations/members.controller.ts',
  'organizations/organizations.controller.ts',
  'purchases/approvals.controller.ts',
  'purchases/payables.controller.ts',
  'purchases/purchases.controller.ts',
  'procure-to-pay/procure-to-pay.controller.ts',
  'receivables/receivables.controller.ts',
  'reports/reports.controller.ts',
].sort();

describe('controller route security policy', () => {
  it('requires every controller source to have an explicit policy', () => {
    const sourceRoot = fileURLToPath(new URL('../', import.meta.url));

    expect(findControllerFiles(sourceRoot, sourceRoot).sort()).toEqual(
      expectedControllerFiles,
    );
  });

  it('protects every tenant route with authentication, organization and permission guards', () => {
    for (const controller of tenantControllers) {
      const routes = routeHandlers(controller);
      expect(routes.length, `${controller.name} must expose at least one route`).toBeGreaterThan(0);

      for (const route of routes) {
        const label = `${controller.name}.${route.methodName}`;
        expect(effectiveGuardNames(controller, route.handler), label).toEqual(
          expect.arrayContaining([
            'AuthGuard',
            'OrganizationAccessGuard',
            'PermissionsGuard',
          ]),
        );
        expect(
          effectivePermissions(controller, route.handler).length,
          `${label} must declare a permission`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps public, identity and organization routes within their narrower policies', () => {
    assertRoutePolicy(HealthController, 'live', [], []);
    assertRoutePolicy(HealthController, 'liveness', [], []);
    assertRoutePolicy(HealthController, 'readiness', [], []);

    assertRoutePolicy(AuthController, 'getMe', ['AuthGuard'], []);
    assertRoutePolicy(AuthController, 'updateProfile', ['AuthGuard'], []);

    assertRoutePolicy(OrganizationsController, 'list', ['AuthGuard'], []);
    assertRoutePolicy(
      OrganizationsController,
      'create',
      ['AuthGuard', 'PermissionsGuard'],
      ['platform:manage'],
    );
    assertRoutePolicy(
      OrganizationsController,
      'update',
      ['AuthGuard', 'OrganizationAccessGuard', 'PermissionsGuard'],
      ['organization:manage'],
    );
  });

  it('limits the pending legal acceptance bypass to identity completion routes', () => {
    const bypassedRoutes = allControllers.flatMap((controller) =>
      routeHandlers(controller)
        .filter((route) =>
          Reflect.getMetadata(ALLOW_PENDING_LEGAL_ACCEPTANCE, route.handler),
        )
        .map((route) => `${controller.name}.${route.methodName}`),
    );

    expect(bypassedRoutes.sort()).toEqual([
      'AuthController.getMe',
      'AuthController.updateProfile',
    ]);
  });
});

function assertRoutePolicy(
  controller: ControllerClass,
  methodName: string,
  expectedGuards: string[],
  expectedPermissions: string[],
): void {
  const route = routeHandlers(controller).find(
    (candidate) => candidate.methodName === methodName,
  );
  expect(route, `${controller.name}.${methodName} must be a route`).toBeDefined();
  if (!route) return;

  expect(effectiveGuardNames(controller, route.handler).sort()).toEqual(
    [...expectedGuards].sort(),
  );
  expect(effectivePermissions(controller, route.handler).sort()).toEqual(
    [...expectedPermissions].sort(),
  );
}

function routeHandlers(controller: ControllerClass): RouteHandler[] {
  return Object.getOwnPropertyNames(controller.prototype).flatMap(
    (methodName) => {
      if (methodName === 'constructor') return [];
      const descriptor = Object.getOwnPropertyDescriptor(
        controller.prototype,
        methodName,
      );
      const handler = descriptor?.value as unknown;
      if (
        typeof handler !== 'function' ||
        !Reflect.hasMetadata(METHOD_METADATA, handler)
      ) {
        return [];
      }
      return [{ handler, methodName }];
    },
  );
}

function effectiveGuardNames(
  controller: ControllerClass,
  handler: object,
): string[] {
  return unique([
    ...metadataArray<unknown>(GUARDS_METADATA, controller),
    ...metadataArray<unknown>(GUARDS_METADATA, handler),
  ])
    .map(guardName)
    .filter(Boolean);
}

function effectivePermissions(
  controller: ControllerClass,
  handler: object,
): string[] {
  return unique([
    ...metadataArray<string>(REQUIRED_PERMISSIONS_KEY, controller),
    ...metadataArray<string>(REQUIRED_PERMISSIONS_KEY, handler),
  ]);
}

function metadataArray<T>(key: string, target: object): T[] {
  const metadata = Reflect.getMetadata(key, target) as unknown;
  return Array.isArray(metadata) ? (metadata as T[]) : [];
}

function guardName(guard: unknown): string {
  if (typeof guard === 'function') return guard.name;
  if (guard && typeof guard === 'object') return guard.constructor.name;
  return '';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function findControllerFiles(
  directory: string,
  sourceRoot: string,
): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findControllerFiles(fullPath, sourceRoot);
    }
    if (!entry.isFile() || !entry.name.endsWith('.controller.ts')) return [];
    return [path.relative(sourceRoot, fullPath).replaceAll(path.sep, '/')];
  });
}
