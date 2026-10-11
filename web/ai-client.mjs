export const ACTIVE = new Set(['queued','generating','reviewing','waiting_provider']);

export function progressText(job, now=Date.now()) {
  const elapsed=Math.max(0,Math.floor((now-job.started_at)/1000));
  const [low,high]=job.estimated_seconds||[20,90];
  const stageElapsed=Math.max(0,Math.floor((now-(job.eta_reference_at||job.updated_at||job.started_at))/1000));
  return {elapsed:`Geçen süre: ${elapsed} sn`,remaining:stageElapsed>high
    ? 'Üretim beklenenden uzun sürüyor. Kalite kontrolü korunuyor.'
    : `Bu aşama için tahmini bekleme: ${Math.max(0,low-stageElapsed)}–${Math.max(0,high-stageElapsed)} sn. Süre yoğunluğa göre değişebilir.`};
}

export async function analysisRequest(endpoint, id, method='GET', signal) {
  const response=await fetch(`${endpoint.replace(/\/$/,'')}/analysis/${encodeURIComponent(id)}`,{method,signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)])});
  const result=await response.json();
  if (!response.ok && !result.status) throw new Error(result.error||'Analiz servisine ulaşılamadı.');
  return result;
}
