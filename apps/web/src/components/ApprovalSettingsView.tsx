import { useEffect, useState, type FormEvent } from 'react';
import type {
  ApprovalRule,
  ApprovalSettings,
  CreateApprovalRuleInput,
  NotificationChannel,
  OrganizationMember,
  UpdateApprovalRuleInput,
  UpdateApprovalSettingsInput,
} from '@compras/contracts';
import { Pencil, Plus, Save, X } from 'lucide-react';

import { apiGet, apiPatch, apiPost, apiPut } from '../lib/api';

type ApprovalSettingsViewProps = {
  accessToken: string | null;
  organizationId: string;
};

type RuleForm = {
  active: boolean;
  approverUserIds: string[];
  minimumAmount: string;
  name: string;
  notificationChannel: NotificationChannel;
  requiredApprovals: '1' | '2';
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function ApprovalSettingsView({
  accessToken,
  organizationId,
}: ApprovalSettingsViewProps) {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [settings, setSettings] = useState<ApprovalSettings>({
    financeChannel: null,
    financeRecipient: null,
    notifyFinanceOnApproval: false,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<ApprovalRule | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<ApprovalRule[]>('/approvals/rules', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<ApprovalSettings>('/approvals/settings', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<OrganizationMember[]>(`/organizations/${organizationId}/members`, {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
    ])
      .then(([ruleRows, nextSettings, memberRows]) => {
        setRules(ruleRows);
        setSettings(nextSettings);
        setMembers(
          memberRows.filter(
            (member) =>
              member.status === 'ACTIVE' && member.role !== 'REPORT_VIEWER',
          ),
        );
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId, revision]);

  function openCreate() {
    setEditing(null);
    setRuleForm(emptyRuleForm());
    setError(null);
    setRuleDialogOpen(true);
  }

  function openEdit(rule: ApprovalRule) {
    setEditing(rule);
    setRuleForm({
      active: rule.active,
      approverUserIds: rule.approvers.map((approver) => approver.userId),
      minimumAmount: editableNumber(rule.minimumAmount),
      name: rule.name,
      notificationChannel: rule.notificationChannel,
      requiredApprovals: String(rule.requiredApprovals) as '1' | '2',
    });
    setError(null);
    setRuleDialogOpen(true);
  }

  function toggleApprover(userId: string) {
    setRuleForm((current) => ({
      ...current,
      approverUserIds: current.approverUserIds.includes(userId)
        ? current.approverUserIds.filter((id) => id !== userId)
        : [...current.approverUserIds, userId],
    }));
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const base: CreateApprovalRuleInput = {
        active: ruleForm.active,
        approverUserIds: ruleForm.approverUserIds,
        minimumAmount: parseMoney(ruleForm.minimumAmount),
        name: ruleForm.name.trim(),
        notificationChannel: ruleForm.notificationChannel,
        requiredApprovals: Number(ruleForm.requiredApprovals),
      };
      if (editing) {
        const input: UpdateApprovalRuleInput = {
          ...base,
          expectedUpdatedAt: editing.updatedAt,
        };
        await apiPatch<ApprovalRule>(`/approvals/rules/${editing.id}`, input, {
          token: accessToken,
          organizationId,
        });
      } else {
        await apiPost<ApprovalRule>('/approvals/rules', base, {
          token: accessToken,
          organizationId,
        });
      }
      setRuleDialogOpen(false);
      setRevision((current) => current + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input: UpdateApprovalSettingsInput = {
        financeChannel: settings.financeChannel,
        financeRecipient: settings.financeRecipient?.trim() || null,
        notifyFinanceOnApproval: settings.notifyFinanceOnApproval,
      };
      const saved = await apiPut<ApprovalSettings>('/approvals/settings', input, {
        token: accessToken,
        organizationId,
      });
      setSettings(saved);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Governanca de compras</p>
          <h2>Faixas e aprovadores</h2>
        </span>
        <button className="primary-button" onClick={openCreate} type="button">
          <Plus size={16} />
          Nova regra
        </button>
      </section>

      {error && !ruleDialogOpen && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? (
          <div className="table-loading">Carregando regras</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Regra</th>
                  <th>A partir de</th>
                  <th>Quorum</th>
                  <th>Canal</th>
                  <th>Aprovadores</th>
                  <th>Status</th>
                  <th className="align-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rules.length ? (
                  rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <strong>{rule.name}</strong>
                      </td>
                      <td>{currency.format(rule.minimumAmount)}</td>
                      <td>{rule.requiredApprovals}</td>
                      <td>{channelLabel(rule.notificationChannel)}</td>
                      <td>
                        {rule.approvers.map((approver) => approver.name).join(', ')}
                      </td>
                      <td>
                        <span className={`status-label ${rule.active ? 'active' : ''}`}>
                          {rule.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="align-right">
                        <button
                          className="icon-button table-action"
                          onClick={() => openEdit(rule)}
                          title="Editar regra"
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-table-cell" colSpan={7}>
                      Nenhuma regra configurada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section-heading compact-section-heading">
        <span>
          <p className="eyebrow">Encaminhamento financeiro</p>
          <h2>Notificacao apos aprovacao</h2>
        </span>
      </section>
      <form className="panel management-form settings-form" onSubmit={(event) => void saveSettings(event)}>
        <label className="toggle-row">
          <input
            checked={settings.notifyFinanceOnApproval}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                notifyFinanceOnApproval: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>
            <strong>Notificar o financeiro</strong>
            <small>Envia os dados de pagamento quando o quorum for concluido.</small>
          </span>
        </label>
        <div className="form-grid two-columns">
          <label>
            Canal
            <select
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  financeChannel: (event.target.value || null) as
                    | NotificationChannel
                    | null,
                  financeRecipient: event.target.value
                    ? current.financeRecipient
                    : null,
                }))
              }
              value={settings.financeChannel ?? ''}
            >
              <option value="">Nao configurado</option>
              <option value="EMAIL">E-mail</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </label>
          <label>
            Destinatario
            <input
              disabled={!settings.financeChannel}
              maxLength={255}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  financeRecipient: event.target.value,
                }))
              }
              placeholder={
                settings.financeChannel === 'WHATSAPP'
                  ? '+5511999999999'
                  : 'financeiro@empresa.com.br'
              }
              value={settings.financeRecipient ?? ''}
            />
          </label>
        </div>
        <div className="form-footer-inline">
          <button
            className="primary-button"
            disabled={
              submitting ||
              (settings.notifyFinanceOnApproval &&
                (!settings.financeChannel || !settings.financeRecipient?.trim()))
            }
            type="submit"
          >
            <Save size={16} />
            {submitting ? 'Salvando' : 'Salvar notificacao'}
          </button>
        </div>
      </form>

      {ruleDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="approval-rule-title"
            aria-modal="true"
            className="modal-panel modal-wide"
            role="dialog"
          >
            <header className="modal-header">
              <span>
                <p className="eyebrow">Regra por valor</p>
                <h2 id="approval-rule-title">
                  {editing ? 'Editar regra' : 'Nova regra'}
                </h2>
              </span>
              <button
                className="icon-button"
                onClick={() => setRuleDialogOpen(false)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <form className="management-form" onSubmit={(event) => void saveRule(event)}>
              <div className="form-grid two-columns">
                <label>
                  Nome
                  <input
                    autoFocus
                    maxLength={120}
                    minLength={2}
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    value={ruleForm.name}
                  />
                </label>
                <label>
                  Valor minimo
                  <input
                    inputMode="decimal"
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        minimumAmount: event.target.value,
                      }))
                    }
                    required
                    value={ruleForm.minimumAmount}
                  />
                </label>
                <label>
                  Quantidade de aprovacoes
                  <select
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        requiredApprovals: event.target.value as '1' | '2',
                      }))
                    }
                    value={ruleForm.requiredApprovals}
                  >
                    <option value="1">Uma aprovacao</option>
                    <option value="2">Duas aprovacoes</option>
                  </select>
                </label>
                <label>
                  Canal dos aprovadores
                  <select
                    onChange={(event) =>
                      setRuleForm((current) => {
                        const notificationChannel = event.target
                          .value as NotificationChannel;
                        return {
                          ...current,
                          notificationChannel,
                          approverUserIds:
                            notificationChannel === 'WHATSAPP'
                              ? current.approverUserIds.filter((userId) =>
                                  members.some(
                                    (member) =>
                                      member.userId === userId && member.phone,
                                  ),
                                )
                              : current.approverUserIds,
                        };
                      })
                    }
                    value={ruleForm.notificationChannel}
                  >
                    <option value="EMAIL">E-mail</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </select>
                </label>
              </div>
              <fieldset className="approver-fieldset">
                <legend>Aprovadores</legend>
                <div className="approver-options">
                  {members.map((member) => (
                    <label className="checkbox-option" key={member.userId}>
                      <input
                        checked={ruleForm.approverUserIds.includes(member.userId)}
                        disabled={
                          ruleForm.notificationChannel === 'WHATSAPP' &&
                          !member.phone
                        }
                        onChange={() => toggleApprover(member.userId)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{member.name}</strong>
                        <small>
                          {ruleForm.notificationChannel === 'EMAIL'
                            ? member.email
                            : member.phone ?? 'WhatsApp nao cadastrado'}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="toggle-row">
                <input
                  checked={ruleForm.active}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <strong>Regra ativa</strong>
                  <small>Regras inativas permanecem no historico.</small>
                </span>
              </label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setRuleDialogOpen(false)}
                  type="button"
                >
                  Fechar
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    ruleForm.approverUserIds.length <
                      Number(ruleForm.requiredApprovals)
                  }
                  type="submit"
                >
                  <Save size={16} />
                  {submitting ? 'Salvando' : 'Salvar regra'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function emptyRuleForm(): RuleForm {
  return {
    active: true,
    approverUserIds: [],
    minimumAmount: '0',
    name: '',
    notificationChannel: 'EMAIL',
    requiredApprovals: '1',
  };
}

function channelLabel(channel: NotificationChannel): string {
  return channel === 'EMAIL' ? 'E-mail' : 'WhatsApp';
}

function parseMoney(value: string): number {
  const compact = value.replace(/R\$|\s/g, '');
  return Number(
    compact.includes(',')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact,
  );
}

function editableNumber(value: number): string {
  return String(value).replace('.', ',');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel salvar a configuracao.';
}
