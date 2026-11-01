import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type Modifier,
} from "@dnd-kit/core";
import { ArrowRight, Box, CalendarDays, CheckCircle2, PackageCheck, Paintbrush, Plus, Printer, RefreshCw, Search, Shapes } from "lucide-react";
import type { Order, ProductionStage } from "../../types";
import { api, errorMessage } from "../../services/api";
import { dateBR } from "../../utils/format";
import "./production.css";

const stages = [
  { id: "modeling", label: "Modelagem", icon: Shapes },
  { id: "printing", label: "Impressão", icon: Printer },
  { id: "painting", label: "Pintura", icon: Paintbrush },
  { id: "delivery", label: "Entrega", icon: PackageCheck },
] as const;
type Props = { groupId: string; orders: Order[]; loading: boolean; error: string; reload: () => void; notify: (message: string, error?: boolean) => void };
const collisionDetection: CollisionDetection = args => args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

function CardContent({ order, number }: { order: Order; number: string }) {
  return <>
    <div className="production-card-top"><span>Pedido #{number}</span>{order.colorName && <span className="production-color">{order.colorName}</span>}</div>
    <h3>{order.title}</h3>
    <p className="production-customer">{order.customer}</p>
    {!!order.productItems?.length && <ul className="production-products">{order.productItems.map(item => <li key={item.productId}><b>{item.quantity}×</b> {item.name}</li>)}</ul>}
    {order.observation && <p className="production-note" title={order.observation}>{order.observation}</p>}
    <div className="production-card-date"><CalendarDays size={13} /><span>Prazo: {dateBR(order.dueDate)}</span></div>
  </>;
}

function DraggableCard({ order, number, busy, move }: { order: Order; number: string; busy: boolean; move: (order: Order, stage: ProductionStage | "complete") => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: order.id, disabled: busy });
  return <article ref={setNodeRef} {...attributes} {...listeners}
    aria-label={`Arrastar pedido ${number}: ${order.title}`}
    aria-disabled={busy}
    className={`production-card production-draggable ${isDragging ? "is-dragging" : ""}`}
    onMouseDown={event => { if (!(event.target as HTMLElement).closest("button,select,input,a,summary,label")) listeners?.onMouseDown?.(event); }}
    onTouchStart={event => { if (!(event.target as HTMLElement).closest("button,select,input,a,summary,label")) listeners?.onTouchStart?.(event); }}
    onKeyDown={event => { if (event.target === event.currentTarget) listeners?.onKeyDown?.(event); }}>
    <CardContent order={order} number={number} />
    <div className="production-card-controls">
      <select aria-label={`Mover pedido ${number} para outra etapa`} value={order.productionStage} disabled={busy} onChange={event => move(order, event.target.value as ProductionStage)}>
        {stages.map(stage => <option value={stage.id} key={stage.id}>{stage.label}</option>)}
      </select>
      <ArrowRight size={13} aria-hidden="true" />
    </div>
    {order.productionStage === "delivery" && <button type="button" className="production-complete-button" disabled={busy} onClick={() => move(order, "complete")}><CheckCircle2 size={15} />Concluir ordem de produção</button>}
  </article>;
}

function Column({ stage, count, children, disabled }: { stage: typeof stages[number]; count: number; children: ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled });
  const Icon = stage.icon;
  return <div ref={setNodeRef} data-production-stage={stage.id} className={`production-column production-column-${stage.id} ${isOver ? "drop-active" : ""}`}>
    <div className="production-lane-heading"><div><Icon size={17} /><h2>{stage.label}</h2></div><span className="production-count">{count}</span></div>
    <div className="production-lane-body">{children}{!count && <div className="production-empty"><Icon size={25} /><strong>Nenhuma ordem nesta etapa</strong><span>Solte um card aqui para mover</span></div>}</div>
    <div className="production-drop-hint" aria-hidden="true">Solte aqui · {stage.label}</div>
  </div>;
}

export default function ProductionBoard({ groupId, orders, loading, error, reload, notify }: Props) {
  const [busy, setBusy] = useState(false), [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Order>>({});
  const lock = useRef(false), workspace = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 7 } }),
    useSensor(KeyboardSensor),
  );
  useEffect(() => { setDragId(null); setSearch(""); setOverrides({}); }, [groupId]);
  useEffect(() => {
    setOverrides(current => {
      const pending = { ...current };
      let changed = false;
      for (const order of orders) {
        if (pending[order.id] && order.updatedAt >= pending[order.id].updatedAt) { delete pending[order.id]; changed = true; }
      }
      return changed ? pending : current;
    });
  }, [orders]);
  const visible = orders.filter(order => order.groupId === groupId).map(order => overrides[order.id] || order);
  const available = visible.filter(order => !order.productionStage && !["delivered", "cancelled"].includes(order.status));
  const active = visible.filter(order => order.productionStage && !["delivered", "cancelled"].includes(order.status));
  const completed = visible.filter(order => order.productionStage && order.status === "delivered");
  const numbers = new Map(visible.map((order, index) => [order.id, String(index + 1).padStart(3, "0")]));
  const dragOrder = active.find(order => order.id === dragId);
  const filtered = available.filter(order => `${order.title} ${order.customer} ${numbers.get(order.id)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const move = async (order: Order, stage: ProductionStage | "complete") => {
    if (lock.current || ["delivered", "cancelled"].includes(order.status) || stage === order.productionStage) return;
    lock.current = true; setBusy(true);
    const optimistic: Order = { ...order, productionStage: stage === "complete" ? order.productionStage : stage, status: stage === "complete" ? "delivered" : stage === "delivery" ? "ready" : "production" };
    setOverrides(current => ({ ...current, [order.id]: optimistic }));
    try {
      const { data } = await api.put<Order>(`/production-orders/${order.id}`, { groupId, stage });
      setOverrides(current => ({ ...current, [order.id]: data }));
      reload();
      notify(stage === "complete" ? "Ordem concluída. Pedido entregue, pago e ganho lançado." : order.productionStage ? "Etapa atualizada." : "Ordem de produção gerada.");
    } catch (reason) {
      setOverrides(current => { const next = { ...current }; delete next[order.id]; return next; });
      notify(errorMessage(reason), true);
    } finally { lock.current = false; setBusy(false); }
  };
  const endDrag = ({ active: dragged, over }: DragEndEvent) => {
    setDragId(null);
    const order = active.find(item => item.id === dragged.id);
    const stage = stages.find(item => item.id === over?.id);
    if (order && stage) void move(order, stage.id);
  };
  const stayInBoard: Modifier = ({ transform, draggingNodeRect }) => {
    const bounds = workspace.current?.getBoundingClientRect();
    if (!bounds || !draggingNodeRect) return transform;
    return { ...transform,
      x: Math.min(Math.max(transform.x, bounds.left - draggingNodeRect.left), Math.max(bounds.left - draggingNodeRect.left, bounds.right - draggingNodeRect.right)),
      y: Math.min(Math.max(transform.y, bounds.top - draggingNodeRect.top), Math.max(bounds.top - draggingNodeRect.top, bounds.bottom - draggingNodeRect.bottom)),
    };
  };
  return <div className="production-page" aria-busy={busy}>
    <div className="production-toolbar">
      <div className="production-stats"><span><b>{available.length}</b> disponíveis</span><span><b>{active.length}</b> em produção</span><span className="production-stat-done"><CheckCircle2 size={14} /><b>{completed.length}</b> concluídas</span></div>
      <button type="button" className="production-refresh" onClick={reload} disabled={busy || loading}><RefreshCw size={15} className={loading ? "production-spinning" : ""} />Atualizar</button>
    </div>
    <p className="production-instructions">Segure qualquer parte do card e arraste para outra coluna. No celular, toque e segure.</p>
    {error && <p role="alert" className="production-error">{error}</p>}
    {loading && !visible.length && <p role="status">Carregando pedidos…</p>}
    <DndContext sensors={sensors} collisionDetection={collisionDetection}
      onDragStart={({ active: dragged }) => setDragId(String(dragged.id))}
      onDragEnd={endDrag} onDragCancel={() => setDragId(null)}
      accessibility={{ screenReaderInstructions: { draggable: "Pressione espaço para segurar o card. Use as setas para mover. Pressione espaço para soltar ou Escape para cancelar." } }}>
      <div ref={workspace} className={`production-workspace ${dragId ? "production-is-dragging" : ""}`}>
        <div className="production-lanes">
          <div className="production-inbox">
            <div className="production-lane-heading"><div><Box size={17} /><h2>Pedidos</h2></div><span className="production-count">{available.length}</span></div>
            <div className="production-inbox-intro">Gere uma ordem para iniciar a produção.</div>
            <label className="production-search"><Search size={15} /><input aria-label="Buscar pedidos disponíveis" placeholder="Buscar pedido ou cliente" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <div className="production-lane-body">{filtered.map(order => <article className="production-card production-inbox-card" key={order.id}>
              <CardContent order={order} number={numbers.get(order.id)!} />
              <button type="button" className="production-generate-button" disabled={busy} onClick={() => move(order, "modeling")}><Plus size={15} />Gerar ordem de produção</button>
            </article>)}
              {!filtered.length && <div className="production-empty"><Box size={25} /><strong>{search ? "Nenhum pedido encontrado" : "Todos os pedidos organizados"}</strong><span>{search ? "Tente outro nome ou cliente." : "Novos pedidos aparecem aqui automaticamente."}</span></div>}
            </div>
          </div>
          {stages.map(stage => <Column key={stage.id} stage={stage} count={active.filter(order => order.productionStage === stage.id).length} disabled={busy}>
            {active.filter(order => order.productionStage === stage.id).map(order => <DraggableCard key={order.id} order={order} number={numbers.get(order.id)!} busy={busy} move={move} />)}
          </Column>)}
        </div>
      </div>
      <DragOverlay modifiers={[stayInBoard]} zIndex={5} dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {dragOrder ? <div className="production-card production-floating-card"><CardContent order={dragOrder} number={numbers.get(dragOrder.id)!} /><span className="production-floating-caption">Solte na etapa desejada</span></div> : null}
      </DragOverlay>
    </DndContext>
    {!!completed.length && <details className="production-completed"><summary><CheckCircle2 size={16} />Ordens concluídas <span>{completed.length}</span></summary><div className="production-completed-list">{completed.map(order => <article className="production-card" key={order.id}><CardContent order={order} number={numbers.get(order.id)!} /><span className="production-completed-badge">Concluída · Pedido entregue</span></article>)}</div></details>}
  </div>;
}
