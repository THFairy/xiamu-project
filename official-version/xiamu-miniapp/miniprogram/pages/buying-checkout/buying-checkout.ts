import { shouldIgnoreRapidBackTap, shouldIgnoreRapidNavigationTap, NavigationTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'
import { ensureProductCatalogLoaded, getProductById, ProductRecord } from '../../data/products'
import { clearCartProducts, getCartItemRecords, removeCartProducts } from '../../utils/cart'
import { createPurchaseOrder, deletePurchaseOrder, ensureBackendSession, fetchPurchaseOrders, updatePurchaseOrderRemark, BackendPurchaseOrder } from '../../utils/backend'
import { getCachedAddress, syncDefaultAddressFromServer, AddressRecord } from '../../utils/address'
import { payPendingPurchaseOrders } from '../../utils/wechat-pay'

interface BackTapGuard {
  backTapLockedUntil?: number
  submitting?: boolean
}

interface PaymentMethodOption {
  label: string
  desc: string
  value: string
}

interface BuyingCheckoutItem {
  orderId?: number
  productId: number
  addedAt: number
  title: string
  subtitle: string
  coverTitle: string
  previewImage: string
  platform: string
  priceText: string
  priceValue: number
  serviceTags: string[]
}

interface BuyingCheckoutData {
  statusBarHeight: number
  pageTitle: string
  sourceMode: 'buy' | 'cart'
  checkoutItems: BuyingCheckoutItem[]
  itemCount: number
  addressId: number
  addressText: string
  addressDetailText: string
  hasAddress: boolean
  remarkTitle: string
  remarkText: string
  sellerText: string
  productAmountText: string
  shippingFeeText: string
  totalAmountText: string
  paymentMethodOptions: PaymentMethodOption[]
  paymentMethodIndex: number
  selectedPaymentLabel: string
  selectedPaymentDesc: string
  isSubmitting: boolean
}

type BuyingCheckoutOptions = {
  mode?: string
  items?: string
  orders?: string
}

type PaymentMethodChangeEvent = WechatMiniprogram.CustomEvent<{
  value: string
}>

interface BuyingCheckoutPage extends BackTapGuard, NavigationTapGuard {
  selectedItemAddedAts: number[]
  selectedOrderIds: number[]
  redirectTimer?: number
  onLoad(options: BuyingCheckoutOptions): void
  onShow(): void
  onUnload(): void
  syncCheckoutState(): Promise<void>
  syncAddressState(): Promise<void>
  onBackTap(): void
  onAddressTap(): void
  onPaymentMethodChange(event: PaymentMethodChangeEvent): void
  onRemarkInput(event: WechatMiniprogram.Input): void
  onSubmitTap(): Promise<void>
}

const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { label: '微信支付', desc: '推荐使用微信完成支付', value: 'wechat' },
]

const parseNumberList = (rawValue?: string): number[] => {
  if (!rawValue) {
    return []
  }

  return Array.from(
    new Set(
      rawValue
        .split(',')
        .map((item) => Number(item))
        .filter((item) => item > 0),
    ),
  )
}

const getPreviewImage = (product: ProductRecord): string => {
  const detailImages = Array.isArray(product.detailImages) ? product.detailImages.filter(Boolean) : []

  if (detailImages.length) {
    return detailImages[0]
  }

  return product.heroImage || ''
}

const buildCheckoutItem = (
  sourceItem: { productId: number; addedAt: number },
  draft?: Partial<Pick<BuyingCheckoutItem, 'orderId' | 'priceValue'>>,
): BuyingCheckoutItem | null => {
  const product = getProductById(sourceItem.productId)

  if (!product) {
    return null
  }

  const fallbackPriceValue = Number(product.price) || 0
  const priceValue = Number(draft?.priceValue ?? fallbackPriceValue) || 0

  return {
    orderId: typeof draft?.orderId === 'number' ? draft.orderId : 0,
    productId: product.id,
    addedAt: sourceItem.addedAt,
    title: product.title,
    subtitle: product.subtitle,
    coverTitle: product.coverTitle,
    previewImage: getPreviewImage(product),
    platform: product.platform,
    priceText: priceValue.toFixed(2),
    priceValue,
    serviceTags: product.featureTags.slice(0, 4),
  }
}

const buildAddressFromOrder = (order?: BackendPurchaseOrder): AddressRecord | null => {
  if (!order || !order.recipientName || !order.recipientPhone || !order.addressDetail) {
    return null
  }

  return {
    id: Number(order.addressId || 0),
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    addressDetail: order.addressDetail,
    province: '',
    city: '',
    district: '',
    postalCode: '',
    longitude: null,
    latitude: null,
    belongToUsername: '',
    belongToUid: '',
    isDefault: true,
  }
}

const applyAddressToPage = (
  page: WechatMiniprogram.Page.Instance<BuyingCheckoutData, BuyingCheckoutPage>,
  address: AddressRecord | null,
) => {
  if (!address) {
    page.setData({
      addressId: 0,
      addressText: '添加收货地址',
      addressDetailText: '点击箭头填写收货地址',
      hasAddress: false,
    })
    return
  }

  page.setData({
    addressId: address.id,
    addressText: address.recipientName,
    addressDetailText: `${address.recipientPhone} ${address.addressDetail}`.trim(),
    hasAddress: true,
  })
}

Page<BuyingCheckoutData, BuyingCheckoutPage>({
  data: {
    statusBarHeight: 20,
    pageTitle: '确认购买',
    sourceMode: 'cart',
    checkoutItems: [],
    itemCount: 0,
    addressId: 0,
    addressText: '添加收货地址',
    addressDetailText: '点击箭头填写收货地址',
    hasAddress: false,
    remarkTitle: '备注',
    remarkText: '',
    sellerText: '第三方卖家',
    productAmountText: '0.00',
    shippingFeeText: '+0.00',
    totalAmountText: '0.00',
    paymentMethodOptions: PAYMENT_METHOD_OPTIONS,
    paymentMethodIndex: 0,
    selectedPaymentLabel: PAYMENT_METHOD_OPTIONS[0].label,
    selectedPaymentDesc: PAYMENT_METHOD_OPTIONS[0].desc,
    isSubmitting: false,
  },

  selectedItemAddedAts: [],
  selectedOrderIds: [],

  onLoad(options: BuyingCheckoutOptions) {
    const sourceMode = options.mode === 'buy' ? 'buy' : 'cart'

    if (sourceMode === 'buy') {
      this.selectedOrderIds = parseNumberList(options.orders || options.items)
      this.selectedItemAddedAts = []
    } else {
      this.selectedItemAddedAts = parseNumberList(options.items)
      this.selectedOrderIds = []
    }

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      sourceMode,
      pageTitle: '确认购买',
    })

    this.syncAddressState().catch(() => {})

    ensureProductCatalogLoaded(true)
      .then(() => this.syncCheckoutState())
      .catch((error) => {
        wx.showToast({
          title: error instanceof Error ? error.message : '商品信息加载失败',
          icon: 'none',
        })
      })
  },

  onShow() {
    this.syncAddressState().catch(() => {})

    ensureProductCatalogLoaded()
      .then(() => this.syncCheckoutState())
      .catch(() => {})
  },

  onUnload() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = 0
    }
  },

  async syncAddressState() {
    applyAddressToPage(this, getCachedAddress())

    try {
      applyAddressToPage(this, await syncDefaultAddressFromServer())
    } catch (_error) {
      // Keep the locally cached address when the server response is delayed.
    }
  },

  async syncCheckoutState() {
    let checkoutItems: BuyingCheckoutItem[] = []

    if (this.data.sourceMode === 'buy') {
      await ensureBackendSession()

      const selectedSet = this.selectedOrderIds.length
        ? new Set(this.selectedOrderIds)
        : null
      const purchaseOrders = await fetchPurchaseOrders()
      const selectedOrders = purchaseOrders.filter((order) => (
        (!selectedSet || selectedSet.has(order.id)) && order.status !== 'paid'
      ))

      checkoutItems = selectedOrders
        .map((order) => buildCheckoutItem(
          {
            productId: order.productId,
            addedAt: Number(order.createdAt || order.id),
          },
          {
            orderId: order.id,
            priceValue: Number(order.totalAmount || 0),
          },
        ))
        .filter((item): item is BuyingCheckoutItem => Boolean(item))

      applyAddressToPage(this, buildAddressFromOrder(selectedOrders[0]))
      this.setData({ remarkText: String(selectedOrders[0]?.remark || '') })
    } else {
      const selectedSet = this.selectedItemAddedAts.length
        ? new Set(this.selectedItemAddedAts)
        : null
      checkoutItems = getCartItemRecords()
        .filter((item) => !selectedSet || selectedSet.has(item.addedAt))
        .map((item) => buildCheckoutItem(item))
        .filter((item): item is BuyingCheckoutItem => Boolean(item))
    }

    const productAmount = checkoutItems.reduce((sum, item) => sum + item.priceValue, 0)
    const shippingFee = 0
    const totalAmount = Math.max(productAmount + shippingFee, 0)

    this.setData({
      checkoutItems,
      itemCount: checkoutItems.length,
      productAmountText: productAmount.toFixed(2),
      shippingFeeText: `+${shippingFee.toFixed(2)}`,
      totalAmountText: totalAmount.toFixed(2),
    })
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: this.data.sourceMode === 'buy'
            ? '/pages/order/order?mode=buy'
            : '/pages/order/order?mode=cart',
        })
      },
    })
  },

  onAddressTap() {
    if (this.data.sourceMode === 'buy') {
      wx.showToast({
        title: '待支付订单沿用原收货地址，需修改请重新下单',
        icon: 'none',
      })
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/address-form/address-form?mode=picker',
    })
  },

  onPaymentMethodChange(event) {
    const nextIndex = Number(event.detail.value)
    const nextOption = PAYMENT_METHOD_OPTIONS[nextIndex]

    if (!nextOption) {
      return
    }

    this.setData({
      paymentMethodIndex: nextIndex,
      selectedPaymentLabel: nextOption.label,
      selectedPaymentDesc: nextOption.desc,
    })
  },

  onRemarkInput(event) {
    this.setData({ remarkText: String(event.detail.value || '').slice(0, 255) })
  },

  async onSubmitTap() {
    if (this.submitting) {
      return
    }

    if (!this.data.itemCount) {
      wx.showToast({
        title: '当前没有可提交商品',
        icon: 'none',
      })
      return
    }

    if (this.data.sourceMode !== 'buy' && !this.data.hasAddress) {
      wx.showToast({
        title: '请先填写收货地址',
        icon: 'none',
      })
      return
    }

    this.submitting = true
    this.setData({ isSubmitting: true })

    try {
      await ensureBackendSession()

      if (this.data.sourceMode === 'buy') {
        const orderIds = this.data.checkoutItems
          .map((item) => Number(item.orderId || 0))
          .filter((orderId) => orderId > 0)

        if (!orderIds.length) {
          throw new Error('当前没有可支付订单')
        }

        await Promise.all(orderIds.map((orderId) => updatePurchaseOrderRemark(orderId, this.data.remarkText)))

        await payPendingPurchaseOrders(orderIds)

        wx.showToast({
          title: '支付成功',
          icon: 'success',
        })

        if (this.redirectTimer) {
          clearTimeout(this.redirectTimer)
        }

        this.redirectTimer = setTimeout(() => {
          this.redirectTimer = 0
          wx.reLaunch({
            url: '/pages/order/order?mode=purchased',
          })
        }, 250) as unknown as number
        return
      }

      const recipientPhone = this.data.addressDetailText.split(' ')[0] || ''
      const addressDetail = this.data.addressDetailText.replace(/^\S+\s*/, '')

      const createdOrders: Array<BackendPurchaseOrder | null> = []
      try {
        for (const item of this.data.checkoutItems) {
          const order = await createPurchaseOrder({
            productId: item.productId,
            addressId: this.data.addressId || undefined,
            sourceMode: this.data.sourceMode,
            recipientName: this.data.addressText,
            recipientPhone,
            addressDetail,
            paymentMethod: 'wechat',
            remark: this.data.remarkText.trim(),
            totalAmount: item.priceValue,
          })
          createdOrders.push(order)
        }
      } catch (error) {
        const createdOrderIds = createdOrders
          .map((order) => Number(order?.id || 0))
          .filter((orderId) => orderId > 0)
        await Promise.all(createdOrderIds.map((orderId) => deletePurchaseOrder(orderId).catch(() => null)))
        throw error
      }

      const orderIds = createdOrders
        .map((order) => Number(order?.id || 0))
        .filter((orderId) => orderId > 0)

      if (!orderIds.length) {
        throw new Error('购物车订单创建失败')
      }

      if (this.selectedItemAddedAts.length) {
        removeCartProducts(this.selectedItemAddedAts)
      } else {
        clearCartProducts()
      }

      await payPendingPurchaseOrders(orderIds)

      wx.showToast({
        title: '支付成功',
        icon: 'success',
      })

      if (this.redirectTimer) {
        clearTimeout(this.redirectTimer)
      }

      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = 0
        wx.reLaunch({
          url: '/pages/order/order?mode=purchased',
        })
      }, 250) as unknown as number
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '支付失败',
        icon: 'none',
      })
    } finally {
      this.submitting = false
      this.setData({ isSubmitting: false })
    }
  },
})
