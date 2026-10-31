export type MovementKind="sale"|"restock"|"withdrawal";
export type StockMovement={id:string;consignment_id:string;item_id:string;kind:"opening"|MovementKind|"reversal";style:string;quantity:number;stock_delta:number;stock_before:number;stock_after:number;unit_price:number;unit_cost:number;commission:number;revenue:number;profit:number;occurred_on:string;notes:string;created_at:string;reverses_id:string|null};
export const kindLabels:Record<StockMovement["kind"],string>={opening:"Estoque inicial",sale:"Venda",restock:"Reposição",withdrawal:"Retirada sem venda",reversal:"Estorno"};
export const localToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export function amount(raw:string,label:string,allowZero=true) {
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw))throw new Error(`Informe ${label} com até duas casas decimais.`);
  const value=Math.round(Number(raw.replace(",","."))*100)/100;
  if(!Number.isFinite(value)||value>999999.99||value<(allowZero?0:0.01))throw new Error(`Valor inválido para ${label}.`);
  return value;
}
export function movementQuantity(kind:MovementKind,raw:string,mode:"add"|"target",current:number) {
  if(!/^\d+$/.test(raw))throw new Error("Informe uma quantidade inteira.");
  const requested=Number(raw),quantity=kind==="restock"&&mode==="target"?requested-current:requested;
  if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000)throw new Error(mode==="target"&&kind==="restock"?"O estoque final deve ser maior que o atual.":"Informe uma quantidade entre 1 e 100.000.");
  if(kind!=="restock"&&quantity>current)throw new Error("A saída é maior que o estoque disponível.");
  if(kind==="restock"&&current+quantity>100000)throw new Error("O estoque máximo por estilo é 100.000.");
  return quantity;
}
export function financialSummary(movements:StockMovement[]) {
  const months=new Map<string,{month:string;revenue:number;profit:number}>();
  const result={sold:0,restocked:0,revenueCents:0,commissionCents:0,costCents:0,profitCents:0};
  for(const m of movements) {
    const reversal=m.kind==="reversal";
    if(m.kind==="sale"||(reversal&&m.revenue<0)){
      result.sold+=reversal?-m.quantity:m.quantity;
      result.revenueCents+=Math.round(m.revenue*100);
      result.commissionCents+=Math.round(m.commission*100);
      result.costCents+=Math.round(m.unit_cost*100)*m.quantity*(reversal?-1:1);
      result.profitCents+=Math.round(m.profit*100);
      const month=m.occurred_on.slice(0,7),row=months.get(month)||{month,revenue:0,profit:0};
      row.revenue+=Math.round(m.revenue*100);row.profit+=Math.round(m.profit*100);months.set(month,row);
    }
    if(m.kind==="restock")result.restocked+=m.quantity;
    if(reversal&&m.stock_delta<0&&m.revenue===0)result.restocked-=m.quantity;
  }
  return {...result,monthly:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(row=>({...row,revenue:row.revenue/100,profit:row.profit/100}))};
}
export function salePreview(quantity:number,price:string,cost:string,fee:string) {
  const unitPrice=amount(price,"o preço",false),unitCost=amount(cost,"o custo");
  const revenueCents=Math.round(unitPrice*100)*quantity;
  const feeValue=amount(fee.trim()||"0","o valor da loja");
  const commissionCents=Math.round(feeValue*100)*quantity;
  if(commissionCents>revenueCents)throw new Error("O valor da loja não pode superar o valor vendido.");
  return {unitPrice,unitCost,commission:commissionCents/100,revenue:revenueCents/100,profit:(revenueCents-Math.round(unitCost*100)*quantity-commissionCents)/100};
}

import type {ConsignmentItem} from "./model";
export function stockForecast(items:ConsignmentItem[]) {
  let quantity=0,revenueCents=0,storeCents=0,costCents=0,missingCost=false;
  const styles=items.map(item=>{
    const gross=Math.round(item.unit_price*100)*item.quantity;
    const fee=Math.round((item.store_value||0)*100)*item.quantity;
    quantity+=item.quantity;revenueCents+=gross;storeCents+=fee;
    if(item.quantity>0&&item.unit_cost==null)missingCost=true;
    costCents+=Math.round((item.unit_cost||0)*100)*item.quantity;
    return {name:item.style,store:fee/100,yours:(gross-fee)/100};
  });
  return {quantity,revenueCents,storeCents,yourCents:revenueCents-storeCents,profitCents:missingCost?null:revenueCents-storeCents-costCents,styles};
}
