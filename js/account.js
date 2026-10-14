// ANWS — miejsce konta w menu: „Zaloguj się” albo dzwonek z licznikiem powiadomień, panel klienta i „Wyloguj się”

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
    gear: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
    logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"></path></svg>',
    doc: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path></svg>',
    urgent: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"></path></svg>',
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

  // kropka przy kole zębatym: brak wybranego modelu rozliczeń
  function attention(s) {
    if (!s || s.role === 'admin') return null;
    return auth.getPlan(s.login).chosen ? null : 'k.gearNeed';
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
    // panel klienta (koło zębate); kropka, dopóki klient nie wybierze modelu rozliczeń
    const gear = el('a', 'ib acct-gear');
    const admin = s.role === 'admin';
    gear.href = admin ? 'admin.html' : 'konto.html';
    const need = attention(s), needPlan = !!need;
    gear.setAttribute('aria-label', admin ? t('adm.badge') : t(need || 'k.gear'));
    gear.title = gear.getAttribute('aria-label');
    gear.innerHTML = ICON.gear;
    if (needPlan) gear.appendChild(el('span', 'gear-dot'));
    if (page === gear.getAttribute('href')) gear.setAttribute('aria-current', 'page');
    const out = el('button', 'acct-logout');
    out.type = 'button';
    out.setAttribute('aria-label', t('sub.logout'));
    out.innerHTML = ICON.logout;
    out.appendChild(el('span', null, t('sub.logout')));
    out.addEventListener('click', logout);
    box.append(bell, gear, out, panel);
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
        a.href = x.type === 'urgent' && x.orderId ? 'lista-zlecen.html?zlecenie=' + encodeURIComponent(x.orderId)
          : x.type === 'offer' && x.orderId ? 'lista-zlecen.html?moje=1&oferty=' + encodeURIComponent(x.orderId)
          : x.type === 'offerAccepted' ? 'lista-zlecen.html?moje=1&tab=wykonanie'
          : x.type === 'offerRejected' || x.type === 'offerTaken' ? 'lista-zlecen.html' : x.type === 'subEnded' ? 'konto.html' : (x.type === 'cancelled' || x.type === 'removed') ? 'lista-zlecen.html' : 'lista-zlecen.html?moje=1';
        const ic = el('span', 'ap-ic ' + x.type); ic.innerHTML = ICON[x.type === 'urgent' ? 'urgent' : x.type === 'offerAccepted' ? 'reserve' : x.type === 'offerRejected' || x.type === 'offerTaken' ? 'cancelled' : x.type === 'subEnded' ? 'expired' : x.type === 'removed' ? 'cancelled' : x.type] || ICON.bell; ic.setAttribute('aria-hidden', 'true');
        const txt = el('span', 'ap-text');
        const who = x.byName || x.by;
        const msg = x.type === 'reserve' ? t('n.reserve', { x: who })
          : x.type === 'expired' ? t('n.expired', { x: zl(x.amount || 50) })
          : x.type === 'cancelled' ? t('n.cancelled', { x: who })
          : x.type === 'subEnded' ? t('n.subEnded')
          : x.type === 'removed' ? t('n.removed')
          : x.type === 'urgent' ? t('n.urgent', { x: whenLabel(x.dep) })
          : x.type === 'offerAccepted' ? t('n.offerAccepted', { x: zl(x.rate) })
          : x.type === 'offerRejected' ? t('n.offerRejected', { x: zl(x.rate) })
          : x.type === 'offerTaken' ? t('n.offerTaken')
          : t('n.offer', { y: zl(x.rate) }); // nazwa przewoźnika ukryta do akceptacji
        txt.appendChild(el('span', null, msg));
        if (x.route) txt.appendChild(el('small', x.type === 'urgent' ? 'ap-route' : null, x.route));
        if (x.type === 'urgent') {
          txt.appendChild(el('small', 'ap-urgent-meta', t('n.urgentMeta', { x: x.pax, y: x.km, z: zl(x.rate) })));
          li.classList.add('is-urgent');
        }
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
  /* ---------- alarm o nowym pilnym zleceniu ----------
   * Na każdej otwartej stronie (z dzwonkiem): syrena + komunikat głosowy, powtarzane co kilkanaście sekund,
   * czerwony, pulsujący dzwonek i pasek z treścią. Alarm wyłącza dopiero otwarcie dzwonka (zapoznanie się z treścią).
   * Przeglądarki nie odtwarzają dźwięku, zanim użytkownik czegoś nie kliknie na stronie — wtedy pasek o tym mówi,
   * a dźwięk rusza przy pierwszym kliknięciu. */
  const alarm = { on: false, timer: 0, ctx: null, unlocked: false, nodes: [], title: document.title, blink: 0 };
  const whenLabel = (ms) => ms ? new Date(ms).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  // data do odczytania na głos: „czwartek, 15 października, o 08:00”
  const speechWhen = (ms) => { const d = new Date(ms); return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }) + (root.lang === 'en' ? ' at ' : ', o ') + d.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }); };
  const pendingUrgent = (s) => (s && s.role !== 'admin' ? auth.notifications(s.login).filter((x) => x.type === 'urgent' && !x.read) : []);
  let banner = null;
  function siren() {
    if (!alarm.unlocked) return;
    try {
      const ctx = alarm.ctx || (alarm.ctx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < 6; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = i % 2 ? 660 : 920;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.3);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.3 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.28);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + i * 0.3); o.stop(t0 + i * 0.3 + 0.3);
        alarm.nodes.push(o);
      }
    } catch (e) { /* bez dźwięku — zostaje alarm wizualny */ }
  }
  function speak(x) {
    if (!alarm.unlocked || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t('al.speech', { x: String(x.route || '').replace(/\s*→\s*/g, ' – ').replace(/,[^–]*?(?= –|$)/g, ''), y: speechWhen(x.dep), z: x.pax, w: x.rate }));
      const lang = root.lang === 'en' ? 'en' : 'pl';
      u.lang = lang === 'en' ? 'en-GB' : 'pl-PL';
      const v = speechSynthesis.getVoices().find((vo) => vo.lang && vo.lang.toLowerCase().startsWith(lang));
      if (v) u.voice = v;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch (e) { /* bez syntezy mowy */ }
  }
  function cycle() {
    clearTimeout(alarm.timer);
    if (!alarm.on) return;
    const s = auth.getSession();
    const x = pendingUrgent(s)[0];
    if (!x) { stopAlarm(); return; }
    siren();
    alarm.timer = setTimeout(() => { if (alarm.on) speak(x); alarm.timer = setTimeout(cycle, 15000); }, 1900);
  }
  function showBanner(x, n) {
    if (!banner) {
      banner = el('div', 'urgent-alarm');
      banner.setAttribute('role', 'alert');
      document.body.appendChild(banner);
    }
    banner.textContent = '';
    const ic = el('span', 'ua-ic'); ic.innerHTML = ICON.urgent;
    const txt = el('div', 'ua-text');
    txt.appendChild(el('b', null, n > 1 ? t('al.titleN', { x: n }) : t('al.title')));
    txt.appendChild(el('span', null, (x.route || '') + ' · ' + whenLabel(x.dep) + ' · ' + t('n.urgentMeta', { x: x.pax, y: x.km, z: zl(x.rate) })));
    txt.appendChild(el('small', null, t('al.howOff') + (alarm.unlocked ? '' : ' ' + t('al.sound'))));
    banner.append(ic, txt);
    banner.hidden = false;
  }
  function startAlarm() {
    alarm.on = true;
    document.documentElement.classList.add('has-alarm');
    clearInterval(alarm.blink);
    alarm.blink = setInterval(() => { document.title = document.title === alarm.title ? '⚡ ' + t('al.title') : alarm.title; }, 1000);
    cycle();
  }
  function stopAlarm() {
    alarm.on = false;
    clearTimeout(alarm.timer);
    clearInterval(alarm.blink);
    document.title = alarm.title;
    document.documentElement.classList.remove('has-alarm');
    alarm.nodes.forEach((o) => { try { o.stop(); } catch (e) {} });
    alarm.nodes = [];
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
    if (banner) banner.hidden = true;
  }
  function checkAlarm() {
    const s = auth.getSession();
    const list = pendingUrgent(s);
    document.querySelectorAll('.bell').forEach((b) => b.classList.toggle('is-alarm', list.length > 0));
    if (list.length) { showBanner(list[0], list.length); if (!alarm.on) startAlarm(); }
    else if (alarm.on || (banner && !banner.hidden)) stopAlarm();
  }
  // odblokowanie dźwięku przy pierwszym geście (kliknięcie dzwonka od razu wyłącza alarm — wtedy bez syreny)
  function unlock(e) {
    if (alarm.unlocked) return;
    alarm.unlocked = true;
    try { alarm.ctx = new (window.AudioContext || window.webkitAudioContext)(); alarm.ctx.resume(); } catch (err) {}
    const onBell = e && e.target && e.target.closest && e.target.closest('.bell');
    if (alarm.on && !onBell) { const s = auth.getSession(); const x = pendingUrgent(s)[0]; if (x) showBanner(x, pendingUrgent(s).length); cycle(); }
  }
  ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, unlock, { capture: true }));

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
    checkAlarm(); // treść alarmu jest w panelu — alarm wyłączony
  }
  function close() {
    if (!openBox) return;
    openBox.panel.hidden = true;
    openBox.bell.setAttribute('aria-expanded', 'false');
    openBox = null;
  }
  document.addEventListener('click', (e) => { if (openBox && !openBox.box.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openBox) { const b = openBox.bell; close(); b.focus(); } });

  // na telefonie panel klienta i wylogowanie są w rozwijanym menu (na pasku brakuje miejsca)
  const menu = document.getElementById('menu');
  const menuBtn = document.querySelector('.menu-btn');
  function renderMenu() {
    if (!menu) return;
    menu.querySelectorAll('.menu-acct').forEach((x) => x.remove());
    const s = auth.getSession();
    const needPlan = !!attention(s);
    if (menuBtn) menuBtn.classList.toggle('has-dot', needPlan);
    if (!s) return;
    const go = el('a', 'menu-acct', t(s.role === 'admin' ? 'adm.badge' : 'k.gear'));
    go.href = s.role === 'admin' ? 'admin.html' : 'konto.html';
    if (needPlan) go.appendChild(el('span', 'gear-dot'));
    const out = el('button', 'menu-acct', t('sub.logout'));
    out.type = 'button';
    out.addEventListener('click', logout);
    const anchor = menu.querySelector('.menu-social');
    menu.insertBefore(go, anchor); menu.insertBefore(out, anchor);
  }

  const renderAll = () => { close(); boxes.forEach(renderBox); renderMenu(); checkAlarm(); };
  document.addEventListener('anws:lang', renderAll);
  // nowe powiadomienia z innej karty przeglądarki
  addEventListener('storage', (e) => { if (e.key === 'anws-notifications' || e.key === 'anws-session') renderAll(); });
  // nowe pilne zlecenie z tej samej karty / bez zdarzenia storage — sprawdzamy co kilka sekund
  setInterval(() => { const s = auth.getSession(); if (!!pendingUrgent(s).length !== alarm.on) renderAll(); }, 4000);
  renderAll();
  window.ANWSAccount = { refresh: renderAll };
})();
