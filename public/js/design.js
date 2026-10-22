/* UNIQO - design detail ("showroom stage") */
(async () => {
  const { api, esc, money, pad, city, icons, toast, store } = UQ;
  const app = document.getElementById("app");
  const slug = new URLSearchParams(location.search).get("d") || "";
  const MTM = "Made to measure";
  const SPEC_LABELS = {
    fabric: "Fabric", lining: "Lining", weight: "Weight", fit: "Fit", neckline: "Neckline", sleeve: "Sleeve",
    length: "Length", closure: "Closure", embellishment: "Embellishment", care: "Care", making_days: "Making time",
  };
  const SPEC_ICON = {
    fabric: "M4 6c4-3 12 3 16 0v12c-4 3-12-3-16 0z", lining: "M5 4h14v16H5zM9 4v16", weight: "M6 20l2-11h8l2 11zM9 9a3 3 0 0 1 6 0",
    fit: "M8 3l-4 4 3 3v11h10V10l3-3-4-4-4 3z", neckline: "M5 4c2 6 12 6 14 0M5 4v16h14V4", sleeve: "M4 8l6-4h4l6 4-3 5-3-2v9H10v-9l-3 2z",
    length: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4", closure: "M12 3v18M9 6h6M9 10h6M9 14h6M9 18h6", embellishment: "M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14 3 9.5 9.5 9z",
    care: "M3 8h18l-2 11H5zM8 8V5h8v3", making_days: "M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
  };

  let site, d, views = [], view = 0, anatomy = false, activeSpot = -1;
  const sel = { color: "", size: "", addons: new Set(), measurements: {} };

  try { site = await UQ.initChrome(); } catch (e) { toast(e.message, true); }
  if (!slug) { location.href = "/#showroom"; return; }

  async function load() {
    try {
      d = await api(`/api/designs/${encodeURIComponent(slug)}?location=${encodeURIComponent(city())}`);
    } catch (e) {
      app.innerHTML = `<div class="empty" style="margin:60px 0"><h2 class="section-title" style="font-size:40px">Off the floor</h2><p>${esc(e.message)}</p><a class="btn" href="/#showroom">Back to the showroom</a></div>`;
      return;
    }
    await UQ.restorePrices([d, ...d.related]);
    document.title = `${d.name} — Uniqo`;
    UQ.thumbs[d.slug] = d.images[0] || "";
    if (!sel.color || !d.colors.some((c) => c.name === sel.color)) sel.color = d.colors[0]?.name || "";
    buildViews();
    render();
  }

  function buildViews() {
    views = d.images.map((src, i) => ({ src, label: labelFor(src, i) }));
    d.colors.forEach((c) => { if (c.image && !views.some((v) => v.src === c.image)) views.push({ src: c.image, label: c.name }); });
    const c = d.colors.find((x) => x.name === sel.color);
    const idx = c && c.image ? views.findIndex((v) => v.src === c.image) : 0;
    view = Math.max(0, idx);
  }
  function labelFor(src, i) {
    const c = d.colors.find((x) => x.image === src);
    if (c) return c.name;
    if (/detail/i.test(src)) return "Detail";
    return i === 0 ? "Front" : `View ${i + 1}`;
  }
  const isFullView = () => { const v = views[view]; return v && !/detail/i.test(v.src) && (view === 0 || d.colors.some((c) => c.image === v.src)); };

  /* ---------------- pricing ---------------- */
  function priceInfo() { return UQ.knownPrice(d); }
  function total() {
    const p = priceInfo(); if (!p) return null;
    let t = p.price + (p.colors[sel.color] || 0);
    if (sel.size === MTM) t += p.mtm_delta || 0;
    sel.addons.forEach((a) => (t += p.addons[a] || 0));
    return t;
  }
  const deltaText = (n) => (n ? (n > 0 ? `+ ${money(n)}` : `− ${money(-n)}`) : "Included");

  /* ---------------- render ---------------- */
  function render() {
    const h = d.here;
    app.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/#showroom">Showroom</a><span>/</span><span>${esc(d.category)}</span><span>/</span><span style="color:var(--ink)">${esc(d.name)}</span></nav>
      <div class="pdp">
        <div class="stage-wrap">
          <div class="stage" id="stage"></div>
          <div class="thumbs-row" id="thumbs"></div>
        </div>
        <div class="panel">
          <div>
            <span class="cat">${esc(d.category)}${d.badge ? ` · ${esc(d.badge)}` : ""}</span>
            <h1 style="margin:10px 0 12px">${esc(d.name)}</h1>
            <p class="tagline">${esc(d.tagline)}</p>
            ${d.feedback.love ? `<div class="title-row"><span class="loves">${d.feedback.love} ${d.feedback.love === 1 ? "person loves" : "people love"} this design</span></div>` : ""}
          </div>
          ${d.occasions.length ? `<div class="occasions">${d.occasions.map((o) => `<span>${esc(o)}</span>`).join("")}</div>` : ""}
          ${editionHTML(h)}
          <div id="config"></div>
          <div class="buy-box" id="buy"></div>
        </div>
      </div>
      <section class="detail-sections">
        <div class="tabs" role="tablist" id="tabs">
          <button class="on" data-tab="story" role="tab">The story</button>
          <button data-tab="spec" role="tab">Spec sheet</button>
          <button data-tab="feel" role="tab">Feel profile</button>
          ${d.hotspots.length ? '<button data-tab="anatomy" role="tab">Anatomy</button>' : ""}
          <button data-tab="size" role="tab">Size guide</button>
        </div>
        <div data-pane="story"><p class="story">${esc(d.story || d.tagline)}</p></div>
        <div data-pane="spec" class="hidden"><div class="spec-grid">${Object.entries(SPEC_LABELS).filter(([k]) => d.specs[k]).map(([k, label]) => `
          <div class="spec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="${SPEC_ICON[k]}"/></svg><div><small>${label}</small><span>${esc(d.specs[k])}</span></div></div>`).join("")}</div></div>
        <div data-pane="feel" class="hidden"><div class="feel-wrap">${UQ.metersHTML(d.feel)}
          <div><h3 style="font-size:32px;margin-bottom:10px">How it feels to wear</h3><p class="muted">We rate every design on five qualities from 1 to 5 after our fit sessions. A high <b>drape</b> score means the fabric flows and moves with you. A high <b>formality</b> score means it's made for the big occasions. Use these to compare designs the way you'd compare specs.</p></div></div></div>
        ${d.hotspots.length ? `<div data-pane="anatomy" class="hidden"><div class="anatomy-list">${d.hotspots.map((s, i) => `<div><i>${i + 1}</i><span><b>${esc(s.title)}</b><p>${esc(s.text)}</p></span></div>`).join("")}</div></div>` : ""}
        <div data-pane="size" class="hidden">${sizeGuideHTML()}</div>
      </section>
      <section style="padding-bottom:60px">${feedbackHTML()}</section>
      ${d.related.length ? `<section class="detail-sections"><div class="section-head"><span class="eyebrow">Also on the floor</span><h2 class="section-title" style="font-size:clamp(30px,4vw,44px)">You might also covet</h2></div><div class="grid">${d.related.map(UQ.cardHTML).join("")}</div></section>` : ""}`;

    renderStage(); renderConfig(); renderBuy(); wireTabs(); wireFeedback(); wireEdition();
    UQ.observeReveal(app);
    UQ.renderTray();
  }

  function editionHTML(h) {
    const other = d.editions.filter((e) => !h || e.location !== h.location);
    const others = other.length ? `<details class="other-cities"><summary>Availability in other cities ▾</summary><ul>${other.map((e) => `<li><span>${esc(e.location)}</span><span>${e.left ? `${e.left} of ${e.limit} left` : "Sold out"} · <button type="button" data-goto-city="${esc(e.location)}">switch</button></span></li>`).join("")}</ul></details>` : "";
    if (!h) return `<div class="edition-card"><div class="ec-top"><div><small>Edition</small><b style="font-size:34px">Not in ${esc(city())}</b></div></div><p class="ec-note" style="margin-top:12px">This design isn't offered in your city. Check another city below, or ask our stylist about a commission.</p>${others}</div>`;
    const claimed = new Set(h.claimed || []);
    const dots = Array.from({ length: h.limit }, (_, i) => {
      const n = i + 1;
      return `<span class="${claimed.has(n) ? "taken" : n === h.next_piece ? "yours" : ""}" title="Piece ${pad(n)}${claimed.has(n) ? " · claimed" : ""}">${h.limit <= 40 ? pad(n) : ""}</span>`;
    }).join("");
    const note = h.left === 0
      ? `The <b>${esc(h.location)}</b> edition is complete. Every piece has an owner, and this design won't be made here again.`
      : h.left <= (site?.low_stock_threshold || 5)
        ? `Almost gone. Only <b>${h.left}</b> pieces remain in ${esc(h.location)}. The next to be claimed is <b>#${pad(h.next_piece)}</b>.`
        : `Only <b>${h.limit}</b> will ever exist in ${esc(h.location)}. Reserve now and you'll own piece <b>#${pad(h.next_piece)}</b>.`;
    return `<div class="edition-card">
      <div class="ec-top"><div><small>Left in ${esc(h.location)}</small><b>${pad(h.left)}</b> <span class="of">/ ${h.limit}</span></div>
      <div style="text-align:right"><small>Across all cities</small><span style="font-family:var(--serif);font-size:22px;color:#fff">${d.total_left} of ${d.total_limit}</span></div></div>
      ${h.limit <= 120 ? `<div class="piece-grid" aria-label="${h.sold} of ${h.limit} pieces claimed">${dots}</div>` : `<div class="rarity" style="margin:16px 0"><div class="bar"><i style="width:${Math.round(h.sold / h.limit * 100)}%"></i></div></div>`}
      <p class="ec-note">${note}</p>${others}</div>`;
  }
  function wireEdition() {
    app.querySelectorAll("[data-goto-city]").forEach((b) => (b.onclick = () => {
      UQ.setCity(b.dataset.gotoCity);
      document.querySelectorAll("[data-city]").forEach((s) => (s.value = b.dataset.gotoCity));
    }));
  }

  function renderStage() {
    const stage = document.getElementById("stage");
    const v = views[view] || { src: "", label: "" };
    const spots = anatomy && isFullView() ? d.hotspots : [];
    stage.innerHTML = `
      <img src="${esc(v.src)}" alt="${esc(d.name)} – ${esc(v.label)}">
      ${views.length > 1 ? `<button class="nav-arrow prev" type="button" aria-label="Previous view">${icons.arrowL}</button><button class="nav-arrow next" type="button" aria-label="Next view">${icons.arrowR}</button>` : ""}
      ${d.hotspots.length ? `<div class="stage-tools"><button type="button" id="anatomyBtn" class="${anatomy ? "on" : ""}">${anatomy ? "✕ Hide" : "◎ Show"} anatomy</button></div>` : ""}
      <span class="view-label">${esc(v.label)}</span>
      ${spots.map((s, i) => `<button type="button" class="hotspot ${i === activeSpot ? "on" : ""}" style="left:${s.x}%;top:${s.y}%" data-spot="${i}" aria-label="${esc(s.title)}">${i + 1}</button>`).join("")}
      ${activeSpot >= 0 && spots[activeSpot] ? tipHTML(spots[activeSpot]) : ""}`;
    stage.querySelector(".prev")?.addEventListener("click", () => go(-1));
    stage.querySelector(".next")?.addEventListener("click", () => go(1));
    stage.querySelector("#anatomyBtn")?.addEventListener("click", () => {
      anatomy = !anatomy; activeSpot = anatomy ? 0 : -1;
      if (anatomy && !isFullView()) view = Math.max(0, views.findIndex((x) => x.src === (d.colors.find((c) => c.name === sel.color)?.image || views[0].src)));
      renderStage(); renderThumbs();
    });
    stage.querySelectorAll("[data-spot]").forEach((b) => (b.onclick = () => { activeSpot = +b.dataset.spot === activeSpot ? -1 : +b.dataset.spot; renderStage(); }));
    let x0 = null;
    stage.ontouchstart = (e) => (x0 = e.touches[0].clientX);
    stage.ontouchend = (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); x0 = null; };
    renderThumbs();
  }
  function tipHTML(s) {
    const left = s.x > 55 ? `right:${100 - s.x + 4}%` : `left:${s.x + 4}%`;
    const top = s.y > 70 ? `bottom:${100 - s.y + 4}%` : `top:${s.y + 3}%`;
    return `<div class="spot-tip" style="${left};${top}"><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>`;
  }
  function go(step) { view = (view + step + views.length) % views.length; activeSpot = anatomy ? activeSpot : -1; renderStage(); }
  function renderThumbs() {
    const t = document.getElementById("thumbs");
    t.innerHTML = views.map((v, i) => `<button type="button" class="${i === view ? "on" : ""}" data-view="${i}" aria-label="${esc(v.label)}"><img src="${esc(v.src)}" alt="" loading="lazy"></button>`).join("");
    t.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { view = +b.dataset.view; renderStage(); }));
  }

  function renderConfig() {
    const p = priceInfo();
    const box = document.getElementById("config");
    const sizes = [...d.sizes, ...(d.made_to_measure ? [MTM] : [])];
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:26px">
      ${d.colors.length ? `<div class="opt-group"><div class="opt-label">Colourway <b>${esc(sel.color)}${p && p.colors[sel.color] ? ` · ${deltaText(p.colors[sel.color])}` : ""}</b></div>
        <div class="swatches">${d.colors.map((c) => `<button type="button" class="swatch ${c.name === sel.color ? "on" : ""}" style="background:${esc(c.hex)}" data-color="${esc(c.name)}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`).join("")}</div></div>` : ""}
      ${sizes.length ? `<div class="opt-group"><div class="opt-label">Size <b>${esc(sel.size || "Select")}</b></div>
        <div class="sizes">${sizes.map((s) => `<button type="button" class="size ${s === sel.size ? "on" : ""}" data-size="${esc(s)}">${esc(s)}${s === MTM && p && p.mtm_delta ? ` <small>(${deltaText(p.mtm_delta)})</small>` : ""}</button>`).join("")}</div>
        ${sel.size === MTM ? `<div class="mtm-fields">${["bust", "waist", "hip", "height"].map((k) => `<div class="field"><label for="m-${k}">${k} (in)</label><input id="m-${k}" inputmode="decimal" maxlength="6" data-measure="${k}" value="${esc(sel.measurements[k] || "")}" placeholder="${{ bust: "34", waist: "28", hip: "38", height: "64" }[k]}"></div>`).join("")}</div><p class="fine">Not sure? Leave them blank and our stylist will measure with you on the call.</p>` : ""}
      </div>` : ""}
      ${d.addons.length ? `<div class="opt-group"><div class="opt-label">Hand-finished add-ons</div>
        ${d.addons.map((a) => `<label class="addon"><input type="checkbox" data-addon="${esc(a.name)}" ${sel.addons.has(a.name) ? "checked" : ""}><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div><span class="delta">${p ? deltaText(p.addons[a.name] || 0) : ""}</span></label>`).join("")}</div>` : ""}
    </div>`;
    box.querySelectorAll("[data-color]").forEach((b) => (b.onclick = () => {
      sel.color = b.dataset.color;
      const c = d.colors.find((x) => x.name === sel.color);
      if (c && c.image) view = Math.max(0, views.findIndex((v) => v.src === c.image));
      renderConfig(); renderStage(); renderBuy();
    }));
    box.querySelectorAll("[data-size]").forEach((b) => (b.onclick = () => { sel.size = b.dataset.size; renderConfig(); renderBuy(); }));
    box.querySelectorAll("[data-measure]").forEach((i) => (i.oninput = () => (sel.measurements[i.dataset.measure] = i.value.replace(/[^\d.]/g, ""))));
    box.querySelectorAll("[data-addon]").forEach((i) => (i.onchange = () => { i.checked ? sel.addons.add(i.dataset.addon) : sel.addons.delete(i.dataset.addon); renderBuy(); }));
  }

  // send the customer into the Design Lobby starting from this design's cut and colour
  function remixLink() {
    const base = { Saree: "saree", Anarkali: "anarkali", Lehenga: "lehenga", "Kurta Set": "kurta", Gown: "aline" }[d.category];
    if (!base) return "";
    const hexv = (d.colors.find((c) => c.name === sel.color) || d.colors[0] || {}).hex || "";
    return `<a class="remix-link" href="/lobby?base=${base}${hexv ? "&col=" + encodeURIComponent(hexv) : ""}">✦ Remix this in the Design Lobby: your fabric, your details</a>`;
  }

  function renderBuy() {
    const h = d.here, t = total();
    const buy = document.getElementById("buy");
    let priceBlock;
    if (d.price_mode === "request") priceBlock = `<div><span class="total-label">Price</span><span class="on-request" style="display:inline-block;margin-top:4px">Shared by your stylist</span></div>`;
    else if (t === null) priceBlock = `<div><span class="total-label">Your price</span><button type="button" class="reveal-btn" data-reveal="${esc(d.slug)}" style="margin-top:4px">${icons.lock}Tap to reveal price</button></div>`;
    else priceBlock = `<div><span class="total-label">Your price · as configured</span><span class="price">${money(t)}</span></div>`;
    let cta;
    if (!h) cta = `<button class="btn block" disabled>Not offered in ${esc(city())}</button>`;
    else if (h.left === 0) cta = `<button class="btn block" disabled>Sold out in ${esc(h.location)}</button>`;
    else cta = `<button class="btn gold block" id="reserve">Reserve piece #${pad(h.next_piece)}</button>`;
    const wa = site?.contact?.whatsapp;
    const waText = encodeURIComponent(`Hi Uniqo! I'm interested in ${d.name}${sel.color ? ` (${sel.color}` : ""}${sel.size ? `, ${sel.size}` : ""}${sel.color ? ")" : ""} in ${city()}.`);
    buy.innerHTML = `<div class="buy-row">${priceBlock}${h && h.left ? `<span class="muted" style="font-size:13px;text-align:right">${h.left} of ${h.limit} left<br>in ${esc(h.location)}</span>` : ""}</div>${cta}
      ${h && h.left ? '<ul class="assure"><li>No payment now</li><li>Price locked</li><li>Stylist confirms fit</li></ul>' : ""}
      ${remixLink()}
      ${wa ? `<a class="wa-link" href="https://wa.me/${esc(wa)}?text=${waText}" target="_blank" rel="noopener">${icons.wa} Ask a stylist on WhatsApp</a>` : ""}`;
    buy.querySelector("#reserve")?.addEventListener("click", openOrder);
  }
  document.addEventListener("uq:price", (e) => { if (d && e.detail.slug === d.slug) { renderConfig(); renderBuy(); } });

  function wireTabs() {
    const tabs = document.getElementById("tabs");
    tabs.onclick = (e) => {
      const b = e.target.closest("[data-tab]"); if (!b) return;
      tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      app.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== b.dataset.tab));
    };
  }

  function sizeGuideHTML() {
    const rows = [["XS", 32, 26, 35], ["S", 34, 28, 37], ["M", 36, 30, 39], ["L", 38, 32, 41], ["XL", 40, 34, 43], ["XXL", 42, 36, 45]];
    return `<div class="table-scroll"><table class="compare-table" style="min-width:0;max-width:700px"><tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th></tr>
      ${rows.filter((r) => !d.sizes.length || d.sizes.includes(r[0])).map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}″</td><td>${r[2]}″</td><td>${r[3]}″</td></tr>`).join("")}</table></div>
      <p class="muted" style="margin-top:16px">Measurements are body measurements in inches. Between sizes? Choose <b>Made to measure</b> and our stylist will confirm your fit on the call.</p>`;
  }

  /* ---------------- feedback ---------------- */
  const REACT = [["love", "😍", "Love it"], ["like", "👍", "Like it"], ["meh", "🤔", "Not for me"]];
  function feedbackHTML() {
    const mine = (store.get("uq_fb", {}) || {})[d.slug];
    return `<div class="feedback-box" id="fb">
      <span class="eyebrow">Your verdict</span>
      <h3 style="margin-top:12px">What do you think of ${esc(d.name)}?</h3>
      <p>One tap. Our designers read every response, and it shapes what we make next.</p>
      <div class="reactions">${REACT.map(([k, e, l]) => `<button type="button" class="reaction ${mine === k ? "on" : ""}" data-react="${k}" aria-pressed="${mine === k}"><span class="emo">${e}</span><span>${l}</span>${mine ? `<small>${d.feedback[k] || 0}</small>` : ""}</button>`).join("")}</div>
      <div class="fb-comment ${mine ? "" : "hidden"}" id="fbComment">
        <textarea class="input" id="fbText" maxlength="400" placeholder="Anything you'd change? A colour, a length, a detail? (optional)"></textarea>
        <button type="button" class="btn sm" id="fbSend" style="align-self:center">Send note</button>
      </div></div>`;
  }
  function wireFeedback() {
    const box = document.getElementById("fb");
    const send = async (reaction, comment = "") => {
      const res = await api(`/api/designs/${encodeURIComponent(d.slug)}/feedback`, { method: "POST", body: { reaction, comment, client_id: UQ.clientId() } });
      const all = store.get("uq_fb", {}) || {}; all[d.slug] = reaction; store.set("uq_fb", all);
      d.feedback = res.feedback;
    };
    box.querySelectorAll("[data-react]").forEach((b) => (b.onclick = async () => {
      try {
        await send(b.dataset.react);
        box.outerHTML = feedbackHTML(); wireFeedback();
        document.getElementById("fbComment").classList.remove("hidden");
        toast("Thank you! Your verdict is in.");
      } catch (e) { toast(e.message, true); }
    }));
    const sendBtn = box.querySelector("#fbSend");
    if (sendBtn) sendBtn.onclick = async () => {
      const text = box.querySelector("#fbText").value.trim();
      if (!text) return toast("Write a short note first");
      try { await send((store.get("uq_fb", {}) || {})[d.slug], text); box.querySelector("#fbComment").innerHTML = '<p class="muted">Noted. Thank you for helping us design better. ✦</p>'; }
      catch (e) { toast(e.message, true); }
    };
  }

  /* ---------------- order ---------------- */
  function openOrder() {
    if (d.colors.length && !sel.color) return toast("Please choose a colourway");
    if ((d.sizes.length || d.made_to_measure) && !sel.size) {
      toast("Please choose your size");
      document.querySelector(".sizes")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const h = d.here, t = total();
    const img = d.colors.find((c) => c.name === sel.color)?.image || d.images[0] || "";
    const saved = store.get("uq_me", {}) || {};
    const m = UQ.modal("Reserve your piece", `
      <div class="order-summary"><img src="${esc(img)}" alt="">
        <div><h4>${esc(d.name)}</h4><ul>
          ${sel.color ? `<li>Colourway: <b>${esc(sel.color)}</b></li>` : ""}
          ${sel.size ? `<li>Size: <b>${esc(sel.size)}</b></li>` : ""}
          ${sel.addons.size ? `<li>Add-ons: ${[...sel.addons].map(esc).join(", ")}</li>` : ""}
          <li>Edition: <b>#${pad(h.next_piece)} of ${h.limit}</b> · ${esc(h.location)}</li>
          <li>${t !== null ? `Price: <b>${money(t)}</b>` : d.price_mode === "request" ? "Price: shared by your stylist" : "Price: revealed on confirmation"}</li>
        </ul></div></div>
      <form id="orderForm" class="form-grid" novalidate>
        <div class="field full"><label for="o-name">Full name</label><input id="o-name" name="name" autocomplete="name" required maxlength="80" value="${esc(saved.name || "")}"><span class="err"></span></div>
        <div class="field full"><label for="o-mobile">Mobile number</label><div class="prefix"><span>+91</span><input id="o-mobile" name="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" required value="${esc(saved.mobile || "")}"></div><span class="err"></span></div>
        <div class="field full"><label for="o-address">Delivery address</label><textarea id="o-address" name="address" autocomplete="street-address" required maxlength="400" placeholder="House / flat, street, area, landmark">${esc(saved.address || "")}</textarea><span class="err"></span></div>
        <div class="field"><label for="o-pin">Pincode</label><input id="o-pin" name="pincode" inputmode="numeric" autocomplete="postal-code" maxlength="6" required value="${esc(saved.pincode || "")}"><span class="err"></span></div>
        <div class="field"><label>City</label><input value="${esc(h.location)}" disabled></div>
        <div class="field full"><label for="o-notes">Notes for your stylist (optional)</label><input id="o-notes" name="notes" maxlength="400" placeholder="Event date, preferred call time…"></div>
        <div class="full"><button class="btn gold block" type="submit">Reserve #${pad(h.next_piece)} · ${esc(h.location)}</button></div>
        <p class="fine full">No payment now. Your piece is held under your name, and our stylist will call you within 24 hours to confirm fit, final price and payment.</p>
      </form>`, true);
    const f = m.querySelector("#orderForm");
    f.mobile.oninput = () => (f.mobile.value = f.mobile.value.replace(/\D/g, "").slice(0, 10));
    f.pincode.oninput = () => (f.pincode.value = f.pincode.value.replace(/\D/g, "").slice(0, 6));
    f.onsubmit = async (e) => {
      e.preventDefault();
      const errs = {
        name: f.name.value.trim().length < 2 && "Please enter your full name",
        mobile: !/^[6-9]\d{9}$/.test(f.mobile.value) && "Enter a valid 10-digit mobile number",
        address: f.address.value.trim().length < 10 && "Please enter your full address",
        pincode: !/^[1-9]\d{5}$/.test(f.pincode.value) && "Enter a valid 6-digit pincode",
      };
      let first = null;
      Object.entries(errs).forEach(([k, msg]) => {
        const err = f[k].closest(".field").querySelector(".err");
        err.textContent = msg || "";
        if (msg && !first) first = f[k];
      });
      if (first) return first.focus();
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Reserving…";
      const body = {
        slug: d.slug, location: h.location, name: f.name.value.trim(), mobile: f.mobile.value,
        address: f.address.value.trim(), pincode: f.pincode.value, notes: f.notes.value.trim(),
        config: { color: sel.color, size: sel.size, addons: [...sel.addons], measurements: sel.measurements },
      };
      try {
        const r = await api("/api/orders", { method: "POST", body });
        store.set("uq_me", { name: body.name, mobile: body.mobile, address: body.address, pincode: body.pincode });
        m.querySelector(".sheet-head h3").textContent = "It's yours";
        m.querySelector(".sheet-body").innerHTML = `
          <div class="certificate">
            <img class="cert-seal" src="/assets/seal.svg" alt="">
            <small>Uniqo · Edition card</small>
            <h3>${esc(r.design)}</h3>
            <span class="muted" style="color:#b8aa95">${esc(r.config.color)}${r.config.size ? ` · ${esc(r.config.size)}` : ""}</span>
            <div class="no">Nº ${pad(r.piece)}</div>
            <span style="letter-spacing:.2em;text-transform:uppercase;font-size:12px">of ${r.limit} · ${esc(r.location)}</span>
            <div class="meta"><span>Reserved for<b>${esc(body.name)}</b></span><span>Reference<b>${esc(r.ref)}</b></span>${r.total !== null ? `<span>Price<b>${money(r.total)}</b></span>` : ""}</div>
          </div>
          <p style="text-align:center;margin:22px 0 6px">Your piece is reserved. Our stylist will call <b>+91 ${esc(body.mobile)}</b> within 24 hours to confirm the details.</p>
          <p class="fine" style="text-align:center">Keep your reference <b>${esc(r.ref)}</b> handy. Only ${r.left} piece${r.left === 1 ? "" : "s"} now remain in ${esc(r.location)}.</p>
          <div style="text-align:center;margin-top:20px"><a class="btn" href="/#showroom">Back to the showroom</a></div>`;
        load();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false; btn.textContent = "Try again";
        if (err.status === 409) { m.close(); load(); }
      }
    };
  }

  document.addEventListener("uq:city", load);
  await load();
})();
