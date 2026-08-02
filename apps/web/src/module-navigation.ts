import {
  BarChart3,
  Building2,
  FileScan,
  FileText,
  Landmark,
  CircleDollarSign,
  ListChecks,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  WalletCards,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import {
  hasAccessPermission,
  type OrganizationSummary,
  type Permission,
  type UserContext,
} from '@compras/contracts';

export type AppModuleId = 'purchases' | 'finance' | 'administration';

export type ViewId =
  | 'dashboard'
  | 'reports'
  | 'purchases'
  | 'approvals'
  | 'payables'
  | 'receivables'
  | 'approval-settings'
  | 'financial-settings'
  | 'suppliers'
  | 'prices'
  | 'cost-centers'
  | 'invoice-documents'
  | 'integrations'
  | 'organizations'
  | 'access'
  | 'settings';

export type AppModuleDefinition = {
  id: AppModuleId;
  label: string;
  summary: string;
  icon: LucideIcon;
  tone: 'purchases' | 'finance' | 'administration';
  defaultView: ViewId;
};

export type ModuleNavigationItem = {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  module: AppModuleId;
  section: string;
};

export type ModuleNavigationGroup = {
  label: string;
  items: ModuleNavigationItem[];
};

export const appModules: AppModuleDefinition[] = [
  {
    id: 'purchases',
    label: 'Compras',
    summary: 'Pedidos, fornecedores e documentos fiscais',
    icon: ShoppingCart,
    tone: 'purchases',
    defaultView: 'dashboard',
  },
  {
    id: 'finance',
    label: 'Financeiro',
    summary: 'Titulos, aprovacoes e baixas',
    icon: WalletCards,
    tone: 'finance',
    defaultView: 'payables',
  },
  {
    id: 'administration',
    label: 'Administracao',
    summary: 'Empresa, acessos e estrutura operacional',
    icon: Settings2,
    tone: 'administration',
    defaultView: 'organizations',
  },
];

const navigation: ModuleNavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Visao geral',
    icon: BarChart3,
    permission: 'dashboard:read',
    module: 'purchases',
    section: 'Analise',
  },
  {
    id: 'reports',
    label: 'Relatorios de compras',
    icon: FileText,
    permission: 'purchase:read',
    module: 'purchases',
    section: 'Analise',
  },
  {
    id: 'purchases',
    label: 'Pedidos de compra',
    icon: ShoppingCart,
    permission: 'purchase:read',
    module: 'purchases',
    section: 'Operacao',
  },
  {
    id: 'approvals',
    label: 'Aprovacoes',
    icon: ListChecks,
    permission: 'approval:act',
    module: 'purchases',
    section: 'Operacao',
  },
  {
    id: 'invoice-documents',
    label: 'Notas fiscais',
    icon: FileScan,
    permission: 'invoice:read',
    module: 'purchases',
    section: 'Operacao',
  },
  {
    id: 'suppliers',
    label: 'Fornecedores',
    icon: Store,
    permission: 'supplier:read',
    module: 'purchases',
    section: 'Cadastros',
  },
  {
    id: 'prices',
    label: 'Tabela de precos',
    icon: Tags,
    permission: 'price:read',
    module: 'purchases',
    section: 'Cadastros',
  },
  {
    id: 'approval-settings',
    label: 'Regras de aprovacao',
    icon: Workflow,
    permission: 'approval:manage',
    module: 'purchases',
    section: 'Configuracao',
  },
  {
    id: 'payables',
    label: 'Contas a pagar',
    icon: WalletCards,
    permission: 'payable:read',
    module: 'finance',
    section: 'Operacao',
  },
  {
    id: 'receivables',
    label: 'Contas a receber',
    icon: CircleDollarSign,
    permission: 'receivable:read',
    module: 'finance',
    section: 'Operacao',
  },
  {
    id: 'financial-settings',
    label: 'Regras financeiras',
    icon: SlidersHorizontal,
    permission: 'payment-approval:manage',
    module: 'finance',
    section: 'Configuracao',
  },
  {
    id: 'cost-centers',
    label: 'Centros de custo',
    icon: Landmark,
    permission: 'cost-center:read',
    module: 'administration',
    section: 'Estrutura',
  },
  {
    id: 'integrations',
    label: 'Automacoes',
    icon: Workflow,
    permission: 'integration:read',
    module: 'administration',
    section: 'Plataforma',
  },
  {
    id: 'organizations',
    label: 'Empresas',
    icon: Building2,
    permission: 'organization:manage',
    module: 'administration',
    section: 'Plataforma',
  },
  {
    id: 'access',
    label: 'Acessos',
    icon: ShieldCheck,
    permission: 'member:manage',
    module: 'administration',
    section: 'Plataforma',
  },
];

type NavigationUser = Pick<UserContext, 'platformRoles'>;
type NavigationOrganization = Pick<OrganizationSummary, 'role'>;

export function getVisibleModuleNavigation(
  moduleId: AppModuleId,
  user: NavigationUser,
  activeOrganization: NavigationOrganization,
): ModuleNavigationItem[] {
  return navigation.filter(
    (item) =>
      item.module === moduleId &&
      hasAccessPermission(user.platformRoles, activeOrganization.role, item.permission),
  );
}

export function getVisibleModuleNavigationGroups(
  moduleId: AppModuleId,
  user: NavigationUser,
  activeOrganization: NavigationOrganization,
): ModuleNavigationGroup[] {
  const groups = new Map<string, ModuleNavigationItem[]>();
  for (const item of getVisibleModuleNavigation(moduleId, user, activeOrganization)) {
    const items = groups.get(item.section) ?? [];
    items.push(item);
    groups.set(item.section, items);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

export function getVisibleModules(
  user: NavigationUser,
  activeOrganization: NavigationOrganization,
): AppModuleDefinition[] {
  return appModules.filter(
    (module) => getVisibleModuleNavigation(module.id, user, activeOrganization).length > 0,
  );
}

export function getDefaultModuleView(
  moduleId: AppModuleId,
  user: NavigationUser,
  activeOrganization: NavigationOrganization,
): ViewId | null {
  const items = getVisibleModuleNavigation(moduleId, user, activeOrganization);
  const preferred = appModules.find((module) => module.id === moduleId)?.defaultView;
  return items.find((item) => item.id === preferred)?.id ?? items[0]?.id ?? null;
}

export function getAppModule(moduleId: AppModuleId): AppModuleDefinition {
  const module = appModules.find((candidate) => candidate.id === moduleId);
  if (!module) {
    throw new Error(`Modulo desconhecido: ${moduleId}`);
  }
  return module;
}
