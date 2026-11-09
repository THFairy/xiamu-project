import { shouldIgnoreRapidBackTap } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface BackTapGuard {
  backTapLockedUntil?: number
}

interface HowToPlayData {
  statusBarHeight: number
  pageTitle: string
  heroEyebrow: string
  heroTitle: string
  heroDesc: string
  sections: Array<{
    id: number
    title: string
    desc: string
  }>
}

interface HowToPlayPage extends BackTapGuard {
  onLoad(): void
  onBackTap(): void
}

Page<HowToPlayData, HowToPlayPage>({
  data: {
    statusBarHeight: 20,
    pageTitle: '玩法说明',
    heroEyebrow: 'HOW TO PLAY',
    heroTitle: '首页轮播占位页',
    heroDesc: '这里先作为第一张首页轮播广告的跳转页占位，后续可以继续补活动内容、图文说明或玩法介绍。',
    sections: [
      {
        id: 1,
        title: '当前状态',
        desc: '页面入口已经接到首页第一张轮播图，点击后会进入这里。',
      },
      {
        id: 2,
        title: '后续可扩展',
        desc: '可以继续替换成活动专题、购买说明、回收规则或图文攻略。',
      },
      {
        id: 3,
        title: '现阶段用途',
        desc: '先提供一个稳定可访问的展位，方便你继续联调跳转和页面布局。',
      },
    ],
  },

  onLoad() {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
    })
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/index/index',
        })
      },
    })
  },
})
