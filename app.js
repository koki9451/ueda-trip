// 出所: Claude生成（上田・真田観光アプリ 本体）
(() => {
'use strict';

const TRIP = window.TRIP, SPOTS = window.SPOTS, CATS = window.CATS, AREAS = window.AREAS;
const STATIC = Object.fromEntries(SPOTS.map(s => [s.id, s]));
const byId = { ...STATIC }; // 用意したスポット＋自分で追加した場所（syncCustom で登録）
CATS.custom = { name: '追加した場所', color: '#5b4a9e', mark: '追' };
AREAS.custom = { name: '追加した場所', note: '自分で追加した場所です。' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS_PLAN = 'ueda.plan.v1', LS_KEY = 'ueda.gmapkey.v1', LS_BACKUP = 'ueda.plan.backup.v1';
const DRIVE_BUFFER = 10; // 駐車・乗り降りの余裕（分）
const APP_VERSION = 16;  // 公開のたびに上げる（version.json と index.html の ?v= も同じ数字にする）

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
  return { v: 1, custom: [], wish: [], days: TRIP.days.map(() => ({ start: { ...base }, end: null, startTime: '09:00', endBy: '', mode: 'drive', items: [], manual: {}, replan: null })) };
}
function cleanPlan(p) {
  const fresh = newPlan();
  if (!p || !Array.isArray(p.days)) return fresh;
  const okPt = x => x && typeof x.lat === 'number' && typeof x.lng === 'number' && x.name;
  if (Array.isArray(p.custom)) {
    fresh.custom = p.custom
      .filter(c => okPt(c) && typeof c.id === 'string' && /^c[a-z0-9]+$/.test(c.id) && !STATIC[c.id])
      .slice(0, 30)
      .map(c => {
        const o = { id: c.id, name: String(c.name).slice(0, 60), lat: c.lat, lng: c.lng, addr: String(c.addr || '').slice(0, 120), stay: Math.max(5, Number(c.stay) || 30) };
        if (typeof c.pid === 'string' && /^[\w-]{10,300}$/.test(c.pid)) o.pid = c.pid; // Googleの場所ID
        return o;
      });
  }
  const known = { ...STATIC, ...Object.fromEntries(fresh.custom.map(c => [c.id, c])) };
  // 行きたい候補（用意したスポットに付けた★）。自分で追加した場所は、ルートに入っていなければ自動で候補になる
  if (Array.isArray(p.wish)) fresh.wish = [...new Set(p.wish.filter(id => typeof id === 'string' && STATIC[id]))].slice(0, 60);
  fresh.days.forEach((d, i) => {
    const src = p.days[i]; if (!src) return;
    if (okPt(src.start)) d.start = src.start;
    if (okPt(src.end)) d.end = src.end;
    if (/^\d{1,2}:\d{2}$/.test(src.startTime || '')) d.startTime = src.startTime;
    if (/^\d{1,2}:\d{2}$/.test(src.endBy || '')) d.endBy = src.endBy;
    if (src.mode === 'drive' || src.mode === 'transit') d.mode = src.mode;
    if (Array.isArray(src.items)) {
      d.items = src.items.filter(it => it && known[it.id]).map(it => ({ id: it.id, stay: Math.max(5, Number(it.stay) || known[it.id].stay), skip: !!it.skip, done: !!it.done }));
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
// 共有用のリンク（文字列）から計画を取り出す
function planFromText(text) {
  const m = String(text || '').match(/[#&]p=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try { return cleanPlan(decodePlan(m[1])); } catch (e) { return null; }
}
function readHash() { return planFromText(location.hash); }
function readLocal() {
  const raw = store.get(LS_PLAN); if (!raw) return null;
  try { return cleanPlan(JSON.parse(raw)); } catch (e) { return null; }
}
const hasItems = p => p.days.some(d => d.items.length);
const hasContent = p => hasItems(p) || p.custom.length > 0 || p.wish.length > 0;
const samePlan = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function shareUrl() { return `${location.origin}${location.pathname}#p=${encodePlan(plan)}`; }
function save() {
  store.set(LS_PLAN, JSON.stringify(plan));
  try { history.replaceState(null, '', `#p=${encodePlan(plan)}`); } catch (e) { /* file: などでは無視 */ }
}

let plan = newPlan();
let curDay = 0;
let areaFilter = 'all';
let pick = null; // 地図で地点を選ぶモード {di, which}（which が 'add' のときは場所の追加）

// 自分で追加した場所を、用意したスポットと同じ形にして登録する
function customSpot(c) {
  return {
    id: c.id, name: c.name, sub: c.addr || '', area: 'custom', cat: 'custom', lat: c.lat, lng: c.lng, pid: c.pid || '',
    intro: '', points: [], sanada: null, stay: c.stay, outdoor: false, hours: '', fee: '', parking: '',
    transit: { level: 'custom', text: '' }, caution: [], check: [], official: '', photo: null, video: null, custom: true
  };
}
function syncCustom() {
  Object.keys(byId).forEach(k => { if (!STATIC[k]) delete byId[k]; });
  (plan.custom || []).forEach(c => { byId[c.id] = customSpot(c); });
}
const allSpots = () => [...SPOTS, ...(plan.custom || []).map(c => byId[c.id]).filter(Boolean)];
// 行きたい候補：ルートに入っていない「自分で追加した場所」と、★を付けた用意済みスポット
const planIds = () => new Set(plan.days.flatMap(d => d.items.map(it => it.id)));
const isWish = (s, inPlan = planIds()) => !inPlan.has(s.id) && (!!s.custom || (plan.wish || []).includes(s.id));
const WISH_COLOR = '#c28a00';

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
    // 概算：道のり＝直線距離×1.35。4km未満は時速28km、40kmまでは時速38km（市内・郊外の一般道）、
    // 40kmを超える分は時速75km（高速道路を使う想定）。岐阜駅→上田駅でGoogleの計算（3時間53分）に対し約3時間40分になる
    const road = d * 1.35;
    const min = road < 4 ? road / 28 * 60 : Math.min(road, 40) / 38 * 60 + Math.max(0, road - 40) / 75 * 60;
    return { min: Math.max(4, Math.round(min)), src: road > 40 ? 'esthw' : 'est', km: road, buf: DRIVE_BUFFER };
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
    if (s.custom && s.pid) {
      // 自分で追加した場所：Googleから取得した営業時間で確かめる
      const h = dayHours(placeInfo[s.pid], di);
      if (h && !h.always) {
        if (!h.list.length) warns.push('この日は休みの可能性があります（Googleの情報）');
        else if (!h.list.some(([o, c]) => visitStart >= o && t <= c)) warns.push(`営業時間（${hoursText(h)}）の外になります（Googleの情報）`);
      }
    }
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
// Googleの場所IDがある場所は、名前＋IDで渡す（その場所そのものが開く）
const qOf = p => p.pid ? p.name : gPlace(p);
const pidQ = (k, p) => p.pid ? `&${k}_place_id=${enc(p.pid)}` : '';
const dirUrl = (a, b, mode, src) => `https://www.google.com/maps/dir/?api=1&origin=${enc(qOf(a))}${pidQ('origin', a)}&destination=${enc(qOf(b))}${pidQ('destination', b)}&travelmode=${tmode(mode, src)}`;
const navUrl = (b, mode) => `https://www.google.com/maps/dir/?api=1&destination=${enc(qOf(b))}${pidQ('destination', b)}&travelmode=${tmode(mode)}`;
const placeUrl = p => `https://www.google.com/maps/search/?api=1&query=${enc(qOf(p))}${pidQ('query', p)}`;
// ── iPhone向け：Googleマップのアプリを直接開くためのアドレス（ウェブのリンク経由だとApp Storeへ飛ばされることがあるため）
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// アプリに渡す場所の書き方：用意したスポットは名前＋地域、場所IDつきは名前＋住所、それ以外は座標
const appQ = p => p.gq ? gPlace(p) : (p.pid && (p.sub || p.addr)) ? `${p.name} ${p.sub || p.addr}` : `${p.lat},${p.lng}`;
const appDir = (a, b, mode, src) => `comgooglemaps://?saddr=${a ? enc(appQ(a)) : ''}&daddr=${enc(appQ(b))}&directionsmode=${tmode(mode, src)}`;
const appPlace = p => `comgooglemaps://?q=${enc(appQ(p))}&center=${p.lat},${p.lng}`;
const appRoute = pts => `comgooglemaps://?saddr=${enc(appQ(pts[0]))}&daddr=${[...pts.slice(1, -1).slice(0, 9), pts[pts.length - 1]].map(p => enc(appQ(p))).join('+to:')}&directionsmode=driving`;
// Googleマップのアプリが無いときの代わり：iPhone標準の「マップ」
const amode = (mode, src) => src === 'walk' ? 'w' : (mode === 'drive' ? 'd' : 'r');
const appleDir = (a, b, mode, src) => `https://maps.apple.com/?${a ? `saddr=${a.lat},${a.lng}&` : ''}daddr=${b.lat},${b.lng}&dirflg=${amode(mode, src)}`;
const applePlace = p => `https://maps.apple.com/?q=${enc(p.name)}&ll=${p.lat},${p.lng}`;
const linkAttrs = (app, apple) => ` data-app="${esc(app)}"${apple ? ` data-apple="${esc(apple)}"` : ''}`;
let openUrl = u => { window.location.href = u; };

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
          center: TRIP.center, zoom: 12, disableDefaultUI: true, gestureHandling: 'greedy'
        });
        M.map.addListener('click', e => {
          const lat = e.latLng.lat(), lng = e.latLng.lng();
          // お店などのアイコンをタップしたときは、その場所そのものを扱う（Google標準の吹き出しは出さない）
          if (e.placeId) { e.stop(); onPoiClick(e.placeId, lat, lng); } else onMapClick(lat, lng);
        });
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
  const inPlan = planIds();
  return allSpots().filter(s => areaFilter === 'all' ? true
    : areaFilter === 'plan' ? inPlan.has(s.id)
      : areaFilter === 'wish' ? isWish(s, inPlan)
        : s.area === areaFilter);
}
function drawMap() {
  if (!M.kind) return;
  clearMap();
  const c = compute(curDay);
  const order = new Map(); c.act.forEach((it, i) => order.set(it.id, i + 1));
  const inPlan = planIds();
  visibleSpots().forEach(s => {
    const n = order.get(s.id), wish = !n && isWish(s, inPlan);
    // ルートに入っていれば番号、行きたい候補は金色の★、それ以外は種類の印
    addMarker({ lat: s.lat, lng: s.lng, text: n || (wish ? '★' : CATS[s.cat].mark), color: wish ? WISH_COLOR : CATS[s.cat].color, big: !!n, title: s.name, onClick: () => openDetail(s.id) });
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
  if (pick.which === 'add') { endPick(); addByTap(Number(lat.toFixed(6)), Number(lng.toFixed(6))); return; }
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

// ───────── 場所の追加（自分で足すスポット） ─────────
function askText({ title, text, placeholder = '', value = '' }) {
  return ask({
    title, text, options: [], cancel: 'やめる',
    onOpen: (box, done) => {
      box.innerHTML = `<div class="field" style="margin:0 0 12px"><input type="text" id="dlgText" maxlength="60" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(title)}"><button class="btn btn-primary" id="dlgOk">決定</button></div>`;
      const inp = $('#dlgText', box);
      const ok = () => { const v = inp.value.trim(); if (v) done(v); else inp.focus(); };
      $('#dlgOk', box).addEventListener('click', ok);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      setTimeout(() => inp.focus(), 60);
    }
  });
}
async function addPlaceDialog() {
  const v = await ask({
    title: '場所を追加',
    text: M.kind === 'google' ? 'お店やホテルの名前で検索するか、地図をタップして追加できます。' : '地図をタップして追加できます（Googleマップのキーを入れると、名前で検索できます）。',
    options: [{ label: '地図をタップして追加', value: { t: 'pick' } }],
    onOpen: (box, done) => { if (M.kind === 'google') mountPlaceSearch(box, done); }
  });
  if (!v) return;
  if (v.t === 'place') return addCustom({ name: v.p.name, lat: v.p.lat, lng: v.p.lng, addr: v.p.addr, pid: v.p.pid, stay: stayByTypes(v.p.types) });
  if (v.t === 'pick') {
    pick = { which: 'add' };
    $('#pickText').textContent = M.kind === 'google' ? 'お店などのアイコンか、追加したい場所をタップしてください' : '追加したい場所を地図でタップしてください';
    $('#pickBar').hidden = false; setSheet('peek'); switchView('map');
  }
}
// 追加する場所の行き先を選ぶ：どちらかの日のルートに入れるか、ルートに入れない「行きたい候補」にするか
function chooseDest(name, hint) {
  return ask({
    title: `「${name}」をどこに入れますか？`, text: hint || '',
    options: [
      ...TRIP.days.map((d, i) => ({ label: `${d.label}（${d.wd}）のルートに入れる`, value: i, primary: i === curDay })),
      { label: '★ 行きたい候補にする（ルートには入れない）', value: 'wish' }
    ]
  });
}
async function addCustom({ name, lat, lng, addr = '', pid = '', stay = 30, hint = '' }) {
  const dup = pid && (plan.custom || []).find(c => c.pid === pid);
  if (dup) { openDetail(dup.id); return toast('この場所はすでに追加されています'); }
  if ((plan.custom || []).length >= 30) return toast('追加できるのは30か所までです');
  const dest = await chooseDest(name, hint);
  if (dest == null) return;
  const c = { id: 'c' + Date.now().toString(36), name: String(name).slice(0, 60), lat, lng, addr: String(addr || '').slice(0, 120), stay };
  if (pid) c.pid = pid;
  plan.custom = [...(plan.custom || []), c];
  if (dest !== 'wish') { plan.days[dest].items.push({ id: c.id, stay: c.stay, skip: false, done: false }); curDay = dest; }
  syncCustom(); save(); renderAll(); queueRoutes();
  openDetail(c.id);
  toast(dest === 'wish' ? `「${c.name}」を行きたい候補にしました（地図に★が付きます）` : `「${c.name}」を${TRIP.days[dest].label}のルートに入れました`, 3600);
}
// 地図上のお店などのアイコンをタップしたとき
async function onPoiClick(pid, lat, lng) {
  if (pick && pick.which !== 'add') {
    // 出発・帰着地点を選んでいる最中：その場所の名前で設定する
    const { di, which } = pick; endPick();
    const info = await loadPlaceInfo(pid);
    const ok = info && !info.failed && info.lat != null;
    const pt = { name: (ok && info.name) || '地図で選んだ地点', lat: Number((ok ? info.lat : lat).toFixed(6)), lng: Number((ok ? info.lng : lng).toFixed(6)) };
    if (ok) pt.pid = pid;
    const day = plan.days[di];
    if (which === 'start') day.start = pt; else day.end = pt;
    save(); renderAll(); switchView('plan'); queueRoutes();
    return toast(`${pick_label(which)}を「${pt.name}」にしました`);
  }
  if (pick) endPick();
  toast('場所の情報を取得しています…');
  const info = await loadPlaceInfo(pid);
  if (!info || info.failed || !info.name) return addByTap(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
  addCustom({
    name: info.name, lat: Number((info.lat ?? lat).toFixed(6)), lng: Number((info.lng ?? lng).toFixed(6)), addr: info.addr, pid,
    stay: stayByTypes(info.types), hint: [info.typeName, info.addr].filter(Boolean).join('／')
  });
}
// 地図の何もない所をタップしたとき：近くの場所の候補を出す（取れなければ名前を手入力）
async function addByTap(lat, lng) {
  if (M.kind === 'google') {
    toast('近くの場所を探しています…');
    const cands = await nearbyPlaces(lat, lng);
    if (cands.length) {
      const v = await ask({
        title: '近くの場所から選ぶ',
        text: 'タップした地点の近くにある場所です。選ぶと、営業時間などの情報も自動で入ります。',
        options: [...cands.map((c, i) => ({ label: `${c.name}${c.typeName ? `（${c.typeName}）` : ''}`, value: i })), { label: 'どれでもない（名前を自分で入れる）', value: -1 }]
      });
      if (v == null) return;
      if (v >= 0) { const c = cands[v]; return addCustom({ name: c.name, lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)), addr: c.addr, pid: c.pid, stay: stayByTypes(c.types) }); }
    }
  }
  // キーが無いときは、無料の地図データ（OpenStreetMap）から近くの名前だけ取って入れておく
  let guess = '';
  if (M.kind !== 'google') {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`);
      guess = String((await r.json()).name || '').slice(0, 60);
    } catch (e) { /* 取れなければ空欄のまま */ }
  }
  const name = await askText({
    title: '場所の名前', value: guess, placeholder: '例：泊まるホテル、気になるカフェ',
    text: guess ? '近くの場所の名前を入れてあります。違う場合は書き換えてください。' : '追加する場所の名前を入れてください。'
  });
  if (name) addCustom({ name, lat, lng });
}
// Googleの情報がひも付いていない場所：近くの場所を探し、名前が合えば自動でひも付ける。合わなければ候補を出す
const nearCache = {};
const customOf = id => (plan.custom || []).find(x => x.id === id);
function linkPlace(id, pid, addr) {
  const c = customOf(id); if (!c) return;
  c.pid = pid; if (!c.addr && addr) c.addr = String(addr).slice(0, 120);
  syncCustom(); save(); renderAll(); queueRoutes();
  if (!$('#detail').hidden && $('#detail').dataset.id === id) openDetail(id);
}
async function autoLink(id) {
  const c = customOf(id); if (!c || c.pid || M.kind !== 'google') return;
  const cands = nearCache[id] || (nearCache[id] = await nearbyPlaces(c.lat, c.lng));
  const norm = x => String(x).replace(/[\s　・（）()「」『』]/g, '').toLowerCase();
  const me = norm(c.name);
  const hit = me.length >= 2 && cands.find(x => { const a = norm(x.name); return a && (a.includes(me) || me.includes(a)); });
  if (hit) return linkPlace(id, hit.pid, hit.addr);
  const box = $('#gInfo');
  if (!box || $('#detail').hidden || $('#detail').dataset.id !== id) return;
  box.innerHTML = cands.length
    ? `<p class="muted" style="margin:0 0 8px">近くにある場所です。同じ場所を選ぶと、営業時間などの情報が自動で入ります。</p>
       <div class="dlg-list" style="margin:0">${cands.map(x => `<button class="btn btn-sm" data-linkpid="${esc(x.pid)}" data-linkaddr="${esc(x.addr)}">${esc(x.name)}${x.typeName ? `（${esc(x.typeName)}）` : ''}</button>`).join('')}</div>`
    : '<p class="muted">近くに、Googleマップに登録された場所が見つかりませんでした。</p>';
}
function deleteCustom(id) {
  plan.custom = (plan.custom || []).filter(c => c.id !== id);
  plan.days.forEach(d => { d.items = d.items.filter(it => it.id !== id); });
  if (areaFilter === 'custom' && !plan.custom.length) areaFilter = 'all';
  syncCustom(); save(); closeDetail(); renderAll(); queueRoutes();
  toast('場所を削除しました');
}

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
function queueRoutes() { clearTimeout(routeTimer); routeTimer = setTimeout(() => refreshRoutes(curDay), 700); ensurePlanInfo(); }

// ───────── Googleの場所情報（自分で追加した場所の営業時間など） ─────────
// 取得した内容はこのページを開いている間だけ持ち、保存しない（保存するのは場所のIDだけ）
const placeInfo = {}, placeBusy = {};
const P_FULL = ['displayName', 'formattedAddress', 'location', 'types', 'primaryTypeDisplayName', 'regularOpeningHours', 'nationalPhoneNumber', 'websiteURI', 'googleMapsURI', 'rating', 'userRatingCount', 'editorialSummary', 'photos'];
const P_MID = ['displayName', 'formattedAddress', 'location', 'types', 'primaryTypeDisplayName', 'regularOpeningHours', 'nationalPhoneNumber', 'websiteURI', 'googleMapsURI'];
const P_MIN = ['displayName', 'formattedAddress', 'location'];

function readPlace(place) {
  const loc = place.location, oh = place.regularOpeningHours;
  let photo = null;
  try {
    const ph = place.photos && place.photos[0];
    if (ph) photo = { url: ph.getURI({ maxWidth: 800 }), by: (ph.authorAttributions || []).map(a => a.displayName).filter(Boolean).join('、') };
  } catch (e) { /* 写真が使えないキーでは無視 */ }
  return {
    name: place.displayName || '', addr: place.formattedAddress || '',
    lat: loc ? loc.lat() : null, lng: loc ? loc.lng() : null,
    types: place.types || [], typeName: place.primaryTypeDisplayName || '',
    periods: oh && oh.periods ? oh.periods.map(p => ({ od: p.open.day, o: p.open.hour * 60 + p.open.minute, cd: p.close ? p.close.day : null, c: p.close ? p.close.hour * 60 + p.close.minute : null })) : null,
    tel: place.nationalPhoneNumber || '', site: place.websiteURI || '', gmap: place.googleMapsURI || '',
    rating: place.rating || null, ratingN: place.userRatingCount || null, summary: place.editorialSummary || '', photo
  };
}
async function loadPlaceInfo(pid) {
  if (M.kind !== 'google' || !pid) return null;
  if (placeInfo[pid]) return placeInfo[pid];
  if (placeBusy[pid]) return placeBusy[pid];
  placeBusy[pid] = (async () => {
    try {
      const { Place } = await google.maps.importLibrary('places');
      // 取れない項目があるキーでは、項目を減らして取り直す
      for (const fields of [P_FULL, P_MID, P_MIN]) {
        try {
          const place = new Place({ id: pid, requestedLanguage: 'ja' });
          await place.fetchFields({ fields });
          return (placeInfo[pid] = readPlace(place));
        } catch (e) { /* 次の項目セットへ */ }
      }
    } catch (e) { /* 部品を読み込めない */ }
    return (placeInfo[pid] = { failed: true });
  })();
  const r = await placeBusy[pid]; delete placeBusy[pid];
  return r;
}
// その日の営業時間：null=情報なし / {always} / {list:[[開く,閉まる]…]}（分。日またぎは24時を超える値）
function dayHours(info, di) {
  if (!info || info.failed || !info.periods) return null;
  if (info.periods.length === 1 && info.periods[0].c == null) return { always: true };
  const wd = new Date(`${TRIP.days[di].date}T12:00:00+09:00`).getUTCDay();
  return { list: info.periods.filter(p => p.od === wd).map(p => [p.o, p.c == null ? p.o + 1440 : (p.cd !== p.od ? p.c + 1440 : p.c)]) };
}
const hoursText = h => !h ? '情報なし' : h.always ? '24時間営業' : (h.list.length ? h.list.map(([o, c]) => `${fmt(o)}〜${fmt(c)}`).join('／') : '休み');
function stayByTypes(types) {
  const t = types || [], has = x => t.includes(x), ends = x => t.some(y => y.endsWith(x));
  if (has('lodging') || has('hotel')) return 15; // 宿は立ち寄り（荷物・チェックイン）の目安
  if (has('restaurant') || has('food') || ends('_restaurant')) return 60;
  if (has('cafe') || has('coffee_shop') || has('bakery')) return 40;
  if (has('museum') || has('art_gallery') || has('tourist_attraction') || has('park')) return 45;
  if (has('store') || ends('_store')) return 20;
  return 30;
}
async function nearbyPlaces(lat, lng) {
  try {
    const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary('places');
    const { places } = await Place.searchNearby({
      fields: ['displayName', 'formattedAddress', 'location', 'types', 'primaryTypeDisplayName'],
      locationRestriction: { center: { lat, lng }, radius: 80 }, maxResultCount: 4,
      rankPreference: SearchNearbyRankPreference.DISTANCE, language: 'ja', region: 'jp'
    });
    return (places || []).filter(p => p.location).map(p => ({ pid: p.id, name: p.displayName || '', addr: p.formattedAddress || '', lat: p.location.lat(), lng: p.location.lng(), types: p.types || [], typeName: p.primaryTypeDisplayName || '' }));
  } catch (e) { return []; }
}
// 予定に入っている「追加した場所」の営業時間を取り、スケジュールの注意に反映する
function ensurePlanInfo() {
  if (M.kind !== 'google') return;
  const ids = new Set(plan.days.flatMap(d => d.items.map(it => it.id)));
  (plan.custom || []).filter(c => c.pid && ids.has(c.id) && !placeInfo[c.pid] && !placeBusy[c.pid])
    .forEach(c => { loadPlaceInfo(c.pid).then(() => { renderPlan(); }); });
}
function placeInfoHtml(info) {
  if (!info || info.failed) return '<p class="muted">Googleの情報を取得できませんでした。「Googleマップで開く」で確認してください。</p>';
  const rows = [
    info.typeName ? ['種類', esc(info.typeName)] : null,
    info.rating ? ['評価', `★ ${esc(info.rating)}${info.ratingN ? `（${esc(info.ratingN)}件）` : ''}`] : null,
    ...TRIP.days.map((d, i) => [`${d.label}（${d.wd}）`, esc(hoursText(dayHours(info, i)))]),
    info.tel ? ['電話', `<a href="tel:${esc(info.tel)}">${esc(info.tel)}</a>`] : null,
    info.site ? ['サイト', `<a href="${esc(info.site)}" target="_blank" rel="noopener">公式サイトを開く</a>`] : null
  ].filter(Boolean);
  return `
    ${info.photo ? `<div class="d-photo" style="border-radius:10px;margin-bottom:10px"><img src="${esc(info.photo.url)}" alt="" loading="lazy" onerror="this.closest('.d-photo').remove()"><span class="d-credit">写真：${esc(info.photo.by || '投稿者')}／Google</span></div>` : ''}
    ${info.summary ? `<p style="margin:0 0 8px">${esc(info.summary)}</p>` : ''}
    <dl class="d-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p class="muted" style="margin:8px 0 0">情報：Google（いま取得した内容です。営業時間は通常の曜日のもので、祝日は異なる場合があります）</p>`;
}

// ───────── 一覧（地図タブ） ─────────
const TRANSIT_TAG = { good: ['tag-good', '公共交通で行きやすい'], few: ['tag-few', '本数少ない'], car: ['tag-car', '車・タクシー向き'], custom: ['tag-plain', '自分で追加'] };
function dayOf(id) { return plan.days.findIndex(d => d.items.some(it => it.id === id)); }

function renderChips() {
  const chips = [['all', 'すべて'], ...Object.entries(AREAS).filter(([k]) => k !== 'custom' || (plan.custom || []).length).map(([k, v]) => [k, v.name]), ['wish', '★ 候補'], ['plan', 'ルートに入れた']];
  $('#areaChips').innerHTML = chips.map(([k, n]) => `<button class="chip ${areaFilter === k ? 'is-on' : ''}" data-area="${k}">${esc(n)}</button>`).join('');
}
function renderList() {
  const list = visibleSpots();
  $('#listCount').textContent = `${list.length}件`;
  $('#listTitle').textContent = areaFilter === 'all' ? 'スポット' : areaFilter === 'plan' ? 'ルートに入れたスポット' : areaFilter === 'wish' ? '★ 行きたい候補' : AREAS[areaFilter].name;
  const inPlan = planIds();
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
        ${d >= 0 ? `<span class="spot-in">${TRIP.days[d].label}</span>` : (isWish(s, inPlan) ? '<span class="spot-in is-wish">★ 候補</span>' : '')}
      </button>`;
    }).join('')}`).join('') : `<div class="empty"><p>${areaFilter === 'wish'
      ? '行きたい候補はまだありません。<br>場所を追加するときに「★ 行きたい候補にする」を選ぶか、スポットの詳細で「☆ 行きたい候補にする」を押すと、ここに並びます。'
      : 'まだルートに入れたスポットがありません。'}</p></div>`;
  $('#spotList').insertAdjacentHTML('beforeend', '<button class="btn btn-block" data-addplace style="margin:14px 0 4px">＋ 場所を追加（お店・ホテルなど）</button>');
}

// シートの開閉（タップで3段階、ドラッグにも対応）
const SHEET_STATES = ['peek', 'half', 'full'];
let sheetState = 'half';
function setSheet(st) {
  sheetState = st; const el = $('#listSheet');
  SHEET_STATES.forEach(s => el.classList.toggle('is-' + s, s === st));
  el.style.height = '';
}
function initSheet() {
  const el = $('#listSheet'), handle = $('#listHandle');
  let startY = 0, startH = 0, moved = false, H = 0;
  // 高さの割合は style.css の .sheet.is-half / .is-full と同じにする
  const heightOf = st => st === 'full' ? H * 0.82 : (st === 'half' ? H * 0.44 : 62);
  handle.addEventListener('click', () => { if (!moved) setSheet(SHEET_STATES[(SHEET_STATES.indexOf(sheetState) + 1) % 3]); });
  handle.addEventListener('touchstart', e => {
    H = el.parentElement.clientHeight; startY = e.touches[0].clientY; startH = el.offsetHeight; moved = false; el.classList.add('is-drag');
  }, { passive: true });
  handle.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY; if (Math.abs(dy) > 6) moved = true;
    el.style.height = Math.min(H * 0.82, Math.max(62, startH - dy)) + 'px';
  }, { passive: true });
  const endDrag = () => {
    el.classList.remove('is-drag');
    if (!moved) { el.style.height = ''; return; }
    const cur = el.offsetHeight;
    const best = SHEET_STATES.reduce((a, b) => Math.abs(heightOf(a) - cur) < Math.abs(heightOf(b) - cur) ? a : b);
    setSheet(best); setTimeout(() => { moved = false; }, 50);
  };
  handle.addEventListener('touchend', endDrag);
  handle.addEventListener('touchcancel', endDrag);

  // iPhone対策：一覧がいちばん上（下）にあるときに指を動かすと、画面全体のほうが引っぱられ、
  // しばらく一覧がスクロールできなくなる。触れた瞬間に1pxだけ内側へ寄せて、それを防ぐ。
  document.addEventListener('touchstart', e => {
    const sc = e.target.closest && e.target.closest('.sheet-body, .page, .modal-body');
    if (!sc) return;
    const max = sc.scrollHeight - sc.clientHeight;
    if (max <= 1) return;
    if (sc.scrollTop <= 0) sc.scrollTop = 1;
    else if (sc.scrollTop >= max) sc.scrollTop = max - 1;
  }, { passive: true });
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
  const facts = (s.custom ? [
    ['滞在の目安', `${dur(s.stay)}（スケジュールで変えられます）`],
    s.sub ? ['住所', s.sub] : null
  ] : [
    ['滞在の目安', dur(s.stay)],
    ['時間', s.hours],
    s.fee ? ['料金', s.fee] : null,
    ['駐車場', s.parking],
    ['公共交通', `<span class="tag ${tg[0]}">${tg[1]}</span><br>${esc(s.transit.text)}`],
    s.tel ? ['電話', `<a href="tel:${esc(s.tel)}">${esc(s.tel)}</a>${s.telLabel ? `（${esc(s.telLabel)}）` : ''}`] : null
  ]).filter(Boolean);
  const noKeyMsg = '<div class="d-note is-warn">このスマホにはGoogleマップのキーが入っていない（または読み込めていない）ため、営業時間などの情報を自動で取得できません。「交通・設定」でキーを入れると、ここに表示されます。</div>';
  const gInfoInit = !s.custom ? '' : M.kind !== 'google' ? noKeyMsg
    : s.pid ? '<p class="muted">Googleの情報を読み込んでいます…</p>' : '<p class="muted">近くの場所を探しています…</p>';
  $('#detailBody').innerHTML = `
    ${photo}
    <div class="d-inner">
      <span class="d-cat" style="background:${cat.color}">${cat.name}</span>
      <span class="muted">　${esc(AREAS[s.area].name)}</span>
      <h2 class="d-name" id="detailName">${esc(s.name)}</h2>
      <div id="wishRow" class="wish-row"></div>
      ${s.sub && !s.custom ? `<div class="d-sub">${esc(s.sub)}</div>` : ''}
      <p class="d-intro">${s.custom ? '自分で追加した場所です。' : esc(s.intro)}</p>
      ${s.points.length ? `<div class="d-h">おすすめポイント</div>
      <ol class="d-points">${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
      ${s.sanada ? `<div class="d-h">真田との関わり</div>
        <div class="d-sanada"><span class="tag tag-plain">${esc(s.sanada.type)}</span> ${esc(s.sanada.text)}</div>` : ''}
      <div class="d-h">${s.custom ? '基本情報' : '基本情報（11/22・23）'}</div>
      <dl class="d-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${k === '公共交通' || k === '電話' ? v : esc(v)}</dd>`).join('')}</dl>
      ${s.custom ? `<div class="d-h">Googleの情報</div><div id="gInfo">${gInfoInit}</div>` : ''}
      ${s.caution && s.caution.length ? `<div class="d-note is-warn"><ul>${s.caution.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${s.check && s.check.length ? `<div class="d-note is-check"><b>要確認</b><ul>${s.check.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${video}
      <div class="d-h">リンク</div>
      <div class="btn-row">
        <a class="btn btn-sm" href="${placeUrl(s)}" target="_blank" rel="noopener"${linkAttrs(appPlace(s), applePlace(s))}>Googleマップで開く</a>
        ${s.official ? `<a class="btn btn-sm" href="${esc(s.official)}" target="_blank" rel="noopener">公式サイト</a>` : ''}
        ${s.custom ? '<button class="btn btn-sm" data-delplace>この場所を削除</button>' : ''}
      </div>
    </div>
    <div class="d-actions"><div class="btn-row" id="detailActions"></div></div>`;
  renderDetailActions(id);
  $('#detail').hidden = false;
  $('#detail').dataset.id = id;
  panTo(s, 13);
  if (s.custom && s.pid && M.kind === 'google') {
    loadPlaceInfo(s.pid).then(info => {
      const box = $('#gInfo');
      if (box && !$('#detail').hidden && $('#detail').dataset.id === id) box.innerHTML = placeInfoHtml(info);
      renderPlan(); // 営業時間の注意に反映
    });
  }
  if (s.custom && !s.pid && M.kind === 'google') autoLink(id);
}
function renderDetailActions(id) {
  const d = dayOf(id), s = byId[id];
  if (!s) return;
  $('#detailActions').innerHTML = TRIP.days.map((day, i) => i === d
    ? `<button class="btn" data-remove="${i}">${day.label}から外す</button>`
    : `<button class="btn btn-primary" data-add="${i}">${day.label}に${d >= 0 ? '移す' : '追加'}</button>`).join('');
  // いまの扱い（ルートに入っている／行きたい候補／どちらでもない）
  const row = $('#wishRow'); if (!row) return;
  if (d >= 0) row.innerHTML = `<span class="tag tag-good">${TRIP.days[d].label}のルートに入っています</span>`;
  else if (s.custom) row.innerHTML = '<span class="tag tag-wish">★ 行きたい候補</span> <span class="muted">ルートには入っていません。地図に★で表示されます。</span>';
  else if ((plan.wish || []).includes(id)) row.innerHTML = '<button class="btn btn-sm is-wish" data-wish>★ 行きたい候補（タップで外す）</button>';
  else row.innerHTML = '<button class="btn btn-sm" data-wish>☆ 行きたい候補にする</button>';
}
function addToDay(id, di) {
  plan.days.forEach(d => { d.items = d.items.filter(it => it.id !== id); });
  plan.days[di].items.push({ id, stay: byId[id].stay, skip: false, done: false });
  plan.wish = (plan.wish || []).filter(x => x !== id); // ルートに入れたら候補の★は外す
  curDay = di; save(); renderAll(); queueRoutes();
  toast(`${TRIP.days[di].label}のルートに入れました`);
}
function toggleWish(id) {
  const on = (plan.wish || []).includes(id);
  plan.wish = on ? plan.wish.filter(x => x !== id) : [...(plan.wish || []), id];
  save(); renderAll();
  toast(on ? '行きたい候補から外しました' : '行きたい候補にしました（地図に★が付きます）');
}
function removeFromPlan(id) {
  plan.days.forEach(d => { d.items = d.items.filter(it => it.id !== id); });
  save(); renderAll(); queueRoutes();
}
function closeDetail() { $('#detail').hidden = true; $('#detailBody').innerHTML = ''; }

// ───────── スケジュール画面 ─────────
const SRC_LABEL = { walk: '徒歩・概算', est: '概算', esthw: '概算（高速道路を使う想定）', google: 'Googleの計算', gtransit: 'Googleの乗換', manual: '手入力', none: '' };

function legHtml(day, x, isEnd) {
  const { leg, from } = x, to = isEnd ? x.to : x.s;
  const isWalk = leg.src === 'walk';
  const icon = isWalk ? '徒歩' : (day.mode === 'drive' ? '車' : '電車・バス');
  let main;
  if (leg.min == null) main = `<span class="is-missing">移動時間が未入力</span>`;
  else main = `<b>${icon} ${dur(leg.min)}</b>${leg.buf ? `<span>＋駐車など${leg.buf}分</span>` : ''}<span class="leg-src">${SRC_LABEL[leg.src]}</span>`;
  const input = (day.mode === 'transit' && !isWalk) || leg.src === 'manual'
    ? `<label>分数 <input type="number" inputmode="numeric" min="0" max="600" data-leg="${esc(leg.key)}" value="${leg.src === 'manual' ? leg.min : ''}" placeholder="${leg.min != null && leg.src !== 'manual' ? leg.min : ''}" aria-label="移動時間（分）"></label>` : '';
  const hint = day.mode === 'transit' && !isWalk && !isEnd && to.transit && to.transit.text ? `<div class="leg-hint">行き方：${esc(to.transit.text)}</div>` : '';
  const hintEnd = day.mode === 'transit' && !isWalk && isEnd && from.transit && from.transit.text ? `<div class="leg-hint">帰り：${esc(from.transit.text)}</div>` : '';
  return `<li class="tl-leg">
    <div class="tl-leg-l"></div><div class="tl-leg-bar"></div>
    <div class="tl-leg-c">
      ${main}${input}
      <a class="btn btn-sm" href="${dirUrl(from, to, day.mode, leg.src)}" target="_blank" rel="noopener"${linkAttrs(appDir(from, to, day.mode, leg.src), appleDir(from, to, day.mode, leg.src))}>${day.mode === 'transit' && !isWalk ? 'Googleマップで乗換を見る' : 'Googleマップで行き方'}</a>
      ${hint}${hintEnd}
    </div>
  </li>`;
}

// スケジュール画面の下に出す「行きたい候補」。その日のルートへすぐ入れられる
function wishCardHtml() {
  const inPlan = planIds(), list = allSpots().filter(s => isWish(s, inPlan));
  if (!list.length) return '';
  return `<div class="card">
    <h2>★ 行きたい候補（ルートに入れていない場所）</h2>
    ${list.map(s => `<div class="wish-item">
      <button class="tl-title" data-spot="${s.id}">${esc(s.name)}<small>${esc(AREAS[s.area].name)}・目安 ${dur(s.stay)}</small></button>
      <button class="btn btn-sm" data-act="addWish" data-id="${s.id}">${TRIP.days[curDay].label}に入れる</button>
    </div>`).join('')}
  </div>`;
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
      </div>` + wishCardHtml();
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
          <a class="btn btn-sm" href="${navUrl(s, day.mode)}" target="_blank" rel="noopener"${linkAttrs(appDir(null, s, day.mode), appleDir(null, s, day.mode))}>ナビ</a></div>
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
        ${day.mode === 'drive' && c.pts.length >= 2 ? `<a class="btn" href="${routeUrl(c.pts)}" target="_blank" rel="noopener"${linkAttrs(appRoute(c.pts))}>ルート全体をGoogleマップで開く</a>` : ''}
        <button class="btn" data-act="share">この計画を共有</button>
        <button class="btn" data-act="receive">計画を受け取る</button>
      </div>
      <p class="muted" style="margin:10px 0 0">変更は自動で保存されます（保存ボタンはありません）。</p>
    </div>`;

  $('#planPage').innerHTML = settings + summary + alerts.join('') + `<ol class="tl">${tl}</ol>` + actions + wishCardHtml();
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
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types'] });
        const loc = place.location;
        done({ t: 'place', p: { name: place.displayName || '検索した場所', lat: Number(loc.lat().toFixed(6)), lng: Number(loc.lng().toFixed(6)), addr: place.formattedAddress || '', pid: place.id || '', types: place.types || [] } });
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

// ───────── 計画の受け取り（置き換える／相手の追加分だけ取り込む） ─────────
// 相手の計画にあって、こちらに無い場所だけを足す。こちらの時刻・順番・済みの印は変えない。相手が消した場所も消さない
function mergePlan(mine, theirs) {
  const out = JSON.parse(JSON.stringify(mine));
  const map = {};        // 相手の「追加した場所」のID → こちらのID
  const newCustom = [];
  theirs.custom.forEach(c => {
    const same = out.custom.find(x => x.id === c.id || (c.pid && x.pid === c.pid) || (x.name === c.name && hav(x, c) < 0.05));
    if (same) { map[c.id] = same.id; return; }
    if (out.custom.length >= 30) return; // 追加できる場所の上限
    out.custom.push({ ...c }); map[c.id] = c.id; newCustom.push(c.id);
  });
  const idOf = id => (STATIC[id] ? id : map[id]);
  const inRoute = new Set(out.days.flatMap(d => d.items.map(it => it.id)));
  let items = 0;
  theirs.days.forEach((td, i) => {
    const od = out.days[i]; if (!od) return;
    const ids = td.items.map(it => idOf(it.id));
    let prev = null; // 相手の並びで直前にあり、こちらのこの日にもある場所
    td.items.forEach((it, k) => {
      const id = ids[k]; if (!id) return;
      if (inRoute.has(id)) { if (od.items.some(x => x.id === id)) prev = id; return; }
      let at = od.items.length;
      if (prev) at = od.items.findIndex(x => x.id === prev) + 1;
      else {
        const next = ids.slice(k + 1).find(n => n && od.items.some(x => x.id === n));
        if (next) at = od.items.findIndex(x => x.id === next);
      }
      od.items.splice(at, 0, { id, stay: it.stay, skip: false, done: false });
      inRoute.add(id); prev = id; items++;
    });
    Object.entries(td.manual).forEach(([k, v]) => { if (!(k in od.manual)) od.manual[k] = v; });
  });
  let cand = newCustom.filter(id => !inRoute.has(id)).length;
  theirs.wish.forEach(id => { if (!out.wish.includes(id)) { out.wish.push(id); if (!inRoute.has(id)) cand++; } });
  return { plan: cleanPlan(out), items, cand };
}
function planSummary(p) {
  const inRoute = new Set(p.days.flatMap(d => d.items.map(it => it.id)));
  const cand = p.custom.filter(c => !inRoute.has(c.id)).length + p.wish.filter(id => !inRoute.has(id)).length;
  return `${p.days.map((d, i) => `${TRIP.days[i].label} ${d.items.length}か所`).join('・')}・候補 ${cand}か所`;
}
function readBackup() {
  try { const o = JSON.parse(store.get(LS_BACKUP)); return o && o.plan ? { t: Number(o.t) || 0, plan: cleanPlan(o.plan) } : null; } catch (e) { return null; }
}
function applyPlan(next, msg) {
  store.set(LS_BACKUP, JSON.stringify({ t: Date.now(), plan })); // 1つ前の計画を残す（「元に戻す」用）
  plan = next; if (curDay >= plan.days.length) curDay = 0;
  syncCustom(); save(); renderAll(); renderInfo(); fitCurrent(); queueRoutes();
  if (msg) toast(msg, 4200);
}
let receiving = false;
async function receivePlan(inc) {
  if (!inc || receiving) return;
  if (samePlan(inc, plan)) { save(); return toast('受け取った計画は、いまの計画と同じです'); }
  if (!hasContent(plan)) return applyPlan(inc, '共有された計画を開きました');
  receiving = true;
  const m = mergePlan(plan, inc), n = m.items + m.cand;
  const v = await ask({
    title: '共有された計画を受け取りました',
    options: [
      ...(n ? [{ label: `相手の追加分だけ取り込む（${n}か所）`, value: 'merge', primary: true }] : []),
      { label: '受け取った計画に置き換える', value: 'replace', primary: !n },
      { label: 'いまの計画のままにする', value: 'keep' }
    ], cancel: null,
    onOpen: box => {
      box.innerHTML = `<ul class="dlg-notes">
        <li>受け取った計画：${esc(planSummary(inc))}</li>
        <li>このスマホの計画：${esc(planSummary(plan))}</li>
        ${n ? `<li><b>取り込む</b>：相手の計画にあって、このスマホに無い場所だけを足します（ルートに${m.items}か所、候補に${m.cand}か所）。時刻や順番は変わりません。相手が消した場所は消えません。</li>` : '<li>相手の計画に、このスマホに無い場所はありません。</li>'}
        <li><b>置き換える</b>：このスマホの計画を、受け取った計画と同じにします。</li>
        <li>どちらも「交通・設定」から、受け取る前の計画に戻せます。</li>
      </ul>`;
    }
  });
  receiving = false;
  if (v === 'merge') applyPlan(m.plan, `${n}か所を取り込みました`);
  else if (v === 'replace') applyPlan(inc, '受け取った計画に置き換えました');
  else { save(); toast('いまの計画のままにしました'); }
}
async function pasteReceive() {
  const text = await ask({
    title: 'リンクを貼り付けて受け取る',
    text: '相手から届いた共有用のリンクをコピーして、下の欄に貼り付けてください。',
    options: [], cancel: 'やめる',
    onOpen: (box, done) => {
      box.innerHTML = `<div class="field" style="margin:0 0 12px"><input type="text" id="dlgText" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://… を貼り付け" aria-label="共有用のリンク"><button class="btn btn-primary" id="dlgOk">受け取る</button></div>`;
      const inp = $('#dlgText', box);
      const ok = () => { const v = inp.value.trim(); if (v) done(v); else inp.focus(); };
      $('#dlgOk', box).addEventListener('click', ok);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      setTimeout(() => inp.focus(), 60);
    }
  });
  if (!text) return;
  const inc = planFromText(text);
  if (!inc) return toast('リンクから計画を読み取れませんでした。リンク全体をコピーできているか確かめてください', 5000);
  receivePlan(inc);
}
async function restoreBackup() {
  const b = readBackup(); if (!b) return toast('戻せる計画がありません');
  const v = await ask({
    title: '受け取る前の計画に戻しますか？',
    text: `戻す計画：${planSummary(b.plan)}。いまの計画は控えに回るので、もう一度押すと元に戻せます。`,
    options: [{ label: '戻す', value: 'y', primary: true }]
  });
  if (v === 'y') applyPlan(b.plan, '受け取る前の計画に戻しました');
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
  const backup = readBackup();
  const backupAt = backup ? (d => `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`)(new Date(backup.t)) : '';
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
      <ul class="info-list">
        <li>渡す：「共有用のリンクを作る」から、AirDropやLINEなどで相手に送ります。</li>
        <li>受け取る：届いたリンクを開くと、「相手の追加分だけ取り込む」か「置き換える」かを選べます。</li>
        <li>リンクを開いても計画が入らないとき（ホーム画面のアイコンから使っている、LINEの中の画面で開いた、など）は、届いたリンクをコピーして「リンクを貼り付けて受け取る」を使います。</li>
      </ul>
      <div class="btn-row"><button class="btn btn-primary" data-info="share">共有用のリンクを作る</button><button class="btn" data-info="receive">リンクを貼り付けて受け取る</button></div>
      <div class="btn-row" style="margin-top:8px">${backup ? `<button class="btn" data-info="restore">受け取る前の計画に戻す（${esc(backupAt)} より前の計画）</button>` : ''}<button class="btn" data-info="reset">計画を空にする</button></div>
    </div>
    <div class="card">
      <h2>Googleマップのキー</h2>
      <p class="muted">キーを入れると、地図がGoogleマップになり、車の所要時間をGoogleが計算します。キーはこのスマホの中にだけ保存されます。</p>
      <div class="field"><input type="password" id="keyInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="AIza…で始まるキーを貼り付け" aria-label="Googleマップのキー"><button class="btn btn-primary" data-info="saveKey">保存</button></div>
      <div class="status ${status[0]}">${status[1]}</div>
      ${transitMsg ? `<div class="status">${transitMsg}</div>` : ''}
      ${key ? `<div class="btn-row" style="margin-top:10px">
        <button class="btn btn-sm" data-info="copyKey">保存したキーをコピー</button>
        <button class="btn btn-sm" data-info="delKey">キーを消す</button>
      </div>
      <p class="muted" style="margin-top:6px">別のスマホにも入れるときは、コピーしたキーを自分宛てのメモなどで送り、そのスマホのこの画面に貼り付けてください。</p>` : ''}
    </div>
    <div class="card">
      <h2>このアプリの情報について</h2>
      <p class="muted">営業時間・料金・交通は2026年11月14日に公式サイト等で調べた内容です。「要確認」と書いた項目は、出発前に電話や公式サイトで確かめてください。移動時間の「概算」は直線距離からの目安です。日没は${TRIP.sunset}ごろとして計算しています。</p>
      <p class="muted" style="margin-top:8px">写真の出典（ウィキメディア・コモンズ）：</p>
      <ul class="credits">${credits}</ul>
    </div>
    <div class="card">
      <h2>アプリの版</h2>
      <p class="muted">いま開いている版：${APP_VERSION}</p>
      <button class="btn btn-sm" data-info="checkUpdate" style="margin-top:8px">最新版か確認する</button>
    </div>`;
}

// ───────── 新しい版の確認（古い版のまま使い続けないように） ─────────
async function checkUpdate(manual) {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const latest = Number((await r.json()).v) || 0;
    if (latest > APP_VERSION) { const bar = $('#updateBar'); bar.dataset.v = latest; bar.hidden = false; return; }
    if (manual) toast('いま開いているのが最新版です');
  } catch (e) { if (manual) toast('確認できませんでした（通信の状態を確認してください）'); }
}
function applyUpdate() {
  const v = $('#updateBar').dataset.v || Date.now();
  location.replace(`${location.pathname}?v=${v}${location.hash}`);
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
  $('#spotList').addEventListener('click', e => {
    if (e.target.closest('[data-addplace]')) return addPlaceDialog();
    const b = e.target.closest('[data-spot]'); if (b) openDetail(b.dataset.spot);
  });
  $('#btnAddPlace').addEventListener('click', addPlaceDialog);
  $('#btnUpdate').addEventListener('click', applyUpdate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(false); });
  $('#pickCancel').addEventListener('click', () => { const wasAdd = pick && pick.which === 'add'; endPick(); if (!wasAdd) switchView('plan'); });
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
    const lk = e.target.closest('[data-linkpid]');
    if (lk) return linkPlace(id, lk.dataset.linkpid, lk.dataset.linkaddr);
    if (e.target.closest('[data-delplace]')) {
      ask({ title: 'この場所を削除しますか？', text: `「${byId[id].name}」を一覧と予定から削除します。`, options: [{ label: '削除する', value: 'y', primary: true }] })
        .then(v => { if (v === 'y') deleteCustom(id); });
      return;
    }
    if (e.target.closest('[data-wish]')) return toggleWish(id);
    if (add) { addToDay(id, Number(add.dataset.add)); closeDetail(); }
    else if (rm) { removeFromPlan(id); toast(byId[id] && byId[id].custom ? 'ルートから外しました（★候補として地図に残ります）' : 'ルートから外しました', 3200); }
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
    if (act === 'addWish') return addToDay(id, curDay);
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
    else if (act === 'receive') return pasteReceive();
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
    if (act === 'receive') return pasteReceive();
    if (act === 'restore') return restoreBackup();
    if (act === 'checkUpdate') return checkUpdate(true);
    if (act === 'copyKey') {
      const k = store.get(LS_KEY); if (!k) return;
      try { await navigator.clipboard.writeText(k); toast('キーをコピーしました。スマホへ送って貼り付けてください', 4000); }
      catch (e) { await ask({ title: '保存したキー（長押しでコピー）', text: k, options: [], cancel: '閉じる' }); }
      return;
    }
    if (act === 'reset') {
      const v = await ask({ title: '計画を空にしますか？', text: '2日分の予定と設定がすべて消えます。元に戻せません。', options: [{ label: '空にする', value: 'y', primary: true }] });
      if (v === 'y') { plan = newPlan(); areaFilter = 'all'; syncCustom(); save(); renderAll(); toast('計画を空にしました'); }
    }
    if (act === 'saveKey') {
      const v = $('#keyInput').value.trim();
      if (!v) return toast('キーを貼り付けてください');
      store.set(LS_KEY, v); toast('保存しました。地図を読み込み直します'); setTimeout(() => location.reload(), 700);
    }
    if (act === 'delKey') { store.del(LS_KEY); toast('キーを消しました。読み込み直します'); setTimeout(() => location.reload(), 700); }
  });

  // iPhone：Googleマップへのリンクは、アプリを直接開く。開かなかったときだけ、代わりの開き方を出す
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-app]');
    if (!a || !(isIOS || window.__forceIOS)) return;
    e.preventDefault();
    const web = a.href, apple = a.dataset.apple;
    let left = false;
    const onHide = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', onHide);
    openUrl(a.dataset.app);
    setTimeout(async () => {
      document.removeEventListener('visibilitychange', onHide);
      if (left || document.hidden) return; // アプリへ切り替わった
      const v = await ask({
        title: 'Googleマップのアプリが開きませんでしたか？',
        text: 'アプリが入っていない場合は、別の方法で開けます。開けた場合は「閉じる」を押してください。',
        options: [
          ...(apple ? [{ label: 'iPhoneの「マップ」で開く', value: 'apple' }] : []),
          { label: 'ブラウザでGoogleマップを開く', value: 'web' }
        ], cancel: '閉じる'
      });
      if (v === 'apple') openUrl(apple);
      else if (v === 'web') window.open(web, '_blank', 'noopener');
    }, 2500);
  });

  window.addEventListener('hashchange', () => { const inc = readHash(); if (inc && !samePlan(inc, plan)) receivePlan(inc); });

  window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#dialog').hidden) $('#dialog [data-close]').click(); else if (!$('#detail').hidden) closeDetail(); } });
}

// ───────── 起動 ─────────
async function boot() {
  const fromHash = readHash(), local = readLocal();
  let pendingShared = null;
  if (fromHash && local && hasContent(local) && !samePlan(fromHash, local)) { plan = local; pendingShared = fromHash; }
  else plan = fromHash || local || newPlan();
  syncCustom();

  bind(); initSheet(); renderDaySeg(); renderChips(); renderList(); renderPlan(); renderInfo();
  await initMap();
  drawMap(); renderInfo(); fitCurrent(); queueRoutes();
  checkUpdate(false);

  if (pendingShared) await receivePlan(pendingShared);
  else if (hasContent(plan)) save();
}
boot();

// 動作確認用（地図の状態を外から見るための入口）
window.__ueda = { map: () => M.map, kind: () => M.kind, estimate, setOpener: fn => { openUrl = fn; } };

})();
