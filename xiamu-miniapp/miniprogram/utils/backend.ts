// 用途：封装小程序与业务后端的请求，包括法律文档读取。
import { getBackendBaseUrl as resolveBackendBaseUrl, getBackendUnavailableReason, isBackendEnabled, resolveBackendAssetUrl } from './backend-config'

const AUTH_TOKEN_STORAGE_KEY = 'backend-auth-token'
const AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY = 'backend-auth-token-expires-at'
const AUTH_LAST_LOGIN_AT_STORAGE_KEY = 'backend-auth-last-login-at'
const LOCAL_USER_PROFILE_STORAGE_KEY = 'mine-local-user-profile'
const LOGIN_VALIDITY_DURATION_MS = 30 * 24 * 60 * 60 * 1000
type BackendRequestError = Error & { code?: string; statusCode?: number }

export interface BackendUserProfile {
  success?: boolean
  token?: string
  expiresAt?: number
  isNewUser?: boolean
  username?: string
  memberNo?: string
  uid?: string
  nickname?: string
  avatarUrl?: string
  phone?: string
  payoutAccount?: string
  realName?: string
  registeredAt?: number
  registeredAtRealtime?: string
  lastLoginAt?: number
  lastLoginAtRealtime?: string
  code?: string
  message?: string
}

export interface BackendLegalDocument {
  type: 'privacy-policy' | 'user-agreement'
  title: string
  content: string
}

export interface BackendPurchaseOrder {
  id: number
  productId: number
  productSnapshotNo?: string
  productSnapshotTitle?: string
  productSnapshotSubtitle?: string
  productSnapshotCoverImage?: string
  addressId?: number
  orderNo?: string
  sourceMode: 'buy' | 'cart'
  recipientName: string
  recipientPhone: string
  addressDetail: string
  paymentMethod: string
  remark: string
  totalAmount: number
  status: string
  outTradeNo?: string
  paymentBatchId?: number | null
  paymentBatchSize?: number
  determineBatches?: boolean
  paidAt?: number
  paidAtRealtime?: string
  paymentTransactionId?: string
  wechatOrderSyncStatus?: string
  wechatOrderSyncError?: string
  wechatOrderSyncedAt?: number
  shipData?: {
    expressCompany?: string
    expressNo?: string
    expressTime?: string
  } | null
  createdAt: number
  createdAtRealtime?: string
  updatedAt: number
  updatedAtRealtime?: string
}

export interface WechatReceiptConfirmationInfo {
  merchantId: string
  merchantTradeNo: string
  transactionId: string
}

const isCompletedPurchaseOrderStatus = (status?: string): boolean => {
  const normalized = String(status || '').trim()
  return normalized === 'paid' || normalized === 'received'
}

export interface BackendPaymentBatch {
  id: number
  batchNo: string
  outTradeNo: string
  orderIds: number[]
  totalAmount: number
  status: string
  transactionId?: string
  paidAt?: number
  paidAtRealtime?: string
  createdAt: number
  createdAtRealtime?: string
  updatedAt: number
  updatedAtRealtime?: string
}

export interface BackendRecycleProductSnapshot {
  snapshotVersion?: number
  productId?: number
  productNo?: string
  categoryKey?: string
  modelKey?: string
  platform?: string
  coverText?: string
  coverTitle?: string
  title?: string
  subtitle?: string
  price?: number
  originPrice?: number
  recyclePrice?: number
  tagText?: string
  coverImage?: string
  heroImage?: string
  detailImages?: string[]
  recyclable?: boolean
  premiumCondition?: boolean
  certifiedPrice?: boolean
  releaseOrder?: number
  heroTheme?: string
  heroAccent?: string
  editionLabel?: string
  featureTags?: string[]
  shoppingTextA?: string
  shoppingTextB?: string
  shoppingTextC?: string
  description?: string
  capturedAt?: number
}

export interface BackendRecycleOrder {
  id: number
  recycleProductId?: number | null
  orderNo?: string
  categoryKey?: string
  title: string
  coverLabel: string
  coverImage?: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  payoutMethodLabel: string
  accountNumber: string
  realName: string
  optionSummary: string
  selectedDeviceOptionValues: Record<string, string>
  selectedDeviceOptionTexts: Record<string, string>
  submissionImages?: string[]
  estimateSupported: boolean
  estimateBasePrice: number
  estimateFinalPrice: number
  note: string
  status: string
  statusLabel?: string
  userStatus?: 'confirmed' | 'cancelled' | string
  userResponseStatus?: 'accepted_quote' | 'take_back_requested' | string
  returnAddress?: BackendRecycleReturnAddress | null
  reviewNote?: string
  productSnapshot?: BackendRecycleProductSnapshot | null
  publishedProductId?: number | null
  reviewedAt?: number
  reviewedAtRealtime?: string
  publishedAt?: number
  publishedAtRealtime?: string
  createdAt: number
  createdAtRealtime?: string
  updatedAt: number
  updatedAtRealtime?: string
  settlement?: BackendRecycleSettlement | null
}

export interface BackendRecycleReturnAddress {
  addressId: number
  recipientName: string
  recipientPhone: string
  province: string
  city: string
  district: string
  addressDetail: string
}

interface BackendRecycleReviewResponse {
  order?: BackendRecycleOrder | null
}

export interface BackendRecycleSettlement {
  id: number
  recycleOrderId: number
  orderNo?: string
  outBillNo?: string
  transferBillNo?: string
  appId?: string
  mchId?: string
  amount: number
  state: string
  stateDesc?: string
  transferRemark?: string
  packageInfo?: string
  userName?: string
  userRecvPerception?: string
  failReason?: string
  wechatCreateTime?: string
  acceptTime?: number
  successTime?: number
  cancelTime?: number
  paymentProofImages?: string[]
  adminId?: number | null
  createdAt: number
  updatedAt: number
}

export interface BackendRecycleQuoteBreakdownItem {
  label: string
  amount: number
}

export interface BackendRecycleOptionItem {
  id: number
  value: string
  label: string
  effectType: string
  priceDelta: number
  noteText: string
  imageUrls?: string[]
  sortOrder: number
}

export interface BackendRecycleOptionGroup {
  id: number
  key: string
  label: string
  required: boolean
  sortOrder: number
  options: BackendRecycleOptionItem[]
}

export interface BackendRecycleProduct {
  id: number
  productId: number
  categoryKey: string
  optionProfileKey: string
  title: string
  subtitle: string
  coverLabel: string
  coverImage?: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  maxRecyclePrice: number
  hintText: string
  quoteMode: 'rule_based' | 'manual' | string
  optionGroups?: BackendRecycleOptionGroup[]
  createdAt?: number
  createdAtRealtime?: string
  updatedAt?: number
  updatedAtRealtime?: string
}

export type BackendRecyclePayFieldKey = 'accountNumber' | 'realName' | 'orderRemark'

export interface BackendRecyclePayField {
  key: BackendRecyclePayFieldKey
  label: string
  placeholder: string
  visible: boolean
  required: boolean
}

export interface BackendRecyclePayMethod {
  id: number
  methodKey: 'alipay' | 'wechat'
  name: string
  default: boolean
  visible: boolean
  fields: BackendRecyclePayField[]
  sortOrder: number
  updatedAt?: number
}

export interface BackendRecycleNoticeSetting {
  visible: boolean
  content: string
  lines: string[]
  updatedAt?: number
}

export interface BackendRecycleSettings {
  payMethods: BackendRecyclePayMethod[]
  notice: BackendRecycleNoticeSetting
}

export interface BackendRecycleQuote {
  supported: boolean
  baseLabel: string
  basePrice: number
  maxRecyclePrice: number
  accessoryDeduction: number
  issueDeduction: number
  finalPrice: number
  note: string
  accessoryItems: BackendRecycleQuoteBreakdownItem[]
  issueItems: BackendRecycleQuoteBreakdownItem[]
  selectedDeviceOptionTexts: Record<string, string>
  optionSummary: string
}

export interface BackendCategoryConfig {
  id: number
  key: string
  name: string
  scene: 'sale' | 'recycle'
  sectionKey?: string
  sectionName?: string
  theme: 'red' | 'blue' | 'gray' | 'green'
  order: number
}

export interface BackendCategorySection {
  id: number
  key: string
  name: string
  targetScene: 'sale' | 'recycle'
  order: number
  fixed: boolean
  categories: BackendCategoryConfig[]
}

export interface BackendPublicProduct {
  id: number
  productNo: string
  categoryKey: string
  modelKey: string
  platform: string
  title: string
  subtitle: string
  price: number
  originPrice: number
  recyclePrice: number
  displayPrice: number
  recyclable: boolean
  recycleMode?: 'direct' | 'category' | 'none' | string
  recycleTargetCategoryKey?: string
  recycleTargetCategoryName?: string
  recycleTargetRecycleProductId?: number | null
  recycleTargetRecycleProductTitle?: string
  inStock: boolean
  stock: number
  coverText: string
  coverTitle: string
  coverImage: string
  webCoverImage: string
  heroImage?: string
  detailImages?: string[]
  premiumCondition?: boolean
  certifiedPrice?: boolean
  releaseOrder?: number
  tagText: string
  heroTheme: 'nintendo' | 'sony' | 'steam' | 'asus' | 'others'
  heroAccent: string
  editionLabel: string
  featureTags: string[]
  shoppingTextA: string
  shoppingTextB: string
  shoppingTextC: string
  description: string
  status: number
  updatedAt: number
}

export interface BackendHomepageBanner {
  id: number
  tag?: string
  title?: string
  desc?: string
  accent?: string
  imageUrl?: string
  image_url?: string
  coverImages?: string[]
  cover_images?: string[]
  targetPageId?: number
  target_page_id?: number
  contentEnabled?: boolean | number
  content_enabled?: boolean | number
  pageId?: number
  page_id?: number
  pageTitle?: string
  page_title?: string
  coverImageUrl?: string
  cover_image_url?: string
  coverImage?: string
  cover_image?: string
  bodyText?: string
  body_text?: string
  contentHtml?: string
  content_html?: string
  sortOrder?: number
  sort_order?: number
  status?: number
  updatedAt?: number
  updated_at?: number
}

export interface BackendTutorialPage {
  pageNumber?: number
  page_number?: number
  coverImages?: string[]
  cover_images?: string[]
  contentHtml?: string
  content_html?: string
  tutorialPages?: BackendTutorialPage[]
  tutorial_pages?: BackendTutorialPage[]
  pageCount?: number
  page_count?: number
  bodyText?: string
  body_text?: string
}

export interface BackendHomepageSectionItem {
  id: string
  key?: 'recycling' | 'buying'
  title: string
  coverImage: string
  target: 'recycling' | 'buying'
  categorySectionKey?: string
}

export interface BackendHomepageSectionGroup {
  id: string
  title: string
  items: BackendHomepageSectionItem[]
}

export interface BackendHomepageSection {
  sections: BackendHomepageSectionGroup[]
  sectionTitle?: string
  items?: BackendHomepageSectionItem[]
}

export interface BackendNotice {
  id: number
  title: string
  content?: string
  images?: string[]
  image_urls?: string[]
  create_time?: string
  update_time?: string
}

export interface BackendContentPage {
  id: number
  title: string
  titleTag?: string
  title_tag?: string
  titleTagImageUrl?: string
  title_tag_image?: string
  showInHot?: number
  show_in_hot?: number
  tutorialCategoryId?: number
  tutorial_category_id?: number
  tutorialCategoryTitle?: string
  tutorial_category_title?: string
  tutorialTone?: string
  tutorial_tone?: string
  pageType?: string
  page_type?: string
  coverImageUrl?: string
  coverImage?: string
  cover_image?: string
  coverImages?: string[]
  cover_images?: string[]
  bodyText?: string
  contentHtml?: string
  content_html?: string
  tutorialPages?: BackendTutorialPage[]
  tutorial_pages?: BackendTutorialPage[]
  pageCount?: number
  page_count?: number
  endLinkCategoryKey?: string
  end_link_category_key?: string
  endLinkProductId?: number
  end_link_product_id?: number
  endLinkText?: string
  end_link_text?: string
  viewCount?: number
  view_count?: number
  likeCount?: number
  like_count?: number
  favoriteCount?: number
  favorite_count?: number
  shareCount?: number
  share_count?: number
  liked?: boolean
  favorited?: boolean
  tutorialCategories?: BackendContentPage[]
  tutorial_categories?: BackendContentPage[]
  tutorialArticles?: BackendContentPage[]
  tutorial_articles?: BackendContentPage[]
  status?: number
  updatedAt?: number
  updated_at?: number
}

export interface BackendAddress {
  id: number
  recipientName: string
  recipientPhone: string
  province: string
  city: string
  district: string
  addressDetail: string
  postalCode: string
  longitude?: number | null
  latitude?: number | null
  belongToUsername?: string
  belongToUid?: string
  isDefault: boolean
  createdAt: number
  createdAtRealtime?: string
  updatedAt: number
  updatedAtRealtime?: string
}

export interface CreatePurchaseOrderPayload {
  productId: number
  addressId?: number
  sourceMode: 'buy' | 'cart'
  recipientName: string
  recipientPhone: string
  addressDetail: string
  paymentMethod: string
  remark: string
  totalAmount: number
  status?: string
}

export interface BackendWechatPaymentParams {
  mode?: 'real' | 'mock'
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
  mockMessage?: string
}

export interface CreateRecycleOrderPayload {
  recycleProductId?: number
  categoryKey?: string
  title: string
  coverLabel: string
  coverImage?: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  payoutMethodLabel: string
  accountNumber: string
  realName: string
  optionSummary: string
  selectedDeviceOptionValues: Record<string, string>
  selectedDeviceOptionTexts: Record<string, string>
  submissionImages?: string[]
  estimateSupported: boolean
  estimateBasePrice: number
  estimateFinalPrice: number
  note: string
}

export interface CreateSfPickupRecycleOrderPayload {
  courierCode: 'sf'
  pickupTimeMode: 'now' | 'schedule'
  pickupTimeText: string
  pickupStartTime?: string
  customerAddress: {
    addressId?: number
    recipientName: string
    recipientPhone: string
    province?: string
    city?: string
    district?: string
    addressDetail: string
  }
  recycleItems: CreateRecycleOrderPayload[]
}

export interface BackendSfPickupTime {
  requestId: string
  apiResponseId?: string
  status: boolean
  startTm: string
  endTm: string
  exceptionReason?: string
}

export interface CreateSfCloudPrintWaybillsPayload {
  templateCode: string
  recycleOrderId?: number
  waybillNo?: string
  version?: string
  fileType?: 'pdf' | 'png' | 'zpl' | string
  sync?: boolean
  documents?: Array<Record<string, unknown>>
}

export interface BackendSfPickupWaybillInfo {
  waybillNo: string
  waybillType: number
}

export interface BackendSfPickupOrder {
  requestId: string
  apiResponseId?: string
  orderId: string
  courierCode: string
  pickupTimeText: string
  isSandbox: boolean
  waybillNo: string
  waybillNoInfoList?: BackendSfPickupWaybillInfo[]
  rawResult?: Record<string, unknown>
}

export interface BackendSfPickupSearchResult {
  orderId: string
  waybillNo: string
  waybillNoInfoList?: BackendSfPickupWaybillInfo[]
  canceled?: boolean
  businessPayload?: Record<string, unknown>
}

export interface BackendSfExpressTestResult {
  serviceCode: string
  requestId: string
  timestamp: string
  payload?: Record<string, unknown>
  businessPayload?: Record<string, unknown>
}

export interface BackendSfCloudPrintFile {
  waybillNo: string
  url: string
  fileName?: string
  fileType?: string
  contentType?: string
  base64Content?: string
}

export interface BackendSfCloudPrintResult {
  requestId: string
  timestamp: string
  templateCode: string
  version: string
  fileType: string
  sync: boolean
  documents?: Array<Record<string, unknown>>
  files?: BackendSfCloudPrintFile[]
  payload?: Record<string, unknown>
  businessPayload?: Record<string, unknown>
  result?: Record<string, unknown>
}

export interface BackendSfExpressStatus {
  configured: boolean
  issues?: string[]
  useSandbox: boolean
  endpointUrl?: string
  callbackUrl?: string
  callbackAliases?: string[]
  serviceCode?: string
  signMode?: string
  timeoutMs?: number
  partnerIdMasked?: string
  senderAddressConfigured?: boolean
}

export interface BackendSfExpressSenderAddress {
  recipientName: string
  recipientPhone: string
  company?: string
  province?: string
  city?: string
  district?: string
  addressDetail: string
  displayAddress?: string
}

interface BackendListResponse<T> {
  success?: boolean
  orders?: T[]
  message?: string
  code?: string
}

interface BackendOrderResponse<T> {
  success?: boolean
  order?: T
  message?: string
  code?: string
}

interface BackendRecycleSettlementResponse {
  success?: boolean
  settlement?: BackendRecycleSettlement | null
  message?: string
  code?: string
}

interface BackendSfPickupOrderResponse {
  success?: boolean
  pickupOrder?: BackendSfPickupOrder | null
  orders?: BackendRecycleOrder[]
  message?: string
  code?: string
}

interface BackendSfPickupTimeResponse {
  success?: boolean
  pickupTime?: BackendSfPickupTime | null
  message?: string
  code?: string
}

interface BackendSfExpressTestResponse {
  success?: boolean
  serviceCode?: string
  requestId?: string
  timestamp?: string
  payload?: Record<string, unknown>
  businessPayload?: Record<string, unknown>
  message?: string
  code?: string
}

interface BackendSfPickupSearchResponse {
  success?: boolean
  pickupOrder?: BackendSfPickupSearchResult | null
  order?: BackendRecycleOrder | null
  message?: string
  code?: string
}

interface BackendSfPickupCancelResponse {
  success?: boolean
  pickupOrder?: BackendSfPickupSearchResult | null
  order?: BackendRecycleOrder | null
  message?: string
  code?: string
}

interface BackendSfCloudPrintResponse {
  success?: boolean
  printResult?: BackendSfCloudPrintResult | null
  order?: BackendRecycleOrder | null
  serviceCode?: string
  message?: string
  code?: string
}

interface BackendSfExpressStatusResponse {
  success?: boolean
  status?: BackendSfExpressStatus | null
  message?: string
  code?: string
}

interface BackendPaymentResponse {
  success?: boolean
  payment?: BackendWechatPaymentParams
  order?: BackendPurchaseOrder
  batch?: BackendPaymentBatch
  message?: string
  code?: string
}

interface BackendSimpleResponse {
  success?: boolean
  message?: string
  code?: string
}

interface BackendCategoryListResponse {
  success?: boolean
  categories?: BackendCategoryConfig[]
  message?: string
  code?: string
}

interface BackendCategorySectionListResponse {
  success?: boolean
  sections?: BackendCategorySection[]
  message?: string
  code?: string
}

interface BackendPublicProductListResponse {
  success?: boolean
  products?: BackendPublicProduct[]
  message?: string
  code?: string
}

interface BackendHomepageBannerListResponse {
  success?: boolean
  banners?: BackendHomepageBanner[]
  message?: string
  code?: string
}

interface BackendHomepageSectionResponse {
  success?: boolean
  section?: BackendHomepageSection
  message?: string
  code?: string
}

interface BackendNoticeListResponse {
  success?: boolean
  notices?: BackendNotice[]
  message?: string
  code?: string
}

interface BackendNoticeResponse {
  success?: boolean
  notice?: BackendNotice | null
  message?: string
  code?: string
}

interface BackendContentPageResponse {
  success?: boolean
  page?: BackendContentPage | null
  tutorialCategories?: BackendContentPage[]
  tutorial_categories?: BackendContentPage[]
  tutorialArticles?: BackendContentPage[]
  tutorial_articles?: BackendContentPage[]
  interactions?: BackendTutorialInteractionStats | null
  message?: string
  code?: string
}

export interface BackendTutorialInteractionStats {
  pageId: number
  viewCount: number
  likeCount: number
  favoriteCount: number
  shareCount: number
  liked: boolean
  favorited: boolean
}

interface BackendTutorialCategoryListResponse {
  success?: boolean
  categories?: BackendContentPage[]
  message?: string
  code?: string
}

interface BackendTutorialArticleListResponse {
  success?: boolean
  articles?: BackendContentPage[]
  message?: string
  code?: string
}

interface BackendRecycleProductListResponse {
  success?: boolean
  products?: BackendRecycleProduct[]
  message?: string
  code?: string
}

interface BackendRecycleProductResponse {
  success?: boolean
  product?: BackendRecycleProduct | null
  message?: string
  code?: string
}

interface BackendRecycleSettingsResponse {
  success?: boolean
  payMethods?: BackendRecyclePayMethod[]
  notice?: BackendRecycleNoticeSetting
  message?: string
  code?: string
}

interface BackendRecycleQuoteResponse {
  success?: boolean
  product?: BackendRecycleProduct | null
  quote?: BackendRecycleQuote | null
  message?: string
  code?: string
}

interface BackendAddressListResponse {
  success?: boolean
  addresses?: BackendAddress[]
  message?: string
  code?: string
}

interface BackendAddressResponse {
  success?: boolean
  address?: BackendAddress | null
  message?: string
  code?: string
}

interface BackendUploadResponse {
  success?: boolean
  imageUrl?: string
  imagePath?: string
  message?: string
  code?: string
}

interface RequestOptions {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  requiresAuth?: boolean
  useOptionalAuth?: boolean
  headers?: Record<string, string>
  cacheKey?: string
  cacheTtlMs?: number
}

interface CachedResponseEntry {
  expiresAt: number
  value: unknown
}

const publicRequestCache = new Map<string, CachedResponseEntry>()
const publicRequestInflight = new Map<string, Promise<unknown>>()
const generalGetRequestInflight = new Map<string, Promise<unknown>>()
const DEFAULT_PUBLIC_CACHE_TTL_MS = 10 * 1000
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000
const DEFAULT_UPLOAD_TIMEOUT_MS = 15 * 1000

const isTemporaryLocalImagePath = (filePath: string): boolean => {
  const normalizedFilePath = String(filePath || '').trim()
  return /^(wxfile:\/\/|temp:\/|http:\/\/tmp\/|https:\/\/tmp\/|tmp\/)/i.test(normalizedFilePath)
}

const prepareUploadImageFilePath = (filePath: string): Promise<string> => {
  const normalizedFilePath = String(filePath || '').trim()

  if (!normalizedFilePath || !isTemporaryLocalImagePath(normalizedFilePath)) {
    return Promise.resolve(normalizedFilePath)
  }

  const compressFile = (): Promise<string> => {
    if (typeof wx.compressImage !== 'function') {
      return Promise.resolve(normalizedFilePath)
    }

    return new Promise((resolve) => {
      wx.compressImage({
        src: normalizedFilePath,
        quality: 80,
        success: (res) => {
          resolve(String(res.tempFilePath || normalizedFilePath).trim() || normalizedFilePath)
        },
        fail: () => {
          resolve(normalizedFilePath)
        },
      })
    })
  }

  return compressFile().then((compressedFilePath) => new Promise((resolve) => {
    wx.getFileSystemManager().saveFile({
      tempFilePath: compressedFilePath,
      success: (res) => {
        resolve(String(res.savedFilePath || compressedFilePath).trim() || compressedFilePath)
      },
      fail: () => {
        // Some platforms already return a persistent local path; upload it directly in that case.
        resolve(compressedFilePath)
      },
    })
  }))
}

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }

  const text = String(value || '').trim()
  if (!text) {
    return []
  }

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      }
    } catch (_error) {
      // Fall through to the comma-separated fallback.
    }
  }

  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  }

const htmlToPlainText = (value: string): string => {
  const html = String(value || '').trim()
  if (!html) {
    return ''
  }

  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

const normalizeHomepageBanner = (banner: BackendHomepageBanner): BackendHomepageBanner => {
  const coverImages = normalizeStringArray(
    banner.coverImages
    ?? banner.cover_images
    ?? banner.coverImageUrl
    ?? banner.cover_image_url
    ?? banner.coverImage
    ?? banner.cover_image,
  )
  const coverImageUrl = String(
    banner.coverImageUrl
    || banner.cover_image_url
    || coverImages[0]
    || banner.coverImage
    || banner.cover_image
    || '',
  ).trim()
  const imageUrl = String(
    banner.imageUrl
    || banner.image_url
    || coverImageUrl
    || coverImages[0]
    || banner.coverImage
    || banner.cover_image
    || '',
  ).trim()
  const targetPageId = Number(
    banner.targetPageId
    || banner.target_page_id
    || banner.pageId
    || banner.page_id
    || 0,
  )
  const contentEnabled = banner.contentEnabled === undefined && banner.content_enabled === undefined
    ? true
    : Number(banner.contentEnabled ?? banner.content_enabled) === 1
  const contentHtml = String(banner.contentHtml || banner.content_html || '')
  const bodyText = String(banner.bodyText || banner.body_text || htmlToPlainText(contentHtml) || '')

  return {
    ...banner,
    coverImageUrl,
    cover_image_url: coverImageUrl,
    imageUrl,
    image_url: imageUrl,
    coverImages,
    cover_images: coverImages,
    bodyText,
    body_text: bodyText,
    contentHtml,
    content_html: contentHtml,
    targetPageId,
    target_page_id: targetPageId,
    contentEnabled,
    content_enabled: contentEnabled ? 1 : 0,
    pageId: targetPageId,
    page_id: targetPageId,
  }
}

const normalizeNotice = (notice: BackendNotice): BackendNotice => {
  const images = normalizeStringArray(notice.images || notice.image_urls)
    .map((imageUrl) => resolveBackendAssetUrl(imageUrl) || imageUrl)
    .filter(Boolean)

  return {
    ...notice,
    images,
    image_urls: images,
  }
}

const normalizeContentPage = (page: BackendContentPage): BackendContentPage => {
  const coverImages = normalizeStringArray(
    page.coverImages
    ?? page.cover_images
    ?? page.coverImageUrl
    ?? page.coverImage
    ?? page.cover_image,
  )
  const coverImageUrl = String(
    page.coverImageUrl
    || coverImages[0]
    || page.coverImage
    || page.cover_image
    || '',
  ).trim()
  const contentHtml = String(page.contentHtml || page.content_html || '')
  const tutorialPagesSource = page.tutorialPages || page.tutorial_pages
  const tutorialPages = Array.isArray(tutorialPagesSource)
    ? tutorialPagesSource.map((item) => ({
      ...item,
      pageNumber: Number(item.pageNumber || item.page_number || 0),
      contentHtml: String(item.contentHtml || item.content_html || ''),
      content_html: String(item.contentHtml || item.content_html || ''),
      coverImages: normalizeStringArray(item.coverImages || item.cover_images),
      cover_images: normalizeStringArray(item.coverImages || item.cover_images),
    }))
    : []
  const bodyText = String(page.bodyText || htmlToPlainText(contentHtml) || '')
  const titleTagImageUrl = String(
    page.titleTagImageUrl
    || page.title_tag_image
    || '',
  ).trim()
  const tutorialCategoriesSource = page.tutorialCategories || page.tutorial_categories
  const tutorialCategories = Array.isArray(tutorialCategoriesSource)
    ? tutorialCategoriesSource.map((item) => normalizeContentPage(item))
    : undefined
  const tutorialArticlesSource = page.tutorialArticles || page.tutorial_articles
  const tutorialArticles = Array.isArray(tutorialArticlesSource)
    ? tutorialArticlesSource.map((item) => normalizeContentPage(item))
    : undefined
  const resolvedCoverImageUrl = resolveBackendAssetUrl(coverImageUrl) || coverImageUrl
  const resolvedTitleTagImageUrl = resolveBackendAssetUrl(titleTagImageUrl) || titleTagImageUrl

  return {
    ...page,
    coverImageUrl: resolvedCoverImageUrl,
    coverImage: resolvedCoverImageUrl,
    cover_image: resolvedCoverImageUrl,
    titleTagImageUrl: resolvedTitleTagImageUrl,
    title_tag_image: resolvedTitleTagImageUrl,
    coverImages,
    cover_images: coverImages,
    bodyText,
    contentHtml,
    content_html: contentHtml,
    tutorialPages,
    tutorial_pages: tutorialPages,
    pageCount: tutorialPages.length || Number(page.pageCount || page.page_count || 1),
    page_count: tutorialPages.length || Number(page.pageCount || page.page_count || 1),
    endLinkProductId: Number(page.endLinkProductId ?? page.end_link_product_id ?? 0),
    end_link_product_id: Number(page.endLinkProductId ?? page.end_link_product_id ?? 0),
    endLinkCategoryKey: String(page.endLinkCategoryKey || page.end_link_category_key || '').trim(),
    end_link_category_key: String(page.endLinkCategoryKey || page.end_link_category_key || '').trim(),
    endLinkText: String(page.endLinkText || page.end_link_text || '立即下单').trim() || '立即下单',
    end_link_text: String(page.endLinkText || page.end_link_text || '立即下单').trim() || '立即下单',
    tutorialCategories,
    tutorial_categories: tutorialCategories,
    tutorialArticles,
    tutorial_articles: tutorialArticles,
  }
}

const normalizeRecycleOptionItem = (option: BackendRecycleOptionItem): BackendRecycleOptionItem => {
  const imageUrls = normalizeStringArray(option.imageUrls || (option as BackendRecycleOptionItem & { image_urls?: string[] }).image_urls)
    .map((imageUrl) => resolveBackendAssetUrl(imageUrl) || imageUrl)
    .filter(Boolean)

  return {
    ...option,
    imageUrls,
  }
}

const normalizeRecycleOptionGroup = (group: BackendRecycleOptionGroup): BackendRecycleOptionGroup => {
  return {
    ...group,
    options: Array.isArray(group.options) ? group.options.map(normalizeRecycleOptionItem) : [],
  }
}

const normalizeRecycleProduct = (product: BackendRecycleProduct): BackendRecycleProduct => {
  const coverImage = resolveBackendAssetUrl(product.coverImage || '') || product.coverImage || ''
  const optionGroups = Array.isArray(product.optionGroups)
    ? product.optionGroups.map(normalizeRecycleOptionGroup)
    : undefined

  return {
    ...product,
    coverImage,
    optionGroups,
  }
}

type MiniProgramRequestFailure = {
  errMsg?: string
}

const isWechatDomainOrTlsError = (message: string): boolean => {
  const normalizedMessage = String(message || '').toLowerCase()
  return normalizedMessage.includes('url not in domain list')
    || normalizedMessage.includes('ssl hand shake error')
    || normalizedMessage.includes('certificate')
    || normalizedMessage.includes('tls')
    || normalizedMessage.includes('unable to verify the first certificate')
    || normalizedMessage.includes('self signed certificate')
}

const buildBackendRequestHelpMessage = (rawMessage: string, path: string): string => {
  if (isWechatDomainOrTlsError(rawMessage)) {
    return `请求后端失败：请检查真机调试域名、HTTPS 证书链和当前小程序后端地址配置（${path}）`
  }

  if (/fail\s*$/i.test(rawMessage) || /request:fail/i.test(rawMessage)) {
    return `请求后端失败：请检查真机网络、合法域名配置与后端服务状态（${path}）`
  }

  return rawMessage || `request failed: ${path}`
}

const normalizeBackendRequestError = (error: unknown, path: string): BackendRequestError => {
  if (error instanceof Error) {
    const requestError = error as BackendRequestError

    if (/timeout/i.test(String(requestError.message || ''))) {
      requestError.code = requestError.code || 'TIMEOUT'
      requestError.message = `request timeout: ${path}`
    } else if (requestError.message) {
      requestError.message = buildBackendRequestHelpMessage(requestError.message, path)
    }

    return requestError
  }

  const rawMessage = typeof error === 'object' && error
    ? String((error as MiniProgramRequestFailure).errMsg || '')
    : ''
  const requestError = new Error(buildBackendRequestHelpMessage(rawMessage, path)) as BackendRequestError

  if (/timeout/i.test(rawMessage)) {
    requestError.code = 'TIMEOUT'
    requestError.message = `request timeout: ${path}`
  }

  return requestError
}

const isNotFoundUploadError = (error: unknown): boolean => {
  const requestError = error as BackendRequestError
  const message = String(requestError && requestError.message ? requestError.message : '')

  return requestError.statusCode === 404 || /not found/i.test(message)
}

const getCachedPublicResponse = <T>(cacheKey?: string): T | null => {
  if (!cacheKey) {
    return null
  }

  const cachedEntry = publicRequestCache.get(cacheKey)
  if (!cachedEntry) {
    return null
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    publicRequestCache.delete(cacheKey)
    return null
  }

  return cachedEntry.value as T
}

const saveCachedPublicResponse = <T>(cacheKey: string, value: T, cacheTtlMs: number) => {
  publicRequestCache.set(cacheKey, {
    expiresAt: Date.now() + Math.max(1000, cacheTtlMs),
    value,
  })
}

export const clearPublicBackendCache = (cacheKey?: string) => {
  if (cacheKey) {
    publicRequestCache.delete(cacheKey)
    publicRequestInflight.delete(cacheKey)
    return
  }

  publicRequestCache.clear()
  publicRequestInflight.clear()
}

export const hasBackendConfigured = (): boolean => isBackendEnabled()

export const getBackendBaseUrl = (): string => resolveBackendBaseUrl()

export const getBackendDisabledReason = (): string => getBackendUnavailableReason()

const normalizeLoginTimestamp = (value: unknown): number => {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0
  }

  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
}

const getLastLoginAt = (): number => {
  const storedLastLoginAt = normalizeLoginTimestamp(wx.getStorageSync(AUTH_LAST_LOGIN_AT_STORAGE_KEY))
  if (storedLastLoginAt) {
    return storedLastLoginAt
  }

  const localProfile = wx.getStorageSync(LOCAL_USER_PROFILE_STORAGE_KEY) as { lastLoginAt?: number } | undefined
  const profileLastLoginAt = normalizeLoginTimestamp(localProfile?.lastLoginAt)
  if (profileLastLoginAt) {
    wx.setStorageSync(AUTH_LAST_LOGIN_AT_STORAGE_KEY, profileLastLoginAt)
  }

  return profileLastLoginAt
}

export const clearExpiredLoginSession = (): boolean => {
  const hasStoredLogin = Boolean(
    wx.getStorageSync(AUTH_TOKEN_STORAGE_KEY)
    || wx.getStorageSync(LOCAL_USER_PROFILE_STORAGE_KEY),
  )
  if (!hasStoredLogin) {
    return false
  }

  const lastLoginAt = getLastLoginAt()
  if (!lastLoginAt) {
    wx.setStorageSync(AUTH_LAST_LOGIN_AT_STORAGE_KEY, Date.now())
    return false
  }

  if (Date.now() - lastLoginAt < LOGIN_VALIDITY_DURATION_MS) {
    return false
  }

  clearBackendSession()
  return true
}

export const clearBackendSession = () => {
  wx.removeStorageSync(AUTH_TOKEN_STORAGE_KEY)
  wx.removeStorageSync(AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY)
  wx.removeStorageSync(AUTH_LAST_LOGIN_AT_STORAGE_KEY)
  wx.removeStorageSync(LOCAL_USER_PROFILE_STORAGE_KEY)
}

export const getBackendToken = (): string => {
  if (clearExpiredLoginSession()) {
    return ''
  }

  const token = String(wx.getStorageSync(AUTH_TOKEN_STORAGE_KEY) || '')
  const expiresAt = Number(wx.getStorageSync(AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY) || 0)

  if (expiresAt && Date.now() > expiresAt) {
    clearBackendSession()
    return ''
  }

  return token
}

const saveBackendSession = (token?: string, expiresAt?: number) => {
  if (!token) {
    return
  }

  wx.setStorageSync(AUTH_TOKEN_STORAGE_KEY, token)
  wx.setStorageSync(AUTH_LAST_LOGIN_AT_STORAGE_KEY, Date.now())

  if (expiresAt) {
    wx.setStorageSync(AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY, expiresAt)
  }
}

const requestBackend = <T>({
  path,
  method = 'GET',
  data,
  requiresAuth = false,
  useOptionalAuth = false,
  headers = {},
  cacheKey = '',
  cacheTtlMs = DEFAULT_PUBLIC_CACHE_TTL_MS,
}: RequestOptions): Promise<T> => {
  const isCacheablePublicGet = method === 'GET' && !requiresAuth && !useOptionalAuth && Boolean(cacheKey)
  const inflightToken = requiresAuth || useOptionalAuth ? getBackendToken() : ''
  const generalGetInflightKey = method === 'GET' && !isCacheablePublicGet && (!requiresAuth || Boolean(inflightToken))
    ? `${method}:${path}:${requiresAuth ? 'auth' : useOptionalAuth ? 'optional-auth' : 'public'}:${inflightToken}`
    : ''

  if (isCacheablePublicGet) {
    const cachedValue = getCachedPublicResponse<T>(cacheKey)
    if (cachedValue) {
      return Promise.resolve(cachedValue)
    }

    const inflightRequest = publicRequestInflight.get(cacheKey)
    if (inflightRequest) {
      return inflightRequest as Promise<T>
    }
  }

  if (generalGetInflightKey) {
    const inflightRequest = generalGetRequestInflight.get(generalGetInflightKey)
    if (inflightRequest) {
      return inflightRequest as Promise<T>
    }
  }

  const sendRequest = () => new Promise<T>((resolve, reject) => {
    if (!hasBackendConfigured()) {
      reject(new Error(getBackendDisabledReason()))
      return
    }

    const header: Record<string, string> = {
      'content-type': 'application/json',
      ...headers,
    }
    const token = getBackendToken()

    if (requiresAuth) {
      if (!token) {
        reject(new Error('missing backend token'))
        return
      }

      header.Authorization = `Bearer ${token}`
    } else if (useOptionalAuth && token) {
      header.Authorization = `Bearer ${token}`
    }

    const backendBaseUrl = resolveBackendBaseUrl()

    wx.request({
      url: `${backendBaseUrl}${path}`,
      method,
      data,
      header,
      timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      success: (response) => {
        const payload = (response.data || {}) as T & { success?: boolean; message?: string; code?: string }
        if (response.statusCode >= 400 || payload.success === false) {
          if (payload.code === 'UNAUTHORIZED') {
            clearBackendSession()
          }

          const error = new Error(payload.message || `request failed with status ${response.statusCode}`) as BackendRequestError
          error.code = payload.code
          error.statusCode = response.statusCode
          reject(error)
          return
        }

        resolve(payload)
      },
      fail: (error) => {
        reject(normalizeBackendRequestError(error, path))
      },
    })
  })

  const requestPromise = sendRequest().catch((error) => {
    const requestError = error as BackendRequestError
    if (method === 'GET' && requestError.code === 'TIMEOUT') {
      return sendRequest()
    }

    throw requestError
  })

  if (!isCacheablePublicGet || !cacheKey) {
    if (!generalGetInflightKey) {
      return requestPromise
    }

    const wrappedInflightPromise = requestPromise
      .then((payload) => {
        generalGetRequestInflight.delete(generalGetInflightKey)
        return payload
      })
      .catch((error) => {
        generalGetRequestInflight.delete(generalGetInflightKey)
        throw error
      })

    generalGetRequestInflight.set(generalGetInflightKey, wrappedInflightPromise as Promise<unknown>)
    return wrappedInflightPromise
  }

  const wrappedRequestPromise = requestPromise
    .then((payload) => {
      saveCachedPublicResponse(cacheKey, payload, cacheTtlMs)
      publicRequestInflight.delete(cacheKey)
      return payload
    })
    .catch((error) => {
      publicRequestInflight.delete(cacheKey)
      throw error
    })

  publicRequestInflight.set(cacheKey, wrappedRequestPromise as Promise<unknown>)
  return wrappedRequestPromise
}

export const uploadRecycleSubmissionImage = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!hasBackendConfigured()) {
      reject(new Error(getBackendDisabledReason()))
      return
    }

    const token = getBackendToken()
    if (!token) {
      reject(new Error('missing backend token'))
      return
    }

    const backendBaseUrl = resolveBackendBaseUrl()

    prepareUploadImageFilePath(filePath)
      .then((uploadFilePath) => {
        wx.uploadFile({
          url: `${backendBaseUrl}/api/recycle/upload`,
          filePath: uploadFilePath,
          name: 'file',
          timeout: DEFAULT_UPLOAD_TIMEOUT_MS,
          header: {
            Authorization: `Bearer ${token}`,
          },
          success: (response) => {
            let payload: BackendUploadResponse = {}
            try {
              payload = JSON.parse(response.data || '{}') as BackendUploadResponse
            } catch (_error) {
              reject(new Error('invalid upload response'))
              return
            }

            if (response.statusCode >= 400 || payload.success === false || !payload.imageUrl) {
              reject(new Error(payload.message || `upload failed with status ${response.statusCode}`))
              return
            }

            resolve(payload.imageUrl)
          },
          fail: (error) => {
            reject(normalizeBackendRequestError(error, '/api/recycle/upload'))
          },
        })
      })
      .catch((error) => {
        reject(error)
      })
  })
}

export const uploadUserAvatar = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!hasBackendConfigured()) {
      reject(new Error(getBackendDisabledReason()))
      return
    }

    const token = getBackendToken()
    if (!token) {
      reject(new Error('missing backend token'))
      return
    }

    const backendBaseUrl = resolveBackendBaseUrl()

    const uploadAvatarViaApi = (path: string): Promise<string> => {
      return new Promise((uploadResolve, uploadReject) => {
        wx.uploadFile({
          url: `${backendBaseUrl}/api/user/avatar/upload`,
          filePath: path,
          name: 'file',
          timeout: DEFAULT_UPLOAD_TIMEOUT_MS,
          header: {
            Authorization: `Bearer ${token}`,
          },
          success: (response) => {
            let payload: BackendUploadResponse = {}
            try {
              payload = JSON.parse(response.data || '{}') as BackendUploadResponse
            } catch (_error) {
              uploadReject(new Error('invalid upload response'))
              return
            }

            if (response.statusCode >= 400 || payload.success === false || !payload.imageUrl) {
              uploadReject(new Error(payload.message || `upload failed with status ${response.statusCode}`))
              return
            }

            uploadResolve(payload.imageUrl)
          },
          fail: (error) => {
            uploadReject(normalizeBackendRequestError(error, '/api/user/avatar/upload'))
          },
        })
      })
    }

    prepareUploadImageFilePath(filePath)
      .then((uploadFilePath) => uploadAvatarViaApi(uploadFilePath))
      .then(resolve)
      .catch((error) => {
        if (!isNotFoundUploadError(error)) {
          reject(error)
          return
        }

        prepareUploadImageFilePath(filePath)
          .then((uploadFilePath) => uploadRecycleSubmissionImage(uploadFilePath))
          .then(resolve)
          .catch(reject)
      })
  })
}

export const loginWithWechat = async (payload: {
  code: string
  nickname: string
  avatarUrl: string
}): Promise<BackendUserProfile> => {
  const response = await requestBackend<BackendUserProfile>({
    path: '/api/auth/wechat/login',
    method: 'POST',
    data: payload,
  })

  saveBackendSession(response.token, response.expiresAt)
  return response
}

/**
 * Restores a backend session for devices that retain a local profile after a token expires.
 */
export const ensureBackendSession = async (): Promise<BackendUserProfile | null> => {
  if (getBackendToken()) {
    return null
  }

  // 未登录时不再静默调用 wx.login，登录只能由“完善信息”按钮触发。
  return null
}

export const recordUserActivity = (): Promise<{ success?: boolean }> => {
  return requestBackend<{ success?: boolean }>({
    path: '/api/user-activity-events',
    method: 'POST',
    requiresAuth: true,
  })
}

export const recordUserOnlineSession = (startedAt: number): Promise<{ success?: boolean }> => {
  return requestBackend<{ success?: boolean }>({
    path: '/api/user-online-sessions',
    method: 'POST',
    data: { startedAt },
    requiresAuth: true,
  })
}

export const fetchUserProfile = (): Promise<BackendUserProfile> => {
  return requestBackend<BackendUserProfile>({
    path: '/api/user/profile',
    method: 'GET',
    requiresAuth: true,
  })
}

export const updateUserProfile = (payload: Partial<BackendUserProfile>): Promise<BackendUserProfile> => {
  return requestBackend<BackendUserProfile>({
    path: '/api/user/profile',
    method: 'PUT',
    data: payload as Record<string, unknown>,
    requiresAuth: true,
  })
}

export const bindWechatPhone = (code: string): Promise<BackendUserProfile> => {
  return requestBackend<BackendUserProfile>({
    path: '/api/user/wechat-phone',
    method: 'POST',
    data: { code },
    requiresAuth: true,
  })
}

export const logoutFromBackend = (): Promise<{ success?: boolean; message?: string }> => {
  const token = getBackendToken()

  if (!token) {
    clearBackendSession()
    return Promise.resolve({
      success: true,
      message: 'already logged out',
    })
  }

  return requestBackend<{ success?: boolean; message?: string }>({
    path: '/api/auth/logout',
    method: 'POST',
    requiresAuth: true,
  })
    .then((result) => {
      clearBackendSession()
      return result
    })
    .catch((error) => {
      clearBackendSession()
      throw error
    })
}

export const fetchPurchaseOrders = async (): Promise<BackendPurchaseOrder[]> => {
  const response = await requestBackend<BackendListResponse<BackendPurchaseOrder>>({
    path: '/api/orders/purchase',
    method: 'GET',
    requiresAuth: true,
  })

  return Array.isArray(response.orders) ? response.orders : []
}

export const createPurchaseOrder = async (
  payload: CreatePurchaseOrderPayload,
): Promise<BackendPurchaseOrder | null> => {
  const response = await requestBackend<BackendOrderResponse<BackendPurchaseOrder>>({
    path: '/api/orders/purchase',
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
    requiresAuth: true,
  })

  return response.order || null
}

export const updatePurchaseOrderRemark = async (id: number, remark: string): Promise<BackendPurchaseOrder | null> => {
  const response = await requestBackend<BackendOrderResponse<BackendPurchaseOrder>>({
    path: `/api/orders/purchase/${Number(id)}/remark`,
    method: 'POST',
    data: { remark: String(remark || '').trim().slice(0, 255) },
    requiresAuth: true,
  })
  return response.order || null
}

export const fetchAddresses = async (): Promise<BackendAddress[]> => {
  const response = await requestBackend<BackendAddressListResponse>({
    path: '/api/addresses',
    method: 'GET',
    requiresAuth: true,
  })

  return Array.isArray(response.addresses) ? response.addresses : []
}

export const createAddress = async (
  payload: Omit<BackendAddress, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<BackendAddress | null> => {
  const response = await requestBackend<BackendAddressResponse>({
    path: '/api/addresses',
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
    requiresAuth: true,
  })

  return response.address || null
}

export const updateAddress = async (
  id: number,
  payload: Partial<Omit<BackendAddress, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<BackendAddress | null> => {
  const response = await requestBackend<BackendAddressResponse>({
    path: `/api/addresses?id=${id}`,
    method: 'PUT',
    data: payload as unknown as Record<string, unknown>,
    requiresAuth: true,
  })

  return response.address || null
}

export const deleteAddress = (id: number): Promise<BackendSimpleResponse> => {
  return requestBackend<BackendSimpleResponse>({
    path: `/api/addresses?id=${id}`,
    method: 'DELETE',
    requiresAuth: true,
  })
}

export const deletePurchaseOrder = (id: number): Promise<BackendSimpleResponse> => {
  return requestBackend<BackendSimpleResponse>({
    path: `/api/orders/purchase?id=${id}`,
    method: 'DELETE',
    requiresAuth: true,
  })
}

export const confirmPurchaseOrderReceipt = async (id: number): Promise<BackendPurchaseOrder | null> => {
  const response = await requestBackend<BackendOrderResponse<BackendPurchaseOrder>>({
    path: `/api/orders/purchase?id=${id}`,
    method: 'PUT',
    requiresAuth: true,
  })

  return response.order || null
}

export const preparePurchaseOrderReceiptConfirmation = async (id: number): Promise<WechatReceiptConfirmationInfo> => {
  const response = await requestBackend<{
    success?: boolean
    confirmation?: WechatReceiptConfirmationInfo
  }>({
    path: `/api/orders/purchase/receipt-confirmation?id=${id}`,
    method: 'GET',
    requiresAuth: true,
  })

  const confirmation = response.confirmation
  if (!confirmation?.transactionId) {
    throw new Error('微信订单信息不完整，暂时无法确认收货')
  }

  return confirmation
}

export const clearPurchaseOrders = (): Promise<BackendSimpleResponse> => {
  return requestBackend<BackendSimpleResponse>({
    path: '/api/orders/purchase',
    method: 'DELETE',
    requiresAuth: true,
  })
}

export const createWechatPayment = async (
  orderId: number,
): Promise<{ payment: BackendWechatPaymentParams; order: BackendPurchaseOrder | null }> => {
  const response = await requestBackend<BackendPaymentResponse>({
    path: '/api/pay/wechat/create',
    method: 'POST',
    data: {
      orderId,
    },
    requiresAuth: true,
  })

  if (!response.payment) {
    throw new Error(response.message || 'missing wechat payment params')
  }

  return {
    payment: response.payment,
    order: response.order || null,
  }
}

export const createWechatBatchPayment = async (
  orderIds: number[],
): Promise<{ payment: BackendWechatPaymentParams; batch: BackendPaymentBatch | null }> => {
  const response = await requestBackend<BackendPaymentResponse>({
    path: '/api/pay/wechat/create-batch',
    method: 'POST',
    data: {
      orderIds,
    },
    requiresAuth: true,
  })

  if (!response.payment) {
    throw new Error(response.message || 'missing wechat payment params')
  }

  return {
    payment: response.payment,
    batch: response.batch || null,
  }
}

export const completeWechatPayment = async (
  orderId: number,
  paymentTransactionId?: string,
): Promise<BackendPurchaseOrder | null> => {
  const response = await requestBackend<BackendOrderResponse<BackendPurchaseOrder>>({
    path: '/api/pay/wechat/complete',
    method: 'POST',
    data: {
      orderId,
      paymentTransactionId: paymentTransactionId || '',
    },
    requiresAuth: true,
  })

  return response.order || null
}

export const completeWechatBatchPayment = async (
  batchId: number,
  paymentTransactionId?: string,
): Promise<BackendPaymentBatch | null> => {
  const response = await requestBackend<BackendPaymentResponse>({
    path: '/api/pay/wechat/complete-batch',
    method: 'POST',
    data: {
      batchId,
      paymentTransactionId: paymentTransactionId || '',
    },
    requiresAuth: true,
  })

  return response.batch || null
}

export const confirmWechatPayment = async (
  orderId: number,
  maxAttempts = 6,
  intervalMs = 1500,
): Promise<BackendPurchaseOrder | null> => {
  let lastOrder: BackendPurchaseOrder | null = null
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const order = await completeWechatPayment(orderId)
      lastOrder = order || null

      if (order && isCompletedPurchaseOrderStatus(order.status)) {
        return order
      }
    } catch (error) {
      const currentError = error as Error & { code?: string }
      lastError = currentError

      if (currentError.code !== 'PAYMENT_NOT_CONFIRMED') {
        throw currentError
      }
    }

    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), intervalMs)
      })
    }
  }

  if (lastOrder && isCompletedPurchaseOrderStatus(lastOrder.status)) {
    return lastOrder
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('payment not confirmed yet')
}

export const confirmWechatBatchPayment = async (
  batchId: number,
  maxAttempts = 6,
  intervalMs = 1500,
): Promise<BackendPaymentBatch | null> => {
  let lastBatch: BackendPaymentBatch | null = null
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const batch = await completeWechatBatchPayment(batchId)
      lastBatch = batch || null

      if (batch && batch.status === 'paid') {
        return batch
      }
    } catch (error) {
      const currentError = error as Error & { code?: string }
      lastError = currentError

      if (currentError.code !== 'PAYMENT_NOT_CONFIRMED') {
        throw currentError
      }
    }

    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), intervalMs)
      })
    }
  }

  if (lastBatch && lastBatch.status === 'paid') {
    return lastBatch
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('payment not confirmed yet')
}

export const fetchRecycleOrders = async (): Promise<BackendRecycleOrder[]> => {
  const response = await requestBackend<BackendListResponse<BackendRecycleOrder>>({
    path: '/api/orders/recycle',
    method: 'GET',
    requiresAuth: true,
  })

  return Array.isArray(response.orders) ? response.orders : []
}

export const createRecycleOrder = async (
  payload: CreateRecycleOrderPayload,
): Promise<BackendRecycleOrder | null> => {
  const response = await requestBackend<BackendOrderResponse<BackendRecycleOrder>>({
    path: '/api/orders/recycle',
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
    requiresAuth: true,
  })

  return response.order || null
}

export const createSfPickupRecycleOrder = async (
  payload: CreateSfPickupRecycleOrderPayload,
): Promise<{ pickupOrder: BackendSfPickupOrder | null; orders: BackendRecycleOrder[] }> => {
  let response: BackendSfPickupOrderResponse

  try {
    response = await requestBackend<BackendSfPickupOrderResponse>({
      path: '/api/recycle/pickup/sf-order',
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
      requiresAuth: true,
    })
  } catch (error) {
    const requestError = error as BackendRequestError

    if (requestError.statusCode === 404) {
      throw new Error('线上后端还未部署顺丰上门取件接口，请先执行后端同步并重启服务')
    }

    throw requestError
  }

  return {
    pickupOrder: response.pickupOrder || null,
    orders: Array.isArray(response.orders) ? response.orders : [],
  }
}

export const fetchSfPickupTime = async (payload: {
  sendTime: string
  customerAddress: CreateSfPickupRecycleOrderPayload['customerAddress']
}): Promise<BackendSfPickupTime | null> => {
  const response = await requestBackend<BackendSfPickupTimeResponse>({
    path: '/api/recycle/pickup/sf-pickup-times',
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
    requiresAuth: true,
  })

  return response.pickupTime || null
}

export const fetchSfExpressStatus = async (): Promise<BackendSfExpressStatus | null> => {
  const response = await requestBackend<BackendSfExpressStatusResponse>({
    path: '/api/recycle/pickup/sf-status',
    method: 'GET',
    requiresAuth: true,
  })

  return response.status || null
}

export const fetchSfExpressSenderAddress = async (): Promise<BackendSfExpressSenderAddress | null> => {
  const response = await requestBackend<{
    senderAddress?: BackendSfExpressSenderAddress | null
    displayAddress?: string
  }>({
    path: '/api/recycle/pickup/config',
    method: 'GET',
  })

  return response.senderAddress
    ? { ...response.senderAddress, displayAddress: response.displayAddress || '' }
    : null
}

export const invokeSfExpressTestService = async (payload: {
  serviceCode: string
  msgData: Record<string, unknown>
}): Promise<BackendSfExpressTestResult> => {
  const response = await requestBackend<BackendSfExpressTestResponse>({
    path: '/api/recycle/pickup/sf-test',
    method: 'POST',
    data: payload,
    requiresAuth: true,
  })

  if (!response.serviceCode || !response.requestId || !response.timestamp) {
    throw new Error(response.message || 'missing sf express test response')
  }

  return {
    serviceCode: response.serviceCode,
    requestId: response.requestId,
    timestamp: response.timestamp,
    payload: response.payload,
    businessPayload: response.businessPayload,
  }
}

export const createSfCloudPrintWaybills = async (
  payload: CreateSfCloudPrintWaybillsPayload,
): Promise<{
  printResult: BackendSfCloudPrintResult | null
  order: BackendRecycleOrder | null
}> => {
  const response = await requestBackend<BackendSfCloudPrintResponse>({
    path: '/api/recycle/pickup/sf-cloud-print-waybills',
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
    requiresAuth: true,
  })

  return {
    printResult: response.printResult || null,
    order: response.order || null,
  }
}

export const searchSfPickupOrderResult = async (recycleOrderId: number): Promise<{
  pickupOrder: BackendSfPickupSearchResult | null
  order: BackendRecycleOrder | null
}> => {
  const response = await requestBackend<BackendSfPickupSearchResponse>({
    path: '/api/recycle/pickup/sf-search-order',
    method: 'POST',
    data: {
      recycleOrderId,
    },
    requiresAuth: true,
  })

  return {
    pickupOrder: response.pickupOrder || null,
    order: response.order || null,
  }
}

export const cancelSfPickupOrder = async (recycleOrderId: number): Promise<{
  pickupOrder: BackendSfPickupSearchResult | null
  order: BackendRecycleOrder | null
}> => {
  const response = await requestBackend<BackendSfPickupCancelResponse>({
    path: '/api/recycle/pickup/sf-cancel-order',
    method: 'POST',
    data: {
      recycleOrderId,
    },
    requiresAuth: true,
  })

  return {
    pickupOrder: response.pickupOrder || null,
    order: response.order || null,
  }
}

export const deleteRecycleOrder = (id: number, forceCleanup = false): Promise<BackendSimpleResponse> => {
  return requestBackend<BackendSimpleResponse>({
    path: `/api/orders/recycle?id=${id}${forceCleanup ? '&force=1' : ''}`,
    method: 'DELETE',
    requiresAuth: true,
  })
}

export const clearRecycleOrders = (): Promise<BackendSimpleResponse> => {
  return requestBackend<BackendSimpleResponse>({
    path: '/api/orders/recycle',
    method: 'DELETE',
    requiresAuth: true,
  })
}

export const respondToRecycleReview = async (
  recycleOrderId: number,
  decision: 'accept' | 'take_back',
  returnAddressId = 0,
): Promise<BackendRecycleOrder | null> => {
  const response = await requestBackend<BackendRecycleReviewResponse>({
    path: '/api/orders/recycle/review-response',
    method: 'POST',
    data: {
      recycleOrderId,
      decision,
      ...(decision === 'take_back' ? { returnAddressId } : {}),
    },
    requiresAuth: true,
  })

  return response.order || null
}

export const claimRecycleSettlement = async (recycleOrderId: number): Promise<BackendRecycleSettlement | null> => {
  const response = await requestBackend<BackendRecycleSettlementResponse>({
    path: '/api/recycle/settlement/claim',
    method: 'POST',
    data: {
      recycleOrderId,
    },
    requiresAuth: true,
  })

  return response.settlement || null
}

export const syncRecycleSettlement = async (recycleOrderId: number): Promise<BackendRecycleSettlement | null> => {
  const response = await requestBackend<BackendRecycleSettlementResponse>({
    path: '/api/recycle/settlement/sync',
    method: 'POST',
    data: {
      recycleOrderId,
    },
    requiresAuth: true,
  })

  return response.settlement || null
}

export const fetchPublicCategorySections = async (
  targetScene: 'sale' | 'recycle',
): Promise<BackendCategorySection[]> => {
  const response = await requestBackend<BackendCategorySectionListResponse>({
    path: `/api/category-sections?targetScene=${targetScene}`,
    method: 'GET',
    cacheKey: `public-category-sections:${targetScene}`,
  })

  return Array.isArray(response.sections) ? response.sections : []
}

export const fetchPublicCategories = async (scene: 'sale' | 'recycle'): Promise<BackendCategoryConfig[]> => {
  try {
    const sections = await fetchPublicCategorySections(scene)
    return sections.reduce<BackendCategoryConfig[]>((result, section) => {
      const categories = Array.isArray(section.categories) ? section.categories : []
      return result.concat(categories.map((category) => ({
        ...category,
        sectionKey: category.sectionKey || section.key,
        sectionName: category.sectionName || section.name,
      })))
    }, [])
  } catch (_error) {
    const response = await requestBackend<BackendCategoryListResponse>({
      path: `/api/categories?scene=${scene}`,
      method: 'GET',
      cacheKey: `public-categories:${scene}`,
    })

    return Array.isArray(response.categories) ? response.categories : []
  }
}

export const fetchPublicProducts = async (scene: 'buy' | 'recycle' = 'buy'): Promise<BackendPublicProduct[]> => {
  const response = await requestBackend<BackendPublicProductListResponse>({
    path: `/api/products?scene=${scene}`,
    method: 'GET',
    cacheKey: `public-products:${scene}`,
  })

  return Array.isArray(response.products) ? response.products : []
}

export const fetchHomepageBanners = async (): Promise<BackendHomepageBanner[]> => {
  const response = await requestBackend<BackendHomepageBannerListResponse>({
    path: '/api/homepage/banners',
    method: 'GET',
    cacheKey: 'public-homepage-banners',
  })

  return Array.isArray(response.banners) ? response.banners.map(normalizeHomepageBanner) : []
}

export const fetchHomepageSection = async (): Promise<BackendHomepageSection | null> => {
  const response = await requestBackend<BackendHomepageSectionResponse>({
    path: '/api/homepage/section',
    method: 'GET',
    cacheKey: 'public-homepage-section',
  })

  return response.section || null
}

export const fetchPublicNotices = async (): Promise<BackendNotice[]> => {
  const response = await requestBackend<BackendNoticeListResponse>({
    path: '/api/notices',
    method: 'GET',
  })

  return Array.isArray(response.notices) ? response.notices.map(normalizeNotice) : []
}

export const fetchLegalDocument = async (type: BackendLegalDocument['type']): Promise<BackendLegalDocument | null> => {
  const response = await requestBackend<{ document?: BackendLegalDocument }>({
    path: `/api/legal-documents/${type}`,
    method: 'GET',
  })
  return response.document || null
}

export const fetchPublicNoticeDetail = async (id: number): Promise<BackendNotice | null> => {
  const response = await requestBackend<BackendNoticeResponse>({
    path: `/api/notices/${id}`,
    method: 'GET',
  })

  return response.notice ? normalizeNotice(response.notice) : null
}

export const fetchContentPageDetail = async (id: number, tutorialCategoryId = 0): Promise<BackendContentPage | null> => {
  const isTutorialDirectory = id === 1 && tutorialCategoryId === 0
  const response = await requestBackend<BackendContentPageResponse>({
    path: `/api/content-pages/${id}${tutorialCategoryId ? `?tutorialCategoryId=${tutorialCategoryId}` : ''}`,
    method: 'GET',
    // The directory has no personalized fields, so it can use the public cache.
    useOptionalAuth: !isTutorialDirectory,
    cacheKey: isTutorialDirectory ? 'tutorial-directory' : '',
  })

  if (!response.page) {
    return null
  }

  const tutorialCategories = Array.isArray(response.page.tutorialCategories)
    ? response.page.tutorialCategories
    : (Array.isArray(response.page.tutorial_categories) ? response.page.tutorial_categories : (response.tutorialCategories || response.tutorial_categories))
  const tutorialArticles = Array.isArray(response.page.tutorialArticles)
    ? response.page.tutorialArticles
    : (Array.isArray(response.page.tutorial_articles) ? response.page.tutorial_articles : (response.tutorialArticles || response.tutorial_articles))

  return normalizeContentPage({
    ...response.page,
    ...(response.interactions || {}),
    tutorialCategories,
    tutorial_categories: tutorialCategories,
    tutorialArticles,
    tutorial_articles: tutorialArticles,
  })
}

export const toggleTutorialInteraction = async (
  pageId: number,
  action: 'like' | 'favorite',
): Promise<BackendTutorialInteractionStats | null> => {
  const response = await requestBackend<{ interactions?: BackendTutorialInteractionStats | null }>({
    path: `/api/content-pages/${Number(pageId)}/${action}`,
    method: 'POST',
    requiresAuth: true,
  })
  clearPublicBackendCache('tutorial-directory')
  return response.interactions || null
}

export const recordTutorialShare = async (pageId: number): Promise<BackendTutorialInteractionStats | null> => {
  const response = await requestBackend<{ interactions?: BackendTutorialInteractionStats | null }>({
    path: `/api/content-pages/${Number(pageId)}/share`,
    method: 'POST',
  })
  return response.interactions || null
}

export const fetchMyTutorialInteractions = async (action: 'like' | 'favorite' = 'like'): Promise<BackendContentPage[]> => {
  const response = await requestBackend<{ articles?: BackendContentPage[] }>({
    path: `/api/my-tutorial-interactions?action=${action}`,
    method: 'GET',
    requiresAuth: true,
  })
  return Array.isArray(response.articles) ? response.articles.map(normalizeContentPage) : []
}

export const fetchTutorialCategories = async (): Promise<BackendContentPage[]> => {
  try {
    const response = await requestBackend<BackendTutorialCategoryListResponse>({
      path: '/api/tutorial-categories',
      method: 'GET',
    })

    return Array.isArray(response.categories) ? response.categories.map(normalizeContentPage) : []
  } catch (error) {
    const requestError = error as BackendRequestError
    if (requestError.statusCode === 404) {
      return []
    }

    throw error
  }
}

export const fetchTutorialArticles = async (): Promise<BackendContentPage[]> => {
  try {
    const response = await requestBackend<BackendTutorialArticleListResponse>({
      path: '/api/tutorial-articles',
      method: 'GET',
    })

    return Array.isArray(response.articles) ? response.articles.map(normalizeContentPage) : []
  } catch (error) {
    const requestError = error as BackendRequestError
    if (requestError.statusCode === 404) {
      return []
    }

    throw error
  }
}

export const fetchRecycleProducts = async (filters?: {
  categoryKey?: string
  keyword?: string
}): Promise<BackendRecycleProduct[]> => {
  const queryParts: string[] = []

  if (filters?.categoryKey) {
    queryParts.push(`categoryKey=${encodeURIComponent(filters.categoryKey)}`)
  }

  if (filters?.keyword) {
    queryParts.push(`keyword=${encodeURIComponent(filters.keyword)}`)
  }

  const query = queryParts.length ? `?${queryParts.join('&')}` : ''
  const response = await requestBackend<BackendRecycleProductListResponse>({
    path: `/api/recycle/products${query}`,
    method: 'GET',
    cacheKey: `public-recycle-products:${query}`,
  })

  return Array.isArray(response.products) ? response.products.map(normalizeRecycleProduct) : []
}

export const fetchRecycleProductDetail = async (id: number): Promise<BackendRecycleProduct | null> => {
  const response = await requestBackend<BackendRecycleProductResponse>({
    path: `/api/recycle/products/${id}`,
    method: 'GET',
    cacheKey: `public-recycle-product-detail:${id}`,
  })

  return response.product ? normalizeRecycleProduct(response.product) : null
}

export const fetchRecycleSettings = async (): Promise<BackendRecycleSettings> => {
  const response = await requestBackend<BackendRecycleSettingsResponse>({
    path: '/api/recycle/settings',
    method: 'GET',
  })

  return {
    payMethods: Array.isArray(response.payMethods) ? response.payMethods : [],
    notice: response.notice || {
      visible: false,
      content: '',
      lines: [],
    },
  }
}

export const quoteRecycleProduct = async (payload: {
  recycleProductId: number
  selectedDeviceOptionValues: Record<string, string>
}): Promise<{ product: BackendRecycleProduct | null; quote: BackendRecycleQuote | null }> => {
  const response = await requestBackend<BackendRecycleQuoteResponse>({
    path: '/api/recycle/quote',
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
  })

  return {
    product: response.product ? normalizeRecycleProduct(response.product) : null,
    quote: response.quote || null,
  }
}
