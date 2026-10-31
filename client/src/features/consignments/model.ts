export type ConsignmentItem = {id?:string; style:string; unit_price:number; quantity:number; unit_cost?:number|null; store_value?:number};
export type Consignment = {id:string; group_id:string; store_name:string; updated_at:string; consignment_items:ConsignmentItem[]};
export type DraftItem = {key:string; id?:string; style:string; price:string; quantity:string; cost?:string; storeValue?:string};
export const newItem = ():DraftItem => ({key:crypto.randomUUID(),style:"",price:"",quantity:"1"});
export function parseItems(items:DraftItem[]):ConsignmentItem[] {
  if (!items.length || items.length>100) throw new Error("Informe de 1 a 100 estilos por loja.");
  const names=new Set<string>();
  return items.map(item=>{
    const style=item.style.trim();
    if (!style || style.length>100) throw new Error("Informe o nome de cada estilo (até 100 caracteres).");
    const name=style.toLocaleLowerCase("pt-BR");
    if(names.has(name)) throw new Error("Cada estilo deve aparecer apenas uma vez na loja.");
    names.add(name);
    if(!/^\d+(?:[.,]\d{1,2})?$/.test(item.price)) throw new Error("Informe um valor unitário válido, como 12,50.");
    const unit_price=Math.round(Number(item.price.replace(",","."))*100)/100;
    if(unit_price<=0 || unit_price>999999.99) throw new Error("O valor unitário deve ser maior que zero e até R$ 999.999,99.");
    if(!/^\d+$/.test(item.quantity)) throw new Error("A quantidade deve ser um número inteiro.");
    const quantity=Number(item.quantity);
    if(quantity>100000) throw new Error("A quantidade máxima por estilo é 100.000.");
    let unit_cost:number|null=null;
    if(item.cost?.trim()) {
      if(!/^\d+(?:[.,]\d{1,2})?$/.test(item.cost))throw new Error("Informe um custo unitário válido.");
      unit_cost=Math.round(Number(item.cost.replace(",","."))*100)/100;
      if(unit_cost>999999.99)throw new Error("Custo acima do limite.");
    }
    const rawStoreValue=item.storeValue?.trim()||"0";
    if(!/^\d+(?:[.,]\d{1,2})?$/.test(rawStoreValue))throw new Error("Informe um valor da loja válido.");
    const store_value=Math.round(Number(rawStoreValue.replace(",","."))*100)/100;
    if(store_value>unit_price)throw new Error("O valor da loja não pode superar o preço do chaveiro.");
    return {id:item.id,style,unit_price,quantity,unit_cost,store_value};
  });
}
export function totals(items:ConsignmentItem[]) {
  return items.reduce((total,item)=>({
    quantity:total.quantity+item.quantity,
    cents:total.cents+Math.round(item.unit_price*100)*item.quantity,
  }),{quantity:0,cents:0});
}
