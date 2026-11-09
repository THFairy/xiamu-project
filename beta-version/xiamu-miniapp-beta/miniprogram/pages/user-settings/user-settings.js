// 用途：兼容旧构建产物中的用户设置跳转地址。
let cachedStatusBarHeight = null

const getStatusBarHeight = () => {
  if (cachedStatusBarHeight !== null) {
    return cachedStatusBarHeight
  }

  try {
    if (typeof wx.getWindowInfo === 'function') {
      cachedStatusBarHeight = wx.getWindowInfo().statusBarHeight || 20
      return cachedStatusBarHeight
    }
  } catch (_error) {
    cachedStatusBarHeight = 20
    return cachedStatusBarHeight
  }

  cachedStatusBarHeight = 20
  return cachedStatusBarHeight
}

const shouldIgnoreRapidTap = (page, key, lockMs) => {
  const now = Date.now()
  if ((page[key] || 0) > now) {
    return true
  }

  page[key] = now + lockMs
  return false
}

Page({
  data: {
    statusBarHeight: 20,
  },

  onLoad() {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })
  },

  navigateBack() {
    if (shouldIgnoreRapidTap(this, 'backTapLockedUntil', 500)) {
      return
    }

    wx.navigateBack()
  },

  onPersonalInfoTap() {
    if (shouldIgnoreRapidTap(this, 'navigationTapLockedUntil', 800)) {
      return
    }

    wx.navigateTo({
      url: '/pages/profile/profile?from=settings',
    })
  },

  onPrivacyPolicyTap() {
    if (shouldIgnoreRapidTap(this, 'navigationTapLockedUntil', 800)) {
      return
    }

    wx.navigateTo({
      url: '/pages/privacy-policy/index',
    })
  },

  onUserAgreementTap() {
    if (shouldIgnoreRapidTap(this, 'navigationTapLockedUntil', 800)) {
      return
    }

    wx.navigateTo({
      url: '/pages/user-agreement/index',
    })
  },
})
