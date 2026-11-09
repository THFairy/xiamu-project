<!-- 用途：教程分类与教程正文编辑页面，维护教程末尾的商品分类跳转。 -->
<template>
    <el-card shadow="never" class="border-0">
        <search-header :model="searchForm" permission="searchContentPage,GET" @search="getData(1)" @reset="resetSearchForm">
            <search-header-item label="教程标题" prop="title">
                <el-input v-model="searchForm.title" placeholder="请输入教程标题关键词" clearable />
            </search-header-item>

            <search-header-item label="所属分类" prop="tutorialCategoryId">
                <el-select
                    v-model="searchForm.tutorialCategoryId"
                    placeholder="请选择教程分类"
                    clearable
                    filterable
                    class="w-60"
                    :loading="categoryLoading"
                >
                    <el-option
                        v-for="item in tutorialCategoryOptions"
                        :key="item.id"
                        :label="item.title"
                        :value="item.id"
                    />
                </el-select>
            </search-header-item>
        </search-header>

        <list-header
            :permissions="{
                create: 'createContentPage,POST',
                refresh: 'getContentPageList,GET'
            }"
            @create="handleCreate"
            @refresh="handleRefresh"
        />

        <el-table id="list-table" :data="tableData" stripe>
            <el-table-column label="教程标题" min-width="220" prop="title" />

            <el-table-column label="所属分类" min-width="180">
                <template #default="{ row }">
                    <span>{{ row.tutorialCategoryTitle || '未加入分类' }}</span>
                </template>
            </el-table-column>

            <el-table-column label="标题标签" min-width="180">
                <template #default="{ row }">
                    <div class="flex items-center gap-2">
                        <img
                            v-if="row.titleTagImageUrl"
                            :src="row.titleTagImageUrl"
                            style="width: 32px; height: 32px"
                            class="rounded border"
                            alt="教程标题标签图片"
                        />
                        <span>{{ row.titleTag || '-' }}</span>
                    </div>
                </template>
            </el-table-column>

            <el-table-column label="热门问题" width="120" align="center">
                <template #default="{ row }">
                    <el-tag :type="row.showInHot ? 'success' : 'info'" effect="plain">
                        {{ row.showInHot ? '已加入' : '未加入' }}
                    </el-tag>
                </template>
            </el-table-column>

            <el-table-column label="教程内容" min-width="260">
                <template #default="{ row }">
                    <div class="line-clamp-2 text-gray-600">{{ getContentSummary(row) }}</div>
                    <el-button type="text" size="small" class="mt-1" @click="openPageDetail(row)">查看详情</el-button>
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
                        @change="handleStatusChange($event, row)"
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
                        title="确认删除这条教程吗？"
                        confirm-button-text="确认"
                        cancel-button-text="取消"
                        @confirm="handleDelete(row.id)"
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

        <form-drawer
            ref="formDrawerRef"
            :title="drawerTitle"
            :size="editorDrawerSize"
            destroyOnClose
            @submit="handleSubmit"
        >
            <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="default">
                <el-form-item label="教程标题" prop="title">
                    <el-input v-model="form.title" placeholder="请输入教程标题" />
                </el-form-item>

                <el-form-item label="所属分类" prop="tutorialCategoryId">
                    <el-select
                        v-model="form.tutorialCategoryId"
                        placeholder="请选择教程分类"
                        filterable
                        class="w-full"
                        :loading="categoryLoading"
                    >
                        <el-option
                            v-for="item in tutorialCategoryOptions"
                            :key="item.id"
                            :label="item.title"
                            :value="item.id"
                        />
                    </el-select>
                    <small class="mt-2 flex text-gray-400">教程编辑完成后，可加入到对应的教程分类中。</small>
                </el-form-item>

                <el-form-item label="标题标签" prop="titleTag">
                    <div class="w-full">
                        <el-input v-model="form.titleTag" placeholder="请输入标题左侧标签文字，例如：回收、主机" />
                        <div class="mt-4">
                            <choose-image v-model="form.titleTagImageUrl" :limit="1" />
                        </div>
                        <small class="mt-2 flex text-gray-400">可同时填写图片和文字，展示在热门问题标题左侧。</small>
                    </div>
                </el-form-item>

                <el-form-item label="加入热门" prop="showInHot">
                    <div class="flex items-center gap-3">
                        <el-switch
                            v-model="form.showInHot"
                            :active-value="1"
                            :inactive-value="0"
                            inline-prompt
                            inactive-text="关闭"
                        />
                        <span class="text-sm text-gray-400">开启后会显示在小程序“热门问题”，关闭后不显示。</span>
                    </div>
                </el-form-item>

                <el-form-item label="教程内容" prop="contentHtml">
                    <div class="w-full">
                        <div class="tutorial-page-toolbar">
                            <el-button
                                v-for="(page, index) in form.tutorialPages"
                                :key="page.editorKey || page.pageNumber || index"
                                size="small"
                                :type="activePageIndex === index ? 'primary' : 'default'"
                                @click="selectFormPage(index)"
                            >第{{ index + 1 }}页</el-button>
                            <el-button size="small" type="success" plain @click="addFormPage">新增分页</el-button>
                            <el-button
                                size="small"
                                type="danger"
                                plain
                                :disabled="!form.tutorialPages || form.tutorialPages.length <= 1"
                                @click="removeFormPage"
                            >删除当前页</el-button>
                        </div>
                        <div class="tutorial-editor-compact">
                            <editor v-model="activeFormPage.contentHtml" />
                        </div>
                        <small class="mt-2 flex text-gray-400">每个教程可以增加多个分页，点击“查看详情”可单独编辑每一页正文。</small>
                    </div>
                </el-form-item>

                <el-form-item label="末尾产品分类" prop="endLinkCategoryKey">
                    <div class="w-full">
                        <el-select
                            v-model="form.endLinkCategoryKey"
                            placeholder="请选择教程末尾要展示的产品分类"
                            clearable
                            filterable
                            class="w-full"
                            :loading="categoryLoading"
                        >
                            <el-option
                                v-for="item in saleCategoryOptions"
                                :key="item.key"
                                :label="item.sectionName ? `${item.sectionName} / ${item.name}` : item.name"
                                :value="item.key"
                            />
                        </el-select>
                        <el-input
                            v-model="form.endLinkText"
                            class="mt-3"
                            maxlength="32"
                            show-word-limit
                            placeholder="例如：立即下单"
                        />
                        <small class="mt-2 flex text-gray-400">用户看完教程后点击按钮，将进入该分类并展示该分类下的销售商品。</small>
                    </div>
                </el-form-item>

                <el-form-item label="状态" prop="status">
                    <el-radio-group v-model="form.status">
                        <el-radio :label="1" border>显示</el-radio>
                        <el-radio :label="0" border>隐藏</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-drawer>

        <el-dialog v-model="pageDetailVisible" title="教程内容详情" width="min(920px, 92vw)" destroy-on-close>
            <div v-if="detailRow" class="tutorial-detail-dialog">
                <div class="tutorial-detail-header">
                    <span>{{ detailRow.title }}</span>
                    <div class="tutorial-detail-actions">
                        <el-button type="primary" plain size="small" @click="addDetailPage">新增分页</el-button>
                        <el-button
                            type="danger"
                            plain
                            size="small"
                            :disabled="detailPages.length <= 1"
                            @click="removeDetailPage"
                        >删除当前页</el-button>
                    </div>
                </div>
                <el-tabs v-model="detailPageKey" type="card">
                    <el-tab-pane v-for="(page, index) in detailPages" :key="page.editorKey || page.pageNumber || index" :label="`第${index + 1}页`" :name="String(index)">
                        <div class="tutorial-detail-page-tip">正在编辑第 {{ index + 1 }} 页正文</div>
                        <div class="tutorial-editor-compact tutorial-detail-editor">
                            <editor v-model="page.contentHtml" />
                        </div>
                    </el-tab-pane>
                </el-tabs>
            </div>
            <template #footer>
                <el-button @click="pageDetailVisible = false">取消</el-button>
                <el-button type="primary" :loading="detailSaving" @click="savePageDetail">保存本页内容</el-button>
            </template>
        </el-dialog>
    </el-card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { ElMessageBox } from 'element-plus'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import FormDrawer from '~/components/FormDrawer.vue'
import ChooseImage from '~/components/ChooseImage.vue'
import Editor from '~/components/Editor.vue'
import { useInitForm, useInitTable } from '~/composables/useCommon'
import { formatTimestampValue, toast } from '~/composables/util'
import { getTutorialEndLinkCategoryOptions } from '~/api/category'
import {
    createContentPage,
    deleteContentPage,
    getContentPageList,
    updateContentPage,
    updateContentPageStatus,
} from '~/api/content_page'

const store = useStore()
const editorDrawerSize = computed(() => `calc(100% - ${store.state.asideWidth})`)

const stripHtml = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const tutorialCategoryOptions = ref([])
const categoryLoading = ref(false)
const saleCategoryOptions = ref([])
const activePageIndex = ref(0)
const pageDetailVisible = ref(false)
const detailRow = ref(null)
const detailPages = ref([])
const detailPageKey = ref('0')
const detailSaving = ref(false)
let tutorialPageKeySeed = 0

const createTutorialPageKey = () => `tutorial-page-${++tutorialPageKeySeed}`

const renumberTutorialPages = (pages) => {
    pages.forEach((page, index) => {
        page.pageNumber = index + 1
        if (!page.editorKey) page.editorKey = createTutorialPageKey()
    })
    return pages
}

const tutorialCategoryValidator = (_rule, value, callback) => {
    if (Number(value || 0) <= 0) {
        callback(new Error('请选择所属教程分类'))
        return
    }

    callback()
}

const normalizeContentPage = (row = {}) => ({
    ...row,
    title: String(row.title || '').trim(),
    titleTag: String(row.titleTag || row.title_tag || '').trim(),
    titleTagImageUrl: String(row.titleTagImageUrl || row.title_tag_image || '').trim(),
    showInHot: Number(row.showInHot ?? row.show_in_hot ?? 0),
    tutorialCategoryId: Number(row.tutorialCategoryId ?? row.tutorial_category_id ?? 0),
    tutorialCategoryTitle: String(row.tutorialCategoryTitle || row.tutorial_category_title || '').trim(),
    bodyText: String(row.bodyText || row.body_text || stripHtml(row.contentHtml || row.content_html || '')).trim(),
    contentHtml: String(row.contentHtml || row.content_html || '').trim(),
    tutorialPages: (Array.isArray(row.tutorialPages) ? row.tutorialPages : (Array.isArray(row.tutorial_pages) ? row.tutorial_pages : [{ contentHtml: String(row.contentHtml || row.content_html || '') }])).map((page, index) => ({
        pageNumber: index + 1,
        editorKey: page.editorKey || page.editor_key || createTutorialPageKey(),
        contentHtml: String(page.contentHtml || page.content_html || '').trim(),
        coverImages: Array.isArray(page.coverImages || page.cover_images) ? [...(page.coverImages || page.cover_images)] : [],
    })),
    endLinkProductId: Number(row.endLinkProductId ?? row.end_link_product_id ?? 0),
    endLinkCategoryKey: String(row.endLinkCategoryKey || row.end_link_category_key || '').trim(),
    endLinkText: String(row.endLinkText || row.end_link_text || '立即下单').trim() || '立即下单',
    status: Number(row.status ?? 1),
    updatedAt: Number(row.updatedAt ?? row.updated_at ?? 0),
})

const loadTutorialCategoryOptions = async () => {
    categoryLoading.value = true

    try {
        const res = await getContentPageList(1, { mode: 'category', limit: 200 })
        const pageList = Array.isArray(res.list) ? res.list : []
        tutorialCategoryOptions.value = pageList.map((item) => ({
            id: Number(item.id || 0),
            title: String(item.title || '').trim(),
        })).filter((item) => item.id > 0 && item.title)
    } finally {
        categoryLoading.value = false
    }
}

const loadSaleCategoryOptions = async () => {
    try {
        const list = await getTutorialEndLinkCategoryOptions()
        saleCategoryOptions.value = (Array.isArray(list) ? list : []).filter((item) => item && item.key && item.name)
    } catch (_error) {
        saleCategoryOptions.value = []
    }
}

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
        title: '',
        mode: 'article',
        tutorialCategoryId: '',
    },
    getList: getContentPageList,
    success: (res) => {
        total.value = Number(res.totalCount || 0)
        const pageList = Array.isArray(res.list) ? res.list : []
        tableData.value = pageList.map((item) => ({
            ...normalizeContentPage(item),
            statusLoading: false,
        }))
    },
    deleteData: deleteContentPage,
    updateStatus: updateContentPageStatus,
})

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
        titleTagImageUrl: '',
        tutorialCategoryId: 0,
        showInHot: 0,
        contentHtml: '',
        tutorialPages: [{ pageNumber: 1, editorKey: createTutorialPageKey(), contentHtml: '', coverImages: [] }],
        endLinkProductId: 0,
        endLinkCategoryKey: '',
        endLinkText: '立即下单',
        status: 1,
        pageType: 'tutorial_article',
    },
    rules: {
        title: [{ required: true, message: '请输入教程标题', trigger: 'blur' }],
        tutorialCategoryId: [{ validator: tutorialCategoryValidator, trigger: 'change' }],
    },
    getData,
    beforeSubmit: (payload) => {
        payload.title = String(payload.title || '').trim()
        payload.titleTag = String(payload.titleTag || '').trim()
        payload.titleTagImageUrl = String(payload.titleTagImageUrl || '').trim()
        payload.tutorialCategoryId = Math.max(0, Number(payload.tutorialCategoryId || 0))
        payload.showInHot = Number(payload.showInHot ?? 0)
        payload.tutorialPages = (Array.isArray(payload.tutorialPages) ? payload.tutorialPages : []).map((page, index) => ({
            pageNumber: index + 1,
            contentHtml: String(page.contentHtml || '').trim(),
            coverImages: Array.isArray(page.coverImages) ? page.coverImages : [],
        }))
        payload.endLinkProductId = Math.max(0, Number(payload.endLinkProductId || 0))
        payload.endLinkCategoryKey = String(payload.endLinkCategoryKey || '').trim()
        payload.endLinkText = String(payload.endLinkText || '').trim() || '立即下单'
        payload.pageType = 'tutorial_article'

        // 教程正文编辑器绑定的是分页内容，保存时以第一页的最新内容同步旧版正文字段，避免旧正文覆盖新内容。
        if (!payload.tutorialPages.length) {
            payload.tutorialPages = [{ pageNumber: 1, contentHtml: '', coverImages: [] }]
        }
        payload.contentHtml = String(payload.tutorialPages[0].contentHtml || '').trim()

        if (!payload.tutorialPages[0].contentHtml && payload.contentHtml) {
            payload.tutorialPages[0].contentHtml = payload.contentHtml
        }
    },
    createData: createContentPage,
    updateData: updateContentPage,
})

const getContentSummary = (row) => {
    const summary = String(row.bodyText || stripHtml(row.contentHtml || '')).trim()
    if (!summary) {
        return '暂无内容'
    }

    return summary.length > 72 ? `${summary.slice(0, 72)}...` : summary
}

const activeFormPage = computed(() => {
    const pages = Array.isArray(form.tutorialPages) && form.tutorialPages.length ? form.tutorialPages : [{ pageNumber: 1, contentHtml: '' }]
    if (!Array.isArray(form.tutorialPages) || !form.tutorialPages.length) {
        form.tutorialPages = pages
    }
    return pages[Math.min(activePageIndex.value, pages.length - 1)]
})

const selectFormPage = (index) => {
    activePageIndex.value = Math.max(0, Number(index || 0))
}

const addFormPage = () => {
    if (!Array.isArray(form.tutorialPages)) form.tutorialPages = []
    form.tutorialPages.push({ pageNumber: form.tutorialPages.length + 1, editorKey: createTutorialPageKey(), contentHtml: '', coverImages: [] })
    renumberTutorialPages(form.tutorialPages)
    activePageIndex.value = form.tutorialPages.length - 1
}

const removeFormPage = async () => {
    if (!Array.isArray(form.tutorialPages) || form.tutorialPages.length <= 1) {
        toast('教程至少需要保留一页', 'warning')
        return
    }

    const index = Math.min(Math.max(Number(activePageIndex.value) || 0, 0), form.tutorialPages.length - 1)
    try {
        await ElMessageBox.confirm(
            `确认删除第 ${index + 1} 页吗？删除后请点击“提交”保存。`,
            '删除分页',
            { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
        )
    } catch (_error) {
        return
    }

    form.tutorialPages.splice(index, 1)
    renumberTutorialPages(form.tutorialPages)
    activePageIndex.value = Math.min(index, form.tutorialPages.length - 1)
}

const openPageDetail = (row) => {
    detailRow.value = normalizeContentPage(row)
    detailPages.value = detailRow.value.tutorialPages.map((page) => ({ ...page }))
    if (!detailPages.value.length) detailPages.value = [{ pageNumber: 1, editorKey: createTutorialPageKey(), contentHtml: '', coverImages: [] }]
    renumberTutorialPages(detailPages.value)
    detailPageKey.value = '0'
    pageDetailVisible.value = true
}

const addDetailPage = () => {
    detailPages.value.push({ pageNumber: detailPages.value.length + 1, editorKey: createTutorialPageKey(), contentHtml: '', coverImages: [] })
    renumberTutorialPages(detailPages.value)
    detailPageKey.value = String(detailPages.value.length - 1)
}

const removeDetailPage = async () => {
    if (detailPages.value.length <= 1) {
        toast('教程至少需要保留一页', 'warning')
        return
    }

    const index = Math.min(
        Math.max(Number(detailPageKey.value) || 0, 0),
        detailPages.value.length - 1,
    )
    try {
        await ElMessageBox.confirm(
            `确认删除第 ${index + 1} 页吗？删除后请点击“保存本页内容”。`,
            '删除分页',
            { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
        )
    } catch (_error) {
        return
    }

    detailPages.value.splice(index, 1)
    renumberTutorialPages(detailPages.value)
    detailPageKey.value = String(Math.min(index, detailPages.value.length - 1))
}

const savePageDetail = async () => {
    if (!detailRow.value || detailSaving.value) return
    detailSaving.value = true
    try {
        const saved = await updateContentPage(detailRow.value.id, {
            tutorialPages: detailPages.value.map((page, index) => ({
                pageNumber: index + 1,
                contentHtml: String(page.contentHtml || '').trim(),
                coverImages: Array.isArray(page.coverImages) ? page.coverImages : [],
            })),
        })
        toast('教程分页内容已保存')
        pageDetailVisible.value = false
        if (saved) {
            const savedRow = normalizeContentPage(saved)
            const tableRow = tableData.value.find((item) => Number(item.id) === Number(savedRow.id))
            if (tableRow) Object.assign(tableRow, savedRow)
        }
    } finally {
        detailSaving.value = false
    }
}

const handleRefresh = async () => {
    await loadTutorialCategoryOptions()
    getData()
}

const handleCreate = async () => {
    await loadTutorialCategoryOptions()

    if (!tutorialCategoryOptions.value.length) {
        toast('请先在“教程分类”中创建分类，再新增教程', 'warning')
        return
    }

    openCreateDrawer()
    activePageIndex.value = 0
}

const handleEdit = async (row) => {
    await loadTutorialCategoryOptions()
    openEditDrawer(normalizeContentPage(row))
    activePageIndex.value = 0
}

onMounted(() => {
    loadTutorialCategoryOptions()
    loadSaleCategoryOptions()
})
</script>

<style scoped>
.tutorial-page-toolbar,
.tutorial-detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
}

.tutorial-detail-header {
    justify-content: space-between;
    font-weight: 600;
}

.tutorial-detail-actions {
    display: flex;
    gap: 8px;
}

.tutorial-editor-compact :deep(.editor-surface) {
    min-height: 220px;
    max-height: 360px;
}

.tutorial-detail-editor :deep(.editor-surface) {
    min-height: 300px;
}

.tutorial-detail-page-tip {
    margin-bottom: 10px;
    color: #909399;
    font-size: 13px;
}
</style>
