/* Utilidades de interface: seletores, aviso rápido, confirmação em dois cliques,
   copiar para a área de transferência e acesso seguro ao localStorage. */
(function(R){
'use strict';

const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const setText=(sel,v)=>{ const e=$(sel); if(e) e.textContent=String(v); };

let toastT=null;
function toast(msg){
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.hidden=false;
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.hidden=true; },2800);
}

let armed={};
function confirmTwice(btn,key){
  if(armed.key===key&&Date.now()-armed.t<4000){ armed={}; return true; }
  armed={key,t:Date.now()};
  const old=btn.textContent; btn.textContent='Confirmar?'; btn.classList.add('armed');
  setTimeout(()=>{ if(btn.isConnected){ btn.textContent=old; btn.classList.remove('armed'); } },4000);
  return false;
}

async function copyText(text){
  try{ await navigator.clipboard.writeText(text); return true; }catch(e){}
  try{
    const ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
    ta.remove(); return ok;
  }catch(e){ return false; }
}

function setPath(obj,path,val){
  const p=path.split('.'); let o=obj;
  for(let i=0;i<p.length-1;i++) o=o[p[i]];
  o[p[p.length-1]]=val;
}

const ls={
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

R.util={$,$$,setText,toast,confirmTwice,copyText,setPath,ls};
})(window.Rancho=window.Rancho||{});
