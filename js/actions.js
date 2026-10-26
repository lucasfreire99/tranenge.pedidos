/* Ações: cliques, digitação e teclado. Cada botão tem um data-act que aponta
   para uma função em handlers. */
(function(R){
'use strict';
const L=R.logic, U=R.util, S=R.S, ST=R.store, V=R.views;
const {pad2,isoAdd,fmtBR,formatMessage,uid}=L;
const {$,toast,confirmTwice,copyText,setPath}=U;
const {getOrder,edit,isSaved,contar,clearDrafts,cfgTouched,queueSave,dropDraft}=ST;
const render=()=>R.render();

function setQty(inp,v){
  const o=edit(), d=inp.dataset;
  if(d.qty==='a') o.aloj[+d.i].qtd=v; else o.frentes[+d.fi].linhas[+d.li].qtd=v;
  const row=inp.closest('.row'); if(row) row.classList.toggle('zero',v===0);
  V.updateDerived();
}
function frenteBy(scope,fi){ return scope==='cfg'?S.config.frentes[fi]:edit().frentes[fi]; }
function impPreview(){
  const ta=$('#impText'), sum=$('#impSummary'), btn=$('#impBtn'); if(!ta) return;
  const blocks=L.parseBlocks(ta.value,+S.date.slice(0,4));
  if(!blocks.length){ sum.textContent=ta.value.trim()?'Não encontrei um pedido. O texto precisa começar com o título, como "CAFÉ DA MANHÃ - 23/10".':'Nada para importar ainda.'; btn.disabled=true; return; }
  const aloj=new Set(),fr=new Set(),emp=new Set();
  blocks.forEach(b=>{ b.aloj.forEach(a=>aloj.add(a.nome)); b.frentes.forEach(f=>{ fr.add(f.tipo+f.ponto); f.linhas.forEach(l=>emp.add(l.empresa)); }); });
  const mn={cafe:'Café',almoco:'Almoço',jantar:'Jantar'};
  sum.textContent='Pedidos: '+blocks.map(b=>mn[b.meal]+' '+fmtBR(b.iso)).join(', ')+'. '+aloj.size+' alojamentos, '+fr.size+' pontos de almoço, '+emp.size+' empresas.';
  btn.disabled=false;
}

const handlers={
  view(t){ S.view=t.dataset.v; render(); window.scrollTo(0,0); },
  day(t){ S.date=isoAdd(S.date,+t.dataset.d); render(); },
  today(){ S.date=L.todayISO(); render(); },
  meal(t){ S.meal=t.dataset.m; render(); },
  step(t){
    const inp=t.parentElement.querySelector('input');
    const v=Math.max(0,Math.min(9999,(parseInt(inp.value,10)||0)+(+t.dataset.d)));
    inp.value=v; setQty(inp,v);
  },
  rmLine(t){ const o=edit(); o.frentes[+t.dataset.fi].linhas.splice(+t.dataset.li,1); render(); },
  addAcerto(t){
    const id='ac-'+t.dataset.scope+'-'+t.dataset.fi;
    const inp=document.getElementById(id); const name=(inp.value||'').trim().toUpperCase(); if(!name) return;
    const f=frenteBy(t.dataset.scope,+t.dataset.fi); f.acertos.push(name);
    if(t.dataset.scope==='cfg') cfgTouched();
    render(); const n=document.getElementById(id); if(n) n.focus();
  },
  rmAcerto(t){
    const f=frenteBy(t.dataset.scope,+t.dataset.fi); f.acertos.splice(+t.dataset.ai,1);
    if(t.dataset.scope==='cfg') cfgTouched();
    render();
  },
  async copy(){
    const text=formatMessage(getOrder(S.date,S.meal),S.meal,S.date,contar());
    edit();
    const ok=await copyText(text);
    if(ok) toast('Mensagem copiada');
    else {
      const b=$('#bubble');
      if(b){ b.innerHTML='<textarea readonly aria-label="Texto da mensagem"></textarea>'; const ta=$('textarea',b); ta.value=text; ta.focus(); ta.select(); }
      toast('Texto selecionado. Use Ctrl+C ou toque e segure para copiar.');
    }
    if(ok) V.updateDerived();
  },
  repeat(t){
    const prev=Object.keys(S.pedidos).filter(k=>k<S.date&&S.pedidos[k][S.meal]).sort().pop();
    if(!prev){ toast('Ainda não há pedido anterior desta refeição.'); return; }
    if(isSaved(S.date,S.meal)&&!confirmTwice(t,'repeat')) return;
    S.pedidos[S.date]=S.pedidos[S.date]||{date:S.date};
    S.pedidos[S.date][S.meal]=JSON.parse(JSON.stringify(S.pedidos[prev][S.meal]));
    dropDraft(S.date,S.meal); queueSave(S.date); render(); toast('Copiado do pedido de '+fmtBR(prev));
  },
  reset(t){
    if(!isSaved(S.date,S.meal)){ toast('Este pedido já está com os padrões.'); return; }
    if(!confirmTwice(t,'reset')) return;
    delete S.pedidos[S.date][S.meal]; dropDraft(S.date,S.meal); queueSave(S.date); render(); toast('Padrões do cadastro restaurados.');
  },
  addAloj(){
    const last=S.config.alojamentos[S.config.alojamentos.length-1];
    S.config.alojamentos.push({id:uid(),nome:'ALOJ NOVO',endereco:'',cidade:last?last.cidade:'',padrao:{cafe:0,almoco:0,jantar:0}});
    cfgTouched(); render();
    const n=document.getElementById('a-n-'+(S.config.alojamentos.length-1)); if(n){ n.focus(); n.select(); n.scrollIntoView({block:'center'}); }
  },
  rmAloj(t){ if(!confirmTwice(t,'rmAloj'+t.dataset.i)) return; S.config.alojamentos.splice(+t.dataset.i,1); cfgTouched(); render(); },
  addFrente(){
    S.config.frentes.push({id:uid(),tipo:'ALMOÇO OBRA RODOVIA',ponto:'',responsavel:'',linhas:[],acertos:[]});
    cfgTouched(); render();
    const n=document.getElementById('f-p-'+(S.config.frentes.length-1)); if(n){ n.focus(); n.scrollIntoView({block:'center'}); }
  },
  rmFrente(t){ if(!confirmTwice(t,'rmFrente'+t.dataset.fi)) return; S.config.frentes.splice(+t.dataset.fi,1); cfgTouched(); render(); },
  addLinhaCfg(t){ S.config.frentes[+t.dataset.fi].linhas.push({empresa:'',qtd:0}); cfgTouched(); render(); },
  rmLinhaCfg(t){ S.config.frentes[+t.dataset.fi].linhas.splice(+t.dataset.li,1); cfgTouched(); render(); },
  addEmpresa(){
    const inp=document.getElementById('empIn'); const n=(inp.value||'').trim().toUpperCase(); if(!n) return;
    if(!S.config.empresas.includes(n)) S.config.empresas.push(n);
    cfgTouched(); render(); const e=document.getElementById('empIn'); if(e) e.focus();
  },
  rmEmpresa(t){ S.config.empresas.splice(+t.dataset.i,1); cfgTouched(); render(); },
  import(){
    const blocks=L.parseBlocks($('#impText').value,+S.date.slice(0,4)); if(!blocks.length) return;
    const r=L.mergeParsed(S.config,blocks); S.config=r.config; clearDrafts(); queueSave('cfg');
    r.pedidos.forEach(p=>{ S.pedidos[p.iso]=S.pedidos[p.iso]||{date:p.iso}; S.pedidos[p.iso][p.meal]=p.order; queueSave(p.iso); });
    S.impOpen=false; render(); toast('Importado: '+r.pedidos.length+' pedido(s) e cadastros atualizados.');
  },
  month(t){ const p=S.month.split('-').map(Number); const d=new Date(p[0],p[1]-1+(+t.dataset.d),1); S.month=d.getFullYear()+'-'+pad2(d.getMonth()+1); render(); },
  async copytsv(t){
    const ok=await copyText(L.tsvFor(L.monthStats(S.pedidos,S.month,contar()),t.dataset.t));
    toast(ok?'Tabela copiada. Cole no Excel ou Planilhas.':'Não foi possível copiar.');
  },
  theme(){ R.theme.toggle(); },
  install(){ R.pwa.install(); },
  doInstall(){ S.sheet=null; render(); R.pwa.install(); },
  closeSheet(t,e){ if(t.dataset.bg&&e.target!==t) return; S.sheet=null; render(); },
  exportBackup(){ R.backup.exportJSON(); },
  applyBackup(t){
    if(!S.pendingBackup) return;
    if(!confirmTwice(t,'applyBackup')) return;
    ST.applyBackup(S.pendingBackup); S.pendingBackup=null; S.pendingBackupErr=''; render(); toast('Backup restaurado.');
  },
  cancelBackup(){ S.pendingBackup=null; S.pendingBackupErr=''; render(); }
};

const $app=document.getElementById('app');
$app.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]'); if(!t||!$app.contains(t)) return;
  const fn=handlers[t.dataset.act]; if(fn) fn(t,e);
});
$app.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.qty){ setQty(el,Math.max(0,Math.min(9999,parseInt(el.value,10)||0))); return; }
  if(el.dataset.cfg!==undefined&&el.type!=='checkbox'){
    setPath(S.config,el.dataset.cfg,el.dataset.num?(Math.max(0,parseInt(el.value,10)||0)):el.value);
    cfgTouched(); return;
  }
  if(el.id==='impText') impPreview();
});
$app.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='dateInput'){ if(/^\d{4}-\d{2}-\d{2}$/.test(el.value)){ S.date=el.value; render(); } return; }
  if(el.id==='bkFile'){ R.backup.pick(el.files&&el.files[0]); return; }
  if(el.dataset.qty){ el.value=String(Math.max(0,Math.min(9999,parseInt(el.value,10)||0))); return; }
  if(el.dataset.act==='addLine'){
    if(!el.value) return;
    const o=edit(), f=o.frentes[+el.dataset.fi];
    if(!f.linhas.some(l=>l.empresa===el.value)) f.linhas.push({empresa:el.value,qtd:0});
    render(); return;
  }
  if(el.dataset.cfg==='contarAcerto'){ S.config.contarAcerto=el.checked; cfgTouched(); }
});
$app.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.dataset.acin){ e.preventDefault(); const p=e.target.dataset.acin.split(':'); handlers.addAcerto({dataset:{scope:p[0],fi:p[1]}}); }
  if(e.key==='Enter'&&e.target.id==='empIn'){ e.preventDefault(); handlers.addEmpresa(); }
});
$app.addEventListener('toggle',e=>{ if(e.target.id==='impBox') S.impOpen=e.target.open; },true);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&S.sheet){ S.sheet=null; render(); } });

R.handlers=handlers;
})(window.Rancho=window.Rancho||{});
