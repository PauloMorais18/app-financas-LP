import {useEffect,useRef,useState,type FormEvent} from "react";
import {Building2,Package,Pencil,Plus,Trash2,X,Search,BarChart3} from "lucide-react";
import {money} from "../../utils/format";
import {deleteConsignment,listConsignments,saveConsignment} from "./service";
import {newItem,parseItems,totals,type Consignment,type DraftItem} from "./model";
import "./consignments.css";
import StoreActivity from "./StoreActivity";
import ConsignmentSummary from "./ConsignmentSummary";
import {normalizeCompanySearch} from "./summary-model";
import {stockForecast} from "./activity-model";

type Props={groupId:string;notify:(message:string,error?:boolean)=>void};
export default function ConsignmentsPage({groupId,notify}:Props) {
  const [stores,setStores]=useState<Consignment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[reload,setReload]=useState(0);
  const [editor,setEditor]=useState<{store:Consignment|null}|null>(null),[name,setName]=useState(""),[items,setItems]=useState<DraftItem[]>([]);
  const [saving,setSaving]=useState(false),[deleting,setDeleting]=useState(""),[formError,setFormError]=useState("");
  const [expanded,setExpanded]=useState<string[]>([]),[activityId,setActivityId]=useState("");
  const [search,setSearch]=useState(""),[showSummary,setShowSummary]=useState(false);
  const savingRef=useRef(false);
  useEffect(()=>{
    let active=true;
    if(!groupId){setStores([]);setLoading(false);return;}
    if(!stores.length)setLoading(true);setError("");
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
  useEffect(()=>{
    if(!editor)return;
    try{sessionStorage.setItem("consignment-editor:"+groupId+":"+(editor.store?.id||"new"),JSON.stringify({store:editor.store,name,items}))}catch{}
  },[editor,groupId,name,items]);
  const open=(store:Consignment|null)=>{
    try{
      const saved=JSON.parse(sessionStorage.getItem("consignment-editor:"+groupId+":"+(store?.id||"new"))||"null");
      if(saved&&Array.isArray(saved.items)&&saved.items.length){setName(saved.name);setItems(saved.items);setEditor({store:saved.store});setFormError("");return}
    }catch{}
    setName(store?.store_name||"");
    setItems(store?store.consignment_items.map(item=>({key:crypto.randomUUID(),id:item.id,style:item.style,price:item.unit_price.toFixed(2).replace(".",","),quantity:String(item.quantity),cost:item.unit_cost==null?"":item.unit_cost.toFixed(2).replace(".",","),storeValue:(item.store_value||0).toFixed(2).replace(".",",")})):[newItem()]);
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
      try{sessionStorage.removeItem("consignment-editor:"+groupId+":"+(editor.store?.id||"new"))}catch{}
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
  const draftForecast=stockForecast(items.map(item=>({style:item.style||"Estilo",quantity:Math.max(0,Number(item.quantity)||0),unit_price:Math.max(0,Number(item.price.replace(",","."))||0),store_value:Math.max(0,Number((item.storeValue||"0").replace(",","."))||0),unit_cost:item.cost?.trim()?Math.max(0,Number(item.cost.replace(",","."))||0):null})));
  const summary=totals(stores.flatMap(store=>store.consignment_items));
  let draftTotal:number|null=null;
  try{draftTotal=totals(parseItems(items)).cents}catch{}
  const visibleStores=stores.filter(store=>normalizeCompanySearch(store.store_name).includes(normalizeCompanySearch(search)));
  const renderStore=(store:Consignment)=>{

          const total=totals(store.consignment_items);
          return <article className="card consignment-card" key={store.id} data-store-id={store.id} style={{order:visibleStores.indexOf(store)}}>
            <div className="consignment-card-heading"><span className="consignment-store-icon"><Building2/></span><h2>{store.store_name}</h2><div className="consignment-actions"><button className="icon-button" aria-label={`Editar ${store.store_name}`} title="Editar loja" onClick={()=>open(store)} disabled={Boolean(deleting)}><Pencil/></button><button className="icon-button danger" aria-label={`Excluir ${store.store_name}`} title="Excluir loja" onClick={()=>remove(store)} disabled={Boolean(deleting)}><Trash2/></button></div></div>
            <div className="consignment-table-scroll"><table><thead><tr><th>Estilo</th><th>Valor un.</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>{store.consignment_items.map((item,index)=><tr key={item.id||index}><td>{item.style}</td><td>{money.format(item.unit_price)}</td><td>{item.quantity}</td><td>{money.format(Math.round(item.unit_price*100)*item.quantity/100)}</td></tr>)}</tbody></table></div>
            <footer><span><Package/>{total.quantity} chaveiro(s)</span><strong>{money.format(total.cents/100)}</strong></footer>
            <div className="store-card-controls"><button className="outline" aria-expanded={expanded.includes(store.id)} onClick={()=>setExpanded(current=>current.includes(store.id)?current.filter(id=>id!==store.id):[...current,store.id])}>{expanded.includes(store.id)?"Recolher histórico":"Expandir histórico"}</button><button className="primary" onClick={()=>setActivityId(store.id)}>Movimentações da loja</button></div>
            {expanded.includes(store.id)&&<StoreActivity store={store} groupId={groupId} onChanged={()=>setReload(v=>v+1)} notify={notify} onManage={()=>setActivityId(store.id)}/>}
          </article>;

  };
  return <div className="consignments-page">
    <div className="page-heading"><div><h1>Consignados</h1><p>Chaveiros e estilos em cada loja parceira.</p></div><div className="consignment-heading-actions"><button className="outline" onClick={()=>setShowSummary(true)} disabled={!groupId||loading||Boolean(error)}><BarChart3/>Ver resumo</button><button className="primary" onClick={()=>open(null)} disabled={!groupId||loading||Boolean(error)}><Plus/>Nova loja parceira</button></div></div>
    {!groupId?<div className="card consignment-empty">Selecione um grupo para gerenciar os consignados.</div>:<>
      {error?<div className="notice error" role="alert">{error} <button className="outline" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></div>:loading?<div className="card consignment-empty" role="status">Carregando lojas parceiras...</div>:<>
        <section className="consignment-summary" aria-label="Resumo dos consignados">
          <div className="card"><small>Lojas parceiras</small><strong>{stores.length}</strong></div>
          <div className="card"><small>Chaveiros nas lojas</small><strong>{summary.quantity}</strong></div>
          <div className="card"><small>Valor total em consignação</small><strong>{money.format(summary.cents/100)}</strong></div>
        </section>
        <div className="consignment-search"><label htmlFor="consignment-company-search"><Search/>Pesquisar empresa</label><div><input id="consignment-company-search" type="search" placeholder="Digite o nome da loja parceira" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button className="icon-button" aria-label="Limpar pesquisa" onClick={()=>setSearch("")}><X/></button>}</div><small role="status">{visibleStores.length} de {stores.length} empresa(s)</small></div>
        {stores.length?<>{visibleStores.length?<section className="consignment-grid consignment-columns">{[0,1].map(column=><div className="consignment-column" key={column}>{visibleStores.filter((_,index)=>index%2===column).map(renderStore)}</div>)}</section>:<div className="card consignment-empty"><Search/><h2>Nenhuma empresa encontrada</h2><p>Tente outro nome ou limpe a pesquisa.</p><button className="outline" onClick={()=>setSearch("")}>Limpar pesquisa</button></div>}</>:<div className="card consignment-empty"><Building2/><h2>Cadastre sua primeira loja parceira</h2><p>Adicione os estilos, os valores e a quantidade de chaveiros deixados em cada loja.</p><button className="primary" onClick={()=>open(null)}><Plus/>Cadastrar loja</button></div>}
      </>}
    </>}
    {showSummary&&<ConsignmentSummary groupId={groupId} stores={stores} onClose={()=>setShowSummary(false)}/>}
    {activityId&&stores.find(store=>store.id===activityId)&&<StoreActivity store={stores.find(store=>store.id===activityId)!} groupId={groupId} onChanged={()=>setReload(v=>v+1)} notify={notify} onClose={()=>setActivityId("")}/>}
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
              <label className="field">{item.id?"Estoque atual (use movimentações)":"Quantidade inicial"}<input readOnly={Boolean(item.id)} type="number" min="0" max="100000" step="1" value={item.quantity} onChange={event=>update(item.key,{quantity:event.target.value})} required/></label>
              <label className="field">Custo unitário (R$, opcional)<input inputMode="decimal" value={item.cost||""} onChange={event=>update(item.key,{cost:event.target.value})} placeholder="Custo de produção"/></label>
              <label className="field">Valor da loja por chaveiro (R$)<input inputMode="decimal" value={item.storeValue??"0"} onChange={event=>update(item.key,{storeValue:event.target.value})} placeholder="0,00"/></label>
              <button type="button" className="icon-button danger" aria-label={`Remover estilo ${index+1}`} onClick={()=>setItems(current=>current.filter(value=>value.key!==item.key))} disabled={items.length===1||Boolean(item.id)}><Trash2/></button>
              <div className="consignment-draft-breakdown" aria-live="polite"><span>Valor do estoque: <b>{money.format((Number(item.quantity)||0)*(Number(item.price.replace(",","."))||0))}</b></span><span>Loja: <b>{money.format((Number(item.quantity)||0)*(Number((item.storeValue||"0").replace(",","."))||0))}</b></span><span>Sua parte: <b>{money.format((Number(item.quantity)||0)*((Number(item.price.replace(",","."))||0)-(Number((item.storeValue||"0").replace(",","."))||0)))}</b></span></div>
            </div>)}</div>
          </fieldset>
          {formError&&<div className="notice error" role="alert">{formError}</div>}
          <div className="consignment-draft-breakdown"><span>Loja (previsto): <b>{money.format(draftForecast.storeCents/100)}</b></span><span>Sua parte (previsto): <b>{money.format(draftForecast.yourCents/100)}</b></span><span>Lucro previsto: <b>{draftForecast.profitCents===null?"Informe o custo":money.format(draftForecast.profitCents/100)}</b></span></div>
          <div className="consignment-draft-total"><span>Valor em consignação nesta loja</span><strong>{draftTotal===null?"Preencha os estilos":money.format(draftTotal/100)}</strong></div>
          <div className="form-actions"><button className="outline" type="button" onClick={()=>setEditor(null)} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Salvando...":"Salvar loja"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
