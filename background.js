// Fetches exchange rates for the content script; ČNB sends no CORS headers, so it can't fetch them itself.
// The Czech National Bank (ČNB) quotes ~30 main currencies daily; the rest (KZT, UAH, ...) come from ExchangeRate-API, also daily.
const CNB_URL = 'https://api.cnb.cz/cnbapi/exrates/daily?lang=EN';
const OTHER_URL = 'https://open.er-api.com/v6/latest/CZK';
const CODE = /^[A-Z]{3}$/; // anything else would break Intl.NumberFormat in the page
const MAX_AGE = 3 * 60 * 60 * 1000; // ČNB publishes the new rate around 14:30 CET on workdays

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg !== 'rates') return;
  getRates().then(sendResponse, e => sendResponse({error: e.message}));
  return true; // keep the channel open for the async reply
});

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

// Rates are kept as quoted: `amount` units of the currency cost `rate` Kč.
async function cnbRates() {
  const rates = {};
  for (const r of (await json(CNB_URL)).rates) {
    if (CODE.test(r.currencyCode) && r.rate > 0 && r.amount > 0) rates[r.currencyCode] = {rate: r.rate, amount: r.amount, validFor: r.validFor, source: 'ČNB'};
  }
  if (!rates.EUR) throw new Error('ČNB API returned no rates');
  return rates;
}

async function otherRates() {
  const d = await json(OTHER_URL);
  const validFor = new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10);
  const rates = {};
  for (const [code, perCzk] of Object.entries(d.rates)) {
    if (CODE.test(code) && code !== 'CZK' && perCzk > 0) rates[code] = {rate: 1, amount: perCzk, validFor, source: 'Rates By Exchange Rate API'}; // attribution required by its terms
  }
  return rates;
}

async function getRates() {
  const {rateCache: cache} = await chrome.storage.local.get('rateCache');
  if (cache && Date.now() - cache.fetchedAt < MAX_AGE) return cache.rates;
  try {
    // the main currencies must not depend on the second API, so its failure keeps the cached other currencies
    const [cnb, other] = await Promise.all([cnbRates(), otherRates().catch(() => null)]);
    const rates = {...(other ?? cache?.rates), ...cnb};
    await chrome.storage.local.set({rateCache: {rates, fetchedAt: Date.now()}});
    return rates;
  } catch (e) {
    if (cache) return cache.rates; // a stale rate beats none when ČNB is down or we're offline
    throw e;
  }
}
