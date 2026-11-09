export interface BackTapGuard {
  backTapLockedUntil?: number
}

export interface NavigationTapGuard {
  navigationTapLockedUntil?: number
}

export type RootTabKey = 'home' | 'sorts' | 'order' | 'mine'

export interface TabTransitionPage extends NavigationTapGuard {
  setData(data: Record<string, unknown>, callback?: () => void): void
  tabTransitionTimer?: number
  tabTransitionRequestId?: number
  tabNavigationRequestId?: number
}

const BACK_TAP_LOCK_MS = 500
const NAVIGATION_TAP_LOCK_MS = 800
const ROOT_TAB_LOADING_STORAGE_KEY = 'app-root-tab-loading'
const ROOT_TAB_LOADING_MAX_AGE_MS = 2000

interface RootTabLoadingState {
  targetTab: RootTabKey
  createdAt: number
}
export const clearTabTransitionTimer = (page: TabTransitionPage): void => {
  if (page.tabTransitionTimer) {
    clearTimeout(page.tabTransitionTimer)
    page.tabTransitionTimer = 0
  }
  page.tabNavigationRequestId = 0
  page.tabTransitionRequestId = Number(page.tabTransitionRequestId || 0) + 1
}

export const consumeTabEnterTransition = (
  page: TabTransitionPage,
  currentTab: RootTabKey,
): boolean => {
  const loadingState = wx.getStorageSync(ROOT_TAB_LOADING_STORAGE_KEY) as Partial<RootTabLoadingState> | undefined
  const createdAt = Number(loadingState?.createdAt || 0)
  const isValidState = loadingState?.targetTab === currentTab
    && createdAt > 0
    && Date.now() - createdAt <= ROOT_TAB_LOADING_MAX_AGE_MS

  if (isValidState) {
    wx.removeStorageSync(ROOT_TAB_LOADING_STORAGE_KEY)
  }

  page.setData({ pageTransitionClass: '' })
  return isValidState
}

export const playTabEnterTransition = (page: TabTransitionPage): void => {
  clearTabTransitionTimer(page)
  page.setData({ pageTransitionClass: '' })
}

export const startSlidingTabSwitch = (
  page: TabTransitionPage,
  currentTab: RootTabKey,
  targetTab: RootTabKey,
  path: string,
): void => {
  clearTabTransitionTimer(page)
  void currentTab
  wx.setStorageSync(ROOT_TAB_LOADING_STORAGE_KEY, {
    targetTab,
    createdAt: Date.now(),
  } as RootTabLoadingState)
  page.setData({ pageTransitionClass: '' })
  wx.reLaunch({
    url: path,
    fail: () => wx.removeStorageSync(ROOT_TAB_LOADING_STORAGE_KEY),
  })
}

export const shouldIgnoreRapidBackTap = (
  page: BackTapGuard,
  lockMs: number = BACK_TAP_LOCK_MS,
): boolean => {
  const now = Date.now()

  if ((page.backTapLockedUntil || 0) > now) {
    return true
  }

  page.backTapLockedUntil = now + lockMs
  return false
}

export const shouldIgnoreRapidNavigationTap = (
  page: NavigationTapGuard,
  lockMs: number = NAVIGATION_TAP_LOCK_MS,
): boolean => {
  const now = Date.now()

  if ((page.navigationTapLockedUntil || 0) > now) {
    return true
  }

  page.navigationTapLockedUntil = now + lockMs
  return false
}
