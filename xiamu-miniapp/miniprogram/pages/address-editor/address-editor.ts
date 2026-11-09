import { listSavedAddresses, saveAddress } from '../../utils/address'
import {
  buildAddressLocationMarkers,
  chooseAddressLocation,
  hasAddressLocation,
  AddressLocationMarker,
} from '../../utils/address-location'
import { shouldIgnoreRapidBackTap, BackTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface AddressEditorData {
  statusBarHeight: number
  pageTitle: string
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
  mapLongitude: number
  mapLatitude: number
  hasLocation: boolean
  locationTitle: string
  locationMarkers: AddressLocationMarker[]
  nameCountText: string
  addressCountText: string
  canSubmit: boolean
  submitButtonText: string
  editingAddressId: number
}

type LoadOptions = Record<string, string | undefined>
type InputEvent = WechatMiniprogram.CustomEvent<{ value: string }>
type RegionChangeEvent = WechatMiniprogram.CustomEvent<{ value: string[] }>

interface AddressEditorPage extends BackTapGuard {
  saving?: boolean
  backTimer?: number
  onLoad(options: LoadOptions): void
  onUnload(): void
  loadEditingAddress(addressId: number): Promise<void>
  syncFormMeta(patch?: Partial<Pick<AddressEditorData, 'recipientName' | 'recipientPhone' | 'province' | 'city' | 'district' | 'addressDetail' | 'editingAddressId'>>): void
  navigateBack(): void
  onRecipientNameInput(event: InputEvent): void
  onRecipientPhoneInput(event: InputEvent): void
  onRegionChange(event: RegionChangeEvent): void
  onChooseLocation(): Promise<void>
  onAddressDetailInput(event: InputEvent): void
  onSubmitTap(): Promise<void>
}

const DEFAULT_MAP_LOCATION = {
  latitude: 31.2304,
  longitude: 121.4737,
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
  mapLongitude: DEFAULT_MAP_LOCATION.longitude,
  mapLatitude: DEFAULT_MAP_LOCATION.latitude,
  hasLocation: false,
  locationTitle: '',
  locationMarkers: [],
  editingAddressId: 0,
})

Page<AddressEditorData, AddressEditorPage>({
  data: {
    statusBarHeight: 20,
    pageTitle: '新增地址',
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
    mapLongitude: DEFAULT_MAP_LOCATION.longitude,
    mapLatitude: DEFAULT_MAP_LOCATION.latitude,
    hasLocation: false,
    locationTitle: '',
    locationMarkers: [],
    nameCountText: '0/20',
    addressCountText: '0/120',
    canSubmit: false,
    submitButtonText: '确认并返回',
    editingAddressId: 0,
  },

  onLoad(options: LoadOptions) {
    const editingAddressId = Number(options.addressId || 0)

    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })

    if (editingAddressId > 0) {
      this.loadEditingAddress(editingAddressId).catch(() => {
        wx.showToast({
          title: '地址不存在',
          icon: 'none',
        })
      })
      return
    }

    const nextState = createEmptyFormState()
    this.setData(nextState)
    this.syncFormMeta(nextState)
  },

  onUnload() {
    if (this.backTimer) {
      clearTimeout(this.backTimer)
      this.backTimer = 0
    }
  },

  async loadEditingAddress(addressId: number) {
    const savedAddresses = await listSavedAddresses()
    const selectedAddress = savedAddresses.find((item) => item.id === addressId)

    if (!selectedAddress) {
      throw new Error('地址不存在')
    }

    const hasSavedLocation = hasAddressLocation(selectedAddress.latitude, selectedAddress.longitude)
    this.setData({
      recipientName: selectedAddress.recipientName,
      recipientPhone: selectedAddress.recipientPhone,
      province: selectedAddress.province,
      city: selectedAddress.city,
      district: selectedAddress.district,
      regionValue: [selectedAddress.province, selectedAddress.city, selectedAddress.district],
      regionText: [selectedAddress.province, selectedAddress.city, selectedAddress.district].filter(Boolean).join(' '),
      addressDetail: selectedAddress.addressDetail,
      longitude: selectedAddress.longitude,
      latitude: selectedAddress.latitude,
      mapLongitude: hasSavedLocation ? Number(selectedAddress.longitude) : DEFAULT_MAP_LOCATION.longitude,
      mapLatitude: hasSavedLocation ? Number(selectedAddress.latitude) : DEFAULT_MAP_LOCATION.latitude,
      hasLocation: hasSavedLocation,
      locationTitle: selectedAddress.addressDetail,
      locationMarkers: buildAddressLocationMarkers(selectedAddress.latitude, selectedAddress.longitude, selectedAddress.addressDetail),
      editingAddressId: selectedAddress.id,
    })
    this.syncFormMeta({
      recipientName: selectedAddress.recipientName,
      recipientPhone: selectedAddress.recipientPhone,
      province: selectedAddress.province,
      city: selectedAddress.city,
      district: selectedAddress.district,
      addressDetail: selectedAddress.addressDetail,
      editingAddressId: selectedAddress.id,
    })

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
      pageTitle: isEditing ? '编辑地址' : '新增地址',
      nameCountText: `${trimmedName.length}/20`,
      addressCountText: `${trimmedAddress.length}/120`,
      canSubmit: Boolean(trimmedName && /^1\d{10}$/.test(trimmedPhone) && province.trim() && city.trim() && district.trim() && trimmedAddress),
      submitButtonText: isEditing ? '保存修改并返回' : '确认并返回',
      editingAddressId,
    })
  },

  navigateBack() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/address-form/address-form?mode=manage',
        })
      },
    })
  },

  onRecipientNameInput(event: InputEvent) {
    const recipientName = event.detail.value
    this.setData({ recipientName })
    this.syncFormMeta({ recipientName })
  },

  onRecipientPhoneInput(event: InputEvent) {
    const recipientPhone = event.detail.value
    this.setData({ recipientPhone })
    this.syncFormMeta({ recipientPhone })
  },

  onRegionChange(event: RegionChangeEvent) {
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
          : { latitude: this.data.mapLatitude, longitude: this.data.mapLongitude },
      )
      const addressDetail = location.addressDetail

      this.setData({
        addressDetail,
        latitude: location.latitude,
        longitude: location.longitude,
        mapLatitude: location.latitude,
        mapLongitude: location.longitude,
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

  onAddressDetailInput(event: InputEvent) {
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
        this.navigateBack()
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
