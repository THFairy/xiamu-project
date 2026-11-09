import { shouldIgnoreRapidBackTap, BackTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'
import { ensureProductCatalogLoaded, getProductById, ProductRecord } from '../../data/products'
import { addProductToCart } from '../../utils/cart'
import { resolveBackendAssetUrl } from '../../utils/backend-config'
import { buildProductSharePayload } from '../../share/product-share'
import {
  fetchRecycleOrders,
  fetchRecycleProducts,
  BackendRecycleProduct,
  BackendRecycleProductSnapshot,
} from '../../utils/backend'
import {
  getProductAttitudeState,
  productAttitudeMetas,
  toggleProductAttitude,
} from '../../utils/attitude'

interface DetailActionItem {
  id: number
  text: string
  key: DetailActionKey
  iconPath: string
  active: boolean
}

type DetailActionKey = 'wishlist' | 'played' | 'owned'

interface DetailMetaItem {
  id: number
  text: string
  theme: 'gold' | 'blue' | 'rose'
}

interface RecycleRoutePayload {
  id: number
  categoryKey: string
  title: string
  coverLabel: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
}

interface ProductDetailData {
  statusBarHeight: number
  isLoading: boolean
  productId: number
  pageTitle: string
  product?: ProductRecord
  heroImages: string[]
  hasMultipleHeroImages: boolean
  productDescriptionText: string
  featureTags: string[]
  detailMetas: DetailMetaItem[]
  quickActions: DetailActionItem[]
  isSnapshot: boolean
}

type DetailOptions = {
  id?: string
  recycleOrderId?: string
}

type ActionTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type HeroImagePreviewEvent = WechatMiniprogram.TouchEvent<{}, {}, { index?: string | number }>

interface ProductDetailPage extends BackTapGuard {
  onLoad(options: DetailOptions): void
  syncQuickActions(productId: number): void
  onBackTap(): void
  onHeroImagePreview(event: HeroImagePreviewEvent): void
  onActionTap(event: ActionTapEvent): void
  onContactServiceTap(): void
  onPurchaseTap(): void
  onRecycleTap(): Promise<void>
  onCartTap(): void
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
}

const buildDetailMetas = (product: ProductRecord): DetailMetaItem[] => {
  const candidates: Array<Omit<DetailMetaItem, 'id'> & { id: number }> = [
    { id: 1, text: String(product.shoppingTextA || '').trim(), theme: 'gold' },
    { id: 2, text: String(product.shoppingTextB || '').trim(), theme: 'blue' },
    { id: 3, text: String(product.shoppingTextC || '').trim(), theme: 'rose' },
  ]

  return candidates.filter((item) => Boolean(item.text))
}

const buildHeroImages = (product?: ProductRecord) => {
  if (!product) {
    return []
  }

  const images = Array.isArray(product.detailImages) ? product.detailImages.filter(Boolean) : []

  if (images.length) {
    return images
  }

  if (product.heroImage) {
    return [product.heroImage]
  }

  return []
}

const buildRecycleSnapshotProduct = (snapshot?: BackendRecycleProductSnapshot | null): ProductRecord | undefined => {
  const title = String(snapshot?.title || '').trim()
  if (!title) {
    return undefined
  }

  const heroImage = resolveBackendAssetUrl(String(snapshot?.heroImage || snapshot?.coverImage || '').trim())
  const detailImages = Array.isArray(snapshot?.detailImages)
    ? snapshot.detailImages.map((image) => resolveBackendAssetUrl(String(image || '').trim())).filter(Boolean)
    : []

  return {
    id: Number(snapshot?.productId || 0),
    categoryKey: 'others',
    rawCategoryKey: String(snapshot?.categoryKey || 'recycle-snapshot'),
    modelKey: String(snapshot?.modelKey || 'recycle-snapshot'),
    platform: String(snapshot?.platform || '回收商品'),
    coverText: String(snapshot?.coverText || '').trim(),
    coverTitle: String(snapshot?.coverTitle || title.slice(0, 12)),
    title,
    subtitle: String(snapshot?.subtitle || '').trim(),
    price: String(Number(snapshot?.price || 0)),
    tag: String(snapshot?.tagText || '').trim(),
    detailImages: detailImages.length ? detailImages : (heroImage ? [heroImage] : []),
    heroImage,
    inStock: false,
    recyclable: false,
    premiumCondition: Boolean(snapshot?.premiumCondition),
    certifiedPrice: Boolean(snapshot?.certifiedPrice),
    releaseOrder: Number(snapshot?.releaseOrder || 0),
    heroTheme: snapshot?.heroTheme === 'nintendo' || snapshot?.heroTheme === 'sony' || snapshot?.heroTheme === 'steam' || snapshot?.heroTheme === 'asus'
      ? snapshot.heroTheme
      : 'others',
    heroAccent: String(snapshot?.heroAccent || '回收检测商品'),
    editionLabel: String(snapshot?.editionLabel || '').trim(),
    featureTags: Array.isArray(snapshot?.featureTags) ? snapshot.featureTags.filter(Boolean) : [],
    shoppingTextA: String(snapshot?.shoppingTextA || '').trim(),
    shoppingTextB: String(snapshot?.shoppingTextB || '').trim(),
    shoppingTextC: String(snapshot?.shoppingTextC || '').trim(),
    description: String(snapshot?.description || '').trim(),
  }
}

const getProductDescriptionText = (product?: ProductRecord): string => {
  if (!product) {
    return ''
  }

  return String(product.description || '').trim()
}

const buildQuickActions = (productId: number): DetailActionItem[] => {
  const attitudeState = getProductAttitudeState(productId)

  return productAttitudeMetas
    .filter((item) => item.key === 'wishlist' || item.key === 'played' || item.key === 'owned')
    .map((item) => ({
      id: item.id,
      text: item.label,
      key: item.key as DetailActionKey,
      iconPath: attitudeState[item.key]
        ? item.iconPath.replace(/\.png$/, '-点击后.png')
        : item.iconPath,
      active: attitudeState[item.key],
    }))
}

const normalizeRecycleCoverTheme = (value?: string): RecycleRoutePayload['coverTheme'] => {
  if (value === 'blue' || value === 'gray' || value === 'green') {
    return value
  }

  return 'red'
}

const normalizeMatchText = (value?: string): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/]/g, '')
    .replace(/[()\[\]]/g, '')
}

const isSameRecycleCategory = (product: ProductRecord, recycleProduct: BackendRecycleProduct): boolean => {
  const recycleCategoryKey = normalizeMatchText(recycleProduct.categoryKey)
  const candidateCategoryKeys = [
    product.rawCategoryKey,
    product.categoryKey,
    product.platform,
  ]
    .map((item) => normalizeMatchText(item))
    .filter(Boolean)

  return candidateCategoryKeys.some((item) => item === recycleCategoryKey)
}

const findMatchedRecycleProduct = (
  product: ProductRecord,
  recycleProducts: BackendRecycleProduct[],
): BackendRecycleProduct | undefined => {
  const exactMatchedProduct = recycleProducts.find((item) => Number(item.productId || 0) === product.id)

  if (exactMatchedProduct) {
    return exactMatchedProduct
  }

  const matchTokens = [
    product.title,
    product.coverTitle,
    product.editionLabel,
    product.subtitle,
  ]
    .map((item) => normalizeMatchText(item))
    .filter(Boolean)

  return recycleProducts.find((item) => {
    if (!isSameRecycleCategory(product, item)) {
      return false
    }

    const recycleTitle = normalizeMatchText(item.title)
    const recycleCoverLabel = normalizeMatchText(item.coverLabel)

    return matchTokens.some((token) => (
      recycleTitle.includes(token)
      || token.includes(recycleTitle)
      || recycleCoverLabel.includes(token)
    ))
  })
}

const getRecycleRoutePayload = (product: ProductRecord, recycleProduct: BackendRecycleProduct): RecycleRoutePayload => {
  return {
    id: Number(recycleProduct.id || 0),
    categoryKey: String(recycleProduct.categoryKey || product.categoryKey || '').trim(),
    title: String(recycleProduct.title || '').trim() || product.title,
    coverLabel: String(recycleProduct.coverLabel || '').trim() || product.coverTitle,
    coverTheme: normalizeRecycleCoverTheme(recycleProduct.coverTheme),
  }
}

const findRecycleProductByTarget = (
  product: ProductRecord,
  recycleProducts: BackendRecycleProduct[],
): BackendRecycleProduct | undefined => {
  const targetRecycleProductId = Number(product.recycleTargetRecycleProductId || 0)

  if (targetRecycleProductId > 0) {
    const exactTarget = recycleProducts.find((item) => Number(item.id || 0) === targetRecycleProductId)
    if (exactTarget) {
      return exactTarget
    }
  }

  const targetCategoryKey = normalizeMatchText(product.recycleTargetCategoryKey)
  if (!targetCategoryKey) {
    return undefined
  }

  return recycleProducts.find((item) => normalizeMatchText(item.categoryKey) === targetCategoryKey)
}

Page<ProductDetailData, ProductDetailPage>({
  data: {
    statusBarHeight: 20,
    isLoading: true,
    productId: 0,
    pageTitle: '商品详情',
    heroImages: [],
    hasMultipleHeroImages: false,
    productDescriptionText: '',
    featureTags: [],
    detailMetas: [],
    quickActions: buildQuickActions(0),
    isSnapshot: false,
  },

  onLoad(options: DetailOptions) {
    const productId = Number(options.id)
    const recycleOrderId = Number(options.recycleOrderId || 0)

    wx.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline'],
    })

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      productId,
    })

    const loadProduct = async () => {
      await ensureProductCatalogLoaded(true).catch(() => undefined)
      let product = getProductById(productId)
      let isSnapshot = false

      if (recycleOrderId) {
        const recycleOrders = await fetchRecycleOrders().catch(() => [])
        const recycleOrder = recycleOrders.find((item) => item.id === recycleOrderId)
        const snapshotProduct = buildRecycleSnapshotProduct(
          recycleOrder?.productSnapshot || (recycleOrder
            ? {
                title: recycleOrder.title,
                subtitle: recycleOrder.optionSummary,
                price: recycleOrder.estimateFinalPrice,
                coverTitle: recycleOrder.coverLabel,
                coverImage: recycleOrder.coverImage,
                heroImage: recycleOrder.coverImage,
                detailImages: recycleOrder.submissionImages,
                categoryKey: recycleOrder.categoryKey,
                capturedAt: recycleOrder.updatedAt,
              }
            : undefined),
        )
        if (snapshotProduct) {
          product = snapshotProduct
          isSnapshot = true
        }
      }

      return { product, isSnapshot }
    }

    loadProduct()
      .then(({ product, isSnapshot }) => {
        const heroImages = buildHeroImages(product)

        this.setData({
          pageTitle: product ? product.title : '商品详情',
          product,
          heroImages,
          hasMultipleHeroImages: heroImages.length > 1,
          productDescriptionText: getProductDescriptionText(product),
          featureTags: product ? product.featureTags : [],
          detailMetas: product ? buildDetailMetas(product) : [],
          isSnapshot,
        })

        this.syncQuickActions(productId)
        this.setData({ isLoading: false })
      })
      .catch(() => {
        this.setData({ isLoading: false })
      })
  },

  syncQuickActions(productId) {
    this.setData({
      quickActions: buildQuickActions(productId),
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

  onHeroImagePreview(event) {
    const heroImages = Array.isArray(this.data.heroImages) ? this.data.heroImages.filter(Boolean) : []
    if (!heroImages.length) {
      return
    }

    const rawIndex = event.currentTarget.dataset.index
    const currentIndex = Number(rawIndex || 0)
    const safeIndex = Number.isFinite(currentIndex) && currentIndex >= 0 && currentIndex < heroImages.length
      ? currentIndex
      : 0

    wx.previewImage({
      current: heroImages[safeIndex],
      urls: heroImages,
    })
  },

  onActionTap(event) {
    const { key } = event.currentTarget.dataset
    const allowedKeys: DetailActionKey[] = ['wishlist', 'played', 'owned']

    if (!this.data.productId || !key || !allowedKeys.includes(key as DetailActionKey)) {
      return
    }

    const detailKey = key as DetailActionKey
    const nextRecord = toggleProductAttitude(this.data.productId, detailKey)
    const matchedMeta = productAttitudeMetas.find((item) => item.key === detailKey)
    const actionPrefix = nextRecord[detailKey] ? '已加入' : '已取消'

    this.syncQuickActions(this.data.productId)

    wx.showToast({
      title: matchedMeta ? `${actionPrefix}${matchedMeta.label}` : '操作成功',
      icon: 'none',
    })
  },

  onContactServiceTap() {
    wx.navigateTo({
      url: `/pages/feature-placeholder/feature-placeholder?title=${encodeURIComponent('联系客服')}`,
    })
  },

  onPurchaseTap() {
    if (!this.data.productId || !this.data.product?.inStock) {
      wx.showToast({
        title: '商品已售罄',
        icon: 'none',
      })
      return
    }

    wx.navigateTo({
      url: `/pages/buying-confirmation/buying-confirmation?id=${this.data.productId}`,
    })
  },

  async onRecycleTap() {
    const currentProduct = this.data.product

    if (!currentProduct) {
      return
    }

    try {
      const recycleProducts = await fetchRecycleProducts()
      const hasExplicitRecycleTarget = Boolean(
        String(currentProduct.recycleTargetCategoryKey || '').trim()
        || Number(currentProduct.recycleTargetRecycleProductId || 0) > 0,
      )
      const matchedRecycleProduct = hasExplicitRecycleTarget
        ? findRecycleProductByTarget(currentProduct, recycleProducts) || findMatchedRecycleProduct(currentProduct, recycleProducts)
        : findMatchedRecycleProduct(currentProduct, recycleProducts)

      if (!matchedRecycleProduct) {
        wx.showToast({
          title: '该商品暂不支持回收',
          icon: 'none',
        })
        return
      }

      const routePayload = getRecycleRoutePayload(currentProduct, matchedRecycleProduct)

      wx.navigateTo({
        url: `/pages/recycling-condition/recycling-condition?id=${routePayload.id}&title=${encodeURIComponent(routePayload.title)}&coverLabel=${encodeURIComponent(routePayload.coverLabel)}&coverTheme=${encodeURIComponent(routePayload.coverTheme)}&categoryKey=${encodeURIComponent(routePayload.categoryKey)}`,
      })
    } catch (_error) {
      wx.showToast({
        title: '回收目录加载失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  onCartTap() {
    if (!this.data.productId) {
      return
    }

    const result = addProductToCart(this.data.productId)

    wx.showToast({
      title: result.added ? '已加入购物车' : '商品已在购物车',
      icon: 'none',
    })
  },

  onShareAppMessage() {
    return buildProductSharePayload(this.data.product)
  },
})
