// 用途：管理回收订单寄出、顺丰上门取件与官方预约时段选择。
import {
  BackendSfExpressStatus,
  CreateRecycleOrderPayload,
  createRecycleOrder,
  createSfPickupRecycleOrder,
  fetchSfPickupTime,
  fetchSfExpressSenderAddress,
  fetchSfExpressStatus,
  getBackendBaseUrl,
} from '../../utils/backend'
import { AddressRecord, getCachedAddress, syncDefaultAddressFromServer } from '../../utils/address'
import {
  BackTapGuard,
  NavigationTapGuard,
  shouldIgnoreRapidBackTap,
  shouldIgnoreRapidNavigationTap,
} from '../../utils/navigation'
import {
  PendingRecycleOrderRecord,
  getPendingRecycleOrders,
  removePendingRecycleProducts,
} from '../../utils/recycle'
import { getStatusBarHeight } from '../../utils/system'

type ServiceTab = 'mail' | 'pickup'
type PickupTimeMode = 'now' | 'schedule'
type PickupTimeCategory = 'today' | 'tomorrow'

interface CourierOption {
  label: string
  value: string
}

interface SelectableRecycleItem {
  id: number
  title: string
  coverLabel: string
  coverImage: string
  coverTheme: PendingRecycleOrderRecord['coverTheme']
  estimatePriceText: string
  selected: boolean
}

interface PickupServiceData {
  statusBarHeight: number
  pageTitle: string
  activeTab: ServiceTab
  selectedItemCount: number
  selectedItemPriceText: string
  selectedItemsExpanded: boolean
  selectableRecycleItems: SelectableRecycleItem[]
  officialRecipientName: string
  officialRecipientPhone: string
  officialRecipientAddress: string
  hasCustomerAddress: boolean
  customerAddressName: string
  customerAddressPhone: string
  customerAddressDetail: string
  customerAddressSummary: string
  addressPromptText: string
  mailCourierOptions: CourierOption[]
  pickupCourierOptions: CourierOption[]
  selectedMailCourier: string
  selectedPickupCourier: string
  trackingNumber: string
  pickupTimeMode: PickupTimeMode
  pickupTimeText: string
  pickupTimeCategory: PickupTimeCategory
  pickupTimePickerVisible: boolean
  pickupTimePickerTitle: string
  pickupTimePickerCategory: PickupTimeCategory
  pickupTimePickerSlots: string[]
  noticeText: string
  submitButtonText: string
  sfPickupAvailable: boolean
  sfPickupUnavailableReason: string
}

type PickupServiceOptions = {
  items?: string
  tab?: string
}

type TabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { tab?: ServiceTab }>
type CourierTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { value?: string; kind?: ServiceTab }>
type InputEvent = WechatMiniprogram.Input
type SelectableRecycleItemTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { itemId?: number }>
type PickupTimeSlotTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { slot?: string; category?: PickupTimeCategory }>

interface PickupServicePage extends BackTapGuard, NavigationTapGuard {
  selectedItemIds: number[]
  selectedItems: PendingRecycleOrderRecord[]
  selectedAddress: AddressRecord | null
  sfExpressStatus: BackendSfExpressStatus | null
  sfPickupStatusSyncPromise: Promise<void> | null
  hasInitializedSelectedItems: boolean
  submitting?: boolean
  redirectTimer?: number
  onLoad(options: PickupServiceOptions): void
  onShow(): void
  onUnload(): void
  syncSelectedItems(): void
  onSelectedItemsExpandTap(): void
  onSelectableRecycleItemTap(event: SelectableRecycleItemTapEvent): void
  syncCustomerAddressState(): Promise<void>
  syncOfficialAddress(): Promise<void>
  syncSfPickupStatus(): Promise<void>
  onBackTap(): void
  onTabTap(event: TabTapEvent): void
  onCopyOfficialAddressTap(): void
  onCopyCustomerAddressTap(): void
  onChooseAddressTap(): void
  onCourierTap(event: CourierTapEvent): void
  onTrackingInput(event: InputEvent): void
  onPickupNowTap(): void
  onPickupScheduleTap(): void
  openSfPickupTimePicker(category: PickupTimeCategory): Promise<void>
  onPickupTodayTap(): Promise<void>
  onPickupTomorrowTap(): Promise<void>
  onPickupTimeSlotTap(event: PickupTimeSlotTapEvent): void
  onPickupTimePickerClose(): void
  onPickupTimePickerStopTap(): void
  onSubmitTap(): Promise<void>
}

const OFFICIAL_ADDRESS = {
  recipientName: '夏木工作室',
  recipientPhone: '18512182096',
  addressDetail: '上海市浦东新区金海路2588号交大科技园B区325',
}

const MAIL_COURIER_OPTIONS: CourierOption[] = [
  { label: '顺丰快递', value: 'sf' },
  { label: '中通快递', value: 'zto' },
  { label: '圆通快递', value: 'yto' },
  { label: '申通快递', value: 'sto' },
  { label: '韵达快递', value: 'yunda' },
  { label: '极兔快递', value: 'jtexpress' },
  { label: '邮政 EMS', value: 'ems' },
  { label: '德邦快递', value: 'deppon' },
  { label: '京东快递', value: 'jd' },
  { label: '菜鸟 / 丹鸟', value: 'cainiao' },
  { label: '其他快递', value: 'other' },
]

const PICKUP_COURIER_OPTIONS: CourierOption[] = [
  { label: '顺丰上门取件', value: 'sf' },
]

const SF_PICKUP_NOTICE_TEXT = '上门取件已接入顺丰接口，快递员会按提交信息联系上门。'
const SF_PICKUP_PENDING_TEXT = '顺丰下单接口待上线，当前暂不可用，请先使用自己邮寄。'
let isSfStatusEndpointUnsupported = false
const LEGACY_SF_PICKUP_BACKEND_BASE_URLS = ['https://xiamuclub.com']

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

const formatAmountText = (value: number): string => {
  const amount = Number(value || 0)
  return Number.isInteger(amount) ? `${amount}` : amount.toFixed(2)
}

const buildOfficialAddressText = (
  address: Pick<PickupServiceData, 'officialRecipientName' | 'officialRecipientPhone' | 'officialRecipientAddress'>,
): string => {
  return [
    `姓名：${address.officialRecipientName}`,
    `电话：${address.officialRecipientPhone}`,
    `地址：${address.officialRecipientAddress}`,
  ].join('\n')
}

const buildCustomerAddressText = (
  address: Pick<AddressRecord, 'recipientName' | 'recipientPhone' | 'addressDetail'>,
): string => {
  return [address.recipientName, address.recipientPhone, address.addressDetail].join(' ')
}

const getCourierLabel = (options: CourierOption[], value: string): string => {
  const matched = options.find((item) => item.value === value)
  return matched ? matched.label : ''
}

const formatMonthDay = (date: Date): string => `${date.getMonth() + 1}月${date.getDate()}日`

const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

const buildPickupScheduleOptions = (now = new Date()): string[] => {
  const today = new Date(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  return [
    `${formatMonthDay(today)} 18:00-20:00`,
    `${formatMonthDay(tomorrow)} 10:00-12:00`,
    `${formatMonthDay(tomorrow)} 14:00-18:00`,
  ]
}

const formatSfDateTime = (date: Date, hour: number, minute = 0): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const normalizedHour = String(hour).padStart(2, '0')
  const normalizedMinute = String(minute).padStart(2, '0')
  return `${year}-${month}-${day} ${normalizedHour}:${normalizedMinute}:00`
}

const getPickupTargetDate = (category: PickupTimeCategory, now = new Date()): Date => {
  const targetDate = new Date(now)
  if (category === 'tomorrow') {
    targetDate.setDate(targetDate.getDate() + 1)
  }
  targetDate.setHours(0, 0, 0, 0)
  return targetDate
}

const buildSfPickupQueryTime = (category: PickupTimeCategory, now = new Date()): string => {
  return formatSfDateTime(getPickupTargetDate(category, now), 12)
}

const parseSfClockMinutes = (value: string): number | null => {
  const matched = String(value || '').trim().match(/^(\d{2}):?(\d{2})$/)
  if (!matched) {
    return null
  }

  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return hour * 60 + minute
}

const buildPickupSlotsFromSfWindow = (
  category: PickupTimeCategory,
  startTm: string,
  endTm: string,
  now = new Date(),
): string[] => {
  const targetDate = getPickupTargetDate(category, now)
  const startMinutes = parseSfClockMinutes(startTm)
  const endMinutes = parseSfClockMinutes(endTm)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return []
  }

  const roundedStartMinutes = Math.ceil(startMinutes / 60) * 60
  const roundedEndMinutes = Math.floor(endMinutes / 60) * 60
  const earliestTodayTime = now.getTime() + 70 * 60 * 1000
  const slots: string[] = []

  for (let slotStartMinutes = roundedStartMinutes; slotStartMinutes + 60 <= roundedEndMinutes; slotStartMinutes += 60) {
    const slotStart = new Date(targetDate)
    slotStart.setMinutes(slotStartMinutes)
    if (category === 'today' && slotStart.getTime() < earliestTodayTime) {
      continue
    }

    const startHour = Math.floor(slotStartMinutes / 60)
    const endHour = Math.floor((slotStartMinutes + 60) / 60)
    slots.push(`${formatMonthDay(targetDate)} ${formatHour(startHour)}-${formatHour(endHour)}`)
  }

  return slots
}

const parsePickupSlotStartTime = (
  pickupTimeText: string,
  category: PickupTimeCategory,
  now = new Date(),
): string => {
  const matched = String(pickupTimeText || '').match(/\s(\d{1,2}):(\d{2})-/)
  if (!matched) {
    return ''
  }

  return formatSfDateTime(getPickupTargetDate(category, now), Number(matched[1]), Number(matched[2]))
}

const appendServiceNote = (note: string, serviceNote: string): string => {
  const normalizedNote = String(note || '').trim()
  const normalizedServiceNote = String(serviceNote || '').trim()

  if (!normalizedServiceNote) {
    return normalizedNote
  }

  if (!normalizedNote) {
    return normalizedServiceNote
  }

  if (normalizedNote.includes(normalizedServiceNote)) {
    return normalizedNote
  }

  return `${normalizedNote}\n${normalizedServiceNote}`
}

const toRecycleOrderPayload = (item: PendingRecycleOrderRecord, note: string): CreateRecycleOrderPayload => ({
  recycleProductId: item.recycleProductId || undefined,
  categoryKey: item.categoryKey || undefined,
  title: item.title,
  coverLabel: item.coverLabel,
  coverImage: item.coverImage || undefined,
  coverTheme: item.coverTheme,
  payoutMethodLabel: item.payoutMethodLabel,
  accountNumber: item.accountNumber,
  realName: item.realName,
  optionSummary: item.optionSummary,
  selectedDeviceOptionValues: item.selectedDeviceOptionValues,
  selectedDeviceOptionTexts: item.selectedDeviceOptionTexts,
  submissionImages: item.submissionImages,
  estimateSupported: item.estimateSupported,
  estimateBasePrice: item.estimateBasePrice,
  estimateFinalPrice: item.estimateFinalPrice,
  note,
})

const getSfPickupStatusReason = (status: BackendSfExpressStatus | null): string => {
  if (!status) {
    return '顺丰上门取件状态获取失败，请稍后重试。'
  }

  if (!status.configured) {
    return '顺丰上门取件配置未完成，请联系管理员检查配置。'
  }

  if (status.serviceCode && status.serviceCode !== 'EXP_RECE_CREATE_ORDER') {
    return '顺丰下单服务配置异常，当前暂不可用。'
  }

  return ''
}

const isSfPermissionDeniedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('无对应服务权限')
    || message.includes('待上线')
    || message.includes('未开通')
}

const isMissingSfStatusEndpoint = (error: unknown): boolean => {
  const requestError = error as { statusCode?: number } | null
  return Number(requestError?.statusCode || 0) === 404
}

const shouldUseLegacySfPickupCompatibility = (): boolean => {
  const backendBaseUrl = String(getBackendBaseUrl() || '').trim().replace(/\/+$/, '')
  return LEGACY_SF_PICKUP_BACKEND_BASE_URLS.includes(backendBaseUrl)
}

const applyCustomerAddress = (
  page: WechatMiniprogram.Page.Instance<PickupServiceData, PickupServicePage>,
  address: AddressRecord | null,
) => {
  page.selectedAddress = address

  if (!address) {
    page.setData({
      hasCustomerAddress: false,
      customerAddressName: '未读取到购买结算地址',
      customerAddressPhone: '',
      customerAddressDetail: '请先在购买结算链路里保存收货地址，或点击下方按钮从地址簿选择。',
      customerAddressSummary: '',
      addressPromptText: '请点击下面按钮同步或选择地址',
    })
    return
  }

  page.setData({
    hasCustomerAddress: true,
    customerAddressName: address.recipientName,
    customerAddressPhone: address.recipientPhone,
    customerAddressDetail: address.addressDetail,
    customerAddressSummary: buildCustomerAddressText(address),
    addressPromptText: '已自动读取购买结算地址，可直接复制给取件员',
  })
}

Page<PickupServiceData, PickupServicePage>({
  data: {
    statusBarHeight: 20,
    pageTitle: '回收订单寄出',
    activeTab: 'pickup',
    selectedItemCount: 0,
    selectedItemPriceText: '0',
    selectedItemsExpanded: false,
    selectableRecycleItems: [],
    officialRecipientName: OFFICIAL_ADDRESS.recipientName,
    officialRecipientPhone: OFFICIAL_ADDRESS.recipientPhone,
    officialRecipientAddress: OFFICIAL_ADDRESS.addressDetail,
    hasCustomerAddress: false,
    customerAddressName: '未读取到购买结算地址',
    customerAddressPhone: '',
    customerAddressDetail: '请先在购买结算链路里保存收货地址，或点击下方按钮从地址簿选择。',
    customerAddressSummary: '',
    addressPromptText: '请点击下面按钮同步或选择地址',
    mailCourierOptions: MAIL_COURIER_OPTIONS,
    pickupCourierOptions: PICKUP_COURIER_OPTIONS,
    selectedMailCourier: '',
    selectedPickupCourier: 'sf',
    trackingNumber: '',
    pickupTimeMode: 'now',
    pickupTimeText: '立即上门',
    pickupTimeCategory: 'today',
    pickupTimePickerVisible: false,
    pickupTimePickerTitle: '',
    pickupTimePickerCategory: 'today',
    pickupTimePickerSlots: [],
    noticeText: SF_PICKUP_NOTICE_TEXT,
    submitButtonText: '确认上门取件',
    sfPickupAvailable: true,
    sfPickupUnavailableReason: '',
  },

  selectedItemIds: [],
  selectedItems: [],
  selectedAddress: null,
  sfExpressStatus: null,
  sfPickupStatusSyncPromise: null,
  hasInitializedSelectedItems: false,

  onLoad(options: PickupServiceOptions) {
    const activeTab = options.tab === 'mail' ? 'mail' : 'pickup'
    this.selectedItemIds = parseNumberList(options.items)

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      activeTab,
      submitButtonText: activeTab === 'mail' ? '保存快递信息' : '确认上门取件',
      selectedPickupCourier: 'sf',
    })

    this.syncSelectedItems()
    this.syncOfficialAddress().catch(() => {})
    this.syncCustomerAddressState().catch(() => {})
    this.syncSfPickupStatus().catch(() => {})
  },

  onShow() {
    this.syncSelectedItems()
    this.syncOfficialAddress().catch(() => {})
    this.syncCustomerAddressState().catch(() => {})
    this.syncSfPickupStatus().catch(() => {})
  },

  onUnload() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = 0
    }
  },

  syncSelectedItems() {
    const pendingItems = getPendingRecycleOrders()

    if (!this.hasInitializedSelectedItems) {
      this.selectedItemIds = this.selectedItemIds.length
        ? this.selectedItemIds
        : pendingItems.map((item) => item.addedAt)
      this.hasInitializedSelectedItems = true
    }

    const availableItemIdSet = new Set(pendingItems.map((item) => item.addedAt))
    this.selectedItemIds = this.selectedItemIds.filter((itemId) => availableItemIdSet.has(itemId))

    const selectedIdSet = new Set(this.selectedItemIds)
    const selectedItems = pendingItems.filter((item) => selectedIdSet.has(item.addedAt))
    const totalPrice = selectedItems.reduce((sum, item) => sum + Number(item.estimateFinalPrice || 0), 0)

    this.selectedItems = selectedItems
    this.setData({
      selectedItemCount: selectedItems.length,
      selectedItemPriceText: formatAmountText(totalPrice),
      selectableRecycleItems: pendingItems.map((item) => ({
        id: item.addedAt,
        title: item.title,
        coverLabel: item.coverLabel,
        coverImage: item.coverImage || '',
        coverTheme: item.coverTheme,
        estimatePriceText: formatAmountText(Number(item.estimateFinalPrice || 0)),
        selected: selectedIdSet.has(item.addedAt),
      })),
    })
  },

  onSelectedItemsExpandTap() {
    this.setData({
      selectedItemsExpanded: !this.data.selectedItemsExpanded,
    })
  },

  onSelectableRecycleItemTap(event) {
    const itemId = Number(event.currentTarget.dataset.itemId || 0)

    if (!itemId) {
      return
    }

    const selectedItemIdSet = new Set(this.selectedItemIds)
    if (selectedItemIdSet.has(itemId)) {
      selectedItemIdSet.delete(itemId)
    } else {
      selectedItemIdSet.add(itemId)
    }

    this.selectedItemIds = Array.from(selectedItemIdSet)
    this.syncSelectedItems()
  },

  async syncCustomerAddressState() {
    applyCustomerAddress(this, getCachedAddress())

    try {
      applyCustomerAddress(this, await syncDefaultAddressFromServer())
    } catch (_error) {
      // Keep the locally cached address when the server response is delayed.
    }
  },

  async syncOfficialAddress() {
    try {
      const address = await fetchSfExpressSenderAddress()
      if (!address) {
        return
      }

      this.setData({
        officialRecipientName: String(address.recipientName || OFFICIAL_ADDRESS.recipientName).trim(),
        officialRecipientPhone: String(address.recipientPhone || OFFICIAL_ADDRESS.recipientPhone).trim(),
        officialRecipientAddress: String(address.displayAddress || address.addressDetail || OFFICIAL_ADDRESS.addressDetail).trim(),
      })
    } catch (_error) {
      // Keep the local fallback address when the backend is unavailable.
    }
  },

  async syncSfPickupStatus() {
    if (shouldUseLegacySfPickupCompatibility()) {
      this.sfExpressStatus = null
      this.setData({
        sfPickupAvailable: true,
        sfPickupUnavailableReason: '',
        noticeText: SF_PICKUP_NOTICE_TEXT,
      })
      return
    }

    if (isSfStatusEndpointUnsupported) {
      this.sfExpressStatus = null
      this.setData({
        sfPickupAvailable: true,
        sfPickupUnavailableReason: '',
        noticeText: SF_PICKUP_NOTICE_TEXT,
      })
      return
    }

    if (this.sfPickupStatusSyncPromise) {
      return this.sfPickupStatusSyncPromise
    }

    this.sfPickupStatusSyncPromise = (async () => {
      try {
        const status = await fetchSfExpressStatus()
        this.sfExpressStatus = status
        const unavailableReason = getSfPickupStatusReason(status)
        const sfPickupAvailable = !unavailableReason

        this.setData({
          sfPickupAvailable,
          sfPickupUnavailableReason: unavailableReason,
          noticeText: sfPickupAvailable ? SF_PICKUP_NOTICE_TEXT : unavailableReason || SF_PICKUP_PENDING_TEXT,
        })
      } catch (error) {
        if (isMissingSfStatusEndpoint(error)) {
          isSfStatusEndpointUnsupported = true
          this.sfExpressStatus = null
          this.setData({
            sfPickupAvailable: true,
            sfPickupUnavailableReason: '',
            noticeText: SF_PICKUP_NOTICE_TEXT,
          })
          return
        }

        this.sfExpressStatus = null
        this.setData({
          sfPickupAvailable: false,
          sfPickupUnavailableReason: '顺丰上门取件状态获取失败，请稍后重试。',
          noticeText: SF_PICKUP_PENDING_TEXT,
        })
      } finally {
        this.sfPickupStatusSyncPromise = null
      }
    })()

    return this.sfPickupStatusSyncPromise
  },

  onBackTap() {
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

  onTabTap(event) {
    const nextTab = event.currentTarget.dataset.tab || 'pickup'

    if (nextTab === this.data.activeTab) {
      return
    }

    this.setData({
      activeTab: nextTab,
      submitButtonText: nextTab === 'mail' ? '保存快递信息' : '确认上门取件',
      selectedPickupCourier: 'sf',
    })
  },

  onCopyOfficialAddressTap() {
    wx.setClipboardData({
      data: buildOfficialAddressText({
        officialRecipientName: this.data.officialRecipientName,
        officialRecipientPhone: this.data.officialRecipientPhone,
        officialRecipientAddress: this.data.officialRecipientAddress,
      }),
    })
  },

  onCopyCustomerAddressTap() {
    if (!this.data.customerAddressSummary) {
      wx.showToast({
        title: '暂无可复制地址',
        icon: 'none',
      })
      return
    }

    wx.setClipboardData({
      data: this.data.customerAddressSummary,
    })
  },

  onChooseAddressTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/address-form/address-form?mode=picker',
    })
  },

  onCourierTap(event) {
    const courierValue = String(event.currentTarget.dataset.value || '')
    const kind = event.currentTarget.dataset.kind || 'pickup'

    if (!courierValue) {
      return
    }

    if (kind === 'mail') {
      this.setData({
        selectedMailCourier: courierValue,
      })
      return
    }

    if (courierValue === 'sf' && !this.data.sfPickupAvailable) {
      wx.showToast({
        title: this.data.sfPickupUnavailableReason || SF_PICKUP_PENDING_TEXT,
        icon: 'none',
      })
      return
    }

    this.setData({
      selectedPickupCourier: courierValue,
    })
  },

  onTrackingInput(event) {
    this.setData({
      trackingNumber: String(event.detail.value || '').trim(),
    })
  },

  onPickupNowTap() {
    this.setData({
      pickupTimeMode: 'now',
      pickupTimeText: '立即上门',
      pickupTimePickerVisible: false,
    })
  },

  onPickupScheduleTap() {
    const pickupSlots = buildPickupScheduleOptions()

    wx.showActionSheet({
      itemList: pickupSlots,
      success: (res) => {
        const pickupSlot = pickupSlots[res.tapIndex]
        if (!pickupSlot) {
          return
        }

        this.setData({
          pickupTimeMode: 'schedule',
          pickupTimeText: pickupSlot,
        })
      },
    })
  },

  async openSfPickupTimePicker(category) {
    if (!this.data.hasCustomerAddress || !this.selectedAddress) {
      wx.showToast({
        title: '请先选择上门取件地址',
        icon: 'none',
      })
      return
    }

    const pickupAddress = this.selectedAddress
    wx.showLoading({ title: '获取顺丰时段', mask: true })

    try {
      const pickupTime = await fetchSfPickupTime({
        sendTime: buildSfPickupQueryTime(category),
        customerAddress: {
          addressId: pickupAddress.id || undefined,
          recipientName: pickupAddress.recipientName,
          recipientPhone: pickupAddress.recipientPhone,
          province: pickupAddress.province,
          city: pickupAddress.city,
          district: pickupAddress.district,
          addressDetail: pickupAddress.addressDetail,
        },
      })

      if (!pickupTime || !pickupTime.status) {
        throw new Error(pickupTime?.exceptionReason || '顺丰暂未开放该日期的上门预约')
      }

      const pickupSlots = buildPickupSlotsFromSfWindow(
        category,
        pickupTime.startTm,
        pickupTime.endTm,
      )
      if (!pickupSlots.length) {
        throw new Error(category === 'today' ? '今天已没有可预约时段' : '明天暂无可预约时段')
      }

      this.setData({
        pickupTimePickerVisible: true,
        pickupTimePickerTitle: category === 'today' ? '选择今天上门时间' : '选择明天上门时间',
        pickupTimePickerCategory: category,
        pickupTimePickerSlots: pickupSlots,
      })
    } catch (error) {
      const message = isSfPermissionDeniedError(error)
        ? '顺丰预约时段接口尚未开通，请联系管理员'
        : (error instanceof Error ? error.message : '顺丰预约时段获取失败，请稍后重试')
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async onPickupTodayTap() {
    await this.openSfPickupTimePicker('today')
  },

  async onPickupTomorrowTap() {
    await this.openSfPickupTimePicker('tomorrow')
  },

  onPickupTimeSlotTap(event) {
    const pickupSlot = String(event.currentTarget.dataset.slot || '')
    const pickupTimeCategory = event.currentTarget.dataset.category === 'tomorrow' ? 'tomorrow' : 'today'

    if (!pickupSlot) {
      return
    }

    this.setData({
      pickupTimeMode: 'schedule',
      pickupTimeText: pickupSlot,
      pickupTimeCategory,
      pickupTimePickerVisible: false,
    })
  },

  onPickupTimePickerClose() {
    this.setData({
      pickupTimePickerVisible: false,
    })
  },

  onPickupTimePickerStopTap() {
    // Keep taps inside the picker from closing the overlay.
  },

  async onSubmitTap() {
    if (this.submitting) {
      return
    }

    if (!this.selectedItems.length) {
      wx.showToast({
        title: '当前没有可提交的回收单',
        icon: 'none',
      })
      return
    }

    if (this.data.activeTab === 'mail') {
      if (!this.data.selectedMailCourier) {
        wx.showToast({
          title: '请选择快递公司',
          icon: 'none',
        })
        return
      }

      if (!this.data.trackingNumber) {
        wx.showToast({
          title: '请输入快递单号',
          icon: 'none',
        })
        return
      }
    } else {
      if (!this.data.sfPickupAvailable) {
        wx.showToast({
          title: this.data.sfPickupUnavailableReason || SF_PICKUP_PENDING_TEXT,
          icon: 'none',
        })
        return
      }

      if (!this.data.hasCustomerAddress || !this.selectedAddress) {
        wx.showToast({
          title: '请先选择上门取件地址',
          icon: 'none',
        })
        return
      }

      if (this.data.selectedPickupCourier !== 'sf') {
        wx.showToast({
          title: '当前仅支持顺丰上门取件',
          icon: 'none',
        })
        return
      }
    }

    const mailServiceNote = `【回收寄出】自己邮寄；快递公司：${getCourierLabel(MAIL_COURIER_OPTIONS, this.data.selectedMailCourier)}；快递单号：${this.data.trackingNumber}`

    this.submitting = true

    try {
      if (this.data.activeTab === 'pickup') {
        const pickupAddress = this.selectedAddress as AddressRecord
        const pickupStartTime = this.data.pickupTimeMode === 'schedule'
          ? parsePickupSlotStartTime(this.data.pickupTimeText, this.data.pickupTimeCategory)
          : undefined

        if (this.data.pickupTimeMode === 'schedule' && !pickupStartTime) {
          throw new Error('预约时间无效，请重新选择顺丰上门时段')
        }

        const pickupResult = await createSfPickupRecycleOrder({
          courierCode: 'sf',
          pickupTimeMode: this.data.pickupTimeMode,
          pickupTimeText: this.data.pickupTimeText,
          pickupStartTime,
          customerAddress: {
            addressId: pickupAddress.id || undefined,
            recipientName: pickupAddress.recipientName,
            recipientPhone: pickupAddress.recipientPhone,
            province: pickupAddress.province,
            city: pickupAddress.city,
            district: pickupAddress.district,
            addressDetail: pickupAddress.addressDetail,
          },
          recycleItems: this.selectedItems.map((item) => toRecycleOrderPayload(item, item.note)),
        })

        if (pickupResult.orders.length !== this.selectedItems.length) {
          throw new Error('回收商品提交数量异常，请刷新后重试')
        }

        removePendingRecycleProducts(this.selectedItems.map((item) => item.addedAt))

        wx.showToast({
          title: '顺丰上门单已创建',
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
        return
      }

      await Promise.all(
        this.selectedItems.map((item) =>
          createRecycleOrder(
            toRecycleOrderPayload(item, appendServiceNote(item.note, mailServiceNote)),
          ),
        ),
      )

      removePendingRecycleProducts(this.selectedItems.map((item) => item.addedAt))

      wx.showToast({
        title: '快递信息已保存',
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
      const isPermissionDenied = !shouldUseLegacySfPickupCompatibility()
        && this.data.activeTab === 'pickup'
        && isSfPermissionDeniedError(error)

      if (isPermissionDenied) {
        this.setData({
          sfPickupAvailable: false,
          sfPickupUnavailableReason: SF_PICKUP_PENDING_TEXT,
          noticeText: SF_PICKUP_PENDING_TEXT,
        })
      }

      wx.showToast({
        title: isPermissionDenied
          ? SF_PICKUP_PENDING_TEXT
          : (error instanceof Error ? error.message : '回收订单提交失败'),
        icon: 'none',
      })
    } finally {
      this.submitting = false
    }
  },
})
