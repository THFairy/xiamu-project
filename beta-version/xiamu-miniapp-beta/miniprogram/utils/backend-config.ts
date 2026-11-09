const RAW_BACKEND_BASE_URL = 'http://127.0.0.1:8081'
const RAW_STATIC_ASSET_BASE_URL = 'http://127.0.0.1:8081'
const BACKEND_BASE_URL_STORAGE_KEY = 'beta-runtime-backend-base-url'
const STATIC_ASSET_BASE_URL_STORAGE_KEY = 'beta-runtime-static-asset-base-url'

const LOCAL_IMAGE_PREFIX = '/pages/images/'
const STATIC_IMAGE_PREFIX = '/static/images/'

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '')

const isLoopbackHostname = (hostname: string): boolean => (
  ['127.0.0.1', 'localhost', '0.0.0.0'].includes(String(hostname || '').trim().toLowerCase())
)

const parseBaseUrlParts = (value: string): { protocol: string; hostname: string } | null => {
  const normalizedValue = normalizeBaseUrl(String(value || ''))
  const match = normalizedValue.match(/^(https?):\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i)

  if (!match) {
    return null
  }

  return {
    protocol: String(match[1] || '').toLowerCase(),
    hostname: String(match[2] || '').toLowerCase(),
  }
}

const isUnsafeRuntimeBaseUrl = (value: string): boolean => {
  const normalizedValue = normalizeBaseUrl(String(value || ''))
  if (!normalizedValue) {
    return false
  }

  const parsedUrl = parseBaseUrlParts(normalizedValue)
  if (!parsedUrl) {
    return true
  }

  if (parsedUrl.protocol !== 'https' && !isLoopbackHostname(parsedUrl.hostname)) {
    return true
  }

  return isLoopbackHostname(parsedUrl.hostname)
}

const readRuntimeStorageValue = (key: string): string => {
  try {
    return String(wx.getStorageSync(key) || '').trim()
  } catch (_error) {
    return ''
  }
}

const readExtConfigValue = (key: string): string => {
  try {
    if (typeof wx.getExtConfigSync !== 'function') {
      return ''
    }

    const extConfig = wx.getExtConfigSync()
    return String((extConfig && (extConfig as Record<string, unknown>)[key]) || '').trim()
  } catch (_error) {
    return ''
  }
}

const resolveRuntimeBaseUrl = (storageKey: string, extConfigKey: string, fallbackValue: string): string => {
  const storageValue = normalizeBaseUrl(readRuntimeStorageValue(storageKey))
  const extConfigValue = normalizeBaseUrl(readExtConfigValue(extConfigKey))
  const normalizedFallbackValue = normalizeBaseUrl(fallbackValue)

  if (storageValue && !isUnsafeRuntimeBaseUrl(storageValue)) {
    return storageValue
  }

  if (extConfigValue && !isUnsafeRuntimeBaseUrl(extConfigValue)) {
    return extConfigValue
  }

  return normalizedFallbackValue
}

const rewriteLocalImageToStaticPath = (value: string): string => {
  if (!value.startsWith(LOCAL_IMAGE_PREFIX)) {
    return value
  }

  return `${STATIC_IMAGE_PREFIX}${value.slice(LOCAL_IMAGE_PREFIX.length)}`
}

const rewriteStaticImageToLocalPath = (value: string): string => {
  if (!value.startsWith(STATIC_IMAGE_PREFIX)) {
    return value
  }

  return `${LOCAL_IMAGE_PREFIX}${value.slice(STATIC_IMAGE_PREFIX.length)}`
}

export const getBackendBaseUrl = (): string => (
  resolveRuntimeBaseUrl(BACKEND_BASE_URL_STORAGE_KEY, 'backendBaseUrl', RAW_BACKEND_BASE_URL)
)

export const getStaticAssetBaseUrl = (): string => (
  resolveRuntimeBaseUrl(STATIC_ASSET_BASE_URL_STORAGE_KEY, 'staticAssetBaseUrl', RAW_STATIC_ASSET_BASE_URL || getBackendBaseUrl())
)

const rewriteLoopbackAssetUrl = (value: string): string => {
  const normalizedValue = String(value || '').trim()
  if (!/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue
  }

  const match = normalizedValue.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/i)
  if (!match) {
    return normalizedValue
  }

  const hostname = String(match[1] || '').split(':', 1)[0].toLowerCase()
  if (!isLoopbackHostname(hostname)) {
    return normalizedValue
  }

  const staticAssetBaseUrl = getStaticAssetBaseUrl()
  return staticAssetBaseUrl ? `${staticAssetBaseUrl}${match[2] || ''}` : normalizedValue
}

const isNumericPlaceholderAsset = (value: string): boolean => {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) {
    return true
  }

  const isNumericPath = (pathValue: string): boolean => {
    const pathname = pathValue.split(/[?#]/, 1)[0]
    return /^\/?\d+$/.test(pathname)
  }

  if (isNumericPath(normalizedValue)) {
    return true
  }

  if (!/^https?:\/\//i.test(normalizedValue)) {
    return false
  }

  const protocolEndIndex = normalizedValue.indexOf('://') + 3
  const pathStartIndex = normalizedValue.indexOf('/', protocolEndIndex)
  return isNumericPath(pathStartIndex >= 0 ? normalizedValue.slice(pathStartIndex) : '/')
}

export const BACKEND_BASE_URL = getBackendBaseUrl()
export const STATIC_ASSET_BASE_URL = getStaticAssetBaseUrl()

export const setRuntimeBackendBaseUrl = (value: string): void => {
  const normalizedValue = normalizeBaseUrl(String(value || ''))
  try {
    if (normalizedValue) {
      wx.setStorageSync(BACKEND_BASE_URL_STORAGE_KEY, normalizedValue)
      return
    }

    wx.removeStorageSync(BACKEND_BASE_URL_STORAGE_KEY)
  } catch (_error) {
    // Ignore storage failures in runtime config helpers.
  }
}

export const setRuntimeStaticAssetBaseUrl = (value: string): void => {
  const normalizedValue = normalizeBaseUrl(String(value || ''))
  try {
    if (normalizedValue) {
      wx.setStorageSync(STATIC_ASSET_BASE_URL_STORAGE_KEY, normalizedValue)
      return
    }

    wx.removeStorageSync(STATIC_ASSET_BASE_URL_STORAGE_KEY)
  } catch (_error) {
    // Ignore storage failures in runtime config helpers.
  }
}

export const getBackendUnavailableReason = (): string => {
  const backendBaseUrl = getBackendBaseUrl()

  if (!backendBaseUrl) {
    return '未配置后端服务地址'
  }

  const parsedUrl = parseBaseUrlParts(backendBaseUrl)
  if (!parsedUrl || (parsedUrl.protocol !== 'https' && !isLoopbackHostname(parsedUrl.hostname))) {
    return '小程序仅支持通过 HTTPS 或本机回环地址连接后端服务'
  }

  return ''
}

export const isBackendEnabled = (): boolean => !getBackendUnavailableReason()

export const toStaticAssetPath = (value: string): string => {
  return rewriteLocalImageToStaticPath(String(value || '').trim())
}

export const resolveBackendAssetUrl = (value: string): string => {
  const backendBaseUrl = getBackendBaseUrl()
  const staticAssetBaseUrl = getStaticAssetBaseUrl()
  const normalizedValue = rewriteLoopbackAssetUrl(toStaticAssetPath(value))

  if (isNumericPlaceholderAsset(normalizedValue)) {
    return ''
  }

  if (/^(https?:)?\/\//i.test(normalizedValue) || normalizedValue.startsWith('data:')) {
    return normalizedValue
  }

  if (normalizedValue.startsWith('/static/')) {
    if (staticAssetBaseUrl) {
      return `${staticAssetBaseUrl}${normalizedValue}`
    }

    return rewriteStaticImageToLocalPath(normalizedValue)
  }

  if (normalizedValue.startsWith('/')) {
    return backendBaseUrl ? `${backendBaseUrl}${normalizedValue}` : normalizedValue
  }

  return ''
}
