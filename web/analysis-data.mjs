import {t} from './i18n.mjs';
export async function loadAnalysisBundle(signal) {
  // One response binds the displayed shots to the exact evidence used by AI.
  const response=await fetch(`data/analysis.json?fresh=${Date.now()}`,{cache:'no-store',signal});
  if(!response.ok)throw new Error(t('Maç verileri yüklenemedi.'));
  const bundle=await response.json();
  if(!bundle.snapshot?.matches || bundle.source_updated_at!==bundle.snapshot.updated_at)
    throw new Error(t('Maç veri paketi henüz hazır değil. Biraz sonra yeniden dene.'));
  bundle.cache_status=response.headers.get('X-Goal-Illusion-Data-Status')==='cached'?'cached':'network';
  return bundle;
}

export async function consistentAnalysis(data, request, reload) {
  for(let attempt=0;attempt<2;attempt++) {
    if(!data?.item?.facts?.fingerprint)throw new Error(t('Bu maçın doğrulanmış analiz verileri henüz hazır değil.'));
    const result=await request(data);
    if(result.status!=='data_changed'&&(!result.fingerprint||result.fingerprint===data.item.facts.fingerprint))
      return {data,result};
    if(!attempt)data=await reload();
  }
  throw new Error(t('Site ve analiz servisi güncelleniyor. Biraz sonra yeniden dene.'));
}
