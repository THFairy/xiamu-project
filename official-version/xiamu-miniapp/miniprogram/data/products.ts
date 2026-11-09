import { clearPublicBackendCache, fetchPublicProducts, BackendPublicProduct } from '../utils/backend'
import { resolveBackendAssetUrl } from '../utils/backend-config'

export interface ProductRecord {
  id: number
  categoryKey: 'nintendo' | 'sony' | 'steam' | 'asus' | 'others'
  rawCategoryKey: string
  modelKey: string
  platform: string
  coverText: string
  coverTitle: string
  title: string
  subtitle: string
  price: string
  tag: string
  detailImages: string[]
  heroImage: string
  inStock: boolean
  recyclable: boolean
  recycleMode?: 'direct' | 'category' | 'none'
  recycleTargetCategoryKey?: string
  recycleTargetCategoryName?: string
  recycleTargetRecycleProductId?: number | null
  recycleTargetRecycleProductTitle?: string
  premiumCondition: boolean
  certifiedPrice: boolean
  releaseOrder: number
  heroTheme: 'nintendo' | 'sony' | 'steam' | 'asus' | 'others'
  heroAccent: string
  editionLabel: string
  featureTags: string[]
  shoppingTextA: string
  shoppingTextB: string
  shoppingTextC: string
  description?: string
}

const PRODUCT_CATALOG_FRESHNESS_MS = 10 * 1000

const normalizeHeroTheme = (value?: string): ProductRecord['heroTheme'] => {
  if (value === 'nintendo' || value === 'sony' || value === 'steam' || value === 'asus') {
    return value
  }

  return 'others'
}

const normalizeCoverTitle = (product: BackendPublicProduct): string => {
  const coverTitle = String(product.coverTitle || '').trim()

  if (coverTitle) {
    return coverTitle
  }

  const editionLabel = String(product.editionLabel || '').trim()
  if (editionLabel) {
    return editionLabel
  }

  const subtitle = String(product.subtitle || '').trim()
  if (subtitle) {
    return subtitle.slice(0, 12)
  }

  const title = String(product.title || '').trim()
  if (title) {
    return title.slice(0, 12)
  }

  return '商品'
}

const normalizeCategoryKey = (product: BackendPublicProduct): ProductRecord['categoryKey'] => {
  const rawCategoryKey = String(product.categoryKey || '').toLowerCase()
  const platform = String(product.platform || '').toLowerCase()
  const title = String(product.title || '').toLowerCase()
  const heroTheme = normalizeHeroTheme(product.heroTheme)

  if (rawCategoryKey.includes('nintendo') || title.includes('switch')) {
    return 'nintendo'
  }

  if (rawCategoryKey.includes('sony') || title.includes('ps4') || title.includes('ps5')) {
    return 'sony'
  }

  if (rawCategoryKey.includes('steam') || platform.includes('steam') || title.includes('steam deck')) {
    return 'steam'
  }

  if (
    rawCategoryKey.includes('rog')
    || rawCategoryKey.includes('asus')
    || title.includes('rog ally')
    || title.includes('xg mobile')
  ) {
    return 'asus'
  }

  if (rawCategoryKey.includes('xbox')) {
    return 'others'
  }

  if (heroTheme !== 'others') {
    return heroTheme
  }

  return 'others'
}

const normalizeImageList = (images?: string[]): string[] => {
  if (!Array.isArray(images)) {
    return []
  }

  return images
    .map((image) => resolveBackendAssetUrl(image))
    .filter(Boolean)
}

const REPAIRED_TEXT_MAP: Record<string, string> = {
  '鍏朵粬': '其他',
  '鍥炴敹瀹℃牳閫氳繃鍟嗗搧': '回收审核通过商品',
  '鍙栨秷鍙栦欢澶辫触': '取消取件失败',
}

const normalizeDisplayText = (value?: string): string => {
  const text = String(value || '').trim()

  if (!text) {
    return ''
  }

  return REPAIRED_TEXT_MAP[text] || text
}

const normalizeProductTag = (value?: string): string => {
  const tag = normalizeDisplayText(value)

  return tag === '回收上架' ? '' : tag
}

const isVisibleProduct = (product: BackendPublicProduct): boolean => {
  if (!product || product.status !== 1) {
    return false
  }

  if (!product.title) {
    return false
  }

  return true
}

const mapBackendProduct = (product: BackendPublicProduct): ProductRecord => {
  const detailImages = normalizeImageList(product.detailImages)
  const heroImage = resolveBackendAssetUrl(product.heroImage || product.coverImage || product.webCoverImage || '')
  const displayPrice = Number(product.displayPrice || product.price || 0)

  return {
    id: product.id,
    categoryKey: normalizeCategoryKey(product),
    rawCategoryKey: String(product.categoryKey || '').trim(),
    modelKey: product.modelKey || 'other',
    platform: normalizeDisplayText(product.platform || ''),
    coverText: normalizeDisplayText(product.coverText || ''),
    coverTitle: normalizeDisplayText(normalizeCoverTitle(product)),
    title: normalizeDisplayText(product.title || ''),
    subtitle: normalizeDisplayText(product.subtitle || ''),
    price: String(displayPrice),
    tag: normalizeProductTag(product.tagText),
    detailImages: detailImages.length ? detailImages : (heroImage ? [heroImage] : []),
    heroImage,
    inStock: Boolean(product.inStock),
    recyclable: Boolean(product.recyclable),
    recycleMode: product.recycleMode === 'category' || product.recycleMode === 'none'
      ? product.recycleMode
      : (Boolean(product.recyclable) ? 'direct' : 'none'),
    recycleTargetCategoryKey: String(product.recycleTargetCategoryKey || '').trim(),
    recycleTargetCategoryName: String(product.recycleTargetCategoryName || '').trim(),
    recycleTargetRecycleProductId: product.recycleTargetRecycleProductId === null || product.recycleTargetRecycleProductId === undefined
      ? null
      : Number(product.recycleTargetRecycleProductId || 0),
    recycleTargetRecycleProductTitle: normalizeDisplayText(product.recycleTargetRecycleProductTitle || ''),
    premiumCondition: Boolean(product.premiumCondition),
    certifiedPrice: Boolean(product.certifiedPrice),
    releaseOrder: Number(product.releaseOrder || 0),
    heroTheme: normalizeHeroTheme(product.heroTheme),
    heroAccent: normalizeDisplayText(product.heroAccent || ''),
    editionLabel: normalizeDisplayText(product.editionLabel || ''),
    featureTags: Array.isArray(product.featureTags) ? product.featureTags.filter(Boolean) : [],
    shoppingTextA: normalizeDisplayText(product.shoppingTextA || ''),
    shoppingTextB: normalizeDisplayText(product.shoppingTextB || ''),
    shoppingTextC: normalizeDisplayText(product.shoppingTextC || ''),
    description: normalizeDisplayText(product.description || ''),
  }
}

const replaceProductCatalog = (products: ProductRecord[]) => {
  productCatalog.splice(0, productCatalog.length, ...products)

  const hotIds = products
    .filter((item) => item.inStock)
    .sort((left, right) => {
      if (right.releaseOrder !== left.releaseOrder) {
        return right.releaseOrder - left.releaseOrder
      }

      return right.id - left.id
    })
    .slice(0, 6)
    .map((item) => item.id)

  homeHotProductIds.splice(0, homeHotProductIds.length, ...hotIds)
}

export const productCatalog: ProductRecord[] = []
export const homeHotProductIds: number[] = []

let productCatalogLoadedAt = 0
let productCatalogLoadingPromise: Promise<ProductRecord[]> | null = null

export const getProductById = (id: number): ProductRecord | undefined => {
  return productCatalog.find((product) => product.id === id)
}

export const ensureProductCatalogLoaded = async (forceRefresh = false): Promise<ProductRecord[]> => {
  const now = Date.now()
  const isCatalogFresh = productCatalog.length > 0 && now - productCatalogLoadedAt < PRODUCT_CATALOG_FRESHNESS_MS

  if (productCatalog.length && (!forceRefresh || isCatalogFresh)) {
    return productCatalog
  }

  if (productCatalogLoadingPromise) {
    return productCatalogLoadingPromise
  }

  if (forceRefresh) {
    clearPublicBackendCache('public-products:buy')
  }

  productCatalogLoadingPromise = fetchPublicProducts('buy')
    .then((products) => {
      const normalizedProducts = products
        .filter(isVisibleProduct)
        .map(mapBackendProduct)

      if (!normalizedProducts.length) {
        throw new Error('服务端暂未返回商品数据')
      }

      replaceProductCatalog(normalizedProducts)
      productCatalogLoadedAt = Date.now()
      return productCatalog
    })
    .then((result) => {
      productCatalogLoadingPromise = null
      return result
    })
    .catch((error) => {
      productCatalogLoadingPromise = null
      throw error
    })

  return productCatalogLoadingPromise as Promise<ProductRecord[]>
}
