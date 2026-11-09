// 回收订单页面逻辑与订单状态展示
import { getStatusBarHeight } from '../../utils/system'
import {
  getCartItemRecords,
  removeCartProduct,
  removeCartProducts,
  CartItemRecord,
} from '../../utils/cart'
import {
  cancelSfPickupOrder,
  confirmPurchaseOrderReceipt,
  preparePurchaseOrderReceiptConfirmation,
  BackendRecycleSettlement,
  deletePurchaseOrder,
  deleteRecycleOrder,
  fetchRecycleProductDetail,
  fetchRecycleProducts,
  fetchPurchaseOrders,
  fetchRecycleOrders,
  getBackendToken,
  BackendPurchaseOrder,
  BackendRecycleOrder,
  BackendRecycleProduct,
  BackendSfPickupSearchResult,
  respondToRecycleReview,
  searchSfPickupOrderResult,
  syncRecycleSettlement,
} from '../../utils/backend'
import {
  getPendingRecycleOrders,
  PendingRecycleOrderRecord,
  removePendingRecycleProduct,
  removePendingRecycleProducts,
} from '../../utils/recycle'
import { ensureProductCatalogLoaded, getProductById, ProductRecord } from '../../data/products'
import { resolveBackendAssetUrl } from '../../utils/backend-config'
import { AddressRecord, getCachedAddress } from '../../utils/address'
import { claimPendingRecycleSettlement } from '../../utils/wechat-pay'
import { confirmReceiptWithWechat } from '../../utils/wechat-order-confirm'
import {
  consumeTabEnterTransition,
  clearTabTransitionTimer,
  playTabEnterTransition,
  RootTabKey,
  shouldIgnoreRapidNavigationTap,
  startSlidingTabSwitch,
  NavigationTapGuard,
} from '../../utils/navigation'

const STORAGE_KEY = 'mine-local-user-profile'

const redirectToMineLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=order',
  })
}

const getOrderActionErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message.trim() : ''
  return message || fallback
}

const isMissingRecycleOrderInfoError = (error: unknown): boolean => {
  const requestError = error as { code?: unknown; message?: unknown } | null
  const code = String(requestError?.code || '').trim().toUpperCase()
  const message = String(requestError?.message || '').trim().toLowerCase()

  if (['ORDER_NOT_FOUND', 'RECYCLE_ORDER_NOT_FOUND', 'PICKUP_ORDER_NOT_FOUND'].includes(code)) {
    return true
  }

  return [
    '未获取到订单信息',
    '未找到回收单',
    '回收单不存在',
    '订单信息不存在',
    'recycle order not found',
    'pickup order not found',
    'order info is missing',
    'sf pickup order info is missing',
    'order not found',
  ].some((text) => message.includes(text.toLowerCase()))
}

interface TabItem {
  key: string
  text: string
  path: string
  icon: string
}

type OrderModeKey = 'recycle' | 'buy' | 'cart' | 'settlement'
type ActiveOrderModeKey = OrderModeKey | 'purchased' | 'sold' | 'recycle_reviewing' | 'recycle_rejected' | 'recycle_approved'
type RecycleItemSource = 'local' | 'server'
type PurchaseShipData = {
  expressCompany?: string
  expressNo?: string
  expressTime?: string
}

interface OrderModeItem {
  id: number
  key: ActiveOrderModeKey
  text: string
  active?: boolean
}

interface BuyOrderItem {
  id: number
  addedAt: number
  productId: number
  product: ProductRecord
  status: string
  statusText: string
  totalAmountText: string
  orderNo: string
  merchantOrderNo: string
  recipientName: string
  recipientPhone: string
  addressDetail: string
  createdAtText: string
  paidAtText: string
  shipData: PurchaseShipData
  canConfirmReceipt: boolean
  receiptConfirmed: boolean
  selected: boolean
}

interface RecycleOrderItem {
  id: number
  addedAt: number
  source: RecycleItemSource
  recycleProductId?: number
  categoryKey?: string
  title: string
  coverLabel: string
  coverImage: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  payoutMethodLabel: string
  accountNumber: string
  realName: string
  optionSummary: string
  finalPriceText: string
  estimateBasePrice: number
  estimateFinalPrice: number
  estimateSupported: boolean
  note: string
  isSfPickup: boolean
  sfPickupOrderId: string
  sfWaybillNo: string
  sfPickupTimeText: string
  sfPickupRecipientName: string
  sfPickupRecipientPhone: string
  sfPickupAddressText: string
  sfPickupCanceled: boolean
  selectedDeviceOptionValues: Record<string, string>
  selectedDeviceOptionTexts: Record<string, string>
  submissionImages: string[]
  status: string
  userResponseStatus: string
  statusText: string
  singleViewStatusText: string
  reviewNote: string
  reviewResponseAvailable: boolean
  settlement: BackendRecycleSettlement | null
  settlementState: string
  settlementStatusText: string
  settlementCanClaim: boolean
  settlementClaimButtonVisible: boolean
  paymentProofImages: string[]
  productSnapshot?: BackendRecycleOrder['productSnapshot']
  publishedProductId?: number | null
  selected: boolean
}

interface RecycleDetailOptionLine {
  key: string
  text: string
}

type CartOrderItem = CartItemRecord & {
  product: ProductRecord
  selected: boolean
}

interface OrderPageData {
  currentTab: string
  pageTransitionClass: string
  statusBarHeight: number
  currentMode: OrderModeKey
  activeOrderMode: ActiveOrderModeKey
  pageTitle: string
  fromMineEntry: boolean
  recycleNotice: string
  orderModes: OrderModeItem[]
  orderModeScrollThumbWidth: number
  orderModeScrollThumbLeft: number
  orderModeThumbStyle: string
  orderModeScrollLeft: number
  itemCount: number
  emptyText: string
  primaryActionText: string
  secondaryActionText: string
  buyItems: BuyOrderItem[]
  cartItems: CartOrderItem[]
  recycleItems: RecycleOrderItem[]
  displayedRecycleItems: RecycleOrderItem[]
  purchaseDetailVisible: boolean
  purchaseDetailOrder: BuyOrderItem | null
  recycleDetailVisible: boolean
  recycleDetailOrder: RecycleOrderItem | null
  recycleDetailOptionLines: RecycleDetailOptionLine[]
  pickupDetailVisible: boolean
  pickupDetailTitle: string
  pickupDetailStatusText: string
  pickupDetailOrderId: string
  pickupDetailWaybillNo: string
  pickupDetailPickupTimeText: string
  pickupDetailRecipientName: string
  pickupDetailRecipientPhone: string
  pickupDetailAddressText: string
  reviewResponseVisible: boolean
  reviewResponseOrderId: number
  reviewResponseTitle: string
  reviewResponseReason: string
  reviewResponseFinalPriceText: string
  reviewReturnAddressId: number
  reviewReturnRecipientName: string
  reviewReturnRecipientPhone: string
  reviewReturnAddressText: string
  reviewReturnAddressReady: boolean
  tabs: TabItem[]
}

type TabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string; path?: string }>
type OrderModeTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: ActiveOrderModeKey }>
type OrderModeScrollEvent = WechatMiniprogram.ScrollViewScroll
type OrderModeProgressTouchEvent = WechatMiniprogram.TouchEvent
type BuyItemTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { productId?: number; orderId?: number }>
type BuyDeleteTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type BuyConfirmReceiptTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type BuySelectTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type CartItemTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { productId?: number }>
type CartDeleteTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { addedAt?: number }>
type CartSelectTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { addedAt?: number }>
type RecycleItemTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { publishedProductId?: number; orderId?: number; source?: RecycleItemSource }>
type RecycleDeleteTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number; source?: RecycleItemSource }>
type RecycleSelectTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number; source?: RecycleItemSource }>
type RecycleCancelPickupTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type RecycleClaimTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type RecyclePaymentProofTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type RecycleReviewResponseTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { orderId?: number }>
type WaybillCopyTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { waybillNo?: string }>
type PickupDetailCopyTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { value?: string; label?: string }>
type OrderOptions = {
  mode?: string
  source?: string
}

interface OrderPage extends NavigationTapGuard {
  tabTransitionTimer?: number
  currentPickupDetailOrder: RecycleOrderItem | null
  selectingReviewReturnAddress: boolean
  isRecycleOrderActionInProgress: boolean
  isRecycleClaimInProgress: boolean
  confirmingPurchaseOrderId: number
  orderLoadRequestId: number
  orderLoadingCount: number
  orderModeViewportWidth?: number
  orderModeContentWidth?: number
  orderModeProgressTrackLeft?: number
  orderModeProgressTrackWidth?: number
  orderModeProgressDragging?: boolean
  beginOrderLoading(title: string): void
  endOrderLoading(): void
  onLoad(options: OrderOptions): void
  onReady(): void
  onShow(): void
  onSubpageBack(): void
  loadServerOrders(): Promise<void>
  removeSettledRecycleOrder(orderId: number): void
  syncOrderState(currentMode: OrderModeKey): void
  onTabTap(event: TabTapEvent): void
  onOrderModeTap(event: OrderModeTapEvent): void
  onOrderModeScroll(event: OrderModeScrollEvent): void
  refreshOrderModeScrollIndicator(): void
  onOrderModeProgressTouchStart(event: OrderModeProgressTouchEvent): void
  onOrderModeProgressTouchMove(event: OrderModeProgressTouchEvent): void
  onOrderModeProgressTouchEnd(): void
  onBuyItemTap(event: BuyItemTapEvent): void
  onBuyDeleteTap(event: BuyDeleteTapEvent): void
  onBuyConfirmReceiptTap(event: BuyConfirmReceiptTapEvent): void
  onBuySelectTap(event: BuySelectTapEvent): void
  onCartItemTap(event: CartItemTapEvent): void
  onCartDeleteTap(event: CartDeleteTapEvent): void
  onCartSelectTap(event: CartSelectTapEvent): void
  onRecycleItemTap(event: RecycleItemTapEvent): void
  syncReviewReturnAddress(address?: AddressRecord | null): void
  onChooseReviewReturnAddress(): void
  onRecycleDeleteActionTap(event: RecycleDeleteTapEvent): void
  onRecycleSelectTap(event: RecycleSelectTapEvent): void
  onRecycleCancelActionTap(event: RecycleCancelPickupTapEvent): Promise<void>
  onRecycleClaimTap(event: RecycleClaimTapEvent): Promise<void>
  onRecycleReviewAcceptTap(event: RecycleReviewResponseTapEvent): Promise<void>
  onRecycleReviewTakeBackTap(event: RecycleReviewResponseTapEvent): Promise<void>
  onPaymentProofTap(event: RecyclePaymentProofTapEvent): void
  onCopyWaybillTap(event: WaybillCopyTapEvent): void
  closePickupDetail(): void
  closePurchaseDetail(): void
  closeRecycleDetail(): void
  closeReviewResponse(): void
  onPickupDetailCopyTap(event: PickupDetailCopyTapEvent): void
  stopPickupDetailTap(): void
  onCheckoutTap(): Promise<void>
  onClearTap(): Promise<void>
}

const buildOrderModes = (activeOrderMode: ActiveOrderModeKey): OrderModeItem[] => {
  const orderModes: Array<Omit<OrderModeItem, 'active'>> = [
    { id: 1, key: 'recycle', text: '待卖出' },
    { id: 2, key: 'recycle_reviewing', text: '待检测' },
    { id: 3, key: 'recycle_rejected', text: '有异常' },
    { id: 4, key: 'recycle_approved', text: '已通过' },
    { id: 5, key: 'settlement', text: '待收款' },
    { id: 6, key: 'sold', text: '已卖出' },
  ]

  return orderModes.map((item) => ({
    ...item,
    active: item.key === activeOrderMode,
  }))
}

const formatReturnAddressText = (address: AddressRecord): string => (
  [address.province, address.city, address.district, address.addressDetail]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
)

const ORDER_MODE_SCROLL_THUMB_SCALE = 0.5

const buildOrderModeScrollIndicator = (
  scrollLeft: number,
  scrollWidth: number,
  viewportWidth: number,
): { orderModeScrollThumbWidth: number; orderModeScrollThumbLeft: number; orderModeThumbStyle: string } => {
  if (scrollWidth <= 0 || viewportWidth <= 0 || scrollWidth <= viewportWidth) {
    return {
      orderModeScrollThumbWidth: 50,
      orderModeScrollThumbLeft: 0,
      orderModeThumbStyle: 'width: 50%; left: 0%;',
    }
  }

  const thumbWidth = Math.min(100, (viewportWidth / scrollWidth) * 100 * ORDER_MODE_SCROLL_THUMB_SCALE)
  const maxScrollLeft = scrollWidth - viewportWidth
  const scrollProgress = Math.max(0, Math.min(1, scrollLeft / maxScrollLeft))

  return {
    orderModeScrollThumbWidth: thumbWidth,
    orderModeScrollThumbLeft: scrollProgress * (100 - thumbWidth),
    orderModeThumbStyle: `width: ${thumbWidth}%; left: ${scrollProgress * (100 - thumbWidth)}%;`,
  }
}

const getActiveOrderMode = (currentMode: OrderModeKey, fromMineEntry: boolean): ActiveOrderModeKey => {
  if (!fromMineEntry) {
    return currentMode
  }

  if (currentMode === 'buy') {
    return 'purchased'
  }

  if (currentMode === 'recycle') {
    return 'recycle'
  }

  return 'settlement'
}

const isRecycleStatusMode = (value?: string): value is 'recycle_reviewing' | 'recycle_rejected' | 'recycle_approved' => (
  value === 'recycle_reviewing' || value === 'recycle_rejected' || value === 'recycle_approved'
)

const resolveOrderView = (mode?: string, source?: string): { currentMode: OrderModeKey; fromMineEntry: boolean; activeOrderMode: ActiveOrderModeKey } => {
  if (isRecycleStatusMode(mode)) {
    return { currentMode: 'recycle', fromMineEntry: false, activeOrderMode: mode }
  }

  if (mode === 'sold' || (source === 'mine' && mode === 'recycle')) {
    return {
      currentMode: 'recycle',
      fromMineEntry: true,
      activeOrderMode: mode === 'sold' ? 'sold' : 'recycle',
    }
  }

  if (mode === 'settlement') {
    return { currentMode: 'settlement', fromMineEntry: true, activeOrderMode: 'settlement' }
  }

  return { currentMode: 'recycle', fromMineEntry: false, activeOrderMode: 'recycle' }
}

const normalizeRecycleTheme = (value?: string): RecycleOrderItem['coverTheme'] => {
  if (value === 'blue' || value === 'gray' || value === 'green') {
    return value
  }

  return 'red'
}

const buildPurchaseStatusText = (status?: string): string => {
  switch (status) {
    case 'received':
      return '已收货'
    case 'paid':
      return '已支付'
    case 'submitted':
    case 'pending_payment':
      return '待付款'
    default:
      return '处理中'
  }
}

const isCompletedPurchaseStatus = (status?: string): boolean => (
  status === 'paid' || status === 'received'
)

const isPendingPurchaseStatus = (status?: string): boolean => (
  status === 'pending_payment' || status === 'submitted' || !status
)

const buildRecycleStatusText = (status?: string, userResponseStatus?: string): string => {
  if (userResponseStatus === 'take_back_requested') {
    return '已申请拿回'
  }
  if (userResponseStatus === 'accepted_quote') {
    return '已接受报价'
  }

  switch (status) {
    case 'local_pending':
      return '待卖出'
    case 'submitted':
      return '待检测'
    case 'reviewed':
      return '已通过'
    case 'approved':
      return '已通过'
    case 'needs_fix':
      return '有异常'
    case 'published':
      return '已通过'
    default:
      return '处理中'
  }
}

const buildRecycleSingleViewStatusText = (status?: string, userResponseStatus?: string): string => {
  if (userResponseStatus === 'take_back_requested') {
    return '已申请拿回'
  }
  if (userResponseStatus === 'accepted_quote') {
    return '已接受报价'
  }

  switch (status) {
    case 'local_pending':
      return '待卖出'
    case 'submitted':
      return '待检测'
    case 'reviewed':
      return '已通过'
    case 'approved':
      return '已通过'
    case 'needs_fix':
      return '有异常'
    case 'published':
      return '已通过'
    default:
      return '处理中'
  }
}

const normalizeRecyclePayoutMethodLabel = (value?: string): 'wechat' | 'alipay' | 'unknown' => {
  const normalizedValue = String(value || '').trim()

  if (normalizedValue === '微信' || normalizedValue === '微信支付' || normalizedValue === '微信零钱') {
    return 'wechat'
  }

  if (normalizedValue === '支付宝' || normalizedValue === '支付宝收款') {
    return 'alipay'
  }

  return 'unknown'
}

const isWechatRecyclePayoutMethodLabel = (value?: string): boolean => (
  normalizeRecyclePayoutMethodLabel(value) === 'wechat'
)

const buildRecycleSettlementStatusText = (
  settlement: BackendRecycleSettlement | null,
  payoutMethodLabel = '',
): string => {
  const normalizedPayoutMethodLabel = normalizeRecyclePayoutMethodLabel(payoutMethodLabel)

  if (normalizedPayoutMethodLabel === 'alipay') {
    return String(settlement?.state || '').trim().toUpperCase() === 'SUCCESS'
      ? '支付宝已打款'
      : settlement?.stateDesc || '待支付宝到账'
  }

  if (normalizedPayoutMethodLabel === 'wechat') {
    if (!settlement || !String(settlement.state || '').trim()) {
      return '待微信零钱到账'
    }
  }

  if (normalizedPayoutMethodLabel !== 'wechat') {
    return settlement?.stateDesc || '待收款'
  }

  const state = String(settlement?.state || '').trim().toUpperCase()

  switch (state) {
    case 'ADMIN_CONFIRMED':
      return '待领取'
    case 'WAIT_USER_CONFIRM':
      return '待确认收款'
    case 'TRANSFERING':
    case 'PROCESSING':
    case 'ACCEPTED':
      return '转账处理中'
    case 'SUCCESS':
      return '已收款'
    case 'FAIL':
      return settlement?.failReason || '转账失败'
    case 'CANCEL':
      return '已取消'
    default:
      return settlement?.stateDesc || '待收款'
  }
}

const canClaimRecycleSettlement = (settlement: BackendRecycleSettlement | null, payoutMethodLabel = ''): boolean => {
  if (!isWechatRecyclePayoutMethodLabel(payoutMethodLabel)) {
    return false
  }

  const state = String(settlement?.state || '').trim().toUpperCase()
  if (state === 'ADMIN_CONFIRMED') {
    return true
  }

  return state === 'WAIT_USER_CONFIRM'
    && Boolean(String(settlement?.packageInfo || '').trim())
}

const getDisplayedRecycleItems = (
  recycleItems: RecycleOrderItem[],
  _currentMode: OrderModeKey,
  _fromMineEntry: boolean,
  activeOrderMode?: ActiveOrderModeKey,
): RecycleOrderItem[] => {
  if (activeOrderMode === 'sold') {
    return recycleItems.filter((item) => item.source === 'server' && item.settlementState === 'SUCCESS')
  }

  const resolveItemMode = (item: RecycleOrderItem): ActiveOrderModeKey => {
    if (item.source === 'local') {
      return 'recycle'
    }

    if (item.settlementState === 'SUCCESS') {
      return 'sold'
    }

    if (item.settlement) {
      return 'settlement'
    }

    if (item.status === 'needs_fix') {
      return 'recycle_rejected'
    }

    if (item.status === 'submitted') {
      return 'recycle_reviewing'
    }

    if (['approved', 'reviewed', 'published'].includes(item.status)) {
      return 'recycle_approved'
    }

    return 'recycle_reviewing'
  }

  return recycleItems.filter((item) => resolveItemMode(item) === activeOrderMode)
}

const buildCanceledPickupStatusText = (): string => '已取消取件'

const formatAmountText = (value: number): string => {
  const amount = Number(value || 0)

  if (Number.isInteger(amount)) {
    return `${amount}元`
  }

  return `${amount.toFixed(2)}元`
}

const buildRecycleDetailOptionLines = (order: RecycleOrderItem): RecycleDetailOptionLine[] => {
  const optionLines = Object.entries(order.selectedDeviceOptionTexts || {})
    .map(([key, text]) => ({
      key,
      text: String(text || '').trim(),
    }))
    .filter((item) => Boolean(item.text))

  if (optionLines.length) {
    return optionLines
  }

  return String(order.optionSummary || '')
    .split('/')
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      key: `summary-${index}`,
      text,
    }))
}

const restoreCompleteOptionTexts = (
  selectedValues: Record<string, string>,
  selectedTexts: Record<string, string>,
  product?: BackendRecycleProduct,
): Record<string, string> => {
  const completeTexts: Record<string, string> = {}
  const optionGroups = product?.optionGroups || []

  optionGroups.forEach((group) => {
    const key = String(group.key || '').trim()
    const selectedValue = String(selectedValues[key] || '').trim()
    const storedText = String(selectedTexts[key] || '').trim()
    const matchedOption = (group.options || []).find((option) => option.value === selectedValue)
    const displayText = storedText || String(matchedOption?.label || '').trim() || selectedValue

    if (key && displayText) {
      completeTexts[key] = displayText
    }
  })

  Object.keys(selectedValues || {}).forEach((key) => {
    const displayText = String(selectedTexts[key] || selectedValues[key] || '').trim()
    if (displayText && !completeTexts[key]) {
      completeTexts[key] = displayText
    }
  })

  Object.keys(selectedTexts || {}).forEach((key) => {
    const displayText = String(selectedTexts[key] || '').trim()
    if (displayText && !completeTexts[key]) {
      completeTexts[key] = displayText
    }
  })

  return completeTexts
}

const formatOrderDateText = (timestamp?: number, realtime?: string): string => {
  const realtimeText = String(realtime || '').trim()
  if (realtimeText) {
    return realtimeText
  }

  const value = Number(timestamp || 0)
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const buildPurchaseOrderSnapshotProduct = (order: BackendPurchaseOrder): ProductRecord | null => {
  const title = String(order.productSnapshotTitle || '').trim()
  if (!title) {
    return null
  }

  const subtitle = String(order.productSnapshotSubtitle || '').trim()
  const heroImage = resolveBackendAssetUrl(String(order.productSnapshotCoverImage || '').trim())

  return {
    id: 0,
    categoryKey: 'others',
    rawCategoryKey: 'historical-order',
    modelKey: 'historical-order',
    platform: '历史商品',
    coverText: '',
    coverTitle: subtitle || title.slice(0, 12),
    title,
    subtitle,
    price: String(Number(order.totalAmount || 0)),
    tag: '',
    detailImages: heroImage ? [heroImage] : [],
    heroImage,
    inStock: false,
    recyclable: false,
    premiumCondition: false,
    certifiedPrice: false,
    releaseOrder: 0,
    heroTheme: 'others',
    heroAccent: '',
    editionLabel: '',
    featureTags: [],
    shoppingTextA: '',
    shoppingTextB: '',
    shoppingTextC: '',
  }
}

const getRecycleSelectionKey = (item: Pick<RecycleOrderItem, 'source' | 'id'>): string => `${item.source}:${item.id}`

const resolveSelectedState = (selectedMap: Map<number, boolean>, key: number): boolean => {
  if (!selectedMap.has(key)) {
    return false
  }

  return Boolean(selectedMap.get(key))
}

const resolveRecycleSelectedState = (
  selectedMap: Map<string, boolean>,
  item: Pick<RecycleOrderItem, 'source' | 'id'>,
): boolean => {
  const key = getRecycleSelectionKey(item)

  if (!selectedMap.has(key)) {
    return false
  }

  return Boolean(selectedMap.get(key))
}

const getCartItems = (selectedMap: Map<number, boolean> = new Map()): CartOrderItem[] => {
  return getCartItemRecords()
    .map((item) => {
      const product = getProductById(item.productId)

      if (!product) {
        return null
      }

      return {
        ...item,
        product,
        selected: resolveSelectedState(selectedMap, item.addedAt),
      }
    })
    .filter((item): item is CartOrderItem => Boolean(item))
}

const parseSfPickupServiceNote = (note?: string): Pick<
  RecycleOrderItem,
  'isSfPickup' | 'sfPickupOrderId' | 'sfWaybillNo' | 'sfPickupTimeText' | 'sfPickupRecipientName' | 'sfPickupRecipientPhone' | 'sfPickupAddressText' | 'sfPickupCanceled'
> => {
  const lines = String(note || '')
    .split(/[\r\n；;]+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const getValueByPrefix = (prefix: string): string => {
    const matchedLine = lines.find((line) => line.startsWith(prefix))
    return matchedLine ? matchedLine.slice(prefix.length).trim() : ''
  }

  const pickupAddressText = getValueByPrefix('取件地址：')
  const pickupPhoneMatch = pickupAddressText.match(/1\d{10}/)
  const pickupRecipientPhone = pickupPhoneMatch ? pickupPhoneMatch[0] : ''
  const pickupRecipientName = pickupRecipientPhone
    ? pickupAddressText.slice(0, pickupPhoneMatch?.index || 0).trim()
    : ''
  const pickupAddressDetail = pickupRecipientPhone
    ? pickupAddressText.slice((pickupPhoneMatch?.index || 0) + pickupRecipientPhone.length).trim()
    : pickupAddressText

  return {
    isSfPickup: lines.includes('【回收寄出】顺丰上门取件'),
    sfPickupOrderId: getValueByPrefix('丰桥订单号：'),
    sfWaybillNo: getValueByPrefix('顺丰运单号：'),
    sfPickupTimeText: getValueByPrefix('预约时间：') || getValueByPrefix('上门时间：'),
    sfPickupRecipientName: pickupRecipientName,
    sfPickupRecipientPhone: pickupRecipientPhone,
    sfPickupAddressText: pickupAddressDetail,
    sfPickupCanceled: lines.some((line) => line.includes('【顺丰取件】已取消')),
  }
}

const buildLocalRecycleItem = (
  item: PendingRecycleOrderRecord,
  selectedMap: Map<string, boolean> = new Map(),
  coverImage = '',
): RecycleOrderItem => {
  const sfPickupInfo = parseSfPickupServiceNote(item.note)
  const recycleItem: RecycleOrderItem = {
    id: item.addedAt,
    addedAt: item.addedAt,
    source: 'local',
    recycleProductId: item.recycleProductId || 0,
    categoryKey: item.categoryKey || '',
    title: item.title,
    coverLabel: item.coverLabel,
    coverImage: coverImage || resolveBackendAssetUrl(item.coverImage || ''),
    coverTheme: normalizeRecycleTheme(item.coverTheme),
    payoutMethodLabel: item.payoutMethodLabel || '微信零钱',
    accountNumber: item.accountNumber || '',
    realName: item.realName || '未填写',
    optionSummary: item.optionSummary || '已提交回收信息',
    finalPriceText: formatAmountText(Number(item.estimateFinalPrice || 0)),
    estimateBasePrice: Number(item.estimateBasePrice || 0),
    estimateFinalPrice: Number(item.estimateFinalPrice || 0),
    estimateSupported: item.estimateSupported !== false,
    note: item.note || '',
    ...sfPickupInfo,
    selectedDeviceOptionValues: item.selectedDeviceOptionValues || {},
    selectedDeviceOptionTexts: item.selectedDeviceOptionTexts || {},
    submissionImages: (item.submissionImages || []).map((imageUrl) => resolveBackendAssetUrl(imageUrl)).filter(Boolean),
    status: 'local_pending',
    userResponseStatus: '',
    statusText: '待卖出',
    singleViewStatusText: '待卖出',
    reviewNote: '',
    reviewResponseAvailable: false,
    settlement: null,
    settlementState: '',
    settlementStatusText: buildRecycleSettlementStatusText(null, item.payoutMethodLabel || '微信零钱'),
            settlementCanClaim: false,
            settlementClaimButtonVisible: isWechatRecyclePayoutMethodLabel(item.payoutMethodLabel),
            paymentProofImages: [],
    publishedProductId: 0,
    selected: false,
  }

  recycleItem.selected = resolveRecycleSelectedState(selectedMap, recycleItem)
  return recycleItem
}

const applySfPickupSearchResult = (
  order: RecycleOrderItem,
  pickupOrder: BackendSfPickupSearchResult | null,
): RecycleOrderItem => {
  if (!pickupOrder) {
    return order
  }

  const nextWaybillNo = String(pickupOrder.waybillNo || '').trim() || order.sfWaybillNo
  const nextOrderId = String(pickupOrder.orderId || '').trim() || order.sfPickupOrderId
  const canceled = pickupOrder.canceled === true || order.sfPickupCanceled

  return {
    ...order,
    sfPickupOrderId: nextOrderId,
    sfWaybillNo: nextWaybillNo,
    sfPickupCanceled: canceled,
    statusText: canceled ? buildCanceledPickupStatusText() : order.statusText,
    singleViewStatusText: canceled ? buildCanceledPickupStatusText() : order.singleViewStatusText,
  }
}

const shouldRefreshSfPickupDetail = (order: RecycleOrderItem): boolean => {
  if (!order.sfPickupOrderId) {
    return false
  }

  return !order.sfWaybillNo
    || !order.sfPickupTimeText
    || !order.sfPickupRecipientName
    || !order.sfPickupRecipientPhone
    || !order.sfPickupAddressText
}

const resolvePageTitle = (): string => '我的回收'

const getSelectableCount = (
  data: Pick<OrderPageData, 'buyItems' | 'cartItems' | 'displayedRecycleItems'>,
  currentMode: OrderModeKey,
): number => {
  if (currentMode === 'cart') {
    return data.cartItems.filter((item) => item.selected).length
  }

  if (currentMode === 'buy') {
    return data.buyItems.filter((item) => item.selected).length
  }

  return data.displayedRecycleItems.filter((item) => item.selected).length
}

Page<OrderPageData, OrderPage>({
  data: {
    currentTab: 'order',
    pageTransitionClass: '',
    statusBarHeight: 20,
    currentMode: 'recycle',
    activeOrderMode: 'recycle',
    pageTitle: '我的回收',
    fromMineEntry: false,
    recycleNotice: '选中商品点击确认回收，也可添加多件商品一起回收',
    orderModes: buildOrderModes('recycle'),
    orderModeScrollThumbWidth: 14,
    orderModeScrollThumbLeft: 0,
    orderModeThumbStyle: 'width: 14%; left: 0%;',
    orderModeScrollLeft: 0,
    itemCount: 0,
    emptyText: '暂无订单',
    primaryActionText: '确认回收',
    secondaryActionText: '删除',
    buyItems: [],
    cartItems: [],
    recycleItems: [],
    displayedRecycleItems: [],
    purchaseDetailVisible: false,
    purchaseDetailOrder: null,
    recycleDetailVisible: false,
    recycleDetailOrder: null,
    recycleDetailOptionLines: [],
    pickupDetailVisible: false,
    pickupDetailTitle: '',
    pickupDetailOrderId: '',
    pickupDetailStatusText: '待审核',
    pickupDetailWaybillNo: '',
    pickupDetailPickupTimeText: '',
    pickupDetailRecipientName: '',
    pickupDetailRecipientPhone: '',
    pickupDetailAddressText: '',
    reviewResponseVisible: false,
    reviewResponseOrderId: 0,
    reviewResponseTitle: '',
    reviewResponseReason: '',
    reviewResponseFinalPriceText: '',
    reviewReturnAddressId: 0,
    reviewReturnRecipientName: '',
    reviewReturnRecipientPhone: '',
    reviewReturnAddressText: '',
    reviewReturnAddressReady: false,
    tabs: [
      { key: 'home', text: '首页', path: '/pages/index/index', icon: 'H' },
      { key: 'sorts', text: '分类', path: '/pages/sorts/sorts', icon: 'S' },
      { key: 'order', text: '订单', path: '/pages/order/order', icon: 'O' },
      { key: 'mine', text: '我的', path: '/pages/mine/mine', icon: 'M' },
    ],
  },

  currentPickupDetailOrder: null,
  selectingReviewReturnAddress: false,
  isRecycleOrderActionInProgress: false,
  isRecycleClaimInProgress: false,
  confirmingPurchaseOrderId: 0,
  orderLoadRequestId: 0,
  orderLoadingCount: 0,

  beginOrderLoading(title) {
    this.orderLoadingCount += 1

    if (this.orderLoadingCount !== 1) {
      return
    }

    wx.showLoading({
      title,
      mask: true,
    })
  },

  endOrderLoading() {
    if (this.orderLoadingCount <= 0) {
      return
    }

    this.orderLoadingCount -= 1

    if (this.orderLoadingCount === 0) {
      wx.hideLoading()
    }
  },

  onLoad(options: OrderOptions = {}) {
    const { currentMode, fromMineEntry, activeOrderMode } = resolveOrderView(options.mode, options.source)
    // 从“我的”页面进入任一回收状态时，底部导航始终保持“我的”选中态。
    const currentTab = options.source === 'mine' || options.mode === undefined ? 'mine' : 'order'

    this.setData({
      currentTab,
      statusBarHeight: getStatusBarHeight(),
      currentMode,
      activeOrderMode,
      fromMineEntry,
      pageTitle: resolvePageTitle(),
      orderModes: buildOrderModes(activeOrderMode),
      orderModeScrollLeft: 0,
      cartItems: getCartItems(),
      pickupDetailVisible: false,
    }, () => {
      this.refreshOrderModeScrollIndicator()
    })
    consumeTabEnterTransition(this, currentTab as RootTabKey)

    ensureProductCatalogLoaded(true)
      .then(() => this.loadServerOrders())
      .catch(() => this.loadServerOrders())
  },

  onReady() {
    playTabEnterTransition(this)
    this.refreshOrderModeScrollIndicator()
  },

  onUnload() {
    clearTabTransitionTimer(this)
  },

  onShow() {
    if (this.selectingReviewReturnAddress) {
      this.selectingReviewReturnAddress = false
      this.syncReviewReturnAddress(getCachedAddress())
    }

    ensureProductCatalogLoaded()
      .then(() => this.loadServerOrders())
      .catch(() => this.loadServerOrders())
  },

  onSubpageBack() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/mine/mine',
        })
      },
      delta: 1,
    })
  },

  async loadServerOrders() {
    const orderLoadRequestId = this.orderLoadRequestId + 1
    this.orderLoadRequestId = orderLoadRequestId
    const orderView = {
      currentMode: this.data.currentMode,
      fromMineEntry: this.data.fromMineEntry,
      activeOrderMode: this.data.activeOrderMode,
    }
    const isCurrentLoad = () => (
      orderLoadRequestId === this.orderLoadRequestId
      && this.data.currentMode === orderView.currentMode
      && this.data.fromMineEntry === orderView.fromMineEntry
      && this.data.activeOrderMode === orderView.activeOrderMode
    )
    const cartSelectionMap = new Map(this.data.cartItems.map((item) => [item.addedAt, item.selected]))
    const buySelectionMap = new Map(this.data.buyItems.map((item) => [item.id, item.selected]))
    const recycleSelectionMap = new Map(this.data.recycleItems.map((item) => [getRecycleSelectionKey(item), item.selected]))
    const cartItems = getCartItems(cartSelectionMap)

    const pendingRecycleOrders = orderView.currentMode === 'settlement' || orderView.fromMineEntry
      ? []
      : getPendingRecycleOrders()
    let localPendingRecycleItems = pendingRecycleOrders.map((item) => buildLocalRecycleItem(item, recycleSelectionMap))

    if (!getBackendToken()) {
      if (!isCurrentLoad()) {
        return
      }

      this.setData({
        buyItems: [],
        recycleItems: localPendingRecycleItems,
        displayedRecycleItems: getDisplayedRecycleItems(
          localPendingRecycleItems,
          orderView.currentMode,
          orderView.fromMineEntry,
          orderView.activeOrderMode,
        ),
        cartItems,
      }, () => {
        if (isCurrentLoad()) {
          this.syncOrderState(orderView.currentMode)
        }
      })
      return
    }

    try {
      const orderResults = await Promise.all([
        fetchPurchaseOrders().catch((): BackendPurchaseOrder[] => []),
        fetchRecycleOrders(),
        fetchRecycleProducts().catch((): BackendRecycleProduct[] => []),
      ])
      const purchaseOrders = orderResults[0]
      const initialRecycleOrders = orderResults[1]
      const recycleProducts = orderResults[2]
      const recycleProductDetailIds = orderView.activeOrderMode === 'recycle_approved'
        ? Array.from(new Set(
            initialRecycleOrders
              .filter((order) => ['approved', 'reviewed', 'published'].includes(order.status))
              .map((order) => Number(order.recycleProductId || 0))
              .filter(Boolean),
          ))
        : []
      const recycleProductDetails = await Promise.all(
        recycleProductDetailIds.map((id) => fetchRecycleProductDetail(id).catch(() => null)),
      )

      const recycleProductById = new Map(
        recycleProducts.map((product) => [Number(product.id || 0), product]),
      )
      recycleProductDetails.forEach((product) => {
        if (product?.id) {
          recycleProductById.set(Number(product.id), product)
        }
      })

      const getRecycleOrderCoverImage = (order: Pick<BackendRecycleOrder, 'coverImage' | 'recycleProductId' | 'publishedProductId'>): string => {
        const recycleProduct = recycleProductById.get(Number(order.recycleProductId || 0))
        const linkedProduct = getProductById(Number(recycleProduct?.productId || order.publishedProductId || 0))
        return resolveBackendAssetUrl(
          String(order.coverImage || recycleProduct?.coverImage || linkedProduct?.heroImage || '').trim(),
        )
      }

      localPendingRecycleItems = pendingRecycleOrders.map((item) =>
        buildLocalRecycleItem(
          item,
          recycleSelectionMap,
          getRecycleOrderCoverImage({
            coverImage: item.coverImage,
            recycleProductId: item.recycleProductId || null,
            publishedProductId: null,
          }),
        ),
      )

      let recycleOrders = initialRecycleOrders
      const shouldSyncSettlementStates = orderView.fromMineEntry && orderView.currentMode === 'settlement'
      if (shouldSyncSettlementStates) {
        const syncableOrderIds = initialRecycleOrders
          .filter((order) => ['WAIT_USER_CONFIRM', 'TRANSFERING', 'PROCESSING', 'ACCEPTED', 'CANCELING'].includes(
            String(order.settlement?.state || '').trim().toUpperCase(),
          ))
          .map((order) => order.id)

        if (syncableOrderIds.length) {
          const synchronizedSettlements = await Promise.all(
            syncableOrderIds.map((orderId) => syncRecycleSettlement(orderId).catch(() => null)),
          )
          const settlementByOrderId = new Map(
            synchronizedSettlements
              .filter((settlement): settlement is BackendRecycleSettlement => Boolean(settlement))
              .map((settlement) => [settlement.recycleOrderId, settlement]),
          )

          recycleOrders = initialRecycleOrders.map((order) => ({
            ...order,
            settlement: settlementByOrderId.get(order.id) || order.settlement,
          }))
        }
      }

      const visiblePurchaseOrders = purchaseOrders.filter((order: BackendPurchaseOrder) => (
        orderView.fromMineEntry
          ? isCompletedPurchaseStatus(order.status)
          : isPendingPurchaseStatus(order.status)
      ))

      const buyItems = visiblePurchaseOrders
        .map((order: BackendPurchaseOrder) => {
          const catalogProduct = getProductById(order.productId)
          const product = catalogProduct || buildPurchaseOrderSnapshotProduct(order)

          if (!product) {
            return null
          }

          return {
            id: order.id,
            addedAt: Number(order.createdAt || Date.now()),
            productId: catalogProduct ? order.productId : 0,
            product,
            status: order.status || '',
            statusText: buildPurchaseStatusText(order.status),
            totalAmountText: formatAmountText(Number(order.totalAmount || 0)),
            orderNo: String(order.orderNo || ''),
            merchantOrderNo: String(order.outTradeNo || order.orderNo || ''),
            recipientName: String(order.recipientName || ''),
            recipientPhone: String(order.recipientPhone || ''),
            addressDetail: String(order.addressDetail || ''),
            createdAtText: formatOrderDateText(order.createdAt, order.createdAtRealtime),
            paidAtText: formatOrderDateText(order.paidAt, order.paidAtRealtime),
            shipData: order.shipData || {},
            canConfirmReceipt: orderView.fromMineEntry && order.status === 'paid',
            receiptConfirmed: order.status === 'received',
            selected: resolveSelectedState(buySelectionMap, order.id),
          }
        })
        .filter((item): item is BuyOrderItem => Boolean(item))

      const serverRecycleItems = recycleOrders
        .map((order: BackendRecycleOrder) => {
          const sfPickupInfo = parseSfPickupServiceNote(order.note)
          const canceledPickup = sfPickupInfo.sfPickupCanceled
          const paymentProofImages = order.settlement?.paymentProofImages || []
          const selectedDeviceOptionValues = order.selectedDeviceOptionValues || {}
          const selectedDeviceOptionTexts = restoreCompleteOptionTexts(
            selectedDeviceOptionValues,
            order.selectedDeviceOptionTexts || {},
            recycleProductById.get(Number(order.recycleProductId || 0)),
          )
          const recycleItem: RecycleOrderItem = {
            id: order.id,
            addedAt: Number(order.createdAt || Date.now()),
            source: 'server',
            recycleProductId: order.recycleProductId || 0,
            categoryKey: order.categoryKey || '',
            title: order.title,
            coverLabel: order.coverLabel,
            coverImage: getRecycleOrderCoverImage(order),
            coverTheme: normalizeRecycleTheme(order.coverTheme),
            payoutMethodLabel: order.payoutMethodLabel || '微信零钱',
            accountNumber: order.accountNumber || '',
            realName: order.realName || '未填写',
            optionSummary: order.optionSummary || '已提交回收信息',
            finalPriceText: formatAmountText(Number(order.estimateFinalPrice || 0)),
            estimateBasePrice: Number(order.estimateBasePrice || 0),
            estimateFinalPrice: Number(order.estimateFinalPrice || 0),
            estimateSupported: order.estimateSupported !== false,
            note: order.note || '',
            ...sfPickupInfo,
            selectedDeviceOptionValues,
            selectedDeviceOptionTexts,
            submissionImages: order.submissionImages || [],
            status: order.status || '',
            statusText: canceledPickup
              ? buildCanceledPickupStatusText()
              : buildRecycleStatusText(order.status, order.userResponseStatus),
            singleViewStatusText: canceledPickup
              ? buildCanceledPickupStatusText()
              : (orderView.fromMineEntry && orderView.currentMode === 'recycle'
                ? '已卖出'
                : buildRecycleSingleViewStatusText(order.status, order.userResponseStatus)),
            userResponseStatus: order.userResponseStatus || '',
            reviewNote: order.reviewNote || '',
            reviewResponseAvailable: order.status === 'needs_fix' && !orderView.fromMineEntry && !order.userResponseStatus,
            settlement: order.settlement || null,
            settlementState: String(order.settlement?.state || '').trim().toUpperCase(),
            settlementStatusText: buildRecycleSettlementStatusText(order.settlement || null, order.payoutMethodLabel || ''),
            settlementCanClaim: canClaimRecycleSettlement(order.settlement || null, order.payoutMethodLabel || ''),
            settlementClaimButtonVisible: isWechatRecyclePayoutMethodLabel(order.payoutMethodLabel),
            paymentProofImages: Array.isArray(paymentProofImages)
              ? paymentProofImages.map((imageUrl) => resolveBackendAssetUrl(String(imageUrl || '').trim())).filter(Boolean)
              : [],
            productSnapshot: order.productSnapshot || null,
            publishedProductId: order.publishedProductId
              || recycleProductById.get(Number(order.recycleProductId || 0))?.productId
              || 0,
            selected: false,
          }

          recycleItem.selected = resolveRecycleSelectedState(recycleSelectionMap, recycleItem)
          return recycleItem
        })

      const nextRecycleItems = orderView.fromMineEntry
        ? serverRecycleItems
        : [...localPendingRecycleItems, ...serverRecycleItems]

      if (!isCurrentLoad()) {
        return
      }

      this.setData({
        buyItems,
        recycleItems: nextRecycleItems,
        displayedRecycleItems: getDisplayedRecycleItems(
          nextRecycleItems,
          orderView.currentMode,
          orderView.fromMineEntry,
          orderView.activeOrderMode,
        ),
        cartItems,
      }, () => {
        if (isCurrentLoad()) {
          this.syncOrderState(orderView.currentMode)
        }
      })
    } catch (_error) {
      if (!isCurrentLoad()) {
        return
      }

      this.setData({
        buyItems: [],
        recycleItems: localPendingRecycleItems,
        displayedRecycleItems: getDisplayedRecycleItems(
          localPendingRecycleItems,
          orderView.currentMode,
          orderView.fromMineEntry,
          orderView.activeOrderMode,
        ),
        cartItems,
      }, () => {
        if (isCurrentLoad()) {
          this.syncOrderState(orderView.currentMode)
        }
      })
    }
  },

  syncOrderState(currentMode) {
    const { buyItems, cartItems, recycleItems, fromMineEntry } = this.data
    const activeOrderMode = !fromMineEntry && isRecycleStatusMode(this.data.activeOrderMode)
      ? this.data.activeOrderMode
      : (fromMineEntry && currentMode === 'recycle' && this.data.activeOrderMode === 'sold'
        ? 'sold'
        : getActiveOrderMode(currentMode, fromMineEntry))
    const displayedRecycleItems = getDisplayedRecycleItems(recycleItems, currentMode, fromMineEntry, activeOrderMode)

    this.setData({
      currentMode,
      activeOrderMode,
      pageTitle: resolvePageTitle(),
      orderModes: buildOrderModes(activeOrderMode),
      displayedRecycleItems,
      itemCount: getSelectableCount({ buyItems, cartItems, displayedRecycleItems }, currentMode),
      emptyText:
        activeOrderMode === 'recycle_reviewing'
          ? '暂时没有待检测的回收订单'
          : activeOrderMode === 'recycle_rejected'
            ? '暂时没有异常回收订单'
            : activeOrderMode === 'recycle_approved'
              ? '暂时没有已通过的回收订单'
              : activeOrderMode === 'settlement'
                ? '暂时没有待收款的回收订单'
                : activeOrderMode === 'sold'
                  ? '暂时没有已卖出的回收订单'
                  : '暂时没有待卖出的回收订单',
      primaryActionText: activeOrderMode === 'recycle'
        ? '确认回收'
        : (currentMode === 'buy' ? '去支付' : '结算'),
      secondaryActionText: '删除',
    }, () => {
      this.refreshOrderModeScrollIndicator()
    })
  },

  removeSettledRecycleOrder(orderId) {
    const recycleItems = this.data.recycleItems.filter((item) => (
      item.source !== 'server' || item.id !== orderId
    ))

    this.setData({ recycleItems }, () => {
      this.syncOrderState(this.data.currentMode)
    })
  },

  onOrderModeTap(event) {
    const { key } = event.currentTarget.dataset

    if (!key || key === this.data.activeOrderMode) {
      return
    }

    // Invalidate an in-flight load before the mode update reaches the view.
    this.orderLoadRequestId += 1
    const orderView = resolveOrderView(key)
    this.setData({
      currentMode: orderView.currentMode,
      activeOrderMode: orderView.activeOrderMode,
      fromMineEntry: orderView.fromMineEntry,
      displayedRecycleItems: [],
      itemCount: 0,
      purchaseDetailVisible: false,
      purchaseDetailOrder: null,
      recycleDetailVisible: false,
      recycleDetailOrder: null,
      recycleDetailOptionLines: [],
      pickupDetailVisible: false,
    }, () => {
      this.loadServerOrders().catch(() => {})
    })
  },

  onOrderModeScroll(event) {
    const viewportWidth = this.orderModeViewportWidth || 0
    this.orderModeContentWidth = event.detail.scrollWidth

    if (!viewportWidth) {
      this.refreshOrderModeScrollIndicator()
      return
    }

    this.setData({
      orderModeScrollLeft: event.detail.scrollLeft,
      ...buildOrderModeScrollIndicator(
        event.detail.scrollLeft,
        event.detail.scrollWidth,
        viewportWidth,
      ),
    })
  },

  refreshOrderModeScrollIndicator() {
    const query = wx.createSelectorQuery()
    query.select('.order-mode-scroll').boundingClientRect()
    query.select('.order-mode-list').boundingClientRect()
    query.select('.order-mode-progress').boundingClientRect()
    query.select('.order-mode-item-active').boundingClientRect()
    query.exec((rects) => {
      const viewportRect = rects[0] as { left?: number; width?: number } | null
      const contentRect = rects[1] as { width?: number } | null
      const trackRect = rects[2] as { left?: number; width?: number } | null
      const activeItemRect = rects[3] as { left?: number; width?: number } | null
      const viewportWidth = Number(viewportRect?.width || 0)
      const contentWidth = Number(contentRect?.width || 0)

      this.orderModeViewportWidth = viewportWidth
      this.orderModeContentWidth = contentWidth
      this.orderModeProgressTrackLeft = Number(trackRect?.left || 0)
      this.orderModeProgressTrackWidth = Number(trackRect?.width || 0)

      const activeItemCenter = Number(activeItemRect?.left || 0) + Number(activeItemRect?.width || 0) / 2
      const viewportCenter = Number(viewportRect?.left || 0) + viewportWidth / 2
      const activeItemOffset = activeItemRect ? activeItemCenter - viewportCenter : 0
      const maxScrollLeft = Math.max(0, contentWidth - viewportWidth)
      const targetScrollLeft = Math.max(
        0,
        Math.min(maxScrollLeft, Number(this.data.orderModeScrollLeft || 0) + activeItemOffset),
      )

      this.setData({
        orderModeScrollLeft: targetScrollLeft,
        ...buildOrderModeScrollIndicator(targetScrollLeft, contentWidth, viewportWidth),
      })
    })
  },

  onOrderModeProgressTouchStart(event) {
    this.orderModeProgressDragging = true
    this.onOrderModeProgressTouchMove(event)
  },

  onOrderModeProgressTouchMove(event) {
    if (!this.orderModeProgressDragging) {
      return
    }

    const touch = event.touches[0]
    const trackLeft = this.orderModeProgressTrackLeft || 0
    const trackWidth = this.orderModeProgressTrackWidth || 0
    const viewportWidth = this.orderModeViewportWidth || 0
    const contentWidth = this.orderModeContentWidth || 0

    if (!touch || !trackWidth || !viewportWidth || contentWidth <= viewportWidth) {
      return
    }

    const thumbWidth = trackWidth * this.data.orderModeScrollThumbWidth / 100
    const maxThumbLeft = Math.max(trackWidth - thumbWidth, 0)
    const targetThumbLeft = Math.max(
      0,
      Math.min(maxThumbLeft, touch.clientX - trackLeft - thumbWidth / 2),
    )
    const maxScrollLeft = contentWidth - viewportWidth
    const scrollLeft = maxThumbLeft > 0
      ? (targetThumbLeft / maxThumbLeft) * maxScrollLeft
      : 0

    this.setData({
      orderModeScrollLeft: scrollLeft,
      ...buildOrderModeScrollIndicator(scrollLeft, contentWidth, viewportWidth),
    })
  },

  onOrderModeProgressTouchEnd() {
    this.orderModeProgressDragging = false
  },

  onBuyItemTap(event) {
    if (this.data.fromMineEntry) {
      const orderId = Number(event.currentTarget.dataset.orderId)
      const targetOrder = this.data.buyItems.find((item) => item.id === orderId)

      if (!targetOrder) {
        return
      }

      this.setData({
        purchaseDetailVisible: true,
        purchaseDetailOrder: targetOrder,
      })
      return
    }

    const productId = Number(event.currentTarget.dataset.productId)

    if (!productId) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${productId}`,
    })
  },

  onBuyDeleteTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId)
    const targetOrder = this.data.buyItems.find((item) => item.id === orderId)

    if (!orderId || !targetOrder) {
      return
    }

    const deletePrompt = this.data.fromMineEntry
      ? '确认删除这条已购买订单吗？'
      : '确认删除这条待付款订单吗？'

    wx.showModal({
      title: '提示',
      content: deletePrompt,
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        await deletePurchaseOrder(orderId).catch(() => {})
        await this.loadServerOrders()
      },
    })
  },

  onBuyConfirmReceiptTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId)
    const targetOrder = this.data.buyItems.find((item) => item.id === orderId)

    if (!orderId || !this.data.fromMineEntry || !targetOrder || this.confirmingPurchaseOrderId) {
      return
    }

    if (targetOrder.receiptConfirmed) {
      wx.showToast({
        title: '该订单已确认收货',
        icon: 'none',
      })
      return
    }

    if (!targetOrder.canConfirmReceipt) {
      wx.showToast({
        title: '当前订单暂不能确认收货',
        icon: 'none',
      })
      return
    }

    wx.showModal({
      title: '确认已收到商品？',
      content: '将打开微信官方收货页。只有在官方页面确认收货后，网页端订单状态才会更新；直接返回不会改变订单状态。',
      confirmText: '打开官方页面',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        this.confirmingPurchaseOrderId = orderId
        wx.showLoading({ title: '正在校验', mask: true })

        try {
          const confirmation = await preparePurchaseOrderReceiptConfirmation(orderId)
          wx.hideLoading()
          const confirmationResult = await confirmReceiptWithWechat(confirmation)
          if (confirmationResult === 'returned') {
            return
          }
          wx.showLoading({ title: '正在同步', mask: true })
          await confirmPurchaseOrderReceipt(orderId)
          await this.loadServerOrders()
          wx.hideLoading()
          wx.showToast({
            title: '已确认收货',
            icon: 'success',
          })
        } catch (error) {
          wx.hideLoading()
          wx.showToast({
            title: error instanceof Error ? error.message : '确认收货失败',
            icon: 'none',
          })
        } finally {
          this.confirmingPurchaseOrderId = 0
        }
      },
    })
  },

  onBuySelectTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId)

    if (!orderId) {
      return
    }

    this.setData({
      buyItems: this.data.buyItems.map((item) => (
        item.id === orderId
          ? {
              ...item,
              selected: !item.selected,
            }
          : item
      )),
    })
    this.syncOrderState(this.data.currentMode)
  },

  onCartItemTap(event) {
    const productId = Number(event.currentTarget.dataset.productId)

    if (!productId) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${productId}`,
    })
  },

  onCartDeleteTap(event) {
    const addedAt = Number(event.currentTarget.dataset.addedAt)

    if (!addedAt) {
      return
    }

    wx.showModal({
      title: '提示',
      content: '确认删除这件购物车商品吗？',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        removeCartProduct(addedAt)
        this.setData({
          cartItems: this.data.cartItems.filter((item) => item.addedAt !== addedAt),
        })
        this.syncOrderState(this.data.currentMode)
      },
    })
  },

  onCartSelectTap(event) {
    const addedAt = Number(event.currentTarget.dataset.addedAt)

    if (!addedAt || this.data.fromMineEntry) {
      return
    }

    this.setData({
      cartItems: this.data.cartItems.map((item) => (
        item.addedAt === addedAt
          ? {
              ...item,
              selected: !item.selected,
            }
          : item
      )),
    })
    this.syncOrderState(this.data.currentMode)
  },

  onRecycleItemTap(event) {
    const publishedProductId = Number(event.currentTarget.dataset.publishedProductId)
    const orderId = Number(event.currentTarget.dataset.orderId || 0)
    const source = (event.currentTarget.dataset.source || 'server') as RecycleItemSource
    const selectedOrder = this.data.recycleItems.find((item) => item.id === orderId && item.source === source)
    const hasProductSnapshot = Boolean(
      selectedOrder?.productSnapshot?.title
      || (
        selectedOrder?.source === 'server'
        && ['approved', 'reviewed', 'published'].includes(selectedOrder.status)
        && selectedOrder.title
      ),
    )

    if (selectedOrder && selectedOrder.reviewResponseAvailable) {
      this.syncReviewReturnAddress(getCachedAddress())
      this.setData({
        reviewResponseVisible: true,
        reviewResponseOrderId: selectedOrder.id,
        reviewResponseTitle: selectedOrder.title,
        reviewResponseReason: selectedOrder.reviewNote || '审核发现填写信息与实物不一致，请确认最终报价。',
        reviewResponseFinalPriceText: selectedOrder.finalPriceText,
      })
      return
    }

    if (selectedOrder?.source === 'server' && this.data.activeOrderMode === 'recycle_approved') {
      this.setData({
        recycleDetailVisible: true,
        recycleDetailOrder: selectedOrder,
        recycleDetailOptionLines: buildRecycleDetailOptionLines(selectedOrder),
      })
      return
    }

    if (
      selectedOrder
      && selectedOrder.source === 'server'
      && selectedOrder.isSfPickup
      && (this.data.fromMineEntry || Number(selectedOrder.publishedProductId || 0) <= 0)
    ) {
      const openModal = (order: RecycleOrderItem) => {
        this.currentPickupDetailOrder = order
        this.setData({
          pickupDetailVisible: true,
          pickupDetailTitle: order.title,
          pickupDetailStatusText: order.sfPickupCanceled ? buildCanceledPickupStatusText() : order.statusText,
          pickupDetailOrderId: order.sfPickupOrderId,
          pickupDetailWaybillNo: order.sfWaybillNo,
          pickupDetailPickupTimeText: order.sfPickupTimeText,
          pickupDetailRecipientName: order.sfPickupRecipientName,
          pickupDetailRecipientPhone: order.sfPickupRecipientPhone,
          pickupDetailAddressText: order.sfPickupAddressText,
        })
      }

      openModal(selectedOrder)

      if (shouldRefreshSfPickupDetail(selectedOrder)) {
        searchSfPickupOrderResult(selectedOrder.id)
          .then(({ pickupOrder }) => {
            if (!pickupOrder) {
              return
            }

            const nextOrder = applySfPickupSearchResult(selectedOrder, pickupOrder)
            this.currentPickupDetailOrder = nextOrder
            this.setData({
              recycleItems: this.data.recycleItems.map((item) => (
                item.id === nextOrder.id && item.source === nextOrder.source ? nextOrder : item
              )),
              pickupDetailStatusText: nextOrder.sfPickupCanceled ? buildCanceledPickupStatusText() : nextOrder.statusText,
              pickupDetailOrderId: nextOrder.sfPickupOrderId,
              pickupDetailWaybillNo: nextOrder.sfWaybillNo,
            })
          })
          .catch(() => {})
      }

      return
    }

    if (!publishedProductId && !hasProductSnapshot) {
      if (selectedOrder?.source === 'server' && selectedOrder.status === 'submitted') {
        wx.showToast({
          title: '回收订单已提交，请等待检测',
          icon: 'none',
        })
        return
      }

      if (
        selectedOrder?.source === 'server'
        && ['approved', 'reviewed', 'published'].includes(selectedOrder.status)
      ) {
        this.setData({
          recycleDetailVisible: true,
          recycleDetailOrder: selectedOrder,
          recycleDetailOptionLines: buildRecycleDetailOptionLines(selectedOrder),
        })
        return
      }

      wx.showToast({
        title: '请先进行结算',
        icon: 'none',
      })
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${publishedProductId}&recycleOrderId=${orderId}`,
    })
  },

  onRecycleDeleteActionTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId)
    const source = (event.currentTarget.dataset.source || 'server') as RecycleItemSource

    if (this.isRecycleOrderActionInProgress || !orderId) {
      return
    }

    wx.showModal({
      title: '提示',
      content: '确认删除这条订单吗？',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        this.isRecycleOrderActionInProgress = true
        this.beginOrderLoading('\u6b63\u5728\u5220\u9664')
        let orderLoadingEnded = false
        const finishOrderLoading = () => {
          if (orderLoadingEnded) {
            return
          }

          orderLoadingEnded = true
          this.endOrderLoading()
        }

        try {
          this.setData({
            recycleItems: this.data.recycleItems.filter((item) => (
              item.id !== orderId || item.source !== source
            )),
          }, () => this.syncOrderState(this.data.currentMode))

          if (source === 'local') {
            removePendingRecycleProduct(orderId)
          } else {
            await deleteRecycleOrder(orderId)
          }

          await this.loadServerOrders()
          finishOrderLoading()
          wx.showToast({
            title: '\u5df2\u5220\u9664',
            icon: 'success',
          })
        } catch (error) {
          finishOrderLoading()

          if (isMissingRecycleOrderInfoError(error)) {
            removePendingRecycleProduct(orderId)

            if (source === 'server') {
              try {
                await deleteRecycleOrder(orderId, true)
                await this.loadServerOrders()
              } catch (_cleanupError) {
                // The stale row is already removed from the page; do not restore it from a failed refresh.
              }
            }

            this.currentPickupDetailOrder = null
            wx.showToast({
              title: '\u5df2\u6e05\u7406',
              icon: 'success',
            })
            return
          }

          await this.loadServerOrders().catch(() => {})
          wx.showToast({
            title: getOrderActionErrorMessage(error, '\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'),
            icon: 'none',
          })
        } finally {
          finishOrderLoading()
          this.isRecycleOrderActionInProgress = false
        }
      },
    })
  },

  onRecycleSelectTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId)
    const source = (event.currentTarget.dataset.source || 'server') as RecycleItemSource

    if (!orderId || source !== 'local' || this.data.fromMineEntry || this.data.currentMode === 'settlement') {
      return
    }

    this.setData({
      recycleItems: this.data.recycleItems.map((item) => (
        item.id === orderId && item.source === source
          ? {
              ...item,
              selected: !item.selected,
            }
          : item
      )),
    })
    this.syncOrderState(this.data.currentMode)
  },

  async onRecycleCancelActionTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId || 0)
    const targetOrder = this.data.displayedRecycleItems.find((item) => item.id === orderId && item.source === 'server')
      || this.data.recycleItems.find((item) => item.id === orderId && item.source === 'server')

    if (this.isRecycleOrderActionInProgress || !orderId) {
      return
    }

    if (targetOrder && (!targetOrder.isSfPickup || targetOrder.sfPickupCanceled)) {
      return
    }

    wx.showModal({
      title: '提示',
      content: '确认取消这条顺丰上门取件吗？',
      confirmText: '取消取件',
      cancelText: '关闭',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        this.isRecycleOrderActionInProgress = true
        this.beginOrderLoading('\u6b63\u5728\u53d6\u6d88')
        let orderLoadingEnded = false
        const finishOrderLoading = () => {
          if (orderLoadingEnded) {
            return
          }

          orderLoadingEnded = true
          this.endOrderLoading()
        }

        try {
          const { pickupOrder } = await cancelSfPickupOrder(orderId)
          if (targetOrder) {
            const nextOrder = applySfPickupSearchResult(targetOrder, {
              orderId: targetOrder.sfPickupOrderId,
              waybillNo: targetOrder.sfWaybillNo,
              canceled: true,
              ...(pickupOrder || {}),
            })

            this.setData({
              recycleItems: this.data.recycleItems.map((item) => (
                item.id === nextOrder.id && item.source === nextOrder.source ? nextOrder : item
              )),
            })

            if (this.currentPickupDetailOrder && this.currentPickupDetailOrder.id === nextOrder.id) {
              this.currentPickupDetailOrder = nextOrder
              this.setData({
                pickupDetailStatusText: buildCanceledPickupStatusText(),
                pickupDetailOrderId: nextOrder.sfPickupOrderId,
                pickupDetailWaybillNo: nextOrder.sfWaybillNo,
              })
            }
          }

          if (targetOrder) {
            this.setData({
              recycleItems: this.data.recycleItems.filter((item) => (
                item.id !== targetOrder.id || item.source !== targetOrder.source
              )),
              pickupDetailVisible: false,
            }, () => this.syncOrderState(this.data.currentMode))
          }

          await this.loadServerOrders()
          finishOrderLoading()

          wx.showToast({
            title: '已取消取件',
            icon: 'success',
          })
        } catch (error) {
          finishOrderLoading()

          if (isMissingRecycleOrderInfoError(error)) {
            removePendingRecycleProduct(orderId)
            this.currentPickupDetailOrder = null
            this.setData({
              recycleItems: this.data.recycleItems.filter((item) => item.id !== orderId),
              pickupDetailVisible: false,
            }, () => this.syncOrderState(this.data.currentMode))

            try {
              await deleteRecycleOrder(orderId, true)
              await this.loadServerOrders()
            } catch (_cleanupError) {
              // Keep the stale row hidden when the cleanup request itself cannot reach the server.
            }

            wx.showToast({
              title: '\u5df2\u6e05\u7406',
              icon: 'success',
            })
            return
          }

          wx.showToast({
            title: error instanceof Error ? error.message : '取消取件失败',
            icon: 'none',
          })
        } finally {
          finishOrderLoading()
          this.isRecycleOrderActionInProgress = false
        }
      },
    })
  },

  syncReviewReturnAddress(address = null) {
    const addressText = address ? formatReturnAddressText(address) : ''
    const isReady = Boolean(
      address
      && Number(address.id || 0) > 0
      && address.recipientName.trim()
      && /^1\d{10}$/.test(address.recipientPhone.trim())
      && addressText,
    )

    this.setData({
      reviewReturnAddressId: isReady ? Number(address?.id || 0) : 0,
      reviewReturnRecipientName: isReady ? String(address?.recipientName || '').trim() : '',
      reviewReturnRecipientPhone: isReady ? String(address?.recipientPhone || '').trim() : '',
      reviewReturnAddressText: isReady ? addressText : '',
      reviewReturnAddressReady: isReady,
    })
  },

  onChooseReviewReturnAddress() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    this.selectingReviewReturnAddress = true
    wx.navigateTo({
      url: '/pages/address-form/address-form?mode=picker',
      fail: () => {
        this.selectingReviewReturnAddress = false
        wx.showToast({ title: '地址簿打开失败，请重试', icon: 'none' })
      },
    })
  },

  onCopyWaybillTap(event) {
    const waybillNo = String(event.currentTarget.dataset.waybillNo || '').trim()

    if (!waybillNo) {
      wx.showToast({
        title: '暂无运单号',
        icon: 'none',
      })
      return
    }

    wx.setClipboardData({
      data: waybillNo,
    })
  },

  closePickupDetail() {
    this.currentPickupDetailOrder = null
    this.setData({
      pickupDetailVisible: false,
    })
  },

  closePurchaseDetail() {
    this.setData({
      purchaseDetailVisible: false,
      purchaseDetailOrder: null,
    })
  },

  closeRecycleDetail() {
    this.setData({
      recycleDetailVisible: false,
      recycleDetailOrder: null,
      recycleDetailOptionLines: [],
    })
  },

  closeReviewResponse() {
    this.selectingReviewReturnAddress = false
    this.setData({ reviewResponseVisible: false, reviewResponseOrderId: 0 })
  },

  onPickupDetailCopyTap(event) {
    const value = String(event.currentTarget.dataset.value || '').trim()
    const label = String(event.currentTarget.dataset.label || '内容').trim()

    if (!value) {
      wx.showToast({
        title: `暂无${label}`,
        icon: 'none',
      })
      return
    }

    wx.setClipboardData({
      data: value,
    })
  },

  stopPickupDetailTap() {},

  async onCheckoutTap() {
    const localProfile = wx.getStorageSync(STORAGE_KEY) as Record<string, unknown> | undefined

    if (!localProfile) {
      redirectToMineLogin()
      return
    }

    if (this.data.currentMode === 'cart') {
      const selectedItems = this.data.cartItems.filter((item) => item.selected)

      if (!selectedItems.length) {
        wx.showToast({
          title: '请先勾选要结算的商品',
          icon: 'none',
        })
        return
      }

      wx.navigateTo({
        url: `/pages/buying-checkout/buying-checkout?mode=cart&items=${selectedItems.map((item) => item.addedAt).join(',')}`,
      })
      return
    }

    if (this.data.currentMode === 'buy') {
      const selectedItems = this.data.buyItems.filter((item) => item.selected)

      if (!selectedItems.length) {
        wx.showToast({
          title: '请先勾选要支付的订单',
          icon: 'none',
        })
        return
      }

      const pendingOrderIds = selectedItems
        .filter((item) => item.status !== 'paid')
        .map((item) => item.id)

      if (!pendingOrderIds.length) {
        wx.showToast({
          title: '所选订单中没有待付款商品',
          icon: 'none',
        })
        return
      }

      wx.navigateTo({
        url: `/pages/buying-checkout/buying-checkout?mode=buy&orders=${pendingOrderIds.join(',')}`,
      })
      return
    }

    const selectedRecycleItems = this.data.recycleItems.filter((item) => (
      item.source === 'local' && item.selected
    ))

    if (!selectedRecycleItems.length) {
      wx.showToast({
        title: '请先勾选要提交的回收单',
        icon: 'none',
      })
      return
    }

    const unsupportedItem = selectedRecycleItems.find((item) => !item.estimateSupported)
    if (unsupportedItem) {
      wx.showToast({
        title: unsupportedItem.note || '存在暂不支持提交的回收商品',
        icon: 'none',
      })
      return
    }

    wx.navigateTo({
      url: `/pages/pickup-service/pickup-service?tab=pickup&items=${selectedRecycleItems.map((item) => item.id).join(',')}`,
    })
  },

  async onClearTap() {
    if (this.data.currentMode === 'cart') {
      const selectedItems = this.data.cartItems.filter((item) => item.selected)

      if (!selectedItems.length) {
        wx.showToast({
          title: '请先勾选要删除的商品',
          icon: 'none',
        })
        return
      }

      wx.showModal({
        title: '提示',
        content: `确认删除已勾选的 ${selectedItems.length} 件商品吗？`,
        confirmText: '删除',
        cancelText: '取消',
        confirmColor: '#e62222',
        success: (res) => {
          if (!res.confirm) {
            return
          }

          removeCartProducts(selectedItems.map((item) => item.addedAt))
          this.setData({
            cartItems: this.data.cartItems.filter((item) => !item.selected),
          })
          this.syncOrderState(this.data.currentMode)
        },
      })
      return
    }

    if (this.data.currentMode === 'buy') {
      const selectedItems = this.data.buyItems.filter((item) => item.selected)

      if (!selectedItems.length) {
        wx.showToast({
          title: '请先勾选要删除的订单',
          icon: 'none',
        })
        return
      }

      const orderIds = selectedItems.map((item) => item.id)

      wx.showModal({
        title: '提示',
        content: `确认删除已勾选的 ${orderIds.length} 条订单吗？`,
        confirmText: '删除',
        cancelText: '取消',
        confirmColor: '#e62222',
        success: async (res) => {
          if (!res.confirm) {
            return
          }

          await Promise.all(orderIds.map((orderId) => deletePurchaseOrder(orderId).catch(() => null)))
          await this.loadServerOrders()
        },
      })
      return
    }

    const selectedItems = this.data.displayedRecycleItems.filter((item) => item.selected)

    if (!selectedItems.length) {
      wx.showToast({
        title: '请先勾选要删除的订单',
        icon: 'none',
      })
      return
    }

    const localPendingIds = selectedItems
      .filter((item) => item.source === 'local')
      .map((item) => item.id)
    const serverOrderIds = selectedItems
      .filter((item) => item.source === 'server')
      .map((item) => item.id)

    wx.showModal({
      title: '提示',
      content: `确认删除已勾选的 ${selectedItems.length} 条订单吗？`,
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        if (this.isRecycleOrderActionInProgress) {
          return
        }

        this.isRecycleOrderActionInProgress = true
        this.beginOrderLoading('\u6b63\u5728\u5220\u9664')
        let orderLoadingEnded = false
        const finishOrderLoading = () => {
          if (orderLoadingEnded) {
            return
          }

          orderLoadingEnded = true
          this.endOrderLoading()
        }

        try {
          if (localPendingIds.length) {
            removePendingRecycleProducts(localPendingIds)
          }

          const failedErrors: unknown[] = []
          for (const orderId of serverOrderIds) {
            try {
              await deleteRecycleOrder(orderId)
            } catch (error) {
              failedErrors.push(error)
            }
          }
          const firstError = failedErrors[0]

          await this.loadServerOrders()

          if (firstError) {
            finishOrderLoading()
            wx.showToast({
              title: getOrderActionErrorMessage(firstError, '\u90e8\u5206\u8ba2\u5355\u5220\u9664\u5931\u8d25'),
              icon: 'none',
            })
            return
          }

          finishOrderLoading()
          wx.showToast({
            title: '\u5df2\u5220\u9664',
            icon: 'success',
          })
        } finally {
          finishOrderLoading()
          this.isRecycleOrderActionInProgress = false
        }
      },
    })
  },

  async onRecycleClaimTap(event) {
    const orderId = Number(event.currentTarget.dataset.orderId || 0)
    const targetOrder = this.data.displayedRecycleItems.find((item) => item.id === orderId && item.source === 'server')

    if (this.isRecycleClaimInProgress || !orderId || !this.data.fromMineEntry || !targetOrder || !targetOrder.settlement) {
      return
    }

    if (!targetOrder.settlementCanClaim) {
      wx.showToast({
        title: targetOrder.settlementStatusText || '\u5f53\u524d\u6682\u4e0d\u80fd\u9886\u53d6',
        icon: 'none',
      })
      return
    }

    this.isRecycleClaimInProgress = true
    wx.showModal({
      title: '\u63d0\u793a',
      content: '\u786e\u8ba4\u9886\u53d6\u8fd9\u7b14\u56de\u6536\u6b3e\u5417\uff1f\u786e\u8ba4\u540e\u4f1a\u5524\u8d77\u5fae\u4fe1\u6536\u6b3e\u9875\u9762\u3002',
      confirmText: '\u9886\u53d6\u8d44\u91d1',
      cancelText: '\u53d6\u6d88',
      success: async (res) => {
        if (!res.confirm) {
          this.isRecycleClaimInProgress = false
          return
        }

        this.beginOrderLoading('\u6b63\u5728\u5524\u8d77')
        let orderLoadingEnded = false
        const finishOrderLoading = () => {
          if (orderLoadingEnded) {
            return
          }

          orderLoadingEnded = true
          this.endOrderLoading()
        }

        try {
          const nextSettlement = await claimPendingRecycleSettlement(orderId)
          const nextState = String(nextSettlement?.state || '').trim().toUpperCase()
          if (nextState === 'SUCCESS') {
            this.removeSettledRecycleOrder(orderId)
          } else {
            await this.loadServerOrders()
          }

          const toastTitle = nextState === 'SUCCESS'
            ? '\u6536\u6b3e\u6210\u529f'
            : nextState === 'TRANSFERING' || nextState === 'PROCESSING' || nextState === 'ACCEPTED'
              ? '\u8f6c\u8d26\u5904\u7406\u4e2d'
              : '\u5df2\u53d1\u8d77\u9886\u53d6'

          finishOrderLoading()
          wx.showToast({
            title: toastTitle,
            icon: nextState === 'SUCCESS' ? 'success' : 'none',
          })
        } catch (error) {
          finishOrderLoading()
          wx.showToast({
            title: error instanceof Error ? error.message : '\u9886\u53d6\u8d44\u91d1\u5931\u8d25',
            icon: 'none',
          })
        } finally {
          finishOrderLoading()
          this.isRecycleClaimInProgress = false
        }
      },
      fail: () => {
        this.isRecycleClaimInProgress = false
      },
    })
  },

  async onRecycleReviewAcceptTap(event: RecycleReviewResponseTapEvent) {
    const orderId = Number(event.currentTarget.dataset.orderId || 0)
    if (this.isRecycleOrderActionInProgress || !orderId) {
      return
    }

    wx.showModal({
      title: '接受最终报价',
      content: '确认接受当前最终报价吗？确认后平台将继续处理该回收单。',
      confirmText: '接受',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        this.isRecycleOrderActionInProgress = true
        this.beginOrderLoading('正在确认')
        try {
          await respondToRecycleReview(orderId, 'accept')
          this.setData({ reviewResponseVisible: false })
          await this.loadServerOrders()
          this.endOrderLoading()
          wx.showToast({ title: '已接受最终报价', icon: 'success' })
        } catch (error) {
          this.endOrderLoading()
          wx.showToast({ title: getOrderActionErrorMessage(error, '确认失败，请重试'), icon: 'none' })
        } finally {
          this.endOrderLoading()
          this.isRecycleOrderActionInProgress = false
        }
      },
    })
  },

  async onRecycleReviewTakeBackTap(event: RecycleReviewResponseTapEvent) {
    const orderId = Number(event.currentTarget.dataset.orderId || 0)
    if (this.isRecycleOrderActionInProgress || !orderId) {
      return
    }

    const returnAddressId = Number(this.data.reviewReturnAddressId || 0)
    if (!this.data.reviewReturnAddressReady || !returnAddressId) {
      wx.showToast({ title: '请先选择寄回地址', icon: 'none' })
      this.onChooseReviewReturnAddress()
      return
    }

    wx.showModal({
      title: '拿回产品',
      content: `产品将寄回至：${this.data.reviewReturnRecipientName} ${this.data.reviewReturnAddressText}\n返回运费需由您承担。可添加微信：xm666hs，申请免退回运费。`,
      confirmText: '确认拿回',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        this.isRecycleOrderActionInProgress = true
        this.beginOrderLoading('正在提交')
        try {
          await respondToRecycleReview(orderId, 'take_back', returnAddressId)
          this.setData({ reviewResponseVisible: false })
          await this.loadServerOrders()
          this.endOrderLoading()
          wx.showToast({ title: '已提交拿回申请', icon: 'success' })
        } catch (error) {
          this.endOrderLoading()
          wx.showToast({ title: getOrderActionErrorMessage(error, '提交失败，请重试'), icon: 'none' })
        } finally {
          this.endOrderLoading()
          this.isRecycleOrderActionInProgress = false
        }
      },
    })
  },

  onPaymentProofTap(event: RecyclePaymentProofTapEvent) {
    const orderId = Number(event.currentTarget.dataset.orderId || 0)
    const targetOrder = this.data.recycleItems.find((item) => item.id === orderId && item.source === 'server')
    const paymentProofImages = targetOrder?.paymentProofImages || []

    if (!paymentProofImages.length) {
      return
    }

    wx.previewImage({
      current: paymentProofImages[0],
      urls: paymentProofImages,
    })
  },

  onTabTap(event) {
    const { path, key } = event.currentTarget.dataset

    if (!path || key === this.data.currentTab) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    startSlidingTabSwitch(this, this.data.currentTab as RootTabKey, key as RootTabKey, path)
  },
})
