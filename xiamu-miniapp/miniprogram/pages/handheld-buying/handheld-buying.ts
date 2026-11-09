import { fetchPublicCategories, BackendCategoryConfig } from '../../utils/backend'
import { ensureProductCatalogLoaded, productCatalog, ProductRecord } from '../../data/products'
import { shouldIgnoreRapidBackTap, shouldIgnoreRapidNavigationTap, NavigationTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface BackTapGuard {
  backTapLockedUntil?: number
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

interface BuyingProductItem {
  id: number
  deviceKey: string
  brandKey: string
  title: string
  price: string
  hint: string
  coverLabel: string
  coverImage: string
  coverTheme: 'red' | 'blue' | 'gray' | 'green'
}

interface HandheldBuyingData {
  statusBarHeight: number
  isLoading: boolean
  pageTitle: string
  currentDeviceKey: string
  currentBrandKey: string
  searchPlaceholder: string
  deviceTabs: DeviceTabItem[]
  brands: BrandItem[]
  visibleProducts: BuyingProductItem[]
}

type DeviceTabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type BrandTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type ProductTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { id?: number }>

interface HandheldBuyingPage extends BackTapGuard, NavigationTapGuard {
  saleCategories: BackendCategoryConfig[]
  requestedCategorySectionKey?: string
  onLoad(options?: Record<string, string>): void
  syncCatalog(): Promise<void>
  refreshVisibleProducts(nextBrandKey?: string): void
  onBackTap(): void
  onDeviceTabTap(event: DeviceTabTapEvent): void
  onBrandTap(event: BrandTapEvent): void
  onProductTap(event: ProductTapEvent): void
  onOrderTap(): void
  onSearchTap(): void
}

const STORAGE_KEY = 'mine-local-user-profile'

const themeByCategory: Record<ProductRecord['categoryKey'], BuyingProductItem['coverTheme']> = {
  nintendo: 'red',
  sony: 'blue',
  steam: 'gray',
  asus: 'green',
  others: 'gray',
}

const redirectToMineLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=detail',
  })
}

const redirectToMineOrderLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=order',
  })
}

const buildDeviceTabs = (currentKey: string): DeviceTabItem[] => [
  { id: 1, key: 'console', text: '游戏主机', active: currentKey === 'console' },
]

const coverLabelByTitle = (product: ProductRecord): string => {
  if (product.coverTitle) {
    return product.coverTitle
  }

  if (product.title.includes('OLED')) {
    return 'OLED'
  }

  if (product.title.includes('Lite')) {
    return 'Lite'
  }

  if (product.title.includes('PS5')) {
    return 'PS5'
  }

  if (product.title.includes('PS4')) {
    return 'PS4'
  }

  return product.platform || 'Console'
}

const buildFallbackBrandText = (rawCategoryKey: string): string => {
  const normalizedKey = String(rawCategoryKey || '').toLowerCase()

  if (normalizedKey.includes('nintendo')) {
    return '任天堂主机'
  }

  if (normalizedKey.includes('sony')) {
    return '索尼主机'
  }

  if (normalizedKey.includes('steam')) {
    return 'Steam 主机'
  }

  if (normalizedKey.includes('rog') || normalizedKey.includes('asus')) {
    return 'ROG 主机'
  }

  if (normalizedKey.includes('xbox')) {
    return 'Xbox 主机'
  }

  return rawCategoryKey || '其他主机'
}

const isSaleConsoleCategory = (category: BackendCategoryConfig): boolean => {
  const normalizedKey = String(category.key || '').toLowerCase()
  const normalizedName = String(category.name || '').toLowerCase()

  return normalizedKey.includes('console')
    || normalizedKey.includes('handheld')
    || normalizedName.includes('主机')
    || normalizedName.includes('掌机')
}

const buildBuyingProducts = (): BuyingProductItem[] => {
  return [...productCatalog]
    .sort((a, b) => {
      if (b.releaseOrder !== a.releaseOrder) {
        return b.releaseOrder - a.releaseOrder
      }

      return a.id - b.id
    })
    .map((product) => ({
      id: product.id,
      deviceKey: 'console',
      brandKey: product.rawCategoryKey || product.categoryKey,
      title: product.title,
      price: `${Number(product.price || 0).toFixed(0)}元`,
      hint: product.inStock ? '现货在售' : '暂时缺货',
      coverLabel: coverLabelByTitle(product),
      coverImage: product.heroImage || product.detailImages[0] || '',
      coverTheme: themeByCategory[product.categoryKey] || 'gray',
    }))
}

const buildConsoleCategories = (
  categories: BackendCategoryConfig[],
  products: BuyingProductItem[],
  useAllConfiguredCategories = false,
): BackendCategoryConfig[] => {
  const visibleCategoryKeys = new Set(products.map((item) => item.brandKey).filter(Boolean))
  const matchedCategories = categories
    .filter((category) => useAllConfiguredCategories || isSaleConsoleCategory(category))
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order
      }

      return left.id - right.id
    })

  if (matchedCategories.length) {
    return matchedCategories
  }

  if (useAllConfiguredCategories) {
    return []
  }

  return Array.from(visibleCategoryKeys).map((categoryKey, index) => ({
    id: index + 1,
    key: categoryKey,
    name: buildFallbackBrandText(categoryKey),
    scene: 'sale',
    theme: 'gray',
    order: index + 1,
  }))
}

const resolveInitialBrandKey = (
  categories: BackendCategoryConfig[],
  products: BuyingProductItem[],
): string => {
  return categories[0]?.key || products[0]?.brandKey || ''
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

const buildBrands = (categories: BackendCategoryConfig[], currentBrandKey: string): BrandItem[] => {
  return categories.map((category, index) => ({
    id: index + 1,
    key: category.key,
    text: category.name || buildFallbackBrandText(category.key),
    active: category.key === currentBrandKey,
  }))
}

const getVisibleProducts = (deviceKey: string, brandKey: string): BuyingProductItem[] => {
  return buildBuyingProducts().filter((product) => product.deviceKey === deviceKey && product.brandKey === brandKey)
}

Page<HandheldBuyingData, HandheldBuyingPage>({
  data: {
    statusBarHeight: 20,
    isLoading: true,
    pageTitle: '主机购买',
    currentDeviceKey: 'console',
    currentBrandKey: '',
    searchPlaceholder: '请输入搜索关键词',
    deviceTabs: buildDeviceTabs('console'),
    brands: [],
    visibleProducts: [],
  },

  saleCategories: [],

  onLoad(options) {
    this.requestedCategorySectionKey = String(options?.categorySectionKey || '').trim()
    const requestedPageTitle = decodePageTitle(options?.pageTitle)
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      pageTitle: requestedPageTitle || '主机购买',
    })

    this.syncCatalog()
      .then(() => {
        this.setData({ isLoading: false })
      })
      .catch((error) => {
        this.setData({ isLoading: false })
        wx.showToast({
          title: error instanceof Error ? error.message : '商品加载失败',
          icon: 'none',
        })
      })
  },

  async syncCatalog() {
    const catalogResults = await Promise.all([
      ensureProductCatalogLoaded(true),
      fetchPublicCategories('sale').catch(() => [] as BackendCategoryConfig[]),
    ])
    const categories = catalogResults[1]

    const allProducts = buildBuyingProducts()
    const requestedSectionKey = String(this.requestedCategorySectionKey || '').trim()
    const scopedCategories = requestedSectionKey
      ? categories.filter((category) => category.sectionKey === requestedSectionKey)
      : categories
    const saleCategories = buildConsoleCategories(scopedCategories, allProducts, Boolean(requestedSectionKey))
    const nextBrandKey = requestedSectionKey && !saleCategories.length
      ? ''
      : resolveInitialBrandKey(saleCategories, allProducts)

    this.saleCategories = saleCategories
    this.setData({
      currentBrandKey: nextBrandKey,
      brands: buildBrands(saleCategories, nextBrandKey),
      visibleProducts: nextBrandKey ? getVisibleProducts(this.data.currentDeviceKey, nextBrandKey) : [],
    })
  },

  refreshVisibleProducts(nextBrandKey) {
    const brandKey = nextBrandKey || this.data.currentBrandKey

    this.setData({
      currentBrandKey: brandKey,
      brands: buildBrands(this.saleCategories, brandKey),
      visibleProducts: brandKey ? getVisibleProducts(this.data.currentDeviceKey, brandKey) : [],
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

  onDeviceTabTap(_event) {},

  onBrandTap(event) {
    const { key } = event.currentTarget.dataset

    if (!key || key === this.data.currentBrandKey) {
      return
    }

    this.refreshVisibleProducts(key)
  },

  onProductTap(event) {
    const { id } = event.currentTarget.dataset
    const productId = Number(id)

    if (!productId) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    const localProfile = wx.getStorageSync(STORAGE_KEY) as Record<string, unknown> | undefined

    if (!localProfile) {
      redirectToMineLogin()
      return
    }

    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${productId}`,
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
      url: '/pages/order/order?mode=buy',
    })
  },

  onSearchTap() {
    wx.showToast({
      title: '搜索功能稍后补充',
      icon: 'none',
    })
  },
})
