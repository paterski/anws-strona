// ANWS — okienko „Nie pamiętasz hasła?”: prośba o jednorazowy link na e-mail

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement;
  const dlg = $('#forgot-dialog');
  const auth = window.ANWSAuth;
  if (!dlg || !auth) return;

  const DICT = window.I18N || {};
  const t = (k) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    return (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : DICT.pl[k];
  };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const form = $('#fg-form', dlg);
  const email = $('#fg-email', dlg);
  const errBox = $('#fg-email-err', dlg);
  const submit = $('.auth-submit', form);
  const label = $('.auth-submit-label', submit);
  const sent = $('#fg-sent', dlg);
  const resend = $('#fg-resend', dlg);
  const RESEND_S = 60;
  let timer = 0, left = 0, lastEmail = '', busy = false;

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  function open(prefill) {
    form.hidden = false; sent.hidden = true;
    errBox.hidden = true; email.removeAttribute('aria-invalid');
    if (prefill && prefill.includes('@')) email.value = prefill;
    if (!dlg.open) { dlg.classList.remove('is-closing'); dlg.showModal(); }
    setTimeout(() => email.focus(), 30);
  }
  function close() {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.close(); dlg.classList.remove('is-closing'); }, reduce() ? 0 : 160);
  }

  $('[data-fg-close]', dlg).addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });

  // „Zapomniałem hasła” / „Nie pamiętasz hasła?” w oknie logowania
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-open-forgot]');
    if (!a) return;
    e.preventDefault();
    const login = $('#auth-dialog');
    const typed = login ? $('#auth-login', login).value : '';
    if (login && login.open) login.close();
    open(typed);
  });
  $('[data-fg-login]', dlg).addEventListener('click', (e) => {
    e.preventDefault();
    close();
    if (window.ANWSOpenAuth) setTimeout(() => window.ANWSOpenAuth(), reduce() ? 0 : 180);
  });

  function tick() {
    if (left <= 0) { clearInterval(timer); timer = 0; resend.disabled = false; resend.textContent = t('fg.resend'); return; }
    resend.textContent = t('fg.resendIn').replace('{x}', left);
    left -= 1;
  }
  function startCountdown() {
    clearInterval(timer);
    left = RESEND_S; resend.disabled = true;
    tick(); timer = setInterval(tick, 1000);
  }

  async function send(addr) {
    busy = true;
    const res = await auth.requestReset(addr);
    busy = false;
    return res;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = email.value.trim();
    if (!validEmail(v)) {
      email.setAttribute('aria-invalid', 'true');
      errBox.textContent = t('reg.e.email'); errBox.hidden = false;
      email.focus();
      return;
    }
    submit.disabled = true; submit.classList.add('is-loading'); label.textContent = t('fg.sending');
    await send(v);
    submit.disabled = false; submit.classList.remove('is-loading'); label.textContent = t('fg.submit');
    lastEmail = v;
    $('#fg-sent-email', dlg).textContent = v;
    form.hidden = true; sent.hidden = false;
    sent.focus();
    startCountdown();
  });
  email.addEventListener('input', () => { email.removeAttribute('aria-invalid'); errBox.hidden = true; });

  resend.addEventListener('click', async () => {
    if (busy || !lastEmail) return;
    resend.disabled = true;
    await send(lastEmail);
    resend.textContent = t('fg.resent');
    setTimeout(startCountdown, 900);
  });

  document.addEventListener('anws:lang', () => {
    if (!errBox.hidden) errBox.textContent = t('reg.e.email');
    if (!timer && !resend.disabled) resend.textContent = t('fg.resend');
  });

  // index.html?forgot=1 (np. z wygasłego linku) — otwórz po zejściu loadera
  if (new URLSearchParams(location.search).get('forgot') === '1') {
    const go = () => open('');
    if (!root.classList.contains('is-loading')) go();
    else new MutationObserver((m, o) => {
      if (root.classList.contains('is-loading')) return;
      o.disconnect();
      setTimeout(go, 500);
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
})();
