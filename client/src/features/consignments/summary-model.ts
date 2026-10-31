import type {Consignment} from "./model";
import {financialSummary,type StockMovement} from "./activity-model";
export const normalizeCompanySearch=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
type Ranking={id:string;name:string;sold:number;revenueCents:number;profitCents:number};
export function buildConsignmentSummary(stores:Consignment[],movements:StockMovement[]) {
  const storeIds=new Set(stores.map(store=>store.id));
  const history=movements.filter(m=>storeIds.has(m.consignment_id));
  const overall=financialSummary(history);
  const companies:Ranking[]=stores.map(store=>{
    const values=financialSummary(history.filter(m=>m.consignment_id===store.id));
    return {id:store.id,name:store.store_name,sold:values.sold,revenueCents:values.revenueCents,profitCents:values.profitCents};
  });
  const styleMap=new Map<string,Ranking>(),itemNames=new Map<string,string>();
  let stockCostCents=0,missingCostQuantity=0;
  for(const store of stores)for(const item of store.consignment_items){
    if(item.id)itemNames.set(item.id,item.style);
    const id=normalizeCompanySearch(item.style);
    if(!styleMap.has(id))styleMap.set(id,{id,name:item.style,sold:0,revenueCents:0,profitCents:0});
    if(item.unit_cost==null)missingCostQuantity+=item.quantity;
    else stockCostCents+=Math.round(item.unit_cost*100)*item.quantity;
  }
  for(const m of history) {
    if(m.kind!=="sale"&&!(m.kind==="reversal"&&m.revenue<0))continue;
    const name=itemNames.get(m.item_id)||m.style,id=normalizeCompanySearch(name);
    const row=styleMap.get(id)||{id,name,sold:0,revenueCents:0,profitCents:0};
    row.sold+=m.kind==="sale"?m.quantity:-m.quantity;
    row.revenueCents+=Math.round(m.revenue*100);row.profitCents+=Math.round(m.profit*100);
    styleMap.set(id,row);
  }
  const sort=(a:Ranking,b:Ranking)=>b.sold-a.sold||a.name.localeCompare(b.name,"pt-BR");
  companies.sort(sort);
  const styles=[...styleMap.values()].sort(sort);
  const best=companies.length&&companies[0].sold>0?companies.filter(row=>row.sold===companies[0].sold):[];
  const least=best.length?companies.filter(row=>row.sold===companies[companies.length-1].sold):[];
  const bestStyles=styles.length&&styles[0].sold>0?styles.filter(row=>row.sold===styles[0].sold):[];
  return {overall,companies,styles,best,least,bestStyles,stockCostCents,missingCostQuantity,investmentCents:overall.costCents+stockCostCents};
}
