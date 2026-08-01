import {
  hasAccessPermission,
  type OrganizationSummary,
  type UserContext,
} from '@compras/contracts';

type AccessUser = Pick<UserContext, 'platformRoles'>;
type ActiveOrganization = Pick<OrganizationSummary, 'role'>;

export function getOrganizationCapabilities(
  user: AccessUser,
  organization: ActiveOrganization,
) {
  const allowed = (permission: Parameters<typeof hasAccessPermission>[2]) =>
    hasAccessPermission(
      user.platformRoles,
      organization.role,
      permission,
    );

  return {
    canManageMembers: allowed('member:manage'),
    canManageApprovals: allowed('approval:manage'),
    canManageOrganization: allowed('organization:manage'),
    canManagePlatform: allowed('platform:manage'),
    canWriteCostCenters: allowed('cost-center:write'),
    canWriteIntegrations: allowed('integration:write'),
    canWriteInvoices: allowed('invoice:write'),
    canWritePrices: allowed('price:write'),
    canWritePurchases: allowed('purchase:write'),
    canActOnApprovals: allowed('approval:act'),
    canWritePayables: allowed('payable:write'),
    canSettlePayments: allowed('payment:settle'),
    canActOnPaymentApprovals: allowed('payment-approval:act'),
    canManagePaymentApprovals: allowed('payment-approval:manage'),
    canManageFiscalIntegration: allowed('fiscal-integration:manage'),
    canWriteSuppliers: allowed('supplier:write'),
  };
}
