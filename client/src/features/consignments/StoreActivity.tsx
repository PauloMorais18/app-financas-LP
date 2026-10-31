import {useEffect,useRef,useState,type FormEvent} from "react";
import {BarChart,Bar,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer,Legend} from "recharts";
import {Plus,X,RotateCcw} from "lucide-react";
import {money,dateBR} from "../../utils/format";
import type {Consignment} from "./model";
import {getConsignment,listStockMovements,recordStockMovement,reverseStockMovement} from "./service";
import {stockForecast,financialSummary,kindLabels,localToday,movementQuantity,salePreview,type MovementKind,type StockMovement} from "./activity-model";
type Props={store:Consignment;groupId:string;onChanged:()=>void;notify:(message:string,error?:boolean)=>void;onClose?:()=>void;onManage?:()=>void};
export default function StoreActivity({store:initial,groupId,onChanged,notify,onClose,onManage}:Props) {
  const draftKey="consignment-movement-draft:"+groupId+":"+initial.id;
  const readCache=(key:string)=>{try{return JSON.parse(sessionStorage.getItem(key)||"null")}catch{return null}};
  const cached=useRef(readCache(draftKey)).current;
  const first=initial.consignment_items.find(row=>row.id===cached?.itemId)||initial.consignment_items[0];
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const [store,setStore]=useState(initial),[movements,setMovements]=useState<StockMovement[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[version,setVersion]=useState(0);
  const [kind,setKind]=useState<MovementKind>(cached?.kind||"sale"),[itemId,setItemId]=useState(cached?.itemId||first?.id||""),[quantity,setQuantity]=useState(cached?.quantity||""),[mode,setMode]=useState<"add"|"target">(cached?.mode||"add");
  const [date,setDate]=useState<string>(cached?.date||localToday()),[price,setPrice]=useState<string>(cached?.price??first?.unit_price.toFixed(2).replace(".",",")??""),[fee,setFee]=useState<string>(cached?.fee??(first?.store_value||0).toFixed(2).replace(".",",")),[notes,setNotes]=useState<string>(cached?.notes||""),[busy,setBusy]=useState(false),[formError,setFormError]=useState("");
  const submission=useRef<{signature:string;key:string;stock?:number;quantity?:number}|null>(readCache(draftKey+":action"));
  const lock=useRef(false),dialog=useRef<HTMLElement>(null);
  const item=store.consignment_items.find(row=>row.id===itemId);
  const cost=item?.unit_cost==null?"":item.unit_cost.toFixed(2).replace(".",",");
  useEffect(()=>{
    let active=true;setLoading(true);setError("");
    Promise.all([getConsignment(groupId,initial.id),listStockMovements(groupId,initial.id)]).then(([fresh,history])=>{if(active){
      setStore(fresh);setMovements(history);
      if(submission.current&&history.some(row=>row.id===submission.current?.key)){
        submission.current=null;try{sessionStorage.removeItem(draftKey+":action")}catch{}
        setQuantity("");setNotes("");
      }
    }}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Erro ao carregar histórico.")}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[groupId,initial.id,initial.updated_at,version]);
  useEffect(()=>{
    if(!onClose)return;
    try{sessionStorage.setItem(draftKey,JSON.stringify({kind,itemId,quantity,mode,date,price,cost,fee,notes}))}catch{}
  },[draftKey,kind,itemId,quantity,mode,date,price,cost,fee,notes]);
  const selectItem=(id:string)=>{
    const next=store.consignment_items.find(row=>row.id===id);
    setItemId(id);setQuantity("");setPrice(next?.unit_price.toFixed(2).replace(".",",")||"");
    setFee((next?.store_value||0).toFixed(2).replace(".",","));
  };
  useEffect(()=>{
    if(!closeRef.current)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";dialog.current?.focus();
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!lock.current)closeRef.current?.()};
    document.addEventListener("keydown",close);
    return ()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",close);previous?.focus()};
  },[Boolean(onClose)]);
  const draftNumber=(raw:string)=>{const value=Number(raw.replace(",","."));return Number.isFinite(value)&&value>=0?value:0};
  const forecast=stockForecast(store.consignment_items.map(row=>onClose&&row.id===itemId?{...row,unit_price:draftNumber(price),store_value:draftNumber(fee),unit_cost:cost.trim()?draftNumber(cost):null}:row));
  const monthly=financialSummary(movements).monthly;
  const monthlyData=monthly.length?monthly:[{month:localToday().slice(0,7),revenue:0,profit:0}];
  const summary=financialSummary(movements),reversed=new Set(movements.map(m=>m.reverses_id).filter(Boolean));
  let preview:ReturnType<typeof salePreview>|null=null,delta:number|null=null;
  try{if(item){delta=movementQuantity(kind,quantity,mode,item.quantity);if(kind==="sale")preview=salePreview(delta,price,cost,fee)}}catch{}
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(lock.current||loading||error||!item)return;setFormError("");
    try {
      const intent=JSON.stringify([store.id,item.id,kind,quantity,mode,date,notes,price,cost,fee]);
      const retry=submission.current?.signature===intent&&submission.current.quantity!=null?submission.current:null;
      const count=retry?.quantity??movementQuantity(kind,quantity,mode,item.quantity);
      const values=kind==="sale"?salePreview(count,price,cost,fee):null;
      if(!date||date>localToday())throw new Error("Informe uma data até hoje.");
      lock.current=true;setBusy(true);
      const signature=intent;
      if(!retry)submission.current={signature,key:crypto.randomUUID(),stock:item.quantity,quantity:count};
      try{sessionStorage.setItem(draftKey+":action",JSON.stringify(submission.current))}catch{}
      await recordStockMovement(groupId,store.id,item.id!,kind,count,submission.current!.stock??item.quantity,date,notes,values,submission.current!.key);
      submission.current=null;
      try{sessionStorage.removeItem(draftKey+":action")}catch{}
      setQuantity("");setNotes("");setVersion(value=>value+1);onChanged();notify("Movimentação da loja registrada.");
    }catch(reason){setFormError(reason instanceof Error?reason.message:"Erro ao registrar.")}
    finally{lock.current=false;setBusy(false)}
  };
  const reverse=async(m:StockMovement)=>{
    if(lock.current||loading||error||!window.confirm(`Estornar esta movimentação de ${m.quantity} unidade(s)? O histórico será mantido e o estoque será revertido.`))return;
    lock.current=true;setBusy(true);setFormError("");
    try{await reverseStockMovement(groupId,store.id,m.id);setVersion(v=>v+1);onChanged();notify("Estorno registrado.")}
    catch(reason){setFormError(reason instanceof Error?reason.message:"Erro ao estornar.")}
    finally{lock.current=false;setBusy(false)}
  };
  const content=<>
    {onClose&&<div className="consignment-modal-heading"><div><h2 id="store-activity-title">{store.store_name}</h2><p>Estoque, vendas e reposições da loja.</p></div><button className="icon-button" aria-label="Fechar loja" onClick={onClose} disabled={busy}><X/></button></div>}
    {error&&<div className="notice error" role="alert">{error}<button className="outline" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</button></div>}
    {loading&&<p role="status">Atualizando histórico...</p>}
    <>
      <h3 className="store-section-title">Previsão do estoque atual · {forecast.quantity} chaveiros</h3>
      <div className="store-forecast-summary" aria-live="polite">
        <div><small>Valor total previsto</small><strong>{money.format(forecast.revenueCents/100)}</strong></div>
        <div><small>Valor previsto da loja</small><strong>{money.format(forecast.storeCents/100)}</strong></div>
        <div><small>Seu valor previsto</small><strong>{money.format(forecast.yourCents/100)}</strong></div>
        <div><small>Lucro previsto</small><strong>{forecast.profitCents===null?"Informe o custo":money.format(forecast.profitCents/100)}</strong></div>
      </div>
      <h3 className="store-section-title">Vendas já registradas</h3>
      <div className="store-activity-summary">
        <div><small>Vendidos</small><strong>{summary.sold}</strong></div><div><small>Repostos</small><strong>{summary.restocked}</strong></div>
        <div><small>Faturamento</small><strong>{money.format(summary.revenueCents/100)}</strong></div><div><small>Valor da loja</small><strong>{money.format(summary.commissionCents/100)}</strong></div><div><small>Seu valor</small><strong>{money.format((summary.revenueCents-summary.commissionCents)/100)}</strong></div><div><small>Lucro da consignação</small><strong>{money.format(summary.profitCents/100)}</strong></div>
      </div>
      <p className="store-activity-hint">Seu valor = vendas − valor da loja. Lucro = seu valor − custo de produção. Estoque inicial e reposições não contam como venda.</p>
      <div className="store-charts">
        <section className="store-chart-panel"><h3>Distribuição prevista por estilo</h3><ResponsiveContainer width="100%" height={190}><BarChart data={forecast.styles}><CartesianGrid vertical={false} stroke="#edf0f5"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis width={55}/><Tooltip formatter={(value:number)=>money.format(value)}/><Legend/><Bar dataKey="store" name="Loja" stackId="stock" fill="#ffad4d"/><Bar dataKey="yours" name="Sua parte" stackId="stock" fill="#2161f5"/></BarChart></ResponsiveContainer></section>
        <section className="store-chart-panel"><h3>Vendas e lucro por mês</h3><ResponsiveContainer width="100%" height={190}><BarChart data={monthlyData}><CartesianGrid vertical={false} stroke="#edf0f5"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis width={55}/><Tooltip formatter={(value:number)=>money.format(value)}/><Legend/><Bar dataKey="revenue" name="Vendas" fill="#2161f5"/><Bar dataKey="profit" name="Lucro" fill="#0aae5b"/></BarChart></ResponsiveContainer></section>
      </div>
      {onClose&&<form className="store-movement-form" onSubmit={submit}><h3>Registrar movimentação</h3><fieldset disabled={busy||loading||Boolean(error)}><div className="form-grid">
        <label className="field">Tipo<select value={kind} onChange={e=>{setKind(e.target.value as MovementKind);setQuantity("");setFormError("")}}><option value="sale">Venda</option><option value="restock">Reposição</option><option value="withdrawal">Retirada sem venda</option></select></label>
        <label className="field">Estilo<select value={itemId} onChange={e=>selectItem(e.target.value)} required>{store.consignment_items.map(row=><option value={row.id} key={row.id}>{row.style} · {row.quantity} em estoque</option>)}</select></label>
        {kind==="restock"&&<label className="field">Como informar a reposição<select value={mode} onChange={e=>{setMode(e.target.value as "add"|"target");setQuantity("")}}><option value="add">Quantidade adicionada</option><option value="target">Completar estoque para</option></select></label>}
        <label className="field">{kind==="restock"&&mode==="target"?"Estoque final desejado":"Quantidade"}<input type="number" min="1" max="100000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required/></label>
        <label className="field">Data<input type="date" value={date} max={localToday()} onChange={e=>setDate(e.target.value)} required/></label>
        {kind==="sale"&&<>
          <label className="field">Preço vendido por unidade (R$)<input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} required/></label>
          <label className="field">Valor da loja por chaveiro (R$)<input inputMode="decimal" value={fee} onChange={e=>setFee(e.target.value)} required/><small>Use 0 quando a loja não recebe parte da venda.</small></label>
        </>}
        <label className="field wide">Observações<input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="Ex.: Acerto com a loja em 31/10"/></label>
      </div></fieldset>
      {kind==="sale"&&<p className="store-activity-hint">{item?.unit_cost==null?"Informe o custo unitário em Editar loja para calcular o lucro e registrar a venda.":`Custo unitário do cadastro: ${money.format(item.unit_cost)}`}</p>}
      {delta!==null&&item&&<p className="store-stock-preview">Estoque: <b>{item.quantity}</b> → <b>{kind==="restock"?item.quantity+delta:item.quantity-delta}</b> · {kind==="restock"?`Reposição de ${delta} peça(s)`:`Saída de ${delta} peça(s)`}</p>}
      {preview&&<p className="store-stock-preview">Venda: <b>{money.format(preview.revenue)}</b> · Valor da loja: <b>{money.format(preview.commission)}</b> · Seu valor: <b>{money.format(preview.revenue-preview.commission)}</b> · Lucro: <b>{money.format(preview.profit)}</b></p>}
      {formError&&<div className="notice error" role="alert">{formError}</div>}
      <div className="form-actions"><button className="primary" disabled={busy||loading||Boolean(error)||!item||delta===null||(kind==="sale"&&!preview)}><Plus/>{busy?"Salvando...":"Registrar"}</button></div>
      </form>}
      <div className="store-history-heading"><h3>Histórico da loja</h3>{onManage&&<button className="outline" onClick={onManage}>Registrar movimentação</button>}</div>
      {!movements.length?<p className="store-activity-hint">Nenhuma movimentação registrada.</p>:<div className="consignment-table-scroll"><table className="store-history-table"><thead><tr><th>Data</th><th>Movimentação</th><th>Estilo</th><th>Qtd.</th><th>Estoque</th><th>Venda / lucro</th>{onClose&&<th>Ação</th>}</tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{dateBR(m.occurred_on)}</td><td>{kindLabels[m.kind]}{reversed.has(m.id)&&<small>Estornado</small>}{m.notes&&<small>{m.notes}</small>}</td><td>{m.style}</td><td>{m.stock_delta>0?"+":""}{m.stock_delta}</td><td>{m.stock_before} → {m.stock_after}</td><td>{m.revenue!==0?<>{money.format(m.revenue)}<small>Loja {money.format(m.commission)} · Seu valor {money.format(m.revenue-m.commission)}</small><small>Lucro {money.format(m.profit)}</small></>:"—"}</td>{onClose&&<td>{m.kind!=="opening"&&m.kind!=="reversal"&&!reversed.has(m.id)&&<button className="icon-button" aria-label="Estornar movimentação" title="Estornar" onClick={()=>reverse(m)} disabled={busy||loading||Boolean(error)}><RotateCcw/></button>}</td>}</tr>)}</tbody></table></div>}
    </>
  </>;
  if(!onClose)return <section className="store-activity-inline">{content}</section>;
  return <div className="consignment-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!lock.current)onClose()}}><section ref={dialog} tabIndex={-1} className="card consignment-modal store-activity-modal" role="dialog" aria-modal="true" aria-labelledby="store-activity-title" onKeyDown={e=>{
    if(e.key!=="Tab")return;
    const elements=Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled)")).filter(element=>!element.closest("fieldset:disabled"));
    const first=elements[0],last=elements[elements.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }}>{content}</section></div>;
}
