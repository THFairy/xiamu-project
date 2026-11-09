// 用途：小程序与网页后台的 HTTP 接口，提供法律文档的读写服务。
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { loadEnvFile } = require('./load-env');
const {
  CLOUD_PRINT_WAYBILLS_SERVICE_CODE: SF_EXPRESS_CLOUD_PRINT_WAYBILLS_SERVICE_CODE,
  DEFAULT_PRODUCTION_URL: SF_EXPRESS_DEFAULT_PRODUCTION_URL,
  DEFAULT_SANDBOX_URL: SF_EXPRESS_DEFAULT_SANDBOX_URL,
  SUPPORTED_TEST_SERVICE_CODES: SF_EXPRESS_SUPPORTED_TEST_SERVICE_CODES,
  checkSfPickupTime,
  createSfCloudPrintWaybills,
  createSfPickupOrder,
  invokeSfExpressService,
} = require('./sf-express');

loadEnvFile(__dirname);

const {
  clearPurchaseOrders,
  clearRecycleOrders,
  bindWechatPhone,
  createAddress,
  createPaymentBatch,
  createPurchaseOrder,
  expirePurchaseOrderReservations,
  createRecycleOrder,
  createRecycleSettlement,
  createUser,
  deleteAddress,
  deletePurchaseOrder,
  deleteRecycleOrder,
  getAddressById,
  getPaymentBatchById,
  getPaymentBatchByOutTradeNo,
  getPurchaseOrderById,
  getPurchaseOrderByOutTradeNo,
  getRecycleOrderById,
  getRecycleOrderByInternalId,
  getRecycleSettlementByOutBillNo,
  getLatestRecycleSettlementByOrderId,
  getUserByOpenId,
  hasCancelledSfPickupOrder,
  initDatabase,
  respondToRecycleReview,
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
  updatePurchaseOrderWechatOrderSync,
  updatePurchaseOrderWechatServiceStatus,
  updateRecycleOrderById,
  updateRecycleSettlementById,
  updateRecycleSettlementByOutBillNo,
  updateUserProfile,
} = require('./db');
const {
  STAFF_PERMISSIONS,
  createAdminCoupon,
  createAdminCategory,
  createAdminCategorySection,
  createAdminContentPage,
  checkGoods,
  createAdminGoods,
  createAdminHomepageBanner,
  createAdminInventoryColumn,
  createAdminInventoryManagement,
  createAdminImage,
  createAdminImageClass,
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
  deleteAdminImageClass,
  deleteAdminNotice,
  deleteAdminOrders,
  deleteAdminStaff,
  deleteAdminUser,
  deleteAdminUserLevel,
  destroyGoods,
  getAdminById,
  getAdminStaffPermissions,
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
  getInventoryFinanceStatistics,
  getDashboardFeeStatistics,
  getPublicLegalDocument,
  getPublicContentPageById,
  getPublicTutorialInteractionStats,
  listUserTutorialInteractions,
  getPublicNoticeById,
  getPublicProductById,
  handleAdminOrderRefund,
  updateAdminPaymentBatchStatus,
  updateAdminOrderStatus,
  setAdminOrderInventory,
  updateAdminStaffPermissions,
  recordUserActivityEvent,
  recordUserOnlineSession,
  recordPublicTutorialShare,
  recordPublicTutorialView,
  togglePublicTutorialInteraction,
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
  listAdminOrderInventoryOptions,
  listAdminStaff,
  listAdminUserLevels,
  listAdminUsers,
  listPublicCategoryConfigs,
  listPublicCategorySections,
  listPublicHomepageBanners,
  listPublicNotices,
  listPublicTutorialArticles,
  listPublicTutorialArticlesByCategory,
  listPublicTutorialCategories,
  listPublicProducts,
  reviewAdminGoodsComment,
  restoreGoods,
  setAdminGoodsBanners,
  setAdminSysconfig,
  shipAdminOrder,
  softDeleteGoods,
  sortAdminCategories,
  updateAdminCategory,
  updateAdminCategorySection,
  updateAdminCategoryStatus,
  updateAdminContentPage,
  updateAdminContentPageStatus,
  updateAdminCoupon,
  updateAdminCouponStatus,
  updateAdminGoods,
  updateAdminGoodsCommentStatus,
  updateAdminHomepageBanner,
  updateAdminHomepageBannerStatus,
  updateAdminPrimaryHomepageBanner,
  updateHomepageSectionConfig,
  updateAdminImage,
  updateAdminInventoryColumn,
  updateAdminInventoryColumnPermissions,
  upsertAdminInventoryCalculation,
  deleteAdminInventoryCalculation,
  updateAdminInventoryManagement,
  updateAdminLegalDocument,
  deleteAdminInventoryManagement,
  deleteAdminInventoryManagementBatch,
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
} = require('./admin');
const {
  getAdminRecycleSettings,
  getPublicRecycleSettings,
  initRecycleSettingsDatabase,
  updateRecycleSettings,
} = require('./recycle-settings');
const {
  dataAnalysisMenu,
  dataAnalysisRules,
  dataAnalysisStaffAccessPath,
} = require('./data-analysis/config');
const { handleDataAnalysisRequest } = require('./data-analysis/routes');

const {
  createAdminRecycleOptionGroup,
  createAdminRecycleOptionItem,
  createAdminRecycleProduct,
  deleteAdminRecycleOptionGroup,
  deleteAdminRecycleOptionGroups,
  deleteAdminRecycleOptionItem,
  deleteAdminRecycleOptionItems,
  deleteAdminRecycleProducts,
  getAdminRecycleProductById,
  initRecycleAdminDatabase,
  listAdminRecycleOptionGroups,
  listAdminRecycleOptionItems,
  listAdminRecycleProducts,
  listAdminRecycleProfiles,
  reorderAdminRecycleOptionGroups,
  updateAdminRecycleOptionGroup,
  updateAdminRecycleOptionGroupStatus,
  updateAdminRecycleOptionItem,
  updateAdminRecycleOptionItemStatus,
  updateAdminRecycleProduct,
  updateAdminRecycleProductStatus,
} = require('./recycle-admin');
const {
  createAdminRecycleSubmission,
  completeAdminRecycleSubmissionInspection,
  deleteAdminRecycleSubmission,
  deleteAdminRecycleSubmissions,
  initRecycleReviewAdminDatabase,
  listAdminRecycleSubmissions,
  listRecycleSubmissionReviews,
  publishAdminRecycleSubmission,
  updateAdminRecycleSubmissionInfo,
  updateAdminRecycleSubmissionReport,
  updateAdminRecycleSubmission,
} = require('./recycle-review-admin');
const { buildRecycleQuote } = require('./recycle-config');

const config = {
  host: process.env.BACKEND_HOST || '0.0.0.0',
  port: Number(process.env.BACKEND_PORT || 8080),
  preserveExistingData: process.env.PRESERVE_EXISTING_DATA === 'true',
  sessionSecret: process.env.BACKEND_SESSION_SECRET || 'replace-this-secret-in-production',
  consoleStaticDir: process.env.CONSOLE_STATIC_DIR || '../xiamu-adminweb/dist',
  wechatAppId: process.env.WECHAT_APPID || '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET || '',
  tokenExpiresInSeconds: Number(process.env.BACKEND_TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 7),
  allowMockWechatLogin: process.env.ALLOW_MOCK_WECHAT_LOGIN === 'true',
  wechatPayMockMode: process.env.WECHAT_PAY_MOCK_MODE === 'true',
  wechatPayMerchantId: process.env.WECHAT_PAY_MCHID || '',
  wechatPayNotifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || '',
  wechatPayPrivateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH || '',
  wechatPayPrivateKey: process.env.WECHAT_PAY_PRIVATE_KEY || '',
  wechatPaySerialNo: process.env.WECHAT_PAY_SERIAL_NO || '',
  wechatPayApiV3Key: process.env.WECHAT_PAY_API_V3_KEY || '',
  wechatPayPublicKeyId: process.env.WECHAT_PAY_PUBLIC_KEY_ID || '',
  wechatPayPublicKeyPath: process.env.WECHAT_PAY_PUBLIC_KEY_PATH || '',
  // 默认开启微信订单管理同步；可通过环境变量显式关闭。
  wechatOrderSyncEnabled: process.env.WECHAT_ORDER_SYNC_ENABLED !== 'false',
  wechatTransferNotifyUrl: process.env.WECHAT_TRANSFER_NOTIFY_URL || process.env.WECHAT_PAY_NOTIFY_URL || '',
  wechatTransferSceneId: process.env.WECHAT_TRANSFER_SCENE_ID || '1010',
  wechatTransferUserRecvPerception: process.env.WECHAT_TRANSFER_USER_RECV_PERCEPTION || '二手回收货款',
  sfExpressPartnerId: process.env.SF_EXPRESS_PARTNER_ID || '',
  sfExpressCheckWord: process.env.SF_EXPRESS_CHECK_WORD || '',
  sfExpressUseSandbox: process.env.SF_EXPRESS_USE_SANDBOX === 'true',
  sfExpressEndpointUrl: process.env.SF_EXPRESS_ENDPOINT_URL
    || (process.env.SF_EXPRESS_USE_SANDBOX === 'true'
      ? SF_EXPRESS_DEFAULT_SANDBOX_URL
      : SF_EXPRESS_DEFAULT_PRODUCTION_URL),
  sfExpressServiceCode: process.env.SF_EXPRESS_SERVICE_CODE || 'EXP_RECE_CREATE_ORDER',
  sfExpressSignMode: process.env.SF_EXPRESS_SIGN_MODE || '',
  sfExpressTimeoutMs: Number(process.env.SF_EXPRESS_TIMEOUT_MS || 15000),
  sfExpressDefaultWeightKg: Number(process.env.SF_EXPRESS_DEFAULT_WEIGHT_KG || 1),
  sfExpressSenderName: process.env.SF_EXPRESS_SENDER_NAME || '',
  sfExpressSenderPhone: process.env.SF_EXPRESS_SENDER_PHONE || '',
  sfExpressSenderCompany: process.env.SF_EXPRESS_SENDER_COMPANY || '',
  sfExpressSenderProvince: process.env.SF_EXPRESS_SENDER_PROVINCE || '',
  sfExpressSenderCity: process.env.SF_EXPRESS_SENDER_CITY || '',
  sfExpressSenderDistrict: process.env.SF_EXPRESS_SENDER_DISTRICT || '',
  sfExpressSenderAddress: process.env.SF_EXPRESS_SENDER_ADDRESS || '',
  sfExpressWaybillCallbackPath: process.env.SF_EXPRESS_WAYBILL_CALLBACK_PATH || '/sfexpress/waybills/callback',
};

const sfExpressCallbackLogDir = path.resolve(__dirname, 'cloud-data/sfexpress-callbacks');
const sfExpressCallbackPaths = new Set([
  String(config.sfExpressWaybillCallbackPath || '/sfexpress/waybills/callback').trim() || '/sfexpress/waybills/callback',
  '/sfexpress/sbox/waybills/bac',
  '/sfexpress/sbox/waybills/back',
  '/sfexpress/sbox/waybills/callback',
  '/sfexpress/prod/waybills/bac',
  '/sfexpress/prod/waybills/back',
  '/sfexpress/prod/waybills/callback',
]);

const maskValue = (value, visible = 6) => {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  if (text.length <= visible) {
    return text;
  }
  return `${text.slice(0, visible)}...${text.slice(-4)}`;
};

const logAuthTrace = (stage, payload = {}) => {
  const stamp = new Date().toISOString();
  console.log(`[auth] ${stamp} ${stage} ${JSON.stringify(payload)}`);
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  response.end(JSON.stringify(payload));
};

const parseJsonBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8').trim();

      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error(`invalid json body: ${error.message}`));
      }
    });

    request.on('error', reject);
  });

const getRawBodyBuffer = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    request.on('error', reject);
  });

const parseMultipartFormData = async (request) => {
  const contentType = String(request.headers['content-type'] || '');
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) {
    throw new Error('invalid multipart boundary');
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await getRawBodyBuffer(request);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const result = {
    fields: {},
    files: [],
  };

  let cursor = 0;
  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(boundary, cursor);
    if (boundaryIndex === -1) {
      break;
    }

    let partStart = boundaryIndex + boundary.length;
    if (body.slice(partStart, partStart + 2).toString() === '--') {
      break;
    }
    if (body.slice(partStart, partStart + 2).toString() === '\r\n') {
      partStart += 2;
    }

    const headerEndIndex = body.indexOf(headerSeparator, partStart);
    if (headerEndIndex === -1) {
      break;
    }

    const headerText = body.slice(partStart, headerEndIndex).toString('utf8');
    const nextBoundaryIndex = body.indexOf(boundary, headerEndIndex + headerSeparator.length);
    if (nextBoundaryIndex === -1) {
      break;
    }

    let dataEndIndex = nextBoundaryIndex;
    if (body.slice(dataEndIndex - 2, dataEndIndex).toString() === '\r\n') {
      dataEndIndex -= 2;
    }

    const contentBuffer = body.slice(headerEndIndex + headerSeparator.length, dataEndIndex);
    const nameMatch = /name="([^"]+)"/i.exec(headerText);
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    const fieldName = nameMatch ? nameMatch[1] : '';

    if (filenameMatch && filenameMatch[1]) {
      result.files.push({
        fieldName,
        filename: path.basename(filenameMatch[1]),
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
        buffer: contentBuffer,
      });
    } else if (fieldName) {
      result.fields[fieldName] = contentBuffer.toString('utf8');
    }

    cursor = nextBoundaryIndex;
  }

  return result;
};

const projectRootDir = __dirname;
const uploadRootDir = path.resolve(projectRootDir, 'cloud-data/uploads');
const staticRootDir = path.resolve(projectRootDir, 'static');
const consoleStaticRootDir = path.resolve(__dirname, config.consoleStaticDir);

const resolvePublicFilePath = (rootDir, relativePath) => {
  let decodedRelativePath = '';
  try {
    decodedRelativePath = decodeURIComponent(String(relativePath || ''));
  } catch (_error) {
    return null;
  }
  const resolvedPath = path.resolve(rootDir, decodedRelativePath);
  if (!isPathInside(rootDir, resolvedPath)) {
    return null;
  }

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return resolvedPath;
  }

  return resolvedPath;
};

const resolveUploadFilePath = (relativePath) => resolvePublicFilePath(uploadRootDir, relativePath);
const resolveStaticFilePath = (relativePath) => resolvePublicFilePath(staticRootDir, relativePath);

const saveUploadedFile = (file, subdir = 'misc') => {
  const extension = path.extname(String(file.filename || '')).trim() || '.bin';
  const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension.toLowerCase()}`;
  const targetDir = path.join(uploadRootDir, subdir);
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, safeName);
  fs.writeFileSync(targetPath, file.buffer);
  return `/uploads/${subdir}/${safeName}`;
};

const getPublicServerBaseUrl = (request = null) => {
  const configuredBaseUrl = String(process.env.PUBLIC_ASSET_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const forwardedProto = String(request?.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(request?.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const requestHost = forwardedHost || String(request?.headers.host || '').trim();
  if (requestHost) {
    const protocol = forwardedProto || (request?.socket?.encrypted ? 'https' : 'http');
    return `${protocol}://${requestHost}`.replace(/\/+$/, '');
  }

  const safeHost = ['0.0.0.0', '::'].includes(config.host) ? '127.0.0.1' : config.host;
  return `http://${safeHost}:${config.port}`;
};

const parseSfExpressCallbackBody = (request, rawBody) => {
  const rawText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '';
  const contentType = String(request.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return {
      rawText,
      parsedBody: Object.fromEntries(new URLSearchParams(rawText).entries()),
    };
  }

  try {
    return { rawText, parsedBody: rawText ? JSON.parse(rawText) : {} };
  } catch (_error) {
    return { rawText, parsedBody: rawText ? { raw: rawText } : {} };
  }
};

const verifySfExpressCallbackDigest = (parsedBody = {}) => {
  const msgDigest = String(parsedBody.msgDigest || '').trim();
  const msgData = typeof parsedBody.msgData === 'string' ? parsedBody.msgData : '';
  const timestamp = String(parsedBody.timestamp || '').trim();
  const checkWord = String(config.sfExpressCheckWord || '').trim();

  if (!msgDigest || !msgData || !timestamp || !checkWord) {
    return false;
  }

  const digest = crypto.createHash('md5').update(`${msgData}${timestamp}${checkWord}`, 'utf8').digest('hex');
  const candidates = [digest.toUpperCase(), digest.toLowerCase(), Buffer.from(digest, 'hex').toString('base64')];
  return candidates.includes(msgDigest);
};

const persistSfExpressCallbackLog = ({ pathname, request, parsedCallback, verified }) => {
  fs.mkdirSync(sfExpressCallbackLogDir, { recursive: true });
  const logId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(
    path.join(sfExpressCallbackLogDir, `${logId}.json`),
    JSON.stringify({
      id: logId,
      receivedAt: new Date().toISOString(),
      pathname,
      method: request.method,
      verified,
      headers: request.headers,
      parsedBody: parsedCallback.parsedBody,
      rawText: parsedCallback.rawText,
    }, null, 2),
    'utf8'
  );
  return logId;
};

const isPathInside = (parentDir, targetPath) => {
  const relativePath = path.relative(parentDir, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const sendFile = (response, filePath, options = {}) => {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.pem': 'application/x-pem-file',
    '.txt': 'text/plain; charset=utf-8',
  };
  const cacheControl = options.cacheControl || 'no-store';

  response.writeHead(200, {
    'Content-Type': contentTypeMap[extension] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(response);
};

const redirectTo = (response, location, statusCode = 302) => {
  response.writeHead(statusCode, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  response.end();
};

const serveConsoleApp = (requestUrl, response) => {
  if (requestUrl.pathname === '/') {
    redirectTo(response, '/console/');
    return true;
  }

  if (requestUrl.pathname === '/console') {
    redirectTo(response, '/console/');
    return true;
  }

  if (!requestUrl.pathname.startsWith('/console/')) {
    return false;
  }

  if (!fs.existsSync(consoleStaticRootDir) || !fs.statSync(consoleStaticRootDir).isDirectory()) {
    sendJson(response, 503, {
      success: false,
      message: `console build not found at ${consoleStaticRootDir}`,
    });
    return true;
  }

  const relativePath = requestUrl.pathname.replace(/^\/console\//, '');
  const requestedPath = relativePath
    ? path.resolve(consoleStaticRootDir, relativePath)
    : path.join(consoleStaticRootDir, 'index.html');

  if (!isPathInside(consoleStaticRootDir, requestedPath)) {
    sendJson(response, 403, { success: false, message: 'forbidden' });
    return true;
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    const isHtml = path.extname(requestedPath).toLowerCase() === '.html';
    sendFile(response, requestedPath, {
      cacheControl: isHtml ? 'no-store' : 'public, max-age=31536000, immutable',
    });
    return true;
  }

  const spaEntryPath = path.join(consoleStaticRootDir, 'index.html');
  if (!fs.existsSync(spaEntryPath) || !fs.statSync(spaEntryPath).isFile()) {
    sendJson(response, 503, {
      success: false,
      message: `console entry not found at ${spaEntryPath}`,
    });
    return true;
  }

  sendFile(response, spaEntryPath, { cacheControl: 'no-store' });
  return true;
};

const base64urlEncode = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64urlDecode = (value) => {
  const normalized = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
};

const signToken = (payload) => {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const verifyToken = (token) => {
  if (!token) {
    return null;
  }

  const parts = String(token).split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
};

const getBearerToken = (request) => {
  const headerValue = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(headerValue));
  return match ? match[1] : '';
};

const getAdminToken = (request) => {
  const tokenHeader = String(request.headers.token || '').trim();
  return tokenHeader || getBearerToken(request);
};

const sendAdminSuccess = (response, data = null, msg = 'ok') => {
  sendJson(response, 200, {
    msg,
    data,
  });
};

const sendAdminError = (response, statusCode, msg, errorCode) => {
  const payload = {
    msg: msg || '????',
  };

  if (errorCode !== undefined) {
    payload.errorCode = errorCode;
  }

  sendJson(response, statusCode, payload);
};

const legacyAdminMenus = [
  {
    name: '商品管理',
    icon: 'shopping-cart',
    child: [
      {
        name: '商品列表',
        icon: 'shopping-bag',
        frontpath: '/goods/list',
      },
    ],
  },
];

const adminMenus = [
  {
    name: '后台首页',
    icon: 'home-filled',
    frontpath: '/',
  },
  {
    name: '用户',
    icon: 'user',
    frontpath: '/user/list',
  },
  {
    name: '商品',
    icon: 'shopping-cart',
    frontpath: '/goods/list',
  },
  {
    name: '鍥炴敹閰嶇疆',
    icon: 'refresh-right',
    frontpath: '/recycle/list',
  },
  {
    name: '鍥炴敹瀹℃牳',
    icon: 'document-checked',
    frontpath: '/recycle/review',
  },
  {
    name: '分类类目',
    icon: 'grid',
    frontpath: '/category/list',
  },
  {
    name: '单品购买订单管理',
    icon: 'tickets',
    frontpath: '/order/list',
  },
  {
    name: '评价',
    icon: 'chat-dot-square',
    frontpath: '/comment/list',
  },
  {
    name: '首页轮播',
    icon: 'picture-filled',
    frontpath: '/homepage-banner/list',
  },
  {
    name: '封面管理',
    icon: 'picture-in-picture',
    frontpath: '/carousel-directory/cover',
  },
  {
    name: '图库',
    icon: 'picture',
    frontpath: '/image/list',
  },
  {
    name: '公告',
    icon: 'bell',
    frontpath: '/notice/list',
  },
  {
    name: '配置',
    icon: 'set-up',
    frontpath: '/setting/base',
  },
  {
    name: '???',
    icon: 'files',
    frontpath: '/coupon/list',
  },
];

const adminRuleNames = [
  'createGoods,POST',
  'getGoodsList,GET',
  'updateGoods,POST',
  'updateGoodsStatus,POST',
  'deleteGoods,POST',
  'getCategoryList,GET',
  'createCategory,POST',
  'updateCategory,POST',
  'updateCategoryStatus,POST',
  'deleteCategory,POST',
  'getOrderList,GET',
  'deleteOrder,POST',
  'shipOrder,POST',
  'refundOrder,POST',
  'exportOrder,POST',
  'getCommentList,GET',
  'updateCommentStatus,POST',
  'reviewComment,POST',
  'getHomepageBannerList,GET',
  'createHomepageBanner,POST',
  'updateHomepageBanner,POST',
  'updateHomepageBannerStatus,POST',
  'deleteHomepageBanner,POST',
  'getHomepageBannerPrimary,GET',
  'updateHomepageBannerPrimary,POST',
  'getNoticeList,GET',
  'createNotice,POST',
  'updateNotice,POST',
  'deleteNotice,POST',
  'getCouponList,GET',
  'createCoupon,POST',
  'updateCoupon,POST',
  'updateCouponStatus,POST',
  'deleteCoupon,POST',
  'getContentPageList,GET',
  'createContentPage,POST',
  'updateContentPage,POST',
  'updateContentPageStatus,POST',
  'deleteContentPage,POST',
  'getImageClassList,GET',
  'createImageClass,POST',
  'updateImageClass,POST',
  'deleteImageClass,POST',
  'getImageList,GET',
  'uploadImage,POST',
  'updateImage,POST',
  'deleteImage,POST',
  'getSysconfig,GET',
  'setSysSetting,POST',
  'getUserList,GET',
  'updateUserStatus,POST',
  'deleteUser,POST',
  'getUserLevelList,GET',
  'createUserLevel,POST',
  'updateUserLevel,POST',
  'updateUserLevelStatus,POST',
  'deleteUserLevel,POST',
];

const dynamicAdminMenuCatalog = [
  { name: '后台首页', icon: 'home-filled', frontpath: '/' },
  dataAnalysisMenu,
  { name: '用户管理', icon: 'user', frontpath: '/user/list' },
  { name: '库存管理', icon: 'box', frontpath: '/inventory/list' },
  { name: '财务统计', icon: 'data-analysis', frontpath: '/finance/list' },
  { name: '商品管理', icon: 'shopping-cart', frontpath: '/goods/list' },
  { name: '回收配置', icon: 'refresh-right', frontpath: '/recycle/list' },
  { name: '回收审核', icon: 'document-checked', frontpath: '/recycle/review' },
  { name: '分类管理', icon: 'grid', frontpath: '/category/list' },
  { name: '订单管理', icon: 'tickets', frontpath: '/order/list' },
  { name: '评价管理', icon: 'chat-dot-square', frontpath: '/comment/list' },
  { name: '首页轮播管理', icon: 'picture-filled', frontpath: '/homepage-banner/list' },
  { name: '专区编辑', icon: 'picture', frontpath: '/homepage-section/editor' },
  { name: '教程分类', icon: 'reading', frontpath: '/carousel-directory/list' },
  { name: '教程编辑', icon: 'edit-pen', frontpath: '/carousel-directory/editor' },
  { name: '封面管理', icon: 'picture-in-picture', frontpath: '/carousel-directory/cover' },
  { name: '公告管理', icon: 'bell', frontpath: '/notice/list' },
  { name: '系统设置', icon: 'set-up', frontpath: '/setting/base' },
  { name: '支付设置', icon: 'wallet-filled', frontpath: '/setting/buy' },
  { name: '物流设置', icon: 'van', frontpath: '/setting/ship' },
  { name: '优惠券管理', icon: 'files', frontpath: '/coupon/list' },
  { name: '会员等级', icon: 'medal', frontpath: '/level/list' },
  { name: '员工管理', icon: 'user-filled', frontpath: '/staff/list' },
  { name: '隐私政策填写', icon: 'lock', frontpath: '/privacy-policy/index' },
  { name: '用户协议填写', icon: 'document', frontpath: '/user-agreement/index' },
];

const dynamicAdminRuleCatalog = [
  'getStatistics1,GET',
  'getStatistics2,GET',
  'getStatistics3,GET',
  'getAddressLocationStatistics,GET',
  'getOrderTimeStatistics,GET',
  'getUserEngagementStatistics,GET',
  'getUserActivityStatistics,GET',
  'createGoods,POST',
  'getGoodsList,GET',
  'searchGoods,GET',
  'updateGoods,POST',
  'updateGoodsStatus,POST',
  'deleteGoods,POST',
  'restoreGoods,POST',
  'destroyGoods,POST',
  'setGoodsBanner,POST',
  'checkGoods,POST',
  'getCategoryList,GET',
  'createCategory,POST',
  'updateCategory,POST',
  'updateCategoryStatus,POST',
  'deleteCategory,POST',
  'getRecycleProfiles,GET',
  'getRecycleProductList,GET',
  'searchRecycleProduct,GET',
  'createRecycleProduct,POST',
  'updateRecycleProduct,POST',
  'updateRecycleProductStatus,POST',
  'deleteRecycleProduct,POST',
  'getRecycleOptionGroups,GET',
  'createRecycleOptionGroup,POST',
  'updateRecycleOptionGroup,POST',
  'updateRecycleOptionGroupStatus,POST',
  'deleteRecycleOptionGroup,POST',
  'deleteRecycleOptionGroups,POST',
  'getRecycleOptionItems,GET',
  'createRecycleOptionItem,POST',
  'updateRecycleOptionItem,POST',
  'updateRecycleOptionItemStatus,POST',
  'deleteRecycleOptionItem,POST',
  'deleteRecycleOptionItems,POST',
  'reorderRecycleOptionGroups,POST',
  'getRecycleSubmissionList,GET',
  'searchRecycleSubmission,GET',
  'getRecycleSubmissionWaybillNo,GET',
  'getRecycleSubmissionReviews,GET',
  'getRecycleSubmissionSettlements,GET',
  'deleteRecycleSubmission,POST',
  'createRecycleSubmission,POST',
  'updateRecycleSubmissionInfo,POST',
  'reviewRecycleSubmission,POST',
  'updateRecycleSubmissionReport,POST',
  'publishRecycleSubmission,POST',
  'createRecycleSubmissionSettlement,POST',
  'syncRecycleSubmissionSettlement,POST',
  'completeAlipayRecycleSubmissionSettlement,POST',
  'getOrderList,GET',
  'searchOrder,GET',
  'deleteOrder,POST',
  'shipOrder,POST',
  'refundOrder,POST',
  'exportOrder,POST',
  'updateOrderStatus,POST',
  'getOrderShipInfo,GET',
  'getCommentList,GET',
  'searchComment,GET',
  'updateCommentStatus,POST',
  'reviewComment,POST',
  'getHomepageBannerList,GET',
  'searchHomepageBanner,GET',
  'createHomepageBanner,POST',
  'updateHomepageBanner,POST',
  'updateHomepageBannerStatus,POST',
  'deleteHomepageBanner,POST',
  'getHomepageBannerPrimary,GET',
  'updateHomepageBannerPrimary,POST',
  'getHomepageSection,GET',
  'updateHomepageSection,POST',
  'getNoticeList,GET',
  'createNotice,POST',
  'updateNotice,POST',
  'deleteNotice,POST',
  'getCouponList,GET',
  'createCoupon,POST',
  'updateCoupon,POST',
  'updateCouponStatus,POST',
  'deleteCoupon,POST',
  'getContentPageList,GET',
  'searchContentPage,GET',
  'createContentPage,POST',
  'updateContentPage,POST',
  'updateContentPageStatus,POST',
  'deleteContentPage,POST',
  'getSysconfig,GET',
  'setSysSetting,POST',
  'getUserList,GET',
  'searchUser,GET',
  'updateUserStatus,POST',
  'deleteUser,POST',
  'getInventoryManagementList,GET',
  'searchInventoryManagement,GET',
  'exportInventoryManagement,GET',
  'getInventoryColumnPermissions,GET',
  'updateInventoryColumnPermissions,POST',
  'createInventoryManagement,POST',
  'updateInventoryManagement,POST',
  'deleteInventoryManagement,POST',
  'deleteInventoryManagementBatch,POST',
  'getInventoryCalculations,GET',
  'updateInventoryCalculations,POST',
  'getFinanceStatistics,GET',
  'searchFinanceStatistics,GET',
  'getLegalDocument,GET',
  'updateLegalDocument,POST',
  'getUserLevelList,GET',
  'createUserLevel,POST',
  'updateUserLevel,POST',
  'updateUserLevelStatus,POST',
  'deleteUserLevel,POST',
  'getStaffList,GET',
  'searchStaff,GET',
  'createStaff,POST',
  'updateStaff,POST',
  'deleteStaff,POST',
];

const managerDeniedRules = new Set([
  'getUserList,GET',
  'updateUserStatus,POST',
  'deleteUser,POST',
  'getStaffList,GET',
  'createStaff,POST',
  'updateStaff,POST',
  'deleteStaff,POST',
]);

const employeeRuleNames = [
  'createGoods,POST',
  'getGoodsList,GET',
  'updateGoods,POST',
  'updateGoodsStatus,POST',
  'deleteGoods,POST',
  'restoreGoods,POST',
  'destroyGoods,POST',
  'setGoodsBanner,POST',
  'checkGoods,POST',
  'getCategoryList,GET',
  'getRecycleSubmissionList,GET',
  'getRecycleSubmissionReviews,GET',
  'getRecycleSubmissionSettlements,GET',
  'getOrderList,GET',
  'getOrderShipInfo,GET',
];

const dynamicAdminMenuMap = new Map(dynamicAdminMenuCatalog.map((item) => [item.frontpath, item]));

const legacyEmployeeAccessPaths = ['/goods/list', '/recycle/review', '/order/list'];
const staffModuleRules = {
  '/': ['getStatistics1,GET', 'getStatistics2,GET', 'getStatistics3,GET', 'getAddressLocationStatistics,GET', 'getOrderTimeStatistics,GET', 'getUserEngagementStatistics,GET', 'getUserActivityStatistics,GET'],
  [dataAnalysisStaffAccessPath]: dataAnalysisRules,
  '/user/list': ['getUserList,GET', 'searchUser,GET', 'updateUserStatus,POST', 'deleteUser,POST'],
  '/inventory/list': ['getInventoryManagementList,GET', 'searchInventoryManagement,GET', 'exportInventoryManagement,GET', 'getInventoryColumnPermissions,GET', 'updateInventoryColumnPermissions,POST', 'createInventoryManagement,POST', 'updateInventoryManagement,POST', 'deleteInventoryManagement,POST', 'deleteInventoryManagementBatch,POST', 'getInventoryCalculations,GET', 'updateInventoryCalculations,POST'],
  '/finance/list': ['getFinanceStatistics,GET', 'searchFinanceStatistics,GET'],
  '/privacy-policy/index': ['getLegalDocument,GET', 'updateLegalDocument,POST'],
  '/user-agreement/index': ['getLegalDocument,GET', 'updateLegalDocument,POST'],
  '/goods/list': ['createGoods,POST', 'getGoodsList,GET', 'searchGoods,GET', 'updateGoods,POST', 'updateGoodsStatus,POST', 'deleteGoods,POST', 'restoreGoods,POST', 'destroyGoods,POST', 'setGoodsBanner,POST', 'checkGoods,POST', 'getCategoryList,GET'],
  '/recycle/list': ['getRecycleProfiles,GET', 'getRecycleProductList,GET', 'searchRecycleProduct,GET', 'createRecycleProduct,POST', 'updateRecycleProduct,POST', 'updateRecycleProductStatus,POST', 'deleteRecycleProduct,POST', 'getRecycleOptionGroups,GET', 'createRecycleOptionGroup,POST', 'updateRecycleOptionGroup,POST', 'updateRecycleOptionGroupStatus,POST', 'deleteRecycleOptionGroup,POST', 'deleteRecycleOptionGroups,POST', 'reorderRecycleOptionGroups,POST', 'getRecycleOptionItems,GET', 'createRecycleOptionItem,POST', 'updateRecycleOptionItem,POST', 'updateRecycleOptionItemStatus,POST', 'deleteRecycleOptionItem,POST', 'deleteRecycleOptionItems,POST'],
  '/recycle/review': ['getRecycleSubmissionList,GET', 'searchRecycleSubmission,GET', 'getRecycleSubmissionWaybillNo,GET', 'getRecycleSubmissionReviews,GET', 'getRecycleSubmissionSettlements,GET', 'deleteRecycleSubmission,POST', 'createRecycleSubmission,POST', 'updateRecycleSubmissionInfo,POST', 'reviewRecycleSubmission,POST', 'updateRecycleSubmissionReport,POST', 'publishRecycleSubmission,POST', 'createRecycleSubmissionSettlement,POST', 'syncRecycleSubmissionSettlement,POST', 'completeAlipayRecycleSubmissionSettlement,POST'],
  '/category/list': ['getCategoryList,GET', 'createCategory,POST', 'updateCategory,POST', 'updateCategoryStatus,POST', 'deleteCategory,POST'],
  '/order/list': ['getOrderList,GET', 'searchOrder,GET', 'deleteOrder,POST', 'shipOrder,POST', 'refundOrder,POST', 'exportOrder,POST', 'updateOrderStatus,POST', 'getOrderShipInfo,GET'],
  '/comment/list': ['getCommentList,GET', 'searchComment,GET', 'updateCommentStatus,POST', 'reviewComment,POST'],
  '/homepage-banner/list': ['getHomepageBannerList,GET', 'searchHomepageBanner,GET', 'createHomepageBanner,POST', 'updateHomepageBanner,POST', 'updateHomepageBannerStatus,POST', 'deleteHomepageBanner,POST', 'getHomepageBannerPrimary,GET', 'updateHomepageBannerPrimary,POST'],
  '/homepage-section/editor': ['getHomepageSection,GET', 'updateHomepageSection,POST'],
  '/carousel-directory/list': ['getContentPageList,GET', 'searchContentPage,GET', 'createContentPage,POST', 'updateContentPage,POST', 'updateContentPageStatus,POST', 'deleteContentPage,POST'],
  '/carousel-directory/editor': ['getContentPageList,GET', 'searchContentPage,GET', 'createContentPage,POST', 'updateContentPage,POST', 'updateContentPageStatus,POST', 'deleteContentPage,POST'],
  '/carousel-directory/cover': ['getContentPageList,GET', 'createContentPage,POST', 'updateContentPage,POST', 'updateContentPageStatus,POST', 'deleteContentPage,POST'],
  '/notice/list': ['getNoticeList,GET', 'createNotice,POST', 'updateNotice,POST', 'deleteNotice,POST'],
  '/setting/base': ['getSysconfig,GET', 'setSysSetting,POST'],
  '/setting/buy': ['getSysconfig,GET', 'setSysSetting,POST'],
  '/setting/ship': ['getSysconfig,GET', 'setSysSetting,POST'],
  '/coupon/list': ['getCouponList,GET', 'createCoupon,POST', 'updateCoupon,POST', 'updateCouponStatus,POST', 'deleteCoupon,POST'],
  '/level/list': ['getUserLevelList,GET', 'createUserLevel,POST', 'updateUserLevel,POST', 'updateUserLevelStatus,POST', 'deleteUserLevel,POST'],
};

const getStaffAccessPaths = (user) => {
  const configuredPaths = Array.isArray(user?.accessPaths) ? user.accessPaths : null;
  return configuredPaths === null ? legacyEmployeeAccessPaths : configuredPaths;
};

const getStaffAccessRules = (user) => Array.isArray(user?.accessRules) ? user.accessRules : null;
const inventoryColumnPermissionRules = new Set([
  'getInventoryColumnPermissions,GET',
  'updateInventoryColumnPermissions,POST',
]);

const getDynamicAdminMenus = (permission, accessPaths = null) => {
  const normalizedPermission = String(permission || '').trim();
  const paths = normalizedPermission === STAFF_PERMISSIONS.SUPERADMIN
    ? dynamicAdminMenuCatalog.map((item) => item.frontpath)
    : normalizedPermission === STAFF_PERMISSIONS.MANAGER
      ? dynamicAdminMenuCatalog
        .filter((item) => item.frontpath !== '/user/list' && item.frontpath !== '/staff/list')
        .map((item) => item.frontpath)
      : normalizedPermission === STAFF_PERMISSIONS.STAFF
        ? ['/', ...getStaffAccessPaths({ accessPaths })]
        : ['/'];

  return paths.map((path) => dynamicAdminMenuMap.get(path)).filter(Boolean);
};

const getDynamicAdminRules = (permission, accessPaths = null, accessRules = null) => {
  const normalizedPermission = String(permission || '').trim();
  if (normalizedPermission === STAFF_PERMISSIONS.SUPERADMIN) {
    return [...dynamicAdminRuleCatalog];
  }
  if (normalizedPermission === STAFF_PERMISSIONS.MANAGER) {
    return dynamicAdminRuleCatalog.filter((rule) => !managerDeniedRules.has(rule));
  }
  if (normalizedPermission === STAFF_PERMISSIONS.STAFF) {
    const paths = accessPaths === null ? legacyEmployeeAccessPaths : accessPaths;
    const configuredRules = Array.isArray(accessRules) ? new Set(accessRules) : null;
    const legacyHomepageRules = configuredRules === null ? staffModuleRules['/'] : [];
    const selectedModuleRules = paths.flatMap((path) => {
      const rules = staffModuleRules[path] || [];
      if (!configuredRules) {
        return rules.filter((rule) => !inventoryColumnPermissionRules.has(rule));
      }
      return rules.filter((rule) => configuredRules.has(`${path}::${rule}`) || configuredRules.has(rule));
    });
    return Array.from(new Set([...legacyHomepageRules, ...selectedModuleRules]));
  }
  return [];
};

const buildAdminAuthPayload = (user) => {
  const permission = String(user?.permission || '').trim() || STAFF_PERMISSIONS.VISITOR;
  const displayName = String(user?.nickname || user?.name || user?.username || '').trim() || `员工 #${Number(user?.id || 0)}`;
  return {
    id: Number(user?.id || 0),
    account: String(user?.account || user?.username || '').trim(),
    name: String(user?.name || '').trim(),
    phone: String(user?.phone || '').trim(),
    email: String(user?.email || '').trim(),
    nickname: displayName,
    username: displayName,
    avatar: String(user?.avatar || '').trim(),
    permission,
    lastLoginAt: Number(user?.lastLoginAt || 0),
    lastLoginAtRealtime: String(user?.lastLoginAtRealtime || ''),
    menus: getDynamicAdminMenus(permission, user?.accessPaths),
    ruleNames: getDynamicAdminRules(permission, user?.accessPaths, getStaffAccessRules(user)),
  };
};

const hasAdminRule = (adminUser, ruleName) => getDynamicAdminRules(
  adminUser?.permission,
  adminUser?.accessPaths,
  getStaffAccessRules(adminUser)
).includes(ruleName);

const RECYCLE_SUBMISSION_WAYBILL_RULE = 'getRecycleSubmissionWaybillNo,GET';
const redactSfWaybillNoFromNote = (note) => {
  const source = String(note || '');
  const redacted = source
    .replace(/(^|[；;\r\n])\s*顺丰(?:运单|单)号\s*[:：]\s*[^\r\n；;]*/gi, '$1')
    .replace(/(^|[；;\r\n])\s*快递单号\s*[:：]\s*[^\r\n；;]*/gi, (matched, prefix) => (
      /顺丰/.test(source) ? prefix : matched
    ));

  return redacted
    .replace(/[；;]{2,}/g, '；')
    .replace(/^[；;\r\n]+|[；;\r\n]+$/g, '');
};
const sanitizeRecycleSubmissionForAdmin = (submission, adminUser) => {
  if (!submission || hasAdminRule(adminUser, RECYCLE_SUBMISSION_WAYBILL_RULE)) {
    return submission;
  }

  return {
    ...submission,
    note: redactSfWaybillNoFromNote(submission.note),
    sfWaybillNo: '',
  };
};
const sanitizeRecycleSubmissionReviewForAdmin = (review, adminUser) => ({
  ...review,
  beforeSnapshot: sanitizeRecycleSubmissionForAdmin(review?.beforeSnapshot, adminUser),
  afterSnapshot: sanitizeRecycleSubmissionForAdmin(review?.afterSnapshot, adminUser),
});

const adminPermissionMatchers = [
  { method: 'GET', pattern: /^\/admin\/category-sections$/, permission: 'getCategoryList,GET' },
  { method: 'POST', pattern: /^\/admin\/category-sections$/, permission: 'createCategory,POST' },
  { method: 'POST', pattern: /^\/admin\/category-sections\/\d+$/, permission: 'updateCategory,POST' },
  { method: 'POST', pattern: /^\/admin\/category-sections\/\d+\/delete$/, permission: 'deleteCategory,POST' },
  { method: 'GET', pattern: /^\/admin\/category$/, permission: 'getCategoryList,GET' },
  { method: 'POST', pattern: /^\/admin\/category$/, permission: 'createCategory,POST' },
  { method: 'POST', pattern: /^\/admin\/category\/\d+$/, permission: 'updateCategory,POST' },
  { method: 'POST', pattern: /^\/admin\/category\/\d+\/update_status$/, permission: 'updateCategoryStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/category\/\d+\/delete$/, permission: 'deleteCategory,POST' },
  { method: 'GET', pattern: /^\/admin\/recycle\/profiles$/, permission: 'getRecycleProfiles,GET' },
  { method: 'GET', pattern: /^\/admin\/recycle\/products\/\d+$/, permission: 'getRecycleProductList,GET' },
  { method: 'POST', pattern: /^\/admin\/recycle\/products$/, permission: 'createRecycleProduct,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/products\/delete_all$/, permission: 'deleteRecycleProduct,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/products\/\d+\/update_status$/, permission: 'updateRecycleProductStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/products\/\d+\/delete$/, permission: 'deleteRecycleProduct,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/products\/\d+$/, permission: 'updateRecycleProduct,POST' },
  { method: 'GET', pattern: /^\/admin\/recycle\/submissions\/\d+$/, permission: 'getRecycleSubmissionList,GET' },
  { method: 'POST', pattern: /^\/admin\/recycle\/option-groups\/delete_all$/, permission: 'deleteRecycleOptionGroups,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/option-groups\/reorder$/, permission: 'reorderRecycleOptionGroups,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/option-items\/delete_all$/, permission: 'deleteRecycleOptionItems,POST' },
  { method: 'GET', pattern: /^\/admin\/recycle\/submissions\/\d+\/reviews$/, permission: 'getRecycleSubmissionReviews,GET' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/delete$/, permission: 'deleteRecycleSubmission,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/delete_all$/, permission: 'deleteRecycleSubmission,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions$/, permission: 'createRecycleSubmission,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/info$/, permission: 'updateRecycleSubmissionInfo,POST' },
  { method: 'GET', pattern: /^\/admin\/recycle\/submissions\/\d+\/settlements$/, permission: 'getRecycleSubmissionSettlements,GET' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/settlement\/create$/, permission: 'createRecycleSubmissionSettlement,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/settlement\/sync$/, permission: 'syncRecycleSubmissionSettlement,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/settlement\/manual-alipay$/, permission: 'completeAlipayRecycleSubmissionSettlement,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/mark_incorrect$/, permission: 'reviewRecycleSubmission,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/review$/, permission: 'reviewRecycleSubmission,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/report$/, permission: 'updateRecycleSubmissionReport,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/publish$/, permission: 'publishRecycleSubmission,POST' },
  { method: 'POST', pattern: /^\/admin\/recycle\/submissions\/\d+\/inspection$/, permission: 'publishRecycleSubmission,POST' },
  { method: 'GET', pattern: /^\/admin\/statistics1$/, permission: 'getStatistics1,GET' },
  { method: 'GET', pattern: /^\/admin\/dashboard\/fee-statistics$/, permission: 'getStatistics1,GET' },
  { method: 'GET', pattern: /^\/admin\/statistics2$/, permission: 'getStatistics2,GET' },
  { method: 'GET', pattern: /^\/admin\/statistics3$/, permission: 'getStatistics3,GET' },
  { method: 'GET', pattern: /^\/admin\/address-location-statistics$/, permission: 'getAddressLocationStatistics,GET' },
  { method: 'GET', pattern: /^\/admin\/order-time-statistics$/, permission: 'getOrderTimeStatistics,GET' },
  { method: 'GET', pattern: /^\/admin\/user-engagement-statistics$/, permission: 'getUserEngagementStatistics,GET' },
  { method: 'GET', pattern: /^\/admin\/user-activity-statistics$/, permission: 'getUserActivityStatistics,GET' },
  { method: 'GET', pattern: /^\/admin\/user\/\d+$/, permission: 'getUserList,GET' },
  { method: 'POST', pattern: /^\/admin\/user\/\d+\/update_status$/, permission: 'updateUserStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/user\/\d+\/delete$/, permission: 'deleteUser,POST' },
  { method: 'GET', pattern: /^\/admin\/inventory_management\/\d+$/, permission: 'getInventoryManagementList,GET' },
  { method: 'GET', pattern: /^\/admin\/inventory_management\/export$/, permission: 'exportInventoryManagement,GET' },
  { method: 'GET', pattern: /^\/admin\/inventory_management\/column-permissions$/, permission: 'getInventoryColumnPermissions,GET' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/column-permissions$/, permission: 'updateInventoryColumnPermissions,POST' },
  { method: 'GET', pattern: /^\/admin\/inventory_management\/columns$/, permission: 'getInventoryManagementList,GET' },
  { method: 'GET', pattern: /^\/admin\/inventory_management\/calculations$/, permission: 'getInventoryCalculations,GET' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/calculations$/, permission: 'updateInventoryCalculations,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/calculations\/[a-z0-9_]+\/delete$/, permission: 'updateInventoryCalculations,POST' },
  { method: 'GET', pattern: /^\/admin\/finance\/statistics$/, permission: 'getFinanceStatistics,GET' },
  { method: 'GET', pattern: /^\/admin\/legal-documents\/(?:privacy-policy|user-agreement)$/, permission: 'getLegalDocument,GET' },
  { method: 'POST', pattern: /^\/admin\/legal-documents\/(?:privacy-policy|user-agreement)$/, permission: 'updateLegalDocument,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/columns$/, permission: 'updateInventoryManagement,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/columns\/[a-z0-9_]+$/, permission: 'updateInventoryManagement,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/columns\/[a-z0-9_]+\/delete$/, permission: 'deleteInventoryManagement,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management$/, permission: 'createInventoryManagement,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/\d+$/, permission: 'updateInventoryManagement,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/\d+\/delete$/, permission: 'deleteInventoryManagement,POST' },
  { method: 'POST', pattern: /^\/admin\/inventory_management\/delete_all$/, permission: 'deleteInventoryManagementBatch,POST' },
  { method: 'GET', pattern: /^\/admin\/user_level\/\d+$/, permission: 'getUserLevelList,GET' },
  { method: 'POST', pattern: /^\/admin\/user_level$/, permission: 'createUserLevel,POST' },
  { method: 'POST', pattern: /^\/admin\/user_level\/\d+$/, permission: 'updateUserLevel,POST' },
  { method: 'POST', pattern: /^\/admin\/user_level\/\d+\/update_status$/, permission: 'updateUserLevelStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/user_level\/\d+\/delete$/, permission: 'deleteUserLevel,POST' },
  { method: 'GET', pattern: /^\/admin\/order\/\d+$/, permission: 'getOrderList,GET' },
  { method: 'POST', pattern: /^\/admin\/order\/delete_all$/, permission: 'deleteOrder,POST' },
  { method: 'POST', pattern: /^\/admin\/order\/\d+\/ship$/, permission: 'shipOrder,POST' },
  { method: 'POST', pattern: /^\/admin\/order\/\d+\/sync-wechat$/, permission: 'shipOrder,POST' },
  { method: 'POST', pattern: /^\/admin\/order\/\d+\/sync-wechat-status$/, permission: 'shipOrder,POST' },
  { method: 'POST', pattern: /^\/admin\/order\/\d+\/handle_refund$/, permission: 'refundOrder,POST' },
  { method: 'GET', pattern: /^\/admin\/order\/\d+\/get_ship_info$/, permission: 'getOrderShipInfo,GET' },
  { method: 'POST', pattern: /^\/admin\/order\/\d+\/status$/, permission: 'updateOrderStatus,POST' },
  { method: 'GET', pattern: /^\/admin\/order\/\d+\/inventory$/, permission: 'getOrderList,GET' },
  { method: 'POST', pattern: /^\/admin\/order\/\d+\/inventory$/, permission: 'updateOrderStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/order\/excelexport/, permission: 'exportOrder,POST' },
  { method: 'GET', pattern: /^\/admin\/content_page\/\d+$/, permission: 'getContentPageList,GET' },
  { method: 'GET', pattern: /^\/admin\/content_page\/end-link-category-options$/, permission: 'getContentPageList,GET' },
  { method: 'POST', pattern: /^\/admin\/content_page$/, permission: 'createContentPage,POST' },
  { method: 'POST', pattern: /^\/admin\/content_page\/\d+$/, permission: 'updateContentPage,POST' },
  { method: 'POST', pattern: /^\/admin\/content_page\/\d+\/update_status$/, permission: 'updateContentPageStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/content_page\/\d+\/delete$/, permission: 'deleteContentPage,POST' },
  { method: 'POST', pattern: /^\/admin\/content_page\/delete_all$/, permission: 'deleteContentPage,POST' },
  { method: 'GET', pattern: /^\/admin\/homepage_banner\/\d+$/, permission: 'getHomepageBannerList,GET' },
  { method: 'GET', pattern: /^\/admin\/homepage_banner\/primary$/, permission: 'getHomepageBannerPrimary,GET' },
  { method: 'POST', pattern: /^\/admin\/homepage_banner$/, permission: 'createHomepageBanner,POST' },
  { method: 'POST', pattern: /^\/admin\/homepage_banner\/primary$/, permission: 'updateHomepageBannerPrimary,POST' },
  { method: 'POST', pattern: /^\/admin\/homepage_banner\/\d+$/, permission: 'updateHomepageBanner,POST' },
  { method: 'POST', pattern: /^\/admin\/homepage_banner\/\d+\/update_status$/, permission: 'updateHomepageBannerStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/homepage_banner\/\d+\/delete$/, permission: 'deleteHomepageBanner,POST' },
  { method: 'GET', pattern: /^\/admin\/homepage-section$/, permission: 'getHomepageSection,GET' },
  { method: 'GET', pattern: /^\/admin\/homepage-section\/category-options$/, permission: 'getHomepageSection,GET' },
  { method: 'POST', pattern: /^\/admin\/homepage-section$/, permission: 'updateHomepageSection,POST' },
  { method: 'GET', pattern: /^\/admin\/notice\/\d+$/, permission: 'getNoticeList,GET' },
  { method: 'POST', pattern: /^\/admin\/notice$/, permission: 'createNotice,POST' },
  { method: 'POST', pattern: /^\/admin\/notice\/\d+$/, permission: 'updateNotice,POST' },
  { method: 'POST', pattern: /^\/admin\/notice\/\d+\/delete$/, permission: 'deleteNotice,POST' },
  { method: 'GET', pattern: /^\/admin\/coupon\/\d+$/, permission: 'getCouponList,GET' },
  { method: 'POST', pattern: /^\/admin\/coupon$/, permission: 'createCoupon,POST' },
  { method: 'POST', pattern: /^\/admin\/coupon\/\d+$/, permission: 'updateCoupon,POST' },
  { method: 'POST', pattern: /^\/admin\/coupon\/\d+\/update_status$/, permission: 'updateCouponStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/coupon\/\d+\/delete$/, permission: 'deleteCoupon,POST' },
  { method: 'GET', pattern: /^\/admin\/sysconfig$/, permission: 'getSysconfig,GET' },
  { method: 'POST', pattern: /^\/admin\/sysconfig$/, permission: 'setSysSetting,POST' },
  { method: 'POST', pattern: /^\/admin\/sysconfig\/upload$/, permission: 'setSysSetting,POST' },
  { method: 'GET', pattern: /^\/admin\/recycle-settings$/, permission: 'getSysconfig,GET' },
  { method: 'POST', pattern: /^\/admin\/recycle-settings$/, permission: 'setSysSetting,POST' },
  { method: 'GET', pattern: /^\/admin\/goods_comment\/\d+$/, permission: 'getCommentList,GET' },
  { method: 'POST', pattern: /^\/admin\/goods_comment\/\d+\/update_status$/, permission: 'updateCommentStatus,POST' },
  { method: 'POST', pattern: /^\/admin\/goods_comment\/review\/\d+$/, permission: 'reviewComment,POST' },
  { method: 'GET', pattern: /^\/admin\/staff\/\d+$/, permission: 'getStaffList,GET' },
  { method: 'GET', pattern: /^\/admin\/staff\/\d+\/permissions$/, permission: 'getStaffList,GET' },
  { method: 'POST', pattern: /^\/admin\/staff$/, permission: 'createStaff,POST' },
  { method: 'POST', pattern: /^\/admin\/staff\/\d+$/, permission: 'updateStaff,POST' },
  { method: 'POST', pattern: /^\/admin\/staff\/\d+\/permissions$/, permission: 'updateStaff,POST' },
  { method: 'POST', pattern: /^\/admin\/staff\/\d+\/delete$/, permission: 'deleteStaff,POST' },
];

const getAdminPermissionByRequest = (method, pathname) => {
  const matched = adminPermissionMatchers.find((item) => item.method === method && item.pattern.test(pathname));
  return matched ? matched.permission : '';
};

const adminSearchPermissionMatchers = [
  { pattern: /^\/admin\/user\/\d+$/, params: ['keyword'], permission: 'searchUser,GET' },
  { pattern: /^\/admin\/inventory_management\/\d+$/, params: ['keyword'], permission: 'searchInventoryManagement,GET' },
  { pattern: /^\/admin\/finance\/statistics$/, params: ['keyword'], permission: 'searchFinanceStatistics,GET' },
  { pattern: /^\/admin\/goods\/\d+$/, params: ['title', 'category_id'], permission: 'searchGoods,GET' },
  { pattern: /^\/admin\/recycle\/products\/\d+$/, params: ['title', 'categoryKey', 'profileKey'], permission: 'searchRecycleProduct,GET' },
  { pattern: /^\/admin\/recycle\/submissions\/\d+$/, params: ['title', 'status', 'categoryKey'], permission: 'searchRecycleSubmission,GET' },
  { pattern: /^\/admin\/order\/\d+$/, params: ['no', 'name', 'phone', 'starttime', 'endtime'], permission: 'searchOrder,GET' },
  { pattern: /^\/admin\/order\/\d+\/inventory$/, params: ['keyword'], permission: 'searchOrder,GET' },
  { pattern: /^\/admin\/goods_comment\/\d+$/, params: ['title'], permission: 'searchComment,GET' },
  { pattern: /^\/admin\/content_page\/\d+$/, params: ['title', 'tutorialCategoryId'], permission: 'searchContentPage,GET' },
  { pattern: /^\/admin\/homepage_banner\/\d+$/, params: ['title'], permission: 'searchHomepageBanner,GET' },
  { pattern: /^\/admin\/staff\/\d+$/, params: ['keyword'], permission: 'searchStaff,GET' },
];

const getAdminSearchPermissionByRequest = (method, pathname, searchParams) => {
  if (method !== 'GET') {
    return '';
  }
  const matched = adminSearchPermissionMatchers.find((item) => item.pattern.test(pathname));
  if (!matched) {
    return '';
  }
  const hasSearchCondition = matched.params.some((name) => String(searchParams.get(name) || '').trim());
  return hasSearchCondition ? matched.permission : '';
};

const createAdminSessionPayload = (user) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    adminId: Number(user.id || 0),
    username: String(user.username || ''),
    role: 'admin',
    sessionVersion: Number(user.sessionVersion || 0),
    iat: issuedAt,
    exp: issuedAt + config.tokenExpiresInSeconds,
  };
};

const sanitizeUserProfile = (user) => ({
  uid: String(user.uid || ''),
  username: String(user.username || ''),
  nickname: String(user.nickname || ''),
  avatarUrl: String(user.avatarUrl || ''),
  phone: String(user.phone || ''),
  payoutMethod: String(user.payoutMethod || ''),
  payoutAccount: String(user.payoutAccount || ''),
  realName: String(user.realName || ''),
  registeredAt: Number(user.createdAt || 0),
  registeredAtRealtime: String(user.createdAtRealtime || ''),
  lastLoginAt: Number(user.lastLoginAt || 0),
  lastLoginAtRealtime: String(user.lastLoginAtRealtime || ''),
});

const buildWechatSessionUrl = (code) => {
  const query = new URLSearchParams({
    appid: config.wechatAppId,
    secret: config.wechatAppSecret,
    js_code: code,
    grant_type: 'authorization_code',
  });

  return `https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`;
};

let cachedWechatAccessToken = null;

const requestWechatJson = ({ method, requestUrl, body = null }) =>
  new Promise((resolve, reject) => {
    const url = new URL(requestUrl);
    const payload = body === null ? '' : JSON.stringify(body);
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (wechatResponse) => {
        const chunks = [];
        wechatResponse.on('data', (chunk) => chunks.push(chunk));
        wechatResponse.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (wechatResponse.statusCode >= 400 || result.errcode) {
              const error = new Error(result.errmsg || `wechat request failed (${result.errcode || wechatResponse.statusCode})`);
              error.statusCode = wechatResponse.statusCode || 400;
              error.code = String(result.errcode || 'WECHAT_REQUEST_FAILED');
              reject(error);
              return;
            }
            resolve(result);
          } catch (error) {
            reject(new Error(`invalid wechat response: ${error.message}`));
          }
        });
      }
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });

const fetchWechatAccessToken = async () => {
  if (!config.wechatAppId || !config.wechatAppSecret) {
    throw new Error('WECHAT_APPID or WECHAT_APP_SECRET is not configured');
  }

  if (cachedWechatAccessToken && cachedWechatAccessToken.expiresAt > Date.now()) {
    return cachedWechatAccessToken.value;
  }

  const query = new URLSearchParams({
    grant_type: 'client_credential',
    appid: config.wechatAppId,
    secret: config.wechatAppSecret,
  });
  const result = await requestWechatJson({
    method: 'GET',
    requestUrl: `https://api.weixin.qq.com/cgi-bin/token?${query.toString()}`,
  });
  const accessToken = String(result.access_token || '').trim();
  if (!accessToken) {
    throw new Error('failed to retrieve wechat access token');
  }

  cachedWechatAccessToken = {
    value: accessToken,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in || 7200) - 60) * 1000,
  };
  return accessToken;
};

const fetchWechatPhoneNumber = async (code) => {
  const accessToken = await fetchWechatAccessToken();
  const result = await requestWechatJson({
    method: 'POST',
    requestUrl: `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
    body: { code },
  });
  const phoneNumber = String(result.phone_info?.phoneNumber || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
    throw new Error('wechat did not return a valid phone number');
  }
  return phoneNumber;
};

const WECHAT_EXPRESS_COMPANY_CODES = [
  ['顺丰', 'SF'], ['申通', 'STO'], ['中通', 'ZTO'], ['圆通', 'YTO'], ['韵达', 'YUNDA'],
  ['百世', 'HTKY'], ['极兔', 'JTSD'], ['京东', 'JD'], ['邮政', 'YZPY'], ['EMS', 'EMS'],
  ['德邦', 'DBL'], ['天天', 'HHTT'], ['安能', 'ANE'], ['DHL', 'DHL'], ['UPS', 'UPS'],
];

const resolveWechatExpressCompanyCode = (value) => {
  const source = String(value || '').trim();
  if (!source) return '';
  const upper = source.toUpperCase();
  const knownCode = WECHAT_EXPRESS_COMPANY_CODES.find(([, code]) => code === upper);
  if (knownCode) return knownCode[1];
  const matched = WECHAT_EXPRESS_COMPANY_CODES.find(([name]) => source.includes(name));
  return matched ? matched[1] : source.slice(0, 128);
};

const resolveWechatDeliveryType = (value) => {
  switch (String(value || '').trim()) {
    case 'same_city':
    case 'same-city':
    case '同城配送':
      return 2;
    case 'virtual':
    case '虚拟发货':
      return 3;
    case 'logistics':
    case '物流快递':
    default:
      return 1;
  }
};

const WECHAT_SHIPPING_APPLIED_STATES = new Set(['2', '3', '4', '6']);

const isWechatShippingUnchangedError = (error) => {
  const message = String(error?.message || '').trim();
  return message.includes('发货信息未更新');
};

const isWechatShippingAppliedStatus = (status) =>
  WECHAT_SHIPPING_APPLIED_STATES.has(String(status || '').trim());

// 将已支付且已发货的本地订单同步到微信小程序“订单管理”。
const syncPurchaseOrderToWechatOrder = async (order = {}) => {
  const orderId = Number(order.id || 0);
  if (!orderId) return null;
  if (!config.wechatOrderSyncEnabled) {
    return updatePurchaseOrderWechatOrderSync(orderId, 'skipped', 'WECHAT_ORDER_SYNC_ENABLED=false');
  }
  if (!['paid', 'received', 'finished'].includes(String(order.status || '').trim())) {
    return updatePurchaseOrderWechatOrderSync(orderId, 'skipped', '订单尚未支付');
  }

  const shipData = order.shipData || {};
  // 后台订单对象使用 snake_case，小程序订单对象使用 camelCase。
  const deliveryType = String(shipData.deliveryType || shipData.delivery_type || '').trim();
  const logisticsType = resolveWechatDeliveryType(deliveryType);
  const trackingNo = String(shipData.expressNo || shipData.express_no || '').trim();
  const expressCompany = resolveWechatExpressCompanyCode(shipData.expressCompany || shipData.express_company);
  if (logisticsType === 1 && (!trackingNo || !expressCompany)) {
    return updatePurchaseOrderWechatOrderSync(orderId, 'pending', '等待后台录入物流单号');
  }

  try {
    const accessToken = await fetchWechatAccessToken();
    const transactionId = String(order.paymentTransactionId || '').trim();
    const outTradeNo = String(order.outTradeNo || '').trim();
    const openId = String(order.openId || '').trim();
    if (!openId) {
      throw new Error('缺少微信用户 openid');
    }
    const orderKey = transactionId
      ? { order_number_type: 2, transaction_id: transactionId }
      : { order_number_type: 1, mchid: config.wechatPayMerchantId, out_trade_no: outTradeNo };
    if (!transactionId && (!config.wechatPayMerchantId || !outTradeNo)) {
      throw new Error('缺少微信支付交易号、商户单号或商户号');
    }

    await requestWechatJson({
      method: 'POST',
      requestUrl: `https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info?access_token=${encodeURIComponent(accessToken)}`,
      body: {
        order_key: orderKey,
        logistics_type: logisticsType,
        delivery_mode: 1,
        is_all_delivered: true,
        shipping_list: [{
          ...(logisticsType !== 3 ? {
            tracking_no: trackingNo,
            express_company: expressCompany,
            contact: order.recipientPhone
              ? { receiver_contact: String(order.recipientPhone).trim().slice(0, 128) }
              : undefined,
          } : {}),
          item_desc: String(order.productTitleSnapshot || order.productTitle || `商品订单${orderId}`).slice(0, 120),
        }],
        upload_time: new Date().toISOString(),
        payer: { openid: openId },
      },
    });
    return updatePurchaseOrderWechatOrderSync(orderId, 'success', '');
  } catch (error) {
    const message = error && error.message ? error.message : String(error);

    // 微信对重复提交相同发货信息会返回“发货信息未更新”。此时以官方订单状态为准，
    // 避免已经发货的订单被最后一次重复提交覆盖成同步失败。
    if (isWechatShippingUnchangedError(error)) {
      try {
        const verifiedOrder = await confirmWechatShippingApplied(order);
        if (verifiedOrder) {
          return updatePurchaseOrderWechatOrderSync(orderId, 'success', '');
        }
      } catch (verificationError) {
        console.warn('[wechat-order-sync] duplicate shipping verification failed', {
          orderId,
          code: String(verificationError?.code || ''),
          message: String(verificationError?.message || verificationError || ''),
        });
      }
    }

    return updatePurchaseOrderWechatOrderSync(orderId, 'failed', message);
  }
};

// 从微信订单管理接口读取真实服务状态，不使用本地收货状态代替。
const syncPurchaseOrderWechatServiceStatus = async (order = {}) => {
  const orderId = Number(order.id || 0);
  if (!orderId) throw new Error('订单不存在');
  try {
    const transactionId = String(order.payment_transaction_id || order.paymentTransactionId || '').trim();
    const outTradeNo = String(order.out_trade_no || order.outTradeNo || '').trim();
    // 微信“查询订单”接口使用扁平参数，不使用发货接口的 order_key 结构。
    const queryPayload = {
      transaction_id: transactionId,
      merchant_id: config.wechatPayMerchantId,
      merchant_trade_no: outTradeNo,
    };
    if (!transactionId && (!config.wechatPayMerchantId || !outTradeNo)) {
      throw new Error('缺少微信支付交易号、商户单号或商户号');
    }
    const accessToken = await fetchWechatAccessToken();
    const result = await requestWechatJson({
      method: 'POST',
      requestUrl: `https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=${encodeURIComponent(accessToken)}`,
      body: queryPayload,
    });
    const rawStatus = result.order?.order_state ?? result.order_state;
    if (rawStatus === undefined || rawStatus === null || String(rawStatus).trim() === '') {
      throw new Error('微信接口未返回订单服务状态');
    }
    return updatePurchaseOrderWechatServiceStatus(orderId, String(rawStatus));
  } catch (error) {
    await updatePurchaseOrderWechatServiceStatus(orderId, 'unknown', error?.message || String(error));
    throw error;
  }
};

const confirmWechatShippingApplied = async (order = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }

    try {
      const verifiedOrder = await syncPurchaseOrderWechatServiceStatus(order);
      if (isWechatShippingAppliedStatus(verifiedOrder?.wechatServiceStatus)) {
        return verifiedOrder;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

// 查询微信官方订单状态，作为网页端更新“已收货”的唯一外部依据。
const fetchWechatShippingOrder = async (transactionId, merchantTradeNo) => {
  const normalizedTransactionId = String(transactionId || '').trim();
  if (!normalizedTransactionId) {
    const error = new Error('订单缺少微信支付订单号，无法同步确认收货');
    error.code = 'WECHAT_TRANSACTION_ID_MISSING';
    throw error;
  }

  const accessToken = await fetchWechatAccessToken();
  const result = await requestWechatJson({
    method: 'POST',
    requestUrl: `https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=${encodeURIComponent(accessToken)}`,
    body: {
      transaction_id: normalizedTransactionId,
      merchant_id: String(config.wechatPayMerchantId || '').trim(),
      merchant_trade_no: String(merchantTradeNo || '').trim(),
    },
  });

  return result.order || null;
};

const waitForWechatOrderSync = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, Math.max(0, Number(durationMs || 0)));
});

// 只有微信官方订单状态为“确认收货”或“交易完成”时，才允许更新本地订单。
const verifyWechatReceiptConfirmed = async (order, expectedOpenId) => {
  if (config.wechatPayMockMode) {
    throw new Error('模拟支付订单无法同步微信确认收货');
  }

  const transactionId = String(order?.paymentTransactionId || '').trim();
  const merchantTradeNo = String(order?.outTradeNo || '').trim();
  const merchantId = String(config.wechatPayMerchantId || '').trim();
  if (!transactionId || !merchantTradeNo || !merchantId) {
    throw new Error('微信订单信息不完整，暂时无法确认收货');
  }

  let wechatOrder = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await waitForWechatOrderSync(attempt * 500);
    }
    wechatOrder = await fetchWechatShippingOrder(transactionId, merchantTradeNo);
    const currentState = Number(wechatOrder?.order_state || 0);
    if (currentState === 3 || currentState === 4 || currentState === 5) {
      break;
    }
  }
  if (!wechatOrder) {
    throw new Error('未查询到微信订单，请稍后重试');
  }

  const returnedTransactionId = String(wechatOrder.transaction_id || '').trim();
  if (returnedTransactionId && returnedTransactionId !== transactionId) {
    throw new Error('微信订单校验失败，请稍后重试');
  }

  const returnedMerchantId = String(wechatOrder.merchant_id || '').trim();
  if (returnedMerchantId && returnedMerchantId !== merchantId) {
    throw new Error('微信订单商户号校验失败，请稍后重试');
  }

  const returnedMerchantTradeNo = String(wechatOrder.merchant_trade_no || '').trim();
  if (returnedMerchantTradeNo && returnedMerchantTradeNo !== merchantTradeNo) {
    throw new Error('微信订单商户单号校验失败，请稍后重试');
  }

  const returnedOpenId = String(wechatOrder.openid || '').trim();
  if (returnedOpenId && returnedOpenId !== String(expectedOpenId || '').trim()) {
    throw new Error('当前用户与微信订单不匹配，无法确认收货');
  }

  const orderState = Number(wechatOrder.order_state || 0);
  if (orderState === 5) {
    throw new Error('微信订单已退款，不能确认收货');
  }
  if (orderState !== 3 && orderState !== 4) {
    throw new Error('尚未在微信完成确认收货，请在微信确认页完成操作后重试');
  }
};

const fetchWechatSession = (code) => {
  if (config.allowMockWechatLogin) {
    const fakeOpenId = crypto.createHash('sha1').update(`mock:${code}`).digest('hex');
    return Promise.resolve({
      openid: `mock_${fakeOpenId.slice(0, 24)}`,
      session_key: fakeOpenId,
    });
  }

  if (!config.wechatAppId || !config.wechatAppSecret) {
    return Promise.reject(new Error('WECHAT_APPID or WECHAT_APP_SECRET is not configured'));
  }

  const requestUrl = buildWechatSessionUrl(code);

  return new Promise((resolve, reject) => {
    https
      .get(requestUrl, (wechatResponse) => {
        const chunks = [];

        wechatResponse.on('data', (chunk) => {
          chunks.push(chunk);
        });

        wechatResponse.on('end', () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!payload.openid) {
              reject(
                new Error(
                  payload.errmsg ||
                    payload.error_description ||
                    `failed to retrieve openid from wechat (errcode: ${payload.errcode || 'unknown'})`
                )
              );
              return;
            }
            resolve(payload);
          } catch (error) {
            reject(new Error(`invalid wechat response: ${error.message}`));
          }
        });
      })
      .on('error', reject);
  });
};

const createSessionPayload = (user) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    sub: user.openId,
    uid: user.uid || '',
    iat: issuedAt,
    exp: issuedAt + config.tokenExpiresInSeconds,
  };
};

const requireAuthUser = async (request) => {
  const token = getBearerToken(request);
  const session = verifyToken(token);

  if (!session || !session.sub) {
    return null;
  }

  return getUserByOpenId(session.sub);
};

const getAdminSession = async (request) => {
  const token = getAdminToken(request);
  const session = verifyToken(token);

  if (!session || session.role !== 'admin' || !session.adminId) {
    return { user: null, expiredByNewLogin: false };
  }

  const user = await getAdminById(session.adminId);
  if (!user) {
    return { user: null, expiredByNewLogin: false };
  }

  return {
    user: Number(session.sessionVersion) === Number(user.sessionVersion)
      ? user
      : null,
    expiredByNewLogin: Number(session.sessionVersion) !== Number(user.sessionVersion),
  };
};

const unauthorizedPayload = {
  success: false,
  message: 'unauthorized',
  code: 'UNAUTHORIZED',
};

const isValidMode = (value) => value === 'buy' || value === 'cart';

const isValidRecycleTheme = (value) =>
  value === 'red' || value === 'blue' || value === 'gray' || value === 'green';

const normalizeStringMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.keys(value).reduce((result, key) => {
    const currentValue = value[key];
    if (typeof currentValue === 'string') {
      result[key] = currentValue;
    }
    return result;
  }, {});
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
};

const isConfiguredForRealWechatPay = () => {
  return Boolean(
    config.wechatAppId &&
    config.wechatPayMerchantId &&
    config.wechatPayNotifyUrl &&
    (config.wechatPayPrivateKeyPath || config.wechatPayPrivateKey) &&
    config.wechatPaySerialNo &&
    config.wechatPayApiV3Key
  );
};

const isConfiguredForRealWechatTransfer = () => {
  return Boolean(
    isConfiguredForRealWechatPay() &&
    config.wechatTransferNotifyUrl &&
    config.wechatPayPublicKeyId &&
    config.wechatPayPublicKeyPath
  );
};

const createNonceStr = () => crypto.randomBytes(16).toString('hex');

let cachedWechatPayPrivateKey = null;
let cachedWechatPayPublicKey = null;

const resolveConfigFilePath = (filePath) => {
  if (!filePath) {
    return '';
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
};

const getWechatPayPrivateKey = () => {
  if (cachedWechatPayPrivateKey) {
    return cachedWechatPayPrivateKey;
  }

  if (config.wechatPayPrivateKey) {
    cachedWechatPayPrivateKey = config.wechatPayPrivateKey;
    return cachedWechatPayPrivateKey;
  }

  if (!config.wechatPayPrivateKeyPath) {
    throw new Error('WECHAT_PAY_PRIVATE_KEY_PATH is not configured');
  }

  cachedWechatPayPrivateKey = fs.readFileSync(resolveConfigFilePath(config.wechatPayPrivateKeyPath), 'utf8');
  return cachedWechatPayPrivateKey;
};

const getWechatPayPublicKey = () => {
  if (cachedWechatPayPublicKey) {
    return cachedWechatPayPublicKey;
  }

  if (!config.wechatPayPublicKeyPath) {
    throw new Error('WECHAT_PAY_PUBLIC_KEY_PATH is not configured');
  }

  cachedWechatPayPublicKey = fs.readFileSync(resolveConfigFilePath(config.wechatPayPublicKeyPath), 'utf8');
  return cachedWechatPayPublicKey;
};

const createWechatPayAuthorization = ({ method, pathname, body = '' }) => {
  const nonceStr = createNonceStr();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${method}\n${pathname}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(message)
    .sign(getWechatPayPrivateKey(), 'base64');

  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechatPayMerchantId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.wechatPaySerialNo}"`;
};

const sendWechatPayRequest = ({ method, pathname, body, headers = {} }) =>
  new Promise((resolve, reject) => {
    const requestBody = body ? JSON.stringify(body) : '';
    const request = https.request(
      {
        hostname: 'api.mch.weixin.qq.com',
        path: pathname,
        method,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'miniprogram-backend/1.0',
          'Content-Type': 'application/json',
          Authorization: createWechatPayAuthorization({
            method,
            pathname,
            body: requestBody,
          }),
          'Content-Length': Buffer.byteLength(requestBody),
          ...headers,
        },
      },
      (wechatResponse) => {
        const chunks = [];

        wechatResponse.on('data', (chunk) => {
          chunks.push(chunk);
        });

        wechatResponse.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8');
          let payload = {};

          if (rawText) {
            try {
              payload = JSON.parse(rawText);
            } catch (_error) {
              payload = {
                raw: rawText,
              };
            }
          }

          if (wechatResponse.statusCode >= 400) {
            const error = new Error(
              (payload && payload.message) || `wechat pay request failed with status ${wechatResponse.statusCode}`
            );
            error.statusCode = wechatResponse.statusCode;
            error.payload = payload;
            reject(error);
            return;
          }

          resolve(payload);
        });
      }
    );

    request.on('error', reject);

    if (requestBody) {
      request.write(requestBody);
    }

    request.end();
  });

const buildWechatPayAmountInFen = (order) => {
  const totalAmount = Number(order.totalAmount || 0);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('invalid order total amount');
  }

  return Math.round(totalAmount * 100);
};

const trimWechatPaymentText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const sliceUtf8TextByBytes = (value, maxBytes = 120) => {
  const normalizedText = String(value || '');
  let totalBytes = 0;
  let result = '';

  for (const character of normalizedText) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (totalBytes + characterBytes > maxBytes) {
      break;
    }

    result += character;
    totalBytes += characterBytes;
  }

  return result;
};

const buildWechatPaymentDescription = (order = {}) => {
  const productTitle = trimWechatPaymentText(
    order.productTitleSnapshot || order.productTitle || order.title || order.product_title_snapshot || ''
  );
  if (productTitle) {
    return sliceUtf8TextByBytes(productTitle, 120);
  }

  const batchNo = trimWechatPaymentText(order.batchNo || order.orderNo || '');
  if (batchNo) {
    return sliceUtf8TextByBytes(`批量商品订单 ${batchNo}`, 120);
  }

  const outTradeNo = trimWechatPaymentText(order.outTradeNo || '');
  if (outTradeNo) {
    return sliceUtf8TextByBytes(`商品订单 ${outTradeNo}`, 120);
  }

  return sliceUtf8TextByBytes(`商品订单 ${Number(order.id || 0) || ''}`, 120) || '商品订单';
};

const buildRealWechatPayment = async (order, openId) => {
  const amountInFen = buildWechatPayAmountInFen(order);
  const body = {
    appid: config.wechatAppId,
    mchid: config.wechatPayMerchantId,
    description: `閻犱降鍨瑰畷鐔煎绩椤栨瑧甯?#${order.id}`,
    out_trade_no: order.outTradeNo,
    notify_url: config.wechatPayNotifyUrl,
    amount: {
      total: amountInFen,
      currency: 'CNY',
    },
    payer: {
      openid: openId,
    },
  };
  body.description = buildWechatPaymentDescription(order);

  const payload = await sendWechatPayRequest({
    method: 'POST',
    pathname: '/v3/pay/transactions/jsapi',
    body,
  });

  if (!payload.prepay_id) {
    throw new Error('wechat pay response missing prepay_id');
  }

  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = createNonceStr();
  const packageValue = `prepay_id=${payload.prepay_id}`;
  const paySignMessage = `${config.wechatAppId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const paySign = crypto
    .createSign('RSA-SHA256')
    .update(paySignMessage)
    .sign(getWechatPayPrivateKey(), 'base64');

  return {
    mode: 'real',
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign,
  };
};

const queryWechatPayOrderByOutTradeNo = async (outTradeNo) => {
  const pathname = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(
    String(outTradeNo || '')
  )}?mchid=${encodeURIComponent(config.wechatPayMerchantId)}`;

  return sendWechatPayRequest({
    method: 'GET',
    pathname,
  });
};

const parseRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    request.on('error', reject);
  });

const decryptWechatPayResource = (resource) => {
  if (!resource || typeof resource !== 'object') {
    throw new Error('missing wechat pay resource');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.wechatPayApiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8')
  );

  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }

  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const authTag = ciphertext.slice(ciphertext.length - 16);
  const encrypted = ciphertext.slice(0, ciphertext.length - 16);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
};

const verifyWechatPaySignature = (request, rawBody) => {
  const signature = String(request.headers['wechatpay-signature'] || '');
  const timestamp = String(request.headers['wechatpay-timestamp'] || '');
  const nonce = String(request.headers['wechatpay-nonce'] || '');
  const serial = String(request.headers['wechatpay-serial'] || '');

  if (!signature || !timestamp || !nonce) {
    throw new Error('missing wechat pay signature headers');
  }

  if (config.wechatPayPublicKeyId && serial && config.wechatPayPublicKeyId !== serial) {
    throw new Error('unexpected wechat pay public key serial');
  }

  const message = `${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(message);
  verifier.end();
  const verified = verifier.verify(getWechatPayPublicKey(), signature, 'base64');

  if (!verified) {
    throw new Error('invalid wechat pay signature');
  }
};

const sendWechatNotifySuccess = (response) => {
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(
    JSON.stringify({
      code: 'SUCCESS',
      message: '????',
    })
  );
};

const sendWechatNotifyFail = (response, message) => {
  response.writeHead(500, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(
    JSON.stringify({
      code: 'FAIL',
      message: message || '????',
    })
  );
};

const buildOutTradeNo = (order) => {
  return String(order.orderNo || order.outTradeNo || '');
};

const buildMockWechatPayment = (order) => {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = createNonceStr();
  const packageValue = `prepay_id=mock_${order.id}_${Date.now()}`;
  const paySign = crypto
    .createHash('sha256')
    .update(`${timeStamp}\n${nonceStr}\n${packageValue}\n`)
    .digest('hex');

  return {
    mode: 'mock',
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign,
    mockMessage: '????????????????',
  };
};

const syncRealWechatPaymentResult = async (order) => {
  if (!order) {
    return null;
  }

  if (order.status === 'paid') {
    return order;
  }

  if (!order.outTradeNo) {
    return order;
  }

  const payload = await queryWechatPayOrderByOutTradeNo(order.outTradeNo);
  if (String(payload.trade_state || '') === 'SUCCESS') {
    return markPurchaseOrderPaidByOutTradeNo(order.outTradeNo, payload.transaction_id || '');
  }

  return getPurchaseOrderByOutTradeNo(order.outTradeNo);
};

const syncRealWechatPaymentBatchResult = async (batch) => {
  if (!batch) {
    return null;
  }

  if (batch.status === 'paid') {
    return batch;
  }

  if (!batch.outTradeNo) {
    return batch;
  }

  const payload = await queryWechatPayOrderByOutTradeNo(batch.outTradeNo);
  if (String(payload.trade_state || '') === 'SUCCESS') {
    return markPaymentBatchPaidByOutTradeNo(batch.outTradeNo, payload.transaction_id || '');
  }

  return getPaymentBatchByOutTradeNo(batch.outTradeNo);
};

const sanitizePurchaseOrder = (order) => ({
  id: Number(order.id || 0),
  productId: Number(order.productId || 0),
  productSnapshotNo: String(order.productCodeSnapshot || ''),
  productSnapshotTitle: String(order.productTitleSnapshot || ''),
  productSnapshotSubtitle: String(order.productCoverTitleSnapshot || ''),
  productSnapshotCoverImage: String(order.productCoverSnapshot || ''),
  addressId: Number(order.addressId || 0),
  orderNo: String(order.orderNo || ''),
  sourceMode: isValidMode(order.sourceMode) ? order.sourceMode : 'buy',
  recipientName: String(order.recipientName || ''),
  recipientPhone: String(order.recipientPhone || ''),
  addressDetail: String(order.addressDetail || ''),
  paymentMethod: String(order.paymentMethod || ''),
  remark: String(order.remark || ''),
  totalAmount: Number(order.totalAmount || 0),
  status: String(order.status || 'submitted'),
  outTradeNo: String(order.outTradeNo || ''),
  paidAt: Number(order.paidAt || 0),
  paymentTransactionId: String(order.paymentTransactionId || ''),
  wechatOrderSyncStatus: String(order.wechatOrderSyncStatus || 'pending'),
  wechatOrderSyncError: String(order.wechatOrderSyncError || ''),
  wechatOrderSyncedAt: Number(order.wechatOrderSyncedAt || 0),
  shipData: order.shipData
    ? {
        expressCompany: String(order.shipData.expressCompany || ''),
        expressNo: String(order.shipData.expressNo || ''),
        expressTime: String(order.shipData.expressTime || ''),
      }
    : null,
  createdAt: Number(order.createdAt || 0),
  updatedAt: Number(order.updatedAt || 0),
});

const getRecycleOrderStatusLabel = (status) => {
  switch (String(status || '').trim()) {
    case 'submitted':
      return '审核中';
    case 'needs_fix':
      return '已打回';
    case 'approved':
      return '已通过';
    case 'published':
      return '已卖出';
    default:
      return '处理中';
  }
};

const sanitizePaymentBatch = (batch) => ({
  id: Number(batch.id || 0),
  batchNo: String(batch.batchNo || ''),
  outTradeNo: String(batch.outTradeNo || ''),
  orderIds: Array.isArray(batch.orderIds)
    ? batch.orderIds.map((id) => Number(id || 0)).filter((id) => id > 0)
    : [],
  totalAmount: Number(batch.totalAmount || 0),
  status: String(batch.status || 'pending_payment'),
  transactionId: String(batch.transactionId || ''),
  paidAt: Number(batch.paidAt || 0),
  createdAt: Number(batch.createdAt || 0),
  updatedAt: Number(batch.updatedAt || 0),
});

const sanitizeAddress = (address) => ({
  id: Number(address.id || 0),
  recipientName: String(address.recipientName || ''),
  recipientPhone: String(address.recipientPhone || ''),
  province: String(address.province || ''),
  city: String(address.city || ''),
  district: String(address.district || ''),
  addressDetail: String(address.addressDetail || ''),
  postalCode: String(address.postalCode || ''),
  isDefault: Boolean(address.isDefault),
  createdAt: Number(address.createdAt || 0),
  updatedAt: Number(address.updatedAt || 0),
});

const sanitizeRecycleSettlement = (settlement) => ({
  id: Number(settlement.id || 0),
  recycleOrderId: Number(settlement.recycleOrderId || 0),
  orderNo: String(settlement.orderNo || ''),
  outBillNo: String(settlement.outBillNo || ''),
  transferBillNo: String(settlement.transferBillNo || ''),
  appId: String(settlement.appId || ''),
  mchId: String(settlement.mchId || ''),
  amount: Number(settlement.amount || 0),
  state: String(settlement.state || 'PENDING'),
  stateDesc: String(settlement.stateDesc || ''),
  transferRemark: String(settlement.transferRemark || ''),
  packageInfo: String(settlement.packageInfo || ''),
  userName: String(settlement.userName || ''),
  userRecvPerception: String(settlement.userRecvPerception || ''),
  failReason: String(settlement.failReason || ''),
  wechatCreateTime: String(settlement.wechatCreateTime || ''),
  acceptTime: Number(settlement.acceptTime || 0),
  successTime: Number(settlement.successTime || 0),
  cancelTime: Number(settlement.cancelTime || 0),
  paymentProofImages: Array.isArray(settlement.paymentProofImages) ? settlement.paymentProofImages : [],
  adminId: settlement.adminId === null || settlement.adminId === undefined ? null : Number(settlement.adminId || 0),
  createdAt: Number(settlement.createdAt || 0),
  updatedAt: Number(settlement.updatedAt || 0),
});

const sanitizeRecycleOrder = (order) => ({
  id: Number(order.id || 0),
  recycleProductId: order.recycleProductId === null || order.recycleProductId === undefined ? null : Number(order.recycleProductId || 0),
  orderNo: String(order.orderNo || ''),
  categoryKey: String(order.categoryKey || ''),
  title: String(order.title || ''),
  coverLabel: String(order.coverLabel || ''),
  coverImage: String(order.coverImage || ''),
  coverTheme: isValidRecycleTheme(order.coverTheme) ? order.coverTheme : 'red',
  payoutMethodLabel: String(order.payoutMethodLabel || ''),
  accountNumber: String(order.accountNumber || ''),
  realName: String(order.realName || ''),
  optionSummary: String(order.optionSummary || ''),
  selectedDeviceOptionValues: normalizeStringMap(order.selectedDeviceOptionValues),
  selectedDeviceOptionTexts: normalizeStringMap(order.selectedDeviceOptionTexts),
  submissionImages: normalizeStringArray(order.submissionImages),
  estimateSupported: Boolean(order.estimateSupported),
  estimateBasePrice: Number(order.estimateBasePrice || 0),
  estimateFinalPrice: Number(order.estimateFinalPrice || 0),
  note: String(order.note || ''),
  sfExpressNumber: String(order.sfExpressNumber || ''),
  status: String(order.status || 'submitted'),
  statusLabel: getRecycleOrderStatusLabel(order.status),
  userStatus: String(order.userStatus || 'confirmed'),
  userResponseStatus: String(order.userResponseStatus || ''),
  returnAddress: order.returnAddress && typeof order.returnAddress === 'object'
    ? {
        addressId: Number(order.returnAddress.addressId || 0),
        recipientName: String(order.returnAddress.recipientName || ''),
        recipientPhone: String(order.returnAddress.recipientPhone || ''),
        province: String(order.returnAddress.province || ''),
        city: String(order.returnAddress.city || ''),
        district: String(order.returnAddress.district || ''),
        addressDetail: String(order.returnAddress.addressDetail || ''),
      }
    : null,
  reviewNote: String(order.reviewNote || ''),
  productSnapshot: order.productSnapshot && typeof order.productSnapshot === 'object' ? order.productSnapshot : null,
  publishedProductId: order.publishedProductId === null || order.publishedProductId === undefined ? null : Number(order.publishedProductId || 0),
  reviewedAt: Number(order.reviewedAt || 0),
  publishedAt: Number(order.publishedAt || 0),
  createdAt: Number(order.createdAt || 0),
  updatedAt: Number(order.updatedAt || 0),
  settlement: order.settlement ? sanitizeRecycleSettlement(order.settlement) : null,
});

const sanitizeRecycleOptionGroup = (group) => ({
  id: Number(group.id || 0),
  sourceKey: String(group.sourceKey || ''),
  key: String(group.key || ''),
  label: String(group.label || ''),
  required: Boolean(group.required),
  sortOrder: Number(group.sortOrder || 0),
  status: Number(group.status || 0),
  options: Array.isArray(group.options)
    ? group.options.map((option) => ({
        id: Number(option.id || 0),
        sourceKey: String(option.sourceKey || ''),
        value: String(option.value || ''),
        label: String(option.label || ''),
        effectType: String(option.effectType || 'none'),
        priceDelta: Number(option.priceDelta || 0),
        noteText: String(option.noteText || ''),
        imageUrls: Array.isArray(option.imageUrls)
          ? option.imageUrls.map((url) => String(url || '').trim()).filter(Boolean)
          : [],
        sortOrder: Number(option.sortOrder || 0),
        status: Number(option.status || 0),
      }))
    : [],
});

const sanitizeRecycleProduct = (product) => ({
  id: Number(product.id || 0),
  sourceKey: String(product.sourceKey || ''),
  productId: product.productId === null || product.productId === undefined ? null : Number(product.productId || 0),
  categoryKey: String(product.categoryKey || ''),
  optionProfileKey: String(product.optionProfileKey || ''),
  title: String(product.title || ''),
  subtitle: String(product.subtitle || ''),
  coverLabel: String(product.coverLabel || ''),
  coverImage: String(product.coverImage || ''),
  coverTheme: isValidRecycleTheme(product.coverTheme) ? product.coverTheme : 'red',
  maxRecyclePrice: Number(product.maxRecyclePrice || 0),
  hintText: String(product.hintText || ''),
  quoteMode: String(product.quoteMode || 'rule_based'),
  pricingRuleJson: product.pricingRuleJson && typeof product.pricingRuleJson === 'object' ? product.pricingRuleJson : {},
  status: Number(product.status || 0),
  sortOrder: Number(product.sortOrder || 0),
  optionGroups: Array.isArray(product.optionGroups) ? product.optionGroups.map(sanitizeRecycleOptionGroup) : undefined,
});

const sanitizeRecycleQuote = (quote) => ({
  supported: Boolean(quote.supported),
  baseLabel: String(quote.baseLabel || ''),
  basePrice: Number(quote.basePrice || 0),
  maxRecyclePrice: Number(quote.maxRecyclePrice || 0),
  accessoryDeduction: Number(quote.accessoryDeduction || 0),
  issueDeduction: Number(quote.issueDeduction || 0),
  finalPrice: Number(quote.finalPrice || 0),
  note: String(quote.note || ''),
  accessoryItems: Array.isArray(quote.accessoryItems)
    ? quote.accessoryItems.map((item) => ({
        label: String(item.label || ''),
        amount: Number(item.amount || 0),
      }))
    : [],
  issueItems: Array.isArray(quote.issueItems)
    ? quote.issueItems.map((item) => ({
        label: String(item.label || ''),
        amount: Number(item.amount || 0),
      }))
    : [],
  selectedDeviceOptionTexts: normalizeStringMap(quote.selectedDeviceOptionTexts),
  optionSummary: String(quote.optionSummary || ''),
});

const ADMIN_CONFIRMED_RECYCLE_SETTLEMENT_STATE = 'ADMIN_CONFIRMED';
const ACTIVE_RECYCLE_SETTLEMENT_STATES = new Set(['WAIT_USER_CONFIRM', 'TRANSFERING', 'CANCELING']);
const SYNCABLE_RECYCLE_SETTLEMENT_STATES = new Set([
  'PENDING',
  'ACCEPTED',
  'PROCESSING',
  'WAIT_USER_CONFIRM',
  'TRANSFERING',
  'CANCELING',
]);

const attachLatestSettlementsToRecycleOrders = async (orders = []) => {
  if (!Array.isArray(orders) || !orders.length) {
    return [];
  }

  const latestSettlements = await listLatestRecycleSettlementsByOrderIds(orders.map((item) => item.id));
  const settlementMap = new Map(latestSettlements.map((item) => [Number(item.recycleOrderId || 0), item]));

  return orders.map((item) => ({
    ...item,
    settlement: settlementMap.get(Number(item.id || 0)) || null,
  }));
};

const isWechatRecyclePayoutMethod = (order) => String(order?.payoutMethodLabel || '').trim() === '微信零钱';
const isAlipayRecyclePayoutMethod = (order) => {
  const payoutMethod = String(order?.payoutMethodLabel || '').trim().toLowerCase();
  return payoutMethod.includes('支付宝') || payoutMethod === 'alipay';
};

const assertCanCreateRecycleSettlement = (order) => {
  if (!order) {
    throw new Error('未找到回收单');
  }

  if (String(order.userStatus || '') === 'cancelled') {
    throw new Error('用户已取消该回收单，不能进行打款前确认');
  }

  if (!['approved', 'published', 'reviewed'].includes(String(order.status || ''))) {
    throw new Error('当前回收单还不能确认领取资格，请先完成审核');
  }

  if (Number(order.estimateFinalPrice || 0) <= 0) {
    throw new Error('当前结款金额必须大于 0，请先填写最终估价');
  }

  if (!isWechatRecyclePayoutMethod(order)) {
    throw new Error('只有选择微信零钱收款的回收单需要确认领取资格');
  }
};

const createRecycleSettlementConfirmationOutBillNo = (order) => {
  const orderId = Number(order?.id || 0);
  return `RC${String(orderId).padStart(6, '0')}${Date.now()}${crypto.randomBytes(3).toString('hex')}`.slice(0, 64);
};

const createManualAlipaySettlementForOrder = async (order, paymentProofImages = [], adminId = null) => {
  if (!order) {
    throw new Error('未找到回收单');
  }

  if (!isAlipayRecyclePayoutMethod(order)) {
    throw new Error('只有选择支付宝收款的回收单才能上传打款证明');
  }

  if (String(order.userStatus || '') === 'cancelled') {
    throw new Error('用户已取消该回收单，不能确认打款');
  }

  if (!['approved', 'published', 'reviewed'].includes(String(order.status || ''))) {
    throw new Error('当前回收单还不能打款，请先完成审核后再发起');
  }

  if (Number(order.estimateFinalPrice || 0) <= 0) {
    throw new Error('当前结款金额必须大于 0，请先填写最终估价');
  }

  const proofImages = Array.isArray(paymentProofImages)
    ? paymentProofImages.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!proofImages.length) {
    throw new Error('请先上传至少一张打款证明图片');
  }

  const currentSettlement = await getLatestRecycleSettlementByOrderId(order.id);
  if (String(currentSettlement?.state || '').toUpperCase() === 'SUCCESS') {
    return currentSettlement;
  }

  const paidAt = Date.now();
  return createRecycleSettlement({
    recycleOrderId: order.id,
    openId: order.openId,
    orderNo: order.orderNo,
    outBillNo: createRecycleSettlementConfirmationOutBillNo(order),
    amount: Number(order.estimateFinalPrice || 0),
    state: 'SUCCESS',
    stateDesc: '支付宝人工打款完成，打款证明已上传',
    userName: order.realName || '',
    successTime: paidAt,
    paymentProofImages: proofImages,
    queryRaw: JSON.stringify({ payoutChannel: 'alipay_manual' }),
    adminId,
  });
};

const confirmRecycleSettlementForOrder = async (order, adminId = null) => {
  assertCanCreateRecycleSettlement(order);

  const currentSettlement = await getLatestRecycleSettlementByOrderId(order.id);
  const currentState = String(currentSettlement?.state || '').toUpperCase();

  if (currentSettlement && currentState === 'SUCCESS') {
    return currentSettlement;
  }

  if (currentSettlement && currentState === ADMIN_CONFIRMED_RECYCLE_SETTLEMENT_STATE) {
    return currentSettlement;
  }

  if (currentSettlement && ACTIVE_RECYCLE_SETTLEMENT_STATES.has(currentState)) {
    return (await syncRecycleSettlementByOrder(order)) || currentSettlement;
  }

  if (
    currentSettlement
    && SYNCABLE_RECYCLE_SETTLEMENT_STATES.has(currentState)
    && currentSettlement.outBillNo
  ) {
    return (await syncRecycleSettlementByOrder(order)) || currentSettlement;
  }

  return createRecycleSettlement({
    recycleOrderId: order.id,
    openId: order.openId,
    orderNo: order.orderNo,
    outBillNo: createRecycleSettlementConfirmationOutBillNo(order),
    transferBillNo: '',
    appId: config.wechatAppId,
    mchId: config.wechatPayMerchantId,
    amount: Number(order.estimateFinalPrice || 0),
    state: ADMIN_CONFIRMED_RECYCLE_SETTLEMENT_STATE,
    stateDesc: '管理员已确认，待用户在小程序领取',
    transferRemark: '',
    packageInfo: '',
    userName: order.realName || '',
    userRecvPerception: config.wechatTransferUserRecvPerception,
    failReason: '',
    wechatCreateTime: '',
    acceptTime: 0,
    successTime: 0,
    cancelTime: 0,
    queryRaw: '',
    adminId,
  });
};

const createRecycleSettlementForOrder = async (order, adminId = null) => {
  assertCanCreateRecycleSettlement(order);

  const currentSettlement = await getLatestRecycleSettlementByOrderId(order.id);
  const currentState = String(currentSettlement?.state || '').toUpperCase();

  if (currentSettlement && currentState === 'SUCCESS') {
    return currentSettlement;
  }

  if (
    currentSettlement
    && (ACTIVE_RECYCLE_SETTLEMENT_STATES.has(currentState) || SYNCABLE_RECYCLE_SETTLEMENT_STATES.has(currentState))
  ) {
    if (!currentSettlement.outBillNo) {
      return currentSettlement;
    }

    if (currentState === 'WAIT_USER_CONFIRM' && !String(currentSettlement.packageInfo || '').trim()) {
      const payload = await createWechatTransferBill(order, currentSettlement.outBillNo);
      return updateRecycleSettlementById(
        currentSettlement.id,
        buildRecycleSettlementClaimPatch(order, payload)
      );
    }

    return (await syncRecycleSettlementByOrder(order)) || currentSettlement;
  }

  if (!currentSettlement || currentState !== ADMIN_CONFIRMED_RECYCLE_SETTLEMENT_STATE) {
    const error = new Error('管理员尚未完成打款前确认，请先联系管理员确认');
    error.statusCode = 400;
    throw error;
  }

  let payload = null;
  if (!config.wechatPayMockMode) {
    try {
      payload = await queryWechatTransferBillByOutBillNo(currentSettlement.outBillNo);
    } catch (error) {
      if (Number(error?.statusCode || 0) !== 404) {
        throw error;
      }
    }
  }

  if (!payload) {
    try {
      payload = await createWechatTransferBill(order, currentSettlement.outBillNo);
    } catch (error) {
      const errorCode = String(error?.payload?.code || '').trim().toUpperCase();
      if (Number(error?.statusCode || 0) !== 400 || errorCode !== 'ALREADY_EXISTS') {
        throw error;
      }

      payload = await queryWechatTransferBillByOutBillNo(currentSettlement.outBillNo);
    }
  }

  return updateRecycleSettlementById(
    currentSettlement.id,
    buildRecycleSettlementClaimPatch(order, payload)
  );
};

const syncRecycleSettlementByOrder = async (order) => {
  if (!order) {
    return null;
  }

  const currentSettlement = await getLatestRecycleSettlementByOrderId(order.id);
  if (!currentSettlement) {
    return null;
  }

  const currentState = String(currentSettlement.state || '').toUpperCase();
  if (currentState === ADMIN_CONFIRMED_RECYCLE_SETTLEMENT_STATE) {
    return currentSettlement;
  }

  if (currentState === 'WAIT_USER_CONFIRM' && !String(currentSettlement.packageInfo || '').trim()) {
    const payload = await createWechatTransferBill(order, currentSettlement.outBillNo);
    return updateRecycleSettlementById(
      currentSettlement.id,
      buildRecycleSettlementClaimPatch(order, payload)
    );
  }

  const payload = await queryWechatTransferBillByOutBillNo(currentSettlement.outBillNo);
  if (!payload) {
    return currentSettlement;
  }

  return updateRecycleSettlementByOutBillNo(currentSettlement.outBillNo, buildRecycleSettlementPatchFromWechat(payload));
};

const SF_PICKUP_CANCELED_NOTE = '【顺丰取件】已取消';

const normalizeSfPickupStartTime = ({ pickupStartTime, pickupTimeText, now = new Date() }) => {
  const normalizedStartTime = String(pickupStartTime || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalizedStartTime)) {
    return normalizedStartTime;
  }

  const matched = String(pickupTimeText || '').trim().match(/^(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})-/);
  if (!matched) {
    return '';
  }

  const month = Number(matched[1]);
  const day = Number(matched[2]);
  const hour = Number(matched[3]);
  const minute = Number(matched[4]);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const appointmentLimit = new Date(todayStart);
  appointmentLimit.setDate(appointmentLimit.getDate() + 2);
  const pad = (value) => String(value).padStart(2, '0');

  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
    const isValidDate = candidate.getFullYear() === year
      && candidate.getMonth() === month - 1
      && candidate.getDate() === day
      && candidate.getHours() === hour
      && candidate.getMinutes() === minute;
    if (isValidDate && candidate >= todayStart && candidate < appointmentLimit) {
      return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:00`;
    }
  }

  return '';
};

const appendRecycleNote = (currentNote, extraNote) => {
  const currentText = String(currentNote || '').trim();
  const nextText = String(extraNote || '').trim();

  if (!nextText) {
    return currentText;
  }

  if (!currentText) {
    return nextText;
  }

  return `${currentText}\n${nextText}`;
};

const parseSfPickupNote = (note) => {
  const lines = String(note || '')
    .split(/[\r\n；;]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const getValueByPrefix = (prefix) => {
    const matchedLine = lines.find((line) => line.startsWith(prefix));
    return matchedLine ? matchedLine.slice(prefix.length).trim() : '';
  };

  return {
    isSfPickup: lines.includes('【回收寄出】顺丰上门取件'),
    pickupOrderId: getValueByPrefix('丰桥订单号：'),
    waybillNo: getValueByPrefix('顺丰运单号：'),
    canceled: lines.some((line) => line.includes(SF_PICKUP_CANCELED_NOTE)),
  };
};

const buildSfPickupCancelNote = () => `${SF_PICKUP_CANCELED_NOTE}；取消时间：${new Date().toISOString()}`;

const buildSfPickupServiceNote = ({ pickupOrder, pickupTimeText, customerAddress }) => [
  '【回收寄出】顺丰上门取件',
  pickupOrder.orderId ? `丰桥订单号：${pickupOrder.orderId}` : '',
  pickupOrder.waybillNo ? `顺丰运单号：${pickupOrder.waybillNo}` : '',
  pickupTimeText ? `上门时间：${pickupTimeText}` : '',
  customerAddress ? `取件地址：${customerAddress}` : '',
].filter(Boolean).join('；');

const buildSfCloudPrintDocumentsFromWaybillNo = (waybillNo) => {
  const masterWaybillNo = String(waybillNo || '').trim();
  if (!masterWaybillNo) {
    throw new Error('waybillNo is required for sf cloud print');
  }

  return [{ masterWaybillNo }];
};

const parseSfBusinessMessageData = (businessPayload = {}) => {
  const value = businessPayload && businessPayload.msgData;
  if (!value || typeof value === 'object') {
    return value || {};
  }

  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return {};
  }
};

let sfExpressSenderOverride = null;

const normalizeSfExpressSenderConfig = (source = {}) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }

  const sender = {
    recipientName: String(source.recipientName || '').trim(),
    recipientPhone: String(source.recipientPhone || '').trim(),
    company: String(source.company || '').trim(),
    province: String(source.province || '').trim(),
    city: String(source.city || '').trim(),
    district: String(source.district || '').trim(),
    addressDetail: String(source.addressDetail || '').trim(),
  };

  return Object.values(sender).some(Boolean) ? sender : null;
};

const applySfExpressSenderConfig = (sysconfig = {}) => {
  sfExpressSenderOverride = normalizeSfExpressSenderConfig(
    sysconfig.sfExpressSender || sysconfig.sf_express_sender,
  );
  return sfExpressSenderOverride;
};

const buildSfExpressDisplayAddress = (senderAddress = {}) => {
  const detail = String(senderAddress.addressDetail || '').trim();
  const province = String(senderAddress.province || '').trim();
  const city = String(senderAddress.city || '').trim();
  const district = String(senderAddress.district || '').trim();
  const region = Array.from(new Set([province, city, district].filter(Boolean))).join('');

  if (!detail) {
    return region;
  }

  if (!region || detail.startsWith(province) || detail.startsWith(region)) {
    return detail;
  }

  return `${region}${detail}`;
};

const buildSfExpressRuntimeConfig = () => {
  const senderOverride = sfExpressSenderOverride || {};

  return {
    partnerId: String(config.sfExpressPartnerId || '').trim(),
    checkWord: String(config.sfExpressCheckWord || '').trim(),
    endpointUrl: String(config.sfExpressEndpointUrl || '').trim(),
    serviceCode: String(config.sfExpressServiceCode || 'EXP_RECE_CREATE_ORDER').trim(),
    signMode: String(config.sfExpressSignMode || '').trim(),
    timeoutMs: Number(config.sfExpressTimeoutMs || 15000),
    useSandbox: Boolean(config.sfExpressUseSandbox),
    defaultWeightKg: Number(config.sfExpressDefaultWeightKg || 1),
    senderAddress: {
      recipientName: String(config.sfExpressSenderName || '').trim(),
      recipientPhone: String(config.sfExpressSenderPhone || '').trim(),
      company: String(config.sfExpressSenderCompany || '').trim(),
      province: String(config.sfExpressSenderProvince || '').trim(),
      city: String(config.sfExpressSenderCity || '').trim(),
      district: String(config.sfExpressSenderDistrict || '').trim(),
      addressDetail: String(config.sfExpressSenderAddress || '').trim(),
      ...senderOverride,
    },
  };
};

const isSfExpressApiConfigured = () => {
  const runtimeConfig = buildSfExpressRuntimeConfig();
  return Boolean(runtimeConfig.partnerId && runtimeConfig.checkWord && runtimeConfig.endpointUrl);
};

const isSfExpressConfigured = () => {
  const runtimeConfig = buildSfExpressRuntimeConfig();
  const sender = runtimeConfig.senderAddress;
  return Boolean(
    isSfExpressApiConfigured()
    && sender.recipientName
    && sender.recipientPhone
    && sender.province
    && sender.city
    && sender.district
    && sender.addressDetail
  );
};

const buildSfExpressStatusPayload = () => {
  const runtimeConfig = buildSfExpressRuntimeConfig();
  const sender = runtimeConfig.senderAddress;
  const issues = [];

  if (!runtimeConfig.partnerId) issues.push('SF_EXPRESS_PARTNER_ID is missing');
  if (!runtimeConfig.checkWord) issues.push('SF_EXPRESS_CHECK_WORD is missing');
  if (!sender.recipientName) issues.push('SF_EXPRESS_SENDER_NAME is missing');
  if (!sender.recipientPhone) issues.push('SF_EXPRESS_SENDER_PHONE is missing');
  if (!sender.province) issues.push('SF_EXPRESS_SENDER_PROVINCE is missing');
  if (!sender.city) issues.push('SF_EXPRESS_SENDER_CITY is missing');
  if (!sender.district) issues.push('SF_EXPRESS_SENDER_DISTRICT is missing');
  if (!sender.addressDetail) issues.push('SF_EXPRESS_SENDER_ADDRESS is missing');

  return {
    configured: issues.length === 0,
    issues,
    useSandbox: runtimeConfig.useSandbox,
    endpointUrl: runtimeConfig.endpointUrl,
    serviceCode: runtimeConfig.serviceCode,
    signMode: runtimeConfig.signMode || 'md5-base64',
    timeoutMs: runtimeConfig.timeoutMs,
    partnerIdMasked: maskValue(runtimeConfig.partnerId),
    senderAddressConfigured: Boolean(
      sender.recipientName && sender.recipientPhone && sender.province && sender.city && sender.district && sender.addressDetail
    ),
  };
};

const cancelRecycleOrderWithOptionalSf = async (openId, recycleOrderId, { skipSfCancel = false } = {}) => {
  const recycleOrder = await getRecycleOrderById(openId, recycleOrderId);
  if (!recycleOrder) {
    return {
      order: null,
      found: false,
      sfPickupCanceled: false,
      sfPickupCancelSkipped: false,
      sfPickupInfo: null,
    };
  }

  if (recycleOrder.userStatus === 'cancelled') {
    return {
      order: recycleOrder,
      found: true,
      sfPickupCanceled: false,
      sfPickupCancelSkipped: false,
      sfPickupInfo: null,
    };
  }

  if (recycleOrder.status === 'published') {
    const error = new Error('published recycle order cannot be cancelled');
    error.statusCode = 400;
    throw error;
  }

  const pickupInfo = parseSfPickupNote(recycleOrder.note);
  let nextNote = String(recycleOrder.note || '');
  let sfPickupCanceled = false;
  let sfPickupCancelSkipped = false;
  let sfBusinessPayload = null;

  if (!skipSfCancel && pickupInfo.isSfPickup && pickupInfo.pickupOrderId && !pickupInfo.canceled) {
    const pickupWasCanceled = await hasCancelledSfPickupOrder(openId, pickupInfo.pickupOrderId);
    if (pickupWasCanceled) {
      nextNote = appendRecycleNote(nextNote, buildSfPickupCancelNote());
      sfPickupCanceled = true;
    } else if (isSfExpressApiConfigured()) {
      const sfResponse = await invokeSfExpressService({
        config: buildSfExpressRuntimeConfig(),
        serviceCode: 'EXP_RECE_UPDATE_ORDER',
        msgData: {
          orderId: pickupInfo.pickupOrderId,
          dealType: 2,
        },
      });
      nextNote = appendRecycleNote(nextNote, buildSfPickupCancelNote());
      sfPickupCanceled = true;
      sfBusinessPayload = sfResponse.businessPayload || {};
    } else {
      sfPickupCancelSkipped = true;
    }
  }

  const nextOrder = await updateRecycleOrderById(openId, recycleOrderId, {
    userStatus: 'cancelled',
    note: nextNote,
  });

  return {
    order: nextOrder,
    found: true,
    sfPickupCanceled,
    sfPickupCancelSkipped,
    sfPickupInfo: pickupInfo.pickupOrderId
      ? {
          orderId: pickupInfo.pickupOrderId,
          waybillNo: pickupInfo.waybillNo,
          canceled: sfPickupCanceled || pickupInfo.canceled,
          businessPayload: sfBusinessPayload,
        }
      : null,
  };
};

const encryptWechatPaySensitiveValue = (value) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return '';
  }

  return crypto.publicEncrypt(
    {
      key: getWechatPayPublicKey(),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(normalizedValue, 'utf8')
  ).toString('base64');
};

const buildRecycleSettlementOutBillNo = (order) => {
  const orderId = Number(order?.id || 0);
  return `RS${String(orderId).padStart(6, '0')}${Date.now()}${crypto.randomBytes(3).toString('hex')}`.slice(0, 64);
};

const mapWechatTransferStateDesc = (payload = {}) => {
  return String(
    payload.state_desc ||
    payload.fail_reason ||
    payload.state ||
    ''
  ).trim();
};

const buildRecycleSettlementPatchFromWechat = (payload = {}) => {
  const patch = {
    transferBillNo: String(payload.transfer_bill_no || '').trim(),
    appId: String(payload.appid || config.wechatAppId || '').trim(),
    mchId: String(payload.mchid || payload.mch_id || config.wechatPayMerchantId || '').trim(),
    state: String(payload.state || '').trim().toUpperCase() || 'PENDING',
    stateDesc: mapWechatTransferStateDesc(payload),
    failReason: payload.fail_reason ? JSON.stringify(payload.fail_reason) : '',
    wechatCreateTime: String(payload.create_time || '').trim(),
    acceptTime: payload.accept_time ? Date.parse(payload.accept_time) || 0 : 0,
    successTime: payload.success_time ? Date.parse(payload.success_time) || 0 : 0,
    cancelTime: payload.cancel_time ? Date.parse(payload.cancel_time) || 0 : 0,
    queryRaw: JSON.stringify(payload || {}),
  };

  if (Object.prototype.hasOwnProperty.call(payload, 'package_info')) {
    patch.packageInfo = String(payload.package_info || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'user_recv_perception')) {
    patch.userRecvPerception = String(payload.user_recv_perception || '').trim();
  }

  return patch;
};

const buildRecycleSettlementClaimPatch = (order, payload = {}) => ({
  ...buildRecycleSettlementPatchFromWechat(payload),
  amount: Number(order?.estimateFinalPrice || 0),
  transferRemark: String(payload.transfer_remark || '').trim(),
  userRecvPerception: String(
    payload.user_recv_perception || config.wechatTransferUserRecvPerception || ''
  ).trim(),
});

const createMockRecycleSettlementPayload = (order, preferredOutBillNo = '') => {
  const outBillNo = String(preferredOutBillNo || '').trim() || buildRecycleSettlementOutBillNo(order);

  return {
    out_bill_no: outBillNo,
    transfer_bill_no: `mock_transfer_${Date.now()}`,
    appid: config.wechatAppId || 'mock-appid',
    mchid: config.wechatPayMerchantId || 'mock-mchid',
    state: 'WAIT_USER_CONFIRM',
    state_desc: 'mock settlement ready',
    package_info: `mock_package_${outBillNo}`,
    user_recv_perception: config.wechatTransferUserRecvPerception,
    create_time: new Date().toISOString(),
  };
};

const createWechatTransferBill = async (order, preferredOutBillNo = '') => {
  if (config.wechatPayMockMode) {
    return createMockRecycleSettlementPayload(order, preferredOutBillNo);
  }

  if (!isConfiguredForRealWechatTransfer()) {
    throw new Error('微信商家转账配置不完整，请先检查支付证书与商户转账参数');
  }

  const outBillNo = String(preferredOutBillNo || '').trim() || buildRecycleSettlementOutBillNo(order);
  const transferAmount = Math.max(1, Math.round(Number(order.estimateFinalPrice || 0) * 100));
  const transferSceneId = String(config.wechatTransferSceneId || '1010').trim();
  const userRecvPerception = transferSceneId === '1010'
    ? '二手回收货款'
    : String(config.wechatTransferUserRecvPerception || '').trim().slice(0, 50);
  const recycleProductName = String(order.title || '二手回收商品').trim().slice(0, 32);
  const transferRemark = `回收订单${String(order.orderNo || order.id || '')}`.slice(0, 32);
  const body = {
    appid: config.wechatAppId,
    out_bill_no: outBillNo,
    transfer_scene_id: transferSceneId,
    openid: String(order.openId || '').trim(),
    transfer_amount: transferAmount,
    transfer_remark: transferRemark,
    notify_url: config.wechatTransferNotifyUrl,
  };

  if (transferSceneId === '1010') {
    body.user_recv_perception = userRecvPerception;
    body.transfer_scene_report_infos = [{
      info_type: '回收商品名称',
      info_content: recycleProductName,
    }];
  } else if (userRecvPerception) {
    body.user_recv_perception = userRecvPerception;
  }

  // 微信商家转账金额低于 0.30 元时不允许提交姓名校验字段。
  if (transferAmount >= 30) {
    const encryptedUserName = encryptWechatPaySensitiveValue(order.realName);
    if (encryptedUserName) {
      body.user_name = encryptedUserName;
    }
  }

  const payload = await sendWechatPayRequest({
    method: 'POST',
    pathname: '/v3/fund-app/mch-transfer/transfer-bills',
    body,
    headers: {
      'Wechatpay-Serial': config.wechatPayPublicKeyId,
    },
  });

  return {
    ...payload,
    out_bill_no: payload.out_bill_no || outBillNo,
    appid: payload.appid || config.wechatAppId,
    mchid: payload.mchid || config.wechatPayMerchantId,
    transfer_remark: transferRemark,
    user_recv_perception: userRecvPerception,
  };
};

const queryWechatTransferBillByOutBillNo = async (outBillNo) => {
  if (config.wechatPayMockMode) {
    const settlement = await getRecycleSettlementByOutBillNo(outBillNo);
    if (!settlement) {
      return null;
    }

    return {
      out_bill_no: settlement.outBillNo,
      transfer_bill_no: settlement.transferBillNo,
      appid: settlement.appId,
      mchid: settlement.mchId,
      state: settlement.state,
      state_desc: settlement.stateDesc,
      package_info: settlement.packageInfo,
      user_recv_perception: settlement.userRecvPerception,
      create_time: settlement.wechatCreateTime,
      accept_time: settlement.acceptTimeRealtime || '',
      success_time: settlement.successTimeRealtime || '',
      cancel_time: settlement.cancelTimeRealtime || '',
      fail_reason: settlement.failReason ? { message: settlement.failReason } : undefined,
    };
  }

  const pathname = `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(
    String(outBillNo || '')
  )}`;

  return sendWechatPayRequest({
    method: 'GET',
    pathname,
  });
};

const hydrateRecycleOptionGroups = async (profileKey) => {
  const groups = await listAdminRecycleOptionGroups({
    profileKey,
    includeDisabled: false,
  });

  return Promise.all(
    groups.map(async (group) => ({
      ...group,
      options: await listAdminRecycleOptionItems({
        groupId: group.id,
        includeDisabled: false,
      }),
    }))
  );
};

const listPublicRecycleProducts = async ({ categoryKey = '', keyword = '' } = {}) => {
  const data = await listAdminRecycleProducts({
    page: 1,
    limit: 200,
    categoryKey,
    title: keyword,
  });

  const items = Array.isArray(data?.list) ? data.list : [];
  return items.filter((item) => Number(item.status || 0) === 1);
};

const getPublicRecycleProductDetail = async (id) => {
  const product = await getAdminRecycleProductById(id);
  if (!product || Number(product.status || 0) !== 1) {
    return null;
  }

  return {
    ...product,
    optionGroups: await hydrateRecycleOptionGroups(product.optionProfileKey),
  };
};

const normalizeLegacyAdminPath = (pathname = '') => {
  if (pathname === '/api/admin') {
    return '/admin';
  }

  if (pathname.startsWith('/api/admin/')) {
    return pathname.replace(/^\/api/, '');
  }

  return pathname;
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  requestUrl.pathname = normalizeLegacyAdminPath(requestUrl.pathname);

  if (request.method === 'OPTIONS') {
    sendJson(response, 200, { success: true });
    return;
  }

  if (sfExpressCallbackPaths.has(requestUrl.pathname)) {
    if (request.method === 'GET') {
      sendJson(response, 200, {
        success: true,
        message: 'sf express waybill callback endpoint is ready',
        callbackUrl: `${getPublicServerBaseUrl(request)}${config.sfExpressWaybillCallbackPath}`,
      });
      return;
    }

    if (request.method === 'POST') {
      const parsedCallback = parseSfExpressCallbackBody(request, await getRawBodyBuffer(request));
      const verified = verifySfExpressCallbackDigest(parsedCallback.parsedBody);
      const logId = persistSfExpressCallbackLog({
        pathname: requestUrl.pathname,
        request,
        parsedCallback,
        verified,
      });
      sendJson(response, 200, { success: true, message: 'sf express callback received', verified, logId });
      return;
    }

    response.writeHead(405, { Allow: 'GET, POST, OPTIONS' });
    response.end();
    return;
  }

  if (request.method === 'GET' && serveConsoleApp(requestUrl, response)) {
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    try {
      await pingDatabase();
      sendJson(response, 200, {
        success: true,
        message: 'backend is running',
        now: new Date().toISOString(),
        mockWechatLogin: config.allowMockWechatLogin,
        storage: 'mysql',
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
        storage: 'mysql',
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/test') {
    sendJson(response, 200, {
      success: true,
      message: 'test ok',
      now: new Date().toISOString(),
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/uploads/')) {
    const relativePath = requestUrl.pathname.replace(/^\/uploads\//, '');
    const resolvedPath = resolveUploadFilePath(relativePath);
    if (!resolvedPath) {
      sendJson(response, 403, { success: false, message: 'forbidden' });
      return;
    }
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      sendJson(response, 404, { success: false, message: 'file not found' });
      return;
    }
    sendFile(response, resolvedPath);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/static/')) {
    const relativePath = requestUrl.pathname.replace(/^\/static\//, '');
    const resolvedPath = resolveStaticFilePath(relativePath);
    if (!resolvedPath) {
      sendJson(response, 403, { success: false, message: 'forbidden' });
      return;
    }
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      sendJson(response, 404, { success: false, message: 'file not found' });
      return;
    }
    sendFile(response, resolvedPath);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/products') {
    try {
      const scene = String(requestUrl.searchParams.get('scene') || 'buy').trim() || 'buy';
      const products = await listPublicProducts({ scene });
      sendJson(response, 200, {
        success: true,
        scene,
        products,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/categories') {
    try {
      const scene = String(requestUrl.searchParams.get('scene') || 'sale').trim() || 'sale';
      const categories = await listPublicCategoryConfigs({ scene });
      sendJson(response, 200, {
        success: true,
        scene,
        categories,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/homepage/banners') {
    try {
      const banners = await listPublicHomepageBanners();
      sendJson(response, 200, {
        success: true,
        banners,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/category-sections') {
    try {
      const targetScene = String(requestUrl.searchParams.get('targetScene') || 'sale').trim() || 'sale';
      sendJson(response, 200, {
        success: true,
        targetScene,
        sections: await listPublicCategorySections({ targetScene }),
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/homepage/section') {
    try {
      sendJson(response, 200, {
        success: true,
        section: await getHomepageSectionConfig({ publicAssets: true }),
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && /^\/api\/legal-documents\/(?:privacy-policy|user-agreement)$/.test(requestUrl.pathname)) {
    try {
      const type = requestUrl.pathname.split('/').pop();
      const document = await getPublicLegalDocument(type);
      if (!document) {
        sendJson(response, 404, { success: false, message: 'legal document not found' });
        return;
      }
      sendJson(response, 200, { success: true, document });
    } catch (error) {
      sendJson(response, 500, { success: false, message: error && error.message ? error.message : String(error) });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/notices') {
    try {
      sendJson(response, 200, {
        success: true,
        notices: await listPublicNotices(),
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && /^\/api\/notices\/\d+$/.test(requestUrl.pathname)) {
    try {
      const noticeId = Number(requestUrl.pathname.split('/').pop() || 0);
      const notice = await getPublicNoticeById(noticeId);
      if (!notice) {
        sendJson(response, 404, {
          success: false,
          message: 'notice not found',
        });
        return;
      }

      sendJson(response, 200, {
        success: true,
        notice,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && /^\/api\/content-pages\/\d+$/.test(requestUrl.pathname)) {
    try {
      const pageId = Number(requestUrl.pathname.split('/').pop() || 0);
      const authUser = await requireAuthUser(request);
      await recordPublicTutorialView(pageId);
      const page = await getPublicContentPageById(pageId);
      if (!page) {
        sendJson(response, 404, {
          success: false,
          message: 'content page not found',
        });
        return;
      }

      const payload = {
        success: true,
        page,
        interactions: await getPublicTutorialInteractionStats(pageId, authUser?.openId || ''),
      };

      if (pageId === 1) {
        payload.tutorialCategories = await listPublicTutorialCategories();
        payload.tutorial_categories = payload.tutorialCategories;
        payload.tutorialArticles = await listPublicTutorialArticles();
        payload.tutorial_articles = payload.tutorialArticles;
      }

      const tutorialCategoryId = Number(requestUrl.searchParams.get('tutorialCategoryId') || 0);
      if (tutorialCategoryId > 0) {
        payload.tutorialArticles = await listPublicTutorialArticlesByCategory(tutorialCategoryId);
        payload.tutorial_articles = payload.tutorialArticles;
      }

      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && /^\/api\/content-pages\/\d+\/interactions$/.test(requestUrl.pathname)) {
    try {
      const pageId = Number(requestUrl.pathname.split('/')[3] || 0);
      const authUser = await requireAuthUser(request);
      const interactions = await getPublicTutorialInteractionStats(pageId, authUser?.openId || '');
      if (!interactions) {
        sendJson(response, 404, { success: false, message: 'tutorial not found' });
        return;
      }
      sendJson(response, 200, { success: true, interactions });
    } catch (error) {
      sendJson(response, 500, { success: false, message: error && error.message ? error.message : String(error) });
    }
    return;
  }

  if (request.method === 'POST' && /^\/api\/content-pages\/\d+\/(like|favorite)$/.test(requestUrl.pathname)) {
    try {
      const pageId = Number(requestUrl.pathname.split('/')[3] || 0);
      const actionType = requestUrl.pathname.split('/').pop();
      const authUser = await requireAuthUser(request);
      if (!authUser) {
        sendJson(response, 401, { success: false, code: 'UNAUTHORIZED', message: '请先登录后操作' });
        return;
      }
      const interactions = await togglePublicTutorialInteraction(pageId, authUser.openId, actionType);
      sendJson(response, 200, { success: true, interactions });
    } catch (error) {
      sendJson(response, 400, { success: false, message: error && error.message ? error.message : String(error) });
    }
    return;
  }

  if (request.method === 'POST' && /^\/api\/content-pages\/\d+\/share$/.test(requestUrl.pathname)) {
    try {
      const pageId = Number(requestUrl.pathname.split('/')[3] || 0);
      const row = await recordPublicTutorialShare(pageId);
      if (!row) {
        sendJson(response, 404, { success: false, message: 'tutorial not found' });
        return;
      }
      sendJson(response, 200, { success: true, interactions: await getPublicTutorialInteractionStats(pageId) });
    } catch (error) {
      sendJson(response, 400, { success: false, message: error && error.message ? error.message : String(error) });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/tutorial-categories') {
    try {
      const categories = await listPublicTutorialCategories();

      sendJson(response, 200, {
        success: true,
        categories,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/tutorial-articles') {
    try {
      const articles = await listPublicTutorialArticles();

      sendJson(response, 200, {
        success: true,
        articles,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/my-tutorial-interactions') {
    try {
      const authUser = await requireAuthUser(request);
      if (!authUser) {
        sendJson(response, 401, { success: false, code: 'UNAUTHORIZED', message: '请先登录' });
        return;
      }
      const action = String(requestUrl.searchParams.get('action') || 'like');
      sendJson(response, 200, { success: true, action, articles: await listUserTutorialInteractions(authUser.openId, action) });
    } catch (error) {
      sendJson(response, 500, { success: false, message: error && error.message ? error.message : String(error) });
    }
    return;
  }

  if (request.method === 'GET' && /^\/api\/products\/\d+$/.test(requestUrl.pathname)) {
    try {
      const productId = Number(requestUrl.pathname.split('/').pop() || 0);
      const product = await getPublicProductById(productId);
      if (!product) {
        sendJson(response, 404, {
          success: false,
          message: 'product not found',
        });
        return;
      }

      sendJson(response, 200, {
        success: true,
        product,
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/recycle/products') {
    try {
      const categoryKey = String(requestUrl.searchParams.get('categoryKey') || '').trim();
      const keyword = String(requestUrl.searchParams.get('keyword') || '').trim();
      const products = await listPublicRecycleProducts({
        categoryKey,
        keyword,
      });

      sendJson(response, 200, {
        success: true,
        products: products.map(sanitizeRecycleProduct),
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/recycle/settings') {
    try {
      sendJson(response, 200, {
        success: true,
        ...(await getPublicRecycleSettings()),
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && /^\/api\/recycle\/products\/\d+$/.test(requestUrl.pathname)) {
    try {
      const recycleProductId = Number(requestUrl.pathname.split('/').pop() || 0);
      const product = await getPublicRecycleProductDetail(recycleProductId);

      if (!product) {
        sendJson(response, 404, {
          success: false,
          message: 'recycle product not found',
        });
        return;
      }

      sendJson(response, 200, {
        success: true,
        product: sanitizeRecycleProduct(product),
      });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/quote') {
    try {
      const body = await parseJsonBody(request);
      const recycleProductId = Number(body.recycleProductId || 0);

      if (!recycleProductId) {
        sendJson(response, 400, {
          success: false,
          message: 'recycleProductId is required',
        });
        return;
      }

      const product = await getPublicRecycleProductDetail(recycleProductId);
      if (!product) {
        sendJson(response, 404, {
          success: false,
          message: 'recycle product not found',
        });
        return;
      }

      const selectedDeviceOptionValues = normalizeStringMap(body.selectedDeviceOptionValues);
      const quote = buildRecycleQuote({
        product,
        optionGroups: Array.isArray(product.optionGroups) ? product.optionGroups : [],
        selectedValues: selectedDeviceOptionValues,
      });

      sendJson(response, 200, {
        success: true,
        product: sanitizeRecycleProduct(product),
        quote: sanitizeRecycleQuote(quote),
      });
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/admin/login') {
    try {
      const body = await parseJsonBody(request);
      const user = await verifyAdminLogin(body.username, body.password);
      if (!user) {
        sendAdminError(response, 422, '账号或密码错误');
        return;
      }

      const token = signToken(createAdminSessionPayload(user));
      const authPayload = buildAdminAuthPayload(user);
      sendAdminSuccess(
        response,
        {
          ...authPayload,
          token,
        },
        '????'
      );
    } catch (error) {
      sendAdminError(response, 500, error && error.message ? error.message : String(error));
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/user-activity-events') {
    const user = await requireAuthUser(request);
    if (!user) {
      sendJson(response, 401, unauthorizedPayload);
      return;
    }

    try {
      await recordUserActivityEvent(user);
      sendJson(response, 201, { success: true });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/user-online-sessions') {
    const user = await requireAuthUser(request);
    if (!user) {
      sendJson(response, 401, unauthorizedPayload);
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const session = await recordUserOnlineSession(user, body.startedAt);
      sendJson(response, 201, { success: true, session });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/orders/recycle/review-response') {
    const user = await requireAuthUser(request);
    if (!user) {
      sendJson(response, 401, unauthorizedPayload);
      return;
    }

    try {
      const body = await parseJsonBody(request);
      let returnAddress = null;
      if (String(body.decision || '').trim().toLowerCase() === 'take_back') {
        const returnAddressId = Number(body.returnAddressId || body.returnAddress?.addressId || body.returnAddress?.id || 0);
        returnAddress = await getAddressById(user.openId, returnAddressId);
        if (!returnAddress) {
          const addressError = new Error('寄回地址不存在，请从地址簿重新选择');
          addressError.code = 'RETURN_ADDRESS_NOT_FOUND';
          addressError.statusCode = 422;
          throw addressError;
        }
      }

      const order = await respondToRecycleReview(user.openId, body.recycleOrderId, body.decision, returnAddress);
      sendJson(response, 200, { success: true, order: sanitizeRecycleOrder(order || {}) });
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
        code: error && error.code ? error.code : 'RECYCLE_REVIEW_RESPONSE_FAILED',
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/admin/register') {
    try {
      const body = await parseJsonBody(request);
      const staff = await createStaffRegistration(body);
      sendAdminSuccess(response, buildAdminAuthPayload(staff), '注册成功');
    } catch (error) {
      sendAdminError(response, 400, error && error.message ? error.message : String(error));
    }
    return;
  }

  if (requestUrl.pathname.startsWith('/admin/')) {
    const adminSession = await getAdminSession(request);
    const adminUser = adminSession.user;
    if (!adminUser && requestUrl.pathname !== '/admin/login') {
      sendAdminError(
        response,
        401,
        adminSession.expiredByNewLogin ? '登录过期，请重新登录' : '登录状态已失效，请重新登录',
        adminSession.expiredByNewLogin ? 40001 : 40000
      );
      return;
    }

    const requiredRuleName = getAdminPermissionByRequest(request.method, requestUrl.pathname);
    if (requiredRuleName && !hasAdminRule(adminUser, requiredRuleName)) {
      sendAdminError(response, 403, '无权限访问');
      return;
    }

    const requiredSearchRuleName = getAdminSearchPermissionByRequest(
      request.method,
      requestUrl.pathname,
      requestUrl.searchParams
    );
    if (requiredSearchRuleName && !hasAdminRule(adminUser, requiredSearchRuleName)) {
      sendAdminError(response, 403, '当前账号未开启搜索权限');
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/getinfo') {
      sendAdminSuccess(response, buildAdminAuthPayload(adminUser));
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/logout') {
      sendAdminSuccess(response, 'ok', '????');
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/updatepassword') {
      try {
        const body = await parseJsonBody(request);
        const updated = await updateAdminPassword(
          adminUser.id,
          String(body.oldpassword || ''),
          String(body.password || '')
        );

        if (!updated) {
          sendAdminError(response, 422, '????');
          return;
        }

        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/category-sections') {
      try {
        sendAdminSuccess(response, await listAdminCategorySections({
          includeDisabled: requestUrl.searchParams.get('includeDisabled') !== '0',
          targetScene: requestUrl.searchParams.get('targetScene') || '',
        }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/category-sections') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminCategorySection(body), '创建成功');
      } catch (error) {
        sendAdminError(response, 422, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/category-sections\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const sectionId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminCategorySection(sectionId, body);
        if (!data) {
          sendAdminError(response, 404, '分区不存在');
          return;
        }
        sendAdminSuccess(response, data, '修改成功');
      } catch (error) {
        sendAdminError(response, 422, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/category-sections\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const sectionId = Number(requestUrl.pathname.split('/')[3] || 0);
        const deleted = await deleteAdminCategorySection(sectionId);
        if (!deleted) {
          sendAdminError(response, 404, '分区不存在');
          return;
        }
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 422, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/category') {
      try {
        const categories = await listAdminCategories({
          scene: requestUrl.searchParams.get('scene') || 'sale',
          sectionKey: requestUrl.searchParams.get('sectionKey') || '',
          includeDisabled: requestUrl.searchParams.get('includeDisabled') !== '0',
          page: requestUrl.searchParams.get('page') || 0,
          limit: requestUrl.searchParams.get('limit') || 0,
        });
        sendAdminSuccess(response, categories);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/content_page/end-link-category-options') {
      try {
        sendAdminSuccess(response, await listAdminTutorialEndLinkCategoryOptions());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/category') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminCategory(body), '\u521b\u5efa\u6210\u529f');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/category\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const categoryId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminCategory(categoryId, body);
        if (!data) {
          sendAdminError(response, 404, '\u7c7b\u76ee\u4e0d\u5b58\u5728');
          return;
        }
        sendAdminSuccess(response, data, '\u4fee\u6539\u6210\u529f');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/category\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const categoryId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminCategoryStatus(categoryId, body.status);
        if (!data) {
          sendAdminError(response, 404, '\u7c7b\u76ee\u4e0d\u5b58\u5728');
          return;
        }
        sendAdminSuccess(response, data, '\u72b6\u6001\u4fee\u6539\u6210\u529f');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/category\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const categoryId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminCategory(categoryId);
        sendAdminSuccess(response, 'ok', '\u5220\u9664\u6210\u529f');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/category/sort') {
      try {
        const body = await parseJsonBody(request);
        const sortData = typeof body.sortdata === 'string' ? JSON.parse(body.sortdata) : body.sortdata;
        await sortAdminCategories(Array.isArray(sortData) ? sortData : []);
        sendAdminSuccess(response, 'ok', '\u6392\u5e8f\u4fdd\u5b58\u6210\u529f');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/recycle/profiles') {
      try {
        sendAdminSuccess(response, await listAdminRecycleProfiles());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/recycle\/products\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminRecycleProducts({
          page,
          title: requestUrl.searchParams.get('title') || '',
          categoryKey: requestUrl.searchParams.get('categoryKey') || '',
          profileKey: requestUrl.searchParams.get('profileKey') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/products') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminRecycleProduct(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/products/delete_all') {
      try {
        const body = await parseJsonBody(request);
        await deleteAdminRecycleProducts(Array.isArray(body.ids) ? body.ids : []);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/products\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const recycleProductId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleProductStatus(recycleProductId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/products\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const recycleProductId = Number(requestUrl.pathname.split('/')[4] || 0);
        await deleteAdminRecycleProducts([recycleProductId]);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/products\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const recycleProductId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminRecycleProduct(recycleProductId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/recycle\/submissions\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminRecycleSubmissions({
          page,
          title: requestUrl.searchParams.get('title') || '',
          status: requestUrl.searchParams.get('status') || '',
          categoryKey: requestUrl.searchParams.get('categoryKey') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
        });
        data.list = data.list.map((item) => sanitizeRecycleSubmissionForAdmin(item, adminUser));
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/submissions') {
      try {
        const body = await parseJsonBody(request);
        const data = await createAdminRecycleSubmission(body, adminUser.id);
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '新增回收记录成功');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/info$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleSubmissionInfo(submissionId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '回收审核记录不存在');
          return;
        }
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '回收记录已保存');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/recycle\/submissions\/\d+\/reviews$/.test(requestUrl.pathname)) {
      try {
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const reviews = await listRecycleSubmissionReviews(submissionId);
        sendAdminSuccess(response, reviews.map((item) => sanitizeRecycleSubmissionReviewForAdmin(item, adminUser)));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/profile') {
      try {
        const body = await parseJsonBody(request);
        const updated = await updateAdminProfile(adminUser.id, body);

        if (!updated) {
          sendAdminError(response, 404, '管理员不存在');
          return;
        }

        sendAdminSuccess(response, buildAdminAuthPayload(updated), '保存成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const affectedRows = await deleteAdminRecycleSubmission(submissionId);
        if (!affectedRows) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/submissions/delete_all') {
      try {
        const body = await parseJsonBody(request);
        const affectedRows = await deleteAdminRecycleSubmissions(Array.isArray(body.ids) ? body.ids : []);
        if (!affectedRows) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/recycle\/submissions\/\d+\/settlements$/.test(requestUrl.pathname)) {
      try {
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        sendAdminSuccess(response, (await listRecycleSettlementsByOrderId(submissionId)).map(sanitizeRecycleSettlement));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/settlement\/create$/.test(requestUrl.pathname)) {
      try {
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const order = await getRecycleOrderByInternalId(submissionId);
        const settlement = await confirmRecycleSettlementForOrder(order, adminUser.id);
        sendAdminSuccess(response, sanitizeRecycleSettlement(settlement), 'ok');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/settlement\/sync$/.test(requestUrl.pathname)) {
      try {
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const order = await getRecycleOrderByInternalId(submissionId);
        const settlement = await syncRecycleSettlementByOrder(order);
        sendAdminSuccess(response, settlement ? sanitizeRecycleSettlement(settlement) : null, 'ok');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/settlement\/manual-alipay$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const order = await getRecycleOrderByInternalId(submissionId);
        const settlement = await createManualAlipaySettlementForOrder(order, body.paymentProofImages, adminUser.id);
        sendAdminSuccess(response, sanitizeRecycleSettlement(settlement), 'ok');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/mark_incorrect$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleSubmission(
          submissionId,
          {
            ...body,
            status: 'needs_fix',
          },
          adminUser.id
        );
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/review$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleSubmission(submissionId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/inspection$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await completeAdminRecycleSubmissionInspection(submissionId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/publish$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await publishAdminRecycleSubmission(submissionId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/recycle/option-groups') {
      try {
        const data = await listAdminRecycleOptionGroups({
          profileKey: requestUrl.searchParams.get('profileKey') || '',
          includeDisabled: requestUrl.searchParams.get('includeDisabled') !== '0',
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/option-groups') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminRecycleOptionGroup(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/option-groups/delete_all') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await deleteAdminRecycleOptionGroups(body.ids), '选项组批量删除成功');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/option-groups/reorder') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await reorderAdminRecycleOptionGroups(body), '选项组排序保存成功');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/option-groups\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const groupId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleOptionGroupStatus(groupId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/option-groups\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const groupId = Number(requestUrl.pathname.split('/')[4] || 0);
        await deleteAdminRecycleOptionGroup(groupId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/option-groups\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const groupId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminRecycleOptionGroup(groupId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/recycle/option-items') {
      try {
        const data = await listAdminRecycleOptionItems({
          groupId: requestUrl.searchParams.get('groupId') || 0,
          includeDisabled: requestUrl.searchParams.get('includeDisabled') !== '0',
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/option-items') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminRecycleOptionItem(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle/option-items/delete_all') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await deleteAdminRecycleOptionItems(body.ids), '选项批量删除成功');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/option-items\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const itemId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleOptionItemStatus(itemId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/option-items\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const itemId = Number(requestUrl.pathname.split('/')[4] || 0);
        await deleteAdminRecycleOptionItem(itemId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/option-items\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const itemId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminRecycleOptionItem(itemId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (await handleDataAnalysisRequest({
      request,
      requestUrl,
      sendSuccess: (data) => sendAdminSuccess(response, data),
      sendError: (statusCode, message) => sendAdminError(response, statusCode, message),
      getDashboardStatistics1,
      getDashboardStatistics3,
      getDashboardAddressLocationStatistics,
      getDashboardOrderTimeStatistics,
      getDashboardUserEngagementStatistics,
      getDashboardUserActivityStatistics,
    })) {
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/dashboard/fee-statistics') {
      try {
        sendAdminSuccess(response, await getDashboardFeeStatistics(
          requestUrl.searchParams.get('year'),
          requestUrl.searchParams.get('month')
        ));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/statistics2') {
      try {
        sendAdminSuccess(response, await getDashboardStatistics2());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/express_company\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminExpressCompanies({ page });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/order\/\d+\/get_ship_info$/.test(requestUrl.pathname)) {
      try {
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await getAdminOrderShipInfo(orderId);
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/order\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminOrders({
          page,
          tab: requestUrl.searchParams.get('tab') || 'all',
          no: requestUrl.searchParams.get('no') || '',
          name: requestUrl.searchParams.get('name') || '',
          phone: requestUrl.searchParams.get('phone') || '',
          starttime: requestUrl.searchParams.get('starttime') || '',
          endtime: requestUrl.searchParams.get('endtime') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/order\/\d+\/inventory$/.test(requestUrl.pathname)) {
      try {
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const options = await listAdminOrderInventoryOptions(orderId, requestUrl.searchParams.get('keyword') || '');
        sendAdminSuccess(response, options);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/order/delete_all') {
      try {
        const body = await parseJsonBody(request);
        await deleteAdminOrders(Array.isArray(body.ids) ? body.ids : []);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/order\/\d+\/ship$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await shipAdminOrder(orderId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '发货信息保存成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/order\/\d+\/sync-wechat$/.test(requestUrl.pathname)) {
      try {
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const order = await getAdminOrderById(orderId, { includeInternal: true });
        if (!order) {
          sendAdminError(response, 404, '订单不存在');
          return;
        }
        const synced = await syncPurchaseOrderToWechatOrder({
          id: order.id,
          openId: order.open_id,
          status: order.payment_status === 'paid' ? 'paid' : order.order_status,
          paymentTransactionId: order.payment_transaction_id,
          outTradeNo: order.out_trade_no,
          productTitleSnapshot: order.product_title_snapshot,
          recipientPhone: order.address?.phone,
          shipData: order.ship_data,
        });
        const latest = await getAdminOrderById(orderId);
        sendAdminSuccess(response, latest || synced || order, '微信订单同步完成');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/order\/\d+\/sync-wechat-status$/.test(requestUrl.pathname)) {
      try {
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const order = await getAdminOrderById(orderId, { includeInternal: true });
        if (!order) {
          sendAdminError(response, 404, '订单不存在');
          return;
        }
        await syncPurchaseOrderWechatServiceStatus(order);
        const updated = await getAdminOrderById(orderId);
        sendAdminSuccess(response, updated, '微信服务状态已同步');
      } catch (error) {
        sendAdminError(response, Number(error?.statusCode) || 400, error?.message || String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/order\/\d+\/handle_refund$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await handleAdminOrderRefund(orderId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/recycle\/submissions\/\d+\/report$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const submissionId = Number(requestUrl.pathname.split('/')[4] || 0);
        const data = await updateAdminRecycleSubmissionReport(submissionId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '回收审核记录不存在');
          return;
        }
        sendAdminSuccess(response, sanitizeRecycleSubmissionForAdmin(data, adminUser), '报告提交成功');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/order\/\d+\/status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminOrderStatus(orderId, body);
        if (!data) {
          sendAdminError(response, 404, '订单不存在');
          return;
        }
        sendAdminSuccess(response, data, '订单状态已更新');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/order\/\d+\/inventory$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const orderId = Number(requestUrl.pathname.split('/')[3] || 0);
        const inventory = await setAdminOrderInventory(orderId, body.inventoryId || 0);
        sendAdminSuccess(response, inventory, '机器关联已更新');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/order/excelexport') {
      try {
        const data = await listAdminOrders({
          page: 1,
          limit: 5000,
          tab: requestUrl.searchParams.get('tab') || 'all',
          starttime: requestUrl.searchParams.get('starttime') || '',
          endtime: requestUrl.searchParams.get('endtime') || '',
        });
        const header = ['?1', '?2', '?3', '?4', '?5', '?6', '?7'];
        const rows = data.list.map((item) => [
          item.no,
          item.create_time,
          item.user?.username || '',
          item.total_price,
          item.payment_method || '????',
          item.ship_data ? '???' : '???',
        ]);
        const csv = [header, ...rows]
          .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
          .join('\n');

        response.writeHead(200, {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, token',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Content-Disposition': 'attachment; filename="orders.csv"',
        });
        response.end(`\uFEFF${csv}`);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (false && request.method === 'POST' && requestUrl.pathname === '/admin/order_batch/excelexport') {
      try {
        const data = await listAdminPaymentBatches({
          page: 1,
          limit: 5000,
          tab: requestUrl.searchParams.get('tab') || 'all',
          no: requestUrl.searchParams.get('no') || '',
          name: requestUrl.searchParams.get('name') || '',
          phone: requestUrl.searchParams.get('phone') || '',
          starttime: requestUrl.searchParams.get('starttime') || '',
          endtime: requestUrl.searchParams.get('endtime') || '',
        });
        const header = ['?1', '?2', '?3', '?4', '?5', '?6', '?7'];
        const rows = data.list.map((item) => [
          item.no,
          item.create_time,
          item.user?.username || '',
          item.total_price,
          item.out_trade_no || '',
          item.batch_order_count || 0,
          item.status === 'paid' ? '???' : '???',
        ]);
        const csv = [header, ...rows]
          .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
          .join('\n');

        response.writeHead(200, {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, token',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Content-Disposition': 'attachment; filename="payment-batches.csv"',
        });
        response.end(`\uFEFF${csv}`);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/goods_comment\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminGoodsComments({
          page,
          title: requestUrl.searchParams.get('title') || '',
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/goods_comment\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const commentId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminGoodsCommentStatus(commentId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/goods_comment\/review\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const commentId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await reviewAdminGoodsComment(commentId, body.data);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/content_page\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminContentPages({
          page,
          title: requestUrl.searchParams.get('title') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
          mode: requestUrl.searchParams.get('mode') || 'tutorial',
          tutorialCategoryId: requestUrl.searchParams.get('tutorialCategoryId') || 0,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/content_page') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminContentPage(body), '创建成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/content_page\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const pageId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminContentPage(pageId, body);
        if (!data) {
          sendAdminError(response, 404, '教程分类不存在');
          return;
        }
        sendAdminSuccess(response, data, '修改成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/content_page\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const pageId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminContentPageStatus(pageId, body.status);
        if (!data) {
          sendAdminError(response, 404, '教程分类不存在');
          return;
        }
        sendAdminSuccess(response, data, '状态修改成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/content_page\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const pageId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminContentPage(pageId);
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/content_page/delete_all') {
      try {
        const body = await parseJsonBody(request);
        await deleteAdminContentPages(body.ids);
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/homepage_banner\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminHomepageBanners({
          page,
          title: requestUrl.searchParams.get('title') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/homepage_banner/primary') {
      try {
        sendAdminSuccess(response, await getAdminPrimaryHomepageBanner());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/homepage_banner') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminHomepageBanner(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/homepage_banner\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const bannerId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminHomepageBanner(bannerId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/homepage_banner/primary') {
      try {
        const body = await parseJsonBody(request);
        const data = await updateAdminPrimaryHomepageBanner(body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/homepage_banner\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const bannerId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminHomepageBannerStatus(bannerId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/homepage_banner\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const bannerId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminHomepageBanner(bannerId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/homepage-section/category-options') {
      try {
        sendAdminSuccess(response, await listAdminCategorySections({ includeDisabled: false }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/homepage-section') {
      try {
        sendAdminSuccess(response, await getHomepageSectionConfig());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/homepage-section') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await updateHomepageSectionConfig(body), '保存成功');
      } catch (error) {
        sendAdminError(response, 422, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/notice\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        sendAdminSuccess(response, await listAdminNotices({ page }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/notice') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminNotice(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/notice\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const noticeId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminNotice(noticeId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/notice\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const noticeId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminNotice(noticeId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/coupon\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        sendAdminSuccess(response, await listAdminCoupons({ page }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/coupon') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminCoupon(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/coupon\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const couponId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminCoupon(couponId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/coupon\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const couponId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminCouponStatus(couponId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/coupon\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const couponId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminCoupon(couponId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/image_class\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        sendAdminSuccess(response, await listAdminImageClasses({ page }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/image_class') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminImageClass(body), '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/image_class\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const classId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminImageClass(classId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/image_class\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const classId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminImageClass(classId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/image_class\/\d+\/image\/\d+$/.test(requestUrl.pathname)) {
      try {
        const pathParts = requestUrl.pathname.split('/');
        const classId = Number(pathParts[3] || 0);
        const page = Number(pathParts[5] || 1);
        sendAdminSuccess(response, await listAdminImages({ imageClassId: classId, page }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/image/upload') {
      try {
        const formData = await parseMultipartFormData(request);
        const uploadFile = formData.files[0];
        if (!uploadFile) {
          sendAdminError(response, 422, '????');
          return;
        }
        const imageClassId = Number(formData.fields.image_class_id || 0);
        const relativePath = saveUploadedFile(uploadFile, 'images');
        const fullUrl = `${getPublicServerBaseUrl(request)}${relativePath}`;
        const image = await createAdminImage({
          image_class_id: imageClassId,
          name: uploadFile.filename,
          url: fullUrl,
        });
        sendAdminSuccess(response, image, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/image\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const imageId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminImage(imageId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/image/delete_all') {
      try {
        const body = await parseJsonBody(request);
        await deleteAdminImages(Array.isArray(body.ids) ? body.ids : []);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/sysconfig') {
      try {
        sendAdminSuccess(response, await getAdminSysconfig());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/recycle-settings') {
      try {
        sendAdminSuccess(response, await getAdminRecycleSettings());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/recycle-settings') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await updateRecycleSettings(body), '保存成功');
      } catch (error) {
        sendAdminError(response, 422, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/sysconfig') {
      try {
        const body = await parseJsonBody(request);
        const nextConfig = await setAdminSysconfig(body);
        applySfExpressSenderConfig(nextConfig);
        sendAdminSuccess(response, nextConfig, '保存成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/sysconfig/upload') {
      try {
        const formData = await parseMultipartFormData(request);
        const uploadFile = formData.files[0];
        if (!uploadFile) {
          sendAdminError(response, 422, '????');
          return;
        }
        const relativePath = saveUploadedFile(uploadFile, 'sysconfig');
        sendAdminSuccess(response, relativePath, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/user_level\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminUserLevels({ page });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/user_level') {
      try {
        const body = await parseJsonBody(request);
        const data = await createAdminUserLevel(body);
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/user_level\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const levelId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminUserLevelStatus(levelId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/user_level\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const levelId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminUserLevel(levelId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/user_level\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const levelId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminUserLevel(levelId, body);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/staff\/\d+\/permissions$/.test(requestUrl.pathname)) {
      try {
        const staffId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await getAdminStaffPermissions(staffId);
        if (!data) {
          sendAdminError(response, 404, '员工不存在');
          return;
        }
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/staff\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminStaff({
          page,
          keyword: requestUrl.searchParams.get('keyword') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/staff') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminStaff(body), '创建成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/staff\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const staffId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminStaff(staffId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '员工不存在');
          return;
        }
        sendAdminSuccess(response, data, '保存成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/staff\/\d+\/permissions$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const staffId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminStaffPermissions(staffId, body, adminUser.id);
        if (!data) {
          sendAdminError(response, 404, '员工不存在');
          return;
        }
        sendAdminSuccess(response, data, '权限保存成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/staff\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const staffId = Number(requestUrl.pathname.split('/')[3] || 0);
        const affectedRows = await deleteAdminStaff(staffId, adminUser.id);
        if (!affectedRows) {
          sendAdminError(response, 404, '员工不存在');
          return;
        }
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/user\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminUsers({
          page,
          keyword: requestUrl.searchParams.get('keyword') || '',
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/user\/\d+\/update_status$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const userId = Number(requestUrl.pathname.split('/')[3] || 0);
        const data = await updateAdminUserStatus(userId, body.status);
        if (!data) {
          sendAdminError(response, 404, '????');
          return;
        }
        sendAdminSuccess(response, data, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/user\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const userId = Number(requestUrl.pathname.split('/')[3] || 0);
        await deleteAdminUser(userId);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/inventory_management/columns') {
      try {
        sendAdminSuccess(response, await listAdminInventoryColumns({
          staffId: adminUser.permission === STAFF_PERMISSIONS.STAFF ? adminUser.id : 0,
        }));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/inventory_management/column-permissions') {
      try {
        sendAdminSuccess(response, await listAdminInventoryColumnPermissions());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/inventory_management/column-permissions') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await updateAdminInventoryColumnPermissions(body), '保存成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/inventory_management/columns') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminInventoryColumn(body), '创建成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/inventory_management\/columns\/[a-z0-9_]+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const columnKey = requestUrl.pathname.split('/').pop();
        const column = await updateAdminInventoryColumn(columnKey, body);
        if (!column) {
          sendAdminError(response, 404, '列不存在');
          return;
        }
        sendAdminSuccess(response, column, '保存成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/inventory_management\/columns\/[a-z0-9_]+\/delete$/.test(requestUrl.pathname)) {
      try {
        const columnKey = requestUrl.pathname.split('/')[4];
        const deleted = await deleteAdminInventoryColumn(columnKey);
        if (!deleted) {
          sendAdminError(response, 404, '列不存在');
          return;
        }
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/inventory_management/calculations') {
      try {
        sendAdminSuccess(response, await listAdminInventoryCalculations());
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/inventory_management/calculations') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await upsertAdminInventoryCalculation(body), '保存成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/inventory_management\/calculations\/[a-z0-9_]+\/delete$/.test(requestUrl.pathname)) {
      try {
        const targetColumnKey = requestUrl.pathname.split('/')[4];
        const deleted = await deleteAdminInventoryCalculation(targetColumnKey);
        if (!deleted) {
          sendAdminError(response, 404, '计算规则不存在');
          return;
        }
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/finance/statistics') {
      try {
        sendAdminSuccess(response, await getInventoryFinanceStatistics(
          requestUrl.searchParams.get('keyword') || '',
          requestUrl.searchParams.get('page') || 1,
          requestUrl.searchParams.get('limit') || 10
        ));
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/legal-documents\/(?:privacy-policy|user-agreement)$/.test(requestUrl.pathname)) {
      try {
        const type = requestUrl.pathname.split('/').pop();
        const document = await getPublicLegalDocument(type);
        if (!document) {
          sendAdminError(response, 404, '法律文档不存在');
          return;
        }
        sendAdminSuccess(response, document);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/legal-documents\/(?:privacy-policy|user-agreement)$/.test(requestUrl.pathname)) {
      try {
        const type = requestUrl.pathname.split('/').pop();
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await updateAdminLegalDocument(type, body.content), '保存成功');
      } catch (error) {
        sendAdminError(response, 400, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/admin/inventory_management/export') {
      try {
        const workbook = await exportAdminInventoryManagement({
          keyword: requestUrl.searchParams.get('keyword') || '',
          format: requestUrl.searchParams.get('format') || 'xlsx',
          staffId: adminUser.permission === STAFF_PERMISSIONS.STAFF ? adminUser.id : 0,
        });
        const format = String(requestUrl.searchParams.get('format') || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
        response.writeHead(200, {
          'Content-Type': format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="inventory-data.${format}"`,
        });
        response.end(workbook);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/inventory_management\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminInventoryManagement({
          page,
          keyword: requestUrl.searchParams.get('keyword') || '',
          limit: requestUrl.searchParams.get('limit') || 10,
          staffId: adminUser.permission === STAFF_PERMISSIONS.STAFF ? adminUser.id : 0,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/inventory_management') {
      try {
        const body = await parseJsonBody(request);
        sendAdminSuccess(response, await createAdminInventoryManagement(
          body,
          adminUser.permission === STAFF_PERMISSIONS.STAFF ? adminUser.id : 0
        ), '创建成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/inventory_management/delete_all') {
      try {
        const body = await parseJsonBody(request);
        const deletedCount = await deleteAdminInventoryManagementBatch(body.ids);
        sendAdminSuccess(response, { deletedCount }, '批量删除成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/inventory_management\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const inventoryId = Number(requestUrl.pathname.split('/').pop() || 0);
        const data = await updateAdminInventoryManagement(
          inventoryId,
          body,
          adminUser.permission === STAFF_PERMISSIONS.STAFF ? adminUser.id : 0
        );
        if (!data) {
          sendAdminError(response, 404, '库存记录不存在');
          return;
        }
        sendAdminSuccess(response, data, '保存成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/inventory_management\/\d+\/delete$/.test(requestUrl.pathname)) {
      try {
        const inventoryId = Number(requestUrl.pathname.split('/')[3] || 0);
        const deleted = await deleteAdminInventoryManagement(inventoryId);
        if (!deleted) {
          sendAdminError(response, 404, '库存记录不存在');
          return;
        }
        sendAdminSuccess(response, 'ok', '删除成功');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/goods\/read\/\d+$/.test(requestUrl.pathname)) {
      try {
        const productId = Number(requestUrl.pathname.split('/').pop() || 0);
        const goods = await getAdminGoodsById(productId);
        if (!goods) {
          sendAdminError(response, 404, '????');
          return;
        }

        sendAdminSuccess(response, goods);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'GET' && /^\/admin\/goods\/\d+$/.test(requestUrl.pathname)) {
      try {
        const page = Number(requestUrl.pathname.split('/').pop() || 1);
        const data = await listAdminGoods({
          page,
          title: requestUrl.searchParams.get('title') || '',
          tab: requestUrl.searchParams.get('tab') || 'all',
          categoryId: requestUrl.searchParams.get('category_id') || 0,
        });
        sendAdminSuccess(response, data);
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/goods') {
      try {
        const body = await parseJsonBody(request);
        const goods = await createAdminGoods(body);
        sendAdminSuccess(response, goods, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/goods/delete_all') {
      try {
        const body = await parseJsonBody(request);
        await softDeleteGoods(Array.isArray(body.ids) ? body.ids : []);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/goods/changestatus') {
      try {
        const body = await parseJsonBody(request);
        await updateGoodsStatus(Array.isArray(body.ids) ? body.ids : [], body.status);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/goods/restore') {
      try {
        const body = await parseJsonBody(request);
        await restoreGoods(Array.isArray(body.ids) ? body.ids : []);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/admin/goods/destroy') {
      try {
        const body = await parseJsonBody(request);
        await destroyGoods(Array.isArray(body.ids) ? body.ids : []);
        sendAdminSuccess(response, 'ok', '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/goods\/\d+\/check$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const productId = Number(requestUrl.pathname.split('/')[3] || 0);
        const goods = await checkGoods(productId, body.ischeck, body.status);
        sendAdminSuccess(response, goods, '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/goods\/banners\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const productId = Number(requestUrl.pathname.split('/').pop() || 0);
        const goods = await setAdminGoodsBanners(productId, body);
        if (!goods) {
          sendAdminError(response, 404, '????');
          return;
        }

        sendAdminSuccess(response, goods, '????');
      } catch (error) {
        sendAdminError(response, 500, error && error.message ? error.message : String(error));
      }
      return;
    }

    if (request.method === 'POST' && /^\/admin\/goods\/\d+$/.test(requestUrl.pathname)) {
      try {
        const body = await parseJsonBody(request);
        const productId = Number(requestUrl.pathname.split('/').pop() || 0);
        const goods = await updateAdminGoods(productId, body);
        if (!goods) {
          sendAdminError(response, 404, '????');
          return;
        }

        sendAdminSuccess(response, goods, '????');
      } catch (error) {
        sendAdminError(response, Number(error && error.statusCode) || 500, error && error.message ? error.message : String(error));
      }
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/wechat/login') {
    try {
      const body = await parseJsonBody(request);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
      const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';

      logAuthTrace('login_request_received', {
        codeLength: code.length,
        hasNickname: Boolean(nickname),
        hasAvatarUrl: Boolean(avatarUrl),
      });

      if (!code) {
        sendJson(response, 400, {
          success: false,
          message: 'code is required',
        });
        return;
      }

      const wechatSession = await fetchWechatSession(code);
      logAuthTrace('wechat_session_resolved', {
        openid: maskValue(wechatSession.openid),
        unionid: maskValue(wechatSession.unionid),
      });
      const { user, isNewUser } = await createUser({
        openid: wechatSession.openid,
        unionid: wechatSession.unionid,
        nickname,
        avatarUrl,
      });
      logAuthTrace('user_persisted', {
        openid: maskValue(user.openId),
        uid: user.uid,
        isNewUser,
      });
      const sessionPayload = createSessionPayload(user);
      const token = signToken(sessionPayload);

      sendJson(response, 200, {
        success: true,
        token,
        expiresAt: sessionPayload.exp * 1000,
        isNewUser,
        ...sanitizeUserProfile(user),
      });
      return;
    } catch (error) {
      logAuthTrace('login_request_failed', {
        message: error && error.message ? error.message : String(error),
      });
      sendJson(response, 500, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (requestUrl.pathname === '/api/user/profile') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, {
        success: true,
        ...sanitizeUserProfile(authUser),
      });
      return;
    }

    if (request.method === 'PUT') {
      try {
        const body = await parseJsonBody(request);
        const nextUser = await updateUserProfile(authUser.openId, body);

        if (!nextUser) {
          sendJson(response, 404, {
            success: false,
            message: 'user not found',
          });
          return;
        }

        sendJson(response, 200, {
          success: true,
          ...sanitizeUserProfile(nextUser),
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/user/wechat-phone') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const code = String(body.code || '').trim();
      if (!code) {
        sendJson(response, 400, { success: false, code: 'WECHAT_PHONE_CODE_REQUIRED', message: 'wechat phone code is required' });
        return;
      }

      const phone = await fetchWechatPhoneNumber(code);
      const user = await bindWechatPhone(authUser.openId, phone);
      if (!user) {
        sendJson(response, 404, { success: false, message: 'user not found' });
        return;
      }

      sendJson(response, 200, { success: true, ...sanitizeUserProfile(user) });
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        code: error && error.code ? error.code : 'WECHAT_PHONE_BIND_FAILED',
        message: error && error.message ? error.message : 'wechat phone binding failed',
      });
    }
    return;
  }

  if (request.method === 'POST' && /^\/api\/orders\/purchase\/\d+\/remark$/.test(requestUrl.pathname)) {
    const authUser = await requireAuthUser(request);
    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }
    const id = Number(requestUrl.pathname.split('/')[4] || 0);
    const body = await parseJsonBody(request);
    const order = await updatePurchaseOrderRemark(authUser.openId, id, body.remark);
    if (!order) {
      sendJson(response, 404, { success: false, message: 'order not found' });
      return;
    }
    sendJson(response, 200, { success: true, order: sanitizePurchaseOrder(order) });
    return;
  }

  if (requestUrl.pathname === '/api/orders/purchase/receipt-confirmation') {
    const authUser = await requireAuthUser(request);
    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }
    if (request.method !== 'GET') {
      sendJson(response, 405, { success: false, message: 'method not allowed' });
      return;
    }

    const id = Number(requestUrl.searchParams.get('id') || 0);
    if (!id) {
      sendJson(response, 400, { success: false, message: 'id is required' });
      return;
    }

    try {
      const order = await getPurchaseOrderById(authUser.openId, id);
      if (!order) {
        sendJson(response, 404, { success: false, message: 'order not found' });
        return;
      }
      if (order.status === 'received') {
        sendJson(response, 409, { success: false, message: '该订单已确认收货' });
        return;
      }
      if (order.status !== 'paid') {
        sendJson(response, 400, { success: false, message: '当前订单暂不能确认收货' });
        return;
      }
      if (!order.shipData) {
        sendJson(response, 409, {
          success: false,
          code: 'ORDER_NOT_SHIPPED',
          message: '商品暂未发货',
        });
        return;
      }
      if (config.wechatPayMockMode) {
        sendJson(response, 400, { success: false, message: '模拟支付订单无法同步微信确认收货' });
        return;
      }

      const transactionId = String(order.paymentTransactionId || '').trim();
      const merchantTradeNo = String(order.outTradeNo || '').trim();
      const merchantId = String(config.wechatPayMerchantId || '').trim();
      if (!transactionId || !merchantTradeNo || !merchantId) {
        sendJson(response, 400, { success: false, message: '微信订单信息不完整，暂时无法确认收货' });
        return;
      }

      sendJson(response, 200, {
        success: true,
        confirmation: { merchantId, merchantTradeNo, transactionId },
      });
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/orders/purchase') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    if (request.method === 'GET') {
      const orders = await listPurchaseOrders(authUser.openId);
      sendJson(response, 200, {
        success: true,
        orders: orders.map(sanitizePurchaseOrder),
      });
      return;
    }

    if (request.method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        const productId = Number(body.productId || 0);
        const addressId = Number(body.addressId || 0);
        const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
        const recipientPhone = typeof body.recipientPhone === 'string' ? body.recipientPhone.trim() : '';
        const addressDetail = typeof body.addressDetail === 'string' ? body.addressDetail.trim() : '';

        if (!productId) {
          sendJson(response, 400, { success: false, message: 'productId is required' });
          return;
        }

        if (!addressId && (!recipientName || !recipientPhone || !addressDetail)) {
          sendJson(response, 400, { success: false, message: 'address is required' });
          return;
        }

        await expirePurchaseOrderReservations();
        const order = await createPurchaseOrder(authUser.openId, body);
        sendJson(response, 200, {
          success: true,
          order: sanitizePurchaseOrder(order || {}),
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }

    if (request.method === 'PUT') {
      const id = Number(requestUrl.searchParams.get('id') || 0);

      if (!id) {
        sendJson(response, 400, {
          success: false,
          message: 'id is required',
        });
        return;
      }

      try {
        const currentOrder = await getPurchaseOrderById(authUser.openId, id);
        if (!currentOrder) {
          sendJson(response, 404, {
            success: false,
            message: 'order not found',
          });
          return;
        }

        if (currentOrder.status !== 'received') {
          if (currentOrder.status !== 'paid') {
            throw new Error('当前订单暂不能确认收货');
          }
          await verifyWechatReceiptConfirmed(currentOrder, authUser.openId);
        }

        const order = await markPurchaseOrderReceived(authUser.openId, id);
        if (!order) {
          sendJson(response, 404, {
            success: false,
            message: 'order not found',
          });
          return;
        }

        sendJson(response, 200, {
          success: true,
          order: sanitizePurchaseOrder(order),
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }

    if (request.method === 'DELETE') {
      const id = Number(requestUrl.searchParams.get('id') || 0);

      if (!id) {
        await clearPurchaseOrders(authUser.openId);
        sendJson(response, 200, { success: true });
        return;
      }

      const deleted = await deletePurchaseOrder(authUser.openId, id);
      sendJson(response, 200, {
        success: deleted,
        message: deleted ? 'deleted' : 'not found',
      });
      return;
    }
  }

  if (requestUrl.pathname === '/api/addresses') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    if (request.method === 'GET') {
      const id = Number(requestUrl.searchParams.get('id') || 0);

      if (id) {
        const address = await getAddressById(authUser.openId, id);
        sendJson(response, address ? 200 : 404, {
          success: Boolean(address),
          address: address ? sanitizeAddress(address) : null,
          message: address ? 'ok' : 'address not found',
        });
        return;
      }

      const addresses = await listAddresses(authUser.openId);
      sendJson(response, 200, {
        success: true,
        addresses: addresses.map(sanitizeAddress),
      });
      return;
    }

    if (request.method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
        const recipientPhone = typeof body.recipientPhone === 'string' ? body.recipientPhone.trim() : '';
        const addressDetail = typeof body.addressDetail === 'string' ? body.addressDetail.trim() : '';

        if (!recipientName || !recipientPhone || !addressDetail) {
          sendJson(response, 400, { success: false, message: 'address is required' });
          return;
        }

        if (!/^1\d{10}$/.test(recipientPhone)) {
          sendJson(response, 400, { success: false, message: 'recipientPhone is invalid' });
          return;
        }

        const address = await createAddress(authUser.openId, body);
        sendJson(response, 200, {
          success: true,
          address: sanitizeAddress(address || {}),
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }

    if (request.method === 'PUT') {
      try {
        const id = Number(requestUrl.searchParams.get('id') || 0);
        if (!id) {
          sendJson(response, 400, { success: false, message: 'id is required' });
          return;
        }

        const body = await parseJsonBody(request);
        const recipientPhone = typeof body.recipientPhone === 'string' ? body.recipientPhone.trim() : '';
        if (recipientPhone && !/^1\d{10}$/.test(recipientPhone)) {
          sendJson(response, 400, { success: false, message: 'recipientPhone is invalid' });
          return;
        }

        const address = await updateAddress(authUser.openId, id, body);
        sendJson(response, address ? 200 : 404, {
          success: Boolean(address),
          address: address ? sanitizeAddress(address) : null,
          message: address ? 'ok' : 'address not found',
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }

    if (request.method === 'DELETE') {
      const id = Number(requestUrl.searchParams.get('id') || 0);
      if (!id) {
        sendJson(response, 400, { success: false, message: 'id is required' });
        return;
      }

      const deleted = await deleteAddress(authUser.openId, id);
      sendJson(response, deleted ? 200 : 404, {
        success: deleted,
        message: deleted ? 'deleted' : 'address not found',
      });
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/pay/wechat/notify') {
    try {
      if (!config.wechatPayPublicKeyPath) {
        throw new Error('WECHAT_PAY_PUBLIC_KEY_PATH is not configured');
      }

      const rawBody = await parseRequestBody(request);
      verifyWechatPaySignature(request, rawBody);

      const payload = JSON.parse(rawBody.toString('utf8') || '{}');
      const resource = decryptWechatPayResource(payload.resource);

      if (String(resource.trade_state || '') === 'SUCCESS' && resource.out_trade_no) {
        const batch = await markPaymentBatchPaidByOutTradeNo(resource.out_trade_no, resource.transaction_id || '');
        if (batch) {
        } else {
          await markPurchaseOrderPaidByOutTradeNo(resource.out_trade_no, resource.transaction_id || '');
        }
      }

      sendWechatNotifySuccess(response);
      return;
    } catch (error) {
      sendWechatNotifyFail(response, error && error.message ? error.message : String(error));
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/pay/wechat/transfer/notify') {
    try {
      if (!config.wechatPayPublicKeyPath) {
        throw new Error('WECHAT_PAY_PUBLIC_KEY_PATH is not configured');
      }

      const rawBody = await parseRequestBody(request);
      verifyWechatPaySignature(request, rawBody);

      const payload = JSON.parse(rawBody.toString('utf8') || '{}');
      const resource = decryptWechatPayResource(payload.resource);
      const outBillNo = String(resource.out_bill_no || '').trim();

      if (outBillNo) {
        await updateRecycleSettlementByOutBillNo(outBillNo, {
          ...buildRecycleSettlementPatchFromWechat(resource),
          notifyRaw: JSON.stringify(resource || {}),
        });
      }

      sendWechatNotifySuccess(response);
      return;
    } catch (error) {
      sendWechatNotifyFail(response, error && error.message ? error.message : String(error));
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/pay/wechat/create-batch') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const orderIds = Array.isArray(body.orderIds)
        ? body.orderIds.map((id) => Number(id || 0)).filter((id) => id > 0)
        : [];

      if (!orderIds.length) {
        sendJson(response, 400, {
          success: false,
          message: 'orderIds is required',
        });
        return;
      }

      await expirePurchaseOrderReservations();
      if (!config.wechatPayMockMode && !isConfiguredForRealWechatPay()) {
        sendJson(response, 400, {
          success: false,
          message: '???????',
          code: 'WECHAT_PAY_NOT_CONFIGURED',
        });
        return;
      }

      const batch = await createPaymentBatch(authUser.openId, orderIds);
      if (!batch) {
        sendJson(response, 400, {
          success: false,
          message: 'failed to create payment batch',
        });
        return;
      }

      const paymentTarget = {
        id: batch.id,
        batchNo: batch.batchNo,
        totalAmount: batch.totalAmount,
        outTradeNo: batch.outTradeNo,
      };
      const payment = config.wechatPayMockMode
        ? buildMockWechatPayment(paymentTarget)
        : await buildRealWechatPayment(paymentTarget, authUser.openId);

      sendJson(response, 200, {
        success: true,
        batch: sanitizePaymentBatch(batch),
        payment,
      });
      return;
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (requestUrl.pathname === '/api/pay/wechat/create') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    if (request.method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        await expirePurchaseOrderReservations();
        const orderId = Number(body.orderId || 0);

        if (!orderId) {
          sendJson(response, 400, {
            success: false,
            message: 'orderId is required',
          });
          return;
        }

        const order = await getPurchaseOrderById(authUser.openId, orderId);
        if (!order) {
          sendJson(response, 404, {
            success: false,
            message: 'order not found',
          });
          return;
        }

        if (order.status === 'paid') {
          sendJson(response, 200, {
            success: true,
            order: sanitizePurchaseOrder(order),
            payment: config.wechatPayMockMode ? buildMockWechatPayment(order) : null,
          });
          return;
        }

        if (!config.wechatPayMockMode && !isConfiguredForRealWechatPay()) {
          sendJson(response, 400, {
            success: false,
            message: '???????',
            code: 'WECHAT_PAY_NOT_CONFIGURED',
          });
          return;
        }

        const outTradeNo = order.outTradeNo || buildOutTradeNo(order);
        const nextOrder = await markPurchaseOrderPendingPayment(authUser.openId, order.id, outTradeNo);
        const resolvedOutTradeNo = String((nextOrder && nextOrder.outTradeNo) || outTradeNo || '');
        const payment = config.wechatPayMockMode
          ? buildMockWechatPayment({
              ...order,
              outTradeNo: resolvedOutTradeNo,
            })
          : await buildRealWechatPayment(
              {
                ...order,
                outTradeNo: resolvedOutTradeNo,
              },
              authUser.openId
            );

        sendJson(response, 200, {
          success: true,
          order: sanitizePurchaseOrder(nextOrder || order),
          payment,
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/pay/wechat/complete-batch') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const batchId = Number(body.batchId || 0);
      const paymentTransactionId =
        typeof body.paymentTransactionId === 'string' ? body.paymentTransactionId.trim() : '';

      if (!batchId) {
        sendJson(response, 400, {
          success: false,
          message: 'batchId is required',
        });
        return;
      }

      const batch = await getPaymentBatchById(authUser.openId, batchId);
      if (!batch) {
        sendJson(response, 404, {
          success: false,
          message: 'payment batch not found',
        });
        return;
      }

      const nextBatch = config.wechatPayMockMode
        ? await markPaymentBatchPaid(authUser.openId, batchId, paymentTransactionId || `mock_batch_txn_${Date.now()}`)
        : await syncRealWechatPaymentBatchResult(batch);

      if (!nextBatch) {
        sendJson(response, 404, {
          success: false,
          message: 'payment batch not found',
        });
        return;
      }

      if (nextBatch.status !== 'paid') {
        sendJson(response, 202, {
          success: false,
          code: 'PAYMENT_NOT_CONFIRMED',
          message: 'payment not confirmed yet',
          batch: sanitizePaymentBatch(nextBatch),
        });
        return;
      }

      sendJson(response, 200, {
        success: true,
        batch: sanitizePaymentBatch(nextBatch),
      });
      return;
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/pay/wechat/complete') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const orderId = Number(body.orderId || 0);
      const paymentTransactionId =
        typeof body.paymentTransactionId === 'string' ? body.paymentTransactionId.trim() : '';

      if (!orderId) {
        sendJson(response, 400, {
          success: false,
          message: 'orderId is required',
        });
        return;
      }

      const order = await getPurchaseOrderById(authUser.openId, orderId);
      if (!order) {
        sendJson(response, 404, {
          success: false,
          message: 'order not found',
        });
        return;
      }

      const nextOrder = config.wechatPayMockMode
        ? await markPurchaseOrderPaid(authUser.openId, orderId, paymentTransactionId || `mock_txn_${Date.now()}`)
        : await syncRealWechatPaymentResult(order);

      if (!nextOrder) {
        sendJson(response, 404, {
          success: false,
          message: 'order not found',
        });
        return;
      }
      if (nextOrder.status === 'paid' && nextOrder.shipData) {
        void syncPurchaseOrderToWechatOrder(nextOrder);
      }

      if (nextOrder.status !== 'paid') {
        sendJson(response, 202, {
          success: false,
          code: 'PAYMENT_NOT_CONFIRMED',
          message: 'payment not confirmed yet',
          order: sanitizePurchaseOrder(nextOrder),
        });
        return;
      }

      sendJson(response, 200, {
        success: true,
        order: sanitizePurchaseOrder(nextOrder),
      });
      return;
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/recycle/pickup/config') {
    const senderAddress = buildSfExpressRuntimeConfig().senderAddress;
    sendJson(response, 200, {
      success: true,
      senderAddress,
      displayAddress: buildSfExpressDisplayAddress(senderAddress),
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/recycle/pickup/sf-status') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    sendJson(response, 200, {
      success: true,
      status: buildSfExpressStatusPayload(),
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/pickup/sf-pickup-times') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    if (!isSfExpressConfigured()) {
      sendJson(response, 503, {
        success: false,
        message: 'sf express config is incomplete',
        status: buildSfExpressStatusPayload(),
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const sendTime = String(body.sendTime || '').trim();
      const addressPayload = body.customerAddress && typeof body.customerAddress === 'object' ? body.customerAddress : {};
      const addressId = Number(addressPayload.addressId || 0);
      const savedAddress = addressId > 0 ? await getAddressById(authUser.openId, addressId) : null;
      const customerAddress = savedAddress || {
        recipientName: String(addressPayload.recipientName || '').trim(),
        recipientPhone: String(addressPayload.recipientPhone || '').trim(),
        province: String(addressPayload.province || '').trim(),
        city: String(addressPayload.city || '').trim(),
        district: String(addressPayload.district || '').trim(),
        addressDetail: String(addressPayload.addressDetail || '').trim(),
      };

      if (
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sendTime)
        || !customerAddress.province
        || !customerAddress.city
        || !customerAddress.district
        || !customerAddress.addressDetail
      ) {
        sendJson(response, 400, { success: false, message: 'sf pickup time query fields are required' });
        return;
      }

      const pickupTime = await checkSfPickupTime({
        config: buildSfExpressRuntimeConfig(),
        customerAddress,
        sendTime,
      });
      sendJson(response, 200, { success: true, pickupTime });
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        code: String(error && (error.apiCode || error.businessCode) || ''),
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/pickup/sf-order') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    if (!isSfExpressConfigured()) {
      sendJson(response, 503, {
        success: false,
        message: 'sf express config is incomplete',
        status: buildSfExpressStatusPayload(),
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const courierCode = String(body.courierCode || '').trim().toLowerCase();
      const pickupTimeMode = String(body.pickupTimeMode || '').trim().toLowerCase();
      const pickupTimeText = String(body.pickupTimeText || '').trim();
      const pickupStartTime = normalizeSfPickupStartTime({
        pickupStartTime: body.pickupStartTime,
        pickupTimeText,
      });
      const sourceItems = Array.isArray(body.recycleItems) ? body.recycleItems : [];
      const addressPayload = body.customerAddress && typeof body.customerAddress === 'object' ? body.customerAddress : {};
      const addressId = Number(addressPayload.addressId || 0);

      if (
        courierCode !== 'sf'
        || !['now', 'schedule'].includes(pickupTimeMode)
        || !pickupTimeText
        || !sourceItems.length
        || (pickupTimeMode === 'schedule' && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(pickupStartTime))
      ) {
        sendJson(response, 400, {
          success: false,
          message: 'sf pickup order fields are required',
        });
        return;
      }

      const savedAddress = addressId > 0 ? await getAddressById(authUser.openId, addressId) : null;
      const customerAddress = savedAddress || {
        recipientName: String(addressPayload.recipientName || '').trim(),
        recipientPhone: String(addressPayload.recipientPhone || '').trim(),
        province: String(addressPayload.province || '').trim(),
        city: String(addressPayload.city || '').trim(),
        district: String(addressPayload.district || '').trim(),
        addressDetail: String(addressPayload.addressDetail || '').trim(),
      };

      if (
        !customerAddress.recipientName
        || !customerAddress.recipientPhone
        || !customerAddress.province
        || !customerAddress.city
        || !customerAddress.district
        || !customerAddress.addressDetail
      ) {
        sendJson(response, 400, { success: false, message: 'pickup address is required' });
        return;
      }

      const recycleItems = sourceItems.map((item) => ({
        recycleProductId: Number(item && item.recycleProductId || 0) || undefined,
        categoryKey: String(item && item.categoryKey || '').trim(),
        title: String(item && item.title || '').trim(),
        coverLabel: String(item && item.coverLabel || '').trim(),
        coverImage: String(item && item.coverImage || '').trim(),
        coverTheme: String(item && item.coverTheme || 'red').trim(),
        payoutMethodLabel: String(item && item.payoutMethodLabel || '').trim(),
        accountNumber: String(item && item.accountNumber || '').trim(),
        realName: String(item && item.realName || '').trim(),
        optionSummary: String(item && item.optionSummary || '').trim(),
        selectedDeviceOptionValues: item && typeof item.selectedDeviceOptionValues === 'object' ? item.selectedDeviceOptionValues : {},
        selectedDeviceOptionTexts: item && typeof item.selectedDeviceOptionTexts === 'object' ? item.selectedDeviceOptionTexts : {},
        submissionImages: Array.isArray(item && item.submissionImages) ? item.submissionImages : [],
        estimateSupported: !item || item.estimateSupported !== false,
        estimateBasePrice: Number(item && item.estimateBasePrice || 0),
        estimateFinalPrice: Number(item && item.estimateFinalPrice || 0),
        note: String(item && item.note || '').trim(),
      }));
      const invalidItem = recycleItems.find((item) => (
        !item.title
        || !item.realName
        || (!isWechatRecyclePayoutMethod(item) && !item.accountNumber)
        || item.estimateSupported === false
      ));

      if (invalidItem) {
        sendJson(response, 400, { success: false, message: invalidItem.note || 'recycle order fields are required' });
        return;
      }

      if (pickupTimeMode === 'schedule') {
        const pickupTime = await checkSfPickupTime({
          config: buildSfExpressRuntimeConfig(),
          customerAddress,
          sendTime: pickupStartTime,
        });
        if (!pickupTime.status) {
          sendJson(response, 409, {
            success: false,
            code: 'SF_PICKUP_TIME_UNAVAILABLE',
            message: pickupTime.exceptionReason || '所选时间不在顺丰可预约上门范围内，请重新选择',
            pickupTime,
          });
          return;
        }
      }

      const pickupOrder = await createSfPickupOrder({
        config: buildSfExpressRuntimeConfig(),
        customerAddress,
        recycleItems,
        pickupTimeMode,
        pickupTimeText,
        pickupStartTime,
      });
      const pickupAddressText = [
        customerAddress.recipientName,
        customerAddress.recipientPhone,
        [customerAddress.province, customerAddress.city, customerAddress.district, customerAddress.addressDetail].filter(Boolean).join(' '),
      ].filter(Boolean).join(' ');
      const pickupNote = buildSfPickupServiceNote({
        pickupOrder,
        pickupTimeText,
        customerAddress: pickupAddressText,
      });
      const orders = [];

      for (const item of recycleItems) {
        const order = await createRecycleOrder(authUser.openId, {
          ...item,
          note: appendRecycleNote(item.note, pickupNote),
          sfExpressNumber: pickupOrder.waybillNo,
        });
        if (!order) {
          throw new Error('recycle order was not created');
        }
        orders.push(order);
      }

      if (orders.length !== recycleItems.length) {
        throw new Error('recycle order count mismatch');
      }

      sendJson(response, 200, {
        success: true,
        pickupOrder,
        orders: orders.map((order) => sanitizeRecycleOrder(order || {})),
      });
      return;
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/pickup/sf-search-order') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    if (!isSfExpressConfigured()) {
      sendJson(response, 503, { success: false, message: 'sf express config is incomplete' });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const recycleOrderId = Number(body.recycleOrderId || 0);
      if (!recycleOrderId) {
        sendJson(response, 400, { success: false, message: 'recycleOrderId is required' });
        return;
      }

      const recycleOrder = await getRecycleOrderById(authUser.openId, recycleOrderId);
      if (!recycleOrder) {
        sendJson(response, 404, { success: false, message: 'recycle order not found' });
        return;
      }

      const pickupInfo = parseSfPickupNote(recycleOrder.note);
      if (!pickupInfo.isSfPickup || !pickupInfo.pickupOrderId) {
        sendJson(response, 400, { success: false, message: 'sf pickup order info is missing' });
        return;
      }

      const sfResponse = await invokeSfExpressService({
        config: buildSfExpressRuntimeConfig(),
        serviceCode: 'EXP_RECE_SEARCH_ORDER_RESP',
        msgData: { orderId: pickupInfo.pickupOrderId },
      });
      const responseMsgData = parseSfBusinessMessageData(sfResponse.businessPayload);
      const waybillNoInfoList = Array.isArray(responseMsgData.waybillNoInfoList)
        ? responseMsgData.waybillNoInfoList
        : [];
      const primaryWaybill = waybillNoInfoList.find((item) => Number(item.waybillType || 0) === 1) || waybillNoInfoList[0] || {};
      const waybillNo = String(primaryWaybill.waybillNo || pickupInfo.waybillNo || '').trim();

      sendJson(response, 200, {
        success: true,
        pickupOrder: {
          orderId: String(responseMsgData.orderId || pickupInfo.pickupOrderId || '').trim(),
          waybillNo,
          waybillNoInfoList: waybillNoInfoList.map((item) => ({
            waybillNo: String(item.waybillNo || '').trim(),
            waybillType: Number(item.waybillType || 0),
          })),
          canceled: pickupInfo.canceled,
          businessPayload: sfResponse.businessPayload || {},
        },
        order: sanitizeRecycleOrder(recycleOrder),
      });
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/pickup/sf-cloud-print-waybills') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    if (!isSfExpressConfigured()) {
      sendJson(response, 503, { success: false, message: 'sf express config is incomplete' });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const templateCode = String(body.templateCode || '').trim();
      if (!templateCode) {
        sendJson(response, 400, { success: false, message: 'templateCode is required' });
        return;
      }

      const recycleOrderId = Number(body.recycleOrderId || 0);
      let recycleOrder = null;
      let waybillNo = String(body.waybillNo || '').trim();
      let documents = Array.isArray(body.documents) ? body.documents : [];

      if (recycleOrderId > 0) {
        recycleOrder = await getRecycleOrderById(authUser.openId, recycleOrderId);
        if (!recycleOrder) {
          sendJson(response, 404, { success: false, message: 'recycle order not found' });
          return;
        }

        const pickupInfo = parseSfPickupNote(recycleOrder.note);
        if (!pickupInfo.isSfPickup) {
          sendJson(response, 400, { success: false, message: 'sf pickup order info is missing' });
          return;
        }

        waybillNo = waybillNo || String(pickupInfo.waybillNo || '').trim();
      }

      if (!documents.length) {
        documents = buildSfCloudPrintDocumentsFromWaybillNo(waybillNo);
      }

      const printResult = await createSfCloudPrintWaybills({
        config: buildSfExpressRuntimeConfig(),
        templateCode,
        version: String(body.version || '').trim() || '2.0',
        fileType: String(body.fileType || '').trim() || 'pdf',
        sync: body.sync !== false,
        documents,
      });

      sendJson(response, 200, {
        success: true,
        printResult,
        order: recycleOrder ? sanitizeRecycleOrder(recycleOrder) : null,
        serviceCode: SF_EXPRESS_CLOUD_PRINT_WAYBILLS_SERVICE_CODE,
      });
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/pickup/sf-test') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, { ...unauthorizedPayload });
      return;
    }

    if (!isSfExpressConfigured()) {
      sendJson(response, 503, { success: false, message: 'sf express config is incomplete' });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const serviceCode = String(body.serviceCode || '').trim().toUpperCase();
      const msgData = body.msgData && typeof body.msgData === 'object' && !Array.isArray(body.msgData) ? body.msgData : null;

      if (!serviceCode || !SF_EXPRESS_SUPPORTED_TEST_SERVICE_CODES.includes(serviceCode)) {
        sendJson(response, 400, { success: false, message: 'unsupported sf express service code' });
        return;
      }

      if (!msgData) {
        sendJson(response, 400, { success: false, message: 'msgData must be a JSON object' });
        return;
      }

      const sfResponse = await invokeSfExpressService({
        config: buildSfExpressRuntimeConfig(),
        serviceCode,
        msgData,
      });
      sendJson(response, 200, {
        success: true,
        serviceCode,
        requestId: sfResponse.requestId,
        timestamp: sfResponse.timestamp,
        payload: sfResponse.payload,
        businessPayload: sfResponse.businessPayload,
      });
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/orders/recycle') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    if (request.method === 'GET') {
      const orders = await attachLatestSettlementsToRecycleOrders(await listRecycleOrders(authUser.openId));
      sendJson(response, 200, {
        success: true,
        orders: orders.map(sanitizeRecycleOrder),
      });
      return;
    }

    if (request.method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.trim() : '';
        const realName = typeof body.realName === 'string' ? body.realName.trim() : '';

        if (!title || !realName || (!isWechatRecyclePayoutMethod(body) && !accountNumber)) {
          sendJson(response, 400, { success: false, message: 'recycle order fields are required' });
          return;
        }

        const order = await createRecycleOrder(authUser.openId, body);
        sendJson(response, 200, {
          success: true,
          order: sanitizeRecycleOrder(order || {}),
        });
        return;
      } catch (error) {
        sendJson(response, 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
        return;
      }
    }

    if (request.method === 'DELETE') {
      const id = Number(requestUrl.searchParams.get('id') || 0);

      if (!id) {
        await clearRecycleOrders(authUser.openId);
        sendJson(response, 200, { success: true });
        return;
      }

      try {
        const forceCleanup = requestUrl.searchParams.get('force') === '1';
        const cancelResult = await cancelRecycleOrderWithOptionalSf(authUser.openId, id, {
          skipSfCancel: forceCleanup,
        });
        const deleted = Boolean(cancelResult.order);
        sendJson(response, 200, {
          success: deleted,
          message: deleted ? 'cancelled' : 'not found',
          order: deleted ? sanitizeRecycleOrder(cancelResult.order || {}) : null,
          sfPickupCanceled: Boolean(cancelResult.sfPickupCanceled),
          sfPickupCancelSkipped: Boolean(cancelResult.sfPickupCancelSkipped),
          pickupOrder: cancelResult.sfPickupInfo || null,
        });
      } catch (error) {
        sendJson(response, Number(error && error.statusCode) || 400, {
          success: false,
          message: error && error.message ? error.message : String(error),
        });
      }
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/settlement/claim') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const recycleOrderId = Number(body.recycleOrderId || 0);
      const order = await getRecycleOrderById(authUser.openId, recycleOrderId);
      if (!order) {
        sendJson(response, 404, {
          success: false,
          message: 'recycle order not found',
        });
        return;
      }

      const settlement = await createRecycleSettlementForOrder(order);
      if (!settlement) {
        sendJson(response, 404, {
          success: false,
          message: 'settlement not found',
        });
        return;
      }

      if (String(settlement.state || '').trim().toUpperCase() !== 'WAIT_USER_CONFIRM' || !settlement.packageInfo) {
        sendJson(response, 400, {
          success: false,
          message: settlement.failReason || settlement.stateDesc || 'current settlement is not claimable',
        });
        return;
      }

      sendJson(response, 200, {
        success: true,
        settlement: sanitizeRecycleSettlement(settlement),
      });
      return;
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/settlement/sync') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const recycleOrderId = Number(body.recycleOrderId || 0);
      const order = await getRecycleOrderById(authUser.openId, recycleOrderId);
      if (!order) {
        sendJson(response, 404, {
          success: false,
          message: 'recycle order not found',
        });
        return;
      }

      const settlement = await syncRecycleSettlementByOrder(order);
      sendJson(response, 200, {
        success: true,
        settlement: settlement ? sanitizeRecycleSettlement(settlement) : null,
      });
      return;
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/pickup/sf-cancel-order') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    if (!isSfExpressApiConfigured()) {
      sendJson(response, 503, {
        success: false,
        message: 'sf express config is incomplete',
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);
      const recycleOrderId = Number(body.recycleOrderId || 0);

      if (!recycleOrderId) {
        sendJson(response, 400, {
          success: false,
          message: 'recycleOrderId is required',
        });
        return;
      }

      const recycleOrder = await getRecycleOrderById(authUser.openId, recycleOrderId);
      if (!recycleOrder) {
        sendJson(response, 404, {
          success: false,
          message: 'recycle order not found',
        });
        return;
      }

      const pickupInfo = parseSfPickupNote(recycleOrder.note);
      if (!pickupInfo.isSfPickup || !pickupInfo.pickupOrderId) {
        sendJson(response, 400, {
          success: false,
          message: 'sf pickup order info is missing',
        });
        return;
      }

      if (pickupInfo.canceled) {
        sendJson(response, 200, {
          success: true,
          message: 'sf pickup order already canceled',
          order: sanitizeRecycleOrder(recycleOrder || {}),
          pickupOrder: {
            orderId: pickupInfo.pickupOrderId,
            waybillNo: pickupInfo.waybillNo,
            canceled: true,
          },
        });
        return;
      }

      const cancelResult = await cancelRecycleOrderWithOptionalSf(authUser.openId, recycleOrderId);
      sendJson(response, 200, {
        success: Boolean(cancelResult.order),
        message: 'sf pickup order canceled',
        order: sanitizeRecycleOrder(cancelResult.order || recycleOrder || {}),
        pickupOrder: cancelResult.sfPickupInfo || null,
      });
      return;
    } catch (error) {
      sendJson(response, Number(error && error.statusCode) || 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
      return;
    }
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
    sendJson(response, 200, {
      success: true,
      message: 'logged out',
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/user/avatar/upload') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const formData = await parseMultipartFormData(request);
      const uploadFile = formData.files[0];
      if (!uploadFile) {
        sendJson(response, 422, {
          success: false,
          message: 'upload file is required',
        });
        return;
      }

      const relativePath = saveUploadedFile(uploadFile, 'user-avatars');
      const fullUrl = `${getPublicServerBaseUrl(request)}${relativePath}`;
      sendJson(response, 200, {
        success: true,
        imageUrl: fullUrl,
        imagePath: relativePath,
      });
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/recycle/upload') {
    const authUser = await requireAuthUser(request);

    if (!authUser) {
      sendJson(response, 401, {
        ...unauthorizedPayload,
      });
      return;
    }

    try {
      const formData = await parseMultipartFormData(request);
      const uploadFile = formData.files[0];
      if (!uploadFile) {
        sendJson(response, 422, {
          success: false,
          message: 'upload file is required',
        });
        return;
      }

      const relativePath = saveUploadedFile(uploadFile, 'recycle-submissions');
      const fullUrl = `${getPublicServerBaseUrl(request)}${relativePath}`;
      sendJson(response, 200, {
        success: true,
        imageUrl: fullUrl,
        imagePath: relativePath,
      });
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  sendJson(response, 404, {
    success: false,
    message: 'not found',
  });
});

// 部署保护模式只读取现有配置，不执行任何建表、补数据、导入或订单清理。
const prepareBackendStorage = async () => {
  // 仅创建本功能的独立配置表及缺失的默认项，不触碰任何现有业务数据。
  await initRecycleSettingsDatabase();

  if (config.preserveExistingData) {
    applySfExpressSenderConfig(await getAdminSysconfig());
    console.log('Existing-data preservation mode is enabled; startup data initialization was skipped.');
    return;
  }

  await initDatabase();
  await initAdminDatabase();
  applySfExpressSenderConfig(await getAdminSysconfig());
  await expirePurchaseOrderReservations();
  const reservationCleanupTimer = setInterval(() => {
    expirePurchaseOrderReservations().catch((error) => console.error(`Failed to release expired purchase reservations: ${error.message}`));
  }, 60 * 1000);
  reservationCleanupTimer.unref?.();
  await initRecycleAdminDatabase();
  await initRecycleReviewAdminDatabase();
};

prepareBackendStorage()
  .then(() => {
    server.listen(config.port, config.host, () => {
      console.log(`Backend running at http://${config.host}:${config.port}`);
    });
  })
  .catch((error) => {
    console.error(`Failed to initialize MySQL storage: ${error.message}`);
    process.exit(1);
  });
