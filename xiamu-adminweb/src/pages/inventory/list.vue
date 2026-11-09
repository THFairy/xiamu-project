<!-- 库存管理页面：提供库存记录编辑、完整文本查看及列配置功能。 -->
<!-- 用途：库存管理列表、列设置与库存记录编辑界面。 -->
<template>
    <el-card shadow="never" class="border-0">
        <div class="inventory-toolbar">
            <div class="inventory-toolbar-primary">
                <template v-if="canSearchInventory">
                    <el-input
                        v-model="keyword"
                        clearable
                        placeholder="搜索任意登记字段"
                        @keyup.enter="loadData(1)"
                        @clear="loadData(1)"
                    />
                    <el-button type="primary" :icon="Search" @click="loadData(1)">搜索</el-button>
                </template>
                <el-button v-permission="['createInventoryManagement,POST']" type="primary" :icon="Plus" @click="addRow">新增库存记录</el-button>
                <el-button :icon="settingsExpanded ? ArrowUp : ArrowDown" @click="settingsExpanded = !settingsExpanded">
                    {{ settingsExpanded ? '收起' : '展开' }}
                </el-button>
                <el-button :icon="Document" :disabled="selectedRows.length !== 1" @click="openDetail">
                    查看完整文本
                </el-button>
                <el-dropdown v-permission="['exportInventoryManagement,GET']" :disabled="exporting" @command="exportData">
                    <el-button :icon="Download" :loading="exporting">
                        导出数据<el-icon class="ml-1"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="xlsx">导出为 .xlsx</el-dropdown-item>
                            <el-dropdown-item command="csv">导出为 .csv</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
                <el-button :icon="Refresh" @click="loadData(currentPage)">刷新</el-button>
                <el-button
                    v-permission="['deleteInventoryManagementBatch,POST']"
                    class="inventory-delete-button"
                    type="danger"
                    :icon="Delete"
                    :disabled="!selectedRows.length"
                    @click="removeSelectedRows"
                >
                    批量删除{{ selectedRows.length ? `（${selectedRows.length}）` : '' }}
                </el-button>
            </div>
            <el-collapse-transition>
                <div v-show="settingsExpanded" class="inventory-settings-actions">
                    <el-button v-permission="['updateInventoryManagement,POST']" :icon="Setting" @click="openColumnSettings">列设置</el-button>
                    <el-button v-permission="['updateInventoryManagement,POST']" :icon="CollectionTag" @click="openOptionSettings">列可选项</el-button>
                    <el-button v-permission="['getInventoryCalculations,GET']" :icon="DataAnalysis" @click="router.push('/inventory/calculations')">列计算</el-button>
                    <el-button
                        v-permission="['getInventoryColumnPermissions,GET']"
                        :icon="User"
                        @click="openColumnPermissionSettings"
                    >列可见权限</el-button>
                </div>
            </el-collapse-transition>
        </div>

        <el-alert title="库存管理仅用于信息登记，表格内容修改后会自动保存。" type="info" :closable="false" class="mb-4" />

        <el-table ref="tableRef" :data="rows" border stripe v-loading="loading" style="width: 100%" @selection-change="handleSelectionChange">
            <el-table-column type="selection" width="48" fixed="left" />
            <el-table-column label="序号" width="72" align="center" fixed="left">
                <template #default="{ $index }">
                    {{ (currentPage - 1) * pageSize + $index + 1 }}
                </template>
            </el-table-column>
            <el-table-column v-for="column in columns" :key="column.key" :label="column.label" :min-width="column.width" :fixed="column.fixed || false">
                <template #default="{ row }">
                    <div :class="{ 'inventory-image-cell': isImageColumn(column) }">
                        <div v-if="isTimeColumn(column)" class="inventory-time-node-cell">
                            <span>{{ row[column.key] || '未记录' }}</span>
                            <el-button
                                link
                                type="primary"
                                :disabled="!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)"
                                @click="recordTimeNode(row, column)"
                            >{{ row[column.key] ? '重新记录' : '记录时间' }}</el-button>
                        </div>
                        <div
                            v-else-if="column.options?.length"
                            class="inventory-option-select-cell"
                            :style="getOptionCellStyle(row[column.key], column)"
                        >
                            <el-select
                                v-model="row[column.key]"
                                class="inventory-option-select"
                                :disabled="!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)"
                                :placeholder="isCalculatedColumn(column.key) ? '自动计算' : `请选择${column.label}`"
                                @change="saveCell(row, column.key)"
                            >
                                <el-option v-for="option in column.options" :key="getOptionLabel(option)" :label="getOptionLabel(option)" :value="getOptionLabel(option)">
                                    <span class="inventory-option-dropdown-item" :style="getOptionDropdownStyle(option)">
                                        <i v-if="getOptionColor(option)" class="inventory-option-color-swatch" :style="getOptionStyle(option)" />
                                        {{ getOptionLabel(option) }}
                                    </span>
                                </el-option>
                            </el-select>
                        </div>
                        <el-input
                            v-else
                            v-model="row[column.key]"
                            :disabled="!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)"
                            :placeholder="isCalculatedColumn(column.key) ? '自动计算' : `请输入${column.label}`"
                            @input="scheduleSave(row, column.key)"
                            @blur="saveCell(row, column.key)"
                            @keyup.enter="saveCell(row, column.key, true)"
                        />
                        <div v-if="isImageColumn(column)" class="inventory-image-actions">
                            <el-button link type="primary" :disabled="!isInventoryColumnEditable(column)" @click="openImageEditor(row, column)">编辑内容</el-button>
                            <el-button link type="primary" :disabled="!getImageUrls(row, column).length" @click="openImagePreview(row, column)">查看详情</el-button>
                        </div>
                    </div>
                </template>
            </el-table-column>
        </el-table>

        <el-dialog v-model="detailVisible" title="完整文本编辑" width="min(900px, 92vw)" destroy-on-close>
            <el-form v-if="detailRow" label-position="top" class="detail-form">
                <el-form-item v-for="column in columns" :key="column.key" :label="column.label">
                    <div v-if="isTimeColumn(column)" class="inventory-time-node-detail">
                        <span>{{ detailRow[column.key] || '未记录' }}</span>
                        <el-button
                            type="primary"
                            plain
                            size="small"
                            :disabled="!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)"
                            @click="recordTimeNode(detailRow, column)"
                        >{{ detailRow[column.key] ? '重新记录当前时间' : '记录当前时间' }}</el-button>
                    </div>
                    <div
                        v-else-if="column.options?.length"
                        class="inventory-option-select-cell"
                        :style="getOptionCellStyle(detailRow[column.key], column)"
                    >
                        <el-select
                            :ref="(element) => setDetailFieldRef(column.key, element)"
                            v-model="detailRow[column.key]"
                            class="w-full inventory-option-select"
                            :disabled="!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)"
                            :placeholder="isCalculatedColumn(column.key) ? '自动计算' : `请选择${column.label}`"
                            @change="saveCell(detailRow, column.key)"
                        >
                            <el-option v-for="option in column.options" :key="getOptionLabel(option)" :label="getOptionLabel(option)" :value="getOptionLabel(option)">
                                <span class="inventory-option-dropdown-item" :style="getOptionDropdownStyle(option)">
                                    <i v-if="getOptionColor(option)" class="inventory-option-color-swatch" :style="getOptionStyle(option)" />
                                    {{ getOptionLabel(option) }}
                                </span>
                            </el-option>
                        </el-select>
                    </div>
                    <el-input
                        v-else
                        :ref="(element) => setDetailFieldRef(column.key, element)"
                        v-model="detailRow[column.key]"
                        type="textarea"
                        :disabled="!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)"
                        :rows="column.key === 'recycle_address' || column.key === 'sale_address' || column.key === 'remark_info' || column.key === 'inspection_result' ? 5 : 3"
                        :placeholder="`请输入${column.label}`"
                        @input="scheduleSave(detailRow, column.key)"
                        @blur="saveCell(detailRow, column.key)"
                        @keydown.enter.stop
                    />
                    <ChooseImage
                        v-if="isImageColumn(column)"
                        v-model="detailRow[imageValueKey(column)]"
                        :limit="9"
                        :preview="true"
                        @update:model-value="saveCell(detailRow, imageValueKey(column))"
                    />
                </el-form-item>
            </el-form>
        </el-dialog>

        <el-dialog v-model="imagePreviewVisible" :title="imagePreviewTitle" width="min(900px, 92vw)" destroy-on-close>
            <div v-if="imagePreviewRow" class="inventory-detail-preview">
                <section class="inventory-detail-text">
                    <div class="inventory-detail-section-title">文本信息</div>
                    <el-descriptions :column="2" border>
                        <el-descriptions-item v-for="column in textColumns" :key="column.key" :label="column.label">
                            <span class="inventory-detail-value">{{ getDisplayValue(imagePreviewRow, column) }}</span>
                        </el-descriptions-item>
                    </el-descriptions>
                </section>
                <section class="inventory-detail-images">
                    <div class="inventory-detail-section-title">图片信息</div>
                    <div v-if="imagePreviewUrls.length" class="inventory-image-preview">
                        <el-carousel v-model="imagePreviewIndex" height="320px" arrow="always" indicator-position="outside">
                            <el-carousel-item v-for="(url, index) in imagePreviewUrls" :key="url + index">
                                <el-image :src="url" fit="contain" class="inventory-image-preview-main" :preview-src-list="imagePreviewUrls" :initial-index="index" />
                            </el-carousel-item>
                        </el-carousel>
                        <div class="inventory-image-thumbnails">
                            <button v-for="(url, index) in imagePreviewUrls" :key="`thumb-${url}-${index}`" type="button" :class="{ 'is-active': imagePreviewIndex === index }" @click="imagePreviewIndex = index">
                                <img :src="url" alt="图片缩略图" />
                            </button>
                        </div>
                    </div>
                    <el-empty v-else description="暂无图片" :image-size="72" />
                </section>
            </div>
        </el-dialog>

        <el-dialog
            v-model="columnSettingsVisible"
            title="列设置"
            width="min(920px, 94vw)"
            destroy-on-close
            :close-on-click-modal="!columnSettingsSaving"
            :close-on-press-escape="!columnSettingsSaving"
            :before-close="handleColumnSettingsBeforeClose"
            @closed="resetColumnSettingsDraft"
        >
            <div class="column-settings-list">
                <div
                    v-for="column in columnSettingsDraft"
                    :key="column.draftId"
                    class="column-settings-item"
                    :class="{
                        'is-dragging': draggingColumnKey === column.draftId,
                        'is-drag-over': dragOverColumnKey === column.draftId,
                    }"
                    @dragover.prevent="handleColumnDragOver($event, column)"
                    @drop.prevent="handleColumnDrop($event, column)"
                >
                    <el-tooltip content="拖动调整顺序" placement="top">
                        <span
                            class="column-drag-handle"
                            :class="{ 'is-disabled': !canUpdateInventory || columnSettingsSaving }"
                            :draggable="canUpdateInventory && !columnSettingsSaving"
                            aria-label="拖动调整顺序"
                            @dragstart="handleColumnDragStart($event, column)"
                            @dragend="handleColumnDragEnd"
                        >
                            <el-icon><Rank /></el-icon>
                        </span>
                    </el-tooltip>
                    <el-input
                        v-model="column.label"
                        maxlength="40"
                        show-word-limit
                        :disabled="columnSettingsSaving"
                    />
                    <el-input-number
                        v-model="column.sort"
                        class="column-sort-input"
                        :min="1"
                        :step="1"
                        :precision="0"
                        :disabled="columnSettingsSaving"
                        placeholder="排序"
                        controls-position="right"
                        @change="handleDraftColumnSortChange(column, $event)"
                    />
                    <el-select
                        v-model="column.fixed"
                        class="column-fixed-select"
                        :disabled="columnSettingsSaving"
                    >
                        <el-option label="不固定" value="" />
                        <el-option label="固定左侧" value="left" />
                        <el-option label="固定右侧" value="right" />
                    </el-select>
                    <el-radio-group
                        v-model="column.fieldType"
                        class="column-field-type-switch"
                        :disabled="columnSettingsSaving"
                    >
                        <el-radio-button label="text">文本</el-radio-button>
                        <el-radio-button label="image">图片</el-radio-button>
                        <el-radio-button label="time">时间</el-radio-button>
                    </el-radio-group>
                    <el-tooltip content="删除此列" placement="top" :enterable="false">
                        <el-button
                            v-permission="['deleteInventoryManagement,POST']"
                            type="danger"
                            plain
                            circle
                            :icon="Delete"
                            :disabled="columnSettingsDraft.length <= 1 || columnSettingsSaving"
                            @click="removeColumn(column)"
                        />
                    </el-tooltip>
                </div>
            </div>
            <template #footer>
                <el-button :disabled="columnSettingsSaving" @click="cancelColumnSettings">取消</el-button>
                <el-button v-permission="['updateInventoryManagement,POST']" :icon="Plus" :disabled="columnSettingsSaving" @click="addColumn">新增列</el-button>
                <el-button
                    v-permission="['updateInventoryManagement,POST']"
                    type="primary"
                    :loading="columnSettingsSaving"
                    @click="saveColumnSettings"
                >保存</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="newColumnDialogVisible" title="新增列" width="min(460px, 92vw)" append-to-body destroy-on-close>
            <el-form label-position="top">
                <el-form-item label="列标题" required>
                    <el-input v-model="newColumnLabel" maxlength="40" show-word-limit placeholder="请输入列标题" @keyup.enter="confirmAddColumn" />
                </el-form-item>
                <el-form-item label="列类型">
                    <el-radio-group v-model="newColumnFieldType">
                        <el-radio-button label="text">文本</el-radio-button>
                        <el-radio-button label="image">图片</el-radio-button>
                        <el-radio-button label="time">时间节点</el-radio-button>
                    </el-radio-group>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="newColumnDialogVisible = false">取消</el-button>
                <el-button type="primary" @click="confirmAddColumn">新增</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="optionSettingsVisible" title="列可选项" width="min(920px, 94vw)" destroy-on-close>
            <el-form label-width="88px">
                <el-form-item label="选择列">
                    <el-select v-model="optionColumnKey" class="w-full" placeholder="请点击这里" @change="loadColumnOptions">
                        <el-option v-for="column in columns" :key="column.key" :label="column.label" :value="column.key" />
                    </el-select>
                </el-form-item>
                <el-form-item label="添加选项">
                    <div class="column-option-add">
                        <el-input v-model="optionDraft" maxlength="40" placeholder="例如：b站" @keyup.enter="addColumnOption" />
                        <el-button type="primary" :disabled="!optionColumnKey" @click="addColumnOption">添加</el-button>
                    </div>
                </el-form-item>
                <el-form-item label="下拉选项">
                    <div class="column-option-editor">
                        <div v-if="optionValues.length" class="column-option-settings-list">
                            <div
                                v-for="(option, index) in optionValues"
                                :key="getOptionLabel(option)"
                                class="column-option-settings-item"
                                :class="{
                                    'is-dragging': draggingOptionValue === option,
                                    'is-drag-over': dragOverOptionValue === option,
                                }"
                                @dragover.prevent="handleOptionDragOver($event, option)"
                                @drop.prevent="handleOptionDrop($event, option)"
                            >
                                <el-tooltip content="拖动调整顺序" placement="top">
                                    <span
                                        class="column-drag-handle"
                                        :class="{ 'is-disabled': !canUpdateInventory }"
                                        :draggable="canUpdateInventory"
                                        aria-label="拖动调整顺序"
                                        @dragstart="handleOptionDragStart($event, option)"
                                        @dragend="handleOptionDragEnd"
                                    >
                                        <el-icon><Rank /></el-icon>
                                    </span>
                                </el-tooltip>
                                <el-input
                                    :model-value="getOptionLabel(option)"
                                    maxlength="40"
                                    @update:model-value="updateColumnOptionLabel(index, $event)"
                                />
                                <el-popover trigger="click" placement="bottom" width="260">
                                    <template #reference>
                                        <el-button class="column-option-color-button" plain>
                                            <i class="column-option-color-preview" :style="getOptionBackgroundPreviewStyle(option)" />
                                            选项框颜色
                                        </el-button>
                                    </template>
                                    <el-color-picker
                                        :model-value="getOptionColor(option)"
                                        :predefine="optionColorPresets"
                                        @change="updateColumnOptionColor(index, $event)"
                                    />
                                </el-popover>
                                <el-popover trigger="click" placement="bottom" width="260">
                                    <template #reference>
                                        <el-button class="column-option-color-button" plain>
                                            <i class="column-option-color-preview" :style="getOptionTextPreviewStyle(option)" />
                                            文字颜色
                                        </el-button>
                                    </template>
                                    <el-color-picker
                                        :model-value="getOptionTextColorSetting(option)"
                                        :predefine="optionTextColorPresets"
                                        @change="updateColumnOptionTextColor(index, $event)"
                                    />
                                </el-popover>
                                <el-input-number
                                    :model-value="index + 1"
                                    class="column-option-sort-input"
                                    :min="1"
                                    :max="optionValues.length"
                                    :step="1"
                                    :precision="0"
                                    controls-position="right"
                                    @change="handleOptionSortChange(option, $event)"
                                />
                                <el-tooltip content="删除此选项" placement="top">
                                    <el-button
                                        type="danger"
                                        plain
                                        circle
                                        :icon="Delete"
                                        @click="removeColumnOption(option)"
                                    />
                                </el-tooltip>
                            </div>
                        </div>
                        <el-empty v-else :image-size="56" description="暂无选项" />
                    </div>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="optionSettingsVisible = false">取消</el-button>
                <el-button type="primary" :disabled="!optionColumnKey" @click="saveColumnOptions">保存</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="columnPermissionVisible" title="列可见权限" width="min(680px, 92vw)" destroy-on-close>
            <el-form label-width="88px" v-loading="columnPermissionLoading">
                <el-form-item label="搜索员工">
                    <el-input
                        v-model="permissionStaffKeyword"
                        clearable
                        placeholder="请输入姓名或登录账号"
                    />
                </el-form-item>
                <el-form-item label="选择员工">
                    <el-select
                        v-model="permissionStaffId"
                        class="w-full"
                        placeholder="请选择员工"
                        :disabled="columnPermissionLoading || !permissionStaffList.length"
                        @change="loadPermissionForStaff"
                    >
                        <el-option
                            v-for="staff in filteredPermissionStaffList"
                            :key="staff.id"
                            :label="`${staff.name || staff.account}（${staff.account}）`"
                            :value="staff.id"
                        />
                    </el-select>
                </el-form-item>
            </el-form>
            <div v-if="permissionStaffList.length" class="column-permission-list">
                <div v-for="column in permissionColumns" :key="column.key" class="column-permission-item">
                    <span class="column-permission-label">{{ column.label }}</span>
                    <el-switch
                        :model-value="permissionVisibleKeys.includes(column.key)"
                        active-text="显示"
                        inactive-text="隐藏"
                        @change="toggleColumnPermission(column.key, $event)"
                    />
                    <el-radio-group
                        :model-value="permissionEditableKeys.includes(column.key) ? 'editable' : 'readonly'"
                        class="column-permission-mode"
                        size="small"
                        :disabled="!permissionVisibleKeys.includes(column.key)"
                        @change="toggleColumnPermissionMode(column.key, $event)"
                    >
                        <el-radio-button label="readonly">只读</el-radio-button>
                        <el-radio-button label="editable">可修改</el-radio-button>
                    </el-radio-group>
                </div>
            </div>
            <el-empty v-else-if="!columnPermissionLoading" description="暂无员工账号" />
            <template #footer>
                <el-button @click="columnPermissionVisible = false">取消</el-button>
                <el-button
                    v-permission="['updateInventoryColumnPermissions,POST']"
                    type="primary"
                    :loading="columnPermissionSaving"
                    :disabled="!permissionStaffId || !permissionColumns.length"
                    @click="saveColumnPermissions"
                >保存</el-button>
            </template>
        </el-dialog>

        <div class="mt-5 flex justify-center">
            <el-pagination
                background
                layout="prev, pager, next, total"
                :current-page="currentPage"
                :page-size="pageSize"
                :total="total"
                @current-change="loadData"
            />
        </div>
    </el-card>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, CollectionTag, DataAnalysis, Delete, Document, Download, Plus, Rank, Refresh, Search, Setting, User } from '@element-plus/icons-vue'
import { hasPermission } from '~/directive/permission'
import { toast } from '~/composables/util'
import ChooseImage from '~/components/ChooseImage.vue'
import {
    createInventoryColumn,
    createInventoryItem,
    deleteInventoryColumn,
    deleteInventoryItems,
    exportInventoryData,
    getInventoryColumns,
    getInventoryColumnPermissions,
    getInventoryList,
    updateInventoryColumn,
    updateInventoryColumnPermissions,
    updateInventoryItem,
} from '~/api/inventory'

const defaultColumns = [
    { key: 'inspection_report', label: '检测报告', width: 200, fixed: 'left' },
    { key: 'inventory_number', label: '编号', width: 200, fixed: 'left' },
    { key: 'sf_express_number', label: '顺丰单号', width: 200, fixed: 'left' },
    { key: 'payment_status', label: '钱款情况', width: 200, fixed: 'left' },
    { key: 'machine_status', label: '机器状态', width: 200 },
    { key: 'promotion_source', label: '推广来源', width: 200 },
    { key: 'recycle_communication_platform', label: '回收沟通平台', width: 200 },
    { key: 'recycle_id', label: '回收ID', width: 200 },
    { key: 'recycle_address', label: '回收地址', width: 200 },
    { key: 'communication_price', label: '沟通价格', width: 200 },
    { key: 'paid_price', label: '已付价格', width: 200 },
    { key: 'recycle_freight', label: '回收运费', width: 200 },
    { key: 'final_sale_price', label: '最终售价', width: 200 },
    { key: 'sale_freight', label: '售出运费', width: 200 },
    { key: 'platform_fee', label: '平台费', width: 200 },
    { key: 'profit', label: '利润', width: 200 },
    { key: 'sale_channel', label: '售出渠道', width: 200 },
    { key: 'sale_id', label: '售出ID', width: 200 },
    { key: 'sale_address', label: '售出地址', width: 200 },
    { key: 'created_time_text', label: '创建时间', width: 200 },
    { key: 'remark_info', label: '备注信息', width: 200 },
    { key: 'inspection_result', label: '检测结果', width: 200 },
]
const router = useRouter()
const columns = ref([])
const emptyRow = () => columns.value.reduce((row, column) => ({ ...row, [column.key]: '' }), {})
const rows = ref([])
const keyword = ref('')
const canSearchInventory = computed(() => hasPermission(['searchInventoryManagement,GET']))
const canUpdateInventory = computed(() => hasPermission(['updateInventoryManagement,POST']))
const exporting = ref(false)
const settingsExpanded = ref(false)
const currentPage = ref(1)
const pageSize = 10
const total = ref(0)
const loading = ref(false)
const tableRef = ref(null)
const selectedRows = ref([])
const detailVisible = ref(false)
const detailRow = ref(null)
const detailFocusColumnKey = ref('')
const detailFieldRefs = new Map()
const imagePreviewVisible = ref(false)
const imagePreviewRow = ref(null)
const imagePreviewUrls = ref([])
const imagePreviewIndex = ref(0)
const imagePreviewTitle = ref('图片详情')
const columnSettingsVisible = ref(false)
const columnSettingsDraft = ref([])
const draggingColumnKey = ref('')
const dragOverColumnKey = ref('')
const columnSettingsSaving = ref(false)
const optionSettingsVisible = ref(false)
const optionColumnKey = ref('')
const optionValues = ref([])
const optionDraft = ref('')
const draggingOptionValue = ref(null)
const dragOverOptionValue = ref(null)
const columnPermissionVisible = ref(false)
const columnPermissionLoading = ref(false)
const columnPermissionSaving = ref(false)
const permissionStaffList = ref([])
const permissionStaffKeyword = ref('')
const permissionColumns = ref([])
const permissionConfigs = ref([])
const permissionStaffId = ref(0)
const permissionVisibleKeys = ref([])
const permissionEditableKeys = ref([])
const filteredPermissionStaffList = computed(() => {
    const keyword = String(permissionStaffKeyword.value || '').trim().toLowerCase()
    if (!keyword) return permissionStaffList.value
    return permissionStaffList.value.filter((staff) => {
        const name = String(staff.name || '').toLowerCase()
        const account = String(staff.account || '').toLowerCase()
        return name.includes(keyword) || account.includes(keyword)
    })
})
const saving = new Set()
const saveTimers = new Map()
const INVENTORY_UPDATED_EVENT = 'inventory-management-updated'
let requestSequence = 0
let activeRequestKey = ''
const isCalculatedColumn = (key) => Boolean(columns.value.find((column) => column.key === key)?.calculated)
const isInventoryColumnEditable = (column) => canUpdateInventory.value && column?.editable !== false
const isImageColumn = (column) => String(column?.fieldType || column?.field_type || '').toLowerCase() === 'image'
const isTimeColumn = (column) => String(column?.fieldType || column?.field_type || '').toLowerCase() === 'time'
const imageValueKey = (columnOrKey) => `${typeof columnOrKey === 'string' ? columnOrKey : columnOrKey?.key || ''}__images`
const optionColorPresets = ['#D9F2E5', '#FFF0B3', '#FFD9D9', '#DDEBFF', '#EADCF8', '#D9F3F0']
const defaultOptionTextColor = '#000000'
const optionTextColorPresets = [defaultOptionTextColor, '#FFFFFF', '#1677FF', '#16A34A', '#DC2626', '#7C3AED']
const normalizeOptionColor = (value) => {
    const color = String(value || '').trim()
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : ''
}
const normalizeColumnOption = (option) => {
    const source = option && typeof option === 'object' && !Array.isArray(option) ? option : {}
    const label = String(typeof option === 'string' ? option : (source.label ?? source.value ?? '')).trim().slice(0, 40)
    return {
        label,
        color: normalizeOptionColor(source.color),
        textColor: normalizeOptionColor(source.textColor ?? source.text_color) || defaultOptionTextColor,
    }
}
const normalizeColumnOptions = (options) => {
    const seen = new Set()
    return (Array.isArray(options) ? options : [])
        .map(normalizeColumnOption)
        .filter((option) => option.label && !seen.has(option.label) && seen.add(option.label))
        .slice(0, 100)
}
const getOptionLabel = (option) => normalizeColumnOption(option).label
const getOptionColor = (option) => normalizeColumnOption(option).color
const getOptionTextColorSetting = (option) => normalizeColumnOption(option).textColor
const getOptionTextColor = (option) => getOptionTextColorSetting(option)
const getOptionStyle = (option) => {
    const color = getOptionColor(option)
    return color ? { backgroundColor: color, borderColor: color, color: getOptionTextColor(option) } : {}
}
const getOptionBackgroundPreviewStyle = (option) => {
    const color = getOptionColor(option)
    return color ? { backgroundColor: color, borderColor: color } : {}
}
const getOptionTextPreviewStyle = (option) => {
    const color = getOptionTextColorSetting(option)
    return color ? { backgroundColor: color, borderColor: color } : {}
}
const getOptionDropdownStyle = (option) => {
    const color = getOptionColor(option)
    const textColor = getOptionTextColor(option)
    return color || textColor ? {
        ...(color ? { backgroundColor: color } : {}),
        ...(textColor ? { color: textColor } : {}),
    } : {}
}
const getOptionCellStyle = (value, column) => {
    const option = (column?.options || []).find((item) => getOptionLabel(item) === String(value ?? ''))
    const color = getOptionColor(option)
    const textColor = getOptionTextColor(option)
    return color || textColor ? {
        ...(color ? { '--inventory-option-color': color } : {}),
        ...(textColor ? { '--inventory-option-text-color': textColor } : {}),
    } : {}
}
const textColumns = computed(() => columns.value.filter((column) => !isImageColumn(column)))
const getImageUrls = (row, column) => {
    const value = row?.[imageValueKey(column)] ?? row?.[column?.key]
    if (Array.isArray(value)) return value.filter(Boolean).slice(0, 9)
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 9) : []
        } catch (_error) { return [] }
    }
    return []
}
const getDisplayValue = (row, column) => {
    const value = row?.[column?.key]
    if (value === null || value === undefined || value === '') return '-'
    return String(value)
}

const loadData = async (page = 1, force = false) => {
    const nextPage = Math.max(1, Number(page || 1))
    const requestKey = `${nextPage}:${keyword.value}`
    if (!force && loading.value && activeRequestKey === requestKey) return

    currentPage.value = nextPage
    activeRequestKey = requestKey
    const requestId = ++requestSequence
    loading.value = true
    try {
        const res = await getInventoryList(nextPage, { keyword: keyword.value, limit: pageSize })
        if (requestId !== requestSequence) return
        total.value = Number(res.totalCount || 0)
        rows.value = Array.isArray(res.list) ? res.list : []
        selectedRows.value = []
        tableRef.value?.clearSelection()
    } finally {
        if (requestId === requestSequence) loading.value = false
    }
}

const loadColumns = async () => {
    const configuredColumns = await getInventoryColumns()
    columns.value = Array.isArray(configuredColumns) && configuredColumns.length
        ? configuredColumns.map((column, index) => {
            const defaultColumn = defaultColumns.find((item) => item.key === column.key)
            return {
                ...defaultColumn,
                ...column,
                options: normalizeColumnOptions(column.options),
                editable: column.editable !== false,
                width: Number(column.width) || defaultColumn?.width || 200,
                sort: Math.max(1, Number(column.sort) || index + 1),
            }
        })
        : defaultColumns.map((column, index) => ({ ...column, sort: index + 1 }))
    columns.value.sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0))
}

const handleExternalInventoryUpdate = (event) => {
    if (event?.detail?.source === 'inventory-page') return
    if (['column-settings', 'column-options', 'calculation'].includes(event?.detail?.action)) {
        Promise.all([loadColumns(), loadData(currentPage.value)])
        return
    }
    loadData(currentPage.value)
}

const notifyInventoryUpdated = (action) => {
    window.dispatchEvent(new CustomEvent(INVENTORY_UPDATED_EVENT, {
        detail: { action, source: 'inventory-page' },
    }))
}

const exportData = async (format = 'xlsx') => {
    exporting.value = true
    try {
        const normalizedFormat = format === 'csv' ? 'csv' : 'xlsx'
        const data = await exportInventoryData({ keyword: keyword.value, format: normalizedFormat })
        const url = window.URL.createObjectURL(new Blob([data], {
            type: normalizedFormat === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }))
        const link = document.createElement('a')
        link.style.display = 'none'
        link.href = url
        link.download = `库存数据_${new Date().toISOString().slice(0, 10)}.${normalizedFormat}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
        toast(`库存数据已导出为 .${normalizedFormat}`)
    } finally {
        exporting.value = false
    }
}

const addRow = async () => {
    try {
        await ElMessageBox.confirm('是否新增一条记录？', '新增库存记录', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning',
        })
    } catch (error) {
        if (error === 'cancel' || error === 'close') return
        throw error
    }
    loading.value = true
    try {
        // 列表按最新记录倒序展示，新增编号只以前端当前显示的首条机器编号递增。
        await createInventoryItem({
            ...emptyRow(),
            last_displayed_inventory_number: rows.value[0]?.inventory_number || '',
        })
        // 新记录按服务端最新顺序显示在第一页，确保编号、配送字段和序号同步。
        await loadData(1, true)
        notifyInventoryUpdated('create')
        toast('已新增并刷新，可直接填写')
    } finally {
        loading.value = false
    }
}

const saveCell = async (row, key, focusNext = false) => {
    const column = columns.value.find((item) => item.key === key)
    if (!isInventoryColumnEditable(column) || !row.id || isCalculatedColumn(key) || saving.has(`${row.id}:${key}`)) return
    const timerKey = `${row.id}:${key}`
    const timer = saveTimers.get(timerKey)
    if (timer) {
        window.clearTimeout(timer)
        saveTimers.delete(timerKey)
    }
    saving.add(`${row.id}:${key}`)
    try {
        const saved = await updateInventoryItem(row.id, { [key]: row[key] })
        Object.assign(row, saved)
        notifyInventoryUpdated('update')
        if (focusNext) {
            const target = document.activeElement
            if (target && typeof target.blur === 'function') target.blur()
        }
    } finally {
        saving.delete(`${row.id}:${key}`)
    }
}

const formatCurrentTimeNode = (date = new Date()) => {
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const recordTimeNode = async (row, column) => {
    if (!isInventoryColumnEditable(column) || isCalculatedColumn(column.key)) return
    row[column.key] = formatCurrentTimeNode()
    await saveCell(row, column.key)
}

const scheduleSave = (row, key) => {
    const column = columns.value.find((item) => item.key === key)
    if (!isInventoryColumnEditable(column) || isCalculatedColumn(key)) return
    const timerKey = `${row.id}:${key}`
    const previousTimer = saveTimers.get(timerKey)
    if (previousTimer) window.clearTimeout(previousTimer)
    saveTimers.set(timerKey, window.setTimeout(() => saveCell(row, key), 600))
}

const handleSelectionChange = (selection) => {
    selectedRows.value = selection
}

const removeSelectedRows = async () => {
    if (!selectedRows.value.length) return
    const selectedCount = selectedRows.value.length
    const shouldGoPreviousPage = rows.value.length === selectedCount && currentPage.value > 1
    await ElMessageBox.confirm(`确定删除选中的 ${selectedRows.value.length} 条库存登记吗？`, '提示', { type: 'warning' })
    await deleteInventoryItems(selectedRows.value.map((row) => row.id))
    toast('批量删除成功')
    notifyInventoryUpdated('delete')
    selectedRows.value = []
    tableRef.value?.clearSelection()
    await loadData(shouldGoPreviousPage ? currentPage.value - 1 : currentPage.value)
}

const openDetail = () => {
    if (selectedRows.value.length !== 1) {
        toast('请只勾选一条记录', 'warning')
        return
    }
    detailRow.value = selectedRows.value[0]
    detailFocusColumnKey.value = ''
    detailVisible.value = true
}

const setDetailFieldRef = (key, element) => {
    if (element) detailFieldRefs.set(key, element)
    else detailFieldRefs.delete(key)
}

const focusDetailField = async (key) => {
    if (!key) return
    await nextTick()
    const field = detailFieldRefs.get(key)
    if (!field) return
    if (typeof field.focus === 'function') field.focus()
    const element = field.$el || field
    element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}

const openImageEditor = (row, column) => {
    detailRow.value = row
    detailFocusColumnKey.value = column.key
    detailVisible.value = true
    focusDetailField(column.key)
}

const openImagePreview = (row, column) => {
    imagePreviewRow.value = row
    imagePreviewUrls.value = getImageUrls(row, column)
    imagePreviewIndex.value = 0
    imagePreviewTitle.value = `${column.label}详情`
    imagePreviewVisible.value = true
}

const createColumnSettingsDraft = (column, index) => ({
    ...column,
    draftId: column.key || `column_${index}`,
    options: Array.isArray(column.options) ? [...column.options] : [],
    fieldType: ['image', 'time'].includes(column.fieldType) ? column.fieldType : 'text',
    fixed: column.fixed || '',
    sort: index + 1,
})

const normalizeDraftColumnSorts = () => {
    columnSettingsDraft.value.forEach((column, index) => {
        column.sort = index + 1
    })
}

const openColumnSettings = () => {
    columnSettingsDraft.value = columns.value.map(createColumnSettingsDraft)
    normalizeDraftColumnSorts()
    handleColumnDragEnd()
    columnSettingsVisible.value = true
}

const resetColumnSettingsDraft = () => {
    columnSettingsDraft.value = []
    handleColumnDragEnd()
}

const cancelColumnSettings = () => {
    columnSettingsVisible.value = false
}

const handleColumnSettingsBeforeClose = (done) => {
    if (!columnSettingsSaving.value) done()
}

const handleColumnDragStart = (event, column) => {
    if (!canUpdateInventory.value || columnSettingsSaving.value) return
    draggingColumnKey.value = column.draftId
    dragOverColumnKey.value = ''
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', column.draftId)
    }
}

const handleColumnDragOver = (event, column) => {
    if (!draggingColumnKey.value || draggingColumnKey.value === column.draftId) return
    dragOverColumnKey.value = column.draftId
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const handleColumnDragEnd = () => {
    draggingColumnKey.value = ''
    dragOverColumnKey.value = ''
}

const handleColumnDrop = (event, targetColumn) => {
    const sourceKey = draggingColumnKey.value || event.dataTransfer?.getData('text/plain')
    if (!sourceKey || sourceKey === targetColumn.draftId) {
        handleColumnDragEnd()
        return
    }
    const sourceIndex = columnSettingsDraft.value.findIndex((column) => column.draftId === sourceKey)
    const targetIndex = columnSettingsDraft.value.findIndex((column) => column.draftId === targetColumn.draftId)
    if (sourceIndex < 0 || targetIndex < 0) {
        handleColumnDragEnd()
        return
    }
    const reordered = [...columnSettingsDraft.value]
    const [movedColumn] = reordered.splice(sourceIndex, 1)
    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
    reordered.splice(insertIndex, 0, movedColumn)
    columnSettingsDraft.value = reordered
    normalizeDraftColumnSorts()
    handleColumnDragEnd()
}

const handleDraftColumnSortChange = (column, nextSort) => {
    const sourceIndex = columnSettingsDraft.value.findIndex((item) => item.draftId === column.draftId)
    if (sourceIndex < 0) return
    const targetIndex = Math.min(
        columnSettingsDraft.value.length - 1,
        Math.max(0, Math.trunc(Number(nextSort) || 1) - 1)
    )
    if (sourceIndex === targetIndex) {
        normalizeDraftColumnSorts()
        return
    }
    const reordered = [...columnSettingsDraft.value]
    const [movedColumn] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, movedColumn)
    columnSettingsDraft.value = reordered
    normalizeDraftColumnSorts()
}

const openOptionSettings = () => {
    optionColumnKey.value = ''
    optionValues.value = []
    optionDraft.value = ''
    handleOptionDragEnd()
    optionSettingsVisible.value = true
}

const loadColumnOptions = () => {
    const column = columns.value.find((item) => item.key === optionColumnKey.value)
    optionValues.value = normalizeColumnOptions(column?.options)
    optionDraft.value = ''
    handleOptionDragEnd()
}

const handleOptionDragStart = (event, option) => {
    if (!canUpdateInventory.value) return
    draggingOptionValue.value = option
    dragOverOptionValue.value = null
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', getOptionLabel(option))
    }
}

const handleOptionDragOver = (event, option) => {
    if (!draggingOptionValue.value || draggingOptionValue.value === option) return
    dragOverOptionValue.value = option
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const handleOptionDragEnd = () => {
    draggingOptionValue.value = null
    dragOverOptionValue.value = null
}

const handleOptionDrop = (event, targetOption) => {
    const draggedValue = draggingOptionValue.value || event.dataTransfer?.getData('text/plain')
    const sourceOption = typeof draggedValue === 'object'
        ? draggedValue
        : optionValues.value.find((option) => getOptionLabel(option) === String(draggedValue || ''))
    if (!sourceOption || sourceOption === targetOption) {
        handleOptionDragEnd()
        return
    }
    const sourceIndex = optionValues.value.findIndex((option) => option === sourceOption)
    const targetIndex = optionValues.value.findIndex((option) => option === targetOption)
    if (sourceIndex < 0 || targetIndex < 0) {
        handleOptionDragEnd()
        return
    }
    const reordered = [...optionValues.value]
    const [movedOption] = reordered.splice(sourceIndex, 1)
    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
    reordered.splice(insertIndex, 0, movedOption)
    optionValues.value = reordered
    handleOptionDragEnd()
}

const handleOptionSortChange = (option, nextSort) => {
    const sourceIndex = optionValues.value.findIndex((item) => item === option)
    if (sourceIndex < 0) return
    const targetIndex = Math.min(
        optionValues.value.length - 1,
        Math.max(0, Math.trunc(Number(nextSort) || 1) - 1)
    )
    if (sourceIndex === targetIndex) return
    const reordered = [...optionValues.value]
    const [movedOption] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, movedOption)
    optionValues.value = reordered
}

const loadPermissionForStaff = () => {
    const config = permissionConfigs.value.find((item) => Number(item.staffId) === Number(permissionStaffId.value))
    permissionVisibleKeys.value = Array.isArray(config?.visibleColumnKeys)
        ? [...config.visibleColumnKeys]
        : permissionColumns.value.map((column) => column.key)
    permissionEditableKeys.value = Array.isArray(config?.editableColumnKeys)
        ? [...config.editableColumnKeys]
        : [...permissionVisibleKeys.value]
}

const openColumnPermissionSettings = async () => {
    columnPermissionVisible.value = true
    permissionStaffKeyword.value = ''
    columnPermissionLoading.value = true
    try {
        const data = await getInventoryColumnPermissions()
        permissionStaffList.value = Array.isArray(data?.staff) ? data.staff : []
        permissionColumns.value = Array.isArray(data?.columns) ? data.columns : []
        permissionConfigs.value = Array.isArray(data?.permissions) ? data.permissions : []
        permissionStaffId.value = permissionStaffList.value.some((staff) => Number(staff.id) === Number(permissionStaffId.value))
            ? permissionStaffId.value
            : Number(permissionStaffList.value[0]?.id || 0)
        loadPermissionForStaff()
    } finally {
        columnPermissionLoading.value = false
    }
}

const toggleColumnPermission = (columnKey, visible) => {
    const nextKeys = new Set(permissionVisibleKeys.value)
    if (visible) {
        nextKeys.add(columnKey)
    } else {
        nextKeys.delete(columnKey)
    }
    if (!nextKeys.size) {
        toast('至少保留一列可见', 'warning')
        return
    }
    permissionVisibleKeys.value = permissionColumns.value
        .map((column) => column.key)
        .filter((key) => nextKeys.has(key))
}

const toggleColumnPermissionMode = (columnKey, mode) => {
    const nextKeys = new Set(permissionEditableKeys.value)
    if (mode === 'editable') {
        nextKeys.add(columnKey)
    } else {
        nextKeys.delete(columnKey)
    }
    permissionEditableKeys.value = permissionColumns.value
        .map((column) => column.key)
        .filter((key) => nextKeys.has(key) && permissionVisibleKeys.value.includes(key))
}

const saveColumnPermissions = async () => {
    if (!permissionStaffId.value || !permissionVisibleKeys.value.length) return
    columnPermissionSaving.value = true
    try {
        const saved = await updateInventoryColumnPermissions({
            staffId: permissionStaffId.value,
            visibleColumnKeys: permissionVisibleKeys.value,
            editableColumnKeys: permissionEditableKeys.value,
        })
        const config = permissionConfigs.value.find((item) => Number(item.staffId) === Number(permissionStaffId.value))
        if (config) {
            config.configured = true
            config.visibleColumnKeys = Array.isArray(saved?.visibleColumnKeys)
                ? [...saved.visibleColumnKeys]
                : [...permissionVisibleKeys.value]
            config.editableColumnKeys = Array.isArray(saved?.editableColumnKeys)
                ? [...saved.editableColumnKeys]
                : [...permissionEditableKeys.value]
        }
        columnPermissionVisible.value = false
        toast('列可见权限已保存')
    } finally {
        columnPermissionSaving.value = false
    }
}

const addColumnOption = () => {
    if (!optionColumnKey.value) {
        toast('请先选择列', 'warning')
        return
    }
    const option = String(optionDraft.value || '').trim().slice(0, 40)
    if (!option) {
        toast('请输入下拉选项', 'warning')
        return
    }
    if (optionValues.value.some((item) => getOptionLabel(item) === option)) {
        toast('该下拉选项已存在', 'warning')
        return
    }
    optionValues.value.push({ label: option, color: '', textColor: defaultOptionTextColor })
    optionDraft.value = ''
}

const updateColumnOptionLabel = (index, value) => {
    if (index < 0 || index >= optionValues.value.length) return
    optionValues.value[index] = { ...optionValues.value[index], label: String(value || '').slice(0, 40) }
}

const updateColumnOptionColor = (index, value) => {
    if (index < 0 || index >= optionValues.value.length) return
    optionValues.value[index] = { ...optionValues.value[index], color: normalizeOptionColor(value) }
}

const updateColumnOptionTextColor = (index, value) => {
    if (index < 0 || index >= optionValues.value.length) return
    optionValues.value[index] = { ...optionValues.value[index], textColor: normalizeOptionColor(value) || defaultOptionTextColor }
}

const removeColumnOption = (option) => {
    optionValues.value = optionValues.value.filter((item) => item !== option)
}

const saveColumnOptions = async () => {
    const column = columns.value.find((item) => item.key === optionColumnKey.value)
    if (!column) return
    const normalizedOptions = optionValues.value.map((option) => ({
        label: getOptionLabel(option),
        color: getOptionColor(option),
        textColor: getOptionTextColorSetting(option),
    }))
    if (normalizedOptions.some((option) => !option.label)) {
        toast('下拉选项不能为空', 'warning')
        return
    }
    if (new Set(normalizedOptions.map((option) => option.label)).size !== normalizedOptions.length) {
        toast('下拉选项不能重复', 'warning')
        return
    }
    const saved = await updateInventoryColumn(column.key, { options: normalizedOptions })
    Object.assign(column, saved)
    optionSettingsVisible.value = false
    notifyInventoryUpdated('column-options')
    toast('列可选项已保存')
}

const newColumnDialogVisible = ref(false)
const newColumnLabel = ref('')
const newColumnFieldType = ref('text')
const addColumn = () => {
    newColumnLabel.value = ''
    newColumnFieldType.value = 'text'
    newColumnDialogVisible.value = true
}
const confirmAddColumn = () => {
    const label = String(newColumnLabel.value || '').trim().slice(0, 40)
    if (!label) { toast('列标题不能为空', 'warning'); return }
    const id = 'draft_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    columnSettingsDraft.value.push({ key: id, draftId: id, label, fixed: '', width: 200, sort: columnSettingsDraft.value.length + 1, options: [], fieldType: newColumnFieldType.value, isDraft: true })
    normalizeDraftColumnSorts()
    newColumnDialogVisible.value = false
}

const removeColumn = async (column) => {
    if (columnSettingsDraft.value.length <= 1) return
    try {
        await ElMessageBox.confirm('确定删除“' + column.label + '”列吗？已填写的数据会保留，但不再显示。', '删除列', { type: 'warning' })
        columnSettingsDraft.value = columnSettingsDraft.value.filter((item) => item.draftId !== column.draftId)
        normalizeDraftColumnSorts()
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') throw error
    }
}

const saveColumnSettings = async () => {
    if (!canUpdateInventory.value || columnSettingsSaving.value) return
    for (const column of columnSettingsDraft.value) {
        const label = String(column.label || '').trim()
        if (!label) { toast('列标题不能为空', 'warning'); return }
        column.label = label
    }
    columnSettingsSaving.value = true
    try {
        const originalByKey = new Map(columns.value.map((column) => [column.key, column]))
        const keptKeys = new Set()
        for (let index = 0; index < columnSettingsDraft.value.length; index += 1) {
            const column = columnSettingsDraft.value[index]
            if (column.isDraft) {
                const created = await createInventoryColumn({ label: column.label, fieldType: column.fieldType })
                Object.assign(column, created, { isDraft: false, draftId: created.key })
            }
            keptKeys.add(column.key)
            const original = originalByKey.get(column.key)
            const payload = { label: column.label, fixed: column.fixed || '', sort: index + 1, fieldType: column.fieldType || 'text' }
            if (!original || original.label !== payload.label || (original.fixed || '') !== payload.fixed || Number(original.sort) !== payload.sort || (original.fieldType || 'text') !== payload.fieldType) await updateInventoryColumn(column.key, payload)
        }
        for (const original of columns.value) if (!keptKeys.has(original.key)) await deleteInventoryColumn(original.key)
        await loadColumns()
        columnSettingsVisible.value = false
        notifyInventoryUpdated('column-settings')
        toast('列设置已保存')
    } finally {
        columnSettingsSaving.value = false
    }
}

onMounted(async () => {
    window.addEventListener(INVENTORY_UPDATED_EVENT, handleExternalInventoryUpdate)
    await loadColumns()
    await loadData()
})

onBeforeUnmount(() => {
    window.removeEventListener(INVENTORY_UPDATED_EVENT, handleExternalInventoryUpdate)
    saveTimers.forEach((timer) => window.clearTimeout(timer))
    saveTimers.clear()
})
</script>

<style scoped>
.inventory-toolbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.inventory-toolbar-primary,
.inventory-settings-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
}

.inventory-toolbar-primary .el-input {
    max-width: 360px;
}

.inventory-settings-actions {
    align-self: flex-start;
}

.inventory-delete-button {
    margin-left: auto;
}

.detail-form {
    max-height: 65vh;
    overflow-y: auto;
    padding-right: 8px;
}

.column-settings-list {
    display: grid;
    gap: 12px;
    max-height: 55vh;
    overflow-y: auto;
    padding-right: 8px;
}

.column-settings-item {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 96px 128px 196px 32px;
    align-items: center;
    gap: 12px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    transition: border-color 0.15s ease, background-color 0.15s ease;
}

.column-settings-item.is-drag-over {
    border-color: var(--el-color-primary-light-5);
    background-color: var(--el-color-primary-light-9);
}

.column-drag-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 32px;
    color: var(--el-text-color-secondary);
    cursor: grab;
    user-select: none;
}

.column-drag-handle:active {
    cursor: grabbing;
}

.column-drag-handle.is-disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.column-fixed-select {
    width: 128px;
}

.column-field-type-switch {
    justify-self: end;
}

.inventory-time-node-cell,
.inventory-time-node-detail {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.inventory-time-node-cell span,
.inventory-time-node-detail span {
    color: var(--el-text-color-regular);
    white-space: nowrap;
}

.inventory-time-node-detail {
    width: 100%;
    min-height: 32px;
}

.inventory-image-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
}

.inventory-image-cell {
    display: grid;
    gap: 4px;
}

.inventory-option-select-cell {
    width: 100%;
    border-radius: 16px;
}

.inventory-option-select {
    width: 100%;
}

.inventory-option-select :deep(.el-select__wrapper) {
    background-color: var(--inventory-option-color, var(--el-fill-color-blank));
    color: var(--inventory-option-text-color, var(--el-text-color-regular));
    border-radius: 16px;
}

.inventory-option-select :deep(.el-select__selected-item) {
    color: var(--inventory-option-text-color, var(--el-text-color-regular));
}

.inventory-option-dropdown-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 8px;
    border-radius: 4px;
}

.inventory-option-color-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 1px solid transparent;
    border-radius: 50%;
}

.inventory-detail-preview {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 72vh;
    overflow-y: auto;
    padding-right: 6px;
}

.inventory-detail-section-title {
    margin-bottom: 10px;
    color: var(--el-text-color-primary);
    font-size: 15px;
    font-weight: 600;
}

.inventory-detail-value {
    display: block;
    max-height: 96px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
}

.inventory-detail-images {
    min-height: 160px;
}

.inventory-image-preview-main {
    display: block;
    width: 100%;
    height: 360px;
}

.inventory-image-thumbnails {
    display: flex;
    gap: 8px;
    padding-top: 12px;
    overflow-x: auto;
}

.inventory-image-thumbnails button {
    flex: 0 0 64px;
    width: 64px;
    height: 64px;
    padding: 2px;
    border: 1px solid var(--el-border-color);
    background: #fff;
    cursor: pointer;
}

.inventory-image-thumbnails button.is-active {
    border-color: var(--el-color-primary);
}

.inventory-image-thumbnails img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.column-sort-input {
    width: 96px;
}

.column-option-editor {
    width: 100%;
}

.column-option-settings-list {
    display: grid;
    gap: 8px;
    max-height: 40vh;
    overflow-y: auto;
    padding: 4px 8px 12px 0;
}

.column-option-settings-item {
    display: grid;
    grid-template-columns: 24px minmax(180px, 1fr) 128px 128px 96px 32px;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    transition: border-color 0.15s ease, background-color 0.15s ease;
}

.column-option-settings-item.is-drag-over {
    border-color: var(--el-color-primary-light-5);
    background-color: var(--el-color-primary-light-9);
}

.column-option-settings-item.is-dragging {
    opacity: 0.6;
}

.column-option-label {
    min-width: 0;
    overflow: hidden;
    color: var(--el-text-color-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.column-option-sort-input {
    width: 96px;
}

.column-option-color-button {
    width: 128px;
    justify-content: flex-start;
}

.column-option-color-preview {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-right: 6px;
    border: 1px solid var(--el-border-color);
    border-radius: 50%;
    background: transparent;
}

.column-option-settings-list + .column-option-add {
    margin-bottom: 12px;
}

.column-option-add {
    display: flex;
    gap: 12px;
}

.column-permission-list {
    display: grid;
    gap: 10px;
    max-height: 55vh;
    overflow-y: auto;
    padding: 4px 8px 4px 0;
}

.column-permission-item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 4px;
}

.column-permission-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--el-text-color-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.column-permission-mode {
    flex: 0 0 auto;
}

.column-permission-mode :deep(.el-radio-button__inner) {
    padding: 6px 12px;
    border-radius: 999px;
}

.column-permission-mode :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-radius: 999px 0 0 999px;
}

.column-permission-mode :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-radius: 0 999px 999px 0;
}

@media (max-width: 720px) {
    .inventory-toolbar-primary .el-input {
        width: 100%;
        max-width: none;
    }

    .inventory-delete-button {
        margin-left: 0;
    }

    .column-settings-item {
        grid-template-columns: 24px minmax(0, 1fr) 84px 112px 64px 32px;
        gap: 8px;
    }

    .column-fixed-select {
        width: 112px;
    }

    .column-sort-input {
        width: 84px;
    }

    .column-option-settings-item {
        grid-template-columns: 24px minmax(160px, 1fr) 120px 120px 84px 32px;
        gap: 8px;
    }

    .column-option-sort-input {
        width: 84px;
    }

    .column-option-color-button {
        width: 120px;
    }
}
</style>
