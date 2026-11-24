# Sreality utility Google Chrome extension

Chrome extension for [sreality.cz](https://www.sreality.cz/) that:

- shows prices in **EUR**, **USD** or about 160 other currencies at the daily exchange rate, instead of CZK,
- shows areas in **ft²** instead of m²,
- adds the price per m² (or ft²) to every listing title in search results and to the title of a listing's detail page,
- sorts the listings on the page by price, by price per m² (which sreality offers only to premium accounts) or by size,
- shows **50, 100, 250, 500, 750, 1000, 2000, 2500 or 5000 listings per page** instead of sreality's 20, with a page picker that follows the page size,
- hides sreality's advertisements (tips) among the listings,
- has a **mortgage calculator** with the monthly payment, a chart of the principal and interest paid each year, and the list of all payments.

Prices and areas are converted on search results and on listing detail pages
(e.g. https://www.sreality.cz/detail/prodej/dum/rodinny/praha-chodov-medkova/2503409740).

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `srealitycz-utils` folder.
4. Reload any open sreality.cz tabs.

After changing the code, click the reload icon on the extension's card in `chrome://extensions` and reload the sreality.cz tab.

## Use

Every sreality.cz page gets bubbles in the bottom-left corner: currency and unit everywhere, plus listings and advertisements on search results.
The **⌂ mortgage** button in the bottom-right corner opens the mortgage calculator.

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

**Listings bubble: listings per page | page | ⇅ € | ⇅ €/m² | ⇅ size** (search results only)

- Pick **50 / page**, **100 / page**, **250 / page**, **500 / page**, **750 / page**, **1000 / page**, **2000 / page**, **2500 / page**
  or **5000 / page** to see that many listings at once.
  The listings reload, starting from page 1.
- Pick **Sreality default** to get sreality's own pages back (20 listings and 2 tips per page).
- Pick a page in **Page 3 / 8** to go to it. The number of pages follows the page size:
  2,000 listings make 100 pages with sreality's default and 8 pages with 250 per page.
  Page 3 with 250 per page shows listings 501–750.
- The page number is in the URL (`?strana=3`), so reloading and the back button keep it.
- Filters and sorting work as usual, and the listings follow them.
- Like sreality, it stops at 10,000 listings, for example after 40 pages of 250 or 2 pages of 5000.
- If the listings can't be loaded, sreality's own listings stay. Hover the bubble to see why.

**Price per m² in search results and on detail pages**

Each listing title in search results ends with its price per m² (or ft²) in the chosen currency,
for example `Prodej bytu 3+kk 68 m² - €4,524/m²`. Listings without a price show no price per m².
The title of a listing's detail page gets the same, for example
`Prodej rodinného domu 180 m², pozemek 444 m² - €4,422/m²`. The price per m² uses the first area in the title.

**Sort by price per m²: ⇅ €/m²**

Sreality's own sorting by price per m² needs a premium account. The **⇅ €/m²** button in the listings bubble
sorts the listings shown on the page (not the whole search) by price per m², whatever currency and unit are shown:

- **⇅ €/m²**: sreality's order.
- Click once for **⇅ asc €/m²**: cheapest per m² first.
- Click again for **⇅ desc €/m²**: most expensive per m² first.
- Click again for sreality's order.

The button shows the chosen currency and unit, for example **⇅ Kč/m²** or **⇅ $/ft²**. Listings without a price or area go last.
The sort stays on when other listings load (next page, another filter or sreality's own sort).
With 500 listings per page, it sorts those 500.

**Sort by price: ⇅ €**

The **⇅ €** button, before **⇅ €/m²**, sorts the listings shown on the page by their whole price:
**⇅ asc €** is cheapest first, **⇅ desc €** is most expensive first, and a third click gives sreality's order back.
A listing priced per m² (land, for example `1 500 Kč/m²`) counts as its price per m² times its area. Rents count per month.
Listings without a price go last. Like **⇅ €/m²**, the button shows the chosen currency.

**Sort by size: ⇅ size**

The **⇅ size** button at the end of the listings bubble sorts the listings shown on the page by the area in their title:
**⇅ asc size** is smallest first, **⇅ desc size** is largest first, and a third click gives sreality's order back.
Listings without an area go last. Only one of the three sorts is on at a time: turning one on turns the others off.

**Advertisements bubble: adv ✕** (search results only)

Sreality puts tips (for example a broker's `TIP: … Koupím byt v Praze`) and native ads marked `Reklama` among its listings.
They are hidden by default.
Click **adv ✕** to show them (**adv ✓**), and again to hide them.

**Mortgage calculator: ⌂ mortgage** (every page)

Click **⌂ mortgage** in the bottom-right corner to open a small calculator above it.
Click it again, click anywhere else on the page or press Esc to close it. Its numbers stay until the page is reloaded.

- **Price from area × price per m²** (on by default): type the **Area** and the **Price per m²**, and the **Price** is computed.
  Untick it to type the **Price** yourself.
- **Loan**: set to 80 % of the price whenever the price changes, as sreality's own calculator assumes. Type another amount to change it.
- **Interest**: the yearly interest rate in %, 4.5 by default.
- **Term**: years to repay, 30 by default (up to 50).

On a listing's detail page, the calculator opens filled in with the listing's area, price per m² and price.
Amounts are in the chosen currency and areas in the chosen unit. Switching either converts the numbers already filled in.

The result shows:

- the monthly payment (equal payments every month), the number of payments, the loan as a share of the price,
  the total interest and the total paid;
- a chart with a bar for each year: the principal (blue) and the interest (orange) paid that year.
  Hover a bar to see the year's principal, interest and the balance left after it;
- **All payments**: a list of every monthly payment with its interest, principal and the balance left after it.

Hover any converted price or area to see the original text. Hover any button or picker in the bubbles to see what it does.
Your choices in the bubbles are remembered and apply to all sreality.cz tabs. The defaults are EUR, m², sreality's own pages and order, and no advertisements.

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
- Pages of 2000 to 5000 listings take longer to load and show than sreality's own pages.
- On a rental's detail page the mortgage calculator starts from the monthly rent as the price.
- The mortgage calculator assumes a fixed rate and equal monthly payments over the whole term, without fees or insurance.
- Listings per page relies on sreality's internal API and page data, which may change with any sreality release.
- With a page size chosen:
  - every page change reloads the page, and sreality's own listings show briefly before the new ones;
  - the cards browse their photos with the extension's own ‹ › arrows and have no save (heart) button or badges such as `TIP`;
  - sreality's tips (promoted listings) are not shown;
  - price texts are in Czech (`Kč/měsíc`, `Cena na vyžádání`) also on the English site;
  - a card's link goes through one sreality redirect to the listing.

## Images

- `images/icon.svg` is the extension icon, rendered to `images/icon-16.png` … `icon-128.png`.
  The 128 px icon has the 16 px transparent padding the Chrome Web Store asks for.
- `images/social-preview.html` is the GitHub social preview, rendered to `images/social-preview.png` (1280×640).
  To use it, upload it in the repository's **Settings → General → Social preview**.

After changing either source, render the PNGs again with Google Chrome:

```bash
images/render.sh
```

## Test

Serve this folder and open `test.html`. Its title shows `PASS` or `FAIL`. The test fakes `chrome.*` and sreality's server and API:

```bash
python3 -m http.server 8000 --directory srealitycz-utils
```

Then open http://localhost:8000/test.html.
