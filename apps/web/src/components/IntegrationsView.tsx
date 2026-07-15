import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  GoogleSheetsConnectorStatus,
  GoogleSheetsIntegration,
  GoogleSheetsIntegrationInput,
  SheetSyncAction,
  SheetSyncPreview,
  SheetSyncResult,
} from '@compras/contracts';
import {
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  RefreshCw,
  Save,
  Sheet,
  Upload,
} from 'lucide-react';

import { apiGet, apiPost, apiPut, apiUpload } from '../lib/api';

type IntegrationsViewProps = {
  accessToken: string | null;
  canConfigure: boolean;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type IntegrationForm = {
  spreadsheetId: string;
  itemsSheetName: string;
  installmentsSheetName: string;
  suppliersSheetName: string;
  pricesSheetName: string;
  headerRow: string;
  enabled: boolean;
};

const initialForm: IntegrationForm = {
  spreadsheetId: '',
  itemsSheetName: 'Itens do Pedido',
  installmentsSheetName: 'Parcelas do Pedido',
  suppliersSheetName: 'Cadastro de Fornecedores',
  pricesSheetName: 'Tabela de Precos Negociados',
  headerRow: '1',
  enabled: true,
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function IntegrationsView({
  accessToken,
  canConfigure,
  canWrite,
  onChanged,
  organizationId,
}: IntegrationsViewProps) {
  const [status, setStatus] = useState<GoogleSheetsConnectorStatus | null>(null);
  const [form, setForm] = useState<IntegrationForm>(initialForm);
  const [preview, setPreview] = useState<SheetSyncPreview | null>(null);
  const [result, setResult] = useState<SheetSyncResult | null>(null);
  const [filter, setFilter] = useState<SheetSyncAction['action'] | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workbookInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiGet<GoogleSheetsConnectorStatus>('/integrations/google-sheets', {
      token: accessToken,
      organizationId,
      signal: controller.signal,
    })
      .then((nextStatus) => {
        setStatus(nextStatus);
        setForm(formFromIntegration(nextStatus.integration));
        setPreview(null);
        setResult(null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId]);

  const visibleActions = useMemo(
    () =>
      (preview?.actions ?? []).filter(
        (action) => filter === 'ALL' || action.action === filter,
      ),
    [filter, preview],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = toInput(form);
      const integration = await apiPut<GoogleSheetsIntegration>(
        '/integrations/google-sheets',
        input,
        { token: accessToken, organizationId },
      );
      setStatus((current) => ({
        configured: current?.configured ?? integration.connectorConfigured,
        mode: current?.mode ?? integration.connectorMode,
        serviceAccountEmail: current?.serviceAccountEmail ?? integration.serviceAccountEmail,
        integration,
      }));
      setPreview(null);
      setResult(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function generatePreview() {
    setPreviewing(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await apiPost<SheetSyncPreview>(
        '/integrations/google-sheets/preview',
        {},
        { token: accessToken, organizationId },
      );
      setPreview(nextPreview);
      setFilter('ALL');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPreviewing(false);
    }
  }

  async function applyPreview() {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const applied = await apiPost<SheetSyncResult>(
        '/integrations/google-sheets/apply',
        { runId: preview.runId },
        { token: accessToken, organizationId },
      );
      setResult(applied);
      onChanged();
      const nextStatus = await apiGet<GoogleSheetsConnectorStatus>(
        '/integrations/google-sheets',
        { token: accessToken, organizationId },
      );
      setStatus(nextStatus);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setApplying(false);
    }
  }

  async function generateWorkbookPreview(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await apiUpload<SheetSyncPreview>(
        '/integrations/google-sheets/workbook-preview',
        file,
        { token: accessToken, organizationId },
      );
      setPreview(nextPreview);
      setFilter('ALL');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setUploading(false);
      if (workbookInput.current) workbookInput.current.value = '';
    }
  }

  if (loading) {
    return <div className="skeleton view-loading" aria-label="Carregando integracoes" />;
  }

  const connectorReady = Boolean(status?.configured);
  const integrationSaved = Boolean(status?.integration);
  const spreadsheetUrl = form.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${form.spreadsheetId}/edit`
    : null;

  return (
    <div className="management-layout integrations-view">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Fonte operacional</p>
          <h2>Google Sheets</h2>
        </span>
        <div className="heading-actions compact-actions">
          {spreadsheetUrl && (
            <a className="secondary-button" href={spreadsheetUrl} rel="noreferrer" target="_blank">
              <ExternalLink size={16} />
              Abrir planilha
            </a>
          )}
          {canWrite && (
            <>
              <input
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void generateWorkbookPreview(file);
                }}
                ref={workbookInput}
                type="file"
              />
              <button
                className="secondary-button"
                disabled={!integrationSaved || uploading}
                onClick={() => workbookInput.current?.click()}
                title="Gerar previa a partir de um arquivo Excel"
                type="button"
              >
                <Upload size={16} />
                {uploading ? 'Lendo Excel' : 'Importar Excel'}
              </button>
            </>
          )}
          {canWrite && (
            <button
              className="primary-button"
              disabled={!connectorReady || !integrationSaved || previewing}
              onClick={() => void generatePreview()}
              type="button"
            >
              <RefreshCw className={previewing ? 'spin' : ''} size={16} />
              {previewing ? 'Lendo planilha' : 'Gerar previa'}
            </button>
          )}
        </div>
      </section>

      {error && <div className="inline-error">{error}</div>}
      {result && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          <span>
            Sincronizacao concluida: {result.purchasesCreated} compras, {result.suppliersCreated}{' '}
            fornecedores e {result.invoicesAttached} notas completadas.
          </span>
        </div>
      )}

      <section className="integration-status-band">
        <span className={`integration-status-icon ${connectorReady ? 'ready' : ''}`}>
          <DatabaseZap size={20} />
        </span>
        <div>
          <strong>{connectorLabel(status)}</strong>
          <small>{connectorDetail(status)}</small>
        </div>
        <span className={`status-label ${connectorReady ? 'active' : ''}`}>
          {connectorReady ? 'Disponivel' : 'Pendente'}
        </span>
        {status?.integration?.lastSyncedAt && (
          <span className="integration-last-sync">
            Ultima sincronizacao {formatDateTime(status.integration.lastSyncedAt)}
          </span>
        )}
      </section>

      <form className="panel management-form integration-form" onSubmit={(event) => void save(event)}>
        <div className="form-section-title">
          <Sheet size={18} />
          <span>
            <strong>Mapeamento da planilha</strong>
            <small>Empresa ativa</small>
          </span>
        </div>
        <label className="integration-id-field">
          ID da planilha
          <input
            disabled={!canConfigure}
            onChange={(event) => setForm((current) => ({ ...current, spreadsheetId: event.target.value }))}
            required
            value={form.spreadsheetId}
          />
        </label>
        <label>
          Aba de itens
          <input
            disabled={!canConfigure}
            onChange={(event) => setForm((current) => ({ ...current, itemsSheetName: event.target.value }))}
            required
            value={form.itemsSheetName}
          />
        </label>
        <label>
          Aba de parcelas
          <input
            disabled={!canConfigure}
            onChange={(event) => setForm((current) => ({ ...current, installmentsSheetName: event.target.value }))}
            required
            value={form.installmentsSheetName}
          />
        </label>
        <label>
          Aba de fornecedores
          <input
            disabled={!canConfigure}
            onChange={(event) => setForm((current) => ({ ...current, suppliersSheetName: event.target.value }))}
            required
            value={form.suppliersSheetName}
          />
        </label>
        <label>
          Aba de precos
          <input
            disabled={!canConfigure}
            onChange={(event) => setForm((current) => ({ ...current, pricesSheetName: event.target.value }))}
            required
            value={form.pricesSheetName}
          />
        </label>
        <label className="header-row-field">
          Linha do cabecalho
          <input
            disabled={!canConfigure}
            max="20"
            min="1"
            onChange={(event) => setForm((current) => ({ ...current, headerRow: event.target.value }))}
            required
            type="number"
            value={form.headerRow}
          />
        </label>
        <label className="toggle-row integration-enabled-toggle">
          <input
            checked={form.enabled}
            disabled={!canConfigure}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
            type="checkbox"
          />
          <span>Integracao ativa</span>
        </label>
        {canConfigure && (
          <div className="form-actions integration-form-actions">
            <button className="secondary-button" disabled={saving} type="submit">
              <Save size={16} />
              {saving ? 'Salvando' : 'Salvar configuracao'}
            </button>
          </div>
        )}
      </form>

      {preview && (
        <>
          <section className="sync-metrics" aria-label="Resumo da previa">
            <SyncMetric label="Linhas lidas" value={preview.totals.sourceRows} />
            <SyncMetric label="Novos registros" value={preview.totals.ready} tone="positive" />
            <SyncMetric label="Atualizacoes" value={preview.totals.updates} tone="info" />
            <SyncMetric label="Duplicados" value={preview.totals.duplicates} />
            <SyncMetric label="Revisar" value={preview.totals.invalid} tone="danger" />
          </section>

          <section className="filter-bar panel sync-filter-bar">
            <label className="compact-select">
              <span className="sr-only">Filtrar acao</span>
              <select
                onChange={(event) => setFilter(event.target.value as typeof filter)}
                value={filter}
              >
                <option value="ALL">Todas as acoes</option>
                <option value="CREATE">Novos registros</option>
                <option value="UPDATE">Atualizacoes</option>
                <option value="ATTACH_INVOICE">Completar NF</option>
                <option value="SKIP_DUPLICATE">Duplicados</option>
                <option value="SKIP_OUT_OF_SCOPE">Ignorados</option>
                <option value="INVALID">Revisar</option>
              </select>
            </label>
            <span className="count-label">{visibleActions.length} acoes</span>
            {canWrite && (
              <button
                className="primary-button sync-apply-button"
                disabled={applying || Boolean(result)}
                onClick={() => void applyPreview()}
                type="button"
              >
                <CheckCircle2 size={16} />
                {applying ? 'Aplicando lote' : result ? 'Lote aplicado' : 'Aplicar sincronizacao'}
              </button>
            )}
          </section>

          <section className="panel table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Entidade</th>
                    <th>Registro</th>
                    <th>Acao</th>
                    <th>Validacao</th>
                    <th>Linhas</th>
                    <th className="align-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActions.length ? (
                    visibleActions.map((action) => (
                      <tr key={action.key}>
                        <td>{entityLabel(action.entity)}</td>
                        <td className="sync-action-label">{action.label}</td>
                        <td>
                          <span className={`status-label ${actionTone(action.action)}`}>
                            {actionLabel(action.action)}
                          </span>
                        </td>
                        <td>{action.reason}</td>
                        <td>{compactRows(action.rowNumbers)}</td>
                        <td className="align-right">
                          {action.amount === null ? '-' : currency.format(action.amount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-table-cell" colSpan={6}>Nenhuma acao neste filtro</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SyncMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'info' | 'danger';
}) {
  return (
    <span className={`sync-metric ${tone}`}>
      <small>{label}</small>
      <strong>{value.toLocaleString('pt-BR')}</strong>
    </span>
  );
}

function formFromIntegration(integration: GoogleSheetsIntegration | null): IntegrationForm {
  if (!integration) return initialForm;
  return {
    spreadsheetId: integration.spreadsheetId,
    itemsSheetName: integration.itemsSheetName,
    installmentsSheetName: integration.installmentsSheetName,
    suppliersSheetName: integration.suppliersSheetName,
    pricesSheetName: integration.pricesSheetName,
    headerRow: String(integration.headerRow),
    enabled: integration.enabled,
  };
}

function toInput(form: IntegrationForm): GoogleSheetsIntegrationInput {
  return {
    spreadsheetId: form.spreadsheetId.trim(),
    itemsSheetName: form.itemsSheetName.trim(),
    installmentsSheetName: form.installmentsSheetName.trim(),
    suppliersSheetName: form.suppliersSheetName.trim(),
    pricesSheetName: form.pricesSheetName.trim(),
    headerRow: Number(form.headerRow),
    enabled: form.enabled,
  };
}

function connectorLabel(status: GoogleSheetsConnectorStatus | null): string {
  if (status?.mode === 'DEMO') return 'Conector demonstrativo isolado';
  if (status?.mode === 'GOOGLE_SERVICE_ACCOUNT') return 'Conta de servico Google ativa';
  return 'Credencial Google pendente';
}

function connectorDetail(status: GoogleSheetsConnectorStatus | null): string {
  if (status?.serviceAccountEmail) return status.serviceAccountEmail;
  if (status?.mode === 'DEMO') return 'Leitura local sem alterar a planilha principal';
  return 'Servidor sem credencial configurada';
}

function actionLabel(action: SheetSyncAction['action']): string {
  return {
    CREATE: 'Criar',
    UPDATE: 'Atualizar',
    ATTACH_INVOICE: 'Completar NF',
    SKIP_DUPLICATE: 'Duplicado',
    SKIP_OUT_OF_SCOPE: 'Ignorar',
    INVALID: 'Revisar',
  }[action];
}

function actionTone(action: SheetSyncAction['action']): string {
  return {
    CREATE: 'active',
    UPDATE: 'info',
    ATTACH_INVOICE: 'info',
    SKIP_DUPLICATE: '',
    SKIP_OUT_OF_SCOPE: '',
    INVALID: 'warning',
  }[action];
}

function entityLabel(entity: SheetSyncAction['entity']): string {
  return {
    SUPPLIER: 'Fornecedor',
    COST_CENTER: 'Centro de custo',
    PRICE: 'Preco',
    PURCHASE: 'Compra',
  }[entity];
}

function compactRows(rows: number[]): string {
  if (rows.length <= 3) return rows.join(', ');
  return `${rows.slice(0, 2).join(', ')} +${rows.length - 2}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
