// 回收审核后台的记录管理、审核和发布逻辑。
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const {
  createNextInventoryNumber,
  destroyGoodsWithConnection,
  exportProductCatalogSnapshot,
  getAdminGoodsById,
} = require('./admin');
const { allocateRecycleOrderNo, listLatestRecycleSettlementsByOrderIds } = require('./db');

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

const normalizeCoverTheme = (value) => {
  const normalized = normalizeText(value, 'red').toLowerCase();
  if (['red', 'blue', 'gray', 'green'].includes(normalized)) {
    return normalized;
  }
  return 'red';
};

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
    return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
  } catch (_error) {
    return [];
  }
};

const normalizeRecycleReturnAddress = (value) => {
  const source = safeParseJsonObject(value);
  const nested = safeParseJsonObject(source.returnAddress || source.return_address || source.address);
  const address = { ...source, ...nested };
  const pick = (...keys) => {
    const values = keys.map((key) => address[key]);
    return values.find((item) => item !== undefined && item !== null && String(item).trim() !== '')
      ?? values.find((item) => item !== undefined && item !== null);
  };
  const returnAddress = {
    addressId: Number(pick('addressId', 'address_id', 'id') || 0),
    recipientName: normalizeText(pick('recipientName', 'recipient_name', 'name')),
    recipientPhone: normalizeText(pick('recipientPhone', 'recipient_phone', 'phone', 'mobile')),
    province: normalizeText(pick('province')),
    city: normalizeText(pick('city')),
    district: normalizeText(pick('district', 'county')),
    addressDetail: normalizeText(pick('addressDetail', 'address_detail', 'detail')),
  };

  return [
    returnAddress.recipientName,
    returnAddress.recipientPhone,
    returnAddress.province,
    returnAddress.city,
    returnAddress.district,
    returnAddress.addressDetail,
  ].some(Boolean) ? returnAddress : null;
};

const safeParseJsonMap = (value) => {
  const parsed = safeParseJsonObject(value);
  return Object.keys(parsed).reduce((result, key) => {
    if (typeof parsed[key] === 'string') {
      result[key] = parsed[key];
    }
    return result;
  }, {});
};

const normalizeRecycleTradeStatus = (value) => {
  const normalized = normalizeText(value, 'submitted') || 'submitted';
  return normalized === 'user_cancelled' ? 'submitted' : normalized;
};

const normalizeRecycleUserStatus = (value, fallback = 'confirmed') => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'cancelled' || normalized === 'confirmed') {
    return normalized;
  }
  return fallback === 'cancelled' ? 'cancelled' : 'confirmed';
};

const normalizeRecycleUserResponseStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'accepted_quote' || normalized === 'take_back_requested') {
    return normalized;
  }
  return '';
};

const getCategoryPlatformByKey = (key) => {
  const normalized = normalizeText(key).toLowerCase();
  if (normalized.startsWith('nintendo_')) {
    return '任天堂';
  }
  if (normalized.startsWith('sony_')) {
    return '索尼';
  }
  if (normalized.startsWith('steam_')) {
    return 'Steam';
  }
  if (normalized.startsWith('xbox_')) {
    return 'Xbox';
  }
  if (normalized.startsWith('rog_')) {
    return 'ROG';
  }
  return '其他';
};

const getCategoryHeroThemeByKey = (key) => {
  const normalized = normalizeText(key).toLowerCase();
  if (normalized.startsWith('nintendo_')) {
    return 'nintendo';
  }
  if (normalized.startsWith('sony_')) {
    return 'sony';
  }
  if (normalized.startsWith('steam_')) {
    return 'steam';
  }
  if (normalized.startsWith('rog_')) {
    return 'asus';
  }
  return 'others';
};

const normalizeImageUrls = (value) =>
  Array.from(new Set(safeParseJsonArray(value).map((item) => normalizeText(item)).filter(Boolean)));

const normalizeItemSource = (value, fallback = '微信小程序') => normalizeText(value, fallback).slice(0, 64) || fallback;
const REVIEWABLE_SUBMISSION_STATUSES = new Set(['submitted', 'needs_fix', 'approved', 'published']);
const isReviewableSubmissionStatus = (value) => REVIEWABLE_SUBMISSION_STATUSES.has(normalizeText(value));
const BLOCKED_DELETE_SETTLEMENT_STATES = new Set([
  'ADMIN_CONFIRMED',
  'PENDING',
  'ACCEPTED',
  'PROCESSING',
  'WAIT_USER_CONFIRM',
  'TRANSFERING',
  'CANCELING',
  'SUCCESS',
]);
const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const extractSfWaybillNo = (note) => {
  const matched = String(note || '').match(/顺丰(?:运单|单)号\s*[:：]\s*([^\r\n；;]+)/i);
  return matched ? normalizeText(matched[1]) : '';
};

const mapSubmissionRow = (row, { includeSfWaybillNo = true } = {}) => ({
  id: Number(row.id || 0),
  orderNo: normalizeText(row.order_no),
  openId: normalizeText(row.open_id),
  recycleProductId: row.recycle_product_id === null || row.recycle_product_id === undefined ? null : Number(row.recycle_product_id || 0),
  categoryKey: normalizeText(row.category_key),
  itemSource: normalizeItemSource(row.item_source),
  title: normalizeText(row.title),
  coverLabel: normalizeText(row.cover_label),
  coverImage: normalizeText(row.cover_image || row.recycle_product_cover_image),
  coverTheme: normalizeCoverTheme(row.cover_theme),
  payoutMethodLabel: normalizeText(row.payout_method_label),
  accountNumber: normalizeText(row.account_number),
  realName: normalizeText(row.real_name),
  optionSummary: normalizeText(row.option_summary),
  selectedDeviceOptionValues: safeParseJsonMap(row.selected_device_option_values),
  selectedDeviceOptionTexts: safeParseJsonMap(row.selected_device_option_texts),
  submissionImages: normalizeImageUrls(row.submission_images),
  estimateSupported: Boolean(row.estimate_supported),
  estimateBasePrice: Number(row.estimate_base_price || 0),
  estimateFinalPrice: Number(row.estimate_final_price || 0),
  note: normalizeText(row.note),
  sfWaybillNo: includeSfWaybillNo ? normalizeText(row.sf_express_number) || extractSfWaybillNo(row.note) : '',
  status: normalizeRecycleTradeStatus(row.status),
  userStatus: normalizeRecycleUserStatus(row.user_status, row.status === 'user_cancelled' ? 'cancelled' : 'confirmed'),
  userResponseStatus: normalizeRecycleUserResponseStatus(row.user_response_status),
  returnAddress: normalizeRecycleReturnAddress(
    row.return_address_json ?? row.return_address ?? row.returnAddress
  ),
  reviewNote: normalizeText(row.review_note),
  reportDescription: normalizeText(row.report_description),
  publishedProductId: row.published_product_id === null || row.published_product_id === undefined ? null : Number(row.published_product_id || 0),
  reviewedBy: row.reviewed_by === null || row.reviewed_by === undefined ? null : Number(row.reviewed_by || 0),
  reviewedAt: Number(row.reviewed_at || 0),
  publishedAt: Number(row.published_at || 0),
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
  userNickname: normalizeText(row.user_nickname),
  userPhone: normalizeText(row.user_phone),
  uid: normalizeText(row.user_uid),
});

const mapReviewRow = (row) => ({
  id: Number(row.id || 0),
  submissionId: Number(row.submission_id || 0),
  action: normalizeText(row.action),
  reviewNote: normalizeText(row.review_note),
  beforeSnapshot: safeParseJsonObject(row.before_snapshot),
  afterSnapshot: safeParseJsonObject(row.after_snapshot),
  adminId: row.admin_id === null || row.admin_id === undefined ? null : Number(row.admin_id || 0),
  adminName: normalizeText(row.admin_name),
  adminAccount: normalizeText(row.admin_account),
  publishedProductId: row.published_product_id === null || row.published_product_id === undefined ? null : Number(row.published_product_id || 0),
  createdAt: Number(row.created_at || 0),
});

const getSubmissionRowById = async (connection, submissionId) => {
  const [rows] = await connection.execute(
    `
      SELECT ro.*, rp.cover_image AS recycle_product_cover_image, u.nickname AS user_nickname, u.phone AS user_phone, u.uid AS user_uid
      FROM recycle_orders ro
      LEFT JOIN recycle_products rp ON rp.id = ro.recycle_product_id
      LEFT JOIN users u ON u.open_id = ro.open_id
      WHERE ro.id = ?
      LIMIT 1
    `,
    [Number(submissionId || 0)]
  );

  return rows.length ? rows[0] : null;
};

const createReviewRecord = async (
  connection,
  {
    submissionId,
    action,
    reviewNote,
    beforeSnapshot,
    afterSnapshot,
    adminId,
    publishedProductId = null,
  }
) => {
  const now = Date.now();
  await connection.execute(
    `
      INSERT INTO recycle_submission_reviews (
        submission_id, action, review_note, before_snapshot, after_snapshot, admin_id, published_product_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      Number(submissionId || 0),
      normalizeText(action),
      normalizeText(reviewNote),
      JSON.stringify(beforeSnapshot || {}),
      JSON.stringify(afterSnapshot || {}),
      adminId ? Number(adminId || 0) : null,
      publishedProductId ? Number(publishedProductId || 0) : null,
      now,
    ]
  );
};

const getSaleCategoryRow = async (connection, payloadCategoryId, fallbackCategoryKey = '') => {
  const categoryId = Number(payloadCategoryId || 0);
  if (categoryId > 0) {
    const [rows] = await connection.execute(
      `SELECT * FROM admin_categories WHERE id = ? AND scene = 'sale' LIMIT 1`,
      [categoryId]
    );
    if (rows.length) {
      return rows[0];
    }
  }

  if (fallbackCategoryKey) {
    const [rows] = await connection.execute(
      `SELECT * FROM admin_categories WHERE category_key = ? AND scene = 'sale' LIMIT 1`,
      [normalizeText(fallbackCategoryKey)]
    );
    if (rows.length) {
      return rows[0];
    }
  }

  const [rows] = await connection.execute(
    `SELECT * FROM admin_categories WHERE scene = 'sale' ORDER BY sort_order ASC, id ASC LIMIT 1`
  );
  return rows.length ? rows[0] : null;
};

const buildFeatureTags = (value, fallbackTags = []) => {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return Array.isArray(fallbackTags) ? fallbackTags : [];
};

const INSPECTION_INVENTORY_TEXT_FIELDS = [
  'inspection_report', 'inventory_number', 'sf_express_number', 'payment_status', 'machine_status',
  'promotion_source', 'recycle_communication_platform', 'recycle_id', 'recycle_address',
  'communication_price', 'paid_price', 'recycle_freight', 'final_sale_price', 'sale_freight',
  'platform_fee', 'profit', 'sale_channel', 'sale_id', 'sale_address', 'created_time_text',
  'remark_info', 'inspection_result',
];
const INSPECTION_INVENTORY_CUSTOM_KEY_PATTERN = /^custom_[a-z0-9_]+$/;
const INSPECTION_INVENTORY_IMAGE_SUFFIX = '__images';

const normalizeInspectionInventoryValues = (values) => (
  values && typeof values === 'object' && !Array.isArray(values) ? values : {}
);

const createInspectedInventory = async (connection, values, current, now) => {
  const sourceValues = normalizeInspectionInventoryValues(values);
  const [columnRows] = await connection.execute(
    `SELECT column_key, label, field_type
     FROM inventory_management_columns
     WHERE is_visible = 1
     ORDER BY sort_order ASC, id ASC`
  );
  const [calculationRows] = await connection.execute(
    'SELECT target_column_key FROM inventory_management_calculations'
  );
  const calculationTargets = new Set(calculationRows.map((row) => normalizeText(row.target_column_key)));
  const configuredColumns = columnRows.map((row) => ({
    key: normalizeText(row.column_key),
    label: normalizeText(row.label),
    fieldType: normalizeText(row.field_type).toLowerCase(),
    calculated: calculationTargets.has(normalizeText(row.column_key)),
  }));
  const physicalValues = Object.fromEntries(INSPECTION_INVENTORY_TEXT_FIELDS.map((field) => [field, '']));
  const customFields = {};

  configuredColumns.forEach((column) => {
    if (!column.key || column.calculated) return;
    const imageKey = `${column.key}${INSPECTION_INVENTORY_IMAGE_SUFFIX}`;
    if (column.fieldType === 'image') {
      const textValue = normalizeText(sourceValues[column.key]);
      if (INSPECTION_INVENTORY_TEXT_FIELDS.includes(column.key)) {
        physicalValues[column.key] = textValue;
      } else if (INSPECTION_INVENTORY_CUSTOM_KEY_PATTERN.test(column.key)) {
        customFields[column.key] = textValue;
      }
      const imageValues = Array.isArray(sourceValues[imageKey]) ? sourceValues[imageKey] : [];
      customFields[imageKey] = Array.from(new Set(imageValues
        .map((image) => normalizeText(image))
        .filter((image) => /^(https?:\/\/|\/uploads\/)/i.test(image))
      )).slice(0, 9);
      return;
    }
    const value = normalizeText(sourceValues[column.key]);
    if (INSPECTION_INVENTORY_TEXT_FIELDS.includes(column.key)) {
      physicalValues[column.key] = value;
    } else if (INSPECTION_INVENTORY_CUSTOM_KEY_PATTERN.test(column.key)) {
      customFields[column.key] = value;
    }
    if (column.key === 'recycle_id' || column.label.includes('回收单号') || column.label.includes('回收ID')) {
      if (INSPECTION_INVENTORY_TEXT_FIELDS.includes(column.key)) physicalValues[column.key] = normalizeText(current.orderNo);
      if (INSPECTION_INVENTORY_CUSTOM_KEY_PATTERN.test(column.key)) customFields[column.key] = normalizeText(current.orderNo);
    }
  });

  physicalValues.recycle_id ||= normalizeText(current.orderNo);
  physicalValues.sf_express_number ||= normalizeText(current.sfWaybillNo);
  physicalValues.communication_price ||= String(current.estimateFinalPrice || current.estimateBasePrice || '');
  physicalValues.remark_info ||= normalizeText(current.note);
  physicalValues.created_time_text ||= new Date(now).toLocaleString('zh-CN', { hour12: false });

  // 回收检测与库存管理共用按月序列，编号不再依赖库存表自增 id。
  physicalValues.inventory_number = physicalValues.inventory_number || await createNextInventoryNumber(connection, now);

  const [result] = await connection.execute(
    `INSERT INTO inventory_management (${INSPECTION_INVENTORY_TEXT_FIELDS.join(', ')}, custom_fields, created_at, updated_at)
     VALUES (${INSPECTION_INVENTORY_TEXT_FIELDS.map(() => '?').join(', ')}, ?, ?, ?)`,
    [...INSPECTION_INVENTORY_TEXT_FIELDS.map((field) => physicalValues[field] || ''), JSON.stringify(customFields), now, now]
  );
  return Number(result.insertId || 0);
};

// 完成回收检测：在同一事务中创建待审核商品和库存记录，防止两边数据不一致。
const completeAdminRecycleSubmissionInspection = async (id, payload = {}, adminId = null) => {
  const submissionId = Number(id || 0);
  if (!submissionId) return null;

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const currentRow = await getSubmissionRowById(connection, submissionId);
    if (!currentRow) {
      await connection.rollback();
      return null;
    }
    const current = mapSubmissionRow(currentRow);
    if (current.userStatus === 'cancelled') throw createHttpError(400, '用户已取消的回收单不能进行检测');
    if (current.publishedProductId) throw createHttpError(400, '该回收单已经完成检测，不能重复提交');

    const categoryRow = await getSaleCategoryRow(connection, payload.categoryId, current.categoryKey);
    if (!categoryRow) throw createHttpError(400, '未找到可用的销售类目');
    const [maxRows] = await connection.execute('SELECT COALESCE(MAX(id), 0) AS maxId FROM products FOR UPDATE');
    const nextProductId = Number(maxRows[0]?.maxId || 0) + 1;
    const now = Date.now();
    const categoryKey = normalizeText(categoryRow.category_key);
    const submissionImages = normalizeImageUrls(current.submissionImages);
    const title = current.title;
    const subtitle = current.optionSummary;
    const description = normalizeText(current.optionSummary);
    const price = Math.max(0, toNumber(current.estimateFinalPrice || current.estimateBasePrice, 0));
    const featureTags = buildFeatureTags(null, Object.values(current.selectedDeviceOptionTexts || {}));
    const productId = normalizeText(payload.productId).slice(0, 32);
    const coverImage = submissionImages[0] || '';
    const platform = getCategoryPlatformByKey(categoryKey);
    const heroTheme = getCategoryHeroThemeByKey(categoryKey);
    const productSnapshot = {
      snapshotVersion: 1,
      productId: nextProductId,
      productNo: productId,
      categoryKey,
      modelKey: `recycle-${submissionId}-${now}`,
      platform,
      coverText: normalizeText(current.coverLabel).slice(0, 1),
      coverTitle: normalizeText(current.coverLabel),
      title,
      subtitle,
      price,
      originPrice: price,
      recyclePrice: price,
      tagText: current.estimateSupported ? '回收上架' : '人工核验',
      coverImage,
      heroImage: coverImage,
      detailImages: submissionImages,
      recyclable: false,
      premiumCondition: false,
      certifiedPrice: false,
      releaseOrder: 0,
      heroTheme,
      heroAccent: '回收检测商品',
      editionLabel: '',
      featureTags,
      shoppingTextA: '客服核验后发货 / 支持二手回收来源说明',
      shoppingTextB: description,
      shoppingTextC: '',
      description,
      capturedAt: now,
    };

    await connection.query(
      `
        INSERT INTO products (
          id, product_id, category_key, model_key, platform, cover_text, cover_title, title, subtitle,
          price, origin_price, recycle_price, tag_text, hero_image, in_stock, recyclable, recycle_target_category_key, premium_condition,
          certified_price, release_order, hero_theme, hero_accent, edition_label, feature_tags, shopping_textA,
          shopping_textB, shopping_textC, description, content, stock, min_stock, stock_display, ischeck, status, is_deleted,
          unit, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `,
      [
        nextProductId,
        productId,
        categoryKey,
        `recycle-${submissionId}-${now}`,
        platform,
        normalizeText(current.coverLabel).slice(0, 1),
        normalizeText(current.coverLabel),
        title,
        subtitle,
        price,
        price,
        price,
        current.estimateSupported ? '回收上架' : '人工核验',
        coverImage,
        1,
        '',
        0,
        heroTheme,
        '回收检测待审核商品',
        '回收检测',
        JSON.stringify(featureTags),
        '客服核验后发货 / 支持二手回收来源说明',
        description,
        '',
        description,
        '',
        1,
        0,
        0,
        0,
        0,
        '件',
        now,
        now,
      ]
    );

    for (let index = 0; index < submissionImages.length; index += 1) {
      await connection.execute(
        `
          INSERT INTO product_images (
            source_key, product_id, image_type, image_url, sort_order, is_main, status, is_deleted, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
        `,
        [
          `recycle-inspection:${crypto.randomBytes(6).toString('hex')}`,
          nextProductId,
          index === 0 ? 'hero' : 'detail',
          submissionImages[index],
          index,
          index === 0 ? 1 : 0,
          now,
          now,
        ]
      );
    }

    const inventoryId = await createInspectedInventory(connection, payload.inventoryValues, current, now);
    await connection.execute(
      `UPDATE recycle_orders
       SET published_product_id = ?, product_snapshot_json = ?, status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        nextProductId,
        JSON.stringify(productSnapshot),
        adminId ? Number(adminId || 0) : null,
        now,
        now,
        submissionId,
      ]
    );

    const nextRow = await getSubmissionRowById(connection, submissionId);
    const next = nextRow ? mapSubmissionRow(nextRow) : null;
    await createReviewRecord(connection, {
      submissionId,
      action: 'inspection',
      reviewNote: '检测完成，已创建待审核商品和库存记录',
      beforeSnapshot: current,
      afterSnapshot: next,
      adminId,
      publishedProductId: nextProductId,
    });
    await connection.commit();
    await exportProductCatalogSnapshot();
    return { submission: next, product: await getAdminGoodsById(nextProductId), inventoryId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const listAdminRecycleSubmissions = async ({ page = 1, title = '', status = '', categoryKey = '', limit = 10 } = {}) => {
  const filters = [];
  const params = [];

  const keyword = normalizeText(title);
  if (keyword) {
    filters.push('(ro.title LIKE ? OR ro.option_summary LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ? OR ro.sf_express_number LIKE ? OR ro.note LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (normalizeText(status)) {
    const normalizedStatus = normalizeText(status);
    if (normalizedStatus === 'user_cancelled') {
      filters.push("(ro.user_status = 'cancelled' OR ro.status = 'user_cancelled')");
    } else if (normalizedStatus === 'user_take_back_requested') {
      filters.push("ro.user_response_status = 'take_back_requested'");
    } else if (normalizedStatus === 'user_accepted_quote') {
      filters.push("ro.user_response_status = 'accepted_quote'");
    } else if (normalizedStatus === 'approved') {
      // 历史检测完成记录可能使用 published，后台筛选统一归入已通过。
      filters.push("ro.status IN ('approved', 'published')");
    } else {
      filters.push('ro.status = ?');
      params.push(normalizedStatus);
    }
  }

  if (normalizeText(categoryKey)) {
    filters.push('ro.category_key = ?');
    params.push(normalizeText(categoryKey));
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(1, Number(limit || 10));
  const offset = (safePage - 1) * safeLimit;

  const [countRows] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM recycle_orders ro
      LEFT JOIN users u ON u.open_id = ro.open_id
      ${whereClause}
    `,
    params
  );

  const [rows] = await getPool().execute(
    `
      SELECT ro.*, rp.cover_image AS recycle_product_cover_image, u.nickname AS user_nickname, u.phone AS user_phone, u.uid AS user_uid
      FROM recycle_orders ro
      LEFT JOIN recycle_products rp ON rp.id = ro.recycle_product_id
      LEFT JOIN users u ON u.open_id = ro.open_id
      ${whereClause}
      ORDER BY ro.created_at DESC, ro.id DESC
      LIMIT ${safeLimit} OFFSET ${offset}
    `,
    params
  );

  const submissionList = rows.map(mapSubmissionRow);
  const latestSettlements = await listLatestRecycleSettlementsByOrderIds(submissionList.map((item) => item.id));
  const settlementMap = new Map(latestSettlements.map((item) => [Number(item.recycleOrderId || 0), item]));

  return {
    totalCount: Number(countRows[0]?.totalCount || 0),
    list: submissionList.map((item) => ({
      ...item,
      settlement: settlementMap.get(Number(item.id || 0)) || null,
    })),
  };
};

const listRecycleSubmissionReviews = async (submissionId) => {
  const [rows] = await getPool().execute(
    `
      SELECT r.*, s.name AS admin_name, s.username AS admin_account
      FROM recycle_submission_reviews r
      LEFT JOIN staff s ON s.id = r.admin_id
      WHERE r.submission_id = ?
      ORDER BY r.created_at DESC, r.id DESC
    `,
    [Number(submissionId || 0)]
  );

  return rows.map(mapReviewRow);
};

const updateAdminRecycleSubmissionReport = async (id, payload = {}, adminId = null) => {
  const submissionId = Number(id || 0);
  const reportDescription = normalizeText(payload.reportDescription !== undefined
    ? payload.reportDescription
    : (payload.report_description !== undefined ? payload.report_description : payload.description));
  if (!submissionId) {
    return null;
  }
  if (!reportDescription) {
    throw createHttpError(400, '请填写报告内容');
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const currentRow = await getSubmissionRowById(connection, submissionId);
    if (!currentRow) {
      await connection.rollback();
      return null;
    }

    const current = mapSubmissionRow(currentRow);
    const now = Date.now();
    await connection.execute(
      'UPDATE recycle_orders SET report_description = ?, updated_at = ? WHERE id = ?',
      [reportDescription, now, submissionId]
    );
    const nextRow = await getSubmissionRowById(connection, submissionId);
    const next = nextRow ? mapSubmissionRow(nextRow) : null;
    await createReviewRecord(connection, {
      submissionId,
      action: 'report',
      reviewNote: reportDescription,
      beforeSnapshot: current,
      afterSnapshot: next,
      adminId,
      publishedProductId: next?.publishedProductId || null,
    });
    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const createAdminRecycleSubmission = async (payload = {}, adminId = null) => {
  const title = normalizeText(payload.title);
  if (!title) {
    throw createHttpError(400, '请填写商品名称');
  }

  const now = Date.now();
  const submissionImages = normalizeImageUrls(payload.submissionImages);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const orderNo = await allocateRecycleOrderNo(connection, now);
    const [result] = await connection.execute(
      `
        INSERT INTO recycle_orders (
          open_id, recycle_product_id, order_no, category_key, item_source, title, cover_label, cover_image, cover_theme,
          payout_method_label, account_number, real_name, option_summary, selected_device_option_values,
          selected_device_option_texts, submission_images, estimate_supported, estimate_base_price, estimate_final_price,
          note, sf_express_number, status, user_status, user_response_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 'confirmed', '', ?, ?)
      `,
      [
        `manual:${adminId || 0}:${now}`,
        payload.recycleProductId ? Number(payload.recycleProductId || 0) : null,
        orderNo,
        normalizeText(payload.categoryKey),
        normalizeItemSource(payload.itemSource, '后台手动新增'),
        title,
        normalizeText(payload.coverLabel),
        normalizeText(payload.coverImage) || submissionImages[0] || '',
        normalizeCoverTheme(payload.coverTheme),
        normalizeText(payload.payoutMethodLabel),
        normalizeText(payload.accountNumber),
        normalizeText(payload.realName),
        normalizeText(payload.optionSummary),
        JSON.stringify(safeParseJsonMap(payload.selectedDeviceOptionValues)),
        JSON.stringify(safeParseJsonMap(payload.selectedDeviceOptionTexts)),
        JSON.stringify(submissionImages),
        toBoolean(payload.estimateSupported) ? 1 : 0,
        Math.max(0, toNumber(payload.estimateBasePrice, 0)),
        Math.max(0, toNumber(payload.estimateFinalPrice, 0)),
        '',
        normalizeText(payload.sfWaybillNo ?? payload.sfExpressNumber),
        now,
        now,
      ]
    );
    const nextRow = await getSubmissionRowById(connection, result.insertId);
    const next = nextRow ? mapSubmissionRow(nextRow) : null;
    await createReviewRecord(connection, {
      submissionId: result.insertId,
      action: 'manual_create',
      reviewNote: '后台手动新增回收记录',
      beforeSnapshot: {},
      afterSnapshot: next,
      adminId,
    });
    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateAdminRecycleSubmissionInfo = async (id, payload = {}, adminId = null) => {
  const submissionId = Number(id || 0);
  if (!submissionId) return null;

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const currentRow = await getSubmissionRowById(connection, submissionId);
    if (!currentRow) {
      await connection.rollback();
      return null;
    }

    const current = mapSubmissionRow(currentRow);
    const nextImages = payload.submissionImages !== undefined ? normalizeImageUrls(payload.submissionImages) : current.submissionImages;
    const nextTitle = payload.title !== undefined ? normalizeText(payload.title) : current.title;
    if (!nextTitle) {
      throw createHttpError(400, '请填写商品名称');
    }
    const now = Date.now();
    await connection.execute(
      `
        UPDATE recycle_orders
        SET recycle_product_id = ?, category_key = ?, item_source = ?, title = ?, cover_label = ?, cover_image = ?, cover_theme = ?,
            payout_method_label = ?, account_number = ?, real_name = ?, option_summary = ?, submission_images = ?,
            estimate_base_price = ?, estimate_final_price = ?, note = ?, sf_express_number = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        payload.recycleProductId !== undefined ? (payload.recycleProductId ? Number(payload.recycleProductId || 0) : null) : current.recycleProductId,
        payload.categoryKey !== undefined ? normalizeText(payload.categoryKey) : current.categoryKey,
        payload.itemSource !== undefined ? normalizeItemSource(payload.itemSource) : current.itemSource,
        nextTitle,
        payload.coverLabel !== undefined ? normalizeText(payload.coverLabel) : current.coverLabel,
        payload.coverImage !== undefined ? normalizeText(payload.coverImage) : (current.coverImage || nextImages[0] || ''),
        payload.coverTheme !== undefined ? normalizeCoverTheme(payload.coverTheme) : current.coverTheme,
        payload.payoutMethodLabel !== undefined ? normalizeText(payload.payoutMethodLabel) : current.payoutMethodLabel,
        payload.accountNumber !== undefined ? normalizeText(payload.accountNumber) : current.accountNumber,
        payload.realName !== undefined ? normalizeText(payload.realName) : current.realName,
        payload.optionSummary !== undefined ? normalizeText(payload.optionSummary) : current.optionSummary,
        JSON.stringify(nextImages),
        payload.estimateBasePrice !== undefined ? Math.max(0, toNumber(payload.estimateBasePrice, 0)) : current.estimateBasePrice,
        payload.estimateFinalPrice !== undefined ? Math.max(0, toNumber(payload.estimateFinalPrice, 0)) : current.estimateFinalPrice,
        current.note,
        payload.sfWaybillNo !== undefined ? normalizeText(payload.sfWaybillNo) : current.sfWaybillNo,
        now,
        submissionId,
      ]
    );
    const nextRow = await getSubmissionRowById(connection, submissionId);
    const next = nextRow ? mapSubmissionRow(nextRow) : null;
    await createReviewRecord(connection, {
      submissionId,
      action: 'info_update',
      reviewNote: '修改回收记录信息',
      beforeSnapshot: current,
      afterSnapshot: next,
      adminId,
      publishedProductId: next?.publishedProductId || null,
    });
    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteAdminRecycleSubmission = async (id) => {
  const submissionId = Number(id || 0);
  if (!submissionId) {
    return 0;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const currentRow = await getSubmissionRowById(connection, submissionId);
    if (!currentRow) {
      await connection.rollback();
      return 0;
    }

    const [settlementRows] = await connection.execute(
      `
        SELECT state
        FROM recycle_settlements
        WHERE recycle_order_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [submissionId]
    );

    const latestSettlementState = normalizeText(settlementRows[0]?.state).toUpperCase();
    if (BLOCKED_DELETE_SETTLEMENT_STATES.has(latestSettlementState)) {
      throw createHttpError(400, '该回收单已进入打款流程或已打款成功，不能删除');
    }

    const publishedProductIds = Array.from(
      new Set([Number(currentRow.published_product_id || 0)].filter(Boolean))
    );
    if (publishedProductIds.length) {
      await destroyGoodsWithConnection(connection, publishedProductIds);
    }

    await connection.execute('DELETE FROM recycle_submission_reviews WHERE submission_id = ?', [submissionId]);
    await connection.execute('DELETE FROM recycle_settlements WHERE recycle_order_id = ?', [submissionId]);
    const [result] = await connection.execute('DELETE FROM recycle_orders WHERE id = ? LIMIT 1', [submissionId]);
    await connection.commit();
    if (publishedProductIds.length) {
      await exportProductCatalogSnapshot();
    }
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteAdminRecycleSubmissions = async (ids = []) => {
  const submissionIds = Array.from(
    new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item || 0)).filter((item) => item > 0))
  );

  if (!submissionIds.length) {
    return 0;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = submissionIds.map(() => '?').join(', ');
    const [currentRows] = await connection.execute(
      `
        SELECT id, published_product_id
        FROM recycle_orders
        WHERE id IN (${placeholders})
        FOR UPDATE
      `,
      submissionIds
    );

    const [settlementRows] = await connection.execute(
      `
        SELECT recycle_order_id, state
        FROM recycle_settlements
        WHERE recycle_order_id IN (${placeholders})
      `,
      submissionIds
    );

    const blockedSettlement = settlementRows.find((item) =>
      BLOCKED_DELETE_SETTLEMENT_STATES.has(normalizeText(item.state).toUpperCase())
    );
    if (blockedSettlement) {
      throw createHttpError(400, '选中的回收单中存在已进入打款流程或已打款成功的记录，不能删除');
    }

    const publishedProductIds = Array.from(
      new Set(currentRows.map((row) => Number(row.published_product_id || 0)).filter(Boolean))
    );
    if (publishedProductIds.length) {
      await destroyGoodsWithConnection(connection, publishedProductIds);
    }

    await connection.execute(
      `DELETE FROM recycle_submission_reviews WHERE submission_id IN (${placeholders})`,
      submissionIds
    );
    await connection.execute(
      `DELETE FROM recycle_settlements WHERE recycle_order_id IN (${placeholders})`,
      submissionIds
    );
    const [result] = await connection.execute(
      `DELETE FROM recycle_orders WHERE id IN (${placeholders})`,
      submissionIds
    );

    await connection.commit();
    if (publishedProductIds.length) {
      await exportProductCatalogSnapshot();
    }
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateAdminRecycleSubmission = async (id, payload = {}, adminId = null) => {
  const submissionId = Number(id || 0);
  if (!submissionId) {
    return null;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const currentRow = await getSubmissionRowById(connection, submissionId);
    if (!currentRow) {
      await connection.rollback();
      return null;
    }

    const current = mapSubmissionRow(currentRow);
    if (current.status === 'published') {
      throw createHttpError(400, '宸茬‘璁ゆ彁浜ょ殑鍟嗗搧涓嶈兘鍐嶆杩涜瀹℃牳淇濆瓨');
    }
    if (current.userStatus === 'cancelled') {
      throw createHttpError(400, '用户已取消的回收单不能继续审核');
    }
    const nextSelectedValues =
      payload.selectedDeviceOptionValues !== undefined
        ? safeParseJsonMap(payload.selectedDeviceOptionValues)
        : current.selectedDeviceOptionValues;
    const nextSelectedTexts =
      payload.selectedDeviceOptionTexts !== undefined
        ? safeParseJsonMap(payload.selectedDeviceOptionTexts)
        : current.selectedDeviceOptionTexts;
    const nextImages =
      payload.submissionImages !== undefined ? normalizeImageUrls(payload.submissionImages) : current.submissionImages;
    const nextStatus = normalizeText(payload.status, 'needs_fix') || 'needs_fix';
    if (!isReviewableSubmissionStatus(nextStatus) || nextStatus === 'published' || nextStatus === 'submitted') {
      throw createHttpError(400, '审核保存仅支持标记为信息有误或信息无误');
    }
    const nextReviewNote = payload.reviewNote !== undefined ? normalizeText(payload.reviewNote) : current.reviewNote;
    const now = Date.now();

    await connection.execute(
      `
        UPDATE recycle_orders
        SET recycle_product_id = ?, category_key = ?, title = ?, cover_label = ?, cover_theme = ?, payout_method_label = ?,
            account_number = ?, real_name = ?, option_summary = ?, selected_device_option_values = ?,
            selected_device_option_texts = ?, submission_images = ?, estimate_supported = ?, estimate_base_price = ?,
            estimate_final_price = ?, note = ?, status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        payload.recycleProductId !== undefined ? (payload.recycleProductId ? Number(payload.recycleProductId || 0) : null) : current.recycleProductId,
        payload.categoryKey !== undefined ? normalizeText(payload.categoryKey) : current.categoryKey,
        payload.title !== undefined ? normalizeText(payload.title) : current.title,
        payload.coverLabel !== undefined ? normalizeText(payload.coverLabel) : current.coverLabel,
        payload.coverTheme !== undefined ? normalizeCoverTheme(payload.coverTheme) : current.coverTheme,
        payload.payoutMethodLabel !== undefined ? normalizeText(payload.payoutMethodLabel) : current.payoutMethodLabel,
        payload.accountNumber !== undefined ? normalizeText(payload.accountNumber) : current.accountNumber,
        payload.realName !== undefined ? normalizeText(payload.realName) : current.realName,
        payload.optionSummary !== undefined ? normalizeText(payload.optionSummary) : current.optionSummary,
        JSON.stringify(nextSelectedValues),
        JSON.stringify(nextSelectedTexts),
        JSON.stringify(nextImages),
        payload.estimateSupported !== undefined ? (toBoolean(payload.estimateSupported) ? 1 : 0) : (current.estimateSupported ? 1 : 0),
        payload.estimateBasePrice !== undefined ? toNumber(payload.estimateBasePrice, 0) : current.estimateBasePrice,
        payload.estimateFinalPrice !== undefined ? toNumber(payload.estimateFinalPrice, 0) : current.estimateFinalPrice,
        current.note,
        nextStatus,
        nextReviewNote,
        adminId ? Number(adminId || 0) : current.reviewedBy,
        now,
        now,
        submissionId,
      ]
    );

    const nextRow = await getSubmissionRowById(connection, submissionId);
    const next = nextRow ? mapSubmissionRow(nextRow) : null;
    await createReviewRecord(connection, {
      submissionId,
      action: nextStatus === 'needs_fix' ? 'incorrect' : 'approved',
      reviewNote: nextReviewNote,
      beforeSnapshot: current,
      afterSnapshot: next,
      adminId,
      publishedProductId: next?.publishedProductId || null,
    });

    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const publishAdminRecycleSubmission = async (id, payload = {}, adminId = null) => {
  const submissionId = Number(id || 0);
  if (!submissionId) {
    return null;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const currentRow = await getSubmissionRowById(connection, submissionId);
    if (!currentRow) {
      await connection.rollback();
      return null;
    }

    const current = mapSubmissionRow(currentRow);
    if (current.userStatus === 'cancelled') {
      throw createHttpError(400, '用户已取消的回收单不能继续审核');
    }
    if (current.status !== 'approved') {
      throw createHttpError(400, '只有已标记为信息无误的商品才能确认提审');
    }
    if (current.userResponseStatus !== 'accepted_quote') {
      throw createHttpError(400, '用户接受报价后才能确认提交商品');
    }
    const categoryRow = await getSaleCategoryRow(connection, payload.categoryId, payload.categoryKey || current.categoryKey);
    if (!categoryRow) {
      throw new Error('未找到可用的销售类目');
    }

    const [maxRows] = await connection.execute('SELECT COALESCE(MAX(id), 0) AS maxId FROM products FOR UPDATE');
    const nextProductId = Number(maxRows[0]?.maxId || 0) + 1;
    const now = Date.now();
    const categoryKey = normalizeText(categoryRow.category_key);
    const coverImage = normalizeText(payload.cover) || normalizeImageUrls(payload.submissionImages || current.submissionImages)[0] || '';
    const submissionImages = normalizeImageUrls(payload.submissionImages !== undefined ? payload.submissionImages : current.submissionImages);
    const featureTags = buildFeatureTags(payload.featureTags, Object.values(current.selectedDeviceOptionTexts || {}));
    const title = normalizeText(payload.title) || current.title;
    const subtitle = normalizeText(payload.subtitle) || current.optionSummary;
    const description = normalizeText(payload.desc) || normalizeText(current.optionSummary);
    const shoppingTextB = normalizeText(payload.shoppingTextB) || description;
    const price = Math.max(0, toNumber(payload.minPrice, current.estimateFinalPrice || current.estimateBasePrice || 0));
    const originPrice = Math.max(price, toNumber(payload.minOriginalPrice, price));
    const recyclePrice = Math.max(0, toNumber(payload.recyclePrice, current.estimateFinalPrice || price));
    const productId = normalizeText(payload.productId).slice(0, 32);
    const stock = Math.max(0, toInteger(payload.stock, 1));
    const minStock = Math.max(0, toInteger(payload.minStock, 0));
    const stockDisplay = toBoolean(payload.stockDisplay) ? 1 : 0;
    const status = toBoolean(payload.status, true) ? 1 : 0;
    const ischeck = 0;
    const recyclable = toBoolean(payload.recyclable, true) ? 1 : 0;
    const recycleTargetCategoryKey =
      recyclable === 1
        ? ''
        : (current.recycleProductId ? String(current.recycleProductId) : categoryKey);
    const releaseOrder = Math.max(0, toInteger(payload.releaseOrder, 0));
    const platform = normalizeText(payload.platform) || getCategoryPlatformByKey(categoryKey);
    const heroTheme = normalizeText(payload.heroTheme) || getCategoryHeroThemeByKey(categoryKey);
    const coverText = normalizeText(payload.coverText) || normalizeText(current.coverLabel).slice(0, 1);
    const coverTitle = normalizeText(payload.coverTitle) || normalizeText(current.coverLabel);
    const tagText = normalizeText(payload.tagText) || (current.estimateSupported ? '回收上架' : '人工核验');
    const shoppingTextA = normalizeText(payload.shoppingTextA) || '客服核验后发货 / 支持二手回收来源说明';
    const shoppingTextC = normalizeText(payload.shoppingTextC);
    const heroAccent = normalizeText(payload.heroAccent) || '回收审核通过商品';
    const editionLabel = normalizeText(payload.editionLabel) || '回收上架';
    const unit = normalizeText(payload.unit, '件') || '件';
    const modelKey = normalizeText(payload.modelKey) || `recycle-${submissionId}-${Date.now()}`;
    const content = typeof payload.content === 'string' ? payload.content : '';
    const reviewNote = normalizeText(payload.reviewNote) || current.reviewNote;
    const productSnapshot = {
      snapshotVersion: 1,
      productId: nextProductId,
      productNo: productId,
      categoryKey,
      modelKey,
      platform,
      coverText,
      coverTitle,
      title,
      subtitle,
      price,
      originPrice,
      recyclePrice,
      tagText,
      coverImage,
      heroImage: coverImage,
      detailImages: submissionImages,
      recyclable: Boolean(recyclable),
      premiumCondition: false,
      certifiedPrice: false,
      releaseOrder,
      heroTheme,
      heroAccent,
      editionLabel,
      featureTags,
      shoppingTextA,
      shoppingTextB,
      shoppingTextC,
      description,
      capturedAt: now,
    };

    await connection.query(
      `
        INSERT INTO products (
          id, product_id, category_key, model_key, platform, cover_text, cover_title, title, subtitle,
          price, origin_price, recycle_price, tag_text, hero_image, in_stock, recyclable, recycle_target_category_key, premium_condition,
          certified_price, release_order, hero_theme, hero_accent, edition_label, feature_tags, shopping_textA,
          shopping_textB, shopping_textC, description, content, stock, min_stock, stock_display, ischeck, status, is_deleted,
          unit, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `,
      [
        nextProductId,
        productId,
        categoryKey,
        modelKey,
        platform,
        coverText,
        coverTitle,
        title,
        subtitle,
        price,
        originPrice,
        recyclePrice,
        tagText,
        coverImage,
        recyclable,
        recycleTargetCategoryKey,
        releaseOrder,
        heroTheme,
        heroAccent,
        editionLabel,
        JSON.stringify(featureTags),
        shoppingTextA,
        shoppingTextB,
        shoppingTextC,
        description,
        content,
        stock,
        minStock,
        stockDisplay,
        ischeck,
        status,
        unit,
        now,
        now,
      ]
    );

    for (let index = 0; index < submissionImages.length; index += 1) {
      const imageUrl = normalizeText(submissionImages[index]);
      if (!imageUrl) {
        continue;
      }

      await connection.execute(
        `
          INSERT INTO product_images (
            source_key, product_id, image_type, image_url, sort_order, is_main, status, is_deleted, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
        `,
        [
          `recycle-publish:${crypto.randomBytes(6).toString('hex')}`,
          nextProductId,
          index === 0 ? 'hero' : 'detail',
          imageUrl,
          index,
          index === 0 ? 1 : 0,
          now,
          now,
        ]
      );
    }

    await connection.execute(
      `
        UPDATE recycle_orders
        SET category_key = ?, title = ?, cover_label = ?, cover_theme = ?, option_summary = ?, selected_device_option_values = ?,
            selected_device_option_texts = ?, submission_images = ?, estimate_supported = ?, estimate_base_price = ?,
            estimate_final_price = ?, note = ?, status = 'published', review_note = ?, product_snapshot_json = ?, published_product_id = ?,
            reviewed_by = ?, reviewed_at = ?, published_at = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        current.categoryKey || categoryKey,
        current.title,
        current.coverLabel,
        current.coverTheme,
        current.optionSummary,
        JSON.stringify(current.selectedDeviceOptionValues || {}),
        JSON.stringify(current.selectedDeviceOptionTexts || {}),
        JSON.stringify(submissionImages),
        current.estimateSupported ? 1 : 0,
        current.estimateBasePrice,
        current.estimateFinalPrice,
        current.note,
        reviewNote,
        JSON.stringify(productSnapshot),
        nextProductId,
        adminId ? Number(adminId || 0) : null,
        now,
        now,
        now,
        submissionId,
      ]
    );

    const nextRow = await getSubmissionRowById(connection, submissionId);
    const next = nextRow ? mapSubmissionRow(nextRow) : null;
    await createReviewRecord(connection, {
      submissionId,
      action: 'publish',
      reviewNote,
      beforeSnapshot: current,
      afterSnapshot: next,
      adminId,
      publishedProductId: nextProductId,
    });

    await connection.commit();
    await exportProductCatalogSnapshot();
    const product = await getAdminGoodsById(nextProductId);
    return {
      submission: next,
      product,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const initRecycleReviewAdminDatabase = async () => {
  await getPool().query('SELECT 1');
};

module.exports = {
  completeAdminRecycleSubmissionInspection,
  createAdminRecycleSubmission,
  deleteAdminRecycleSubmission,
  deleteAdminRecycleSubmissions,
  initRecycleReviewAdminDatabase,
  listAdminRecycleSubmissions,
  listRecycleSubmissionReviews,
  publishAdminRecycleSubmission,
  updateAdminRecycleSubmissionInfo,
  updateAdminRecycleSubmissionReport,
  updateAdminRecycleSubmission,
};

