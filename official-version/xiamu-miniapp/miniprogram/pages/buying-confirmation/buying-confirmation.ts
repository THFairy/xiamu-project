import { shouldIgnoreRapidBackTap } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'
import { ensureProductCatalogLoaded, getProductById, ProductRecord } from '../../data/products'
import { createPurchaseOrder, ensureBackendSession } from '../../utils/backend'
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

interface BuyingConfirmationData {
  statusBarHeight: number
  pageTitle: string
  productId: number
  product?: ProductRecord
  previewImage: string
  isSubmitting: boolean
  serviceTags: string[]
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
}

type BuyingConfirmationOptions = {
  id?: string
}

type PaymentMethodChangeEvent = WechatMiniprogram.CustomEvent<{
  value: string
}>

interface BuyingConfirmationPage extends BackTapGuard {
  redirectTimer?: number
  onLoad(options: BuyingConfirmationOptions): void
  onShow(): void
  onUnload(): void
  syncAddressState(): Promise<void>
  onBackTap(): void
  onAddressTap(): void
  onPreviewImageError(): void
  onPaymentMethodChange(event: PaymentMethodChangeEvent): void
  onRemarkInput(event: WechatMiniprogram.Input): void
  onSubmitTap(): Promise<void>
}

const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { label: '微信支付', desc: '推荐使用微信完成支付', value: 'wechat' },
]

const getPreviewImage = (product?: ProductRecord): string => {
  if (!product) {
    return ''
  }

  const detailImages = Array.isArray(product.detailImages) ? product.detailImages.filter(Boolean) : []
  if (detailImages.length) {
    return detailImages[0]
  }

  return product.heroImage || ''
}

const applyAddressToPage = (
  page: WechatMiniprogram.Page.Instance<BuyingConfirmationData, BuyingConfirmationPage>,
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

const splitAddressDetailText = (value: string): { recipientPhone: string; addressDetail: string } => {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) {
    return {
      recipientPhone: '',
      addressDetail: '',
    }
  }

  const matched = normalizedValue.match(/^(\S+)\s*(.*)$/)
  if (!matched) {
    return {
      recipientPhone: '',
      addressDetail: normalizedValue,
    }
  }

  return {
    recipientPhone: matched[1] || '',
    addressDetail: matched[2] || '',
  }
}

Page<BuyingConfirmationData, BuyingConfirmationPage>({
  data: {
    statusBarHeight: 20,
    pageTitle: '确认购买',
    productId: 0,
    previewImage: '',
    isSubmitting: false,
    serviceTags: [],
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
  },

  onLoad(options: BuyingConfirmationOptions) {
    const productId = Number(options.id || 0)

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      productId,
    })

    this.syncAddressState().catch(() => {})

    ensureProductCatalogLoaded(true)
      .then(() => {
        const product = getProductById(productId)
        const productAmount = product ? Number(product.price || 0) : 0
        const shippingFee = 0
        const totalAmount = Math.max(productAmount + shippingFee, 0)

        this.setData({
          product,
          previewImage: getPreviewImage(product),
          serviceTags: product ? product.featureTags.slice(0, 4) : [],
          productAmountText: productAmount.toFixed(2),
          shippingFeeText: `+${shippingFee.toFixed(2)}`,
          totalAmountText: totalAmount.toFixed(2),
        })
      })
      .catch((error) => {
        wx.showToast({
          title: error instanceof Error ? error.message : '商品信息加载失败',
          icon: 'none',
        })
      })
  },

  onShow() {
    this.syncAddressState().catch(() => {})
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
      // Keep the local cached address when the server is slow.
    }
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/index/index',
        })
      },
    })
  },

  onAddressTap() {
    wx.navigateTo({
      url: '/pages/address-form/address-form?mode=picker',
    })
  },

  onPreviewImageError() {
    if (!this.data.previewImage) {
      return
    }

    this.setData({
      previewImage: '',
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

    if (!this.data.productId || !this.data.product) {
      wx.showToast({
        title: '当前商品不存在',
        icon: 'none',
      })
      return
    }

    if (!this.data.hasAddress) {
      wx.showToast({
        title: '请先填写收货地址',
        icon: 'none',
      })
      return
    }

    this.submitting = true
    this.setData({
      isSubmitting: true,
    })

    try {
      await ensureBackendSession()

      const addressPayload = splitAddressDetailText(this.data.addressDetailText)
      const order = await createPurchaseOrder({
        productId: this.data.productId,
        addressId: this.data.addressId || undefined,
        sourceMode: 'buy',
        recipientName: this.data.addressText,
        recipientPhone: addressPayload.recipientPhone,
        addressDetail: addressPayload.addressDetail,
        paymentMethod: 'wechat',
        remark: this.data.remarkText.trim(),
        totalAmount: Number(this.data.totalAmountText) || 0,
      })

      if (!order?.id) {
        throw new Error('订单创建失败')
      }

      await payPendingPurchaseOrders([order.id])

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
      this.setData({
        isSubmitting: false,
      })
    }
  },
})
