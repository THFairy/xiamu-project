// 用途：从后端读取并展示隐私政策正文。
import { fetchLegalDocument } from '../../utils/backend'
import { shouldIgnoreRapidBackTap, BackTapGuard } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface PrivacyPolicyData {
  statusBarHeight: number
  content: string
  loading: boolean
}

interface PrivacyPolicyPage extends BackTapGuard {
  onLoad(): void
  loadDocument(): Promise<void>
  navigateBack(): void
}

Page<PrivacyPolicyData, PrivacyPolicyPage>({
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
      const document = await fetchLegalDocument('privacy-policy')
      this.setData({ content: String(document?.content || ''), loading: false })
    } catch (_error) {
      this.setData({ loading: false })
      wx.showToast({ title: '隐私政策加载失败', icon: 'none' })
    }
  },

  navigateBack() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }
    wx.navigateBack()
  },
})
