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
  const isAdmin = session.role === 'admin'; // administrator widzi kontrahentów i może usuwać zlecenia, nie rezerwuje

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
    const chip = $('.user-chip');
    if (isAdmin) {
      const nm = session.name || me;
      $('#uc-name').textContent = nm;
      $('#uc-avatar').textContent = 'A';
      chip.dataset.plan = 'admin';
      chip.href = 'admin.html';
      $('#uc-plan').textContent = t('g.plan.admin');
      chip.title = nm + ' · ' + $('#uc-plan').textContent;
      return;
    }
    const plan = auth.getPlan(me);
    const name = session.name || me;
    $('#uc-name').textContent = name;
    $('#uc-avatar').textContent = name.replace(/[^\p{L}\d ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || me.slice(0, 2).toUpperCase();
    const kind = !plan.chosen ? 'need' : plan.plan === 'subscription' ? 'sub' : plan.free ? 'free' : 'comm';
    chip.dataset.plan = kind;
    $('#uc-plan').textContent = t({ need: 'g.plan.need', sub: 'g.plan.sub', free: 'g.plan.free', comm: 'g.plan.comm' }[kind]);
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
    // „Twoje zlecenia”: najpierw nadchodzące, zakończone kursy na końcu (od najnowszego)
    if (state.scope === 'mine') {
      const nowMs = now.getTime();
      const done = list.filter((o) => o.arr <= nowMs).sort((a, b) => b.dep - a.dep);
      list = list.filter((o) => o.arr > nowMs).concat(done);
    }
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
  function timeCell(ms, withRel, endMs) {
    const w = el('div', 'tm');
    w.appendChild(el('span', 'tm-day', dayLabel(ms)));
    const time = el('time', 'tm-time', timeLabel(ms));
    time.dateTime = new Date(ms).toISOString();
    w.appendChild(time);
    if (withRel) {
      // kurs już się skończył (przyjazd minął) — „zakończony”, w trakcie — „w trasie”
      const over = endMs != null && endMs <= Date.now();
      const r = el('span', 'tm-rel' + (over ? ' is-over' : ms - Date.now() < 6 * 36e5 ? ' is-soon' : ''), over ? t('g.finished') : relLabel(ms));
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
    const crewTag = crewChip(o);
    if (crewTag) meta.push(crewTag);
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
    td(timeCell(o.dep, true, o.arr));
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
    const finished = store.state(o) === 'done';
    if (finished) tr.classList.add('is-finished');
    if (expired) tr.classList.add('is-expired');
    const neg = el('button', 'g-btn g-btn-ghost is-neg', t('g.negotiate'));
    neg.type = 'button';
    if (finished) {
      neg.hidden = true;
    } else if (own && !expired) {
      // własne zlecenie: zamiast negocjacji — anulowanie (płatne)
      neg.textContent = t('g.cx.btn');
      neg.className = 'g-btn g-btn-danger is-neg';
      neg.addEventListener('click', () => openCancel(o.id));
    } else if (o.status === 'reserved' && o.reservedBy === me) {
      neg.hidden = true;
    } else {
      neg.disabled = own || o.status !== 'open';
      neg.addEventListener('click', () => openNegotiate(o.id));
    }
    const res = el('button', 'g-btn g-btn-primary is-res');
    res.type = 'button';
    if (isAdmin && !own) {
      // administrator: bez rezerwacji i negocjacji — tylko usunięcie zlecenia (bez opłat dla zlecającego)
      neg.hidden = true;
      res.textContent = t('g.rm.btn');
      res.className = 'g-btn g-btn-danger is-res';
      res.addEventListener('click', () => openRemove(o.id));
    } else if (own && expired) {
      neg.hidden = true;
      res.textContent = t('g.fee.payBtn', { x: zl(store.EXPIRE_FEE) });
      res.addEventListener('click', () => openFee(false));
    } else if (finished && (own || o.reservedBy === me)) { res.textContent = t('g.doneTrip'); res.disabled = true; res.classList.add('is-mine'); }
    else if (own) { res.textContent = t('g.yours'); res.disabled = true; }
    else if (o.status !== 'open' && o.reservedBy === me) { res.textContent = t('g.reservedMine'); res.disabled = true; res.classList.add('is-mine'); }
    else if (o.status !== 'open') { res.textContent = t('g.reserved'); res.disabled = true; }
    else { res.textContent = t('g.reserve'); res.addEventListener('click', () => openReserve(o.id)); }
    acts.append(neg, res);
    // archiwizacja — tylko w „Twoich zleceniach”; zlecenie zostaje w historii w panelu klienta
    if (state.scope === 'mine' && store.canArchive(o, me)) {
      const ar = el('button', 'ib arch-btn');
      ar.type = 'button';
      ar.innerHTML = ICON_ARCH;
      ar.title = t('g.ar.btn');
      ar.setAttribute('aria-label', t('g.ar.btn'));
      ar.addEventListener('click', (e) => { e.stopPropagation(); openArchive(o.id); });
      acts.appendChild(ar);
    }
    const cell = td(acts);
    // kontrahent: administrator widzi zlecającego przy każdym zleceniu; pozostali — dopiero
    // w „Twoich zleceniach”: przewoźnik po rezerwacji widzi zleceniodawcę, zlecający — przewoźnika
    const inMine = state.scope === 'mine';
    // w jednej linii z przyciskami, żeby wiersz nie rósł w pionie
    const docFor = o.status === 'reserved' && o.reservedBy ? o : null; // potwierdzenie zlecenia — po rezerwacji
    if (isAdmin && !own) acts.prepend(party(o.owner, 'g.party.owner', docFor));
    else if (inMine && !own && o.status === 'reserved' && o.reservedBy === me) acts.prepend(party(o.owner, 'g.party.client', docFor));
    else if (inMine && own && o.status !== 'open' && o.reservedBy) acts.prepend(party(o.reservedBy, 'g.party.carrier', docFor));
    if (isAdmin && o.status !== 'open' && o.reservedBy) cell.appendChild(el('span', 'offer-note', t('g.reservedBy', { x: auth.nameOf(o.reservedBy) })));
    const myOffer = (o.offers || []).find((x) => x.by === me);
    if (myOffer && o.status === 'open') cell.appendChild(el('span', 'offer-note', t('g.offerSent', { x: zl(myOffer.rate) })));
    if (own && expired) cell.appendChild(el('span', 'offer-note is-warn', t('g.fee.rowNote', { x: zl(store.EXPIRE_FEE) })));
    // poza „Twoimi zleceniami” zlecający widzi tylko, że kurs jest zarezerwowany
    if (own && !inMine && o.status !== 'open' && o.reservedBy) cell.appendChild(el('span', 'offer-note', t('g.reserved')));
    if (own && o.status === 'open' && (o.offers || []).length) {
      // propozycje stawek — przycisk otwiera listę z akceptacją / odrzuceniem
      const best = Math.min.apply(null, o.offers.map((x) => x.rate));
      const ob = el('button', 'offer-note offer-open', t('g.offersN', { x: o.offers.length, y: zl(best) }));
      ob.type = 'button';
      ob.setAttribute('aria-haspopup', 'dialog');
      ob.addEventListener('click', (e) => { e.stopPropagation(); openOffers(o.id); });
      cell.appendChild(ob);
    }

    tr.addEventListener('mouseenter', () => setHl(o.id, false));
    tr.addEventListener('mouseleave', () => setHl(null, false));
    tr.addEventListener('focusin', () => setHl(o.id, false));
    tr.addEventListener('click', (e) => { if (!e.target.closest('a, button')) selectOrder(o.id); });
    if (o.id === selId) tr.classList.add('is-selected');
    return tr;
  }

  /* ---------- kontrahent: nazwa widoczna od razu, telefony w dymku ---------- */
  const ICON_PHONE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>';
  const ICON_ALARM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path><path d="M3 7.5 5 6M21 7.5 19 6"></path></svg>';
  const fmtPhone = (p) => {
    const m = String(p || '').match(/^\+48(\d{9})$/);
    if (m) return '+48 ' + m[1].replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    const n = String(p || '').match(/^\+(\d{2,3})(\d+)$/);
    return n ? '+' + n[1] + ' ' + n[2].replace(/(\d{3})(?=\d)/g, '$1 ') : (p || '');
  };
  // „SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ” → „Sp. z o.o.” itd. — krótsza nazwa w wierszu (pełna w podpowiedzi)
  const shortName = (n) => String(n || '')
    .replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/gi, 'Sp. z o.o.')
    .replace(/SPÓŁKA KOMANDYTOWO-AKCYJNA/gi, 'S.K.A.')
    .replace(/SPÓŁKA KOMANDYTOWA/gi, 'Sp.k.')
    .replace(/SPÓŁKA AKCYJNA/gi, 'S.A.')
    .replace(/SPÓŁKA JAWNA/gi, 'Sp.j.')
    .replace(/\s+/g, ' ').trim();
  const ICON_ARCH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1.5"></rect><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"></path></svg>';
  const ICON_DOC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path></svg>';
  function party(login, labelKey, docOrder) {
    const c = auth.contactOf(login);
    const box = el('div', 'party');
    const txt = el('span', 'party-text');
    txt.title = c.name;
    txt.appendChild(el('small', null, t(labelKey)));
    txt.appendChild(el('b', null, shortName(c.name)));
    box.appendChild(txt);
    const ic = el('span', 'party-ic');
    [['phone', ICON_PHONE, 'g.ph.contact'], ['alarmPhone', ICON_ALARM, 'g.ph.alarm']].forEach(([k, svg, key]) => {
      if (!c[k]) return;
      const b = el('button', 'ib party-btn' + (k === 'alarmPhone' ? ' is-alarm' : ''));
      b.type = 'button';
      b.innerHTML = svg;
      b.setAttribute('aria-label', t(key) + ': ' + c.name);
      b.title = t(key);
      b.setAttribute('aria-haspopup', 'dialog');
      b.addEventListener('click', (e) => { e.stopPropagation(); openPhone(b, login, k); });
      ic.appendChild(b);
    });
    if (docOrder) {
      const b = el('button', 'ib party-btn is-doc');
      b.type = 'button';
      b.innerHTML = ICON_DOC;
      b.setAttribute('aria-label', t('g.doc.btn'));
      b.title = t('g.doc.btn');
      b.addEventListener('click', (e) => { e.stopPropagation(); openDoc(docOrder.id); });
      ic.appendChild(b);
    }
    if (ic.childNodes.length) box.appendChild(ic);
    return box;
  }

  // dymek z numerem — wygląd okienka „Zadzwoń” z menu
  const bub = el('div', 'call-panel phone-bub');
  bub.id = 'phone-bub';
  bub.setAttribute('role', 'dialog');
  bub.hidden = true;
  document.body.appendChild(bub);
  let bubFrom = null;
  function closePhone() { if (bub.hidden) return; bub.hidden = true; if (bubFrom) bubFrom.setAttribute('aria-expanded', 'false'); bubFrom = null; }
  function openPhone(btn, login, which) {
    if (bubFrom === btn) { closePhone(); return; }
    closePhone();
    const c = auth.contactOf(login);
    const main = c[which], other = which === 'phone' ? c.alarmPhone : c.phone;
    bub.textContent = '';
    const x = el('button', 'call-x'); x.type = 'button'; x.setAttribute('aria-label', t('call.close'));
    x.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
    x.addEventListener('click', closePhone);
    const who = el('div', 'call-who');
    const initials = (c.person || c.name).replace(/[^\p{L} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const av = el('span', 'call-avatar', initials || '?'); av.setAttribute('aria-hidden', 'true');
    const wt = el('div');
    wt.appendChild(el('p', 'call-label', t('call.label')));
    const h = el('h2', 'call-name', c.person || c.name); h.id = 'phone-bub-name';
    wt.appendChild(h);
    wt.appendChild(el('p', 'bub-company', shortName(c.name)));
    who.append(av, wt);
    bub.setAttribute('aria-labelledby', h.id);
    const lab = el('p', 'call-label bub-kind', t(which === 'phone' ? 'g.ph.contact' : 'g.ph.alarm'));
    const num = el('a', 'call-num', fmtPhone(main)); num.href = 'tel:' + main; num.setAttribute('data-direct', '');
    const row = el('div', 'call-row');
    const call = el('a', 'call-btn call-btn-primary'); call.href = 'tel:' + main; call.setAttribute('data-direct', '');
    call.innerHTML = ICON_PHONE; call.appendChild(el('span', null, t('call.btn')));
    const copy = el('button', 'call-btn call-btn-ghost'); copy.type = 'button';
    copy.appendChild(el('span', null, t('call.copy')));
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(fmtPhone(main)); } catch (err) {}
      copy.firstChild.textContent = t('call.copied');
      setTimeout(() => { copy.firstChild.textContent = t('call.copy'); }, 2000);
    });
    row.append(call, copy);
    bub.append(x, who, lab, num, row);
    if (other && other !== main) {
      const o2 = el('p', 'bub-other');
      o2.appendChild(el('span', null, t(which === 'phone' ? 'g.ph.alarm' : 'g.ph.contact') + ': '));
      const a2 = el('a', null, fmtPhone(other)); a2.href = 'tel:' + other; a2.setAttribute('data-direct', '');
      o2.appendChild(a2);
      bub.appendChild(o2);
    }
    bub.hidden = false;
    bubFrom = btn; btn.setAttribute('aria-expanded', 'true');
    // pozycja: pod ikoną, w granicach ekranu (na telefonie — przyklejony do dołu)
    if (!matchMedia('(max-width: 640px)').matches) {
      const r = btn.getBoundingClientRect(), w = bub.offsetWidth, hh = bub.offsetHeight;
      let left = Math.min(Math.max(12, r.right - w), innerWidth - w - 12);
      let top = r.bottom + 10;
      if (top + hh > innerHeight - 12) top = Math.max(12, r.top - hh - 10);
      bub.style.left = left + 'px'; bub.style.top = top + 'px';
    } else { bub.style.left = ''; bub.style.top = ''; }
    setTimeout(() => call.focus(), 20);
  }
  document.addEventListener('pointerdown', (e) => { if (!bub.hidden && !bub.contains(e.target) && !(bubFrom && bubFrom.contains(e.target))) closePhone(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bub.hidden) { const b = bubFrom; closePhone(); if (b) b.focus(); } });
  $('#gl-scroll').addEventListener('scroll', closePhone, { passive: true });
  addEventListener('resize', closePhone);

  /* Tabela czy karty: karty, gdy tabela nie mieści się w szerokości listy (zależy od kolumn przycisków,
   * więc zamiast stałego progu mierzymy — także po zmianie szerokości listy i okna) */
  const paneList = $('#pane-list');
  function fitTable() {
    const scroll = $('#gl-scroll'), tbl = $('.gl-table');
    paneList.classList.remove('is-cards');
    if (tbl.scrollWidth > scroll.clientWidth + 1) paneList.classList.add('is-cards');
  }
  let fitW = 0;
  new ResizeObserver(() => { const w = paneList.clientWidth; if (w !== fitW) { fitW = w; fitTable(); } }).observe(paneList);

  function render() {
    const list = filtered();
    tbody.textContent = '';
    list.forEach((o) => tbody.appendChild(row(o)));
    // stałe kolumny przycisków: miejsce na kontrahenta i archiwum, jeśli występują w którymkolwiek wierszu
    const tbl = $('.gl-table');
    tbl.dataset.party = $('.acts .party', tbody) ? '1' : '';
    tbl.dataset.arch = $('.acts .arch-btn', tbody) ? '1' : '';
    fitTable();
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
    focusedId = null; routeSeq++;
    map.getContainer().classList.remove('is-focus');
    if (hlId && !list.some((o) => o.id === hlId)) hlId = null;
    list.forEach((o) => {
      const p = state.mapMode === 'dep' ? o.from : o.to;
      const cls = (state.mapMode === 'dep' ? 'mk-dep' : 'mk-arr') + (o.urgent ? ' mk-urgent' : '');
      const m = L.marker([p.lat, p.lng], { icon: icon(cls, o.urgent ? '!' : ''), title: p.label, alt: p.label, riseOnHover: true });
      m.bindPopup(() => popupFor(o), { closeButton: true, autoPanPadding: [30, 30] });
      m.on('mouseover', () => setHl(o.id));
      m.on('mouseout', () => setHl(null));
      m.on('click', () => { const was = selId === o.id; selectOrder(o.id); if (!was) showRow(o.id, true); });
      m.addTo(layerGroup);
      markers.set(o.id, m);
    });
    if (refit && list.length) {
      const b = L.latLngBounds(list.map((o) => { const p = state.mapMode === 'dep' ? o.from : o.to; return [p.lat, p.lng]; }));
      map.fitBounds(b, { padding: [50, 50], maxZoom: list.length === 1 ? 8 : 11, animate: !reduce() });
    }
    // po odświeżeniu listy wracamy do zaznaczonego / najechanego zlecenia (bez ruchu mapy)
    if (selId && !list.some((o) => o.id === selId)) selId = null;
    if (selId || hlId) setTimeout(() => mapFocus(selId || hlId), 0);
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
    hlId = id;
    if (id) {
      const r = $(`.order[data-id="${id}"]`); if (r) r.classList.add('is-hl');
      const m = markers.get(id); const e = m && m.getElement();
      if (e) { e.classList.add('is-hl-wrap'); const mk = $('.mk', e); if (mk) mk.classList.add('is-hl'); }
    }
    // mapa reaguje z krótkim opóźnieniem — przy szybkim przesuwaniu kursora po liście nic nie miga;
    // zaznaczone (kliknięte) zlecenie ma pierwszeństwo przed najechanym
    if (selId) return;
    if (skipHoverId && id !== skipHoverId) skipHoverId = null;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => mapFocus(hlId && hlId !== skipHoverId ? hlId : null), id ? 90 : 160);
  }

  /* ---------- zaznaczenie (kliknięcie): przybliżenie do trasy; ponowne kliknięcie / Esc — wszystkie zlecenia ---------- */
  let selId = null, skipHoverId = null;
  function markSelected() { $$('.order.is-selected').forEach((r) => r.classList.remove('is-selected')); if (selId) { const r = $(`.order[data-id="${selId}"]`); if (r) r.classList.add('is-selected'); } }
  function selectOrder(id) {
    clearTimeout(focusTimer);
    if (selId === id) { deselect(); return; }
    selId = id; skipHoverId = null;
    markSelected();
    focusedId = null; // rysujemy trasę od nowa, już po przybliżeniu
    mapFocus(id, true);
  }
  function deselect() {
    const was = selId;
    if (!was) return;
    selId = null;
    skipHoverId = hlId === was ? was : null; // kursor nadal nad tym wierszem — nie wracaj do skupienia, dopóki z niego nie zjedzie
    markSelected();
    mapFocus(null);
    showAll();
  }
  // wszystkie widoczne zlecenia w kadrze
  function showAll() {
    if (!map || main.dataset.view === 'list' || !markers.size) return;
    const b = L.latLngBounds([...markers.values()].map((m) => m.getLatLng()));
    map.flyToBounds(b, { padding: [50, 50], maxZoom: markers.size === 1 ? 8 : 11, duration: reduce() ? 0 : .6 });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selId && !$$('dialog[open]').length && $('#phone-bub').hidden) deselect(); });

  /* ---------- tryb skupienia na mapie: jedno zlecenie, jego punkty i rysowana trasa ---------- */
  let focusTimer = 0, focusedId = null, routeSeq = 0;
  const roads = new Map(); // trasy drogowe (OSRM) zapamiętane per zlecenie
  const routePoints = (o) => { const st = store.stops(o); return { st, all: st.pickups.concat(st.drops, st.end ? [st.end] : []) }; };
  function roadFor(o, all) {
    if (!roads.has(o.id)) {
      const coords = all.map((p) => `${p.lng},${p.lat}`).join(';');
      roads.set(o.id, fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
        .then((r) => r.json())
        .then((j) => (j.routes && j.routes[0] ? j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]) : null))
        .catch(() => { roads.delete(o.id); return null; })); // bez sieci: spróbujemy przy kolejnym najechaniu
    }
    return roads.get(o.id);
  }
  // linia trasy: jasna obwódka + kolor akcentu; rysowanie animacją kreski (stroke-dashoffset)
  function drawLine(latlngs, animate) {
    const css = getComputedStyle(root);
    const accent = css.getPropertyValue('--accent').trim() || '#6B7F42';
    const casing = css.getPropertyValue('--bg-soft').trim() || '#F4EFE8';
    const lines = [
      L.polyline(latlngs, { color: casing, weight: 9, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'rt-casing' }),
      L.polyline(latlngs, { color: accent, weight: 4.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'rt-line' }),
    ];
    lines.forEach((l) => routeLayer.addLayer(l));
    if (!animate || reduce()) return lines;
    lines.forEach((l) => {
      const path = l.getElement();
      if (!path || !path.getTotalLength) return;
      const len = path.getTotalLength();
      path.style.strokeDasharray = len + ' ' + len;
      path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset .8s cubic-bezier(.55, 0, .25, 1)';
      path.style.strokeDashoffset = '0';
      // po narysowaniu zdejmujemy kreskowanie — przy zoomie Leaflet przelicza ścieżkę od nowa
      path.addEventListener('transitionend', () => { path.style.transition = ''; path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; }, { once: true });
    });
    return lines;
  }
  // fly = przybliż mapę do trasy (tylko po kliknięciu); najechanie kursorem rysuje trasę bez ruchu mapy
  function mapFocus(id, fly) {
    if (!map || focusedId === id) return;
    focusedId = id;
    const seq = ++routeSeq;
    clearRoute();
    const box = map.getContainer();
    box.classList.toggle('is-focus', !!id);
    markers.forEach((m, oid) => { const e = m.getElement(); if (e) e.classList.toggle('is-dim', !!id && oid !== id); });
    const o = id && store.get(id);
    if (!o) return;
    const { st, all } = routePoints(o);
    routeLayer = L.layerGroup().addTo(map);
    const shown = state.mapMode === 'dep' ? o.from : o.to;
    // trasę drogową pobieramy od razu (w trakcie lotu mapy) — zwykle zdąży przed rysowaniem
    const roadP = roadFor(o, all);
    let lines = null;
    const placePins = () => {
      // punkty zlecenia: A1, A2… odbiór, B1… cele, C — koniec trasy; „wyskakują”, gdy dociera do nich linia
      all.forEach((x, i) => {
        if (x.lat === shown.lat && x.lng === shown.lng && x.label === shown.label) return; // ten punkt to widoczna pinezka zlecenia
        const end = st.end && i === all.length - 1;
        const pick = i < st.pickups.length;
        const cls = end ? 'mk-c' : pick ? 'mk-a' : 'mk-b';
        const label = end ? 'C' : pick ? 'A' + (st.pickups.length > 1 ? i + 1 : '') : 'B' + (st.drops.length > 1 ? i - st.pickups.length + 1 : '');
        const delay = reduce() ? 0 : Math.round(120 + (all.length > 1 ? i / (all.length - 1) : 0) * 700);
        const ic = L.divIcon({ className: '', html: `<span class="mk ${cls} mk-pop" style="animation-delay:${delay}ms"><i></i><b>${label}</b></span>`, iconSize: [30, 30], iconAnchor: [15, 30] });
        routeLayer.addLayer(L.marker([x.lat, x.lng], { icon: ic, interactive: false, keyboard: false, zIndexOffset: 500 }));
      });
    };
    // rysujemy trasę drogową, jeśli jest gotowa (czekamy na nią najwyżej 250 ms); inaczej linię prostą,
    // którą po nadejściu trasy drogowej podmieniamy (bez ponownej animacji)
    const draw = () => Promise.race([roadP, new Promise((r) => setTimeout(r, 250))]).then((road) => {
      if (seq !== routeSeq) return;
      if (road) { lines = drawLine(road, true); placePins(); return; }
      lines = drawLine(all.map((x) => [x.lat, x.lng]), true);
      placePins();
      roadP.then((r) => {
        if (!r || seq !== routeSeq || !routeLayer) return;
        lines.forEach((l) => routeLayer.removeLayer(l));
        lines = drawLine(r, false);
        lines.forEach((l) => { const e = l.getElement(); if (e) e.classList.add('rt-fade'); });
      });
    });
    // po kliknięciu: przybliżenie do całej trasy, linię rysujemy po zakończeniu lotu
    const b = L.latLngBounds(all.map((x) => [x.lat, x.lng]));
    fly = fly && main.dataset.view !== 'list';
    if (fly && !reduce()) {
      map.once('moveend', () => { if (seq === routeSeq) draw(); });
      map.flyToBounds(b, { padding: [70, 70], maxZoom: 11, duration: .6 });
    } else {
      if (fly) map.fitBounds(b, { padding: [70, 70], maxZoom: 11, animate: false });
      draw();
    }
  }

  function showRow(id, fromMap) {
    const r = $(`.order[data-id="${id}"]`);
    if (!r) return;
    r.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
    r.classList.remove('is-flash'); void r.offsetWidth; r.classList.add('is-flash');
    if (!fromMap) setHl(id);
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
  ['#rv-dialog', '#ng-dialog', '#cx-dialog', '#fee-dialog', '#rm-dialog', '#ar-dialog', '#of-dialog'].forEach((sel) => {
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
    const c = store.crew(o);
    box.appendChild(el('p', 'dr-crew is-' + c.level, t('g.crew.line', { x: hm(c.drive), y: t('g.crew.' + c.level) })));
  }

  /* ---------- czas pracy kierowcy (szacunek wg 561/2006) ---------- */
  function hm(h) {
    const m = Math.max(5, Math.round(h * 60 / 5) * 5);
    return t('g.crew.hm', { x: Math.floor(m / 60), y: String(m % 60).padStart(2, '0') });
  }
  // w wierszu pokazujemy tylko to, co zmienia obsadę: 2 kierowców albo nocleg
  function crewChip(o) {
    const c = store.crew(o);
    if (c.level !== 'two' && c.level !== 'rest') return null;
    const chip = el('span', 'tag-crew is-' + c.level, t('g.crew.' + c.level));
    chip.title = t('g.crew.line', { x: hm(c.drive), y: t('g.crew.' + c.level) }) + ' — ' + t('g.crew.why.' + c.level);
    return chip;
  }

  /* ---------- potwierdzenie zlecenia — wspólny moduł js/confirm.js (giełda i panel klienta) ---------- */
  const openDoc = (id) => { if (window.ANWSConfirm) window.ANWSConfirm.open(id); };

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
    if (!plan.chosen) {
      // bez wybranego modelu rozliczeń nie da się rezerwować — prowadzimy do panelu klienta
      box.className = 'dlg-box is-fee';
      box.appendChild(el('div', 'db-title', t('g.rv.needTitle')));
      box.appendChild(el('p', 'db-note', t('g.rv.needNote')));
      confirm.textContent = t('g.rv.needBtn');
    } else if (plan.free) {
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
      const a = el('a', null, t('g.rv.subLink')); a.href = 'konto.html#model';
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
    if (!plan.chosen) { location.href = 'konto.html#model'; return; }
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

  /* ---------- propozycje stawek: akceptacja / odrzucenie (nazwa przewoźnika ukryta do akceptacji) ---------- */
  let ofId = null, ofConfirm = null;
  const agoLabel = (ms) => {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    const m = Math.round((ms - Date.now()) / 6e4);
    if (Math.abs(m) < 60) return rtf.format(m, 'minute');
    const h = Math.round(m / 60);
    return Math.abs(h) < 24 ? rtf.format(h, 'hour') : rtf.format(Math.round(h / 24), 'day');
  };
  function openOffers(id) {
    const o = store.get(id);
    if (!o || o.owner !== me) return;
    ofId = id; ofConfirm = null;
    renderOffers();
    openDlg($('#of-dialog'));
    setTimeout(() => { const b = $('#of-list button'); if (b) b.focus(); }, 40);
  }
  function renderOffers() {
    const o = store.get(ofId);
    const list = $('#of-list');
    list.textContent = '';
    if (!o) return;
    routeSummary($('#of-route'), o);
    const offers = (o.offers || []).slice().sort((a, b) => a.rate - b.rate);
    $('#of-sub').textContent = t('g.of.sub', { x: zl(o.rate) });
    if (o.status !== 'open' || !offers.length) { list.appendChild(el('p', 'db-note', t(o.status !== 'open' ? 'g.of.closed' : 'g.of.none'))); return; }
    offers.forEach((x, i) => {
      const card = el('article', 'of-card' + (ofConfirm === x.by ? ' is-confirm' : ''));
      const head = el('div', 'of-head');
      const who = el('div', 'of-who');
      const name = el('b', null, t('g.of.carrier', { x: i + 1 }));
      who.append(name, el('small', null, t('g.of.hidden') + ' · ' + agoLabel(x.at)));
      const price = el('div', 'of-price');
      const diff = x.rate - o.rate;
      price.append(el('b', null, zl(x.rate)), el('small', 'of-diff' + (diff > 0 ? ' is-up' : diff < 0 ? ' is-down' : ''), diff === 0 ? t('g.of.same') : (diff > 0 ? '+' : '−') + zl(Math.abs(diff))));
      head.append(who, price);
      card.appendChild(head);
      if (x.message) card.appendChild(el('p', 'of-msg', '„' + x.message + '”'));
      const acts = el('div', 'of-acts');
      if (ofConfirm === x.by) {
        card.appendChild(el('p', 'db-note of-confirm-note', t('g.of.confirmNote', { x: zl(x.rate) })));
        const back = el('button', 'call-btn call-btn-ghost', t('g.of.back')); back.type = 'button';
        back.addEventListener('click', () => { ofConfirm = null; renderOffers(); });
        const ok = el('button', 'call-btn call-btn-primary', t('g.of.confirm', { x: zl(x.rate) })); ok.type = 'button';
        ok.addEventListener('click', () => acceptOffer(x.by));
        acts.append(back, ok);
        setTimeout(() => ok.focus(), 30);
      } else {
        const no = el('button', 'call-btn call-btn-ghost', t('g.of.reject')); no.type = 'button';
        no.addEventListener('click', () => {
          if (!store.rejectOffer(ofId, me, x.by)) return;
          toast(t('g.of.rejected'));
          render(); renderOffers();
          if (!(store.get(ofId).offers || []).length) setTimeout(() => closeDlg($('#of-dialog')), 900);
        });
        const yes = el('button', 'call-btn call-btn-primary', t('g.of.accept')); yes.type = 'button';
        yes.addEventListener('click', () => { ofConfirm = x.by; renderOffers(); });
        acts.append(no, yes);
      }
      card.appendChild(acts);
      list.appendChild(card);
    });
  }
  function acceptOffer(by) {
    const id = ofId;
    if (!store.acceptOffer(id, me, by)) { toast(t('g.of.fail')); renderOffers(); return; }
    closeDlg($('#of-dialog'));
    toast(t('g.of.done', { x: auth.nameOf(by) }));
    state.mineTab = 'posted';
    if (state.scope !== 'mine') setScope('mine'); else render();
    setTimeout(() => showRow(id), 200);
  }

  /* ---------- archiwizacja zlecenia (znika z „Twoich zleceń”, zostaje w panelu klienta) ---------- */
  let arId = null;
  function openArchive(id) {
    const o = store.get(id);
    if (!store.canArchive(o, me)) return;
    arId = id;
    routeSummary($('#ar-route'), o);
    openDlg($('#ar-dialog'));
    setTimeout(() => $('#ar-confirm').focus(), 40);
  }
  $('#ar-confirm').addEventListener('click', () => {
    const ok = store.archive(arId, me);
    closeDlg($('#ar-dialog'));
    if (!ok) return;
    toast(t('g.ar.done'));
    render();
  });

  /* ---------- administrator: usunięcie zlecenia bez opłat dla zlecającego ---------- */
  let rmId = null;
  function openRemove(id) {
    const o = store.get(id);
    if (!isAdmin || !o) return;
    rmId = id;
    routeSummary($('#rm-route'), o);
    $('#rm-owner').textContent = t('g.rm.owner', { x: auth.nameOf(o.owner) });
    const rs = $('#rm-reserved');
    rs.hidden = !o.reservedBy;
    if (o.reservedBy) rs.textContent = t('g.rm.reservedNote', { x: auth.nameOf(o.reservedBy) });
    openDlg($('#rm-dialog'));
    setTimeout(() => $('#rm-dialog [data-close].call-btn').focus(), 40);
  }
  $('#rm-confirm').addEventListener('click', () => {
    const ok = store.adminRemove(rmId, me);
    closeDlg($('#rm-dialog'));
    if (!ok) return;
    toast(t('g.rm.done'));
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
     i jeden koniec trasy (C, pole domyślnie puste) — np. powrót na pusto albo wycieczka objazdowa ---------- */
  const cr = {
    dlg: $('#cr-dialog'), form: $('#cr-form'), dep: $('#cr-dep'), arr: $('#cr-arr'),
    pax: $('#cr-pax'), km: $('#cr-km'), rate: $('#cr-rate'), notes: $('#cr-notes'),
    hint: $('#cr-hint'), q: $('#cr-q'), results: $('#cr-results'),
    list: { A: $('#cr-list-a'), B: $('#cr-list-b'), C: $('#cr-list-c') }, empty: { A: $('#cr-empty-a'), B: $('#cr-empty-b') }, err: { A: $('#cr-a-err'), B: $('#cr-b-err'), C: $('#cr-c-err') },
  };
  const MAX_STOPS = 8;
  const XS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
  let crMap = null, crLine = null, mode = 'A';
  const pts = { A: [], B: [], C: [] }; // { lat, lng, label, marker, input, pin, li }; C — najwyżej jeden punkt
  const mkCls = (w) => (w === 'A' ? 'mk-a' : w === 'B' ? 'mk-b' : 'mk-c');
  let kmTouched = false, arrAuto = false, durMin = null;

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
    input.addEventListener('input', () => { p.label = input.value; clearListErr(which); });
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
    // koniec trasy: pole zostaje (puste), znika tylko punkt
    if (which === 'C') {
      Object.assign(p, { lat: null, lng: null, label: '', marker: null });
      p.input.value = '';
      p.li.classList.add('is-empty');
      clearListErr('C');
      renumber(); updateSteps(); updateRoute();
      return;
    }
    p.li.remove();
    pts[which] = pts[which].filter((x) => x !== p);
    if (activeRow === p) activeRow = null;
   
    renumber(); updateSteps(); updateRoute();
  }
  function clearPoints() {
    ['A', 'B', 'C'].forEach((w) => { pts[w].forEach((p) => { if (crMap && p.marker) crMap.removeLayer(p.marker); p.li.remove(); }); pts[w] = []; });
    if (crLine && crMap) crMap.removeLayer(crLine);
    crLine = null; durMin = null; activeRow = null;
    if (!kmTouched) cr.km.value = '';
    addRow('A'); addRow('B'); addRow('C');
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
    updateCrew();
  }
  function suggestArrival() {
    const dep = fromInput(cr.dep.value);
    if (!durMin || isNaN(dep) || (cr.arr.value && !arrAuto)) return;
    const m = 15 * 6e4;
    cr.arr.value = toLocalInput(Math.ceil((dep + durMin * 6e4) / m) * m);
    arrAuto = true;
    crClear(cr.arr);
  }
  // czas pracy kierowcy dla wpisanej trasy — na bieżąco, przy zmianie km i godzin
  function updateCrew() {
    const box = $('#cr-crew');
    const km = +cr.km.value, dep = fromInput(cr.dep.value), arr = fromInput(cr.arr.value);
    if (!(km > 0)) { box.hidden = true; return; }
    const o = { km, dep: isNaN(dep) ? 0 : dep, arr: isNaN(arr) || isNaN(dep) || arr <= dep ? 0 : arr };
    const c = store.crew(o);
    box.textContent = '';
    box.dataset.level = c.level;
    const head = el('div', 'crew-head');
    head.appendChild(el('b', null, t('g.crew.title')));
    head.appendChild(el('span', 'crew-pill is-' + c.level, t('g.crew.' + c.level)));
    box.appendChild(head);
    const ul = el('ul', 'crew-facts');
    ul.appendChild(el('li', null, t('g.crew.drive', { x: hm(c.drive), y: c.kmh })));
    if (c.breaks) ul.appendChild(el('li', null, t('g.crew.breaks', { x: c.breaks })));
    if (o.arr) ul.appendChild(el('li', null, t('g.crew.span', { x: hm(c.span) })));
    // za mało czasu na przejazd z przerwami (bez końca trasy C — wtedy km obejmuje też powrót)
    if (o.arr && !located('C').length && c.span < (c.drive + c.breaks * 0.75) * 0.9) ul.appendChild(el('li', 'is-warn', t('g.crew.tight')));
    box.appendChild(ul);
    box.appendChild(el('p', 'crew-why', t('g.crew.why.' + c.level)));
    box.appendChild(el('p', 'crew-note', t('g.crew.note')));
    box.hidden = false;
  }
  // informacja, czy zlecenie będzie pilne (wyjazd za mniej niż 24 h od dodania — automatycznie)
  function updateUrgentInfo() {
    const box = $('#cr-urgent-info');
    const dep = fromInput(cr.dep.value);
    const state = isNaN(dep) ? 'none' : store.isUrgentDep(dep) ? 'yes' : 'no';
    box.dataset.state = state;
    box.innerHTML = state === 'yes' ? BOLT : '';
    box.appendChild(el('span', null, t(state === 'yes' ? 'g.cr.urgYes' : state === 'no' ? 'g.cr.urgNo' : 'g.cr.urgNone')));
  }
  function updateRateHelp() {
    const r = +cr.rate.value, k = +cr.km.value;
    $('#cr-rate-help').textContent = r > 0 && k > 0 ? t('g.cr.rateHint', { x: num(r / k, 1) }) : '';
  }
  cr.km.addEventListener('input', () => { kmTouched = true; crClear(cr.km); updateRateHelp(); updateCrew(); });
  cr.rate.addEventListener('input', () => { crClear(cr.rate); updateRateHelp(); });
  cr.dep.addEventListener('input', () => { crClear(cr.dep); suggestArrival(); updateCrew(); updateUrgentInfo(); });
  cr.arr.addEventListener('input', () => { arrAuto = false; crClear(cr.arr); updateCrew(); });
  cr.pax.addEventListener('input', () => crClear(cr.pax));
  cr.form.addEventListener('input', () => { });

  // wyszukiwarka adresu nad mapą — wynik trafia na listę wybraną przełącznikiem (odbiór / cel)
  makeSearch(cr.q, cr.results, (r) => {
    cr.q.value = '';
    crMap.setView([r.lat, r.lng], 14);
    placeAt(mode, L.latLng(r.lat, r.lng), r.label);
  });

  function resetCreate() {
    cr.form.reset(); clearPoints();
    kmTouched = false; arrAuto = false;
    $$('.field-err', cr.form).forEach((e) => { e.hidden = true; e.dataset.key = ''; });
    $$('[aria-invalid]', cr.form).forEach((i) => i.removeAttribute('aria-invalid'));
    $('#cr-km-help').textContent = t('g.cr.kmHelp');
    $('#cr-crew').hidden = true;
    updateUrgentInfo();
  }
  function openCreate() {
    if (store.unpaidFees(me).length) { openFee(true); return; }
    if (!hasMap) { toast('Mapa jest chwilowo niedostępna.'); return; }
    cr.dep.min = toLocalInput(Date.now());
    updateUrgentInfo();
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
  function closeCreate() {
    closeDlg(cr.dlg);
  }
  $$('[data-close]', cr.dlg).forEach((b) => b.addEventListener('click', () => closeCreate()));
  cr.dlg.addEventListener('cancel', (e) => { e.preventDefault(); if ($$('.cr-results:not([hidden])', cr.dlg).length) return; closeCreate(); });
  // kliknięcie w tło zamyka okno bez pytania — punkty i pola zostają do ponownego otwarcia.
  // Liczy się tylko kliknięcie zaczęte na tle (przeciągnięcie pinezki poza okno go nie zamyka).
  let crDownOnBackdrop = false;
  cr.dlg.addEventListener('pointerdown', (e) => { crDownOnBackdrop = e.target === cr.dlg; });
  cr.dlg.addEventListener('click', (e) => { if (e.target === cr.dlg && crDownOnBackdrop) closeCreate(); });

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
    if (store.unpaidFees(me).length) { closeCreate(); openFee(true); return; }
    const plain = (p) => ({ label: p.input.value.trim(), lat: p.lat, lng: p.lng });
    const o = store.add({
      pickups: located('A').map(plain), drops: located('B').map(plain), end: located('C').length ? plain(located('C')[0]) : null,
      dep, arr, km: Math.round(km), rate: Math.round(rate), pax, notes: cr.notes.value.trim(),
    }, me);
    closeCreate();
    resetCreate();
    // pokaż nowe zlecenie w „Twoich zleceniach”, bez filtrów, które mogłyby je ukryć
    resetFilters();
    state.mineTab = 'posted';
    setScope('mine');
    toast(t('g.done'));
    setTimeout(() => { showRow(o.id); selectOrder(o.id); }, 200);
  });

  /* ---------- zmiana języka ---------- */
  document.addEventListener('anws:lang', () => {
    renderUser();
    render();
    if (cr.dlg.open) updateSteps();
    updateRateHelp();
    if (cr.dlg.open) updateCrew();
    updateUrgentInfo();
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
  // link z powiadomienia (SMS, e-mail, dzwonek): pokaż to zlecenie na liście i na mapie
  if (params.get('zlecenie') || params.get('z')) {
    const zid = params.get('zlecenie') || params.get('z');
    setTimeout(() => {
      const o = store.get(zid);
      if (!o || !store.active().some((x) => x.id === zid)) { toast(t('g.linkGone')); return; }
      if (!$(`.order[data-id="${zid}"]`)) { resetFilters(true); setScope(o.urgent ? 'urgent' : 'all'); }
      showRow(zid); selectOrder(zid);
    }, 350);
  }
  // z powiadomienia o propozycji stawki: od razu lista propozycji przy tym zleceniu
  if (params.get('oferty')) { const oid = params.get('oferty'); setTimeout(() => { showRow(oid); openOffers(oid); }, 350); }
  if (params.has('nowe') || params.has('pilne') || params.has('moje') || params.has('tab') || params.has('oferty') || params.has('zlecenie') || params.has('z')) history.replaceState(null, '', location.pathname);
  // terminy względne („za 3 godziny”) odświeżamy co minutę
  setInterval(() => { if (!document.hidden && !$$('dialog[open]').length) render(); }, 60000);
})();
