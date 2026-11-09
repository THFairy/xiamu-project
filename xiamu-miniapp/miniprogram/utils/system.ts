let cachedStatusBarHeight: number | null = null

const getStatusBarHeight = (): number => {
  if (cachedStatusBarHeight !== null) {
    return cachedStatusBarHeight
  }

  try {
    const maybeWx = wx as WechatMiniprogram.Wx & {
      getWindowInfo?: () => { statusBarHeight?: number }
    }

    if (typeof maybeWx.getWindowInfo === 'function') {
      const windowInfo = maybeWx.getWindowInfo()
      cachedStatusBarHeight = windowInfo.statusBarHeight || 20
      return cachedStatusBarHeight
    }
  } catch {
    cachedStatusBarHeight = 20
    return cachedStatusBarHeight
  }

  cachedStatusBarHeight = 20
  return cachedStatusBarHeight
}

export { getStatusBarHeight }
