# UNIQO — Your Style. Your Rarity.

Uniqo is a design showroom for clothes. Customers walk through each design the way they would at a bike
showroom: every view, the full spec sheet and a feel profile. They then customise the design and reserve a
**numbered piece** from an edition that is **capped per city**.

## Run it

Requires only **Python 3.9+**. There are no packages to install.

```bash
python server.py
```

Or double-click **`start.bat`** on Windows.

| | |
|---|---|
| Showroom | http://localhost:8080/ |
| Admin    | http://localhost:8080/admin |
| Default admin password | `uniqo-admin`. **Change it in Admin → Settings** |

Optional environment variables: `UNIQO_PORT` (default 8080), `UNIQO_HOST` (default 0.0.0.0) and
`UNIQO_ADMIN_PASSWORD` (initial password, used on first run only).

On the first run the showroom is seeded with 6 sample designs, illustrated as SVG mannequins. Replace them
with real photography from the admin panel.

## What customers get

- **City selector.** Every count, badge and button reflects the edition in the visitor's city.
- **Showroom grid.** Filter by category, optional customer sort (rarest, most loved, newest), a live
  "N of M left in your city" meter, and an "Only N left" alert.
- **Hidden prices.** A *Reveal price* button unlocks the price on tap, and the admin sees every reveal.
  Designs can also be *always visible* or *price on request*.
- **Design stage.** Swipeable views, colourways that switch the image, and anatomy pins that explain
  each detail.
- **Edition map.** One dot per numbered piece, showing claimed pieces and the number the customer will get.
- **Configurator.** Colourway, size or made-to-measure (bust, waist, hip, height) and hand-finished
  add-ons, with a live total.
- **Spec sheet, feel profile (1–5 meters) and size guide.**
- **Compare.** Shortlist up to 3 designs side by side.
- **Reservation.** Name, +91 mobile, address and pincode, validated on the client and the server. The
  customer gets an **edition card** (e.g. *Nº 07 of 25 · Hyderabad*) and a reference.
- **One-tap feedback.** 😍 / 👍 / 🤔, plus an optional note. One vote per visitor per design.
- **WhatsApp stylist** button, shown once a WhatsApp number is set in admin.
- Fully responsive: phone, tablet, laptop and desktop.

## The Design Lobby (`/lobby`)

A game-style dressing room where customers design their own look on an avatar:

- **Build it:** pick a silhouette (Anarkali, A-line, Sheath, Kurta set, Lehenga, Pre-draped saree) and
  one of 12 fabrics (cotton, georgette, crepe, rayon, chikankari, space silk, silk, chiffon, chanderi,
  satin silk, denim, linen). Each fabric has its own woven texture, sheen and sheerness.
- **Tune it:** main and trim colour, neckline, sleeves, length, and handwork (gota, zari, mirror,
  sequins, block print, pearls). Extras: dupatta, belt, lining and pockets. Skin tone or atelier mannequin.
- **Game feel:** every option card previews the change on the customer's current look. Wear stats
  animate with +/- deltas, there's a look tier (Essential → Heirloom) and atelier notes. Surprise me,
  undo/redo, drag to turn the avatar, keyboard shortcuts (Z, Y, F, R, 1–9).
- **3D avatar:** a real-time 360° avatar (WebGL2, no libraries; `public/js/lobby-3d.js`). It's generated
  from the look recipe, so length, flare, neckline, sleeves and dupatta change instantly. Fabrics show
  their weave, sheen and sheerness; flowing fabrics fold more than stiff ones; mirror and sequin work
  glints as it turns. It switches to the 2D sketch automatically on devices without WebGL2 or in
  data-saver mode, and the 3D/2D button (or `D`) switches by hand.
- **Customer accounts:** sign in with a mobile number and a 4–6 digit PIN to save up to 40 designs
  to an account and open them on any device. Wrong PINs lock the account for 15 minutes after 5 tries,
  and sessions are stored only as hashes. Guests can still save 8 looks on their device and move them
  to an account later.
- **Keep it:** a share link that reopens the exact look.
- **Commission it:** name, mobile and city are sent to the stylist as an "edition of 1". The server
  recalculates the estimate, so it can't be tampered with.
- **Admin → Lobby:** every commission is drawn from its saved recipe, with status tracking. Each fabric,
  silhouette and handwork can be switched on or off and repriced, and the lobby or its estimates can be
  hidden entirely.

## What the admin gets

- **Dashboard.** KPIs, rarity alerts for low or sold-out cities, latest reservations, and interest
  signals (views, price reveals, reactions, orders).
- **Designs.** Create, edit, duplicate, **publish / draft / archive**, delete, and drag-and-drop (or ▲▼)
  to set the showroom order.
- **Editor.** Image upload (auto-compressed, drag-and-drop, set cover, reorder), colourways with their
  own image and price difference, sizes, made-to-measure surcharge, add-ons, the spec sheet, feel
  sliders, click-to-place anatomy pins, **per-city piece limits** with claimed counts, base price and
  price display mode.
- **Orders.** Filter by status or city, search, update status (*New → Confirmed → In making → Shipped →
  Delivered*), and **export to CSV**. Cancelling an order releases its numbered piece back to the city.
- **Feedback.** Love / like / meh breakdown per design, and customer notes.
- **Settings.** Default price display, showroom sort mode, customer sort on/off, show or hide sold-out
  designs, low-stock threshold, cities, default city, hero copy, announcement bar, contact details,
  and password.

## Project layout

```
server.py         HTTP server + JSON API + SQLite (standard library only)
seed_data.py      sample designs + SVG illustration generator (first run only)
public/           storefront (index.html, design.html), admin/, css/, js/, assets/logo.webp
public/uploads/   seed illustrations + admin uploads (u/)
data/uniqo.db     database (created automatically; back this file up)
```

## Going live: checklist

- Change the admin password and set the real phone, WhatsApp, email and address in **Settings**.
- Put the server behind HTTPS (e.g. Nginx or Caddy as a reverse proxy) before exposing the admin
  panel to the internet.
- Back up `data/uniqo.db` and `public/uploads/u/` regularly.
- To reset to the sample showroom, stop the server and delete `data/uniqo.db`.
