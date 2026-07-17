import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, MailCheck, UserPlus } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';
import type { LegalDocumentKind } from '../legal';
import { demoMode, supabase } from '../lib/auth';
import { LegalDocumentDialog } from './LegalDocumentDialog';

type LoginScreenProps = {
  onAuthenticated: (token: string | null) => void;
};

type LoginMode = 'login' | 'signup' | 'signup-sent' | 'recovery' | 'recovery-sent';

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [legalDialog, setLegalDialog] = useState<LegalDocumentKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demoMode) {
      onAuthenticated(null);
      return;
    }
    if (!supabase) {
      setError('A autenticacao ainda nao foi configurada neste ambiente.');
      return;
    }

    setSubmitting(true);
    setError(null);
    if (mode === 'recovery') {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?recovery=1`,
      });
      setSubmitting(false);
      if (recoveryError) {
        setError(recoveryError.message);
        return;
      }
      setMode('recovery-sent');
      return;
    }

    if (mode === 'signup') {
      if (password !== passwordConfirmation) {
        setSubmitting(false);
        setError('As senhas informadas nao coincidem.');
        return;
      }
      if (!termsAccepted || !privacyAccepted) {
        setSubmitting(false);
        setError('Confirme os Termos de uso e o Aviso de privacidade.');
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      setSubmitting(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        onAuthenticated(data.session.access_token);
        return;
      }
      setMode('signup-sent');
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError || !data.session) {
      setError(signInError?.message ?? 'Nao foi possivel iniciar a sessao.');
      return;
    }
    onAuthenticated(data.session.access_token);
  }

  const confirmationMode = mode === 'recovery-sent' || mode === 'signup-sent';

  return (
    <>
      <main className="login-page">
        <section className="login-brand" aria-label="E-Gestao Compras">
          <div className="login-brand-inner">
            <div className="brand-lockup large">
              <img alt="" className="brand-logo" src={logoMark} />
              <span>
                <strong>E-Gestao Compras</strong>
                <small>Gestao multiempresa</small>
              </span>
            </div>
            <div className="login-statement">
              <p className="eyebrow">Operacao centralizada</p>
              <h1>Compras sob controle, empresa por empresa.</h1>
              <p>
                Acompanhe valores, fornecedores e resultados em um ambiente separado para cada
                organizacao.
              </p>
            </div>
            <div className="login-brand-footer">Ambiente seguro e auditavel</div>
          </div>
        </section>

        <section className="login-form-panel">
          {confirmationMode ? (
            <div className="login-form recovery-result">
              <span className="login-icon" aria-hidden="true">
                <MailCheck size={21} />
              </span>
              <h2>Verifique seu e-mail</h2>
              <p className="form-subtitle">
                {mode === 'signup-sent'
                  ? `O link para confirmar o cadastro foi enviado para ${email}.`
                  : `O link para redefinir a senha foi enviado para ${email}.`}
              </p>
              <button className="secondary-button login-submit" onClick={() => setMode('login')} type="button">
                <ArrowLeft size={17} />
                Voltar ao acesso
              </button>
            </div>
          ) : (
            <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
              <span className="login-icon" aria-hidden="true">
                {mode === 'signup' ? <UserPlus size={21} /> : <LockKeyhole size={21} />}
              </span>
              <h2>{formTitle(mode)}</h2>
              <p className="form-subtitle">{formSubtitle(mode)}</p>

              {!demoMode && (
                <>
                  {mode === 'signup' && (
                    <label>
                      Nome exibido
                      <input
                        autoComplete="name"
                        maxLength={120}
                        minLength={2}
                        onChange={(event) => setName(event.target.value)}
                        required
                        value={name}
                      />
                    </label>
                  )}
                  <label>
                    E-mail
                    <input
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="seu@email.com"
                      required
                      type="email"
                      value={email}
                    />
                  </label>
                  {(mode === 'login' || mode === 'signup') && (
                    <label>
                      Senha
                      <input
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        minLength={8}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        type="password"
                        value={password}
                      />
                    </label>
                  )}
                  {mode === 'signup' && (
                    <>
                      <label>
                        Confirmar senha
                        <input
                          autoComplete="new-password"
                          minLength={8}
                          onChange={(event) => setPasswordConfirmation(event.target.value)}
                          required
                          type="password"
                          value={passwordConfirmation}
                        />
                      </label>
                      <div className="consent-options compact-consent">
                        <label className="checkbox-row">
                          <input
                            checked={termsAccepted}
                            onChange={(event) => setTermsAccepted(event.target.checked)}
                            required
                            type="checkbox"
                          />
                          <span>
                            Concordo com os{' '}
                            <button className="inline-link" onClick={() => setLegalDialog('terms')} type="button">
                              Termos de uso
                            </button>
                            .
                          </span>
                        </label>
                        <label className="checkbox-row">
                          <input
                            checked={privacyAccepted}
                            onChange={(event) => setPrivacyAccepted(event.target.checked)}
                            required
                            type="checkbox"
                          />
                          <span>
                            Li e estou ciente do{' '}
                            <button className="inline-link" onClick={() => setLegalDialog('privacy')} type="button">
                              Aviso de privacidade
                            </button>
                            .
                          </span>
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}

              {error && <div className="form-error">{error}</div>}
              <button className="primary-button login-submit" disabled={submitting} type="submit">
                <span>{submitLabel(mode)}</span>
                <ArrowRight size={18} />
              </button>
              {!demoMode && mode === 'login' && (
                <div className="login-mode-actions">
                  <button className="text-button" onClick={() => changeMode('signup')} type="button">
                    Criar conta
                  </button>
                  <button className="text-button" onClick={() => changeMode('recovery')} type="button">
                    Esqueci minha senha
                  </button>
                </div>
              )}
              {!demoMode && mode !== 'login' && (
                <button className="text-button login-mode-button" onClick={() => changeMode('login')} type="button">
                  Voltar ao acesso
                </button>
              )}
            </form>
          )}
        </section>
      </main>
      {legalDialog && (
        <LegalDocumentDialog kind={legalDialog} onClose={() => setLegalDialog(null)} />
      )}
    </>
  );

  function changeMode(nextMode: LoginMode) {
    setError(null);
    setMode(nextMode);
  }
}

function formTitle(mode: LoginMode): string {
  if (mode === 'recovery') return 'Recuperar acesso';
  if (mode === 'signup') return 'Criar sua conta';
  return 'Acessar plataforma';
}

function formSubtitle(mode: LoginMode): string {
  if (demoMode) return 'Ambiente local de desenvolvimento';
  if (mode === 'recovery') return 'Informe o e-mail cadastrado';
  if (mode === 'signup') return 'Defina como seu nome sera exibido';
  return 'Entre com sua conta cadastrada';
}

function submitLabel(mode: LoginMode): string {
  if (demoMode) return 'Entrar na demonstracao';
  if (mode === 'recovery') return 'Enviar link';
  if (mode === 'signup') return 'Criar conta';
  return 'Entrar';
}
