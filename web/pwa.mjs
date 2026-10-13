import {t} from './i18n.mjs';
let prompt;
function setStatus(key){const status=document.getElementById('pwa-status');status.dataset.messageKey=key;status.textContent=t(key);}
export function refreshPwaLabels(){const key=document.getElementById('pwa-status').dataset.messageKey;if(key)setStatus(key);}
export function initializePwa() {
  const button=document.getElementById('install-app');
  const local=['localhost','127.0.0.1'].includes(location.hostname);
  if(!('serviceWorker' in navigator)||!window.isSecureContext){setStatus('Bu tarayıcı çevrimdışı kullanımı desteklemiyor.');return;}
  // Local previews stay uncached unless the test/preview explicitly opts in.
  if(local&&new URL(location.href).searchParams.get('offline')!=='1'){setStatus('Yerel önizleme güncel dosyaları kullanır. Çevrimdışı kullanım canlı sürümde etkinleşir.');return;}
  let controlled=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controlled)location.reload();else controlled=true;});
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(async registration=>{
    const worker=registration.installing||registration.waiting||registration.active;
    if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
      const check=()=>{if(worker.state==='activated')resolve();else if(worker.state==='redundant')reject(Error('Offline installation failed'));};
      worker.addEventListener('statechange',check);check();
    });
    await navigator.serviceWorker.ready;setStatus('Son yüklenen maç verisi bu cihazda çevrimdışı kullanılabilir.');
  }).catch(()=>{setStatus('Tarayıcı çevrimdışı kullanımı etkinleştiremedi. Sayfanın diğer özellikleri kullanılabilir.');});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;button.hidden=false;});
  button.onclick=async()=>{if(!prompt)return;await prompt.prompt();prompt=null;button.hidden=true;};
  window.addEventListener('appinstalled',()=>{prompt=null;button.hidden=true;});
}
