// 用途：回收配置后台数据访问与选项组、选项管理逻辑。
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'miniprogram_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
};

let pool;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }

  return pool;
};

const createRecycleProductsTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_products (
    id BIGINT NOT NULL AUTO_INCREMENT,
    source_key VARCHAR(64) NOT NULL,
    product_id BIGINT DEFAULT NULL,
    category_key VARCHAR(32) NOT NULL DEFAULT '',
    option_profile_key VARCHAR(64) NOT NULL DEFAULT '',
    title VARCHAR(128) NOT NULL DEFAULT '',
    subtitle VARCHAR(255) NOT NULL DEFAULT '',
    cover_label VARCHAR(64) NOT NULL DEFAULT '',
    cover_image VARCHAR(1024) NOT NULL DEFAULT '',
    cover_theme VARCHAR(16) NOT NULL DEFAULT 'red',
    max_recycle_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    hint_text VARCHAR(64) NOT NULL DEFAULT '',
    quote_mode VARCHAR(32) NOT NULL DEFAULT 'rule_based',
    pricing_rule_json JSON DEFAULT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_recycle_products_source_key (source_key),
    KEY idx_recycle_products_category_status (category_key, status, sort_order),
    KEY idx_recycle_products_profile (option_profile_key),
    KEY idx_recycle_products_product_id (product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleOptionGroupsTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_option_groups (
    id BIGINT NOT NULL AUTO_INCREMENT,
    source_key VARCHAR(96) NOT NULL,
    profile_key VARCHAR(64) NOT NULL DEFAULT '',
    option_key VARCHAR(128) NOT NULL DEFAULT '',
    label VARCHAR(64) NOT NULL DEFAULT '',
    is_required TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_recycle_option_groups_source_key (source_key),
    KEY idx_recycle_option_groups_profile (profile_key, status, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleOptionItemsTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_option_items (
    id BIGINT NOT NULL AUTO_INCREMENT,
    group_id BIGINT NOT NULL,
    source_key VARCHAR(128) NOT NULL,
    item_value VARCHAR(128) NOT NULL DEFAULT '',
    sequence_no INT NOT NULL DEFAULT 0,
    item_label VARCHAR(128) NOT NULL DEFAULT '',
    effect_type VARCHAR(32) NOT NULL DEFAULT 'none',
    price_delta DECIMAL(10, 2) NOT NULL DEFAULT 0,
    note_text VARCHAR(255) NOT NULL DEFAULT '',
    image_urls JSON DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_recycle_option_items_source_key (source_key),
    KEY idx_recycle_option_items_group (group_id, status, sort_order),
    CONSTRAINT fk_recycle_option_items_group_id
      FOREIGN KEY (group_id) REFERENCES recycle_option_groups(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleOptionItemSequencesTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_option_item_sequences (
    group_id BIGINT NOT NULL,
    current_value INT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id),
    CONSTRAINT fk_recycle_option_item_sequences_group_id
      FOREIGN KEY (group_id) REFERENCES recycle_option_groups(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const toNumber = (value, fallback = 0) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
};

const toInteger = (value, fallback = 0) => Math.trunc(toNumber(value, fallback));

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const normalizeText = (value, fallback = '') => String(value || fallback).trim();

const buildRecycleOptionValue = (groupLabel, sequence) => `${normalizeText(groupLabel)}${Math.max(1, toInteger(sequence, 1))}`;

const safeParseJsonObject = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const safeParseJsonArray = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
};

const ensureColumn = async ({ tableName, name, definition }) => {
  const [rows] = await getPool().execute(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1
    `,
    [tableName, name]
  );

  if (!rows.length) {
    await getPool().query(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
  }
};

const ensureVarcharColumnLength = async ({ tableName, name, length }) => {
  const [rows] = await getPool().execute(
    `
      SELECT character_maximum_length AS maximum_length
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1
    `,
    [tableName, name]
  );

  if (Number(rows[0]?.maximum_length || 0) < Number(length || 0)) {
    await getPool().query(`ALTER TABLE ${tableName} MODIFY COLUMN ${name} VARCHAR(${Number(length)}) NOT NULL DEFAULT ''`);
  }
};

const parsePricingRuleJson = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('规则 JSON 格式不正确');
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('规则 JSON 必须是对象');
    }
    return parsed;
  } catch (error) {
    throw new Error(error && error.message ? error.message : '规则 JSON 格式不正确');
  }
};

const buildSourceKey = (prefix) => `${prefix}:${crypto.randomBytes(6).toString('hex')}`;

const normalizeCoverTheme = (value) => {
  const normalized = normalizeText(value, 'red').toLowerCase();
  if (['red', 'blue', 'gray', 'green'].includes(normalized)) {
    return normalized;
  }
  return 'red';
};

const normalizeQuoteMode = (value) => {
  const normalized = normalizeText(value, 'rule_based').toLowerCase();
  if (normalized === 'manual') {
    return 'manual';
  }
  return 'rule_based';
};

const normalizeEffectType = (value) => {
  const normalized = normalizeText(value, 'none').toLowerCase();
  if (['none', 'accessory', 'issue', 'block'].includes(normalized)) {
    return normalized;
  }
  return 'none';
};

const normalizeImageUrls = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return safeParseJsonArray(value);
  }

  return [];
};

const countEnabledRecycleOptionItems = async (profileKey) => {
  const normalizedProfileKey = normalizeText(profileKey);
  if (!normalizedProfileKey) {
    return 0;
  }

  const [[row]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM recycle_option_groups g
      INNER JOIN recycle_option_items i ON i.group_id = g.id
      WHERE g.profile_key = ? AND g.status = 1 AND i.status = 1
    `,
    [normalizedProfileKey]
  );

  return Number(row?.totalCount || 0);
};

const assertRecycleProductCanEnable = async (profileKey) => {
  const enabledOptionCount = await countEnabledRecycleOptionItems(profileKey);
  if (enabledOptionCount < 1) {
    throw new Error('请先至少添加一个启用的回收选项，才能启用该回收商品');
  }
};

const disableRecycleProductsWithoutEnabledOptions = async (profileKey) => {
  const normalizedProfileKey = normalizeText(profileKey);
  if (!normalizedProfileKey) {
    return;
  }

  const enabledOptionCount = await countEnabledRecycleOptionItems(normalizedProfileKey);
  if (enabledOptionCount > 0) {
    return;
  }

  await getPool().execute(
    'UPDATE recycle_products SET status = 0, updated_at = ? WHERE option_profile_key = ? AND status = 1',
    [Date.now(), normalizedProfileKey]
  );
};

const mapRecycleProductRow = (row) => ({
  id: Number(row.id || 0),
  sourceKey: String(row.source_key || ''),
  productId: row.product_id === null || row.product_id === undefined ? null : Number(row.product_id || 0),
  categoryKey: String(row.category_key || ''),
  categoryName: String(row.category_name || ''),
  optionProfileKey: String(row.option_profile_key || ''),
  title: String(row.title || ''),
  subtitle: String(row.subtitle || ''),
  coverLabel: String(row.cover_label || ''),
  coverImage: String(row.cover_image || ''),
  coverTheme: normalizeCoverTheme(row.cover_theme),
  maxRecyclePrice: Number(row.max_recycle_price || 0),
  hintText: String(row.hint_text || ''),
  quoteMode: String(row.quote_mode || 'rule_based'),
  pricingRuleJson: safeParseJsonObject(row.pricing_rule_json),
  status: Number(row.status || 0),
  sortOrder: Number(row.sort_order || 0),
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
});

const mapRecycleOptionGroupRow = (row) => ({
  id: Number(row.id || 0),
  sourceKey: String(row.source_key || ''),
  profileKey: String(row.profile_key || ''),
  key: String(row.option_key || ''),
  label: String(row.label || ''),
  required: Boolean(row.is_required),
  sortOrder: Number(row.sort_order || 0),
  status: Number(row.status || 0),
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
});

const mapRecycleOptionItemRow = (row) => ({
  id: Number(row.id || 0),
  groupId: Number(row.group_id || 0),
  sourceKey: String(row.source_key || ''),
  value: String(row.item_value || ''),
  label: String(row.item_label || ''),
  effectType: String(row.effect_type || 'none'),
  priceDelta: Number(row.price_delta || 0),
  noteText: String(row.note_text || ''),
  imageUrls: safeParseJsonArray(row.image_urls),
  sortOrder: Number(row.sort_order || 0),
  status: Number(row.status || 0),
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
});

const cleanupOrphanedRecycleOptionConfigs = async (executor = getPool()) => {
  // Option groups are owned by a recycle product profile. Remove their items first
  // so this also repairs databases created before the foreign key was available.
  await executor.query(`
    DELETE i
    FROM recycle_option_items i
    INNER JOIN recycle_option_groups g ON g.id = i.group_id
    LEFT JOIN recycle_products p ON p.option_profile_key = g.profile_key
    WHERE p.id IS NULL
  `);

  const [result] = await executor.query(`
    DELETE g
    FROM recycle_option_groups g
    LEFT JOIN recycle_products p ON p.option_profile_key = g.profile_key
    WHERE p.id IS NULL
  `);

  return Number(result.affectedRows || 0);
};

const assertRecycleOptionGroupLabelAvailable = async (executor, profileKey, label, excludedGroupId = 0) => {
  const [rows] = await executor.execute(
    `
      SELECT id
      FROM recycle_option_groups
      WHERE profile_key = ? AND label = ? AND id <> ?
      LIMIT 1
    `,
    [normalizeText(profileKey), normalizeText(label), Number(excludedGroupId || 0)]
  );

  if (rows.length) {
    throw new Error('同一回收商品内的选项组名称不能重复');
  }
};

const getNextRecycleOptionItemSequence = async (connection, groupId) => {
  const now = Date.now();
  const [result] = await connection.execute(
    `
      INSERT INTO recycle_option_item_sequences (group_id, current_value, updated_at)
      VALUES (?, 1, ?)
      ON DUPLICATE KEY UPDATE
        current_value = LAST_INSERT_ID(current_value + 1),
        updated_at = VALUES(updated_at)
    `,
    [Number(groupId || 0), now]
  );

  return Number(result.insertId || 0) || 1;
};

const backfillRecycleOptionIdentifiers = async () => {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [groups] = await connection.execute(
      `
        SELECT id, profile_key, label
        FROM recycle_option_groups
        ORDER BY id ASC
        FOR UPDATE
      `
    );

    for (const group of groups) {
      const groupId = Number(group.id || 0);
      const profileKey = normalizeText(group.profile_key);
      const label = normalizeText(group.label);

      if (!label) {
        throw new Error(`选项组 ${groupId} 的显示名称不能为空`);
      }

      await assertRecycleOptionGroupLabelAvailable(connection, profileKey, label, groupId);
      await connection.execute('UPDATE recycle_option_groups SET option_key = ? WHERE id = ?', [label, groupId]);

      const [items] = await connection.execute(
        `
          SELECT id, sequence_no
          FROM recycle_option_items
          WHERE group_id = ?
          ORDER BY sort_order ASC, id ASC
          FOR UPDATE
        `,
        [groupId]
      );

      let nextSequence = items.reduce((maximum, item) => Math.max(maximum, Number(item.sequence_no || 0)), 0);
      for (const item of items) {
        let sequence = Number(item.sequence_no || 0);
        if (sequence < 1) {
          nextSequence += 1;
          sequence = nextSequence;
          await connection.execute('UPDATE recycle_option_items SET sequence_no = ? WHERE id = ?', [sequence, item.id]);
        }

        await connection.execute('UPDATE recycle_option_items SET item_value = ? WHERE id = ?', [
          buildRecycleOptionValue(label, sequence),
          item.id,
        ]);
      }

      await connection.execute(
        `
          INSERT INTO recycle_option_item_sequences (group_id, current_value, updated_at)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            current_value = GREATEST(current_value, VALUES(current_value)),
            updated_at = VALUES(updated_at)
        `,
        [groupId, nextSequence, Date.now()]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const initRecycleAdminDatabase = async () => {
  await getPool().query(createRecycleProductsTableSql);
  await getPool().query(createRecycleOptionGroupsTableSql);
  await getPool().query(createRecycleOptionItemsTableSql);
  await getPool().query(createRecycleOptionItemSequencesTableSql);
  await ensureVarcharColumnLength({
    tableName: 'recycle_option_groups',
    name: 'option_key',
    length: 128,
  });
  await ensureVarcharColumnLength({
    tableName: 'recycle_option_items',
    name: 'item_value',
    length: 128,
  });
  await ensureColumn({
    tableName: 'recycle_option_items',
    name: 'sequence_no',
    definition: 'INT NOT NULL DEFAULT 0 AFTER item_value',
  });
  await ensureColumn({
    tableName: 'recycle_products',
    name: 'cover_image',
    definition: "VARCHAR(1024) NOT NULL DEFAULT '' AFTER cover_label",
  });
  await ensureColumn({
    tableName: 'recycle_option_items',
    name: 'image_urls',
    definition: 'JSON DEFAULT NULL AFTER note_text',
  });
  await backfillRecycleOptionIdentifiers();
  await cleanupOrphanedRecycleOptionConfigs();
};

const listAdminRecycleProfiles = async () => {
  const [rows] = await getPool().query(
    `
      SELECT DISTINCT option_profile_key AS profile_key
      FROM recycle_products
      WHERE option_profile_key <> ''
      ORDER BY option_profile_key ASC
    `
  );

  return rows.map((row) => String(row.profile_key || '')).filter(Boolean);
};

const listAdminRecycleProducts = async ({
  page = 1,
  limit = 10,
  title = '',
  categoryKey = '',
  profileKey = '',
} = {}) => {
  const currentPage = Math.max(1, toInteger(page, 1));
  const pageSize = Math.max(1, toInteger(limit, 10));
  const offset = (currentPage - 1) * pageSize;
  const filters = ['1 = 1'];
  const params = [];

  if (normalizeText(title)) {
    filters.push('(p.title LIKE ? OR p.subtitle LIKE ? OR p.cover_label LIKE ?)');
    const keyword = `%${normalizeText(title)}%`;
    params.push(keyword, keyword, keyword);
  }

  if (normalizeText(categoryKey)) {
    filters.push('p.category_key = ?');
    params.push(normalizeText(categoryKey));
  }

  if (normalizeText(profileKey)) {
    filters.push('p.option_profile_key = ?');
    params.push(normalizeText(profileKey));
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM recycle_products p
      WHERE ${whereSql}
    `,
    params
  );

  const [rows] = await getPool().execute(
    `
      SELECT p.*, c.name AS category_name
      FROM recycle_products p
      LEFT JOIN admin_categories c
        ON c.category_key = p.category_key AND c.scene = 'recycle'
      WHERE ${whereSql}
      ORDER BY p.sort_order ASC, p.id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    params
  );

  return {
    list: rows.map(mapRecycleProductRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const getRecycleProductById = async (id) => {
  const recycleProductId = Number(id || 0);
  if (!recycleProductId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT p.*, c.name AS category_name
      FROM recycle_products p
      LEFT JOIN admin_categories c
        ON c.category_key = p.category_key AND c.scene = 'recycle'
      WHERE p.id = ?
      LIMIT 1
    `,
    [recycleProductId]
  );
  return rows.length ? mapRecycleProductRow(rows[0]) : null;
};

const buildRecycleProductProfileKey = (id) => `recycle-product-${Number(id || 0)}`;

const resolveRecycleOptionProfileKey = async (payload = {}, fallbackProfileKey = '') => {
  if (payload.productId !== undefined) {
    const product = await getRecycleProductById(payload.productId);
    if (!product) {
      throw new Error('回收商品不存在');
    }
    if (!product.optionProfileKey) {
      throw new Error('回收商品尚未初始化选项配置');
    }
    return product.optionProfileKey;
  }

  return normalizeText(fallbackProfileKey);
};

const createAdminRecycleProduct = async (payload = {}) => {
  const now = Date.now();
  const title = normalizeText(payload.title);

  if (!title) {
    throw new Error('回收商品名称不能为空');
  }

  const nextStatus = 0;
  // The profile key is assigned after insert so it is stable and tied to this product ID.
  const optionProfileKey = '';

  const pricingRuleJson = parsePricingRuleJson(payload.pricingRuleJson);

  const [result] = await getPool().execute(
    `
      INSERT INTO recycle_products (
        source_key, product_id, category_key, option_profile_key, title, subtitle, cover_label, cover_image, cover_theme,
        max_recycle_price, hint_text, quote_mode, pricing_rule_json, status, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeText(payload.sourceKey) || buildSourceKey('recycle-product'),
      payload.productId !== undefined && payload.productId !== null && String(payload.productId).trim() !== ''
        ? toInteger(payload.productId, 0)
        : null,
      normalizeText(payload.categoryKey, 'others'),
      optionProfileKey,
      title,
      normalizeText(payload.subtitle),
      normalizeText(payload.coverLabel),
      normalizeText(payload.coverImage),
      normalizeCoverTheme(payload.coverTheme),
      Math.max(0, toNumber(payload.maxRecyclePrice, 0)),
      normalizeText(payload.hintText),
      normalizeQuoteMode(payload.quoteMode),
      JSON.stringify(pricingRuleJson),
      0,
      toInteger(payload.sortOrder, 0),
      now,
      now,
    ]
  );

  const generatedProfileKey = buildRecycleProductProfileKey(result.insertId);
  await getPool().execute(
    'UPDATE recycle_products SET option_profile_key = ?, status = ? WHERE id = ?',
    [generatedProfileKey, nextStatus, result.insertId]
  );

  return getRecycleProductById(result.insertId);
};

const updateAdminRecycleProduct = async (id, payload = {}) => {
  const recycleProductId = Number(id || 0);
  if (!recycleProductId) {
    return null;
  }

  const current = await getRecycleProductById(recycleProductId);
  if (!current) {
    return null;
  }

  const nextTitle = payload.title !== undefined ? normalizeText(payload.title) : current.title;
  const nextProfileKey = current.optionProfileKey;

  if (!nextTitle) {
    throw new Error('回收商品名称不能为空');
  }

  if (!nextProfileKey) {
    throw new Error('选项配置标识不能为空');
  }

  const nextStatus = payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : current.status;
  if (nextStatus === 1) {
    await assertRecycleProductCanEnable(nextProfileKey);
  }

  const pricingRuleJson =
    payload.pricingRuleJson !== undefined
      ? parsePricingRuleJson(payload.pricingRuleJson)
      : current.pricingRuleJson;

  await getPool().execute(
    `
      UPDATE recycle_products
      SET
        product_id = ?, category_key = ?, option_profile_key = ?, title = ?, subtitle = ?, cover_label = ?,
        cover_image = ?, cover_theme = ?, max_recycle_price = ?, hint_text = ?, quote_mode = ?, pricing_rule_json = ?, status = ?,
        sort_order = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      payload.productId !== undefined
        ? (payload.productId === null || String(payload.productId).trim() === '' ? null : toInteger(payload.productId, 0))
        : current.productId,
      payload.categoryKey !== undefined ? normalizeText(payload.categoryKey, 'others') : current.categoryKey,
      nextProfileKey,
      nextTitle,
      payload.subtitle !== undefined ? normalizeText(payload.subtitle) : current.subtitle,
      payload.coverLabel !== undefined ? normalizeText(payload.coverLabel) : current.coverLabel,
      payload.coverImage !== undefined ? normalizeText(payload.coverImage) : current.coverImage,
      payload.coverTheme !== undefined ? normalizeCoverTheme(payload.coverTheme) : current.coverTheme,
      payload.maxRecyclePrice !== undefined ? Math.max(0, toNumber(payload.maxRecyclePrice, 0)) : current.maxRecyclePrice,
      payload.hintText !== undefined ? normalizeText(payload.hintText) : current.hintText,
      payload.quoteMode !== undefined ? normalizeQuoteMode(payload.quoteMode) : current.quoteMode,
      JSON.stringify(pricingRuleJson),
      nextStatus,
      payload.sortOrder !== undefined ? toInteger(payload.sortOrder, 0) : current.sortOrder,
      Date.now(),
      recycleProductId,
    ]
  );

  return getRecycleProductById(recycleProductId);
};

const updateAdminRecycleProductStatus = async (id, status) => {
  return updateAdminRecycleProduct(id, {
    status,
  });
};

const deleteAdminRecycleProducts = async (ids = []) => {
  const normalizedIds = Array.from(
    new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item || 0)).filter((item) => item > 0))
  );

  if (!normalizedIds.length) {
    return 0;
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const [result] = await connection.execute(`DELETE FROM recycle_products WHERE id IN (${placeholders})`, normalizedIds);
    await cleanupOrphanedRecycleOptionConfigs(connection);

    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const listAdminRecycleOptionGroups = async ({ profileKey = '', includeDisabled = true } = {}) => {
  const normalizedProfileKey = normalizeText(profileKey);
  if (!normalizedProfileKey) {
    return [];
  }

  const params = [normalizedProfileKey];
  let whereSql = 'profile_key = ?';

  if (!includeDisabled) {
    whereSql += ' AND status = 1';
  }

  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM recycle_option_groups
      WHERE ${whereSql}
      ORDER BY sort_order ASC, id ASC
    `,
    params
  );

  return rows.map(mapRecycleOptionGroupRow);
};

const getRecycleOptionGroupById = async (id) => {
  const groupId = Number(id || 0);
  if (!groupId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM recycle_option_groups WHERE id = ? LIMIT 1', [groupId]);
  return rows.length ? mapRecycleOptionGroupRow(rows[0]) : null;
};

const createAdminRecycleOptionGroup = async (payload = {}) => {
  const now = Date.now();
  const profileKey = await resolveRecycleOptionProfileKey(payload, payload.profileKey);
  const label = normalizeText(payload.label);

  if (!profileKey) {
    throw new Error('配置标识不能为空');
  }
  if (!label) {
    throw new Error('选项组名称不能为空');
  }

  await assertRecycleOptionGroupLabelAvailable(getPool(), profileKey, label);

  let sortOrder = toInteger(payload.sortOrder, 0);
  if (payload.sortOrder === undefined || sortOrder <= 0) {
    const [[sortRow]] = await getPool().execute(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM recycle_option_groups WHERE profile_key = ?',
      [profileKey]
    );
    sortOrder = Number(sortRow?.max_sort_order || 0) + 10;
  }

  const [result] = await getPool().execute(
    `
      INSERT INTO recycle_option_groups (
        source_key, profile_key, option_key, label, is_required, sort_order, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeText(payload.sourceKey) || buildSourceKey('recycle-group'),
      profileKey,
      label,
      label,
      toBoolean(payload.required, true) ? 1 : 0,
      sortOrder,
      toBoolean(payload.status, true) ? 1 : 0,
      now,
      now,
    ]
  );

  await disableRecycleProductsWithoutEnabledOptions(profileKey);
  return getRecycleOptionGroupById(result.insertId);
};

const updateAdminRecycleOptionGroup = async (id, payload = {}) => {
  const groupId = Number(id || 0);
  if (!groupId) {
    return null;
  }

  const current = await getRecycleOptionGroupById(groupId);
  if (!current) {
    return null;
  }

  const nextProfileKey = await resolveRecycleOptionProfileKey(payload, current.profileKey);
  const nextLabel = payload.label !== undefined ? normalizeText(payload.label) : current.label;

  if (!nextProfileKey) {
    throw new Error('配置标识不能为空');
  }
  if (payload.productId !== undefined && nextProfileKey !== current.profileKey) {
    throw new Error('选项组只能绑定当前回收商品');
  }
  if (!nextLabel) {
    throw new Error('选项组名称不能为空');
  }

  await assertRecycleOptionGroupLabelAvailable(getPool(), nextProfileKey, nextLabel, groupId);

  await getPool().execute(
    `
      UPDATE recycle_option_groups
      SET profile_key = ?, option_key = ?, label = ?, is_required = ?, sort_order = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      nextProfileKey,
      nextLabel,
      nextLabel,
      payload.required !== undefined ? (toBoolean(payload.required, true) ? 1 : 0) : (current.required ? 1 : 0),
      payload.sortOrder !== undefined ? toInteger(payload.sortOrder, 0) : current.sortOrder,
      payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : current.status,
      Date.now(),
      groupId,
    ]
  );

  if (nextLabel !== current.label) {
    await getPool().execute(
      'UPDATE recycle_option_items SET item_value = CONCAT(?, sequence_no), updated_at = ? WHERE group_id = ?',
      [nextLabel, Date.now(), groupId]
    );
  }

  await disableRecycleProductsWithoutEnabledOptions(current.profileKey);
  if (nextProfileKey !== current.profileKey) {
    await disableRecycleProductsWithoutEnabledOptions(nextProfileKey);
  }
  return getRecycleOptionGroupById(groupId);
};

const updateAdminRecycleOptionGroupStatus = async (id, status) => {
  return updateAdminRecycleOptionGroup(id, {
    status,
  });
};

const deleteAdminRecycleOptionGroup = async (id) => {
  const groupId = Number(id || 0);
  if (!groupId) {
    return 0;
  }

  const current = await getRecycleOptionGroupById(groupId);
  if (!current) {
    return 0;
  }

  const [result] = await getPool().execute('DELETE FROM recycle_option_groups WHERE id = ? LIMIT 1', [groupId]);
  await disableRecycleProductsWithoutEnabledOptions(current.profileKey);
  return Number(result.affectedRows || 0);
};

const deleteAdminRecycleOptionGroups = async (ids = []) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((item) => Number(item || 0)).filter((item) => item > 0)));
  if (!normalizedIds.length) {
    return 0;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = normalizedIds.map(() => '?').join(', ');
    const [groups] = await connection.execute(
      `SELECT DISTINCT profile_key FROM recycle_option_groups WHERE id IN (${placeholders})`,
      normalizedIds
    );
    const [result] = await connection.execute(
      `DELETE FROM recycle_option_groups WHERE id IN (${placeholders})`,
      normalizedIds
    );
    await connection.commit();
    for (const group of groups) {
      await disableRecycleProductsWithoutEnabledOptions(normalizeText(group.profile_key));
    }
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const reorderAdminRecycleOptionGroups = async ({ profileKey = '', groups = [] } = {}) => {
  const normalizedProfileKey = normalizeText(profileKey);
  const normalizedGroups = Array.isArray(groups)
    ? groups.map((item, index) => ({ id: Number(item?.id || 0), sortOrder: toInteger(item?.sortOrder, (index + 1) * 10) }))
      .filter((item) => item.id > 0)
    : [];
  if (!normalizedProfileKey || !normalizedGroups.length) {
    return [];
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = normalizedGroups.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id FROM recycle_option_groups WHERE profile_key = ? AND id IN (${placeholders})`,
      [normalizedProfileKey, ...normalizedGroups.map((item) => item.id)]
    );
    if (rows.length !== normalizedGroups.length) {
      throw new Error('选项组排序数据无效');
    }
    for (const item of normalizedGroups) {
      await connection.execute(
        'UPDATE recycle_option_groups SET sort_order = ?, updated_at = ? WHERE id = ? AND profile_key = ?',
        [item.sortOrder, Date.now(), item.id, normalizedProfileKey]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return listAdminRecycleOptionGroups({ profileKey: normalizedProfileKey, includeDisabled: true });
};

const listAdminRecycleOptionItems = async ({ groupId = 0, includeDisabled = true } = {}) => {
  const normalizedGroupId = Number(groupId || 0);
  if (!normalizedGroupId) {
    return [];
  }

  const params = [normalizedGroupId];
  let whereSql = 'group_id = ?';

  if (!includeDisabled) {
    whereSql += ' AND status = 1';
  }

  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM recycle_option_items
      WHERE ${whereSql}
      ORDER BY sort_order ASC, id ASC
    `,
    params
  );

  return rows.map(mapRecycleOptionItemRow);
};

const getRecycleOptionItemById = async (id) => {
  const itemId = Number(id || 0);
  if (!itemId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM recycle_option_items WHERE id = ? LIMIT 1', [itemId]);
  return rows.length ? mapRecycleOptionItemRow(rows[0]) : null;
};

const createAdminRecycleOptionItem = async (payload = {}) => {
  const now = Date.now();
  const groupId = Number(payload.groupId || 0);
  const label = normalizeText(payload.label);

  if (!groupId) {
    throw new Error('请先选择选项组');
  }
  if (!label) {
    throw new Error('选项名称不能为空');
  }

  const connection = await getPool().getConnection();
  let profileKey = '';
  let itemId = 0;

  try {
    await connection.beginTransaction();
    const [groups] = await connection.execute(
      'SELECT id, profile_key, label FROM recycle_option_groups WHERE id = ? LIMIT 1 FOR UPDATE',
      [groupId]
    );
    const group = groups[0];
    if (!group) {
      throw new Error('选项组不存在');
    }

    profileKey = normalizeText(group.profile_key);
    const sequence = await getNextRecycleOptionItemSequence(connection, groupId);
    const [result] = await connection.execute(
      `
        INSERT INTO recycle_option_items (
          group_id, source_key, item_value, sequence_no, item_label, effect_type, price_delta, note_text, image_urls, sort_order, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        groupId,
        normalizeText(payload.sourceKey) || buildSourceKey('recycle-item'),
        buildRecycleOptionValue(group.label, sequence),
        sequence,
        label,
        normalizeEffectType(payload.effectType),
        Math.max(0, toNumber(payload.priceDelta, 0)),
        normalizeText(payload.noteText),
        JSON.stringify(normalizeImageUrls(payload.imageUrls)),
        toInteger(payload.sortOrder, 0),
        toBoolean(payload.status, true) ? 1 : 0,
        now,
        now,
      ]
    );
    itemId = Number(result.insertId || 0);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await disableRecycleProductsWithoutEnabledOptions(profileKey);
  return getRecycleOptionItemById(itemId);
};

const updateAdminRecycleOptionItem = async (id, payload = {}) => {
  const itemId = Number(id || 0);
  if (!itemId) {
    return null;
  }

  const current = await getRecycleOptionItemById(itemId);
  if (!current) {
    return null;
  }

  const nextLabel = payload.label !== undefined ? normalizeText(payload.label) : current.label;

  if (!nextLabel) {
    throw new Error('选项名称不能为空');
  }

  await getPool().execute(
    `
      UPDATE recycle_option_items
      SET
        group_id = ?, item_value = ?, item_label = ?, effect_type = ?, price_delta = ?, note_text = ?,
        image_urls = ?, sort_order = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      current.groupId,
      current.value,
      nextLabel,
      payload.effectType !== undefined ? normalizeEffectType(payload.effectType) : current.effectType,
      payload.priceDelta !== undefined ? Math.max(0, toNumber(payload.priceDelta, 0)) : current.priceDelta,
      payload.noteText !== undefined ? normalizeText(payload.noteText) : current.noteText,
      JSON.stringify(payload.imageUrls !== undefined ? normalizeImageUrls(payload.imageUrls) : current.imageUrls),
      payload.sortOrder !== undefined ? toInteger(payload.sortOrder, 0) : current.sortOrder,
      payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : current.status,
      Date.now(),
      itemId,
    ]
  );

  const currentGroup = await getRecycleOptionGroupById(current.groupId);
  await disableRecycleProductsWithoutEnabledOptions(currentGroup?.profileKey || '');
  return getRecycleOptionItemById(itemId);
};

const updateAdminRecycleOptionItemStatus = async (id, status) => {
  return updateAdminRecycleOptionItem(id, {
    status,
  });
};

const deleteAdminRecycleOptionItem = async (id) => {
  const itemId = Number(id || 0);
  if (!itemId) {
    return 0;
  }

  const current = await getRecycleOptionItemById(itemId);
  if (!current) {
    return 0;
  }

  const currentGroup = await getRecycleOptionGroupById(current.groupId);
  const [result] = await getPool().execute('DELETE FROM recycle_option_items WHERE id = ? LIMIT 1', [itemId]);
  await disableRecycleProductsWithoutEnabledOptions(currentGroup?.profileKey || '');
  return Number(result.affectedRows || 0);
};

const deleteAdminRecycleOptionItems = async (ids = []) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((item) => Number(item || 0)).filter((item) => item > 0)));
  if (!normalizedIds.length) {
    return 0;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = normalizedIds.map(() => '?').join(', ');
    const [items] = await connection.execute(
      `SELECT DISTINCT group_id FROM recycle_option_items WHERE id IN (${placeholders})`,
      normalizedIds
    );
    const [result] = await connection.execute(
      `DELETE FROM recycle_option_items WHERE id IN (${placeholders})`,
      normalizedIds
    );
    await connection.commit();
    for (const item of items) {
      const group = await getRecycleOptionGroupById(item.group_id);
      await disableRecycleProductsWithoutEnabledOptions(group?.profileKey || '');
    }
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  createAdminRecycleOptionGroup,
  createAdminRecycleOptionItem,
  createAdminRecycleProduct,
  deleteAdminRecycleOptionGroup,
  deleteAdminRecycleOptionGroups,
  deleteAdminRecycleOptionItem,
  deleteAdminRecycleOptionItems,
  deleteAdminRecycleProducts,
  getAdminRecycleProductById: getRecycleProductById,
  initRecycleAdminDatabase,
  listAdminRecycleOptionGroups,
  listAdminRecycleOptionItems,
  reorderAdminRecycleOptionGroups,
  listAdminRecycleProducts,
  listAdminRecycleProfiles,
  updateAdminRecycleOptionGroup,
  updateAdminRecycleOptionGroupStatus,
  updateAdminRecycleOptionItem,
  updateAdminRecycleOptionItemStatus,
  updateAdminRecycleProduct,
  updateAdminRecycleProductStatus,
};
