-- =============================================================================
--  UNIQO - Your Style. Your Rarity.
--  01_schema.sql : database, tables, keys and constraints
--  Target: MySQL 8.0.19+ (JSON, CHECK constraints, generated columns, CTEs)
--
--  Money is stored in whole rupees (INT), matching the application.
--  Every table uses utf8mb4 so Hindi, Tamil, emoji etc. are safe.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS uniqo
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE uniqo;
SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
--  1. SITE CONFIGURATION
-- -----------------------------------------------------------------------------

-- Free-form site settings (hero copy, price mode, sort mode, contact, lobby flags ...)
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key   VARCHAR(64)  NOT NULL,
  setting_value JSON         NOT NULL,
  description   VARCHAR(255) NULL,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

-- Cities the atelier serves. Exactly one may be the default.
CREATE TABLE IF NOT EXISTS locations (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(40)  NOT NULL,
  is_default   TINYINT(1)   NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  default_flag TINYINT GENERATED ALWAYS AS (IF(is_default = 1, 1, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_location_name (name),
  UNIQUE KEY uq_one_default (default_flag)          -- at most one default city
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
--  2. ADMIN ACCESS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username       VARCHAR(60)  NOT NULL,
  password_algo  VARCHAR(40)  NOT NULL DEFAULT 'pbkdf2_sha256$200000',
  password_salt  CHAR(32)     NOT NULL,              -- 16 random bytes, hex
  password_hash  CHAR(64)     NOT NULL,              -- PBKDF2-SHA256, hex
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_username (username)
) ENGINE=InnoDB;

-- Only a hash of the session token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  CHAR(64)     NOT NULL,                 -- SHA-256 of the cookie value
  admin_id    INT UNSIGNED NOT NULL,
  created_ip  VARCHAR(45)  NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY ix_session_expiry (expires_at),
  CONSTRAINT fk_session_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    INT UNSIGNED NULL,
  action      VARCHAR(40)  NOT NULL,                 -- e.g. design.update, order.status
  entity      VARCHAR(40)  NOT NULL,
  entity_id   VARCHAR(40)  NULL,
  details     JSON         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity, entity_id),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
--  3. SHOWROOM DESIGNS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS designs (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug               VARCHAR(80)  NOT NULL,
  name               VARCHAR(80)  NOT NULL,
  category           VARCHAR(40)  NOT NULL DEFAULT 'Couture',
  badge              VARCHAR(24)  NOT NULL DEFAULT '',
  tagline            VARCHAR(160) NOT NULL DEFAULT '',
  story              TEXT         NULL,
  status             ENUM('active','draft','archived') NOT NULL DEFAULT 'draft',
  sort_order         INT          NOT NULL DEFAULT 0,
  featured           TINYINT(1)   NOT NULL DEFAULT 0,
  -- pricing
  base_price         INT UNSIGNED NOT NULL DEFAULT 0,
  price_mode         ENUM('default','visible','reveal','request') NOT NULL DEFAULT 'default',
  made_to_measure    TINYINT(1)   NOT NULL DEFAULT 0,
  mtm_delta          INT UNSIGNED NOT NULL DEFAULT 0,
  -- spec sheet
  spec_fabric        VARCHAR(140) NOT NULL DEFAULT '',
  spec_lining        VARCHAR(140) NOT NULL DEFAULT '',
  spec_weight        VARCHAR(140) NOT NULL DEFAULT '',
  spec_fit           VARCHAR(140) NOT NULL DEFAULT '',
  spec_neckline      VARCHAR(140) NOT NULL DEFAULT '',
  spec_sleeve        VARCHAR(140) NOT NULL DEFAULT '',
  spec_length        VARCHAR(140) NOT NULL DEFAULT '',
  spec_closure       VARCHAR(140) NOT NULL DEFAULT '',
  spec_embellishment VARCHAR(140) NOT NULL DEFAULT '',
  spec_care          VARCHAR(140) NOT NULL DEFAULT '',
  spec_making_days   VARCHAR(140) NOT NULL DEFAULT '',
  -- feel profile 1..5
  feel_comfort       TINYINT UNSIGNED NOT NULL DEFAULT 3,
  feel_drape         TINYINT UNSIGNED NOT NULL DEFAULT 3,
  feel_stretch       TINYINT UNSIGNED NOT NULL DEFAULT 3,
  feel_breathability TINYINT UNSIGNED NOT NULL DEFAULT 3,
  feel_formality     TINYINT UNSIGNED NOT NULL DEFAULT 3,
  -- interest signals
  views              INT UNSIGNED NOT NULL DEFAULT 0,
  reveals            INT UNSIGNED NOT NULL DEFAULT 0,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_design_slug (slug),
  KEY ix_design_floor (status, sort_order),
  KEY ix_design_category (category),
  CONSTRAINT ck_design_slug CHECK (slug REGEXP '^[a-z0-9-]+$'),
  CONSTRAINT ck_feel CHECK (feel_comfort BETWEEN 1 AND 5 AND feel_drape BETWEEN 1 AND 5 AND feel_stretch BETWEEN 1 AND 5
                            AND feel_breathability BETWEEN 1 AND 5 AND feel_formality BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  design_id  INT UNSIGNED NOT NULL,
  url        VARCHAR(255) NOT NULL,                  -- e.g. /uploads/u/20261015-ab12cd.webp
  alt_text   VARCHAR(160) NOT NULL DEFAULT '',
  position   SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 = cover
  PRIMARY KEY (id),
  UNIQUE KEY uq_image_position (design_id, position),
  CONSTRAINT fk_image_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_colors (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  design_id   INT UNSIGNED NOT NULL,
  name        VARCHAR(40)  NOT NULL,
  hex         CHAR(7)      NOT NULL,
  image_url   VARCHAR(255) NULL,                     -- stage switches to this image
  price_delta INT          NOT NULL DEFAULT 0,       -- may be negative
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_color_name (design_id, name),
  CONSTRAINT fk_color_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE,
  CONSTRAINT ck_color_hex CHECK (hex REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_sizes (
  design_id  INT UNSIGNED NOT NULL,
  size_label VARCHAR(12)  NOT NULL,
  position   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (design_id, size_label),
  CONSTRAINT fk_size_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_addons (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  design_id   INT UNSIGNED NOT NULL,
  name        VARCHAR(50)  NOT NULL,
  description VARCHAR(140) NOT NULL DEFAULT '',
  price_delta INT UNSIGNED NOT NULL DEFAULT 0,
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addon_name (design_id, name),
  CONSTRAINT fk_addon_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_occasions (
  design_id INT UNSIGNED NOT NULL,
  occasion  VARCHAR(30)  NOT NULL,
  PRIMARY KEY (design_id, occasion),
  KEY ix_occasion (occasion),
  CONSTRAINT fk_occasion_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- "Anatomy" pins placed on the cover image (percent coordinates)
CREATE TABLE IF NOT EXISTS design_hotspots (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  design_id INT UNSIGNED NOT NULL,
  position  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  x_pct     DECIMAL(5,2) NOT NULL,
  y_pct     DECIMAL(5,2) NOT NULL,
  title     VARCHAR(40)  NOT NULL,
  body      VARCHAR(220) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_hotspot_design (design_id, position),
  CONSTRAINT fk_hotspot_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE,
  CONSTRAINT ck_hotspot_xy CHECK (x_pct BETWEEN 0 AND 100 AND y_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- THE RARITY RULE: how many pieces of a design may ever exist in each city
CREATE TABLE IF NOT EXISTS design_editions (
  design_id   INT UNSIGNED      NOT NULL,
  location_id SMALLINT UNSIGNED NOT NULL,
  piece_limit SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (design_id, location_id),
  KEY ix_edition_location (location_id),
  CONSTRAINT fk_edition_design   FOREIGN KEY (design_id)   REFERENCES designs (id)   ON DELETE CASCADE,
  CONSTRAINT fk_edition_location FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE RESTRICT,
  CONSTRAINT ck_edition_limit CHECK (piece_limit > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
--  4. CUSTOMERS, ORDERS (RESERVATIONS), FEEDBACK
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  mobile      CHAR(10)     NOT NULL,                 -- Indian mobile without +91
  name        VARCHAR(80)  NOT NULL,
  address     VARCHAR(400) NULL,
  pincode     CHAR(6)      NULL,
  location_id SMALLINT UNSIGNED NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_mobile (mobile),
  CONSTRAINT fk_customer_location FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE SET NULL,
  CONSTRAINT ck_customer_mobile CHECK (mobile REGEXP '^[6-9][0-9]{9}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ref           VARCHAR(12)  NOT NULL,               -- e.g. UQ-Q7G75H
  customer_id   INT UNSIGNED NULL,
  design_id     INT UNSIGNED NULL,                   -- NULL if the design was later deleted
  design_name   VARCHAR(80)  NOT NULL,               -- snapshot at time of order
  location_id   SMALLINT UNSIGNED NOT NULL,
  location_name VARCHAR(40)  NOT NULL,               -- snapshot
  edition_no    SMALLINT UNSIGNED NOT NULL,          -- the numbered piece, e.g. 7
  edition_limit SMALLINT UNSIGNED NOT NULL,          -- e.g. 25  -> "Nº 07 of 25"
  customer_name VARCHAR(80)  NOT NULL,
  mobile        CHAR(10)     NOT NULL,
  address       VARCHAR(400) NOT NULL,
  pincode       CHAR(6)      NOT NULL,
  color_name    VARCHAR(40)  NOT NULL DEFAULT '',
  size_label    VARCHAR(20)  NOT NULL DEFAULT '',
  measurements  JSON         NULL,                   -- {"bust":"34","waist":"28",...}
  total         INT UNSIGNED NOT NULL,
  notes         VARCHAR(400) NOT NULL DEFAULT '',
  status        ENUM('new','confirmed','in_making','shipped','delivered','cancelled') NOT NULL DEFAULT 'new',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- NULL for cancelled orders, so a cancelled piece number can be claimed again
  active_piece  SMALLINT UNSIGNED GENERATED ALWAYS AS (IF(status <> 'cancelled', edition_no, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_ref (ref),
  -- the database itself guarantees no two live orders ever hold the same numbered piece
  UNIQUE KEY uq_live_piece (design_id, location_id, active_piece),
  KEY ix_order_stock (design_id, location_id, status),
  KEY ix_order_status (status, created_at),
  KEY ix_order_mobile (mobile),
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_order_design   FOREIGN KEY (design_id)   REFERENCES designs (id)   ON DELETE SET NULL,
  CONSTRAINT fk_order_location FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE RESTRICT,
  CONSTRAINT ck_order_mobile  CHECK (mobile REGEXP '^[6-9][0-9]{9}$'),
  CONSTRAINT ck_order_pincode CHECK (pincode REGEXP '^[1-9][0-9]{5}$'),
  CONSTRAINT ck_order_piece   CHECK (edition_no >= 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_addons (
  order_id   INT UNSIGNED NOT NULL,
  addon_name VARCHAR(50)  NOT NULL,
  price      INT UNSIGNED NOT NULL DEFAULT 0,        -- price charged at the time of order
  PRIMARY KEY (order_id, addon_name),
  CONSTRAINT fk_oaddon_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- One reaction per visitor (anonymous browser id) per design
CREATE TABLE IF NOT EXISTS feedback (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  design_id  INT UNSIGNED NOT NULL,
  client_id  VARCHAR(64)  NOT NULL,
  reaction   ENUM('love','like','meh') NOT NULL,
  comment    VARCHAR(400) NOT NULL DEFAULT '',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feedback_voter (design_id, client_id),
  KEY ix_feedback_reaction (design_id, reaction),
  CONSTRAINT fk_feedback_design FOREIGN KEY (design_id) REFERENCES designs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
--  5. DESIGN LOBBY CATALOGUE (what customers can combine on the avatar)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lobby_silhouettes (
  silhouette_key VARCHAR(24)  NOT NULL,
  label          VARCHAR(40)  NOT NULL,
  description    VARCHAR(200) NOT NULL DEFAULT '',
  base_price     INT UNSIGNED NOT NULL,
  meters         DECIMAL(4,2) NOT NULL,              -- fabric used at ankle length
  making_days    TINYINT UNSIGNED NOT NULL,
  allows_belt    TINYINT(1)   NOT NULL DEFAULT 1,    -- also allows pockets
  allows_dupatta TINYINT(1)   NOT NULL DEFAULT 1,
  is_enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order     SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (silhouette_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lobby_fabrics (
  fabric_key         VARCHAR(24)  NOT NULL,
  label              VARCHAR(40)  NOT NULL,
  description        VARCHAR(220) NOT NULL DEFAULT '',
  tag                VARCHAR(24)  NOT NULL DEFAULT '',
  gsm                VARCHAR(20)  NOT NULL DEFAULT '',
  care               VARCHAR(60)  NOT NULL DEFAULT '',
  luxury             TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- 1..3, feeds the look tier
  rate_per_meter     INT UNSIGNED NOT NULL,
  stat_comfort       TINYINT UNSIGNED NOT NULL,
  stat_drape         TINYINT UNSIGNED NOT NULL,
  stat_stretch       TINYINT UNSIGNED NOT NULL,
  stat_breathability TINYINT UNSIGNED NOT NULL,
  stat_formality     TINYINT UNSIGNED NOT NULL,
  render_texture     VARCHAR(16)  NOT NULL DEFAULT 'none', -- weave, slub, twill, chikan ...
  render_sheen       DECIMAL(3,2) NOT NULL DEFAULT 0.10,
  render_sheer       DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  is_enabled         TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order         SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (fabric_key),
  CONSTRAINT ck_fabric_stats CHECK (stat_comfort BETWEEN 1 AND 5 AND stat_drape BETWEEN 1 AND 5 AND stat_stretch BETWEEN 1 AND 5
                                    AND stat_breathability BETWEEN 1 AND 5 AND stat_formality BETWEEN 1 AND 5),
  CONSTRAINT ck_fabric_render CHECK (render_sheen BETWEEN 0 AND 1 AND render_sheer BETWEEN 0 AND 1 AND luxury BETWEEN 1 AND 3)
) ENGINE=InnoDB;

-- "★ Best match" pairings shown in the lobby
CREATE TABLE IF NOT EXISTS lobby_fabric_best_for (
  fabric_key     VARCHAR(24) NOT NULL,
  silhouette_key VARCHAR(24) NOT NULL,
  PRIMARY KEY (fabric_key, silhouette_key),
  CONSTRAINT fk_best_fabric FOREIGN KEY (fabric_key)     REFERENCES lobby_fabrics (fabric_key)         ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_best_sil    FOREIGN KEY (silhouette_key) REFERENCES lobby_silhouettes (silhouette_key) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lobby_necklines (
  neckline_key VARCHAR(24) NOT NULL,
  label        VARCHAR(40) NOT NULL,
  is_enabled   TINYINT(1)  NOT NULL DEFAULT 1,
  sort_order   SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (neckline_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lobby_sleeves (
  sleeve_key   VARCHAR(24)  NOT NULL,
  label        VARCHAR(40)  NOT NULL,
  extra_meters DECIMAL(4,2) NOT NULL DEFAULT 0,
  is_enabled   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (sleeve_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lobby_lengths (
  length_key   VARCHAR(24)  NOT NULL,
  label        VARCHAR(40)  NOT NULL,
  meter_factor DECIMAL(4,2) NOT NULL,
  is_enabled   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (length_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lobby_embellishments (
  emb_key     VARCHAR(24)  NOT NULL,
  label       VARCHAR(40)  NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  price       INT UNSIGNED NOT NULL,
  making_days TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_enabled  TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (emb_key)
) ENGINE=InnoDB;

-- Curated colours: 'main' fabric colours and 'trim' metals
CREATE TABLE IF NOT EXISTS lobby_palette (
  id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  palette    ENUM('main','trim') NOT NULL,
  name       VARCHAR(40) NOT NULL,
  hex        CHAR(7)     NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_palette_hex (palette, hex),
  CONSTRAINT ck_palette_hex CHECK (hex REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lobby_skin_tones (
  id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  value      VARCHAR(16) NOT NULL,                   -- '#c98e66' or 'mannequin'
  label      VARCHAR(40) NOT NULL DEFAULT '',
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_skin_value (value)
) ENGINE=InnoDB;

-- belt / lining / pockets prices and dupatta fabric metres
CREATE TABLE IF NOT EXISTS lobby_extras (
  extra_key VARCHAR(24)   NOT NULL,
  label     VARCHAR(40)   NOT NULL,
  value     DECIMAL(10,2) NOT NULL,
  unit      ENUM('rupees','meters') NOT NULL DEFAULT 'rupees',
  PRIMARY KEY (extra_key)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
--  6. DESIGN LOBBY COMMISSIONS ("edition of one" requests)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS looks (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ref            VARCHAR(12)  NOT NULL,              -- e.g. UQ-CLDEC2
  customer_id    INT UNSIGNED NULL,
  customer_name  VARCHAR(80)  NOT NULL,
  mobile         CHAR(10)     NOT NULL,
  location_id    SMALLINT UNSIGNED NOT NULL,
  silhouette_key VARCHAR(24)  NOT NULL,
  fabric_key     VARCHAR(24)  NOT NULL,
  neckline_key   VARCHAR(24)  NOT NULL,
  sleeve_key     VARCHAR(24)  NOT NULL,
  length_key     VARCHAR(24)  NOT NULL,
  main_hex       CHAR(7)      NOT NULL,
  trim_hex       CHAR(7)      NOT NULL,
  dupatta        ENUM('none','draped','shoulder') NOT NULL DEFAULT 'none',
  has_belt       TINYINT(1)   NOT NULL DEFAULT 0,
  has_lining     TINYINT(1)   NOT NULL DEFAULT 0,
  has_pockets    TINYINT(1)   NOT NULL DEFAULT 0,
  skin           VARCHAR(16)  NOT NULL DEFAULT '#c98e66',
  look_json      JSON         NOT NULL,              -- exact snapshot used to redraw the avatar
  estimate       INT UNSIGNED NOT NULL,
  notes          VARCHAR(500) NOT NULL DEFAULT '',
  status         ENUM('new','contacted','quoted','in_making','delivered','closed') NOT NULL DEFAULT 'new',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_look_ref (ref),
  KEY ix_look_status (status, created_at),
  KEY ix_look_mobile (mobile),
  CONSTRAINT fk_look_customer FOREIGN KEY (customer_id)    REFERENCES customers (id)                     ON DELETE SET NULL,
  CONSTRAINT fk_look_location FOREIGN KEY (location_id)    REFERENCES locations (id)                     ON DELETE RESTRICT,
  CONSTRAINT fk_look_sil      FOREIGN KEY (silhouette_key) REFERENCES lobby_silhouettes (silhouette_key) ON UPDATE CASCADE,
  CONSTRAINT fk_look_fabric   FOREIGN KEY (fabric_key)     REFERENCES lobby_fabrics (fabric_key)         ON UPDATE CASCADE,
  CONSTRAINT fk_look_neck     FOREIGN KEY (neckline_key)   REFERENCES lobby_necklines (neckline_key)     ON UPDATE CASCADE,
  CONSTRAINT fk_look_sleeve   FOREIGN KEY (sleeve_key)     REFERENCES lobby_sleeves (sleeve_key)         ON UPDATE CASCADE,
  CONSTRAINT fk_look_length   FOREIGN KEY (length_key)     REFERENCES lobby_lengths (length_key)         ON UPDATE CASCADE,
  CONSTRAINT ck_look_mobile CHECK (mobile REGEXP '^[6-9][0-9]{9}$'),
  CONSTRAINT ck_look_hex    CHECK (main_hex REGEXP '^#[0-9A-Fa-f]{6}$' AND trim_hex REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
--  7. CUSTOMER ACCOUNTS (mobile + PIN) AND SAVED DESIGNS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_accounts (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id  INT UNSIGNED NOT NULL,
  mobile       CHAR(10)     NOT NULL,
  display_name VARCHAR(80)  NOT NULL,
  pin_salt     CHAR(32)     NULL,                    -- NULL after an atelier PIN reset
  pin_hash     CHAR(64)     NULL,                    -- PBKDF2-SHA256 (120k iterations), hex
  failed_pins  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME     NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_account_mobile (mobile),
  UNIQUE KEY uq_account_customer (customer_id),
  CONSTRAINT fk_account_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT ck_account_mobile CHECK (mobile REGEXP '^[6-9][0-9]{9}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash CHAR(64)     NOT NULL,                  -- SHA-256 of the cookie value
  account_id INT UNSIGNED NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY ix_csession_expiry (expires_at),
  CONSTRAINT fk_csession_account FOREIGN KEY (account_id) REFERENCES customer_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- designs a customer saved from the Design Lobby (max 40 per account, enforced by the app)
CREATE TABLE IF NOT EXISTS saved_looks (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id INT UNSIGNED NOT NULL,
  title      VARCHAR(60)  NOT NULL,
  look_json  JSON         NOT NULL,                  -- same recipe the lobby and 3D avatar render
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_saved_account (account_id, updated_at),
  CONSTRAINT fk_saved_account FOREIGN KEY (account_id) REFERENCES customer_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS look_embellishments (
  look_id INT UNSIGNED NOT NULL,
  emb_key VARCHAR(24)  NOT NULL,
  PRIMARY KEY (look_id, emb_key),
  CONSTRAINT fk_lemb_look FOREIGN KEY (look_id) REFERENCES looks (id) ON DELETE CASCADE,
  CONSTRAINT fk_lemb_emb  FOREIGN KEY (emb_key) REFERENCES lobby_embellishments (emb_key) ON UPDATE CASCADE
) ENGINE=InnoDB;
