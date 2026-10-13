const KEY='goal-illusion-theme';
const valid=value=>['system','light','dark'].includes(value);
let preference='system',storage,system;
if(typeof document!=='undefined') {
  try {storage=localStorage;const saved=storage.getItem(KEY);if(valid(saved))preference=saved;}catch{}
  system=matchMedia('(prefers-color-scheme: dark)');system.addEventListener('change',applyTheme);
  window.addEventListener('storage',event=>{if(event.key===KEY){preference=valid(event.newValue)?event.newValue:'system';applyTheme();}});applyTheme();
}
export const themePreference=()=>preference;
export function setTheme(value){if(!valid(value))throw new Error('Unsupported theme');preference=value;try{storage?.setItem(KEY,value);}catch{}applyTheme();}
function applyTheme(){if(typeof document==='undefined')return;document.documentElement.dataset.theme=preference==='system'?(system.matches?'dark':'light'):preference;window.dispatchEvent(new CustomEvent('themechange',{detail:preference}));}
