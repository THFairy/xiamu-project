import { fetchPublicCategories, BackendCategoryConfig } from '../../utils/backend'
import { ensureProductCatalogLoaded, productCatalog, ProductRecord } from '../../data/products'
import {
  consumeTabEnterTransition,
  clearTabTransitionTimer,
  playTabEnterTransition,
  RootTabKey,
  shouldIgnoreRapidNavigationTap,
  startSlidingTabSwitch,
  NavigationTapGuard,
} from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

const STORAGE_KEY = 'mine-local-user-profile'
const PENDING_SORT_CATEGORY_KEY = 'pending-sorts-category-key'

const redirectToMineLogin = () => {
  wx.reLaunch({
    url: '/pages/mine/mine?guard=detail',
  })
}

interface TabItem {
  key: string
  text: string
  path: string
  icon: string
}

interface PartitionItem {
  id: number
  key: string
  text: string
  active?: boolean
}

interface FilterMenuItem {
  id: number
  key: string
  label: string
  displayText: string
  options: FilterOptionItem[]
}

interface FilterOptionItem {
  id: number
  text: string
  value: string
  selected?: boolean
}

type ProductItem = ProductRecord

interface SortsData {
  currentTab: string
  pageTransitionClass: string
  isLoading: boolean
  statusBarHeight: number
  activeMenuKey: string
  currentPartitionKey: string
  searchKeyword: string
  isSearching: boolean
  selectedModelValue: string
  selectedFilterValue: string
  selectedSortValue: string
  pageTitle: string
  pageTip: string
  searchPlaceholder: string
  partitionScrollThumbWidth: number
  partitionScrollThumbLeft: number
  partitionScrollLeft: number
  partitions: PartitionItem[]
  filterMenus: FilterMenuItem[]
  visibleProductTotalCount: number
  visibleProductsLoadingMore: boolean
  visibleProducts: ProductItem[]
  visibleProductsReachedEnd: boolean
  tabs: TabItem[]
}

type TabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string; path?: string }>
type PartitionTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type PartitionScrollEvent = WechatMiniprogram.ScrollViewScroll
type PartitionProgressTouchEvent = WechatMiniprogram.TouchEvent
type FilterMenuTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string }>
type FilterOptionTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string; optionValue?: string }>
type ProductTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { id?: number | string }>
type SearchInputEvent = WechatMiniprogram.Input
type SearchConfirmEvent = WechatMiniprogram.CustomEvent<{ value?: string }>

interface SortsPage extends NavigationTapGuard {
  tabTransitionTimer?: number
  loadMoreTimer?: number
  saleCategories: BackendCategoryConfig[]
  visibleProductPool: ProductItem[]
  visibleProductCursor: number
  partitionViewportWidth?: number
  partitionContentWidth?: number
  partitionProgressTrackLeft?: number
  partitionProgressTrackWidth?: number
  partitionProgressDragging?: boolean
  onLoad(): void
  onReady(): void
  onShow(): void
  onUnload(): void
  syncCatalog(): Promise<void>
  applyVisibleState(
    categoryKey: string,
    searchKeyword: string,
    selectedModelValue: string,
    selectedFilterValue: string,
    selectedSortValue: string,
    patch?: Partial<SortsData>,
  ): void
  appendVisibleProducts(): void
  onProductScrollToLower(): void
  onTabTap(event: TabTapEvent): void
  onPartitionTap(event: PartitionTapEvent): void
  onPartitionScroll(event: PartitionScrollEvent): void
  refreshPartitionScrollIndicator(): void
  onPartitionProgressTouchStart(event: PartitionProgressTouchEvent): void
  onPartitionProgressTouchMove(event: PartitionProgressTouchEvent): void
  onPartitionProgressTouchEnd(): void
  onFilterMenuTap(event: FilterMenuTapEvent): void
  onFilterOptionTap(event: FilterOptionTapEvent): void
  onFilterMaskTap(): void
  onSearchInput(event: SearchInputEvent): void
  onSearchConfirm(event: SearchConfirmEvent): void
  onSearchClear(): void
  onProductTap(event: ProductTapEvent): void
}

const defaultFilterValues = {
  model: 'all',
  filter: 'all',
  sort: 'default',
}

const SORTS_PRODUCTS_BATCH_SIZE = 10
const PARTITION_SCROLL_THUMB_SCALE = 0.5

const searchableFieldWeights = {
  title: 120,
  subtitle: 80,
  platform: 60,
  tag: 50,
  coverTitle: 50,
  featureTags: 30,
  shoppingTextB: 20,
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

const sortCategories = (categories: BackendCategoryConfig[]): BackendCategoryConfig[] => {
  return [...categories].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order
    }

    return left.id - right.id
  })
}

const buildFallbackCategoryName = (categoryKey: string): string => {
  const normalizedKey = String(categoryKey || '').toLowerCase()

  if (normalizedKey.includes('nintendo')) {
    return '任天堂'
  }

  if (normalizedKey.includes('sony')) {
    return '索尼'
  }

  if (normalizedKey.includes('steam')) {
    return 'Steam'
  }

  if (normalizedKey.includes('rog') || normalizedKey.includes('asus')) {
    return 'ROG'
  }

  if (normalizedKey.includes('xbox')) {
    return 'Xbox'
  }

  return categoryKey || '其他'
}

const buildFallbackSaleCategories = (): BackendCategoryConfig[] => {
  const seenKeys = new Set<string>()

  return productCatalog.reduce<BackendCategoryConfig[]>((result, product, index) => {
    const categoryKey = product.rawCategoryKey || product.categoryKey

    if (!categoryKey || seenKeys.has(categoryKey)) {
      return result
    }

    seenKeys.add(categoryKey)
    result.push({
      id: index + 1,
      key: categoryKey,
      name: buildFallbackCategoryName(categoryKey),
      scene: 'sale',
      theme: 'gray',
      order: index + 1,
    })
    return result
  }, [])
}

const getCategoryScopedProducts = (categoryKey: string): ProductItem[] => {
  if (categoryKey === 'all') {
    return [...productCatalog]
  }

  return productCatalog.filter((product) => (product.rawCategoryKey || product.categoryKey) === categoryKey)
}

const buildPartitions = (categories: BackendCategoryConfig[], currentKey: string): PartitionItem[] => {
  return [
    { id: 1, key: 'all', text: '全部', active: currentKey === 'all' },
    ...categories.map((category, index) => ({
      id: index + 2,
      key: category.key,
      text: category.name || buildFallbackCategoryName(category.key),
      active: category.key === currentKey,
    })),
  ]
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

const sortProducts = (products: ProductItem[], sortValue: string, searchKeyword: string): ProductItem[] => {
  const sortedProducts = [...products]
  const normalizedKeyword = normalizeSearchKeyword(searchKeyword)

  if (sortValue === 'price-asc') {
    return sortedProducts.sort((a, b) => Number(a.price) - Number(b.price))
  }

  if (sortValue === 'price-desc') {
    return sortedProducts.sort((a, b) => Number(b.price) - Number(a.price))
  }

  if (sortValue === 'latest') {
    return sortedProducts.sort((a, b) => b.releaseOrder - a.releaseOrder)
  }

  if (normalizedKeyword) {
    return sortedProducts.sort((a, b) => {
      const scoreDiff = getSearchScore(b, normalizedKeyword) - getSearchScore(a, normalizedKeyword)

      if (scoreDiff !== 0) {
        return scoreDiff
      }

      if (b.releaseOrder !== a.releaseOrder) {
        return b.releaseOrder - a.releaseOrder
      }

      return a.id - b.id
    })
  }

  return sortedProducts.sort((a, b) => {
    if (b.releaseOrder !== a.releaseOrder) {
      return b.releaseOrder - a.releaseOrder
    }

    return a.id - b.id
  })
}

const normalizeModelValue = (selectedModelValue: string, scopedProducts: ProductItem[]): string => {
  if (selectedModelValue === defaultFilterValues.model) {
    return selectedModelValue
  }

  return scopedProducts.some((product) => product.modelKey === selectedModelValue)
    ? selectedModelValue
    : defaultFilterValues.model
}

const buildFilterMenus = (selectedSortValue: string): FilterMenuItem[] => {
  const filterMenus: Array<Omit<FilterMenuItem, 'displayText' | 'options'> & { options: FilterOptionItem[] }> = [
    {
      id: 1,
      key: 'sort',
      label: '排序',
      options: [
        { id: 1, text: '默认排序', value: 'default', selected: selectedSortValue === 'default' },
        { id: 2, text: '价格升序', value: 'price-asc', selected: selectedSortValue === 'price-asc' },
        { id: 3, text: '价格降序', value: 'price-desc', selected: selectedSortValue === 'price-desc' },
        { id: 4, text: '最新发布', value: 'latest', selected: selectedSortValue === 'latest' },
      ],
    },
  ]

  return filterMenus.map((menu) => {
    const selectedOption = menu.options.find((option) => option.selected)

    return {
      ...menu,
      displayText: selectedOption ? selectedOption.text : menu.label,
      options: menu.options,
    }
  })
}

const getVisibleProducts = (
  categoryKey: string,
  searchKeyword: string,
  selectedModelValue: string,
  selectedFilterValue: string,
  selectedSortValue: string,
): ProductItem[] => {
  const normalizedKeyword = normalizeSearchKeyword(searchKeyword)
  let filteredProducts = getCategoryScopedProducts(categoryKey)

  if (selectedModelValue !== defaultFilterValues.model) {
    filteredProducts = filteredProducts.filter((product) => product.modelKey === selectedModelValue)
  }

  if (selectedFilterValue === 'in-stock') {
    filteredProducts = filteredProducts.filter((product) => product.inStock)
  } else if (selectedFilterValue === 'recyclable') {
    filteredProducts = filteredProducts.filter((product) => product.recyclable)
  } else if (selectedFilterValue === 'premium') {
    filteredProducts = filteredProducts.filter((product) => product.premiumCondition)
  } else if (selectedFilterValue === 'certified') {
    filteredProducts = filteredProducts.filter((product) => product.certifiedPrice)
  }

  if (normalizedKeyword) {
    filteredProducts = filteredProducts.filter((product) => getSearchScore(product, normalizedKeyword) > 0)
  }

  return sortProducts(filteredProducts, selectedSortValue, normalizedKeyword)
}

const shuffleProducts = (products: ProductItem[]): ProductItem[] => {
  const nextProducts = [...products]

  for (let index = nextProducts.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = nextProducts[index]
    nextProducts[index] = nextProducts[randomIndex]
    nextProducts[randomIndex] = current
  }

  return nextProducts
}

const buildVisibleState = (
  categories: BackendCategoryConfig[],
  categoryKey: string,
  searchKeyword: string,
  selectedModelValue: string,
  selectedFilterValue: string,
  selectedSortValue: string,
) => {
  const scopedProducts = getCategoryScopedProducts(categoryKey)
  const nextSelectedModelValue = normalizeModelValue(selectedModelValue, scopedProducts)

  return {
    currentPartitionKey: categoryKey,
    searchKeyword,
    isSearching: Boolean(normalizeSearchKeyword(searchKeyword)),
    selectedModelValue: nextSelectedModelValue,
    selectedFilterValue,
    selectedSortValue,
    partitions: buildPartitions(categories, categoryKey),
    filterMenus: buildFilterMenus(selectedSortValue),
    visibleProductTotalCount: getVisibleProducts(
      categoryKey,
      searchKeyword,
      nextSelectedModelValue,
      selectedFilterValue,
      selectedSortValue,
    ).length,
    visibleProducts: getVisibleProducts(
      categoryKey,
      searchKeyword,
      nextSelectedModelValue,
      selectedFilterValue,
      selectedSortValue,
    ),
    visibleProductsReachedEnd: false,
  }
}

const buildPartitionScrollIndicator = (
  scrollLeft: number,
  scrollWidth: number,
  viewportWidth: number,
): { partitionScrollThumbWidth: number; partitionScrollThumbLeft: number } => {
  if (scrollWidth <= 0 || viewportWidth <= 0 || scrollWidth <= viewportWidth) {
    return {
      partitionScrollThumbWidth: 50,
      partitionScrollThumbLeft: 0,
    }
  }

  const thumbWidth = Math.min(100, (viewportWidth / scrollWidth) * 100 * PARTITION_SCROLL_THUMB_SCALE)
  const maxScrollLeft = scrollWidth - viewportWidth
  const scrollProgress = Math.max(0, Math.min(1, scrollLeft / maxScrollLeft))

  return {
    partitionScrollThumbWidth: thumbWidth,
    partitionScrollThumbLeft: scrollProgress * (100 - thumbWidth),
  }
}

Page<SortsData, SortsPage>({
  data: {
    currentTab: 'sorts',
    pageTransitionClass: '',
    isLoading: true,
    statusBarHeight: 20,
    activeMenuKey: '',
    currentPartitionKey: 'all',
    searchKeyword: '',
    isSearching: false,
    selectedModelValue: defaultFilterValues.model,
    selectedFilterValue: defaultFilterValues.filter,
    selectedSortValue: defaultFilterValues.sort,
    pageTitle: '分类',
    pageTip: '网页后台商品与分类内容已同步',
    searchPlaceholder: '请输入关键词',
    partitionScrollThumbWidth: 14,
    partitionScrollThumbLeft: 0,
    partitionScrollLeft: 0,
    partitions: buildPartitions([], 'all'),
    filterMenus: buildFilterMenus(defaultFilterValues.sort),
    visibleProductTotalCount: 0,
    visibleProductsLoadingMore: false,
    visibleProducts: [],
    visibleProductsReachedEnd: false,
    tabs: [
      { key: 'home', text: '首页', path: '/pages/index/index', icon: 'H' },
      { key: 'sorts', text: '分类', path: '/pages/sorts/sorts', icon: 'S' },
      { key: 'order', text: '订单', path: '/pages/order/order', icon: 'O' },
      { key: 'mine', text: '我的', path: '/pages/mine/mine', icon: 'M' },
    ],
  },

  saleCategories: [],
  visibleProductPool: [],
  visibleProductCursor: 0,

  onLoad(options?: { categoryKey?: string }) {
    const requestedCategoryKey = String(options?.categoryKey || '').trim()
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      currentPartitionKey: requestedCategoryKey || 'all',
    })
    this.syncCatalog()
      .then(() => this.setData({ isLoading: false }))
      .catch(() => this.setData({ isLoading: false }))
  },

  onReady() {
    playTabEnterTransition(this)
    this.refreshPartitionScrollIndicator()
  },

  onShow() {
    const isTabSwitch = consumeTabEnterTransition(this, 'sorts')
    playTabEnterTransition(this)

    const pendingCategoryKey = String(wx.getStorageSync(PENDING_SORT_CATEGORY_KEY) || '').trim()
    if (pendingCategoryKey) {
      wx.removeStorageSync(PENDING_SORT_CATEGORY_KEY)
      this.setData({
        currentPartitionKey: pendingCategoryKey,
        isLoading: true,
      })
      this.syncCatalog()
        .then(() => this.setData({ isLoading: false }))
        .catch(() => this.setData({ isLoading: false }))
      return
    }

    if (!isTabSwitch) {
      return
    }

    this.setData({ isLoading: true })
    this.syncCatalog()
      .then(() => this.setData({ isLoading: false }))
      .catch(() => this.setData({ isLoading: false }))
  },

  onUnload() {
    clearTabTransitionTimer(this)

    if (this.loadMoreTimer) {
      clearTimeout(this.loadMoreTimer)
      this.loadMoreTimer = 0
    }
  },

  async syncCatalog() {
    const catalogResults = await Promise.all([
      ensureProductCatalogLoaded(true),
      fetchPublicCategories('sale').catch(() => [] as BackendCategoryConfig[]),
    ])
    const categories = catalogResults[1]
    const saleCategories = sortCategories(categories.length ? categories : buildFallbackSaleCategories())

    this.saleCategories = saleCategories
    this.applyVisibleState(
      this.data.currentPartitionKey,
      this.data.searchKeyword,
      this.data.selectedModelValue,
      this.data.selectedFilterValue,
      this.data.selectedSortValue,
    )
  },

  applyVisibleState(
    categoryKey,
    searchKeyword,
    selectedModelValue,
    selectedFilterValue,
    selectedSortValue,
    patch = {},
  ) {
    const nextState = buildVisibleState(
      this.saleCategories,
      categoryKey,
      searchKeyword,
      selectedModelValue,
      selectedFilterValue,
      selectedSortValue,
    )
    const allVisibleProducts = nextState.visibleProducts
    const shouldShuffle = nextState.selectedSortValue === defaultFilterValues.sort
    this.visibleProductPool = shouldShuffle ? shuffleProducts(allVisibleProducts) : [...allVisibleProducts]
    this.visibleProductCursor = Math.min(SORTS_PRODUCTS_BATCH_SIZE, this.visibleProductPool.length)

    this.setData({
      ...nextState,
      ...patch,
      visibleProductTotalCount: allVisibleProducts.length,
      visibleProductsLoadingMore: false,
      visibleProducts: this.visibleProductPool.slice(0, this.visibleProductCursor),
      visibleProductsReachedEnd: this.visibleProductCursor >= this.visibleProductPool.length,
    }, () => {
      this.refreshPartitionScrollIndicator()
    })
  },

  appendVisibleProducts() {
    if (!this.visibleProductPool.length || this.data.visibleProductsReachedEnd) {
      return
    }

    const nextCursor = Math.min(
      this.visibleProductCursor + SORTS_PRODUCTS_BATCH_SIZE,
      this.visibleProductPool.length,
    )

    if (nextCursor <= this.visibleProductCursor) {
      this.setData({
        visibleProductsLoadingMore: false,
        visibleProductsReachedEnd: true,
      })
      return
    }

    const nextProducts = this.visibleProductPool.slice(this.visibleProductCursor, nextCursor)
    this.visibleProductCursor = nextCursor

    this.setData({
      visibleProductsLoadingMore: false,
      visibleProducts: [...this.data.visibleProducts, ...nextProducts],
      visibleProductsReachedEnd: this.visibleProductCursor >= this.visibleProductPool.length,
    })
  },

  onProductScrollToLower() {
    if (
      !this.data.visibleProducts.length
      || this.data.visibleProductsReachedEnd
      || this.data.visibleProductsLoadingMore
    ) {
      return
    }

    this.setData({
      visibleProductsLoadingMore: true,
    })

    this.loadMoreTimer = setTimeout(() => {
      this.loadMoreTimer = 0
      this.appendVisibleProducts()
    }, 0) as unknown as number
  },

  onPartitionTap(event) {
    const { key } = event.currentTarget.dataset
    if (!key || key === this.data.currentPartitionKey) {
      return
    }

    this.applyVisibleState(
      key,
      this.data.searchKeyword,
      this.data.selectedModelValue,
      this.data.selectedFilterValue,
      this.data.selectedSortValue,
      { activeMenuKey: '' },
    )
  },

  onPartitionScroll(event) {
    const viewportWidth = this.partitionViewportWidth || 0
    this.partitionContentWidth = event.detail.scrollWidth

    if (!viewportWidth) {
      this.refreshPartitionScrollIndicator()
      return
    }

    this.setData({
      partitionScrollLeft: event.detail.scrollLeft,
      ...buildPartitionScrollIndicator(
        event.detail.scrollLeft,
        event.detail.scrollWidth,
        viewportWidth,
      ),
    })
  },

  refreshPartitionScrollIndicator() {
    const query = wx.createSelectorQuery()
    query.select('.partition-scroll').boundingClientRect()
    query.select('.partition-list').boundingClientRect()
    query.select('.partition-progress').boundingClientRect()
    query.exec((rects) => {
      const viewportRect = rects[0] as { width?: number } | null
      const contentRect = rects[1] as { width?: number } | null
      const trackRect = rects[2] as { left?: number; width?: number } | null
      const viewportWidth = Number(viewportRect?.width || 0)
      const contentWidth = Number(contentRect?.width || 0)

      this.partitionViewportWidth = viewportWidth
      this.partitionContentWidth = contentWidth
      this.partitionProgressTrackLeft = Number(trackRect?.left || 0)
      this.partitionProgressTrackWidth = Number(trackRect?.width || 0)
      this.setData(buildPartitionScrollIndicator(0, contentWidth, viewportWidth))
    })
  },

  onPartitionProgressTouchStart(event) {
    this.partitionProgressDragging = true
    this.onPartitionProgressTouchMove(event)
  },

  onPartitionProgressTouchMove(event) {
    if (!this.partitionProgressDragging) {
      return
    }

    const touch = event.touches[0]
    const trackLeft = this.partitionProgressTrackLeft || 0
    const trackWidth = this.partitionProgressTrackWidth || 0
    const viewportWidth = this.partitionViewportWidth || 0
    const contentWidth = this.partitionContentWidth || 0

    if (!touch || !trackWidth || !viewportWidth || contentWidth <= viewportWidth) {
      return
    }

    const thumbWidth = trackWidth * this.data.partitionScrollThumbWidth / 100
    const maxThumbLeft = Math.max(trackWidth - thumbWidth, 0)
    const targetThumbLeft = Math.max(
      0,
      Math.min(maxThumbLeft, touch.clientX - trackLeft - thumbWidth / 2),
    )
    const maxScrollLeft = contentWidth - viewportWidth
    const scrollLeft = maxThumbLeft > 0
      ? (targetThumbLeft / maxThumbLeft) * maxScrollLeft
      : 0

    this.setData({
      partitionScrollLeft: scrollLeft,
      ...buildPartitionScrollIndicator(scrollLeft, contentWidth, viewportWidth),
    })
  },

  onPartitionProgressTouchEnd() {
    this.partitionProgressDragging = false
  },

  onFilterMenuTap(event) {
    const { key } = event.currentTarget.dataset
    if (!key) {
      return
    }

    this.setData({
      activeMenuKey: this.data.activeMenuKey === key ? '' : key,
    })
  },

  onFilterOptionTap(event) {
    const { key, optionValue } = event.currentTarget.dataset
    if (!key || typeof optionValue !== 'string') {
      return
    }

    const nextSelectedModelValue = key === 'model' ? optionValue : this.data.selectedModelValue
    const nextSelectedFilterValue = key === 'filter' ? optionValue : this.data.selectedFilterValue
    const nextSelectedSortValue = key === 'sort' ? optionValue : this.data.selectedSortValue

    this.applyVisibleState(
      this.data.currentPartitionKey,
      this.data.searchKeyword,
      nextSelectedModelValue,
      nextSelectedFilterValue,
      nextSelectedSortValue,
      { activeMenuKey: '' },
    )
  },

  onFilterMaskTap() {
    this.setData({
      activeMenuKey: '',
    })
  },

  onSearchInput(event) {
    this.applyVisibleState(
      this.data.currentPartitionKey,
      event.detail.value || '',
      this.data.selectedModelValue,
      this.data.selectedFilterValue,
      this.data.selectedSortValue,
      { activeMenuKey: '' },
    )
  },

  onSearchConfirm(event) {
    this.applyVisibleState(
      this.data.currentPartitionKey,
      event.detail.value || this.data.searchKeyword,
      this.data.selectedModelValue,
      this.data.selectedFilterValue,
      this.data.selectedSortValue,
      { activeMenuKey: '' },
    )
  },

  onSearchClear() {
    this.applyVisibleState(
      this.data.currentPartitionKey,
      '',
      this.data.selectedModelValue,
      this.data.selectedFilterValue,
      this.data.selectedSortValue,
      { activeMenuKey: '' },
    )
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
