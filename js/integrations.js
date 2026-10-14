/* ANWS — integracje: SMSAPI.pl (SMS-y o pilnych zleceniach) i Fakturownia (faktury).
 *
 * Ustawienia zmienia administrator w panelu (admin.html → „Integracje”).
 * Klucze API (token SMSAPI, token Fakturowni) NIE są zapisywane w przeglądarce: każdy użytkownik
 * mógłby je odczytać. Po podłączeniu serwera panel wyśle je tam jako sekrety, a wysyłką SMS
 * i wystawianiem faktur zajmie się serwer. Do tego czasu (prototyp):
 *   - zapisujemy tylko ustawienia jawne (nadawca, szablon SMS, rodzaje faktur, nazwy pozycji, VAT…),
 *   - SMS-y trafiają do skrzynki nadawczej w panelu administratora — w treści według szablonu,
 *   - faktury trafiają do kolejki „Faktury do wystawienia” z kompletem danych dla Fakturowni.
 */
(function () {
  const KEY = 'anws-integrations';
  const QUEUE_KEY = 'anws-invoices';
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  const load = (k, fb) => safe(() => JSON.parse(localStorage.getItem(k)) || fb, fb);
  const store = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));

  const DEFAULTS = {
    sms: {
      enabled: false,
      sender: 'ANWS',          // nazwa nadawcy — musi być zarejestrowana w SMSAPI (do 11 znaków)
      test: true,              // tryb testowy SMSAPI (test=1): bramka przyjmuje SMS, ale go nie wysyła
      normalize: true,         // bez polskich znaków — 160 zamiast 70 znaków w jednym SMS-ie
      template: 'ANWS PILNE: {trasa} {data} {od}-{do}, {osoby} os., {km} km, {stawka} netto {link}', // mieści się w 1 SMS-ie (160 znaków)
    },
    fv: {
      enabled: false,
      domain: '',              // np. „anws” dla anws.fakturownia.pl
      department: '',          // opcjonalnie: ID działu (firmy) w Fakturowni
      vat: 23,
      payDays: 7,
      sendEmail: true,         // Fakturownia wysyła fakturę e-mailem do klienta
      kinds: { commission: true, subscription: true, cancel: true, expired: true },
      names: {
        commission: 'Prowizja za pośrednictwo w zleceniu przewozu nr {nr} ({trasa})',
        subscription: 'Abonament ANWS — dostęp do giełdy zleceń, okres {okres}',
        cancel: 'Opłata za anulowanie zlecenia nr {nr} ({trasa})',
        expired: 'Opłata za niepodjęte zlecenie nr {nr} ({trasa})',
      },
    },
  };
  const merge = (d, v) => {
    const out = Array.isArray(d) ? d.slice() : Object.assign({}, d);
    Object.keys(v || {}).forEach((k) => { out[k] = d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) ? merge(d[k], v[k]) : v[k]; });
    return out;
  };
  const settings = () => merge(DEFAULTS, load(KEY, {}));
  const saveSettings = (s) => store(KEY, s);

  /* ---------- SMS ---------- */
  const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z', Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' };
  const plain = (t) => String(t).replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL[c]).replace(/[–—]/g, '-').replace(/[„”]/g, '"');
  // podstawowy alfabet GSM 03.38 (bez rozszerzeń) — gdy wszystkie znaki z niego, SMS ma 160 znaków
  const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;
  const GSM_EXT = /[\^{}\\\[~\]|€]/g; // rozszerzenie GSM — liczy się jako 2 znaki, ale nie wymusza Unicode
  function smsParts(text) {
    const gsm = GSM.test(text.replace(GSM_EXT, ''));
    const len = gsm ? text.length + (text.match(GSM_EXT) || []).length : text.length;
    const one = gsm ? 160 : 70, multi = gsm ? 153 : 67;
    return { len, gsm, parts: len <= one ? 1 : Math.ceil(len / multi) };
  }
  const hm = (d) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const plzl = (n) => new Intl.NumberFormat('pl-PL', { useGrouping: 'always', maximumFractionDigits: 2 }).format(n) + ' zł';
  // dane do szablonu SMS z zlecenia (trasa skrócona do miast — SMS ma być krótki)
  function smsVars(o, link) {
    const st = { pickups: o.pickups && o.pickups.length ? o.pickups : [o.from], drops: o.drops && o.drops.length ? o.drops : [o.to] };
    const d = new Date(o.dep), a = new Date(o.arr);
    return {
      trasa: st.pickups.concat(st.drops).map((p) => p.label.split(',')[0]).join(' > '),
      koniec: o.end ? o.end.label.split(',')[0] : '',
      data: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
      od: hm(d), do: hm(a), osoby: o.pax, km: o.km, stawka: plzl(o.rate), link: link || '',
    };
  }
  const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  function smsText(o, link, cfg) {
    const s = (cfg || settings()).sms;
    // twarde spacje z formatowania kwot (1 250 zł) zamieniamy na zwykłe — inaczej SMS liczy się jako Unicode
    const text = fill(s.template, smsVars(o, link)).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+\|\s+\|/g, ' |').trim();
    return s.normalize ? plain(text) : text;
  }

  /* ---------- faktury (kolejka dla Fakturowni) ---------- */
  const queue = () => load(QUEUE_KEY, []);
  const auth = () => window.ANWSAuth;
  const orderNo = (o) => { const d = new Date(o.createdAt || Date.now()); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(o.id).toUpperCase()}`; };
  const round2 = (n) => Math.round(n * 100) / 100;
  /* kind: commission | subscription | cancel | expired
   * d: { login, net, order?, from?, to?, paid? } → pozycja w kolejce z danymi do POST /invoices.json */
  function invoice(kind, d) {
    const cfg = settings().fv;
    if (!cfg.kinds[kind] || !d || !d.login || !(d.net > 0)) return null;
    const A = auth();
    const p = (A && A.profile(d.login)) || {};
    const o = d.order;
    const vars = {
      nr: o ? orderNo(o) : '',
      trasa: o ? `${o.from.label.split(',')[0]} → ${o.to.label.split(',')[0]}` : '',
      okres: d.from ? `${new Date(d.from).toLocaleDateString('pl-PL')} – ${new Date(d.to).toLocaleDateString('pl-PL')}` : '',
    };
    const net = round2(d.net), vat = cfg.vat, gross = round2(net * (1 + vat / 100));
    const item = {
      id: 'fv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), kind, login: d.login,
      buyer: { name: p.company || (A ? A.nameOf(d.login) : d.login), nip: p.nip || '', email: p.email || '', address: p.address || '' },
      position: { name: fill(cfg.names[kind], vars), net, vat, gross },
      payDays: cfg.payDays, paid: !!d.paid, orderId: o ? o.id : null,
      status: 'pending', // pending — czeka na serwer; sent — wystawiona w Fakturowni
    };
    const q = queue();
    q.unshift(item);
    store(QUEUE_KEY, q.slice(0, 300));
    return item;
  }
  // treść zapytania do API Fakturowni (podgląd w panelu; wyśle je serwer z tokenem)
  function fakturowniaPayload(item, cfg) {
    const c = cfg || settings().fv;
    const today = new Date(item.at).toISOString().slice(0, 10);
    return {
      invoice: Object.assign({
        kind: 'vat', sell_date: today, issue_date: today,
        payment_to_kind: item.paid ? 'other_date' : String(c.payDays), payment_type: 'transfer',
        status: item.paid ? 'paid' : 'issued',
        buyer_name: item.buyer.name, buyer_tax_no: item.buyer.nip, buyer_email: item.buyer.email,
        buyer_street: item.buyer.address,
        positions: [{ name: item.position.name, tax: item.position.vat, total_price_gross: item.position.gross, quantity: 1 }],
      }, c.department ? { department_id: c.department } : {}),
      send_by_email: !!c.sendEmail,
    };
  }

  window.ANWSInt = { settings, saveSettings, DEFAULTS, smsText, smsVars, smsParts, plain, fill, invoice, queue, fakturowniaPayload };
})();
