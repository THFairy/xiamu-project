<template>
    <!-- 用途：回收配置选项管理页，维护选项组与选项的排序、删除及编辑。 -->
    <div class="recycle-config-page">
        <el-card shadow="never" class="border-0">
            <div class="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 class="text-lg font-semibold text-gray-800">回收配置管理</h2>
                    <p class="mt-1 text-sm text-gray-500">
                        这里统一管理回收商品和估价选项。小程序后续会直接读取数据库，不再需要改前端硬编码。
                    </p>
                </div>
            </div>

            <search-header :model="productSearchForm" permission="searchRecycleProduct,GET" @search="getProductData(1)" @reset="resetProductSearch">
                <search-header-item label="商品名称" prop="title">
                    <el-input v-model="productSearchForm.title" placeholder="搜索回收商品名称" clearable></el-input>
                </search-header-item>
                <template #show>
                    <search-header-item label="回收类目" prop="categoryKey">
                        <el-select v-model="productSearchForm.categoryKey" placeholder="全部类目" clearable>
                            <el-option
                            v-for="item in recycleCategories"
                            :key="item.id"
                            :label="item.label || item.name"
                            :value="item.key"
                            />
                        </el-select>
                    </search-header-item>
                </template>
            </search-header>

            <list-header show="create,delete,refresh" @create="handleCreateProduct" @delete="handleDeleteProducts" @refresh="getProductData(currentPage)">
            </list-header>

            <el-table
            id="recycle-product-table"
            ref="productTableRef"
            :data="productTableData"
            stripe
            @selection-change="handleProductSelectionChange"
            :row-class-name="getProductRowClassName">
                <el-table-column type="selection" width="55"></el-table-column>
                <el-table-column label="回收商品" min-width="240" show-overflow-tooltip>
                    <template #default="{ row }">
                        <div class="flex items-center">
                            <img
                            v-if="row.coverImage"
                            class="cover-image"
                            :src="row.coverImage"
                            alt="回收商品封面"
                            />
                            <div v-else class="cover-chip" :class="`cover-chip-${row.coverTheme}`">{{ row.coverLabel || '回收' }}</div>
                            <div class="ml-3 min-w-0">
                                <div class="truncate font-medium text-gray-800">{{ row.title }}</div>
                                <div class="truncate text-xs text-gray-400">{{ row.subtitle || '未填写副标题' }}</div>
                            </div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="回收类目" width="140" show-overflow-tooltip>
                    <template #default="{ row }">
                        {{ row.categoryName || row.categoryKey || '-' }}
                    </template>
                </el-table-column>
                <el-table-column label="最高可得" width="110">
                    <template #default="{ row }">{{ row.maxRecyclePrice }}</template>
                </el-table-column>
                <el-table-column label="报价模式" width="110">
                    <template #default="{ row }">
                        <el-tag size="small" :type="row.quoteMode === 'manual' ? 'warning' : 'success'">
                            {{ row.quoteMode === 'manual' ? '人工估价' : '规则估价' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="状态" width="90">
                    <template #default="{ row }">
                        <el-switch
                        :model-value="row.status"
                        :active-value="1"
                        :inactive-value="0"
                        :disabled="row.statusLoading"
                        @change="handleProductStatusChange($event,row)"
                        />
                    </template>
                </el-table-column>
                <el-table-column label="操作" min-width="220" align="right">
                    <template #default="{ row }">
                        <el-button type="text" size="small" @click.stop="handleChooseProduct(row)">选项管理</el-button>
                        <el-button type="text" size="small" @click.stop="handleEditProduct(row)">编辑</el-button>
                        <el-popconfirm title="确定删除这个回收商品吗？" @confirm="handleDeleteSingleProduct(row.id)">
                            <template #reference>
                                <el-button type="text" size="small" @click.stop>删除</el-button>
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
                :page-size="pageSize"
                :total="total"
                @current-change="getProductData"></el-pagination>
            </div>
        </el-card>

        <form-drawer
        ref="optionConfigDrawerRef"
        :title="optionConfigDrawerTitle"
        :size="optionConfigDrawerSize"
        :showActions="true"
        @submit="submitOptionConfig"
        @close="handleOptionConfigClose">
            <div class="option-config-drawer">
                <div class="option-config-header">
                    <div class="option-config-meta">
                        <div class="option-config-title">{{ currentProductTitle || '未选择回收商品' }}</div>
                        <div class="option-config-subtitle">
                            <span>选项组：{{ groupTableData.length }}</span>
                            <span>选项：{{ currentGroupItemCount }}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <el-button size="small" @click="getGroupData">刷新</el-button>
                        <el-button type="primary" size="small" :disabled="!currentProfileKey" @click="handleCreateGroup">新增选项组</el-button>
                    </div>
                </div>

                <el-row :gutter="16" class="option-config-content">
                    <el-col :lg="12" :span="24">
                        <div class="drawer-panel">
                            <div class="drawer-panel-header">
                                <div>
                                    <div class="drawer-panel-title">选项组</div>
                                    <div class="drawer-panel-tip">先选择一个组选项，再在右侧维护它的具体选项。</div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <el-button size="small" :disabled="!groupMultipleSelectionIds.length" @click="handleDeleteGroups">批量删除</el-button>
                                </div>
                            </div>
                            <div class="drawer-panel-body">
                                <el-table
                                id="recycle-group-table"
                                :data="groupTableData"
                                row-key="id"
                                stripe
                                height="100%"
                                empty-text="当前商品还没有配置选项组"
                                @selection-change="handleGroupSelectionChange"
                                @row-click="handleChooseGroup"
                                :row-class-name="getGroupRowClassName">
                                    <el-table-column type="selection" width="48" />
                                    <el-table-column label="" width="58" align="center">
                                        <template #default>
                                            <span class="group-drag-handle" title="拖拽调整顺序">☷</span>
                                        </template>
                                    </el-table-column>
                                    <el-table-column label="名称" min-width="150" prop="label" show-overflow-tooltip></el-table-column>
                                    <el-table-column label="必选" width="80">
                                        <template #default="{ row }">
                                            <el-tag size="small" :type="row.required ? 'success' : 'info'">
                                                {{ row.required ? '是' : '否' }}
                                            </el-tag>
                                        </template>
                                    </el-table-column>
                                    <el-table-column label="状态" width="90" fixed="right">
                                        <template #default="{ row }">
                                            <el-switch
                                            :model-value="row.status"
                                            :active-value="1"
                                            :inactive-value="0"
                                            :disabled="row.statusLoading"
                                            @change="handleGroupStatusChange($event,row)"
                                            />
                                        </template>
                                    </el-table-column>
                                    <el-table-column label="操作" width="220" align="right">
                                        <template #default="{ row }">
                                            <div class="group-operation-buttons">
                                                <el-button type="text" size="small" @click.stop="handleChooseGroup(row)">管理选项</el-button>
                                                <el-button type="text" size="small" @click.stop="handleEditGroup(row)">编辑</el-button>
                                                <el-popconfirm title="确定删除这个选项组吗？组内选项也会被删除。" @confirm="handleDeleteGroup(row.id)">
                                                    <template #reference>
                                                        <el-button type="text" size="small" @click.stop>删除</el-button>
                                                    </template>
                                                </el-popconfirm>
                                            </div>
                                        </template>
                                    </el-table-column>
                                </el-table>
                            </div>
                        </div>
                    </el-col>

                    <el-col :lg="12" :span="24">
                        <div class="drawer-panel">
                            <div class="drawer-panel-header">
                                <div>
                                    <div class="drawer-panel-title">{{ currentGroupLabel || '选项' }}</div>
                                    <div class="drawer-panel-tip">
                                        {{ currentGroupLabel ? '当前组下的选项会即时影响该回收商品的估价逻辑。' : '请先在左侧选择一个选项组。' }}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <el-button size="small" :disabled="!currentGroupId" @click="getItemData">刷新</el-button>
                                    <el-button size="small" :disabled="!currentGroupId" @click="handleEditCurrentGroup">编辑本组选项</el-button>
                                    <el-button size="small" :disabled="!itemMultipleSelectionIds.length" @click="handleDeleteItems">批量删除</el-button>
                                    <el-button type="primary" size="small" :disabled="!currentGroupId" @click="handleCreateItem">新增一个选项</el-button>
                                </div>
                            </div>

                            <div class="drawer-panel-body">
                                <el-empty
                                v-if="!currentGroupId"
                                description="从左侧选择一个选项组后，这里会显示对应的选项。">
                                </el-empty>

                                <el-table
                                v-else
                                id="recycle-item-table"
                                :data="itemTableData"
                                stripe
                                row-key="id"
                                height="100%"
                                @selection-change="handleItemSelectionChange"
                                empty-text="当前选项组下还没有选项">
                                    <el-table-column type="selection" width="48" />
                                    <el-table-column label="名称" min-width="140" prop="label" show-overflow-tooltip></el-table-column>
                                    <el-table-column label="图片" width="90">
                                        <template #default="{ row }">
                                            <el-tag size="small" type="info">{{ (row.imageUrls || []).length }}</el-tag>
                                        </template>
                                    </el-table-column>
                                    <el-table-column label="值" min-width="120" prop="value" show-overflow-tooltip></el-table-column>
                                    <el-table-column label="影响类型" width="100">
                                        <template #default="{ row }">
                                            <el-tag size="small">{{ row.effectType }}</el-tag>
                                        </template>
                                    </el-table-column>
                                    <el-table-column label="扣减" width="110" prop="priceDelta"></el-table-column>
                                    <el-table-column label="备注" min-width="160" prop="noteText" show-overflow-tooltip></el-table-column>
                                    <el-table-column label="状态" width="90">
                                        <template #default="{ row }">
                                            <el-switch
                                            :model-value="row.status"
                                            :active-value="1"
                                            :inactive-value="0"
                                            :disabled="row.statusLoading"
                                            @change="handleItemStatusChange($event,row)"
                                            />
                                        </template>
                                    </el-table-column>
                                    <el-table-column label="操作" width="140" align="right" fixed="right">
                                        <template #default="{ row }">
                                            <el-button type="text" size="small" @click="handleEditItem(row)">编辑</el-button>
                                            <el-popconfirm title="确定删除这个选项吗？" @confirm="handleDeleteItem(row.id)">
                                                <template #reference>
                                                    <el-button type="text" size="small">删除</el-button>
                                                </template>
                                            </el-popconfirm>
                                        </template>
                                    </el-table-column>
                                </el-table>
                            </div>
                        </div>
                    </el-col>
                </el-row>
            </div>
        </form-drawer>

        <form-drawer ref="productDrawerRef" title="回收商品" size="52%" @submit="submitProductForm">
            <el-form ref="productFormRef" :model="productForm" :rules="productRules" label-width="110px">
                <el-form-item label="回收商品名称" prop="title">
                    <el-input v-model="productForm.title" placeholder="如 NS主机 OLED"></el-input>
                </el-form-item>
                <el-form-item label="副标题" prop="subtitle">
                    <el-input v-model="productForm.subtitle" placeholder="展示在回收列表的简短说明"></el-input>
                </el-form-item>
                <el-form-item label="回收类目" prop="categoryKey">
                    <el-select v-model="productForm.categoryKey" placeholder="请选择回收类目">
                        <el-option v-for="item in recycleCategories" :key="item.id" :label="item.label || item.name" :value="item.key" />
                    </el-select>
                </el-form-item>
                <el-form-item label="封面标签" prop="coverLabel">
                    <el-input v-model="productForm.coverLabel" placeholder="如 OLED / PS5 / XSX"></el-input>
                </el-form-item>
                <el-form-item label="封面主题" prop="coverTheme">
                    <el-select v-model="productForm.coverTheme">
                        <el-option label="red" value="red"></el-option>
                        <el-option label="blue" value="blue"></el-option>
                        <el-option label="gray" value="gray"></el-option>
                        <el-option label="green" value="green"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="封面图" prop="coverImage">
                    <div class="w-full">
                        <choose-image v-model="productForm.coverImage" :limit="1"></choose-image>
                        <div class="mt-2 text-xs text-gray-400">上传后优先显示图片；不上传时继续使用封面标签和主题色。</div>
                    </div>
                </el-form-item>
                <el-form-item label="最高可得价钱" prop="maxRecyclePrice">
                    <el-input-number v-model="productForm.maxRecyclePrice" :min="0" :precision="2" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="提示文案" prop="hintText">
                    <el-input v-model="productForm.hintText" placeholder="如 最高可得 / 人工估价"></el-input>
                </el-form-item>
                <el-form-item label="报价模式" prop="quoteMode">
                    <el-radio-group v-model="productForm.quoteMode">
                        <el-radio label="rule_based" border>规则估价</el-radio>
                        <el-radio label="manual" border>人工估价</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="排序" prop="sortOrder">
                    <el-input-number v-model="productForm.sortOrder" :min="0" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="启用状态" prop="status">
                    <el-radio-group v-model="productForm.status" :disabled="!productEditId">
                        <el-radio :label="1" border>启用</el-radio>
                        <el-radio :label="0" border>禁用</el-radio>
                    </el-radio-group>
                    <div v-if="!productEditId" class="mt-2 text-xs text-gray-400">创建后请先在选项管理中添加选项，再启用回收商品。</div>
                </el-form-item>
            </el-form>
        </form-drawer>

        <form-drawer ref="groupDrawerRef" title="选项组" size="42%" @submit="submitGroupForm">
            <el-form ref="groupFormRef" :model="groupForm" :rules="groupRules" label-width="100px">
                <el-form-item label="显示名称" prop="label">
                    <el-input v-model="groupForm.label" placeholder="如 HDMI线 / 维修情况"></el-input>
                </el-form-item>
                <el-form-item label="是否必选" prop="required">
                    <el-radio-group v-model="groupForm.required">
                        <el-radio :label="true" border>必选</el-radio>
                        <el-radio :label="false" border>可选</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="排序" prop="sortOrder">
                    <el-input-number v-model="groupForm.sortOrder" :min="0" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="启用状态" prop="status">
                    <el-radio-group v-model="groupForm.status">
                        <el-radio :label="1" border>启用</el-radio>
                        <el-radio :label="0" border>禁用</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-drawer>

        <form-drawer ref="itemDrawerRef" title="选项" size="42%" @submit="submitItemForm">
            <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-width="110px">
                <el-form-item label="所属选项组" prop="groupId">
                    <el-input :model-value="currentGroupLabel || '未选择'" disabled></el-input>
                </el-form-item>
                <el-form-item label="显示名称" prop="label">
                    <el-input v-model="itemForm.label" placeholder="如 缺 HDMI 线"></el-input>
                </el-form-item>
                <el-form-item label="选项图片" prop="imageUrls">
                    <choose-image v-model="itemForm.imageUrls" :limit="9" />
                    <div class="mt-2 text-xs text-gray-400">图片会显示在小程序选项左侧。</div>
                </el-form-item>
                <el-form-item label="影响类型" prop="effectType">
                    <el-select v-model="itemForm.effectType">
                        <el-option label="none" value="none"></el-option>
                        <el-option label="accessory" value="accessory"></el-option>
                        <el-option label="issue" value="issue"></el-option>
                        <el-option label="block" value="block"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="扣除价格" prop="priceDelta">
                    <el-input-number v-model="itemForm.priceDelta" :min="0" :precision="2" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="备注文案" prop="noteText">
                    <el-input v-model="itemForm.noteText" type="textarea" :rows="4" placeholder="用于 block 或说明文案"></el-input>
                </el-form-item>
                <el-form-item label="排序" prop="sortOrder">
                    <el-input-number v-model="itemForm.sortOrder" :min="0" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="启用状态" prop="status">
                    <el-radio-group v-model="itemForm.status">
                        <el-radio :label="1" border>启用</el-radio>
                        <el-radio :label="0" border>禁用</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-drawer>
    </div>
</template>

<script setup>
    import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
    import { useStore } from 'vuex'
    import { ElLoading } from 'element-plus'
    import SearchHeader from '~/components/SearchHeader.vue'
    import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
    import ListHeader from '~/components/ListHeader.vue'
    import FormDrawer from '~/components/FormDrawer.vue'
    import ChooseImage from '~/components/ChooseImage.vue'
    import { hideFullLoading, showFullLoading, showModal, toast } from '~/composables/util'
    import { getCategoryList, getCategorySections } from '~/api/category'
    import {
        createRecycleOptionGroup,
        createRecycleOptionItem,
        createRecycleProduct,
        deleteRecycleOptionGroup,
        deleteRecycleOptionGroups,
        deleteRecycleOptionItem,
        deleteRecycleOptionItems,
        deleteRecycleProducts,
        getRecycleOptionGroups,
        getRecycleOptionItems,
        getRecycleProductList,
        reorderRecycleOptionGroups,
        updateRecycleOptionGroup,
        updateRecycleOptionGroupStatus,
        updateRecycleOptionItem,
        updateRecycleOptionItemStatus,
        updateRecycleProduct,
        updateRecycleProductStatus,
    } from '~/api/recycle'

    const store = useStore()

    const recycleCategories = ref([])
    const productTableRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const total = ref(0)
    const productTableData = ref([])
    const productMultipleSelection = ref([])

    const currentProductId = ref(0)
    const currentProductTitle = ref('')
    const currentProfileKey = ref('')
    const groupTableData = ref([])
    const groupMultipleSelection = ref([])
    const groupSortDirty = ref(false)
    const groupDragIndex = ref(-1)
    const currentGroupId = ref(0)
    const currentGroupLabel = ref('')
    const itemTableData = ref([])
    const itemMultipleSelection = ref([])
    const optionConfigDrawerRef = ref(null)

    const productDrawerRef = ref(null)
    const productFormRef = ref(null)
    const productEditId = ref(0)

    const groupDrawerRef = ref(null)
    const groupFormRef = ref(null)
    const groupEditId = ref(0)

    const itemDrawerRef = ref(null)
    const itemFormRef = ref(null)
    const itemEditId = ref(0)
    const tableLoadingInstances = {
        product: null,
        group: null,
        item: null,
    }

    const openTableLoading = (key, selector) => {
        if (tableLoadingInstances[key]) {
            tableLoadingInstances[key].close()
        }

        const target = document.querySelector(selector)
        if (!target) {
            tableLoadingInstances[key] = null
            return
        }

        tableLoadingInstances[key] = ElLoading.service({
            target,
            lock: true,
            text: '加载中',
        })
    }

    const closeTableLoading = (key) => {
        if (tableLoadingInstances[key]) {
            tableLoadingInstances[key].close()
            tableLoadingInstances[key] = null
        }
    }

    const productSearchForm = reactive({
        title: '',
        categoryKey: '',
    })

    const createDefaultProductForm = () => ({
        title: '',
        subtitle: '',
        categoryKey: 'nintendo_console',
        coverLabel: '',
        coverImage: '',
        coverTheme: 'red',
        maxRecyclePrice: 0,
        hintText: '最高可得',
        quoteMode: 'rule_based',
        sortOrder: 0,
        status: 0,
        pricingRuleJson: '{}',
    })

    const normalizeStatus = (value) => Number(value || 0)

    const normalizePricingRuleJson = (value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return JSON.stringify(value, null, 2)
        }

        if (typeof value === 'string') {
            const trimmedValue = value.trim()
            if (!trimmedValue) {
                return '{}'
            }

            try {
                const parsed = JSON.parse(trimmedValue)
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? JSON.stringify(parsed, null, 2)
                    : '{}'
            } catch (_error) {
                return '{}'
            }
        }

        return '{}'
    }

    const parsePricingRuleJson = (value) => {
        try {
            const parsed = JSON.parse(value || '{}')
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch (_error) {
            return {}
        }
    }

    const productForm = reactive(createDefaultProductForm())
    const productRules = {
        title:[{ required:true,message:'请输入回收商品名称',trigger:'blur' }],
        categoryKey:[{ required:true,message:'请选择回收类目',trigger:'change' }],
    }

    const updateRowStatus = (row, nextStatus, request, successMessage) => {
        if (row.statusLoading) {
            return
        }

        const previousStatus = normalizeStatus(row.status)
        row.statusLoading = true
        row.status = normalizeStatus(nextStatus)

        request()
            .then(() => {
                toast(successMessage)
            })
            .catch(() => {
                row.status = previousStatus
            })
            .finally(() => {
                row.statusLoading = false
            })
    }

    const createDefaultGroupForm = () => ({
        label: '',
        required: true,
        sortOrder: 0,
        status: 1,
    })

    const groupForm = reactive(createDefaultGroupForm())
    const groupRules = {
        label:[{ required:true,message:'请输入显示名称',trigger:'blur' }],
    }

    const createDefaultItemForm = () => ({
        groupId: currentGroupId.value || 0,
        label: '',
        imageUrls: [],
        effectType: 'none',
        priceDelta: 0,
        noteText: '',
        sortOrder: 0,
        status: 1,
    })

    const itemForm = reactive(createDefaultItemForm())
    const itemRules = {
        label:[{ required:true,message:'请输入显示名称',trigger:'blur' }],
    }

    const normalizeImageUrls = (value) => {
        if (Array.isArray(value)) {
            return value.filter(Boolean)
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value)
                return Array.isArray(parsed) ? parsed.filter(Boolean) : []
            } catch (_error) {
                return []
            }
        }

        return []
    }

    const refreshRecycleCategories = async ()=>{
        const [categoryResponse, sectionResponse] = await Promise.all([
            getCategoryList('recycle', true, '', 0, 0),
            getCategorySections(true),
        ])
        const categories = Array.isArray(categoryResponse)
            ? categoryResponse
            : (Array.isArray(categoryResponse?.list) ? categoryResponse.list : [])
        const sections = Array.isArray(sectionResponse) ? sectionResponse : []
        const sectionNames = new Map(sections.map((section) => [
            String(section.key || ''),
            String(section.name || '').trim(),
        ]))

        recycleCategories.value = categories.map((item) => {
            const sectionName = sectionNames.get(String(item.sectionKey || '')) || '未分类'
            return {
                ...item,
                label: `${sectionName} / ${String(item.name || '').trim()}`,
            }
        })
    }

    const getProductData = (page = currentPage.value)=>{
        currentPage.value = Number(page || 1)
        openTableLoading('product', '#recycle-product-table')
        getRecycleProductList(currentPage.value, {
            title: productSearchForm.title,
            categoryKey: productSearchForm.categoryKey,
            limit: pageSize.value,
        }).then((res)=>{
            total.value = Number(res.totalCount || 0)
            productTableData.value = Array.isArray(res.list)
                ? res.list.map((item)=>({
                    ...item,
                    status: normalizeStatus(item.status),
                    statusLoading:false,
                }))
                : []
        }).finally(()=>closeTableLoading('product'))
    }

    const resetProductSearch = ()=>{
        productSearchForm.title = ''
        productSearchForm.categoryKey = ''
        getProductData(1)
    }

    const handleProductSelectionChange = (rows)=>{
        productMultipleSelection.value = rows
    }

    const productMultipleSelectionIds = computed(()=> productMultipleSelection.value.map(item=>item.id))
    const groupMultipleSelectionIds = computed(()=> groupMultipleSelection.value.map(item=>item.id))
    const itemMultipleSelectionIds = computed(()=> itemMultipleSelection.value.map(item=>item.id))
    const currentGroupItemCount = computed(()=> itemTableData.value.length)
    const optionConfigDrawerTitle = computed(()=> currentProductTitle.value ? `选项管理 · ${currentProductTitle.value}` : '选项管理')
    const optionConfigDrawerSize = computed(()=> `calc(100vw - ${store.state.asideWidth || '250px'})`)

    const closeOptionConfigDrawer = ()=>{
        if (optionConfigDrawerRef.value) {
            optionConfigDrawerRef.value.close()
        }
    }

    const handleOptionConfigClose = () => {
        if (groupSortDirty.value) {
            getGroupData()
        }
    }

    const handleChooseProduct = (row)=>{
        currentProductId.value = row.id
        currentProductTitle.value = row.title
        currentProfileKey.value = row.optionProfileKey || ''
        currentGroupId.value = 0
        currentGroupLabel.value = ''
        itemTableData.value = []
        if (optionConfigDrawerRef.value) {
            optionConfigDrawerRef.value.open()
        }
        getGroupData()
    }

    const getProductRowClassName = ({ row })=>{
        return Number(row.id) === Number(currentProductId.value) ? 'selected-row' : ''
    }

    const getGroupRowClassName = ({ row })=>{
        return Number(row.id) === Number(currentGroupId.value) ? 'selected-row' : ''
    }

    const handleGroupSelectionChange = (rows) => {
        groupMultipleSelection.value = rows
    }

    const handleItemSelectionChange = (rows) => {
        itemMultipleSelection.value = rows
    }

    const markGroupSortOrder = () => {
        groupTableData.value.forEach((row, index) => {
            row.sortOrder = (index + 1) * 10
        })
        groupSortDirty.value = true
    }

    const bindGroupDragHandlers = () => {
        nextTick(() => {
            const body = document.querySelector('#recycle-group-table .el-table__body-wrapper tbody')
            if (!body) return
            Array.from(body.children).forEach((row, index) => {
                row.draggable = true
                row.ondragstart = () => {
                    groupDragIndex.value = index
                }
                row.ondragover = (event) => event.preventDefault()
                row.ondrop = (event) => {
                    event.preventDefault()
                    const from = groupDragIndex.value
                    const to = index
                    if (from < 0 || from === to) return
                    const [moved] = groupTableData.value.splice(from, 1)
                    groupTableData.value.splice(to, 0, moved)
                    markGroupSortOrder()
                    groupDragIndex.value = -1
                    bindGroupDragHandlers()
                }
            })
        })
    }

    const getGroupData = ()=>{
        if (!currentProfileKey.value) {
            groupTableData.value = []
            groupMultipleSelection.value = []
            groupSortDirty.value = false
            currentGroupId.value = 0
            currentGroupLabel.value = ''
            itemTableData.value = []
            return
        }

        openTableLoading('group', '#recycle-group-table')
        getRecycleOptionGroups({
            profileKey: currentProfileKey.value,
        }).then((res)=>{
            const nextRows = Array.isArray(res)
                ? res.map((item)=>({
                    ...item,
                    status: normalizeStatus(item.status),
                    statusLoading:false,
                }))
                : []

            groupTableData.value = nextRows
            groupMultipleSelection.value = []
            groupSortDirty.value = false
            bindGroupDragHandlers()
            const matchedGroup = nextRows.find((item)=> Number(item.id) === Number(currentGroupId.value))

            if (matchedGroup) {
                currentGroupLabel.value = matchedGroup.label
                return
            }

            currentGroupId.value = 0
            currentGroupLabel.value = ''
            itemTableData.value = []
        }).finally(()=>closeTableLoading('group'))
    }

    const handleChooseGroup = (row)=>{
        currentGroupId.value = row.id
        currentGroupLabel.value = row.label
        getItemData()
    }

    const handleEditCurrentGroup = ()=>{
        const currentGroup = groupTableData.value.find((item)=> Number(item.id) === Number(currentGroupId.value))
        if (!currentGroup) {
            toast('请先选择一个选项组', 'error')
            return
        }

        handleEditGroup(currentGroup)
    }

    const getItemData = ()=>{
        if (!currentGroupId.value) {
            itemTableData.value = []
            return
        }

        openTableLoading('item', '#recycle-item-table')
        getRecycleOptionItems({
            groupId: currentGroupId.value,
        }).then((res)=>{
            itemTableData.value = Array.isArray(res)
                ? res.map((item)=>({
                    ...item,
                    imageUrls: normalizeImageUrls(item.imageUrls || item.image_urls),
                    status: normalizeStatus(item.status),
                    statusLoading:false,
                }))
                : []
            itemMultipleSelection.value = []
        }).finally(()=>closeTableLoading('item'))
    }

    const resetProductForm = (row = null)=>{
        const next = row ? {
            title: row.title || '',
            subtitle: row.subtitle || '',
            categoryKey: row.categoryKey || 'nintendo_console',
            coverLabel: row.coverLabel || '',
            coverImage: row.coverImage || '',
            coverTheme: row.coverTheme || 'red',
            maxRecyclePrice: Number(row.maxRecyclePrice || 0),
            hintText: row.hintText || '',
            quoteMode: row.quoteMode || 'rule_based',
            sortOrder: Number(row.sortOrder || 0),
            status: normalizeStatus(row.status),
            pricingRuleJson: normalizePricingRuleJson(row.pricingRuleJson),
        } : createDefaultProductForm()

        Object.keys(next).forEach((key)=>{
            productForm[key] = next[key]
        })

        if (productFormRef.value) {
            productFormRef.value.clearValidate()
        }
    }

    const handleCreateProduct = ()=>{
        productEditId.value = 0
        resetProductForm()
        productDrawerRef.value.open()
    }

    const handleEditProduct = (row)=>{
        productEditId.value = row.id
        resetProductForm(row)
        productDrawerRef.value.open()
    }

    const submitProductForm = ()=>{
        productFormRef.value.validate((valid)=>{
            if (!valid) return false

            productDrawerRef.value.showLoading()
            const payload = {
                ...productForm,
                coverImage: String(productForm.coverImage || '').trim(),
                pricingRuleJson: parsePricingRuleJson(productForm.pricingRuleJson),
            }
            const request = productEditId.value
                ? updateRecycleProduct(productEditId.value, payload)
                : createRecycleProduct(payload)

            request.then((res)=>{
                toast(productEditId.value ? '回收商品修改成功' : '回收商品创建成功')
                productDrawerRef.value.close()
                getProductData(currentPage.value)
                if (res && res.optionProfileKey) {
                    currentProductId.value = res.id
                    currentProductTitle.value = res.title
                    currentProfileKey.value = res.optionProfileKey
                    getGroupData()
                }
            }).finally(()=>{
                productDrawerRef.value.hideLoading()
            })
        })
    }

    const handleProductStatusChange = (status,row)=>{
        updateRowStatus(
            row,
            status,
            ()=> updateRecycleProductStatus(row.id, normalizeStatus(status)),
            '回收商品状态已更新'
        )
    }

    const handleDeleteSingleProduct = (id)=>{
        showFullLoading()
        deleteRecycleProducts([id]).then(()=>{
            toast('回收商品删除成功')
            if (Number(currentProductId.value) === Number(id)) {
                currentProductId.value = 0
                currentProductTitle.value = ''
                currentProfileKey.value = ''
                currentGroupId.value = 0
                currentGroupLabel.value = ''
                groupTableData.value = []
                itemTableData.value = []
                closeOptionConfigDrawer()
            }
            const remainingTotal = Math.max(0, Number(total.value || 0) - 1)
            const nextPage = Math.min(
                currentPage.value,
                Math.max(1, Math.ceil(remainingTotal / pageSize.value)),
            )
            getProductData(nextPage)
        }).finally(()=>hideFullLoading())
    }

    const handleDeleteProducts = ()=>{
        if (!productMultipleSelectionIds.value.length) {
            toast('请先选择要删除的回收商品', 'error')
            return
        }

        const deletedIds = [...productMultipleSelectionIds.value]

        showFullLoading()
        deleteRecycleProducts(deletedIds).then(()=>{
            toast('批量删除成功')
            if (deletedIds.some((id)=> Number(id) === Number(currentProductId.value))) {
                currentProductId.value = 0
                currentProductTitle.value = ''
                currentProfileKey.value = ''
                currentGroupId.value = 0
                currentGroupLabel.value = ''
                groupTableData.value = []
                itemTableData.value = []
                closeOptionConfigDrawer()
            }
            if (productTableRef.value) {
                productTableRef.value.clearSelection()
            }
            const remainingTotal = Math.max(0, Number(total.value || 0) - deletedIds.length)
            const nextPage = Math.min(
                currentPage.value,
                Math.max(1, Math.ceil(remainingTotal / pageSize.value)),
            )
            getProductData(nextPage)
        }).finally(()=>hideFullLoading())
    }

    const resetGroupForm = (row = null)=>{
        const next = row ? {
            label: row.label || '',
            required: Boolean(row.required),
            sortOrder: Number(row.sortOrder || 0),
            status: normalizeStatus(row.status),
        } : createDefaultGroupForm()

        Object.keys(next).forEach((key)=>{
            groupForm[key] = next[key]
        })

        if (groupFormRef.value) {
            groupFormRef.value.clearValidate()
        }
    }

    const handleCreateGroup = ()=>{
        groupEditId.value = 0
        resetGroupForm()
        groupForm.sortOrder = groupTableData.value.reduce((max, row) => Math.max(max, Number(row.sortOrder || 0)), 0) + 10
        groupDrawerRef.value.open()
    }

    const handleEditGroup = (row)=>{
        groupEditId.value = row.id
        resetGroupForm(row)
        groupDrawerRef.value.open()
    }

    const submitGroupForm = ()=>{
        groupFormRef.value.validate((valid)=>{
            if (!valid) return false

            groupDrawerRef.value.showLoading()
            const payload = {
                ...groupForm,
                productId: currentProductId.value,
                label: String(groupForm.label || '').trim(),
            }
            const request = groupEditId.value
                ? updateRecycleOptionGroup(groupEditId.value, payload)
                : createRecycleOptionGroup(payload)

            request.then((res)=>{
                toast(groupEditId.value ? '选项组修改成功' : '选项组创建成功')
                groupDrawerRef.value.close()
                if (Number(currentGroupId.value) === Number(groupEditId.value)) {
                    currentGroupLabel.value = res.label || payload.label
                }
                getGroupData()
            }).finally(()=>{
                groupDrawerRef.value.hideLoading()
            })
        })
    }

    const handleGroupStatusChange = (status,row)=>{
        updateRowStatus(
            row,
            status,
            ()=> updateRecycleOptionGroupStatus(row.id, normalizeStatus(status)),
            '选项组状态已更新'
        )
    }

    const handleDeleteGroup = (id)=>{
        showFullLoading()
        deleteRecycleOptionGroup(id).then(()=>{
            toast('选项组删除成功')
            if (Number(currentGroupId.value) === Number(id)) {
                currentGroupId.value = 0
                currentGroupLabel.value = ''
                itemTableData.value = []
            }
            getGroupData()
        }).finally(()=>hideFullLoading())
    }

    const handleDeleteGroups = async ()=>{
        const ids = [...groupMultipleSelectionIds.value]
        if (!ids.length) {
            toast('请先选择要删除的选项组', 'error')
            return
        }
        try {
            await showModal(`确定删除选中的 ${ids.length} 个选项组吗？组内选项也会被删除。`)
        } catch (_error) {
            return
        }
        showFullLoading()
        deleteRecycleOptionGroups(ids).then(()=>{
            toast('选项组批量删除成功')
            if (ids.some((id) => Number(id) === Number(currentGroupId.value))) {
                currentGroupId.value = 0
                currentGroupLabel.value = ''
                itemTableData.value = []
            }
            groupMultipleSelection.value = []
            getGroupData()
        }).finally(()=>hideFullLoading())
    }

    const submitOptionConfig = ()=>{
        if (!groupSortDirty.value) {
            optionConfigDrawerRef.value.close()
            return
        }
        optionConfigDrawerRef.value.showLoading()
        reorderRecycleOptionGroups(
            currentProfileKey.value,
            groupTableData.value.map((row) => ({ id: row.id, sortOrder: row.sortOrder })),
        ).then((rows)=>{
            groupSortDirty.value = false
            groupTableData.value = Array.isArray(rows) ? rows.map((row) => ({ ...row, status: normalizeStatus(row.status), statusLoading: false })) : groupTableData.value
            toast('选项组排序保存成功')
            optionConfigDrawerRef.value.close()
        }).finally(()=>optionConfigDrawerRef.value.hideLoading())
    }

    const resetItemForm = (row = null)=>{
        const next = row ? {
            groupId: Number(row.groupId || currentGroupId.value || 0),
            label: row.label || '',
            imageUrls: normalizeImageUrls(row.imageUrls || row.image_urls),
            effectType: row.effectType || 'none',
            priceDelta: Number(row.priceDelta || 0),
            noteText: row.noteText || '',
            sortOrder: Number(row.sortOrder || 0),
            status: normalizeStatus(row.status),
        } : createDefaultItemForm()

        Object.keys(next).forEach((key)=>{
            itemForm[key] = next[key]
        })

        if (itemFormRef.value) {
            itemFormRef.value.clearValidate()
        }
    }

    const handleCreateItem = ()=>{
        itemEditId.value = 0
        resetItemForm()
        itemForm.sortOrder = itemTableData.value.reduce((max, row) => Math.max(max, Number(row.sortOrder || 0)), 0) + 10
        itemDrawerRef.value.open()
    }

    const handleEditItem = (row)=>{
        itemEditId.value = row.id
        resetItemForm(row)
        itemDrawerRef.value.open()
    }

    const submitItemForm = ()=>{
        itemFormRef.value.validate((valid)=>{
            if (!valid) return false
            if (!currentGroupId.value && !itemForm.groupId) {
                toast('请先选择一个选项组', 'error')
                return false
            }

            itemDrawerRef.value.showLoading()
            const payload = {
                ...itemForm,
                groupId: Number(itemForm.groupId || currentGroupId.value || 0),
                label: String(itemForm.label || '').trim(),
                imageUrls: normalizeImageUrls(itemForm.imageUrls),
            }
            const request = itemEditId.value
                ? updateRecycleOptionItem(itemEditId.value, payload)
                : createRecycleOptionItem(payload)

            request.then(()=>{
                toast(itemEditId.value ? '选项修改成功' : '选项创建成功')
                itemDrawerRef.value.close()
                getItemData()
            }).finally(()=>{
                itemDrawerRef.value.hideLoading()
            })
        })
    }

    const handleItemStatusChange = (status,row)=>{
        updateRowStatus(
            row,
            status,
            ()=> updateRecycleOptionItemStatus(row.id, normalizeStatus(status)),
            '选项状态已更新'
        )
    }

    const handleDeleteItem = (id)=>{
        showFullLoading()
        deleteRecycleOptionItem(id).then(()=>{
            toast('选项删除成功')
            getItemData()
        }).finally(()=>hideFullLoading())
    }

    const handleDeleteItems = async ()=>{
        const ids = [...itemMultipleSelectionIds.value]
        if (!ids.length) {
            toast('请先选择要删除的选项', 'error')
            return
        }
        try {
            await showModal(`确定删除选中的 ${ids.length} 个选项吗？`)
        } catch (_error) {
            return
        }
        showFullLoading()
        deleteRecycleOptionItems(ids).then(()=>{
            toast('选项批量删除成功')
            itemMultipleSelection.value = []
            getItemData()
        }).finally(()=>hideFullLoading())
    }

    onMounted(()=>{
        Promise.all([
            refreshRecycleCategories(),
        ]).finally(()=>{
            getProductData(1)
        })
    })

    onUnmounted(() => {
        closeTableLoading('product')
        closeTableLoading('group')
        closeTableLoading('item')
    })
</script>

<style scoped>
.section-card {
    min-height: 420px;
}

.cover-chip {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
}

.cover-image {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid #e5e7eb;
}

.cover-chip-red {
    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
}

.cover-chip-blue {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
}

.cover-chip-gray {
    background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
}

.cover-chip-green {
    background: linear-gradient(135deg, #22c55e 0%, #15803d 100%);
}

.option-config-drawer {
    min-height: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.option-config-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    position: sticky;
    top: 0;
    z-index: 20;
    padding: 0 0 12px;
    background: #fff;
}

.option-config-meta {
    min-width: 0;
}

.option-config-title {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
}

.option-config-subtitle {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 6px;
    font-size: 12px;
    color: #6b7280;
}

.option-config-content {
    margin-top: 4px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.option-config-content > .el-col {
    height: 100%;
    min-height: 0;
}

.group-drag-handle {
    cursor: grab;
    color: #9ca3af;
    font-size: 18px;
    user-select: none;
}

.group-drag-handle:active {
    cursor: grabbing;
}

.drawer-panel {
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 16px;
    background: #fff;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.drawer-panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    position: sticky;
    top: 0;
    z-index: 15;
    background: #fff;
    padding-bottom: 12px;
}

.drawer-panel-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
}

.drawer-panel-tip {
    margin-top: 4px;
    font-size: 12px;
    color: #6b7280;
}

.drawer-panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
}

@media (max-width: 768px) {
    .option-config-header,
    .drawer-panel-header {
        flex-direction: column;
    }
}
</style>

<style>
.recycle-config-page .selected-row td {
    background: #f0f9ff !important;
}
</style>
