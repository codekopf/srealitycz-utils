# Sreality Price Converter

Chrome extension that shows prices on [sreality.cz](https://www.sreality.cz/) in **EUR** or **USD** instead of CZK,
using the daily exchange rate of the Czech National Bank (ČNB).

It works on search results and on listing detail pages
(e.g. https://www.sreality.cz/detail/prodej/dum/rodinny/praha-chodov-medkova/2503409740).

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `sreality-price-converter` folder.
4. Reload any open sreality.cz tabs.

After changing the code, click the reload icon on the extension's card in `chrome://extensions` and reload the sreality.cz tab.

## Use

Every sreality.cz page gets a small **CZK | EUR | USD** switcher in the bottom-left corner.

- Click **EUR** or **USD** to convert every price on the page, for example `21 900 000 Kč` → `€899,384`.
  This works on search results, detail pages, rents (`Kč/měsíc`) and prices per m².
- Click **CZK** to show the original prices again.
- Hover a converted price to see the original CZK amount.
- Hover the switcher to see the rate used and its date, for example `ČNB rate of 2026-11-02: 1 EUR = 24.35 Kč`.

The choice is remembered and applies to all sreality.cz tabs. The default is EUR.

## How it works

- `background.js` fetches the rates from `https://api.cnb.cz/cnbapi/exrates/daily` and caches them for 3 hours.
  ČNB publishes a new rate around 14:30 CET on working days. If ČNB can't be reached, the last cached rate is used.
  If no rate was ever fetched, EUR and USD are greyed out.
- `content.js` replaces every `… Kč` amount in the page text and keeps watching the page,
  so results loaded later (scrolling, filters, paging) are converted too.
- Abbreviated amounts such as `30 tis. Kč` are left in CZK.

## Test

Serve this folder and open `test.html`. Its title shows `PASS` or `FAIL`:

```bash
python3 -m http.server 8000 --directory sreality-price-converter
```

Then open http://localhost:8000/test.html.
