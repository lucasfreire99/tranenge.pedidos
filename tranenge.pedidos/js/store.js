/* Estado do app, pedidos do dia e persistência.
   Com o recurso db (dentro do Claude) os dados ficam no banco da página e uma
   cópia vai para o localStorage. Sem db (fora do Claude) usa só o localStorage. */
(function(R){
'use strict';
const L=R.logic, U=R.util;

const S={
  view:'pedido', date:L.todayISO(), meal:'cafe', month:L.todayISO().slice(0,7),
  config:L.normConfig({}), pedidos:{}, loaded:false, storage:'local', save:'idle',
  impOpen:false, sheet:null, pendingBackup:null, pendingBackupErr:'', exportText:''
};
const draft={};
const timers={}, busy={}, lastSer={};
let db=null, chain=Promise.resolve();

/* ---------- pedidos ---------- */
function buildDefault(meal){
  const aloj=S.config.alojamentos.map(a=>({id:a.id,nome:a.nome,endereco:a.endereco,cidade:a.cidade,qtd:(+(a.padrao||{})[meal])||0}));
  const frentes=meal==='almoco'?S.config.frentes.map(f=>({id:f.id,tipo:f.tipo,ponto:f.ponto,responsavel:f.responsavel,linhas:f.linhas.map(l=>({empresa:l.empresa,qtd:(+l.qtd)||0})),acertos:(f.acertos||[]).slice()})):[];
  return {aloj,frentes};
}
function syncOrder(o,meal){
  S.config.alojamentos.forEach(a=>{ if(!o.aloj.some(x=>x.id===a.id)) o.aloj.push({id:a.id,nome:a.nome,endereco:a.endereco,cidade:a.cidade,qtd:0}); });
  if(meal==='almoco') S.config.frentes.forEach(f=>{ if(!o.frentes.some(x=>x.id===f.id)) o.frentes.push({id:f.id,tipo:f.tipo,ponto:f.ponto,responsavel:f.responsavel,linhas:f.linhas.map(l=>({empresa:l.empresa,qtd:0})),acertos:[]}); });
}
function isSaved(iso,meal){ const d=S.pedidos[iso]; return !!(d&&d[meal]); }
function getOrder(iso,meal){
  const day=S.pedidos[iso]; let o=day&&day[meal];
  if(!o){ const k=iso+'|'+meal; o=draft[k]||(draft[k]=buildDefault(meal)); }
  syncOrder(o,meal); return o;
}
function edit(){
  const iso=S.date, meal=S.meal;
  if(!isSaved(iso,meal)){
    const o=getOrder(iso,meal);
    S.pedidos[iso]=S.pedidos[iso]||{date:iso};
    S.pedidos[iso][meal]=o; delete draft[iso+'|'+meal];
  }
  queueSave(iso);
  return S.pedidos[iso][meal];
}
const contar=()=>S.config.contarAcerto!==false;
function clearDrafts(){ Object.keys(draft).forEach(k=>delete draft[k]); }
function cfgTouched(){ clearDrafts(); queueSave('cfg'); }
function dropDraft(iso,meal){ delete draft[iso+'|'+meal]; }

/* ---------- persistência ---------- */
function paintSave(st){
  S.save=st||S.save;
  const el=document.getElementById('saveStatus'); if(!el) return;
  const t={idle:'',saving:'Salvando…',saved:S.storage==='db'?'Salvo':'Salvo neste aparelho',error:'Não foi possível salvar'}[S.save]||'';
  el.textContent=t; el.classList.toggle('err',S.save==='error');
}
function queueSave(key){
  clearTimeout(timers[key]); paintSave('saving');
  timers[key]=setTimeout(()=>{ delete timers[key]; chain=chain.then(()=>persist(key)).catch(()=>{}); },600);
}
async function persist(key){
  busy[key]=true;
  try{
    const payload=key==='cfg'?S.config:S.pedidos[key];
    if(payload){
      const body=JSON.parse(JSON.stringify(payload));
      if(db&&S.storage==='db') await (key==='cfg'?db.doc('config/main'):db.doc('pedidos/'+key)).set(body);
      else if(!U.ls.set('rancho:'+key,JSON.stringify(body))) throw new Error('local');
      U.ls.set('rancho:'+key,JSON.stringify(body));
      lastSer[key]=L.stable(body);
    }
  }catch(e){
    S.save='error';
    U.toast(e&&e.code==='quota_exceeded'?'Limite de armazenamento atingido. Apague pedidos antigos.':'Não foi possível salvar. Tente de novo.');
  }finally{ delete busy[key]; }
  if(!Object.keys(timers).length&&!Object.keys(busy).length) paintSave(S.save==='error'?'error':'saved');
}
function loadLocal(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i); if(!k||k.indexOf('rancho:')!==0) continue;
      const id=k.slice(7);
      if(id!=='cfg'&&!/^\d{4}-\d{2}-\d{2}$/.test(id)) continue;
      const v=JSON.parse(localStorage.getItem(k));
      if(id==='cfg') S.config=L.normConfig(v); else S.pedidos[id]=L.normDay(v,id);
    }
  }catch(e){}
}
function softRender(){
  const a=document.activeElement, app=document.getElementById('app');
  if(a&&app&&app.contains(a)&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)){ setTimeout(softRender,1200); return; }
  clearDrafts(); R.render();
}
async function init(){
  R.render();
  try{ db=(window.claude&&window.claude.use)?await window.claude.use('db'):null; }catch(e){ db=null; }
  if(!db){ loadLocal(); S.storage='local'; S.loaded=true; R.render(); return; }
  S.storage='db';
  let gotCfg=false,gotPed=false;
  const ready=changed=>{
    if(!S.loaded){ if(gotCfg&&gotPed){ S.loaded=true; R.render(); } }
    else if(changed) softRender();
  };
  const fail=()=>{ gotCfg=gotPed=true; paintSave('error'); ready(false); };
  db.doc('config/main').onSnapshot(snap=>{
    gotCfg=true; let changed=false;
    if(snap.exists){
      const d=JSON.parse(JSON.stringify(snap.data())), ser=L.stable(d);
      if(ser!==lastSer.cfg&&!timers.cfg&&!busy.cfg){ S.config=L.normConfig(d); lastSer.cfg=ser; U.ls.set('rancho:cfg',JSON.stringify(S.config)); changed=true; }
    }
    ready(changed);
  },fail);
  db.collection('pedidos').orderBy('date','desc').limit(400).onSnapshot(snap=>{
    gotPed=true; let changed=false;
    snap.docs.forEach(ds=>{
      const iso=ds.id; if(timers[iso]||busy[iso]) return;
      const d=JSON.parse(JSON.stringify(ds.data())), ser=L.stable(d);
      if(lastSer[iso]===ser) return;
      S.pedidos[iso]=L.normDay(d,iso); lastSer[iso]=ser; U.ls.set('rancho:'+iso,JSON.stringify(S.pedidos[iso])); changed=true;
    });
    ready(changed);
  },fail);
  setTimeout(()=>{ if(!S.loaded){ gotCfg=gotPed=true; ready(false); } },8000);
}

/* restaurar um backup: cadastros do arquivo e pedidos das mesmas datas */
function applyBackup(bk){
  S.config=bk.config; clearDrafts(); queueSave('cfg');
  Object.keys(bk.pedidos).forEach(iso=>{ S.pedidos[iso]=bk.pedidos[iso]; queueSave(iso); });
}

R.S=S;
R.store={getOrder,edit,isSaved,contar,clearDrafts,cfgTouched,dropDraft,queueSave,paintSave,init,applyBackup};
})(window.Rancho=window.Rancho||{});
