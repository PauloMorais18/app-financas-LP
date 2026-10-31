import {useEffect,useRef,useState} from "react";
import {BarChart,Bar,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer} from "recharts";
import {X} from "lucide-react";
import type {Consignment} from "./model";
import type {StockMovement} from "./activity-model";
import {listStockMovements} from "./service";
import {buildConsignmentSummary} from "./summary-model";
import {money} from "../../utils/format";
type Props={groupId:string;stores:Consignment[];onClose:()=>void};
export default function ConsignmentSummary({groupId,stores,onClose}:Props) {
  const [movements,setMovements]=useState<StockMovement[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[version,setVersion]=useState(0);
  const dialog=useRef<HTMLElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    let active=true;setLoading(true);setError("");
    listStockMovements(groupId).then(rows=>{if(active)setMovements(rows)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Não foi possível carregar o resumo.")}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[groupId,stores,version]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";dialog.current?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")closeRef.current()};
    document.addEventListener("keydown",escape);
    return ()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",escape);previous?.focus()};
  },[]);
  const summary=buildConsignmentSummary(stores,movements);
  const names=(rows:{name:string}[])=>rows.map(row=>row.name).join(", ");
  return <div className="consignment-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="consignment-summary-title" className="card consignment-modal consignment-overview-modal" onKeyDown={event=>{
      if(event.key!=="Tab")return;
      const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)"));
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===event.currentTarget)){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }}>
      <div className="consignment-modal-heading"><div><h2 id="consignment-summary-title">Resumo dos consignados</h2><p>Todas as {stores.length} loja(s) do grupo · todo o histórico registrado.</p></div><button className="icon-button" aria-label="Fechar resumo" onClick={onClose}><X/></button></div>
      {loading?<p role="status">Conferindo vendas e estornos...</p>:error?<div className="notice error" role="alert">{error}<button className="outline" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</button></div>:<>
        <div className="store-activity-summary">
          <div><small>Valor arrecadado em vendas</small><strong>{money.format(summary.overall.revenueCents/100)}</strong></div>
          <div><small>Valor das lojas</small><strong>{money.format(summary.overall.commissionCents/100)}</strong></div>
          <div><small>Sua parte das vendas</small><strong>{money.format((summary.overall.revenueCents-summary.overall.commissionCents)/100)}</strong></div>
          <div><small>Lucro registrado</small><strong>{money.format(summary.overall.profitCents/100)}</strong></div>
          <div><small>Chaveiros vendidos</small><strong>{summary.overall.sold}</strong></div>
          <div><small>Investimento estimado{summary.missingCostQuantity?" · parcial":""}</small><strong>{money.format(summary.investmentCents/100)}</strong></div>
        </div>
        <p className="store-activity-hint">Arrecadado considera as vendas registradas, descontando os estornos; não confirma o repasse das lojas. Investimento estimado = custo dos vendidos + custo do estoque atual. Não inclui o custo de peças retiradas sem venda.</p>
        {summary.missingCostQuantity>0&&<div className="notice" role="status">Falta cadastrar o custo de {summary.missingCostQuantity} chaveiro(s) em estoque. O investimento exibido é parcial.</div>}
        <div className="consignment-highlights">
          <article><small>Empresa que mais vendeu</small><h3>{summary.best.length?names(summary.best):"Ainda sem vendas"}</h3>{summary.best.length>0&&<p>{summary.best[0].sold} chaveiro(s){summary.best.length>1?" por empresa · empate":""}</p>}</article>
          <article><small>Estilo que mais vendeu</small><h3>{summary.bestStyles.length?names(summary.bestStyles):"Ainda sem vendas"}</h3>{summary.bestStyles.length>0&&<p>{summary.bestStyles[0].sold} chaveiro(s){summary.bestStyles.length>1?" por estilo · empate":""}</p>}</article>
          <article><small>Empresa que menos vendeu</small><h3>{summary.least.length?names(summary.least):"Ainda sem vendas"}</h3>{summary.least.length>0&&<p>{summary.least[0].sold} chaveiro(s){summary.least.length>1?" por empresa · empate":""}</p>}</article>
        </div>
        <div className="store-charts">
          <section className="store-chart-panel"><h3>Mais vendidos por empresa · unidades</h3><ResponsiveContainer width="100%" height={240}><BarChart data={summary.companies.slice(0,8)} layout="vertical" margin={{right:18,left:0}}><CartesianGrid horizontal={false} stroke="#edf0f5"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={105} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="sold" name="Vendidos" fill="#2161f5" isAnimationActive={false}/></BarChart></ResponsiveContainer></section>
          <section className="store-chart-panel"><h3>Mais vendidos por estilo · unidades</h3><ResponsiveContainer width="100%" height={240}><BarChart data={summary.styles.slice(0,8)} layout="vertical" margin={{right:18,left:0}}><CartesianGrid horizontal={false} stroke="#edf0f5"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={105} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="sold" name="Vendidos" fill="#0aae5b" isAnimationActive={false}/></BarChart></ResponsiveContainer></section>
        </div>
        <h3 className="store-section-title">Resultados por empresa</h3>
        <div className="consignment-table-scroll"><table className="store-history-table"><thead><tr><th>Empresa</th><th>Vendidos</th><th>Arrecadado</th><th>Lucro</th></tr></thead><tbody>{summary.companies.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.sold}</td><td>{money.format(row.revenueCents/100)}</td><td>{money.format(row.profitCents/100)}</td></tr>)}</tbody></table></div>
        <p className="store-activity-hint">Ranking por quantidade vendida. Estilos com o mesmo nome são agrupados entre lojas. A pesquisa da tela não limita este resumo.</p>
      </>}
    </section>
  </div>;
}
