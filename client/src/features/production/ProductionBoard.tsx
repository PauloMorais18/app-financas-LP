import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripVertical, CheckCircle2, Plus } from "lucide-react";
import type { Order, ProductionStage } from "../../types";
import { api, errorMessage } from "../../services/api";
import { dateBR } from "../../utils/format";
import "./production.css";

const stages: { id: ProductionStage; label: string }[] = [
  { id: "modeling", label: "Modelagem" }, { id: "printing", label: "Impressão" },
  { id: "painting", label: "Pintura" }, { id: "delivery", label: "Entrega" },
];
type Props = { groupId: string; orders: Order[]; loading: boolean; error: string; reload: () => void; notify: (message: string, error?: boolean) => void };
export default function ProductionBoard({ groupId, orders, loading, error, reload, notify }: Props) {
  const [busy, setBusy] = useState(false), [search, setSearch] = useState("");
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => { setDrag(null); setOver(null); setSearch(""); }, [groupId]);
  orders = orders.filter(order => order.groupId === groupId);
  const available = orders.filter(order => !order.productionStage && !["delivered", "cancelled"].includes(order.status));
  const active = orders.filter(order => order.productionStage && !["delivered", "cancelled"].includes(order.status));
  const completed = orders.filter(order => order.productionStage && order.status === "delivered");
  const numbers = new Map(orders.map((order, index) => [order.id, String(index + 1).padStart(3, "0")]));
  const move = async (order: Order, stage: ProductionStage | "complete") => {
    if (lock.current || order.status === "delivered" || order.status === "cancelled") return;
    if (stage === order.productionStage) return;
    lock.current = true; setBusy(true);
    try {
      await api.put(`/production-orders/${order.id}`, { groupId, stage });
      reload();
      notify(stage === "complete" ? "Ordem concluída. Pedido entregue, pago e ganho lançado." : order.productionStage ? "Etapa atualizada." : "Ordem de produção gerada.");
    } catch (reason) { notify(errorMessage(reason), true); }
    finally { lock.current = false; setBusy(false); }
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    setDrag({ id: drag.id, x: event.clientX, y: event.clientY });
    setOver(document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-production-stage]")?.dataset.productionStage || null);
  };
  const pointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const stage = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-production-stage]")?.dataset.productionStage;
    const order = orders.find(item => item.id === drag?.id);
    setDrag(null); setOver(null);
    if (order && stages.some(item => item.id === stage)) void move(order, stage as ProductionStage);
  };
  const details = (order: Order) => <>
    <small>Pedido #{numbers.get(order.id)}</small><h3>{order.title}</h3><p>{order.customer}</p>
    <small>Prazo: {dateBR(order.dueDate)}</small>
    {order.colorName && <small>Cor: {order.colorName}</small>}
    {!!order.productItems?.length && <ul>{order.productItems.map(item => <li key={item.productId}>{item.quantity} × {item.name}</li>)}</ul>}
    {order.observation && <p className="production-note">{order.observation}</p>}
  </>;
  return <div className="production-page" aria-busy={busy}>
    <div className="production-summary"><span>{available.length} pedidos disponíveis</span><span>{active.length} em produção</span><span>{completed.length} concluídas</span><button type="button" className="outline" onClick={reload} disabled={busy || loading}>Atualizar</button></div>
    {error && <p role="alert" className="production-error">{error}</p>}
    {loading && !orders.length && <p role="status">Carregando pedidos…</p>}
    <div className="production-workspace">
      <aside className="production-inbox"><header><h2>Pedidos</h2><span>{available.length}</span></header>
        <input aria-label="Buscar pedidos disponíveis" placeholder="Buscar pedido ou cliente" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="production-stack">{available.filter(order => `${order.title} ${order.customer}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(order => <article className="production-card" key={order.id}>
          {details(order)}<button type="button" className="primary" disabled={busy} onClick={() => move(order, "modeling")}><Plus size={16} />Gerar ordem de produção</button>
        </article>)}</div>
        {!available.length && <p className="production-empty">Novos pedidos aparecem aqui automaticamente.</p>}
      </aside>
      <section className="production-columns" aria-label="Quadro de produção">
        {stages.map(stage => <section key={stage.id} data-production-stage={stage.id} className={`production-column ${over === stage.id ? "drop-active" : ""}`}>
          <header><h2>{stage.label}</h2><span>{active.filter(order => order.productionStage === stage.id).length}</span></header>
          <div className="production-stack">{active.filter(order => order.productionStage === stage.id).map(order => <article key={order.id} className={`production-card ${drag?.id === order.id ? "is-dragging" : ""}`}>
            <button type="button" className="production-grip" aria-label={`Segure para arrastar ${order.title}`} disabled={busy}
              onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: order.id, x: event.clientX, y: event.clientY }); }}
              onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={() => { setDrag(null); setOver(null); }}><GripVertical size={18} />Segure e arraste</button>
            {details(order)}
            <label className="production-stage-label">Etapa<select aria-label={`Etapa de ${order.title}`} value={order.productionStage} disabled={busy} onChange={event => move(order, event.target.value as ProductionStage)}>{stages.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            {stage.id === "delivery" && <button type="button" className="primary" disabled={busy} onClick={() => move(order, "complete")}><CheckCircle2 size={16} />Concluir ordem de produção</button>}
          </article>)}</div>
          {!active.some(order => order.productionStage === stage.id) && <p className="production-empty">Arraste uma ordem para cá</p>}
        </section>)}
      </section>
    </div>
    {!!completed.length && <details className="production-completed"><summary>Ordens concluídas ({completed.length})</summary><div className="production-completed-list">{completed.map(order => <article className="production-card" key={order.id}>{details(order)}<span>Concluída · Pedido entregue</span></article>)}</div></details>}
    {drag && <div className="production-drag-preview" style={{ left: drag.x + 12, top: drag.y + 12 }}>{orders.find(order => order.id === drag.id)?.title}</div>}
  </div>;
}
