import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Contact,
  ClipboardList,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Home,
  Image as ImageIcon,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  Package,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  User,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { api, errorMessage } from "./services/api";
import { supabase } from "./services/supabase";
import type {
  AppUser,
  Company,
  Client,
  Color,
  Group,
  IncomeSource,
  Order,
  OrderInput,
  OrderProductItem,
  Product,
  Transaction,
  TransactionInput,
} from "./types";
import { dateBR, money } from "./utils/format";
import "./catalog.css";

const transactionSchema = z.object({
  userId: z.string().min(1, "Selecione o usuário"),
  groupId: z.string().min(1, "Selecione o grupo"),
  sourceId: z.string().optional(),
  date: z.string().min(1, "Informe a data"),
  description: z.string().trim().min(2, "Informe o título"),
  value: z.coerce.number().positive("Informe um valor válido"),
  recurring: z.boolean(),
  observation: z.string().max(500).optional(),
  category: z.string(),
  paymentMethod: z.string(),
  status: z.enum(["paid", "pending", "cancelled"]),
  type: z.enum(["income", "expense"]),
});
type Toast = { message: string; error?: boolean };
type Session = {
  authenticatedUserId: string;
  users: AppUser[];
  activeUserId: string;
  activeUser?: AppUser;
  setActiveUserId: (id: string) => void;
  groups: Group[];
  activeGroupId: string;
  activeGroup?: Group;
  setActiveGroupId: (id: string) => void;
  reloadGroups: () => void;
  reloadUsers: () => void;
  logout: () => void;
};
const SessionContext = createContext<Session | null>(null);
const useSession = () => {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Sessão indisponível");
  return value;
};
const query = (params: Record<string, string>) =>
  new URLSearchParams(
    Object.entries(params).filter(([, value]) => value),
  ).toString();
const todayBrasilia = () => {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

type TransactionPreferences = Pick<
  TransactionInput,
  "sourceId" | "recurring" | "category" | "paymentMethod" | "status"
>;
const preferenceKey = (userId: string) =>
  `finanbase-transaction-preferences:${userId}`;
const incomeSourceKey = (userId: string) => `finanbase-income-source:${userId}`;
const defaultPreferences: TransactionPreferences = {
  sourceId: "",
  recurring: false,
  category: "Outros",
  paymentMethod: "Não informado",
  status: "paid",
};
const readPreferences = (userId: string): TransactionPreferences => {
  if (!userId) return defaultPreferences;
  try {
    const cached = JSON.parse(localStorage.getItem(preferenceKey(userId)) || "{}");
    return {
      ...defaultPreferences,
      ...cached,
      sourceId: cached.sourceId || localStorage.getItem(incomeSourceKey(userId)) || "",
    };
  } catch {
    return defaultPreferences;
  }
};
const savePreferences = (
  userId: string,
  preferences: TransactionPreferences,
) => {
  if (userId)
    localStorage.setItem(preferenceKey(userId), JSON.stringify(preferences));
  if (userId && preferences.sourceId)
    localStorage.setItem(incomeSourceKey(userId), preferences.sourceId);
};

type AuthUser = { id: string; name: string; email?: string };
export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser>(),
    [checking, setChecking] = useState(true);
  useEffect(() => {
    api.get<{ user: AuthUser }>("/auth/session")
      .then((response) => setAuthUser(response.data.user))
      .catch(() => setAuthUser(undefined))
      .finally(() => setChecking(false));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setAuthUser(undefined);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const logout = async () => {
    try { await api.post("/auth/logout"); } finally { setAuthUser(undefined); }
  };
  if (checking) return <div className="auth-loading"><span>FB</span><p>Carregando...</p></div>;
  if (!authUser) return <LoginPage onLogin={setAuthUser} />;
  return <AuthenticatedApp authUser={authUser} logout={logout} />;
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""),
    [error, setError] = useState(""), [message, setMessage] = useState(""), [loading, setLoading] = useState(false), [signup, setSignup] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      if (signup) {
        const response = await api.post<{ user: AuthUser | null; message: string }>("/auth/signup", { name, email, password });
        if (response.data.user) localStorage.setItem("finanbase-user", response.data.user.id);
        setMessage(response.data.message);
        if (response.data.user && response.data.message === "Conta criada.") onLogin(response.data.user);
      } else {
        const response = await api.post<{ user: AuthUser }>("/auth/login", { email, password });
        localStorage.setItem("finanbase-user", response.data.user.id);
        onLogin(response.data.user);
      }
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setLoading(false); }
  };
  return <main className="login-page">
    <section className="login-visual">
      <div className="login-brand"><span>FB</span><b>Finanbase</b></div>
      <div><small>CONTROLE FINANCEIRO</small><h1>Suas finanças e sua produção em um só lugar.</h1><p>Acesse seus ganhos, despesas e pedidos com segurança.</p></div>
    </section>
    <section className="login-panel">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-mark">FB</div><h2>{signup ? "Criar conta" : "Entrar"}</h2><p>{signup ? "Cadastre seu acesso seguro." : "Use seu e-mail para continuar."}</p>
        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}
        {signup && <Field label="Nome"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></Field>}
        <Field label="E-mail"><input autoFocus={!signup} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></Field>
        <Field label="Senha"><div className="password-input"><input type={showPassword?"text":"password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={signup?"new-password":"current-password"} required /><button type="button" onClick={()=>setShowPassword((visible)=>!visible)} aria-label={showPassword?"Ocultar senha":"Mostrar senha"} title={showPassword?"Ocultar senha":"Mostrar senha"}>{showPassword?<EyeOff/>:<Eye/>}</button></div></Field>
        <button className="primary login-button" disabled={loading || password.length < 6}>{loading ? "Aguarde..." : signup ? "Criar conta" : "Entrar"}</button>
        <button type="button" className="auth-switch" onClick={() => { setSignup(!signup); setError(""); setMessage(""); }}>{signup ? "Já tenho uma conta" : "Criar uma conta"}</button>
      </form>
    </section>
  </main>;
}

function AuthenticatedApp({ authUser, logout }: { authUser: AuthUser; logout: () => void }) {
  const [toast, setToast] = useState<Toast>();
  const groupsLoad = useLoad<Group[]>("/groups", []);
  const [storedGroupId, setStoredGroupId] = useState(() => localStorage.getItem("finanbase-group") || "");
  const activeGroupId = groupsLoad.data.some((group) => group.id === storedGroupId)
    ? storedGroupId : groupsLoad.data.find((group) => group.isDefault)?.id || groupsLoad.data[0]?.id || "";
  const usersLoad = useLoad<AppUser[]>(activeGroupId ? `/users?${query({ groupId: activeGroupId })}` : "/users", []);
  const [storedUserId, setStoredUserId] = useState(
    () => localStorage.getItem("finanbase-user") || authUser.id,
  );
  const activeUserId = usersLoad.data.some((user) => user.id === storedUserId)
    ? storedUserId
    : usersLoad.data.find((user) => user.id === authUser.id)?.id || usersLoad.data[0]?.id || "";
  useEffect(() => {
    if (activeUserId && storedUserId !== activeUserId) {
      setStoredUserId(activeUserId);
      localStorage.setItem("finanbase-user", activeUserId);
    }
  }, [activeUserId, storedUserId]);
  const setActiveUserId = (id: string) => {
    setStoredUserId(id);
    localStorage.setItem("finanbase-user", id);
  };
  useEffect(() => {
    if (activeGroupId && storedGroupId !== activeGroupId) {
      setStoredGroupId(activeGroupId);
      localStorage.setItem("finanbase-group", activeGroupId);
    }
  }, [activeGroupId, storedGroupId]);
  const setActiveGroupId = (id: string) => {
    setStoredGroupId(id);
    localStorage.setItem("finanbase-group", id);
  };
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(undefined), 3200);
  };
  const session = {
    authenticatedUserId: authUser.id,
    users: usersLoad.data,
    activeUserId,
    activeUser: usersLoad.data.find((user) => user.id === activeUserId),
    setActiveUserId,
    groups: groupsLoad.data,
    activeGroupId,
    activeGroup: groupsLoad.data.find((group) => group.id === activeGroupId),
    setActiveGroupId,
    reloadGroups: groupsLoad.reload,
    reloadUsers: usersLoad.reload,
    logout,
  };
  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="usuarios" element={<UserManagement notify={notify} />} />
          <Route path="grupos" element={<GroupManagement notify={notify} />} />
          <Route
            path="fontes-renda"
            element={<IncomeSources notify={notify} />}
          />
          <Route
            path="ganhos"
            element={<Movements type="income" notify={notify} />}
          />
          <Route
            path="despesas"
            element={<Movements type="expense" notify={notify} />}
          />
          <Route
            path="ganhos/novo"
            element={<MovementForm type="income" notify={notify} />}
          />
          <Route
            path="despesas/nova"
            element={<MovementForm type="expense" notify={notify} />}
          />
          <Route path="pedidos" element={<OrderQueue notify={notify} />} />
          <Route path="pedidos/novo" element={<OrderForm notify={notify} />} />
          <Route path="pedidos/:id" element={<OrderForm notify={notify} />} />
          <Route path="cadastros/clientes" element={<CatalogManagement kind="clients" notify={notify} />} />
          <Route path="cadastros/produtos" element={<CatalogManagement kind="products" notify={notify} />} />
          <Route
            path="movimentacoes/:id"
            element={<MovementForm notify={notify} />}
          />
          <Route
            path="configuracoes"
            element={<Configuration notify={notify} />}
          />
        </Route>
      </Routes>
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`}>
          {toast.message}
        </div>
      )}
    </SessionContext.Provider>
  );
}

function Layout() {
  const [open, setOpen] = useState(false),
    [registrationsOpen, setRegistrationsOpen] = useState(false),
    { users, activeUserId, activeUser, setActiveUserId, logout } = useSession();
  return (
    <div className="shell">
      <aside className={open ? "open" : ""}>
        <div className="brand">
          <span>FB</span>
          <div>
            <b>Finanbase</b>
            <small>Finance</small>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X />
          </button>
        </div>
        <nav onClick={() => setOpen(false)}>
          <NavLink to="/" end>
            <Home />
            Dashboard
          </NavLink>
          <NavLink to="/usuarios">
            <Users />
            Usuários
          </NavLink>
          <NavLink to="/fontes-renda">
            <BriefcaseBusiness />
            Fontes de renda
          </NavLink>
          <NavLink to="/grupos">
            <Users />
            Grupos
          </NavLink>
          <NavLink to="/ganhos">
            <ArrowUpRight />
            Ganhos
          </NavLink>
          <NavLink to="/despesas">
            <ArrowDownLeft />
            Despesas
          </NavLink>
          <NavLink to="/pedidos">
            <ClipboardList />
            Pedidos
          </NavLink>
          <button className="nav-parent" onClick={(event) => { event.stopPropagation(); setRegistrationsOpen((value) => !value); }}>
            <Database /> Cadastros <span>{registrationsOpen ? "−" : "+"}</span>
          </button>
          {registrationsOpen && <div className="nav-children">
            <NavLink to="/cadastros/clientes"><Contact />Clientes</NavLink>
            <NavLink to="/cadastros/produtos"><Package />Produtos</NavLink>
          </div>}
          <NavLink to="/configuracoes">
            <Settings />
            Configurações
          </NavLink>
        </nav>
        <div className="user-card">
          <span>{activeUser?.name?.[0] || "?"}</span>
          <div>
            <b>{activeUser?.name || "Selecione"}</b>
            <small>Usuário ativo</small>
          </div>
          <button className="logout-button" onClick={logout} aria-label="Sair" title="Sair"><LogOut /></button>
        </div>
      </aside>
      <div className="content">
        <header>
          <button
            className="menu"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </button>
          <div className="welcome">
            <b>Olá, {activeUser?.name || "usuário"} 👋</b>
            <small>Resumo financeiro do usuário selecionado.</small>
          </div>
          <div className="session-controls">
          <label className="session-picker">
            <User />
            <select
              value={activeUserId}
              onChange={(event) => setActiveUserId(event.target.value)}
              aria-label="Usuário ativo"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <NavLink to="/usuarios" className="edit-user" aria-label="Editar usuário selecionado" title="Editar usuário"><Pencil /></NavLink>
          </div>
          <NavLink to="/despesas/nova" className="primary header-action">
            <Plus />
            Nova movimentação
          </NavLink>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
    </div>
  );
}

function useLoad<T>(url: string, initial: T) {
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get<T>(url)
      .then((response) => setData(response.data))
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(reload, [reload]);
  return { data, loading, error, reload };
}

function Dashboard() {
  const { activeUserId, activeGroupId } = useSession(),
    sources = useLoad<IncomeSource[]>(`/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`, []),
    [sourceId, setSourceId] = useState(() => localStorage.getItem(incomeSourceKey(activeUserId)) || ""),
    params = query({ groupId: activeGroupId, userId: activeUserId, sourceId }),
    summary = useLoad(`/dashboard/summary?${params}`, {
      balance: 0,
      income: 0,
      expense: 0,
      pending: 0,
      count: 0,
    }),
    charts = useLoad<{
      monthly: { name: string; income: number; expense: number }[];
      evolution: { date: string; balance: number }[];
    }>(`/dashboard/charts?${params}`, { monthly: [], evolution: [] }),
    recent = useLoad<{ data: Transaction[] }>(
      `/transactions?${query({ groupId: activeGroupId, userId: activeUserId, sourceId, limit: "5" })}`,
      { data: [] },
    );
  useEffect(() => {
    const cached = localStorage.getItem(incomeSourceKey(activeUserId)) || "";
    const valid = !cached || sources.data.some((source) => source.id === cached && source.active);
    setSourceId(valid ? cached : "");
  }, [activeUserId, sources.data]);
  const selectSource = (value: string) => {
    setSourceId(value);
    localStorage.setItem(incomeSourceKey(activeUserId), value);
  };
  return (
    <div className="dashboard-bank">
      <PageHeading
        title="Dashboard"
        subtitle="Controle ganhos e despesas por usuário e fonte de renda."
      >
        <label className="dashboard-source">
          <span>Fonte de renda</span>
          <select value={sourceId} onChange={(event) => selectSource(event.target.value)}>
            <option value="">Todas as fontes</option>
            {sources.data.filter((source) => source.active).map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>
        </label>
      </PageHeading>
      {summary.error && <div className="notice error">{summary.error}</div>}
      <section className="kpis">
        <Kpi
          featured
          label="Saldo atual"
          value={summary.data.balance}
          icon={<WalletCards />}
        />
        <Kpi
          label="Ganhos no período"
          value={summary.data.income}
          icon={<ArrowUpRight />}
          tone="green"
        />
        <Kpi
          label="Despesas no período"
          value={summary.data.expense}
          icon={<ArrowDownLeft />}
          tone="red"
        />
      </section>
      <section className="charts">
        <article className="card chart">
          <CardTitle
            title="Fluxo financeiro"
            subtitle="Ganhos e despesas por mês"
          />
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={charts.data.monthly}>
              <CartesianGrid vertical={false} stroke="#eef1f5" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(value: number) => money.format(value)} />
              <Bar
                dataKey="income"
                name="Ganhos"
                fill="#2161f5"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="expense"
                name="Despesas"
                fill="#ff5c6c"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="card chart">
          <CardTitle title="Evolução do saldo" subtitle="Saldo acumulado" />
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={charts.data.evolution}>
              <CartesianGrid vertical={false} stroke="#eef1f5" />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip formatter={(value: number) => money.format(value)} />
              <Line
                dataKey="balance"
                stroke="#2161f5"
                strokeWidth={3}
                dot={{ fill: "#2161f5", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>
      <article className="card recent">
        <CardTitle
          title="Movimentações recentes"
          subtitle="Últimos registros do usuário"
          action={
            <NavLink to="/despesas">
              Ver todas <ArrowRight />
            </NavLink>
          }
        />
        <TransactionRows data={recent.data.data} />
      </article>
    </div>
  );
}
function Kpi({
  label,
  value,
  icon,
  tone = "blue",
  featured,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: string;
  featured?: boolean;
}) {
  return (
    <article className={`card kpi ${featured ? "featured" : ""}`}>
      <span className={`kpi-icon ${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{money.format(value)}</strong>
        {featured && <em>Usuário selecionado</em>}
      </div>
    </article>
  );
}

function Movements({
  type,
  notify,
}: {
  type: "income" | "expense";
  notify: (message: string, error?: boolean) => void;
}) {
  const { activeUserId, activeGroupId } = useSession(),
    income = type === "income",
    copy = income
      ? {
          title: "Ganhos",
          subtitle: "Registre tudo que entra.",
          new: "Novo ganho",
          url: "/ganhos/novo",
        }
      : {
          title: "Despesas",
          subtitle: "Organize tudo que sai.",
          new: "Nova despesa",
          url: "/despesas/nova",
        },
    load = useLoad<{
      data: Transaction[];
      summary: { totalIncome: number; totalExpense: number };
    }>(`/transactions?${query({ groupId: activeGroupId, userId: activeUserId, type, limit: "100" })}`, {
      data: [],
      summary: { totalIncome: 0, totalExpense: 0 },
    }),
    sources = useLoad<IncomeSource[]>(
      `/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`,
      [],
    );
  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[] | null>(null);
  const [draftSourceIds, setDraftSourceIds] = useState<string[]>([]);
  const filteredTransactions = useMemo(
    () => selectedSourceIds === null
      ? load.data.data
      : load.data.data.filter((item) => selectedSourceIds.includes(item.sourceId || "__none")),
    [load.data.data, selectedSourceIds],
  );
  const filteredTotal = useMemo(
    () => filteredTransactions
      .filter((item) => item.status !== "cancelled")
      .reduce((sum, item) => sum + item.value, 0),
    [filteredTransactions],
  );
  const recurring = useMemo(
      () =>
        filteredTransactions
          .filter((item) => item.recurring)
          .reduce((sum, item) => sum + item.value, 0),
      [filteredTransactions],
    );
  const openSourceFilter = () => {
    setDraftSourceIds(selectedSourceIds ?? [...sources.data.map((source) => source.id), "__none"]);
    setSourceFilterOpen(true);
  };
  const toggleDraftSource = (id: string) => setDraftSourceIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
  );
  const applySourceFilter = () => {
    const allIds = [...sources.data.map((source) => source.id), "__none"];
    setSelectedSourceIds(draftSourceIds.length === allIds.length ? null : draftSourceIds);
    setSourceFilterOpen(false);
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir esta movimentação?")) return;
    try {
      await api.delete(`/transactions/${id}`);
      notify("Movimentação excluída.");
      load.reload();
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  return (
    <>
      <PageHeading title={copy.title} subtitle={copy.subtitle}>
        <div className="heading-actions">
          {income && <button type="button" className="outline source-filter-button" onClick={openSourceFilter}>
            <Filter />
            {selectedSourceIds === null ? "Todas as fontes" : `${selectedSourceIds.length} fonte(s)`}
          </button>}
          <NavLink className="primary" to={copy.url}>
            <Plus />
            {copy.new}
          </NavLink>
        </div>
      </PageHeading>
      <section className="small-kpis">
        <MiniKpi
          label="Total no período"
          value={
            filteredTotal
          }
          icon={<CircleDollarSign />}
        />
        <MiniKpi
          label="Recorrente mensal"
          value={recurring}
          icon={<RefreshCw />}
        />
        <MiniKpi
          label="Registros"
          text={String(filteredTransactions.length)}
          icon={<Database />}
        />
      </section>
      <article className="card table-card">
        <CardTitle
          title={`Lista de ${copy.title.toLowerCase()}`}
          subtitle="Filtrada pelo usuário ativo."
        />
        {load.loading ? (
          <Empty text="Carregando..." />
        ) : load.error ? (
          <Empty text={load.error} />
        ) : (
          <TransactionRows data={filteredTransactions} actions onDelete={remove} />
        )}
      </article>
      {sourceFilterOpen && <div className="modal-backdrop" onMouseDown={() => setSourceFilterOpen(false)}>
        <div className="card source-filter-modal" role="dialog" aria-modal="true" aria-labelledby="source-filter-title" onMouseDown={(event) => event.stopPropagation()}>
          <CardTitle title="Filtrar fontes de renda" subtitle="Selecione quais fontes devem aparecer nos ganhos." />
          <div className="source-filter-options">
            {sources.data.map((source) => <label key={source.id}>
              <input type="checkbox" checked={draftSourceIds.includes(source.id)} onChange={() => toggleDraftSource(source.id)} />
              <span>{source.name}</span>
            </label>)}
            <label>
              <input type="checkbox" checked={draftSourceIds.includes("__none")} onChange={() => toggleDraftSource("__none")} />
              <span>Ganhos sem fonte</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="outline" onClick={() => setDraftSourceIds([...sources.data.map((source) => source.id), "__none"])}>Selecionar todas</button>
            <button type="button" className="outline" onClick={() => setSourceFilterOpen(false)}>Cancelar</button>
            <button type="button" className="primary" onClick={applySourceFilter}>Aplicar filtro</button>
          </div>
        </div>
      </div>}
    </>
  );
}
function MiniKpi({
  label,
  value,
  text,
  icon,
}: {
  label: string;
  value?: number;
  text?: string;
  icon: ReactNode;
}) {
  return (
    <article className="card mini-kpi">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{text ?? money.format(value || 0)}</strong>
      </div>
    </article>
  );
}

function TransactionRows({
  data,
  actions,
  onDelete,
}: {
  data: Transaction[];
  actions?: boolean;
  onDelete?: (id: string) => void;
}) {
  const { activeUserId, activeGroupId } = useSession(),
    sources = useLoad<IncomeSource[]>(
      `/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`,
      [],
    ),
    names = new Map(sources.data.map((source) => [source.id, source.name]));
  if (!data.length) return <Empty text="Nenhuma movimentação cadastrada." />;
  return (
    <div className="rows">
      {data.map((item) => (
        <div className="row" key={item.id}>
          <span className={`row-icon ${item.type}`}>
            {item.type === "income" ? <ArrowUpRight /> : <ArrowDownLeft />}
          </span>
          <div>
            <b>{item.description}</b>
            <small>
              {dateBR(item.date)} ·{" "}
              {item.sourceId
                ? names.get(item.sourceId) || "Fonte vinculada"
                : "Sem fonte"}
              {item.recurring ? " · Recorrente" : ""}
            </small>
          </div>
          <strong className={item.type}>
            {item.type === "income" ? "+" : "−"} {money.format(item.value)}
          </strong>
          {actions && (
            <div className="row-actions">
              <NavLink to={`/movimentacoes/${item.id}`} aria-label="Editar">
                <Pencil />
              </NavLink>
              <button onClick={() => onDelete?.(item.id)} aria-label="Excluir">
                <Trash2 />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MovementForm({
  type: initialType,
  notify,
}: {
  type?: "income" | "expense";
  notify: (message: string, error?: boolean) => void;
}) {
  const { id } = useParams(),
    navigate = useNavigate(),
    { users, activeUserId, activeGroupId } = useSession(),
    [loading, setLoading] = useState(Boolean(id)),
    initialPreferences = readPreferences(activeUserId);
  const form = useForm<TransactionInput>({
      resolver: zodResolver(transactionSchema),
      mode: "onChange",
      defaultValues: {
        userId: activeUserId,
        groupId: activeGroupId,
        sourceId: initialPreferences.sourceId,
        date: todayBrasilia(),
        description: "",
        value: 0,
        recurring: initialPreferences.recurring,
        observation: "",
        type: initialType || "expense",
        category: initialPreferences.category,
        paymentMethod: initialPreferences.paymentMethod,
        status: initialPreferences.status,
      },
    }),
    selectedUser = form.watch("userId"),
    sources = useLoad<IncomeSource[]>(
      `/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`,
      [],
    ), clients = useLoad<Client[]>(`/clients?${query({groupId:activeGroupId,userId:activeUserId})}`,[]),
    products = useLoad<Product[]>(`/products?${query({groupId:activeGroupId,userId:activeUserId})}`,[]);
  const quickCatalog=async(kind:"clients"|"products")=>{const name=prompt(`Nome do ${kind==="clients"?"cliente":"produto"}:`)?.trim();if(!name)return;try{const response=await api.post<Client|Product>(`/${kind}`,{userId:activeUserId,groupId:activeGroupId,name});form.setValue(kind==="clients"?"clientId":"productId",response.data.id);if(kind==="clients")clients.reload();else products.reload();notify("Cadastro rápido concluído.")}catch(error){notify(errorMessage(error),true)}};
  useEffect(() => {
    if (id)
      api
        .get<Transaction>(`/transactions/${id}`)
        .then((response) =>
          form.reset({
            ...response.data,
            recurring: Boolean(response.data.recurring),
          }),
        )
        .catch((error) => notify(errorMessage(error), true))
        .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (!id && activeUserId) {
      const preferences = readPreferences(activeUserId);
      form.setValue("userId", activeUserId, { shouldValidate: true });
      form.setValue("groupId", activeGroupId, { shouldValidate: true });
      form.setValue("sourceId", preferences.sourceId);
      form.setValue("recurring", preferences.recurring);
      form.setValue("category", preferences.category);
      form.setValue("paymentMethod", preferences.paymentMethod);
      form.setValue("status", preferences.status);
    }
  }, [activeUserId, activeGroupId, id]);
  useEffect(() => {
    if (id || sources.loading || !selectedUser) return;
    const activeSources = sources.data.filter((source) => source.active);
    const cached = readPreferences(selectedUser);
    const sourceId = activeSources.some((source) => source.id === cached.sourceId)
      ? cached.sourceId
      : activeSources[0]?.id || "";
    if (form.getValues("sourceId") !== sourceId)
      form.setValue("sourceId", sourceId);
  }, [id, selectedUser, sources.loading, sources.data]);
  useEffect(() => {
    if (id) return;
    const subscription = form.watch((values) => {
      if (!values.userId) return;
      savePreferences(values.userId, {
        sourceId: values.sourceId || "",
        recurring: Boolean(values.recurring),
        category: values.category || defaultPreferences.category,
        paymentMethod:
          values.paymentMethod || defaultPreferences.paymentMethod,
        status: values.status || defaultPreferences.status,
      });
    });
    return () => subscription.unsubscribe();
  }, [form, id]);
  const type = form.watch("type"),
    submit = async (values: TransactionInput) => {
      try {
        id
          ? await api.put(`/transactions/${id}`, values)
          : await api.post("/transactions", values);
        notify(id ? "Movimentação atualizada." : "Movimentação cadastrada.");
        navigate(type === "income" ? "/ganhos" : "/despesas");
      } catch (error) {
        notify(errorMessage(error), true);
      }
    };
  return (
    <>
      <PageHeading
        title={
          id
            ? "Editar movimentação"
            : type === "income"
              ? "Registrar ganho"
              : "Registrar despesa"
        }
        subtitle="Vincule o lançamento ao usuário e à fonte de renda."
      />
      <article className="card form-card">
        {loading ? (
          <Empty text="Carregando..." />
        ) : (
          <form onSubmit={form.handleSubmit(submit)}>
            <div className="type-switch">
              <label className={type === "income" ? "active income" : ""}>
                <input type="radio" value="income" {...form.register("type")} />
                Ganho
              </label>
              <label className={type === "expense" ? "active expense" : ""}>
                <input
                  type="radio"
                  value="expense"
                  {...form.register("type")}
                />
                Despesa
              </label>
            </div>
            <div className="form-grid">
              <Field
                label="Título"
                error={form.formState.errors.description?.message}
              >
                <input
                  placeholder="Ex.: Venda de peça 3D"
                  {...form.register("description")}
                />
              </Field>
              <Field label="Valor" error={form.formState.errors.value?.message}>
                <div className="money-input">
                  <span>R$</span>
                  <Controller
                    name="value"
                    control={form.control}
                    render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} />}
                  />
                </div>
              </Field>
              <Field label="Data">
                <input type="date" {...form.register("date")} />
              </Field>
              <Field label="Cliente (opcional)"><div className="select-add"><select {...form.register("clientId")}><option value="">Nenhum</option>{clients.data.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="outline" onClick={()=>quickCatalog("clients")}><Plus/>Rápido</button></div></Field>
              <Field label="Produto (opcional)"><div className="select-add"><select {...form.register("productId")} onChange={event=>{form.setValue("productId",event.target.value);const product=products.data.find(item=>item.id===event.target.value);if(product){form.setValue("description",product.name);form.setValue("value",type==="income"?product.saleValue:product.totalCost)}}}><option value="">Nenhum</option>{products.data.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="outline" onClick={()=>quickCatalog("products")}><Plus/>Rápido</button></div></Field>
              <Field
                label="Usuário"
                error={form.formState.errors.userId?.message}
              >
                <select {...form.register("userId")}>
                  <option value="">Selecione</option>
                  {users
                    .filter((user) => user.active)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Fonte de renda">
                <select {...form.register("sourceId")}>
                  <option value="">Sem fonte específica</option>
                  {sources.data
                    .filter((source) => source.active)
                    .map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                </select>
              </Field>
              <label className="recurring">
                <input type="checkbox" {...form.register("recurring")} />
                <span>
                  <b>Movimentação recorrente</b>
                  <small>Repetir automaticamente todos os meses.</small>
                </span>
              </label>
              <Field label="Descrição (opcional)" wide>
                <textarea rows={4} {...form.register("observation")} />
              </Field>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="outline"
                onClick={() => navigate(-1)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                Salvar movimentação
              </button>
            </div>
          </form>
        )}
      </article>
    </>
  );
}

const orderStatusLabel = {
  queued: "Na fila",
  production: "Em produção",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
} as const;
const orderSourceKey = incomeSourceKey;
type OrderQueueFilter = "all" | "pending" | "ready" | "delivered";
const orderQueueFilters: { value: OrderQueueFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "ready", label: "Prontos" },
  { value: "delivered", label: "Entregues" },
];

function OrderQueue({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { activeUserId, activeGroupId } = useSession(),
    sources = useLoad<IncomeSource[]>(`/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`, []),
    [sourceId, setSourceId] = useState(() => localStorage.getItem(orderSourceKey(activeUserId)) || ""),
    [statusFilter, setStatusFilter] = useState<OrderQueueFilter>("all");
  useEffect(() => {
    const cached = localStorage.getItem(orderSourceKey(activeUserId)) || "";
    const available = sources.data.filter((source) => source.active);
    const next = available.some((source) => source.id === cached) ? cached : available[0]?.id || "";
    setSourceId(next);
    if (next) localStorage.setItem(orderSourceKey(activeUserId), next);
  }, [activeUserId, sources.data]);
  const orders = useLoad<Order[]>(`/orders?${query({ groupId: activeGroupId, userId: activeUserId, sourceId })}`, []),
    changeSource = (value: string) => {
      setSourceId(value);
      localStorage.setItem(orderSourceKey(activeUserId), value);
    },
    updateOrder = async (order: Order, changes: Partial<Pick<Order, "status" | "paid">>) => {
      try {
        await api.put(`/orders/${order.id}`, { ...order, ...changes, paid: changes.status === "delivered" ? true : (changes.paid ?? order.paid) });
        orders.reload();
        notify(changes.status === "delivered" ? "Pedido entregue, pago e ganho lançado." : "Pedido atualizado.");
      } catch (error) { notify(errorMessage(error), true); }
    },
    remove = async (id: string) => {
      if (!confirm("Excluir este pedido?")) return;
      try {
        await api.delete(`/orders/${id}`);
        orders.reload();
        notify("Pedido excluído.");
      } catch (error) { notify(errorMessage(error), true); }
    };
  const sortedOrders = [...orders.data].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const orderNumbers = new Map(sortedOrders.map((order, index) => [order.id, index + 1]));
  const visibleOrders = sortedOrders.filter((order) => statusFilter === "all"
    || (statusFilter === "pending" && (order.status === "queued" || order.status === "production"))
    || order.status === statusFilter);
  const totalOrderValue = orders.data.reduce((total, order) => total + order.value, 0);
  return <>
    <PageHeading title="Fila de produção" subtitle="Acompanhe e atualize os pedidos em andamento.">
      <NavLink className="primary" to="/pedidos/novo"><Plus />Cadastrar pedido</NavLink>
    </PageHeading>
    <article className="card order-filter">
      <Field label="Fonte de renda">
        <select value={sourceId} onChange={(event) => changeSource(event.target.value)}>
          {!sources.data.length && <option value="">Nenhuma fonte cadastrada</option>}
          {sources.data.filter((source) => source.active).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </Field>
      <div className="order-totals">
        <div><small>Total de pedidos</small><strong>{orders.data.length}</strong></div>
        <div><small>Valor total em pedidos</small><strong>{money.format(totalOrderValue)}</strong></div>
      </div>
    </article>
    <div className="order-status-filter" role="navigation" aria-label="Filtrar pedidos por status">
      {orderQueueFilters.map((filter) => <button type="button" key={filter.value} className={statusFilter === filter.value ? "active" : ""} onClick={() => setStatusFilter(filter.value)}>{filter.label}</button>)}
    </div>
    <section className="order-board">
      {visibleOrders.map((order) => <article className="card order-card" key={order.id}>
        <div className="order-card-head">
          <div className="order-card-identification"><span className="order-number">Pedido #{String(orderNumbers.get(order.id) || 0).padStart(3, "0")}</span><span className={`order-status ${order.status}`}>{orderStatusLabel[order.status]}</span></div>
          <strong>{money.format(order.value)}</strong>
        </div>
        <h3>{order.title}</h3>
        <p>{order.customer}</p>
        <small>Prazo: {dateBR(order.dueDate)}</small>
        {order.colorName && <small>Cor: {order.colorName}</small>}
        {order.observation && <small>{order.observation}</small>}
        <label className={`order-paid ${order.paid ? "checked" : ""}`}>
          <input type="checkbox" checked={order.paid} disabled={order.status === "delivered"} onChange={(event) => updateOrder(order, { paid: event.target.checked })} />
          <span>{order.paid ? "Pago" : "Não pago"}</span>
          {order.status === "delivered" && <small>automático ao entregar</small>}
        </label>
        <div className="order-actions">
          <select value={order.status} onChange={(event) => updateOrder(order, { status: event.target.value as Order["status"] })} aria-label="Status do pedido">
            {Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <NavLink className="icon-button" to={`/pedidos/${order.id}`} aria-label="Editar pedido"><Pencil /></NavLink>
          <button className="icon-button danger" onClick={() => remove(order.id)} aria-label="Excluir pedido"><Trash2 /></button>
        </div>
      </article>)}
      {!orders.loading && !visibleOrders.length && <article className="card order-empty"><Empty text={!sourceId ? "Cadastre uma fonte de renda para criar pedidos." : orders.data.length ? "Nenhum pedido encontrado neste filtro." : "Nenhum pedido nesta fila."} /></article>}
    </section>
  </>;
}

function OrderForm({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { id } = useParams(), navigate = useNavigate(), { activeUserId, activeGroupId } = useSession();
  const sources = useLoad<IncomeSource[]>(`/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`, []);
  const [values, setValues] = useState<OrderInput & Pick<Partial<Order>, "lastEditedById" | "lastEditedByName">>({
      userId: activeUserId, groupId: activeGroupId, sourceId: localStorage.getItem(orderSourceKey(activeUserId)) || "",
      colorId: "",
      clientId: "", productId: "", productIds: [], productItems: [],
      title: "", customer: "", dueDate: todayBrasilia(), value: 0,
      status: "queued", paid: false, observation: "",
    });
  const [loading, setLoading] = useState(Boolean(id)),
    [colorSearch, setColorSearch] = useState(""),
    [colorOpen, setColorOpen] = useState(false),
    [colorModal, setColorModal] = useState(false),
    [newColorName, setNewColorName] = useState("");
  const colors = useLoad<Color[]>(`/colors?${query({ groupId: activeGroupId, userId: activeUserId, search: colorSearch })}`, []);
  const clients=useLoad<Client[]>(`/clients?${query({groupId:activeGroupId,userId:activeUserId})}`,[]), products=useLoad<Product[]>(`/products?${query({groupId:activeGroupId,userId:activeUserId})}`,[]);
  const quickCatalog=async(kind:"clients"|"products")=>{const name=prompt(`Nome do ${kind==="clients"?"cliente":"produto"}:`)?.trim();if(!name)return;let saleValue=0;if(kind==="products"){const rawValue=prompt("Valor de venda do produto (R$):","0,00");if(rawValue===null)return;saleValue=Number(rawValue.replace(/\s/g,"").replace(/\./g,"").replace(",","."));if(!Number.isFinite(saleValue)||saleValue<0){notify("Informe um valor de venda válido.",true);return}}try{const response=await api.post<Client|Product>(`/${kind}`,{userId:activeUserId,groupId:activeGroupId,name,...(kind==="products"?{saleValue}:{})});if(kind==="clients"){const item=response.data as Client;set("clientId",item.id);set("customer",item.name);clients.reload()}else{const item=response.data as Product;setValues(current=>syncOrderProducts(current,[...(current.productItems||[]),{productId:item.id,name:item.name,quantity:1,saleValue:item.saleValue}]));products.reload()}notify("Cadastro rápido concluído.")}catch(error){notify(errorMessage(error),true)}};
  useEffect(() => {
    if (id) api.get<Order>(`/orders/${id}`).then(({ data }) => {
      setValues(data);
      setColorSearch(data.colorName || "");
    }).catch((error) => notify(errorMessage(error), true)).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (id || sources.loading) return;
    const cached = localStorage.getItem(orderSourceKey(activeUserId)) || "";
    const active = sources.data.filter((source) => source.active);
    const sourceId = active.some((source) => source.id === cached) ? cached : active[0]?.id || "";
    setValues((current) => ({ ...current, userId: activeUserId, groupId: activeGroupId, sourceId }));
    if (sourceId) localStorage.setItem(orderSourceKey(activeUserId), sourceId);
  }, [id, activeUserId, activeGroupId, sources.loading, sources.data]);
  const set = <K extends keyof OrderInput>(key: K, value: OrderInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const selectedProductItems: OrderProductItem[] = values.productItems?.length ? values.productItems : (values.productIds || (values.productId ? [values.productId] : [])).map((productId, index) => { const product=products.data.find((item)=>item.id===productId); return {productId,name:product?.name||values.productNames?.[index]||"Produto",quantity:1,saleValue:product?.saleValue||0}; });
  const selectedProductIds = selectedProductItems.map((item) => item.productId);
  const syncOrderProducts = (current: typeof values, items: OrderProductItem[]) => ({ ...current, productId: items[0]?.productId || "", productIds: items.map((item) => item.productId), productNames: items.map((item) => item.name), productItems: items, title: items.map((item) => item.name).join(" + ") || current.title, value: items.reduce((total, item) => total + item.saleValue * item.quantity, 0) });
  const addProduct = (productId: string) => { const product=products.data.find((item)=>item.id===productId);if(product&&!selectedProductIds.includes(productId))setValues((current)=>syncOrderProducts(current,[...selectedProductItems,{productId:product.id,name:product.name,quantity:1,saleValue:product.saleValue}])); };
  const removeProduct = (productId: string) => setValues((current)=>syncOrderProducts(current,selectedProductItems.filter((item)=>item.productId!==productId)));
  const updateProductQuantity = (productId: string, quantity: number) => setValues((current)=>syncOrderProducts(current,selectedProductItems.map((item)=>item.productId===productId?{...item,quantity:Math.max(1,quantity||1)}:item)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      id ? await api.put(`/orders/${id}`, values) : await api.post("/orders", values);
      localStorage.setItem(orderSourceKey(activeUserId), values.sourceId);
      notify(id ? "Pedido atualizado." : "Pedido cadastrado.");
      navigate("/pedidos");
    } catch (error) { notify(errorMessage(error), true); }
  };
  const createColor = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await api.post<Color>("/colors", { userId: activeUserId, groupId: activeGroupId, name: newColorName });
      set("colorId", response.data.id);
      setColorSearch(response.data.name);
      setNewColorName("");
      setColorModal(false);
      setColorOpen(false);
      notify("Cor cadastrada e selecionada.");
    } catch (error) { notify(errorMessage(error), true); }
  };
  return <>
    <PageHeading title={id ? "Editar pedido" : "Cadastrar pedido"} subtitle="Inclua o pedido na fila de produção." />
    <article className="card form-card">
      {loading ? <Empty text="Carregando..." /> : <form onSubmit={submit}>
        {id && values.lastEditedByName && <div className="order-audit"><User /><span>Última alteração por <strong>{values.lastEditedByName}</strong></span></div>}
        <div className="form-grid">
          <Field label="Pedido"><input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: 50 peças personalizadas" required /></Field>
          <Field label="Cliente"><div className="select-add"><select value={values.clientId||""} onChange={e=>{set("clientId",e.target.value);const item=clients.data.find(client=>client.id===e.target.value);if(item)set("customer",item.name)}}><option value="">Selecione ou cadastre</option>{clients.data.filter(item=>item.active).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select><button type="button" className="outline" onClick={()=>quickCatalog("clients")}><Plus/>Rápido</button></div><input value={values.customer} onChange={(e) => set("customer", e.target.value)} placeholder="Nome do cliente" required /></Field>
          <Field label="Produtos"><div className="select-add"><select value="" onChange={(event) => addProduct(event.target.value)}><option value="">Adicionar produto</option>{products.data.filter((item) => item.active && !selectedProductIds.includes(item.id)).map((item) => <option value={item.id} key={item.id}>{item.name} · {money.format(item.saleValue)}</option>)}</select><button type="button" className="outline" onClick={()=>quickCatalog("products")}><Plus/>Rápido</button></div>{selectedProductItems.length > 0 && <div className="selected-products">{selectedProductItems.map((item) => <div className="selected-product" key={item.productId}><span>{item.name}</span><label>Qtd.<input type="number" min="1" step="1" value={item.quantity} onChange={(event)=>updateProductQuantity(item.productId,Number(event.target.value))}/></label><strong>{money.format(item.saleValue*item.quantity)}</strong><button type="button" onClick={() => removeProduct(item.productId)} aria-label={`Remover ${item.name}`}><X /></button></div>)}</div>}</Field>
          <Field label="Fonte de renda"><select value={values.sourceId} onChange={(e) => { set("sourceId", e.target.value); localStorage.setItem(orderSourceKey(activeUserId), e.target.value); }} required><option value="">Selecione</option>{sources.data.filter((source) => source.active).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></Field>
          <Field label="Prazo"><input type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} required /></Field>
          <Field label="Cor">
            <div className="color-picker-field">
              <div className="color-search" onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setColorOpen(false);
              }}>
                <input value={colorSearch} onFocus={() => setColorOpen(true)} onChange={(event) => { setColorSearch(event.target.value); set("colorId", ""); setColorOpen(true); }} placeholder="Digite para pesquisar a cor" autoComplete="off" />
                {colorOpen && <div className="color-suggestions">
                  {colors.data.map((color) => <button type="button" key={color.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { set("colorId", color.id); setColorSearch(color.name); setColorOpen(false); }}>{color.name}</button>)}
                  {!colors.loading && !colors.data.length && <small>Nenhuma cor encontrada.</small>}
                </div>}
              </div>
              <button type="button" className="outline color-add" onClick={() => { setNewColorName(colorSearch); setColorModal(true); setColorOpen(false); }}><Plus />Nova cor</button>
            </div>
          </Field>
          <Field label="Valor total (automático)"><div className="money-input automatic-order-value"><span>R$</span><input value={values.value.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} readOnly aria-label="Valor total calculado pelos produtos" /></div></Field>
          <Field label="Status"><select value={values.status} onChange={(e) => { const status=e.target.value as Order["status"]; setValues((current)=>({...current,status,paid:status==="delivered"?true:current.paid})); }}>{Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <label className={`order-paid order-paid-form ${values.paid ? "checked" : ""}`}><input type="checkbox" checked={values.paid} disabled={values.status === "delivered"} onChange={(e)=>set("paid",e.target.checked)} /><span>{values.paid ? "Pedido pago" : "Pedido não pago"}</span>{values.status === "delivered" && <small>Pedidos entregues são pagos automaticamente.</small>}</label>
          <Field label="Observações" wide><textarea rows={4} value={values.observation} onChange={(e) => set("observation", e.target.value)} /></Field>
        </div>
        <div className="form-actions"><button type="button" className="outline" onClick={() => navigate("/pedidos")}>Cancelar</button><button className="primary" disabled={!values.sourceId || !values.title.trim() || !values.customer.trim()}>{id ? "Salvar alterações" : "Cadastrar pedido"}</button></div>
      </form>}
    </article>
    {colorModal && <div className="modal-backdrop" onMouseDown={() => setColorModal(false)}>
      <div className="card color-modal" onMouseDown={(event) => event.stopPropagation()}>
        <CardTitle title="Cadastrar nova cor" subtitle="Informe somente o nome da cor." />
        <form onSubmit={createColor}>
          <Field label="Nome da cor"><input autoFocus value={newColorName} onChange={(event) => setNewColorName(event.target.value)} placeholder="Ex.: Azul royal" required /></Field>
          <div className="form-actions"><button type="button" className="outline" onClick={() => setColorModal(false)}>Cancelar</button><button className="primary" disabled={!newColorName.trim()}>Cadastrar cor</button></div>
        </form>
      </div>
    </div>}
  </>;
}

function CatalogManagement({kind,notify}:{kind:"clients"|"products";notify:(message:string,error?:boolean)=>void}) {
  const {activeUserId,activeGroupId}=useSession(), isClient=kind==="clients";
  const records=useLoad<(Client|Product)[]>(`/${kind}?${query({groupId:activeGroupId,userId:activeUserId})}`,[]);
  const [search,setSearch]=useState("");
  const [editing,setEditing]=useState<Client|Product|null>(null), [name,setName]=useState(""), [place,setPlace]=useState(""), [phone,setPhone]=useState("");
  const [costPerMeter,setCostPerMeter]=useState(0),[filamentMeters,setFilamentMeters]=useState(0),[saleValue,setSaleValue]=useState(0);
  const [imageFile,setImageFile]=useState<File|null>(null),[imageUrl,setImageUrl]=useState(""),[modelFileUrl,setModelFileUrl]=useState("");
  const imagePreviewUrl=useMemo(()=>imageFile?URL.createObjectURL(imageFile):imageUrl,[imageFile,imageUrl]);
  useEffect(()=>()=>{if(imageFile&&imagePreviewUrl)URL.revokeObjectURL(imagePreviewUrl)},[imageFile,imagePreviewUrl]);
  const totalCost=costPerMeter*filamentMeters;
  const clear=()=>{setEditing(null);setName("");setPlace("");setPhone("");setCostPerMeter(0);setFilamentMeters(0);setSaleValue(0);setImageFile(null);setImageUrl("");setModelFileUrl("")};
  const edit=(record:Client|Product)=>{setEditing(record);setName(record.name);setImageFile(null);if("place" in record){setPlace(record.place);setPhone(record.phone)}else{setCostPerMeter(record.costPerMeter);setFilamentMeters(record.filamentMeters);setSaleValue(record.saleValue);setImageUrl(record.imageUrl);setModelFileUrl(record.modelFileUrl)}};
  const uploadProductImage=async()=>{if(!imageFile)return imageUrl;if(imageFile.size>5*1024*1024)throw new Error("A imagem deve ter no máximo 5 MB.");const{data:auth}=await supabase.auth.getUser();if(!auth.user)throw new Error("Faça login novamente para anexar a imagem.");const extension=imageFile.name.split(".").pop()?.toLowerCase()||"jpg";const path=`${auth.user.id}/${crypto.randomUUID()}.${extension}`;const{error}=await supabase.storage.from("product-images").upload(path,imageFile,{contentType:imageFile.type,upsert:false});if(error)throw error;return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl};
  const submit=async(event:FormEvent)=>{event.preventDefault();try{const uploadedImageUrl=isClient?"":await uploadProductImage();const payload=isClient?{userId:activeUserId,groupId:activeGroupId,name,place,phone,active:true}:{userId:activeUserId,groupId:activeGroupId,name,costPerMeter,filamentMeters,saleValue,imageUrl:uploadedImageUrl,modelFileUrl,active:true};editing?await api.put(`/${kind}/${editing.id}`,payload):await api.post(`/${kind}`,payload);notify(`${isClient?"Cliente":"Produto"} ${editing?"atualizado":"cadastrado"}.`);clear();records.reload()}catch(error){notify(errorMessage(error),true)}};
  const remove=async(id:string)=>{if(!confirm("Excluir este cadastro?"))return;try{await api.delete(`/${kind}/${id}`);records.reload();notify("Cadastro excluído.")}catch(error){notify(errorMessage(error),true)}};
  return <><PageHeading title={`Cadastros · ${isClient?"Clientes":"Produtos"}`} subtitle={isClient?"Nome é obrigatório; local e telefone são opcionais.":"O custo total é calculado automaticamente."}/>
    <section className="management-grid"><article className="card form-card"><CardTitle title={editing?"Editar cadastro":"Novo cadastro"} subtitle="Preencha as informações abaixo."/><form onSubmit={submit}><div className="form-grid">
      <Field label="Nome"><input value={name} onChange={e=>setName(e.target.value)} required autoFocus/></Field>
      {isClient?<><Field label="Lugar (opcional)"><input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Cidade, bairro ou endereço"/></Field><Field label="Telefone (opcional)"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(00) 00000-0000"/></Field></>:<>
        <Field label="Custo por metro"><div className="money-input"><span>R$</span><CurrencyInput value={costPerMeter} onChange={setCostPerMeter}/></div></Field>
        <Field label="Metros de filamento"><input type="number" min="0" step="0.01" value={filamentMeters||""} onChange={e=>setFilamentMeters(Number(e.target.value))}/></Field>
        <Field label="Valor de venda"><div className="money-input"><span>R$</span><CurrencyInput value={saleValue} onChange={setSaleValue}/></div></Field>
        <Field label="Custo total (automático)"><input value={money.format(totalCost)} readOnly/></Field>
        <Field label="Imagem do produto" wide><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setImageFile(e.target.files?.[0]||null)}/>{imagePreviewUrl&&<div className="product-image-preview"><img src={imagePreviewUrl} alt="Prévia do produto"/></div>}<small>JPG, PNG, WebP ou GIF, até 5 MB.</small></Field>
        <Field label="Link do arquivo 3MF ou STL (Drive)" wide><input type="url" value={modelFileUrl} onChange={e=>setModelFileUrl(e.target.value)} placeholder="https://drive.google.com/..."/></Field></>}
    </div><div className="form-actions">{editing&&<button type="button" className="outline" onClick={clear}>Cancelar</button>}<button className="primary" disabled={!name.trim()}>Salvar cadastro</button></div></form></article>
    <article className="card"><CardTitle title={isClient?"Clientes cadastrados":"Produtos cadastrados"} subtitle={`${records.data.length} registro(s)`}/><div className="catalog-search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Buscar ${isClient?"cliente":"produto"} por nome...`}/></div><div className="simple-list">{records.data.filter(record=>record.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(record=><div className={`list-row ${"imageUrl" in record?"product-list-row":""}`} key={record.id}>{"imageUrl" in record&&(record.imageUrl?<img className="product-thumbnail" src={record.imageUrl} alt={record.name}/>:<span className="product-thumbnail placeholder"><ImageIcon/></span>)}<div><b>{record.name}</b><small>{"place" in record?[record.place,record.phone].filter(Boolean).join(" · ")||"Somente nome":`Custo ${money.format(record.totalCost)} · Venda ${money.format(record.saleValue)}`}</small>{"modelFileUrl" in record&&record.modelFileUrl&&<a className="model-file-link" href={record.modelFileUrl} target="_blank" rel="noreferrer"><ExternalLink/>Abrir arquivo 3MF/STL</a>}</div><div className="row-actions"><button onClick={()=>edit(record)}><Pencil/></button><button onClick={()=>remove(record.id)}><Trash2/></button></div></div>)}{!records.loading&&!records.data.length&&<Empty text="Nenhum cadastro encontrado."/>}</div></article></section></>;
}

function IncomeSources({
  notify,
}: {
  notify: (message: string, error?: boolean) => void;
}) {
  const { activeUserId, activeUser, activeGroupId } = useSession(),
    load = useLoad<IncomeSource[]>(
      `/income-sources?${query({ groupId: activeGroupId, userId: activeUserId })}`,
      [],
    ),
    companies = useLoad<Company[]>(
      `/companies?${query({ groupId: activeGroupId, userId: activeUserId })}`,
      [],
    ),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [editingSourceId, setEditingSourceId] = useState<string>(),
    [companyName, setCompanyName] = useState(""),
    [editingCompanyId, setEditingCompanyId] = useState<string>();
  const clearSource = () => {
    setEditingSourceId(undefined);
    setName("");
    setDescription("");
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      editingSourceId
        ? await api.put(`/income-sources/${editingSourceId}`, {
            userId: activeUserId,
            groupId: activeGroupId,
            name,
            description,
            active: true,
          })
        : await api.post("/income-sources", {
            userId: activeUserId,
            groupId: activeGroupId,
            name,
            description,
          });
      clearSource();
      load.reload();
      notify(editingSourceId ? "Fonte de renda atualizada." : "Fonte de renda criada.");
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const editSource = (source: IncomeSource) => {
    setEditingSourceId(source.id);
    setName(source.name);
    setDescription(source.description);
  };
  const saveCompany = async (event: FormEvent) => {
    event.preventDefault();
    try {
      editingCompanyId
        ? await api.put(`/companies/${editingCompanyId}`, {
            userId: activeUserId,
            groupId: activeGroupId,
            name: companyName,
            active: true,
          })
        : await api.post("/companies", { userId: activeUserId, groupId: activeGroupId, name: companyName });
      setCompanyName("");
      setEditingCompanyId(undefined);
      companies.reload();
      notify(editingCompanyId ? "Empresa atualizada." : "Empresa cadastrada.");
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const removeCompany = async (id: string) => {
    if (!confirm("Excluir esta empresa?")) return;
    try {
      await api.delete(`/companies/${id}`);
      companies.reload();
      notify("Empresa excluída.");
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir esta fonte de renda?")) return;
    try {
      await api.delete(`/income-sources/${id}`);
      load.reload();
      notify("Fonte de renda excluída.");
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  return (
    <>
      <PageHeading
        title="Fontes de renda"
        subtitle={`Organize os negócios e atividades de ${activeUser?.name || "cada usuário"}.`}
      />
      <div className="settings-grid source-layout">
        <article className="card form-card">
          <CardTitle
            title={editingSourceId ? "Editar fonte" : "Nova fonte"}
            subtitle="Ex.: Impressão 3D, consultoria ou loja."
          />
          <form onSubmit={add}>
            <div className="form-grid one">
              <Field label="Nome">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Impressão 3D"
                  required
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Produtos, serviços e custos relacionados"
                />
              </Field>
            </div>
            <div className="form-actions">
              {editingSourceId && (
                <button type="button" className="outline" onClick={clearSource}>
                  Cancelar
                </button>
              )}
              <button className="primary" disabled={!activeUserId}>
                {editingSourceId ? <Pencil /> : <Plus />}
                {editingSourceId ? "Salvar alterações" : "Criar fonte"}
              </button>
            </div>
          </form>
        </article>
        <article className="card table-card">
          <CardTitle
            title="Fontes cadastradas"
            subtitle={`${load.data.length} fonte(s) do usuário ativo`}
          />
          {load.loading ? (
            <Empty text="Carregando..." />
          ) : (
            <div className="source-list">
              {load.data.map((source) => (
                <div className="source-item" key={source.id}>
                  <span>
                    <BriefcaseBusiness />
                  </span>
                  <div>
                    <b>{source.name}</b>
                    <small>{source.description || "Sem descrição"}</small>
                  </div>
                  <div className="user-actions">
                    <button className="icon-button" onClick={() => editSource(source)} aria-label="Editar fonte">
                      <Pencil />
                    </button>
                    <button className="icon-button danger" onClick={() => remove(source.id)} aria-label="Excluir fonte">
                      <Trash2 />
                    </button>
                  </div>
                </div>
              ))}
              {!load.data.length && (
                <Empty text="Nenhuma fonte de renda cadastrada." />
              )}
            </div>
          )}
        </article>
      </div>
      <div className="settings-grid source-layout company-layout">
        <article className="card form-card">
          <CardTitle
            title={editingCompanyId ? "Editar empresa" : "Nova empresa"}
            subtitle="Cadastre clientes e empresas que pagam mensalidades."
          />
          <form onSubmit={saveCompany}>
            <div className="form-grid one">
              <Field label="Empresa">
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Nome da empresa"
                  required
                />
              </Field>
            </div>
            <div className="form-actions">
              {editingCompanyId && (
                <button type="button" className="outline" onClick={() => { setEditingCompanyId(undefined); setCompanyName(""); }}>
                  Cancelar
                </button>
              )}
              <button className="primary" disabled={!activeUserId}>
                {editingCompanyId ? <Pencil /> : <Plus />}
                {editingCompanyId ? "Salvar alterações" : "Cadastrar empresa"}
              </button>
            </div>
          </form>
        </article>
        <article className="card table-card">
          <CardTitle title="Empresas cadastradas" subtitle={`${companies.data.length} empresa(s) do usuário ativo`} />
          <div className="source-list">
            {companies.data.map((company) => (
              <div className="source-item" key={company.id}>
                <span><Building2 /></span>
                <div><b>{company.name}</b><small>Empresa</small></div>
                <div className="user-actions">
                  <button className="icon-button" onClick={() => { setEditingCompanyId(company.id); setCompanyName(company.name); }} aria-label="Editar empresa"><Pencil /></button>
                  <button className="icon-button danger" onClick={() => removeCompany(company.id)} aria-label="Excluir empresa"><Trash2 /></button>
                </div>
              </div>
            ))}
            {!companies.loading && !companies.data.length && <Empty text="Nenhuma empresa cadastrada." />}
          </div>
        </article>
      </div>
    </>
  );
}

function UserManagement({
  notify,
}: {
  notify: (message: string, error?: boolean) => void;
}) {
  const { users, authenticatedUserId, reloadUsers } = useSession();
  const user = users.find((item) => item.id === authenticatedUserId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
  }, [user]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    try {
      await api.put<AppUser>(`/users/${user.id}`, { name, email });
      await reloadUsers();
      notify("Perfil atualizado.");
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 6) return notify("A nova senha deve ter pelo menos 6 caracteres.", true);
    if (newPassword !== confirmPassword) return notify("A confirmação da nova senha não confere.", true);
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword, current_password: currentPassword });
      if (error) throw error;
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      notify("Senha alterada com sucesso.");
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setChangingPassword(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Meu perfil"
        subtitle="Atualize os dados da sua conta. Cada acesso possui dados isolados."
      />
      <div className="settings-grid profile-grid">
        <article className="card form-card">
          <CardTitle
            title="Dados pessoais"
            subtitle="O e-mail também é usado para entrar no sistema."
          />
          <form onSubmit={save}>
            <div className="form-grid one">
              <Field label="Nome">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <button className="primary" disabled={!user}>
                <Pencil /> Salvar perfil
              </button>
            </div>
          </form>
        </article>
        <article className="card form-card">
          <CardTitle title="Senha" subtitle="Confira a senha digitada ou substitua por uma nova." />
          <form onSubmit={changePassword}>
            <div className="form-grid one">
              <Field label="Senha atual">
                <div className="password-input"><input type={showCurrentPassword?"text":"password"} value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)} autoComplete="current-password" required/><button type="button" onClick={()=>setShowCurrentPassword((visible)=>!visible)} aria-label={showCurrentPassword?"Ocultar senha atual":"Mostrar senha atual"}>{showCurrentPassword?<EyeOff/>:<Eye/>}</button></div>
              </Field>
              <Field label="Nova senha">
                <div className="password-input"><input type={showNewPassword?"text":"password"} value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} required/><button type="button" onClick={()=>setShowNewPassword((visible)=>!visible)} aria-label={showNewPassword?"Ocultar nova senha":"Mostrar nova senha"}>{showNewPassword?<EyeOff/>:<Eye/>}</button></div>
              </Field>
              <Field label="Confirmar nova senha">
                <div className="password-input"><input type={showNewPassword?"text":"password"} value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required/><button type="button" onClick={()=>setShowNewPassword((visible)=>!visible)} aria-label={showNewPassword?"Ocultar confirmação":"Mostrar confirmação"}>{showNewPassword?<EyeOff/>:<Eye/>}</button></div>
              </Field>
            </div>
            <div className="form-actions"><button className="primary" disabled={changingPassword||!currentPassword||!newPassword||!confirmPassword}>{changingPassword?"Alterando...":"Alterar senha"}</button></div>
          </form>
        </article>
      </div>
    </>
  );
}

function GroupManagement({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { groups, activeUserId, activeGroupId, setActiveGroupId, reloadGroups } = useSession();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(false);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true);
    try {
      const response = await api.post<Group>("/groups", { name });
      await reloadGroups(); setActiveGroupId(response.data.id); setName(""); notify("Grupo criado com sucesso.");
    } catch (error) { notify(errorMessage(error), true); } finally { setLoading(false); }
  };
  const join = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true);
    try {
      const response = await api.post<Group>("/groups/join", { code });
      await reloadGroups(); setActiveGroupId(response.data.id); setCode(""); notify("Você entrou no grupo.");
    } catch (error) { notify(errorMessage(error), true); } finally { setLoading(false); }
  };
  const saveGroup = async (group: Group) => {
    const nextName = editingName.trim();
    if (nextName.length < 2) return notify("Informe um nome com pelo menos 2 caracteres.", true);
    setLoading(true);
    try { await api.put(`/groups/${group.id}`, { name: nextName }); await reloadGroups(); setEditingId(""); notify("Grupo atualizado com sucesso."); }
    catch (error) { notify(errorMessage(error), true); } finally { setLoading(false); }
  };
  const deleteGroup = async (group: Group) => {
    if (!window.confirm(`Excluir o grupo “${group.name}” e todos os dados vinculados a ele? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    try {
      await api.delete(`/groups/${group.id}`);
      const remaining = groups.filter((item) => item.id !== group.id);
      if (activeGroupId === group.id && remaining[0]) setActiveGroupId(remaining[0].id);
      await reloadGroups(); notify("Grupo excluído com sucesso.");
    } catch (error) { notify(errorMessage(error), true); } finally { setLoading(false); }
  };
  return <>
    <PageHeading title="Grupos" subtitle="Compartilhe movimentações com outras pessoas usando um código." />
    <div className="settings-grid source-layout">
      <div className="group-forms">
        <article className="card form-card"><CardTitle title="Criar grupo" subtitle="Você será o responsável pelo novo grupo." />
          <form onSubmit={create}><Field label="Nome do grupo"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Família" minLength={2} required /></Field>
            <div className="form-actions"><button className="primary" disabled={loading}><Plus /> Criar grupo</button></div></form>
        </article>
        <article className="card form-card"><CardTitle title="Entrar em um grupo" subtitle="Peça o código a um integrante." />
          <form onSubmit={join}><Field label="Código"><input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="A1B2C3D4" required /></Field>
            <div className="form-actions"><button className="primary" disabled={loading}><LogIn /> Entrar</button></div></form>
        </article>
      </div>
      <article className="card table-card"><CardTitle title="Meus grupos" subtitle={`${groups.length} grupo(s) disponível(is)`} />
        <div className="source-list">{groups.map((group) => <div className={`source-item ${group.id === activeGroupId ? "selected" : ""}`} key={group.id}>
          <span><Users /></span><div>{editingId === group.id ? <input className="group-name-input" value={editingName} onChange={(event) => setEditingName(event.target.value)} minLength={2} autoFocus /> : <b>{group.name}</b>}<small>Código: <strong>{group.code}</strong> · {group.memberCount} membro(s){group.isDefault ? " · Padrão" : ""}</small></div>
          <div className="group-actions">
            <button className="outline" disabled={loading || group.id === activeGroupId} onClick={() => { setActiveGroupId(group.id); notify("Grupo de exibição alterado."); }}>{group.id === activeGroupId ? "Em uso" : "Usar"}</button>
            {group.ownerId === activeUserId && (editingId === group.id ? <><button className="primary icon-button" disabled={loading} title="Salvar grupo" aria-label="Salvar grupo" onClick={() => saveGroup(group)}><CheckCircle2 /></button><button className="outline icon-button" disabled={loading} title="Cancelar edição" aria-label="Cancelar edição" onClick={() => setEditingId("")}><X /></button></> : <><button className="outline icon-button" disabled={loading} title="Editar grupo" aria-label={`Editar ${group.name}`} onClick={() => { setEditingId(group.id); setEditingName(group.name); }}><Pencil /></button><button className="danger icon-button" disabled={loading || group.isDefault} title={group.isDefault ? "O grupo padrão não pode ser excluído" : "Excluir grupo"} aria-label={`Excluir ${group.name}`} onClick={() => deleteGroup(group)}><Trash2 /></button></>)}
          </div>
        </div>)}</div>
      </article>
    </div>
  </>;
}

type SheetsSettings = {
  workbookId: string;
  worksheet: string;
  connected: boolean;
  configured: boolean;
  message?: string;
};
function Configuration({
  notify,
}: {
  notify: (message: string, error?: boolean) => void;
}) {
  const { groups, activeGroupId, setActiveGroupId } = useSession();
  const load = useLoad<SheetsSettings>("/settings/excel", {
      workbookId: "",
      worksheet: "Movimentacoes",
      connected: false,
      configured: false,
    }),
    [testing, setTesting] = useState(false),
    [result, setResult] = useState<"success" | "error">();
  const test = async () => {
    setTesting(true);
    setResult(undefined);
    try {
      await api.post("/sheets/test");
      setResult("success");
      notify("Supabase conectado.");
      load.reload();
    } catch (error) {
      setResult("error");
      notify(errorMessage(error), true);
    } finally {
      setTesting(false);
    }
  };
  const connected =
    result === "success" || (result !== "error" && load.data.connected);
  return (
    <>
      <PageHeading
        title="Configurações"
        subtitle="Verifique a conexão segura com o Supabase."
      />
      <article className="card display-settings">
        <CardTitle title="Exibição geral da aplicação" subtitle="Escolha de qual grupo o aplicativo deve buscar e salvar os dados." />
        <Field label="Grupo em exibição">
          <select value={activeGroupId} onChange={(event) => { setActiveGroupId(event.target.value); notify("Grupo de exibição alterado."); }}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.code})</option>)}
          </select>
        </Field>
      </article>
      <article className="card connection-card">
        <span className={connected ? "connected" : ""}>
          {connected ? <CheckCircle2 /> : <Database />}
        </span>
        <h3>
          {result === "error"
            ? "❌ Erro de conexão"
            : connected
              ? "✅ Conectado"
              : "Aguardando conexão"}
        </h3>
        <p>
          {result === "error"
            ? "Confira a URL, a chave pública e o script do banco."
            : load.data.message ||
              "Autenticação e dados protegidos pelo Supabase."}
        </p>
        <dl>
          <div>
            <dt>Projeto</dt>
            <dd>{load.data.workbookId || "Não configurada"}</dd>
          </div>
          <div>
            <dt>Tabelas</dt>
            <dd>Perfis, movimentações, fontes de renda, empresas, cores e pedidos</dd>
          </div>
          <div>
            <dt>Autenticação</dt>
            <dd>Supabase Auth + Row Level Security</dd>
          </div>
        </dl>
        <div className="form-actions">
          <button
            type="button"
            className="primary"
            onClick={test}
            disabled={testing}
          >
            <RefreshCw />
            {testing ? "Testando..." : "Testar conexão"}
          </button>
        </div>
      </article>
    </>
  );
}

function CurrencyInput({value,onChange}:{value:number;onChange:(value:number)=>void}){
  const display=value>0?new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value):"";
  return <input inputMode="numeric" autoComplete="off" placeholder="0,00" value={display} onChange={(event)=>{const digits=event.target.value.replace(/\D/g,"");onChange(digits?Number(digits)/100:0)}} aria-label="Valor em reais"/>;
}

function PageHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function CardTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-title">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Field({
  label,
  error,
  children,
  wide,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Database />
      <span>{text}</span>
    </div>
  );
}
