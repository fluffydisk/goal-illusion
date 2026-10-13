import {t, language} from './i18n.mjs';
import {STORY_VERSION,PROMPT_VERSION} from './story-presentation.mjs';
export const ACTIVE = new Set(['submitting','queued','generating','reviewing','waiting_provider']);

export function progressText(job, now=Date.now()) {
  const elapsed=Math.max(0,Math.floor((now-job.started_at)/1000));
  if(job.status==='waiting_provider'){
    const seconds=Math.max(0,Math.ceil(((job.retry_at||now)-now)/1000));
    return {elapsed:t`Geçen süre: ${elapsed} sn`,remaining:seconds>0?t`Sağlayıcının bekleme süresi: ${seconds>=60?t`${Math.ceil(seconds/60)} dk`:t`${seconds} sn`}. Süre dolunca otomatik devam edecek.`:t('Bekleme tamamlandı. Üretim otomatik sürdürülüyor.')};
  }
  const [,high]=job.estimated_seconds||[20,90];
  const stageElapsed=Math.max(0,Math.floor((now-(job.updated_at||job.started_at))/1000));
  const descriptions={submitting:t('İsteğin alınıyor ve maçın verileri hazırlanıyor.'),queued:t('İsteğin kaydedildi. Sıra sana geldiğinde otomatik başlayacak.'),generating:job.attempt>0?t('Yorum, kontrol notlarına göre düzeltiliyor. Yeniden tıklamana gerek yok.'):t('Maçın dönüm noktaları, golleri ve önemli fırsatları bir hikâyeye dönüşüyor.'),reviewing:t('Oyuncular, dakikalar ve çıkarımlar maç verileriyle tek tek karşılaştırılıyor.')};
  return {elapsed:t`Geçen süre: ${elapsed} sn`,remaining:stageElapsed>high?t('Bu aşama beklenenden uzun sürüyor. İşlemin sunucuda devam ediyor.'):descriptions[job.status]||t('Hikâyen hazırlanıyor.')};
}

const capabilities=new Map();
export async function analysisRequest(endpoint, id, method='GET', signal, fingerprint) {
  if(language()==='en') {
    // Older deployments ignore lang: prevent an English request starting a Turkish job.
    if(!capabilities.has(endpoint)) {
      const pending=fetch(`${endpoint.replace(/\/$/,'')}/health`,{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(response=>response.ok?response.json():{});
      capabilities.set(endpoint,pending);
      pending.catch(()=>{capabilities.delete(endpoint);});
    }
    const health=await capabilities.get(endpoint);
    if(!health.languages?.includes('en')) {const error=new Error('English AI commentary is not enabled on this server yet.');error.unsupportedLanguage=true;throw error;}
  }
  const query=`?story_version=${STORY_VERSION}&prompt_version=${PROMPT_VERSION}&lang=${language()}${fingerprint?'&fingerprint='+encodeURIComponent(fingerprint):''}`;
  const response=await fetch(`${endpoint.replace(/\/$/,'')}/analysis/${encodeURIComponent(id)}${query}`,{method,cache:'no-store',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)])});
  const result=await response.json();
  if (!response.ok && !result.status) throw new Error(t(result.error)||t('Analiz servisine ulaşılamadı.'));
  return result;
}
