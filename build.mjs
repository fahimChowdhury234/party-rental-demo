// Static site generator for the Confetti Party Rentals demo.
// Reads data/store.json, writes plain HTML pages to dist/ so every product,
// price and policy is in the HTML; assets/js/app.js only adds behaviour.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const PUBLISH = join(ROOT, 'publish');
const data = JSON.parse(readFileSync(join(ROOT, 'data/store.json'), 'utf8'));
const { store, categories, products, packages, addons, zones, reviews, faqs, steps, safety, events, seasons, vendors, cityNotes } = data;

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []);
const credits = [
  ...readJSON(join(ROOT, 'assets/img/credits-products.json')),
  ...readJSON(join(ROOT, 'assets/img/credits-lifestyle.json')),
];
const creditFor = (file) => credits.find((c) => c.file === file);

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => '$' + Number(n).toLocaleString('en-US');
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const byId = (id) => products.find((p) => p.id === id);
const catById = (id) => categories.find((c) => c.id === id);
const productUrl = (p) => `product-${p.id}.html`;
const catUrl = (c) => `rentals-${c.id}.html`;
const cityUrl = (z) => `delivery-${slug(z.city)}.html`;
const DURATIONS = { h4: '4 hours', h8: '8 hours', overnight: 'Overnight', d2: '2 days' };
const UNIT_LABEL = { day: '/ day', each: 'each', set: '/ set' };
const isLadder = (p) => Boolean(p.prices);
const basePrice = (p) => (isLadder(p) ? p.prices.h4 : p.price);
const unitPrice = (p, d) => (isLadder(p) ? p.prices[d || 'h4'] : p.price);
const deliveryFee = (miles) => (miles <= store.freeMiles ? 0 : (miles - store.freeMiles) * store.perMile);
const depositFor = (total) => Math.min(total, Math.max(store.deposit.min, Math.round(total * store.deposit.pct)));
const ft = (n) => (Number.isInteger(n) ? `${n}` : `${n}`);

let ICONS = {};
function loadIcons(names) {
  for (const n of names) {
    const raw = readFileSync(join(ROOT, `node_modules/lucide-static/icons/${n}.svg`), 'utf8');
    const inner = raw.replace(/<!--[\s\S]*?-->/, '').replace(/^[\s\S]*?<svg[\s\S]*?>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '');
    ICONS[n] = inner;
  }
}
loadIcons(['phone', 'shopping-bag', 'calendar-days', 'map-pin', 'check', 'star', 'shield-check', 'sparkles', 'truck', 'clock', 'chevron-down', 'chevron-left', 'chevron-right', 'x', 'menu', 'plus', 'minus', 'trash-2', 'message-circle', 'mail', 'users', 'ruler', 'plug', 'droplets', 'sun', 'cloud-rain', 'tent', 'cake', 'school', 'briefcase', 'heart', 'sliders-horizontal', 'layout-grid', 'list', 'info', 'arrow-right', 'search', 'zap', 'party-popper', 'badge-check', 'calendar-check', 'gift', 'copy', 'circle-check-big', 'circle-x', 'route', 'package', 'pen-line', 'lock', 'house', 'eye', 'umbrella']);
const sprite = () => `<svg class="sprite" aria-hidden="true" focusable="false"><defs>${Object.entries(ICONS).map(([n, inner]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${inner}</symbol>`).join('')}</defs></svg>`;
const icon = (n, cls = '') => {
  if (!ICONS[n]) throw new Error('Unknown icon ' + n);
  return `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${n}"></use></svg>`;
};
const stars = (n, cls = '') => `<span class="stars${cls ? ' ' + cls : ''}" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= Math.round(n) ? 'icon--fill' : 'icon--empty')).join('')}</span>`;

// Responsive image. kind: 'card' (4:3, 600/1200), 'hero' (16:10, 1000/2000), 'portrait' (3:4, 450/900)
function img(name, { alt = '', kind = 'card', eager = false, sizes, cls = '' } = {}) {
  const c = creditFor(name);
  const altText = alt || c?.alt || '';
  const spec = {
    card: { s: 600, l: 1200, w: 1200, h: 900, sizes: '(min-width: 1100px) 300px, (min-width: 700px) 45vw, 92vw' },
    hero: { s: 1000, l: 2000, w: 2000, h: 1250, sizes: '(min-width: 1100px) 600px, 92vw' },
    portrait: { s: 450, l: 900, w: 900, h: 1200, sizes: '(min-width: 1100px) 280px, 45vw' },
  }[kind];
  return `<img class="${cls}" src="assets/img/${name}-${spec.s}.webp" srcset="assets/img/${name}-${spec.s}.webp ${spec.s}w, assets/img/${name}-${spec.l}.webp ${spec.l}w" sizes="${sizes || spec.sizes}" width="${spec.w}" height="${spec.h}" alt="${esc(altText)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
}

// ---------- copy that depends on the product kind ----------
function specRows(p) {
  const rows = [];
  if (p.kind === 'inflatable') {
    rows.push(['Actual size', `${p.size[0]} × ${p.size[1]} × ${p.size[2]} ft (L × W × H)`]);
    rows.push(['Setup area', `${p.setup[0]} × ${p.setup[1]} ft, flat grass preferred`]);
    rows.push(['Power', p.outlets === 1 ? '1 standard outlet within 50 ft' : `${p.outlets} outlets on separate circuits, within 50 ft`]);
    if (p.wet) rows.push(['Water', 'Garden hose within 50 ft']);
    rows.push(['Ages', p.ages]);
    rows.push(['Max riders', p.riders === 1 ? '1 on the slide at a time' : p.category === 'water-slides' ? `${p.riders} at a time, 1 per lane` : p.id === 'rocket-climb-tower' ? `${p.riders} climbers at a time` : `${p.riders} at once`]);
    rows.push(['Attendants', '1 adult watching at all times']);
  } else if (p.kind === 'tent') {
    rows.push(['Size', `${p.size[0]} × ${p.size[1]} ft, ${p.size[2]} ft at the peak`]);
    rows.push(['Setup area', `${p.setup[0]} × ${p.setup[1]} ft`]);
    rows.push(['Seating', p.seats]);
    rows.push(['Anchoring', 'Stakes in grass, water barrels on hard surfaces']);
    rows.push(['Setup time', p.size[0] >= 20 ? 'About 1 hour' : 'About 15 minutes']);
  } else if (p.kind === 'table') {
    if (p.id === 'farmhouse-table-8ft') rows.push(['Size', '8 ft × 40 in, 30 in tall']);
    if (p.id === 'round-table-60in') rows.push(['Size', '60 in across, 30 in tall']);
    if (p.id === 'kids-table-and-chair-set') rows.push(['Size', '4 × 2 ft table, 22 in tall, with 6 chairs']);
    if (p.id === 'white-folding-chair') rows.push(['Size', 'Seat 17 in high, folds flat']);
    rows.push(['Seats', p.seats]);
    rows.push(['Material', p.id === 'white-folding-chair' ? 'White resin frame, padded seat' : p.id === 'farmhouse-table-8ft' ? 'Solid pine, hand-finished' : 'Plastic top, powder-coated steel legs']);
    rows.push(['Priced', p.unit === 'set' ? 'Per set, per day' : 'Each, per day']);
  } else if (p.kind === 'concession') {
    rows.push(['Output', p.output]);
    rows.push(['Supplies', p.supplies]);
    rows.push(['Power', '1 standard outlet within 25 ft']);
    rows.push(['Footprint', p.id === 'popcorn-machine' ? 'Rolling cart, 2 × 2 ft' : 'Tabletop, about 2 × 2 ft']);
  } else if (p.kind === 'game') {
    rows.push(['Size', `${p.size[0]} × ${p.size[1]} ft, ${p.size[2]} ft tall`]);
    rows.push(['Players', p.players]);
    rows.push(['Best for', p.bestFor]);
    rows.push(['Pickup', 'Fits in a car; warehouse pickup is free']);
  }
  return rows;
}

function detailSections(p) {
  const s = [];
  if (p.kind === 'inflatable') {
    s.push(['What\'s included', ['The inflatable and a commercial blower', 'Stakes, plus a ground tarp under the unit', 'A 50 ft outdoor extension cord', 'Delivery, setup, a safety walkthrough and pickup', 'Cleaning and sanitizing before it arrives']]);
    s.push(['What you\'ll need', [`A flat ${p.setup[0]} × ${p.setup[1]} ft area, clear of rocks, sprinkler heads and dog waste`, p.outlets === 1 ? '1 standard outlet within 50 ft, on its own circuit' : `${p.outlets} outlets on separate circuits, within 50 ft`, ...(p.wet ? ['A garden hose within 50 ft'] : []), 'A gate or path at least 4 ft wide', 'An adult watching riders the whole time']]);
    s.push(['Safety rules', ['No shoes, glasses, sharp objects or face paint', 'Riders of similar size together', ...(p.wet ? ['Slide feet first, one rider per lane'] : ['No flips, wrestling or climbing the walls']), 'Everyone out if wind goes over 15 mph or lightning is near', 'Unplug only after all riders are out']]);
  } else if (p.kind === 'tent') {
    s.push(['What\'s included', ['Tent top, frame and side poles', 'Stakes or water barrels', 'Setup and takedown by our crew']]);
    s.push(['What you\'ll need', [`A clear, level ${p.setup[0]} × ${p.setup[1]} ft area`, 'Buried lines marked before staking. We book the free utility locate for you', 'A path at least 6 ft wide for our cart']]);
  } else if (p.kind === 'table') {
    s.push(['What\'s included', ['Delivery and pickup', 'Wiped down and inspected', p.id === 'white-folding-chair' ? 'Delivered in stacks of 10' : 'Delivered folded, set up on request']]);
    s.push(['What you\'ll need', ['A dry, covered spot to stack items before pickup']]);
  } else if (p.kind === 'concession') {
    s.push(['What\'s included', ['The machine, cleaned and tested', p.supplies, 'A one-page guide taped to the machine']]);
    s.push(['What you\'ll need', ['1 standard outlet within 25 ft', p.id === 'popcorn-machine' ? 'A flat spot for the cart' : 'A sturdy table to set it on', ...(p.id === 'snow-cone-machine' ? ['Bagged ice, about 10 lb per 50 cones'] : [])]]);
  } else if (p.kind === 'game') {
    s.push(['What\'s included', ['All game pieces and a carry bag or crate', 'A rules card']]);
    s.push(['What you\'ll need', ['Flat lawn or patio space']]);
  }
  s.push(['Delivery and setup', [`Delivery between ${store.deliveryWindow} for daytime events, with a text 30 minutes ahead`, `Pickup by ${store.pickupBy} the same day, or the next morning for overnight rentals`, `Free within ${store.freeMiles} miles of Springfield; $${store.perMile} per mile after that, up to ${store.maxMiles} miles`]]);
  if (p.kind !== 'game') s.push(['Rain policy', ['If rain or wind over 15 mph is forecast, cancel up to 2 hours before delivery for a full refund or credit', 'Move your date once at no charge']]);
  s.push(['Cleaning', [p.kind === 'inflatable' ? 'Swept, washed and sanitized after every rental, then dried fully' : 'Cleaned and inspected after every rental']]);
  return s;
}

const cardSpec = (p) => {
  if (p.kind === 'inflatable') return `${p.size[0]} × ${p.size[1]} ft · Ages ${p.ages}`;
  if (p.kind === 'tent') return `${p.size[0]} × ${p.size[1]} ft · ${p.seats.split(',')[0]}`;
  if (p.kind === 'table') return p.seats.charAt(0).toUpperCase() + p.seats.slice(1);
  if (p.kind === 'concession') return '50 servings included';
  return `${p.players} · ${p.bestFor}`;
};

const priceHtml = (p) =>
  isLadder(p)
    ? `<span class="price__from">from</span> <strong>${money(p.prices.h4)}</strong> <span class="price__unit">/ 4 hrs</span>`
    : `<strong>${money(p.price)}</strong> <span class="price__unit">${UNIT_LABEL[p.unit]}</span>`;

// ---------- components ----------
function productCard(p, { headingLevel = 3, showCat = true } = {}) {
  const c = catById(p.category);
  const h = `h${headingLevel}`;
  return `<article class="pcard" data-product-card data-id="${p.id}" data-category="${p.category}" data-price="${basePrice(p)}" data-age="${p.ageGroup || ''}" data-wet="${p.kind === 'inflatable' ? (p.wet ? 'wet' : 'dry') : ''}" data-popular="${p.popular}" data-new="${p.isNew ? 1 : 0}" data-name="${esc(p.name)}">
  <div class="pcard__media">
    ${img(p.image, { alt: p.name })}
    ${p.badge ? `<span class="ribbon${p.badge === 'New' ? ' ribbon--new' : ''}">${esc(p.badge)}</span>` : ''}
    <span class="avail" data-avail hidden></span>
  </div>
  <div class="pcard__body">
    ${showCat ? `<p class="pcard__cat">${esc(c.name)}</p>` : ''}
    <${h} class="pcard__title"><a href="${productUrl(p)}">${esc(p.name)}</a></${h}>
    <p class="pcard__spec">${esc(cardSpec(p))}</p>
    <p class="pcard__rating">${icon('star', 'icon--fill')} <strong>${p.rating.toFixed(1)}</strong> <span>(${p.reviews})</span></p>
    <div class="pcard__foot">
      <p class="price">${priceHtml(p)}</p>
      <button class="btn btn--soft btn--sm pcard__add" type="button" data-add-to-cart data-id="${p.id}">${icon('plus')}<span>Add to Cart</span></button>
    </div>
  </div>
</article>`;
}

function categoryTile(c) {
  const items = products.filter((p) => p.category === c.id);
  const from = Math.min(...items.map(basePrice));
  return `<a class="ctile" href="${catUrl(c)}">
  <span class="ctile__media">${img(c.image, { sizes: '(min-width: 1100px) 280px, (min-width: 700px) 45vw, 46vw' })}</span>
  <span class="ctile__body">
    <span class="ctile__name">${esc(c.name)}</span>
    <span class="ctile__meta">${items.length} rentals · from ${money(from)}</span>
  </span>
  <span class="ctile__arrow">${icon('arrow-right')}</span>
</a>`;
}

function packageMath(pk) {
  const regular = pk.items.reduce((sum, it) => sum + unitPrice(byId(it.id), it.duration) * it.qty, 0);
  return { regular, save: regular - pk.price };
}
const packageItemLabel = (it) => {
  const p = byId(it.id);
  const qty = it.qty > 1 ? `${it.qty} × ` : '';
  const dur = it.duration ? `, ${DURATIONS[it.duration].toLowerCase()}` : '';
  return `${qty}${p.name}${dur}`;
};
function packageCard(pk, { showImage = true } = {}) {
  const { regular, save } = packageMath(pk);
  return `<article class="pkg${pk.featured ? ' pkg--featured' : ''}" id="${pk.id}">
  ${showImage ? `<div class="pkg__media">${img(pk.image, { sizes: '(min-width: 1100px) 380px, 92vw' })}${pk.featured ? `<span class="pkg__badge">${icon('star', 'icon--fill')} Most booked</span>` : ''}</div>` : ''}
  <div class="pkg__body">
    <h3 class="pkg__name">${esc(pk.name)}</h3>
    <p class="pkg__tag">${esc(pk.tagline)}</p>
    <ul class="pkg__items">${pk.items.map((it) => `<li>${icon('check')}<span><a href="${productUrl(byId(it.id))}">${esc(packageItemLabel(it))}</a></span></li>`).join('')}</ul>
    <div class="pkg__price">
      <p><strong>${money(pk.price)}</strong> <s>${money(regular)}</s></p>
      <span class="save">You save ${money(save)}</span>
    </div>
    <button class="btn ${pk.featured ? 'btn--primary' : 'btn--soft'} btn--block" type="button" data-add-package="${pk.id}">${icon('package')}<span>Add package to cart</span></button>
  </div>
</article>`;
}

function reviewCard(r) {
  const initials = r.name.replace(/^(Coach|Mr\.|Ms\.)\s+/, '').split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
  return `<figure class="review">
  ${stars(r.stars)}
  <blockquote><p>${esc(r.text)}</p></blockquote>
  <figcaption>
    <span class="avatar" aria-hidden="true">${initials}</span>
    <span><strong>${esc(r.name)}</strong><span>${esc(r.event)} · ${esc(r.city)}</span></span>
  </figcaption>
</figure>`;
}

let faqSeq = 0;
function faqList(list) {
  return `<div class="faq">${list
    .map((f) => {
      const n = ++faqSeq;
      return `<div class="faq__item">
  <h3 class="faq__h"><button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-${n}" id="faq-q-${n}" data-accordion><span>${esc(f.q)}</span>${icon('plus')}</button></h3>
  <div class="faq__a" id="faq-a-${n}" role="region" aria-labelledby="faq-q-${n}" hidden><p>${esc(f.a)}</p></div>
</div>`;
    })
    .join('')}</div>`;
}

function accordionList(sections) {
  return `<div class="faq faq--details">${sections
    .map(([title, items], i) => {
      const n = ++faqSeq;
      const open = i === 0;
      return `<div class="faq__item">
  <h3 class="faq__h"><button class="faq__q" type="button" aria-expanded="${open}" aria-controls="faq-a-${n}" id="faq-q-${n}" data-accordion><span>${esc(title)}</span>${icon('plus')}</button></h3>
  <div class="faq__a" id="faq-a-${n}" role="region" aria-labelledby="faq-q-${n}"${open ? '' : ' hidden'}><ul class="ticks">${items.map((t) => `<li>${icon('check')}<span>${esc(t)}</span></li>`).join('')}</ul></div>
</div>`;
    })
    .join('')}</div>`;
}

// Setup footprint drawing: unit inside its setup area, with dimension lines.
function footprintSvg(p, { small = false } = {}) {
  const [L, W] = p.setup;
  const [l, w] = p.size;
  const maxW = 300, maxH = 170;
  const k = Math.min(maxW / L, maxH / W);
  const SW = L * k, SH = W * k;
  const ox = 60 + (maxW - SW) / 2, oy = 58 + (maxH - SH) / 2;
  const uw = l * k, uh = w * k;
  const ux = ox + (SW - uw) / 2, uy = oy + (SH - uh) / 2;
  const clear = Math.round(((L - l) / 2) * 10) / 10;
  const vb = '0 0 420 300';
  if (small) {
    return `<svg class="footprint footprint--small" viewBox="${vb}" aria-hidden="true"><rect x="${ox}" y="${oy}" width="${SW}" height="${SH}" rx="6" class="fp-area"/><rect x="${ux}" y="${uy}" width="${uw}" height="${uh}" rx="4" class="fp-unit"/></svg>`;
  }
  const extra = p.kind === 'inflatable'
    ? `<g class="fp-note"><circle cx="${ox + SW + 28}" cy="${oy + SH - 10}" r="13" class="fp-dot"/><use href="#i-plug" x="${ox + SW + 20}" y="${oy + SH - 18}" width="16" height="16" class="fp-plug"/></g>`
    : '';
  return `<svg class="footprint" viewBox="${vb}" role="img" aria-label="Setup area ${L} by ${W} feet, unit ${l} by ${w} feet, ${clear} feet clear on each side">
  <rect x="0" y="0" width="420" height="300" rx="16" class="fp-bg"/>
  <rect x="${ox}" y="${oy}" width="${SW}" height="${SH}" rx="8" class="fp-area"/>
  <rect x="${ux}" y="${uy}" width="${uw}" height="${uh}" rx="6" class="fp-unit"/>
  <text x="${ux + uw / 2}" y="${uy + uh / 2 - 4}" text-anchor="middle" class="fp-unit-label">${esc(p.name.split(' ').slice(0, 2).join(' '))}</text>
  <text x="${ux + uw / 2}" y="${uy + uh / 2 + 14}" text-anchor="middle" class="fp-unit-dim">${l} × ${w} ft</text>
  <g class="fp-dim"><line x1="${ox}" y1="${oy - 18}" x2="${ox + SW}" y2="${oy - 18}"/><line x1="${ox}" y1="${oy - 24}" x2="${ox}" y2="${oy - 12}"/><line x1="${ox + SW}" y1="${oy - 24}" x2="${ox + SW}" y2="${oy - 12}"/></g>
  <text x="${ox + SW / 2}" y="${oy - 26}" text-anchor="middle" class="fp-dim-label">${L} ft</text>
  <g class="fp-dim"><line x1="${ox - 18}" y1="${oy}" x2="${ox - 18}" y2="${oy + SH}"/><line x1="${ox - 24}" y1="${oy}" x2="${ox - 12}" y2="${oy}"/><line x1="${ox - 24}" y1="${oy + SH}" x2="${ox - 12}" y2="${oy + SH}"/></g>
  <text x="${ox - 28}" y="${oy + SH / 2}" text-anchor="middle" class="fp-dim-label" transform="rotate(-90 ${ox - 28} ${oy + SH / 2})">${W} ft</text>
  <text x="210" y="282" text-anchor="middle" class="fp-caption">Setup area ${L} × ${W} ft · ${clear} ft clear on each side${p.kind === 'inflatable' ? ' · outlet within 50 ft' : ''}</text>
</svg>`;
}

// Service-area map: rings to scale (6 px per mile), cities placed by distance.
function serviceMap({ highlight } = {}) {
  const cx = 250, cy = 210, k = 6;
  const pos = (z) => {
    if (!z.miles || (z.x === 0 && z.y === 0)) return { x: cx, y: cy };
    const a = Math.atan2(z.y, z.x);
    return { x: cx + Math.cos(a) * z.miles * k, y: cy + Math.sin(a) * z.miles * k };
  };
  const dots = zones
    .map((z) => {
      const { x, y } = pos(z);
      if (x === cx && y === cy) {
        return `<a href="${cityUrl(z)}" class="map-city map-city--hq${highlight === z.city ? ' is-on' : ''}" aria-label="${esc(z.city)}, our warehouse, free delivery">
  <text x="${cx - 22}" y="${cy + 2}" text-anchor="end" class="map-label">${esc(z.city)}</text>
  <text x="${cx - 22}" y="${cy + 18}" text-anchor="end" class="map-sub">Warehouse · Free</text>
</a>`;
      }
      const fee = deliveryFee(z.miles);
      const on = highlight === z.city;
      const right = x >= cx;
      return `<a href="${cityUrl(z)}" class="map-city${on ? ' is-on' : ''}" aria-label="${esc(z.city)}, ${z.miles} miles, ${fee ? money(fee) + ' delivery' : 'free delivery'}">
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 9 : 7}" class="map-dot${fee ? '' : ' map-dot--free'}"/>
  <text x="${(x + (right ? 14 : -14)).toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}" class="map-label">${esc(z.city)}</text>
  <text x="${(x + (right ? 14 : -14)).toFixed(1)}" y="${(y + 14).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}" class="map-sub">${z.miles} mi · ${fee ? money(fee) : 'Free'}</text>
</a>`;
    })
    .join('');
  return `<svg class="service-map" viewBox="0 0 500 420" role="img" aria-labelledby="map-title">
  <title id="map-title">Delivery area: free within ${store.freeMiles} miles of Springfield, ${money(store.perMile)} per mile out to ${store.maxMiles} miles</title>
  <defs><pattern id="map-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" class="map-grid-dot"/></pattern></defs>
  <rect width="500" height="420" rx="20" class="map-bg"/>
  <rect width="500" height="420" rx="20" fill="url(#map-grid)"/>
  <circle cx="${cx}" cy="${cy}" r="${store.maxMiles * k}" class="map-ring map-ring--paid"/>
  <circle cx="${cx}" cy="${cy}" r="${store.freeMiles * k}" class="map-ring map-ring--free"/>
  <text x="${cx}" y="${cy - store.maxMiles * k - 10}" text-anchor="middle" class="map-ring-label">${store.maxMiles} mi · ${money(store.perMile)} per mile after ${store.freeMiles}</text>
  <text x="${cx}" y="${cy + store.freeMiles * k - 10}" text-anchor="middle" class="map-ring-label map-ring-label--free">Free · ${store.freeMiles} mi</text>
  <g class="map-hq"><circle cx="${cx}" cy="${cy}" r="15" class="map-hq-bg"/><path d="M${cx - 6} ${cy + 1}l6-6 6 6v6h-12z" class="map-hq-icon"/></g>
  ${dots}
</svg>`;
}

// ---------- layout ----------
const brandMark = `<svg class="brand__mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" class="bm-bg"/><path d="M27.5 14.2a8.6 8.6 0 1 0 0 11.6" class="bm-c"/><circle cx="31" cy="20" r="2.6" class="bm-dot1"/><rect x="8" y="6.5" width="5" height="2.6" rx="1.3" transform="rotate(-30 10.5 7.8)" class="bm-dot2"/><circle cx="30.5" cy="8.5" r="1.8" class="bm-dot3"/></svg>`;

function header(active) {
  const navLink = (href, label, key) => `<li><a class="nav__link${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a></li>`;
  return `<div class="announce">
  <div class="container announce__inner">
    <p class="announce__msg"><span class="demo-pill">Demo</span><span>Free delivery within ${store.freeMiles} miles · Book online any time</span></p>
    <p class="announce__phone">${icon('phone')}<a href="${store.phoneHref}">${store.phone}</a></p>
  </div>
</div>
<header class="site-header" data-header>
  <div class="container header__inner">
    <a class="brand" href="index.html" aria-label="${esc(store.name)}, home">${brandMark}<span class="brand__name">Confetti<small>Party Rentals</small></span></a>
    <nav class="nav" aria-label="Main">
      <ul class="nav__list">
        <li class="nav__mega">
          <button class="nav__link${active === 'rentals' ? ' is-active' : ''}" type="button" aria-expanded="false" aria-controls="mega-rentals" data-mega>Rentals ${icon('chevron-down')}</button>
          <div class="mega" id="mega-rentals" hidden>
            <div class="mega__grid">
              ${categories.map((c) => `<a class="mega__item" href="${catUrl(c)}"><span class="mega__icon">${icon(c.icon)}</span><span><strong>${esc(c.name)}</strong><small>${esc(c.blurb)}</small></span></a>`).join('')}
            </div>
            <a class="mega__promo" href="packages.html">
              <span class="mega__promo-tag">Packages</span>
              <strong>Save up to ${money(Math.max(...packages.map((pk) => packageMath(pk).save)))} with a bundle</strong>
              <span>Bounce house, tables, chairs and treats in one order ${icon('arrow-right')}</span>
            </a>
            <a class="mega__all" href="rentals.html">See all ${products.length} rentals ${icon('arrow-right')}</a>
          </div>
        </li>
        ${navLink('packages.html', 'Packages', 'packages')}
        ${navLink('service-area.html', 'Service Area', 'area')}
        ${navLink('faq.html', 'FAQ', 'faq')}
        ${navLink('contact.html', 'Contact', 'contact')}
      </ul>
    </nav>
    <div class="header__actions">
      <a class="header__phone" href="${store.phoneHref}">${icon('phone')}<span>${store.phone}</span></a>
      <button class="btn btn--primary btn--sm header__cta" type="button" data-open-availability>${icon('calendar-days')}<span data-event-label>Check Availability</span></button>
      <a class="cart-btn" href="cart.html" data-cart-link aria-label="Cart">${icon('shopping-bag')}<span class="cart-btn__count" data-cart-count hidden>0</span></a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" data-menu-toggle>${icon('menu')}<span class="visually-hidden">Menu</span></button>
    </div>
  </div>
  <div class="mobile-nav" id="mobile-nav" hidden>
    <div class="container">
      <p class="mobile-nav__label">Rentals</p>
      <div class="mobile-nav__cats">${categories.map((c) => `<a href="${catUrl(c)}">${icon(c.icon)}<span>${esc(c.name)}</span></a>`).join('')}</div>
      <ul class="mobile-nav__links">
        <li><a href="rentals.html">All rentals</a></li>
        <li><a href="packages.html">Packages</a></li>
        <li><a href="service-area.html">Service Area</a></li>
        <li><a href="faq.html">FAQ</a></li>
        <li><a href="about.html">About</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </div>
  </div>
</header>`;
}

function footer() {
  return `<section class="cta">
  <div class="container">
    <div class="cta__card">
      <div>
        <h2>Ready to plan your party?</h2>
        <p>Pick your date to see what's free. Summer weekends usually book 3 to 4 weeks ahead.</p>
      </div>
      <div class="cta__actions">
        <button class="btn btn--primary btn--lg" type="button" data-open-availability>${icon('calendar-days')}<span>Check availability</span></button>
        <a class="btn btn--ghost btn--lg" href="${store.phoneHref}">${icon('phone')}<span>${store.phone}</span></a>
      </div>
    </div>
  </div>
</section>
<footer class="site-footer">
  <div class="container footer__grid">
    <div class="footer__brand">
      <a class="brand" href="index.html">${brandMark}<span class="brand__name">Confetti<small>Party Rentals</small></span></a>
      <p>Party rentals delivered and set up across ${store.city} and 5 nearby towns since ${store.since}.</p>
      <ul class="footer__contact">
        <li>${icon('phone')}<a href="${store.phoneHref}">${store.phone}</a></li>
        <li>${icon('mail')}<a href="mailto:${store.email}">${store.email}</a></li>
        <li>${icon('map-pin')}<span>${store.address}</span></li>
      </ul>
    </div>
    <div>
      <h2 class="footer__h">Rentals</h2>
      <ul class="footer__links">${categories.map((c) => `<li><a href="${catUrl(c)}">${esc(c.name)}</a></li>`).join('')}</ul>
    </div>
    <div>
      <h2 class="footer__h">Help</h2>
      <ul class="footer__links">
        <li><a href="packages.html">Packages</a></li>
        <li><a href="service-area.html">Delivery area</a></li>
        <li><a href="faq.html">FAQ and policies</a></li>
        <li><a href="quote.html">Request a quote</a></li>
        <li><a href="about.html">About us</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </div>
    <div>
      <h2 class="footer__h">Office hours</h2>
      <ul class="footer__hours">${store.hours.map((h) => `<li><span>${h.days}</span><span>${h.time}</span></li>`).join('')}</ul>
    </div>
  </div>
  <div class="container footer__bottom">
    <p>© 2026 ${esc(store.name)}. A RentMy demo store; products, prices and reviews are examples.</p>
    <p><a href="about.html#photo-credits">Photo credits</a></p>
  </div>
</footer>
<nav class="bottom-bar" aria-label="Quick actions">
  <a href="${store.phoneHref}">${icon('phone')}<span>Call</span></a>
  <a href="${store.smsHref}">${icon('message-circle')}<span>Text</span></a>
  <button type="button" class="bottom-bar__book" data-open-availability>${icon('calendar-days')}<span>Book Now</span></button>
</nav>`;
}

function overlays() {
  const times = [];
  for (let h = 8; h <= 20; h++) times.push(h);
  const tlabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;
  const opt = (sel) => times.map((h) => `<option value="${String(h).padStart(2, '0')}:00"${h === sel ? ' selected' : ''}>${tlabel(h)}</option>`).join('');
  return `<div class="modal" id="availability-modal" role="dialog" aria-modal="true" aria-labelledby="am-title" hidden data-modal>
  <div class="modal__backdrop" data-close-modal></div>
  <div class="modal__panel" role="document">
    <div class="modal__head">
      <div><p class="eyebrow">Step 1 of booking</p><h2 id="am-title">When is your party?</h2></div>
      <button class="icon-btn" type="button" data-close-modal aria-label="Close">${icon('x')}</button>
    </div>
    <form class="am-form" data-availability-form novalidate>
      <div class="am-cal" data-calendar-inline aria-label="Choose your event date"></div>
      <div class="am-side">
        <p class="am-picked" data-am-picked>Pick a date on the calendar</p>
        <div class="field-row">
          <div class="field"><label for="am-start">Start time</label><select id="am-start" name="start">${opt(12)}</select></div>
          <div class="field"><label for="am-end">End time</label><select id="am-end" name="end">${opt(16)}</select></div>
        </div>
        <div class="field">
          <label for="am-zip">Delivery ZIP code</label>
          <input id="am-zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="e.g. ${zones[1].zip}">
          <p class="field__help" data-zone-msg aria-live="polite">Try ${zones.map((z) => z.zip).slice(0, 3).join(', ')}.</p>
        </div>
        <p class="am-error" data-am-error role="alert" hidden></p>
        <button class="btn btn--primary btn--block btn--lg" type="submit">${icon('search')}<span>See what's available</span></button>
      </div>
    </form>
  </div>
</div>
<aside class="drawer" id="cart-drawer" aria-labelledby="cd-title" hidden data-drawer>
  <div class="drawer__backdrop" data-close-drawer></div>
  <div class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cd-title">
    <div class="drawer__head"><h2 id="cd-title">Your cart</h2><button class="icon-btn" type="button" data-close-drawer aria-label="Close cart">${icon('x')}</button></div>
    <div class="drawer__event" data-drawer-event></div>
    <ul class="drawer__lines" data-drawer-lines></ul>
    <div class="drawer__foot">
      <p class="drawer__sub"><span>Subtotal</span><strong data-drawer-subtotal>$0</strong></p>
      <p class="drawer__note" data-drawer-deposit></p>
      <div class="drawer__actions"><a class="btn btn--ghost" href="cart.html">View cart</a><a class="btn btn--primary" href="cart.html#summary">Checkout</a></div>
    </div>
  </div>
</aside>
<div class="toasts" data-toasts aria-live="polite"></div>`;
}

function page({ file, title, description, active, body, cls = '', jsonld }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Crect width=%2740%27 height=%2740%27 rx=%2712%27 fill=%27%23d63447%27/%3E%3Cpath d=%27M27.5 14.2a8.6 8.6 0 1 0 0 11.6%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%274.5%27 stroke-linecap=%27round%27/%3E%3Ccircle cx=%2731%27 cy=%2720%27 r=%272.6%27 fill=%27%23ffc93c%27/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/main.css">
<script src="assets/js/data.js" defer></script>
<script src="assets/js/app.js" defer></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<div class="site ${cls}">
${sprite()}
<a class="skip-link" href="#main">Skip to content</a>
${header(active)}
<main id="main">
${body}
</main>
${footer()}
${overlays()}
</div>
</body>
</html>
`;
  writeFileSync(join(DIST, file), html);
  return html;
}

const crumbs = (list) => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${list.map(([href, label], i) => `<li>${i < list.length - 1 ? `<a href="${href}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join('')}</ol></nav>`;

const datebar = () => `<div class="datebar" data-datebar>
  <span class="datebar__icon">${icon('calendar-days')}</span>
  <p class="datebar__text" data-datebar-text>Pick a date to see what's available</p>
  <button class="btn btn--ghost btn--sm" type="button" data-open-availability><span data-datebar-btn>Pick a date</span></button>
</div>`;

const sectionHead = (eyebrow, title, link, intro) => `<div class="section-head">
  <div><h2>${title}</h2>${intro ? `<p class="section-head__intro">${intro}</p>` : ''}</div>
  ${link ? `<a class="link-arrow" href="${link[0]}">${link[1]} ${icon('arrow-right')}</a>` : ''}
</div>`;

// ---------- pages ----------
rmSync(DIST, { recursive: true, force: true });
rmSync(PUBLISH, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(PUBLISH, { recursive: true });

const popular = [...products].sort((a, b) => a.popular - b.popular);
const inflatables = products.filter((p) => p.kind === 'inflatable');
const homeFaqs = faqs.filter((f) => f.home);
const heroCredit = creditFor('hero-backyard');

// Home
// Layout follows what US party rental storefronts lead with: a bold photo hero with the
// rating and booking bar, a trust-badge row, a seasonal promo, categories, most booked,
// occasions, a "why us" band, steps, packages, reviews with a score card, then delivery.
const season = seasons.find((s) => s.months.includes(new Date().getMonth() + 1)) || seasons[0];
const yearsOpen = new Date().getFullYear() - store.since;
const heroCats = ['bounce-houses', 'water-slides', 'combos', 'tents'].map(catById);
// Decorative confetti for dark bands: [shape, x, y, size, colour, rotation] on a 1440 × 720 canvas.
const confetti = `<svg class="confetti" viewBox="0 0 1440 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${[
  ['c', 56, 92, 7, 'y'], ['r', 190, 36, 22, 'p', 24], ['c', 430, 26, 5, 'w'], ['r', 640, 58, 16, 'y', -32], ['c', 780, 200, 6, 'p'],
  ['r', 770, 690, 18, 'w', 40], ['c', 34, 660, 9, 'p'], ['r', 300, 696, 16, 'y', -18], ['c', 990, 22, 6, 'y'], ['r', 1250, 34, 22, 'p', 60],
  ['c', 1416, 210, 8, 'w'], ['r', 1404, 610, 18, 'y', 20], ['c', 1090, 702, 7, 'p'], ['c', 540, 700, 4, 'w'],
].map(([t, x, y, s, c, rot = 0]) => (t === 'c'
  ? `<circle cx="${x}" cy="${y}" r="${s}" class="cf cf--${c}"/>`
  : `<rect x="${x - s / 2}" y="${y - s / 5}" width="${s}" height="${(s / 2.5).toFixed(1)}" rx="2" transform="rotate(${rot} ${x} ${y})" class="cf cf--${c}"/>`)).join('')}</svg>`;

page({
  file: 'index.html',
  title: store.name,
  description: `Bounce house, water slide, tent and table rentals in ${store.city}. Pick your date, see what's free, and book online. Free delivery within ${store.freeMiles} miles.`,
  active: 'home',
  cls: 'page-home',
  jsonld: {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: store.name, telephone: store.phone, email: store.email,
    address: { '@type': 'PostalAddress', streetAddress: '1200 Market Street', addressLocality: store.city },
    areaServed: zones.map((z) => ({ '@type': 'City', name: z.city })),
    aggregateRating: { '@type': 'AggregateRating', ratingValue: store.rating, reviewCount: store.reviewCount },
  },
  body: `<section class="hero2">
  ${confetti}
  <div class="container hero2__grid">
    <div class="hero2__copy">
      <a class="hero2__rating" href="#reviews">${stars(store.rating, 'stars--sm')}<span><strong>${store.rating}</strong> from ${store.reviewCount} reviews</span></a>
      <h1 class="hero2__title">Bounce houses, water slides and tents, <span class="hl-sun">delivered and set up</span></h1>
      <p class="hero2__lead">Party rentals in ${store.city} since ${store.since}. Pick your date to see what's free, book online in a few minutes, and our crew handles delivery, setup and pickup.</p>
      <form class="ticket" data-hero-form novalidate>
        <div class="ticket__field">
          <label for="hero-date">Event date</label>
          <button class="ticket__input" type="button" id="hero-date" data-date-popover aria-haspopup="dialog">${icon('calendar-days')}<span data-hero-date-label>Pick a date</span></button>
        </div>
        <div class="ticket__field">
          <label for="hero-time">Start time</label>
          <select class="ticket__input" id="hero-time">${[9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => `<option value="${String(h).padStart(2, '0')}:00"${h === 12 ? ' selected' : ''}>${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}</option>`).join('')}</select>
        </div>
        <div class="ticket__field">
          <label for="hero-zip">ZIP code</label>
          <input class="ticket__input" id="hero-zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="${zones[0].zip}">
        </div>
        <button class="btn btn--primary btn--lg ticket__submit" type="submit">${icon('search')}<span>Check availability</span></button>
      </form>
      <p class="ticket__error" data-hero-error role="alert" hidden></p>
      <p class="hero__note">${icon('lock')}<span>Checking is free. A ${money(store.deposit.min)} deposit holds your date when you book.</span></p>
      <div class="hero2__quick">
        <span>Popular:</span>
        <ul>${heroCats.map((c) => `<li><a href="${catUrl(c)}">${icon(c.icon)}<span>${esc(c.name)}</span></a></li>`).join('')}</ul>
      </div>
    </div>
    <div class="hero2__media">
      <div class="hero2__collage">
        <div class="hero2__photo hero2__photo--tall">${img('p-tropical-combo', { eager: true, alt: 'Boy sliding down a rainbow inflatable slide with his arms in the air', sizes: '(min-width: 1100px) 300px, 50vw' })}</div>
        <div class="hero2__photo">${img('p-wave-rider', { alt: 'Kids playing on a tall palm-tree water slide in a backyard', sizes: '(min-width: 1100px) 260px, 44vw' })}</div>
        <div class="hero2__photo">${img('hero-backyard', { kind: 'hero', alt: heroCredit?.alt || 'Kids playing at a backyard party', sizes: '(min-width: 1100px) 260px, 44vw' })}</div>
      </div>
      <p class="hero2__sticker"><strong>Free</strong> delivery within ${store.freeMiles} mi</p>
      <div class="float-card" data-weekend-card>
        <span class="live-dot" aria-hidden="true"></span>
        <p><strong data-weekend-count>${inflatables.length} of ${inflatables.length}</strong> inflatables free <span data-weekend-date>this Saturday</span></p>
      </div>
    </div>
  </div>
</section>

<section class="badges" aria-label="Why customers book with us">
  <ul class="container badges__list">
    <li><span class="badges__icon">${icon('star', 'icon--fill')}</span><span><strong>${store.rating} star rating</strong>from ${store.reviewCount} reviews</span></li>
    <li><span class="badges__icon">${icon('shield-check')}</span><span><strong>Fully insured</strong>$1M liability coverage</span></li>
    <li><span class="badges__icon">${icon('sparkles')}</span><span><strong>Cleaned every rental</strong>Washed and sanitized</span></li>
    <li><span class="badges__icon">${icon('clock')}</span><span><strong>On-time delivery</strong>A text 30 minutes out</span></li>
    <li><span class="badges__icon">${icon('umbrella')}</span><span><strong>Rain-check promise</strong>Refund or credit for bad weather</span></li>
  </ul>
</section>

<section class="section section--season">
  <div class="container">
    <div class="season">
      <div class="season__media">${img(season.image, { kind: season.kind || 'card', sizes: '(min-width: 900px) 560px, 92vw' })}</div>
      <div class="season__copy">
        <p class="season__tag">${icon('calendar-check')}<span>${esc(season.tag)}</span></p>
        <h2>${esc(season.title)}</h2>
        <p class="season__text">${esc(season.text)}</p>
        <ul class="season__picks">${season.picks.map(byId).map((p) => `<li><a href="${productUrl(p)}">${img(p.image, { sizes: '56px' })}<span><strong>${esc(p.name)}</strong><span>from ${money(basePrice(p))}</span></span></a></li>`).join('')}</ul>
        <a class="btn btn--primary" href="${season.link}"><span>${esc(season.cta)}</span>${icon('arrow-right')}</a>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    ${sectionHead('', 'Shop by category', ['rentals.html', `See all ${products.length} rentals`], 'Every rental is delivered, set up and picked up by our crew.')}
    <div class="ctiles ctiles--home">${categories.map(categoryTile).join('')}</div>
  </div>
</section>

<section class="section section--soft">
  <div class="container">
    ${sectionHead('', 'Most booked rentals', ['rentals.html', 'Browse all'], `Prices include delivery within ${store.freeMiles} miles, setup and pickup.`)}
    ${datebar()}
    <div class="pgrid pgrid--4">${popular.slice(0, 8).map((p) => productCard(p)).join('')}</div>
  </div>
</section>

<section class="section">
  <div class="container">
    ${sectionHead('', 'Plan by occasion', null, "Tell us the kind of party and we'll point you to what works.")}
    <div class="occasions">${events.map((e) => `<a class="occasion" href="${e.link}">
      <span class="occasion__media">${img(e.image, { sizes: '(min-width: 1000px) 290px, 46vw' })}</span>
      <span class="occasion__body"><strong>${esc(e.title)}</strong><span>${esc(e.text)}</span><span class="occasion__go">Plan it ${icon('arrow-right')}</span></span>
    </a>`).join('')}</div>
  </div>
</section>

<section class="why">
  ${confetti}
  <div class="container">
    <div class="why__head">
      <h2>Why ${esc(store.city)} families book Confetti</h2>
      <p>Local, family run and on time. This comes with every rental.</p>
    </div>
    <ul class="why__stats">
      <li><strong>${yearsOpen}</strong><span>years of parties</span></li>
      <li><strong>${store.rating}</strong><span>average from ${store.reviewCount} reviews</span></li>
      <li><strong>${products.length}</strong><span>rentals to choose from</span></li>
      <li><strong>${zones.length}</strong><span>towns we deliver to</span></li>
    </ul>
    <div class="why__grid">${safety.map((s) => `<div class="why__card"><span class="why__icon">${icon(s.icon)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('')}</div>
  </div>
</section>

<section class="section">
  <div class="container">
    ${sectionHead('', `Booked in ${steps.length} easy steps`, null, 'From picking a date to pickup, here is how it goes.')}
    <ol class="steps steps--home">${steps.map((s, i) => `<li class="step"><span class="step__n">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join('')}</ol>
    <div class="steps__cta">
      <button class="btn btn--primary btn--lg" type="button" data-open-availability>${icon('calendar-days')}<span>Start with your date</span></button>
      <a class="btn btn--ghost btn--lg" href="${store.smsHref}">${icon('message-circle')}<span>Text us a question</span></a>
    </div>
  </div>
</section>

<section class="section section--soft">
  <div class="container">
    ${sectionHead('', 'Party packages', ['packages.html', 'Compare packages'], 'Bundles for an 8-hour party, priced lower than booking each item.')}
    <div class="pkgs">${packages.map((pk) => packageCard(pk)).join('')}</div>
  </div>
</section>

<section class="section" id="reviews">
  <div class="container">
    ${sectionHead('', 'What customers say', ['about.html#reviews', 'More reviews'])}
    <div class="reviews2">
      <div class="rsum">
        <p class="rsum__score">${store.rating}</p>
        ${stars(store.rating)}
        <p class="rsum__count">Average from ${store.reviewCount} reviews</p>
        <ul class="rsum__bars">${store.ratingSplit.map((pct, i) => `<li><span>${5 - i} star</span><span class="rsum__bar"><span style="width: ${pct}%"></span></span><span>${pct}%</span></li>`).join('')}</ul>
      </div>
      <div class="review-list review-list--2">${reviews.slice(0, 4).map(reviewCard).join('')}</div>
    </div>
  </div>
</section>

<section class="section section--soft">
  <div class="container area">
    <div class="area__map">${serviceMap()}</div>
    <div class="area__copy">
      <h2>Free delivery within ${store.freeMiles} miles</h2>
      <p>We deliver up to ${store.maxMiles} miles from ${store.city}. After ${store.freeMiles} miles it's ${money(store.perMile)} a mile, and you see the exact fee in your cart.</p>
      <div class="city-chips">${zones.map((z) => `<a class="city-chip" href="${cityUrl(z)}">${esc(z.city)}<span>${deliveryFee(z.miles) ? money(deliveryFee(z.miles)) : 'Free'}</span></a>`).join('')}</div>
      <ul class="facts">
        <li>${icon('truck')}<span>Delivery ${store.deliveryWindow}</span></li>
        <li>${icon('clock')}<span>Pickup by ${store.pickupBy}</span></li>
      </ul>
      <a class="link-arrow area__link" href="service-area.html">See the full delivery area ${icon('arrow-right')}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="faq-wrap">
      <div class="faq-wrap__intro">
        <h2>Common questions</h2>
        <p>Can't find your answer? Call or text <span class="nowrap">${store.phone}</span>.</p>
        <a class="link-arrow" href="faq.html">All questions and policies ${icon('arrow-right')}</a>
      </div>
      ${faqList(homeFaqs.slice(0, 5))}
    </div>
  </div>
</section>`,
});

function galleryItem(i) {
  const name = `gal-${i}`;
  const c = creditFor(name);
  const portrait = c?.orientation === 'portrait';
  const wide = !portrait && i === 2;
  return `<figure class="gallery__item${portrait ? ' gallery__item--tall' : ''}${wide ? ' gallery__item--wide' : ''}">${img(name, { kind: portrait ? 'portrait' : 'card', sizes: wide ? '(min-width: 1100px) 600px, 92vw' : '(min-width: 1100px) 290px, 46vw' })}</figure>`;
}

// Catalog page (all rentals and each category)
function catalogPage({ file, title, h1, intro, list, category }) {
  const priceBuckets = [
    ['under-100', 'Under $100', (v) => v < 100],
    ['100-200', '$100 to $200', (v) => v >= 100 && v < 200],
    ['200-300', '$200 to $300', (v) => v >= 200 && v < 300],
    ['300-plus', '$300 and up', (v) => v >= 300],
  ].filter(([, , f]) => list.some((p) => f(basePrice(p))));
  const hasInfl = list.some((p) => p.kind === 'inflatable');
  const ageOpts = [['toddlers', 'Toddlers (1 to 5)'], ['kids', 'Kids (3 to 12)'], ['all', 'All ages, adults too']].filter(([v]) => list.some((p) => p.ageGroup === v));
  const wetOpts = [['dry', 'Dry'], ['wet', 'Wet']].filter(([v]) => list.some((p) => (p.kind === 'inflatable' ? (p.wet ? 'wet' : 'dry') : '') === v));
  const group = (name, legend, opts) =>
    opts.length > 1
      ? `<fieldset class="filter-group"><legend>${legend}</legend>${opts.map(([v, label]) => `<label class="check"><input type="checkbox" name="${name}" value="${v}"><span class="check__box">${icon('check')}</span><span class="check__label">${label}</span><span class="check__count" data-count-for="${name}:${v}"></span></label>`).join('')}</fieldset>`
      : '';
  const catOpts = category ? [] : categories.map((c) => [c.id, c.name]);
  const c = category ? catById(category) : null;
  const pg = catalogPageCount++;
  return page({
    file,
    title,
    description: intro,
    active: 'rentals',
    cls: 'page-catalog',
    body: `<section class="page-hero${c ? ' page-hero--split' : ''}">
  <div class="container page-hero__grid">
    <div>
      ${crumbs(c ? [['index.html', 'Home'], ['rentals.html', 'Rentals'], ['', c.name]] : [['index.html', 'Home'], ['', 'All rentals']])}
      <h1>${esc(h1)}</h1>
      <p class="lead">${esc(intro)}</p>
      <p class="price-note">${icon('info')}<span>Inflatable prices shown are for 4 hours. 8-hour, overnight and 2-day rates are on each item.</span></p>
    </div>
    ${c ? `<div class="page-hero__media">${img(c.image, { sizes: '(min-width: 1100px) 480px, 92vw', eager: true })}</div>` : ''}
  </div>
</section>
<div class="container">${datebar()}</div>
<div class="container catalog" data-catalog>
  <aside class="filters" id="filters-${pg}" aria-label="Filters" data-filters-panel>
    <div class="filters__head"><h2>Filters</h2><button class="icon-btn filters__close" type="button" data-filters-close aria-label="Close filters">${icon('x')}</button></div>
    <form data-filters>
      <label class="switch"><input type="checkbox" name="available" value="1" data-available-toggle><span class="switch__track"><span></span></span><span class="switch__label">Free on my date</span></label>
      ${group('category', 'Category', catOpts)}
      ${group('price', 'Price', priceBuckets.map(([v, l]) => [v, l]))}
      ${hasInfl ? group('age', 'Age group', ageOpts) : ''}
      ${hasInfl ? group('wet', 'Wet or dry', wetOpts) : ''}
      <button class="btn btn--ghost btn--block" type="reset" data-clear-filters>Clear filters</button>
    </form>
  </aside>
  <div class="catalog__main">
    <div class="toolbar">
      <p class="toolbar__count" data-result-count aria-live="polite">${list.length} rentals</p>
      <button class="btn btn--ghost btn--sm filters-open" type="button" data-filters-open aria-controls="filters-${pg}">${icon('sliders-horizontal')}<span>Filters</span></button>
      <label class="sort"><span>Sort</span><select data-sort><option value="popular">Most popular</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="new">Newest</option></select></label>
      <div class="view-toggle" role="group" aria-label="Layout"><button type="button" class="icon-btn" data-view="grid" aria-pressed="true" aria-label="Grid view">${icon('layout-grid')}</button><button type="button" class="icon-btn" data-view="list" aria-pressed="false" aria-label="List view">${icon('list')}</button></div>
    </div>
    <div class="pgrid pgrid--3" data-grid>${list.map((p) => productCard(p, { headingLevel: 2, showCat: !category })).join('')}</div>
    <div class="empty" data-empty hidden>${icon('search')}<p><strong>No rentals match these filters.</strong> Try a different price or turn off "Free on my date".</p><button class="btn btn--ghost btn--sm" type="button" data-clear-filters-btn>Clear filters</button></div>
  </div>
</div>
${c ? categoryExtras(c) : ''}
<div class="container" data-recent-wrap hidden><section class="section section--tight">${sectionHead('', 'Recently viewed')}<div class="pgrid pgrid--4" data-recent></div></section></div>`,
  });
}
let catalogPageCount = 1;

function categoryExtras(c) {
  const qa = {
    'bounce-houses': [faqs[2], faqs[3], faqs[6]],
    'combos': [faqs[2], faqs[3], faqs[0]],
    'water-slides': [{ q: 'How much water does a slide use?', a: 'A garden hose runs the whole time at low pressure, about the same as a lawn sprinkler. The pool drains when we pick up.' }, faqs[1], faqs[3]],
    'active-play': [{ q: 'Can adults use the climbing tower?', a: 'Yes. The Rocket Climb Tower is rated for teens and adults. Keep climbers of similar size on the tower together.' }, faqs[9], faqs[2]],
    'tents': [{ q: 'Do you mark buried lines before staking?', a: 'Yes. We book the free utility locate service for you at least 3 days before your event.' }, faqs[6], faqs[1]],
    'tables-chairs': [{ q: 'Do you set up tables and chairs?', a: 'We deliver them stacked where you choose. Full setup is $1 per chair and $5 per table; ask when you book.' }, faqs[7], faqs[5]],
    'concessions': [{ q: 'Can I order more servings?', a: 'Yes. Add 50 more servings for $20 on the product page. Extra supplies you do not open are not charged.' }, faqs[3], faqs[5]],
    'games': [{ q: 'Can I pick up yard games myself?', a: 'Yes. Games fit in a car, so warehouse pickup is free. Choose Pickup in the cart.' }, faqs[5], faqs[4]],
  }[c.id];
  const related = categories.filter((x) => x.id !== c.id).slice(0, 4);
  return `<section class="section section--soft">
  <div class="container faq-wrap">
    <div class="faq-wrap__intro">
      <p class="eyebrow">${esc(c.name)} FAQ</p>
      <h2>Before you book</h2>
      <ol class="mini-steps">${steps.map((s) => `<li>${esc(s.title)}</li>`).join('')}</ol>
    </div>
    ${faqList(qa)}
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead('Complete the party', 'Often booked together')}
    <div class="ctiles ctiles--compact">${categories.filter((x) => x.id !== c.id).slice(0, 4).map(categoryTile).join('')}</div>
  </div>
</section>`;
}

catalogPage({ file: 'rentals.html', title: `All rentals · ${store.name}`, h1: 'All party rentals', intro: `Every inflatable, tent, table, treat machine and yard game we deliver in ${store.city}. Pick a date to see what's free.`, list: popular });
for (const c of categories) {
  const list = popular.filter((p) => p.category === c.id);
  catalogPage({ file: catUrl(c), title: `${c.name} rentals in ${store.city} · ${store.name}`, h1: c.name, intro: c.intro, list, category: c.id });
}

// Product pages
const crossSell = {
  inflatable: (p) => ['popup-canopy-10x10', 'kids-table-and-chair-set', p.wet ? 'snow-cone-machine' : 'cotton-candy-machine', 'giant-connect-four'],
  tent: () => ['round-table-60in', 'white-folding-chair', 'farmhouse-table-8ft', 'popcorn-machine'],
  table: () => ['frame-tent-20x20', 'white-folding-chair', 'kids-table-and-chair-set', 'cotton-candy-machine'],
  concession: () => ['royal-castle-bounce-house', 'popup-canopy-10x10', 'farmhouse-table-8ft', 'cornhole-set'],
  game: () => ['cornhole-set', 'giant-tumble-tower', 'popcorn-machine', 'frame-tent-20x20'],
};

for (const p of products) {
  const c = catById(p.category);
  const startQty = isLadder(p) ? 1 : p.id === 'white-folding-chair' ? 20 : p.unit === 'each' ? 4 : 1;
  const startTotal = isLadder(p) ? p.prices.h4 : p.price * startQty;
  const thumbs = [{ type: 'img', name: p.image, alt: p.name }, { type: 'img', name: c.image, alt: `${c.name} at a customer's party` }];
  if (p.setup) thumbs.push({ type: 'footprint' });
  const cross = crossSell[p.kind](p).filter((id) => id !== p.id).slice(0, 4).map(byId);
  if (cross.length < 4) cross.push(...popular.filter((x) => x.id !== p.id && !cross.includes(x)).slice(0, 4 - cross.length));
  const inPkgs = packages.filter((pk) => pk.items.some((it) => it.id === p.id));
  const durations = isLadder(p)
    ? `<fieldset class="durations"><legend>Rental length</legend><div class="durations__grid">${Object.entries(DURATIONS).map(([k, label], i) => `<label class="pill-radio"><input type="radio" name="duration" value="${k}"${i === 0 ? ' checked' : ''}><span><strong>${label}</strong><em>${money(p.prices[k])}</em></span></label>`).join('')}</div></fieldset>`
    : `<div class="qty-row"><span class="qty-row__label" id="qty-label">Quantity</span><div class="stepper" role="group" aria-labelledby="qty-label"><button type="button" class="icon-btn" data-step="-1" aria-label="Fewer">${icon('minus')}</button><input type="number" name="qty" id="pdp-qty" value="${startQty}" min="1" max="${p.id === 'white-folding-chair' ? 300 : 40}" inputmode="numeric" aria-labelledby="qty-label"><button type="button" class="icon-btn" data-step="1" aria-label="More">${icon('plus')}</button></div><span class="qty-row__unit">${money(p.price)} ${UNIT_LABEL[p.unit]}</span></div>`;
  const addonHtml = p.addons.length
    ? `<fieldset class="addons"><legend>Add-ons</legend>${p.addons.map((a) => `<label class="check check--row"><input type="checkbox" name="addon" value="${a}"><span class="check__box">${icon('check')}</span><span class="check__label">${esc(addons[a].label)}</span><span class="check__price">+${money(addons[a].price)}${addons[a].perUnit ? ' each' : ''}</span></label>`).join('')}</fieldset>`
    : '';
  const deposit = depositFor(startTotal);
  page({
    file: productUrl(p),
    title: `${p.name} · ${store.name}`,
    description: `${p.summary} From ${money(basePrice(p))}, delivered and set up in ${store.city}.`,
    active: 'rentals',
    cls: 'page-product',
    jsonld: { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.summary, image: `assets/img/${p.image}-1200.webp`, aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews }, offers: { '@type': 'Offer', priceCurrency: 'USD', price: basePrice(p), availability: 'https://schema.org/InStock' } },
    body: `<div class="container">${crumbs([['index.html', 'Home'], ['rentals.html', 'Rentals'], [catUrl(c), c.name], ['', p.name]])}</div>
<div class="container pdp" data-pdp data-id="${p.id}">
  <div class="pdp__gallery" data-gallery>
    <div class="pdp__main">
      <div class="pdp__stage" data-gallery-stage>${img(p.image, { eager: true, alt: p.name, sizes: '(min-width: 1100px) 640px, 92vw' })}</div>
      ${p.setup ? `<div class="pdp__stage pdp__stage--fp" data-gallery-fp hidden>${footprintSvg(p)}</div>` : ''}
      ${p.badge ? `<span class="ribbon${p.badge === 'New' ? ' ribbon--new' : ''}">${esc(p.badge)}</span>` : ''}
    </div>
    <div class="pdp__thumbs" role="group" aria-label="Photos">
      ${thumbs
        .map((t, i) =>
          t.type === 'img'
            ? `<button class="thumb${i === 0 ? ' is-active' : ''}" type="button" data-thumb="img" data-src="assets/img/${t.name}-1200.webp" data-srcset="assets/img/${t.name}-600.webp 600w, assets/img/${t.name}-1200.webp 1200w" data-alt="${esc(t.alt)}" aria-label="Show photo ${i + 1}" aria-pressed="${i === 0}"><img src="assets/img/${t.name}-600.webp" alt="" width="600" height="450" loading="lazy"></button>`
            : `<button class="thumb thumb--fp" type="button" data-thumb="fp" aria-label="Show the setup footprint" aria-pressed="false">${footprintSvg(p, { small: true })}<span>Footprint</span></button>`
        )
        .join('')}
    </div>
  </div>
  <div class="pdp__info">
    <p class="pdp__cat"><a href="${catUrl(c)}">${esc(c.name)}</a></p>
    <h1 class="pdp__title">${esc(p.name)}</h1>
    <p class="pdp__rating">${stars(p.rating, 'stars--sm')}<strong>${p.rating.toFixed(1)}</strong><span>${p.reviews} reviews</span></p>
    <p class="pdp__summary">${esc(p.summary)}</p>
    <form class="buybox" data-buybox novalidate>
      ${durations}
      <div class="availbox" data-availbox aria-live="polite">
        <span class="availbox__icon">${icon('calendar-days')}</span>
        <div class="availbox__text"><strong data-availbox-title>Pick a date to check availability</strong><span data-availbox-sub>Delivery ${store.deliveryWindow}, pickup by ${store.pickupBy}</span></div>
        <button class="btn btn--ghost btn--sm" type="button" data-open-availability><span data-availbox-btn>Pick a date</span></button>
      </div>
      <div class="similar" data-similar hidden></div>
      ${addonHtml}
      <div class="buybox__total"><span>Total for this item</span><strong data-total>${money(startTotal)}</strong></div>
      <div class="buybox__actions">
        <button class="btn btn--primary btn--lg" type="submit" data-buy>${icon('shopping-bag')}<span>Add to Cart</span></button>
        <a class="btn btn--ghost btn--lg" href="contact.html#message" data-ask="${esc(p.name)}">${icon('message-circle')}<span>Ask a question</span></a>
      </div>
      <p class="deposit-note">${icon('lock')}<span data-deposit-note>Reserve with ${money(deposit)} today. Balance due ${store.balanceDaysBefore} days before your event.</span></p>
    </form>
    <section class="specs" aria-labelledby="specs-h">
      <h2 id="specs-h" class="specs__h">Specs</h2>
      <dl class="spec-list">${specRows(p).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </section>
  </div>
</div>
<section class="section section--tight">
  <div class="container pdp-details">
    <div>
      <h2>Details</h2>
      ${accordionList(detailSections(p))}
    </div>
    ${inPkgs.length ? `<aside class="pdp-pkg"><p class="eyebrow">Save with a package</p>${inPkgs.map((pk) => packageCard(pk, { showImage: false })).join('')}</aside>` : `<aside class="pdp-pkg pdp-pkg--plain"><p class="eyebrow">Planning something bigger?</p><h3>Request a quote</h3><p>Orders over ${money(store.quoteThreshold)}, and events for schools, churches and companies, get a custom quote within 1 business day.</p><a class="btn btn--ghost" href="quote.html">Start a quote ${icon('arrow-right')}</a></aside>`}
  </div>
</section>
<section class="section section--soft">
  <div class="container">
    ${sectionHead('Complete the party', 'Often booked with this')}
    <div class="pgrid pgrid--4">${cross.map((x) => productCard(x)).join('')}</div>
  </div>
</section>
<div class="container" data-recent-wrap hidden><section class="section section--tight">${sectionHead('', 'Recently viewed')}<div class="pgrid pgrid--4" data-recent></div></section></div>
<div class="pdp-sticky" data-pdp-sticky hidden>
  <div class="pdp-sticky__info"><span>${esc(p.name)}</span><strong data-total>${money(startTotal)}</strong></div>
  <button class="btn btn--primary" type="button" data-buy-proxy>${icon('shopping-bag')}<span>Add to Cart</span></button>
</div>`,
  });
}

// Packages
page({
  file: 'packages.html',
  title: `Party packages · ${store.name}`,
  description: 'Three bundles for birthdays, splash days and big events, each cheaper than booking the items one by one.',
  active: 'packages',
  cls: 'page-packages',
  body: `<section class="page-hero">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['', 'Packages']])}
    <h1>Party packages</h1>
    <p class="lead">Three bundles that cover most parties we deliver. Each is cheaper than booking the same items one by one, and you can add anything else in the cart.</p>
  </div>
</section>
<div class="container">${datebar()}</div>
<section class="section section--tight">
  <div class="container"><div class="pkgs">${packages.map((pk) => packageCard(pk)).join('')}</div></div>
</section>
<section class="section section--soft">
  <div class="container">
    ${sectionHead('Rate card', 'Packages side by side')}
    <div class="table-wrap">
      <table class="rate-table">
        <thead><tr><th scope="col">Package</th><th scope="col">Best for</th><th scope="col">Booked separately</th><th scope="col">Package price</th><th scope="col">You save</th></tr></thead>
        <tbody>${packages.map((pk) => { const m = packageMath(pk); return `<tr><th scope="row"><a href="#${pk.id}">${esc(pk.name)}</a></th><td>${esc(pk.tagline)}</td><td class="num"><s>${money(m.regular)}</s></td><td class="num"><strong>${money(pk.price)}</strong></td><td class="num save-cell">${money(m.save)}</td></tr>`; }).join('')}</tbody>
      </table>
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead('Add-ons', 'Extras for any rental', null, 'Pick these on the product page. Prices are per rental unless marked each.')}
    <div class="table-wrap">
      <table class="rate-table rate-table--addons">
        <thead><tr><th scope="col">Add-on</th><th scope="col">Works with</th><th scope="col">Price</th></tr></thead>
        <tbody>
          <tr><th scope="row">${esc(addons['extra-hour'].label)}</th><td>Inflatables</td><td class="num">${money(addons['extra-hour'].price)}</td></tr>
          <tr><th scope="row">${esc(addons.attendant.label)}</th><td>Inflatables</td><td class="num">${money(addons.attendant.price)}</td></tr>
          <tr><th scope="row">${esc(addons.generator.label)}</th><td>Inflatables</td><td class="num">${money(addons.generator.price)}</td></tr>
          <tr><th scope="row">${esc(addons.sandbags.label)}</th><td>Inflatables and tents</td><td class="num">${money(addons.sandbags.price)}</td></tr>
          <tr><th scope="row">${esc(addons.sidewalls.label)}</th><td>Tents</td><td class="num">${money(addons.sidewalls.price)}</td></tr>
          <tr><th scope="row">${esc(addons.lights.label)}</th><td>Frame tents</td><td class="num">${money(addons.lights.price)}</td></tr>
          <tr><th scope="row">${esc(addons.linen.label)}</th><td>Tables</td><td class="num">${money(addons.linen.price)} each</td></tr>
          <tr><th scope="row">${esc(addons.servings.label)}</th><td>Concessions</td><td class="num">${money(addons.servings.price)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>`,
});

// Cart
page({
  file: 'cart.html',
  title: `Your cart · ${store.name}`,
  description: 'Review your rentals, delivery fee and deposit.',
  active: 'cart',
  cls: 'page-cart',
  body: `<section class="page-hero page-hero--slim">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['', 'Cart']])}
    <h1>Your cart</h1>
  </div>
</section>
<div class="container" data-cart-page>
  <div class="cart-empty" data-cart-empty hidden>
    <span class="cart-empty__icon">${icon('shopping-bag')}</span>
    <h2>Your cart is empty</h2>
    <p>Pick a date, add a rental or two, and your delivery fee and deposit show up here.</p>
    <div class="cart-empty__actions"><a class="btn btn--primary" href="rentals.html">Browse rentals</a><button class="btn btn--ghost" type="button" data-sample-order>Try a sample order</button></div>
  </div>
  <div class="cart-layout" data-cart-full hidden>
    <div class="cart-main">
      <div class="cart-event" data-cart-event></div>
      <ul class="cart-lines" data-cart-lines></ul>
      <section class="cart-box">
        <h2>Delivery</h2>
        <div class="radio-cards" role="radiogroup" aria-label="Delivery or pickup">
          <label class="radio-card"><input type="radio" name="fulfil" value="delivery" checked data-cart-opt><span>${icon('truck')}<strong>Delivery and setup</strong><small>Free within ${store.freeMiles} miles</small></span></label>
          <label class="radio-card"><input type="radio" name="fulfil" value="pickup" data-cart-opt><span>${icon('house')}<strong>Warehouse pickup</strong><small>Free · games and tables only</small></span></label>
        </div>
        <div class="field-row" data-delivery-fields>
          <div class="field"><label for="cart-zip">Delivery ZIP code</label><input id="cart-zip" inputmode="numeric" maxlength="5" autocomplete="postal-code" data-cart-zip><p class="field__help" data-cart-zone aria-live="polite"></p></div>
          <div class="field"><span class="field__label" id="surface-l">Setup surface</span><div class="seg" role="radiogroup" aria-labelledby="surface-l"><label><input type="radio" name="surface" value="grass" checked data-cart-opt><span>Grass</span></label><label><input type="radio" name="surface" value="hard" data-cart-opt><span>Hard surface</span></label></div><p class="field__help">Hard surfaces need sandbags: ${money(store.sandbagFee)} per inflatable or tent.</p></div>
        </div>
        <div class="field"><label for="cart-event-type">Event type</label><select id="cart-event-type" data-cart-opt name="eventType"><option value="family">Birthday or family party</option><option value="school">School</option><option value="church">Church</option><option value="company">Company event</option><option value="wedding">Wedding</option><option value="other">Something else</option></select></div>
      </section>
      <section class="cart-box">
        <h2>Questions before you book</h2>
        ${faqList([faqs[0], faqs[1], faqs[4]])}
      </section>
    </div>
    <aside class="summary" id="summary" aria-labelledby="sum-h">
      <h2 id="sum-h">Order summary</h2>
      <dl class="summary__rows" data-summary-rows></dl>
      <div class="summary__due" data-summary-due></div>
      <p class="summary__reason" data-summary-reason hidden></p>
      <a class="btn btn--primary btn--block btn--lg" href="checkout.html" data-summary-cta>Continue to checkout</a>
      <ul class="summary__trust"><li>${icon('lock')}Secure checkout</li><li>${icon('cloud-rain')}Free weather cancellation</li><li>${icon('calendar-check')}Move your date once, free</li></ul>
    </aside>
  </div>
</div>`,
});

// Checkout
page({
  file: 'checkout.html',
  title: `Checkout · ${store.name}`,
  description: 'Enter your details, sign the rental agreement, and pay your deposit.',
  active: 'cart',
  cls: 'page-checkout',
  body: `<section class="page-hero page-hero--slim">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['cart.html', 'Cart'], ['', 'Checkout']])}
    <h1>Checkout</h1>
  </div>
</section>
<div class="container" data-checkout>
  <div class="cart-empty" data-checkout-empty hidden>
    <span class="cart-empty__icon">${icon('shopping-bag')}</span>
    <h2>Nothing to check out yet</h2>
    <p>Your cart is empty. Add rentals first, or load a sample order to see how checkout works.</p>
    <div class="cart-empty__actions"><a class="btn btn--primary" href="rentals.html">Browse rentals</a><button class="btn btn--ghost" type="button" data-sample-order>Try a sample order</button></div>
  </div>
  <div class="cart-layout" data-checkout-full hidden>
    <div class="checkout-main">
      <ol class="progress" data-progress>
        <li class="is-current"><span>1</span>Your details</li>
        <li><span>2</span>Rental agreement</li>
        <li><span>3</span>Deposit</li>
      </ol>
      <form class="co-step" data-step="1" novalidate>
        <h2>Your details</h2>
        <div class="field-row">
          <div class="field"><label for="co-name">Full name</label><input id="co-name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="co-phone">Mobile phone</label><input id="co-phone" name="phone" type="tel" autocomplete="tel" required><p class="field__help">We text when the crew is 30 minutes away.</p></div>
        </div>
        <div class="field"><label for="co-email">Email</label><input id="co-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="co-street">Event address</label><input id="co-street" name="street" autocomplete="street-address" required placeholder="Street address"></div>
        <div class="field-row">
          <div class="field"><label for="co-city">Town</label><input id="co-city" name="city" autocomplete="address-level2" required></div>
          <div class="field"><label for="co-zip">ZIP code</label><input id="co-zip" name="zip" inputmode="numeric" maxlength="5" autocomplete="postal-code" required></div>
        </div>
        <div class="field"><label for="co-notes">Setup notes <span class="optional">optional</span></label><textarea id="co-notes" name="notes" rows="3" placeholder="Gate code, where to set up, dogs in the yard..."></textarea></div>
        <p class="form-error" data-form-error role="alert" hidden></p>
        <div class="co-actions"><a class="btn btn--ghost" href="cart.html">${icon('chevron-left')}<span>Back to cart</span></a><button class="btn btn--primary btn--lg" type="submit">Continue ${icon('arrow-right')}</button></div>
      </form>
      <form class="co-step" data-step="2" novalidate hidden>
        <h2>Rental agreement</h2>
        <div class="agreement" tabindex="0" aria-label="Rental agreement text">
          <h3>Rental agreement and safety waiver</h3>
          <p>1. ${esc(store.name)} delivers, sets up and picks up the rented items at the address and times on this order. An adult (18+) must be present at delivery to receive the safety walkthrough.</p>
          <p>2. The renter keeps an adult watching inflatables the whole time they are in use and follows the safety rules printed on each unit.</p>
          <p>3. Inflatables must be cleared if wind goes over 15 mph or lightning is nearby. The renter may cancel for weather up to 2 hours before delivery for a full refund or credit.</p>
          <p>4. The deposit of $50 or 25% of the order, whichever is higher, is charged today. The balance is charged ${store.balanceDaysBefore} days before the event.</p>
          <p>5. Cancellations 7 or more days before the event are refunded in full. Inside 7 days, the deposit becomes store credit for 12 months.</p>
          <p>6. The renter is responsible for damage beyond normal wear, including cuts, stains, silly string, and damage from pets.</p>
        </div>
        <label class="check check--row"><input type="checkbox" name="agree" required data-agree><span class="check__box">${icon('check')}</span><span class="check__label">I have read the rental agreement and safety waiver</span></label>
        <div class="field"><label for="co-sign">Type your full name to sign</label><input id="co-sign" name="sign" class="signature" autocomplete="off" required><p class="field__help" data-sign-help>Must match the name on your details.</p></div>
        <p class="form-error" data-form-error role="alert" hidden></p>
        <div class="co-actions"><button class="btn btn--ghost" type="button" data-back>${icon('chevron-left')}<span>Back</span></button><button class="btn btn--primary btn--lg" type="submit">${icon('pen-line')}<span>Sign and continue</span></button></div>
      </form>
      <form class="co-step" data-step="3" novalidate hidden>
        <h2>Pay your deposit</h2>
        <div class="demo-pay">
          <span class="demo-pay__icon">${icon('lock')}</span>
          <div><strong>Demo payment</strong><p>This is a demo store, so no card is needed and nothing is charged. A live store would show its card form here.</p></div>
        </div>
        <div class="pay-breakdown" data-pay-breakdown></div>
        <div class="co-actions"><button class="btn btn--ghost" type="button" data-back>${icon('chevron-left')}<span>Back</span></button><button class="btn btn--primary btn--lg" type="submit" data-pay-btn>${icon('lock')}<span>Pay deposit</span></button></div>
      </form>
    </div>
    <aside class="summary" aria-labelledby="co-sum-h">
      <h2 id="co-sum-h">Order summary</h2>
      <div class="summary__event" data-co-event></div>
      <ul class="summary__lines" data-co-lines></ul>
      <dl class="summary__rows" data-summary-rows></dl>
      <div class="summary__due" data-summary-due></div>
    </aside>
  </div>
</div>`,
});

// Confirmation
page({
  file: 'confirmation.html',
  title: `Booking confirmed · ${store.name}`,
  description: 'Your party rental booking is confirmed.',
  active: 'cart',
  cls: 'page-confirm',
  body: `<div class="container" data-confirm>
  <div class="cart-empty" data-confirm-empty hidden>
    <span class="cart-empty__icon">${icon('calendar-check')}</span>
    <h2>No booking yet</h2>
    <p>Once you pay a deposit, your booking details show up here.</p>
    <div class="cart-empty__actions"><a class="btn btn--primary" href="rentals.html">Browse rentals</a></div>
  </div>
  <div class="confirm" data-confirm-full hidden>
    <div class="confirm__hero">
      <span class="confirm__check">${icon('check')}</span>
      <p class="eyebrow">Booking confirmed</p>
      <h1>You're booked for <span data-cf-date></span></h1>
      <p class="lead">Order <strong data-cf-number></strong>. A copy is on its way to <span data-cf-email></span>.</p>
      <div class="confirm__actions"><a class="btn btn--primary" data-cf-gcal target="_blank" rel="noopener">${icon('calendar-days')}<span>Add to Google Calendar</span></a><a class="btn btn--ghost" href="index.html">Back to home</a></div>
    </div>
    <div class="confirm__grid">
      <section class="cart-box"><h2>Delivery</h2><dl class="kv" data-cf-delivery></dl></section>
      <section class="cart-box"><h2>Payment</h2><dl class="kv" data-cf-pay></dl></section>
      <section class="cart-box confirm__items"><h2>Your rentals</h2><ul class="summary__lines" data-cf-lines></ul></section>
      <section class="cart-box"><h2>Before we arrive</h2><ul class="ticks">
        <li>${icon('check')}<span>Clear the setup area of toys, rocks and dog waste</span></li>
        <li>${icon('check')}<span>Check there's an outlet within 50 ft, on its own circuit</span></li>
        <li>${icon('check')}<span>Unlock the gate and keep pets inside during setup</span></li>
        <li>${icon('check')}<span>Mark sprinkler heads so we don't stake into them</span></li>
      </ul></section>
    </div>
  </div>
</div>`,
});

// Quote
page({
  file: 'quote.html',
  title: `Request a quote · ${store.name}`,
  description: 'Custom quotes for schools, churches, companies and orders over $1,500.',
  active: 'cart',
  cls: 'page-quote',
  body: `<section class="page-hero">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['', 'Request a quote']])}
    <h1>Request a quote</h1>
    <p class="lead">For orders over ${money(store.quoteThreshold)}, and for schools, churches and companies. We reply within 1 business day with a quote link you can pay from.</p>
  </div>
</section>
<div class="container cart-layout" data-quote>
  <form class="cart-box quote-form" data-quote-form novalidate>
    <div class="field-row">
      <div class="field"><label for="q-name">Your name</label><input id="q-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="q-org">Organization <span class="optional">optional</span></label><input id="q-org" name="org" autocomplete="organization"></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="q-email">Email</label><input id="q-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="q-phone">Phone</label><input id="q-phone" name="phone" type="tel" autocomplete="tel" required></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="q-type">Event type</label><select id="q-type" name="type"><option value="school">School</option><option value="church">Church</option><option value="company">Company event</option><option value="wedding">Wedding</option><option value="family">Large family party</option><option value="other">Something else</option></select></div>
      <div class="field"><label for="q-guests">Guest count</label><input id="q-guests" name="guests" type="number" min="1" inputmode="numeric" required></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="q-date">Event date</label><button class="input-btn" type="button" id="q-date" data-date-popover data-date-field="date">${icon('calendar-days')}<span>Pick a date</span></button></div>
      <div class="field"><label for="q-backup">Backup date</label><button class="input-btn" type="button" id="q-backup" data-date-popover data-date-field="backup">${icon('calendar-days')}<span>Pick a date</span></button><p class="field__help">If your first date is booked, we'll look at this one.</p></div>
    </div>
    <div class="field"><span class="field__label">Rentals you're interested in</span><ul class="quote-items" data-quote-items><li class="quote-items__empty">Nothing in your cart yet. List what you need in the notes below.</li></ul></div>
    <div class="field"><label for="q-notes">Notes</label><textarea id="q-notes" name="notes" rows="4" placeholder="Number of kids, setup surface, timing, anything else we should know"></textarea></div>
    <p class="form-error" data-form-error role="alert" hidden></p>
    <button class="btn btn--primary btn--lg" type="submit">${icon('mail')}<span>Send quote request</span></button>
  </form>
  <aside class="summary quote-aside">
    <h2>What happens next</h2>
    <ol class="mini-steps mini-steps--rich">
      <li><strong>We check every date</strong><span>Your first and backup dates, for every item.</span></li>
      <li><strong>You get a quote link</strong><span>Within 1 business day, by email and text.</span></li>
      <li><strong>Pay the deposit online</strong><span>The same ${money(store.deposit.min)} or 25% rule. Purchase orders welcome for schools.</span></li>
    </ol>
    <p class="quote-aside__call">Prefer to talk? Call <a href="${store.phoneHref}">${store.phone}</a></p>
  </aside>
  <div class="quote-done cart-box" data-quote-done hidden>
    <span class="confirm__check">${icon('check')}</span>
    <h2>Quote request sent</h2>
    <p>Thanks, <span data-quote-name></span>. We'll reply within 1 business day at <span data-quote-email></span>. This is a demo, so no email is actually sent.</p>
    <a class="btn btn--ghost" href="index.html">Back to home</a>
  </div>
</div>`,
});

// Service area + city pages
page({
  file: 'service-area.html',
  title: `Delivery area · ${store.name}`,
  description: `Free party rental delivery within ${store.freeMiles} miles of ${store.city}; $${store.perMile} per mile out to ${store.maxMiles} miles.`,
  active: 'area',
  cls: 'page-area',
  body: `<section class="page-hero">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['', 'Service area']])}
    <h1>Where we deliver</h1>
    <p class="lead">Free within ${store.freeMiles} miles of our ${store.city} warehouse, then ${money(store.perMile)} a mile out to ${store.maxMiles} miles. Your exact fee shows in the cart before you pay.</p>
  </div>
</section>
<section class="section section--tight">
  <div class="container area area--page">
    <div class="area__map">${serviceMap()}</div>
    <div class="area__copy">
      <div class="table-wrap">
        <table class="rate-table">
          <thead><tr><th scope="col">Town</th><th scope="col">ZIP</th><th scope="col">Distance</th><th scope="col">Delivery</th></tr></thead>
          <tbody>${zones.map((z) => `<tr><th scope="row"><a href="${cityUrl(z)}">${esc(z.city)}</a></th><td class="num">${z.zip}</td><td class="num">${z.miles} mi</td><td class="num">${deliveryFee(z.miles) ? money(deliveryFee(z.miles)) : '<span class="free">Free</span>'}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="area__note">Over ${store.maxMiles} miles? Call or text <a href="${store.smsHref}">${store.phone}</a>. Warehouse pickup is free for yard games and tables.</p>
    </div>
  </div>
</section>
<section class="section section--soft">
  <div class="container">
    ${sectionHead('Towns', 'Local notes from our crew')}
    <div class="city-grid">${zones.map((z) => `<a class="city-card" href="${cityUrl(z)}"><span class="city-card__top"><strong>${esc(z.city)}</strong><span class="fee-chip${deliveryFee(z.miles) ? '' : ' fee-chip--free'}">${deliveryFee(z.miles) ? money(deliveryFee(z.miles)) + ' delivery' : 'Free delivery'}</span></span><span class="city-card__note">${esc(cityNotes[z.city])}</span><span class="link-arrow">Rentals in ${esc(z.city)} ${icon('arrow-right')}</span></a>`).join('')}</div>
  </div>
</section>`,
});

for (const z of zones) {
  const fee = deliveryFee(z.miles);
  const local = reviews.filter((r) => r.city === z.city);
  page({
    file: cityUrl(z),
    title: `Party rentals in ${z.city} · ${store.name}`,
    description: `Bounce houses, water slides, tents and tables delivered to ${z.city}. ${fee ? money(fee) + ' delivery' : 'Free delivery'}.`,
    active: 'area',
    cls: 'page-city',
    body: `<section class="page-hero">
  <div class="container page-hero__grid">
    <div>
      ${crumbs([['index.html', 'Home'], ['service-area.html', 'Service area'], ['', z.city]])}
      <h1>Party rentals in ${esc(z.city)}</h1>
      <p class="lead">${esc(cityNotes[z.city])}</p>
      <ul class="facts">
        <li>${icon('route')}<span><strong>${z.miles} miles</strong> from our warehouse</span></li>
        <li>${icon('truck')}<span><strong>${fee ? money(fee) : 'Free'}</strong> delivery and pickup</span></li>
        <li>${icon('map-pin')}<span>ZIP <strong>${z.zip}</strong></span></li>
      </ul>
    </div>
    <div class="area__map area__map--small">${serviceMap({ highlight: z.city })}</div>
  </div>
</section>
<section class="section section--soft">
  <div class="container">
    ${sectionHead('Popular in ' + esc(z.city), 'Most booked rentals', ['rentals.html', 'All rentals'])}
    ${datebar()}
    <div class="pgrid pgrid--4">${popular.slice(0, 4).map((p) => productCard(p)).join('')}</div>
  </div>
</section>
${local.length ? `<section class="section"><div class="container">${sectionHead('Reviews', `From ${esc(z.city)} customers`)}<div class="review-list review-list--wide">${local.map(reviewCard).join('')}</div></div></section>` : ''}`,
  });
}

// FAQ
const groups = [...new Set(faqs.map((f) => f.group))];
page({
  file: 'faq.html',
  title: `FAQ and policies · ${store.name}`,
  description: 'Deposits, weather, setup space, power, delivery windows and cancellations.',
  active: 'faq',
  cls: 'page-faq',
  body: `<section class="page-hero">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['', 'FAQ']])}
    <h1>Questions and policies</h1>
    <p class="lead">The answers parents, schools and planners ask for most. Anything else, call or text <a href="${store.smsHref}">${store.phone}</a>.</p>
  </div>
</section>
<section class="section section--tight">
  <div class="container faq-page">
    <nav class="faq-toc" aria-label="FAQ sections"><ul>${groups.map((g) => `<li><a href="#${slug(g)}">${esc(g)}</a></li>`).join('')}<li><a href="#policies">Policies</a></li></ul></nav>
    <div class="faq-groups">
      ${groups.map((g) => `<section id="${slug(g)}" class="faq-group"><h2>${esc(g)}</h2>${faqList(faqs.filter((f) => f.group === g))}</section>`).join('')}
      <section id="policies" class="faq-group">
        <h2>Policies</h2>
        <dl class="policy-list">
          <div><dt>${icon('lock')}Deposit</dt><dd>${money(store.deposit.min)} or 25% of the order, whichever is higher. The balance is charged ${store.balanceDaysBefore} days before the event.</dd></div>
          <div><dt>${icon('truck')}Delivery</dt><dd>Free within ${store.freeMiles} miles; ${money(store.perMile)} per mile from ${store.freeMiles} to ${store.maxMiles} miles; call for anything farther.</dd></div>
          <div><dt>${icon('clock')}Delivery window</dt><dd>${store.deliveryWindow} for daytime events; pickup by ${store.pickupBy} the same day.</dd></div>
          <div><dt>${icon('cloud-rain')}Weather</dt><dd>Cancel up to 2 hours before delivery for rain or wind over 15 mph, for a full refund or credit.</dd></div>
          <div><dt>${icon('calendar-days')}Cancellation</dt><dd>Full refund 7 or more days out; store credit inside 7 days.</dd></div>
          <div><dt>${icon('ruler')}Hard surfaces</dt><dd>Sandbags instead of stakes, ${money(store.sandbagFee)} per inflatable or tent.</dd></div>
        </dl>
      </section>
    </div>
  </div>
</section>`,
});

// About
const allCredits = credits.filter((c) => c.photographer);
page({
  file: 'about.html',
  title: `About us · ${store.name}`,
  description: `A family-run party rental crew in ${store.city} since ${store.since}.`,
  active: 'about',
  cls: 'page-about',
  body: `<section class="page-hero">
  <div class="container page-hero__grid">
    <div>
      ${crumbs([['index.html', 'Home'], ['', 'About']])}
      <h1>One bounce house, a pickup truck, and ${new Date('2026-10-07').getFullYear() - store.since} summers since</h1>
      <p class="lead">Confetti started in ${store.since} with a single castle and a borrowed trailer. Today a crew of 14 delivers about 1,800 parties a year across ${store.city} and five nearby towns.</p>
      <p>We still wash every inflatable by hand after each rental, and we still text you when we're 30 minutes away. Those two habits earned most of our ${store.reviewCount} reviews.</p>
    </div>
    <div class="page-hero__media">${img('event-birthday', { sizes: '(min-width: 1100px) 480px, 92vw', eager: true })}</div>
  </div>
</section>
<section class="section section--soft">
  <div class="container">
    ${sectionHead('How we work', 'Safety is the job')}
    <div class="safety">${safety.map((s) => `<div class="safety__card"><span class="safety__icon">${icon(s.icon)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('')}</div>
  </div>
</section>
<section class="section" id="reviews">
  <div class="container">
    ${sectionHead('Reviews', `${store.rating} stars from ${store.reviewCount} customers`)}
    <div class="review-list review-list--wide">${reviews.map(reviewCard).join('')}</div>
  </div>
</section>
<section class="section section--soft" id="gallery">
  <div class="container">
    ${sectionHead('Gallery', 'Parties we\'ve set up')}
    <div class="gallery">${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => galleryItem(i)).join('')}</div>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead('Preferred vendors', 'Local businesses we work with', null, 'We deliver to their events often and trust their work.')}
    <ul class="vendors">${vendors.map((v) => `<li><strong>${esc(v.name)}</strong><span>${esc(v.type)}</span></li>`).join('')}</ul>
  </div>
</section>
<section class="section section--soft" id="photo-credits">
  <div class="container">
    ${sectionHead('Photo credits', 'Photos from Unsplash', null, 'This demo uses photos from Unsplash under the Unsplash License. Thank you to these photographers.')}
    <ul class="credits">${allCredits.map((c) => `<li><a href="${esc(c.photoUrl)}" target="_blank" rel="noopener">${esc(c.file)}</a><span>by <a href="${esc(c.photographerUrl)}" target="_blank" rel="noopener">${esc(c.photographer)}</a></span></li>`).join('')}</ul>
  </div>
</section>`,
});

// Contact
page({
  file: 'contact.html',
  title: `Contact · ${store.name}`,
  description: `Call, text or email ${store.name}. Office hours and gift cards.`,
  active: 'contact',
  cls: 'page-contact',
  body: `<section class="page-hero">
  <div class="container">
    ${crumbs([['index.html', 'Home'], ['', 'Contact']])}
    <h1>Talk to a real person</h1>
    <p class="lead">Calls and texts are answered by our office team, not a call center. Most messages get a reply within 2 hours during office hours.</p>
  </div>
</section>
<section class="section section--tight">
  <div class="container contact">
    <form class="cart-box contact-form" data-contact-form novalidate id="message">
      <h2>Send a message</h2>
      <div class="field-row">
        <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" autocomplete="name" required></div>
        <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" autocomplete="email" required></div>
      </div>
      <div class="field"><label for="c-phone">Phone <span class="optional">optional</span></label><input id="c-phone" name="phone" type="tel" autocomplete="tel"></div>
      <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" rows="5" required></textarea></div>
      <div class="field"><span class="field__label" id="c-pref">Best way to reach you</span><div class="seg" role="radiogroup" aria-labelledby="c-pref"><label><input type="radio" name="pref" value="text" checked><span>Text</span></label><label><input type="radio" name="pref" value="call"><span>Call</span></label><label><input type="radio" name="pref" value="email"><span>Email</span></label></div></div>
      <p class="form-error" data-form-error role="alert" hidden></p>
      <button class="btn btn--primary btn--lg" type="submit">${icon('mail')}<span>Send message</span></button>
      <div class="form-done" data-form-done hidden>${icon('circle-check-big')}<p><strong>Message sent.</strong> We'll get back to you within 2 hours during office hours. This is a demo, so nothing is actually sent.</p></div>
    </form>
    <div class="contact__side">
      <div class="info-card">
        <h2>Call or text</h2>
        <p class="info-card__big"><span data-copy-text>${store.phone}</span><button class="icon-btn" type="button" data-copy="${store.phone}" aria-label="Copy phone number">${icon('copy')}</button></p>
        <p>${icon('mail')}<a href="mailto:${store.email}">${store.email}</a></p>
        <p>${icon('map-pin')}<span>${store.address}</span></p>
      </div>
      <div class="info-card">
        <h2>Office hours</h2>
        <ul class="footer__hours footer__hours--dark">${store.hours.map((h) => `<li><span>${h.days}</span><span>${h.time}</span></li>`).join('')}</ul>
      </div>
      <div class="info-card info-card--accent" id="gift-cards">
        <span class="info-card__icon">${icon('gift')}</span>
        <h2>Gift cards</h2>
        <p>Any amount from $25. Buy one by phone or in person; it never expires and works on every rental.</p>
      </div>
    </div>
  </div>
</section>`,
});

// ---------- client data + assets ----------
const clientData = {
  store,
  categories: categories.map(({ id, name }) => ({ id, name })),
  addons,
  zones: zones.map(({ city, zip, miles }) => ({ city, zip, miles })),
  packages: packages.map((pk) => ({ ...pk, regular: packageMath(pk).regular })),
  products: products.map((p) => ({
    id: p.id, name: p.name, category: p.category, kind: p.kind, image: p.image, url: productUrl(p),
    prices: p.prices || null, price: p.price || null, unit: p.unit || null, wet: Boolean(p.wet), addons: p.addons, popular: p.popular,
  })),
  durations: DURATIONS,
};
mkdirSync(join(DIST, 'assets/js'), { recursive: true });
mkdirSync(join(DIST, 'assets/css'), { recursive: true });
mkdirSync(join(DIST, 'assets/img'), { recursive: true });
writeFileSync(join(DIST, 'assets/js/data.js'), `window.CRP_DATA=${JSON.stringify(clientData)};\n`);
cpSync(join(ROOT, 'assets/js/app.js'), join(DIST, 'assets/js/app.js'));
cpSync(join(ROOT, 'assets/css/tokens.css'), join(DIST, 'assets/css/tokens.css'));
cpSync(join(ROOT, 'assets/css/main.css'), join(DIST, 'assets/css/main.css'));
// Images: copy, re-encoding any file over its byte budget (hero under 200 KB, per the blueprint).
const BUDGET = { 2000: 190000, 1200: 150000, 1000: 85000, 900: 130000, 600: 55000, 450: 45000 };
const CACHE = join(ROOT, '.imgcache');
mkdirSync(CACHE, { recursive: true });
let squeezed = 0;
for (const f of readdirSync(join(ROOT, 'assets/img'))) {
  if (!f.endsWith('.webp')) continue;
  const src = join(ROOT, 'assets/img', f);
  const out = join(DIST, 'assets/img', f);
  const budget = BUDGET[Number(f.match(/-(\d+)\.webp$/)?.[1])] || 150000;
  if (statSync(src).size <= budget) { cpSync(src, out); continue; }
  const cached = join(CACHE, `${f}.${statSync(src).size}.${budget}.webp`);
  try {
    if (!existsSync(cached)) execFileSync('cwebp', ['-quiet', '-m', '6', '-pass', '6', '-size', String(budget), src, '-o', cached]);
    cpSync(cached, out);
    squeezed++;
  } catch {
    cpSync(src, out); // cwebp not installed: ship the original
  }
}
console.log(`Images: ${squeezed} re-encoded to fit their budget`);

// The artifact host wraps its entry page in its own document skeleton, so the
// published entry is index.html minus doctype/html/head/body and the two metas.
const home = readFileSync(join(DIST, 'index.html'), 'utf8');
const entry = home
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
writeFileSync(join(PUBLISH, 'index.html'), entry);

const pages = readdirSync(DIST).filter((f) => f.endsWith('.html'));
console.log(`Built ${pages.length} pages into dist/`);
