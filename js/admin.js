// ANWS — panel administratora: akceptacja wniosków o rejestrację (etap 2)

(function () {
  const $ = (s) => document.querySelector(s);
  const auth = window.ANWSAuth;
  if (!auth) return;

  const loginBox = $('#admin-login');
  const panel = $('#admin-panel');
  const list = $('#reg-list');
  const live = $('#adm-live');
  let filter = 'pending';

  const fmtDate = (ts) => new Date(ts).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const STATUS = { pending: 'Oczekuje', approved: 'Zaakceptowany', rejected: 'Odrzucony' };
  const TYPE = { carrier: 'Przewoźnik', client: 'Zlecający' };

  function isAdmin() {
    const s = auth.getSession();
    return s && s.role === 'admin' ? s : null;
  }

  function show() {
    const s = isAdmin();
    loginBox.hidden = !!s;
    panel.hidden = !s;
    if (s) { $('#adm-who').textContent = 'Zalogowano: ' + s.login; render(); }
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
    if (!shown.length) list.appendChild(el('p', 'reg-empty', filter === 'pending' ? 'Brak wniosków czekających na decyzję.' : 'Brak wniosków w tej kategorii.'));

    shown.forEach((r) => {
      const card = el('article', 'reg-card');
      const head = el('div', 'rc-head');
      head.appendChild(el('h3', null, r.company));
      const tags = el('div', 'rc-tags');
      tags.appendChild(el('span', 'rc-tag', TYPE[r.type] || r.type));
      tags.appendChild(el('span', 'rc-tag st-' + r.status, STATUS[r.status]));
      head.appendChild(tags);
      card.appendChild(head);

      const dl = el('dl', 'rc-grid');
      row(dl, 'NIP', r.nip, 'https://www.podatki.gov.pl/wykaz-podatnikow-vat-wyszukiwarka');
      row(dl, 'KRS', r.krs || 'brak (CEIDG)', r.krs ? 'https://wyszukiwarka-krs.ms.gov.pl/' : null);
      row(dl, 'REGON', r.regon);
      row(dl, 'PKD przewozu osób', r.pkd && r.pkd.length ? r.pkd.join(', ') : (r.type === 'client' ? 'nie dotyczy (zlecający)' : 'brak'));
      row(dl, 'Login', r.login);
      row(dl, 'E-mail', r.email, 'mailto:' + r.email);
      row(dl, 'Telefon kontaktowy', r.phone, 'tel:' + r.phone.replace(/[^\d+]/g, ''));
      row(dl, 'Telefon alarmowy', r.alarmPhone, 'tel:' + r.alarmPhone.replace(/[^\d+]/g, ''));
      row(dl, 'Wniosek z dnia', fmtDate(r.createdAt));
      if (r.decidedAt) row(dl, 'Decyzja', fmtDate(r.decidedAt));
      card.appendChild(dl);

      if (r.status === 'pending') {
        const actions = el('div', 'rc-actions');
        const ok = el('button', 'call-btn call-btn-primary', 'Akceptuj');
        const no = el('button', 'call-btn call-btn-ghost', 'Odrzuć');
        ok.type = no.type = 'button';
        ok.addEventListener('click', () => decide(r, true));
        no.addEventListener('click', () => { if (confirm(`Odrzucić wniosek firmy ${r.company}? Klient dostanie e-mail z informacją.`)) decide(r, false); });
        actions.append(ok, no);
        card.appendChild(actions);
      }
      list.appendChild(card);
    });

    const ob = $('#ob-list');
    ob.textContent = '';
    const mails = auth.outbox();
    if (!mails.length) ob.appendChild(el('li', null, 'Brak wiadomości.'));
    mails.forEach((m) => {
      const li = el('li');
      li.appendChild(el('span', 'ob-meta', `Do: ${m.to} · ${fmtDate(m.at)}`));
      li.appendChild(el('b', null, m.subject));
      li.appendChild(el('span', null, m.body));
      ob.appendChild(li);
    });
  }

  function decide(r, approve) {
    if (!auth.decide(r.id, approve)) return;
    live.textContent = approve ? `Zaakceptowano: ${r.company}. Wysłano e-mail do klienta.` : `Odrzucono: ${r.company}. Wysłano e-mail do klienta.`;
    render();
  }

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));

  $('#adm-logout').addEventListener('click', () => { auth.logout(); show(); });

  const form = $('#admin-form');
  const errBox = $('#adm-err');
  const btn = $('.auth-submit', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const login = $('#adm-login').value.trim(), pass = $('#adm-pass').value;
    if (!login || !pass) { errBox.textContent = 'Wpisz login i hasło.'; errBox.hidden = false; return; }
    btn.disabled = true; btn.classList.add('is-loading');
    const res = await auth.login(login, pass, false);
    btn.disabled = false; btn.classList.remove('is-loading');
    if (!res.ok) { errBox.textContent = 'Nieprawidłowy login lub hasło.'; errBox.hidden = false; $('#adm-pass').value = ''; return; }
    if (res.role !== 'admin') { auth.logout(); errBox.textContent = 'To konto nie ma uprawnień administratora.'; errBox.hidden = false; return; }
    form.reset();
    show();
  });

  show();
})();
