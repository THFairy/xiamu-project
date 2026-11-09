export type PurchaseOrderStatus = 'pending_payment' | 'submitted' | 'paid'

export interface PurchaseOrderRecord {
  productId: number
  addedAt: number
  orderId?: number
  addressId?: number
  recipientName?: string
  recipientPhone?: string
  addressDetail?: string
  paymentMethod?: string
  remark?: string
  totalAmount?: number
  status?: PurchaseOrderStatus
}

export const PURCHASE_STORAGE_KEY = 'order-local-buy-products'

const normalizePurchaseOrder = (item: PurchaseOrderRecord): PurchaseOrderRecord | null => {
  if (!item || typeof item.productId !== 'number' || typeof item.addedAt !== 'number') {
    return null
  }

  return {
    productId: item.productId,
    addedAt: item.addedAt,
    orderId: typeof item.orderId === 'number' ? item.orderId : 0,
    addressId: typeof item.addressId === 'number' ? item.addressId : 0,
    recipientName: typeof item.recipientName === 'string' ? item.recipientName : '',
    recipientPhone: typeof item.recipientPhone === 'string' ? item.recipientPhone : '',
    addressDetail: typeof item.addressDetail === 'string' ? item.addressDetail : '',
    paymentMethod: typeof item.paymentMethod === 'string' ? item.paymentMethod : 'wechat',
    remark: typeof item.remark === 'string' ? item.remark : '',
    totalAmount: typeof item.totalAmount === 'number' ? item.totalAmount : 0,
    status: item.status === 'paid' ? 'paid' : item.status === 'submitted' ? 'submitted' : 'pending_payment',
  }
}

const getStoredPurchaseOrders = (): PurchaseOrderRecord[] => {
  const purchaseOrders = wx.getStorageSync(PURCHASE_STORAGE_KEY) as PurchaseOrderRecord[] | undefined

  if (!Array.isArray(purchaseOrders)) {
    return []
  }

  return purchaseOrders
    .map(normalizePurchaseOrder)
    .filter((item): item is PurchaseOrderRecord => Boolean(item))
}

const savePurchaseOrders = (orders: PurchaseOrderRecord[]) => {
  wx.setStorageSync(PURCHASE_STORAGE_KEY, orders)
}

export const getPurchaseOrders = (): PurchaseOrderRecord[] => {
  return getStoredPurchaseOrders()
}

export const getPurchaseOrderByAddedAt = (addedAt: number): PurchaseOrderRecord | null => {
  if (!addedAt) {
    return null
  }

  return getStoredPurchaseOrders().find((item) => item.addedAt === addedAt) || null
}

export const addPurchaseOrder = (
  productId: number,
  draft?: Omit<PurchaseOrderRecord, 'productId' | 'addedAt'>,
): { count: number; addedAt: number } => {
  const currentOrders = getStoredPurchaseOrders()
  const addedAt = Date.now()
  const draftAddressId = draft && typeof draft.addressId === 'number' ? draft.addressId : 0
  const draftRecipientName = draft && typeof draft.recipientName === 'string' ? draft.recipientName : ''
  const draftRecipientPhone = draft && typeof draft.recipientPhone === 'string' ? draft.recipientPhone : ''
  const draftAddressDetail = draft && typeof draft.addressDetail === 'string' ? draft.addressDetail : ''
  const draftPaymentMethod = draft && typeof draft.paymentMethod === 'string' ? draft.paymentMethod : 'wechat'
  const draftRemark = draft && typeof draft.remark === 'string' ? draft.remark : ''
  const draftTotalAmount = draft && typeof draft.totalAmount === 'number' ? draft.totalAmount : 0
  const draftStatus = draft && draft.status === 'paid' ? 'paid' : draft && draft.status === 'submitted' ? 'submitted' : 'pending_payment'
  const nextOrder: PurchaseOrderRecord = {
    productId,
    addedAt,
    orderId: 0,
    addressId: draftAddressId,
    recipientName: draftRecipientName,
    recipientPhone: draftRecipientPhone,
    addressDetail: draftAddressDetail,
    paymentMethod: draftPaymentMethod,
    remark: draftRemark,
    totalAmount: draftTotalAmount,
    status: draftStatus,
  }
  const nextOrders: PurchaseOrderRecord[] = [
    nextOrder,
    ...currentOrders,
  ]

  savePurchaseOrders(nextOrders)

  return {
    count: nextOrders.length,
    addedAt,
  }
}

export const updatePurchaseOrder = (
  addedAt: number,
  patch: Partial<Omit<PurchaseOrderRecord, 'productId' | 'addedAt'>>,
): PurchaseOrderRecord | null => {
  const currentOrders = getStoredPurchaseOrders()
  let nextRecord: PurchaseOrderRecord | null = null

  const nextOrders = currentOrders.map((item) => {
    if (item.addedAt !== addedAt) {
      return item
    }

    nextRecord = {
      ...item,
      orderId: typeof patch.orderId === 'number' ? patch.orderId : item.orderId,
      addressId: typeof patch.addressId === 'number' ? patch.addressId : item.addressId,
      recipientName: typeof patch.recipientName === 'string' ? patch.recipientName : item.recipientName,
      recipientPhone: typeof patch.recipientPhone === 'string' ? patch.recipientPhone : item.recipientPhone,
      addressDetail: typeof patch.addressDetail === 'string' ? patch.addressDetail : item.addressDetail,
      paymentMethod: typeof patch.paymentMethod === 'string' ? patch.paymentMethod : item.paymentMethod,
      remark: typeof patch.remark === 'string' ? patch.remark : item.remark,
      totalAmount: typeof patch.totalAmount === 'number' ? patch.totalAmount : item.totalAmount,
      status:
        patch.status === 'paid'
          ? 'paid'
          : patch.status === 'submitted'
            ? 'submitted'
            : patch.status === 'pending_payment'
              ? 'pending_payment'
              : item.status,
    }

    return nextRecord
  })

  savePurchaseOrders(nextOrders)

  return nextRecord
}

export const clearPurchaseOrders = (): void => {
  wx.removeStorageSync(PURCHASE_STORAGE_KEY)
}

export const removePurchaseOrder = (addedAt: number): { count: number } => {
  const nextOrders = getStoredPurchaseOrders().filter((item) => item.addedAt !== addedAt)

  savePurchaseOrders(nextOrders)

  return {
    count: nextOrders.length,
  }
}
