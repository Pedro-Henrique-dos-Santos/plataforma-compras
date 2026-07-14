import type { OrganizationSummary, UserContext } from '@compras/contracts';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';

type AccessViewProps = {
  activeOrganization: OrganizationSummary;
  user: UserContext;
};

export function AccessView({ activeOrganization, user }: AccessViewProps) {
  const rows = [
    {
      email: user.email,
      name: user.name,
      scope: 'Toda a plataforma',
      role: 'Proprietario global',
      kind: 'platform',
    },
    {
      email: 'compras@humanclinic.com.br',
      name: 'Equipe de Compras',
      scope: 'Human Clinic',
      role: 'Comprador',
      kind: 'organization',
    },
  ];

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Seguranca</p>
          <h2>Usuarios e papeis</h2>
        </span>
        <span className="active-context">
          <KeyRound size={15} />
          Contexto: {activeOrganization.name}
        </span>
      </section>

      <section className="panel access-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Escopo</th>
                <th>Papel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email}>
                  <td>
                    <span className="user-cell">
                      <span className={`table-avatar ${row.kind}`}>
                        {row.kind === 'platform' ? (
                          <ShieldCheck size={16} />
                        ) : (
                          <UserRound size={16} />
                        )}
                      </span>
                      <span>
                        <strong>{row.name}</strong>
                        <small>{row.email}</small>
                      </span>
                    </span>
                  </td>
                  <td>{row.scope}</td>
                  <td>
                    <span className={`role-label ${row.kind}`}>{row.role}</span>
                  </td>
                  <td>
                    <span className="status-label active">Ativo</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

