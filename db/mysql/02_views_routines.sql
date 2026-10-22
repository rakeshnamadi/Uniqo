-- =============================================================================
--  UNIQO - 02_views_routines.sql : reporting views, functions, stored procedures
--  Run after 01_schema.sql. Safe to re-run (CREATE OR REPLACE / DROP IF EXISTS).
-- =============================================================================
USE uniqo;

-- -----------------------------------------------------------------------------
--  VIEWS
-- -----------------------------------------------------------------------------

-- Live rarity: pieces claimed / left per design per city
CREATE OR REPLACE VIEW v_design_stock AS
SELECT d.id                     AS design_id,
       d.slug, d.name, d.status,
       l.id                     AS location_id,
       l.name                   AS location,
       e.piece_limit,
       COUNT(o.id)              AS claimed,
       GREATEST(e.piece_limit - COUNT(o.id), 0) AS pieces_left
FROM design_editions e
JOIN designs   d ON d.id = e.design_id
JOIN locations l ON l.id = e.location_id
LEFT JOIN orders o ON o.design_id = e.design_id AND o.location_id = e.location_id AND o.status <> 'cancelled'
GROUP BY d.id, d.slug, d.name, d.status, l.id, l.name, e.piece_limit;

-- One-tap verdicts per design
CREATE OR REPLACE VIEW v_design_feedback AS
SELECT d.id AS design_id, d.slug, d.name,
       COALESCE(SUM(f.reaction = 'love'), 0) AS loves,
       COALESCE(SUM(f.reaction = 'like'), 0) AS likes,
       COALESCE(SUM(f.reaction = 'meh'),  0) AS mehs,
       COUNT(f.id)                           AS votes,
       COALESCE(SUM(f.comment <> ''), 0)     AS notes
FROM designs d
LEFT JOIN feedback f ON f.design_id = d.id
GROUP BY d.id, d.slug, d.name;

-- What the showroom floor shows (admin dashboard "interest signals")
CREATE OR REPLACE VIEW v_showroom AS
SELECT d.id, d.slug, d.name, d.category, d.status, d.sort_order, d.featured, d.base_price, d.price_mode,
       d.views, d.reveals,
       (SELECT url FROM design_images i WHERE i.design_id = d.id ORDER BY i.position LIMIT 1) AS cover_url,
       COALESCE(s.total_limit, 0) AS total_limit,
       COALESCE(s.total_left, 0)  AS total_left,
       fb.loves, fb.likes, fb.mehs
FROM designs d
LEFT JOIN (SELECT design_id, SUM(piece_limit) AS total_limit, SUM(pieces_left) AS total_left
           FROM v_design_stock GROUP BY design_id) s ON s.design_id = d.id
LEFT JOIN v_design_feedback fb ON fb.design_id = d.id;

-- Flat order list, same columns as the admin CSV export
CREATE OR REPLACE VIEW v_orders_export AS
SELECT o.ref, o.created_at, o.status, o.design_name, o.location_name AS city,
       CONCAT(LPAD(o.edition_no, 2, '0'), '/', o.edition_limit) AS piece,
       o.customer_name, o.mobile, o.address, o.pincode, o.color_name, o.size_label,
       o.measurements,
       (SELECT GROUP_CONCAT(a.addon_name ORDER BY a.addon_name SEPARATOR ', ') FROM order_addons a WHERE a.order_id = o.id) AS addons,
       o.total, o.notes
FROM orders o;

-- Lobby commissions with readable labels
CREATE OR REPLACE VIEW v_look_requests AS
SELECT k.id, k.ref, k.status, k.created_at, k.customer_name, k.mobile, l.name AS city,
       s.label AS silhouette, f.label AS fabric, n.label AS neckline, sl.label AS sleeves, ln.label AS length,
       k.main_hex, k.trim_hex, k.dupatta, k.has_belt, k.has_lining, k.has_pockets,
       (SELECT GROUP_CONCAT(e.label ORDER BY e.sort_order SEPARATOR ', ')
          FROM look_embellishments le JOIN lobby_embellishments e ON e.emb_key = le.emb_key
         WHERE le.look_id = k.id) AS handwork,
       k.estimate, k.notes
FROM looks k
JOIN locations          l  ON l.id = k.location_id
JOIN lobby_silhouettes  s  ON s.silhouette_key = k.silhouette_key
JOIN lobby_fabrics      f  ON f.fabric_key = k.fabric_key
JOIN lobby_necklines    n  ON n.neckline_key = k.neckline_key
JOIN lobby_sleeves      sl ON sl.sleeve_key = k.sleeve_key
JOIN lobby_lengths      ln ON ln.length_key = k.length_key;

-- -----------------------------------------------------------------------------
--  FUNCTIONS
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_make_ref;
DROP FUNCTION IF EXISTS fn_lobby_estimate;
DROP PROCEDURE IF EXISTS sp_reserve_piece;
DROP PROCEDURE IF EXISTS sp_set_order_status;
DROP PROCEDURE IF EXISTS sp_create_look;

DELIMITER $$

-- Random reference like UQ-Q7G75H (no 0/O/1/I to avoid confusion on the phone)
CREATE FUNCTION fn_make_ref(p_prefix VARCHAR(6), p_len TINYINT)
RETURNS VARCHAR(12)
NOT DETERMINISTIC NO SQL
BEGIN
  DECLARE v_alpha CHAR(32) DEFAULT 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  DECLARE v_out   VARCHAR(12) DEFAULT p_prefix;
  DECLARE i       TINYINT DEFAULT 0;
  WHILE i < p_len DO
    SET v_out = CONCAT(v_out, SUBSTRING(v_alpha, 1 + FLOOR(RAND() * 32), 1));
    SET i = i + 1;
  END WHILE;
  RETURN v_out;
END$$

-- Design Lobby estimate. Same formula as the website:
--   silhouette base + fabric rate x metres + handwork + extras, rounded to the nearest 100
CREATE FUNCTION fn_lobby_estimate(p_look JSON)
RETURNS INT UNSIGNED
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_sil  VARCHAR(24) DEFAULT JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.sil'));
  DECLARE v_fab  VARCHAR(24) DEFAULT JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.fab'));
  DECLARE v_slv  VARCHAR(24) DEFAULT JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.slv'));
  DECLARE v_len  VARCHAR(24) DEFAULT JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.len'));
  DECLARE v_dup  VARCHAR(12) DEFAULT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.dup')), 'none');
  DECLARE v_base INT; DECLARE v_m DECIMAL(6,2); DECLARE v_belt_ok TINYINT; DECLARE v_dup_ok TINYINT;
  DECLARE v_rate INT; DECLARE v_factor DECIMAL(4,2); DECLARE v_slv_m DECIMAL(4,2);
  DECLARE v_emb INT DEFAULT 0; DECLARE v_extra DECIMAL(10,2) DEFAULT 0; DECLARE v_dup_m DECIMAL(10,2) DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;   -- a missing option leaves the variable NULL

  -- a saree is always floor length; a lehenga at least ankle
  IF v_sil = 'saree' THEN SET v_len = 'floor', v_dup = 'none';
  ELSEIF v_sil = 'lehenga' AND v_len IN ('knee', 'midi') THEN SET v_len = 'ankle';
  END IF;

  SELECT base_price, meters, allows_belt, allows_dupatta INTO v_base, v_m, v_belt_ok, v_dup_ok
    FROM lobby_silhouettes WHERE silhouette_key = v_sil AND is_enabled = 1;
  SELECT rate_per_meter INTO v_rate   FROM lobby_fabrics WHERE fabric_key = v_fab AND is_enabled = 1;
  SELECT meter_factor   INTO v_factor FROM lobby_lengths WHERE length_key = v_len;
  SELECT extra_meters   INTO v_slv_m  FROM lobby_sleeves WHERE sleeve_key = v_slv;
  IF v_base IS NULL OR v_rate IS NULL OR v_factor IS NULL OR v_slv_m IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_dup <> 'none' AND v_dup_ok = 1 THEN
    SELECT value INTO v_dup_m FROM lobby_extras WHERE extra_key = 'dupatta_meters';
  END IF;

  SELECT COALESCE(SUM(e.price), 0) INTO v_emb
    FROM lobby_embellishments e
    JOIN JSON_TABLE(COALESCE(JSON_EXTRACT(p_look, '$.emb'), JSON_ARRAY()), '$[*]' COLUMNS (k VARCHAR(24) PATH '$')) j ON j.k = e.emb_key
   WHERE e.is_enabled = 1;

  SELECT COALESCE(SUM(x.value), 0) INTO v_extra
    FROM lobby_extras x
   WHERE (x.extra_key = 'lining'  AND JSON_EXTRACT(p_look, '$.lining')  = TRUE)
      OR (x.extra_key = 'belt'    AND JSON_EXTRACT(p_look, '$.belt')    = TRUE AND v_belt_ok = 1)
      OR (x.extra_key = 'pockets' AND JSON_EXTRACT(p_look, '$.pockets') = CAST('true' AS JSON) AND v_belt_ok = 1);

  RETURN ROUND((v_base + v_rate * (v_m * v_factor + v_slv_m + v_dup_m) + v_emb + v_extra) / 100) * 100;
END$$

-- -----------------------------------------------------------------------------
--  sp_reserve_piece : claim the next numbered piece of a design in a city.
--  Locks the design's edition row so two customers can never get the same
--  number, validates every choice, prices it server-side, upserts the customer.
--
--  CALL sp_reserve_piece('noor-drape', 'Hyderabad', 'Asha Rao', '9876543210',
--       'Flat 4, Road 2, Banjara Hills', '500034', 'Ivory & Onyx', 'M', NULL,
--       JSON_ARRAY('Hand-zari border'), 'Wedding on 12 Dec', @ref, @piece, @limit, @total);
--  SELECT @ref, @piece, @limit, @total;
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_reserve_piece(
  IN  p_slug         VARCHAR(80),
  IN  p_location     VARCHAR(40),
  IN  p_name         VARCHAR(80),
  IN  p_mobile       CHAR(10),
  IN  p_address      VARCHAR(400),
  IN  p_pincode      CHAR(6),
  IN  p_color        VARCHAR(40),
  IN  p_size         VARCHAR(20),
  IN  p_measurements JSON,
  IN  p_addons       JSON,
  IN  p_notes        VARCHAR(400),
  OUT o_ref          VARCHAR(12),
  OUT o_piece        SMALLINT UNSIGNED,
  OUT o_limit        SMALLINT UNSIGNED,
  OUT o_total        INT UNSIGNED)
BEGIN
  DECLARE v_design INT UNSIGNED; DECLARE v_name VARCHAR(80); DECLARE v_loc SMALLINT UNSIGNED;
  DECLARE v_price INT; DECLARE v_mtm TINYINT; DECLARE v_mtm_delta INT;
  DECLARE v_used INT; DECLARE v_color_delta INT DEFAULT 0; DECLARE v_addons INT DEFAULT 0;
  DECLARE v_customer INT UNSIGNED;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET o_ref = NULL, o_piece = NULL, o_limit = NULL, o_total = NULL;
  START TRANSACTION;

  SELECT id, name, base_price, made_to_measure, mtm_delta
    INTO v_design, v_name, v_price, v_mtm, v_mtm_delta
    FROM designs WHERE slug = p_slug AND status = 'active';
  IF v_design IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This design is no longer on the showroom floor.';
  END IF;

  SELECT id INTO v_loc FROM locations WHERE name = p_location AND is_active = 1;
  -- FOR UPDATE serialises every reservation for this design + city
  SELECT piece_limit INTO o_limit FROM design_editions
   WHERE design_id = v_design AND location_id = v_loc FOR UPDATE;
  IF o_limit IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This design is not offered in that city.';
  END IF;

  SELECT COUNT(*) INTO v_used FROM orders
   WHERE design_id = v_design AND location_id = v_loc AND status <> 'cancelled';
  IF v_used >= o_limit THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sold out: this city''s edition is complete.';
  END IF;

  -- colourway (required when the design has colourways)
  IF EXISTS (SELECT 1 FROM design_colors WHERE design_id = v_design) THEN
    IF NOT EXISTS (SELECT 1 FROM design_colors WHERE design_id = v_design AND name = p_color) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Please choose a colourway.';
    END IF;
    SELECT price_delta INTO v_color_delta FROM design_colors WHERE design_id = v_design AND name = p_color;
  END IF;

  -- size or made-to-measure
  IF p_size = 'Made to measure' THEN
    IF v_mtm = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Made-to-measure is not offered for this design.'; END IF;
    SET v_price = v_price + v_mtm_delta;
  ELSEIF EXISTS (SELECT 1 FROM design_sizes WHERE design_id = v_design)
     AND NOT EXISTS (SELECT 1 FROM design_sizes WHERE design_id = v_design AND size_label = p_size) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Please choose a size.';
  END IF;

  -- add-ons: only names that really exist on this design are charged
  SELECT COALESCE(SUM(a.price_delta), 0) INTO v_addons
    FROM design_addons a
    JOIN JSON_TABLE(COALESCE(p_addons, JSON_ARRAY()), '$[*]' COLUMNS (n VARCHAR(50) PATH '$')) j ON j.n = a.name
   WHERE a.design_id = v_design;
  SET o_total = v_price + v_color_delta + v_addons;

  -- smallest free piece number (a cancelled number can be claimed again)
  SET SESSION cte_max_recursion_depth = GREATEST(1000, o_limit + v_used + 2);
  WITH RECURSIVE seq (num) AS (SELECT 1 UNION ALL SELECT num + 1 FROM seq WHERE num < o_limit + v_used + 1)
  SELECT MIN(seq.num) INTO o_piece
    FROM seq
    LEFT JOIN orders o ON o.design_id = v_design AND o.location_id = v_loc
                      AND o.status <> 'cancelled' AND o.edition_no = seq.num
   WHERE o.id IS NULL;

  -- customer: one row per mobile number, details refreshed on every order
  INSERT INTO customers (mobile, name, address, pincode, location_id)
  VALUES (p_mobile, p_name, p_address, p_pincode, v_loc) AS new
  ON DUPLICATE KEY UPDATE name = new.name, address = new.address, pincode = new.pincode, location_id = new.location_id;
  SELECT id INTO v_customer FROM customers WHERE mobile = p_mobile;

  ref_loop: LOOP
    SET o_ref = fn_make_ref('UQ-', 6);
    IF NOT EXISTS (SELECT 1 FROM orders WHERE ref = o_ref) THEN LEAVE ref_loop; END IF;
  END LOOP;

  INSERT INTO orders (ref, customer_id, design_id, design_name, location_id, location_name, edition_no, edition_limit,
                      customer_name, mobile, address, pincode, color_name, size_label, measurements, total, notes)
  VALUES (o_ref, v_customer, v_design, v_name, v_loc, p_location, o_piece, o_limit,
          p_name, p_mobile, p_address, p_pincode, COALESCE(p_color, ''), COALESCE(p_size, ''), p_measurements, o_total, COALESCE(p_notes, ''));

  INSERT INTO order_addons (order_id, addon_name, price)
  SELECT LAST_INSERT_ID(), a.name, a.price_delta
    FROM design_addons a
    JOIN JSON_TABLE(COALESCE(p_addons, JSON_ARRAY()), '$[*]' COLUMNS (n VARCHAR(50) PATH '$')) j ON j.n = a.name
   WHERE a.design_id = v_design;

  COMMIT;
END$$

-- -----------------------------------------------------------------------------
--  sp_set_order_status : move an order through its lifecycle.
--  Restoring a cancelled order re-checks the city limit and, if its old
--  number was taken meanwhile, gives it the next free number.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_set_order_status(IN p_order_id INT UNSIGNED, IN p_status VARCHAR(12))
BEGIN
  DECLARE v_old VARCHAR(12); DECLARE v_design INT UNSIGNED; DECLARE v_loc SMALLINT UNSIGNED;
  DECLARE v_piece SMALLINT UNSIGNED; DECLARE v_limit SMALLINT UNSIGNED; DECLARE v_used INT;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_status NOT IN ('new','confirmed','in_making','shipped','delivered','cancelled') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid order status.';
  END IF;

  START TRANSACTION;
  SELECT status, design_id, location_id, edition_no INTO v_old, v_design, v_loc, v_piece
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_old IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found.'; END IF;

  IF v_old = 'cancelled' AND p_status <> 'cancelled' AND v_design IS NOT NULL THEN
    SELECT piece_limit INTO v_limit FROM design_editions WHERE design_id = v_design AND location_id = v_loc FOR UPDATE;
    SELECT COUNT(*) INTO v_used FROM orders
     WHERE design_id = v_design AND location_id = v_loc AND status <> 'cancelled';
    IF v_limit IS NULL OR v_used >= v_limit THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That city''s edition is full - this order cannot be restored.';
    END IF;
    IF EXISTS (SELECT 1 FROM orders WHERE design_id = v_design AND location_id = v_loc
                AND status <> 'cancelled' AND edition_no = v_piece) THEN
      SET SESSION cte_max_recursion_depth = GREATEST(1000, v_limit + v_used + 2);
      WITH RECURSIVE seq (num) AS (SELECT 1 UNION ALL SELECT num + 1 FROM seq WHERE num < v_limit + v_used + 1)
      SELECT MIN(seq.num) INTO v_piece FROM seq
        LEFT JOIN orders o ON o.design_id = v_design AND o.location_id = v_loc
                          AND o.status <> 'cancelled' AND o.edition_no = seq.num
       WHERE o.id IS NULL;
    END IF;
  END IF;

  UPDATE orders SET status = p_status, edition_no = v_piece WHERE id = p_order_id;
  COMMIT;
END$$

-- -----------------------------------------------------------------------------
--  sp_create_look : store a Design Lobby commission ("edition of one").
--  The estimate is always recomputed here, never trusted from the browser.
--
--  CALL sp_create_look(JSON_OBJECT('sil','anarkali','fab','georgette','col','#b0245a','acc','#c9a05a',
--       'neck','sweetheart','slv','elbow','len','floor','emb',JSON_ARRAY('gota'),'dup','none',
--       'belt',FALSE,'lining',TRUE,'pockets',FALSE,'skin','#c98e66'),
--       'Asha Rao','9876543210','Hyderabad','Sangeet in March', @ref, @estimate);
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_create_look(
  IN  p_look     JSON,
  IN  p_name     VARCHAR(80),
  IN  p_mobile   CHAR(10),
  IN  p_location VARCHAR(40),
  IN  p_notes    VARCHAR(500),
  OUT o_ref      VARCHAR(12),
  OUT o_estimate INT UNSIGNED)
BEGIN
  DECLARE v_loc SMALLINT UNSIGNED; DECLARE v_customer INT UNSIGNED; DECLARE v_id INT UNSIGNED;
  DECLARE v_sil VARCHAR(24) DEFAULT JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.sil'));
  DECLARE v_len VARCHAR(24) DEFAULT JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.len'));
  DECLARE v_dup VARCHAR(12) DEFAULT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.dup')), 'none');
  DECLARE v_belt_ok TINYINT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET o_estimate = fn_lobby_estimate(p_look);
  IF o_estimate IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One of the chosen options is not available right now.';
  END IF;
  SELECT id INTO v_loc FROM locations WHERE name = p_location AND is_active = 1;
  IF v_loc IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Please choose your city.'; END IF;

  IF v_sil = 'saree' THEN SET v_len = 'floor', v_dup = 'none';
  ELSEIF v_sil = 'lehenga' AND v_len IN ('knee','midi') THEN SET v_len = 'ankle';
  END IF;
  SELECT allows_belt INTO v_belt_ok FROM lobby_silhouettes WHERE silhouette_key = v_sil;

  START TRANSACTION;
  INSERT INTO customers (mobile, name, location_id) VALUES (p_mobile, p_name, v_loc) AS new
  ON DUPLICATE KEY UPDATE name = new.name;
  SELECT id INTO v_customer FROM customers WHERE mobile = p_mobile;

  ref_loop: LOOP
    SET o_ref = fn_make_ref('UQ-C', 5);
    IF NOT EXISTS (SELECT 1 FROM looks WHERE ref = o_ref) THEN LEAVE ref_loop; END IF;
  END LOOP;

  INSERT INTO looks (ref, customer_id, customer_name, mobile, location_id, silhouette_key, fabric_key, neckline_key,
                     sleeve_key, length_key, main_hex, trim_hex, dupatta, has_belt, has_lining, has_pockets, skin,
                     look_json, estimate, notes)
  VALUES (o_ref, v_customer, p_name, p_mobile, v_loc, v_sil,
          JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.fab')), JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.neck')),
          JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.slv')), v_len,
          JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.col')), JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.acc')),
          v_dup,
          v_belt_ok AND COALESCE(JSON_EXTRACT(p_look, '$.belt') = CAST('true' AS JSON), 0),
          COALESCE(JSON_EXTRACT(p_look, '$.lining') = CAST('true' AS JSON), 0),
          v_belt_ok AND COALESCE(JSON_EXTRACT(p_look, '$.pockets') = CAST('true' AS JSON), 0),
          COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_look, '$.skin')), '#c98e66'),
          p_look, o_estimate, COALESCE(p_notes, ''));
  SET v_id = LAST_INSERT_ID();

  INSERT INTO look_embellishments (look_id, emb_key)
  SELECT DISTINCT v_id, e.emb_key
    FROM lobby_embellishments e
    JOIN JSON_TABLE(COALESCE(JSON_EXTRACT(p_look, '$.emb'), JSON_ARRAY()), '$[*]' COLUMNS (k VARCHAR(24) PATH '$')) j ON j.k = e.emb_key
   WHERE e.is_enabled = 1;
  COMMIT;
END$$

DELIMITER ;
