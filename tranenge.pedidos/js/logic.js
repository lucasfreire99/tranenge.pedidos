/* Lógica pura (sem DOM): leitura de mensagens, totais, texto do WhatsApp,
   relatório e backup. Tudo exposto em window.Rancho.logic. */
(function(R){
'use strict';

const MEALS=[{id:'cafe',nome:'Café da manhã'},{id:'almoco',nome:'Almoço'},{id:'jantar',nome:'Jantar'}];
const MEAL_TITLE={cafe:'CAFÉ DA MANHÃ',almoco:'ALMOÇO',jantar:'JANTAR'};
const WEEK=['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const pad2=n=>String(n).padStart(2,'0');
let uidN=0;
function uid(){ uidN++; return Math.random().toString(36).slice(2,7)+uidN.toString(36)+Date.now().toString(36).slice(-3); }
function strip(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }
function titleCase(s){ return String(s).toLowerCase().replace(/(^|\s)(\S)/g,(m,a,b)=>a+b.toUpperCase()); }
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stable(v){
  if(Array.isArray(v)) return '['+v.map(stable).join(',')+']';
  if(v&&typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function isoAdd(iso,n){ const [y,m,d]=iso.split('-').map(Number); const dt=new Date(y,m-1,d+n); return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate()); }
function weekdayOf(iso){ const [y,m,d]=iso.split('-').map(Number); return WEEK[new Date(y,m-1,d).getDay()]; }
function fmtBR(iso){ const p=iso.split('-'); return p[2]+'/'+p[1]; }

/* ---------- normalização ---------- */
function normConfig(d){
  d=d||{};
  const c={empresas:Array.isArray(d.empresas)?d.empresas:[],alojamentos:Array.isArray(d.alojamentos)?d.alojamentos:[],frentes:Array.isArray(d.frentes)?d.frentes:[],contarAcerto:d.contarAcerto!==false};
  c.alojamentos.forEach(a=>{ a.id=a.id||uid(); a.nome=a.nome||''; a.endereco=a.endereco||''; a.cidade=a.cidade||''; a.padrao=Object.assign({cafe:0,almoco:0,jantar:0},a.padrao||{}); });
  c.frentes.forEach(f=>{ f.id=f.id||uid(); f.tipo=f.tipo||'ALMOÇO OBRA RODOVIA'; f.ponto=f.ponto||''; f.responsavel=f.responsavel||''; f.linhas=Array.isArray(f.linhas)?f.linhas:[]; f.acertos=Array.isArray(f.acertos)?f.acertos:[]; });
  return c;
}
function normDay(d,iso){
  const out={date:(d&&d.date)||iso};
  MEALS.forEach(m=>{
    const o=d&&d[m.id]; if(!o) return;
    const n={aloj:Array.isArray(o.aloj)?o.aloj:[],frentes:Array.isArray(o.frentes)?o.frentes:[]};
    n.frentes.forEach(f=>{ f.linhas=Array.isArray(f.linhas)?f.linhas:[]; f.acertos=Array.isArray(f.acertos)?f.acertos:[]; });
    out[m.id]=n;
  });
  return out;
}

/* ---------- leitura de mensagens do WhatsApp ---------- */
function parseFrente(line){
  const canteiro=/CANTEIRO/i.test(line), rodovia=/RODOVIA/i.test(line);
  const km=line.match(/KM\s*(\d+)/i), resp=line.match(/\(([^)]+)\)/);
  const tipo=canteiro?'ALMOÇO CANTEIRO DE OBRAS':rodovia?'ALMOÇO OBRA RODOVIA':line.split(/\s+-\s+|\(/)[0].trim().toUpperCase();
  return {tipo,ponto:km?'KM'+km[1]:'',responsavel:resp?resp[1].trim().toUpperCase():'',linhas:[],acertos:[]};
}
function parseBlocks(text,year){
  const out=[]; let cur=null, city='', frente=null, inAloj=false;
  const headRe=/^\*?\s*(CAF[ÉE] DA MANH[ÃA]|ALMO[ÇC]O|JANTAR)\s*-\s*(\d{1,2})\/(\d{1,2})(?:\s*-\s*[^*]*)?\*?$/i;
  const frenteRe=/^ALMO[ÇC]O\s+(CANTEIRO\b.*|OBR\s?A\b.*)$/i;
  const alojRe=/^(ALOJ\s+\S+)\s*-\s*(.+)\s+-\s*(\d+)\s*MARMITAS?\s*$/i;
  const itemRe=/^(\d+)\s*-\s*(.+)$/;
  const acertoRe=/^(.+?)\s*\(\s*ACERTO DIRETO\s*\)\s*$/i;
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  for(const raw of lines){
    const line=raw.replace(/ /g,' ').trim();
    if(!line) continue;
    let m=line.match(headRe);
    if(m){
      const k=strip(m[1]).toUpperCase();
      const meal=k.startsWith('CAFE')?'cafe':k.startsWith('ALMOCO')?'almoco':'jantar';
      cur={meal,iso:year+'-'+pad2(m[3])+'-'+pad2(m[2]),aloj:[],frentes:[]};
      out.push(cur); city=''; frente=null; inAloj=true; continue;
    }
    if(!cur) continue;
    if(/^\*?\s*TOTAL\b/i.test(line)) continue;
    if((m=line.match(alojRe))){ cur.aloj.push({nome:m[1].toUpperCase().replace(/\s+/g,' '),endereco:m[2].trim(),cidade:city,qtd:+m[3]}); frente=null; continue; }
    if((m=line.match(frenteRe))){ frente=parseFrente(line); cur.frentes.push(frente); inAloj=false; continue; }
    if(/^ALOJAMENTOS?$/i.test(line)){ inAloj=true; frente=null; continue; }
    if((m=line.match(/^\*([^*]+)\*$/))){ city=m[1].trim(); frente=null; continue; }
    if(frente){
      if((m=line.match(acertoRe))){ frente.acertos.push(m[1].trim().toUpperCase()); continue; }
      if((m=line.match(itemRe))){ frente.linhas.push({empresa:m[2].trim(),qtd:+m[1]}); continue; }
    }
    if(inAloj && !/\d/.test(line) && !/ - /.test(line)){ city=line; frente=null; continue; }
  }
  return out;
}
function mergeParsed(cfg,blocks){
  const c=normConfig(JSON.parse(JSON.stringify(cfg||{})));
  const findA=n=>c.alojamentos.find(a=>a.nome.toUpperCase()===String(n).toUpperCase());
  const findF=(t,p)=>c.frentes.find(f=>f.tipo===t&&f.ponto===p);
  const cityCanon=name=>{ if(!name) return 'Sem cidade'; const k=strip(name).toUpperCase(); const hit=c.alojamentos.find(a=>strip(a.cidade).toUpperCase()===k); return hit?hit.cidade:titleCase(name); };
  for(const b of blocks){
    for(const a of b.aloj){
      let x=findA(a.nome);
      if(!x){ x={id:uid(),nome:a.nome,endereco:a.endereco,cidade:cityCanon(a.cidade),padrao:{cafe:0,almoco:0,jantar:0}}; c.alojamentos.push(x); }
      x.padrao[b.meal]=a.qtd;
    }
    for(const f of b.frentes){
      let x=findF(f.tipo,f.ponto);
      if(!x){ x={id:uid(),tipo:f.tipo,ponto:f.ponto,responsavel:f.responsavel,linhas:[],acertos:[]}; c.frentes.push(x); }
      if(f.responsavel) x.responsavel=f.responsavel;
      x.linhas=f.linhas.map(l=>({empresa:l.empresa,qtd:l.qtd}));
      x.acertos=f.acertos.slice();
      f.linhas.forEach(l=>{ if(!c.empresas.includes(l.empresa)) c.empresas.push(l.empresa); });
    }
  }
  const pedidos=blocks.map(b=>{
    const aloj=c.alojamentos.map(a=>{ const hit=b.aloj.find(z=>z.nome.toUpperCase()===a.nome.toUpperCase()); return {id:a.id,nome:a.nome,endereco:a.endereco,cidade:a.cidade,qtd:hit?hit.qtd:0}; });
    const frentes=b.meal==='almoco'?c.frentes.map(f=>{
      const hit=b.frentes.find(z=>z.tipo===f.tipo&&z.ponto===f.ponto);
      const linhas=(hit?hit.linhas:f.linhas.map(l=>({empresa:l.empresa,qtd:0}))).map(l=>({empresa:l.empresa,qtd:l.qtd}));
      return {id:f.id,tipo:f.tipo,ponto:f.ponto,responsavel:(hit&&hit.responsavel)||f.responsavel,linhas,acertos:hit?hit.acertos.slice():[]};
    }):[];
    return {iso:b.iso,meal:b.meal,order:{aloj,frentes}};
  });
  return {config:c,pedidos};
}

/* ---------- totais e texto ---------- */
function orderTotal(o,meal,contarAcerto){
  let n=0;
  ((o&&o.aloj)||[]).forEach(a=>{ n+=(+a.qtd)||0; });
  if(meal==='almoco') ((o&&o.frentes)||[]).forEach(f=>{ (f.linhas||[]).forEach(l=>{ n+=(+l.qtd)||0; }); if(contarAcerto) n+=(f.acertos||[]).length; });
  return n;
}
function marm(n){ return pad2(n)+(n===1?' MARMITA':' MARMITAS'); }
function groupCities(aloj){
  const order=[],map={};
  aloj.forEach(a=>{ if(!(+a.qtd>0)) return; const c=a.cidade||'Sem cidade'; if(!map[c]){ map[c]=[]; order.push(c); } map[c].push(a); });
  return order.map(c=>({cidade:c,itens:map[c]}));
}
function formatMessage(o,meal,iso,contarAcerto){
  const p=iso.split('-');
  const parts=['*'+MEAL_TITLE[meal]+' - '+p[2]+'/'+p[1]+' - '+weekdayOf(iso)+'*'];
  const total=orderTotal(o,meal,contarAcerto);
  const gc=groupCities((o&&o.aloj)||[]);
  if(meal==='almoco'){
    ((o&&o.frentes)||[]).forEach(f=>{
      const linhas=(f.linhas||[]).filter(l=>+l.qtd>0), acertos=f.acertos||[];
      if(!linhas.length&&!acertos.length) return;
      let head=f.tipo; if(f.responsavel) head+=' ('+f.responsavel+')'; if(f.ponto) head+=' - '+f.ponto;
      parts.push([head].concat(linhas.map(l=>pad2(l.qtd)+' - '+l.empresa),acertos.map(n=>n+' (ACERTO DIRETO)')).join('\n'));
    });
    if(gc.length){
      parts.push('ALOJAMENTO');
      gc.forEach(g=>{ parts.push([g.cidade.toUpperCase()].concat(g.itens.map(a=>a.nome+' - '+a.endereco+' - '+marm(+a.qtd))).join('\n')); });
    }
  } else {
    gc.forEach(g=>{ parts.push('*'+g.cidade+'*'); g.itens.forEach(a=>parts.push(a.nome+' - '+a.endereco+' - '+marm(+a.qtd))); });
  }
  parts.push('*TOTAL: '+total+' '+(total===1?'MARMITA':'MARMITAS')+'*');
  return parts.join('\n\n');
}

/* ---------- relatório mensal ---------- */
function monthStats(pedidos,ym,cont){
  const st={days:[],tot:{cafe:0,almoco:0,jantar:0},empresas:{},pontos:{},aloj:{},acertos:0};
  Object.keys(pedidos).filter(k=>k.indexOf(ym)===0).sort().forEach(iso=>{
    const day=pedidos[iso], row={iso,cafe:0,almoco:0,jantar:0};
    MEALS.forEach(m=>{
      const o=day[m.id]; if(!o) return;
      const t=orderTotal(o,m.id,cont); row[m.id]=t; st.tot[m.id]+=t;
      o.aloj.forEach(a=>{ const q=(+a.qtd)||0; if(!q) return; const r=st.aloj[a.nome]||(st.aloj[a.nome]={cafe:0,almoco:0,jantar:0,total:0}); r[m.id]+=q; r.total+=q; });
      (o.frentes||[]).forEach(f=>{
        const key=(f.ponto||String(f.tipo).replace(/^ALMOÇO\s+/,''))+(f.responsavel?' · '+f.responsavel:'');
        let ft=0;
        f.linhas.forEach(l=>{ const q=(+l.qtd)||0; if(!q) return; ft+=q; st.empresas[l.empresa]=(st.empresas[l.empresa]||0)+q; });
        st.acertos+=f.acertos.length; if(cont) ft+=f.acertos.length;
        if(ft) st.pontos[key]=(st.pontos[key]||0)+ft;
      });
    });
    row.total=row.cafe+row.almoco+row.jantar; st.days.push(row);
  });
  return st;
}
function tsvFor(st,t){
  let rows=[];
  const sorted=o=>Object.keys(o).map(k=>[k,o[k]]).sort((a,b)=>b[1]-a[1]);
  if(t==='empresas'){ rows=[['Empresa','Marmitas']].concat(sorted(st.empresas)); if(st.acertos) rows.push(['Acerto direto (pessoas)',st.acertos]); }
  else if(t==='pontos') rows=[['Ponto','Marmitas']].concat(sorted(st.pontos));
  else if(t==='aloj') rows=[['Alojamento','Café','Almoço','Jantar','Total']].concat(Object.keys(st.aloj).sort().map(n=>{ const r=st.aloj[n]; return [n,r.cafe,r.almoco,r.jantar,r.total]; }));
  else rows=[['Dia','Café','Almoço','Jantar','Total']].concat(st.days.map(r=>[r.iso,r.cafe,r.almoco,r.jantar,r.total]));
  return rows.map(r=>r.join('\t')).join('\n');
}

/* ---------- backup ---------- */
function makeBackup(config,pedidos){
  return {app:'rancho-pedidos',versao:1,exportadoEm:new Date().toISOString(),config:JSON.parse(JSON.stringify(config)),pedidos:JSON.parse(JSON.stringify(pedidos))};
}
function readBackup(text){
  let d; try{ d=JSON.parse(text); }catch(e){ throw new Error('O arquivo não é um backup válido (o conteúdo não pôde ser lido).'); }
  if(!d||d.app!=='rancho-pedidos'||!d.config||typeof d.pedidos!=='object'||!d.pedidos) throw new Error('Este arquivo não parece um backup do Rancho Pedidos.');
  const config=normConfig(d.config), pedidos={};
  Object.keys(d.pedidos).forEach(iso=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(iso)) pedidos[iso]=normDay(d.pedidos[iso],iso); });
  return {config,pedidos,exportadoEm:d.exportadoEm||''};
}

R.logic={MEALS,MEAL_TITLE,WEEK,MESES,pad2,uid,strip,titleCase,esc,stable,todayISO,isoAdd,weekdayOf,fmtBR,normConfig,normDay,parseBlocks,mergeParsed,orderTotal,formatMessage,monthStats,tsvFor,makeBackup,readBackup};
})(window.Rancho=window.Rancho||{});
