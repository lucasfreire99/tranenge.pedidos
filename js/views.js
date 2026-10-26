/* Telas: monta o HTML de cada seção e atualiza totais e prévia ao vivo. */
(function(R){
'use strict';
const L=R.logic, U=R.util, S=R.S, ST=R.store;
const {MEALS,MESES,pad2,esc,weekdayOf,fmtBR,orderTotal,formatMessage}=L;
const {$,$$,setText}=U;
const {getOrder,isSaved,contar}=ST;

/* ---------- peças ---------- */
function brandSub(){ const C=R.cloud; return C&&C.enabled&&C.empresaNome?C.empresaNome:'pedidos de marmita'; }
function whoHTML(){
  const C=R.cloud; if(!C||!C.enabled) return '';
  return '<span class="who" title="'+esc(C.email)+'">'+esc(C.email)+(C.papel==='operador'?' · operador':'')+'</span><button class="btn sm ghost" data-act="logout">Sair</button>';
}
function headerHTML(){
  const tabs=[['pedido','Pedido do dia'],['cadastros','Cadastros'],['relatorio','Relatório']];
  return '<header class="top"><div class="brand"><span class="brand-name">Rancho</span><span class="brand-sub">'+esc(brandSub())+'</span></div>'
    +'<nav class="tabs" aria-label="Seções">'+tabs.map(t=>'<button class="tab" data-act="view" data-v="'+t[0]+'"'+(S.view===t[0]?' aria-current="page"':'')+'>'+t[1]+'</button>').join('')+'</nav>'
    +'<span class="spacer"></span><div class="hbtns"><span class="save" id="saveStatus"></span>'+whoHTML()
    +(R.pwa.canShow()?'<button class="btn sm ghost" data-act="install">Instalar app</button>':'')
    +'<button class="iconbtn" data-act="theme" aria-label="Alternar tema" title="'+(R.theme.effective()==='dark'?'Mudar para tema claro':'Mudar para tema escuro')+'">'+R.theme.icon()+'</button></div></header>';
}
function stepperHTML(da,qtd){
  return '<div class="stepper"><button type="button" data-act="step" data-d="-1" aria-label="Diminuir">−</button>'
    +'<input type="number" inputmode="numeric" min="0" max="9999" value="'+((+qtd)||0)+'" '+da+' aria-label="Quantidade">'
    +'<button type="button" data-act="step" data-d="1" aria-label="Aumentar">+</button></div>';
}
function rowHTML(attrs,nome,sub,qtd,extra,stKey){
  const da=Object.keys(attrs).map(k=>'data-'+k+'="'+attrs[k]+'"').join(' ');
  return '<li class="row'+((+qtd)===0?' zero':'')+'"><div class="rname"><b>'+esc(nome)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'')+(stKey?'<span class="st" data-st="'+stKey+'"></span>':'')+'</div><div class="rctl">'+(stKey?'<button type="button" class="btn sm sendbtn" data-act="mark" data-key="'+stKey+'"></button>':'')+stepperHTML(da,qtd)+(extra||'')+'</div></li>';
}
function acertosHTML(list,fi,scope){
  return '<div class="acertos"><span class="lbl">Acerto direto</span><div class="chips">'
    +list.map((n,ai)=>'<span class="chip">'+esc(n)+'<button type="button" data-act="rmAcerto" data-scope="'+scope+'" data-fi="'+fi+'" data-ai="'+ai+'" aria-label="Remover '+esc(n)+'">×</button></span>').join('')
    +'</div><span class="acerto-add"><input type="text" id="ac-'+scope+'-'+fi+'" placeholder="Nome" aria-label="Nome para acerto direto" data-acin="'+scope+':'+fi+'"><button class="btn sm" type="button" data-act="addAcerto" data-scope="'+scope+'" data-fi="'+fi+'">Adicionar</button></span></div>';
}
function alojGroupsHTML(o){
  const cities=[];
  o.aloj.forEach((a,i)=>{ const c=a.cidade||'Sem cidade'; let g=cities.find(x=>x.c===c); if(!g){ g={c,items:[]}; cities.push(g); } g.items.push([a,i]); });
  return cities.map(g=>'<section class="group"><div class="group-h"><h3>'+esc(g.c)+'</h3><span class="sub"></span></div><ul class="rows">'
    +g.items.map(x=>rowHTML({qty:'a',i:x[1]},x[0].nome,x[0].endereco,x[0].qtd,'','a:'+x[0].id)).join('')+'</ul></section>').join('');
}
function frenteHTML(f,fi){
  const opts=S.config.empresas.filter(e=>!f.linhas.some(l=>l.empresa===e)).map(e=>'<option value="'+esc(e)+'">'+esc(e)+'</option>').join('');
  return '<article class="front" data-fi="'+fi+'"><div class="front-h"><span class="kmplate">'+esc(f.ponto||'Canteiro')+'</span>'
    +'<div class="front-t"><b>'+esc(f.tipo.replace(/^ALMOÇO\s+/,''))+'</b>'+(f.responsavel?'<span>Resp.: '+esc(f.responsavel)+'</span>':'')+'<span class="st" data-st="f:'+f.id+'"></span></div><button type="button" class="btn sm sendbtn" data-act="mark" data-key="f:'+f.id+'"></button><span class="front-total" data-ft></span></div>'
    +'<ul class="rows">'+f.linhas.map((l,li)=>rowHTML({qty:'l',fi:fi,li:li},l.empresa,'',l.qtd,'<button type="button" class="btn icon sm ghost" data-act="rmLine" data-fi="'+fi+'" data-li="'+li+'" aria-label="Remover '+esc(l.empresa)+'">×</button>')).join('')+'</ul>'
    +'<div class="front-add"><select data-act="addLine" data-fi="'+fi+'" aria-label="Adicionar empresa"><option value="">+ Adicionar empresa</option>'+opts+'</select></div>'
    +acertosHTML(f.acertos,fi,'day')+'</article>';
}

/* ---------- pedido do dia ---------- */
function pedidoHTML(){
  const c=S.config, empty=!c.alojamentos.length&&!c.frentes.length;
  const p=S.date.split('-');
  const toolbar='<div class="toolbar"><div class="datebox">'
    +'<button class="btn icon" data-act="day" data-d="-1" aria-label="Dia anterior">‹</button>'
    +'<div class="sign"><span>'+weekdayOf(S.date)+'</span><b>'+p[2]+'/'+p[1]+'</b></div>'
    +'<button class="btn icon" data-act="day" data-d="1" aria-label="Próximo dia">›</button>'
    +'<input type="date" id="dateInput" value="'+S.date+'" aria-label="Escolher data"><button class="btn ghost sm" data-act="today">Hoje</button></div>'
    +'<div class="seg" role="group" aria-label="Refeição">'+MEALS.map(m=>'<button data-act="meal" data-m="'+m.id+'" aria-pressed="'+(S.meal===m.id)+'"><i class="dot" data-dot="'+m.id+'"></i>'+m.nome+'<span class="n" data-seg-n="'+m.id+'"></span></button>').join('')+'</div></div>';
  if(empty){
    return toolbar+'<div class="empty"><h3>Nenhum cadastro ainda</h3><p>Importe uma mensagem que você já envia ou cadastre os alojamentos e pontos de obra.</p><button class="btn primary" data-act="view" data-v="cadastros">Ir para Cadastros</button></div>';
  }
  const o=getOrder(S.date,S.meal), saved=isSaved(S.date,S.meal);
  let editor='<div class="note"><span class="pill '+(saved?'ok':'draft')+'" id="statePill">'+(saved?'Salvo':'Rascunho')+'</span>'
    +'<span id="stateText">'+(saved?'Pedido deste dia.':'Quantidades padrão do cadastro. Salva ao editar ou copiar.')+'</span><span class="spacer"></span>'
    +'<button class="btn sm" data-act="repeat">Repetir último pedido</button><button class="btn sm ghost" data-act="reset">Voltar aos padrões</button></div>';
  editor+='<div class="sendbar" id="sendBar"><span class="pill draft" id="sendPill"></span><span id="sendText"></span><span class="spacer"></span><button class="btn sm" data-act="sent" id="sentBtn">Marcar todos</button><button class="btn sm ghost" data-act="unsent" id="unsentBtn" hidden>Desmarcar todos</button></div>';
  if(S.meal==='almoco'){
    if(o.frentes.length) editor+='<h2 class="sect">Frentes de obra</h2>'+o.frentes.map(frenteHTML).join('');
    if(o.aloj.length) editor+='<h2 class="sect">Alojamentos</h2>';
  }
  editor+=alojGroupsHTML(o);
  const aside='<aside class="preview"><div class="pv-head"><h2>Mensagem</h2><div class="pv-total"><b id="pvTotal">0</b><span id="pvUnit">marmitas</span></div></div>'
    +'<div class="chat"><div class="bubble" id="bubble" tabindex="0" aria-label="Prévia da mensagem"></div></div>'
    +'<div class="pv-actions"><button class="btn primary" data-act="copy">Copiar mensagem</button><a class="btn" id="waLink" href="#" target="_blank" rel="noopener">Abrir no WhatsApp</a></div>'
    +'<p class="hint">Ao copiar, o pedido do dia fica salvo no histórico. O envio de cada local você marca à mão.'+(S.storage==='local'?' Você não está conectado: os dados ficam só neste aparelho.':'')+'</p></aside>';
  return toolbar+'<div class="grid"><div class="editor">'+editor+'</div>'+aside+'</div>';
}
function dockHTML(){
  return '<div class="dock"><div class="t"><b id="dockTotal">0</b><span>marmitas</span></div><button class="btn primary" data-act="copy">Copiar mensagem</button></div>';
}

/* ---------- cadastros ---------- */
function backupHTML(){
  const last=R.backup.lastBackup();
  let lastTxt='Ainda não foi feito nenhum backup neste aparelho.';
  if(last){ const d=new Date(last); lastTxt='Último backup feito neste aparelho: '+pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear()+' às '+pad2(d.getHours())+':'+pad2(d.getMinutes())+'.'; }
  let h='<section class="card"><h2>Backup</h2><p class="muted">Baixe uma cópia dos cadastros e de todos os pedidos salvos, ou restaure a partir de um arquivo.</p>'
    +'<div class="add-row"><button class="btn primary" data-act="exportBackup">Exportar backup</button>'
    +'<label class="btn filebtn">Restaurar de arquivo<input type="file" class="sr-only" id="bkFile" accept=".json,application/json"></label></div>'
    +'<p class="hint" style="margin-top:10px">'+lastTxt+'</p>';
  if(S.pendingBackupErr) h+='<div class="bk-sum">'+esc(S.pendingBackupErr)+'</div>';
  if(S.pendingBackup){
    const b=S.pendingBackup; let when='';
    if(b.exportadoEm){ const d=new Date(b.exportadoEm); if(!isNaN(d)) when='Exportado em '+pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear()+'. '; }
    h+='<div class="bk-sum"><b>Arquivo lido.</b> '+when+'Contém '+b.config.alojamentos.length+' alojamentos, '+b.config.frentes.length+' frentes de obra e '+Object.keys(b.pedidos).length+' dias de pedidos. Restaurar troca os cadastros atuais e os pedidos das mesmas datas; os outros pedidos continuam como estão.'
      +'<div class="add-row"><button class="btn primary" data-act="applyBackup">Restaurar</button><button class="btn ghost" data-act="cancelBackup">Cancelar</button></div></div>';
  }
  if(S.exportText) h+='<div class="bk-text"><p class="hint">Copie o texto abaixo e guarde em um arquivo com a extensão .json.</p><textarea readonly rows="8" id="bkText" aria-label="Texto do backup"></textarea></div>';
  return h+'</section>';
}
function cadastrosHTML(){
  const c=S.config, empty=!c.alojamentos.length&&!c.frentes.length;
  const cidades=Array.from(new Set(c.alojamentos.map(a=>a.cidade).filter(Boolean)));
  const ro=!R.cloud.canEditConfig();
  let h='<div class="cad">'+(ro?'<p class="hint warn">Somente administradores alteram os cadastros. Você pode ver tudo e montar os pedidos normalmente.</p><fieldset class="ro" disabled>':'');
  h+='<section class="card"><details id="impBox"'+((empty||S.impOpen)?' open':'')+'><summary>Importar de uma mensagem do WhatsApp</summary>'
    +'<p class="muted">Cole o texto de um pedido que você já envia (café, almoço ou jantar). O sistema monta os cadastros e guarda esses pedidos no histórico. Pode colar vários de uma vez.</p>'
    +'<textarea id="impText" rows="8" placeholder="Cole a mensagem aqui" aria-label="Mensagem para importar"></textarea>'
    +'<div class="imp-row"><div id="impSummary" class="muted">Nada para importar ainda.</div><button class="btn primary" data-act="import" id="impBtn" disabled>Importar</button></div></details></section>';
  h+='<datalist id="dl-cidades">'+cidades.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>'
    +'<datalist id="dl-empresas">'+c.empresas.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>'
    +'<datalist id="dl-tipos"><option value="ALMOÇO OBRA RODOVIA"><option value="ALMOÇO CANTEIRO DE OBRAS"></datalist>';
  h+='<section class="card"><h2>Alojamentos</h2><p class="muted">Quantidade padrão de marmitas por refeição. Mudanças valem para os próximos pedidos; pedidos já salvos não são alterados.</p>';
  h+=c.alojamentos.map((a,i)=>'<div class="aloj-row">'
    +'<div class="field"><label for="a-n-'+i+'">Nome</label><input type="text" id="a-n-'+i+'" data-cfg="alojamentos.'+i+'.nome" value="'+esc(a.nome)+'"></div>'
    +'<div class="field f-end"><label for="a-e-'+i+'">Endereço</label><input type="text" id="a-e-'+i+'" data-cfg="alojamentos.'+i+'.endereco" value="'+esc(a.endereco)+'"></div>'
    +'<div class="field"><label for="a-c-'+i+'">Cidade</label><input type="text" id="a-c-'+i+'" list="dl-cidades" data-cfg="alojamentos.'+i+'.cidade" value="'+esc(a.cidade)+'"></div>'
    +MEALS.map(m=>'<div class="field num"><label for="a-'+m.id+'-'+i+'">'+(m.id==='cafe'?'Café':m.nome)+'</label><input type="number" min="0" id="a-'+m.id+'-'+i+'" data-num="1" data-cfg="alojamentos.'+i+'.padrao.'+m.id+'" value="'+((+(a.padrao||{})[m.id])||0)+'"></div>').join('')
    +'<button class="btn icon ghost danger" data-act="rmAloj" data-i="'+i+'" aria-label="Remover '+esc(a.nome)+'">×</button></div>').join('');
  h+='<div class="add-row"><button class="btn" data-act="addAloj">+ Alojamento</button></div></section>';
  h+='<section class="card"><h2>Frentes de obra (almoço)</h2><p class="muted">Canteiros e pontos da rodovia, com as empresas e quantidades que costumam pedir.</p>';
  h+=c.frentes.map((f,fi)=>'<article class="front">'
    +'<div class="cfg-top"><div class="field"><label for="f-t-'+fi+'">Tipo</label><input type="text" id="f-t-'+fi+'" list="dl-tipos" data-cfg="frentes.'+fi+'.tipo" value="'+esc(f.tipo)+'"></div>'
    +'<div class="field"><label for="f-p-'+fi+'">Ponto</label><input type="text" id="f-p-'+fi+'" data-cfg="frentes.'+fi+'.ponto" value="'+esc(f.ponto)+'" placeholder="KM01"></div>'
    +'<div class="field"><label for="f-r-'+fi+'">Responsável</label><input type="text" id="f-r-'+fi+'" data-cfg="frentes.'+fi+'.responsavel" value="'+esc(f.responsavel)+'"></div>'
    +'<button class="btn icon ghost danger" data-act="rmFrente" data-fi="'+fi+'" aria-label="Remover frente">×</button></div>'
    +'<div class="lbl" style="margin-top:12px">Quantidades padrão por empresa</div>'
    +f.linhas.map((l,li)=>'<div class="cfg-line"><input type="text" list="dl-empresas" data-cfg="frentes.'+fi+'.linhas.'+li+'.empresa" value="'+esc(l.empresa)+'" aria-label="Empresa"><input type="number" min="0" data-num="1" data-cfg="frentes.'+fi+'.linhas.'+li+'.qtd" value="'+((+l.qtd)||0)+'" aria-label="Quantidade"><button class="btn icon sm ghost" data-act="rmLinhaCfg" data-fi="'+fi+'" data-li="'+li+'" aria-label="Remover linha">×</button></div>').join('')
    +'<div class="add-row"><button class="btn sm" data-act="addLinhaCfg" data-fi="'+fi+'">+ Empresa</button></div>'
    +acertosHTML(f.acertos,fi,'cfg')+'</article>').join('');
  h+='<div class="add-row"><button class="btn" data-act="addFrente">+ Frente de obra</button></div></section>';
  h+='<section class="card"><h2>Empresas</h2><p class="muted">Lista usada para escolher a empresa em cada frente e no relatório.</p>'
    +'<div class="chips">'+c.empresas.map((e,i)=>'<span class="chip">'+esc(e)+'<button type="button" data-act="rmEmpresa" data-i="'+i+'" aria-label="Remover '+esc(e)+'">×</button></span>').join('')+'</div>'
    +'<div class="add-row"><input type="text" id="empIn" placeholder="Nova empresa" aria-label="Nova empresa"><button class="btn" data-act="addEmpresa">Adicionar</button></div></section>';
  h+='<section class="card"><h2>Totais</h2><label class="check"><input type="checkbox" id="optAcerto" data-cfg="contarAcerto"'+(c.contarAcerto!==false?' checked':'')+'> Contar cada acerto direto como uma marmita no total do almoço</label></section>';
  h+=backupHTML();
  h+=R.cloudviews.equipeHTML();
  return h+(ro?'</fieldset>':'')+'</div>';
}

/* ---------- relatório ---------- */
function barTable(title,obj,key,extra){
  const arr=Object.keys(obj).map(k=>[k,obj[k]]).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(1,...arr.map(x=>x[1]));
  let rows=arr.map(x=>'<tr><td>'+esc(x[0])+'</td><td class="num">'+x[1]+'</td><td class="barcell"><div class="bar" style="width:'+Math.round(x[1]/max*100)+'%"></div></td></tr>').join('');
  if(extra) rows+=extra;
  if(!rows) rows='<tr><td colspan="3" class="muted">Sem dados neste mês.</td></tr>';
  return '<section class="card"><h2>'+title+'<button class="btn sm ghost" data-act="copytsv" data-t="'+key+'">Copiar planilha</button></h2><div class="scroll"><table class="tbl"><thead><tr><th>Nome</th><th class="num">Marmitas</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}
function relatorioHTML(){
  const st=L.monthStats(S.pedidos,S.month,contar()), ym=S.month.split('-'), mes=MESES[+ym[1]-1];
  const total=st.tot.cafe+st.tot.almoco+st.tot.jantar;
  let h='<div class="toolbar"><div class="datebox"><button class="btn icon" data-act="month" data-d="-1" aria-label="Mês anterior">‹</button><div class="sign"><span>'+ym[0]+'</span><b>'+mes+'</b></div><button class="btn icon" data-act="month" data-d="1" aria-label="Próximo mês">›</button></div></div>';
  h+='<div class="kpis"><div class="kpi main"><b>'+total+'</b><span>Marmitas no mês</span></div><div class="kpi"><b>'+st.tot.cafe+'</b><span>Café da manhã</span></div><div class="kpi"><b>'+st.tot.almoco+'</b><span>Almoço</span></div><div class="kpi"><b>'+st.tot.jantar+'</b><span>Jantar</span></div><div class="kpi"><b>'+st.days.length+'</b><span>Dias com pedido</span></div></div>';
  if(!st.days.length) return h+'<div class="empty"><h3>Sem pedidos em '+mes+'</h3><p>Os pedidos aparecem aqui assim que você copia ou salva a mensagem do dia.</p></div>';
  const extra=st.acertos?'<tr class="hz"><td>Acerto direto (pessoas)</td><td class="num">'+st.acertos+'</td><td class="barcell"></td></tr>':'';
  h+='<div class="rep">'+barTable('Almoço por empresa',st.empresas,'empresas',extra)+barTable('Almoço por ponto de obra',st.pontos,'pontos');
  const aj=Object.keys(st.aloj).sort();
  h+='<section class="card"><h2>Por alojamento<button class="btn sm ghost" data-act="copytsv" data-t="aloj">Copiar planilha</button></h2><div class="scroll"><table class="tbl"><thead><tr><th>Alojamento</th><th class="num">Café</th><th class="num">Almoço</th><th class="num">Jantar</th><th class="num">Total</th></tr></thead><tbody>'
    +(aj.map(n=>{ const r=st.aloj[n]; return '<tr><td>'+esc(n)+'</td><td class="num">'+r.cafe+'</td><td class="num">'+r.almoco+'</td><td class="num">'+r.jantar+'</td><td class="num">'+r.total+'</td></tr>'; }).join('')||'<tr><td colspan="5" class="muted">Sem dados neste mês.</td></tr>')+'</tbody></table></div></section>';
  h+='<section class="card"><h2>Por dia<button class="btn sm ghost" data-act="copytsv" data-t="dias">Copiar planilha</button></h2><div class="scroll"><table class="tbl"><thead><tr><th>Dia</th><th class="num">Café</th><th class="num">Almoço</th><th class="num">Jantar</th><th class="num">Total</th></tr></thead><tbody>'
    +st.days.slice().reverse().map(r=>'<tr><td>'+fmtBR(r.iso)+' <span class="muted">'+weekdayOf(r.iso).slice(0,3)+'</span></td><td class="num">'+(r.cafe||'')+'</td><td class="num">'+(r.almoco||'')+'</td><td class="num">'+(r.jantar||'')+'</td><td class="num">'+r.total+'</td></tr>').join('')+'</tbody></table></div></section></div>';
  return h;
}

/* ---------- painel de instalação ---------- */
function sheetHTML(){
  if(S.sheet!=='install') return '';
  const prompt=R.pwa.hasPrompt();
  return '<div class="sheet-bg" data-act="closeSheet" data-bg="1"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetT">'
    +'<h2 id="sheetT">Instalar como app</h2>'
    +(prompt?'<p>Seu navegador permite instalar agora.</p><div class="add-row" style="justify-content:flex-start"><button class="btn primary" data-act="doInstall">Instalar agora</button></div>':'')
    +'<p>'+(prompt?'Se preferir, também dá pelo menu do navegador:':'Use o menu do navegador:')+'</p>'
    +'<ul><li><b>Android (Chrome):</b> menu de três pontos, depois "Instalar app" ou "Adicionar à tela inicial".</li>'
    +'<li><b>iPhone (Safari):</b> botão Compartilhar, depois "Adicionar à Tela de Início".</li>'
    +'<li><b>Computador (Chrome ou Edge):</b> ícone de instalar na barra de endereço, ou menu, depois "Instalar Rancho Pedidos".</li></ul>'
    +'<p class="warn">Dentro do Claude o navegador não oferece a instalação. Se nada disso aparecer, abra o link deste app direto no navegador, fora do Claude. Lá os dados ficam salvos só no aparelho: exporte um backup em Cadastros e restaure no app instalado.</p>'
    +'<div class="add-row"><button class="btn" data-act="closeSheet" id="sheetClose">Fechar</button></div></div></div>';
}

/* ---------- atualização ao vivo e desenho ---------- */
function bubbleHTML(text){ return esc(text).replace(/\*([^*\n]+)\*/g,'<b>$1</b>'); }
function paintSend(o,cont){
  const keys=L.localKeys(o,cont), mealTxt={cafe:'café',almoco:'almoço',jantar:'jantar'};
  $$('[data-st]').forEach(el=>{
    const k=el.dataset.st, q=keys[k]; if(q===undefined){ el.textContent=''; return; }
    const r=L.localState(o,k,q); let txt='', cls='st';
    if(r.st==='ok'){ txt='Enviado '+L.fmtWhen(r.em); cls+=' ok'; }
    else if(r.st==='mud'){ txt='Alterado após envio ('+L.fmtWhen(r.em)+'): era '+r.was+', agora '+q; cls+=' mud'; }
    else { const ls=L.lastSent(S.pedidos,k,S.date); txt=ls?'Último envio '+fmtBR(ls.iso)+' ('+mealTxt[ls.meal]+', '+ls.qtd+')':'Nunca enviado'; }
    el.textContent=txt; el.className=cls;
    const btn=$('[data-act="mark"][data-key="'+k+'"]');
    if(btn){ btn.textContent=r.st==='ok'?'✓ Enviado':r.st==='mud'?'Atualizar envio':'Marcar enviado'; btn.classList.toggle('done',r.st==='ok'); btn.classList.toggle('chg',r.st==='mud'); btn.title=r.st==='ok'?'Clique para desmarcar':'Marcar este local como já enviado'; }
  });
  const st=L.orderState(o,cont), c=L.contaEnvio(o,cont), pill=$('#sendPill'), un=$('#unsentBtn');
  if(!pill) return;
  const ts=Object.keys(o.envio||{}).map(k=>o.envio[k].em).sort(), last=ts[ts.length-1];
  pill.textContent=st==='ok'?'Enviado':st==='mud'?'Alterado':st==='parc'?'Parcial':'Não enviado';
  pill.className='pill '+(st==='ok'?'ok':st==='novo'?'draft':'warn');
  setText('#sendText',(c.ok+' de '+c.total+' locais marcados como enviados.')+(last?' Última atualização: '+L.fmtWhen(last)+'.':'')+(st==='mud'?' Há local alterado depois do envio.':''));
  un.hidden=!last;
}
function updateDerived(){
  if(S.view!=='pedido'||!$('#bubble')) return;
  const o=getOrder(S.date,S.meal), cont=contar();
  const text=formatMessage(o,S.meal,S.date,cont), total=orderTotal(o,S.meal,cont);
  setText('#pvTotal',total); setText('#dockTotal',total); setText('#pvUnit',total===1?'marmita':'marmitas');
  $('#bubble').innerHTML=bubbleHTML(text);
  const wa=$('#waLink'); if(wa) wa.href='https://wa.me/?text='+encodeURIComponent(text);
  MEALS.forEach(m=>{
    setText('[data-seg-n="'+m.id+'"]',orderTotal(getOrder(S.date,m.id),m.id,cont));
    const dot=$('[data-dot="'+m.id+'"]'); if(dot){ dot.classList.toggle('on',isSaved(S.date,m.id)); const es=L.orderState(S.pedidos[S.date]&&S.pedidos[S.date][m.id],cont); dot.classList.toggle('sent',es==='ok'); dot.classList.toggle('warnd',es==='mud'||es==='parc'); dot.title=es==='ok'?'Tudo enviado':es==='mud'?'Alterado após o envio':es==='parc'?'Parte enviada':'Ainda não enviado'; }
  });
  paintSend(o,cont);
  $$('.group').forEach(g=>{ let n=0; $$('input[data-qty]',g).forEach(i=>{ n+=parseInt(i.value,10)||0; }); const s=$('.sub',g); if(s) s.textContent=n; });
  $$('.front[data-fi]').forEach(f=>{ let n=0; $$('input[data-qty]',f).forEach(i=>{ n+=parseInt(i.value,10)||0; }); if(cont) n+=$$('.chip',f).length; const s=$('[data-ft]',f); if(s) s.textContent=n; });
  const saved=isSaved(S.date,S.meal), pill=$('#statePill');
  if(pill){ pill.textContent=saved?'Salvo':'Rascunho'; pill.className='pill '+(saved?'ok':'draft'); setText('#stateText',saved?'Pedido deste dia.':'Quantidades padrão do cadastro. Salva ao editar ou copiar.'); }
}
function render(){
  const app=document.getElementById('app');
  if(S.storage==='cloud'&&S.auth&&S.auth.status!=='in'){ app.innerHTML=R.cloudviews.authHTML(); return; }
  if(!S.loaded){ app.innerHTML=headerHTML()+'<div class="loading">Carregando pedidos…</div>'; return; }
  const body=S.view==='pedido'?pedidoHTML():S.view==='cadastros'?cadastrosHTML():relatorioHTML();
  const hasData=S.config.alojamentos.length||S.config.frentes.length;
  app.innerHTML=headerHTML()+'<main>'+body+'</main>'+(S.view==='pedido'&&hasData?dockHTML():'')+sheetHTML();
  if(S.exportText){ const t=$('#bkText'); if(t) t.value=S.exportText; }
  ST.paintSave(S.save);
  updateDerived();
  if(S.sheet){ const b=$('#sheetClose'); if(b) b.focus(); }
}

R.views={bubbleHTML,updateDerived};
R.render=render;
})(window.Rancho=window.Rancho||{});
