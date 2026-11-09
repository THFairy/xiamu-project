import { computed, ref } from 'vue'

const hasCustomApiBaseUrl = Object.prototype.hasOwnProperty.call(import.meta.env, 'VITE_API_BASE_URL')
const defaultPrimaryApiBaseUrl = '/api'
const configuredPrimaryApiBaseUrl = hasCustomApiBaseUrl ? import.meta.env.VITE_API_BASE_URL : defaultPrimaryApiBaseUrl
const configuredFallbackApiBaseUrl = import.meta.env.VITE_FALLBACK_API_BASE_URL
const apiBaseUrlStorageKey = 'xiamuclub-active-api-base-url'

const normalizeApiBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '')

const buildApiBaseUrlCandidates = () => {
    const candidates = [configuredPrimaryApiBaseUrl, configuredFallbackApiBaseUrl]
        .map(normalizeApiBaseUrl)
        .filter((value, index, list) => list.indexOf(value) === index)

    if (!candidates.length) {
        candidates.push('')
    }

    return candidates
}

const apiBaseUrlCandidates = buildApiBaseUrlCandidates()
const primaryApiBaseUrl = apiBaseUrlCandidates[0] || ''
const fallbackApiBaseUrl = apiBaseUrlCandidates.find((value, index) => value && index > 0) || ''

const readStoredApiBaseUrl = () => {
    if (typeof window === 'undefined') {
        return null
    }

    const storedValue = window.sessionStorage.getItem(apiBaseUrlStorageKey)
    if (storedValue === null) {
        return null
    }

    return normalizeApiBaseUrl(storedValue)
}

const writeStoredApiBaseUrl = (value) => {
    if (typeof window === 'undefined') {
        return
    }

    const normalizedValue = normalizeApiBaseUrl(value)
    if (!normalizedValue || normalizedValue === primaryApiBaseUrl) {
        window.sessionStorage.removeItem(apiBaseUrlStorageKey)
        return
    }

    window.sessionStorage.setItem(apiBaseUrlStorageKey, normalizedValue)
}

const resolveInitialApiBaseUrl = () => {
    const storedValue = readStoredApiBaseUrl()
    if (storedValue === null) {
        return primaryApiBaseUrl
    }

    return apiBaseUrlCandidates.includes(storedValue) ? storedValue : primaryApiBaseUrl
}

export const apiBaseUrl = ref(resolveInitialApiBaseUrl())

export function getApiBaseUrl() {
    return apiBaseUrl.value
}

export function setApiBaseUrl(nextApiBaseUrl) {
    const normalizedValue = normalizeApiBaseUrl(nextApiBaseUrl)
    const nextValue = apiBaseUrlCandidates.includes(normalizedValue) ? normalizedValue : primaryApiBaseUrl
    apiBaseUrl.value = nextValue
    writeStoredApiBaseUrl(nextValue)
    return nextValue
}

export function getFallbackApiBaseUrl(currentApiBaseUrl = apiBaseUrl.value) {
    const normalizedCurrentApiBaseUrl = normalizeApiBaseUrl(currentApiBaseUrl)
    return apiBaseUrlCandidates.find((value) => value !== normalizedCurrentApiBaseUrl) || ''
}

export function switchToFallbackApiBaseUrl(currentApiBaseUrl = apiBaseUrl.value) {
    const nextApiBaseUrl = getFallbackApiBaseUrl(currentApiBaseUrl)
    if (!nextApiBaseUrl) {
        return ''
    }

    return setApiBaseUrl(nextApiBaseUrl)
}

export function resetApiBaseUrl() {
    return setApiBaseUrl(primaryApiBaseUrl)
}

export function buildApiUrl(pathname = '', baseUrl = apiBaseUrl.value) {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
    return `${normalizeApiBaseUrl(baseUrl)}${normalizedPath}`
}

export function useApiUrl(pathname = '') {
    return computed(() => buildApiUrl(pathname, apiBaseUrl.value))
}

export {
    apiBaseUrlCandidates,
    fallbackApiBaseUrl,
    primaryApiBaseUrl,
}
