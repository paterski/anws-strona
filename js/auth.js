/* ANWS — konta, logowanie, rejestracja i reset hasła (prototyp po stronie przeglądarki).
 *
 * Strona działa na GitHub Pages, bez serwera, więc „baza” jest tu i w localStorage
 * tej przeglądarki, a hasła i tokeny resetu są zapisane jako skróty SHA-256.
 * Docelowo każdą funkcję poniżej zastępuje zapytanie do API — reszta strony
 * z nich korzysta i nie wymaga zmian. E-maile trafiają na razie do „skrzynki
 * nadawczej” widocznej w panelu administratora (admin.html); serwer wyśle je naprawdę.
 *
 * Konta testowe (do usunięcia przy podpięciu backendu):
 *   demo      / Autobus2026!  — konto aktywne, model prowizyjny (e-mail do resetu: demo@example.com)
 *   abonament / Autobus2026!  — konto aktywne, abonament opłacony jeszcze na kilkanaście dni (rezerwacje bez prowizji)
 *   nowy  / Autobus2026!  — konto niepotwierdzone (komunikat o administratorze)
 *   admin / admin         — administrator (panel: admin.html); hasło zmienisz w panelu
 * Wnioski testowe (SEED) — po akceptacji w panelu loguje się nimi hasłem Testowe2026!
 */
(function () {
  const USERS = [
    { login: 'demo', name: 'Konto demo', role: 'user', confirmed: true, email: 'demo@example.com', contactName: 'Jan Demo', phone: '+48500100200', alarmPhone: '+48500100200', activatedAt: Date.UTC(2026, 0, 15), hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
    { login: 'abonament', name: 'Konto abonamentowe', role: 'user', confirmed: true, email: 'abonament@example.com', contactName: 'Anna Abonament', phone: '+48500300400', alarmPhone: '+48500300400', activatedAt: Date.UTC(2026, 0, 15), hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
    { login: 'nowy', name: 'Nowy użytkownik', role: 'user', confirmed: false, email: 'nowy@example.com', hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
    { login: 'admin', name: 'Administrator', role: 'admin', confirmed: true, hash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' },
  ];
  const ADMIN_EMAIL = '[e-mail administratora]';
  const DEFAULT_ADMIN_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

  // Trzy wnioski testowe — dane firm z publicznych rejestrów (Biała lista VAT, KRS), sprawdzone
  // tym samym modułem weryfikacji co formularz. Osoby, e-maile i telefony są fikcyjne.
  const SEED_HASH = '3e0afeb32bef3d9dca1931d9241ca68b24ca036792e4e49f8c8395d193350005';
  const SEED = [
    { login: 'pks.mysliborz', company: 'PRZEDSIĘBIORSTWO KOMUNIKACJI SAMOCHODOWEJ W MYŚLIBORZU SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', nip: '5971520791', krs: '0000116139', regon: '811925262', pkd: ['49.39.Z'], contactName: 'Jan Testowy', phone: '+48500000001', alarmPhone: '+48500000011', email: 'test1@example.com', hoursAgo: 26 },
    { login: 'polbus', company: '"POLBUS-PKS" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', nip: '5221017639', krs: '0000008042', regon: '010930300', pkd: ['49.39.Z', '49.31.Z'], contactName: 'Anna Przykładowa', phone: '+48500000002', alarmPhone: '+48500000022', email: 'test2@example.com', hoursAgo: 5 },
    { login: 'intertrans', company: '"INTERTRANS" PKS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', nip: '6931856002', krs: '0000936367', regon: '390688876', pkd: ['49.39.Z', '49.31.Z'], contactName: 'Piotr Próbny', phone: '+420600000003', alarmPhone: '+48500000033', email: 'test3@example.com', hoursAgo: 1 },
  ];

  const KEY = 'anws-session';
  const REG_KEY = 'anws-registrations';
  const OUT_KEY = 'anws-outbox';
  const PASS_KEY = 'anws-passwords'; // zmienione hasła wbudowanych kont (prototyp; docelowo baza)
  const RESET_KEY = 'anws-resets';
  const SEED_FLAG = 'anws-seeded';
  const NOTE_KEY = 'anws-notifications';
  const BILL_KEY = 'anws-billing';     // model rozliczeń kont: wybór, opłacony abonament, historia opłat
  const PROFILE_KEY = 'anws-profiles'; // zmienione dane kontaktowe kont wbudowanych (prototyp; docelowo baza)
  const SUB_PRICE = 500;               // abonament, zł netto / 30 dni
  const SUB_DAYS = 30;
  const DAY = 864e5;
  const REMEMBER_DAYS = 30;
  const RESET_MINUTES = 30;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
  const loadRaw = (k, empty) => safe(() => JSON.parse(localStorage.getItem(k)) || empty, empty);
  const save = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const strong = (p) => p.length >= 8 && /\p{L}/u.test(p) && /\d/.test(p);

  function mail(to, subject, body) {
    const out = loadRaw(OUT_KEY, []);
    out.unshift({ to, subject, body, at: Date.now() });
    save(OUT_KEY, out.slice(0, 50));
  }

  // Wnioski testowe dodajemy raz na przeglądarkę (panel nie jest pusty przy pierwszym otwarciu)
  function ensureSeed() {
    if (safe(() => localStorage.getItem(SEED_FLAG))) return;
    const regs = loadRaw(REG_KEY, []);
    const out = loadRaw(OUT_KEY, []);
    SEED.forEach((s, i) => {
      if (regs.some((r) => r.nip === s.nip || r.login === s.login)) return;
      const at = Date.now() - s.hoursAgo * 36e5;
      const r = Object.assign({ id: 'seed' + (i + 1), hash: SEED_HASH, type: 'carrier', status: 'pending', createdAt: at, consentAt: at, seed: true }, s);
      delete r.hoursAgo;
      regs.push(r);
      out.push({ to: ADMIN_EMAIL, subject: `Nowy wniosek o rejestrację: ${s.company}`, body: `Firma ${s.company} (NIP ${s.nip}) prosi o założenie konta „${s.login}”. Osoba do kontaktu: ${s.contactName}. Sprawdź i zaakceptuj wniosek w panelu administratora.`, at });
    });
    save(REG_KEY, regs.sort((a, b) => b.createdAt - a.createdAt));
    save(OUT_KEY, out.sort((a, b) => b.at - a.at).slice(0, 50));
    safe(() => localStorage.setItem(SEED_FLAG, '1'));
  }
  const loadRegs = () => { ensureSeed(); return loadRaw(REG_KEY, []); };

  function read(storage) {
    const raw = safe(() => storage.getItem(KEY));
    if (!raw) return null;
    const s = safe(() => JSON.parse(raw));
    if (!s || !s.login || (s.exp && Date.now() > s.exp)) { safe(() => storage.removeItem(KEY)); return null; }
    return s;
  }

  // wszystkie konta: wbudowane (z ewentualnie zmienionym hasłem) + wnioski z rejestracji
  function findAccount(login) {
    const l = String(login || '').trim().toLowerCase();
    const u = USERS.find((x) => x.login === l);
    if (u) {
      const changed = loadRaw(PASS_KEY, {})[u.login];
      return Object.assign({ builtIn: true }, u, loadRaw(PROFILE_KEY, {})[u.login] || {}, changed ? { hash: changed } : {});
    }
    const r = loadRegs().find((x) => x.login === l);
    return r ? {
      login: r.login, name: r.company, role: 'user', confirmed: r.status === 'approved', hash: r.hash, email: r.email,
      activatedAt: r.approvedAt || null, createdAt: r.createdAt || null, contactName: r.contactName || '', phone: r.phone || '', alarmPhone: r.alarmPhone || '',
      company: r.company, nip: r.nip, krs: r.krs || '', regon: r.regon || '', pkd: r.pkd || [],
    } : null;
  }

  async function setHash(login, hash) {
    if (USERS.some((x) => x.login === login)) {
      const map = loadRaw(PASS_KEY, {});
      map[login] = hash;
      save(PASS_KEY, map);
      return;
    }
    const regs = loadRegs();
    const r = regs.find((x) => x.login === login);
    if (r) { r.hash = hash; save(REG_KEY, regs); }
  }

  /* Model rozliczeń konta (prototyp: localStorage). Abonament jest opłacany z góry za 30 dni;
   * gdy opłacony okres się skończy, konto samo wraca na model prowizyjny. Pierwszy miesiąc od
   * aktywacji jest bezpłatny w obu modelach — abonament kupiony w tym czasie zaczyna się po nim. */
  function billingState(login) {
    const map = loadRaw(BILL_KEY, {});
    if (!map[login]) {
      const now = Date.now();
      if (login === 'abonament') {
        const from = now - 12 * DAY, to = from + SUB_DAYS * DAY;
        map[login] = { chosen: true, subStart: from, paidUntil: to, history: [{ type: 'sub', amount: SUB_PRICE, from, to, at: from }] };
      } else map[login] = { chosen: login === 'demo', history: [] }; // nowe konta muszą wybrać model w panelu klienta
      save(BILL_KEY, map);
    }
    return map[login];
  }
  function saveBilling(login, b) { const map = loadRaw(BILL_KEY, {}); map[login] = b; save(BILL_KEY, map); }

  function endSessionsOf(login) {
    [localStorage, sessionStorage].forEach((st) => {
      const s = read(st);
      if (s && s.login === login) safe(() => st.removeItem(KEY));
    });
  }

  window.ANWSAuth = {
    // Sesja: „zapamiętaj mnie” → localStorage na 30 dni, bez niego → do zamknięcia karty
    getSession() {
      return read(localStorage) || read(sessionStorage);
    },

    // Zwraca { ok: true, role } albo { ok: false, error: 'user' | 'password' }
    async login(login, password, remember) {
      await wait(650); // jak prawdziwe zapytanie do serwera
      const user = findAccount(login);
      if (!user || !user.confirmed) return { ok: false, error: 'user' };
      if ((await sha256(password)) !== user.hash) return { ok: false, error: 'password' };
      const session = { login: user.login, name: user.name, role: user.role, exp: remember ? Date.now() + REMEMBER_DAYS * 864e5 : null };
      safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session)));
      return { ok: true, role: user.role };
    },

    logout() {
      safe(() => localStorage.removeItem(KEY));
      safe(() => sessionStorage.removeItem(KEY));
    },

    /* Rejestracja — etap 1: wniosek czeka na akceptację administratora.
     * Zwraca { ok: true } albo { ok: false, error: 'login_taken' | 'nip_taken' | 'email_taken' } */
    async register(d) {
      await wait(700);
      const regs = loadRegs();
      const login = d.login.trim().toLowerCase();
      const active = regs.filter((r) => r.status !== 'rejected');
      if (USERS.some((u) => u.login === login) || active.some((r) => r.login === login)) return { ok: false, error: 'login_taken' };
      if (active.some((r) => r.nip === d.nip)) return { ok: false, error: 'nip_taken' };
      if (active.some((r) => r.email.toLowerCase() === d.email.toLowerCase())) return { ok: false, error: 'email_taken' };
      const reg = {
        id: 'r' + Date.now().toString(36),
        login, hash: await sha256(d.password),
        type: 'carrier', company: d.company, nip: d.nip, krs: d.krs || '', regon: d.regon || '',
        contactName: d.contactName || '',
        pkd: d.pkd || [], phone: d.phone, alarmPhone: d.alarmPhone, email: d.email.trim(),
        consentAt: Date.now(), status: 'pending', createdAt: Date.now(),
      };
      regs.unshift(reg);
      save(REG_KEY, regs);
      mail(ADMIN_EMAIL, `Nowy wniosek o rejestrację: ${reg.company}`,
        `Firma ${reg.company} (NIP ${reg.nip}) prosi o założenie konta „${reg.login}”. Osoba do kontaktu: ${reg.contactName}. Sprawdź i zaakceptuj wniosek w panelu administratora.`);
      return { ok: true };
    },

    /* Zmiana hasła zalogowanego konta (panel klienta, panel administratora).
     * Zwraca { ok: true } albo { ok: false, error: 'current' | 'weak' } */
    async changePassword(current, next) {
      await wait(400);
      const s = this.getSession();
      const acc = s && findAccount(s.login);
      if (!acc) return { ok: false, error: 'current' };
      if ((await sha256(current)) !== acc.hash) return { ok: false, error: 'current' };
      if (!strong(next)) return { ok: false, error: 'weak' };
      await setHash(acc.login, await sha256(next));
      return { ok: true };
    },
    // czy administrator nadal ma domyślne hasło „admin”
    adminHasDefaultPassword() {
      return findAccount('admin').hash === DEFAULT_ADMIN_HASH;
    },

    /* Reset hasła — krok 1: prośba o link. Zawsze zwraca { ok: true } (bez zdradzania,
     * czy adres istnieje). Link jest jednorazowy i ważny 30 minut; zapisujemy tylko skrót tokenu.
     * Konto administratora odzyskuje się poza stroną (bezpieczeństwo). */
    async requestReset(email) {
      await wait(800);
      const e = String(email || '').trim().toLowerCase();
      const builtIn = USERS.find((u) => u.email && u.email === e && u.role !== 'admin' && u.confirmed);
      const reg = loadRegs().find((r) => r.email.toLowerCase() === e && r.status === 'approved');
      const login = builtIn ? builtIn.login : reg ? reg.login : null;
      if (!login) return { ok: true };
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const resets = loadRaw(RESET_KEY, []).filter((r) => r.login !== login && r.exp > Date.now()); // nowy link unieważnia poprzedni
      resets.push({ hash: await sha256(token), login, exp: Date.now() + RESET_MINUTES * 6e4 });
      save(RESET_KEY, resets);
      const link = new URL('reset-hasla.html?token=' + token, location.href).href;
      mail(e, 'Reset hasła w ANWS',
        `Dzień dobry! Otrzymaliśmy prośbę o zmianę hasła do konta „${login}”. Aby ustawić nowe hasło, otwórz link (ważny ${RESET_MINUTES} minut, jednorazowy): ${link} Jeśli to nie Ty, zignoruj tę wiadomość — hasło pozostanie bez zmian.`);
      return { ok: true };
    },

    // Reset hasła — krok 2: sprawdzenie linku. { ok: true, login } albo { ok: false }
    async checkResetToken(token) {
      if (!/^[0-9a-f]{48}$/.test(String(token || ''))) return { ok: false };
      const h = await sha256(token);
      const r = loadRaw(RESET_KEY, []).find((x) => x.hash === h);
      return r && r.exp > Date.now() ? { ok: true, login: r.login } : { ok: false };
    },

    // Reset hasła — krok 3: nowe hasło. { ok: true } albo { ok: false, error: 'invalid' | 'weak' }
    async resetPassword(token, next) {
      await wait(600);
      const check = await this.checkResetToken(token);
      if (!check.ok) return { ok: false, error: 'invalid' };
      if (!strong(next)) return { ok: false, error: 'weak' };
      await setHash(check.login, await sha256(next));
      save(RESET_KEY, loadRaw(RESET_KEY, []).filter((x) => x.login !== check.login)); // link jednorazowy
      endSessionsOf(check.login);
      const acc = findAccount(check.login);
      if (acc && acc.email) mail(acc.email, 'Hasło do ANWS zostało zmienione',
        `Dzień dobry! Hasło do konta „${check.login}” zostało właśnie zmienione. Jeśli to nie Ty, natychmiast skontaktuj się z nami: +48 884 106 851.`);
      return { ok: true };
    },

    /* Model rozliczeń konta:
     * { plan: 'subscription' | 'commission', chosen, free, freeUntil, subStart, paidUntil, upcoming, switchToCommission, history }
     * plan — model obowiązujący teraz; upcoming — abonament opłacony, ale zaczyna się później (po darmowym miesiącu);
     * free = rezerwacja bez prowizji (aktywny abonament albo pierwszy miesiąc od aktywacji konta). */
    getPlan(login) {
      const acc = findAccount(login);
      if (!acc) return { plan: 'commission', chosen: false, free: false, freeUntil: 0, history: [] };
      const b = billingState(acc.login);
      const now = Date.now();
      const freeUntil = acc.activatedAt ? acc.activatedAt + 30 * DAY : 0;
      const subActive = !!b.paidUntil && now >= (b.subStart || 0) && now < b.paidUntil;
      // opłacony okres minął: konto wraca na prowizję — raz wysyłamy powiadomienie i e-mail
      if (b.paidUntil && now >= b.paidUntil && !b.endNotified) {
        b.endNotified = true; b.switchToCommission = false; saveBilling(acc.login, b);
        this.notify(acc.login, { type: 'subEnded', route: '', subject: 'Abonament ANWS wygasł — rozliczasz się prowizją',
          body: `Dzień dobry! Opłacony abonament konta „${acc.login}” skończył się ${new Date(b.paidUntil).toLocaleDateString('pl-PL')}. Od teraz rezerwacje rozliczamy prowizją według cennika. Abonament możesz w każdej chwili wykupić ponownie w panelu klienta.` });
      }
      return {
        plan: subActive ? 'subscription' : 'commission', chosen: !!b.chosen,
        free: subActive || now < freeUntil, freeUntil,
        subStart: b.subStart || 0, paidUntil: b.paidUntil || 0, upcoming: !!b.paidUntil && now < (b.subStart || 0),
        switchToCommission: !!b.switchToCommission, history: b.history || [], price: SUB_PRICE, days: SUB_DAYS,
      };
    },

    // Wybór modelu w panelu klienta. Prowizja przy opłaconym abonamencie = przejście po jego końcu.
    choosePlan(login, plan) {
      const acc = findAccount(login);
      if (!acc) return { ok: false };
      if (plan === 'subscription') return this.buySubscription(login);
      const b = billingState(acc.login);
      b.chosen = true;
      if (b.paidUntil && Date.now() < b.paidUntil) b.switchToCommission = true;
      saveBilling(acc.login, b);
      return { ok: true };
    },
    // Zostań przy abonamencie (anuluj zaplanowane przejście na prowizję)
    keepSubscription(login) {
      const b = billingState(login);
      b.switchToCommission = false; saveBilling(login, b);
      return { ok: true };
    },
    // Opłata za kolejne 30 dni abonamentu (prototyp: bez bramki płatności). Okres doklejamy do opłaconego
    // albo zaczynamy od dziś / od końca darmowego miesiąca.
    async buySubscription(login) {
      await wait(500);
      const acc = findAccount(login);
      if (!acc) return { ok: false };
      const b = billingState(acc.login);
      const now = Date.now();
      const freeUntil = acc.activatedAt ? acc.activatedAt + 30 * DAY : 0;
      const running = b.paidUntil && now < b.paidUntil;
      const from = running ? b.paidUntil : Math.max(now, freeUntil);
      if (!running) { b.subStart = from; b.endNotified = false; }
      b.paidUntil = from + SUB_DAYS * DAY;
      b.chosen = true; b.switchToCommission = false;
      b.history = [{ type: 'sub', amount: SUB_PRICE, from, to: b.paidUntil, at: now }].concat(b.history || []).slice(0, 60);
      saveBilling(acc.login, b);
      if (acc.email) mail(acc.email, 'Abonament ANWS opłacony',
        `Dzień dobry! Opłaciliśmy abonament konta „${acc.login}” (${SUB_PRICE} zł netto) na okres ${new Date(from).toLocaleDateString('pl-PL')} – ${new Date(b.paidUntil).toLocaleDateString('pl-PL')}. W tym czasie rezerwujesz zlecenia bez prowizji.`);
      return { ok: true };
    },

    // Dane konta do panelu klienta (NIP, nazwa firmy itd. tylko do odczytu)
    profile(login) {
      const acc = findAccount(login);
      if (!acc) return null;
      return {
        login: acc.login, builtIn: !!acc.builtIn, company: acc.company || acc.name || acc.login, nip: acc.nip || '', krs: acc.krs || '', regon: acc.regon || '',
        pkd: acc.pkd || [], contactName: acc.contactName || '', email: acc.email || '', phone: acc.phone || '', alarmPhone: acc.alarmPhone || '',
        createdAt: acc.createdAt || null, activatedAt: acc.activatedAt || null,
      };
    },
    // Zmiana danych kontaktowych: { contactName, email, phone, alarmPhone } → { ok } albo { ok: false, error: 'email_taken' }
    async updateProfile(login, d) {
      await wait(450);
      const acc = findAccount(login);
      if (!acc) return { ok: false, error: 'user' };
      const email = d.email.trim(), el = email.toLowerCase();
      const others = USERS.filter((u) => u.login !== acc.login).map((u) => (findAccount(u.login).email || '').toLowerCase())
        .concat(loadRegs().filter((r) => r.login !== acc.login && r.status !== 'rejected').map((r) => r.email.toLowerCase()));
      if (others.includes(el)) return { ok: false, error: 'email_taken' };
      const data = { contactName: d.contactName.trim(), email, phone: d.phone, alarmPhone: d.alarmPhone };
      if (acc.builtIn) {
        const map = loadRaw(PROFILE_KEY, {});
        map[acc.login] = Object.assign(map[acc.login] || {}, data);
        save(PROFILE_KEY, map);
      } else {
        const regs = loadRegs();
        Object.assign(regs.find((x) => x.login === acc.login), data);
        save(REG_KEY, regs);
      }
      return { ok: true };
    },

    // Formularz kontaktowy: wiadomość trafia do skrzynki administratora (serwer wyśle ją e-mailem)
    async sendContact(d) {
      await wait(700);
      const s = this.getSession();
      mail(ADMIN_EMAIL, `Formularz kontaktowy: ${d.topic}`,
        `${d.name}${d.company ? ' (' + d.company + ')' : ''} · e-mail ${d.email}${d.phone ? ' · tel. ' + d.phone : ''}${s ? ' · konto „' + s.login + '”' : ''}. Wiadomość: ${d.message}`);
      return { ok: true };
    },

    // nazwa konta do wyświetlania (firma albo nazwa konta testowego)
    nameOf(login) {
      const acc = findAccount(login);
      return acc ? (acc.name || acc.login) : login;
    },

    // kontakt do kontrahenta — administratorowi zawsze, pozostałym dopiero po rezerwacji („Twoje zlecenia”)
    contactOf(login) {
      const acc = findAccount(login) || {};
      return { name: acc.name || acc.login || login, person: acc.contactName || '', phone: acc.phone || '', alarmPhone: acc.alarmPhone || '', email: acc.email || '' };
    },

    /* Powiadomienia dla właściciela zlecenia (rezerwacja, propozycja stawki).
     * Zapisujemy je w panelu powiadomień i wysyłamy e-mailem na adres podany przy rejestracji. */
    notify(toLogin, n) {
      const list = loadRaw(NOTE_KEY, []);
      const item = Object.assign({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to: toLogin, at: Date.now(), read: false }, n);
      delete item.subject; delete item.body;
      list.unshift(item);
      save(NOTE_KEY, list.slice(0, 300));
      const acc = findAccount(toLogin);
      if (acc && acc.email && n.subject) mail(acc.email, n.subject, n.body);
      return item;
    },
    notifications(login) { return loadRaw(NOTE_KEY, []).filter((x) => x.to === login); },
    unreadCount(login) { return this.notifications(login).filter((x) => !x.read).length; },
    markNotificationsRead(login) {
      const list = loadRaw(NOTE_KEY, []);
      list.forEach((x) => { if (x.to === login) x.read = true; });
      save(NOTE_KEY, list);
    },

    // Rejestracja — etap 2 (administrator)
    listRegistrations() { return loadRegs(); },
    outbox() { ensureSeed(); return loadRaw(OUT_KEY, []); },
    decide(id, approve) {
      const regs = loadRegs();
      const r = regs.find((x) => x.id === id);
      if (!r || r.status !== 'pending') return false;
      r.status = approve ? 'approved' : 'rejected';
      r.decidedAt = Date.now();
      if (approve) r.approvedAt = Date.now(); // od aktywacji liczy się darmowy miesiąc; model rozliczeń klient wybiera w panelu
      save(REG_KEY, regs);
      if (approve) {
        mail(r.email, 'Twoje konto ANWS jest aktywne',
          `Dzień dobry${r.contactName ? ' ' + r.contactName : ''}! Rejestracja firmy ${r.company} zakończyła się sukcesem. Możesz zalogować się loginem „${r.login}”.`);
      } else {
        mail(r.email, 'Wniosek o rejestrację w ANWS',
          `Dzień dobry! Niestety nie możemy aktywować konta dla firmy ${r.company}. W razie pytań skontaktuj się z nami.`);
      }
      return true;
    },
  };
})();
