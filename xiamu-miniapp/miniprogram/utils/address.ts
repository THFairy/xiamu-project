import {
  createAddress,
  deleteAddress as deleteBackendAddress,
  fetchAddresses,
  getBackendToken,
  updateAddress,
  BackendAddress,
} from './backend'

export interface AddressRecord {
  id: number
  recipientName: string
  recipientPhone: string
  addressDetail: string
  province: string
  city: string
  district: string
  postalCode: string
  longitude: number | null
  latitude: number | null
  belongToUsername: string
  belongToUid: string
  isDefault: boolean
}

const ADDRESS_STORAGE_KEY = 'purchase-selected-address'
const LEGACY_ADDRESS_STORAGE_KEY = 'purchase-default-address'

const normalizeAddress = (address: Partial<AddressRecord> | null | undefined): AddressRecord | null => {
  if (!address) {
    return null
  }

  const recipientName = String(address.recipientName || '').trim()
  const recipientPhone = String(address.recipientPhone || '').trim()
  const addressDetail = String(address.addressDetail || '').trim()

  if (!recipientName || !recipientPhone || !addressDetail) {
    return null
  }

  return {
    id: Number(address.id || 0),
    recipientName,
    recipientPhone,
    addressDetail,
    province: String(address.province || '').trim(),
    city: String(address.city || '').trim(),
    district: String(address.district || '').trim(),
    postalCode: String(address.postalCode || '').trim(),
    longitude: typeof address.longitude === 'number' && Number.isFinite(address.longitude) ? address.longitude : null,
    latitude: typeof address.latitude === 'number' && Number.isFinite(address.latitude) ? address.latitude : null,
    belongToUsername: String(address.belongToUsername || '').trim(),
    belongToUid: String(address.belongToUid || '').trim(),
    isDefault: address.isDefault !== false,
  }
}

const mapBackendAddress = (address: BackendAddress): AddressRecord | null => {
  return normalizeAddress({
    id: address.id,
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    addressDetail: address.addressDetail,
    province: address.province,
    city: address.city,
    district: address.district,
    postalCode: address.postalCode,
    longitude: address.longitude,
    latitude: address.latitude,
    belongToUsername: address.belongToUsername,
    belongToUid: address.belongToUid,
    isDefault: Boolean(address.isDefault),
  })
}

const sortAddresses = (addresses: AddressRecord[]): AddressRecord[] => {
  return [...addresses].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1
    }

    return right.id - left.id
  })
}

const isSameAddress = (left: AddressRecord, right: AddressRecord): boolean => {
  if (left.id > 0 && right.id > 0) {
    return left.id === right.id
  }

  return left.recipientName === right.recipientName
    && left.recipientPhone === right.recipientPhone
    && left.addressDetail === right.addressDetail
}

const resolvePreferredAddress = (
  addresses: AddressRecord[],
  preferredAddress?: AddressRecord | null,
): AddressRecord | null => {
  if (!addresses.length) {
    return null
  }

  if (preferredAddress) {
    const matchedAddress = addresses.find((item) => isSameAddress(item, preferredAddress))
    if (matchedAddress) {
      return matchedAddress
    }
  }

  return addresses.find((item) => item.isDefault) || addresses[0] || null
}

export const getCachedAddress = (): AddressRecord | null => {
  const cachedAddress = (
    wx.getStorageSync(ADDRESS_STORAGE_KEY)
    || wx.getStorageSync(LEGACY_ADDRESS_STORAGE_KEY)
  ) as Partial<AddressRecord> | undefined
  return normalizeAddress(cachedAddress)
}

export const saveCachedAddress = (address: AddressRecord | null): void => {
  if (!address) {
    wx.removeStorageSync(ADDRESS_STORAGE_KEY)
    wx.removeStorageSync(LEGACY_ADDRESS_STORAGE_KEY)
    return
  }

  wx.setStorageSync(ADDRESS_STORAGE_KEY, address)
  wx.setStorageSync(LEGACY_ADDRESS_STORAGE_KEY, address)
}

export const listSavedAddresses = async (): Promise<AddressRecord[]> => {
  if (!getBackendToken()) {
    const cachedAddress = getCachedAddress()
    return cachedAddress ? [cachedAddress] : []
  }

  const mappedAddresses = (await fetchAddresses())
    .map(mapBackendAddress)
    .filter((item): item is AddressRecord => Boolean(item))

  const sortedAddresses = sortAddresses(mappedAddresses)
  saveCachedAddress(resolvePreferredAddress(sortedAddresses, getCachedAddress()))
  return sortedAddresses
}

export const syncDefaultAddressFromServer = async (): Promise<AddressRecord | null> => {
  const savedAddresses = await listSavedAddresses()
  return resolvePreferredAddress(savedAddresses, getCachedAddress())
}

export const saveAddress = async (
  draft: {
    recipientName: string
    recipientPhone: string
    province: string
    city: string
    district: string
    addressDetail: string
    longitude?: number | null
    latitude?: number | null
  },
  addressId = 0,
): Promise<AddressRecord> => {
  const normalizedDraft = normalizeAddress({
    id: addressId,
    recipientName: draft.recipientName,
    recipientPhone: draft.recipientPhone,
    province: draft.province,
    city: draft.city,
    district: draft.district,
    addressDetail: draft.addressDetail,
    longitude: draft.longitude,
    latitude: draft.latitude,
    isDefault: true,
  })

  if (!normalizedDraft) {
    throw new Error('收货地址信息不完整')
  }

  if (!getBackendToken()) {
    const localAddress: AddressRecord = {
      ...normalizedDraft,
      id: addressId > 0 ? addressId : Date.now(),
      isDefault: true,
    }
    saveCachedAddress(localAddress)
    return localAddress
  }

  const payload = {
    recipientName: normalizedDraft.recipientName,
    recipientPhone: normalizedDraft.recipientPhone,
    province: normalizedDraft.province,
    city: normalizedDraft.city,
    district: normalizedDraft.district,
    addressDetail: normalizedDraft.addressDetail,
    postalCode: normalizedDraft.postalCode,
    longitude: normalizedDraft.longitude,
    latitude: normalizedDraft.latitude,
    isDefault: true,
  }

  const savedAddress = addressId > 0
    ? await updateAddress(addressId, payload)
    : await createAddress(payload)
  const mappedAddress = savedAddress ? mapBackendAddress(savedAddress) : null

  if (!mappedAddress) {
    throw new Error('收货地址保存失败')
  }

  saveCachedAddress(mappedAddress)
  return mappedAddress
}

export const setDefaultSavedAddress = async (addressId = 0): Promise<AddressRecord | null> => {
  if (!getBackendToken()) {
    const cachedAddress = getCachedAddress()
    saveCachedAddress(cachedAddress)
    return cachedAddress
  }

  if (!addressId) {
    throw new Error('地址不存在')
  }

  const updatedAddress = await updateAddress(addressId, {
    isDefault: true,
  })
  const mappedAddress = updatedAddress ? mapBackendAddress(updatedAddress) : null

  if (!mappedAddress) {
    throw new Error('默认地址设置失败')
  }

  saveCachedAddress(mappedAddress)
  return mappedAddress
}

export const deleteSavedAddress = async (addressId = 0): Promise<void> => {
  if (!getBackendToken()) {
    saveCachedAddress(null)
    return
  }

  if (!addressId) {
    throw new Error('地址不存在')
  }

  await deleteBackendAddress(addressId)
  const nextAddresses = await listSavedAddresses()
  saveCachedAddress(nextAddresses[0] || null)
}
