/* ANWS — potwierdzenie zlecenia przewozu: podgląd, druk i pobranie jako PDF.
 *
 * Wspólne dla giełdy („Twoje zlecenia”) i panelu klienta (historia przewozów, dokumenty).
 * Dokument powstaje z danych zlecenia; dane firm pochodzą z chwili rezerwacji (o.snap),
 * więc późniejsza zmiana telefonu czy osoby do kontaktu nie zmienia wystawionego potwierdzenia.
 * Dokument jest zawsze po polsku — to potwierdzenie między polskimi firmami.
 * Plik PDF tworzy biblioteka html2pdf.js (ładowana dopiero przy pierwszym pobraniu);
 * gdy się nie wczyta, zostaje druk → „Zapisz jako PDF”.
 */
(function () {
  const store = window.ANWSOrders;
  const auth = window.ANWSAuth;
  if (!store || !auth) return;
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement;
  const DICT = window.I18N || {};
  const t = (k) => { const lang = root.lang === 'en' ? 'en' : 'pl'; return (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : (DICT.pl[k] != null ? DICT.pl[k] : k); };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const H2P = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

  const nf = (n, d = 0) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: d, minimumFractionDigits: d, useGrouping: 'always' }).format(n);
  const zl = (n) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2, useGrouping: 'always' }).format(n) + ' zł';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fullDate = (ms) => new Date(ms).toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtPhone = (p) => {
    const m = String(p || '').match(/^\+48(\d{9})$/);
    if (m) return '+48 ' + m[1].replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    const n = String(p || '').match(/^\+(\d{2,3})(\d+)$/);
    return n ? '+' + n[1] + ' ' + n[2].replace(/(\d{3})(?=\d)/g, '$1 ') : (p || '');
  };
  const hm = (h) => { const m = Math.max(5, Math.round(h * 60 / 5) * 5); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };

  function number(o) {
    const d = new Date(o.reservedAt || o.createdAt);
    return `ANWS/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${o.id.toUpperCase()}`;
  }
  // czy zlecenie ma potwierdzenie (po rezerwacji przez przewoźnika)
  const has = (o) => !!(o && o.status === 'reserved' && o.reservedBy);

  function html(o) {
    const firm = (role, title) => {
      const p = store.party(o, role);
      const rows = [['NIP', p.nip], ['KRS', p.krs], ['REGON', p.regon], ['Osoba do kontaktu', p.person], ['Telefon', fmtPhone(p.phone)], ['Telefon alarmowy', fmtPhone(p.alarmPhone)], ['E-mail', p.email]]
        .filter((r) => r[1]).map((r) => `<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('');
      return `<div class="ds-firm"><h4>${title}</h4><b>${esc(p.name)}</b>${p.verified ? '<span class="ds-ver">✓ Firma zweryfikowana w rejestrach (NIP, KRS, PKD)</span>' : ''}<table>${rows}</table></div>`;
    };
    const st = store.stops(o);
    const stop = (p, letter, what) => `<tr><td class="ds-l">${letter}</td><td>${esc(p.label)}</td><td>${what}</td></tr>`;
    const lines = st.pickups.map((p, i) => stop(p, st.pickups.length > 1 ? 'A' + (i + 1) : 'A', 'odbiór pasażerów'))
      .concat(st.drops.map((p, i) => stop(p, st.drops.length > 1 ? 'B' + (i + 1) : 'B', 'miejsce docelowe')))
      .concat(st.end ? [stop(st.end, 'C', 'koniec trasy')] : []).join('');
    const c = store.crew(o);
    const crewTxt = { one: '1 kierowca', ext: '1 kierowca (wydłużony czas jazdy do 10 h — dopuszczalny 2× w tygodniu)', two: '2 kierowców (załoga dwuosobowa)', rest: 'nocleg kierowców lub zmiana załogi' }[c.level];
    const fee = o.fee ? `Prowizja ANWS dla przewoźnika: ${zl(o.fee.amount)} netto (${nf(o.fee.pct * 100, o.fee.pct === 0.025 ? 1 : 0)}%).` : 'Rezerwacja bez prowizji ANWS (abonament lub pierwszy miesiąc).';
    return `<header class="ds-head"><div><span class="ds-brand">ANWS</span><span class="ds-sub">Giełda zleceń przewozu osób</span></div>
      <div class="ds-no"><b>Potwierdzenie zlecenia przewozu</b><span>nr ${number(o)}</span><span>z dnia ${new Date(o.reservedAt || Date.now()).toLocaleDateString('pl-PL')}</span></div></header>
      <div class="ds-firms">${firm('owner', 'Zleceniodawca')}${firm('carrier', 'Przewoźnik')}</div>
      <h4>Trasa</h4><table class="ds-route">${lines}</table>
      <table class="ds-facts">
        <tr><th>Wyjazd</th><td>${esc(fullDate(o.dep))}</td><th>Przyjazd</th><td>${esc(fullDate(o.arr))}</td></tr>
        <tr><th>Liczba pasażerów</th><td>${o.pax}</td><th>Odległość</th><td>${nf(o.km)} km</td></tr>
        <tr><th>Obsada (szacunek)</th><td colspan="3">${crewTxt} · ok. ${hm(c.drive)} jazdy${c.breaks ? ', ' + c.breaks + ' × 45 min przerwy' : ''}</td></tr>
        ${o.notes ? `<tr><th>Uwagi</th><td colspan="3">${esc(o.notes)}</td></tr>` : ''}
      </table>
      <div class="ds-total"><span>Stawka za przewóz</span><b>${zl(o.rate)} netto</b><small>+ VAT według obowiązującej stawki</small></div>
      <ol class="ds-terms">
        <li>Przewoźnik oświadcza, że posiada licencję na wykonywanie transportu drogowego osób oraz ważne ubezpieczenie OC przewoźnika i NNW pasażerów.</li>
        <li>Przewoźnik podstawia pojazd sprawny technicznie, z liczbą miejsc nie mniejszą niż liczba pasażerów, i przestrzega przepisów o czasie pracy kierowców (rozporządzenie (WE) 561/2006).</li>
        <li>Rozliczenie stawki następuje bezpośrednio między stronami na podstawie faktury przewoźnika. ${fee}</li>
        <li>Anulowanie zlecenia odbywa się na giełdzie ANWS, zgodnie z regulaminem i cennikiem serwisu.</li>
      </ol>
      <div class="ds-sign"><div>Zleceniodawca<br><span></span></div><div>Przewoźnik<br><span></span></div></div>
      <footer class="ds-foot">Dokument wygenerowany na giełdzie ANWS · paterski.github.io/anws-strona</footer>`;
  }
  const fileName = (o) => 'Potwierdzenie-' + number(o).replace(/\//g, '-') + '.pdf';

  /* ---------- okno podglądu (tworzone przy pierwszym użyciu) ---------- */
  const X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
  let dlg = null, current = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'call-dlg auth-dlg';
    dlg.id = 'doc-dialog';
    dlg.setAttribute('aria-labelledby', 'doc-title');
    dlg.innerHTML = `<div class="call-panel auth-panel g-dlg doc-dlg">
      <button type="button" class="call-x" data-close>${X}</button>
      <h2 class="auth-title" id="doc-title"></h2>
      <p class="auth-sub" id="doc-sub"></p>
      <div class="doc-sheet-wrap"><div class="doc-sheet" id="doc-sheet"></div></div>
      <p class="doc-err" id="doc-err" role="status" hidden></p>
      <div class="dlg-actions doc-actions">
        <button type="button" class="call-btn call-btn-ghost" id="doc-print"></button>
        <button type="button" class="call-btn call-btn-primary auth-submit" id="doc-pdf"><span class="spinner" aria-hidden="true"></span><span class="auth-submit-label"></span></button>
      </div></div>`;
    document.body.appendChild(dlg);
    const close = () => {
      if (!dlg.open || dlg.classList.contains('is-closing')) return;
      dlg.classList.add('is-closing');
      setTimeout(() => { dlg.close(); dlg.classList.remove('is-closing'); }, reduce() ? 0 : 160);
    };
    $('[data-close]', dlg).addEventListener('click', close);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    $('#doc-print', dlg).addEventListener('click', () => print(current));
    $('#doc-pdf', dlg).addEventListener('click', () => download(current));
    texts();
    document.addEventListener('anws:lang', texts);
  }
  function texts() {
    if (!dlg) return;
    $('#doc-title', dlg).textContent = t('g.doc.title');
    $('#doc-sub', dlg).textContent = t('g.doc.sub');
    $('[data-close]', dlg).setAttribute('aria-label', t('call.close'));
    $('#doc-print', dlg).textContent = t('g.doc.print');
    $('#doc-pdf .auth-submit-label', dlg).textContent = t('g.doc.pdf');
  }
  function open(id) {
    const o = typeof id === 'object' ? id : store.get(id);
    if (!has(o)) return;
    if (!dlg) build();
    current = o;
    $('#doc-sheet', dlg).innerHTML = html(o);
    $('#doc-err', dlg).hidden = true;
    if (!dlg.open) { dlg.classList.remove('is-closing'); dlg.showModal(); }
    setTimeout(() => $('#doc-pdf', dlg).focus(), 40);
  }

  // druk: kopia dokumentu poza oknem, reszta strony ukryta stylem @media print
  function print(o) {
    if (!has(o)) return;
    const out = document.createElement('div');
    out.className = 'doc-sheet';
    out.id = 'print-root';
    out.innerHTML = html(o);
    document.body.appendChild(out);
    document.body.classList.add('print-doc');
    const title = document.title;
    document.title = fileName(o).replace(/\.pdf$/, ''); // podpowiedź nazwy pliku przy „Zapisz jako PDF”
    const done = () => { out.remove(); document.body.classList.remove('print-doc'); document.title = title; removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    try { window.print(); } catch (e) { /* bez drukowania (np. podgląd) */ }
    setTimeout(() => { if (document.body.classList.contains('print-doc') && !matchMedia('print').matches) done(); }, 1500);
  }

  let libP = null;
  function loadLib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = H2P; s.async = true;
      s.onload = () => (window.html2pdf ? res(window.html2pdf) : rej(new Error('lib')));
      s.onerror = () => { libP = null; rej(new Error('lib')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  // pobranie pliku PDF (A4); bez biblioteki — druk z opcją „Zapisz jako PDF”
  async function download(o) {
    if (!has(o)) return;
    const btn = dlg && dlg.open ? $('#doc-pdf', dlg) : null;
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    try {
      const lib = await loadLib();
      const page = document.createElement('div');
      page.className = 'doc-sheet doc-pdf-page';
      page.innerHTML = html(o);
      const holder = document.createElement('div');
      holder.className = 'doc-pdf-holder';
      holder.appendChild(page);
      document.body.appendChild(holder);
      try {
        await lib().set({ margin: [10, 10, 10, 10], filename: fileName(o), image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all'] } }).from(page).save();
      } finally { holder.remove(); }
    } catch (e) {
      if (dlg && dlg.open) { const err = $('#doc-err', dlg); err.textContent = t('g.doc.pdfErr'); err.hidden = false; }
      print(o);
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    }
  }

  window.ANWSConfirm = { has, number, html, open, print, download, fileName };
})();
