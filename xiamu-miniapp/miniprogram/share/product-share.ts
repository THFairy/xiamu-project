import { ProductRecord } from '../data/products'

export interface ProductSharePayload {
  title: string
  path: string
  imageUrl?: string
}

const getProductDetailPath = (productId: number) => `/pages/product-detail/product-detail?id=${productId}`

const getProductShareImage = (product?: ProductRecord) => {
  const detailImage = product && Array.isArray(product.detailImages)
    ? product.detailImages.find(Boolean)
    : undefined

  if (detailImage) {
    return detailImage
  }

  if (product && product.heroImage) {
    return product.heroImage
  }

  return undefined
}

export const buildProductSharePayload = (product?: ProductRecord): ProductSharePayload => {
  if (!product) {
    return {
      title: '商品详情',
      path: '/pages/index/index',
    }
  }

  const imageUrl = getProductShareImage(product)

  return {
    title: product.title,
    path: getProductDetailPath(product.id),
    imageUrl,
  }
}
