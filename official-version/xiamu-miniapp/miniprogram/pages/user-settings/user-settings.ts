// 用途：用户设置页，跳转到独立的隐私政策与用户协议页面。
import { shouldIgnoreRapidBackTap, shouldIgnoreRapidNavigationTap, BackTapGuard, NavigationTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface UserSettingsData {
  statusBarHeight: number
}

interface UserSettingsPage extends BackTapGuard, NavigationTapGuard {
  onLoad(): void
  navigateBack(): void
  onPersonalInfoTap(): void
  onPrivacyPolicyTap(): void
  onUserAgreementTap(): void
}

Page<UserSettingsData, UserSettingsPage>({
  data: {
    statusBarHeight: 20,
  },

  onLoad() {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })
  },

  navigateBack() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack()
  },

  onPersonalInfoTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/profile/profile?from=settings',
    })
  },

  onPrivacyPolicyTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/privacy-policy/index',
    })
  },

  onUserAgreementTap() {
    if (shouldIgnoreRapidNavigationTap(this)) {
      return
    }

    wx.navigateTo({
      url: '/pages/user-agreement/index',
    })
  },
})
