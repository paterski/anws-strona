/* ANWS — weryfikacja firmy przy rejestracji (NIP → rejestry → PKD).
 *
 * 1. Suma kontrolna NIP (lokalnie).
 * 2. Biała lista VAT Ministerstwa Finansów (wl-api.mf.gov.pl) — czy firma istnieje,
 *    nazwa, status VAT, numer KRS. Publiczne API, bez klucza, działa z przeglądarki.
 * 3. Spółki z KRS: odpis aktualny z API KRS (api-krs.ms.gov.pl) — lista kodów PKD.
 * 4. Działalności z CEIDG (brak numeru KRS): CEIDG/GUS nie mają publicznego API dostępnego
 *    z przeglądarki (wymagają klucza i serwera). Gdy powstanie backend, wpisz jego adres
 *    w PKD_ENDPOINT — ma zwracać { pkd: ["49.39.Z", ...] } dla ?nip=...
 *
 * Kody PKD przewozu osób (PKD 2007, w takiej postaci zwraca je dziś KRS).
 * Po przejściu rejestrów na PKD 2025 listę trzeba będzie uzupełnić.
 */
(function () {
  const PKD_ALLOWED = {
    '49.31.Z': 'Transport lądowy pasażerski, miejski i podmiejski',
    '49.32.Z': 'Działalność taksówek osobowych',
    '49.39.Z': 'Pozostały transport lądowy pasażerski, gdzie indziej niesklasyfikowany',
  };
  const PKD_ENDPOINT = ''; // np. 'https://api.anws.pl/pkd' — serwer dla firm z CEIDG

  const cache = new Map();

  function nipValid(raw) {
    const nip = String(raw || '').replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(nip)) return false;
    const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    const sum = w.reduce((s, x, i) => s + x * +nip[i], 0);
    return sum % 11 === +nip[9];
  }

  const clean = (raw) => String(raw || '').replace(/[\s-]/g, '');

  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function pkdFromKrs(krs) {
    const j = await getJSON(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=P&format=json`);
    const p = j && j.odpis && j.odpis.dane && j.odpis.dane.dzial3 && j.odpis.dane.dzial3.przedmiotDzialalnosci;
    if (!p) return [];
    return [...(p.przedmiotPrzewazajacejDzialalnosci || []), ...(p.przedmiotPozostalejDzialalnosci || [])]
      .map((x) => ({ code: `${x.kodDzial}.${x.kodKlasa}.${x.kodPodklasa}`, desc: x.opis }));
  }

  async function pkdFromBackend(nip) {
    if (!PKD_ENDPOINT) return null;
    const j = await getJSON(`${PKD_ENDPOINT}?nip=${nip}`);
    return j && Array.isArray(j.pkd) ? j.pkd.map((code) => ({ code, desc: PKD_ALLOWED[code] || '' })) : null;
  }

  /* Zwraca { ok, reason?, company?, pkd?, matched? }
   * reason: 'checksum' | 'notfound' | 'inactive' | 'nopkd' | 'ceidg' | 'network'
   * requirePkd: czy firma musi mieć PKD przewozu osób (przewoźnik). */
  async function check(rawNip, { requirePkd = true } = {}) {
    const nip = clean(rawNip);
    if (!nipValid(nip)) return { ok: false, reason: 'checksum' };
    const key = nip + '|' + requirePkd;
    if (cache.has(key)) return cache.get(key);

    let result;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const mf = await getJSON(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`);
      const s = mf && mf.result && mf.result.subject;
      if (!s) {
        result = { ok: false, reason: 'notfound' };
      } else {
        const company = { name: s.name, nip, regon: s.regon || '', krs: s.krs || '', vat: s.statusVat || '' };
        if (s.removalDate || !/^(Czynny|Zwolniony)$/.test(company.vat)) {
          result = { ok: false, reason: 'inactive', company };
        } else if (!requirePkd) {
          result = { ok: true, company, pkd: [], matched: [] };
        } else {
          const pkd = company.krs ? await pkdFromKrs(company.krs) : await pkdFromBackend(nip);
          if (pkd === null) {
            result = { ok: false, reason: 'ceidg', company };
          } else {
            const matched = pkd.filter((p) => PKD_ALLOWED[p.code]);
            result = matched.length ? { ok: true, company, pkd, matched } : { ok: false, reason: 'nopkd', company, pkd };
          }
        }
      }
    } catch (e) {
      return { ok: false, reason: 'network' }; // nie zapisujemy w pamięci — można spróbować ponownie
    }
    cache.set(key, result);
    return result;
  }

  window.ANWSVerify = { check, nipValid, clean, PKD_ALLOWED };
})();
