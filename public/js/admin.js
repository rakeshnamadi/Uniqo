/* UNIQO admin panel - single-page app (hash routing, no framework) */
(() => {
  const root = document.getElementById("root");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let O = null;           // overview payload
  let dirty = false;      // unsaved editor changes
  let lastHash = location.hash;
  const ui = { designFilter: "all", designSearch: "", orderStatus: "", orderCity: "", orderSearch: "" };

  const money = (n) => (O?.settings?.currency || "₹") + Number(n || 0).toLocaleString("en-IN");
  const pad = (n) => String(n).padStart(2, "0");
  const when = (t) => new Date(t * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const STATUS = { new: "New", confirmed: "Confirmed", in_making: "In making", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
  const SORTS = { manual: "Manual (your drag-and-drop order)", newest: "Newest first", price_asc: "Price: low to high", price_desc: "Price: high to low", scarcity: "Rarest first (fewest left in the customer's city)", popular: "Most popular (loves + orders)" };
  const PRICES = { visible: "Always show the price", reveal: "Hidden behind a “Reveal price” button", request: "Price on request (never shown online)" };
  const SPEC_LABELS = { fabric: "Fabric", lining: "Lining", weight: "Weight / GSM", fit: "Fit", neckline: "Neckline", sleeve: "Sleeve", length: "Length", closure: "Closure", embellishment: "Embellishment", care: "Care", making_days: "Making time" };
  const FEEL = { comfort: "Comfort", drape: "Drape & flow", stretch: "Stretch", breathability: "Breathability", formality: "Formality" };
  const EMO = { love: "😍", like: "👍", meh: "🤔" };

  const I = {
    dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    designs: '<path d="M8 3l-4 4 3 3v11h10V10l3-3-4-4-4 3z"/>',
    orders: '<path d="M6 3h12l1 5H5zM5 8h14v13H5zM9 12h6"/>',
    feedback: '<path d="M4 5h16v11H8l-4 4z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
    out: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lobby: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M5 21h14"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${I[k]}</svg>`;

  async function api(url, opts = {}) {
    const init = { method: opts.method || "GET", headers: {} };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.endsWith("/login")) { showLogin(); throw new Error(data.error || "Please sign in"); }
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }
  let toastT;
  function toast(msg, err) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3000);
  }
  const refresh = async () => { O = await api("/api/admin/overview"); };

  /* ---------------- auth ---------------- */
  function showLogin() {
    root.innerHTML = `<div class="login"><form id="login">
      <div class="login-logo">${window.UQ_LOGO || ""}</div>
      <div><h1 style="font-size:34px">Atelier admin</h1><p class="muted" style="margin:6px 0 0">Manage the showroom floor</p></div>
      <div class="field" style="text-align:left"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required autofocus></div>
      <button class="btn block" type="submit">Sign in</button>
      <a class="muted" href="/" style="font-size:13px">← Back to the showroom</a></form></div>`;
    document.getElementById("login").onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button"); b.disabled = true;
      try { await api("/api/admin/login", { method: "POST", body: { password: document.getElementById("pw").value } }); await refresh(); route(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    };
  }

  /* ---------------- shell ---------------- */
  function shell(active, html) {
    const newOrders = O.orders.filter((o) => o.status === "new").length;
    const newLooks = (O.looks || []).filter((l) => l.status === "new").length;
    const links = [["dashboard", "dash", "Dashboard"], ["designs", "designs", "Designs"], ["orders", "orders", "Orders"], ["lobby", "lobby", "Lobby"], ["feedback", "feedback", "Feedback"], ["settings", "settings", "Settings"]];
    root.innerHTML = `<div class="shell">
      <aside class="side">
        <a class="logo" href="#/dashboard" aria-label="Dashboard">${window.UQ_LOGO || ""}</a>
        ${links.map(([k, ic, l]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${svg(ic)}${l}${k === "orders" && newOrders ? `<span class="count">${newOrders}</span>` : ""}${k === "lobby" && newLooks ? `<span class="count">${newLooks}</span>` : ""}</a>`).join("")}
        <div class="grow"></div>
        <div class="foot-links"><a href="/" target="_blank" rel="noopener">${svg("eye")}View showroom</a><a href="#" data-logout>${svg("out")}Sign out</a></div>
      </aside>
      <main class="main" id="main">${html}</main>
      <nav class="mob-tabs">${links.map(([k, ic, l]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${svg(ic)}${l}</a>`).join("")}</nav>
    </div>`;
    root.querySelector("[data-logout]").onclick = async (e) => { e.preventDefault(); await api("/api/admin/logout", { method: "POST", body: {} }); showLogin(); };
    return document.getElementById("main");
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, "") || "dashboard";
    const [page, id] = h.split("/");
    lastHash = location.hash; dirty = false;
    window.scrollTo(0, 0);
    if (page === "designs" && id) return editor(id === "new" ? null : +id);
    ({ dashboard, designs, orders, lobby: lobbyAdmin, feedback, settings }[page] || dashboard)();
  }
  window.addEventListener("hashchange", () => {
    if (dirty && !confirm("You have unsaved changes. Leave this page?")) { history.replaceState(null, "", lastHash); return; }
    route();
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------------- dashboard ---------------- */
  function dashboard() {
    const active = O.designs.filter((d) => d.status === "active");
    const live = O.orders.filter((o) => o.status !== "cancelled");
    const capacity = active.reduce((s, d) => s + d.editions.reduce((a, e) => a + e.limit, 0), 0);
    const claimed = active.reduce((s, d) => s + d.editions.reduce((a, e) => a + e.sold, 0), 0);
    const fb = O.designs.reduce((s, d) => ({ love: s.love + d.feedback.love, like: s.like + d.feedback.like, meh: s.meh + d.feedback.meh }), { love: 0, like: 0, meh: 0 });
    const fbTotal = fb.love + fb.like + fb.meh;
    const th = O.settings.low_stock_threshold;
    const alerts = active.flatMap((d) => d.editions.filter((e) => e.left <= th).map((e) => ({ d, e }))).sort((a, b) => a.e.left - b.e.left);
    const revenue = live.reduce((s, o) => s + o.total, 0);
    const loved = [...O.designs].sort((a, b) => (b.feedback.love * 2 + b.feedback.like) - (a.feedback.love * 2 + a.feedback.like)).slice(0, 5);
    shell("dashboard", `
      <div class="topbar"><h1>Good to see you.</h1><div class="actions"><a class="btn sm" href="#/designs/new">+ New design</a></div></div>
      <div class="kpis">
        <div class="kpi"><small>Live designs</small><b>${active.length}</b><span>${O.designs.length - active.length} draft or archived</span></div>
        <div class="kpi"><small>New orders</small><b>${O.orders.filter((o) => o.status === "new").length}</b><span>${live.length} active reservations</span></div>
        <div class="kpi"><small>Pieces claimed</small><b>${claimed}<span style="font-size:20px"> / ${capacity}</span></b><span>${capacity ? Math.round(claimed / capacity * 100) : 0}% of live editions</span></div>
        <div class="kpi"><small>Love rate</small><b>${fbTotal ? Math.round(fb.love / fbTotal * 100) : 0}%</b><span>${fbTotal} reactions · ${money(revenue)} reserved</span></div>
      </div>
      <div class="two-col">
        <div class="panel-card"><h2>Rarity alerts</h2><p class="sub">City editions with ${th} or fewer pieces left</p>
          ${alerts.length ? `<ul class="list-plain">${alerts.slice(0, 10).map(({ d, e }) => `<li><a href="#/designs/${d.id}"><b>${esc(d.data.name)}</b> · ${esc(e.location)}</a><span class="pill ${e.left ? "new" : "archived"}">${e.left ? `${e.left} left` : "Sold out"}</span></li>`).join("")}</ul>` : '<p class="muted">Every edition is healthy.</p>'}
        </div>
        <div class="panel-card"><h2>Latest reservations</h2><p class="sub">Call new customers within 24 hours</p>
          ${O.orders.length ? `<ul class="list-plain">${O.orders.slice(0, 6).map((o) => `<li><span><b>${esc(o.name)}</b> · ${esc(o.design_name)} #${pad(o.edition_no)} · ${esc(o.location)}<br><small class="muted">${when(o.created_at)} · <a href="tel:+91${esc(o.mobile)}">+91 ${esc(o.mobile)}</a></small></span><span class="pill ${o.status}">${STATUS[o.status]}</span></li>`).join("")}</ul><a class="link-btn" href="#/orders" style="display:inline-block;margin-top:12px">All orders →</a>` : '<p class="muted">No reservations yet. They will appear here.</p>'}
        </div>
      </div>
      <div class="panel-card" style="margin-top:18px"><h2>Interest signals</h2><p class="sub">Views, price reveals and reactions show what customers are drawn to</p>
        <div class="table-scroll"><table class="compare-table" style="min-width:520px"><tr><th>Design</th><th>Views</th><th>Price reveals</th><th>😍 / 👍 / 🤔</th><th>Orders</th></tr>
        ${loved.map((d) => `<tr><td><a href="#/designs/${d.id}"><b>${esc(d.data.name)}</b></a></td><td>${d.views}</td><td>${d.reveals}</td><td>${d.feedback.love} / ${d.feedback.like} / ${d.feedback.meh}</td><td>${d.orders}</td></tr>`).join("")}</table></div>
      </div>`);
  }

  /* ---------------- designs list ---------------- */
  function designs() {
    const f = ui.designFilter, q = ui.designSearch.toLowerCase();
    const canDrag = f === "all" && !q;
    const list = O.designs.filter((d) => (f === "all" || d.status === f) && (!q || (d.data.name + " " + d.data.category).toLowerCase().includes(q)));
    const counts = { all: O.designs.length, active: 0, draft: 0, archived: 0 };
    O.designs.forEach((d) => counts[d.status]++);
    const main = shell("designs", `
      <div class="topbar"><h1>Designs</h1><div class="actions"><a class="btn sm" href="#/designs/new">+ New design</a></div></div>
      <div class="toolbar">
        <div class="seg">${["all", "active", "draft", "archived"].map((k) => `<button data-f="${k}" class="${f === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)} (${counts[k]})</button>`).join("")}</div>
        <input class="input" type="search" placeholder="Search designs…" value="${esc(ui.designSearch)}" id="dsearch">
      </div>
      <p class="hint" style="margin:-4px 0 14px">Showroom order: <b>${esc(SORTS[O.settings.sort_mode])}</b>. ${O.settings.sort_mode === "manual" ? (canDrag ? "Drag rows or use ▲▼ to arrange the floor." : "Clear filters to rearrange.") : 'Switch to “Manual” in <a class="link-btn" href="#/settings">Settings</a> to use your own order.'}</p>
      <div class="d-list" id="dlist">${list.map((d) => rowHTML(d, canDrag)).join("") || '<div class="empty">No designs here yet.</div>'}</div>`);
    main.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { ui.designFilter = b.dataset.f; designs(); }));
    const s = main.querySelector("#dsearch");
    s.oninput = () => { ui.designSearch = s.value; const pos = s.selectionStart; designs(); const n = document.getElementById("dsearch"); n.focus(); n.setSelectionRange(pos, pos); };
    main.querySelector("#dlist").onclick = onRowAction;
    if (canDrag) wireDrag(main.querySelector("#dlist"));
  }
  function rowHTML(d, canDrag) {
    const sold = d.editions.reduce((a, e) => a + e.sold, 0), lim = d.editions.reduce((a, e) => a + e.limit, 0);
    const pm = d.effective_price_mode;
    return `<div class="d-row" data-id="${d.id}" ${canDrag ? 'draggable="true"' : ""}>
      <div class="handle">${canDrag ? `<button data-move="-1" title="Move up">▲</button><span>⋮⋮</span><button data-move="1" title="Move down">▼</button>` : ""}</div>
      <img src="${esc(d.data.images[0] || "")}" alt="">
      <div style="min-width:0">
        <h3>${esc(d.data.name)} <span class="pill ${d.status}">${d.status}</span>${d.data.featured ? '<span class="pill confirmed">Featured</span>' : ""}</h3>
        <div class="meta"><span>${esc(d.data.category)}</span><span><b>${money(d.data.price)}</b> · ${pm === "visible" ? "shown" : pm === "reveal" ? "reveal" : "on request"}</span><span><b>${sold}/${lim}</b> claimed</span><span>👁 ${d.views} · 🔓 ${d.reveals} · 😍 ${d.feedback.love}</span></div>
      </div>
      <div class="row-actions">
        <a class="mini-btn" href="#/designs/${d.id}">Edit</a>
        ${d.status === "active" ? `<a class="mini-btn" href="/design?d=${esc(d.slug)}" target="_blank" rel="noopener">View</a>` : ""}
        ${d.status !== "active" ? `<button class="mini-btn" data-act="active">Publish</button>` : ""}
        ${d.status !== "archived" ? `<button class="mini-btn" data-act="archived">Archive</button>` : ""}
        <button class="mini-btn" data-act="duplicate">Duplicate</button>
        <button class="mini-btn danger" data-act="delete">Delete</button>
      </div></div>`;
  }
  async function onRowAction(e) {
    const row = e.target.closest(".d-row"); if (!row) return;
    const id = +row.dataset.id, d = O.designs.find((x) => x.id === id);
    const mv = e.target.closest("[data-move]");
    if (mv) {
      const ids = O.designs.map((x) => x.id), i = ids.indexOf(id), j = i + +mv.dataset.move;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return saveOrder(ids);
    }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "delete") {
        if (!confirm(`Delete “${d.data.name}” permanently?\n\nExisting orders are kept, but the design and its feedback are removed. Tip: Archive hides it from customers without deleting.`)) return;
        await api(`/api/admin/designs/${id}`, { method: "DELETE" }); toast("Design deleted");
      } else if (act === "duplicate") {
        const r = await api(`/api/admin/designs/${id}/duplicate`, { method: "POST", body: {} }); toast("Duplicated as a draft");
        await refresh(); location.hash = `#/designs/${r.id}`; return;
      } else {
        await api(`/api/admin/designs/${id}/status`, { method: "POST", body: { status: act } });
        toast(act === "active" ? "Published to the showroom" : "Archived and hidden from customers");
      }
      await refresh(); if (onList()) designs();
    } catch (err) { toast(err.message, true); }
  }
  const onList = () => /^#\/designs\/?$/.test(location.hash);
  async function saveOrder(ids) {
    try { await api("/api/admin/reorder", { method: "POST", body: { ids } }); await refresh(); if (onList()) designs(); toast("Showroom order saved"); }
    catch (err) { toast(err.message, true); }
  }
  function wireDrag(list) {
    let src = null;
    list.querySelectorAll(".d-row").forEach((r) => {
      r.addEventListener("dragstart", (e) => { src = r; r.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      r.addEventListener("dragend", () => { r.classList.remove("dragging"); list.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); });
      r.addEventListener("dragover", (e) => { e.preventDefault(); if (r !== src) r.classList.add("over"); });
      r.addEventListener("dragleave", () => r.classList.remove("over"));
      r.addEventListener("drop", (e) => {
        e.preventDefault(); if (!src || src === r) return;
        list.insertBefore(src, r);
        saveOrder([...list.querySelectorAll(".d-row")].map((x) => +x.dataset.id));
      });
    });
  }

  /* ---------------- design editor ---------------- */
  function blank() {
    return {
      name: "", category: "", badge: "New drop", tagline: "", story: "", occasions: [], featured: false,
      price: 0, price_mode: "default", images: [], colors: [], sizes: ["XS", "S", "M", "L", "XL", "XXL"],
      made_to_measure: true, mtm_delta: 0, addons: [],
      specs: Object.fromEntries(Object.keys(SPEC_LABELS).map((k) => [k, ""])),
      feel: { comfort: 3, drape: 3, stretch: 3, breathability: 3, formality: 3 },
      hotspots: [], editions: O.settings.locations.map((l) => ({ location: l, limit: 15 })),
    };
  }
  function editor(id) {
    const rec = id ? O.designs.find((d) => d.id === id) : null;
    if (id && !rec) { toast("Design not found", true); location.hash = "#/designs"; return; }
    const ed = rec ? JSON.parse(JSON.stringify(rec.data)) : blank();
    const meta = { id, status: rec ? rec.status : "draft", slug: rec ? rec.slug : "" };

    const setPath = (obj, path, val) => {
      const keys = path.split("."); let o = obj;
      keys.slice(0, -1).forEach((k) => (o = o[k]));
      o[keys[keys.length - 1]] = val;
    };
    const readVal = (el) => {
      if (el.type === "checkbox") return el.checked;
      if (el.dataset.type === "int") return parseInt(el.value.replace(/[^\d-]/g, ""), 10) || 0;
      if (el.dataset.type === "list") return el.value.split(",").map((s) => s.trim()).filter(Boolean);
      return el.value;
    };
    const input = (k, label, val, attrs = "") => `<div class="field"><label>${label}</label><input class="input" data-k="${k}" value="${esc(val)}" ${attrs}></div>`;

    function render() {
      const y = window.scrollY;
      const stats = rec ? `<div class="panel-card"><h2 style="font-size:22px">Performance</h2><ul class="list-plain" style="margin-top:10px">
          <li><span>Views</span><b>${rec.views}</b></li><li><span>Price reveals</span><b>${rec.reveals}</b></li>
          <li><span>😍 / 👍 / 🤔</span><b>${rec.feedback.love} / ${rec.feedback.like} / ${rec.feedback.meh}</b></li><li><span>Reservations</span><b>${rec.orders}</b></li></ul></div>` : "";
      const imgOpts = (cur) => `<option value="">— none —</option>` + ed.images.map((u, i) => `<option value="${esc(u)}" ${u === cur ? "selected" : ""}>Image ${i + 1}${i === 0 ? " (cover)" : ""}</option>`).join("");
      const locs = [...new Set([...O.settings.locations, ...ed.editions.map((e) => e.location)])];
      const soldAt = (loc) => rec?.editions.find((e) => e.location === loc)?.sold || 0;
      const main = shell("designs", `
        <div class="topbar"><div><a class="link-btn" href="#/designs">← All designs</a><h1 style="margin-top:6px">${esc(ed.name || "New design")}</h1></div>
          <div class="actions">${meta.id && meta.status === "active" ? `<a class="btn ghost sm" href="/design?d=${esc(meta.slug)}" target="_blank" rel="noopener">View live</a>` : ""}</div></div>
        <div class="editor">
          <div>
            <section class="panel-card"><h2>The basics</h2><p class="sub">What customers read first</p>
              <div class="grid-2">
                ${input("name", "Design name *", ed.name, 'maxlength="80" placeholder="e.g. Noor Drape"')}
                ${input("category", "Category", ed.category, 'maxlength="40" placeholder="Saree, Gown, Kurta Set…" list="cats"')}
                <datalist id="cats">${[...new Set(O.designs.map((d) => d.data.category))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
                ${input("badge", "Badge (optional)", ed.badge, 'maxlength="24" placeholder="New drop, Bridal, Signature…"')}
                ${input("occasions", "Occasions (comma separated)", ed.occasions.join(", "), 'data-type="list" placeholder="Wedding, Festive"')}
                <div class="field full"><label>One-line tagline</label><input class="input" data-k="tagline" maxlength="160" value="${esc(ed.tagline)}" placeholder="The sentence that sells it"></div>
                <div class="field full"><label>The story</label><textarea class="input" data-k="story" rows="5" maxlength="3000" placeholder="Why this design exists, how it's made, how it feels to wear…">${esc(ed.story)}</textarea></div>
              </div>
            </section>

            <section class="panel-card"><h2>Images</h2><p class="sub">The first image is the cover. Upload front, back and close-up shots. Images are compressed automatically before upload.</p>
              <div class="img-grid">
                ${ed.images.map((u, i) => `<div class="img-tile ${i === 0 ? "cover" : ""}">${i === 0 ? '<span class="tag">Cover</span>' : ""}<img src="${esc(u)}" alt="">
                  <div class="tile-bar">${i > 0 ? `<button data-img="cover" data-i="${i}" title="Make cover">★</button><button data-img="left" data-i="${i}" title="Move left">◀</button>` : ""}${i < ed.images.length - 1 ? `<button data-img="right" data-i="${i}" title="Move right">▶</button>` : ""}<button data-img="del" data-i="${i}" title="Remove">✕</button></div></div>`).join("")}
                <label class="drop" id="drop"><input type="file" accept="image/*" multiple hidden id="files"><span>＋<br>Add images<br><small>or drop them here</small></span></label>
              </div>
            </section>

            <section class="panel-card"><h2>Colourways</h2><p class="sub">Each colourway can switch the stage to its own image and add a price difference</p>
              <div class="rows">${ed.colors.map((c, i) => `<div class="row-line colors">
                  <input type="color" data-k="colors.${i}.hex" value="${esc(c.hex)}" title="Swatch colour">
                  <div class="field"><label>Name</label><input class="input" data-k="colors.${i}.name" value="${esc(c.name)}" maxlength="40"></div>
                  <div class="field"><label>Image</label><select class="input" data-k="colors.${i}.image">${imgOpts(c.image)}</select></div>
                  <div class="field"><label>Price ±</label><input class="input" data-k="colors.${i}.delta" data-type="int" inputmode="numeric" value="${c.delta || 0}"></div>
                  <button class="mini-btn danger" data-rm="colors" data-i="${i}">Remove</button></div>`).join("")}</div>
              <button class="mini-btn" data-add="colors" style="margin-top:12px">+ Add colourway</button>
            </section>

            <section class="panel-card"><h2>Sizes & customisation</h2><p class="sub">Sizes, made-to-measure and hand-finished add-ons</p>
              <div class="grid-2">
                ${input("sizes", "Standard sizes (comma separated)", ed.sizes.join(", "), 'data-type="list"')}
                <div class="field"><label>Made-to-measure surcharge</label><input class="input" data-k="mtm_delta" data-type="int" inputmode="numeric" value="${ed.mtm_delta}"></div>
                <label class="switch full"><input type="checkbox" data-k="made_to_measure" ${ed.made_to_measure ? "checked" : ""}> Offer “Made to measure” (customer enters bust, waist, hip, height)</label>
              </div>
              <h3 style="font-size:20px;margin:22px 0 10px">Add-ons</h3>
              <div class="rows">${ed.addons.map((a, i) => `<div class="row-line addons">
                  <div class="field"><label>Add-on</label><input class="input" data-k="addons.${i}.name" value="${esc(a.name)}" maxlength="50"></div>
                  <div class="field"><label>Short description</label><input class="input" data-k="addons.${i}.desc" value="${esc(a.desc)}" maxlength="140"></div>
                  <div class="field"><label>Price +</label><input class="input" data-k="addons.${i}.delta" data-type="int" inputmode="numeric" value="${a.delta || 0}"></div>
                  <button class="mini-btn danger" data-rm="addons" data-i="${i}">Remove</button></div>`).join("")}</div>
              <button class="mini-btn" data-add="addons" style="margin-top:12px">+ Add add-on</button>
            </section>

            <section class="panel-card"><h2>Spec sheet</h2><p class="sub">The engineering view of the garment. Leave a field blank to hide it.</p>
              <div class="grid-3">${Object.entries(SPEC_LABELS).map(([k, l]) => input("specs." + k, l, ed.specs[k] || "", 'maxlength="140"')).join("")}</div>
              <h3 style="font-size:20px;margin:24px 0 12px">Feel profile (1–5)</h3>
              <div style="display:grid;gap:10px;max-width:520px">${Object.entries(FEEL).map(([k, l]) => `<div class="range-row"><span>${l}</span><input type="range" min="1" max="5" step="1" data-k="feel.${k}" data-type="int" value="${ed.feel[k]}" data-out="fo-${k}"><b id="fo-${k}">${ed.feel[k]}</b></div>`).join("")}</div>
            </section>

            <section class="panel-card"><h2>Anatomy pins</h2><p class="sub">${ed.images[0] ? "Click anywhere on the cover image to drop a numbered pin, then describe that detail." : "Upload a cover image first, then click on it to place pins."}</p>
              ${ed.images[0] ? `<div class="spot-canvas" id="spotCanvas"><img src="${esc(ed.images[0])}" alt="">${ed.hotspots.map((h, i) => `<span style="left:${h.x}%;top:${h.y}%">${i + 1}</span>`).join("")}</div>` : ""}
              <div class="rows">${ed.hotspots.map((h, i) => `<div class="row-line spots"><span class="num">${i + 1}</span>
                  <div class="field"><label>Title</label><input class="input" data-k="hotspots.${i}.title" value="${esc(h.title)}" maxlength="40"></div>
                  <div class="field"><label>Why it matters</label><input class="input" data-k="hotspots.${i}.text" value="${esc(h.text)}" maxlength="220"></div>
                  <button class="mini-btn danger" data-rm="hotspots" data-i="${i}">Remove</button></div>`).join("")}</div>
            </section>

            <section class="panel-card"><h2>City editions · rarity</h2><p class="sub">The hard limit of pieces per city. Customers see a live countdown and numbered pieces. A city that isn't listed can't order this design.</p>
              <div class="rows">${ed.editions.map((e, i) => `<div class="row-line eds">
                  <div class="field"><label>City</label><select class="input" data-k="editions.${i}.location">${locs.map((l) => `<option ${l === e.location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
                  <div class="field"><label>Pieces</label><input class="input" data-k="editions.${i}.limit" data-type="int" inputmode="numeric" value="${e.limit}"></div>
                  <div class="sold-note">${soldAt(e.location)} claimed · ${Math.max(0, e.limit - soldAt(e.location))} left</div>
                  <button class="mini-btn danger" data-rm="editions" data-i="${i}">Remove</button></div>`).join("")}</div>
              <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="mini-btn" data-add="editions">+ Add city</button><button class="mini-btn" data-allcities>Add all cities</button></div>
            </section>
          </div>

          <aside class="aside">
            <div class="panel-card"><h2 style="font-size:22px">Publishing</h2>
              <div class="field" style="margin-top:12px"><label>Status</label><select class="input" id="status">
                <option value="active" ${meta.status === "active" ? "selected" : ""}>Active · on the showroom floor</option>
                <option value="draft" ${meta.status === "draft" ? "selected" : ""}>Draft · hidden, work in progress</option>
                <option value="archived" ${meta.status === "archived" ? "selected" : ""}>Archived · retired from display</option></select></div>
              <label class="switch" style="margin-top:14px"><input type="checkbox" data-k="featured" ${ed.featured ? "checked" : ""}> Feature in the home hero</label>
              <div class="field" style="margin-top:14px"><label>URL slug</label><input class="input" id="slug" value="${esc(meta.slug)}" placeholder="auto from name"></div>
            </div>
            <div class="panel-card"><h2 style="font-size:22px">Pricing</h2>
              <div class="field" style="margin-top:12px"><label>Base price (${esc(O.settings.currency)})</label><input class="input" data-k="price" data-type="int" inputmode="numeric" value="${ed.price}"></div>
              <div class="field" style="margin-top:12px"><label>Price display</label><select class="input" data-k="price_mode">
                <option value="default" ${ed.price_mode === "default" ? "selected" : ""}>Site default (${esc(PRICES[O.settings.price_mode])})</option>
                ${Object.entries(PRICES).map(([k, l]) => `<option value="${k}" ${ed.price_mode === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
              <p class="hint">“Reveal” keeps the price out of the page until the customer taps the hidden button. Every tap is counted as a price reveal.</p>
            </div>
            ${stats}
          </aside>
        </div>
        <div class="savebar">${meta.id ? `<button class="btn ghost sm" data-cancel>Discard changes</button>` : ""}<button class="btn sm" id="save">${meta.id ? "Save changes" : "Create design"}</button></div>`);
      window.scrollTo(0, y);
      wire(main);
    }

    function wire(main) {
      main.addEventListener("input", (e) => {
        const k = e.target.dataset.k; if (!k) return;
        setPath(ed, k, readVal(e.target)); dirty = true;
        if (e.target.dataset.out) document.getElementById(e.target.dataset.out).textContent = e.target.value;
      });
      main.addEventListener("change", (e) => { if (e.target.dataset.k) { setPath(ed, e.target.dataset.k, readVal(e.target)); dirty = true; } });
      main.querySelector("#status").onchange = (e) => { meta.status = e.target.value; dirty = true; };
      main.querySelector("#slug").oninput = (e) => { meta.slug = e.target.value; dirty = true; };
      main.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.add;
        if (k === "colors") ed.colors.push({ name: "", hex: "#222222", image: "", delta: 0 });
        if (k === "addons") ed.addons.push({ name: "", desc: "", delta: 0 });
        if (k === "editions") { const free = O.settings.locations.find((l) => !ed.editions.some((e) => e.location === l)); ed.editions.push({ location: free || O.settings.locations[0], limit: 15 }); }
        dirty = true; render();
      }));
      main.querySelector("[data-allcities]").onclick = () => {
        O.settings.locations.forEach((l) => { if (!ed.editions.some((e) => e.location === l)) ed.editions.push({ location: l, limit: 15 }); });
        dirty = true; render();
      };
      main.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { ed[b.dataset.rm].splice(+b.dataset.i, 1); dirty = true; render(); }));
      main.querySelectorAll("[data-img]").forEach((b) => (b.onclick = () => {
        const i = +b.dataset.i, a = ed.images;
        if (b.dataset.img === "del") {
          const url = a[i]; a.splice(i, 1);
          ed.colors.forEach((c) => { if (c.image === url) c.image = ""; });
        } else if (b.dataset.img === "cover") a.unshift(a.splice(i, 1)[0]);
        else { const j = i + (b.dataset.img === "left" ? -1 : 1); [a[i], a[j]] = [a[j], a[i]]; }
        dirty = true; render();
      }));
      const canvas = main.querySelector("#spotCanvas");
      if (canvas) canvas.onclick = (e) => {
        if (ed.hotspots.length >= 10) return toast("Up to 10 pins per design");
        const r = canvas.getBoundingClientRect();
        const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
        ed.hotspots.push({ x, y, title: `Detail ${ed.hotspots.length + 1}`, text: "" });
        dirty = true; render();
      };
      const files = main.querySelector("#files"), drop = main.querySelector("#drop");
      files.onchange = () => upload([...files.files]);
      drop.ondragover = (e) => { e.preventDefault(); drop.style.background = "#ecd9b0"; };
      drop.ondragleave = () => (drop.style.background = "");
      drop.ondrop = (e) => { e.preventDefault(); drop.style.background = ""; upload([...e.dataTransfer.files]); };
      main.querySelector("[data-cancel]")?.addEventListener("click", () => { if (confirm("Discard your changes?")) { dirty = false; editor(id); } });
      main.querySelector("#save").onclick = save;
    }

    async function upload(list) {
      const drop = document.getElementById("drop");
      list = list.filter((f) => f.type.startsWith("image/"));
      if (!list.length) return toast("Please choose image files", true);
      drop.classList.add("busy");
      let ok = 0;
      for (const f of list) {
        drop.querySelector("span").innerHTML = `Uploading ${ok + 1} of ${list.length}…`;
        try { const data = await compress(f); const r = await api("/api/admin/upload", { method: "POST", body: { data } }); ed.images.push(r.url); ok++; }
        catch (err) { toast(`${f.name}: ${err.message}`, true); }
      }
      if (ok) { dirty = true; toast(`${ok} image${ok > 1 ? "s" : ""} added`); }
      render();
    }

    async function save() {
      if (!ed.name.trim()) { toast("Give the design a name", true); document.querySelector('[data-k="name"]').focus(); return; }
      if (meta.status === "active" && !ed.images.length) { toast("Add at least one image before publishing", true); return; }
      if (meta.status === "active" && !ed.editions.length) { toast("Add at least one city edition before publishing", true); return; }
      const btn = document.getElementById("save"); btn.disabled = true;
      try {
        const body = { ...ed, slug: meta.slug, status: meta.status };
        const r = meta.id ? await api(`/api/admin/designs/${meta.id}`, { method: "PUT", body }) : await api("/api/admin/designs", { method: "POST", body });
        dirty = false; await refresh(); toast(meta.id ? "Saved" : "Design created");
        if (!meta.id) location.hash = `#/designs/${r.id}`; else editor(meta.id);
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    }
    render();
  }

  function compress(file) {
    if (file.type === "image/gif") return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Could not read file")); r.readAsDataURL(file); });
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let out = c.toDataURL("image/webp", 0.86);
        if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", 0.88);
        res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Unsupported image format")); };
      img.src = url;
    });
  }

  /* ---------------- orders ---------------- */
  function orders() {
    const q = ui.orderSearch.toLowerCase();
    const list = O.orders.filter((o) => (!ui.orderStatus || o.status === ui.orderStatus) && (!ui.orderCity || o.location === ui.orderCity)
      && (!q || [o.ref, o.name, o.mobile, o.design_name, o.pincode].join(" ").toLowerCase().includes(q)));
    const cities = [...new Set(O.orders.map((o) => o.location))];
    const main = shell("orders", `
      <div class="topbar"><h1>Orders</h1><div class="actions"><a class="btn ghost sm" href="/api/admin/orders.csv">Export CSV</a></div></div>
      <div class="toolbar">
        <select class="input" id="ost"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${ui.orderStatus === k ? "selected" : ""}>${l} (${O.orders.filter((o) => o.status === k).length})</option>`).join("")}</select>
        <select class="input" id="ocity"><option value="">All cities</option>${cities.map((c) => `<option ${ui.orderCity === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <input class="input" type="search" id="oq" placeholder="Search name, mobile, ref…" value="${esc(ui.orderSearch)}">
      </div>
      <div class="o-list">${list.map((o) => {
        const c = o.config, m = Object.entries(c.measurements || {}).filter(([, v]) => v);
        return `<div class="o-card">
          <div><h4>${esc(o.name)}</h4><small>${esc(o.ref)} · ${when(o.created_at)}</small><a href="tel:+91${esc(o.mobile)}" style="display:inline-block;margin-top:6px">📞 +91 ${esc(o.mobile)}</a>
            ${O.settings.contact.whatsapp !== undefined ? `<a href="https://wa.me/91${esc(o.mobile)}" target="_blank" rel="noopener" style="display:block;font-size:13px;color:var(--ok)">WhatsApp customer</a>` : ""}</div>
          <div><b>${esc(o.design_name)}</b><small>Piece #${pad(o.edition_no)} of ${o.edition_limit} · ${esc(o.location)}</small>
            <small>${[c.color, c.size].filter(Boolean).map(esc).join(" · ")}</small>
            ${m.length ? `<small>${m.map(([k, v]) => `${k} ${esc(v)}″`).join(", ")}</small>` : ""}
            ${c.addons?.length ? `<small>+ ${c.addons.map(esc).join(", ")}</small>` : ""}
            <b style="display:block;margin-top:4px">${money(o.total)}</b></div>
          <div class="addr">${esc(o.address)}\n${esc(o.pincode)}${o.notes ? `\n<i>“${esc(o.notes)}”</i>` : ""}</div>
          <div><select data-order="${o.id}" data-prev="${o.status}">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        </div>`;
      }).join("") || '<div class="empty">No orders match.</div>'}</div>`);
    main.querySelector("#ost").onchange = (e) => { ui.orderStatus = e.target.value; orders(); };
    main.querySelector("#ocity").onchange = (e) => { ui.orderCity = e.target.value; orders(); };
    const s = main.querySelector("#oq");
    s.oninput = () => { ui.orderSearch = s.value; const p = s.selectionStart; orders(); const n = document.getElementById("oq"); n.focus(); n.setSelectionRange(p, p); };
    main.querySelectorAll("[data-order]").forEach((sel) => (sel.onchange = async () => {
      if (sel.value === "cancelled" && !confirm("Cancel this order? Its numbered piece goes back to the city's edition.")) { sel.value = sel.dataset.prev; return; }
      try { await api(`/api/admin/orders/${sel.dataset.order}`, { method: "PUT", body: { status: sel.value } }); await refresh(); orders(); toast(`Marked as ${STATUS[sel.value]}`); }
      catch (err) { toast(err.message, true); sel.value = sel.dataset.prev; }
    }));
  }

  /* ---------------- design lobby: commissions + catalogue pricing ---------------- */
  const LOOK_STATUS = { new: ["New", "new"], contacted: ["Contacted", "confirmed"], quoted: ["Quoted", "shipped"], in_making: ["In making", "in_making"], delivered: ["Delivered", "delivered"], closed: ["Closed", "cancelled"] };
  const encodeLook = (l) => btoa(unescape(encodeURIComponent(JSON.stringify(l)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function lobbyAdmin() {
    const cfg = O.lobby, q = (ui.lookSearch || "").toLowerCase(), st = ui.lookStatus || "";
    const label = (arr, k) => (arr.find((x) => x.key === k) || { label: k }).label;
    const list = O.looks.filter((l) => (!st || l.status === st) && (!q || [l.ref, l.name, l.mobile, l.location].join(" ").toLowerCase().includes(q)));
    const priceRow = (group, item, key, unit) => `<tr><td><label class="switch"><input type="checkbox" data-en="${group}.${item.key}" ${item.enabled ? "checked" : ""}> ${esc(item.label)}</label></td>
      <td><input class="input" style="max-width:140px" inputmode="numeric" data-price="${group}.${item.key}.${key}" value="${item[key]}"></td><td class="muted" style="font-size:12.5px">${unit}</td></tr>`;
    const main = shell("lobby", `
      <div class="topbar"><div><h1>Design Lobby</h1><p class="muted" style="margin:4px 0 0">Looks your customers designed themselves. Each one is a one-of-a-kind commission.</p></div>
        <div class="actions"><a class="btn ghost sm" href="/lobby" target="_blank" rel="noopener">Open the lobby</a></div></div>
      <div class="toolbar">
        <select class="input" id="lst"><option value="">All statuses</option>${Object.entries(LOOK_STATUS).map(([k, [l]]) => `<option value="${k}" ${st === k ? "selected" : ""}>${l} (${O.looks.filter((x) => x.status === k).length})</option>`).join("")}</select>
        <input class="input" type="search" id="lq" placeholder="Search name, mobile, ref…" value="${esc(ui.lookSearch || "")}">
      </div>
      <div class="look-list">${list.map((l) => {
        const k = l.look;
        return `<div class="look-card">
          <a class="look-thumb" href="/lobby#look=${encodeLook(k)}" target="_blank" rel="noopener" title="Open this look in the lobby">${UQLook.svg(k, { id: "ad" + l.id })}</a>
          <div class="look-body">
            <div class="look-head"><div><h4>${esc(l.name)}</h4><small class="muted">${esc(l.ref)} · ${when(l.created_at)} · ${esc(l.location)}</small></div><span class="pill ${LOOK_STATUS[l.status][1]}">${LOOK_STATUS[l.status][0]}</span></div>
            <div class="look-tags">${[label(cfg.silhouettes, k.sil), label(cfg.fabrics, k.fab), label(cfg.necklines, k.neck) + " neck", label(cfg.sleeves, k.slv) + " sleeves", label(cfg.lengths, k.len) + " length",
              ...k.emb.map((e) => label(cfg.embellishments, e)), k.dup !== "none" ? "Dupatta: " + k.dup : "", k.belt ? "Belt" : "", k.lining ? "Lined" : "", k.pockets ? "Pockets" : ""].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}
              <span><i style="background:${esc(k.col)}"></i>${esc(k.col)}</span><span><i style="background:${esc(k.acc)}"></i>trim</span></div>
            ${l.notes ? `<p class="look-notes">“${esc(l.notes)}”</p>` : ""}
            <div class="look-foot"><b>${money(l.estimate)}</b> <small class="muted">estimate</small>
              <a class="mini-btn" href="tel:+91${esc(l.mobile)}">📞 +91 ${esc(l.mobile)}</a><a class="mini-btn" href="https://wa.me/91${esc(l.mobile)}" target="_blank" rel="noopener">WhatsApp</a>
              <select class="input" style="width:auto;padding:7px 10px" data-look="${l.id}">${Object.entries(LOOK_STATUS).map(([s, [lab]]) => `<option value="${s}" ${l.status === s ? "selected" : ""}>${lab}</option>`).join("")}</select></div>
          </div></div>`;
      }).join("") || '<div class="empty">No commissions yet. They appear here when customers send a look from the Design Lobby.</div>'}</div>

      <section class="panel-card" style="margin-top:26px"><h2>Customer accounts & saved designs</h2>
        <p class="sub">Customers who signed in with their mobile and PIN. Their saved designs show what they're dreaming about, which makes a great reason to call.</p>
        ${(O.accounts || []).length ? `<div class="look-list">${O.accounts.map((a) => `<div class="look-card" style="grid-template-columns:1fr">
            <div class="look-head"><div><h4>${esc(a.name)}</h4><small class="muted"><a href="tel:+91${esc(a.mobile)}">+91 ${esc(a.mobile)}</a> · joined ${when(a.created_at)} · ${a.looks.length} saved design${a.looks.length === 1 ? "" : "s"}${a.pin_reset ? " · <b>PIN reset pending</b>" : ""}</small></div>
              <div style="display:flex;gap:6px"><a class="mini-btn" href="https://wa.me/91${esc(a.mobile)}" target="_blank" rel="noopener">WhatsApp</a><button class="mini-btn" data-reset="${esc(a.mobile)}">Reset PIN</button></div></div>
            ${a.looks.length ? `<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">${a.looks.slice(0, 12).map((s) => `<a class="look-thumb" style="flex:none;width:92px" href="/lobby#look=${encodeLook(s.look)}" target="_blank" rel="noopener" title="${esc(s.title)}">${UQLook.svg(s.look, { id: "sv" + s.id })}</a>`).join("")}</div>` : ""}
          </div>`).join("")}</div>` : '<div class="empty">No customer accounts yet. Customers create one from the Design Lobby with their mobile number and a PIN.</div>'}
      </section>

      <section class="panel-card" style="margin-top:26px"><h2>Lobby catalogue & pricing</h2>
        <p class="sub">Switch items on or off and set prices. Estimates use: silhouette base + fabric rate × metres + handwork + extras.</p>
        <label class="switch"><input type="checkbox" id="lbOn" ${cfg.enabled ? "checked" : ""}> Lobby open to customers</label>
        <label class="switch" style="margin-top:8px"><input type="checkbox" id="lbEst" ${cfg.show_estimate ? "checked" : ""}> Show price estimates to customers</label>
        <div class="two-col" style="margin-top:20px;align-items:start">
          <div><h3 style="font-size:20px;margin-bottom:8px">Fabrics</h3><table class="compare-table" style="min-width:0">${cfg.fabrics.map((f) => priceRow("fabrics", f, "rate", "per metre")).join("")}</table></div>
          <div><h3 style="font-size:20px;margin-bottom:8px">Silhouettes</h3><table class="compare-table" style="min-width:0">${cfg.silhouettes.map((s) => priceRow("silhouettes", s, "base", `base · ${s.meters} m`)).join("")}</table>
            <h3 style="font-size:20px;margin:22px 0 8px">Handwork</h3><table class="compare-table" style="min-width:0">${cfg.embellishments.map((e) => priceRow("embellishments", e, "price", `+${e.days} days`)).join("")}</table>
            <h3 style="font-size:20px;margin:22px 0 8px">Extras</h3><table class="compare-table" style="min-width:0">${["belt", "lining", "pockets"].map((k) => `<tr><td style="text-transform:capitalize">${k}</td><td><input class="input" style="max-width:140px" inputmode="numeric" data-extra="${k}" value="${cfg.extras[k]}"></td><td></td></tr>`).join("")}</table></div>
        </div>
      </section>
      <div class="savebar"><button class="btn sm" id="lbSave">Save lobby settings</button></div>`);
    main.querySelector("#lst").onchange = (e) => { ui.lookStatus = e.target.value; lobbyAdmin(); };
    const s = main.querySelector("#lq");
    s.oninput = () => { ui.lookSearch = s.value; const p = s.selectionStart; lobbyAdmin(); const n = document.getElementById("lq"); n.focus(); n.setSelectionRange(p, p); };
    main.querySelectorAll("[data-look]").forEach((sel) => (sel.onchange = async () => {
      try { await api(`/api/admin/looks/${sel.dataset.look}`, { method: "PUT", body: { status: sel.value } }); await refresh(); lobbyAdmin(); toast(`Marked as ${LOOK_STATUS[sel.value][0]}`); }
      catch (err) { toast(err.message, true); }
    }));
    main.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = async () => {
      if (!confirm(`Reset the PIN for +91 ${b.dataset.reset}?\n\nOnly do this after confirming who you're speaking to. Their next sign-in will set a new PIN, and their saved designs stay safe.`)) return;
      try { await api(`/api/admin/accounts/${b.dataset.reset}/reset-pin`, { method: "POST", body: {} }); await refresh(); lobbyAdmin(); toast("PIN reset. The customer can choose a new one at their next sign-in."); }
      catch (err) { toast(err.message, true); }
    }));
    main.addEventListener("input", (e) => { if (e.target.closest("[data-price],[data-extra],[data-en],#lbOn,#lbEst")) dirty = true; });
    main.querySelector("#lbSave").onclick = async () => {
      const body = { enabled: main.querySelector("#lbOn").checked, show_estimate: main.querySelector("#lbEst").checked, fabrics: {}, silhouettes: {}, embellishments: {}, extras: {} };
      main.querySelectorAll("[data-en]").forEach((c) => { const [g, k] = c.dataset.en.split("."); (body[g][k] ||= {}).enabled = c.checked; });
      main.querySelectorAll("[data-price]").forEach((i) => { const [g, k, f] = i.dataset.price.split("."); (body[g][k] ||= {})[f] = parseInt(i.value.replace(/\D/g, ""), 10) || 0; });
      main.querySelectorAll("[data-extra]").forEach((i) => (body.extras[i.dataset.extra] = parseInt(i.value.replace(/\D/g, ""), 10) || 0));
      try { await api("/api/admin/lobby", { method: "PUT", body }); dirty = false; await refresh(); toast("Lobby settings saved"); lobbyAdmin(); }
      catch (err) { toast(err.message, true); }
    };
  }

  /* ---------------- feedback ---------------- */
  function feedback() {
    const byId = Object.fromEntries(O.designs.map((d) => [d.id, d]));
    const ranked = [...O.designs].filter((d) => d.feedback.love + d.feedback.like + d.feedback.meh).sort((a, b) => b.feedback.love - a.feedback.love);
    const comments = O.feedback.filter((f) => f.comment);
    const main = shell("feedback", `
      <div class="topbar"><h1>Feedback</h1></div>
      <div class="panel-card"><h2>Design verdicts</h2><p class="sub">😍 Love it · 👍 Like it · 🤔 Not for me. One vote per customer per design.</p>
        ${ranked.map((d) => { const f = d.feedback, t = f.love + f.like + f.meh;
          return `<div class="fb-row"><div><b>${esc(d.data.name)}</b> <span class="muted" style="font-size:13px">· ${t} votes · ${Math.round(f.love / t * 100)}% love</span>
            <div class="fb-bar" style="margin-top:8px"><i style="width:${f.love / t * 100}%"></i><i style="width:${f.like / t * 100}%"></i><i style="width:${f.meh / t * 100}%"></i></div></div>
            <div style="font-size:14px;text-align:right">😍 ${f.love} &nbsp; 👍 ${f.like} &nbsp; 🤔 ${f.meh}</div></div>`; }).join("") || '<p class="muted">No reactions yet. They appear as customers vote on design pages.</p>'}
      </div>
      <div class="panel-card"><h2>Customer notes</h2><p class="sub">Written suggestions left after a reaction</p>
        ${comments.map((f) => `<div class="comment"><span class="emo">${EMO[f.reaction]}</span><div><b>${esc(byId[f.design_id]?.data.name || "Deleted design")}</b> <small class="muted">· ${when(f.created_at)}</small><p style="margin:4px 0 0">${esc(f.comment)}</p></div><button class="mini-btn danger" data-del="${f.id}">Delete</button></div>`).join("") || '<p class="muted">No notes yet.</p>'}
      </div>`);
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this feedback?")) return;
      try { await api(`/api/admin/feedback/${b.dataset.del}`, { method: "DELETE" }); await refresh(); feedback(); } catch (err) { toast(err.message, true); }
    }));
  }

  /* ---------------- settings ---------------- */
  function settings() {
    const s = JSON.parse(JSON.stringify(O.settings));
    const draw = () => {
      const main = shell("settings", `
        <div class="topbar"><h1>Settings</h1></div>
        <div class="two-col" style="align-items:start">
          <div>
            <section class="panel-card"><h2>Showroom display</h2><p class="sub">How designs and prices appear to customers</p>
              <div class="field"><label>Default price display</label><select class="input" id="s-price">${Object.entries(PRICES).map(([k, l]) => `<option value="${k}" ${s.price_mode === k ? "selected" : ""}>${l}</option>`).join("")}</select>
                <p class="hint">Individual designs can override this in the design editor.</p></div>
              <div class="field" style="margin-top:14px"><label>Showroom sort order</label><select class="input" id="s-sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${s.sort_mode === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
              <label class="switch" style="margin-top:14px"><input type="checkbox" id="s-csort" ${s.allow_customer_sort ? "checked" : ""}> Let customers re-sort (rarest, most loved, newest)</label>
              <label class="switch" style="margin-top:10px"><input type="checkbox" id="s-sold" ${s.show_sold_out ? "checked" : ""}> Keep sold-out designs visible (shows scarcity)</label>
              <div class="field" style="margin-top:14px"><label>“Only N left” alert threshold</label><input class="input" id="s-low" inputmode="numeric" value="${s.low_stock_threshold}"></div>
              <div class="field" style="margin-top:14px"><label>Currency symbol</label><input class="input" id="s-cur" maxlength="4" value="${esc(s.currency)}"></div>
            </section>
            <section class="panel-card"><h2>Cities</h2><p class="sub">Each design sets its own piece limit for each of these cities</p>
              <div class="city-tags">${s.locations.map((l, i) => `<span>${esc(l)} <button data-rmcity="${i}" aria-label="Remove ${esc(l)}">×</button></span>`).join("")}</div>
              <div style="display:flex;gap:8px;margin-top:14px"><input class="input" id="newcity" placeholder="Add a city" maxlength="40"><button class="mini-btn" id="addcity">Add</button></div>
              <div class="field" style="margin-top:14px"><label>Default city for new visitors</label><select class="input" id="s-defcity">${s.locations.map((l) => `<option ${l === s.default_location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
            </section>
          </div>
          <div>
            <section class="panel-card"><h2>Home page copy</h2><p class="sub">The hero headline and the announcement bar</p>
              <div class="field"><label>Eyebrow</label><input class="input" id="h-eyebrow" value="${esc(s.hero.eyebrow)}" maxlength="80"></div>
              <div class="field" style="margin-top:12px"><label>Headline</label><input class="input" id="h-title" value="${esc(s.hero.title)}" maxlength="120"><p class="hint">The last two words are set in gold italics.</p></div>
              <div class="field" style="margin-top:12px"><label>Sub-headline</label><textarea class="input" id="h-sub" rows="3" maxlength="400">${esc(s.hero.subtitle)}</textarea></div>
              <div class="field" style="margin-top:12px"><label>Announcement bar (blank to hide)</label><input class="input" id="s-ann" value="${esc(s.announcement)}" maxlength="200"></div>
            </section>
            <section class="panel-card"><h2>Contact</h2><p class="sub">Shown in the footer and used for the WhatsApp stylist button</p>
              <div class="grid-2">
                <div class="field"><label>Phone</label><input class="input" id="c-phone" value="${esc(s.contact.phone)}"></div>
                <div class="field"><label>WhatsApp (with country code)</label><input class="input" id="c-wa" value="${esc(s.contact.whatsapp)}" placeholder="9198xxxxxxx"></div>
                <div class="field"><label>Email</label><input class="input" id="c-email" value="${esc(s.contact.email)}"></div>
                <div class="field"><label>Instagram</label><input class="input" id="c-ig" value="${esc(s.contact.instagram)}"></div>
                <div class="field full"><label>Address</label><input class="input" id="c-addr" value="${esc(s.contact.address)}"></div>
              </div>
            </section>
            <section class="panel-card"><h2>Admin password</h2>
              <form id="pwform" class="grid-2" style="margin-top:12px">
                <div class="field"><label>Current</label><input class="input" type="password" id="pw-cur" autocomplete="current-password"></div>
                <div class="field"><label>New (8+ characters)</label><input class="input" type="password" id="pw-new" autocomplete="new-password" minlength="8"></div>
                <div class="full"><button class="mini-btn" type="submit">Change password</button></div>
              </form>
            </section>
          </div>
        </div>
        <div class="savebar"><button class="btn sm" id="ssave">Save settings</button></div>`);
      const $ = (id) => main.querySelector("#" + id);
      const collect = () => {
        s.price_mode = $("s-price").value; s.sort_mode = $("s-sort").value;
        s.allow_customer_sort = $("s-csort").checked; s.show_sold_out = $("s-sold").checked;
        s.low_stock_threshold = parseInt($("s-low").value, 10) || 5; s.currency = $("s-cur").value;
        s.default_location = $("s-defcity").value;
        s.hero = { eyebrow: $("h-eyebrow").value, title: $("h-title").value, subtitle: $("h-sub").value };
        s.announcement = $("s-ann").value;
        s.contact = { phone: $("c-phone").value, whatsapp: $("c-wa").value, email: $("c-email").value, instagram: $("c-ig").value, address: $("c-addr").value };
      };
      main.addEventListener("input", () => (dirty = true));
      main.querySelectorAll("[data-rmcity]").forEach((b) => (b.onclick = () => { collect(); s.locations.splice(+b.dataset.rmcity, 1); dirty = true; draw(); }));
      $("addcity").onclick = () => {
        const v = $("newcity").value.trim(); if (!v) return;
        collect(); if (!s.locations.includes(v)) s.locations.push(v); dirty = true; draw();
      };
      $("newcity").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("addcity").click(); } };
      $("ssave").onclick = async () => {
        collect();
        try { await api("/api/admin/settings", { method: "PUT", body: s }); dirty = false; await refresh(); toast("Settings saved"); settings(); }
        catch (err) { toast(err.message, true); }
      };
      $("pwform").onsubmit = async (e) => {
        e.preventDefault();
        try { await api("/api/admin/password", { method: "POST", body: { current: $("pw-cur").value, new: $("pw-new").value } }); toast("Password changed"); $("pw-cur").value = $("pw-new").value = ""; }
        catch (err) { toast(err.message, true); }
      };
    };
    draw();
  }

  /* ---------------- boot ---------------- */
  (async () => {
    try {
      const me = await api("/api/admin/me");
      if (!me.authenticated) return showLogin();
      await refresh(); route();
    } catch (e) { root.innerHTML = `<div class="login"><p>${esc(e.message)}</p></div>`; }
  })();
})();
