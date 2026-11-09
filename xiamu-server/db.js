// 数据库访问与业务编号生成模块。
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DEFAULT_PAYOUT_METHOD = '\u5fae\u4fe1\u96f6\u94b1';
const UID_SEQUENCE_BASE = 100000;
const PAYABLE_PURCHASE_ORDER_STATUSES = new Set(['submitted', 'pending_payment']);
const PAID_PURCHASE_ORDER_STATUSES = new Set(['paid', 'received', 'finished']);
const PURCHASE_ORDER_RESERVATION_TTL_MS = 15 * 60 * 1000;

let pool;

const PRODUCT_CATALOG_IMPORT_FILE = path.resolve(__dirname, 'cloud-data/product_catalog_import.json');
const PRODUCT_IMAGE_IMPORT_FILE = path.resolve(__dirname, 'cloud-data/product_image_import.json');

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

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

const closePool = async () => {
  if (pool) {
    const currentPool = pool;
    pool = null;
    await currentPool.end();
  }
};

const normalizePayoutMethod = () => DEFAULT_PAYOUT_METHOD;

const formatTimestampText = (value) => {
  const timestamp = Number(value || 0);
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const pad = (input) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
};

const normalizeRealtimeValue = (value) => {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return formatTimestampText(value.getTime());
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value);
};

const isTemporaryAvatarUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return true;
  }

  return /^wxfile:\/\//i.test(normalized)
    || /^https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?\//i.test(normalized)
    || /^https?:\/\/tmp\//i.test(normalized);
};

const normalizePersistedAvatarUrl = (value, fallbackValue = '') => {
  const normalized = String(value || '').trim();
  if (!normalized || isTemporaryAvatarUrl(normalized)) {
    return String(fallbackValue || '').trim();
  }

  return normalized;
};

const safeParseJsonMap = (value) => {
  if (!value) {
    return {};
  }

  let parsed = value;
  try {
    if (typeof value === 'string') {
      parsed = JSON.parse(value);
    }
  } catch (_error) {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return Object.keys(parsed).reduce((result, key) => {
    const currentValue = parsed[key];
    if (typeof currentValue === 'string') {
      result[key] = currentValue;
    }
    return result;
  }, {});
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
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  } catch (_error) {
    return [];
  }
};

const mapUserRow = (row) => ({
  id: Number(row.id),
  displayId: Number(row.display_id || deriveDisplayIdFromUid(row.uid) || 0),
  openId: String(row.open_id || ''),
  unionId: String(row.union_id || ''),
  uid: String(row.uid || ''),
  nickname: String(row.nickname || ''),
  avatarUrl: String(row.avatar_url || ''),
  phone: String(row.phone || ''),
  payoutMethod: normalizePayoutMethod(row.payout_method),
  payoutAccount: String(row.payout_account || ''),
  realName: String(row.real_name || ''),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: normalizeRealtimeValue(row.created_at_realtime),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: normalizeRealtimeValue(row.updated_at_realtime),
  lastLoginAt: Number(row.last_login_at || 0),
  lastLoginAtRealtime: normalizeRealtimeValue(row.last_login_at_realtime),
});

const mapPurchaseOrderRow = (row) => ({
  id: Number(row.id),
  openId: String(row.open_id || ''),
  productId: Number(row.product_id || 0),
  productCodeSnapshot: String(row.product_code_snapshot || ''),
  productTitleSnapshot: String(row.product_title_snapshot || ''),
  productCoverSnapshot: String(row.product_cover_snapshot || ''),
  productCoverTitleSnapshot: String(row.product_cover_title_snapshot || ''),
  productPriceSnapshot: Number(row.product_price_snapshot || 0),
  addressId: Number(row.address_id || 0),
  orderNo: String(row.order_no || ''),
  sourceMode: String(row.source_mode || 'buy'),
  recipientName: String(row.recipient_name || ''),
  recipientPhone: String(row.recipient_phone || ''),
  addressDetail: String(row.address_detail || ''),
  paymentMethod: String(row.payment_method || ''),
  remark: String(row.remark || ''),
  totalAmount: Number(row.total_amount || 0),
  status: String(row.status || 'submitted'),
  outTradeNo: String(row.out_trade_no || ''),
  paymentBatchId:
    row.payment_batch_id === null || row.payment_batch_id === undefined ? null : Number(row.payment_batch_id || 0),
  paymentBatchSize: Math.max(1, Number(row.payment_batch_size || 1)),
  determineBatches: Boolean(row.determine_batches),
  stockReserved: Boolean(row.stock_reserved),
  paidAt: Number(row.paid_at || 0),
  paidAtRealtime: normalizeRealtimeValue(row.paid_at_realtime),
  paymentTransactionId: String(row.payment_transaction_id || ''),
  wechatOrderSyncStatus: String(row.wechat_order_sync_status || 'pending'),
  wechatOrderSyncError: String(row.wechat_order_sync_error || ''),
  wechatOrderSyncedAt: Number(row.wechat_order_synced_at || 0),
  wechatServiceStatus: String(row.wechat_service_status || 'unknown'),
  wechatServiceStatusError: String(row.wechat_service_status_error || ''),
  wechatServiceStatusSyncedAt: Number(row.wechat_service_status_synced_at || 0),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: normalizeRealtimeValue(row.created_at_realtime),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: normalizeRealtimeValue(row.updated_at_realtime),
  shipData: (() => {
    if (!row.ship_data) {
      return null;
    }

    try {
      const parsed = typeof row.ship_data === 'string' ? JSON.parse(row.ship_data) : row.ship_data;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      return {
        expressCompany: String(parsed.express_company || ''),
        expressNo: String(parsed.express_no || ''),
        expressTime: String(parsed.express_time || ''),
      };
    } catch (_error) {
      return null;
    }
  })(),
});

const mapPaymentBatchRow = (row) => {
  let orderIds = [];

  try {
    const parsedOrderIds = typeof row.order_ids === 'string' ? JSON.parse(row.order_ids || '[]') : row.order_ids;
    if (Array.isArray(parsedOrderIds)) {
      orderIds = parsedOrderIds.map((id) => Number(id || 0)).filter((id) => id > 0);
    }
  } catch (_error) {
    orderIds = [];
  }

  return {
    id: Number(row.id),
    openId: String(row.open_id || ''),
    batchNo: String(row.batch_no || ''),
    outTradeNo: String(row.out_trade_no || ''),
    orderIds,
    totalAmount: Number(row.total_amount || 0),
    status: String(row.status || 'pending_payment'),
    transactionId: String(row.transaction_id || ''),
    paidAt: Number(row.paid_at || 0),
    paidAtRealtime: normalizeRealtimeValue(row.paid_at_realtime),
    createdAt: Number(row.created_at || 0),
    createdAtRealtime: normalizeRealtimeValue(row.created_at_realtime),
    updatedAt: Number(row.updated_at || 0),
    updatedAtRealtime: normalizeRealtimeValue(row.updated_at_realtime),
  };
};

const mapAddressRow = (row) => ({
  id: Number(row.id),
  openId: String(row.open_id || ''),
  recipientName: String(row.recipient_name || ''),
  recipientPhone: String(row.recipient_phone || ''),
  province: String(row.province || ''),
  city: String(row.city || ''),
  district: String(row.district || ''),
  addressDetail: String(row.address_detail || ''),
  postalCode: String(row.postal_code || ''),
  isDefault: Boolean(row.is_default),
  status: Number(row.status || 0),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: normalizeRealtimeValue(row.created_at_realtime),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: normalizeRealtimeValue(row.updated_at_realtime),
});

const normalizeRecycleTradeStatus = (value) => {
  const normalized = String(value || 'submitted').trim() || 'submitted';
  return normalized === 'user_cancelled' ? 'submitted' : normalized;
};

const normalizeRecycleUserStatus = (value, fallback = 'confirmed') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cancelled' || normalized === 'confirmed') {
    return normalized;
  }
  return fallback === 'cancelled' ? 'cancelled' : 'confirmed';
};

const normalizeRecycleUserResponseStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'accepted_quote' || normalized === 'take_back_requested') {
    return normalized;
  }
  return '';
};

const normalizeRecycleReturnAddress = (value, { requireComplete = false } = {}) => {
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
    recipientName: String(pick('recipientName', 'recipient_name', 'name') || '').trim().slice(0, 64),
    recipientPhone: String(pick('recipientPhone', 'recipient_phone', 'phone', 'mobile') || '').trim().slice(0, 32),
    province: String(pick('province') || '').trim().slice(0, 64),
    city: String(pick('city') || '').trim().slice(0, 64),
    district: String(pick('district', 'county') || '').trim().slice(0, 64),
    addressDetail: String(pick('addressDetail', 'address_detail', 'detail') || '').trim().slice(0, 255),
  };

  const hasAddress = [
    returnAddress.recipientName,
    returnAddress.recipientPhone,
    returnAddress.province,
    returnAddress.city,
    returnAddress.district,
    returnAddress.addressDetail,
  ].some(Boolean);
  if (!hasAddress || (requireComplete && (!returnAddress.recipientName || !returnAddress.recipientPhone || !returnAddress.addressDetail))) {
    return null;
  }
  return returnAddress;
};

const KNOWN_RECYCLE_SETTLEMENT_STATES = new Set([
  'ADMIN_CONFIRMED',
  'PENDING',
  'ACCEPTED',
  'PROCESSING',
  'WAIT_USER_CONFIRM',
  'TRANSFERING',
  'SUCCESS',
  'FAIL',
  'CANCEL',
  'CANCELING',
  'CANCELLED',
]);

const normalizeRecycleSettlementState = (value, fallback = 'PENDING') => {
  const normalized = String(value || '').trim().toUpperCase();
  if (KNOWN_RECYCLE_SETTLEMENT_STATES.has(normalized)) {
    return normalized;
  }
  return String(fallback || 'PENDING').trim().toUpperCase() || 'PENDING';
};

const parseWechatDatetimeToTimestamp = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return 0;
  }

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const mapRecycleSettlementRow = (row) => ({
  id: Number(row.id || 0),
  recycleOrderId: Number(row.recycle_order_id || 0),
  openId: String(row.open_id || ''),
  orderNo: String(row.order_no || ''),
  outBillNo: String(row.out_bill_no || ''),
  transferBillNo: String(row.transfer_bill_no || ''),
  appId: String(row.appid || ''),
  mchId: String(row.mchid || ''),
  amount: Number(row.amount || 0),
  state: normalizeRecycleSettlementState(row.state),
  stateDesc: String(row.state_desc || ''),
  transferRemark: String(row.transfer_remark || ''),
  packageInfo: String(row.package_info || ''),
  userName: String(row.user_name || ''),
  userRecvPerception: String(row.user_recv_perception || ''),
  failReason: String(row.fail_reason || ''),
  wechatCreateTime: String(row.wechat_create_time || ''),
  acceptTime: Number(row.accept_time || 0),
  acceptTimeRealtime: normalizeRealtimeValue(row.accept_time_realtime),
  successTime: Number(row.success_time || 0),
  successTimeRealtime: normalizeRealtimeValue(row.success_time_realtime),
  cancelTime: Number(row.cancel_time || 0),
  cancelTimeRealtime: normalizeRealtimeValue(row.cancel_time_realtime),
  paymentProofImages: safeParseJsonArray(row.payment_proof_images),
  notifyRaw: String(row.notify_raw || ''),
  queryRaw: String(row.query_raw || ''),
  adminId: row.admin_id === null || row.admin_id === undefined ? null : Number(row.admin_id || 0),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: normalizeRealtimeValue(row.created_at_realtime),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: normalizeRealtimeValue(row.updated_at_realtime),
});

const normalizeSfExpressNumber = (value) => String(value || '').trim().slice(0, 128);

const extractSfExpressNumberFromNote = (note) => {
  const source = String(note || '').trim();
  if (!source || !source.includes('顺丰')) {
    return '';
  }

  const matched = source.match(/(?:顺丰(?:运单|快递)?单号|快递单号)\s*[:：]\s*([^\r\n；;]+)/i);
  return matched ? normalizeSfExpressNumber(matched[1]) : '';
};

const resolveSfExpressNumber = (payload = {}) => normalizeSfExpressNumber(
  payload.sfExpressNumber ?? payload.sf_express_number ?? payload.waybillNo
) || extractSfExpressNumberFromNote(payload.note);

const mapRecycleOrderRow = (row) => ({
  id: Number(row.id),
  openId: String(row.open_id || ''),
  recycleProductId: row.recycle_product_id === null || row.recycle_product_id === undefined ? null : Number(row.recycle_product_id || 0),
  orderNo: String(row.order_no || ''),
  categoryKey: String(row.category_key || ''),
  itemSource: String(row.item_source || '微信小程序'),
  title: String(row.title || ''),
  coverLabel: String(row.cover_label || ''),
  coverImage: String(row.cover_image || row.recycle_product_cover_image || ''),
  coverTheme: String(row.cover_theme || 'red'),
  payoutMethodLabel: String(row.payout_method_label || ''),
  accountNumber: String(row.account_number || ''),
  realName: String(row.real_name || ''),
  optionSummary: String(row.option_summary || ''),
  selectedDeviceOptionValues: safeParseJsonMap(row.selected_device_option_values),
  selectedDeviceOptionTexts: safeParseJsonMap(row.selected_device_option_texts),
  submissionImages: safeParseJsonArray(row.submission_images),
  estimateSupported: Boolean(row.estimate_supported),
  estimateBasePrice: Number(row.estimate_base_price || 0),
  estimateFinalPrice: Number(row.estimate_final_price || 0),
  note: String(row.note || ''),
  sfExpressNumber: String(row.sf_express_number || ''),
  status: normalizeRecycleTradeStatus(row.status),
  userStatus: normalizeRecycleUserStatus(row.user_status, row.status === 'user_cancelled' ? 'cancelled' : 'confirmed'),
  userResponseStatus: normalizeRecycleUserResponseStatus(row.user_response_status),
  returnAddress: normalizeRecycleReturnAddress(row.return_address_json ?? row.return_address ?? row.returnAddress),
  reviewNote: String(row.review_note || ''),
  productSnapshot: safeParseJsonObject(row.product_snapshot_json),
  publishedProductId: row.published_product_id === null || row.published_product_id === undefined ? null : Number(row.published_product_id || 0),
  reviewedBy: row.reviewed_by === null || row.reviewed_by === undefined ? null : Number(row.reviewed_by || 0),
  reviewedAt: Number(row.reviewed_at || 0),
  reviewedAtRealtime: normalizeRealtimeValue(row.reviewed_at_realtime),
  publishedAt: Number(row.published_at || 0),
  publishedAtRealtime: normalizeRealtimeValue(row.published_at_realtime),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: normalizeRealtimeValue(row.created_at_realtime),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: normalizeRealtimeValue(row.updated_at_realtime),
});

const createProductsTableSql = `
  CREATE TABLE IF NOT EXISTS products (
    id BIGINT NOT NULL,
    product_id VARCHAR(32) NOT NULL DEFAULT '',
    category_key VARCHAR(32) NOT NULL DEFAULT '',
    model_key VARCHAR(64) NOT NULL DEFAULT '',
    platform VARCHAR(32) NOT NULL DEFAULT '',
    cover_text VARCHAR(32) NOT NULL DEFAULT '',
    cover_title VARCHAR(64) NOT NULL DEFAULT '',
    title VARCHAR(128) NOT NULL DEFAULT '',
    subtitle VARCHAR(255) NOT NULL DEFAULT '',
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tag_text VARCHAR(64) NOT NULL DEFAULT '',
    hero_image VARCHAR(255) NOT NULL DEFAULT '',
    in_stock TINYINT(1) NOT NULL DEFAULT 1,
    recyclable TINYINT(1) NOT NULL DEFAULT 0,
    recycle_target_category_key VARCHAR(32) NOT NULL DEFAULT '',
    premium_condition TINYINT(1) NOT NULL DEFAULT 0,
    certified_price TINYINT(1) NOT NULL DEFAULT 0,
    release_order INT NOT NULL DEFAULT 0,
    hero_theme VARCHAR(32) NOT NULL DEFAULT 'others',
    hero_accent VARCHAR(128) NOT NULL DEFAULT '',
    edition_label VARCHAR(64) NOT NULL DEFAULT '',
    feature_tags JSON DEFAULT NULL,
    shopping_textA VARCHAR(255) NOT NULL DEFAULT '',
    shopping_textB TEXT,
    shopping_textC TEXT,
    status TINYINT NOT NULL DEFAULT 1,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_products_category_status (category_key, status, is_deleted),
    KEY idx_products_release_order (release_order),
    KEY idx_products_model_key (model_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createProductImagesTableSql = `
  CREATE TABLE IF NOT EXISTS product_images (
    id BIGINT NOT NULL AUTO_INCREMENT,
    source_key VARCHAR(64) NOT NULL,
    product_id BIGINT NOT NULL,
    image_type VARCHAR(32) NOT NULL DEFAULT 'detail',
    image_url VARCHAR(255) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    is_main TINYINT(1) NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_product_images_source_key (source_key),
    KEY idx_product_images_product_id (product_id),
    KEY idx_product_images_visible (product_id, status, is_deleted, sort_order),
    CONSTRAINT fk_product_images_product_id
      FOREIGN KEY (product_id) REFERENCES products(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createUsersTableSql = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    open_id VARCHAR(64) NOT NULL,
    union_id VARCHAR(64) NOT NULL DEFAULT '',
    uid VARCHAR(32) DEFAULT NULL,
    display_id INT DEFAULT NULL,
    nickname VARCHAR(100) NOT NULL DEFAULT '',
    avatar_url TEXT,
    phone VARCHAR(32) NOT NULL DEFAULT '',
    payout_method VARCHAR(32) NOT NULL DEFAULT '${DEFAULT_PAYOUT_METHOD}',
    payout_account VARCHAR(128) NOT NULL DEFAULT '',
    real_name VARCHAR(64) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    last_login_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_users_open_id (open_id),
    UNIQUE KEY uniq_users_uid (uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createPurchaseOrdersTableSql = `
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGINT NOT NULL AUTO_INCREMENT,
    open_id VARCHAR(64) NOT NULL,
    product_id BIGINT DEFAULT NULL,
    product_code_snapshot VARCHAR(32) NOT NULL DEFAULT '',
    product_title_snapshot VARCHAR(128) NOT NULL DEFAULT '',
    product_cover_snapshot VARCHAR(255) NOT NULL DEFAULT '',
    product_cover_title_snapshot VARCHAR(64) NOT NULL DEFAULT '',
    product_price_snapshot DECIMAL(10, 2) NOT NULL DEFAULT 0,
    address_id BIGINT DEFAULT NULL,
    order_no VARCHAR(32) DEFAULT NULL,
    source_mode VARCHAR(16) NOT NULL DEFAULT 'buy',
    recipient_name VARCHAR(64) NOT NULL DEFAULT '',
    recipient_phone VARCHAR(32) NOT NULL DEFAULT '',
    address_detail VARCHAR(255) NOT NULL DEFAULT '',
    payment_method VARCHAR(32) NOT NULL DEFAULT '',
    remark VARCHAR(255) NOT NULL DEFAULT '',
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'submitted',
    out_trade_no VARCHAR(64) NOT NULL DEFAULT '',
    payment_batch_id BIGINT DEFAULT NULL,
    payment_batch_size INT NOT NULL DEFAULT 1,
    determine_batches TINYINT(1) NOT NULL DEFAULT 0,
    stock_reserved TINYINT(1) NOT NULL DEFAULT 0,
    paid_at BIGINT NOT NULL DEFAULT 0,
    payment_transaction_id VARCHAR(128) NOT NULL DEFAULT '',
    wechat_order_sync_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    wechat_order_sync_error VARCHAR(512) NOT NULL DEFAULT '',
    wechat_order_synced_at BIGINT NOT NULL DEFAULT 0,
    wechat_service_status VARCHAR(64) NOT NULL DEFAULT 'unknown',
    wechat_service_status_error VARCHAR(512) NOT NULL DEFAULT '',
    wechat_service_status_synced_at BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_purchase_orders_open_id_created_at (open_id, created_at),
    UNIQUE KEY uniq_purchase_orders_order_no (order_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createPaymentBatchesTableSql = `
  CREATE TABLE IF NOT EXISTS payment_batches (
    id BIGINT NOT NULL AUTO_INCREMENT,
    open_id VARCHAR(64) NOT NULL,
    batch_no VARCHAR(64) NOT NULL,
    out_trade_no VARCHAR(64) NOT NULL,
    order_ids TEXT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
    transaction_id VARCHAR(128) NOT NULL DEFAULT '',
    paid_at BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_payment_batches_batch_no (batch_no),
    UNIQUE KEY uniq_payment_batches_out_trade_no (out_trade_no),
    KEY idx_payment_batches_open_id_created_at (open_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAddressesTableSql = `
  CREATE TABLE IF NOT EXISTS addresses (
    id BIGINT NOT NULL AUTO_INCREMENT,
    open_id VARCHAR(64) NOT NULL,
    belong_to_username VARCHAR(64) NOT NULL DEFAULT '',
    belong_to_uid VARCHAR(32) NOT NULL DEFAULT '',
    recipient_name VARCHAR(64) NOT NULL DEFAULT '',
    recipient_phone VARCHAR(32) NOT NULL DEFAULT '',
    province VARCHAR(64) NOT NULL DEFAULT '',
    city VARCHAR(64) NOT NULL DEFAULT '',
    district VARCHAR(64) NOT NULL DEFAULT '',
    address_detail VARCHAR(255) NOT NULL DEFAULT '',
    postal_code VARCHAR(16) NOT NULL DEFAULT '',
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_addresses_open_id_created_at (open_id, created_at),
    KEY idx_addresses_open_id_default (open_id, is_default, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleOrdersTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_orders (
    id BIGINT NOT NULL AUTO_INCREMENT,
    open_id VARCHAR(64) NOT NULL,
    recycle_product_id BIGINT DEFAULT NULL,
    order_no VARCHAR(32) NOT NULL DEFAULT '',
    category_key VARCHAR(32) NOT NULL DEFAULT '',
    item_source VARCHAR(64) NOT NULL DEFAULT '微信小程序',
    title VARCHAR(128) NOT NULL DEFAULT '',
    cover_label VARCHAR(64) NOT NULL DEFAULT '',
    cover_image VARCHAR(1024) NOT NULL DEFAULT '',
    cover_theme VARCHAR(16) NOT NULL DEFAULT 'red',
    payout_method_label VARCHAR(32) NOT NULL DEFAULT '',
    account_number VARCHAR(128) NOT NULL DEFAULT '',
    real_name VARCHAR(64) NOT NULL DEFAULT '',
    option_summary VARCHAR(255) NOT NULL DEFAULT '',
    selected_device_option_values LONGTEXT,
    selected_device_option_texts LONGTEXT,
    submission_images LONGTEXT,
    estimate_supported TINYINT(1) NOT NULL DEFAULT 0,
    estimate_base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    estimate_final_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NOT NULL DEFAULT '',
    sf_express_number VARCHAR(128) NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'submitted',
    user_status VARCHAR(16) NOT NULL DEFAULT 'confirmed',
    user_response_status VARCHAR(32) NOT NULL DEFAULT '',
    return_address_json LONGTEXT,
    review_note LONGTEXT,
    report_description LONGTEXT,
    product_snapshot_json LONGTEXT,
    published_product_id BIGINT DEFAULT NULL,
    reviewed_by BIGINT DEFAULT NULL,
    reviewed_at BIGINT NOT NULL DEFAULT 0,
    published_at BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_recycle_orders_open_id_created_at (open_id, created_at),
    KEY idx_recycle_orders_status_created_at (status, created_at),
    KEY idx_recycle_orders_published_product_id (published_product_id),
    UNIQUE KEY uniq_recycle_orders_order_no (order_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleSubmissionReviewsTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_submission_reviews (
    id BIGINT NOT NULL AUTO_INCREMENT,
    submission_id BIGINT NOT NULL,
    action VARCHAR(32) NOT NULL DEFAULT '',
    review_note LONGTEXT,
    before_snapshot LONGTEXT,
    after_snapshot LONGTEXT,
    admin_id BIGINT DEFAULT NULL,
    published_product_id BIGINT DEFAULT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_recycle_submission_reviews_submission_created_at (submission_id, created_at),
    KEY idx_recycle_submission_reviews_admin_created_at (admin_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleSettlementsTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_settlements (
    id BIGINT NOT NULL AUTO_INCREMENT,
    recycle_order_id BIGINT NOT NULL,
    open_id VARCHAR(64) NOT NULL DEFAULT '',
    order_no VARCHAR(32) NOT NULL DEFAULT '',
    out_bill_no VARCHAR(64) NOT NULL DEFAULT '',
    transfer_bill_no VARCHAR(64) NOT NULL DEFAULT '',
    appid VARCHAR(64) NOT NULL DEFAULT '',
    mchid VARCHAR(64) NOT NULL DEFAULT '',
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    state VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    state_desc VARCHAR(255) NOT NULL DEFAULT '',
    transfer_remark VARCHAR(128) NOT NULL DEFAULT '',
    package_info VARCHAR(255) NOT NULL DEFAULT '',
    user_name VARCHAR(64) NOT NULL DEFAULT '',
    user_recv_perception VARCHAR(255) NOT NULL DEFAULT '',
    fail_reason LONGTEXT,
    wechat_create_time VARCHAR(64) NOT NULL DEFAULT '',
    accept_time BIGINT NOT NULL DEFAULT 0,
    success_time BIGINT NOT NULL DEFAULT 0,
    cancel_time BIGINT NOT NULL DEFAULT 0,
    payment_proof_images LONGTEXT,
    notify_raw LONGTEXT,
    query_raw LONGTEXT,
    admin_id BIGINT DEFAULT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_recycle_settlements_out_bill_no (out_bill_no),
    KEY idx_recycle_settlements_recycle_order_id_created_at (recycle_order_id, created_at),
    KEY idx_recycle_settlements_open_id_created_at (open_id, created_at),
    KEY idx_recycle_settlements_state_created_at (state, created_at),
    KEY idx_recycle_settlements_transfer_bill_no (transfer_bill_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createIdentifierSequencesTableSql = `
  CREATE TABLE IF NOT EXISTS identifier_sequences (
    sequence_key VARCHAR(64) NOT NULL,
    current_value BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (sequence_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const toOrderDateKey = (timestamp = Date.now()) => {
  const date = new Date(Number(timestamp || Date.now()));
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const USER_UID_SEQUENCE_KEY = 'user_uid';
const ADMIN_UID_SEQUENCE_KEY = 'admin_uid';
const buildUserUid = (id) => `${String(Math.max(0, Number(id || 0))).padStart(6, '0')}XM`;
const buildAdminUid = (sequence) => `${UID_SEQUENCE_BASE + Number(sequence || 0)}AD`;
const deriveDisplayIdFromUid = (uid) => {
  const normalizedUid = String(uid || '').trim().toUpperCase();
  const match = normalizedUid.match(/^(\d{6,})XM$/);
  if (!match) {
    return 0;
  }

  const displayId = Number(match[1]);
  return Number.isFinite(displayId) && displayId > 0 ? displayId : 0;
};
const buildOrderNo = (timestamp, sequence) => `PLY${toOrderDateKey(timestamp)}${String(Number(sequence || 0)).padStart(3, '0')}`;
const getPurchaseOrderSequenceKey = (timestamp) => `purchase_order_no:${toOrderDateKey(timestamp)}`;
const buildRecycleOrderNo = (timestamp, sequence) => `PLYR${toOrderDateKey(timestamp)}${String(Number(sequence || 0)).padStart(3, '0')}`;
const getRecycleOrderSequenceKey = (timestamp) => `recycle_order_no:${toOrderDateKey(timestamp)}`;
const buildBatchPaymentNo = (timestamp, sequence) =>
  `PLY${toOrderDateKey(timestamp)}${String(Number(sequence || 0)).padStart(3, '0')}S`;
const getBatchPaymentSequenceKey = (timestamp) => `payment_batch:${toOrderDateKey(timestamp)}`;
const buildPurchasePaymentOutTradeNo = (timestamp, orderId) =>
  `PYP${toOrderDateKey(timestamp)}${String(Number(orderId || 0)).padStart(8, '0')}`;

const parsePaymentBatchOrderIds = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.map((id) => Number(id || 0)).filter((id) => id > 0) : [];
  } catch (_error) {
    return [];
  }
};

const getNextSequenceValue = async (connection, sequenceKey) => {
  const now = Date.now();
  const [result] = await connection.execute(
    `
      INSERT INTO identifier_sequences (sequence_key, current_value, updated_at)
      VALUES (?, 1, ?)
      ON DUPLICATE KEY UPDATE
        current_value = LAST_INSERT_ID(current_value + 1),
        updated_at = VALUES(updated_at)
    `,
    [String(sequenceKey || ''), now]
  );

  return Number(result.insertId || 0) || 1;
};

// 所有回收单（含后台手动新增）共用同一日期序号，避免编号规则或并发分配出现差异。
const allocateRecycleOrderNo = async (connection, timestamp = Date.now()) => {
  const orderTimestamp = Number(timestamp || Date.now());
  const sequence = await getNextSequenceValue(connection, getRecycleOrderSequenceKey(orderTimestamp));
  return buildRecycleOrderNo(orderTimestamp, sequence);
};

const setSequenceValue = async (executor, sequenceKey, value) => {
  const normalizedValue = Math.max(0, Number(value || 0));
  await executor.execute(
    `
      INSERT INTO identifier_sequences (sequence_key, current_value, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        current_value = GREATEST(current_value, VALUES(current_value)),
        updated_at = VALUES(updated_at)
    `,
    [String(sequenceKey || ''), normalizedValue, Date.now()]
  );
};

const backfillUserUids = async () => {
  const poolInstance = getPool();
  const [rows] = await poolInstance.execute(
    `
      SELECT id, uid, display_id
      FROM users
      ORDER BY created_at ASC, id ASC
    `
  );

  for (const row of rows) {
    const expectedDisplayId = Number(row.id || 0);
    const expectedUid = buildUserUid(expectedDisplayId);
    if (String(row.uid || '').trim().toUpperCase() === expectedUid && Number(row.display_id || 0) === expectedDisplayId) {
      continue;
    }

    await poolInstance.execute('UPDATE users SET uid = ?, display_id = ? WHERE id = ?', [
      expectedUid,
      expectedDisplayId,
      Number(row.id || 0),
    ]);
  }

  const maxUserId = rows.reduce((maxValue, row) => Math.max(maxValue, Number(row.id || 0)), 0);
  await setSequenceValue(poolInstance, USER_UID_SEQUENCE_KEY, maxUserId);
};

const backfillOrderNos = async () => {
  const poolInstance = getPool();
  const connection = await poolInstance.getConnection();

  try {
    await connection.beginTransaction();
    const [purchaseRows] = await connection.execute(
      `
        SELECT id, created_at, paid_at, order_no
        FROM purchase_orders
        WHERE status IN ('paid', 'received', 'finished') OR IFNULL(paid_at, 0) > 0
        ORDER BY paid_at ASC, created_at ASC, id ASC
        FOR UPDATE
      `
    );
    const sequenceCounts = new Map();

    // Order numbers are a paid-purchase sequence. Recycle orders keep their own existing sequence.
    if (purchaseRows.length) {
      await connection.execute(
        `
          UPDATE purchase_orders
          SET order_no = NULL
          WHERE status IN ('paid', 'received', 'finished') OR IFNULL(paid_at, 0) > 0
        `
      );
    }

    for (const row of purchaseRows) {
      const timestamp = Number(row.paid_at || 0) || Number(row.created_at || Date.now());
      const dateKey = toOrderDateKey(timestamp);
      const nextSequence = Number(sequenceCounts.get(dateKey) || 0) + 1;
      const orderNo = buildOrderNo(timestamp, nextSequence);
      sequenceCounts.set(dateKey, nextSequence);
      await connection.execute('UPDATE purchase_orders SET order_no = ? WHERE id = ?', [orderNo, Number(row.id || 0)]);
    }

    for (const [dateKey, currentValue] of sequenceCounts.entries()) {
      await setSequenceValue(connection, `purchase_order_no:${dateKey}`, currentValue);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const backfillRecycleOrderNos = async () => {
  const poolInstance = getPool();
  const connection = await poolInstance.getConnection();

  try {
    await connection.beginTransaction();
    const [recycleRows] = await connection.execute(
      `
        SELECT id, created_at, order_no
        FROM recycle_orders
        ORDER BY created_at ASC, id ASC
        FOR UPDATE
      `
    );
    const sequenceCounts = new Map();
    const expectedRows = recycleRows.map((row) => {
      const timestamp = Number(row.created_at || Date.now());
      const dateKey = toOrderDateKey(timestamp);
      const nextSequence = Number(sequenceCounts.get(dateKey) || 0) + 1;
      sequenceCounts.set(dateKey, nextSequence);
      return {
        id: Number(row.id || 0),
        orderNo: buildRecycleOrderNo(timestamp, nextSequence),
        currentOrderNo: String(row.order_no || ''),
      };
    });

    // Release any legacy or manually changed value before assigning the unique PLYR numbers.
    for (const row of expectedRows) {
      if (row.currentOrderNo !== row.orderNo) {
        await connection.execute('UPDATE recycle_orders SET order_no = ? WHERE id = ?', [`TMP-R-${row.id}`, row.id]);
      }
    }
    for (const row of expectedRows) {
      if (row.currentOrderNo !== row.orderNo) {
        await connection.execute('UPDATE recycle_orders SET order_no = ? WHERE id = ?', [row.orderNo, row.id]);
      }
    }

    await connection.execute(
      `
        UPDATE recycle_settlements rs
        INNER JOIN recycle_orders ro ON ro.id = rs.recycle_order_id
        SET rs.order_no = ro.order_no
        WHERE rs.order_no <> ro.order_no
      `
    );
    for (const [dateKey, currentValue] of sequenceCounts.entries()) {
      await setSequenceValue(connection, `recycle_order_no:${dateKey}`, currentValue);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const backfillPaymentBatchNos = async () => {
  const poolInstance = getPool();
  const [rows] = await poolInstance.execute(
    `
      SELECT id, created_at, batch_no, out_trade_no
      FROM payment_batches
      ORDER BY created_at ASC, id ASC
    `
  );
  const sequenceCounts = new Map();

  for (const row of rows) {
    const timestamp = Number(row.created_at || Date.now());
    const dateKey = toOrderDateKey(timestamp);
    const nextSequence = Number(sequenceCounts.get(dateKey) || 0) + 1;
    const expectedBatchNo = buildBatchPaymentNo(timestamp, nextSequence);
    sequenceCounts.set(dateKey, nextSequence);

    if (String(row.batch_no || '') === expectedBatchNo && String(row.out_trade_no || '') === expectedBatchNo) {
      continue;
    }

    await poolInstance.execute('UPDATE payment_batches SET batch_no = ?, out_trade_no = ? WHERE id = ?', [
      expectedBatchNo,
      expectedBatchNo,
      Number(row.id || 0),
    ]);
  }

  for (const [dateKey, currentValue] of sequenceCounts.entries()) {
    await setSequenceValue(poolInstance, `payment_batch:${dateKey}`, currentValue);
  }
};

const backfillPurchaseOrderOutTradeNos = async () => {
  const poolInstance = getPool();
  await poolInstance.execute(
    `
      UPDATE purchase_orders
      SET out_trade_no = CONCAT('PYP', DATE_FORMAT(FROM_UNIXTIME(created_at / 1000), '%Y%m%d'), LPAD(id, 8, '0'))
      WHERE COALESCE(out_trade_no, '') = ''
    `
  );
};

const clearPendingPurchaseOrderNos = async () => {
  await getPool().execute(
    `
      UPDATE purchase_orders
      SET order_no = NULL
      WHERE NOT (status IN ('paid', 'received', 'finished') OR IFNULL(paid_at, 0) > 0)
        AND order_no IS NOT NULL
    `
  );
};

const assignPurchaseOrderNos = async (connection, rows, timestamp) => {
  const pendingRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => !String(row.order_no || '').trim())
    .sort((left, right) => {
      const leftCreatedAt = Number(left.created_at || 0);
      const rightCreatedAt = Number(right.created_at || 0);
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }

      return Number(left.id || 0) - Number(right.id || 0);
    });

  for (const row of pendingRows) {
    const orderNo = buildOrderNo(timestamp, await getNextSequenceValue(connection, getPurchaseOrderSequenceKey(timestamp)));
    await connection.execute('UPDATE purchase_orders SET order_no = ? WHERE id = ?', [orderNo, Number(row.id || 0)]);
    row.order_no = orderNo;
  }
};

const syncPurchaseOrderPaymentBatchFlags = async () => {
  const poolInstance = getPool();
  await poolInstance.execute(
    `
      UPDATE purchase_orders
      SET payment_batch_id = NULL, payment_batch_size = 1, determine_batches = 0
    `
  );

  const [rows] = await poolInstance.execute(
    `
      SELECT id, order_ids
      FROM payment_batches
      ORDER BY id ASC
    `
  );

  for (const row of rows) {
    const orderIds = parsePaymentBatchOrderIds(row.order_ids);
    if (!orderIds.length) {
      continue;
    }

    const placeholders = orderIds.map(() => '?').join(', ');
    const paymentBatchId = orderIds.length > 1 ? Number(row.id || 0) : null;
    await poolInstance.execute(
      `
        UPDATE purchase_orders
        SET payment_batch_id = ?, payment_batch_size = ?, determine_batches = ?
        WHERE id IN (${placeholders})
      `,
      [paymentBatchId, orderIds.length, orderIds.length > 1 ? 1 : 0, ...orderIds]
    );
  }
};

const ensureColumn = async ({ tableName, name, definition }) => {
  const poolInstance = getPool();
  const [rows] = await poolInstance.execute(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1
    `,
    [tableName, name]
  );

  if (!rows.length) {
    await poolInstance.query(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
  }
};

const ensureTimestampRealtimeColumns = async (tableName, timestampColumns = []) => {
  for (const columnName of timestampColumns) {
    await ensureColumn({
      tableName,
      name: `${columnName}_realtime`,
      definition: `DATETIME GENERATED ALWAYS AS (CASE WHEN \`${columnName}\` > 0 THEN FROM_UNIXTIME(\`${columnName}\` / 1000) ELSE NULL END) STORED AFTER \`${columnName}\``,
    });
  }
};

const alterColumnIfNeeded = async ({ tableName, name, definition, shouldAlter }) => {
  const poolInstance = getPool();
  const [rows] = await poolInstance.execute(
    `
      SELECT column_name, column_type, is_nullable, column_default, collation_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1
    `,
    [tableName, name]
  );

  if (!rows.length) {
    return;
  }

  if (typeof shouldAlter === 'function' && shouldAlter(rows[0])) {
    await poolInstance.query(`ALTER TABLE ${tableName} MODIFY COLUMN ${name} ${definition}`);
  }
};

const getExistingIndexNames = async (tableName) => {
  const [rows] = await getPool().execute(
    `
      SELECT index_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => String(row.index_name)));
};

const ensureIndex = async ({ tableName, indexName, definition }) => {
  const indexNames = await getExistingIndexNames(tableName);

  if (!indexNames.has(indexName)) {
    try {
      await getPool().query(`ALTER TABLE ${tableName} ADD ${definition}`);
    } catch (error) {
      if (!error || error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  }
};

const dropIndexIfExists = async (tableName, indexName) => {
  try {
    await getPool().query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  } catch (error) {
    if (!error || (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && error.code !== 'ER_DROP_INDEX_FK')) {
      throw error;
    }
  }
};

const readJsonLines = (filePath) => {
  if (!fs.existsSync(filePath)) {
    console.warn(`Import file not found, skipping sync: ${filePath}`);
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const toTinyInt = (value, defaultValue = 0) => {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value ? 1 : 0;
  }

  return defaultValue ? 1 : 0;
};

const toJsonArray = (value) => {
  if (!Array.isArray(value)) {
    return JSON.stringify([]);
  }

  return JSON.stringify(
    value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  );
};

const ensureProductsSchema = async () => {
  const poolInstance = getPool();

  await poolInstance.query(createProductsTableSql);
  await ensureColumn({ tableName: 'products', name: 'product_id', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER id" });
  await ensureColumn({ tableName: 'products', name: 'hero_image', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER tag_text" });
  await ensureColumn({ tableName: 'products', name: 'in_stock', definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER hero_image' });
  await ensureColumn({ tableName: 'products', name: 'reserved_stock', definition: 'INT NOT NULL DEFAULT 0' });
  await ensureColumn({ tableName: 'products', name: 'recyclable', definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER in_stock' });
  await ensureColumn({
    tableName: 'products',
    name: 'recycle_target_category_key',
    definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER recyclable",
  });
  await ensureColumn({
    tableName: 'products',
    name: 'premium_condition',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER recyclable',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'certified_price',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER premium_condition',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'release_order',
    definition: 'INT NOT NULL DEFAULT 0 AFTER certified_price',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'hero_theme',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'others' AFTER release_order",
  });
  await ensureColumn({
    tableName: 'products',
    name: 'hero_accent',
    definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER hero_theme",
  });
  await ensureColumn({
    tableName: 'products',
    name: 'edition_label',
    definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER hero_accent",
  });
  await ensureColumn({
    tableName: 'products',
    name: 'feature_tags',
    definition: 'JSON DEFAULT NULL AFTER edition_label',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'shopping_textA',
    definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER feature_tags",
  });
  await ensureColumn({
    tableName: 'products',
    name: 'shopping_textB',
    definition: 'TEXT AFTER shopping_textA',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'shopping_textC',
    definition: 'TEXT AFTER shopping_textB',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'status',
    definition: 'TINYINT NOT NULL DEFAULT 1 AFTER shopping_textC',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'is_deleted',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER status',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'created_at',
    definition: 'BIGINT NOT NULL DEFAULT 0 AFTER is_deleted',
  });
  await ensureColumn({
    tableName: 'products',
    name: 'updated_at',
    definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at',
  });
  await ensureTimestampRealtimeColumns('products', ['created_at', 'updated_at']);

  await dropIndexIfExists('products', 'uniq_products_model_key');
  await ensureIndex({
    tableName: 'products',
    indexName: 'idx_products_release_order',
    definition: 'INDEX idx_products_release_order (release_order)',
  });
  await ensureIndex({
    tableName: 'products',
    indexName: 'idx_products_category_status',
    definition: 'INDEX idx_products_category_status (category_key, status, is_deleted)',
  });
  await ensureIndex({
    tableName: 'products',
    indexName: 'idx_products_model_key',
    definition: 'INDEX idx_products_model_key (model_key)',
  });

  await poolInstance.query(createProductImagesTableSql);
  await ensureColumn({
    tableName: 'product_images',
    name: 'source_key',
    definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER id",
  });
  await ensureColumn({
    tableName: 'product_images',
    name: 'created_at',
    definition: 'BIGINT NOT NULL DEFAULT 0 AFTER is_deleted',
  });
  await ensureColumn({
    tableName: 'product_images',
    name: 'updated_at',
    definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at',
  });
  await ensureTimestampRealtimeColumns('product_images', ['created_at', 'updated_at']);
  await ensureIndex({
    tableName: 'product_images',
    indexName: 'uniq_product_images_source_key',
    definition: 'UNIQUE INDEX uniq_product_images_source_key (source_key)',
  });
  await ensureIndex({
    tableName: 'product_images',
    indexName: 'idx_product_images_product_id',
    definition: 'INDEX idx_product_images_product_id (product_id)',
  });
  await ensureIndex({
    tableName: 'product_images',
    indexName: 'idx_product_images_visible',
    definition: 'INDEX idx_product_images_visible (product_id, status, is_deleted, sort_order)',
  });
};

const syncProductCatalog = async () => {
  const products = readJsonLines(PRODUCT_CATALOG_IMPORT_FILE);
  if (!products.length) {
    return 0;
  }

  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    for (const product of products) {
      const productId = Number(product.id || 0);
      if (!productId) {
        continue;
      }

      await connection.execute(
        `
          INSERT INTO products (
            id, category_key, model_key, platform, cover_text, cover_title, title, subtitle,
            price, tag_text, hero_image, in_stock, recyclable, recycle_target_category_key, premium_condition, certified_price,
            release_order, hero_theme, hero_accent, edition_label, feature_tags, shopping_textA, shopping_textB,
            shopping_textC, status, is_deleted, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE id = id
        `,
        [
          productId,
          String(product.category_key || ''),
          String(product.model_key || ''),
          String(product.platform || ''),
          String(product.cover_text || ''),
          String(product.cover_title || ''),
          String(product.title || ''),
          String(product.subtitle || ''),
          Number(product.price || 0),
          String(product.tag_text || ''),
          String(product.hero_image || ''),
          toTinyInt(product.in_stock, 1),
          toTinyInt(product.recyclable, 0),
          String(product.recycle_target_category_key || ''),
          toTinyInt(product.premium_condition, 0),
          toTinyInt(product.certified_price, 0),
          Number(product.release_order || 0),
          String(product.hero_theme || 'others'),
          String(product.hero_accent || ''),
          String(product.edition_label || ''),
          toJsonArray(product.feature_tags),
          String(product.shopping_textA ?? ''),
          String(product.shopping_textB ?? ''),
          String(product.shopping_textC ?? ''),
          Number(product.status || 1),
          toTinyInt(product.is_deleted, 0),
          now,
          now,
        ]
      );
    }

    await connection.commit();
    return products.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const syncProductImages = async () => {
  const images = readJsonLines(PRODUCT_IMAGE_IMPORT_FILE);
  if (!images.length) {
    return 0;
  }

  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    for (const image of images) {
      const productId = Number(image.product_id || 0);
      const sourceKey = String(image._id || '');
      if (!productId || !sourceKey) {
        continue;
      }

      await connection.execute(
        `
          INSERT INTO product_images (
            source_key, product_id, image_type, image_url, sort_order, is_main, status, is_deleted, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM product_images WHERE source_key = ?
          )
        `,
        [
          sourceKey,
          productId,
          String(image.image_type || 'detail'),
          String(image.image_url || ''),
          Number(image.sort_order || 0),
          toTinyInt(image.is_main, 0),
          Number(image.status || 1),
          toTinyInt(image.is_deleted, 0),
          now,
          now,
          sourceKey,
        ]
      );
    }

    await connection.commit();
    return images.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const syncAddressOwnerFields = async (executor = getPool(), openId = '') => {
  const normalizedOpenId = String(openId || '').trim();
  const filters = [
    `NOT (
      a.belong_to_username <=> COALESCE(u.username, '')
      AND a.belong_to_uid <=> COALESCE(u.uid, '')
    )`,
  ];
  const params = [];
  if (normalizedOpenId) {
    filters.push('a.open_id = ?');
    params.push(normalizedOpenId);
  }

  await executor.execute(
    `
      UPDATE addresses a
      INNER JOIN users u ON u.open_id = a.open_id
      SET a.belong_to_username = COALESCE(u.username, ''),
          a.belong_to_uid = COALESCE(u.uid, '')
      WHERE ${filters.join(' AND ')}
    `
    ,
    params
  );
};

const ensureUsersSchema = async () => {
  const poolInstance = getPool();
  await poolInstance.query(createUsersTableSql);
  await ensureColumn({ tableName: 'users', name: 'union_id', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER open_id" });
  await ensureColumn({ tableName: 'users', name: 'uid', definition: 'VARCHAR(32) DEFAULT NULL AFTER union_id' });
  await ensureColumn({ tableName: 'users', name: 'display_id', definition: 'INT DEFAULT NULL AFTER uid' });
  await ensureColumn({ tableName: 'users', name: 'username', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER display_id" });
  await ensureColumn({ tableName: 'users', name: 'nickname', definition: "VARCHAR(100) NOT NULL DEFAULT '' AFTER display_id" });
  await ensureColumn({ tableName: 'users', name: 'avatar_url', definition: 'TEXT AFTER nickname' });
  await ensureColumn({ tableName: 'users', name: 'phone', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER avatar_url" });
  await ensureColumn({
    tableName: 'users',
    name: 'payout_method',
    definition: `VARCHAR(32) NOT NULL DEFAULT '${DEFAULT_PAYOUT_METHOD}' AFTER phone`,
  });
  await ensureColumn({
    tableName: 'users',
    name: 'payout_account',
    definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER payout_method",
  });
  await ensureColumn({ tableName: 'users', name: 'real_name', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER payout_account" });
  await ensureColumn({ tableName: 'users', name: 'created_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER real_name' });
  await ensureColumn({ tableName: 'users', name: 'updated_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at' });
  await ensureColumn({ tableName: 'users', name: 'last_login_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER updated_at' });
  await ensureTimestampRealtimeColumns('users', ['created_at', 'updated_at', 'last_login_at']);
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'uid',
    definition: 'VARCHAR(32) NULL DEFAULT NULL',
    shouldAlter: (column) => String(column.is_nullable || '').toUpperCase() !== 'YES',
  });
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'union_id',
    definition: "VARCHAR(64) NOT NULL DEFAULT ''",
    shouldAlter: (column) => String(column.column_default ?? '') !== '',
  });
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'nickname',
    definition: "VARCHAR(100) NOT NULL DEFAULT ''",
    shouldAlter: (column) => String(column.column_default ?? '') !== '',
  });
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'phone',
    definition: "VARCHAR(32) NOT NULL DEFAULT ''",
    shouldAlter: (column) => String(column.column_default ?? '') !== '',
  });
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'payout_account',
    definition: "VARCHAR(128) NOT NULL DEFAULT ''",
    shouldAlter: (column) => String(column.column_default ?? '') !== '',
  });
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'real_name',
    definition: "VARCHAR(64) NOT NULL DEFAULT ''",
    shouldAlter: (column) => String(column.column_default ?? '') !== '',
  });
  await alterColumnIfNeeded({
    tableName: 'users',
    name: 'payout_method',
    definition: `VARCHAR(32) NOT NULL DEFAULT '${DEFAULT_PAYOUT_METHOD}'`,
    shouldAlter: (column) => String(column.column_default ?? '') !== DEFAULT_PAYOUT_METHOD,
  });

  const [userColumns] = await poolInstance.execute(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users'
    `
  );
  const userColumnNames = new Set(userColumns.map((row) => String(row.column_name)));
  if (userColumnNames.has('alipay_bound')) {
    await poolInstance.query('ALTER TABLE users DROP COLUMN alipay_bound');
  }

  const [indexRows] = await poolInstance.query(`
    SELECT index_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'users'
  `);
  const indexNames = new Set(indexRows.map((row) => String(row.index_name)));

  if (indexNames.has('open_id') && !indexNames.has('uniq_users_open_id')) {
    await dropIndexIfExists('users', 'open_id');
  }

  if (indexNames.has('member_no')) {
    await dropIndexIfExists('users', 'member_no');
  }

  if (indexNames.has('uniq_users_member_no')) {
    await dropIndexIfExists('users', 'uniq_users_member_no');
  }

  if (indexNames.has('uid') && !indexNames.has('uniq_users_uid')) {
    await dropIndexIfExists('users', 'uid');
  }

  if (indexNames.has('display_id') && !indexNames.has('uniq_users_display_id')) {
    await dropIndexIfExists('users', 'display_id');
  }

  if (!indexNames.has('uniq_users_open_id')) {
    try {
      await poolInstance.query('ALTER TABLE users ADD UNIQUE INDEX uniq_users_open_id (open_id)');
    } catch (error) {
      if (!error || error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  }

  if (userColumnNames.has('member_no')) {
    await poolInstance.query('ALTER TABLE users DROP COLUMN member_no');
  }

  if (!indexNames.has('uniq_users_uid')) {
    try {
      await poolInstance.query('ALTER TABLE users ADD UNIQUE INDEX uniq_users_uid (uid)');
    } catch (error) {
      if (!error || error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  }

  if (!indexNames.has('uniq_users_display_id')) {
    try {
      await poolInstance.query('ALTER TABLE users ADD UNIQUE INDEX uniq_users_display_id (display_id)');
    } catch (error) {
      if (!error || error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  }
};

const migrateRecycleUserResponseStatuses = async () => {
  const [rows] = await getPool().query(
    `
      SELECT ro.id, ro.user_status, ro.user_response_status,
        (
          SELECT r.action
          FROM recycle_submission_reviews r
          WHERE r.submission_id = ro.id
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT 1
        ) AS latest_review_action
      FROM recycle_orders ro
      WHERE (ro.user_response_status IS NULL OR ro.user_response_status = '')
    `
  );

  for (const row of rows) {
    const latestAction = String(row.latest_review_action || '').trim();
    if (latestAction === 'user_take_back') {
      await getPool().execute(
        "UPDATE recycle_orders SET user_status = 'confirmed', user_response_status = 'take_back_requested', updated_at = ? WHERE id = ?",
        [Date.now(), Number(row.id || 0)]
      );
    } else if (latestAction === 'user_accepted') {
      await getPool().execute(
        "UPDATE recycle_orders SET user_response_status = 'accepted_quote', updated_at = ? WHERE id = ?",
        [Date.now(), Number(row.id || 0)]
      );
    }
  }
};

// 修复历史手动新增单被误标为“用户接受报价”的状态，人工录入不应携带用户决策。
const migrateManualRecycleSubmissionResponseStatuses = async () => {
  await getPool().execute(
    `
      UPDATE recycle_orders
      SET user_response_status = '', updated_at = ?
      WHERE open_id LIKE 'manual:%'
        AND TRIM(COALESCE(user_response_status, '')) <> ''
    `,
    [Date.now()]
  );
};

const backfillRecycleOrderSfExpressNumbers = async () => {
  const [rows] = await getPool().query(
    `
      SELECT id, note
      FROM recycle_orders
      WHERE (sf_express_number IS NULL OR TRIM(sf_express_number) = '')
        AND note LIKE '%顺丰%'
    `
  );

  for (const row of rows) {
    const sfExpressNumber = extractSfExpressNumberFromNote(row.note);
    if (!sfExpressNumber) {
      continue;
    }

    await getPool().execute(
      'UPDATE recycle_orders SET sf_express_number = ?, updated_at = ? WHERE id = ?',
      [sfExpressNumber, Date.now(), Number(row.id || 0)]
    );
  }
};

const ensureOrderSchemas = async () => {
  const poolInstance = getPool();
  await poolInstance.query(createPurchaseOrdersTableSql);
  await poolInstance.query(createPaymentBatchesTableSql);
  await poolInstance.query(createAddressesTableSql);
  await poolInstance.query(createRecycleOrdersTableSql);
  await poolInstance.query(createRecycleSubmissionReviewsTableSql);
  await poolInstance.query(createRecycleSettlementsTableSql);
  await alterColumnIfNeeded({
    tableName: 'purchase_orders',
    name: 'product_id',
    definition: 'BIGINT DEFAULT NULL',
    shouldAlter: (column) => String(column.is_nullable || '').toUpperCase() !== 'YES' || column.column_default !== null,
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'product_code_snapshot',
    definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER product_id",
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'product_title_snapshot',
    definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER product_code_snapshot",
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'product_cover_snapshot',
    definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER product_title_snapshot",
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'product_cover_title_snapshot',
    definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER product_cover_snapshot",
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'product_price_snapshot',
    definition: 'DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER product_cover_title_snapshot',
  });
  await ensureColumn({ tableName: 'purchase_orders', name: 'address_id', definition: 'BIGINT DEFAULT NULL AFTER product_id' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'order_no', definition: 'VARCHAR(32) DEFAULT NULL AFTER address_id' });
  await alterColumnIfNeeded({
    tableName: 'purchase_orders',
    name: 'order_no',
    definition: 'VARCHAR(32) DEFAULT NULL',
    shouldAlter: (column) => String(column.is_nullable || '').toUpperCase() !== 'YES' || column.column_default !== null,
  });
  await ensureColumn({ tableName: 'purchase_orders', name: 'out_trade_no', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER status" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'payment_batch_id', definition: 'BIGINT DEFAULT NULL AFTER out_trade_no' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'payment_batch_size', definition: 'INT NOT NULL DEFAULT 1 AFTER payment_batch_id' });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'determine_batches',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_batch_size',
  });
  await ensureColumn({ tableName: 'purchase_orders', name: 'paid_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER determine_batches' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'stock_reserved', definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER determine_batches' });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'payment_transaction_id',
    definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER paid_at",
  });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_order_sync_status', definition: "VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER payment_transaction_id" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_order_sync_error', definition: "VARCHAR(512) NOT NULL DEFAULT '' AFTER wechat_order_sync_status" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_order_synced_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER wechat_order_sync_error' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_service_status', definition: "VARCHAR(64) NOT NULL DEFAULT 'unknown' AFTER wechat_order_synced_at" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_service_status_error', definition: "VARCHAR(512) NOT NULL DEFAULT '' AFTER wechat_service_status" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_service_status_synced_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER wechat_service_status_error' });
  await ensureTimestampRealtimeColumns('purchase_orders', ['paid_at', 'created_at', 'updated_at']);
  await ensureIndex({
    tableName: 'purchase_orders',
    indexName: 'idx_purchase_orders_address_id',
    definition: 'INDEX idx_purchase_orders_address_id (address_id)',
  });
  await ensureIndex({
    tableName: 'purchase_orders',
    indexName: 'idx_purchase_orders_determine_batches_created_at',
    definition: 'INDEX idx_purchase_orders_determine_batches_created_at (determine_batches, created_at)',
  });
  await ensureColumn({ tableName: 'payment_batches', name: 'batch_no', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER open_id" });
  await ensureColumn({ tableName: 'payment_batches', name: 'out_trade_no', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER batch_no" });
  await ensureColumn({ tableName: 'payment_batches', name: 'transaction_id', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER status" });
  await ensureTimestampRealtimeColumns('payment_batches', ['paid_at', 'created_at', 'updated_at']);
  await ensureIndex({
    tableName: 'payment_batches',
    indexName: 'uniq_payment_batches_out_trade_no',
    definition: 'UNIQUE INDEX uniq_payment_batches_out_trade_no (out_trade_no)',
  });
  await ensureIndex({
    tableName: 'payment_batches',
    indexName: 'idx_payment_batches_open_id_created_at',
    definition: 'INDEX idx_payment_batches_open_id_created_at (open_id, created_at)',
  });
  await ensureColumn({ tableName: 'addresses', name: 'recipient_name', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER open_id" });
  await ensureColumn({ tableName: 'addresses', name: 'belong_to_username', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER open_id" });
  await ensureColumn({ tableName: 'addresses', name: 'belong_to_uid', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER belong_to_username" });
  await ensureColumn({ tableName: 'addresses', name: 'recipient_phone', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER recipient_name" });
  await ensureColumn({ tableName: 'addresses', name: 'province', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER recipient_phone" });
  await ensureColumn({ tableName: 'addresses', name: 'city', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER province" });
  await ensureColumn({ tableName: 'addresses', name: 'district', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER city" });
  await ensureColumn({ tableName: 'addresses', name: 'address_detail', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER district" });
  await ensureColumn({ tableName: 'addresses', name: 'postal_code', definition: "VARCHAR(16) NOT NULL DEFAULT '' AFTER address_detail" });
  await ensureColumn({ tableName: 'addresses', name: 'is_default', definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER postal_code' });
  await ensureColumn({ tableName: 'addresses', name: 'status', definition: 'TINYINT NOT NULL DEFAULT 1 AFTER is_default' });
  await ensureColumn({ tableName: 'addresses', name: 'created_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER status' });
  await ensureColumn({ tableName: 'addresses', name: 'updated_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at' });
  await ensureTimestampRealtimeColumns('addresses', ['created_at', 'updated_at']);
  await syncAddressOwnerFields(poolInstance);
  await ensureColumn({ tableName: 'recycle_orders', name: 'recycle_product_id', definition: 'BIGINT DEFAULT NULL AFTER open_id' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'order_no', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER recycle_product_id" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'category_key', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER recycle_product_id" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'item_source', definition: "VARCHAR(64) NOT NULL DEFAULT '微信小程序' AFTER category_key" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'cover_image', definition: "VARCHAR(1024) NOT NULL DEFAULT '' AFTER cover_label" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'submission_images', definition: 'LONGTEXT AFTER selected_device_option_texts' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'user_status', definition: "VARCHAR(16) NOT NULL DEFAULT 'confirmed' AFTER status" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'user_response_status', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER user_status" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'return_address_json', definition: 'LONGTEXT AFTER user_response_status' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'review_note', definition: 'LONGTEXT AFTER status' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'report_description', definition: 'LONGTEXT AFTER review_note' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'product_snapshot_json', definition: 'LONGTEXT AFTER report_description' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'sf_express_number', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER note" });
  await ensureColumn({ tableName: 'recycle_orders', name: 'published_product_id', definition: 'BIGINT DEFAULT NULL AFTER review_note' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'reviewed_by', definition: 'BIGINT DEFAULT NULL AFTER published_product_id' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'reviewed_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER reviewed_by' });
  await ensureColumn({ tableName: 'recycle_orders', name: 'published_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER reviewed_at' });
  await ensureTimestampRealtimeColumns('recycle_orders', ['reviewed_at', 'published_at', 'created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('recycle_submission_reviews', ['created_at']);
  await migrateRecycleUserResponseStatuses();
  await migrateManualRecycleSubmissionResponseStatuses();
  await backfillRecycleOrderSfExpressNumbers();
  await ensureColumn({ tableName: 'recycle_settlements', name: 'open_id', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER recycle_order_id" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'order_no', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER open_id" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'out_bill_no', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER order_no" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'transfer_bill_no', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER out_bill_no" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'appid', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER transfer_bill_no" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'mchid', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER appid" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'amount', definition: 'DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER mchid' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'state', definition: "VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER amount" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'state_desc', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER state" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'transfer_remark', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER state_desc" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'package_info', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER transfer_remark" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'user_name', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER package_info" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'user_recv_perception', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER user_name" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'fail_reason', definition: 'LONGTEXT AFTER user_recv_perception' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'wechat_create_time', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER fail_reason" });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'accept_time', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER wechat_create_time' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'success_time', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER accept_time' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'cancel_time', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER success_time' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'payment_proof_images', definition: 'LONGTEXT AFTER cancel_time' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'notify_raw', definition: 'LONGTEXT AFTER payment_proof_images' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'query_raw', definition: 'LONGTEXT AFTER notify_raw' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'admin_id', definition: 'BIGINT DEFAULT NULL AFTER query_raw' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'created_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER admin_id' });
  await ensureColumn({ tableName: 'recycle_settlements', name: 'updated_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at' });
  await ensureTimestampRealtimeColumns('recycle_settlements', ['accept_time', 'success_time', 'cancel_time', 'created_at', 'updated_at']);
  await ensureIndex({
    tableName: 'addresses',
    indexName: 'idx_addresses_open_id_created_at',
    definition: 'INDEX idx_addresses_open_id_created_at (open_id, created_at)',
  });
  await ensureIndex({
    tableName: 'addresses',
    indexName: 'idx_addresses_open_id_default',
    definition: 'INDEX idx_addresses_open_id_default (open_id, is_default, status)',
  });
  await ensureIndex({
    tableName: 'recycle_orders',
    indexName: 'idx_recycle_orders_open_id_created_at',
    definition: 'INDEX idx_recycle_orders_open_id_created_at (open_id, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_orders',
    indexName: 'idx_recycle_orders_status_created_at',
    definition: 'INDEX idx_recycle_orders_status_created_at (status, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_orders',
    indexName: 'idx_recycle_orders_published_product_id',
    definition: 'INDEX idx_recycle_orders_published_product_id (published_product_id)',
  });
  await ensureIndex({
    tableName: 'recycle_submission_reviews',
    indexName: 'idx_recycle_submission_reviews_submission_created_at',
    definition: 'INDEX idx_recycle_submission_reviews_submission_created_at (submission_id, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_submission_reviews',
    indexName: 'idx_recycle_submission_reviews_admin_created_at',
    definition: 'INDEX idx_recycle_submission_reviews_admin_created_at (admin_id, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_settlements',
    indexName: 'uniq_recycle_settlements_out_bill_no',
    definition: 'UNIQUE INDEX uniq_recycle_settlements_out_bill_no (out_bill_no)',
  });
  await ensureIndex({
    tableName: 'recycle_settlements',
    indexName: 'idx_recycle_settlements_recycle_order_id_created_at',
    definition: 'INDEX idx_recycle_settlements_recycle_order_id_created_at (recycle_order_id, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_settlements',
    indexName: 'idx_recycle_settlements_open_id_created_at',
    definition: 'INDEX idx_recycle_settlements_open_id_created_at (open_id, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_settlements',
    indexName: 'idx_recycle_settlements_state_created_at',
    definition: 'INDEX idx_recycle_settlements_state_created_at (state, created_at)',
  });
  await ensureIndex({
    tableName: 'recycle_settlements',
    indexName: 'idx_recycle_settlements_transfer_bill_no',
    definition: 'INDEX idx_recycle_settlements_transfer_bill_no (transfer_bill_no)',
  });
};

const initDatabase = async () => {
  await getPool().query(createIdentifierSequencesTableSql);
  await ensureTimestampRealtimeColumns('identifier_sequences', ['updated_at']);
  await ensureUsersSchema();
  await ensureProductsSchema();
  await ensureOrderSchemas();
  await backfillUserUids();
  await clearPendingPurchaseOrderNos();
  await backfillOrderNos();
  await backfillRecycleOrderNos();
  await backfillPaymentBatchNos();
  await backfillPurchaseOrderOutTradeNos();
  await syncPurchaseOrderPaymentBatchFlags();
  await ensureIndex({
    tableName: 'purchase_orders',
    indexName: 'uniq_purchase_orders_order_no',
    definition: 'UNIQUE INDEX uniq_purchase_orders_order_no (order_no)',
  });
  await ensureIndex({
    tableName: 'recycle_orders',
    indexName: 'uniq_recycle_orders_order_no',
    definition: 'UNIQUE INDEX uniq_recycle_orders_order_no (order_no)',
  });
  await syncProductCatalog();
  await syncProductImages();
};

const getProductById = async (id) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM products WHERE id = ? AND status = 1 AND is_deleted = 0 LIMIT 1',
    [Number(id || 0)]
  );
  return rows.length ? rows[0] : null;
};

const releasePurchaseOrderReservations = async (connection, orderRows, now = Date.now()) => {
  const productCounts = new Map();
  for (const row of orderRows) {
    if (!Number(row.stock_reserved || 0)) continue;
    const productId = Number(row.product_id || 0);
    if (productId > 0) productCounts.set(productId, (productCounts.get(productId) || 0) + 1);
  }

  for (const [productId, quantity] of productCounts.entries()) {
    await connection.execute(
      'UPDATE products SET reserved_stock = GREATEST(reserved_stock - ?, 0), updated_at = ? WHERE id = ?',
      [quantity, now, productId]
    );
  }
};

const expirePurchaseOrderReservations = async (now = Date.now()) => {
  const cutoff = Number(now) - PURCHASE_ORDER_RESERVATION_TTL_MS;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `
        SELECT * FROM purchase_orders
        WHERE stock_reserved = 1
          AND status IN ('submitted', 'pending_payment')
          AND created_at <= ?
        FOR UPDATE
      `,
      [cutoff]
    );

    if (!rows.length) {
      await connection.commit();
      return 0;
    }

    await releasePurchaseOrderReservations(connection, rows, now);
    const orderIds = rows.map((row) => Number(row.id || 0)).filter((id) => id > 0);
    const placeholders = orderIds.map(() => '?').join(', ');
    await connection.execute(
      `UPDATE purchase_orders
       SET status = 'cancelled', updated_at = ?
       WHERE id IN (${placeholders}) AND status IN ('submitted', 'pending_payment')`,
      [now, ...orderIds]
    );
    await connection.commit();
    return orderIds.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getUserByOpenId = async (openId) => {
  const [rows] = await getPool().execute('SELECT * FROM users WHERE open_id = ? LIMIT 1', [openId]);
  return rows.length ? mapUserRow(rows[0]) : null;
};

const bindWechatPhone = async (openId, phone) => {
  const normalizedPhone = String(phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
    throw new Error('invalid phone number');
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      'SELECT id FROM users WHERE (username = ? OR phone = ?) AND open_id <> ? LIMIT 1 FOR UPDATE',
      [normalizedPhone, normalizedPhone, openId]
    );
    if (existingRows.length) {
      const error = new Error('phone number is already bound to another account');
      error.code = 'USERNAME_CONFLICT';
      error.statusCode = 409;
      throw error;
    }

    await connection.execute(
      'UPDATE users SET username = ?, phone = ?, updated_at = ? WHERE open_id = ?',
      [normalizedPhone, normalizedPhone, Date.now(), openId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getUserByOpenId(openId);
};

const createUser = async ({ openid, unionid, nickname, avatarUrl }) => {
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      'SELECT * FROM users WHERE open_id = ? LIMIT 1 FOR UPDATE',
      [openid]
    );

    if (existingRows.length) {
      const row = existingRows[0];
      const nextAvatarUrl = normalizePersistedAvatarUrl(avatarUrl, row.avatar_url || '');
      await connection.execute(
        `
          UPDATE users
          SET union_id = ?, nickname = ?, avatar_url = ?, updated_at = ?, last_login_at = ?
          WHERE id = ?
        `,
        [
          unionid || row.union_id || '',
          nickname || row.nickname || '',
          nextAvatarUrl,
          now,
          now,
          row.id,
        ]
      );
      await syncAddressOwnerFields(connection, openid);
      await connection.commit();

      return {
        user: mapUserRow({
          ...row,
          union_id: unionid || row.union_id || '',
          nickname: nickname || row.nickname || '',
          avatar_url: nextAvatarUrl,
          updated_at: now,
          last_login_at: now,
        }),
        isNewUser: false,
      };
    }

    const [insertResult] = await connection.execute(
      `
        INSERT INTO users (
          open_id, union_id, nickname, avatar_url, phone,
          payout_method, payout_account, real_name, created_at, updated_at, last_login_at
        ) VALUES (?, ?, ?, ?, '', ?, '', '', ?, ?, ?)
      `,
      [
        openid,
        unionid || '',
        nickname || '',
        normalizePersistedAvatarUrl(avatarUrl),
        DEFAULT_PAYOUT_METHOD,
        now,
        now,
        now,
      ]
    );

    const displayId = Number(insertResult.insertId || 0);
    const uid = buildUserUid(displayId);
    await connection.execute('UPDATE users SET uid = ?, display_id = ? WHERE id = ?', [uid, displayId, displayId]);
    await syncAddressOwnerFields(connection, openid);
    await setSequenceValue(connection, USER_UID_SEQUENCE_KEY, displayId);

    const [rows] = await connection.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [insertResult.insertId]);
    await connection.commit();

    return {
      user: mapUserRow(rows[0]),
      isNewUser: true,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateUserProfile = async (openId, patch) => {
  const user = await getUserByOpenId(openId);
  if (!user) {
    return null;
  }

  const nextUser = {
    ...user,
    nickname: typeof patch.nickname === 'string' ? patch.nickname.trim() : user.nickname,
    avatarUrl:
      typeof patch.avatarUrl === 'string'
        ? normalizePersistedAvatarUrl(patch.avatarUrl, user.avatarUrl)
        : user.avatarUrl,
    phone: typeof patch.phone === 'string' ? patch.phone.trim() : user.phone,
    payoutMethod:
      typeof patch.payoutMethod === 'string'
        ? normalizePayoutMethod(patch.payoutMethod.trim())
        : user.payoutMethod,
    payoutAccount:
      typeof patch.payoutAccount === 'string' ? patch.payoutAccount.trim() : user.payoutAccount,
    realName: typeof patch.realName === 'string' ? patch.realName.trim() : user.realName,
    updatedAt: Date.now(),
  };

  await getPool().execute(
    `
      UPDATE users
      SET nickname = ?, avatar_url = ?, phone = ?, payout_method = ?,
          payout_account = ?, real_name = ?, updated_at = ?
      WHERE open_id = ?
    `,
    [
      nextUser.nickname,
      nextUser.avatarUrl,
      nextUser.phone,
      nextUser.payoutMethod,
      nextUser.payoutAccount,
      nextUser.realName,
      nextUser.updatedAt,
      openId,
    ]
  );

  await syncAddressOwnerFields(getPool(), openId);

  return getUserByOpenId(openId);
};

const getAddressById = async (openId, id) => {
  const addressId = Number(id || 0);
  if (!addressId) {
    return null;
  }

  const [rows] = await getPool().execute(
    'SELECT * FROM addresses WHERE id = ? AND open_id = ? AND status = 1 LIMIT 1',
    [addressId, openId]
  );
  return rows.length ? mapAddressRow(rows[0]) : null;
};

const listAddresses = async (openId) => {
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM addresses
      WHERE open_id = ? AND status = 1
      ORDER BY is_default DESC, updated_at DESC, id DESC
    `,
    [openId]
  );
  return rows.map(mapAddressRow);
};

const createAddress = async (openId, payload) => {
  const now = Date.now();
  const recipientName = String(payload.recipientName || '').trim();
  const recipientPhone = String(payload.recipientPhone || '').trim();
  const province = String(payload.province || '').trim();
  const city = String(payload.city || '').trim();
  const district = String(payload.district || '').trim();
  const addressDetail = String(payload.addressDetail || '').trim();
  const postalCode = String(payload.postalCode || '').trim();
  const requestedDefault = Boolean(payload.isDefault);
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      'SELECT id FROM addresses WHERE open_id = ? AND status = 1 ORDER BY id DESC',
      [openId]
    );
    const shouldSetDefault = requestedDefault || !existingRows.length;

    if (shouldSetDefault) {
      await connection.execute(
        'UPDATE addresses SET is_default = 0, updated_at = ? WHERE open_id = ? AND status = 1',
        [now, openId]
      );
    }

    const [ownerRows] = await connection.execute(
      'SELECT username, uid FROM users WHERE open_id = ? LIMIT 1',
      [openId]
    );
    const owner = ownerRows[0] || {};

    const [result] = await connection.execute(
      `
        INSERT INTO addresses (
          open_id, belong_to_username, belong_to_uid, recipient_name, recipient_phone, province, city, district,
          address_detail, postal_code, is_default, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `,
      [
        openId,
        String(owner.username || ''),
        String(owner.uid || ''),
        recipientName,
        recipientPhone,
        province,
        city,
        district,
        addressDetail,
        postalCode,
        shouldSetDefault ? 1 : 0,
        now,
        now,
      ]
    );
    const [rows] = await connection.execute('SELECT * FROM addresses WHERE id = ? LIMIT 1', [result.insertId]);
    await connection.commit();
    return rows.length ? mapAddressRow(rows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateAddress = async (openId, id, payload) => {
  const addressId = Number(id || 0);
  if (!addressId) {
    return null;
  }

  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await syncAddressOwnerFields(connection, openId);
    const [existingRows] = await connection.execute(
      'SELECT * FROM addresses WHERE id = ? AND open_id = ? AND status = 1 LIMIT 1 FOR UPDATE',
      [addressId, openId]
    );

    if (!existingRows.length) {
      await connection.rollback();
      return null;
    }

    const current = mapAddressRow(existingRows[0]);
    const nextAddress = {
      recipientName: typeof payload.recipientName === 'string' ? payload.recipientName.trim() : current.recipientName,
      recipientPhone: typeof payload.recipientPhone === 'string' ? payload.recipientPhone.trim() : current.recipientPhone,
      province: typeof payload.province === 'string' ? payload.province.trim() : current.province,
      city: typeof payload.city === 'string' ? payload.city.trim() : current.city,
      district: typeof payload.district === 'string' ? payload.district.trim() : current.district,
      addressDetail: typeof payload.addressDetail === 'string' ? payload.addressDetail.trim() : current.addressDetail,
      postalCode: typeof payload.postalCode === 'string' ? payload.postalCode.trim() : current.postalCode,
      isDefault: typeof payload.isDefault === 'boolean' ? payload.isDefault : current.isDefault,
    };

    if (nextAddress.isDefault) {
      await connection.execute(
        'UPDATE addresses SET is_default = 0, updated_at = ? WHERE open_id = ? AND status = 1',
        [now, openId]
      );
    }

    await connection.execute(
      `
        UPDATE addresses
        SET recipient_name = ?, recipient_phone = ?, province = ?, city = ?, district = ?,
            address_detail = ?, postal_code = ?, is_default = ?, updated_at = ?
        WHERE id = ? AND open_id = ? AND status = 1
      `,
      [
        nextAddress.recipientName,
        nextAddress.recipientPhone,
        nextAddress.province,
        nextAddress.city,
        nextAddress.district,
        nextAddress.addressDetail,
        nextAddress.postalCode,
        nextAddress.isDefault ? 1 : 0,
        now,
        addressId,
        openId,
      ]
    );

    const [rows] = await connection.execute('SELECT * FROM addresses WHERE id = ? LIMIT 1', [addressId]);
    await connection.commit();
    return rows.length ? mapAddressRow(rows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteAddress = async (openId, id) => {
  const addressId = Number(id || 0);
  if (!addressId) {
    return false;
  }

  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      'SELECT * FROM addresses WHERE id = ? AND open_id = ? AND status = 1 LIMIT 1 FOR UPDATE',
      [addressId, openId]
    );

    if (!existingRows.length) {
      await connection.rollback();
      return false;
    }

    const current = mapAddressRow(existingRows[0]);
    await connection.execute(
      'UPDATE addresses SET status = 0, is_default = 0, updated_at = ? WHERE id = ? AND open_id = ? LIMIT 1',
      [now, addressId, openId]
    );

    if (current.isDefault) {
      const [remainingRows] = await connection.execute(
        `
          SELECT id
          FROM addresses
          WHERE open_id = ? AND status = 1
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `,
        [openId]
      );

      if (remainingRows.length) {
        await connection.execute(
          'UPDATE addresses SET is_default = 1, updated_at = ? WHERE id = ? LIMIT 1',
          [now, remainingRows[0].id]
        );
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const createPurchaseOrder = async (openId, payload) => {
  const now = Date.now();
  const status = 'submitted';
  const productId = Number(payload.productId || 0);
  const addressId = Number(payload.addressId || 0);

  if (!productId) {
    throw new Error('productId is required');
  }

  let recipientName = String(payload.recipientName || '').trim();
  let recipientPhone = String(payload.recipientPhone || '').trim();
  let addressDetail = String(payload.addressDetail || '').trim();
  let resolvedAddressId = 0;

  if (addressId) {
    const address = await getAddressById(openId, addressId);
    if (!address) {
      throw new Error(`addressId ${addressId} does not exist`);
    }

    resolvedAddressId = address.id;
    recipientName = address.recipientName;
    recipientPhone = address.recipientPhone;
    addressDetail = address.addressDetail;
  }

  try {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [reservationResult] = await connection.execute(
        `
          UPDATE products
          SET status = CASE WHEN stock <= reserved_stock + 1 THEN 3 ELSE status END,
              reserved_stock = reserved_stock + 1, updated_at = ?
          WHERE id = ?
            AND status = 1
            AND is_deleted = 0
            AND stock > reserved_stock
        `,
        [now, productId]
      );

      if (!Number(reservationResult.affectedRows || 0)) {
        const error = new Error('商品已售罄或已下架');
        error.code = 'PRODUCT_STOCK_INSUFFICIENT';
        throw error;
      }

      const [productRows] = await connection.execute('SELECT * FROM products WHERE id = ? LIMIT 1 FOR UPDATE', [productId]);
      if (!productRows.length) {
        throw new Error(`productId ${productId} does not exist`);
      }
      const product = productRows[0];

      const [result] = await connection.execute(
        `
          INSERT INTO purchase_orders (
            open_id, product_id, product_code_snapshot, product_title_snapshot, product_cover_snapshot, product_cover_title_snapshot,
            product_price_snapshot, address_id, order_no, source_mode, recipient_name, recipient_phone, address_detail,
            payment_method, remark, total_amount, status, out_trade_no, payment_batch_id, payment_batch_size,
            determine_batches, stock_reserved, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          openId,
          productId,
          String(product.product_id || '').trim(),
          String(product.title || '').trim(),
          String(product.hero_image || '').trim(),
          String(product.cover_title || '').trim(),
          Number(product.price || 0),
          resolvedAddressId || null,
          null,
          String(payload.sourceMode || 'buy'),
          recipientName,
          recipientPhone,
          addressDetail,
          String(payload.paymentMethod || ''),
          String(payload.remark || ''),
          Number(product.price || 0),
          status,
          '',
          null,
          1,
          0,
          1,
          now,
          now,
        ]
      );

      const [rows] = await connection.execute('SELECT * FROM purchase_orders WHERE id = ? LIMIT 1', [result.insertId]);
      await connection.commit();
      return rows.length ? mapPurchaseOrderRow(rows[0]) : null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new Error(`productId ${productId} does not exist`);
    }
    throw error;
  }
};

const getPurchaseOrderById = async (openId, id) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM purchase_orders WHERE id = ? AND open_id = ? LIMIT 1',
    [id, openId]
  );
  return rows.length ? mapPurchaseOrderRow(rows[0]) : null;
};

const getPurchaseOrderByOutTradeNo = async (outTradeNo) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM purchase_orders WHERE out_trade_no = ? LIMIT 1',
    [String(outTradeNo || '')]
  );
  return rows.length ? mapPurchaseOrderRow(rows[0]) : null;
};

const applyPaidPurchaseOrderStockChanges = async (connection, orderRows, paymentTransactionId) => {
  const orders = (Array.isArray(orderRows) ? orderRows : [])
    .map(mapPurchaseOrderRow)
    .filter((order) => order && Number(order.id || 0) > 0);

  for (const order of orders) {
    if (order.status !== 'paid' && !PAYABLE_PURCHASE_ORDER_STATUSES.has(order.status)) {
      const error = new Error(`order ${order.id} is not payable`);
      error.code = 'ORDER_NOT_PAYABLE';
      throw error;
    }
  }

  const ordersToFinalize = orders.filter((order) => order.status !== 'paid');

  if (!ordersToFinalize.length) {
    return false;
  }

  const legacyOrders = ordersToFinalize.filter((order) => !order.stockReserved);
  const reservedOrders = ordersToFinalize.filter((order) => order.stockReserved);
  const productCounts = new Map();
  for (const order of legacyOrders) {
    const productId = Number(order.productId || 0);
    if (!productId) {
      const error = new Error(`order ${order.id} is missing product`);
      error.code = 'ORDER_PRODUCT_MISSING';
      throw error;
    }

    productCounts.set(productId, (productCounts.get(productId) || 0) + 1);
  }

  const now = Date.now();
  const productIds = Array.from(productCounts.keys()).sort((a, b) => a - b);
  if (productIds.length) {
    const productPlaceholders = productIds.map(() => '?').join(', ');
    const [productRows] = await connection.execute(
      `SELECT * FROM products WHERE id IN (${productPlaceholders}) FOR UPDATE`,
      productIds
    );

    if (productRows.length !== productIds.length) {
      const error = new Error('some products were not found');
      error.code = 'PRODUCT_NOT_FOUND';
      throw error;
    }

    const productMap = new Map(productRows.map((row) => [Number(row.id || 0), row]));
    for (const productId of productIds) {
      const product = productMap.get(productId);
      const quantity = Number(productCounts.get(productId) || 0);
      const stock = Math.trunc(Number(product.stock || 0));
      if (stock < quantity) {
        const error = new Error(`product ${productId} stock is insufficient`);
        error.code = 'PRODUCT_STOCK_INSUFFICIENT';
        throw error;
      }

      await connection.execute(
        `UPDATE products
         SET status = CASE WHEN stock - ? <= 0 OR stock - ? <= reserved_stock THEN 3 ELSE status END,
             stock = stock - ?,
             updated_at = ?
         WHERE id = ?`,
        [quantity, quantity, quantity, now, productId]
      );
    }
  }

  for (const order of reservedOrders) {
    const [result] = await connection.execute(
      `UPDATE products
       SET status = CASE WHEN stock - 1 <= 0 OR stock - 1 <= reserved_stock - 1 THEN 3 ELSE status END,
           stock = stock - 1,
           reserved_stock = reserved_stock - 1,
           updated_at = ?
       WHERE id = ? AND stock >= 1 AND reserved_stock >= 1`,
      [now, Number(order.productId || 0)]
    );
    if (!Number(result.affectedRows || 0)) {
      const error = new Error(`product ${order.productId} stock reservation is invalid`);
      error.code = 'PRODUCT_STOCK_INSUFFICIENT';
      throw error;
    }
  }

  return true;
};

const getPaymentBatchById = async (openId, id) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM payment_batches WHERE id = ? AND open_id = ? LIMIT 1',
    [id, openId]
  );
  return rows.length ? mapPaymentBatchRow(rows[0]) : null;
};

const getPaymentBatchByOutTradeNo = async (outTradeNo) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM payment_batches WHERE out_trade_no = ? LIMIT 1',
    [String(outTradeNo || '')]
  );
  return rows.length ? mapPaymentBatchRow(rows[0]) : null;
};

const createPaymentBatch = async (openId, orderIds) => {
  const normalizedOrderIds = Array.from(
    new Set((Array.isArray(orderIds) ? orderIds : []).map((id) => Number(id || 0)).filter((id) => id > 0))
  );

  if (!normalizedOrderIds.length) {
    throw new Error('orderIds is required');
  }

  const now = Date.now();
  const placeholders = normalizedOrderIds.map(() => '?').join(', ');
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
        SELECT *
        FROM purchase_orders
        WHERE open_id = ? AND id IN (${placeholders})
        FOR UPDATE
      `,
      [openId, ...normalizedOrderIds]
    );

    if (rows.length !== normalizedOrderIds.length) {
      throw new Error('some orders were not found');
    }

    await assignPurchaseOrderNos(connection, rows, now);
    const orderRowsById = new Map(rows.map((row) => [Number(row.id || 0), row]));
    const orders = normalizedOrderIds
      .map((id) => orderRowsById.get(id))
      .filter(Boolean)
      .map(mapPurchaseOrderRow);
    const invalidOrder = orders.find((order) => !PAYABLE_PURCHASE_ORDER_STATUSES.has(order.status));
    if (invalidOrder) {
      throw new Error(`order ${invalidOrder.id} is not payable`);
    }

    const totalAmount = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error('invalid batch total amount');
    }

    const batchNo = buildBatchPaymentNo(now, await getNextSequenceValue(connection, getBatchPaymentSequenceKey(now)));
    const outTradeNo = batchNo;

    const [result] = await connection.execute(
      `
        INSERT INTO payment_batches (
          open_id, batch_no, out_trade_no, order_ids, total_amount, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?)
      `,
      [
        openId,
        batchNo,
        outTradeNo,
        JSON.stringify(normalizedOrderIds),
        Number(totalAmount.toFixed(2)),
        now,
        now,
      ]
    );

    for (const order of orders) {
      const merchantOrderNo = String(order.orderNo || buildPurchasePaymentOutTradeNo(now, order.id));
      await connection.execute(
        `UPDATE purchase_orders
         SET status = 'pending_payment', out_trade_no = ?, payment_batch_id = ?, payment_batch_size = ?,
             determine_batches = ?, updated_at = ?
         WHERE open_id = ? AND id = ?`,
        [
          merchantOrderNo,
          normalizedOrderIds.length > 1 ? Number(result.insertId || 0) : null,
          normalizedOrderIds.length,
          normalizedOrderIds.length > 1 ? 1 : 0,
          now,
          openId,
          order.id,
        ]
      );
    }

    const [batchRows] = await connection.execute('SELECT * FROM payment_batches WHERE id = ? LIMIT 1', [
      result.insertId,
    ]);

    await connection.commit();
    return batchRows.length ? mapPaymentBatchRow(batchRows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markPaymentBatchPaidByOutTradeNo = async (outTradeNo, paymentTransactionId) => {
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM payment_batches WHERE out_trade_no = ? LIMIT 1 FOR UPDATE',
      [String(outTradeNo || '')]
    );

    if (!rows.length) {
      await connection.rollback();
      return null;
    }

    const batch = mapPaymentBatchRow(rows[0]);
    if (batch.status === 'paid') {
      await connection.commit();
      return batch;
    }

    let orderRows = [];
    if (batch.orderIds.length) {
      const orderPlaceholders = batch.orderIds.map(() => '?').join(', ');
      const [rowsForUpdate] = await connection.execute(
        `
          SELECT *
          FROM purchase_orders
          WHERE id IN (${orderPlaceholders})
          FOR UPDATE
        `,
        batch.orderIds
      );

      if (rowsForUpdate.length !== batch.orderIds.length) {
        throw new Error('some orders were not found');
      }

      orderRows = rowsForUpdate;
      await applyPaidPurchaseOrderStockChanges(connection, orderRows, paymentTransactionId);
      await assignPurchaseOrderNos(connection, rowsForUpdate, now);
    }

    await connection.execute(
      `
        UPDATE payment_batches
        SET status = 'paid', paid_at = ?, transaction_id = ?, updated_at = ?
        WHERE id = ?
      `,
      [now, String(paymentTransactionId || ''), now, batch.id]
    );

    if (batch.orderIds.length) {
      const orderPlaceholders = batch.orderIds.map(() => '?').join(', ');
      await connection.execute(
        `
          UPDATE purchase_orders
          SET status = 'paid', stock_reserved = 0, paid_at = ?, payment_transaction_id = ?, updated_at = ?
          WHERE id IN (${orderPlaceholders})
        `,
        [now, String(paymentTransactionId || ''), now, ...batch.orderIds]
      );
    }

    const [nextRows] = await connection.execute('SELECT * FROM payment_batches WHERE id = ? LIMIT 1', [batch.id]);
    await connection.commit();
    return nextRows.length ? mapPaymentBatchRow(nextRows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markPaymentBatchPaid = async (openId, id, paymentTransactionId) => {
  const batch = await getPaymentBatchById(openId, id);
  if (!batch) {
    return null;
  }

  return markPaymentBatchPaidByOutTradeNo(batch.outTradeNo, paymentTransactionId);
};

const markPurchaseOrderPendingPayment = async (openId, id, outTradeNo) => {
  const now = Date.now();
  const resolvedOutTradeNo = String(outTradeNo || buildPurchasePaymentOutTradeNo(now, id) || '');
  await getPool().execute(
    `
      UPDATE purchase_orders
      SET status = 'pending_payment', out_trade_no = ?, payment_batch_id = NULL, payment_batch_size = 1,
          determine_batches = 0, updated_at = ?
      WHERE id = ? AND open_id = ? AND status IN ('submitted', 'pending_payment')
    `,
    [resolvedOutTradeNo, now, id, openId]
  );

  const nextOrder = await getPurchaseOrderById(openId, id);
  if (!nextOrder || !PAYABLE_PURCHASE_ORDER_STATUSES.has(String(nextOrder.status || '').trim())) {
    const error = new Error('订单已取消或不可支付');
    error.code = 'ORDER_NOT_PAYABLE';
    throw error;
  }
  return nextOrder;
};

const updatePurchaseOrderRemark = async (openId, id, remark) => {
  const normalizedRemark = String(remark || '').trim().slice(0, 255);
  await getPool().execute(
    `UPDATE purchase_orders SET remark = ?, updated_at = ?
     WHERE id = ? AND open_id = ? AND status NOT IN ('paid', 'received', 'finished')`,
    [normalizedRemark, Date.now(), Number(id || 0), String(openId || '')]
  );
  return getPurchaseOrderById(openId, id);
};

const markPurchaseOrderPaid = async (openId, id, paymentTransactionId) => {
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM purchase_orders WHERE id = ? AND open_id = ? LIMIT 1 FOR UPDATE',
      [id, openId]
    );

    if (!rows.length) {
      await connection.rollback();
      return null;
    }

    const order = mapPurchaseOrderRow(rows[0]);
    if (String(order.status || '').trim() === 'cancelled') {
      const error = new Error('订单已取消，无法支付');
      error.code = 'ORDER_CANCELLED';
      throw error;
    }
    if (!PAID_PURCHASE_ORDER_STATUSES.has(String(order.status || '').trim())) {
      await applyPaidPurchaseOrderStockChanges(connection, rows, paymentTransactionId);
      await assignPurchaseOrderNos(connection, rows, now);
      await connection.execute(
        `
          UPDATE purchase_orders
          SET status = 'paid', stock_reserved = 0, paid_at = ?, payment_transaction_id = ?, updated_at = ?
          WHERE id = ? AND open_id = ?
        `,
        [now, String(paymentTransactionId || ''), now, id, openId]
      );
    }

    const [nextRows] = await connection.execute('SELECT * FROM purchase_orders WHERE id = ? AND open_id = ? LIMIT 1', [
      id,
      openId,
    ]);
    await connection.commit();
    return nextRows.length ? mapPurchaseOrderRow(nextRows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markPurchaseOrderPaidByOutTradeNo = async (outTradeNo, paymentTransactionId) => {
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM purchase_orders WHERE out_trade_no = ? FOR UPDATE', [
      String(outTradeNo || ''),
    ]);

    if (!rows.length) {
      await connection.rollback();
      return null;
    }

    if (rows.some((row) => String(row.status || '').trim() === 'cancelled')) {
      const error = new Error('订单已取消，无法支付');
      error.code = 'ORDER_CANCELLED';
      throw error;
    }
    if (rows.some((row) => !PAID_PURCHASE_ORDER_STATUSES.has(String(row.status || '').trim()))) {
      await applyPaidPurchaseOrderStockChanges(connection, rows, paymentTransactionId);
      await assignPurchaseOrderNos(connection, rows, now);
      await connection.execute(
        `
          UPDATE purchase_orders
          SET status = 'paid', stock_reserved = 0, paid_at = ?, payment_transaction_id = ?, updated_at = ?
          WHERE out_trade_no = ?
        `,
        [now, String(paymentTransactionId || ''), now, String(outTradeNo || '')]
      );
    }

    const [nextRows] = await connection.execute(
      'SELECT * FROM purchase_orders WHERE out_trade_no = ? LIMIT 1',
      [String(outTradeNo || '')]
    );
    await connection.commit();
    return nextRows.length ? mapPurchaseOrderRow(nextRows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markPurchaseOrderReceived = async (openId, id) => {
  const currentOrder = await getPurchaseOrderById(openId, id);
  if (!currentOrder) {
    return null;
  }

  if (currentOrder.status === 'received' || String(currentOrder.shipStatus || '') === 'received') {
    return currentOrder;
  }

  if (currentOrder.status !== 'paid') {
    const error = new Error('order is not ready for receipt confirmation');
    error.code = 'ORDER_STATUS_INVALID';
    throw error;
  }

  await getPool().execute(
    `
      UPDATE purchase_orders
      SET status = 'received', ship_status = 'received', admin_order_status = 'received', updated_at = ?
      WHERE id = ? AND open_id = ?
      LIMIT 1
    `,
    [Date.now(), id, openId]
  );

  return getPurchaseOrderById(openId, id);
};

// 保存微信订单管理同步结果，失败状态可由后台重试，不影响本地订单履约。
const updatePurchaseOrderWechatOrderSync = async (id, status, errorMessage = '') => {
  const normalizedStatus = ['pending', 'success', 'failed', 'skipped'].includes(String(status || '').trim())
    ? String(status || '').trim()
    : 'failed';
  const now = Date.now();
  await getPool().execute(
    `UPDATE purchase_orders
     SET wechat_order_sync_status = ?, wechat_order_sync_error = ?,
         wechat_order_synced_at = ?, updated_at = ?
     WHERE id = ? LIMIT 1`,
    [normalizedStatus, String(errorMessage || '').trim().slice(0, 512), normalizedStatus === 'success' ? now : 0, now, Number(id || 0)]
  );
  return getPool().execute('SELECT * FROM purchase_orders WHERE id = ? LIMIT 1', [Number(id || 0)])
    .then(([rows]) => (rows.length ? mapPurchaseOrderRow(rows[0]) : null));
};

// 保存微信平台订单服务状态查询结果。
const updatePurchaseOrderWechatServiceStatus = async (id, status, errorMessage = '') => {
  const now = Date.now();
  await getPool().execute(
    `UPDATE purchase_orders
     SET wechat_service_status = ?, wechat_service_status_error = ?,
         wechat_service_status_synced_at = ?, updated_at = ?
     WHERE id = ? LIMIT 1`,
    [String(status || 'unknown').trim().slice(0, 64), String(errorMessage || '').trim().slice(0, 512), now, now, Number(id || 0)]
  );
  const [rows] = await getPool().execute('SELECT * FROM purchase_orders WHERE id = ? LIMIT 1', [Number(id || 0)]);
  return rows.length ? mapPurchaseOrderRow(rows[0]) : null;
};

const listPurchaseOrders = async (openId) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM purchase_orders WHERE open_id = ? ORDER BY created_at DESC, id DESC',
    [openId]
  );
  return rows.map(mapPurchaseOrderRow);
};

const deletePurchaseOrder = async (openId, id) => {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT * FROM purchase_orders WHERE id = ? AND open_id = ? LIMIT 1 FOR UPDATE',
      [id, openId]
    );
    if (!rows.length) {
      await connection.commit();
      return false;
    }
    if (PAYABLE_PURCHASE_ORDER_STATUSES.has(String(rows[0].status || ''))) {
      await releasePurchaseOrderReservations(connection, rows);
    }
    const [result] = await connection.execute('DELETE FROM purchase_orders WHERE id = ? AND open_id = ? LIMIT 1', [id, openId]);
    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const clearPurchaseOrders = async (openId) => {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM purchase_orders WHERE open_id = ? FOR UPDATE', [openId]);
    await releasePurchaseOrderReservations(
      connection,
      rows.filter((row) => PAYABLE_PURCHASE_ORDER_STATUSES.has(String(row.status || '')))
    );
    await connection.execute('DELETE FROM purchase_orders WHERE open_id = ?', [openId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const createRecycleOrder = async (openId, payload) => {
  const now = Date.now();
  const sfExpressNumber = resolveSfExpressNumber(payload);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const orderNo = await allocateRecycleOrderNo(connection, now);
    const [result] = await connection.execute(
      `
        INSERT INTO recycle_orders (
          open_id, recycle_product_id, order_no, category_key, item_source, title, cover_label, cover_image, cover_theme, payout_method_label, account_number,
          real_name, option_summary, selected_device_option_values, selected_device_option_texts, submission_images,
          estimate_supported, estimate_base_price, estimate_final_price, note, sf_express_number, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '微信小程序', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
      `,
      [
        openId,
        payload.recycleProductId ? Number(payload.recycleProductId || 0) : null,
        orderNo,
        String(payload.categoryKey || ''),
        String(payload.title || ''),
        String(payload.coverLabel || ''),
        String(payload.coverImage || ''),
        String(payload.coverTheme || 'red'),
        String(payload.payoutMethodLabel || ''),
        String(payload.accountNumber || ''),
        String(payload.realName || ''),
        String(payload.optionSummary || ''),
        JSON.stringify(payload.selectedDeviceOptionValues || {}),
        JSON.stringify(payload.selectedDeviceOptionTexts || {}),
        JSON.stringify(Array.isArray(payload.submissionImages) ? payload.submissionImages.filter((item) => typeof item === 'string') : []),
        payload.estimateSupported ? 1 : 0,
        Number(payload.estimateBasePrice || 0),
        Number(payload.estimateFinalPrice || 0),
        String(payload.note || ''),
        sfExpressNumber,
        now,
        now,
      ]
    );

    const [rows] = await connection.execute('SELECT * FROM recycle_orders WHERE id = ? LIMIT 1', [result.insertId]);
    await connection.commit();
    return rows.length ? mapRecycleOrderRow(rows[0]) : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getRecycleOrderById = async (openId, id) => {
  const [rows] = await getPool().execute(
    'SELECT * FROM recycle_orders WHERE id = ? AND open_id = ? LIMIT 1',
    [id, openId]
  );
  return rows.length ? mapRecycleOrderRow(rows[0]) : null;
};

const getRecycleOrderByInternalId = async (id) => {
  const recycleOrderId = Number(id || 0);
  if (!recycleOrderId) {
    return null;
  }

  const [rows] = await getPool().execute(
    'SELECT * FROM recycle_orders WHERE id = ? LIMIT 1',
    [recycleOrderId]
  );
  return rows.length ? mapRecycleOrderRow(rows[0]) : null;
};

const listRecycleOrders = async (openId) => {
  const [rows] = await getPool().execute(
    `
      SELECT ro.*, rp.cover_image AS recycle_product_cover_image
      FROM recycle_orders ro
      LEFT JOIN recycle_products rp ON rp.id = ro.recycle_product_id
      WHERE ro.open_id = ?
        AND COALESCE(NULLIF(TRIM(ro.user_status), ''), CASE WHEN ro.status = 'user_cancelled' THEN 'cancelled' ELSE 'confirmed' END) <> 'cancelled'
      ORDER BY ro.created_at DESC, ro.id DESC
    `,
    [openId]
  );
  return rows.map(mapRecycleOrderRow);
};

const getRecycleSettlementById = async (id) => {
  const settlementId = Number(id || 0);
  if (!settlementId) {
    return null;
  }

  const [rows] = await getPool().execute(
    'SELECT * FROM recycle_settlements WHERE id = ? LIMIT 1',
    [settlementId]
  );

  return rows.length ? mapRecycleSettlementRow(rows[0]) : null;
};

const getRecycleSettlementByOutBillNo = async (outBillNo) => {
  const normalizedOutBillNo = String(outBillNo || '').trim();
  if (!normalizedOutBillNo) {
    return null;
  }

  const [rows] = await getPool().execute(
    'SELECT * FROM recycle_settlements WHERE out_bill_no = ? LIMIT 1',
    [normalizedOutBillNo]
  );

  return rows.length ? mapRecycleSettlementRow(rows[0]) : null;
};

const listRecycleSettlementsByOrderId = async (recycleOrderId) => {
  const normalizedRecycleOrderId = Number(recycleOrderId || 0);
  if (!normalizedRecycleOrderId) {
    return [];
  }

  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM recycle_settlements
      WHERE recycle_order_id = ?
      ORDER BY id DESC
    `,
    [normalizedRecycleOrderId]
  );

  return rows.map(mapRecycleSettlementRow);
};

const listLatestRecycleSettlementsByOrderIds = async (recycleOrderIds = []) => {
  const normalizedOrderIds = Array.from(
    new Set(
      (Array.isArray(recycleOrderIds) ? recycleOrderIds : [])
        .map((item) => Number(item || 0))
        .filter((item) => item > 0)
    )
  );

  if (!normalizedOrderIds.length) {
    return [];
  }

  const placeholders = normalizedOrderIds.map(() => '?').join(',');
  const [rows] = await getPool().execute(
    `
      SELECT rs.*
      FROM recycle_settlements rs
      INNER JOIN (
        SELECT recycle_order_id, MAX(id) AS latest_id
        FROM recycle_settlements
        WHERE recycle_order_id IN (${placeholders})
        GROUP BY recycle_order_id
      ) latest ON latest.latest_id = rs.id
      ORDER BY rs.id DESC
    `,
    normalizedOrderIds
  );

  return rows.map(mapRecycleSettlementRow);
};

const getLatestRecycleSettlementByOrderId = async (recycleOrderId) => {
  const settlements = await listLatestRecycleSettlementsByOrderIds([recycleOrderId]);
  return settlements.length ? settlements[0] : null;
};

const createRecycleSettlement = async (payload = {}) => {
  const now = Date.now();
  const data = {
    recycleOrderId: Number(payload.recycleOrderId || 0),
    openId: String(payload.openId || '').trim(),
    orderNo: String(payload.orderNo || '').trim(),
    outBillNo: String(payload.outBillNo || '').trim(),
    transferBillNo: String(payload.transferBillNo || '').trim(),
    appId: String(payload.appId || '').trim(),
    mchId: String(payload.mchId || '').trim(),
    amount: Number(payload.amount || 0),
    state: normalizeRecycleSettlementState(payload.state, 'PENDING'),
    stateDesc: String(payload.stateDesc || '').trim(),
    transferRemark: String(payload.transferRemark || '').trim(),
    packageInfo: String(payload.packageInfo || '').trim(),
    userName: String(payload.userName || '').trim(),
    userRecvPerception: String(payload.userRecvPerception || '').trim(),
    failReason: String(payload.failReason || '').trim(),
    wechatCreateTime: String(payload.wechatCreateTime || '').trim(),
    acceptTime: Number(payload.acceptTime || 0),
    successTime: Number(payload.successTime || 0),
    cancelTime: Number(payload.cancelTime || 0),
    paymentProofImages: safeParseJsonArray(payload.paymentProofImages),
    notifyRaw: String(payload.notifyRaw || '').trim(),
    queryRaw: String(payload.queryRaw || '').trim(),
    adminId: payload.adminId === null || payload.adminId === undefined ? null : Number(payload.adminId || 0),
  };

  if (!data.recycleOrderId || !data.outBillNo) {
    throw new Error('recycle settlement recycleOrderId and outBillNo are required');
  }

  const [result] = await getPool().execute(
    `
      INSERT INTO recycle_settlements (
        recycle_order_id, open_id, order_no, out_bill_no, transfer_bill_no, appid, mchid, amount, state, state_desc,
        transfer_remark, package_info, user_name, user_recv_perception, fail_reason, wechat_create_time,
        accept_time, success_time, cancel_time, payment_proof_images, notify_raw, query_raw, admin_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.recycleOrderId,
      data.openId,
      data.orderNo,
      data.outBillNo,
      data.transferBillNo,
      data.appId,
      data.mchId,
      data.amount,
      data.state,
      data.stateDesc,
      data.transferRemark,
      data.packageInfo,
      data.userName,
      data.userRecvPerception,
      data.failReason,
      data.wechatCreateTime,
      data.acceptTime,
      data.successTime,
      data.cancelTime,
      JSON.stringify(data.paymentProofImages),
      data.notifyRaw,
      data.queryRaw,
      data.adminId,
      now,
      now,
    ]
  );

  return getRecycleSettlementById(result.insertId);
};

const updateRecycleSettlementById = async (id, patch = {}) => {
  const settlementId = Number(id || 0);
  if (!settlementId) {
    return null;
  }

  const current = await getRecycleSettlementById(settlementId);
  if (!current) {
    return null;
  }

  const nextState = patch.state !== undefined
    ? normalizeRecycleSettlementState(patch.state, current.state)
    : current.state;
  const nextValues = {
    transferBillNo: patch.transferBillNo !== undefined ? String(patch.transferBillNo || '').trim() : current.transferBillNo,
    appId: patch.appId !== undefined ? String(patch.appId || '').trim() : current.appId,
    mchId: patch.mchId !== undefined ? String(patch.mchId || '').trim() : current.mchId,
    amount: patch.amount !== undefined ? Number(patch.amount || 0) : current.amount,
    state: nextState,
    stateDesc: patch.stateDesc !== undefined ? String(patch.stateDesc || '').trim() : current.stateDesc,
    transferRemark: patch.transferRemark !== undefined ? String(patch.transferRemark || '').trim() : current.transferRemark,
    packageInfo: patch.packageInfo !== undefined ? String(patch.packageInfo || '').trim() : current.packageInfo,
    userName: patch.userName !== undefined ? String(patch.userName || '').trim() : current.userName,
    userRecvPerception: patch.userRecvPerception !== undefined ? String(patch.userRecvPerception || '').trim() : current.userRecvPerception,
    failReason: patch.failReason !== undefined ? String(patch.failReason || '').trim() : current.failReason,
    wechatCreateTime: patch.wechatCreateTime !== undefined ? String(patch.wechatCreateTime || '').trim() : current.wechatCreateTime,
    acceptTime: patch.acceptTime !== undefined ? Number(patch.acceptTime || 0) : current.acceptTime,
    successTime: patch.successTime !== undefined ? Number(patch.successTime || 0) : current.successTime,
    cancelTime: patch.cancelTime !== undefined ? Number(patch.cancelTime || 0) : current.cancelTime,
    paymentProofImages: patch.paymentProofImages !== undefined ? safeParseJsonArray(patch.paymentProofImages) : current.paymentProofImages,
    notifyRaw: patch.notifyRaw !== undefined ? String(patch.notifyRaw || '').trim() : current.notifyRaw,
    queryRaw: patch.queryRaw !== undefined ? String(patch.queryRaw || '').trim() : current.queryRaw,
    adminId: patch.adminId !== undefined
      ? (patch.adminId === null || patch.adminId === '' ? null : Number(patch.adminId || 0))
      : current.adminId,
  };

  await getPool().execute(
    `
      UPDATE recycle_settlements
      SET transfer_bill_no = ?, appid = ?, mchid = ?, amount = ?, state = ?, state_desc = ?, transfer_remark = ?,
          package_info = ?, user_name = ?, user_recv_perception = ?, fail_reason = ?, wechat_create_time = ?,
          accept_time = ?, success_time = ?, cancel_time = ?, payment_proof_images = ?, notify_raw = ?, query_raw = ?, admin_id = ?, updated_at = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      nextValues.transferBillNo,
      nextValues.appId,
      nextValues.mchId,
      nextValues.amount,
      nextValues.state,
      nextValues.stateDesc,
      nextValues.transferRemark,
      nextValues.packageInfo,
      nextValues.userName,
      nextValues.userRecvPerception,
      nextValues.failReason,
      nextValues.wechatCreateTime,
      nextValues.acceptTime,
      nextValues.successTime,
      nextValues.cancelTime,
      JSON.stringify(nextValues.paymentProofImages),
      nextValues.notifyRaw,
      nextValues.queryRaw,
      nextValues.adminId,
      Date.now(),
      settlementId,
    ]
  );

  return getRecycleSettlementById(settlementId);
};

const updateRecycleSettlementByOutBillNo = async (outBillNo, patch = {}) => {
  const current = await getRecycleSettlementByOutBillNo(outBillNo);
  if (!current) {
    return null;
  }

  return updateRecycleSettlementById(current.id, patch);
};

const updateRecycleOrderById = async (openId, id, payload = {}) => {
  const recycleOrderId = Number(id || 0);
  if (!recycleOrderId) {
    return null;
  }

  const current = await getRecycleOrderById(openId, recycleOrderId);
  if (!current) {
    return null;
  }

  const nextStatus =
    payload.status !== undefined && String(payload.status || '').trim()
      ? normalizeRecycleTradeStatus(payload.status)
      : String(current.status || 'submitted');
  const nextUserStatus =
    payload.userStatus !== undefined
      ? normalizeRecycleUserStatus(payload.userStatus, current.userStatus)
      : normalizeRecycleUserStatus(current.userStatus, 'confirmed');
  const nextNote = payload.note !== undefined ? String(payload.note || '') : String(current.note || '');
  const nextSfExpressNumber = payload.sfExpressNumber !== undefined
    || payload.sf_express_number !== undefined
    || payload.waybillNo !== undefined
    ? resolveSfExpressNumber({ ...payload, note: nextNote })
    : extractSfExpressNumberFromNote(nextNote) || String(current.sfExpressNumber || '');
  const now = Date.now();

  await getPool().execute(
    `
      UPDATE recycle_orders
        SET status = ?, user_status = ?, note = ?, sf_express_number = ?, updated_at = ?
      WHERE id = ? AND open_id = ?
      LIMIT 1
    `,
    [nextStatus, nextUserStatus, nextNote, nextSfExpressNumber, now, recycleOrderId, openId]
  );

  return getRecycleOrderById(openId, recycleOrderId);
};

const deleteRecycleOrder = async (openId, id) => {
  const order = await updateRecycleOrderById(openId, id, {
    userStatus: 'cancelled',
  });
  return Boolean(order);
};

const respondToRecycleReview = async (openId, id, decision, returnAddress = null) => {
  const recycleOrderId = Number(id || 0);
  const normalizedOpenId = String(openId || '').trim();
  const normalizedDecision = String(decision || '').trim().toLowerCase();

  if (!recycleOrderId || !normalizedOpenId) {
    throw new Error('回收单信息无效');
  }

  if (!['accept', 'take_back'].includes(normalizedDecision)) {
    throw new Error('无效的回收审核处理方式');
  }

  const normalizedReturnAddress = normalizeRecycleReturnAddress(returnAddress, { requireComplete: true });
  if (normalizedDecision === 'take_back' && !normalizedReturnAddress) {
    throw new Error('请选择有效的寄回地址');
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT * FROM recycle_orders WHERE id = ? AND open_id = ? LIMIT 1 FOR UPDATE',
      [recycleOrderId, normalizedOpenId]
    );
    if (!rows.length) {
      const error = new Error('未找到回收单');
      error.code = 'RECYCLE_ORDER_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const current = mapRecycleOrderRow(rows[0]);
    if (current.status !== 'needs_fix') {
      throw new Error('当前回收单没有待处理的打回信息');
    }

    const now = Date.now();
    const nextStatus = normalizedDecision === 'accept' ? 'approved' : current.status;
    const nextUserStatus = 'confirmed';
    const nextUserResponseStatus = normalizedDecision === 'accept' ? 'accepted_quote' : 'take_back_requested';
    await connection.execute(
      'UPDATE recycle_orders SET status = ?, user_status = ?, user_response_status = ?, return_address_json = ?, updated_at = ? WHERE id = ? AND open_id = ? LIMIT 1',
      [
        nextStatus,
        nextUserStatus,
        nextUserResponseStatus,
        normalizedReturnAddress ? JSON.stringify(normalizedReturnAddress) : null,
        now,
        recycleOrderId,
        normalizedOpenId,
      ]
    );

    const [nextRows] = await connection.execute(
      'SELECT * FROM recycle_orders WHERE id = ? AND open_id = ? LIMIT 1',
      [recycleOrderId, normalizedOpenId]
    );
    const next = nextRows.length ? mapRecycleOrderRow(nextRows[0]) : null;
    await connection.execute(
      `
        INSERT INTO recycle_submission_reviews (
          submission_id, action, review_note, before_snapshot, after_snapshot, admin_id, published_product_id, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [
        recycleOrderId,
        normalizedDecision === 'accept' ? 'user_accepted' : 'user_take_back',
        current.reviewNote,
        JSON.stringify(current),
        JSON.stringify(next || {}),
        next?.publishedProductId ? Number(next.publishedProductId) : null,
        now,
      ]
    );

    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const hasCancelledSfPickupOrder = async (openId, pickupOrderId) => {
  const normalizedPickupOrderId = String(pickupOrderId || '').trim();
  if (!normalizedPickupOrderId) {
    return false;
  }

  const [rows] = await getPool().execute(
    `
      SELECT id
      FROM recycle_orders
      WHERE open_id = ?
        AND COALESCE(NULLIF(TRIM(user_status), ''), CASE WHEN status = 'user_cancelled' THEN 'cancelled' ELSE 'confirmed' END) = 'cancelled'
        AND note LIKE CONCAT('%', ?, '%')
      LIMIT 1
    `,
    [openId, normalizedPickupOrderId]
  );

  return rows.length > 0;
};

const clearRecycleOrders = async (openId) => {
  await getPool().execute(
    `
      UPDATE recycle_orders
      SET user_status = 'cancelled', updated_at = ?
      WHERE open_id = ?
        AND COALESCE(NULLIF(TRIM(user_status), ''), CASE WHEN status = 'user_cancelled' THEN 'cancelled' ELSE 'confirmed' END) <> 'cancelled'
    `,
    [Date.now(), openId]
  );
};

const pingDatabase = async () => {
  await getPool().query('SELECT 1');
};

module.exports = {
  allocateRecycleOrderNo,
  clearPurchaseOrders,
  updatePurchaseOrderWechatOrderSync,
  updatePurchaseOrderWechatServiceStatus,
  clearRecycleOrders,
  closePool,
  createAddress,
  createPaymentBatch,
  createPurchaseOrder,
  createRecycleOrder,
  createRecycleSettlement,
  createUser,
  bindWechatPhone,
  createAddressesTableSql,
  createPurchaseOrdersTableSql,
  createRecycleOrdersTableSql,
  createRecycleSettlementsTableSql,
  createUsersTableSql,
  DEFAULT_PAYOUT_METHOD,
  deleteAddress,
  deletePurchaseOrder,
  deleteRecycleOrder,
  respondToRecycleReview,
  getAddressById,
  expirePurchaseOrderReservations,
  getPaymentBatchById,
  getPaymentBatchByOutTradeNo,
  getProductById,
  getRecycleOrderById,
  getRecycleOrderByInternalId,
  getRecycleSettlementById,
  getRecycleSettlementByOutBillNo,
  getLatestRecycleSettlementByOrderId,
  getUserByOpenId,
  hasCancelledSfPickupOrder,
  initDatabase,
  getPurchaseOrderById,
  getPurchaseOrderByOutTradeNo,
  listAddresses,
  listPurchaseOrders,
  listRecycleOrders,
  listRecycleSettlementsByOrderId,
  listLatestRecycleSettlementsByOrderIds,
  markPaymentBatchPaid,
  markPaymentBatchPaidByOutTradeNo,
  markPurchaseOrderPaid,
  markPurchaseOrderPaidByOutTradeNo,
  markPurchaseOrderPendingPayment,
  markPurchaseOrderReceived,
  pingDatabase,
  updateAddress,
  updatePurchaseOrderRemark,
  updateRecycleOrderById,
  updateRecycleSettlementById,
  updateRecycleSettlementByOutBillNo,
  updateUserProfile,
};
