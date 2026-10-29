/* Geo Party - question generation (shared by host page and node data checks) */
(function (root) {
  'use strict';
  const FLAG_GROUPS = [
    ['TD','RO','AD','MD'], ['ID','MC','PL','SG'], ['IE','CI','IT'], ['NL','LU','HR','PY','RU'],
    ['AU','NZ','FJ','TV'], ['SN','ML','GN','CM'], ['SI','SK','RU','RS'], ['NO','IS','DK','FI','SE'],
    ['VE','EC','CO'], ['HN','NI','SV','GT'], ['AT','LV','LB'], ['QA','BH'], ['HT','LI'],
    ['JO','PS','SD','KW','AE'], ['EG','IQ','SY','YE'], ['LT','BO','GH','ET'], ['CZ','PH'],
    ['US','LR','MY'], ['CU','GR'], ['BD','JP','PW'], ['NE','IN'], ['KZ','PW'], ['CN','VN'],
    ['TR','TN'], ['BG','HU','IR'], ['PE','CA'], ['BE','DE'], ['ZM','ZW'], ['GA','SL'], ['DM','GD']
  ];
  const SHAPE_GROUPS = [
    ['BO','PY'], ['ZM','CD'], ['KG','TJ'], ['LV','LT','EE'], ['SK','CZ','HU','AT'], ['GE','AM','AZ'],
    ['UZ','TM','KZ'], ['GT','HN','SV','NI'], ['CR','PA'], ['GH','TG','BJ'], ['NE','ML','TD','MR'],
    ['GN','SL','LR','CI'], ['RW','BI','UG'], ['BG','RS','MK'], ['IQ','SY','JO'], ['AO','NA','BW','ZW'],
    ['ZM','MW','MZ'], ['GY','SR','UY'], ['EC','PE','CO'], ['CF','SS','CM'], ['SN','GM','GW'],
    ['BE','NL','LU'], ['LA','KH','TH','VN'], ['NP','BT','BD'], ['OM','YE','SA','AE'], ['KP','KR'],
    ['SI','HR','BA','ME'], ['DZ','LY','TN','MA'], ['SO','ET','ER','DJ'], ['BY','UA','MD'], ['TL','BN']
  ];
  const ROUNDS = {
    flags:    { id: 'flags',    num: 1, title: 'Flags',    icon: '🏳️', desc: 'Name the country from its flag' },
    shapes:   { id: 'shapes',   num: 2, title: 'Shapes',   icon: '🗺️', desc: 'Name the country from its silhouette' },
    capitals: { id: 'capitals', num: 3, title: 'Capitals', icon: '🏛️', desc: 'Capital cities - beware of big-city traps' },
    map:      { id: 'map',      num: 4, title: 'Map pin',  icon: '📍', desc: 'Drop a pin on the capital - closer is better' },
    landmarks:{ id: 'landmarks',num: 5, title: 'Landmarks', icon: '📸', desc: 'Pin the famous landmark on the world map' },
    hilo:     { id: 'hilo',     num: 6, title: 'Higher or Lower', icon: '⚖️', desc: 'Which country has more people - or more land?' },
    mystery:  { id: 'mystery',  num: 7, title: 'Mystery Country', icon: '🕵️', desc: 'Three clues, one country - answer early for more points' },
    zoom:     { id: 'zoom',     num: 8, title: 'Zoom Out', icon: '🛰️', desc: 'A satellite photo zooms out - name the country' }
  };
  const ROUND_ORDER = ['flags', 'shapes', 'capitals', 'map', 'landmarks', 'hilo', 'mystery', 'zoom'];
  const TIER_FIELD = { flags: 'ft', shapes: 'st', capitals: 'ct', map: 'mt' };
  const PIN_KINDS = { map: 1, landmark: 1 };
  const isPin = (q) => !!(q && PIN_KINDS[q.kind]);
  const TIER_NAMES = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

  function norm(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''); }
  function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, t = Math.PI / 180;
    const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // Difficulty: share of easy / medium / hard questions in each round (always played easy -> hard)
  const DIFFICULTY = { easy: [0.5, 0.4, 0.1], normal: null, expert: [0.1, 0.4, 0.5] };
  const DIFF_NAMES = { easy: 'Easy', normal: 'Normal', expert: 'Expert' };
  function tierSplit(n, diff) {
    const r = DIFFICULTY[diff];
    if (!r) { const e = Math.floor(n / 3), h = Math.floor(n / 3); return [e, n - e - h, h]; }
    const e = Math.round(n * r[0] + 1e-9), h = Math.round(n * r[2] + 1e-9);
    return [e, n - e - h, h];
  }

  // Scoring
  const MC_TIME = 15000, MAP_TIME = 20000, HILO_TIME = 12000, CLUE_MS = 7000, MYSTERY_TIME = 3 * CLUE_MS, ZOOM_TIME = 15000, ZOOM_MS = 13000;
  const TIMES = { flags: MC_TIME, shapes: MC_TIME, capitals: MC_TIME, map: MAP_TIME, landmark: MAP_TIME, hilo: HILO_TIME, mystery: MYSTERY_TIME, zoom: ZOOM_TIME };
  // Mystery Country: up to 1000 during clue 1, 700 during clue 2, 400 during clue 3 (linear decay inside each window)
  function mysteryPoints(correct, elapsedMs) {
    if (!correct) return 0;
    const t = Math.max(0, Math.min(MYSTERY_TIME, elapsedMs)), w = Math.min(2, Math.floor(t / CLUE_MS)), f = (t - w * CLUE_MS) / CLUE_MS;
    const hi = [1000, 700, 400][w], lo = [700, 400, 200][w];
    return Math.round(hi - (hi - lo) * Math.min(1, f));
  }
  // Zoom Out: 1000 at the tight start, down to 300 once fully zoomed out
  function zoomPoints(correct, elapsedMs) {
    if (!correct) return 0;
    return Math.round(1000 - 700 * Math.max(0, Math.min(1, elapsedMs / ZOOM_MS)));
  }
  function fmtStat(stat, v) {
    if (stat === 'area') return Math.round(v).toLocaleString('en-US') + ' km²';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + ' B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + ' M';
    return Math.round(v).toLocaleString('en-US');
  }
  function mcPoints(correct, elapsedMs, timeMs) {
    if (!correct) return 0;
    const f = Math.max(0, Math.min(1, elapsedMs / (timeMs || MC_TIME)));
    return Math.round(1000 - 500 * f);
  }
  function streakBonus(streak) { return Math.min(500, 100 * Math.max(0, streak - 1)); }
  // Map: 1000 within 50 km, exponential decay: ~500 at 500 km, ~100 at 1550 km, ~11 at 3000 km
  function mapPoints(km) {
    if (km == null || !isFinite(km)) return 0;
    if (km <= 50) return 1000;
    const p = Math.round(1000 * Math.exp(-(km - 50) / 650));
    return p < 5 ? 0 : p;
  }

  function makeDB(GEO, SIM, X) {
    X = X || {};
    const list = GEO.countries;
    const by = {}; list.forEach(c => by[c.c] = c);
    const shapeOK = c => c.st > 0 && !!GEO.shapes[c.c];
    function groupsOf(groups, code) { const s = new Set(); groups.forEach(g => { if (g.includes(code)) g.forEach(x => { if (x !== code && by[x]) s.add(x); }); }); return [...s]; }
    function nearestByCapital(code, filter) {
      const t = by[code];
      return list.filter(c => c.c !== code && (!filter || filter(c)))
        .map(c => [c, haversine(t.lat, t.lon, c.lat, c.lon)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    }
    const LM = (X.landmarks || []).map(l => Object.assign({}, l, { c: l.id }));
    const MY = (X.mystery || []).filter(m => by[m.c]);
    const ZO = (X.zoom || []).filter(z => by[z.c]);
    const ST = X.stats || {};
    return { list, by, shapeOK, groupsOf, nearestByCapital, GEO, SIM, LM, MY, ZO, ST };
  }
  // countries usable in Higher or Lower for a tier (well-known ones for the easier tiers)
  function hiloCountries(db, tier) {
    return db.list.filter(c => db.ST[c.c] && (tier === 3 ? true : tier === 2 ? c.ft <= 2 || c.mt === 1 : c.ft === 1 || c.mt === 1));
  }

  function pool(db, round, tier) {
    if (round === 'landmarks') return db.LM.filter(l => l.t === tier);
    if (round === 'mystery') return db.MY.filter(m => m.t === tier);
    if (round === 'zoom') return db.ZO.filter(z => z.t === tier);
    if (round === 'hilo') return hiloCountries(db, tier);
    const f = TIER_FIELD[round];
    return db.list.filter(c => c[f] === tier && (round !== 'shapes' || db.shapeOK(c)));
  }

  // pick n targets from a tier avoiding `seen` (Set of codes); returns {picked, resetCodes}
  function pickTargets(db, round, tier, n, seen, rnd) {
    const all = pool(db, round, tier);
    let fresh = shuffle(all.filter(c => !seen.has(c.c)), rnd);
    let picked = fresh.slice(0, n), reset = [];
    if (picked.length < n) { // tier exhausted: recycle the oldest seen ones of this tier
      reset = all.map(c => c.c);
      const rest = shuffle(all.filter(c => !picked.includes(c)), rnd);
      picked = picked.concat(rest.slice(0, n - picked.length));
    }
    return { picked, reset };
  }

  function uniqueFill(target, cands, need, keyFn) {
    const out = [], keys = new Set([keyFn(target)]);
    for (const c of cands) { if (out.length >= need) break; const k = keyFn(c); if (keys.has(k)) continue; keys.add(k); out.push(c); }
    return out;
  }

  function flagDistractors(db, t, tier, rnd) {
    const sim = (db.SIM && db.SIM.flag[t.c]) || [];
    const others = db.list.filter(c => c.c !== t.c);
    let cands;
    if (tier === 1) {
      const avoid = new Set(sim.slice(0, 4).concat(db.groupsOf(FLAG_GROUPS, t.c)));
      cands = shuffle(others.filter(c => c.ft <= 2 && !avoid.has(c.c)), rnd);
    } else if (tier === 2) {
      const near = shuffle(sim.slice(0, 8).map(x => db.by[x]).filter(Boolean), rnd).slice(0, 1);
      const cont = shuffle(others.filter(c => c.cont === t.cont), rnd);
      cands = near.concat(cont, shuffle(others, rnd));
    } else {
      const grp = shuffle(db.groupsOf(FLAG_GROUPS, t.c).map(x => db.by[x]), rnd);
      const near = sim.slice(0, 10).map(x => db.by[x]).filter(Boolean);
      cands = grp.concat(near, shuffle(others, rnd));
    }
    return uniqueFill(t, cands, 3, c => c.c);
  }

  function shapeDistractors(db, t, tier, rnd) {
    const others = db.list.filter(c => c.c !== t.c && db.shapeOK(c));
    const sim = ((db.SIM && db.SIM.shape[t.c]) || []).map(x => db.by[x]).filter(c => c && db.shapeOK(c));
    let cands;
    if (tier === 1) cands = shuffle(others.filter(c => c.st <= 2 && c.sub !== t.sub), rnd);
    else if (tier === 2) cands = shuffle(others.filter(c => c.cont === t.cont), rnd).concat(shuffle(others, rnd));
    else {
      const grp = shuffle(db.groupsOf(SHAPE_GROUPS, t.c).map(x => db.by[x]).filter(c => db.shapeOK(c)), rnd);
      const sameSub = shuffle(others.filter(c => c.sub === t.sub), rnd);
      const simCont = sim.filter(c => c.cont === t.cont);
      cands = grp.concat(simCont.slice(0, 2), sameSub, simCont, shuffle(others.filter(c => c.cont === t.cont), rnd), others);
    }
    return uniqueFill(t, cands, 3, c => c.c);
  }

  function buildMC(kind, t, tier, prompt, correctLabel, distractorLabels, rnd, extra) {
    const opts = shuffle([{ label: correctLabel, ok: true }].concat(distractorLabels.map(l => ({ label: l, ok: false }))), rnd);
    return Object.assign({ kind, target: t.c, tier, prompt, options: opts.map(o => o.label), correct: opts.findIndex(o => o.ok) }, extra || {});
  }

  function capitalQuestion(db, t, tier, rnd, preferReverse) {
    const cities = (t.cities || []).filter(x => norm(x) !== norm(t.cap));
    const reverse = cities.length < 2 || preferReverse;
    if (reverse) {
      const near = db.nearestByCapital(t.c);
      const pick = tier === 3 ? near.slice(0, 3) : shuffle(near.slice(0, tier === 1 ? 10 : 6), rnd).slice(0, 3);
      return buildMC('capitals', t, tier, t.cap + ' is the capital of…', t.n, pick.map(c => c.n), rnd, { reverse: true, subject: t.cap });
    }
    let labels = shuffle(cities, rnd).slice(0, 3);
    if (labels.length < 3) {
      const near = db.nearestByCapital(t.c, c => c.ct > 0 || c.mt > 0);
      for (const c of near) { if (labels.length >= 3) break; if (!labels.some(l => norm(l) === norm(c.cap)) && norm(c.cap) !== norm(t.cap)) labels.push(c.cap); }
    }
    return buildMC('capitals', t, tier, 'What is the capital of ' + t.n + '?', t.cap, labels, rnd, { reverse: false, subject: t.n });
  }

  // 3 country distractors: easy = well-known countries elsewhere, medium = same continent, hard = neighbours
  function countryDistractors(db, t, tier, rnd) {
    const others = db.list.filter(c => c.c !== t.c);
    let cands;
    if (tier === 1) cands = shuffle(others.filter(c => c.ft <= 2 && c.cont !== t.cont), rnd).slice(0, 2).concat(shuffle(others.filter(c => c.ft <= 2 && c.cont === t.cont), rnd), shuffle(others.filter(c => c.ft <= 2), rnd));
    else if (tier === 2) cands = shuffle(others.filter(c => c.cont === t.cont && c.ft <= 2), rnd).concat(shuffle(others.filter(c => c.cont === t.cont), rnd), shuffle(others, rnd));
    else cands = shuffle(db.nearestByCapital(t.c).slice(0, 6), rnd).concat(shuffle(others.filter(c => c.sub === t.sub), rnd), shuffle(others.filter(c => c.cont === t.cont), rnd));
    return uniqueFill(t, cands, 3, c => c.c);
  }

  // Higher or Lower: pairs by ratio - easy > 3x apart, medium 1.5-3x, hard within ~20%
  const HILO_RATIO = { 1: [3, 1e9], 2: [1.5, 3], 3: [1.03, 1.2] };
  function hiloPairs(db, tier, n, seenSet, rnd, usedCodes) {
    const cs = hiloCountries(db, tier), [lo, hi] = HILO_RATIO[tier], out = [];
    const tryPick = (allowSeen) => {
      for (let k = 0; k < 4000 && out.length < n; k++) {
        const stat = rnd() < 0.5 ? 'pop' : 'area', si = stat === 'pop' ? 0 : 1;
        const a = cs[Math.floor(rnd() * cs.length)], b = cs[Math.floor(rnd() * cs.length)];
        if (!a || !b || a.c === b.c || usedCodes.has(a.c) || usedCodes.has(b.c)) continue;
        const va = db.ST[a.c][si], vb = db.ST[b.c][si], r = Math.max(va, vb) / Math.min(va, vb);
        if (!(r >= lo && r < hi)) continue;
        const key = stat + ':' + [a.c, b.c].sort().join('-');
        if (!allowSeen && seenSet.has(key)) continue;
        usedCodes.add(a.c); usedCodes.add(b.c);
        out.push({ a, b, stat, key, va, vb });
      }
    };
    tryPick(false); if (out.length < n) tryPick(true);
    return out;
  }
  function hiloQuestion(p, tier, rnd) {
    const lower = rnd() < 0.25, big = p.va > p.vb ? 0 : 1;
    const prompt = p.stat === 'pop' ? (lower ? 'Which country has FEWER people?' : 'Which country has MORE people?') : (lower ? 'Which country is SMALLER by area?' : 'Which country is BIGGER by area?');
    return { kind: 'hilo', target: p.key, tier, stat: p.stat, lower, prompt, subtitle: p.stat === 'pop' ? 'Population (2023)' : 'Total area, including lakes and rivers',
      codes: [p.a.c, p.b.c], flags: [p.a.c.toLowerCase(), p.b.c.toLowerCase()], options: [p.a.n, p.b.n], values: [p.va, p.vb], valueText: [fmtStat(p.stat, p.va), fmtStat(p.stat, p.vb)], correct: lower ? 1 - big : big };
  }

  function seededRandom(seed) { let s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // Generate a whole round. seen: {flags:Set,...}. Returns {questions, used:[codes], resets:[codes]}
  function generateRound(db, round, n, seen, opts) {
    const rnd = (opts && opts.rnd) || Math.random;
    const split = tierSplit(n, opts && opts.difficulty), qs = [], used = [], resets = [];
    const seenSet = seen[round] || new Set();
    if (round === 'hilo') {
      const usedCodes = new Set();
      split.forEach((cnt, i) => hiloPairs(db, i + 1, cnt, seenSet, rnd, usedCodes).forEach(p => { used.push(p.key); qs.push(hiloQuestion(p, i + 1, rnd)); }));
      return { questions: qs, used, resets };
    }
    split.forEach((cnt, i) => {
      const tier = i + 1;
      const { picked, reset } = pickTargets(db, round, tier, cnt, seenSet, rnd);
      resets.push(...reset);
      // within a tier, keep order random but each tier comes after the previous one
      picked.forEach((t, k) => {
        used.push(t.c);
        let q;
        if (round === 'flags') q = buildMC('flags', t, tier, 'Which country does this flag belong to?', t.n, flagDistractors(db, t, tier, rnd).map(c => c.n), rnd, { flag: t.c.toLowerCase() });
        else if (round === 'shapes') {
          let tf = null;
          if (opts && opts.rotate && tier === 3) { const choices = ['rotate(90deg)', 'rotate(180deg)', 'rotate(270deg)', 'scaleX(-1)', 'scaleY(-1)']; tf = choices[Math.floor(rnd() * choices.length)]; }
          q = buildMC('shapes', t, tier, 'Which country has this shape?', t.n, shapeDistractors(db, t, tier, rnd).map(c => c.n), rnd, { shape: t.c, transform: tf });
        } else if (round === 'capitals') q = capitalQuestion(db, t, tier, rnd, (k % 3 === 2));
        else if (round === 'map') q = { kind: 'map', target: t.c, tier, prompt: (norm(t.cap) === norm(t.n) ? 'Where is ' + t.n + '?' : 'Where is ' + t.cap + '?'), subtitle: norm(t.cap) === norm(t.n) ? '' : t.n, lat: t.lat, lon: t.lon, cap: t.cap, label: t.cap };
        else if (round === 'landmarks') q = { kind: 'landmark', target: t.id, tier, prompt: 'Where is this landmark?', subtitle: t.place, label: t.name, img: 'assets/landmarks/' + t.id + '.jpg', credit: t.credit, lat: t.lat, lon: t.lon, cc: t.cc };
        else {
          const c = db.by[t.c], ds = countryDistractors(db, c, tier, rnd).map(x => x.n);
          if (round === 'mystery') q = buildMC('mystery', c, tier, 'Which country is this?', c.n, ds, rnd, { clues: [t.c1, t.c2, t.c3] });
          else q = buildMC('zoom', c, tier, 'Which country is this?', c.n, ds, rnd, { img: 'assets/zoom/' + c.c.toLowerCase(), fx: t.fx, fy: t.fy, s0: t.s0, layers: t.layers, border: t.border, spot: t.spot });
        }
        qs.push(q);
      });
    });
    return { questions: qs, used, resets };
  }

  const API = { ROUNDS, ROUND_ORDER, TIER_NAMES, TIER_FIELD, FLAG_GROUPS, SHAPE_GROUPS, MC_TIME, MAP_TIME, HILO_TIME, CLUE_MS, MYSTERY_TIME, ZOOM_TIME, ZOOM_MS, TIMES,
    DIFFICULTY, DIFF_NAMES, HILO_RATIO, isPin, makeDB, pool, generateRound, mcPoints, mysteryPoints, zoomPoints, fmtStat, streakBonus, mapPoints, haversine, shuffle, norm, tierSplit, seededRandom };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GPQ = API;
})(typeof window !== 'undefined' ? window : globalThis);
