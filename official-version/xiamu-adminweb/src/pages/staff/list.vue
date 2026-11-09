<!-- 用途：员工管理及功能访问权限配置。 -->
<template>
    <el-card shadow="never" class="border-0">
        <search-header :model="searchForm" permission="searchStaff,GET" @search="getData(1)" @reset="resetSearchForm">
            <search-header-item label="关键词" prop="keyword">
                <el-input
                    v-model="searchForm.keyword"
                    placeholder="姓名 / 登录账号 / 手机号 / 邮箱 / 权限"
                    clearable
                ></el-input>
            </search-header-item>
        </search-header>

        <list-header
            :permissions="{
                create: 'createStaff,POST',
                refresh: 'getStaffList,GET',
            }"
            @create="handleCreate"
            @refresh="getData"
        ></list-header>

        <el-table id="list-table" :data="tableData" style="width: 100%" stripe lazy>
            <el-table-column prop="id" label="ID" width="90" align="center"></el-table-column>

            <el-table-column label="员工信息" min-width="240">
                <template #default="{ row }">
                    <div class="flex items-center">
                        <el-avatar class="staff-list-avatar" :size="40" :src="row.avatar">
                            {{ String(row.name || row.account || '?').slice(0, 1) }}
                        </el-avatar>
                        <div class="ml-3">
                            <div class="text-sm font-medium text-gray-800">{{ row.name || '-' }}</div>
                            <div class="text-xs text-gray-400">登录账号：{{ row.account || '-' }}</div>
                        </div>
                    </div>
                </template>
            </el-table-column>

            <el-table-column prop="phone" label="手机号" min-width="150"></el-table-column>
            <el-table-column prop="email" label="邮箱" min-width="190"></el-table-column>

            <el-table-column label="权限" width="120" align="center">
                <template #default="{ row }">
                    <el-tag :type="getPermissionTagType(row.permission)">
                        {{ row.permission || '访客' }}
                    </el-tag>
                </template>
            </el-table-column>

            <el-table-column label="注册时间" min-width="180" align="center">
                <template #default="{ row }">
                    {{ formatTimestampValue(row.createdAt) || row.createdAtRealtime || '-' }}
                </template>
            </el-table-column>

            <el-table-column label="最后登录时间" min-width="180" align="center">
                <template #default="{ row }">
                    {{ formatTimestampValue(row.lastLoginAt) || row.lastLoginAtRealtime || '-' }}
                </template>
            </el-table-column>

            <el-table-column label="操作" width="240" align="center">
                <template #default="{ row }">
                    <el-button
                        v-if="!isSelfStaff(row)"
                        v-permission="['updateStaff,POST']"
                        type="text"
                        size="small"
                        @click="handleEditStaff(row)"
                    >编辑信息</el-button>

                    <el-button
                        v-if="!isSelfStaff(row) && !isProtectedStaff(row)"
                        v-permission="['updateStaff,POST']"
                        type="text"
                        size="small"
                        @click="openPermissionDrawer(row)"
                    >编辑权限</el-button>

                    <el-popconfirm
                        v-if="!isProtectedStaff(row) && !isSelfStaff(row)"
                        title="是否删除该员工账号？"
                        @confirm="handleDeleteStaff(row.id)"
                        confirm-button-text="确定"
                        cancel-button-text="取消"
                    >
                        <template #reference>
                            <el-button v-permission="['deleteStaff,POST']" type="text" size="small">删除</el-button>
                        </template>
                    </el-popconfirm>

                    <span v-if="isSelfStaff(row)" class="text-xs text-gray-400">当前登录账号</span>
                    <span v-else-if="isProtectedStaff(row)" class="text-xs text-gray-400">受保护账号</span>
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

        <form-drawer ref="formDrawerRef" :title="drawerTitle === '新增' ? '新增员工' : '编辑员工'" @submit="handleSubmit">
            <el-form :model="form" ref="formRef" :rules="rules" label-width="88px" :inline="false" size="default">
                <el-form-item label="登录账号" prop="username">
                    <el-input v-model="form.username" placeholder="请输入登录账号" :disabled="isEditingDefaultAdmin"></el-input>
                </el-form-item>
                <el-form-item label="姓名" prop="name">
                    <el-input v-model="form.name" placeholder="请输入姓名"></el-input>
                </el-form-item>
                <el-form-item label="手机号" prop="phone">
                    <el-input v-model="form.phone" maxlength="11" placeholder="请输入手机号"></el-input>
                </el-form-item>
                <el-form-item label="邮箱" prop="email">
                    <el-input v-model="form.email" maxlength="128" placeholder="请输入邮箱"></el-input>
                </el-form-item>
                <el-form-item label="密码" prop="password">
                    <el-input
                        v-model="form.password"
                        show-password
                        :placeholder="Number(form.id || 0) > 0 ? '不修改可留空' : '请输入登录密码'"
                    ></el-input>
                </el-form-item>
                <el-form-item label="头像" prop="avatar">
                    <choose-image :limit="1" v-model="form.avatar"></choose-image>
                </el-form-item>
            </el-form>
        </form-drawer>

        <form-drawer ref="permissionDrawerRef" title="修改权限" size="72%" confirm-text="确认修改" @submit="handlePermissionSubmit">
            <div class="permission-drawer">
                <div class="permission-drawer-user">
                    <el-avatar :size="42" :src="permissionForm.avatar">{{ String(permissionForm.name || permissionForm.account || '?').slice(0, 1) }}</el-avatar>
                    <div>
                        <div class="font-medium text-gray-800">{{ permissionForm.name || permissionForm.account }}</div>
                        <div class="text-xs text-gray-400">登录账号：{{ permissionForm.account }}</div>
                    </div>
                </div>

                <el-form :model="permissionForm" label-width="88px" class="permission-role-form">
                    <el-form-item label="权限角色" required>
                        <el-radio-group v-model="permissionForm.permission">
                            <el-radio v-for="item in permissionOptions" :key="item" :label="item">{{ item }}</el-radio>
                        </el-radio-group>
                    </el-form-item>
                </el-form>

                <div v-if="isPermissionStaff" class="permission-editor">
                    <div class="permission-tabs"><span class="is-active">功能权限</span></div>
                    <div class="permission-toolbar">
                        <el-input v-model="permissionKeyword" clearable placeholder="搜索模块或操作权限">
                            <template #prefix><el-icon><search /></el-icon></template>
                        </el-input>
                        <div class="permission-toolbar-actions">
                            <el-tag type="info">{{ selectedModuleCount }} 个模块 / {{ selectedRuleCount }} 项权限</el-tag>
                            <el-button size="small" @click="selectAllAccessRules">全部开启</el-button>
                            <el-button size="small" @click="clearAccessRules">全部关闭</el-button>
                        </div>
                    </div>
                    <div class="permission-matrix">
                        <div v-for="group in filteredAccessGroups" :key="group.name" class="permission-group">
                            <div class="permission-group-title">
                                <el-checkbox
                                    :model-value="isAccessGroupChecked(group)"
                                    :indeterminate="isAccessGroupIndeterminate(group)"
                                    @change="toggleAccessGroup(group, $event)"
                                >{{ group.name }}全选</el-checkbox>
                            </div>
                            <div v-for="module in group.modules" :key="module.path" class="permission-module-row">
                                <div class="permission-module-name">
                                    <el-checkbox
                                        :model-value="isAccessModuleChecked(module)"
                                        :indeterminate="isAccessModuleIndeterminate(module)"
                                        @change="toggleAccessModule(module, $event)"
                                    >{{ module.name }}</el-checkbox>
                                </div>
                                <el-checkbox-group v-model="permissionForm.accessRules" class="permission-action-list">
                                    <el-checkbox
                                        v-for="action in module.actions"
                                        :key="action.key"
                                        :label="action.key"
                                        :disabled="action.key !== module.actions[0].key && !permissionForm.accessRules.includes(module.actions[0].key)"
                                        @change="toggleAccessAction(module, action, $event)"
                                    >{{ action.name }}</el-checkbox>
                                </el-checkbox-group>
                            </div>
                        </div>
                    </div>
                </div>
                <el-empty v-else description="选择“员工”后可配置可查看的网页模块和具体操作权限" :image-size="96"></el-empty>
            </div>
        </form-drawer>
    </el-card>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import store from '~/store'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import FormDrawer from '~/components/FormDrawer.vue'
import ChooseImage from '~/components/ChooseImage.vue'
import { useInitForm, useInitTable } from '~/composables/useCommon'
import { formatTimestampValue, toast } from '~/composables/util'
import { createStaff, deleteStaff, getStaffList, getStaffPermissions, updateStaff, updateStaffPermissions } from '~/api/staff'

const permissionOptions = ['超级管理员', '普通管理员', '员工', '访客']
const legacyEmployeeAccessPaths = ['/goods/list', '/recycle/review', '/order/list']
const accessGroups = [
    { name: '后台首页', modules: [
        { name: '后台首页', path: '/', actions: [['查看概览卡片', 'getStatistics1,GET'], ['查看快捷概览', 'getStatistics2,GET']] },
    ] },
    { name: '数据分析', modules: [
        { name: '数据分析', path: '/data-analysis', actions: [['查看教程统计', 'getStatistics1,GET'], ['查看订单图表', 'getStatistics3,GET'], ['查看地址分布', 'getAddressLocationStatistics,GET'], ['查看下单时段与型号', 'getOrderTimeStatistics,GET'], ['查看小程序用户分析', 'getUserEngagementStatistics,GET'], ['查看用户日活统计', 'getUserActivityStatistics,GET']] },
    ] },
    { name: '业务管理', modules: [
        { name: '用户管理', path: '/user/list', actions: [['查看用户', 'getUserList,GET'], ['搜索用户', 'searchUser,GET'], ['启停账号', 'updateUserStatus,POST'], ['删除用户', 'deleteUser,POST']] },
        { name: '库存管理', path: '/inventory/list', actions: [['查看库存', 'getInventoryManagementList,GET'], ['搜索库存', 'searchInventoryManagement,GET'], ['导出库存', 'exportInventoryManagement,GET'], ['列可见权限', 'getInventoryColumnPermissions,GET'], ['保存列可见权限', 'updateInventoryColumnPermissions,POST'], ['新增库存', 'createInventoryManagement,POST'], ['编辑库存', 'updateInventoryManagement,POST'], ['删除库存', 'deleteInventoryManagement,POST'], ['批量删除', 'deleteInventoryManagementBatch,POST'], ['查看列计算', 'getInventoryCalculations,GET'], ['编辑列计算', 'updateInventoryCalculations,POST']] },
        { name: '商品管理', path: '/goods/list', actions: [['查看商品', 'getGoodsList,GET'], ['搜索商品', 'searchGoods,GET'], ['查看商品分类', 'getCategoryList,GET'], ['新增商品', 'createGoods,POST'], ['编辑商品', 'updateGoods,POST'], ['上下架', 'updateGoodsStatus,POST'], ['删除商品', 'deleteGoods,POST'], ['恢复商品', 'restoreGoods,POST'], ['彻底删除', 'destroyGoods,POST'], ['设为轮播', 'setGoodsBanner,POST'], ['审核商品', 'checkGoods,POST']] },
        { name: '分类管理', path: '/category/list', actions: [['查看分类', 'getCategoryList,GET'], ['新增分类', 'createCategory,POST'], ['编辑分类', 'updateCategory,POST'], ['启停分类', 'updateCategoryStatus,POST'], ['删除分类', 'deleteCategory,POST']] },
        { name: '回收配置', path: '/recycle/list', actions: [['查看回收配置', 'getRecycleProfiles,GET'], ['搜索回收商品', 'searchRecycleProduct,GET'], ['查看回收商品', 'getRecycleProductList,GET'], ['新增回收商品', 'createRecycleProduct,POST'], ['编辑回收商品', 'updateRecycleProduct,POST'], ['启停回收商品', 'updateRecycleProductStatus,POST'], ['删除回收商品', 'deleteRecycleProduct,POST'], ['查看选项组', 'getRecycleOptionGroups,GET'], ['新增选项组', 'createRecycleOptionGroup,POST'], ['编辑选项组', 'updateRecycleOptionGroup,POST'], ['启停选项组', 'updateRecycleOptionGroupStatus,POST'], ['删除选项组', 'deleteRecycleOptionGroup,POST'], ['批量删除选项组', 'deleteRecycleOptionGroups,POST'], ['保存选项组排序', 'reorderRecycleOptionGroups,POST'], ['查看选项', 'getRecycleOptionItems,GET'], ['新增选项', 'createRecycleOptionItem,POST'], ['编辑选项', 'updateRecycleOptionItem,POST'], ['启停选项', 'updateRecycleOptionItemStatus,POST'], ['删除选项', 'deleteRecycleOptionItem,POST'], ['批量删除选项', 'deleteRecycleOptionItems,POST']] },
        { name: '回收审核', path: '/recycle/review', actions: [['查看审核单', 'getRecycleSubmissionList,GET'], ['搜索审核单', 'searchRecycleSubmission,GET'], ['查看顺丰单号', 'getRecycleSubmissionWaybillNo,GET'], ['查看审核记录', 'getRecycleSubmissionReviews,GET'], ['查看结算记录', 'getRecycleSubmissionSettlements,GET'], ['删除审核单', 'deleteRecycleSubmission,POST'], ['手动新增回收记录', 'createRecycleSubmission,POST'], ['修改回收信息', 'updateRecycleSubmissionInfo,POST'], ['审核估价', 'reviewRecycleSubmission,POST'], ['编辑报告', 'updateRecycleSubmissionReport,POST'], ['发布商品', 'publishRecycleSubmission,POST'], ['创建结算', 'createRecycleSubmissionSettlement,POST'], ['同步结算', 'syncRecycleSubmissionSettlement,POST'], ['手动支付宝结算', 'completeAlipayRecycleSubmissionSettlement,POST']] },
        { name: '订单管理', path: '/order/list', actions: [['查看订单', 'getOrderList,GET'], ['搜索订单', 'searchOrder,GET'], ['查看物流信息', 'getOrderShipInfo,GET'], ['删除订单', 'deleteOrder,POST'], ['订单发货', 'shipOrder,POST'], ['处理退款', 'refundOrder,POST'], ['导出订单', 'exportOrder,POST'], ['修改订单状态', 'updateOrderStatus,POST']] },
        { name: '评价管理', path: '/comment/list', actions: [['查看评价', 'getCommentList,GET'], ['搜索评价', 'searchComment,GET'], ['启停评价', 'updateCommentStatus,POST'], ['审核评价', 'reviewComment,POST']] },
    ] },
    { name: '内容运营', modules: [
        { name: '首页轮播管理', path: '/homepage-banner/list', actions: [['查看轮播', 'getHomepageBannerList,GET'], ['搜索轮播', 'searchHomepageBanner,GET'], ['查看主轮播', 'getHomepageBannerPrimary,GET'], ['新增轮播', 'createHomepageBanner,POST'], ['编辑轮播', 'updateHomepageBanner,POST'], ['启停轮播', 'updateHomepageBannerStatus,POST'], ['删除轮播', 'deleteHomepageBanner,POST'], ['设置主轮播', 'updateHomepageBannerPrimary,POST']] },
        { name: '专区编辑', path: '/homepage-section/editor', actions: [['查看专区', 'getHomepageSection,GET'], ['保存专区', 'updateHomepageSection,POST']] },
        { name: '教程分类', path: '/carousel-directory/list', actions: [['查看教程', 'getContentPageList,GET'], ['搜索教程', 'searchContentPage,GET'], ['新增教程', 'createContentPage,POST'], ['编辑教程', 'updateContentPage,POST'], ['启停教程', 'updateContentPageStatus,POST'], ['删除教程', 'deleteContentPage,POST']] },
        { name: '教程编辑', path: '/carousel-directory/editor', actions: [['查看教程', 'getContentPageList,GET'], ['搜索教程', 'searchContentPage,GET'], ['新增教程', 'createContentPage,POST'], ['编辑教程', 'updateContentPage,POST'], ['启停教程', 'updateContentPageStatus,POST'], ['删除教程', 'deleteContentPage,POST']] },
        { name: '封面管理', path: '/carousel-directory/cover', actions: [['查看教程', 'getContentPageList,GET'], ['新增教程', 'createContentPage,POST'], ['编辑教程', 'updateContentPage,POST'], ['启停教程', 'updateContentPageStatus,POST'], ['删除教程', 'deleteContentPage,POST']] },
        { name: '公告管理', path: '/notice/list', actions: [['查看公告', 'getNoticeList,GET'], ['新增公告', 'createNotice,POST'], ['编辑公告', 'updateNotice,POST'], ['删除公告', 'deleteNotice,POST']] },
        { name: '优惠券管理', path: '/coupon/list', actions: [['查看优惠券', 'getCouponList,GET'], ['新增优惠券', 'createCoupon,POST'], ['编辑优惠券', 'updateCoupon,POST'], ['启停优惠券', 'updateCouponStatus,POST'], ['删除优惠券', 'deleteCoupon,POST']] },
    ] },
    { name: '系统设置', modules: [
        { name: '会员等级', path: '/level/list', actions: [['查看会员等级', 'getUserLevelList,GET'], ['新增会员等级', 'createUserLevel,POST'], ['编辑会员等级', 'updateUserLevel,POST'], ['启停会员等级', 'updateUserLevelStatus,POST'], ['删除会员等级', 'deleteUserLevel,POST']] },
        { name: '财务统计', path: '/finance/list', actions: [['查看财务统计', 'getFinanceStatistics,GET'], ['搜索财务统计', 'searchFinanceStatistics,GET']] },
        { name: '隐私政策填写', path: '/privacy-policy/index', actions: [['查看隐私政策', 'getLegalDocument,GET'], ['保存隐私政策', 'updateLegalDocument,POST']] },
        { name: '用户协议填写', path: '/user-agreement/index', actions: [['查看用户协议', 'getLegalDocument,GET'], ['保存用户协议', 'updateLegalDocument,POST']] },
        { name: '系统设置', path: '/setting/base', actions: [['查看系统设置', 'getSysconfig,GET'], ['保存系统设置', 'setSysSetting,POST']] },
        { name: '支付设置', path: '/setting/buy', actions: [['查看支付设置', 'getSysconfig,GET'], ['保存支付设置', 'setSysSetting,POST']] },
        { name: '物流设置', path: '/setting/ship', actions: [['查看物流设置', 'getSysconfig,GET'], ['保存物流设置', 'setSysSetting,POST']] },
    ] },
].map((group) => ({
    ...group,
    modules: group.modules.map((module) => ({
        ...module,
        actions: module.actions.map(([name, rule]) => ({
            name,
            rule,
            key: `${module.path}::${rule}`,
        })),
    })),
}))
const accessModules = accessGroups.flatMap((group) => group.modules)
const phonePattern = /^1\d{10}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const currentAdminId = computed(() => Number(store.state.user?.id || 0))
const permissionDrawerRef = ref(null)
const permissionKeyword = ref('')
const permissionForm = reactive({
    id: 0,
    account: '',
    name: '',
    avatar: '',
    permission: '访客',
    accessRules: [],
})
const isPermissionStaff = computed(() => permissionForm.permission === '员工')
const selectedModuleCount = computed(() => accessModules.filter((module) => (
    module.actions.some((action) => permissionForm.accessRules.includes(action.key))
)).length)
const selectedRuleCount = computed(() => permissionForm.accessRules.length)
const filteredAccessGroups = computed(() => {
    const keyword = permissionKeyword.value.trim().toLowerCase()
    if (!keyword) return accessGroups

    return accessGroups
        .map((group) => ({
            ...group,
            modules: group.modules.filter((module) => (
                module.name.toLowerCase().includes(keyword)
                || module.actions.some((action) => action.name.toLowerCase().includes(keyword))
            )),
        }))
        .filter((group) => group.modules.length)
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
        keyword: '',
    },
    getList: getStaffList,
    success: (res) => {
        total.value = Number(res.totalCount || 0)
        tableData.value = Array.isArray(res.list) ? res.list : []
    },
    autoGetData: true,
})

const {
    drawerTitle,
    form,
    formRef,
    rules,
    formDrawerRef,
    handleSubmit,
    handleCreate,
    handleEdit,
} = useInitForm({
    form: {
        id: 0,
        username: '',
        name: '',
        phone: '',
        email: '',
        password: '',
        permission: '访客',
        accessPaths: [],
        accessRules: [],
        avatar: '',
    },
    rules: {
        username: [{
            required: true,
            message: '请输入登录账号',
            trigger: 'blur',
        }],
        name: [{
            required: true,
            message: '请输入姓名',
            trigger: 'blur',
        }],
        phone: [{
            validator: (_rule, value, callback) => {
                if (value && !phonePattern.test(String(value))) {
                    callback(new Error('手机号格式不正确'))
                    return
                }
                callback()
            },
            trigger: 'blur',
        }],
        email: [{
            validator: (_rule, value, callback) => {
                if (value && !emailPattern.test(String(value))) {
                    callback(new Error('邮箱格式不正确'))
                    return
                }
                callback()
            },
            trigger: 'blur',
        }],
        password: [{
            validator: (_rule, value, callback) => {
                if (!Number(form.id || 0) && !String(value || '').trim()) {
                    callback(new Error('请输入登录密码'))
                    return
                }
                if (value && String(value).length < 6) {
                    callback(new Error('密码长度不能少于 6 位'))
                    return
                }
                callback()
            },
            trigger: 'blur',
        }],
        permission: [{
            required: true,
            message: '请选择权限',
            trigger: 'change',
        }],
    },
    getData,
    createData: createStaff,
    updateData: updateStaff,
    beforeSubmit: (payload) => {
        payload.username = String(payload.username || '').trim()
        payload.name = String(payload.name || '').trim()
        payload.phone = String(payload.phone || '').trim()
        payload.email = String(payload.email || '').trim()
        payload.password = String(payload.password || '').trim()
        payload.avatar = String(payload.avatar || '').trim()
        delete payload.accessRules
        delete payload.accessPaths
        if (Number(payload.id || 0) > 0 && !payload.password) {
            delete payload.password
        }
    },
})

const isEditingDefaultAdmin = computed(() => Number(form.id || 0) > 0 && String(form.username || '').trim().toLowerCase() === 'admin')

const isProtectedStaff = (row = {}) => String(row.account || '').trim().toLowerCase() === 'admin'
const isSelfStaff = (row = {}) => Number(row.id || 0) > 0 && Number(row.id || 0) === currentAdminId.value

const getPermissionTagType = (permission) => {
    if (permission === '超级管理员') return 'danger'
    if (permission === '普通管理员') return 'success'
    if (permission === '员工') return 'warning'
    return 'info'
}

const handleEditStaff = (row) => {
    if (isSelfStaff(row)) {
        toast('当前登录账号不可在员工管理中编辑，请前往右上角“编辑信息”处理', 'warning')
        return
    }

    handleEdit({
        ...row,
        username: row.account || '',
        password: '',
    })
}

const openPermissionDrawer = async (row) => {
    permissionKeyword.value = ''
    Object.assign(permissionForm, {
        id: Number(row.id || 0),
        account: row.account || '',
        name: row.name || '',
        avatar: row.avatar || '',
        permission: row.permission || '访客',
        accessRules: [],
    })
    permissionDrawerRef.value.open()

    try {
        const data = await getStaffPermissions(row.id)
        Object.assign(permissionForm, {
            account: data.account || row.account || '',
            name: data.name || row.name || '',
            permission: data.permission || '访客',
            accessRules: normalizeAccessRules(Array.isArray(data.accessRules) ? data.accessRules : getRulesForPaths(row.accessPaths)),
        })
    } catch (_error) {
        permissionDrawerRef.value.close()
    }
}

const handlePermissionSubmit = () => {
    permissionDrawerRef.value.showLoading()
    updateStaffPermissions(permissionForm.id, {
        permission: permissionForm.permission,
        accessRules: permissionForm.permission === '员工' ? normalizeAccessRules(permissionForm.accessRules) : [],
    }).then(() => {
        toast('权限保存成功')
        permissionDrawerRef.value.close()
        getData(currentPage.value)
    }).finally(() => permissionDrawerRef.value.hideLoading())
}

const getRulesForPaths = (paths = legacyEmployeeAccessPaths) => accessModules
    .filter((module) => (Array.isArray(paths) ? paths : legacyEmployeeAccessPaths).includes(module.path))
    .flatMap((module) => module.actions.map((action) => action.key))
const normalizeAccessRules = (rules = []) => {
    const selected = new Set(Array.isArray(rules) ? rules : [])
    accessModules.forEach((module) => {
        const selectedActions = module.actions.filter((action) => selected.has(action.key) || selected.has(action.rule))
        selectedActions.forEach((action) => selected.add(action.key))
        if (selectedActions.length) selected.add(module.actions[0].key)
    })
    return Array.from(selected).filter((rule) => rule.includes('::'))
}
const selectAllAccessRules = () => {
    permissionForm.accessRules = accessModules.flatMap(getModuleRules)
}
const clearAccessRules = () => {
    permissionForm.accessRules = []
}
const getModuleRules = (module) => module.actions.map((action) => action.key)
const isAccessGroupChecked = (group) => group.modules.every((module) => isAccessModuleChecked(module))
const isAccessGroupIndeterminate = (group) => {
    const rules = group.modules.flatMap(getModuleRules)
    const count = rules.filter((rule) => permissionForm.accessRules.includes(rule)).length
    return count > 0 && count < rules.length
}
const toggleAccessGroup = (group, checked) => {
    const groupRules = group.modules.flatMap(getModuleRules)
    permissionForm.accessRules = checked
        ? Array.from(new Set([...permissionForm.accessRules, ...groupRules]))
        : permissionForm.accessRules.filter((rule) => !groupRules.includes(rule))
}
const isAccessModuleChecked = (module) => getModuleRules(module).every((rule) => permissionForm.accessRules.includes(rule))
const isAccessModuleIndeterminate = (module) => {
    const count = getModuleRules(module).filter((rule) => permissionForm.accessRules.includes(rule)).length
    return count > 0 && count < module.actions.length
}
const toggleAccessModule = (module, checked) => {
    const rules = getModuleRules(module)
    permissionForm.accessRules = checked
        ? Array.from(new Set([...permissionForm.accessRules, ...rules]))
        : permissionForm.accessRules.filter((rule) => !rules.includes(rule))
}
const toggleAccessAction = (module, action, checked) => {
    const viewRule = module.actions[0].key
    if (!checked && action.key === viewRule) {
        permissionForm.accessRules = permissionForm.accessRules.filter((rule) => !getModuleRules(module).includes(rule))
    } else if (checked && action.key !== viewRule && !permissionForm.accessRules.includes(viewRule)) {
        permissionForm.accessRules = Array.from(new Set([...permissionForm.accessRules, viewRule]))
    }
}

const handleDeleteStaff = (id) => {
    deleteStaff(id).then(() => {
        toast('删除成功')
        if (tableData.value.length === 1 && currentPage.value > 1) {
            getData(currentPage.value - 1)
            return
        }
        getData(currentPage.value)
    })
}
</script>

<style scoped>
.staff-access-panel {
    width: 100%;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    padding: 12px 14px;
}

.staff-access-tip {
    margin-bottom: 10px;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}

.staff-access-group + .staff-access-group {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f0f2f5;
}

.staff-access-module {
    padding: 10px 0 0 24px;
}

.staff-access-module + .staff-access-module {
    margin-top: 8px;
    border-top: 1px dashed #ebeef5;
}

.staff-access-items {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin: 8px 0 0 24px;
}

.staff-access-items :deep(.el-checkbox) {
    margin-right: 0;
}

.permission-drawer {
    padding: 0 4px 20px;
}

.permission-drawer-user {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 0 16px;
    border-bottom: 1px solid #ebeef5;
}

.permission-role-form {
    padding: 18px 0 2px;
}

.permission-tabs {
    display: flex;
    height: 44px;
    border-bottom: 1px solid #ebeef5;
}

.permission-tabs span {
    display: flex;
    align-items: center;
    padding: 0 18px;
    color: #409eff;
    border-bottom: 2px solid #409eff;
    font-weight: 500;
}

.permission-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 0;
}

.permission-toolbar :deep(.el-input) {
    width: 360px;
    max-width: 100%;
}

.permission-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.permission-matrix {
    border: 1px solid #ebeef5;
}

.permission-group + .permission-group {
    border-top: 1px solid #ebeef5;
}

.permission-group-title {
    padding: 12px 16px;
    background: #f7f9fc;
    font-weight: 500;
}

.permission-module-row {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    border-top: 1px solid #f0f2f5;
}

.permission-module-name {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    background: #fcfcfd;
    border-right: 1px solid #f0f2f5;
}

.permission-action-list {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    gap: 12px 24px;
    padding: 12px 16px;
}

.permission-action-list :deep(.el-checkbox) {
    margin-right: 0;
}

.staff-list-avatar {
    flex: 0 0 40px;
    width: 40px;
    min-width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
}

.staff-list-avatar :deep(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

@media (max-width: 768px) {
    .permission-toolbar {
        align-items: stretch;
        flex-direction: column;
    }

    .permission-toolbar :deep(.el-input) {
        width: 100%;
    }

    .permission-toolbar-actions {
        flex-wrap: wrap;
    }

    .permission-module-row {
        grid-template-columns: 1fr;
    }

    .permission-module-name {
        border-right: 0;
        border-bottom: 1px solid #f0f2f5;
    }
}
</style>
