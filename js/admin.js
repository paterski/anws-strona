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
    if (s) { $('#adm-who').textContent = t('adm.who') + ' ' + s.login; $('#adm-warn').hidden = !auth.adminHasDefaultPassword(); render(); }
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

  function decide(r, approve) {
    if (!auth.decide(r.id, approve)) return;
    live.textContent = tx(approve ? 'adm.approved' : 'adm.rejected', r.company);
    render();
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
    if (s) { $('#adm-who').textContent = t('adm.who') + ' ' + s.login; render(); }
  });

  show();
})();
