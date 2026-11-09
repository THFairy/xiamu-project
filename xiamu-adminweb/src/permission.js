import router from '~/router'
import store from '~/store'
import { getToken } from '~/composables/auth'
import { isUnsupportedAdminPath } from '~/composables/adminRoutes'
import { toast, showFullLoading, hideFullLoading } from '~/composables/util.js'

const alwaysAccessiblePaths = new Set(['/','/login','/404','/manager/profile'])
const inheritedMenuPaths = new Map([
    ['/inventory/calculations', '/inventory/list'],
])
const hasLoadManagerInfo = () => store.state.managerInfoLoaded === true
let managerInfoPromise = null

const flattenMenus = (menus = []) => {
    const result = []

    const walk = (list = []) => {
        list.forEach((item) => {
            if (!item) {
                return
            }
            if (Array.isArray(item.child) && item.child.length) {
                walk(item.child)
                return
            }
            if (item.frontpath) {
                result.push(String(item.frontpath))
            }
        })
    }

    walk(Array.isArray(menus) ? menus : [])
    return result
}

const getAllowedPaths = () => {
    const paths = new Set(alwaysAccessiblePaths)
    flattenMenus(store.state.menus).forEach((path) => paths.add(path))
    return paths
}

const resolveFirstAllowedPath = () => {
    const menuPath = flattenMenus(store.state.menus)[0]
    return menuPath || '/'
}

async function ensureManagerInfoLoaded() {
    if (hasLoadManagerInfo()) {
        return true
    }

    if (!managerInfoPromise) {
        managerInfoPromise = store.dispatch("getInfo").finally(() => {
            managerInfoPromise = null
        })
    }

    const data = await managerInfoPromise
    return !!data
}

router.beforeEach(async(to, from, next) => {
    showFullLoading()

    if (to.path == "/404") {
        return next()
    }

    if (isUnsupportedAdminPath(to.path)) {
        toast("当前页面暂未接入现有后台，已返回首页", "warning")
        return next({ path: '/' })
    }

    const token = getToken()

    if (!token && to.path != "/login") {
        toast("请先登录", "error")
        return next({ path: '/login' })
    }

    if (token && to.path == '/login') {
        toast("请勿重复登录", "error")
        return next({ path: from.path ? from.path : '/' })
    }

    if (token && !hasLoadManagerInfo()) {
        try {
            await ensureManagerInfoLoaded()
        } catch (_error) {
            await store.dispatch("logout")
            toast("登录状态已失效，请重新登录", "error")
            return next({ path: '/login', replace: true })
        }
    }

    if (token) {
        const allowedPaths = getAllowedPaths()
        const inheritedPath = inheritedMenuPaths.get(to.path)
        if (!allowedPaths.has(to.path) && !(inheritedPath && allowedPaths.has(inheritedPath))) {
            toast("当前账号无权访问该页面", "warning")
            return next({ path: resolveFirstAllowedPath(), replace: true })
        }
    }

    const title = (to.meta.title ? to.meta.title : "") + "-夏木电商平台后台管理"
    document.title = title

    next()
})

router.afterEach(() => hideFullLoading())
