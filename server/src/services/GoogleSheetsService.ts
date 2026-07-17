import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { google, sheets_v4 } from "googleapis";

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
config({path:resolve(projectRoot,".env")});
config({path:resolve(projectRoot,"server/.env")});

export const REQUIRED_SHEETS=["Usuarios","Movimentacoes","Listas","Instrucoes"] as const;
export type RequiredSheet=(typeof REQUIRED_SHEETS)[number];
export type SheetRecord=Record<string,unknown>;

export class GoogleSheetsError extends Error{
  status:number;
  constructor(message:string,status=502){super(message);this.name="GoogleSheetsError";this.status=status}
}

export class GoogleSheetsService{
  readonly spreadsheetId:string;
  readonly credentialsPath:string;
  private readonly sheets:sheets_v4.Sheets;
  private connected=false;

  constructor(){
    this.spreadsheetId=process.env.GOOGLE_SHEET_ID||process.env.GOOGLE_SHEETS_SPREADSHEET_ID||"";
    const configuredPath=process.env.GOOGLE_APPLICATION_CREDENTIALS||"./credentials/google-service-account.json";
    this.credentialsPath=isAbsolute(configuredPath)?configuredPath:resolve(projectRoot,configuredPath);
    const auth=new google.auth.GoogleAuth({keyFile:this.credentialsPath,scopes:["https://www.googleapis.com/auth/spreadsheets"]});
    this.sheets=google.sheets({version:"v4",auth});
  }

  isConfigured(){return Boolean(this.spreadsheetId&&existsSync(this.credentialsPath))}
  isConnected(){return this.connected}

  private ensureConfigured(){
    if(!this.spreadsheetId)throw new GoogleSheetsError("GOOGLE_SHEET_ID não foi configurado.",503);
    if(!existsSync(this.credentialsPath))throw new GoogleSheetsError(`Arquivo da Service Account não encontrado em ${this.credentialsPath}.`,503);
  }

  async connect(){
    this.ensureConfigured();
    try{
      const response=await this.sheets.spreadsheets.get({spreadsheetId:this.spreadsheetId,fields:"spreadsheetId,sheets.properties(title,sheetId)"});
      const available=new Set((response.data.sheets||[]).map(sheet=>sheet.properties?.title));
      const missing=REQUIRED_SHEETS.filter(sheet=>!available.has(sheet));
      if(missing.length)throw new GoogleSheetsError(`Abas obrigatórias ausentes: ${missing.join(", ")}.`,422);
      this.connected=true;return{connected:true,sheets:[...available].filter(Boolean)};
    }catch(error){this.connected=false;throw this.normalizeError(error)}
  }

  async testConnection(){return this.connect()}

  async readSheet(sheetName:RequiredSheet){
    this.ensureConfigured();
    try{const response=await this.sheets.spreadsheets.values.get({spreadsheetId:this.spreadsheetId,range:`'${sheetName}'!A:Z`,valueRenderOption:"UNFORMATTED_VALUE",dateTimeRenderOption:"FORMATTED_STRING"});return response.data.values||[]}
    catch(error){throw this.normalizeError(error)}
  }

  async readAllSheets(){const entries=await Promise.all(REQUIRED_SHEETS.map(async name=>[name,await this.readSheet(name)] as const));return Object.fromEntries(entries)}

  async listRecords<T extends SheetRecord=SheetRecord>(sheetName:RequiredSheet):Promise<T[]>{
    const rows=await this.readSheet(sheetName);if(!rows.length)return[];const headers=rows[0].map(String);
    return rows.slice(1).filter(row=>row.some(value=>value!==""&&value!=null)).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??""])) as T);
  }

  async addRecord<T extends SheetRecord>(sheetName:RequiredSheet,record:T){
    const headers=await this.headers(sheetName);const values=headers.map(header=>record[header]??"");
    try{await this.sheets.spreadsheets.values.append({spreadsheetId:this.spreadsheetId,range:`'${sheetName}'!A:Z`,valueInputOption:"USER_ENTERED",insertDataOption:"INSERT_ROWS",requestBody:{values:[values]}});return record}
    catch(error){throw this.normalizeError(error)}
  }

  async updateRecord<T extends SheetRecord>(sheetName:RequiredSheet,id:string,record:T){
    const rows=await this.readSheet(sheetName);if(!rows.length)throw new GoogleSheetsError(`A aba ${sheetName} não possui cabeçalho.`,422);
    const headers=rows[0].map(String),idColumn=headers.indexOf("id"),rowIndex=rows.findIndex((row,index)=>index>0&&String(row[idColumn])===id);
    if(idColumn<0||rowIndex<0)throw new GoogleSheetsError(`Registro ${id} não encontrado em ${sheetName}.`,404);
    const values=headers.map(header=>record[header]??"");const endColumn=this.columnLetter(headers.length);
    try{await this.sheets.spreadsheets.values.update({spreadsheetId:this.spreadsheetId,range:`'${sheetName}'!A${rowIndex+1}:${endColumn}${rowIndex+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:[values]}});return record}
    catch(error){throw this.normalizeError(error)}
  }

  async deleteRecord(sheetName:RequiredSheet,id:string){
    const rows=await this.readSheet(sheetName),idColumn=(rows[0]||[]).map(String).indexOf("id"),rowIndex=rows.findIndex((row,index)=>index>0&&String(row[idColumn])===id);
    if(idColumn<0||rowIndex<0)throw new GoogleSheetsError(`Registro ${id} não encontrado em ${sheetName}.`,404);
    try{const metadata=await this.sheets.spreadsheets.get({spreadsheetId:this.spreadsheetId,fields:"sheets.properties(title,sheetId)"});const sheetId=metadata.data.sheets?.find(sheet=>sheet.properties?.title===sheetName)?.properties?.sheetId;if(sheetId==null)throw new GoogleSheetsError(`Aba ${sheetName} não encontrada.`,404);await this.sheets.spreadsheets.batchUpdate({spreadsheetId:this.spreadsheetId,requestBody:{requests:[{deleteDimension:{range:{sheetId,dimension:"ROWS",startIndex:rowIndex,endIndex:rowIndex+1}}}]}})}
    catch(error){throw this.normalizeError(error)}
  }

  private async headers(sheetName:RequiredSheet){const rows=await this.readSheet(sheetName);const headers=(rows[0]||[]).map(String).filter(Boolean);if(!headers.length)throw new GoogleSheetsError(`A aba ${sheetName} não possui cabeçalho.`,422);return headers}
  private columnLetter(count:number){let value=count,result="";while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26)}return result}
  private normalizeError(error:unknown){if(error instanceof GoogleSheetsError)return error;const candidate=error as {code?:number;message?:string};const suffix=candidate.code===403?" Compartilhe a planilha como Editor com o e-mail da Service Account.":"";return new GoogleSheetsError(`Erro ao acessar o Google Sheets: ${candidate.message||"falha desconhecida"}.${suffix}`,candidate.code===404?404:502)}
}

export const googleSheetsService=new GoogleSheetsService();
