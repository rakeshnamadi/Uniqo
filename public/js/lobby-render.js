/* UNIQO Design Lobby - avatar & garment renderer.
   Pure functions that return SVG strings, shared by the lobby, the home-page
   teaser and the admin panel (to preview customers' commissioned looks).
   Every path uses absolute M/L/Q/C commands so it can be mirrored for the right side. */
const UQLook = (() => {
  /* ---------- how each fabric looks: texture, sheen, sheerness ---------- */
  const FX = {
    cotton: { sheen: 0.1, sheer: 0, tex: "weave" },
    linen: { sheen: 0.06, sheer: 0, tex: "slub" },
    denim: { sheen: 0.05, sheer: 0, tex: "twill" },
    rayon: { sheen: 0.2, sheer: 0, tex: "flow" },
    crepe: { sheen: 0.14, sheer: 0, tex: "pebble" },
    georgette: { sheen: 0.14, sheer: 0.18, tex: "crinkle" },
    chiffon: { sheen: 0.16, sheer: 0.34, tex: "flow" },
    chanderi: { sheen: 0.24, sheer: 0.26, tex: "butti" },
    chikankari: { sheen: 0.06, sheer: 0.1, tex: "chikan" },
    silk: { sheen: 0.42, sheer: 0, tex: "none" },
    satin_silk: { sheen: 0.62, sheer: 0, tex: "none" },
    space_silk: { sheen: 0.46, sheer: 0, tex: "spark" },
  };
  const HEM = { knee: 482, midi: 572, ankle: 690, floor: 730 };
  const KURTA = { knee: 482, midi: 540, ankle: 600, floor: 640 };
  const effLen = (sil, len) => (sil === "saree" ? "floor" : sil === "lehenga" && (len === "knee" || len === "midi") ? "ankle" : len);

  /* ---------- colour helpers ---------- */
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (a) => "#" + a.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
  const shade = (h, f) => hex(rgb(h).map((c) => (f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  const lum = (h) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

  /* mirror a path across x = 300 (every even number is an x coordinate) */
  const mirror = (d) => { let i = 0; return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 === 0 ? String(+(600 - +n).toFixed(1)) : n)); };
  const both = (d) => [d, mirror(d)];
  const at = (pts, y) => { // piecewise-linear x for a given y; pts = [[y, x], ...]
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) {
      const [y0, x0] = pts[i - 1], [y1, x1] = pts[i];
      return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
    return pts[pts.length - 1][1];
  };

  /* ---------- the avatar ---------- */
  const ARM = "M232 162 Q212 168 206 196 L198 300 L192 420 Q190 444 200 448 Q210 446 212 428 L222 306 L234 214 Z";
  const TORSO = "M286 150 Q262 152 232 162 Q214 170 212 190 L220 260 Q226 300 236 330 L230 384 L370 384 L364 330 Q374 300 380 260 L388 190 Q386 170 368 162 Q338 152 314 150 Z";
  const LEG = "M262 380 L298 380 L294 600 L290 716 Q289 732 279 734 Q268 732 268 716 L264 600 Z";
  const SHOE = "M266 714 Q260 746 281 746 Q298 746 293 714 Z";
  const SLEEVE_OUT = [[162, 228], [196, 202], [300, 194], [420, 188], [452, 186]];
  const SLEEVE_IN = [[214, 237], [306, 225], [428, 215], [452, 213]];
  const SLEEVE_END = { none: 0, cap: 208, elbow: 302, three: 362, full: 440, bell: 436 };

  function neckSeg(neck, back) {
    if (back) return neck === "v" ? "L282 150 L300 198 L318 150 L370 162" : neck === "mandarin" ? "L284 140 L316 140 L370 162" : "L280 150 Q300 164 320 150 L370 162";
    return {
      round: "L282 150 Q300 186 318 150 L370 162",
      v: "L280 150 L300 218 L320 150 L370 162",
      sweetheart: "L262 170 Q268 208 300 196 Q332 208 338 170 L370 162",
      boat: "L248 158 Q300 174 352 158 L370 162",
      square: "L272 152 L272 192 L328 192 L328 152 L370 162",
      mandarin: "L284 140 L316 140 L370 162",
    }[neck] || "L282 150 Q300 186 318 150 L370 162";
  }
  const NECK_DEPTH = { round: 172, v: 216, sweetheart: 200, boat: 168, square: 192, mandarin: 150 };

  function sleevePath(type) {
    const end = SLEEVE_END[type];
    if (!end) return null;
    const ys = [180, 196, 240, 300, 360, 400, 420].filter((y) => y < end - 6);
    let outer = ys.map((y) => `L${at(SLEEVE_OUT, y).toFixed(1)} ${y}`).join(" ");
    let oEnd = at(SLEEVE_OUT, end), iEnd = at(SLEEVE_IN, end);
    if (type === "bell") { oEnd -= 22; iEnd += 10; outer += ` L${(at(SLEEVE_OUT, end - 50) - 4).toFixed(1)} ${end - 50}`; }
    const inner = [400, 360, 300, 240, 214].filter((y) => y < end - 6).map((y) => `L${at(SLEEVE_IN, y).toFixed(1)} ${y}`).join(" ");
    return { d: `M230 160 ${outer} L${oEnd.toFixed(1)} ${end} Q${((oEnd + iEnd) / 2).toFixed(1)} ${end + (type === "bell" ? 8 : 4)} ${iEnd.toFixed(1)} ${end} ${inner} L240 204 Z`,
      cuff: `M${oEnd.toFixed(1)} ${end} Q${((oEnd + iEnd) / 2).toFixed(1)} ${end + (type === "bell" ? 8 : 4)} ${iEnd.toFixed(1)} ${end}` };
  }

  /* ---------- the garment ---------- */
  function garment(L, back) {
    const len = effLen(L.sil, L.len), h = HEM[len];
    const ns = neckSeg(L.neck, back);
    const parts = []; // {d, role}
    let hemD = "", clip = "", waist = 330, placket = null, belt = null;
    const bodice = (w) => `M230 162 ${ns} L380 196 L374 250 Q366 ${w - 30} 362 ${w} L238 ${w} Q234 ${w - 30} 226 250 L220 196 Z`;
    const crop = () => `M230 162 ${ns} L380 196 L374 250 L370 262 Q300 274 230 262 L226 250 L220 196 Z`;

    if (L.sil === "aline" || L.sil === "anarkali") {
      waist = L.sil === "anarkali" ? 270 : 330;
      const hw0 = 63, hwh = hw0 + (h - waist) * (L.sil === "anarkali" ? 0.44 : 0.36), my = waist + (h - waist) * 0.55;
      const skirt = `M237 ${waist} L363 ${waist} Q${(300 + hwh * 0.78).toFixed(1)} ${my} ${(300 + hwh).toFixed(1)} ${h} Q300 ${h + 16} ${(300 - hwh).toFixed(1)} ${h} Q${(300 - hwh * 0.78).toFixed(1)} ${my} 237 ${waist} Z`;
      parts.push({ d: skirt, role: "skirt" }, { d: bodice(waist + 2), role: "bodice" });
      hemD = `M${(300 - hwh).toFixed(1)} ${h} Q300 ${h + 16} ${(300 + hwh).toFixed(1)} ${h}`; clip = skirt;
      if (L.sil === "anarkali") for (let k = -4; k <= 4; k++) parts.push({ d: `M${300 + k * 12} ${waist + 4} L${(300 + k * hwh / 4.6).toFixed(1)} ${h + 8 - Math.abs(k) * 2}`, role: "fold" });
      else parts.push(...["M300 340 Q298 520 296 " + (h + 10), "M272 340 Q250 520 " + (300 - hwh * 0.62).toFixed(1) + " " + (h + 6), "M328 340 Q350 520 " + (300 + hwh * 0.62).toFixed(1) + " " + (h + 6)].map((d) => ({ d, role: "fold" })));
      placket = [NECK_DEPTH[L.neck] + 10, waist - 10]; belt = waist;
    } else if (L.sil === "sheath") {
      const hwh = len === "knee" ? 66 : 60;
      const skirt = `M238 330 L362 330 Q378 366 372 404 Q${300 + hwh + 6} ${(404 + h) / 2} ${300 + hwh} ${h} Q300 ${h + 6} ${300 - hwh} ${h} Q${300 - hwh - 6} ${(404 + h) / 2} 228 404 Q222 366 238 330 Z`;
      parts.push({ d: skirt, role: "skirt" }, { d: bodice(332), role: "bodice" }, { d: `M300 ${h - 70} L300 ${h + 4}`, role: "fold" });
      hemD = `M${300 - hwh} ${h} Q300 ${h + 6} ${300 + hwh} ${h}`; clip = skirt; placket = [NECK_DEPTH[L.neck] + 10, 320]; belt = 330;
    } else if (L.sil === "kurta") {
      const kh = KURTA[len];
      const body = `M230 162 ${ns} L380 196 L374 300 Q378 ${(300 + kh) / 2} 377 ${kh} L223 ${kh} Q222 ${(300 + kh) / 2} 226 300 L220 196 Z`;
      parts.push({ d: "M232 380 L368 380 L394 724 L308 724 L300 560 L292 724 L206 724 Z", role: "pants" }, { d: body, role: "bodice" });
      parts.push(...both(`M231 ${kh - 96} L227 ${kh}`).map((d) => ({ d, role: "slit" })));
      hemD = `M223 ${kh} L377 ${kh}`; clip = body; placket = [NECK_DEPTH[L.neck] + 8, 300]; belt = 330;
    } else if (L.sil === "lehenga") {
      const hwh = 78 + (h - 300) * 0.46, my = 300 + (h - 300) * 0.55;
      const skirt = `M238 300 L362 300 Q${(300 + hwh * 0.8).toFixed(1)} ${my} ${(300 + hwh).toFixed(1)} ${h} Q300 ${h + 18} ${(300 - hwh).toFixed(1)} ${h} Q${(300 - hwh * 0.8).toFixed(1)} ${my} 238 300 Z`;
      parts.push({ d: skirt, role: "skirt" }, { d: "M238 292 L362 292 L362 310 L238 310 Z", role: "band" }, { d: crop(), role: "bodice" });
      parts.push(...["M300 316 Q298 520 296 " + (h + 12), "M268 316 Q236 520 " + (300 - hwh * 0.6).toFixed(1) + " " + (h + 8), "M332 316 Q364 520 " + (300 + hwh * 0.6).toFixed(1) + " " + (h + 8)].map((d) => ({ d, role: "fold" })));
      hemD = `M${(300 - hwh).toFixed(1)} ${h} Q300 ${h + 18} ${(300 + hwh).toFixed(1)} ${h}`; clip = skirt; waist = 300;
    } else { // saree
      const skirt = `M240 300 L360 300 Q372 500 386 ${h} Q300 ${h + 14} 214 ${h} Q228 500 240 300 Z`;
      parts.push({ d: "M206 170 L230 162 L240 432 L208 452 Z", role: back ? "pallu" : "pallu-back" });
      parts.push({ d: skirt, role: "skirt" }, { d: crop(), role: "bodice" });
      for (let x = 276; x <= 324; x += 8) parts.push({ d: `M${x} 312 L${(300 + (x - 300) * 2.3).toFixed(1)} ${h + 4}`, role: "fold" });
      parts.push({ d: "M224 162 L268 154 Q330 262 374 334 L382 394 Q316 366 286 330 Q238 262 224 162 Z", role: "pallu" });
      hemD = `M214 ${h} Q300 ${h + 14} 386 ${h}`; clip = skirt; waist = 300;
    }
    if (L.neck === "mandarin" && !["lehenga", "saree"].includes(L.sil)) parts.push({ d: "M282 128 Q300 134 318 128 L318 142 L300 150 L282 142 Z", role: "collar" });
    return { parts, hemD, clip, waist, placket, belt, len, h, ns };
  }

  /* ---------- texture patterns (drawn in light/dark alpha so they work on any colour) ---------- */
  function texture(id, tex, col, acc) {
    const lt = lum(col) > 0.6, ink = lt ? "#000" : "#fff", a = lt ? 0.1 : 0.14;
    const P = (w, h, body) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"${tex === "chikan" ? ' patternTransform="scale(.7)"' : ""}>${body}</pattern>`;
    switch (tex) {
      case "weave": return P(6, 6, `<path d="M0 3H6M3 0V6" stroke="${ink}" stroke-opacity="${a}" stroke-width=".7"/>`);
      case "slub": return P(44, 10, `<path d="M0 3H14M19 3H27M32 3H42M3 7.5H9M14 7.5H34" stroke="${ink}" stroke-opacity="${a + 0.04}" stroke-width=".9" stroke-linecap="round"/>`);
      case "twill": return P(7, 7, `<path d="M0 7L7 0M-2 2L2 -2M5 9L9 5" stroke="#fff" stroke-opacity=".16" stroke-width="1.3"/><path d="M0 3.5L3.5 0M3.5 7L7 3.5" stroke="#000" stroke-opacity=".14" stroke-width=".7"/>`);
      case "pebble": return P(12, 12, `<g fill="${ink}" fill-opacity="${a + 0.03}"><circle cx="2" cy="3" r=".8"/><circle cx="8" cy="1.5" r=".6"/><circle cx="6" cy="7" r=".9"/><circle cx="11" cy="9" r=".6"/><circle cx="2.5" cy="10.5" r=".7"/></g>`);
      case "crinkle": return P(24, 9, `<path d="M0 4.5Q3 1.5 6 4.5T12 4.5T18 4.5T24 4.5" fill="none" stroke="${ink}" stroke-opacity="${a + 0.02}" stroke-width=".8"/>`);
      case "flow": return P(46, 60, `<path d="M11 0Q16 30 11 60M33 0Q28 30 33 60" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.6"/>`);
      case "spark": return P(16, 16, `<g fill="#fff"><circle cx="3" cy="4" r=".7" fill-opacity=".7"/><circle cx="11" cy="9" r=".55" fill-opacity=".55"/><circle cx="6" cy="13" r=".45" fill-opacity=".6"/></g>`);
      case "butti": return P(22, 22, `<g fill="${acc}"><path d="M11 6.5L12.4 10L16 11L12.4 12L11 15.5L9.6 12L6 11L9.6 10Z" fill-opacity=".9"/><circle cx="0" cy="0" r="1.2"/><circle cx="22" cy="0" r="1.2"/><circle cx="0" cy="22" r="1.2"/><circle cx="22" cy="22" r="1.2"/></g>`);
      case "chikan": return P(30, 30, `<g fill="none" stroke="#fffaf0" stroke-opacity=".85" stroke-width=".8"><ellipse cx="15" cy="9.5" rx="2" ry="3.4"/><ellipse cx="15" cy="20.5" rx="2" ry="3.4"/><ellipse cx="9.5" cy="15" rx="3.4" ry="2"/><ellipse cx="20.5" cy="15" rx="3.4" ry="2"/><path d="M0 0Q4 3 3 7M30 30Q26 27 27 23" stroke-dasharray="1 1.4"/></g><circle cx="15" cy="15" r="1.3" fill="#fffaf0" fill-opacity=".9"/>`);
      default: return "";
    }
  }

  /* ---------- the full scene ---------- */
  function svg(look, opts = {}) {
    const L = { sil: "anarkali", fab: "georgette", col: "#b0245a", acc: "#c9a05a", neck: "sweetheart", slv: "elbow", len: "floor",
      emb: [], dup: "none", belt: false, lining: false, pockets: false, skin: "#c98e66", ...look };
    const p = (opts.id || "lk") + "-";
    const back = opts.view === "back";
    const fx = FX[L.fab] || FX.cotton;
    const mannequin = L.skin === "mannequin";
    const skin = mannequin ? "#2a2420" : L.skin;
    const g = garment(L, back);
    const col = L.col, acc = L.acc, edge = shade(col, -0.32);
    const pants = lum(col) > 0.55 ? shade(col, -0.18) : shade(col, 0.32);
    const sheer = Math.max(0, fx.sheer - (L.lining ? 0.2 : 0));
    const hasTex = fx.tex !== "none";
    const vb = { full: "40 22 520 756", bodice: "192 108 216 216", arms: "150 126 300 340", hem: "40 380 520 400" }[opts.crop || "full"];

    const defs = `<defs>
      <linearGradient id="${p}s" x1="0" x2="1">
        <stop offset="0" stop-color="#000" stop-opacity="${(0.18 + fx.sheen * 0.35).toFixed(2)}"/>
        <stop offset=".3" stop-color="#fff" stop-opacity="${(fx.sheen * 0.75).toFixed(2)}"/>
        <stop offset=".46" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".64" stop-color="#fff" stop-opacity="${(fx.sheen * 0.45).toFixed(2)}"/>
        <stop offset="1" stop-color="#000" stop-opacity="${(0.22 + fx.sheen * 0.35).toFixed(2)}"/>
      </linearGradient>
      <linearGradient id="${p}k" x1="0" x2="1"><stop offset="0" stop-color="${shade(skin, -0.16)}"/><stop offset=".45" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.2)}"/></linearGradient>
      <linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(acc, -0.28)}"/><stop offset=".5" stop-color="${shade(acc, 0.32)}"/><stop offset="1" stop-color="${shade(acc, -0.22)}"/></linearGradient>
      ${texture(p + "t", fx.tex, col, acc)}
      <pattern id="${p}q" patternUnits="userSpaceOnUse" width="18" height="18"><g fill="${shade(acc, 0.35)}"><circle cx="4" cy="5" r="1.3"/><circle cx="13" cy="12" r="1.1"/><circle cx="9" cy="16" r=".8"/></g><circle cx="3.6" cy="4.6" r=".45" fill="#fff"/></pattern>
      <pattern id="${p}b" patternUnits="userSpaceOnUse" width="30" height="30"><g fill="${acc}" fill-opacity=".55"><path d="M15 8Q18 12 15 15Q12 12 15 8ZM15 22Q12 18 15 15Q18 18 15 22ZM8 15Q12 12 15 15Q12 18 8 15ZM22 15Q18 18 15 15Q18 12 22 15Z"/><circle cx="0" cy="0" r="1.6"/><circle cx="30" cy="30" r="1.6"/></g></pattern>
      <clipPath id="${p}c"><path d="${g.clip}"/></clipPath>
    </defs>`;

    // fabric layer stack for one garment piece
    const piece = (d, fill, opacity = 1, overlay = true) =>
      `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>` +
      (overlay && hasTex ? `<path d="${d}" fill="url(#${p}t)" fill-opacity="${opacity}"/>` : "") +
      (L.emb.includes("sequins") && overlay ? `<path d="${d}" fill="url(#${p}q)"/>` : "") +
      (L.emb.includes("block") && overlay ? `<path d="${d}" fill="url(#${p}b)"/>` : "") +
      `<path d="${d}" fill="url(#${p}s)" fill-opacity="${Math.min(1, opacity + 0.1)}"/>` +
      `<path d="${d}" fill="none" stroke="${edge}" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"/>`;

    let out = "";
    /* body underneath */
    const skinP = (d) => `<path d="${d}" fill="url(#${p}k)"/>`;
    const HAIR = "#231812";
    // long wavy hair falling behind the shoulders (in front of the body when seen from the back)
    const longHair = `<path d="M266 84 Q256 128 254 176 Q246 236 256 296 Q262 312 274 300 Q282 318 292 304 Q300 320 308 304 Q318 318 326 300 Q338 312 344 296 Q354 236 346 176 Q344 128 334 84 Z" fill="${HAIR}"/>`
      + `<path d="M276 120 Q270 200 280 290 M300 124 Q296 210 300 300 M324 120 Q330 200 320 290" fill="none" stroke="#3b2a20" stroke-width="2" stroke-opacity=".6"/>`;
    if (!mannequin && !back) out += longHair;
    out += both(LEG).map(skinP).join("") + both(SHOE).map((d) => `<path d="${d}" fill="${mannequin ? "url(#" + p + "a)" : "#f2efe9"}" stroke="${mannequin ? "none" : "#cfc7ba"}" stroke-width="1.5"/>`).join("");
    out += skinP(TORSO);
    if (!mannequin) out += `<path d="M284 152 Q300 176 316 152" fill="none" stroke="#d4af6a" stroke-width="1.4"/><circle cx="300" cy="166" r="2" fill="#d4af6a"/>`;
    /* pallu that falls behind the shoulder */
    g.parts.filter((x) => x.role === "pallu-back").forEach((x) => (out += piece(x.d, shade(col, -0.18), 1 - sheer * 0.5)));
    /* garment body */
    g.parts.forEach((x) => {
      if (x.role === "pants") out += piece(x.d, pants, 1, false);
      else if (x.role === "skirt" || x.role === "bodice" || x.role === "collar") out += piece(x.d, col, 1 - sheer * 0.25);
      else if (x.role === "band") out += `<path d="${x.d}" fill="url(#${p}a)"/>`;
    });
    if (L.sil === "lehenga") out += `<g clip-path="url(#${p}c)"><path d="${g.hemD}" transform="translate(0,-16)" fill="none" stroke="${shade(col, -0.36)}" stroke-width="30"/><path d="${g.hemD}" transform="translate(0,-33)" fill="none" stroke="url(#${p}a)" stroke-width="3"/></g>`;
    if (L.sil === "saree") out += `<g clip-path="url(#${p}c)"><path d="${g.hemD}" transform="translate(0,-9)" fill="none" stroke="${shade(col, -0.38)}" stroke-width="18"/></g>`;
    g.parts.filter((x) => x.role === "fold").forEach((x) => (out += `<path d="${x.d}" fill="none" stroke="#000" stroke-opacity="${(0.1 + fx.sheen * 0.1).toFixed(2)}" stroke-width="1.6"/>`));
    g.parts.filter((x) => x.role === "slit").forEach((x) => (out += `<path d="${x.d}" fill="none" stroke="${edge}" stroke-width="2"/>`));

    /* embellishments on the hem / neckline */
    const emb = L.emb;
    if (emb.includes("gota")) out += `<g clip-path="url(#${p}c)"><path d="${g.hemD}" transform="translate(0,-10)" fill="none" stroke="url(#${p}a)" stroke-width="15"/><path d="${g.hemD}" transform="translate(0,-10)" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="7" stroke-dasharray="2 5"/></g>`;
    if (emb.includes("zari")) {
      out += `<g clip-path="url(#${p}c)">${[-14, -24].map((t) => `<path d="${g.hemD}" transform="translate(0,${t})" fill="none" stroke="url(#${p}a)" stroke-width="2.2"/>`).join("")}</g>`;
      out += `<path d="M230 162 ${g.ns}" fill="none" stroke="url(#${p}a)" stroke-width="3" stroke-linejoin="round"/>`;
    }
    if (emb.includes("mirror")) out += `<g clip-path="url(#${p}c)"><path d="${g.hemD}" transform="translate(0,-34)" fill="none" stroke="#e9eaf0" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 20"/><path d="${g.hemD}" transform="translate(-1.2,-35.2)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 20"/></g>`;
    if (emb.includes("pearls") && g.placket && !back) out += `<path d="M300 ${g.placket[0]} L300 ${g.placket[1]}" stroke="#f6f1e6" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.1 15"/><path d="M299 ${g.placket[0] - 1} L299 ${g.placket[1] - 1}" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 15"/>`;
    if (back && g.placket) out += `<path d="M300 ${g.placket[0] - 10} L300 ${g.waist}" stroke="${edge}" stroke-width="1.4" stroke-dasharray="3 2"/>`;

    /* belt + pockets */
    if (L.belt && g.belt) out += `<path d="M236 ${g.belt - 9} L364 ${g.belt - 9} L364 ${g.belt + 9} L236 ${g.belt + 9} Z" fill="url(#${p}a)"/>` + (back ? "" : `<rect x="292" y="${g.belt - 11}" width="16" height="22" rx="3" fill="none" stroke="${shade(acc, -0.4)}" stroke-width="2.2"/>`);
    if (L.pockets && ["aline", "sheath", "anarkali", "kurta"].includes(L.sil)) {
      const y = (L.sil === "kurta" ? 410 : g.waist + 62);
      out += both(`M246 ${y} Q253 ${y + 26} 266 ${y + 31}`).map((d) => `<path d="${d}" fill="none" stroke="${edge}" stroke-width="2.2" stroke-linecap="round"/>`).join("");
    }
    /* front pallu over the body (saree) */
    g.parts.filter((x) => x.role === "pallu").forEach((x) => {
      out += piece(x.d, col, 1 - sheer * 0.55);
      out += `<path d="M268 154 Q330 262 378 340" fill="none" stroke="${emb.includes("zari") || emb.includes("gota") ? `url(#${p}a)` : shade(col, -0.38)}" stroke-width="6"/>`;
    });

    /* arms + sleeves (sheer fabrics let the skin show through) */
    const sl = sleevePath(L.slv);
    out += both(ARM).map(skinP).join("");
    if (sl) {
      both(sl.d).forEach((d) => (out += piece(d, col, 1 - sheer * 1.4)));
      if (emb.includes("gota") || emb.includes("zari")) both(sl.cuff).forEach((d) => (out += `<path d="${d}" fill="none" stroke="url(#${p}a)" stroke-width="${emb.includes("gota") ? 6 : 2.5}"/>`));
    }

    /* dupatta */
    if (L.dup !== "none" && L.sil !== "saree") {
      const d = L.dup === "draped" ? "M232 166 L262 158 Q342 292 414 402 L434 640 L398 652 L388 432 Q306 322 232 166 Z" : "M220 168 L246 160 L258 610 L222 622 Z";
      out += piece(d, shade(col, 0.12), 0.62 - sheer * 0.2);
      out += `<path d="${d}" fill="none" stroke="url(#${p}a)" stroke-width="2.4"/>`;
    }

    /* neck + head */
    out += `<path d="M286 120 L314 120 L316 154 L284 154 Z" fill="url(#${p}k)"/>`;
    if (L.neck === "mandarin" && !["lehenga", "saree"].includes(L.sil)) out += piece("M282 128 Q300 134 318 128 L318 146 L300 154 L282 146 Z", col, 1) + `<path d="M282 128 Q300 134 318 128" fill="none" stroke="url(#${p}a)" stroke-width="2"/>`;
    if (mannequin) {
      out += `<circle cx="300" cy="104" r="11" fill="url(#${p}a)"/><rect x="291" y="113" width="18" height="9" rx="2" fill="url(#${p}a)"/>`;
    } else {
      // faceless mannequin head: a soft oval tapering to the chin, with ears; light and shade suggest the features
      out += [271, 329].map((cx) => `<ellipse cx="${cx}" cy="98" rx="4" ry="8" fill="url(#${p}k)"/>`).join("");
      out += `<path d="M300 59 C321 59 330 75 330 94 C330 111 322 121 313 127 C307 131 303 132.5 300 132.5 C297 132.5 293 131 287 127 C278 121 270 111 270 94 C270 75 279 59 300 59 Z" fill="url(#${p}k)"/>`;
      if (!back) out += `<path d="M300 90 Q302.5 102 302 108 Q300 110 298.5 109" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="2.2" stroke-linecap="round"/>`;
      // centre-parted, half-up hair swept back from the face
      out += `<path d="M268 104 Q262 56 300 53 Q338 56 332 104 Q330 84 318 74 Q306 66 300 66 Q294 66 282 74 Q270 84 268 104 Z" fill="${HAIR}"/>`
        + `<path d="M300 54 L300 66" stroke="#4a3426" stroke-width="1.2"/>`;   // centre parting
      if (back) {
        // back: hair gathered into the half-up twist, waves falling to the waist
        out += `<path d="M266 70 Q258 120 254 176 Q246 236 256 296 Q262 312 274 300 Q282 318 292 304 Q300 320 308 304 Q318 318 326 300 Q338 312 344 296 Q354 236 346 176 Q342 120 334 70 Q318 58 300 58 Q282 58 266 70 Z" fill="${HAIR}"/>`
          + `<path d="M276 110 Q270 200 280 290 M300 98 Q296 210 300 300 M324 110 Q330 200 320 290" fill="none" stroke="#3b2a20" stroke-width="2" stroke-opacity=".6"/>`
          + `<path d="M286 80 Q300 72 314 80 Q300 90 286 80 Z" fill="#2e2018"/>`;
      } else {
        // faceless: only a soft warmth on the cheeks
        out += [285, 315].map((cx) => `<ellipse cx="${cx}" cy="105" rx="6" ry="3.5" fill="#f08a8a" fill-opacity=".14"/>`).join("");
        // wavy locks framing the face over the shoulders
        out += both("M272 92 Q262 122 268 152 Q262 180 272 210 Q282 186 278 156 Q284 124 278 96 Z").map((d) => `<path d="${d}" fill="${HAIR}"/>`).join("");
        out += both("M272 104 L272 116").map((d) => `<path d="${d}" stroke="url(#${p}a)" stroke-width="2.6" stroke-linecap="round"/>`).join("");
      }
    }

    const figure = back ? `<g transform="matrix(-1 0 0 1 600 0)">${out}</g>` : out;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${opts.label || "Your Uniqo look"}" class="${opts.cls || ""}">${defs}${figure}</svg>`;
  }

  /* fabric swatch tile for the picker */
  function swatch(fab, col, acc, id) {
    const fx = FX[fab] || FX.cotton, p = id + "-";
    const d = "M0 0 L60 0 L60 60 L0 60 Z";
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
      <linearGradient id="${p}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${(fx.sheen * 0.8).toFixed(2)}"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="${(fx.sheen * 0.5).toFixed(2)}"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
      ${texture(p + "t", fx.tex, col, acc)}</defs>
      <path d="${d}" fill="${col}"/>${fx.tex !== "none" ? `<path d="${d}" fill="url(#${p}t)"/>` : ""}<path d="${d}" fill="url(#${p}s)"/>
      <path d="M0 40 Q30 30 60 46" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>
      ${fx.sheer ? `<path d="M34 0 L60 0 L60 60 L46 60 Z" fill="#fff" fill-opacity="${(fx.sheer * 0.7).toFixed(2)}"/>` : ""}</svg>`;
  }

  /* ---------- the "game stats" + price, shared with the server's formula ---------- */
  const clamp = (n) => Math.max(1, Math.min(5, Math.round(n)));
  function compute(L, cfg) {
    const find = (arr, k) => arr.find((x) => x.key === k) || arr[0];
    const fab = find(cfg.fabrics, L.fab), sil = find(cfg.silhouettes, L.sil);
    const len = effLen(L.sil, L.len);
    const embs = cfg.embellishments.filter((e) => L.emb.includes(e.key));
    const heavy = embs.filter((e) => ["gota", "zari", "mirror", "sequins"].includes(e.key)).length;
    const st = { ...fab.stats };
    st.formality = clamp(st.formality + heavy * 0.7 + (L.sil === "lehenga" ? 1 : 0) + (len === "floor" ? 0.4 : 0) - (L.sil === "kurta" ? 0.6 : 0));
    st.comfort = clamp(st.comfort - (heavy >= 2 ? 1 : 0) - (L.sil === "lehenga" ? 1 : 0) - (L.sil === "sheath" && fab.stats.stretch < 2 ? 0.6 : 0) + (L.pockets ? 0.4 : 0));
    st.breathability = clamp(st.breathability - (L.lining ? 1 : 0) - (heavy >= 2 ? 0.5 : 0));
    st.drape = clamp(st.drape + (L.sil === "anarkali" || L.sil === "saree" ? 0.4 : 0) - (L.belt ? 0.3 : 0));
    st.stretch = clamp(st.stretch);

    const meters = sil.meters * find(cfg.lengths, len).factor + find(cfg.sleeves, L.slv).meters + (L.dup !== "none" && L.sil !== "saree" ? cfg.extras.dupatta_meters : 0);
    let cost = sil.base + fab.rate * meters + embs.reduce((s, e) => s + e.price, 0);
    ["belt", "lining", "pockets"].forEach((k) => { if (L[k]) cost += cfg.extras[k]; });
    const estimate = Math.round(cost / 100) * 100;
    const days = sil.days + embs.reduce((m, e) => Math.max(m, e.days), 0) + (embs.length > 1 ? embs.length - 1 : 0) + (L.lining ? 1 : 0);

    const score = (fab.luxury || 1) + heavy + (L.dup !== "none" ? 1 : 0) + (L.sil === "lehenga" ? 2 : L.sil === "saree" || L.sil === "anarkali" ? 1 : 0);
    const tier = score >= 7 ? "Heirloom" : score >= 5 ? "Couture" : score >= 3 ? "Signature" : "Essential";

    const notes = [];
    if ((fab.best || []).includes(L.sil)) notes.push({ t: "good", m: `Atelier favourite: ${fab.label} ${sil.label.toLowerCase()}.` });
    else notes.push({ t: "warn", m: `Bold pairing. Our stylist will advise on structure for ${fab.label.toLowerCase()} in a ${sil.label.toLowerCase()}.` });
    if ((FX[L.fab] || {}).sheer >= 0.18 && !L.lining) notes.push({ t: "info", m: `${fab.label} is sheer. Add lining for full coverage.` });
    if (L.sil === "sheath" && fab.stats.stretch < 2) notes.push({ t: "info", m: "Non-stretch sheath: we add a concealed side zip for ease." });
    if (len !== L.len) notes.push({ t: "info", m: L.sil === "saree" ? "Sarees are always cut floor-length." : "Lehengas are cut ankle-length or longer." });
    if (L.pockets) notes.push({ t: "good", m: "Yes, real pockets. Deep enough for a phone." });

    const combos = cfg.silhouettes.length * cfg.fabrics.length * (cfg.colors.length + 1) * cfg.accents.length * cfg.necklines.length *
      cfg.sleeves.length * cfg.lengths.length * 2 ** cfg.embellishments.length * 3 * 8;
    return { stats: st, estimate, days, tier, notes, combos, fab, sil, len, meters };
  }

  return { svg, swatch, compute, effLen, FX, shade };
})();
