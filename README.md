# Sreality utility Google Chrome extension

Chrome extension for [sreality.cz](https://www.sreality.cz/) that:

- shows prices in **EUR**, **USD** or about 160 other currencies at the daily exchange rate, instead of CZK,
- shows areas in **ft²** instead of m²,
- adds the price per m² (or ft²) to every listing title in search results,
- sorts the listings on the page by price per m², which sreality offers only to premium accounts,
- shows **50, 100, 250 or 500 listings per page** instead of sreality's 20, with a page picker that follows the page size.

Prices and areas are converted on search results and on listing detail pages
(e.g. https://www.sreality.cz/detail/prodej/dum/rodinny/praha-chodov-medkova/2503409740).

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `srealitycz-utils` folder.
4. Reload any open sreality.cz tabs.

After changing the code, click the reload icon on the extension's card in `chrome://extensions` and reload the sreality.cz tab.

## Use

Every sreality.cz page gets bubbles in the bottom-left corner: currency and unit everywhere, plus listings on search results.

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

**Listings bubble: listings per page | page | ⇅ sort** (search results only)

- Pick **50 / page**, **100 / page**, **250 / page** or **500 / page** to see that many listings at once.
  The listings reload, starting from page 1.
- Pick **Sreality default** to get sreality's own pages back (20 listings and 2 tips per page).
- Pick a page in **Page 3 / 8** to go to it. The number of pages follows the page size:
  2,000 listings make 100 pages with sreality's default and 8 pages with 250 per page.
  Page 3 with 250 per page shows listings 501–750.
- The page number is in the URL (`?strana=3`), so reloading and the back button keep it.
- Filters and sorting work as usual, and the listings follow them.
- Like sreality, it stops at 10,000 listings, for example after 40 pages of 250.
- If the listings can't be loaded, sreality's own listings stay. Hover the bubble to see why.

**Price per m² in search results**

Each listing title in search results ends with its price per m² (or ft²) in the chosen currency,
for example `Prodej bytu 3+kk 68 m² - €4,524/m²`. Listings without a price show no price per m².

**Sort by price per m²: ⇅ m²**

Sreality's own sorting by price per m² needs a premium account. The **⇅** button at the end of the listings bubble
sorts the listings shown on the page (not the whole search) by price per m², whatever currency and unit are shown:

- **⇅ m²**: sreality's order.
- Click once for **⇅ asc m²**: cheapest per m² first.
- Click again for **⇅ desc m²**: most expensive per m² first.
- Click again for sreality's order.

The button shows ft² instead of m² when areas are in ft². Listings without a price or area go last.
The sort stays on when other listings load (next page, another filter or sreality's own sort).
With 500 listings per page, it sorts those 500.

Hover any converted price or area to see the original text.
Your choices are remembered and apply to all sreality.cz tabs. The defaults are EUR, m², and sreality's own pages and order.

## How listings per page work

Sreality's page URLs have no page-size parameter: its code always asks its API for 22 results (20 listings and 2 tips).
The API itself, `https://www.sreality.cz/api/v1/estates/search`, accepts any `limit` and `offset` up to `offset + limit = 10000`.
When a page size is chosen, the extension:

1. Asks sreality's server for the current page's data (`/_next/data/<build>/cs/<path>.json?<query>`).
   This holds the search filters the server parsed from the page URL.
2. Calls the API with those filters, renamed to the API's names, plus `limit` and `offset = (page − 1) × limit`.
3. Hides sreality's list and page links and shows the results as copies of a sreality listing card.

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
- Listings per page relies on sreality's internal API and page data, which may change with any sreality release.
- With a page size chosen:
  - every page change reloads the page, and sreality's own listings show briefly before the new ones;
  - the cards have one photo and no save (heart) button or badges such as `TIP`;
  - sreality's tips (promoted listings) are not shown;
  - price texts are in Czech (`Kč/měsíc`, `Cena na vyžádání`) also on the English site;
  - a card's link goes through one sreality redirect to the listing.

## Test

Serve this folder and open `test.html`. Its title shows `PASS` or `FAIL`. The test fakes `chrome.*` and sreality's server and API:

```bash
python3 -m http.server 8000 --directory srealitycz-utils
```

Then open http://localhost:8000/test.html.
