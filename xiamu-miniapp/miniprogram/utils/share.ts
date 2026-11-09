// 用途：为所有页面统一启用好友分享与朋友圈分享，并生成默认分享内容。

const DEFAULT_SHARE_TITLE = '玩数码的夏木'
const DEFAULT_SHARE_PATH = '/pages/index/index'

type ShareOptionValue = string | number | boolean | null | undefined

interface SharePageInstance {
  route?: string
  options?: Record<string, ShareOptionValue>
  data?: Record<string, unknown>
}

interface ShareAppMessageContent {
  title: string
  path: string
  imageUrl?: string
}

interface ShareTimelineContent {
  title: string
  query?: string
  imageUrl?: string
}

type PageMethod = (this: SharePageInstance, ...args: unknown[]) => unknown

interface ShareablePageDefinition extends Record<string, unknown> {
  onLoad?: PageMethod
  onShareAppMessage?: PageMethod
  onShareTimeline?: PageMethod
}

const getTextValue = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const getNestedTextValue = (value: unknown, key: string): string => {
  if (!value || typeof value !== 'object') {
    return ''
  }

  return getTextValue((value as Record<string, unknown>)[key])
}

const getFirstImage = (value: unknown): string => Array.isArray(value)
  ? getTextValue(value.find((item) => getTextValue(item)))
  : ''

const buildShareQuery = (options?: Record<string, ShareOptionValue>): string => Object.entries(options || {})
  .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  .join('&')

const resolveShareTitle = (page: SharePageInstance): string => {
  const data = page.data || {}
  const pageTitle = getTextValue(data.pageTitle)
    || getTextValue(data.title)
    || getNestedTextValue(data.product, 'title')

  if (!pageTitle || pageTitle === DEFAULT_SHARE_TITLE) {
    return DEFAULT_SHARE_TITLE
  }

  return `${pageTitle}｜${DEFAULT_SHARE_TITLE}`
}

const resolveShareImage = (page: SharePageInstance): string => {
  const data = page.data || {}
  return getTextValue(data.imageUrl)
    || getTextValue(data.previewImage)
    || getNestedTextValue(data.product, 'coverImage')
    || getNestedTextValue(data.product, 'imageUrl')
    || getFirstImage(data.heroImages)
}

const resolveShareRoute = (page: SharePageInstance): string => {
  const route = getTextValue(page.route).replace(/^\/+/, '')
  return route ? `/${route}` : DEFAULT_SHARE_PATH
}

const buildDefaultShareAppMessage = (page: SharePageInstance): ShareAppMessageContent => {
  const query = buildShareQuery(page.options)
  const imageUrl = resolveShareImage(page)

  return {
    title: resolveShareTitle(page),
    path: `${resolveShareRoute(page)}${query ? `?${query}` : ''}`,
    ...(imageUrl ? { imageUrl } : {}),
  }
}

const buildDefaultShareTimeline = (page: SharePageInstance): ShareTimelineContent => {
  const query = buildShareQuery(page.options)
  const imageUrl = resolveShareImage(page)

  return {
    title: resolveShareTitle(page),
    ...(query ? { query } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  }
}

const enableShareMenu = (): void => {
  wx.showShareMenu({
    menus: ['shareAppMessage', 'shareTimeline'],
    fail: () => undefined,
  })
}

export const installGlobalPageShare = (): void => {
  const originalPage = Page as unknown as (definition: ShareablePageDefinition) => void
  const runtime = globalThis as unknown as {
    Page: (definition: ShareablePageDefinition) => void
  }

  runtime.Page = (definition: ShareablePageDefinition): void => {
    const originalOnLoad = definition.onLoad

    originalPage({
      ...definition,
      onLoad(this: SharePageInstance, ...args: unknown[]) {
        enableShareMenu()
        return originalOnLoad?.apply(this, args)
      },
      onShareAppMessage: definition.onShareAppMessage || function onShareAppMessage(this: SharePageInstance) {
        return buildDefaultShareAppMessage(this)
      },
      onShareTimeline: definition.onShareTimeline || function onShareTimeline(this: SharePageInstance) {
        return buildDefaultShareTimeline(this)
      },
    })
  }
}
