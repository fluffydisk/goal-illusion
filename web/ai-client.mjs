import {STORY_VERSION,PROMPT_VERSION} from './story-presentation.mjs';
export const ACTIVE = new Set(['submitting','queued','generating','reviewing','waiting_provider']);

export function progressText(job, now=Date.now()) {
  const elapsed=Math.max(0,Math.floor((now-job.started_at)/1000));
  if(job.status==='waiting_provider'){
    const seconds=Math.max(0,Math.ceil(((job.retry_at||now)-now)/1000));
    return {elapsed:`Geçen süre: ${elapsed} sn`,remaining:seconds>0?`Sağlayıcının bekleme süresi: ${seconds>=60?Math.ceil(seconds/60)+' dk':seconds+' sn'}. Süre dolunca otomatik devam edecek.`:'Bekleme tamamlandı. Üretim otomatik sürdürülüyor.'};
  }
  const [,high]=job.estimated_seconds||[20,90];
  const stageElapsed=Math.max(0,Math.floor((now-(job.updated_at||job.started_at))/1000));
  const descriptions={submitting:'İsteğin alınıyor ve maçın verileri hazırlanıyor.',queued:'İsteğin kaydedildi. Sıra sana geldiğinde otomatik başlayacak.',generating:job.attempt>0?'Yorum, kontrol notlarına göre düzeltiliyor. Yeniden tıklamana gerek yok.':'Maçın dönüm noktaları, golleri ve önemli fırsatları bir hikâyeye dönüşüyor.',reviewing:'Oyuncular, dakikalar ve çıkarımlar maç verileriyle tek tek karşılaştırılıyor.'};
  return {elapsed:`Geçen süre: ${elapsed} sn`,remaining:stageElapsed>high?'Bu aşama beklenenden uzun sürüyor. İşlemin sunucuda devam ediyor.':descriptions[job.status]||'Hikâyen hazırlanıyor.'};
}

export async function analysisRequest(endpoint, id, method='GET', signal, fingerprint) {
  const query=`?story_version=${STORY_VERSION}&prompt_version=${PROMPT_VERSION}${fingerprint?'&fingerprint='+encodeURIComponent(fingerprint):''}`;
  const response=await fetch(`${endpoint.replace(/\/$/,'')}/analysis/${encodeURIComponent(id)}${query}`,{method,cache:'no-store',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)])});
  const result=await response.json();
  if (!response.ok && !result.status) throw new Error(result.error||'Analiz servisine ulaşılamadı.');
  return result;
}
