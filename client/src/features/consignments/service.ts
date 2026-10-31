import {supabase} from "../../services/supabase";
import type {Consignment,ConsignmentItem} from "./model";
function check(error:{code?:string;message?:string}|null) {
  if(!error)return;
  if(error.code==="42703"||error.code==="PGRST204"||error.code==="42P01"||error.code==="PGRST205"||error.code==="PGRST202") throw new Error("O cadastro de consignados ainda não foi habilitado no banco. Solicite a configuração ao responsável.");
  if(error.code==="23503")throw new Error("Esta loja possui histórico e não pode ser excluída. O histórico deve ser preservado.");
  if(error.code==="23505") throw new Error("Já existe uma loja com esse nome no grupo, ou um estilo repetido.");
  throw new Error(error.message||"Não foi possível salvar os consignados.");
}
export async function listConsignments(groupId:string):Promise<Consignment[]> {
  const rows:Consignment[]=[];
  for(;;) {
    const {data,error}=await supabase.from("consignments").select("id,group_id,store_name,updated_at,consignment_items(id,style,unit_price,quantity,unit_cost,store_value)").eq("group_id",groupId).order("store_name").order("id").range(rows.length,rows.length+199);
    check(error);
    if(!data?.length)return rows;
    rows.push(...data.map(row=>({...row,consignment_items:row.consignment_items.map(item=>({...item,unit_price:Number(item.unit_price),unit_cost:item.unit_cost==null?null:Number(item.unit_cost),store_value:Number(item.store_value||0)}))})));
  }
}
export async function saveConsignment(groupId:string,id:string|null,name:string,items:ConsignmentItem[],updatedAt:string|null) {
  const {error}=await supabase.rpc("save_consignment",{
    target_group:groupId,target_id:id,partner_name:name.trim(),styles:items,expected_updated_at:updatedAt,
  });
  check(error);
}
export async function deleteConsignment(groupId:string,id:string) {
  const {data,error}=await supabase.from("consignments").delete().eq("group_id",groupId).eq("id",id).select("id");
  check(error);
  if(!data?.length)throw new Error("Loja não encontrada ou sem permissão para excluir.");
}

import type {MovementKind,StockMovement,salePreview} from "./activity-model";
export async function getConsignment(groupId:string,id:string):Promise<Consignment> {
  const {data,error}=await supabase.from("consignments").select("id,group_id,store_name,updated_at,consignment_items(id,style,unit_price,quantity,unit_cost,store_value)").eq("group_id",groupId).eq("id",id).single();
  check(error);if(!data)throw new Error("Loja não encontrada.");
  return {...data,consignment_items:data.consignment_items.map(item=>({...item,unit_price:Number(item.unit_price),unit_cost:item.unit_cost==null?null:Number(item.unit_cost),store_value:Number(item.store_value||0)}))};
}
export async function listStockMovements(groupId:string,id?:string):Promise<StockMovement[]> {
  const rows:StockMovement[]=[];
  for(;;){
    let query=supabase.from("consignment_movements").select("*,consignments!inner(group_id)").eq("consignments.group_id",groupId);
    if(id)query=query.eq("consignment_id",id);
    const {data,error}=await query.order("occurred_on",{ascending:false}).order("created_at",{ascending:false}).order("id").range(rows.length,rows.length+199);
    check(error);if(!data?.length)return rows;
    rows.push(...data.map(row=>({...row,unit_price:Number(row.unit_price),unit_cost:row.unit_cost==null?null:Number(row.unit_cost),commission:Number(row.commission),revenue:Number(row.revenue),profit:row.profit==null?null:Number(row.profit)})) as StockMovement[]);
  }
}
export async function recordStockMovement(groupId:string,storeId:string,itemId:string,kind:MovementKind,quantity:number,expectedStock:number,date:string,notes:string,values:ReturnType<typeof salePreview>|null,eventKey:string) {
  const {error}=await supabase.rpc("record_consignment_movement",{target_group:groupId,target_store:storeId,target_item:itemId,movement_kind:kind,movement_quantity:quantity,expected_stock:expectedStock,movement_date:date,movement_notes:notes.trim(),sale_price:values?.unitPrice||0,production_cost:values?values.unitCost:null,store_commission:values?.commission||0,event_key:eventKey});
  check(error);
}
export async function reverseStockMovement(groupId:string,storeId:string,movementId:string) {
  const {error}=await supabase.rpc("reverse_consignment_movement",{target_group:groupId,target_store:storeId,target_movement:movementId});check(error);
}
