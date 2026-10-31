import {useEffect,useRef,useState,type FormEvent} from "react";
import {Building2,Package,Pencil,Plus,Trash2,X} from "lucide-react";
import {money} from "../../utils/format";
import {deleteConsignment,listConsignments,saveConsignment} from "./service";
import {newItem,parseItems,totals,type Consignment,type DraftItem} from "./model";
import "./consignments.css";

type Props={groupId:string;notify:(message:string,error?:boolean)=>void};
export default function ConsignmentsPage({groupId,notify}:Props) {
  const [stores,setStores]=useState<Consignment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[reload,setReload]=useState(0);
  const [editor,setEditor]=useState<{store:Consignment|null}|null>(null),[name,setName]=useState(""),[items,setItems]=useState<DraftItem[]>([]);
  const [saving,setSaving]=useState(false),[deleting,setDeleting]=useState(""),[formError,setFormError]=useState("");
  const savingRef=useRef(false);
  useEffect(()=>{
    let active=true;
    if(!groupId){setStores([]);setLoading(false);return;}
    setLoading(true);setError("");
    listConsignments(groupId).then(data=>{if(active)setStores(data)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Não foi possível carregar as lojas.")}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[groupId,reload]);
  useEffect(()=>{
    if(!editor)return;
    const handler=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!savingRef.current)setEditor(null)};
    document.addEventListener("keydown",handler);
    const original=document.body.style.overflow;document.body.style.overflow="hidden";
    return ()=>{document.removeEventListener("keydown",handler);document.body.style.overflow=original};
  },[editor]);
  const open=(store:Consignment|null)=>{
    setName(store?.store_name||"");
    setItems(store?store.consignment_items.map(item=>({key:crypto.randomUUID(),style:item.style,price:item.unit_price.toFixed(2).replace(".",","),quantity:String(item.quantity)})):[newItem()]);
    setFormError("");setEditor({store});
  };
  const update=(key:string,changes:Partial<DraftItem>)=>setItems(current=>current.map(item=>item.key===key?{...item,...changes}:item));
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(!editor||savingRef.current)return;
    setFormError("");
    try {
      if(!groupId)throw new Error("Selecione um grupo.");
      if(!name.trim()||name.trim().length>120)throw new Error("Informe o nome da loja (até 120 caracteres).");
      const values=parseItems(items);
      savingRef.current=true;setSaving(true);
      await saveConsignment(groupId,editor.store?.id||null,name,values,editor.store?.updated_at||null);
      setEditor(null);setReload(current=>current+1);notify("Consignados salvos.");
    } catch(reason){setFormError(reason instanceof Error?reason.message:"Não foi possível salvar.")}
    finally{savingRef.current=false;setSaving(false)}
  };
  const remove=async(store:Consignment)=>{
    if(deleting||!window.confirm(`Excluir a loja “${store.store_name}” e seus estilos consignados?`))return;
    setDeleting(store.id);
    try{await deleteConsignment(groupId,store.id);setReload(current=>current+1);notify("Loja excluída dos consignados.")}
    catch(reason){notify(reason instanceof Error?reason.message:"Não foi possível excluir.",true)}
    finally{setDeleting("")}
  };
  const summary=totals(stores.flatMap(store=>store.consignment_items));
  let draftTotal:number|null=null;
  try{draftTotal=totals(parseItems(items)).cents}catch{}
  return <div className="consignments-page">
    <div className="page-heading"><div><h1>Consignados</h1><p>Chaveiros e estilos em cada loja parceira.</p></div><button className="primary" onClick={()=>open(null)} disabled={!groupId||loading||Boolean(error)}><Plus/>Nova loja parceira</button></div>
    {!groupId?<div className="card consignment-empty">Selecione um grupo para gerenciar os consignados.</div>:<>
      {error?<div className="notice error" role="alert">{error} <button className="outline" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></div>:loading?<div className="card consignment-empty" role="status">Carregando lojas parceiras...</div>:<>
        <section className="consignment-summary" aria-label="Resumo dos consignados">
          <div className="card"><small>Lojas parceiras</small><strong>{stores.length}</strong></div>
          <div className="card"><small>Chaveiros nas lojas</small><strong>{summary.quantity}</strong></div>
          <div className="card"><small>Valor total em consignação</small><strong>{money.format(summary.cents/100)}</strong></div>
        </section>
        {stores.length?<section className="consignment-grid">{stores.map(store=>{
          const total=totals(store.consignment_items);
          return <article className="card consignment-card" key={store.id}>
            <div className="consignment-card-heading"><span className="consignment-store-icon"><Building2/></span><h2>{store.store_name}</h2><div className="consignment-actions"><button className="icon-button" aria-label={`Editar ${store.store_name}`} title="Editar loja" onClick={()=>open(store)} disabled={Boolean(deleting)}><Pencil/></button><button className="icon-button danger" aria-label={`Excluir ${store.store_name}`} title="Excluir loja" onClick={()=>remove(store)} disabled={Boolean(deleting)}><Trash2/></button></div></div>
            <div className="consignment-table-scroll"><table><thead><tr><th>Estilo</th><th>Valor un.</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>{store.consignment_items.map((item,index)=><tr key={item.id||index}><td>{item.style}</td><td>{money.format(item.unit_price)}</td><td>{item.quantity}</td><td>{money.format(Math.round(item.unit_price*100)*item.quantity/100)}</td></tr>)}</tbody></table></div>
            <footer><span><Package/>{total.quantity} chaveiro(s)</span><strong>{money.format(total.cents/100)}</strong></footer>
          </article>;
        })}</section>:<div className="card consignment-empty"><Building2/><h2>Cadastre sua primeira loja parceira</h2><p>Adicione os estilos, os valores e a quantidade de chaveiros deixados em cada loja.</p><button className="primary" onClick={()=>open(null)}><Plus/>Cadastrar loja</button></div>}
      </>}
    </>}
    {editor&&<div className="modal-backdrop consignment-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!savingRef.current)setEditor(null)}}>
      <section className="card consignment-modal" role="dialog" aria-modal="true" aria-labelledby="consignment-editor-title" onKeyDown={event=>{
        if(event.key!=="Tab")return;
        const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }}>
        <div className="consignment-modal-heading"><div><h2 id="consignment-editor-title">{editor.store?"Editar loja parceira":"Nova loja parceira"}</h2><p>Informe os chaveiros disponíveis nesta loja.</p></div><button type="button" className="icon-button" aria-label="Fechar cadastro" onClick={()=>setEditor(null)} disabled={saving}><X/></button></div>
        <form onSubmit={save}>
          <fieldset disabled={saving}>
            <label className="field">Nome da loja parceira<input autoFocus value={name} onChange={event=>setName(event.target.value)} maxLength={120} placeholder="Ex.: Papelaria Central" required/></label>
            <div className="consignment-styles-heading"><h3>Estilos de chaveiro</h3><button className="outline" type="button" onClick={()=>setItems(current=>[...current,newItem()])} disabled={items.length>=100}><Plus/>Adicionar estilo</button></div>
            <div className="consignment-editor-items">{items.map((item,index)=><div className="consignment-editor-item" key={item.key}>
              <label className="field">Estilo {index+1}<input value={item.style} onChange={event=>update(item.key,{style:event.target.value})} placeholder="Ex.: Personagem, nome, logo" maxLength={100} required/></label>
              <label className="field">Valor unitário (R$)<input inputMode="decimal" value={item.price} onChange={event=>update(item.key,{price:event.target.value})} placeholder="12,50" required/></label>
              <label className="field">Quantidade<input type="number" min="0" max="100000" step="1" value={item.quantity} onChange={event=>update(item.key,{quantity:event.target.value})} required/></label>
              <button type="button" className="icon-button danger" aria-label={`Remover estilo ${index+1}`} onClick={()=>setItems(current=>current.filter(value=>value.key!==item.key))} disabled={items.length===1}><Trash2/></button>
            </div>)}</div>
          </fieldset>
          {formError&&<div className="notice error" role="alert">{formError}</div>}
          <div className="consignment-draft-total"><span>Valor em consignação nesta loja</span><strong>{draftTotal===null?"Preencha os estilos":money.format(draftTotal/100)}</strong></div>
          <div className="form-actions"><button className="outline" type="button" onClick={()=>setEditor(null)} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Salvando...":"Salvar loja"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
