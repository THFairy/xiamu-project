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
import {
    getStatistics3
} from '~/api/index.js'

const chartTitle = '\u8ba2\u5355\u7edf\u8ba1'
const current = ref("week")
const options = ref([{
    text: "\u8fd11\u4e2a\u6708",
    value: "month"
}, {
    text: "\u8fd11\u5468",
    value: "week"
}, {
    text: "\u8fd124\u5c0f\u65f6",
    value: "hour"
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

let chartData = {
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
        showBackground: true,
        backgroundStyle: {
            color: 'rgba(180, 180, 180, 0.2)'
        }
    }]
}

function getData(type = "month") {
    if (!myChart) {
        return
    }

    myChart.showLoading()

    getStatistics3(type).then(res => {
        chartData.xAxis.data = res.x
        chartData.series[0].data = res.y
        myChart.setOption(chartData)
    }).finally(() => myChart.hideLoading())
}

function handleChoose(v) {
    current.value = v
    getData(v)
}
</script>

<style scoped>
.dashboard-chart-card {
    height: 100%;
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
    height: 100%;
    min-height: 320px;
}
</style>
