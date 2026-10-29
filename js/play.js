/* Geo Party - phone controller */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const LET = ['A', 'B', 'C', 'D'];
  const params = new URLSearchParams(location.search);
  const LS = 'geoparty.player.v1' + (params.get('slot') || ''); // 'slot' only used by automated tests (several players in one browser)
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })();
  let room = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
  let client = null, me = null, view = null, renderedKey = '', deadline = 0, rafT = null, mapState = null;
  const screen = $('#screen');

  // prevent page zoom (iOS) except inside the map, which handles its own gestures
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTouch < 350 && !e.target.closest('.mapwrap')) e.preventDefault(); lastTouch = n; }, { passive: false });

  function setStatus(cls, txt) { const s = $('#status'); s.className = 'st ' + cls; s.textContent = txt; }
  function save() { localStorage.setItem(LS, JSON.stringify(saved)); }
  function myId() { if (!saved.id || !/^[a-z0-9]{6,24}$/i.test(saved.id)) { saved.id = 'p' + Math.random().toString(36).slice(2, 12); save(); } return saved.id; }

  // keep the screen awake during the game
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(); if (client) client.retryNow(); } });

  // lazy-load the world map for round 4
  let mapLoad = null;
  function loadMap() {
    if (mapLoad) return mapLoad;
    mapLoad = new Promise((res, rej) => { const a = document.createElement('script'); a.src = 'data/worldmap.js'; a.onload = () => { const b = document.createElement('script'); b.src = 'js/map.js'; b.onload = res; b.onerror = rej; document.head.appendChild(b); }; a.onerror = rej; document.head.appendChild(a); });
    return mapLoad;
  }

  /* ---------- join ---------- */
  function joinForm(err) {
    renderedKey = 'join';
    screen.innerHTML = '<div class="center"><div class="big-ico">🌍</div><h1>GEO PARTY</h1><div class="mut">Join the game on the big screen</div>' +
      '<div class="field"' + (room && !err ? ' style="display:none"' : '') + '><label for="code">Room code</label><input id="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="' + esc(room) + '" placeholder="ABCD"></div>' +
      '<div class="field"><label for="name">Your name</label><input id="name" maxlength="16" autocomplete="nickname" value="' + esc(saved.name || '') + '" placeholder="e.g. Mathieu"></div>' +
      '<div class="err" id="err">' + esc(err || '') + '</div><button class="pbtn" id="go">Join ▶</button></div>';
    const go = () => {
      const code = ($('#code').value || '').toUpperCase().replace(/[^A-Z]/g, ''), name = $('#name').value.trim();
      if (code.length !== 4) { $('#err').textContent = 'The room code has 4 letters.'; return; }
      if (!name) { $('#err').textContent = 'Please enter your name.'; return; }
      saved.name = name; if (saved.room !== code) { saved.room = code; } save();
      if (room !== code && client) { location.search = '?room=' + code + (params.get('transport') ? '&transport=' + params.get('transport') : ''); return; }
      room = code; Snd().unlock(); keepAwake(); connect();
    };
    $('#go').onclick = go;
    screen.querySelectorAll('input').forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
  }
  const Snd = () => window.GPSound;

  function connect() {
    if (client) { sendHello(); return; }
    waitScreen('📡', 'Connecting…', 'Room ' + room);
    client = window.GPNet.createClient(room, {
      onStatus(s) {
        if (s === 'open') { setStatus('ok', 'Connected'); sendHello(); }
        else if (s === 'connecting') setStatus('', 'Connecting…');
        else if (s === 'nohost') { setStatus('bad', 'Game not found'); if (!me) waitScreen('🔎', 'Looking for room ' + room + '…', 'Make sure the big screen shows this code. Retrying…'); }
        else setStatus('bad', 'Reconnecting…');
      },
      onMessage: onMsg
    });
    loadMap().catch(() => {});
  }
  function sendHello() { if (client && client.open) client.send({ t: 'hello', id: myId(), name: saved.name }); }
  setInterval(() => { if (client && client.open && me) client.send({ t: 'ping' }); }, 4000);

  function onMsg(m) {
    if (!m) return;
    if (m.t === 'welcome') { me = m; saved.id = m.id; saved.room = room; save(); $('#me').innerHTML = '<span class="avatar" style="background:' + m.color + '">' + m.emoji + '</span>' + esc(m.name); }
    else if (m.t === 'error') { me = null; joinForm(m.msg); }
    else if (m.t === 'kicked') { me = null; $('#me').innerHTML = ''; joinForm('You were removed from the game by the host.'); }
    else if (m.t === 'view') { view = m.v; render(); }
    else if (m.t === 'sync') { if (view && view.qid === m.qid) deadline = Date.now() + m.left; }
  }

  function waitScreen(icon, title, sub) { renderedKey = 'wait:' + title; screen.innerHTML = '<div class="center"><div class="big-ico">' + icon + '</div><div class="ttl">' + esc(title) + '</div><div class="mut">' + esc(sub || '') + '</div></div>'; }

  /* ---------- render views ---------- */
  function render() {
    const v = view; if (!v) return;
    const key = v.screen + ':' + (v.qid || '') + ':' + (v.locked ? 1 : 0) + ':' + (v.screen === 'wait' ? v.text + v.sub : '') + (v.screen === 'intro' ? v.title : '') + (v.screen === 'lobby' ? 'l' : '');
    if (v.screen === 'map' && renderedKey.startsWith('map:' + v.qid + ':') && !v.locked === !mapState?.locked) { deadline = Date.now() + v.left; return; }
    if (key === renderedKey) { if (v.left != null) deadline = Date.now() + v.left; return; }
    renderedKey = key; cancelAnimationFrame(rafT);
    if (v.screen !== 'map') mapState = null;
    const fn = { lobby: rLobby, intro: rIntro, question: rQuestion, map: rMap, result: rResult, wait: () => waitScreen(v.icon || '⏳', v.text, v.sub), final: rFinal }[v.screen];
    if (fn) fn(v);
  }
  function rLobby(v) {
    screen.innerHTML = '<div class="center"><span class="avatar big-ava" style="background:' + v.you.color + '">' + v.you.emoji + '</span><div class="ttl">You\'re in, ' + esc(v.you.name) + '!</div><div class="mut">Waiting for the host to start the game…<br>Keep this page open.</div></div>';
  }
  function rIntro(v) {
    screen.innerHTML = '<div class="center"><div class="mut">Round ' + v.num + ' of ' + v.of + '</div><div class="big-ico">' + v.icon + '</div><div class="ttl">' + esc(v.title) + '</div><div class="mut">' + esc(v.desc) + '</div></div>';
  }
  function timerBar() {
    const bar = $('#ptb'); if (!bar || !view) return;
    const left = Math.max(0, deadline - Date.now()); bar.style.width = (left / view.time * 100) + '%';
    const n = $('#psec'); if (n) n.textContent = Math.ceil(left / 1000) + 's';
    if (left > 0) rafT = requestAnimationFrame(timerBar);
  }
  function head(v) { return '<div class="qhead"><span>' + esc(v.round) + ' · ' + v.qnum + '/' + v.qof + ' <span class="tier tier-' + v.tier + '">' + esc(v.tierName) + '</span></span><span id="psec"></span></div><div class="ptimer"><div id="ptb"></div></div>'; }
  function rQuestion(v) {
    deadline = Date.now() + v.left;
    let thumb = '';
    if (v.kind === 'flags') thumb = '<img src="flags/' + v.flag + '.svg" alt="">';
    else if (v.kind === 'shapes') thumb = '<div class="sbox"><svg viewBox="0 0 1000 1000" style="' + (v.transform ? 'transform:' + v.transform : '') + '"><path fill-rule="evenodd" d="' + (v.shapePath || '') + '"/></svg></div>';
    else if (v.kind === 'capitals') thumb = '<div class="word">' + esc(v.subject) + '</div>';
    else if (v.kind === 'mystery') thumb = '<div class="pclue" id="pclue"></div>';
    else if (v.kind === 'zoom') thumb = '<div class="pwatch">🛰️ Watch the big screen - it is zooming out!</div>';
    const two = v.options.length === 2;
    screen.innerHTML = head(v) + '<div class="qtext">' + esc(v.prompt) + (v.subtitle ? '<div class="qsub">' + esc(v.subtitle) + '</div>' : '') + '</div>' + (thumb ? '<div class="thumb' + (v.kind === 'mystery' || v.kind === 'zoom' ? ' small' : '') + '">' + thumb + '</div>' : '') +
      '<div class="pops' + (two ? ' two' : '') + (v.locked ? ' locked' : '') + '" id="pops">' + v.options.map((o, i) => '<button class="pop opt-' + LET[i] + (v.choice === i ? ' mine' : '') + '" data-i="' + i + '"><span class="sym"></span>' + (two && v.flags ? '<img class="pflag" src="flags/' + v.flags[i] + '.svg" alt="">' : '') + '<span>' + esc(o) + '</span></button>').join('') + '</div>' +
      '<div class="locked-msg" id="lmsg">' + (v.locked ? '🔒 Answer locked - wait for the others…' : '') + '</div>';
    if (!v.locked) screen.querySelectorAll('.pop').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i; if ($('#pops').classList.contains('locked')) return;
      $('#pops').classList.add('locked'); b.classList.add('mine'); $('#lmsg').textContent = '🔒 Answer locked - wait for the others…';
      if (navigator.vibrate) navigator.vibrate(25);
      client.send({ t: 'answer', qid: v.qid, choice: i });
    }));
    if (v.kind === 'mystery') clueTick();
    timerBar();
  }
  // Mystery Country: show the clue currently on the big screen (clues are revealed every clueMs)
  function clueTick() {
    const el = $('#pclue'); if (!el || !view || !view.clues) return;
    const n = Math.min(3, 1 + Math.floor((view.time - Math.max(0, deadline - Date.now())) / view.clueMs));
    if (el.dataset.n !== String(n)) { el.dataset.n = n; el.innerHTML = '<b>Clue ' + n + '/3 · up to ' + [1000, 700, 400][n - 1] + ' pts</b>' + esc(view.clues[n - 1]); }
    if (n < 3 && deadline > Date.now()) setTimeout(clueTick, 250);
  }
  async function rMap(v) {
    deadline = Date.now() + v.left;
    screen.innerHTML = head(v) + '<div class="mprompt">' + esc(v.prompt) + '</div><div class="msub">' + (v.img ? '<img class="lmthumb" src="' + esc(v.img) + '" alt=""> ' : '') + esc(v.subtitle || '') + '</div><div class="mapwrap" id="mw"><div class="center"><div class="mut">Loading map…</div></div></div><button class="pbtn confirm" id="conf" disabled>' + (v.locked ? '🔒 Pin locked' : 'Tap the map to place your pin') + '</button>';
    timerBar();
    try { await loadMap(); } catch (e) { $('#mw').innerHTML = '<div class="center">Map failed to load</div>'; return; }
    if (view !== v && !(view && view.qid === v.qid)) return;
    const M = window.GPMap, mw = $('#mw'); if (!mw) return;
    mw.innerHTML = '';
    const { svg, over } = M.createSvg(); mw.appendChild(svg);
    mw.insertAdjacentHTML('beforeend', '<div class="zoombtns"><button id="zin">+</button><button id="zout">−</button></div><div class="maphint" id="mh">Pinch or use +/− to zoom · drag to move · tap to pin</div>');
    mapState = { locked: !!v.locked, pin: v.pin ? M.project(v.pin.lat, v.pin.lon) : null };
    const pinG = M.el('g', { class: 'mypin' }, over);
    const drawPin = () => {
      pinG.innerHTML = ''; if (!mapState.pin) return;
      const k = 1 / pz.pxPerUnit(); const [x, y] = mapState.pin;
      const g = M.el('g', { transform: 'translate(' + x + ' ' + y + ') scale(' + k + ')' }, pinG);
      M.el('path', { d: 'M0 0 C -6 -14 -16 -20 -16 -32 A 16 16 0 1 1 16 -32 C 16 -20 6 -14 0 0 Z', fill: me ? me.color : '#ff4d6d', stroke: '#fff', 'stroke-width': 3 }, g);
      M.el('circle', { cx: 0, cy: -32, r: 6, fill: '#fff' }, g);
    };
    const pz = M.attachPanZoom(svg, {
      onChange: () => drawPin(),
      onTap: (x, y) => { if (mapState.locked) return; mapState.pin = [x, y]; drawPin(); const b = $('#conf'); b.disabled = false; b.textContent = 'Confirm pin ✓'; if (navigator.vibrate) navigator.vibrate(15); }
    });
    $('#zin').onclick = () => pz.zoomIn(); $('#zout').onclick = () => pz.zoomOut();
    drawPin();
    $('#conf').onclick = () => {
      if (!mapState.pin || mapState.locked) return;
      const [lat, lon] = M.invert(mapState.pin[0], mapState.pin[1]);
      mapState.locked = true; const b = $('#conf'); b.disabled = true; b.textContent = '🔒 Pin locked - wait for the others…';
      if (navigator.vibrate) navigator.vibrate(25);
      client.send({ t: 'pin', qid: v.qid, lat, lon });
    };
    window.__mapTest = { pz, svg, tapAt: (lat, lon) => { const [x, y] = M.project(lat, lon); mapState.pin = [x, y]; drawPin(); const b = $('#conf'); b.disabled = false; b.textContent = 'Confirm pin ✓'; } };
  }
  function rResult(v) {
    let h = '<div class="center">';
    if (v.pin) {
      h += '<div class="res-mark">' + (v.km == null ? '⏰' : v.km <= 300 ? '🎯' : v.km <= 1500 ? '📍' : '🌊') + '</div>';
      h += v.km == null ? '<div class="ttl">No pin placed</div>' : '<div class="ttl">' + fmt(v.km) + ' km away</div>';
      h += '<div class="res-pts ' + (v.points ? 'good' : 'bad') + '">+' + fmt(v.points) + '</div>';
    } else {
      h += '<div class="res-mark">' + (v.correct ? '✅' : v.answered ? '❌' : '⏰') + '</div><div class="ttl">' + (v.correct ? 'Correct!' : v.answered ? 'Wrong!' : 'Too slow!') + '</div>';
      h += '<div class="res-pts ' + (v.correct ? 'good' : 'bad') + '">+' + fmt(v.points) + '</div>';
      if (v.bonus) h += '<div class="res-bonus">🔥 +' + fmt(v.bonus) + ' streak bonus (' + v.streak + ' in a row)</div>';
    }
    h += '<div class="res-ans">Answer: <b>' + esc(v.answer) + '</b>' + (v.kind === 'hilo' && v.capInfo ? '<div class="res-info">' + esc(v.capInfo) + '</div>' : '') + '</div><div class="res-total">Your total: <b>' + fmt(v.total) + '</b> pts</div></div>';
    screen.innerHTML = h;
    if (navigator.vibrate) navigator.vibrate(v.correct ? [20, 40, 20] : 60);
  }
  function rFinal(v) {
    const medal = ['🥇', '🥈', '🥉'][v.rank - 1] || '🎉';
    screen.innerHTML = '<div class="center"><div class="big-ico">' + medal + '</div><div class="mut">Final rank</div><div class="rank-big">#' + v.rank + '</div><div class="mut">of ' + v.of + ' players</div><div class="res-pts">' + fmt(v.score) + ' pts</div><div class="mut">' + (v.rank === 1 ? 'You are the geography champion! 🏆' : esc(v.winner) + ' wins this one.') + '<br><br>Waiting for the host to start another game…</div></div>';
  }

  /* ---------- start ---------- */
  if (room && saved.name && saved.room === room && saved.id) { connect(); }
  else joinForm();
})();
