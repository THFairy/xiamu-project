<template>
    <el-card shadow="never" class="border-0 mini-program-analytics-card" :body-style="{ padding: 0 }">
        <template #header>
            <div class="flex justify-between mini-program-analytics-header">
                <span class="text-sm">小程序用户分析</span>
                <div>
                    <el-check-tag
                        v-for="item in options"
                        :key="item.value"
                        :checked="current === item.value"
                        class="mini-program-analytics-option"
                        @click="loadData(item.value)"
                    >{{ item.text }}</el-check-tag>
                </div>
            </div>
        </template>
        <div ref="chartRef" class="mini-program-analytics-chart"></div>
    </el-card>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getUserEngagementStatistics } from '~/api/index.js'

const options = [
    { text: '近 1 个月', value: 'month' },
    { text: '近 1 周', value: 'week' },
    { text: '近 24 小时', value: 'hour' },
]

const current = ref('week')
const chartRef = ref(null)
let echarts = null
let chart = null
let chartLoader = null
let resizeObserver = null

const loadChartLibrary = () => {
    if (echarts) {
        return Promise.resolve(echarts)
    }

    if (!chartLoader) {
        chartLoader = import('~/components/echartsGroupedBar.js').then((module) => {
            echarts = module.default
            return echarts
        })
    }

    return chartLoader
}

const renderChart = (data = {}) => {
    if (!chart) {
        return
    }

    chart.setOption({
        color: ['#2563eb', '#16a34a', '#f97316'],
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
        },
        legend: {
            top: 8,
            data: ['新增用户', '登录用户', '在线超过 20 分钟用户'],
        },
        grid: {
            left: 42,
            right: 20,
            top: 52,
            bottom: 34,
            containLabel: true,
        },
        xAxis: {
            type: 'category',
            data: Array.isArray(data.x) ? data.x : [],
            axisTick: { alignWithLabel: true },
        },
        yAxis: {
            type: 'value',
            minInterval: 1,
        },
        series: [
            { name: '新增用户', type: 'bar', data: Array.isArray(data.newUsers) ? data.newUsers : [], barMaxWidth: 28 },
            { name: '登录用户', type: 'bar', data: Array.isArray(data.loginUsers) ? data.loginUsers : [], barMaxWidth: 28 },
            { name: '在线超过 20 分钟用户', type: 'bar', data: Array.isArray(data.onlineOverTwentyMinutes) ? data.onlineOverTwentyMinutes : [], barMaxWidth: 28 },
        ],
    }, true)
}

const loadData = (type = 'week') => {
    current.value = type
    if (!chart) {
        return
    }

    chart.showLoading()
    getUserEngagementStatistics(type)
        .then(renderChart)
        .finally(() => chart && chart.hideLoading())
}

onMounted(async () => {
    echarts = await loadChartLibrary()
    await nextTick()
    if (!chartRef.value) {
        return
    }

    chart = echarts.init(chartRef.value)
    resizeObserver = new ResizeObserver(() => chart && chart.resize())
    resizeObserver.observe(chartRef.value)
    loadData(current.value)
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    chart?.dispose()
    chart = null
})
</script>

<style scoped>
.mini-program-analytics-card {
    display: flex;
    flex-direction: column;
}

.mini-program-analytics-card :deep(.el-card__body) {
    flex: 1;
    min-height: 0;
    padding: 0 16px 16px;
}

.mini-program-analytics-option {
    margin-left: 8px;
}

.mini-program-analytics-chart {
    width: 100%;
    height: 360px;
}
</style>
