/* Tema claro/escuro. Sem escolha, o app segue o sistema; ao tocar no botão a
   escolha fica guardada neste aparelho e vale nas próximas visitas. */
(function(R){
'use strict';
const U=R.util, KEY='rancho-theme', root=document.documentElement;

const stored=()=>{ const t=U.ls.get(KEY); return t==='light'||t==='dark'?t:''; };
function effective(){
  const t=root.getAttribute('data-theme');
  if(t==='light'||t==='dark') return t;
  return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
function paintMeta(){
  let el=document.querySelector('meta[name="theme-color"]');
  if(!el){ el=document.createElement('meta'); el.name='theme-color'; document.head.appendChild(el); }
  el.content=effective()==='dark'?'#0E1512':'#ECEFED';
}
function icon(){
  const a='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  return effective()==='dark'
    ? a+'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : a+'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
}
function refresh(){
  paintMeta();
  U.$$('[data-act="theme"]').forEach(b=>{ b.innerHTML=icon(); b.title=effective()==='dark'?'Mudar para tema claro':'Mudar para tema escuro'; });
}
function toggle(){
  const next=effective()==='dark'?'light':'dark';
  U.ls.set(KEY,next); root.setAttribute('data-theme',next); refresh();
}

if(stored()) root.setAttribute('data-theme',stored());
paintMeta();
if(window.matchMedia){
  const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const on=()=>{ if(!stored()) refresh(); };
  if(mq.addEventListener) mq.addEventListener('change',on); else if(mq.addListener) mq.addListener(on);
}

R.theme={icon,toggle,refresh,effective};
})(window.Rancho=window.Rancho||{});
