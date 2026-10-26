/* Telas do modo nuvem: entrar, criar conta, recuperar senha, nova senha,
   avisos de acesso e a gestão de equipe (somente administradores). */
(function(R){
'use strict';
const S=R.S, esc=R.logic.esc;

function themeBtn(){
  return '<button class="iconbtn" data-act="theme" aria-label="Alternar tema" title="Alternar tema">'+R.theme.icon()+'</button>';
}
function field(id,name,label,type,extra){
  return '<div class="field"><label for="'+id+'">'+label+'</label><input type="'+type+'" id="'+id+'" name="'+name+'" '+(extra||'')+'></div>';
}
function link(m,txt){ return '<button type="button" class="linkbtn" data-act="authMode" data-m="'+m+'">'+txt+'</button>'; }

function authHTML(){
  const a=S.auth||{status:'loading',mode:'login',msg:'',err:''};
  let inner='';
  if(a.status==='loading'||a.status==='entering'){
    inner='<p class="muted authc">Carregando…</p>';
  } else if(a.status==='noaccess'){
    inner='<h1 class="authh">Conta sem empresa</h1><p>Esta conta ainda não faz parte de nenhuma empresa. Se você foi convidado, peça ao administrador para convidar exatamente este e-mail, confirme o e-mail e entre de novo.</p>'
      +'<div class="authlinks"><button type="button" class="btn" data-act="logout">Sair</button></div>';
  } else if(a.status==='error'){
    inner='<h1 class="authh">Não foi possível carregar</h1><p>'+esc(a.err||'Tente de novo.')+'</p>'
      +'<div class="authlinks"><button type="button" class="btn primary" data-act="retryAuth">Tentar de novo</button><button type="button" class="btn ghost" data-act="logout">Sair</button></div>';
  } else if(a.status==='recovery'){
    inner='<h1 class="authh">Nova senha</h1><form data-form="newpass">'
      +field('au-pw1','senha','Nova senha (mínimo 8 caracteres)','password','autocomplete="new-password" minlength="8" required autofocus')
      +field('au-pw2','senha2','Repita a nova senha','password','autocomplete="new-password" minlength="8" required')
      +'<button class="btn primary" type="submit">Salvar senha</button></form>';
  } else if(a.mode==='signup'){
    inner='<h1 class="authh">Criar conta</h1><form data-form="signup">'
      +field('au-empresa','empresa','Nome da empresa (só para quem está criando uma nova)','text','autocomplete="organization" maxlength="80"')
      +field('au-email','email','E-mail','email','autocomplete="username" required')
      +field('au-pw','senha','Senha (mínimo 8 caracteres)','password','autocomplete="new-password" minlength="8" required')
      +'<button class="btn primary" type="submit">Criar conta</button></form>'
      +'<p class="hint">Você receberá um e-mail para confirmar o endereço. Se foi convidado para uma empresa, use o e-mail que recebeu o convite e deixe o nome da empresa em branco.</p>'
      +'<div class="authlinks">'+link('login','Já tenho conta')+'</div>';
  } else if(a.mode==='reset'){
    inner='<h1 class="authh">Recuperar senha</h1><form data-form="reset">'
      +field('au-email','email','E-mail da conta','email','autocomplete="username" required autofocus')
      +'<button class="btn primary" type="submit">Enviar link</button></form>'
      +'<div class="authlinks">'+link('login','Voltar para entrar')+'</div>';
  } else {
    inner='<h1 class="authh">Entrar</h1><form data-form="login">'
      +field('au-email','email','E-mail','email','autocomplete="username" required autofocus')
      +field('au-pw','senha','Senha','password','autocomplete="current-password" required')
      +'<button class="btn primary" type="submit">Entrar</button></form>'
      +'<div class="authlinks">'+link('reset','Esqueci a senha')+link('signup','Criar conta')+'</div>';
  }
  const msg=a.err?'<p class="msg err" id="authMsg" role="alert">'+esc(a.err)+'</p>':a.msg?'<p class="msg ok" id="authMsg" role="alert">'+esc(a.msg)+'</p>':'<p class="msg" id="authMsg" role="alert"></p>';
  const showMsg=(a.status==='error'||a.status==='noaccess')?'':msg;
  return '<div class="authwrap"><div class="authtop">'+themeBtn()+'</div><main class="authcard"><div class="sign"><span>pedidos de marmita</span><b>Rancho</b></div>'+inner+showMsg+'</main></div>';
}

const PAPEL={admin:'Administrador',operador:'Operador'};
function equipeHTML(){
  const C=R.cloud; if(!C.enabled||C.papel!=='admin') return '';
  const me=String(C.email||'').toLowerCase();
  const rows=C.team.map(m=>{
    const eu=String(m.email||'').toLowerCase()===me;
    return '<tr><td>'+esc(m.email)+(eu?' <span class="muted">(você)</span>':'')+'</td><td>'+PAPEL[m.papel]+'</td><td class="act">'+(eu?'':'<button class="btn sm ghost danger" data-act="rmMember" data-id="'+esc(m.user_id)+'">Remover</button>')+'</td></tr>';
  }).join('');
  const inv=C.convites.map(c=>'<tr><td>'+esc(c.email)+' <span class="pill draft">Convite pendente</span></td><td>'+PAPEL[c.papel]+'</td><td class="act"><button class="btn sm ghost danger" data-act="rmInvite" data-id="'+esc(c.id)+'">Cancelar</button></td></tr>').join('');
  return '<section class="card"><h2>Equipe</h2><p class="muted">Quem pode entrar no sistema de '+esc(C.empresaNome||'sua empresa')+'. Administradores alteram cadastros, equipe e pedidos. Operadores montam, salvam e copiam pedidos.</p>'
    +'<div class="scroll"><table class="tbl"><thead><tr><th>E-mail</th><th>Papel</th><th></th></tr></thead><tbody>'+rows+inv+'</tbody></table></div>'
    +'<form data-form="invite" class="invite"><div class="field"><label for="inv-email">Convidar por e-mail</label><input type="email" id="inv-email" name="email" autocomplete="off" required></div>'
    +'<div class="field"><label for="inv-papel">Papel</label><select id="inv-papel" name="papel"><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>'
    +'<button class="btn primary" type="submit">Convidar</button></form>'
    +'<p class="hint">A pessoa deve criar a conta com este mesmo e-mail e confirmar pelo link que receber. Convide antes de ela criar a conta.</p></section>';
}

R.cloudviews={authHTML,equipeHTML};
})(window.Rancho=window.Rancho||{});
