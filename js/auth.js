/* ANWS — konta, logowanie i rejestracja (prototyp po stronie przeglądarki).
 *
 * Strona działa na GitHub Pages, bez serwera, więc „baza” jest tu i w localStorage
 * tej przeglądarki, a hasła są zapisane jako skróty SHA-256 (nie otwartym tekstem).
 * Docelowo każdą funkcję poniżej zastępuje zapytanie do API — reszta strony
 * z nich korzysta i nie wymaga zmian. E-maile trafiają na razie do „skrzynki
 * nadawczej” widocznej w panelu administratora (admin.html); serwer wyśle je naprawdę.
 *
 * Konta testowe (do usunięcia przy podpięciu backendu):
 *   demo  / Autobus2026!  — konto aktywne
 *   nowy  / Autobus2026!  — konto niepotwierdzone (komunikat o administratorze)
 *   admin / admin         — administrator (panel: admin.html); hasło zmienisz w panelu
 */
(function () {
  const USERS = [
    { login: 'demo', name: 'Konto demo', role: 'user', confirmed: true, hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
    { login: 'nowy', name: 'Nowy użytkownik', role: 'user', confirmed: false, hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
    { login: 'admin', name: 'Administrator', role: 'admin', confirmed: true, hash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' },
  ];
  const ADMIN_EMAIL = '[e-mail administratora]';

  const KEY = 'anws-session';
  const REG_KEY = 'anws-registrations';
  const OUT_KEY = 'anws-outbox';
  const PASS_KEY = 'anws-passwords'; // zmienione hasła wbudowanych kont (prototyp; docelowo baza)
  const DEFAULT_ADMIN_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
  const REMEMBER_DAYS = 30;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
  const load = (k) => safe(() => JSON.parse(localStorage.getItem(k)) || [], []);
  const save = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function read(storage) {
    const raw = safe(() => storage.getItem(KEY));
    if (!raw) return null;
    const s = safe(() => JSON.parse(raw));
    if (!s || !s.login || (s.exp && Date.now() > s.exp)) { safe(() => storage.removeItem(KEY)); return null; }
    return s;
  }

  function mail(to, subject, body) {
    const out = load(OUT_KEY);
    out.unshift({ to, subject, body, at: Date.now() });
    save(OUT_KEY, out.slice(0, 50));
  }

  // wszystkie konta: wbudowane + zaakceptowane z rejestracji
  function findAccount(login) {
    const l = login.trim().toLowerCase();
    const u = USERS.find((x) => x.login === l);
    if (u) {
      const changed = safe(() => JSON.parse(localStorage.getItem(PASS_KEY)) || {}, {})[u.login];
      return changed ? Object.assign({}, u, { hash: changed }) : u;
    }
    const r = load(REG_KEY).find((x) => x.login === l);
    return r ? { login: r.login, name: r.company, role: 'user', confirmed: r.status === 'approved', hash: r.hash } : null;
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
      const regs = load(REG_KEY);
      const login = d.login.trim().toLowerCase();
      const active = regs.filter((r) => r.status !== 'rejected');
      if (USERS.some((u) => u.login === login) || active.some((r) => r.login === login)) return { ok: false, error: 'login_taken' };
      if (active.some((r) => r.nip === d.nip)) return { ok: false, error: 'nip_taken' };
      if (active.some((r) => r.email.toLowerCase() === d.email.toLowerCase())) return { ok: false, error: 'email_taken' };
      const reg = {
        id: 'r' + Date.now().toString(36),
        login, hash: await sha256(d.password),
        type: 'carrier', company: d.company, nip: d.nip, krs: d.krs || '', regon: d.regon || '',
        licence: d.licence || '', contactName: d.contactName || '',
        pkd: d.pkd || [], phone: d.phone, alarmPhone: d.alarmPhone, email: d.email.trim(),
        consentAt: Date.now(), status: 'pending', createdAt: Date.now(),
      };
      regs.unshift(reg);
      save(REG_KEY, regs);
      mail(ADMIN_EMAIL, `Nowy wniosek o rejestrację: ${reg.company}`,
        `Firma ${reg.company} (NIP ${reg.nip}, licencja ${reg.licence}) prosi o założenie konta „${reg.login}”. Osoba do kontaktu: ${reg.contactName}. Sprawdź i zaakceptuj wniosek w panelu administratora.`);
      return { ok: true };
    },

    /* Zmiana hasła zalogowanego konta wbudowanego (np. admin).
     * Zwraca { ok: true } albo { ok: false, error: 'current' | 'weak' } */
    async changePassword(current, next) {
      await wait(400);
      const s = this.getSession();
      const acc = s && findAccount(s.login);
      if (!acc || !USERS.some((u) => u.login === acc.login)) return { ok: false, error: 'current' };
      if ((await sha256(current)) !== acc.hash) return { ok: false, error: 'current' };
      if (next.length < 8 || !/\p{L}/u.test(next) || !/\d/.test(next)) return { ok: false, error: 'weak' };
      const map = safe(() => JSON.parse(localStorage.getItem(PASS_KEY)) || {}, {});
      map[acc.login] = await sha256(next);
      save(PASS_KEY, map);
      return { ok: true };
    },
    // czy administrator nadal ma domyślne hasło „admin”
    adminHasDefaultPassword() {
      return findAccount('admin').hash === DEFAULT_ADMIN_HASH;
    },

    // Rejestracja — etap 2 (administrator)
    listRegistrations() { return load(REG_KEY); },
    outbox() { return load(OUT_KEY); },
    decide(id, approve) {
      const regs = load(REG_KEY);
      const r = regs.find((x) => x.id === id);
      if (!r || r.status !== 'pending') return false;
      r.status = approve ? 'approved' : 'rejected';
      r.decidedAt = Date.now();
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
