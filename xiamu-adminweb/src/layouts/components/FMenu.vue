<!-- 用途：后台侧边菜单，展示可访问的功能入口。 -->
<template>
    <div class="f-menu" :style="{ width: menuWidth }">
        <el-menu
            :default-active="defaultActive"
            :default-openeds="defaultOpeneds"
            class="border-0 menu-shell"
            :collapse-transition="false"
            unique-opened
            :collapse="isCollapse"
            @select="handleSelect"
        >
            <template v-for="(item, index) in asideMenus" :key="index">
                <el-sub-menu v-if="item.child && item.child.length" :index="item.name">
                    <template #title>
                        <el-icon v-if="item.icon" :class="resolveMenuIconClass(item.frontpath || item.child[0]?.frontpath)">
                            <component :is="item.icon"></component>
                        </el-icon>
                        <span>{{ item.name }}</span>
                    </template>

                    <el-menu-item v-for="(item2, index2) in item.child" :key="index2" :index="item2.frontpath">
                        <el-icon v-if="item2.icon" :class="resolveMenuIconClass(item2.frontpath)">
                            <component :is="item2.icon"></component>
                        </el-icon>
                        <template #title>{{ item2.name }}</template>
                    </el-menu-item>
                </el-sub-menu>

                <el-menu-item v-else :index="item.frontpath">
                    <el-icon v-if="item.icon" :class="resolveMenuIconClass(item.frontpath)">
                        <component :is="item.icon"></component>
                    </el-icon>
                    <template #title>{{ item.name }}</template>
                </el-menu-item>
            </template>
        </el-menu>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'

const props = defineProps({
    phoneMode: {
        type: Boolean,
        default: false,
    },
})
const emit = defineEmits(['navigate'])

const store = useStore()
const router = useRouter()
const route = useRoute()

const isCollapse = computed(() => !props.phoneMode && store.state.asideWidth !== '250px')
const menuWidth = computed(() => props.phoneMode ? '100%' : store.state.asideWidth)
const defaultActive = ref(route.path)

watch(
    () => route.path,
    (path) => {
        defaultActive.value = path
    },
    { immediate: true }
)

const primaryMenuConfig = [
    { path: '/', name: '后台首页', icon: 'home-filled' },
    { path: '/data-analysis', name: '数据分析', icon: 'data-analysis' },
    { path: '/user/list', name: '用户管理', icon: 'user' },
    { path: '/inventory/list', name: '库存管理', icon: 'box' },
    { path: '/goods/list', name: '商品管理', icon: 'shopping-cart' },
    { path: '/recycle/list', name: '回收配置', icon: 'refresh-right' },
    { path: '/recycle/review', name: '回收审核', icon: 'document-checked' },
    { path: '/order/list', name: '订单管理', icon: 'tickets' },
    {
        name: '轮播目录',
        icon: 'reading',
        matchPrefixes: ['/carousel-directory/', '/homepage-banner/'],
        child: [
            { path: '/carousel-directory/list', name: '教程分类', icon: 'reading' },
            { path: '/carousel-directory/editor', name: '教程编辑', icon: 'edit-pen' },
            { path: '/carousel-directory/cover', name: '封面管理', icon: 'picture' },
            { path: '/homepage-banner/list', name: '首页轮播管理', icon: 'picture-filled' },
        ],
    },
    {
        name: '分类管理',
        icon: 'grid',
        matchPrefixes: ['/category/', '/homepage-section/'],
        child: [
            { path: '/category/list', name: '分类类目', icon: 'grid' },
            { path: '/homepage-section/editor', name: '专区编辑', icon: 'picture' },
        ],
    },
]

const secondaryMenuConfig = {
    name: '更多功能',
    icon: 'grid',
    child: [
        { path: '/level/list', name: '会员等级', icon: 'medal' },
        { path: '/staff/list', name: '员工管理', icon: 'user-filled' },
        { path: '/privacy-policy/index', name: '隐私政策填写', icon: 'lock' },
        { path: '/user-agreement/index', name: '用户协议填写', icon: 'document' },
        { path: '/finance/list', name: '财务统计', icon: 'data-analysis' },
        { path: '/setting/buy', name: '支付设置', icon: 'wallet-filled' },
        { path: '/setting/ship', name: '物流设置', icon: 'van' },
        { path: '/comment/list', name: '评价管理', icon: 'chat-dot-square' },
        { path: '/notice/list', name: '公告管理', icon: 'bell' },
        { path: '/setting/base', name: '系统设置', icon: 'set-up' },
        { path: '/coupon/list', name: '优惠券管理', icon: 'files' },
    ],
}

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

            result.push(item)
        })
    }

    walk(menus)
    return result
}

const alwaysVisibleMenuPaths = new Set(['/'])

const rawMenuEntries = computed(() => flattenMenus(store.state.menus).filter((item) => item && item.frontpath))
const rawMenuByPath = computed(() => new Map(rawMenuEntries.value.map((item) => [item.frontpath, item])))
const hasMenuEntry = (path) => alwaysVisibleMenuPaths.has(path) || rawMenuByPath.value.has(path)

const pickMenuEntry = (path, fallback) => {
    const existing = rawMenuByPath.value.get(path)
    return {
        ...(existing || {}),
        name: fallback.name || existing?.name,
        icon: fallback.icon || existing?.icon,
        frontpath: path,
    }
}

const normalizeMenuItem = (item) => {
    if (Array.isArray(item.child) && item.child.length) {
        const configuredChildMenus = item.child
            .filter((child) => hasMenuEntry(child.path))
            .map((child) => pickMenuEntry(child.path, child))
        const configuredChildPaths = new Set(configuredChildMenus.map((child) => child.frontpath))
        const prefixMatchedMenus = Array.isArray(item.matchPrefixes)
            ? rawMenuEntries.value
                .filter((entry) => item.matchPrefixes.some((prefix) => String(entry.frontpath || '').startsWith(prefix)))
                .filter((entry) => !configuredChildPaths.has(entry.frontpath))
            : []
        const childMenus = [...configuredChildMenus, ...prefixMatchedMenus]

        if (!childMenus.length) {
            return null
        }

        return {
            name: item.name,
            icon: item.icon,
            child: childMenus,
        }
    }

    if (!hasMenuEntry(item.path)) {
        return null
    }

    return pickMenuEntry(item.path, item)
}

const asideMenus = computed(() => {
    const primaryMenus = primaryMenuConfig
        .map((item) => normalizeMenuItem(item))
        .filter(Boolean)
    const secondaryMenus = secondaryMenuConfig.child
        .filter((item) => hasMenuEntry(item.path))
        .map((item) => pickMenuEntry(item.path, item))

    return secondaryMenus.length
        ? [
            ...primaryMenus,
            {
                name: secondaryMenuConfig.name,
                icon: secondaryMenuConfig.icon,
                child: secondaryMenus,
            },
        ]
        : primaryMenus
})

const defaultOpeneds = computed(() => {
    return asideMenus.value
        .filter((item) => Array.isArray(item.child) && item.child.some((child) => child.frontpath === defaultActive.value))
        .map((item) => item.name)
})

const accentRules = [
    { prefix: '/data-analysis', className: 'text-indigo-500' },
    { prefix: '/user', className: 'text-sky-500' },
    { prefix: '/inventory', className: 'text-emerald-500' },
    { prefix: '/goods', className: 'text-violet-500' },
    { prefix: '/recycle', className: 'text-emerald-500' },
    { prefix: '/carousel-directory', className: 'text-sky-500' },
    { prefix: '/category', className: 'text-violet-500' },
    { prefix: '/skus', className: 'text-violet-500' },
    { prefix: '/order', className: 'text-fuchsia-500' },
    { prefix: '/comment', className: 'text-teal-500' },
    { prefix: '/homepage-banner', className: 'text-rose-500' },
    { prefix: '/homepage-section', className: 'text-amber-500' },
    { prefix: '/notice', className: 'text-emerald-500' },
    { prefix: '/setting', className: 'text-slate-500' },
    { prefix: '/coupon', className: 'text-amber-500' },
    { prefix: '/level', className: 'text-sky-500' },
    { prefix: '/', className: 'text-slate-400' },
]

const resolveMenuIconClass = (path = '') => {
    const matchedRule = accentRules.find((rule) => String(path || '').startsWith(rule.prefix))
    return matchedRule ? matchedRule.className : 'text-slate-400'
}

const handleSelect = (path) => {
    router.push({ path })
    emit('navigate')
}
</script>

<style>
.f-menu {
    @apply bg-light-50 fixed left-0 bottom-0 z-60;
    top: 64px;
    overflow: auto;
    box-shadow: 2px 0 8px 0 rgb(29 35 41 / 5%);
}

.f-menu::-webkit-scrollbar {
    width: 0;
}

.menu-shell {
    background: transparent;
}

.f-menu :deep(.el-menu) {
    border-right: 0;
    background: transparent;
}

.f-menu :deep(.el-menu-item),
.f-menu :deep(.el-sub-menu__title) {
    height: 48px;
    margin: 6px 12px;
    border-radius: 12px;
}

.f-menu :deep(.el-menu-item:hover),
.f-menu :deep(.el-sub-menu__title:hover) {
    background: #f5f7fb;
}

.f-menu :deep(.el-menu-item.is-active) {
    background: #eff6ff;
    color: #111827;
    font-weight: 600;
}

.f-menu :deep(.el-sub-menu .el-menu-item) {
    margin-left: 20px;
}
</style>
