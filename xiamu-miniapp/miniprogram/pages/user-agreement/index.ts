// 用途：从后端读取并展示用户协议正文。
import { fetchLegalDocument } from '../../utils/backend'
import { shouldIgnoreRapidBackTap, BackTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface UserAgreementData {
  statusBarHeight: number
  content: string
  loading: boolean
}

interface UserAgreementPage extends BackTapGuard {
  onLoad(): void
  loadDocument(): Promise<void>
  navigateBack(): void
}

Page<UserAgreementData, UserAgreementPage>({
  data: {
    statusBarHeight: 20,
    content: '',
    loading: true,
  },

  onLoad() {
    this.setData({ statusBarHeight: getStatusBarHeight() })
    void this.loadDocument()
  },

  async loadDocument() {
    try {
      const document = await fetchLegalDocument('user-agreement')
      this.setData({ content: String(document?.content || ''), loading: false })
    } catch (_error) {
      this.setData({ loading: false })
      wx.showToast({ title: '用户协议加载失败', icon: 'none' })
    }
  },

  navigateBack() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }
    wx.navigateBack()
  },
})
