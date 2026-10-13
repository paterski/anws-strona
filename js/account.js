// ANWS — miejsce konta w menu: „Zaloguj się” albo dzwonek z licznikiem powiadomień i „Wyloguj się”

(function () {
  const root = document.documentElement;
  const auth = window.ANWSAuth;
  const boxes = Array.from(document.querySelectorAll('[data-acct]'));
  if (!auth || !boxes.length) return;

  const DICT = window.I18N || {};
  const t = (k, vars) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    let s = (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : (DICT.pl[k] != null ? DICT.pl[k] : k);
    if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  };
  const locale = () => (root.lang === 'en' ? 'en-GB' : 'pl-PL');
  const zl = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0, useGrouping: 'always' }).format(n) + ' zł';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ago = (ms) => {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    const m = Math.round((ms - Date.now()) / 6e4);
    if (Math.abs(m) < 60) return rtf.format(m, 'minute');
    const h = Math.round(m / 60);
    if (Math.abs(h) < 24) return rtf.format(h, 'hour');
    return rtf.format(Math.round(h / 24), 'day');
  };
  const page = location.pathname.split('/').pop() || 'index.html';

  const ICON = {
    user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4.5 20.5c.9-4 3.9-6 7.5-6s6.6 2 7.5 6"></path></svg>',
    bell: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path></svg>',
    reserve: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
    expired: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    cancelled: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>',
    logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"></path></svg>',
    offer: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"></path><circle cx="8" cy="8" r="1.6" fill="currentColor"></circle></svg>',
  };

  function login() {
    // na stronie głównej otwieramy okno logowania, z innych stron — przez stronę główną i z powrotem
    if (window.ANWSOpenAuth) window.ANWSOpenAuth(page);
    else location.href = 'index.html?next=' + encodeURIComponent(page);
  }

  // wylogowanie: z giełdy (tylko dla zalogowanych) wracamy na stronę główną, na pozostałych stronach zostajemy
  function logout() {
    auth.logout();
    if (document.body.classList.contains('app')) location.href = 'index.html';
    else renderAll();
  }

  function renderBox(box) {
    box.textContent = '';
    const s = auth.getSession();
    if (!s) {
      const b = el('button', 'acct-login');
      b.type = 'button';
      b.setAttribute('aria-label', t('auth.title'));
      b.innerHTML = ICON.user;
      b.appendChild(el('span', null, t('auth.title')));
      b.addEventListener('click', login);
      box.appendChild(b);
      return;
    }
    const n = auth.unreadCount(s.login);
    const bell = el('button', 'ib bell' + (n ? ' has-new' : ''));
    bell.type = 'button';
    bell.setAttribute('aria-haspopup', 'true');
    bell.setAttribute('aria-expanded', 'false');
    bell.setAttribute('aria-label', n ? t('n.bellN', { x: n }) : t('n.bell'));
    bell.innerHTML = ICON.bell;
    if (n) bell.appendChild(el('span', 'bell-badge', n > 9 ? '9+' : String(n)));
    const panel = el('div', 'acct-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', t('n.title'));
    const pid = 'acct-panel-' + Math.random().toString(36).slice(2, 7);
    panel.id = pid;
    bell.setAttribute('aria-controls', pid);
    bell.addEventListener('click', (e) => { e.stopPropagation(); toggle(box, bell, panel); });
    const out = el('button', 'acct-logout');
    out.type = 'button';
    out.setAttribute('aria-label', t('sub.logout'));
    out.innerHTML = ICON.logout;
    out.appendChild(el('span', null, t('sub.logout')));
    out.addEventListener('click', logout);
    box.append(bell, out, panel);
  }

  function fillPanel(panel, s, newIds) {
    panel.textContent = '';
    const head = el('div', 'ap-head');
    head.appendChild(el('b', null, t('n.title')));
    head.appendChild(el('span', null, s.name || s.login));
    panel.appendChild(head);
    const list = auth.notifications(s.login);
    if (!list.length) panel.appendChild(el('p', 'ap-empty', t('n.empty')));
    else {
      const ul = el('ul', 'ap-list');
      list.slice(0, 20).forEach((x) => {
        const li = el('li', 'ap-item' + (newIds.has(x.id) ? ' is-new' : ''));
        const a = el('a');
        a.href = x.type === 'cancelled' ? 'lista-zlecen.html' : 'lista-zlecen.html?moje=1';
        const ic = el('span', 'ap-ic ' + x.type); ic.innerHTML = ICON[x.type] || ICON.bell; ic.setAttribute('aria-hidden', 'true');
        const txt = el('span', 'ap-text');
        const who = x.byName || x.by;
        const msg = x.type === 'reserve' ? t('n.reserve', { x: who })
          : x.type === 'expired' ? t('n.expired', { x: zl(x.amount || 50) })
          : x.type === 'cancelled' ? t('n.cancelled', { x: who })
          : t('n.offer', { x: who, y: zl(x.rate) });
        txt.appendChild(el('span', null, msg));
        txt.appendChild(el('small', null, x.route));
        txt.appendChild(el('small', null, ago(x.at)));
        a.append(ic, txt);
        li.appendChild(a);
        ul.appendChild(li);
      });
      panel.appendChild(ul);
    }
    panel.appendChild(el('p', 'ap-note', t('n.mailNote')));
    const foot = el('div', 'ap-foot');
    const go = el('a', null, t('n.open')); go.href = 'lista-zlecen.html?moje=1';
    const out = el('button', null, t('sub.logout')); out.type = 'button';
    out.addEventListener('click', logout);
    foot.append(go, out);
    panel.appendChild(foot);
  }

  let openBox = null;
  function toggle(box, bell, panel) {
    if (!panel.hidden) { close(); return; }
    close();
    const s = auth.getSession();
    if (!s) return;
    const newIds = new Set(auth.notifications(s.login).filter((x) => !x.read).map((x) => x.id));
    fillPanel(panel, s, newIds);
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    openBox = { box, bell, panel };
    // otwarcie panelu = przeczytane; licznik znika, a nowe pozycje zostają wyróżnione do zamknięcia
    if (newIds.size) {
      auth.markNotificationsRead(s.login);
      bell.classList.remove('has-new');
      const badge = bell.querySelector('.bell-badge'); if (badge) badge.remove();
      bell.setAttribute('aria-label', t('n.bell'));
    }
  }
  function close() {
    if (!openBox) return;
    openBox.panel.hidden = true;
    openBox.bell.setAttribute('aria-expanded', 'false');
    openBox = null;
  }
  document.addEventListener('click', (e) => { if (openBox && !openBox.box.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openBox) { const b = openBox.bell; close(); b.focus(); } });

  const renderAll = () => { close(); boxes.forEach(renderBox); };
  document.addEventListener('anws:lang', renderAll);
  // nowe powiadomienia z innej karty przeglądarki
  addEventListener('storage', (e) => { if (e.key === 'anws-notifications' || e.key === 'anws-session') renderAll(); });
  renderAll();
  window.ANWSAccount = { refresh: renderAll };
})();
