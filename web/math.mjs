export function distribution(values, fixed = 0) {
  if (!Number.isInteger(fixed) || fixed < 0) throw new Error('Geçersiz sabit gol sayısı');
  let pmf = [1];
  for (const p of values) {
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) throw new Error('Geçersiz xG');
    const next = Array(pmf.length + 1).fill(0);
    pmf.forEach((v, i) => { next[i] += v * (1 - p); next[i + 1] += v * p; });
    pmf = next;
  }
  return [...Array(fixed).fill(0), ...pmf];
}
export function analyze(home, away, homeFixed = 0, awayFixed = 0) {
  const h = distribution(home, homeFixed), a = distribution(away, awayFixed);
  const scores = []; let win = 0, draw = 0, loss = 0;
  h.forEach((p, i) => a.forEach((q, j) => {
    const probability = p * q;
    scores.push({home: i, away: j, probability});
    if (i > j) win += probability; else if (i === j) draw += probability; else loss += probability;
  }));
  scores.sort((x, y) => y.probability - x.probability || x.home - y.home || x.away - y.away);
  return {h, a, scores, win, draw, loss};
}
