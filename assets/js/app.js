/* Confetti Party Rentals demo: behaviour layer.
   Pages are complete static HTML; this script adds the date picker, availability,
   cart, filters, checkout and form handling. State lives in localStorage. */
(() => {
  'use strict';
  const D = window.CRP_DATA;
  if (!D) return;
  const S = D.store;

  // ---------- utilities ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = (n, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${n}"></use></svg>`;
  const emit = (name) => document.dispatchEvent(new CustomEvent(name));

  const mem = {};
  const store = {
    get(k, fb) { try { const v = localStorage.getItem('crp:' + k); return v ? JSON.parse(v) : fb; } catch { return k in mem ? mem[k] : fb; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('crp:' + k, JSON.stringify(v)); } catch { /* storage blocked: keep in memory */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem('crp:' + k); } catch { /* ignore */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem('crp:' + k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem('crp:' + k, v); } catch { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem('crp:' + k); } catch { /* ignore */ } },
  };

  // ---------- dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmt = (s, o) => parse(s).toLocaleDateString('en-US', o);
  const fmtShort = (s) => fmt(s, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtLong = (s) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtFull = (s) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeLabel = (t) => { const h = Number(t.slice(0, 2)); return `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`; };

  // ---------- data lookups ----------
  const P = Object.fromEntries(D.products.map((p) => [p.id, p]));
  const PK = Object.fromEntries(D.packages.map((p) => [p.id, p]));
  const catName = (id) => D.categories.find((c) => c.id === id)?.name || '';
  const isLadder = (p) => Boolean(p.prices);
  const unitPrice = (p, d) => (isLadder(p) ? p.prices[d || 'h4'] : p.price);
  const zoneFor = (zip) => D.zones.find((z) => z.zip === zip);
  const feeFor = (z) => (z.miles <= S.freeMiles ? 0 : (z.miles - S.freeMiles) * S.perMile);
  const depositFor = (t) => Math.min(t, Math.max(S.deposit.min, Math.round(t * S.deposit.pct)));
  const zoneText = (zip) => {
    const z = zoneFor(zip);
    if (!z) return `ZIP ${zip}`;
    const fee = feeFor(z);
    return `${z.city} · ${fee ? money(fee) + ' delivery' : 'free delivery'}`;
  };

  // Deterministic demo availability: the same item and date always give the same answer.
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function isBooked(id, date) {
    const p = P[id];
    if (!p || !date || p.kind === 'table') return false;
    const day = parse(date).getDay();
    const limit = day === 6 ? 32 : day === 0 ? 20 : 10;
    return hash(id + '|' + date) % 100 < limit;
  }

  // ---------- event (date, time, ZIP) ----------
  function getEvent() {
    const ev = store.get('event', null);
    if (!ev || !ev.date) return null;
    if (parse(ev.date) < today()) { store.del('event'); return null; }
    return ev;
  }
  function setEvent(ev) { store.set('event', ev); emit('crp:event'); }

  // ---------- cart ----------
  const getCart = () => store.get('cart', []);
  const setCart = (c) => { store.set('cart', c); emit('crp:cart'); };
  const getMeta = () => ({ fulfil: 'delivery', surface: 'grass', eventType: 'family', zip: '', ...store.get('meta', {}) });
  const setMeta = (patch) => { store.set('meta', { ...getMeta(), ...patch }); emit('crp:cart'); };

  function lineTotal(l) {
    if (l.type === 'package') return PK[l.id].price * (l.qty || 1);
    const p = P[l.id];
    const qty = l.qty || 1;
    let t = unitPrice(p, l.duration) * qty;
    for (const a of l.addons || []) { const ad = D.addons[a]; if (ad) t += ad.perUnit ? ad.price * qty : ad.price; }
    return t;
  }
  const lineIds = (l) => (l.type === 'package' ? PK[l.id].items.map((i) => i.id) : [l.id]);
  const lineBooked = (l, date) => lineIds(l).some((id) => isBooked(id, date));
  const lineName = (l) => (l.type === 'package' ? `${PK[l.id].name} package` : P[l.id].name);
  const lineImage = (l) => (l.type === 'package' ? PK[l.id].image : P[l.id].image);
  const lineUrl = (l) => (l.type === 'package' ? `packages.html#${l.id}` : P[l.id].url);
  function lineDetail(l) {
    if (l.type === 'package') return PK[l.id].items.map((i) => `${i.qty > 1 ? i.qty + ' × ' : ''}${P[i.id].name}`).join(', ');
    const p = P[l.id];
    if (isLadder(p)) return D.durations[l.duration || 'h4'] + (l.qty > 1 ? ` · ${l.qty} units` : '');
    return `${l.qty} × ${money(p.price)}`;
  }
  function anchorUnits(cart) {
    let n = 0;
    for (const l of cart) {
      if (l.type === 'package') { for (const i of PK[l.id].items) if (['inflatable', 'tent'].includes(P[i.id].kind)) n += i.qty; }
      else if (['inflatable', 'tent'].includes(P[l.id].kind) && !(l.addons || []).includes('sandbags')) n += l.qty || 1;
    }
    return n;
  }
  const pickupAllowed = (cart) => cart.every((l) => l.type === 'product' && ['table', 'game'].includes(P[l.id].kind));

  function totals(cart = getCart(), ev = getEvent(), meta = getMeta()) {
    const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
    const zip = ev?.zip || meta.zip || '';
    const fulfil = meta.fulfil === 'pickup' && pickupAllowed(cart) ? 'pickup' : 'delivery';
    let delivery = 0, deliveryState = 'free';
    const zone = zoneFor(zip);
    if (fulfil === 'pickup') deliveryState = 'pickup';
    else if (!/^\d{5}$/.test(zip)) deliveryState = 'nozip';
    else if (!zone) deliveryState = 'outside';
    else { delivery = feeFor(zone); deliveryState = delivery ? 'fee' : 'free'; }
    const sandbags = fulfil === 'delivery' && meta.surface === 'hard' ? anchorUnits(cart) * S.sandbagFee : 0;
    const total = subtotal + delivery + sandbags;
    const deposit = depositFor(total);
    const reasons = [];
    if (total > S.quoteThreshold) reasons.push(`Orders over ${money(S.quoteThreshold)} get a custom quote, usually with a better price.`);
    if (['school', 'church', 'company'].includes(meta.eventType)) reasons.push('School, church and company events get a custom quote and a certificate of insurance.');
    if (deliveryState === 'outside') reasons.push(`ZIP ${zip} is outside our listed towns, so we'll quote delivery.`);
    const booked = ev ? cart.filter((l) => lineBooked(l, ev.date)) : [];
    return { subtotal, zip, zone, fulfil, delivery, deliveryState, sandbags, total, deposit, balance: total - deposit, balanceDue: ev ? addDays(ev.date, -S.balanceDaysBefore) : null, reasons, booked };
  }

  const lineKey = (l) => [l.type, l.id, l.duration || '', (l.addons || []).slice().sort().join('+')].join('|');
  function addLine(line) {
    const cart = getCart();
    line.key = lineKey(line);
    const found = cart.find((l) => l.key === line.key);
    if (found) found.qty = (found.qty || 1) + (line.qty || 1);
    else cart.push(line);
    setCart(cart);
    return line.key;
  }
  const updateLine = (key, patch) => {
    const cart = getCart().map((l) => (l.key === key ? { ...l, ...patch } : l)).map((l) => ({ ...l, key: lineKey(l) }));
    // merge lines that now share a key
    const merged = [];
    for (const l of cart) { const m = merged.find((x) => x.key === l.key); if (m) m.qty += l.qty; else merged.push(l); }
    setCart(merged);
  };
  const removeLine = (key) => setCart(getCart().filter((l) => l.key !== key));

  let pendingAction = null;
  function addProduct(id, opts = {}) {
    const p = P[id];
    const ev = getEvent();
    if (!ev) {
      pendingAction = () => addProduct(id, opts);
      openAvailability(`Pick your date first so we can check the ${p.name}.`);
      return;
    }
    if (isBooked(id, ev.date)) {
      toast(`${p.name} is booked on ${fmtShort(ev.date)}.`, { type: 'error', link: { href: p.url, label: 'See similar' } });
      return;
    }
    const key = addLine({ type: 'product', id, duration: isLadder(p) ? opts.duration || 'h4' : null, qty: opts.qty || 1, addons: opts.addons || [] });
    openDrawer(key);
  }
  function addPackage(id) {
    const pk = PK[id];
    const ev = getEvent();
    if (!ev) {
      pendingAction = () => addPackage(id);
      openAvailability(`Pick your date first so we can check every item in ${pk.name}.`);
      return;
    }
    const clash = pk.items.find((i) => isBooked(i.id, ev.date));
    if (clash) {
      toast(`${P[clash.id].name} in this package is booked on ${fmtShort(ev.date)}. Try another date.`, { type: 'error' });
      return;
    }
    const key = addLine({ type: 'package', id, qty: 1 });
    openDrawer(key);
  }

  // ---------- toasts ----------
  function toast(msg, { type = 'ok', link } = {}) {
    const box = $('[data-toasts]');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    t.innerHTML = `${icon(type === 'error' ? 'circle-x' : 'circle-check-big')}<span>${esc(msg)}</span>${link ? `<a href="${esc(link.href)}">${esc(link.label)}</a>` : ''}`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 260); }, 4600);
  }

  // ---------- focus handling for dialogs ----------
  const focusables = (el) => $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', el).filter((x) => x.offsetParent !== null || x === document.activeElement);
  function trapTab(e, el) {
    if (e.key !== 'Tab') return;
    const f = focusables(el);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------- calendar ----------
  function Calendar(host, { value, onSelect, onDblSelect } = {}) {
    const min = today();
    let selected = value || null;
    let view = selected ? parse(selected) : new Date(min);
    view.setDate(1);
    let focusDate = selected || iso(min);
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function render(focus = false) {
      const y = view.getFullYear(), m = view.getMonth();
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      const atMin = y === min.getFullYear() && m === min.getMonth();
      const cells = [];
      for (let i = 0; i < first; i++) cells.push('<span></span>');
      for (let d = 1; d <= days; d++) {
        const ds = iso(new Date(y, m, d));
        const dt = parse(ds);
        const past = dt < min;
        const wd = dt.getDay();
        const cls = ['cal__day', wd === 0 || wd === 6 ? 'is-weekend' : '', ds === iso(min) ? 'is-today' : '', ds === selected ? 'is-selected' : ''].filter(Boolean).join(' ');
        cells.push(`<button type="button" class="${cls}" data-day="${ds}" tabindex="${ds === focusDate ? 0 : -1}" aria-pressed="${ds === selected}" aria-label="${fmtFull(ds)}${ds === iso(min) ? ', today' : ''}"${past ? ' disabled' : ''}>${d}</button>`);
      }
      host.innerHTML = `<div class="cal">
  <div class="cal__head"><p class="cal__title" aria-live="polite">${view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
  <div class="cal__nav"><button type="button" class="icon-btn" data-cal="-1" aria-label="Previous month"${atMin ? ' disabled' : ''}>${icon('chevron-left')}</button><button type="button" class="icon-btn" data-cal="1" aria-label="Next month">${icon('chevron-right')}</button></div></div>
  <div class="cal__grid" role="group" aria-label="Dates">${dows.map((d) => `<span class="cal__dow" aria-hidden="true">${d.slice(0, 2)}</span>`).join('')}${cells.join('')}</div>
  <p class="cal__legend"><span><i style="background:var(--accent)"></i>Today</span><span><i style="background:var(--primary)"></i>Weekends book first</span></p>
</div>`;
      if (focus) $(`[data-day="${focusDate}"]`, host)?.focus();
    }
    host.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-cal]');
      if (nav) { view.setMonth(view.getMonth() + Number(nav.dataset.cal)); const f = new Date(view); if (f < min) f.setTime(min.getTime()); focusDate = iso(f); render(); return; }
      const b = e.target.closest('[data-day]');
      if (b && !b.disabled) { selected = focusDate = b.dataset.day; render(true); onSelect?.(selected); }
    });
    host.addEventListener('keydown', (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = addDays(b.dataset.day, step);
      if (parse(next) < min) return;
      focusDate = next;
      const nd = parse(next);
      if (nd.getMonth() !== view.getMonth() || nd.getFullYear() !== view.getFullYear()) { view = new Date(nd.getFullYear(), nd.getMonth(), 1); }
      render(true);
    });
    render();
    return { get value() { return selected; }, set(v) { selected = v; focusDate = v || iso(min); view = v ? parse(v) : new Date(min); view.setDate(1); render(); }, focus() { render(true); } };
  }

  // Calendar in a popover, anchored to a button.
  let openPop = null;
  function openPopover(anchor, { value, onSelect }) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose a date');
    document.body.appendChild(pop);
    const cal = Calendar(pop, { value, onSelect: (v) => { onSelect(v); closePopover(true); } });
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
    pop.style.left = `${Math.max(16, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 16))}px`;
    anchor.setAttribute('aria-expanded', 'true');
    const onDoc = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
    const onKey = (e) => { if (e.key === 'Escape') closePopover(true); };
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    document.addEventListener('keydown', onKey);
    openPop = { pop, anchor, off: () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); } };
    cal.focus();
  }
  function closePopover(refocus) {
    if (!openPop) return;
    openPop.off();
    openPop.pop.remove();
    openPop.anchor.setAttribute('aria-expanded', 'false');
    if (refocus) openPop.anchor.focus();
    openPop = null;
  }

  // ---------- availability modal ----------
  const modal = $('#availability-modal');
  let modalCal = null, modalReturn = null;
  function zoneMessage(zip) {
    if (!zip) return `Try ${D.zones.slice(0, 3).map((z) => z.zip).join(', ')}.`;
    if (!/^\d{5}$/.test(zip)) return 'Enter all 5 digits.';
    const z = zoneFor(zip);
    if (!z) return "That ZIP isn't on our list. You can still book and we'll quote delivery.";
    return `${z.city}, ${z.miles} miles away · ${feeFor(z) ? money(feeFor(z)) + ' delivery' : 'free delivery'}`;
  }
  function openAvailability(message) {
    if (!modal) return;
    const ev = getEvent();
    modalReturn = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const err = $('[data-am-error]', modal);
    err.hidden = !message;
    err.textContent = message || '';
    err.style.color = message ? 'var(--ink)' : '';
    const picked = $('[data-am-picked]', modal);
    const setPicked = (v) => { picked.textContent = v ? fmtFull(v) : 'Pick a date on the calendar'; picked.classList.toggle('is-set', Boolean(v)); };
    modalCal = Calendar($('[data-calendar-inline]', modal), { value: ev?.date, onSelect: (v) => { setPicked(v); err.hidden = true; } });
    setPicked(ev?.date);
    if (ev) { $('#am-start').value = ev.start; $('#am-end').value = ev.end; }
    const zipEl = $('#am-zip');
    zipEl.value = ev?.zip || getMeta().zip || '';
    $('[data-zone-msg]', modal).textContent = zoneMessage(zipEl.value);
    modalCal.focus();
  }
  function closeAvailability() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    pendingAction = null;
    modalReturn?.focus?.();
  }
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close-modal]')) closeAvailability(); });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAvailability(); trapTab(e, $('.modal__panel', modal)); });
    $('#am-zip').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); $('[data-zone-msg]', modal).textContent = zoneMessage(e.target.value); });
    $('#am-start').addEventListener('change', () => {
      const s = Number($('#am-start').value.slice(0, 2)), en = $('#am-end');
      if (Number(en.value.slice(0, 2)) <= s) en.value = `${pad(Math.min(20, s + 4))}:00`;
    });
    $('[data-availability-form]', modal).addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('[data-am-error]', modal);
      err.style.color = '';
      const date = modalCal.value;
      const zip = $('#am-zip').value.trim();
      const start = $('#am-start').value, end = $('#am-end').value;
      let problem = '';
      if (!date) problem = 'Pick a date on the calendar.';
      else if (!/^\d{5}$/.test(zip)) problem = 'Enter a 5-digit ZIP code so we can price delivery.';
      else if (end <= start) problem = 'End time needs to be after the start time.';
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      setEvent({ date, start, end, zip });
      const action = pendingAction;
      pendingAction = null;
      modal.hidden = true;
      document.body.style.overflow = '';
      modalReturn?.focus?.();
      if (action) action();
      else toast(`Showing what's free on ${fmtShort(date)}.`);
    });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-availability]');
    if (t) { e.preventDefault(); openAvailability(); }
  });

  // ---------- header ----------
  const header = $('[data-header]');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const megaBtn = $('[data-mega]');
  const mega = $('#mega-rentals');
  if (megaBtn && mega) {
    let closeTimer;
    const setMega = (open) => { mega.hidden = !open; megaBtn.setAttribute('aria-expanded', String(open)); };
    megaBtn.addEventListener('click', () => setMega(mega.hidden));
    const li = megaBtn.closest('li');
    const hoverable = window.matchMedia('(hover: hover)');
    li.addEventListener('mouseenter', () => { if (hoverable.matches) { clearTimeout(closeTimer); setMega(true); } });
    li.addEventListener('mouseleave', () => { if (hoverable.matches) closeTimer = setTimeout(() => setMega(false), 180); });
    document.addEventListener('click', (e) => { if (!li.contains(e.target)) setMega(false); });
    li.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMega(false); megaBtn.focus(); } });
  }
  const menuBtn = $('[data-menu-toggle]');
  const mobileNav = $('#mobile-nav');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => {
      const open = mobileNav.hidden;
      mobileNav.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.innerHTML = `${icon(open ? 'x' : 'menu')}<span class="visually-hidden">Menu</span>`;
    });
  }

  function renderEventLabels() {
    const ev = getEvent();
    $$('[data-event-label]').forEach((el) => { el.textContent = ev ? fmtShort(ev.date) : 'Check Availability'; });
    $$('[data-datebar]').forEach((bar) => {
      bar.classList.toggle('is-set', Boolean(ev));
      $('[data-datebar-text]', bar).innerHTML = ev
        ? `Showing availability for ${esc(fmtLong(ev.date))} <span>· ${timeLabel(ev.start)} to ${timeLabel(ev.end)} · ${esc(zoneText(ev.zip))}</span>`
        : "Pick a date to see what's free that day";
      $('[data-datebar-btn]', bar).textContent = ev ? 'Change date' : 'Pick a date';
    });
  }
  function renderCartCount() {
    const n = getCart().reduce((s, l) => s + (l.type === 'product' && !isLadder(P[l.id]) ? 1 : l.qty || 1), 0);
    $$('[data-cart-count]').forEach((el) => {
      const was = el.textContent;
      el.textContent = n;
      el.hidden = n === 0;
      if (String(n) !== was && n > 0) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
    $$('[data-cart-link]').forEach((a) => a.setAttribute('aria-label', `Cart, ${n} ${n === 1 ? 'item' : 'items'}`));
  }

  // ---------- product cards ----------
  function renderCardAvailability() {
    const ev = getEvent();
    $$('[data-product-card]').forEach((card) => {
      const chip = $('[data-avail]', card);
      if (!chip) return;
      if (!ev) { chip.hidden = true; card.classList.remove('is-booked'); return; }
      const booked = isBooked(card.dataset.id, ev.date);
      chip.hidden = false;
      chip.textContent = `${booked ? 'Booked' : 'Free'} ${fmt(ev.date, { month: 'short', day: 'numeric' })}`;
      chip.classList.toggle('avail--booked', booked);
      card.classList.toggle('is-booked', booked);
    });
  }
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-to-cart]');
    if (add) { e.preventDefault(); addProduct(add.dataset.id); return; }
    const pk = e.target.closest('[data-add-package]');
    if (pk) { e.preventDefault(); addPackage(pk.dataset.addPackage); }
  });

  const cardHtml = (p) => `<article class="pcard" data-product-card data-id="${p.id}">
  <div class="pcard__media"><img src="assets/img/${p.image}-600.webp" alt="${esc(p.name)}" width="600" height="450" loading="lazy"><span class="avail" data-avail hidden></span></div>
  <div class="pcard__body"><p class="pcard__cat">${esc(catName(p.category))}</p><h3 class="pcard__title"><a href="${p.url}">${esc(p.name)}</a></h3>
  <div class="pcard__foot"><p class="price">${isLadder(p) ? `<span class="price__from">from</span> <strong>${money(p.prices.h4)}</strong> <span class="price__unit">/ 4 hrs</span>` : `<strong>${money(p.price)}</strong> <span class="price__unit">${p.unit === 'day' ? '/ day' : p.unit === 'set' ? '/ set' : 'each'}</span>`}</p>
  <button class="btn btn--soft btn--sm pcard__add" type="button" data-add-to-cart data-id="${p.id}">${icon('plus')}<span>Add to Cart</span></button></div></div>
</article>`;

  function renderRecent() {
    const wrap = $('[data-recent-wrap]');
    if (!wrap) return;
    const current = $('[data-pdp]')?.dataset.id;
    const ids = store.get('recent', []).filter((id) => id !== current && P[id]).slice(0, 4);
    wrap.hidden = ids.length === 0;
    $('[data-recent]', wrap).innerHTML = ids.map((id) => cardHtml(P[id])).join('');
  }

  // ---------- hero ----------
  const heroForm = $('[data-hero-form]');
  if (heroForm) {
    const ev = getEvent();
    let heroDate = ev?.date || null;
    const dateBtn = $('#hero-date');
    const label = $('[data-hero-date-label]');
    const err = $('[data-hero-error]');
    const setLabel = () => { label.textContent = heroDate ? fmtShort(heroDate) : 'Pick a date'; dateBtn.classList.toggle('is-set', Boolean(heroDate)); };
    if (ev) { $('#hero-time').value = ev.start; $('#hero-zip').value = ev.zip; }
    setLabel();
    dateBtn.addEventListener('click', () => openPopover(dateBtn, { value: heroDate, onSelect: (v) => { heroDate = v; setLabel(); err.hidden = true; } }));
    $('#hero-zip').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
    heroForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const zip = $('#hero-zip').value.trim();
      if (!heroDate) { err.textContent = 'Pick your event date first.'; err.hidden = false; openPopover(dateBtn, { value: null, onSelect: (v) => { heroDate = v; setLabel(); err.hidden = true; } }); return; }
      if (!/^\d{5}$/.test(zip)) { err.textContent = 'Enter a 5-digit ZIP code so we can price delivery.'; err.hidden = false; $('#hero-zip').focus(); return; }
      const start = $('#hero-time').value;
      setEvent({ date: heroDate, start, end: `${pad(Math.min(20, Number(start.slice(0, 2)) + 4))}:00`, zip });
      window.location.href = 'rentals.html';
    });
  }
  const weekend = $('[data-weekend-card]');
  if (weekend) {
    const t = today();
    const sat = new Date(t); sat.setDate(t.getDate() + ((6 - t.getDay() + 7) % 7));
    const s = iso(sat);
    const infl = D.products.filter((p) => p.kind === 'inflatable');
    const free = infl.filter((p) => !isBooked(p.id, s)).length;
    $('[data-weekend-count]', weekend).textContent = `${free} of ${infl.length}`;
    $('[data-weekend-date]', weekend).textContent = `${s === iso(t) ? 'today' : 'this Saturday'}, ${fmt(s, { month: 'short', day: 'numeric' })}`;
  }

  // ---------- catalog filters ----------
  const catalog = $('[data-catalog]');
  if (catalog) {
    const grid = $('[data-grid]', catalog);
    const form = $('[data-filters]', catalog);
    const panel = $('[data-filters-panel]', catalog);
    const cards = $$('[data-product-card]', grid);
    const buckets = { 'under-100': (v) => v < 100, '100-200': (v) => v >= 100 && v < 200, '200-300': (v) => v >= 200 && v < 300, '300-plus': (v) => v >= 300 };
    const matchers = {
      category: (c, v) => c.dataset.category === v,
      price: (c, v) => buckets[v](Number(c.dataset.price)),
      age: (c, v) => c.dataset.age === v,
      wet: (c, v) => c.dataset.wet === v,
    };
    $$('[data-count-for]', catalog).forEach((el) => {
      const [name, v] = el.dataset.countFor.split(':');
      el.textContent = cards.filter((c) => matchers[name](c, v)).length;
    });
    const avToggle = $('[data-available-toggle]', catalog);
    function apply() {
      const ev = getEvent();
      avToggle.disabled = !ev;
      if (!ev) avToggle.checked = false;
      const fd = new FormData(form);
      const sel = {};
      for (const name of Object.keys(matchers)) sel[name] = fd.getAll(name);
      const onlyFree = fd.get('available') === '1' && ev;
      let shown = 0, free = 0;
      for (const c of cards) {
        let ok = Object.entries(sel).every(([name, vals]) => !vals.length || vals.some((v) => matchers[name](c, v)));
        const booked = ev ? isBooked(c.dataset.id, ev.date) : false;
        if (onlyFree && booked) ok = false;
        c.hidden = !ok;
        if (ok) { shown++; if (ev && !booked) free++; }
      }
      const sort = $('[data-sort]', catalog).value;
      const key = { popular: (c) => Number(c.dataset.popular), 'price-asc': (c) => Number(c.dataset.price), 'price-desc': (c) => -Number(c.dataset.price), new: (c) => (c.dataset.new === '1' ? 0 : 1) * 100 + Number(c.dataset.popular) }[sort];
      cards.slice().sort((a, b) => key(a) - key(b)).forEach((c) => grid.appendChild(c));
      $('[data-result-count]', catalog).textContent = `${shown} ${shown === 1 ? 'rental' : 'rentals'}${ev ? ` · ${free} free on ${fmtShort(ev.date)}` : ''}`;
      $('[data-empty]', catalog).hidden = shown > 0;
    }
    form.addEventListener('change', apply);
    form.addEventListener('reset', () => setTimeout(apply, 0));
    $('[data-sort]', catalog).addEventListener('change', apply);
    $('[data-clear-filters-btn]', catalog)?.addEventListener('click', () => form.reset());
    const views = $$('[data-view]', catalog);
    const setView = (v) => { grid.classList.toggle('is-list', v === 'list'); views.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))); store.set('view', v); };
    views.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    setView(store.get('view', 'grid'));
    let backdrop = null;
    const closePanel = () => { panel.classList.remove('is-open'); backdrop?.remove(); backdrop = null; document.body.style.overflow = ''; $('[data-filters-open]', catalog)?.focus(); };
    $('[data-filters-open]', catalog)?.addEventListener('click', () => {
      panel.classList.add('is-open');
      backdrop = document.createElement('div');
      backdrop.className = 'filters-backdrop';
      backdrop.addEventListener('click', closePanel);
      document.body.appendChild(backdrop);
      document.body.style.overflow = 'hidden';
      $('[data-filters-close]', panel)?.focus();
    });
    $('[data-filters-close]', panel)?.addEventListener('click', closePanel);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel(); });
    document.addEventListener('crp:event', apply);
    apply();
  }

  // ---------- product page ----------
  const pdp = $('[data-pdp]');
  if (pdp) {
    const p = P[pdp.dataset.id];
    const form = $('[data-buybox]', pdp);
    const stage = $('[data-gallery-stage]', pdp);
    const fpStage = $('[data-gallery-fp]', pdp);
    $$('[data-thumb]', pdp).forEach((t) => t.addEventListener('click', () => {
      $$('[data-thumb]', pdp).forEach((x) => { x.classList.toggle('is-active', x === t); x.setAttribute('aria-pressed', String(x === t)); });
      if (t.dataset.thumb === 'fp') { fpStage.hidden = false; stage.hidden = true; return; }
      if (fpStage) fpStage.hidden = true;
      stage.hidden = false;
      const im = $('img', stage);
      im.srcset = t.dataset.srcset; im.src = t.dataset.src; im.alt = t.dataset.alt;
    }));
    const qtyEl = $('#pdp-qty', form);
    $$('[data-step]', form).forEach((b) => b.addEventListener('click', () => {
      const v = Math.min(Number(qtyEl.max), Math.max(1, (Number(qtyEl.value) || 1) + Number(b.dataset.step)));
      qtyEl.value = v;
      update();
    }));
    const choice = () => {
      const fd = new FormData(form);
      return { duration: fd.get('duration') || null, qty: isLadder(p) ? 1 : Math.max(1, Math.min(Number(qtyEl.max), Number(fd.get('qty')) || 1)), addons: fd.getAll('addon') };
    };
    function update() {
      const c = choice();
      const t = lineTotal({ type: 'product', id: p.id, ...c });
      $$('[data-total]').forEach((el) => { el.textContent = money(t); });
      const ev = getEvent();
      const dep = depositFor(t);
      $('[data-deposit-note]', form).textContent = ev
        ? `Reserve with ${money(dep)} today. The rest, ${money(t - dep)}, is due ${fmtShort(addDays(ev.date, -S.balanceDaysBefore))}.`
        : `Reserve with ${money(dep)} today. Balance due ${S.balanceDaysBefore} days before your event.`;
    }
    function renderAvail() {
      const ev = getEvent();
      const box = $('[data-availbox]', form);
      const sim = $('[data-similar]', form);
      const buy = $('[data-buy]', form);
      box.classList.remove('is-available', 'is-booked');
      sim.hidden = true;
      buy.removeAttribute('aria-disabled');
      if (!ev) return;
      $('[data-availbox-btn]', form).textContent = 'Change';
      if (isBooked(p.id, ev.date)) {
        box.classList.add('is-booked');
        box.querySelector('.availbox__icon').innerHTML = icon('circle-x');
        $('[data-availbox-title]', form).textContent = `Booked on ${fmtLong(ev.date)}`;
        $('[data-availbox-sub]', form).textContent = 'Pick another date, or try one of these. They are free that day.';
        buy.setAttribute('aria-disabled', 'true');
        const pool = D.products.filter((x) => x.id !== p.id && !isBooked(x.id, ev.date));
        const picks = [...pool.filter((x) => x.category === p.category), ...pool.filter((x) => x.category !== p.category && x.kind === p.kind), ...pool].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
        sim.innerHTML = `<p>Free on ${esc(fmtShort(ev.date))}</p>${picks.map((x) => `<a href="${x.url}"><img src="assets/img/${x.image}-600.webp" alt="" width="64" height="48" loading="lazy"><span>${esc(x.name)}</span><span>${isLadder(x) ? 'from ' + money(x.prices.h4) : money(x.price)}</span></a>`).join('')}`;
        sim.hidden = false;
      } else {
        box.classList.add('is-available');
        box.querySelector('.availbox__icon').innerHTML = icon('calendar-check');
        $('[data-availbox-title]', form).textContent = `Available on ${fmtLong(ev.date)}`;
        $('[data-availbox-sub]', form).textContent = `${timeLabel(ev.start)} to ${timeLabel(ev.end)} · ${zoneText(ev.zip)}`;
      }
    }
    form.addEventListener('change', update);
    qtyEl?.addEventListener('input', update);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('[data-buy]', form).getAttribute('aria-disabled') === 'true') { toast(`${p.name} is booked that day. Try a similar item or change the date.`, { type: 'error' }); return; }
      addProduct(p.id, choice());
    });
    $('[data-buy-proxy]')?.addEventListener('click', () => form.requestSubmit());
    $('[data-ask]', pdp)?.addEventListener('click', (e) => session.set('ask', e.currentTarget.dataset.ask));
    const sticky = $('[data-pdp-sticky]');
    if (sticky && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { sticky.hidden = en.isIntersecting || en.boundingClientRect.top > 0; }).observe($('.buybox__actions', form));
    }
    const recent = store.get('recent', []).filter((id) => id !== p.id);
    recent.unshift(p.id);
    store.set('recent', recent.slice(0, 8));
    document.addEventListener('crp:event', () => { renderAvail(); update(); });
    update();
    renderAvail();
  }

  // ---------- drawer ----------
  const drawer = $('#cart-drawer');
  let drawerReturn = null;
  function openDrawer(highlightKey) {
    if (!drawer) return;
    const cart = getCart();
    const ev = getEvent();
    const t = totals(cart, ev);
    $('[data-drawer-event]', drawer).innerHTML = ev ? `${icon('calendar-days')}<span><strong>${esc(fmtLong(ev.date))}</strong> · ${timeLabel(ev.start)} to ${timeLabel(ev.end)}</span>` : '';
    $('[data-drawer-lines]', drawer).innerHTML = cart.map((l) => `<li class="${l.key === highlightKey ? 'is-new' : ''}"><img src="assets/img/${lineImage(l)}-600.webp" alt="" width="72" height="54"><div><strong>${esc(lineName(l))}</strong><span>${esc(lineDetail(l))}</span></div><span class="dl-price">${money(lineTotal(l))}</span></li>`).join('');
    $('[data-drawer-subtotal]', drawer).textContent = money(t.subtotal);
    $('[data-drawer-deposit]', drawer).textContent = `Delivery and deposit are worked out in the cart. Deposit today: about ${money(depositFor(t.subtotal))}.`;
    drawerReturn = document.activeElement;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    $('[data-close-drawer].icon-btn', drawer).focus();
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.body.style.overflow = '';
    drawerReturn?.focus?.();
  }
  if (drawer) {
    drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close-drawer]')) closeDrawer(); });
    drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); trapTab(e, $('.drawer__panel', drawer)); });
  }

  // ---------- shared summary rendering ----------
  function summaryRows(t) {
    const deliveryCell = { free: 'Free', fee: money(t.delivery), pickup: 'Pickup, free', nozip: 'Add your ZIP', outside: "We'll quote it" }[t.deliveryState];
    return `<div><dt>Rentals</dt><dd>${money(t.subtotal)}</dd></div>
<div class="${t.deliveryState === 'free' || t.deliveryState === 'pickup' ? 'is-free' : ''}"><dt>Delivery${t.zone && t.fulfil === 'delivery' ? `, ${esc(t.zone.city)}` : ''}</dt><dd>${deliveryCell}</dd></div>
${t.sandbags ? `<div><dt>Sandbags, hard surface</dt><dd>${money(t.sandbags)}</dd></div>` : ''}
<div class="is-total"><dt>Total</dt><dd>${money(t.total)}</dd></div>`;
  }
  function dueBox(t) {
    return `<div class="is-big"><span>Deposit due today</span><strong>${money(t.deposit)}</strong></div>
<div><span>Balance${t.balanceDue ? `, charged ${esc(fmtShort(t.balanceDue))}` : ''}</span><strong>${money(t.balance)}</strong></div>`;
  }
  function eventBlock(ev) {
    return ev
      ? `<span class="cart-event__icon">${icon('calendar-days')}</span><p><strong>${esc(fmtFull(ev.date))}</strong>${timeLabel(ev.start)} to ${timeLabel(ev.end)} · ${esc(zoneText(ev.zip))}</p><button class="btn btn--ghost btn--sm" type="button" data-open-availability>Change</button>`
      : `<span class="cart-event__icon">${icon('calendar-days')}</span><p><strong>No date picked yet</strong>We need your date to check availability.</p><button class="btn btn--accent btn--sm" type="button" data-open-availability>Pick a date</button>`;
  }

  function sampleOrder() {
    // Next Saturday at least 10 days out where every sample item is free.
    const items = ['backyard-birthday', 'giant-connect-four', 'popup-canopy-10x10'];
    let d = today(); d.setDate(d.getDate() + 10);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    for (let i = 0; i < 30; i++) {
      const s = iso(d);
      const ids = [...PK['backyard-birthday'].items.map((x) => x.id), items[1], items[2]];
      if (!ids.some((id) => isBooked(id, s))) break;
      d.setDate(d.getDate() + 7);
    }
    setEvent({ date: iso(d), start: '12:00', end: '16:00', zip: D.zones[1].zip });
    store.set('meta', { fulfil: 'delivery', surface: 'grass', eventType: 'family', zip: D.zones[1].zip });
    const cart = [
      { type: 'package', id: 'backyard-birthday', qty: 1 },
      { type: 'product', id: 'giant-connect-four', duration: null, qty: 1, addons: [] },
      { type: 'product', id: 'popup-canopy-10x10', duration: null, qty: 1, addons: [] },
    ].map((l) => ({ ...l, key: lineKey(l) }));
    setCart(cart);
    toast('Sample order loaded. Change anything you like.');
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-sample-order]')) sampleOrder(); });

  // ---------- cart page ----------
  const cartPage = $('[data-cart-page]');
  function renderCartPage() {
    if (!cartPage) return;
    const cart = getCart();
    const ev = getEvent();
    const meta = getMeta();
    $('[data-cart-empty]', cartPage).hidden = cart.length > 0;
    $('[data-cart-full]', cartPage).hidden = cart.length === 0;
    if (!cart.length) return;
    const t = totals(cart, ev, meta);
    $('[data-cart-event]', cartPage).innerHTML = eventBlock(ev);
    $('[data-cart-lines]', cartPage).innerHTML = cart.map((l) => {
      const booked = ev && lineBooked(l, ev.date);
      let meta2 = '';
      if (l.type === 'package') meta2 = `<div class="cline__pkg">${PK[l.id].items.map((i) => `<span>${icon('check')} ${i.qty > 1 ? i.qty + ' × ' : ''}${esc(P[i.id].name)}${i.duration ? ', ' + D.durations[i.duration].toLowerCase() : ''}</span>`).join('')}</div>`;
      else {
        const p = P[l.id];
        meta2 = isLadder(p)
          ? `<div class="cline__meta"><label class="visually-hidden" for="d-${esc(l.key)}">Rental length</label><select id="d-${esc(l.key)}" data-line-duration="${esc(l.key)}">${Object.entries(D.durations).map(([k, lab]) => `<option value="${k}"${k === (l.duration || 'h4') ? ' selected' : ''}>${lab} · ${money(p.prices[k])}</option>`).join('')}</select></div>`
          : `<div class="cline__meta"><div class="stepper stepper--sm" role="group" aria-label="Quantity"><button type="button" class="icon-btn" data-line-step="-1" data-key="${esc(l.key)}" aria-label="Fewer">${icon('minus')}</button><input type="number" value="${l.qty}" min="1" max="300" data-line-qty="${esc(l.key)}" aria-label="Quantity"><button type="button" class="icon-btn" data-line-step="1" data-key="${esc(l.key)}" aria-label="More">${icon('plus')}</button></div><span>${money(p.price)} ${p.unit === 'day' ? 'per day' : p.unit === 'set' ? 'per set' : 'each'}</span></div>`;
        if (l.addons?.length) meta2 += `<p class="cline__addons">Add-ons: ${l.addons.map((a) => esc(D.addons[a].label)).join(', ')}</p>`;
      }
      const status = ev ? (booked ? `<p class="cline__warn">${icon('circle-x')} Booked on ${esc(fmtShort(ev.date))}. Remove it or change your date.</p>` : `<span class="cline__ok">${icon('check')} Free on ${esc(fmtShort(ev.date))}</span>`) : '';
      return `<li class="cline"><img class="cline__img" src="assets/img/${lineImage(l)}-600.webp" alt="" width="96" height="72"><div class="cline__main"><div class="cline__top"><a class="cline__name" href="${lineUrl(l)}">${esc(lineName(l))}</a><span class="cline__price">${money(lineTotal(l))}</span></div>${meta2}<div class="cline__meta">${status}<button type="button" class="cline__remove" data-remove="${esc(l.key)}">${icon('trash-2')} Remove</button></div></div></li>`;
    }).join('');
    // options
    const canPickup = pickupAllowed(cart);
    const pickupInput = $('input[name="fulfil"][value="pickup"]', cartPage);
    pickupInput.disabled = !canPickup;
    $(`input[name="fulfil"][value="${t.fulfil}"]`, cartPage).checked = true;
    $('[data-delivery-fields]', cartPage).hidden = t.fulfil === 'pickup';
    $(`input[name="surface"][value="${meta.surface}"]`, cartPage).checked = true;
    $('#cart-event-type').value = meta.eventType;
    const zipEl = $('[data-cart-zip]', cartPage);
    if (document.activeElement !== zipEl) zipEl.value = t.zip;
    $('[data-cart-zone]', cartPage).textContent = zoneMessage(zipEl.value);
    // summary
    $('[data-summary-rows]', cartPage).innerHTML = summaryRows(t);
    $('[data-summary-due]', cartPage).innerHTML = dueBox(t);
    const cta = $('[data-summary-cta]', cartPage);
    const reason = $('[data-summary-reason]', cartPage);
    reason.hidden = true;
    cta.removeAttribute('aria-disabled');
    cta.removeAttribute('data-open-availability');
    if (!ev) { cta.textContent = 'Pick a date to continue'; cta.setAttribute('data-open-availability', ''); cta.href = '#'; }
    else if (t.booked.length) { cta.textContent = 'Remove booked items to continue'; cta.setAttribute('aria-disabled', 'true'); cta.href = '#'; }
    else if (t.deliveryState === 'nozip') { cta.textContent = 'Add your ZIP to continue'; cta.setAttribute('aria-disabled', 'true'); cta.href = '#'; }
    else if (t.reasons.length) { cta.textContent = 'Request a quote'; cta.href = 'quote.html'; reason.textContent = t.reasons[0]; reason.hidden = false; }
    else { cta.textContent = `Continue to checkout · ${money(t.deposit)} today`; cta.href = 'checkout.html'; }
  }
  if (cartPage) {
    cartPage.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('[data-line-duration]')) updateLine(el.dataset.lineDuration, { duration: el.value });
      else if (el.matches('[data-line-qty]')) updateLine(el.dataset.lineQty, { qty: Math.max(1, Math.min(300, Number(el.value) || 1)) });
      else if (el.name === 'fulfil') setMeta({ fulfil: el.value });
      else if (el.name === 'surface') setMeta({ surface: el.value });
      else if (el.name === 'eventType') setMeta({ eventType: el.value });
    });
    cartPage.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) { const name = lineName(getCart().find((l) => l.key === rm.dataset.remove)); removeLine(rm.dataset.remove); toast(`Removed ${name}.`); return; }
      const st = e.target.closest('[data-line-step]');
      if (st) { const l = getCart().find((x) => x.key === st.dataset.key); updateLine(l.key, { qty: Math.max(1, Math.min(300, l.qty + Number(st.dataset.lineStep))) }); return; }
      const cta = e.target.closest('[data-summary-cta][aria-disabled="true"]');
      if (cta) e.preventDefault();
    });
    $('[data-cart-zip]', cartPage).addEventListener('input', (e) => {
      const zip = e.target.value.replace(/\D/g, '').slice(0, 5);
      e.target.value = zip;
      $('[data-cart-zone]', cartPage).textContent = zoneMessage(zip);
      if (zip.length === 5 || zip.length === 0) {
        const ev = getEvent();
        store.set('meta', { ...getMeta(), zip });
        if (ev) setEvent({ ...ev, zip }); else emit('crp:cart');
      }
    });
  }

  // ---------- checkout ----------
  const checkout = $('[data-checkout]');
  function renderCheckoutSummary() {
    if (!checkout) return;
    const cart = getCart();
    const ev = getEvent();
    const t = totals(cart, ev);
    $('[data-co-event]', checkout).innerHTML = ev ? `<strong>${esc(fmtFull(ev.date))}</strong>${timeLabel(ev.start)} to ${timeLabel(ev.end)} · ${esc(zoneText(ev.zip))}` : '<strong>No date picked</strong><a href="#" data-open-availability>Pick a date</a>';
    $('[data-co-lines]', checkout).innerHTML = cart.map((l) => `<li><img src="assets/img/${lineImage(l)}-600.webp" alt="" width="52" height="40"><div>${esc(lineName(l))}<span>${esc(lineDetail(l))}</span></div><b>${money(lineTotal(l))}</b></li>`).join('');
    $('[data-summary-rows]', checkout).innerHTML = summaryRows(t);
    $('[data-summary-due]', checkout).innerHTML = dueBox(t);
    $('[data-pay-breakdown]', checkout).innerHTML = `<dl><div class="is-big"><dt>Deposit due today</dt><dd>${money(t.deposit)}</dd></div><div><dt>Balance${t.balanceDue ? `, charged ${esc(fmtShort(t.balanceDue))}` : ''}</dt><dd>${money(t.balance)}</dd></div><div><dt>Order total</dt><dd>${money(t.total)}</dd></div></dl>`;
    $('[data-pay-btn] span', checkout).textContent = `Pay ${money(t.deposit)} deposit`;
    return t;
  }
  if (checkout) {
    const cart = getCart();
    $('[data-checkout-empty]', checkout).hidden = cart.length > 0;
    $('[data-checkout-full]', checkout).hidden = cart.length === 0;
    document.addEventListener('crp:cart', () => { if (getCart().length) window.location.reload(); });
    if (cart.length) {
      const t = renderCheckoutSummary();
      const steps = $$('.co-step', checkout);
      const prog = $$('[data-progress] li', checkout);
      const saved = store.get('details', {});
      const f1 = steps[0];
      for (const [k, v] of Object.entries(saved)) { const el = f1.elements[k]; if (el && !el.value) el.value = v; }
      const ev = getEvent();
      if (ev && !f1.elements.zip.value) f1.elements.zip.value = ev.zip;
      if (ev && !f1.elements.city.value && zoneFor(ev.zip)) f1.elements.city.value = zoneFor(ev.zip).city;
      if (t.reasons.length) {
        f1.insertAdjacentHTML('afterbegin', `<div class="summary__reason">${esc(t.reasons[0])} <a href="quote.html">Request a quote instead</a>.</div>`);
      }
      const go = (n) => {
        steps.forEach((s, i) => { s.hidden = i !== n; });
        prog.forEach((li, i) => { li.classList.toggle('is-current', i === n); li.classList.toggle('is-done', i < n); $('span', li).innerHTML = i < n ? icon('check') : String(i + 1); });
        const h = $('h2', steps[n]); h.tabIndex = -1; h.focus({ preventScroll: true });
        steps[n].scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      const fail = (form, msg, el) => { const e = $('[data-form-error]', form); e.textContent = msg; e.hidden = false; if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); } };
      f1.addEventListener('submit', (e) => {
        e.preventDefault();
        $$('[aria-invalid]', f1).forEach((x) => x.removeAttribute('aria-invalid'));
        $('[data-form-error]', f1).hidden = true;
        const el = f1.elements;
        if (!getEvent()) return fail(f1, 'Pick your event date first.', null);
        if (!el.name.value.trim()) return fail(f1, 'Enter your full name.', el.name);
        if ((el.phone.value.match(/\d/g) || []).length < 10) return fail(f1, 'Enter a 10-digit mobile number so the crew can text you.', el.phone);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.email.value.trim())) return fail(f1, 'Enter an email address like name@example.com.', el.email);
        if (!el.street.value.trim()) return fail(f1, 'Enter the street address where we set up.', el.street);
        if (!el.city.value.trim()) return fail(f1, 'Enter the town.', el.city);
        if (!/^\d{5}$/.test(el.zip.value.trim())) return fail(f1, 'Enter a 5-digit ZIP code.', el.zip);
        store.set('details', { name: el.name.value.trim(), phone: el.phone.value.trim(), email: el.email.value.trim(), street: el.street.value.trim(), city: el.city.value.trim(), zip: el.zip.value.trim(), notes: el.notes.value.trim() });
        go(1);
      });
      const f2 = steps[1];
      f2.addEventListener('submit', (e) => {
        e.preventDefault();
        $('[data-form-error]', f2).hidden = true;
        const name = store.get('details', {}).name || '';
        if (!f2.elements.agree.checked) return fail(f2, 'Tick the box to confirm you read the agreement.', f2.elements.agree);
        if (f2.elements.sign.value.trim().toLowerCase() !== name.toLowerCase()) return fail(f2, `Type your name exactly as entered: ${name}.`, f2.elements.sign);
        go(2);
      });
      const f3 = steps[2];
      f3.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = $('[data-pay-btn]', f3);
        btn.disabled = true;
        $('span', btn).textContent = 'Processing…';
        setTimeout(() => {
          const ev2 = getEvent();
          const cart2 = getCart();
          const t2 = totals(cart2, ev2);
          const d = store.get('details', {});
          const num = `CPR-${ev2.date.slice(2).replace(/-/g, '')}-${String(1000 + (hash(d.email + ev2.date + Date.now()) % 9000))}`;
          store.set('order', { number: num, event: ev2, details: d, meta: getMeta(), lines: cart2.map((l) => ({ name: lineName(l), detail: lineDetail(l), image: lineImage(l), total: lineTotal(l) })), totals: t2 });
          store.set('cart', []);
          window.location.href = 'confirmation.html';
        }, 900);
      });
      $$('[data-back]', checkout).forEach((b) => b.addEventListener('click', () => go(steps.indexOf(b.closest('.co-step')) - 1)));
      if (t.reasons.length) f1.querySelector('button[type="submit"]').textContent = 'Continue anyway';
    }
  }

  // ---------- confirmation ----------
  const confirmEl = $('[data-confirm]');
  if (confirmEl) {
    const o = store.get('order', null);
    $('[data-confirm-empty]', confirmEl).hidden = Boolean(o);
    $('[data-confirm-full]', confirmEl).hidden = !o;
    if (o) {
      const ev = o.event, t = o.totals, d = o.details;
      $('[data-cf-date]', confirmEl).textContent = fmtLong(ev.date);
      $('[data-cf-number]', confirmEl).textContent = o.number;
      $('[data-cf-email]', confirmEl).textContent = d.email;
      const ymd = ev.date.replace(/-/g, '');
      const gcal = new URL('https://calendar.google.com/calendar/render');
      gcal.searchParams.set('action', 'TEMPLATE');
      gcal.searchParams.set('text', `Party rentals from ${S.name}`);
      gcal.searchParams.set('dates', `${ymd}T${ev.start.replace(':', '')}00/${ymd}T${ev.end.replace(':', '')}00`);
      gcal.searchParams.set('details', `Order ${o.number}. Delivery ${S.deliveryWindow}, pickup by ${S.pickupBy}. Questions: ${S.phone}`);
      gcal.searchParams.set('location', `${d.street}, ${d.city} ${d.zip}`);
      $('[data-cf-gcal]', confirmEl).href = gcal.toString();
      const kv = (rows) => rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
      $('[data-cf-delivery]', confirmEl).innerHTML = kv([
        ['Address', `${d.street}, ${d.city} ${d.zip}`],
        ['Party', `${fmtShort(ev.date)}, ${timeLabel(ev.start)} to ${timeLabel(ev.end)}`],
        [t.fulfil === 'pickup' ? 'Pickup from warehouse' : 'Delivery window', t.fulfil === 'pickup' ? S.address : `${fmtShort(ev.date)}, ${S.deliveryWindow}`],
        ['Pickup by', `${S.pickupBy} the same day`],
        ['Surface', o.meta.surface === 'hard' ? 'Hard surface, sandbags' : 'Grass, stakes'],
      ]);
      $('[data-cf-pay]', confirmEl).innerHTML = kv([
        ['Paid today', money(t.deposit)],
        ['Balance', money(t.balance)],
        ['Balance charged', t.balanceDue ? fmtShort(t.balanceDue) : '2 days before'],
        ['Order total', money(t.total)],
      ]);
      $('[data-cf-lines]', confirmEl).innerHTML = o.lines.map((l) => `<li><img src="assets/img/${l.image}-600.webp" alt="" width="52" height="40"><div>${esc(l.name)}<span>${esc(l.detail)}</span></div><b>${money(l.total)}</b></li>`).join('');
    }
  }

  // ---------- quote ----------
  const quote = $('[data-quote]');
  if (quote) {
    const form = $('[data-quote-form]', quote);
    const ev = getEvent();
    const meta = getMeta();
    const details = store.get('details', {});
    const dates = { date: ev?.date || null, backup: null };
    if (details.name) form.elements.name.value = details.name;
    if (details.email) form.elements.email.value = details.email;
    if (details.phone) form.elements.phone.value = details.phone;
    if (['school', 'church', 'company', 'wedding', 'family', 'other'].includes(meta.eventType)) form.elements.type.value = meta.eventType;
    const cart = getCart();
    if (cart.length) $('[data-quote-items]', quote).innerHTML = cart.map((l) => `<li><span>${esc(lineName(l))} · ${esc(lineDetail(l))}</span><strong>${money(lineTotal(l))}</strong></li>`).join('');
    $$('[data-date-field]', quote).forEach((btn) => {
      const key = btn.dataset.dateField;
      const show = () => { $('span', btn).textContent = dates[key] ? fmtFull(dates[key]) : 'Pick a date'; btn.classList.toggle('is-set', Boolean(dates[key])); };
      show();
      btn.addEventListener('click', () => openPopover(btn, { value: dates[key], onSelect: (v) => { dates[key] = v; show(); } }));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const el = form.elements;
      const err = $('[data-form-error]', form);
      $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
      const fail = (msg, x) => { err.textContent = msg; err.hidden = false; if (x) { x.setAttribute('aria-invalid', 'true'); x.focus(); } };
      if (!el.name.value.trim()) return fail('Enter your name.', el.name);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.email.value.trim())) return fail('Enter an email address like name@example.com.', el.email);
      if ((el.phone.value.match(/\d/g) || []).length < 10) return fail('Enter a 10-digit phone number.', el.phone);
      if (!(Number(el.guests.value) > 0)) return fail('Enter your guest count.', el.guests);
      if (!dates.date) return fail('Pick your event date.', $('#q-date'));
      err.hidden = true;
      $('[data-quote-name]', quote).textContent = el.name.value.trim().split(' ')[0];
      $('[data-quote-email]', quote).textContent = el.email.value.trim();
      form.hidden = true;
      $('.quote-aside', quote).hidden = true;
      $('[data-quote-done]', quote).hidden = false;
      $('[data-quote-done] h2', quote).tabIndex = -1;
      $('[data-quote-done] h2', quote).focus();
    });
  }

  // ---------- contact ----------
  const contact = $('[data-contact-form]');
  if (contact) {
    const ask = session.get('ask');
    if (ask) { contact.elements.message.value = `Question about the ${ask}: `; session.del('ask'); }
    contact.addEventListener('submit', (e) => {
      e.preventDefault();
      const el = contact.elements;
      const err = $('[data-form-error]', contact);
      $$('[aria-invalid]', contact).forEach((x) => x.removeAttribute('aria-invalid'));
      const fail = (msg, x) => { err.textContent = msg; err.hidden = false; x.setAttribute('aria-invalid', 'true'); x.focus(); };
      if (!el.name.value.trim()) return fail('Enter your name.', el.name);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.email.value.trim())) return fail('Enter an email address like name@example.com.', el.email);
      if (el.message.value.trim().length < 5) return fail('Write a short message so we know how to help.', el.message);
      err.hidden = true;
      $('[data-form-done]', contact).hidden = false;
      contact.querySelector('button[type="submit"]').disabled = true;
    });
  }
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const text = b.dataset.copy;
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($('[data-copy-text]')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Number selected. Press Ctrl+C or Cmd+C to copy.'); };
    try { navigator.clipboard.writeText(text).then(() => toast('Phone number copied.'), fallback); } catch { fallback(); }
  }));

  // ---------- accordions ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accordion]');
    if (!b) return;
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    document.getElementById(b.getAttribute('aria-controls')).hidden = !open;
  });

  // ---------- wire up ----------
  const renderAll = () => { renderEventLabels(); renderCartCount(); renderCardAvailability(); renderCartPage(); renderCheckoutSummary(); };
  document.addEventListener('crp:event', renderAll);
  document.addEventListener('crp:cart', () => { renderCartCount(); renderCartPage(); });
  window.addEventListener('storage', renderAll);
  renderAll();
  renderRecent();
})();
