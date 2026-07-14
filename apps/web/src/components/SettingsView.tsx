import { ChevronDown, MonitorCog } from 'lucide-react';

import type { ThemeMode } from '../lib/theme';

type SettingsViewProps = {
  onThemeChange: (theme: ThemeMode) => void;
  theme: ThemeMode;
};

export function SettingsView({ onThemeChange, theme }: SettingsViewProps) {
  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Preferencias</p>
          <h2>Configuracoes da interface</h2>
        </span>
      </section>

      <section className="panel settings-list">
        <div className="settings-row">
          <span className="settings-icon">
            <MonitorCog size={19} />
          </span>
          <span className="settings-copy">
            <strong>Aparencia</strong>
            <small>Tema aplicado neste navegador</small>
          </span>
          <label className="settings-select">
            <span className="sr-only">Aparencia</span>
            <select onChange={(event) => onThemeChange(event.target.value as ThemeMode)} value={theme}>
              <option value="normal">Normal</option>
              <option value="dark">Escuro</option>
              <option value="white">Branco</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>
      </section>
    </div>
  );
}
