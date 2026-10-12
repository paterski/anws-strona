// ANWS — interakcje strony głównej

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  // Kafelki: przechył 3D i poświata za kursorem
  document.querySelectorAll('.tile').forEach((el) => {
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

  // Menu mobilne
  const btn = document.querySelector('.menu-btn');
  const menu = document.getElementById('menu');
  if (!btn || !menu) return;

  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu');
  };

  btn.addEventListener('click', () => {
    const open = menu.hidden;
    setOpen(open);
    if (open) menu.querySelector('a').focus();
  });

  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });

  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      btn.focus();
    }
  });

  window.matchMedia('(min-width: 1041px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
})();
