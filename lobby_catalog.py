"""
Design Lobby catalogue: the building blocks customers combine on their avatar.

Labels, descriptions and stats live here. Prices and on/off switches can be
overridden from Admin > Lobby (stored in the `lobby` setting), so the atelier
controls what is offered and what it costs without touching code.
"""

# stats are 1-5: comfort, drape, stretch, breathability, formality
FABRICS = [
    {"key": "cotton", "label": "Cotton", "rate": 280, "gsm": "120-140", "luxury": 1, "tag": "Everyday",
     "care": "Machine wash cold", "desc": "Soft, breathable and honest. The fabric you forget you're wearing.",
     "stats": {"comfort": 5, "drape": 2, "stretch": 1, "breathability": 5, "formality": 2},
     "best": ["kurta", "aline"]},
    {"key": "linen", "label": "Linen", "rate": 650, "gsm": "150-180", "luxury": 2, "tag": "Breathable",
     "care": "Hand wash, iron damp", "desc": "Crisp with a natural slub. Gets softer, and more yours, with every wear.",
     "stats": {"comfort": 4, "drape": 2, "stretch": 1, "breathability": 5, "formality": 3},
     "best": ["kurta", "aline", "sheath"]},
    {"key": "denim", "label": "Denim", "rate": 420, "gsm": "280-340", "luxury": 1, "tag": "Street",
     "care": "Wash inside out", "desc": "Structured twill with attitude. Unexpected, and very hard to forget.",
     "stats": {"comfort": 3, "drape": 1, "stretch": 2, "breathability": 3, "formality": 1},
     "best": ["aline", "sheath", "kurta"]},
    {"key": "rayon", "label": "Rayon", "rate": 240, "gsm": "110-130", "luxury": 1, "tag": "Fluid",
     "care": "Gentle hand wash", "desc": "Cool to touch with a liquid fall. Silk-like movement for every day.",
     "stats": {"comfort": 5, "drape": 4, "stretch": 2, "breathability": 4, "formality": 2},
     "best": ["kurta", "anarkali", "aline"]},
    {"key": "crepe", "label": "Crepe", "rate": 380, "gsm": "150-180", "luxury": 2, "tag": "Tailored",
     "care": "Dry clean recommended", "desc": "A fine pebbled surface that holds a clean, sculpted line.",
     "stats": {"comfort": 4, "drape": 4, "stretch": 3, "breathability": 3, "formality": 4},
     "best": ["sheath", "aline", "anarkali"]},
    {"key": "georgette", "label": "Georgette", "rate": 350, "gsm": "90-110", "luxury": 2, "tag": "Flowy",
     "care": "Dry clean recommended", "desc": "Lightly crinkled and airy. Made for twirls and long evenings.",
     "stats": {"comfort": 4, "drape": 5, "stretch": 2, "breathability": 4, "formality": 4},
     "best": ["anarkali", "saree", "lehenga"]},
    {"key": "chiffon", "label": "Chiffon", "rate": 320, "gsm": "40-60", "luxury": 2, "tag": "Sheer",
     "care": "Dry clean only", "desc": "Whisper-light and sheer. Floats behind you as you walk.",
     "stats": {"comfort": 4, "drape": 5, "stretch": 1, "breathability": 5, "formality": 4},
     "best": ["saree", "anarkali"]},
    {"key": "chanderi", "label": "Chanderi", "rate": 900, "gsm": "60-80", "luxury": 3, "tag": "Handloom",
     "care": "Dry clean only", "desc": "Handwoven in Madhya Pradesh. A sheer silk-cotton with tiny woven gold buttis.",
     "stats": {"comfort": 4, "drape": 3, "stretch": 1, "breathability": 5, "formality": 4},
     "best": ["kurta", "anarkali", "saree"]},
    {"key": "chikankari", "label": "Chikankari", "rate": 1100, "gsm": "90-110", "luxury": 3, "tag": "Handcrafted",
     "care": "Gentle hand wash", "desc": "Lucknow's white-on-fabric hand embroidery. Hundreds of tiny shadow stitches.",
     "stats": {"comfort": 5, "drape": 3, "stretch": 1, "breathability": 5, "formality": 3},
     "best": ["kurta", "anarkali", "aline"]},
    {"key": "silk", "label": "Silk", "rate": 1800, "gsm": "80-100", "luxury": 3, "tag": "Heirloom",
     "care": "Dry clean only", "desc": "Pure mulberry silk with a deep, living lustre. The fabric of heirlooms.",
     "stats": {"comfort": 4, "drape": 4, "stretch": 1, "breathability": 3, "formality": 5},
     "best": ["saree", "lehenga", "anarkali", "aline"]},
    {"key": "satin_silk", "label": "Satin Silk", "rate": 950, "gsm": "90-120", "luxury": 2, "tag": "Glossy",
     "care": "Dry clean only", "desc": "A mirror-smooth face that catches every light in the room.",
     "stats": {"comfort": 3, "drape": 4, "stretch": 1, "breathability": 2, "formality": 5},
     "best": ["sheath", "aline", "saree"]},
    {"key": "space_silk", "label": "Space Silk", "rate": 520, "gsm": "70-90", "luxury": 1, "tag": "Shimmer",
     "care": "Gentle hand wash", "desc": "Lightweight with a soft shimmer. Party-ready, without the weight.",
     "stats": {"comfort": 4, "drape": 4, "stretch": 1, "breathability": 3, "formality": 3},
     "best": ["saree", "lehenga", "anarkali"]},
]

SILHOUETTES = [
    {"key": "anarkali", "label": "Anarkali", "base": 2500, "meters": 4.5, "days": 10,
     "desc": "A fitted yoke that blooms into a full, twirling flare."},
    {"key": "aline", "label": "A-line Gown", "base": 1800, "meters": 3.0, "days": 7,
     "desc": "Fitted at the waist, gently flaring to the hem. Flatters everyone."},
    {"key": "sheath", "label": "Sheath Dress", "base": 2200, "meters": 2.2, "days": 7,
     "desc": "A sculpted column that follows your line."},
    {"key": "kurta", "label": "Kurta Set", "base": 1500, "meters": 4.0, "days": 6,
     "desc": "A straight kurta with side slits over tonal palazzos."},
    {"key": "lehenga", "label": "Lehenga", "base": 4500, "meters": 6.0, "days": 20,
     "desc": "A cropped blouse with a sweeping, voluminous skirt."},
    {"key": "saree", "label": "Pre-draped Saree", "base": 1200, "meters": 6.3, "days": 9,
     "desc": "Pleats and pallu stitched in place, on in under a minute."},
]

NECKLINES = [
    {"key": "round", "label": "Round"}, {"key": "v", "label": "V-neck"},
    {"key": "sweetheart", "label": "Sweetheart"}, {"key": "boat", "label": "Boat"},
    {"key": "square", "label": "Square"}, {"key": "mandarin", "label": "Mandarin collar"},
]

SLEEVES = [
    {"key": "none", "label": "Sleeveless", "meters": 0}, {"key": "cap", "label": "Cap", "meters": 0.1},
    {"key": "elbow", "label": "Elbow", "meters": 0.25}, {"key": "three", "label": "Three-quarter", "meters": 0.35},
    {"key": "full", "label": "Full", "meters": 0.45}, {"key": "bell", "label": "Bell", "meters": 0.6},
]

LENGTHS = [
    {"key": "knee", "label": "Knee", "factor": 0.75}, {"key": "midi", "label": "Midi", "factor": 0.88},
    {"key": "ankle", "label": "Ankle", "factor": 1.0}, {"key": "floor", "label": "Floor", "factor": 1.08},
]

EMBELLISHMENTS = [
    {"key": "gota", "label": "Gota border", "price": 1200, "days": 3,
     "desc": "Shimmering gota-patti ribbon hand-applied along the hem."},
    {"key": "zari", "label": "Zari lines", "price": 2400, "days": 4,
     "desc": "Fine metallic zari threadwork tracing the hem, neckline and cuffs."},
    {"key": "mirror", "label": "Mirror work", "price": 1800, "days": 5,
     "desc": "Hand-stitched shisha mirrors that throw light as you move."},
    {"key": "sequins", "label": "Sequin scatter", "price": 2200, "days": 5,
     "desc": "A starry scatter of hand-sewn sequins across the body."},
    {"key": "block", "label": "Hand-block print", "price": 900, "days": 3,
     "desc": "Wooden-block printed motifs, stamped by hand in your trim colour."},
    {"key": "pearls", "label": "Pearl buttons", "price": 600, "days": 1,
     "desc": "A column of pearl buttons down the front placket."},
]

EXTRAS = {"dupatta_meters": 2.25, "belt": 500, "lining": 800, "pockets": 300}

COLORS = [  # curated main colours (customers may also pick any custom colour)
    ("Ivory", "#f1e7d6"), ("Champagne", "#d9b67a"), ("Blush", "#e8b8b0"), ("Rani Pink", "#b0245a"),
    ("Sindoor", "#9b1c22"), ("Wine", "#5a1730"), ("Saffron", "#d08a2a"), ("Mustard", "#c9a227"),
    ("Sage", "#8fa383"), ("Emerald", "#0f5a44"), ("Teal", "#1f6f73"), ("Powder Blue", "#a9c2d8"),
    ("Indigo", "#2b3a67"), ("Midnight", "#1c2238"), ("Lilac", "#b4a0c8"), ("Mocha", "#7a5640"),
    ("Onyx", "#17130f"), ("Pearl Grey", "#c8c4bd"),
]
ACCENTS = [("Antique Gold", "#c9a05a"), ("Silver", "#c3c4cc"), ("Copper", "#b06a3b"),
           ("Rose Gold", "#c98f7d"), ("Ivory", "#f3ead8"), ("Onyx", "#1a1612")]
SKINS = ["#f3d7c0", "#e4b994", "#c98e66", "#a86d47", "#7c4d32", "#4f3020", "mannequin"]
DUPATTAS = ["none", "draped", "shoulder"]

LOOK_STATUSES = ("new", "contacted", "quoted", "in_making", "delivered", "closed")


def effective_length(sil, length):
    """Some silhouettes are only cut long: a saree is always floor length, a lehenga at least ankle."""
    if sil == "saree":
        return "floor"
    if sil == "lehenga" and length in ("knee", "midi"):
        return "ankle"
    return length
