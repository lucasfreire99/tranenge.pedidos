/* Login e dados na nuvem (Supabase). Só liga quando js/config.js está preenchido,
   a biblioteca do Supabase foi carregada e o app NÃO está dentro do Claude.
   Sem isso, R.cloud.enabled é false e o app segue salvando no aparelho. */
(function(R){
'use strict';
const cfg=window.RANCHO_CONFIG||{};
const lib=window.supabase;
const enabled=!window.claude&&!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&lib&&lib.createClient);
/* o link de "esqueci a senha" chega com type=recovery no endereço; lemos agora,
   antes de a biblioteca limpar o endereço */
const recoveryLink=/type=recovery/.test(String(location.hash||''));

const C={enabled,recoveryLink,email:'',empresa:'',empresaNome:'',papel:'',team:[],convites:[]};
let sb=null, chan=null;
if(enabled){
  sb=lib.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}
const must=r=>{ if(r&&r.error) throw r.error; return r; };
const here=()=>location.origin+location.pathname;

C.isAdmin=()=>!enabled||C.papel==='admin';
C.canEditConfig=()=>!enabled||C.papel==='admin';

/* ---------- sessão ---------- */
C.onAuth=fn=>{ sb.auth.onAuthStateChange((ev,s)=>{ setTimeout(()=>fn(ev,s),0); }); };
C.session=async()=>{ const r=await sb.auth.getSession(); return r&&r.data?r.data.session:null; };
C.signIn=async(email,senha)=>must(await sb.auth.signInWithPassword({email,password:senha}));
C.signUp=async(email,senha,empresa)=>must(await sb.auth.signUp({email,password:senha,options:{data:{empresa:empresa||''},emailRedirectTo:here()}}));
C.reset=async email=>must(await sb.auth.resetPasswordForEmail(email,{redirectTo:here()}));
C.setPassword=async senha=>must(await sb.auth.updateUser({password:senha}));
C.signOut=async()=>{ C.unsubscribe(); must(await sb.auth.signOut()); };

/* ---------- empresa da pessoa ---------- */
C.loadTenant=async()=>{
  const s=await C.session(); if(!s) throw new Error('session missing');
  await sb.rpc('entrar'); /* aceita convite pendente, se houver */
  const r=must(await sb.from('membros').select('empresa_id,papel,empresas(nome)').eq('user_id',s.user.id).maybeSingle());
  const m=r.data; C.email=s.user.email||'';
  if(!m){ C.empresa=''; C.papel=''; C.empresaNome=''; return; }
  C.empresa=m.empresa_id; C.papel=m.papel; C.empresaNome=(m.empresas&&m.empresas.nome)||'';
};

/* ---------- dados ---------- */
C.loadAll=async()=>{
  const c=must(await sb.from('config').select('dados').eq('empresa_id',C.empresa).maybeSingle());
  const p=must(await sb.from('pedidos').select('data,dados').eq('empresa_id',C.empresa).order('data',{ascending:false}).limit(1000));
  return {config:(c.data&&c.data.dados)||{},pedidos:p.data||[]};
};
C.save=async(key,body)=>{
  if(key==='cfg') must(await sb.from('config').upsert({empresa_id:C.empresa,dados:body},{onConflict:'empresa_id'}));
  else must(await sb.from('pedidos').upsert({empresa_id:C.empresa,data:key,dados:body},{onConflict:'empresa_id,data'}));
};
C.subscribe=fn=>{
  C.unsubscribe();
  chan=sb.channel('rancho-'+C.empresa);
  ['config','pedidos'].forEach(t=>{
    chan=chan.on('postgres_changes',{event:'*',schema:'public',table:t,filter:'empresa_id=eq.'+C.empresa},p=>fn(t,p.eventType,p.eventType==='DELETE'?p.old:p.new));
  });
  chan.subscribe();
};
C.unsubscribe=()=>{ if(chan&&sb){ try{ sb.removeChannel(chan); }catch(e){} } chan=null; };

/* ---------- equipe (somente administradores) ---------- */
C.loadTeam=async()=>{
  if(C.papel!=='admin'){ C.team=[]; C.convites=[]; return; }
  const m=must(await sb.from('membros').select('user_id,email,papel,criado_em').eq('empresa_id',C.empresa).order('criado_em'));
  const c=must(await sb.from('convites').select('id,email,papel,criado_em').eq('empresa_id',C.empresa).order('criado_em'));
  C.team=m.data||[]; C.convites=c.data||[];
};
C.invite=async(email,papel)=>{ must(await sb.from('convites').insert({empresa_id:C.empresa,email:String(email).toLowerCase(),papel:papel==='admin'?'admin':'operador'})); await C.loadTeam(); };
C.rmInvite=async id=>{ must(await sb.from('convites').delete().eq('id',id)); await C.loadTeam(); };
C.rmMember=async uid=>{ must(await sb.from('membros').delete().eq('empresa_id',C.empresa).eq('user_id',uid)); await C.loadTeam(); };

/* ---------- mensagens de erro em português ---------- */
C.errText=e=>{
  const m=String((e&&e.message)||e||'').toLowerCase(), c=e&&e.code;
  if(m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if(m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.';
  if(m.includes('already registered')||m.includes('already been registered')) return 'Este e-mail já tem conta. Entre ou recupere a senha.';
  if(m.includes('rate limit')||m.includes('too many')||(e&&e.status===429)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if(m.includes('password should')||m.includes('weak password')) return 'Senha fraca. Use pelo menos 8 caracteres.';
  if(m.includes('different from the old')||m.includes('same password')) return 'Escolha uma senha diferente da anterior.';
  if(c==='42501'||m.includes('row-level security')) return 'Você não tem permissão para esta alteração.';
  if(c==='23505'||m.includes('duplicate key')) return 'Este e-mail já foi convidado ou já faz parte da equipe.';
  if(m.includes('failed to fetch')||m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet.';
  if(m.includes('jwt')||m.includes('session')) return 'Sua sessão expirou. Entre de novo.';
  return 'Não foi possível concluir. Tente de novo.';
};

R.cloud=C;
})(window.Rancho=window.Rancho||{});
