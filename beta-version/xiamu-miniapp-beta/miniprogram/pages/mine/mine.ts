// 用途：管理“我的”页面登录、微信手机号授权及头像昵称资料完善流程。
import { getStatusBarHeight } from '../../utils/system'
import { getAttitudeCounts, getAttitudeMetaByLabel } from '../../utils/attitude'
import { fetchMyTutorialInteractions, ensureBackendSession } from '../../utils/backend'
import { ensureProductCatalogLoaded } from '../../data/products'
import {
  consumeTabEnterTransition,
  clearTabTransitionTimer,
  playTabEnterTransition,
  RootTabKey,
  shouldIgnoreRapidNavigationTap,
  startSlidingTabSwitch,
  NavigationTapGuard,
} from '../../utils/navigation'
import {
  clearBackendSession,
  bindWechatPhone,
  getBackendDisabledReason,
  fetchUserProfile,
  fetchPublicNotices,
  getBackendToken,
  hasBackendConfigured,
  loginWithWechat,
  logoutFromBackend,
  updateUserProfile,
  uploadUserAvatar,
  BackendUserProfile,
} from '../../utils/backend'

const STORAGE_KEY = 'mine-local-user-profile'
const AVATAR_STORAGE_KEY = 'mine-local-avatar-url'
const DEFAULT_AVATAR_URL = '/pages/images/index-images/兜底头像.jpg'
const LEGACY_DEFAULT_AVATAR_URL = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
const FEATURE_PLACEHOLDER_NAMES = ['联系客服', '常见问题', '投诉建议', '寄快递']

interface UserProfile {
  uid: string
  memberNo: string
  nickname: string
  displayName: string
  avatarUrl: string
  loginCode: string
  profileHint: string
  loginSource: 'local' | 'server'
  lastLoginAt: number
  phone: string
  username: string
  alipayBound: boolean
  payoutAccount: string
  realName: string
}

interface DraftProfile {
  avatarUrl: string
  nickname: string
}

interface SimpleMenuItem {
  id: number
  name: string
  icon: string
}

interface OrderMenuItem extends SimpleMenuItem {
  iconUrl: string
  mode: 'recycle' | 'recycle_reviewing' | 'recycle_rejected' | 'recycle_approved' | 'settlement' | 'sold'
}

interface FeatureMenuItem extends SimpleMenuItem {
  iconUrl: string
  theme: string
  action?: 'logout'
}

interface NoticeItem {
  id: number
  title: string
}

interface TabItem {
  key: string
  text: string
  path: string
  icon: string
}

interface BuildLocalProfileInput {
  nickname: string
  avatarUrl: string
  loginCode: string
  cachedMemberNo?: string
}

interface MineData {
  currentTab: string
  pageTransitionClass: string
  isTabLoading: boolean
  statusBarHeight: number
  isLoggedIn: boolean
  loginGuardDesc: string
  loginNotice: string
  loginButtonText: string
  showWechatProfileAuth: boolean
  wechatProfileSaving: boolean
  draftProfile: DraftProfile
  userProfile: UserProfile
  orderMenus: OrderMenuItem[]
  collectionStats: Array<{ id: number; count: string; label: string }>
  collectionStatsTop: Array<{ id: number; count: string; label: string }>
  collectionStatsBottom: Array<{ id: number; count: string; label: string }>
  featureMenus: FeatureMenuItem[]
  notices: NoticeItem[]
  tabs: TabItem[]
}

type GuardOptions = Record<string, string | undefined>
type WechatPhoneEvent = WechatMiniprogram.CustomEvent<{ code?: string }>
type WechatAvatarEvent = WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>
type WechatNicknameEvent = WechatMiniprogram.CustomEvent<{ value?: string }>
type OrderTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { mode?: OrderMenuItem['mode']; name?: string }>
type LabelTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { label?: string }>
type NoticeTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { id?: number; title?: string }>
type FeatureTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { name?: string; action?: string }>
type TabTapEvent = WechatMiniprogram.TouchEvent<{}, {}, { key?: string; path?: string }>

const createDefaultProfile = (): UserProfile => ({
  uid: '',
  memberNo: '',
  nickname: '',
  displayName: '',
  avatarUrl: '',
  loginCode: '',
  profileHint: '点击完善资料',
  loginSource: 'local',
  lastLoginAt: 0,
  phone: '',
  username: '',
  alipayBound: false,
  payoutAccount: '',
  realName: '',
})

const buildDisplayName = (profile: Partial<UserProfile>): string => {
  return profile.nickname || profile.phone || profile.memberNo || '微信用户'
}

const normalizePhone = (profile: Partial<UserProfile>): string => {
  if (profile.phone && profile.phone !== profile.memberNo) {
    return profile.phone
  }

  return ''
}

const isTemporaryAvatarUrl = (avatarUrl?: string): boolean => {
  const normalizedAvatarUrl = String(avatarUrl || '').trim()
  return /^wxfile:\/\//i.test(normalizedAvatarUrl)
    || /^https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?\//i.test(normalizedAvatarUrl)
    || /^https?:\/\/tmp\//i.test(normalizedAvatarUrl)
}

const isDefaultAvatarUrl = (avatarUrl?: string): boolean => {
  return avatarUrl === DEFAULT_AVATAR_URL || avatarUrl === LEGACY_DEFAULT_AVATAR_URL
}

const getCachedAvatarUrl = (): string => {
  const cachedAvatarUrl = String(wx.getStorageSync(AVATAR_STORAGE_KEY) || '').trim()
  if (!cachedAvatarUrl || isDefaultAvatarUrl(cachedAvatarUrl) || isTemporaryAvatarUrl(cachedAvatarUrl)) {
    return ''
  }

  return cachedAvatarUrl
}

const shouldPersistAvatarLocally = (avatarUrl?: string): boolean => {
  return Boolean(avatarUrl && avatarUrl.trim() && !isDefaultAvatarUrl(avatarUrl) && !isTemporaryAvatarUrl(avatarUrl))
}

const persistStableAvatarUrl = (avatarUrl?: string): void => {
  if (!shouldPersistAvatarLocally(avatarUrl)) {
    return
  }

  wx.setStorageSync(AVATAR_STORAGE_KEY, String(avatarUrl || '').trim())
}

const getDisplayAvatarUrl = (avatarUrl?: string): string => {
  const normalizedAvatarUrl = String(avatarUrl || '').trim()
  if (isDefaultAvatarUrl(normalizedAvatarUrl)) {
    return DEFAULT_AVATAR_URL
  }

  if (normalizedAvatarUrl && !isTemporaryAvatarUrl(normalizedAvatarUrl)) {
    return normalizedAvatarUrl
  }

  return getCachedAvatarUrl() || normalizedAvatarUrl || DEFAULT_AVATAR_URL
}

const getLoginAvatarUrl = (): string => {
  const cachedAvatarUrl = getCachedAvatarUrl()
  return cachedAvatarUrl || ''
}

const resolveMergedAvatarUrl = (avatarUrl?: string, fallbackAvatarUrl?: string): string => {
  const normalizedAvatarUrl = String(avatarUrl || '').trim()
  if (normalizedAvatarUrl && !isTemporaryAvatarUrl(normalizedAvatarUrl)) {
    return getDisplayAvatarUrl(normalizedAvatarUrl)
  }

  const normalizedFallbackAvatarUrl = String(fallbackAvatarUrl || '').trim()
  if (normalizedFallbackAvatarUrl && !isTemporaryAvatarUrl(normalizedFallbackAvatarUrl)) {
    return getDisplayAvatarUrl(normalizedFallbackAvatarUrl)
  }

  return getDisplayAvatarUrl(normalizedAvatarUrl || normalizedFallbackAvatarUrl)
}

const toUserProfile = (profile: Partial<UserProfile>): UserProfile => ({
  ...createDefaultProfile(),
  ...profile,
  avatarUrl: getDisplayAvatarUrl(profile.avatarUrl),
  displayName: buildDisplayName(profile),
  profileHint: '点击完善资料',
  phone: normalizePhone(profile),
  username: profile.username || normalizePhone(profile),
})

const mergeBackendProfile = (
  backendProfile: BackendUserProfile,
  fallbackProfile: Partial<UserProfile>,
  loginCode = '',
): UserProfile => {
  return toUserProfile({
    ...fallbackProfile,
    uid: backendProfile.uid || fallbackProfile.uid || '',
    memberNo: backendProfile.memberNo || fallbackProfile.memberNo || '',
    nickname: backendProfile.nickname || fallbackProfile.nickname || '',
    avatarUrl: resolveMergedAvatarUrl(backendProfile.avatarUrl, fallbackProfile.avatarUrl),
    loginCode,
    loginSource: 'server',
    lastLoginAt: Number(backendProfile.lastLoginAt || Date.now()),
    phone: backendProfile.phone || fallbackProfile.phone || '',
    username: backendProfile.username || fallbackProfile.username || '',
    payoutAccount: backendProfile.payoutAccount || fallbackProfile.payoutAccount || '',
    realName: backendProfile.realName || fallbackProfile.realName || '',
  })
}

const clearLocalProfile = (): void => {
  wx.removeStorageSync(STORAGE_KEY)
}

interface MinePage extends NavigationTapGuard {
  tabTransitionTimer?: number
  wechatProfilePrompted?: boolean
  onLoad(options: GuardOptions): void
  onReady(): void
  onShow(): void
  onUnload(): void
  applyGuardScene(options: GuardOptions): void
  restoreLocalProfile(): void
  syncProfileFromServer(): Promise<void>
  repairTemporaryAvatar(): Promise<void>
  markLoggedOut(): void
  syncCollectionStats(): Promise<void>
  syncNotices(): Promise<void>
  onWechatLogin(event: WechatPhoneEvent): void
  openWechatProfileAuthorization(profile: Partial<UserProfile>): void
  onWechatAvatarChoose(event: WechatAvatarEvent): void
  onWechatNicknameInput(event: WechatNicknameEvent): string
  onWechatProfileAuthCancel(): void
  onWechatProfileAuthConfirm(): void
  preventWechatProfileMaskMove(): void
  promptIncompleteWechatProfile(): void
  buildLocalProfile(input: BuildLocalProfileInput): UserProfile
  syncWechatLoginToServer(localProfile: UserProfile): Promise<BackendUserProfile | null>
  persistProfile(profile: Partial<UserProfile>): void
  onAvatarTap(): void
  onEditProfile(): void
  onOrderCenterTap(): void
  onCollectionCenterTap(): void
  onOrderTap(event: OrderTapEvent): void
  onStatTap(event: LabelTapEvent): void
  onFeatureTap(event: FeatureTapEvent): void
  onNoticeTap(event: NoticeTapEvent): void
  onLogout(): void
  onTabTap(event: TabTapEvent): void
}

Page<MineData, MinePage>({
  wechatProfilePrompted: false,
  data: {
    currentTab: 'mine',
    pageTransitionClass: '',
    isTabLoading: false,
    statusBarHeight: 20,
    isLoggedIn: false,
    loginGuardDesc: '授权微信手机号后即可登录',
    loginNotice: '手机号将作为用户名，登录后可选择微信头像并填写微信昵称。',
    loginButtonText: '微信授权登录',
    showWechatProfileAuth: false,
    wechatProfileSaving: false,
    draftProfile: {
      avatarUrl: DEFAULT_AVATAR_URL,
      nickname: '',
    },
    userProfile: createDefaultProfile(),
    orderMenus: [
      { id: 1, name: '待卖出', icon: '', iconUrl: '/pages/images/order-images/order-status/待卖出.png', mode: 'recycle' },
      { id: 2, name: '待检测', icon: '', iconUrl: '/pages/images/order-images/order-status/审核中.png', mode: 'recycle_reviewing' },
      { id: 3, name: '有异常', icon: '', iconUrl: '/pages/images/order-images/order-status/有异常.png', mode: 'recycle_rejected' },
      { id: 4, name: '已通过', icon: '', iconUrl: '/pages/images/order-images/order-status/已通过.png', mode: 'recycle_approved' },
      { id: 5, name: '待收款', icon: '', iconUrl: '/pages/images/order-images/order-status/待收款.png', mode: 'settlement' },
      { id: 6, name: '已卖出', icon: '', iconUrl: '/pages/images/order-images/order-status/已卖出.png', mode: 'sold' },
    ],
    collectionStats: [
      { id: 1, count: '0', label: '收藏' },
      { id: 2, count: '0', label: '想玩' },
      { id: 3, count: '0', label: '玩过' },
      { id: 4, count: '0', label: '已拥有' },
    ],
    collectionStatsTop: [],
    collectionStatsBottom: [],
    featureMenus: [
      { id: 1, name: '联系客服', icon: '', iconUrl: '/pages/images/mine-images/more/联系客服.png', theme: 'violet' },
      { id: 2, name: '常见问题', icon: '', iconUrl: '/pages/images/mine-images/more/常见问题.png', theme: 'amber' },
      { id: 3, name: '投诉建议', icon: '', iconUrl: '/pages/images/mine-images/more/投诉建议.png', theme: 'red' },
      { id: 4, name: '寄快递', icon: '', iconUrl: '/pages/images/mine-images/more/寄快递.png', theme: 'pink' },
      { id: 5, name: '退出登录', icon: '', iconUrl: '/pages/images/mine-images/more/退出登录.png', theme: 'violet', action: 'logout' },
    ],
    notices: [],
    tabs: [
      { key: 'home', text: '首页', path: '/pages/index/index', icon: 'H' },
      { key: 'sorts', text: '分类', path: '/pages/sorts/sorts', icon: 'S' },
      { key: 'order', text: '订单', path: '/pages/order/order', icon: 'O' },
      { key: 'mine', text: '我的', path: '/pages/mine/mine', icon: 'M' },
    ],
  },

  onLoad(options: GuardOptions) {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })
    this.applyGuardScene(options)
    this.restoreLocalProfile()
    this.syncCollectionStats().catch(() => {})
  },

  onReady() {
    playTabEnterTransition(this)
  },

  onUnload() {
    clearTabTransitionTimer(this)
  },

  onShow() {
    const isTabSwitch = consumeTabEnterTransition(this, 'mine')
    playTabEnterTransition(this)
    this.restoreLocalProfile()

    if (isTabSwitch) {
      this.setData({ isTabLoading: true })
    }

    Promise.all([
      this.syncCollectionStats().catch(() => undefined),
      this.repairTemporaryAvatar().catch(() => undefined),
      this.syncProfileFromServer().catch(() => undefined),
      this.syncNotices().catch(() => undefined),
    ]).then(() => {
      if (isTabSwitch) {
        this.setData({ isTabLoading: false })
      }
      this.promptIncompleteWechatProfile()
    })
  },

  async syncNotices() {
    const notices = await fetchPublicNotices()
    this.setData({
      notices: notices.map((notice) => ({
        id: Number(notice.id || 0),
        title: String(notice.title || '').trim(),
      })).filter((notice) => notice.id > 0 && notice.title),
    })
  },

  applyGuardScene(options: GuardOptions) {
    if (!options.guard) {
      return
    }

    const guardMap: Record<string, string> = {
      product: '当前页面需要登录后才能继续使用',
      detail: '查看商品详情前请先登录',
      order: '使用下单功能前请先登录',
    }

    this.setData({
      loginGuardDesc: guardMap[options.guard] || '当前页面需要登录后才能继续使用',
    })
  },

  restoreLocalProfile() {
    const localProfile = wx.getStorageSync(STORAGE_KEY) as Partial<UserProfile> | undefined
    const token = hasBackendConfigured() ? getBackendToken() : ''

    if (hasBackendConfigured() && !token) {
      clearLocalProfile()
      this.setData({
        isLoggedIn: false,
        userProfile: createDefaultProfile(),
        'draftProfile.avatarUrl': DEFAULT_AVATAR_URL,
        'draftProfile.nickname': '',
      })
      return
    }

    if (!localProfile) {
      this.setData({
        isLoggedIn: false,
        userProfile: createDefaultProfile(),
        'draftProfile.avatarUrl': DEFAULT_AVATAR_URL,
        'draftProfile.nickname': '',
      })
      return
    }

    this.setData({
      isLoggedIn: true,
      userProfile: toUserProfile(localProfile),
      'draftProfile.avatarUrl': localProfile.avatarUrl || DEFAULT_AVATAR_URL,
      'draftProfile.nickname': localProfile.nickname || '',
    })
  },

  async syncProfileFromServer() {
    if (!hasBackendConfigured() || !getBackendToken()) {
      return
    }

    try {
      const serverProfile = await fetchUserProfile()
      const nextProfile = mergeBackendProfile(serverProfile, this.data.userProfile)
      this.persistProfile(nextProfile)
    } catch (error) {
      const requestError = error as Error & { code?: string }
      if (requestError.code === 'UNAUTHORIZED') {
        this.markLoggedOut()
      }
    }
  },

  async repairTemporaryAvatar() {
    if (!hasBackendConfigured() || !getBackendToken()) {
      return
    }

    const avatarUrl = String(this.data.userProfile.avatarUrl || '').trim()
    if (!avatarUrl || !isTemporaryAvatarUrl(avatarUrl)) {
      return
    }

    try {
      const uploadedAvatarUrl = await uploadUserAvatar(avatarUrl)
      const serverProfile = await updateUserProfile({
        avatarUrl: uploadedAvatarUrl,
      })
      const repairedProfile = mergeBackendProfile(serverProfile, {
        ...this.data.userProfile,
        avatarUrl: uploadedAvatarUrl,
      }, this.data.userProfile.loginCode)
      this.persistProfile(repairedProfile)
    } catch (_error) {
      return
    }
  },

  markLoggedOut() {
    clearBackendSession()
    clearLocalProfile()
    this.setData({
      isLoggedIn: false,
      userProfile: createDefaultProfile(),
      'draftProfile.avatarUrl': DEFAULT_AVATAR_URL,
      'draftProfile.nickname': '',
    })
  },

  async syncCollectionStats() {
    try {
      await ensureProductCatalogLoaded(true)
    } catch (_error) {
      // 使用当前已加载的商品库继续统计，避免网络异常影响页面展示
    }

    const counts = getAttitudeCounts()
    let tutorialLikeCount = 0
    let tutorialFavoriteCount = 0
    try {
      await ensureBackendSession()
      const interactionResults = await Promise.all([
        fetchMyTutorialInteractions('like'),
        fetchMyTutorialInteractions('favorite'),
      ])
      tutorialLikeCount = interactionResults[0].length
      tutorialFavoriteCount = interactionResults[1].length
    } catch (_error) {
      tutorialLikeCount = 0
    }

    this.setData({
      collectionStatsTop: [
        { id: 1, count: String(counts.wishlist), label: '想玩' },
        { id: 2, count: String(counts.played), label: '玩过' },
        { id: 3, count: String(counts.owned), label: '已拥有' },
      ],
      collectionStatsBottom: [
        { id: 4, count: String(tutorialLikeCount), label: '点赞' },
        { id: 5, count: String(tutorialFavoriteCount), label: '收藏' },
      ],
    })
  },

  onWechatLogin(event) {
    const phoneCode = String(event.detail?.code || '').trim()
    if (!phoneCode) {
      wx.showToast({
        title: '需要授权微信手机号才能完善信息',
        icon: 'none',
      })
      return
    }

    wx.showLoading({
      title: '登录中',
    })

    wx.login({
      success: (res) => {
        const loginCode = res.code || ''
        const cachedProfile = (wx.getStorageSync(STORAGE_KEY) || {}) as Partial<UserProfile>
        const localProfile = this.buildLocalProfile({
          nickname: '',
          avatarUrl: getLoginAvatarUrl() || DEFAULT_AVATAR_URL,
          loginCode,
          cachedMemberNo: cachedProfile.memberNo,
        })

        this.syncWechatLoginToServer(localProfile)
          .then(async (serverProfile) => {
            if (!serverProfile) {
              throw new Error(getBackendDisabledReason() || '服务器登录失败')
            }

            const boundProfile = await bindWechatPhone(phoneCode)
            const finalProfile = mergeBackendProfile(boundProfile, localProfile, localProfile.loginCode)
            this.persistProfile(finalProfile)
            wx.hideLoading()

            const needsWechatProfile = !String(finalProfile.nickname || '').trim()
              || isDefaultAvatarUrl(finalProfile.avatarUrl)
              || !String(finalProfile.avatarUrl || '').trim()
            if (needsWechatProfile) {
              this.wechatProfilePrompted = true
              this.openWechatProfileAuthorization(finalProfile)
              wx.showToast({
                title: '手机号已授权，请完善头像昵称',
                icon: 'none',
              })
              return
            }

            wx.showToast({
              title: serverProfile.isNewUser ? '注册成功' : '登录成功',
              icon: 'success',
            })
          })
          .catch((error) => {
            wx.hideLoading()
            wx.showToast({
              title: error instanceof Error ? error.message : '服务器登录失败',
              icon: 'none',
            })
          })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '微信登录失败，请稍后重试',
          icon: 'none',
        })
      },
    })
  },

  openWechatProfileAuthorization(profile) {
    const avatarUrl = String(profile.avatarUrl || '').trim()
    this.setData({
      showWechatProfileAuth: true,
      wechatProfileSaving: false,
      'draftProfile.avatarUrl': isDefaultAvatarUrl(avatarUrl) ? DEFAULT_AVATAR_URL : (avatarUrl || DEFAULT_AVATAR_URL),
      'draftProfile.nickname': String(profile.nickname || '').trim(),
    })
  },

  onWechatAvatarChoose(event) {
    const avatarUrl = String(event.detail?.avatarUrl || '').trim()
    if (!avatarUrl) {
      return
    }

    this.setData({
      'draftProfile.avatarUrl': avatarUrl,
    })
  },

  onWechatNicknameInput(event) {
    const nickname = String(event.detail?.value || '')
    this.setData({
      'draftProfile.nickname': nickname,
    })
    return nickname
  },

  onWechatProfileAuthCancel() {
    if (this.data.wechatProfileSaving) {
      return
    }

    this.setData({
      showWechatProfileAuth: false,
    })
    wx.showToast({
      title: '可在个人信息中继续完善',
      icon: 'none',
    })
  },

  preventWechatProfileMaskMove() {},

  promptIncompleteWechatProfile() {
    if (this.wechatProfilePrompted || this.data.showWechatProfileAuth || !this.data.isLoggedIn) {
      return
    }

    const profile = this.data.userProfile
    const hasAuthorizedPhone = Boolean(String(profile.phone || profile.username || '').trim())
    const needsWechatProfile = !String(profile.nickname || '').trim()
      || isDefaultAvatarUrl(profile.avatarUrl)
      || !String(profile.avatarUrl || '').trim()
    if (!hasAuthorizedPhone || !needsWechatProfile) {
      return
    }

    this.wechatProfilePrompted = true
    this.openWechatProfileAuthorization(profile)
  },

  onWechatProfileAuthConfirm() {
    if (this.data.wechatProfileSaving) {
      return
    }

    const nickname = String(this.data.draftProfile.nickname || '').trim()
    const selectedAvatarUrl = String(this.data.draftProfile.avatarUrl || '').trim()
    if (!selectedAvatarUrl || isDefaultAvatarUrl(selectedAvatarUrl)) {
      wx.showToast({ title: '请先选择微信头像', icon: 'none' })
      return
    }
    if (!nickname) {
      wx.showToast({ title: '请填写微信昵称', icon: 'none' })
      return
    }

    this.setData({ wechatProfileSaving: true })
    wx.showLoading({ title: '正在保存', mask: true })

    void (async () => {
      try {
        const avatarUrl = isTemporaryAvatarUrl(selectedAvatarUrl)
          ? await uploadUserAvatar(selectedAvatarUrl)
          : selectedAvatarUrl
        const serverProfile = await updateUserProfile({ nickname, avatarUrl })
        const finalProfile = mergeBackendProfile(serverProfile, {
          ...this.data.userProfile,
          nickname,
          avatarUrl,
          username: this.data.userProfile.username || this.data.userProfile.phone,
        }, this.data.userProfile.loginCode)
        this.persistProfile(finalProfile)
        this.setData({
          showWechatProfileAuth: false,
          wechatProfileSaving: false,
        })
        wx.hideLoading()
        wx.showToast({ title: '微信资料已同步', icon: 'success' })
      } catch (error) {
        wx.hideLoading()
        this.setData({ wechatProfileSaving: false })
        wx.showToast({
          title: error instanceof Error ? error.message : '微信资料保存失败',
          icon: 'none',
        })
      }
    })()
  },

  buildLocalProfile({ nickname, avatarUrl, loginCode, cachedMemberNo }) {
    const memberNo = cachedMemberNo || this.data.userProfile.memberNo || ''

    return toUserProfile({
      memberNo,
      nickname,
      avatarUrl,
      loginCode,
      loginSource: 'local',
      lastLoginAt: Date.now(),
    })
  },

  syncWechatLoginToServer(localProfile) {
    if (!hasBackendConfigured()) {
      return Promise.reject(new Error(getBackendDisabledReason() || '服务器未启用'))
    }

    return loginWithWechat({
      code: localProfile.loginCode,
      nickname: localProfile.nickname,
      avatarUrl: localProfile.avatarUrl,
    })
  },

  persistProfile(profile) {
    const normalizedProfile = toUserProfile(profile)

    wx.setStorageSync(STORAGE_KEY, normalizedProfile)
    persistStableAvatarUrl(normalizedProfile.avatarUrl)
    this.setData({
      isLoggedIn: true,
      userProfile: normalizedProfile,
      'draftProfile.avatarUrl': normalizedProfile.avatarUrl || DEFAULT_AVATAR_URL,
      'draftProfile.nickname': normalizedProfile.nickname || '',
    })
  },

  onAvatarTap() {
    if (!this.data.isLoggedIn || shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/profile/profile?from=mine',
    })
  },

  onEditProfile() {
    if (!this.data.isLoggedIn) {
      return
    }

    wx.navigateTo({
      url: '/pages/user-settings/user-settings',
    })
  },

  onOrderCenterTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.redirectTo({
      url: '/pages/recycle-orders/recycle-orders?source=mine',
    })
  },

  onCollectionCenterTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.redirectTo({
      url: '/pages/attitude-list/attitude-list?key=wishlist',
    })
  },

  onOrderTap(event) {
    const { mode, name = '' } = event.currentTarget.dataset

    if (!mode) {
      wx.showToast({
        title: `${name}功能暂未开放`,
        icon: 'none',
      })
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.redirectTo({
      url: `/pages/recycle-orders/recycle-orders?mode=${mode}&source=mine`,
    })
  },

  onStatTap(event) {
    const { label = '' } = event.currentTarget.dataset
    const matchedMeta = getAttitudeMetaByLabel(label)

    if (!matchedMeta) {
      return
    }

    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.redirectTo({
      url: `/pages/attitude-list/attitude-list?key=${encodeURIComponent(matchedMeta.key)}`,
    })
  },

  onFeatureTap(event) {
    const { name = '', action } = event.currentTarget.dataset

    if (action === 'logout') {
      this.onLogout()
      return
    }

    if (name === '寄快递') {
      if (shouldIgnoreRapidNavigationTap(this)) {
        return
      }

      wx.navigateTo({
        url: '/pages/pickup-service/pickup-service?tab=mail',
      })
      return
    }

    if (FEATURE_PLACEHOLDER_NAMES.includes(name)) {
      if (shouldIgnoreRapidNavigationTap(this)) {
        return
      }

      wx.navigateTo({
        url: `/pages/feature-placeholder/feature-placeholder?title=${encodeURIComponent(name)}`,
      })
      return
    }

    wx.showToast({
      title: `${name}功能暂未开放`,
      icon: 'none',
    })
  },

  onNoticeTap(event) {
    const noticeId = Number(event.currentTarget.dataset.id || 0)
    const { title = '' } = event.currentTarget.dataset

    if (!noticeId || shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: `/pages/feature-placeholder/feature-placeholder?title=${encodeURIComponent(title)}&noticeId=${noticeId}`,
    })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后将清除当前设备上的登录信息，是否继续？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        logoutFromBackend()
          .catch(() => {})
          .then(() => {
            this.markLoggedOut()
            wx.showToast({
              title: '已退出',
              icon: 'success',
            })
          })
      },
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
