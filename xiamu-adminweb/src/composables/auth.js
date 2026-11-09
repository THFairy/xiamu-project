import { useCookies } from '@vueuse/integrations/useCookies'
const TokenKey = 'admin-token'
const Cookies = useCookies(['admin-token'])

// 获取token
export function getToken() {
    const token = window.sessionStorage.getItem(TokenKey)
    if (token) {
        return token
    }

    const legacyToken = Cookies.get(TokenKey)
    if (legacyToken) {
        window.sessionStorage.setItem(TokenKey, legacyToken)
        Cookies.remove(TokenKey)
    }
    return legacyToken
}

// 设置token
export function setToken(token) {
    Cookies.remove(TokenKey)
    window.sessionStorage.setItem(TokenKey, token)
}

// 清除token
export function removeToken() {
    Cookies.remove(TokenKey)
    window.sessionStorage.removeItem(TokenKey)
}
