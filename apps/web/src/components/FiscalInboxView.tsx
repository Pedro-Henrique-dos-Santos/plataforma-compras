import { useEffect, useMemo, useState } from 'react';
import {
  isValidCnpj,
  normalizeBrazilianDocument,
  type FiscalDocumentSummary,
  type FiscalIntegration,
  type FiscalMatchStatus,
  type FiscalSyncResult,
  type PurchaseSummary,
  type RecipientManifestation,
} from '@compras/contracts';
import {
  BadgeCheck,
  Download,
  FileSearch,
  Link2,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  X,
} from 'lucide-react';

import { apiDelete, apiForm, apiGet, apiPost } from '../lib/api';

type Props = {
  accessToken: string | null;
  canConfigure: boolean;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type FiscalLane = 'CAPTURED' | 'REVIEW' | 'MATCHED' | 'REJECTED';

const lanes: FiscalLane[] = ['CAPTURED', 'REVIEW', 'MATCHED', 'REJECTED'];
const currency = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' });

export function FiscalInboxView({ accessToken, canConfigure, canWrite, onChanged, organizationId }: Props) {
  const [integration, setIntegration] = useState<FiscalIntegration | null>(null);
  const [documents, setDocuments] = useState<FiscalDocumentSummary[]>([]);
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [selected, setSelected] = useState<FiscalDocumentSummary | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState('');
  const [taxpayerDocument, setTaxpayerDocument] = useState('');
  const [environment, setEnvironment] = useState<'HOMOLOGATION' | 'PRODUCTION'>('HOMOLOGATION');
  const [manifestationMode, setManifestationMode] = useState<'MANUAL' | 'AUTO_SCIENCE'>('MANUAL');
  const [purchaseId, setPurchaseId] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [manifestationReason, setManifestationReason] = useState('');
  const [syncResult, setSyncResult] = useState<FiscalSyncResult | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<FiscalIntegration>('/procure-to-pay/fiscal/integration', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<FiscalDocumentSummary[]>('/procure-to-pay/fiscal/documents', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<PurchaseSummary[]>('/purchases', { token: accessToken, organizationId, signal: controller.signal }),
    ])
      .then(([nextIntegration, nextDocuments, nextPurchases]) => {
        setIntegration(nextIntegration);
        setDocuments(nextDocuments);
        setPurchases(nextPurchases.filter((purchase) => ['PURCHASE_ORDER', 'SUPPLIER_INVOICED'].includes(purchase.workflowStage)));
        setTaxpayerDocument(nextIntegration.taxpayerDocument ?? '');
        setEnvironment(nextIntegration.environment);
        setManifestationMode(nextIntegration.manifestationMode);
        setSelected((current) => current ? nextDocuments.find((document) => document.id === current.id) ?? null : null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId, revision]);

  const visible = useMemo(() => {
    const term = normalize(search);
    return documents.filter((document) => !term || normalize(`${document.invoiceNumber ?? ''} ${document.accessKey ?? ''} ${document.issuerDocument ?? ''} ${document.matches.map((match) => match.purchaseNumber).join(' ')}`).includes(term));
  }, [documents, search]);
  const certificateWarning = certificateAlert(integration?.certificateExpiresAt);

  async function configure() {
    if (!certificate) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      if (integration?.updatedAt) form.append('expectedUpdatedAt', integration.updatedAt);
      form.append('environment', environment);
      form.append('taxpayerDocument', normalizeBrazilianDocument(taxpayerDocument));
      form.append('manifestationMode', manifestationMode);
      form.append('certificatePassphrase', certificatePassword);
      form.append('certificate', certificate);
      const updated = await apiForm<FiscalIntegration>('/procure-to-pay/fiscal/integration', form, 'PUT', { token: accessToken, organizationId });
      setIntegration(updated);
      setConfigurationOpen(false);
      setCertificate(null);
      setCertificatePassword('');
      setSuccess('Certificado A1 validado e armazenado com seguranca.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!integration?.updatedAt) throw new Error('Recarregue a integracao fiscal antes de revogar.');
      await apiDelete<void>(`/procure-to-pay/fiscal/integration?expectedUpdatedAt=${encodeURIComponent(integration.updatedAt)}`, { token: accessToken, organizationId });
      setConfigurationOpen(false);
      setRevision((current) => current + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function testIntegration() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiPost<FiscalIntegration>(
        '/procure-to-pay/fiscal/integration/test',
        {},
        { token: accessToken, organizationId },
      );
      setIntegration(updated);
      setSuccess('Integridade e validade do certificado armazenado confirmadas.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function sync() {
    setSubmitting(true);
    setError(null);
    setSyncResult(null);
    setSuccess(null);
    try {
      const result = await apiPost<FiscalSyncResult>('/procure-to-pay/fiscal/sync', {}, { token: accessToken, organizationId });
      setSyncResult(result);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function review(decision: 'MATCH' | 'REJECT') {
    if (!selected) return;
    if (reviewReason.trim().length < 3) {
      setError('Informe uma justificativa para registrar a revisao fiscal.');
      return;
    }
    const purchase = purchases.find((candidate) => candidate.id === purchaseId);
    setSubmitting(true);
    setError(null);
    try {
      const updated = await apiPost<FiscalDocumentSummary>(`/procure-to-pay/fiscal/documents/${selected.id}/review`, {
        decision,
        purchaseId: decision === 'MATCH' ? purchaseId : null,
        expectedDocumentUpdatedAt: selected.updatedAt,
        expectedPurchaseUpdatedAt: decision === 'MATCH' ? purchase?.updatedAt ?? null : null,
        reason: reviewReason.trim() || null,
      }, { token: accessToken, organizationId });
      replaceDocument(updated);
      setSelected(updated);
      setPurchaseId('');
      setReviewReason('');
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function manifest(manifestation: RecipientManifestation) {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await apiPost<FiscalDocumentSummary>(`/procure-to-pay/fiscal/documents/${selected.id}/manifest`, {
        manifestation,
        expectedDocumentUpdatedAt: selected.updatedAt,
        reason: manifestation === 'OPERATION_NOT_PERFORMED' ? manifestationReason.trim() : null,
      }, { token: accessToken, organizationId });
      replaceDocument(updated);
      setSelected(updated);
      setManifestationReason('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function openFile(documentId: string) {
    setError(null);
    try {
      const access = await apiGet<{ expiresAt: string; url: string }>(`/procure-to-pay/fiscal/documents/${documentId}/file-url`, { token: accessToken, organizationId });
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  function replaceDocument(document: FiscalDocumentSummary) {
    setDocuments((current) => current.map((item) => item.id === document.id ? document : item));
  }

  return (
    <div className="management-layout fiscal-inbox">
      <section className="section-heading">
        <span><p className="eyebrow">Distribuicao DF-e</p><h2>Caixa de NF-e</h2></span>
        <span className="heading-actions">
          {canConfigure && <button className="secondary-button" onClick={() => setConfigurationOpen(true)} type="button"><Settings2 size={16} />Certificado A1</button>}
          {canConfigure && <button className="primary-button" disabled={submitting || !integration?.configured} onClick={() => void sync()} type="button"><RefreshCw className={submitting ? 'spin' : ''} size={16} />Consultar SEFAZ</button>}
        </span>
      </section>

      <section className="fiscal-status-band">
        <span><small>Modo operacional</small><strong>{rolloutLabel(integration?.rolloutMode)}</strong></span>
        <span><small>Integracao</small><strong>{integration?.configured ? integrationStatusLabel(integration.status) : 'Nao configurada'}</strong></span>
        <span><small>Certificado</small><strong>{integration?.certificateExpiresAt ? formatDateTime(integration.certificateExpiresAt) : 'Nao informado'}</strong></span>
        <span><small>NSU</small><strong>{integration?.lastNsu ?? '000000000000000'} / {integration?.maxNsu ?? '000000000000000'}</strong></span>
      </section>
      {integration?.rolloutMode === 'SHADOW' && <div className="workflow-notice"><ShieldAlert size={17} /><span>Modo sombra ativo: documentos sao capturados sem vinculo ou manifestacao automatica.</span></div>}
      {certificateWarning && <div className="workflow-notice"><ShieldAlert size={17} /><span>{certificateWarning}</span></div>}
      {integration?.lastError && <div className="inline-error">{integration.lastError}</div>}
      {syncResult && <div className="inline-success"><BadgeCheck size={16} />{syncResult.fetched} recebidos, {syncResult.created} novos, {syncResult.reviewRequired} para revisao.</div>}
      {success && <div className="inline-success"><BadgeCheck size={16} />{success}</div>}
      {error && !selected && !configurationOpen && <div className="inline-error">{error}</div>}

      <section className="filter-bar panel"><label className="search-field"><Search size={16} /><span className="sr-only">Buscar NF-e</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Numero, chave, CNPJ ou pedido" value={search} /></label></section>

      {loading ? <div className="panel table-loading">Carregando caixa fiscal</div> : (
        <section className="fiscal-kanban" aria-label="Fluxo das notas fiscais">
          {lanes.map((lane) => {
            const laneDocuments = visible.filter((document) => documentLane(document.matchStatus) === lane);
            return <section className="kanban-lane fiscal-lane" key={lane}><header className="kanban-lane-header"><strong>{laneLabel(lane)}</strong><span>{laneDocuments.length}</span></header><div className="kanban-card-list">{laneDocuments.map((document) => <button className="fiscal-card" key={document.id} onClick={() => { setSelected(document); setPurchaseId(document.matches[0]?.purchaseId ?? ''); setReviewReason(''); setError(null); }} type="button"><span><strong>NF {document.invoiceNumber ?? 'Sem numero'}</strong><small>{formatDateTime(document.issuedAt)}</small></span><strong>{document.total === null ? 'Valor nao lido' : currency.format(document.total)}</strong><small>{formatDocument(document.issuerDocument)}</small><small>{document.matches[0]?.purchaseNumber ?? matchLabel(document.matchStatus)}</small></button>)}{!laneDocuments.length && <p className="kanban-empty">Nenhum documento</p>}</div></section>;
          })}
        </section>
      )}

      {selected && <div className="modal-backdrop" role="presentation"><section aria-labelledby="fiscal-document-title" aria-modal="true" className="modal-panel modal-wide" role="dialog"><header className="modal-header"><span><p className="eyebrow">Documento fiscal</p><h2 id="fiscal-document-title">NF {selected.invoiceNumber ?? 'Sem numero'}</h2></span><button className="icon-button" onClick={() => setSelected(null)} title="Fechar" type="button"><X size={18} /></button></header><div className="purchase-detail-content"><div className="purchase-detail-summary"><span><small>Chave</small><strong className="breakable-value">{selected.accessKey ?? 'Nao informada'}</strong></span><span><small>Emitente</small><strong>{formatDocument(selected.issuerDocument)}</strong></span><span><small>Valor</small><strong>{selected.total === null ? 'Nao lido' : currency.format(selected.total)}</strong></span><span><small>Vinculo</small><strong>{matchLabel(selected.matchStatus)}</strong></span><span><small>Manifestacao</small><strong>{selected.manifestation ? manifestationLabel(selected.manifestation) : 'Pendente'}</strong></span></div>{canWrite && ['UNMATCHED', 'REVIEW_REQUIRED'].includes(selected.matchStatus) && <section className="purchase-detail-section"><header><strong>Revisao do vinculo</strong></header><div className="management-form"><label>Pedido<select onChange={(event) => setPurchaseId(event.target.value)} value={purchaseId}><option value="">Selecione um pedido</option>{purchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.number} | {purchase.supplierName} | {currency.format(purchase.total)}</option>)}</select></label><label>Justificativa<textarea maxLength={500} onChange={(event) => setReviewReason(event.target.value)} rows={3} value={reviewReason} /></label><div className="form-actions"><button className="secondary-button danger-action" disabled={submitting || reviewReason.trim().length < 3} onClick={() => void review('REJECT')} type="button"><X size={16} />Rejeitar</button><button className="primary-button" disabled={submitting || !purchaseId} onClick={() => void review('MATCH')} type="button"><Link2 size={16} />Vincular pedido</button></div></div></section>}{canConfigure && selected.accessKey && <section className="purchase-detail-section"><header><strong>Manifestacao do destinatario</strong></header><div className="manifestation-actions"><button className="secondary-button" disabled={submitting} onClick={() => void manifest('SCIENCE')} type="button">Ciencia</button><button className="secondary-button" disabled={submitting} onClick={() => void manifest('CONFIRMATION')} type="button">Confirmar operacao</button><button className="secondary-button" disabled={submitting} onClick={() => void manifest('UNKNOWN_OPERATION')} type="button">Desconhecer</button></div><label>Justificativa para operacao nao realizada<textarea maxLength={500} minLength={15} onChange={(event) => setManifestationReason(event.target.value)} rows={3} value={manifestationReason} /></label><button className="secondary-button danger-action" disabled={submitting || manifestationReason.trim().length < 15} onClick={() => void manifest('OPERATION_NOT_PERFORMED')} type="button">Operacao nao realizada</button></section>}</div>{error && <div className="form-error">{error}</div>}<footer className="modal-actions"><button className="secondary-button" onClick={() => void openFile(selected.id)} type="button"><Download size={16} />Abrir XML</button><button className="primary-button" onClick={() => setSelected(null)} type="button">Fechar</button></footer></section></div>}

      {configurationOpen && <div className="modal-backdrop" role="presentation"><section aria-labelledby="fiscal-config-title" aria-modal="true" className="modal-panel" role="dialog"><header className="modal-header"><span><p className="eyebrow">Integracao fiscal</p><h2 id="fiscal-config-title">Certificado A1</h2></span><button className="icon-button" onClick={() => setConfigurationOpen(false)} title="Fechar" type="button"><X size={18} /></button></header><div className="management-form"><div className="form-grid two-columns"><label>Ambiente<select onChange={(event) => setEnvironment(event.target.value as typeof environment)} value={environment}><option value="HOMOLOGATION">Homologacao</option><option value="PRODUCTION">Producao</option></select></label><label>CNPJ<input autoCapitalize="characters" maxLength={18} onChange={(event) => setTaxpayerDocument(event.target.value.toUpperCase())} value={taxpayerDocument} /></label><label>Manifestacao automatica<select onChange={(event) => setManifestationMode(event.target.value as typeof manifestationMode)} value={manifestationMode}><option value="MANUAL">Manual</option><option value="AUTO_SCIENCE">Somente Ciencia</option></select></label><label>Senha do A1<input autoComplete="new-password" maxLength={300} onChange={(event) => setCertificatePassword(event.target.value)} type="password" value={certificatePassword} /></label><label className="file-field full-span"><span>Arquivo PFX ou P12</span><input accept=".pfx,.p12,application/x-pkcs12" onChange={(event) => setCertificate(event.target.files?.[0] ?? null)} type="file" /><small>{certificate?.name ?? 'A senha e o certificado nao poderao ser baixados depois.'}</small></label></div></div>{error && <div className="form-error">{error}</div>}<footer className="modal-actions">{integration?.configured && <button className="secondary-button danger-action" disabled={submitting} onClick={() => void revoke()} type="button">Revogar</button>}{integration?.configured && <button className="secondary-button" disabled={submitting} onClick={() => void testIntegration()} type="button">Testar armazenado</button>}<button className="secondary-button" onClick={() => setConfigurationOpen(false)} type="button">Fechar</button><button className="primary-button" disabled={submitting || !certificate || !certificatePassword || !isValidCnpj(taxpayerDocument)} onClick={() => void configure()} type="button"><FileSearch size={16} />Validar e salvar</button></footer></section></div>}
    </div>
  );
}

function documentLane(status: FiscalMatchStatus): FiscalLane {
  if (status === 'UNMATCHED') return 'CAPTURED';
  if (status === 'REVIEW_REQUIRED') return 'REVIEW';
  if (status === 'REJECTED') return 'REJECTED';
  return 'MATCHED';
}

function laneLabel(lane: FiscalLane): string { return { CAPTURED: 'Capturadas', REVIEW: 'Revisao', MATCHED: 'Conciliadas', REJECTED: 'Rejeitadas' }[lane]; }
function matchLabel(status: FiscalMatchStatus): string { return { UNMATCHED: 'Sem vinculo', REVIEW_REQUIRED: 'Revisao necessaria', MATCHED_EXACT: 'Vinculo exato', MATCHED_MANUAL: 'Vinculo revisado', REJECTED: 'Rejeitada' }[status]; }
function manifestationLabel(value: RecipientManifestation): string { return { SCIENCE: 'Ciencia', CONFIRMATION: 'Confirmada', UNKNOWN_OPERATION: 'Desconhecida', OPERATION_NOT_PERFORMED: 'Nao realizada' }[value]; }
function rolloutLabel(value: FiscalIntegration['rolloutMode'] | undefined): string { return { SHADOW: 'Sombra', EXACT_MATCH: 'Vinculo exato', AUTO_SCIENCE: 'Ciencia automatica' }[value ?? 'SHADOW']; }
function integrationStatusLabel(value: FiscalIntegration['status']): string { return { NOT_CONFIGURED: 'Nao configurada', READY: 'Pronta', SYNCING: 'Sincronizando', BACKOFF: 'Aguardando nova tentativa', CERTIFICATE_EXPIRED: 'Certificado vencido', ERROR: 'Com erro' }[value]; }
function formatDateTime(value: string | null): string { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Nao informado'; }
function certificateAlert(value: string | null | undefined): string | null { if (!value) return null; const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000); if (days < 0) return 'O certificado A1 esta vencido e as consultas fiscais foram interrompidas.'; if (days <= 30) return `O certificado A1 vence em ${days} ${days === 1 ? 'dia' : 'dias'}.`; return null; }
function formatDocument(value: string | null): string { if (!value) return 'Documento nao informado'; const document = normalizeBrazilianDocument(value); return document.length === 14 ? document.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value; }
function normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Nao foi possivel atualizar a caixa fiscal.'; }
