/* UNIQO - home / showroom */
(async () => {
  const { api, esc, city, cardHTML, observeReveal, toast } = UQ;
  let designs = [];
  let category = "All";
  let heroTimer;

  /* cinematic hero: letters of the wordmark and subtitle animate in on every page load */
  const splitLetters = (el, cls) => {
    if (!el) return;
    const txt = el.textContent.trim();
    el.setAttribute("aria-label", txt);
    el.innerHTML = [...txt].map((c, i) => `<span class="${cls}" aria-hidden="true" style="--i:${i}">${c === " " ? " " : esc(c)}</span>`).join("");
    el.classList.add("split");
  };
  splitLetters(document.querySelector(".cine-title"), "ch");
  const petals = document.getElementById("petals");
  if (petals && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    petals.innerHTML = Array.from({ length: innerWidth < 700 ? 9 : 16 }, () => {
      const s = 8 + Math.random() * 14;
      return `<span style="--x:${(Math.random() * 100).toFixed(1)}%;--s:${s.toFixed(1)}px;--d:${(10 + Math.random() * 10).toFixed(1)}s;--dl:${(-Math.random() * 18).toFixed(1)}s;--dx:${(Math.random() * 30 - 15).toFixed(1)}vw;--b:${s > 17 ? 1.6 : 0}px"></span>`;
    }).join("");
  }

  let site;
  try { site = await UQ.initChrome(); } catch (e) { toast(e.message, true); splitLetters(document.querySelector(".cine-sub"), "c"); return; }

  // hero copy + stats from admin settings
  const h = site.hero || {};
  const setText = (sel, v) => { const el = document.querySelector(sel); if (el && v) el.textContent = v; };
  setText("[data-hero-eyebrow]", h.eyebrow);
  splitLetters(document.querySelector(".cine-sub"), "c");
  setText("[data-hero-subtitle]", h.subtitle);
  const title = document.querySelector("[data-hero-title]");
  if (h.title) {
    // italicise the last two words in gold for a couture feel
    const words = h.title.trim().split(/\s+/);
    const tail = words.splice(Math.max(1, words.length - 2)).join(" ");
    title.innerHTML = `${esc(words.join(" "))} <em>${esc(tail)}</em>`;
  }
  const stat = (k, v) => { const el = document.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v; };
  stat("designs", UQ.pad(site.stats.designs));
  stat("cities", UQ.pad(site.stats.cities));
  stat("min", site.stats.min_limit || "—");

  // category chips
  const chips = document.getElementById("chips");
  const cats = ["All", ...site.categories];
  chips.innerHTML = cats.map((c) => `<button type="button" class="chip ${c === category ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  chips.onclick = (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    category = b.dataset.cat;
    chips.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b));
    renderGrid();
  };

  // optional customer sort
  const sort = document.getElementById("sort");
  if (site.allow_customer_sort) {
    sort.classList.remove("hidden");
    if (site.price_mode !== "visible") sort.querySelectorAll("[data-price]").forEach((o) => o.remove());
    sort.onchange = load;
  }

  // demo edition map
  const demo = document.getElementById("demoGrid");
  const taken = new Set([1, 2, 3, 5, 6, 9, 11, 12, 14, 17]);
  demo.innerHTML = Array.from({ length: 25 }, (_, i) => {
    const n = i + 1;
    return `<span class="${taken.has(n) ? "taken" : n === 4 ? "yours" : ""}">${UQ.pad(n)}</span>`;
  }).join("");
  document.querySelector("[data-demo-meters]").innerHTML = UQ.metersHTML({ comfort: 4, drape: 5, stretch: 2, breathability: 4, formality: 5 });

  function renderGrid() {
    const grid = document.getElementById("grid");
    const list = designs.filter((d) => category === "All" || d.category === category);
    grid.innerHTML = list.length ? list.map(cardHTML).join("")
      : `<div class="empty">No designs in this category for ${esc(city())} right now. New drops land regularly, so check back soon.</div>`;
    observeReveal(grid);
  }

  function renderHero() {
    const stage = document.getElementById("heroStage");
    if (!stage) return;                                   // the cinematic hero has no featured carousel
    const featured = designs.filter((d) => d.featured && d.images[0]);
    const list = featured.length ? featured : designs.filter((d) => d.images[0]).slice(0, 4);
    stage.querySelectorAll("img").forEach((i) => i.remove());
    clearInterval(heroTimer);
    if (!list.length) return;
    list.forEach((d, i) => {
      const img = document.createElement("img");
      img.src = d.images[0]; img.alt = d.name; if (i === 0) img.className = "on";
      stage.prepend(img);
    });
    const imgs = [...stage.querySelectorAll("img")].reverse();
    const dots = document.getElementById("heroDots");
    dots.innerHTML = list.map((_, i) => `<button type="button" aria-label="Show design ${i + 1}" class="${i === 0 ? "on" : ""}"></button>`).join("");
    let idx = 0;
    const show = (i) => {
      idx = (i + list.length) % list.length;
      const d = list[idx];
      imgs.forEach((im, k) => im.classList.toggle("on", k === idx));
      [...dots.children].forEach((b, k) => b.classList.toggle("on", k === idx));
      stage.href = `/design?d=${encodeURIComponent(d.slug)}`;
      const left = d.here ? (d.here.left ? `<b>${d.here.left}</b>left of ${d.here.limit}` : "<b>0</b>sold out") : "<b>—</b>not here";
      document.getElementById("heroCard").innerHTML =
        `<div><small>${esc(d.category)} · ${esc(city())}</small><h3>${esc(d.name)}</h3></div><div class="left-count"><small>${left}</small></div>`;
    };
    [...dots.children].forEach((b, i) => b.addEventListener("click", (e) => { e.preventDefault(); show(i); restart(); }));
    const restart = () => { clearInterval(heroTimer); if (list.length > 1) heroTimer = setInterval(() => show(idx + 1), 4800); };
    show(0); restart();
  }

  async function load() {
    document.querySelectorAll("[data-city-name]").forEach((e) => (e.textContent = city()));
    try {
      const q = new URLSearchParams({ location: city() });
      if (sort.value) q.set("sort", sort.value);
      const res = await api("/api/designs?" + q);
      designs = res.designs;
      await UQ.restorePrices(designs);
      renderGrid(); renderHero();
    } catch (e) {
      document.getElementById("grid").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  // honest social proof: only real, anonymous claims - never invented activity
  async function liveTicker() {
    const pill = document.getElementById("livePill"), txt = pill.querySelector(".txt");
    let lines;
    try {
      const a = await api("/api/activity");
      lines = a.claims.map((c) => `<b>Nº ${UQ.pad(c.edition_no)} of ${c.edition_limit}</b> · ${esc(c.design_name)} claimed in ${esc(c.location)} · ${UQ.timeAgo(a.now - c.created_at)}`);
    } catch { lines = []; }
    if (!lines.length) lines = [`<b>${site.stats.designs} editions open</b> across ${site.stats.cities} cities. Every piece numbered.`];
    pill.classList.remove("hidden");
    let i = 0;
    const show = () => { txt.style.opacity = 0; setTimeout(() => { txt.innerHTML = lines[i++ % lines.length]; txt.style.opacity = 1; }, 300); };
    show();
    if (lines.length > 1) setInterval(show, 4500);
  }
  liveTicker();

  document.addEventListener("uq:city", load);
  // keep every card showing the same revealed price
  document.addEventListener("uq:price", (e) => {
    document.querySelectorAll(`[data-reveal="${CSS.escape(e.detail.slug)}"]`).forEach((b) => {
      const s = document.createElement("span"); s.className = "price price-pop"; s.textContent = UQ.money(e.detail.price.price); b.replaceWith(s);
    });
  });
  await load();
  observeReveal();
})();
