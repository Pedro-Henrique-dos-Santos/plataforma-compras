import { useEffect, useState } from 'react';
import type {
  CostCenter,
  NotificationChannel,
  OrganizationMember,
  PaymentApprovalMode,
  PaymentApprovalRule,
  PaymentSettings,
  ReceiptResponsibility,
} from '@compras/contracts';
import { CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';

import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

type Props = {
  accessToken: string | null;
  organizationId: string;
};

type RuleForm = {
  active: boolean;
  approverUserIds: string[];
  minimumAmount: string;
  name: string;
  notificationChannel: NotificationChannel;
  requiredApprovals: 1 | 2;
};

const currency = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' });

export function FinancialSettingsView({ accessToken, organizationId }: Props) {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [rules, setRules] = useState<PaymentApprovalRule[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [responsibilities, setResponsibilities] = useState<ReceiptResponsibility[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule());
  const [editingRule, setEditingRule] = useState<PaymentApprovalRule | null>(null);
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [responsibleCostCenterId, setResponsibleCostCenterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<PaymentSettings>('/procure-to-pay/payment-settings', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<PaymentApprovalRule[]>('/procure-to-pay/payment-rules', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<OrganizationMember[]>(`/organizations/${organizationId}/members`, { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<CostCenter[]>('/cost-centers', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<ReceiptResponsibility[]>('/procure-to-pay/receipt-responsibilities', { token: accessToken, organizationId, signal: controller.signal }),
    ])
      .then(([nextSettings, nextRules, nextMembers, nextCenters, nextResponsibilities]) => {
        setSettings(nextSettings);
        setRules(nextRules);
        setMembers(nextMembers.filter((member) => member.status === 'ACTIVE'));
        setCostCenters(nextCenters.filter((center) => center.active));
        setResponsibilities(nextResponsibilities);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId]);

  async function saveSettings() {
    if (!settings) return;
    setSubmitting(true);
    clearMessages();
    try {
      const updated = await apiPatch<PaymentSettings>('/procure-to-pay/payment-settings', {
        expectedUpdatedAt: settings.updatedAt,
        approvalMode: settings.approvalMode,
        segregationEnabled: settings.segregationEnabled,
        notificationChannel: settings.notificationChannel,
        notificationRecipient: settings.notificationRecipient,
      }, { token: accessToken, organizationId });
      setSettings(updated);
      setSuccess('Configuracoes financeiras salvas.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRule() {
    setSubmitting(true);
    clearMessages();
    try {
      const payload = {
        active: ruleForm.active,
        approverUserIds: ruleForm.approverUserIds,
        minimumAmount: Number(ruleForm.minimumAmount.replace(',', '.')),
        name: ruleForm.name.trim(),
        notificationChannel: ruleForm.notificationChannel,
        requiredApprovals: ruleForm.requiredApprovals,
      };
      const saved = editingRule
        ? await apiPatch<PaymentApprovalRule>(`/procure-to-pay/payment-rules/${editingRule.id}`, { ...payload, expectedUpdatedAt: editingRule.updatedAt }, { token: accessToken, organizationId })
        : await apiPost<PaymentApprovalRule>('/procure-to-pay/payment-rules', payload, { token: accessToken, organizationId });
      setRules((current) => editingRule ? current.map((rule) => rule.id === saved.id ? saved : rule) : [...current, saved].sort((left, right) => left.minimumAmount - right.minimumAmount));
      setEditingRule(null);
      setRuleForm(emptyRule());
      setSuccess('Regra financeira salva.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function editRule(rule: PaymentApprovalRule) {
    setEditingRule(rule);
    setRuleForm({
      active: rule.active,
      approverUserIds: rule.approvers.map((approver) => approver.userId),
      minimumAmount: String(rule.minimumAmount),
      name: rule.name,
      notificationChannel: rule.notificationChannel,
      requiredApprovals: rule.requiredApprovals as 1 | 2,
    });
    clearMessages();
  }

  async function addResponsibility() {
    if (!responsibleUserId) return;
    setSubmitting(true);
    clearMessages();
    try {
      const created = await apiPost<ReceiptResponsibility>('/procure-to-pay/receipt-responsibilities', {
        userId: responsibleUserId,
        costCenterId: responsibleCostCenterId || null,
      }, { token: accessToken, organizationId });
      setResponsibilities((current) => [...current, created]);
      setResponsibleUserId('');
      setResponsibleCostCenterId('');
      setSuccess('Responsavel pelo recebimento adicionado.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeResponsibility(id: string) {
    setSubmitting(true);
    clearMessages();
    try {
      await apiDelete<void>(`/procure-to-pay/receipt-responsibilities/${id}`, { token: accessToken, organizationId });
      setResponsibilities((current) => current.filter((item) => item.id !== id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  if (loading || !settings) return <div className="panel table-loading">Carregando configuracoes financeiras</div>;

  return (
    <div className="management-layout">
      <section className="section-heading"><span><p className="eyebrow">Administracao financeira</p><h2>Pagamentos e recebimentos</h2></span></section>
      {error && <div className="inline-error">{error}</div>}
      {success && <div className="inline-success"><CheckCircle2 size={16} />{success}</div>}

      <section className="settings-band">
        <header><span><p className="eyebrow">Fluxo financeiro</p><h3>Aprovacao de pagamentos</h3></span><button className="primary-button" disabled={submitting} onClick={() => void saveSettings()} type="button"><Save size={16} />Salvar</button></header>
        <div className="management-form"><div className="form-grid two-columns">
          <label>Modo de aprovacao<select onChange={(event) => setSettings((current) => current ? { ...current, approvalMode: event.target.value as PaymentApprovalMode } : current)} value={settings.approvalMode}><option value="DISABLED">Desabilitada</option><option value="PER_TITLE">Uma aprovacao por titulo</option><option value="PER_PURCHASE_SNAPSHOT">Titulos atuais do pedido</option></select></label>
          <label>Canal para liberacoes<select onChange={(event) => setSettings((current) => current ? { ...current, notificationChannel: (event.target.value || null) as NotificationChannel | null, notificationRecipient: event.target.value ? current.notificationRecipient : null } : current)} value={settings.notificationChannel ?? ''}><option value="">Sem notificacao de liberacao</option><option value="EMAIL">E-mail</option><option value="WHATSAPP">WhatsApp oficial</option></select></label>
          <label>Destinatario<input disabled={!settings.notificationChannel} maxLength={255} onChange={(event) => setSettings((current) => current ? { ...current, notificationRecipient: event.target.value || null } : current)} placeholder={settings.notificationChannel === 'WHATSAPP' ? '+5511999999999' : 'financeiro@empresa.com.br'} value={settings.notificationRecipient ?? ''} /></label>
          <label className="checkbox-field"><input checked={settings.segregationEnabled} onChange={(event) => setSettings((current) => current ? { ...current, segregationEnabled: event.target.checked } : current)} type="checkbox" /><span><strong>Segregacao de funcoes</strong><small>Quem aprovou a compra nao aprova o pagamento; quem aprovou o pagamento nao registra a propria baixa.</small></span></label>
        </div></div>
      </section>

      <section className="settings-band">
        <header><span><p className="eyebrow">Regras por valor</p><h3>{editingRule ? 'Editar regra financeira' : 'Nova regra financeira'}</h3></span></header>
        <div className="management-form"><div className="form-grid two-columns">
          <label>Nome<input maxLength={120} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} value={ruleForm.name} /></label>
          <label>Valor minimo<input min="0" onChange={(event) => setRuleForm((current) => ({ ...current, minimumAmount: event.target.value }))} step="0.01" type="number" value={ruleForm.minimumAmount} /></label>
          <label>Quorum<select onChange={(event) => setRuleForm((current) => ({ ...current, requiredApprovals: Number(event.target.value) as 1 | 2 }))} value={ruleForm.requiredApprovals}><option value="1">Uma pessoa</option><option value="2">Duas pessoas</option></select></label>
          <label>Canal<select onChange={(event) => setRuleForm((current) => ({ ...current, notificationChannel: event.target.value as NotificationChannel }))} value={ruleForm.notificationChannel}><option value="EMAIL">E-mail</option><option value="WHATSAPP">WhatsApp oficial</option></select></label>
          <fieldset className="full-span approver-fieldset"><legend>Aprovadores</legend>{members.map((member) => <label className="checkbox-field compact" key={member.userId}><input checked={ruleForm.approverUserIds.includes(member.userId)} onChange={(event) => setRuleForm((current) => ({ ...current, approverUserIds: event.target.checked ? [...current.approverUserIds, member.userId] : current.approverUserIds.filter((id) => id !== member.userId) }))} type="checkbox" /><span><strong>{member.name}</strong><small>{member.email}</small></span></label>)}</fieldset>
          <label className="checkbox-field"><input checked={ruleForm.active} onChange={(event) => setRuleForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /><span><strong>Regra ativa</strong></span></label>
        </div><div className="form-actions"><button className="secondary-button" onClick={() => { setEditingRule(null); setRuleForm(emptyRule()); }} type="button">Limpar</button><button className="primary-button" disabled={submitting || ruleForm.name.trim().length < 2 || ruleForm.approverUserIds.length < ruleForm.requiredApprovals} onClick={() => void saveRule()} type="button"><Save size={16} />Salvar regra</button></div></div>
        <div className="rule-list">{rules.map((rule) => <button className="rule-row" key={rule.id} onClick={() => editRule(rule)} type="button"><span><strong>{rule.name}</strong><small>{rule.approvers.map((approver) => approver.name).join(', ')}</small></span><span><strong>{currency.format(rule.minimumAmount)}</strong><small>{rule.requiredApprovals} aprovacao(oes) | {rule.active ? 'Ativa' : 'Inativa'}</small></span></button>)}{!rules.length && <p className="detail-empty">Nenhuma regra financeira cadastrada.</p>}</div>
      </section>

      <section className="settings-band">
        <header><span><p className="eyebrow">Conferencia fisica</p><h3>Responsaveis pelo recebimento</h3></span></header>
        <div className="inline-management-form"><label>Usuario<select onChange={(event) => setResponsibleUserId(event.target.value)} value={responsibleUserId}><option value="">Selecione</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label><label>Escopo<select onChange={(event) => setResponsibleCostCenterId(event.target.value)} value={responsibleCostCenterId}><option value="">Toda a empresa</option>{costCenters.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label><button className="primary-button" disabled={submitting || !responsibleUserId} onClick={() => void addResponsibility()} type="button"><Plus size={16} />Adicionar</button></div>
        <div className="responsibility-list">{responsibilities.map((item) => <div className="responsibility-row" key={item.id}><span><strong>{item.userName}</strong><small>{item.costCenterName ?? 'Toda a empresa'}</small></span><button className="icon-button" disabled={submitting} onClick={() => void removeResponsibility(item.id)} title="Remover responsabilidade" type="button"><Trash2 size={16} /></button></div>)}{!responsibilities.length && <p className="detail-empty">Somente administradores podem confirmar recebimentos ate que um responsavel seja cadastrado.</p>}</div>
      </section>
    </div>
  );
}

function emptyRule(): RuleForm {
  return { active: true, approverUserIds: [], minimumAmount: '0', name: '', notificationChannel: 'EMAIL', requiredApprovals: 1 };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel salvar a configuracao.';
}
