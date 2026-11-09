import { shouldIgnoreRapidBackTap, BackTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

const STORAGE_KEY = 'recycle-pickup-detail-payload'

interface RecyclePickupDetailData {
  statusBarHeight: number
  pageTitle: string
  title: string
  coverLabel: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  statusText: string
  waybillNo: string
  pickupOrderId: string
  pickupTimeText: string
  recipientName: string
  recipientPhone: string
  addressText: string
}

interface RecyclePickupDetailPage extends BackTapGuard {
  backTimer?: number
  shouldAutoNavigateBack?: boolean
  onLoad(): void
  onReady(): void
  onUnload(): void
  navigateBack(): void
  onCopyTap(event: WechatMiniprogram.TouchEvent<{}, {}, { value?: string; label?: string }>): void
}

const createDefaultData = (): Omit<RecyclePickupDetailData, 'statusBarHeight'> => ({
  pageTitle: '取件信息',
  title: '',
  coverLabel: '',
  coverTheme: 'red',
  statusText: '待审核',
  waybillNo: '',
  pickupOrderId: '',
  pickupTimeText: '',
  recipientName: '',
  recipientPhone: '',
  addressText: '',
})

Page<RecyclePickupDetailData, RecyclePickupDetailPage>({
  data: {
    statusBarHeight: 20,
    ...createDefaultData(),
  },

  onLoad() {
    const storedPayload = (wx.getStorageSync(STORAGE_KEY) || {}) as Partial<RecyclePickupDetailData>
    wx.removeStorageSync(STORAGE_KEY)

    if (!storedPayload.title) {
      wx.showToast({
        title: '取件信息不存在',
        icon: 'none',
      })
      if (this.backTimer) {
        clearTimeout(this.backTimer)
      }

      this.shouldAutoNavigateBack = true
      return
    }

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      pageTitle: '取件信息',
      title: String(storedPayload.title || ''),
      coverLabel: (storedPayload.coverTheme === 'blue' || storedPayload.coverTheme === 'gray' || storedPayload.coverTheme === 'green')
        ? storedPayload.coverLabel || ''
        : storedPayload.coverLabel || '',
      coverTheme: storedPayload.coverTheme === 'blue' || storedPayload.coverTheme === 'gray' || storedPayload.coverTheme === 'green'
        ? storedPayload.coverTheme
        : 'red',
      statusText: String(storedPayload.statusText || '待审核'),
      waybillNo: String(storedPayload.waybillNo || ''),
      pickupOrderId: String(storedPayload.pickupOrderId || ''),
      pickupTimeText: String(storedPayload.pickupTimeText || ''),
      recipientName: String(storedPayload.recipientName || ''),
      recipientPhone: String(storedPayload.recipientPhone || ''),
      addressText: String(storedPayload.addressText || ''),
    })
  },

  onReady() {
    if (!this.shouldAutoNavigateBack) {
      return
    }

    this.shouldAutoNavigateBack = false
    this.backTimer = setTimeout(() => {
      this.backTimer = 0
      this.navigateBack()
    }, 180) as unknown as number
  },

  onUnload() {
    if (this.backTimer) {
      clearTimeout(this.backTimer)
      this.backTimer = 0
    }
  },

  navigateBack() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/recycle-orders/recycle-orders?mode=recycle',
        })
      },
    })
  },

  onCopyTap(event) {
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
})
