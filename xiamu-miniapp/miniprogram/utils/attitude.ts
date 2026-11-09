import { getProductById } from '../data/products'

export type ProductAttitudeKey = 'favorite' | 'wishlist' | 'played' | 'owned' | 'like'

export interface ProductAttitudeRecord {
  productId: number
  favorite: boolean
  wishlist: boolean
  played: boolean
  owned: boolean
  like: boolean
  updatedAt: number
}

export interface ProductAttitudeMeta {
  id: number
  key: ProductAttitudeKey
  label: string
  iconPath: string
}

export const PRODUCT_ATTITUDE_STORAGE_KEY = 'mine-product-attitudes'

export const productAttitudeMetas: ProductAttitudeMeta[] = [
  {
    id: 1,
    key: 'wishlist',
    label: '想玩',
    iconPath: '/pages/images/mine-images/attitude/想玩.png',
  },
  {
    id: 2,
    key: 'played',
    label: '玩过',
    iconPath: '/pages/images/mine-images/attitude/玩过.png',
  },
  {
    id: 3,
    key: 'owned',
    label: '已拥有',
    iconPath: '/pages/images/mine-images/attitude/已拥有.png',
  },
  {
    id: 4,
    key: 'like',
    label: '点赞',
    iconPath: '/pages/images/mine-images/attitude/收藏.png',
  },
  {
    id: 5,
    key: 'favorite',
    label: '收藏',
    iconPath: '/pages/images/mine-images/attitude/收藏.png',
  },
]

const createDefaultAttitudeRecord = (productId = 0): ProductAttitudeRecord => ({
  productId,
  favorite: false,
  wishlist: false,
  played: false,
  owned: false,
  like: false,
  updatedAt: 0,
})

const isProductAttitudeKey = (value: string): value is ProductAttitudeKey => {
  return productAttitudeMetas.some((item) => item.key === value)
}

const normalizeStoredRecord = (value: unknown): ProductAttitudeRecord | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawRecord = value as Partial<ProductAttitudeRecord>
  const productId = Number(rawRecord.productId || 0)

  if (!productId) {
    return null
  }

  return {
    productId,
    favorite: Boolean(rawRecord.favorite),
    wishlist: Boolean(rawRecord.wishlist),
    played: Boolean(rawRecord.played),
    owned: Boolean(rawRecord.owned),
    like: Boolean(rawRecord.like),
    updatedAt: Number(rawRecord.updatedAt || 0),
  }
}

const hasAnyAttitude = (record: ProductAttitudeRecord): boolean => {
  return productAttitudeMetas.some((item) => record[item.key])
}

const isVisibleAttitudeProduct = (productId: number): boolean => {
  return Boolean(getProductById(productId))
}

export const getStoredProductAttitudes = (): ProductAttitudeRecord[] => {
  const storedValue = wx.getStorageSync(PRODUCT_ATTITUDE_STORAGE_KEY) as unknown

  if (!Array.isArray(storedValue)) {
    return []
  }

  return storedValue
    .map((item) => normalizeStoredRecord(item))
    .filter((item): item is ProductAttitudeRecord => Boolean(item))
}

export const getProductAttitudeRecord = (productId: number): ProductAttitudeRecord => {
  const matchedRecord = getStoredProductAttitudes().find((item) => item.productId === productId)

  return matchedRecord || createDefaultAttitudeRecord(productId)
}

export const getProductAttitudeState = (productId: number): Record<ProductAttitudeKey, boolean> => {
  const record = getProductAttitudeRecord(productId)

  return productAttitudeMetas.reduce<Record<ProductAttitudeKey, boolean>>((result, item) => {
    result[item.key] = record[item.key]
    return result
  }, {
  favorite: false,
    wishlist: false,
    played: false,
    owned: false,
    like: false,
  })
}

export const getAttitudeCounts = (): Record<ProductAttitudeKey, number> => {
  const storedRecords = getStoredProductAttitudes()
  const visibleRecords = storedRecords.filter((record) => isVisibleAttitudeProduct(record.productId))

  return productAttitudeMetas.reduce<Record<ProductAttitudeKey, number>>((result, item) => {
    result[item.key] = visibleRecords.filter((record) => record[item.key]).length
    return result
  }, {
    favorite: 0,
    wishlist: 0,
    played: 0,
    owned: 0,
    like: 0,
  })
}

export const toggleProductAttitude = (
  productId: number,
  key: ProductAttitudeKey,
): ProductAttitudeRecord => {
  const storedRecords = getStoredProductAttitudes()
  const recordIndex = storedRecords.findIndex((item) => item.productId === productId)
  const currentRecord = recordIndex >= 0 ? storedRecords[recordIndex] : createDefaultAttitudeRecord(productId)

  const nextRecord: ProductAttitudeRecord = {
    ...currentRecord,
    [key]: !currentRecord[key],
    updatedAt: Date.now(),
  }

  if (!hasAnyAttitude(nextRecord)) {
    const nextRecords = storedRecords.filter((item) => item.productId !== productId)
    wx.setStorageSync(PRODUCT_ATTITUDE_STORAGE_KEY, nextRecords)
    return nextRecord
  }

  const nextRecords = [...storedRecords]

  if (recordIndex >= 0) {
    nextRecords.splice(recordIndex, 1, nextRecord)
  } else {
    nextRecords.push(nextRecord)
  }

  wx.setStorageSync(PRODUCT_ATTITUDE_STORAGE_KEY, nextRecords)
  return nextRecord
}

export const clearProductAttitudeByKey = (key: ProductAttitudeKey): number => {
  const storedRecords = getStoredProductAttitudes()
  const nextRecords = storedRecords
    .map((item) => ({
      ...item,
      [key]: false,
      updatedAt: item[key] ? Date.now() : item.updatedAt,
    }))
    .filter((item) => hasAnyAttitude(item))

  wx.setStorageSync(PRODUCT_ATTITUDE_STORAGE_KEY, nextRecords)
  return nextRecords.filter((item) => item[key]).length
}

export const removeProductAttitude = (productId: number, key: ProductAttitudeKey): number => {
  const storedRecords = getStoredProductAttitudes()
  const recordIndex = storedRecords.findIndex((item) => item.productId === productId)

  if (recordIndex < 0) {
    return 0
  }

  const currentRecord = storedRecords[recordIndex]
  const nextRecord: ProductAttitudeRecord = {
    ...currentRecord,
    [key]: false,
    updatedAt: currentRecord[key] ? Date.now() : currentRecord.updatedAt,
  }

  const nextRecords = hasAnyAttitude(nextRecord)
    ? storedRecords.map((item, index) => (index === recordIndex ? nextRecord : item))
    : storedRecords.filter((item) => item.productId !== productId)

  wx.setStorageSync(PRODUCT_ATTITUDE_STORAGE_KEY, nextRecords)
  return nextRecords.filter((item) => item[key]).length
}

export const getProductIdsByAttitude = (key: ProductAttitudeKey): number[] => {
  return getStoredProductAttitudes()
    .filter((item) => isVisibleAttitudeProduct(item.productId))
    .filter((item) => item[key])
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((item) => item.productId)
}

export const getAttitudeMetaByLabel = (label: string): ProductAttitudeMeta | undefined => {
  return productAttitudeMetas.find((item) => item.label === label)
}

export const getAttitudeMetaByKey = (key: string): ProductAttitudeMeta | undefined => {
  if (!isProductAttitudeKey(key)) {
    return undefined
  }

  return productAttitudeMetas.find((item) => item.key === key)
}

export const getAttitudeLabelByKey = (key: string): string => {
  if (!isProductAttitudeKey(key)) {
    return ''
  }

  const matchedMeta = productAttitudeMetas.find((item) => item.key === key)
  return matchedMeta ? matchedMeta.label : ''
}
