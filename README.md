# Confetti Party Rentals: demo store

A static, multi-page party rental demo (49 pages). No server code and no framework.

## Run it

- Quickest: open `dist/index.html` in Chrome or Edge.
- Best (behaves like a real site): from this folder run `npm start`
  (or `cd dist && python3 -m http.server 8080`) and open http://localhost:8080.

Fonts load from Google Fonts, so the page needs internet for the right typefaces.
The cart, chosen date and orders are saved in the browser's localStorage.

## Change content

All products, prices, packages, towns, reviews and FAQs live in `data/store.json`.
Styles are in `assets/css`, behaviour in `assets/js/app.js`.

After editing, rebuild:

    npm install
    npm run build

This regenerates every page in `dist/`. Photos are from Unsplash (credits in `assets/img/credits-*.json`
and on the About page).
