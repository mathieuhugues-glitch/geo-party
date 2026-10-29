// Data integrity checks: node tools/check-data.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['data/geo-data.js', 'data/sim.js', 'data/worldmap.js', 'data/landmarks.js', 'data/stats.js', 'data/mystery.js', 'data/zoom.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const Q = require('../js/questions.js');
const W = ctx.window, GEO = W.GEO_DATA, SIM = W.GEO_SIM;
const db = Q.makeDB(GEO, SIM, { landmarks: W.GEO_LANDMARKS, stats: W.GEO_STATS, mystery: W.GEO_MYSTERY, zoom: W.GEO_ZOOM });
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
// ---- landmarks ----
const credits = fs.readFileSync(path.join(root, 'CREDITS.md'), 'utf8');
const lmIds = new Set();
for (const l of W.GEO_LANDMARKS) {
  if (lmIds.has(l.id)) err('dup landmark ' + l.id); lmIds.add(l.id);
  const f = path.join(root, 'assets/landmarks', l.id + '.jpg');
  if (!fs.existsSync(f)) err('no landmark photo ' + l.id); else { const kb = fs.statSync(f).size / 1024; if (kb > 200 || kb < 15) err('landmark photo size ' + l.id + ' ' + kb.toFixed(0) + ' KB'); }
  if (!(Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180) || !l.name || !l.place || !l.credit || ![1, 2, 3].includes(l.t)) err('bad landmark ' + l.id);
  if (!db.by[l.cc]) err('landmark country ' + l.id);
  if (!credits.includes('assets/landmarks/' + l.id + '.jpg')) err('landmark missing from CREDITS.md ' + l.id);
}
// landmark must lie inside (or within 25 km of) the bounding box of its country's shape is hard to test offline; check distance to the country's capital is plausible (< 3500 km, except big countries)
const bigC = new Set(['US', 'RU', 'CN', 'AU', 'CA', 'BR', 'AR', 'CL', 'IN']);
for (const l of W.GEO_LANDMARKS) { const c = db.by[l.cc]; const d = Q.haversine(l.lat, l.lon, c.lat, c.lon); if (d > (bigC.has(l.cc) ? 4500 : 1500)) err('landmark far from its country capital: ' + l.id + ' ' + d.toFixed(0) + ' km'); }
// ---- mystery clues: never the country name, its capital or demonym ----
const DEMONYM = { FR: 'French', IT: 'Italian', JP: 'Japanese', BR: 'Brazilian', EG: 'Egyptian', AU: 'Australian|Aussie', CA: 'Canadian', MX: 'Mexican', IN: 'Indian', CN: 'Chinese', DE: 'German', ES: 'Spanish|Spaniard', GB: 'British|English|Briton', US: 'American', RU: 'Russian', GR: 'Greek|Hellenic', TR: 'Turkish|Turk', AR: 'Argentine|Argentinian', SE: 'Swedish|Swede', NO: 'Norwegian', PT: 'Portuguese', NL: 'Dutch|Holland', CH: 'Swiss', TH: 'Thai', VN: 'Vietnamese', PE: 'Peruvian', KE: 'Kenyan', MA: 'Moroccan', KR: 'Korean', IE: 'Irish', PL: 'Polish|Pole', NZ: 'Kiwi|Zealander', CU: 'Cuban', IS: 'Icelandic|Icelander', FI: 'Finnish|Finn', AT: 'Austrian|Viennese', CO: 'Colombian', NG: 'Nigerian', ID: 'Indonesian', BE: 'Belgian', DK: 'Danish|Dane', BT: 'Bhutanese', MN: 'Mongolian|Mongol', MG: 'Malagasy', NP: 'Nepali|Nepalese', LK: 'Sri Lankan|Ceylon', ET: 'Ethiopian|Abyssinia', BO: 'Bolivian|Boliviano', UY: 'Uruguayan', KH: 'Cambodian|Khmer|Angkor', JO: 'Jordanian', GE: 'Georgian', EE: 'Estonian', HR: 'Croatian|Croat', PH: 'Filipino|Philippine', SN: 'Senegalese', KZ: 'Kazakh', OM: 'Omani', CR: 'Costa Rican', FJ: 'Fijian', MT: 'Maltese', LU: 'Luxembourgish|Luxembourger', TZ: 'Tanzanian|Kilimanjaro', LA: 'Laotian|Lao' };
const myIds = new Set();
for (const m of W.GEO_MYSTERY) {
  const c = db.by[m.c]; if (!c) { err('mystery unknown country ' + m.c); continue; }
  if (myIds.has(m.c)) err('dup mystery ' + m.c); myIds.add(m.c);
  if (![1, 2, 3].includes(m.t) || !m.c1 || !m.c2 || !m.c3) err('mystery fields ' + m.c);
  if (!DEMONYM[m.c]) err('no demonym list for ' + m.c);
  const banned = [c.n, c.cap].concat((DEMONYM[m.c] || '').split('|')).filter(Boolean);
  for (const clue of [m.c1, m.c2, m.c3]) for (const b of banned) if (new RegExp('\\b' + b.normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '\\b', 'i').test(clue.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) err('mystery clue for ' + m.c + ' contains "' + b + '": ' + clue);
}
// ---- zoom out ----
for (const z of W.GEO_ZOOM) {
  if (!db.by[z.c]) err('zoom unknown ' + z.c);
  const files = [z.c.toLowerCase() + '.jpg'].concat(z.layers.map((_, i) => z.c.toLowerCase() + '-' + (i + 1) + '.jpg'));
  files.forEach(f => { if (!fs.existsSync(path.join(root, 'assets/zoom', f))) err('missing zoom image ' + f); });
  if (!(z.fx > 0 && z.fx < 1 && z.fy > 0 && z.fy < 1 && z.s0 >= 4)) err('zoom geometry ' + z.c);
  z.layers.forEach(L => { const w = 1 / L[2]; if (L[0] < 0 || L[1] < 0 || L[0] + w > 1.0001 || L[1] + w > 1.0001) err('zoom layer outside ' + z.c); if (z.fx < L[0] || z.fx > L[0] + w || z.fy < L[1] || z.fy > L[1] + w) err('zoom spot outside detail layer ' + z.c); });
}
// ---- higher or lower stats ----
for (const [k, v] of Object.entries(W.GEO_STATS)) { if (!db.by[k]) err('stats unknown ' + k); if (!(v[0] > 0 && v[1] > 0)) err('stats value ' + k); }
// ---- tier split per difficulty ----
const splitWant = { easy: { 6: [3, 2, 1], 10: [5, 4, 1], 15: [8, 5, 2] }, normal: { 6: [2, 2, 2], 10: [3, 4, 3], 15: [5, 5, 5] }, expert: { 6: [1, 2, 3], 10: [1, 4, 5], 15: [2, 5, 8] } };
for (const d in splitWant) for (const n in splitWant[d]) if (Q.tierSplit(+n, d).join() !== splitWant[d][n].join()) err('tierSplit ' + d + ' ' + n + ' = ' + Q.tierSplit(+n, d));
// Generate many games and validate every question
let nq = 0;
const DIFFS = ['easy', 'normal', 'expert'], NS = [6, 10, 15];
for (let g = 0; g < 300; g++) {
  const rnd = Q.seededRandom(g + 1);
  const diff = DIFFS[g % 3], n = NS[Math.floor(g / 3) % 3];
  for (const r of Q.ROUND_ORDER) {
    const { questions } = Q.generateRound(db, r, n, {}, { rnd, rotate: g % 2 === 0, difficulty: diff });
    if (questions.length !== n) err(r + ' generated ' + questions.length + ' instead of ' + n);
    const tc = [1, 2, 3].map(t => questions.filter(q => q.tier === t).length);
    if (tc.join() !== Q.tierSplit(n, diff).join()) err(r + ' tier mix ' + tc + ' for ' + diff + ' ' + n);
    let lastTier = 0;
    const tgt = new Set();
    for (const q of questions) {
      nq++;
      if (tgt.has(q.target)) err('duplicate target in round ' + r + ' ' + q.target); tgt.add(q.target);
      if (q.tier < lastTier) err('tier order ' + r); lastTier = q.tier;
      if (!Q.TIMES[q.kind]) err('no timer for kind ' + q.kind);
      if (q.kind === 'map' || q.kind === 'landmark') { if (!isFinite(q.lat) || !q.label) err('pin target ' + q.target); continue; }
      if (q.kind === 'hilo') {
        if (q.options.length !== 2 || q.codes[0] === q.codes[1]) err('hilo options ' + q.target);
        const big = q.values[0] > q.values[1] ? 0 : 1, want = q.lower ? 1 - big : big;
        if (q.correct !== want) err('hilo correct ' + q.target);
        const ratio = Math.max(...q.values) / Math.min(...q.values), [lo, hi] = Q.HILO_RATIO[q.tier];
        if (!(ratio >= lo && ratio < hi)) err('hilo ratio ' + q.target + ' ' + ratio);
        const si = q.stat === 'pop' ? 0 : 1; q.codes.forEach((c, i) => { if (W.GEO_STATS[c][si] !== q.values[i] || db.by[c].n !== q.options[i]) err('hilo data ' + c); });
        continue;
      }
      if (q.options.length !== 4) err(r + ' ' + q.target + ' has ' + q.options.length + ' options: ' + q.options.join('/'));
      if (new Set(q.options.map(Q.norm)).size !== q.options.length) err('duplicate options ' + q.options.join('/'));
      if (!(q.correct >= 0 && q.correct < q.options.length)) err('correct missing');
      const t = db.by[q.target];
      if (!t) { err('unknown target ' + q.target); continue; }
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
// Seen-avoidance: a second game (same evening) must not repeat targets while the pool allows it
for (const diff of DIFFS) {
  const seen = {}; Q.ROUND_ORDER.forEach(k => seen[k] = new Set());
  const rnd = Q.seededRandom(99);
  for (let game = 0; game < 2; game++) for (const r of Q.ROUND_ORDER) {
    const g = Q.generateRound(db, r, 10, seen, { rnd, difficulty: diff });
    const rep = g.used.filter(x => seen[r].has(x));
    if (game === 1 && rep.length && !g.resets.length) err('seen repeat in ' + r + ' (' + diff + '): ' + rep.join(','));
    g.resets.forEach(c => seen[r].delete(c)); g.used.forEach(c => seen[r].add(c));
  }
}
// Scoring sanity
if (Q.mysteryPoints(true, 0) !== 1000 || Q.mysteryPoints(true, 6999) < 700 || Q.mysteryPoints(true, 7000) !== 700 || Q.mysteryPoints(true, 14000) !== 400 || Q.mysteryPoints(true, 21000) < 200 || Q.mysteryPoints(false, 0) !== 0) err('mysteryPoints');
if (Q.zoomPoints(true, 0) !== 1000 || Q.zoomPoints(true, Q.ZOOM_MS) !== 300 || Q.zoomPoints(true, Q.ZOOM_TIME) !== 300 || Q.zoomPoints(false, 0) !== 0) err('zoomPoints');
if (Q.mcPoints(true, 12000, Q.HILO_TIME) !== 500) err('hilo points');
if (Q.fmtStat('pop', 38012345) !== '38.0 M' || Q.fmtStat('area', 450295) !== '450,295 km²') err('fmtStat ' + Q.fmtStat('pop', 38012345) + ' ' + Q.fmtStat('area', 450295));
if (Q.mcPoints(true, 0) !== 1000 || Q.mcPoints(true, 15000) !== 500 || Q.mcPoints(false, 0) !== 0) err('mcPoints');
if (Q.streakBonus(1) !== 0 || Q.streakBonus(2) !== 100 || Q.streakBonus(9) !== 500) err('streak');
if (Q.mapPoints(10) !== 1000 || Math.abs(Q.mapPoints(500) - 500) > 5 || Q.mapPoints(3000) > 15) err('mapPoints ' + Q.mapPoints(500) + ' ' + Q.mapPoints(3000));
console.log('Pool sizes [easy, medium, hard] per round:', JSON.stringify(counts));
console.log('Totals:', Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.reduce((a, b) => a + b)])));
console.log('Questions validated:', nq, 'errors:', errors);
process.exit(errors ? 1 : 0);
