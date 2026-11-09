// 用途：动态加载回收收款设置、黄色提示和商品检测项，并提交回收信息。
import { addProductToRecycleList, clearRecycleProducts } from '../../utils/recycle'
import {
  BackendRecyclePayField,
  fetchRecycleProductDetail,
  fetchRecycleSettings,
  uploadRecycleSubmissionImage,
  BackendRecycleOptionGroup,
} from '../../utils/backend'
import { shouldIgnoreRapidBackTap } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

type RecycleCoverTheme = 'red' | 'blue' | 'gray' | 'green'

interface BackTapGuard {
  backTapLockedUntil?: number
}

interface DetailFieldItem {
  id: number
  key: 'payoutMethod' | 'accountNumber' | 'realName' | 'orderRemark'
  label: string
  value: string
  placeholder?: boolean
  required?: boolean
  chipType?: 'wechat' | 'alipay'
}

interface DeviceOptionItem {
  id: number
  key: string
  label: string
  required: boolean
  selectedText: string
  options: DeviceOptionChoiceItem[]
}

interface DeviceOptionChoiceItem {
  id: number
  text: string
  value: string
  imageUrls: string[]
  selected?: boolean
}

interface PayoutOptionItem {
  id: number
  label: string
  value: 'wechat' | 'alipay'
  default: boolean
  visible: boolean
  fields: BackendRecyclePayField[]
}

interface RecyclingConditionData {
  statusBarHeight: number
  pageTitle: string
  recycleProductId: number
  categoryKey: string
  productTitle: string
  coverLabel: string
  coverImage: string
  coverTheme: RecycleCoverTheme
  noticeVisible: boolean
  noticeLines: string[]
  submissionImages: string[]
  selectedPayoutMethod: 'wechat' | 'alipay'
  payoutMenuOpen: boolean
  payoutOptions: PayoutOptionItem[]
  visiblePayoutOptions: PayoutOptionItem[]
  accountFields: DetailFieldItem[]
  accountNumber: string
  realName: string
  orderRemark: string
  activeDeviceOptionKey: string
  selectedDeviceOptionValues: Record<string, string>
  deviceOptionFields: DeviceOptionItem[]
}

type RecyclingConditionOptions = {
  id?: string
  title?: string
  coverLabel?: string
  coverTheme?: string
  categoryKey?: string
}

interface RecyclingConditionPage extends BackTapGuard {
  recycleOptionGroups: BackendRecycleOptionGroup[]
  uploadingImages?: boolean
  redirectTimer?: number
  onLoad(options: RecyclingConditionOptions): void
  onUnload(): void
  loadRecycleProductDetail(): Promise<void>
  loadRecycleSettings(): Promise<void>
  onBackTap(): void
  onPayoutTap(): void
  onPayoutOptionTap(event: WechatMiniprogram.TouchEvent<{}, {}, { value?: 'wechat' | 'alipay' }>): void
  onAccountNumberInput(event: WechatMiniprogram.Input): void
  onRealNameInput(event: WechatMiniprogram.Input): void
  onOrderRemarkInput(event: WechatMiniprogram.Input): void
  onChooseImagesTap(): void
  onRemoveImageTap(event: WechatMiniprogram.TouchEvent<{}, {}, { index?: number }>): void
  onDeviceOptionTap(event: WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>): void
  onDeviceOptionValueTap(event: WechatMiniprogram.TouchEvent<{}, {}, { key?: string; value?: string }>): void
  onPreviewOptionImageTap(event: WechatMiniprogram.TouchEvent<{}, {}, { imageUrl?: string; imageUrls?: string[] }>): void
  onFieldTap(): void
  onConfirmTap(): void
}

const payoutFieldIds: Record<BackendRecyclePayField['key'], number> = {
  accountNumber: 2,
  realName: 3,
  orderRemark: 4,
}

const buildAccountFields = (selectedOption?: PayoutOptionItem): DetailFieldItem[] => {
  if (!selectedOption) {
    return []
  }

  return [
    {
      id: 1,
      key: 'payoutMethod',
      label: '收款方式',
      value: selectedOption.label,
      chipType: selectedOption.value,
    },
    ...selectedOption.fields
      .filter((field) => field.visible)
      .map((field) => ({
        id: payoutFieldIds[field.key],
        key: field.key,
        label: field.label,
        value: field.placeholder,
        placeholder: true,
        required: field.required,
      })),
  ]
}

const normalizeCoverTheme = (theme?: string): RecycleCoverTheme => {
  if (theme === 'blue' || theme === 'gray' || theme === 'green') {
    return theme
  }

  return 'red'
}

const buildVisiblePayoutOptions = (options: PayoutOptionItem[]): PayoutOptionItem[] =>
  options.filter((option) => option.visible)

const buildDeviceOptionFields = (
  optionGroups: BackendRecycleOptionGroup[],
  selectedDeviceOptionValues: Record<string, string>,
): DeviceOptionItem[] => {
  return optionGroups.map((group, groupIndex) => {
    const selectedValue = selectedDeviceOptionValues[group.key] || ''
    const options = (Array.isArray(group.options) ? group.options : []).map((option, optionIndex) => ({
      id: Number(option.id || optionIndex + 1),
      text: option.label || option.value || '',
      value: option.value || '',
      imageUrls: Array.isArray(option.imageUrls)
        ? option.imageUrls.filter(Boolean)
        : Array.isArray((option as { image_urls?: string[] }).image_urls)
          ? ((option as { image_urls?: string[] }).image_urls || []).filter(Boolean)
          : [],
      selected: option.value === selectedValue,
    }))
    const selectedOption = options.find((option) => option.selected)

    return {
      id: Number(group.id || groupIndex + 1),
      key: group.key,
      label: group.label || group.key,
      required: Boolean(group.required),
      selectedText: selectedOption ? selectedOption.text : '',
      options,
    }
  })
}

const getRequiredDeviceOptionLabels = (fields: DeviceOptionItem[]): Array<{ key: string; label: string }> => {
  return fields
    .filter((field) => field.required)
    .map((field) => ({
      key: field.key,
      label: field.label,
    }))
}

const buildSelectedDeviceOptionTexts = (fields: DeviceOptionItem[]): Record<string, string> => {
  return fields.reduce<Record<string, string>>((result, field) => {
    if (field.selectedText) {
      result[field.key] = field.selectedText
    }

    return result
  }, {})
}

const getNextUnselectedDeviceOptionKey = (fields: DeviceOptionItem[], currentKey: string): string => {
  const currentIndex = fields.findIndex((field) => field.key === currentKey)
  const followingFields = currentIndex >= 0
    ? [...fields.slice(currentIndex + 1), ...fields.slice(0, currentIndex)]
    : fields
  const nextUnselectedField = followingFields.find((field) => !field.selectedText)

  return nextUnselectedField ? nextUnselectedField.key : ''
}

Page<RecyclingConditionData, RecyclingConditionPage>({
  data: {
    statusBarHeight: 20,
    recycleProductId: 0,
    categoryKey: '',
    pageTitle: '选择商品情况',
    productTitle: '',
    coverLabel: '',
    coverImage: '',
    coverTheme: 'red',
    noticeVisible: false,
    noticeLines: [],
    submissionImages: [],
    selectedPayoutMethod: 'alipay',
    payoutMenuOpen: false,
    payoutOptions: [],
    visiblePayoutOptions: [],
    accountFields: [],
    accountNumber: '',
    realName: '',
    orderRemark: '',
    activeDeviceOptionKey: '',
    selectedDeviceOptionValues: {},
    deviceOptionFields: [],
  },

  recycleOptionGroups: [],

  onLoad(options: RecyclingConditionOptions) {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      recycleProductId: Number(options.id || 0),
      categoryKey: options.categoryKey ? decodeURIComponent(options.categoryKey) : '',
      productTitle: options.title ? decodeURIComponent(options.title) : '',
      coverLabel: options.coverLabel ? decodeURIComponent(options.coverLabel) : '',
      coverTheme: normalizeCoverTheme(options.coverTheme ? decodeURIComponent(options.coverTheme) : ''),
    })

    Promise.all([
      this.loadRecycleProductDetail(),
      this.loadRecycleSettings(),
    ]).catch((error) => {
      this.setData({
        recycleProductId: 0,
      })
      wx.showToast({
        title: error instanceof Error ? error.message : '回收配置加载失败',
        icon: 'none',
      })

      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = 0
        this.onBackTap()
      }, 900) as unknown as number
    })
  },

  onUnload() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = 0
    }
  },

  async loadRecycleProductDetail() {
    if (!this.data.recycleProductId) {
      return
    }

    const product = await fetchRecycleProductDetail(this.data.recycleProductId)
    if (!product) {
      throw new Error('回收商品不存在')
    }

    this.recycleOptionGroups = Array.isArray(product.optionGroups) ? product.optionGroups : []

    this.setData({
      categoryKey: product.categoryKey || this.data.categoryKey,
      productTitle: product.title || this.data.productTitle,
      coverLabel: product.coverLabel || this.data.coverLabel,
      coverImage: product.coverImage || this.data.coverImage,
      coverTheme: normalizeCoverTheme(product.coverTheme),
      deviceOptionFields: buildDeviceOptionFields(this.recycleOptionGroups, this.data.selectedDeviceOptionValues),
    })
  },

  async loadRecycleSettings() {
    const settings = await fetchRecycleSettings()
    const payoutOptions: PayoutOptionItem[] = (Array.isArray(settings.payMethods) ? settings.payMethods : [])
      .filter((method) => method.methodKey === 'alipay' || method.methodKey === 'wechat')
      .map((method) => ({
        id: Number(method.id || 0),
        label: String(method.name || ''),
        value: method.methodKey,
        default: Boolean(method.default),
        visible: Boolean(method.visible),
        fields: Array.isArray(method.fields) ? method.fields : [],
      }))
    const visiblePayoutOptions = buildVisiblePayoutOptions(payoutOptions)
    const selectedOption = visiblePayoutOptions.find((option) => option.default) || visiblePayoutOptions[0]

    if (!selectedOption) {
      throw new Error('暂无可用收款方式')
    }

    this.setData({
      noticeVisible: Boolean(settings.notice && settings.notice.visible),
      noticeLines: settings.notice && Array.isArray(settings.notice.lines) ? settings.notice.lines : [],
      payoutOptions,
      visiblePayoutOptions,
      selectedPayoutMethod: selectedOption.value,
      accountFields: buildAccountFields(selectedOption),
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

  onPayoutTap() {
    if (this.data.visiblePayoutOptions.length <= 1) {
      return
    }

    this.setData({
      payoutMenuOpen: !this.data.payoutMenuOpen,
    })
  },

  onPayoutOptionTap(event) {
    const { value } = event.currentTarget.dataset
    if (!value) {
      return
    }

    const selectedOption = this.data.visiblePayoutOptions.find((option) => option.value === value)
    if (!selectedOption) {
      return
    }

    this.setData({
      selectedPayoutMethod: value,
      payoutMenuOpen: false,
      accountFields: buildAccountFields(selectedOption),
      accountNumber: '',
    })
  },

  onAccountNumberInput(event) {
    this.setData({
      accountNumber: event.detail.value,
    })
  },

  onRealNameInput(event) {
    this.setData({
      realName: event.detail.value,
    })
  },

  onOrderRemarkInput(event) {
    this.setData({
      orderRemark: event.detail.value,
    })
  },

  onChooseImagesTap() {
    if (this.uploadingImages) {
      return
    }

    const remainCount = 9 - this.data.submissionImages.length
    if (remainCount <= 0) {
      wx.showToast({
        title: '最多上传 9 张图片',
        icon: 'none',
      })
      return
    }

    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        const tempFiles = (result.tempFiles || [])
          .map((item) => item.tempFilePath)
          .filter(Boolean)

        if (!tempFiles.length) {
          return
        }

        this.uploadingImages = true
        wx.showLoading({
          title: '上传中',
        })

        let uploadError: unknown = null
        try {
          const uploadedImages: string[] = []

          for (const filePath of tempFiles) {
            const uploadedImageUrl = await uploadRecycleSubmissionImage(filePath)
            uploadedImages.push(uploadedImageUrl)
          }

          this.setData({
            submissionImages: [...this.data.submissionImages, ...uploadedImages].slice(0, 9),
          })
        } catch (error) {
          uploadError = error
        } finally {
          wx.hideLoading()
          this.uploadingImages = false
        }

        wx.showToast({
          title: uploadError instanceof Error ? uploadError.message : '上传成功',
          icon: uploadError ? 'none' : 'success',
        })
      },
    })
  },

  onRemoveImageTap(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (Number.isNaN(index) || index < 0) {
      return
    }

    this.setData({
      submissionImages: this.data.submissionImages.filter((_item, currentIndex) => currentIndex !== index),
    })
  },

  onDeviceOptionTap(event) {
    const { key } = event.currentTarget.dataset
    if (!key) {
      return
    }

    this.setData({
      activeDeviceOptionKey: this.data.activeDeviceOptionKey === key ? '' : key,
    })
  },

  onDeviceOptionValueTap(event) {
    const { key, value } = event.currentTarget.dataset
    if (!key || !value) {
      return
    }

    const nextSelectedDeviceOptionValues = {
      ...this.data.selectedDeviceOptionValues,
      [key]: value,
    }
    const nextDeviceOptionFields = buildDeviceOptionFields(this.recycleOptionGroups, nextSelectedDeviceOptionValues)

    this.setData({
      selectedDeviceOptionValues: nextSelectedDeviceOptionValues,
      activeDeviceOptionKey: getNextUnselectedDeviceOptionKey(nextDeviceOptionFields, key),
      deviceOptionFields: nextDeviceOptionFields,
    })
  },

  onPreviewOptionImageTap(event) {
    const { imageUrl, imageUrls } = event.currentTarget.dataset
    const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : []

    if (!imageUrl || !urls.length) {
      return
    }

    wx.previewImage({
      current: imageUrl,
      urls,
    })
  },

  onFieldTap() {},

  onConfirmTap() {
    if (!this.data.recycleProductId) {
      wx.showToast({
        title: '回收商品不存在',
        icon: 'none',
      })
      return
    }

    const payoutFieldValues: Partial<Record<DetailFieldItem['key'], string>> = {
      accountNumber: this.data.accountNumber,
      realName: this.data.realName,
      orderRemark: this.data.orderRemark,
    }
    const missingPayoutField = this.data.accountFields.find(
      (field) => field.key !== 'payoutMethod' && field.required && !String(payoutFieldValues[field.key] || '').trim(),
    )

    if (missingPayoutField) {
      wx.showToast({
        title: `请完整填写${missingPayoutField.label}`,
        icon: 'none',
      })
      return
    }

    if (!this.data.deviceOptionFields.length) {
      wx.showToast({
        title: '当前回收配置未发布',
        icon: 'none',
      })
      return
    }

    const missingDeviceOption = getRequiredDeviceOptionLabels(this.data.deviceOptionFields).find(
      (item) => !this.data.selectedDeviceOptionValues[item.key],
    )

    if (missingDeviceOption) {
      wx.showToast({
        title: `请完整填写${missingDeviceOption.label}`,
        icon: 'none',
      })
      return
    }

    const selectedPayoutOption = this.data.visiblePayoutOptions.find(
      (option) => option.value === this.data.selectedPayoutMethod,
    )
    if (!selectedPayoutOption) {
      wx.showToast({
        title: '请选择有效收款方式',
        icon: 'none',
      })
      return
    }

    const visiblePayoutFieldKeys = new Set(
      selectedPayoutOption.fields.filter((field) => field.visible).map((field) => field.key),
    )

    // 开始新的回收订单时，只保留本次确认的商品，避免上次未提交的结算草稿残留。
    clearRecycleProducts()
    addProductToRecycleList({
      recycleProductId: this.data.recycleProductId,
      categoryKey: this.data.categoryKey,
      title: this.data.productTitle,
      coverLabel: this.data.coverLabel,
      coverImage: this.data.coverImage,
      coverTheme: this.data.coverTheme,
      payoutMethodLabel: selectedPayoutOption.label,
      accountNumber: visiblePayoutFieldKeys.has('accountNumber') ? this.data.accountNumber.trim() : '',
      realName: visiblePayoutFieldKeys.has('realName') ? this.data.realName.trim() : '',
      optionSummary: this.data.deviceOptionFields
        .filter((field) => field.selectedText)
        .slice(0, 2)
        .map((field) => field.selectedText)
        .join(' / '),
      selectedDeviceOptionValues: this.data.selectedDeviceOptionValues,
      selectedDeviceOptionTexts: buildSelectedDeviceOptionTexts(this.data.deviceOptionFields),
      submissionImages: this.data.submissionImages,
    })

    wx.showToast({
      title: '已加入结算',
      icon: 'success',
    })

    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
    }

    this.redirectTimer = setTimeout(() => {
      this.redirectTimer = 0
      wx.navigateTo({
        url: '/pages/checkout/checkout',
      })
    }, 220) as unknown as number
  },
})
