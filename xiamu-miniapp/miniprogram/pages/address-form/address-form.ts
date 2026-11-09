import {
  listSavedAddresses,
  saveAddress,
  saveCachedAddress,
  deleteSavedAddress,
  setDefaultSavedAddress,
  getCachedAddress,
  AddressRecord,
} from '../../utils/address'
import { buildAddressLocationMarkers, chooseAddressLocation, hasAddressLocation, AddressLocationMarker } from '../../utils/address-location'
import { shouldIgnoreRapidBackTap, shouldIgnoreRapidNavigationTap, BackTapGuard, NavigationTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface SavedAddressCard extends AddressRecord {
  summaryText: string
  fullAddressText: string
}

type AddressPageMode = 'select' | 'manage' | 'picker'

interface AddressFormData {
  statusBarHeight: number
  isManageMode: boolean
  showPickerSelector: boolean
  showInlineForm: boolean
  pageTitle: string
  savedSectionTitle: string
  addActionText: string
  emptySavedText: string
  introTitle: string
  introDesc: string
  formHint: string
  formModeText: string
  recipientName: string
  recipientPhone: string
  province: string
  city: string
  district: string
  regionValue: string[]
  regionText: string
  addressDetail: string
  longitude: number | null
  latitude: number | null
  hasLocation: boolean
  locationTitle: string
  locationMarkers: AddressLocationMarker[]
  nameCountText: string
  addressCountText: string
  canSubmit: boolean
  submitButtonText: string
  savedAddresses: SavedAddressCard[]
  selectedAddressId: number
  editingAddressId: number
  scrollTargetId: string
}

type InputEvent = WechatMiniprogram.CustomEvent<{
  value: string
}>

type RegionChangeEvent = WechatMiniprogram.CustomEvent<{
  value: string[]
}>

type AddressActionEvent = WechatMiniprogram.TouchEvent<{}, {}, { addressId?: number }>
type LoadOptions = Record<string, string | undefined>

const PICKER_SOURCE_ROUTES = new Set([
  'pages/buying-checkout/buying-checkout',
  'pages/buying-confirmation/buying-confirmation',
  'pages/pickup-service/pickup-service',
])

const resolveAddressPageMode = (options: LoadOptions): AddressPageMode => {
  if (options.mode === 'manage') {
    return 'manage'
  }

  if (options.mode === 'picker') {
    return 'picker'
  }

  const pageStack = getCurrentPages()
  const previousPage = pageStack[pageStack.length - 2]
  const previousRoute = String(previousPage?.route || '').trim()

  if (PICKER_SOURCE_ROUTES.has(previousRoute)) {
    return 'picker'
  }

  return 'select'
}

interface AddressFormPage extends BackTapGuard, NavigationTapGuard {
  pageMode?: AddressPageMode
  saving?: boolean
  backTimer?: number
  onLoad(options: LoadOptions): void
  onShow(): void
  onUnload(): void
  loadAddressState(): Promise<void>
  syncFormMeta(patch?: Partial<Pick<AddressFormData, 'recipientName' | 'recipientPhone' | 'province' | 'city' | 'district' | 'addressDetail' | 'editingAddressId'>>): void
  scrollToForm(): void
  fillForm(address?: AddressRecord | null, options?: { scrollToForm?: boolean }): void
  resetForm(): void
  goToEditor(addressId?: number): void
  onBackTap(): void
  onAddTap(): void
  onSavedAddressTap(event: AddressActionEvent): void
  onEditTap(event: AddressActionEvent): void
  onSetDefaultTap(event: AddressActionEvent): void
  onDeleteTap(event: AddressActionEvent): void
  onRecipientNameInput(event: InputEvent): void
  onRecipientPhoneInput(event: InputEvent): void
  onRegionChange(event: RegionChangeEvent): void
  onChooseLocation(): Promise<void>
  onAddressDetailInput(event: InputEvent): void
  onSubmitTap(): Promise<void>
}

const toSavedAddressCard = (address: AddressRecord): SavedAddressCard => ({
  ...address,
  summaryText: `${address.recipientName} ${address.recipientPhone}`,
  fullAddressText: [address.province, address.city, address.district, address.addressDetail].filter(Boolean).join(' '),
})

const isSameAddress = (left: AddressRecord, right: AddressRecord): boolean => {
  if (left.id > 0 && right.id > 0) {
    return left.id === right.id
  }

  return left.recipientName === right.recipientName
    && left.recipientPhone === right.recipientPhone
    && left.addressDetail === right.addressDetail
}

const createEmptyFormState = () => ({
  recipientName: '',
  recipientPhone: '',
  province: '',
  city: '',
  district: '',
  regionValue: [],
  regionText: '',
  addressDetail: '',
  longitude: null,
  latitude: null,
  hasLocation: false,
  locationTitle: '',
  locationMarkers: [],
  editingAddressId: 0,
})

Page<AddressFormData, AddressFormPage>({
  data: {
    statusBarHeight: 20,
    isManageMode: false,
    showPickerSelector: false,
    showInlineForm: true,
    pageTitle: '填写收货地址',
    savedSectionTitle: '已保存地址',
    addActionText: '新增',
    emptySavedText: '还没有已保存地址，填写下方表单后即可保存。',
    introTitle: '填写你的收货信息',
    introDesc: '保存后会自动带回确认订单页，不再使用悬浮窗录入。',
    formHint: '新增时表单默认空白，点击上方地址可编辑已有地址。',
    formModeText: '新增地址',
    recipientName: '',
    recipientPhone: '',
    province: '',
    city: '',
    district: '',
    regionValue: [],
    regionText: '',
    addressDetail: '',
    longitude: null,
    latitude: null,
    hasLocation: false,
    locationTitle: '',
    locationMarkers: [],
    nameCountText: '0/20',
    addressCountText: '0/120',
    canSubmit: false,
    submitButtonText: '确认并返回',
    savedAddresses: [],
    selectedAddressId: 0,
    editingAddressId: 0,
    scrollTargetId: '',
  },

  onLoad(options: LoadOptions) {
    this.pageMode = resolveAddressPageMode(options)

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      isManageMode: this.pageMode === 'manage',
      showPickerSelector: this.pageMode === 'picker',
      showInlineForm: this.pageMode === 'select',
      pageTitle: this.pageMode === 'manage' ? '我的地址' : '填写收货地址',
    })
  },

  onShow() {
    this.loadAddressState().catch(() => {})
  },

  onUnload() {
    if (this.backTimer) {
      clearTimeout(this.backTimer)
      this.backTimer = 0
    }
  },

  async loadAddressState() {
    const savedAddresses = (await listSavedAddresses()).map(toSavedAddressCard)
    const cachedAddress = getCachedAddress()
    const selectedAddressId = cachedAddress
      ? (savedAddresses.find((item) => isSameAddress(item, cachedAddress))?.id || 0)
      : 0

    this.setData({
      savedAddresses,
      selectedAddressId,
    })

    if (this.data.editingAddressId > 0) {
      const currentEditingAddress = savedAddresses.find((item) => item.id === this.data.editingAddressId) || null
      if (currentEditingAddress) {
        this.fillForm(currentEditingAddress)
        return
      }
    }

    this.resetForm()
  },

  syncFormMeta(patch = {}) {
    const recipientName = typeof patch.recipientName === 'string' ? patch.recipientName : this.data.recipientName
    const recipientPhone = typeof patch.recipientPhone === 'string' ? patch.recipientPhone : this.data.recipientPhone
    const province = typeof patch.province === 'string' ? patch.province : this.data.province
    const city = typeof patch.city === 'string' ? patch.city : this.data.city
    const district = typeof patch.district === 'string' ? patch.district : this.data.district
    const addressDetail = typeof patch.addressDetail === 'string' ? patch.addressDetail : this.data.addressDetail
    const editingAddressId = typeof patch.editingAddressId === 'number' ? patch.editingAddressId : this.data.editingAddressId
    const trimmedName = recipientName.trim()
    const trimmedPhone = recipientPhone.trim()
    const trimmedAddress = addressDetail.trim()
    const isEditing = editingAddressId > 0

    this.setData({
      nameCountText: `${trimmedName.length}/20`,
      addressCountText: `${trimmedAddress.length}/120`,
      canSubmit: Boolean(trimmedName && /^1\d{10}$/.test(trimmedPhone) && province.trim() && city.trim() && district.trim() && trimmedAddress),
      formModeText: isEditing ? '编辑地址' : '新增地址',
      submitButtonText: isEditing ? '保存修改并返回' : '确认并返回',
      editingAddressId,
    })
  },

  scrollToForm() {
    this.setData({
      scrollTargetId: '',
    })
    wx.nextTick(() => {
      this.setData({
        scrollTargetId: 'address-form-panel',
      })
    })
  },

  fillForm(address?: AddressRecord | null, options?: { scrollToForm?: boolean }) {
    if (!address) {
      this.resetForm()
      return
    }

    this.setData({
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
      province: address.province,
      city: address.city,
      district: address.district,
      regionValue: [address.province, address.city, address.district],
      regionText: [address.province, address.city, address.district].filter(Boolean).join(' '),
      addressDetail: address.addressDetail,
      longitude: address.longitude,
      latitude: address.latitude,
      hasLocation: hasAddressLocation(address.latitude, address.longitude),
      locationTitle: address.addressDetail,
      locationMarkers: buildAddressLocationMarkers(address.latitude, address.longitude, address.addressDetail),
      editingAddressId: address.id,
    })
    this.syncFormMeta({
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
      province: address.province,
      city: address.city,
      district: address.district,
      addressDetail: address.addressDetail,
      editingAddressId: address.id,
    })

    if (options?.scrollToForm) {
      this.scrollToForm()
    }
  },

  resetForm() {
    const nextState = createEmptyFormState()
    this.setData(nextState)
    this.syncFormMeta(nextState)
  },

  goToEditor(addressId = 0) {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    const query = addressId > 0 ? `?addressId=${addressId}` : ''
    wx.navigateTo({
      url: `/pages/address-editor/address-editor${query}`,
    })
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

  onAddTap() {
    if (this.pageMode === 'manage' || this.pageMode === 'picker') {
      this.goToEditor()
      return
    }

    this.resetForm()
    this.scrollToForm()
  },

  onSavedAddressTap(event: AddressActionEvent) {
    const addressId = Number(event.currentTarget.dataset.addressId || 0)
    const selectedAddress = this.data.savedAddresses.find((item) => item.id === addressId)

    if (!selectedAddress) {
      return
    }

    if (this.pageMode === 'manage') {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    this.setData({
      selectedAddressId: addressId,
    })
    saveCachedAddress(selectedAddress)
    wx.navigateBack({
      fail: () => {
        this.fillForm(selectedAddress, { scrollToForm: true })
      },
    })
  },

  onEditTap(event: AddressActionEvent) {
    const addressId = Number(event.currentTarget.dataset.addressId || 0)
    const selectedAddress = this.data.savedAddresses.find((item) => item.id === addressId)

    if (!selectedAddress) {
      return
    }

    if (this.pageMode === 'manage' || this.pageMode === 'picker') {
      this.goToEditor(addressId)
      return
    }

    this.fillForm(selectedAddress, { scrollToForm: true })
  },

  onSetDefaultTap(event: AddressActionEvent) {
    const addressId = Number(event.currentTarget.dataset.addressId || 0)
    const selectedAddress = this.data.savedAddresses.find((item) => item.id === addressId)

    if (!selectedAddress || selectedAddress.isDefault) {
      return
    }

    wx.showModal({
      title: '设为默认地址',
      content: `确认将“${selectedAddress.recipientName} ${selectedAddress.recipientPhone}”设为默认收货地址吗？后续确认购买会优先带入这条地址。`,
      confirmText: '设为默认',
      cancelText: '取消',
      confirmColor: '#d5aa00',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        try {
          await setDefaultSavedAddress(addressId)
          wx.showToast({
            title: '已设为默认',
            icon: 'success',
          })
          await this.loadAddressState()
        } catch (error) {
          wx.showToast({
            title: error instanceof Error ? error.message : '设置默认失败',
            icon: 'none',
          })
        }
      },
    })
  },

  onDeleteTap(event: AddressActionEvent) {
    const addressId = Number(event.currentTarget.dataset.addressId || 0)
    const selectedAddress = this.data.savedAddresses.find((item) => item.id === addressId)

    if (!selectedAddress) {
      return
    }

    wx.showModal({
      title: '删除收货地址',
      content: `确认删除“${selectedAddress.recipientName} ${selectedAddress.recipientPhone}”这条收货地址吗？删除后将无法自动带回确认购买页。`,
      confirmText: '确认删除',
      cancelText: '我再想想',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        try {
          await deleteSavedAddress(addressId)
          wx.showToast({
            title: '删除成功',
            icon: 'success',
          })

          if (this.data.editingAddressId === addressId) {
            this.resetForm()
          }

          await this.loadAddressState()
        } catch (error) {
          wx.showToast({
            title: error instanceof Error ? error.message : '删除失败',
            icon: 'none',
          })
        }
      },
    })
  },

  onRecipientNameInput(event) {
    const recipientName = event.detail.value
    this.setData({ recipientName })
    this.syncFormMeta({ recipientName })
  },

  onRecipientPhoneInput(event) {
    const recipientPhone = event.detail.value
    this.setData({ recipientPhone })
    this.syncFormMeta({ recipientPhone })
  },

  onRegionChange(event) {
    const regionValues = Array.isArray(event.detail.value) ? event.detail.value : []
    const province = regionValues[0] || ''
    const city = regionValues[1] || ''
    const district = regionValues[2] || ''
    const regionValue = [province, city, district]

    this.setData({
      province,
      city,
      district,
      regionValue,
      regionText: regionValue.filter(Boolean).join(' '),
    })
    this.syncFormMeta({ province, city, district })
  },

  async onChooseLocation() {
    try {
      const location = await chooseAddressLocation(
        hasAddressLocation(this.data.latitude, this.data.longitude)
          ? { latitude: Number(this.data.latitude), longitude: Number(this.data.longitude) }
          : undefined,
      )
      const addressDetail = location.addressDetail

      this.setData({
        addressDetail,
        latitude: location.latitude,
        longitude: location.longitude,
        hasLocation: true,
        locationTitle: location.title,
        locationMarkers: buildAddressLocationMarkers(location.latitude, location.longitude, location.title),
      })
      this.syncFormMeta({ addressDetail })
    } catch (error) {
      if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) {
        wx.showToast({
          title: error instanceof Error ? error.message : '地图选点失败',
          icon: 'none',
        })
      }
    }
  },

  onAddressDetailInput(event) {
    const addressDetail = event.detail.value
    this.setData({ addressDetail })
    this.syncFormMeta({ addressDetail })
  },

  async onSubmitTap() {
    if (this.saving || !this.data.canSubmit) {
      return
    }

    const recipientName = this.data.recipientName.trim()
    const recipientPhone = this.data.recipientPhone.trim()
    const province = this.data.province.trim()
    const city = this.data.city.trim()
    const district = this.data.district.trim()
    const addressDetail = this.data.addressDetail.trim()
    const longitude = this.data.longitude
    const latitude = this.data.latitude
    const editingAddressId = Number(this.data.editingAddressId || 0)

    if (!recipientName) {
      wx.showToast({
        title: '请输入收件人姓名',
        icon: 'none',
      })
      return
    }

    if (!/^1\d{10}$/.test(recipientPhone)) {
      wx.showToast({
        title: '请输入正确手机号',
        icon: 'none',
      })
      return
    }

    if (!province || !city || !district) {
      wx.showToast({
        title: '请选择省市区',
        icon: 'none',
      })
      return
    }

    if (!addressDetail) {
      wx.showToast({
        title: '请输入详细收货地址',
        icon: 'none',
      })
      return
    }

    this.saving = true
    this.setData({
      submitButtonText: editingAddressId > 0 ? '保存修改中...' : '保存中...',
      canSubmit: false,
    })

    try {
      await saveAddress(
        {
          recipientName,
          recipientPhone,
          province,
          city,
          district,
          addressDetail,
          longitude,
          latitude,
        },
        editingAddressId,
      )

      wx.showToast({
        title: editingAddressId > 0 ? '修改成功' : '保存成功',
        icon: 'success',
      })

      if (this.backTimer) {
        clearTimeout(this.backTimer)
      }

      this.backTimer = setTimeout(() => {
        this.backTimer = 0
        wx.navigateBack()
      }, 220) as unknown as number
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '地址保存失败',
        icon: 'none',
      })
    } finally {
      this.saving = false
      this.syncFormMeta({
        recipientName,
        recipientPhone,
        province,
        city,
        district,
        addressDetail,
        editingAddressId,
      })
    }
  },
})
