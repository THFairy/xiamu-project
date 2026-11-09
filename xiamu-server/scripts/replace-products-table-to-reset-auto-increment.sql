-- Run as the local MySQL administrator while miniprogram-backend.service is stopped.
-- Products are copied before replacing the table definition; all inbound foreign keys are restored below.

CREATE TABLE products_id_reset_copy LIKE products;

SET SESSION group_concat_max_len = 65535;
SELECT GROUP_CONCAT(CONCAT('`', column_name, '`') ORDER BY ordinal_position SEPARATOR ', ')
INTO @product_columns
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'products'
  AND extra NOT LIKE '%GENERATED%';
SET @copy_products_sql = CONCAT(
  'INSERT INTO products_id_reset_copy (', @product_columns, ') SELECT ', @product_columns, ' FROM products'
);
PREPARE copy_products_statement FROM @copy_products_sql;
EXECUTE copy_products_statement;
DEALLOCATE PREPARE copy_products_statement;

ALTER TABLE product_comments
  DROP FOREIGN KEY fk_product_comments_product_id;
ALTER TABLE product_images
  DROP FOREIGN KEY fk_product_images_product_id;
ALTER TABLE purchase_orders
  DROP FOREIGN KEY fk_purchase_orders_product_id;
ALTER TABLE recycle_orders
  DROP FOREIGN KEY fk_recycle_orders_product_id;

DROP TABLE products;
FLUSH TABLES;
RENAME TABLE products_id_reset_copy TO products;

ALTER TABLE product_comments
  ADD CONSTRAINT fk_product_comments_product_id
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE CASCADE;
ALTER TABLE product_images
  ADD CONSTRAINT fk_product_images_product_id
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE CASCADE;
ALTER TABLE purchase_orders
  ADD CONSTRAINT fk_purchase_orders_product_id
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE RESTRICT;
ALTER TABLE recycle_orders
  ADD CONSTRAINT fk_recycle_orders_product_id
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE SET NULL;

SHOW TABLE STATUS WHERE Name = 'products';
