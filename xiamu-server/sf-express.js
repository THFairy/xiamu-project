// 用途：封装顺丰丰桥接口调用、预约时段校验及上门取件订单创建。
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const DEFAULT_SANDBOX_URL = 'https://sfapi-sbox.sf-express.com/std/service';
const DEFAULT_PRODUCTION_URL = 'https://bspgw.sf-express.com/std/service';
const DEFAULT_SERVICE_CODE = 'EXP_RECE_CREATE_ORDER';
const PICKUP_TIME_SERVICE_CODE = 'EXP_EXCE_CHECK_PICKUP_TIME';
const CLOUD_PRINT_WAYBILLS_SERVICE_CODE = 'COM_RECE_CLOUD_PRINT_WAYBILLS';
const DEFAULT_SIGN_MODE = 'md5-base64';
const SUPPORTED_TEST_SERVICE_CODES = [
  'EXP_RECE_CREATE_ORDER',
  'EXP_RECE_SEARCH_ORDER_RESP',
  'EXP_RECE_UPDATE_ORDER',
  'EXP_RECE_GET_SUB_MAILNO',
  'EXP_RECE_QUERY_SFWAYBILL',
  'EXP_RECE_DELIVERY_NOTICE',
  'EXP_RECE_WANTED_INTERCEPT',
  'EXP_RECE_PRE_ORDER',
  PICKUP_TIME_SERVICE_CODE,
  'COM_RECE_QUERY_ADDRESS_BOOK_NEW',
  'COM_RECE_CEMP_ORDER_UNAVAILABLE_COUPON',
  'COM_RECE_CEMP_QUERY_COUPON_TEMPLATE',
  'COM_RECE_CEMP_ORDER_CANCEL_DISCOUNT',
  CLOUD_PRINT_WAYBILLS_SERVICE_CODE,
  'EXP_RECE_SEARCH_ROUTES',
];

const trimText = (value) => String(value || '').trim();

const createRequestId = () => crypto.randomUUID().replace(/-/g, '');

const normalizeSignMode = (value) => {
  const normalizedValue = trimText(value).toLowerCase();

  if (normalizedValue === 'simple_md5' || normalizedValue === 'simple-md5' || normalizedValue === 'md5-hex-upper') {
    return 'md5-hex-upper';
  }

  if (normalizedValue === 'md5-hex-lower') {
    return 'md5-hex-lower';
  }

  return DEFAULT_SIGN_MODE;
};

const createMsgDigest = ({ msgData, timestamp, checkWord, signMode = DEFAULT_SIGN_MODE }) => {
  const text = `${String(msgData || '')}${String(timestamp || '')}${String(checkWord || '')}`;
  const digest = crypto
    .createHash('md5')
    .update(text, 'utf8')
    .digest('hex');
  const normalizedSignMode = normalizeSignMode(signMode);

  if (normalizedSignMode === 'md5-hex-upper') {
    return digest.toUpperCase();
  }

  if (normalizedSignMode === 'md5-hex-lower') {
    return digest.toLowerCase();
  }

  return Buffer.from(digest, 'hex').toString('base64');
};

const parseJsonText = (text) => {
  if (!trimText(text)) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      raw: text,
    };
  }
};

const parseBusinessPayload = (apiResultData) => {
  if (!apiResultData) {
    return {};
  }

  if (typeof apiResultData === 'string') {
    return parseJsonText(apiResultData);
  }

  if (typeof apiResultData === 'object') {
    return apiResultData;
  }

  return {};
};

const normalizeSfApiError = ({ statusCode = 500, payload = {}, businessPayload = {} }) => {
  const apiMessage = trimText(payload.apiErrorMsg || payload.errorMsg || payload.message);
  const businessMessage = trimText(businessPayload.errorMsg || businessPayload.message);
  const businessCode = trimText(businessPayload.errorCode);
  const apiCode = trimText(payload.apiResultCode || payload.errorCode);
  const message = businessMessage || apiMessage || `sf express request failed with status ${statusCode}`;
  const error = new Error(message);

  error.statusCode = statusCode;
  error.apiCode = apiCode;
  error.businessCode = businessCode;
  error.payload = payload;
  error.businessPayload = businessPayload;
  return error;
};

const sendSfExpressRequest = ({
  partnerId,
  checkWord,
  serviceCode = DEFAULT_SERVICE_CODE,
  endpointUrl = DEFAULT_SANDBOX_URL,
  signMode = DEFAULT_SIGN_MODE,
  msgData,
  timeoutMs = 15000,
}) =>
  new Promise((resolve, reject) => {
    const timestamp = String(Date.now());
    const requestID = createRequestId();
    const msgDataText = JSON.stringify(msgData || {});
    const msgDigest = createMsgDigest({
      msgData: msgDataText,
      timestamp,
      checkWord,
      signMode,
    });
    const endpoint = new URL(endpointUrl);
    const requestBody = new URLSearchParams({
      partnerID: partnerId,
      requestID,
      serviceCode,
      timestamp,
      msgDigest,
      msgData: msgDataText,
    }).toString();

    const protocolClient = endpoint.protocol === 'http:' ? http : https;
    const request = protocolClient.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'Content-Length': Buffer.byteLength(requestBody),
          'User-Agent': 'xiamu-adminweb/1.0',
        },
      },
      (apiResponse) => {
        const chunks = [];

        apiResponse.on('data', (chunk) => {
          chunks.push(chunk);
        });

        apiResponse.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8');
          const payload = parseJsonText(rawText);
          const businessPayload = parseBusinessPayload(payload.apiResultData);

          if (apiResponse.statusCode >= 400) {
            reject(normalizeSfApiError({
              statusCode: apiResponse.statusCode,
              payload,
              businessPayload,
            }));
            return;
          }

          if (trimText(payload.apiResultCode) && trimText(payload.apiResultCode) !== 'A1000') {
            reject(normalizeSfApiError({
              statusCode: apiResponse.statusCode || 400,
              payload,
              businessPayload,
            }));
            return;
          }

          if (businessPayload && businessPayload.success === false) {
            reject(normalizeSfApiError({
              statusCode: apiResponse.statusCode || 400,
              payload,
              businessPayload,
            }));
            return;
          }

          resolve({
            requestID,
            timestamp,
            payload,
            businessPayload,
          });
        });
      }
    );

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('sf express request timeout'));
    });
    request.write(requestBody);
    request.end();
  });

const buildSfExpressResponse = (response) => ({
  requestId: response.requestID,
  timestamp: response.timestamp,
  payload: response.payload,
  businessPayload: response.businessPayload,
});

const invokeSfExpressService = async ({
  config,
  serviceCode = DEFAULT_SERVICE_CODE,
  msgData,
  timeoutMs,
}) => {
  const partnerId = trimText(config.partnerId);
  const checkWord = trimText(config.checkWord);
  const endpointUrl = trimText(config.endpointUrl);

  if (!partnerId || !checkWord || !endpointUrl) {
    throw new Error('sf express config is incomplete');
  }

  const response = await sendSfExpressRequest({
    partnerId,
    checkWord,
    endpointUrl,
    serviceCode: trimText(serviceCode) || DEFAULT_SERVICE_CODE,
    signMode: normalizeSignMode(config.signMode),
    msgData,
    timeoutMs: Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : (Number.isFinite(Number(config.timeoutMs)) && Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 15000),
  });

  return buildSfExpressResponse(response);
};

const normalizePickupContact = (contact = {}, fallbackCompany = '') => ({
  contact: trimText(contact.recipientName || contact.contact),
  mobile: trimText(contact.recipientPhone || contact.mobile),
  company: trimText(contact.company || fallbackCompany),
  province: trimText(contact.province),
  city: trimText(contact.city),
  county: trimText(contact.district || contact.county),
  address: trimText(contact.addressDetail || contact.address),
});

const buildCargoDetails = (items = [], defaultWeightKg = 1) => {
  const weight = Number(defaultWeightKg) > 0 ? Number(defaultWeightKg) : 1;

  return items.map((item) => ({
    name: trimText(item.title).slice(0, 60) || '回收商品',
    count: 1,
    unit: '件',
    weight,
    amount: Math.max(0, Number(item.estimateFinalPrice || 0)),
  }));
};

const getMainWaybillNo = (waybillNoInfoList = []) => {
  const mainWaybill = Array.isArray(waybillNoInfoList)
    ? waybillNoInfoList.find((item) => Number(item.waybillType || 0) === 1) || waybillNoInfoList[0]
    : null;

  return trimText(mainWaybill && mainWaybill.waybillNo);
};

const normalizeCloudPrintFileType = (value) => {
  const fileType = trimText(value).toLowerCase();
  return ['pdf', 'png', 'zpl'].includes(fileType) ? fileType : 'pdf';
};

const normalizeCloudPrintDocument = (document, index) => {
  const source = document && typeof document === 'object' && !Array.isArray(document) ? document : {};
  const masterWaybillNo = trimText(source.masterWaybillNo || source.waybillNo);

  if (!masterWaybillNo) {
    throw new Error(`documents[${index}].masterWaybillNo is required`);
  }

  return { ...source, masterWaybillNo };
};

const extractCloudPrintFilesFromResult = (value) => {
  const candidates = [
    value,
    value && typeof value === 'object' ? value.obj : null,
    value && typeof value === 'object' ? value.data : null,
    value && typeof value === 'object' ? value.msgData : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const files = Array.isArray(candidate)
      ? candidate
      : (Array.isArray(candidate.files) ? candidate.files : candidate.fileList);

    if (!Array.isArray(files)) {
      continue;
    }

    return files
      .map((item) => ({
        waybillNo: trimText(item && (item.waybillNo || item.masterWaybillNo)),
        url: trimText(item && (item.url || item.fileUrl || item.downloadUrl)),
        fileName: trimText(item && (item.fileName || item.name)),
        fileType: trimText(item && (item.fileType || item.type)),
        contentType: trimText(item && item.contentType),
        base64Content: trimText(item && (item.base64Content || item.fileContent || item.content)),
      }))
      .filter((item) => item.url || item.base64Content || item.fileName || item.waybillNo);
  }

  return [];
};

const checkSfPickupTime = async ({ config, customerAddress, sendTime }) => {
  const sender = normalizePickupContact(customerAddress);
  const normalizedSendTime = trimText(sendTime);

  if (!sender.province || !sender.city || !sender.county || !sender.address) {
    throw new Error('pickup address is incomplete for sf express');
  }

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalizedSendTime)) {
    throw new Error('sf pickup appointment time format is invalid');
  }

  const response = await invokeSfExpressService({
    config,
    serviceCode: PICKUP_TIME_SERVICE_CODE,
    msgData: {
      address: sender.address,
      addressType: '1',
      sendTime: normalizedSendTime,
      version: 'V1.1',
      province: sender.province,
      city: sender.city,
      county: sender.county,
    },
  });
  const businessPayload = response.businessPayload || {};
  const responseMsgData = parseBusinessPayload(businessPayload.msgData);

  return {
    requestId: response.requestId,
    apiResponseId: trimText(response.payload && response.payload.apiResponseID),
    status: responseMsgData.status === true || String(responseMsgData.status).toLowerCase() === 'true',
    startTm: trimText(responseMsgData.startTm),
    endTm: trimText(responseMsgData.endTm),
    exceptionReason: trimText(responseMsgData.exceptionReason || businessPayload.errorMsg),
  };
};

const createSfPickupOrder = async ({
  config,
  customerAddress,
  recycleItems,
  pickupTimeMode,
  pickupTimeText,
  pickupStartTime,
}) => {
  const sender = normalizePickupContact(customerAddress);
  const receiver = normalizePickupContact(config.senderAddress, config.senderAddress && config.senderAddress.company);
  const normalizedPickupTimeMode = trimText(pickupTimeMode).toLowerCase();
  const normalizedPickupStartTime = trimText(pickupStartTime);

  if (!sender.contact || !sender.mobile || !sender.province || !sender.city || !sender.county || !sender.address) {
    throw new Error('pickup address is incomplete for sf express');
  }

  if (!receiver.contact || !receiver.mobile || !receiver.province || !receiver.city || !receiver.county || !receiver.address) {
    throw new Error('sf receiver address is incomplete');
  }

  if (normalizedPickupTimeMode === 'schedule'
    && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalizedPickupStartTime)) {
    throw new Error('sf pickup appointment time is required');
  }

  const cargoDetails = buildCargoDetails(recycleItems, config.defaultWeightKg);
  const orderId = `XMREC${Date.now()}${crypto.randomBytes(2).toString('hex')}`.slice(0, 32);
  const response = await invokeSfExpressService({
    config,
    serviceCode: trimText(config.serviceCode) || DEFAULT_SERVICE_CODE,
    msgData: {
      orderId,
      language: 'zh-CN',
      expressTypeId: 1,
      payMethod: 1,
      isOneselfPickup: 0,
      isDocall: 1,
      ...(normalizedPickupTimeMode === 'schedule' ? { sendStartTm: normalizedPickupStartTime } : {}),
      parcelQty: 1,
      totalWeight: Number((cargoDetails.length * (Number(config.defaultWeightKg) || 1)).toFixed(2)),
      cargoDetails,
      contactInfoList: [
        { contactType: 1, ...sender },
        { contactType: 2, ...receiver },
      ],
      remark: trimText(`小程序回收上门取件；预约时间：${pickupTimeText || ''}`).slice(0, 200),
      extraInfoList: [],
    },
  });
  const responseMsgData = parseBusinessPayload(response.businessPayload && response.businessPayload.msgData);
  const waybillNoInfoList = Array.isArray(responseMsgData.waybillNoInfoList)
    ? responseMsgData.waybillNoInfoList
    : [];

  return {
    requestId: response.requestId,
    apiResponseId: trimText(response.payload && response.payload.apiResponseID),
    orderId: trimText(responseMsgData.orderId || orderId),
    courierCode: 'sf',
    pickupTimeText: trimText(pickupTimeText),
    isSandbox: Boolean(config.useSandbox),
    waybillNo: getMainWaybillNo(waybillNoInfoList),
    waybillNoInfoList: waybillNoInfoList.map((item) => ({
      waybillNo: trimText(item.waybillNo),
      waybillType: Number(item.waybillType || 0),
    })),
    rawResult: response.payload || {},
  };
};

const createSfCloudPrintWaybills = async ({
  config,
  templateCode,
  fileType = 'pdf',
  sync = true,
  version = '2.0',
  documents = [],
}) => {
  const normalizedTemplateCode = trimText(templateCode);
  if (!normalizedTemplateCode) {
    throw new Error('templateCode is required for sf cloud print');
  }

  if (!Array.isArray(documents) || !documents.length) {
    throw new Error('documents is required for sf cloud print');
  }

  const normalizedDocuments = documents.map(normalizeCloudPrintDocument);
  const normalizedVersion = trimText(version) || '2.0';
  const normalizedFileType = normalizeCloudPrintFileType(fileType);
  const response = await invokeSfExpressService({
    config,
    serviceCode: CLOUD_PRINT_WAYBILLS_SERVICE_CODE,
    msgData: {
      templateCode: normalizedTemplateCode,
      version: normalizedVersion,
      fileType: normalizedFileType,
      sync: sync !== false,
      documents: normalizedDocuments,
    },
  });
  const msgData = parseBusinessPayload(response.businessPayload && response.businessPayload.msgData);
  const result = msgData && Object.keys(msgData).length ? msgData : (response.businessPayload || {});

  return {
    requestId: response.requestId,
    timestamp: response.timestamp,
    templateCode: normalizedTemplateCode,
    version: normalizedVersion,
    fileType: normalizedFileType,
    sync: sync !== false,
    documents: normalizedDocuments,
    files: extractCloudPrintFilesFromResult(result),
    payload: response.payload || {},
    businessPayload: response.businessPayload || {},
    result,
  };
};

module.exports = {
  CLOUD_PRINT_WAYBILLS_SERVICE_CODE,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_SANDBOX_URL,
  DEFAULT_SERVICE_CODE,
  PICKUP_TIME_SERVICE_CODE,
  SUPPORTED_TEST_SERVICE_CODES,
  checkSfPickupTime,
  createSfCloudPrintWaybills,
  createSfPickupOrder,
  invokeSfExpressService,
  normalizeSignMode,
};
