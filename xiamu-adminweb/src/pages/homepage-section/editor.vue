<template>
    <el-card v-loading="loading" shadow="never" class="border-0">
        <template #header>
            <div class="editor-header">
                <div>
                    <div class="text-base font-semibold text-gray-800">专区编辑</div>
                    <div class="mt-1 text-xs text-gray-400">管理微信小程序首页显示的分区和入口。</div>
                </div>
                <div class="editor-header-actions">
                    <el-button :icon="Refresh" @click="loadData">刷新</el-button>
                    <el-button
                        v-permission="['updateHomepageSection,POST']"
                        type="primary"
                        :icon="Plus"
                        @click="addSection"
                    >新增分区</el-button>
                </div>
            </div>
        </template>

        <el-alert
            title="分区和入口将按当前顺序显示在小程序首页；每个入口需关联一个分类大区。"
            type="info"
            :closable="false"
            show-icon
            class="mb-5"
        />

        <el-empty v-if="!form.sections.length" description="暂无分区">
            <el-button
                v-permission="['updateHomepageSection,POST']"
                type="primary"
                :icon="Plus"
                @click="addSection"
            >新增分区</el-button>
        </el-empty>

        <el-form v-else ref="formRef" :model="form" label-width="88px" size="default">
            <section v-for="(section, sectionIndex) in form.sections" :key="section.id" class="section-editor">
                <div class="section-editor-head">
                    <div class="section-sequence">分区 {{ sectionIndex + 1 }}</div>
                    <div class="section-actions">
                        <el-tooltip content="上移分区" placement="top">
                            <el-button circle :icon="ArrowUp" :disabled="sectionIndex === 0" @click="moveItem(form.sections, sectionIndex, -1)" />
                        </el-tooltip>
                        <el-tooltip content="下移分区" placement="top">
                            <el-button circle :icon="ArrowDown" :disabled="sectionIndex === form.sections.length - 1" @click="moveItem(form.sections, sectionIndex, 1)" />
                        </el-tooltip>
                        <el-tooltip content="删除分区" placement="top">
                            <el-button circle plain type="danger" :icon="Delete" @click="removeSection(sectionIndex)" />
                        </el-tooltip>
                    </div>
                </div>

                <el-form-item label="分区标题" :prop="`sections.${sectionIndex}.title`" :rules="sectionTitleRules">
                    <el-input v-model="section.title" maxlength="30" show-word-limit placeholder="请输入小程序首页显示的分区标题" />
                </el-form-item>

                <div class="entry-grid">
                    <article v-for="(item, itemIndex) in section.items" :key="item.id" class="entry-editor">
                        <div class="entry-editor-head">
                            <span>入口 {{ itemIndex + 1 }}</span>
                            <div class="entry-actions">
                                <el-tooltip content="上移入口" placement="top">
                                    <el-button text :icon="ArrowUp" :disabled="itemIndex === 0" @click="moveItem(section.items, itemIndex, -1)" />
                                </el-tooltip>
                                <el-tooltip content="下移入口" placement="top">
                                    <el-button text :icon="ArrowDown" :disabled="itemIndex === section.items.length - 1" @click="moveItem(section.items, itemIndex, 1)" />
                                </el-tooltip>
                                <el-tooltip content="删除入口" placement="top">
                                    <el-button text type="danger" :icon="Delete" @click="removeEntry(section, itemIndex)" />
                                </el-tooltip>
                            </div>
                        </div>

                        <el-form-item label="显示标题" :prop="`sections.${sectionIndex}.items.${itemIndex}.title`" :rules="itemTitleRules">
                            <el-input v-model="item.title" maxlength="20" show-word-limit placeholder="请输入入口标题" />
                        </el-form-item>

                        <el-form-item
                            label="关联分类"
                            :prop="`sections.${sectionIndex}.items.${itemIndex}.categorySectionKey`"
                            :rules="categorySectionRules"
                        >
                            <el-select
                                v-model="item.categorySectionKey"
                                class="w-full"
                                filterable
                                placeholder="请选择点击后进入的分类大区"
                                @change="handleCategorySectionChange(item)"
                            >
                                <el-option
                                    v-for="categorySection in categorySectionOptions"
                                    :key="categorySection.key"
                                    :label="categorySection.name"
                                    :value="categorySection.key"
                                />
                            </el-select>
                        </el-form-item>

                        <el-form-item label="封面图片" :prop="`sections.${sectionIndex}.items.${itemIndex}.coverImage`" :rules="coverImageRules">
                            <div class="w-full">
                                <choose-image v-model="item.coverImage" :limit="1" />
                                <small class="mt-2 flex text-gray-400">建议使用主体清晰的透明底或浅色背景图片。</small>
                            </div>
                        </el-form-item>
                    </article>

                    <button v-permission="['updateHomepageSection,POST']" type="button" class="entry-add-button" @click="addEntry(section)">
                        <el-icon :size="22"><Plus /></el-icon>
                        <span>新增入口</span>
                    </button>
                </div>
            </section>

            <div class="editor-footer">
                <el-button v-permission="['updateHomepageSection,POST']" type="primary" :loading="saving" @click="handleSubmit">保存全部修改</el-button>
                <el-button @click="loadData">重置</el-button>
            </div>
        </el-form>
    </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Delete, Plus, Refresh } from '@element-plus/icons-vue'
import ChooseImage from '~/components/ChooseImage.vue'
import { toast } from '~/composables/util'
import { getHomepageSection, getHomepageSectionCategoryOptions, updateHomepageSection } from '~/api/homepage_section'

const formRef = ref()
const loading = ref(false)
const saving = ref(false)
const categorySectionOptions = ref([])
const form = reactive({ sections: [] })
let localIdSequence = 0

const sectionTitleRules = [
    { required: true, message: '请输入分区标题', trigger: 'blur' },
    { max: 30, message: '分区标题不能超过30个字符', trigger: 'blur' },
]
const itemTitleRules = [
    { required: true, message: '请输入入口标题', trigger: 'blur' },
    { max: 20, message: '入口标题不能超过20个字符', trigger: 'blur' },
]
const categorySectionRules = [{ required: true, message: '请选择关联分类', trigger: 'change' }]
const coverImageRules = [{ required: true, message: '请上传封面图片', trigger: 'change' }]

const createId = (prefix) => {
    localIdSequence += 1
    return `${prefix}-${Date.now().toString(36)}-${localIdSequence.toString(36)}`
}

const normalizeEntry = (item = {}, index = 0) => {
    const legacyKey = String(item.key || '').trim()
    const target = String(item.target || item.action || legacyKey || 'buying').trim()
    const normalizedTarget = target === 'recycling' ? 'recycling' : 'buying'
    return {
        id: String(item.id || '').trim() || createId(`entry-${index + 1}`),
        title: String(item.title || '').trim(),
        coverImage: String(item.coverImage || item.cover_image || '').trim(),
        target: normalizedTarget,
        categorySectionKey: String(item.categorySectionKey || item.category_section_key || '').trim()
            || (normalizedTarget === 'recycling' ? 'recycle' : 'sale'),
    }
}

const normalizeSections = (data = {}) => {
    if (Array.isArray(data.sections)) {
        return data.sections.map((section, sectionIndex) => ({
            id: String(section.id || '').trim() || createId(`section-${sectionIndex + 1}`),
            title: String(section.title || '').trim(),
            items: (Array.isArray(section.items) ? section.items : []).map(normalizeEntry),
        }))
    }

    return [{
        id: 'section-default',
        title: String(data.sectionTitle || '购买&回收专区').trim() || '购买&回收专区',
        items: (Array.isArray(data.items) ? data.items : []).map(normalizeEntry),
    }]
}

const syncForm = (data = {}) => {
    form.sections = normalizeSections(data)
}

const loadData = async () => {
    loading.value = true
    try {
        const [sectionData, categories] = await Promise.all([
            getHomepageSection(),
            getHomepageSectionCategoryOptions(),
        ])
        categorySectionOptions.value = Array.isArray(categories) ? categories : []
        syncForm(sectionData)
        formRef.value?.clearValidate?.()
    } finally {
        loading.value = false
    }
}

const addSection = () => {
    form.sections.push({ id: createId('section'), title: `新分区 ${form.sections.length + 1}`, items: [] })
}

const addEntry = (section) => {
    const defaultSection = categorySectionOptions.value[0]
    section.items.push({
        id: createId('entry'),
        title: '',
        coverImage: '',
        target: defaultSection?.targetScene === 'recycle' ? 'recycling' : 'buying',
        categorySectionKey: defaultSection?.key || 'sale',
    })
}

const handleCategorySectionChange = (item) => {
    const categorySection = categorySectionOptions.value.find((option) => option.key === item.categorySectionKey)
    if (categorySection) item.target = categorySection.targetScene === 'recycle' ? 'recycling' : 'buying'
}

const moveItem = (list, index, offset) => {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= list.length) return
    const [item] = list.splice(index, 1)
    list.splice(nextIndex, 0, item)
}

const confirmDelete = async (message, title) => {
    try {
        await ElMessageBox.confirm(message, title, {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        })
        return true
    } catch (action) {
        if (action === 'cancel' || action === 'close') return false
        throw action
    }
}

const removeSection = async (sectionIndex) => {
    const section = form.sections[sectionIndex]
    const confirmed = await confirmDelete(
        `确定删除分区“${section.title || `分区 ${sectionIndex + 1}`}”及其全部入口吗？`,
        '删除分区',
    )
    if (!confirmed) return
    form.sections.splice(sectionIndex, 1)
}

const removeEntry = async (section, itemIndex) => {
    const item = section.items[itemIndex]
    const confirmed = await confirmDelete(
        `确定删除入口“${item.title || `入口 ${itemIndex + 1}`}”吗？`,
        '删除入口',
    )
    if (!confirmed) return
    section.items.splice(itemIndex, 1)
}

const handleSubmit = async () => {
    await formRef.value?.validate?.()
    saving.value = true
    try {
        const data = await updateHomepageSection({
            sections: form.sections.map((section) => ({
                id: section.id,
                title: section.title.trim(),
                items: section.items.map((item) => ({
                    id: item.id,
                    title: item.title.trim(),
                    coverImage: item.coverImage.trim(),
                    target: item.target,
                    categorySectionKey: item.categorySectionKey,
                })),
            })),
        })
        syncForm(data)
        toast('专区配置已保存并同步到小程序')
    } finally {
        saving.value = false
    }
}

onMounted(loadData)
</script>

<style scoped>
.editor-header,
.editor-header-actions,
.section-editor-head,
.section-actions,
.entry-editor-head,
.entry-actions,
.editor-footer {
    display: flex;
    align-items: center;
}

.editor-header,
.section-editor-head,
.entry-editor-head {
    justify-content: space-between;
}

.editor-header-actions,
.section-actions,
.entry-actions,
.editor-footer {
    gap: 8px;
}

.section-editor {
    margin-bottom: 18px;
    padding: 18px;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    background: #fafafa;
}

.section-editor-head {
    margin-bottom: 18px;
}

.section-sequence {
    color: #303133;
    font-size: 15px;
    font-weight: 600;
}

.entry-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 12px;
}

.entry-editor {
    min-width: 0;
    padding: 16px 16px 2px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    background: #ffffff;
}

.entry-editor-head {
    min-height: 32px;
    margin-bottom: 14px;
    color: #606266;
    font-size: 14px;
    font-weight: 600;
}

.entry-actions :deep(.el-button + .el-button),
.section-actions :deep(.el-button + .el-button) {
    margin-left: 0;
}

.entry-add-button {
    min-height: 220px;
    border: 1px dashed #c0c4cc;
    border-radius: 8px;
    background: #ffffff;
    color: #409eff;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.entry-add-button:hover {
    border-color: #409eff;
    background: #f5f9ff;
}

.editor-footer {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin: 20px -20px -20px;
    padding: 16px 20px;
    border-top: 1px solid #ebeef5;
    background: rgba(255, 255, 255, 0.96);
}

@media (max-width: 900px) {
    .editor-header {
        align-items: flex-start;
        gap: 12px;
    }

    .editor-header-actions {
        flex-shrink: 0;
    }

    .entry-grid {
        grid-template-columns: 1fr;
    }
}
</style>
