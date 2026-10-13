// ANWS — okienko rejestracji (etap 1: wniosek; etap 2 — akceptacja w panelu admina)

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const dlg = $('#reg-dialog');
  const auth = window.ANWSAuth;
  const verify = window.ANWSVerify;
  if (!dlg || !auth || !verify) return;

  const DICT = window.I18N || {};
  const t = (k) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    return (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : DICT.pl[k];
  };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const form = $('#reg-form', dlg);
  const panel = $('.reg-panel', dlg);
  const done = $('#reg-done', dlg);
  const foot = $('#reg-foot', dlg);
  const topSteps = $('.reg-panel > .reg-steps', dlg);
  const summary = $('#reg-summary', dlg);
  const summaryList = $('#reg-summary-list', dlg);
  const submit = $('#reg-submit', dlg);
  const submitLabel = $('.auth-submit-label', submit);
  const box = $('#reg-verify', dlg);
  const boxText = $('.verify-text', box);
  const checkBtn = $('#reg-nip-check', dlg);
  const strength = $('#reg-strength', dlg);
  const strengthLabel = $('#reg-strength-label', dlg);

  const f = {
    nip: $('#reg-nip', dlg), company: $('#reg-company', dlg),
    person: $('#reg-person', dlg), email: $('#reg-email', dlg),
    phone: $('#reg-phone', dlg), alarm: $('#reg-alarm', dlg), login: $('#reg-login', dlg),
    pass: $('#reg-pass', dlg), consent: $('#reg-consent', dlg),
  };
  const err = (input) => $('#' + input.id + '-err', dlg);
  const cc = { phone: $('#reg-phone-cc', dlg), alarm: $('#reg-alarm-cc', dlg) };
  const type = () => 'carrier'; // jeden rodzaj konta: przewoźnik (zawsze z weryfikacją PKD)

  let result = null;      // ostatni wynik weryfikacji
  let checking = null;    // trwające sprawdzanie (Promise)
  let busy = false;

  /* ---------- otwieranie / zamykanie ---------- */
  function open() {
    form.hidden = false; foot.hidden = false; topSteps.hidden = false; done.hidden = true;
    if (!dlg.open) { dlg.classList.remove('is-closing'); dlg.showModal(); }
    panel.scrollTop = 0;
    setTimeout(() => f.nip.focus(), 30);
  }
  function close() {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.close(); dlg.classList.remove('is-closing'); if (!done.hidden) resetForm(); }, reduce() ? 0 : 160);
  }
  $$('[data-reg-close]', dlg).forEach((b) => b.addEventListener('click', () => close()));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  // kliknięcie w tło zamyka okno; wpisane dane zostają w formularzu do ponownego otwarcia.
  // Liczy się tylko kliknięcie zaczęte na tle (zaznaczanie tekstu poza okno go nie zamyka).
  let downOnBackdrop = false;
  dlg.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && downOnBackdrop) close(); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-open-register]');
    if (!a) return;
    e.preventDefault();
    const login = $('#auth-dialog');
    if (login && login.open) login.close();
    open();
  });
  $('[data-open-login]', dlg).addEventListener('click', (e) => {
    e.preventDefault();
    close();
    if (window.ANWSOpenAuth) setTimeout(() => window.ANWSOpenAuth(), reduce() ? 0 : 180);
  });

  function resetForm() {
    form.reset(); result = null;
    $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
    $$('.field-err', form).forEach((e) => { e.hidden = true; });
    summary.hidden = true;
    f.company.value = '';
    setStrength('');
    renderVerify({ state: 'idle' });
  }

  /* ---------- weryfikacja NIP ---------- */
  function renderVerify(r) {
    box.dataset.state = r.state;
    boxText.textContent = '';
    const p = (txt, cls) => { const el = document.createElement('p'); if (cls) el.className = cls; el.textContent = txt; boxText.appendChild(el); return el; };
    if (r.state === 'idle') { p(t('v.idle')); return; }
    if (r.state === 'checking') { p(t('v.checking')); return; }
    const res = r.res;
    if (res.ok) {
      p(t('v.okCarrier'));
      const b = document.createElement('b'); b.textContent = res.company.name; boxText.appendChild(b);
      const meta = [res.company.krs ? 'KRS ' + res.company.krs : '', res.company.regon ? 'REGON ' + res.company.regon : '', t('v.vat') + ': ' + res.company.vat].filter(Boolean).join(' · ');
      p(meta, 'verify-meta');
      if (res.matched && res.matched.length) {
        const wrap = document.createElement('div'); wrap.className = 'verify-pkd';
        res.matched.forEach((m) => { const s = document.createElement('span'); s.textContent = 'PKD ' + m.code; s.title = m.desc; wrap.appendChild(s); });
        boxText.appendChild(wrap);
      }
      return;
    }
    p(t('v.' + res.reason));
    if (res.company && res.company.name) { const b = document.createElement('b'); b.textContent = res.company.name; boxText.appendChild(b); }
    const actions = document.createElement('div'); actions.className = 'verify-actions';
    if (res.reason === 'network') {
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = t('v.retry');
      btn.addEventListener('click', runCheck); actions.appendChild(btn);
    }
    if (res.reason === 'ceidg' || res.reason === 'nopkd' || res.reason === 'notfound' || res.reason === 'inactive') {
      const a = document.createElement('a'); a.href = 'tel:+48884106851'; a.textContent = t('v.contact'); actions.appendChild(a);
    }
    if (actions.children.length) boxText.appendChild(actions);
  }

  async function runCheck() {
    const nip = verify.clean(f.nip.value);
    clearErr(f.nip);
    if (!nip) { renderVerify({ state: 'idle' }); return null; }
    if (!verify.nipValid(nip)) {
      result = { ok: false, reason: 'checksum', nip };
      setErr(f.nip, t('v.checksum'));
      renderVerify({ state: 'idle' });
      f.company.value = '';
      return result;
    }
    const want = { nip, type: type() };
    renderVerify({ state: 'checking' });
    checkBtn.disabled = true;
    checking = verify.check(nip, { requirePkd: want.type === 'carrier' });
    const res = await checking;
    checking = null;
    checkBtn.disabled = false;
    // użytkownik zdążył zmienić NIP albo rodzaj konta — wynik nieaktualny
    if (verify.clean(f.nip.value) !== want.nip || type() !== want.type) return null;
    result = Object.assign({ nip, type: want.type }, res);
    f.company.value = res.company ? res.company.name : '';
    if (res.ok) { clearErr(f.company); clearErr(f.nip); }
    renderVerify({ state: res.ok ? 'ok' : 'error', res });
    return result;
  }

  checkBtn.addEventListener('click', runCheck);
  f.nip.addEventListener('input', () => {
    if (result && verify.clean(f.nip.value) !== result.nip) { result = null; f.company.value = ''; renderVerify({ state: 'idle' }); }
    if (verify.clean(f.nip.value).length === 10) runCheck();
  });
  f.nip.addEventListener('blur', () => { if (!result && verify.clean(f.nip.value)) runCheck(); });

  /* ---------- siła hasła ---------- */
  function setStrength(v) {
    let s = 0;
    if (v.length >= 8) s++;
    if (v.length >= 12) s++;
    if (/[a-ząćęłńóśźż]/.test(v) && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(v)) s++;
    if (/\d/.test(v) && /[^\w\s]/.test(v)) s++;
    if (v && s === 0) s = 1;
    strength.dataset.score = String(v ? s : 0);
    strengthLabel.textContent = v ? t('reg.str' + s) : '';
  }
  f.pass.addEventListener('input', () => setStrength(f.pass.value));

  /* ---------- pokaż hasło ---------- */
  const toggle = $('.pass-toggle', dlg);
  toggle.addEventListener('click', () => {
    const show = f.pass.type === 'password';
    f.pass.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', t(show ? 'auth.hide' : 'auth.show'));
    f.pass.focus();
  });

  /* ---------- walidacja ---------- */
  function setErr(input, msg) {
    input.setAttribute('aria-invalid', 'true');
    const e = err(input); if (e) { e.textContent = msg; e.hidden = false; }
  }
  function clearErr(input) {
    input.removeAttribute('aria-invalid');
    const e = err(input); if (e) e.hidden = true;
    // poprawione pole znika też z podsumowania błędów
    const li = summaryList.querySelector('a[href="#' + input.id + '"]');
    if (li) li.parentNode.remove();
    if (!summaryList.children.length) summary.hidden = true;
  }
  form.addEventListener('input', (e) => {
    const i = e.target;
    if (i.id && i.id !== 'reg-nip' && i.getAttribute('aria-invalid')) clearErr(i);
  });
  f.consent.addEventListener('change', () => { if (f.consent.checked) clearErr(f.consent); });

  // Telefon = numer kierunkowy z listy + numer krajowy. Wklejony numer z „+48…” / „0048…”
  // przełącza listę na właściwy kraj. Zapisujemy w formacie międzynarodowym E.164 (+48500600700).
  const digits = (v) => v.replace(/[\s().\/-]/g, '');
  function splitIntl(input, select) {
    let v = digits(input.value);
    const m = v.match(/^(?:\+|00)(\d+)$/);
    if (!m) return;
    const opt = Array.from(select.options).map((o) => o.value).sort((a, b) => b.length - a.length).find((c) => m[1].startsWith(c));
    if (!opt) return;
    select.value = opt;
    input.value = m[1].slice(opt.length);
  }
  const national = (input, select) => {
    const v = digits(input.value);
    return select.value === '39' ? v : v.replace(/^0+/, ''); // zero na początku usuwamy (poza Włochami)
  };
  const validPhone = (input, select) => {
    const n = national(input, select);
    return select.value === '48' ? /^\d{9}$/.test(n) : /^\d{5,12}$/.test(n) && (select.value + n).length <= 15;
  };
  const e164 = (input, select) => '+' + select.value + national(input, select);
  [['phone', f.phone], ['alarm', f.alarm]].forEach(([k, input]) => {
    input.addEventListener('blur', () => splitIntl(input, cc[k]));
    input.addEventListener('paste', () => setTimeout(() => splitIntl(input, cc[k]), 0));
    cc[k].addEventListener('change', () => clearErr(input));
  });
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  const validLogin = (v) => /^[a-zA-Z0-9._-]{3,30}$/.test(v.trim());
  const validPass = (v) => v.length >= 8 && /\p{L}/u.test(v) && /\d/.test(v);
  const validPerson = (v) => /^\p{L}[\p{L}'’.-]*(\s+\p{L}[\p{L}'’.-]*)+$/u.test(v.trim()) && v.trim().length <= 80;

  function validate() {
    const errors = [];
    const add = (input, key, label) => { setErr(input, t(key)); errors.push({ input, msg: t(key), label }); };
    const nip = verify.clean(f.nip.value);
    if (!nip) add(f.nip, 'reg.e.nip');
    else if (!verify.nipValid(nip)) add(f.nip, 'v.checksum');
    else if (!result || !result.ok || result.nip !== nip || result.type !== type()) add(f.nip, 'reg.e.verify');
    if (!validPerson(f.person.value)) add(f.person, 'reg.e.person');
    if (!validEmail(f.email.value)) add(f.email, 'reg.e.email');
    splitIntl(f.phone, cc.phone); splitIntl(f.alarm, cc.alarm);
    if (!validPhone(f.phone, cc.phone)) add(f.phone, cc.phone.value === '48' ? 'reg.e.phone' : 'reg.e.phoneIntl');
    if (!validPhone(f.alarm, cc.alarm)) add(f.alarm, cc.alarm.value === '48' ? 'reg.e.phone' : 'reg.e.phoneIntl');
    if (!validLogin(f.login.value)) add(f.login, 'reg.e.login');
    if (!validPass(f.pass.value)) add(f.pass, 'reg.e.pass');
    if (!f.consent.checked) add(f.consent, 'reg.e.consent');
    return errors;
  }

  function showSummary(errors) {
    summaryList.textContent = '';
    errors.forEach(({ input, msg }) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + input.id;
      const label = $('label[for="' + input.id + '"]', dlg);
      // nazwa pola tylko przy telefonach — mają ten sam komunikat
      a.textContent = (label && input.type === 'tel' ? label.textContent.trim() + ': ' : '') + msg;
      a.addEventListener('click', (e) => { e.preventDefault(); input.focus(); });
      li.appendChild(a); summaryList.appendChild(li);
    });
    summary.hidden = false;
    summary.focus();
  }

  /* ---------- wysłanie wniosku ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    summary.hidden = true;
    busy = true;
    // NIP jeszcze niesprawdzony (albo trwa sprawdzanie) — dokończ przed walidacją
    const nip = verify.clean(f.nip.value);
    if (checking) await checking;
    if (verify.nipValid(nip) && (!result || result.nip !== nip || result.type !== type())) await runCheck();

    const errors = validate();
    if (errors.length) {
      busy = false;
      if (errors.length > 1) showSummary(errors); else errors[0].input.focus();
      return;
    }

    submit.disabled = true; submit.classList.add('is-loading'); submitLabel.textContent = t('reg.sending');
    const res = await auth.register({
      type: type(), login: f.login.value.trim(), password: f.pass.value,
      company: result.company.name, nip, krs: result.company.krs, regon: result.company.regon,
      pkd: (result.matched || []).map((m) => m.code),
      contactName: f.person.value.trim().replace(/\s+/g, ' '),
      phone: e164(f.phone, cc.phone), alarmPhone: e164(f.alarm, cc.alarm), email: f.email.value.trim(),
    });
    busy = false;
    submit.disabled = false; submit.classList.remove('is-loading'); submitLabel.textContent = t('reg.submit');

    if (!res.ok) {
      const map = { login_taken: [f.login, 'reg.e.loginTaken'], nip_taken: [f.nip, 'reg.e.nipTaken'], email_taken: [f.email, 'reg.e.emailTaken'] };
      const [input, key] = map[res.error] || [f.nip, 'v.network'];
      setErr(input, t(key));
      input.focus();
      return;
    }
    $('#reg-done-email', dlg).textContent = f.email.value.trim();
    form.hidden = true; foot.hidden = true; topSteps.hidden = true; done.hidden = false;
    panel.scrollTop = 0;
    done.focus();
  });

  // zmiana języka: odśwież teksty generowane w skrypcie
  document.addEventListener('anws:lang', () => {
    if (box.dataset.state === 'idle' || box.dataset.state === 'checking') renderVerify({ state: box.dataset.state });
    else if (result) renderVerify({ state: result.ok ? 'ok' : 'error', res: result });
    setStrength(f.pass.value);
  });
})();
