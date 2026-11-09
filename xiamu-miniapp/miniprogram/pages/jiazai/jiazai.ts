// 启动页预加载首页数据，并在接口异常时有限重试后降级进入首页。
import { ensureProductCatalogLoaded } from '../../data/products'
import { fetchHomepageBanners, fetchHomepageSection } from '../../utils/backend'

const CONTENT_REVEAL_DELAY_MS = 200
const PRELOAD_RETRY_DELAY_MS = 1000
const MAX_PRELOAD_ATTEMPTS = 3

const wait = (duration: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, duration)
})

interface LoadingPage {
  hasLeftPage?: boolean
  hasNavigated?: boolean
  onLoad(): void
  onUnload(): void
  preloadHomepage(): Promise<void>
  redirectToHomepage(): void
}

Page<Record<string, never>, LoadingPage>({
  data: {},

  hasLeftPage: false,

  onLoad() {
    this.hasLeftPage = false
    this.hasNavigated = false
    void this.preloadHomepage()
  },

  onUnload() {
    this.hasLeftPage = true
  },

  async preloadHomepage() {
    let hasPreloadFailure = false

    for (let attempt = 1; attempt <= MAX_PRELOAD_ATTEMPTS; attempt += 1) {
      const results = await Promise.all([
        ensureProductCatalogLoaded().then(() => true).catch(() => false),
        fetchHomepageBanners().then(() => true).catch(() => false),
        fetchHomepageSection().then(() => true).catch(() => false),
      ])

      hasPreloadFailure = results.some((isSuccess) => !isSuccess)

      if (!hasPreloadFailure || this.hasLeftPage || attempt === MAX_PRELOAD_ATTEMPTS) {
        break
      }

      await wait(PRELOAD_RETRY_DELAY_MS)
    }

    if (this.hasLeftPage) {
      return
    }

    await wait(CONTENT_REVEAL_DELAY_MS)

    if (this.hasLeftPage) {
      return
    }

    if (hasPreloadFailure) {
      wx.showToast({
        title: '部分内容加载失败',
        icon: 'none',
      })
    }

    this.redirectToHomepage()
  },

  redirectToHomepage() {
    if (this.hasLeftPage || this.hasNavigated) {
      return
    }

    this.hasNavigated = true
    wx.reLaunch({
      url: '/pages/index/index',
    })
  },
})
