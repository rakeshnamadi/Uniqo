#!/usr/bin/env python3
"""
Uniqo - Your Style. Your Rarity.

A self-contained web server for the Uniqo design showroom.
Uses only the Python standard library (3.9+): no pip install required.

    python server.py                 # serves http://localhost:8080
    set UNIQO_PORT=9000              # optional: change port
    set UNIQO_ADMIN_PASSWORD=...     # optional: initial admin password (first run only)
"""
import base64
import csv
import io
import json
import os
import re
import secrets
import hashlib
import hmac
import sqlite3
import sys
import threading
import time
import traceback
from http.cookies import SimpleCookie
import lobby_catalog as LC
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.realpath(os.path.join(ROOT, "public"))
# Everything that must survive a redeploy (database + customer uploads) lives in DATA_DIR,
# so a single persistent volume is enough when hosting.
DATA_DIR = os.path.realpath(os.environ.get("UNIQO_DATA_DIR") or os.path.join(ROOT, "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
DB_PATH = os.path.join(DATA_DIR, "uniqo.db")
HOST = os.environ.get("UNIQO_HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT") or os.environ.get("UNIQO_PORT") or "8080")  # PORT: set by most hosts
TRUST_PROXY = os.environ.get("UNIQO_TRUST_PROXY", "0") == "1"  # behind Nginx/Caddy/Cloudflare/Render
FORCE_SECURE = os.environ.get("UNIQO_SECURE_COOKIES", "0") == "1"

PAGE_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")

MAX_BODY = 14 * 1024 * 1024
MAX_IMAGE = 8 * 1024 * 1024
SESSION_TTL = 12 * 3600

PRICE_MODES = ("visible", "reveal", "request")
SORT_MODES = ("manual", "newest", "price_asc", "price_desc", "scarcity", "popular")
STATUSES = ("active", "draft", "archived")
ORDER_STATUSES = ("new", "confirmed", "in_making", "shipped", "delivered", "cancelled")
REACTIONS = ("love", "like", "meh")
SPEC_KEYS = ("fabric", "lining", "weight", "fit", "neckline", "sleeve", "length",
             "closure", "embellishment", "care", "making_days")
FEEL_KEYS = ("comfort", "drape", "stretch", "breathability", "formality")
MTM = "Made to measure"

DEFAULT_SETTINGS = {
    "hero": {
        "eyebrow": "Your Style. Your Rarity.",
        "title": "Wear a design only a handful will ever own.",
        "subtitle": "Uniqo is a showroom for clothes. Walk the floor, study every seam, "
                    "make it yours, and claim a numbered piece from an edition that is "
                    "strictly limited in your city.",
    },
    "announcement": "Every design is capped per city. When your city's edition sells out, it never returns.",
    "price_mode": "reveal",
    "sort_mode": "manual",
    "allow_customer_sort": True,
    "show_sold_out": True,
    "locations": ["Hyderabad", "Bengaluru", "Mumbai", "Delhi", "Chennai"],
    "default_location": "Hyderabad",
    "low_stock_threshold": 5,
    "currency": "₹",
    "contact": {
        "phone": "+91 00000 00000",
        "whatsapp": "",
        "email": "hello@uniqo.in",
        "instagram": "uniqo.studio",
        "address": "Uniqo Atelier, India",
    },
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS designs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  reveals INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  design_id INTEGER,
  design_name TEXT NOT NULL,
  location TEXT NOT NULL,
  edition_no INTEGER NOT NULL,
  edition_limit INTEGER NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT NOT NULL,
  config TEXT NOT NULL,
  total INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_design ON orders(design_id, location, status);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  design_id INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  reaction TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL,
  UNIQUE(design_id, client_id));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS looks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  look TEXT NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  estimate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL);
-- customer accounts: mobile + PIN, so designs follow the customer to any device
CREATE TABLE IF NOT EXISTS accounts(
  mobile TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_salt TEXT,
  pin_hash TEXT,                      -- NULL after an admin PIN reset: next sign-in sets a new PIN
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until REAL NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS account_sessions(
  token_hash TEXT PRIMARY KEY,        -- SHA-256 of the cookie; the token itself is never stored
  mobile TEXT NOT NULL,
  expires_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS saved_looks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile TEXT NOT NULL,
  title TEXT NOT NULL,
  look TEXT NOT NULL,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_saved_mobile ON saved_looks(mobile, updated_at);
"""


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Raw:
    def __init__(self, body, ctype, filename=None):
        self.body, self.ctype, self.filename = body, ctype, filename


# ----------------------------------------------------------------- helpers

def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    return conn


def _str(v, n=200):
    return ("" if v is None else str(v)).strip()[:n]


def _int(v, lo=0, hi=10 ** 9, default=0):
    try:
        x = int(float(v))
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, x))


def _float(v, lo, hi, default):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return round(max(lo, min(hi, x)), 2)


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "design"


HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
URL_RE = re.compile(r"^/uploads/[A-Za-z0-9_.\-/]+$")


def _url(v):
    return v if isinstance(v, str) and URL_RE.match(v) and ".." not in v else ""


def _list(v, n, limit):
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        x = _str(x, n)
        if x and x not in out:
            out.append(x)
    return out[:limit]


def get_settings(conn):
    s = json.loads(json.dumps(DEFAULT_SETTINGS))
    for row in conn.execute("SELECT key, value FROM settings WHERE key != 'admin_auth'"):
        s[row["key"]] = json.loads(row["value"])
    return s


def put_setting(conn, key, value):
    conn.execute("INSERT INTO settings(key, value) VALUES(?, ?) "
                 "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(value)))


def hash_password(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()
    return {"salt": salt, "hash": digest}


def check_password(conn, pw):
    row = conn.execute("SELECT value FROM settings WHERE key = 'admin_auth'").fetchone()
    if not row:
        return False
    rec = json.loads(row["value"])
    return hmac.compare_digest(hash_password(pw, rec["salt"])["hash"], rec["hash"])


def clean_design(p):
    """Validate and normalise a design payload coming from the admin panel."""
    if not isinstance(p, dict):
        raise ApiError(400, "Invalid design")
    d = {"name": _str(p.get("name"), 80)}
    if not d["name"]:
        raise ApiError(400, "Design name is required")
    d["category"] = _str(p.get("category"), 40) or "Couture"
    d["badge"] = _str(p.get("badge"), 24)
    d["tagline"] = _str(p.get("tagline"), 160)
    d["story"] = _str(p.get("story"), 3000)
    d["occasions"] = _list(p.get("occasions"), 30, 8)
    d["featured"] = bool(p.get("featured"))
    d["price"] = _int(p.get("price"), 0, 10 ** 8)
    d["price_mode"] = p.get("price_mode") if p.get("price_mode") in PRICE_MODES else "default"
    d["images"] = [u for u in (_url(x) for x in (p.get("images") or [])) if u][:12]

    colors = []
    for c in (p.get("colors") or [])[:12]:
        if not isinstance(c, dict) or not _str(c.get("name"), 40):
            continue
        colors.append({
            "name": _str(c.get("name"), 40),
            "hex": c.get("hex") if isinstance(c.get("hex"), str) and HEX_RE.match(c.get("hex")) else "#222222",
            "image": _url(c.get("image")),
            "delta": _int(c.get("delta"), -10 ** 7, 10 ** 7),
        })
    d["colors"] = colors
    d["sizes"] = _list(p.get("sizes"), 12, 12)
    d["made_to_measure"] = bool(p.get("made_to_measure"))
    d["mtm_delta"] = _int(p.get("mtm_delta"), 0, 10 ** 7)

    addons = []
    for a in (p.get("addons") or [])[:10]:
        if not isinstance(a, dict) or not _str(a.get("name"), 50):
            continue
        addons.append({"name": _str(a.get("name"), 50), "desc": _str(a.get("desc"), 140),
                       "delta": _int(a.get("delta"), 0, 10 ** 7)})
    d["addons"] = addons

    specs = p.get("specs") if isinstance(p.get("specs"), dict) else {}
    d["specs"] = {k: _str(specs.get(k), 140) for k in SPEC_KEYS}
    feel = p.get("feel") if isinstance(p.get("feel"), dict) else {}
    d["feel"] = {k: _int(feel.get(k), 1, 5, 3) for k in FEEL_KEYS}

    spots = []
    for h in (p.get("hotspots") or [])[:10]:
        if not isinstance(h, dict) or not _str(h.get("title"), 40):
            continue
        spots.append({"x": _float(h.get("x"), 0, 100, 50), "y": _float(h.get("y"), 0, 100, 50),
                      "title": _str(h.get("title"), 40), "text": _str(h.get("text"), 220)})
    d["hotspots"] = spots

    editions, seen = [], set()
    for e in (p.get("editions") or [])[:30]:
        if not isinstance(e, dict):
            continue
        loc = _str(e.get("location"), 40)
        if not loc or loc in seen:
            continue
        seen.add(loc)
        editions.append({"location": loc, "limit": _int(e.get("limit"), 1, 100000, 10)})
    d["editions"] = editions
    return d


def unique_slug(conn, base, exclude_id=None):
    slug, n = base, 2
    while True:
        row = conn.execute("SELECT id FROM designs WHERE slug = ?", (slug,)).fetchone()
        if not row or row["id"] == exclude_id:
            return slug
        slug = f"{base}-{n}"
        n += 1


def sold_map(conn):
    m = {}
    for r in conn.execute("SELECT design_id, location, COUNT(*) n FROM orders "
                          "WHERE status != 'cancelled' GROUP BY design_id, location"):
        m.setdefault(r["design_id"], {})[r["location"]] = r["n"]
    return m


def feedback_map(conn):
    m = {}
    for r in conn.execute("SELECT design_id, reaction, COUNT(*) n FROM feedback GROUP BY design_id, reaction"):
        m.setdefault(r["design_id"], {"love": 0, "like": 0, "meh": 0})[r["reaction"]] = r["n"]
    return m


def price_mode_of(d, settings):
    return d["price_mode"] if d.get("price_mode") in PRICE_MODES else settings["price_mode"]


def editions_with_stock(d, sold):
    out = []
    for e in d.get("editions", []):
        n = sold.get(e["location"], 0)
        out.append({"location": e["location"], "limit": e["limit"],
                    "sold": min(n, e["limit"]), "left": max(0, e["limit"] - n)})
    return out


def public_design(row, settings, sold, fb, location, detail=False):
    d = json.loads(row["data"])
    mode = price_mode_of(d, settings)
    eds = editions_with_stock(d, sold)
    here = next((e for e in eds if e["location"] == location), None)
    show_price = mode == "visible"
    out = {
        "id": row["id"], "slug": row["slug"], "name": d["name"], "category": d["category"],
        "badge": d["badge"], "tagline": d["tagline"], "occasions": d["occasions"],
        "featured": d["featured"], "images": d["images"],
        "colors": [{"name": c["name"], "hex": c["hex"], "image": c["image"],
                    **({"delta": c["delta"]} if show_price else {})} for c in d["colors"]],
        "sizes": d["sizes"], "made_to_measure": d["made_to_measure"],
        "addons": [{"name": a["name"], "desc": a["desc"], **({"delta": a["delta"]} if show_price else {})}
                   for a in d["addons"]],
        "price_mode": mode, "editions": eds, "here": here,
        "total_limit": sum(e["limit"] for e in eds), "total_left": sum(e["left"] for e in eds),
        "feedback": fb or {"love": 0, "like": 0, "meh": 0},
        "created_at": row["created_at"],
    }
    if show_price:
        out["price"] = d["price"]
        out["mtm_delta"] = d["mtm_delta"]
    if detail:
        out.update(story=d["story"], specs=d["specs"], feel=d["feel"], hotspots=d["hotspots"])
    return out


def sort_public(items, raw_prices, mode):
    def scarcity(x):
        h = x["here"]
        if not h or h["left"] == 0:
            return (1, 0)
        return (0, h["left"] / max(1, h["limit"]))
    if mode == "newest":
        items.sort(key=lambda x: -x["created_at"])
    elif mode == "price_asc":
        items.sort(key=lambda x: raw_prices[x["id"]])
    elif mode == "price_desc":
        items.sort(key=lambda x: -raw_prices[x["id"]])
    elif mode == "scarcity":
        items.sort(key=scarcity)
    elif mode == "popular":
        items.sort(key=lambda x: -(x["feedback"]["love"] * 2 + x["feedback"]["like"]
                                   + (x["total_limit"] - x["total_left"]) * 3))
    return items


# ----------------------------------------------------------------- sessions & rate limits

SESSIONS = {}
RATE = {}
LOCK = threading.Lock()


def rate_ok(bucket, ip, limit, window):
    now = time.time()
    with LOCK:
        arr = [t for t in RATE.get((bucket, ip), []) if now - t < window]
        ok = len(arr) < limit
        if ok:
            arr.append(now)
        RATE[(bucket, ip)] = arr
        return ok


# ----------------------------------------------------------------- routing

ROUTES = []


def route(method, pattern, admin=False):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), admin, fn))
        return fn
    return deco


SLUG = r"([a-z0-9\-]{1,80})"


@route("GET", r"/api/health")
def api_health(h, conn, body):
    """Used by the hosting platform to check the site is up (also confirms the database opens)."""
    conn.execute("SELECT 1").fetchone()
    return {"ok": True}


@route("GET", r"/api/site")
def api_site(h, conn, body):
    s = get_settings(conn)
    rows = conn.execute("SELECT data FROM designs WHERE status = 'active'").fetchall()
    limits = [e["limit"] for r in rows for e in json.loads(r["data"]).get("editions", [])]
    cats = sorted({json.loads(r["data"])["category"] for r in rows})
    return {
        "hero": s["hero"], "announcement": s["announcement"], "price_mode": s["price_mode"],
        "sort_mode": s["sort_mode"], "allow_customer_sort": s["allow_customer_sort"],
        "locations": s["locations"], "default_location": s["default_location"],
        "low_stock_threshold": s["low_stock_threshold"], "currency": s["currency"],
        "contact": s["contact"], "categories": cats,
        "stats": {"designs": len(rows), "cities": len(s["locations"]),
                  "min_limit": min(limits) if limits else 0},
    }


@route("GET", r"/api/activity")
def api_activity(h, conn, body):
    """Real, anonymous social proof: the latest claimed pieces (no customer data)."""
    rows = conn.execute(
        "SELECT o.design_name, o.location, o.edition_no, o.edition_limit, o.created_at, d.slug "
        "FROM orders o JOIN designs d ON d.id = o.design_id "
        "WHERE o.status != 'cancelled' AND d.status = 'active' ORDER BY o.id DESC LIMIT 8").fetchall()
    return {"now": time.time(), "claims": [dict(r) for r in rows]}


@route("GET", r"/api/designs")
def api_designs(h, conn, body):
    s = get_settings(conn)
    loc = _str(h.query.get("location"), 40) or s["default_location"]
    sold, fb = sold_map(conn), feedback_map(conn)
    rows = conn.execute("SELECT * FROM designs WHERE status = 'active' ORDER BY sort_order, id").fetchall()
    items, raw = [], {}
    for r in rows:
        item = public_design(r, s, sold.get(r["id"], {}), fb.get(r["id"]), loc)
        if not s["show_sold_out"] and item["here"] and item["here"]["left"] == 0:
            continue
        raw[r["id"]] = json.loads(r["data"])["price"]
        items.append(item)
    mode = s["sort_mode"]
    asked = h.query.get("sort")
    if s["allow_customer_sort"] and asked in SORT_MODES:
        # never let customers order by a price they are not allowed to see
        if not (asked.startswith("price") and s["price_mode"] != "visible"):
            mode = asked
    return {"location": loc, "sort": mode, "designs": sort_public(items, raw, mode)}


@route("GET", r"/api/designs/" + SLUG)
def api_design(h, conn, body, slug):
    s = get_settings(conn)
    loc = _str(h.query.get("location"), 40) or s["default_location"]
    row = conn.execute("SELECT * FROM designs WHERE slug = ? AND status = 'active'", (slug,)).fetchone()
    if not row:
        raise ApiError(404, "This design is no longer on the showroom floor.")
    if not h.query.get("nv"):
        conn.execute("UPDATE designs SET views = views + 1 WHERE id = ?", (row["id"],))
    sold, fb = sold_map(conn), feedback_map(conn)
    item = public_design(row, s, sold.get(row["id"], {}), fb.get(row["id"]), loc, detail=True)
    if item["here"]:
        used = {r[0] for r in conn.execute(
            "SELECT edition_no FROM orders WHERE design_id = ? AND location = ? AND status != 'cancelled'",
            (row["id"], loc))}
        item["here"]["claimed"] = sorted(used)
        item["here"]["next_piece"] = next(
            (n for n in range(1, item["here"]["limit"] + 1) if n not in used), None)
    others = conn.execute("SELECT * FROM designs WHERE status = 'active' AND id != ? "
                          "ORDER BY sort_order, id", (row["id"],)).fetchall()
    others = sorted(others, key=lambda r: json.loads(r["data"])["category"] != item["category"])[:4]
    item["related"] = [public_design(r, s, sold.get(r["id"], {}), fb.get(r["id"]), loc) for r in others]
    return item


@route("GET", r"/api/designs/" + SLUG + r"/price")
def api_price(h, conn, body, slug):
    s = get_settings(conn)
    row = conn.execute("SELECT * FROM designs WHERE slug = ? AND status = 'active'", (slug,)).fetchone()
    if not row:
        raise ApiError(404, "Design not found")
    d = json.loads(row["data"])
    if price_mode_of(d, s) == "request":
        raise ApiError(403, "The price of this design is shared personally by our stylist.")
    if not h.query.get("nv"):  # silent re-fetch of an already-unlocked price
        conn.execute("UPDATE designs SET reveals = reveals + 1 WHERE id = ?", (row["id"],))
    return {"price": d["price"], "mtm_delta": d["mtm_delta"],
            "colors": {c["name"]: c["delta"] for c in d["colors"]},
            "addons": {a["name"]: a["delta"] for a in d["addons"]}}


@route("POST", r"/api/designs/" + SLUG + r"/feedback")
def api_feedback(h, conn, body, slug):
    if not rate_ok("fb", h.client_ip(), 40, 3600):
        raise ApiError(429, "Thanks! We have plenty of your feedback for now.")
    row = conn.execute("SELECT id FROM designs WHERE slug = ? AND status = 'active'", (slug,)).fetchone()
    if not row:
        raise ApiError(404, "Design not found")
    reaction = body.get("reaction")
    if reaction not in REACTIONS:
        raise ApiError(400, "Please pick a reaction")
    client = _str(body.get("client_id"), 64)
    if not re.fullmatch(r"[A-Za-z0-9\-]{8,64}", client):
        raise ApiError(400, "Invalid client")
    comment = _str(body.get("comment"), 400)
    conn.execute("INSERT INTO feedback(design_id, client_id, reaction, comment, created_at) VALUES(?,?,?,?,?) "
                 "ON CONFLICT(design_id, client_id) DO UPDATE SET reaction = excluded.reaction, "
                 "comment = CASE WHEN excluded.comment != '' THEN excluded.comment ELSE feedback.comment END, "
                 "created_at = excluded.created_at",
                 (row["id"], client, reaction, comment, time.time()))
    return {"ok": True, "feedback": feedback_map(conn).get(row["id"], {"love": 0, "like": 0, "meh": 0})}


@route("POST", r"/api/orders")
def api_order(h, conn, body):
    if not rate_ok("order", h.client_ip(), 10, 3600):
        raise ApiError(429, "Too many reservations from this device. Please call us and we'll help.")
    s = get_settings(conn)
    row = conn.execute("SELECT * FROM designs WHERE slug = ? AND status = 'active'",
                       (_str(body.get("slug"), 80),)).fetchone()
    if not row:
        raise ApiError(404, "This design is no longer on the showroom floor.")
    d = json.loads(row["data"])

    name = _str(body.get("name"), 80)
    if len(name) < 2:
        raise ApiError(400, "Please enter your full name.")
    mobile = re.sub(r"\D", "", str(body.get("mobile", "")))
    if len(mobile) == 12 and mobile.startswith("91"):
        mobile = mobile[2:]
    if not re.fullmatch(r"[6-9]\d{9}", mobile):
        raise ApiError(400, "Please enter a valid 10-digit mobile number.")
    address = _str(body.get("address"), 400)
    if len(address) < 10:
        raise ApiError(400, "Please enter your complete delivery address.")
    pincode = re.sub(r"\D", "", str(body.get("pincode", "")))
    if not re.fullmatch(r"[1-9]\d{5}", pincode):
        raise ApiError(400, "Please enter a valid 6-digit pincode.")
    location = _str(body.get("location"), 40)
    ed = next((e for e in d["editions"] if e["location"] == location), None)
    if not ed:
        raise ApiError(400, f"{d['name']} is not offered in {location or 'this city'}.")

    cfg = body.get("config") if isinstance(body.get("config"), dict) else {}
    total, color = d["price"], ""
    if d["colors"]:
        c = next((c for c in d["colors"] if c["name"] == cfg.get("color")), None)
        if not c:
            raise ApiError(400, "Please choose a colourway.")
        color, total = c["name"], total + c["delta"]
    size, measurements = _str(cfg.get("size"), 20), {}
    if size == MTM:
        if not d["made_to_measure"]:
            raise ApiError(400, "Made-to-measure is not offered for this design.")
        total += d["mtm_delta"]
        m = cfg.get("measurements") if isinstance(cfg.get("measurements"), dict) else {}
        measurements = {k: _str(m.get(k), 10) for k in ("bust", "waist", "hip", "height")}
    elif d["sizes"] and size not in d["sizes"]:
        raise ApiError(400, "Please choose a size.")
    chosen = cfg.get("addons") if isinstance(cfg.get("addons"), list) else []
    addons = [a["name"] for a in d["addons"] if a["name"] in chosen]
    total += sum(a["delta"] for a in d["addons"] if a["name"] in addons)
    config = {"color": color, "size": size, "measurements": measurements, "addons": addons}

    conn.execute("BEGIN IMMEDIATE")
    try:
        used = [r[0] for r in conn.execute(
            "SELECT edition_no FROM orders WHERE design_id = ? AND location = ? AND status != 'cancelled'",
            (row["id"], location))]
        if len(used) >= ed["limit"]:
            raise ApiError(409, f"The {location} edition of {d['name']} has just sold out.")
        piece = next(n for n in range(1, ed["limit"] + len(used) + 2) if n not in set(used))
        ref = "UQ-" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
        now = time.time()
        conn.execute("INSERT INTO orders(ref, design_id, design_name, location, edition_no, edition_limit, "
                     "name, mobile, address, pincode, config, total, notes, status, created_at, updated_at) "
                     "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (ref, row["id"], d["name"], location, piece, ed["limit"], name, mobile, address,
                      pincode, json.dumps(config), total, _str(body.get("notes"), 400), "new", now, now))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return {"ref": ref, "design": d["name"], "location": location, "piece": piece,
            "limit": ed["limit"], "left": ed["limit"] - len(used) - 1, "config": config,
            "total": None if price_mode_of(d, s) == "request" else total}


# ----------------------------------------------------------------- design lobby

def lobby_config(conn, include_disabled=False):
    """Catalogue merged with admin overrides (prices, on/off)."""
    s = get_settings(conn)
    ov = s.get("lobby") or {}
    def merge(items, group, price_key):
        out = []
        for it in items:
            o = (ov.get(group) or {}).get(it["key"], {})
            item = dict(it, enabled=o.get("enabled", True))
            if price_key and price_key in o:
                item[price_key] = _int(o[price_key], 0, 10 ** 7, it[price_key])
            if item["enabled"] or include_disabled:
                out.append(item)
        return out
    extras = dict(LC.EXTRAS)
    for k in ("belt", "lining", "pockets"):
        if k in (ov.get("extras") or {}):
            extras[k] = _int(ov["extras"][k], 0, 10 ** 6, extras[k])
    return {
        "enabled": ov.get("enabled", True), "show_estimate": ov.get("show_estimate", True),
        "currency": s["currency"], "locations": s["locations"],
        "fabrics": merge(LC.FABRICS, "fabrics", "rate"),
        "silhouettes": merge(LC.SILHOUETTES, "silhouettes", "base"),
        "embellishments": merge(LC.EMBELLISHMENTS, "embellishments", "price"),
        "necklines": LC.NECKLINES, "sleeves": LC.SLEEVES, "lengths": LC.LENGTHS,
        "colors": [{"name": n, "hex": h} for n, h in LC.COLORS],
        "accents": [{"name": n, "hex": h} for n, h in LC.ACCENTS],
        "skins": LC.SKINS, "extras": extras,
    }


def clean_look(p, cfg):
    """Validate a look against what the atelier currently offers."""
    if not isinstance(p, dict):
        raise ApiError(400, "Invalid look")
    def pick(key, items, label):
        v = p.get(key)
        if not any(i["key"] == v for i in items):
            raise ApiError(400, f"That {label} isn't available right now.")
        return v
    hexv = lambda v, d: v if isinstance(v, str) and HEX_RE.match(v) else d
    look = {
        "sil": pick("sil", cfg["silhouettes"], "silhouette"), "fab": pick("fab", cfg["fabrics"], "fabric"),
        "neck": pick("neck", cfg["necklines"], "neckline"), "slv": pick("slv", cfg["sleeves"], "sleeve"),
        "len": pick("len", cfg["lengths"], "length"),
        "col": hexv(p.get("col"), "#f1e7d6"), "acc": hexv(p.get("acc"), "#c9a05a"),
        "emb": [e["key"] for e in cfg["embellishments"] if e["key"] in (p.get("emb") or [])],
        "dup": p.get("dup") if p.get("dup") in LC.DUPATTAS else "none",
        "belt": bool(p.get("belt")), "lining": bool(p.get("lining")), "pockets": bool(p.get("pockets")),
        "skin": p.get("skin") if p.get("skin") in LC.SKINS else LC.SKINS[2],
    }
    if look["sil"] == "saree":
        look["dup"] = "none"
    if look["sil"] not in ("aline", "sheath", "kurta", "anarkali"):
        look["belt"] = look["pockets"] = False
    look["len"] = LC.effective_length(look["sil"], look["len"])
    return look


def look_estimate(look, cfg):
    """Same formula as the lobby UI (public/js/lobby-render.js > estimate)."""
    find = lambda items, k: next(i for i in items if i["key"] == k)
    sil, fab = find(cfg["silhouettes"], look["sil"]), find(cfg["fabrics"], look["fab"])
    meters = sil["meters"] * find(cfg["lengths"], look["len"])["factor"] + find(cfg["sleeves"], look["slv"])["meters"]
    if look["dup"] != "none":
        meters += cfg["extras"]["dupatta_meters"]
    cost = sil["base"] + fab["rate"] * meters
    cost += sum(e["price"] for e in cfg["embellishments"] if e["key"] in look["emb"])
    cost += sum(cfg["extras"][k] for k in ("belt", "lining", "pockets") if look[k])
    return int(cost / 100.0 + 0.5) * 100  # half-up, like Math.round in the browser and ROUND() in MySQL


@route("GET", r"/api/lobby")
def api_lobby(h, conn, body):
    return lobby_config(conn)


@route("POST", r"/api/looks")
def api_look_request(h, conn, body):
    if not rate_ok("look", h.client_ip(), 6, 3600):
        raise ApiError(429, "You've sent several looks already. Our stylist will be in touch soon!")
    cfg = lobby_config(conn)
    if not cfg["enabled"]:
        raise ApiError(403, "The Design Lobby is closed for now.")
    look = clean_look(body.get("look"), cfg)
    name = _str(body.get("name"), 80)
    if len(name) < 2:
        raise ApiError(400, "Please enter your full name.")
    mobile = re.sub(r"\D", "", str(body.get("mobile", "")))
    if len(mobile) == 12 and mobile.startswith("91"):
        mobile = mobile[2:]
    if not re.fullmatch(r"[6-9]\d{9}", mobile):
        raise ApiError(400, "Please enter a valid 10-digit mobile number.")
    location = _str(body.get("location"), 40)
    if location not in cfg["locations"]:
        raise ApiError(400, "Please choose your city.")
    est = look_estimate(look, cfg)
    ref = "UQ-C" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
    now = time.time()
    conn.execute("INSERT INTO looks(ref, look, name, mobile, location, notes, estimate, status, created_at, updated_at) "
                 "VALUES(?,?,?,?,?,?,?,?,?,?)", (ref, json.dumps(look), name, mobile, location,
                                                 _str(body.get("notes"), 500), est, "new", now, now))
    # a signed-in customer also keeps the commissioned design in their account
    acct = h.account(conn)
    if acct:
        conn.execute("INSERT INTO saved_looks(mobile, title, look, created_at, updated_at) VALUES(?,?,?,?,?)",
                     (acct["mobile"], f"Commissioned · {ref}", json.dumps(look), now, now))
    return {"ref": ref, "estimate": est if cfg["show_estimate"] else None, "look": look}


# ----------------------------------------------------------------- customer accounts (saved designs)

ACCOUNT_TTL = 30 * 86400
MAX_SAVED = 40


def norm_mobile(v):
    m = re.sub(r"\D", "", str(v or ""))
    if len(m) == 12 and m.startswith("91"):
        m = m[2:]
    if not re.fullmatch(r"[6-9]\d{9}", m):
        raise ApiError(400, "Please enter a valid 10-digit mobile number.")
    return m


def hash_pin(pin, salt):
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 120_000).hex()


def mask_mobile(m):
    return m[:2] + "••••••" + m[-2:]


def account_out(a):
    return {"signedIn": True, "name": a["name"], "mobile": mask_mobile(a["mobile"])}


@route("POST", r"/api/me/login")
def me_login(h, conn, body):
    if not rate_ok("pin", h.client_ip(), 20, 900):
        raise ApiError(429, "Too many attempts from this device. Please wait 15 minutes.")
    mobile = norm_mobile(body.get("mobile"))
    pin = str(body.get("pin", ""))
    if not re.fullmatch(r"\d{4,6}", pin):
        raise ApiError(400, "Your PIN is 4 to 6 digits.")
    now = time.time()
    a = conn.execute("SELECT * FROM accounts WHERE mobile = ?", (mobile,)).fetchone()
    if not a:
        name = _str(body.get("name"), 80)
        if len(name) < 2:  # tells the page to ask for a name and create the account
            return {"needsName": True}
        salt = secrets.token_hex(16)
        conn.execute("INSERT INTO accounts(mobile, name, pin_salt, pin_hash, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                     (mobile, name, salt, hash_pin(pin, salt), now, now))
    elif a["locked_until"] > now:
        raise ApiError(429, f"Too many wrong PINs. Try again in {int((a['locked_until'] - now) // 60) + 1} minutes.")
    elif not a["pin_hash"]:  # PIN was reset by the atelier: this sign-in sets the new one
        salt = secrets.token_hex(16)
        conn.execute("UPDATE accounts SET pin_salt = ?, pin_hash = ?, failed = 0, updated_at = ? WHERE mobile = ?",
                     (salt, hash_pin(pin, salt), now, mobile))
    elif not hmac.compare_digest(hash_pin(pin, a["pin_salt"]), a["pin_hash"]):
        failed = a["failed"] + 1
        lock = now + 900 if failed >= 5 else 0
        conn.execute("UPDATE accounts SET failed = ?, locked_until = ? WHERE mobile = ?", (0 if lock else failed, lock, mobile))
        raise ApiError(401, "Too many wrong PINs. Locked for 15 minutes." if lock else f"Wrong PIN. {5 - failed} {'try' if 5 - failed == 1 else 'tries'} left.")
    else:
        conn.execute("UPDATE accounts SET failed = 0, updated_at = ? WHERE mobile = ?", (now, mobile))
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM account_sessions WHERE expires_at < ?", (now,))
    conn.execute("INSERT INTO account_sessions(token_hash, mobile, expires_at) VALUES(?,?,?)",
                 (hashlib.sha256(token.encode()).hexdigest(), mobile, now + ACCOUNT_TTL))
    secure = "; Secure" if h.is_https() else ""
    h.extra_headers.append(("Set-Cookie", f"uq_user={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={ACCOUNT_TTL}{secure}"))
    return account_out(conn.execute("SELECT * FROM accounts WHERE mobile = ?", (mobile,)).fetchone())


@route("GET", r"/api/me")
def me(h, conn, body):
    a = h.account(conn)
    return account_out(a) if a else {"signedIn": False}


@route("POST", r"/api/me/logout")
def me_logout(h, conn, body):
    tok = h.cookie("uq_user")
    if tok:
        conn.execute("DELETE FROM account_sessions WHERE token_hash = ?", (hashlib.sha256(tok.encode()).hexdigest(),))
    h.extra_headers.append(("Set-Cookie", "uq_user=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"))
    return {"signedIn": False}


def need_account(h, conn):
    a = h.account(conn)
    if not a:
        raise ApiError(401, "Please sign in to see your saved designs.")
    return a


@route("GET", r"/api/me/looks")
def me_looks(h, conn, body):
    a = need_account(h, conn)
    return {"looks": [{"id": r["id"], "title": r["title"], "look": json.loads(r["look"]), "updated_at": r["updated_at"]}
                      for r in conn.execute("SELECT * FROM saved_looks WHERE mobile = ? ORDER BY updated_at DESC", (a["mobile"],))]}


@route("POST", r"/api/me/looks")
def me_save_look(h, conn, body):
    a = need_account(h, conn)
    look = clean_look(body.get("look"), lobby_config(conn))
    title = _str(body.get("title"), 60) or "My design"
    now, lid = time.time(), _int(body.get("id"), 0, 10 ** 9)
    if lid and conn.execute("SELECT 1 FROM saved_looks WHERE id = ? AND mobile = ?", (lid, a["mobile"])).fetchone():
        conn.execute("UPDATE saved_looks SET title = ?, look = ?, updated_at = ? WHERE id = ?", (title, json.dumps(look), now, lid))
    else:
        if conn.execute("SELECT COUNT(*) FROM saved_looks WHERE mobile = ?", (a["mobile"],)).fetchone()[0] >= MAX_SAVED:
            raise ApiError(400, f"Your account holds {MAX_SAVED} designs. Remove one to save another.")
        lid = conn.execute("INSERT INTO saved_looks(mobile, title, look, created_at, updated_at) VALUES(?,?,?,?,?)",
                           (a["mobile"], title, json.dumps(look), now, now)).lastrowid
    return {"id": lid, "title": title}


@route("DELETE", r"/api/me/looks/(\d+)")
def me_delete_look(h, conn, body, lid):
    a = need_account(h, conn)
    conn.execute("DELETE FROM saved_looks WHERE id = ? AND mobile = ?", (int(lid), a["mobile"]))
    return {"ok": True}


@route("POST", r"/api/admin/accounts/(\d{10})/reset-pin", admin=True)
def admin_reset_pin(h, conn, body, mobile):
    conn.execute("UPDATE accounts SET pin_salt = NULL, pin_hash = NULL, failed = 0, locked_until = 0, updated_at = ? WHERE mobile = ?",
                 (time.time(), mobile))
    conn.execute("DELETE FROM account_sessions WHERE mobile = ?", (mobile,))
    return {"ok": True}


@route("PUT", r"/api/admin/looks/(\d+)", admin=True)
def admin_look_update(h, conn, body, lid):
    if body.get("status") not in LC.LOOK_STATUSES:
        raise ApiError(400, "Invalid status")
    conn.execute("UPDATE looks SET status = ?, updated_at = ? WHERE id = ?", (body["status"], time.time(), int(lid)))
    return {"ok": True}


@route("PUT", r"/api/admin/lobby", admin=True)
def admin_lobby(h, conn, b):
    out = {"enabled": bool(b.get("enabled", True)), "show_estimate": bool(b.get("show_estimate", True))}
    for group, items, price_key in (("fabrics", LC.FABRICS, "rate"), ("silhouettes", LC.SILHOUETTES, "base"),
                                    ("embellishments", LC.EMBELLISHMENTS, "price")):
        src = b.get(group) if isinstance(b.get(group), dict) else {}
        out[group] = {}
        for it in items:
            o = src.get(it["key"]) if isinstance(src.get(it["key"]), dict) else {}
            out[group][it["key"]] = {"enabled": bool(o.get("enabled", True)),
                                     price_key: _int(o.get(price_key), 0, 10 ** 7, it[price_key])}
    ex = b.get("extras") if isinstance(b.get("extras"), dict) else {}
    out["extras"] = {k: _int(ex.get(k), 0, 10 ** 6, LC.EXTRAS[k]) for k in ("belt", "lining", "pockets")}
    if not any(v["enabled"] for v in out["fabrics"].values()) or not any(v["enabled"] for v in out["silhouettes"].values()):
        raise ApiError(400, "Keep at least one fabric and one silhouette enabled.")
    put_setting(conn, "lobby", out)
    return {"ok": True}


# ----------------------------------------------------------------- admin

@route("POST", r"/api/admin/login")
def admin_login(h, conn, body):
    if not rate_ok("login", h.client_ip(), 10, 900):
        raise ApiError(429, "Too many attempts. Try again in 15 minutes.")
    if not check_password(conn, str(body.get("password", ""))):
        raise ApiError(401, "Incorrect password")
    token = secrets.token_urlsafe(32)
    with LOCK:
        now = time.time()
        for k in [k for k, v in SESSIONS.items() if v < now]:
            del SESSIONS[k]
        SESSIONS[token] = now + SESSION_TTL
    secure = "; Secure" if h.is_https() else ""
    h.extra_headers.append(("Set-Cookie", f"uq_admin={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL}{secure}"))
    return {"ok": True}


@route("POST", r"/api/admin/logout")
def admin_logout(h, conn, body):
    tok = h.cookie("uq_admin")
    with LOCK:
        SESSIONS.pop(tok, None)
    h.extra_headers.append(("Set-Cookie", "uq_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"))
    return {"ok": True}


@route("GET", r"/api/admin/me")
def admin_me(h, conn, body):
    return {"authenticated": h.is_admin()}


def order_out(r):
    o = dict(r)
    o["config"] = json.loads(o["config"])
    return o


@route("GET", r"/api/admin/overview", admin=True)
def admin_overview(h, conn, body):
    s = get_settings(conn)
    sold, fb = sold_map(conn), feedback_map(conn)
    counts = {r["design_id"]: r["n"] for r in conn.execute(
        "SELECT design_id, COUNT(*) n FROM orders WHERE status != 'cancelled' GROUP BY design_id")}
    designs = []
    for r in conn.execute("SELECT * FROM designs ORDER BY sort_order, id"):
        d = json.loads(r["data"])
        designs.append({"id": r["id"], "slug": r["slug"], "status": r["status"], "sort_order": r["sort_order"],
                        "views": r["views"], "reveals": r["reveals"], "created_at": r["created_at"],
                        "updated_at": r["updated_at"], "data": d,
                        "editions": editions_with_stock(d, sold.get(r["id"], {})),
                        "feedback": fb.get(r["id"], {"love": 0, "like": 0, "meh": 0}),
                        "orders": counts.get(r["id"], 0), "effective_price_mode": price_mode_of(d, s)})
    orders = [order_out(r) for r in conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 2000")]
    feedback = [dict(r) for r in conn.execute(
        "SELECT f.id, f.design_id, f.reaction, f.comment, f.created_at, d.slug FROM feedback f "
        "LEFT JOIN designs d ON d.id = f.design_id ORDER BY f.id DESC LIMIT 2000")]
    looks = []
    for r in conn.execute("SELECT * FROM looks ORDER BY id DESC LIMIT 1000"):
        lk = dict(r)
        lk["look"] = json.loads(lk["look"])
        looks.append(lk)
    accounts = []
    saved = {}
    for r in conn.execute("SELECT * FROM saved_looks ORDER BY updated_at DESC LIMIT 3000"):
        saved.setdefault(r["mobile"], []).append({"id": r["id"], "title": r["title"], "look": json.loads(r["look"]), "updated_at": r["updated_at"]})
    for a in conn.execute("SELECT mobile, name, pin_hash IS NULL AS pin_reset, created_at, updated_at FROM accounts ORDER BY updated_at DESC"):
        accounts.append({**dict(a), "pin_reset": bool(a["pin_reset"]), "looks": saved.get(a["mobile"], [])})
    return {"designs": designs, "orders": orders, "feedback": feedback, "settings": s, "looks": looks, "accounts": accounts,
            "lobby": lobby_config(conn, include_disabled=True), "look_statuses": LC.LOOK_STATUSES,
            "order_statuses": ORDER_STATUSES, "sort_modes": SORT_MODES}


@route("POST", r"/api/admin/designs", admin=True)
def admin_create(h, conn, body):
    d = clean_design(body)
    slug = unique_slug(conn, slugify(_str(body.get("slug"), 60) or d["name"]))
    status = body.get("status") if body.get("status") in STATUSES else "draft"
    order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM designs").fetchone()[0]
    now = time.time()
    cur = conn.execute("INSERT INTO designs(slug, status, sort_order, data, created_at, updated_at) "
                       "VALUES(?,?,?,?,?,?)", (slug, status, order, json.dumps(d), now, now))
    return {"id": cur.lastrowid, "slug": slug}


@route("PUT", r"/api/admin/designs/(\d+)", admin=True)
def admin_update(h, conn, body, did):
    did = int(did)
    row = conn.execute("SELECT * FROM designs WHERE id = ?", (did,)).fetchone()
    if not row:
        raise ApiError(404, "Design not found")
    d = clean_design(body)
    slug = unique_slug(conn, slugify(_str(body.get("slug"), 60) or d["name"]), exclude_id=did)
    status = body.get("status") if body.get("status") in STATUSES else row["status"]
    conn.execute("UPDATE designs SET slug = ?, status = ?, data = ?, updated_at = ? WHERE id = ?",
                 (slug, status, json.dumps(d), time.time(), did))
    return {"id": did, "slug": slug}


@route("POST", r"/api/admin/designs/(\d+)/status", admin=True)
def admin_status(h, conn, body, did):
    if body.get("status") not in STATUSES:
        raise ApiError(400, "Invalid status")
    conn.execute("UPDATE designs SET status = ?, updated_at = ? WHERE id = ?",
                 (body["status"], time.time(), int(did)))
    return {"ok": True}


@route("POST", r"/api/admin/designs/(\d+)/duplicate", admin=True)
def admin_duplicate(h, conn, body, did):
    row = conn.execute("SELECT * FROM designs WHERE id = ?", (int(did),)).fetchone()
    if not row:
        raise ApiError(404, "Design not found")
    d = json.loads(row["data"])
    d["name"] = (d["name"] + " (copy)")[:80]
    return admin_create(h, conn, {**d, "status": "draft"})


@route("DELETE", r"/api/admin/designs/(\d+)", admin=True)
def admin_delete(h, conn, body, did):
    did = int(did)
    conn.execute("DELETE FROM designs WHERE id = ?", (did,))
    conn.execute("DELETE FROM feedback WHERE design_id = ?", (did,))
    return {"ok": True}


@route("POST", r"/api/admin/reorder", admin=True)
def admin_reorder(h, conn, body):
    ids = body.get("ids")
    if not isinstance(ids, list):
        raise ApiError(400, "Invalid order")
    conn.execute("BEGIN")
    for n, did in enumerate(ids):
        conn.execute("UPDATE designs SET sort_order = ? WHERE id = ?", (n, _int(did)))
    conn.execute("COMMIT")
    return {"ok": True}


def sniff_image(raw):
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


@route("POST", r"/api/admin/upload", admin=True)
def admin_upload(h, conn, body):
    m = re.match(r"^data:image/[a-z+.\-]+;base64,(.+)$", str(body.get("data", "")), re.S)
    if not m:
        raise ApiError(400, "Unsupported file")
    try:
        raw = base64.b64decode(m.group(1))
    except ValueError:
        raise ApiError(400, "Corrupted image")
    if len(raw) > MAX_IMAGE:
        raise ApiError(413, "Image is larger than 8 MB")
    ext = sniff_image(raw)
    if not ext:
        raise ApiError(400, "Please upload a JPG, PNG, WEBP or GIF image")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    fn = time.strftime("%Y%m%d") + "-" + secrets.token_hex(6) + "." + ext
    with open(os.path.join(UPLOAD_DIR, fn), "wb") as f:
        f.write(raw)
    return {"url": "/uploads/u/" + fn}


@route("PUT", r"/api/admin/orders/(\d+)", admin=True)
def admin_order_update(h, conn, body, oid):
    status = body.get("status")
    if status not in ORDER_STATUSES:
        raise ApiError(400, "Invalid status")
    conn.execute("BEGIN IMMEDIATE")
    try:
        o = conn.execute("SELECT * FROM orders WHERE id = ?", (int(oid),)).fetchone()
        if not o:
            raise ApiError(404, "Order not found")
        piece = o["edition_no"]
        if o["status"] == "cancelled" and status != "cancelled":
            used = [r[0] for r in conn.execute(
                "SELECT edition_no FROM orders WHERE design_id = ? AND location = ? AND status != 'cancelled'",
                (o["design_id"], o["location"]))]
            if len(used) >= o["edition_limit"]:
                raise ApiError(409, "That city's edition is full - this order cannot be restored.")
            if piece in used:
                piece = next(n for n in range(1, o["edition_limit"] + len(used) + 2) if n not in set(used))
        conn.execute("UPDATE orders SET status = ?, edition_no = ?, updated_at = ? WHERE id = ?",
                     (status, piece, time.time(), int(oid)))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return {"ok": True}


@route("GET", r"/api/admin/orders\.csv", admin=True)
def admin_orders_csv(h, conn, body):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Ref", "Date", "Status", "Design", "City", "Piece", "Name", "Mobile", "Address",
                "Pincode", "Colour", "Size", "Measurements", "Add-ons", "Total", "Notes"])
    for r in conn.execute("SELECT * FROM orders ORDER BY id DESC"):
        c = json.loads(r["config"])
        w.writerow([r["ref"], time.strftime("%Y-%m-%d %H:%M", time.localtime(r["created_at"])), r["status"],
                    r["design_name"], r["location"], f"{r['edition_no']}/{r['edition_limit']}", r["name"],
                    r["mobile"], r["address"], r["pincode"], c.get("color", ""), c.get("size", ""),
                    "; ".join(f"{k}: {v}" for k, v in c.get("measurements", {}).items() if v),
                    ", ".join(c.get("addons", [])), r["total"], r["notes"]])
    return Raw(("﻿" + buf.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", "uniqo-orders.csv")


@route("DELETE", r"/api/admin/feedback/(\d+)", admin=True)
def admin_feedback_delete(h, conn, body, fid):
    conn.execute("DELETE FROM feedback WHERE id = ?", (int(fid),))
    return {"ok": True}


@route("PUT", r"/api/admin/settings", admin=True)
def admin_settings(h, conn, b):
    cur = get_settings(conn)
    hero = b.get("hero") if isinstance(b.get("hero"), dict) else {}
    put_setting(conn, "hero", {k: _str(hero.get(k), 400) or cur["hero"][k] for k in ("eyebrow", "title", "subtitle")})
    put_setting(conn, "announcement", _str(b.get("announcement"), 200))
    if b.get("price_mode") in PRICE_MODES:
        put_setting(conn, "price_mode", b["price_mode"])
    if b.get("sort_mode") in SORT_MODES:
        put_setting(conn, "sort_mode", b["sort_mode"])
    put_setting(conn, "allow_customer_sort", bool(b.get("allow_customer_sort")))
    put_setting(conn, "show_sold_out", bool(b.get("show_sold_out")))
    locs = _list(b.get("locations"), 40, 40)
    if not locs:
        raise ApiError(400, "Add at least one city")
    put_setting(conn, "locations", locs)
    put_setting(conn, "default_location", b.get("default_location") if b.get("default_location") in locs else locs[0])
    put_setting(conn, "low_stock_threshold", _int(b.get("low_stock_threshold"), 1, 1000, 5))
    put_setting(conn, "currency", _str(b.get("currency"), 4) or "₹")
    c = b.get("contact") if isinstance(b.get("contact"), dict) else {}
    put_setting(conn, "contact", {
        "phone": _str(c.get("phone"), 30), "whatsapp": re.sub(r"\D", "", str(c.get("whatsapp", "")))[:15],
        "email": _str(c.get("email"), 80), "instagram": _str(c.get("instagram"), 40).lstrip("@"),
        "address": _str(c.get("address"), 200)})
    return {"ok": True, "settings": get_settings(conn)}


@route("POST", r"/api/admin/password", admin=True)
def admin_password(h, conn, body):
    if not check_password(conn, str(body.get("current", ""))):
        raise ApiError(400, "Current password is incorrect")
    new = str(body.get("new", ""))
    if len(new) < 8:
        raise ApiError(400, "New password must be at least 8 characters")
    put_setting(conn, "admin_auth", hash_password(new))
    return {"ok": True}


# ----------------------------------------------------------------- HTTP handler

MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8", ".json": "application/json",
        ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"}

PAGE_ALIASES = {"/": "/index.html", "/admin": "/admin/index.html", "/admin/": "/admin/index.html",
                "/design": "/design.html", "/lobby": "/lobby.html", "/favicon.ico": "/assets/mark.svg"}


class Handler(BaseHTTPRequestHandler):
    server_version = "Uniqo/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def do_GET(self):
        self.dispatch("GET")

    def do_HEAD(self):
        self.dispatch("GET")  # send() omits the body for HEAD

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def client_ip(self):
        if TRUST_PROXY:
            fwd = self.headers.get("CF-Connecting-IP") or (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            if fwd:
                return fwd
        return self.client_address[0]

    def is_https(self):
        return FORCE_SECURE or (TRUST_PROXY and self.headers.get("X-Forwarded-Proto", "").lower() == "https")

    def cookie(self, name):
        c = SimpleCookie()
        try:
            c.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        return c[name].value if name in c else None

    def account(self, conn):
        """The signed-in customer account (row) or None."""
        tok = self.cookie("uq_user")
        if not tok:
            return None
        return conn.execute("SELECT a.* FROM account_sessions s JOIN accounts a ON a.mobile = s.mobile "
                            "WHERE s.token_hash = ? AND s.expires_at > ?",
                            (hashlib.sha256(tok.encode()).hexdigest(), time.time())).fetchone()

    def is_admin(self):
        tok = self.cookie("uq_admin")
        with LOCK:
            exp = SESSIONS.get(tok) if tok else None
            return bool(exp and exp > time.time())

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ApiError(413, "Request too large")
        if not length:
            return {}
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise ApiError(415, "Expected JSON")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "Invalid JSON")
        if not isinstance(data, dict):
            raise ApiError(400, "Invalid JSON")
        return data

    def send(self, status, body, ctype, headers=()):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if self.is_https():
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send(status, body, "application/json; charset=utf-8",
                  [("Cache-Control", "no-store")] + self.extra_headers)

    def dispatch(self, method):
        self.extra_headers = []
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            self.query = {k: v[0] for k, v in parse_qs(url.query).items()}
            for m, rx, admin, fn in ROUTES:
                match = rx.match(url.path)
                if m != method or not match:
                    continue
                try:
                    if admin and not self.is_admin():
                        raise ApiError(401, "Please sign in again")
                    body = self.read_json() if method in ("POST", "PUT") else {}
                    conn = connect()
                    try:
                        result = fn(self, conn, body, *match.groups())
                    finally:
                        conn.close()
                    if isinstance(result, Raw):
                        hdrs = [("Cache-Control", "no-store")]
                        if result.filename:
                            hdrs.append(("Content-Disposition", f'attachment; filename="{result.filename}"'))
                        self.send(200, result.body, result.ctype, hdrs)
                    else:
                        self.send_json(200, result)
                except ApiError as e:
                    self.send_json(e.status, {"error": e.message})
                except Exception:
                    traceback.print_exc()
                    self.send_json(500, {"error": "Something went wrong. Please try again."})
                return
            self.send_json(404, {"error": "Not found"})
        elif method == "GET":
            self.serve_static(unquote(url.path))
        else:
            self.send_json(405, {"error": "Method not allowed"})

    def serve_static(self, path):
        path = PAGE_ALIASES.get(path, path)
        if path.startswith("/uploads/u/"):  # admin uploads live in the persistent data dir
            base, rel = UPLOAD_DIR, path[len("/uploads/u/"):]
        else:
            base, rel = PUBLIC, path.lstrip("/")
        full = os.path.realpath(os.path.join(base, rel))
        if not full.startswith(base + os.sep) or not os.path.isfile(full):
            nf = os.path.join(PUBLIC, "404.html")
            body = open(nf, "rb").read() if os.path.isfile(nf) else b"Not found"
            return self.send(404, body, "text/html; charset=utf-8", [("Content-Security-Policy", PAGE_CSP)])
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            body = f.read()
        uploads = path.startswith("/uploads/")
        headers = [("Cache-Control", "public, max-age=604800" if uploads else "no-cache")]
        if ext == ".html":
            headers.append(("Content-Security-Policy", PAGE_CSP))
        elif ext == ".svg":
            # brand SVGs may pull the logo fonts and reference sibling SVGs; uploads get nothing
            headers.append(("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'" if uploads else
                            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com"))
        self.send(200, body, ctype, headers)


# ----------------------------------------------------------------- bootstrap

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    conn = connect()
    conn.executescript(SCHEMA)
    if not conn.execute("SELECT 1 FROM settings WHERE key = 'admin_auth'").fetchone():
        pw = os.environ.get("UNIQO_ADMIN_PASSWORD")
        if not pw:
            # never ship a guessable default on a public server: generate one and show it once in the logs
            pw = secrets.token_urlsafe(12) if os.environ.get("UNIQO_PUBLIC") == "1" else "uniqo-admin"
        put_setting(conn, "admin_auth", hash_password(pw))
        print(f"  Admin password set to: {pw}   (change it in Admin > Settings)")
    if not conn.execute("SELECT 1 FROM settings WHERE key = 'seeded'").fetchone():
        import seed_data
        now = time.time()
        for n, raw in enumerate(seed_data.build(os.path.join(PUBLIC, "uploads", "seed"))):
            d = clean_design(raw)
            conn.execute("INSERT INTO designs(slug, status, sort_order, data, created_at, updated_at) "
                         "VALUES(?,?,?,?,?,?)",
                         (unique_slug(conn, slugify(d["name"])), raw.get("status", "active"), n,
                          json.dumps(d), now - n * 86400, now))
        put_setting(conn, "seeded", True)
        print("  Seeded the showroom with sample designs.")
    conn.close()


def main():
    sys.stdout.reconfigure(line_buffering=True)
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"\n  UNIQO  -  Your Style. Your Rarity.\n"
          f"  Showroom : http://localhost:{PORT}/\n"
          f"  Admin    : http://localhost:{PORT}/admin\n")
    if not os.environ.get("UNIQO_ADMIN_PASSWORD") and HOST == "0.0.0.0":
        print("  Tip: before going public, change the admin password in Admin > Settings.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bye.")


if __name__ == "__main__":
    main()
