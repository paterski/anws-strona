/* ANWS — płatności PayU (abonament, opłaty za anulowanie / niepodjęte zlecenie, prowizje).
 *
 * Docelowy przebieg (po podłączeniu serwera):
 *   1. strona prosi serwer o płatność → serwer tworzy zamówienie w PayU (POST /api/v2_1/orders,
 *      kwota brutto w groszach, opis, e-mail i NIP klienta, notifyUrl, continueUrl),
 *   2. klient płaci na stronie PayU (BLIK, szybki przelew, karta) i wraca na ANWS (continueUrl),
 *   3. PayU wysyła serwerowi powiadomienie (status COMPLETED, podpis sprawdzany drugim kluczem MD5),
 *   4. serwer oznacza opłatę jako zapłaconą i wystawia w Fakturowni fakturę opłaconą.
 * Prototyp (bez serwera): okno płatności w trybie testowym — nic nie jest pobierane z konta.
 * Gdy PayU jest wyłączone w panelu administratora, opłata jest od razu oznaczana jako zapłacona.
 */
(function () {
  const PAY_KEY = 'anws-payments';
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  const load = () => safe(() => JSON.parse(localStorage.getItem(PAY_KEY)) || [], []);
  const save = (v) => safe(() => localStorage.setItem(PAY_KEY, JSON.stringify(v.slice(0, 300))));
  const DICT = window.I18N || {};
  const t = (k, vars) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    let s = (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : (DICT.pl[k] != null ? DICT.pl[k] : k);
    if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  };
  const zl = (n) => new Intl.NumberFormat(root.lang === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(n) + ' zł';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cfg = () => (window.ANWSInt ? window.ANWSInt.settings() : { payu: { enabled: false, kinds: {} }, fv: { vat: 23 } });
  const round2 = (n) => Math.round(n * 100) / 100;

  // czy dany rodzaj opłaty idzie przez PayU
  const enabledFor = (kind) => { const c = cfg().payu; return !!(c.enabled && c.kinds[kind]); };

  function record(p) { const list = load(); list.unshift(p); save(list); return p; }
  const newId = () => 'PAYU-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

  /* ---------- okno płatności ---------- */
  let dlg = null, resolveFn = null, current = null;
  const METHODS = [['blik', 'BLIK'], ['pbl', 'pay.pbl'], ['card', 'pay.card']];
  function build() {
    dlg = el('dialog', 'call-dlg auth-dlg pay-dlg');
    dlg.setAttribute('aria-labelledby', 'pay-title');
    dlg.innerHTML = `<div class="call-panel auth-panel g-dlg">
      <button type="button" class="call-x" data-close><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></button>
      <div class="pay-brand"><span class="pay-logo">PayU</span><span class="pay-env" id="pay-env"></span></div>
      <h2 class="auth-title" id="pay-title"></h2>
      <div class="pay-body" id="pay-body"></div>
    </div>`;
    document.body.appendChild(dlg);
    $('[data-close]', dlg).addEventListener('click', () => finish({ ok: false }));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!dlg.classList.contains('is-busy')) finish({ ok: false }); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg && !dlg.classList.contains('is-busy')) finish({ ok: false }); });
  }
  function close() {
    if (!dlg || !dlg.open) return;
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.close(); dlg.classList.remove('is-closing', 'is-busy'); }, reduce() ? 0 : 160);
  }
  function finish(res) { const r = resolveFn; resolveFn = null; close(); if (r) r(res); }

  function step1() {
    const c = cfg(), p = current;
    $('#pay-title', dlg).textContent = t('pay.title');
    $('[data-close]', dlg).setAttribute('aria-label', t('call.close'));
    $('#pay-env', dlg).textContent = c.payu.env === 'production' ? '' : t('pay.sandbox');
    const body = $('#pay-body', dlg);
    body.textContent = '';
    const box = el('div', 'dlg-box pay-sum');
    p.items.forEach((it) => { const r = el('div', 'db-row'); r.append(el('span', null, it.title), el('b', null, zl(it.net))); box.appendChild(r); });
    const row = (l, v, cls) => { const r = el('div', 'db-row' + (cls ? ' ' + cls : '')); r.append(el('span', null, l), el('b', null, v)); box.appendChild(r); };
    row(t('pay.net'), zl(p.net), 'pay-sub');
    row(t('pay.vat', { x: p.vat }), zl(p.gross - p.net), 'pay-sub');
    row(t('pay.total'), zl(p.gross), 'db-total');
    body.appendChild(box);
    const fs = el('fieldset', 'pay-methods');
    fs.appendChild(el('legend', null, t('pay.method')));
    METHODS.forEach(([v, k], i) => {
      const l = el('label', 'pay-m');
      const r = el('input'); r.type = 'radio'; r.name = 'pay-m'; r.value = v; if (i === 0) r.checked = true;
      l.append(r, el('span', null, k === 'BLIK' ? 'BLIK' : t(k)));
      fs.appendChild(l);
    });
    body.appendChild(fs);
    body.appendChild(el('p', 'db-note', t(c.payu.env === 'production' ? 'pay.noteProd' : 'pay.noteSandbox')));
    const acts = el('div', 'dlg-actions');
    const no = el('button', 'call-btn call-btn-ghost', t('g.cancel')); no.type = 'button';
    no.addEventListener('click', () => finish({ ok: false }));
    const yes = el('button', 'call-btn call-btn-primary auth-submit'); yes.type = 'button';
    yes.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
    yes.appendChild(el('span', 'auth-submit-label', t('pay.payBtn', { x: zl(p.gross) })));
    yes.addEventListener('click', () => {
      const m = ($('input[name="pay-m"]:checked', dlg) || {}).value || 'blik';
      dlg.classList.add('is-busy');
      yes.disabled = true; no.disabled = true; yes.classList.add('is-loading');
      $('.auth-submit-label', yes).textContent = t('pay.redirect');
      // prototyp: zamiast przekierowania do PayU — chwila „przetwarzania” i potwierdzenie
      setTimeout(() => step2(m), reduce() ? 200 : 1300);
    });
    acts.append(no, yes);
    body.appendChild(acts);
    setTimeout(() => yes.focus(), 40);
  }
  function step2(method) {
    const p = current;
    const pay = record({ id: newId(), at: Date.now(), login: p.login, items: p.items, net: p.net, vat: p.vat, gross: p.gross, method, env: cfg().payu.env, status: 'COMPLETED' });
    dlg.classList.remove('is-busy');
    $('#pay-title', dlg).textContent = t('pay.doneTitle');
    const body = $('#pay-body', dlg);
    body.textContent = '';
    const box = el('div', 'dlg-box is-free pay-ok');
    box.append(el('div', 'db-title', t('pay.doneAmount', { x: zl(p.gross) })), el('p', 'db-note', t('pay.doneId', { x: pay.id })), el('p', 'db-note', t('pay.doneInvoice')));
    body.appendChild(box);
    const ok = el('button', 'call-btn call-btn-primary', t('pay.doneBtn')); ok.type = 'button';
    ok.addEventListener('click', () => finish({ ok: true, id: pay.id }));
    body.appendChild(ok);
    setTimeout(() => ok.focus(), 40);
  }

  /* pay({ login, items: [{ kind, net, title }] }) → Promise<{ ok, id }>
   * id = numer płatności PayU (null, gdy PayU wyłączone dla tego rodzaju opłaty). */
  function pay(req) {
    const kinds = req.items.map((i) => i.kind);
    if (!kinds.some(enabledFor)) return Promise.resolve({ ok: true, id: null });
    const vat = +cfg().fv.vat;
    const net = round2(req.items.reduce((a, i) => a + i.net, 0));
    current = { login: req.login, items: req.items, net, vat, gross: round2(net * (1 + vat / 100)) };
    if (!dlg) build();
    if (resolveFn) resolveFn({ ok: false });
    step1();
    if (!dlg.open) { dlg.classList.remove('is-closing'); dlg.showModal(); }
    return new Promise((res) => { resolveFn = res; });
  }

  window.ANWSPay = { pay, enabledFor, payments: load };
})();
