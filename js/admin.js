// ANWS — panel administratora: akceptacja wniosków o rejestrację (etap 2)

(function () {
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const auth = window.ANWSAuth;
  if (!auth) return;

  const DICT = window.I18N || {};
  const t = (k) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    return (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : DICT.pl[k];
  };
  const tx = (k, x) => t(k).replace('{x}', x);
  const tv = (k, vars) => { let r = t(k); Object.keys(vars).forEach((v) => { r = r.split('{' + v + '}').join(vars[v]); }); return r; };
  const store = window.ANWSOrders;
  const locale = () => (root.lang === 'en' ? 'en-GB' : 'pl-PL');
  const nf = (n, d = 0) => new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: d, useGrouping: 'always' }).format(n);
  const zl = (n) => nf(Math.round(n)) + ' zł';
  const zl2 = (n) => nf(n, 2) + ' zł';
  const DAY = 864e5;

  const loginBox = $('#admin-login');
  const panel = $('#admin-panel');
  const list = $('#reg-list');
  const live = $('#adm-live');
  let filter = 'pending';

  const fmtDate = (ts) => new Date(ts).toLocaleString(root.lang === 'en' ? 'en-GB' : 'pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  // +48500600700 → +48 500 600 700 (pozostałe kraje: numer kierunkowy oddzielony spacją)
  const fmtPhone = (p) => {
    const m = String(p || '').match(/^\+48(\d{9})$/);
    if (m) return '+48 ' + m[1].replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    const n = String(p || '').match(/^\+(420|421|370|371|372|380|353|351|358|359|385|386|\d{2})(\d+)$/);
    return n ? '+' + n[1] + ' ' + n[2].replace(/(\d{3})(?=\d)/g, '$1 ') : p;
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // komunikat zapamiętuje klucz tłumaczenia, żeby po zmianie języka dało się go przetłumaczyć
  function msg(box, key) {
    box.dataset.key = key || '';
    box.textContent = key ? t(key) : '';
    box.hidden = !key;
  }

  function isAdmin() {
    const s = auth.getSession();
    return s && s.role === 'admin' ? s : null;
  }

  function show() {
    const s = isAdmin();
    loginBox.hidden = !!s;
    panel.hidden = !s;
    if (s) { $('#adm-who').textContent = t('adm.who') + ' ' + s.login; $('#adm-warn').hidden = !auth.adminHasDefaultPassword(); render(); renderStats(); }
    else setTimeout(() => $('#adm-login').focus(), 50);
  }

  function row(dl, label, value, href) {
    const d = el('div');
    d.appendChild(el('dt', null, label));
    const dd = el('dd');
    if (href) { const a = el('a', null, value); a.href = href; if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; } dd.appendChild(a); }
    else dd.textContent = value || '—';
    d.appendChild(dd);
    dl.appendChild(d);
  }

  function render() {
    const regs = auth.listRegistrations();
    ['pending', 'approved', 'rejected'].forEach((k) => { $('#cnt-' + k).textContent = regs.filter((r) => r.status === k).length; });
    $('#cnt-pending-top').textContent = regs.filter((r) => r.status === 'pending').length;
    list.textContent = '';
    const shown = regs.filter((r) => r.status === filter);
    if (!shown.length) list.appendChild(el('p', 'reg-empty', t(filter === 'pending' ? 'adm.emptyPending' : 'adm.empty')));

    shown.forEach((r) => {
      const card = el('article', 'reg-card');
      const head = el('div', 'rc-head');
      head.appendChild(el('h3', null, r.company));
      const tags = el('div', 'rc-tags');
      if (r.seed) tags.appendChild(el('span', 'rc-tag', t('adm.seed')));
      tags.appendChild(el('span', 'rc-tag st-' + r.status, t('adm.st.' + r.status)));
      head.appendChild(tags);
      card.appendChild(head);

      const dl = el('dl', 'rc-grid');
      row(dl, 'NIP', r.nip, 'https://www.podatki.gov.pl/wykaz-podatnikow-vat-wyszukiwarka');
      row(dl, 'KRS', r.krs || t('adm.f.krsNone'), r.krs ? 'https://wyszukiwarka-krs.ms.gov.pl/' : null);
      row(dl, 'REGON', r.regon);
      row(dl, t('adm.f.pkd'), r.pkd && r.pkd.length ? r.pkd.join(', ') : t('adm.f.none'));
      row(dl, t('adm.f.person'), r.contactName);
      row(dl, t('auth.login'), r.login);
      row(dl, 'E-mail', r.email, 'mailto:' + r.email);
      row(dl, t('reg.phone'), fmtPhone(r.phone), 'tel:' + r.phone.replace(/[^\d+]/g, ''));
      row(dl, t('reg.alarm'), fmtPhone(r.alarmPhone), 'tel:' + r.alarmPhone.replace(/[^\d+]/g, ''));
      row(dl, t('adm.f.date'), fmtDate(r.createdAt));
      if (r.decidedAt) row(dl, t('adm.f.decision'), fmtDate(r.decidedAt));
      card.appendChild(dl);

      if (r.status === 'pending') {
        const actions = el('div', 'rc-actions');
        const ok = el('button', 'call-btn call-btn-primary', t('adm.approve'));
        const no = el('button', 'call-btn call-btn-ghost', t('adm.reject'));
        ok.type = no.type = 'button';
        ok.addEventListener('click', () => decide(r, true));
        no.addEventListener('click', () => { if (confirm(tx('adm.rejectConfirm', r.company))) decide(r, false); });
        actions.append(ok, no);
        card.appendChild(actions);
      }
      list.appendChild(card);
    });

    // treść e-maili zostaje po polsku — tak trafią do klientów
    const ob = $('#ob-list');
    ob.textContent = '';
    const mails = auth.outbox();
    if (!mails.length) ob.appendChild(el('li', null, t('adm.outboxEmpty')));
    mails.forEach((m) => {
      const li = el('li');
      if (m.channel === 'sms') li.classList.add('is-sms');
      li.appendChild(el('span', 'ob-meta', `${m.channel === 'sms' ? t('adm.smsTo') : t('adm.to')} ${m.to} · ${fmtDate(m.at)}`));
      li.appendChild(el('b', null, m.subject));
      li.appendChild(el('span', null, m.body));
      ob.appendChild(li);
    });
  }

  /* ---------- statystyki giełdy ---------- */
  let view = 'stats';
  function setView(v) {
    view = v;
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    $('#view-stats').hidden = v !== 'stats';
    $('#view-regs').hidden = v !== 'regs';
    $('#view-int').hidden = v !== 'int';
    if (v === 'int') renderInt();
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  const city = (p) => p.label.split(',')[0].replace(/\s*\(.*\)$/, '').trim();
  const svgEl = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k])); return e; };

  function computeStats() {
    const now = Date.now(), from = now - 30 * DAY, prevFrom = now - 60 * DAY;
    const all = store.list().filter((o) => o.status !== 'removed');
    const inWin = (ms, a, b) => ms >= a && ms < b;
    const created = all.filter((o) => inWin(o.createdAt, from, now));
    const createdPrev = all.filter((o) => inWin(o.createdAt, prevFrom, from));
    const decided = created.filter((o) => o.status !== 'open');
    const taken = decided.filter((o) => o.status === 'reserved');
    const reservedWin = all.filter((o) => o.status === 'reserved' && inWin(o.reservedAt || 0, from, now));
    const gmv = reservedWin.reduce((a, o) => a + o.rate, 0);
    // przychód ANWS: prowizje (wg daty rezerwacji), abonamenty (wg daty opłaty), opłaty za anulowanie / niepodjęte zlecenia
    const rev = (a, b) => ({
      comm: all.filter((o) => o.status === 'reserved' && o.fee && inWin(o.reservedAt || 0, a, b)).reduce((x, o) => x + o.fee.amount, 0),
      subs: auth.billingAll().reduce((x, acc) => x + acc.history.filter((h) => h.type === 'sub' && inWin(h.at, a, b)).reduce((y, h) => y + h.amount, 0), 0),
      fees: store.allFees().filter((f) => f.paid && inWin(f.paidAt || f.at, a, b)).reduce((x, f) => x + f.amount, 0),
    });
    const r30 = rev(from, now), rAll = rev(0, now + DAY);
    // tygodnie (pon–niedz), ostatnie 10
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weeks = [];
    for (let i = 9; i >= 0; i--) {
      const a = monday.getTime() - i * 7 * DAY, b = a + 7 * DAY;
      const w = all.filter((o) => inWin(o.createdAt, a, b));
      weeks.push({ start: a, taken: w.filter((o) => o.status === 'reserved').length, other: w.filter((o) => o.status !== 'reserved').length });
    }
    // najpopularniejsze trasy (miasto → miasto, ostatnie 90 dni)
    const routes = new Map();
    all.filter((o) => o.createdAt >= now - 90 * DAY).forEach((o) => {
      const k = city(o.from) + ' → ' + city(o.to);
      const r = routes.get(k) || { name: k, n: 0, sum: 0, taken: 0, decided: 0 };
      r.n++; r.sum += o.rate;
      if (o.status !== 'open') r.decided++;
      if (o.status === 'reserved') r.taken++;
      routes.set(k, r);
    });
    const top = [...routes.values()].sort((a, b) => b.n - a.n || b.sum - a.sum).slice(0, 6);
    return { created, createdPrev, decided, taken, reservedWin, gmv, r30, rAll, weeks, top };
  }

  const TEST_ROUTES = [
    [{ label: 'Kraków, Rondo Mogilskie', lat: 50.0659, lng: 19.96 }, { label: 'Zakopane, Krupówki', lat: 49.2958, lng: 19.9503 }, 107, 1250, 48],
    [{ label: 'Gdańsk, Długi Targ', lat: 54.3484, lng: 18.6533 }, { label: 'Malbork, Zamek', lat: 54.0396, lng: 19.0277 }, 58, 750, 35],
    [{ label: 'Wrocław, Rynek', lat: 51.11, lng: 17.032 }, { label: 'Karpacz, centrum', lat: 50.7766, lng: 15.7563 }, 128, 1350, 50],
  ];
  let testN = 0;
  function tile(label, value, sub, cls) {
    const d = el('div', 'st-tile' + (cls ? ' ' + cls : ''));
    d.append(el('span', 'st-label', label), el('b', 'st-value', value));
    if (sub) d.appendChild(el('span', 'st-sub', sub));
    return d;
  }

  // wykres: zlecenia dodane w kolejnych tygodniach — przyjęte + pozostałe (słupki skumulowane)
  function weekChart(weeks) {
    const wrap = el('div', 'st-chart');
    const W = 900, H = 250, padL = 30, padB = 26, padT = 10;
    const max = Math.max(4, ...weeks.map((w) => w.taken + w.other));
    const step = max <= 8 ? 2 : max <= 20 ? 5 : 10;
    const top = Math.ceil(max / step) * step;
    const y = (v) => padT + (H - padT - padB) * (1 - v / top);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'st-svg', role: 'img', 'aria-label': t('st.chartTitle') });
    for (let v = 0; v <= top; v += step) {
      svg.appendChild(svgEl('line', { x1: padL, x2: W, y1: y(v), y2: y(v), class: v ? 'st-grid' : 'st-axis' }));
      const tl = svgEl('text', { x: padL - 8, y: y(v) + 4, class: 'st-tick', 'text-anchor': 'end' }); tl.textContent = v; svg.appendChild(tl);
    }
    const bw = (W - padL) / weeks.length, barW = Math.min(34, bw * 0.56);
    const tip = el('div', 'st-tip'); tip.hidden = true;
    weeks.forEach((w, i) => {
      const x = padL + bw * i + (bw - barW) / 2;
      const g = svgEl('g', { class: 'st-bar', tabindex: '0' });
      const label = new Date(w.start).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
      // przyjęte u dołu, pozostałe nad nimi; 2 px przerwy między segmentami
      const hTaken = y(0) - y(w.taken), hOther = y(0) - y(w.other);
      if (w.taken) g.appendChild(svgEl('rect', { x, y: y(w.taken), width: barW, height: hTaken, rx: 4, class: 'st-s1' }));
      if (w.other) g.appendChild(svgEl('rect', { x, y: y(w.taken) - hOther - (w.taken ? 2 : 0), width: barW, height: Math.max(0, hOther), rx: 4, class: 'st-s2' }));
      g.appendChild(svgEl('rect', { x: padL + bw * i, y: padT, width: bw, height: H - padT - padB, class: 'st-hit' }));
      const tl = svgEl('text', { x: x + barW / 2, y: H - 8, class: 'st-tick', 'text-anchor': 'middle' }); tl.textContent = label;
      svg.appendChild(tl);
      const show = () => {
        tip.textContent = '';
        tip.append(el('b', null, tv('st.week', { x: label })), el('span', null, tv('st.tipTaken', { x: w.taken })), el('span', null, tv('st.tipOther', { x: w.other })));
        tip.hidden = false;
        tip.style.left = ((x + barW / 2) / W * 100) + '%';
      };
      g.addEventListener('mouseenter', show); g.addEventListener('focus', show);
      g.addEventListener('mouseleave', () => { tip.hidden = true; }); g.addEventListener('blur', () => { tip.hidden = true; });
      svg.appendChild(g);
    });
    wrap.append(svg, tip);
    // tabela dla czytników ekranu
    const tbl = el('table', 'sr-only');
    const hr = el('tr'); [t('st.weekCol'), t('st.taken'), t('st.other')].forEach((h) => hr.appendChild(el('th', null, h))); tbl.appendChild(hr);
    weeks.forEach((w) => { const r = el('tr'); [new Date(w.start).toLocaleDateString(locale()), w.taken, w.other].forEach((v) => r.appendChild(el('td', null, String(v)))); tbl.appendChild(r); });
    wrap.appendChild(tbl);
    return wrap;
  }

  function renderStats() {
    const box = $('#view-stats');
    if (!box || !store) return;
    const S = computeStats();
    box.textContent = '';
    // kafelki
    const tiles = el('div', 'st-tiles');
    const delta = S.createdPrev.length ? Math.round((S.created.length - S.createdPrev.length) / S.createdPrev.length * 100) : null;
    tiles.appendChild(tile(t('st.orders'), nf(S.created.length), delta == null ? t('st.noPrev') : tv(delta >= 0 ? 'st.up' : 'st.down', { x: Math.abs(delta) }), delta != null && delta < 0 ? 'is-down' : ''));
    const pct = S.decided.length ? Math.round(S.taken.length / S.decided.length * 100) : 0;
    tiles.appendChild(tile(t('st.acc'), pct + '%', tv('st.accSub', { x: S.taken.length, y: S.decided.length })));
    tiles.appendChild(tile(t('st.gmv'), zl(S.gmv), S.reservedWin.length ? tv('st.gmvSub', { x: zl(S.gmv / S.reservedWin.length) }) : ''));
    const rev = S.r30.comm + S.r30.subs + S.r30.fees;
    tiles.appendChild(tile(t('st.rev'), zl(rev), t('st.revSub')));
    box.appendChild(tiles);

    // test alarmu: przykładowe pilne zlecenie od firmy testowej → powiadomienia, e-maile, SMS-y i alarm na otwartych stronach
    const test = el('section', 'admin-card st-card st-test');
    test.appendChild(el('h2', null, t('adm.testTitle')));
    test.appendChild(el('p', 'st-note', t('adm.testText')));
    const tb = el('button', 'call-btn call-btn-primary', t('adm.testBtn'));
    tb.type = 'button';
    const tmsg = el('p', 'pw-ok'); tmsg.hidden = true; tmsg.setAttribute('role', 'status');
    tb.addEventListener('click', () => {
      const R = TEST_ROUTES[testN++ % TEST_ROUTES.length];
      const dep = Math.ceil((Date.now() + 5 * 36e5) / 9e5) * 9e5;
      const o = store.add({ pickups: [R[0]], drops: [R[1]], end: null, dep, arr: dep + Math.round(R[2] / 65 * 36e5 / 9e5) * 9e5, km: R[2], rate: R[3], pax: R[4], notes: '' }, 'polbus');
      const n = auth.accounts().filter((l) => l !== 'polbus').length;
      tmsg.textContent = tv('adm.testDone', { x: o.from.label + ' → ' + o.to.label, y: n });
      tmsg.hidden = false;
      render();
    });
    test.append(tb, tmsg);
    box.appendChild(test);

    const grid = el('div', 'st-grid2');
    // wykres tygodniowy
    const c1 = el('section', 'admin-card st-card st-wide');
    c1.appendChild(el('h2', null, t('st.chartTitle')));
    const legend = el('div', 'st-legend');
    [['st-s1', 'st.taken'], ['st-s2', 'st.other']].forEach(([cls, k]) => { const i = el('span'); i.append(el('i', cls), document.createTextNode(t(k))); legend.appendChild(i); });
    c1.append(legend, weekChart(S.weeks));
    grid.appendChild(c1);

    // trasy
    const c2 = el('section', 'admin-card st-card');
    c2.appendChild(el('h2', null, t('st.routes')));
    c2.appendChild(el('p', 'st-note', t('st.routesNote')));
    const ul = el('ul', 'st-routes');
    const maxN = Math.max(1, ...S.top.map((r) => r.n));
    S.top.forEach((r, i) => {
      const li = el('li');
      const head = el('div', 'st-rhead');
      head.append(el('span', 'st-rank', String(i + 1)), el('b', null, r.name), el('span', 'st-n', tv('st.nOrders', { x: r.n })));
      const bar = el('span', 'st-rbar'); const fill = el('span'); fill.style.width = (r.n / maxN * 100).toFixed(1) + '%'; bar.appendChild(fill);
      const meta = el('span', 'st-rmeta', tv('st.routeMeta', { x: zl(r.sum / r.n), y: r.decided ? Math.round(r.taken / r.decided * 100) : 0 }));
      li.append(head, bar, meta);
      ul.appendChild(li);
    });
    c2.appendChild(ul);
    grid.appendChild(c2);

    // przychód wg źródła
    const c3 = el('section', 'admin-card st-card');
    c3.appendChild(el('h2', null, t('st.revTitle')));
    const tbl = el('table', 'st-table');
    const th = el('tr'); ['', t('st.col30'), t('st.colAll')].forEach((h) => th.appendChild(el('th', null, h))); tbl.appendChild(th);
    [['st.rComm', 'comm'], ['st.rSubs', 'subs'], ['st.rFees', 'fees']].forEach(([k, f]) => {
      const tr = el('tr'); tr.append(el('td', null, t(k)), el('td', 'num', zl(S.r30[f])), el('td', 'num', zl(S.rAll[f]))); tbl.appendChild(tr);
    });
    const sum = (o) => o.comm + o.subs + o.fees;
    const tf = el('tr', 'st-sum'); tf.append(el('td', null, t('st.rTotal')), el('td', 'num', zl(sum(S.r30))), el('td', 'num', zl(sum(S.rAll)))); tbl.appendChild(tf);
    c3.appendChild(tbl);
    c3.appendChild(el('p', 'st-note', t('st.revNote')));
    grid.appendChild(c3);

    box.appendChild(grid);
  }

  /* ---------- integracje: SMSAPI.pl i Fakturownia ----------
   * Klucze API nie są zapisywane w przeglądarce (każdy mógłby je odczytać) — po podłączeniu serwera
   * panel wyśle je tam jako sekrety. Ustawienia jawne zapisujemy od razu (js/integrations.js). */
  const INT = window.ANWSInt;
  const SAMPLE = { id: 'o123', pickups: [{ label: 'Kraków, Rondo Mogilskie' }], drops: [{ label: 'Zakopane, Krupówki' }], from: { label: 'Kraków, Rondo Mogilskie' }, to: { label: 'Zakopane, Krupówki' }, dep: Date.now() + 5 * 36e5, arr: Date.now() + 7 * 36e5, pax: 48, km: 107, rate: 1250 };
  const field = (id, label, input, help) => {
    const f = el('div', 'field');
    const l = el('label', null, label); l.htmlFor = id;
    f.appendChild(l);
    f.appendChild(input);
    if (help) f.appendChild(el('p', 'field-help', help));
    return f;
  };
  const inp = (id, type, value, attrs) => { const i = el('input'); i.id = id; i.type = type; if (value != null) i.value = value; Object.assign(i, attrs || {}); return i; };
  const check = (id, label, on, help) => {
    const l = el('label', 'check int-check');
    const i = inp(id, 'checkbox'); i.checked = !!on;
    const box = el('span', 'check-box'); box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
    const txt = el('span'); txt.appendChild(el('b', null, label)); if (help) txt.appendChild(el('small', null, help));
    l.append(i, box, txt);
    return l;
  };
  const secret = (id, label, help) => {
    const wrap = field(id, label, inp(id, 'password', '', { autocomplete: 'off', spellcheck: false, placeholder: t('int.keyPh') }), help);
    wrap.appendChild(el('p', 'int-key-state', t('int.keyNone')));
    return wrap;
  };
  function cardHead(title, sub, on) {
    const h = el('div', 'int-head');
    const tt = el('div'); tt.append(el('h2', null, title), el('p', 'st-note', sub));
    h.append(tt, el('span', 'int-pill' + (on ? ' is-on' : ''), t(on ? 'int.onWait' : 'int.off')));
    return h;
  }
  function msgBox() { const m = el('p', 'int-msg'); m.hidden = true; m.setAttribute('role', 'status'); return m; }
  const say = (m, key, warn) => { m.textContent = t(key); m.classList.toggle('is-warn', !!warn); m.hidden = false; };

  function renderInt() {
    const box = $('#view-int');
    if (!box || !INT) return;
    const cfg = INT.settings();
    box.textContent = '';
    const note = el('div', 'int-note');
    note.append(el('b', null, t('int.protoTitle')), el('span', null, t('int.protoText')));
    box.appendChild(note);
    const grid = el('div', 'st-grid2 int-grid');

    /* --- SMSAPI --- */
    const sms = el('section', 'admin-card st-card int-card');
    sms.appendChild(cardHead('SMSAPI.pl', t('int.smsSub'), cfg.sms.enabled));
    sms.appendChild(check('sms-on', t('int.smsOn'), cfg.sms.enabled, t('int.smsOnHelp')));
    sms.appendChild(secret('sms-token', t('int.smsToken'), t('int.smsTokenHelp')));
    sms.appendChild(field('sms-sender', t('int.smsSender'), inp('sms-sender', 'text', cfg.sms.sender, { maxLength: 11 }), t('int.smsSenderHelp')));
    sms.appendChild(check('sms-test', t('int.smsTest'), cfg.sms.test, t('int.smsTestHelp')));
    sms.appendChild(check('sms-plain', t('int.smsPlain'), cfg.sms.normalize, t('int.smsPlainHelp')));
    const ta = el('textarea'); ta.id = 'sms-tpl'; ta.rows = 3; ta.value = cfg.sms.template;
    const tplF = field('sms-tpl', t('int.smsTpl'), ta);
    const chips = el('div', 'int-chips');
    ['trasa', 'data', 'od', 'do', 'osoby', 'km', 'stawka', 'link', 'koniec'].forEach((v) => {
      const c = el('button', 'int-chip', '{' + v + '}'); c.type = 'button';
      c.title = t('int.var.' + v);
      c.addEventListener('click', () => { const p = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, p) + '{' + v + '}' + ta.value.slice(ta.selectionEnd || p); ta.focus(); preview(); });
      chips.appendChild(c);
    });
    tplF.appendChild(chips);
    sms.appendChild(tplF);
    const pv = el('div', 'int-preview');
    sms.appendChild(pv);
    function preview() {
      const tmp = { sms: { template: ta.value, normalize: $('#sms-plain').checked } };
      const text = INT.smsText(SAMPLE, store ? store.link(SAMPLE) : 'https://…', tmp);
      const pr = INT.smsParts(text);
      pv.textContent = '';
      pv.append(el('span', 'int-pv-label', t('int.smsPreview')), el('p', 'int-pv-text', text),
        el('span', 'int-pv-meta' + (pr.parts > 2 ? ' is-warn' : ''), tv('int.smsCount', { x: pr.len, y: pr.parts, z: pr.gsm ? 'GSM' : 'Unicode' })));
    }
    ta.addEventListener('input', preview);
    sms.addEventListener('change', (e) => { if (e.target.id === 'sms-plain') preview(); });
    const testRow = el('div', 'int-row');
    testRow.append(field('sms-num', t('int.smsTestNum'), inp('sms-num', 'tel', '', { placeholder: '+48 500 600 700' })));
    const tbtn = el('button', 'call-btn call-btn-ghost', t('int.smsTestBtn')); tbtn.type = 'button';
    testRow.appendChild(tbtn);
    sms.appendChild(testRow);
    const smsSave = el('button', 'call-btn call-btn-primary', t('int.save')); smsSave.type = 'button';
    const smsMsg = msgBox();
    sms.append(smsSave, smsMsg);
    tbtn.addEventListener('click', () => say(smsMsg, 'int.needServer', true));
    smsSave.addEventListener('click', () => {
      const c = INT.settings();
      c.sms.enabled = $('#sms-on').checked; c.sms.sender = $('#sms-sender').value.trim().slice(0, 11) || 'ANWS';
      c.sms.test = $('#sms-test').checked; c.sms.normalize = $('#sms-plain').checked; c.sms.template = ta.value.trim() || INT.DEFAULTS.sms.template;
      INT.saveSettings(c);
      const hadKey = !!$('#sms-token').value; $('#sms-token').value = '';
      renderInt();
      say($('#view-int .int-card .int-msg'), hadKey ? 'int.savedKey' : 'int.saved', hadKey);
    });
    grid.appendChild(sms);

    /* --- Fakturownia --- */
    const fv = el('section', 'admin-card st-card int-card');
    fv.appendChild(cardHead('Fakturownia', t('int.fvSub'), cfg.fv.enabled));
    fv.appendChild(check('fv-on', t('int.fvOn'), cfg.fv.enabled, t('int.fvOnHelp')));
    const dom = el('div', 'suffix-wrap int-domain');
    dom.append(inp('fv-domain', 'text', cfg.fv.domain, { placeholder: 'anws', spellcheck: false }), el('span', null, '.fakturownia.pl'));
    fv.appendChild(field('fv-domain', t('int.fvDomain'), dom, t('int.fvDomainHelp')));
    fv.appendChild(secret('fv-token', t('int.fvToken'), t('int.fvTokenHelp')));
    fv.appendChild(field('fv-dept', t('int.fvDept'), inp('fv-dept', 'text', cfg.fv.department, { inputMode: 'numeric' }), t('int.fvDeptHelp')));
    const row = el('div', 'int-row3');
    const vat = el('select'); vat.id = 'fv-vat';
    [23, 8, 5, 0].forEach((v) => { const o = el('option', null, v + '%'); o.value = v; if (+cfg.fv.vat === v) o.selected = true; vat.appendChild(o); });
    row.append(field('fv-vat', t('int.fvVat'), vat), field('fv-days', t('int.fvDays'), inp('fv-days', 'number', cfg.fv.payDays, { min: 0, max: 90 })));
    fv.appendChild(row);
    fv.appendChild(check('fv-mail', t('int.fvMail'), cfg.fv.sendEmail, t('int.fvMailHelp')));
    const kinds = el('fieldset', 'int-kinds');
    kinds.appendChild(el('legend', null, t('int.fvKinds')));
    ['commission', 'subscription', 'cancel', 'expired'].forEach((k) => {
      kinds.appendChild(check('fv-k-' + k, t('int.k.' + k), cfg.fv.kinds[k], t('int.kh.' + k)));
      kinds.appendChild(field('fv-n-' + k, t('int.fvName'), inp('fv-n-' + k, 'text', cfg.fv.names[k])));
    });
    kinds.appendChild(el('p', 'field-help', t('int.fvVars')));
    fv.appendChild(kinds);
    const fvTest = el('button', 'call-btn call-btn-ghost', t('int.fvTestBtn')); fvTest.type = 'button';
    const fvSave = el('button', 'call-btn call-btn-primary', t('int.save')); fvSave.type = 'button';
    const fvMsg = msgBox();
    const fvBtns = el('div', 'int-row'); fvBtns.append(fvTest, fvSave);
    fv.append(fvBtns, fvMsg);
    fvTest.addEventListener('click', () => say(fvMsg, 'int.needServer', true));
    fvSave.addEventListener('click', () => {
      const c = INT.settings();
      c.fv.enabled = $('#fv-on').checked;
      c.fv.domain = $('#fv-domain').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.fakturownia\.pl.*$/, '');
      c.fv.department = $('#fv-dept').value.trim();
      c.fv.vat = +$('#fv-vat').value; c.fv.payDays = Math.max(0, Math.min(90, +$('#fv-days').value || 7)); c.fv.sendEmail = $('#fv-mail').checked;
      ['commission', 'subscription', 'cancel', 'expired'].forEach((k) => { c.fv.kinds[k] = $('#fv-k-' + k).checked; c.fv.names[k] = $('#fv-n-' + k).value.trim() || INT.DEFAULTS.fv.names[k]; });
      INT.saveSettings(c);
      const hadKey = !!$('#fv-token').value; $('#fv-token').value = '';
      renderInt();
      const m = $('#view-int .int-card:nth-child(2) .int-msg');
      say(m, hadKey ? 'int.savedKey' : 'int.saved', hadKey);
    });
    grid.appendChild(fv);
    box.appendChild(grid);
    preview();

    /* --- faktury do wystawienia --- */
    const qc = el('section', 'admin-card st-card');
    const q = INT.queue();
    qc.appendChild(el('h2', null, t('int.qTitle')));
    qc.appendChild(el('p', 'st-note', q.length ? tv('int.qNote', { x: q.length }) : t('int.qEmpty')));
    if (q.length) {
      const tbl = el('table', 'st-table int-q');
      const hr = el('tr'); [t('int.qDate'), t('int.qBuyer'), t('int.qItem'), t('int.qNet'), 'VAT', t('int.qGross'), t('int.qStatus')].forEach((h) => hr.appendChild(el('th', null, h)));
      tbl.appendChild(hr);
      q.slice(0, 50).forEach((it) => {
        const tr = el('tr');
        const buyer = el('td'); buyer.append(el('b', null, it.buyer.name), el('small', null, (it.buyer.nip ? 'NIP ' + it.buyer.nip : t('int.qNoNip')) + (it.buyer.address ? ' · ' + it.buyer.address : ' · ' + t('int.qNoAddr'))));
        const pos = el('td');
        pos.appendChild(el('span', null, it.position.name));
        const det = el('details', 'int-json');
        det.append(el('summary', null, t('int.qPayload')), el('pre', null, JSON.stringify(INT.fakturowniaPayload(it), null, 2)));
        pos.appendChild(det);
        tr.append(el('td', null, fmtDate(it.at)), buyer, pos, el('td', 'num', zl2(it.position.net)), el('td', 'num', it.position.vat + '%'), el('td', 'num', zl2(it.position.gross)),
          el('td', null, t(it.paid ? 'int.qPaid' : 'int.qPending')));
        tbl.appendChild(tr);
      });
      const sc = el('div', 'st-scroll'); sc.appendChild(tbl);
      qc.appendChild(sc);
    }
    box.appendChild(qc);
  }

  function decide(r, approve) {
    if (!auth.decide(r.id, approve)) return;
    live.textContent = tx(approve ? 'adm.approved' : 'adm.rejected', r.company);
    render(); renderStats();
  }

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));

  $('#adm-logout').addEventListener('click', () => { auth.logout(); show(); });

  // logowanie administratora
  const form = $('#admin-form');
  const errBox = $('#adm-err');
  const btn = $('.auth-submit', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg(errBox, null);
    const login = $('#adm-login').value.trim(), pass = $('#adm-pass').value;
    if (!login || !pass) return msg(errBox, 'adm.e.empty');
    btn.disabled = true; btn.classList.add('is-loading');
    const res = await auth.login(login, pass, false);
    btn.disabled = false; btn.classList.remove('is-loading');
    if (!res.ok) { msg(errBox, 'adm.e.bad'); $('#adm-pass').value = ''; return; }
    if (res.role !== 'admin') { auth.logout(); return msg(errBox, 'adm.e.role'); }
    form.reset();
    show();
  });

  // zmiana hasła administratora
  const pw = $('#pw-form');
  const pwErr = $('#pw-err'), pwOk = $('#pw-ok'), pwBtn = $('.auth-submit', pw);
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg(pwErr, null); pwOk.hidden = true;
    const cur = $('#pw-current').value, nw = $('#pw-new').value, rp = $('#pw-repeat').value;
    const fail = (key, id) => { msg(pwErr, key); if (id) $(id).focus(); };
    if (!cur || !nw || !rp) return fail('adm.e.fill');
    if (nw !== rp) return fail('adm.e.mismatch', '#pw-repeat');
    if (nw === cur) return fail('adm.e.same', '#pw-new');
    pwBtn.disabled = true; pwBtn.classList.add('is-loading');
    const res = await auth.changePassword(cur, nw);
    pwBtn.disabled = false; pwBtn.classList.remove('is-loading');
    if (!res.ok) return res.error === 'weak' ? fail('adm.e.weak', '#pw-new') : fail('adm.e.current', '#pw-current');
    pw.reset();
    pwOk.hidden = false;
    $('#adm-warn').hidden = !auth.adminHasDefaultPassword();
  });

  // zmiana języka: przetłumacz to, co skrypt wygenerował sam
  document.addEventListener('anws:lang', () => {
    [errBox, pwErr].forEach((b) => { if (b.dataset.key) b.textContent = t(b.dataset.key); });
    const s = isAdmin();
    if (s) { $('#adm-who').textContent = t('adm.who') + ' ' + s.login; render(); renderStats(); if (view === 'int') renderInt(); }
  });

  show();
})();
