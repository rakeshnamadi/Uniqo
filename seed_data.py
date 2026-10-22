"""
Sample showroom content for a fresh Uniqo install.

Generates stylised mannequin illustrations (SVG) for each design/colourway so the
showroom looks complete before real photography is uploaded from the admin panel.
"""
import os

MANNEQUIN = "#1b1714"


def _shade(hex_color, f):
    """Lighten (f>0) or darken (f<0) a #rrggbb colour."""
    h = hex_color.lstrip("#")
    rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    if f >= 0:
        rgb = [round(c + (255 - c) * f) for c in rgb]
    else:
        rgb = [round(c * (1 + f)) for c in rgb]
    return "#" + "".join(f"{c:02x}" for c in rgb)


def _garment(kind, main, second, accent):
    """Return a list of (path, fill, trim) tuples drawn over the mannequin."""
    mirror = lambda d: d  # paths are written explicitly for both sides
    if kind == "gown":
        return [
            ("M248 318 L352 318 Q392 470 440 704 Q300 726 160 704 Q208 470 248 318 Z", main, True),
            ("M214 160 Q256 150 280 170 Q300 196 320 170 Q344 150 386 160 L372 236 Q362 282 352 318 L248 318 Q238 282 228 236 Z", main, True),
            ("M246 304 L354 304 L353 326 L247 326 Z", second, True),
        ], [
            "M300 330 Q296 520 292 712", "M276 330 Q252 520 222 706", "M324 330 Q350 520 380 706",
        ], ("M172 686 Q300 706 428 686",)
    if kind == "anarkali":
        kalis = [f"M{300 + k * 11} 262 L{300 + k * 40} {712 + abs(k) * -2}" for k in range(-5, 6)]
        return [
            ("M232 262 L368 262 Q470 480 520 706 Q300 742 80 706 Q130 480 232 262 Z", main, True),
            ("M80 706 Q300 742 520 706 L514 680 Q300 716 86 680 Z", second, True),
            ("M216 160 L190 176 L172 300 L198 304 L226 204 Z", main, True),
            ("M384 160 L410 176 L428 300 L402 304 L374 204 Z", main, True),
            ("M216 160 Q258 150 300 184 Q342 150 384 160 L366 250 L234 250 Z", main, True),
            ("M232 244 L368 244 L370 264 L230 264 Z", accent, False),
        ], kalis, ("M96 664 Q300 698 504 664",)
    if kind == "lehenga":
        return [
            ("M244 310 L356 310 Q440 470 500 708 Q300 744 100 708 Q160 470 244 310 Z", main, True),
            ("M100 708 Q300 744 500 708 L490 668 Q300 704 110 668 Z", second, True),
            ("M130 586 Q300 616 470 586 L466 572 Q300 602 134 572 Z", accent, False),
            ("M242 298 L358 298 L358 318 L242 318 Z", accent, False),
            ("M220 160 Q260 152 300 186 Q340 152 380 160 L370 262 Q300 274 230 262 Z", second, True),
            ("M232 166 L262 158 Q342 300 424 420 L444 640 L406 652 L394 444 Q302 320 232 166 Z", _shade(main, 0.35), True),
        ], [
            "M300 322 Q298 520 296 716", "M270 322 Q240 520 196 712", "M330 322 Q360 520 404 712",
        ], ("M116 640 Q300 672 484 640",)
    if kind == "saree":
        pleats = [f"M{x} 312 L{300 + (x - 300) * 2.2:.0f} 708" for x in range(276, 330, 9)]
        return [
            ("M240 300 L360 300 Q372 500 386 708 Q300 724 214 708 Q228 500 240 300 Z", main, True),
            ("M214 708 Q300 724 386 708 L384 686 Q300 702 216 686 Z", second, True),
            ("M206 168 L228 160 L240 430 L208 452 Z", _shade(main, -0.25), True),
            ("M222 160 Q262 152 300 184 Q340 152 378 160 L372 250 Q300 262 228 250 Z", second, True),
            ("M224 162 L268 154 Q330 262 374 334 L382 392 Q316 366 286 330 Q238 262 224 162 Z", main, True),
        ], pleats, ("M268 158 Q332 264 378 340",)
    if kind == "kurta":
        return [
            ("M222 566 L378 566 L398 716 L308 716 L300 610 L292 716 L202 716 Z", second, True),
            ("M214 160 L188 180 L176 344 L204 348 L226 214 Z", main, True),
            ("M386 160 L412 180 L424 344 L396 348 L374 214 Z", main, True),
            ("M214 160 Q256 152 300 180 Q344 152 386 160 L380 300 Q384 420 394 566 L206 566 Q216 420 220 300 Z", main, True),
            ("M207 566 L393 566 L391 544 L209 544 Z", second, True),
        ], [
            "M300 180 L300 300", "M222 470 L214 566", "M378 470 L386 566",
        ], ("M212 530 L388 530", "M262 168 Q300 200 338 168")
    # bandhgala jacket + trousers
    return [
        ("M232 486 L368 486 L362 716 L312 716 L300 548 L288 716 L238 716 Z", second, True),
        ("M206 162 L182 186 L170 472 L198 476 L216 232 Z", main, True),
        ("M394 162 L418 186 L430 472 L402 476 L384 232 Z", main, True),
        ("M206 162 Q250 150 280 146 L300 162 L320 146 Q350 150 394 162 L388 300 Q390 400 392 488 L300 502 L208 488 Q210 400 212 300 Z", main, True),
        ("M278 128 Q300 138 322 128 L322 146 L300 162 L278 146 Z", main, True),
        ("M336 246 L352 230 L366 246 Z", accent, False),
    ], [
        "M300 162 L300 500", "M332 250 L368 248", "M228 404 L272 404", "M328 404 L372 404",
    ], ("M300 168 L300 498",)


def figure_svg(kind, main, second, accent, detail=False):
    parts, folds, embroidery = _garment(kind, main, second, accent)
    vb = "180 112 240 320" if detail else "0 0 600 800"
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="600" height="800">',
           "<defs>",
           '<radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#fffdf9"/>'
           '<stop offset="1" stop-color="#efe6d6"/></radialGradient>',
           '<linearGradient id="sheen" x1="0" x2="1" y1="0" y2="0">'
           '<stop offset="0" stop-color="#000" stop-opacity=".32"/>'
           '<stop offset=".32" stop-color="#fff" stop-opacity=".14"/>'
           '<stop offset=".55" stop-color="#fff" stop-opacity="0"/>'
           '<stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>',
           f'<linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="{_shade(accent, -0.25)}"/>'
           f'<stop offset=".5" stop-color="{_shade(accent, 0.35)}"/><stop offset="1" stop-color="{_shade(accent, -0.25)}"/></linearGradient>',
           "</defs>",
           '<rect x="-200" y="-200" width="1000" height="1200" fill="url(#bg)"/>',
           '<path d="M140 790 L140 270 A160 160 0 0 1 460 270 L460 790 Z" fill="#e9ddc8" opacity=".55"/>',
           '<ellipse cx="300" cy="772" rx="170" ry="16" fill="#000" opacity=".08"/>',
           '<rect x="295" y="690" width="10" height="72" fill="url(#gold)"/>',
           '<ellipse cx="300" cy="764" rx="72" ry="10" fill="url(#gold)"/>',
           f'<circle cx="300" cy="58" r="10" fill="url(#gold)"/><rect x="292" y="66" width="16" height="10" rx="2" fill="url(#gold)"/>',
           f'<path d="M282 76 L318 76 L322 128 L278 128 Z" fill="{MANNEQUIN}"/>',
           f'<path d="M278 120 Q300 132 322 120 L392 158 Q404 200 380 262 Q366 300 362 330 L238 330 Q234 300 220 262 Q196 200 208 158 Z" fill="{MANNEQUIN}"/>']
    for d, fill, trim in parts:
        out.append(f'<path d="{d}" fill="{fill}"/>')
        out.append(f'<path d="{d}" fill="url(#sheen)"/>')
        if trim:
            out.append(f'<path d="{d}" fill="none" stroke="url(#gold)" stroke-width="2.4" stroke-linejoin="round"/>')
    for d in folds:
        out.append(f'<path d="{d}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="2"/>')
    for d in embroidery:
        out.append(f'<path d="{d}" fill="none" stroke="url(#gold)" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 11"/>')
    out.append("</svg>")
    return "\n".join(out)


SIZES = ["XS", "S", "M", "L", "XL", "XXL"]

DESIGNS = [
    {
        "name": "Noor Drape", "kind": "saree", "category": "Saree", "badge": "Signature",
        "featured": True, "price": 18900, "price_mode": "reveal",
        "tagline": "A pre-draped saree that falls perfectly - in under sixty seconds.",
        "story": "Noor began with a simple question from our atelier: why should a saree take twenty minutes and "
                 "a second pair of hands? We engineered the pleats, stitched the pallu to a hidden shoulder anchor "
                 "and kept the drape fluid enough to move like a classic six-yard. Zip it, pin nothing, and walk out "
                 "looking like you spent the afternoon on it.",
        "occasions": ["Wedding", "Festive", "Reception"],
        "colors": [("Ivory & Onyx", "#efe3cc", "#141110", "#c9a05a", 0),
                   ("Midnight Black", "#17130f", "#c9a05a", "#d4ad66", 0),
                   ("Champagne Gold", "#d9b67a", "#3b2a1a", "#8a5a22", 1500)],
        "addons": [("Hand-zari border", "Real zari hand-laid along the pallu edge by our karigars", 2400),
                   ("Monogram on pallu", "Your initials, embroidered discreetly in gold thread", 900)],
        "mtm": True, "mtm_delta": 1200,
        "specs": {"fabric": "Silk-crepe blend (70% mulberry silk)", "lining": "Satin under-skirt, fully lined",
                  "weight": "92 GSM - light, fluid", "fit": "Pre-pleated, adjustable at the waist",
                  "neckline": "Sweetheart blouse, padded", "sleeve": "Sleeveless blouse (sleeves on request)",
                  "length": "Floor length, 42 in skirt", "closure": "Concealed side zip + shoulder anchor",
                  "embellishment": "Gold-tone woven border, hand-finished", "care": "Dry clean only",
                  "making_days": "12-15 days"},
        "feel": {"comfort": 4, "drape": 5, "stretch": 2, "breathability": 4, "formality": 5},
        "hotspots": [(48, 24, "Engineered pallu anchor", "A hidden loop at the shoulder holds the pallu in place all evening - no safety pins."),
                     (56, 40, "Pre-set pleats", "Seven pleats stitched at 1.5 in intervals so the front always falls straight."),
                     (50, 87, "Woven border", "A 2 in border that adds weight to the hem so the drape hangs cleanly.")],
        "editions": [("Hyderabad", 25), ("Bengaluru", 20), ("Mumbai", 15), ("Delhi", 20), ("Chennai", 12)],
    },
    {
        "name": "Aarohi Anarkali", "kind": "anarkali", "category": "Anarkali", "badge": "New drop",
        "featured": True, "price": 14500, "price_mode": "default",
        "tagline": "Twenty-four kalis that bloom with every turn.",
        "story": "Aarohi means 'rising melody'. The skirt is cut from twenty-four individual panels (kalis) so it "
                 "opens into a near-perfect circle when you twirl, yet stays light enough to dance in for hours. "
                 "The high yoke elongates the torso; the bordered hem keeps the flare controlled.",
        "occasions": ["Sangeet", "Festive", "Mehendi"],
        "colors": [("Royal Emerald", "#0f4d3c", "#c9a05a", "#d6b06a", 0),
                   ("Rani Pink", "#a3224f", "#e8c37a", "#d6b06a", 0),
                   ("Ink Blue", "#1d2a4d", "#c9a05a", "#d6b06a", 800)],
        "addons": [("Matching dupatta", "Organza dupatta with scalloped edging", 2200),
                   ("Churidar", "Fitted churidar in matching tone", 1400)],
        "mtm": True, "mtm_delta": 1000,
        "specs": {"fabric": "Georgette with chanderi yoke", "lining": "Soft cotton lining, full",
                  "weight": "110 GSM - airy", "fit": "Fitted yoke, 24-kali flare",
                  "neckline": "Sweetheart", "sleeve": "Elbow-length, bordered cuff",
                  "length": "Ankle length, 52 in", "closure": "Back hook & concealed zip",
                  "embellishment": "Gota-patti yoke band, zari hem", "care": "Dry clean recommended",
                  "making_days": "10-12 days"},
        "feel": {"comfort": 5, "drape": 4, "stretch": 2, "breathability": 4, "formality": 4},
        "hotspots": [(50, 31, "Gota yoke band", "Hand-applied gota-patti that sits exactly at your high waist."),
                     (50, 62, "24-kali skirt", "Twenty-four panels give the signature circle flare without heavy fabric."),
                     (30, 33, "Bordered sleeve", "Elbow-length sleeve finished with a matching border.")],
        "editions": [("Hyderabad", 20), ("Bengaluru", 18), ("Mumbai", 18), ("Delhi", 15), ("Chennai", 15)],
    },
    {
        "name": "Mehr Lehenga", "kind": "lehenga", "category": "Lehenga", "badge": "Bridal",
        "featured": True, "price": 46000, "price_mode": "request",
        "tagline": "Heirloom-weight craft. A bride's edition of very few.",
        "story": "Mehr is our most limited design. Each lehenga carries over 180 hours of hand embroidery, a "
                 "can-can layer engineered to hold volume without stiffness, and a sheer dupatta draped from the "
                 "shoulder. Only ten pieces exist per city - and each comes with its edition card and a personal "
                 "fitting session.",
        "occasions": ["Wedding", "Reception"],
        "colors": [("Sindoor Red", "#8e1b1f", "#2a1310", "#d4a64f", 0),
                   ("Ivory Blush", "#ead7c3", "#7a2f36", "#c9a05a", 0),
                   ("Wine & Gold", "#4a1426", "#c9a05a", "#d8b46a", 0)],
        "addons": [("Second dupatta", "A heavier head dupatta for the ceremony", 6500),
                   ("Personal fitting", "In-person fitting session at our atelier", 0)],
        "mtm": True, "mtm_delta": 0,
        "specs": {"fabric": "Raw silk skirt, net dupatta", "lining": "Silk lining + soft can-can",
                  "weight": "Heavy - approx. 6.5 kg", "fit": "Structured blouse, flared skirt",
                  "neckline": "Sweetheart with back tie", "sleeve": "Short sleeve",
                  "length": "Floor length, 44 in", "closure": "Drawstring with tassel latkans",
                  "embellishment": "Zardozi, dabka & sequins, 180+ hours", "care": "Professional dry clean only",
                  "making_days": "35-45 days"},
        "feel": {"comfort": 3, "drape": 3, "stretch": 1, "breathability": 2, "formality": 5},
        "hotspots": [(50, 23, "Zardozi blouse", "Dense hand zardozi with a padded, structured fit."),
                     (60, 45, "Sheer dupatta", "Net dupatta pinned at the shoulder, falling to the hip."),
                     (50, 86, "Double border", "Two bands of embroidery weight the hem for a regal fall.")],
        "editions": [("Hyderabad", 10), ("Bengaluru", 8), ("Mumbai", 10), ("Delhi", 10), ("Chennai", 8)],
    },
    {
        "name": "Sutra Kurta Set", "kind": "kurta", "category": "Kurta Set", "badge": "Everyday luxe",
        "featured": False, "price": 6900, "price_mode": "default",
        "tagline": "The kurta you'll reach for every week - just rarer than anyone else's.",
        "story": "Sutra is our study in restraint: a straight, beautifully balanced kurta with a hand-finished "
                 "placket and side slits that move with you, paired with wide palazzos. Breathable cotton-silk keeps "
                 "it office-ready by day and dinner-ready by night.",
        "occasions": ["Workwear", "Casual", "Festive"],
        "colors": [("Saffron Gold", "#c98a2b", "#f3e6cc", "#7a4a18", 0),
                   ("Sage", "#7f9473", "#efe8d8", "#c9a05a", 0),
                   ("Onyx", "#1a1714", "#d9c39b", "#c9a05a", 400)],
        "addons": [("Cotton dupatta", "Lightweight mul dupatta with tassels", 900)],
        "mtm": True, "mtm_delta": 600,
        "specs": {"fabric": "Cotton-silk (60/40)", "lining": "Unlined - breathable",
                  "weight": "140 GSM - mid", "fit": "Straight, relaxed shoulder",
                  "neckline": "Round neck with placket", "sleeve": "Three-quarter",
                  "length": "Kurta 44 in, palazzo 38 in", "closure": "Button placket, elastic palazzo",
                  "embellishment": "Gold-tone buttons, contrast hem band", "care": "Gentle hand wash, cold",
                  "making_days": "6-8 days"},
        "feel": {"comfort": 5, "drape": 3, "stretch": 2, "breathability": 5, "formality": 2},
        "hotspots": [(50, 29, "Hand-finished placket", "Three gold-tone buttons on a clean, pressed placket."),
                     (35, 63, "Side slits", "Deep slits for ease of movement when walking or sitting."),
                     (50, 80, "Wide palazzo", "Contrast palazzo with an easy elasticated waist.")],
        "editions": [("Hyderabad", 40), ("Bengaluru", 40), ("Mumbai", 35), ("Delhi", 35), ("Chennai", 30)],
    },
    {
        "name": "Onyx Column Gown", "kind": "gown", "category": "Gown", "badge": "",
        "featured": True, "price": 21500, "price_mode": "default",
        "tagline": "Evening tailoring with a waist that does the talking.",
        "story": "A clean sweetheart bodice, a contrast belt sitting precisely at the natural waist and a column "
                 "skirt that skims rather than clings. Onyx is designed for cocktail evenings and receptions where "
                 "you want to look sharp, not overdressed.",
        "occasions": ["Cocktail", "Reception", "Party"],
        "colors": [("Onyx & Gold", "#15120f", "#c9a05a", "#d6b06a", 0),
                   ("Cognac", "#8c4a24", "#1a1410", "#d6b06a", 0),
                   ("Pearl", "#efe7da", "#15120f", "#b8873b", 1200)],
        "addons": [("Detachable trail", "A floor-sweeping chiffon trail that buttons at the waist", 3200),
                   ("Leather belt upgrade", "Hand-stitched leather belt with brass buckle", 1800)],
        "mtm": True, "mtm_delta": 1500,
        "specs": {"fabric": "Crepe with 4% elastane", "lining": "Fully lined, satin",
                  "weight": "180 GSM - structured", "fit": "Bodycon bodice, column skirt",
                  "neckline": "Sweetheart", "sleeve": "Sleeveless",
                  "length": "Floor length, 58 in", "closure": "Invisible back zip",
                  "embellishment": "Contrast belt, hand-dotted hem", "care": "Dry clean only",
                  "making_days": "8-10 days"},
        "feel": {"comfort": 4, "drape": 4, "stretch": 3, "breathability": 3, "formality": 4},
        "hotspots": [(50, 24, "Sculpted sweetheart", "Internal boning keeps the neckline crisp without wires."),
                     (50, 39, "Contrast belt", "Positioned at the natural waist to define the silhouette."),
                     (50, 86, "Dotted hem", "Hand-dotted metallic embroidery along the hemline.")],
        "editions": [("Hyderabad", 15), ("Bengaluru", 15), ("Mumbai", 12), ("Delhi", 15), ("Chennai", 10)],
    },
    {
        "name": "Raag Bandhgala", "kind": "bandhgala", "category": "Menswear", "badge": "For him",
        "featured": False, "price": 16800, "price_mode": "default",
        "tagline": "A bandhgala cut like a well-made instrument: precise, balanced, timeless.",
        "story": "Raag is built on a half-canvas construction, the way fine jackets are made, so the chest holds its "
                 "shape and the shoulder sits naturally. A mandarin collar, seven covered buttons and a quiet pocket "
                 "square detail make it equally right at a wedding or a black-tie dinner.",
        "occasions": ["Wedding", "Reception", "Formal"],
        "colors": [("Midnight Navy", "#1c2238", "#141110", "#c9a05a", 0),
                   ("Ivory", "#ece2cf", "#2b241d", "#b8873b", 0),
                   ("Bottle Green", "#173a2c", "#141110", "#c9a05a", 0)],
        "addons": [("Silk pocket square", "Hand-rolled silk square in contrast tone", 700),
                   ("Monogrammed lining", "Your initials embroidered inside the chest", 900)],
        "mtm": True, "mtm_delta": 2000,
        "specs": {"fabric": "Wool-blend suiting (Super 110s)", "lining": "Half-canvas, viscose lining",
                  "weight": "260 GSM - tailored", "fit": "Slim, structured shoulder",
                  "neckline": "Mandarin collar", "sleeve": "Full sleeve",
                  "length": "Jacket 30 in + trousers", "closure": "Seven covered buttons",
                  "embellishment": "Pocket square detail, gold buttons", "care": "Dry clean only",
                  "making_days": "14-18 days"},
        "feel": {"comfort": 3, "drape": 2, "stretch": 2, "breathability": 3, "formality": 5},
        "hotspots": [(50, 17, "Mandarin collar", "A stand collar interfaced to stay upright all evening."),
                     (58, 30, "Pocket square", "A welt chest pocket with contrast silk square."),
                     (50, 45, "Seven-button front", "Covered buttons on a perfectly straight placket.")],
        "editions": [("Hyderabad", 20), ("Bengaluru", 20), ("Mumbai", 15), ("Delhi", 20), ("Chennai", 15)],
    },
]


def build(out_dir):
    """Write illustration SVGs into out_dir and return design payloads for the database."""
    os.makedirs(out_dir, exist_ok=True)
    designs = []
    for spec in DESIGNS:
        slug = spec["name"].lower().replace(" ", "-")
        images, colors = [], []
        for n, (cname, main, second, accent, delta) in enumerate(spec["colors"]):
            full = f"{slug}-{n + 1}.svg"
            with open(os.path.join(out_dir, full), "w", encoding="utf-8") as f:
                f.write(figure_svg(spec["kind"], main, second, accent))
            url = "/uploads/seed/" + full
            images.append(url)
            if n == 0:
                det = f"{slug}-detail.svg"
                with open(os.path.join(out_dir, det), "w", encoding="utf-8") as f:
                    f.write(figure_svg(spec["kind"], main, second, accent, detail=True))
                images.append("/uploads/seed/" + det)
            colors.append({"name": cname, "hex": main, "image": url, "delta": delta})
        designs.append({
            "name": spec["name"], "category": spec["category"], "badge": spec["badge"],
            "tagline": spec["tagline"], "story": spec["story"], "occasions": spec["occasions"],
            "featured": spec["featured"], "price": spec["price"], "price_mode": spec["price_mode"],
            "images": images, "colors": colors, "sizes": SIZES,
            "made_to_measure": spec["mtm"], "mtm_delta": spec["mtm_delta"],
            "addons": [{"name": a, "desc": b, "delta": c} for a, b, c in spec["addons"]],
            "specs": spec["specs"], "feel": spec["feel"],
            "hotspots": [{"x": x, "y": y, "title": t, "text": tx} for x, y, t, tx in spec["hotspots"]],
            "editions": [{"location": l, "limit": n} for l, n in spec["editions"]],
            "status": "active",
        })
    return designs
