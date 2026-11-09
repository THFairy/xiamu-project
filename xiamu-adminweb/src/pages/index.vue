<!-- 用途：后台首页统计、教程数据及新回收订单自动提示。 -->
<template>
    <div class="container dashboard-home">
        <el-row :gutter="20" class="mb-5">
            <el-col :span="24">
                <el-card shadow="never" class="dashboard-hero border-0">
                    <div class="dashboard-hero-inner">
                        <div class="dashboard-hero-copy">
                            <div class="dashboard-eyebrow">后台首页</div>
                            <h1 class="dashboard-title">欢迎回来，{{ displayName }}</h1>
                            <p class="dashboard-desc">
                            </p>
                        </div>
                        <div class="dashboard-hero-meta">
                            <el-card shadow="never" class="dashboard-meta-card border-0">
                                <div class="dashboard-meta-label">当前账号</div>
                                <div class="dashboard-meta-value">{{ displayName }}</div>
                                <div class="dashboard-meta-sub">权限数：{{ ruleCount }} · 菜单数：{{ menuCount }}</div>
                            </el-card>
                            <el-card shadow="never" class="dashboard-meta-card border-0 mt-3">
                                <div class="dashboard-meta-label">系统状态</div>
                                <div class="dashboard-meta-value">{{ systemState }}</div>
                                <div class="dashboard-meta-sub">{{ currentTimeText }}</div>
                            </el-card>
                        </div>
                    </div>
                </el-card>
            </el-col>
        </el-row>

        <el-row :gutter="20" v-permission="['getStatistics1,GET']">
            <template v-if="panels.length === 0">
                <el-col :span="6" v-for="i in 4" :key="i">
                    <el-skeleton style="width: 240px" loading animated>
                        <template #template>
                            <el-card shadow="hover" class="border-0">
                                <template #header>
                                    <div class="flex justify-between">
                                        <el-skeleton-item variant="h3" style="width: 50%" />
                                        <el-skeleton-item variant="text" style="width: 10%" />
                                    </div>
                                </template>
                                <span class="text-3xl font-sans text-gray-500 font-bold">
                                    <el-skeleton-item variant="h3" style="width: 80%" />
                                </span>
                                <el-divider direction="horizontal"></el-divider>
                                <div class="text-sm flex justify-between text-gray-500">
                                    <el-skeleton-item variant="h3" style="width: 50%" />
                                    <el-skeleton-item variant="text" style="width: 10%" />
                                </div>
                            </el-card>
                        </template>
                    </el-skeleton>
                </el-col>
            </template>

            <el-col :span="6" v-for="(item, index) in panels" :key="index">
                <el-card shadow="hover" class="border-0">
                    <template #header>
                        <div class="flex justify-between">
                            <span class="text-sm">{{ item.title }}</span>
                            <el-tag :type="item.unitColor" size="small" effect="plain">{{ item.unit }}</el-tag>
                        </div>
                    </template>
                    <span class="text-3xl font-sans text-gray-500 font-bold">
                        <count-to :value="item.value"></count-to>
                    </span>
                    <template v-if="item.showSummary === true">
                        <el-divider direction="horizontal"></el-divider>
                        <div class="text-sm flex justify-between text-gray-500">
                            <span>{{ item.subTitle }}</span>
                            <span>{{ item.subValue }}{{ item.subUnit }}</span>
                        </div>
                    </template>
                </el-card>
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5 dashboard-profit-row" v-permission="['getStatistics1,GET']">
            <el-col :xs="24" :sm="12">
                <el-card shadow="hover" class="border-0 dashboard-profit-card dashboard-profit-month">
                    <div class="dashboard-profit-label">本月利润</div>
                    <div class="dashboard-profit-value">¥ {{ formatMoney(finance.monthProfit) }}</div>
                </el-card>
            </el-col>
            <el-col :xs="24" :sm="12" class="dashboard-profit-today">
                <el-card shadow="hover" class="border-0 dashboard-profit-card dashboard-profit-today-card">
                    <div class="dashboard-profit-label">今日利润</div>
                    <div class="dashboard-profit-value">¥ {{ formatMoney(finance.todayProfit) }}</div>
                </el-card>
            </el-col>
        </el-row>

        <el-row v-if="hasDashboardPermission('getStatistics1,GET')" class="mt-5">
            <el-col :span="24">
                <el-card shadow="never" class="border-0 dashboard-fee-card" v-loading="feeLoading">
                    <template #header>
                        <div class="dashboard-fee-header">
                            <div>
                                <div class="dashboard-fee-title">平台费用与运费统计</div>
                                <div class="dashboard-fee-subtitle">按库存记录创建时间统计，可通过月份日历查询历史费用</div>
                            </div>
                            <el-date-picker
                                v-model="feePeriod"
                                type="month"
                                value-format="YYYY-MM"
                                :clearable="false"
                                :editable="false"
                                placeholder="选择月份"
                                class="dashboard-fee-picker"
                                @change="loadFeeStatistics"
                            />
                        </div>
                    </template>
                    <el-row :gutter="16">
                        <el-col :xs="24" :sm="8">
                            <div class="dashboard-fee-item dashboard-fee-platform">
                                <div class="dashboard-fee-label">平台费总和</div>
                                <div class="dashboard-fee-value">¥ {{ formatMoney(feeStatistics.monthPlatformFee) }}</div>
                                <div class="dashboard-fee-hint">{{ feePeriodLabel }}</div>
                            </div>
                        </el-col>
                        <el-col :xs="24" :sm="8" class="dashboard-fee-mobile-gap">
                            <div class="dashboard-fee-item dashboard-fee-month-freight">
                                <div class="dashboard-fee-label">运费总和</div>
                                <div class="dashboard-fee-value">¥ {{ formatMoney(feeStatistics.monthFreight) }}</div>
                                <div class="dashboard-fee-hint">{{ feePeriodLabel }}（回收运费 + 卖出运费）</div>
                            </div>
                        </el-col>
                        <el-col :xs="24" :sm="8" class="dashboard-fee-mobile-gap">
                            <div class="dashboard-fee-item dashboard-fee-year-freight">
                                <div class="dashboard-fee-label">全年运费总和</div>
                                <div class="dashboard-fee-value">¥ {{ formatMoney(feeStatistics.yearFreight) }}</div>
                                <div class="dashboard-fee-hint">{{ feeStatistics.year }} 年 1 月至 12 月</div>
                            </div>
                        </el-col>
                    </el-row>
                </el-card>
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5 dashboard-summary-row">
            <el-col :span="24" class="dashboard-summary-col" v-permission="['getStatistics2,GET']">
                <div class="dashboard-card-stack">
                    <index-card :title="card1.title" :tip="card1.tip" :btns="card1.btns"></index-card>
                    <index-card :title="card2.title" :tip="card2.tip" :btns="card2.btns"></index-card>
                </div>
            </el-col>
        </el-row>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElNotification } from 'element-plus'
import { useRouter } from 'vue-router'
import store from '~/store'
import { hasPermission } from '~/directive/permission.js'
import CountTo from "~/components/CountTo.vue"
import IndexCard from "~/components/IndexCard.vue"
import { getDashboardFeeStatistics, getStatistics1, getStatistics2 } from "~/api/index.js"
import { getRecycleSubmissionList } from "~/api/recycle.js"

const user = computed(() => store.state.user || {})
const displayName = computed(() => user.value.username || '超级管理员')
const ruleCount = computed(() => Array.isArray(store.state.ruleNames) ? store.state.ruleNames.length : 0)
const menuCount = computed(() => Array.isArray(store.state.menus) ? store.state.menus.length : 0)
const currentTimeText = computed(() => new Date().toLocaleString('zh-CN', { hour12: false }))
const systemState = computed(() => '线上正常')
const hasDashboardPermission = (ruleName) => hasPermission([ruleName])
const router = useRouter()

const card1 = reactive({
    title: '店铺及商品提示',
    tip: '店铺及商品提示',
    btns: [],
})

const card2 = reactive({
    title: '交易提示',
    tip: '需要立即处理的交易订单',
    btns: [],
})

const panels = ref([])
const finance = ref({ monthProfit: 0, todayProfit: 0 })
const formatFeePeriod = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const feePeriod = ref(formatFeePeriod())
const feeLoading = ref(false)
const feeStatistics = reactive({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    monthPlatformFee: 0,
    monthFreight: 0,
    yearFreight: 0,
})
const feePeriodLabel = computed(() => {
    const [year, month] = String(feePeriod.value || '').split('-')
    return year && month ? `${year} 年 ${Number(month)} 月` : '当前月份'
})
const recycleNotificationTimer = ref(null)
const latestRecycleOrderKey = ref('')
const recycleNotificationInitialized = ref(false)
const recycleNotificationPolling = ref(false)
const recycleNotificationPollInterval = 15000

const getRecycleOrderKey = (order) => {
    const createdAt = Number(order?.createdAt || order?.created_at || 0)
    const id = Number(order?.id || 0)
    return `${createdAt}:${id}`
}

const compareRecycleOrder = (left, right) => {
    const leftCreatedAt = Number(left?.createdAt || left?.created_at || 0)
    const rightCreatedAt = Number(right?.createdAt || right?.created_at || 0)
    if (leftCreatedAt !== rightCreatedAt) {
        return rightCreatedAt - leftCreatedAt
    }
    return Number(right?.id || 0) - Number(left?.id || 0)
}

const notifyNewRecycleOrder = (order) => {
    const orderNo = String(order?.orderNo || order?.order_no || `#${Number(order?.id || 0)}`)
    const title = String(order?.title || '新的回收订单')
    ElNotification({
        title: '产生新的回收订单',
        message: `${title}，回收单号：${orderNo}`,
        type: 'warning',
        duration: 8000,
        onClick: () => router.push('/recycle/review'),
    })
}

const pollRecycleOrders = async () => {
    if (recycleNotificationPolling.value || !hasDashboardPermission('getRecycleSubmissionList,GET')) {
        return
    }

    recycleNotificationPolling.value = true
    try {
        const data = await getRecycleSubmissionList(1, { limit: 20 })
        const orders = Array.isArray(data?.list) ? [...data.list].sort(compareRecycleOrder) : []
        const latestOrder = orders[0]
        if (!latestOrder) {
            recycleNotificationInitialized.value = true
            return
        }

        const latestOrderKey = getRecycleOrderKey(latestOrder)
        if (!recycleNotificationInitialized.value) {
            latestRecycleOrderKey.value = latestOrderKey
            recycleNotificationInitialized.value = true
            return
        }

        const [latestCreatedAt, latestId] = latestRecycleOrderKey.value.split(':').map(Number)
        const previousLatestOrder = { createdAt: latestCreatedAt || 0, id: latestId || 0 }
        const newOrders = latestRecycleOrderKey.value
            ? orders.filter((order) => compareRecycleOrder(order, previousLatestOrder) < 0)
            : orders

        if (newOrders.length) {
            newOrders.reverse().forEach(notifyNewRecycleOrder)
        }
        latestRecycleOrderKey.value = latestOrderKey
    } catch (_error) {
        // 首页轮询失败不影响其他统计数据和页面操作。
    } finally {
        recycleNotificationPolling.value = false
    }
}

const loadFeeStatistics = async () => {
    if (!hasDashboardPermission('getStatistics1,GET')) {
        return
    }

    const [year, month] = String(feePeriod.value || '').split('-').map(Number)
    feeLoading.value = true
    try {
        const data = await getDashboardFeeStatistics(year, month)
        feeStatistics.year = Number(data?.year || year || new Date().getFullYear())
        feeStatistics.month = Number(data?.month || month || new Date().getMonth() + 1)
        feeStatistics.monthPlatformFee = Number(data?.monthPlatformFee || 0)
        feeStatistics.monthFreight = Number(data?.monthFreight || 0)
        feeStatistics.yearFreight = Number(data?.yearFreight || 0)
    } finally {
        feeLoading.value = false
    }
}

const loadStatistics = async () => {
    const [stats1, stats2] = await Promise.allSettled([
        hasDashboardPermission('getStatistics1,GET') ? getStatistics1() : Promise.resolve(null),
        hasDashboardPermission('getStatistics2,GET') ? getStatistics2() : Promise.resolve(null),
    ])

    if (stats1.status === 'fulfilled' && Array.isArray(stats1.value?.panels)) {
        panels.value = stats1.value.panels.map((item) => {
            item.loading = false
            return item
        })
        finance.value = {
            monthProfit: Number(stats1.value.finance?.monthProfit || 0),
            todayProfit: Number(stats1.value.finance?.todayProfit || 0),
        }
    }

    if (stats2.status === 'fulfilled' && stats2.value) {
        card1.btns = stats2.value.goods
        card2.btns = stats2.value.order
    }

}

loadStatistics()
loadFeeStatistics()

onMounted(() => {
    if (!hasDashboardPermission('getRecycleSubmissionList,GET')) {
        return
    }
    pollRecycleOrders()
    recycleNotificationTimer.value = window.setInterval(pollRecycleOrders, recycleNotificationPollInterval)
})

onBeforeUnmount(() => {
    if (recycleNotificationTimer.value) {
        window.clearInterval(recycleNotificationTimer.value)
        recycleNotificationTimer.value = null
    }
})

const formatMoney = (value) => Number(value || 0).toFixed(2)

</script>

<style scoped>
.dashboard-home {
    padding-bottom: 12px;
}

.dashboard-hero {
    background: linear-gradient(135deg, #4f46e5 0%, #2563eb 45%, #0f172a 100%);
    color: #fff;
    border-radius: 18px;
    overflow: hidden;
}

.dashboard-hero-inner {
    display: flex;
    gap: 24px;
    justify-content: space-between;
    align-items: stretch;
    min-height: 220px;
}

.dashboard-hero-copy {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px 0;
}

.dashboard-eyebrow {
    display: inline-flex;
    width: fit-content;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 12px;
    margin-bottom: 14px;
}

.dashboard-title {
    font-size: 30px;
    line-height: 1.2;
    font-weight: 700;
    margin: 0;
}

.dashboard-desc {
    margin-top: 12px;
    max-width: 680px;
    color: rgba(255, 255, 255, 0.88);
}

.dashboard-hero-meta {
    width: 320px;
    min-width: 280px;
}

.dashboard-meta-card {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    color: #fff;
    backdrop-filter: blur(8px);
}

.dashboard-meta-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
}

.dashboard-meta-value {
    margin-top: 8px;
    font-size: 22px;
    font-weight: 700;
}

.dashboard-meta-sub {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.75);
}

.dashboard-summary-row {
    align-items: stretch;
}

.tutorial-statistics-title {
    color: #303133;
    font-size: 16px;
    font-weight: 600;
}

.tutorial-statistics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.tutorial-statistics-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.tutorial-statistics-search {
    width: 240px;
}

.tutorial-statistics-sort {
    width: 150px;
}

.tutorial-statistics-sort :deep(.el-input__wrapper) {
    transition: background-color 0.2s, box-shadow 0.2s;
}

.tutorial-statistics-sort-selected :deep(.el-input__wrapper) {
    background-color: #1677ff;
    box-shadow: 0 0 0 1px #1677ff inset;
}

.tutorial-statistics-sort-selected :deep(.el-input__inner),
.tutorial-statistics-sort-selected :deep(.el-select__caret) {
    color: #fff;
}

.tutorial-statistics-table {
    width: 100%;
}

.tutorial-statistics-pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
}

@media (max-width: 640px) {
    .tutorial-statistics-header {
        align-items: stretch;
        flex-direction: column;
    }

    .tutorial-statistics-toolbar {
        width: 100%;
    }

    .tutorial-statistics-search {
        flex: 1;
        width: auto;
    }

    .tutorial-statistics-sort {
        width: 100%;
    }
}

.dashboard-summary-col {
    display: flex;
}

.dashboard-chart-panel {
    width: 100%;
    height: 100%;
}

.dashboard-card-stack {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.dashboard-location-row {
    align-items: stretch;
}

.dashboard-location-col {
    display: flex;
}

.dashboard-profit-card {
    min-height: 132px;
    color: #fff;
}

.dashboard-profit-month {
    background: #2563eb;
}

.dashboard-profit-today-card {
    background: #16a34a;
}

.dashboard-profit-label {
    font-size: 14px;
    opacity: .9;
}

.dashboard-profit-value {
    margin-top: 18px;
    font-size: 28px;
    font-weight: 700;
}

.dashboard-fee-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.dashboard-fee-title {
    color: #303133;
    font-size: 16px;
    font-weight: 600;
}

.dashboard-fee-subtitle,
.dashboard-fee-hint {
    color: #909399;
    font-size: 12px;
}

.dashboard-fee-subtitle {
    margin-top: 6px;
}

.dashboard-fee-picker {
    width: 150px;
}

.dashboard-fee-item {
    min-height: 142px;
    padding: 20px;
    border-radius: 8px;
    color: #fff;
}

.dashboard-fee-platform {
    background: #7c3aed;
}

.dashboard-fee-month-freight {
    background: #ea580c;
}

.dashboard-fee-year-freight {
    background: #0891b2;
}

.dashboard-fee-label {
    font-size: 14px;
    opacity: .9;
}

.dashboard-fee-value {
    margin-top: 14px;
    font-size: 28px;
    font-weight: 700;
}

.dashboard-fee-hint {
    margin-top: 10px;
    color: rgba(255, 255, 255, .78);
}

@media (max-width: 767px) {
    .dashboard-profit-today {
        margin-top: 20px;
    }

    .dashboard-location-col + .dashboard-location-col {
        margin-top: 20px;
    }

    .dashboard-fee-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .dashboard-fee-picker {
        width: 100%;
    }

    .dashboard-fee-mobile-gap {
        margin-top: 16px;
    }
}

</style>
