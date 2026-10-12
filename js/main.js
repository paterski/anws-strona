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
        c.textContent = ch;
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
    document.title = t('meta.title');
    const md = $('meta[name="description"]');
    if (md) md.content = t('meta.desc');
    langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
    renderBand();
    renderCounts();
    syncMenuLabel();
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
    const follow = () => {
      const open = $$('dialog[open]').pop();
      const target = open || home;
      if (cursor.parentNode !== target) target.appendChild(cursor);
    };
    $$('dialog').forEach((d) => new MutationObserver(follow).observe(d, { attributes: true, attributeFilter: ['open'] }));
  }
})();
