import { useState, type FormEvent } from 'react';
import type {
  InviteOrganizationMemberInput,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
  UpdateOrganizationMemberInput,
  UserContext,
} from '@compras/contracts';
import {
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
  X,
} from 'lucide-react';

type AccessViewProps = {
  activeOrganization: OrganizationSummary;
  loading: boolean;
  members: OrganizationMember[];
  onInvite: (input: InviteOrganizationMemberInput) => Promise<void>;
  onUpdate: (membershipId: string, input: UpdateOrganizationMemberInput) => Promise<void>;
  user: UserContext;
};

const roleLabels: Record<OrganizationRole, string> = {
  ORGANIZATION_ADMIN: 'Administrador',
  BUYER: 'Comprador',
  REPORT_VIEWER: 'Relatorios',
};

export function AccessView({
  activeOrganization,
  loading,
  members,
  onInvite,
  onUpdate,
  user,
}: AccessViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('BUYER');
  const [submitting, setSubmitting] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onInvite({ email, name: name || undefined, role });
      setName('');
      setEmail('');
      setRole('BUYER');
      setDialogOpen(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateMember(member: OrganizationMember, input: UpdateOrganizationMemberInput) {
    setPendingMemberId(member.id);
    setError(null);
    try {
      await onUpdate(member.id, input);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingMemberId(null);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Seguranca</p>
          <h2>Usuarios e papeis</h2>
        </span>
        <div className="heading-actions">
          <span className="active-context">
            <KeyRound size={15} />
            {activeOrganization.name}
          </span>
          <button className="primary-button" onClick={() => setDialogOpen(true)} type="button">
            <UserPlus size={16} />
            Convidar usuario
          </button>
        </div>
      </section>

      {user.platformRoles.includes('PLATFORM_OWNER') && (
        <section className="global-access-band">
          <span className="table-avatar platform">
            <ShieldCheck size={17} />
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
          <span className="global-access-scope">Proprietario global</span>
        </section>
      )}

      {error && <div className="inline-error">{error}</div>}

      <section className="panel access-panel">
        {loading ? (
          <div className="table-loading">Carregando acessos</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Papel na empresa</th>
                  <th>Status</th>
                  <th className="align-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const pending = pendingMemberId === member.id;
                  return (
                    <tr key={member.id}>
                      <td>
                        <span className="user-cell">
                          <span className="table-avatar organization">
                            <UserRound size={16} />
                          </span>
                          <span>
                            <strong>{member.name}</strong>
                            <small>{member.email}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <select
                          aria-label={`Papel de ${member.name}`}
                          className="table-select"
                          disabled={pending}
                          onChange={(event) =>
                            void updateMember(member, {
                              role: event.target.value as OrganizationRole,
                            })
                          }
                          value={member.role}
                        >
                          {Object.entries(roleLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`status-label ${member.status === 'ACTIVE' ? 'active' : ''}`}>
                          {statusLabel(member.status)}
                        </span>
                      </td>
                      <td className="align-right">
                        <button
                          aria-label={member.status === 'SUSPENDED' ? 'Reativar usuario' : 'Suspender usuario'}
                          className="icon-button table-action"
                          disabled={pending || member.status === 'INVITED'}
                          onClick={() =>
                            void updateMember(member, {
                              status: member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                            })
                          }
                          title={member.status === 'SUSPENDED' ? 'Reativar usuario' : 'Suspender usuario'}
                          type="button"
                        >
                          {member.status === 'SUSPENDED' ? <UserCheck size={17} /> : <UserX size={17} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="invite-user-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span>
                <p className="eyebrow">{activeOrganization.name}</p>
                <h2 id="invite-user-title">Convidar usuario</h2>
              </span>
              <button
                aria-label="Fechar"
                className="icon-button"
                onClick={() => setDialogOpen(false)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <form className="management-form" onSubmit={(event) => void handleInvite(event)}>
              <label>
                Nome
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </label>
              <label>
                E-mail
                <input
                  autoComplete="email"
                  maxLength={255}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                Papel na empresa
                <select onChange={(event) => setRole(event.target.value as OrganizationRole)} value={role}>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">
                  Cancelar
                </button>
                <button className="primary-button" disabled={submitting} type="submit">
                  <UserPlus size={16} />
                  {submitting ? 'Enviando' : 'Enviar convite'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: OrganizationMember['status']): string {
  return { ACTIVE: 'Ativo', INVITED: 'Convidado', SUSPENDED: 'Suspenso' }[status];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel alterar o acesso.';
}
