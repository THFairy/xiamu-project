// 我的态度列表页面逻辑
import { getStatusBarHeight } from '../../utils/system'
import { ensureProductCatalogLoaded, getProductById, ProductRecord } from '../../data/products'
import {
  clearProductAttitudeByKey,
  getAttitudeMetaByKey,
  getProductIdsByAttitude,
  removeProductAttitude,
  productAttitudeMetas,
  ProductAttitudeKey,
} from '../../utils/attitude'
import {
  clearTabTransitionTimer,
  consumeTabEnterTransition,
  BackTapGuard,
  NavigationTapGuard,
  playTabEnterTransition,
  RootTabKey,
  shouldIgnoreRapidBackTap,
  shouldIgnoreRapidNavigationTap,
  startSlidingTabSwitch,
} from '../../utils/navigation'
import { fetchMyTutorialInteractions, BackendContentPage, ensureBackendSession, toggleTutorialInteraction } from '../../utils/backend'

interface AttitudeListItem {
  productId: number
  title: string
  subtitle: string
  coverTitle: string
  coverImage: string
  price: string
  platform: string
}

interface AttitudeModeItem {
  id: number
  key: ProductAttitudeKey
  text: string
  active: boolean
}

interface TabItem {
  key: RootTabKey
  text: string
  path: string
}

interface AttitudeListData {
  currentTab: RootTabKey
  pageTransitionClass: string
  statusBarHeight: number
  pageTitle: string
  attitudeLabel: string
  attitudeKey: ProductAttitudeKey
  attitudeModes: AttitudeModeItem[]
  items: AttitudeListItem[]
  itemCount: number
  emptyText: string
  tabs: TabItem[]
}

type AttitudeListOptions = {
  key?: string
}

type ProductTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { productId?: number | string }>
type DeleteTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { productId?: number | string }>
type ModeTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: ProductAttitudeKey }>
type TabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: RootTabKey; path?: string }>

interface AttitudeListPage extends NavigationTapGuard, BackTapGuard {
  tabTransitionTimer?: number
  onLoad(options: AttitudeListOptions): void
  onReady(): void
  onShow(): void
  onUnload(): void
  setActiveAttitude(key: ProductAttitudeKey): void
  syncItems(): void
  onBackTap(): void
  onAttitudeModeTap(event: ModeTapEvent): void
  onItemTap(event: ProductTapEvent): void
  onDeleteTap(event: DeleteTapEvent): Promise<void>
  onClearTap(): void
  onTabTap(event: TabTapEvent): void
  attitudeActionInProgress?: boolean
}

const DEFAULT_ATTITUDE_KEY: ProductAttitudeKey = 'favorite'

const isAttitudeKey = (value?: string): value is ProductAttitudeKey => {
  return value === 'favorite' || value === 'wishlist' || value === 'played' || value === 'owned' || value === 'like'
}

const buildListItem = (product: ProductRecord): AttitudeListItem => ({
  productId: product.id,
  title: product.title,
  subtitle: product.subtitle,
  coverTitle: product.coverTitle,
  coverImage: product.heroImage || product.detailImages[0] || '',
  price: product.price,
  platform: product.platform,
})

Page<AttitudeListData, AttitudeListPage>({
  data: {
    currentTab: 'mine',
    pageTransitionClass: '',
    statusBarHeight: 20,
    pageTitle: '我的收藏',
    attitudeLabel: '收藏',
    attitudeKey: DEFAULT_ATTITUDE_KEY,
    attitudeModes: productAttitudeMetas.map((item) => ({
      id: item.id,
      key: item.key,
      text: item.label,
      active: item.key === DEFAULT_ATTITUDE_KEY,
    })),
    items: [],
    itemCount: 0,
    emptyText: '该页暂无收藏',
    tabs: [
      { key: 'home', text: '首页', path: '/pages/index/index' },
      { key: 'sorts', text: '分类', path: '/pages/sorts/sorts' },
      { key: 'order', text: '订单', path: '/pages/order/order' },
      { key: 'mine', text: '我的', path: '/pages/mine/mine' },
    ],
  },

  onLoad(options: AttitudeListOptions) {
    const attitudeKey = isAttitudeKey(options.key) ? options.key : DEFAULT_ATTITUDE_KEY

    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })
    consumeTabEnterTransition(this, 'mine')
    this.setActiveAttitude(attitudeKey)

    ensureProductCatalogLoaded(true)
      .then(() => {
        this.syncItems()
      })
      .catch(() => {
        this.syncItems()
      })
  },

  onReady() {
    playTabEnterTransition(this)
  },

  onShow() {
    this.syncItems()
  },

  onUnload() {
    clearTabTransitionTimer(this)
  },

  setActiveAttitude(key) {
    const matchedMeta = getAttitudeMetaByKey(key)
    const attitudeLabel = matchedMeta ? matchedMeta.label : '收藏'

    this.setData({
      attitudeKey: key,
      attitudeLabel,
      attitudeModes: productAttitudeMetas.map((item) => ({
        id: item.id,
        key: item.key,
        text: item.label,
        active: item.key === key,
      })),
      emptyText: `该页暂无${attitudeLabel}`,
    })
  },

  syncItems() {
    if (this.data.attitudeKey === 'like' || this.data.attitudeKey === 'favorite') {
      ensureBackendSession()
        .then(() => fetchMyTutorialInteractions(this.data.attitudeKey === 'like' ? 'like' : 'favorite'))
        .then((articles) => {
          const items = articles.map(buildTutorialListItem)
          this.setData({ items, itemCount: items.length })
        })
        .catch(() => this.setData({ items: [], itemCount: 0 }))
      return
    }
    const productIds = getProductIdsByAttitude(this.data.attitudeKey)
    const items = productIds
      .map((productId) => getProductById(productId))
      .filter((item): item is ProductRecord => Boolean(item))
      .map(buildListItem)

    this.setData({
      items,
      itemCount: items.length,
    })
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/mine/mine',
        })
      },
    })
  },

  onAttitudeModeTap(event) {
    const key = event.currentTarget.dataset.key

    if (!isAttitudeKey(key) || key === this.data.attitudeKey) {
      return
    }

    this.setActiveAttitude(key)
    this.syncItems()
  },

  onItemTap(event) {
    const productId = Number(event.currentTarget.dataset.productId)

    if (!productId) {
      return
    }

    wx.navigateTo({
      url: this.data.attitudeKey === 'like' || this.data.attitudeKey === 'favorite'
        ? `/pages/feature-placeholder/feature-placeholder?pageId=${productId}`
        : `/pages/product-detail/product-detail?id=${productId}`,
    })
  },

  async onDeleteTap(event) {
    const productId = Number(event.currentTarget.dataset.productId)

    if (!productId || this.attitudeActionInProgress) {
      return
    }

    if (this.data.attitudeKey === 'like' || this.data.attitudeKey === 'favorite') {
      this.attitudeActionInProgress = true
      const action = this.data.attitudeKey

      try {
        await ensureBackendSession()
        await toggleTutorialInteraction(productId, action)
        const items = this.data.items.filter((item) => item.productId !== productId)
        this.setData({ items, itemCount: items.length })
        wx.showToast({
          title: `已移出${this.data.attitudeLabel}`,
          icon: 'none',
        })
      } catch (_error) {
        wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      } finally {
        this.attitudeActionInProgress = false
      }
      return
    }

    removeProductAttitude(productId, this.data.attitudeKey)
    this.syncItems()

    wx.showToast({
      title: `已移出${this.data.attitudeLabel}`,
      icon: 'none',
    })
  },

  onClearTap() {
    if (!this.data.itemCount) {
      wx.showToast({
        title: `当前没有${this.data.attitudeLabel}内容`,
        icon: 'none',
      })
      return
    }

    wx.showModal({
      title: '提示',
      content: `是否清空全部${this.data.attitudeLabel}记录？`,
      confirmText: '清空',
      cancelText: '取消',
      confirmColor: '#e62222',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        if (this.attitudeActionInProgress) {
          return
        }

        if (this.data.attitudeKey === 'like' || this.data.attitudeKey === 'favorite') {
          this.attitudeActionInProgress = true
          const action = this.data.attitudeKey
          const productIds = this.data.items.map((item) => item.productId)
          const removedIds = new Set<number>()

          try {
            await ensureBackendSession()
            for (const productId of productIds) {
              await toggleTutorialInteraction(productId, action)
              removedIds.add(productId)
            }
            const items = this.data.items.filter((item) => !removedIds.has(item.productId))
            this.setData({ items, itemCount: items.length })
            wx.showToast({
              title: `已清空${this.data.attitudeLabel}`,
              icon: 'none',
            })
          } catch (_error) {
            const items = this.data.items.filter((item) => !removedIds.has(item.productId))
            this.setData({ items, itemCount: items.length })
            wx.showToast({
              title: removedIds.size ? '部分内容清空失败，请重试' : '清空失败，请重试',
              icon: 'none',
            })
          } finally {
            this.attitudeActionInProgress = false
          }
          return
        }

        clearProductAttitudeByKey(this.data.attitudeKey)
        this.syncItems()

        wx.showToast({
          title: `已清空${this.data.attitudeLabel}`,
          icon: 'none',
        })
      },
    })
  },

  onTabTap(event) {
    const { key, path } = event.currentTarget.dataset

    if (!key || !path || shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    if (key === 'mine') {
      wx.reLaunch({
        url: path,
      })
      return
    }

    startSlidingTabSwitch(this, this.data.currentTab, key, path)
  },
})

const buildTutorialListItem = (page: BackendContentPage): AttitudeListItem => ({
  productId: Number(page.id || 0),
  title: String(page.title || ''),
  subtitle: String(page.titleTag || page.title_tag || ''),
  coverTitle: String(page.titleTag || page.title_tag || ''),
  coverImage: String(page.titleTagImageUrl || page.title_tag_image || page.coverImage || page.cover_image || ''),
  price: '',
  platform: '教程',
})
