import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../../services/supabase";
import { api } from "../../services/api";

type User = { id: string; name: string; email?: string };
export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "recover" | "reset">(sessionStorage.getItem("finanbase-recovery") ? "reset" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(sessionStorage.getItem("finanbase-recovery-email") || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const switchMode = (next: typeof mode) => { sessionStorage.removeItem("finanbase-recovery"); sessionStorage.removeItem("finanbase-recovery-email"); setMode(next); setError(""); setMessage(""); setPassword(""); setConfirmation(""); setToken(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (!supabaseConfigured) throw new Error("Configure o Supabase para continuar.");
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
        if (error) throw error;
        sessionStorage.setItem("finanbase-recovery", "1"); sessionStorage.setItem("finanbase-recovery-email", normalizedEmail); setMode("reset"); setMessage("Se houver uma conta para este e-mail, você receberá um código de recuperação.");
      } else if (mode === "reset") {
        if (password !== confirmation) throw new Error("As senhas não conferem.");
        const { error: verificationError } = await supabase.auth.verifyOtp({ email: normalizedEmail, token: token.trim(), type: "recovery" });
        if (verificationError) throw verificationError;
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) { await supabase.auth.signOut(); throw updateError; }
        await supabase.auth.signOut(); switchMode("login"); setMessage("Senha atualizada. Entre com sua nova senha.");
      } else if (mode === "signup") {
        if (password !== confirmation) throw new Error("As senhas não conferem.");
        const response = await api.post<{ user: User | null; message: string }>("/auth/signup", { name: name.trim(), email: normalizedEmail, password });
        setMessage(response.data.message);
        if (response.data.user && response.data.message === "Conta criada.") onLogin(response.data.user);
      } else {
        const response = await api.post<{ user: User }>("/auth/login", { email: normalizedEmail, password });
        if (key.trim() && key.trim() !== response.data.user.id) {
          await supabase.auth.signOut(); throw new Error("A chaveusuario não corresponde ? conta autenticada.");
        }
        onLogin(response.data.user);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possóvel continuar."); }
    finally { setBusy(false); }
  };
  const google = async () => {
    setBusy(true); setError("");
    try {
      if (!supabaseConfigured) throw new Error("Configure o Supabase para continuar.");
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } } });
      if (error) throw error;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao acessar o Google."); setBusy(false); }
  };
  const recovery = mode === "recover" || mode === "reset";
  return <main className="login-page">
    <section className="login-visual"><div className="login-brand"><span>FB</span><b>Finanbase</b></div><div><small>CONTROLE FINANCEIRO</small><h1>Suas finanças e sua produção em um só lugar.</h1><p>Seu negócio conectado, com acesso seguro para sua equipe.</p></div></section>
    <section className="login-panel"><form className="card login-card" onSubmit={submit} aria-busy={busy}>
      <div className="login-mark">FB</div><h2>{mode === "signup" ? "Criar conta" : recovery ? "Recuperar senha" : "Bem-vindo de volta"}</h2>
      <p>{recovery ? "Confirme seu acesso pelo código enviado ao e-mail." : "Acesse seu espa?o de trabalho."}</p>
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
      <fieldset disabled={busy} className="auth-fields">
      {!recovery && <><button type="button" className="google-login" onClick={google}>Continuar com Google</button><p className="auth-divider">ou continue com e-mail</p></>}
      {mode === "signup" && <label>Nome<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={120} required /></label>}
      <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required readOnly={mode === "reset"} /></label>
      {!recovery && <label>Chaveusuario<input value={mode === "signup" ? "Gerada automaticamente ao criar a conta" : key} onChange={e => setKey(e.target.value)} readOnly={mode === "signup"} placeholder="Opcional · disponível no seu perfil" autoComplete="off" /><small>Identificador da conta. O acesso ? protegido pela autenticação e pelas permissóes do banco.</small></label>}
      {mode === "reset" && <label>Código recebido por e-mail<input value={token} onChange={e => setToken(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" required /></label>}
      {mode !== "recover" && <><label>{mode === "reset" ? "Nova senha" : "Senha"}<div className="password-input"><input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} required /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? "Ocultar" : "Mostrar"}</button></div></label>{mode !== "login" && <label>Confirmar senha<input type={show ? "text" : "password"} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" minLength={8} required /></label>}</>}
      <button className="primary login-button" type="submit">{busy ? "Aguarde..." : mode === "signup" ? "Criar conta" : mode === "recover" ? "Enviar código por e-mail" : mode === "reset" ? "Salvar nova senha" : "Entrar"}</button>
      {mode === "login" && <button className="auth-switch" type="button" onClick={() => switchMode("recover")}>Esqueci minha senha</button>}
      <button className="auth-switch" type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Criar uma conta" : "Voltar para entrar"}</button>
      </fieldset>
    </form></section>
  </main>;
}
