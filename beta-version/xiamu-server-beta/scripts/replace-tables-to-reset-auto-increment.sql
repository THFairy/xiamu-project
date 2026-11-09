-- Run as the local MySQL administrator while miniprogram-backend.service is stopped.
-- Every original row is copied before the original table definition is removed.

CREATE TABLE product_images_id_reset_copy LIKE product_images;
CREATE TABLE recycle_products_id_reset_copy LIKE recycle_products;
CREATE TABLE recycle_option_groups_id_reset_copy LIKE recycle_option_groups;
CREATE TABLE recycle_option_items_id_reset_copy LIKE recycle_option_items;
CREATE TABLE superadmin_key_id_reset_copy LIKE superadmin_key;

INSERT INTO product_images_id_reset_copy (
  id, source_key, product_id, image_type, image_url, sort_order, is_main,
  status, is_deleted, created_at, updated_at
)
SELECT
  id, source_key, product_id, image_type, image_url, sort_order, is_main,
  status, is_deleted, created_at, updated_at
FROM product_images;

INSERT INTO recycle_products_id_reset_copy (
  id, source_key, product_id, category_key, option_profile_key, title, subtitle,
  cover_label, cover_image, cover_theme, max_recycle_price, hint_text, quote_mode,
  pricing_rule_json, status, sort_order, created_at, updated_at
)
SELECT
  id, source_key, product_id, category_key, option_profile_key, title, subtitle,
  cover_label, cover_image, cover_theme, max_recycle_price, hint_text, quote_mode,
  pricing_rule_json, status, sort_order, created_at, updated_at
FROM recycle_products;

INSERT INTO recycle_option_groups_id_reset_copy (
  id, source_key, profile_key, option_key, label, is_required, sort_order,
  status, created_at, updated_at
)
SELECT
  id, source_key, profile_key, option_key, label, is_required, sort_order,
  status, created_at, updated_at
FROM recycle_option_groups;

INSERT INTO recycle_option_items_id_reset_copy (
  id, group_id, source_key, item_value, item_label, effect_type, price_delta,
  note_text, image_urls, sort_order, status, created_at, updated_at
)
SELECT
  id, group_id, source_key, item_value, item_label, effect_type, price_delta,
  note_text, image_urls, sort_order, status, created_at, updated_at
FROM recycle_option_items;

INSERT INTO superadmin_key_id_reset_copy (
  id, staff_id, username, password_hash, created_at, updated_at
)
SELECT
  id, staff_id, username, password_hash, created_at, updated_at
FROM superadmin_key;

ALTER TABLE recycle_option_items
  DROP FOREIGN KEY fk_recycle_option_items_group_id;
ALTER TABLE product_images
  DROP FOREIGN KEY fk_product_images_product_id;

DROP TABLE product_images;
DROP TABLE recycle_option_items;
DROP TABLE recycle_option_groups;
DROP TABLE recycle_products;
DROP TABLE superadmin_key;

FLUSH TABLES;

RENAME TABLE
  product_images_id_reset_copy TO product_images,
  recycle_products_id_reset_copy TO recycle_products,
  recycle_option_groups_id_reset_copy TO recycle_option_groups,
  recycle_option_items_id_reset_copy TO recycle_option_items,
  superadmin_key_id_reset_copy TO superadmin_key;

ALTER TABLE product_images
  ADD CONSTRAINT fk_product_images_product_id
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE CASCADE;
ALTER TABLE recycle_option_items
  ADD CONSTRAINT fk_recycle_option_items_group_id
  FOREIGN KEY (group_id) REFERENCES recycle_option_groups(id)
  ON DELETE CASCADE;

SHOW TABLE STATUS
WHERE Name IN (
  'product_images',
  'recycle_products',
  'recycle_option_groups',
  'recycle_option_items',
  'superadmin_key'
);
