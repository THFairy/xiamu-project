<!-- 用途：集中展示教程、订单、用户和地址等数据分析图表。 -->
<template>
    <div class="container data-analysis-page">
        <el-card shadow="never" class="border-0 data-analysis-heading">
            <h1>数据分析</h1>
            <p>查看教程、订单、用户及地址分布等运营数据。</p>
        </el-card>

        <el-row v-if="hasDataAnalysisPermission('getStatistics1,GET')" class="mt-5">
            <el-col :span="24">
                <el-card shadow="never" class="border-0 tutorial-statistics-card" v-loading="tutorialLoading">
                    <template #header>
                        <div class="tutorial-statistics-header">
                            <div class="tutorial-statistics-title">教程统计</div>
                            <div class="tutorial-statistics-toolbar">
                                <el-select
                                    v-model="tutorialSortKey"
                                    size="small"
                                    placeholder="请选择排序"
                                    :class="['tutorial-statistics-sort', { 'tutorial-statistics-sort-selected': tutorialSortKey }]"
                                    @change="saveTutorialSort"
                                >
                                    <el-option label="无排序" value="updatedAt" />
                                    <el-option label="按点击量排序" value="viewCount" />
                                    <el-option label="按点赞量排序" value="likeCount" />
                                    <el-option label="按收藏量排序" value="favoriteCount" />
                                    <el-option label="按分享量排序" value="shareCount" />
                                </el-select>
                                <el-input
                                    v-model="tutorialSearchKeyword"
                                    clearable
                                    size="small"
                                    placeholder="搜索教程名称"
                                    class="tutorial-statistics-search"
                                    @keyup.enter="searchTutorialStatistics"
                                    @clear="searchTutorialStatistics"
                                />
                                <el-button type="primary" size="small" @click="searchTutorialStatistics">搜索</el-button>
                            </div>
                        </div>
                    </template>
                    <el-table :data="pagedTutorialStatistics" border stripe size="small" class="tutorial-statistics-table">
                        <el-table-column label="序号" width="80" align="center">
                            <template #default="{ $index }">
                                {{ (tutorialCurrentPage - 1) * tutorialPageSize + $index + 1 }}
                            </template>
                        </el-table-column>
                        <el-table-column prop="title" label="教程" min-width="240" />
                        <el-table-column prop="viewCount" label="点击量" width="140" align="center" />
                        <el-table-column prop="likeCount" label="点赞量" width="140" align="center" />
                        <el-table-column prop="favoriteCount" label="收藏量" width="140" align="center" />
                        <el-table-column prop="shareCount" label="分享量" width="140" align="center" />
                    </el-table>
                    <div class="tutorial-statistics-pagination">
                        <el-pagination
                            v-model:current-page="tutorialCurrentPage"
                            :page-size="tutorialPageSize"
                            :total="filteredTutorialStatistics.length"
                            layout="prev, pager, next, total"
                            @current-change="handleTutorialPageChange"
                        />
                    </div>
                </el-card>
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5 data-analysis-chart-row">
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col" v-if="hasDataAnalysisPermission('getStatistics3,GET')">
                <index-chart class="data-analysis-chart-panel" />
            </el-col>
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col" v-if="hasDataAnalysisPermission('getUserActivityStatistics,GET')">
                <user-activity-chart class="data-analysis-chart-panel" />
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5" v-if="hasDataAnalysisPermission('getUserEngagementStatistics,GET')">
            <el-col :span="24">
                <mini-program-user-analytics-chart />
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5 data-analysis-chart-row" v-if="hasDataAnalysisPermission('getAddressLocationStatistics,GET')">
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col">
                <address-distribution-chart
                    title="默认地址省份分布"
                    description="该数据是读取小程序用户填写的默认收货地址"
                    :data="addressLocationStatistics.province"
                    :total="addressLocationStatistics.defaultAddressCount"
                />
            </el-col>
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col">
                <address-distribution-chart
                    title="城市等级分布"
                    :data="addressLocationStatistics.cityTier"
                    :total="addressLocationStatistics.defaultAddressCount"
                />
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5 data-analysis-chart-row" v-if="hasDataAnalysisPermission('getOrderTimeStatistics,GET')">
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col">
                <address-distribution-chart
                    title="购买下单时段"
                    total-label="已支付订单"
                    empty-text="暂无购买订单数据"
                    :data="orderTimeStatistics.purchase"
                    :total="orderTimeStatistics.purchaseCount"
                />
            </el-col>
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col">
                <address-distribution-chart
                    title="回收下单时段"
                    total-label="回收订单"
                    empty-text="暂无回收订单数据"
                    :data="orderTimeStatistics.recycleOrder"
                    :total="orderTimeStatistics.recycleOrderCount"
                />
            </el-col>
        </el-row>

        <el-row :gutter="20" class="mt-5 data-analysis-chart-row" v-if="hasDataAnalysisPermission('getOrderTimeStatistics,GET')">
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col">
                <address-distribution-chart
                    title="购买型号统计"
                    total-label="已支付购买"
                    empty-text="暂无购买型号数据"
                    :data="orderModelStatistics.purchaseModels"
                    :total="orderModelStatistics.purchaseModelCount"
                />
            </el-col>
            <el-col :xs="24" :lg="12" class="data-analysis-chart-col">
                <address-distribution-chart
                    title="回收型号统计"
                    total-label="有效回收"
                    empty-text="暂无回收型号数据"
                    :data="orderModelStatistics.recycleModels"
                    :total="orderModelStatistics.recycleModelCount"
                />
            </el-col>
        </el-row>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import store from '~/store'
import { hasPermission } from '~/directive/permission.js'
import IndexChart from '~/components/IndexChart.vue'
import UserActivityChart from '~/components/UserActivityChart.vue'
import MiniProgramUserAnalyticsChart from '~/components/MiniProgramUserAnalyticsChart.vue'
import AddressDistributionChart from '~/components/AddressDistributionChart.vue'
import {
    getDataAnalysisAddressStatistics,
    getDataAnalysisOrderStatistics,
    getDataAnalysisTutorialStatistics,
} from './api.js'

const user = computed(() => store.state.user || {})
const hasDataAnalysisPermission = (ruleName) => hasPermission([ruleName])
const tutorialLoading = ref(false)
const tutorialStatistics = ref([])
const tutorialSearchKeyword = ref('')
const tutorialCurrentPage = ref(1)
const tutorialPageSize = 10
const tutorialSortKey = ref('updatedAt')
const getTutorialSortStorageKey = () => `data-analysis-tutorial-sort:${String(user.value.username || user.value.id || 'default')}`

try {
    tutorialSortKey.value = localStorage.getItem(getTutorialSortStorageKey()) || 'updatedAt'
} catch (_error) {
    tutorialSortKey.value = 'updatedAt'
}

const filteredTutorialStatistics = computed(() => {
    const keyword = tutorialSearchKeyword.value.trim().toLowerCase()
    const result = keyword
        ? tutorialStatistics.value.filter((item) => String(item.title || '').toLowerCase().includes(keyword))
        : [...tutorialStatistics.value]
    const sortKey = tutorialSortKey.value || 'updatedAt'
    result.sort((left, right) => {
        const rightValue = sortKey === 'updatedAt' ? Number(right.updatedAt || 0) : Number(right[sortKey] || 0)
        const leftValue = sortKey === 'updatedAt' ? Number(left.updatedAt || 0) : Number(left[sortKey] || 0)
        return rightValue - leftValue
    })
    return result
})
const pagedTutorialStatistics = computed(() => {
    const start = (tutorialCurrentPage.value - 1) * tutorialPageSize
    return filteredTutorialStatistics.value.slice(start, start + tutorialPageSize)
})
const addressLocationStatistics = ref({ province: [], cityTier: [], defaultAddressCount: 0 })
const orderTimeStatistics = ref({ purchase: [], recycleOrder: [], purchaseCount: 0, recycleOrderCount: 0 })
const orderModelStatistics = ref({ purchaseModels: [], recycleModels: [], purchaseModelCount: 0, recycleModelCount: 0 })

const loadTutorialStatistics = async () => {
    if (!hasDataAnalysisPermission('getStatistics1,GET')) {
        return
    }
    tutorialLoading.value = true
    try {
        const data = await getDataAnalysisTutorialStatistics()
        tutorialStatistics.value = Array.isArray(data?.tutorialStatistics)
            ? data.tutorialStatistics.map((item) => ({
                id: Number(item.id || 0),
                title: String(item.title || ''),
                viewCount: Number(item.viewCount || 0),
                likeCount: Number(item.likeCount || 0),
                favoriteCount: Number(item.favoriteCount || 0),
                shareCount: Number(item.shareCount || item.share_count || 0),
                updatedAt: Number(item.updatedAt || item.updated_at || 0),
            }))
            : []
        tutorialCurrentPage.value = 1
    } finally {
        tutorialLoading.value = false
    }
}

const loadDistributionStatistics = async () => {
    const [addressResult, orderResult] = await Promise.allSettled([
        hasDataAnalysisPermission('getAddressLocationStatistics,GET') ? getDataAnalysisAddressStatistics() : Promise.resolve(null),
        hasDataAnalysisPermission('getOrderTimeStatistics,GET') ? getDataAnalysisOrderStatistics() : Promise.resolve(null),
    ])
    if (addressResult.status === 'fulfilled' && addressResult.value) {
        addressLocationStatistics.value = {
            province: Array.isArray(addressResult.value.province) ? addressResult.value.province : [],
            cityTier: Array.isArray(addressResult.value.cityTier) ? addressResult.value.cityTier : [],
            defaultAddressCount: Number(addressResult.value.defaultAddressCount || 0),
        }
    }
    if (orderResult.status === 'fulfilled' && orderResult.value) {
        orderTimeStatistics.value = {
            purchase: Array.isArray(orderResult.value.purchase) ? orderResult.value.purchase : [],
            recycleOrder: Array.isArray(orderResult.value.recycleOrder) ? orderResult.value.recycleOrder : [],
            purchaseCount: Number(orderResult.value.purchaseCount || 0),
            recycleOrderCount: Number(orderResult.value.recycleOrderCount || 0),
        }
        orderModelStatistics.value = {
            purchaseModels: Array.isArray(orderResult.value.purchaseModels) ? orderResult.value.purchaseModels : [],
            recycleModels: Array.isArray(orderResult.value.recycleModels) ? orderResult.value.recycleModels : [],
            purchaseModelCount: Number(orderResult.value.purchaseModelCount || 0),
            recycleModelCount: Number(orderResult.value.recycleModelCount || 0),
        }
    }
}

const searchTutorialStatistics = () => {
    tutorialCurrentPage.value = 1
}
const saveTutorialSort = (value) => {
    tutorialCurrentPage.value = 1
    try {
        localStorage.setItem(getTutorialSortStorageKey(), String(value || ''))
    } catch (_error) {
        // 本地存储不可用时仍保留当前会话内的排序结果。
    }
}
const handleTutorialPageChange = (page) => {
    tutorialCurrentPage.value = page
}

loadTutorialStatistics()
loadDistributionStatistics()
</script>

<style scoped>
.data-analysis-page {
    padding-bottom: 12px;
}

.data-analysis-heading h1 {
    margin: 0;
    color: #1f2937;
    font-size: 22px;
    font-weight: 700;
}

.data-analysis-heading p {
    margin: 8px 0 0;
    color: #909399;
    font-size: 14px;
}

.tutorial-statistics-title {
    color: #303133;
    font-size: 16px;
    font-weight: 600;
}

.tutorial-statistics-header,
.tutorial-statistics-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.tutorial-statistics-header {
    justify-content: space-between;
    gap: 16px;
}

.tutorial-statistics-search {
    width: 240px;
}

.tutorial-statistics-sort {
    width: 150px;
}

.tutorial-statistics-sort-selected :deep(.el-input__wrapper) {
    background-color: #1677ff;
    box-shadow: 0 0 0 1px #1677ff inset;
}

.tutorial-statistics-sort-selected :deep(.el-input__inner),
.tutorial-statistics-sort-selected :deep(.el-select__caret) {
    color: #fff;
}

.tutorial-statistics-pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
}

.data-analysis-chart-row {
    align-items: stretch;
}

.data-analysis-chart-col {
    display: flex;
}

.data-analysis-chart-panel {
    width: 100%;
    height: 100%;
}

@media (max-width: 767px) {
    .tutorial-statistics-header,
    .tutorial-statistics-toolbar {
        align-items: stretch;
        flex-direction: column;
    }

    .tutorial-statistics-search,
    .tutorial-statistics-sort {
        width: 100%;
    }

    .data-analysis-chart-col + .data-analysis-chart-col {
        margin-top: 20px;
    }
}
</style>
