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

  /* ---------- stan filtrów i sortowania ---------- */
  const params = new URLSearchParams(location.search);
  const state = {
    q: '', date: 'all', free: false,
    scope: params.get('pilne') === '1' ? 'urgent' : params.get('moje') === '1' ? 'mine' : 'all',
    mineTab: params.get('tab') === 'wykonanie' ? 'taken' : 'posted',
    rateMin: null, kmMax: null, paxMin: null, paxMax: null,
    sort: { key: 'dep', dir: 'asc' }, mapMode: 'dep',
  };

  function filtered() {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const q = norm(state.q.trim());
    const base = state.scope !== 'mine' ? store.active() : state.mineTab === 'taken' ? store.taken(me) : store.posted(me);
    let list = base.filter((o) => {
      if (state.scope === 'urgent' && !o.urgent) return false;
      if (state.free && o.status !== 'open') return false;
      if (state.date === 'today' && !(o.dep < startToday + 864e5)) return false;
      if (state.date === 'tomorrow' && !(o.dep >= startToday + 864e5 && o.dep < startToday + 2 * 864e5)) return false;
      if (state.date === 'week' && !(o.dep < now.getTime() + 7 * 864e5)) return false;
      if (state.rateMin != null && o.rate < state.rateMin) return false;
      if (state.kmMax != null && o.km > state.kmMax) return false;
      if (state.paxMin != null && o.pax < state.paxMin) return false;
      if (state.paxMax != null && o.pax > state.paxMax) return false;
      if (q) {
        const st = store.stops(o);
        if (!st.pickups.concat(st.drops, st.end ? [st.end] : []).some((x) => norm(x.label).includes(q))) return false;
      }
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

    const st = store.stops(o);
    const moreChip = (list, key) => {
      const c = el('span', 'tag-stops', t('g.stopsMore', { x: list.length - 1 }));
      const all = list.map((x, i) => (i + 1) + '. ' + x.label).join('; ');
      c.title = t(key, { x: all });
      c.setAttribute('aria-label', t(key, { x: all }));
      return c;
    };
    const meta = [];
    if (o.urgent) { const u = el('span', 'tag-urgent'); u.innerHTML = BOLT; u.appendChild(document.createTextNode(t('g.urgentTag'))); meta.push(u); }
    if (st.pickups.length > 1) meta.push(moreChip(st.pickups, 'g.morePickT'));
    meta.push(el('span', null, t('g.pax', { x: o.pax })));
    const toMeta = [];
    if (st.drops.length > 1) toMeta.push(moreChip(st.drops, 'g.moreDropT'));
    if (st.end) {
      const back = st.end.lat === o.from.lat && st.end.lng === o.from.lng;
      const c = el('span', 'tag-end', back ? t('g.endReturn') : t('g.endTag', { x: st.end.label }));
      c.title = t('g.endTag', { x: st.end.label });
      toMeta.push(c);
    }
    if (o.notes) toMeta.push(el('span', null, o.notes.length > 60 ? o.notes.slice(0, 57) + '…' : o.notes));

    const td = (child, cls) => { const c = el('td', cls); if (child) c.appendChild(child); tr.appendChild(c); return c; };
    td(placeCell(o.from, false, meta));
    td(timeCell(o.dep, true));
    td(placeCell(o.to, true, toMeta));
    td(timeCell(o.arr, false));
    td(el('span', 'km', t('g.km', { x: num(o.km) })), 'num');
    const rate = el('div', 'rate');
    rate.appendChild(el('b', null, zl(o.rate)));
    rate.appendChild(el('span', null, t('g.perKm', { x: num(o.rate / o.km, 1) })));
    td(rate, 'num');

    const acts = el('div', 'acts');
    const own = o.owner === me;
    const expired = o.status === 'expired';
    if (expired) tr.classList.add('is-expired');
    const neg = el('button', 'g-btn g-btn-ghost', t('g.negotiate'));
    neg.type = 'button';
    if (own && !expired) {
      // własne zlecenie: zamiast negocjacji — anulowanie (płatne)
      neg.textContent = t('g.cx.btn');
      neg.className = 'g-btn g-btn-danger';
      neg.addEventListener('click', () => openCancel(o.id));
    } else if (o.status === 'reserved' && o.reservedBy === me) {
      neg.hidden = true;
    } else {
      neg.disabled = own || o.status !== 'open';
      neg.addEventListener('click', () => openNegotiate(o.id));
    }
    const res = el('button', 'g-btn g-btn-primary');
    res.type = 'button';
    if (own && expired) {
      neg.hidden = true;
      res.textContent = t('g.fee.payBtn', { x: zl(store.EXPIRE_FEE) });
      res.addEventListener('click', () => openFee(false));
    } else if (own) { res.textContent = t('g.yours'); res.disabled = true; }
    else if (o.status !== 'open' && o.reservedBy === me) { res.textContent = t('g.reservedMine'); res.disabled = true; res.classList.add('is-mine'); }
    else if (o.status !== 'open') { res.textContent = t('g.reserved'); res.disabled = true; }
    else { res.textContent = t('g.reserve'); res.addEventListener('click', () => openReserve(o.id)); }
    acts.append(neg, res);
    const cell = td(acts);
    const myOffer = (o.offers || []).find((x) => x.by === me);
    if (myOffer && o.status === 'open') cell.appendChild(el('span', 'offer-note', t('g.offerSent', { x: zl(myOffer.rate) })));
    if (!own && o.status === 'reserved' && o.reservedBy === me) cell.appendChild(clientContact(o.owner));
    if (own && expired) cell.appendChild(el('span', 'offer-note is-warn', t('g.fee.rowNote', { x: zl(store.EXPIRE_FEE) })));
    // właściciel widzi propozycje stawek i to, kto zarezerwował
    if (own && o.status !== 'open' && o.reservedBy) cell.appendChild(el('span', 'offer-note', t('g.reservedBy', { x: auth.nameOf(o.reservedBy) })));
    if (own && o.status === 'open' && (o.offers || []).length) {
      const best = Math.max.apply(null, o.offers.map((x) => x.rate));
      cell.appendChild(el('span', 'offer-note', t('g.offersN', { x: o.offers.length, y: zl(best) })));
    }

    tr.addEventListener('mouseenter', () => setHl(o.id, false));
    tr.addEventListener('mouseleave', () => setHl(null, false));
    tr.addEventListener('focusin', () => setHl(o.id, false));
    tr.addEventListener('click', (e) => { if (!e.target.closest('a, button')) focusOnMap(o.id); });
    return tr;
  }

  function clientContact(login) {
    const c = auth.contactOf(login);
    const box = el('div', 'client-note');
    box.appendChild(el('span', null, t('g.mine.client', { x: c.name })));
    const line = el('span', 'cn-links');
    if (c.person) line.appendChild(el('span', null, c.person));
    if (c.phone) { const a = el('a', null, c.phone); a.href = 'tel:' + c.phone.replace(/\s/g, ''); line.appendChild(a); }
    if (c.email) { const a = el('a', null, c.email); a.href = 'mailto:' + c.email; line.appendChild(a); }
    if (line.childNodes.length) box.appendChild(line);
    return box;
  }

  function render() {
    const list = filtered();
    tbody.textContent = '';
    list.forEach((o) => tbody.appendChild(row(o)));
    $('#gl-count').textContent = list.length + ' ' + plural(list.length);
    $('#gl-empty').hidden = list.length > 0;
    $('#g-title span').textContent = t(state.scope === 'urgent' ? 'g.urgentTitle' : state.scope === 'mine' ? 'g.mineTitle' : 'g.title');
    const cnt = store.counts(me);
    $('#urgent-count').textContent = cnt.urgent;
    $('#mine-count').textContent = cnt.mine;
    $('#mt-posted').textContent = cnt.posted;
    $('#mt-taken').textContent = cnt.taken;
    $('#mine-tabs').hidden = state.scope !== 'mine';
    $$('[data-mine-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mineTab === state.mineTab)));
    $('#gl-empty p').textContent = t(state.scope === 'mine' && !hasFilters() ? (state.mineTab === 'taken' ? 'g.emptyTaken' : 'g.emptyMine') : 'g.empty');
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
  // zakres listy (menu): wszystkie zlecenia / pilne przewozy / Twoje zlecenia
  function setScope(scope) {
    state.scope = scope;
    $('#f-urgent').setAttribute('aria-pressed', String(scope === 'urgent'));
    $('.an-list').setAttribute('aria-pressed', String(scope === 'all'));
    $('.an-urgent').setAttribute('aria-pressed', String(scope === 'urgent'));
    $('.an-mine').setAttribute('aria-pressed', String(scope === 'mine'));
    render();
  }
  $$('[data-mine-tab]').forEach((b) => b.addEventListener('click', () => { state.mineTab = b.dataset.mineTab; lastIds = ''; render(); }));
  const hasFilters = () => !!(state.q || state.date !== 'all' || state.free || state.rateMin != null || state.kmMax != null || state.paxMin != null || state.paxMax != null);
  $('#f-urgent').addEventListener('click', () => setScope(state.scope === 'urgent' ? 'all' : 'urgent'));
  $('#f-free').addEventListener('click', (e) => { state.free = !state.free; e.currentTarget.setAttribute('aria-pressed', String(state.free)); render(); });
  const more = $('#f-more'), panel = $('#f-panel');
  more.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) $('#f-rate').focus(); });
  function readNum(id) { const v = $(id).value.trim(); return v === '' ? null : Math.max(0, +v); }
  function syncAdvanced() {
    state.rateMin = readNum('#f-rate'); state.kmMax = readNum('#f-km'); state.paxMin = readNum('#f-pax'); state.paxMax = readNum('#f-pax-max');
    const n = [state.rateMin, state.kmMax, state.paxMin, state.paxMax].filter((v) => v != null).length;
    const b = $('#f-more-count'); b.textContent = n; b.hidden = !n;
    render();
  }
  ['#f-rate', '#f-km', '#f-pax', '#f-pax-max'].forEach((id) => $(id).addEventListener('input', syncAdvanced));
  $('#f-sort').addEventListener('change', (e) => { const [key, dir] = e.target.value.split(':'); state.sort = { key, dir }; render(); });
  function resetFilters(keepScope) {
    state.q = ''; $('#gl-q').value = '';
    state.date = 'all'; $$('[data-date]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.date === 'all')));
    state.free = false; $('#f-free').setAttribute('aria-pressed', 'false');
    ['#f-rate', '#f-km', '#f-pax', '#f-pax-max'].forEach((id) => { $(id).value = ''; });
    state.rateMin = state.kmMax = state.paxMin = state.paxMax = null; $('#f-more-count').hidden = true;
    state.sort = { key: 'dep', dir: 'asc' }; $('#f-sort').value = 'dep:asc';
    setScope(keepScope ? state.scope : 'all');
  }
  $('#f-reset').addEventListener('click', () => resetFilters(true));
  $('#gl-empty-reset').addEventListener('click', () => resetFilters(true));

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
    if (a === 'list') { setScope('all'); if (main.dataset.view === 'map' && narrow.matches) setView('list'); }
    if (a === 'urgent') setScope('urgent');
    if (a === 'mine') setScope('mine');
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
      map.fitBounds(b, { padding: [50, 50], maxZoom: list.length === 1 ? 8 : 11, animate: !reduce() });
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
      const st = store.stops(o);
      const all = st.pickups.concat(st.drops, st.end ? [st.end] : []);
      const shown = state.mapMode === 'dep' ? o.from : o.to;
      const layers = [L.polyline(all.map((x) => [x.lat, x.lng]), { color: css.getPropertyValue('--accent').trim() || '#6B7F42', weight: 3, dashArray: '6 8', opacity: .9 })];
      all.forEach((x, i) => {
        if (x === shown || (x.lat === shown.lat && x.lng === shown.lng)) return;
        const pick = i < st.pickups.length;
        const end = st.end && i === all.length - 1;
        const color = end ? (css.getPropertyValue('--bubble-gold').trim() || '#A8793F') : pick ? (css.getPropertyValue('--bubble-olive').trim() || '#6B7F42') : (css.getPropertyValue('--ln-a').trim() || '#3A1F3D');
        layers.push(L.circleMarker([x.lat, x.lng], { radius: 6, color, weight: 3, fillColor: '#fff', fillOpacity: 1 }));
      });
      routeLayer = L.layerGroup(layers).addTo(map);
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
  ['#rv-dialog', '#ng-dialog', '#cx-dialog', '#fee-dialog'].forEach((sel) => {
    const d = $(sel);
    $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => closeDlg(d)));
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeDlg(d); });
    d.addEventListener('click', (e) => { if (e.target === d) closeDlg(d); });
  });

  function routeSummary(box, o) {
    box.textContent = '';
    const line = (p, cls, letter) => { const l = el('div', 'dr-line'); const pin = el('span', 'cr-pin ' + cls, letter); pin.setAttribute('aria-hidden', 'true'); l.append(pin, el('span', null, p.label)); return l; };
    const st = store.stops(o);
    st.pickups.forEach((p, i) => box.appendChild(line(p, 'cr-pin-a', st.pickups.length > 1 ? 'A' + (i + 1) : 'A')));
    st.drops.forEach((p, i) => box.appendChild(line(p, 'cr-pin-b', st.drops.length > 1 ? 'B' + (i + 1) : 'B')));
    if (st.end) box.appendChild(line(st.end, 'cr-pin-c', 'C'));
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

  /* ---------- anulowanie własnego zlecenia (opłata) ---------- */
  let cxId = null;
  function openCancel(id) {
    const o = store.get(id);
    if (!o || o.owner !== me || (o.status !== 'open' && o.status !== 'reserved')) return;
    cxId = id;
    routeSummary($('#cx-route'), o);
    $('#cx-amount').textContent = zl(store.CANCEL_FEE);
    const rs = $('#cx-reserved');
    rs.hidden = o.status !== 'reserved';
    if (o.status === 'reserved') rs.textContent = t('g.cx.reservedNote', { x: auth.nameOf(o.reservedBy) });
    $('#cx-confirm').textContent = t('g.cx.confirm', { x: zl(store.CANCEL_FEE) });
    openDlg($('#cx-dialog'));
    setTimeout(() => $('#cx-dialog [data-close].call-btn').focus(), 40);
  }
  $('#cx-confirm').addEventListener('click', () => {
    const ok = store.cancel(cxId, me);
    closeDlg($('#cx-dialog'));
    if (!ok) return;
    toast(t('g.cx.done', { x: zl(store.CANCEL_FEE) }));
    render();
  });

  /* ---------- nieopłacona opłata za niepodjęte zlecenie: blokada nowych zleceń ---------- */
  let feeThenCreate = false;
  function openFee(fromCreate) {
    const unpaid = store.unpaidFees(me);
    if (!unpaid.length) { if (fromCreate) openCreate(); return; }
    feeThenCreate = fromCreate;
    $('#fee-sub').textContent = t(fromCreate ? 'g.fee.subBlock' : 'g.fee.sub');
    const box = $('#fee-box');
    box.textContent = '';
    unpaid.forEach((f) => {
      const r = el('div', 'db-row fee-row');
      const left = el('span');
      left.appendChild(el('b', null, f.route));
      left.appendChild(el('small', null, t('g.fee.depLabel', { x: dayLabel(f.dep).toLocaleLowerCase(locale()) + ' ' + timeLabel(f.dep) })));
      r.append(left, el('b', null, zl(f.amount)));
      box.appendChild(r);
    });
    const total = unpaid.reduce((sum, f) => sum + f.amount, 0);
    if (unpaid.length > 1) {
      const tr = el('div', 'db-row db-total');
      tr.append(el('span', null, t('g.fee.total')), el('b', null, zl(total)));
      box.appendChild(tr);
    }
    box.appendChild(el('p', 'db-note', t('g.fee.note')));
    $('#fee-pay').textContent = t('g.fee.payBtn', { x: zl(total) });
    openDlg($('#fee-dialog'));
    setTimeout(() => $('#fee-pay').focus(), 40);
  }
  $('#fee-pay').addEventListener('click', () => {
    store.unpaidFees(me).forEach((f) => store.payFee(f.id, me));
    closeDlg($('#fee-dialog'));
    toast(t('g.fee.done'));
    render();
    if (feeThenCreate) setTimeout(openCreate, 260);
  });

  /* ---------- nowe zlecenie: kilka miejsc odbioru (A1, A2…), kilka docelowych (B1, B2…)
     i opcjonalny koniec trasy (C) — np. powrót na pusto albo wycieczka objazdowa ---------- */
  const cr = {
    dlg: $('#cr-dialog'), form: $('#cr-form'), dep: $('#cr-dep'), arr: $('#cr-arr'),
    pax: $('#cr-pax'), km: $('#cr-km'), rate: $('#cr-rate'), urgent: $('#cr-urgent'), notes: $('#cr-notes'),
    hint: $('#cr-hint'), q: $('#cr-q'), results: $('#cr-results'),
    list: { A: $('#cr-list-a'), B: $('#cr-list-b'), C: $('#cr-list-c') }, empty: { A: $('#cr-empty-a'), B: $('#cr-empty-b') }, err: { A: $('#cr-a-err'), B: $('#cr-b-err'), C: $('#cr-c-err') },
  };
  const MAX_STOPS = 8;
  const XS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
  let crMap = null, crLine = null, mode = 'A';
  const pts = { A: [], B: [], C: [] }; // { lat, lng, label, marker, input, pin, li }; C — najwyżej jeden punkt
  const mkCls = (w) => (w === 'A' ? 'mk-a' : w === 'B' ? 'mk-b' : 'mk-c');
  let kmTouched = false, arrAuto = false, durMin = null, crDirty = false;

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
  function listErr(which, key) { const e = cr.err[which]; e.textContent = t(key); e.dataset.key = key; e.hidden = false; }
  function clearListErr(which) { const e = cr.err[which]; e.hidden = true; e.dataset.key = ''; }

  function setMode(m) {
    mode = m;
    $$('[data-cr-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.crMode === m)));
    updateSteps();
  }
  $$('[data-cr-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.crMode)));
  // „+ Dodaj miejsce…” dokłada kolejne puste pole (A2, A3…), które uzupełnia się wyszukiwarką albo kliknięciem na mapie
  $$('[data-add]', cr.form).forEach((b) => b.addEventListener('click', () => { const p = addRow(b.dataset.add); if (p) p.input.focus(); }));

  const located = (w) => pts[w].filter((p) => p.lat != null);
  let activeRow = null;

  function updateSteps() {
    const a = located('A').length, b = located('B').length;
    cr.hint.textContent = t(!a ? 'g.cr.hintA' : !b ? 'g.cr.hintB' : mode === 'C' ? 'g.cr.hintC' : mode === 'A' ? 'g.cr.hintMoreA' : 'g.cr.hintMoreB');
    ['A', 'B'].forEach((w) => { cr.empty[w].hidden = pts[w].length > 0; });
    $('#cr-return').disabled = !a;
  }
  function renumber() {
    ['A', 'B', 'C'].forEach((w) => pts[w].forEach((p, i) => {
      const code = w === 'C' ? 'C' : w + (i + 1);
      p.pin.textContent = code;
      if (p.marker) p.marker.setIcon(icon(mkCls(w), code));
      p.input.setAttribute('aria-label', w === 'C' ? t('g.cr.endN') : t(w === 'A' ? 'g.cr.pickN' : 'g.cr.dropN', { x: i + 1 }));
      p.input.placeholder = t('g.cr.rowPh');
    }));
  }

  // Adres z punktu (Nominatim / OpenStreetMap): „miejscowość, ulica numer”
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

  // Podpowiedzi adresów (Nominatim) pod polem tekstowym; onPick({ lat, lng, label })
  let searchSeq = 0;
  function makeSearch(input, ul, onPick) {
    const uid = 'cr-s' + (++searchSeq);
    let timer, results = [], active = -1;
    ul.id = ul.id || uid;
    ul.setAttribute('role', 'listbox');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', ul.id);
    function show(list, empty) {
      ul.textContent = '';
      results = list; active = -1;
      input.removeAttribute('aria-activedescendant');
      if (!list.length && !empty) { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      if (!list.length) ul.appendChild(el('li', 'is-empty', t('g.cr.noResults')));
      list.forEach((r, i) => {
        const li = el('li', null, r.label);
        li.id = uid + '-' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
        li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
        ul.appendChild(li);
      });
      ul.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function pick(i) { const r = results[i]; if (!r) return; show([], false); onPick(r); }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { show([], false); return; }
      timer = setTimeout(async () => {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=pl,de,cz,sk,lt,ua,at,hu&accept-language=${root.lang === 'en' ? 'en' : 'pl'}&q=${encodeURIComponent(q)}`);
          const j = await r.json();
          if (input.value.trim() !== q || document.activeElement !== input) return;
          show(j.map((x) => ({ lat: +x.lat, lng: +x.lon, label: shortLabel(x) || x.display_name })), true);
        } catch (e) { show([], true); }
      }, 450);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (!ul.hidden && results.length) pick(active < 0 ? 0 : active); return; }
      if (ul.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!results.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        $$('li[role="option"]', ul).forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
        input.setAttribute('aria-activedescendant', uid + '-' + active);
      } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); show([], false); }
    });
    input.addEventListener('blur', () => setTimeout(() => show([], false), 150));
  }

  // Nowy (pusty) wiersz na liście A albo B
  function addRow(which) {
    if (which === 'C' && pts.C.length) return pts.C[0]; // koniec trasy jest jeden
    if (pts[which].length >= MAX_STOPS) { toast(t('g.cr.max', { x: MAX_STOPS })); return null; }
    const p = { which, lat: null, lng: null, label: '', marker: null };
    const li = el('li', 'stop-row is-empty');
    const pin = el('span', 'cr-pin cr-pin-' + which.toLowerCase());
    pin.setAttribute('aria-hidden', 'true');
    const field = el('div', 'stop-field');
    const input = el('input');
    input.type = 'text'; input.autocomplete = 'off'; input.maxLength = 120;
    const ul = el('ul', 'cr-results'); ul.hidden = true;
    field.append(input, ul);
    input.addEventListener('focus', () => { activeRow = p; if (mode !== which) setMode(which); });
    input.addEventListener('input', () => { p.label = input.value; crDirty = true; clearListErr(which); });
    makeSearch(input, ul, (r) => { crMap.setView([r.lat, r.lng], Math.max(crMap.getZoom(), 12)); locate(p, L.latLng(r.lat, r.lng), r.label); });
    const rm = el('button', 'stop-rm');
    rm.type = 'button'; rm.innerHTML = XS; rm.setAttribute('aria-label', t('g.cr.remove'));
    rm.addEventListener('click', () => removePoint(which, p));
    li.append(pin, field, rm);
    cr.list[which].appendChild(li);
    Object.assign(p, { pin, input, li });
    pts[which].push(p);
    renumber();
    updateSteps();
    return p;
  }

  // Ustawia współrzędne wiersza: pinezka na mapie (przeciągana) + nazwa miejsca
  function locate(p, latlng, label) {
    p.lat = latlng.lat; p.lng = latlng.lng;
    if (p.marker) p.marker.setLatLng(latlng);
    else {
      p.marker = L.marker(latlng, { icon: icon(mkCls(p.which), p.which), draggable: true, keyboard: true }).addTo(crMap);
      p.marker.on('dragend', async () => {
        const ll = p.marker.getLatLng();
        p.lat = ll.lat; p.lng = ll.lng;
        p.input.value = t('g.cr.locating');
        const lb = await reverse(ll.lat, ll.lng);
        p.label = lb; p.input.value = lb;
        updateRoute();
      });
    }
    p.li.classList.remove('is-empty');
    crDirty = true;
    clearListErr(p.which);
    if (label) { p.label = label; p.input.value = label; }
    else {
      p.input.value = t('g.cr.locating');
      const at = latlng.lat;
      reverse(latlng.lat, latlng.lng).then((lb) => { if (pts[p.which].includes(p) && p.lat === at) { p.label = lb; p.input.value = lb; } });
    }
    // po pierwszym miejscu odbioru kolejne kliknięcie na mapie trafia do miejsc docelowych
    if (p.which === 'A' && located('A').length === 1 && !located('B').length && !pts.A.some((x) => x.lat == null)) setMode('B');
    renumber();
    updateSteps();
    updateRoute();
  }

  // Kliknięcie na mapie / wynik wyszukiwarki nad mapą: wypełnia aktywny pusty wiersz, inaczej pierwszy pusty, inaczej dodaje nowy
  function placeAt(which, latlng, label) {
    // koniec trasy (C) jest jeden — kolejne kliknięcie przenosi go w nowe miejsce
    let p = which === 'C' ? pts.C[0]
      : activeRow && activeRow.which === which && activeRow.lat == null && pts[which].includes(activeRow) ? activeRow : pts[which].find((x) => x.lat == null);
    if (!p) p = addRow(which);
    if (!p) return;
    locate(p, latlng, label);
  }

  function removePoint(which, p) {
    if (crMap && p.marker) crMap.removeLayer(p.marker);
    p.li.remove();
    pts[which] = pts[which].filter((x) => x !== p);
    if (activeRow === p) activeRow = null;
    crDirty = true;
    renumber(); updateSteps(); updateRoute();
  }
  function clearPoints() {
    ['A', 'B', 'C'].forEach((w) => { pts[w].forEach((p) => { if (crMap && p.marker) crMap.removeLayer(p.marker); p.li.remove(); }); pts[w] = []; });
    if (crLine && crMap) crMap.removeLayer(crLine);
    crLine = null; durMin = null; activeRow = null;
    if (!kmTouched) cr.km.value = '';
    addRow('A'); addRow('B');
    setMode('A');
    updateRateHelp();
  }
  $('#cr-clear').addEventListener('click', clearPoints);
  // „Powrót do miejsca odbioru A1” — koniec trasy w tym samym miejscu co start
  $('#cr-return').addEventListener('click', () => {
    const a1 = located('A')[0];
    if (!a1) return;
    placeAt('C', L.latLng(a1.lat, a1.lng), a1.input.value.trim() || a1.label);
  });

  // Trasa drogowa (OSRM, OpenStreetMap) przez wszystkie punkty: odbiory, cele, potem koniec trasy
  let routeReq = 0;
  async function updateRoute() {
    if (!crMap) return;
    const all = located('A').concat(located('B'), located('C'));
    if (crLine) { crMap.removeLayer(crLine); crLine = null; }
    // jeden punkt: tylko przesuń mapę (bez przybliżania — łatwiej kliknąć kolejne miasto); kilka: pokaż wszystkie
    if (all.length === 1) crMap.panTo([all[0].lat, all[0].lng]);
    else if (all.length > 1) crMap.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])), { padding: [50, 50], maxZoom: 12 });
    if (!located('A').length || !located('B').length) { durMin = null; return; }
    const id = ++routeReq;
    const color = getComputedStyle(root).getPropertyValue('--accent').trim() || '#6B7F42';
    crLine = L.polyline(all.map((p) => [p.lat, p.lng]), { color, weight: 3, dashArray: '6 8' }).addTo(crMap);
    let km, dur, approx = false;
    try {
      const coords = all.map((p) => `${p.lng},${p.lat}`).join(';');
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`);
      const j = await r.json();
      if (id !== routeReq) return;
      const route = j.routes && j.routes[0];
      if (!route) throw new Error('no route');
      km = Math.max(1, Math.round(route.distance / 1000));
      dur = Math.round(route.duration / 60);
      if (crLine) crMap.removeLayer(crLine);
      crLine = L.geoJSON(route.geometry, { style: { color, weight: 4, opacity: .85 } }).addTo(crMap);
    } catch (e) {
      if (id !== routeReq) return;
      km = Math.max(1, Math.round(store.pathKm(all) * 1.25));
      dur = Math.round(km / 70 * 60);
      approx = true;
    }
    durMin = dur;
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
  cr.pax.addEventListener('input', () => crClear(cr.pax));
  cr.form.addEventListener('input', () => { crDirty = true; });

  // wyszukiwarka adresu nad mapą — wynik trafia na listę wybraną przełącznikiem (odbiór / cel)
  makeSearch(cr.q, cr.results, (r) => {
    cr.q.value = '';
    crMap.setView([r.lat, r.lng], 14);
    placeAt(mode, L.latLng(r.lat, r.lng), r.label);
  });

  function resetCreate() {
    cr.form.reset(); clearPoints();
    kmTouched = false; arrAuto = false; crDirty = false;
    $$('.field-err', cr.form).forEach((e) => { e.hidden = true; e.dataset.key = ''; });
    $$('[aria-invalid]', cr.form).forEach((i) => i.removeAttribute('aria-invalid'));
    $('#cr-km-help').textContent = t('g.cr.kmHelp');
  }
  function openCreate() {
    if (store.unpaidFees(me).length) { openFee(true); return; }
    if (!hasMap) { toast('Mapa jest chwilowo niedostępna.'); return; }
    cr.dep.min = toLocalInput(Date.now());
    cr.arr.min = toLocalInput(Date.now());
    openDlg(cr.dlg);
    setTimeout(() => {
      if (!crMap) {
        crMap = L.map('cr-map', { zoomControl: true }).setView([52.1, 19.4], 6);
        L.tileLayer(TILE, { maxZoom: 19, attribution: ATTR }).addTo(crMap);
        crMap.on('click', (e) => placeAt(mode, e.latlng));
      }
      crMap.invalidateSize();
      if (!pts.A.length && !pts.B.length) clearPoints(); else updateSteps();
      cr.q.focus();
    }, 80);
  }
  function closeCreate(force) {
    if (!force && crDirty && !confirm(t('g.cr.discard'))) return;
    closeDlg(cr.dlg);
  }
  $$('[data-close]', cr.dlg).forEach((b) => b.addEventListener('click', () => closeCreate(false)));
  cr.dlg.addEventListener('cancel', (e) => { e.preventDefault(); if ($$('.cr-results:not([hidden])', cr.dlg).length) return; closeCreate(false); });
  // kliknięcie w tło zamyka okno bez pytania — punkty i pola zostają do ponownego otwarcia.
  // Liczy się tylko kliknięcie zaczęte na tle (przeciągnięcie pinezki poza okno go nie zamyka).
  let crDownOnBackdrop = false;
  cr.dlg.addEventListener('pointerdown', (e) => { crDownOnBackdrop = e.target === cr.dlg; });
  cr.dlg.addEventListener('click', (e) => { if (e.target === cr.dlg && crDownOnBackdrop) closeCreate(true); });

  cr.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errs = [];
    const fail = (input, key) => { crErr(input, key); errs.push(input); };
    const badLabel = (p) => !p.input.value.trim() || p.input.value === t('g.cr.locating');
    const unpicked = (p) => p.lat == null && p.input.value.trim();
    ['A', 'B'].forEach((w) => {
      const firstInput = () => (pts[w][0] ? pts[w][0].input : cr.list[w].parentNode.querySelector('[data-add]'));
      if (pts[w].some(unpicked)) { listErr(w, 'g.e.pick'); errs.push(pts[w].find(unpicked).input); }
      else if (!located(w).length) { listErr(w, w === 'A' ? 'g.e.from' : 'g.e.to'); errs.push(firstInput()); }
      else if (located(w).some(badLabel)) { listErr(w, 'g.e.label'); errs.push(located(w).find(badLabel).input); }
    });
    // koniec trasy jest opcjonalny, ale wpisany adres musi być wybrany z podpowiedzi albo z mapy
    if (pts.C.some(unpicked)) { listErr('C', 'g.e.pick'); errs.push(pts.C[0].input); }
    else if (located('C').some(badLabel)) { listErr('C', 'g.e.label'); errs.push(pts.C[0].input); }
    const dep = fromInput(cr.dep.value), arr = fromInput(cr.arr.value);
    if (isNaN(dep) || dep < Date.now() - 6e4) fail(cr.dep, 'g.e.dep');
    if (isNaN(arr) || !(arr > dep)) fail(cr.arr, 'g.e.arr');
    const pax = +cr.pax.value; if (!(pax >= 1 && pax <= 100 && Number.isInteger(pax))) fail(cr.pax, 'g.e.pax');
    const km = +cr.km.value; if (!(km > 0)) fail(cr.km, 'g.e.km');
    const rate = +cr.rate.value; if (!(rate > 0)) fail(cr.rate, 'g.e.rate');
    if (errs.length) { errs[0].focus(); return; }
    if (store.unpaidFees(me).length) { closeCreate(true); openFee(true); return; }
    const plain = (p) => ({ label: p.input.value.trim(), lat: p.lat, lng: p.lng });
    const o = store.add({
      pickups: located('A').map(plain), drops: located('B').map(plain), end: located('C').length ? plain(located('C')[0]) : null,
      dep, arr, km: Math.round(km), rate: Math.round(rate), pax, urgent: cr.urgent.checked, notes: cr.notes.value.trim(),
    }, me);
    crDirty = false;
    closeCreate(true);
    resetCreate();
    // pokaż nowe zlecenie w „Twoich zleceniach”, bez filtrów, które mogłyby je ukryć
    resetFilters();
    state.mineTab = 'posted';
    setScope('mine');
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
    if (crMap) renumber();
  });

  /* ---------- start ---------- */
  renderUser();
  if (layout.split) setSplit(layout.split);
  setView(narrow.matches ? 'list' : (layout.view || 'split'));
  setScope(state.scope);
  updateSteps();
  if (params.get('nowe') === '1') setTimeout(openCreate, 250);
  if (params.has('nowe') || params.has('pilne') || params.has('moje') || params.has('tab')) history.replaceState(null, '', location.pathname);
  // terminy względne („za 3 godziny”) odświeżamy co minutę
  setInterval(() => { if (!document.hidden && !$$('dialog[open]').length) render(); }, 60000);
})();
