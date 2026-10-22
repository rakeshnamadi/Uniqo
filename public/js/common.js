/* UNIQO - shared storefront helpers */
const UQ = (() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const session = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  async function api(url, opts = {}) {
    const init = { method: opts.method || "GET", headers: {} };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch(url, init); } catch { throw new Error("You seem to be offline. Please check your connection."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || "Something went wrong"); e.status = res.status; throw e; }
    return data;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let currency = "₹";
  const money = (n) => currency + Number(n || 0).toLocaleString("en-IN");
  const pad = (n) => String(n).padStart(2, "0");
  function timeAgo(sec) {
    if (sec < 60) return "just now";
    const m = Math.floor(sec / 60); if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
    const d = Math.floor(h / 24); return `${d} day${d > 1 ? "s" : ""} ago`;
  }

  function clientId() {
    let id = store.get("uq_cid");
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); store.set("uq_cid", id); }
    return id;
  }

  let toastTimer;
  function toast(msg, err = false) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle("err", err); t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  const icons = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    arrowL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
    arrowR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wa: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
  };

  /* ---------------- site config & city ---------------- */
  let site = null;
  async function loadSite() {
    if (site) return site;
    site = await api("/api/site");
    currency = site.currency || currency;
    return site;
  }
  function city() {
    const c = store.get("uq_city");
    return site && site.locations.includes(c) ? c : (site ? site.default_location : c);
  }
  function setCity(c) { store.set("uq_city", c); document.dispatchEvent(new CustomEvent("uq:city", { detail: c })); }

  /* ---------------- prices ---------------- */
  // Prices live only in memory so an admin price change is never shown stale.
  // The session just remembers *which* designs the visitor has unlocked.
  const prices = {};
  const unlocked = () => session.get("uq_unlocked") || [];
  async function revealPrice(slug, silent = false) {
    if (prices[slug]) return prices[slug];
    const p = await api(`/api/designs/${encodeURIComponent(slug)}/price${silent ? "?nv=1" : ""}`);
    prices[slug] = p;
    const u = unlocked(); if (!u.includes(slug)) { u.push(slug); session.set("uq_unlocked", u); }
    return p;
  }
  // re-fetch fresh prices for designs this visitor already unlocked
  async function restorePrices(list) {
    const u = unlocked();
    await Promise.all(list.filter((d) => d.price_mode === "reveal" && u.includes(d.slug) && !prices[d.slug])
      .map((d) => revealPrice(d.slug, true).catch(() => null)));
  }
  function knownPrice(d) {
    if (d.price_mode === "visible") return { price: d.price, mtm_delta: d.mtm_delta || 0,
      colors: Object.fromEntries(d.colors.map((c) => [c.name, c.delta || 0])),
      addons: Object.fromEntries(d.addons.map((a) => [a.name, a.delta || 0])) };
    if (d.price_mode === "reveal") return prices[d.slug] || null;
    return null;
  }
  function priceHTML(d, label = "Reveal price") {
    if (d.price_mode === "request") return '<span class="on-request">Price on request</span>';
    const p = knownPrice(d);
    if (p) return `<span class="price">${money(p.price)}</span>`;
    return `<button type="button" class="reveal-btn" data-reveal="${esc(d.slug)}">${icons.lock}${esc(label)}</button>`;
  }
  // delegated: any [data-reveal] button anywhere reveals its price
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-reveal]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    b.disabled = true;
    try {
      const p = await revealPrice(b.dataset.reveal);
      const span = document.createElement("span");
      span.className = "price price-pop"; span.textContent = money(p.price);
      b.replaceWith(span);
      document.dispatchEvent(new CustomEvent("uq:price", { detail: { slug: b.dataset.reveal, price: p } }));
    } catch (err) { b.disabled = false; toast(err.message, true); }
  });

  /* ---------------- rarity ---------------- */
  function rarityHTML(d) {
    const h = d.here;
    if (!h) return `<div class="rarity out"><div class="r-top"><b>—</b><span>Not offered in ${esc(city())}</span></div><div class="bar"><i style="width:0"></i></div></div>`;
    const low = h.left > 0 && h.left <= (site?.low_stock_threshold || 5);
    const pct = Math.round((h.sold / Math.max(1, h.limit)) * 100);
    const text = h.left === 0 ? `Sold out in ${esc(h.location)}` : `of ${h.limit} left in ${esc(h.location)}`;
    const level = h.left === 0 ? "out" : low ? "low" : h.left / Math.max(1, h.limit) <= .5 ? "mid" : "ok";   // colour follows scarcity
    return `<div class="rarity ${level}">
      <div class="r-top"><span>${h.left === 0 ? "" : `<b>${h.left}</b> `}${text}</span><span>${pct}% claimed</span></div>
      <div class="bar"><i style="width:${Math.max(pct, 2)}%"></i></div></div>`;
  }
  function statusBadge(d) {
    const h = d.here;
    if (!h) return `<span class="badge out">Not in ${esc(city())}</span>`;
    if (h.left === 0) return '<span class="badge out">Sold out here</span>';
    if (h.left <= (site?.low_stock_threshold || 5)) return `<span class="badge hot">Only ${h.left} left</span>`;
    return `<span class="badge">Edition of ${h.limit}</span>`;
  }

  /* ---------------- compare ---------------- */
  const compareList = () => store.get("uq_compare", []);
  function toggleCompare(slug) {
    let l = compareList();
    if (l.includes(slug)) l = l.filter((s) => s !== slug);
    else { if (l.length >= 3) { toast("You can compare up to 3 designs"); return false; } l.push(slug); }
    store.set("uq_compare", l);
    renderTray();
    document.querySelectorAll(`[data-compare="${CSS.escape(slug)}"]`).forEach((b) => {
      b.classList.toggle("on", l.includes(slug)); b.textContent = l.includes(slug) ? "✓ Comparing" : "+ Compare";
    });
    return true;
  }
  const thumbs = {};
  function renderTray() {
    let tray = document.querySelector(".compare-tray");
    if (!tray) {
      tray = document.createElement("div"); tray.className = "compare-tray";
      tray.innerHTML = '<div class="thumbs"></div><span class="label"></span><button class="btn gold sm" type="button" data-open-compare>Compare</button><button class="clear" type="button">Clear</button>';
      document.body.appendChild(tray);
      tray.querySelector(".clear").onclick = () => { store.set("uq_compare", []); renderTray(); document.querySelectorAll("[data-compare]").forEach((b) => { b.classList.remove("on"); b.textContent = "+ Compare"; }); };
      tray.querySelector("[data-open-compare]").onclick = openCompare;
    }
    const l = compareList();
    tray.querySelector(".thumbs").innerHTML = l.map((s) => thumbs[s] ? `<img src="${esc(thumbs[s])}" alt="">` : "").join("");
    tray.querySelector(".label").textContent = `${l.length} of 3 selected`;
    tray.querySelector("[data-open-compare]").disabled = l.length < 2;
    tray.classList.toggle("show", l.length > 0);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-compare]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    toggleCompare(b.dataset.compare);
  });

  const FEEL = { comfort: "Comfort", drape: "Drape & flow", stretch: "Stretch", breathability: "Breathability", formality: "Formality" };
  const FEEL_WORDS = ["", "Minimal", "Light", "Balanced", "High", "Exceptional"];
  function metersHTML(feel) {
    return `<div class="meters">${Object.entries(FEEL).map(([k, label]) => {
      const v = feel?.[k] || 0;
      return `<div class="meter" data-k="${k}"><span>${label}</span><div class="segs" role="img" aria-label="${label}: ${v} of 5">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= v ? "on" : ""}"></i>`).join("")}</div><em>${FEEL_WORDS[v] || ""}</em></div>`;
    }).join("")}</div>`;
  }

  function modal(title, bodyHTML, narrow = false) {
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="scrim"></div><div class="sheet ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" type="button" data-close aria-label="Close">${icons.close}</button></div>
      <div class="sheet-body">${bodyHTML}</div></div>`;
    const close = () => { m.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    m.querySelector(".scrim").onclick = close;
    m.querySelector("[data-close]").onclick = close;
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); document.body.style.overflow = "hidden";
    m.close = close;
    return m;
  }

  async function openCompare() {
    const slugs = compareList();
    const m = modal("Side-by-side", '<div class="skeleton" style="height:320px"></div>');
    try {
      const ds = await Promise.all(slugs.map((s) => api(`/api/designs/${encodeURIComponent(s)}?location=${encodeURIComponent(city())}&nv=1`)));
      await restorePrices(ds);
      const row = (label, fn) => `<tr><th>${label}</th>${ds.map((d) => `<td>${fn(d)}</td>`).join("")}</tr>`;
      m.querySelector(".sheet-body").innerHTML = `<div class="table-scroll"><table class="compare-table">
        ${row("", (d) => `<a href="/design?d=${esc(d.slug)}"><img src="${esc(d.images[0] || "")}" alt=""><h4>${esc(d.name)}</h4></a><span class="muted">${esc(d.category)}</span>`)}
        ${row("Price", (d) => priceHTML(d))}
        ${row(`In ${esc(city())}`, (d) => rarityHTML(d))}
        ${row("Fabric", (d) => esc(d.specs.fabric))}
        ${row("Weight", (d) => esc(d.specs.weight))}
        ${row("Fit", (d) => esc(d.specs.fit))}
        ${row("Length", (d) => esc(d.specs.length))}
        ${row("Making time", (d) => esc(d.specs.making_days))}
        ${row("Feel", (d) => metersHTML(d.feel))}
        ${row("Colourways", (d) => d.colors.map((c) => esc(c.name)).join(", "))}
        ${row("Occasions", (d) => d.occasions.map(esc).join(", "))}
      </table></div>`;
    } catch (err) { m.querySelector(".sheet-body").innerHTML = `<p class="empty">${esc(err.message)}</p>`; }
  }

  /* ---------------- card ---------------- */
  function cardHTML(d) {
    thumbs[d.slug] = d.images[0] || "";
    const cmp = compareList().includes(d.slug);
    return `<article class="card reveal">
      <a class="stretch" href="/design?d=${esc(d.slug)}" aria-label="View ${esc(d.name)}"></a>
      <div class="media">
        <img src="${esc(d.images[0] || "")}" alt="${esc(d.name)}" loading="lazy">
        ${d.images[1] ? `<img class="alt" src="${esc(d.images[1])}" alt="" loading="lazy">` : ""}
        <div class="badges">${d.badge ? `<span class="badge dark">${esc(d.badge)}</span>` : "<span></span>"}${statusBadge(d)}</div>
        <button type="button" class="compare-toggle ${cmp ? "on" : ""}" data-compare="${esc(d.slug)}">${cmp ? "✓ Comparing" : "+ Compare"}</button>
        <div class="swatch-row">${d.colors.slice(0, 5).map((c) => `<span style="background:${esc(c.hex)}" title="${esc(c.name)}"></span>`).join("")}</div>
      </div>
      <div class="body">
        <span class="cat">${esc(d.category)}</span>
        <h3>${esc(d.name)}</h3>
        <p class="tagline">${esc(d.tagline)}</p>
        ${d.feedback.love ? `<span class="loves">${d.feedback.love} ${d.feedback.love === 1 ? "person loves" : "people love"} this</span>` : ""}
        ${rarityHTML(d)}
        <div class="foot">${priceHTML(d)}<a class="btn ghost sm" href="/design?d=${esc(d.slug)}">Explore</a></div>
      </div></article>`;
  }

  function observeReveal(root = document) {
    const els = root.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ---------------- chrome: header, footer ---------------- */
  async function initChrome() {
    const s = await loadSite();
    const ann = document.querySelector("[data-announce]");
    if (ann) { if (s.announcement) ann.innerHTML = `<b>◆</b>&nbsp; ${esc(s.announcement)}`; else ann.remove(); }
    document.querySelectorAll("[data-city]").forEach((sel) => {
      sel.innerHTML = s.locations.map((l) => `<option ${l === city() ? "selected" : ""}>${esc(l)}</option>`).join("");
      sel.onchange = () => { setCity(sel.value); document.querySelectorAll("[data-city]").forEach((o) => (o.value = sel.value)); };
    });
    const header = document.querySelector(".site-header");
    const onScroll = () => header && header.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    const mnav = document.querySelector(".mobile-nav");
    document.querySelectorAll("[data-menu]").forEach((b) => (b.onclick = () => { mnav.classList.toggle("open"); document.body.style.overflow = mnav.classList.contains("open") ? "hidden" : ""; }));
    mnav && mnav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => { mnav.classList.remove("open"); document.body.style.overflow = ""; }));
    const c = s.contact || {};
    const set = (sel, html) => document.querySelectorAll(sel).forEach((el) => (el.innerHTML = html));
    set("[data-contact]", [
      c.phone && `<li><a href="tel:${esc(c.phone.replace(/\s/g, ""))}">${esc(c.phone)}</a></li>`,
      c.whatsapp && `<li><a href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener">WhatsApp our stylist</a></li>`,
      c.email && `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`,
      c.instagram && `<li><a href="https://instagram.com/${esc(c.instagram)}" target="_blank" rel="noopener">@${esc(c.instagram)}</a></li>`,
      c.address && `<li>${esc(c.address)}</li>`,
    ].filter(Boolean).join(""));
    set("[data-cities]", s.locations.map((l) => `<li>${esc(l)}</li>`).join(""));
    set("[data-year]", new Date().getFullYear());
    renderTray();
    return s;
  }

  return { api, esc, money, pad, timeAgo, store, clientId, toast, icons, loadSite, city, setCity, priceHTML, knownPrice,
    revealPrice, restorePrices, rarityHTML, statusBadge, cardHTML, metersHTML, observeReveal, initChrome, modal, thumbs, renderTray,
    FEEL, get site() { return site; } };
})();
