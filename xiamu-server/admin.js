// 用途：后台管理数据服务，处理管理员、员工及后台业务数据。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const mysql = require('mysql2/promise');

const PRODUCT_CATALOG_IMPORT_FILE = path.resolve(__dirname, 'cloud-data/product_catalog_import.json');
const PRODUCT_IMAGE_IMPORT_FILE = path.resolve(__dirname, 'cloud-data/product_image_import.json');
const LOCAL_PRODUCT_CATALOG_FILE = path.resolve(__dirname, 'cloud-data/local-product-catalog.json');
const MINIPROGRAM_REPO_PATH = String(process.env.MINIPROGRAM_REPO_PATH || '').trim();
const MINIPROGRAM_LOCAL_CATALOG_JSON_RELATIVE_PATH = path.join('cloud-data', 'local-product-catalog.json');
const MINIPROGRAM_LOCAL_CATALOG_TS_RELATIVE_PATH = path.join('miniprogram', 'data', 'local-product-catalog.ts');
const DETAIL_CAROUSEL_IMAGES = [
  '/pages/images/sorts-images/\u6d4b\u8bd51.jpg',
  '/pages/images/sorts-images/\u6d4b\u8bd52.jpg',
  '/pages/images/sorts-images/\u6d4b\u8bd53.jpg',
];

const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const DEFAULT_SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const DEFAULT_ASSET_BASE_URL = String(process.env.PUBLIC_ASSET_BASE_URL || 'https://xiamuclub.com').replace(/\/+$/, '');
const UID_SEQUENCE_BASE = 100000;
const STAFF_PERMISSIONS = {
  SUPERADMIN: '超级管理员',
  MANAGER: '普通管理员',
  STAFF: '员工',
  VISITOR: '访客',
};
const STAFF_PERMISSION_VALUES = new Set(Object.values(STAFF_PERMISSIONS));
const STAFF_ACCESS_PATHS = new Set([
  '/',
  '/data-analysis',
  '/user/list',
  '/inventory/list',
  '/finance/list',
  '/goods/list',
  '/recycle/list',
  '/recycle/review',
  '/category/list',
  '/order/list',
  '/comment/list',
  '/homepage-banner/list',
  '/homepage-section/editor',
  '/carousel-directory/list',
  '/carousel-directory/editor',
  '/carousel-directory/cover',
  '/notice/list',
  '/setting/base',
  '/setting/buy',
  '/setting/ship',
  '/coupon/list',
  '/level/list',
]);

const isTemporaryAvatarUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return true;
  }

  return /^wxfile:\/\//i.test(normalized)
    || /^https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?\//i.test(normalized)
    || /^https?:\/\/tmp\//i.test(normalized);
};

const normalizeAvatarUrlForDisplay = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || isTemporaryAvatarUrl(normalized)) {
    return '';
  }

  return normalized;
};

const DEFAULT_CATEGORY_PRESETS = [
  { key: 'nintendo', name: '任天堂', sort: 10 },
  { key: 'sony', name: '索尼', sort: 20 },
  { key: 'steam', name: 'Steam', sort: 30 },
  { key: 'asus', name: '华硕', sort: 40 },
  { key: 'others', name: '其他', sort: 50 },
];

const CATEGORY_SCENES = {
  SALE: 'sale',
  RECYCLE: 'recycle',
};

const FIXED_CATEGORY_SECTIONS = [
  { key: CATEGORY_SCENES.SALE, name: '主机销售', targetScene: CATEGORY_SCENES.SALE, sort: 10 },
  { key: CATEGORY_SCENES.RECYCLE, name: '主机回收', targetScene: CATEGORY_SCENES.RECYCLE, sort: 20 },
];

const DEFAULT_CATEGORY_CONFIGS = [
  { scene: CATEGORY_SCENES.SALE, key: 'steam_console', name: 'Steam\u4e3b\u673a', sort: 45, theme: 'gray' },
  { scene: CATEGORY_SCENES.SALE, key: 'steam_game', name: 'Steam\u6e38\u620f', sort: 46, theme: 'gray' },
  { scene: CATEGORY_SCENES.SALE, key: 'nintendo_console', name: '任天堂主机', sort: 10, theme: 'red' },
  { scene: CATEGORY_SCENES.SALE, key: 'nintendo_game', name: '任天堂游戏', sort: 20, theme: 'red' },
  { scene: CATEGORY_SCENES.SALE, key: 'sony_console', name: '索尼主机', sort: 30, theme: 'blue' },
  { scene: CATEGORY_SCENES.SALE, key: 'sony_game', name: '索尼游戏', sort: 40, theme: 'blue' },
  { scene: CATEGORY_SCENES.SALE, key: 'xbox_console', name: 'Xbox主机', sort: 50, theme: 'green' },
  { scene: CATEGORY_SCENES.SALE, key: 'rog_console', name: 'ROG主机', sort: 60, theme: 'green' },
  { scene: CATEGORY_SCENES.RECYCLE, key: 'nintendo_console', name: '任天堂主机', sort: 10, theme: 'red' },
  { scene: CATEGORY_SCENES.RECYCLE, key: 'sony_console', name: '索尼主机', sort: 20, theme: 'blue' },
  { scene: CATEGORY_SCENES.RECYCLE, key: 'xbox_console', name: 'Xbox主机', sort: 30, theme: 'green' },
  { scene: CATEGORY_SCENES.RECYCLE, key: 'rog_console', name: 'ROG主机', sort: 40, theme: 'green' },
];

const SALE_CATEGORY_FALLBACK_KEY = 'nintendo_console';

const DEFAULT_EXPRESS_COMPANIES = [
  '顺丰速运',
  '中通快递',
  '圆通速递',
  '申通快递',
  '韵达速递',
  '京东快递',
  '邮政EMS',
  '极兔速递',
  '德邦快递',
  '百世快递',
];

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

const tableColumnNameCache = new Map();

const createAdminUsersTableSql = `
  CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    uid VARCHAR(32) DEFAULT NULL,
    password_hash VARCHAR(128) NOT NULL,
    nickname VARCHAR(64) NOT NULL DEFAULT '',
    avatar VARCHAR(255) NOT NULL DEFAULT '',
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_admin_users_username (username),
    UNIQUE KEY uniq_admin_users_uid (uid)
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

const ADMIN_UID_SEQUENCE_KEY = 'admin_uid';
const CATEGORY_IDENTIFIER_SEQUENCE_KEY = 'admin_category_identifier';
const CATEGORY_SECTION_IDENTIFIER_SEQUENCE_KEY = 'admin_category_section_identifier';
const buildAdminUid = (sequence) => `${UID_SEQUENCE_BASE + Number(sequence || 0)}AD`;
const buildAdminCategoryKey = (sequence) => `PLYconsole${Math.max(1, Number(sequence || 0))}`;
const buildAdminCategorySectionKey = (sequence) => `section-${Math.max(1, Number(sequence || 0))}`;

const createUserLevelsTableSql = `
  CREATE TABLE IF NOT EXISTS user_levels (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(64) NOT NULL,
    level INT NOT NULL DEFAULT 0,
    discount DECIMAL(5, 2) NOT NULL DEFAULT 100,
    max_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    max_times INT NOT NULL DEFAULT 0,
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_user_levels_status_level (status, level)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminCategoriesTableSql = `
  CREATE TABLE IF NOT EXISTS admin_categories (
    id BIGINT NOT NULL AUTO_INCREMENT,
    scene VARCHAR(32) NOT NULL DEFAULT 'sale',
    category_key VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 50,
    theme VARCHAR(16) NOT NULL DEFAULT 'gray',
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_admin_categories_scene_key (scene, category_key),
    KEY idx_admin_categories_scene_sort (scene, sort_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminNoticesTableSql = `
  CREATE TABLE IF NOT EXISTS admin_notices (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL DEFAULT '',
    content TEXT,
    image_urls LONGTEXT,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminCouponsTableSql = `
  CREATE TABLE IF NOT EXISTS admin_coupons (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    type TINYINT NOT NULL DEFAULT 0,
    value DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    used INT NOT NULL DEFAULT 0,
    min_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 50,
    start_time BIGINT NOT NULL DEFAULT 0,
    end_time BIGINT NOT NULL DEFAULT 0,
    status TINYINT(1) NOT NULL DEFAULT 1,
    desc_text TEXT,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminImageClassesTableSql = `
  CREATE TABLE IF NOT EXISTS admin_image_classes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 50,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminImagesTableSql = `
  CREATE TABLE IF NOT EXISTS admin_images (
    id BIGINT NOT NULL AUTO_INCREMENT,
    image_class_id BIGINT NOT NULL DEFAULT 0,
    name VARCHAR(255) NOT NULL DEFAULT '',
    url VARCHAR(1024) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_admin_images_class_created_at (image_class_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminSysconfigTableSql = `
  CREATE TABLE IF NOT EXISTS admin_sysconfig (
    id BIGINT NOT NULL AUTO_INCREMENT,
    config_key VARCHAR(64) NOT NULL,
    config_value LONGTEXT,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_admin_sysconfig_key (config_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminGoodsCommentsTableSql = `
  CREATE TABLE IF NOT EXISTS admin_goods_comments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    product_id BIGINT NOT NULL DEFAULT 0,
    user_id BIGINT NOT NULL DEFAULT 0,
    rating INT NOT NULL DEFAULT 5,
    review_data LONGTEXT,
    extra_data LONGTEXT,
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_admin_goods_comments_product_created_at (product_id, created_at),
    KEY idx_admin_goods_comments_user_created_at (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createContentPagesTableSql = `
  CREATE TABLE IF NOT EXISTS content_pages (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL DEFAULT '',
    title_tag VARCHAR(100) NOT NULL DEFAULT '',
    title_tag_image VARCHAR(1024) NOT NULL DEFAULT '',
    page_type VARCHAR(32) NOT NULL DEFAULT 'tutorial',
    tutorial_category_id BIGINT NOT NULL DEFAULT 0,
    tutorial_tone VARCHAR(32) NOT NULL DEFAULT 'blue',
    cover_image LONGTEXT,
    content_html LONGTEXT,
    pages_json LONGTEXT,
    end_link_product_id BIGINT DEFAULT NULL,
    end_link_text VARCHAR(128) NOT NULL DEFAULT '立即下单',
    view_count BIGINT NOT NULL DEFAULT 0,
    like_count BIGINT NOT NULL DEFAULT 0,
    favorite_count BIGINT NOT NULL DEFAULT 0,
    share_count BIGINT NOT NULL DEFAULT 0,
    show_in_hot TINYINT(1) NOT NULL DEFAULT 0,
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_content_pages_status_updated_at (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createHomepageBannersTableSql = `
  CREATE TABLE IF NOT EXISTS homepage_banners (
    id BIGINT NOT NULL AUTO_INCREMENT,
    image_url VARCHAR(1024) NOT NULL DEFAULT '',
    page_id BIGINT NOT NULL DEFAULT 0,
    target_page_id BIGINT DEFAULT NULL,
    is_tutorial_link TINYINT(1) NOT NULL DEFAULT 0,
    content_enabled TINYINT(1) NOT NULL DEFAULT 1,
    hide_title TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 50,
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_homepage_banners_status_sort (status, sort_order, id),
    KEY idx_homepage_banners_page_id (page_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createContentPageInteractionsTableSql = `
  CREATE TABLE IF NOT EXISTS content_page_interactions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    page_id BIGINT NOT NULL,
    open_id VARCHAR(128) NOT NULL,
    action_type VARCHAR(16) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_content_page_interaction (page_id, open_id, action_type),
    KEY idx_content_page_interactions_page (page_id, action_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createAdminCategorySectionsTableSql = `
  CREATE TABLE IF NOT EXISTS admin_category_sections (
    id BIGINT NOT NULL AUTO_INCREMENT,
    section_key VARCHAR(64) NOT NULL,
    name VARCHAR(64) NOT NULL DEFAULT '',
    target_scene VARCHAR(32) NOT NULL DEFAULT 'sale',
    sort_order INT NOT NULL DEFAULT 50,
    is_fixed TINYINT(1) NOT NULL DEFAULT 0,
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_admin_category_sections_key (section_key),
    KEY idx_admin_category_sections_sort (sort_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createUserActivityEventsTableSql = `
  CREATE TABLE IF NOT EXISTS user_activity_events (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL DEFAULT 0,
    open_id VARCHAR(64) NOT NULL DEFAULT '',
    occurred_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_user_activity_events_occurred_at (occurred_at),
    KEY idx_user_activity_events_user_occurred_at (user_id, occurred_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createUserOnlineSessionsTableSql = `
  CREATE TABLE IF NOT EXISTS user_online_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL DEFAULT 0,
    open_id VARCHAR(64) NOT NULL DEFAULT '',
    started_at BIGINT NOT NULL DEFAULT 0,
    ended_at BIGINT NOT NULL DEFAULT 0,
    duration_seconds INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_user_online_sessions_ended_at (ended_at),
    KEY idx_user_online_sessions_user_ended_at (user_id, ended_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createStaffTableSql = `
  CREATE TABLE IF NOT EXISTS staff (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(128) NOT NULL,
    name VARCHAR(64) NOT NULL DEFAULT '',
    phone VARCHAR(32) NOT NULL DEFAULT '',
    email VARCHAR(128) DEFAULT NULL,
    password_hash VARCHAR(128) NOT NULL DEFAULT '',
    avatar VARCHAR(1024) NOT NULL DEFAULT '',
    permission VARCHAR(32) NOT NULL DEFAULT '访客',
    access_paths TEXT DEFAULT NULL,
    access_rules TEXT DEFAULT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    last_login_at BIGINT NOT NULL DEFAULT 0,
    session_version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_staff_username (username),
    UNIQUE KEY uniq_staff_phone (phone),
    UNIQUE KEY uniq_staff_email (email),
    KEY idx_staff_permission (permission),
    KEY idx_staff_last_login_at (last_login_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createStaffPermissionsTableSql = `
  CREATE TABLE IF NOT EXISTS staff_permissions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    staff_id BIGINT NOT NULL,
    module_path VARCHAR(128) NOT NULL,
    permission_key VARCHAR(128) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_staff_permissions (staff_id, module_path, permission_key),
    KEY idx_staff_permissions_staff_id (staff_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createSuperadminKeyTableSql = `
  CREATE TABLE IF NOT EXISTS superadmin_key (
    id BIGINT NOT NULL AUTO_INCREMENT,
    staff_id BIGINT NOT NULL,
    username VARCHAR(128) NOT NULL,
    password_hash VARCHAR(128) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_superadmin_key_staff_id (staff_id),
    UNIQUE KEY uniq_superadmin_key_username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createInventoryManagementTableSql = `
  CREATE TABLE IF NOT EXISTS inventory_management (
    id BIGINT NOT NULL AUTO_INCREMENT,
    inspection_report VARCHAR(255) NOT NULL DEFAULT '',
    inventory_number VARCHAR(64) NOT NULL DEFAULT '',
    sf_express_number VARCHAR(128) NOT NULL DEFAULT '',
    payment_status VARCHAR(128) NOT NULL DEFAULT '',
    machine_status VARCHAR(128) NOT NULL DEFAULT '',
    promotion_source VARCHAR(255) NOT NULL DEFAULT '',
    recycle_communication_platform VARCHAR(128) NOT NULL DEFAULT '',
    recycle_id VARCHAR(128) NOT NULL DEFAULT '',
    recycle_address TEXT,
    communication_price VARCHAR(64) NOT NULL DEFAULT '',
    paid_price VARCHAR(64) NOT NULL DEFAULT '',
    recycle_freight VARCHAR(64) NOT NULL DEFAULT '',
    final_sale_price VARCHAR(64) NOT NULL DEFAULT '',
    sale_freight VARCHAR(64) NOT NULL DEFAULT '',
    platform_fee VARCHAR(64) NOT NULL DEFAULT '',
    profit VARCHAR(64) NOT NULL DEFAULT '',
    sale_channel VARCHAR(128) NOT NULL DEFAULT '',
    sale_id VARCHAR(128) NOT NULL DEFAULT '',
    sale_address TEXT,
    created_time_text VARCHAR(64) NOT NULL DEFAULT '',
    remark_info TEXT,
    inspection_result TEXT,
    custom_fields TEXT,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_inventory_management_updated_at (updated_at),
    KEY idx_inventory_management_inventory_number (inventory_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createInventoryManagementColumnsTableSql = `
  CREATE TABLE IF NOT EXISTS inventory_management_columns (
    id BIGINT NOT NULL AUTO_INCREMENT,
    column_key VARCHAR(64) NOT NULL,
    label VARCHAR(64) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    is_custom TINYINT(1) NOT NULL DEFAULT 0,
    fixed_position VARCHAR(5) DEFAULT NULL,
    field_type VARCHAR(16) NOT NULL DEFAULT 'text',
    select_options TEXT,
    is_visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_inventory_management_columns_key (column_key),
    KEY idx_inventory_management_columns_visible_sort (is_visible, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createInventoryColumnPermissionsTableSql = `
  CREATE TABLE IF NOT EXISTS inventory_management_column_permissions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    staff_id BIGINT NOT NULL,
    column_key VARCHAR(64) NOT NULL,
    is_visible TINYINT(1) NOT NULL DEFAULT 1,
    is_editable TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_inventory_column_permissions (staff_id, column_key),
    KEY idx_inventory_column_permissions_staff_id (staff_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createInventoryCalculationsTableSql = `
  CREATE TABLE IF NOT EXISTS inventory_management_calculations (
    id BIGINT NOT NULL AUTO_INCREMENT,
    target_column_key VARCHAR(64) NOT NULL,
    expression_json TEXT NOT NULL,
    calculation_type VARCHAR(16) NOT NULL DEFAULT 'number',
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_inventory_calculations_target (target_column_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createInventoryOrderLinksTableSql = `
  CREATE TABLE IF NOT EXISTS inventory_management_order_links (
    id BIGINT NOT NULL AUTO_INCREMENT,
    source_type VARCHAR(32) NOT NULL,
    source_order_id BIGINT NOT NULL,
    inventory_id BIGINT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_inventory_order_source (source_type, source_order_id),
    UNIQUE KEY uniq_inventory_order_inventory (inventory_id),
    KEY idx_inventory_order_links_updated_at (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CONTENT_PAGE_TYPE_TUTORIAL = 'tutorial';
const CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY = 'tutorial_category';
const CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE = 'tutorial_article';
const CONTENT_PAGE_TYPE_HOMEPAGE_BANNER = 'homepage_banner';
const TUTORIAL_TONE_VALUES = new Set(['red', 'orange', 'green', 'yellow', 'blue']);

const normalizeTutorialTone = (value, fallback = 'blue') => {
  const normalized = String(value || '').trim().toLowerCase();
  return TUTORIAL_TONE_VALUES.has(normalized) ? normalized : fallback;
};

const ensureHomepageTutorialBanner = async () => {
  const [pageRows] = await getPool().execute(
    'SELECT id, title, cover_image, content_html, status FROM content_pages WHERE id = 1 LIMIT 1'
  );
  const page = pageRows[0];

  if (!page || Number(page.status || 0) !== 1) {
    return;
  }

  const [bannerRows] = await getPool().execute(
    'SELECT id, sort_order, status FROM homepage_banners WHERE page_id = 1 ORDER BY sort_order ASC, id ASC LIMIT 1'
  );

  if (bannerRows.length) {
    if (Number(bannerRows[0].sort_order || 0) !== 1 || Number(bannerRows[0].status || 0) !== 1) {
      await getPool().execute(
        'UPDATE homepage_banners SET sort_order = 1, status = 1, updated_at = ? WHERE id = ?',
        [Date.now(), Number(bannerRows[0].id || 0)]
      );
    }
    return;
  }

  const now = Date.now();
  await getPool().execute(
    `
      INSERT INTO homepage_banners (image_url, page_id, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ['', 1, 1, 1, now, now]
  );
};

const DEFAULT_USER_LEVELS = [
  {
    name: '默认等级',
    level: 1,
    discount: 100,
    max_price: 0,
    max_times: 0,
    status: 1,
  },
];

const DEFAULT_LEGAL_DOCUMENTS = {
  privacyPolicyContent: `一、信息收集与使用

为了提供账号管理、商品浏览、订单处理和收货地址管理等服务，我们可能收集你主动提供的头像、昵称、联系方式、订单信息和地址信息，并仅在实现相应功能所必需的范围内使用。

二、信息存储与保护

我们会采取合理的安全措施保护你的个人信息，并按照法律法规及业务需要保存相关信息。你可以通过用户设置查看或修改部分个人资料。

三、第三方服务

在完成登录、支付、物流或收货地址地图选点等服务时，部分功能可能由第三方服务商提供。我们会按照必要、最小化原则向其提供完成服务所需的信息。

四、你的权利

你可以查询、修改或删除部分个人信息，也可以通过客服联系我们处理隐私相关请求。涉及法律法规要求留存的信息，将在法定期限内保存。

五、政策更新与联系我们

我们可能根据业务变化或法律要求更新本政策。政策更新后会在本页面展示。如对本政策有疑问，请通过小程序客服与我们联系。`,
  userAgreementContent: `一、服务内容

本小程序为用户提供数码商品浏览、购买、回收、订单管理及相关信息服务。具体服务内容以页面实际展示为准。

二、账号使用

你应使用真实、合法的信息完成账号使用，不得冒用他人身份或以任何方式转让、出租账号。你应妥善保管账号及设备信息，并对账号下的操作负责。

三、交易与订单

你应在下单前确认商品信息、价格、数量和收货地址。订单提交后，交易状态、支付和履约规则以页面提示及相关服务规则为准。

四、用户行为

你不得利用本小程序从事违法活动，不得发布虚假、侵权、骚扰或影响系统安全的内容。违反约定时，我们有权根据情节采取限制功能、关闭订单或停止服务等措施。

五、协议更新

我们可能根据业务变化和法律要求更新本协议。更新后的协议将在本页面展示，继续使用相关服务即表示你已阅读并接受更新后的内容。`,
};

const DEFAULT_SYS_CONFIG = {
  open_reg: 1,
  reg_method: 'username',
  password_min: '6',
  password_encrypt: '0,1',
  upload_method: 'oss',
  upload_config: {
    Bucket: '',
    ACCESS_KEY: '',
    SECRET_KEY: '',
    http: '',
  },
  api_safe: 0,
  api_secret: '',
  ship: '',
  sfExpressSender: {
    recipientName: process.env.SF_EXPRESS_SENDER_NAME || '',
    recipientPhone: process.env.SF_EXPRESS_SENDER_PHONE || '',
    company: process.env.SF_EXPRESS_SENDER_COMPANY || '',
    province: process.env.SF_EXPRESS_SENDER_PROVINCE || '',
    city: process.env.SF_EXPRESS_SENDER_CITY || '',
    district: process.env.SF_EXPRESS_SENDER_DISTRICT || '',
    addressDetail: process.env.SF_EXPRESS_SENDER_ADDRESS || '',
  },
  close_order_minute: 0,
  auto_received_day: 0,
  after_sale_day: 0,
  alipay: {
    app_id: '',
    ali_public_key: '',
    private_key: '',
  },
  wxpay: {
    app_id: '',
    miniapp_id: '',
    secret: '',
    appid: '',
    mch_id: '',
    key: '',
    cert_client: '',
    cert_key: '',
  },
  homepageSection: {
    sectionTitle: '购买&回收专区',
    items: [
      { key: 'recycling', title: '主机回收', coverImage: '' },
      { key: 'buying', title: '主机购买', coverImage: '' },
    ],
  },
  ...DEFAULT_LEGAL_DOCUMENTS,
};

const hashPassword = (password) =>
  crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');

const safeParseJsonArray = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (_error) {
    return [];
  }
};

const safeParseJsonObject = (value, fallback = null) => {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const mergePlainObjects = (base, patch) => {
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  const input = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const result = { ...source };

  Object.keys(input).forEach((key) => {
    const nextValue = input[key];
    if (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)) {
      result[key] = mergePlainObjects(source[key], nextValue);
    } else {
      result[key] = nextValue;
    }
  });

  return result;
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
    tableColumnNameCache.delete(String(tableName));
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
  const [rows] = await getPool().execute(
    `
      SELECT column_name, column_type, is_nullable, column_default
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
    await getPool().query(`ALTER TABLE ${tableName} MODIFY COLUMN ${name} ${definition}`);
    tableColumnNameCache.delete(String(tableName));
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

const getExistingColumnNames = async (tableName) => {
  const cacheKey = String(tableName);
  if (tableColumnNameCache.has(cacheKey)) {
    return tableColumnNameCache.get(cacheKey);
  }

  const loadPromise = getPool()
    .execute(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
      `,
      [tableName]
    )
    .then(([rows]) => new Set(rows.map((row) => String(row.column_name || row.COLUMN_NAME || ''))))
    .catch((error) => {
      tableColumnNameCache.delete(cacheKey);
      throw error;
    });

  tableColumnNameCache.set(cacheKey, loadPromise);
  return loadPromise;
};

const buildSinglePurchaseOrderFilterSql = async () => {
  const columnNames = await getExistingColumnNames('purchase_orders');

  if (columnNames.has('determine_batches')) {
    return 'IFNULL(po.determine_batches, 0) = 0';
  }

  if (columnNames.has('payment_batch_size')) {
    return 'IFNULL(po.payment_batch_size, 1) <= 1';
  }

  if (columnNames.has('payment_batch_id')) {
    return 'po.payment_batch_id IS NULL';
  }

  return '1 = 1';
};

const buildBatchPurchaseOrderFilterSql = async () => {
  const columnNames = await getExistingColumnNames('purchase_orders');

  if (columnNames.has('determine_batches')) {
    return 'IFNULL(po2.determine_batches, 0) = 1';
  }

  if (columnNames.has('payment_batch_size')) {
    return 'IFNULL(po2.payment_batch_size, 1) > 1';
  }

  if (columnNames.has('payment_batch_id')) {
    return 'po2.payment_batch_id IS NOT NULL';
  }

  return '1 = 0';
};

const hasUserUidColumn = async () => (await getExistingColumnNames('users')).has('uid');

const getUserUidSelectSql = async (tableAlias = 'u') => ((await hasUserUidColumn()) ? `${tableAlias}.uid` : 'NULL');

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

const backfillAdminUids = async () => {
  const poolInstance = getPool();
  const [rows] = await poolInstance.execute(
    `
      SELECT id, uid
      FROM admin_users
      ORDER BY created_at ASC, id ASC
    `
  );

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expectedUid = buildAdminUid(index + 1);
    if (String(row.uid || '') === expectedUid) {
      continue;
    }

    await poolInstance.execute('UPDATE admin_users SET uid = ? WHERE id = ?', [expectedUid, Number(row.id || 0)]);
  }

  await setSequenceValue(poolInstance, ADMIN_UID_SEQUENCE_KEY, rows.length);
};

const formatTimestamp = (value) => {
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
    return formatTimestamp(value.getTime());
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value);
};

const formatRealtimeOrTimestamp = (realtimeValue, fallbackValue) =>
  normalizeRealtimeValue(realtimeValue) || formatTimestamp(fallbackValue);

const ensureParentDirectory = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const writeUtf8File = (filePath, content) => {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
};

// 用途：保持商品描述与说明2独立，兼容历史上两字段被写成相同内容的商品。
const getProductDescriptionText = (product = {}) =>
  String(product.description || '').trim();

const getProductShoppingTextB = (product = {}) => {
  const description = getProductDescriptionText(product);
  const shoppingTextB = String(product.shopping_textB || '').trim();
  return shoppingTextB === description ? '' : shoppingTextB;
};

const normalizeLocalProductCatalog = (products, images) => {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeImages = Array.isArray(images) ? images : [];

  return safeProducts
    .filter((item) => Number(item.status || 0) !== 0 && Number(item.is_deleted || 0) === 0)
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    .map((item) => {
      const visibleImages = safeImages
        .filter(
          (image) =>
            Number(image.product_id || 0) === Number(item.id || 0)
            && Number(image.status || 0) !== 0
            && Number(image.is_deleted || 0) !== 1
            && Boolean(String(image.image_url || '').trim())
        )
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

      const detailImages = visibleImages
        .filter((image) => image.image_type !== 'hero' && image.image_type !== 'cover')
        .map((image) => String(image.image_url || ''));

      const heroImageItem = visibleImages.find((image) => image.image_type === 'hero' || Boolean(image.is_main));

      return {
        id: Number(item.id || 0),
        categoryKey: String(item.category_key || 'others'),
        modelKey: String(item.model_key || 'other'),
        platform: String(item.platform || ''),
        coverText: String(item.cover_text || ''),
        coverTitle: String(item.cover_title || ''),
        title: String(item.title || ''),
        subtitle: String(item.subtitle || ''),
        price: String(item.price || '0'),
        tag: String(item.tag_text || ''),
        detailImages: detailImages.length ? detailImages : DETAIL_CAROUSEL_IMAGES,
        heroImage: String(item.hero_image || heroImageItem?.image_url || ''),
        inStock: Boolean(item.in_stock),
        recyclable: Boolean(item.recyclable),
        premiumCondition: Boolean(item.premium_condition),
        certifiedPrice: Boolean(item.certified_price),
        releaseOrder: Number(item.release_order || 0),
        heroTheme: String(item.hero_theme || 'others'),
        heroAccent: String(item.hero_accent || ''),
        editionLabel: String(item.edition_label || ''),
        featureTags: Array.isArray(item.feature_tags) ? item.feature_tags.map((tag) => String(tag)) : [],
        shoppingTextA: String(item.shopping_textA || ''),
        shoppingTextB: getProductShoppingTextB(item),
        shoppingTextC: String(item.shopping_textC || ''),
        description: getProductDescriptionText(item),
      };
    });
};

const buildLocalCatalogTsContent = (products, images) => {
  const localProductCatalog = normalizeLocalProductCatalog(products, images);
  return `export const localProductCatalog = ${JSON.stringify(localProductCatalog, null, 2)} as const\n`;
};

const resolveMiniprogramMirrorTargets = () => {
  if (!MINIPROGRAM_REPO_PATH) {
    return null;
  }

  const repoPath = path.resolve(MINIPROGRAM_REPO_PATH);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error(`MINIPROGRAM_REPO_PATH does not exist or is not a directory: ${repoPath}`);
  }

  return {
    repoPath,
    localCatalogJsonPath: path.resolve(repoPath, MINIPROGRAM_LOCAL_CATALOG_JSON_RELATIVE_PATH),
    localCatalogTsPath: path.resolve(repoPath, MINIPROGRAM_LOCAL_CATALOG_TS_RELATIVE_PATH),
  };
};

const writeProductCatalogSnapshotFiles = ({ products, images }) => {
  const snapshot = {
    products: Array.isArray(products) ? products : [],
    images: Array.isArray(images) ? images : [],
  };
  const snapshotJsonContent = `${JSON.stringify(snapshot, null, 2)}\n`;
  const snapshotTsContent = buildLocalCatalogTsContent(snapshot.products, snapshot.images);

  writeUtf8File(PRODUCT_CATALOG_IMPORT_FILE, `${snapshot.products.map((item) => JSON.stringify(item)).join('\n')}\n`);
  writeUtf8File(PRODUCT_IMAGE_IMPORT_FILE, `${snapshot.images.map((item) => JSON.stringify(item)).join('\n')}\n`);
  writeUtf8File(LOCAL_PRODUCT_CATALOG_FILE, snapshotJsonContent);

  const miniprogramMirrorTargets = resolveMiniprogramMirrorTargets();
  if (miniprogramMirrorTargets) {
    writeUtf8File(miniprogramMirrorTargets.localCatalogJsonPath, snapshotJsonContent);
    writeUtf8File(miniprogramMirrorTargets.localCatalogTsPath, snapshotTsContent);
  }
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
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

const toNumber = (value, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const parseInventoryMoney = (value) => {
  const normalized = String(value === null || value === undefined ? '' : value)
    .replace(/,/g, '')
    .replace(/[^0-9.+-]/g, '');
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
};

const renameInventoryColumnIfNeeded = async (fromName, toName) => {
  const [fromRows] = await getPool().execute(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_management' AND column_name = ? LIMIT 1`,
    [fromName]
  );
  const [toRows] = await getPool().execute(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_management' AND column_name = ? LIMIT 1`,
    [toName]
  );
  if (fromRows.length && !toRows.length) {
    await getPool().query(`ALTER TABLE inventory_management CHANGE COLUMN ${fromName} ${toName} VARCHAR(64) NOT NULL DEFAULT ''`);
    tableColumnNameCache.delete('inventory_management');
  }
};

const normalizeOptionalPositiveId = (value) => {
  const normalized = Math.trunc(toNumber(value, 0));
  return normalized > 0 ? normalized : null;
};

const isValidPhone = (value) => /^1\d{10}$/.test(String(value || '').trim());

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const normalizeStaffPermission = (value, fallback = STAFF_PERMISSIONS.VISITOR) => {
  const normalized = String(value || '').trim();
  return STAFF_PERMISSION_VALUES.has(normalized) ? normalized : fallback;
};

const normalizeStaffAccessPaths = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const items = Array.isArray(value)
    ? value
    : (() => {
      try {
        return JSON.parse(String(value));
      } catch (_error) {
        return [];
      }
    })();

  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(new Set(
    items.map((item) => String(item || '').trim()).filter((item) => STAFF_ACCESS_PATHS.has(item))
  ));
};

const normalizeStaffAccessRules = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const items = Array.isArray(value)
    ? value
    : (() => {
      try {
        return JSON.parse(String(value));
      } catch (_error) {
        return [];
      }
    })();

  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(new Set(
    items
      .map((item) => String(item || '').trim())
      .filter((item) => /^(?:(?:\/|\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)::)?[A-Za-z][A-Za-z0-9]*,(GET|POST)$/.test(item))
  ));
};

const toStaffPermissionRecords = (value) => normalizeStaffAccessRules(value, [])
  .flatMap((entry) => {
    const matched = String(entry || '').match(/^((?:\/|\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*))::([A-Za-z][A-Za-z0-9]*,(?:GET|POST))$/);
    if (!matched || !STAFF_ACCESS_PATHS.has(matched[1])) {
      return [];
    }
    return [{ modulePath: matched[1], permissionKey: matched[2] }];
  });

const listStaffPermissionRules = async (staffId) => {
  const normalizedStaffId = Number(staffId || 0);
  if (!normalizedStaffId) {
    return [];
  }

  const [rows] = await getPool().execute(
    'SELECT module_path, permission_key FROM staff_permissions WHERE staff_id = ? ORDER BY module_path, permission_key',
    [normalizedStaffId]
  );
  return rows.map((row) => `${String(row.module_path || '')}::${String(row.permission_key || '')}`);
};

const replaceStaffPermissions = async (staffId, accessRules = [], connection = getPool()) => {
  const normalizedStaffId = Number(staffId || 0);
  if (!normalizedStaffId) {
    return;
  }

  const records = toStaffPermissionRecords(accessRules);
  const now = Date.now();
  await connection.execute('DELETE FROM staff_permissions WHERE staff_id = ?', [normalizedStaffId]);
  for (const record of records) {
    await connection.execute(
      `
        INSERT INTO staff_permissions (staff_id, module_path, permission_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [normalizedStaffId, record.modulePath, record.permissionKey, now, now]
    );
  }
};

const migrateLegacyStaffPermissions = async () => {
  const [staffRows] = await getPool().query(
    "SELECT id, access_rules FROM staff WHERE access_rules IS NOT NULL AND access_rules <> ''"
  );

  for (const staff of staffRows) {
    const legacyRules = normalizeStaffAccessRules(staff.access_rules, []);
    if (!legacyRules.length) {
      continue;
    }
    const [[countRow]] = await getPool().execute(
      'SELECT COUNT(1) AS totalCount FROM staff_permissions WHERE staff_id = ?',
      [Number(staff.id || 0)]
    );
    if (!Number(countRow.totalCount || 0)) {
      await replaceStaffPermissions(staff.id, legacyRules);
    }
  }
};

const normalizeStaffUsername = (value) => String(value || '').trim().toLowerCase();

const maskEmptyString = (value, fallback = '') => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const normalizeAssetPath = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  if (text.startsWith('/pages/images/')) {
    return text.replace(/^\/pages\/images\//, '/static/images/');
  }

  return text;
};

const toWebAssetUrl = (value) => {
  const assetPath = normalizeAssetPath(value);
  if (!assetPath) {
    return '';
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  return `${DEFAULT_ASSET_BASE_URL}${assetPath.startsWith('/') ? assetPath : `/${assetPath}`}`;
};

const buildProductNo = (id) => `P${String(Number(id || 0)).padStart(4, '0')}`;
// 商品销售状态：0 仓库、1 已上架、2 已下架、3 已售罄。
const normalizeProductSaleStatus = (value, fallback = 0) => {
  const status = Number(value);
  return [0, 1, 2, 3].includes(status) ? status : fallback;
};
// 商品审核状态：0 待审核、1 审核通过、2 审核未通过。
const normalizeProductAuditStatus = (value, fallback = 0) => {
  const status = Number(value);
  return [0, 1, 2].includes(status) ? status : fallback;
};
// 审核未通过的商品不得执行上架等销售状态操作，前后端共用此提示文案。
const GOODS_AUDIT_BLOCKED_MESSAGE = '商品审核未通过，不能进行此操作';
const createGoodsAuditBlockedError = () => {
  const error = new Error(GOODS_AUDIT_BLOCKED_MESSAGE);
  error.statusCode = 400;
  return error;
};
// 实际库存或预计库存（实际库存减已预占库存）为零时，商品自动售罄。
const isProductSoldOutByStock = (stock, reservedStock = 0) => (
  Number(stock || 0) <= 0 || Number(stock || 0) - Number(reservedStock || 0) <= 0
);

const normalizeProductGalleryUrls = (value) => Array.from(new Set((Array.isArray(value) ? value : [value])
  .map((item) => String(item || '').trim())
  .filter(Boolean)));

const normalizeContentPageCoverImages = (value) => {
  if (Array.isArray(value)) {
    return normalizeProductGalleryUrls(value);
  }

  const text = String(value || '').trim();
  if (!text) {
    return [];
  }

  if (text.startsWith('[')) {
    try {
      const parsedValue = JSON.parse(text);
      return normalizeProductGalleryUrls(Array.isArray(parsedValue) ? parsedValue : [parsedValue]);
    } catch (error) {
      return normalizeProductGalleryUrls(
        text
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      );
    }
  }

  return normalizeProductGalleryUrls(
    text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
};

const serializeContentPageCoverImages = (value) => {
  const coverImages = normalizeContentPageCoverImages(value);
  return coverImages.length ? JSON.stringify(coverImages) : '';
};

const buildProductGalleryEntries = (productId, productImages = [], coverSource = '') => {
  const galleryUrls = normalizeProductGalleryUrls(productImages.map((item) => toWebAssetUrl(item.imageUrl)));
  const fallbackCover = toWebAssetUrl(coverSource);
  if (!galleryUrls.length && fallbackCover) {
    galleryUrls.push(fallbackCover);
  }

  return galleryUrls.map((url, index) => ({
    id: `${productId}-image-${index + 1}`,
    url,
    image_url: url,
    sort_order: index + 1,
    image_type: 'detail',
    is_main: index === 0,
  }));
};

const syncProductImages = async (connection, productId, imageUrls = []) => {
  const normalizedProductId = Number(productId || 0);
  if (!normalizedProductId) {
    return;
  }

  const normalizedUrls = normalizeProductGalleryUrls(imageUrls);
  const now = Date.now();
  await connection.execute('UPDATE product_images SET status = 0, is_deleted = 1, updated_at = ? WHERE product_id = ?', [
    now,
    normalizedProductId,
  ]);

  for (let index = 0; index < normalizedUrls.length; index += 1) {
    const imageUrl = normalizedUrls[index];
    await connection.execute(
      `
        INSERT INTO product_images (
          source_key, product_id, image_type, image_url, sort_order, is_main, status, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
        ON DUPLICATE KEY UPDATE
          product_id = VALUES(product_id),
          image_type = VALUES(image_type),
          image_url = VALUES(image_url),
          sort_order = VALUES(sort_order),
          is_main = VALUES(is_main),
          status = VALUES(status),
          is_deleted = VALUES(is_deleted),
          updated_at = VALUES(updated_at)
      `,
      [
        `${buildProductNo(normalizedProductId)}_detail_${index + 1}`,
        normalizedProductId,
        'detail',
        imageUrl,
        index + 1,
        index === 0 ? 1 : 0,
        now,
        now,
      ]
    );
  }
};

const normalizeCategoryScene = (scene, fallback = CATEGORY_SCENES.SALE) => {
  const normalized = String(scene || '').trim().toLowerCase();
  if (normalized === CATEGORY_SCENES.SALE || normalized === CATEGORY_SCENES.RECYCLE) {
    return normalized;
  }
  return fallback;
};

const normalizeCategoryTheme = (theme, fallback = 'gray') => {
  const normalized = String(theme || '').trim().toLowerCase();
  return ['red', 'blue', 'gray', 'green'].includes(normalized) ? normalized : fallback;
};

const getCategoryPlatformByKey = (key) => {
  const normalized = String(key || '').trim().toLowerCase();
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
  const normalized = String(key || '').trim().toLowerCase();
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
  if (normalized.startsWith('xbox_')) {
    return 'others';
  }
  return 'others';
};

const AUTO_RECYCLE_PRODUCT_SOURCE_PREFIX = 'goods-auto-recycle';
const buildAutoRecycleProfileKey = (productId) => `goods-${Number(productId || 0)}`;

const mapHeroThemeToRecycleCoverTheme = (heroTheme) => {
  const normalized = String(heroTheme || '').trim().toLowerCase();
  if (normalized === 'sony') {
    return 'blue';
  }
  if (['asus', 'xbox'].includes(normalized)) {
    return 'green';
  }
  if (['steam', 'others'].includes(normalized)) {
    return 'gray';
  }
  return 'red';
};

const ensureRecycleOptionConfigRemovedIfUnused = async (connection, profileKey) => {
  const normalizedProfileKey = String(profileKey || '').trim();
  if (!normalizedProfileKey) {
    return;
  }

  const [[row]] = await connection.execute(
    'SELECT COUNT(1) AS totalCount FROM recycle_products WHERE option_profile_key = ?',
    [normalizedProfileKey]
  );

  if (Number(row?.totalCount || 0) > 0) {
    return;
  }

  await connection.execute(
    `
      DELETE i
      FROM recycle_option_items i
      INNER JOIN recycle_option_groups g ON g.id = i.group_id
      WHERE g.profile_key = ?
    `,
    [normalizedProfileKey]
  );
  await connection.execute('DELETE FROM recycle_option_groups WHERE profile_key = ?', [normalizedProfileKey]);
};

const removeRecycleConfigForGoods = async (connection, productId) => {
  const normalizedProductId = Number(productId || 0);
  if (!normalizedProductId) {
    return;
  }

  await connection.execute(
    'UPDATE recycle_products SET status = 0, updated_at = ? WHERE product_id = ?',
    [Date.now(), normalizedProductId]
  );
};

const enableRecycleConfigForTarget = async (connection, targetKey) => {
  const normalizedTargetKey = String(targetKey || '').trim();
  if (!normalizedTargetKey) {
    return null;
  }

  const conditions = ['option_profile_key = ?', 'category_key = ?'];
  const params = [normalizedTargetKey, normalizedTargetKey];
  if (/^\d+$/.test(normalizedTargetKey) && Number(normalizedTargetKey) > 0) {
    conditions.unshift('id = ?');
    params.unshift(Number(normalizedTargetKey));
  }

  const [rows] = await connection.execute(
    `
      SELECT id, option_profile_key
      FROM recycle_products
      WHERE ${conditions.join(' OR ')}
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `,
    params
  );
  const target = rows[0];
  if (!target) {
    throw new Error('指定回收配置不存在');
  }

  const [[optionCount]] = await connection.execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM recycle_option_groups g
      INNER JOIN recycle_option_items i ON i.group_id = g.id
      WHERE g.profile_key = ? AND g.status = 1 AND i.status = 1
    `,
    [String(target.option_profile_key || '').trim()]
  );
  if (Number(optionCount?.totalCount || 0) < 1) {
    throw new Error('指定回收配置没有启用的选项');
  }

  await connection.execute('UPDATE recycle_products SET status = 1, updated_at = ? WHERE id = ?', [Date.now(), target.id]);
  return target;
};

const ensureRecycleConfigForGoods = async (connection, productId, productValues) => {
  const normalizedProductId = Number(productId || 0);
  if (!normalizedProductId) {
    return;
  }

  const [existingRows] = await connection.execute(
    'SELECT id FROM recycle_products WHERE product_id = ? ORDER BY id ASC',
    [normalizedProductId]
  );

  if (existingRows.length) {
    return;
  }

  const now = Date.now();
  const profileKey = buildAutoRecycleProfileKey(normalizedProductId);

  await connection.execute(
    `
      INSERT INTO recycle_products (
        source_key, product_id, category_key, option_profile_key, title, subtitle, cover_label, cover_theme,
        max_recycle_price, hint_text, quote_mode, pricing_rule_json, status, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      `${AUTO_RECYCLE_PRODUCT_SOURCE_PREFIX}:${normalizedProductId}`,
      normalizedProductId,
      String(productValues.category_key || 'others'),
      profileKey,
      String(productValues.title || '').trim(),
      String(productValues.subtitle || '').trim(),
      String(productValues.cover_title || productValues.tag_text || '回收').trim(),
      mapHeroThemeToRecycleCoverTheme(productValues.hero_theme),
      Math.max(0, Number(productValues.recycle_price || 0)),
      '最高可得',
      'rule_based',
      JSON.stringify({}),
      0,
      Math.max(0, Math.trunc(Number(productValues.release_order || 0))),
      now,
      now,
    ]
  );
};

const guessLegacyCategoryKey = (row) => {
  const currentKey = String(row.category_key || '').trim();
  if (currentKey && DEFAULT_CATEGORY_CONFIGS.some((item) => item.key === currentKey)) {
    return currentKey;
  }

  const title = String(row.title || '').trim();
  if (currentKey === 'nintendo') {
    return title.includes('游戏') ? 'nintendo_game' : 'nintendo_console';
  }
  if (currentKey === 'sony') {
    return title.includes('游戏') ? 'sony_game' : 'sony_console';
  }
  if (currentKey === 'steam') {
    return title.includes('\u6e38\u620f') ? 'steam_game' : 'steam_console';
  }
  if (currentKey === 'asus') {
    return 'rog_console';
  }
  if (currentKey === 'others') {
    const normalizedTitle = title.toLowerCase();
    if (normalizedTitle.includes('steam') || normalizedTitle.includes('deck')) {
      return title.includes('\u6e38\u620f') ? 'steam_game' : 'steam_console';
    }
    return title.toLowerCase().includes('xbox') ? 'xbox_console' : 'rog_console';
  }

  const normalizedTitle = title.toLowerCase();
  if (title.includes('任天堂') || normalizedTitle.includes('switch') || title.includes('NS')) {
    return title.includes('游戏') ? 'nintendo_game' : 'nintendo_console';
  }
  if (title.includes('索尼') || normalizedTitle.includes('playstation') || normalizedTitle.includes('ps')) {
    return title.includes('游戏') ? 'sony_game' : 'sony_console';
  }
  if (normalizedTitle.includes('steam') || normalizedTitle.includes('deck')) {
    return title.includes('\u6e38\u620f') ? 'steam_game' : 'steam_console';
  }
  if (normalizedTitle.includes('xbox')) {
    return 'xbox_console';
  }
  return 'rog_console';
};

const buildOrderNo = (row) => {
  const orderNo = String(row.order_no || '').trim();
  return orderNo;
};

const mapAdminUserRow = (row) => ({
  id: Number(row.id || 0),
  username: String(row.username || ''),
  uid: String(row.uid || ''),
  nickname: String(row.nickname || row.username || ''),
  avatar: normalizeAvatarUrlForDisplay(row.avatar || ''),
  status: Number(row.status || 0),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
});

const mapStaffRow = (row) => ({
  id: Number(row.id || 0),
  username: String(row.username || ''),
  name: String(row.name || '').trim(),
  phone: String(row.phone || '').trim(),
  email: String(row.email || '').trim(),
  avatar: normalizeAvatarUrlForDisplay(row.avatar || ''),
  permission: normalizeStaffPermission(row.permission),
  accessPaths: normalizeStaffAccessPaths(row.access_paths),
  accessRules: normalizeStaffAccessRules(row.access_rules),
  createdAt: Number(row.created_at || 0),
  createdAtRealtime: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
  updatedAt: Number(row.updated_at || 0),
  updatedAtRealtime: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
  lastLoginAt: Number(row.last_login_at || 0),
  lastLoginAtRealtime: formatRealtimeOrTimestamp(row.last_login_at_realtime, row.last_login_at),
  sessionVersion: Number(row.session_version || 0),
});

const mapStaffRowToAdmin = (row) => {
  const staff = mapStaffRow(row);
  const displayName = staff.name || staff.username || `员工 #${staff.id}`;
  return {
    ...staff,
    account: staff.username,
    nickname: displayName,
    username: displayName,
  };
};

const mapAdminUserLevelRow = (row) => ({
  id: Number(row.id || 0),
  name: String(row.name || ''),
  level: Number(row.level || 0),
  discount: Number(row.discount || 0),
  max_price: Number(row.max_price || 0),
  max_times: Number(row.max_times || 0),
  status: Number(row.status || 0),
  create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
  update_time: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
});

const mapMemberRowToAdmin = (row) => {
  const normalizedUid = String(row.uid || '').trim().toUpperCase();
  const matchedDisplayId = normalizedUid.match(/^(\d{6,})XM$/);
  const fallbackDisplayId = matchedDisplayId ? Number(matchedDisplayId[1]) : 0;

  return {
    id: Number(row.id || 0),
    display_id: Number(row.display_id || 0) || (Number.isFinite(fallbackDisplayId) && fallbackDisplayId > 0 ? fallbackDisplayId : 0),
    uid: String(row.uid || ''),
    nickname: String(row.nickname || ''),
    username: String(row.username || ''),
    province: String(row.province || '').trim(),
    avatar: normalizeAvatarUrlForDisplay(row.avatar_url || ''),
    status: Number(row.status === undefined || row.status === null ? 1 : row.status),
    create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
    last_login_time: formatRealtimeOrTimestamp(row.last_login_at_realtime, row.last_login_at),
  };
};

const mapAdminCategoryRow = (row) => ({
  id: Number(row.id || 0),
  key: String(row.category_key || ''),
  name: String(row.name || ''),
  scene: normalizeCategoryScene(row.scene),
  sectionKey: String(row.section_key || row.scene || '').trim(),
  order: Number(row.sort_order || 50),
  theme: normalizeCategoryTheme(row.theme),
  status: Number(row.status === undefined || row.status === null ? 1 : row.status),
  category_id: 0,
  child: [],
});

const mapAdminCategorySectionRow = (row) => ({
  id: Number(row.id || 0),
  key: String(row.section_key || '').trim(),
  name: String(row.name || '').trim(),
  targetScene: normalizeCategoryScene(row.target_scene),
  order: Number(row.sort_order || 50),
  fixed: Number(row.is_fixed || 0) === 1,
  status: Number(row.status === undefined || row.status === null ? 1 : row.status),
});

const listAdminCategorySections = async ({ includeDisabled = true, targetScene = '' } = {}) => {
  const filters = [];
  const params = [];
  const normalizedTargetScene = String(targetScene || '').trim().toLowerCase();
  if (normalizedTargetScene && normalizedTargetScene !== 'all') {
    filters.push('target_scene = ?');
    params.push(normalizeCategoryScene(normalizedTargetScene));
  }
  if (!includeDisabled) {
    filters.push('status = 1');
  }
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await getPool().execute(
    `SELECT * FROM admin_category_sections ${whereSql} ORDER BY sort_order ASC, id ASC`,
    params
  );
  return rows.map(mapAdminCategorySectionRow);
};

const getAdminCategorySectionByKey = async (sectionKey, executor = getPool()) => {
  const normalizedKey = String(sectionKey || '').trim();
  if (!normalizedKey) {
    return null;
  }
  const [rows] = await executor.execute(
    'SELECT * FROM admin_category_sections WHERE section_key = ? LIMIT 1',
    [normalizedKey]
  );
  return rows.length ? mapAdminCategorySectionRow(rows[0]) : null;
};

const createAdminCategorySection = async (payload = {}) => {
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('分区名称不能为空');
  }
  if (name.length > 30) {
    throw new Error('分区名称不能超过30个字符');
  }

  const connection = await getPool().getConnection();
  let insertId = 0;
  try {
    await connection.beginTransaction();
    const sequence = await getNextSequenceValue(connection, CATEGORY_SECTION_IDENTIFIER_SEQUENCE_KEY);
    const key = buildAdminCategorySectionKey(sequence);
    const now = Date.now();
    const [result] = await connection.execute(
      `INSERT INTO admin_category_sections
        (section_key, name, target_scene, sort_order, is_fixed, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        key,
        name,
        normalizeCategoryScene(payload.targetScene ?? payload.target_scene),
        Math.max(0, Math.trunc(toNumber(payload.order, 50))),
        toBoolean(payload.status, true) ? 1 : 0,
        now,
        now,
      ]
    );
    insertId = Number(result.insertId || 0);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_category_sections WHERE id = ? LIMIT 1', [insertId]);
  return rows.length ? mapAdminCategorySectionRow(rows[0]) : null;
};

const updateAdminCategorySection = async (id, payload = {}) => {
  const sectionId = Number(id || 0);
  if (!sectionId) {
    return null;
  }
  const [rows] = await getPool().execute('SELECT * FROM admin_category_sections WHERE id = ? LIMIT 1', [sectionId]);
  if (!rows.length) {
    return null;
  }

  const current = mapAdminCategorySectionRow(rows[0]);
  const name = payload.name !== undefined ? String(payload.name || '').trim() : current.name;
  if (!name) {
    throw new Error('分区名称不能为空');
  }
  if (name.length > 30) {
    throw new Error('分区名称不能超过30个字符');
  }
  const targetScene = current.fixed
    ? current.targetScene
    : normalizeCategoryScene(payload.targetScene ?? payload.target_scene, current.targetScene);
  if (targetScene !== current.targetScene) {
    const [[countRow]] = await getPool().execute(
      'SELECT COUNT(1) AS totalCount FROM admin_categories WHERE section_key = ?',
      [current.key]
    );
    if (Number(countRow?.totalCount || 0) > 0) {
      throw new Error('分区内已有类目，不能修改业务类型');
    }
  }

  await getPool().execute(
    `UPDATE admin_category_sections
     SET name = ?, target_scene = ?, sort_order = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      targetScene,
      payload.order !== undefined ? Math.max(0, Math.trunc(toNumber(payload.order, 50))) : current.order,
      payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : current.status,
      Date.now(),
      sectionId,
    ]
  );
  const [nextRows] = await getPool().execute('SELECT * FROM admin_category_sections WHERE id = ? LIMIT 1', [sectionId]);
  return nextRows.length ? mapAdminCategorySectionRow(nextRows[0]) : null;
};

const deleteAdminCategorySection = async (id) => {
  const sectionId = Number(id || 0);
  if (!sectionId) {
    return 0;
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT * FROM admin_category_sections WHERE id = ? LIMIT 1 FOR UPDATE',
      [sectionId]
    );
    if (!rows.length) {
      await connection.rollback();
      return 0;
    }
    const section = mapAdminCategorySectionRow(rows[0]);
    if (section.fixed) {
      throw new Error('主机销售和主机回收为固定分区，不可删除');
    }
    await connection.execute(
      'DELETE FROM admin_categories WHERE section_key = ?',
      [section.key]
    );
    await connection.execute('DELETE FROM admin_category_sections WHERE id = ? LIMIT 1', [sectionId]);
    await connection.commit();
    return 1;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const listAdminCategories = async ({ scene = CATEGORY_SCENES.SALE, sectionKey = '', includeDisabled = true, page = 0, limit = 0 } = {}) => {
  const normalizedScene = String(scene || '').trim().toLowerCase();
  const normalizedSectionKey = String(sectionKey || '').trim();
  const filters = [];
  const params = [];

  if (normalizedScene && normalizedScene !== 'all') {
    filters.push('scene = ?');
    params.push(normalizeCategoryScene(normalizedScene));
  }

  if (normalizedSectionKey) {
    filters.push('section_key = ?');
    params.push(normalizedSectionKey);
  }

  if (!includeDisabled) {
    filters.push('status = 1');
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const normalizedPage = Math.max(0, Number(page) || 0);
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  const usePagination = normalizedPage > 0 && normalizedLimit > 0;
  const countSql = `SELECT COUNT(*) AS total FROM admin_categories ${whereSql}`;
  const [[countRow]] = usePagination
    ? await getPool().execute(countSql, params)
    : [[{ total: 0 }]];
  const paginationSql = usePagination
    ? ` LIMIT ${normalizedLimit} OFFSET ${(normalizedPage - 1) * normalizedLimit}`
    : '';
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM admin_categories
      ${whereSql}
      ORDER BY scene ASC, sort_order ASC, id ASC
      ${paginationSql}
    `,
    params
  );

  const list = rows.map(mapAdminCategoryRow);
  return usePagination ? { list, total: Number(countRow?.total || 0) } : list;
};

const listAdminTutorialEndLinkCategoryOptions = async () => {
  const [rows] = await getPool().execute(
    `
      SELECT
        c.id,
        c.category_key,
        c.name,
        c.scene,
        c.section_key,
        c.sort_order,
        c.theme,
        s.name AS section_name,
        s.sort_order AS section_sort_order
      FROM admin_categories c
      INNER JOIN admin_category_sections s ON s.section_key = c.section_key
      WHERE c.scene = ?
        AND c.status = 1
        AND s.status = 1
        AND s.target_scene = ?
        AND s.name LIKE ?
      ORDER BY s.sort_order ASC, s.id ASC, c.sort_order ASC, c.id ASC
    `,
    [CATEGORY_SCENES.SALE, CATEGORY_SCENES.SALE, '%购买%']
  );

  return rows.map((row) => ({
    ...mapAdminCategoryRow(row),
    sectionName: String(row.section_name || '').trim(),
  }));
};

const getSceneCategoryMaps = async (scene = CATEGORY_SCENES.SALE, includeDisabled = true) => {
  const categories = await listAdminCategories({ scene, includeDisabled });
  return {
    categories,
    byId: new Map(categories.map((item) => [item.id, item])),
    byKey: new Map(categories.map((item) => [item.key, item])),
  };
};

const getCategoryMaps = async () => getSceneCategoryMaps(CATEGORY_SCENES.SALE);
const getRecycleCategoryMaps = async ({ includeDisabled = true } = {}) =>
  getSceneCategoryMaps(CATEGORY_SCENES.RECYCLE, includeDisabled);

const migrateAdminCategoryIdentifiers = async () => {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [categoryRows] = await connection.execute(
      `
        SELECT id, scene, category_key
        FROM admin_categories
        ORDER BY id ASC
        FOR UPDATE
      `
    );
    const migrations = categoryRows.map((row, index) => ({
      id: Number(row.id || 0),
      scene: normalizeCategoryScene(row.scene),
      oldKey: String(row.category_key || '').trim(),
      newKey: buildAdminCategoryKey(index + 1),
    }));
    const changedRows = migrations.filter((row) => row.oldKey !== row.newKey);
    const [recycleProductTables] = await connection.execute("SHOW TABLES LIKE 'recycle_products'");
    const hasRecycleProductsTable = recycleProductTables.length > 0;

    // Temporary keys avoid unique-key collisions while old identifiers are being replaced.
    for (const row of changedRows) {
      await connection.execute('UPDATE admin_categories SET category_key = ? WHERE id = ?', [`TMP-C-${row.id}`, row.id]);
    }
    for (const row of changedRows) {
      if (row.scene === CATEGORY_SCENES.SALE) {
        await connection.execute('UPDATE products SET category_key = ? WHERE category_key = ?', [row.newKey, row.oldKey]);
      } else {
        if (hasRecycleProductsTable) {
          await connection.execute('UPDATE recycle_products SET category_key = ? WHERE category_key = ?', [row.newKey, row.oldKey]);
        }
        await connection.execute('UPDATE recycle_orders SET category_key = ? WHERE category_key = ?', [row.newKey, row.oldKey]);
      }
      await connection.execute('UPDATE admin_categories SET category_key = ?, updated_at = ? WHERE id = ?', [row.newKey, Date.now(), row.id]);
    }

    if (migrations.length) {
      await setSequenceValue(connection, CATEGORY_IDENTIFIER_SEQUENCE_KEY, migrations.length);
    }
    await connection.commit();
    return changedRows.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const createAdminCategory = async (payload = {}) => {
  const now = Date.now();
  const requestedScene = normalizeCategoryScene(payload.scene);
  const sectionKey = String(payload.sectionKey || payload.section_key || requestedScene).trim();
  const section = await getAdminCategorySectionByKey(sectionKey);
  if (!section) {
    throw new Error('所属分区不存在');
  }
  const scene = section.targetScene;
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('类目名称不能为空');
  }

  const connection = await getPool().getConnection();
  let result;
  try {
    await connection.beginTransaction();
    const key = buildAdminCategoryKey(await getNextSequenceValue(connection, CATEGORY_IDENTIFIER_SEQUENCE_KEY));
    [result] = await connection.execute(
      `
        INSERT INTO admin_categories (scene, section_key, category_key, name, sort_order, theme, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        scene,
        section.key,
        key,
        name,
        Math.max(0, Math.trunc(toNumber(payload.order, 50))),
        normalizeCategoryTheme(payload.theme, 'gray'),
        toBoolean(payload.status, true) ? 1 : 0,
        now,
        now,
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_categories WHERE id = ? LIMIT 1', [result.insertId]);
  return rows.length ? mapAdminCategoryRow(rows[0]) : null;
};

const updateAdminCategory = async (id, payload = {}) => {
  const categoryId = Number(id || 0);
  if (!categoryId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_categories WHERE id = ? LIMIT 1', [categoryId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const nextName = payload.name !== undefined ? String(payload.name || '').trim() : String(current.name || '').trim();
  if (!nextName) {
    throw new Error('类目名称不能为空');
  }

  const requestedSectionKey = String(
    payload.sectionKey
      || payload.section_key
      || (payload.scene !== undefined ? normalizeCategoryScene(payload.scene) : '')
      || current.section_key
      || current.scene
  ).trim();
  const section = await getAdminCategorySectionByKey(requestedSectionKey);
  if (!section) {
    throw new Error('所属分区不存在');
  }

  await getPool().execute(
    `
      UPDATE admin_categories
      SET scene = ?, section_key = ?, category_key = ?, name = ?, sort_order = ?, theme = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      section.targetScene,
      section.key,
      String(current.category_key || '').trim(),
      nextName,
      payload.order !== undefined ? Math.max(0, Math.trunc(toNumber(payload.order, 50))) : Number(current.sort_order || 50),
      payload.theme !== undefined ? normalizeCategoryTheme(payload.theme, 'gray') : normalizeCategoryTheme(current.theme, 'gray'),
      payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : Number(current.status || 0),
      Date.now(),
      categoryId,
    ]
  );

  const [nextRows] = await getPool().execute('SELECT * FROM admin_categories WHERE id = ? LIMIT 1', [categoryId]);
  return nextRows.length ? mapAdminCategoryRow(nextRows[0]) : null;
};

const updateAdminCategoryStatus = async (id, status) => {
  const categoryId = Number(id || 0);
  if (!categoryId) {
    return null;
  }

  await getPool().execute('UPDATE admin_categories SET status = ?, updated_at = ? WHERE id = ?', [
    toBoolean(status, true) ? 1 : 0,
    Date.now(),
    categoryId,
  ]);

  const [rows] = await getPool().execute('SELECT * FROM admin_categories WHERE id = ? LIMIT 1', [categoryId]);
  return rows.length ? mapAdminCategoryRow(rows[0]) : null;
};

const deleteAdminCategory = async (id) => {
  const categoryId = Number(id || 0);
  if (!categoryId) {
    return 0;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_categories WHERE id = ? LIMIT 1', [categoryId]);
  if (!rows.length) {
    return 0;
  }

  const category = mapAdminCategoryRow(rows[0]);
  await getPool().execute('DELETE FROM admin_categories WHERE id = ? LIMIT 1', [categoryId]);

  if (category.scene === CATEGORY_SCENES.SALE) {
    const fallbackMaps = await getCategoryMaps();
    const fallbackCategory = fallbackMaps.byKey.get(SALE_CATEGORY_FALLBACK_KEY) || fallbackMaps.categories[0] || null;
    if (fallbackCategory) {
      await getPool().execute('UPDATE products SET category_key = ?, updated_at = ? WHERE category_key = ?', [
        fallbackCategory.key,
        Date.now(),
        category.key,
      ]);
      await exportProductCatalogSnapshot();
    }
  }

  return 1;
};

const sortAdminCategories = async (sortData = []) => {
  const items = Array.isArray(sortData) ? sortData : [];
  const now = Date.now();
  for (const item of items) {
    const categoryId = Number(item.id || 0);
    if (!categoryId) {
      continue;
    }

    await getPool().execute('UPDATE admin_categories SET sort_order = ?, updated_at = ? WHERE id = ?', [
      Math.max(0, Math.trunc(toNumber(item.order, 50))),
      now,
      categoryId,
    ]);
  }
};

const listPublicCategoryConfigs = async ({ scene = CATEGORY_SCENES.SALE } = {}) => {
  const normalizedScene = normalizeCategoryScene(scene);
  const sections = await listAdminCategorySections({ includeDisabled: false, targetScene: normalizedScene });
  const sectionMap = new Map(sections.map((section) => [section.key, section]));
  const rows = await listAdminCategories({ scene: normalizedScene, includeDisabled: false });
  return rows.filter((item) => sectionMap.has(item.sectionKey)).map((item) => ({
    id: item.id,
    key: item.key,
    name: item.name,
    scene: item.scene,
    sectionKey: item.sectionKey,
    sectionName: sectionMap.get(item.sectionKey)?.name || '',
    theme: item.theme,
    order: item.order,
  }));
};

const listPublicCategorySections = async ({ targetScene = '' } = {}) => {
  const normalizedTargetScene = normalizeCategoryScene(targetScene);
  const sections = await listAdminCategorySections({ includeDisabled: false, targetScene: normalizedTargetScene });
  const categories = await listPublicCategoryConfigs({
    scene: normalizedTargetScene,
  });
  return sections.map((section) => ({
    id: section.id,
    key: section.key,
    name: section.name,
    targetScene: section.targetScene,
    order: section.order,
    fixed: section.fixed,
    categories: categories.filter((category) => category.sectionKey === section.key),
  }));
};

const initializeAdminCategorySections = async () => {
  const now = Date.now();
  for (const section of FIXED_CATEGORY_SECTIONS) {
    await getPool().execute(
      `INSERT INTO admin_category_sections
        (section_key, name, target_scene, sort_order, is_fixed, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?)
       ON DUPLICATE KEY UPDATE target_scene = VALUES(target_scene), is_fixed = 1`,
      [section.key, section.name, section.targetScene, section.sort, now, now]
    );
  }
  await getPool().execute(
    `UPDATE admin_categories c
     LEFT JOIN admin_category_sections s ON s.section_key = c.section_key
     SET c.section_key = c.scene, c.updated_at = ?
     WHERE c.section_key = '' OR s.id IS NULL`,
    [now]
  );
  const [[maxRow]] = await getPool().execute('SELECT COALESCE(MAX(id), 0) AS maxId FROM admin_category_sections');
  await setSequenceValue(
    getPool(),
    CATEGORY_SECTION_IDENTIFIER_SEQUENCE_KEY,
    Number(maxRow?.maxId || 0)
  );
};

const getRawProductById = async (id, includeDeleted = true) => {
  const productId = Number(id || 0);
  if (!productId) {
    return null;
  }

  const conditions = ['id = ?'];
  const params = [productId];
  if (!includeDeleted) {
    conditions.push('is_deleted = 0');
  }

  const [rows] = await getPool().execute(
    `SELECT * FROM products WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  );

  return rows.length ? rows[0] : null;
};

const getProductImageMap = async (productIds) => {
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((item) => Number(item || 0)).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await getPool().execute(
    `
      SELECT pi.*
      FROM product_images pi
      INNER JOIN (
        SELECT product_id, MIN(id) AS first_id
        FROM product_images
        WHERE product_id IN (${placeholders}) AND status = 1 AND is_deleted = 0
        GROUP BY product_id
      ) first_image ON first_image.first_id = pi.id
    `,
    ids
  );

  return new Map(rows.map((row) => [Number(row.product_id || 0), String(row.image_url || '')]));
};

const getProductImageGroups = async (productIds) => {
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((item) => Number(item || 0)).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await getPool().execute(
    `
      SELECT product_id, image_url, image_type, sort_order, is_main
      FROM product_images
      WHERE product_id IN (${placeholders}) AND status = 1 AND is_deleted = 0 AND image_url <> ''
      ORDER BY product_id ASC, sort_order ASC, id ASC
    `,
    ids
  );

  const imageGroups = new Map();
  rows.forEach((row) => {
    const productId = Number(row.product_id || 0);
    if (!productId) {
      return;
    }

    if (!imageGroups.has(productId)) {
      imageGroups.set(productId, []);
    }

    imageGroups.get(productId).push({
      imageUrl: String(row.image_url || ''),
      imageType: String(row.image_type || 'detail'),
      isMain: Boolean(row.is_main),
    });
  });

  return imageGroups;
};

const mapProductRowToAdmin = (row, categoryMaps, imageMap, imageGroups = new Map()) => {
  const productId = Number(row.id || 0);
  const category = categoryMaps.byKey.get(String(row.category_key || '').trim()) || null;
  const productImages = imageGroups.get(productId) || [];
  const coverSource = String(row.hero_image || '').trim() || imageMap.get(productId) || '';
  const galleryImages = buildProductGalleryEntries(productId, productImages, coverSource);
  const featureTags = safeParseJsonArray(row.feature_tags);
  return {
    id: productId,
    title: String(row.title || ''),
    cover: galleryImages[0]?.url || toWebAssetUrl(coverSource),
    coverImage: String(coverSource || ''),
    webCoverImage: galleryImages[0]?.url || toWebAssetUrl(coverSource),
    heroImage: galleryImages[0]?.url || toWebAssetUrl(coverSource),
    detailImages: galleryImages.map((item) => item.url),
    goodsBanner: galleryImages,
    goods_banner: galleryImages,
    images: galleryImages.map((item) => item.url),
    desc: getProductDescriptionText(row),
    content: String(row.content || ''),
    unit: String(row.unit || '件'),
    stock: row.stock === undefined || row.stock === null ? 1 : Number(row.stock || 0),
    actual_stock: row.stock === undefined || row.stock === null ? 1 : Number(row.stock || 0),
    reserved_stock: Math.max(0, Number(row.reserved_stock || 0)),
    estimated_stock: Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0)),
    min_stock: row.min_stock === undefined || row.min_stock === null ? 1 : Number(row.min_stock || 0),
    stock_display: Number(row.stock_display || 0),
    min_price: Number(row.price || 0),
    min_oprice: Number(row.origin_price || row.price || 0),
    recycle_price: Number(row.recycle_price || 0),
    in_stock: Number(row.in_stock || 0),
    recyclable: Number(row.recyclable || 0),
    recycle_target_category_key: String(row.recycle_target_category_key || ''),
    premium_condition: Number(row.premium_condition || 0),
    certified_price: Number(row.certified_price || 0),
    sale_count: Number(row.sale_count || 0),
    status: Number(row.status || 0),
    ischeck: Number(row.ischeck || 0),
    // 回收检测生成的商品仅可在“修改”弹窗中变更审核状态。
    is_recycle_inspection: /^recycle-\d+-/.test(String(row.model_key || '')),
    create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
    update_time: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
    product_id: String(row.product_id || ''),
    category_id: category ? category.id : 0,
    category: category ? { id: category.id, name: category.name } : null,
    platform: String(row.platform || ''),
    subtitle: String(row.subtitle || ''),
    tag_text: String(row.tag_text || ''),
    cover_text: String(row.cover_text || ''),
    cover_title: String(row.cover_title || ''),
    shopping_textA: String(row.shopping_textA || ''),
    shopping_textB: getProductShoppingTextB(row),
    shopping_textC: String(row.shopping_textC || ''),
    release_order: Number(row.release_order || 0),
    hero_theme: String(row.hero_theme || ''),
    hero_accent: String(row.hero_accent || ''),
    edition_label: String(row.edition_label || ''),
    feature_tags: featureTags,
    goods_skus: [],
    goods_banner: [],
    sku_type: 0,
    sku_value: null,
    goods_skus_card: [],
    model_key: String(row.model_key || ''),
  };
};

const buildProductUpdateValues = async (payload = {}, currentRow = null) => {
  const now = Date.now();
  const categoryMaps = await getCategoryMaps();
  const categoryId =
    payload.category_id !== undefined && payload.category_id !== null && payload.category_id !== ''
      ? Number(payload.category_id)
      : currentRow
      ? categoryMaps.byKey.get(String(currentRow.category_key || '').trim())?.id || 0
      : 0;
  const category = categoryMaps.byId.get(categoryId) || categoryMaps.categories[0] || { key: 'others', name: '其他' };
  const resolvedCategory =
    categoryMaps.byId.get(categoryId) || categoryMaps.categories[0] || { key: SALE_CATEGORY_FALLBACK_KEY, name: '任天堂主机' };
  const normalizedCategory =
    categoryMaps.byId.get(categoryId) || categoryMaps.byKey.get(SALE_CATEGORY_FALLBACK_KEY) || resolvedCategory;
  const current = currentRow || {};
  const galleryImages = Object.prototype.hasOwnProperty.call(payload, 'images')
    ? normalizeProductGalleryUrls(payload.images)
    : [];
  const cover = payload.cover !== undefined
    ? String(payload.cover || '').trim()
    : galleryImages[0] || String(current.hero_image || '');
  const minPrice = payload.min_price !== undefined ? toNumber(payload.min_price, 0) : toNumber(current.price, 0);
  const minOriginalPrice =
    payload.min_oprice !== undefined ? toNumber(payload.min_oprice, minPrice) : toNumber(current.origin_price, minPrice);
  const recyclePrice =
    payload.recycle_price !== undefined
      ? toNumber(payload.recycle_price, 0)
      : toNumber(current.recycle_price, minPrice);
  let recyclable =
    payload.recyclable !== undefined ? (toBoolean(payload.recyclable) ? 1 : 0) : Number(current.recyclable || 0);
  let recycleTargetCategoryKey =
    payload.recycle_target_category_key !== undefined
      ? String(payload.recycle_target_category_key || '').trim()
      : String(current.recycle_target_category_key || '').trim();
  if (recyclable === 1) {
    recycleTargetCategoryKey = '';
  } else if (recycleTargetCategoryKey) {
    recyclable = 0;
  }
  const title = payload.title !== undefined ? String(payload.title || '').trim() : String(current.title || '');
  const platform =
    payload.platform !== undefined
      ? String(payload.platform || '').trim()
      : String(current.platform || getCategoryPlatformByKey(normalizedCategory.key));
  const heroTheme =
    payload.hero_theme !== undefined
      ? String(payload.hero_theme || '').trim()
      : String(current.hero_theme || getCategoryHeroThemeByKey(normalizedCategory.key));
  const description =
    payload.desc !== undefined
      ? String(payload.desc || '').trim().slice(0, 1000)
      : String(current.description || '').trim().slice(0, 1000);
  const shoppingTextA =
    payload.shopping_textA !== undefined ? String(payload.shopping_textA || '').trim() : String(current.shopping_textA || '');
  const shoppingTextBInput =
    payload.shopping_textB !== undefined
      ? String(payload.shopping_textB || '').trim()
      : String(current.shopping_textB || '').trim();
  const shoppingTextB = shoppingTextBInput;
  const shoppingTextC =
    payload.shopping_textC !== undefined ? String(payload.shopping_textC || '').trim() : String(current.shopping_textC || '');
  const stock = payload.stock !== undefined
    ? Math.max(0, Math.trunc(toNumber(payload.stock, 1)))
    : (current.stock === undefined || current.stock === null ? 1 : Math.max(0, Math.trunc(toNumber(current.stock, 1))));
  const minStock = payload.min_stock !== undefined
    ? Math.max(0, Math.trunc(toNumber(payload.min_stock, 1)))
    : (current.min_stock === undefined || current.min_stock === null ? 1 : Math.max(0, Math.trunc(toNumber(current.min_stock, 1))));
  const reservedStock = Math.max(0, Math.trunc(toNumber(current.reserved_stock, 0)));
  if (stock < reservedStock) {
    throw new Error(`实际库存不能低于当前预占库存（${reservedStock}）`);
  }
  const requestedStatus = payload.status !== undefined
    ? normalizeProductSaleStatus(payload.status)
    : normalizeProductSaleStatus(current.status);
  const status = isProductSoldOutByStock(stock, reservedStock) ? 3 : requestedStatus;

  return {
    category_key: normalizedCategory.key,
    product_id:
      payload.product_id !== undefined
        ? String(payload.product_id || '').trim().slice(0, 32)
        : String(current.product_id || '').trim().slice(0, 32),
    platform:
      payload.platform !== undefined
        ? String(payload.platform || '').trim()
        : String(current.platform || category.name || '其他'),
    platform,
    title,
    subtitle: payload.subtitle !== undefined ? String(payload.subtitle || '').trim() : String(current.subtitle || ''),
    description,
    content: payload.content !== undefined ? String(payload.content || '') : String(current.content || ''),
    unit: payload.unit !== undefined ? String(payload.unit || '').trim() : String(current.unit || '件'),
    stock,
    min_stock: minStock,
    stock_display:
      payload.stock_display !== undefined ? (toBoolean(payload.stock_display) ? 1 : 0) : Number(current.stock_display || 0),
    price: minPrice,
    origin_price: minOriginalPrice,
    recycle_price: recyclePrice,
    recyclable,
    recycle_target_category_key: recycleTargetCategoryKey,
    hero_image: cover,
    status,
    ischeck: payload.ischeck !== undefined
      ? normalizeProductAuditStatus(payload.ischeck)
      : normalizeProductAuditStatus(current.ischeck, 0),
    model_key:
      payload.model_key !== undefined
        ? String(payload.model_key || '').trim()
        : String(current.model_key || `custom-${Date.now()}`),
    cover_text: payload.cover_text !== undefined ? String(payload.cover_text || '').trim() : String(current.cover_text || ''),
    cover_title:
      payload.cover_title !== undefined ? String(payload.cover_title || '').trim() : String(current.cover_title || ''),
    tag_text: payload.tag_text !== undefined ? String(payload.tag_text || '').trim() : String(current.tag_text || ''),
    shopping_textA: shoppingTextA,
    shopping_textB: shoppingTextB,
    shopping_textC: shoppingTextC,
    release_order:
      payload.release_order !== undefined ? Math.max(0, Math.trunc(toNumber(payload.release_order, 0))) : Number(current.release_order || 0),
    hero_theme:
      payload.hero_theme !== undefined ? String(payload.hero_theme || '').trim() : String(current.hero_theme || category.key || 'others'),
    hero_theme: heroTheme,
    hero_accent:
      payload.hero_accent !== undefined ? String(payload.hero_accent || '').trim() : String(current.hero_accent || ''),
    edition_label:
      payload.edition_label !== undefined ? String(payload.edition_label || '').trim() : String(current.edition_label || ''),
    feature_tags: Array.isArray(payload.feature_tags)
      ? payload.feature_tags.filter((item) => typeof item === 'string')
      : safeParseJsonArray(current.feature_tags),
    updated_at: now,
  };
};

const listAdminGoods = async ({ page = 1, title = '', tab = 'all', categoryId = 0, limit = 10 } = {}) => {
  const categoryMaps = await getCategoryMaps();
  const filters = [];
  const params = [];

  const keyword = String(title || '').trim();
  if (keyword) {
    filters.push('(p.title LIKE ? OR p.subtitle LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const category = categoryMaps.byId.get(Number(categoryId || 0));
  if (category) {
    filters.push('p.category_key = ?');
    params.push(category.key);
  }

  switch (String(tab || 'all')) {
    case 'delete':
      filters.push('p.is_deleted = 1');
      break;
    case 'pending_review':
      filters.push('p.is_deleted = 0');
      filters.push('p.ischeck = 0');
      break;
    case 'review_rejected':
      filters.push('p.is_deleted = 0');
      filters.push('p.ischeck = 2');
      break;
    case 'review_approved':
      filters.push('p.is_deleted = 0');
      filters.push('p.ischeck = 1');
      break;
    case 'saling':
      filters.push('p.is_deleted = 0');
      filters.push('p.status = 1');
      break;
    case 'sold_out':
      filters.push('p.is_deleted = 0');
      filters.push('p.status = 3');
      break;
    case 'off':
      filters.push('p.is_deleted = 0');
      filters.push('p.status = 2');
      break;
    case 'warehouse':
      filters.push('p.is_deleted = 0');
      filters.push('p.status = 0');
      break;
    case 'min_stock':
      filters.push('p.is_deleted = 0');
      filters.push('(p.stock - p.reserved_stock) <= p.min_stock');
      break;
    default:
      filters.push('p.is_deleted = 0');
      break;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(1, Number(limit || 10));
  const offset = (safePage - 1) * safeLimit;

  const [countRows] = await getPool().execute(`SELECT COUNT(1) AS totalCount FROM products p ${whereClause}`, params);
  const [rows] = await getPool().execute(
    `
      SELECT
        p.*,
        (
          SELECT COUNT(1)
          FROM purchase_orders po
          WHERE po.product_id = p.id AND po.status = 'paid'
        ) AS sale_count
      FROM products p
      ${whereClause}
      ORDER BY p.release_order DESC, p.updated_at DESC, p.id DESC
      LIMIT ${safeLimit} OFFSET ${offset}
    `,
    params
  );

  const productIds = rows.map((row) => row.id);
  const imageMap = await getProductImageMap(productIds);
  const imageGroups = await getProductImageGroups(productIds);
  return {
    totalCount: Number(countRows[0]?.totalCount || 0),
    list: rows.map((row) => mapProductRowToAdmin(row, categoryMaps, imageMap, imageGroups)),
  };
};

const getAdminGoodsById = async (id) => {
  const categoryMaps = await getCategoryMaps();
  const row = await getRawProductById(id, true);
  if (!row) {
    return null;
  }

  const imageMap = await getProductImageMap([row.id]);
  const imageGroups = await getProductImageGroups([row.id]);
  return mapProductRowToAdmin(row, categoryMaps, imageMap, imageGroups);
};

const exportProductCatalogSnapshot = async () => {
  const [products] = await getPool().execute('SELECT * FROM products ORDER BY id ASC');
  const [images] = await getPool().execute(
    'SELECT * FROM product_images WHERE is_deleted = 0 ORDER BY product_id ASC, sort_order ASC, id ASC'
  );

  const normalizedProducts = products.map((row) => ({
    _id: buildProductNo(row.id),
    id: Number(row.id || 0),
    product_no: buildProductNo(row.id),
    product_id: String(row.product_id || ''),
    category_key: String(row.category_key || ''),
    model_key: String(row.model_key || ''),
    platform: String(row.platform || ''),
    cover_text: String(row.cover_text || ''),
    cover_title: String(row.cover_title || ''),
    title: String(row.title || ''),
    subtitle: String(row.subtitle || ''),
    price: Number(row.price || 0),
    origin_price: Number(row.origin_price || row.price || 0),
    recycle_price: Number(row.recycle_price || 0),
    tag_text: String(row.tag_text || ''),
    hero_image: String(row.hero_image || ''),
    in_stock: Boolean(row.in_stock),
    recyclable: Boolean(row.recyclable),
    recycle_target_category_key: String(row.recycle_target_category_key || ''),
    premium_condition: Boolean(row.premium_condition),
    certified_price: Boolean(row.certified_price),
    release_order: Number(row.release_order || 0),
    hero_theme: String(row.hero_theme || ''),
    hero_accent: String(row.hero_accent || ''),
    edition_label: String(row.edition_label || ''),
    feature_tags: safeParseJsonArray(row.feature_tags),
    shopping_textA: String(row.shopping_textA || ''),
    shopping_textB: String(row.shopping_textB || ''),
    shopping_textC: String(row.shopping_textC || ''),
    status: Number(row.status || 0),
    is_deleted: Number(row.is_deleted || 0),
    stock: Number(row.stock || 0),
    min_stock: Number(row.min_stock || 0),
    unit: String(row.unit || ''),
    description: String(row.description || ''),
    content: String(row.content || ''),
    stock_display: Number(row.stock_display || 0),
    ischeck: Number(row.ischeck || 0),
  }));

  const normalizedImages = images.map((row) => ({
    _id: String(row.source_key || `${buildProductNo(row.product_id)}_${row.id}`),
    product_id: Number(row.product_id || 0),
    product_no: buildProductNo(row.product_id),
    image_type: String(row.image_type || 'detail'),
    image_url: String(row.image_url || ''),
    sort_order: Number(row.sort_order || 0),
    is_main: Boolean(row.is_main),
    status: Number(row.status || 0),
    is_deleted: Number(row.is_deleted || 0),
  }));

  writeProductCatalogSnapshotFiles({
    products: normalizedProducts,
    images: normalizedImages,
  });
};

const createAdminGoods = async (payload = {}) => {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [maxRows] = await connection.execute('SELECT COALESCE(MAX(id), 0) AS maxId FROM products FOR UPDATE');
    const nextId = Number(maxRows[0]?.maxId || 0) + 1;
    const values = await buildProductUpdateValues(payload, {
      id: nextId,
      model_key: `custom-${nextId}`,
      status: 1,
      ischeck: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
      origin_price: payload.min_price,
      recycle_price: payload.recycle_price,
    });
    const now = Date.now();

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
        nextId,
        values.product_id,
        values.category_key,
        values.model_key,
        values.platform,
        values.cover_text,
        values.cover_title,
        values.title,
        values.subtitle,
        values.price,
        values.origin_price,
        values.recycle_price,
        values.tag_text,
        values.hero_image,
        values.recyclable,
        values.recycle_target_category_key,
        values.release_order,
        values.hero_theme,
        values.hero_accent,
        values.edition_label,
        JSON.stringify(values.feature_tags || []),
        values.shopping_textA,
        values.shopping_textB,
        values.shopping_textC,
        values.description,
        values.content,
        values.stock,
        values.min_stock,
        values.stock_display,
        values.ischeck,
        values.status,
        values.unit,
        now,
        now,
      ]
    );

    await syncProductImages(
      connection,
      nextId,
      Object.prototype.hasOwnProperty.call(payload, 'images') ? payload.images : values.hero_image
    );

    if (Number(values.recyclable || 0) === 1) {
      await ensureRecycleConfigForGoods(connection, nextId, values);
    } else if (values.recycle_target_category_key) {
      await enableRecycleConfigForTarget(connection, values.recycle_target_category_key);
    }

    await connection.commit();
    await exportProductCatalogSnapshot();
    return getAdminGoodsById(nextId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateAdminGoods = async (id, payload = {}) => {
  const current = await getRawProductById(id, true);
  if (!current) {
    return null;
  }

  const values = await buildProductUpdateValues(payload, current);
  const currentCheck = Number(current.ischeck || 0);
  const currentStatus = normalizeProductSaleStatus(current.status);
  // 未通过审核不能上架；若仍是审核拒绝状态，也不允许绕过审核直接修改销售状态。
  if (values.status === 1 && values.ischeck !== 1) {
    throw createGoodsAuditBlockedError();
  }
  if (
    currentCheck === 2
    && values.ischeck === 2
    && values.status !== currentStatus
    && !(values.status === 3 && isProductSoldOutByStock(values.stock, current.reserved_stock))
  ) {
    throw createGoodsAuditBlockedError();
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `
        UPDATE products
        SET product_id = ?, category_key = ?, model_key = ?, platform = ?, cover_text = ?, cover_title = ?, title = ?, subtitle = ?,
            price = ?, origin_price = ?, recycle_price = ?, tag_text = ?, hero_image = ?, recyclable = ?, recycle_target_category_key = ?, release_order = ?,
            hero_theme = ?, hero_accent = ?, edition_label = ?, feature_tags = CAST(? AS JSON), shopping_textA = ?, shopping_textB = ?, shopping_textC = ?,
            description = ?, content = ?, stock = ?, min_stock = ?, stock_display = ?, ischeck = ?,
            status = ?, unit = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        values.product_id,
        values.category_key,
        values.model_key,
        values.platform,
        values.cover_text,
        values.cover_title,
        values.title,
        values.subtitle,
        values.price,
        values.origin_price,
        values.recycle_price,
        values.tag_text,
        values.hero_image,
        values.recyclable,
        values.recycle_target_category_key,
        values.release_order,
        values.hero_theme,
        values.hero_accent,
        values.edition_label,
        JSON.stringify(values.feature_tags || []),
        values.shopping_textA,
        values.shopping_textB,
        values.shopping_textC,
        values.description,
        values.content,
        values.stock,
        values.min_stock,
        values.stock_display,
        values.ischeck,
        values.status,
        values.unit,
        values.updated_at,
        Number(id || 0),
      ]
    );

    if (Object.prototype.hasOwnProperty.call(payload, 'images') || Object.prototype.hasOwnProperty.call(payload, 'cover')) {
      await syncProductImages(
        connection,
        Number(id || 0),
        Object.prototype.hasOwnProperty.call(payload, 'images') ? payload.images : values.hero_image
      );
    }

    if (Number(values.recyclable || 0) === 1) {
      await ensureRecycleConfigForGoods(connection, Number(id || 0), values);
    } else if (values.recycle_target_category_key) {
      await enableRecycleConfigForTarget(connection, values.recycle_target_category_key);
    } else {
      await removeRecycleConfigForGoods(connection, Number(id || 0));
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await exportProductCatalogSnapshot();
  return getAdminGoodsById(id);
};

const setAdminGoodsBanners = async (id, payload = {}) => {
  const current = await getRawProductById(id, true);
  if (!current) {
    return null;
  }

  const productId = Number(id || 0);
  const banners = normalizeProductGalleryUrls(payload.banners);
  const cover = banners[0] || String(current.hero_image || '').trim();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE products SET hero_image = ?, updated_at = ? WHERE id = ?', [cover, Date.now(), productId]);
    await syncProductImages(connection, productId, banners);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await exportProductCatalogSnapshot();
  return getAdminGoodsById(productId);
};

const updateGoodsStatus = async (ids = [], status = 0) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item || 0)).filter(Boolean)));
  if (!normalizedIds.length) {
    return 0;
  }

  const normalizedStatus = normalizeProductSaleStatus(status);
  const placeholders = normalizedIds.map(() => '?').join(', ');
  // 批量操作同样校验，避免绕过商品修改页直接变更未通过商品的销售状态。
  const [blockedRows] = await getPool().execute(
    `SELECT id FROM products
     WHERE id IN (${placeholders})
       AND (ischeck = 2 OR (? = 1 AND ischeck <> 1))
     LIMIT 1`,
    [...normalizedIds, normalizedStatus]
  );
  if (blockedRows.length) {
    throw createGoodsAuditBlockedError();
  }
  const [result] = await getPool().execute(
    `UPDATE products
     SET status = CASE WHEN stock <= 0 OR stock <= reserved_stock THEN 3 ELSE ? END, updated_at = ?
     WHERE id IN (${placeholders})`,
    [normalizedStatus, Date.now(), ...normalizedIds]
  );
  await exportProductCatalogSnapshot();
  return Number(result.affectedRows || 0);
};

const softDeleteGoods = async (ids = []) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item || 0)).filter(Boolean)));
  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [result] = await getPool().execute(
    // 商品移入回收站时必须同步下架，恢复后仍保持下架，避免未经确认重新出售。
    `UPDATE products SET is_deleted = 1, status = 2, updated_at = ? WHERE id IN (${placeholders})`,
    [Date.now(), ...normalizedIds]
  );
  await exportProductCatalogSnapshot();
  return Number(result.affectedRows || 0);
};

const restoreGoods = async (ids = []) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item || 0)).filter(Boolean)));
  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [result] = await getPool().execute(
    `UPDATE products SET is_deleted = 0, updated_at = ? WHERE id IN (${placeholders})`,
    [Date.now(), ...normalizedIds]
  );
  await exportProductCatalogSnapshot();
  return Number(result.affectedRows || 0);
};

const destroyGoodsWithConnection = async (connection, ids = []) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item || 0)).filter(Boolean)));
  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [productRows] = await connection.execute(
    `
      SELECT id, product_id, title, hero_image, cover_title, price
      FROM products
      WHERE id IN (${placeholders})
      FOR UPDATE
    `,
    normalizedIds
  );
  const productIds = productRows.map((row) => Number(row.id || 0)).filter(Boolean);

  if (!productIds.length) {
    return 0;
  }

  const now = Date.now();
  const productPlaceholders = productIds.map(() => '?').join(', ');
  await connection.execute(
    `
      UPDATE purchase_orders po
      INNER JOIN products p ON p.id = po.product_id
      SET
        po.product_code_snapshot = COALESCE(NULLIF(TRIM(p.product_id), ''), po.product_code_snapshot),
        po.product_title_snapshot = COALESCE(NULLIF(TRIM(p.title), ''), po.product_title_snapshot),
        po.product_cover_snapshot = COALESCE(NULLIF(TRIM(p.hero_image), ''), po.product_cover_snapshot),
        po.product_cover_title_snapshot = COALESCE(NULLIF(TRIM(p.cover_title), ''), po.product_cover_title_snapshot),
        po.product_price_snapshot = CASE
          WHEN p.price IS NULL THEN po.product_price_snapshot
          ELSE p.price
        END,
        po.product_id = NULL,
        po.updated_at = ?
      WHERE po.product_id IN (${productPlaceholders})
    `,
    [now, ...productIds]
  );

  await connection.execute(
    `
      UPDATE recycle_orders
      SET published_product_id = NULL, updated_at = ?
      WHERE published_product_id IN (${productPlaceholders})
    `,
    [now, ...productIds]
  );
  await connection.execute(
    `
      UPDATE recycle_submission_reviews
      SET published_product_id = NULL
      WHERE published_product_id IN (${productPlaceholders})
    `,
    productIds
  );

  const [recycleRows] = await connection.execute(
    `
      SELECT id, option_profile_key
      FROM recycle_products
      WHERE product_id IN (${productPlaceholders})
    `,
    productIds
  );
  const recycleProductIds = recycleRows.map((row) => Number(row.id || 0)).filter(Boolean);
  const recycleProfileKeys = Array.from(
    new Set(recycleRows.map((row) => String(row.option_profile_key || '').trim()).filter(Boolean))
  );
  const recycleTargetKeys = Array.from(
    new Set(recycleProductIds.map((id) => String(id)).concat(recycleProfileKeys))
  );

  if (recycleTargetKeys.length) {
    const recycleTargetPlaceholders = recycleTargetKeys.map(() => '?').join(', ');
    await connection.execute(
      `
        UPDATE products
        SET recycle_target_category_key = '', updated_at = ?
        WHERE recycle_target_category_key IN (${recycleTargetPlaceholders})
      `,
      [now, ...recycleTargetKeys]
    );
  }

  await connection.execute(`DELETE FROM admin_goods_comments WHERE product_id IN (${productPlaceholders})`, productIds);

  if (recycleProductIds.length) {
    await connection.execute(`DELETE FROM recycle_products WHERE product_id IN (${productPlaceholders})`, productIds);
    for (const profileKey of recycleProfileKeys) {
      await ensureRecycleOptionConfigRemovedIfUnused(connection, profileKey);
    }
  }

  await connection.execute(`DELETE FROM product_images WHERE product_id IN (${productPlaceholders})`, productIds);
  const [deleteResult] = await connection.execute(`DELETE FROM products WHERE id IN (${productPlaceholders})`, productIds);
  return Number(deleteResult.affectedRows || 0);
};

const destroyGoods = async (ids = []) => {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const affectedRows = await destroyGoodsWithConnection(connection, ids);
    await connection.commit();
    await exportProductCatalogSnapshot();
    return affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 审核商品，可在审核通过时同步设置上架状态。
const checkGoods = async (id, ischeck = 1, status = undefined) => {
  const productId = Number(id || 0);
  if (!productId) {
    return null;
  }

  const normalizedCheck = normalizeProductAuditStatus(ischeck);
  const normalizedStatus = status === undefined ? null : normalizeProductSaleStatus(status);
  const [productRows] = await getPool().execute(
    'SELECT model_key, stock, reserved_stock FROM products WHERE id = ? LIMIT 1',
    [productId]
  );
  if (!productRows.length) {
    return null;
  }
  // 回收检测商品的审核结果只能通过“修改”弹窗保存，避免列表快捷按钮绕过该流程。
  if (/^recycle-\d+-/.test(String(productRows[0].model_key || ''))) {
    const error = new Error('请在商品修改页调整审核状态');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedStatus === 1 && normalizedCheck !== 1) {
    throw createGoodsAuditBlockedError();
  }
  if (normalizedStatus === null) {
    await getPool().execute('UPDATE products SET ischeck = ?, status = CASE WHEN stock <= 0 OR stock <= reserved_stock THEN 3 ELSE status END, updated_at = ? WHERE id = ?', [
      normalizedCheck,
      Date.now(),
      productId,
    ]);
  } else {
    await getPool().execute('UPDATE products SET ischeck = ?, status = ?, updated_at = ? WHERE id = ?', [
      normalizedCheck,
      isProductSoldOutByStock(productRows[0].stock, productRows[0].reserved_stock) ? 3 : normalizedStatus,
      Date.now(),
      productId,
    ]);
  }
  await exportProductCatalogSnapshot();
  return getAdminGoodsById(productId);
};

const getStaffById = async (id) => {
  const staffId = Number(id || 0);
  if (!staffId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [staffId]);
  if (!rows.length) {
    return null;
  }

  const staff = mapStaffRowToAdmin(rows[0]);
  if (staff.permission !== STAFF_PERMISSIONS.STAFF || rows[0].access_rules === null || rows[0].access_rules === '') {
    return staff;
  }
  const storedAccessRules = await listStaffPermissionRules(staffId);
  return {
    ...staff,
    accessRules: storedAccessRules.length ? storedAccessRules : staff.accessRules,
  };
};

const getSuperadminCredentialByUsername = async (username) => {
  const normalizedUsername = normalizeStaffUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM superadmin_key WHERE LOWER(username) = ? LIMIT 1', [normalizedUsername]);
  return rows[0] || null;
};

const getSuperadminCredentialByStaffId = async (staffId) => {
  const normalizedStaffId = Number(staffId || 0);
  if (!normalizedStaffId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM superadmin_key WHERE staff_id = ? LIMIT 1', [normalizedStaffId]);
  return rows[0] || null;
};

const getStaffByLoginIdentity = async (username) => {
  const normalizedUsername = normalizeStaffUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  const filters = ['LOWER(username) = ?'];
  const params = [normalizedUsername];

  if (isValidPhone(normalizedUsername)) {
    filters.push('phone = ?');
    params.push(normalizedUsername);
  }

  if (isValidEmail(normalizedUsername)) {
    filters.push('LOWER(email) = ?');
    params.push(normalizedUsername);
  }

  const [rows] = await getPool().execute(
    `SELECT * FROM staff WHERE ${filters.join(' OR ')} ORDER BY id ASC LIMIT 1`,
    params
  );
  return rows[0] || null;
};

const touchStaffLastLogin = async (staffId) => {
  const normalizedStaffId = Number(staffId || 0);
  if (!normalizedStaffId) {
    return null;
  }

  const now = Date.now();
  await getPool().execute(
    'UPDATE staff SET last_login_at = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?',
    [now, now, normalizedStaffId]
  );
  return getStaffById(normalizedStaffId);
};

const assertUniqueStaffField = async (fieldName, value, currentId = 0) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return;
  }

  const compareValue = fieldName === 'email' || fieldName === 'username'
    ? normalizedValue.toLowerCase()
    : normalizedValue;

  const [rows] = await getPool().execute(
    `SELECT id FROM staff WHERE ${fieldName === 'email' || fieldName === 'username' ? `LOWER(${fieldName})` : fieldName} = ? LIMIT 1`,
    [compareValue]
  );
  if (rows.length && Number(rows[0].id || 0) !== Number(currentId || 0)) {
    if (fieldName === 'phone') {
      throw new Error('手机号已被使用');
    }
    if (fieldName === 'email') {
      throw new Error('邮箱已被使用');
    }
    throw new Error('登录账号已被使用');
  }
};

const syncSuperadminCredential = async (staffRow, passwordHash) => {
  const staff = staffRow && typeof staffRow === 'object' ? staffRow : null;
  if (!staff || Number(staff.id || 0) <= 0) {
    return;
  }

  if (normalizeStaffPermission(staff.permission) !== STAFF_PERMISSIONS.SUPERADMIN) {
    await getPool().execute('DELETE FROM superadmin_key WHERE staff_id = ?', [Number(staff.id || 0)]);
    return;
  }

  const username = maskEmptyString(staff.username);
  if (!username) {
    throw new Error('超级管理员缺少登录账号');
  }

  const credential = await getSuperadminCredentialByStaffId(staff.id);
  const nextPasswordHash = String(passwordHash || staff.password_hash || '').trim();
  const now = Date.now();

  if (credential) {
    await getPool().execute(
      'UPDATE superadmin_key SET username = ?, password_hash = ?, updated_at = ? WHERE staff_id = ?',
      [username, nextPasswordHash, now, Number(staff.id || 0)]
    );
    return;
  }

  await getPool().execute(
    `
      INSERT INTO superadmin_key (staff_id, username, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [Number(staff.id || 0), username, nextPasswordHash, now, now]
  );
};

const verifyAdminLogin = async (username, password) => {
  const normalizedUsername = normalizeStaffUsername(username);
  const normalizedPassword = String(password || '');
  if (!normalizedUsername || !normalizedPassword) {
    return null;
  }

  const superadminCredential = await getSuperadminCredentialByUsername(normalizedUsername);
  if (superadminCredential) {
    const staff = await getStaffById(superadminCredential.staff_id);
    if (!staff || normalizeStaffPermission(staff.permission) !== STAFF_PERMISSIONS.SUPERADMIN) {
      return null;
    }

    if (String(superadminCredential.password_hash || '') !== hashPassword(normalizedPassword)) {
      return null;
    }

    return touchStaffLastLogin(staff.id);
  }

  const staffRow = await getStaffByLoginIdentity(normalizedUsername);
  if (!staffRow) {
    return null;
  }

  if (String(staffRow.password_hash || '') !== hashPassword(normalizedPassword)) {
    return null;
  }

  return touchStaffLastLogin(staffRow.id);
};

const getAdminById = async (id) => getStaffById(id);

const INVENTORY_DEFAULT_COLUMNS = [
  { key: 'inspection_report', label: '检测报告', fixed: 'left' },
  { key: 'inventory_number', label: '编号', fixed: 'left' },
  { key: 'sf_express_number', label: '顺丰单号', fixed: 'left' },
  { key: 'payment_status', label: '钱款情况', fixed: 'left' },
  { key: 'machine_status', label: '机器状态' },
  { key: 'promotion_source', label: '推广来源' },
  { key: 'recycle_communication_platform', label: '回收沟通平台' },
  { key: 'recycle_id', label: '回收ID' },
  { key: 'recycle_address', label: '回收地址' },
  { key: 'communication_price', label: '沟通价格' },
  { key: 'paid_price', label: '已付价格' },
  { key: 'recycle_freight', label: '回收运费' },
  { key: 'final_sale_price', label: '最终售价' },
  { key: 'sale_freight', label: '卖出运费' },
  { key: 'platform_fee', label: '平台费' },
  { key: 'profit', label: '利润' },
  { key: 'sale_channel', label: '卖出渠道' },
  { key: 'sale_id', label: '卖出ID' },
  { key: 'sale_address', label: '卖出地址' },
  { key: 'created_time_text', label: '创建时间', fieldType: 'time' },
  { key: 'remark_info', label: '备注信息' },
  { key: 'inspection_result', label: '检测结果' },
];
const INVENTORY_TEXT_FIELDS = INVENTORY_DEFAULT_COLUMNS.map((column) => column.key);
const INVENTORY_CUSTOM_COLUMN_KEY_PATTERN = /^custom_[a-z0-9_]+$/;
const INVENTORY_IMAGE_VALUE_SUFFIX = '__images';
const getInventoryImageValueKey = (columnKey) => `${String(columnKey || '')}${INVENTORY_IMAGE_VALUE_SUFFIX}`;

const mapInventoryManagementRow = (row, visibleColumnKeys = null, imageColumnKeys = new Set()) => ({
  id: Number(row.id || 0),
  ...INVENTORY_TEXT_FIELDS.reduce((result, field) => {
    if (!visibleColumnKeys || visibleColumnKeys.has(field)) {
      result[field] = String(row[field] || '');
    }
    return result;
  }, {}),
  ...Object.entries(safeParseJsonObject(row.custom_fields, {})).reduce((result, [key, value]) => {
    const imageColumnKey = key.endsWith(INVENTORY_IMAGE_VALUE_SUFFIX)
      ? key.slice(0, -INVENTORY_IMAGE_VALUE_SUFFIX.length)
      : '';
    if (imageColumnKey && imageColumnKeys.has(imageColumnKey)) {
      if (!visibleColumnKeys || visibleColumnKeys.has(imageColumnKey)) result[key] = normalizeInventoryImageUrls(value);
      return result;
    }
    if (!INVENTORY_CUSTOM_COLUMN_KEY_PATTERN.test(key)) return result;
    if (!visibleColumnKeys || visibleColumnKeys.has(key)) {
      // 兼容历史图片数据：旧版本直接将图片数组保存在列字段中。
      result[key] = imageColumnKeys.has(key) && Array.isArray(value)
        ? ''
        : String(value === null || value === undefined ? '' : value);
      if (imageColumnKeys.has(key) && Array.isArray(value)) result[getInventoryImageValueKey(key)] = normalizeInventoryImageUrls(value);
    }
    return result;
  }, {}),
  created_at: Number(row.created_at || 0),
  updated_at: Number(row.updated_at || 0),
});

const normalizeInventoryText = (value) => String(value === null || value === undefined ? '' : value).trim();

const parseInventoryTimeNode = (value) => {
  const text = normalizeInventoryText(value);
  if (!text) return 0;
  if (/^\d{10,13}$/.test(text)) {
    const timestamp = Number(text);
    return text.length === 10 ? timestamp * 1000 : timestamp;
  }
  const matched = text.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2})\D(\d{1,2})(?:\D(\d{1,2}))?)?$/);
  if (matched) {
    const date = new Date(
      Number(matched[1]),
      Number(matched[2]) - 1,
      Number(matched[3]),
      Number(matched[4] || 0),
      Number(matched[5] || 0),
      Number(matched[6] || 0),
    );
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatInventoryTimeNode = (value) => {
  const timestamp = typeof value === 'number' ? value : parseInventoryTimeNode(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const date = new Date(timestamp);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const normalizeInventoryTimeNode = (value) => formatInventoryTimeNode(value);

// 图片列仅保存本站上传路径或完整 HTTP(S) 图片地址，并限制为九张。
const normalizeInventoryImageUrls = (value) => {
  let values = value;
  if (typeof values === 'string') {
    try {
      values = JSON.parse(values);
    } catch (error) {
      values = [];
    }
  }
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .map((item) => String(item || '').trim())
    .filter((item) => /^(https?:\/\/|\/uploads\/)/i.test(item))
  )).slice(0, 9);
};

const INVENTORY_NUMBER_PREFIX = 'XM';
const INVENTORY_NUMBER_PATTERN = /^XM(\d{2})(0[1-9]|1[0-2])(\d+)$/i;

const getInventoryNumberPeriod = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};

const getInventoryNumberSequenceKey = (period) => `inventory_number_${period}`;

const parseInventoryNumber = (value) => {
  const matched = normalizeInventoryText(value).match(INVENTORY_NUMBER_PATTERN);
  if (!matched) {
    return null;
  }

  const sequence = Number(matched[3] || 0);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    return null;
  }

  return {
    period: `${matched[1]}${matched[2]}`,
    sequence,
  };
};

const advanceInventoryNumberSequence = async (executor, inventoryNumber) => {
  const parsed = parseInventoryNumber(inventoryNumber);
  if (!parsed) {
    return;
  }

  await setSequenceValue(executor, getInventoryNumberSequenceKey(parsed.period), parsed.sequence);
};

const createNextInventoryNumber = async (connection, timestamp = Date.now(), lastDisplayedInventoryNumber = '') => {
  const period = getInventoryNumberPeriod(timestamp);
  const prefix = `${INVENTORY_NUMBER_PREFIX}${period}`;
  const displayedNumber = parseInventoryNumber(lastDisplayedInventoryNumber);
  if (displayedNumber?.period === period) {
    const nextSequence = displayedNumber.sequence + 1;
    // 手动新增以库存列表当前显示的最新编号为准，不受误录数据库记录影响。
    await setSequenceValue(connection, getInventoryNumberSequenceKey(period), nextSequence);
    return `${prefix}${String(nextSequence).padStart(3, '0')}`;
  }
  const sequence = await getNextSequenceValue(connection, getInventoryNumberSequenceKey(period));
  return `${prefix}${String(sequence).padStart(3, '0')}`;
};

// 用途：规范化库存管理列下拉选项及其选项框、文字颜色，并兼容旧版字符串配置。
const DEFAULT_INVENTORY_OPTION_TEXT_COLOR = '#000000';
const normalizeInventoryOptionColor = (value) => {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : '';
};

const normalizeInventoryColumnOptions = (options) => {
  const seenLabels = new Set();
  return (Array.isArray(options) ? options : [])
    .map((option) => {
      const source = option && typeof option === 'object' && !Array.isArray(option) ? option : {};
      const label = normalizeInventoryText(
        typeof option === 'string' ? option : (source.label ?? source.value ?? ''),
      ).slice(0, 40);
      if (!label || seenLabels.has(label)) return null;
      seenLabels.add(label);
      return {
        label,
        color: normalizeInventoryOptionColor(source.color),
        textColor: normalizeInventoryOptionColor(source.textColor ?? source.text_color) || DEFAULT_INVENTORY_OPTION_TEXT_COLOR,
      };
    })
    .filter(Boolean)
    .slice(0, 100);
};

const parseInventoryColumnOptions = (value) => {
  try {
    return normalizeInventoryColumnOptions(JSON.parse(value || '[]'));
  } catch (error) {
    return [];
  }
};

const mapInventoryColumn = (row) => ({
  key: String(row.column_key || ''),
  label: String(row.label || ''),
  sort: Math.max(1, Number(row.sort_order || 0) || 1),
  fixed: ['left', 'right'].includes(String(row.fixed_position || '')) ? String(row.fixed_position) : '',
  fieldType: ['image', 'time'].includes(String(row.field_type || '').toLowerCase())
    ? String(row.field_type).toLowerCase()
    : 'text',
  isCustom: Boolean(row.is_custom),
  calculated: Boolean(row.is_calculated),
  options: parseInventoryColumnOptions(row.select_options),
});

const ensureInventoryColumns = async () => {
  const now = Date.now();
  for (const [index, column] of INVENTORY_DEFAULT_COLUMNS.entries()) {
    await getPool().execute(
      `INSERT INTO inventory_management_columns (column_key, label, sort_order, is_custom, fixed_position, field_type, is_visible, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         field_type = CASE WHEN VALUES(field_type) = 'time' THEN 'time' ELSE field_type END,
         column_key = VALUES(column_key)`,
      [column.key, column.label, index + 1, column.fixed || null, column.fieldType || 'text', now, now]
    );
  }
};

const normalizeInventoryColumnSortOrders = async () => {
  const [rows] = await getPool().execute(
    'SELECT column_key, sort_order FROM inventory_management_columns WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC'
  );
  const usesLegacyDefaults = rows.length > 0 && rows.every((row, index) => Number(row.sort_order || 0) === (index + 1) * 10);
  if (!usesLegacyDefaults) return;
  for (const [index, row] of rows.entries()) {
    await getPool().execute(
      'UPDATE inventory_management_columns SET sort_order = ? WHERE column_key = ?',
      [index + 1, row.column_key]
    );
  }
};

const initializeInventoryColumnFixedPositions = async () => {
  const fixedColumns = INVENTORY_DEFAULT_COLUMNS.filter((column) => column.fixed);
  if (!fixedColumns.length) return;

  const caseSql = fixedColumns.map(() => 'WHEN ? THEN ?').join(' ');
  const placeholders = fixedColumns.map(() => '?').join(', ');
  await getPool().execute(
    `UPDATE inventory_management_columns
     SET fixed_position = CASE column_key ${caseSql} END
     WHERE fixed_position IS NULL AND column_key IN (${placeholders})`,
    [
      ...fixedColumns.flatMap((column) => [column.key, column.fixed]),
      ...fixedColumns.map((column) => column.key),
    ]
  );
};

// 用途：读取员工库存列的显示与修改权限，未配置员工默认全部可见且可修改。
const getInventoryColumnAccess = async (staffId) => {
  const normalizedStaffId = Number(staffId || 0);
  if (!normalizedStaffId) {
    return null;
  }

  const [[staffRow]] = await getPool().execute(
    'SELECT id, permission FROM staff WHERE id = ? LIMIT 1',
    [normalizedStaffId]
  );
  if (!staffRow || String(staffRow.permission || '').trim() !== STAFF_PERMISSIONS.STAFF) {
    return null;
  }

  const [permissionRows] = await getPool().execute(
    'SELECT column_key, is_visible, is_editable FROM inventory_management_column_permissions WHERE staff_id = ?',
    [normalizedStaffId]
  );
  if (!permissionRows.length) {
    return null;
  }

  return {
    visibleColumnKeys: new Set(
      permissionRows
        .filter((row) => Number(row.is_visible || 0) === 1)
        .map((row) => String(row.column_key || '').trim())
        .filter(Boolean)
    ),
    editableColumnKeys: new Set(
      permissionRows
        .filter((row) => Number(row.is_visible || 0) === 1 && Number(row.is_editable ?? 1) === 1)
        .map((row) => String(row.column_key || '').trim())
        .filter(Boolean)
    ),
  };
};

const getInventoryVisibleColumnKeys = async (staffId) => {
  const access = await getInventoryColumnAccess(staffId);
  return access ? access.visibleColumnKeys : null;
};

const getInventoryImageColumnKeys = async () => {
  const [rows] = await getPool().execute(
    "SELECT column_key FROM inventory_management_columns WHERE is_visible = 1 AND field_type = 'image'"
  );
  return new Set(rows.map((row) => String(row.column_key || '').trim()).filter(Boolean));
};

const getInventoryTimeColumnKeys = async () => {
  const [rows] = await getPool().execute(
    "SELECT column_key FROM inventory_management_columns WHERE is_visible = 1 AND field_type = 'time'"
  );
  return new Set(rows.map((row) => String(row.column_key || '').trim()).filter(Boolean));
};

const listAdminInventoryColumns = async ({ staffId = 0 } = {}) => {
  const [rows] = await getPool().execute(
    `SELECT column_key, label, sort_order, fixed_position, field_type, is_custom, select_options,
       EXISTS (SELECT 1 FROM inventory_management_calculations calculations WHERE calculations.target_column_key = inventory_management_columns.column_key) AS is_calculated
     FROM inventory_management_columns
     WHERE is_visible = 1
     ORDER BY sort_order ASC, id ASC`
  );
  const columns = rows.map(mapInventoryColumn);
  const access = await getInventoryColumnAccess(staffId);
  return access
    ? columns
      .filter((column) => access.visibleColumnKeys.has(column.key))
      .map((column) => ({ ...column, editable: access.editableColumnKeys.has(column.key) }))
    : columns.map((column) => ({ ...column, editable: true }));
};

const listAdminInventoryColumnPermissions = async () => {
  const [staffRows] = await getPool().execute(
    `SELECT id, username, name, avatar
     FROM staff
     WHERE permission = ?
     ORDER BY name ASC, username ASC, id ASC`,
    [STAFF_PERMISSIONS.STAFF]
  );
  const [columnRows] = await getPool().execute(
    `SELECT column_key, label
     FROM inventory_management_columns
     WHERE is_visible = 1
     ORDER BY sort_order ASC, id ASC`
  );
  const columns = columnRows.map((row) => ({
    key: String(row.column_key || ''),
    label: String(row.label || ''),
  }));
  const [permissionRows] = await getPool().execute(
    'SELECT staff_id, column_key, is_visible, is_editable FROM inventory_management_column_permissions'
  );
  const configuredStaffIds = new Set(permissionRows.map((row) => Number(row.staff_id || 0)));
  const permissionsByStaff = new Map();
  permissionRows.forEach((row) => {
    const staffId = Number(row.staff_id || 0);
    if (!permissionsByStaff.has(staffId)) {
      permissionsByStaff.set(staffId, []);
    }
    if (Number(row.is_visible || 0) === 1) {
        permissionsByStaff.get(staffId).push({
          key: String(row.column_key || ''),
          editable: Number(row.is_editable ?? 1) === 1,
        });
    }
  });

  return {
    staff: staffRows.map((row) => ({
      id: Number(row.id || 0),
      account: String(row.username || ''),
      name: String(row.name || '').trim(),
      avatar: normalizeAvatarUrlForDisplay(row.avatar || ''),
    })),
    columns,
    permissions: staffRows.map((row) => {
      const staffId = Number(row.id || 0);
      return {
        staffId,
        configured: configuredStaffIds.has(staffId),
        visibleColumnKeys: configuredStaffIds.has(staffId)
          ? (permissionsByStaff.get(staffId) || []).map((item) => item.key)
          : columns.map((column) => column.key),
        editableColumnKeys: configuredStaffIds.has(staffId)
          ? (permissionsByStaff.get(staffId) || []).filter((item) => item.editable).map((item) => item.key)
          : columns.map((column) => column.key),
      };
    }),
  };
};

const updateAdminInventoryColumnPermissions = async (payload = {}) => {
  const staffId = Number(payload.staffId || payload.staff_id || 0);
  if (!staffId) {
    throw new Error('请选择员工');
  }
  const visibleColumnKeys = Array.isArray(payload.visibleColumnKeys)
    ? payload.visibleColumnKeys
    : payload.visible_column_keys;
  if (!Array.isArray(visibleColumnKeys)) {
    throw new Error('请选择列可见范围');
  }
  const editableColumnKeys = Array.isArray(payload.editableColumnKeys)
    ? payload.editableColumnKeys
    : payload.editable_column_keys;
  if (editableColumnKeys !== undefined && !Array.isArray(editableColumnKeys)) {
    throw new Error('列修改权限格式不正确');
  }

  const [staffRows] = await getPool().execute(
    'SELECT id, permission FROM staff WHERE id = ? LIMIT 1',
    [staffId]
  );
  if (!staffRows.length || String(staffRows[0].permission || '').trim() !== STAFF_PERMISSIONS.STAFF) {
    throw new Error('只能设置员工的列可见权限');
  }

  const [columnRows] = await getPool().execute(
    'SELECT column_key FROM inventory_management_columns WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC'
  );
  const columnKeys = columnRows.map((row) => String(row.column_key || '').trim()).filter(Boolean);
  const requestedKeys = new Set(visibleColumnKeys.map((key) => String(key || '').trim()));
  const normalizedVisibleKeys = columnKeys.filter((key) => requestedKeys.has(key));
  const requestedEditableKeys = new Set(
    (Array.isArray(editableColumnKeys) ? editableColumnKeys : normalizedVisibleKeys)
      .map((key) => String(key || '').trim())
  );
  const normalizedEditableKeys = columnKeys.filter((key) => requestedEditableKeys.has(key) && requestedKeys.has(key));
  if (!normalizedVisibleKeys.length) {
    throw new Error('至少保留一列可见');
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'DELETE FROM inventory_management_column_permissions WHERE staff_id = ?',
      [staffId]
    );
    const now = Date.now();
    for (const columnKey of columnKeys) {
      await connection.execute(
        `INSERT INTO inventory_management_column_permissions (staff_id, column_key, is_visible, is_editable, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          staffId,
          columnKey,
          normalizedVisibleKeys.includes(columnKey) ? 1 : 0,
          normalizedEditableKeys.includes(columnKey) ? 1 : 0,
          now,
          now,
        ]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    staffId,
    configured: true,
    visibleColumnKeys: normalizedVisibleKeys,
    editableColumnKeys: normalizedEditableKeys,
  };
};

const normalizeInventoryColumnLabel = (value) => normalizeInventoryText(value).slice(0, 40);
const normalizeInventoryColumnFixedPosition = (value) => {
  const position = String(value || '').trim().toLowerCase();
  return ['left', 'right'].includes(position) ? position : '';
};
const normalizeInventoryColumnFieldType = (value) => {
  const fieldType = String(value || '').trim().toLowerCase();
  return ['image', 'time'].includes(fieldType) ? fieldType : 'text';
};

const createAdminInventoryColumn = async (payload = {}) => {
  const label = normalizeInventoryColumnLabel(payload.label);
  if (!label) {
    throw new Error('列标题不能为空');
  }

  const now = Date.now();
  const columnKey = `custom_${now.toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const [[sortRow]] = await getPool().execute(
    'SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM inventory_management_columns'
  );
  await getPool().execute(
    `INSERT INTO inventory_management_columns (column_key, label, sort_order, is_custom, fixed_position, field_type, is_visible, created_at, updated_at)
     VALUES (?, ?, ?, 1, '', ?, 1, ?, ?)`,
    [columnKey, label, Math.max(1, Number(sortRow.maxSortOrder || 0) + 1), normalizeInventoryColumnFieldType(payload.fieldType ?? payload.field_type), now, now]
  );
  return { key: columnKey, label, sort: Math.max(1, Number(sortRow.maxSortOrder || 0) + 1), fixed: '', fieldType: normalizeInventoryColumnFieldType(payload.fieldType ?? payload.field_type), isCustom: true };
};

const updateAdminInventoryColumn = async (key, payload = {}) => {
  const columnKey = String(key || '');
  const updates = [];
  if (Object.prototype.hasOwnProperty.call(payload, 'label')) {
    const label = normalizeInventoryColumnLabel(payload.label);
    if (!label) {
      throw new Error('列标题不能为空');
    }
    updates.push(['label', label]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'fixed')) {
    updates.push(['fixed_position', normalizeInventoryColumnFixedPosition(payload.fixed)]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'fieldType') || Object.prototype.hasOwnProperty.call(payload, 'field_type')) {
    const fieldType = normalizeInventoryColumnFieldType(payload.fieldType ?? payload.field_type);
    updates.push(['field_type', fieldType]);
    if (fieldType === 'image' || fieldType === 'time') updates.push(['select_options', '[]']);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'sort')) {
    const sort = Number(payload.sort);
    if (!Number.isFinite(sort) || sort < 1) {
      throw new Error('排序必须是大于等于1的整数');
    }
    updates.push(['sort_order', Math.max(1, Math.trunc(sort))]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'options')) {
    updates.push(['select_options', JSON.stringify(normalizeInventoryColumnOptions(payload.options))]);
  }
  if (!updates.length) return null;
  const [result] = await getPool().execute(
    `UPDATE inventory_management_columns SET ${updates.map(([field]) => `${field} = ?`).join(', ')}, updated_at = ? WHERE column_key = ? AND is_visible = 1`,
    [...updates.map(([, value]) => value), Date.now(), columnKey]
  );
  if (!Number(result.affectedRows || 0)) {
    return null;
  }
  const [rows] = await getPool().execute(
    `SELECT column_key, label, sort_order, fixed_position, field_type, is_custom, select_options,
       EXISTS (SELECT 1 FROM inventory_management_calculations calculations WHERE calculations.target_column_key = inventory_management_columns.column_key) AS is_calculated
     FROM inventory_management_columns
     WHERE column_key = ?
     LIMIT 1`,
    [columnKey]
  );
  return mapInventoryColumn(rows[0] || {});
};

const deleteAdminInventoryColumn = async (key) => {
  const columnKey = String(key || '');
  const [[countRow]] = await getPool().execute(
    'SELECT COUNT(1) AS totalCount FROM inventory_management_columns WHERE is_visible = 1'
  );
  if (Number(countRow.totalCount || 0) <= 1) {
    throw new Error('至少保留一列');
  }
  const [result] = await getPool().execute(
    'UPDATE inventory_management_columns SET is_visible = 0, updated_at = ? WHERE column_key = ? AND is_visible = 1',
    [Date.now(), columnKey]
  );
  return Number(result.affectedRows || 0) > 0;
};

const getInventoryCustomFields = (payload = {}, imageColumnKeys = new Set(), timeColumnKeys = new Set()) => Object.entries(payload).reduce((result, [key, value]) => {
  const imageColumnKey = key.endsWith(INVENTORY_IMAGE_VALUE_SUFFIX)
    ? key.slice(0, -INVENTORY_IMAGE_VALUE_SUFFIX.length)
    : '';
  if (imageColumnKey && imageColumnKeys.has(imageColumnKey)) {
    result[key] = normalizeInventoryImageUrls(value);
    return result;
  }
  if (INVENTORY_CUSTOM_COLUMN_KEY_PATTERN.test(key)) {
    result[key] = imageColumnKey && imageColumnKeys.has(imageColumnKey)
      ? normalizeInventoryImageUrls(value)
      : imageColumnKeys.has(key) && Array.isArray(value)
        ? normalizeInventoryImageUrls(value)
      : timeColumnKeys.has(key)
        ? normalizeInventoryTimeNode(value)
        : normalizeInventoryText(value);
  }
  return result;
}, {});

const INVENTORY_CALCULATION_OPERATORS = new Set(['+', '-', '*', '/']);
const INVENTORY_TIME_CALCULATION_OPERATORS = new Set(['+', '-']);
const INVENTORY_CALCULATION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const INVENTORY_CALCULATION_TYPES = new Set(['number', 'time']);

const normalizeInventoryCalculationType = (value) => INVENTORY_CALCULATION_TYPES.has(String(value || '').trim())
  ? String(value).trim()
  : 'number';

const normalizeInventoryCalculationExpression = (value, calculationType = 'number') => {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedOperators = normalizeInventoryCalculationType(calculationType) === 'time'
    ? INVENTORY_TIME_CALCULATION_OPERATORS
    : INVENTORY_CALCULATION_OPERATORS;

  const expression = value.map((token) => {
    const type = String(token?.type || '').trim();
    const tokenValue = String(token?.value || '').trim();
    if (type === 'operator' && allowedOperators.has(tokenValue)) {
      return { type, value: tokenValue };
    }
    if (type === 'column' && INVENTORY_CALCULATION_KEY_PATTERN.test(tokenValue)) {
      return { type, value: tokenValue };
    }
    return null;
  }).filter(Boolean);

  if (!expression.length || expression[0].type !== 'column' || expression[expression.length - 1].type !== 'column') {
    return [];
  }
  for (let index = 0; index < expression.length; index += 1) {
    const expectedType = index % 2 === 0 ? 'column' : 'operator';
    if (expression[index].type !== expectedType) {
      return [];
    }
  }
  return expression;
};

const parseInventoryCalculationExpression = (value, calculationType = 'number') => {
  try {
    return normalizeInventoryCalculationExpression(JSON.parse(value || '[]'), calculationType);
  } catch (_error) {
    return [];
  }
};

const getInventoryCalculationRules = async () => {
  const [rows] = await getPool().execute(
    `
      SELECT c.id, c.target_column_key, c.expression_json, c.calculation_type, columns.label AS target_column_label
      FROM inventory_management_calculations c
      LEFT JOIN inventory_management_columns columns ON columns.column_key = c.target_column_key
      ORDER BY c.id ASC
    `
  );
  return rows.map((row) => ({
    id: Number(row.id || 0),
    targetColumnKey: String(row.target_column_key || ''),
    targetColumnLabel: String(row.target_column_label || row.target_column_key || ''),
    calculationType: normalizeInventoryCalculationType(row.calculation_type),
    expression: parseInventoryCalculationExpression(row.expression_json, row.calculation_type),
  }));
};

const mapInventoryCalculationValue = (row, customFields, key) => {
  if (Object.prototype.hasOwnProperty.call(row, key)) {
    return parseInventoryMoney(row[key]);
  }
  return parseInventoryMoney(customFields[key]);
};

const evaluateInventoryCalculation = (row, customFields, expression) => {
  if (!expression.length) {
    return '';
  }

  const values = [mapInventoryCalculationValue(row, customFields, expression[0].value)];
  const lowPrecedenceOperators = [];
  for (let index = 1; index < expression.length; index += 2) {
    const operator = expression[index].value;
    const nextValue = mapInventoryCalculationValue(row, customFields, expression[index + 1].value);
    if (operator === '*' || operator === '/') {
      const previousValue = values.pop();
      values.push(operator === '/' && nextValue === 0 ? 0 : operator === '*' ? previousValue * nextValue : previousValue / nextValue);
    } else {
      lowPrecedenceOperators.push(operator);
      values.push(nextValue);
    }
  }
  let result = values[0] || 0;
  lowPrecedenceOperators.forEach((operator, index) => {
    const nextValue = values[index + 1] || 0;
    result = operator === '+' ? result + nextValue : result - nextValue;
  });
  return Number.isFinite(result) ? result.toFixed(2) : '0.00';
};

const formatInventoryDuration = (value) => {
  const totalSeconds = Math.floor(Math.abs(Number(value || 0)) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${Number(value || 0) < 0 ? '-' : ''}${days}天${hours}时${minutes}分${seconds}秒`;
};

const evaluateInventoryTimeCalculation = (row, customFields, expression) => {
  if (!expression.length) return '';
  const timeValues = expression
    .filter((token) => token.type === 'column')
    .map((token) => mapInventoryTimeValue(row, customFields, token.value));
  if (timeValues.some((value) => !Number.isFinite(value) || value <= 0)) return '';
  let valueIndex = 1;
  let result = timeValues[0];
  for (let index = 1; index < expression.length; index += 2) {
    const nextValue = timeValues[valueIndex];
    valueIndex += 1;
    result = expression[index].value === '+' ? result + nextValue : result - nextValue;
  }
  return formatInventoryDuration(result);
};

const mapInventoryTimeValue = (row, customFields, key) => {
  const value = Object.prototype.hasOwnProperty.call(row, key) ? row[key] : customFields[key];
  return parseInventoryTimeNode(value);
};

const applyInventoryCalculationRules = async (rows) => {
  const rules = await getInventoryCalculationRules();
  if (!rules.length) {
    return rows;
  }

  return rows.map((row) => {
    const calculatedRow = { ...row };
    const customFields = { ...safeParseJsonObject(row.custom_fields, {}) };
    rules.forEach((rule) => {
      const value = rule.calculationType === 'time'
        ? evaluateInventoryTimeCalculation(calculatedRow, customFields, rule.expression)
        : evaluateInventoryCalculation(calculatedRow, customFields, rule.expression);
      if (Object.prototype.hasOwnProperty.call(calculatedRow, rule.targetColumnKey)) {
        calculatedRow[rule.targetColumnKey] = value;
      } else if (INVENTORY_CUSTOM_COLUMN_KEY_PATTERN.test(rule.targetColumnKey)) {
        customFields[rule.targetColumnKey] = value;
      }
    });
    calculatedRow.custom_fields = JSON.stringify(customFields);
    return calculatedRow;
  });
};

const listAdminInventoryCalculations = async () => {
  const rules = await getInventoryCalculationRules();
  const [columns] = await getPool().execute(
    'SELECT column_key, label FROM inventory_management_columns WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC'
  );
  const columnLabels = new Map(columns.map((column) => [String(column.column_key), String(column.label || column.column_key)]));
  return rules.map((rule) => ({
    ...rule,
    expression: rule.expression.map((token) => ({
      ...token,
      label: token.type === 'column' ? (columnLabels.get(token.value) || token.value) : token.value,
    })),
  }));
};

const upsertAdminInventoryCalculation = async (payload = {}) => {
  const targetColumnKey = String(payload.targetColumnKey || '').trim();
  const calculationType = normalizeInventoryCalculationType(payload.calculationType ?? payload.calculation_type);
  const expression = normalizeInventoryCalculationExpression(payload.expression, calculationType);
  if (!INVENTORY_CALCULATION_KEY_PATTERN.test(targetColumnKey) || !expression.length) {
    throw new Error('计算目标列和计算公式不能为空');
  }

  const columnKeys = Array.from(new Set([
    targetColumnKey,
    ...expression.filter((token) => token.type === 'column').map((token) => token.value),
  ]));
  const placeholders = columnKeys.map(() => '?').join(', ');
  const [columns] = await getPool().execute(
    `SELECT column_key, field_type FROM inventory_management_columns WHERE column_key IN (${placeholders}) AND is_visible = 1`,
    columnKeys
  );
  const validColumns = new Set(columns.map((column) => String(column.column_key)));
  const columnTypes = new Map(columns.map((column) => [String(column.column_key), normalizeInventoryColumnFieldType(column.field_type)]));
  if (!validColumns.has(targetColumnKey) || expression.some((token) => token.type === 'column' && !validColumns.has(token.value))) {
    throw new Error('计算公式包含不存在的列');
  }
  if (calculationType === 'time') {
    if (columnTypes.get(targetColumnKey) === 'time') {
      throw new Error('时间和差结果请写入文本列');
    }
    if (expression.some((token) => token.type === 'column' && columnTypes.get(token.value) !== 'time')) {
      throw new Error('时间计算公式只能选择时间节点');
    }
  } else if (expression.some((token) => token.type === 'column' && columnTypes.get(token.value) !== 'text')) {
    throw new Error('常规计算公式只能选择文本数值列');
  }

  const now = Date.now();
  await getPool().execute(
    `
      INSERT INTO inventory_management_calculations (target_column_key, expression_json, calculation_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE expression_json = VALUES(expression_json), calculation_type = VALUES(calculation_type), updated_at = VALUES(updated_at)
    `,
    [targetColumnKey, JSON.stringify(expression), calculationType, now, now]
  );
  const rules = await listAdminInventoryCalculations();
  return rules.find((rule) => rule.targetColumnKey === targetColumnKey) || null;
};

const deleteAdminInventoryCalculation = async (targetColumnKey) => {
  const [result] = await getPool().execute(
    'DELETE FROM inventory_management_calculations WHERE target_column_key = ?',
    [String(targetColumnKey || '').trim()]
  );
  return Number(result.affectedRows || 0) > 0;
};

// 将上线前已配置的“卖出时间 - 创建时间”规则平滑迁移为时间节点计算。
const migrateLegacyInventoryTimeCalculations = async () => {
  const now = Date.now();
  await getPool().execute(
    `UPDATE inventory_management_columns
     SET field_type = 'time', select_options = '[]', updated_at = ?
     WHERE column_key = 'created_time_text' OR label = '卖出时间'`,
    [now]
  );

  const [columnRows] = await getPool().execute(
    'SELECT column_key, field_type FROM inventory_management_columns WHERE is_visible = 1'
  );
  const columnTypes = new Map(columnRows.map((column) => [
    String(column.column_key || ''),
    normalizeInventoryColumnFieldType(column.field_type),
  ]));
  const [ruleRows] = await getPool().execute(
    "SELECT id, target_column_key, expression_json FROM inventory_management_calculations WHERE calculation_type = 'number'"
  );

  for (const rule of ruleRows) {
    const expression = parseInventoryCalculationExpression(rule.expression_json, 'number');
    const sourceKeys = expression.filter((token) => token.type === 'column').map((token) => token.value);
    const onlyTimeOperators = expression
      .filter((token) => token.type === 'operator')
      .every((token) => INVENTORY_TIME_CALCULATION_OPERATORS.has(token.value));
    const usesOnlyTimeNodes = sourceKeys.length >= 2 && sourceKeys.every((key) => columnTypes.get(key) === 'time');
    const targetIsText = columnTypes.get(String(rule.target_column_key || '')) === 'text';
    if (!onlyTimeOperators || !usesOnlyTimeNodes || !targetIsText) continue;
    await getPool().execute(
      "UPDATE inventory_management_calculations SET calculation_type = 'time', updated_at = ? WHERE id = ?",
      [now, rule.id]
    );
  }
};

const initializeInventoryCalculations = async () => {
  const [[existingRule]] = await getPool().execute(
    'SELECT id FROM inventory_management_calculations WHERE target_column_key = ? LIMIT 1',
    ['profit']
  );
  if (existingRule) {
    return;
  }
  await upsertAdminInventoryCalculation({
    targetColumnKey: 'profit',
    expression: [
      { type: 'column', value: 'final_sale_price' },
      { type: 'operator', value: '-' },
      { type: 'column', value: 'sale_freight' },
      { type: 'operator', value: '-' },
      { type: 'column', value: 'recycle_freight' },
      { type: 'operator', value: '-' },
      { type: 'column', value: 'platform_fee' },
    ],
  });
};

const listAdminInventoryManagement = async ({ page = 1, keyword = '', limit = 10, staffId = 0 } = {}) => {
  const currentPage = Math.max(1, Math.floor(Number(page || 1)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(limit || 10))));
  const offset = (currentPage - 1) * pageSize;
  const normalizedKeyword = normalizeInventoryText(keyword);
  const filters = ['1 = 1'];
  const params = [];

  if (normalizedKeyword) {
    filters.push(`(${INVENTORY_TEXT_FIELDS.map((field) => `${field} LIKE ?`).join(' OR ')} OR custom_fields LIKE ?)`);
    params.push(...Array(INVENTORY_TEXT_FIELDS.length + 1).fill(`%${normalizedKeyword}%`));
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().execute(
    `SELECT COUNT(1) AS totalCount FROM inventory_management WHERE ${whereSql}`,
    params
  );
  const [rows] = await getPool().execute(
    `SELECT * FROM inventory_management WHERE ${whereSql} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  const calculatedRows = await applyInventoryCalculationRules(rows);
  const visibleColumnKeys = await getInventoryVisibleColumnKeys(staffId);
  const imageColumnKeys = await getInventoryImageColumnKeys();
  return {
    totalCount: Number(countRow.totalCount || 0),
    list: calculatedRows.map((row) => mapInventoryManagementRow(row, visibleColumnKeys, imageColumnKeys)),
  };
};

// 用途：生成库存管理真正的 XLSX 文件，并按当前用户可见列导出搜索结果。
const escapeInventoryXlsxXml = (value) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const inventoryXlsxColumnName = (index) => {
  let value = Math.max(0, Number(index) || 0);
  let name = '';
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
};

const formatInventoryExportValue = (value) => {
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
};

const buildInventoryXlsxBuffer = (headers, rows) => {
  const sheetRows = [headers, ...rows].map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${inventoryXlsxColumnName(columnIndex)}${rowIndex + 1}`;
      const text = escapeInventoryXlsxXml(formatInventoryExportValue(value));
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="库存数据" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="等线"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const coreProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>库存数据</dc:title><dc:creator>夏木电商平台</dc:creator></cp:coreProperties>`;
  const appProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>夏木电商平台</Application></Properties>`;
  const files = [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRelationships],
    ['docProps/core.xml', coreProperties],
    ['docProps/app.xml', appProperties],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', workbookRelationships],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', worksheet],
  ];
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    return crc >>> 0;
  });
  const crc32 = (buffer) => {
    let crc = 0xFFFFFFFF;
    for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(([fileName, content]) => {
    const name = Buffer.from(fileName, 'utf8');
    const uncompressed = Buffer.from(content, 'utf8');
    const compressed = zlib.deflateRawSync(uncompressed);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(uncompressed), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(uncompressed.length, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    localParts.push(header, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(uncompressed), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += header.length + compressed.length;
  });
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const getInventoryExportMatrix = async ({ keyword = '', staffId = 0 } = {}) => {
  const columns = await listAdminInventoryColumns({ staffId });
  const normalizedKeyword = normalizeInventoryText(keyword);
  const filters = ['1 = 1'];
  const params = [];
  if (normalizedKeyword) {
    filters.push(`(${INVENTORY_TEXT_FIELDS.map((field) => `${field} LIKE ?`).join(' OR ')} OR custom_fields LIKE ?)`);
    params.push(...Array(INVENTORY_TEXT_FIELDS.length + 1).fill(`%${normalizedKeyword}%`));
  }
  const [rows] = await getPool().execute(
    `SELECT * FROM inventory_management WHERE ${filters.join(' AND ')} ORDER BY id DESC`,
    params
  );
  const calculatedRows = await applyInventoryCalculationRules(rows);
  const visibleColumnKeys = new Set(columns.map((column) => column.key));
  const imageColumnKeys = await getInventoryImageColumnKeys();
  const mappedRows = calculatedRows.map((row) => mapInventoryManagementRow(row, visibleColumnKeys, imageColumnKeys));
  const headers = columns.map((column) => column.label);
  const values = mappedRows.map((row) => columns.map((column) => {
    const imageValue = row[getInventoryImageValueKey(column.key)];
    return imageValue?.length ? imageValue.join('\n') : row[column.key];
  }));
  return { headers, values };
};

const buildInventoryCsvBuffer = (headers, rows) => {
  const csvRows = [headers, ...rows].map((row) => row
    .map((value) => `"${formatInventoryExportValue(value).replace(/"/g, '""')}"`)
    .join(','));
  return Buffer.from(`\uFEFF${csvRows.join('\r\n')}`, 'utf8');
};

const exportAdminInventoryManagement = async ({ keyword = '', staffId = 0, format = 'xlsx' } = {}) => {
  const { headers, values } = await getInventoryExportMatrix({ keyword, staffId });
  return String(format).toLowerCase() === 'csv'
    ? buildInventoryCsvBuffer(headers, values)
    : buildInventoryXlsxBuffer(headers, values);
};

const createAdminInventoryManagement = async (payload = {}, staffId = 0) => {
  const now = Date.now();
  const calculationTargets = new Set((await getInventoryCalculationRules()).map((rule) => rule.targetColumnKey));
  const imageColumnKeys = await getInventoryImageColumnKeys();
  const timeColumnKeys = await getInventoryTimeColumnKeys();
  const customFields = Object.fromEntries(
    Object.entries(getInventoryCustomFields(payload, imageColumnKeys, timeColumnKeys)).filter(([key]) => !calculationTargets.has(key))
  );
  const connection = await getPool().getConnection();
  let createdRow = null;
  try {
    await connection.beginTransaction();
    const requestedInventoryNumber = calculationTargets.has('inventory_number')
      ? ''
      : normalizeInventoryText(payload.inventory_number);
    const inventoryNumber = requestedInventoryNumber || await createNextInventoryNumber(
      connection,
      now,
      normalizeInventoryText(payload.last_displayed_inventory_number)
    );
    if (requestedInventoryNumber) {
      await advanceInventoryNumberSequence(connection, requestedInventoryNumber);
    }
    const values = INVENTORY_TEXT_FIELDS.map((field) => {
      if (field === 'inventory_number') {
        return inventoryNumber;
      }
      if (field === 'created_time_text') {
        return formatInventoryTimeNode(now);
      }
      return calculationTargets.has(field)
        ? ''
        : timeColumnKeys.has(field)
          ? normalizeInventoryTimeNode(payload[field])
          : normalizeInventoryText(payload[field]);
    });
    const [result] = await connection.execute(
      `INSERT INTO inventory_management (${INVENTORY_TEXT_FIELDS.join(', ')}, custom_fields, created_at, updated_at)
       VALUES (${INVENTORY_TEXT_FIELDS.map(() => '?').join(', ')}, ?, ?, ?)`,
      [...values, JSON.stringify(customFields), now, now]
    );
    const [rows] = await connection.execute('SELECT * FROM inventory_management WHERE id = ? LIMIT 1', [result.insertId]);
    createdRow = rows[0] || null;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const calculatedRows = await applyInventoryCalculationRules(createdRow ? [createdRow] : []);
  const visibleColumnKeys = await getInventoryVisibleColumnKeys(staffId);
  return mapInventoryManagementRow(calculatedRows[0] || {}, visibleColumnKeys, imageColumnKeys);
};

const updateAdminInventoryManagement = async (id, payload = {}, staffId = 0) => {
  const inventoryId = Number(id || 0);
  if (!inventoryId) {
    return null;
  }

  const calculationTargets = new Set((await getInventoryCalculationRules()).map((rule) => rule.targetColumnKey));
  const imageColumnKeys = await getInventoryImageColumnKeys();
  const timeColumnKeys = await getInventoryTimeColumnKeys();
  const inventoryAccess = staffId ? await getInventoryColumnAccess(staffId) : null;
  const editableColumnKeys = inventoryAccess?.editableColumnKeys || null;
  const canEditInventoryField = (key) => {
    if (!editableColumnKeys) return true;
    const normalizedKey = String(key || '');
    const baseKey = normalizedKey.endsWith(INVENTORY_IMAGE_VALUE_SUFFIX)
      ? normalizedKey.slice(0, -INVENTORY_IMAGE_VALUE_SUFFIX.length)
      : normalizedKey;
    return editableColumnKeys.has(baseKey);
  };
  const updates = INVENTORY_TEXT_FIELDS
    .filter((field) => !calculationTargets.has(field) && canEditInventoryField(field) && Object.prototype.hasOwnProperty.call(payload, field))
    .map((field) => [field, timeColumnKeys.has(field) ? normalizeInventoryTimeNode(payload[field]) : normalizeInventoryText(payload[field])]);
  const customFieldUpdates = Object.fromEntries(
    Object.entries(getInventoryCustomFields(payload, imageColumnKeys, timeColumnKeys))
      .filter(([key]) => !calculationTargets.has(key) && canEditInventoryField(key))
  );
  if (Object.keys(customFieldUpdates).length) {
    const [rows] = await getPool().execute('SELECT custom_fields FROM inventory_management WHERE id = ? LIMIT 1', [inventoryId]);
    if (!rows.length) return null;
    const existingFields = safeParseJsonObject(rows[0].custom_fields, {});
    const mergedFields = { ...existingFields };
    Object.entries(customFieldUpdates).forEach(([key, value]) => {
      const isImageValue = key.endsWith(INVENTORY_IMAGE_VALUE_SUFFIX);
      const baseKey = isImageValue ? key.slice(0, -INVENTORY_IMAGE_VALUE_SUFFIX.length) : key;
      if (!isImageValue && imageColumnKeys.has(baseKey) && Array.isArray(existingFields[baseKey])) {
        mergedFields[getInventoryImageValueKey(baseKey)] = normalizeInventoryImageUrls(existingFields[baseKey]);
      }
      mergedFields[key] = value;
    });
    updates.push(['custom_fields', JSON.stringify(mergedFields)]);
  }
  if (!updates.length) {
    const [rows] = await getPool().execute('SELECT * FROM inventory_management WHERE id = ? LIMIT 1', [inventoryId]);
    const calculatedRows = await applyInventoryCalculationRules(rows);
    const visibleColumnKeys = await getInventoryVisibleColumnKeys(staffId);
    return calculatedRows[0] ? mapInventoryManagementRow(calculatedRows[0], visibleColumnKeys, imageColumnKeys) : null;
  }

  const now = Date.now();
  const [updateResult] = await getPool().execute(
    `UPDATE inventory_management SET ${updates.map(([field]) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...updates.map(([, value]) => value), now, inventoryId]
  );
  if (Number(updateResult.affectedRows || 0) > 0) {
    const inventoryNumberUpdate = updates.find(([field]) => field === 'inventory_number');
    if (inventoryNumberUpdate) {
      await advanceInventoryNumberSequence(getPool(), inventoryNumberUpdate[1]);
    }
  }
  const [rows] = await getPool().execute('SELECT * FROM inventory_management WHERE id = ? LIMIT 1', [inventoryId]);
  const calculatedRows = await applyInventoryCalculationRules(rows);
  const visibleColumnKeys = await getInventoryVisibleColumnKeys(staffId);
  return calculatedRows[0] ? mapInventoryManagementRow(calculatedRows[0], visibleColumnKeys, imageColumnKeys) : null;
};

const deleteAdminInventoryManagement = async (id) => {
  const inventoryId = Number(id || 0);
  if (!inventoryId) {
    return false;
  }
  const [result] = await getPool().execute('DELETE FROM inventory_management WHERE id = ?', [inventoryId]);
  return Number(result.affectedRows || 0) > 0;
};

const deleteAdminInventoryManagementBatch = async (ids = []) => {
  const normalizedIds = Array.from(new Set(
    (Array.isArray(ids) ? ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)
  ));
  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [result] = await getPool().execute(
    `DELETE FROM inventory_management WHERE id IN (${placeholders})`,
    normalizedIds
  );
  return Number(result.affectedRows || 0);
};

const parseInventoryOrderDate = (value, fallbackTimestamp = 0) => {
  const text = String(value || '').trim();
  const dateMatch = text.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (dateMatch) {
    const timeMatch = text.match(/(?:T|\s|日)\s*(\d{1,2})(?:\s*[:时]\s*(\d{1,2}))?(?:\s*[:分]\s*(\d{1,2}))?/);
    const hour = Math.min(23, Math.max(0, Number(timeMatch?.[1] || 0)));
    const minute = Math.min(59, Math.max(0, Number(timeMatch?.[2] || 0)));
    const second = Math.min(59, Math.max(0, Number(timeMatch?.[3] || 0)));
    const date = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, minute, second);
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (/^\d{10,13}$/.test(text)) {
    const timestamp = Number(text);
    const date = new Date(text.length === 10 ? timestamp * 1000 : timestamp);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = text ? new Date(text.replace(/年|月/g, '-').replace(/日/g, '')) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  const fallback = Number(fallbackTimestamp || 0);
  return fallback > 0 ? new Date(fallback < 100000000000 ? fallback * 1000 : fallback) : null;
};

const formatInventoryDateKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatInventoryMonthKey = (date) => formatInventoryDateKey(date).slice(0, 7);

const getInventoryFinanceStatistics = async (keyword = '', page = 1, limit = 10) => {
  const currentPage = Math.max(1, Math.floor(Number(page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(limit) || 10)));
  const normalizedKeyword = normalizeInventoryText(keyword);
  const params = [];
  let whereSql = '1 = 1';
  if (normalizedKeyword) {
    whereSql = 'inventory_number LIKE ?';
    params.push(`%${normalizedKeyword}%`);
  }
  const [rows] = await getPool().execute(
    `SELECT * FROM inventory_management WHERE ${whereSql} ORDER BY id DESC`,
    params
  );
  const calculatedRows = await applyInventoryCalculationRules(rows);
  const today = new Date();
  const todayKey = formatInventoryDateKey(today);
  const monthKey = formatInventoryMonthKey(today);
  const dailyTotals = new Map();
  const monthlyTotals = new Map();
  const details = [];
  let todayProfit = 0;
  let monthProfit = 0;

  calculatedRows.forEach((row) => {
    const date = parseInventoryOrderDate(row.created_time_text, row.created_at);
    if (!date) return;
    const dateKey = formatInventoryDateKey(date);
    const currentMonthKey = formatInventoryMonthKey(date);
    const profit = parseInventoryMoney(row.profit);
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + profit);
    monthlyTotals.set(currentMonthKey, (monthlyTotals.get(currentMonthKey) || 0) + profit);
    if (dateKey === todayKey) todayProfit += profit;
    if (currentMonthKey === monthKey) monthProfit += profit;
    details.push({
      id: Number(row.id || 0),
      inventoryNumber: String(row.inventory_number || ''),
      orderTime: String(row.created_time_text || '') || date.toLocaleString('zh-CN', { hour12: false }),
      finalSalePrice: String(row.final_sale_price || ''),
      saleFreight: String(row.sale_freight || ''),
      recycleFreight: String(row.recycle_freight || ''),
      platformFee: String(row.platform_fee || ''),
      profit: profit.toFixed(2),
    });
  });

  const toSeries = (map) => Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));

  return {
    todayProfit: Number(todayProfit.toFixed(2)),
    monthProfit: Number(monthProfit.toFixed(2)),
    daily: toSeries(dailyTotals),
    monthly: toSeries(monthlyTotals),
    total: details.length,
    details: details.sort((left, right) => right.id - left.id).slice((currentPage - 1) * pageSize, currentPage * pageSize),
  };
};

// 汇总指定年月的平台费、运费，并按选择年份汇总全年运费。
const getDashboardFeeStatistics = async (year, month) => {
  const currentDate = new Date();
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const selectedYear = Number.isInteger(parsedYear) && parsedYear >= 1970 && parsedYear <= 9999
    ? parsedYear
    : currentDate.getFullYear();
  const selectedMonth = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
    ? parsedMonth
    : currentDate.getMonth() + 1;
  const [rows] = await getPool().execute(
    `SELECT recycle_freight, sale_freight, platform_fee, created_time_text, created_at
     FROM inventory_management`
  );
  let monthPlatformFee = 0;
  let monthFreight = 0;
  let yearFreight = 0;

  rows.forEach((row) => {
    const date = parseInventoryOrderDate(row.created_time_text, row.created_at);
    if (!date || date.getFullYear() !== selectedYear) return;
    const freight = parseInventoryMoney(row.recycle_freight) + parseInventoryMoney(row.sale_freight);
    yearFreight += freight;
    if (date.getMonth() + 1 === selectedMonth) {
      monthPlatformFee += parseInventoryMoney(row.platform_fee);
      monthFreight += freight;
    }
  });

  return {
    year: selectedYear,
    month: selectedMonth,
    monthPlatformFee: Number(monthPlatformFee.toFixed(2)),
    monthFreight: Number(monthFreight.toFixed(2)),
    yearFreight: Number(yearFreight.toFixed(2)),
  };
};

const createStaffRegistration = async (payload = {}) => {
  const now = Date.now();
  const rawUsername = String(payload.username || payload.account || '').trim();
  const normalizedUsername = normalizeStaffUsername(rawUsername);
  const name = String(payload.username || payload.account || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  if (!normalizedUsername) {
    throw new Error('请输入用户名');
  }

  if (!/^[\u4e00-\u9fffA-Za-z0-9]+$/.test(name)) {
    throw new Error('用户名仅支持汉字、英文和数字，不能包含空格');
  }
  if (!isValidPhone(phone)) {
    throw new Error('请输入正确的手机号');
  }
  if (email && !isValidEmail(email)) {
    throw new Error('邮箱格式不正确');
  }

  if (password.length < 6) {
    throw new Error('密码长度不能少于 6 位');
  }

  await assertUniqueStaffField('username', normalizedUsername);
  await assertUniqueStaffField('phone', phone);
  await assertUniqueStaffField('email', email);

  const [result] = await getPool().execute(
    `
      INSERT INTO staff (username, name, phone, email, password_hash, avatar, permission, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 0)
    `,
    [
      normalizedUsername,
      name,
      phone,
      email || null,
      hashPassword(password),
      STAFF_PERMISSIONS.VISITOR,
      now,
      now,
    ]
  );

  return getStaffById(result.insertId);
};

const listAdminStaff = async ({ page = 1, keyword = '', limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safeOffset = Math.max(0, Math.floor(offset));
  const filters = ['1 = 1'];
  const params = [];
  const trimmedKeyword = String(keyword || '').trim();

  if (trimmedKeyword) {
    filters.push('(username LIKE ? OR name LIKE ? OR phone LIKE ? OR email LIKE ? OR permission LIKE ?)');
    params.push(`%${trimmedKeyword}%`, `%${trimmedKeyword}%`, `%${trimmedKeyword}%`, `%${trimmedKeyword}%`, `%${trimmedKeyword}%`);
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().execute(
    `SELECT COUNT(1) AS totalCount FROM staff WHERE ${whereSql}`,
    params
  );
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM staff
      WHERE ${whereSql}
      ORDER BY
        CASE permission
          WHEN '${STAFF_PERMISSIONS.SUPERADMIN}' THEN 1
          WHEN '${STAFF_PERMISSIONS.MANAGER}' THEN 2
          WHEN '${STAFF_PERMISSIONS.STAFF}' THEN 3
          ELSE 4
        END ASC,
        id ASC
      LIMIT ${safePageSize} OFFSET ${safeOffset}
    `,
    params
  );

  return {
    totalCount: Number(countRow.totalCount || 0),
    list: rows.map(mapStaffRowToAdmin),
  };
};

const createAdminStaff = async (payload = {}) => {
  const now = Date.now();
  const username = normalizeStaffUsername(payload.username || payload.phone || payload.email || '');
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const avatar = String(payload.avatar || '').trim();
  const password = String(payload.password || '');
  const permission = normalizeStaffPermission(payload.permission, STAFF_PERMISSIONS.VISITOR);
  const accessPaths = permission === STAFF_PERMISSIONS.STAFF
    ? normalizeStaffAccessPaths(payload.accessPaths, [])
    : [];
  const accessRules = permission === STAFF_PERMISSIONS.STAFF
    ? normalizeStaffAccessRules(payload.accessRules, [])
    : [];

  if (!username) {
    throw new Error('请填写登录账号');
  }
  if (password.length < 6) {
    throw new Error('密码长度不能少于 6 位');
  }
  if (phone && !isValidPhone(phone)) {
    throw new Error('手机号格式不正确');
  }
  if (email && !isValidEmail(email)) {
    throw new Error('邮箱格式不正确');
  }

  await assertUniqueStaffField('username', username);
  await assertUniqueStaffField('phone', phone);
  await assertUniqueStaffField('email', email);

  const [result] = await getPool().execute(
    `
      INSERT INTO staff (username, name, phone, email, password_hash, avatar, permission, access_paths, access_rules, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `,
    [username, name, phone, email || null, hashPassword(password), avatar, permission, JSON.stringify(accessPaths), JSON.stringify(accessRules), now, now]
  );

  const createdStaff = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [result.insertId]);
  const rawStaff = createdStaff[0][0] || null;
  if (rawStaff) {
    await replaceStaffPermissions(result.insertId, accessRules);
    await syncSuperadminCredential(rawStaff, rawStaff.password_hash);
  }

  return getStaffById(result.insertId);
};

const updateAdminStaff = async (id, payload = {}, currentAdminId = 0) => {
  const staffId = Number(id || 0);
  if (!staffId) {
    return null;
  }

  if (Number(currentAdminId || 0) === staffId) {
    throw new Error('当前登录账号不可在员工管理中编辑，请前往编辑信息页面处理');
  }

  const [rows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [staffId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const nextPermission = payload.permission !== undefined
    ? normalizeStaffPermission(payload.permission, normalizeStaffPermission(current.permission))
    : normalizeStaffPermission(current.permission);
  const nextAccessPaths = nextPermission === STAFF_PERMISSIONS.STAFF
    ? normalizeStaffAccessPaths(
      payload.accessPaths,
      normalizeStaffAccessPaths(current.access_paths, null)
    )
    : [];
  const nextAccessRules = nextPermission === STAFF_PERMISSIONS.STAFF
    ? normalizeStaffAccessRules(
      payload.accessRules,
      normalizeStaffAccessRules(current.access_rules, null)
    )
    : [];

  if (
    Number(currentAdminId || 0) === staffId
    && normalizeStaffPermission(current.permission) === STAFF_PERMISSIONS.SUPERADMIN
    && nextPermission !== STAFF_PERMISSIONS.SUPERADMIN
  ) {
    throw new Error('超级管理员不能降低自己的权限');
  }

  const nextUsername = payload.username !== undefined
    ? normalizeStaffUsername(payload.username)
    : normalizeStaffUsername(current.username);

  if (normalizeStaffUsername(current.username) === normalizeStaffUsername(DEFAULT_ADMIN_USERNAME) && nextUsername !== normalizeStaffUsername(DEFAULT_ADMIN_USERNAME)) {
    throw new Error('admin 超级管理员账号不可修改');
  }

  const nextPhone = payload.phone !== undefined ? String(payload.phone || '').trim() : String(current.phone || '').trim();
  const nextEmail = payload.email !== undefined ? String(payload.email || '').trim().toLowerCase() : String(current.email || '').trim().toLowerCase();
  const nextName = payload.name !== undefined ? String(payload.name || '').trim() : String(current.name || '').trim();
  const nextAvatar = payload.avatar !== undefined ? String(payload.avatar || '').trim() : String(current.avatar || '').trim();

  if (nextPhone && !isValidPhone(nextPhone)) {
    throw new Error('手机号格式不正确');
  }
  if (nextEmail && !isValidEmail(nextEmail)) {
    throw new Error('邮箱格式不正确');
  }

  await assertUniqueStaffField('username', nextUsername, staffId);
  await assertUniqueStaffField('phone', nextPhone, staffId);
  await assertUniqueStaffField('email', nextEmail, staffId);

  const passwordHash = payload.password ? hashPassword(String(payload.password || '')) : String(current.password_hash || '');

  await getPool().execute(
    `
      UPDATE staff
      SET username = ?, name = ?, phone = ?, email = ?, password_hash = ?, avatar = ?, permission = ?, access_paths = ?, access_rules = ?, updated_at = ?
      WHERE id = ?
    `,
    [nextUsername, nextName, nextPhone, nextEmail || null, passwordHash, nextAvatar, nextPermission, JSON.stringify(nextAccessPaths), JSON.stringify(nextAccessRules), Date.now(), staffId]
  );

  if (nextPermission !== STAFF_PERMISSIONS.STAFF || payload.accessRules !== undefined) {
    await replaceStaffPermissions(staffId, nextAccessRules);
  }

  const [nextRows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [staffId]);
  const nextStaff = nextRows[0] || null;
  if (nextStaff) {
    await syncSuperadminCredential(nextStaff, passwordHash);
  }

  return getStaffById(staffId);
};

const getAdminStaffPermissions = async (id) => {
  const staff = await getStaffById(id);
  if (!staff) {
    return null;
  }
  return {
    id: staff.id,
    account: staff.account,
    name: staff.name,
    permission: staff.permission,
    accessRules: Array.isArray(staff.accessRules) ? staff.accessRules : [],
  };
};

const updateAdminStaffPermissions = async (id, payload = {}, currentAdminId = 0) => {
  const staffId = Number(id || 0);
  if (!staffId) {
    return null;
  }
  if (staffId === Number(currentAdminId || 0)) {
    throw new Error('当前登录账号不可在员工管理中编辑，请前往编辑信息页面处理');
  }

  const [rows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [staffId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  if (normalizeStaffUsername(current.username) === normalizeStaffUsername(DEFAULT_ADMIN_USERNAME)) {
    throw new Error('admin 超级管理员账号不可修改');
  }

  const nextPermission = payload.permission !== undefined
    ? normalizeStaffPermission(payload.permission, normalizeStaffPermission(current.permission))
    : normalizeStaffPermission(current.permission);
  const nextAccessRules = nextPermission === STAFF_PERMISSIONS.STAFF
    ? normalizeStaffAccessRules(payload.accessRules, [])
    : [];
  const nextAccessPaths = Array.from(new Set(toStaffPermissionRecords(nextAccessRules).map((item) => item.modulePath)));
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await replaceStaffPermissions(staffId, nextAccessRules, connection);
    await connection.execute(
      'UPDATE staff SET permission = ?, access_paths = ?, access_rules = ?, updated_at = ? WHERE id = ?',
      [nextPermission, JSON.stringify(nextAccessPaths), JSON.stringify(nextAccessRules), Date.now(), staffId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getAdminStaffPermissions(staffId);
};

const deleteAdminStaff = async (id, currentAdminId = 0) => {
  const staffId = Number(id || 0);
  if (!staffId) {
    return 0;
  }

  const [rows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [staffId]);
  if (!rows.length) {
    return 0;
  }

  const current = rows[0];
  if (Number(currentAdminId || 0) === staffId) {
    throw new Error('不能删除当前登录账号');
  }
  if (normalizeStaffUsername(current.username) === normalizeStaffUsername(DEFAULT_ADMIN_USERNAME)) {
    throw new Error('admin 超级管理员账号不可删除');
  }

  await getPool().execute('DELETE FROM superadmin_key WHERE staff_id = ?', [staffId]);
  await getPool().execute('DELETE FROM staff_permissions WHERE staff_id = ?', [staffId]);
  const [result] = await getPool().execute('DELETE FROM staff WHERE id = ? LIMIT 1', [staffId]);
  return Number(result.affectedRows || 0);
};

const updateAdminPassword = async (id, oldPassword, nextPassword) => {
  const adminId = Number(id || 0);
  if (!adminId) {
    return false;
  }

  const [rows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [adminId]);
  if (!rows.length) {
    return false;
  }

  const current = rows[0];
  const currentPermission = normalizeStaffPermission(current.permission);
  const currentPasswordHash = currentPermission === STAFF_PERMISSIONS.SUPERADMIN
    ? String((await getSuperadminCredentialByStaffId(adminId))?.password_hash || '')
    : String(current.password_hash || '');

  if (currentPasswordHash !== hashPassword(oldPassword)) {
    return false;
  }

  const nextPasswordHash = hashPassword(nextPassword);
  const now = Date.now();
  await getPool().execute('UPDATE staff SET password_hash = ?, updated_at = ? WHERE id = ?', [
    nextPasswordHash,
    now,
    adminId,
  ]);

  if (currentPermission === STAFF_PERMISSIONS.SUPERADMIN) {
    await getPool().execute('UPDATE superadmin_key SET password_hash = ?, updated_at = ? WHERE staff_id = ?', [
      nextPasswordHash,
      now,
      adminId,
    ]);
  }

  return true;
};

// 更新当前管理员资料，并同步登录用户名及超级管理员凭据。
const updateAdminProfile = async (id, payload = {}) => {
  const adminId = Number(id || 0);
  if (!adminId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM staff WHERE id = ? LIMIT 1', [adminId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const username = payload.username !== undefined
    ? normalizeStaffUsername(payload.username)
    : normalizeStaffUsername(current.username);
  const nickname = String(payload.name || payload.nickname || current.name || username || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const avatar = String(payload.avatar || '').trim();
  if (!username) {
    throw new Error('请输入用户名');
  }
  if (!nickname) {
    throw new Error('请输入显示名称');
  }
  if (!phone) {
    throw new Error('请输入手机号');
  }

  if (phone && !isValidPhone(phone)) {
    throw new Error('手机号格式不正确');
  }
  if (email && !isValidEmail(email)) {
    throw new Error('邮箱格式不正确');
  }

  await assertUniqueStaffField('username', username, adminId);
  await assertUniqueStaffField('phone', phone, adminId);
  await assertUniqueStaffField('email', email, adminId);

  await getPool().execute('UPDATE staff SET username = ?, name = ?, phone = ?, email = ?, avatar = ?, updated_at = ? WHERE id = ?', [
    username.slice(0, 128),
    nickname.slice(0, 128),
    phone.slice(0, 32),
    email ? email.slice(0, 128) : null,
    avatar.slice(0, 1024),
    Date.now(),
    adminId,
  ]);

  const updated = await getAdminById(adminId);
  await syncSuperadminCredential({ ...updated, username }, current.password_hash);
  return updated;
};

const getDashboardTutorialStatistics = async () => {
  const [rows] = await getPool().execute(
    `SELECT id, title, view_count, like_count, favorite_count, share_count
     FROM content_pages
     WHERE page_type = ? AND status = 1
     ORDER BY id ASC`,
    [CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );
  return rows.map((row) => ({
    id: Number(row.id || 0),
    title: String(row.title || ''),
    viewCount: Number(row.view_count || 0),
    likeCount: Number(row.like_count || 0),
    favoriteCount: Number(row.favorite_count || 0),
    shareCount: Number(row.share_count || 0),
  }));
};

const getDashboardStatistics1 = async () => {
  const [productResult, orderResult, recycleResult, userResult, finance, tutorialStatistics] = await Promise.all([
    getPool().query(
      `
        SELECT
          COUNT(1) AS total_products,
          SUM(CASE WHEN status = 1 AND is_deleted = 0 THEN 1 ELSE 0 END) AS active_products,
          SUM(CASE WHEN recyclable = 1 AND is_deleted = 0 THEN 1 ELSE 0 END) AS recycle_products,
          SUM(CASE WHEN (stock - reserved_stock) <= min_stock AND is_deleted = 0 THEN 1 ELSE 0 END) AS low_stock_products
        FROM products
      `
    ),
    getPool().query(
      `
        SELECT
          SUM(
            CASE
              WHEN status IN ('paid', 'received', 'finished') OR IFNULL(paid_at, 0) > 0 THEN 1
              ELSE 0
            END
          ) AS paid_orders
        FROM purchase_orders
      `
    ),
    getPool().query('SELECT COUNT(1) AS total_recycle_orders FROM recycle_orders'),
    getPool().query('SELECT COUNT(1) AS total_users FROM users'),
    getInventoryFinanceStatistics(),
    getDashboardTutorialStatistics(),
  ]);

  const productTotals = productResult[0]?.[0] || {};
  const orderTotals = orderResult[0]?.[0] || {};
  const recycleTotals = recycleResult[0]?.[0] || {};
  const userTotals = userResult[0]?.[0] || {};

  return {
    finance: {
      todayProfit: Number(finance.todayProfit || 0),
      monthProfit: Number(finance.monthProfit || 0),
    },
    panels: [
      {
        title: '商品总数',
        value: Number(productTotals.total_products || 0),
        unit: '件',
        unitColor: 'primary',
        subTitle: '在售商品',
        subValue: Number(productTotals.active_products || 0),
        subUnit: '件',
      },
      {
        title: '已支付订单',
        value: Number(orderTotals.paid_orders || 0),
        unit: '单',
        unitColor: 'success',
        showSummary: false,
      },
      {
        title: '回收商品',
        value: Number(productTotals.recycle_products || 0),
        unit: '件',
        unitColor: 'warning',
        subTitle: '回收订单',
        subValue: Number(recycleTotals.total_recycle_orders || 0),
        subUnit: '单',
      },
      {
        title: '用户总数',
        value: Number(userTotals.total_users || 0),
        unit: '人',
        unitColor: 'danger',
        subTitle: '库存预警',
        subValue: Number(productTotals.low_stock_products || 0),
        subUnit: '件',
      },
    ],
    tutorialStatistics,
  };
};

const getDashboardStatistics2 = async () => {
  const [productResult, orderResult, recycleResult] = await Promise.all([
    getPool().query(
      `
        SELECT
          SUM(CASE WHEN status = 1 AND is_deleted = 0 THEN 1 ELSE 0 END) AS saling,
          SUM(CASE WHEN status IN (0, 2, 3) AND is_deleted = 0 THEN 1 ELSE 0 END) AS off,
          SUM(CASE WHEN ischeck = 0 AND is_deleted = 0 THEN 1 ELSE 0 END) AS checking,
          SUM(CASE WHEN (stock - reserved_stock) <= min_stock AND is_deleted = 0 THEN 1 ELSE 0 END) AS min_stock
        FROM products
      `
    ),
    getPool().query(
      `
        SELECT
          SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
          SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS pending_payment,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid
        FROM purchase_orders
      `
    ),
    getPool().query('SELECT COUNT(1) AS recycle_count FROM recycle_orders'),
  ]);

  const productTotals = productResult[0]?.[0] || {};
  const orderTotals = orderResult[0]?.[0] || {};
  const recycleTotals = recycleResult[0]?.[0] || {};

  return {
    goods: [
      { label: '出售中', value: Number(productTotals.saling || 0) },
      { label: '仓库中', value: Number(productTotals.off || 0) },
      { label: '待审核', value: Number(productTotals.checking || 0) },
      { label: '库存预警', value: Number(productTotals.min_stock || 0) },
    ],
    order: [
      { label: '待提交', value: Number(orderTotals.submitted || 0) },
      { label: '待支付', value: Number(orderTotals.pending_payment || 0) },
      { label: '已支付', value: Number(orderTotals.paid || 0) },
      { label: '回收订单', value: Number(recycleTotals.recycle_count || 0) },
    ],
  };
};

// 城市等级按常用城市商业分级维护，地址中的“市”后缀会在统计前统一处理。
const DASHBOARD_CITY_TIER_CITIES = {
  '一线城市': ['北京', '上海', '广州', '深圳'],
  '新一线城市': ['成都', '重庆', '杭州', '武汉', '西安', '苏州', '天津', '南京', '长沙', '郑州', '东莞', '青岛', '昆明', '宁波', '合肥'],
  '二线城市': ['佛山', '济南', '无锡', '福州', '厦门', '哈尔滨', '沈阳', '温州', '石家庄', '大连', '泉州', '南宁', '长春', '南昌', '贵阳', '金华', '常州', '嘉兴', '南通', '惠州', '徐州', '太原', '台州', '烟台', '临沂', '保定', '潍坊', '绍兴', '乌鲁木齐', '扬州'],
  '三线城市': ['洛阳', '威海', '盐城', '湖州', '唐山', '济宁', '邯郸', '泰州', '镇江', '呼和浩特', '淄博', '赣州', '廊坊', '芜湖', '兰州', '桂林', '三亚', '珠海', '宜昌', '遵义', '九江', '湛江', '德州', '岳阳', '泰安', '南阳', '连云港', '沧州', '揭阳', '榆林', '商丘', '绵阳', '漳州', '驻马店', '宜春', '宿迁', '龙岩', '宁德', '汕头', '襄阳', '柳州', '泸州', '常德', '邢台', '菏泽', '晋中', '渭南', '安庆', '上饶', '景德镇', '曲靖', '大理', '丽江', '包头', '赤峰'],
  '四线城市': ['衡阳', '株洲', '湘潭', '郴州', '永州', '怀化', '娄底', '益阳', '张家界', '岳阳', '黄冈', '孝感', '荆州', '荆门', '十堰', '咸宁', '黄石', '鄂州', '随州', '安阳', '新乡', '焦作', '平顶山', '许昌', '开封', '信阳', '周口', '漯河', '鹤壁', '三门峡', '阜阳', '滁州', '蚌埠', '六安', '马鞍山', '宣城', '淮南', '淮北', '铜陵', '宿州', '池州', '安阳', '大同', '运城', '临汾', '长治', '晋城', '吕梁', '忻州', '阳泉', '承德', '秦皇岛', '张家口', '邢台', '衡水', '北海', '钦州', '玉林', '梧州', '百色', '崇左', '河池', '贺州', '来宾', '遵义', '六盘水', '安顺', '毕节', '铜仁', '保山', '昭通', '普洱', '临沧', '玉溪', '楚雄', '红河', '文山', '西双版纳', '德宏', '怒江', '迪庆', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '银川', '石嘴山', '吴忠', '固原', '中卫'],
  '五线城市': ['三明', '南平', '莆田', '衢州', '丽水', '舟山', '黄山', '亳州', '芜湖', '梧州', '防城港', '贵港', '梅州', '潮州', '汕尾', '河源', '清远', '云浮', '韶关', '茂名', '阳江', '鸡西', '双鸭山', '鹤岗', '七台河', '伊春', '佳木斯', '牡丹江', '黑河', '绥化', '白山', '松原', '白城', '辽源', '四平', '通化', '铁岭', '朝阳', '盘锦', '葫芦岛', '本溪', '丹东', '营口', '辽阳', '抚顺', '锦州', '四平', '白城', '延边', '通辽', '乌海', '呼伦贝尔', '兴安', '锡林郭勒', '巴彦淖尔', '乌兰察布', '鄂尔多斯', '阿拉善', '日照', '枣庄', '东营', '滨州', '聊城', '莱芜', '济南', '德州', '安康', '汉中', '商洛', '铜川', '宝鸡', '咸阳', '延安', '榆林', '渭南', '盘锦', '张家口', '承德', '沧州', '保定', '衡水', '秦皇岛', '邯郸', '邢台', '拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里', '海东', '海西', '海北', '黄南', '海南', '果洛', '玉树', '吴忠', '固原', '中卫', '阿克苏', '喀什', '和田', '克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '克孜勒苏', '伊犁', '塔城', '阿勒泰'],
};

const DASHBOARD_CITY_TIER_ORDER = ['一线城市', '新一线城市', '二线城市', '三线城市', '四线城市', '五线城市'];
const DASHBOARD_CITY_TIER_MAP = new Map();
DASHBOARD_CITY_TIER_ORDER.forEach((tier) => {
  (DASHBOARD_CITY_TIER_CITIES[tier] || []).forEach((city) => {
    // 名单有重复时，以靠前的较高城市等级为准。
    if (!DASHBOARD_CITY_TIER_MAP.has(city)) {
      DASHBOARD_CITY_TIER_MAP.set(city, tier);
    }
  });
});

const normalizeDashboardCityName = (city) => String(city || '')
  .trim()
  .replace(/特别行政区$/, '')
  .replace(/市$/, '')
  .replace(/地区$/, '')
  .replace(/盟$/, '')
  .replace(/自治州$/, '');

const getDashboardAddressLocationStatistics = async () => {
  const defaultAddressWhere = "is_default = 1 AND status = 1";
  const [provinceResult, cityResult, totalResult] = await Promise.all([
    getPool().query(
      `
        SELECT TRIM(province) AS name, COUNT(1) AS value
        FROM addresses
        WHERE ${defaultAddressWhere} AND TRIM(province) <> ''
        GROUP BY TRIM(province)
        ORDER BY value DESC, name ASC
      `
    ),
    getPool().query(
      `
        SELECT TRIM(city) AS name, COUNT(1) AS value
        FROM addresses
        WHERE ${defaultAddressWhere} AND TRIM(city) <> ''
        GROUP BY TRIM(city)
      `
    ),
    getPool().query(`SELECT COUNT(1) AS total FROM addresses WHERE ${defaultAddressWhere}`),
  ]);

  const cityTierCounts = new Map(DASHBOARD_CITY_TIER_ORDER.map((tier) => [tier, 0]));
  let unclassifiedCityCount = 0;

  cityResult[0].forEach((row) => {
    const cityTier = DASHBOARD_CITY_TIER_MAP.get(normalizeDashboardCityName(row.name));
    const count = Number(row.value || 0);
    if (cityTier) {
      cityTierCounts.set(cityTier, Number(cityTierCounts.get(cityTier) || 0) + count);
    } else {
      unclassifiedCityCount += count;
    }
  });

  return {
    province: provinceResult[0].map((row) => ({ name: row.name, value: Number(row.value || 0) })),
    cityTier: DASHBOARD_CITY_TIER_ORDER.map((name) => ({ name, value: Number(cityTierCounts.get(name) || 0) })),
    defaultAddressCount: Number(totalResult[0]?.[0]?.total || 0),
    unclassifiedCityCount,
  };
};

const DASHBOARD_HOUR_LABELS = Array.from({ length: 24 }, (_value, hour) => `${String(hour).padStart(2, '0')}时`);
const DASHBOARD_HOUR_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  hourCycle: 'h23',
});

const getDashboardHourLabel = (timestamp) => {
  const numericTimestamp = Number(timestamp || 0);
  if (!numericTimestamp) {
    return '';
  }

  const normalizedTimestamp = numericTimestamp < 100000000000 ? numericTimestamp * 1000 : numericTimestamp;
  const hourPart = DASHBOARD_HOUR_FORMATTER
    .formatToParts(new Date(normalizedTimestamp))
    .find((item) => item.type === 'hour');
  const hour = Number(hourPart?.value || -1);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? `${String(hour).padStart(2, '0')}时` : '';
};

const buildDashboardHourDistribution = (rows, timestampSelector) => {
  const counts = new Map(DASHBOARD_HOUR_LABELS.map((label) => [label, 0]));

  rows.forEach((row) => {
    const label = getDashboardHourLabel(timestampSelector(row));
    if (label) {
      counts.set(label, Number(counts.get(label) || 0) + 1);
    }
  });

  return DASHBOARD_HOUR_LABELS.map((name) => ({ name, value: Number(counts.get(name) || 0) }));
};

const getDashboardOrderTimeStatistics = async () => {
  const [purchaseResult, recycleOrderResult] = await Promise.all([
    getPool().query(
      `
        SELECT paid_at, created_at
        FROM purchase_orders
        WHERE status IN ('paid', 'received', 'finished') OR IFNULL(paid_at, 0) > 0
      `
    ),
    getPool().query(
      `
        SELECT created_at
        FROM recycle_orders
      `
    ),
  ]);

  const purchase = buildDashboardHourDistribution(
    purchaseResult[0],
    (row) => Number(row.paid_at || 0) || Number(row.created_at || 0)
  );
  const recycleOrder = buildDashboardHourDistribution(
    recycleOrderResult[0],
    (row) => Number(row.created_at || 0)
  );
  const modelStatistics = await getDashboardModelStatistics();

  return {
    purchase,
    recycleOrder,
    purchaseCount: purchase.reduce((total, item) => total + Number(item.value || 0), 0),
    recycleOrderCount: recycleOrder.reduce((total, item) => total + Number(item.value || 0), 0),
    purchaseModels: modelStatistics.purchase,
    recycleModels: modelStatistics.recycle,
    purchaseModelCount: modelStatistics.purchase.reduce((total, item) => total + Number(item.value || 0), 0),
    recycleModelCount: modelStatistics.recycle.reduce((total, item) => total + Number(item.value || 0), 0),
  };
};

const buildDashboardModelDistribution = (rows = []) => {
  const counts = new Map();

  rows.forEach((row) => {
    const categoryKey = String(row.category_key || '').trim();
    const categoryName = String(row.category_name || '').trim() || '未分类';
    const modelKey = String(row.model_key || '').trim();
    const modelTitle = String(row.model_title || '').trim();
    const snapshotTitle = String(row.snapshot_title || '').trim();
    const groupingModel = modelKey && modelKey !== 'other' ? modelKey : modelTitle || snapshotTitle;
    const modelName = modelTitle || snapshotTitle || modelKey || '未分类型号';
    const groupingKey = `${categoryKey || categoryName}\u0000${groupingModel || modelName}`;
    const current = counts.get(groupingKey);

    if (current) {
      current.value += Number(row.value || 0);
      return;
    }

    counts.set(groupingKey, {
      name: categoryName,
      value: Number(row.value || 0),
    });
  });

  return Array.from(counts.values())
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
};

const getDashboardModelStatistics = async () => {
  const [purchaseResult, recycleResult] = await Promise.all([
    getPool().query(
      `
        SELECT
          p.category_key,
          c.name AS category_name,
          p.model_key,
          p.title AS model_title,
          po.product_title_snapshot AS snapshot_title,
          COUNT(1) AS value
        FROM purchase_orders po
        LEFT JOIN products p ON p.id = po.product_id
        LEFT JOIN admin_categories c ON c.scene = 'sale' AND c.category_key = p.category_key
        WHERE ${buildPaidPurchaseOrderSql('po')}
        GROUP BY p.category_key, c.name, p.model_key, p.title, po.product_title_snapshot
      `
    ),
    getPool().query(
      `
        SELECT
          ro.category_key,
          c.name AS category_name,
          '' AS model_key,
          ro.title AS model_title,
          '' AS snapshot_title,
          COUNT(1) AS value
        FROM recycle_orders ro
        LEFT JOIN admin_categories c ON c.scene = 'recycle' AND c.category_key = ro.category_key
        WHERE IFNULL(ro.user_status, 'confirmed') <> 'cancelled'
          AND IFNULL(ro.status, '') <> 'user_cancelled'
        GROUP BY ro.category_key, c.name, ro.title
      `
    ),
  ]);

  return {
    purchase: buildDashboardModelDistribution(purchaseResult[0]),
    recycle: buildDashboardModelDistribution(recycleResult[0]),
  };
};

const getDashboardStatistics3 = async (type = 'week') => {
  const now = new Date();
  let totalSlots = 7;
  let formatter = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let startTime = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  let stepMs = 24 * 60 * 60 * 1000;

  if (type === 'hour') {
    totalSlots = 24;
    formatter = (date) => `${String(date.getHours()).padStart(2, '0')}`;
    startTime = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    stepMs = 60 * 60 * 1000;
  } else if (type === 'month') {
    totalSlots = 30;
    formatter = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    startTime = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  }

  const [rows] = await getPool().execute(
    'SELECT created_at FROM purchase_orders WHERE created_at >= ? ORDER BY created_at ASC',
    [startTime.getTime()]
  );

  const labels = [];
  const counts = new Map();
  for (let index = 0; index < totalSlots; index += 1) {
    const current = new Date(startTime.getTime() + index * stepMs);
    const key = formatter(current);
    labels.push(key);
    counts.set(key, 0);
  }

  rows.forEach((row) => {
    const label = formatter(new Date(Number(row.created_at || 0)));
    if (counts.has(label)) {
      counts.set(label, Number(counts.get(label) || 0) + 1);
    }
  });

  return {
    x: labels,
    y: labels.map((item) => Number(counts.get(item) || 0)),
  };
};

const listAdminUserLevels = async ({ page = 1, limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;

  const [[countRow]] = await getPool().query('SELECT COUNT(1) AS totalCount FROM user_levels');
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM user_levels
      ORDER BY level ASC, id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    []
  );

  return {
    list: rows.map(mapAdminUserLevelRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminUserLevel = async (payload = {}) => {
  const now = Date.now();
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('会员等级名称不能为空');
  }

  const [result] = await getPool().execute(
    `
      INSERT INTO user_levels (name, level, discount, max_price, max_times, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      name,
      Math.max(0, Math.trunc(toNumber(payload.level, 0))),
      Math.max(0, toNumber(payload.discount, 100)),
      Math.max(0, toNumber(payload.max_price, 0)),
      Math.max(0, Math.trunc(toNumber(payload.max_times, 0))),
      toBoolean(payload.status, true) ? 1 : 0,
      now,
      now,
    ]
  );

  const [rows] = await getPool().execute('SELECT * FROM user_levels WHERE id = ? LIMIT 1', [result.insertId]);
  return rows.length ? mapAdminUserLevelRow(rows[0]) : null;
};

const updateAdminUserLevel = async (id, payload = {}) => {
  const levelId = Number(id || 0);
  if (!levelId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM user_levels WHERE id = ? LIMIT 1', [levelId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const nextName =
    payload.name !== undefined ? String(payload.name || '').trim() : String(current.name || '').trim();
  if (!nextName) {
    throw new Error('会员等级名称不能为空');
  }

  await getPool().execute(
    `
      UPDATE user_levels
      SET name = ?, level = ?, discount = ?, max_price = ?, max_times = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      nextName,
      payload.level !== undefined ? Math.max(0, Math.trunc(toNumber(payload.level, 0))) : Number(current.level || 0),
      payload.discount !== undefined ? Math.max(0, toNumber(payload.discount, 100)) : Number(current.discount || 0),
      payload.max_price !== undefined ? Math.max(0, toNumber(payload.max_price, 0)) : Number(current.max_price || 0),
      payload.max_times !== undefined
        ? Math.max(0, Math.trunc(toNumber(payload.max_times, 0)))
        : Number(current.max_times || 0),
      payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : Number(current.status || 0),
      Date.now(),
      levelId,
    ]
  );

  const [nextRows] = await getPool().execute('SELECT * FROM user_levels WHERE id = ? LIMIT 1', [levelId]);
  return nextRows.length ? mapAdminUserLevelRow(nextRows[0]) : null;
};

const updateAdminUserLevelStatus = async (id, status) => {
  const levelId = Number(id || 0);
  if (!levelId) {
    return null;
  }

  await getPool().execute('UPDATE user_levels SET status = ?, updated_at = ? WHERE id = ?', [
    toBoolean(status, true) ? 1 : 0,
    Date.now(),
    levelId,
  ]);

  const [rows] = await getPool().execute('SELECT * FROM user_levels WHERE id = ? LIMIT 1', [levelId]);
  return rows.length ? mapAdminUserLevelRow(rows[0]) : null;
};

const deleteAdminUserLevel = async (id) => {
  const levelId = Number(id || 0);
  if (!levelId) {
    return 0;
  }

  const [result] = await getPool().execute('DELETE FROM user_levels WHERE id = ? LIMIT 1', [levelId]);
  return Number(result.affectedRows || 0);
};

const listAdminUsers = async ({ page = 1, keyword = '', limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const filters = ['1 = 1'];
  const params = [];
  const trimmedKeyword = String(keyword || '').trim();
  const supportsUserUid = await hasUserUidColumn();
  const userUidSql = await getUserUidSelectSql('u');

  if (trimmedKeyword) {
    const keywordFilters = ['u.nickname LIKE ?', 'CAST(u.display_id AS CHAR) LIKE ?'];
    const keywordParams = [`%${trimmedKeyword}%`, `%${trimmedKeyword}%`];
    if (supportsUserUid) {
      keywordFilters.splice(1, 0, 'u.uid LIKE ?');
      keywordParams.splice(1, 0, `%${trimmedKeyword}%`);
    }
    filters.push(`(${keywordFilters.join(' OR ')})`);
    params.push(...keywordParams);
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM users u
      WHERE ${whereSql}
    `,
    params
  );

  const [rows] = await getPool().execute(
    `
      SELECT
        u.id,
        u.display_id,
        ${userUidSql} AS uid,
        u.nickname,
        u.username,
        u.avatar_url,
        u.status,
        u.created_at,
        u.last_login_at,
        (
          SELECT a.province
          FROM addresses a
          WHERE a.open_id = u.open_id
            AND a.status = 1
            AND a.is_default = 1
          ORDER BY a.updated_at DESC, a.id DESC
          LIMIT 1
        ) AS province
      FROM users u
      WHERE ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    params
  );

  return {
    list: rows.map(mapMemberRowToAdmin),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const getAdminUserById = async (id) => {
  const userId = Number(id || 0);
  if (!userId) {
    return null;
  }

  const userUidSql = await getUserUidSelectSql('u');

  const [rows] = await getPool().execute(
    `
      SELECT
        u.id,
        u.display_id,
        ${userUidSql} AS uid,
        u.nickname,
        u.username,
        u.avatar_url,
        u.status,
        u.created_at,
        u.last_login_at,
        (
          SELECT a.province
          FROM addresses a
          WHERE a.open_id = u.open_id
            AND a.status = 1
            AND a.is_default = 1
          ORDER BY a.updated_at DESC, a.id DESC
          LIMIT 1
        ) AS province
      FROM users u
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows.length ? mapMemberRowToAdmin(rows[0]) : null;
};

const updateAdminUserStatus = async (id, status) => {
  const userId = Number(id || 0);
  if (!userId) {
    return null;
  }

  await getPool().execute('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [
    toBoolean(status, true) ? 1 : 0,
    Date.now(),
    userId,
  ]);

  return getAdminUserById(userId);
};

const deleteAdminUser = async (id) => {
  const userId = Number(id || 0);
  if (!userId) {
    return 0;
  }

  const [result] = await getPool().execute('DELETE FROM users WHERE id = ? LIMIT 1', [userId]);
  return Number(result.affectedRows || 0);
};

const recordUserActivityEvent = async (user) => {
  const userId = Number(user?.id || 0);
  const openId = String(user?.openId || '').trim();

  if (!userId || !openId) {
    throw new Error('用户登录状态无效');
  }

  const occurredAt = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      'INSERT INTO user_activity_events (user_id, open_id, occurred_at) VALUES (?, ?, ?)',
      [userId, openId, occurredAt]
    );
    await connection.execute('UPDATE users SET last_login_at = ? WHERE id = ? AND open_id = ?', [occurredAt, userId, openId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const recordUserOnlineSession = async (user, startedAt) => {
  const userId = Number(user?.id || 0);
  const openId = String(user?.openId || '').trim();
  if (!userId || !openId) {
    throw new Error('用户登录状态无效');
  }

  const endedAt = Date.now();
  const reportedStartedAt = Number(startedAt || 0);
  const earliestStartedAt = endedAt - 12 * 60 * 60 * 1000;
  const normalizedStartedAt = Math.min(endedAt, Math.max(earliestStartedAt, reportedStartedAt || endedAt));
  const durationSeconds = Math.floor((endedAt - normalizedStartedAt) / 1000);

  if (durationSeconds < 1) {
    return null;
  }

  await getPool().execute(
    `
      INSERT INTO user_online_sessions (user_id, open_id, started_at, ended_at, duration_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [userId, openId, normalizedStartedAt, endedAt, durationSeconds, endedAt]
  );

  return { startedAt: normalizedStartedAt, endedAt, durationSeconds };
};

const DASHBOARD_BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const formatDashboardEngagementBucket = (timestamp, type) => {
  const date = new Date(Number(timestamp || 0) + DASHBOARD_BEIJING_OFFSET_MS);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (type === 'hour') {
    return `${String(date.getUTCHours()).padStart(2, '0')}时`;
  }
  return `${month}-${day}`;
};

const getDashboardEngagementPeriod = (type) => {
  const now = Date.now();
  if (type === 'hour') {
    const currentHour = Math.floor((now + DASHBOARD_BEIJING_OFFSET_MS) / (60 * 60 * 1000)) * 60 * 60 * 1000 - DASHBOARD_BEIJING_OFFSET_MS;
    const startAt = currentHour - 23 * 60 * 60 * 1000;
    return {
      startAt,
      labels: Array.from({ length: 24 }, (_value, index) => formatDashboardEngagementBucket(startAt + index * 60 * 60 * 1000, 'hour')),
    };
  }

  const totalDays = type === 'month' ? 30 : 7;
  const currentDay = Math.floor((now + DASHBOARD_BEIJING_OFFSET_MS) / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000 - DASHBOARD_BEIJING_OFFSET_MS;
  const startAt = currentDay - (totalDays - 1) * 24 * 60 * 60 * 1000;
  return {
    startAt,
    labels: Array.from({ length: totalDays }, (_value, index) => formatDashboardEngagementBucket(startAt + index * 24 * 60 * 60 * 1000, 'day')),
  };
};

const getDashboardUserEngagementStatistics = async (type = 'week') => {
  const normalizedType = ['hour', 'week', 'month'].includes(type) ? type : 'week';
  const { startAt, labels } = getDashboardEngagementPeriod(normalizedType);
  const [newUserResult, loginResult, onlineSessionResult] = await Promise.all([
    getPool().execute('SELECT created_at FROM users WHERE created_at >= ?', [startAt]),
    getPool().execute('SELECT user_id, open_id, occurred_at FROM user_activity_events WHERE occurred_at >= ?', [startAt]),
    getPool().execute(
      'SELECT user_id, open_id, ended_at, duration_seconds FROM user_online_sessions WHERE ended_at >= ?',
      [startAt]
    ),
  ]);

  const newUserCounts = new Map(labels.map((label) => [label, 0]));
  newUserResult[0].forEach((row) => {
    const label = formatDashboardEngagementBucket(row.created_at, normalizedType);
    if (newUserCounts.has(label)) {
      newUserCounts.set(label, Number(newUserCounts.get(label) || 0) + 1);
    }
  });

  const loginUsersByBucket = new Map(labels.map((label) => [label, new Set()]));
  loginResult[0].forEach((row) => {
    const label = formatDashboardEngagementBucket(row.occurred_at, normalizedType);
    const userKey = Number(row.user_id || 0) ? `user:${Number(row.user_id)}` : `open:${String(row.open_id || '').trim()}`;
    if (loginUsersByBucket.has(label) && userKey !== 'open:') {
      loginUsersByBucket.get(label).add(userKey);
    }
  });

  const onlineSecondsByUserBucket = new Map();
  onlineSessionResult[0].forEach((row) => {
    const label = formatDashboardEngagementBucket(row.ended_at, normalizedType);
    const userKey = Number(row.user_id || 0) ? `user:${Number(row.user_id)}` : `open:${String(row.open_id || '').trim()}`;
    if (!labels.includes(label) || userKey === 'open:') {
      return;
    }
    const key = `${label}|${userKey}`;
    onlineSecondsByUserBucket.set(key, Number(onlineSecondsByUserBucket.get(key) || 0) + Math.max(0, Number(row.duration_seconds || 0)));
  });

  const onlineUsersByBucket = new Map(labels.map((label) => [label, 0]));
  onlineSecondsByUserBucket.forEach((seconds, key) => {
    if (seconds < 20 * 60) {
      return;
    }
    const label = key.split('|')[0];
    onlineUsersByBucket.set(label, Number(onlineUsersByBucket.get(label) || 0) + 1);
  });

  return {
    x: labels,
    newUsers: labels.map((label) => Number(newUserCounts.get(label) || 0)),
    loginUsers: labels.map((label) => Number(loginUsersByBucket.get(label)?.size || 0)),
    onlineOverTwentyMinutes: labels.map((label) => Number(onlineUsersByBucket.get(label) || 0)),
  };
};

const getDashboardUserActivityStatistics = async (type = 'week') => {
  const now = new Date();
  let totalSlots = 7;
  let formatter = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let startTime = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  let stepMs = 24 * 60 * 60 * 1000;

  if (type === 'hour') {
    totalSlots = 24;
    formatter = (date) => `${String(date.getHours()).padStart(2, '0')}`;
    startTime = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    stepMs = 60 * 60 * 1000;
  } else if (type === 'month') {
    totalSlots = 30;
    startTime = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  }

  const [rows] = await getPool().execute(
    'SELECT occurred_at FROM user_activity_events WHERE occurred_at >= ? ORDER BY occurred_at ASC',
    [startTime.getTime()]
  );

  const labels = [];
  const counts = new Map();
  for (let index = 0; index < totalSlots; index += 1) {
    const current = new Date(startTime.getTime() + index * stepMs);
    const key = formatter(current);
    labels.push(key);
    counts.set(key, 0);
  }

  rows.forEach((row) => {
    const label = formatter(new Date(Number(row.occurred_at || 0)));
    if (counts.has(label)) {
      counts.set(label, Number(counts.get(label) || 0) + 1);
    }
  });

  return {
    x: labels,
    y: labels.map((item) => Number(counts.get(item) || 0)),
  };
};

const ADMIN_ORDER_STATUS_VALUES = new Set(['nopay', 'noship', 'shiped', 'received', 'finish', 'closed', 'refunding']);
const ADMIN_EDITABLE_ORDER_STATUS_VALUES = new Set(['noship', 'shiped', 'finish', 'closed', 'refunding']);
const isPurchaseOrderPaid = (row) =>
  ['paid', 'received', 'finished'].includes(String(row?.status || '').trim()) || Number(row?.paid_at || 0) > 0;
const buildPaidPurchaseOrderSql = (tableAlias = 'po') =>
  `(${tableAlias}.status IN ('paid', 'received', 'finished') OR IFNULL(${tableAlias}.paid_at, 0) > 0)`;

const buildAdminSavedStatusSql = (status) => `IFNULL(po.admin_order_status, '') = '${String(status || '').trim()}'`;
const buildAdminNoSavedStatusSql = () => "IFNULL(po.admin_order_status, '') = ''";
const buildAdminOrderFallbackStatusSql = (status) => {
  switch (String(status || '').trim()) {
    case 'nopay':
      return "po.payment_method = ''";
    case 'noship':
      return "po.payment_method <> '' AND IFNULL(po.ship_data, '') = '' AND po.closed = 0 AND IFNULL(po.refund_status, 'pending') NOT IN ('applied', 'processing')";
    case 'shiped':
      return "po.payment_method <> '' AND IFNULL(po.ship_data, '') <> '' AND po.closed = 0 AND IFNULL(po.refund_status, 'pending') NOT IN ('applied', 'processing') AND po.ship_status <> 'received' AND po.status NOT IN ('received', 'finished')";
    case 'received':
      return "(po.ship_status = 'received' OR po.status = 'received') AND po.status <> 'finished'";
    case 'finish':
      return "po.status = 'finished'";
    case 'closed':
      return 'po.closed = 1';
    case 'refunding':
      return "po.refund_status IN ('applied', 'processing')";
    default:
      return '';
  }
};

const applyAdminOrderTabFilter = (filters, tab) => {
  const normalizedTab = String(tab || 'all').trim();
  if (normalizedTab === 'all' || !ADMIN_ORDER_STATUS_VALUES.has(normalizedTab)) {
    return;
  }

  const fallbackSql = buildAdminOrderFallbackStatusSql(normalizedTab);
  filters.push(`(${buildAdminSavedStatusSql(normalizedTab)} OR (${buildAdminNoSavedStatusSql()} AND ${fallbackSql}))`);
};

const buildAdminOrderWhere = async ({ tab = 'all', no = '', name = '', phone = '', starttime = '', endtime = '' } = {}) => {
  // The console now shows each paid child order directly, including orders
  // settled through the legacy multi-item payment batch.
  const filters = ['1 = 1', buildPaidPurchaseOrderSql()];
  const params = [];
  const trimmedNo = String(no || '').trim();
  const trimmedName = String(name || '').trim();
  const trimmedPhone = String(phone || '').trim();
  const trimmedStarttime = String(starttime || '').trim();
  const trimmedEndtime = String(endtime || '').trim();
  const supportsUserUid = await hasUserUidColumn();

  applyAdminOrderTabFilter(filters, tab);

  if (trimmedNo) {
    filters.push("(po.order_no LIKE ? OR po.out_trade_no LIKE ? OR CAST(po.id AS CHAR) LIKE ?)");
    params.push(`%${trimmedNo}%`, `%${trimmedNo}%`, `%${trimmedNo}%`);
  }

  if (trimmedName) {
    const nameFilters = [
      'po.recipient_name LIKE ?',
      'a.recipient_name LIKE ?',
      'u.nickname LIKE ?',
      'u.username LIKE ?',
    ];
    const nameParams = [
      `%${trimmedName}%`,
      `%${trimmedName}%`,
      `%${trimmedName}%`,
      `%${trimmedName}%`,
    ];
    if (supportsUserUid) {
      nameFilters.push('u.uid LIKE ?');
      nameParams.push(`%${trimmedName}%`);
    }
    filters.push(`(${nameFilters.join(' OR ')})`);
    params.push(...nameParams);
  }

  if (trimmedPhone) {
    filters.push('(po.recipient_phone LIKE ? OR a.recipient_phone LIKE ?)');
    params.push(`%${trimmedPhone}%`, `%${trimmedPhone}%`);
  }

  if (trimmedStarttime) {
    const startValue = new Date(`${trimmedStarttime}T00:00:00`).getTime();
    if (Number.isFinite(startValue) && startValue > 0) {
      filters.push('po.created_at >= ?');
      params.push(startValue);
    }
  }

  if (trimmedEndtime) {
    const endValue = new Date(`${trimmedEndtime}T23:59:59`).getTime();
    if (Number.isFinite(endValue) && endValue > 0) {
      filters.push('po.created_at <= ?');
      params.push(endValue);
    }
  }

  return {
    whereSql: filters.join(' AND '),
    params,
  };
};

const getAdminOrderBaseSelectSql = async (whereSql, limitSql = '') => {
  const userUidSql = await getUserUidSelectSql('u');

  return `
  SELECT
    po.*,
    COALESCE(NULLIF(TRIM(p.title), ''), po.product_title_snapshot) AS product_title,
    COALESCE(NULLIF(TRIM(p.hero_image), ''), po.product_cover_snapshot) AS product_hero_image,
    COALESCE(NULLIF(TRIM(p.cover_title), ''), po.product_cover_title_snapshot) AS product_cover_title,
    COALESCE(p.price, po.product_price_snapshot) AS product_price,
    u.id AS user_id,
    ${userUidSql} AS user_uid,
    u.nickname AS user_nickname,
    u.username AS user_username,
    u.avatar_url AS user_avatar_url,
    a.recipient_name AS address_recipient_name,
    a.recipient_phone AS address_recipient_phone,
    a.province AS address_province,
    a.city AS address_city,
    a.district AS address_district,
    a.address_detail AS address_detail_full
  FROM purchase_orders po
  LEFT JOIN products p ON p.id = po.product_id
  LEFT JOIN users u ON u.open_id = po.open_id
  LEFT JOIN addresses a ON a.id = po.address_id
  WHERE ${whereSql}
  ORDER BY po.created_at DESC, po.id DESC
  ${limitSql}
`;
};

const mapAdminOrderRow = (row, options = {}) => {
  const shipData = safeParseJsonObject(row.ship_data, null);
  const refundData = safeParseJsonObject(row.refund_data, null);
  const refundRefuse = safeParseJsonObject(row.refund_refuse, null);
  const coverSource = String(row.product_hero_image || '').trim();
  const recipientName = String(row.address_recipient_name || row.recipient_name || '').trim();
  const recipientPhone = String(row.address_recipient_phone || row.recipient_phone || '').trim();
  const addressDetail = String(row.address_detail_full || row.address_detail || '').trim();
  const status = String(row.status || '').trim();
  const displayStatus = getAdminOrderDisplayStatus(row);
  const shipStatus = ['received', 'finish'].includes(displayStatus) || status === 'received'
    ? 'received'
    : String(row.ship_status || 'pending');

  const result = {
    id: Number(row.id || 0),
    no: buildOrderNo(row),
    out_trade_no: String(row.out_trade_no || '').trim(),
    create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
    paid_time: formatRealtimeOrTimestamp(row.paid_at_realtime, row.paid_at),
    payment_status: isPurchaseOrderPaid(row) ? 'paid' : 'pending_payment',
    payment_transaction_id: String(row.payment_transaction_id || '').trim(),
    wechat_order_sync_status: String(row.wechat_order_sync_status || 'pending').trim() || 'pending',
    wechat_order_sync_error: String(row.wechat_order_sync_error || '').trim(),
    wechat_order_synced_at: Number(row.wechat_order_synced_at || 0),
    wechat_service_status: String(row.wechat_service_status || 'unknown').trim() || 'unknown',
    wechat_service_status_error: String(row.wechat_service_status_error || '').trim(),
    wechat_service_status_synced_at: Number(row.wechat_service_status_synced_at || 0),
    product_title_snapshot: String(row.product_title_snapshot || row.product_title || '').trim(),
    total_price: Number(row.total_amount || 0),
    payment_method: String(row.payment_method || '').trim(),
    ship_status: shipStatus,
    order_status: displayStatus,
    closed: Number(row.closed || 0),
    refund_status: String(row.refund_status || 'pending'),
    refund_data: refundData,
    refund_refuse: refundRefuse,
    ship_data: shipData
      ? {
          delivery_type: String(shipData.delivery_type || ''),
          express_company: String(shipData.express_company || ''),
          express_no: String(shipData.express_no || ''),
          express_time: String(shipData.express_time || formatTimestamp(shipData.shipped_at || 0)),
        }
      : null,
    user: {
      id: Number(row.user_id || 0),
      uid: String(row.user_uid || ''),
      username: String(row.user_nickname || row.user_username || `用户${Number(row.user_id || 0)}`),
      avatar: normalizeAvatarUrlForDisplay(row.user_avatar_url || ''),
    },
    address: recipientName || recipientPhone || addressDetail
      ? {
          name: recipientName,
          phone: recipientPhone,
          province: String(row.address_province || ''),
          city: String(row.address_city || ''),
          district: String(row.address_district || ''),
          address: addressDetail,
        }
      : null,
    order_items: [
      {
        id: Number(row.product_id || 0),
        num: 1,
        price: Number(row.total_amount || row.product_price || 0),
        skus_type: 0,
        goods_skus: null,
        goods_item:
          Number(row.product_id || 0) || row.product_title || row.product_cover_title || row.product_code_snapshot
          ? {
              id: Number(row.product_id || 0),
              cover: toWebAssetUrl(coverSource),
              title: String(row.product_title || row.product_cover_title || `商品#${Number(row.product_id || 0)}`),
            }
          : null,
      },
    ],
  };
  if (options.includeInternal) {
    result.open_id = String(row.open_id || '');
  }
  return result;
};

const getAdminOrderDisplayStatus = (row) => {
  const savedStatus = String(row.admin_order_status || '').trim();
  if (savedStatus !== 'nopay' && ADMIN_ORDER_STATUS_VALUES.has(savedStatus)) {
    return savedStatus;
  }
  if (['applied', 'processing'].includes(String(row.refund_status || ''))) return 'refunding';
  if (Number(row.closed || 0) === 1) return 'closed';
  if (!isPurchaseOrderPaid(row)) return 'nopay';
  if (String(row.status || '') === 'finished') return 'finish';
  if (String(row.ship_status || '') === 'received' || String(row.status || '') === 'received') return 'received';
  if (row.ship_data) return 'shiped';
  return 'noship';
};

const parsePaymentBatchOrderIds = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.map((id) => Number(id || 0)).filter((id) => id > 0) : [];
  } catch (_error) {
    return [];
  }
};

const buildAdminPaymentBatchWhere = async ({ tab = 'all', no = '', name = '', phone = '', starttime = '', endtime = '' } = {}) => {
  const filters = [
    '1 = 1',
    "(pb.status = 'paid' OR IFNULL(pb.paid_at, 0) > 0)",
    `EXISTS (SELECT 1 FROM purchase_orders po2 WHERE po2.payment_batch_id = pb.id AND ${await buildBatchPurchaseOrderFilterSql()})`,
  ];
  const params = [];
  const trimmedTab = String(tab || 'all').trim();
  const trimmedNo = String(no || '').trim();
  const trimmedName = String(name || '').trim();
  const trimmedPhone = String(phone || '').trim();
  const trimmedStarttime = String(starttime || '').trim();
  const trimmedEndtime = String(endtime || '').trim();
  const supportsUserUid = await hasUserUidColumn();

  if (trimmedTab === 'nopay') {
    filters.push("pb.status = 'pending_payment'");
  } else if (trimmedTab === 'paid') {
    filters.push("pb.status = 'paid'");
  }

  if (trimmedNo) {
    filters.push('(pb.batch_no LIKE ? OR pb.out_trade_no LIKE ? OR CAST(pb.id AS CHAR) LIKE ?)');
    params.push(`%${trimmedNo}%`, `%${trimmedNo}%`, `%${trimmedNo}%`);
  }

  if (trimmedName) {
    const nameFilters = ['u.nickname LIKE ?', 'u.username LIKE ?'];
    const nameParams = [`%${trimmedName}%`, `%${trimmedName}%`];
    if (supportsUserUid) {
      nameFilters.push('u.uid LIKE ?');
      nameParams.push(`%${trimmedName}%`);
    }
    filters.push(`(${nameFilters.join(' OR ')})`);
    params.push(...nameParams);
  }

  if (trimmedPhone) {
    filters.push('u.phone LIKE ?');
    params.push(`%${trimmedPhone}%`);
  }

  if (trimmedStarttime) {
    const startValue = new Date(`${trimmedStarttime}T00:00:00`).getTime();
    if (Number.isFinite(startValue) && startValue > 0) {
      filters.push('pb.created_at >= ?');
      params.push(startValue);
    }
  }

  if (trimmedEndtime) {
    const endValue = new Date(`${trimmedEndtime}T23:59:59`).getTime();
    if (Number.isFinite(endValue) && endValue > 0) {
      filters.push('pb.created_at <= ?');
      params.push(endValue);
    }
  }

  return {
    whereSql: filters.join(' AND '),
    params,
  };
};

const mapAdminPaymentBatchRow = (row, relatedOrders = []) => ({
  id: Number(row.id || 0),
  no: String(row.batch_no || '').trim(),
  create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
  paid_time: formatRealtimeOrTimestamp(row.paid_at_realtime, row.paid_at),
  total_price: Number(row.total_amount || 0),
  payment_method: 'wechat',
  payment_method_label: '微信支付',
  ship_status: getAdminPaymentBatchShipStatus(relatedOrders),
  order_status: getAdminPaymentBatchOrderStatus(relatedOrders),
  closed: 0,
  refund_status: 'pending',
  refund_data: null,
  refund_refuse: null,
  ship_data: null,
  batch_order_count: relatedOrders.length,
  batch_order_nos: relatedOrders.map((item) => String(item.order_no || '')),
  status: String(row.status || 'pending_payment'),
  out_trade_no: String(row.out_trade_no || ''),
  user: {
    id: Number(row.user_id || 0),
    uid: String(row.user_uid || ''),
    username: String(row.user_nickname || row.user_username || `鐢ㄦ埛${Number(row.user_id || 0)}`),
    avatar: normalizeAvatarUrlForDisplay(row.user_avatar_url || ''),
  },
  order_items: relatedOrders.map((item) => ({
    id: Number(item.product_id || 0),
    num: 1,
    price: Number(item.total_amount || 0),
    skus_type: 0,
    goods_skus: null,
    order_no: String(item.order_no || ''),
    goods_item:
      Number(item.product_id || 0) || item.product_title || item.product_cover_title || item.product_code_snapshot
      ? {
          id: Number(item.product_id || 0),
          cover: toWebAssetUrl(String(item.product_hero_image || '').trim()),
          title: String(item.product_title || item.product_cover_title || `鍟嗗搧#${Number(item.product_id || 0)}`),
        }
      : null,
  })),
  address: null,
});

const listAdminPaymentBatches = async ({
  page = 1,
  limit = 10,
  tab = 'all',
  no = '',
  name = '',
  phone = '',
  starttime = '',
  endtime = '',
} = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const { whereSql, params } = await buildAdminPaymentBatchWhere({ tab, no, name, phone, starttime, endtime });
  const userUidSql = await getUserUidSelectSql('u');

  const [[countRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM payment_batches pb
      LEFT JOIN users u ON u.open_id = pb.open_id
      WHERE ${whereSql}
    `,
    params
  );

  const [rows] = await getPool().execute(
    `
      SELECT
        pb.*,
        u.id AS user_id,
        ${userUidSql} AS user_uid,
        u.nickname AS user_nickname,
        u.username AS user_username,
        u.avatar_url AS user_avatar_url
      FROM payment_batches pb
      LEFT JOIN users u ON u.open_id = pb.open_id
      WHERE ${whereSql}
      ORDER BY pb.created_at DESC, pb.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    params
  );

  const batchOrderMap = new Map();
  const allOrderIds = Array.from(
    new Set(
      rows.flatMap((row) => {
        const orderIds = parsePaymentBatchOrderIds(row.order_ids);
        batchOrderMap.set(Number(row.id || 0), orderIds);
        return orderIds;
      })
    )
  );
  const orderDetailMap = new Map();

  if (allOrderIds.length) {
    const placeholders = allOrderIds.map(() => '?').join(', ');
    const [orderRows] = await getPool().execute(
      `
        SELECT
          po.id,
          po.order_no,
          po.total_amount,
          po.product_id,
          po.product_code_snapshot,
          po.product_price_snapshot,
          po.status,
          po.ship_status,
          po.admin_order_status,
          po.closed,
          po.refund_status,
          po.ship_data,
          COALESCE(NULLIF(TRIM(p.title), ''), po.product_title_snapshot) AS product_title,
          COALESCE(NULLIF(TRIM(p.hero_image), ''), po.product_cover_snapshot) AS product_hero_image,
          COALESCE(NULLIF(TRIM(p.cover_title), ''), po.product_cover_title_snapshot) AS product_cover_title
        FROM purchase_orders po
        LEFT JOIN products p ON p.id = po.product_id
        WHERE po.id IN (${placeholders})
      `,
      allOrderIds
    );

    orderRows.forEach((orderRow) => {
      orderDetailMap.set(Number(orderRow.id || 0), orderRow);
    });
  }

  return {
    list: rows.map((row) =>
      mapAdminPaymentBatchRow(
        row,
        (batchOrderMap.get(Number(row.id || 0)) || []).map((orderId) => orderDetailMap.get(orderId)).filter(Boolean)
      )
    ),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const getAdminOrderById = async (id, options = {}) => {
  const orderId = Number(id || 0);
  if (!orderId) {
    return null;
  }

  const [rows] = await getPool().execute(
    await getAdminOrderBaseSelectSql(`po.id = ? AND ${buildPaidPurchaseOrderSql()}`, 'LIMIT 1'),
    [orderId]
  );
  return rows.length ? mapAdminOrderRow(rows[0], options) : null;
};

const listAdminOrders = async ({
  page = 1,
  limit = 10,
  tab = 'all',
  no = '',
  name = '',
  phone = '',
  starttime = '',
  endtime = '',
} = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const { whereSql, params } = await buildAdminOrderWhere({ tab, no, name, phone, starttime, endtime });

  const [[countRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM purchase_orders po
      LEFT JOIN addresses a ON a.id = po.address_id
      LEFT JOIN users u ON u.open_id = po.open_id
      WHERE ${whereSql}
    `,
    params
  );

  const [rows] = await getPool().execute(
    await getAdminOrderBaseSelectSql(whereSql, `LIMIT ${pageSize} OFFSET ${offset}`),
    params
  );

  return {
    list: rows.map(mapAdminOrderRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const deleteAdminOrders = async (ids = []) => {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((item) => Number(item || 0))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );

  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [result] = await getPool().execute(
    `DELETE FROM purchase_orders WHERE id IN (${placeholders}) AND ${buildPaidPurchaseOrderSql('purchase_orders')}`,
    normalizedIds
  );
  return Number(result.affectedRows || 0);
};

const deleteAdminPaymentBatches = async (ids = []) => {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((item) => Number(item || 0))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [batchRows] = await connection.execute(
      `SELECT id FROM payment_batches
       WHERE id IN (${placeholders}) AND (status = 'paid' OR IFNULL(paid_at, 0) > 0)
       FOR UPDATE`,
      normalizedIds
    );
    const batchIds = batchRows.map((row) => Number(row.id || 0)).filter((id) => id > 0);
    if (!batchIds.length) {
      await connection.commit();
      return 0;
    }

    const batchPlaceholders = batchIds.map(() => '?').join(', ');
    await connection.execute(
      `DELETE FROM purchase_orders
       WHERE payment_batch_id IN (${batchPlaceholders}) AND ${await buildPaidPurchaseOrderSql('purchase_orders')}`,
      batchIds
    );
    const [result] = await connection.execute(
      `DELETE FROM payment_batches WHERE id IN (${batchPlaceholders})`,
      batchIds
    );
    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const shipAdminOrder = async (id, payload = {}) => {
  const orderId = Number(id || 0);
  if (!orderId) {
    return null;
  }

  const deliveryType = String(payload.delivery_type || '').trim();
  if (!['logistics', 'same_city', 'virtual'].includes(deliveryType)) {
    throw new Error('发货方式不能为空或无效');
  }

  const expressCompany = String(payload.express_company || '').trim();
  const expressNo = String(payload.express_no || '').trim();
  if (deliveryType !== 'virtual' && (!expressCompany || !expressNo)) {
    throw new Error('快递公司和快递单号不能为空');
  }

  const now = Date.now();
  const shipPayload = {
    delivery_type: deliveryType,
    express_company: expressCompany,
    express_no: expressNo,
    shipped_at: now,
    express_time: formatTimestamp(now),
  };

  const [result] = await getPool().execute(
    `
      UPDATE purchase_orders
      SET ship_data = ?, ship_status = 'pending', updated_at = ?
      WHERE id = ? AND ${buildPaidPurchaseOrderSql('purchase_orders')}
    `,
    [JSON.stringify(shipPayload), now, orderId]
  );

  if (!Number(result.affectedRows || 0)) {
    return null;
  }

  return getAdminOrderById(orderId);
};

const handleAdminOrderRefund = async (id, payload = {}) => {
  const orderId = Number(id || 0);
  if (!orderId) {
    return null;
  }

  const agree = Number(payload.agree || 0) === 1;
  const now = Date.now();
  const refundRefuse = agree
    ? ''
    : JSON.stringify({
        refund_disagree_reason: String(payload.disagree_reason || '').trim(),
        updated_at: now,
      });

  const [result] = await getPool().execute(
    `
      UPDATE purchase_orders
      SET refund_status = ?, refund_refuse = ?, updated_at = ?
      WHERE id = ? AND ${buildPaidPurchaseOrderSql('purchase_orders')}
    `,
    [agree ? 'success' : 'failed', refundRefuse, now, orderId]
  );

  if (!Number(result.affectedRows || 0)) {
    return null;
  }

  return getAdminOrderById(orderId);
};

const updateAdminOrderStatus = async (id, payload = {}) => {
  const orderId = Number(id || 0);
  const status = String(payload.status || '').trim();
  if (!orderId) {
    return null;
  }
  if (!ADMIN_EDITABLE_ORDER_STATUS_VALUES.has(status)) {
    throw new Error('不支持的订单状态');
  }

  const [result] = await getPool().execute(
    `UPDATE purchase_orders
     SET admin_order_status = ?, updated_at = ?
     WHERE id = ? AND ${buildPaidPurchaseOrderSql('purchase_orders')}`,
    [status, Date.now(), orderId]
  );

  if (!Number(result.affectedRows || 0)) {
    return null;
  }

  return getAdminOrderById(orderId);
};

const updateAdminPaymentBatchStatus = async (id, payload = {}) => {
  const batchId = Number(id || 0);
  const status = String(payload.status || '').trim();
  if (!batchId) {
    return null;
  }
  if (!ADMIN_EDITABLE_ORDER_STATUS_VALUES.has(status)) {
    throw new Error('不支持的订单状态');
  }

  const [batchRows] = await getPool().execute(
    "SELECT id, order_ids FROM payment_batches WHERE id = ? AND (status = 'paid' OR IFNULL(paid_at, 0) > 0) LIMIT 1",
    [batchId]
  );
  if (!batchRows.length) {
    return null;
  }

  const orderIds = parsePaymentBatchOrderIds(batchRows[0].order_ids);
  if (!orderIds.length) {
    return { id: batchId, status, updatedCount: 0 };
  }

  const placeholders = orderIds.map(() => '?').join(', ');
  const [result] = await getPool().execute(
    `UPDATE purchase_orders
     SET admin_order_status = ?, updated_at = ?
     WHERE payment_batch_id = ? AND id IN (${placeholders}) AND ${buildPaidPurchaseOrderSql('purchase_orders')}`,
    [status, Date.now(), batchId, ...orderIds]
  );

  return {
    id: batchId,
    status,
    updatedCount: Number(result.affectedRows || 0),
  };
};

const getAdminOrderShipInfo = async (id) => {
  const order = await getAdminOrderById(id);
  if (!order || !order.ship_data) {
    return {
      status: 1,
      msg: '暂无物流信息',
    };
  }

  return {
    status: 0,
    result: {
      logo: '',
      typename: String(order.ship_data.express_company || ''),
      number: String(order.ship_data.express_no || ''),
      list: order.ship_data.express_time
        ? [
            {
              time: String(order.ship_data.express_time || ''),
              status: '已录入发货信息',
            },
          ]
        : [],
    },
  };
};

const listAdminExpressCompanies = async ({ page = 1, limit = 50 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 50));
  const offset = (currentPage - 1) * pageSize;
  const items = DEFAULT_EXPRESS_COMPANIES.map((name, index) => ({
    id: index + 1,
    name,
    code: `express_${index + 1}`,
  }));

  return {
    list: items.slice(offset, offset + pageSize),
    totalCount: items.length,
  };
};

const mapAdminCommentRow = (row) => ({
  id: Number(row.id || 0),
  rating: Number(row.rating || 5),
  status: Number(row.status === undefined || row.status === null ? 1 : row.status),
  review_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
  user: {
    id: Number(row.user_id || 0),
    username: String(row.user_nickname || row.user_username || `用户${Number(row.user_id || 0)}`),
    avatar: normalizeAvatarUrlForDisplay(row.user_avatar || ''),
  },
  goods_item: Number(row.product_id || 0)
    ? {
        id: Number(row.product_id || 0),
        title: String(row.product_title || `商品#${Number(row.product_id || 0)}`),
        cover: toWebAssetUrl(String(row.product_cover || '').trim()),
      }
    : null,
  review: mergePlainObjects(
    {
      data: '',
      image: [],
    },
    safeParseJsonObject(row.review_data, {})
  ),
  extra: (() => {
    try {
      const parsed = JSON.parse(String(row.extra_data || '[]'));
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => {
        if (typeof item === 'string') {
          return { data: item };
        }
        return {
          data: String(item?.data || ''),
        };
      });
    } catch (_error) {
      return [];
    }
  })(),
});

const listAdminGoodsComments = async ({ page = 1, title = '', limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const filters = ['1 = 1'];
  const params = [];
  const keyword = String(title || '').trim();

  if (keyword) {
    filters.push('(p.title LIKE ? OR u.nickname LIKE ? OR u.username LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM admin_goods_comments gc
      LEFT JOIN products p ON p.id = gc.product_id
      LEFT JOIN users u ON u.id = gc.user_id
      WHERE ${whereSql}
    `,
    params
  );

  const [rows] = await getPool().execute(
    `
      SELECT
        gc.*,
        p.title AS product_title,
        p.hero_image AS product_cover,
        u.nickname AS user_nickname,
        u.username AS user_username,
        u.avatar_url AS user_avatar
      FROM admin_goods_comments gc
      LEFT JOIN products p ON p.id = gc.product_id
      LEFT JOIN users u ON u.id = gc.user_id
      WHERE ${whereSql}
      ORDER BY gc.created_at DESC, gc.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    params
  );

  return {
    list: rows.map(mapAdminCommentRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const getAdminGoodsCommentById = async (id) => {
  const commentId = Number(id || 0);
  if (!commentId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT
        gc.*,
        p.title AS product_title,
        p.hero_image AS product_cover,
        u.nickname AS user_nickname,
        u.username AS user_username,
        u.avatar_url AS user_avatar
      FROM admin_goods_comments gc
      LEFT JOIN products p ON p.id = gc.product_id
      LEFT JOIN users u ON u.id = gc.user_id
      WHERE gc.id = ?
      LIMIT 1
    `,
    [commentId]
  );

  return rows.length ? mapAdminCommentRow(rows[0]) : null;
};

const updateAdminGoodsCommentStatus = async (id, status) => {
  const commentId = Number(id || 0);
  if (!commentId) {
    return null;
  }

  await getPool().execute('UPDATE admin_goods_comments SET status = ?, updated_at = ? WHERE id = ?', [
    toBoolean(status, true) ? 1 : 0,
    Date.now(),
    commentId,
  ]);
  return getAdminGoodsCommentById(commentId);
};

const reviewAdminGoodsComment = async (id, data) => {
  const commentId = Number(id || 0);
  if (!commentId) {
    return null;
  }

  const replyText = String(data || '').trim();
  const payload = replyText ? [{ data: replyText }] : [];
  await getPool().execute('UPDATE admin_goods_comments SET extra_data = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(payload),
    Date.now(),
    commentId,
  ]);
  return getAdminGoodsCommentById(commentId);
};

const normalizeNoticeImages = (value) => normalizeContentPageCoverImages(value).slice(0, 9);

const mapAdminNoticeRow = (row) => {
  const images = normalizeNoticeImages(row.image_urls);

  return {
    id: Number(row.id || 0),
    title: String(row.title || ''),
    content: String(row.content || ''),
    images,
    image_urls: images,
    create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
    update_time: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
  };
};

const listAdminNotices = async ({ page = 1, limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const [[countRow]] = await getPool().query('SELECT COUNT(1) AS totalCount FROM admin_notices');
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM admin_notices
      ORDER BY created_at DESC, id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `
  );

  return {
    list: rows.map(mapAdminNoticeRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminNotice = async (payload = {}) => {
  const now = Date.now();
  const title = String(payload.title || '').trim();
  const content = String(payload.content || '').trim();
  const images = normalizeNoticeImages(payload.images ?? payload.image_urls ?? payload.imageUrls ?? []);
  if (!title) {
    throw new Error('公告标题不能为空');
  }

  const [result] = await getPool().execute(
    'INSERT INTO admin_notices (title, content, image_urls, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [title, content, JSON.stringify(images), now, now]
  );
  const [rows] = await getPool().execute('SELECT * FROM admin_notices WHERE id = ? LIMIT 1', [result.insertId]);
  return rows.length ? mapAdminNoticeRow(rows[0]) : null;
};

const updateAdminNotice = async (id, payload = {}) => {
  const noticeId = Number(id || 0);
  if (!noticeId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_notices WHERE id = ? LIMIT 1', [noticeId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const title = payload.title !== undefined ? String(payload.title || '').trim() : String(current.title || '').trim();
  const images = payload.images !== undefined || payload.image_urls !== undefined || payload.imageUrls !== undefined
    ? normalizeNoticeImages(payload.images ?? payload.image_urls ?? payload.imageUrls ?? [])
    : normalizeNoticeImages(current.image_urls);
  if (!title) {
    throw new Error('公告标题不能为空');
  }

  await getPool().execute('UPDATE admin_notices SET title = ?, content = ?, image_urls = ?, updated_at = ? WHERE id = ?', [
    title,
    payload.content !== undefined ? String(payload.content || '') : String(current.content || ''),
    JSON.stringify(images),
    Date.now(),
    noticeId,
  ]);
  const [nextRows] = await getPool().execute('SELECT * FROM admin_notices WHERE id = ? LIMIT 1', [noticeId]);
  return nextRows.length ? mapAdminNoticeRow(nextRows[0]) : null;
};

const deleteAdminNotice = async (id) => {
  const noticeId = Number(id || 0);
  if (!noticeId) {
    return 0;
  }

  const [result] = await getPool().execute('DELETE FROM admin_notices WHERE id = ? LIMIT 1', [noticeId]);
  return Number(result.affectedRows || 0);
};

const getPrimaryHomepageBannerRow = async () => {
  const [rows] = await getPool().execute(
    `
      SELECT
        hb.id,
        hb.page_id,
        hb.sort_order
      FROM homepage_banners hb
      WHERE hb.page_id = 1
      ORDER BY hb.sort_order ASC, hb.id DESC
      LIMIT 1
    `
  );

  return rows.length ? rows[0] : null;
};

const listPublicNotices = async () => {
  const [rows] = await getPool().query(
    'SELECT * FROM admin_notices ORDER BY created_at DESC, id DESC LIMIT 100'
  );
  return rows.map(mapAdminNoticeRow);
};

const getPublicNoticeById = async (id) => {
  const noticeId = Number(id || 0);
  if (!noticeId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_notices WHERE id = ? LIMIT 1', [noticeId]);
  return rows.length ? mapAdminNoticeRow(rows[0]) : null;
};

const isPrimaryHomepageBannerId = async (bannerId) => {
  const primaryBanner = await getPrimaryHomepageBannerRow();
  return Number(primaryBanner?.id || 0) === Number(bannerId || 0);
};

const mapAdminHomepageBannerRow = (row) => {
  const coverImages = normalizeContentPageCoverImages(row.cover_image || row.image_url || '');
  const targetPageId = Number(row.target_page_id || 0);
  const targetPageTitle = String(row.target_page_title || '').trim();
  const isTutorialLink = Number(row.is_tutorial_link || 0) === 1 || targetPageId > 0;
  const linkedTargetPageId = isTutorialLink ? targetPageId : 0;
  const contentEnabled = Number(row.content_enabled === undefined || row.content_enabled === null ? 1 : row.content_enabled) === 1;
  const hideTitle = Number(row.hide_title || 0) === 1;

  return {
    id: Number(row.id || 0),
    image: String(row.image_url || ''),
    page_id: Number(row.page_id || 0),
    target_page_id: linkedTargetPageId,
    targetPageId: linkedTargetPageId,
    is_tutorial_link: isTutorialLink ? 1 : 0,
    isTutorialLink,
    content_enabled: contentEnabled ? 1 : 0,
    contentEnabled,
    hide_title: hideTitle ? 1 : 0,
    hideTitle,
    page_title: String(row.page_title || ''),
    target_page_title: isTutorialLink ? targetPageTitle : '',
    targetPageTitle: isTutorialLink ? targetPageTitle : '',
    display_title: isTutorialLink ? targetPageTitle || String(row.page_title || '') : String(row.page_title || ''),
    displayTitle: isTutorialLink ? targetPageTitle || String(row.page_title || '') : String(row.page_title || ''),
    cover_image: String(coverImages[0] || row.image_url || ''),
    cover_images: coverImages,
    coverImage: String(coverImages[0] || row.image_url || ''),
    coverImages: coverImages,
    content: String(row.content_html || ''),
    order: Number(row.sort_order || 50),
    status: Number(row.status === undefined || row.status === null ? 1 : row.status),
    create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
    update_time: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
  };
};

const ensureHomepageBannerTargetTutorialArticle = async (targetPageId) => {
  const normalizedTargetPageId = normalizeOptionalPositiveId(targetPageId);
  if (!normalizedTargetPageId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT id, page_type
      FROM content_pages
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedTargetPageId]
  );

  if (!rows.length) {
    throw new Error('关联教程不存在');
  }

  if (String(rows[0].page_type || '').trim() !== CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE) {
    throw new Error('关联内容必须是教程文章');
  }

  return rows[0];
};

const normalizeHomepageBannerPayload = async (payload = {}, current = null) => {
  const currentImage = String(current?.image_url || '').trim();
  const currentCoverImages = normalizeContentPageCoverImages(current?.cover_image || current?.image_url || '');
  const currentPageTitle = String(current?.page_title || '').trim();
  const currentContent = String(current?.content_html || '');
  const currentTargetPageId = normalizeOptionalPositiveId(current?.target_page_id);
  const currentIsTutorialLink = current?.is_tutorial_link === undefined
    ? currentTargetPageId > 0
    : toBoolean(current.is_tutorial_link, currentTargetPageId > 0);
  const currentHideTitle = toBoolean(current?.hide_title, false);
  const currentContentEnabled = current?.content_enabled === undefined || current?.content_enabled === null
    ? true
    : toBoolean(current.content_enabled, true);

  const image = payload.image !== undefined ? String(payload.image || '').trim() : currentImage;
  const coverImagesSource = payload.cover_images !== undefined ? payload.cover_images : payload.cover_image;
  const coverImages = coverImagesSource !== undefined
    ? normalizeContentPageCoverImages(coverImagesSource)
    : currentCoverImages;
  const pageTitle = payload.page_title !== undefined ? String(payload.page_title || '').trim() : currentPageTitle;
  const content = payload.content !== undefined ? String(payload.content || '') : currentContent;
  const hasTargetPageIdPayload = payload.targetPageId !== undefined || payload.target_page_id !== undefined;
  const targetPageIdRaw = payload.targetPageId !== undefined
    ? payload.targetPageId
    : (payload.target_page_id !== undefined ? payload.target_page_id : currentTargetPageId);
  const requestedTargetPageId = normalizeOptionalPositiveId(targetPageIdRaw);
  const hasTutorialLinkFlag = payload.isTutorialLink !== undefined || payload.is_tutorial_link !== undefined;
  const isTutorialLinkRaw = payload.isTutorialLink !== undefined
    ? payload.isTutorialLink
    : (payload.is_tutorial_link !== undefined ? payload.is_tutorial_link : currentIsTutorialLink);
  const isTutorialLink = hasTargetPageIdPayload && requestedTargetPageId
    ? true
    : (hasTutorialLinkFlag ? toBoolean(isTutorialLinkRaw, false) : currentIsTutorialLink);
  const targetPageId = isTutorialLink ? requestedTargetPageId : null;
  const hideTitleRaw = payload.hideTitle !== undefined
    ? payload.hideTitle
    : (payload.hide_title !== undefined ? payload.hide_title : currentHideTitle);
  const hideTitle = toBoolean(hideTitleRaw, currentHideTitle);
  const contentEnabledRaw = payload.contentEnabled !== undefined
    ? payload.contentEnabled
    : (payload.content_enabled !== undefined ? payload.content_enabled : currentContentEnabled);
  const contentEnabled = toBoolean(contentEnabledRaw, currentContentEnabled);
  const status = payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : Number(current?.status || 1);
  const order =
    Math.max(
      2,
      payload.order !== undefined ? Math.max(0, Math.trunc(toNumber(payload.order, 50))) : Number(current?.sort_order || 50)
    );

  if (!image) {
    throw new Error('轮播图不能为空');
  }

  if (isTutorialLink && !targetPageId) {
    throw new Error('请选择关联教程');
  }

  if (targetPageId > 0) {
    await ensureHomepageBannerTargetTutorialArticle(targetPageId);
  }

  return {
    image,
    coverImage: coverImages[0] || image,
    coverImages: coverImages,
    coverImagesSerialized: serializeContentPageCoverImages(coverImages),
    pageTitle,
    content,
    isTutorialLink,
    targetPageId,
    hideTitle,
    contentEnabled,
    status,
    order,
  };
};

const getAdminHomepageBannerById = async (id) => {
  const bannerId = Number(id || 0);
  if (!bannerId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT
        hb.*,
        cp.title AS page_title,
        cp.cover_image,
        cp.content_html,
        tp.title AS target_page_title
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      LEFT JOIN content_pages tp ON tp.id = hb.target_page_id
      WHERE hb.id = ?
      LIMIT 1
    `,
    [bannerId]
  );

  return rows.length ? mapAdminHomepageBannerRow(rows[0]) : null;
};

const listAdminHomepageBanners = async ({ page = 1, title = '', limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const filters = ['1 = 1'];
  const params = [];
  const primaryBanner = await getPrimaryHomepageBannerRow();
  const keyword = String(title || '').trim();

  if (keyword) {
    filters.push('(cp.title LIKE ? OR tp.title LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (primaryBanner?.id) {
    filters.push('hb.id <> ?');
    params.push(Number(primaryBanner.id || 0));
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      LEFT JOIN content_pages tp ON tp.id = hb.target_page_id
      WHERE ${whereSql}
    `,
    params
  );

  const [rows] = await getPool().execute(
    `
      SELECT
        hb.*,
        cp.title AS page_title,
        cp.cover_image,
        cp.content_html,
        tp.title AS target_page_title
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      LEFT JOIN content_pages tp ON tp.id = hb.target_page_id
      WHERE ${whereSql}
      ORDER BY hb.sort_order ASC, hb.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    params
  );

  return {
    list: rows.map(mapAdminHomepageBannerRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminHomepageBanner = async (payload = {}) => {
  const values = await normalizeHomepageBannerPayload(payload);
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [[countRow]] = await connection.execute('SELECT COUNT(1) AS totalCount FROM homepage_banners');
    if (Number(countRow?.totalCount || 0) >= 9) {
      throw new Error('首页轮播最多只能添加 9 条');
    }

    let nextPageId = 0;
    if (values.targetPageId <= 0) {
      const [pageResult] = await connection.execute(
        `
          INSERT INTO content_pages (title, page_type, cover_image, content_html, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [values.pageTitle, CONTENT_PAGE_TYPE_HOMEPAGE_BANNER, values.coverImagesSerialized, values.content, values.status, now, now]
      );

      nextPageId = Number(pageResult.insertId || 0);
    }

    const [bannerResult] = await connection.execute(
      `
        INSERT INTO homepage_banners (
          image_url, page_id, target_page_id, is_tutorial_link, content_enabled, hide_title, sort_order, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        values.image,
        nextPageId,
        values.targetPageId,
        values.isTutorialLink ? 1 : 0,
        values.contentEnabled ? 1 : 0,
        values.hideTitle ? 1 : 0,
        values.order,
        values.status,
        now,
        now,
      ]
    );

    await connection.commit();
    return getAdminHomepageBannerById(bannerResult.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateAdminHomepageBanner = async (id, payload = {}) => {
  const bannerId = Number(id || 0);
  if (!bannerId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT
        hb.*,
        cp.title AS page_title,
        cp.cover_image,
        cp.content_html
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      WHERE hb.id = ?
      LIMIT 1
    `,
    [bannerId]
  );

  if (!rows.length) {
    return null;
  }

  if (await isPrimaryHomepageBannerId(bannerId)) {
    return null;
  }

  const current = rows[0];
  const values = await normalizeHomepageBannerPayload(payload, current);
  const pageId = Number(current.page_id || 0);
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    let nextPageId = pageId;
    const now = Date.now();

    if (values.targetPageId <= 0) {
      if (nextPageId > 0) {
        await connection.execute(
          `
            UPDATE content_pages
            SET title = ?, cover_image = ?, content_html = ?, status = ?, updated_at = ?
            WHERE id = ?
          `,
          [values.pageTitle, values.coverImagesSerialized, values.content, values.status, now, nextPageId]
        );
      } else {
        const [pageResult] = await connection.execute(
          `
            INSERT INTO content_pages (title, page_type, cover_image, content_html, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [values.pageTitle, CONTENT_PAGE_TYPE_HOMEPAGE_BANNER, values.coverImagesSerialized, values.content, values.status, now, now]
        );
        nextPageId = Number(pageResult.insertId || 0);
      }
    }

    await connection.execute(
      `
        UPDATE homepage_banners
        SET image_url = ?, page_id = ?, target_page_id = ?, is_tutorial_link = ?, content_enabled = ?, hide_title = ?, sort_order = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        values.image,
        nextPageId,
        values.targetPageId,
        values.isTutorialLink ? 1 : 0,
        values.contentEnabled ? 1 : 0,
        values.hideTitle ? 1 : 0,
        values.order,
        values.status,
        now,
        bannerId,
      ]
    );

    await connection.commit();
    return getAdminHomepageBannerById(bannerId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getAdminPrimaryHomepageBanner = async () => {
  const primaryBanner = await getPrimaryHomepageBannerRow();

  if (!primaryBanner) {
    return null;
  }

  return getAdminHomepageBannerById(primaryBanner.id);
};

const updateAdminPrimaryHomepageBanner = async (payload = {}) => {
  const primaryBanner = await getPrimaryHomepageBannerRow();

  if (!primaryBanner) {
    return null;
  }

  const bannerId = Number(primaryBanner.id || 0);
  const [rows] = await getPool().execute(
    `
      SELECT
        hb.*,
        cp.title AS page_title,
        cp.cover_image,
        cp.content_html,
        tp.title AS target_page_title
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      LEFT JOIN content_pages tp ON tp.id = hb.target_page_id
      WHERE hb.id = ?
      LIMIT 1
    `,
    [bannerId]
  );

  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const values = await normalizeHomepageBannerPayload(payload, current);
  const pageId = Number(current.page_id || 0);
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    if (pageId > 0) {
      await connection.execute(
        `
          UPDATE content_pages
          SET title = ?, cover_image = ?, content_html = ?, status = ?, updated_at = ?
          WHERE id = ?
        `,
        [values.pageTitle, values.coverImagesSerialized, values.content, values.status, now, pageId]
      );
    }

    await connection.execute(
      `
        UPDATE homepage_banners
        SET image_url = ?, target_page_id = ?, is_tutorial_link = ?, content_enabled = ?, hide_title = ?, sort_order = 1, status = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        values.image,
        values.targetPageId,
        values.isTutorialLink ? 1 : 0,
        values.contentEnabled ? 1 : 0,
        values.hideTitle ? 1 : 0,
        values.status,
        now,
        bannerId,
      ]
    );

    await connection.commit();
    return getAdminHomepageBannerById(bannerId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const updateAdminHomepageBannerStatus = async (id, status) => {
  const bannerId = Number(id || 0);
  if (!bannerId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT hb.id, hb.page_id, cp.page_type
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      WHERE hb.id = ?
      LIMIT 1
    `,
    [bannerId]
  );
  if (!rows.length) {
    return null;
  }

  if (await isPrimaryHomepageBannerId(bannerId)) {
    return null;
  }

  const nextStatus = toBoolean(status, true) ? 1 : 0;
  const pageId = Number(rows[0].page_id || 0);
  const pageType = String(rows[0].page_type || '').trim();
  const now = Date.now();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE homepage_banners SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, now, bannerId]);
    if (pageId && pageType === CONTENT_PAGE_TYPE_HOMEPAGE_BANNER) {
      await connection.execute('UPDATE content_pages SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, now, pageId]);
    }
    await connection.commit();
    return getAdminHomepageBannerById(bannerId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteAdminHomepageBanner = async (id) => {
  const bannerId = Number(id || 0);
  if (!bannerId) {
    return 0;
  }

  const [rows] = await getPool().execute(
    `
      SELECT hb.id, hb.page_id, cp.page_type
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      WHERE hb.id = ?
      LIMIT 1
    `,
    [bannerId]
  );
  if (!rows.length) {
    return 0;
  }

  if (await isPrimaryHomepageBannerId(bannerId)) {
    return 0;
  }

  const pageId = Number(rows[0].page_id || 0);
  const pageType = String(rows[0].page_type || '').trim();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('DELETE FROM homepage_banners WHERE id = ? LIMIT 1', [bannerId]);
    if (pageId && pageType === CONTENT_PAGE_TYPE_HOMEPAGE_BANNER) {
      const [[pageRefRow]] = await connection.execute('SELECT COUNT(1) AS refCount FROM homepage_banners WHERE page_id = ?', [pageId]);
      if (!Number(pageRefRow?.refCount || 0)) {
        await connection.execute('DELETE FROM content_pages WHERE id = ? LIMIT 1', [pageId]);
      }
    }
    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const mapAdminContentPageRow = (row) => {
  const coverImages = normalizeContentPageCoverImages(row.cover_image || '');
  const primaryCoverImage = String(coverImages[0] || '').trim();
  const contentHtml = String(row.content_html || '');
  const tutorialPages = normalizeTutorialPages(row.pages_json, coverImages, contentHtml);
  const bodyText = String(contentHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const titleTag = String(row.title_tag || '').trim();
  const titleTagImageUrl = String(row.title_tag_image || '').trim();
  const showInHot = Number(row.show_in_hot || 0);
  const tutorialCategoryId = Number(row.tutorial_category_id || 0);
  const tutorialCategoryTitle = String(row.tutorial_category_title || '').trim();
  const tutorialTone = normalizeTutorialTone(row.tutorial_tone || '', 'blue');

  return {
    id: Number(row.id || 0),
    title: String(row.title || ''),
    titleTag,
    title_tag: titleTag,
    titleTagImageUrl,
    title_tag_image: titleTagImageUrl,
    showInHot,
    show_in_hot: showInHot,
    tutorialCategoryId,
    tutorial_category_id: tutorialCategoryId,
    tutorialCategoryTitle,
    tutorial_category_title: tutorialCategoryTitle,
    tutorialTone,
    tutorial_tone: tutorialTone,
    pageType: String(row.page_type || CONTENT_PAGE_TYPE_TUTORIAL),
    page_type: String(row.page_type || CONTENT_PAGE_TYPE_TUTORIAL),
    cover_image: primaryCoverImage,
    cover_images: coverImages,
    coverImageUrl: primaryCoverImage,
    cover_image_url: primaryCoverImage,
    coverImages: coverImages,
    bodyText: bodyText,
    body_text: bodyText,
    contentHtml: contentHtml,
    content_html: contentHtml,
    tutorialPages,
    tutorial_pages: tutorialPages,
    pageCount: tutorialPages.length,
    page_count: tutorialPages.length,
    endLinkProductId: Number(row.end_link_product_id || 0),
    end_link_product_id: Number(row.end_link_product_id || 0),
    endLinkCategoryKey: String(row.end_link_category_key || '').trim(),
    end_link_category_key: String(row.end_link_category_key || '').trim(),
    endLinkText: String(row.end_link_text || '立即下单').trim() || '立即下单',
    end_link_text: String(row.end_link_text || '立即下单').trim() || '立即下单',
    status: Number(row.status === undefined || row.status === null ? 1 : row.status),
    createdAt: Number(row.created_at || 0),
    created_at: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    updated_at: Number(row.updated_at || 0),
    create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
    update_time: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
  };
};

const normalizeTutorialPages = (rawPages, fallbackCoverImages = [], fallbackContentHtml = '') => {
  let source = rawPages;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_error) {
      source = [];
    }
  }

  if (!Array.isArray(source) || !source.length) {
    source = [{ coverImages: fallbackCoverImages, contentHtml: fallbackContentHtml }];
  }

  return source.map((item, index) => {
    const page = item && typeof item === 'object' ? item : {};
    const pageCoverImages = normalizeContentPageCoverImages(
      page.coverImages ?? page.cover_images ?? page.coverImageUrl ?? page.cover_image ?? '',
    );
    const pageContentHtml = String(page.contentHtml ?? page.content_html ?? page.content ?? '').trim();
    return {
      pageNumber: index + 1,
      page_number: index + 1,
      coverImages: pageCoverImages,
      cover_images: pageCoverImages,
      contentHtml: pageContentHtml,
      content_html: pageContentHtml,
      bodyText: String(page.bodyText ?? page.body_text ?? pageContentHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  });
};

const serializeTutorialPages = (pages) => JSON.stringify(normalizeTutorialPages(pages));

const normalizeAdminContentPagePayload = (payload = {}, current = null) => {
  const currentTitle = String(current?.title || '').trim();
  const currentTitleTag = String(current?.title_tag || '').trim();
  const currentTitleTagImageUrl = String(current?.title_tag_image || '').trim();
  const currentPageType = String(current?.page_type || CONTENT_PAGE_TYPE_TUTORIAL).trim() || CONTENT_PAGE_TYPE_TUTORIAL;
  const currentTutorialCategoryId = Number(current?.tutorial_category_id || 0);
  const currentTutorialTone = normalizeTutorialTone(current?.tutorial_tone || '', 'blue');
  const currentCoverImages = normalizeContentPageCoverImages(current?.cover_image || '');
  const currentContentHtml = String(current?.content_html || '');
  const currentPages = normalizeTutorialPages(current?.pages_json, currentCoverImages, currentContentHtml);
  const currentEndLinkProductId = Number(current?.end_link_product_id || 0);
  const currentEndLinkCategoryKey = String(current?.end_link_category_key || '').trim();
  const currentEndLinkText = String(current?.end_link_text || '立即下单').trim() || '立即下单';

  const title = payload.title !== undefined ? String(payload.title || '').trim() : currentTitle;
  const titleTag = payload.titleTag !== undefined
    ? String(payload.titleTag || '').trim()
    : (payload.title_tag !== undefined ? String(payload.title_tag || '').trim() : currentTitleTag);
  const titleTagImageUrl = payload.titleTagImageUrl !== undefined
    ? String(payload.titleTagImageUrl || '').trim()
    : (payload.title_tag_image !== undefined ? String(payload.title_tag_image || '').trim() : currentTitleTagImageUrl);
  const pageType = payload.pageType !== undefined
    ? String(payload.pageType || '').trim()
    : (payload.page_type !== undefined ? String(payload.page_type || '').trim() : currentPageType);
  const tutorialCategoryIdRaw = payload.tutorialCategoryId !== undefined
    ? payload.tutorialCategoryId
    : (payload.tutorial_category_id !== undefined ? payload.tutorial_category_id : currentTutorialCategoryId);
  const tutorialCategoryId = Math.max(0, Number(tutorialCategoryIdRaw || 0));
  const tutorialTone = payload.tutorialTone !== undefined
    ? normalizeTutorialTone(payload.tutorialTone, currentTutorialTone)
    : (payload.tutorial_tone !== undefined ? normalizeTutorialTone(payload.tutorial_tone, currentTutorialTone) : currentTutorialTone);
  const coverImagesSource = payload.coverImages !== undefined
    ? payload.coverImages
    : (payload.coverImageUrl !== undefined
      ? payload.coverImageUrl
      : (payload.cover_image_url !== undefined ? payload.cover_image_url : payload.cover_image));
  const coverImages = coverImagesSource !== undefined
    ? normalizeContentPageCoverImages(coverImagesSource)
    : currentCoverImages;
  const contentHtml = payload.contentHtml !== undefined
    ? String(payload.contentHtml || '')
    : (payload.content_html !== undefined ? String(payload.content_html || '') : currentContentHtml);
  const pagesSource = payload.tutorialPages !== undefined
    ? payload.tutorialPages
    : (payload.tutorial_pages !== undefined ? payload.tutorial_pages : currentPages);
  const tutorialPages = normalizeTutorialPages(pagesSource, coverImages, contentHtml);
  if (payload.tutorialPages === undefined && payload.tutorial_pages === undefined && (payload.contentHtml !== undefined || payload.content_html !== undefined || coverImagesSource !== undefined)) {
    tutorialPages[0] = normalizeTutorialPages([{ coverImages, contentHtml }])[0];
  }
  const firstPage = tutorialPages[0] || { coverImages, contentHtml };
  const endLinkProductIdRaw = payload.endLinkProductId !== undefined
    ? payload.endLinkProductId
    : (payload.end_link_product_id !== undefined ? payload.end_link_product_id : currentEndLinkProductId);
  const endLinkProductId = Math.max(0, Number(endLinkProductIdRaw || 0));
  const endLinkCategoryKeyRaw = payload.endLinkCategoryKey !== undefined
    ? payload.endLinkCategoryKey
    : (payload.end_link_category_key !== undefined ? payload.end_link_category_key : currentEndLinkCategoryKey);
  const endLinkCategoryKey = String(endLinkCategoryKeyRaw || '').trim();
  const endLinkText = payload.endLinkText !== undefined
    ? String(payload.endLinkText || '').trim()
    : (payload.end_link_text !== undefined ? String(payload.end_link_text || '').trim() : currentEndLinkText);
  const showInHot = payload.showInHot !== undefined
    ? (toBoolean(payload.showInHot, false) ? 1 : 0)
    : (payload.show_in_hot !== undefined ? (toBoolean(payload.show_in_hot, false) ? 1 : 0) : Number(current?.show_in_hot || 0));
  const status = payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : Number(current?.status || 1);

  if (!title) {
    throw new Error('标题不能为空');
  }

  return {
    title,
    titleTag,
    titleTagImageUrl,
    pageType: pageType || CONTENT_PAGE_TYPE_TUTORIAL,
    tutorialCategoryId,
    tutorialTone,
    coverImages: firstPage.coverImages,
    coverImagesSerialized: serializeContentPageCoverImages(firstPage.coverImages),
    contentHtml: firstPage.contentHtml,
    tutorialPages,
    tutorialPagesSerialized: serializeTutorialPages(tutorialPages),
    endLinkProductId,
    endLinkCategoryKey,
    endLinkText: endLinkText || '立即下单',
    showInHot,
    status,
  };
};

const getAdminContentPageById = async (id) => {
  const pageId = Number(id || 0);
  if (!pageId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT
        cp.*,
        category.title AS tutorial_category_title
      FROM content_pages cp
      LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE cp.id = ?
      LIMIT 1
    `,
    [pageId]
  );

  return rows.length ? mapAdminContentPageRow(rows[0]) : null;
};

const listAdminContentPages = async ({ page = 1, title = '', limit = 10, mode = 'tutorial', tutorialCategoryId = 0 } = {}) => {
  const primaryBanner = await getPrimaryHomepageBannerRow();
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const filters = ['1 = 1'];
  const params = [];
  const keyword = String(title || '').trim();
  const normalizedMode = String(mode || 'tutorial').trim();
  const normalizedTutorialCategoryId = Math.max(0, Number(tutorialCategoryId || 0));

  if (keyword) {
    filters.push('cp.title LIKE ?');
    params.push(`%${keyword}%`);
  }

  if (normalizedTutorialCategoryId > 0) {
    filters.push('cp.tutorial_category_id = ?');
    params.push(normalizedTutorialCategoryId);
  }

  if (normalizedMode === 'primary') {
    if (!primaryBanner?.page_id) {
      return {
        list: [],
        totalCount: 0,
      };
    }

    filters.push('cp.id = ?');
    params.push(Number(primaryBanner.page_id || 0));
  } else if (normalizedMode === 'article') {
    filters.push('cp.page_type = ?');
    params.push(CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE);
  } else if (normalizedMode === 'category') {
    filters.push('cp.page_type = ?');
    params.push(CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY);
    filters.push('cp.title_tag <> ?');
    params.push('');
  } else {
    filters.push('(cp.page_type = ? OR cp.page_type = ?)');
    params.push(CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY, CONTENT_PAGE_TYPE_TUTORIAL);

    if (primaryBanner?.page_id) {
      filters.push('cp.id <> ?');
      params.push(Number(primaryBanner.page_id || 0));
    }
  }

  const whereSql = filters.join(' AND ');
  const [[countRow]] = await getPool().query(
    `
      SELECT COUNT(1) AS totalCount
      FROM content_pages cp
      WHERE ${whereSql}
    `,
    params
  );

  const limitSql = normalizedMode === 'primary' ? 'LIMIT 1' : `ORDER BY cp.updated_at DESC, cp.id DESC LIMIT ${pageSize} OFFSET ${offset}`;
  const [rows] = await getPool().query(
    `
      SELECT
        cp.*,
        category.title AS tutorial_category_title
      FROM content_pages cp
      LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE ${whereSql}
      ${limitSql}
    `,
    params
  );

  return {
    list: rows.map(mapAdminContentPageRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminContentPage = async (payload = {}) => {
  const values = normalizeAdminContentPagePayload(payload);
  const now = Date.now();
  const [result] = await getPool().execute(
    `
      INSERT INTO content_pages (title, title_tag, title_tag_image, page_type, tutorial_category_id, tutorial_tone, cover_image, content_html, pages_json, end_link_product_id, end_link_category_key, end_link_text, show_in_hot, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      values.title,
      values.titleTag,
      values.titleTagImageUrl,
      values.pageType,
      values.tutorialCategoryId,
      values.tutorialTone,
      values.coverImagesSerialized,
      values.contentHtml,
      values.tutorialPagesSerialized,
      values.endLinkProductId || null,
      values.endLinkCategoryKey || null,
      values.endLinkText,
      values.showInHot,
      values.status,
      now,
      now,
    ]
  );

  return getAdminContentPageById(result.insertId);
};

const updateAdminContentPage = async (id, payload = {}) => {
  const pageId = Number(id || 0);
  if (!pageId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM content_pages WHERE id = ? LIMIT 1', [pageId]);
  if (!rows.length) {
    return null;
  }

  const values = normalizeAdminContentPagePayload(payload, rows[0]);
  await getPool().execute(
    `
      UPDATE content_pages
      SET title = ?, title_tag = ?, title_tag_image = ?, page_type = ?, tutorial_category_id = ?, tutorial_tone = ?, cover_image = ?, content_html = ?, pages_json = ?, end_link_product_id = ?, end_link_category_key = ?, end_link_text = ?, show_in_hot = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      values.title,
      values.titleTag,
      values.titleTagImageUrl,
      values.pageType,
      values.tutorialCategoryId,
      values.tutorialTone,
      values.coverImagesSerialized,
      values.contentHtml,
      values.tutorialPagesSerialized,
      values.endLinkProductId || null,
      values.endLinkCategoryKey || null,
      values.endLinkText,
      values.showInHot,
      values.status,
      Date.now(),
      pageId,
    ]
  );

  return getAdminContentPageById(pageId);
};

const updateAdminContentPageStatus = async (id, status) => {
  const pageId = Number(id || 0);
  if (!pageId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT id FROM content_pages WHERE id = ? LIMIT 1', [pageId]);
  if (!rows.length) {
    return null;
  }

  await getPool().execute('UPDATE content_pages SET status = ?, updated_at = ? WHERE id = ?', [
    toBoolean(status, true) ? 1 : 0,
    Date.now(),
    pageId,
  ]);

  return getAdminContentPageById(pageId);
};

const deleteAdminContentPage = async (id) => {
  const pageId = Number(id || 0);
  if (!pageId) {
    return 0;
  }

  const primaryBanner = await getPrimaryHomepageBannerRow();
  if (Number(primaryBanner?.page_id || 0) === pageId) {
    return 0;
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const now = Date.now();
    await connection.execute('UPDATE content_pages SET tutorial_category_id = 0 WHERE tutorial_category_id = ?', [pageId]);
    await connection.execute('DELETE FROM homepage_banners WHERE page_id = ?', [pageId]);
    await connection.execute(
      'UPDATE homepage_banners SET target_page_id = NULL, updated_at = ? WHERE target_page_id = ? AND page_id > 0',
      [now, pageId]
    );
    await connection.execute('DELETE FROM homepage_banners WHERE target_page_id = ? AND page_id = 0', [pageId]);
    const [result] = await connection.execute('DELETE FROM content_pages WHERE id = ? LIMIT 1', [pageId]);
    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteAdminContentPages = async (ids = []) => {
  const normalizedIds = Array.isArray(ids)
    ? [...new Set(ids.map((id) => Number(id || 0)).filter((id) => id > 0))]
    : [];

  if (!normalizedIds.length) {
    return 0;
  }

  const primaryBanner = await getPrimaryHomepageBannerRow();
  const safeIds = normalizedIds.filter((id) => Number(primaryBanner?.page_id || 0) !== id);
  if (!safeIds.length) {
    return 0;
  }

  const placeholders = safeIds.map(() => '?').join(',');
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const now = Date.now();
    await connection.execute(`UPDATE content_pages SET tutorial_category_id = 0 WHERE tutorial_category_id IN (${placeholders})`, safeIds);
    await connection.execute(`DELETE FROM homepage_banners WHERE page_id IN (${placeholders})`, safeIds);
    await connection.execute(
      `UPDATE homepage_banners SET target_page_id = NULL, updated_at = ? WHERE target_page_id IN (${placeholders}) AND page_id > 0`,
      [now, ...safeIds]
    );
    await connection.execute(`DELETE FROM homepage_banners WHERE target_page_id IN (${placeholders}) AND page_id = 0`, safeIds);
    const [result] = await connection.execute(
      `DELETE FROM content_pages WHERE id IN (${placeholders})`,
      safeIds
    );
    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const mapPublicHomepageBannerRow = (row) => {
  const coverImages = normalizeContentPageCoverImages(row.cover_image || row.image_url || '').map((item) => toWebAssetUrl(item));
  const primaryCoverImage = coverImages[0] || toWebAssetUrl(row.image_url || '');
  const targetPageId = Number(row.target_page_id || 0);
  const isTutorialLink = Number(row.is_tutorial_link || 0) === 1 && targetPageId > 0;
  const effectivePageId = Number(row.effective_page_id || (isTutorialLink ? targetPageId : row.page_id) || 0);
  const contentEnabled = Number(row.content_enabled === undefined || row.content_enabled === null ? 1 : row.content_enabled) === 1;
  const hideTitle = Number(row.hide_title || 0) === 1;
  const pageTitle = hideTitle ? '' : String(row.page_title || '');

  return {
    id: Number(row.id || 0),
    imageUrl: toWebAssetUrl(row.image_url || primaryCoverImage || ''),
    image_url: toWebAssetUrl(row.image_url || primaryCoverImage || ''),
    pageId: effectivePageId,
    page_id: effectivePageId,
    targetPageId: isTutorialLink ? targetPageId : 0,
    target_page_id: isTutorialLink ? targetPageId : 0,
    isTutorialLink,
    is_tutorial_link: isTutorialLink ? 1 : 0,
    contentEnabled,
    content_enabled: contentEnabled ? 1 : 0,
    hideTitle,
    hide_title: hideTitle ? 1 : 0,
    pageTitle,
    page_title: pageTitle,
    coverImage: primaryCoverImage,
    cover_image: primaryCoverImage,
    coverImages: coverImages,
    cover_images: coverImages,
  };
};

const listPublicHomepageBanners = async () => {
  const [rows] = await getPool().execute(
    `
      SELECT
        hb.id,
        hb.image_url,
        hb.page_id,
        hb.target_page_id,
        hb.is_tutorial_link,
        hb.content_enabled,
        hb.hide_title,
        CASE
          WHEN hb.is_tutorial_link = 1 AND hb.target_page_id IS NOT NULL THEN hb.target_page_id
          ELSE hb.page_id
        END AS effective_page_id,
        CASE
          WHEN hb.is_tutorial_link = 1 AND hb.target_page_id IS NOT NULL THEN tp.title
          ELSE cp.title
        END AS page_title,
        CASE
          WHEN hb.is_tutorial_link = 1 AND hb.target_page_id IS NOT NULL THEN tp.cover_image
          ELSE cp.cover_image
        END AS cover_image
      FROM homepage_banners hb
      LEFT JOIN content_pages cp ON cp.id = hb.page_id
      LEFT JOIN content_pages tp ON tp.id = hb.target_page_id AND tp.page_type = ?
      WHERE hb.status = 1
        AND (
          (hb.is_tutorial_link = 1 AND hb.target_page_id IS NOT NULL AND tp.status = 1)
          OR ((hb.is_tutorial_link = 0 OR hb.target_page_id IS NULL) AND cp.status = 1)
        )
      ORDER BY hb.sort_order ASC, hb.id DESC
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );

  return rows.map(mapPublicHomepageBannerRow);
};

const mapPublicContentPageRow = (row) => {
  const coverImages = normalizeContentPageCoverImages(row.cover_image || '').map((item) => toWebAssetUrl(item));
  const primaryCoverImage = coverImages[0] || '';
  const titleTag = String(row.title_tag || '').trim();
  const titleTagImageUrl = toWebAssetUrl(row.title_tag_image || '');
  const tutorialPages = normalizeTutorialPages(row.pages_json, coverImages, String(row.content_html || '')).map((page) => ({
    ...page,
    coverImages: page.coverImages.map((item) => toWebAssetUrl(item)),
    cover_images: page.coverImages.map((item) => toWebAssetUrl(item)),
  }));
  const showInHot = Number(row.show_in_hot || 0);
  const tutorialCategoryId = Number(row.tutorial_category_id || 0);
  const tutorialCategoryTitle = String(row.tutorial_category_title || '').trim();
  const tutorialTone = normalizeTutorialTone(row.tutorial_tone || '', 'blue');

  return {
    id: Number(row.id || 0),
    title: String(row.title || ''),
    titleTag,
    title_tag: titleTag,
    titleTagImageUrl,
    title_tag_image: titleTagImageUrl,
    showInHot,
    show_in_hot: showInHot,
    tutorialCategoryId,
    tutorial_category_id: tutorialCategoryId,
    tutorialCategoryTitle,
    tutorial_category_title: tutorialCategoryTitle,
    tutorialTone,
    tutorial_tone: tutorialTone,
    coverImage: primaryCoverImage,
    cover_image: primaryCoverImage,
    coverImages: coverImages,
    cover_images: coverImages,
    contentHtml: String(row.content_html || ''),
    content_html: String(row.content_html || ''),
    tutorialPages,
    tutorial_pages: tutorialPages,
    pageCount: tutorialPages.length,
    page_count: tutorialPages.length,
    endLinkProductId: Number(row.end_link_product_id || 0),
    end_link_product_id: Number(row.end_link_product_id || 0),
    endLinkCategoryKey: String(row.end_link_category_key || '').trim(),
    end_link_category_key: String(row.end_link_category_key || '').trim(),
    endLinkText: String(row.end_link_text || '立即下单').trim() || '立即下单',
    end_link_text: String(row.end_link_text || '立即下单').trim() || '立即下单',
    viewCount: Number(row.view_count || 0),
    view_count: Number(row.view_count || 0),
    likeCount: Number(row.like_count || 0),
    like_count: Number(row.like_count || 0),
    favoriteCount: Number(row.favorite_count || 0),
    favorite_count: Number(row.favorite_count || 0),
    shareCount: Number(row.share_count || 0),
    share_count: Number(row.share_count || 0),
    updatedAt: Number(row.updated_at || 0),
  };
};

const TUTORIAL_INTERACTION_TYPES = new Set(['like', 'favorite']);

const mapTutorialInteractionStats = (row = {}, state = {}) => ({
  pageId: Number(row.id || row.page_id || 0),
  viewCount: Number(row.view_count || 0),
  likeCount: Number(row.like_count || 0),
  favoriteCount: Number(row.favorite_count || 0),
  shareCount: Number(row.share_count || 0),
  liked: Boolean(state.liked),
  favorited: Boolean(state.favorited),
});

const getTutorialArticleStatsRow = async (pageId, executor = getPool()) => {
  const normalizedPageId = Number(pageId || 0);
  if (!normalizedPageId) return null;
  const [rows] = await executor.execute(
    `SELECT id, view_count, like_count, favorite_count, share_count
     FROM content_pages
     WHERE id = ? AND page_type = ? AND status = 1
     LIMIT 1`,
    [normalizedPageId, CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );
  return rows[0] || null;
};

const getPublicTutorialInteractionStats = async (pageId, openId = '') => {
  const row = await getTutorialArticleStatsRow(pageId);
  if (!row) return null;

  const state = { liked: false, favorited: false };
  const normalizedOpenId = String(openId || '').trim();
  if (normalizedOpenId) {
    const [rows] = await getPool().execute(
      `SELECT action_type
       FROM content_page_interactions
       WHERE page_id = ? AND open_id = ? AND action_type IN ('like', 'favorite')`,
      [Number(pageId), normalizedOpenId]
    );
    rows.forEach((item) => {
      if (item.action_type === 'like') state.liked = true;
      if (item.action_type === 'favorite') state.favorited = true;
    });
  }

  return mapTutorialInteractionStats(row, state);
};

const listUserTutorialInteractions = async (openId, actionType = 'like') => {
  const normalizedOpenId = String(openId || '').trim();
  const normalizedAction = ['like', 'favorite'].includes(String(actionType)) ? String(actionType) : 'like';
  if (!normalizedOpenId) return [];
  const [rows] = await getPool().execute(
    `SELECT pages.id, pages.title, pages.title_tag, pages.title_tag_image, pages.cover_image,
            pages.view_count, pages.like_count, pages.favorite_count, pages.share_count, pages.updated_at
     FROM content_page_interactions interactions
     INNER JOIN content_pages pages ON pages.id = interactions.page_id
     WHERE interactions.open_id = ? AND interactions.action_type = ?
       AND pages.page_type = ? AND pages.status = 1
     ORDER BY interactions.updated_at DESC, interactions.id DESC`,
    [normalizedOpenId, normalizedAction, CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );
  return rows.map((row) => ({
    id: Number(row.id || 0),
    title: String(row.title || ''),
    titleTag: String(row.title_tag || ''),
    titleTagImageUrl: String(row.title_tag_image || ''),
    coverImage: String(row.cover_image || ''),
    viewCount: Number(row.view_count || 0),
    likeCount: Number(row.like_count || 0),
    favoriteCount: Number(row.favorite_count || 0),
    shareCount: Number(row.share_count || 0),
    updatedAt: Number(row.updated_at || 0),
  }));
};

const incrementTutorialCounter = async (pageId, field) => {
  const allowedFields = new Set(['view_count', 'share_count']);
  if (!allowedFields.has(field)) return null;
  await getPool().execute(
    `UPDATE content_pages
     SET ${field} = ${field} + 1
     WHERE id = ? AND page_type = ? AND status = 1`,
    [Number(pageId), CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );
  return getTutorialArticleStatsRow(pageId);
};

const recordPublicTutorialView = async (pageId) => incrementTutorialCounter(pageId, 'view_count');
const recordPublicTutorialShare = async (pageId) => incrementTutorialCounter(pageId, 'share_count');

const togglePublicTutorialInteraction = async (pageId, openId, actionType) => {
  const normalizedPageId = Number(pageId || 0);
  const normalizedOpenId = String(openId || '').trim();
  const normalizedActionType = String(actionType || '').trim().toLowerCase();
  if (!normalizedPageId || !normalizedOpenId || !TUTORIAL_INTERACTION_TYPES.has(normalizedActionType)) {
    throw new Error('教程互动参数不正确');
  }

  const counterField = normalizedActionType === 'like' ? 'like_count' : 'favorite_count';
  const connection = await getPool().getConnection();
  let active = false;
  try {
    await connection.beginTransaction();
    const [pageRows] = await connection.execute(
      `SELECT id
       FROM content_pages
       WHERE id = ? AND page_type = ? AND status = 1
       LIMIT 1
       FOR UPDATE`,
      [normalizedPageId, CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
    );
    if (!pageRows.length) {
      throw new Error('教程不存在');
    }

    const [interactionRows] = await connection.execute(
      `SELECT id
       FROM content_page_interactions
       WHERE page_id = ? AND open_id = ? AND action_type = ?
       LIMIT 1`,
      [normalizedPageId, normalizedOpenId, normalizedActionType]
    );
    if (interactionRows.length) {
      await connection.execute('DELETE FROM content_page_interactions WHERE id = ?', [interactionRows[0].id]);
      await connection.execute(
        `UPDATE content_pages SET ${counterField} = GREATEST(0, ${counterField} - 1) WHERE id = ?`,
        [normalizedPageId]
      );
    } else {
      const now = Date.now();
      await connection.execute(
        `INSERT INTO content_page_interactions (page_id, open_id, action_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [normalizedPageId, normalizedOpenId, normalizedActionType, now, now]
      );
      await connection.execute(
        `UPDATE content_pages SET ${counterField} = ${counterField} + 1 WHERE id = ?`,
        [normalizedPageId]
      );
      active = true;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const stats = await getPublicTutorialInteractionStats(normalizedPageId, normalizedOpenId);
  return { ...stats, active, actionType: normalizedActionType };
};

const getDirectoryCategoryIcon = (row = {}) => {
  const titleTag = String(row.title_tag || '').trim();
  if (titleTag) {
    return titleTag;
  }

  const title = String(row.title || '').trim();
  if (!title) {
    return '•';
  }

  return title.slice(0, 1);
};

const parseTutorialDirectoryContent = (contentHtml = '') => {
  const lines = String(contentHtml || '')
    .replace(/<\/(h\d|p|div|br)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const categories = [];
  const hotQuestions = [];
  let currentSection = '';

  lines.forEach((line) => {
    if (line === '问题分类') {
      currentSection = 'categories';
      return;
    }

    if (line === '热门问题') {
      currentSection = 'questions';
      return;
    }

    const parts = String(line || '').split('|').map((item) => item.trim()).filter(Boolean);
    if (!parts.length) {
      return;
    }

    if (currentSection === 'categories') {
      categories.push({
        icon: parts[0] || '',
        title: parts[1] || parts[0] || '',
        tone: normalizeTutorialTone(parts[2] || '', 'blue'),
      });
      return;
    }

    if (currentSection === 'questions') {
      hotQuestions.push({
        tag: parts[0] || '问题',
        question: parts[1] || parts[0] || '',
      });
    }
  });

  return {
    categories: categories.filter((item) => item.title),
    hotQuestions: hotQuestions.filter((item) => item.question),
  };
};

const escapeHtmlText = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildTutorialDirectoryContentHtml = ({ categories = [], hotQuestions = [] } = {}) => {
  const blocks = ['<div>', '<h2>问题分类</h2>'];

  categories.forEach((item) => {
    blocks.push(`<p>${escapeHtmlText(item.icon)}|${escapeHtmlText(item.title)}|${escapeHtmlText(item.tone)}</p>`);
  });

  blocks.push('<h2>热门问题</h2>');

  hotQuestions.forEach((item) => {
    blocks.push(`<p>${escapeHtmlText(item.tag)}|${escapeHtmlText(item.question)}</p>`);
  });

  blocks.push('</div>');
  return blocks.join('');
};

const getTutorialDirectoryContentRows = async () => {
  const [categoryRows] = await getPool().execute(
    `
      SELECT
        id,
        title,
        title_tag,
        tutorial_tone,
        updated_at
      FROM content_pages
      WHERE page_type = ? AND status = 1 AND title_tag <> ''
      ORDER BY id ASC
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY]
  );

  const [hotQuestionRows] = await getPool().execute(
    `
      SELECT
        cp.id,
        cp.title,
        cp.title_tag,
        cp.title_tag_image,
        cp.like_count,
        cp.updated_at,
        category.title AS tutorial_category_title
      FROM content_pages cp
      LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE cp.page_type = ? AND cp.status = 1 AND cp.show_in_hot = 1
      ORDER BY cp.id ASC
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );

  return {
    categories: categoryRows.map((row) => ({
      icon: getDirectoryCategoryIcon(row),
      title: String(row.title || '').trim(),
      tone: normalizeTutorialTone(row.tutorial_tone || '', 'blue'),
      updatedAt: Number(row.updated_at || 0),
    })),
    hotQuestions: hotQuestionRows.map((row) => ({
      id: Number(row.id || 0),
      pageId: Number(row.id || 0),
      tagImageUrl: toWebAssetUrl(row.title_tag_image || ''),
      likeCount: Number(row.like_count || 0),
      tag: String(row.title_tag || row.tutorial_category_title || '问题').trim() || '问题',
      question: String(row.title || '').trim(),
      updatedAt: Number(row.updated_at || 0),
    })),
  };
};

const listPublicTutorialCategories = async () => {
  const [rows] = await getPool().execute(
    `
      SELECT
        cp.*,
        category.title AS tutorial_category_title
      FROM content_pages cp
      LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE cp.page_type = ? AND cp.status = 1 AND cp.title_tag <> ''
      ORDER BY cp.id ASC
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY]
  );

  return rows.map(mapPublicContentPageRow);
};

const listPublicTutorialArticles = async ({ onlyHot = false } = {}) => {
  const filters = ['cp.page_type = ?', 'cp.status = 1'];
  const params = [CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE];

  if (onlyHot) {
    filters.push('cp.show_in_hot = 1');
  }

  const [rows] = await getPool().execute(
    `
      SELECT
        cp.*,
        category.title AS tutorial_category_title
      FROM content_pages cp
      LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE ${filters.join(' AND ')}
      ORDER BY cp.show_in_hot DESC, cp.updated_at DESC, cp.id DESC
    `,
    params
  );

  return rows.map(mapPublicContentPageRow);
};

const listPublicTutorialArticlesByCategory = async (categoryId) => {
  const id = Number(categoryId || 0);
  if (!id) return [];
  const [rows] = await getPool().execute(
    `SELECT cp.*, category.title AS tutorial_category_title
       FROM content_pages cp
       LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE cp.page_type = ? AND cp.status = 1 AND cp.tutorial_category_id = ?
      ORDER BY cp.updated_at DESC, cp.id DESC`,
    [CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE, id]
  );
  return rows.map(mapPublicContentPageRow);
};

const ensureTutorialDirectorySeedData = async () => {
  const [pageRows] = await getPool().execute(
    'SELECT id, content_html FROM content_pages WHERE id = 1 AND status = 1 LIMIT 1'
  );
  const page = pageRows[0];

  if (!page || !String(page.content_html || '').trim()) {
    return;
  }

  const parsed = parseTutorialDirectoryContent(page.content_html);
  const [[categoryCountRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM content_pages
      WHERE page_type = ? AND title_tag <> ''
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY]
  );
  const [[articleCountRow]] = await getPool().execute(
    `
      SELECT COUNT(1) AS totalCount
      FROM content_pages
      WHERE page_type = ?
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE]
  );

  const validCategoryCount = Number(categoryCountRow?.totalCount || 0);
  const articleCount = Number(articleCountRow?.totalCount || 0);

  if (!validCategoryCount && parsed.categories.length) {
    for (const item of parsed.categories) {
      const now = Date.now();
      await getPool().execute(
        `
          INSERT INTO content_pages (
            title, title_tag, title_tag_image, page_type, tutorial_category_id, tutorial_tone,
            cover_image, content_html, show_in_hot, status, created_at, updated_at
          )
          VALUES (?, ?, '', ?, 0, ?, '', '', 0, 1, ?, ?)
        `,
        [item.title, item.icon, CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY, item.tone, now, now]
      );
    }
  }

  if (articleCount || !parsed.hotQuestions.length) {
    return;
  }

  const [categoryRows] = await getPool().execute(
    `
      SELECT id, title, title_tag
      FROM content_pages
      WHERE page_type = ? AND status = 1 AND title_tag <> ''
      ORDER BY id ASC
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY]
  );
  const categoryByTag = new Map();
  const categoryByTitle = new Map();

  categoryRows.forEach((row) => {
    const titleTag = String(row.title_tag || '').trim();
    const title = String(row.title || '').trim();
    if (titleTag) {
      categoryByTag.set(titleTag, Number(row.id || 0));
    }
    if (title) {
      categoryByTitle.set(title, Number(row.id || 0));
    }
  });

  for (const item of parsed.hotQuestions) {
    const now = Date.now();
    const tutorialCategoryId = Number(categoryByTag.get(item.tag) || categoryByTitle.get(item.tag) || 0);
    await getPool().execute(
      `
        INSERT INTO content_pages (
          title, title_tag, title_tag_image, page_type, tutorial_category_id, tutorial_tone,
          cover_image, content_html, show_in_hot, status, created_at, updated_at
        )
        VALUES (?, ?, '', ?, ?, 'blue', '', '', 1, 1, ?, ?)
      `,
      [item.question, item.tag, CONTENT_PAGE_TYPE_TUTORIAL_ARTICLE, tutorialCategoryId, now, now]
    );
  }
};

const getPublicContentPageById = async (id) => {
  const pageId = Number(id || 0);
  if (!pageId) {
    return null;
  }

  const [rows] = await getPool().execute(
    `
      SELECT
        cp.*,
        category.title AS tutorial_category_title
      FROM content_pages cp
      LEFT JOIN content_pages category ON category.id = cp.tutorial_category_id
      WHERE cp.id = ? AND cp.status = 1
      LIMIT 1
    `,
    [pageId]
  );

  if (!rows.length) {
    return null;
  }

  const page = rows[0];
  if (pageId === 1) {
    const directoryRows = await getTutorialDirectoryContentRows();
    const latestUpdatedAt = Math.max(
      Number(page.updated_at || 0),
      ...directoryRows.categories.map((item) => Number(item.updatedAt || 0)),
      ...directoryRows.hotQuestions.map((item) => Number(item.updatedAt || 0))
    );

    return mapPublicContentPageRow({
      ...page,
      content_html: buildTutorialDirectoryContentHtml(directoryRows),
      updated_at: latestUpdatedAt,
    });
  }

  return mapPublicContentPageRow(page);
};

const mapAdminCouponRow = (row) => ({
  id: Number(row.id || 0),
  name: String(row.name || ''),
  type: Number(row.type || 0),
  value: Number(row.value || 0),
  total: Number(row.total || 0),
  used: Number(row.used || 0),
  min_price: Number(row.min_price || 0),
  start_time: Number(row.start_time || 0),
  end_time: Number(row.end_time || 0),
  start_time_realtime: formatRealtimeOrTimestamp(row.start_time_realtime, row.start_time),
  end_time_realtime: formatRealtimeOrTimestamp(row.end_time_realtime, row.end_time),
  order: Number(row.sort_order || 50),
  desc: String(row.desc_text || ''),
  status: Number(row.status === undefined || row.status === null ? 1 : row.status),
  create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
  update_time: formatRealtimeOrTimestamp(row.updated_at_realtime, row.updated_at),
});

const listAdminCoupons = async ({ page = 1, limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const [[countRow]] = await getPool().query('SELECT COUNT(1) AS totalCount FROM admin_coupons');
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM admin_coupons
      ORDER BY sort_order ASC, id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `
  );

  return {
    list: rows.map(mapAdminCouponRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminCoupon = async (payload = {}) => {
  const now = Date.now();
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('优惠券名称不能为空');
  }

  const [result] = await getPool().execute(
    `
      INSERT INTO admin_coupons
      (name, type, value, total, used, min_price, sort_order, start_time, end_time, status, desc_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      name,
      Number(payload.type || 0),
      Math.max(0, toNumber(payload.value, 0)),
      Math.max(0, Math.trunc(toNumber(payload.total, 0))),
      0,
      Math.max(0, toNumber(payload.min_price, 0)),
      Math.max(0, Math.trunc(toNumber(payload.order, 50))),
      Math.max(0, Math.trunc(toNumber(payload.start_time, 0))),
      Math.max(0, Math.trunc(toNumber(payload.end_time, 0))),
      toBoolean(payload.status, true) ? 1 : 0,
      String(payload.desc || ''),
      now,
      now,
    ]
  );

  const [rows] = await getPool().execute('SELECT * FROM admin_coupons WHERE id = ? LIMIT 1', [result.insertId]);
  return rows.length ? mapAdminCouponRow(rows[0]) : null;
};

const updateAdminCoupon = async (id, payload = {}) => {
  const couponId = Number(id || 0);
  if (!couponId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_coupons WHERE id = ? LIMIT 1', [couponId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const nextName = payload.name !== undefined ? String(payload.name || '').trim() : String(current.name || '').trim();
  if (!nextName) {
    throw new Error('优惠券名称不能为空');
  }

  await getPool().execute(
    `
      UPDATE admin_coupons
      SET name = ?, type = ?, value = ?, total = ?, min_price = ?, sort_order = ?, start_time = ?, end_time = ?, status = ?, desc_text = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      nextName,
      payload.type !== undefined ? Number(payload.type || 0) : Number(current.type || 0),
      payload.value !== undefined ? Math.max(0, toNumber(payload.value, 0)) : Number(current.value || 0),
      payload.total !== undefined ? Math.max(0, Math.trunc(toNumber(payload.total, 0))) : Number(current.total || 0),
      payload.min_price !== undefined ? Math.max(0, toNumber(payload.min_price, 0)) : Number(current.min_price || 0),
      payload.order !== undefined ? Math.max(0, Math.trunc(toNumber(payload.order, 50))) : Number(current.sort_order || 50),
      payload.start_time !== undefined ? Math.max(0, Math.trunc(toNumber(payload.start_time, 0))) : Number(current.start_time || 0),
      payload.end_time !== undefined ? Math.max(0, Math.trunc(toNumber(payload.end_time, 0))) : Number(current.end_time || 0),
      payload.status !== undefined ? (toBoolean(payload.status, true) ? 1 : 0) : Number(current.status || 0),
      payload.desc !== undefined ? String(payload.desc || '') : String(current.desc_text || ''),
      Date.now(),
      couponId,
    ]
  );

  const [nextRows] = await getPool().execute('SELECT * FROM admin_coupons WHERE id = ? LIMIT 1', [couponId]);
  return nextRows.length ? mapAdminCouponRow(nextRows[0]) : null;
};

const updateAdminCouponStatus = async (id, status) => {
  const couponId = Number(id || 0);
  if (!couponId) {
    return null;
  }

  await getPool().execute('UPDATE admin_coupons SET status = ?, updated_at = ? WHERE id = ?', [
    toBoolean(status, true) ? 1 : 0,
    Date.now(),
    couponId,
  ]);
  const [rows] = await getPool().execute('SELECT * FROM admin_coupons WHERE id = ? LIMIT 1', [couponId]);
  return rows.length ? mapAdminCouponRow(rows[0]) : null;
};

const deleteAdminCoupon = async (id) => {
  const couponId = Number(id || 0);
  if (!couponId) {
    return 0;
  }

  const [result] = await getPool().execute('DELETE FROM admin_coupons WHERE id = ? LIMIT 1', [couponId]);
  return Number(result.affectedRows || 0);
};

const mapAdminImageClassRow = (row) => ({
  id: Number(row.id || 0),
  name: String(row.name || ''),
  order: Number(row.sort_order || 50),
});

const listAdminImageClasses = async ({ page = 1, limit = 10 } = {}) => {
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const [[countRow]] = await getPool().query('SELECT COUNT(1) AS totalCount FROM admin_image_classes');
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM admin_image_classes
      ORDER BY sort_order ASC, id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `
  );

  return {
    list: rows.map(mapAdminImageClassRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminImageClass = async (payload = {}) => {
  const now = Date.now();
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('相册名称不能为空');
  }

  const [result] = await getPool().execute(
    'INSERT INTO admin_image_classes (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [name, Math.max(0, Math.trunc(toNumber(payload.order, 50))), now, now]
  );
  const [rows] = await getPool().execute('SELECT * FROM admin_image_classes WHERE id = ? LIMIT 1', [result.insertId]);
  return rows.length ? mapAdminImageClassRow(rows[0]) : null;
};

const updateAdminImageClass = async (id, payload = {}) => {
  const classId = Number(id || 0);
  if (!classId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_image_classes WHERE id = ? LIMIT 1', [classId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  const nextName = payload.name !== undefined ? String(payload.name || '').trim() : String(current.name || '').trim();
  if (!nextName) {
    throw new Error('相册名称不能为空');
  }

  await getPool().execute('UPDATE admin_image_classes SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?', [
    nextName,
    payload.order !== undefined ? Math.max(0, Math.trunc(toNumber(payload.order, 50))) : Number(current.sort_order || 50),
    Date.now(),
    classId,
  ]);
  const [nextRows] = await getPool().execute('SELECT * FROM admin_image_classes WHERE id = ? LIMIT 1', [classId]);
  return nextRows.length ? mapAdminImageClassRow(nextRows[0]) : null;
};

const deleteAdminImageClass = async (id) => {
  const classId = Number(id || 0);
  if (!classId) {
    return 0;
  }

  await getPool().execute('DELETE FROM admin_images WHERE image_class_id = ?', [classId]);
  const [result] = await getPool().execute('DELETE FROM admin_image_classes WHERE id = ? LIMIT 1', [classId]);
  return Number(result.affectedRows || 0);
};

const mapAdminImageRow = (row) => ({
  id: Number(row.id || 0),
  image_class_id: Number(row.image_class_id || 0),
  name: String(row.name || ''),
  url: String(row.url || ''),
  create_time: formatRealtimeOrTimestamp(row.created_at_realtime, row.created_at),
});

const listAdminImages = async ({ imageClassId = 0, page = 1, limit = 10 } = {}) => {
  const classId = Number(imageClassId || 0);
  const currentPage = Math.max(1, Number(page || 1));
  const pageSize = Math.max(1, Number(limit || 10));
  const offset = (currentPage - 1) * pageSize;
  const filters = classId ? 'WHERE image_class_id = ?' : '';
  const params = classId ? [classId] : [];
  const [[countRow]] = classId
    ? await getPool().execute('SELECT COUNT(1) AS totalCount FROM admin_images WHERE image_class_id = ?', [classId])
    : await getPool().query('SELECT COUNT(1) AS totalCount FROM admin_images');
  const [rows] = await getPool().execute(
    `
      SELECT *
      FROM admin_images
      ${filters}
      ORDER BY created_at DESC, id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    params
  );

  return {
    list: rows.map(mapAdminImageRow),
    totalCount: Number(countRow?.totalCount || 0),
  };
};

const createAdminImage = async (payload = {}) => {
  const now = Date.now();
  const imageClassId = Math.max(0, Number(payload.image_class_id || 0));
  const url = String(payload.url || '').trim();
  if (!url) {
    throw new Error('图片地址不能为空');
  }

  const [result] = await getPool().execute(
    'INSERT INTO admin_images (image_class_id, name, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [imageClassId, String(payload.name || '').trim() || '未命名图片', url, now, now]
  );
  const [rows] = await getPool().execute('SELECT * FROM admin_images WHERE id = ? LIMIT 1', [result.insertId]);
  return rows.length ? mapAdminImageRow(rows[0]) : null;
};

const updateAdminImage = async (id, payload = {}) => {
  const imageId = Number(id || 0);
  if (!imageId) {
    return null;
  }

  const [rows] = await getPool().execute('SELECT * FROM admin_images WHERE id = ? LIMIT 1', [imageId]);
  if (!rows.length) {
    return null;
  }

  const current = rows[0];
  await getPool().execute('UPDATE admin_images SET name = ?, updated_at = ? WHERE id = ?', [
    payload.name !== undefined ? String(payload.name || '').trim() : String(current.name || ''),
    Date.now(),
    imageId,
  ]);
  const [nextRows] = await getPool().execute('SELECT * FROM admin_images WHERE id = ? LIMIT 1', [imageId]);
  return nextRows.length ? mapAdminImageRow(nextRows[0]) : null;
};

const deleteAdminImages = async (ids = []) => {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((item) => Number(item || 0))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );

  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [result] = await getPool().execute(`DELETE FROM admin_images WHERE id IN (${placeholders})`, normalizedIds);
  return Number(result.affectedRows || 0);
};

const getAdminSysconfig = async () => {
  const [rows] = await getPool().execute('SELECT config_key, config_value FROM admin_sysconfig');
  let config = deepClone(DEFAULT_SYS_CONFIG);

  rows.forEach((row) => {
    const key = String(row.config_key || '');
    if (!key) {
      return;
    }
    const rawValue = row.config_value === undefined || row.config_value === null ? '' : String(row.config_value);
    let parsedValue = rawValue;
    try {
      parsedValue = JSON.parse(rawValue);
    } catch (_error) {
      parsedValue = rawValue;
    }

    if (parsedValue === null || parsedValue === undefined || parsedValue === '') {
      return;
    }

    if (key === 'sfExpressSender' && parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      && !Object.values(parsedValue).some((value) => String(value || '').trim())) {
      return;
    }

    if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
      config[key] = mergePlainObjects(config[key], parsedValue);
    } else {
      config[key] = parsedValue;
    }
  });

  return config;
};

const setAdminSysconfig = async (payload = {}) => {
  const current = await getAdminSysconfig();
  const next = mergePlainObjects(current, payload);
  const now = Date.now();

  await Promise.all(
    Object.keys(next).map((key) =>
      getPool().execute(
        `
          INSERT INTO admin_sysconfig (config_key, config_value, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)
        `,
        [key, JSON.stringify(next[key]), now, now]
      )
    )
  );

  return getAdminSysconfig();
};

const LEGAL_DOCUMENT_CONFIG = {
  'privacy-policy': { title: '隐私政策', configKey: 'privacyPolicyContent' },
  'user-agreement': { title: '用户协议', configKey: 'userAgreementContent' },
};

const getPublicLegalDocument = async (type) => {
  const document = LEGAL_DOCUMENT_CONFIG[String(type || '').trim()];
  if (!document) {
    return null;
  }

  const config = await getAdminSysconfig();
  return {
    type: String(type),
    title: document.title,
    content: String(config[document.configKey] || '').trim(),
  };
};

const updateAdminLegalDocument = async (type, content) => {
  const document = LEGAL_DOCUMENT_CONFIG[String(type || '').trim()];
  if (!document) {
    throw new Error('法律文档类型无效');
  }

  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    throw new Error('正文内容不能为空');
  }
  if (normalizedContent.length > 20000) {
    throw new Error('正文内容不能超过 20000 个字符');
  }

  await setAdminSysconfig({ [document.configKey]: normalizedContent });
  return getPublicLegalDocument(type);
};

const HOMEPAGE_SECTION_TARGETS = new Set(['recycling', 'buying']);
const HOMEPAGE_SECTION_MAX_COUNT = 20;
const HOMEPAGE_SECTION_MAX_ITEMS_PER_SECTION = 40;

const normalizeHomepageSectionId = (value, fallback) => {
  const normalized = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(normalized) ? normalized : fallback;
};

const normalizeHomepageSectionConfig = (value = {}, { publicAssets = false } = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const hasSections = Object.prototype.hasOwnProperty.call(source, 'sections') && Array.isArray(source.sections);
  const sourceSections = hasSections
    ? source.sections
    : [{
      id: 'section-default',
      title: source.sectionTitle || source.section_title || '购买&回收专区',
      items: Array.isArray(source.items) ? source.items : [],
    }];
  const sections = sourceSections
    .filter((section) => section && typeof section === 'object' && !Array.isArray(section))
    .slice(0, HOMEPAGE_SECTION_MAX_COUNT)
    .map((section, sectionIndex) => {
      const sectionId = normalizeHomepageSectionId(section.id, `section-${sectionIndex + 1}`);
      const items = (Array.isArray(section.items) ? section.items : [])
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .slice(0, HOMEPAGE_SECTION_MAX_ITEMS_PER_SECTION)
        .map((item, itemIndex) => {
          const legacyKey = String(item.key || '').trim();
          const targetSource = String(item.target || item.action || legacyKey || '').trim();
          const target = HOMEPAGE_SECTION_TARGETS.has(targetSource) ? targetSource : 'buying';
          const categorySectionKey = String(
            item.categorySectionKey || item.category_section_key || ''
          ).trim() || (target === 'recycling' ? CATEGORY_SCENES.RECYCLE : CATEGORY_SCENES.SALE);
          const fallbackId = legacyKey
            ? `entry-${legacyKey}-${itemIndex + 1}`
            : `${sectionId}-entry-${itemIndex + 1}`;
          const coverImage = String(item.coverImage || item.cover_image || '').trim();
          return {
            id: normalizeHomepageSectionId(item.id, fallbackId),
            title: String(item.title || '').trim(),
            coverImage: publicAssets ? toWebAssetUrl(coverImage) : coverImage,
            target,
            categorySectionKey,
          };
        });

      return {
        id: sectionId,
        title: String(section.title || section.sectionTitle || section.section_title || '').trim(),
        items,
      };
    });
  const firstSection = sections[0] || null;

  return {
    sections,
    sectionTitle: firstSection ? firstSection.title : '',
    items: firstSection
      ? firstSection.items.map((item) => ({ ...item, key: item.target }))
      : [],
  };
};

const getHomepageSectionConfig = async (options = {}) => {
  const config = await getAdminSysconfig();
  return normalizeHomepageSectionConfig(config.homepageSection, options);
};

const updateHomepageSectionConfig = async (payload = {}) => {
  const current = await getHomepageSectionConfig();
  const categorySections = await listAdminCategorySections({ includeDisabled: false });
  const sectionTargetMap = new Map(categorySections.map((section) => [
    section.key,
    section.targetScene === CATEGORY_SCENES.RECYCLE ? 'recycling' : 'buying',
  ]));
  let rawSections;
  if (Array.isArray(payload.sections)) {
    rawSections = payload.sections;
  } else {
    const currentSections = Array.isArray(current.sections) ? current.sections.map((section) => ({ ...section })) : [];
    const firstSection = currentSections[0] || { id: 'section-default', title: '购买&回收专区', items: [] };
    currentSections[0] = {
      ...firstSection,
      title: payload.sectionTitle !== undefined
        ? payload.sectionTitle
        : (payload.section_title !== undefined ? payload.section_title : firstSection.title),
      items: Array.isArray(payload.items) ? payload.items : firstSection.items,
    };
    rawSections = currentSections;
  }

  if (rawSections.length > HOMEPAGE_SECTION_MAX_COUNT) {
    throw new Error(`最多只能创建${HOMEPAGE_SECTION_MAX_COUNT}个分区`);
  }

  const sectionIds = new Set();
  const itemIds = new Set();
  rawSections.forEach((section, sectionIndex) => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      throw new Error(`第${sectionIndex + 1}个分区格式不正确`);
    }
    const sectionId = normalizeHomepageSectionId(section.id, '');
    const title = String(section.title || section.sectionTitle || section.section_title || '').trim();
    const items = Array.isArray(section.items) ? section.items : [];
    if (!sectionId || sectionIds.has(sectionId)) {
      throw new Error('分区标识无效或重复');
    }
    sectionIds.add(sectionId);
    if (!title) {
      throw new Error(`请输入第${sectionIndex + 1}个分区的标题`);
    }
    if (title.length > 30) {
      throw new Error('分区标题不能超过30个字符');
    }
    if (items.length > HOMEPAGE_SECTION_MAX_ITEMS_PER_SECTION) {
      throw new Error(`每个分区最多只能创建${HOMEPAGE_SECTION_MAX_ITEMS_PER_SECTION}个入口`);
    }
    items.forEach((item, itemIndex) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`第${sectionIndex + 1}个分区的第${itemIndex + 1}个入口格式不正确`);
      }
      const itemId = normalizeHomepageSectionId(item.id, '');
      const itemTitle = String(item.title || '').trim();
      const coverImage = String(item.coverImage || item.cover_image || '').trim();
      const target = String(item.target || item.action || item.key || '').trim();
      const categorySectionKey = String(
        item.categorySectionKey || item.category_section_key || ''
      ).trim() || (target === 'recycling' ? CATEGORY_SCENES.RECYCLE : CATEGORY_SCENES.SALE);
      if (!itemId || itemIds.has(itemId)) {
        throw new Error('入口标识无效或重复');
      }
      itemIds.add(itemId);
      if (!itemTitle) {
        throw new Error(`请输入第${sectionIndex + 1}个分区的第${itemIndex + 1}个入口标题`);
      }
      if (itemTitle.length > 20) {
        throw new Error('入口标题不能超过20个字符');
      }
      if (!coverImage) {
        throw new Error(`请上传“${itemTitle}”的封面图片`);
      }
      if (!HOMEPAGE_SECTION_TARGETS.has(target)) {
        throw new Error(`请选择“${itemTitle}”的入口功能`);
      }
      if (!sectionTargetMap.has(categorySectionKey)) {
        throw new Error(`“${itemTitle}”关联的分类不存在或未启用`);
      }
      if (sectionTargetMap.get(categorySectionKey) !== target) {
        throw new Error(`“${itemTitle}”的关联分类与入口类型不一致`);
      }
    });
  });

  const next = normalizeHomepageSectionConfig({ sections: rawSections });

  const now = Date.now();
  await getPool().execute(
    `
      INSERT INTO admin_sysconfig (config_key, config_value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)
    `,
    ['homepageSection', JSON.stringify(next), now, now]
  );
  return getHomepageSectionConfig();
};

const getRecycleTargetMapByStoredKeys = async (targetKeys = []) => {
  const normalizedKeys = Array.from(new Set(targetKeys.map((item) => String(item || '').trim()).filter(Boolean)));
  if (!normalizedKeys.length) {
    return new Map();
  }

  const numericIds = Array.from(
    new Set(
      normalizedKeys
        .filter((item) => /^\d+$/.test(item))
        .map((item) => Number(item))
        .filter((item) => item > 0)
    )
  );
  const conditions = [];
  const params = [];

  if (numericIds.length) {
    conditions.push(`id IN (${numericIds.map(() => '?').join(', ')})`);
    params.push(...numericIds);
  }

  conditions.push(`option_profile_key IN (${normalizedKeys.map(() => '?').join(', ')})`);
  params.push(...normalizedKeys);

  conditions.push(`category_key IN (${normalizedKeys.map(() => '?').join(', ')})`);
  params.push(...normalizedKeys);

  const [rows] = await getPool().execute(
    `
      SELECT id, category_key, option_profile_key, title
      FROM recycle_products
      WHERE status = 1 AND (${conditions.join(' OR ')})
      ORDER BY sort_order ASC, id ASC
    `,
    params
  );

  const byId = new Map();
  const byProfileKey = new Map();
  const byCategoryKey = new Map();
  rows.forEach((row) => {
    const idKey = String(Number(row.id || 0));
    const categoryKey = String(row.category_key || '').trim();
    const profileKey = String(row.option_profile_key || '').trim();

    if (idKey && idKey !== '0' && !byId.has(idKey)) {
      byId.set(idKey, row);
    }

    if (profileKey && !byProfileKey.has(profileKey)) {
      byProfileKey.set(profileKey, row);
    }

    if (categoryKey && !byCategoryKey.has(categoryKey)) {
      byCategoryKey.set(categoryKey, row);
    }
  });

  const targetMap = new Map();
  normalizedKeys.forEach((key) => {
    const matchedRow = byId.get(key) || byProfileKey.get(key) || byCategoryKey.get(key);
    if (!matchedRow) {
      return;
    }

    targetMap.set(key, {
      recycleProductCategoryKey: String(matchedRow.category_key || '').trim(),
      recycleProductProfileKey: String(matchedRow.option_profile_key || '').trim(),
      recycleProductId: Number(matchedRow.id || 0),
      recycleProductTitle: String(matchedRow.title || ''),
    });
  });

  return targetMap;
};

const getAdminPaymentBatchOrderStatus = (relatedOrders = []) => {
  const statuses = relatedOrders.map((order) => getAdminOrderDisplayStatus(order)).filter(Boolean);
  if (!statuses.length) {
    return 'noship';
  }

  const uniqueStatuses = Array.from(new Set(statuses));
  return uniqueStatuses.length === 1 ? uniqueStatuses[0] : 'partial';
};

const getAdminPaymentBatchShipStatus = (relatedOrders = []) => {
  if (!relatedOrders.length) {
    return 'pending';
  }

  const receivedCount = relatedOrders.filter((order) => {
    const orderStatus = getAdminOrderDisplayStatus(order);
    return ['received', 'finish'].includes(orderStatus) || String(order.ship_status || '').trim() === 'received';
  }).length;

  if (receivedCount === relatedOrders.length) {
    return 'received';
  }
  return receivedCount > 0 ? 'partial' : 'pending';
};

const listPublicProducts = async ({ scene = 'buy' } = {}) => {
  const filters = ['p.status = 1', 'p.is_deleted = 0'];
  const params = [];

  if (scene === 'recycle') {
    filters.push('p.recyclable = 1');
  }

  const [rows] = await getPool().execute(
    `
      SELECT p.*
      FROM products p
      WHERE ${filters.join(' AND ')}
      ORDER BY p.release_order DESC, p.updated_at DESC, p.id DESC
    `,
    params
  );

  const imageMap = await getProductImageMap(rows.map((row) => row.id));
  const imageGroups = await getProductImageGroups(rows.map((row) => row.id));
  const recycleTargetCategoryMaps = await getRecycleCategoryMaps({ includeDisabled: true });
  const recycleTargetMap = await getRecycleTargetMapByStoredKeys(rows.map((row) => row.recycle_target_category_key));

  return rows.map((row) => {
    const productId = Number(row.id || 0);
    const productImages = imageGroups.get(productId) || [];
    const heroImageItem = productImages.find((item) => item.imageType === 'hero' || item.isMain);
    const coverSource = String(row.hero_image || '').trim() || heroImageItem?.imageUrl || imageMap.get(productId) || '';
    const heroImage = toWebAssetUrl(coverSource);
    const detailImages = productImages
      .filter((item) => item.imageType !== 'hero' && item.imageType !== 'cover')
      .map((item) => toWebAssetUrl(item.imageUrl))
      .filter(Boolean);
    const price = Number(row.price || 0);
    const recyclePrice = Number(row.recycle_price || 0);
    const recycleTargetCategoryKey = String(row.recycle_target_category_key || '').trim();
    const recycleTarget = recycleTargetMap.get(recycleTargetCategoryKey) || null;
    const recycleTargetResolvedCategoryKey = recycleTarget
      ? String(recycleTarget.recycleProductCategoryKey || '').trim()
      : recycleTargetCategoryKey;
    const recycleTargetCategory = recycleTargetCategoryMaps.byKey.get(recycleTargetResolvedCategoryKey) || null;
    const recycleMode = Boolean(row.recyclable) ? 'direct' : recycleTargetCategoryKey ? 'category' : 'none';
    return {
      id: productId,
      productNo: buildProductNo(row.id),
      categoryKey: String(row.category_key || ''),
      modelKey: String(row.model_key || ''),
      platform: String(row.platform || ''),
      title: String(row.title || ''),
      subtitle: String(row.subtitle || ''),
      price,
      originPrice: Number(row.origin_price || price),
      recyclePrice,
      displayPrice: scene === 'recycle' && recyclePrice > 0 ? recyclePrice : price,
      recyclable: Boolean(row.recyclable),
      recycleMode,
      recycleTargetCategoryKey,
      recycleTargetCategoryName: recycleTargetCategory ? recycleTargetCategory.name : '',
      recycleTargetRecycleProductId: recycleTarget ? recycleTarget.recycleProductId : null,
      recycleTargetRecycleProductTitle: recycleTarget ? recycleTarget.recycleProductTitle : '',
      recycleTargetOptionProfileKey: recycleTarget ? recycleTarget.recycleProductProfileKey : '',
      inStock: Boolean(row.in_stock) && Number(row.stock || 0) > Number(row.reserved_stock || 0),
      stock: Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0)),
      coverText: String(row.cover_text || ''),
      coverTitle: String(row.cover_title || ''),
      coverImage: String(coverSource || ''),
      webCoverImage: heroImage,
      heroImage,
      detailImages: detailImages.length ? detailImages : (heroImage ? [heroImage] : []),
      premiumCondition: Boolean(row.premium_condition),
      certifiedPrice: Boolean(row.certified_price),
      releaseOrder: Number(row.release_order || 0),
      tagText: String(row.tag_text || ''),
      heroTheme: String(row.hero_theme || ''),
      heroAccent: String(row.hero_accent || ''),
      editionLabel: String(row.edition_label || ''),
      featureTags: safeParseJsonArray(row.feature_tags),
      shoppingTextA: String(row.shopping_textA || ''),
      shoppingTextB: getProductShoppingTextB(row),
      shoppingTextC: String(row.shopping_textC || ''),
      description: getProductDescriptionText(row),
      content: String(row.content || ''),
      status: Number(row.status || 0),
      updatedAt: Number(row.updated_at || 0),
    };
  });
};

const getPublicProductById = async (id) => {
  const productId = Number(id || 0);
  if (!productId) {
    return null;
  }

  const items = await listPublicProducts({ scene: 'buy' });
  return items.find((item) => item.id === productId) || null;
};

const initAdminDatabase = async () => {
  await getPool().query(createIdentifierSequencesTableSql);
  await getPool().query(createUserActivityEventsTableSql);
  await getPool().query(createUserOnlineSessionsTableSql);
  await getPool().query(createAdminUsersTableSql);
  await getPool().query(createStaffTableSql);
  await getPool().query(createStaffPermissionsTableSql);
  await getPool().query(createSuperadminKeyTableSql);
  await getPool().query(createInventoryManagementTableSql);
  await getPool().query(createInventoryManagementColumnsTableSql);
  await getPool().query(createInventoryColumnPermissionsTableSql);
  await getPool().query(createInventoryCalculationsTableSql);
  await getPool().query(createInventoryOrderLinksTableSql);
  await renameInventoryColumnIfNeeded('august_number', 'inventory_number');
  await ensureColumn({ tableName: 'inventory_management', name: 'inspection_report', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER id" });
  await ensureColumn({ tableName: 'inventory_management', name: 'inventory_number', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER inspection_report" });
  await ensureColumn({ tableName: 'inventory_management', name: 'sf_express_number', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER inventory_number" });
  await ensureColumn({ tableName: 'inventory_management', name: 'payment_status', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER sf_express_number" });
  await ensureColumn({ tableName: 'inventory_management', name: 'machine_status', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER payment_status" });
  await ensureColumn({ tableName: 'inventory_management', name: 'promotion_source', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER machine_status" });
  await ensureColumn({ tableName: 'inventory_management', name: 'recycle_communication_platform', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER promotion_source" });
  await ensureColumn({ tableName: 'inventory_management', name: 'recycle_id', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER recycle_communication_platform" });
  await ensureColumn({ tableName: 'inventory_management', name: 'recycle_address', definition: 'TEXT AFTER recycle_id' });
  await ensureColumn({ tableName: 'inventory_management', name: 'communication_price', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER recycle_address" });
  await ensureColumn({ tableName: 'inventory_management', name: 'paid_price', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER communication_price" });
  await ensureColumn({ tableName: 'inventory_management', name: 'recycle_freight', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER paid_price" });
  await ensureColumn({ tableName: 'inventory_management', name: 'final_sale_price', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER recycle_freight" });
  await ensureColumn({ tableName: 'inventory_management', name: 'sale_freight', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER final_sale_price" });
  await ensureColumn({ tableName: 'inventory_management', name: 'platform_fee', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER sale_freight" });
  await ensureColumn({ tableName: 'inventory_management', name: 'profit', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER platform_fee" });
  await ensureColumn({ tableName: 'inventory_management', name: 'sale_channel', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER profit" });
  await ensureColumn({ tableName: 'inventory_management', name: 'sale_id', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER sale_channel" });
  await ensureColumn({ tableName: 'inventory_management', name: 'sale_address', definition: 'TEXT AFTER sale_id' });
  await ensureColumn({ tableName: 'inventory_management', name: 'created_time_text', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER sale_address" });
  await ensureColumn({ tableName: 'inventory_management', name: 'remark_info', definition: 'TEXT AFTER created_time_text' });
  await ensureColumn({ tableName: 'inventory_management', name: 'inspection_result', definition: 'TEXT AFTER remark_info' });
  await ensureColumn({ tableName: 'inventory_management', name: 'custom_fields', definition: 'TEXT AFTER inspection_result' });
  await ensureColumn({ tableName: 'inventory_management_columns', name: 'fixed_position', definition: 'VARCHAR(5) DEFAULT NULL AFTER is_custom' });
  await ensureColumn({ tableName: 'inventory_management_columns', name: 'field_type', definition: "VARCHAR(16) NOT NULL DEFAULT 'text' AFTER fixed_position" });
  await ensureColumn({ tableName: 'inventory_management_columns', name: 'select_options', definition: 'TEXT AFTER fixed_position' });
  await ensureColumn({ tableName: 'inventory_management_calculations', name: 'calculation_type', definition: "VARCHAR(16) NOT NULL DEFAULT 'number' AFTER expression_json" });
  await ensureColumn({ tableName: 'inventory_management_column_permissions', name: 'is_editable', definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER is_visible' });
  await ensureInventoryColumns();
  await normalizeInventoryColumnSortOrders();
  await initializeInventoryColumnFixedPositions();
  await migrateLegacyInventoryTimeCalculations();
  await initializeInventoryCalculations();
  await getPool().query(createUserLevelsTableSql);
  await getPool().query(createAdminCategorySectionsTableSql);
  await getPool().query(createAdminCategoriesTableSql);
  await getPool().query(createAdminNoticesTableSql);
  await getPool().query(createAdminCouponsTableSql);
  await getPool().query(createAdminImageClassesTableSql);
  await getPool().query(createAdminImagesTableSql);
  await getPool().query(createAdminSysconfigTableSql);
  await getPool().query(createAdminGoodsCommentsTableSql);
  await getPool().query(createContentPagesTableSql);
  await getPool().query(createContentPageInteractionsTableSql);
  await getPool().query(createHomepageBannersTableSql);
  await ensureTimestampRealtimeColumns('identifier_sequences', ['updated_at']);
  await ensureTimestampRealtimeColumns('admin_users', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('staff', ['created_at', 'updated_at', 'last_login_at']);
  await ensureTimestampRealtimeColumns('staff_permissions', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('inventory_management_column_permissions', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('superadmin_key', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('user_levels', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('admin_category_sections', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('admin_categories', ['created_at', 'updated_at']);
  await ensureColumn({ tableName: 'admin_categories', name: 'section_key', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER scene" });
  await ensureTimestampRealtimeColumns('admin_notices', ['created_at', 'updated_at']);
  await ensureColumn({ tableName: 'admin_notices', name: 'image_urls', definition: 'LONGTEXT AFTER content' });
  await ensureTimestampRealtimeColumns('admin_coupons', ['start_time', 'end_time', 'created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('admin_image_classes', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('admin_images', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('admin_sysconfig', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('admin_goods_comments', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('content_pages', ['created_at', 'updated_at']);
  await ensureTimestampRealtimeColumns('homepage_banners', ['created_at', 'updated_at']);
  await ensureColumn({ tableName: 'admin_users', name: 'uid', definition: 'VARCHAR(32) DEFAULT NULL AFTER username' });
  await ensureColumn({ tableName: 'staff', name: 'username', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER id" });
  await ensureColumn({ tableName: 'staff', name: 'name', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER username" });
  await alterColumnIfNeeded({
    tableName: 'staff',
    name: 'name',
    definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER username",
    shouldAlter: (column) => String(column.column_type || '').toLowerCase() !== 'varchar(128)',
  });
  await ensureColumn({ tableName: 'staff', name: 'phone', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER name" });
  await ensureColumn({ tableName: 'staff', name: 'email', definition: 'VARCHAR(128) DEFAULT NULL AFTER phone' });
  await alterColumnIfNeeded({
    tableName: 'staff',
    name: 'email',
    definition: 'VARCHAR(128) DEFAULT NULL AFTER phone',
    shouldAlter: (column) => String(column.is_nullable || '').toUpperCase() !== 'YES',
  });
  await getPool().execute("UPDATE staff SET email = NULL WHERE email = ''");
  await ensureColumn({ tableName: 'staff', name: 'password_hash', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER email" });
  await ensureColumn({ tableName: 'staff', name: 'avatar', definition: "VARCHAR(1024) NOT NULL DEFAULT '' AFTER password_hash" });
  await ensureColumn({ tableName: 'staff', name: 'permission', definition: "VARCHAR(32) NOT NULL DEFAULT '访客' AFTER avatar" });
  await ensureColumn({ tableName: 'staff', name: 'access_paths', definition: 'TEXT DEFAULT NULL AFTER permission' });
  await ensureColumn({ tableName: 'staff', name: 'access_rules', definition: 'TEXT DEFAULT NULL AFTER access_paths' });
  await ensureColumn({ tableName: 'staff', name: 'created_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER permission' });
  await ensureColumn({ tableName: 'staff', name: 'updated_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at' });
  await ensureColumn({ tableName: 'staff', name: 'last_login_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER updated_at' });
  await ensureColumn({ tableName: 'staff', name: 'session_version', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER last_login_at' });
  await migrateLegacyStaffPermissions();
  await ensureColumn({ tableName: 'superadmin_key', name: 'staff_id', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER id' });
  await ensureColumn({ tableName: 'superadmin_key', name: 'username', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER staff_id" });
  await ensureColumn({ tableName: 'superadmin_key', name: 'password_hash', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER username" });
  await ensureColumn({ tableName: 'superadmin_key', name: 'created_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER password_hash' });
  await ensureColumn({ tableName: 'superadmin_key', name: 'updated_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER created_at' });
  await ensureColumn({ tableName: 'content_pages', name: 'title', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER id" });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'title_tag',
    definition: "VARCHAR(100) NOT NULL DEFAULT '' AFTER title",
  });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'title_tag_image',
    definition: "VARCHAR(1024) NOT NULL DEFAULT '' AFTER title_tag",
  });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'page_type',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'tutorial' AFTER title_tag_image",
  });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'tutorial_category_id',
    definition: 'BIGINT NOT NULL DEFAULT 0 AFTER page_type',
  });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'tutorial_tone',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'blue' AFTER tutorial_category_id",
  });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'cover_image',
    definition: 'LONGTEXT AFTER tutorial_tone',
  });
  await alterColumnIfNeeded({
    tableName: 'content_pages',
    name: 'cover_image',
    definition: 'LONGTEXT AFTER tutorial_tone',
    shouldAlter: (column) => String(column.column_type || '').toLowerCase() !== 'longtext',
  });
  await ensureColumn({ tableName: 'content_pages', name: 'content_html', definition: 'LONGTEXT AFTER cover_image' });
  await ensureColumn({ tableName: 'content_pages', name: 'pages_json', definition: 'LONGTEXT AFTER content_html' });
  await ensureColumn({ tableName: 'content_pages', name: 'end_link_product_id', definition: 'BIGINT DEFAULT NULL AFTER content_html' });
  await ensureColumn({ tableName: 'content_pages', name: 'end_link_category_key', definition: "VARCHAR(64) DEFAULT NULL AFTER end_link_product_id" });
  await ensureColumn({ tableName: 'content_pages', name: 'end_link_text', definition: "VARCHAR(128) NOT NULL DEFAULT '立即下单' AFTER end_link_product_id" });
  await ensureColumn({ tableName: 'content_pages', name: 'view_count', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER end_link_text' });
  await ensureColumn({ tableName: 'content_pages', name: 'like_count', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER view_count' });
  await ensureColumn({ tableName: 'content_pages', name: 'favorite_count', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER like_count' });
  await ensureColumn({ tableName: 'content_pages', name: 'share_count', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER favorite_count' });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'show_in_hot',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER content_html',
  });
  await ensureColumn({
    tableName: 'content_pages',
    name: 'status',
    definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER show_in_hot',
  });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'image_url',
    definition: "VARCHAR(1024) NOT NULL DEFAULT '' AFTER id",
  });
  await ensureColumn({ tableName: 'homepage_banners', name: 'page_id', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER image_url' });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'target_page_id',
    definition: 'BIGINT DEFAULT NULL AFTER page_id',
  });
  await alterColumnIfNeeded({
    tableName: 'homepage_banners',
    name: 'target_page_id',
    definition: 'BIGINT DEFAULT NULL AFTER page_id',
    shouldAlter: (column) => String(column.is_nullable || '').toUpperCase() !== 'YES' || String(column.column_default || '') === '0',
  });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'is_tutorial_link',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER target_page_id',
  });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'content_enabled',
    definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER is_tutorial_link',
  });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'hide_title',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER content_enabled',
  });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'sort_order',
    definition: 'INT NOT NULL DEFAULT 50 AFTER page_id',
  });
  await ensureColumn({
    tableName: 'homepage_banners',
    name: 'status',
    definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order',
  });
  await ensureIndex({
    tableName: 'admin_users',
    indexName: 'uniq_admin_users_uid',
    definition: 'UNIQUE INDEX uniq_admin_users_uid (uid)',
  });
  await ensureIndex({
    tableName: 'staff',
    indexName: 'uniq_staff_username',
    definition: 'UNIQUE INDEX uniq_staff_username (username)',
  });
  await ensureIndex({
    tableName: 'staff',
    indexName: 'uniq_staff_phone',
    definition: 'UNIQUE INDEX uniq_staff_phone (phone)',
  });
  await ensureIndex({
    tableName: 'staff',
    indexName: 'uniq_staff_email',
    definition: 'UNIQUE INDEX uniq_staff_email (email)',
  });
  await ensureIndex({
    tableName: 'superadmin_key',
    indexName: 'uniq_superadmin_key_staff_id',
    definition: 'UNIQUE INDEX uniq_superadmin_key_staff_id (staff_id)',
  });
  await ensureIndex({
    tableName: 'superadmin_key',
    indexName: 'uniq_superadmin_key_username',
    definition: 'UNIQUE INDEX uniq_superadmin_key_username (username)',
  });
  await ensureIndex({
    tableName: 'content_pages',
    indexName: 'idx_content_pages_status_updated_at',
    definition: 'INDEX idx_content_pages_status_updated_at (status, updated_at)',
  });
  await getPool().execute(
    `
      UPDATE content_pages
      SET page_type = ?
      WHERE id IN (SELECT page_id FROM homepage_banners WHERE page_id > 0)
    `,
    [CONTENT_PAGE_TYPE_HOMEPAGE_BANNER]
  );
  await getPool().execute(
    `
      UPDATE content_pages
      SET page_type = ?
      WHERE id = 1
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL]
  );
  await getPool().execute(
    `
      UPDATE content_pages
      SET page_type = ?
      WHERE page_type = ? AND id <> 1
    `,
    [CONTENT_PAGE_TYPE_TUTORIAL_CATEGORY, CONTENT_PAGE_TYPE_TUTORIAL]
  );
  await ensureTutorialDirectorySeedData();
  await ensureIndex({
    tableName: 'homepage_banners',
    indexName: 'idx_homepage_banners_status_sort',
    definition: 'INDEX idx_homepage_banners_status_sort (status, sort_order, id)',
  });
  await ensureIndex({
    tableName: 'homepage_banners',
    indexName: 'idx_homepage_banners_page_id',
    definition: 'INDEX idx_homepage_banners_page_id (page_id)',
  });
  await ensureIndex({
    tableName: 'homepage_banners',
    indexName: 'idx_homepage_banners_target_page_id',
    definition: 'INDEX idx_homepage_banners_target_page_id (target_page_id)',
  });
  await getPool().execute('UPDATE homepage_banners SET target_page_id = NULL WHERE target_page_id = 0');
  await getPool().execute(
    'UPDATE homepage_banners SET is_tutorial_link = 1 WHERE target_page_id IS NOT NULL AND target_page_id > 0 AND is_tutorial_link = 0'
  );

  await ensureColumn({ tableName: 'purchase_orders', name: 'payment_batch_id', definition: 'BIGINT DEFAULT NULL AFTER out_trade_no' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'payment_batch_size', definition: 'INT NOT NULL DEFAULT 1 AFTER payment_batch_id' });
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
  await ensureColumn({ tableName: 'purchase_orders', name: 'ship_data', definition: 'LONGTEXT AFTER payment_transaction_id' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_service_status', definition: "VARCHAR(64) NOT NULL DEFAULT 'unknown' AFTER wechat_order_synced_at" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_service_status_error', definition: "VARCHAR(512) NOT NULL DEFAULT '' AFTER wechat_service_status" });
  await ensureColumn({ tableName: 'purchase_orders', name: 'wechat_service_status_synced_at', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER wechat_service_status_error' });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'determine_batches',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_batch_size',
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'ship_status',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER ship_data",
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'closed',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER ship_status',
  });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'refund_status',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER closed",
  });
  await ensureColumn({ tableName: 'purchase_orders', name: 'refund_data', definition: 'LONGTEXT AFTER refund_status' });
  await ensureColumn({ tableName: 'purchase_orders', name: 'refund_refuse', definition: 'LONGTEXT AFTER refund_data' });
  await ensureColumn({
    tableName: 'purchase_orders',
    name: 'admin_order_status',
    definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER refund_refuse",
  });
  await ensureIndex({
    tableName: 'purchase_orders',
    indexName: 'idx_purchase_orders_determine_batches_created_at',
    definition: 'INDEX idx_purchase_orders_determine_batches_created_at (determine_batches, created_at)',
  });

  await ensureColumn({ tableName: 'users', name: 'uid', definition: 'VARCHAR(32) DEFAULT NULL AFTER union_id' });
  await ensureColumn({ tableName: 'users', name: 'user_level_id', definition: 'BIGINT DEFAULT NULL AFTER uid' });
  await ensureColumn({ tableName: 'users', name: 'username', definition: "VARCHAR(64) NOT NULL DEFAULT '' AFTER user_level_id" });
  await ensureColumn({ tableName: 'users', name: 'email', definition: "VARCHAR(128) NOT NULL DEFAULT '' AFTER phone" });
  await ensureColumn({ tableName: 'users', name: 'status', definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER email' });
  await ensureIndex({
    tableName: 'users',
    indexName: 'idx_users_status_created_at',
    definition: 'INDEX idx_users_status_created_at (status, created_at)',
  });
  await ensureIndex({
    tableName: 'users',
    indexName: 'idx_users_user_level_id',
    definition: 'INDEX idx_users_user_level_id (user_level_id)',
  });

  await ensureColumn({ tableName: 'products', name: 'origin_price', definition: 'DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER price' });
  await ensureColumn({ tableName: 'products', name: 'recycle_price', definition: 'DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER origin_price' });
  await ensureColumn({ tableName: 'products', name: 'product_id', definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER id" });
  await ensureColumn({
    tableName: 'products',
    name: 'recycle_target_category_key',
    definition: "VARCHAR(32) NOT NULL DEFAULT '' AFTER recyclable",
  });
  await ensureColumn({ tableName: 'products', name: 'stock', definition: 'INT NOT NULL DEFAULT 1 AFTER in_stock' });
  await ensureColumn({ tableName: 'products', name: 'reserved_stock', definition: 'INT NOT NULL DEFAULT 0' });
  await ensureColumn({ tableName: 'products', name: 'min_stock', definition: 'INT NOT NULL DEFAULT 1 AFTER stock' });
  await alterColumnIfNeeded({
    tableName: 'products',
    name: 'stock',
    definition: 'INT NOT NULL DEFAULT 1',
    shouldAlter: (column) => String(column.column_default ?? '') !== '1',
  });
  await alterColumnIfNeeded({
    tableName: 'products',
    name: 'min_stock',
    definition: 'INT NOT NULL DEFAULT 1',
    shouldAlter: (column) => String(column.column_default ?? '') !== '1',
  });
  await ensureColumn({ tableName: 'products', name: 'unit', definition: "VARCHAR(32) NOT NULL DEFAULT '件' AFTER min_stock" });
  await ensureColumn({ tableName: 'products', name: 'description', definition: "VARCHAR(1000) NOT NULL DEFAULT '' AFTER subtitle" });
  await alterColumnIfNeeded({
    tableName: 'products',
    name: 'description',
    definition: "VARCHAR(1000) NOT NULL DEFAULT ''",
    shouldAlter: (column) => String(column.column_type || '').toLowerCase() !== 'varchar(1000)',
  });
  await ensureColumn({ tableName: 'products', name: 'shopping_textA', definition: "VARCHAR(255) NOT NULL DEFAULT '' AFTER feature_tags" });
  await ensureColumn({ tableName: 'products', name: 'shopping_textB', definition: 'TEXT AFTER shopping_textA' });
  await ensureColumn({ tableName: 'products', name: 'shopping_textC', definition: 'TEXT AFTER shopping_textB' });
  await ensureColumn({ tableName: 'products', name: 'content', definition: 'LONGTEXT AFTER shopping_textC' });
  await ensureColumn({ tableName: 'products', name: 'stock_display', definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER unit' });
  await ensureColumn({ tableName: 'products', name: 'ischeck', definition: 'TINYINT NOT NULL DEFAULT 1 AFTER stock_display' });

  await getPool().query(
    `
      UPDATE products
      SET
        origin_price = CASE WHEN origin_price = 0 THEN price ELSE origin_price END,
        recycle_price = CASE WHEN recycle_price = 0 THEN price ELSE recycle_price END,
        stock = GREATEST(COALESCE(stock, 0), 0),
        min_stock = CASE WHEN min_stock = 0 THEN 1 ELSE min_stock END,
        unit = CASE WHEN unit = '' THEN '件' ELSE unit END,
        description = CASE WHEN description = '' THEN COALESCE(shopping_textB, '') ELSE description END,
        ischeck = COALESCE(ischeck, 1),
        status = CASE WHEN stock <= 0 OR stock <= reserved_stock THEN 3 ELSE status END
    `
  );

  const now = Date.now();
  const [categoryRows] = await getPool().query('SELECT id FROM admin_categories LIMIT 1');
  if (!categoryRows.length) {
    for (const category of DEFAULT_CATEGORY_CONFIGS) {
      await getPool().execute(
        `
          INSERT INTO admin_categories (scene, section_key, category_key, name, sort_order, theme, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `,
        [category.scene, category.scene, category.key, category.name, category.sort, category.theme, now, now]
      );
    }
  }
  await initializeAdminCategorySections();

  const [productCategoryRows] = await getPool().query(
    'SELECT id, title, category_key, platform, hero_theme FROM products'
  );
  let productCategoryChanged = false;
  for (const row of productCategoryRows) {
    const currentCategoryKey = String(row.category_key || '').trim();
    const nextCategoryKey = currentCategoryKey || guessLegacyCategoryKey(row);
    const nextPlatform = String(row.platform || '').trim() || getCategoryPlatformByKey(nextCategoryKey);
    const nextHeroTheme = String(row.hero_theme || '').trim() || getCategoryHeroThemeByKey(nextCategoryKey);
    const currentPlatform = String(row.platform || '').trim();
    const currentHeroTheme = String(row.hero_theme || '').trim();

    if (
      currentCategoryKey === nextCategoryKey &&
      currentPlatform === nextPlatform &&
      currentHeroTheme === nextHeroTheme
    ) {
      continue;
    }

    await getPool().execute(
      'UPDATE products SET category_key = ?, platform = ?, hero_theme = ?, updated_at = ? WHERE id = ?',
      [nextCategoryKey, nextPlatform, nextHeroTheme, now, Number(row.id || 0)]
    );
    productCategoryChanged = true;
  }
  const categoryIdentifiersMigrated = await migrateAdminCategoryIdentifiers();
  if (productCategoryChanged || categoryIdentifiersMigrated) {
    await exportProductCatalogSnapshot();
  }
  await backfillAdminUids();
  const [rows] = await getPool().execute('SELECT * FROM admin_users WHERE username = ? LIMIT 1', [DEFAULT_ADMIN_USERNAME]);
  if (!rows.length) {
    await getPool().execute(
      `
        INSERT INTO admin_users (username, password_hash, nickname, avatar, status, created_at, updated_at)
        VALUES (?, ?, ?, '', 1, ?, ?)
      `,
      [DEFAULT_ADMIN_USERNAME, hashPassword(DEFAULT_ADMIN_PASSWORD), '超级管理员', now, now]
    );
  }
  await backfillAdminUids();
  // 优先查找默认账号；若用户名已被管理员修改，则复用现有超级管理员记录。
  const [staffRows] = await getPool().execute(
    'SELECT * FROM staff WHERE LOWER(username) = ? OR permission = ? ORDER BY (LOWER(username) = ?) DESC, id ASC LIMIT 1',
    [normalizeStaffUsername(DEFAULT_ADMIN_USERNAME), STAFF_PERMISSIONS.SUPERADMIN, normalizeStaffUsername(DEFAULT_ADMIN_USERNAME)]
  );
  let adminStaffId = 0;
  if (!staffRows.length) {
    const [staffInsertResult] = await getPool().execute(
      `
        INSERT INTO staff (username, name, phone, email, password_hash, avatar, permission, created_at, updated_at, last_login_at)
        VALUES (?, ?, '', NULL, ?, '', ?, ?, ?, 0)
      `,
      [
        normalizeStaffUsername(DEFAULT_ADMIN_USERNAME),
        '超级管理员',
        hashPassword(DEFAULT_SUPERADMIN_PASSWORD),
        STAFF_PERMISSIONS.SUPERADMIN,
        now,
        now,
      ]
    );
    adminStaffId = Number(staffInsertResult.insertId || 0);
  } else {
    adminStaffId = Number(staffRows[0].id || 0);
  }

  if (adminStaffId > 0) {
    const adminStaff = staffRows[0] || {
      username: normalizeStaffUsername(DEFAULT_ADMIN_USERNAME),
      password_hash: hashPassword(DEFAULT_SUPERADMIN_PASSWORD),
    };
    await getPool().execute(
      `
        INSERT INTO superadmin_key (staff_id, username, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          password_hash = VALUES(password_hash),
          updated_at = VALUES(updated_at)
      `,
      [
        adminStaffId,
        normalizeStaffUsername(adminStaff.username),
        String(adminStaff.password_hash || hashPassword(DEFAULT_SUPERADMIN_PASSWORD)),
        now,
        now,
      ]
    );
  }

  const [[userLevelCountRow]] = await getPool().query('SELECT COUNT(1) AS totalCount FROM user_levels');
  if (!Number(userLevelCountRow?.totalCount || 0)) {
    for (const level of DEFAULT_USER_LEVELS) {
      await getPool().execute(
        `
          INSERT INTO user_levels (name, level, discount, max_price, max_times, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [level.name, level.level, level.discount, level.max_price, level.max_times, level.status, now, now]
      );
    }
  }

  const [[imageClassCountRow]] = await getPool().query('SELECT COUNT(1) AS totalCount FROM admin_image_classes');
  if (!Number(imageClassCountRow?.totalCount || 0)) {
    await getPool().execute(
      'INSERT INTO admin_image_classes (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['默认相册', 50, now, now]
    );
  }

  const [configRows] = await getPool().execute('SELECT config_key FROM admin_sysconfig');
  const existingConfigKeys = new Set(configRows.map((row) => String(row.config_key || '')));
  for (const key of Object.keys(DEFAULT_SYS_CONFIG)) {
    if (!existingConfigKeys.has(key)) {
      await getPool().execute(
        'INSERT INTO admin_sysconfig (config_key, config_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [key, JSON.stringify(DEFAULT_SYS_CONFIG[key]), now, now]
      );
    }
  }

  await ensureHomepageTutorialBanner();
  await exportProductCatalogSnapshot();
};

module.exports = {
  STAFF_PERMISSIONS,
  checkGoods,
  createAdminCategory,
  createAdminCategorySection,
  createAdminContentPage,
  createAdminCoupon,
  createAdminGoods,
  createAdminImage,
  createAdminImageClass,
  createAdminHomepageBanner,
  createAdminInventoryColumn,
  createAdminInventoryManagement,
  createNextInventoryNumber,
  createAdminNotice,
  createAdminStaff,
  createAdminUserLevel,
  createStaffRegistration,
  deleteAdminCategory,
  deleteAdminCategorySection,
  deleteAdminContentPage,
  deleteAdminContentPages,
  deleteAdminCoupon,
  deleteAdminHomepageBanner,
  deleteAdminImages,
  deleteAdminPaymentBatches,
  deleteAdminInventoryColumn,
  deleteAdminInventoryManagement,
  deleteAdminInventoryManagementBatch,
  deleteAdminImageClass,
  deleteAdminNotice,
  deleteAdminUser,
  deleteAdminStaff,
  deleteAdminOrders,
  deleteAdminUserLevel,
  destroyGoods,
  destroyGoodsWithConnection,
  exportProductCatalogSnapshot,
  getAdminById,
  getAdminStaffPermissions,
  getAdminContentPageById,
  getAdminGoodsById,
  getAdminHomepageBannerById,
  getAdminPrimaryHomepageBanner,
  getHomepageSectionConfig,
  getAdminOrderShipInfo,
  getAdminOrderById,
  getAdminSysconfig,
  getDashboardStatistics1,
  getDashboardStatistics2,
  getDashboardAddressLocationStatistics,
  getDashboardOrderTimeStatistics,
  getDashboardStatistics3,
  getDashboardUserEngagementStatistics,
  getDashboardUserActivityStatistics,
  getPublicContentPageById,
  getPublicTutorialInteractionStats,
  listUserTutorialInteractions,
  getPublicNoticeById,
  getPublicProductById,
  handleAdminOrderRefund,
  updateAdminPaymentBatchStatus,
  updateAdminOrderStatus,
  updateAdminStaffPermissions,
  recordUserActivityEvent,
  recordUserOnlineSession,
  recordPublicTutorialShare,
  recordPublicTutorialView,
  initAdminDatabase,
  listAdminCategories,
  listAdminTutorialEndLinkCategoryOptions,
  listAdminCategorySections,
  listAdminContentPages,
  listAdminCoupons,
  listAdminExpressCompanies,
  listAdminGoods,
  listAdminGoodsComments,
  listAdminHomepageBanners,
  listAdminImageClasses,
  listAdminInventoryColumns,
  listAdminInventoryColumnPermissions,
  listAdminInventoryCalculations,
  listAdminInventoryManagement,
  exportAdminInventoryManagement,
  listAdminImages,
  listAdminNotices,
  listAdminPaymentBatches,
  listAdminOrders,
  listAdminStaff,
  listAdminUsers,
  listAdminUserLevels,
  getInventoryFinanceStatistics,
  getDashboardFeeStatistics,
  getPublicLegalDocument,
  upsertAdminInventoryCalculation,
  deleteAdminInventoryCalculation,
  listPublicCategoryConfigs,
  listPublicCategorySections,
  listPublicHomepageBanners,
  listPublicNotices,
  listPublicTutorialArticles,
  listPublicTutorialCategories,
  listPublicProducts,
  reviewAdminGoodsComment,
  restoreGoods,
  setAdminGoodsBanners,
  setAdminSysconfig,
  shipAdminOrder,
  softDeleteGoods,
  sortAdminCategories,
  togglePublicTutorialInteraction,
  updateAdminCategory,
  updateAdminCategorySection,
  updateAdminCategoryStatus,
  updateAdminContentPage,
  updateAdminContentPageStatus,
  updateAdminCoupon,
  updateAdminGoods,
  updateAdminGoodsCommentStatus,
  updateAdminHomepageBanner,
  updateAdminHomepageBannerStatus,
  updateAdminPrimaryHomepageBanner,
  updateHomepageSectionConfig,
  updateAdminCouponStatus,
  updateAdminImage,
  updateAdminInventoryColumn,
  updateAdminInventoryColumnPermissions,
  updateAdminInventoryManagement,
  updateAdminLegalDocument,
  updateAdminImageClass,
  updateAdminNotice,
  updateAdminPassword,
  updateAdminProfile,
  updateAdminStaff,
  updateAdminUserLevel,
  updateAdminUserLevelStatus,
  updateAdminUserStatus,
  updateGoodsStatus,
  verifyAdminLogin,
};
