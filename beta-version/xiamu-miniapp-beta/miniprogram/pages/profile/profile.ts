// 用途：管理个人资料页的微信头像选择、昵称填写及用户名展示。
import { shouldIgnoreRapidBackTap, shouldIgnoreRapidNavigationTap, BackTapGuard, NavigationTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'
import {
  fetchUserProfile,
  hasBackendConfigured,
  loginWithWechat,
  getBackendToken,
  uploadUserAvatar,
  updateUserProfile,
  BackendUserProfile,
} from '../../utils/backend'

const STORAGE_KEY = 'mine-local-user-profile'
const AVATAR_STORAGE_KEY = 'mine-local-avatar-url'
const DEFAULT_AVATAR_URL = '/pages/images/index-images/兜底头像.jpg'
const LEGACY_DEFAULT_AVATAR_URL = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
const NICKNAME_LENGTH_LIMIT = 20
const NICKNAME_LENGTH_LIMIT_MESSAGE = '昵称字数上限为10个汉字或20个英文字母'

const getNicknameWeightedLength = (nickname: string): number => Array.from(nickname).reduce(
  (length, character) => length + (/^[\u0000-\u007f]$/.test(character) ? 1 : 2),
  0,
)

const isNicknameOverLimit = (nickname: string): boolean => getNicknameWeightedLength(nickname) > NICKNAME_LENGTH_LIMIT

const showNicknameLengthLimitModal = (): void => {
  wx.showModal({
    title: '提示',
    content: NICKNAME_LENGTH_LIMIT_MESSAGE,
    showCancel: false,
  })
}

interface UserProfile {
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

interface ProfileData {
  statusBarHeight: number
  profile: UserProfile
  returnUrl: string
  avatarChoosing: boolean
}

type AvatarChooseEvent = WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>
type NicknameInputEvent = WechatMiniprogram.CustomEvent<{ value?: string }>
type NicknameBlurEvent = WechatMiniprogram.InputBlur<{ value?: string }>

const createDefaultProfile = (): UserProfile => ({
  memberNo: '',
  nickname: '',
  displayName: '',
  avatarUrl: DEFAULT_AVATAR_URL,
  loginCode: '',
  profileHint: '鐐瑰嚮瀹屽杽璧勬枡',
  loginSource: 'local',
  lastLoginAt: 0,
  phone: '',
  username: '',
  alipayBound: false,
  payoutAccount: '',
  realName: '',
})

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

const persistStableAvatarUrl = (avatarUrl?: string): void => {
  const normalizedAvatarUrl = String(avatarUrl || '').trim()
  if (!normalizedAvatarUrl || isDefaultAvatarUrl(normalizedAvatarUrl) || isTemporaryAvatarUrl(normalizedAvatarUrl)) {
    return
  }

  wx.setStorageSync(AVATAR_STORAGE_KEY, normalizedAvatarUrl)
}

const resolveProfileAvatarUrl = (avatarUrl?: string, fallbackAvatarUrl?: string): string => {
  const normalizedAvatarUrl = String(avatarUrl || '').trim()
  if (isDefaultAvatarUrl(normalizedAvatarUrl)) {
    return DEFAULT_AVATAR_URL
  }

  if (normalizedAvatarUrl && !isTemporaryAvatarUrl(normalizedAvatarUrl)) {
    return normalizedAvatarUrl
  }

  const normalizedFallbackAvatarUrl = String(fallbackAvatarUrl || '').trim()
  if (normalizedFallbackAvatarUrl && !isTemporaryAvatarUrl(normalizedFallbackAvatarUrl)) {
    return normalizedFallbackAvatarUrl
  }

  return getCachedAvatarUrl() || normalizedAvatarUrl || normalizedFallbackAvatarUrl || DEFAULT_AVATAR_URL
}

const buildDisplayName = (profile: Partial<UserProfile>): string => {
  return profile.nickname || profile.phone || profile.memberNo || '寰俊鐢ㄦ埛'
}

const normalizePhone = (profile: Partial<UserProfile>): string => {
  if (profile.phone && profile.phone !== profile.memberNo) {
    return profile.phone
  }

  return ''
}

const toUserProfile = (profile: Partial<UserProfile>): UserProfile => ({
  ...createDefaultProfile(),
  ...profile,
  avatarUrl: resolveProfileAvatarUrl(profile.avatarUrl),
  displayName: buildDisplayName(profile),
  profileHint: '鐐瑰嚮瀹屽杽璧勬枡',
  phone: normalizePhone(profile),
  username: profile.username || normalizePhone(profile),
})

const mergeBackendProfile = (backendProfile: BackendUserProfile, fallbackProfile: Partial<UserProfile>): UserProfile => {
  return toUserProfile({
    ...fallbackProfile,
    memberNo: backendProfile.memberNo || fallbackProfile.memberNo || '',
    nickname: backendProfile.nickname || fallbackProfile.nickname || '',
    avatarUrl: resolveProfileAvatarUrl(backendProfile.avatarUrl, fallbackProfile.avatarUrl),
    loginSource: 'server',
    lastLoginAt: Date.now(),
    phone: backendProfile.phone || fallbackProfile.phone || '',
    username: backendProfile.username || fallbackProfile.username || '',
    payoutAccount: backendProfile.payoutAccount || fallbackProfile.payoutAccount || '',
    realName: backendProfile.realName || fallbackProfile.realName || '',
  })
}

const isAuthRelatedUploadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '')
  return /missing backend token|unauthorized|401|token/i.test(message)
}

const loginWithWechatCode = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code)
          return
        }

        reject(new Error('寰俊鐧诲綍澶辫触锛岃閲嶈瘯'))
      },
      fail: () => {
        reject(new Error('寰俊鐧诲綍澶辫触锛岃閲嶈瘯'))
      },
    })
  })
}

interface ProfilePage extends BackTapGuard, NavigationTapGuard {
  avatarChooseTimer?: number
  avatarChoosingLock?: boolean
  onLoad(options: { from?: string }): void
  onUnload(): void
  navigateBack(): void
  onShow(): void
  restoreProfile(): void
  syncProfileFromServer(): Promise<void>
  persistProfile(nextProfile: Partial<UserProfile>): void
  syncProfileToServer(nextProfile: Partial<UserProfile>): Promise<void>
  onAvatarPickerTap(): void
  onChooseAvatar(event: AvatarChooseEvent): void
  resetAvatarChoosing(): void
  onNicknameInput(event: NicknameInputEvent): string | void
  onNicknameBlur(event: NicknameBlurEvent): void
  onAddressTap(): void
}

Page<ProfileData, ProfilePage>({
  avatarChoosingLock: false,
  data: {
    statusBarHeight: 20,
    profile: createDefaultProfile(),
    returnUrl: '/pages/mine/mine',
    avatarChoosing: false,
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      returnUrl: options.from === 'settings'
        ? '/pages/user-settings/user-settings'
        : '/pages/mine/mine',
    })
    this.restoreProfile()
  },

  onUnload() {
    if (this.avatarChooseTimer) {
      clearTimeout(this.avatarChooseTimer)
      this.avatarChooseTimer = 0
    }
  },

  navigateBack() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    const pages = getCurrentPages()
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : null
    const expectedPreviousRoute = this.data.returnUrl.replace(/^\//, '').split('?')[0]

    if (previousPage && previousPage.route === expectedPreviousRoute) {
      wx.navigateBack()
      return
    }

    wx.redirectTo({
      url: this.data.returnUrl,
    })
  },

  onShow() {
    this.restoreProfile()
    this.syncProfileFromServer().catch(() => {})
  },

  restoreProfile() {
    const localProfile = (wx.getStorageSync(STORAGE_KEY) || {}) as Partial<UserProfile>
    const normalizedProfile = toUserProfile(localProfile)

    this.setData({
      profile: normalizedProfile,
    })
  },

  async syncProfileFromServer() {
    if (!hasBackendConfigured() || !getBackendToken()) {
      return
    }

    try {
      const serverProfile = await fetchUserProfile()
      const nextProfile = mergeBackendProfile(serverProfile, this.data.profile)
      wx.setStorageSync(STORAGE_KEY, nextProfile)
      persistStableAvatarUrl(nextProfile.avatarUrl)
      this.restoreProfile()
    } catch (_error) {
      return
    }
  },

  persistProfile(nextProfile) {
    const mergedProfile = toUserProfile({
      ...this.data.profile,
      ...nextProfile,
    })

    wx.setStorageSync(STORAGE_KEY, mergedProfile)
    persistStableAvatarUrl(mergedProfile.avatarUrl)
    this.restoreProfile()
  },

  async syncProfileToServer(nextProfile) {
    if (!hasBackendConfigured()) {
      return
    }

    try {
      const serverProfile = await updateUserProfile(nextProfile)
      const mergedProfile = mergeBackendProfile(serverProfile, {
        ...this.data.profile,
        ...nextProfile,
      })
      wx.setStorageSync(STORAGE_KEY, mergedProfile)
      persistStableAvatarUrl(mergedProfile.avatarUrl)
      this.restoreProfile()
    } catch (_error) {
      wx.showToast({
        title: '宸蹭繚瀛樺埌鏈湴',
        icon: 'none',
      })
    }
  },

  onAvatarPickerTap() {
    if (this.avatarChoosingLock) {
      return
    }

    this.avatarChoosingLock = true
    this.setData({ avatarChoosing: true })
    if (this.avatarChooseTimer) {
      clearTimeout(this.avatarChooseTimer)
    }
    // 微信取消头像选择时不会回调 chooseavatar，短暂节流后自动恢复按钮。
    this.avatarChooseTimer = setTimeout(() => {
      this.avatarChooseTimer = 0
      this.resetAvatarChoosing()
    }, 1200) as unknown as number
  },

  onChooseAvatar(event) {
    this.resetAvatarChoosing()
    const avatarUrl = String(event.detail?.avatarUrl || '').trim()
    if (!avatarUrl) {
      return
    }

    this.persistProfile({
      avatarUrl,
    })

    if (isTemporaryAvatarUrl(avatarUrl)) {
      wx.showLoading({
        title: '上传中',
      })

      const uploadAvatar = async () => {
        const uploadedAvatarUrl = await uploadUserAvatar(avatarUrl)
        this.persistProfile({
          avatarUrl: uploadedAvatarUrl,
        })
        await this.syncProfileToServer({
          avatarUrl: uploadedAvatarUrl,
        })
      }

      const refreshBackendSession = async () => {
        if (!hasBackendConfigured()) {
          throw new Error('后端未配置')
        }

        if (getBackendToken()) {
          return
        }

        const loginCode = await loginWithWechatCode()
        const serverProfile = await loginWithWechat({
          code: loginCode,
          nickname: this.data.profile.nickname || '',
          avatarUrl: this.data.profile.avatarUrl || DEFAULT_AVATAR_URL,
        })

        this.persistProfile(mergeBackendProfile(serverProfile, this.data.profile))
      }

      void (async () => {
        try {
          await uploadAvatar()
          wx.hideLoading()
          wx.showToast({
            title: '已更新',
            icon: 'success',
          })
        } catch (error) {
          if (isAuthRelatedUploadError(error)) {
            try {
              await refreshBackendSession()
              await uploadAvatar()
              wx.hideLoading()
              wx.showToast({
                title: '已更新',
                icon: 'success',
              })
              return
            } catch (retryError) {
              error = retryError
            }
          }

          wx.hideLoading()
          wx.showToast({
            title: error instanceof Error ? error.message : '上传失败',
            icon: 'none',
          })
        }
      })()
      return
    }

    this.syncProfileToServer({
      avatarUrl,
    }).catch(() => {})
    wx.showToast({
      title: '已更新',
      icon: 'success',
    })
  },

  resetAvatarChoosing() {
    this.avatarChoosingLock = false
    if (this.avatarChooseTimer) {
      clearTimeout(this.avatarChooseTimer)
      this.avatarChooseTimer = 0
    }
    if (this.data.avatarChoosing) {
      this.setData({ avatarChoosing: false })
    }
  },

  onNicknameInput(event) {
    const nickname = String(event.detail.value || '').trim()
    if (isNicknameOverLimit(nickname)) {
      showNicknameLengthLimitModal()
      return this.data.profile.nickname
    }

    this.setData({
      'profile.nickname': nickname,
    })
    return nickname
  },

  onNicknameBlur(event) {
    const nickname = String(event?.detail?.value || this.data.profile.nickname || '').trim()
    if (isNicknameOverLimit(nickname)) {
      showNicknameLengthLimitModal()
      this.setData({
        'profile.nickname': this.data.profile.nickname,
      })
      return
    }

    this.setData({
      'profile.nickname': nickname,
    })
    this.persistProfile({
      nickname,
    })
    this.syncProfileToServer({
      nickname,
    }).catch(() => {})
  },

  onAddressTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/address-form/address-form?mode=manage',
    })
  },

})



