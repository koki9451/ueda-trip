// 出所: Claude生成（上田・真田観光アプリ 本体）
(() => {
'use strict';

const TRIP = window.TRIP, SPOTS = window.SPOTS, CATS = window.CATS, AREAS = window.AREAS;
const byId = Object.fromEntries(SPOTS.map(s => [s.id, s]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS_PLAN = 'ueda.plan.v1', LS_KEY = 'ueda.gmapkey.v1';
const DRIVE_BUFFER = 10; // 駐車・乗り降りの余裕（分）

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できない環境でも動かす */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 同上 */ } }
};

// ───────── 時刻の道具 ─────────
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const pad = n => String(n).padStart(2, '0');
const fmt = m => { m = Math.round(m); const h = Math.floor(m / 60) % 24; return `${h}:${pad(((m % 60) + 60) % 60)}`; };
const dur = m => { m = Math.round(m); if (m < 60) return `${m}分`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}時間${r}分` : `${h}時間`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ───────── 計画データ ─────────
function newPlan() {
  const base = TRIP.bases[0];
  return { v: 1, days: TRIP.days.map(() => ({ start: { ...base }, end: null, startTime: '09:00', endBy: '', mode: 'drive', items: [], manual: {}, replan: null })) };
}
function cleanPlan(p) {
  const fresh = newPlan();
  if (!p || !Array.isArray(p.days)) return fresh;
  fresh.days.forEach((d, i) => {
    const src = p.days[i]; if (!src) return;
    const okPt = x => x && typeof x.lat === 'number' && typeof x.lng === 'number' && x.name;
    if (okPt(src.start)) d.start = src.start;
    if (okPt(src.end)) d.end = src.end;
    if (/^\d{1,2}:\d{2}$/.test(src.startTime || '')) d.startTime = src.startTime;
    if (/^\d{1,2}:\d{2}$/.test(src.endBy || '')) d.endBy = src.endBy;
    if (src.mode === 'drive' || src.mode === 'transit') d.mode = src.mode;
    if (Array.isArray(src.items)) {
      d.items = src.items.filter(it => it && byId[it.id]).map(it => ({ id: it.id, stay: Math.max(5, Number(it.stay) || byId[it.id].stay), skip: !!it.skip, done: !!it.done }));
    }
    if (src.manual && typeof src.manual === 'object') {
      Object.entries(src.manual).forEach(([k, v]) => { if (Number.isFinite(Number(v))) d.manual[k] = Number(v); });
    }
    if (src.replan && okPt(src.replan.from) && /^\d{1,2}:\d{2}$/.test(src.replan.time || '')) d.replan = src.replan;
  });
  return fresh;
}
function encodePlan(p) {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodePlan(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function readHash() {
  const m = location.hash.match(/[#&]p=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try { return cleanPlan(decodePlan(m[1])); } catch (e) { return null; }
}
function readLocal() {
  const raw = store.get(LS_PLAN); if (!raw) return null;
  try { return cleanPlan(JSON.parse(raw)); } catch (e) { return null; }
}
const hasItems = p => p.days.some(d => d.items.length);
function shareUrl() { return `${location.origin}${location.pathname}#p=${encodePlan(plan)}`; }
function save() {
  store.set(LS_PLAN, JSON.stringify(plan));
  try { history.replaceState(null, '', `#p=${encodePlan(plan)}`); } catch (e) { /* file: などでは無視 */ }
}

let plan = newPlan();
let curDay = 0;
let areaFilter = 'all';
let pick = null; // 地図で地点を選ぶモード {di, which}

// ───────── 距離と移動時間 ─────────
function hav(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const pkey = p => p.id ? p.id : `p:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
const gCache = {};      // 'mode|from|to' → {min, km, src}
const routePaths = {};  // 経路の線（車） sig → [[lat,lng],...]
const requested = new Set();
let transitApi = 'unknown'; // 日本の乗換がAPIで取れるか: unknown / ok / ng

function estimate(a, b, mode) {
  const d = hav(a, b), walkKm = d * 1.3;
  if (walkKm <= 0.7 || (mode === 'transit' && walkKm <= 1.6)) {
    return { min: Math.max(2, Math.round(walkKm / 4.5 * 60)), src: 'walk', km: walkKm, buf: 0 };
  }
  if (mode === 'drive') {
    const road = d * 1.35, sp = road < 4 ? 28 : 38;
    return { min: Math.max(4, Math.round(road / sp * 60)), src: 'est', km: road, buf: DRIVE_BUFFER };
  }
  return { min: null, src: 'none', km: d * 1.35, buf: 0 };
}
function legInfo(day, a, b) {
  const key = `${day.mode}|${pkey(a)}|${pkey(b)}`;
  if (day.manual[key] != null) return { min: day.manual[key], src: 'manual', buf: 0, key, km: hav(a, b) * 1.35 };
  const est = estimate(a, b, day.mode);
  if (est.src === 'walk') return { ...est, key };
  const g = gCache[key];
  if (g) return { min: g.min, src: g.src, km: g.km, buf: day.mode === 'drive' ? DRIVE_BUFFER : 0, key };
  return { ...est, key };
}

// ───────── スケジュール計算 ─────────
function compute(di) {
  const day = plan.days[di];
  const act = day.items.filter(it => !it.skip && !it.done);
  const origin = day.replan ? day.replan.from : day.start;
  const end = day.end || day.start;
  let t = toMin(day.replan ? day.replan.time : day.startTime);
  const res = { rows: [], byItem: new Map(), pts: [origin], act, move: 0, stay: 0, warn: 0, missing: 0, startTime: t, endTime: t, origin, end, endLeg: null, late: false };
  let prev = origin;
  act.forEach((it, i) => {
    const s = byId[it.id];
    const leg = legInfo(day, prev, s);
    const total = (leg.min ?? 0) + (leg.min != null ? leg.buf : 0);
    if (leg.min == null) res.missing++;
    const depart0 = t;
    t += total; res.move += total;
    const arrive = t, warns = [], infos = [];
    if (s.open && arrive < toMin(s.open)) { infos.push(`開く時刻（${s.open}）まで${dur(toMin(s.open) - arrive)}待ちます`); t = toMin(s.open); }
    if (s.last && arrive > toMin(s.last)) warns.push(`${s.lastLabel || '最終入館'}（${s.last}）に間に合いません`);
    const visitStart = t;
    t += it.stay; res.stay += it.stay;
    if (s.close && t > toMin(s.close)) warns.push(`閉まる時刻（${s.close}）を過ぎます`);
    if (s.outdoor && t > toMin(TRIP.sunset)) warns.push(`日没（${TRIP.sunset}）のあとになります`);
    res.warn += warns.length;
    res.byItem.set(it, { leg, from: prev, s, arrive, visitStart, depart: t, warns, infos, n: i + 1, legDepart: depart0 });
    prev = s; res.pts.push(s);
  });
  if (act.length) {
    const leg = legInfo(day, prev, end);
    const total = (leg.min ?? 0) + (leg.min != null ? leg.buf : 0);
    if (leg.min == null) res.missing++;
    res.endLeg = { leg, from: prev, to: end, legDepart: t };
    t += total; res.move += total; res.pts.push(end);
  }
  res.endTime = t;
  res.late = !!(day.endBy && t > toMin(day.endBy));
  if (res.late) res.warn++;
  return res;
}

// ───────── Googleマップへのリンク ─────────
const gPlace = p => p.gq ? (p.gq.includes('上田') ? p.gq : `${p.gq} 長野県上田市`) : `${p.lat},${p.lng}`;
const enc = encodeURIComponent;
const tmode = (mode, src) => src === 'walk' ? 'walking' : (mode === 'drive' ? 'driving' : 'transit');
const dirUrl = (a, b, mode, src) => `https://www.google.com/maps/dir/?api=1&origin=${enc(gPlace(a))}&destination=${enc(gPlace(b))}&travelmode=${tmode(mode, src)}`;
const navUrl = (b, mode) => `https://www.google.com/maps/dir/?api=1&destination=${enc(gPlace(b))}&travelmode=${tmode(mode)}`;
const placeUrl = p => `https://www.google.com/maps/search/?api=1&query=${enc(gPlace(p))}`;
function routeUrl(pts) {
  const mid = pts.slice(1, -1).slice(0, 9).map(gPlace).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(gPlace(pts[0]))}&destination=${enc(gPlace(pts[pts.length - 1]))}${mid ? `&waypoints=${enc(mid)}` : ''}&travelmode=driving`;
}

// ───────── 小さな部品（トースト・ダイアログ・現在地） ─────────
let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function ask({ title, text, options = [], cancel = 'やめる', onOpen }) {
  return new Promise(resolve => {
    const box = $('#dialog'), body = $('#dialogBody');
    body.innerHTML = `
      <p class="dlg-title">${esc(title)}</p>
      ${text ? `<p class="dlg-text">${esc(text)}</p>` : ''}
      <div id="dlgExtra"></div>
      <div class="dlg-list">${options.map((o, i) => `<button class="btn ${o.primary ? 'btn-primary' : ''}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>
      ${cancel ? `<button class="btn btn-ghost btn-block" data-cancel>${esc(cancel)}</button>` : ''}`;
    box.hidden = false;
    const done = v => { box.hidden = true; box.onclick = null; body.innerHTML = ''; resolve(v); };
    box.onclick = e => {
      const b = e.target.closest('[data-i]');
      if (b) return done(options[Number(b.dataset.i)].value);
      if (e.target.closest('[data-cancel]') || e.target.closest('[data-close]')) return done(null);
    };
    if (onOpen) onOpen($('#dlgExtra'), done);
  });
}
function getPos(timeout = 7000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
}
function loadCss(href) {
  return new Promise(res => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); });
}

// ───────── 地図（Googleマップ／簡易地図の2系統） ─────────
const M = { kind: null, map: null, markers: [], line: null, user: null, note: '' };

async function initMap() {
  const key = store.get(LS_KEY);
  if (key) {
    try { await initGoogle(key); return; }
    catch (e) { M.note = 'Googleマップを読み込めませんでした。簡易地図で表示しています（「交通・設定」でキーを確認できます）。'; }
  } else {
    M.note = '簡易地図で表示中（「交通・設定」でGoogleマップに切替）';
  }
  await initLeaflet();
}

function initGoogle(key) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = err => { if (!settled) { settled = true; reject(err); } };
    const timer = setTimeout(() => fail(new Error('timeout')), 12000);
    window.gm_authFailure = () => {
      // キーが無効・制限に合わない場合に呼ばれる。簡易地図へ切り替える
      M.note = 'Googleマップのキーが使えませんでした。簡易地図で表示しています（キーの制限や上限を確認してください）。';
      if (M.kind === 'google') { M.kind = null; $('#map').innerHTML = ''; initLeaflet().then(() => { drawMap(); renderInfo(); }); }
      else fail(new Error('auth'));
    };
    window.__gmReady = async () => {
      try {
        await google.maps.importLibrary('maps');
        await google.maps.importLibrary('marker');
        if (settled) return;
        clearTimeout(timer);
        M.map = new google.maps.Map($('#map'), {
          center: TRIP.center, zoom: 12, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false
        });
        M.map.addListener('click', e => onMapClick(e.latLng.lat(), e.latLng.lng()));
        M.kind = 'google'; M.note = '';
        settled = true; resolve();
      } catch (e) { fail(e); }
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${enc(key)}&v=weekly&loading=async&language=ja&region=JP&callback=__gmReady`;
    s.async = true; s.onerror = () => fail(new Error('script'));
    document.head.appendChild(s);
  });
}

async function initLeaflet() {
  await loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  M.map = L.map('map', { zoomControl: false }).setView([TRIP.center.lat, TRIP.center.lng], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(M.map);
  M.map.on('click', e => onMapClick(e.latlng.lat, e.latlng.lng));
  M.kind = 'leaflet';
}

const CIRCLE = 'M 0,-1 A 1,1 0 1,1 0,1 A 1,1 0 1,1 0,-1 Z';
function addMarker({ lat, lng, text, color, big, square, onClick, title }) {
  if (M.kind === 'google') {
    const mk = new google.maps.Marker({
      position: { lat, lng }, map: M.map, title,
      zIndex: big ? 20 : (square ? 5 : 10),
      label: { text: String(text), color: '#fff', fontSize: big ? '14px' : '12px', fontWeight: '700' },
      icon: square
        ? { path: 'M -1,-1 L 1,-1 L 1,1 L -1,1 Z', scale: 12, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
        : { path: CIRCLE, scale: big ? 16 : 13, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: big ? 3 : 2 }
    });
    if (onClick) mk.addListener('click', onClick);
    M.markers.push(mk);
  } else if (M.kind === 'leaflet') {
    const size = big ? 34 : 30;
    const icon = L.divIcon({
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<div class="pin ${big ? 'is-plan' : ''} ${square ? 'pin-base' : ''}" style="${square ? '' : `background:${color}`}">${esc(text)}</div>`
    });
    const mk = L.marker([lat, lng], { icon, title, zIndexOffset: big ? 500 : 0 }).addTo(M.map);
    if (onClick) mk.on('click', onClick);
    M.markers.push(mk);
  }
}
function clearMap() {
  M.markers.forEach(mk => { if (M.kind === 'google') mk.setMap(null); else mk.remove(); });
  M.markers = [];
  if (M.line) { if (M.kind === 'google') M.line.setMap(null); else M.line.remove(); M.line = null; }
}
function setLine(path, solid) {
  if (path.length < 2) return;
  if (M.kind === 'google') {
    M.line = new google.maps.Polyline({
      map: M.map, path: path.map(([lat, lng]) => ({ lat, lng })), clickable: false,
      strokeColor: '#8f1d22', strokeOpacity: solid ? 0.85 : 0, strokeWeight: 5,
      icons: solid ? [] : [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3 }, offset: '0', repeat: '14px' }]
    });
  } else if (M.kind === 'leaflet') {
    M.line = L.polyline(path, { color: '#8f1d22', weight: 5, opacity: 0.85, dashArray: solid ? null : '6 10', interactive: false }).addTo(M.map);
  }
}
function fitTo(points) {
  if (!M.map || !points.length) return;
  if (M.kind === 'google') {
    const b = new google.maps.LatLngBounds(); points.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
    M.map.fitBounds(b, { top: 70, bottom: Math.round(window.innerHeight * 0.42), left: 30, right: 30 });
  } else {
    M.map.fitBounds(points.map(p => [p.lat, p.lng]), { paddingTopLeft: [30, 70], paddingBottomRight: [30, Math.round(window.innerHeight * 0.42)], maxZoom: 16 });
  }
}
function panTo(p, zoom) {
  if (!M.map) return;
  if (M.kind === 'google') { M.map.panTo({ lat: p.lat, lng: p.lng }); if (zoom && M.map.getZoom() < zoom) M.map.setZoom(zoom); }
  else M.map.setView([p.lat, p.lng], Math.max(M.map.getZoom(), zoom || 0));
}
function setUser(p) {
  if (!M.map) return;
  if (M.user) { if (M.kind === 'google') M.user.setMap(null); else M.user.remove(); }
  if (M.kind === 'google') {
    M.user = new google.maps.Marker({ position: p, map: M.map, zIndex: 30, title: '現在地', icon: { path: CIRCLE, scale: 8, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
  } else {
    M.user = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="pin-user"></div>' }), zIndexOffset: 900 }).addTo(M.map);
  }
}

function visibleSpots() {
  const inPlan = new Set(plan.days.flatMap(d => d.items.map(it => it.id)));
  return SPOTS.filter(s => areaFilter === 'all' || (areaFilter === 'plan' ? inPlan.has(s.id) : s.area === areaFilter));
}
function drawMap() {
  if (!M.kind) return;
  clearMap();
  const c = compute(curDay);
  const order = new Map(); c.act.forEach((it, i) => order.set(it.id, i + 1));
  visibleSpots().forEach(s => {
    const n = order.get(s.id);
    addMarker({ lat: s.lat, lng: s.lng, text: n || CATS[s.cat].mark, color: CATS[s.cat].color, big: !!n, title: s.name, onClick: () => openDetail(s.id) });
  });
  const day = plan.days[curDay];
  const bases = [c.origin]; if (day.end && pkey(day.end) !== pkey(c.origin)) bases.push(day.end);
  bases.forEach((b, i) => addMarker({ lat: b.lat, lng: b.lng, text: i === 0 ? '発' : '着', color: '#1d1b19', square: true, title: b.name }));
  if (c.act.length) {
    const sig = routeSig(day, c.pts);
    const path = day.mode === 'drive' && routePaths[sig];
    setLine(path || c.pts.map(p => [p.lat, p.lng]), !!path);
  }
  const note = $('#mapNote');
  note.hidden = !M.note; note.textContent = M.note;
}

function onMapClick(lat, lng) {
  if (!pick) return;
  const day = plan.days[pick.di];
  const pt = { name: '地図で選んだ地点', lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  if (pick.which === 'start') day.start = pt; else day.end = pt;
  endPick(); save(); renderAll(); switchView('plan');
  toast(`${pick_label(pick_last)}を地図の地点に設定しました`);
}
let pick_last = 'start';
const pick_label = w => w === 'start' ? '出発地点' : '帰着地点';
function startPick(di, which) {
  pick = { di, which }; pick_last = which;
  $('#pickText').textContent = `地図をタップして${pick_label(which)}を選んでください`;
  $('#pickBar').hidden = false; setSheet('peek'); switchView('map');
}
function endPick() { pick = null; $('#pickBar').hidden = true; }

// ───────── Googleのルート計算（Routes API） ─────────
const wp = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
const routeSig = (day, pts) => `${day.mode}|${pts.map(pkey).join('>')}`;
function decodePolyline(str) {
  let i = 0, lat = 0, lng = 0; const out = [];
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
async function callRoutes(body, mask) {
  const key = store.get(LS_KEY);
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('routes ' + r.status);
  const j = await r.json();
  return j.routes && j.routes[0];
}
const secs = d => parseInt(String(d || '0').replace('s', ''), 10) || 0;

async function refreshRoutes(di) {
  if (M.kind !== 'google') return;
  const day = plan.days[di], c = compute(di);
  if (c.pts.length < 2 || !c.act.length) return;
  if (day.mode === 'drive') {
    const sig = routeSig(day, c.pts);
    if (requested.has(sig)) return; requested.add(sig);
    try {
      const route = await callRoutes({
        origin: wp(c.pts[0]), destination: wp(c.pts[c.pts.length - 1]), intermediates: c.pts.slice(1, -1).map(wp),
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'ja', units: 'METRIC'
      }, 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters');
      if (!route || !route.legs) return;
      route.legs.forEach((leg, i) => {
        const a = c.pts[i], b = c.pts[i + 1];
        gCache[`drive|${pkey(a)}|${pkey(b)}`] = { min: Math.max(1, Math.round(secs(leg.duration) / 60)), km: (leg.distanceMeters || 0) / 1000, src: 'google' };
      });
      if (route.polyline && route.polyline.encodedPolyline) routePaths[sig] = decodePolyline(route.polyline.encodedPolyline);
      if (di === curDay) { renderPlan(); drawMap(); }
    } catch (e) { /* 取れないときは概算のまま */ }
  } else if (transitApi !== 'ng') {
    // 公共交通：日本で取れるかを試す。取れなければ以後は試さない
    const legs = [...c.act.map(it => c.byItem.get(it)).map(r => ({ leg: r.leg, a: r.from, b: r.s, t: r.legDepart }))];
    if (c.endLeg) legs.push({ leg: c.endLeg.leg, a: c.endLeg.from, b: c.endLeg.to, t: c.endLeg.legDepart });
    for (const x of legs) {
      if (x.leg.src !== 'none' || requested.has(x.leg.key) || transitApi === 'ng') continue;
      requested.add(x.leg.key);
      try {
        const dep = `${TRIP.days[di].date}T${pad(Math.floor(x.t / 60) % 24)}:${pad(x.t % 60)}:00+09:00`;
        const route = await callRoutes({ origin: wp(x.a), destination: wp(x.b), travelMode: 'TRANSIT', departureTime: dep, languageCode: 'ja', units: 'METRIC' },
          'routes.duration,routes.distanceMeters');
        if (route && route.duration) {
          transitApi = 'ok';
          gCache[x.leg.key] = { min: Math.max(1, Math.round(secs(route.duration) / 60)), km: (route.distanceMeters || 0) / 1000, src: 'gtransit' };
        } else if (transitApi === 'unknown') { transitApi = 'ng'; }
      } catch (e) { if (transitApi === 'unknown') transitApi = 'ng'; }
    }
    if (di === curDay) { renderPlan(); renderInfo(); }
  }
}
let routeTimer = null;
function queueRoutes() { clearTimeout(routeTimer); routeTimer = setTimeout(() => refreshRoutes(curDay), 700); }

// ───────── 一覧（地図タブ） ─────────
const TRANSIT_TAG = { good: ['tag-good', '公共交通で行きやすい'], few: ['tag-few', '本数少ない'], car: ['tag-car', '車・タクシー向き'] };
function dayOf(id) { return plan.days.findIndex(d => d.items.some(it => it.id === id)); }

function renderChips() {
  const chips = [['all', 'すべて'], ...Object.entries(AREAS).map(([k, v]) => [k, v.name]), ['plan', '予定に入れた']];
  $('#areaChips').innerHTML = chips.map(([k, n]) => `<button class="chip ${areaFilter === k ? 'is-on' : ''}" data-area="${k}">${esc(n)}</button>`).join('');
}
function renderList() {
  const list = visibleSpots();
  $('#listCount').textContent = `${list.length}件`;
  $('#listTitle').textContent = areaFilter === 'all' ? 'スポット' : (areaFilter === 'plan' ? '予定に入れたスポット' : AREAS[areaFilter].name);
  const groups = Object.keys(AREAS).map(a => [a, list.filter(s => s.area === a)]).filter(([, l]) => l.length);
  $('#spotList').innerHTML = groups.length ? groups.map(([a, l]) => `
    <div class="area-h">${esc(AREAS[a].name)}　<span class="muted">${esc(AREAS[a].note)}</span></div>
    ${l.map(s => {
      const d = dayOf(s.id), tg = TRANSIT_TAG[s.transit.level];
      return `<button class="spot-row" data-spot="${s.id}">
        <span class="spot-mark" style="background:${CATS[s.cat].color}">${CATS[s.cat].mark}</span>
        <span class="spot-main">
          <span class="spot-name">${esc(s.name)}</span>
          <span class="spot-meta"><span>目安 ${dur(s.stay)}</span><span class="tag ${tg[0]}">${tg[1]}</span></span>
        </span>
        ${d >= 0 ? `<span class="spot-in">${TRIP.days[d].label}</span>` : ''}
      </button>`;
    }).join('')}`).join('') : '<div class="empty"><p>まだ予定に入れたスポットがありません。</p></div>';
}

// シートの開閉（タップで3段階、ドラッグにも対応）
const SHEET_STATES = ['peek', 'half', 'full'];
let sheetState = 'half';
function setSheet(st) {
  sheetState = st; const el = $('#listSheet');
  SHEET_STATES.forEach(s => el.classList.toggle('is-' + s, s === st));
  el.style.transform = '';
}
function initSheet() {
  const el = $('#listSheet'), handle = $('#listHandle');
  let startY = 0, startOff = 0, moved = false, h = 0;
  const offsetOf = st => st === 'full' ? 0 : (st === 'half' ? h * 0.46 : h - 62);
  handle.addEventListener('click', () => { if (!moved) setSheet(SHEET_STATES[(SHEET_STATES.indexOf(sheetState) + 1) % 3]); });
  handle.addEventListener('touchstart', e => { h = el.offsetHeight; startY = e.touches[0].clientY; startOff = offsetOf(sheetState); moved = false; el.classList.add('is-drag'); }, { passive: true });
  handle.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY; if (Math.abs(dy) > 6) moved = true;
    el.style.transform = `translateY(${Math.min(h - 62, Math.max(0, startOff + dy))}px)`;
  }, { passive: true });
  handle.addEventListener('touchend', () => {
    el.classList.remove('is-drag');
    if (!moved) { el.style.transform = ''; return; }
    const cur = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const best = SHEET_STATES.reduce((a, b) => Math.abs(offsetOf(a) - cur) < Math.abs(offsetOf(b) - cur) ? a : b);
    setSheet(best); setTimeout(() => { moved = false; }, 50);
  });
}

// ───────── スポット詳細 ─────────
function openDetail(id) {
  const s = byId[id]; if (!s) return;
  const cat = CATS[s.cat], tg = TRANSIT_TAG[s.transit.level];
  const photo = s.photo ? `
    <div class="d-photo">
      <img src="https://commons.wikimedia.org/wiki/Special:FilePath/${enc(s.photo.file)}?width=800" alt="${esc(s.name)}の写真" loading="lazy" onerror="this.closest('.d-photo').remove()">
      <span class="d-credit">写真：${esc(s.photo.author)}／${esc(s.photo.license)}／<a href="https://commons.wikimedia.org/wiki/File:${enc(s.photo.file)}" target="_blank" rel="noopener">Wikimedia Commons</a></span>
    </div>` : '<div class="d-nophoto"></div>';
  const video = s.video ? `
    <div class="d-h">関連動画</div>
    <div class="d-video" data-video="${esc(s.video.id)}">
      <img src="https://i.ytimg.com/vi/${esc(s.video.id)}/hqdefault.jpg" alt="" loading="lazy">
      <button class="d-play" data-play="${esc(s.video.id)}"><i>▶</i>再生する</button>
    </div>
    <div class="d-vmeta">${esc(s.video.title)}（${esc(s.video.channel)}・${s.video.official ? '公式' : '一般の投稿'}）
      <a href="https://www.youtube.com/watch?v=${esc(s.video.id)}" target="_blank" rel="noopener">YouTubeで開く</a></div>` : '';
  const facts = [
    ['滞在の目安', dur(s.stay)],
    ['時間', s.hours],
    s.fee ? ['料金', s.fee] : null,
    ['駐車場', s.parking],
    ['公共交通', `<span class="tag ${tg[0]}">${tg[1]}</span><br>${esc(s.transit.text)}`],
    s.tel ? ['電話', `<a href="tel:${esc(s.tel)}">${esc(s.tel)}</a>${s.telLabel ? `（${esc(s.telLabel)}）` : ''}`] : null
  ].filter(Boolean);
  $('#detailBody').innerHTML = `
    ${photo}
    <div class="d-inner">
      <span class="d-cat" style="background:${cat.color}">${cat.name}</span>
      <span class="muted">　${esc(AREAS[s.area].name)}</span>
      <h2 class="d-name" id="detailName">${esc(s.name)}</h2>
      ${s.sub ? `<div class="d-sub">${esc(s.sub)}</div>` : ''}
      <p class="d-intro">${esc(s.intro)}</p>
      <div class="d-h">おすすめポイント</div>
      <ol class="d-points">${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      ${s.sanada ? `<div class="d-h">真田との関わり</div>
        <div class="d-sanada"><span class="tag tag-plain">${esc(s.sanada.type)}</span> ${esc(s.sanada.text)}</div>` : ''}
      <div class="d-h">基本情報（11/22・23）</div>
      <dl class="d-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${k === '公共交通' || k === '電話' ? v : esc(v)}</dd>`).join('')}</dl>
      ${s.caution && s.caution.length ? `<div class="d-note is-warn"><ul>${s.caution.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${s.check && s.check.length ? `<div class="d-note is-check"><b>要確認</b><ul>${s.check.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${video}
      <div class="d-h">リンク</div>
      <div class="btn-row">
        <a class="btn btn-sm" href="${placeUrl(s)}" target="_blank" rel="noopener">Googleマップで開く</a>
        <a class="btn btn-sm" href="${esc(s.official)}" target="_blank" rel="noopener">公式サイト</a>
      </div>
    </div>
    <div class="d-actions"><div class="btn-row" id="detailActions"></div></div>`;
  renderDetailActions(id);
  $('#detail').hidden = false;
  $('#detail').dataset.id = id;
  panTo(s, 13);
}
function renderDetailActions(id) {
  const d = dayOf(id);
  $('#detailActions').innerHTML = TRIP.days.map((day, i) => i === d
    ? `<button class="btn" data-remove="${i}">${day.label}から外す</button>`
    : `<button class="btn btn-primary" data-add="${i}">${day.label}に${d >= 0 ? '移す' : '追加'}</button>`).join('');
}
function addToDay(id, di) {
  plan.days.forEach(d => { d.items = d.items.filter(it => it.id !== id); });
  plan.days[di].items.push({ id, stay: byId[id].stay, skip: false, done: false });
  curDay = di; save(); renderAll(); queueRoutes();
  toast(`${TRIP.days[di].label}に追加しました`);
}
function removeFromPlan(id) {
  plan.days.forEach(d => { d.items = d.items.filter(it => it.id !== id); });
  save(); renderAll(); queueRoutes();
}
function closeDetail() { $('#detail').hidden = true; $('#detailBody').innerHTML = ''; }

// ───────── スケジュール画面 ─────────
const SRC_LABEL = { walk: '徒歩・概算', est: '概算', google: 'Googleの計算', gtransit: 'Googleの乗換', manual: '手入力', none: '' };

function legHtml(day, x, isEnd) {
  const { leg, from } = x, to = isEnd ? x.to : x.s;
  const isWalk = leg.src === 'walk';
  const icon = isWalk ? '徒歩' : (day.mode === 'drive' ? '車' : '電車・バス');
  let main;
  if (leg.min == null) main = `<span class="is-missing">移動時間が未入力</span>`;
  else main = `<b>${icon} ${dur(leg.min)}</b>${leg.buf ? `<span>＋駐車など${leg.buf}分</span>` : ''}<span class="leg-src">${SRC_LABEL[leg.src]}</span>`;
  const input = (day.mode === 'transit' && !isWalk) || leg.src === 'manual'
    ? `<label>分数 <input type="number" inputmode="numeric" min="0" max="600" data-leg="${esc(leg.key)}" value="${leg.src === 'manual' ? leg.min : ''}" placeholder="${leg.min != null && leg.src !== 'manual' ? leg.min : ''}" aria-label="移動時間（分）"></label>` : '';
  const hint = day.mode === 'transit' && !isWalk && !isEnd && to.transit ? `<div class="leg-hint">行き方：${esc(to.transit.text)}</div>` : '';
  const hintEnd = day.mode === 'transit' && !isWalk && isEnd && from.transit ? `<div class="leg-hint">帰り：${esc(from.transit.text)}</div>` : '';
  return `<li class="tl-leg">
    <div class="tl-leg-l"></div><div class="tl-leg-bar"></div>
    <div class="tl-leg-c">
      ${main}${input}
      <a class="btn btn-sm" href="${dirUrl(from, to, day.mode, leg.src)}" target="_blank" rel="noopener">${day.mode === 'transit' && !isWalk ? 'Googleマップで乗換を見る' : 'Googleマップで行き方'}</a>
      ${hint}${hintEnd}
    </div>
  </li>`;
}

function renderPlan() {
  const di = curDay, day = plan.days[di], td = TRIP.days[di], c = compute(di);
  const end = day.end || day.start;
  const doneItems = day.items.filter(it => it.done);
  const total = day.items.length;

  const settings = `
    <div class="card">
      <h2>${td.label}　${td.date.slice(5).replace('-', '/')}（${td.wd}）</h2>
      <div class="set-row"><span class="set-l">出発地点</span><span class="set-v">${esc(day.start.name)}</span><button class="btn btn-sm" data-act="pt" data-which="start">変更</button></div>
      <div class="set-row"><span class="set-l">帰着地点</span><span class="set-v">${esc(end.name)}${day.end ? '' : '（出発と同じ）'}</span><button class="btn btn-sm" data-act="pt" data-which="end">変更</button></div>
      <div class="set-row"><span class="set-l">出発時刻</span><input type="time" data-set="startTime" value="${esc(day.startTime)}" aria-label="出発時刻"></div>
      <div class="set-row"><span class="set-l">帰着の希望</span><input type="time" data-set="endBy" value="${esc(day.endBy)}" aria-label="帰着の希望時刻"><span class="muted">${day.endBy ? '' : '任意'}</span></div>
      <div class="set-row"><span class="set-l">移動手段</span>
        <div class="seg"><button data-mode="drive" class="${day.mode === 'drive' ? 'is-on' : ''}">車</button><button data-mode="transit" class="${day.mode === 'transit' ? 'is-on' : ''}">公共交通</button></div></div>
    </div>`;

  if (!total) {
    $('#planPage').innerHTML = settings + `
      <div class="empty">
        <p>${td.label}の予定はまだ空です。<br>「地図」でスポットを選んで追加してください。</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="goMap">地図でスポットを選ぶ</button>
          ${hasItems(plan) ? '' : '<button class="btn" data-act="model">モデルコースを入れてみる</button>'}
        </div>
      </div>`;
    updateBadge(); return;
  }

  const alerts = [];
  if (day.replan) alerts.push(`<div class="alert alert-info">${esc(day.replan.time)} に「${esc(day.replan.from.name)}」から組み直した予定です。<button class="btn btn-sm" data-act="clearReplan" style="margin-left:6px">元に戻す</button></div>`);
  if (c.missing) alerts.push(`<div class="alert alert-warn">移動時間が未入力の区間が ${c.missing} か所あります。「Googleマップで乗換を見る」で確認して、分数を入れてください（未入力は0分として計算しています）。</div>`);
  if (day.mode === 'transit') alerts.push(`<div class="alert alert-info">公共交通の時間は、乗り継ぎの待ち時間を含めて入力するのがおすすめです。11/22・23は日祝ダイヤで本数が少なめです。</div>`);
  if (c.late) alerts.push(`<div class="alert alert-warn">帰着の希望（${esc(day.endBy)}）を過ぎます。滞在を短くするか、スポットを飛ばしてください。</div>`);

  const summary = `
    <div class="summary">
      <div class="sum ${c.late ? 'is-bad' : ''}"><b>${fmt(c.endTime)}</b><span>帰着の予定</span></div>
      <div class="sum"><b>${dur(c.stay)}</b><span>観光</span></div>
      <div class="sum"><b>${dur(c.move)}</b><span>移動</span></div>
      <div class="sum ${c.warn ? 'is-bad' : ''}"><b>${c.warn}</b><span>注意</span></div>
    </div>`;

  let tl = '';
  if (doneItems.length) {
    tl += `<li class="tl-spot"><div class="tl-spot-l"><span>済み</span></div><div class="tl-spot-bar"></div>
      <div class="tl-card is-done">${doneItems.map(it => `<div class="tl-ctl" style="margin:2px 0"><span>${esc(byId[it.id].name)}</span><span class="spacer"></span><button class="ic" data-act="undone" data-id="${it.id}">予定に戻す</button></div>`).join('')}</div></li>`;
  }
  tl += `<li class="tl-node"><span class="tl-time">${fmt(c.startTime)}</span><span class="tl-dot"></span><span class="tl-name">${esc(c.origin.name)} を出発</span></li>`;
  const visible = day.items.filter(it => !it.done);
  visible.forEach((it, vi) => {
    const s = byId[it.id], cat = CATS[s.cat];
    const ctl = `
      <div class="tl-ctl">
        ${it.skip ? '' : `<span class="stay"><button data-act="stay" data-id="${it.id}" data-d="-15" aria-label="滞在を15分短く">−15</button><span>滞在 ${dur(it.stay)}</span><button data-act="stay" data-id="${it.id}" data-d="15" aria-label="滞在を15分長く">+15</button></span><span class="brk"></span>`}
        <span class="spacer"></span>
        <button class="ic" data-act="up" data-id="${it.id}" ${vi === 0 ? 'disabled' : ''} aria-label="順番を前へ">↑</button>
        <button class="ic" data-act="down" data-id="${it.id}" ${vi === visible.length - 1 ? 'disabled' : ''} aria-label="順番を後ろへ">↓</button>
        <button class="ic" data-act="skip" data-id="${it.id}">${it.skip ? '戻す' : '飛ばす'}</button>
        <button class="ic" data-act="more" data-id="${it.id}" aria-label="その他の操作">…</button>
      </div>`;
    if (it.skip) {
      tl += `<li class="tl-spot"><div class="tl-spot-l"><span>飛ばす</span></div><div class="tl-spot-bar"></div>
        <div class="tl-card is-skip"><div class="tl-card-h"><span class="tl-num" style="background:#9a948a">−</span>
        <button class="tl-title" data-spot="${s.id}">${esc(s.name)}</button></div>${ctl}</div></li>`;
      return;
    }
    const r = c.byItem.get(it);
    tl += legHtml(day, r, false);
    tl += `<li class="tl-spot">
      <div class="tl-spot-l"><b>${fmt(r.visitStart)}</b><span>〜${fmt(r.depart)}</span></div><div class="tl-spot-bar"></div>
      <div class="tl-card">
        <div class="tl-card-h"><span class="tl-num" style="background:${cat.color}">${r.n}</span>
          <button class="tl-title" data-spot="${s.id}">${esc(s.name)}${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</button>
          <a class="btn btn-sm" href="${navUrl(s, day.mode)}" target="_blank" rel="noopener">ナビ</a></div>
        ${r.infos.map(x => `<div class="tl-info">${esc(x)}</div>`).join('')}
        ${r.warns.map(x => `<div class="tl-warn">${esc(x)}</div>`).join('')}
        ${ctl}
      </div></li>`;
  });
  if (c.endLeg) {
    tl += legHtml(day, { leg: c.endLeg.leg, from: c.endLeg.from, to: c.endLeg.to }, true);
    tl += `<li class="tl-node"><span class="tl-time">${fmt(c.endTime)}</span><span class="tl-dot"></span><span class="tl-name">${esc(end.name)} に到着</span></li>`;
  }

  const actions = `
    <div class="card">
      <div class="btn-row">
        <button class="btn btn-primary" data-act="replan">いまから組み直す</button>
        <button class="btn" data-act="sort">移動が短い順に並べ替え</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        ${day.mode === 'drive' && c.pts.length >= 2 ? `<a class="btn" href="${routeUrl(c.pts)}" target="_blank" rel="noopener">ルート全体をGoogleマップで開く</a>` : ''}
        <button class="btn" data-act="share">この計画を共有</button>
      </div>
    </div>`;

  $('#planPage').innerHTML = settings + summary + alerts.join('') + `<ol class="tl">${tl}</ol>` + actions;
  updateBadge();
}
function updateBadge() {
  const c = compute(curDay), n = c.warn + (c.missing ? 1 : 0), el = $('#planBadge');
  el.hidden = !n; el.textContent = n;
}

async function pointDialog(which) {
  const day = plan.days[curDay];
  const opts = [
    ...TRIP.bases.map(b => ({ label: `${b.name}`, value: { t: 'base', b } })),
    { label: '現在地にする', value: { t: 'gps' } },
    { label: '地図をタップして選ぶ', value: { t: 'pick' } }
  ];
  if (which === 'end') opts.unshift({ label: '出発地点と同じにする', value: { t: 'same' } });
  const v = await ask({
    title: `${pick_label(which)}を選ぶ`,
    text: M.kind === 'google' ? 'ホテル名で検索するか、下から選んでください。' : 'ホテルは「地図をタップして選ぶ」で指定できます（Googleマップのキーを入れると名前で検索できます）。',
    options: opts,
    onOpen: (box, done) => { if (M.kind === 'google') mountPlaceSearch(box, done); }
  });
  if (!v) return;
  if (v.t === 'base') setPoint(which, { ...v.b });
  else if (v.t === 'same') { day.end = null; save(); renderAll(); queueRoutes(); }
  else if (v.t === 'place') setPoint(which, v.p);
  else if (v.t === 'pick') startPick(curDay, which);
  else if (v.t === 'gps') {
    toast('現在地を確認しています…');
    const pos = await getPos();
    if (!pos) return toast('現在地を取得できませんでした（位置情報の許可を確認してください）');
    setPoint(which, { name: '現在地', lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
  }
}
function setPoint(which, pt) {
  const day = plan.days[curDay];
  if (which === 'start') day.start = pt; else day.end = pt;
  save(); renderAll(); queueRoutes();
  toast(`${pick_label(which)}を「${pt.name}」にしました`);
}
async function mountPlaceSearch(box, done) {
  try {
    const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
    const pac = new PlaceAutocompleteElement();
    pac.includedRegionCodes = ['jp'];
    pac.locationBias = { radius: 20000, center: TRIP.center };
    const wrap = document.createElement('div'); wrap.className = 'pac-wrap'; wrap.appendChild(pac); box.appendChild(wrap);
    pac.addEventListener('gmp-select', async ({ placePrediction }) => {
      try {
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
        const loc = place.location;
        done({ t: 'place', p: { name: place.displayName || '検索した場所', lat: Number(loc.lat().toFixed(6)), lng: Number(loc.lng().toFixed(6)) } });
      } catch (e) { toast('場所の情報を取得できませんでした'); }
    });
  } catch (e) { /* 検索部品が使えないときは選択肢だけ出す */ }
}

function moveItem(id, dir) {
  const day = plan.days[curDay], vis = day.items.filter(it => !it.done);
  const i = vis.findIndex(it => it.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= vis.length) return;
  const a = day.items.indexOf(vis[i]), b = day.items.indexOf(vis[j]);
  [day.items[a], day.items[b]] = [day.items[b], day.items[a]];
}
async function sortDay() {
  const day = plan.days[curDay], c = compute(curDay);
  if (c.act.length < 3) return toast('3か所以上あるときに使えます');
  let order = null;
  if (M.kind === 'google' && day.mode === 'drive') {
    try {
      const route = await callRoutes({
        origin: wp(c.origin), destination: wp(c.end), intermediates: c.act.map(it => wp(byId[it.id])),
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', optimizeWaypointOrder: true, languageCode: 'ja'
      }, 'routes.optimizedIntermediateWaypointIndex');
      const idx = route && route.optimizedIntermediateWaypointIndex;
      if (idx && idx.length === c.act.length) order = idx.map(i => c.act[i]);
    } catch (e) { /* 下の簡易な並べ替えへ */ }
  }
  if (!order) {
    const rest = [...c.act]; order = []; let cur = c.origin;
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((it, i) => { const d = hav(cur, byId[it.id]); if (d < bd) { bd = d; bi = i; } });
      const [nx] = rest.splice(bi, 1); order.push(nx); cur = byId[nx.id];
    }
  }
  // 閉まる時刻を考えない並べ替えなので、「遅くまで開いている屋内の場所を後ろへ回す案」とも比べ、注意が少ない方を選ぶ
  const before = [...day.items];
  const build = ord => [...before.filter(it => it.done), ...ord, ...before.filter(it => it.skip && !it.done)];
  const score = ord => { day.items = build(ord); const r = compute(curDay); return { warn: r.warn, end: r.endTime }; };
  const isLate = it => { const s = byId[it.id]; return !s.outdoor && s.close && toMin(s.close) >= 18 * 60; };
  const lateLast = [...order.filter(it => !isLate(it)), ...order.filter(isLate)];
  const base = (() => { day.items = before; const r = compute(curDay); return { warn: r.warn, end: r.endTime }; })();
  const a = score(order), b = score(lateLast);
  const best = (b.warn < a.warn || (b.warn === a.warn && b.end < a.end)) ? { ord: lateLast, s: b } : { ord: order, s: a };
  day.items = before;
  if (best.s.warn > base.warn) {
    const v = await ask({
      title: '並べ替えると注意が増えます',
      text: `移動が短い順にすると、閉まる時刻などの注意が ${base.warn} 件から ${best.s.warn} 件に増えます。並べ替えますか？`,
      options: [{ label: '並べ替える', value: 'y', primary: true }], cancel: 'いまの順番のままにする'
    });
    if (v !== 'y') return;
  }
  day.items = build(best.ord);
  save(); renderAll(); queueRoutes();
  toast(best.s.warn ? '並べ替えました。閉まる時刻の注意を確認してください' : '移動が短い順に並べ替えました', 3600);
}
async function replanNow() {
  const day = plan.days[curDay], c = compute(curDay);
  if (!c.act.length) return toast('組み直す予定がありません');
  const k = await ask({
    title: 'いまから組み直す',
    text: `現在時刻（${nowHM()}）から残りの予定を計算し直します。次に行く場所を選んでください。それより前は「済み」にします。`,
    options: c.act.map((it, i) => ({ label: `${i + 1}. ${byId[it.id].name}`, value: i }))
  });
  if (k == null) return;
  const before = c.act.slice(0, k);
  let from = before.length ? byId[before[before.length - 1].id] : c.origin;
  from = { id: from.id, name: from.name, lat: from.lat, lng: from.lng, gq: from.gq };
  before.forEach(it => { it.done = true; });
  toast('現在地を確認しています…', 6000);
  const pos = await getPos(6000);
  if (pos) { from = { name: '現在地', lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) }; setUser(pos); }
  day.replan = { time: nowHM(), from };
  save(); renderAll(); queueRoutes();
  toast(pos ? '現在地と現在時刻から組み直しました' : `現在時刻から組み直しました（出発は「${from.name}」）`, 3600);
}
async function sharePlan() {
  const url = shareUrl();
  if (navigator.share) { try { await navigator.share({ title: TRIP.title, url }); return; } catch (e) { /* キャンセル時はコピーへ */ } }
  try { await navigator.clipboard.writeText(url); toast('共有用のリンクをコピーしました'); }
  catch (e) { await ask({ title: '共有用のリンク', text: url, options: [], cancel: '閉じる' }); }
}
function modelCourse() {
  const mk = ids => ids.map(id => ({ id, stay: byId[id].stay, skip: false, done: false }));
  plan.days[0].items = mk(['ueda-castle', 'ueda-museum', 'kusabue', 'taiheiki', 'yanagimachi']);
  plan.days[0].mode = 'transit';
  if (plan.days[1]) { plan.days[1].items = mk(['sanada-museum', 'honjo', 'chokokuji', 'yamaga', 'yumekobo', 'anrakuji', 'kitamuki', 'ishiyu']); plan.days[1].mode = 'drive'; }
  save(); renderAll(); queueRoutes();
  toast('モデルコースを入れました。自由に入れ替えてください', 3600);
}

// ───────── 交通・設定画面 ─────────
function renderInfo() {
  const key = store.get(LS_KEY);
  const status = M.kind === 'google' ? ['is-ok', 'Googleマップで表示中です。']
    : key ? ['is-bad', 'キーは保存されていますが、Googleマップを読み込めていません（簡易地図で表示中）。']
      : ['', 'キーは未設定です（簡易地図で表示中）。'];
  const transitMsg = transitApi === 'ok' ? '公共交通の所要時間をGoogleから取得できています。'
    : transitApi === 'ng' ? '公共交通の所要時間は自動では入りません（日本の乗換はGoogleから取得できないことを2026年11月14日に確認済み）。「Googleマップで乗換を見る」で確認して、分数を入力してください。' : '';
  const credits = SPOTS.filter(s => s.photo).map(s => `<li>${esc(s.name)}：${esc(s.photo.author)}／${esc(s.photo.license)}／<a href="https://commons.wikimedia.org/wiki/File:${enc(s.photo.file)}" target="_blank" rel="noopener">出典</a></li>`).join('');
  $('#infoPage').innerHTML = `
    ${window.TRANSIT_NOTES.map(n => `
      <div class="card">
        <h2>${esc(n.title)}</h2>
        <ul class="info-list">${n.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        ${(n.links && n.links.length) || n.tel ? `<div class="info-links">
          ${(n.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}
          ${(n.tel || []).map(t => `<a href="tel:${esc(t.num)}">${esc(t.label)} ${esc(t.num)}</a>`).join('')}
        </div>` : ''}
      </div>`).join('')}
    <div class="card">
      <h2>計画の保存と共有</h2>
      <p class="muted">計画はこのスマホに自動で保存されます。リンクを自分や同行者に送っておくと、同じ計画を開けます（保存が消えたときの控えにもなります）。</p>
      <div class="btn-row"><button class="btn btn-primary" data-info="share">共有用のリンクを作る</button><button class="btn" data-info="reset">計画を空にする</button></div>
    </div>
    <div class="card">
      <h2>Googleマップのキー</h2>
      <p class="muted">キーを入れると、地図がGoogleマップになり、車の所要時間をGoogleが計算します。キーはこのスマホの中にだけ保存されます。</p>
      <div class="field"><input type="password" id="keyInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="AIza…で始まるキーを貼り付け" aria-label="Googleマップのキー"><button class="btn btn-primary" data-info="saveKey">保存</button></div>
      <div class="status ${status[0]}">${status[1]}</div>
      ${transitMsg ? `<div class="status">${transitMsg}</div>` : ''}
      ${key ? '<button class="btn btn-sm" data-info="delKey" style="margin-top:8px">キーを消す</button>' : ''}
    </div>
    <div class="card">
      <h2>このアプリの情報について</h2>
      <p class="muted">営業時間・料金・交通は2026年11月14日に公式サイト等で調べた内容です。「要確認」と書いた項目は、出発前に電話や公式サイトで確かめてください。移動時間の「概算」は直線距離からの目安です。日没は${TRIP.sunset}ごろとして計算しています。</p>
      <p class="muted" style="margin-top:8px">写真の出典（ウィキメディア・コモンズ）：</p>
      <ul class="credits">${credits}</ul>
    </div>`;
}

// ───────── 画面の切り替えと全体の描画 ─────────
function renderDaySeg() {
  $('#daySeg').innerHTML = TRIP.days.map((d, i) => `<button class="${i === curDay ? 'is-on' : ''}" data-day="${i}" role="tab" aria-selected="${i === curDay}">${d.label}</button>`).join('');
}
function switchView(name) {
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  if (name === 'map' && M.kind === 'leaflet') setTimeout(() => M.map.invalidateSize(), 60);
  if (name !== 'map' && pick) endPick();
}
function renderAll() { renderDaySeg(); renderChips(); renderList(); renderPlan(); drawMap(); if ($('#detail').hidden === false) renderDetailActions($('#detail').dataset.id); }

function fitCurrent() {
  const c = compute(curDay);
  const pts = c.act.length ? c.pts : visibleSpots();
  fitTo(pts);
}

// ───────── イベント ─────────
function bind() {
  $('.tabbar').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) switchView(t.dataset.view); });
  $('#daySeg').addEventListener('click', e => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    curDay = Number(b.dataset.day); renderAll(); fitCurrent(); queueRoutes();
  });
  $('#areaChips').addEventListener('click', e => {
    const b = e.target.closest('[data-area]'); if (!b) return;
    areaFilter = b.dataset.area; renderChips(); renderList(); drawMap(); fitTo(visibleSpots());
  });
  $('#spotList').addEventListener('click', e => { const b = e.target.closest('[data-spot]'); if (b) openDetail(b.dataset.spot); });
  $('#pickCancel').addEventListener('click', () => { endPick(); switchView('plan'); });
  $('#btnLocate').addEventListener('click', async () => {
    toast('現在地を確認しています…');
    const pos = await getPos();
    if (!pos) return toast('現在地を取得できませんでした（位置情報の許可を確認してください）');
    setUser(pos); panTo(pos, 14); toast('現在地を表示しました');
  });

  $('#detail').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeDetail();
    const id = $('#detail').dataset.id;
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-remove]'), play = e.target.closest('[data-play]');
    if (add) { addToDay(id, Number(add.dataset.add)); closeDetail(); }
    else if (rm) { removeFromPlan(id); toast('予定から外しました'); }
    else if (play) {
      const box = play.closest('.d-video');
      box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${enc(play.dataset.play)}?autoplay=1&playsinline=1" title="関連動画" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    }
  });

  const page = $('#planPage');
  page.addEventListener('click', async e => {
    const sp = e.target.closest('[data-spot]'); if (sp) return openDetail(sp.dataset.spot);
    const md = e.target.closest('[data-mode]');
    if (md) { plan.days[curDay].mode = md.dataset.mode; save(); renderAll(); queueRoutes(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const day = plan.days[curDay], act = b.dataset.act, id = b.dataset.id, it = day.items.find(x => x.id === id);
    if (act === 'stay' && it) it.stay = Math.max(5, it.stay + Number(b.dataset.d));
    else if (act === 'up') moveItem(id, -1);
    else if (act === 'down') moveItem(id, 1);
    else if (act === 'skip' && it) it.skip = !it.skip;
    else if (act === 'undone' && it) { it.done = false; }
    else if (act === 'more' && it) {
      const other = TRIP.days.map((d, i) => i).filter(i => i !== curDay);
      const v = await ask({
        title: byId[id].name,
        options: [
          { label: '詳しい情報を見る', value: 'detail' },
          ...other.map(i => ({ label: `${TRIP.days[i].label}へ移す`, value: 'mv' + i })),
          { label: '予定から外す', value: 'rm' }
        ]
      });
      if (!v) return;
      if (v === 'detail') return openDetail(id);
      if (v === 'rm') { removeFromPlan(id); return toast('予定から外しました'); }
      if (v.startsWith('mv')) { const to = Number(v.slice(2)); day.items = day.items.filter(x => x.id !== id); plan.days[to].items.push({ id, stay: it.stay, skip: false, done: false }); toast(`${TRIP.days[to].label}へ移しました`); }
    }
    else if (act === 'pt') return pointDialog(b.dataset.which);
    else if (act === 'goMap') return switchView('map');
    else if (act === 'model') return modelCourse();
    else if (act === 'sort') return sortDay();
    else if (act === 'replan') return replanNow();
    else if (act === 'share') return sharePlan();
    else if (act === 'clearReplan') { day.replan = null; day.items.forEach(x => { x.done = false; }); toast('組み直す前の予定に戻しました'); }
    else return;
    save(); renderAll(); queueRoutes();
  });
  page.addEventListener('change', e => {
    const day = plan.days[curDay], t = e.target;
    if (t.dataset.set) {
      if (t.dataset.set === 'startTime' && !t.value) return renderPlan();
      day[t.dataset.set] = t.value;
      if (t.dataset.set === 'startTime' && day.replan) day.replan = null;
    } else if (t.dataset.leg) {
      const v = t.value.trim();
      if (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) delete day.manual[t.dataset.leg];
      else day.manual[t.dataset.leg] = Math.round(Number(v));
    } else return;
    save(); renderAll(); queueRoutes();
  });

  $('#infoPage').addEventListener('click', async e => {
    const b = e.target.closest('[data-info]'); if (!b) return;
    const act = b.dataset.info;
    if (act === 'share') return sharePlan();
    if (act === 'reset') {
      const v = await ask({ title: '計画を空にしますか？', text: '2日分の予定と設定がすべて消えます。元に戻せません。', options: [{ label: '空にする', value: 'y', primary: true }] });
      if (v === 'y') { plan = newPlan(); save(); renderAll(); toast('計画を空にしました'); }
    }
    if (act === 'saveKey') {
      const v = $('#keyInput').value.trim();
      if (!v) return toast('キーを貼り付けてください');
      store.set(LS_KEY, v); toast('保存しました。地図を読み込み直します'); setTimeout(() => location.reload(), 700);
    }
    if (act === 'delKey') { store.del(LS_KEY); toast('キーを消しました。読み込み直します'); setTimeout(() => location.reload(), 700); }
  });

  window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#dialog').hidden) $('#dialog [data-close]').click(); else if (!$('#detail').hidden) closeDetail(); } });
}

// ───────── 起動 ─────────
async function boot() {
  const fromHash = readHash(), local = readLocal();
  let pendingShared = null;
  if (fromHash && local && hasItems(local) && JSON.stringify(fromHash) !== JSON.stringify(local)) { plan = local; pendingShared = fromHash; }
  else plan = fromHash || local || newPlan();

  bind(); initSheet(); renderDaySeg(); renderChips(); renderList(); renderPlan(); renderInfo();
  await initMap();
  drawMap(); renderInfo(); fitCurrent(); queueRoutes();

  if (pendingShared) {
    const v = await ask({
      title: '共有された計画を開きますか？',
      text: 'リンクに入っている計画が、このスマホに保存されている計画と違います。開くと、いまの計画は置き換わります。',
      options: [{ label: 'リンクの計画を開く', value: 'y', primary: true }, { label: 'いまの計画のままにする', value: 'n' }], cancel: null
    });
    if (v === 'y') plan = pendingShared;
    save(); renderAll(); fitCurrent(); queueRoutes();
  } else if (hasItems(plan)) save();
}
boot();

// 動作確認用（地図の状態を外から見るための入口）
window.__ueda = { map: () => M.map, kind: () => M.kind };

})();
