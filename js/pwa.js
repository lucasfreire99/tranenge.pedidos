/* Instalação como app. Monta o manifest e os ícones em tempo de execução e
   oferece o botão "Instalar app": usa o instalador do navegador quando ele
   aparece e, quando não aparece, mostra o passo a passo. O service worker
   (sw.js, offline) só é registrado fora do Claude. */
(function(R){
'use strict';
const U=R.util;
let deferred=null, installed=false;

function isStandalone(){
  return (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
}
const canShow=()=>!isStandalone()&&!installed;

function drawIcon(size){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d');
  x.fillStyle='#0C6A4B'; x.fillRect(0,0,size,size);
  x.fillStyle='#F3BE1B'; x.fillRect(size*.18,size*.74,size*.64,size*.07);
  x.fillStyle='#FFFFFF'; x.textAlign='center'; x.textBaseline='alphabetic';
  x.font='700 '+Math.round(size*.62)+'px "Barlow Condensed","Arial Narrow",Arial,sans-serif';
  x.fillText('R',size/2,size*.66);
  return c.toDataURL('image/png');
}
function addTag(tag,attrs){ const el=document.createElement(tag); Object.keys(attrs).forEach(k=>el.setAttribute(k,attrs[k])); document.head.appendChild(el); return el; }
function setup(){
  try{
    const i192=drawIcon(192), i512=drawIcon(512);
    addTag('link',{rel:'apple-touch-icon',href:i192});
    addTag('meta',{name:'apple-mobile-web-app-capable',content:'yes'});
    addTag('meta',{name:'mobile-web-app-capable',content:'yes'});
    addTag('meta',{name:'apple-mobile-web-app-title',content:'Rancho'});
    const manifest={
      name:'Rancho Pedidos',short_name:'Rancho',description:'Pedidos de marmita para alojamentos e frentes de obra',
      start_url:location.href.split('#')[0],display:'standalone',background_color:'#ECEFED',theme_color:'#0C6A4B',lang:'pt-BR',
      icons:[{src:i192,sizes:'192x192',type:'image/png',purpose:'any'},{src:i512,sizes:'512x512',type:'image/png',purpose:'any'}]
    };
    const url=URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'}));
    addTag('link',{rel:'manifest',href:url});
  }catch(e){}
  if(!window.claude&&'serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(setup,setup); else setup();

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferred=e; });
window.addEventListener('appinstalled',()=>{
  installed=true; deferred=null; U.$$('[data-act="install"]').forEach(b=>{ b.hidden=true; }); U.toast('App instalado');
});

async function install(){
  if(deferred){
    try{
      deferred.prompt();
      const r=await deferred.userChoice; deferred=null;
      if(r&&r.outcome==='accepted') U.toast('Instalando…');
      return;
    }catch(e){ deferred=null; }
  }
  R.S.sheet='install'; R.render();
}

R.pwa={canShow,hasPrompt:()=>!!deferred,install,isStandalone};
})(window.Rancho=window.Rancho||{});
