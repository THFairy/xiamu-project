-- Run while miniprogram-backend.service is stopped.
-- This migration preserves all rows and only reassigns primary keys.

SET @id_offset = 1000000000;
SET @previous_fk_checks = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

START TRANSACTION;

CREATE TEMPORARY TABLE tmp_product_image_ids (
  old_id BIGINT NOT NULL PRIMARY KEY,
  new_id BIGINT NOT NULL UNIQUE
);
INSERT INTO tmp_product_image_ids (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)
FROM product_images;

CREATE TEMPORARY TABLE tmp_recycle_product_ids (
  old_id BIGINT NOT NULL PRIMARY KEY,
  new_id BIGINT NOT NULL UNIQUE
);
INSERT INTO tmp_recycle_product_ids (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)
FROM recycle_products;

CREATE TEMPORARY TABLE tmp_recycle_option_group_ids (
  old_id BIGINT NOT NULL PRIMARY KEY,
  new_id BIGINT NOT NULL UNIQUE
);
INSERT INTO tmp_recycle_option_group_ids (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)
FROM recycle_option_groups;

CREATE TEMPORARY TABLE tmp_recycle_option_item_ids (
  old_id BIGINT NOT NULL PRIMARY KEY,
  new_id BIGINT NOT NULL UNIQUE
);
INSERT INTO tmp_recycle_option_item_ids (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)
FROM recycle_option_items;

CREATE TEMPORARY TABLE tmp_superadmin_key_ids (
  old_id BIGINT NOT NULL PRIMARY KEY,
  new_id BIGINT NOT NULL UNIQUE
);
INSERT INTO tmp_superadmin_key_ids (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC)
FROM superadmin_key;

UPDATE product_images
SET id = id + @id_offset;
UPDATE product_images AS image_row
JOIN tmp_product_image_ids AS id_map
  ON image_row.id = id_map.old_id + @id_offset
SET image_row.id = id_map.new_id;

UPDATE recycle_option_items
SET id = id + @id_offset,
    group_id = group_id + @id_offset;
UPDATE recycle_option_groups
SET id = id + @id_offset;
UPDATE recycle_option_groups AS group_row
JOIN tmp_recycle_option_group_ids AS id_map
  ON group_row.id = id_map.old_id + @id_offset
SET group_row.id = id_map.new_id;
UPDATE recycle_option_items AS item_row
JOIN tmp_recycle_option_group_ids AS id_map
  ON item_row.group_id = id_map.old_id + @id_offset
SET item_row.group_id = id_map.new_id;
UPDATE recycle_option_items AS item_row
JOIN tmp_recycle_option_item_ids AS id_map
  ON item_row.id = id_map.old_id + @id_offset
SET item_row.id = id_map.new_id;

UPDATE recycle_products
SET id = id + @id_offset;
UPDATE products AS product_row
JOIN tmp_recycle_product_ids AS id_map
  ON product_row.recycle_target_category_key = CAST(id_map.old_id AS CHAR)
SET product_row.recycle_target_category_key = CAST(id_map.new_id AS CHAR);
UPDATE recycle_orders AS order_row
JOIN tmp_recycle_product_ids AS id_map
  ON order_row.recycle_product_id = id_map.old_id
SET order_row.recycle_product_id = id_map.new_id;
UPDATE recycle_products AS recycle_product_row
JOIN tmp_recycle_product_ids AS id_map
  ON recycle_product_row.id = id_map.old_id + @id_offset
SET recycle_product_row.id = id_map.new_id;

UPDATE superadmin_key
SET id = id + @id_offset;
UPDATE superadmin_key AS key_row
JOIN tmp_superadmin_key_ids AS id_map
  ON key_row.id = id_map.old_id + @id_offset
SET key_row.id = id_map.new_id;

SET FOREIGN_KEY_CHECKS = @previous_fk_checks;
COMMIT;

ALTER TABLE products AUTO_INCREMENT = 20;
ALTER TABLE product_images AUTO_INCREMENT = 44;
ALTER TABLE recycle_products AUTO_INCREMENT = 2;
ALTER TABLE recycle_option_groups AUTO_INCREMENT = 2;
ALTER TABLE recycle_option_items AUTO_INCREMENT = 3;
ALTER TABLE superadmin_key AUTO_INCREMENT = 3;

SELECT 'product_images' AS table_name, COUNT(*) AS row_count, MIN(id) AS min_id, MAX(id) AS max_id
FROM product_images
UNION ALL
SELECT 'recycle_products', COUNT(*), MIN(id), MAX(id)
FROM recycle_products
UNION ALL
SELECT 'recycle_option_groups', COUNT(*), MIN(id), MAX(id)
FROM recycle_option_groups
UNION ALL
SELECT 'recycle_option_items', COUNT(*), MIN(id), MAX(id)
FROM recycle_option_items
UNION ALL
SELECT 'superadmin_key', COUNT(*), MIN(id), MAX(id)
FROM superadmin_key;

SELECT COUNT(*) AS orphan_product_images
FROM product_images AS image_row
LEFT JOIN products AS product_row ON product_row.id = image_row.product_id
WHERE product_row.id IS NULL;

SELECT COUNT(*) AS orphan_recycle_option_items
FROM recycle_option_items AS item_row
LEFT JOIN recycle_option_groups AS group_row ON group_row.id = item_row.group_id
WHERE group_row.id IS NULL;
