// 用途：统一检测竖屏窗口，并控制后台手机布局及抽屉菜单状态。
import { ref } from 'vue'

const isPhoneLayout = ref(false)
const phoneMenuVisible = ref(false)
let initialized = false
let resizeFrame = 0

const applyPhoneLayout = () => {
    const nextIsPhoneLayout = window.innerHeight > window.innerWidth
    isPhoneLayout.value = nextIsPhoneLayout
    document.documentElement.classList.toggle('phone-layout', nextIsPhoneLayout)

    if (!nextIsPhoneLayout) {
        phoneMenuVisible.value = false
    }
}

const schedulePhoneLayoutCheck = () => {
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(applyPhoneLayout)
}

export const initializePhoneStrategy = () => {
    if (initialized || typeof window === 'undefined') {
        return
    }

    initialized = true
    applyPhoneLayout()
    window.addEventListener('resize', schedulePhoneLayoutCheck, { passive: true })
    window.addEventListener('orientationchange', schedulePhoneLayoutCheck, { passive: true })
}

export const usePhoneStrategy = () => ({
    isPhoneLayout,
    phoneMenuVisible,
    openPhoneMenu: () => {
        phoneMenuVisible.value = true
    },
    closePhoneMenu: () => {
        phoneMenuVisible.value = false
    },
    togglePhoneMenu: () => {
        phoneMenuVisible.value = !phoneMenuVisible.value
    },
    setPhoneMenuVisible: (visible) => {
        phoneMenuVisible.value = Boolean(visible)
    },
})
