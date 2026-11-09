// 用途：网页后台路由配置，注册法律文档编辑页面。
import {
    createRouter as _createRouter,
    createWebHashHistory,
} from 'vue-router'

import adminLayout from '~/layouts/admin.vue'

const routes = [
    {
        path: '/',
        component: adminLayout,
        children: [
            { path: '/', component: () => import('~/pages/index.vue'), meta: { title: '后台首页' } },
            { path: '/data-analysis', component: () => import('~/data-analysis/index.vue'), meta: { title: '数据分析' } },
            { path: '/goods/list', component: () => import('~/pages/goods/list.vue'), meta: { title: '商品管理' } },
            { path: '/category/list', component: () => import('~/pages/category/list.vue'), meta: { title: '分类管理' } },
            { path: '/staff/list', component: () => import('~/pages/staff/list.vue'), meta: { title: '员工管理' } },
            { path: '/privacy-policy/index', component: () => import('~/pages/privacy-policy/index.vue'), meta: { title: '隐私政策填写' } },
            { path: '/user-agreement/index', component: () => import('~/pages/user-agreement/index.vue'), meta: { title: '用户协议填写' } },
            { path: '/recycle/list', component: () => import('~/pages/recycle/list.vue'), meta: { title: '回收配置' } },
            { path: '/recycle/review', component: () => import('~/pages/recycle/review.vue'), meta: { title: '回收审核' } },
            { path: '/carousel-directory/list', component: () => import('~/pages/carousel-directory/list.vue'), meta: { title: '教程分类' } },
            { path: '/carousel-directory/editor', component: () => import('~/pages/carousel-directory/editor.vue'), meta: { title: '教程编辑' } },
            { path: '/carousel-directory/cover', component: () => import('~/pages/carousel-directory/cover.vue'), meta: { title: '封面管理' } },
            { path: '/skus/list', component: () => import('~/pages/skus/list.vue'), meta: { title: '规格管理' } },
            { path: '/comment/list', component: () => import('~/pages/comment/list.vue'), meta: { title: '评价管理' } },
            { path: '/homepage-banner/list', component: () => import('~/pages/homepage-banner/list.vue'), meta: { title: '首页轮播管理' } },
            { path: '/homepage-section/editor', component: () => import('~/pages/homepage-section/editor.vue'), meta: { title: '专区编辑' } },
            { path: '/user/list', component: () => import('~/pages/user/list.vue'), meta: { title: '用户管理' } },
            { path: '/inventory/list', component: () => import('~/pages/inventory/list.vue'), meta: { title: '库存管理' } },
            { path: '/inventory/calculations', component: () => import('~/pages/inventory/calculations.vue'), meta: { title: '列计算' } },
            { path: '/finance/list', component: () => import('~/pages/finance/list.vue'), meta: { title: '财务统计' } },
            { path: '/level/list', component: () => import('~/pages/level/list.vue'), meta: { title: '会员等级' } },
            { path: '/coupon/list', component: () => import('~/pages/coupon/list.vue'), meta: { title: '优惠券管理' } },
            { path: '/order/list', component: () => import('~/pages/order/list.vue'), meta: { title: '订单管理' } },
            { path: '/setting/base', component: () => import('~/pages/setting/base.vue'), meta: { title: '系统设置' } },
            { path: '/setting/buy', component: () => import('~/pages/setting/buy.vue'), meta: { title: '支付设置' } },
            { path: '/notice/list', component: () => import('~/pages/notice/list.vue'), meta: { title: '公告管理' } },
            { path: '/setting/ship', component: () => import('~/pages/setting/ship.vue'), meta: { title: '物流设置' } },
            { path: '/image/list', redirect: '/goods/list' },
            { path: '/manager/list', component: () => import('~/pages/manager/list.vue'), meta: { title: '管理员管理' } },
            { path: '/manager/profile', component: () => import('~/pages/manager/profile.vue'), meta: { title: '编辑信息' } },
            { path: '/role/list', component: () => import('~/pages/role/list.vue'), meta: { title: '角色管理' } },
            { path: '/access/list', component: () => import('~/pages/access/list.vue'), meta: { title: '权限管理' } },
            { path: '/distribution/index', component: () => import('~/pages/distribution/index.vue'), meta: { title: '分销管理' } },
            { path: '/distribution/setting', component: () => import('~/pages/distribution/setting.vue'), meta: { title: '分销设置' } },
        ],
    },
    {
        path: '/login',
        component: () => import('~/pages/login.vue'),
        meta: {
            title: '登录',
        },
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('~/pages/404.vue'),
    },
]

function createRouter() {
    return _createRouter({
        history: createWebHashHistory(),
        routes,
    })
}

const router = createRouter()

export default router
