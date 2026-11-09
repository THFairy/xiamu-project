/* 应用入口：统一拦截未登录用户的页面访问，并将其引导至完善信息页。 */
import { clearExpiredLoginSession, getBackendToken, hasBackendConfigured, recordUserActivity, recordUserOnlineSession } from './utils/backend'
import { installGlobalPageShare } from './utils/share'

let onlineSessionStartedAt = 0
let automaticUpdateInstalled = false

const LOCAL_USER_PROFILE_STORAGE_KEY = 'mine-local-user-profile'
const HOME_PAGE_PATH = 'pages/index/index'
const LOADING_PAGE_PATH = 'pages/jiazai/jiazai'
const LOGIN_PAGE_PATH = 'pages/mine/mine'
const LOGIN_PAGE_URL = '/pages/mine/mine?guard=login'

interface RouteOption {
  url: string
}

interface NavigationApi {
  navigateTo: (option: RouteOption) => unknown
  redirectTo: (option: RouteOption) => unknown
  reLaunch: (option: RouteOption) => unknown
  switchTab: (option: RouteOption) => unknown
  navigateBack: (option?: WechatMiniprogram.NavigateBackOption) => unknown
}

const navigationApi = wx as unknown as NavigationApi
const originalNavigationApi: NavigationApi = {
  navigateTo: navigationApi.navigateTo,
  redirectTo: navigationApi.redirectTo,
  reLaunch: navigationApi.reLaunch,
  switchTab: navigationApi.switchTab,
  navigateBack: navigationApi.navigateBack,
}

let isRedirectingToLogin = false

const getPagePath = (url: string): string => String(url || '')
  .split('?', 1)[0]
  .replace(/^\/+/, '')

const isLoggedIn = (): boolean => {
  const hasLocalProfile = Boolean(wx.getStorageSync(LOCAL_USER_PROFILE_STORAGE_KEY))
  if (!hasLocalProfile) {
    return false
  }

  if (clearExpiredLoginSession()) {
    return false
  }

  return !hasBackendConfigured() || Boolean(getBackendToken())
}

const isPublicPage = (url: string): boolean => {
  const pagePath = getPagePath(url)
  return pagePath === HOME_PAGE_PATH || pagePath === LOADING_PAGE_PATH || pagePath === LOGIN_PAGE_PATH
}

const redirectToLoginPage = (): unknown => {
  if (isRedirectingToLogin) {
    return undefined
  }

  isRedirectingToLogin = true
  const result = originalNavigationApi.reLaunch({ url: LOGIN_PAGE_URL })
  setTimeout(() => {
    isRedirectingToLogin = false
  }, 500)
  return result
}

const shouldBlockNavigation = (url: string): boolean => !isLoggedIn() && !isPublicPage(url)

const installLoginNavigationGuard = (): void => {
  const routeMethods: Array<keyof Pick<NavigationApi, 'navigateTo' | 'redirectTo' | 'reLaunch' | 'switchTab'>> = [
    'navigateTo',
    'redirectTo',
    'reLaunch',
    'switchTab',
  ]

  routeMethods.forEach((method) => {
    const originalMethod = originalNavigationApi[method]
    navigationApi[method] = (option: RouteOption): unknown => {
      if (shouldBlockNavigation(option.url)) {
        return redirectToLoginPage()
      }

      return originalMethod(option)
    }
  })

  navigationApi.navigateBack = (option?: WechatMiniprogram.NavigateBackOption): unknown => {
    if (!isLoggedIn()) {
      return redirectToLoginPage()
    }

    return originalNavigationApi.navigateBack(option)
  }
}

const enforceLoginPageOnShow = (): void => {
  if (isLoggedIn()) {
    return
  }

  const currentPage = getCurrentPages().slice(-1)[0] as unknown as { route?: string } | undefined
  if (!currentPage || isPublicPage(currentPage.route || '')) {
    return
  }

  redirectToLoginPage()
}

// 小程序每次打开时检查更新；新版本就绪后自动应用，且不清理本地登录凭据和用户数据。
const installAutomaticUpdate = (): void => {
  if (automaticUpdateInstalled || typeof wx.getUpdateManager !== 'function') {
    return
  }

  automaticUpdateInstalled = true
  const updateManager = wx.getUpdateManager()
  updateManager.onUpdateReady(() => {
    updateManager.applyUpdate()
  })
}

installGlobalPageShare()
installLoginNavigationGuard()

App<IAppOption>({
  globalData: {
    userInfo: null,
  },

  onLaunch() {
    installAutomaticUpdate()
    const logs = (wx.getStorageSync('logs') || []) as number[]
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },

  onShow() {
    installAutomaticUpdate()
    onlineSessionStartedAt = Date.now()
    setTimeout(enforceLoginPageOnShow, 0)
    if (isLoggedIn()) {
      void recordUserActivity().catch(() => undefined)
    }
  },

  onHide() {
    const startedAt = onlineSessionStartedAt
    onlineSessionStartedAt = 0
    if (!startedAt) {
      return
    }

    if (isLoggedIn()) {
      void recordUserOnlineSession(startedAt).catch(() => undefined)
    }
  },
})
