<template>
    <el-card shadow="never" class="border-0">
        <search-header :model="searchForm" permission="searchUser,GET" @search="getData(1)" @reset="resetSearchForm">
            <search-header-item label="用户昵称 / UID" prop="keyword" label-width="110px">
                <el-input v-model="searchForm.keyword" placeholder="请输入用户昵称或 UID" clearable></el-input>
            </search-header-item>
        </search-header>

        <list-header
            :permissions="{
                refresh: 'getUserList,GET'
            }"
            @refresh="getData"
        ></list-header>

        <el-table id="list-table" :data="tableData" style="width: 100%" stripe lazy>
            <el-table-column label="序号" width="100" align="center">
                <template #default="{ row }">
                    {{ getUidIndex(row) }}
                </template>
            </el-table-column>

            <el-table-column prop="uid" label="UID" width="160" align="center"></el-table-column>

            <el-table-column label="用户昵称" width="220">
                <template #default="{ row }">
                    <div class="flex items-center">
                        <el-avatar :size="40" :src="row.avatar">
                            {{ String(row.nickname || row.uid || '?').slice(0, 1) }}
                        </el-avatar>
                        <div class="ml-3">
                            <h6 class="text-sm font-medium">{{ row.nickname || '-' }}</h6>
                            <small class="text-gray-400">来自 `users` 表</small>
                        </div>
                    </div>
                </template>
            </el-table-column>

            <el-table-column label="用户名(手机号码)" width="190">
                <template #default="{ row }">
                    <span>{{ row.username || '-' }}</span>
                </template>
            </el-table-column>

            <el-table-column label="归属地" width="130" align="center">
                <template #default="{ row }">
                    <span>{{ row.province || '暂无地址' }}</span>
                </template>
            </el-table-column>

            <el-table-column label="登录 / 注册" align="center" min-width="300">
                <template #default="{ row }">
                    <div class="user-time-line text-sm">注册时间: {{ formatTimestampValue(row.create_time) || '-' }}</div>
                    <div class="user-time-line text-sm" v-if="formatTimestampValue(row.last_login_time)">
                        最后登录: {{ formatTimestampValue(row.last_login_time) }}
                    </div>
                    <div class="user-time-line text-sm" v-else>最后登录: -</div>
                </template>
            </el-table-column>

            <el-table-column
                v-permission="['updateUserStatus,POST']"
                prop="status"
                label="状态"
                width="120"
                align="center"
            >
                <template #default="{ row }">
                    <el-switch
                        @change="handleStatusChange($event, row)"
                        :active-value="1"
                        :inactive-value="0"
                        :model-value="row.status"
                        :loading="row.statusLoading"
                    />
                </template>
            </el-table-column>

            <el-table-column
                v-permission="['deleteUser,POST']"
                fixed="right"
                label="操作"
                width="120"
                align="center"
            >
                <template #default="{ row }">
                    <el-popconfirm
                        title="是否要删除该用户记录？"
                        @confirm="handleDelete(row.id)"
                        confirm-button-text="确定"
                        cancel-button-text="取消"
                    >
                        <template #reference>
                            <el-button v-permission="['deleteUser,POST']" type="text" size="small">删除</el-button>
                        </template>
                    </el-popconfirm>
                </template>
            </el-table-column>
        </el-table>

        <div class="mt-5 flex justify-center">
            <el-pagination
                :currentPage="currentPage"
                background
                layout="prev, pager, next"
                :page-size="limit"
                :total="total"
                @current-change="getData"
            ></el-pagination>
        </div>
    </el-card>
</template>

<script setup>
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import { useInitTable } from '~/composables/useCommon'
import { formatTimestampValue } from '~/composables/util'
import { getUserList, updateUserStatus, deleteUser } from '~/api/user'

const {
    searchForm,
    resetSearchForm,
    currentPage,
    limit,
    total,
    tableData,
    getData,
    handleDelete,
    handleStatusChange,
} = useInitTable({
    searchForm: {
        keyword: "",
    },
    getList: getUserList,
    success: (res) => {
        total.value = res.totalCount
        tableData.value = res.list.map((item) => {
            item.statusLoading = false
            return item
        })
    },
    deleteData: deleteUser,
    updateStatus: updateUserStatus,
})

const getUidIndex = (row) => {
    const fallbackIndex = Number(row?.display_id || 0)
    if (fallbackIndex > 0) {
        return fallbackIndex
    }

    const matched = String(row?.uid || '').trim().toUpperCase().match(/^(\d{6,})XM$/)
    return matched ? Number(matched[1]) : '-'
}
</script>

<style scoped>
.user-time-line {
    white-space: nowrap;
}
</style>
