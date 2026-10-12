// ANWS — cennik: kalkulator „Który bilet się opłaca?”

(function () {
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const vIn = $('#calc-value');
  const nIn = $('#calc-count');
  if (!vIn || !nIn) return;

  const SUB = 500; // abonament, zł / miesiąc

  // Prowizja wg strefy wartości zlecenia (stawka dla całego zlecenia)
  const rate = (v) => (v <= 2500 ? 0.025 : v <= 10000 ? 0.02 : 0.03);
  const zone = (v) => (v <= 2500 ? 1 : v <= 10000 ? 2 : 3);

  // Suwak 0–1000 podzielony na trzy równe strefy (jak paski pod nim), choć zakresy złotówek są różne
  function toValue(pos) {
    const p = pos / 1000;
    let v;
    if (p <= 1 / 3) v = 100 + (p * 3) * (2500 - 100);
    else if (p <= 2 / 3) v = 2500 + ((p - 1 / 3) * 3) * 7500;
    else v = 10000 + ((p - 2 / 3) * 3) * 20000;
    const step = v < 2500 ? 50 : v < 10000 ? 100 : 500;
    return Math.round(v / step) * step;
  }

  const DICT = window.I18N || {};
  const t = (k) => {
    const lang = root.lang === 'en' ? 'en' : 'pl';
    return (DICT[lang] && DICT[lang][k] != null) ? DICT[lang][k] : DICT.pl[k];
  };
  const locale = () => (root.lang === 'en' ? 'en-GB' : 'pl-PL');
  // useGrouping: 'always' — także „6 000 zł” (po polsku domyślnie grupuje dopiero od 10 000)
  const zl = (x) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2, useGrouping: 'always' }).format(x) + ' zł';
  const pct = (r) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(r * 100) + '%';

  const els = {
    vOut: $('#calc-value-out'), nOut: $('#calc-count-out'),
    per: $('#cr-per'), a: $('#cr-a'), aFill: $('#cr-a-fill'), bFill: $('#cr-b-fill'),
    verdict: $('#cr-verdict'), result: $('.calc-result'),
  };

  function update() {
    const v = toValue(+vIn.value);
    const n = +nIn.value;
    const r = rate(v);
    const per = v * r;
    const monthA = per * n;

    els.vOut.textContent = zl(v);
    vIn.setAttribute('aria-valuetext', zl(v));
    els.nOut.textContent = n;
    els.per.textContent = pct(r) + ' · ' + zl(per);
    els.a.textContent = zl(monthA);

    const max = Math.max(monthA, SUB) * 1.08;
    els.aFill.style.width = (monthA / max * 100).toFixed(1) + '%';
    els.bFill.style.width = (SUB / max * 100).toFixed(1) + '%';

    const diff = Math.abs(monthA - SUB);
    let key = 'c.even', win = '';
    if (diff >= 0.5) { key = monthA < SUB ? 'c.winA' : 'c.winB'; win = monthA < SUB ? 'a' : 'b'; }
    els.verdict.textContent = t(key).replace('{x}', zl(Math.round(diff)));
    els.result.dataset.win = win;

    // aktywna strefa — pod suwakiem i na bilecie
    const z = zone(v);
    document.querySelectorAll('.cz, .zone').forEach((el) => {
      el.classList.toggle('is-active', el.classList.contains('cz' + z) || el.classList.contains('z' + z));
    });
  }

  vIn.addEventListener('input', update);
  nIn.addEventListener('input', update);
  document.addEventListener('anws:lang', update);
  update();
})();
