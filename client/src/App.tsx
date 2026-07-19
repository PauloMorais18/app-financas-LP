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
  ClipboardList,
  Database,
  Home,
  LogIn,
  LogOut,
  Menu,
  Pencil,
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
  Color,
  IncomeSource,
  Order,
  OrderInput,
  Transaction,
  TransactionInput,
} from "./types";
import { dateBR, money } from "./utils/format";

const transactionSchema = z.object({
  userId: z.string().min(1, "Selecione o usuário"),
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
  users: AppUser[];
  activeUserId: string;
  activeUser?: AppUser;
  setActiveUserId: (id: string) => void;
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
    [error, setError] = useState(""), [message, setMessage] = useState(""), [loading, setLoading] = useState(false), [signup, setSignup] = useState(false);
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
        <Field label="Senha"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></Field>
        <button className="primary login-button" disabled={loading || password.length < 6}>{loading ? "Aguarde..." : signup ? "Criar conta" : "Entrar"}</button>
        <button type="button" className="auth-switch" onClick={() => { setSignup(!signup); setError(""); setMessage(""); }}>{signup ? "Já tenho uma conta" : "Criar uma conta"}</button>
      </form>
    </section>
  </main>;
}

function AuthenticatedApp({ authUser, logout }: { authUser: AuthUser; logout: () => void }) {
  const [toast, setToast] = useState<Toast>(),
    usersLoad = useLoad<AppUser[]>("/users", []),
    [storedUserId, setStoredUserId] = useState(
      () => localStorage.getItem("finanbase-user") || authUser.id,
    ),
    activeUserId = usersLoad.data.some((user) => user.id === storedUserId)
      ? storedUserId
      : usersLoad.data[0]?.id || "";
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
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(undefined), 3200);
  };
  const session = {
    users: usersLoad.data,
    activeUserId,
    activeUser: usersLoad.data.find((user) => user.id === activeUserId),
    setActiveUserId,
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
  const { activeUserId } = useSession(),
    sources = useLoad<IncomeSource[]>(`/income-sources?${query({ userId: activeUserId })}`, []),
    [sourceId, setSourceId] = useState(() => localStorage.getItem(incomeSourceKey(activeUserId)) || ""),
    params = query({ userId: activeUserId, sourceId }),
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
      `/transactions?${query({ userId: activeUserId, sourceId, limit: "5" })}`,
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
  const { activeUserId } = useSession(),
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
    }>(`/transactions?${query({ userId: activeUserId, type, limit: "100" })}`, {
      data: [],
      summary: { totalIncome: 0, totalExpense: 0 },
    }),
    recurring = useMemo(
      () =>
        load.data.data
          .filter((item) => item.recurring)
          .reduce((sum, item) => sum + item.value, 0),
      [load.data.data],
    );
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
        <NavLink className="primary" to={copy.url}>
          <Plus />
          {copy.new}
        </NavLink>
      </PageHeading>
      <section className="small-kpis">
        <MiniKpi
          label="Total no período"
          value={
            income
              ? load.data.summary.totalIncome
              : load.data.summary.totalExpense
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
          text={String(load.data.data.length)}
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
          <TransactionRows data={load.data.data} actions onDelete={remove} />
        )}
      </article>
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
  const { activeUserId } = useSession(),
    sources = useLoad<IncomeSource[]>(
      `/income-sources?${query({ userId: activeUserId })}`,
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
    { users, activeUserId } = useSession(),
    [loading, setLoading] = useState(Boolean(id)),
    initialPreferences = readPreferences(activeUserId);
  const form = useForm<TransactionInput>({
      resolver: zodResolver(transactionSchema),
      mode: "onChange",
      defaultValues: {
        userId: activeUserId,
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
      `/income-sources?${query({ userId: selectedUser || activeUserId })}`,
      [],
    );
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
      form.setValue("sourceId", preferences.sourceId);
      form.setValue("recurring", preferences.recurring);
      form.setValue("category", preferences.category);
      form.setValue("paymentMethod", preferences.paymentMethod);
      form.setValue("status", preferences.status);
    }
  }, [activeUserId, id]);
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

function OrderQueue({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { activeUserId } = useSession(),
    sources = useLoad<IncomeSource[]>(`/income-sources?${query({ userId: activeUserId })}`, []),
    [sourceId, setSourceId] = useState(() => localStorage.getItem(orderSourceKey(activeUserId)) || "");
  useEffect(() => {
    const cached = localStorage.getItem(orderSourceKey(activeUserId)) || "";
    const available = sources.data.filter((source) => source.active);
    const next = available.some((source) => source.id === cached) ? cached : available[0]?.id || "";
    setSourceId(next);
    if (next) localStorage.setItem(orderSourceKey(activeUserId), next);
  }, [activeUserId, sources.data]);
  const orders = useLoad<Order[]>(`/orders?${query({ userId: activeUserId, sourceId })}`, []),
    changeSource = (value: string) => {
      setSourceId(value);
      localStorage.setItem(orderSourceKey(activeUserId), value);
    },
    updateStatus = async (order: Order, status: Order["status"]) => {
      try {
        await api.put(`/orders/${order.id}`, { ...order, status });
        orders.reload();
        notify("Status do pedido atualizado.");
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
      <small>A última fonte selecionada fica salva neste navegador.</small>
    </article>
    <section className="order-board">
      {orders.data.map((order) => <article className="card order-card" key={order.id}>
        <div className="order-card-head">
          <span className={`order-status ${order.status}`}>{orderStatusLabel[order.status]}</span>
          <strong>{money.format(order.value)}</strong>
        </div>
        <h3>{order.title}</h3>
        <p>{order.customer}</p>
        <small>Prazo: {dateBR(order.dueDate)}</small>
        {order.colorName && <small>Cor: {order.colorName}</small>}
        {order.observation && <small>{order.observation}</small>}
        <div className="order-actions">
          <select value={order.status} onChange={(event) => updateStatus(order, event.target.value as Order["status"])} aria-label="Status do pedido">
            {Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <NavLink className="icon-button" to={`/pedidos/${order.id}`} aria-label="Editar pedido"><Pencil /></NavLink>
          <button className="icon-button danger" onClick={() => remove(order.id)} aria-label="Excluir pedido"><Trash2 /></button>
        </div>
      </article>)}
      {!orders.loading && !orders.data.length && <article className="card order-empty"><Empty text={sourceId ? "Nenhum pedido nesta fila." : "Cadastre uma fonte de renda para criar pedidos."} /></article>}
    </section>
  </>;
}

function OrderForm({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { id } = useParams(), navigate = useNavigate(), { activeUserId } = useSession();
  const sources = useLoad<IncomeSource[]>(`/income-sources?${query({ userId: activeUserId })}`, []);
  const [values, setValues] = useState<OrderInput>({
      userId: activeUserId, sourceId: localStorage.getItem(orderSourceKey(activeUserId)) || "",
      colorId: "",
      title: "", customer: "", dueDate: todayBrasilia(), value: 0,
      status: "queued", observation: "",
    });
  const [loading, setLoading] = useState(Boolean(id)),
    [colorSearch, setColorSearch] = useState(""),
    [colorOpen, setColorOpen] = useState(false),
    [colorModal, setColorModal] = useState(false),
    [newColorName, setNewColorName] = useState("");
  const colors = useLoad<Color[]>(`/colors?${query({ userId: activeUserId, search: colorSearch })}`, []);
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
    setValues((current) => ({ ...current, userId: activeUserId, sourceId }));
    if (sourceId) localStorage.setItem(orderSourceKey(activeUserId), sourceId);
  }, [id, activeUserId, sources.loading, sources.data]);
  const set = <K extends keyof OrderInput>(key: K, value: OrderInput[K]) => setValues((current) => ({ ...current, [key]: value }));
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
      const response = await api.post<Color>("/colors", { userId: activeUserId, name: newColorName });
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
        <div className="form-grid">
          <Field label="Pedido"><input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: 50 peças personalizadas" required /></Field>
          <Field label="Cliente"><input value={values.customer} onChange={(e) => set("customer", e.target.value)} placeholder="Nome do cliente" required /></Field>
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
          <Field label="Valor"><div className="money-input"><span>R$</span><CurrencyInput value={values.value} onChange={(value) => set("value", value)} /></div></Field>
          <Field label="Status"><select value={values.status} onChange={(e) => set("status", e.target.value as Order["status"])}>{Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
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

function IncomeSources({
  notify,
}: {
  notify: (message: string, error?: boolean) => void;
}) {
  const { activeUserId, activeUser } = useSession(),
    load = useLoad<IncomeSource[]>(
      `/income-sources?${query({ userId: activeUserId })}`,
      [],
    ),
    companies = useLoad<Company[]>(
      `/companies?${query({ userId: activeUserId })}`,
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
            name,
            description,
            active: true,
          })
        : await api.post("/income-sources", {
            userId: activeUserId,
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
            name: companyName,
            active: true,
          })
        : await api.post("/companies", { userId: activeUserId, name: companyName });
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
  const { users, reloadUsers } = useSession();
  const user = users[0];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      </div>
    </>
  );
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
