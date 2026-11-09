export interface RecycleProductRecord {
  recycleProductId?: number
  categoryKey?: string
  title: string
  coverLabel: string
  coverImage?: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  payoutMethodLabel: string
  accountNumber: string
  realName: string
  optionSummary: string
  selectedDeviceOptionValues: Record<string, string>
  selectedDeviceOptionTexts: Record<string, string>
  submissionImages?: string[]
  addedAt: number
}

export interface RecycleEstimateBreakdownItem {
  label: string
  amount: number
}

export interface PendingRecycleOrderRecord extends RecycleProductRecord {
  estimateSupported: boolean
  estimateBasePrice: number
  estimateFinalPrice: number
  note: string
}

export const RECYCLE_STORAGE_KEY = 'order-local-recycle-products'
export const PENDING_RECYCLE_STORAGE_KEY = 'order-local-pending-recycle-orders'

const isRecycleCoverTheme = (value: unknown): value is RecycleProductRecord['coverTheme'] => {
  return value === 'red' || value === 'blue' || value === 'gray' || value === 'green'
}

const getSafeOptionMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.keys(value).reduce<Record<string, string>>((result, key) => {
    const mapValue = (value as Record<string, unknown>)[key]

    if (typeof mapValue === 'string') {
      result[key] = mapValue
    }

    return result
  }, {})
}

const getSafeImageList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

const getStoredRecycleItems = (): RecycleProductRecord[] => {
  const recycleItems = wx.getStorageSync(RECYCLE_STORAGE_KEY) as RecycleProductRecord[] | undefined

  if (!Array.isArray(recycleItems)) {
    return []
  }

  return recycleItems
    .filter(
      (item) =>
        Boolean(item) &&
        typeof item.title === 'string' &&
        typeof item.coverLabel === 'string',
    )
    .map((item) => ({
      recycleProductId: typeof item.recycleProductId === 'number' ? item.recycleProductId : 0,
      categoryKey: typeof item.categoryKey === 'string' ? item.categoryKey : '',
      title: item.title,
      coverLabel: item.coverLabel,
      coverImage: typeof item.coverImage === 'string' ? item.coverImage : '',
      coverTheme: isRecycleCoverTheme(item.coverTheme) ? item.coverTheme : 'red',
      payoutMethodLabel: typeof item.payoutMethodLabel === 'string' ? item.payoutMethodLabel : '',
      accountNumber: typeof item.accountNumber === 'string' ? item.accountNumber : '',
      realName: typeof item.realName === 'string' ? item.realName : '',
      optionSummary: typeof item.optionSummary === 'string' ? item.optionSummary : '',
      selectedDeviceOptionValues: getSafeOptionMap(item.selectedDeviceOptionValues),
      selectedDeviceOptionTexts: getSafeOptionMap(item.selectedDeviceOptionTexts),
      submissionImages: getSafeImageList(item.submissionImages),
      addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
    }))
}

const getStoredPendingRecycleOrders = (): PendingRecycleOrderRecord[] => {
  const recycleItems = wx.getStorageSync(PENDING_RECYCLE_STORAGE_KEY) as PendingRecycleOrderRecord[] | undefined

  if (!Array.isArray(recycleItems)) {
    return []
  }

  return recycleItems
    .filter(
      (item) =>
        Boolean(item) &&
        typeof item.title === 'string' &&
        typeof item.coverLabel === 'string',
    )
    .map((item) => ({
      recycleProductId: typeof item.recycleProductId === 'number' ? item.recycleProductId : 0,
      categoryKey: typeof item.categoryKey === 'string' ? item.categoryKey : '',
      title: item.title,
      coverLabel: item.coverLabel,
      coverImage: typeof item.coverImage === 'string' ? item.coverImage : '',
      coverTheme: isRecycleCoverTheme(item.coverTheme) ? item.coverTheme : 'red',
      payoutMethodLabel: typeof item.payoutMethodLabel === 'string' ? item.payoutMethodLabel : '',
      accountNumber: typeof item.accountNumber === 'string' ? item.accountNumber : '',
      realName: typeof item.realName === 'string' ? item.realName : '',
      optionSummary: typeof item.optionSummary === 'string' ? item.optionSummary : '',
      selectedDeviceOptionValues: getSafeOptionMap(item.selectedDeviceOptionValues),
      selectedDeviceOptionTexts: getSafeOptionMap(item.selectedDeviceOptionTexts),
      submissionImages: getSafeImageList(item.submissionImages),
      addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
      estimateSupported: item.estimateSupported !== false,
      estimateBasePrice: typeof item.estimateBasePrice === 'number' ? item.estimateBasePrice : 0,
      estimateFinalPrice: typeof item.estimateFinalPrice === 'number' ? item.estimateFinalPrice : 0,
      note: typeof item.note === 'string' ? item.note : '',
    }))
}

export const getRecycleProducts = (): RecycleProductRecord[] => {
  return getStoredRecycleItems()
}

export const getPendingRecycleOrders = (): PendingRecycleOrderRecord[] => {
  return getStoredPendingRecycleOrders()
}

export const addProductToRecycleList = (
  item: Omit<RecycleProductRecord, 'addedAt'>,
): { count: number } => {
  const currentItems = getStoredRecycleItems()
  const nextItems = [
    {
      ...item,
      addedAt: Date.now(),
    },
    ...currentItems,
  ]

  wx.setStorageSync(RECYCLE_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}

export const clearRecycleProducts = (): void => {
  wx.removeStorageSync(RECYCLE_STORAGE_KEY)
}

export const removeRecycleProduct = (addedAt: number): { count: number } => {
  const nextItems = getStoredRecycleItems().filter((item) => item.addedAt !== addedAt)

  wx.setStorageSync(RECYCLE_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}

export const addPendingRecycleOrders = (
  items: Array<Omit<PendingRecycleOrderRecord, 'addedAt'>>,
): { count: number } => {
  const currentItems = getStoredPendingRecycleOrders()
  let nextAddedAt = Math.max(
    Date.now(),
    ...currentItems.map((item) => Number(item.addedAt || 0) + 1),
  )
  const occupiedAddedAt = new Set(currentItems.map((item) => item.addedAt))
  const nextItems = [
    ...items.map((item) => {
      while (occupiedAddedAt.has(nextAddedAt)) {
        nextAddedAt += 1
      }

      const addedAt = nextAddedAt
      occupiedAddedAt.add(addedAt)
      nextAddedAt += 1

      return {
        ...item,
        addedAt,
      }
    }),
    ...currentItems,
  ]

  wx.setStorageSync(PENDING_RECYCLE_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}

export const clearPendingRecycleOrders = (): void => {
  wx.removeStorageSync(PENDING_RECYCLE_STORAGE_KEY)
}

export const removePendingRecycleProduct = (addedAt: number): { count: number } => {
  const nextItems = getStoredPendingRecycleOrders().filter((item) => item.addedAt !== addedAt)

  wx.setStorageSync(PENDING_RECYCLE_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}

export const removePendingRecycleProducts = (addedAts: number[]): { count: number } => {
  const selectedSet = new Set(addedAts)
  const nextItems = getStoredPendingRecycleOrders().filter((item) => !selectedSet.has(item.addedAt))

  wx.setStorageSync(PENDING_RECYCLE_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}
