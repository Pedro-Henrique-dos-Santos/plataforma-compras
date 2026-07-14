import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CostCenter,
  CreateCostCenterInput,
  UpdateCostCenterInput,
} from '@compras/contracts';
import { Pencil, Plus, Power, PowerOff, Search, X } from 'lucide-react';

import { apiGet, apiPatch, apiPost } from '../lib/api';

type CostCentersViewProps = {
  accessToken: string | null;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

export function CostCentersView({
  accessToken,
  canWrite,
  onChanged,
  organizationId,
}: CostCentersViewProps) {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiGet<CostCenter[]>('/cost-centers?includeInactive=true', {
      token: accessToken,
      organizationId,
      signal: controller.signal,
    })
      .then(setCenters)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId]);

  const visibleCenters = useMemo(() => {
    const term = normalize(search);
    return centers.filter((center) =>
      !term ? true : normalize(`${center.code} ${center.name}`).includes(term),
    );
  }, [centers, search]);

  function openCreate() {
    setEditing(null);
    setCode('');
    setName('');
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(center: CostCenter) {
    setEditing(center);
    setCode(center.code);
    setName(center.name);
    setError(null);
    setDialogOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        const input: UpdateCostCenterInput = { code, name };
        const updated = await apiPatch<CostCenter>(`/cost-centers/${editing.id}`, input, {
          token: accessToken,
          organizationId,
        });
        setCenters((current) => replace(current, updated));
      } else {
        const input: CreateCostCenterInput = { code, name };
        const created = await apiPost<CostCenter>('/cost-centers', input, {
          token: accessToken,
          organizationId,
        });
        setCenters((current) => sortCenters([...current, created]));
      }
      setDialogOpen(false);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(center: CostCenter) {
    setPendingId(center.id);
    setError(null);
    try {
      const updated = await apiPatch<CostCenter>(
        `/cost-centers/${center.id}`,
        { active: !center.active },
        { token: accessToken, organizationId },
      );
      setCenters((current) => replace(current, updated));
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Estrutura financeira</p>
          <h2>Departamentos e centros de custo</h2>
        </span>
        {canWrite && (
          <button className="primary-button" onClick={openCreate} type="button">
            <Plus size={16} />
            Novo centro
          </button>
        )}
      </section>

      <section className="filter-bar panel">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Buscar centro de custo</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por codigo ou departamento"
            value={search}
          />
        </label>
        <span className="count-label">{visibleCenters.length} registros</span>
      </section>

      {error && !dialogOpen && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? <div className="table-loading">Carregando centros de custo</div> : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Departamento</th>
                  <th>Status</th>
                  {canWrite && <th className="align-right">Acoes</th>}
                </tr>
              </thead>
              <tbody>
                {visibleCenters.length ? visibleCenters.map((center) => (
                  <tr key={center.id}>
                    <td className="order-id">{center.code}</td>
                    <td>{center.name}</td>
                    <td>
                      <span className={`status-label ${center.active ? 'active' : ''}`}>
                        {center.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="align-right table-actions-cell">
                        <button
                          aria-label={`Editar ${center.name}`}
                          className="icon-button table-action"
                          onClick={() => openEdit(center)}
                          title="Editar"
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          aria-label={center.active ? 'Inativar centro' : 'Reativar centro'}
                          className="icon-button table-action"
                          disabled={pendingId === center.id}
                          onClick={() => void toggle(center)}
                          title={center.active ? 'Inativar' : 'Reativar'}
                          type="button"
                        >
                          {center.active ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr><td className="empty-table-cell" colSpan={canWrite ? 4 : 3}>Nenhum centro de custo encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="cost-center-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span>
                <p className="eyebrow">Estrutura da empresa</p>
                <h2 id="cost-center-title">{editing ? 'Editar centro de custo' : 'Novo centro de custo'}</h2>
              </span>
              <button className="icon-button" onClick={() => setDialogOpen(false)} title="Fechar" type="button">
                <X size={18} />
              </button>
            </header>
            <form className="management-form" onSubmit={(event) => void submit(event)}>
              <div className="form-grid two-columns">
                <label>
                  Codigo
                  <input autoFocus maxLength={40} onChange={(event) => setCode(event.target.value.toUpperCase())} required value={code} />
                </label>
                <label>
                  Departamento
                  <input maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
                </label>
              </div>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">Cancelar</button>
                <button className="primary-button" disabled={submitting} type="submit">
                  {editing ? <Pencil size={16} /> : <Plus size={16} />}
                  {submitting ? 'Salvando' : 'Salvar centro'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function replace(current: CostCenter[], updated: CostCenter): CostCenter[] {
  return sortCenters(current.map((center) => center.id === updated.id ? updated : center));
}

function sortCenters(centers: CostCenter[]): CostCenter[] {
  return [...centers].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel alterar o centro de custo.';
}
