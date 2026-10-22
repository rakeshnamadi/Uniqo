/* UNIQO Design Lobby - 3D avatar.
   A small WebGL2 renderer with no libraries. The avatar and every garment are
   generated from the look recipe, so silhouette, length, flare, neckline and
   sleeves change instantly; fabrics and handwork are drawn by one shader.
   The same recipe drives the SVG renderer, which stays as the fallback. */
const UQ3D = (() => {
  const supported = () => {
    try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
  };

  /* ------------------------------------------------------------------ math */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(e, c, u) {
    const z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  }
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const shade = (h, f) => hexRgb(h).map((c) => (f >= 0 ? c + (1 - c) * f : c * (1 + f)));

  /* ------------------------------------------------------------------ geometry
     loft(): rings of ellipses stacked top->bottom. uv = (u 0..1 around, v 0..1 down,
     arc metres from the front centre, metres down from the top ring). */
  function loft(rings, o = {}) {
    const seg = o.seg || 48, R = rings.length, grid = [], vM = [0];
    for (let i = 0; i < R; i++) {
      const r = rings[i], row = [];
      for (let j = 0; j <= seg; j++) {
        const th = Math.PI + (j / seg) * 2 * Math.PI;           // j = seg/2 -> front (+z)
        const m = 1 + (o.ripple ? o.ripple(th, i / (R - 1), r) : 0);
        row.push([(r.cx || 0) + r.rx * m * Math.sin(th), r.y, (r.cz || 0) + r.rz * m * Math.cos(th)]);
      }
      grid.push(row);
      if (i > 0) vM.push(vM[i - 1] + len(sub(grid[i - 1][seg / 2], row[seg / 2])));
    }
    const total = vM[R - 1] || 1, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i < R; i++) {
      let circ = 0;
      for (let j = 0; j < seg; j++) circ += len(sub(grid[i][j + 1], grid[i][j]));
      const c = rings[i];
      for (let j = 0; j <= seg; j++) {
        const p = grid[i][j];
        const jm = j === 0 ? seg - 1 : j - 1, jp = j === seg ? 1 : j + 1;
        const du = sub(grid[i][jp], grid[i][jm]);
        const dv = sub(grid[Math.min(i + 1, R - 1)][j], grid[Math.max(i - 1, 0)][j]);
        let n = cross(du, dv);
        if (len(n) < 1e-9) n = [0, i === 0 ? 1 : -1, 0];
        else {
          n = norm(n);
          const out = [p[0] - (c.cx || 0), 0, p[2] - (c.cz || 0)];
          if (len(out) > 1e-6 && dot(n, out) < 0) n = [-n[0], -n[1], -n[2]];
          else if (len(out) <= 1e-6 && n[1] * (i === 0 ? 1 : -1) < 0) n = [-n[0], -n[1], -n[2]];
        }
        pos.push(...p); nor.push(...n); uv.push(j / seg, vM[i] / total, (j / seg - 0.5) * circ, vM[i]);
      }
    }
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { pos, nor, uv, idx, total };
  }

  /* ribbon(): a strip of cloth along a 3D path (dupatta, saree pallu) */
  function ribbon(pts, width) {
    const pos = [], nor = [], uv = [], idx = [];
    let acc = 0;
    pts.forEach((p, i) => {
      if (i) acc += len(sub(p, pts[i - 1]));
      const t = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
      const out = norm([p[0], 0, p[2]]);
      const s = norm(cross(t, out)), n = norm(cross(s, t));
      const w = (typeof width === "function" ? width(i / (pts.length - 1)) : width) / 2;
      [-1, 1].forEach((k) => { pos.push(p[0] + s[0] * w * k, p[1] + s[1] * w * k, p[2] + s[2] * w * k); nor.push(...n); uv.push((k + 1) / 2, 0, k * w, acc); });
    });
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    for (let i = 0; i < uv.length; i += 4) uv[i + 1] = uv[i + 3] / (acc || 1);
    return { pos, nor, uv, idx, total: acc };
  }
  /* smooth a path through control points (Catmull-Rom) */
  function spline(ctrl, steps = 6) {
    const out = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(ctrl[ctrl.length - 1]);
    return out;
  }

  /* ------------------------------------------------------------------ the body (metres, y up, facing +z) */
  // [y, rx, rz, cz] - proportions follow the brand's reference turnaround: soft shoulders,
  // a full bust that projects forward, a defined waist and fuller hips with a rounded seat
  const TORSO = [[1.378, .062, .058, -.004], [1.37, .084, .064, -.004], [1.36, .114, .073, -.004], [1.352, .14, .08, -.004], [1.325, .168, .09, 0], [1.285, .162, .106, .012],
    [1.235, .158, .128, .026], [1.19, .148, .122, .022], [1.14, .128, .097, .008], [1.08, .108, .082, 0], [1.03, .118, .088, -.004],
    [.98, .15, .104, -.012], [.925, .172, .118, -.02], [.87, .165, .112, -.018], [.83, .11, .08, -.006], [.81, .001, .001, 0]];
  const torsoAt = (y) => {
    if (y >= TORSO[0][0]) return { rx: TORSO[0][1], rz: TORSO[0][2], cz: TORSO[0][3] };
    for (let i = 1; i < TORSO.length; i++) if (y >= TORSO[i][0]) {
      const a = TORSO[i - 1], b = TORSO[i], t = (a[0] - y) / (a[0] - b[0]);
      return { rx: lerp(a[1], b[1], t), rz: lerp(a[2], b[2], t), cz: lerp(a[3], b[3], t) };
    }
    return { rx: .1, rz: .075, cz: 0 };
  };
  // [y, cx, cz, r]  (right side; mirrored for the left)
  const ARM = [[1.338, .176, 0, .047], [1.25, .192, 0, .042], [1.16, .202, .004, .036], [1.07, .208, .01, .031], [.96, .216, .022, .03], [.84, .224, .03, .024]];
  const armAt = (y) => {
    for (let i = 1; i < ARM.length; i++) if (y >= ARM[i][0]) {
      const a = ARM[i - 1], b = ARM[i], t = (a[0] - y) / (a[0] - b[0]);
      return { cx: lerp(a[1], b[1], t), cz: lerp(a[2], b[2], t), r: lerp(a[3], b[3], t) };
    }
    const l = ARM[ARM.length - 1]; return { cx: l[1], cz: l[2], r: l[3] };
  };
  const LEG = [[.9, .086, -.012, .084], [.78, .085, -.006, .078], [.62, .08, 0, .062], [.5, .078, .006, .05], [.46, .078, .008, .047],
    [.36, .08, .002, .05], [.24, .082, -.004, .042], [.12, .084, -.006, .031], [.08, .084, -.006, .029]];
  const legOuterAt = (y) => {                                              // outer edge of the thigh/calf, for skirt clearance
    if (y >= LEG[0][0]) return 0;                                          // above the thighs the hips decide
    for (let i = 1; i < LEG.length; i++) if (y >= LEG[i][0]) {
      const a = LEG[i - 1], b = LEG[i], t = (a[0] - y) / (a[0] - b[0]);
      return lerp(a[1] + a[3], b[1] + b[3], t);
    }
    return LEG[LEG.length - 1][1] + LEG[LEG.length - 1][3];
  };
  const mirrorRings = (rings, side) => rings.map((r) => ({ ...r, cx: (r.cx || 0) * side }));

  /* A faceless, boutique-mannequin head: an oval that tapers to a soft chin, with the
     brow, nose, cheekbones, lips and chin sculpted into the surface (no painted features).
     Light and shadow alone describe the face. */
  function headGeo() {
    const cy = 1.575, ry = .113, N = 52, rings = [];
    for (let k = 0; k <= N; k++) {
      const ph = (k / N) * Math.PI, s = Math.sin(ph) || .0005;
      const low = Math.max(0, (ph - Math.PI * .5) / (Math.PI * .5));      // 0 above the cheekbones -> 1 at the chin
      const w = 1 - .36 * Math.pow(low, 1.8), dep = 1 - .1 * low * low;   // narrower jaw, softly pointed chin
      rings.push({ y: cy + ry * Math.cos(ph), cx: 0, cz: .008 + .012 * low * low, rx: .079 * s * w, rz: .094 * s * dep });
    }
    const g = (x, m, sd) => Math.exp(-((x - m) * (x - m)) / (2 * sd * sd));
    return loft(rings, {
      seg: 128,
      ripple: (th, t, r) => {
        const a = Math.atan2(Math.sin(th), Math.cos(th)), y = r.y;          // a = 0 faces forward
        let m = 0;
        const ridge = y < 1.606 && y > 1.536 ? (y > 1.553 ? (1.606 - y) / .053 : (y - 1.536) / .017) : 0;
        m += .15 * Math.pow(Math.max(0, ridge), 1.5) * g(a, 0, .07 + .035 * (1 - ridge));   // nose: soft bridge to a rounded tip
        m += .026 * g(y, 1.612, .007) * g(a, 0, .55);                                      // brow line
        m -= .032 * g(y, 1.591, .011) * (g(a, .37, .14) + g(a, -.37, .14));               // gentle eye hollows
        m += .03 * g(y, 1.566, .016) * (g(a, .8, .2) + g(a, -.8, .2));                    // cheekbones
        m += .026 * g(y, 1.514, .008) * g(a, 0, .2);                                       // lips
        m -= .018 * g(y, 1.498, .005) * g(a, 0, .18);                                      // crease under the lip
        m += .042 * g(y, 1.477, .012) * g(a, 0, .28);                                      // chin
        return m;
      },
    });
  }
  const ringsFrom = (rows, f) => rows.map(f);
  function ellipsoid(c, rx, ry, rz, n = 16, taper) {
    const rings = [];
    for (let k = 0; k <= n; k++) {
      const ph = (k / n) * Math.PI, s = Math.sin(ph) || 0.0005, tp = taper ? taper(ph) : 1;
      rings.push({ y: c[1] + ry * Math.cos(ph), cx: c[0], cz: c[2], rx: rx * s * tp, rz: rz * s * tp });
    }
    return rings;
  }

  /* ------------------------------------------------------------------ fabrics (render side) */
  const FAB = {
    cotton: { tex: 1, sheen: .12, power: 10, sheer: 0 }, linen: { tex: 2, sheen: .08, power: 8, sheer: 0 },
    denim: { tex: 3, sheen: .06, power: 8, sheer: 0 }, rayon: { tex: 6, sheen: .26, power: 24, sheer: 0 },
    crepe: { tex: 4, sheen: .16, power: 14, sheer: 0 }, georgette: { tex: 5, sheen: .18, power: 20, sheer: .2 },
    chiffon: { tex: 6, sheen: .2, power: 24, sheer: .36 }, chanderi: { tex: 8, sheen: .28, power: 30, sheer: .28 },
    chikankari: { tex: 9, sheen: .08, power: 10, sheer: .1 }, silk: { tex: 0, sheen: .55, power: 48, sheer: 0 },
    satin_silk: { tex: 0, sheen: .85, power: 90, sheer: 0 }, space_silk: { tex: 7, sheen: .6, power: 60, sheer: 0 },
  };
  const NECK = { round: 0, v: 1, sweetheart: 2, boat: 3, square: 4, mandarin: 5 };
  const EMB = ["gota", "zari", "mirror", "sequins", "block", "pearls"];
  const HEM = { knee: .48, midi: .3, ankle: .1, floor: .03 };
  const KURTA_HEM = { knee: .52, midi: .45, ankle: .37, floor: .3 };
  const SLEEVE_END = { cap: 1.25, elbow: 1.07, three: .97, full: .83, bell: .85 };
  const effLen = (sil, l) => (sil === "saree" ? "floor" : sil === "lehenga" && (l === "knee" || l === "midi") ? "ankle" : l);

  /* build every mesh for a look: [{geo, mat}] */
  function build(L, cfg) {
    const out = [];
    const fx = FAB[L.fab] || FAB.cotton;
    const fabStats = (cfg && cfg.fabrics.find((f) => f.key === L.fab)) || { stats: { drape: 3 } };
    const drape = 0.35 + ((fabStats.stats.drape - 1) / 4) * 1.05;          // stiff denim .35 ... flowing chiffon 1.4
    const sheer = Math.max(0, fx.sheer - (L.lining ? 0.22 : 0));
    const mannequin = L.skin === "mannequin";
    const skin = hexRgb(mannequin ? "#2a2420" : L.skin);
    const col = hexRgb(L.col), acc = hexRgb(L.acc);
    const emb = EMB.map((k) => (L.emb || []).includes(k) ? 1 : 0);
    const E = 0.012;                                                       // cloth sits this far off the skin
    const fabric = (extra = {}) => ({ kind: 2, color: col, accent: acc, tex: fx.tex, sheen: fx.sheen, power: fx.power, alpha: 1, emb, ...extra });
    const add = (geo, mat) => out.push({ geo, mat });

    /* --- body */
    add({ shadow: true, ...loft([0, .12, .22, .3, .36].map((r) => ({ y: .002, rx: r * 1.2, rz: r * .62 })), { seg: 40 }) }, { kind: 4 });
    add(loft(TORSO.map(([y, rx, rz, cz]) => ({ y, rx, rz, cz }))), { kind: 0, color: skin });
    add(loft([[1.49, .044], [1.44, .045], [1.39, .05], [1.372, .056]].map(([y, r]) => ({ y, rx: r, rz: r * .95, cz: -.004 }))), { kind: 0, color: skin });
    [1, -1].forEach((side) => {
      add(loft(mirrorRings(ARM.map(([y, cx, cz, r]) => ({ y, cx, cz, rx: r, rz: r })), side), { seg: 24 }), { kind: 0, color: skin });
      add(loft(mirrorRings([[.85, .225, .03, .021], [.81, .228, .033, .028], [.77, .23, .036, .026], [.735, .231, .038, .014], [.725, .231, .038, .001]]
        .map(([y, cx, cz, r]) => ({ y, cx, cz, rx: r * .6, rz: r })), side), { seg: 18 }), { kind: 0, color: skin });
      add(loft(mirrorRings(LEG.map(([y, cx, cz, r]) => ({ y, cx, cz, rx: r, rz: r })), side), { seg: 24 }), { kind: 0, color: skin });
      // chunky white sneakers, as in the reference (gold slippers on the mannequin)
      add(loft(mirrorRings([[.11, .084, 0, .036], [.075, .084, .016, .047], [.045, .084, .036, .05], [.022, .084, .048, .048], [.008, .084, .05, .042], [.001, .084, .05, .001]]
        .map(([y, cx, cz, r]) => ({ y, cx, cz, rx: .042, rz: r * 1.65 })), side), { seg: 24 }),
        mannequin ? { kind: 3, color: acc } : { kind: 0, color: [.95, .93, .89], spec: .25 });
    });
    if (mannequin) {
      add(loft(ellipsoid([0, 1.535, 0], .036, .036, .036, 12)), { kind: 3, color: acc });
    } else {
      const HAIR = [.13, .085, .06];                                       // deep espresso brown
      add(headGeo(), { kind: 0, color: skin, face: 1 });
      [1, -1].forEach((s) => add(loft(ellipsoid([.083 * s, 1.568, -.004], .009, .026, .016, 12)), { kind: 0, color: skin }));   // ears
      add(loft(ellipsoid([0, 1.594, -.012], .1, .132, .117, 24)), { kind: 1, color: HAIR });   // crown with volume, centre parting
      add(loft(ellipsoid([0, 1.622, -.108], .046, .03, .032, 14)), { kind: 1, color: [.12, .078, .055] });     // half-up twist
      // long wavy curtain down the back to the waist
      const curtain = [[1.612, .07, .085, -.06], [1.6, .095, .112, -.02], [1.575, .1, .118, -.008], [1.53, .1, .115, -.01], [1.47, .112, .112, -.028],
        [1.42, .15, .12, -.04], [1.36, .175, .13, -.045], [1.3, .178, .14, -.045], [1.22, .172, .15, -.04], [1.14, .16, .145, -.045], [1.06, .15, .135, -.05], [1.0, .14, .125, -.055]];
      add(loft(curtain.map(([y, rx, rz, cz]) => ({ y, rx, rz, cz })), {
        seg: 72, ripple: (th, t) => (t > .3 ? .05 * (t - .3) * Math.sin(th * 16 + t * 14) : 0) + .02 * t * Math.sin(th * 29 - t * 20),
      }), { kind: 6, color: HAIR, alpha: .99 });
      // soft strands framing the face: a fine wisp along each cheek, and a fuller lock that falls over the shoulder
      [1, -1].forEach((s) => {
        const wisp = [[.06, 1.64, .072], [.086, 1.585, .058], [.093, 1.53, .046], [.097, 1.47, .036], [.11, 1.41, .042], [.13, 1.35, .078], [.14, 1.29, .102]];
        const lock = [[.075, 1.645, .03], [.094, 1.575, .02], [.102, 1.5, .02], [.117, 1.43, .032], [.142, 1.36, .088], [.149, 1.29, .117], [.141, 1.22, .132], [.131, 1.16, .126]];
        const wave = (pts, k) => pts.map(([x, y, z], i) => [(x + (i % 2 ? k : -k / 2)) * s, y, z]);
        add(ribbon(spline(wave(wisp, .004), 6), (t) => .04 - .016 * t), { kind: 6, color: HAIR, lock: 1, alpha: .98 });
        add(ribbon(spline(wave(lock, .007), 6), (t) => .066 - .03 * t), { kind: 6, color: HAIR, lock: 1, alpha: .98 });
      });
      [1, -1].forEach((s) => add(loft(ellipsoid([.087 * s, 1.546, -.002], .003, .004, .003, 8)), { kind: 3, color: [.83, .66, .36] }));   // tiny studs
      // fine gold chain resting at the base of the neck
      const chain = [];
      for (let k = 0; k <= 48; k++) {
        const th = (k / 48) * 2 * Math.PI, f = Math.pow((1 + Math.cos(th)) / 2, 2), y = 1.372 - .05 * f, t = torsoAt(y);
        chain.push([Math.sin(th) * (.072 + .02 * f), y, Math.cos(th) * Math.max(.066, (t.rz + t.cz + .004) * f + .066 * (1 - f))]);
      }
      add(ribbon(chain, .0035), { kind: 3, color: [.83, .66, .36] });
      add(loft(ellipsoid([0, 1.313, (torsoAt(1.313).rz + torsoAt(1.313).cz) + .006], .0045, .006, .003, 8)), { kind: 3, color: [.83, .66, .36] });
    }

    /* --- garment */
    const len = effLen(L.sil, L.len);
    const waist = { aline: 1.06, sheath: 1.06, anarkali: 1.13, kurta: 1.06, lehenga: 1.02, saree: 1.02 }[L.sil] || 1.06;
    const crop = L.sil === "lehenga" || L.sil === "saree";
    const bodiceEnd = crop ? 1.13 : L.sil === "kurta" ? KURTA_HEM[len] : waist - .005;
    const torsoRingsTo = (yEnd, extra = 0) => {
      const rows = TORSO.filter((r) => r[0] > yEnd + .001 && r[0] > .86).map(([y]) => y);
      for (let y = .86; y > yEnd + .02; y -= .06) rows.push(y);              // long kurta: smooth fall
      rows.push(yEnd);
      return rows.map((y) => {
        const t = y < .86 ? { rx: .172, rz: .118, cz: -.018 } : torsoAt(y);
        const k = y < .92 ? Math.min(1, (.92 - y) / .25) : 0;               // kurta: falls straight below the hip
        return { y, rx: lerp(t.rx, .178, k) + E + extra, rz: lerp(t.rz, .124, k) + E + extra, cz: t.cz };
      });
    };
    const neckTop = 1.392;
    const top = [{ y: neckTop, rx: .068 + E, rz: .062 + E, cz: 0 }, ...torsoRingsTo(bodiceEnd)];
    const bodiceGeo = loft(top);
    const nd = { round: .065, v: .17, sweetheart: .1, boat: .035, square: .12, mandarin: 0 }[L.neck] || .065;
    const bodiceMat = fabric({ bodice: 1, neck: NECK[L.neck] ?? 0, neckTop, pearlTop: neckTop - nd - .02, pearlBottom: Math.max(bodiceEnd, .95) + .02,
      hem: L.sil === "kurta" ? 1 : 0, len: bodiceGeo.total, slit: L.sil === "kurta" ? 1 : 0, alpha: 1 - sheer * .3 });
    let skirtGeo = null;
    let skirtR = () => 0;

    if (L.sil === "kurta") {
      [1, -1].forEach((s) => add(loft(mirrorRings([[.9, .075, .1], [.6, .088, .11], [.3, .094, .122], [.04, .1, .135]].map(([y, cx, r]) => ({ y, cx, cz: 0, rx: r, rz: r * .92 })), s), { seg: 28 }),
        { kind: 2, color: hexRgb(L.col).map((c, i) => Math.min(1, c * (0.5 < (col[0] + col[1] + col[2]) / 3 ? .82 : 1.55))), accent: acc, tex: fx.tex, sheen: fx.sheen * .6, power: fx.power, alpha: 1, emb: [0, 0, 0, 0, 0, 0] }));
      skirtR = (y) => (y < KURTA_HEM[len] + .02 ? .14 : .19);
    } else {
      const y1 = HEM[len], N = 30;
      const w0 = torsoAt(waist);
      const span = waist - y1;
      const hw = { aline: .16 + span * .28, anarkali: .17 + span * .42, lehenga: .2 + span * .45, saree: .19 + span * .06, sheath: .15 }[L.sil];
      const pw = { aline: 1.05, anarkali: .82, lehenga: .72, saree: 1.2, sheath: 1 }[L.sil];
      const rings = [];
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), y = waist + .012 - (span + .012) * t;
        const tb = y > .86 ? torsoAt(y) : { rx: .172, rz: .118, cz: -.018 };
        let rx = L.sil === "sheath"
          ? (y > .9 ? tb.rx + E : lerp(.172 + E, .15, Math.min(1, (.9 - y) / Math.max(.05, .9 - y1))))
          : lerp(w0.rx + E + .004, hw, Math.pow(t, pw));
        rx = Math.max(rx, tb.rx + E + .004, legOuterAt(y) + E + .004);   // never cut into hips or thighs
        const rz = Math.max(rx * (L.sil === "sheath" ? .72 : .9), tb.rz + E + .004);
        rings.push({ y, rx, rz, cz: y > .86 ? tb.cz : -.018 });
      }
      const folds = { aline: [9, .055], anarkali: [24, .03], lehenga: [14, .065], saree: [26, .012], sheath: [0, 0] }[L.sil];
      skirtGeo = loft(rings, {
        seg: 96,
        ripple: (th, t) => {
          if (!folds[0]) return 0;
          const amp = folds[1] * drape * Math.pow(t, 1.5);
          if (L.sil === "saree") return amp * Math.max(0, Math.cos(th)) * Math.sin(folds[0] * th);
          return amp * Math.sin(folds[0] * th) + amp * .35 * Math.sin(folds[0] * .5 * th + 1.3);
        },
      });
      skirtR = (y) => { const r = rings.find((q) => q.y <= y) || rings[rings.length - 1]; return y > waist ? 0 : r.rx * (1 + folds[1] * drape); };
      const pocketX = L.pockets && ["aline", "sheath", "anarkali"].includes(L.sil) ? 2 * Math.PI * w0.rx * .2 : 0;
      // lehenga / saree: a deep contrast border drawn by the shader, so it follows every fold
      add(skirtGeo, fabric({ hem: 1, len: skirtGeo.total, alpha: 1 - sheer * .22, pocket: pocketX, border: L.sil === "lehenga" ? .14 : L.sil === "saree" ? .055 : 0 }));
      if (L.sil === "lehenga") add(loft([{ y: waist + .02, rx: w0.rx + E + .006, rz: w0.rz + E + .006 }, { y: waist - .012, rx: w0.rx + E + .008, rz: w0.rz + E + .008 }]), { kind: 3, color: acc });
    }
    add(bodiceGeo, bodiceMat);

    /* sleeves */
    const end = SLEEVE_END[L.slv];
    if (end) [1, -1].forEach((side) => {
      const ys = []; for (let y = 1.342; y > end; y -= .02) ys.push(y); ys.push(end);
      const n = ys.length;
      const rings = ys.map((y, i) => {
        const a = armAt(y), t = i / (n - 1);
        const flare = L.slv === "bell" ? 1 + 1.4 * Math.pow(Math.max(0, (t - .55) / .45), 2) : L.slv === "cap" ? 1 + .25 * t : 1;
        const r = (a.r + .013) * flare + (y > 1.3 ? (y - 1.3) * .22 : 0);   // follows the shoulder, no pads
        return { y, cx: a.cx * side, cz: a.cz, rx: r, rz: r };
      });
      const g = loft(rings, { seg: 28 });
      add(g, fabric({ hem: 1, len: g.total, alpha: 1 - sheer * 1.25, cuff: 1 }));
    });

    /* belt + collar */
    if (L.belt && ["aline", "sheath", "kurta", "anarkali"].includes(L.sil)) {
      const t = torsoAt(waist);
      add(loft([{ y: waist + .02, rx: t.rx + E + .007, rz: t.rz + E + .007 }, { y: waist - .02, rx: t.rx + E + .009, rz: t.rz + E + .009 }], { seg: 48 }), { kind: 3, color: acc });
    }
    if (L.neck === "mandarin" && !crop) add(loft([{ y: 1.43, rx: .053, rz: .051, cz: -.003 }, { y: 1.385, rx: .061, rz: .058, cz: -.002 }], { seg: 36 }), fabric({ hem: 0, len: .05 }));

    /* saree pallu / dupatta: strips of cloth that clear the skirt */
    const clear = (p) => {
      const r = skirtR(p[1]);
      if (r && p[1] < waist) {
        const d = Math.hypot(p[0], p[2] * 1.1);
        if (d < r + .03) { const k = (r + .03) / (d || 1); return [p[0] * k, p[1], p[2] * k]; }
      }
      return p;
    };
    const strip = (ctrl, w, alpha) => { const g = ribbon(spline(ctrl.map(clear), 8).map(clear), w); add(g, fabric({ hem: 1, len: g.total, alpha, ribbon: 1, color: shade(L.col, .08) })); };
    if (L.sil === "saree") {
      strip([[-.15, 1.372, .035], [-.075, 1.28, .128], [.02, 1.18, .142], [.1, 1.08, .128], [.16, 1.0, .09], [.19, .95, .03]], .17, 1 - sheer * .6);
      strip([[-.15, 1.378, 0], [-.17, 1.3, -.095], [-.19, 1.1, -.135], [-.2, .85, -.155], [-.2, .6, -.16]], .21, 1 - sheer * .6);
    } else if (L.dup === "draped") {
      strip([[-.15, 1.372, .035], [-.075, 1.28, .13], [.02, 1.18, .145], [.12, 1.06, .13], [.2, .95, .08], [.25, .75, .07], [.28, .5, .06], [.29, .32, .05]], .18, .62 - sheer * .2);
      strip([[-.15, 1.378, 0], [-.18, 1.22, -.12], [-.2, .95, -.15], [-.21, .6, -.15]], .2, .62 - sheer * .2);
    } else if (L.dup === "shoulder") {
      strip([[-.16, 1.375, .045], [-.2, 1.26, .1], [-.23, 1.02, .112], [-.25, .72, .1], [-.26, .46, .09]], .18, .66 - sheer * .2);
      strip([[-.16, 1.378, -.01], [-.2, 1.26, -.1], [-.23, 1.0, -.12], [-.25, .66, -.11]], .18, .66 - sheer * .2);
    }
    return out;
  }

  /* ------------------------------------------------------------------ shaders */
  const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec4 aUv;
uniform mat4 uProj, uView; uniform float uYaw;
out vec3 vWorld; out vec3 vNor; out vec4 vUv; out vec3 vLocal;
void main(){
  float c = cos(uYaw), s = sin(uYaw);
  mat3 R = mat3(c, 0., -s, 0., 1., 0., s, 0., c);
  vec3 p = R * aPos;
  vWorld = p; vLocal = aPos; vNor = R * aNor; vUv = aUv;
  gl_Position = uProj * uView * vec4(p, 1.);
}`;
  const FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNor; in vec4 vUv; in vec3 vLocal;
uniform vec3 uCam, uColor, uAccent;
uniform int uKind, uTex, uNeck;
uniform float uSheen, uPower, uAlpha, uSpec, uNeckTop, uPearlTop, uPearlBottom, uHem, uLen, uSlit, uPocket, uBodice, uFlat, uBorder, uFace, uLock;
uniform float uEmb[6];
out vec4 frag;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float neckDepth(float a){
  float aa = abs(a), back = abs(aa - 3.14159), d = 0.;
  if (uNeck == 0) { if (aa < .95) d = .065 * sqrt(1. - pow(aa / .95, 2.)); }
  else if (uNeck == 1) { if (aa < .8) d = .17 * (1. - aa / .8); }
  else if (uNeck == 2) { if (aa < 1.15) { float s = aa / 1.15; d = .13 * sqrt(1. - s * s) * (.7 + .3 * abs(sin(s * 3.14159))); } }
  else if (uNeck == 3) { if (aa < 1.5) d = .035 * sqrt(1. - pow(aa / 1.5, 2.)); }
  else if (uNeck == 4) { if (aa < .72) d = .12; }
  if (uNeck != 5 && back < .9) d = max(d, .05 * sqrt(1. - pow(back / .9, 2.)));
  return d;
}
void main(){
  vec3 N = normalize(vNor), V = normalize(uCam - vWorld);
  if (dot(N, V) < 0.) N = -N;                       // two-sided cloth
  float uN = vUv.x, vN = vUv.y, uM = vUv.z, vM = vUv.w;
  vec3 alb = uColor; float spec = uSpec, power = 14., rim = .1, alpha = 1., metal = 0.;

  if (uKind == 4) {                                  // contact shadow on the podium
    frag = vec4(0., 0., 0., .5 * pow(1. - vN, 2.2)); return;
  }
  if (uKind == 1) {                                  // hair: centre-parted hairline swept back from the face
    float aa = abs((uN - .5) * 6.28318);
    float hl = aa < 1.15 ? 1.592 + .054 * pow(cos(aa / 1.15 * 1.5708), .8) : (aa < 2.1 ? 1.588 : -1.);   // forehead, then over the ears
    if (vLocal.y < hl) discard;
    if (aa < .05 && vLocal.y > 1.64) alb *= .55;     // the parting
    float st = .5 + .5 * sin(uM * 520. + sin(vM * 60.) * 1.5); alb *= .74 + .3 * st; spec = .025 + .035 * st; power = 60.; rim = .03;
  }
  if (uKind == 6) {                                  // long wavy hair: strands, soft shine, uneven ends
    float aa = abs((uN - .5) * 6.28318), y = vLocal.y;
    float cut = (y > 1.40 ? 1.75 : 2.) + .12 * sin(vM * 38. + uN * 9.) + .1 * (hash(vec2(floor(vM * 90.), 7.)) - .5);
    if (uLock < .5 && aa < cut) discard;             // the long hair falls behind the ears and shoulders
    if (uLock < .5) alpha = smoothstep(cut, cut + .16, aa) * smoothstep(0., .07, vN);   // soft strand edges
    if (vN > .88 + .12 * hash(vec2(floor(uN * (uLock > .5 ? 9. : 70.)), 3.))) discard;
    if (uLock > .5) alpha = 1. - pow(abs(uN - .5) * 2., 2.5);   // strands thin out at their edges
    float strand = .5 + .5 * sin(uM * 1400. + sin(vM * 22.) * 2.6);
    alb *= .72 + .32 * strand;
    alb = mix(alb, alb * 1.35, .18 * smoothstep(.3, 1., sin(vM * 9. + uN * 40.)));   // soft wave highlights
    spec = .06 + .08 * strand; power = 48.; rim = .05;
  }
  if (uKind == 0 && uFace > .5) {                    // faceless mannequin: the sculpted shape carries the face,
    float a = (uN - .5) * 6.28318, y = vLocal.y;     // skin only gets a little warmth - no painted features
    float cheek = exp(-pow((abs(a) - .62) / .22, 2.) - pow((y - 1.556) / .02, 2.));
    alb = mix(alb, alb * vec3(1.07, .9, .9), .32 * cheek);
    float lip = exp(-pow(a / .19, 2.) - pow((y - 1.514) / .0065, 2.));
    alb = mix(alb, alb * vec3(1.03, .82, .82), .28 * lip);
  }
  if (uKind == 0) { spec = max(spec, .07); power = 14.; rim = .16; }
  if (uKind == 3) { metal = 1.; alb = uColor; }
  if (uKind == 2) {
    alpha = uAlpha; spec = uSheen * .7; power = uPower; rim = uSheen * .55 + .08;
    if (uBodice > .5) {
      float edge = (uNeckTop - neckDepth((uN - .5) * 6.28318)) - vLocal.y;
      if (edge < 0.) discard;
      if (uEmb[1] > .5 && edge < .008) metal = 1.;
    }
    float hd = uLen - vM;                            // metres up from the hem
    if (uSlit > .5 && (abs(uN - .25) < .004 || abs(uN - .75) < .004) && hd < .2) discard;
    /* weave */
    float m = 1.;
    if (uTex == 1) m = 1. - .08 * abs(sin(uM * 760.) * sin(vM * 760.));
    else if (uTex == 2) m = 1. - .11 * step(.83, hash(vec2(floor(vM * 260.), floor(uM * 16.)))) + .03 * sin(vM * 1500.);
    else if (uTex == 3) { m = .8 + .3 * smoothstep(.25, .6, fract((uM + vM) * 190.)); alb = mix(alb, alb * 1.35, .18 * hash(floor(vec2(uM * 6., vM * 40.)))); }
    else if (uTex == 4) m = .93 + .1 * hash(floor(vec2(uM, vM) * 430.));
    else if (uTex == 5) m = .94 + .06 * sin(vM * 520. + 2.5 * sin(uM * 160.));
    else if (uTex == 6) m = .97 + .03 * sin(uM * 55.);
    else if (uTex == 7) { if (hash(floor(vec2(uM, vM) * 300.)) > .984) metal = 5.; }
    else if (uTex == 8) { vec2 f = fract(vec2(uM, vM) / .05) - .5; if (length(f) < .06 + .06 * abs(cos(atan(f.y, f.x) * 2.))) metal = 1.; }
    else if (uTex == 9) { vec2 f = fract(vec2(uM, vM) / .06) - .5; float r = length(f), petal = .16 + .12 * abs(cos(atan(f.y, f.x) * 2.));
      if (abs(r - petal) < .028 || r < .035) alb = mix(alb, vec3(1., .99, .96), .85); }
    alb *= m;
    if (uBorder > 0. && hd < uBorder) { alb *= .52; if (abs(hd - uBorder + .007) < .0045) metal = 1.; }
    /* handwork */
    if (uHem > .5) {
      if (uEmb[0] > .5 && hd > .012 && hd < .058) { metal = 1.; if (fract(uM * 70.) < .5) alb *= 1.; }
      if (uEmb[1] > .5 && (abs(hd - .075) < .0035 || abs(hd - .098) < .0035)) metal = 1.;
      if (uEmb[2] > .5 && length(vec2(fract(uM / .045) - .5, (hd - .135) / .045)) < .26) metal = 2.;
    }
    if (uEmb[3] > .5) { vec2 g = vec2(uM, vM) / .02; if (hash(floor(g)) > .8 && length(fract(g) - .5) < .22) metal = 3.; }
    if (uEmb[4] > .5) { vec2 f = fract(vec2(uM, vM) / .075) - .5; float r = length(f);
      if (r > .04 && r < .3 * abs(cos(atan(f.y, f.x) * 2.)) + .05) alb = mix(alb, uAccent, .65); }
    if (uEmb[5] > .5 && uBodice > .5 && vLocal.y < uPearlTop && vLocal.y > uPearlBottom && length(vec2(uM / .04, fract(vLocal.y / .04) - .5)) < .22) metal = 4.;
    if (uPocket > 0. && abs(abs(uM) - uPocket) < .003 && vM > .07 && vM < .17) alb *= .5;
    if (metal == 1.) alb = uAccent * (.9 + .15 * sin(uM * 400.));
    else if (metal == 2.) alb = vec3(.86, .88, .93);
    else if (metal == 3.) alb = mix(uAccent, vec3(1.), .35);
    else if (metal == 4.) alb = vec3(.97, .95, .9);
    else if (metal == 5.) alb = vec3(1.);
  }
  if (metal > 0.) { spec = metal == 2. ? 1.6 : metal == 5. ? 2.4 : metal == 4. ? .7 : 1.1; power = metal == 2. ? 140. : metal == 5. ? 160. : metal == 4. ? 30. : 50.; rim = .25; alpha = 1.; }
  if (uFlat > .5) { spec = .1; power = 10.; }

  vec3 a = pow(alb, vec3(2.2));
  vec3 L1 = normalize(vec3(-.45, .75, .9)), L2 = normalize(vec3(.7, .35, -.8)), L3 = normalize(vec3(.65, .2, .8));
  vec3 amb = mix(vec3(.1, .085, .075), vec3(.24, .21, .19), N.y * .5 + .5);
  vec3 col = a * (amb + max(dot(N, L1), 0.) * vec3(1., .95, .88) * 1.05 + max(dot(N, L3), 0.) * vec3(.55, .5, .48) * .45)
           + a * max(dot(N, L2), 0.) * vec3(1., .82, .55) * .4;
  float s = pow(max(dot(N, normalize(L1 + V)), 0.), power) + .5 * pow(max(dot(N, normalize(L3 + V)), 0.), power);
  vec3 tint = metal > 0. && metal != 2. && metal != 5. ? a * 1.7 + .15 : vec3(1., .96, .88);
  col += tint * s * spec;
  float fr = pow(1. - max(dot(N, V), 0.), 3.);
  col += fr * rim * mix(vec3(1., .84, .58), a * 2., .5);
  col = col / (col + vec3(.8)) * 1.55;
  if (uKind == 2 && alpha < 1.) alpha = mix(alpha, 1., fr * .6);   // sheer cloth looks denser at the folds
  frag = vec4(pow(col, vec3(1. / 2.2)), alpha);
}`;

  /* ------------------------------------------------------------------ renderer */
  function mount(container, opts = {}) {
    const canvas = document.createElement("canvas");
    canvas.className = "lb-3d";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Your avatar in 3D. Drag to turn.");
    container.appendChild(canvas);
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) { canvas.remove(); return null; }

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, "aPos"); gl.bindAttribLocation(prog, 1, "aNor"); gl.bindAttribLocation(prog, 2, "aUv");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const U = {}; const u = (n) => (U[n] ??= gl.getUniformLocation(prog, n));

    let meshes = [], yaw = 0, vel = 0, dragging = false, lastX = 0, idleAt = performance.now(), flip = null, wobble = 0, raf = 0, alive = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cam = [0, .95, 3.4];

    function upload(geo) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const bufs = [[geo.pos, 3], [geo.nor, 3], [geo.uv, 4]].map(([data, size], loc) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return b;
      });
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, bufs: [...bufs, ib], count: geo.idx.length };
    }
    function free() { meshes.forEach((m) => { gl.deleteVertexArray(m.vao); m.bufs.forEach((b) => gl.deleteBuffer(b)); }); meshes = []; }

    function setLook(L, cfg) {
      free();
      meshes = build(L, cfg).map(({ geo, mat }) => ({ ...upload(geo), mat, shadow: !!geo.shadow }));
      wobble = .16;
    }

    function resize() {
      const r = container.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    }
    const ro = new ResizeObserver(resize); ro.observe(container); resize();

    function draw(t) {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      if (flip) { const k = Math.min(1, (t - flip.t0) / 700), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; yaw = lerp(flip.from, flip.to, e); if (k === 1) flip = null; }
      else if (!dragging) { yaw += vel; vel *= .93; }
      wobble *= .92;
      const sway = !reduce && !dragging && !flip && t - idleAt > 3500 ? Math.sin((t - idleAt) / 1700) * .14 : 0;
      const shownYaw = yaw + sway + Math.sin(t / 60) * wobble * .25;
      opts.onView && opts.onView(Math.cos(shownYaw) >= 0 ? "front" : "back");

      const w = canvas.width, h = canvas.height, aspect = w / h;
      const fovy = 34 * Math.PI / 180, th = Math.tan(fovy / 2);
      const D = Math.max(2.0 / (2 * th), 1.3 / (2 * th * aspect));
      cam = [0, .97, D];
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(u("uProj"), false, perspective(fovy, aspect, .1, 20));
      gl.uniformMatrix4fv(u("uView"), false, lookAt(cam, [0, .86, 0], [0, 1, 0]));
      gl.uniform3fv(u("uCam"), cam);
      const pass = (transparent) => meshes.forEach((m) => {
        const M = m.mat, a = M.alpha ?? 1;
        if (m.shadow ? transparent : (a < .99) !== transparent) return;
        gl.uniform1f(u("uYaw"), m.shadow ? 0 : shownYaw);
        gl.uniform1i(u("uKind"), M.kind);
        gl.uniform3fv(u("uColor"), M.color || [0, 0, 0]);
        gl.uniform3fv(u("uAccent"), M.accent || M.color || [0, 0, 0]);
        gl.uniform1i(u("uTex"), M.tex || 0);
        gl.uniform1i(u("uNeck"), M.neck ?? 0);
        gl.uniform1f(u("uSheen"), M.sheen ?? .1); gl.uniform1f(u("uPower"), M.power ?? 14);
        gl.uniform1f(u("uAlpha"), a); gl.uniform1f(u("uSpec"), M.spec ?? .05);
        gl.uniform1f(u("uNeckTop"), M.neckTop ?? 9); gl.uniform1f(u("uPearlTop"), M.pearlTop ?? 0); gl.uniform1f(u("uPearlBottom"), M.pearlBottom ?? 0);
        gl.uniform1f(u("uHem"), M.hem ?? 0); gl.uniform1f(u("uLen"), M.len ?? 1); gl.uniform1f(u("uSlit"), M.slit ?? 0);
        gl.uniform1f(u("uPocket"), M.pocket ?? 0); gl.uniform1f(u("uBodice"), M.bodice ?? 0); gl.uniform1f(u("uFlat"), M.flat ?? 0);
        gl.uniform1f(u("uBorder"), M.border ?? 0); gl.uniform1f(u("uFace"), M.face ?? 0); gl.uniform1f(u("uLock"), M.lock ?? 0);
        gl.uniform1fv(u("uEmb[0]"), M.emb || [0, 0, 0, 0, 0, 0]);
        gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
      });
      gl.depthMask(true); pass(false);
      gl.depthMask(false); pass(true); gl.depthMask(true);
    }
    raf = requestAnimationFrame(draw);

    const down = (e) => { dragging = true; lastX = e.clientX; vel = 0; flip = null; try { canvas.setPointerCapture(e.pointerId); } catch { /* capture is optional */ } };
    const move = (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw += dx * .012; vel = dx * .012; };
    const up = () => { dragging = false; idleAt = performance.now(); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); alive = false; opts.onFail && opts.onFail(); });

    return {
      setLook,
      flip() { flip = { from: yaw, to: (Math.round(yaw / Math.PI) + 1) * Math.PI, t0: performance.now() }; idleAt = performance.now(); }, // turn to the other side
      destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); free(); canvas.remove(); },
    };
  }

  return { supported, mount };
})();
