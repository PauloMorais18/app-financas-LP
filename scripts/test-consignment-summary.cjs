const fs=require("node:fs"),ts=require("typescript"),assert=require("node:assert/strict");
const cache={};
function load(name){if(cache[name])return cache[name];const result={exports:{}};const code=ts.transpileModule(fs.readFileSync("client/src/features/consignments/"+name+".ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function("module","exports","require",code)(result,result.exports,path=>load(path.replace("./","")));cache[name]=result.exports;return result.exports;}
const {buildConsignmentSummary,normalizeCompanySearch}=load("summary-model");
const stores=[{id:"a",store_name:"Águia",consignment_items:[{id:"ia",style:"Geral",unit_price:10,unit_cost:3,quantity:27}]},{id:"b",store_name:"Loja B",consignment_items:[{id:"ib",style:"geral",unit_price:10,unit_cost:2,quantity:1}]},{id:"c",store_name:"Loja C",consignment_items:[{id:"ic",style:"Nome",unit_price:10,unit_cost:null,quantity:5}]}];
const sale=(id,store,item,style,q,cost,fee)=>({id,consignment_id:store,item_id:item,style,kind:"sale",quantity:q,unit_cost:cost,revenue:q*10,commission:q*fee,profit:q*(10-cost-fee),occurred_on:"2026-10-31"});
const a=sale("ma","a","ia","Geral",14,3,3),b=sale("mb","b","ib","geral",6,2,0),b2=sale("mb2","b","ib","geral",4,2,0),reverse={...b,id:"reversed",kind:"reversal",revenue:-b.revenue,commission:-b.commission,profit:-b.profit,reverses_id:b.id};
const report=buildConsignmentSummary(stores,[a,b,b2,reverse,sale("outsider","outside","ix","Nome",999,0,0)]);
assert.equal(report.overall.sold,18);assert.equal(report.overall.revenueCents,18000);assert.equal(report.overall.profitCents,8800);assert.equal(report.overall.commissionCents,4200);
assert.deepEqual(report.best.map(r=>r.id),["a"]);assert.deepEqual(report.least.map(r=>r.id),["c"]);assert.equal(report.bestStyles[0].sold,18);
assert.equal(report.missingCostQuantity,5);assert.equal(report.investmentCents,13300);assert.equal(normalizeCompanySearch("  ÁGUIA  "),"aguia");
assert.deepEqual(buildConsignmentSummary(stores,[]).best,[]);assert.deepEqual(buildConsignmentSummary([],[]).companies,[]);
const tied=buildConsignmentSummary(stores,[sale("ma","a","ia","Geral",4,3,0),b2]);assert.equal(tied.best.length,2);
console.log("PASS: rankings, empates, lojas sem vendas, estilos agrupados, estornos, isolamento por grupo e investimento parcial.");
