/* ANWS — logowanie (prototyp po stronie przeglądarki).
 *
 * Strona działa na GitHub Pages, bez serwera, więc „baza” użytkowników jest tu,
 * a hasła są zapisane jako skróty SHA-256 (nie otwartym tekstem). Docelowo
 * login() trzeba zamienić na zapytanie do API — reszta strony z niego korzysta
 * i nie wymaga zmian.
 *
 * Konta testowe (do usunięcia przy podpięciu backendu):
 *   demo / Autobus2026!   — konto aktywne
 *   nowy / Autobus2026!   — konto niepotwierdzone (pokazuje komunikat o administratorze)
 */
(function () {
  const USERS = [
    { login: 'demo', name: 'Konto demo', confirmed: true, hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
    { login: 'nowy', name: 'Nowy użytkownik', confirmed: false, hash: 'ea154322e34a4a49e147e9c13e53fd3a947cb49124268052980f0d858493a8f9' },
  ];

  const KEY = 'anws-session';
  const REMEMBER_DAYS = 30;

  const safe = (fn) => { try { return fn(); } catch (e) { return null; } };

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

  window.ANWSAuth = {
    // Sesja: „zapamiętaj mnie” → localStorage na 30 dni, bez niego → do zamknięcia karty
    getSession() {
      return read(localStorage) || read(sessionStorage);
    },

    // Zwraca { ok: true } albo { ok: false, error: 'user' | 'password' }
    async login(login, password, remember) {
      await new Promise((r) => setTimeout(r, 650)); // jak prawdziwe zapytanie do serwera
      const user = USERS.find((u) => u.login === login.trim().toLowerCase());
      if (!user || !user.confirmed) return { ok: false, error: 'user' };
      if ((await sha256(password)) !== user.hash) return { ok: false, error: 'password' };
      const session = { login: user.login, name: user.name, exp: remember ? Date.now() + REMEMBER_DAYS * 864e5 : null };
      safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session)));
      return { ok: true };
    },

    logout() {
      safe(() => localStorage.removeItem(KEY));
      safe(() => sessionStorage.removeItem(KEY));
    },
  };
})();
