import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Transaction } from "../types/transaction.js";
import { demoTransactions } from "../data/demo.js";

type ExcelSettings={apiUrl:string;apiKey:string;workbookId:string;worksheet:string;lastTest?:string};
const folder=dirname(fileURLToPath(import.meta.url));
const settingsFile=resolve(folder,"../data/excel-settings.json");
let demo=[...demoTransactions];
let cached:ExcelSettings|undefined;

const readSettings=async():Promise<ExcelSettings>=>{if(cached)return cached;try{cached=JSON.parse(await readFile(settingsFile,"utf8"))}catch{cached={apiUrl:"",apiKey:"",workbookId:"",worksheet:"Movimentacoes"}}return cached!};
export const publicSettings=async()=>{const s=await readSettings();return{apiUrl:s.apiUrl,workbookId:s.workbookId,worksheet:s.worksheet,configured:Boolean(s.apiUrl&&s.apiKey&&s.workbookId),connected:Boolean(s.lastTest),lastTest:s.lastTest,message:s.lastTest?"A última conexão com a API foi concluída com sucesso.":"Configure e teste os dados de acesso."}};
export const saveSettings=async(input:Partial<ExcelSettings>)=>{const current=await readSettings();cached={apiUrl:String(input.apiUrl||"").replace(/\/$/,""),apiKey:String(input.apiKey||current.apiKey||""),workbookId:String(input.workbookId||""),worksheet:String(input.worksheet||"Movimentacoes"),lastTest:undefined};await writeFile(settingsFile,JSON.stringify(cached,null,2),"utf8");return publicSettings()};
const configured=async()=>{const s=await readSettings();return Boolean(s.apiUrl&&s.apiKey&&s.workbookId)};
const endpoint=async(path="")=>{const s=await readSettings();return`${s.apiUrl}/workbooks/${encodeURIComponent(s.workbookId)}/worksheets/${encodeURIComponent(s.worksheet)}/transactions${path}`};
const request=async<T>(url:string,init?:RequestInit):Promise<T>=>{const s=await readSettings();const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${s.apiKey}`,"X-API-Key":s.apiKey,"Content-Type":"application/json",...init?.headers},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Object.assign(new Error(`A API do Excel respondeu com status ${response.status}.`),{status:502});if(response.status===204)return undefined as T;const body=await response.json() as T|{data:T};return(body&&typeof body==="object"&&"data" in body?(body as{data:T}).data:body)as T};
const normalize=(t:Transaction):Transaction=>({...t,value:Number(t.value),recurring:Boolean(t.recurring),owner:t.owner||"Paulo",observation:t.observation||""});

export async function list(){if(!await configured())return[...demo];const result=await request<Transaction[]>(await endpoint());return(result||[]).map(normalize)}
export async function create(input:Omit<Transaction,"id">){if(!await configured()){const t={...input,id:randomUUID()};demo.unshift(t);return t}return normalize(await request<Transaction>(await endpoint(),{method:"POST",body:JSON.stringify(input)}))}
export async function update(id:string,input:Omit<Transaction,"id">){if(!await configured()){const index=demo.findIndex(t=>t.id===id);if(index<0)throw Object.assign(new Error("Movimentação não encontrada."),{status:404});return demo[index]={...input,id}}return normalize(await request<Transaction>(await endpoint(`/${encodeURIComponent(id)}`),{method:"PUT",body:JSON.stringify(input)}))}
export async function remove(id:string){if(!await configured()){const index=demo.findIndex(t=>t.id===id);if(index<0)throw Object.assign(new Error("Movimentação não encontrada."),{status:404});demo.splice(index,1);return}await request<void>(await endpoint(`/${encodeURIComponent(id)}`),{method:"DELETE"})}
export async function testConnection(){if(!await configured())throw Object.assign(new Error("Preencha e salve todos os dados da API."),{status:400});await request<Transaction[]>(await endpoint());const s=await readSettings();s.lastTest=new Date().toISOString();await writeFile(settingsFile,JSON.stringify(s,null,2),"utf8");return publicSettings()}
export async function status(){const s=await publicSettings();return{mode:s.configured?"excel-api":"demo",connected:s.connected,records:(await list()).length,lastSync:s.lastTest,spreadsheetId:s.workbookId,range:s.worksheet,serviceAccountEmail:""}}
