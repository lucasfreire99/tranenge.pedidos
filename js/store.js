/* Estado do app, pedidos do dia e persistência. Três modos de gravação:
   - cloud: login + Supabase (quando js/config.js está preenchido, fora do Claude)
   - db: banco da página, dentro do Claude
   - local: só neste aparelho (localStorage) */
(function(R){
'use strict';
const L=R.logic, U=R.util;

const S={
  view:'pedido', date:L.todayISO(), meal:'cafe', month:L.todayISO().slice(0,7),
  config:L.normConfig({}), pedidos:{}, loaded:false, storage:'local', save:'idle',
  impOpen:false, sheet:null, pendingBackup:null, pendingBackupErr:'', exportText:'',
  auth:null
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
  const t={idle:'',saving:'Salvando…',saved:S.storage==='local'?'Salvo neste aparelho':'Salvo',error:'Não foi possível salvar'}[S.save]||'';
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
      if(S.storage==='cloud'){
        await R.cloud.save(key,body);
      } else {
        if(db&&S.storage==='db') await (key==='cfg'?db.doc('config/main'):db.doc('pedidos/'+key)).set(body);
        if(!U.ls.set('rancho:'+key,JSON.stringify(body))&&S.storage==='local') throw new Error('local');
      }
      lastSer[key]=L.stable(body);
    }
  }catch(e){
    S.save='error';
    const code=e&&e.code;
    U.toast(code==='quota_exceeded'?'Limite de armazenamento atingido. Apague pedidos antigos.':S.storage==='cloud'?R.cloud.errText(e):'Não foi possível salvar. Tente de novo.');
  }finally{ delete busy[key]; }
  if(!Object.keys(timers).length&&!Object.keys(busy).length) paintSave(S.save==='error'?'error':'saved');
}
/* grava já o que estiver pendente (usado antes de sair da conta) */
async function flush(){
  const keys=Object.keys(timers);
  keys.forEach(k=>{ clearTimeout(timers[k]); delete timers[k]; });
  for(const k of keys){ await persist(k); }
  await chain;
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

/* ---------- modo nuvem: login e dados da empresa ---------- */
function teardown(){
  R.cloud.unsubscribe();
  Object.keys(timers).forEach(k=>{ clearTimeout(timers[k]); delete timers[k]; });
  Object.keys(lastSer).forEach(k=>delete lastSer[k]);
  S.config=L.normConfig({}); S.pedidos={}; clearDrafts();
  S.loaded=false; S.view='pedido'; S.pendingBackup=null; S.pendingBackupErr=''; S.exportText=''; S.sheet=null;
  R.cloud.empresa=''; R.cloud.papel=''; R.cloud.empresaNome=''; R.cloud.team=[]; R.cloud.convites=[];
}
function handleAuth(event,session){
  const a=S.auth;
  if(event==='PASSWORD_RECOVERY'){ a.status='recovery'; a.err=''; a.msg=''; R.render(); return; }
  if(event==='SIGNED_OUT'||!session){
    if(a.status==='recovery') return;
    teardown(); a.status='out'; R.render(); return;
  }
  if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED') return;
  if(a.status==='in'||a.status==='entering'||a.status==='recovery') return;
  enterApp();
}
async function enterApp(){
  const a=S.auth; a.status='entering'; a.err=''; S.loaded=false; R.render();
  try{
    await R.cloud.loadTenant();
    if(!R.cloud.empresa){ a.status='noaccess'; R.render(); return; }
    const d=await R.cloud.loadAll();
    await R.cloud.loadTeam();
    S.config=L.normConfig(d.config); lastSer.cfg=L.stable(d.config);
    S.pedidos={};
    d.pedidos.forEach(p=>{ S.pedidos[p.data]=L.normDay(p.dados,p.data); lastSer[p.data]=L.stable(p.dados); });
    a.status='in'; S.loaded=true; S.view='pedido'; S.date=L.todayISO(); S.month=S.date.slice(0,7);
    R.cloud.subscribe(onRemote);
    R.render();
  }catch(e){ a.status='error'; a.err=R.cloud.errText(e); R.render(); }
}
function onRemote(table,type,row){
  if(!row) return;
  if(table==='config'){
    if(type==='DELETE') return;
    const ser=L.stable(row.dados);
    if(ser===lastSer.cfg||timers.cfg||busy.cfg) return;
    S.config=L.normConfig(row.dados); lastSer.cfg=ser; softRender(); return;
  }
  const iso=row.data; if(!iso) return;
  if(type==='DELETE'){ if(!timers[iso]&&!busy[iso]){ delete S.pedidos[iso]; delete lastSer[iso]; softRender(); } return; }
  const ser=L.stable(row.dados);
  if(ser===lastSer[iso]||timers[iso]||busy[iso]) return;
  S.pedidos[iso]=L.normDay(row.dados,iso); lastSer[iso]=ser; softRender();
}
/* ao voltar para a aba, confere se outro aparelho mudou algo */
async function refreshRemote(){
  if(Object.keys(timers).length||Object.keys(busy).length) return;
  try{
    const d=await R.cloud.loadAll(); let changed=false;
    const cs=L.stable(d.config);
    if(cs!==lastSer.cfg){ S.config=L.normConfig(d.config); lastSer.cfg=cs; changed=true; }
    d.pedidos.forEach(p=>{ const s=L.stable(p.dados); if(lastSer[p.data]!==s){ S.pedidos[p.data]=L.normDay(p.dados,p.data); lastSer[p.data]=s; changed=true; } });
    if(changed) softRender();
  }catch(e){}
}
async function initCloud(){
  S.storage='cloud';
  S.auth={status:R.cloud.recoveryLink?'recovery':'loading',mode:'login',msg:'',err:''};
  R.render();
  R.cloud.onAuth(handleAuth);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&S.auth&&S.auth.status==='in') refreshRemote(); });
  setTimeout(async()=>{
    if(S.auth.status!=='loading') return;
    try{ const s=await R.cloud.session(); handleAuth(s?'SIGNED_IN':'SIGNED_OUT',s); }catch(e){ S.auth.status='out'; R.render(); }
  },4000);
}

/* ---------- início ---------- */
async function init(){
  if(R.cloud&&R.cloud.enabled) return initCloud();
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
R.store={getOrder,edit,isSaved,contar,clearDrafts,cfgTouched,dropDraft,queueSave,paintSave,init,applyBackup,flush,enterApp};
})(window.Rancho=window.Rancho||{});
