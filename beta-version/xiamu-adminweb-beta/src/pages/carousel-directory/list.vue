<template>
    <el-card shadow="never" class="border-0">
        <search-header :model="searchForm" permission="searchContentPage,GET" @search="getData(1)" @reset="resetSearchForm">
            <search-header-item label="教程分类" prop="title">
                <el-input v-model="searchForm.title" placeholder="请输入教程分类关键词" clearable />
            </search-header-item>
        </search-header>

        <list-header
            :permissions="{
                create: 'createContentPage,POST',
                refresh: 'getContentPageList,GET'
            }"
            @create="handleCreate"
            @refresh="getData"
        >
            <el-button type="primary" plain size="small" @click="goCover">封面管理</el-button>
        </list-header>

        <el-table id="list-table" :data="tableData" stripe>
            <el-table-column label="图标预览" width="120" align="center">
                <template #default="{ row }">
                    <el-image
                        v-if="row.titleTagImageUrl"
                        class="h-10 w-10 rounded-xl"
                        :src="row.titleTagImageUrl"
                        fit="cover"
                        :preview-src-list="[row.titleTagImageUrl]"
                    />
                    <span
                        v-else
                        class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
                        :style="{ backgroundColor: getTutorialToneColor(row.tutorialTone) }"
                    >
                        {{ row.titleTag || getFallbackIcon(row.title) }}
                    </span>
                </template>
            </el-table-column>

            <el-table-column label="分类名称" min-width="180" prop="title" />

            <el-table-column label="教程数量" min-width="180" align="center">
                <template #default="{ row }">
                    <div class="flex items-center justify-center gap-3">
                        <span>{{ row.tutorialCountLoading ? '统计中' : (row.tutorialCountError ? '-' : row.tutorialCount) }}</span>
                        <el-button type="primary" link size="small" @click="handleViewTutorials(row)">
                            查看详情
                        </el-button>
                    </div>
                </template>
            </el-table-column>

            <el-table-column label="图标文字" width="120" align="center" prop="titleTag" />

            <el-table-column label="主题颜色" width="140" align="center">
                <template #default="{ row }">
                    <el-tag effect="plain">{{ getTutorialToneLabel(row.tutorialTone) }}</el-tag>
                </template>
            </el-table-column>

            <el-table-column label="更新时间" width="220" align="center">
                <template #default="{ row }">{{ formatTimestampValue(row.updatedAt) || '-' }}</template>
            </el-table-column>

            <el-table-column v-permission="['updateContentPageStatus,POST']" label="状态" width="100" align="center">
                <template #default="{ row }">
                    <el-switch
                        :model-value="row.status"
                        :active-value="1"
                        :inactive-value="0"
                        :loading="row.statusLoading"
                        @change="handleCategoryStatusChange($event, row)"
                    />
                </template>
            </el-table-column>

            <el-table-column
                v-permission="['updateContentPage,POST', 'deleteContentPage,POST']"
                label="操作"
                width="160"
                align="center"
                fixed="right"
            >
                <template #default="{ row }">
                    <el-button
                        v-permission="['updateContentPage,POST']"
                        type="text"
                        size="small"
                        @click="handleEdit(row)"
                    >
                        修改
                    </el-button>

                    <el-popconfirm
                        title="确认删除这个教程分类吗？"
                        confirm-button-text="确认"
                        cancel-button-text="取消"
                        @confirm="handleCategoryDelete(row.id)"
                    >
                        <template #reference>
                            <el-button v-permission="['deleteContentPage,POST']" type="text" size="small">
                                删除
                            </el-button>
                        </template>
                    </el-popconfirm>
                </template>
            </el-table-column>
        </el-table>

        <div class="mt-5 flex justify-center">
            <el-pagination
                :current-page="currentPage"
                background
                layout="prev, pager, next"
                :page-size="limit"
                :total="total"
                @current-change="getData"
            />
        </div>

        <el-dialog
            v-model="tutorialDialogVisible"
            :title="`${tutorialDialogCategoryTitle} - 教程列表`"
            width="560px"
            destroy-on-close
        >
            <el-table v-loading="tutorialDialogLoading" :data="tutorialTitles" max-height="480">
                <el-table-column type="index" label="序号" width="72" align="center" />
                <el-table-column label="教程名称" min-width="280" prop="title" />
            </el-table>
            <el-empty v-if="!tutorialDialogLoading && !tutorialTitles.length" description="该分类暂无教程" />
        </el-dialog>

        <form-drawer
            ref="formDrawerRef"
            :title="drawerTitle"
            size="62%"
            destroyOnClose
            @submit="handleSubmit"
        >
            <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="default">
                <el-form-item label="分类名称" prop="title">
                    <el-input v-model="form.title" placeholder="请输入问题分类名称" />
                </el-form-item>

                <el-form-item label="图标文字" prop="titleTag">
                    <el-input v-model="form.titleTag" maxlength="3" placeholder="请输入宫格图标文字，例如：主、号、NS" />
                </el-form-item>

                <el-form-item label="图标图片" prop="titleTagImageUrl">
                    <choose-image v-model="form.titleTagImageUrl" :limit="1" />
                    <small class="mt-2 flex text-gray-400">支持本机上传，优先显示图片；未上传时继续使用图标文字。</small>
                </el-form-item>

                <el-form-item label="主题颜色" prop="tutorialTone">
                    <el-select v-model="form.tutorialTone" placeholder="请选择主题颜色" class="w-full">
                        <el-option
                            v-for="item in tutorialToneOptions"
                            :key="item.value"
                            :label="item.label"
                            :value="item.value"
                        />
                    </el-select>
                    <small class="mt-2 flex text-gray-400">对应小程序“问题分类”宫格里的彩色图标背景。</small>
                </el-form-item>

                <el-form-item label="状态" prop="status">
                    <el-radio-group v-model="form.status">
                        <el-radio :label="1" border>显示</el-radio>
                        <el-radio :label="0" border>隐藏</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-drawer>
    </el-card>
</template>

<script setup>
import { useRouter } from 'vue-router'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import FormDrawer from '~/components/FormDrawer.vue'
import ChooseImage from '~/components/ChooseImage.vue'
import { useInitForm, useInitTable } from '~/composables/useCommon'
import {
    formatTimestampValue,
    hideFullLoading,
    showFullLoading,
    toast,
} from '~/composables/util'
import {
    createContentPage,
    deleteContentPage,
    getContentPageList,
    updateContentPage,
    updateContentPageStatus,
} from '~/api/content_page'
import { ref } from 'vue'

const TUTORIALS_PER_REQUEST = 100
let categoryStatsRequestId = 0
const tutorialDialogVisible = ref(false)
const tutorialDialogLoading = ref(false)
const tutorialDialogCategoryTitle = ref('')
const tutorialTitles = ref([])

const loadCategoryTutorialCounts = (rows) => {
    const requestId = ++categoryStatsRequestId

    rows.forEach((row) => {
        row.tutorialCount = null
        row.tutorialCountError = false
        row.tutorialCountLoading = true
    })

    Promise.all(rows.map(async (row) => {
        try {
            const result = await getContentPageList(1, {
                mode: 'article',
                tutorialCategoryId: row.id,
                limit: 1,
            })
            if (requestId === categoryStatsRequestId) {
                row.tutorialCount = Number(result.totalCount || 0)
            }
        } catch {
            if (requestId === categoryStatsRequestId) {
                row.tutorialCountError = true
            }
        } finally {
            if (requestId === categoryStatsRequestId) {
                row.tutorialCountLoading = false
            }
        }
    }))
}

const handleViewTutorials = async (row) => {
    tutorialDialogCategoryTitle.value = row.title
    tutorialTitles.value = []
    tutorialDialogVisible.value = true
    tutorialDialogLoading.value = true

    try {
        const firstPage = await getContentPageList(1, {
            mode: 'article',
            tutorialCategoryId: row.id,
            limit: TUTORIALS_PER_REQUEST,
        })
        const totalCount = Number(firstPage.totalCount || 0)
        const pageCount = Math.ceil(totalCount / TUTORIALS_PER_REQUEST)
        const remainingPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => (
            getContentPageList(index + 2, {
                mode: 'article',
                tutorialCategoryId: row.id,
                limit: TUTORIALS_PER_REQUEST,
            })
        )))

        tutorialTitles.value = [firstPage, ...remainingPages]
            .flatMap((page) => Array.isArray(page.list) ? page.list : [])
            .map((item) => ({ title: String(item.title || '').trim() }))
            .filter((item) => item.title)
        row.tutorialCount = totalCount
        row.tutorialCountError = false
    } catch {
        toast('教程列表加载失败，请稍后重试', 'error')
    } finally {
        tutorialDialogLoading.value = false
    }
}

const router = useRouter()
const tutorialToneOptions = [
    { label: '红色', value: 'red', color: '#ff385c' },
    { label: '橙色', value: 'orange', color: '#ff9f33' },
    { label: '绿色', value: 'green', color: '#63ce4d' },
    { label: '黄色', value: 'yellow', color: '#ffcc33' },
    { label: '蓝色', value: 'blue', color: '#4a8cff' },
]

const getFallbackIcon = (value = '') => {
    const title = String(value || '').trim()
    if (!title) {
        return '•'
    }

    return title.slice(0, 1)
}

const getTutorialToneColor = (value = '') => {
    const matched = tutorialToneOptions.find((item) => item.value === String(value || '').trim())
    return matched ? matched.color : tutorialToneOptions[4].color
}

const getTutorialToneLabel = (value = '') => {
    const matched = tutorialToneOptions.find((item) => item.value === String(value || '').trim())
    return matched ? matched.label : '蓝色'
}

const normalizeContentPage = (row = {}) => ({
    ...row,
    title: String(row.title || '').trim(),
    titleTag: String(row.titleTag || row.title_tag || '').trim(),
    titleTagImageUrl: String(row.titleTagImageUrl || row.title_tag_image || '').trim(),
    tutorialTone: String(row.tutorialTone || row.tutorial_tone || 'blue').trim() || 'blue',
    status: Number(row.status ?? 1),
    updatedAt: Number(row.updatedAt ?? row.updated_at ?? 0),
})

const {
    searchForm,
    resetSearchForm,
    currentPage,
    limit,
    total,
    tableData,
    getData,
} = useInitTable({
    searchForm: {
        title: '',
        mode: 'category',
    },
    getList: getContentPageList,
    success: (res) => {
        total.value = Number(res.totalCount || 0)
        const pageList = Array.isArray(res.list) ? res.list : []
        tableData.value = pageList.map((item) => ({
            ...normalizeContentPage(item),
            tutorialCount: null,
            tutorialCountError: false,
            tutorialCountLoading: true,
            statusLoading: false,
        }))
        loadCategoryTutorialCounts(tableData.value)
    },
    deleteData: deleteContentPage,
    updateStatus: updateContentPageStatus,
})

const reloadCurrentPage = (page = currentPage.value) => getData(page)

const handleCategoryDelete = async (id) => {
    const pageToKeep = currentPage.value
    const pageAfterDelete = Math.min(
        pageToKeep,
        Math.max(1, Math.ceil((total.value - 1) / limit.value)),
    )
    showFullLoading()

    try {
        await deleteContentPage([id])
        toast('删除成功')
        reloadCurrentPage(pageAfterDelete)
    } catch {
        toast('删除失败，请稍后重试', 'error')
    } finally {
        hideFullLoading()
    }
}

const handleCategoryStatusChange = async (status, row) => {
    row.statusLoading = true

    try {
        await updateContentPageStatus(row.id, status)
        row.status = status
        toast('修改状态成功')
        reloadCurrentPage()
    } catch {
        toast('状态修改失败，请稍后重试', 'error')
    } finally {
        row.statusLoading = false
    }
}

const {
    drawerTitle,
    form,
    formRef,
    rules,
    formDrawerRef,
    handleSubmit,
    handleCreate: openCreateDrawer,
    handleEdit: openEditDrawer,
} = useInitForm({
    form: {
        id: null,
        title: '',
        titleTag: '',
        tutorialTone: 'blue',
        status: 1,
        pageType: 'tutorial_category',
    },
    rules: {
        title: [{ required: true, message: '请输入教程分类名称', trigger: 'blur' }],
    },
    getData: reloadCurrentPage,
    beforeSubmit: (payload) => {
        payload.title = String(payload.title || '').trim()
        payload.titleTag = String(payload.titleTag || '').trim()
        payload.titleTagImageUrl = String(payload.titleTagImageUrl || '').trim()
        payload.tutorialTone = String(payload.tutorialTone || 'blue').trim() || 'blue'
        payload.coverImageUrl = ''
        payload.bodyText = ''
        payload.contentHtml = ''
        payload.showInHot = 0
        payload.tutorialCategoryId = 0
        payload.pageType = 'tutorial_category'
    },
    createData: createContentPage,
    updateData: updateContentPage,
})

const handleCreate = () => {
    openCreateDrawer()
}

const handleEdit = (row) => {
    openEditDrawer(normalizeContentPage(row))
}

const goCover = () => {
    router.push('/carousel-directory/cover')
}
</script>
