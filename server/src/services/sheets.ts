import { randomUUID } from "node:crypto";
import type { Transaction } from "../types/transaction.js";
import { demoTransactions } from "../data/demo.js";
import {
  googleSheetsService,
  type SheetRecord,
} from "./GoogleSheetsService.js";

export interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Group {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  isDefault: boolean;
  memberCount: number;
  createdAt: string;
}
export interface IncomeSource {
  id: string;
  userId: string;
  groupId?: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Company {
  id: string;
  userId: string;
  groupId?: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export type OrderStatus = "queued" | "production" | "ready" | "delivered" | "cancelled";
export interface Order {
  id: string;
  userId: string;
  groupId?: string;
  sourceId: string;
  colorId: string;
  title: string;
  customer: string;
  dueDate: string;
  value: number;
  status: OrderStatus;
  observation: string;
  createdAt: string;
  updatedAt: string;
}
export interface Color {
  id: string;
  userId: string;
  groupId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
type UserRow = {
  id: unknown;
  nome: unknown;
  email: unknown;
  ativo: unknown;
  criado_em: unknown;
  atualizado_em: unknown;
} & SheetRecord;
type GroupRow = { id: unknown; nome: unknown; codigo: unknown; proprietario_id: unknown; padrao: unknown; criado_em: unknown } & SheetRecord;
type GroupMemberRow = { id: unknown; grupo_id: unknown; usuario_id: unknown; criado_em: unknown } & SheetRecord;
type SourceRow = {
  id: unknown;
  usuario_id: unknown;
  grupo_id?: unknown;
  nome: unknown;
  descricao: unknown;
  ativo: unknown;
  criado_em: unknown;
  atualizado_em: unknown;
} & SheetRecord;
type CompanyRow = {
  id: unknown;
  usuario_id: unknown;
  grupo_id?: unknown;
  nome: unknown;
  ativo: unknown;
  criado_em: unknown;
  atualizado_em: unknown;
} & SheetRecord;
type OrderRow = {
  id: unknown;
  usuario_id: unknown;
  grupo_id?: unknown;
  fonte_renda_id: unknown;
  cor_id: unknown;
  titulo: unknown;
  cliente: unknown;
  prazo: unknown;
  valor: unknown;
  status: unknown;
  observacao: unknown;
  criado_em: unknown;
  atualizado_em: unknown;
} & SheetRecord;
type ColorRow = {
  id: unknown;
  usuario_id: unknown;
  grupo_id?: unknown;
  nome: unknown;
  criado_em: unknown;
  atualizado_em: unknown;
} & SheetRecord;
type TransactionRow = {
  id: unknown;
  usuario_id: unknown;
  grupo_id?: unknown;
  data: unknown;
  descricao: unknown;
  categoria: unknown;
  tipo: unknown;
  valor: unknown;
  forma_pagamento: unknown;
  status: unknown;
  observacao: unknown;
  recorrente: unknown;
  criado_em: unknown;
  atualizado_em: unknown;
  fonte_renda_id?: unknown;
  empresa_id?: unknown;
} & SheetRecord;
let demo = [...demoTransactions];
let demoUsers: User[] = [
  {
    id: "usr_001",
    name: "Paulo",
    email: "paulo@email.com",
    active: true,
    createdAt: today(),
    updatedAt: today(),
  },
  {
    id: "usr_002",
    name: "Laura",
    email: "laura@email.com",
    active: true,
    createdAt: today(),
    updatedAt: today(),
  },
];
let demoSources: IncomeSource[] = [
  {
    id: "src_001",
    userId: "usr_001",
    name: "Renda principal",
    description: "Fonte de renda padrão",
    active: true,
    createdAt: today(),
    updatedAt: today(),
  },
];
let demoCompanies: Company[] = [];
let demoOrders: Order[] = [];
let demoColors: Color[] = [];
let demoGroups: Group[] = [];
let demoGroupMembers: { groupId: string; userId: string }[] = [];
const groupCode = () => randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
export async function ensureDefaultGroup(userId: string, userName: string) {
  const groups = googleSheetsService.isConfigured()
    ? (await googleSheetsService.listRecords<GroupRow>("Grupos")).map((row) => ({ id: String(row.id), name: String(row.nome), code: String(row.codigo), ownerId: String(row.proprietario_id), isDefault: bool(row.padrao), memberCount: 1, createdAt: sheetDate(row.criado_em) }))
    : demoGroups;
  let group = groups.find((item) => item.ownerId === userId && item.isDefault);
  if (!group) {
    group = { id: `grp_${randomUUID()}`, name: `Grupo de ${userName}`, code: groupCode(), ownerId: userId, isDefault: true, memberCount: 1, createdAt: today() };
    if (googleSheetsService.isConfigured()) {
      await googleSheetsService.addRecord("Grupos", { id: group.id, nome: group.name, codigo: group.code, proprietario_id: userId, padrao: true, criado_em: group.createdAt });
      await googleSheetsService.addRecord("MembrosGrupos", { id: `mem_${randomUUID()}`, grupo_id: group.id, usuario_id: userId, criado_em: today() });
    } else { demoGroups.push(group); demoGroupMembers.push({ groupId: group.id, userId }); }
  }
  return group;
}
export async function listGroups(userId: string, userName = "Usuário") {
  const defaultGroup = await ensureDefaultGroup(userId, userName);
  await backfillDefaultGroup(userId, defaultGroup.id);
  if (googleSheetsService.isConfigured()) {
    const groups = (await googleSheetsService.listRecords<GroupRow>("Grupos")).map((row) => ({ id: String(row.id), name: String(row.nome), code: String(row.codigo), ownerId: String(row.proprietario_id), isDefault: bool(row.padrao), memberCount: 0, createdAt: sheetDate(row.criado_em) }));
    const members = await googleSheetsService.listRecords<GroupMemberRow>("MembrosGrupos");
    return groups.filter((group) => members.some((member) => String(member.grupo_id) === group.id && String(member.usuario_id) === userId)).map((group) => ({ ...group, memberCount: members.filter((member) => String(member.grupo_id) === group.id).length }));
  }
  return demoGroups.filter((group) => demoGroupMembers.some((member) => member.groupId === group.id && member.userId === userId))
    .map((group) => ({ ...group, memberCount: demoGroupMembers.filter((member) => member.groupId === group.id).length }));
}
export async function createGroup(userId: string, name: string) {
  const group: Group = { id: `grp_${randomUUID()}`, name, code: groupCode(), ownerId: userId, isDefault: false, memberCount: 1, createdAt: today() };
  if (googleSheetsService.isConfigured()) {
    await googleSheetsService.addRecord("Grupos", { id: group.id, nome: name, codigo: group.code, proprietario_id: userId, padrao: false, criado_em: group.createdAt });
    await googleSheetsService.addRecord("MembrosGrupos", { id: `mem_${randomUUID()}`, grupo_id: group.id, usuario_id: userId, criado_em: today() });
  } else { demoGroups.push(group); demoGroupMembers.push({ groupId: group.id, userId }); }
  return group;
}
export async function joinGroup(userId: string, code: string) {
  if (googleSheetsService.isConfigured()) {
    const group = (await googleSheetsService.listRecords<GroupRow>("Grupos")).find((item) => String(item.codigo).toUpperCase() === code.trim().toUpperCase());
    if (!group) throw Object.assign(new Error("Código de grupo não encontrado."), { status: 404 });
    const members = await googleSheetsService.listRecords<GroupMemberRow>("MembrosGrupos");
    if (!members.some((item) => String(item.grupo_id) === String(group.id) && String(item.usuario_id) === userId)) await googleSheetsService.addRecord("MembrosGrupos", { id: `mem_${randomUUID()}`, grupo_id: group.id, usuario_id: userId, criado_em: today() });
    return { id: String(group.id), name: String(group.nome), code: String(group.codigo), ownerId: String(group.proprietario_id), isDefault: bool(group.padrao), memberCount: members.filter((item) => String(item.grupo_id) === String(group.id)).length + 1, createdAt: sheetDate(group.criado_em) };
  }
  const group = demoGroups.find((item) => item.code === code.trim().toUpperCase());
  if (!group) throw Object.assign(new Error("Código de grupo não encontrado."), { status: 404 });
  if (!demoGroupMembers.some((item) => item.groupId === group.id && item.userId === userId)) demoGroupMembers.push({ groupId: group.id, userId });
  return { ...group, memberCount: demoGroupMembers.filter((item) => item.groupId === group.id).length };
}
export async function isGroupMember(userId: string, groupId: string) {
  if (googleSheetsService.isConfigured()) return (await googleSheetsService.listRecords<GroupMemberRow>("MembrosGrupos")).some((item) => String(item.usuario_id) === userId && String(item.grupo_id) === groupId);
  return demoGroupMembers.some((item) => item.userId === userId && item.groupId === groupId);
}
function today() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const bool = (value: unknown) =>
  value === true || String(value).toLowerCase() === "true";
const sheetDate = (value: unknown) => {
  const text = String(value || "").trim();
  const serial = typeof value === "number" ? value : Number(text);
  if (text && Number.isFinite(serial) && serial > 0) {
    const milliseconds = Date.UTC(1899, 11, 30) + serial * 86_400_000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazilian)
    return `${brazilian[3]}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
  return text.slice(0, 10);
};
const transactionFromRow = (row: TransactionRow): Transaction => ({
  id: String(row.id || ""),
  userId: String(row.usuario_id || ""),
  groupId: String(row.grupo_id || ""),
  sourceId: String(row.fonte_renda_id || ""),
  companyId: String(row.empresa_id || ""),
  date: sheetDate(row.data),
  description: String(row.descricao || ""),
  category: String(row.categoria || "Outros"),
  type: row.tipo === "income" ? "income" : "expense",
  value: Number(row.valor || 0),
  paymentMethod: String(row.forma_pagamento || "Não informado"),
  status:
    row.status === "pending"
      ? "pending"
      : row.status === "cancelled"
        ? "cancelled"
        : "paid",
  observation: String(row.observacao || ""),
  recurring: bool(row.recorrente),
  createdAt: sheetDate(row.criado_em),
  updatedAt: sheetDate(row.atualizado_em),
});
const transactionToRow = (transaction: Transaction): TransactionRow => ({
  id: transaction.id,
  usuario_id: transaction.userId,
  grupo_id: transaction.groupId || "",
  fonte_renda_id: transaction.sourceId || "",
  empresa_id: transaction.companyId || "",
  data: transaction.date,
  descricao: transaction.description,
  categoria: transaction.category,
  tipo: transaction.type,
  valor: transaction.value,
  forma_pagamento: transaction.paymentMethod,
  status: transaction.status,
  observacao: transaction.observation || "",
  recorrente: transaction.recurring,
  criado_em: transaction.createdAt || today(),
  atualizado_em: transaction.updatedAt || today(),
});
const userFromRow = (row: UserRow): User => ({
  id: String(row.id || ""),
  name: String(row.nome || ""),
  email: String(row.email || ""),
  active: bool(row.ativo),
  createdAt: sheetDate(row.criado_em),
  updatedAt: sheetDate(row.atualizado_em),
});
const userToRow = (user: User): UserRow => ({
  id: user.id,
  nome: user.name,
  email: user.email,
  ativo: user.active,
  criado_em: user.createdAt,
  atualizado_em: user.updatedAt,
});
const sourceFromRow = (row: SourceRow): IncomeSource => ({
  id: String(row.id || ""),
  userId: String(row.usuario_id || ""),
  groupId: String(row.grupo_id || ""),
  name: String(row.nome || ""),
  description: String(row.descricao || ""),
  active: bool(row.ativo),
  createdAt: sheetDate(row.criado_em),
  updatedAt: sheetDate(row.atualizado_em),
});
const sourceToRow = (source: IncomeSource): SourceRow => ({
  id: source.id,
  usuario_id: source.userId,
  grupo_id: source.groupId || "",
  nome: source.name,
  descricao: source.description,
  ativo: source.active,
  criado_em: source.createdAt,
  atualizado_em: source.updatedAt,
});
const companyFromRow = (row: CompanyRow): Company => ({
  id: String(row.id || ""),
  userId: String(row.usuario_id || ""),
  groupId: String(row.grupo_id || ""),
  name: String(row.nome || ""),
  active: bool(row.ativo),
  createdAt: sheetDate(row.criado_em),
  updatedAt: sheetDate(row.atualizado_em),
});
const companyToRow = (company: Company): CompanyRow => ({
  id: company.id,
  usuario_id: company.userId,
  grupo_id: company.groupId || "",
  nome: company.name,
  ativo: company.active,
  criado_em: company.createdAt,
  atualizado_em: company.updatedAt,
});
const orderFromRow = (row: OrderRow): Order => ({
  id: String(row.id || ""),
  userId: String(row.usuario_id || ""),
  groupId: String(row.grupo_id || ""),
  sourceId: String(row.fonte_renda_id || ""),
  colorId: String(row.cor_id || ""),
  title: String(row.titulo || ""),
  customer: String(row.cliente || ""),
  dueDate: sheetDate(row.prazo),
  value: Number(row.valor || 0),
  status: ["queued", "production", "ready", "delivered", "cancelled"].includes(String(row.status))
    ? (String(row.status) as OrderStatus)
    : "queued",
  observation: String(row.observacao || ""),
  createdAt: sheetDate(row.criado_em),
  updatedAt: sheetDate(row.atualizado_em),
});
const orderToRow = (order: Order): OrderRow => ({
  id: order.id,
  usuario_id: order.userId,
  grupo_id: order.groupId || "",
  fonte_renda_id: order.sourceId,
  cor_id: order.colorId,
  titulo: order.title,
  cliente: order.customer,
  prazo: order.dueDate,
  valor: order.value,
  status: order.status,
  observacao: order.observation,
  criado_em: order.createdAt,
  atualizado_em: order.updatedAt,
});
const colorFromRow = (row: ColorRow): Color => ({
  id: String(row.id || ""),
  userId: String(row.usuario_id || ""),
  groupId: String(row.grupo_id || ""),
  name: String(row.nome || ""),
  createdAt: sheetDate(row.criado_em),
  updatedAt: sheetDate(row.atualizado_em),
});
const colorToRow = (color: Color): ColorRow => ({
  id: color.id,
  usuario_id: color.userId,
  grupo_id: color.groupId || "",
  nome: color.name,
  criado_em: color.createdAt,
  atualizado_em: color.updatedAt,
});

async function backfillDefaultGroup(userId: string, groupId: string) {
  if (!googleSheetsService.isConfigured()) {
    demo = demo.map((item) => item.userId === userId && !item.groupId ? { ...item, groupId } : item);
    demoSources = demoSources.map((item) => item.userId === userId && !item.groupId ? { ...item, groupId } : item);
    demoCompanies = demoCompanies.map((item) => item.userId === userId && !item.groupId ? { ...item, groupId } : item);
    demoOrders = demoOrders.map((item) => item.userId === userId && !item.groupId ? { ...item, groupId } : item);
    demoColors = demoColors.map((item) => item.userId === userId && !item.groupId ? { ...item, groupId } : item);
    return;
  }
  const collections = [
    ["Movimentacoes", await list(), transactionToRow],
    ["FontesRenda", await listSources(), sourceToRow],
    ["Empresas", await listCompanies(), companyToRow],
    ["Pedidos", await listOrders(), orderToRow],
    ["Cores", await listColors(), colorToRow],
  ] as const;
  for (const [sheet, items, toRow] of collections) {
    for (const item of items as any[]) if (item.userId === userId && !item.groupId)
      await googleSheetsService.updateRecord(sheet, item.id, (toRow as (value: any) => SheetRecord)({ ...item, groupId }));
  }
}

export async function initialize() {
  if (googleSheetsService.isConfigured()) return googleSheetsService.connect();
  return { connected: false, sheets: [] };
}
export async function list() {
  if (!googleSheetsService.isConfigured()) return [...demo];
  return (
    await googleSheetsService.listRecords<TransactionRow>("Movimentacoes")
  ).map(transactionFromRow);
}
export async function create(input: Omit<Transaction, "id">) {
  const transaction: Transaction = {
    ...input,
    id: `mov_${randomUUID()}`,
    createdAt: today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    demo.unshift(transaction);
    return transaction;
  }
  await googleSheetsService.addRecord(
    "Movimentacoes",
    transactionToRow(transaction),
  );
  return transaction;
}
export async function update(id: string, input: Omit<Transaction, "id">) {
  if (!googleSheetsService.isConfigured()) {
    const index = demo.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Movimentação não encontrada."), {
        status: 404,
      });
    return (demo[index] = { ...input, id });
  }
  const current = (await list()).find((item) => item.id === id);
  if (!current)
    throw Object.assign(new Error("Movimentação não encontrada."), {
      status: 404,
    });
  const transaction: Transaction = {
    ...input,
    id,
    createdAt: current.createdAt,
    updatedAt: today(),
  };
  await googleSheetsService.updateRecord(
    "Movimentacoes",
    id,
    transactionToRow(transaction),
  );
  return transaction;
}
export async function remove(id: string) {
  if (!googleSheetsService.isConfigured()) {
    const index = demo.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Movimentação não encontrada."), {
        status: 404,
      });
    demo.splice(index, 1);
    return;
  }
  await googleSheetsService.deleteRecord("Movimentacoes", id);
}
export async function listUsers() {
  if (!googleSheetsService.isConfigured()) return [...demoUsers];
  return (await googleSheetsService.listRecords<UserRow>("Usuarios")).map(
    userFromRow,
  );
}
export async function createUser(input: { name: string; email: string }) {
  const user: User = {
    id: `usr_${randomUUID()}`,
    name: input.name,
    email: input.email,
    active: true,
    createdAt: today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    demoUsers.push(user);
    return user;
  }
  await googleSheetsService.addRecord("Usuarios", userToRow(user));
  return user;
}
export async function updateUser(
  id: string,
  input: { name: string; email: string; active?: boolean },
) {
  const current = (await listUsers()).find((item) => item.id === id);
  if (!current)
    throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });
  const user: User = {
    ...current,
    name: input.name,
    email: input.email,
    active: input.active ?? current.active,
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    const index = demoUsers.findIndex((item) => item.id === id);
    demoUsers[index] = user;
    return user;
  }
  await googleSheetsService.updateRecord("Usuarios", id, userToRow(user));
  return user;
}
export async function removeUser(id: string) {
  if (!googleSheetsService.isConfigured()) {
    const index = demoUsers.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });
    demoUsers.splice(index, 1);
    return;
  }
  await googleSheetsService.deleteRecord("Usuarios", id);
}
export async function listSources() {
  if (!googleSheetsService.isConfigured()) return [...demoSources];
  return (await googleSheetsService.listRecords<SourceRow>("FontesRenda")).map(
    sourceFromRow,
  );
}
export async function createSource(input: {
  userId: string;
  groupId?: string;
  name: string;
  description: string;
}) {
  const source: IncomeSource = {
    id: `src_${randomUUID()}`,
    userId: input.userId,
    groupId: input.groupId,
    name: input.name,
    description: input.description,
    active: true,
    createdAt: today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    demoSources.push(source);
    return source;
  }
  await googleSheetsService.addRecord("FontesRenda", sourceToRow(source));
  return source;
}
export async function updateSource(
  id: string,
  input: { userId: string; groupId?: string; name: string; description: string; active: boolean },
) {
  const source: IncomeSource = {
    id,
    ...input,
    createdAt:
      (await listSources()).find((item) => item.id === id)?.createdAt ||
      today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    const index = demoSources.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Fonte de renda não encontrada."), {
        status: 404,
      });
    return (demoSources[index] = source);
  }
  await googleSheetsService.updateRecord(
    "FontesRenda",
    id,
    sourceToRow(source),
  );
  return source;
}
export async function removeSource(id: string) {
  if (!googleSheetsService.isConfigured()) {
    const index = demoSources.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Fonte de renda não encontrada."), {
        status: 404,
      });
    demoSources.splice(index, 1);
    return;
  }
  await googleSheetsService.deleteRecord("FontesRenda", id);
}
export async function listCompanies() {
  if (!googleSheetsService.isConfigured()) return [...demoCompanies];
  return (await googleSheetsService.listRecords<CompanyRow>("Empresas")).map(
    companyFromRow,
  );
}
export async function createCompany(input: { userId: string; groupId?: string; name: string }) {
  const company: Company = {
    id: `emp_${randomUUID()}`,
    userId: input.userId,
    groupId: input.groupId,
    name: input.name,
    active: true,
    createdAt: today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    demoCompanies.push(company);
    return company;
  }
  await googleSheetsService.addRecord("Empresas", companyToRow(company));
  return company;
}
export async function updateCompany(
  id: string,
  input: { userId: string; name: string; active: boolean },
) {
  const current = (await listCompanies()).find((item) => item.id === id);
  if (!current)
    throw Object.assign(new Error("Empresa não encontrada."), { status: 404 });
  const company: Company = {
    ...current,
    ...input,
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    const index = demoCompanies.findIndex((item) => item.id === id);
    demoCompanies[index] = company;
    return company;
  }
  await googleSheetsService.updateRecord("Empresas", id, companyToRow(company));
  return company;
}
export async function removeCompany(id: string) {
  if (!googleSheetsService.isConfigured()) {
    const index = demoCompanies.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Empresa não encontrada."), { status: 404 });
    demoCompanies.splice(index, 1);
    return;
  }
  await googleSheetsService.deleteRecord("Empresas", id);
}
export async function listOrders() {
  if (!googleSheetsService.isConfigured()) return [...demoOrders];
  return (await googleSheetsService.listRecords<OrderRow>("Pedidos")).map(orderFromRow);
}
export async function createOrder(input: Omit<Order, "id" | "createdAt" | "updatedAt">) {
  const order: Order = {
    ...input,
    id: `ped_${randomUUID()}`,
    createdAt: today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    demoOrders.unshift(order);
    return order;
  }
  await googleSheetsService.addRecord("Pedidos", orderToRow(order));
  return order;
}
export async function updateOrder(
  id: string,
  input: Omit<Order, "id" | "createdAt" | "updatedAt">,
) {
  const current = (await listOrders()).find((item) => item.id === id);
  if (!current)
    throw Object.assign(new Error("Pedido não encontrado."), { status: 404 });
  const order: Order = { ...current, ...input, id, updatedAt: today() };
  if (!googleSheetsService.isConfigured()) {
    const index = demoOrders.findIndex((item) => item.id === id);
    demoOrders[index] = order;
    return order;
  }
  await googleSheetsService.updateRecord("Pedidos", id, orderToRow(order));
  return order;
}
export async function removeOrder(id: string) {
  if (!googleSheetsService.isConfigured()) {
    const index = demoOrders.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Pedido não encontrado."), { status: 404 });
    demoOrders.splice(index, 1);
    return;
  }
  await googleSheetsService.deleteRecord("Pedidos", id);
}
export async function listColors() {
  if (!googleSheetsService.isConfigured()) return [...demoColors];
  return (await googleSheetsService.listRecords<ColorRow>("Cores")).map(colorFromRow);
}
export async function createColor(input: { userId: string; groupId?: string; name: string }) {
  const color: Color = {
    id: `cor_${randomUUID()}`,
    userId: input.userId,
    groupId: input.groupId,
    name: input.name,
    createdAt: today(),
    updatedAt: today(),
  };
  if (!googleSheetsService.isConfigured()) {
    demoColors.push(color);
    return color;
  }
  await googleSheetsService.addRecord("Cores", colorToRow(color));
  return color;
}
export async function removeColor(id: string) {
  if (!googleSheetsService.isConfigured()) {
    const index = demoColors.findIndex((item) => item.id === id);
    if (index < 0)
      throw Object.assign(new Error("Cor não encontrada."), { status: 404 });
    demoColors.splice(index, 1);
    return;
  }
  await googleSheetsService.deleteRecord("Cores", id);
}
export async function readAllSheets() {
  return googleSheetsService.readAllSheets();
}
export async function publicSettings() {
  return {
    apiUrl: "",
    workbookId: googleSheetsService.spreadsheetId,
    worksheet: "Movimentacoes",
    configured: googleSheetsService.isConfigured(),
    connected: googleSheetsService.isConnected(),
    message: googleSheetsService.isConnected()
      ? "Google Sheets conectado."
      : "Use o botão Testar conexão após configurar a Service Account.",
  };
}
export async function testConnection() {
  return googleSheetsService.testConnection();
}
export async function status() {
  return {
    mode: googleSheetsService.isConfigured() ? "google-sheets" : "demo",
    connected: googleSheetsService.isConnected(),
    records: (await list()).length,
    spreadsheetId: googleSheetsService.spreadsheetId,
    range: "Movimentacoes",
    serviceAccountEmail: "",
  };
}
