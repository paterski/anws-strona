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
      li.appendChild(el('span', 'ob-meta', `${t('adm.to')} ${m.to} · ${fmtDate(m.at)}`));
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
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  const shortName = (n) => String(n || '').replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/gi, 'Sp. z o.o.').replace(/SPÓŁKA AKCYJNA/gi, 'S.A.').replace(/SPÓŁKA KOMANDYTOWA/gi, 'Sp.k.').replace(/SPÓŁKA JAWNA/gi, 'Sp.j.').replace(/\s+/g, ' ').trim();
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
    // dokumenty przewoźników
    const docs = auth.billingAll().map((acc) => ({ login: acc.login, name: auth.nameOf(acc.login), d: auth.docs(acc.login) }));
    return { created, createdPrev, decided, taken, reservedWin, gmv, r30, rAll, weeks, top, docs };
  }

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

    // dokumenty przewoźników
    const c4 = el('section', 'admin-card st-card st-wide');
    c4.appendChild(el('h2', null, t('st.docsTitle')));
    const rank = { expired: 0, missing: 1, soon: 2, ok: 3 };
    const rows = S.docs.map((x) => ({ ...x, worst: Math.min(...Object.values(x.d).map((v) => rank[v.state])) })).sort((a, b) => a.worst - b.worst);
    const issues = rows.filter((x) => x.worst < 3);
    c4.appendChild(el('p', 'st-note', issues.length ? tv('st.docsIssues', { x: issues.length, y: rows.length }) : t('st.docsAllOk')));
    const dt = el('table', 'st-table st-docs');
    const dh = el('tr'); [t('st.carrier'), t('k.doc.license'), t('k.doc.oc'), t('k.doc.nnw')].forEach((h) => dh.appendChild(el('th', null, h))); dt.appendChild(dh);
    rows.forEach((x) => {
      const tr = el('tr');
      const nm = el('td', null, shortName(x.name)); nm.title = x.name; tr.appendChild(nm);
      ['license', 'oc', 'nnw'].forEach((k) => {
        const v = x.d[k];
        const td = el('td');
        td.appendChild(el('span', 'dc-pill is-' + v.state, v.state === 'missing' ? t('k.dcMissing') : v.state === 'expired' ? tv('st.dExpired', { x: new Date(v.until).toLocaleDateString(locale()) })
          : v.state === 'soon' ? tv('k.dcSoon', { x: v.days }) : new Date(v.until).toLocaleDateString(locale())));
        tr.appendChild(td);
      });
      dt.appendChild(tr);
    });
    const scroll = el('div', 'st-scroll'); scroll.appendChild(dt);
    c4.appendChild(scroll);
    grid.appendChild(c4);

    box.appendChild(grid);
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
    if (s) { $('#adm-who').textContent = t('adm.who') + ' ' + s.login; render(); renderStats(); }
  });

  show();
})();
