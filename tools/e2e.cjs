// End-to-end test: 1 host (TV) + 3 phones. Usage: NODE_PATH=<dir with playwright> node tools/e2e.cjs [peer|local]
const { chromium } = require('playwright');
const fs = require('fs');
const MODE = process.argv[2] || 'peer';
const BASE = process.env.BASE || 'http://localhost:8765/';
const SHOTS = __dirname + '/../screens/';
const T = MODE === 'local' ? '&transport=local' : '';
const DIFF = process.env.DIFF || 'normal', COUNT = +(process.env.COUNT || 6), DIFF2 = process.env.DIFF2 || 'expert', SHOOT = process.env.SHOTS !== '0';
const ROUNDS = (process.env.ROUNDS || 'flags,shapes,capitals,map,landmarks,hilo,mystery,zoom').split(',');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } else log('ok:', m); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
  // local transport needs all pages in one context (BroadcastChannel); peer mode uses one context per phone (realistic)
  const sharedPhoneCtx = MODE === 'local' ? hostCtx : null;
  const newPhone = async () => { if (sharedPhoneCtx) { const pg = await sharedPhoneCtx.newPage(); await pg.setViewportSize(phoneOpts.viewport); return pg; } const c = await browser.newContext(phoneOpts); return c.newPage(); };
  const host = await hostCtx.newPage();
  const errors = [];
  host.on('pageerror', e => errors.push('host: ' + e.message));
  host.on('dialog', d => d.accept());
  await host.goto(BASE + 'index.html?fast=0.3' + T);
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('#roomCode').textContent), null, { timeout: 30000 });
  const code = await host.textContent('#roomCode');
  const qrUrl = await host.getAttribute('#qr', 'data-url');
  log('room', code, qrUrl);
  check(/play\.html\?room=[A-Z]{4}/.test(qrUrl), 'QR encodes play.html?room=CODE');
  check(await host.$('#qr svg') !== null, 'QR code rendered');

  const names = ['Mathieu', 'Björn', 'Lovisa'];
  const phones = [];
  for (let i = 0; i < 3; i++) {
    const p = await newPhone(); p.on('pageerror', e => errors.push('phone' + i + ': ' + e.message));
    await p.goto(BASE + 'play.html?room=' + code + T + '&slot=' + i);
    await p.fill('#name', names[i]); await p.click('#go');
    phones.push(p);
  }
  await host.waitForFunction(() => [...window.__gp.players.values()].filter(p => p.connected).length === 3, null, { timeout: 45000 });
  check(true, '3 players joined over ' + MODE);
  for (const p of phones) await p.waitForSelector('text=You\'re in', { timeout: 15000 });
  // duplicate name is refused
  const dup = await newPhone(); await dup.goto(BASE + 'play.html?room=' + code + T + '&slot=dup'); await dup.fill('#name', 'mathieu'); await dup.click('#go');
  await dup.waitForSelector('text=already taken', { timeout: 20000 }).then(() => check(true, 'duplicate name refused')).catch(() => check(false, 'duplicate name refused'));
  await dup.close();
  await host.click('#countPick [data-count="' + COUNT + '"]');
  await host.click('#diffPick [data-diff="' + DIFF + '"]');
  // select exactly the requested rounds
  await host.evaluate((want) => window.GPQ.ROUND_ORDER.forEach(id => { const b = document.querySelector('#roundPicks [data-round="' + id + '"]'); if (b.classList.contains('on') !== want.includes(id)) b.click(); }), ROUNDS);
  await sleep(300);
  if (SHOOT && ROUNDS.length === 8) { await host.screenshot({ path: SHOTS + '01-host-lobby-qr.png' }); await phones[0].screenshot({ path: SHOTS + '00-phone-lobby.png' }); }
  await host.click('#startBtn');
  await host.waitForFunction(() => window.__gp.game);
  const cfg = await host.evaluate(() => { const g = window.__gp.game; return { rounds: g.rounds.map(r => r.id), tiers: g.rounds.map(r => r.questions.map(q => q.tier)), diff: g.difficulty || (window.__gp.settings && window.__gp.settings.difficulty) }; });
  check(cfg.rounds.join() === ROUNDS.join(), 'selected rounds played in order: ' + cfg.rounds.join());
  const want = await host.evaluate(([n, d]) => window.GPQ.tierSplit(n, d), [COUNT, DIFF]);
  check(cfg.tiers.every(t => [1, 2, 3].map(k => t.filter(x => x === k).length).join() === want.join() && t.every((x, i) => !i || x >= t[i - 1])), DIFF + ' difficulty: every round has tier mix ' + want.join('/') + ' ordered easy to hard');

  const shot = {}; let lastQ = null, qCount = 0; const firstGameTargets = {};
  const phoneTotals = {};
  let carlReloaded = false, carlReplaced = false, noAnswerDone = false;
  const getState = () => host.evaluate(() => { const S = window.__gp; const g = S.game; return { phase: S.phase, qid: g && g.qi >= 0 ? g.ri + '-' + g.qi : null, q: g && g.q, round: g && g.rounds[g.ri].id, players: [...S.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, streak: p.streak })) }; });
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    const st = await getState();
    if (st.phase === 'podium') break;
    if (st.phase === 'question' && st.qid !== lastQ) {
      lastQ = st.qid; qCount++; const q = st.q;
      // slow test steps (screenshots, reconnects) happen during the reveal: hold the show with the host's pause button
      const NEW = ['landmark', 'hilo', 'mystery', 'zoom'];
      const needHold = (q.kind === 'capitals' && (!shot.capRev || !carlReplaced)) || (q.kind === 'map' && !shot.map) || (st.round === 'shapes' && !carlReloaded) || (SHOOT && NEW.includes(q.kind) && !shot[q.kind + 'Rev']);
      let held = false;
      const hold = async () => { await host.waitForFunction(() => window.__gp.phase !== 'question', null, { timeout: 30000 }); if (needHold && !held) { held = true; if (!(await host.evaluate(() => window.__gp.paused))) await host.click('#cPause'); } };
      (firstGameTargets[st.round] = firstGameTargets[st.round] || []).push(q.target);
      log('Q', st.qid, q.kind, q.tier, q.target, q.prompt);
      // wait phones show the question
      const pin = q.kind === 'map' || q.kind === 'landmark';
      await Promise.all(phones.map(p => p.waitForSelector(pin ? '#mw svg' : '.pop', { timeout: 20000 })));
      const revShot = async (name) => { await hold(); await sleep(q.kind === 'zoom' ? 2200 : 1200); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = 'hidden'); await host.screenshot({ path: SHOTS + name }); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = ''); shot[q.kind + 'Rev'] = 1; };
      const NUM = { landmark: '11', hilo: '12', mystery: '13', zoom: '14' }[q.kind];
      if (!pin) {
        if (SHOOT && q.kind === 'hilo' && !shot.hilo) { await sleep(900); await host.screenshot({ path: SHOTS + NUM + '-tv-hilo-question.png' }); await phones[0].screenshot({ path: SHOTS + NUM + 'b-phone-hilo-question.png' }); shot.hilo = 1; }
        if (SHOOT && q.kind === 'mystery' && !shot.mystery) { await sleep(7800); await host.screenshot({ path: SHOTS + NUM + '-tv-mystery-question.png' }); await phones[0].screenshot({ path: SHOTS + NUM + 'b-phone-mystery-question.png' }); shot.mystery = 1; }
        if (SHOOT && q.kind === 'zoom' && !shot.zoom) { await sleep(4000); await host.screenshot({ path: SHOTS + NUM + '-tv-zoom-question.png' }); await phones[0].screenshot({ path: SHOTS + NUM + 'b-phone-zoom-question.png' }); shot.zoom = 1; }
        const nOpt = q.options.length;
        if (q.kind === 'flags' && !shot.flag) { await sleep(700); await host.screenshot({ path: SHOTS + '02-tv-flag-question.png' }); }
        if (q.kind === 'shapes' && !shot.shape) { await sleep(700); await host.screenshot({ path: SHOTS + '04-tv-shape-question.png' }); }
        if (q.kind === 'capitals' && !shot.cap) { await sleep(700); await host.screenshot({ path: SHOTS + '05-tv-capital-question.png' }); }
        const wrong = (q.correct + 1) % nOpt;
        // Mathieu: always right & fast. Björn: right on even questions. Lovisa: slow (~6 s), once silent.
        await phones[0].click('.pop[data-i="' + q.correct + '"]');
        if (q.kind === 'flags' && !shot.flag) { await phones[1].screenshot({ path: SHOTS + '03-phone-answer-screen.png' }); shot.flag = 1; }
        await sleep(400);
        await phones[1].click('.pop[data-i="' + (qCount % 2 === 0 ? q.correct : wrong) + '"]');
        if (q.kind === 'shapes' && !shot.shape) { await phones[2].screenshot({ path: SHOTS + '04b-phone-shape-question.png' }); shot.shape = 1; }
        if (q.kind === 'capitals' && !shot.cap) shot.cap = 1;
        if (qCount === 4 && !noAnswerDone) { noAnswerDone = true; log('Lovisa does not answer (timeout test)'); }
        else { await sleep(5500); await phones[2].click('.pop[data-i="' + (qCount % 3 === 0 ? wrong : q.correct) + '"]').catch(() => {}); }
        if (SHOOT && NEW.includes(q.kind) && !shot[q.kind + 'Rev']) await revShot(NUM + 'c-tv-' + q.kind + '-reveal.png');
        if (q.kind === 'capitals' && !shot.capRev) { await hold(); await sleep(800); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = 'hidden'); await host.screenshot({ path: SHOTS + '05b-tv-capital-reveal.png' }); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = ''); shot.capRev = 1; }
      } else {
        // real touch tap for Mathieu (exact location), helper taps for others
        const pt = await phones[0].evaluate(({ lat, lon }) => { const svg = document.querySelector('#mw svg'); const [x, y] = window.GPMap.project(lat, lon); const p = svg.createSVGPoint(); p.x = x; p.y = y; const r = p.matrixTransform(svg.getScreenCTM()); return { x: r.x, y: r.y }; }, { lat: q.lat, lon: q.lon });
        if (MODE === 'local') await phones[0].mouse.click(pt.x, pt.y); else await phones[0].touchscreen.tap(pt.x, pt.y);
        await sleep(300);
        if (SHOOT && q.kind === 'landmark' && !shot.landmark) { await sleep(800); await host.screenshot({ path: SHOTS + '11-tv-landmark-question.png' }); await phones[0].screenshot({ path: SHOTS + '11b-phone-landmark-map.png' }); shot.landmark = 1; }
        if (q.kind === 'map' && !shot.map) { await phones[0].screenshot({ path: SHOTS + '06-phone-map.png' }); }
        await phones[0].click('#conf');
        await phones[1].evaluate(({ lat, lon }) => window.__mapTest.tapAt(lat + 3, lon - 2), { lat: q.lat, lon: q.lon }); await phones[1].click('#conf');
        if (qCount % 2 === 1) { await sleep(2500); await phones[2].evaluate(({ lat, lon }) => window.__mapTest.tapAt(lat - 12, lon + 15), { lat: q.lat, lon: q.lon }); await phones[2].click('#conf'); }
        else log('Lovisa places no pin (timeout test)');
        if (SHOOT && q.kind === 'landmark' && !shot.landmarkRev) { await hold(); await sleep(1300); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = 'hidden'); await host.screenshot({ path: SHOTS + '11c-tv-landmark-reveal.png' }); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = ''); shot.landmarkRev = 1; }
        if (q.kind === 'map' && !shot.map) { await hold(); await sleep(2000); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = 'hidden'); await host.screenshot({ path: SHOTS + '07-tv-map-reveal.png' }); await host.evaluate(() => document.querySelector('#pausedBadge').style.visibility = ''); shot.map = 1; }
      }
      await hold();
      // check phones' result totals equal host scores
      const st2 = await getState();
      await sleep(500);
      for (let i = 0; i < 3; i++) {
        const txt = await phones[i].textContent('#screen').catch(() => '');
        const m = /Your total:\s*([\d,]+)/.exec(txt || '');
        const hp = st2.players.find(p => p.name === names[i]);
        if (m) phoneTotals[names[i]] = (phoneTotals[names[i]] || 0) + (parseInt(m[1].replace(/,/g, '')) === hp.score ? 0 : 1);
      }
      // reconnect test 1: Lovisa refreshes her phone during round 2
      if (st.round === 'shapes' && !carlReloaded) {
        carlReloaded = true; const before = st2.players.find(p => p.name === 'Lovisa').score;
        await phones[2].reload();
        await host.waitForFunction(() => { const p = [...window.__gp.players.values()].find(x => x.name === 'Lovisa'); return p && p.connected; }, null, { timeout: 30000 });
        const after = (await getState()).players.find(p => p.name === 'Lovisa');
        check(after.score === before && (await getState()).players.length === 3, 'reload: Lovisa rejoined with same score (' + before + ')');
        check(await host.evaluate(() => window.__gp.paused), 'host pause button pauses the show');
      }
      // reconnect test 2: Lovisa's phone dies, she rejoins from a fresh browser with same name
      if (st.round === 'capitals' && !carlReplaced) {
        carlReplaced = true; const before = st2.players.find(p => p.name === 'Lovisa').score;
        await phones[2].close();
        await host.waitForFunction(() => { const p = [...window.__gp.players.values()].find(x => x.name === 'Lovisa'); return p && !p.connected; }, null, { timeout: 40000 });
        const np = await newPhone(); np.on('pageerror', e => errors.push('phone2b: ' + e.message));
        await np.goto(BASE + 'play.html?room=' + code + T + '&slot=new2'); await np.fill('#name', 'Lovisa'); await np.click('#go');
        await host.waitForFunction(() => { const p = [...window.__gp.players.values()].find(x => x.name === 'Lovisa'); return p && p.connected; }, null, { timeout: 30000 });
        phones[2] = np;
        const s3 = await getState();
        check(s3.players.length === 3 && s3.players.find(p => p.name === 'Lovisa').score === before, 'new device, same name: Lovisa took over her score (' + before + ')');
      }
      if (held) await host.click('#cPause');
    } else if (SHOOT && st.phase === 'mid' && !shot.mid) { shot.mid = 1; await sleep(1200); await host.screenshot({ path: SHOTS + '08-tv-halfway-standings.png' }); }
    else await sleep(150);
  }
  const fin = await getState();
  check(fin.phase === 'podium', 'reached podium');
  check(qCount === ROUNDS.length * COUNT, (ROUNDS.length * COUNT) + ' questions played (' + ROUNDS.length + ' rounds x ' + COUNT + '), got ' + qCount);
  check(Object.values(phoneTotals).every(v => v === 0), 'phone totals always matched host scores');
  await sleep(2500);
  if (SHOOT) await host.screenshot({ path: SHOTS + '09-tv-final-podium.png' });
  const ranks = [];
  for (let i = 0; i < 3; i++) { await phones[i].waitForSelector('.rank-big', { timeout: 15000 }); ranks.push(await phones[i].textContent('.rank-big')); }
  if (SHOOT) await phones[0].screenshot({ path: SHOTS + '10-phone-final-rank.png' });
  const order = fin.players.slice().sort((a, b) => b.score - a.score).map(p => p.name);
  log('final scores', fin.players.map(p => p.name + ':' + p.score).join(' '), 'phone ranks', ranks.join(','));
  check(new Set(ranks).size === 3 && ranks.includes('#1'), 'phones show final ranks');
  check(order[0] === 'Mathieu', 'always-correct fast player wins');
  // Play again
  await host.click('#againBtn');
  await host.waitForFunction(() => window.__gp.phase === 'lobby');
  const lobbyPlayers = await host.$$eval('#lobbyPlayers .pchip', els => els.length);
  check(lobbyPlayers === 3, 'Play again: back to setup with same 3 players');
  const seenTxt = await host.textContent('#seenInfo'); check(new RegExp((ROUNDS.length * COUNT) + ' questions').test(seenTxt), 'seen questions remembered: ' + seenTxt);
  await host.click('#countPick [data-count="10"]');
  await host.click('#diffPick [data-diff="' + DIFF2 + '"]');
  await host.click('#startBtn');
  await host.waitForFunction((n) => window.__gp.game && window.__gp.game.rounds.length === n, ROUNDS.length);
  const t2 = await host.evaluate(() => window.__gp.game.rounds.map(r => r.questions.map(q => q.tier)));
  const want2 = await host.evaluate((d) => window.GPQ.tierSplit(10, d), DIFF2);
  check(t2.every(t => [1, 2, 3].map(k => t.filter(x => x === k).length).join() === want2.join()), 'second game (' + DIFF2 + ', 10 q) tier mix ' + want2.join('/'));
  const g2 = await host.evaluate(() => Object.fromEntries(window.__gp.game.rounds.map(r => [r.id, r.questions.map(q => q.target)])));
  let rep = 0; for (const k in g2) rep += g2[k].filter(t => (firstGameTargets[k] || []).includes(t)).length;
  check(rep === 0, 'second game (10 q/round) repeats none of the first game\'s targets (repeats: ' + rep + ')');
  await host.click('#cQuit');
  await host.waitForFunction(() => window.__gp.phase === 'lobby');
  check(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  log(fails ? fails + ' FAILURES' : 'ALL CHECKS PASSED', '(' + MODE + ')');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
