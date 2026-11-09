// 用途：管理回收收款方式和回收提示配置，并为网页后台与小程序提供统一数据。
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

const ALLOWED_METHOD_KEYS = new Set(['alipay', 'wechat']);
const ALLOWED_FIELD_KEYS = new Set(['accountNumber', 'realName', 'orderRemark']);
const RECYCLE_NOTICE_KEY = 'recycling_condition';

const DEFAULT_PAY_METHODS = [
  {
    methodKey: 'alipay',
    name: '支付宝',
    default: true,
    visible: true,
    sortOrder: 10,
    fields: [
      { key: 'accountNumber', label: '支付宝账号', placeholder: '请输入', visible: true, required: true },
      { key: 'realName', label: '真实姓名', placeholder: '请输入', visible: true, required: true },
      { key: 'orderRemark', label: '订单备注', placeholder: '没有备注可以不填', visible: true, required: false },
    ],
  },
  {
    methodKey: 'wechat',
    name: '微信零钱到账',
    default: false,
    visible: false,
    sortOrder: 20,
    fields: [
      { key: 'accountNumber', label: '微信账号', placeholder: '无需填写', visible: false, required: false },
      { key: 'realName', label: '真实姓名', placeholder: '请输入', visible: true, required: true },
      { key: 'orderRemark', label: '订单备注', placeholder: '没有备注可以不填', visible: true, required: false },
    ],
  },
];

const DEFAULT_RECYCLE_NOTICE = {
  visible: true,
  content: [
    '1. 建议您在回收前上传机器各个角度的照片；如果顺丰运输出现问题，我们会帮助玩家追偿快递损失，不会影响给玩家的报价。',
    '2. 缺件、维修情况、功能异常等会影响价格，未覆盖问题提交后人工确认。',
  ].join('\n'),
};

const createPayMethodTableSql = `
  CREATE TABLE IF NOT EXISTS pay_method (
    id BIGINT NOT NULL AUTO_INCREMENT,
    method_key VARCHAR(32) NOT NULL,
    method_name VARCHAR(64) NOT NULL DEFAULT '',
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    is_visible TINYINT(1) NOT NULL DEFAULT 0,
    fields_json LONGTEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_pay_method_key (method_key),
    KEY idx_pay_method_visible_sort (is_visible, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const createRecycleNoticeTableSql = `
  CREATE TABLE IF NOT EXISTS recycle_notice (
    id BIGINT NOT NULL AUTO_INCREMENT,
    notice_key VARCHAR(64) NOT NULL,
    content LONGTEXT,
    is_visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_recycle_notice_key (notice_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

let pool;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

const limitText = (value, maxLength, fallback = '') => {
  const normalized = String(value === undefined || value === null ? fallback : value).trim();
  return normalized.slice(0, maxLength);
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value === true || value === 1 || value === '1' || value === 'true';
};

const getDefaultMethod = (methodKey) => DEFAULT_PAY_METHODS.find((item) => item.methodKey === methodKey);

const normalizeField = (field, fallback) => {
  const source = field && typeof field === 'object' ? field : {};
  const fallbackField = fallback && typeof fallback === 'object' ? fallback : {};
  const key = limitText(source.key, 32, fallbackField.key);
  if (!ALLOWED_FIELD_KEYS.has(key)) {
    return null;
  }

  const visible = toBoolean(source.visible, toBoolean(fallbackField.visible));
  return {
    key,
    label: limitText(source.label, 64, fallbackField.label),
    placeholder: limitText(source.placeholder, 128, fallbackField.placeholder),
    visible,
    required: visible && toBoolean(source.required, toBoolean(fallbackField.required)),
  };
};

const normalizeFields = (fields, methodKey) => {
  const fallbackMethod = getDefaultMethod(methodKey) || DEFAULT_PAY_METHODS[0];
  const sourceFields = Array.isArray(fields) ? fields : [];

  return fallbackMethod.fields.map((fallbackField) => {
    const sourceField = sourceFields.find((item) => String(item && item.key || '') === fallbackField.key);
    return normalizeField(sourceField, fallbackField);
  }).filter(Boolean);
};

const parseFields = (value, methodKey) => {
  try {
    return normalizeFields(typeof value === 'string' ? JSON.parse(value || '[]') : value, methodKey);
  } catch (_error) {
    return normalizeFields([], methodKey);
  }
};

const mapPayMethodRow = (row) => ({
  id: Number(row.id || 0),
  methodKey: String(row.method_key || ''),
  name: String(row.method_name || ''),
  default: Number(row.is_default || 0) === 1,
  visible: Number(row.is_visible || 0) === 1,
  fields: parseFields(row.fields_json, String(row.method_key || '')),
  sortOrder: Number(row.sort_order || 0),
  updatedAt: Number(row.updated_at || 0),
});

const mapRecycleNoticeRow = (row) => {
  const content = String(row && row.content || '');
  return {
    visible: Number(row && row.is_visible || 0) === 1,
    content,
    lines: content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    updatedAt: Number(row && row.updated_at || 0),
  };
};

const initRecycleSettingsDatabase = async () => {
  const database = getPool();
  await database.query(createPayMethodTableSql);
  await database.query(createRecycleNoticeTableSql);

  const now = Date.now();
  for (const method of DEFAULT_PAY_METHODS) {
    await database.execute(
      `
        INSERT IGNORE INTO pay_method (
          method_key, method_name, is_default, is_visible, fields_json, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        method.methodKey,
        method.name,
        method.default ? 1 : 0,
        method.visible ? 1 : 0,
        JSON.stringify(method.fields),
        method.sortOrder,
        now,
        now,
      ]
    );
  }

  await database.execute(
    `
      INSERT IGNORE INTO recycle_notice (notice_key, content, is_visible, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [RECYCLE_NOTICE_KEY, DEFAULT_RECYCLE_NOTICE.content, DEFAULT_RECYCLE_NOTICE.visible ? 1 : 0, now, now]
  );
};

const listRecyclePayMethods = async ({ includeHidden = true } = {}) => {
  const whereSql = includeHidden ? '' : 'WHERE is_visible = 1';
  const [rows] = await getPool().query(
    `SELECT * FROM pay_method ${whereSql} ORDER BY is_default DESC, sort_order ASC, id ASC`
  );
  return rows.map(mapPayMethodRow).filter((item) => ALLOWED_METHOD_KEYS.has(item.methodKey));
};

const getRecycleNotice = async () => {
  const [rows] = await getPool().execute(
    'SELECT * FROM recycle_notice WHERE notice_key = ? LIMIT 1',
    [RECYCLE_NOTICE_KEY]
  );
  return rows.length ? mapRecycleNoticeRow(rows[0]) : mapRecycleNoticeRow({
    content: DEFAULT_RECYCLE_NOTICE.content,
    is_visible: DEFAULT_RECYCLE_NOTICE.visible ? 1 : 0,
    updated_at: 0,
  });
};

const getAdminRecycleSettings = async () => ({
  payMethods: await listRecyclePayMethods({ includeHidden: true }),
  notice: await getRecycleNotice(),
});

const getPublicRecycleSettings = async () => ({
  payMethods: await listRecyclePayMethods({ includeHidden: false }),
  notice: await getRecycleNotice(),
});

const normalizePayMethod = (method, current) => {
  const methodKey = limitText(method && method.methodKey, 32, current.methodKey);
  if (!ALLOWED_METHOD_KEYS.has(methodKey) || methodKey !== current.methodKey) {
    throw new Error('收款方式标识无效');
  }

  return {
    methodKey,
    name: limitText(method.name, 64, current.name),
    default: current.default,
    visible: toBoolean(method.visible, current.visible),
    fields: normalizeFields(method.fields, methodKey),
    sortOrder: Number.isFinite(Number(method.sortOrder)) ? Number(method.sortOrder) : current.sortOrder,
  };
};

const updateRecycleSettings = async (payload = {}) => {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const now = Date.now();

    if (Array.isArray(payload.payMethods)) {
      const currentMethods = await listRecyclePayMethods({ includeHidden: true });
      const incomingMethodMap = new Map(
        payload.payMethods.map((item) => [String(item && item.methodKey || ''), item])
      );
      const nextMethods = currentMethods.map((current) => normalizePayMethod(
        incomingMethodMap.get(current.methodKey) || current,
        current
      ));

      if (!nextMethods.some((item) => item.visible)) {
        throw new Error('至少需要显示一种收款方式');
      }

      for (const method of nextMethods) {
        await connection.execute(
          `
            UPDATE pay_method
            SET method_name = ?, is_visible = ?, fields_json = ?, sort_order = ?, updated_at = ?
            WHERE method_key = ?
            LIMIT 1
          `,
          [
            method.name,
            method.visible ? 1 : 0,
            JSON.stringify(method.fields),
            method.sortOrder,
            now,
            method.methodKey,
          ]
        );
      }
    }

    if (payload.notice && typeof payload.notice === 'object') {
      const currentNotice = await getRecycleNotice();
      const content = String(
        payload.notice.content === undefined ? currentNotice.content : payload.notice.content
      ).trim().slice(0, 4000);
      if (!content) {
        throw new Error('黄色提示内容不能为空');
      }

      await connection.execute(
        `
          INSERT INTO recycle_notice (notice_key, content, is_visible, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            content = VALUES(content),
            is_visible = VALUES(is_visible),
            updated_at = VALUES(updated_at)
        `,
        [
          RECYCLE_NOTICE_KEY,
          content,
          toBoolean(payload.notice.visible, currentNotice.visible) ? 1 : 0,
          now,
          now,
        ]
      );
    }

    await connection.commit();
    return getAdminRecycleSettings();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getAdminRecycleSettings,
  getPublicRecycleSettings,
  initRecycleSettingsDatabase,
  updateRecycleSettings,
};
