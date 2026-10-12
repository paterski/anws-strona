// ANWS — giełda zleceń: lista + mapa, filtry, sortowanie, nowe zlecenie, rezerwacja, negocjacja

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const auth = window.ANWSAuth;
  const store = window.ANWSOrders;
  if (!auth || !store) return;

  // tylko dla zalogowanych — bez sesji: strona główna otworzy logowanie i wróci tutaj
  const session = auth.getSession();
  if (!session) {
    location.replace('index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
    return;
  }
  root.classList.remove('js-guard');
  const me = session.login;

  /* ---------- pomocnicze ---------- */
  const DICT = window.I18N || {};
  const t = (k, vars) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    let s = (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : (DICT.pl[k] != null ? DICT.pl[k] : k);
    if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  };
  const locale = () => (root.lang === 'en' ? 'en-GB' : 'pl-PL');
  const zl = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2, useGrouping: 'always' }).format(n) + ' zł';
  const num = (n, d = 0) => new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: d, useGrouping: 'always' }).format(n);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const gmaps = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"></path><circle cx="12" cy="10" r="2.3"></circle></svg>';
  const BOLT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"></path></svg>';
  const CHECK = '<span class="done-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></span>';

  function plural(n) {
    if (root.lang === 'en') return n === 1 ? t('g.n1') : t('g.n5');
    if (n === 1) return t('g.n1');
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && (h < 12 || h > 14) ? t('g.n2') : t('g.n5');
  }
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function dayLabel(ms) {
    const d = new Date(ms), now = new Date(), tom = new Date(now.getTime() + 864e5);
    if (sameDay(d, now)) return t('g.today');
    if (sameDay(d, tom)) return t('g.tomorrow');
    return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric' });
  }
  const timeLabel = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  function relLabel(ms) {
    const diff = ms - Date.now();
    if (diff <= 0) return t('g.started');
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'always' });
    const min = Math.round(diff / 6e4);
    if (min < 60) return rtf.format(min, 'minute');
    const h = Math.round(diff / 36e5);
    if (h < 36) return rtf.format(h, 'hour');
    return rtf.format(Math.round(diff / 864e5), 'day');
  }

  let toastTimer;
  function toast(msg) {
    const tEl = $('#toast');
    tEl.textContent = msg;
    tEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => tEl.classList.remove('is-on'), 4000);
  }

  /* ---------- użytkownik i model rozliczeń ---------- */
  function renderUser() {
    const plan = auth.getPlan(me);
    const chip = $('.user-chip');
    const name = session.name || me;
    $('#uc-name').textContent = name;
    $('#uc-avatar').textContent = name.replace(/[^\p{L}\d ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || me.slice(0, 2).toUpperCase();
    const kind = plan.plan === 'subscription' ? 'sub' : plan.free ? 'free' : 'comm';
    chip.dataset.plan = kind;
    $('#uc-plan').textContent = t(kind === 'sub' ? 'g.plan.sub' : kind === 'free' ? 'g.plan.free' : 'g.plan.comm');
    chip.title = name + ' · ' + $('#uc-plan').textContent;
  }
  $('#logout').addEventListener('click', () => { auth.logout(); location.href = 'index.html'; });

  /* ---------- stan filtrów i sortowania ---------- */
  const params = new URLSearchParams(location.search);
  const state = {
    q: '', date: 'all', urgent: params.get('pilne') === '1', free: false,
    rateMin: null, kmMax: null, paxMin: null,
    sort: { key: 'dep', dir: 'asc' }, mapMode: 'dep',
  };

  function filtered() {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const q = norm(state.q.trim());
    let list = store.active().filter((o) => {
      if (state.urgent && !o.urgent) return false;
      if (state.free && o.status !== 'open') return false;
      if (state.date === 'today' && !(o.dep < startToday + 864e5)) return false;
      if (state.date === 'tomorrow' && !(o.dep >= startToday + 864e5 && o.dep < startToday + 2 * 864e5)) return false;
      if (state.date === 'week' && !(o.dep < now.getTime() + 7 * 864e5)) return false;
      if (state.rateMin != null && o.rate < state.rateMin) return false;
      if (state.kmMax != null && o.km > state.kmMax) return false;
      if (state.paxMin != null && o.pax < state.paxMin) return false;
      if (q && !(norm(o.from.label).includes(q) || norm(o.to.label).includes(q))) return false;
      return true;
    });
    const { key, dir } = state.sort;
    const val = (o) => key === 'from' ? o.from.label : key === 'to' ? o.to.label : key === 'ppk' ? o.rate / o.km : o[key];
    list.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb, locale()) : va - vb;
      return dir === 'asc' ? c : -c;
    });
    return list;
  }

  /* ---------- tabela ---------- */
  const tbody = $('#gl-body');
  let lastIds = '';

  function placeCell(p, toEnd, metaNodes) {
    const wrap = el('div', 'pl');
    const a = el('a', 'pin' + (toEnd ? ' pin-to' : ''));
    a.href = gmaps(p); a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', t('g.pin', { x: p.label }));
    a.innerHTML = PIN;
    const txt = el('div', 'pl-text');
    txt.appendChild(el('span', 'pl-name', p.label));
    if (metaNodes && metaNodes.length) {
      const meta = el('div', 'pl-meta');
      metaNodes.forEach((n) => meta.appendChild(n));
      txt.appendChild(meta);
    }
    wrap.append(a, txt);
    return wrap;
  }
  function timeCell(ms, withRel) {
    const w = el('div', 'tm');
    w.appendChild(el('span', 'tm-day', dayLabel(ms)));
    const time = el('time', 'tm-time', timeLabel(ms));
    time.dateTime = new Date(ms).toISOString();
    w.appendChild(time);
    if (withRel) {
      const r = el('span', 'tm-rel' + (ms - Date.now() < 6 * 36e5 ? ' is-soon' : ''), relLabel(ms));
      w.appendChild(r);
    }
    return w;
  }

  function row(o) {
    const tr = el('tr', 'order');
    tr.dataset.id = o.id;
    if (o.urgent) tr.classList.add('is-urgent');
    if (o.status !== 'open') tr.classList.add('is-done');

    const meta = [];
    if (o.urgent) { const u = el('span', 'tag-urgent'); u.innerHTML = BOLT; u.appendChild(document.createTextNode(t('g.urgentTag'))); meta.push(u); }
    meta.push(el('span', null, t('g.pax', { x: o.pax })));

    const td = (child, cls) => { const c = el('td', cls); if (child) c.appendChild(child); tr.appendChild(c); return c; };
    td(placeCell(o.from, false, meta));
    td(timeCell(o.dep, true));
    td(placeCell(o.to, true, o.notes ? [el('span', null, o.notes.length > 60 ? o.notes.slice(0, 57) + '…' : o.notes)] : null));
    td(timeCell(o.arr, false));
    td(el('span', 'km', t('g.km', { x: num(o.km) })), 'num');
    const rate = el('div', 'rate');
    rate.appendChild(el('b', null, zl(o.rate)));
    rate.appendChild(el('span', null, t('g.perKm', { x: num(o.rate / o.km, 1) })));
    td(rate, 'num');

    const acts = el('div', 'acts');
    const own = o.owner === me;
    const neg = el('button', 'g-btn g-btn-ghost', t('g.negotiate'));
    neg.type = 'button';
    neg.disabled = own || o.status !== 'open';
    neg.addEventListener('click', () => openNegotiate(o.id));
    const res = el('button', 'g-btn g-btn-primary');
    res.type = 'button';
    if (own) { res.textContent = t('g.yours'); res.disabled = true; }
    else if (o.status !== 'open' && o.reservedBy === me) { res.textContent = t('g.reservedMine'); res.disabled = true; res.classList.add('is-mine'); }
    else if (o.status !== 'open') { res.textContent = t('g.reserved'); res.disabled = true; }
    else { res.textContent = t('g.reserve'); res.addEventListener('click', () => openReserve(o.id)); }
    acts.append(neg, res);
    const cell = td(acts);
    const myOffer = (o.offers || []).find((x) => x.by === me);
    if (myOffer && o.status === 'open') cell.appendChild(el('span', 'offer-note', t('g.offerSent', { x: zl(myOffer.rate) })));

    tr.addEventListener('mouseenter', () => setHl(o.id, false));
    tr.addEventListener('mouseleave', () => setHl(null, false));
    tr.addEventListener('focusin', () => setHl(o.id, false));
    tr.addEventListener('click', (e) => { if (!e.target.closest('a, button')) focusOnMap(o.id); });
    return tr;
  }

  function render() {
    const list = filtered();
    tbody.textContent = '';
    list.forEach((o) => tbody.appendChild(row(o)));
    $('#gl-count').textContent = list.length + ' ' + plural(list.length);
    $('#gl-empty').hidden = list.length > 0;
    $('#g-title span').textContent = t(state.urgent ? 'g.urgentTitle' : 'g.title');
    $('#urgent-count').textContent = store.counts().urgent;
    // nagłówki sortowania
    $$('.gl-table th[aria-sort]').forEach((th) => {
      const k = $('.th-sort', th).dataset.sort;
      th.setAttribute('aria-sort', k === state.sort.key ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    const ids = list.map((o) => o.id).join(',') + '|' + state.mapMode;
    updateMap(list, ids !== lastIds);
    lastIds = ids;
  }

  /* ---------- filtry ---------- */
  let qTimer;
  $('#gl-q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; render(); }, 150); });
  $$('[data-date]').forEach((b) => b.addEventListener('click', () => {
    state.date = b.dataset.date;
    $$('[data-date]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  function setUrgent(on) {
    state.urgent = on;
    $('#f-urgent').setAttribute('aria-pressed', String(on));
    $('.an-urgent').setAttribute('aria-pressed', String(on));
    $('.an-list').setAttribute('aria-pressed', String(!on));
    render();
  }
  $('#f-urgent').addEventListener('click', () => setUrgent(!state.urgent));
  $('#f-free').addEventListener('click', (e) => { state.free = !state.free; e.currentTarget.setAttribute('aria-pressed', String(state.free)); render(); });
  const more = $('#f-more'), panel = $('#f-panel');
  more.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) $('#f-rate').focus(); });
  function readNum(id) { const v = $(id).value.trim(); return v === '' ? null : Math.max(0, +v); }
  function syncAdvanced() {
    state.rateMin = readNum('#f-rate'); state.kmMax = readNum('#f-km'); state.paxMin = readNum('#f-pax');
    const n = [state.rateMin, state.kmMax, state.paxMin].filter((v) => v != null).length;
    const b = $('#f-more-count'); b.textContent = n; b.hidden = !n;
    render();
  }
  ['#f-rate', '#f-km', '#f-pax'].forEach((id) => $(id).addEventListener('input', syncAdvanced));
  $('#f-sort').addEventListener('change', (e) => { const [key, dir] = e.target.value.split(':'); state.sort = { key, dir }; render(); });
  function resetFilters() {
    state.q = ''; $('#gl-q').value = '';
    state.date = 'all'; $$('[data-date]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.date === 'all')));
    state.free = false; $('#f-free').setAttribute('aria-pressed', 'false');
    ['#f-rate', '#f-km', '#f-pax'].forEach((id) => { $(id).value = ''; });
    state.rateMin = state.kmMax = state.paxMin = null; $('#f-more-count').hidden = true;
    state.sort = { key: 'dep', dir: 'asc' }; $('#f-sort').value = 'dep:asc';
    setUrgent(false);
  }
  $('#f-reset').addEventListener('click', resetFilters);
  $('#gl-empty-reset').addEventListener('click', resetFilters);

  // sortowanie nagłówkami (pierwsze kliknięcie: stawka i km — malejąco/rosnąco tak, jak zwykle się szuka)
  $$('.th-sort').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    const first = key === 'rate' ? 'desc' : 'asc';
    state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: first };
    const v = state.sort.key + ':' + state.sort.dir;
    if ($('#f-sort option[value="' + v + '"]')) $('#f-sort').value = v;
    render();
  }));

  /* ---------- menu: utwórz / lista / pilne ---------- */
  $$('[data-action]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.action;
    if (a === 'create') openCreate();
    if (a === 'list') { setUrgent(false); if (main.dataset.view === 'map' && narrow.matches) setView('list'); }
    if (a === 'urgent') { setUrgent(true); }
  }));

  /* ---------- układ: lista / podział / mapa + przeciągany uchwyt ---------- */
  const main = $('#tresc');
  const narrow = matchMedia('(max-width: 900px)');
  const LKEY = 'anws-gielda-layout';
  const layout = (() => { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { return {}; } })();
  const saveLayout = () => { try { localStorage.setItem(LKEY, JSON.stringify(layout)); } catch (e) {} };
  const resizer = $('#resizer');

  function setSplit(pct) {
    pct = Math.round(Math.min(80, Math.max(25, pct)));
    main.style.setProperty('--split', pct + '%');
    resizer.setAttribute('aria-valuenow', String(pct));
    layout.split = pct;
  }
  function setView(v) {
    if (narrow.matches && v === 'split') v = 'list';
    main.dataset.view = v;
    $$('[data-view-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === v)));
    if (!narrow.matches) layout.view = v;
    saveLayout();
    // mapa mogła być ukryta — przelicz rozmiar i dopasuj widok do pinezek
    if (map) setTimeout(() => { map.invalidateSize(); lastIds = ''; render(); }, 60);
  }
  $$('[data-view-btn]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.viewBtn)));
  narrow.addEventListener('change', () => setView(narrow.matches ? 'list' : (layout.view || 'split')));

  let drag = null;
  resizer.addEventListener('pointerdown', (e) => {
    drag = { rect: main.getBoundingClientRect() };
    resizer.setPointerCapture(e.pointerId);
    main.classList.add('is-dragging');
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    setSplit((e.clientX - drag.rect.left) / drag.rect.width * 100);
    if (map) map.invalidateSize({ pan: false });
  });
  const endDrag = () => { if (!drag) return; drag = null; main.classList.remove('is-dragging'); saveLayout(); if (map) map.invalidateSize(); };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
  resizer.addEventListener('dblclick', () => { setSplit(58); saveLayout(); if (map) map.invalidateSize(); });
  resizer.addEventListener('keydown', (e) => {
    const cur = +resizer.getAttribute('aria-valuenow');
    const step = e.shiftKey ? 10 : 3;
    const map2 = { ArrowLeft: cur - step, ArrowRight: cur + step, Home: 25, End: 80 };
    if (!(e.key in map2)) return;
    e.preventDefault();
    setSplit(map2[e.key]); saveLayout();
    if (map) map.invalidateSize();
  });

  /* ---------- mapa zleceń ---------- */
  const hasMap = typeof window.L !== 'undefined';
  let map = null, layerGroup = null, routeLayer = null;
  const markers = new Map();
  const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  function icon(cls, label) {
    return L.divIcon({ className: '', html: `<span class="mk ${cls}"><i></i><b>${label || ''}</b></span>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
  }
  if (hasMap) {
    map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([52.1, 19.4], 6);
    L.tileLayer(TILE, { maxZoom: 18, attribution: ATTR }).addTo(map);
    layerGroup = L.layerGroup().addTo(map);
  } else {
    $('#map').appendChild(el('p', 'map-note', 'Mapa jest chwilowo niedostępna.'));
  }

  function popupFor(o) {
    const wrap = el('div');
    const p = state.mapMode === 'dep' ? o.from : o.to;
    wrap.appendChild(el('div', 'mp-title', p.label));
    wrap.appendChild(el('div', 'mp-meta', `${dayLabel(o.dep)} ${timeLabel(o.dep)} → ${o.to.label === p.label ? o.from.label : o.to.label}`));
    wrap.appendChild(el('div', 'mp-meta', `${t('g.km', { x: num(o.km) })} · ${zl(o.rate)}`));
    const b = el('button', 'mp-btn', t('g.map.showRow'));
    b.type = 'button';
    b.addEventListener('click', () => showRow(o.id));
    wrap.appendChild(b);
    return wrap;
  }

  function updateMap(list, refit) {
    $('#map-note').textContent = t(state.mapMode === 'dep' ? 'g.map.noteDep' : 'g.map.noteArr');
    if (!map) return;
    layerGroup.clearLayers();
    markers.clear();
    clearRoute();
    list.forEach((o) => {
      const p = state.mapMode === 'dep' ? o.from : o.to;
      const cls = (state.mapMode === 'dep' ? 'mk-dep' : 'mk-arr') + (o.urgent ? ' mk-urgent' : '');
      const m = L.marker([p.lat, p.lng], { icon: icon(cls, o.urgent ? '!' : ''), title: p.label, alt: p.label, riseOnHover: true });
      m.bindPopup(() => popupFor(o), { closeButton: true, autoPanPadding: [30, 30] });
      m.on('mouseover', () => setHl(o.id, true));
      m.on('mouseout', () => setHl(null, true));
      m.on('click', () => showRow(o.id, true));
      m.addTo(layerGroup);
      markers.set(o.id, m);
    });
    if (refit && list.length) {
      const b = L.latLngBounds(list.map((o) => { const p = state.mapMode === 'dep' ? o.from : o.to; return [p.lat, p.lng]; }));
      map.fitBounds(b, { padding: [50, 50], maxZoom: 11, animate: !reduce() });
    }
  }

  function clearRoute() { if (routeLayer && map) { map.removeLayer(routeLayer); routeLayer = null; } }
  let hlId = null;
  function setHl(id) {
    if (hlId === id) return;
    if (hlId) {
      const r = $(`.order[data-id="${hlId}"]`); if (r) r.classList.remove('is-hl');
      const m = markers.get(hlId); const e = m && m.getElement();
      if (e) { e.classList.remove('is-hl-wrap'); const mk = $('.mk', e); if (mk) mk.classList.remove('is-hl'); }
    }
    clearRoute();
    hlId = id;
    if (!id) return;
    const r = $(`.order[data-id="${id}"]`); if (r) r.classList.add('is-hl');
    const m = markers.get(id); const e = m && m.getElement();
    if (e) { e.classList.add('is-hl-wrap'); const mk = $('.mk', e); if (mk) mk.classList.add('is-hl'); }
    // trasa zlecenia jako przerywana linia (start → cel)
    const o = store.get(id);
    if (map && o) {
      const css = getComputedStyle(root);
      routeLayer = L.layerGroup([
        L.polyline([[o.from.lat, o.from.lng], [o.to.lat, o.to.lng]], { color: css.getPropertyValue('--accent').trim() || '#6B7F42', weight: 3, dashArray: '6 8', opacity: .9 }),
        L.circleMarker(state.mapMode === 'dep' ? [o.to.lat, o.to.lng] : [o.from.lat, o.from.lng], { radius: 6, color: css.getPropertyValue('--ln-a').trim() || '#3A1F3D', weight: 3, fillColor: '#fff', fillOpacity: 1 }),
      ]).addTo(map);
    }
  }

  function showRow(id, fromMap) {
    const r = $(`.order[data-id="${id}"]`);
    if (!r) return;
    r.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
    r.classList.remove('is-flash'); void r.offsetWidth; r.classList.add('is-flash');
    if (!fromMap) setHl(id);
  }
  function focusOnMap(id) {
    const m = markers.get(id);
    if (!m || !map || main.dataset.view === 'list') return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 9), { duration: reduce() ? 0 : .6 });
    setTimeout(() => m.openPopup(), reduce() ? 0 : 650);
  }

  $$('[data-map-mode]').forEach((b) => b.addEventListener('click', () => {
    state.mapMode = b.dataset.mapMode;
    $$('[data-map-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));

  /* ---------- okna dialogowe ---------- */
  function openDlg(d) { if (!d.open) { d.classList.remove('is-closing'); d.showModal(); } }
  function closeDlg(d) {
    if (!d.open || d.classList.contains('is-closing')) return;
    d.classList.add('is-closing');
    setTimeout(() => { d.close(); d.classList.remove('is-closing'); }, reduce() ? 0 : 160);
  }
  ['#rv-dialog', '#ng-dialog'].forEach((sel) => {
    const d = $(sel);
    $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => closeDlg(d)));
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeDlg(d); });
    d.addEventListener('click', (e) => { if (e.target === d) closeDlg(d); });
  });

  function routeSummary(box, o) {
    box.textContent = '';
    const line = (p, cls, letter) => { const l = el('div', 'dr-line'); const pin = el('span', 'cr-pin ' + cls, letter); pin.setAttribute('aria-hidden', 'true'); l.append(pin, el('span', null, p.label)); return l; };
    box.appendChild(line(o.from, 'cr-pin-a', 'A'));
    box.appendChild(line(o.to, 'cr-pin-b', 'B'));
    const meta = el('div', 'dr-meta');
    meta.appendChild(el('span', null, `${dayLabel(o.dep)} ${timeLabel(o.dep)} → ${timeLabel(o.arr)}`));
    meta.appendChild(el('span', null, t('g.km', { x: num(o.km) })));
    meta.appendChild(el('span', null, t('g.pax', { x: o.pax })));
    meta.appendChild(el('b', null, zl(o.rate)));
    box.appendChild(meta);
  }

  /* ---------- rezerwacja ---------- */
  let rvId = null;
  function openReserve(id) {
    const o = store.get(id);
    if (!o || o.status !== 'open' || o.owner === me) return;
    rvId = id;
    routeSummary($('#rv-route'), o);
    const box = $('#rv-box');
    box.textContent = '';
    const plan = auth.getPlan(me);
    const confirm = $('#rv-confirm');
    if (plan.free) {
      box.className = 'dlg-box is-free';
      const title = el('div', 'db-title'); title.innerHTML = CHECK; title.appendChild(el('span', null, t('g.rv.freeTitle')));
      box.appendChild(title);
      box.appendChild(el('p', 'db-note', plan.plan === 'subscription' ? t('g.rv.freeSub') : t('g.rv.freeTrial', { x: new Date(plan.freeUntil).toLocaleDateString(locale()) })));
      confirm.textContent = t('g.rv.confirm');
    } else {
      const c = store.commission(o.rate);
      box.className = 'dlg-box';
      box.appendChild(el('div', 'db-title', t('g.rv.commTitle')));
      const r = (label, value, cls) => { const d = el('div', 'db-row' + (cls ? ' ' + cls : '')); d.append(el('span', null, label), el('b', null, value)); box.appendChild(d); };
      r(t('g.rv.rate'), zl(o.rate));
      r(t('g.rv.zone'), t('g.rv.zone' + c.zone));
      r(t('g.rv.pct'), num(c.pct * 100, c.pct === 0.025 ? 1 : 0) + '%');
      r(t('g.rv.total'), zl(c.amount), 'db-total');
      const note = el('p', 'db-note', t('g.rv.payNote') + ' ');
      const a = el('a', null, t('g.rv.subLink')); a.href = 'cennik.html';
      note.appendChild(a);
      box.appendChild(note);
      confirm.textContent = t('g.rv.confirmPay');
    }
    openDlg($('#rv-dialog'));
    setTimeout(() => confirm.focus(), 40);
  }
  $('#rv-confirm').addEventListener('click', () => {
    const o = store.get(rvId);
    if (!o) return;
    const plan = auth.getPlan(me);
    const ok = store.reserve(rvId, me, plan.free ? null : store.commission(o.rate));
    closeDlg($('#rv-dialog'));
    if (!ok) return;
    toast(t('g.rv.done'));
    render();
    setTimeout(() => showRow(rvId), 120);
  });

  /* ---------- negocjacja stawki ---------- */
  let ngId = null;
  const ngForm = $('#ng-form'), ngRate = $('#ng-rate'), ngErr = $('#ng-err');
  function openNegotiate(id) {
    const o = store.get(id);
    if (!o || o.owner === me) return;
    ngId = id;
    routeSummary($('#ng-route'), o);
    const mine = (o.offers || []).find((x) => x.by === me);
    ngRate.value = mine ? mine.rate : '';
    $('#ng-msg').value = mine ? mine.message : '';
    $('#ng-help').textContent = t('g.ng.current', { x: zl(o.rate) });
    ngErr.hidden = true; ngRate.removeAttribute('aria-invalid');
    openDlg($('#ng-dialog'));
    setTimeout(() => ngRate.focus(), 40);
  }
  ngRate.addEventListener('input', () => { ngErr.hidden = true; ngRate.removeAttribute('aria-invalid'); });
  ngForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = +ngRate.value;
    if (!(v > 0)) { ngRate.setAttribute('aria-invalid', 'true'); ngErr.textContent = t('g.ng.e'); ngErr.hidden = false; ngRate.focus(); return; }
    store.negotiate(ngId, me, Math.round(v), $('#ng-msg').value.trim());
    closeDlg($('#ng-dialog'));
    toast(t('g.ng.done'));
    render();
  });

  /* ---------- nowe zlecenie ---------- */
  const cr = {
    dlg: $('#cr-dialog'), form: $('#cr-form'), from: $('#cr-from'), to: $('#cr-to'), dep: $('#cr-dep'), arr: $('#cr-arr'),
    pax: $('#cr-pax'), km: $('#cr-km'), rate: $('#cr-rate'), urgent: $('#cr-urgent'), notes: $('#cr-notes'),
    hint: $('#cr-hint'), q: $('#cr-q'), results: $('#cr-results'),
  };
  let crMap = null, mA = null, mB = null, crLine = null, ptA = null, ptB = null;
  let kmTouched = false, arrAuto = false, durMin = null, crDirty = false, kmApprox = false;

  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fromInput = (v) => (v ? new Date(v).getTime() : NaN);

  function crErr(input, key) {
    input.setAttribute('aria-invalid', 'true');
    const e = $('#' + input.id + '-err'); e.textContent = t(key); e.hidden = false; e.dataset.key = key;
  }
  function crClear(input) {
    input.removeAttribute('aria-invalid');
    const e = $('#' + input.id + '-err'); if (e) { e.hidden = true; e.dataset.key = ''; }
  }

  function updateSteps() {
    $('#cr-step-a').classList.toggle('is-set', !!ptA);
    $('#cr-step-b').classList.toggle('is-set', !!ptB);
    $('#cr-step-a').classList.toggle('is-current', !ptA);
    $('#cr-step-b').classList.toggle('is-current', !!ptA && !ptB);
    cr.hint.textContent = t(!ptA ? 'g.cr.hintA' : !ptB ? 'g.cr.hintB' : 'g.cr.hintDone');
  }

  // Adres z punktu (Nominatim / OpenStreetMap): „ulica numer, miejscowość”
  async function reverse(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1&accept-language=${root.lang === 'en' ? 'en' : 'pl'}`);
      const j = await r.json();
      return shortLabel(j) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (e) { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
  }
  function shortLabel(j) {
    if (!j) return '';
    const a = j.address || {};
    const place = a.city || a.town || a.village || a.municipality || a.county || '';
    const street = [a.road || a.pedestrian || a.square || j.name, a.house_number].filter(Boolean).join(' ');
    const out = [place, street].filter(Boolean).join(', ');
    return out || (j.display_name || '').split(',').slice(0, 2).join(',').trim();
  }

  function setPoint(which, latlng, label) {
    const isA = which === 'A';
    const pt = { lat: latlng.lat, lng: latlng.lng, label: label || '' };
    const input = isA ? cr.from : cr.to;
    let m = isA ? mA : mB;
    if (!m) {
      m = L.marker(latlng, { icon: icon(isA ? 'mk-a' : 'mk-b', which), draggable: true, keyboard: true, title: which }).addTo(crMap);
      m.on('dragend', async () => {
        const ll = m.getLatLng();
        const p = isA ? ptA : ptB;
        p.lat = ll.lat; p.lng = ll.lng;
        input.value = t('g.cr.locating');
        const lb = await reverse(ll.lat, ll.lng);
        p.label = lb; input.value = lb; crClear(input);
        updateRoute();
      });
      if (isA) mA = m; else mB = m;
    } else m.setLatLng(latlng);
    if (isA) ptA = pt; else ptB = pt;
    crDirty = true;
    crClear(input);
    updateSteps();
    if (label) input.value = label;
    else {
      input.value = t('g.cr.locating');
      reverse(latlng.lat, latlng.lng).then((lb) => { if ((isA ? ptA : ptB) === pt) { pt.label = lb; input.value = lb; } });
    }
    updateRoute();
  }

  function clearPoints() {
    [mA, mB, crLine].forEach((x) => { if (x && crMap) crMap.removeLayer(x); });
    mA = mB = crLine = null; ptA = ptB = null; durMin = null;
    cr.from.value = ''; cr.to.value = '';
    if (!kmTouched) cr.km.value = '';
    updateSteps(); updateRateHelp();
  }
  $('#cr-clear').addEventListener('click', clearPoints);

  // Trasa drogowa (OSRM, OpenStreetMap): długość i czas przejazdu; bez trasy — szacunek z linii prostej
  let routeReq = 0;
  async function updateRoute() {
    if (!ptA || !ptB || !crMap) return;
    const id = ++routeReq;
    if (crLine) crMap.removeLayer(crLine);
    const css = getComputedStyle(root);
    const color = css.getPropertyValue('--accent').trim() || '#6B7F42';
    crLine = L.polyline([[ptA.lat, ptA.lng], [ptB.lat, ptB.lng]], { color, weight: 3, dashArray: '6 8' }).addTo(crMap);
    crMap.fitBounds(L.latLngBounds([[ptA.lat, ptA.lng], [ptB.lat, ptB.lng]]), { padding: [50, 50], maxZoom: 13 });
    let km, dur, approx = false;
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${ptA.lng},${ptA.lat};${ptB.lng},${ptB.lat}?overview=simplified&geometries=geojson`);
      const j = await r.json();
      if (id !== routeReq) return;
      const route = j.routes && j.routes[0];
      if (!route) throw new Error('no route');
      km = Math.max(1, Math.round(route.distance / 1000));
      dur = Math.round(route.duration / 60);
      crMap.removeLayer(crLine);
      crLine = L.geoJSON(route.geometry, { style: { color, weight: 4, opacity: .85 } }).addTo(crMap);
    } catch (e) {
      if (id !== routeReq) return;
      km = Math.max(1, Math.round(store.haversine(ptA, ptB) * 1.25));
      dur = Math.round(km / 70 * 60);
      approx = true;
    }
    durMin = dur; kmApprox = approx;
    $('#cr-km-help').textContent = t(approx ? 'g.cr.kmApprox' : 'g.cr.kmHelp');
    if (!kmTouched) { cr.km.value = km; crClear(cr.km); }
    suggestArrival();
    updateRateHelp();
  }
  function suggestArrival() {
    const dep = fromInput(cr.dep.value);
    if (!durMin || isNaN(dep) || (cr.arr.value && !arrAuto)) return;
    const m = 15 * 6e4;
    cr.arr.value = toLocalInput(Math.ceil((dep + durMin * 6e4) / m) * m);
    arrAuto = true;
    crClear(cr.arr);
  }
  function updateRateHelp() {
    const r = +cr.rate.value, k = +cr.km.value;
    $('#cr-rate-help').textContent = r > 0 && k > 0 ? t('g.cr.rateHint', { x: num(r / k, 1) }) : '';
  }
  cr.km.addEventListener('input', () => { kmTouched = true; crClear(cr.km); updateRateHelp(); });
  cr.rate.addEventListener('input', () => { crClear(cr.rate); updateRateHelp(); });
  cr.dep.addEventListener('input', () => { crClear(cr.dep); suggestArrival(); });
  cr.arr.addEventListener('input', () => { arrAuto = false; crClear(cr.arr); });
  [cr.from, cr.to, cr.pax].forEach((i) => i.addEventListener('input', () => { crClear(i); crDirty = true; }));
  cr.from.addEventListener('input', () => { if (ptA) ptA.label = cr.from.value; });
  cr.to.addEventListener('input', () => { if (ptB) ptB.label = cr.to.value; });
  cr.form.addEventListener('input', () => { crDirty = true; });

  // wyszukiwarka adresu nad mapą
  let qT, results = [], active = -1;
  function renderResults(list, empty) {
    cr.results.textContent = '';
    results = list; active = -1;
    if (!list.length && !empty) { cr.results.hidden = true; cr.q.setAttribute('aria-expanded', 'false'); return; }
    if (!list.length) { const li = el('li', 'is-empty', t('g.cr.noResults')); cr.results.appendChild(li); }
    list.forEach((r, i) => {
      const li = el('li', null, r.label);
      li.id = 'cr-opt-' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pickResult(i); });
      cr.results.appendChild(li);
    });
    cr.results.hidden = false; cr.q.setAttribute('aria-expanded', 'true');
  }
  function pickResult(i) {
    const r = results[i];
    if (!r) return;
    renderResults([], false);
    cr.q.value = '';
    const which = !ptA ? 'A' : 'B';
    crMap.setView([r.lat, r.lng], 15);
    setPoint(which, L.latLng(r.lat, r.lng), r.label);
  }
  cr.q.addEventListener('input', () => {
    clearTimeout(qT);
    const q = cr.q.value.trim();
    if (q.length < 3) { renderResults([], false); return; }
    qT = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=pl,de,cz,sk,lt,ua,at,hu&accept-language=${root.lang === 'en' ? 'en' : 'pl'}&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (cr.q.value.trim() !== q) return;
        renderResults(j.map((x) => ({ lat: +x.lat, lng: +x.lon, label: shortLabel(x) || x.display_name })), true);
      } catch (e) { renderResults([], true); }
    }, 450);
  });
  cr.q.addEventListener('keydown', (e) => {
    if (cr.results.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      $$('li[role="option"]', cr.results).forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      cr.q.setAttribute('aria-activedescendant', 'cr-opt-' + active);
    } else if (e.key === 'Enter') { e.preventDefault(); pickResult(active < 0 ? 0 : active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); renderResults([], false); }
  });
  cr.q.addEventListener('blur', () => setTimeout(() => renderResults([], false), 150));

  function resetCreate() {
    cr.form.reset(); clearPoints();
    kmTouched = false; arrAuto = false; crDirty = false;
    $$('.field-err', cr.form).forEach((e) => { e.hidden = true; e.dataset.key = ''; });
    $$('[aria-invalid]', cr.form).forEach((i) => i.removeAttribute('aria-invalid'));
    $('#cr-km-help').textContent = t('g.cr.kmHelp');
  }
  function openCreate() {
    if (!hasMap) { toast('Mapa jest chwilowo niedostępna.'); return; }
    cr.dep.min = toLocalInput(Date.now());
    cr.arr.min = toLocalInput(Date.now());
    openDlg(cr.dlg);
    setTimeout(() => {
      if (!crMap) {
        crMap = L.map('cr-map', { zoomControl: true }).setView([52.1, 19.4], 6);
        L.tileLayer(TILE, { maxZoom: 19, attribution: ATTR }).addTo(crMap);
        crMap.on('click', (e) => { if (!ptA) setPoint('A', e.latlng); else if (!ptB) setPoint('B', e.latlng); });
      }
      crMap.invalidateSize();
      updateSteps();
      cr.q.focus();
    }, 80);
  }
  function closeCreate(force) {
    if (!force && crDirty && !confirm(t('g.cr.discard'))) return;
    closeDlg(cr.dlg);
  }
  $$('[data-close]', cr.dlg).forEach((b) => b.addEventListener('click', () => closeCreate(false)));
  cr.dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!cr.results.hidden) return; closeCreate(false); });

  cr.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errs = [];
    const fail = (input, key) => { crErr(input, key); errs.push(input); };
    if (!ptA) fail(cr.from, 'g.e.from'); else if (!cr.from.value.trim() || cr.from.value === t('g.cr.locating')) fail(cr.from, 'g.e.label');
    if (!ptB) fail(cr.to, 'g.e.to'); else if (!cr.to.value.trim() || cr.to.value === t('g.cr.locating')) fail(cr.to, 'g.e.label');
    const dep = fromInput(cr.dep.value), arr = fromInput(cr.arr.value);
    if (isNaN(dep) || dep < Date.now() - 6e4) fail(cr.dep, 'g.e.dep');
    if (isNaN(arr) || !(arr > dep)) fail(cr.arr, 'g.e.arr');
    const pax = +cr.pax.value; if (!(pax >= 1 && pax <= 100 && Number.isInteger(pax))) fail(cr.pax, 'g.e.pax');
    const km = +cr.km.value; if (!(km > 0)) fail(cr.km, 'g.e.km');
    const rate = +cr.rate.value; if (!(rate > 0)) fail(cr.rate, 'g.e.rate');
    if (errs.length) { errs[0].focus(); return; }
    const o = store.add({
      from: { label: cr.from.value.trim(), lat: ptA.lat, lng: ptA.lng },
      to: { label: cr.to.value.trim(), lat: ptB.lat, lng: ptB.lng },
      dep, arr, km: Math.round(km), rate: Math.round(rate), pax, urgent: cr.urgent.checked, notes: cr.notes.value.trim(),
    }, me);
    crDirty = false;
    closeCreate(true);
    resetCreate();
    // pokaż nowe zlecenie: bez filtrów, które mogłyby je ukryć
    resetFilters();
    if (o.urgent) setUrgent(false);
    toast(t('g.done'));
    setTimeout(() => { showRow(o.id); focusOnMap(o.id); }, 200);
  });

  /* ---------- zmiana języka ---------- */
  document.addEventListener('anws:lang', () => {
    renderUser();
    render();
    if (cr.dlg.open) updateSteps();
    updateRateHelp();
    $$('.field-err', cr.form).forEach((e) => { if (e.dataset.key) e.textContent = t(e.dataset.key); });
  });

  /* ---------- start ---------- */
  renderUser();
  if (layout.split) setSplit(layout.split);
  setView(narrow.matches ? 'list' : (layout.view || 'split'));
  setUrgent(state.urgent);
  updateSteps();
  if (params.get('nowe') === '1') setTimeout(openCreate, 250);
  if (params.has('nowe') || params.has('pilne')) history.replaceState(null, '', location.pathname);
  // terminy względne („za 3 godziny”) odświeżamy co minutę
  setInterval(() => { if (!document.hidden && !$$('dialog[open]').length) render(); }, 60000);
})();
