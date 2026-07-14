import type {
  DashboardSummary,
  OrganizationSummary,
  UserContext,
} from '@compras/contracts';

export const DEMO_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const DEMO_AUTH_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const HUMAN_CLINIC_ID = '11111111-1111-4111-8111-111111111111';
export const EXAMPLE_COMPANY_ID = '22222222-2222-4222-8222-222222222222';

export const demoOrganizations: OrganizationSummary[] = [
  {
    id: HUMAN_CLINIC_ID,
    name: 'Human Clinic',
    document: null,
    slug: 'human-clinic',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
  {
    id: EXAMPLE_COMPANY_ID,
    name: 'Empresa demonstrativa',
    document: null,
    slug: 'empresa-demonstrativa',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
];

export const demoUserContext: UserContext = {
  id: DEMO_USER_ID,
  email: 'proprietario@plataforma.local',
  name: 'Proprietario da plataforma',
  platformRoles: ['PLATFORM_OWNER'],
  organizations: demoOrganizations,
};

const humanClinicDashboard: DashboardSummary = {
  periodLabel: 'Julho de 2026',
  totalPurchased: { value: 184_620.48, variation: 8.4 },
  negotiatedSavings: { value: 21_438.72, variation: 14.2 },
  activeSuppliers: 36,
  registeredPurchases: 128,
  monthlySpend: [
    { month: 'Fev', value: 128_400 },
    { month: 'Mar', value: 141_200 },
    { month: 'Abr', value: 133_800 },
    { month: 'Mai', value: 162_500 },
    { month: 'Jun', value: 154_300 },
    { month: 'Jul', value: 184_620.48 },
  ],
  spendByCategory: [
    { category: 'Medicamentos', value: 68_440, color: '#963743' },
    { category: 'Materiais', value: 52_180, color: '#267a78' },
    { category: 'Servicos', value: 37_300, color: '#d49b35' },
    { category: 'Administrativo', value: 26_700.48, color: '#59636b' },
  ],
  recentPurchases: [
    {
      id: 'PC-2026-0128',
      supplier: 'Distribuidora Medica Central',
      date: '2026-07-12',
      total: 12_480.9,
      costCenter: 'Assistencial',
    },
    {
      id: 'PC-2026-0127',
      supplier: 'Laboratorios Integrados',
      date: '2026-07-11',
      total: 8_230.5,
      costCenter: 'Laboratorio',
    },
    {
      id: 'PC-2026-0126',
      supplier: 'Suprimentos Corporativos',
      date: '2026-07-10',
      total: 3_940,
      costCenter: 'Administrativo',
    },
  ],
};

const exampleDashboard: DashboardSummary = {
  periodLabel: 'Julho de 2026',
  totalPurchased: { value: 42_750, variation: 3.1 },
  negotiatedSavings: { value: 5_620, variation: 11.8 },
  activeSuppliers: 12,
  registeredPurchases: 31,
  monthlySpend: [
    { month: 'Fev', value: 32_100 },
    { month: 'Mar', value: 29_400 },
    { month: 'Abr', value: 35_300 },
    { month: 'Mai', value: 38_900 },
    { month: 'Jun', value: 36_200 },
    { month: 'Jul', value: 42_750 },
  ],
  spendByCategory: [
    { category: 'Insumos', value: 18_600, color: '#963743' },
    { category: 'Servicos', value: 12_400, color: '#267a78' },
    { category: 'Tecnologia', value: 7_250, color: '#d49b35' },
    { category: 'Administrativo', value: 4_500, color: '#59636b' },
  ],
  recentPurchases: [
    {
      id: 'PC-2026-0031',
      supplier: 'Fornecedor demonstrativo',
      date: '2026-07-09',
      total: 4_500,
      costCenter: 'Operacoes',
    },
  ],
};

export const demoDashboards: Record<string, DashboardSummary> = {
  [HUMAN_CLINIC_ID]: humanClinicDashboard,
  [EXAMPLE_COMPANY_ID]: exampleDashboard,
};

