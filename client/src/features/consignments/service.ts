import {supabase} from "../../services/supabase";
import type {Consignment,ConsignmentItem} from "./model";
function check(error:{code?:string;message?:string}|null) {
  if(!error)return;
  if(error.code==="42P01"||error.code==="PGRST205"||error.code==="PGRST202") throw new Error("O cadastro de consignados ainda não foi habilitado no banco. Solicite a configuração ao responsável.");
  if(error.code==="23505") throw new Error("Já existe uma loja com esse nome no grupo, ou um estilo repetido.");
  throw new Error(error.message||"Não foi possível salvar os consignados.");
}
export async function listConsignments(groupId:string):Promise<Consignment[]> {
  const rows:Consignment[]=[];
  for(;;) {
    const {data,error}=await supabase.from("consignments").select("id,group_id,store_name,updated_at,consignment_items(id,style,unit_price,quantity)").eq("group_id",groupId).order("store_name").order("id").range(rows.length,rows.length+199);
    check(error);
    if(!data?.length)return rows;
    rows.push(...data.map(row=>({...row,consignment_items:row.consignment_items.map(item=>({...item,unit_price:Number(item.unit_price)}))})));
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
