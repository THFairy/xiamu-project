<template>
    <div class="container finance-page">
        <div class="page-heading">
            <div>
                <h2>财务统计</h2>
                <p>按库存记录的订单时间统计利润，利润公式由“列计算”统一维护。</p>
            </div>
            <el-button :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
        </div>

        <el-row :gutter="20" class="mb-5">
            <el-col :xs="24" :sm="12">
                <el-card shadow="never" class="profit-card month-card border-0">
                    <div class="profit-label">本月利润</div>
                    <div class="profit-value">¥ {{ formatMoney(statistics.monthProfit) }}</div>
                    <div class="profit-hint">按本月创建时间汇总</div>
                </el-card>
            </el-col>
            <el-col :xs="24" :sm="12" class="mobile-card-gap">
                <el-card shadow="never" class="profit-card today-card border-0">
                    <div class="profit-label">今日利润</div>
                    <div class="profit-value">¥ {{ formatMoney(statistics.todayProfit) }}</div>
                    <div class="profit-hint">按今日创建时间汇总</div>
                </el-card>
            </el-col>
        </el-row>

        <el-card shadow="never" class="border-0 mb-5">
            <div v-if="canSearchFinance" class="toolbar">
                <el-input v-model="keyword" clearable placeholder="按商品编号查询" @keyup.enter="search" @clear="search" />
                <el-button type="primary" :icon="Search" @click="search">查询</el-button>
            </div>
            <div class="chart-grid">
                <div class="chart-panel">
                    <div class="chart-title">每日利润</div>
                    <div ref="dailyChartRef" class="chart"></div>
                </div>
                <div class="chart-panel">
                    <div class="chart-title">每月利润</div>
                    <div ref="monthlyChartRef" class="chart"></div>
                </div>
            </div>
        </el-card>

        <el-card shadow="never" class="border-0">
            <template #header><span class="font-medium">利润明细</span></template>
            <el-table :data="statistics.details" stripe border v-loading="loading">
                <el-table-column prop="inventoryNumber" label="商品编号" min-width="140" />
                <el-table-column prop="orderTime" label="订单时间" min-width="180" />
                <el-table-column prop="finalSalePrice" label="最终售价" min-width="110" />
                <el-table-column prop="saleFreight" label="卖出运费" min-width="110" />
                <el-table-column prop="recycleFreight" label="回收运费" min-width="110" />
                <el-table-column prop="platformFee" label="平台费" min-width="100" />
                <el-table-column prop="profit" label="利润" min-width="110">
                    <template #default="{ row }"><span :class="Number(row.profit) < 0 ? 'negative-profit' : 'positive-profit'">¥ {{ row.profit }}</span></template>
                </el-table-column>
            </el-table>
            <el-empty v-if="!loading && !statistics.details.length" description="暂无利润数据" />
            <div v-if="statistics.total" class="mt-5 flex justify-center">
                <el-pagination
                    background
                    layout="prev, pager, next, total"
                    :current-page="currentPage"
                    :page-size="pageSize"
                    :total="statistics.total"
                    @current-change="loadData"
                />
            </div>
        </el-card>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import { getFinanceStatistics } from '~/api/inventory'
import { hasPermission } from '~/directive/permission'

const keyword = ref('')
const canSearchFinance = computed(() => hasPermission(['searchFinanceStatistics,GET']))
const loading = ref(false)
const currentPage = ref(1)
const pageSize = 10
const dailyChartRef = ref(null)
const monthlyChartRef = ref(null)
const statistics = reactive({ monthProfit: 0, todayProfit: 0, daily: [], monthly: [], details: [], total: 0 })
let echarts = null
let dailyChart = null
let monthlyChart = null
let resizeObserver = null

const formatMoney = (value) => Number(value || 0).toFixed(2)

const renderChart = (chart, series, color) => {
    if (!chart) return
    chart.setOption({
        tooltip: { trigger: 'axis', valueFormatter: (value) => `¥ ${Number(value || 0).toFixed(2)}` },
        grid: { left: 48, right: 20, top: 20, bottom: 42 },
        xAxis: { type: 'category', data: series.map((item) => item.name), axisLabel: { rotate: series.length > 10 ? 35 : 0 } },
        yAxis: { type: 'value', axisLabel: { formatter: (value) => `¥${value}` } },
        series: [{ type: 'bar', data: series.map((item) => item.value), barMaxWidth: 30, itemStyle: { color }, showBackground: true, backgroundStyle: { color: '#f1f5f9' } }],
    }, true)
}

const loadData = async (page = currentPage.value) => {
    currentPage.value = Number(page) || 1
    loading.value = true
    try {
        const data = await getFinanceStatistics(keyword.value, currentPage.value, pageSize)
        statistics.monthProfit = Number(data.monthProfit || 0)
        statistics.todayProfit = Number(data.todayProfit || 0)
        statistics.daily = Array.isArray(data.daily) ? data.daily : []
        statistics.monthly = Array.isArray(data.monthly) ? data.monthly : []
        statistics.details = Array.isArray(data.details) ? data.details : []
        statistics.total = Number(data.total || 0)
        await nextTick()
        renderChart(dailyChart, statistics.daily, '#2563eb')
        renderChart(monthlyChart, statistics.monthly, '#16a34a')
    } finally {
        loading.value = false
    }
}

const search = () => {
    currentPage.value = 1
    loadData(1)
}

onMounted(async () => {
    const module = await import('~/components/echartsBar.js')
    echarts = module.default
    if (dailyChartRef.value) dailyChart = echarts.init(dailyChartRef.value)
    if (monthlyChartRef.value) monthlyChart = echarts.init(monthlyChartRef.value)
    resizeObserver = new ResizeObserver(() => { dailyChart?.resize(); monthlyChart?.resize() })
    if (dailyChartRef.value) resizeObserver.observe(dailyChartRef.value)
    if (monthlyChartRef.value) resizeObserver.observe(monthlyChartRef.value)
    await loadData()
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    dailyChart?.dispose()
    monthlyChart?.dispose()
})
</script>

<style scoped>
.finance-page { padding-bottom: 24px; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.page-heading h2 { margin: 0; color: #303133; font-size: 22px; }
.page-heading p { margin: 8px 0 0; color: #909399; font-size: 13px; }
.profit-card { min-height: 142px; color: #fff; }
.month-card { background: #2563eb; }
.today-card { background: #16a34a; }
.profit-label { font-size: 14px; opacity: .9; }
.profit-value { margin-top: 18px; font-size: 30px; font-weight: 700; }
.profit-hint { margin-top: 10px; font-size: 12px; opacity: .78; }
.toolbar { display: flex; gap: 12px; margin-bottom: 18px; }
.toolbar .el-input { max-width: 320px; }
.chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.chart-panel { min-width: 0; border: 1px solid #ebeef5; border-radius: 6px; padding: 16px; }
.chart-title { color: #303133; font-size: 14px; font-weight: 600; }
.chart { height: 300px; }
.positive-profit { color: #16a34a; font-weight: 600; }
.negative-profit { color: #dc2626; font-weight: 600; }
@media (max-width: 767px) {
    .mobile-card-gap { margin-top: 20px; }
    .page-heading { align-items: flex-start; }
    .chart-grid { grid-template-columns: 1fr; }
    .toolbar .el-input { max-width: none; flex: 1; }
}
</style>
