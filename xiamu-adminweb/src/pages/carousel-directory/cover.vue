<template>
    <el-card v-loading="loading" shadow="never" class="border-0">
        <template #header>
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-base font-semibold text-gray-800">封面管理</div>
                    <div class="mt-1 text-xs text-gray-400">这里编辑微信小程序首页第一张轮播图的标题和封面。</div>
                </div>
                <el-button @click="loadData">刷新</el-button>
            </div>
        </template>

        <el-alert
            title="此页只管理首页第一张轮播图，保存后小程序首页会自动同步最新样式。"
            type="info"
            :closable="false"
            show-icon
            class="mb-5"
        />

        <div class="grid gap-5" :class="showPreview ? 'lg:grid-cols-[1fr_360px]' : 'lg:grid-cols-1'">
            <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="default">
                <el-form-item label="封面标题" prop="pageTitle">
                    <el-input v-model="form.pageTitle" placeholder="请输入封面标题" maxlength="20" show-word-limit />
                </el-form-item>

                <el-form-item label="封面图片" prop="image">
                    <div class="w-full">
                        <choose-image v-model="form.image" :limit="1" />
                        <small class="mt-2 flex text-gray-400">建议上传横版大图，作为小程序首页第一张轮播封面。</small>
                    </div>
                </el-form-item>

                <el-form-item label="展示文案" prop="content">
                    <el-input
                        v-model="form.content"
                        type="textarea"
                        :rows="5"
                        placeholder="请输入轮播说明，例如：点击进入教程分类和具体内容"
                    />
                </el-form-item>

                <el-form-item label="状态" prop="status">
                    <el-radio-group v-model="form.status">
                        <el-radio :label="1" border>显示</el-radio>
                        <el-radio :label="0" border>隐藏</el-radio>
                    </el-radio-group>
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
                    <el-button @click="loadData">重置</el-button>
                </el-form-item>
            </el-form>

            <div v-if="showPreview" class="cover-preview-panel">
                <div class="mb-3 text-sm font-semibold text-gray-800">预览</div>
                <div class="cover-preview-card">
                    <el-image
                        v-if="form.image"
                        class="cover-preview-image"
                        :src="form.image"
                        fit="cover"
                    />
                    <div v-else class="cover-preview-empty"></div>
                    <div class="cover-preview-mask"></div>
                    <div class="cover-preview-copy">
                        <div class="cover-preview-tag">教程专区</div>
                        <div class="cover-preview-title">{{ form.pageTitle || '教程' }}</div>
                        <div class="cover-preview-desc">{{ previewDesc }}</div>
                    </div>
                </div>
            </div>
        </div>
    </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import ChooseImage from '~/components/ChooseImage.vue'
import { formatTimestampValue, toast } from '~/composables/util'
import { getHomepageBannerPrimary, updateHomepageBannerPrimary } from '~/api/homepage_banner'

const formRef = ref()
const loading = ref(false)
const saving = ref(false)
const showPreview = false

const form = reactive({
    id: 0,
    image: '',
    pageTitle: '教程',
    content: '',
    status: 1,
})

const rules = {
    pageTitle: [{ required: true, message: '请输入封面标题', trigger: 'blur' }],
    image: [{ required: true, message: '请上传封面图片', trigger: 'change' }],
}

const previewDesc = computed(() => {
    const text = String(form.content || '').trim()
    if (!text) {
        return '点击查看教程分类和具体内容'
    }

    return text.length > 24 ? `${text.slice(0, 24)}...` : text
})

const normalizeBanner = (row = {}) => ({
    id: Number(row.id || 0),
    image: String(row.image || row.image_url || row.coverImage || row.cover_image || '').trim(),
    pageTitle: String(row.page_title || row.pageTitle || row.title || '教程').trim() || '教程',
    content: String(row.content || row.content_html || row.contentHtml || '').trim(),
    status: Number(row.status ?? 1),
})

const syncForm = (row = {}) => {
    const next = normalizeBanner(row)
    form.id = next.id
    form.image = next.image
    form.pageTitle = next.pageTitle
    form.content = next.content
    form.status = next.status
}

const loadData = async () => {
    loading.value = true

    try {
        const banner = await getHomepageBannerPrimary()
        syncForm(banner || {})
    } finally {
        loading.value = false
    }
}

const handleSubmit = async () => {
    await formRef.value?.validate?.()

    saving.value = true
    try {
        await updateHomepageBannerPrimary({
            image: String(form.image || '').trim(),
            cover_images: form.image ? [String(form.image || '').trim()] : [],
            cover_image: form.image ? [String(form.image || '').trim()] : [],
            page_title: String(form.pageTitle || '').trim(),
            content: String(form.content || '').trim(),
            status: Number(form.status || 0),
        })
        toast('保存成功')
        await loadData()
    } finally {
        saving.value = false
    }
}

onMounted(() => {
    loadData()
})
</script>

<style scoped>
.cover-preview-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.cover-preview-card {
    position: relative;
    height: 360px;
    border-radius: 24px;
    overflow: hidden;
    background: linear-gradient(135deg, #111827 0%, #dc2626 48%, #f97316 100%);
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
}

.cover-preview-image,
.cover-preview-empty,
.cover-preview-mask {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.cover-preview-image {
    z-index: 1;
}

.cover-preview-empty {
    z-index: 0;
    background: radial-gradient(circle at 75% 30%, rgba(255, 255, 255, 0.16) 0, rgba(255, 255, 255, 0.16) 18%, transparent 19%),
        radial-gradient(circle at 85% 78%, rgba(255, 255, 255, 0.12) 0, rgba(255, 255, 255, 0.12) 26%, transparent 27%);
}

.cover-preview-mask {
    z-index: 2;
    background: linear-gradient(135deg, rgba(17, 24, 39, 0.34) 0%, rgba(239, 68, 68, 0.2) 48%, rgba(249, 115, 22, 0.18) 100%);
}

.cover-preview-copy {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 28px;
    color: #ffffff;
}

.cover-preview-tag {
    align-self: flex-start;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    font-size: 12px;
    letter-spacing: 1px;
}

.cover-preview-title {
    margin-top: auto;
    font-size: 48px;
    font-weight: 800;
    line-height: 1.05;
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
}

.cover-preview-desc {
    margin-top: 12px;
    max-width: 85%;
    font-size: 16px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.92);
}
</style>
