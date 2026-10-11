// Display palettes for the supported clubs; light accents stay readable on dark cards.
const palettes={
  'England':['#f4f6fa','#d95061'],'Senegal':['#46c28b','#f3d263'],
  'Gaziantep FK':['#ed5263','#c2c8ce'],'Çorum FK':['#f16b72','#d5d9df'],
  'Konyaspor':['#61c996','#f1f5f3'],'Başakşehir':['#ffa754','#829de1'],
  'Rizespor':['#53cb9b','#6ba9eb'],'Fenerbahçe':['#f4da58','#779bea'],
  'Alanyaspor':['#ffa754','#60cc98'],'Erzurumspor FK':['#7dbaf4','#f2f6fa'],
  'Samsunspor':['#f06978','#f5f6f7'],'Trabzonspor':['#73c2e9','#db6d98'],
  'Gençlerbirliği':['#f06b75','#bdc4cc'],'Amed Sportif':['#62c997','#ec7b85'],
  'Galatasaray':['#ffc15b','#f46c76'],'Kasımpaşa':['#85a8ec','#f3f5fa'],
  'Beşiktaş':['#f0f2f5','#a0aab5'],'Göztepe':['#f1d159','#f27777'],
  'Eyüpspor':['#c19af0','#f3d269'],'Kocaelispor':['#64ce98','#bac7c3'],
  'Freiburg':['#f27c85','#d2d8de'],'Schalke 04':['#7babf5','#f2f5fa'],
  '1. FC Köln':['#f47783','#f3f5f7'],'Borussia Mönchengladbach':['#8cd1af','#f2f4f5'],
  'RB Leipzig':['#ef6c83','#f1f4f8'],'Eintracht Frankfurt':['#f1747e','#c7cdd5'],
  'Augsburg':['#70cd9d','#ed7980'],'Bayern München':['#f87185','#85aef3'],
  'Hoffenheim':['#80b5f1','#f1f4f8'],'Hamburger SV':['#82b6ee','#f3f5f8'],
  'Mainz 05':['#f47e88','#f4f5f7'],'Bayer Leverkusen':['#f77a84','#c3cad1'],
  'Paderborn':['#86b1f1','#bfc9d4'],'VfB Stuttgart':['#f3828c','#f3f5f7'],
  'Union Berlin':['#f37b83','#f1cc66'],'Elversberg':['#edf0f5','#a1aebc'],
  'Borussia Dortmund':['#f4dc58','#b6bdc6'],'Werder Bremen':['#62cf9d','#f2f6f4'],
};
export function matchColors(match){
  const home=palettes[match.home]||['#6de4ae','#c2d6cf'];
  const away=palettes[match.away]||['#77b5f5','#e4eafa'];
  return [home[0],away[0]===home[0]?away[1]:away[0]];
}
