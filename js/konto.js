// ANWS — panel klienta: model rozliczeń (prowizja ⇄ abonament), dane firmy, dane kontaktowe, hasło, historia opłat

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement;
  const auth = window.ANWSAuth;
  if (!auth) return;

  // tylko dla zalogowanych — bez sesji: strona główna otworzy logowanie i wróci tutaj
  const session = auth.getSession();
  if (!session) { location.replace('index.html?next=konto.html'); return; }
  if (session.role === 'admin') { location.replace('admin.html'); return; }
  root.classList.remove('js-guard');
  const me = session.login;
  const orders = window.ANWSOrders;

  const DICT = window.I18N || {};
  const t = (k, vars) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    let s = (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : (DICT.pl[k] != null ? DICT.pl[k] : k);
    if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  };
  const locale = () => (root.lang === 'en' ? 'en-GB' : 'pl-PL');
  const zl = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2, useGrouping: 'always' }).format(n) + ' zł';
  const day = (ms) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (cls, text, onClick) => { const b = el('button', 'call-btn ' + cls, text); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };
  // +48500600700 → +48 500 600 700
  const fmtPhone = (p) => {
    const m = String(p || '').match(/^\+48(\d{9})$/);
    if (m) return '+48 ' + m[1].replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    const n = String(p || '').match(/^\+(\d{2,3})(\d+)$/);
    return n ? '+' + n[1] + ' ' + n[2].replace(/(\d{3})(?=\d)/g, '$1 ') : p;
  };
  // dowolny zapis → E.164; bez numeru kierunkowego przyjmujemy +48
  const toE164 = (v) => {
    let d = String(v || '').replace(/[\s().\/-]/g, '');
    if (d.startsWith('00')) d = '+' + d.slice(2);
    if (/^\d{9}$/.test(d)) d = '+48' + d;
    return /^\+\d{8,15}$/.test(d) && (!d.startsWith('+48') || d.length === 12) ? d : null;
  };

  /* ---------- nagłówek ---------- */
  function renderHead() {
    const pr = auth.profile(me);
    $('#acc-company').textContent = pr.company;
    $('#acc-login').textContent = pr.login;
    $('#acc-since').textContent = pr.activatedAt ? t('k.since', { x: day(pr.activatedAt) }) : '';
    document.title = t('k.metaTitle');
  }
  /* ---------- model rozliczeń ---------- */
  let confirmBuy = false; // drugi krok przy płatności za abonament
  function renderPlan() {
    const p = auth.getPlan(me);
    const now = Date.now();
    const subOn = p.paidUntil > now; // abonament opłacony (trwa albo zacznie się po darmowym miesiącu)
    $('#acc-need').hidden = p.chosen;

    // karta stanu
    const box = $('#pl-status');
    box.textContent = '';
    box.dataset.kind = !p.chosen ? 'need' : subOn ? 'sub' : 'comm';
    box.appendChild(el('span', 'pl-label', t('k.current')));
    box.appendChild(el('h3', 'pl-now', !p.chosen ? t('k.nowNone') : subOn ? t('p.b.title') : t('k.nowComm')));
    if (subOn) {
      const start = p.upcoming ? p.subStart : (p.history.filter((h) => h.type === 'sub' && h.from <= now).map((h) => h.from).sort((a, b) => b - a)[0] || p.subStart);
      const total = p.paidUntil - start, left = Math.max(0, p.paidUntil - now);
      const daysLeft = Math.ceil(left / 864e5);
      box.appendChild(el('p', 'pl-line', p.upcoming ? t('k.subUpcoming', { x: day(p.subStart), y: day(p.paidUntil) }) : t('k.subUntil', { x: day(p.paidUntil) })));
      if (!p.upcoming) {
        const bar = el('div', 'pl-bar');
        const head = el('div', 'pl-bar-head');
        head.append(el('span', null, t('k.daysLeft')), el('b', null, t('k.days', { x: daysLeft })));
        const track = el('span', 'pl-track'); const fill = el('span', 'pl-fill');
        fill.style.width = Math.max(3, Math.min(100, left / total * 100)).toFixed(1) + '%';
        track.appendChild(fill); bar.append(head, track);
        box.appendChild(bar);
      }
      box.appendChild(el('p', 'pl-note', p.switchToCommission ? t('k.switchPlanned', { x: day(p.paidUntil) }) : t('k.autoNote')));
    } else if (p.chosen) {
      box.appendChild(el('p', 'pl-line', t('k.commLine')));
    } else {
      box.appendChild(el('p', 'pl-line', t('k.noneLine')));
    }
    if (now < p.freeUntil) box.appendChild(el('p', 'pl-free', t('k.trial', { x: day(p.freeUntil) })));

    // opcje
    document.querySelectorAll('.pl-opt').forEach((o) => {
      const cur = p.chosen && (o.dataset.opt === 'subscription' ? subOn : !subOn);
      o.classList.toggle('is-current', cur);
      o.classList.toggle('is-next', p.switchToCommission && o.dataset.opt === 'commission');
    });
    const comm = $('#pl-act-comm'), sub = $('#pl-act-sub');
    comm.textContent = ''; sub.textContent = '';

    // prowizja
    if (!p.chosen && !subOn) comm.appendChild(btn('call-btn-primary', t('k.chooseComm'), () => { auth.choosePlan(me, 'commission'); done('k.doneComm'); }));
    else if (!subOn) comm.appendChild(el('span', 'pl-tag', t('k.yourPlan')));
    else if (p.switchToCommission) comm.appendChild(el('span', 'pl-tag is-next', t('k.fromDay', { x: day(p.paidUntil) })));
    else comm.appendChild(btn('call-btn-ghost', t('k.toComm'), () => { auth.choosePlan(me, 'commission'); done('k.doneToComm', { x: day(p.paidUntil) }); }));

    // abonament
    if (p.switchToCommission) {
      sub.appendChild(btn('call-btn-ghost', t('k.keepSub'), () => { auth.keepSubscription(me); done('k.doneKeep'); }));
    } else if (confirmBuy) {
      const from = subOn ? p.paidUntil : Math.max(now, p.freeUntil);
      const conf = el('div', 'pl-confirm');
      conf.appendChild(el('p', null, t('k.payInfo', { x: zl(p.price), y: day(from), z: day(from + p.days * 864e5) })));
      const row = el('div', 'pl-confirm-row');
      const pay = btn('call-btn-primary auth-submit', '', async () => {
        pay.disabled = true; pay.classList.add('is-loading');
        await auth.buySubscription(me);
        confirmBuy = false;
        done(subOn ? 'k.doneExtend' : 'k.doneSub');
      });
      pay.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
      pay.appendChild(el('span', null, t('k.pay', { x: zl(p.price) })));
      row.append(btn('call-btn-ghost', t('g.cancel'), () => { confirmBuy = false; renderPlan(); }), pay);
      conf.appendChild(row);
      conf.appendChild(el('p', 'pl-small', t('k.payNote')));
      sub.appendChild(conf);
      setTimeout(() => pay.focus(), 30);
    } else {
      sub.appendChild(btn(subOn ? 'call-btn-ghost' : 'call-btn-primary', t(subOn ? 'k.extend' : 'k.buy', { x: zl(p.price) }), () => { confirmBuy = true; renderPlan(); }));
    }
  }
  function done(key, vars) {
    renderPlan(); renderHistory();
    if (window.ANWSAccount) window.ANWSAccount.refresh(); // kropka przy kole zębatym
    const s = $('#pl-status');
    s.appendChild(el('p', 'pl-done', t(key, vars)));
  }

  /* ---------- dane firmy (tylko do odczytu) ---------- */
  function renderCompany() {
    const pr = auth.profile(me);
    const dl = $('#co-list');
    dl.textContent = '';
    const row = (label, value) => { const d = el('div'); d.append(el('dt', null, label), el('dd', null, value || '—')); dl.appendChild(d); };
    row(t('reg.company'), pr.company);
    row('NIP', pr.nip);
    row('KRS', pr.krs);
    row('REGON', pr.regon);
    row(t('adm.f.pkd'), pr.pkd.length ? pr.pkd.join(', ') : '');
    row(t('auth.login'), pr.login);
    row(t('k.registered'), pr.createdAt ? day(pr.createdAt) : '');
    row(t('k.activated'), pr.activatedAt ? day(pr.activatedAt) : '');
  }

  /* ---------- dane kontaktowe ---------- */
  const cd = { form: $('#cd-form'), person: $('#cd-person'), email: $('#cd-email'), phone: $('#cd-phone'), alarm: $('#cd-alarm'), save: $('#cd-save'), ok: $('#cd-ok') };
  let saved = null;
  const values = () => [cd.person, cd.email, cd.phone, cd.alarm].map((i) => i.value.trim()).join('|');
  function fillContact() {
    const pr = auth.profile(me);
    cd.person.value = pr.contactName; cd.email.value = pr.email;
    cd.phone.value = fmtPhone(pr.phone); cd.alarm.value = fmtPhone(pr.alarmPhone);
    saved = values(); cd.save.disabled = true;
  }
  const setErr = (input, key) => { input.setAttribute('aria-invalid', 'true'); const e = $('#' + input.id + '-err'); e.dataset.key = key; e.textContent = t(key); e.hidden = false; };
  const clearErr = (input) => { input.removeAttribute('aria-invalid'); const e = $('#' + input.id + '-err'); e.hidden = true; e.dataset.key = ''; };
  cd.form.addEventListener('input', (e) => { if (e.target.id) clearErr(e.target); cd.ok.hidden = true; cd.save.disabled = values() === saved; });
  cd.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errs = [];
    if (!/^\p{L}[\p{L}'’.-]*(\s+\p{L}[\p{L}'’.-]*)+$/u.test(cd.person.value.trim())) { setErr(cd.person, 'reg.e.person'); errs.push(cd.person); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cd.email.value.trim())) { setErr(cd.email, 'reg.e.email'); errs.push(cd.email); }
    const phone = toE164(cd.phone.value), alarm = toE164(cd.alarm.value);
    if (!phone) { setErr(cd.phone, 'k.e.phone'); errs.push(cd.phone); }
    if (!alarm) { setErr(cd.alarm, 'k.e.phone'); errs.push(cd.alarm); }
    if (errs.length) { errs[0].focus(); return; }
    cd.save.disabled = true; cd.save.classList.add('is-loading');
    const res = await auth.updateProfile(me, { contactName: cd.person.value.trim().replace(/\s+/g, ' '), email: cd.email.value.trim(), phone, alarmPhone: alarm });
    cd.save.classList.remove('is-loading');
    if (!res.ok) { setErr(cd.email, 'reg.e.emailTaken'); cd.email.focus(); cd.save.disabled = false; return; }
    fillContact();
    cd.ok.hidden = false;
  });

  /* ---------- hasło ---------- */
  const pw = $('#pw-form'), pwErr = $('#pw-err'), pwOk = $('#pw-ok'), pwBtn = $('.auth-submit', pw);
  const pwMsg = (key) => { pwErr.dataset.key = key || ''; pwErr.textContent = key ? t(key) : ''; pwErr.hidden = !key; };
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwMsg(null); pwOk.hidden = true;
    const cur = $('#pw-current').value, nw = $('#pw-new').value, rp = $('#pw-repeat').value;
    if (!cur || !nw || !rp) return pwMsg('adm.e.fill');
    if (nw !== rp) { pwMsg('adm.e.mismatch'); return $('#pw-repeat').focus(); }
    if (nw === cur) { pwMsg('adm.e.same'); return $('#pw-new').focus(); }
    pwBtn.disabled = true; pwBtn.classList.add('is-loading');
    const res = await auth.changePassword(cur, nw);
    pwBtn.disabled = false; pwBtn.classList.remove('is-loading');
    if (!res.ok) { pwMsg(res.error === 'weak' ? 'adm.e.weak' : 'adm.e.current'); return $(res.error === 'weak' ? '#pw-new' : '#pw-current').focus(); }
    pw.reset(); pwOk.hidden = false;
  });

  /* ---------- historia opłat: abonament, prowizje, opłaty za anulowanie / niepodjęte zlecenia ---------- */
  function renderHistory() {
    const items = [];
    auth.getPlan(me).history.forEach((h) => items.push({ at: h.at, title: t(h.type === 'grant' ? 'k.hGrant' : 'k.hSub', { x: day(h.from), y: day(h.to) }), amount: h.amount, state: h.type === 'grant' ? 'free' : 'paid' }));
    if (orders) {
      orders.list().filter((o) => o.reservedBy === me && o.fee).forEach((o) => items.push({ at: o.reservedAt, title: t('k.hComm', { x: o.from.label + ' → ' + o.to.label }), amount: o.fee.amount, state: o.fee.paid ? 'paid' : 'invoice' }));
      orders.fees(me).forEach((f) => items.push({ at: f.at, title: t(f.type === 'cancel' ? 'k.hCancel' : 'k.hExpired', { x: f.route }), amount: f.amount, state: f.paid ? 'paid' : 'due' }));
    }
    items.sort((a, b) => b.at - a.at);
    const ul = $('#hi-list');
    ul.textContent = '';
    if (!items.length) { ul.appendChild(el('li', 'acc-empty', t('k.hEmpty'))); return; }
    items.forEach((x) => {
      const li = el('li', 'hi-item');
      const left = el('span', 'hi-text');
      left.append(el('b', null, x.title), el('span', 'ob-meta', new Date(x.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })));
      const right = el('span', 'hi-amt');
      right.append(el('b', null, zl(x.amount)), el('span', 'hi-state is-' + x.state, t('k.st.' + x.state)));
      li.append(left, right);
      ul.appendChild(li);
    });
  }

  /* ---------- historia przewozów: zlecone i wykonane, z filtrami (domyślnie wszystko) ---------- */
  const confirmDoc = () => window.ANWSConfirm;
  const ICON_DOC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path></svg>';
  const ICON_DL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"></path></svg>';
  const PAGE = Infinity; // wszystkie pozycje; okienko pokazuje 10 i przewija resztę
  const hs = { tab: 'posted', q: '', status: '', from: '', to: '', arch: false, shown: PAGE };
  const cf = { shown: Infinity };
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  const dtShort = (ms) => new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // kontrahent widoczny dopiero po rezerwacji (tak jak w „Twoich zleceniach”)
  const shortName = (n) => String(n || '').replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/gi, 'Sp. z o.o.').replace(/SPÓŁKA AKCYJNA/gi, 'S.A.').replace(/SPÓŁKA KOMANDYTOWA/gi, 'Sp.k.').replace(/SPÓŁKA JAWNA/gi, 'Sp.j.').replace(/\s+/g, ' ').trim();
  const counterpart = (o) => (o.reservedBy ? (o.owner === me ? o.reservedBy : o.owner) : null);
  const routeOf = (o) => { const st = orders.stops(o); return st.pickups.concat(st.drops, st.end ? [st.end] : []); };
  const iconBtn = (cls, svg, label, onClick) => { const b = el('button', 'ib ' + cls); b.type = 'button'; b.innerHTML = svg; b.title = label; b.setAttribute('aria-label', label); b.addEventListener('click', onClick); return b; };

  function hsFiltered() {
    const all = orders.history(me)[hs.tab].slice().sort((a, b) => b.dep - a.dep);
    const q = norm(hs.q.trim());
    const from = hs.from ? new Date(hs.from + 'T00:00').getTime() : -Infinity;
    const to = hs.to ? new Date(hs.to + 'T23:59:59').getTime() : Infinity;
    return {
      all,
      list: all.filter((o) => {
        if (hs.status && orders.state(o) !== hs.status) return false;
        if (o.dep < from || o.dep > to) return false;
        if (hs.arch && !orders.isArchived(o, me)) return false;
        if (q) {
          const cp = counterpart(o);
          const hay = routeOf(o).map((x) => x.label).concat(cp ? auth.nameOf(cp) : '', o.notes || '').map(norm).join(' | ');
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    };
  }
  const hsActive = () => !!(hs.q.trim() || hs.status || hs.from || hs.to || hs.arch);

  function tripItem(o, withDocs) {
    const li = el('li', 'hs-item');
    const st = orders.state(o);
    const when = el('div', 'hs-when');
    when.append(el('b', null, new Date(o.dep).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })), el('span', null, new Date(o.dep).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })));
    const main = el('div', 'hs-main');
    const stops = orders.stops(o);
    const more = stops.pickups.length + stops.drops.length - 2;
    main.appendChild(el('b', 'hs-route', o.from.label + ' → ' + o.to.label + (more > 0 ? ' ' + t('k.hsMore', { x: more }) : '')));
    const meta = el('span', 'hs-meta');
    const cp = counterpart(o);
    const bits = [t('g.pax', { x: o.pax }), t('g.km', { x: o.km })];
    if (cp) bits.push(t(o.owner === me ? 'g.party.carrier' : 'g.party.client') + ': ' + shortName(auth.nameOf(cp)));
    meta.textContent = bits.join(' · ');
    main.appendChild(meta);
    if (orders.isArchived(o, me)) {
      const tag = el('span', 'hs-arch-tag', t('k.hsArchived'));
      main.appendChild(tag);
    }
    const side = el('div', 'hs-side');
    side.append(el('b', 'hs-rate', zl(o.rate)), el('span', 'hs-st is-' + st, t('k.st2.' + st)));
    const acts = el('div', 'hs-acts');
    const C = confirmDoc();
    if (withDocs && C && C.has(o)) {
      acts.appendChild(iconBtn('hs-doc', ICON_DOC, t('k.cfView'), () => C.open(o.id)));
      acts.appendChild(iconBtn('hs-dl', ICON_DL, t('k.cfPdf'), () => C.download(o)));
    }
    if (orders.isArchived(o, me)) {
      const r = el('button', 'hs-restore', t('k.hsRestoreShort'));
      r.type = 'button';
      r.title = t('k.hsRestore');
      r.setAttribute('aria-label', t('k.hsRestore'));
      r.addEventListener('click', () => { orders.unarchive(o.id, me); renderTrips(); $('#hs-count').textContent = t('k.hsRestored'); });
      acts.appendChild(r);
    }
    li.append(when, main, side, acts);
    return li;
  }

  // okienko listy: wysokość dokładnie na 10 pozycji, dalsze — po przewinięciu w środku
  const VISIBLE = 10;
  function capList(ul) {
    const items = ul.children;
    ul.classList.toggle('is-capped', items.length > VISIBLE);
    if (items.length <= VISIBLE) { ul.style.maxHeight = ''; return; }
    ul.style.maxHeight = '';
    const last = items[VISIBLE - 1];
    ul.style.maxHeight = (last.offsetTop + last.offsetHeight + 2) + 'px';
  }
  addEventListener('resize', () => { capList($('#hs-list')); capList($('#cf-list')); });

  function renderTrips() {
    if (!orders) return;
    const h = orders.history(me);
    $('#hs-n-posted').textContent = h.posted.length;
    $('#hs-n-taken').textContent = h.taken.length;
    document.querySelectorAll('[data-hs]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.hs === hs.tab)));
    const err = $('#hs-err');
    const bad = hs.from && hs.to && hs.from > hs.to;
    err.hidden = !bad;
    if (bad) err.textContent = t('k.hsBadRange');
    const { all, list } = hsFiltered();
    const ul = $('#hs-list');
    ul.textContent = '';
    const sum = list.filter((o) => o.status === 'reserved').reduce((a, o) => a + o.rate, 0);
    $('#hs-count').textContent = !all.length ? '' : hsActive()
      ? t('k.hsFound', { x: list.length, y: all.length }) + (sum ? ' · ' + t('k.hsSum', { x: zl(sum) }) : '')
      : t('k.hsTotal', { x: all.length }) + (sum ? ' · ' + t('k.hsSum', { x: zl(sum) }) : '');
    if (!list.length) ul.appendChild(el('li', 'acc-empty', t(all.length ? 'k.hsNone' : hs.tab === 'posted' ? 'k.hsEmptyPosted' : 'k.hsEmptyTaken')));
    list.slice(0, hs.shown).forEach((o) => ul.appendChild(tripItem(o, true)));
    ul.scrollTop = 0;
    capList(ul);
    const more = $('#hs-more');
    more.hidden = list.length <= hs.shown;
    more.textContent = '';
  }

  function renderConfirms() {
    if (!orders) return;
    const C = confirmDoc();
    const h = orders.history(me);
    const list = h.posted.concat(h.taken).filter((o) => C && C.has(o)).sort((a, b) => (b.reservedAt || b.dep) - (a.reservedAt || a.dep));
    const ul = $('#cf-list');
    ul.textContent = '';
    if (!list.length) ul.appendChild(el('li', 'acc-empty', t('k.cfEmpty')));
    list.slice(0, cf.shown).forEach((o) => {
      const li = el('li', 'hs-item cf-item');
      const ic = el('span', 'cf-ic'); ic.innerHTML = ICON_DOC;
      const main = el('div', 'hs-main');
      main.append(el('b', 'hs-route', C.number(o)), el('span', 'hs-meta', o.from.label + ' → ' + o.to.label + ' · ' + dtShort(o.dep) + ' · ' + t(o.owner === me ? 'k.cfAsOwner' : 'k.cfAsCarrier')));
      const acts = el('div', 'hs-acts');
      const view = el('button', 'call-btn call-btn-ghost cf-btn', t('k.cfView')); view.type = 'button';
      view.addEventListener('click', () => C.open(o.id));
      const dl = el('button', 'call-btn call-btn-primary cf-btn'); dl.type = 'button';
      dl.innerHTML = ICON_DL; dl.appendChild(el('span', null, t('k.cfPdfShort')));
      dl.setAttribute('aria-label', t('k.cfPdf') + ': ' + C.number(o));
      dl.addEventListener('click', async () => { dl.disabled = true; await C.download(o); dl.disabled = false; });
      acts.append(view, dl);
      li.append(ic, main, acts);
      ul.appendChild(li);
    });
    capList(ul);
    const more = $('#cf-more');
    more.hidden = list.length <= cf.shown;
    more.textContent = '';
  }

  document.querySelectorAll('[data-hs]').forEach((b) => b.addEventListener('click', () => { hs.tab = b.dataset.hs; hs.shown = PAGE; renderTrips(); }));
  const hsForm = $('#hs-filters');
  hsForm.addEventListener('submit', (e) => e.preventDefault());
  hsForm.addEventListener('input', () => {
    hs.q = $('#hs-q').value; hs.status = $('#hs-status').value; hs.from = $('#hs-from').value; hs.to = $('#hs-to').value; hs.arch = $('#hs-arch').checked;
    hs.shown = PAGE; renderTrips();
  });
  hsForm.addEventListener('change', () => hsForm.dispatchEvent(new Event('input')));
  hsForm.addEventListener('reset', () => setTimeout(() => { Object.assign(hs, { q: '', status: '', from: '', to: '', arch: false, shown: PAGE }); renderTrips(); }, 0));
  $('#hs-more').addEventListener('click', () => { hs.shown += PAGE; renderTrips(); });
  $('#cf-more').addEventListener('click', () => { cf.shown += 10; renderConfirms(); });

  function renderAll() { renderHead(); renderPlan(); renderCompany(); renderHistory(); renderTrips(); renderConfirms(); }
  document.addEventListener('anws:lang', () => {
    renderAll();
    [...document.querySelectorAll('.field-err')].forEach((e) => { if (e.dataset.key) e.textContent = t(e.dataset.key); });
  });
  renderAll();
  fillContact();
  if (['#model', '#historia', '#potwierdzenia'].includes(location.hash)) setTimeout(() => $(location.hash).scrollIntoView({ block: 'start' }), 60);
})();
