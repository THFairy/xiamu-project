<!-- 商品管理页面：展示商品分类及其所属分类管理分区。 -->
<template>
    <el-tabs v-model="searchForm.tab" @tab-change="handleTabChange">
        <el-tab-pane v-for="(tab, tabI) in tabbars" :key="tabI" :label="tab.name" :name="tab.key"></el-tab-pane>
    </el-tabs>
    <el-card shadow="never" class="border-0">
        <search-header :model="searchForm" permission="searchGoods,GET" @search="handleSearch" @reset="handleResetSearch">
            <search-header-item label="商品名称" prop="title">
                <el-input v-model="searchForm.title" placeholder="商品名称" clearable></el-input>
            </search-header-item>
            <template #show>
                <search-header-item label="商品分类" prop="category_id">
                    <el-select v-model="searchForm.category_id" placeholder="请选择商品分类" clearable>
                        <el-option v-for="item in category_list" :key="item.id" :label="getCategoryLabel(item)" :value="item.id"></el-option>
                    </el-select>
                </search-header-item>
            </template>
        </search-header>

        <list-header
            :permissions="{ create: 'createGoods,POST', refresh: 'getGoodsList,GET' }"
            @create="handleCreate"
            @refresh="getData"
        >
            <el-button
                v-if="searchForm.tab === 'delete'"
                v-permission="['restoreGoods,POST']"
                type="warning"
                size="small"
                @click="handleRestoreGoods"
            >恢复商品</el-button>

            <el-popconfirm
                v-if="searchForm.tab === 'delete'"
                title="是否要彻底删除选中商品？"
                confirm-button-text="是"
                cancel-button-text="否"
                @confirm="handleDestroyGoods()"
            >
                <template #reference>
                    <el-button v-permission="['destroyGoods,POST']" type="danger" size="small">彻底删除</el-button>
                </template>
            </el-popconfirm>

            <el-popconfirm
                v-else
                title="是否要批量删除选中商品？"
                confirm-button-text="是"
                cancel-button-text="否"
                @confirm="handleDelete(true)"
            >
                <template #reference>
                    <el-button v-permission="['deleteGoods,POST']" type="danger" size="small">批量删除</el-button>
                </template>
            </el-popconfirm>

            <el-button
                v-if="searchForm.tab === 'all' || searchForm.tab === 'off'"
                v-permission="['updateGoodsStatus,POST']"
                size="small"
                @click="changeStatus(1)"
            >上架</el-button>
            <el-button
                v-if="searchForm.tab === 'all' || searchForm.tab === 'saling'"
                v-permission="['updateGoodsStatus,POST']"
                size="small"
                @click="changeStatus(2)"
            >下架</el-button>
        </list-header>

        <el-table
            id="list-table"
            ref="multipleTableRef"
            :data="tableData"
            style="width: 100%"
            stripe
            lazy
            @selection-change="handleSelectionChange"
        >
            <el-table-column fixed="left" type="selection" width="55" />
            <el-table-column label="商品" width="300">
                <template #default="{ row }">
                    <div class="flex">
                        <el-image class="mr-3 rounded" style="width: 50px; height: 50px;" :src="row.cover" fit="cover"></el-image>
                        <div class="flex-1">
                            <p>{{ row.title }}</p>
                            <div>
                                <span class="text-rose-500">￥{{ row.min_price }}</span>
                                <el-divider direction="vertical"></el-divider>
                                <span class="text-gray-500 text-xs">￥{{ row.min_oprice }}</span>
                            </div>
                            <p class="text-xs mb-1 text-gray-400">分类：{{ getCategoryLabel(row.category) }}</p>
                            <p class="text-xs text-gray-400">创建时间：{{ formatTimestampValue(row.create_time) || '-' }}</p>
                        </div>
                    </div>
                </template>
            </el-table-column>
            <el-table-column align="center" prop="sale_count" width="90" label="实际销量" />
            <el-table-column align="center" label="商品状态" width="80">
                <template #default="{ row }">
                    <el-tag :type="getGoodsSaleStatus(row.status).type" size="small">{{ getGoodsSaleStatus(row.status).label }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column v-if="searchForm.tab !== 'delete'" align="center" width="150" label="审核状态">
                <template #default="{ row }">
                    <el-tag v-if="isRecycleInspectionGoods(row)" :type="getGoodsAuditStatus(row.ischeck).type" size="small">
                        {{ getGoodsAuditStatus(row.ischeck).label }}
                    </el-tag>
                    <div v-else-if="!row.ischeck" v-permission="['checkGoods,POST']" class="flex flex-col">
                        <el-button type="success" size="small" plain @click="handleCheckGoods(row, 1)">审核通过</el-button>
                        <el-button class="mt-2" style="margin-left: 0 !important;" type="primary" size="small" plain @click="handleCheckGoods(row, 1, 1)">立即上架</el-button>
                        <el-button class="mt-2" style="margin-left: 0 !important;" type="danger" size="small" plain @click="handleCheckGoods(row, 2)">审核未通过</el-button>
                    </div>
                    <el-tag v-else :type="getGoodsAuditStatus(row.ischeck).type" size="small">
                        {{ getGoodsAuditStatus(row.ischeck).label }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column prop="estimated_stock" align="center" width="90" label="预计库存" />
            <el-table-column prop="actual_stock" align="center" width="90" label="实际库存" />
            <el-table-column
                v-permission="['updateGoods,POST', 'setGoodsBanner,POST', 'deleteGoods,POST']"
                label="操作"
                min-width="220"
                align="right"
            >
                <template #default="{ row }">
                    <template v-if="searchForm.tab !== 'delete'">
                        <a v-permission="['updateGoods,POST']" class="btn-text" @click="handleEdit(row)">修改</a>
                        <el-popconfirm title="是否要删除该记录？" confirm-button-text="是" cancel-button-text="否" @confirm="handleDelete(row.id)">
                            <template #reference>
                                <a v-permission="['deleteGoods,POST']" class="btn-text">删除</a>
                            </template>
                        </el-popconfirm>
                    </template>
                    <template v-else>暂无操作</template>
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

        <form-dialog
            ref="formDrawerRef"
            :title="drawerTitle"
            width="min(1440px, 94vw)"
            body-class="goods-management-dialog-content"
            @submit="handleSubmit"
        >
            <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" :inline="false" size="default">
                <el-form-item label="商品名称" prop="title">
                    <el-input v-model="form.title" placeholder="请输入商品名称，不能超过60个字符" />
                </el-form-item>
                <el-form-item label="商品图片" prop="images">
                    <choose-image :limit="9" v-model="form.images"></choose-image>
                    <div class="text-xs text-gray-400 mt-2">第一张图会作为商品封面，第一张和后续图片都会进入微信小程序商品详情轮播图。</div>
                </el-form-item>
                <el-form-item label="商品分类" prop="category_id">
                    <el-select v-model="form.category_id" placeholder="请选择商品分类">
                        <el-option v-for="item in category_list" :key="item.id" :label="getCategoryLabel(item)" :value="item.id" />
                    </el-select>
                </el-form-item>
                <el-form-item label="机器编码" prop="product_id">
                    <el-input v-model="form.product_id" maxlength="32" show-word-limit placeholder="选填，手动填写后保存" />
                </el-form-item>
                <el-form-item label="商品描述" prop="desc">
                    <el-input
                        v-model="form.desc"
                        type="textarea"
                        :maxlength="1000"
                        show-word-limit
                        :autosize="{ minRows: 5, maxRows: 10 }"
                        placeholder="选填，会显示在小程序商品详情页的“商品说明”区域"
                    />
                    <div class="text-xs text-gray-400 mt-2">这里填写的内容会同步显示在小程序商品详情页原来的“商品说明”位置。</div>
                </el-form-item>
                <el-form-item label="副标题" prop="subtitle">
                    <el-input v-model="form.subtitle" placeholder="购买/回收列表中的短描述" />
                </el-form-item>
                <el-form-item label="黄色标签" prop="edition_label">
                    <el-input v-model="form.edition_label" placeholder="选填，例如：512G 版本" />
                </el-form-item>
                <el-form-item label="蓝色标签" prop="feature_tags">
                    <tag-input v-model="form.feature_tags" />
                    <div class="text-xs text-gray-400 mt-2">选填，可添加多个标签。</div>
                </el-form-item>
                <el-form-item label="说明1" prop="shopping_textA">
                    <el-input
                        v-model="form.shopping_textA"
                        type="textarea"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                        placeholder="选填，例如：适合追求画质和容量的玩家 / 发货前复检 / 支持视频验机"
                    />
                </el-form-item>
                <el-form-item label="说明2" prop="shopping_textB">
                    <el-input
                        v-model="form.shopping_textB"
                        type="textarea"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                        placeholder="选填，例如：Steam Deck OLED 版本在显示效果和续航体验上更进一步，适合重度掌机玩家。"
                    />
                </el-form-item>
                <el-form-item label="说明3" prop="shopping_textC">
                    <el-input
                        v-model="form.shopping_textC"
                        type="textarea"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                        placeholder="选填，例如：当前商品支持回收估价，可在下方直接进入回收流程。"
                    />
                </el-form-item>
                <el-form-item label="商品单位" prop="unit">
                    <el-input v-model="form.unit" placeholder="请输入商品单位" style="width: 50%;" />
                </el-form-item>
                <el-form-item label="实际库存" prop="stock">
                    <el-input type="number" v-model="form.stock" style="width: 40%;" @input="handleGoodsStockInput">
                        <template #append>件</template>
                    </el-input>
                </el-form-item>
                <el-form-item label="库存预警" prop="min_stock">
                    <el-input type="number" v-model="form.min_stock" style="width: 40%;">
                        <template #append>件</template>
                    </el-input>
                </el-form-item>
                <el-form-item label="销售价" prop="min_price">
                    <el-input type="number" v-model="form.min_price" style="width: 40%;">
                        <template #append>元</template>
                    </el-input>
                </el-form-item>
                <el-form-item label="最低原价" prop="min_oprice">
                    <el-input type="number" v-model="form.min_oprice" style="width: 40%;">
                        <template #append>元</template>
                    </el-input>
                </el-form-item>
                <el-form-item label="回收价" prop="recycle_price">
                    <el-input type="number" v-model="form.recycle_price" style="width: 40%;">
                        <template #append>元</template>
                    </el-input>
                </el-form-item>
                <el-form-item label="库存显示" prop="stock_display">
                    <el-radio-group v-model="form.stock_display">
                        <el-radio :label="1" border>是</el-radio>
                        <el-radio :label="0" border>否</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="加入回收" prop="recyclable">
                    <el-radio-group v-model="form.recyclable" @change="handleRecyclableChange">
                        <el-radio :label="1" border>是</el-radio>
                        <el-radio :label="0" border>否</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="加入指定配置" prop="recycle_target_category_key">
                    <div class="w-full">
                        <el-radio-group v-model="form.recycle_target_enabled" @change="handleRecycleTargetEnabledChange">
                            <el-radio :label="1" border>是</el-radio>
                            <el-radio :label="0" border>否</el-radio>
                        </el-radio-group>
                        <el-select
                            v-if="Number(form.recycle_target_enabled) === 1"
                            v-model="form.recycle_target_category_key"
                            class="mt-3 w-full"
                            placeholder="请选择已有回收配置"
                            clearable
                        >
                            <el-option
                                v-for="item in recycle_target_options"
                                :key="item.value"
                                :label="item.label"
                                :value="item.value"
                            />
                        </el-select>
                        <div class="text-xs text-gray-400 mt-2">
                            选择后，商品详情里的“回收”会优先跳到对应回收配置；与“加入回收”互斥。
                        </div>
                    </div>
                </el-form-item>
                <el-form-item label="审核状态" prop="ischeck">
                    <el-radio-group v-model="form.ischeck" @change="handleGoodsAuditStatusChange">
                        <el-radio :label="0" border>待审核</el-radio>
                        <el-radio :label="1" border>审核通过</el-radio>
                        <el-radio :label="2" border>审核未通过</el-radio>
                    </el-radio-group>
                    <div class="text-xs text-gray-400 mt-2">可手动调整审核结果；上架状态请在下方单独设置。</div>
                </el-form-item>
                <el-form-item label="是否上架" prop="status">
                    <el-radio-group v-model="form.status" @change="handleGoodsSaleStatusChange">
                        <el-radio :label="0" border>放入仓库</el-radio>
                        <el-radio :label="1" border>立即上架</el-radio>
                        <el-radio :label="2" border>已下架</el-radio>
                        <el-radio :label="3" border>已售罄</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
        </form-dialog>

    </el-card>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import FormDialog from '~/components/FormDialog.vue'
import ChooseImage from '~/components/ChooseImage.vue'
import TagInput from '~/components/TagInput.vue'
import { useInitTable, useInitForm } from '~/composables/useCommon'
import { formatTimestampValue, toast, showFullLoading, hideFullLoading } from '~/composables/util'
import { getCategoryList, getCategorySections } from '~/api/category'
import {
    getGoodsList,
    deleteGoods,
    createGoods,
    updateGoods,
    updateGoodsStatus,
    restoreGoods,
    destroyGoods,
    readGoods,
    checkGoods,
} from '~/api/goods'
import { getRecycleProductList } from '~/api/recycle'

const normalizeGoodsImages = (value = []) => Array.from(new Set((Array.isArray(value) ? value : [value])
    .map(item => String(item || '').trim())
    .filter(Boolean)))

const buildGoodsImages = (goods = {}) => normalizeGoodsImages([
    goods.cover,
    goods.webCoverImage,
    goods.heroImage,
    goods.coverImage,
    ...(Array.isArray(goods.goodsBanner) ? goods.goodsBanner.map(item => item?.url) : []),
    ...(Array.isArray(goods.detailImages) ? goods.detailImages : []),
])

const normalizeGoodsFeatureTags = (value = []) => Array.from(new Set((Array.isArray(value) ? value : String(value || '')
    .split(/[\n,，]+/))
    .map(item => String(item || '').trim())
    .filter(Boolean)))

// 商品销售状态与后台存储值保持一致，避免“已下架”和“放入仓库”被混为同一状态。
const getGoodsSaleStatus = (value) => {
    const status = Number(value || 0)
    if (status === 1) return { label: '已上架', type: 'success' }
    if (status === 2) return { label: '已下架', type: 'info' }
    if (status === 3) return { label: '已售罄', type: 'warning' }
    return { label: '仓库', type: 'danger' }
}

// 审核状态统一展示，回收检测商品不再在列表中提供快捷审核按钮。
const getGoodsAuditStatus = (value) => {
    const status = Number(value || 0)
    if (status === 1) return { label: '审核通过', type: 'success' }
    if (status === 2) return { label: '审核未通过', type: 'danger' }
    return { label: '待审核', type: 'warning' }
}

const isRecycleInspectionGoods = (row = {}) => Boolean(row.is_recycle_inspection)

const defaultGoodsForm = {
    id: null,
    title: null,
    product_id: '',
    subtitle: null,
    edition_label: '',
    feature_tags: '',
    shopping_textA: '',
    shopping_textB: '',
    hero_accent: '',
    shopping_textC: '',
    category_id: null,
    cover: null,
    images: [],
    desc: null,
    unit: '件',
    stock: 1,
    reserved_stock: 0,
    min_stock: 1,
    ischeck: 0,
    status: 0,
    stock_display: 0,
    min_price: 0,
    min_oprice: 0,
    recycle_price: 0,
    recyclable: 0,
    recycle_target_enabled: 0,
    recycle_target_category_key: '',
}

// 记录弹窗中已确认的销售状态，用于在审核未通过时恢复错误点击的选择。
const savedGoodsSaleStatus = ref(0)

const {
    searchForm,
    resetSearchForm,
    multipleTableRef,
    currentPage,
    limit,
    total,
    tableData,
    getData,
    multipleSelectionIds,
    handleSelectionChange,
    handleDelete,
} = useInitTable({
    searchForm: {
        tab: 'all',
        title: '',
        category_id: '',
    },
    getList: getGoodsList,
    success: (res) => {
        total.value = res.totalCount
        tableData.value = res.list.map(item => {
            item.statusLoading = false
            return item
        })
    },
    deleteData: deleteGoods,
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
    form: defaultGoodsForm,
    rules: {
        title: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
        category_id: [{ required: true, message: '请选择商品分类', trigger: 'change' }],
        images: [{
            validator: (rule, value, callback) => {
                if (normalizeGoodsImages(value).length) {
                    callback()
                    return
                }
                callback(new Error('请至少上传1张商品图片'))
            },
            trigger: 'change',
        }],
        desc: [{
            validator: (rule, value, callback) => {
                if (String(value || '').length <= 1000) {
                    callback()
                    return
                }
                callback(new Error('商品描述不能超过1000字'))
            },
            trigger: 'blur',
        }],
        recycle_target_category_key: [{
            validator: (rule, value, callback) => {
                if (Number(form.recycle_target_enabled) !== 1) {
                    callback()
                    return
                }

                if (String(value || '').trim()) {
                    callback()
                    return
                }

                callback(new Error('请选择回收配置'))
            },
            trigger: 'change',
        }],
    },
    getData,
    beforeSubmit: (currentForm) => {
        const images = normalizeGoodsImages(currentForm.images)
        currentForm.images = images
        currentForm.cover = images[0] || ''
        currentForm.product_id = String(currentForm.product_id || '').trim().slice(0, 32)
        currentForm.edition_label = String(currentForm.edition_label || '').trim()
        currentForm.feature_tags = normalizeGoodsFeatureTags(currentForm.feature_tags)
        currentForm.shopping_textA = String(currentForm.shopping_textA || '').trim()
        currentForm.shopping_textB = String(currentForm.shopping_textB || '').trim()
        currentForm.hero_accent = String(currentForm.hero_accent || '').trim()
        currentForm.shopping_textC = String(currentForm.shopping_textC || '').trim()
        currentForm.desc = String(currentForm.desc || '').slice(0, 1000)
        currentForm.recycle_target_category_key = String(currentForm.recycle_target_category_key || '').trim()

        if (Number(currentForm.recyclable) === 1) {
            currentForm.recycle_target_enabled = 0
            currentForm.recycle_target_category_key = ''
            return
        }

        if (Number(currentForm.recycle_target_enabled) === 1 && currentForm.recycle_target_category_key) {
            currentForm.recyclable = 0
            return
        }

        currentForm.recycle_target_enabled = 0
        currentForm.recycle_target_category_key = ''
    },
    closeBeforeReload: true,
    createData: createGoods,
    updateData: updateGoods,
})

const handleCreate = () => {
    openCreateDrawer()
    form.images = []
    savedGoodsSaleStatus.value = Number(form.status || 0)
}

const handleEdit = (row) => {
    showFullLoading()
    readGoods(row.id).then(res => {
        const images = buildGoodsImages(res)
        openEditDrawer({
            ...res,
            cover: images[0] || res.cover || '',
            images,
            edition_label: res.edition_label ?? '',
            feature_tags: normalizeGoodsFeatureTags(res.feature_tags).join(','),
            shopping_textA: res.shopping_textA ?? '',
            shopping_textB: res.shopping_textB ?? '',
            hero_accent: res.hero_accent ?? '',
            shopping_textC: res.shopping_textC ?? '',
            desc: res.desc ?? res.description ?? '',
            recycle_target_category_key: res.recycle_target_category_key ?? '',
            recycle_target_enabled: res.recycle_target_category_key ? 1 : 0,
        })
        savedGoodsSaleStatus.value = Number(res.status || 0)
    }).finally(() => hideFullLoading())
}

const tabbars = ref([
    { name: '全部', key: 'all' },
    { name: '待审核', key: 'pending_review' },
    { name: '审核未通过', key: 'review_rejected' },
    { name: '审核已通过', key: 'review_approved' },
    { name: '出售中', key: 'saling' },
    { name: '已售罄', key: 'sold_out' },
    { name: '已下架', key: 'off' },
    { name: '仓库中', key: 'warehouse' },
    { name: '库存预警', key: 'min_stock' },
    { name: '回收站', key: 'delete' },
])

const category_list = ref([])
const category_sections = ref([])
const category_section_map = computed(() => new Map(
    category_sections.value.map(item => [String(item.key || '').trim(), String(item.name || '').trim()]),
))

const getCategoryLabel = (category = null) => {
    const categoryId = String(category?.id ?? '').trim()
    const categoryItem = category_list.value.find(item => String(item.id ?? '').trim() === categoryId)
    const categoryName = String(category?.name || categoryItem?.name || '').trim()
    const sectionKey = String(category?.sectionKey || category?.section_key || categoryItem?.sectionKey || '').trim()
    const sectionName = String(
        category?.sectionName
        || category?.section_name
        || categoryItem?.sectionName
        || categoryItem?.section_name
        || category_section_map.value.get(sectionKey)
        || '',
    ).trim()

    if (!categoryName) {
        return '未分类'
    }

    return sectionName ? `${categoryName}（${sectionName}）` : categoryName
}

const loadCategoryOptions = async () => {
    const [categoryRes, sectionRes] = await Promise.all([
        getCategoryList('sale', true, '', 0, 0),
        getCategorySections(true),
    ])
    category_list.value = Array.isArray(categoryRes) ? categoryRes : (Array.isArray(categoryRes?.list) ? categoryRes.list : [])
    category_sections.value = Array.isArray(sectionRes) ? sectionRes : []
}

loadCategoryOptions()
const recycle_product_list = ref([])
const recycle_target_options = computed(() => {
    const options = recycle_product_list.value
        .map(item => {
            const recycleProductId = String(item.id || '').trim()
            if (!recycleProductId) {
                return null
            }

            const recycleTitle = String(item.title || '').trim() || '未命名回收配置'

            return {
                value: recycleProductId,
                label: recycleTitle,
            }
        })
        .filter(Boolean)

    const currentValue = String(form.recycle_target_category_key || '').trim()
    if (currentValue && !options.some(item => item.value === currentValue)) {
        options.unshift({
            value: currentValue,
            label: '当前绑定的回收配置',
        })
    }

    return options
})

const loadRecycleTargetOptions = () => {
    return getRecycleProductList(1, { limit: 1000 }).then(res => {
        recycle_product_list.value = Array.isArray(res.list) ? res.list : []
    })
}

loadRecycleTargetOptions()

const handleSearch = () => getData(1)

const handleTabChange = (tabName) => {
    searchForm.tab = String(tabName || searchForm.tab || 'all')
    getData(1)
}

const handleResetSearch = () => {
    currentPage.value = 1
    resetSearchForm()
}

const handleRecyclableChange = (value) => {
    if (Number(value) === 1) {
        form.recycle_target_enabled = 0
        form.recycle_target_category_key = ''
        if (formRef.value) {
            formRef.value.validateField('recycle_target_category_key', () => {})
        }
    }

    if (Number(value) !== 1) {
        return
    }

    ElMessageBox.alert(
        '请及时编辑回收配置信息，否则无法在回收栏目正常显示！',
        '提示',
        {
            confirmButtonText: '我已知晓',
            center: true,
            type: 'warning',
        }
    ).catch(() => {})
}

const handleRecycleTargetEnabledChange = (value) => {
    if (Number(value) === 1) {
        form.recyclable = 0
        return
    }

    form.recycle_target_category_key = ''
    if (formRef.value) {
        formRef.value.validateField('recycle_target_category_key', () => {})
    }
}

// 审核未通过后自动回到仓库状态，防止提交时出现无响应或不明确的状态组合。
const handleGoodsAuditStatusChange = (value) => {
    if (Number(value) !== 2 || Number(form.status) === 0) return
    form.status = 0
    savedGoodsSaleStatus.value = 0
}

// 实际库存或预计库存为零时，编辑弹窗立即切换为已售罄。
const handleGoodsStockInput = () => {
    const stock = Math.max(0, Math.trunc(Number(form.stock || 0)))
    const reservedStock = Math.max(0, Math.trunc(Number(form.reserved_stock || 0)))
    if (stock <= 0 || stock - reservedStock <= 0) {
        form.status = 3
        savedGoodsSaleStatus.value = 3
    }
}

// 审核状态不同给出明确反馈，避免待审核商品被误提示为审核未通过。
const handleGoodsSaleStatusChange = (value) => {
    const nextStatus = Number(value || 0)
    const auditStatus = Number(form.ischeck || 0)
    const restoreStatus = savedGoodsSaleStatus.value

    if (auditStatus === 2 && nextStatus !== restoreStatus) {
        form.status = restoreStatus
        toast('商品审核未通过，不能进行此操作', 'warning')
        return
    }

    if (nextStatus === 1 && auditStatus !== 1) {
        form.status = restoreStatus
        toast(auditStatus === 2 ? '商品审核未通过，不能上架' : '商品待审核，不能上架', 'warning')
        return
    }

    savedGoodsSaleStatus.value = nextStatus
}

const changeStatus = (status) => useMultiAction(() => updateGoodsStatus(multipleSelectionIds.value, status))

const handleCheckGoods = (row, ischeck, status) => {
    showFullLoading()
    checkGoods(row.id, ischeck, status).then(() => {
        toast('操作成功')
        getData()
    }).finally(() => hideFullLoading())
}

const handleRestoreGoods = () => useMultiAction(() => restoreGoods(multipleSelectionIds.value))
const handleDestroyGoods = () => useMultiAction(() => destroyGoods(multipleSelectionIds.value))

function useMultiAction(func) {
    if (hasMulti()) {
        showFullLoading()
        func().then(() => {
            toast('操作成功')
            getData()
        }).finally(() => hideFullLoading())
    }
}

function hasMulti() {
    if (multipleSelectionIds.value.length === 0) {
        toast('请先选择商品', 'error')
        return false
    }
    return true
}
</script>

<style>
.goods-management-dialog-content {
    box-sizing: border-box;
    padding-right: 10px;
    scrollbar-gutter: stable;
}
</style>
