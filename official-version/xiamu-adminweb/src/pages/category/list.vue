<!-- 分类管理页面：维护分类分区和分类类目。 -->
<template>
    <el-card v-loading="sectionsLoading" shadow="never" class="border-0">
        <div class="section-toolbar">
            <div>
                <div class="section-toolbar-title">分类分区</div>
                <div class="section-toolbar-desc">管理类目所属分区，配置会同步到微信小程序。</div>
            </div>
            <div class="section-toolbar-actions">
                <el-button :icon="Refresh" @click="loadSections">刷新</el-button>
                <el-button v-permission="['createCategory,POST']" type="primary" :icon="Plus" @click="handleCreateSection">新增分区</el-button>
                <el-button v-permission="['updateCategory,POST']" :icon="Edit" :disabled="!currentSection" @click="handleEditSection">编辑分区</el-button>
                <el-tooltip :disabled="!currentSection?.fixed" content="主机销售和主机回收为固定分区，不可删除" placement="top">
                    <span>
                        <el-button
                            v-permission="['deleteCategory,POST']"
                            type="danger"
                            plain
                            :icon="Delete"
                            :disabled="!currentSection || currentSection.fixed"
                            @click="handleDeleteSection"
                        >删除分区</el-button>
                    </span>
                </el-tooltip>
            </div>
        </div>

        <el-tabs v-if="categorySections.length" v-model="currentSectionKey" @tab-change="getData">
            <el-tab-pane v-for="section in categorySections" :key="section.key" :name="section.key">
                <template #label>
                    <span class="section-tab-label">
                        <span>{{ section.name }}</span>
                        <el-tag v-if="section.fixed" class="section-fixed-tag" size="small" type="info">固定</el-tag>
                    </span>
                </template>
            </el-tab-pane>
        </el-tabs>

        <list-header
            :permissions="{ create: 'createCategory,POST', refresh: 'getCategoryList,GET' }"
            @create="handleCreate"
            @refresh="getData"
        ></list-header>

        <el-table id="list-table" :data="tableData" stripe class="category-table">
            <el-table-column label="类目名称" min-width="150" prop="name" align="center" header-align="center"></el-table-column>
            <el-table-column label="所属分区" min-width="150" align="center" header-align="center">
                <template #default="{ row }">{{ getSectionName(row.sectionKey) }}</template>
            </el-table-column>
            <el-table-column label="业务类型" min-width="150" align="center" header-align="center">
                <template #default="{ row }">
                    <el-tag class="business-tag" size="small" :type="row.scene === 'sale' ? 'success' : 'warning'">{{ sceneLabel(row.scene) }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="主题" min-width="150" align="center" header-align="center">
                <template #default="{ row }"><el-tag class="theme-tag" size="small">{{ row.theme }}</el-tag></template>
            </el-table-column>
            <el-table-column label="排序" min-width="150" prop="order" align="center" header-align="center"></el-table-column>
            <el-table-column label="状态" min-width="150" align="center" header-align="center">
                <template #default="{ row }">
                    <el-switch
                        v-permission="['updateCategoryStatus,POST']"
                        :model-value="row.status"
                        :active-value="1"
                        :inactive-value="0"
                        :loading="row.statusLoading"
                        @change="handleStatusChange($event, row)"
                    />
                </template>
            </el-table-column>
            <el-table-column label="操作" min-width="150" align="center" header-align="center">
                <template #default="{ row }">
                    <div class="table-actions">
                        <el-button v-permission="['updateCategory,POST']" type="text" size="small" @click="handleEdit(row)">修改</el-button>
                        <el-popconfirm title="确定删除这个类目吗？" confirm-button-text="确定" cancel-button-text="取消" @confirm="handleDelete(row.id)">
                            <template #reference>
                                <el-button v-permission="['deleteCategory,POST']" type="text" size="small">删除</el-button>
                            </template>
                        </el-popconfirm>
                    </div>
                </template>
            </el-table-column>
        </el-table>

        <div class="category-pagination">
            <el-pagination
                v-model:current-page="currentPage"
                v-model:page-size="pageSize"
                background
                layout="total, prev, pager, next"
                :total="total"
                @current-change="getData"
            />
        </div>

        <form-drawer ref="formDrawerRef" :title="drawerTitle" @submit="handleSubmit">
            <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
                <el-form-item label="类目名称" prop="name">
                    <el-input v-model="form.name" maxlength="64" placeholder="请输入类目名称"></el-input>
                </el-form-item>
                <el-form-item label="所属分区" prop="sectionKey">
                    <el-select v-model="form.sectionKey" class="w-full" placeholder="请选择所属分区" @change="syncFormScene">
                        <el-option
                            v-for="section in categorySections"
                            :key="section.key"
                            :label="`${section.name}（${sceneLabel(section.targetScene)}）`"
                            :value="section.key"
                        ></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="业务类型">
                    <el-tag :type="form.scene === 'sale' ? 'success' : 'warning'">{{ sceneLabel(form.scene) }}</el-tag>
                </el-form-item>
                <el-form-item label="主题色" prop="theme">
                    <el-select v-model="form.theme" class="w-full" placeholder="请选择主题色">
                        <el-option label="red" value="red"></el-option>
                        <el-option label="blue" value="blue"></el-option>
                        <el-option label="gray" value="gray"></el-option>
                        <el-option label="green" value="green"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="排序" prop="order">
                    <el-input-number v-model="form.order" :min="0" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="启用状态" prop="status">
                    <el-radio-group v-model="form.status">
                        <el-radio :label="1" border>启用</el-radio>
                        <el-radio :label="0" border>禁用</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-drawer>

        <form-drawer ref="sectionDrawerRef" :title="sectionDrawerTitle" @submit="handleSectionSubmit">
            <el-form ref="sectionFormRef" :model="sectionForm" :rules="sectionRules" label-width="90px">
                <el-form-item label="分区名称" prop="name">
                    <el-input v-model="sectionForm.name" maxlength="30" show-word-limit placeholder="请输入分区名称"></el-input>
                </el-form-item>
                <el-form-item label="业务类型" prop="targetScene">
                    <el-select v-model="sectionForm.targetScene" class="w-full" :disabled="sectionForm.fixed" placeholder="请选择业务类型">
                        <el-option label="销售" value="sale"></el-option>
                        <el-option label="回收" value="recycle"></el-option>
                    </el-select>
                    <div v-if="sectionForm.fixed" class="field-tip">固定分区不能修改业务类型。</div>
                </el-form-item>
                <el-form-item label="排序" prop="order">
                    <el-input-number v-model="sectionForm.order" :min="0" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="启用状态" prop="status">
                    <el-radio-group v-model="sectionForm.status">
                        <el-radio :label="1" border>启用</el-radio>
                        <el-radio :label="0" border>禁用</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-drawer>
    </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue'
import ListHeader from '~/components/ListHeader.vue'
import FormDrawer from '~/components/FormDrawer.vue'
import { showLoading, hideLoading, showFullLoading, hideFullLoading, toast } from '~/composables/util'
import {
    createCategory,
    createCategorySection,
    deleteCategory,
    deleteCategorySection,
    getCategoryList,
    getCategorySections,
    updateCategory,
    updateCategorySection,
    updateCategoryStatus,
} from '~/api/category'

const categorySections = ref([])
const currentSectionKey = ref('')
const tableData = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const sectionsLoading = ref(false)
const formDrawerRef = ref(null)
const formRef = ref(null)
const editId = ref(0)
const sectionDrawerRef = ref(null)
const sectionFormRef = ref(null)
const editSectionId = ref(0)

const currentSection = computed(() => categorySections.value.find((item) => item.key === currentSectionKey.value) || null)
const drawerTitle = computed(() => editId.value ? '修改类目' : '新增类目')
const sectionDrawerTitle = computed(() => editSectionId.value ? '编辑分区' : '新增分区')
const sceneLabel = (scene) => scene === 'recycle' ? '回收' : '销售'
const getSectionName = (key) => categorySections.value.find((item) => item.key === key)?.name || '-'

const createDefaultForm = () => ({
    name: '',
    sectionKey: currentSectionKey.value,
    scene: currentSection.value?.targetScene || 'sale',
    theme: 'gray',
    order: 50,
    status: 1,
})
const form = reactive(createDefaultForm())
const rules = {
    name: [{ required: true, message: '请输入类目名称', trigger: 'blur' }],
    sectionKey: [{ required: true, message: '请选择所属分区', trigger: 'change' }],
    theme: [{ required: true, message: '请选择主题色', trigger: 'change' }],
}

const createDefaultSectionForm = () => ({ name: '', targetScene: 'sale', order: 50, status: 1, fixed: false })
const sectionForm = reactive(createDefaultSectionForm())
const sectionRules = {
    name: [{ required: true, message: '请输入分区名称', trigger: 'blur' }],
    targetScene: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
}

const syncFormScene = () => {
    form.scene = categorySections.value.find((item) => item.key === form.sectionKey)?.targetScene || 'sale'
}

const resetForm = (row = null) => {
    const next = row ? {
        name: row.name || '',
        sectionKey: row.sectionKey || currentSectionKey.value,
        scene: row.scene || currentSection.value?.targetScene || 'sale',
        theme: row.theme || 'gray',
        order: Number(row.order || 50),
        status: Number(row.status || 0),
    } : createDefaultForm()
    Object.assign(form, next)
    formRef.value?.clearValidate?.()
}

const resetSectionForm = (section = null) => {
    Object.assign(sectionForm, section ? {
        name: section.name || '',
        targetScene: section.targetScene || 'sale',
        order: Number(section.order || 50),
        status: Number(section.status || 0),
        fixed: Boolean(section.fixed),
    } : createDefaultSectionForm())
    sectionFormRef.value?.clearValidate?.()
}

const getData = async (page = currentPage.value) => {
    if (!currentSection.value) {
        tableData.value = []
        total.value = 0
        return
    }
    currentPage.value = Math.max(1, Number(page) || 1)
    showLoading('#list-table')
    try {
        const res = await getCategoryList(currentSection.value.targetScene, true, currentSectionKey.value, currentPage.value, pageSize.value)
        const list = Array.isArray(res) ? res : (Array.isArray(res?.list) ? res.list : [])
        total.value = Number(res?.totalCount ?? res?.total ?? list.length)
        tableData.value = list.map((item) => ({ ...item, statusLoading: false }))
    } finally {
        hideLoading()
    }
}

const loadSections = async (preferredKey = '') => {
    sectionsLoading.value = true
    try {
        const res = await getCategorySections(true)
        categorySections.value = Array.isArray(res) ? res : []
        const requestedKey = typeof preferredKey === 'string' ? preferredKey : currentSectionKey.value
        const nextSection = categorySections.value.find((item) => item.key === requestedKey)
            || categorySections.value.find((item) => item.key === currentSectionKey.value)
            || categorySections.value.find((item) => item.key === 'sale')
            || categorySections.value[0]
        currentSectionKey.value = nextSection?.key || ''
        await getData(1)
    } finally {
        sectionsLoading.value = false
    }
}

const handleCreate = () => {
    editId.value = 0
    resetForm()
    formDrawerRef.value.open()
}

const handleEdit = (row) => {
    editId.value = row.id
    resetForm(row)
    formDrawerRef.value.open()
}

const handleSubmit = () => {
    formRef.value.validate(async (valid) => {
        if (!valid) return
        formDrawerRef.value.showLoading()
        try {
            const payload = { ...form }
            if (editId.value) {
                await updateCategory(editId.value, payload)
                toast('修改成功')
            } else {
                await createCategory(payload)
                toast('新增成功')
            }
            currentSectionKey.value = payload.sectionKey
            await getData(currentPage.value)
            formDrawerRef.value.close()
        } finally {
            formDrawerRef.value.hideLoading()
        }
    })
}

const handleStatusChange = async (status, row) => {
    row.statusLoading = true
    try {
        await updateCategoryStatus(row.id, status)
        row.status = status
        toast('状态修改成功')
    } finally {
        row.statusLoading = false
    }
}

const handleDelete = async (id) => {
    showFullLoading()
    try {
        await deleteCategory([id])
        toast('删除成功')
        const nextPage = tableData.value.length === 1 && currentPage.value > 1
            ? currentPage.value - 1
            : currentPage.value
        await getData(nextPage)
    } finally {
        hideFullLoading()
    }
}

const handleCreateSection = () => {
    editSectionId.value = 0
    resetSectionForm()
    sectionDrawerRef.value.open()
}

const handleEditSection = () => {
    if (!currentSection.value) return
    editSectionId.value = currentSection.value.id
    resetSectionForm(currentSection.value)
    sectionDrawerRef.value.open()
}

const handleSectionSubmit = () => {
    sectionFormRef.value.validate(async (valid) => {
        if (!valid) return
        sectionDrawerRef.value.showLoading()
        try {
            const payload = {
                name: sectionForm.name.trim(),
                targetScene: sectionForm.targetScene,
                order: sectionForm.order,
                status: sectionForm.status,
            }
            const section = editSectionId.value
                ? await updateCategorySection(editSectionId.value, payload)
                : await createCategorySection(payload)
            toast(editSectionId.value ? '分区修改成功' : '分区新增成功')
            sectionDrawerRef.value.close()
            await loadSections(section?.key || currentSectionKey.value)
        } finally {
            sectionDrawerRef.value.hideLoading()
        }
    })
}

const handleDeleteSection = async () => {
    const section = currentSection.value
    if (!section || section.fixed) return
    try {
        await ElMessageBox.confirm(
            `确定删除分区“${section.name}”吗？分区及分区内的所有类目都会被直接删除，且无法恢复。`,
            '删除分区',
            { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
        )
    } catch (action) {
        if (action === 'cancel' || action === 'close') return
        throw action
    }
    showFullLoading()
    try {
        await deleteCategorySection(section.id)
        toast('分区删除成功')
        await loadSections(section.targetScene)
    } finally {
        hideFullLoading()
    }
}

onMounted(loadSections)
</script>

<style scoped>
.section-toolbar,
.section-toolbar-actions,
.section-tab-label {
    display: flex;
    align-items: center;
}

.section-toolbar {
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
}

.section-toolbar-title {
    color: #303133;
    font-size: 16px;
    font-weight: 600;
}

.section-toolbar-desc,
.field-tip {
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
}

.section-toolbar-actions,
.section-tab-label {
    gap: 8px;
}

.section-tab-label {
    display: inline-flex;
    height: 24px;
    line-height: 24px;
    white-space: nowrap;
    vertical-align: middle;
}

.section-tab-label > span:first-child {
    line-height: 24px;
}

.section-tab-label :deep(.section-fixed-tag) {
    display: inline-flex;
    align-items: center;
    height: 24px;
    line-height: 22px;
    margin: 0;
    vertical-align: middle;
}

.section-toolbar-actions > span {
    display: inline-flex;
}

.category-table {
    width: 100%;
    border-top: 1px solid #ebeef5;
}

.category-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 16px;
}

.category-table :deep(.el-table__header-wrapper th.el-table__cell) {
    height: 48px;
    background: #f7f8fa;
    color: #606266;
    font-weight: 600;
}

.category-table :deep(td.el-table__cell) {
    height: 52px;
    padding: 8px 0;
}

.category-table :deep(.cell) {
    padding: 0 16px;
    line-height: 24px;
}

.business-tag,
.theme-tag {
    justify-content: center;
}

.business-tag {
    min-width: 68px;
}

.theme-tag {
    min-width: 54px;
}

.table-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
}

.table-actions :deep(.el-button + .el-button) {
    margin-left: 0;
}

@media (max-width: 900px) {
    .section-toolbar {
        align-items: flex-start;
        flex-direction: column;
    }

    .section-toolbar-actions {
        flex-wrap: wrap;
    }
}
</style>
