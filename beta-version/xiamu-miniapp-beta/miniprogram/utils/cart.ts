import { getProductById, ProductRecord } from '../data/products'

export interface CartItemRecord {
  productId: number
  addedAt: number
}

export const CART_STORAGE_KEY = 'order-local-cart-products'

const getStoredCartItems = (): CartItemRecord[] => {
  const cartItems = wx.getStorageSync(CART_STORAGE_KEY) as CartItemRecord[] | undefined

  if (!Array.isArray(cartItems)) {
    return []
  }

  return cartItems.filter((item) => Boolean(item) && typeof item.productId === 'number')
}

export const getCartProducts = (): ProductRecord[] => {
  return getStoredCartItems()
    .map((item) => getProductById(item.productId))
    .filter((item): item is ProductRecord => Boolean(item))
}

export const addProductToCart = (productId: number): { added: boolean; count: number } => {
  const currentItems = getStoredCartItems()
  const exists = currentItems.some((item) => item.productId === productId)

  if (exists) {
    return {
      added: false,
      count: currentItems.length,
    }
  }

  const nextItems = currentItems.concat({
    productId,
    addedAt: Date.now(),
  })

  wx.setStorageSync(CART_STORAGE_KEY, nextItems)

  return {
    added: true,
    count: nextItems.length,
  }
}

export const clearCartProducts = (): void => {
  wx.removeStorageSync(CART_STORAGE_KEY)
}

export const getCartItemRecords = (): CartItemRecord[] => {
  return getStoredCartItems()
}

export const removeCartProduct = (addedAt: number): { count: number } => {
  const nextItems = getStoredCartItems().filter((item) => item.addedAt !== addedAt)

  wx.setStorageSync(CART_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}

export const removeCartProducts = (addedAts: number[]): { count: number } => {
  const deleteSet = new Set(addedAts.filter((item) => typeof item === 'number' && item > 0))
  const nextItems = getStoredCartItems().filter((item) => !deleteSet.has(item.addedAt))

  wx.setStorageSync(CART_STORAGE_KEY, nextItems)

  return {
    count: nextItems.length,
  }
}
