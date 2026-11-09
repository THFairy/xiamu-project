interface CustomerServicePage {
  redirectTimer?: number
  hasRedirected?: boolean
  onReady(): void
  onUnload(): void
  performRedirect(): void
}

Page<Record<string, never>, CustomerServicePage>({
  onReady() {
    if (this.hasRedirected) {
      return
    }

    this.hasRedirected = true
    this.redirectTimer = setTimeout(() => {
      this.redirectTimer = 0
      this.performRedirect()
    }, 60) as unknown as number
  },

  onUnload() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = 0
    }
  },

  performRedirect() {
    const targetUrl = `/pages/feature-placeholder/feature-placeholder?title=${encodeURIComponent('联系客服')}&helperText=${encodeURIComponent('旧客服页已移除，这里仅保留兼容跳转，避免历史缓存路由报错。')}`

    wx.redirectTo({
      url: targetUrl,
      fail: () => {
        wx.reLaunch({
          url: '/pages/mine/mine',
        })
      },
    })
  },
})
