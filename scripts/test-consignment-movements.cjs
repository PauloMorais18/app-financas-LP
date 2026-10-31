// Usage: node scripts/test-consignment-movements.cjs [path-to-@electric-sql/pglite]
// Runs only against an isolated in-memory database. No .env or production connection.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {PGlite}=require(process.argv[2]||"@electric-sql/pglite");
const ts=require("typescript");
(async()=>{
 const db=await PGlite.create();
 try {
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth; grant usage on schema auth,public to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $f$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $f$;
 create table public.profiles(id uuid primary key);
 create table public.groups(id uuid primary key);
 create table public.group_members(group_id uuid,user_id uuid);
 create function public.is_group_member(target_group uuid) returns boolean
 language sql stable security definer set search_path=public as $f$
 select exists(select 1 from public.group_members where group_id=target_group and user_id=auth.uid()) $f$;
 insert into profiles values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
 insert into groups values('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
 insert into group_members values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
 `);
 await db.exec(fs.readFileSync("migration/20261031_create_consignments.sql","utf8"));
 const group="20000000-0000-0000-0000-000000000001";
 const user="10000000-0000-0000-0000-000000000001";
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 await db.exec("set role authenticated");
 const save=(id,styles,stamp=null)=>db.query("select save_consignment($1,$2,$3,$4::jsonb,$5) as id",[group,id,"Loja de teste",JSON.stringify(styles),stamp]);
 const created=await save(null,[{style:"Geral",unit_price:10,quantity:41}]);
 const store=created.rows[0].id;
 await db.exec("reset role");
 await db.exec(fs.readFileSync("migration/20261031_consignment_movements.sql","utf8"));
 // Reapplying the migration must preserve history and stock.
 await db.exec(fs.readFileSync("migration/20261031_consignment_movements.sql","utf8"));
 await db.exec("set role authenticated");
 const item=(await db.query("select * from consignment_items where consignment_id=$1",[store])).rows[0];
 const history=()=>db.query("select * from consignment_movements where consignment_id=$1 order by created_at",[store]);
 const stock=async()=>Number((await db.query("select quantity from consignment_items where id=$1",[item.id])).rows[0].quantity);
 const fresh=async()=>(await db.query("select * from consignments where id=$1",[store])).rows[0];
 const opening=await history(); assert.equal(opening.rows.length,1);assert.equal(Number(opening.rows[0].revenue),0);assert.equal(opening.rows[0].stock_after,41);
 const movement=(kind,qty,expected,key,price=0,cost=0,fee=0)=>db.query(
 "select record_consignment_movement($1,$2,$3,$4,$5,$6,current_date,'Teste',$7,$8,$9,$10) as id",
 [group,store,item.id,kind,qty,expected,price,cost,fee,key]);
 const saleKey="30000000-0000-0000-0000-000000000001";
 await movement("sale",14,41,saleKey,10,3,14);assert.equal(await stock(),27);
 await movement("sale",14,41,saleKey,10,3,14);assert.equal(await stock(),27);assert.equal((await history()).rows.length,2);
 await assert.rejects(()=>movement("sale",30,27,crypto.randomUUID(),10,3,0),/Estoque insuficiente/);
 await assert.rejects(()=>movement("restock",12,41,crypto.randomUUID()),/Estoque atualizado/);
 const refillKey=crypto.randomUUID();
 await movement("restock",12,27,refillKey);assert.equal(await stock(),39);
 let rows=(await history()).rows;
 const sale=rows.find(r=>r.kind==="sale");assert.equal(Number(sale.revenue),140);assert.equal(Number(sale.profit),84);
 const stamp=(await fresh()).updated_at;
 await save(store,[{id:item.id,style:"Geral novo",unit_price:12,unit_cost:4,quantity:39}],stamp);
 rows=(await history()).rows;
 assert.equal(rows.find(r=>r.id===saleKey).style,"Geral");assert.equal(Number(rows.find(r=>r.id===saleKey).unit_price),10);
 await assert.rejects(async()=>save(store,[{id:item.id,style:"Geral novo",unit_price:12,quantity:38}],(await fresh()).updated_at),/Use as movimentacoes/);
 await assert.rejects(async()=>save(store,[{style:"Outro",unit_price:1,quantity:0}],(await fresh()).updated_at),/nao podem ser apagados/);
 await assert.rejects(()=>db.query("update consignment_items set quantity=100 where id=$1",[item.id]),/permission denied/);
 await assert.rejects(()=>db.query("delete from consignment_movements where consignment_id=$1",[store]),/permission denied/);
 await assert.rejects(()=>db.query("delete from consignments where id=$1",[store]),/foreign key constraint/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",["10000000-0000-0000-0000-000000000002"]);
 assert.equal((await history()).rows.length,0);
 await assert.rejects(()=>movement("restock",1,39,crypto.randomUUID()),/Sem permissao/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 const reverse=key=>db.query("select reverse_consignment_movement($1,$2,$3)",[group,store,key]);
 await reverse(saleKey);assert.equal(await stock(),53);
 await reverse(saleKey);assert.equal(await stock(),53);
 await reverse(refillKey);assert.equal(await stock(),41);
 await movement("withdrawal",3,41,crypto.randomUUID());assert.equal(await stock(),38);
 // Typescript calculations agree with the database history.
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync("client/src/features/consignments/activity-model.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function("module","exports",code)(module,module.exports);
 const {financialSummary,movementQuantity,salePreview}=module.exports;
 const mapped=(await history()).rows.map(row=>({...row,unit_price:Number(row.unit_price),unit_cost:Number(row.unit_cost),commission:Number(row.commission),revenue:Number(row.revenue),profit:Number(row.profit),occurred_on:String(row.occurred_on).slice(0,10)}));
 const totals=financialSummary(mapped);assert.equal(totals.revenueCents,0);assert.equal(totals.profitCents,0);assert.equal(totals.sold,0);assert.equal(totals.restocked,0);
 assert.equal(movementQuantity("restock","39","target",27),12);
 assert.throws(()=>movementQuantity("sale","28","add",27));
 assert.throws(()=>salePreview(14,"10","","0"));
 assert.equal(salePreview(14,"10","3","1").profit,84);
 assert.equal(salePreview(14,"10","3","1").profit,84);
 assert.equal(salePreview(14,"10","3","3").commission,42);
 assert.equal(salePreview(14,"10","3","3").profit,56);
 assert.equal(salePreview(14,"10","3","0").revenue-salePreview(14,"10","3","0").commission,140);
 await save(store,[{id:item.id,style:"Geral novo",unit_price:10,unit_cost:3,store_value:3,quantity:38}],(await fresh()).updated_at);
 assert.equal(Number((await db.query("select store_value from consignment_items where id=$1",[item.id])).rows[0].store_value),3);
 await movement("sale",14,38,crypto.randomUUID(),10,3,42);
 const lastSale=(await history()).rows.filter(row=>row.kind==="sale").at(-1);
 assert.equal(Number(lastSale.commission),42);assert.equal(Number(lastSale.profit),56);
 console.log("PASS: migration reaplicavel, saldo inicial, venda 41->27, reposicao 27->39, lucro, idempotencia, estoque insuficiente, conflito de edicao, snapshots, RLS por grupo, historico protegido e estornos.");
 }finally{await db.close()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
