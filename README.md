# Sreality utility Google Chrome extension

Chrome extension for [sreality.cz](https://www.sreality.cz/) that shows prices in **EUR**, **USD** or about 160 other currencies
at the daily exchange rate, instead of CZK, and areas in **ft²** instead of m².

It works on search results and on listing detail pages
(e.g. https://www.sreality.cz/detail/prodej/dum/rodinny/praha-chodov-medkova/2503409740).

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `srealitycz-utils` folder.
4. Reload any open sreality.cz tabs.

After changing the code, click the reload icon on the extension's card in `chrome://extensions` and reload the sreality.cz tab.

## Use

Every sreality.cz page gets two bubbles in the bottom-left corner.

**Currency bubble: CZK | EUR | USD | +**

- Click a currency to convert every price on the page, for example `21 900 000 Kč` → `€899,384`.
  This works on search results, detail pages, rents (`Kč/měsíc`) and prices per m².
- Click **CZK** (always first) to show the original prices again.
- Click **+** to manage your favorite currencies:
  - **Add** lists every available currency (about 160, e.g. `KZT – Kazakhstani Tenge`, `UAH – Ukrainian Hryvnia`).
    Picking one adds it to the bubble and switches to it.
  - **Remove** lists your favorites. Picking one removes it from the bubble.
- Hover the bubble to see the rate in use and where it comes from, for example `ČNB, 2026-11-02: 1 EUR = 24.35 Kč`.

**Unit bubble: m² | ft²**

- Click **ft²** to show every area in square feet, for example `180 m²` → `1,938 ft²`.
  Prices per m² become prices per ft² (`125 000 Kč/m²` → `€477/ft²`).
- Click **m²** to show the original areas again.

**Price per m² in search results**

Each listing title in search results ends with its price per m² (or ft²) in the chosen currency,
for example `Prodej bytu 3+kk 68 m² - €4,524/m²`. Listings without a price show no price per m².

**Sort: Od nejlevnější za m²/ft² (local)**

Sreality's own `Od nejlevnější za m²` needs a premium account. The extension adds **Od nejlevnější za m²/ft² (local)**
to the **Řadit** menu of search results. It sorts the listings already on the page (not the whole search) by price per m²,
cheapest first, whatever currency and unit are shown. Listings without a price or area go last.
The order resets when sreality loads other listings (next page, another filter or sort).

Hover any converted price or area to see the original text.
Your choices are remembered and apply to all sreality.cz tabs. The defaults are EUR and m².

## Exchange rates

All rates are daily:

- EUR, USD, GBP, CHF, PLN, HUF and the other ~30 main currencies use the official rate of the Czech National Bank (ČNB),
  published around 14:30 CET on working days.
- All other currencies (KZT, UAH, ...) use [Rates By Exchange Rate API](https://www.exchangerate-api.com)
  (free `open.er-api.com` endpoint, updated once a day around 00:00 UTC). ČNB publishes these only once a month.

`background.js` fetches both and caches them for 3 hours.
If ČNB can't be reached, the last cached rates are used. If ExchangeRate-API can't be reached,
the last cached rates of the other currencies are kept. If no rate was ever fetched, only CZK is available.

## Limitations

- Abbreviated amounts such as `30 tis. Kč` stay in CZK.
- Energy figures such as `kWh/m²` are not converted to ft².
- The local sort only reorders the listings visually; the Tab key and screen readers still follow sreality's order.

## Test

Serve this folder and open `test.html`. Its title shows `PASS` or `FAIL`:

```bash
python3 -m http.server 8000 --directory srealitycz-utils
```

Then open http://localhost:8000/test.html.
