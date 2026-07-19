import { supabase, supabaseConfigured } from "./supabase";

type Response<T> = { data: T };
class ApiError extends Error { response: { data: { message: string }; status: number }; constructor(message: string, status = 400) { super(message); this.response = { data: { message }, status }; } }
const fail = (error: { message?: string; code?: string } | null, fallback = "Não foi possível concluir a operação.") => {
  if (error) throw new ApiError(error.code === "23505" ? "Este registro já está cadastrado." : error.message || fallback);
};
const currentUser = async () => {
  if (!supabaseConfigured) throw new ApiError("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.", 503);
  const { data, error } = await supabase.auth.getUser(); fail(error);
  if (!data.user) throw new ApiError("Faça login para continuar.", 401);
  return data.user;
};
const url = (raw: string) => new URL(raw, "https://finanbase.local");
const dateOnly = (value: string) => String(value || "").slice(0, 10);
const profile = (r: any) => ({ id:r.id,name:r.name,email:r.email,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at });
const source = (r: any) => ({ id:r.id,userId:r.user_id,name:r.name,description:r.description,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at });
const company = (r: any) => ({ id:r.id,userId:r.user_id,name:r.name,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at });
const color = (r: any) => ({ id:r.id,userId:r.user_id,name:r.name,createdAt:r.created_at,updatedAt:r.updated_at });
const transaction = (r: any) => ({ id:r.id,userId:r.user_id,sourceId:r.source_id||"",date:dateOnly(r.date),description:r.description,category:r.category,type:r.type,value:Number(r.value),paymentMethod:r.payment_method,status:r.status,observation:r.observation,recurring:r.recurring,createdAt:r.created_at,updatedAt:r.updated_at });
const order = (r: any) => ({ id:r.id,userId:r.user_id,sourceId:r.source_id,colorId:r.color_id||"",colorName:r.colors?.name||"",title:r.title,customer:r.customer,dueDate:dateOnly(r.due_date),value:Number(r.value),status:r.status,observation:r.observation,createdAt:r.created_at,updatedAt:r.updated_at });
const transactionRow = (v:any) => ({ user_id:v.userId,source_id:v.sourceId||null,date:v.date,description:v.description,category:v.category,type:v.type,value:v.value,payment_method:v.paymentMethod,status:v.status,observation:v.observation||"",recurring:Boolean(v.recurring) });
const orderRow = (v:any) => ({ user_id:v.userId,source_id:v.sourceId,color_id:v.colorId||null,title:v.title,customer:v.customer,due_date:v.dueDate,value:v.value,status:v.status,observation:v.observation||"" });

async function listTransactions(params: URLSearchParams) {
  await currentUser();
  let q:any = supabase.from("transactions").select("*");
  if(params.get("userId"))q=q.eq("user_id",params.get("userId")); if(params.get("sourceId"))q=q.eq("source_id",params.get("sourceId"));
  if(params.get("type"))q=q.eq("type",params.get("type")); if(params.get("status"))q=q.eq("status",params.get("status"));
  if(params.get("search"))q=q.ilike("description",`%${params.get("search")}%`); if(params.get("startDate"))q=q.gte("date",params.get("startDate")); if(params.get("endDate"))q=q.lte("date",params.get("endDate"));
  const {data,error}=await q.order("date",{ascending:false}); fail(error); return (data||[]).map(transaction);
}
const recurringProjection=(items:any[])=>{const now=new Date(),current=now.getFullYear()*12+now.getMonth();return items.flatMap(t=>{if(!t.recurring)return[t];const[y,m,d]=t.date.split("-").map(Number),first=y*12+m-1,copies=[];for(let month=first;month<=current;month++){const year=Math.floor(month/12),index=month%12,day=Math.min(d,new Date(year,index+1,0).getDate());copies.push({...t,id:`${t.id}:${year}-${index+1}`,date:`${year}-${String(index+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`})}return copies})};
const dashboardData=async(params:URLSearchParams)=>{const all=recurringProjection(await listTransactions(params)),valid=all.filter((t:any)=>t.status!=="cancelled"),paid=valid.filter((t:any)=>t.status==="paid"),income=paid.filter((t:any)=>t.type==="income"),expense=paid.filter((t:any)=>t.type==="expense");return{all,valid,summary:{balance:income.reduce((s:number,t:any)=>s+t.value,0)-expense.reduce((s:number,t:any)=>s+t.value,0),income:income.reduce((s:number,t:any)=>s+t.value,0),expense:expense.reduce((s:number,t:any)=>s+t.value,0),pending:valid.filter((t:any)=>t.status==="pending").reduce((s:number,t:any)=>s+t.value,0),count:all.length}}};

async function get<T>(raw:string):Promise<Response<T>>{const u=url(raw),p=u.pathname,params=u.searchParams;
  if(p==="/auth/session"){const user=await currentUser();const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).single();fail(error);return{data:{user:{id:user.id,name:data.name,email:user.email}} as T}}
  if(p==="/users"){const user=await currentUser();const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id);fail(error);return{data:(data||[]).map(profile) as T}}
  if(p==="/income-sources"){await currentUser();let q:any=supabase.from("income_sources").select("*").order("name");if(params.get("userId"))q=q.eq("user_id",params.get("userId"));const{data,error}=await q;fail(error);return{data:(data||[]).map(source) as T}}
  if(p==="/companies"){await currentUser();let q:any=supabase.from("companies").select("*").order("name");if(params.get("userId"))q=q.eq("user_id",params.get("userId"));const{data,error}=await q;fail(error);return{data:(data||[]).map(company) as T}}
  if(p==="/colors"){await currentUser();let q:any=supabase.from("colors").select("*").order("name").limit(5);if(params.get("userId"))q=q.eq("user_id",params.get("userId"));if(params.get("search"))q=q.ilike("name",`%${params.get("search")}%`);const{data,error}=await q;fail(error);return{data:(data||[]).map(color) as T}}
  if(p.startsWith("/orders/")){await currentUser();const{data,error}=await supabase.from("orders").select("*,colors(name)").eq("id",p.split("/").pop()).single();fail(error);return{data:order(data) as T}}
  if(p==="/orders"){await currentUser();let q:any=supabase.from("orders").select("*,colors(name)").order("due_date");if(params.get("userId"))q=q.eq("user_id",params.get("userId"));if(params.get("sourceId"))q=q.eq("source_id",params.get("sourceId"));const{data,error}=await q;fail(error);return{data:(data||[]).map(order) as T}}
  if(p.startsWith("/transactions/")){await currentUser();const{data,error}=await supabase.from("transactions").select("*").eq("id",p.split("/").pop()).single();fail(error);return{data:transaction(data) as T}}
  if(p==="/transactions"){let items=await listTransactions(params);const total=items.length,limit=Number(params.get("limit")||10),page=Number(params.get("page")||1),summary=items.reduce((s:any,t:any)=>{if(t.status!=="cancelled"){s.totalValue+=t.type==="income"?t.value:-t.value;t.type==="income"?s.totalIncome+=t.value:s.totalExpense+=t.value}return s},{totalValue:0,totalIncome:0,totalExpense:0});return{data:{data:items.slice((page-1)*limit,page*limit),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)},summary} as T}}
  if(p==="/dashboard/summary"){const d=await dashboardData(params);return{data:d.summary as T}}
  if(p==="/dashboard/charts"){const{valid}=await dashboardData(params),group=(key:(t:any)=>string)=>Object.values(valid.reduce((a:any,t:any)=>{const n=key(t);a[n]??={name:n,income:0,expense:0};a[n][t.type]+=t.value;return a},{})),monthly=group((t:any)=>t.date.slice(0,7));let balance=0;const evolution=[...valid].sort((a:any,b:any)=>a.date.localeCompare(b.date)).map((t:any)=>({date:t.date,balance:balance+=t.type==="income"?t.value:-t.value}));return{data:{monthly,evolution,categories:group((t:any)=>t.category),payments:group((t:any)=>t.paymentMethod)} as T}}
  if(p==="/settings/excel")return{data:{workbookId:"Supabase PostgreSQL",worksheet:"Tabelas protegidas por RLS",connected:supabaseConfigured,configured:supabaseConfigured,message:supabaseConfigured?"Supabase configurado.":"Configure as variáveis do Supabase."} as T};
  throw new ApiError("Rota não encontrada.",404);
}

async function post<T>(p:string,v?:any):Promise<Response<T>>{
  if(p==="/auth/login"){if(!supabaseConfigured)throw new ApiError("Configure o Supabase no Vercel.",503);const{data,error}=await supabase.auth.signInWithPassword({email:v.email,password:v.password});fail(error);const authUser=data.user;if(!authUser)throw new ApiError("Login não concluído.",401);const{data:pr,error:pe}=await supabase.from("profiles").select("name").eq("id",authUser.id).single();fail(pe);if(!pr)throw new ApiError("Perfil não encontrado.",404);return{data:{user:{id:authUser.id,name:pr.name,email:authUser.email}} as T}}
  if(p==="/auth/signup"){const{data,error}=await supabase.auth.signUp({email:v.email,password:v.password,options:{data:{name:v.name}}});fail(error);return{data:{user:data.user?{id:data.user.id,name:v.name,email:data.user.email}:null,message:data.session?"Conta criada.":"Confira seu e-mail para confirmar a conta."} as T}}
  if(p==="/auth/logout"){await supabase.auth.signOut();return{data:undefined as T}}
  const user=await currentUser();let result:any;
  if(p==="/income-sources")result=await supabase.from("income_sources").insert({user_id:user.id,name:v.name,description:v.description||""}).select().single();
  else if(p==="/companies")result=await supabase.from("companies").insert({user_id:user.id,name:v.name}).select().single();
  else if(p==="/colors")result=await supabase.from("colors").insert({user_id:user.id,name:v.name}).select().single();
  else if(p==="/transactions")result=await supabase.from("transactions").insert({...transactionRow(v),user_id:user.id}).select().single();
  else if(p==="/orders")result=await supabase.from("orders").insert({...orderRow(v),user_id:user.id}).select("*,colors(name)").single();
  else if(p==="/sheets/test")return{data:{connected:supabaseConfigured,configured:supabaseConfigured,message:"Supabase conectado."} as T};
  else throw new ApiError("Operação não suportada.",404);fail(result.error);const mapper=p==="/income-sources"?source:p==="/companies"?company:p==="/colors"?color:p==="/transactions"?transaction:order;return{data:mapper(result.data) as T};
}
async function put<T>(p:string,v:any):Promise<Response<T>>{const user=await currentUser(),id=p.split("/").pop();let result:any,mapper:any;
  if(p.startsWith("/users/")){result=await supabase.from("profiles").update({name:v.name,email:v.email}).eq("id",user.id).select().single();mapper=profile}
  else if(p.startsWith("/income-sources/")){result=await supabase.from("income_sources").update({name:v.name,description:v.description,active:v.active}).eq("id",id).select().single();mapper=source}
  else if(p.startsWith("/companies/")){result=await supabase.from("companies").update({name:v.name,active:v.active}).eq("id",id).select().single();mapper=company}
  else if(p.startsWith("/transactions/")){result=await supabase.from("transactions").update(transactionRow(v)).eq("id",id).select().single();mapper=transaction}
  else if(p.startsWith("/orders/")){result=await supabase.from("orders").update(orderRow(v)).eq("id",id).select("*,colors(name)").single();mapper=order}
  else throw new ApiError("Operação não suportada.",404);fail(result.error);return{data:mapper(result.data) as T};
}
async function del<T>(p:string):Promise<Response<T>>{await currentUser();const id=p.split("/").pop(),table=p.startsWith("/income-sources/")?"income_sources":p.startsWith("/companies/")?"companies":p.startsWith("/colors/")?"colors":p.startsWith("/transactions/")?"transactions":p.startsWith("/orders/")?"orders":"";if(!table)throw new ApiError("Operação não suportada.",404);const{error}=await supabase.from(table).delete().eq("id",id);fail(error);return{data:undefined as T}}
export const api={get,post,put,delete:del};
export const errorMessage=(e:unknown)=>e instanceof ApiError?e.response.data.message:e instanceof Error?e.message:"Ocorreu um erro inesperado.";
