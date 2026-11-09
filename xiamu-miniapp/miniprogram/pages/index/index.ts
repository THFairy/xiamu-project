// 首页负责独立加载商品、横幅和专区数据，任一数据源失败时仍可渲染可用内容。
import { ensureProductCatalogLoaded, productCatalog, ProductRecord } from '../../data/products'
import {
  BackendHomepageBanner,
  BackendHomepageSection,
  clearPublicBackendCache,
  fetchHomepageBanners,
  fetchHomepageSection,
} from '../../utils/backend'
import {
  clearTabTransitionTimer,
  consumeTabEnterTransition,
  playTabEnterTransition,
  RootTabKey,
  shouldIgnoreRapidNavigationTap,
  startSlidingTabSwitch,
  NavigationTapGuard,
} from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

const STORAGE_KEY = 'mine-local-user-profile'
const HOT_PRODUCTS_BATCH_SIZE = 10

const redirectToMineLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=detail',
  })
}

interface BannerItem {
  id: number
  tag: string
  title: string
  desc: string
  accent: string
  targetPageId: number
  contentEnabled: boolean
  image?: string
}

interface CategoryItem {
  id: string
  target: 'recycling' | 'buying'
  categorySectionKey: string
  name: string
  count: string
  desc: string
  theme: string
  badge: string
  coverImage?: string
  centered?: boolean
}

interface HomeSectionItem {
  id: string
  title: string
  items: CategoryItem[]
}

interface ProductItem {
  id: number
  platform: string
  coverImage: string
  coverTitle: string
  title: string
  subtitle: string
  price: string
  tag: string
  score: string
}

interface TabItem {
  key: string
  text: string
  path: string
  icon: string
}

interface IndexData {
  currentTab: string
  pageTransitionClass: string
  isTabLoading: boolean
  isContentReady: boolean
  statusBarHeight: number
  searchKeyword: string
  isSearching: boolean
  searchResultCount: number
  banners: BannerItem[]
  homeSections: HomeSectionItem[]
  hotProducts: ProductItem[]
  hotProductsLoadingMore: boolean
  hotProductsReachedEnd: boolean
  searchResults: ProductItem[]
  tabs: TabItem[]
}

type CategoryTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { target?: string; categorySectionKey?: string; categoryName?: string }>
type ProductTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { id?: number | string }>
type TabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string; path?: string }>
type BannerTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { pageId?: number | string; contentEnabled?: boolean | number }>
type SearchInputEvent = WechatMiniprogram.Input
type SearchConfirmEvent = WechatMiniprogram.CustomEvent<{ value?: string }>

interface IndexPage extends NavigationTapGuard {
  recommendedProductPool: ProductRecord[]
  recommendedProductCursor: number
  hasLoadedHomepageContent?: boolean
  isPageActive?: boolean
  homepageBannerRequestId?: number
  homepageSectionRequestId?: number
  tabTransitionTimer?: number
  loadMoreTimer?: number
  onLoad(): void
  onShow(): void
  onHide(): void
  onUnload(): void
  onReady(): void
  onBannerTap(event: BannerTapEvent): void
  onPageScrollToLower(): void
  loadHomepageBanners(forceRefresh?: boolean): Promise<BannerItem[]>
  loadHomepageSection(forceRefresh?: boolean): Promise<HomeSectionItem[]>
  syncRecommendedProducts(reset?: boolean): void
  onSearchInput(event: SearchInputEvent): void
  onSearchConfirm(event: SearchConfirmEvent): void
  onSearchClear(): void
  onCategoryTap(event: CategoryTapEvent): void
  onProductTap(event: ProductTapEvent): void
  onTabTap(event: TabTapEvent): void
}

const searchableFieldWeights = {
  title: 120,
  subtitle: 80,
  platform: 60,
  tag: 50,
  coverTitle: 50,
  featureTags: 30,
  shoppingTextB: 20,
}

const getBannerPreviewText = (value?: string, maxLength = 36): string => {
  const normalizedValue = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.length > maxLength
    ? `${normalizedValue.slice(0, Math.max(1, maxLength - 1)).trim()}...`
    : normalizedValue
}

const mapHomepageBannerItem = (banner: BackendHomepageBanner): BannerItem => ({
  id: Number(banner.id || 0),
  tag: String(banner.tag || ''),
  title: String(banner.pageTitle || banner.page_title || banner.title || ''),
  desc: getBannerPreviewText(banner.bodyText || banner.body_text || banner.desc || ''),
  accent: String(banner.accent || ''),
  targetPageId: Number(banner.targetPageId || 0),
  contentEnabled: banner.contentEnabled === undefined && banner.content_enabled === undefined
    ? true
    : Number(banner.contentEnabled ?? banner.content_enabled) === 1,
  image: String(
    banner.coverImageUrl
    || banner.cover_image_url
    || banner.imageUrl
    || banner.image_url
    || banner.coverImage
    || banner.cover_image
    || '',
  ),
})

const getHomeProductTag = (product: ProductRecord): string => {
  const editionLabel = String(product.editionLabel || '').trim()

  if (editionLabel) {
    return editionLabel
  }

  return String(product.tag || '').trim()
}

const buildProductItem = (product: ProductRecord): ProductItem => ({
  id: product.id,
  platform: product.platform,
  coverImage: product.heroImage || product.detailImages[0] || '',
  coverTitle: product.coverTitle,
  title: product.title,
  subtitle: product.subtitle,
  price: `${product.price}元`,
  tag: getHomeProductTag(product),
  score: '',
})

const getPurchasableProducts = (): ProductRecord[] => {
  return productCatalog.filter((product) => product.inStock)
}

const DEFAULT_SECTION_TITLE = '购买&回收专区'

const getDefaultEntryCover = (target: 'recycling' | 'buying') => (
  target === 'recycling'
    ? ''
    : ''
)

const buildHomeSections = (config?: BackendHomepageSection | null): HomeSectionItem[] => {
  if (!config) {
    return []
  }

  const sourceSections = Array.isArray(config.sections)
    ? config.sections
    : [{
      id: 'section-default',
      title: config.sectionTitle || DEFAULT_SECTION_TITLE,
      items: Array.isArray(config.items) ? config.items : [],
    }]

  return sourceSections.map((section, sectionIndex) => ({
    id: String(section.id || '').trim() || `section-${sectionIndex + 1}`,
    title: String(section.title || '').trim() || `分区 ${sectionIndex + 1}`,
    items: (Array.isArray(section.items) ? section.items : []).map((item, itemIndex) => {
      const legacyKey = String(item.key || '').trim()
      const target = (item.target || legacyKey) === 'recycling' ? 'recycling' : 'buying'
      return {
        id: String(item.id || '').trim() || `section-${sectionIndex + 1}-entry-${itemIndex + 1}`,
        target,
        categorySectionKey: String(item.categorySectionKey || '').trim()
          || (target === 'recycling' ? 'recycle' : 'sale'),
        name: String(item.title || '').trim() || `入口 ${itemIndex + 1}`,
        count: '',
        desc: '',
        theme: 'yellow',
        badge: '',
        coverImage: String(item.coverImage || '').trim() || getDefaultEntryCover(target),
        centered: true,
      }
    }),
  }))
}

const shuffleProducts = (products: ProductRecord[]): ProductRecord[] => {
  const nextProducts = [...products]

  for (let index = nextProducts.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = nextProducts[index]
    nextProducts[index] = nextProducts[randomIndex]
    nextProducts[randomIndex] = current
  }

  return nextProducts
}

const normalizeSearchKeyword = (keyword: string) => keyword.trim().toLowerCase()

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

const getMatchedFieldScore = (text: string, keyword: string, weight: number) => {
  if (!text) {
    return 0
  }

  const normalizedText = text.toLowerCase()

  if (!fuzzyIncludes(normalizedText, keyword)) {
    return 0
  }

  let score = weight

  if (normalizedText.startsWith(keyword)) {
    score += 20
  }

  if (normalizedText === keyword) {
    score += 40
  }

  return score
}

const getSearchScore = (product: ProductRecord, keyword: string) => {
  let score = 0

  score += getMatchedFieldScore(product.title, keyword, searchableFieldWeights.title)
  score += getMatchedFieldScore(product.subtitle, keyword, searchableFieldWeights.subtitle)
  score += getMatchedFieldScore(product.platform, keyword, searchableFieldWeights.platform)
  score += getMatchedFieldScore(product.tag, keyword, searchableFieldWeights.tag)
  score += getMatchedFieldScore(product.coverTitle, keyword, searchableFieldWeights.coverTitle)
  score += product.featureTags.reduce(
    (total, featureTag) => total + getMatchedFieldScore(featureTag, keyword, searchableFieldWeights.featureTags),
    0,
  )
  score += getMatchedFieldScore(product.shoppingTextB, keyword, searchableFieldWeights.shoppingTextB)

  return score
}

const getSearchResults = (keyword: string): ProductItem[] => {
  const normalizedKeyword = normalizeSearchKeyword(keyword)

  if (!normalizedKeyword) {
    return []
  }

  return productCatalog
    .map((product) => ({
      product,
      score: getSearchScore(product, normalizedKeyword),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }

      if (b.product.releaseOrder !== a.product.releaseOrder) {
        return b.product.releaseOrder - a.product.releaseOrder
      }

      return a.product.id - b.product.id
    })
    .map((item) => buildProductItem(item.product))
}

const buildSearchState = (keyword: string) => {
  const normalizedKeyword = normalizeSearchKeyword(keyword)
  const searchResults = normalizedKeyword ? getSearchResults(keyword) : []

  return {
    searchKeyword: keyword,
    isSearching: Boolean(normalizedKeyword),
    searchResultCount: searchResults.length,
    searchResults,
  }
}

Page<IndexData, IndexPage>({
  data: {
    currentTab: 'home',
    pageTransitionClass: '',
    isTabLoading: false,
    isContentReady: false,
    statusBarHeight: 20,
    searchKeyword: '',
    isSearching: false,
    searchResultCount: 0,
    banners: [],
    homeSections: [],
    hotProducts: [],
    hotProductsLoadingMore: false,
    hotProductsReachedEnd: false,
    searchResults: [],
    tabs: [
      { key: 'home', text: '首页', path: '/pages/index/index', icon: 'H' },
      { key: 'sorts', text: '分类', path: '/pages/sorts/sorts', icon: 'S' },
      { key: 'order', text: '订单', path: '/pages/order/order', icon: 'O' },
      { key: 'mine', text: '我的', path: '/pages/mine/mine', icon: 'M' },
    ],
  },

  recommendedProductPool: [],
  recommendedProductCursor: 0,
  isPageActive: false,
  homepageBannerRequestId: 0,
  homepageSectionRequestId: 0,

  loadHomepageBanners(forceRefresh = false) {
    const requestId = (this.homepageBannerRequestId || 0) + 1
    this.homepageBannerRequestId = requestId

    if (forceRefresh) {
      clearPublicBackendCache('public-homepage-banners')
    }

    return fetchHomepageBanners()
      .then((homepageBanners) => {
        if (!this.isPageActive || requestId !== this.homepageBannerRequestId) {
          return this.data.banners
        }

        const nextBanners = Array.isArray(homepageBanners)
          ? homepageBanners.map(mapHomepageBannerItem)
          : []
        this.setData({
          banners: nextBanners,
        })

        return nextBanners
      })
      .catch((error) => {
        if (!this.isPageActive || requestId !== this.homepageBannerRequestId) {
          return this.data.banners
        }

        throw error
      })
  },

  loadHomepageSection(forceRefresh = false) {
    const requestId = (this.homepageSectionRequestId || 0) + 1
    this.homepageSectionRequestId = requestId

    if (forceRefresh) {
      clearPublicBackendCache('public-homepage-section')
    }

    return fetchHomepageSection()
      .then((section) => {
        if (!this.isPageActive || requestId !== this.homepageSectionRequestId) {
          return this.data.homeSections
        }

        const homeSections = buildHomeSections(section)
        this.setData({
          homeSections,
        })
        return homeSections
      })
      .catch((error) => {
        if (!this.isPageActive || requestId !== this.homepageSectionRequestId) {
          return this.data.homeSections
        }

        throw error
      })
  },

  onLoad() {
    this.isPageActive = true

    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })
    Promise.all([
      ensureProductCatalogLoaded().catch(() => productCatalog),
      this.loadHomepageBanners().catch(() => this.data.banners),
      this.loadHomepageSection().catch(() => this.data.homeSections),
    ])
      .then(() => {
        if (!this.isPageActive) {
          return
        }

        this.syncRecommendedProducts(true)
        this.setData({
          ...buildSearchState(this.data.searchKeyword),
          isContentReady: true,
          isTabLoading: false,
        })
        this.hasLoadedHomepageContent = true
      })
  },

  onShow() {
    const isTabSwitch = consumeTabEnterTransition(this, 'home')
    playTabEnterTransition(this)
    this.isPageActive = true

    if (isTabSwitch) {
      this.setData({ isTabLoading: this.data.isContentReady })
    }

    if (!this.hasLoadedHomepageContent) {
      return
    }

    Promise.all([
      this.loadHomepageBanners(),
      this.loadHomepageSection(true),
    ])
      .then(() => {
        if (this.isPageActive) {
          this.setData({ isTabLoading: false })
        }
      })
      .catch(() => {
        if (this.isPageActive) {
          this.setData({ isTabLoading: false })
        }
      })
  },

  onHide() {
    this.isPageActive = false
  },

  onUnload() {
    this.isPageActive = false
    this.homepageBannerRequestId = (this.homepageBannerRequestId || 0) + 1
    this.homepageSectionRequestId = (this.homepageSectionRequestId || 0) + 1

    clearTabTransitionTimer(this)

    if (this.loadMoreTimer) {
      clearTimeout(this.loadMoreTimer)
      this.loadMoreTimer = 0
    }
  },

  onReady() {
    playTabEnterTransition(this)
  },

  onBannerTap(event) {
    const pageId = Number(event.currentTarget.dataset.pageId || 0)
    const contentEnabled = Number(event.currentTarget.dataset.contentEnabled) !== 0

    if (!pageId || !contentEnabled) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: `/pages/feature-placeholder/feature-placeholder?pageId=${pageId}`,
    })
  },

  syncRecommendedProducts(reset = false) {
    if (reset) {
      this.recommendedProductPool = shuffleProducts(getPurchasableProducts())
      this.recommendedProductCursor = 0
      this.setData({
        hotProducts: [],
        hotProductsLoadingMore: false,
        hotProductsReachedEnd: false,
      })
    }

    if (!this.recommendedProductPool.length) {
      this.setData({
        hotProductsLoadingMore: false,
        hotProductsReachedEnd: true,
      })
      return
    }

    const nextCursor = Math.min(
      this.recommendedProductCursor + HOT_PRODUCTS_BATCH_SIZE,
      this.recommendedProductPool.length,
    )
    const nextProducts = this.recommendedProductPool
      .slice(this.recommendedProductCursor, nextCursor)
      .map(buildProductItem)

    if (!nextProducts.length) {
      this.setData({
        hotProductsLoadingMore: false,
        hotProductsReachedEnd: true,
      })
      return
    }

    this.recommendedProductCursor = nextCursor
    this.setData({
      hotProducts: reset ? nextProducts : [...this.data.hotProducts, ...nextProducts],
      hotProductsLoadingMore: false,
      hotProductsReachedEnd: this.recommendedProductCursor >= this.recommendedProductPool.length,
    })
  },

  onPageScrollToLower() {
    if (this.data.isSearching || this.data.hotProductsReachedEnd || this.data.hotProductsLoadingMore) {
      return
    }

    this.setData({
      hotProductsLoadingMore: true,
    })

    this.loadMoreTimer = setTimeout(() => {
      this.loadMoreTimer = 0
      this.syncRecommendedProducts()
    }, 0) as unknown as number
  },

  onSearchInput(event) {
    this.setData(buildSearchState(event.detail.value || ''))
  },

  onSearchConfirm(event) {
    this.setData(buildSearchState(event.detail.value || this.data.searchKeyword))
  },

  onSearchClear() {
    this.setData(buildSearchState(''))
  },

  onCategoryTap(event) {
    const { target = '', categorySectionKey = '', categoryName = '' } = event.currentTarget.dataset
    const queryParts: string[] = []
    if (categorySectionKey) {
      queryParts.push(`categorySectionKey=${encodeURIComponent(categorySectionKey)}`)
    }
    if (categoryName) {
      queryParts.push(`pageTitle=${encodeURIComponent(categoryName)}`)
    }
    const categoryQuery = queryParts.length ? `?${queryParts.join('&')}` : ''
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    if (target === 'recycling') {
      const localProfile = wx.getStorageSync(STORAGE_KEY) as Record<string, unknown> | undefined

      if (!localProfile) {
        redirectToMineLogin()
        return
      }

      wx.navigateTo({
        url: `/pages/handheld-recycling/handheld-recycling${categoryQuery}`,
      })
      return
    }

    if (target === 'buying') {
      wx.navigateTo({
        url: `/pages/handheld-buying/handheld-buying${categoryQuery}`,
      })
      return
    }

    wx.showToast({
      title: '该专区功能待接入',
      icon: 'none',
    })
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

  onTabTap(event) {
    const { path, key } = event.currentTarget.dataset
    if (!path || key === this.data.currentTab) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    startSlidingTabSwitch(this, this.data.currentTab as RootTabKey, key as RootTabKey, path)
  },
})
