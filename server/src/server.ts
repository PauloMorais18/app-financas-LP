import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import { transactionSchema, querySchema } from "./schemas/transaction.js";
import * as store from "./services/sheets.js";
import type { Transaction } from "./types/transaction.js";
const app = express();
const orderSchema = z.object({
  userId: z.string().trim().min(1),
  groupId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  colorId: z.string().trim().default(""),
  title: z.string().trim().min(2).max(120),
  customer: z.string().trim().min(2).max(120),
  dueDate: z.string().date(),
  value: z.coerce.number().min(0),
  status: z.enum(["queued", "production", "ready", "delivered", "cancelled"]),
  observation: z.string().trim().max(500).default(""),
});
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "50kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 200 }));
const safe =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
const sessionCookie = "finanbase_session";
const sessionSecret =
  process.env.SESSION_SECRET ||
  process.env.GOOGLE_PRIVATE_KEY ||
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
  process.env.GOOGLE_SHEET_ID ||
  "finanbase-temporary-session-secret";
type AuthPayload = { userId: string; name: string; exp: number };
const signSession = (payload: AuthPayload) => {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(data).digest("base64url");
  return `${data}.${signature}`;
};
const readSession = (req: express.Request): AuthPayload | undefined => {
  try {
    const cookies = Object.fromEntries(
      String(req.headers.cookie || "").split(";").map((part) => {
        const [name, ...value] = part.trim().split("=");
        return [name, value.join("=")];
      }),
    );
    const [data, signature] = String(cookies[sessionCookie] || "").split(".");
    if (!data || !signature) return;
    const expected = createHmac("sha256", sessionSecret).update(data).digest();
    const received = Buffer.from(signature, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as AuthPayload;
    if (!payload.userId || payload.exp <= Date.now()) return;
    return payload;
  } catch { return; }
};
const cookieOptions = `HttpOnly; Path=/; SameSite=Strict; Max-Age=${60 * 60 * 12}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true });
app.get("/api/health", (_q, r) =>
  r.json({
    status: "ok",
    timestamp: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date()).replace(" ", "T"),
    timezone: "America/Sao_Paulo",
  }),
);
app.post(
  "/api/auth/login",
  loginLimiter,
  safe(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    const user = (await store.listUsers()).find(
      (item) => item.active && item.name.localeCompare(name, "pt-BR", { sensitivity: "accent" }) === 0,
    );
    if (!user || password !== "1")
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    const payload: AuthPayload = { userId: user.id, name: user.name, exp: Date.now() + 12 * 60 * 60_000 };
    res.setHeader("Set-Cookie", `${sessionCookie}=${signSession(payload)}; ${cookieOptions}`);
    res.json({ user: { id: user.id, name: user.name } });
  }),
);
app.get("/api/auth/session", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ message: "Sessão não autenticada." });
  res.json({ user: { id: session.userId, name: session.name } });
});
app.post("/api/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.status(204).end();
});
app.use("/api", (req, res, next) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ message: "Faça login para continuar." });
  res.locals.auth = session;
  next();
});
app.get("/api/groups", safe(async (_req, res) => {
  const auth = res.locals.auth as AuthPayload;
  res.json(await store.listGroups(auth.userId, auth.name));
}));
app.post("/api/groups", safe(async (req, res) => {
  const auth = res.locals.auth as AuthPayload;
  const name = String(req.body?.name || "").trim();
  if (name.length < 2) return res.status(400).json({ message: "Informe o nome do grupo." });
  res.status(201).json(await store.createGroup(auth.userId, name));
}));
app.post("/api/groups/join", safe(async (req, res) => {
  const auth = res.locals.auth as AuthPayload;
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ message: "Informe o código do grupo." });
  res.json(await store.joinGroup(auth.userId, code));
}));
app.use("/api", safe(async (req, res, next) => {
  const groupId = String(req.body?.groupId || req.query.groupId || "");
  if (!groupId) return next();
  const auth = res.locals.auth as AuthPayload;
  if (!(await store.isGroupMember(auth.userId, groupId))) return res.status(403).json({ message: "Você não participa deste grupo." });
  next();
}));
app.get(
  "/api/settings/excel",
  safe(async (_q, r) => r.json(await store.publicSettings())),
);
app.post(
  "/api/settings/excel/test",
  safe(async (_q, r) => r.json(await store.testConnection())),
);
app.put(
  "/api/users/:id",
  safe(async (req, res) => {
    const input = req.body as {
      name?: string;
      email?: string;
      active?: boolean;
    };
    if (!input.name?.trim())
      return res.status(400).json({ message: "Informe o nome do usuário." });
    res.json(
      await store.updateUser(String(req.params.id), {
        name: input.name.trim(),
        email: String(input.email || "").trim(),
        active: input.active,
      }),
    );
  }),
);
app.get(
  "/api/users",
  safe(async (_req, res) => res.json(await store.listUsers())),
);
app.post(
  "/api/users",
  safe(async (req, res) => {
    const input = req.body as { name?: string; email?: string };
    if (!input.name?.trim())
      return res.status(400).json({ message: "Informe o nome do usuário." });
    res
      .status(201)
      .json(
        await store.createUser({
          name: input.name.trim(),
          email: String(input.email || "").trim(),
        }),
      );
  }),
);
app.delete(
  "/api/users/:id",
  safe(async (req, res) => {
    const id = String(req.params.id);
    const hasSources = (await store.listSources()).some((item) => item.userId === id);
    const hasCompanies = (await store.listCompanies()).some((item) => item.userId === id);
    const hasTransactions = (await store.list()).some((item) => item.userId === id);
    const hasOrders = (await store.listOrders()).some((item) => item.userId === id);
    if (hasSources || hasCompanies || hasTransactions || hasOrders)
      return res.status(409).json({
        message: "Este usuário possui fontes ou movimentações e não pode ser excluído.",
      });
    await store.removeUser(id);
    res.status(204).end();
  }),
);
app.get(
  "/api/income-sources",
  safe(async (req, res) => {
    const userId = String(req.query.userId || "");
    const groupId = String(req.query.groupId || "");
    const data = (await store.listSources()).filter(
      (source) => (!userId || source.userId === userId) && (!groupId || source.groupId === groupId),
    );
    res.json(data);
  }),
);
app.post(
  "/api/income-sources",
  safe(async (req, res) => {
    const input = req.body as {
      userId?: string;
      groupId?: string;
      name?: string;
      description?: string;
    };
    if (!input.userId || !input.name?.trim())
      return res
        .status(400)
        .json({ message: "Informe o usuário e o nome da fonte de renda." });
    if (!(await store.listUsers()).some((user) => user.id === input.userId))
      return res.status(400).json({ message: "Usuário não encontrado." });
    res
      .status(201)
      .json(
        await store.createSource({
          userId: input.userId,
          groupId: input.groupId,
          name: input.name.trim(),
          description: String(input.description || "").trim(),
        }),
      );
  }),
);
app.put(
  "/api/income-sources/:id",
  safe(async (req, res) => {
    const input = req.body as {
      userId?: string;
      groupId?: string;
      name?: string;
      description?: string;
      active?: boolean;
    };
    if (!input.userId || !input.name?.trim())
      return res.status(400).json({ message: "Informe o usuário e o nome da fonte de renda." });
    if (!(await store.listUsers()).some((user) => user.id === input.userId))
      return res.status(400).json({ message: "Usuário não encontrado." });
    res.json(await store.updateSource(String(req.params.id), {
      userId: input.userId,
      groupId: input.groupId,
      name: input.name.trim(),
      description: String(input.description || "").trim(),
      active: input.active ?? true,
    }));
  }),
);
app.delete(
  "/api/income-sources/:id",
  safe(async (req, res) => {
    const used = (await store.list()).some(
      (item) => item.sourceId === String(req.params.id),
    );
    const usedByOrder = (await store.listOrders()).some(
      (item) => item.sourceId === String(req.params.id),
    );
    if (used || usedByOrder)
      return res
        .status(409)
        .json({
          message: "Esta fonte possui movimentações e não pode ser excluída.",
        });
    await store.removeSource(String(req.params.id));
    res.status(204).end();
  }),
);
app.get(
  "/api/companies",
  safe(async (req, res) => {
    const userId = String(req.query.userId || "");
    const groupId = String(req.query.groupId || "");
    const data = (await store.listCompanies()).filter(
      (company) => (!userId || company.userId === userId) && (!groupId || company.groupId === groupId),
    );
    res.json(data);
  }),
);
app.post(
  "/api/companies",
  safe(async (req, res) => {
    const input = req.body as { userId?: string; groupId?: string; name?: string };
    if (!input.userId || !input.name?.trim())
      return res.status(400).json({ message: "Informe o usuário e o nome da empresa." });
    if (!(await store.listUsers()).some((user) => user.id === input.userId))
      return res.status(400).json({ message: "Usuário não encontrado." });
    res.status(201).json(await store.createCompany({
      userId: input.userId,
      groupId: input.groupId,
      name: input.name.trim(),
    }));
  }),
);
app.put(
  "/api/companies/:id",
  safe(async (req, res) => {
    const input = req.body as { userId?: string; name?: string; active?: boolean };
    if (!input.userId || !input.name?.trim())
      return res.status(400).json({ message: "Informe o usuário e o nome da empresa." });
    res.json(await store.updateCompany(String(req.params.id), {
      userId: input.userId,
      name: input.name.trim(),
      active: input.active ?? true,
    }));
  }),
);
app.delete(
  "/api/companies/:id",
  safe(async (req, res) => {
    const id = String(req.params.id);
    if ((await store.list()).some((item) => item.companyId === id))
      return res.status(409).json({
        message: "Esta empresa possui movimentações e não pode ser excluída.",
      });
    await store.removeCompany(id);
    res.status(204).end();
  }),
);
const normalizedText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
app.get(
  "/api/colors",
  safe(async (req, res) => {
    const userId = String(req.query.userId || "");
    const groupId = String(req.query.groupId || "");
    const search = normalizedText(String(req.query.search || "").trim());
    const data = (await store.listColors())
      .filter((color) =>
        (!userId || color.userId === userId) && (!groupId || color.groupId === groupId) &&
        (!search || normalizedText(color.name).includes(search)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 5);
    res.json(data);
  }),
);
app.post(
  "/api/colors",
  safe(async (req, res) => {
    const input = req.body as { userId?: string; groupId?: string; name?: string };
    if (!input.userId || !input.name?.trim())
      return res.status(400).json({ message: "Informe o usuário e o nome da cor." });
    if (!(await store.listUsers()).some((user) => user.id === input.userId))
      return res.status(400).json({ message: "Usuário não encontrado." });
    const duplicate = (await store.listColors()).some(
      (color) => color.userId === input.userId && normalizedText(color.name) === normalizedText(input.name!.trim()),
    );
    if (duplicate) return res.status(409).json({ message: "Esta cor já está cadastrada." });
    res.status(201).json(await store.createColor({ userId: input.userId, groupId: input.groupId, name: input.name.trim() }));
  }),
);
app.get(
  "/api/colors/:id",
  safe(async (req, res) => {
    const color = (await store.listColors()).find((item) => item.id === String(req.params.id));
    if (!color) return res.status(404).json({ message: "Cor não encontrada." });
    res.json(color);
  }),
);
app.delete(
  "/api/colors/:id",
  safe(async (req, res) => {
    const id = String(req.params.id);
    if ((await store.listOrders()).some((order) => order.colorId === id))
      return res.status(409).json({ message: "Esta cor está vinculada a pedidos e não pode ser excluída." });
    await store.removeColor(id);
    res.status(204).end();
  }),
);
app.get(
  "/api/orders",
  safe(async (req, res) => {
    const userId = String(req.query.userId || "");
    const groupId = String(req.query.groupId || "");
    const sourceId = String(req.query.sourceId || "");
    const status = String(req.query.status || "");
    const data = (await store.listOrders())
      .filter((order) =>
        (!userId || order.userId === userId) && (!groupId || order.groupId === groupId) &&
        (!sourceId || order.sourceId === sourceId) &&
        (!status || order.status === status),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const colors = new Map((await store.listColors()).map((color) => [color.id, color.name]));
    res.json(data.map((order) => ({ ...order, colorName: colors.get(order.colorId) || "" })));
  }),
);
app.get(
  "/api/orders/:id",
  safe(async (req, res) => {
    const order = (await store.listOrders()).find((item) => item.id === String(req.params.id));
    if (!order) return res.status(404).json({ message: "Pedido não encontrado." });
    const color = order.colorId
      ? (await store.listColors()).find((item) => item.id === order.colorId)
      : undefined;
    res.json({ ...order, colorName: color?.name || "" });
  }),
);
const validateOrderRelations = async (input: z.infer<typeof orderSchema>) => {
  if (!(await store.listUsers()).some((user) => user.id === input.userId))
    throw Object.assign(new Error("Usuário não encontrado."), { status: 400 });
  const source = (await store.listSources()).find((item) => item.id === input.sourceId);
  if (!source || source.userId !== input.userId)
    throw Object.assign(new Error("Fonte de renda inválida para o usuário informado."), { status: 400 });
  if (input.colorId) {
    const color = (await store.listColors()).find((item) => item.id === input.colorId);
    if (!color || color.userId !== input.userId)
      throw Object.assign(new Error("Cor inválida para o usuário informado."), { status: 400 });
  }
};
app.post(
  "/api/orders",
  safe(async (req, res) => {
    const input = orderSchema.parse(req.body);
    await validateOrderRelations(input);
    res.status(201).json(await store.createOrder(input));
  }),
);
app.put(
  "/api/orders/:id",
  safe(async (req, res) => {
    const input = orderSchema.parse(req.body);
    await validateOrderRelations(input);
    res.json(await store.updateOrder(String(req.params.id), input));
  }),
);
app.delete(
  "/api/orders/:id",
  safe(async (req, res) => {
    await store.removeOrder(String(req.params.id));
    res.status(204).end();
  }),
);
app.get(
  "/api/transactions",
  safe(async (req, res) => {
    const q = querySchema.parse(req.query);
    let data = await store.list();
    data = data.filter(
      (t) =>
        (!q.search ||
          t.description.toLowerCase().includes(q.search.toLowerCase())) &&
        (!q.userId || t.userId === q.userId) &&
        (!q.groupId || t.groupId === q.groupId) &&
        (!q.sourceId || t.sourceId === q.sourceId) &&
        (!q.type || t.type === q.type) &&
        (!q.category || t.category === q.category) &&
        (!q.paymentMethod || t.paymentMethod === q.paymentMethod) &&
        (!q.status || t.status === q.status) &&
        (!q.startDate || t.date >= q.startDate) &&
        (!q.endDate || t.date <= q.endDate) &&
        (q.minValue === undefined || t.value >= q.minValue) &&
        (q.maxValue === undefined || t.value <= q.maxValue),
    );
    data.sort((a, b) => {
      const x = a[q.sortBy],
        y = b[q.sortBy];
      return (x < y ? -1 : x > y ? 1 : 0) * (q.sortOrder === "asc" ? 1 : -1);
    });
    const total = data.length,
      summary = data.reduce(
        (s, t) => {
          if (t.status !== "cancelled") {
            s.totalValue += t.type === "income" ? t.value : -t.value;
            if (t.type === "income") s.totalIncome += t.value;
            else s.totalExpense += t.value;
          }
          return s;
        },
        { totalValue: 0, totalIncome: 0, totalExpense: 0 },
      );
    res.json({
      data: data.slice((q.page - 1) * q.limit, q.page * q.limit),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
      summary,
    });
  }),
);
app.get(
  "/api/transactions/:id",
  safe(async (req, res) => {
    const target = String(req.params.id);
    const t = (await store.list()).find((x) => x.id === target);
    if (!t)
      return res.status(404).json({ message: "Movimentação não encontrada." });
    res.json(t);
  }),
);
app.post(
  "/api/transactions",
  safe(async (req, res) => {
    const input = transactionSchema.parse(req.body);
    if (!(await store.listUsers()).some((user) => user.id === input.userId))
      return res.status(400).json({ message: "Usuário não encontrado." });
    if (input.sourceId) {
      const source = (await store.listSources()).find((item) => item.id === input.sourceId);
      if (!source || source.userId !== input.userId)
        return res.status(400).json({ message: "Fonte de renda inválida para o usuário informado." });
    }
    if (input.companyId) {
      const company = (await store.listCompanies()).find((item) => item.id === input.companyId);
      if (!company || company.userId !== input.userId)
        return res.status(400).json({ message: "Empresa inválida para o usuário informado." });
    }
    res.status(201).json(await store.create(input));
  }),
);
app.put(
  "/api/transactions/:id",
  safe(async (req, res) => {
    const input = transactionSchema.parse(req.body);
    if (!(await store.listUsers()).some((user) => user.id === input.userId))
      return res.status(400).json({ message: "Usuário não encontrado." });
    if (input.sourceId) {
      const source = (await store.listSources()).find((item) => item.id === input.sourceId);
      if (!source || source.userId !== input.userId)
        return res.status(400).json({ message: "Fonte de renda inválida para o usuário informado." });
    }
    if (input.companyId) {
      const company = (await store.listCompanies()).find((item) => item.id === input.companyId);
      if (!company || company.userId !== input.userId)
        return res.status(400).json({ message: "Empresa inválida para o usuário informado." });
    }
    res.json(await store.update(String(req.params.id), input));
  }),
);
app.delete(
  "/api/transactions/:id",
  safe(async (req, res) => {
    await store.remove(String(req.params.id));
    res.status(204).end();
  }),
);
const recurringProjection = (items: Transaction[]) => {
  const nowParts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date()),
    currentYear = Number(nowParts.find((item) => item.type === "year")?.value),
    currentMonth = Number(nowParts.find((item) => item.type === "month")?.value) - 1,
    current = currentYear * 12 + currentMonth;
  return items.flatMap((t) => {
    if (!t.recurring) return [t];
    const [startYear, startMonth, startDay] = t.date.split("-").map(Number),
      first = startYear * 12 + startMonth - 1,
      copies: Transaction[] = [];
    for (let month = first; month <= current; month++) {
      const year = Math.floor(month / 12),
        index = month % 12,
        day = Math.min(
          startDay,
          new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
        );
      copies.push({
        ...t,
        id: `${t.id}:${year}-${index + 1}`,
        date: `${year}-${String(index + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      });
    }
    return copies;
  });
};
const dashboard = async (userId = "", sourceId = "", groupId = "") => {
  const source = (await store.list()).filter(
      (item) =>
        (!userId || item.userId === userId) &&
        (!groupId || item.groupId === groupId) &&
        (!sourceId || item.sourceId === sourceId),
    ),
    all = recurringProjection(source),
    active = all.filter((t) => t.status !== "cancelled"),
    paid = active.filter((t) => t.status === "paid"),
    income = paid.filter((t) => t.type === "income"),
    expense = paid.filter((t) => t.type === "expense");
  return {
    all,
    summary: {
      balance:
        income.reduce((s, t) => s + t.value, 0) -
        expense.reduce((s, t) => s + t.value, 0),
      income: income.reduce((s, t) => s + t.value, 0),
      expense: expense.reduce((s, t) => s + t.value, 0),
      pending: active
        .filter((t) => t.status === "pending")
        .reduce((s, t) => s + t.value, 0),
      count: source.length,
      averageExpense:
        expense.reduce((s, t) => s + t.value, 0) / (expense.length || 1),
      largestIncome: Math.max(0, ...income.map((t) => t.value)),
      largestExpense: Math.max(0, ...expense.map((t) => t.value)),
    },
  };
};
app.get(
  "/api/dashboard/summary",
  safe(async (q, r) =>
    r.json(
      (
        await dashboard(
          String(q.query.userId || ""),
          String(q.query.sourceId || ""),
          String(q.query.groupId || ""),
        )
      ).summary,
    ),
  ),
);
app.get(
  "/api/dashboard/charts",
  safe(async (q, r) => {
    const { all } = await dashboard(
      String(q.query.userId || ""),
      String(q.query.sourceId || ""),
      String(q.query.groupId || ""),
    );
    const valid = all.filter((t) => t.status !== "cancelled");
    const group = (key: (t: Transaction) => string) =>
      Object.values(
        valid.reduce<
          Record<string, { name: string; income: number; expense: number }>
        >((a, t) => {
          const n = key(t);
          a[n] ??= { name: n, income: 0, expense: 0 };
          a[n][t.type] += t.value;
          return a;
        }, {}),
      );
    let balance = 0;
    const evolution = [...valid]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({
        date: t.date,
        balance: (balance += t.type === "income" ? t.value : -t.value),
      }));
    r.json({
      monthly: group((t) => t.date.slice(0, 7)),
      categories: group((t) => t.category),
      payments: group((t) => t.paymentMethod),
      evolution,
      distribution: [
        {
          name: "Receitas",
          value: valid
            .filter((t) => t.type === "income")
            .reduce((s, t) => s + t.value, 0),
        },
        {
          name: "Despesas",
          value: valid
            .filter((t) => t.type === "expense")
            .reduce((s, t) => s + t.value, 0),
        },
      ],
    });
  }),
);
app.get(
  "/api/sheets/status",
  safe(async (_q, r) => r.json(await store.status())),
);
app.get(
  "/api/sheets/all",
  safe(async (_q, r) => r.json(await store.readAllSheets())),
);
app.post(
  "/api/sheets/test",
  safe(async (_q, r) => r.json(await store.testConnection())),
);
app.post(
  "/api/sheets/sync",
  safe(async (_q, r) => {
    await store.list();
    r.json(await store.status());
  }),
);
app.use(
  (
    err: unknown,
    _q: express.Request,
    res: express.Response,
    _n: express.NextFunction,
  ) => {
    console.error(err);
    if (err instanceof ZodError)
      return res
        .status(400)
        .json({
          message: "Dados inválidos.",
          issues: err.flatten().fieldErrors,
        });
    const e = err as Error & { status?: number };
    res
      .status(e.status || 500)
      .json({ message: e.message || "Não foi possível concluir a operação." });
  },
);
void store
  .initialize()
  .then((result) =>
    console.log(
      result.connected
        ? "Google Sheets conectado automaticamente."
        : "Google Sheets em modo demonstração.",
    ),
  )
  .catch((error) =>
    console.error(
      "Falha na conexão inicial com o Google Sheets:",
      (error as Error).message,
    ),
  );
export default app;
