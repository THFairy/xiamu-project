import axios from 'axios'
import { toast } from '~/composables/util'
import { getToken } from '~/composables/auth'
import { getApiBaseUrl, getFallbackApiBaseUrl, setApiBaseUrl } from '~/composables/api'
import store from '~/store'

const service = axios.create()
let isRedirectingToLogin = false
let autoRefreshTimer = null

const AUTO_REFRESH_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const AUTO_REFRESH_EXCLUDED_PATHS = [
    /^\/admin\/inventory_management(?:\/|$)/,
    /^\/admin\/category(?:\/|$)/,
    /^\/admin\/recycle\/option-groups(?:\/|$)/,
    /^\/admin\/recycle\/option-items(?:\/|$)/,
    /^\/admin\/(?:login|register|logout|getinfo)$/,
    /^\/admin\/image\/upload$/,
    /\/excelexport(?:\?|$)/,
]

const shouldAutoRefreshAfterMutation = (config = {}) => {
    if (config.skipAutoRefresh || !AUTO_REFRESH_METHODS.has(String(config.method || 'get').toLowerCase())) {
        return false
    }

    const requestPath = String(config.url || '')
    return !AUTO_REFRESH_EXCLUDED_PATHS.some((pattern) => pattern.test(requestPath))
}

const scheduleAutoRefresh = () => {
    if (autoRefreshTimer || typeof window === 'undefined') {
        return
    }

    // Allow the submitting component to finish its success handling before reloading the current view.
    autoRefreshTimer = window.setTimeout(() => window.location.reload(), 200)
}

const expireAdminSession = () => {
    if (isRedirectingToLogin) {
        return
    }

    isRedirectingToLogin = true
    store.dispatch("logout").finally(() => {
        toast("登录过期，请重新登录", "error")
        window.setTimeout(() => window.location.assign(`${import.meta.env.BASE_URL}login`), 300)
    })
}

const shouldRetryWithFallback = (error) => {
    const requestConfig = error.config
    if (!requestConfig || requestConfig.__apiBaseFallbackRetried) {
        return false
    }

    const currentApiBaseUrl = requestConfig.baseURL || getApiBaseUrl()
    const fallbackApiBaseUrl = getFallbackApiBaseUrl(currentApiBaseUrl)
    if (!fallbackApiBaseUrl) {
        return false
    }

    if (!error.response) {
        return true
    }

    return [502, 503, 504].includes(Number(error.response.status))
}

service.interceptors.request.use(config => {
    config.baseURL = config.baseURL || getApiBaseUrl()

    const token = getToken()
    if (token) {
        config.headers['token'] = token
    }
    return config
}, error => {
    return Promise.reject(error)
})

service.interceptors.response.use(res => {
    if (shouldAutoRefreshAfterMutation(res.config)) {
        scheduleAutoRefresh()
    }
    return res.request.responseType == "blob" ? res.data : res.data.data
}, async error => {
    if (shouldRetryWithFallback(error)) {
        const requestConfig = error.config
        const nextApiBaseUrl = getFallbackApiBaseUrl(requestConfig.baseURL || getApiBaseUrl())

        requestConfig.__apiBaseFallbackRetried = true
        requestConfig.baseURL = setApiBaseUrl(nextApiBaseUrl)

        return service.request(requestConfig)
    }

    const responseData = error.response && error.response.data ? error.response.data : {}
    const msg = responseData.msg || error.message || "请求失败"

    if (responseData.errorCode === 40001) {
        expireAdminSession()
        return Promise.reject(error)
    }

    if (msg == "非法token，请先登录！") {
        store.dispatch("logout").finally(() => location.reload())
    }

    toast(msg, "error", responseData.errorCode == 40000)
    return Promise.reject(error)
})

export default service
