import english from './translations.mjs';
const supported=new Set(['tr','en']);
export const supportedLanguage=value=>supported.has(value);
let current='tr';
if(typeof document!=='undefined') {
  let saved;try{saved=localStorage.getItem('goal-illusion-language');}catch{}
  const requested=new URL(location.href).searchParams.get('lang');
  current=supported.has(requested)?requested:supported.has(saved)?saved:navigator.language?.toLowerCase().startsWith('tr')?'tr':'en';
}
export const language=()=>current;
export const locale=()=>current==='en'?'en-GB':'tr-TR';
export function setLanguage(value) {
  if(!supported.has(value))throw new Error('Unsupported language');
  current=value;
  if(typeof document!=='undefined')try{localStorage.setItem('goal-illusion-language',current);}catch{}
}
export function t(source,...values) {
  if(source==null)return '';
  const tagged=Array.isArray(source);
  const key=tagged?source.reduce((key,part,index)=>key+part+(index<values.length?`{${index}}`:''),''):source;
  const entry=english[key];
  const translated=current==='en'?(entry&&typeof entry==='object'?entry[Number(values[entry.plural_index||0])===1?'one':'other']:entry??key):key;
  return translated.replace(/\{(\d+)\}/g,(_,i)=>String(values[i]??`{${i}}`));
}
let bindings;
export function translatePage() {
  if(!bindings) {
    bindings=[];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node=walker.currentNode,key=node.textContent.trim();
      if(Object.hasOwn(english,key))bindings.push(()=>{node.textContent=t(key);});
    }
    for(const node of document.querySelectorAll('[aria-label],[placeholder],meta[name="description"],meta[property="og:title"],meta[property="og:description"]')) {
      for(const attr of ['aria-label','placeholder','content']) {
        const key=node.getAttribute(attr);
        if(key&&Object.hasOwn(english,key))bindings.push(()=>node.setAttribute(attr,t(key)));
      }
    }
    const title=document.title;bindings.push(()=>{document.title=t(title);});
  }
  for(const update of bindings)update();
  document.documentElement.lang=current;
}
