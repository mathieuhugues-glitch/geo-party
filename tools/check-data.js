// Data integrity checks: node tools/check-data.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['data/geo-data.js', 'data/sim.js', 'data/worldmap.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const Q = require('../js/questions.js');
const GEO = ctx.window.GEO_DATA, SIM = ctx.window.GEO_SIM, db = Q.makeDB(GEO, SIM);
let errors = 0; const err = m => { errors++; console.error('ERROR:', m); };
const counts = {};
for (const r of Q.ROUND_ORDER) { counts[r] = [1, 2, 3].map(t => Q.pool(db, r, t).length); }
for (const c of GEO.countries) {
  if (!fs.existsSync(path.join(root, 'flags', c.c.toLowerCase() + '.svg'))) err('no flag ' + c.c);
  if (c.st && !GEO.shapes[c.c]) err('no shape ' + c.c);
  if ((c.ct || c.mt) && !(isFinite(c.lat) && isFinite(c.lon) && Math.abs(c.lat) <= 90)) err('bad coords ' + c.c);
  if ((c.ct || c.mt) && !c.cap) err('no capital ' + c.c);
  if (c.mt && (c.lat > GEO.countries.length && 0)) err('x');
}
// Check capital coordinates fall inside the country's own shape bbox region roughly (sanity: lat/lon vs NE label) - skipped; spot list:
const spot = { FR: [48.86, 2.35], AU: [-35.3, 149.13], CH: [46.95, 7.45], NG: [9.07, 7.48], MM: [19.76, 96.08], TR: [39.93, 32.86], CA: [45.42, -75.69], BR: [-15.79, -47.88], US: [38.9, -77.04], KZ: [51.17, 71.43], BI: [-3.43, 29.93], TZ: [-6.17, 35.74] };
for (const [k, [la, lo]] of Object.entries(spot)) { const c = db.by[k]; const d = Q.haversine(la, lo, c.lat, c.lon); if (d > 30) err('capital coords off for ' + k + ' by ' + d.toFixed(0) + ' km'); }
// Generate many games and validate every question
let nq = 0;
for (let g = 0; g < 300; g++) {
  const rnd = Q.seededRandom(g + 1);
  for (const r of Q.ROUND_ORDER) {
    const { questions } = Q.generateRound(db, r, [5, 10, 15, 20][g % 4], {}, { rnd, rotate: g % 2 === 0 });
    let lastTier = 0;
    for (const q of questions) {
      nq++;
      if (q.tier < lastTier) err('tier order ' + r); lastTier = q.tier;
      if (q.kind === 'map') { if (!isFinite(q.lat)) err('map target coords ' + q.target); continue; }
      if (q.options.length !== 4) err(r + ' ' + q.target + ' has ' + q.options.length + ' options: ' + q.options.join('/'));
      if (new Set(q.options.map(Q.norm)).size !== q.options.length) err('duplicate options ' + q.options.join('/'));
      if (!(q.correct >= 0 && q.correct < q.options.length)) err('correct missing');
      const t = db.by[q.target];
      const want = r === 'capitals' ? (q.reverse ? t.n : t.cap) : t.n;
      if (q.options[q.correct] !== want) err('wrong correct label ' + q.target);
      if (r === 'capitals' && !q.reverse) { // no other option may be the capital of the same country
        q.options.forEach((o, i) => { if (i !== q.correct && Q.norm(o) === Q.norm(t.cap)) err('dup capital'); });
      }
      if (r === 'flags' && !q.flag) err('no flag');
      if (r === 'shapes' && !GEO.shapes[q.shape]) err('no shape for q');
    }
  }
}
// Scoring sanity
if (Q.mcPoints(true, 0) !== 1000 || Q.mcPoints(true, 15000) !== 500 || Q.mcPoints(false, 0) !== 0) err('mcPoints');
if (Q.streakBonus(1) !== 0 || Q.streakBonus(2) !== 100 || Q.streakBonus(9) !== 500) err('streak');
if (Q.mapPoints(10) !== 1000 || Math.abs(Q.mapPoints(500) - 500) > 5 || Q.mapPoints(3000) > 15) err('mapPoints ' + Q.mapPoints(500) + ' ' + Q.mapPoints(3000));
console.log('Pool sizes [easy, medium, hard] per round:', JSON.stringify(counts));
console.log('Totals:', Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.reduce((a, b) => a + b)])));
console.log('Questions validated:', nq, 'errors:', errors);
process.exit(errors ? 1 : 0);
