<template>
    <el-card shadow="never" class="border-0 dashboard-chart-card" :body-style="{ padding: 0 }">
        <template #header>
            <div class="flex justify-between">
                <span class="text-sm">{{ chartTitle }}</span>
                <div>
                    <el-check-tag :checked="current == item.value" style="margin-right: 8px" v-for="(item,index) in options" :key="index" @click="handleChoose(item.value)">{{ item.text }}</el-check-tag>
                </div>
            </div>
        </template>
        <div ref="chartRef" class="dashboard-chart"></div>
    </el-card>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { getUserActivityStatistics } from '~/api/index.js'

const chartTitle = '用户日活统计'
const current = ref('week')
const options = ref([{
    text: '近1个月',
    value: 'month'
}, {
    text: '近1周',
    value: 'week'
}, {
    text: '近24小时',
    value: 'hour'
}])

const chartRef = ref(null)
let echarts = null
let myChart = null
let chartLoader = null
let chartResizeObserver = null

const loadChartLibrary = () => {
    if (echarts) {
        return Promise.resolve(echarts)
    }

    if (!chartLoader) {
        chartLoader = import('~/components/echartsBar.js').then((mod) => {
            echarts = mod.default
            return echarts
        })
    }

    return chartLoader
}

onMounted(async () => {
    echarts = await loadChartLibrary()
    await nextTick()

    if (chartRef.value) {
        myChart = echarts.init(chartRef.value)
        getData(current.value)

        chartResizeObserver = new ResizeObserver(() => {
            myChart && myChart.resize()
        })
        chartResizeObserver.observe(chartRef.value)
    }
})

onBeforeUnmount(() => {
    if (chartResizeObserver) {
        chartResizeObserver.disconnect()
        chartResizeObserver = null
    }

    if (myChart) {
        myChart.dispose()
        myChart = null
    }
})

const chartData = {
    xAxis: {
        type: 'category',
        data: []
    },
    yAxis: [{
        type: 'value'
    }],
    series: [{
        data: [],
        type: 'bar',
        itemStyle: {
            color: '#16a34a'
        },
        showBackground: true,
        backgroundStyle: {
            color: 'rgba(180, 180, 180, 0.2)'
        }
    }]
}

function getData(type = 'month') {
    if (!myChart) {
        return
    }

    myChart.showLoading()

    getUserActivityStatistics(type).then(res => {
        chartData.xAxis.data = res.x
        chartData.series[0].data = res.y
        myChart.setOption(chartData)
    }).finally(() => myChart.hideLoading())
}

function handleChoose(value) {
    current.value = value
    getData(value)
}
</script>

<style scoped>
.dashboard-chart-card {
    display: flex;
    flex-direction: column;
}

.dashboard-chart-card :deep(.el-card__body) {
    flex: 1;
    min-height: 0;
    padding: 0 16px 16px;
}

.dashboard-chart {
    width: 100%;
    height: 320px;
}
</style>
