/* Geo Party - world map (Mercator, Natural Earth 1:50m) shared by phone and TV */
(function () {
  'use strict';
  const M = window.WORLD_MAP, W = M.w, H = M.h;
  const my = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const Y0 = my(M.latTop), K = W / (2 * Math.PI);
  function project(lat, lon) { return [(lon + 180) / 360 * W, (Y0 - my(lat)) * K]; }
  function invert(x, y) { const lon = x / W * 360 - 180; const lat = (2 * Math.atan(Math.exp(Y0 - y / K)) - Math.PI / 2) * 180 / Math.PI; return [lat, lon]; }
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  function createSvg(cls) {
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: cls || 'worldmap', preserveAspectRatio: 'xMidYMid meet' });
    el('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, class: 'wm-sea' }, svg);
    const grat = el('g', { class: 'wm-grat' }, svg);
    for (let lon = -150; lon <= 150; lon += 30) { const [x] = project(0, lon); el('line', { x1: x, y1: 0, x2: x, y2: H }, grat); }
    for (const lat of [-30, 0, 30, 60]) { const [, y] = project(lat, 0); el('line', { x1: 0, y1: y, x2: W, y2: y }, grat); }
    el('path', { d: M.d, class: 'wm-land' }, svg);
    const over = el('g', { class: 'wm-over' }, svg);
    return { svg, over };
  }

  /* Pan / pinch-zoom controller working on the viewBox (keeps vectors crisp). */
  function attachPanZoom(svg, opts) {
    opts = opts || {};
    let vb = { x: 0, y: 0, w: W, h: H };
    const minW = 25, maxW = W * 1.15;
    const pts = new Map(); let gesture = null, moved = false, downT = 0;
    function apply() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); if (opts.onChange) opts.onChange(vb); }
    function rect() { return svg.getBoundingClientRect(); }
    // svg uses preserveAspectRatio meet: compute effective scale + offsets
    function metrics() { const r = rect(); const s = Math.min(r.width / vb.w, r.height / vb.h); const ox = (r.width - vb.w * s) / 2, oy = (r.height - vb.h * s) / 2; return { r, s, ox, oy }; }
    function toMap(cx, cy) { const m = metrics(); return [vb.x + (cx - m.r.left - m.ox) / m.s, vb.y + (cy - m.r.top - m.oy) / m.s]; }
    function clamp() {
      vb.w = Math.max(minW, Math.min(maxW, vb.w)); vb.h = vb.w * H / W;
      const mx = W * 0.1, myy = H * 0.1;
      vb.x = Math.max(-mx - Math.max(0, vb.w - W) / 2, Math.min(W + mx - vb.w + Math.max(0, vb.w - W) / 2, vb.x));
      vb.y = Math.max(-myy - Math.max(0, vb.h - H) / 2, Math.min(H + myy - vb.h + Math.max(0, vb.h - H) / 2, vb.y));
    }
    function zoomAt(cx, cy, f) { const [mx, myy] = toMap(cx, cy); const nw = Math.max(minW, Math.min(maxW, vb.w / f)); const k = nw / vb.w; vb.x = mx - (mx - vb.x) * k; vb.y = myy - (myy - vb.y) * k; vb.w = nw; clamp(); apply(); }
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = false; downT = Date.now(); gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, vb: Object.assign({}, vb) }; }
      else if (pts.size === 2) { moved = true; const [a, b] = [...pts.values()]; gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vb: Object.assign({}, vb) }; }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gesture) return;
      if (gesture.type === 'pan' && pts.size === 1) {
        const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (!moved) return;
        const m = metrics(); vb.x = gesture.vb.x - dx / m.s; vb.y = gesture.vb.y - dy / m.s; clamp(); apply();
      } else if (gesture.type === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        vb = Object.assign({}, gesture.vb); const m0 = metrics();
        const mx = vb.x + (gesture.cx - m0.r.left - m0.ox) / m0.s, myy = vb.y + (gesture.cy - m0.r.top - m0.oy) / m0.s;
        const nw = Math.max(minW, Math.min(maxW, gesture.vb.w * gesture.d / Math.max(10, d))); const k = nw / vb.w;
        vb.w = nw; vb.h = nw * H / W; const m1 = metrics();
        vb.x = mx - (cx - m1.r.left - m1.ox) / m1.s; vb.y = myy - (cy - m1.r.top - m1.oy) / m1.s; void k; clamp(); apply();
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (!moved && gesture && gesture.type === 'pan' && Date.now() - downT < 600 && opts.onTap) { const [x, y] = toMap(e.clientX, e.clientY); if (x >= 0 && x <= W && y >= 0 && y <= H) opts.onTap(x, y); }
        gesture = null;
      } else if (pts.size === 1) { const [p] = [...pts.values()]; gesture = { type: 'pan', sx: p.x, sy: p.y, vb: Object.assign({}, vb) }; }
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); if (!pts.size) gesture = null; });
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    apply();
    return {
      zoomIn() { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.6); },
      zoomOut() { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.6); },
      reset() { vb = { x: 0, y: 0, w: W, h: H }; apply(); },
      get vb() { return vb; }, pxPerUnit() { return metrics().s; }
    };
  }

  window.GPMap = { W, H, project, invert, createSvg, attachPanZoom, el };
})();
