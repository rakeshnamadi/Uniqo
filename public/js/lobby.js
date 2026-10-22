/* UNIQO Design Lobby - a game-style dressing room for the customer's own look */
(async () => {
  const { api, esc, toast, store } = UQ;
  const $ = (id) => document.getElementById(id);
  const app = $("app");

  let cfg;
  try { await UQ.loadSite(); cfg = await api("/api/lobby"); }
  catch (e) { toast(e.message, true); return; }
  if (!cfg.enabled) {
    app.insertAdjacentHTML("beforeend", `<div class="lb-closed"><div><h2 class="section-title" style="color:#fff">The Design Lobby is resting</h2><p class="muted">Our atelier is preparing new fabrics. Meanwhile, explore the showroom.</p><a class="btn gold" href="/#showroom">Enter the showroom</a></div></div>`);
    ["rail", "panel", "stage", "sheet"].forEach((id) => $(id).remove());
    return;
  }
  const money = (n) => UQ.money(n);
  const showPrice = cfg.show_estimate;
  const find = (arr, k) => arr.find((x) => x.key === k) || arr[0];

  /* ---------------- state ---------------- */
  const DEFAULT = { sil: "anarkali", fab: "georgette", col: "#b0245a", acc: "#c9a05a", neck: "sweetheart", slv: "elbow", len: "floor",
    emb: ["gota"], dup: "none", belt: false, lining: false, pockets: false, skin: "#c98e66" };
  const valid = (L) => {
    const v = { ...DEFAULT, ...L };
    const ok = (arr, k) => arr.some((x) => x.key === k);
    if (!ok(cfg.silhouettes, v.sil)) v.sil = cfg.silhouettes[0].key;
    if (!ok(cfg.fabrics, v.fab)) v.fab = cfg.fabrics[0].key;
    if (!ok(cfg.necklines, v.neck)) v.neck = "round";
    if (!ok(cfg.sleeves, v.slv)) v.slv = "none";
    if (!ok(cfg.lengths, v.len)) v.len = "ankle";
    if (!/^#[0-9a-f]{6}$/i.test(v.col)) v.col = DEFAULT.col;
    if (!/^#[0-9a-f]{6}$/i.test(v.acc)) v.acc = DEFAULT.acc;
    if (!cfg.skins.includes(v.skin)) v.skin = DEFAULT.skin;
    v.emb = (Array.isArray(v.emb) ? v.emb : []).filter((k) => ok(cfg.embellishments, k));
    if (!["none", "draped", "shoulder"].includes(v.dup)) v.dup = "none";
    if (v.sil === "saree") v.dup = "none";
    if (!["aline", "sheath", "kurta", "anarkali"].includes(v.sil)) { v.belt = false; v.pockets = false; } // no waist/hip to hold them
    return v;
  };
  const encode = (L) => btoa(unescape(encodeURIComponent(JSON.stringify(L)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const decode = (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return null; } };

  function initial() {
    const m = location.hash.match(/look=([\w-]+)/);
    if (m) { const d = decode(m[1]); if (d) return valid(d); }
    const q = new URLSearchParams(location.search);
    if (q.get("base")) return valid({ sil: q.get("base"), col: q.get("col") || DEFAULT.col });
    return valid(store.get("uq_lobby_last", DEFAULT));
  }
  let L = initial(), view = "front", cat = "sil", prev = null;
  const past = [], future = [];

  function set(patch, opts = {}) {
    const next = valid({ ...L, ...patch });
    if (JSON.stringify(next) === JSON.stringify(L)) return;
    past.push(L); if (past.length > 60) past.shift(); future.length = 0;
    prev = UQLook.compute(L, cfg);
    L = next; commit(opts.anim || "pop");
  }
  function commit(anim) {
    store.set("uq_lobby_last", L);
    history.replaceState(null, "", "#look=" + encode(L));
    renderAll(anim);
  }
  const undo = () => { if (!past.length) return; prev = UQLook.compute(L, cfg); future.push(L); L = past.pop(); commit("pop"); };
  const redo = () => { if (!future.length) return; prev = UQLook.compute(L, cfg); past.push(L); L = future.pop(); commit("pop"); };

  /* ---------------- categories ---------------- */
  const ICON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
  const CATS = [
    { k: "sil", label: "Silhouette", icon: ICON('<path d="M9 3l-2 4 2 2-4 12h14L15 9l2-2-2-4z"/>') },
    { k: "fab", label: "Fabric", icon: ICON('<path d="M4 6c4-3 12 3 16 0v12c-4 3-12-3-16 0z"/><path d="M4 10c4-3 12 3 16 0"/>') },
    { k: "col", label: "Colour", icon: ICON('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-1-1.6-1-2.6 1-1.4 2-1.4h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="16" cy="8" r="1.2"/>') },
    { k: "neck", label: "Neckline", icon: ICON('<path d="M5 4c2 6 12 6 14 0M5 4v16h14V4"/>') },
    { k: "slv", label: "Sleeves", icon: ICON('<path d="M4 8l6-4h4l6 4-3 5-3-2v9H10v-9l-3 2z"/>') },
    { k: "len", label: "Length", icon: ICON('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>') },
    { k: "emb", label: "Handwork", icon: ICON('<path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14 3 9.5 9.5 9z"/>') },
    { k: "ext", label: "Extras", icon: ICON('<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2"/>') },
    { k: "ava", label: "Avatar", icon: ICON('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>') },
  ];
  $("rail").innerHTML = CATS.map((c) => `<button type="button" data-cat="${c.k}" aria-label="${c.label}">${c.icon}<span>${c.label}</span></button>`).join("");
  $("rail").onclick = (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; renderPanel(); renderRail(); $("panel").scrollTop = 0; if (innerWidth <= 1080) $("panel").scrollIntoView({ behavior: "smooth", block: "start" }); } };
  const renderRail = () => $("rail").querySelectorAll("[data-cat]").forEach((b) => b.classList.toggle("on", b.dataset.cat === cat));

  /* ---------------- panel (the "item shop") ---------------- */
  let thumbN = 0;
  const thumb = (patch, crop = "full") => UQLook.svg({ ...L, ...patch }, { id: "t" + thumbN++, crop, view: "front" });
  const card = (i, on, attrs, inner, tag = "") => `<button type="button" class="lb-card ${on ? "on" : ""}" style="--i:${i}" ${attrs}>${tag}${inner}</button>`;

  function renderPanel() {
    thumbN = 0;
    const p = $("panel");
    const c = UQLook.compute(L, cfg);
    let h = "";
    if (cat === "sil") {
      h = `<h2>Silhouette</h2><p class="lead">The foundation of your look. Every card shows your current choices on that cut.</p><div class="lb-grid">` +
        cfg.silhouettes.map((s, i) => card(i, L.sil === s.key, `data-set="sil" data-v="${s.key}"`,
          `<div class="lb-thumb">${thumb({ sil: s.key })}</div><b>${esc(s.label)}</b><small>${esc(s.desc)}</small>${showPrice ? `<span class="lb-price">from ${money(s.base)}</span>` : ""}`)).join("") + "</div>";
    } else if (cat === "fab") {
      const curSil = find(cfg.silhouettes, L.sil);
      h = `<h2>Fabric</h2><p class="lead">Touch matters. Each fabric changes how your ${esc(curSil.label.toLowerCase())} drapes, breathes and shines.</p>
        <div class="lb-legend"><span>Comfort</span><span>Drape</span><span>Stretch</span><span>Breathe</span><span>Formal</span></div><div style="display:grid;gap:8px">` +
        cfg.fabrics.map((f, i) => {
          const best = (f.best || []).includes(L.sil);
          return card(i, L.fab === f.key, `data-set="fab" data-v="${f.key}"`,
            `<div class="lb-fab" style="padding:0"><div class="sw">${UQLook.swatch(f.key, L.col, L.acc, "sw" + i)}</div><div>
              <div class="row"><b>${esc(f.label)}</b>${best ? '<span class="lb-tag best">★ Best match</span>' : `<span class="tagline">${esc(f.tag)}</span>`}</div>
              <small>${esc(f.desc)}</small>
              <div class="mini">${["comfort", "drape", "stretch", "breathability", "formality"].map((k) => `<i data-k="${k}" style="--v:${f.stats[k]}"></i>`).join("")}</div>
              ${showPrice ? `<span class="lb-price">${money(f.rate)} / metre · ${esc(f.gsm)} GSM</span>` : `<span class="lb-price">${esc(f.gsm)} GSM</span>`}
            </div></div>`);
        }).join("") + "</div>";
    } else if (cat === "col") {
      const sw = (arr, key) => arr.map((x) => `<button type="button" class="lb-sw ${L[key].toLowerCase() === x.hex.toLowerCase() ? "on" : ""}" style="background:${x.hex}" data-set="${key}" data-v="${x.hex}" title="${esc(x.name)}" aria-label="${esc(x.name)}"></button>`).join("");
      const named = (arr, hexv) => (arr.find((x) => x.hex.toLowerCase() === hexv.toLowerCase()) || { name: "Custom" }).name;
      h = `<h2>Colour</h2><p class="lead">Choose the main colour of your fabric, then the metal of your trims and handwork.</p>
        <div class="lb-sub"><span>Main colour</span><span style="color:var(--txt)">${esc(named(cfg.colors, L.col))}</span></div><div class="lb-swatches">${sw(cfg.colors, "col")}</div>
        <label class="lb-custom"><input type="color" id="customCol" value="${L.col}"> Mix your own colour</label>
        <div class="lb-sub"><span>Trim &amp; handwork</span><span style="color:var(--txt)">${esc(named(cfg.accents, L.acc))}</span></div><div class="lb-swatches">${sw(cfg.accents, "acc")}</div>`;
    } else if (cat === "neck") {
      h = `<h2>Neckline</h2><p class="lead">The frame for your face. Small change, big character.</p><div class="lb-grid three">` +
        cfg.necklines.map((n, i) => card(i, L.neck === n.key, `data-set="neck" data-v="${n.key}"`, `<div class="lb-thumb">${thumb({ neck: n.key }, "bodice")}</div><b>${esc(n.label)}</b>`)).join("") + "</div>";
    } else if (cat === "slv") {
      h = `<h2>Sleeves</h2><p class="lead">From bare shoulders to dramatic bells.${["chiffon", "georgette", "chanderi"].includes(L.fab) ? " Your sheer fabric will let the skin glow through." : ""}</p><div class="lb-grid three">` +
        cfg.sleeves.map((s, i) => card(i, L.slv === s.key, `data-set="slv" data-v="${s.key}"`, `<div class="lb-thumb">${thumb({ slv: s.key }, "arms")}</div><b>${esc(s.label)}</b>`)).join("") + "</div>";
    } else if (cat === "len") {
      const forced = L.sil === "saree" ? "Sarees are always floor-length." : L.sil === "lehenga" ? "Lehengas are cut ankle-length or longer." : "";
      h = `<h2>Length</h2><p class="lead">${forced || (L.sil === "kurta" ? "For a kurta set this is the kurta's length. The palazzos stay full length." : "Where your hem meets the world.")}</p><div class="lb-grid">` +
        cfg.lengths.map((l, i) => card(i, UQLook.effLen(L.sil, L.len) === l.key, `data-set="len" data-v="${l.key}" ${UQLook.effLen(L.sil, l.key) !== l.key ? 'disabled style="opacity:.4"' : ""}`, `<div class="lb-thumb">${thumb({ len: l.key })}</div><b>${esc(l.label)}</b>`)).join("") + "</div>";
    } else if (cat === "emb") {
      h = `<h2>Handwork</h2><p class="lead">Layer as much craft as you like. Each one is done by hand, so each adds a few days.</p><div class="lb-grid">` +
        cfg.embellishments.map((e, i) => card(i, L.emb.includes(e.key), `data-toggle-emb="${e.key}" aria-pressed="${L.emb.includes(e.key)}"`,
          `<div class="lb-thumb">${thumb({ emb: L.emb.includes(e.key) ? L.emb : [...L.emb, e.key] }, e.key === "pearls" || e.key === "zari" ? "bodice" : "hem")}</div><b>${esc(e.label)}</b><small>${esc(e.desc)}</small><span class="lb-price">${showPrice ? `+ ${money(e.price)} · ` : ""}+${e.days} days</span>`)).join("") + "</div>";
    } else if (cat === "ext") {
      const ex = cfg.extras;
      const tog = (k, label, desc, price) => `<label class="lb-toggle"><b>${label}</b><input type="checkbox" data-bool="${k}" ${L[k] ? "checked" : ""}><small>${desc}${showPrice && price ? ` · + ${money(price)}` : ""}</small></label>`;
      h = `<h2>Extras</h2><p class="lead">The finishing touches that make it wearable, and yours.</p>
        ${L.sil !== "saree" ? `<div class="lb-sub"><span>Dupatta</span></div><div class="lb-grid three">${[["none", "None"], ["draped", "Draped"], ["shoulder", "On shoulder"]].map(([k, l], i) =>
          card(i, L.dup === k, `data-set="dup" data-v="${k}"`, `<div class="lb-thumb">${thumb({ dup: k })}</div><b>${l}</b>`)).join("")}</div>` : ""}
        <div class="lb-sub"><span>Finishing</span></div>
        ${["aline", "sheath", "kurta", "anarkali"].includes(L.sil) ? tog("belt", "Waist belt", "In your trim colour, defines the waist", ex.belt) : ""}
        ${tog("lining", "Full lining", "Soft inner lining for coverage and structure", ex.lining)}
        ${["aline", "sheath", "kurta", "anarkali"].includes(L.sil) ? tog("pockets", "Hidden pockets", "Because every outfit deserves pockets", ex.pockets) : ""}`;
    } else if (cat === "ava") {
      h = `<h2>Your avatar</h2><p class="lead">See the colours against your skin tone, or study the cut on our atelier mannequin.</p>
        <div class="lb-swatches">${cfg.skins.map((s) => `<button type="button" class="lb-sw ${L.skin === s ? "on" : ""}" data-set="skin" data-v="${s}" style="background:${s === "mannequin" ? "linear-gradient(135deg,#2a2420 50%,#c9a05a 50%)" : s}" aria-label="${s === "mannequin" ? "Mannequin" : "Skin tone"}" title="${s === "mannequin" ? "Atelier mannequin" : "Skin tone"}"></button>`).join("")}</div>
        <div class="lb-sub" style="margin-top:28px"><span>Start over</span></div>
        <button type="button" class="lb-ghost" id="resetBtn">Reset to the atelier's look</button>`;
    }
    p.innerHTML = h;
    p.querySelector("#customCol")?.addEventListener("change", (e) => set({ col: e.target.value }));
    p.querySelector("#resetBtn")?.addEventListener("click", () => set(DEFAULT, { anim: "spin" }));
  }
  $("panel").addEventListener("click", (e) => {
    const s = e.target.closest("[data-set]");
    if (s && !s.disabled) return set({ [s.dataset.set]: s.dataset.v });
    const t = e.target.closest("[data-toggle-emb]");
    if (t) { const k = t.dataset.toggleEmb; set({ emb: L.emb.includes(k) ? L.emb.filter((x) => x !== k) : [...L.emb, k] }); }
  });
  $("panel").addEventListener("change", (e) => { const b = e.target.closest("[data-bool]"); if (b) set({ [b.dataset.bool]: b.checked }); });

  /* ---------------- stage: real-time 3D (WebGL2) with the SVG avatar as fallback ---------------- */
  const can3d = typeof UQ3D !== "undefined" && UQ3D.supported();
  const lowData = navigator.connection && navigator.connection.saveData;
  let mode3d = can3d && store.get("uq_lobby_3d", !lowData);
  let g3 = null, shownView = "";
  const setViewLabel = (v) => { if (v !== shownView) { shownView = v; $("viewLabel").textContent = mode3d ? (v === "front" ? "Front · 360°" : "Back · 360°") : v === "front" ? "Front" : "Back"; } };
  function ensure3d() {
    if (g3) return true;
    try {
      $("avatar").innerHTML = "";
      g3 = UQ3D.mount($("avatar"), {
        onView: setViewLabel,
        onFail: () => { g3 = null; mode3d = false; toast("3D view isn't available on this device, so we're showing 2D."); renderStage("pop"); },
      });
    } catch (e) { console.warn("3D unavailable:", e); g3 = null; }
    if (!g3) mode3d = false;
    return !!g3;
  }
  function renderStage(anim) {
    const av = $("avatar");
    $("dimBtn").hidden = !can3d;
    if (mode3d && ensure3d()) {
      av.classList.add("is3d");
      g3.setLook(L, cfg);
    } else {
      if (g3) { g3.destroy(); g3 = null; }
      av.classList.remove("is3d");
      const draw = () => (av.innerHTML = UQLook.svg(L, { id: "main", view, label: "Your avatar wearing your look" }));
      av.classList.remove("pop", "spin"); void av.offsetWidth;
      if (anim === "spin") { av.classList.add("spin"); setTimeout(draw, 330); } else { draw(); if (anim) av.classList.add(anim); }
      shownView = ""; setViewLabel(view);
    }
    $("dimBtn").textContent = mode3d ? "2D" : "3D";
    $("dimBtn").title = mode3d ? "Switch to the 2D sketch (D)" : "Switch to the 3D avatar (D)";
    $("undoBtn").disabled = !past.length; $("redoBtn").disabled = !future.length;
  }
  let dragX = null;   // 2D only: a horizontal drag turns the sketch around (3D handles its own drag)
  $("avatar").addEventListener("pointerdown", (e) => { if (!g3) dragX = e.clientX; });
  addEventListener("pointerup", (e) => { if (dragX !== null && Math.abs(e.clientX - dragX) > 50) flip(); dragX = null; });
  const flip = () => { if (g3) { g3.flip(); return; } view = view === "front" ? "back" : "front"; renderStage("spin"); };
  const toggle3d = () => { if (!can3d) return; mode3d = !mode3d; store.set("uq_lobby_3d", mode3d); shownView = ""; renderStage("pop"); };

  function surprise() {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    const sil = r(cfg.silhouettes).key;
    const goodFabs = cfg.fabrics.filter((f) => (f.best || []).includes(sil));
    const fab = (Math.random() < 0.8 && goodFabs.length ? r(goodFabs) : r(cfg.fabrics)).key;
    const emb = cfg.embellishments.filter(() => Math.random() < 0.28).map((e) => e.key).slice(0, 3);
    set({ sil, fab, col: r(cfg.colors).hex, acc: r(cfg.accents.slice(0, 4)).hex, neck: r(cfg.necklines).key, slv: r(cfg.sleeves).key,
      len: r(cfg.lengths).key, emb, dup: Math.random() < 0.35 ? r(["draped", "shoulder"]) : "none", belt: Math.random() < 0.25,
      pockets: Math.random() < 0.3, lining: UQLook.FX[fab].sheer >= 0.18 }, { anim: "spin" });
  }

  /* ---------------- build sheet (stats, fabric, rarity, price) ---------------- */
  const STAT_LABEL = { comfort: "Comfort", drape: "Drape", stretch: "Stretch", breathability: "Breathability", formality: "Formality" };
  const lookCode = (l) => { let h = 2166136261; const s = JSON.stringify(l); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6); };

  function renderSheet() {
    const c = UQLook.compute(L, cfg);
    const stars = { Essential: 1, Signature: 2, Couture: 3, Heirloom: 4 }[c.tier];
    $("tier").dataset.tier = c.tier;
    $("tier").innerHTML = `<small>Look tier</small><b>${c.tier}</b><span class="stars">${"★".repeat(stars)}${"☆".repeat(4 - stars)}</span>`;
    $("notes").innerHTML = c.notes.slice(0, 3).map((n) => `<div class="lb-note ${n.t}">${esc(n.m)}</div>`).join("");
    $("lookCode").textContent = "UQ-L · " + lookCode(L);
    const before = prev && prev.stats;
    $("sheet").innerHTML = `
      <div class="lb-block lb-notes-block"><h3><span>Atelier notes</span><span>${c.tier}</span></h3>${c.notes.map((n) => `<div class="lb-note ${n.t}">${esc(n.m)}</div>`).join("")}</div>
      <div class="lb-block"><h3><span>Wear stats</span><span>1–5</span></h3>
        ${Object.entries(STAT_LABEL).map(([k, l]) => {
          const v = c.stats[k], d = before ? v - before[k] : 0;
          return `<div class="lb-stat" data-k="${k}"><span>${l}</span><span class="track">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= v ? "on" : ""}"></i>`).join("")}</span><span class="val">${v}</span>${d ? `<span class="lb-delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</span>` : ""}</div>`;
        }).join("")}
      </div>
      <div class="lb-block"><h3><span>Your fabric</span><span>${esc(c.fab.tag)}</span></h3>
        <div class="lb-fabcard"><div class="sw">${UQLook.swatch(c.fab.key, L.col, L.acc, "sheet")}</div><div><b>${esc(c.fab.label)}</b><p>${esc(c.fab.desc)}</p></div></div>
        <div class="lb-specs"><div><small>Weight</small>${esc(c.fab.gsm)} GSM</div><div><small>Care</small>${esc(c.fab.care)}</div>
          <div><small>Fabric used</small>${c.meters.toFixed(1)} m</div><div><small>Made in</small>${c.days}–${c.days + 4} days</div></div>
      </div>
      <div class="lb-block lb-rare"><h3><span>Rarity</span><span>Edition of one</span></h3>
        <div class="big">1 of 1</div>
        <p>Your look is one of <span class="combos">${c.combos.toLocaleString("en-IN")}</span> possible combinations. Once made, it's made for you alone.</p>
      </div>
      <div class="lb-cta">
        ${showPrice ? `<div class="lb-est"><small>Estimate</small><b>${money(c.estimate)}</b></div>` : ""}
        <button type="button" class="btn gold" data-commission>Commission this look</button>
        <button type="button" class="lb-ghost" data-save style="justify-content:center">Save design${me.signedIn ? " to my account" : ""}</button>
        <p class="fine">No payment now. Your stylist confirms fabric, fit and final price on a call.</p>
      </div>`;
    $("dock").innerHTML = `<div class="est"><small>${c.tier} · ${showPrice ? "estimate" : "one of a kind"}</small><b>${showPrice ? money(c.estimate) : "1 of 1"}</b></div>
      <button type="button" class="lb-ghost" data-stats>Stats</button><button type="button" class="btn gold" data-commission>Commission</button>`;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-commission]")) commission();
    else if (e.target.closest("[data-save]")) saveLook();
    else if (e.target.closest("[data-stats]")) openSheet();
  });
  function openSheet() {
    const sh = $("sheet");
    sh.classList.add("open");
    const scrim = document.createElement("div"); scrim.className = "lb-scrim"; document.body.appendChild(scrim);
    scrim.onclick = () => { sh.classList.remove("open"); scrim.remove(); };
  }

  function renderAll(anim) { renderStage(anim); renderSheet(); renderPanel(); renderRail(); $("wardCount").textContent = myLooks.length + wardrobe().length; }

  /* ---------------- account: designs saved under the customer's mobile number ---------------- */
  let me = { signedIn: false }, myLooks = [];
  const wardrobe = () => store.get("uq_wardrobe", []) || [];          // guests: this device only
  const lookTitle = (l) => { const c = UQLook.compute(l, cfg); return `${c.fab.label} ${c.sil.label}`; };
  async function refreshMe() {
    try { me = await api("/api/me"); } catch { me = { signedIn: false }; }
    myLooks = me.signedIn ? (await api("/api/me/looks").catch(() => ({ looks: [] }))).looks : [];
    $("meLabel").textContent = me.signedIn ? me.name.split(" ")[0] : "Sign in";
    $("meBtn").classList.toggle("on", me.signedIn);
    $("wardCount").textContent = myLooks.length + wardrobe().length;
    renderSheet();
  }

  function signIn(then) {
    const m = UQ.modal("Your Uniqo account", `
      <p class="fine" style="margin:0 0 16px;font-size:14px">Save your designs under your mobile number and open them on any phone or laptop. No password to remember: just a PIN you choose.</p>
      <form id="siForm" class="form-grid" novalidate>
        <div class="field full"><label for="si-mobile">Mobile number</label><div class="prefix"><span>+91</span><input id="si-mobile" name="smobile" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" value="${esc((store.get("uq_me", {}) || {}).mobile || "")}"></div></div>
        <div class="field full"><label for="si-pin">PIN (4–6 digits)</label><input id="si-pin" name="spin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="••••"></div>
        <div class="field full hidden" id="si-name-row"><label for="si-name">Your name</label><input id="si-name" name="sname" autocomplete="name" maxlength="80" placeholder="So your stylist knows who designed it"></div>
        <p class="err full" id="si-err" style="color:#ffb4a2;margin:0;min-height:1em"></p>
        <div class="full"><button class="btn gold block" type="submit">Continue</button></div>
        <p class="fine full">New here? Enter your mobile and choose a PIN, and we'll create your account. Please don't reuse your bank PIN.</p>
      </form>`, true);
    const f = m.querySelector("#siForm"), el = (n) => f.elements.namedItem(n);
    ["smobile", "spin"].forEach((n) => (el(n).oninput = () => (el(n).value = el(n).value.replace(/\D/g, ""))));
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = m.querySelector("#si-err"); err.textContent = "";
      if (!/^[6-9]\d{9}$/.test(el("smobile").value)) return (err.textContent = "Enter a valid 10-digit mobile number");
      if (!/^\d{4,6}$/.test(el("spin").value)) return (err.textContent = "Your PIN is 4 to 6 digits");
      const btn = f.querySelector("[type=submit]"); btn.disabled = true;
      try {
        const r = await api("/api/me/login", { method: "POST", body: { mobile: el("smobile").value, pin: el("spin").value, name: el("sname").value.trim() } });
        if (r.needsName) {                                           // first visit: one more field
          m.querySelector("#si-name-row").classList.remove("hidden");
          m.querySelector(".sheet-head h3").textContent = "Create your account";
          btn.textContent = "Create account"; btn.disabled = false; el("sname").focus();
          return;
        }
        store.set("uq_me", { ...(store.get("uq_me", {}) || {}), name: r.name, mobile: el("smobile").value });
        m.close(); await refreshMe();
        toast(`Welcome, ${r.name.split(" ")[0]}. Your designs are saved to your account ✦`);
        then && then();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    };
    setTimeout(() => el(el("smobile").value ? "spin" : "smobile").focus(), 50);
  }
  function accountMenu() {
    const m = UQ.modal("Your account", `
      <p style="margin:0 0 6px">Signed in as <b>${esc(me.name)}</b></p><p class="fine" style="margin:0 0 20px">+91 ${esc(me.mobile)} · ${myLooks.length} saved design${myLooks.length === 1 ? "" : "s"}</p>
      <div style="display:grid;gap:10px"><button class="btn gold" type="button" data-open-ward>My designs</button><button class="lb-ghost" type="button" data-signout style="justify-content:center">Sign out</button></div>`, true);
    m.querySelector("[data-open-ward]").onclick = () => { m.close(); openWardrobe(); };
    m.querySelector("[data-signout]").onclick = async () => { await api("/api/me/logout", { method: "POST", body: {} }); m.close(); await refreshMe(); toast("Signed out. Your designs stay safe in your account."); };
  }
  $("meBtn").onclick = () => (me.signedIn ? accountMenu() : signIn());

  async function saveLook() {
    if (me.signedIn) {
      try { await api("/api/me/looks", { method: "POST", body: { title: lookTitle(L), look: L } }); await refreshMe(); toast("Saved to your account. Open it on any device ✦"); }
      catch (x) { toast(x.message, true); }
      return;
    }
    const list = wardrobe();
    if (list.length >= 8) return toast("This device holds 8 looks. Sign in to save more.", true);
    list.unshift({ name: lookTitle(L), look: L, at: Date.now() });
    store.set("uq_wardrobe", list); $("wardCount").textContent = myLooks.length + list.length;
    toast("Saved on this device. Sign in to keep it on every device ✦");
  }

  function openWardrobe() {
    const local = wardrobe();
    const card = (w, i, src) => `<div class="lb-card" style="--i:${i}"><div class="lb-thumb">${UQLook.svg(w.look, { id: src + i })}</div>
      <b>${esc(w.title || w.name)}</b><small>${new Date((w.updated_at ? w.updated_at * 1000 : w.at)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small>
      <div class="acts"><button data-wear="${src}:${i}">Wear</button>${src === "dev" && me.signedIn ? `<button data-move="${i}" title="Save to your account">Keep</button>` : ""}<button data-del="${src}:${i}">Remove</button></div></div>`;
    const acct = me.signedIn
      ? `<div class="lb-sub" style="margin-top:0"><span>Saved to your account · ${esc(me.name)}</span><span>${myLooks.length}/40</span></div>
         ${myLooks.length ? `<div class="lb-ward">${myLooks.map((w, i) => card(w, i, "acc")).join("")}</div>` : '<p class="muted">Nothing saved to your account yet.</p>'}`
      : `<div class="lb-block" style="margin-bottom:18px;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap">
           <span style="font-size:14px">Sign in with your mobile to keep designs on <b>every</b> device.</span><button class="btn gold sm" type="button" data-signin>Sign in</button></div>`;
    const dev = local.length ? `<div class="lb-sub"><span>On this device</span><span>${local.length}/8</span></div><div class="lb-ward">${local.map((w, i) => card(w, i, "dev")).join("")}</div>` : "";
    const m = UQ.modal("Your wardrobe", acct + dev + (!myLooks.length && !local.length ? '<p class="muted" style="text-align:center;padding:20px 0">No saved designs yet. Tap <b>Save</b> to keep a look you love.</p>' : ""));
    m.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.signin !== undefined) { m.close(); return signIn(openWardrobe); }
      if (b.dataset.wear) { const [s, i] = b.dataset.wear.split(":"); set((s === "acc" ? myLooks : local)[+i].look, { anim: "spin" }); m.close(); }
      if (b.dataset.move) {
        const w = local[+b.dataset.move];
        try { await api("/api/me/looks", { method: "POST", body: { title: w.name, look: w.look } }); local.splice(+b.dataset.move, 1); store.set("uq_wardrobe", local); await refreshMe(); m.close(); openWardrobe(); toast("Moved to your account"); }
        catch (x) { toast(x.message, true); }
      }
      if (b.dataset.del) {
        const [s, i] = b.dataset.del.split(":");
        if (s === "acc") { try { await api(`/api/me/looks/${myLooks[+i].id}`, { method: "DELETE" }); } catch (x) { return toast(x.message, true); } }
        else { local.splice(+i, 1); store.set("uq_wardrobe", local); }
        await refreshMe(); m.close(); openWardrobe();
      }
    });
  }
  $("wardrobeBtn").onclick = openWardrobe;
  refreshMe();

  $("shareBtn").onclick = async () => {
    const url = location.origin + "/lobby#look=" + encode(L);
    try {
      if (navigator.share && innerWidth < 900) await navigator.share({ title: "My Uniqo look", text: "I designed this in the Uniqo Design Lobby", url });
      else { await navigator.clipboard.writeText(url); toast("Link copied. Anyone can open your exact look."); }
    } catch { /* user cancelled share */ }
  };

  /* ---------------- commission ---------------- */
  function commission() {
    const c = UQLook.compute(L, cfg);
    const saved = store.get("uq_me", {}) || {};
    const city = store.get("uq_city") || UQ.site?.default_location;
    const sum = [["Silhouette", c.sil.label], ["Fabric", c.fab.label], ["Neckline", find(cfg.necklines, L.neck).label], ["Sleeves", find(cfg.sleeves, L.slv).label],
      ["Length", find(cfg.lengths, c.len).label], ["Handwork", L.emb.map((k) => find(cfg.embellishments, k).label).join(", ") || "None"]];
    const m = UQ.modal("Commission your look", `
      <div class="lb-summary"><div class="lb-thumb">${UQLook.svg(L, { id: "cm" })}</div>
        <ul>${sum.map(([k, v]) => `<li>${k}: <b>${esc(v)}</b></li>`).join("")}<li>Tier: <b>${c.tier}</b></li>${showPrice ? `<li>Estimate: <b>${money(c.estimate)}</b></li>` : ""}</ul></div>
      <form id="cmForm" class="form-grid" novalidate>
        <div class="field full"><label for="c-name">Full name</label><input id="c-name" name="cname" autocomplete="name" maxlength="80" value="${esc(saved.name || "")}"><span class="err"></span></div>
        <div class="field"><label for="c-mobile">Mobile number</label><div class="prefix"><span>+91</span><input id="c-mobile" name="cmobile" type="tel" inputmode="numeric" maxlength="10" value="${esc(saved.mobile || "")}"></div><span class="err"></span></div>
        <div class="field"><label for="c-city">City</label><select id="c-city" name="ccity">${cfg.locations.map((l) => `<option ${l === city ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
        <div class="field full"><label for="c-notes">Anything else? (optional)</label><textarea id="c-notes" name="cnotes" maxlength="500" placeholder="Event date, inspiration, measurements…"></textarea></div>
        <div class="full"><button class="btn gold block" type="submit">Send to my stylist</button></div>
        <p class="fine full">No payment now. A stylist will call within 24 hours to refine the fabric, fit and final price. Your look is then made exactly once.</p>
      </form>`, true);
    const f = m.querySelector("#cmForm"), el = (n) => f.elements.namedItem(n);
    el("cmobile").oninput = () => (el("cmobile").value = el("cmobile").value.replace(/\D/g, "").slice(0, 10));
    f.onsubmit = async (e) => {
      e.preventDefault();
      const errs = { cname: el("cname").value.trim().length < 2 && "Please enter your full name", cmobile: !/^[6-9]\d{9}$/.test(el("cmobile").value) && "Enter a valid 10-digit mobile number" };
      let first = null;
      Object.entries(errs).forEach(([k, msg]) => { el(k).closest(".field").querySelector(".err").textContent = msg || ""; if (msg && !first) first = el(k); });
      if (first) return first.focus();
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
      try {
        const r = await api("/api/looks", { method: "POST", body: { look: L, name: el("cname").value.trim(), mobile: el("cmobile").value, location: el("ccity").value, notes: el("cnotes").value.trim() } });
        store.set("uq_me", { ...saved, name: el("cname").value.trim(), mobile: el("cmobile").value });
        m.querySelector(".sheet-head h3").textContent = "Your commission is in";
        m.querySelector(".sheet-body").innerHTML = `<div class="certificate"><img class="cert-seal" src="/assets/seal.svg" alt="">
            <small>Uniqo · Commission card</small><h3>${esc(c.fab.label)} ${esc(c.sil.label)}</h3>
            <div class="no">1 of 1</div><span style="letter-spacing:.2em;text-transform:uppercase;font-size:12px">Designed by ${esc(el("cname").value.trim())}</span>
            <div class="meta"><span>Reference<b>${esc(r.ref)}</b></span><span>Look code<b>${lookCode(L)}</b></span>${r.estimate ? `<span>Estimate<b>${money(r.estimate)}</b></span>` : ""}</div></div>
          <p style="text-align:center;margin:20px 0 6px">Our stylist will call <b>+91 ${esc(el("cmobile").value)}</b> within 24 hours to bring your design to life.</p>
          <div style="text-align:center;margin-top:16px"><button class="btn gold" type="button" data-close-cm>Keep designing</button></div>`;
        m.querySelector("[data-close-cm]").onclick = () => m.close();
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = "Try again"; }
    };
  }

  /* ---------------- tools + keyboard ---------------- */
  $("undoBtn").onclick = undo; $("redoBtn").onclick = redo; $("flipBtn").onclick = flip; $("surpriseBtn").onclick = surprise; $("dimBtn").onclick = toggle3d;
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select") || document.querySelector(".modal")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) undo(); else if (k === "y" || (k === "z" && e.shiftKey)) redo();
    else if (k === "f") flip(); else if (k === "r" && !e.ctrlKey && !e.metaKey) surprise(); else if (k === "d") toggle3d();
    else if (/^[1-9]$/.test(k)) { cat = CATS[+k - 1].k; renderPanel(); renderRail(); }
  });

  renderAll("pop");
})();
