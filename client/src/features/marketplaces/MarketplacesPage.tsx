import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, ChevronDown, KeyRound, Plus, RefreshCw, Store } from "lucide-react";
import { supabase } from "../../services/supabase";
import { errorMessage } from "../../services/api";
import "./marketplaces.css";

type Marketplace = { id: string; name: string; provider: string; seller_id: string; app_id: string; redirect_url: string; notes: string; enabled: boolean; credentials_saved: boolean; updated_at: string };
type Event = { id: string; marketplace_id: string; message: string; created_at: string };
const blank = { name: "", provider: "shopee", seller_id: "", app_id: "", redirect_url: "", notes: "", enabled: true, app_secret: "", access_token: "", refresh_token: "" };
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
export default function MarketplacesPage({ groupId, canManage, notify }: { groupId: string; canManage: boolean; notify: (message: string, error?: boolean) => void }) {
  const [tab, setTab] = useState<"marketplaces" | "monitor" | "connection">("marketplaces");
  const [items, setItems] = useState<Marketplace[]>([]), [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState(""), [dropdown, setDropdown] = useState(false);
  const [form, setForm] = useState(blank), [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [updated, setUpdated] = useState("");
  const load = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    try {
      const [list, history] = await Promise.all([
        supabase.from("marketplaces").select("*").eq("group_id", groupId).order("name"),
        supabase.from("marketplace_events").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(100),
      ]);
      if (list.error) throw list.error;
      if (history.error) throw history.error;
      setItems(list.data || []); setEvents(history.data || []); setError(""); setUpdated(new Date().toISOString());
    } catch (reason) { setError((reason as { message?: string }).message || errorMessage(reason)); }
    finally { setLoading(false); }
  }, [groupId]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000); return () => window.clearInterval(timer); }, [load]);
  const current = items.find(item => item.id === selected);
  const visible = selected ? items.filter(item => item.id === selected) : items;
  const history = selected ? events.filter(event => event.marketplace_id === selected) : events;
  const edit = (item?: Marketplace) => { setEditing(item?.id || null); setForm(item ? { ...blank, ...item, app_secret: "", access_token: "", refresh_token: "" } : { ...blank }); setTab("connection"); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const { data, error } = await supabase.rpc("save_marketplace", { target_group: groupId, target_id: editing, details: { name: form.name.trim(), provider: form.provider, seller_id: form.seller_id.trim(), app_id: form.app_id.trim(), redirect_url: form.redirect_url.trim(), notes: form.notes.trim(), enabled: form.enabled }, secrets: { app_secret: form.app_secret, access_token: form.access_token, refresh_token: form.refresh_token } });
      if (error) throw error;
      setSelected(data); setEditing(data); setForm(value => ({ ...value, app_secret: "", access_token: "", refresh_token: "" }));
      await load(); notify("Marketplace salvo."); setTab("marketplaces");
    } catch (reason) { notify((reason as { message?: string }).message || errorMessage(reason), true); }
    finally { setSaving(false); }
  };
  return <div className="marketplace-page">
    <div className="page-heading"><div><h1>Marketplaces</h1><p>Suas lojas, conex?es e atividades em um s? lugar.</p></div>{canManage && <button className="primary" onClick={() => edit()}><Plus size={16} />Cadastrar marketplace</button>}</div>
    <nav className="marketplace-tabs" aria-label="Se??es de marketplaces">
      <div className="marketplace-dropdown"><button className={tab === "marketplaces" ? "selected" : ""} aria-expanded={dropdown} aria-controls="marketplace-options" onClick={() => { setTab("marketplaces"); setDropdown(value => !value); }}><Store size={18} />Marketplaces<ChevronDown size={16} /></button>
        {dropdown && <><button className="marketplace-dismiss" aria-label="Fechar lista" onClick={() => setDropdown(false)} /><div className="marketplace-options" id="marketplace-options"><button onClick={() => { setSelected(""); setDropdown(false); }}>Todos os marketplaces</button>{items.map(item => <button key={item.id} onClick={() => { setSelected(item.id); setDropdown(false); }}>{item.name}<small>{item.provider === "shopee" ? "Shopee" : "Mercado Livre"}</small></button>)}{!items.length && <p>Nenhum marketplace cadastrado.</p>}</div></>}
      </div>
      <button className={tab === "monitor" ? "selected" : ""} onClick={() => { setDropdown(false); setTab("monitor"); }}><Activity size={18} />Monitor em tempo real</button>
      <button className={tab === "connection" ? "selected" : ""} onClick={() => { setDropdown(false); edit(current); }}><KeyRound size={18} />Conex?o</button>
    </nav>
    {error && <div className="notice error" role="alert">N?o foi poss?vel carregar os marketplaces. {error}<button className="outline" onClick={() => void load()}>Tentar novamente</button></div>}
    {loading ? <div className="card empty">Carregando marketplaces...</div> : tab === "marketplaces" ? <>
      <div className="marketplace-summary"><div className="card"><small>Marketplaces cadastrados</small><strong>{items.length}</strong></div><div className="card"><small>Com credenciais salvas</small><strong>{items.filter(item => item.credentials_saved).length}</strong></div><div className="card"><small>Integra??es autenticadas</small><strong>0</strong><small>Autentica??o com os provedores pendente</small></div></div>
      <div className="marketplace-grid">{visible.map(item => <article className="card marketplace-store" key={item.id}><span className={`marketplace-provider ${item.provider}`}>{item.provider === "shopee" ? "Shopee" : "Mercado Livre"}</span><h2>{item.name}</h2><p>{item.seller_id ? `Loja / vendedor: ${item.seller_id}` : "Identificador da loja ainda n?o informado"}</p><span className="marketplace-status">{!item.enabled ? "Pausado" : item.credentials_saved ? "Credenciais salvas ? autentica??o pendente" : "Aguardando configura??o"}</span>{item.notes && <p>{item.notes}</p>}<small>Atualizado em {date(item.updated_at)}</small>{canManage && <button className="outline" onClick={() => edit(item)}>Configurar conex?o</button>}</article>)}</div>
      {!visible.length && <div className="card empty"><Store /><b>Nenhum marketplace cadastrado</b><span>Cadastre sua loja na aba Conex?o.</span></div>}
    </> : tab === "monitor" ? <article className="card marketplace-monitor"><div className="card-title"><div><h3>Atividades {current ? `? ${current.name}` : "de todos os marketplaces"}</h3><p>Atualiza??o autom?tica a cada 15 segundos{updated ? ` ? ${date(updated)}` : ""}</p></div><button className="outline" onClick={() => void load()}><RefreshCw size={16} />Atualizar</button></div><div className="info">Acompanhamento dos eventos salvos no banco. Pedidos, vendas e sincroniza??o aparecer?o ap?s a implementa??o das integra??es com os provedores.</div>{history.length ? <div className="marketplace-events">{history.map(event => <div key={event.id}><Activity size={17} /><div><b>{items.find(item => item.id === event.marketplace_id)?.name || "Marketplace"}</b><p>{event.message}</p></div><time>{date(event.created_at)}</time></div>)}</div> : <div className="empty">Nenhuma atividade registrada.</div>}</article> : <article className="card form-card">
      <div className="card-title"><div><h3>{editing ? "Editar conex?o" : "Nova conex?o"}</h3><p>Cadastre as informa??es do aplicativo e da loja.</p></div></div>
      {!canManage ? <div className="info">Somente o propriet?rio do grupo pode cadastrar e alterar conex?es.</div> : <form onSubmit={save}><div className="form-grid">
        <label className="field">Nome da loja<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Minha loja Shopee" /></label>
        <label className="field">Marketplace<select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}><option value="shopee">Shopee</option><option value="mercado_livre">Mercado Livre</option></select></label>
        <label className="field">ID da loja / vendedor<input maxLength={200} value={form.seller_id} onChange={e => setForm({ ...form, seller_id: e.target.value })} /></label>
        <label className="field">App ID / Partner ID<input maxLength={200} value={form.app_id} onChange={e => setForm({ ...form, app_id: e.target.value })} /></label>
        <label className="field wide">URL de retorno (callback)<input type="url" maxLength={2048} placeholder="https://" value={form.redirect_url} onChange={e => setForm({ ...form, redirect_url: e.target.value })} /></label>
        {([['app_secret', 'App Secret / Partner Key'], ['access_token', 'Access token'], ['refresh_token', 'Refresh token']] as const).map(([key, label]) => <label className="field" key={key}>{label}<input type="password" autoComplete="new-password" maxLength={8192} value={form[key]} placeholder={editing ? "Deixe vazio para manter o valor salvo" : "Informe quando dispon?vel"} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
        <label className="field wide">Observa??es<textarea rows={3} maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <label className="recurring"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /><span>Manter cadastro ativo</span></label>
      </div><p className="balance-help">As credenciais s?o salvas em uma ?rea privada do banco e n?o s?o exibidas novamente. Salvar n?o autentica o aplicativo no marketplace.</p><div className="form-actions"><button type="button" className="outline" onClick={() => setTab("marketplaces")}>Cancelar</button><button className="primary" disabled={saving || !groupId}>{saving ? "Salvando..." : "Salvar conex?o"}</button></div></form>}
    </article>}
  </div>;
}
