// ANWS — strona ustawiania nowego hasła (link z e-maila: reset-hasla.html?token=…)

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

  // token zabieramy z adresu i usuwamy go z paska / historii przeglądarki
  const token = new URLSearchParams(location.search).get('token') || '';
  if (token) history.replaceState(null, '', location.pathname);

  const states = { loading: $('#rs-loading'), invalid: $('#rs-invalid'), form: $('#rs-form'), done: $('#rs-done') };
  const show = (name) => Object.entries(states).forEach(([k, el]) => { el.hidden = k !== name; });

  const pass = $('#rs-pass'), repeat = $('#rs-repeat');
  const passErr = $('#rs-pass-err'), repeatErr = $('#rs-repeat-err');
  const strength = $('#rs-strength'), strengthLabel = $('#rs-strength-label');
  const btn = $('.auth-submit', states.form), btnLabel = $('.auth-submit-label', btn);

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
  const setErr = (input, box, key) => { input.setAttribute('aria-invalid', 'true'); box.dataset.key = key; box.textContent = t(key); box.hidden = false; };
  const clearErr = (input, box) => { input.removeAttribute('aria-invalid'); box.hidden = true; box.dataset.key = ''; };

  pass.addEventListener('input', () => { setStrength(pass.value); clearErr(pass, passErr); });
  repeat.addEventListener('input', () => clearErr(repeat, repeatErr));

  const toggle = $('.pass-toggle');
  toggle.addEventListener('click', () => {
    const showPw = pass.type === 'password';
    pass.type = repeat.type = showPw ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(showPw));
    toggle.setAttribute('aria-label', t(showPw ? 'auth.hide' : 'auth.show'));
    pass.focus();
  });

  states.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErr(pass, passErr); clearErr(repeat, repeatErr);
    const v = pass.value;
    if (v.length < 8 || !/\p{L}/u.test(v) || !/\d/.test(v)) { setErr(pass, passErr, 'reg.e.pass'); pass.focus(); return; }
    if (v !== repeat.value) { setErr(repeat, repeatErr, 'rs.e.mismatch'); repeat.focus(); return; }
    btn.disabled = true; btn.classList.add('is-loading'); btnLabel.textContent = t('rs.saving');
    const res = await auth.resetPassword(token, v);
    btn.disabled = false; btn.classList.remove('is-loading'); btnLabel.textContent = t('rs.submit');
    if (!res.ok && res.error === 'weak') { setErr(pass, passErr, 'reg.e.pass'); pass.focus(); return; }
    if (!res.ok) { show('invalid'); return; }
    show('done');
    states.done.focus();
  });

  document.addEventListener('anws:lang', () => {
    setStrength(pass.value);
    [passErr, repeatErr].forEach((b) => { if (b.dataset.key) b.textContent = t(b.dataset.key); });
  });

  (async () => {
    const check = await auth.checkResetToken(token);
    if (!check.ok) { show('invalid'); return; }
    $('#rs-login').textContent = check.login;
    show('form');
    setTimeout(() => pass.focus(), 50);
  })();
})();
