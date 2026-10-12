// ANWS — podstrony dostępne po zalogowaniu (utwórz zlecenie, lista zleceń)

(function () {
  const root = document.documentElement;
  const auth = window.ANWSAuth;
  const session = auth && auth.getSession();

  // Bez sesji: wracamy na stronę główną, która otworzy logowanie i po nim przeniesie tutaj
  if (!session) {
    const page = location.pathname.split('/').pop() + location.search;
    location.replace('index.html?next=' + encodeURIComponent(page));
    return;
  }

  const DICT = window.I18N || {};
  const lang = root.lang === 'en' ? 'en' : 'pl';
  const t = (k) => (DICT[lang] && DICT[lang][k] != null ? DICT[lang][k] : DICT.pl[k]);
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const h1 = document.querySelector('h1[data-i18n]');
  if (h1) document.title = h1.textContent + ' — ANWS';

  const who = document.getElementById('sub-who');
  if (who) who.textContent = session.name || session.login;

  document.getElementById('logout').addEventListener('click', () => {
    auth.logout();
    location.href = 'index.html';
  });

  root.classList.remove('js-guard');
})();
