/* ANWS — zlecenia na giełdzie (prototyp po stronie przeglądarki).
 *
 * Zlecenia, rezerwacje i propozycje stawek zapisują się w localStorage tej przeglądarki.
 * Docelowo każdą funkcję zastępuje zapytanie do API. Przy pierwszym otwarciu dodajemy
 * zlecenia testowe w najbliższych dniach (terminy liczone od „teraz”), żeby giełda nie była pusta.
 *
 * Zlecenie może mieć kilka miejsc odbioru (pickups) i kilka miejsc docelowych (drops);
 * from = pierwsze miejsce odbioru, to = pierwsze miejsce docelowe (to pokazujemy na mapie).
 * end = opcjonalny koniec trasy (np. powrót na pusto do bazy albo wycieczka objazdowa), inaczej null.
 *
 * Opłaty dla zlecających: anulowanie zlecenia (CANCEL_FEE zł) oraz zlecenie, którego nikt nie podjął
 * przed godziną odjazdu (EXPIRE_FEE zł). Nieopłacona opłata blokuje wystawianie kolejnych zleceń.
 */
(function () {
  const KEY = 'anws-orders';
  const SEED_FLAG = 'anws-orders-seeded-v3';
  const FEES_KEY = 'anws-fees';
  const CANCEL_FEE = 100;
  const EXPIRE_FEE = 50;

  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const load = () => safe(() => JSON.parse(localStorage.getItem(KEY)) || [], []);
  const save = (v) => safe(() => localStorage.setItem(KEY, JSON.stringify(v)));
  const auth = () => window.ANWSAuth;
  const loadFees = () => safe(() => JSON.parse(localStorage.getItem(FEES_KEY)) || [], []);
  const saveFees = (v) => safe(() => localStorage.setItem(FEES_KEY, JSON.stringify(v)));

  // Prowizja wg cennika: do 2 500 zł — 2,5%, 2 500–10 000 zł — 2%, powyżej 10 000 zł — 3%
  function commission(rate) {
    const zone = rate <= 2500 ? 1 : rate <= 10000 ? 2 : 3;
    const pct = zone === 1 ? 0.025 : zone === 2 ? 0.02 : 0.03;
    return { zone, pct, amount: Math.round(rate * pct * 100) / 100 };
  }

  // odległość w linii prostej (km) — gdy nie ma trasy drogowej
  function haversine(a, b) {
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const pathKm = (pts) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);

  const stops = (o) => ({ pickups: o.pickups && o.pickups.length ? o.pickups : [o.from], drops: o.drops && o.drops.length ? o.drops : [o.to], end: o.end || null });
  const routeText = (o) => o.from.label + ' → ' + o.to.label;
  const when = (ms) => new Date(ms).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

  const P = {
    waw: { label: 'Warszawa, Dworzec Centralny', lat: 52.2287, lng: 21.0034 },
    wawAir: { label: 'Lotnisko Chopina (WAW), Warszawa', lat: 52.1657, lng: 20.9671 },
    krk: { label: 'Kraków, Rondo Mogilskie', lat: 50.0659, lng: 19.9600 },
    krkAir: { label: 'Lotnisko Kraków-Balice (KRK)', lat: 50.0777, lng: 19.7848 },
    gda: { label: 'Gdańsk, Długi Targ', lat: 54.3484, lng: 18.6533 },
    wro: { label: 'Wrocław, Rynek', lat: 51.1100, lng: 17.0320 },
    poz: { label: 'Poznań, Stary Rynek', lat: 52.4083, lng: 16.9335 },
    lodz: { label: 'Łódź, Manufaktura', lat: 51.7795, lng: 19.4467 },
    kat: { label: 'Katowice, Spodek', lat: 50.2665, lng: 19.0255 },
    szc: { label: 'Szczecin, Wały Chrobrego', lat: 53.4282, lng: 14.5654 },
    lub: { label: 'Lublin, Plac Litewski', lat: 51.2484, lng: 22.5596 },
    bia: { label: 'Białystok, Rynek Kościuszki', lat: 53.1324, lng: 23.1588 },
    rze: { label: 'Rzeszów, Rynek', lat: 50.0375, lng: 22.0049 },
    tor: { label: 'Toruń, Rynek Staromiejski', lat: 53.0102, lng: 18.6048 },
    zak: { label: 'Zakopane, Krupówki', lat: 49.2958, lng: 19.9503 },
    sop: { label: 'Sopot, molo', lat: 54.4462, lng: 18.5701 },
    gdy: { label: 'Gdynia, Skwer Kościuszki', lat: 54.5180, lng: 18.5490 },
    kol: { label: 'Kołobrzeg, port', lat: 54.1817, lng: 15.5590 },
    kar: { label: 'Karpacz, centrum', lat: 50.7766, lng: 15.7563 },
    szk: { label: 'Szklarska Poręba, centrum', lat: 50.8273, lng: 15.5233 },
    cze: { label: 'Częstochowa, Jasna Góra', lat: 50.8124, lng: 19.0971 },
    mal: { label: 'Malbork, Zamek', lat: 54.0396, lng: 19.0277 },
    wie: { label: 'Wieliczka, Kopalnia Soli', lat: 49.9832, lng: 20.0553 },
    srem: { label: 'Śrem, Rynek', lat: 52.0886, lng: 17.0147 },
    kor: { label: 'Kórnik, Zamek', lat: 52.2441, lng: 17.0866 },
    ber: { label: 'Berlin, Alexanderplatz (DE)', lat: 52.5219, lng: 13.4132 },
    pra: { label: 'Praga, Václavské náměstí (CZ)', lat: 50.0812, lng: 14.4280 },
  };

  // [miejsca odbioru, miejsca docelowe, wyjazd za X godzin, liczba osób, pilne, zlecający]
  const SEED = [
    [['wawAir'], ['waw'], 2, 48, true, 'polbus'],
    [['krk'], ['zak'], 4, 52, true, 'intertrans'],
    [['gda', 'sop', 'gdy'], ['mal'], 6, 35, false, 'pks.mysliborz'],
    [['poz'], ['kor', 'srem'], 9, 20, true, 'demo'],
    [['wro'], ['szk', 'kar'], 21, 45, false, 'polbus'],
    [['krkAir'], ['wie'], 27, 30, false, 'intertrans'],
    [['lodz'], ['cze'], 31, 55, false, 'pks.mysliborz'],
    [['kat', 'krk'], ['zak'], 44, 40, true, 'polbus'],
    [['szc'], ['kol'], 50, 50, false, 'intertrans'],
    [['waw', 'wawAir'], ['ber'], 68, 49, false, 'pks.mysliborz'],
    [['lub'], ['rze'], 74, 25, false, 'polbus'],
    [['tor'], ['gda'], 95, 38, false, 'demo'],
    [['bia'], ['wawAir', 'waw'], 118, 52, false, 'pks.mysliborz'],
    [['wro'], ['pra'], 140, 46, false, 'polbus'],
    [['gda'], ['sop'], 166, 18, false, 'intertrans'],
    [['poz'], ['ber'], 190, 44, false, 'pks.mysliborz'],
  ];

  /* Czas pracy kierowcy — szacunek wg rozporządzenia (WE) 561/2006:
   * po 4,5 h jazdy 45 min przerwy; dziennie do 9 h jazdy (2× w tygodniu do 10 h); okres pracy jednego
   * kierowcy mieści się w 13 h (24 h minus 11 h odpoczynku), załogi dwuosobowej — w 21 h (do 20 h jazdy).
   * Średnią prędkość autokaru przyjmujemy 65 km/h (miasta, ograniczenia do 100 km/h).
   * level: one — 1 kierowca; ext — 1 kierowca z wydłużoną jazdą 10 h; two — 2 kierowców; rest — nocleg / zmiana załogi */
  const BUS_KMH = 65;
  function crew(o) {
    const drive = (o.km || 0) / BUS_KMH;
    const span = Math.max(0, (o.arr - o.dep) / 36e5);
    const breaks = Math.max(0, Math.ceil(drive / 4.5) - 1);
    const level = drive > 20 || span > 21 ? 'rest' : drive > 10 || span > 13 ? 'two' : drive > 9 ? 'ext' : 'one';
    return { drive, span, breaks, level, kmh: BUS_KMH };
  }

  /* Historia z ostatnich 10 tygodni — zakończone kursy do statystyk w panelu administratora.
   * Generowana raz (stałe ziarno), niewidoczna na giełdzie (kursy już się odbyły). */
  const HIST_FLAG = 'anws-orders-history-v1';
  const HIST_ROUTES = [['waw', 'krk'], ['krk', 'zak'], ['gda', 'mal'], ['waw', 'ber'], ['wro', 'kar'], ['poz', 'ber'], ['krkAir', 'wie'], ['lodz', 'cze'], ['wawAir', 'waw'], ['kat', 'zak'], ['szc', 'kol'], ['wro', 'pra'], ['gda', 'sop'], ['lub', 'rze'], ['tor', 'gda'], ['bia', 'waw']];
  const HIST_WEIGHT = [9, 8, 4, 6, 5, 3, 4, 3, 7, 4, 3, 2, 3, 2, 2, 2];
  const COMPANIES = ['polbus', 'intertrans', 'pks.mysliborz'];
  function ensureHistory() {
    if (safe(() => localStorage.getItem(HIST_FLAG), '1')) return;
    let seed = 20261014; // mulberry32 — te same dane w każdej przeglądarce
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const total = HIST_WEIGHT.reduce((a, b) => a + b, 0);
    const pick = () => { let r = rnd() * total; for (let i = 0; i < HIST_WEIGHT.length; i++) { r -= HIST_WEIGHT[i]; if (r < 0) return HIST_ROUTES[i]; } return HIST_ROUTES[0]; };
    const now = Date.now(), orders = load(), fees = loadFees();
    for (let i = 0; i < 96; i++) {
      // więcej zleceń w ostatnich tygodniach — giełda rośnie
      const daysAgo = 3 + Math.floor(Math.pow(rnd(), 1.35) * 67);
      const createdAt = roundTo(now - daysAgo * 864e5 - rnd() * 864e5, 15);
      const [a, b] = pick();
      const km = Math.max(8, Math.round(haversine(P[a], P[b]) * 1.25));
      const dep = roundTo(createdAt + (6 + rnd() * 54) * 36e5, 15);
      const arr = roundTo(dep + Math.max(0.5, km / 70) * 36e5, 15);
      const rate = Math.round((350 + km * (5.5 + rnd() * 2.5)) / 50) * 50;
      const owner = COMPANIES[Math.floor(rnd() * 3)];
      const roll = rnd();
      const o = { id: 'h' + (i + 1), from: P[a], to: P[b], pickups: [P[a]], drops: [P[b]], dep, arr, km, rate, pax: 15 + Math.floor(rnd() * 40), urgent: rnd() < 0.2, notes: '', owner, createdAt, hist: true, offers: [] };
      if (roll < 0.74) {
        const by = COMPANIES.filter((c) => c !== owner)[Math.floor(rnd() * 2)];
        const c = commission(rate);
        Object.assign(o, { status: 'reserved', reservedBy: by, reservedAt: createdAt + rnd() * (dep - createdAt) * 0.6, fee: rnd() < 0.35 ? null : { pct: c.pct, amount: c.amount, paid: true } });
      } else if (roll < 0.9) {
        Object.assign(o, { status: 'expired', expiredAt: dep });
        fees.push({ id: 'fh' + i, login: owner, orderId: o.id, type: 'expired', amount: EXPIRE_FEE, route: routeText(o), dep, at: dep, paid: true, paidAt: dep + 864e5 });
      } else {
        const at = createdAt + (dep - createdAt) * 0.5;
        Object.assign(o, { status: 'cancelled', cancelledAt: at });
        fees.push({ id: 'fh' + i, login: owner, orderId: o.id, type: 'cancel', amount: CANCEL_FEE, route: routeText(o), dep, at, paid: true, paidAt: at });
      }
      orders.push(o);
    }
    save(orders); saveFees(fees);
    safe(() => localStorage.setItem(HIST_FLAG, '1'));
  }

  function roundTo(t, minutes) { const m = minutes * 6e4; return Math.ceil(t / m) * m; }

  function ensureSeed() {
    if (safe(() => localStorage.getItem(SEED_FLAG), '1')) return;
    const now = Date.now();
    const orders = load().filter((o) => !o.seed); // starsze zlecenia testowe zastępujemy nowymi
    SEED.forEach(([as, bs, h, pax, urgent, owner], i) => {
      const pickups = as.map((k) => P[k]), drops = bs.map((k) => P[k]);
      const km = Math.max(8, Math.round(pathKm(pickups.concat(drops)) * 1.25));
      const dep = roundTo(now + h * 36e5, 15);
      const arr = roundTo(dep + Math.max(0.5, km / 70) * 36e5, 15);
      const rate = Math.round((350 + km * 6.5) / 50) * 50;
      orders.push({ id: 'o' + (i + 1), from: pickups[0], to: drops[0], pickups, drops, dep, arr, km, rate, pax, urgent, notes: '', owner, createdAt: now - (i + 1) * 36e5, status: 'open', seed: true, offers: [] });
    });
    // przykładowa propozycja stawki do zlecenia konta demo — żeby dzwonek powiadomień nie był pusty
    const demoOrder = orders.find((o) => o.id === 'o4');
    const taken = orders.find((o) => o.id === 'o5');
    if (taken) { taken.status = 'reserved'; taken.reservedBy = 'demo'; taken.reservedAt = now - 2 * 36e5; taken.fee = null; }
    if (demoOrder) demoOrder.offers.push({ by: 'polbus', rate: demoOrder.rate + 100, message: 'Możemy podstawić autokar 49-osobowy.', at: now - 40 * 6e4 });
    save(orders);
    safe(() => localStorage.setItem(SEED_FLAG, '1'));
    const A = auth();
    if (A && A.notify && demoOrder && !A.notifications('demo').some((n) => n.seed && n.orderId === 'o4')) {
      A.notify('demo', { type: 'offer', orderId: 'o4', by: 'polbus', byName: A.nameOf('polbus'), rate: demoOrder.rate + 100, route: routeText(demoOrder), at: now - 40 * 6e4, seed: true });
    }
  }

  // Zlecenia otwarte, których nikt nie podjął przed odjazdem: status „expired” + nieopłacona opłata dla zlecającego
  function sweep(orders) {
    const now = Date.now();
    const late = orders.filter((o) => o.status === 'open' && o.dep <= now);
    if (!late.length) return orders;
    const fees = loadFees();
    late.forEach((o) => {
      o.status = 'expired';
      o.expiredAt = now;
      const fee = { id: 'f' + now.toString(36) + o.id, login: o.owner, orderId: o.id, type: 'expired', amount: EXPIRE_FEE, route: routeText(o), dep: o.dep, at: now, paid: false };
      fees.push(fee);
      const A = auth();
      if (A && A.notify) {
        A.notify(o.owner, {
          type: 'expired', orderId: o.id, route: routeText(o), amount: EXPIRE_FEE,
          subject: 'Nikt nie podjął Twojego zlecenia — opłata ' + EXPIRE_FEE + ' zł netto',
          body: `Dzień dobry! Twoje zlecenie ${routeText(o)} z wyjazdem ${when(o.dep)} nie zostało podjęte przez żadnego przewoźnika przed godziną odjazdu. Zgodnie z cennikiem naliczyliśmy opłatę ${EXPIRE_FEE} zł netto. Do czasu jej opłacenia nie możesz wystawiać nowych zleceń — opłatę uregulujesz na giełdzie ANWS w zakładce „Twoje zlecenia”.`,
        });
      }
    });
    save(orders);
    saveFees(fees);
    return orders;
  }

  window.ANWSOrders = {
    CANCEL_FEE,
    EXPIRE_FEE,
    list() { ensureSeed(); ensureHistory(); return sweep(load()); },
    allFees() { this.list(); return loadFees(); },
    get(id) { return this.list().find((o) => o.id === id) || null; },

    // zlecenia widoczne na giełdzie: nieanulowane, niewygasłe i jeszcze niezakończone
    active() { const now = Date.now(); return this.list().filter((o) => o.arr > now && o.status !== 'cancelled' && o.status !== 'expired' && o.status !== 'removed'); },

    // wygasłe zlecenia użytkownika z nieopłaconą opłatą (pokazujemy je w „Twoich zleceniach”, żeby dało się zapłacić)
    unpaidExpired(login) {
      const ids = new Set(this.unpaidFees(login).map((f) => f.orderId));
      return this.list().filter((o) => o.owner === login && o.status === 'expired' && ids.has(o.id));
    },

    // zlecenia zarezerwowane przez przewoźnika — do wykonania
    taken(login) { return this.active().filter((o) => o.status === 'reserved' && o.reservedBy === login); },
    posted(login) { return this.active().filter((o) => o.owner === login).concat(this.unpaidExpired(login)); },

    counts(login) {
      const a = this.active();
      const open = a.filter((o) => o.status === 'open');
      const posted = login ? this.posted(login).length : 0;
      const taken = login ? this.taken(login).length : 0;
      return { all: open.length, urgent: open.filter((o) => o.urgent).length, mine: posted + taken, posted, taken };
    },

    fees(login) { this.list(); return loadFees().filter((f) => f.login === login); },
    unpaidFees(login) { return this.fees(login).filter((f) => !f.paid); },
    feeFor(orderId) { return loadFees().find((f) => f.orderId === orderId) || null; },

    // Opłacenie kary (prototyp: bez bramki płatności — kliknięcie „Zapłać” oznacza opłatę jako zapłaconą)
    payFee(feeId, login) {
      const fees = loadFees();
      const f = fees.find((x) => x.id === feeId && x.login === login);
      if (!f || f.paid) return false;
      f.paid = true; f.paidAt = Date.now();
      saveFees(fees);
      return true;
    },

    // Anulowanie własnego zlecenia — z opłatą CANCEL_FEE zł (płatną od razu)
    cancel(id, login) {
      const orders = this.list();
      const o = orders.find((x) => x.id === id);
      if (!o || o.owner !== login || (o.status !== 'open' && o.status !== 'reserved')) return false;
      const now = Date.now();
      const wasReservedBy = o.status === 'reserved' ? o.reservedBy : null;
      o.status = 'cancelled';
      o.cancelledAt = now;
      save(orders);
      const fees = loadFees();
      fees.push({ id: 'f' + now.toString(36), login, orderId: o.id, type: 'cancel', amount: CANCEL_FEE, route: routeText(o), dep: o.dep, at: now, paid: true, paidAt: now });
      saveFees(fees);
      const A = auth();
      if (A && A.notify && wasReservedBy) {
        const name = A.nameOf(login);
        A.notify(wasReservedBy, {
          type: 'cancelled', orderId: o.id, by: login, byName: name, route: routeText(o),
          subject: 'Zarezerwowane przez Ciebie zlecenie zostało anulowane',
          body: `Dzień dobry! Zlecający ${name} anulował zlecenie ${routeText(o)} z wyjazdem ${when(o.dep)}, które było przez Ciebie zarezerwowane. Kurs nie dojdzie do skutku — znajdź kolejne zlecenie na giełdzie ANWS.`,
        });
      }
      return true;
    },

    // Usunięcie zlecenia przez administratora — bez opłat i kar; zlecający (i przewoźnik, jeśli zarezerwował) dostaje powiadomienie
    adminRemove(id, admin) {
      const orders = this.list();
      const o = orders.find((x) => x.id === id);
      if (!o || o.status === 'removed') return false;
      o.status = 'removed'; o.removedAt = Date.now(); o.removedBy = admin;
      save(orders);
      const A = auth();
      if (A && A.notify) {
        [o.owner, o.reservedBy].filter(Boolean).forEach((login) => A.notify(login, {
          type: 'removed', orderId: o.id, route: routeText(o),
          subject: 'Zlecenie usunięte przez administratora ANWS',
          body: `Dzień dobry! Administrator ANWS usunął zlecenie ${routeText(o)} z wyjazdem ${when(o.dep)}. Nie naliczyliśmy za to żadnej opłaty. W razie pytań skontaktuj się z nami: +48 884 106 851.`,
        }));
      }
      return true;
    },

    add(d, owner) {
      const orders = this.list();
      const pickups = d.pickups, drops = d.drops;
      const o = {
        id: 'o' + Date.now().toString(36), from: pickups[0], to: drops[0], pickups, drops, end: d.end || null, dep: d.dep, arr: d.arr,
        km: d.km, rate: d.rate, pax: d.pax, urgent: !!d.urgent, notes: d.notes || '',
        owner, createdAt: Date.now(), status: 'open', offers: [],
      };
      orders.push(o);
      save(orders);
      return o;
    },

    // Rezerwacja; fee = null (abonament / pierwszy miesiąc) albo { pct, amount } (prowizja do zapłaty)
    reserve(id, login, fee) {
      const orders = this.list();
      const o = orders.find((x) => x.id === id);
      if (!o || o.status !== 'open' || o.owner === login) return false;
      o.status = 'reserved';
      o.reservedBy = login;
      o.reservedAt = Date.now();
      o.fee = fee ? { pct: fee.pct, amount: fee.amount, paid: false } : null;
      save(orders);
      const A = auth();
      if (A && A.notify) {
        const name = A.nameOf(login);
        A.notify(o.owner, {
          type: 'reserve', orderId: o.id, by: login, byName: name, route: routeText(o),
          subject: 'Twoje zlecenie zostało zarezerwowane',
          body: `Dzień dobry! Przewoźnik ${name} zarezerwował Twoje zlecenie: ${routeText(o)}, wyjazd ${when(o.dep)}, stawka ${o.rate} zł netto. Szczegóły znajdziesz na giełdzie ANWS w zakładce „Twoje zlecenia”.`,
        });
      }
      return true;
    },

    // Propozycja innej stawki dla zlecającego
    negotiate(id, login, rate, message) {
      const orders = this.list();
      const o = orders.find((x) => x.id === id);
      if (!o || o.owner === login) return false;
      o.offers = (o.offers || []).filter((x) => x.by !== login);
      o.offers.push({ by: login, rate, message: message || '', at: Date.now() });
      save(orders);
      const A = auth();
      if (A && A.notify) {
        const name = A.nameOf(login);
        A.notify(o.owner, {
          type: 'offer', orderId: o.id, by: login, byName: name, rate, route: routeText(o),
          subject: 'Nowa propozycja stawki do Twojego zlecenia',
          body: `Dzień dobry! Przewoźnik ${name} proponuje ${rate} zł netto (zamiast ${o.rate} zł netto) za Twoje zlecenie: ${routeText(o)}, wyjazd ${when(o.dep)}.${message ? ' Wiadomość: „' + message + '”.' : ''} Odpowiedz na giełdzie ANWS w zakładce „Twoje zlecenia”.`,
        });
      }
      return true;
    },

    stops,
    crew,
    commission,
    haversine,
    pathKm,
  };
})();
