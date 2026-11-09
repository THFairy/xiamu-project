import {
  addPendingRecycleOrders,
  clearRecycleProducts,
  getRecycleProducts,
  RecycleEstimateBreakdownItem,
  RecycleProductRecord,
  removeRecycleProduct,
} from '../../utils/recycle'
import { quoteRecycleProduct } from '../../utils/backend'
import { shouldIgnoreRapidBackTap, BackTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface CheckoutBreakdownItem extends RecycleEstimateBreakdownItem {
  amountText: string
}

interface CheckoutItem {
  addedAt: number
  recycleProductId: number
  categoryKey: string
  title: string
  coverLabel: string
  coverImage: string
  coverTheme: RecycleProductRecord['coverTheme']
  payoutMethodLabel: string
  accountNumber: string
  realName: string
  optionSummary: string
  supported: boolean
  note: string
  baseLabel: string
  basePriceText: string
  accessoryDeductionText: string
  issueDeductionText: string
  finalPriceText: string
  finalPrice: number
  accessoryItems: CheckoutBreakdownItem[]
  issueItems: CheckoutBreakdownItem[]
  selectedDeviceOptionValues: Record<string, string>
  selectedDeviceOptionTexts: Record<string, string>
  submissionImages: string[]
}

interface CheckoutData {
  statusBarHeight: number
  pageTitle: string
  formulaText: string
  helperText: string
  itemCount: number
  totalPriceText: string
  checkoutItems: CheckoutItem[]
}

interface CheckoutPage extends BackTapGuard {
  redirectTimer?: number
  onLoad(): void
  onShow(): void
  onUnload(): void
  syncCheckoutItems(): Promise<void>
  onBackTap(): void
  onPendingTap(): void
  onRemoveItemTap(event: WechatMiniprogram.TouchEvent<{}, {}, { addedAt?: number }>): void
  onSubmitTap(): Promise<void>
}

const formatAmountText = (amount: number): string => `-${Number(amount || 0).toFixed(0)}元`

const formatPriceText = (price: number): string => `${Number(price || 0).toFixed(0)}元`

const mapBreakdownItems = (items: RecycleEstimateBreakdownItem[]): CheckoutBreakdownItem[] => {
  return items.map((item) => ({
    ...item,
    amountText: formatAmountText(item.amount),
  }))
}

const buildUnsupportedCheckoutItem = (
  item: RecycleProductRecord,
  note: string,
): CheckoutItem => {
  return {
    addedAt: item.addedAt,
    recycleProductId: item.recycleProductId || 0,
    categoryKey: item.categoryKey || '',
    title: item.title,
    coverLabel: item.coverLabel,
    coverImage: item.coverImage || '',
    coverTheme: item.coverTheme,
    payoutMethodLabel: item.payoutMethodLabel,
    accountNumber: item.accountNumber,
    realName: item.realName,
    optionSummary: item.optionSummary,
    supported: false,
    note,
    baseLabel: '服务端报价',
    basePriceText: formatPriceText(0),
    accessoryDeductionText: formatAmountText(0),
    issueDeductionText: formatAmountText(0),
    finalPriceText: formatPriceText(0),
    finalPrice: 0,
    accessoryItems: [],
    issueItems: [],
    selectedDeviceOptionValues: item.selectedDeviceOptionValues,
    selectedDeviceOptionTexts: item.selectedDeviceOptionTexts,
    submissionImages: item.submissionImages || [],
  }
}

const buildCheckoutItem = async (item: RecycleProductRecord): Promise<CheckoutItem> => {
  if (!item.recycleProductId) {
    return buildUnsupportedCheckoutItem(item, '当前回收商品缺少服务端配置，请重新选择后再提交。')
  }

  try {
    const { product, quote } = await quoteRecycleProduct({
      recycleProductId: item.recycleProductId,
      selectedDeviceOptionValues: item.selectedDeviceOptionValues,
    })

    if (!quote) {
      return buildUnsupportedCheckoutItem(item, '服务端未返回回收报价，请稍后重试。')
    }

    return {
      addedAt: item.addedAt,
      recycleProductId: item.recycleProductId,
      categoryKey: item.categoryKey || '',
      title: item.title,
      coverLabel: item.coverLabel,
      coverImage: product?.coverImage || item.coverImage || '',
      coverTheme: item.coverTheme,
      payoutMethodLabel: item.payoutMethodLabel,
      accountNumber: item.accountNumber,
      realName: item.realName,
      optionSummary: quote.optionSummary || item.optionSummary,
      supported: quote.supported,
      note: quote.note,
      baseLabel: quote.baseLabel,
      basePriceText: formatPriceText(quote.basePrice),
      accessoryDeductionText: formatAmountText(quote.accessoryDeduction),
      issueDeductionText: formatAmountText(quote.issueDeduction),
      finalPriceText: formatPriceText(quote.finalPrice),
      finalPrice: quote.finalPrice,
      accessoryItems: mapBreakdownItems(quote.accessoryItems),
      issueItems: mapBreakdownItems(quote.issueItems),
      selectedDeviceOptionValues: item.selectedDeviceOptionValues,
      selectedDeviceOptionTexts: quote.selectedDeviceOptionTexts || item.selectedDeviceOptionTexts,
      submissionImages: item.submissionImages || [],
    }
  } catch (error) {
    return buildUnsupportedCheckoutItem(
      item,
      error instanceof Error ? error.message : '服务端实时报价失败，请稍后重试。',
    )
  }
}

Page<CheckoutData, CheckoutPage>({
  data: {
    statusBarHeight: 20,
    pageTitle: '结算',
    formulaText: '回收价格以服务端实时报价结果为准',
    helperText: '提交后会先加入待卖出，请在订单页再提交到网页端。',
    itemCount: 0,
    totalPriceText: '0元',
    checkoutItems: [],
  },

  onLoad() {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })

    this.syncCheckoutItems().catch(() => {})
  },

  onShow() {
    this.syncCheckoutItems().catch(() => {})
  },

  onUnload() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = 0
    }
  },

  async syncCheckoutItems() {
    const recycleItems = getRecycleProducts()
    const checkoutItems = await Promise.all(recycleItems.map((item) => buildCheckoutItem(item)))
    const totalPrice = checkoutItems.reduce((sum, item) => sum + (item.supported ? item.finalPrice : 0), 0)

    this.setData({
      itemCount: checkoutItems.length,
      totalPriceText: formatPriceText(totalPrice),
      checkoutItems,
    })
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/handheld-recycling/handheld-recycling',
        })
      },
    })
  },

  onPendingTap() {
    wx.showToast({
      title: '请先完善回收信息',
      icon: 'none',
    })
  },

  onRemoveItemTap(event) {
    const addedAt = Number(event.currentTarget.dataset.addedAt)

    if (!addedAt) {
      return
    }

    wx.showModal({
      title: '提示',
      content: '确认从结算列表中删除这件回收商品吗？',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        removeRecycleProduct(addedAt)
        this.syncCheckoutItems().catch(() => {})
      },
    })
  },

  async onSubmitTap() {
    if (!this.data.itemCount) {
      wx.showToast({
        title: '当前没有可提交的回收商品',
        icon: 'none',
      })
      return
    }

    const unsupportedItem = this.data.checkoutItems.find((item) => !item.supported)
    if (unsupportedItem) {
      wx.showToast({
        title: unsupportedItem.note || '存在暂不支持提交的回收商品',
        icon: 'none',
      })
      return
    }

    try {
      addPendingRecycleOrders(
        this.data.checkoutItems.map((item) => ({
          recycleProductId: item.recycleProductId || undefined,
          categoryKey: item.categoryKey || undefined,
          title: item.title,
          coverLabel: item.coverLabel,
          coverTheme: item.coverTheme,
          payoutMethodLabel: item.payoutMethodLabel,
          accountNumber: item.accountNumber,
          realName: item.realName,
          optionSummary: item.optionSummary,
          selectedDeviceOptionValues: item.selectedDeviceOptionValues,
          selectedDeviceOptionTexts: item.selectedDeviceOptionTexts,
          submissionImages: item.submissionImages,
          estimateSupported: item.supported,
          estimateBasePrice: Number(item.basePriceText.replace(/[^\d.-]/g, '')) || 0,
          estimateFinalPrice: item.finalPrice,
          note: item.note,
        })),
      )

      clearRecycleProducts()

      wx.showToast({
        title: '已加入待卖出',
        icon: 'success',
      })

      if (this.redirectTimer) {
        clearTimeout(this.redirectTimer)
      }

      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = 0
        wx.reLaunch({
          url: '/pages/recycle-orders/recycle-orders?mode=recycle',
        })
      }, 250) as unknown as number
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '加入待卖出失败',
        icon: 'none',
      })
    }
  },
})
