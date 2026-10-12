/* ANWS — zlecenia na giełdzie (prototyp po stronie przeglądarki).
 *
 * Zlecenia, rezerwacje i propozycje stawek zapisują się w localStorage tej przeglądarki.
 * Docelowo każdą funkcję zastępuje zapytanie do API. Przy pierwszym otwarciu dodajemy
 * zlecenia testowe w najbliższych dniach (terminy liczone od „teraz”), żeby giełda nie była pusta.
 *
 * Zlecenie może mieć kilka miejsc odbioru (pickups) i kilka miejsc docelowych (drops);
 * from = pierwsze miejsce odbioru, to = pierwsze miejsce docelowe (to pokazujemy na mapie).
 */
(function () {
  const KEY = 'anws-orders';
  const SEED_FLAG = 'anws-orders-seeded-v2';

  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const load = () => safe(() => JSON.parse(localStorage.getItem(KEY)) || [], []);
  const save = (v) => safe(() => localStorage.setItem(KEY, JSON.stringify(v)));
  const auth = () => window.ANWSAuth;

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

  const stops = (o) => ({ pickups: o.pickups && o.pickups.length ? o.pickups : [o.from], drops: o.drops && o.drops.length ? o.drops : [o.to] });
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
    if (demoOrder) demoOrder.offers.push({ by: 'polbus', rate: demoOrder.rate + 100, message: 'Możemy podstawić autokar 49-osobowy.', at: now - 40 * 6e4 });
    save(orders);
    safe(() => localStorage.setItem(SEED_FLAG, '1'));
    const A = auth();
    if (A && A.notify && demoOrder) {
      A.notify('demo', { type: 'offer', orderId: 'o4', by: 'polbus', byName: A.nameOf('polbus'), rate: demoOrder.rate + 100, route: routeText(demoOrder), at: now - 40 * 6e4, seed: true });
    }
  }

  window.ANWSOrders = {
    list() { ensureSeed(); return load(); },
    get(id) { return this.list().find((o) => o.id === id) || null; },

    // zlecenia, które jeszcze się nie zakończyły
    active() { const now = Date.now(); return this.list().filter((o) => o.arr > now); },

    counts(login) {
      const a = this.active();
      const open = a.filter((o) => o.status === 'open');
      return { all: open.length, urgent: open.filter((o) => o.urgent).length, mine: login ? a.filter((o) => o.owner === login).length : 0 };
    },

    add(d, owner) {
      const orders = this.list();
      const pickups = d.pickups, drops = d.drops;
      const o = {
        id: 'o' + Date.now().toString(36), from: pickups[0], to: drops[0], pickups, drops, dep: d.dep, arr: d.arr,
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
          body: `Dzień dobry! Przewoźnik ${name} zarezerwował Twoje zlecenie: ${routeText(o)}, wyjazd ${when(o.dep)}, stawka ${o.rate} zł. Szczegóły znajdziesz na giełdzie ANWS w zakładce „Twoje zlecenia”.`,
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
          body: `Dzień dobry! Przewoźnik ${name} proponuje ${rate} zł (zamiast ${o.rate} zł) za Twoje zlecenie: ${routeText(o)}, wyjazd ${when(o.dep)}.${message ? ' Wiadomość: „' + message + '”.' : ''} Odpowiedz na giełdzie ANWS w zakładce „Twoje zlecenia”.`,
        });
      }
      return true;
    },

    stops,
    commission,
    haversine,
    pathKm,
  };
})();
