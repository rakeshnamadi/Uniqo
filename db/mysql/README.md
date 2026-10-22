# Uniqo on MySQL

Scripts that hold **all of Uniqo's data and site configuration** in MySQL 8.0.19 or newer.

| File | What it does | Re-runnable |
|---|---|---|
| `01_schema.sql` | Creates the `uniqo` database and its 32 tables, with keys and constraints | ✔ (`IF NOT EXISTS`) |
| `02_views_routines.sql` | Reporting views, functions and stored procedures | ✔ |
| `03_seed_config.sql` | Default site settings, cities and the full Design Lobby catalogue. *Generated.* | ✔ (upserts) |
| `05_data.sql` | Full export of the running website. *Generated; replaces business data.* | ✔ |
| `uniqo_mysql.py` | `seed` · `export` · `admin-sql` helper (Python standard library only) | – |
| `create_database.ps1` / `.sh` | One command to build everything | ✔ |

## Create the database

Windows (PowerShell):

```bash
powershell -ExecutionPolicy Bypass -File db\mysql\create_database.ps1 -ImportData
```

Linux / macOS:

```bash
bash db/mysql/create_database.sh --import-data
```

You'll be asked for the MySQL admin password and a password for the app user. Leave the second
one blank to have one generated. The script then:

1. Builds the schema and routines.
2. Loads the configuration and lobby catalogue.
3. Creates **`uniqo_app`**, a least-privilege user (SELECT/INSERT/UPDATE/DELETE/EXECUTE on `uniqo.*`
   only) for the website to connect with.
4. With `-ImportData`, copies every design, order, customer, feedback vote, lobby commission, your
   admin-panel changes, the current admin password, and customer accounts with their saved designs. Without it, it prompts for a new admin password.

Leave out `-ImportData` (or `--import-data`) for an empty showroom with only the configuration loaded.
Use `-Server host -Port 3306 -User admin` (or the `MYSQL_HOST` / `MYSQL_USER` variables) for a remote server.

## How the data is organised

```
site_settings ── key/value JSON (hero copy, price mode, sort mode, contact, lobby switches)
locations ─────┬── design_editions ── designs ──┬── design_images / colors / sizes / addons
               │      (piece_limit per city)    ├── design_occasions / hotspots
               │                                ├── feedback (one vote per visitor)
               ├── customers ── orders ─────────┘     └── order_addons
               └── looks ── look_embellishments
lobby_silhouettes · lobby_fabrics · lobby_fabric_best_for · lobby_necklines · lobby_sleeves
lobby_lengths · lobby_embellishments · lobby_palette · lobby_skin_tones · lobby_extras
admin_users · admin_sessions · admin_audit_log
customers ── customer_accounts (mobile + PIN) ──┬── customer_sessions
                                                └── saved_looks (designs saved from the lobby)
```

### Rarity rules enforced by the database itself

* `orders.active_piece` is a generated column (NULL when cancelled) with a **unique key on
  (design, city, piece)**. Two live orders can never hold the same numbered piece, even if the
  application has a bug.
* `sp_reserve_piece` locks the design's edition row (`SELECT … FOR UPDATE`). Two customers
  reserving the last piece at the same moment can't both succeed.
* `CHECK` constraints validate Indian mobiles, pincodes, hex colours, 1–5 stats and positive limits.

## Using the procedures

```sql
-- reserve a numbered piece (validates everything and prices it on the server)
CALL sp_reserve_piece('noor-drape', 'Hyderabad', 'Asha Rao', '9876543210',
     'Flat 4, Road 2, Banjara Hills', '500034', 'Ivory & Onyx', 'M', NULL,
     JSON_ARRAY('Hand-zari border'), 'Wedding on 12 Dec', @ref, @piece, @limit, @total);
SELECT @ref, @piece, @limit, @total;           -- e.g. UQ-7KQ2MX, 1, 25, 21300

CALL sp_set_order_status(42, 'cancelled');      -- frees the piece number
CALL sp_set_order_status(42, 'confirmed');      -- restores it (re-checks the city limit)

-- Design Lobby commission; the estimate is recomputed from the catalogue
CALL sp_create_look(JSON_OBJECT('sil','anarkali','fab','georgette','col','#b0245a','acc','#c9a05a',
     'neck','sweetheart','slv','elbow','len','floor','emb',JSON_ARRAY('gota'),'dup','none',
     'belt',FALSE,'lining',TRUE,'pockets',FALSE,'skin','#c98e66'),
     'Asha Rao','9876543210','Hyderabad','Sangeet in March', @ref, @estimate);

-- reports
SELECT * FROM v_design_stock WHERE pieces_left <= 5 ORDER BY pieces_left;   -- rarity alerts
SELECT * FROM v_showroom ORDER BY loves DESC;                                -- interest signals
SELECT * FROM v_orders_export WHERE status = 'new';                          -- call list
SELECT * FROM v_look_requests WHERE status = 'new';                          -- commissions
```

## Keeping it in sync

* After changing `lobby_catalog.py`, run `python db/mysql/uniqo_mysql.py seed` and re-apply `03_seed_config.sql`.
* `python db/mysql/uniqo_mysql.py export` takes a fresh snapshot of the website at any time.

> The website itself still runs on its built-in SQLite file. These scripts prepare MySQL alongside
> it. Pointing `server.py` at MySQL is a separate step: it needs a MySQL driver such as PyMySQL,
> and the reservation and commission code switched to call the procedures above.
