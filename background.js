// Fetches the Czech National Bank (ČNB) daily rates for the content script; ČNB sends no CORS headers, so it can't fetch them itself.
const CNB_URL = 'https://api.cnb.cz/cnbapi/exrates/daily?lang=EN';
const MAX_AGE = 3 * 60 * 60 * 1000; // ČNB publishes the new rate around 14:30 CET on workdays

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg !== 'rates') return;
  getRates().then(sendResponse, e => sendResponse({error: e.message}));
  return true; // keep the channel open for the async reply
});

async function getRates() {
  const {rates} = await chrome.storage.local.get('rates');
  if (rates && Date.now() - rates.fetchedAt < MAX_AGE) return rates;
  try {
    const res = await fetch(CNB_URL);
    if (!res.ok) throw new Error(`ČNB API returned ${res.status}`);
    const list = (await res.json()).rates;
    const czkPer = code => {
      const r = list.find(r => r.currencyCode === code);
      const rate = r?.rate / r?.amount;
      if (!(rate > 0)) throw new Error(`ČNB API has no ${code} rate`);
      return rate;
    };
    const fresh = {EUR: czkPer('EUR'), USD: czkPer('USD'), validFor: list[0].validFor, fetchedAt: Date.now()};
    await chrome.storage.local.set({rates: fresh});
    return fresh;
  } catch (e) {
    if (rates) return rates; // a stale rate beats none when ČNB is down or we're offline
    throw e;
  }
}
