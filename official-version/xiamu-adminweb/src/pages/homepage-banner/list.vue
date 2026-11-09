<!-- 用途：首页轮播管理列表及轮播内容编辑页面。 -->
<template>
    <el-card shadow="never" class="border-0">
        <search-header :model="searchForm" permission="searchHomepageBanner,GET" @search="getData(1)" @reset="resetSearchForm">
            <search-header-item label="标题" prop="title">
                <el-input v-model="searchForm.title" placeholder="请输入占位页标题" clearable />
            </search-header-item>
        </search-header>

        <list-header
            :permissions="{
                refresh: 'getHomepageBannerList,GET'
            }"
            @refresh="getData"
        >
            <el-tooltip
                v-if="bannerLimitReached"
                effect="dark"
                content="首页轮播最多只能编辑 8 张（不含第一张）"
                placement="top"
            >
                <span class="inline-flex">
                    <el-button v-permission="['createHomepageBanner,POST']" type="primary" size="small" disabled>
                        新增
                    </el-button>
                </span>
            </el-tooltip>
            <el-button
                v-else
                v-permission="['createHomepageBanner,POST']"
                type="primary"
                size="small"
                @click="handleCreate"
            >
                新增
            </el-button>
        </list-header>

        <el-table id="list-table" :data="tableData" stripe>
            <el-table-column label="序号" width="80" align="center">
                <template #default="{ $index }">{{ getDisplayIndex($index) }}</template>
            </el-table-column>

            <el-table-column label="轮播图片" width="180">
                <template #default="{ row }">
                    <img
                        :src="row.image"
                        style="width: 140px; height: 78px"
                        class="rounded-lg border"
                        alt="首页轮播图片"
                    />
                </template>
            </el-table-column>

            <el-table-column label="占位页标题" min-width="220">
                <template #default="{ row }">
                    <div class="leading-6">
                        <div>{{ row.target_page_title || row.page_title || '-' }}</div>
                        <small v-if="row.is_tutorial_link && row.target_page_id > 0" class="text-xs text-sky-500">已关联教程</small>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="标题显示" width="110" align="center">
                <template #default="{ row }">
                    <span :class="row.hide_title ? 'text-gray-400' : 'text-emerald-500'">
                        {{ row.hide_title ? '已隐藏' : '显示' }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="排序" width="100" align="center" prop="order" />

            <el-table-column label="更新时间" width="220" align="center">
                <template #default="{ row }">{{ formatTimestampValue(row.update_time) || '-' }}</template>
            </el-table-column>

            <el-table-column
                v-permission="['updateHomepageBannerStatus,POST']"
                label="状态"
                width="120"
                align="center"
            >
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
                v-permission="['updateHomepageBanner,POST', 'deleteHomepageBanner,POST']"
                label="操作"
                width="180"
                align="center"
                fixed="right"
            >
                <template #default="{ row }">
                    <el-button
                        v-permission="['updateHomepageBanner,POST']"
                        type="text"
                        size="small"
                        @click="handleEdit(row)"
                    >
                        修改
                    </el-button>

                    <el-popconfirm
                        title="确认删除这条首页轮播吗？"
                        confirm-button-text="确认"
                        cancel-button-text="取消"
                        @confirm="handleDelete(row.id)"
                    >
                        <template #reference>
                            <el-button v-permission="['deleteHomepageBanner,POST']" type="text" size="small">
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
            size="62%"
            destroyOnClose
            @submit="handleSubmit"
        >
            <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="default">
                <el-form-item label="轮播图片" prop="image">
                    <div class="w-full">
                        <choose-image v-model="form.image" :limit="1" />
                        <small class="mt-2 flex text-gray-400">轮播主图保持单图上传，用于首页轮播展示。</small>
                    </div>
                </el-form-item>

                <el-form-item label="是否关联教程" prop="is_tutorial_link">
                    <el-switch
                        v-model="form.is_tutorial_link"
                        :active-value="1"
                        :inactive-value="0"
                        @change="handleTutorialLinkChange"
                    />
                </el-form-item>

                <el-form-item label="是否启用正文" prop="content_enabled">
                    <el-switch
                        v-model="form.content_enabled"
                        :active-value="1"
                        :inactive-value="0"
                    />
                </el-form-item>

                <el-form-item v-if="Number(form.is_tutorial_link || 0) === 1" label="关联教程" prop="target_page_id">
                    <div class="w-full">
                        <el-select
                            v-model="form.target_page_id"
                            placeholder="请选择已有教程（不选则使用下方自定义正文）"
                            filterable
                            clearable
                            class="w-full"
                            :loading="tutorialArticleLoading"
                        >
                            <el-option
                                v-for="item in tutorialArticleOptions"
                                :key="item.id"
                                :label="item.title"
                                :value="item.id"
                            />
                        </el-select>
                        <small class="mt-2 flex text-gray-400">下拉选择已有教程后，轮播点击将直接进入对应教程详情。</small>
                    </div>
                </el-form-item>

                <el-form-item label="是否隐藏标题" prop="hide_title">
                    <el-switch v-model="form.hide_title" :active-value="1" :inactive-value="0" />
                </el-form-item>

                <el-form-item label="排序" prop="order">
                    <el-input v-model="form.order" type="number" placeholder="数字越小越靠前" style="width: 220px;" />
                </el-form-item>

                <el-form-item label="状态" prop="status">
                    <el-radio-group v-model="form.status">
                        <el-radio :label="1" border>显示</el-radio>
                        <el-radio :label="0" border>隐藏</el-radio>
                    </el-radio-group>
                </el-form-item>

                <el-form-item v-if="Number(form.content_enabled || 0) === 1 && Number(form.is_tutorial_link || 0) !== 1" label="占位页标题" prop="page_title">
                    <el-input v-model="form.page_title" placeholder="请输入占位页标题（选填）" />
                </el-form-item>

                <el-form-item v-if="Number(form.content_enabled || 0) === 1 && Number(form.is_tutorial_link || 0) !== 1" label="富文本正文" prop="content">
                    <div class="w-full">
                        <editor v-model="form.content" />
                        <small class="mt-2 flex text-gray-400">正文区域现在可直接编辑，也可以通过工具栏把图片按光标位置插入到正文里。</small>
                    </div>
                </el-form-item>

                <el-form-item v-else label="教程说明">
                    <div class="w-full">
                        <div class="rounded border border-sky-100 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-700">
                            当前轮播将跳转到教程“{{ selectedTutorialArticleTitle }}”，无需单独编辑占位页标题和富文本正文。
                        </div>
                    </div>
                </el-form-item>
            </el-form>
        </form-drawer>
    </el-card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import FormDrawer from '~/components/FormDrawer.vue'
import ChooseImage from '~/components/ChooseImage.vue'
import Editor from '~/components/Editor.vue'
import { getContentPageList } from '~/api/content_page'
import { useInitForm, useInitTable } from '~/composables/useCommon'
import { formatTimestampValue, toast } from '~/composables/util'
import {
    createHomepageBanner,
    deleteHomepageBanner,
    getHomepageBannerList,
    updateHomepageBanner,
    updateHomepageBannerStatus,
} from '~/api/homepage_banner'

const MAX_HOMEPAGE_BANNERS = 8
const tutorialArticleOptions = ref([])
const tutorialArticleLoading = ref(false)

const normalizeCoverImages = (value) => {
    if (Array.isArray(value)) {
        return value.filter(Boolean)
    }

    if (typeof value === 'string' && value) {
        const normalized = value.trim()
        if (!normalized) {
            return []
        }

        if (normalized.startsWith('[')) {
            try {
                const parsed = JSON.parse(normalized)
                return Array.isArray(parsed) ? parsed.filter(Boolean) : []
            } catch (_error) {
                return normalized.split(',').map((item) => item.trim()).filter(Boolean)
            }
        }

        return normalized.split(',').map((item) => item.trim()).filter(Boolean)
    }

    return []
}

const normalizeBannerForm = (row = {}) => ({
    ...row,
    image: row.image || '',
    cover_images: normalizeCoverImages(row.cover_images ?? row.coverImages ?? row.cover_image ?? row.coverImage),
    page_title: row.page_title || '',
    is_tutorial_link: Number(row.is_tutorial_link ?? row.isTutorialLink ?? (Number(row.target_page_id ?? row.targetPageId ?? 0) > 0 ? 1 : 0)) === 1 ? 1 : 0,
    content_enabled: Number(row.content_enabled ?? row.contentEnabled ?? 1) === 1 ? 1 : 0,
    target_page_id: Number(row.target_page_id ?? row.targetPageId ?? 0) > 0 ? Number(row.target_page_id ?? row.targetPageId ?? 0) : null,
    target_page_title: String(row.target_page_title || row.targetPageTitle || '').trim(),
    hide_title: Number(row.hide_title ?? row.hideTitle ?? 0) === 1 ? 1 : 0,
    content: row.content || '',
    order: Number(row.order ?? 50),
    status: Number(row.status ?? 1),
})

const buildHomepageBannerPayload = (value = {}) => {
    const targetPageId = Number(value.target_page_id || 0)
    const tutorialLinkEnabled = targetPageId > 0 || value.is_tutorial_link === true || Number(value.is_tutorial_link || 0) === 1

    return {
        image: String(value.image || '').trim(),
        cover_images: normalizeCoverImages(value.cover_images),
        cover_image: normalizeCoverImages(value.cover_images),
        is_tutorial_link: tutorialLinkEnabled ? 1 : 0,
        target_page_id: tutorialLinkEnabled && targetPageId > 0 ? targetPageId : null,
        content_enabled: Number(value.content_enabled || 0) === 1 ? 1 : 0,
        hide_title: Number(value.hide_title || 0) === 1 ? 1 : 0,
        page_title: String(value.page_title || '').trim(),
        content: String(value.content || ''),
        order: Math.max(2, Number(value.order || 50)),
        status: Number(value.status || 0) === 1 ? 1 : 0,
    }
}

const loadTutorialArticleOptions = async () => {
    tutorialArticleLoading.value = true

    try {
        const res = await getContentPageList(1, { mode: 'article', limit: 200 })
        const pageList = Array.isArray(res.list) ? res.list : []
        tutorialArticleOptions.value = pageList.map((item) => ({
            id: Number(item.id || 0),
            title: String(item.title || '').trim(),
        })).filter((item) => item.id > 0 && item.title)
    } finally {
        tutorialArticleLoading.value = false
    }
}

const ensureTutorialArticleOption = (row = {}) => {
    const targetPageId = Number(row.target_page_id ?? row.targetPageId ?? 0)
    const targetPageTitle = String(row.target_page_title || row.targetPageTitle || '').trim()

    if (targetPageId <= 0 || !targetPageTitle) {
        return
    }

    if (tutorialArticleOptions.value.some((item) => item.id === targetPageId)) {
        return
    }

    tutorialArticleOptions.value = [
        { id: targetPageId, title: targetPageTitle },
        ...tutorialArticleOptions.value,
    ]
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
    },
    getList: getHomepageBannerList,
    success: (res) => {
        total.value = Number(res.totalCount || 0)
        tableData.value = res.list.map((item) => ({
            ...normalizeBannerForm(item),
            statusLoading: false,
        }))
    },
    deleteData: deleteHomepageBanner,
    updateStatus: updateHomepageBannerStatus,
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
        image: '',
        cover_images: [],
        is_tutorial_link: 0,
        content_enabled: 0,
        target_page_id: null,
        hide_title: 0,
        page_title: '',
        content: '',
        order: 50,
        status: 1,
    },
    rules: {
        image: [{ required: true, message: '请上传轮播图片', trigger: 'change' }],
    },
    getData,
    beforeSubmit: (payload) => {
        Object.assign(payload, buildHomepageBannerPayload(payload))
    },
    createData: (payload) => createHomepageBanner(buildHomepageBannerPayload(payload)),
    updateData: (id, payload) => updateHomepageBanner(id, buildHomepageBannerPayload(payload)),
})

const bannerLimitReached = computed(() => Number(total.value || 0) >= MAX_HOMEPAGE_BANNERS)
const selectedTutorialArticleTitle = computed(() => {
    const currentId = Number(form.is_tutorial_link || 0) === 1 ? Number(form.target_page_id || 0) : 0
    if (currentId <= 0) {
        return ''
    }

    const matched = tutorialArticleOptions.value.find((item) => item.id === currentId)
    if (matched?.title) {
        return matched.title
    }

    return String(form.target_page_title || '已选教程').trim() || '已选教程'
})

const handleTutorialLinkChange = (value) => {
    if (Number(value || 0) !== 1) {
        form.target_page_id = null
    }
}

const getDisplayIndex = ($index) => ((Number(currentPage.value || 1) - 1) * Number(limit.value || 10)) + $index + 2

const handleCreate = () => {
    if (bannerLimitReached.value) {
        toast(`首页轮播最多只能编辑 ${MAX_HOMEPAGE_BANNERS} 张（不含第一张）`, 'warning')
        return
    }

    openCreateDrawer()
}

const handleEdit = (row) => {
    ensureTutorialArticleOption(row)
    openEditDrawer(normalizeBannerForm(row))
}

onMounted(() => {
    loadTutorialArticleOptions()
})
</script>
