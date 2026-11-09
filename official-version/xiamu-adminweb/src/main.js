// 用途：初始化管理后台应用、全局插件及手机端响应式布局策略。
import { createApp } from 'vue'
import App from './App.vue'

const originalPushState = window.history.pushState
const originalReplaceState = window.history.replaceState

window.history.pushState = function (...args) {
    if (document.visibilityState === 'hidden') return
    return originalPushState.apply(this, args)
}

window.history.replaceState = function (...args) {
    if (document.visibilityState === 'hidden') return
    return originalReplaceState.apply(this, args)
}

const app = createApp(App)

import store from './store'
app.use(store)

import router from './router'
app.use(router)

import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

const elementPlusLocale = {
    ...zhCn,
    el: {
        ...zhCn.el,
        colorpicker: { ...zhCn.el.colorpicker, confirm: '确认' },
        datepicker: { ...zhCn.el.datepicker, confirm: '确认' },
        messagebox: { ...zhCn.el.messagebox, confirm: '确认' },
        popconfirm: { ...zhCn.el.popconfirm, confirmButtonText: '确认' },
    },
}

app.use(ElementPlus, { locale: elementPlusLocale })

import * as icons from '@element-plus/icons-vue'
Object.keys(icons).forEach(key => {
    app.component(key, icons[key])
})

import 'virtual:windi.css'
import 'nprogress/nprogress.css'
import './phone-strategy/phone-strategy.css'
import { initializePhoneStrategy } from './phone-strategy'
import './permission'

import permission from './directive/permission.js'
app.use(permission)

initializePhoneStrategy()
app.mount('#app')

let checkingAdminSession = false
const checkAdminSession = () => {
    if (checkingAdminSession || document.visibilityState === 'hidden' || !store.state.token && !sessionStorage.getItem('admin-token')) {
        return
    }

    checkingAdminSession = true
    import('./api/manager.js')
        .then(({ getinfo }) => getinfo())
        .catch(() => {})
        .finally(() => {
            checkingAdminSession = false
        })
}

window.setInterval(checkAdminSession, 60 * 1000)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkAdminSession()
    }
})
