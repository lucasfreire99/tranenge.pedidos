/* Backup: exporta cadastros e pedidos em um arquivo .json e restaura a partir
   dele. Dentro do Claude o download passa pelo recurso "downloads" (o
   visitante confirma); fora dele usa um download normal do navegador. */
(function(R){
'use strict';
const S=R.S, L=R.logic, U=R.util;
const META='ranchoMeta:lastBackup';

async function getDownloads(){
  try{ return (window.claude&&window.claude.use)?await window.claude.use('downloads'):null; }catch(e){ return null; }
}
const stamp=()=>U.ls.set(META,new Date().toISOString());
const lastBackup=()=>U.ls.get(META);

async function exportJSON(){
  S.exportText='';
  const data=JSON.stringify(L.makeBackup(S.config,S.pedidos),null,2);
  const filename='rancho-backup-'+L.todayISO()+'.json';
  const dl=await getDownloads();
  if(dl){
    try{ await dl.save({filename,data}); stamp(); U.toast('Backup salvo'); R.render(); return; }
    catch(e){
      const c=e&&e.code;
      if(c==='declined'){ U.toast('Backup cancelado.'); return; }
      if(c==='rate_limited'){ U.toast('Aguarde um instante e tente de novo.'); return; }
    }
  } else if(!window.claude){
    try{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([data],{type:'application/json'})); a.download=filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      stamp(); U.toast('Backup baixado'); R.render(); return;
    }catch(e){}
  }
  if(await U.copyText(data)){ stamp(); U.toast('Backup copiado. Cole em um arquivo .json para guardar.'); R.render(); return; }
  S.exportText=data; R.render(); U.toast('Copie o texto do backup e guarde em um arquivo .json.');
}

function readFile(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(String(fr.result));
    fr.onerror=()=>rej(new Error('Não foi possível ler o arquivo.'));
    fr.readAsText(file);
  });
}
async function pick(file){
  if(!file) return;
  try{ S.pendingBackup=L.readBackup(await readFile(file)); S.pendingBackupErr=''; }
  catch(e){ S.pendingBackup=null; S.pendingBackupErr=e.message; }
  R.render();
}

R.backup={exportJSON,pick,lastBackup};
})(window.Rancho=window.Rancho||{});
