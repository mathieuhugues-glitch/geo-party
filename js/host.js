/* Geo Party - host (TV) logic. The host is the single source of truth; phones are thin clients. */
(function () {
  'use strict';
  const Q = window.GPQ, Snd = window.GPSound, MAP = window.GPMap;
  const params = new URLSearchParams(location.search);
  const FAST = params.has('fast') ? Math.max(0.05, parseFloat(params.get('fast')) || 0.25) : 1; // test helper: shortens pauses (not answer timers)
  const db = Q.makeDB(window.GEO_DATA, window.GEO_SIM, { landmarks: window.GEO_LANDMARKS, stats: window.GEO_STATS, mystery: window.GEO_MYSTERY, zoom: window.GEO_ZOOM });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#ff6b81', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ff922b', '#3bc9db', '#f783ac', '#a9e34b', '#9775fa', '#ffa8a8', '#63e6be'];
  const EMOJI = ['🦊', '🐼', '🐸', '🐙', '🦉', '🐯', '🐧', '🦄', '🐨', '🦁', '🐳', '🐵'];
  const LETTERS = ['A', 'B', 'C', 'D'];
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  /* ---------- stage scaling ---------- */
  function fit() { const s = Math.min(innerWidth / 1920, innerHeight / 1080); const st = $('#stage'); st.style.transform = 'scale(' + s + ')'; st.style.left = (innerWidth - 1920 * s) / 2 + 'px'; st.style.top = (innerHeight - 1080 * s) / 2 + 'px'; }
  addEventListener('resize', fit); fit();

  /* ---------- persistent settings & seen questions ---------- */
  const SEEN_KEY = 'geoparty.seen.v1', SET_KEY = 'geoparty.settings.v2', OLD_SET_KEY = 'geoparty.settings.v1';
  const COUNTS = [6, 10, 15], DIFFS = ['easy', 'normal', 'expert'];
  function loadSeen() { try { const o = JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; const r = {}; Q.ROUND_ORDER.forEach(k => r[k] = new Set(o[k] || [])); return r; } catch (e) { const r = {}; Q.ROUND_ORDER.forEach(k => r[k] = new Set()); return r; } }
  function saveSeen(s) { const o = {}; Q.ROUND_ORDER.forEach(k => o[k] = [...s[k]]); localStorage.setItem(SEEN_KEY, JSON.stringify(o)); }
  let seen = loadSeen();
  const settings = Object.assign({ rounds: Q.ROUND_ORDER.slice(), count: 10, difficulty: 'normal', rotate: false }, (() => {
    try {
      const v2 = JSON.parse(localStorage.getItem(SET_KEY)); if (v2) return v2;
      const v1 = JSON.parse(localStorage.getItem(OLD_SET_KEY)); // migrate the 4-round settings: keep choices, add the new rounds
      if (v1) return { rounds: (v1.rounds || []).concat(['landmarks', 'hilo', 'mystery', 'zoom']), rotate: !!v1.rotate };
    } catch (e) { }
    return {};
  })());
  settings.rounds = Q.ROUND_ORDER.filter(r => (settings.rounds || []).includes(r));
  if (!COUNTS.includes(settings.count)) settings.count = 10;
  if (!DIFFS.includes(settings.difficulty)) settings.difficulty = 'normal';
  const saveSettings = () => localStorage.setItem(SET_KEY, JSON.stringify(settings));

  /* ---------- state ---------- */
  const S = {
    phase: 'lobby', players: new Map(), conn2pid: new Map(), pid2conn: new Map(),
    game: null, paused: false, pending: null, timerInt: null
  };
  window.__gp = S; // debug / automated tests

  /* ---------- networking ---------- */
  const savedCode = sessionStorage.getItem('geoparty.room');
  const net = window.GPNet.createHost(savedCode, {
    onOpen(code) { sessionStorage.setItem('geoparty.room', code); showJoin(code); },
    onMessage(cid, m) { try { handle(cid, m); } catch (e) { console.error(e); } },
    onClose(cid) { const pid = S.conn2pid.get(cid); S.conn2pid.delete(cid); if (pid && S.pid2conn.get(pid) === cid) { S.pid2conn.delete(pid); const p = S.players.get(pid); if (p) { p.connected = false; } renderPlayersEverywhere(); checkAllAnswered(); } },
    onError(t) { toast(t); }
  });

  function joinUrl(code) {
    const u = new URL('play.html', location.href); u.search = ''; u.hash = '';
    u.searchParams.set('room', code); if (net.transport === 'local') u.searchParams.set('transport', 'local');
    return u.toString();
  }
  function showJoin(code) {
    $('#roomCode').textContent = code;
    const url = joinUrl(code);
    const base = new URL('play.html', location.href); base.search = '';
    $('#joinUrl').textContent = base.host + base.pathname;
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('#qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); } catch (e) { $('#qr').textContent = url; }
    $('#qr').dataset.url = url;
    const h = location.hostname;
    let warn = '';
    if (location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') warn = '⚠️ This page is opened from "' + (h || 'file') + '": phones cannot reach that address. For a real evening, open the hosted version of the game (see README).';
    if (net.transport === 'local') warn = '🧪 Test mode (transport=local): players must be tabs of this same browser.';
    $('#netWarn').textContent = warn;
  }

  function sendTo(pid, msg) { const cid = S.pid2conn.get(pid); if (cid) net.send(cid, msg); }
  function sendView(p) { sendTo(p.id, { t: 'view', v: viewFor(p) }); }
  function sendAllViews() { S.players.forEach(p => { if (p.connected) sendView(p); }); }

  function handle(cid, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') return onHello(cid, m);
    const pid = S.conn2pid.get(cid); const p = pid && S.players.get(pid); if (!p) return;
    p.lastSeen = Date.now(); if (!p.connected) { p.connected = true; renderPlayersEverywhere(); }
    if (m.t === 'answer') onAnswer(p, m);
    else if (m.t === 'pin') onPin(p, m);
    else if (m.t === 'ping') net.send(cid, { t: 'pong' });
  }

  function onHello(cid, m) {
    const name = String(m.name || '').trim().slice(0, 16);
    if (!name) return net.send(cid, { t: 'error', msg: 'Please enter a name.' });
    let p = m.id && S.players.get(m.id);
    if (!p) {
      const same = [...S.players.values()].find(x => x.name.toLowerCase() === name.toLowerCase());
      if (same) {
        // a connected player who pinged recently keeps the name; a silent/disconnected one is taken over (keeps score)
        if (same.connected && S.pid2conn.get(same.id) && Date.now() - (same.lastSeen || 0) < 10000) return net.send(cid, { t: 'error', msg: 'The name "' + name + '" is already taken - pick another one.' });
        p = same;
      }
    }
    if (!p) {
      if (S.players.size >= 12) return net.send(cid, { t: 'error', msg: 'The game is full (12 players max).' });
      const used = new Set([...S.players.values()].map(x => x.slot)); let slot = 0; while (used.has(slot)) slot++;
      p = { id: m.id && /^[a-z0-9]{6,24}$/i.test(m.id) ? m.id : 'p' + Math.random().toString(36).slice(2, 10), name, slot, color: COLORS[slot % COLORS.length], emoji: EMOJI[slot % EMOJI.length], score: 0, streak: 0, connected: true, joinedAt: Date.now() };
      S.players.set(p.id, p); Snd.join();
    }
    const oldCid = S.pid2conn.get(p.id); if (oldCid && oldCid !== cid) { S.conn2pid.delete(oldCid); net.drop(oldCid); }
    p.connected = true; p.name = name; p.lastSeen = Date.now();
    S.conn2pid.set(cid, p.id); S.pid2conn.set(p.id, cid);
    net.send(cid, { t: 'welcome', id: p.id, name: p.name, color: p.color, emoji: p.emoji });
    sendView(p); renderPlayersEverywhere();
  }

  function pub(p) { return { id: p.id, name: p.name, color: p.color, emoji: p.emoji }; }
  function avatar(p, cls) { return '<span class="avatar ' + (cls || '') + '" style="background:' + p.color + '" title="' + esc(p.name) + '">' + p.emoji + '</span>'; }
  function playersList() { return [...S.players.values()].sort((a, b) => a.slot - b.slot); }

  /* ---------- lobby UI ---------- */
  function buildLobby() {
    const rp = $('#roundPicks'); rp.innerHTML = '';
    Q.ROUND_ORDER.forEach(id => {
      const r = Q.ROUNDS[id]; const b = document.createElement('button'); b.className = 'rpick' + (settings.rounds.includes(id) ? ' on' : ''); b.dataset.round = id;
      b.innerHTML = '<span class="chk"></span><div class="ic">' + r.icon + '</div><div class="n">ROUND ' + r.num + '</div><div class="t">' + r.title + '</div><div class="d">' + r.desc + '</div>';
      b.onclick = () => { const i = settings.rounds.indexOf(id); if (i >= 0) settings.rounds.splice(i, 1); else settings.rounds.push(id); settings.rounds.sort((a, c) => Q.ROUND_ORDER.indexOf(a) - Q.ROUND_ORDER.indexOf(c)); saveSettings(); buildLobby(); };
      rp.appendChild(b);
    });
    const cp = $('#countPick'); cp.innerHTML = '';
    COUNTS.forEach(n => { const b = document.createElement('button'); b.textContent = n; b.dataset.count = n; b.className = settings.count === n ? 'on' : ''; b.onclick = () => { settings.count = n; saveSettings(); buildLobby(); }; cp.appendChild(b); });
    const dp = $('#diffPick'); dp.innerHTML = '';
    DIFFS.forEach(d => { const b = document.createElement('button'); b.textContent = Q.DIFF_NAMES[d]; b.dataset.diff = d; b.className = settings.difficulty === d ? 'on' : ''; b.onclick = () => { settings.difficulty = d; saveSettings(); buildLobby(); }; dp.appendChild(b); });
    const sp = Q.tierSplit(settings.count, settings.difficulty);
    $('#diffInfo').textContent = 'Each round: ' + sp[0] + ' easy → ' + sp[1] + ' medium → ' + sp[2] + ' hard';
    $('#rotateOpt').checked = !!settings.rotate;
    const tot = Q.ROUND_ORDER.reduce((a, k) => a + seen[k].size, 0);
    $('#seenInfo').textContent = tot ? tot + ' questions already played this evening will be avoided.' : 'No questions played yet this evening.';
    $('#resetSeen').style.display = tot ? '' : 'none';
    updateStart();
  }
  $('#rotateOpt').onchange = (e) => { settings.rotate = e.target.checked; saveSettings(); };
  $('#resetSeen').onclick = () => { if (!confirm('Forget which questions were already played? They may come up again.')) return; seen = loadSeen(); Q.ROUND_ORDER.forEach(k => seen[k].clear()); saveSeen(seen); buildLobby(); toast('Seen questions reset'); };
  function updateStart() {
    const n = [...S.players.values()].filter(p => p.connected).length;
    const ok = n > 0 && settings.rounds.length > 0;
    $('#startBtn').disabled = !ok;
    $('#startHint').textContent = !settings.rounds.length ? 'Pick at least one round.' : n === 0 ? 'Waiting for players to join…' : n + ' player' + (n > 1 ? 's' : '') + ' ready · ' + settings.rounds.length + ' round' + (settings.rounds.length > 1 ? 's' : '') + ' × ' + settings.count + ' questions · ' + Q.DIFF_NAMES[settings.difficulty];
  }
  function renderLobbyPlayers() {
    const ps = playersList(); $('#pCount').textContent = ps.length;
    const box = $('#lobbyPlayers');
    if (!ps.length) { box.innerHTML = '<div class="empty">Nobody yet - scan the QR code!</div>'; return; }
    box.innerHTML = ps.map(p => '<div class="pchip' + (p.connected ? '' : ' off') + '">' + avatar(p) + '<span>' + esc(p.name) + '</span><button class="kick" data-kick="' + p.id + '" title="Remove">✕</button></div>').join('');
    box.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => { const id = b.dataset.kick; sendTo(id, { t: 'kicked' }); const cid = S.pid2conn.get(id); if (cid) { S.conn2pid.delete(cid); net.drop(cid); } S.pid2conn.delete(id); S.players.delete(id); renderPlayersEverywhere(); });
  }
  function renderPlayersEverywhere() {
    if (S.phase === 'lobby') { renderLobbyPlayers(); updateStart(); }
    else if (S.phase === 'question') renderAnswered();
  }
  $('#startBtn').onclick = () => { Snd.unlock(); startGame(); };

  /* ---------- scheduler (auto-advance, pausable) ---------- */
  function schedule(fn, ms) { S.pending = { fn, at: Date.now() + ms * FAST }; }
  setInterval(() => { if (S.pending && !S.paused && Date.now() >= S.pending.at) { const f = S.pending.fn; S.pending = null; f(); } }, 100);
  function next() { if (S.phase === 'question') return closeQuestion(); if (S.pending) { const f = S.pending.fn; S.pending = null; f(); } }
  function setPaused(v) { S.paused = v; $('#cPause').textContent = v ? '▶' : '⏸'; $('#pausedBadge').classList.toggle('hidden', !v); if (!v && S.pending) S.pending.at = Math.max(S.pending.at, Date.now() + 600); }

  /* ---------- game flow ---------- */
  function startGame() {
    if (!settings.rounds.length) return;
    const rounds = settings.rounds.map(id => {
      const g = Q.generateRound(db, id, settings.count, seen, { rotate: settings.rotate, difficulty: settings.difficulty });
      g.resets.forEach(c => seen[id].delete(c)); g.used.forEach(c => seen[id].add(c));
      return { id, questions: g.questions };
    });
    saveSeen(seen);
    S.players.forEach(p => { p.score = 0; p.streak = 0; p.history = []; });
    S.game = { rounds, ri: 0, qi: -1, q: null, answers: new Map(), results: null };
    document.body.classList.remove('in-lobby');
    $('#lobby').classList.add('hidden'); $('#game').classList.remove('hidden');
    roundIntro(0);
  }
  const cur = () => S.game.rounds[S.game.ri];
  const qid = () => S.game.ri + '-' + S.game.qi;

  const ROUND_META = {
    flags: '15 seconds each · faster = more points', shapes: '15 seconds each · faster = more points', capitals: '15 seconds each · faster = more points',
    map: '20 seconds each · points by distance', landmarks: '20 seconds each · points by distance',
    hilo: '12 seconds each · faster = more points', mystery: '3 clues, 7 seconds apart · answer on clue 1 for up to 1000 pts · a wrong answer = 0',
    zoom: '15 seconds each · the earlier you answer, the more points'
  };
  function roundIntro(ri) {
    S.game.ri = ri; S.game.qi = -1; S.phase = 'intro';
    const r = Q.ROUNDS[cur().id];
    $('#game').innerHTML = '<div class="center-col"><div class="round-badge">Round ' + (ri + 1) + ' of ' + S.game.rounds.length + '</div><div class="round-icon">' + r.icon + '</div><div class="round-title">' + r.title + '</div><div class="round-desc">' + r.desc + '</div><div class="round-meta">' + cur().questions.length + ' questions · ' + ROUND_META[r.id] + '</div></div>';
    Snd.whoosh(); sendAllViews();
    schedule(() => askQuestion(), 4200);
  }

  function askQuestion() {
    const g = S.game; g.qi++;
    if (g.qi >= cur().questions.length) return roundEnd();
    g.q = cur().questions[g.qi]; g.answers = new Map(); g.results = null;
    g.time = Q.TIMES[g.q.kind] || Q.MC_TIME;
    g.startT = Date.now(); g.endT = g.startT + g.time;
    S.phase = 'question';
    renderQuestion(); Snd.question(); sendAllViews();
    clearInterval(S.timerInt); let lastSec = -1;
    S.timerInt = setInterval(() => {
      const left = Math.max(0, g.endT - Date.now()); const sec = Math.ceil(left / 1000);
      const tn = $('#tnum'); if (tn) { tn.textContent = sec; tn.classList.toggle('low', sec <= 5); }
      if (sec !== lastSec && sec <= 5 && sec > 0) Snd.tick(); lastSec = sec;
      if (g.q.kind === 'mystery') showClues(Math.min(3, 1 + Math.floor((g.time - left) / Q.CLUE_MS)));
      if (left <= 0) closeQuestion();
    }, 100);
  }

  function header() {
    const g = S.game, r = Q.ROUNDS[cur().id], q = g.q;
    return '<div class="ghead"><span class="rname">' + r.icon + ' ' + r.title + '</span><span class="qnum">Question ' + (g.qi + 1) + ' / ' + cur().questions.length + '</span><span class="tier tier-' + q.tier + '">' + Q.TIER_NAMES[q.tier] + '</span><span class="sp"></span><span id="ansCount" class="ans-count"></span></div>';
  }
  function mediaHTML(q, reveal) {
    if (q.kind === 'flags') return '<img class="flag" src="flags/' + q.flag + '.svg" alt="flag">';
    if (q.kind === 'shapes') return '<div class="shape-box"><svg viewBox="0 0 1000 1000" style="' + (q.transform && !reveal ? 'transform:' + q.transform : '') + ';transition:transform .8s"><path fill-rule="evenodd" d="' + window.GEO_DATA.shapes[q.shape] + '"/></svg></div>';
    if (q.kind === 'capitals') return '<div class="big-word"><small>' + (q.reverse ? 'Capital city' : 'Country') + '</small>' + esc(q.subject) + '</div>';
    if (q.kind === 'hilo') return '<div class="hilo">' + [0, 1].map(i => '<div class="hl-card hl-' + i + '"><img class="flag" src="flags/' + q.flags[i] + '.svg" alt=""><div class="hl-name">' + esc(q.options[i]) + '</div><div class="hl-val">' + (reveal ? esc(q.valueText[i]) : '?') + '</div></div>' + (i === 0 ? '<div class="hl-vs">VS</div>' : '')).join('') + '</div>';
    if (q.kind === 'mystery') return '<div class="clues">' + q.clues.map((c, i) => '<div class="clue" data-ci="' + (i + 1) + '"><span class="cn">Clue ' + (i + 1) + '</span><span class="ct">' + esc(c) + '</span><span class="cp">' + ['up to 1000 pts', 'up to 700 pts', 'up to 400 pts'][i] + '</span></div>').join('') + '</div>';
    return '';
  }
  function showClues(n) {
    document.querySelectorAll('.clue').forEach(el => { const i = +el.dataset.ci; if (i <= n && !el.classList.contains('shown')) { el.classList.add('shown'); if (i > 1) Snd.pop(); } el.classList.toggle('current', i === n); });
  }
  function zoomHTML(q) {
    let h = '<div class="zoom-box" id="zoomBox"><div class="zoom-inner" id="zoomInner"><img src="' + q.img + '.jpg" alt="">';
    q.layers.forEach((L, i) => { h += '<img class="zl" src="' + q.img + '-' + (i + 1) + '.jpg" alt="" style="left:' + (L[0] * 100) + '%;top:' + (L[1] * 100) + '%;width:' + (100 / L[2]) + '%;height:' + (100 / L[2]) + '%">'; });
    h += '<svg class="zborder" viewBox="0 0 1500 1000" preserveAspectRatio="none"><path d="' + q.border + '"/></svg></div></div>';
    return h;
  }
  // zoom view: scale s (1 = full image) centred on (cx, cy) in 0..1 image coordinates, clamped to stay inside the image
  function setZoom(u) {
    const q = S.game && S.game.q, inner = $('#zoomInner'); if (!q || !inner) return;
    const e = 1 - Math.pow(1 - u, 1.6);
    const s = Math.pow(q.s0, 1 - e);
    const clamp = (c) => Math.min(1 - 0.5 / s, Math.max(0.5 / s, c));
    const cx = clamp(q.fx + (0.5 - q.fx) * e), cy = clamp(q.fy + (0.5 - q.fy) * e);
    const W = inner.offsetWidth, H = inner.offsetHeight;
    inner.style.transform = 'translate(' + (W * (0.5 - cx * s)) + 'px,' + (H * (0.5 - cy * s)) + 'px) scale(' + s + ')';
    inner.classList.toggle('borders', u >= 0.92);
    // detail layers: fade out once the view no longer fits inside them (hides the seams between resolutions)
    const vw = 0.5 / s;
    inner.querySelectorAll('img.zl').forEach((img, i) => {
      const L = q.layers[i]; if (!L) return; const w = 1 / L[2];
      const over = Math.max(0, L[0] - (cx - vw), (cx + vw) - (L[0] + w), L[1] - (cy - vw), (cy + vw) - (L[1] + w));
      img.style.opacity = Math.max(0, 1 - over / vw * 2.5).toFixed(3);
    });
  }
  function runZoom() {
    const g = S.game, q = g && g.q; if (!q || q.kind !== 'zoom') return;
    const id = qid();
    const step = () => { if (!S.game || qid() !== id || S.phase !== 'question') return; const u = Math.min(1, (Date.now() - g.startT) / Q.ZOOM_MS); setZoom(u); if (u < 1) requestAnimationFrame(step); };
    setZoom(0); requestAnimationFrame(step);
  }
  function renderQuestion() {
    const g = S.game, q = g.q;
    let h = header() + '<div class="timer"><div id="tbar"></div></div><div id="tnum" class="tnum">' + Math.round(g.time / 1000) + '</div>';
    if (q.kind === 'map') {
      h += '<div class="map-q"><div class="mq1">📍 ' + esc(q.prompt) + '</div><div class="mq2">' + esc(q.subtitle || '') + '</div></div><div class="tv-map" id="tvmap"></div>';
    } else if (q.kind === 'landmark') {
      h += '<div class="lm-q"><div class="mq1">📸 ' + esc(q.prompt) + '</div><div class="mq2">Drop your pin on your phone</div></div><div class="lm-photo"><img src="' + q.img + '" alt=""></div><div class="lm-credit">Photo: ' + esc(q.credit) + ' · Wikimedia Commons</div>';
    } else if (q.kind === 'zoom') {
      h += zoomHTML(q) + '<div class="opts zopts" id="opts">' + q.options.map((o, i) => '<div class="opt opt-' + LETTERS[i] + '"><span class="sym"></span><span class="lbl">' + esc(o) + '</span><span class="who"></span></div>').join('') + '</div><div class="zcredit">Sentinel-2 cloudless 2016 by EOX (CC BY 4.0)</div>';
    } else {
      if (q.kind === 'hilo') h += '<div class="qprompt">' + esc(q.prompt) + '<div class="qsub">' + esc(q.subtitle) + '</div></div><div class="media hilo-media">' + mediaHTML(q) + '</div>';
      else
      h += '<div class="qprompt">' + esc(q.prompt) + '</div><div class="media' + (q.kind === 'mystery' ? ' mystery-media' : '') + '">' + mediaHTML(q) + '</div>';
      h += '<div class="opts' + (q.kind === 'hilo' ? ' two' : '') + '" id="opts">' + q.options.map((o, i) => '<div class="opt opt-' + LETTERS[i] + '"><span class="sym"></span><span class="lbl">' + esc(o) + '</span><span class="who"></span></div>').join('') + '</div>';
    }
    $('#game').innerHTML = h;
    if (q.kind === 'map') { const m = MAP.createSvg(); $('#tvmap').appendChild(m.svg); }
    if (q.kind === 'mystery') showClues(1);
    if (q.kind === 'zoom') runZoom();
    const bar = $('#tbar'); bar.style.transition = 'none'; bar.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = 'width ' + (g.time / 1000) + 's linear'; bar.style.width = '0%'; }));
    renderAnswered();
  }
  function renderAnswered() {
    const el = $('#ansCount'); if (!el || !S.game) return;
    const ps = playersList();
    el.innerHTML = ps.map(p => avatar(p, (S.game.answers.has(p.id) ? 'done' : '') + (p.connected ? '' : ' off'))).join('') + '<span style="margin-left:10px">' + S.game.answers.size + '/' + ps.filter(p => p.connected || S.game.answers.has(p.id)).length + '</span>';
  }
  function onAnswer(p, m) {
    const g = S.game; if (S.phase !== 'question' || !g || m.qid !== qid() || Q.isPin(g.q) || g.answers.has(p.id)) return;
    const choice = m.choice | 0; if (choice < 0 || choice >= g.q.options.length) return;
    g.answers.set(p.id, { choice, t: Date.now() - g.startT });
    Snd.lock(); renderAnswered(); sendView(p); checkAllAnswered();
  }
  function onPin(p, m) {
    const g = S.game; if (S.phase !== 'question' || !g || m.qid !== qid() || !Q.isPin(g.q) || g.answers.has(p.id)) return;
    const lat = +m.lat, lon = +m.lon; if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    g.answers.set(p.id, { lat, lon, t: Date.now() - g.startT });
    Snd.lock(); renderAnswered(); sendView(p); checkAllAnswered();
  }
  function checkAllAnswered() {
    if (S.phase !== 'question') return;
    const active = playersList().filter(p => p.connected);
    if (active.length && active.every(p => S.game.answers.has(p.id))) { clearInterval(S.timerInt); S.timerInt = null; setTimeout(() => { if (S.phase === 'question') closeQuestion(); }, 500); }
  }

  function closeQuestion() {
    if (S.phase !== 'question') return;
    clearInterval(S.timerInt); S.timerInt = null;
    const g = S.game, q = g.q; S.phase = 'reveal';
    const res = new Map();
    playersList().forEach(p => {
      const a = g.answers.get(p.id); let r;
      if (Q.isPin(q)) {
        const km = a ? Q.haversine(a.lat, a.lon, q.lat, q.lon) : null;
        const pts = Q.mapPoints(km);
        r = { answered: !!a, km, points: pts, bonus: 0, correct: km != null && km <= 300 };
      } else {
        const ok = !!a && a.choice === q.correct;
        p.streak = ok ? p.streak + 1 : 0;
        const pts = !ok ? 0 : q.kind === 'mystery' ? Q.mysteryPoints(true, a.t) : q.kind === 'zoom' ? Q.zoomPoints(true, a.t) : Q.mcPoints(true, a.t, g.time);
        r = { answered: !!a, choice: a ? a.choice : null, correct: ok, points: pts, bonus: ok ? Q.streakBonus(p.streak) : 0, ms: a ? a.t : null };
      }
      p.score += r.points + r.bonus; r.total = p.score; r.streak = p.streak;
      (p.history = p.history || []).push({ q: qid(), kind: q.kind, target: q.target, points: r.points + r.bonus });
      res.set(p.id, r);
    });
    g.results = res;
    renderReveal(); Snd.reveal(); sendAllViews();
    const n = cur().questions.length, mid = Math.ceil(n / 2);
    const showMid = n >= 4 && g.qi + 1 === mid;
    schedule(() => showMid ? midBoard() : askQuestion(), Q.isPin(q) ? 9000 : q.kind === 'mystery' || q.kind === 'zoom' ? 7000 : 6000);
  }

  function renderReveal() {
    const g = S.game, q = g.q, ps = playersList();
    if (Q.isPin(q)) return renderMapReveal();
    const opts = $('#opts'); if (!opts) return;
    opts.classList.add('revealed');
    [...opts.children].forEach((el, i) => {
      el.classList.add(i === q.correct ? 'right' : 'wrong');
      el.querySelector('.who').innerHTML = ps.filter(p => g.results.get(p.id).choice === i).map(p => avatar(p)).join('');
    });
    const tb = $('#tbar'); if (tb) { tb.style.transition = 'none'; tb.style.width = '0%'; }
    const tn = $('#tnum'); if (tn) tn.remove();
    const side = document.createElement('div'); side.className = 'rev-side';
    side.innerHTML = ps.map((p, i) => { const r = g.results.get(p.id); return '<div class="rp ' + (r.correct ? 'ok' : 'ko') + '" style="animation-delay:' + (i * 0.08) + 's">' + avatar(p) + '<span class="nm">' + esc(p.name) + '</span><span class="mk">' + (r.correct ? '✅' : r.answered ? '❌' : '⏰') + '</span></div>'; }).join('');
    $('#game').appendChild(side);
    if (q.kind === 'shapes' && q.transform) { const sv = $('.shape-box svg'); if (sv) sv.style.transform = 'none'; }
    if (q.kind === 'hilo') { $('.media').innerHTML = mediaHTML(q, true); const win = $('.hl-' + q.correct); if (win) win.classList.add('win'); $('.hl-' + (1 - q.correct)).classList.add('lose'); return; }
    if (q.kind === 'mystery') { showClues(3); document.querySelectorAll('.clue').forEach(el => el.classList.remove('current')); $('.media').classList.add('with-side'); const qp = $('.qprompt'); if (qp) qp.style.visibility = 'hidden'; }
    if (q.kind === 'zoom') { const inner = $('#zoomInner'); if (inner) { inner.style.transition = 'transform .8s ease-out'; setZoom(1); } }
    const t = db.by[q.target];
    const cap = document.createElement('div'); cap.className = 'reveal-cap' + (q.kind === 'mystery' ? ' mystery-cap' : q.kind === 'zoom' ? ' zoom-cap' : '');
    cap.textContent = q.kind === 'capitals' ? (t.cap + ' is the capital of ' + t.n) : q.kind === 'zoom' ? t.n + ' · ' + q.spot : t.n;
    $('#game').appendChild(cap);
  }

  function renderMapReveal() {
    const g = S.game, q = g.q, ps = playersList();
    $('#game').innerHTML = header() + '<div class="map-q small"><div class="mq1">' + (q.kind === 'landmark' ? '📸 ' : '📍 ') + esc(q.label) + (q.subtitle ? ', ' + esc(q.subtitle) : '') + '</div></div><div class="tv-map with-side" id="tvmap"></div><div class="rev-side" id="mapSide"></div>' + (q.kind === 'landmark' ? '<div class="lm-thumb"><img src="' + q.img + '" alt=""></div>' : '');
    const m = MAP.createSvg(); $('#tvmap').appendChild(m.svg);
    const [tx, ty] = MAP.project(q.lat, q.lon);
    const pts = [[tx, ty]];
    ps.forEach(p => { const a = g.answers.get(p.id); if (a) pts.push(MAP.project(a.lat, a.lon)); });
    // fit view to target + pins
    let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    const box = $('#tvmap').getBoundingClientRect(); const aspect = (box.width || 1378) / (box.height || 770);
    let w = Math.max(160, (x1 - x0) * 1.35), h = Math.max(160 / aspect, (y1 - y0) * 1.35);
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    w = Math.min(w, MAP.W * 1.1); h = w / aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const target = { x: cx - w / 2, y: cy - h / 2, w, h };
    const from = { x: 0, y: (MAP.H - MAP.W / aspect) / 2, w: MAP.W, h: MAP.W / aspect };
    const k = w / 1378; // svg units per screen px (approx)
    const over = m.over, el = MAP.el;
    const lines = el('g', {}, over), pinsG = el('g', {}, over);
    ps.forEach(p => { const a = g.answers.get(p.id); if (!a) return; const [x, y] = MAP.project(a.lat, a.lon); el('line', { x1: x, y1: y, x2: tx, y2: ty, class: 'pin-line', stroke: p.color }, lines); });
    const drawPin = (x, y, color, label, sub, big) => {
      const gg = el('g', { transform: 'translate(' + x + ' ' + y + ') scale(' + k + ')' }, pinsG);
      el('circle', { r: big ? 16 : 13, fill: color, stroke: '#fff', 'stroke-width': 4 }, gg);
      if (label) {
        const tw = Math.max(label.length, (sub || '').length) * 15 + 26;
        el('rect', { x: 20, y: -30, width: tw, height: sub ? 62 : 40, rx: 10, class: 'lbl-bg' }, gg);
        const t1 = el('text', { x: 32, y: -3, 'font-size': 24 }, gg); t1.textContent = label;
        if (sub) { const t2 = el('text', { x: 32, y: 24, 'font-size': 20, fill: '#ffd23f' }, gg); t2.textContent = sub; t2.setAttribute('style', 'fill:#ffd23f'); }
      }
    };
    ps.forEach(p => { const a = g.answers.get(p.id); if (!a) return; const [x, y] = MAP.project(a.lat, a.lon); const r = g.results.get(p.id); drawPin(x, y, p.color, p.emoji + ' ' + p.name, fmt(r.km) + ' km'); });
    const star = el('g', { transform: 'translate(' + tx + ' ' + ty + ') scale(' + k + ')' }, pinsG);
    el('circle', { r: 30, fill: 'rgba(255,210,63,.25)', stroke: '#ffd23f', 'stroke-width': 3 }, star);
    const st = el('text', { x: 0, y: 13, 'font-size': 38, 'text-anchor': 'middle' }, star); st.textContent = '⭐';
    const nm = el('text', { x: 0, y: -42, 'font-size': 30, 'text-anchor': 'middle', style: 'paint-order:stroke;stroke:#0a0f2c;stroke-width:6px' }, star); nm.textContent = q.label;
    // animate viewBox
    const t0 = performance.now(), D = 1400 * Math.min(1, FAST * 2);
    const step = (t) => { const u = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - u, 3); const v = ['x', 'y', 'w', 'h'].map(kk => from[kk] + (target[kk] - from[kk]) * e); m.svg.setAttribute('viewBox', v.join(' ')); if (u < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const sorted = ps.slice().sort((a, b) => { const ra = g.results.get(a.id), rb = g.results.get(b.id); return (ra.km == null ? 1e9 : ra.km) - (rb.km == null ? 1e9 : rb.km); });
    $('#mapSide').innerHTML = sorted.map((p, i) => { const r = g.results.get(p.id); return '<div class="rp ' + (r.km != null && r.km <= 300 ? 'ok' : 'ko') + '" style="animation-delay:' + (0.6 + i * 0.12) + 's">' + avatar(p) + '<span class="nm">' + esc(p.name) + '</span><span class="km">' + (r.km == null ? 'no pin' : fmt(r.km) + ' km') + '</span>' + (i === 0 && r.km != null ? '<span class="mk">🎯</span>' : '') + '</div>'; }).join('');
  }

  function boardRows(ps, opts) {
    const max = Math.max(1, ...ps.map(p => p.score));
    return ps.map((p, i) => '<div class="brow' + (opts && opts.hidden ? ' hide' : '') + (i === 0 && opts && opts.markFirst ? ' first' : '') + '" data-pid="' + p.id + '" style="animation-delay:' + (opts && opts.hidden ? 0 : i * 0.12) + 's"><div class="bar" style="width:' + (opts && opts.hidden ? 0 : (p.score / max * 100)) + '%"></div><span class="rk">#' + (i + 1) + '</span>' + avatar(p) + '<span class="nm">' + esc(p.name) + '</span><span class="sc">' + (opts && opts.hidden ? '0' : fmt(p.score)) + '</span></div>').join('');
  }
  const ranked = () => playersList().slice().sort((a, b) => b.score - a.score || a.slot - b.slot);

  function midBoard() {
    S.phase = 'mid';
    $('#game').innerHTML = '<div class="center-col"><div class="round-badge">' + Q.ROUNDS[cur().id].title + ' · halfway</div><div class="big-h">Standings</div><div class="board">' + boardRows(ranked(), { markFirst: true }) + '</div><div class="sub-h">🤫 Last look! Scores stay hidden until the end of the game.</div></div>';
    Snd.whoosh(); sendAllViews();
    schedule(() => askQuestion(), 7000);
  }

  function roundEnd() {
    S.phase = 'roundEnd';
    const g = S.game, r = Q.ROUNDS[cur().id], nextR = g.rounds[g.ri + 1];
    $('#game').innerHTML = '<div class="center-col"><div class="round-icon">' + r.icon + '</div><div class="big-h">Round ' + (g.ri + 1) + ' complete!</div><div class="sub-h">' + (nextR ? 'Next up: ' + Q.ROUNDS[nextR.id].icon + ' ' + Q.ROUNDS[nextR.id].title : 'Time for the final results…') + '</div></div>';
    Snd.whoosh(); sendAllViews();
    schedule(() => nextR ? roundIntro(g.ri + 1) : finalReveal(), 3500);
  }

  /* ---------- final ---------- */
  function finalReveal() {
    S.phase = 'final';
    const rk = ranked();
    $('#game').innerHTML = '<div class="center-col"><div class="big-h">Final results</div><div class="board" id="fboard">' + boardRows(rk, { hidden: true }) + '</div></div>';
    sendAllViews(); Snd.drum();
    const rows = [...document.querySelectorAll('#fboard .brow')]; const max = Math.max(1, ...rk.map(p => p.score));
    let i = rk.length - 1;
    const revealOne = () => {
      if (i < 0) return schedule(podium, 3000);
      const p = rk[i], row = rows[i]; row.classList.remove('hide'); row.style.animation = 'fadeUp .5s both';
      if (i === 0) row.classList.add('first');
      const sc = row.querySelector('.sc'), bar = row.querySelector('.bar');
      requestAnimationFrame(() => { bar.style.width = (p.score / max * 100) + '%'; });
      const t0 = performance.now(), D = 1300 * Math.max(0.3, FAST);
      const tick = (t) => { const u = Math.min(1, (t - t0) / D); sc.textContent = fmt(p.score * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      i === 0 ? Snd.fanfare() : Snd.pop();
      i--;
      schedule(revealOne, i === 0 ? 3000 : 2000);
    };
    schedule(revealOne, 1500);
  }
  function podium() {
    S.phase = 'podium';
    const rk = ranked(); const top = [rk[1], rk[0], rk[2]];
    const cls = ['p2', 'p1', 'p3'], num = [2, 1, 3];
    let h = '<div class="center-col"><div class="big-h">🏆 ' + esc(rk[0] ? rk[0].name : '') + ' wins!</div><div class="podium">';
    top.forEach((p, i) => { if (!p) return; h += '<div class="pod ' + cls[i] + '">' + (num[i] === 1 ? '<div class="crown">👑</div>' : '') + avatar(p) + '<div class="pn">' + esc(p.name) + '</div><div class="ps">' + fmt(p.score) + ' pts</div><div class="blk">' + num[i] + '</div></div>'; });
    h += '</div>';
    if (rk.length > 3) h += '<div class="others">' + rk.slice(3).map((p, i) => '#' + (i + 4) + ' ' + esc(p.name) + ' - ' + fmt(p.score)).join(' · ') + '</div>';
    h += '<div class="game-end-btns"><button class="btn primary big" id="againBtn">Play again ↻</button></div></div>';
    $('#game').innerHTML = h;
    $('#againBtn').onclick = backToLobby;
    Snd.fanfare(); confetti(); sendAllViews();
  }
  function backToLobby() {
    S.phase = 'lobby'; S.pending = null; clearInterval(S.timerInt); S.game = null; setPaused(false);
    $('#game').classList.add('hidden'); $('#game').innerHTML = ''; $('#lobby').classList.remove('hidden'); document.body.classList.add('in-lobby');
    stopConfetti(); buildLobby(); renderLobbyPlayers(); sendAllViews();
  }

  /* ---------- views for phones ---------- */
  function viewFor(p) {
    const base = { you: pub(p), phase: S.phase };
    const g = S.game;
    if (S.phase === 'lobby') return Object.assign(base, { screen: 'lobby', players: playersList().length });
    if (S.phase === 'intro') { const r = Q.ROUNDS[cur().id]; return Object.assign(base, { screen: 'intro', icon: r.icon, title: r.title, desc: r.desc, num: g.ri + 1, of: g.rounds.length }); }
    if (S.phase === 'question') {
      const q = g.q, a = g.answers.get(p.id), left = Math.max(0, g.endT - Date.now());
      const common = { qid: qid(), tier: q.tier, tierName: Q.TIER_NAMES[q.tier], qnum: g.qi + 1, qof: cur().questions.length, left, time: g.time, round: Q.ROUNDS[cur().id].title };
      if (Q.isPin(q)) return Object.assign(base, common, { screen: 'map', kind: q.kind, prompt: q.prompt, subtitle: q.kind === 'landmark' ? 'Look at the photo on the big screen' : q.subtitle, img: q.kind === 'landmark' ? q.img : null, locked: !!a, pin: a ? { lat: a.lat, lon: a.lon } : null });
      return Object.assign(base, common, { screen: 'question', kind: q.kind, flags: q.kind === 'hilo' ? q.flags : null, clues: q.kind === 'mystery' ? q.clues : null, clueMs: Q.CLUE_MS, subtitle: q.kind === 'hilo' ? q.subtitle : null, prompt: q.prompt, subject: q.kind === 'capitals' ? q.subject : null, flag: q.flag || null, shape: q.kind === 'shapes' ? q.shape : null, shapePath: q.kind === 'shapes' ? window.GEO_DATA.shapes[q.shape] : null, transform: q.transform || null, options: q.options, locked: !!a, choice: a ? a.choice : null });
    }
    if (S.phase === 'reveal') {
      const q = g.q, r = g.results.get(p.id) || { answered: false, points: 0, bonus: 0, total: p.score, streak: p.streak };
      const t = db.by[q.target];
      const info = q.kind === 'hilo' ? q.options[0] + ': ' + q.valueText[0] + ' · ' + q.options[1] + ': ' + q.valueText[1] : q.kind === 'landmark' ? q.label + ' · ' + q.subtitle : q.kind === 'zoom' ? (t ? t.n : '') + ' · ' + q.spot : t ? t.cap + ' · ' + t.n : '';
      return Object.assign(base, { screen: 'result', kind: q.kind, pin: Q.isPin(q), correct: r.correct, answered: r.answered, points: r.points, bonus: r.bonus, total: p.score, streak: p.streak, km: r.km, answer: Q.isPin(q) ? q.label + (q.subtitle ? ', ' + q.subtitle : '') : q.options[q.correct], yours: r.choice != null && q.options ? q.options[r.choice] : null, capInfo: info });
    }
    if (S.phase === 'mid') { const rk = ranked(); return Object.assign(base, { screen: 'wait', icon: '📊', text: 'Halfway standings on the big screen!', sub: 'You are #' + (rk.findIndex(x => x.id === p.id) + 1) + ' with ' + fmt(p.score) + ' pts' }); }
    if (S.phase === 'roundEnd') return Object.assign(base, { screen: 'wait', icon: '✅', text: 'Round complete!', sub: 'Your total: ' + fmt(p.score) + ' pts' });
    if (S.phase === 'final') return Object.assign(base, { screen: 'wait', icon: '🥁', text: 'Look at the big screen…', sub: 'Final results are coming!' });
    if (S.phase === 'podium') { const rk = ranked(); const i = rk.findIndex(x => x.id === p.id); return Object.assign(base, { screen: 'final', rank: i + 1, of: rk.length, score: p.score, winner: rk[0] && rk[0].name }); }
    return Object.assign(base, { screen: 'wait', text: '…' });
  }

  /* ---------- confetti ---------- */
  let confT = null;
  function confetti() {
    const cv = $('#confetti'); cv.width = 1920; cv.height = 1080; const x = cv.getContext('2d');
    const cols = ['#ffd23f', '#ff6b81', '#4dabf7', '#69db7c', '#da77f2', '#ff922b', '#fff'];
    const P = []; for (let i = 0; i < 260; i++) P.push({ x: Math.random() * 1920, y: -Math.random() * 1080, vx: (Math.random() - .5) * 4, vy: 3 + Math.random() * 5, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, w: 10 + Math.random() * 12, h: 6 + Math.random() * 8, c: cols[i % cols.length] });
    const t0 = Date.now();
    const frame = () => {
      x.clearRect(0, 0, 1920, 1080);
      const el = Date.now() - t0;
      P.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx += Math.sin((el + p.y) / 300) * .05; if (p.y > 1100 && el < 6000) { p.y = -20; p.x = Math.random() * 1920; } x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); });
      if (el < 11000) confT = requestAnimationFrame(frame); else x.clearRect(0, 0, 1920, 1080);
    };
    cancelAnimationFrame(confT); frame();
  }
  function stopConfetti() { cancelAnimationFrame(confT); const cv = $('#confetti'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

  /* ---------- controls ---------- */
  let toastT;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 3500); }
  $('#cPause').onclick = () => setPaused(!S.paused);
  $('#cNext').onclick = () => next();
  const syncMute = () => { $('#cMute').textContent = Snd.muted ? '🔇' : '🔊'; };
  $('#cMute').onclick = () => { Snd.setMuted(!Snd.muted); syncMute(); };
  $('#cFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  $('#cQuit').onclick = () => { if (confirm('End this game and go back to the setup screen?')) backToLobby(); };
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT')) return;
    if (e.code === 'Space' && S.phase !== 'lobby') { e.preventDefault(); if (S.paused) setPaused(false); else next(); }
    else if (e.key === 'p' || e.key === 'P') { if (S.phase !== 'lobby') setPaused(!S.paused); }
    else if (e.key === 'm' || e.key === 'M') $('#cMute').click();
    else if (e.key === 'f' || e.key === 'F') $('#cFull').click();
  });
  // keep phones' timers in sync and detect stale players
  setInterval(() => { let ch = false; S.players.forEach(p => { if (p.connected && Date.now() - (p.lastSeen || 0) > 15000) { p.connected = false; ch = true; } }); if (ch) { renderPlayersEverywhere(); checkAllAnswered(); } }, 2000);
  setInterval(() => { if (S.phase === 'question') S.players.forEach(p => { if (p.connected && !S.game.answers.has(p.id)) sendTo(p.id, { t: 'sync', qid: qid(), left: Math.max(0, S.game.endT - Date.now()) }); }); }, 3000);

  document.body.classList.add('in-lobby');
  syncMute(); buildLobby(); renderLobbyPlayers();
})();
