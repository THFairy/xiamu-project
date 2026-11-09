<!-- 用途：展示后台首页地址及订单统计分布图，并支持标题右侧辅助说明。 -->
<template>
    <el-card shadow="never" class="border-0 address-distribution-card" :body-style="{ padding: 0 }">
        <template #header>
            <div class="address-distribution-header">
                <span class="text-sm">{{ title }}</span>
                <div class="address-distribution-meta">
                    <span v-if="description" class="address-distribution-description">{{ description }}</span>
                    <span class="address-distribution-total">{{ totalLabel }} {{ total }} 个</span>
                </div>
            </div>
        </template>
        <div ref="chartRef" class="address-distribution-chart"></div>
    </el-card>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
    title: {
        type: String,
        required: true,
    },
    data: {
        type: Array,
        default: () => [],
    },
    total: {
        type: Number,
        default: 0,
    },
    totalLabel: {
        type: String,
        default: '默认地址',
    },
    description: {
        type: String,
        default: '',
    },
    emptyText: {
        type: String,
        default: '暂无默认地址数据',
    },
})

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
        chartLoader = import('~/components/echartsPie.js').then((module) => {
            echarts = module.default
            return echarts
        })
    }

    return chartLoader
}

const renderChart = () => {
    if (!chart) {
        return
    }

    const data = props.data.filter((item) => Number(item?.value || 0) > 0)
    chart.setOption({
        color: ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#4b5563'],
        tooltip: {
            trigger: 'item',
            formatter: '{b}<br/>{c} 个（{d}%）',
        },
        legend: {
            type: 'scroll',
            bottom: 0,
            left: 'center',
        },
        series: [{
            type: 'pie',
            radius: ['38%', '68%'],
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            label: {
                formatter: '{b} {d}%',
            },
            labelLine: {
                length: 10,
                length2: 8,
            },
            data,
        }],
        graphic: data.length === 0 ? [{
            type: 'text',
            left: 'center',
            top: '42%',
            style: {
                text: props.emptyText,
                fill: '#909399',
                font: '14px sans-serif',
            },
        }] : [],
    }, true)
}

onMounted(async () => {
    echarts = await loadChartLibrary()
    await nextTick()

    if (!chartRef.value) {
        return
    }

    chart = echarts.init(chartRef.value)
    renderChart()
    resizeObserver = new ResizeObserver(() => chart && chart.resize())
    resizeObserver.observe(chartRef.value)
})

watch(() => props.data, renderChart, { deep: true })

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    chart?.dispose()
    chart = null
})
</script>

<style scoped>
.address-distribution-card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.address-distribution-card :deep(.el-card__body) {
    flex: 1;
    min-height: 0;
    padding: 0 16px 16px;
}

.address-distribution-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.address-distribution-meta {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 4px 12px;
    text-align: right;
}

.address-distribution-description {
    color: #a8abb2;
    font-size: 12px;
}

.address-distribution-total {
    color: #909399;
    font-size: 12px;
}

.address-distribution-chart {
    width: 100%;
    height: 320px;
}

@media (max-width: 640px) {
    .address-distribution-header {
        align-items: flex-start;
        flex-direction: column;
        gap: 6px;
    }

    .address-distribution-meta {
        justify-content: flex-start;
        text-align: left;
    }
}
</style>
