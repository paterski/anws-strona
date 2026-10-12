// ANWS — interakcje strony głównej

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ------------------------------------------------------------------
     Loader: logo + droga z paskiem postępu i autobusem, potem przejście.
     Przejście: ?loader=doors|curtain|iris|sweep|fade (zapamiętywane).
     ------------------------------------------------------------------ */
  (function () {
    const ld = $('#loader');
    const finish = () => { root.classList.remove('is-loading'); };
    if (!ld) return finish();
    if (!root.classList.contains('is-loading')) { ld.remove(); return; }

    const MODES = ['doors', 'curtain', 'iris', 'sweep', 'fade'];
    const q = new URLSearchParams(location.search).get('loader');
    if (q && MODES.includes(q)) store.set('anws-loader', q);
    let mode = store.get('anws-loader');
    if (!MODES.includes(mode)) mode = 'doors';
    if (mode === 'iris' && typeof CSSPropertyRule === 'undefined') mode = 'fade';
    ld.dataset.mode = mode;

    const track = $('.ld-track', ld);
    const setP = (v) => track.style.setProperty('--lp', v.toFixed(4));
    let p = 0, target = 0.88, last = performance.now(), done = false;
    // postęp rośnie płynnie do ~88%, dopóki strona się nie załaduje
    const tickP = (now) => {
      const dt = Math.min(64, now - last); last = now;
      p += (target - p) * Math.min(1, dt / 420);
      setP(p);
      if (!done) requestAnimationFrame(tickP);
    };
    requestAnimationFrame(tickP);

    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const minTime = new Promise((r) => setTimeout(r, 2100));

    Promise.all([loaded, fonts, minTime]).then(() => {
      target = 1;
      setTimeout(() => { done = true; setP(1); leave(); }, 380);
    });

    const EASE = 'cubic-bezier(.76, 0, .24, 1)';
    const fadeInner = () => $('.ld-inner', ld).animate({ opacity: [1, 0], transform: ['scale(1)', 'scale(.92)'] }, { duration: 420, easing: 'cubic-bezier(.5, 0, 1, 1)', fill: 'forwards' });
    const end = () => ld.remove();

    function leave() {
      ld.style.pointerEvents = 'none';
      if (mode === 'doors') {
        fadeInner();
        const o = { duration: 1000, delay: 280, easing: EASE, fill: 'forwards' };
        $('.ld-l', ld).animate({ transform: ['translateX(0)', 'translateX(-101%)'] }, o);
        const a = $('.ld-r', ld).animate({ transform: ['translateX(0)', 'translateX(101%)'] }, o);
        setTimeout(finish, 520);
        a.onfinish = end;
      } else if (mode === 'curtain') {
        fadeInner();
        const a = ld.animate({ clipPath: ['inset(0 0 0 0)', 'inset(0 0 100% 0)'] }, { duration: 1100, delay: 330, easing: EASE, fill: 'forwards' });
        setTimeout(finish, 640);
        a.onfinish = end;
      } else if (mode === 'iris') {
        fadeInner();
        const a = ld.animate({ '--r': ['0%', '150%'] }, { duration: 1200, delay: 300, easing: EASE, fill: 'forwards' });
        setTimeout(finish, 650);
        a.onfinish = end;
      } else if (mode === 'sweep') {
        const bus = $('.ld-sweep-bus', ld), W = innerWidth;
        const o = { duration: 1300, delay: 120, easing: EASE, fill: 'forwards' };
        bus.animate({ transform: ['translateX(0)', `translateX(${W + 80}px)`] }, o);
        const a = ld.animate({ clipPath: ['inset(0 0 0 0)', 'inset(0 0 0 100%)'] }, o);
        setTimeout(finish, 520);
        a.onfinish = end;
      } else {
        const a = ld.animate({ opacity: [1, 0] }, { duration: 800, delay: 150, easing: 'ease-in-out', fill: 'forwards' });
        setTimeout(finish, 350);
        a.onfinish = end;
      }
    }
  })();

  /* ------------------------------------------------------------------
     Liczniki zleceń — miejsce na dane z bazy.
     Wywołaj window.ANWS.setCounts({ all: 128, urgent: 7 }) po pobraniu
     danych (np. z fetch). Do tego czasu kafelki pokazują „—”.
     ------------------------------------------------------------------ */
  const counts = { all: null, urgent: null };
  function renderCounts() {
    const nf = new Intl.NumberFormat(root.lang === 'en' ? 'en-GB' : 'pl-PL');
    $$('[data-count]').forEach((el) => {
      const v = counts[el.dataset.count];
      el.textContent = v == null ? '—' : nf.format(v);
    });
  }
  window.ANWS = {
    setCounts(next) {
      Object.assign(counts, next);
      renderCounts();
    },
  };

  /* ------------------------------------------------------------------
     Język PL / EN
     ------------------------------------------------------------------ */
  const DICT = window.I18N || {};
  let lang = root.lang === 'en' ? 'en' : 'pl';
  const t = (k) => (DICT[lang] && DICT[lang][k] != null ? DICT[lang][k] : DICT.pl[k]);

  // Tytuł: litery wchodzą po kolei, ostatnie słowo w kolorze akcentu
  function renderTitle(el, text) {
    const words = text.split(' ');
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    const vis = document.createElement('span');
    vis.className = 'title-vis';
    vis.setAttribute('aria-hidden', 'true');
    let i = 0;
    words.forEach((w, wi) => {
      const word = document.createElement('span');
      word.className = 'word' + (wi === words.length - 1 ? ' word-accent' : '');
      Array.from(w).forEach((ch) => {
        const c = document.createElement('span');
        c.className = 'ch';
        c.style.setProperty('--i', i++);
        // rolka: litera + jej kopia w drugim kolorze, które zamieniają się po najechaniu
        const roll = document.createElement('span');
        roll.className = 'roll';
        for (let k = 0; k < 2; k++) {
          const face = document.createElement('span');
          face.textContent = ch;
          roll.appendChild(face);
        }
        c.appendChild(roll);
        word.appendChild(c);
      });
      vis.appendChild(word);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    el.append(sr, vis);
    el.classList.add('is-split');
  }

  function renderBand() {
    const items = t('band.items');
    const list = $('#band-list');
    const marquee = $('#band-marquee');
    if (!list || !marquee || !items) return;
    list.innerHTML = '';
    items.forEach((s) => { const li = document.createElement('li'); li.textContent = s; list.appendChild(li); });
    marquee.innerHTML = '';
    for (let r = 0; r < 2; r++) {
      items.forEach((s) => {
        const sp = document.createElement('span'); sp.textContent = s;
        const dot = document.createElement('i'); dot.textContent = '●';
        marquee.append(sp, dot);
      });
    }
  }

  const langBtns = $$('.lang-switch [data-lang]');
  const themeBtn = $('#theme-btn');
  const menuBtn = $('.menu-btn');
  const menu = $('#menu');

  function syncMenuLabel() {
    if (!menuBtn || !menu) return;
    menuBtn.setAttribute('aria-label', t(menu.hidden ? 'menu.open' : 'menu.close'));
  }

  function applyLang(next, animateTitle) {
    lang = next;
    root.lang = next;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    $$('[data-i18n-title]').forEach((el) => { renderTitle(el, t(el.dataset.i18nTitle)); });
    document.title = t(document.body.dataset.titleKey || 'meta.title');
    const md = $('meta[name="description"]');
    if (md) md.content = t('meta.desc');
    langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
    renderBand();
    renderCounts();
    syncMenuLabel();
    document.dispatchEvent(new CustomEvent('anws:lang', { detail: next }));
    if (!animateTitle) $$('.title .ch').forEach((c) => { c.style.animation = 'none'; });
  }

  langBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    store.set('anws-lang', b.dataset.lang);
    applyLang(b.dataset.lang, true);
  }));

  /* ------------------------------------------------------------------
     Tryb ciemny
     ------------------------------------------------------------------ */
  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    const m = $('meta[name="theme-color"]');
    if (m) m.content = theme === 'dark' ? '#0F1013' : '#EDE6DC';
  }
  applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      store.set('anws-theme', next);
      applyTheme(next);
    });
  }
  // Bez zapisanego wyboru śledzimy ustawienie systemu
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!store.get('anws-theme')) applyTheme(e.matches ? 'dark' : 'light');
  });

  // Pierwsze wypełnienie treści (tytuł dzielimy na litery także dla PL)
  applyLang(lang, true);

  /* ------------------------------------------------------------------
     Nawigacja zmniejsza się przy przewijaniu
     ------------------------------------------------------------------ */
  const titleEl = $('.title');
  if (titleEl) {
    titleEl.addEventListener('animationend', (e) => {
      if (e.animationName === 'letter') e.target.classList.add('is-set');
    });
  }

  const nav = $('#nav');
  let compact = false;
  function onScroll() {
    const y = window.scrollY;
    // histereza, żeby menu nie „migało” na granicy
    if (!compact && y > 40) compact = true;
    else if (compact && y < 12) compact = false;
    else return;
    nav.classList.toggle('is-compact', compact);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------
     Kafelki: przechył 3D i poświata za kursorem
     ------------------------------------------------------------------ */
  $$('.tile').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      if (reduceMotion.matches || !finePointer.matches) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      el.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
      el.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
    });
    el.addEventListener('mouseleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });

  /* ------------------------------------------------------------------
     Menu mobilne
     ------------------------------------------------------------------ */
  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    syncMenuLabel();
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => {
      const open = menu.hidden;
      setMenu(open);
      if (open) menu.querySelector('a').focus();
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { setMenu(false); menuBtn.focus(); }
    });
    matchMedia('(min-width: 1041px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  /* ------------------------------------------------------------------
     „Zadzwoń”: na telefonie dzwoni od razu, na komputerze otwiera okienko
     z numerem, kodem QR i osobą do kontaktu.
     ------------------------------------------------------------------ */
  const PHONE = { num: '+48884106851', disp: '+48 884 106 851' };
  const dlg = $('#call-dialog');
  const canDial = () => matchMedia('(hover: none), (pointer: coarse)').matches;
  let qrLoad = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoad) {
      qrLoad = new Promise((res, rej) => {
        const s = Object.assign(document.createElement('script'), {
          src: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
          async: true,
        });
        s.onload = () => res(window.qrcode);
        s.onerror = () => { qrLoad = null; rej(); };
        document.head.appendChild(s);
      });
    }
    return qrLoad;
  }
  function fillQR() {
    const box = $('#call-qr');
    if (!box || box.firstChild) return;
    loadQR().then((qrcode) => {
      const qr = qrcode(0, 'M');
      qr.addData('tel:' + PHONE.num);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }).catch(() => { const w = box.closest('.call-qr-wrap'); if (w) w.hidden = true; });
  }
  function openCall() {
    if (!dlg || typeof dlg.showModal !== 'function') { location.href = 'tel:' + PHONE.num; return; }
    fillQR();
    if (!dlg.open) {
      dlg.classList.remove('is-closing');
      dlg.showModal();
    }
    $('.call-btn-primary', dlg).focus();
  }
  function closeCall() {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.close(); dlg.classList.remove('is-closing'); }, reduceMotion.matches ? 0 : 160);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!a || a.hasAttribute('data-direct') || canDial()) return;
    e.preventDefault();
    setMenu(false);
    openCall();
  });
  if (dlg) {
    $('[data-call-close]', dlg).addEventListener('click', closeCall);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeCall(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeCall(); });
    const copyBtn = $('[data-call-copy]', dlg);
    let copyTimer;
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(PHONE.disp); } catch (err) {}
      const label = $('span', copyBtn);
      label.textContent = t('call.copied');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { label.textContent = t('call.copy'); }, 2200);
    });
  }

  /* ------------------------------------------------------------------
     Logowanie: karty prowadzą na podstrony dopiero po zalogowaniu.
     Z zapamiętaną sesją (checkbox „Zapamiętaj mnie”) przechodzimy od razu.
     ------------------------------------------------------------------ */
  const auth = window.ANWSAuth;
  const authDlg = $('#auth-dialog');
  if (auth && authDlg) {
    const form = $('#auth-form', authDlg);
    const panel = $('.auth-panel', authDlg);
    const fLogin = $('#auth-login', authDlg);
    const fPass = $('#auth-pass', authDlg);
    const fRemember = $('#auth-remember', authDlg);
    const eLogin = $('#auth-login-err', authDlg);
    const ePass = $('#auth-pass-err', authDlg);
    const alertBox = $('#auth-alert', authDlg);
    const submit = $('.auth-submit', authDlg);
    const submitLabel = $('.auth-submit-label', authDlg);
    const toggle = $('.pass-toggle', authDlg);
    const SAFE_NEXT = /^[a-z0-9-]+\.html(\?[a-z0-9=&-]*)?$/i;
    let next = null;
    let busy = false;

    const showErr = (input, box, msg, withForgot) => {
      input.setAttribute('aria-invalid', 'true');
      const span = $('span', box);
      (span || box).textContent = msg;
      box.classList.toggle('with-forgot', !!withForgot);
      box.hidden = false;
    };
    const clearField = (input, box) => { input.removeAttribute('aria-invalid'); box.hidden = true; };
    const clearAll = () => { clearField(fLogin, eLogin); clearField(fPass, ePass); alertBox.hidden = true; };
    const shake = () => {
      if (reduceMotion.matches) return;
      panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake');
    };

    function openAuth(target) {
      next = target && SAFE_NEXT.test(target) ? target : 'lista-zlecen.html';
      clearAll();
      if (!authDlg.open) {
        authDlg.classList.remove('is-closing');
        authDlg.showModal();
      }
      setTimeout(() => fLogin.focus(), 30);
    }
    function closeAuth() {
      if (!authDlg.open || authDlg.classList.contains('is-closing')) return;
      authDlg.classList.add('is-closing');
      setTimeout(() => { authDlg.close(); authDlg.classList.remove('is-closing'); }, reduceMotion.matches ? 0 : 160);
    }

    $('[data-auth-close]', authDlg).addEventListener('click', closeAuth);
    authDlg.addEventListener('cancel', (e) => { e.preventDefault(); closeAuth(); });
    authDlg.addEventListener('click', (e) => { if (e.target === authDlg) closeAuth(); });

    toggle.addEventListener('click', () => {
      const show = fPass.type === 'password';
      fPass.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', t(show ? 'auth.hide' : 'auth.show'));
      fPass.focus();
    });

    fLogin.addEventListener('input', () => { clearField(fLogin, eLogin); alertBox.hidden = true; });
    fPass.addEventListener('input', () => clearField(fPass, ePass));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      clearAll();
      const login = fLogin.value.trim();
      const pass = fPass.value;
      if (!login || !pass) {
        if (!login) showErr(fLogin, eLogin, t('auth.errLogin'));
        if (!pass) showErr(fPass, ePass, t('auth.errPass'));
        (login ? fPass : fLogin).focus();
        shake();
        return;
      }
      busy = true;
      submit.disabled = true;
      submit.classList.add('is-loading');
      submitLabel.textContent = t('auth.loading');
      let res;
      try {
        res = await auth.login(login, pass, fRemember.checked);
      } catch (err) {
        res = { ok: false, error: 'network' };
      }
      busy = false;
      submit.disabled = false;
      submit.classList.remove('is-loading');
      submitLabel.textContent = t('auth.submit');

      if (res.ok) { location.href = next; return; }
      if (res.error === 'user') {
        fLogin.setAttribute('aria-invalid', 'true');
        alertBox.hidden = false;
        fLogin.focus(); fLogin.select();
      } else if (res.error === 'password') {
        fPass.value = '';
        showErr(fPass, ePass, t('auth.errWrongPass'), true);
        fPass.focus();
      } else {
        showErr(fPass, ePass, t('auth.errNetwork'));
      }
      shake();
    });

    // Karty: bez sesji najpierw logowanie (zwykły klik; Ctrl/⌘+klik zostawiamy przeglądarce)
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-auth]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (auth.getSession()) return;
      e.preventDefault();
      openAuth(a.getAttribute('href'));
    });

    // Wejście z podstrony bez sesji: index.html?next=lista-zlecen.html → otwieramy logowanie po loaderze
    const wanted = new URLSearchParams(location.search).get('next');
    if (wanted && !auth.getSession()) {
      const go = () => openAuth(wanted);
      if (!root.classList.contains('is-loading')) go();
      else new MutationObserver((m, o) => {
        if (root.classList.contains('is-loading')) return;
        o.disconnect();
        setTimeout(go, 500);
      }).observe(root, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* ------------------------------------------------------------------
     „Jak to działa”: mapa dwóch linii. Przełącznik roli podświetla jedną
     drogę, a po liniach jeżdżą autobusy (tylko szeroki ekran, bez
     ograniczenia ruchu, gdy sekcja jest widoczna).
     ------------------------------------------------------------------ */
  const net = $('#net');
  if (net) {
    const roleBtns = $$('[data-role-btn]');
    const narrow = matchMedia('(max-width: 900px)');
    const setRole = (role) => {
      if (narrow.matches && role === 'both') role = 'a';
      net.dataset.role = role;
      roleBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.roleBtn === role)));
    };
    roleBtns.forEach((b) => b.addEventListener('click', () => setRole(b.dataset.roleBtn)));
    narrow.addEventListener('change', () => setRole(net.dataset.role));
    setRole(net.dataset.role);

    // linie rysują się, a przystanki pojawiają, gdy sekcja wjedzie na ekran
    let visible = false;
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !net.classList.contains('is-in')) {
        net.classList.add('is-in');
        setTimeout(() => net.classList.add('is-done'), 2200); // dalej bez opóźnień wejścia (np. przy zmianie roli)
      }
      if (visible) kick();
    }, { threshold: 0.25 });
    io.observe(net);

    // autobusy: pozycja liczona z prawdziwej ścieżki SVG (współrzędne 1000 × 540)
    const lines = $$('.ln[data-role]', net);
    const buses = [
      { el: $('.bus-a', net), path: lines.find((l) => l.dataset.role === 'a'), offset: 0 },
      { el: $('.bus-b', net), path: lines.find((l) => l.dataset.role === 'b'), offset: 0.5 },
    ].filter((b) => b.el && b.path);
    buses.forEach((b) => { b.len = b.path.getTotalLength(); });
    const PERIOD = 9000;
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    let raf = 0;
    function frame(now) {
      raf = 0;
      if (!visible || narrow.matches || reduceMotion.matches) { buses.forEach((b) => { b.el.style.opacity = 0; }); return; }
      const w = net.clientWidth, h = net.clientHeight;
      const sx = w / 1000, sy = h / 540;
      buses.forEach((b) => {
        const t = ((now / PERIOD) + b.offset) % 1;
        const l = ease(t) * b.len;
        const p = b.path.getPointAtLength(l);
        const q = b.path.getPointAtLength(Math.min(b.len, l + 2));
        const ang = Math.atan2((q.y - p.y) * sy, (q.x - p.x) * sx) * 180 / Math.PI;
        const fade = Math.min(1, t / 0.06, (1 - t) / 0.06);
        b.el.style.transform = `translate(${(p.x * sx).toFixed(1)}px, ${(p.y * sy).toFixed(1)}px) rotate(${ang.toFixed(1)}deg)`;
        b.el.style.opacity = '';
        b.el.style.setProperty('--fade', fade.toFixed(3));
      });
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    narrow.addEventListener('change', kick);
  }

  /* ------------------------------------------------------------------
     Kursor (tylko myszka): kropka + pierścień, jak w projekcie kominków
     ------------------------------------------------------------------ */
  const cursor = $('.cursor');
  if (cursor && finePointer.matches) {
    root.classList.add('has-cursor');
    const dot = $('.cursor-dot');
    const ring = $('.cursor-ring');
    let tx = -100, ty = -100, rx = -100, ry = -100, raf = 0;
    const tick = () => {
      rx += (tx - rx) * 0.2;
      ry += (ty - ry) * 0.2;
      dot.style.transform = `translate(${tx}px, ${ty}px)`;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = Math.abs(tx - rx) + Math.abs(ty - ry) > 0.1 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const HOVERABLE = 'a, button, label, input, textarea, summary, .tile';
    addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      cursor.classList.remove('is-hidden');
      kick();
    }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
    document.addEventListener('pointerover', (e) => {
      cursor.classList.toggle('is-hover', !!(e.target.closest && e.target.closest(HOVERABLE)));
    });
    document.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    document.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    // <dialog> otwarty modalnie leży w warstwie wierzchniej przeglądarki, ponad
    // całą stroną — kursor przenosimy do środka, żeby dalej był widoczny.
    const home = cursor.parentNode;
    const follow = (muts) => {
      const d = muts[0].target;
      const target = d.open ? d : ($$('dialog[open]').pop() || home);
      if (cursor.parentNode !== target) target.appendChild(cursor);
    };
    $$('dialog').forEach((d) => new MutationObserver(follow).observe(d, { attributes: true, attributeFilter: ['open'] }));
  }
})();
