import { fetchPublicCategories, fetchRecycleProducts, BackendCategoryConfig, BackendRecycleProduct } from '../../utils/backend'
import { ensureProductCatalogLoaded, productCatalog } from '../../data/products'
import { shouldIgnoreRapidBackTap, shouldIgnoreRapidNavigationTap, BackTapGuard, NavigationTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

const STORAGE_KEY = 'mine-local-user-profile'

const redirectToMineLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=product',
  })
}

const redirectToMineOrderLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=order',
  })
}

interface DeviceTabItem {
  id: number
  key: string
  text: string
  active?: boolean
}

interface BrandItem {
  id: number
  key: string
  text: string
  active?: boolean
}

interface RecycleProductItem {
  id: number
  categoryKey: string
  title: string
  price: string
  hint: string
  coverLabel: string
  coverImage: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
  searchText: string
}

interface HandheldRecyclingData {
  statusBarHeight: number
  isLoading: boolean
  pageTitle: string
  currentDeviceKey: string
  currentBrandKey: string
  searchPlaceholder: string
  searchKeyword: string
  deviceTabs: DeviceTabItem[]
  brands: BrandItem[]
  visibleProducts: RecycleProductItem[]
  emptyText: string
}

type DeviceTabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type BrandTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type ProductTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { id?: number; title?: string; coverLabel?: string; coverTheme?: string; categoryKey?: string }>

interface HandheldRecyclingPage extends BackTapGuard, NavigationTapGuard {
  recycleCategories: BackendCategoryConfig[]
  allProducts: RecycleProductItem[]
  requestedCategorySectionKey?: string
  onLoad(options?: Record<string, string>): void
  loadRecycleProducts(): Promise<void>
  syncVisibleProducts(categoryKey: string, keyword?: string): void
  onBackTap(): void
  onDeviceTabTap(event: DeviceTabTapEvent): void
  onBrandTap(event: BrandTapEvent): void
  onProductTap(event: ProductTapEvent): void
  onOrderTap(): void
  onSearchInput(event: WechatMiniprogram.Input): void
  onSearchClearTap(): void
}

const buildDeviceTabs = (): DeviceTabItem[] => [
  { id: 1, key: 'console', text: '游戏主机', active: true },
]

const buildFallbackCategoryName = (categoryKey: string): string => {
  const normalizedKey = String(categoryKey || '').toLowerCase()

  if (normalizedKey.includes('nintendo')) {
    return '任天堂主机'
  }

  if (normalizedKey.includes('sony')) {
    return '索尼主机'
  }

  if (normalizedKey.includes('xbox')) {
    return 'Xbox主机'
  }

  if (normalizedKey.includes('rog') || normalizedKey.includes('asus')) {
    return 'ROG主机'
  }

  if (normalizedKey.includes('steam')) {
    return 'Steam主机'
  }

  return categoryKey || '其他主机'
}

const normalizeCoverTheme = (value?: string): RecycleProductItem['coverTheme'] => {
  if (value === 'blue' || value === 'gray' || value === 'green') {
    return value
  }

  return 'red'
}

const resolveRecycleCoverImage = (product: BackendRecycleProduct): string => {
  const configuredCoverImage = String(product.coverImage || '').trim()
  if (configuredCoverImage) {
    return configuredCoverImage
  }

  const matchedProduct = productCatalog.find((item) => item.id === Number(product.productId || 0))
  return matchedProduct?.heroImage || matchedProduct?.detailImages[0] || ''
}

const decodePageTitle = (value: unknown): string => {
  const rawValue = String(value || '').trim()
  if (!rawValue) {
    return ''
  }

  try {
    return decodeURIComponent(rawValue)
  } catch (_error) {
    return rawValue
  }
}

const mapRecycleProduct = (product: BackendRecycleProduct): RecycleProductItem | null => {
  const title = String(product.title || '').trim()
  const categoryKey = String(product.categoryKey || '').trim()

  if (!title || !categoryKey) {
    return null
  }

  const coverLabel = String(product.coverLabel || '').trim() || title
  const hint = String(product.hintText || '').trim() || '最高可得'

  return {
    id: product.id,
    categoryKey,
    title,
    price: `${Number(product.maxRecyclePrice || 0).toFixed(0)}元`,
    hint,
    coverLabel,
    coverImage: resolveRecycleCoverImage(product),
    coverTheme: normalizeCoverTheme(product.coverTheme),
    searchText: `${title} ${coverLabel} ${categoryKey}`.toLowerCase(),
  }
}

const buildBrands = (categories: BackendCategoryConfig[], currentBrandKey: string): BrandItem[] => {
  return categories.map((category, index) => ({
    id: index + 1,
    key: category.key,
    text: category.name || buildFallbackCategoryName(category.key),
    active: category.key === currentBrandKey,
  }))
}

const buildRecycleCategories = (
  categories: BackendCategoryConfig[],
): BackendCategoryConfig[] => {
  const configuredCategories = categories
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order
      }

      return left.id - right.id
    })

  if (configuredCategories.length) {
    return configuredCategories
  }

  return []
}

const resolveInitialBrandKey = (categories: BackendCategoryConfig[], products: RecycleProductItem[]): string => {
  return categories[0]?.key || products[0]?.categoryKey || ''
}

const normalizeKeyword = (value: string): string => String(value || '').trim().toLowerCase()

const fuzzyIncludes = (text: string, keyword: string): boolean => {
  const normalizedText = text.toLowerCase()
  const normalizedKeyword = keyword.replace(/\s+/g, '')

  if (!normalizedKeyword) {
    return true
  }

  if (normalizedText.includes(normalizedKeyword)) {
    return true
  }

  let keywordIndex = 0
  for (const character of normalizedText) {
    if (character === normalizedKeyword[keywordIndex]) {
      keywordIndex += 1
      if (keywordIndex === normalizedKeyword.length) {
        return true
      }
    }
  }

  return false
}

const filterRecycleProducts = (
  products: RecycleProductItem[],
  categoryKey: string,
  keyword: string,
): RecycleProductItem[] => {
  const normalizedKeyword = normalizeKeyword(keyword)

  return products.filter((item) => {
    if (categoryKey && item.categoryKey !== categoryKey) {
      return false
    }

    if (!normalizedKeyword) {
      return true
    }

    return fuzzyIncludes(item.searchText, normalizedKeyword) || fuzzyIncludes(item.title, normalizedKeyword)
  })
}

const resolveEmptyText = (keyword: string): string => {
  return normalizeKeyword(keyword)
    ? '没有找到匹配的回收商品'
    : '当前分类下暂无商品'
}

Page<HandheldRecyclingData, HandheldRecyclingPage>({
  data: {
    statusBarHeight: 20,
    isLoading: true,
    pageTitle: '主机回收',
    currentDeviceKey: 'console',
    currentBrandKey: '',
    searchPlaceholder: '请输入回收商品关键词',
    searchKeyword: '',
    deviceTabs: buildDeviceTabs(),
    brands: [],
    visibleProducts: [],
    emptyText: '当前分类下暂无商品',
  },

  recycleCategories: [],
  allProducts: [],

  onLoad(options) {
    this.requestedCategorySectionKey = String(options?.categorySectionKey || '').trim()
    const requestedPageTitle = decodePageTitle(options?.pageTitle)
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      pageTitle: requestedPageTitle || '主机回收',
    })

    this.loadRecycleProducts()
      .then(() => {
        this.setData({ isLoading: false })
      })
      .catch((error) => {
        this.setData({ isLoading: false })
        wx.showToast({
          title: error instanceof Error ? error.message : '回收目录加载失败',
          icon: 'none',
        })
      })
  },

  async loadRecycleProducts() {
    const catalogResults = await Promise.all([
      fetchRecycleProducts(),
      fetchPublicCategories('recycle').catch(() => [] as BackendCategoryConfig[]),
      ensureProductCatalogLoaded().catch(() => productCatalog),
    ])
    const products = catalogResults[0]
    const categories = catalogResults[1]
    const normalizedProducts = products
      .map(mapRecycleProduct)
      .filter((item): item is RecycleProductItem => Boolean(item))
    const requestedSectionKey = String(this.requestedCategorySectionKey || '').trim()
    const scopedCategories = requestedSectionKey
      ? categories.filter((category) => category.sectionKey === requestedSectionKey)
      : categories
    const recycleCategories = buildRecycleCategories(scopedCategories)
    const enabledCategoryKeys = new Set(recycleCategories.map((category) => category.key))
    const visibleProducts = normalizedProducts.filter((product) => enabledCategoryKeys.has(product.categoryKey))
    const firstCategoryKey = resolveInitialBrandKey(recycleCategories, visibleProducts)

    this.recycleCategories = recycleCategories
    this.allProducts = visibleProducts

    this.setData({
      currentBrandKey: firstCategoryKey,
      brands: buildBrands(recycleCategories, firstCategoryKey),
    })

    this.syncVisibleProducts(firstCategoryKey, this.data.searchKeyword)
  },

  syncVisibleProducts(categoryKey: string, keyword?: string) {
    const nextKeyword = typeof keyword === 'string' ? keyword : this.data.searchKeyword
    const visibleProducts = filterRecycleProducts(this.allProducts, categoryKey, nextKeyword)

    this.setData({
      currentBrandKey: categoryKey,
      searchKeyword: nextKeyword,
      brands: buildBrands(this.recycleCategories, categoryKey),
      visibleProducts,
      emptyText: resolveEmptyText(nextKeyword),
    })
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.reLaunch({
            url: '/pages/index/index',
          })
        },
      })
      return
    }

    wx.reLaunch({
      url: '/pages/index/index',
    })
  },

  onDeviceTabTap(_event) {},

  onBrandTap(event) {
    const { key } = event.currentTarget.dataset

    if (!key || key === this.data.currentBrandKey) {
      return
    }

    this.syncVisibleProducts(key, this.data.searchKeyword)
  },

  onProductTap(event) {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    const localProfile = wx.getStorageSync(STORAGE_KEY) as Record<string, unknown> | undefined

    if (!localProfile) {
      redirectToMineLogin()
      return
    }

    const { id, title = '', coverLabel = '', coverTheme = 'red', categoryKey = '' } = event.currentTarget.dataset

    if (!id) {
      return
    }

    wx.navigateTo({
      url: `/pages/recycling-condition/recycling-condition?id=${id}&title=${encodeURIComponent(title)}&coverLabel=${encodeURIComponent(coverLabel)}&coverTheme=${encodeURIComponent(coverTheme)}&categoryKey=${encodeURIComponent(categoryKey)}`,
    })
  },

  onOrderTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    const localProfile = wx.getStorageSync(STORAGE_KEY) as Record<string, unknown> | undefined

    if (!localProfile) {
      redirectToMineOrderLogin()
      return
    }

    wx.navigateTo({
      url: '/pages/recycle-orders/recycle-orders?mode=recycle',
    })
  },

  onSearchInput(event) {
    const keyword = String(event.detail.value || '')
    this.syncVisibleProducts(this.data.currentBrandKey, keyword)
  },

  onSearchClearTap() {
    if (!this.data.searchKeyword) {
      return
    }

    this.syncVisibleProducts(this.data.currentBrandKey, '')
  },
})
