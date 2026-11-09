<!-- 网页端购买订单管理及微信订单同步状态。 -->
<template>
  <el-tabs v-model="searchForm.tab" @tab-click="handleTabChange">
    <el-tab-pane v-for="tab in tabbars" :key="tab.key" :label="tab.name" :name="tab.key" />
  </el-tabs>

  <el-card shadow="never" class="border-0">
    <search-header :model="searchForm" permission="searchOrder,GET" @search="handleSearch" @reset="handleResetSearch">
      <search-header-item label="订单编号" prop="no">
        <el-input v-model="searchForm.no" placeholder="请输入订单编号或商户单号" clearable />
      </search-header-item>
      <template #show>
        <search-header-item label="收货人 / UID" prop="name">
          <el-input v-model="searchForm.name" placeholder="请输入收货人或 UID" clearable />
        </search-header-item>
        <search-header-item label="手机号" prop="phone">
          <el-input v-model="searchForm.phone" placeholder="请输入手机号" clearable />
        </search-header-item>
        <search-header-item label="开始时间" prop="starttime">
          <el-date-picker
            v-model="searchForm.starttime"
            style="width: 90%"
            type="date"
            placeholder="请选择开始日期"
            value-format="YYYY-MM-DD"
          />
        </search-header-item>
        <search-header-item label="结束时间" prop="endtime">
          <el-date-picker
            v-model="searchForm.endtime"
            style="width: 90%"
            type="date"
            placeholder="请选择结束日期"
            value-format="YYYY-MM-DD"
          />
        </search-header-item>
      </template>
    </search-header>

    <list-header
      :permissions="{
        refresh: 'getOrderList,GET',
        delete: 'deleteOrder,POST',
        download: 'exportOrder,POST',
      }"
      @refresh="getData"
      @delete="handleDelete(true)"
      @download="handleExportExcel"
    />

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

      <el-table-column label="订单编号" width="180" align="center">
        <template #default="{ row }">
          <span>{{ row.no || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="商户单号" width="220" align="center">
        <template #default="{ row }">
          <span>{{ row.out_trade_no || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="下单时间" width="180" align="center">
        <template #default="{ row }">
          <span>{{ formatTimestampValue(row.create_time) || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="商品信息" width="320">
        <template #default="{ row }">
          <div v-for="(item, index) in row.order_items || []" :key="`${row.id}-${index}`" class="flex py-2">
            <el-image
              class="mr-3 rounded"
              style="width: 30px; height: 30px"
              :src="item.goods_item ? item.goods_item.cover : ''"
              fit="cover"
            />
            <div class="mt-0">
              <p class="text-blue-500">{{ item.goods_item ? item.goods_item.title : '商品已删除' }}</p>
              <small v-if="item.sku" class="text-gray-500">{{ item.sku }}</small>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="total_price" align="center" width="120" label="实付金额">
        <template #default="{ row }">￥{{ row.total_price }}</template>
      </el-table-column>

      <el-table-column align="center" label="买家" width="180">
        <template #default="{ row }">
          <p>{{ row.user?.username || '-' }}</p>
          <small>UID: {{ row.user?.uid || '-' }}</small>
        </template>
      </el-table-column>

      <el-table-column fixed="right" align="left" width="205" label="交易状态">
        <template #default="{ row }">
          <div>
            支付状态：
            <el-tag size="small" :type="row.payment_status === 'paid' ? 'success' : 'info'">
              {{ row.payment_status === 'paid' ? '已支付' : '未支付' }}
            </el-tag>
          </div>
          <div>
            订单状态：
            <el-tag size="small" :type="getOrderStatusTagType(row.order_status)">
              {{ getOrderStatusLabel(row.order_status) }}
            </el-tag>
          </div>
          <div>
            收货状态：
            <el-tag size="small" :type="row.ship_status === 'received' ? 'success' : 'info'">
              {{ row.ship_status === 'received' ? '已收货' : '未收货' }}
            </el-tag>
          </div>
          <div>
            同步状态：
            <el-tag size="small" :type="wechatSyncDisplayTagType(row)">
              {{ wechatSyncDisplayLabel(row) }}
            </el-tag>
          </div>
          <div>
            微信服务状态：
            <el-tag
              size="small"
              :type="wechatServiceStatusTagType(row.wechat_service_status)"
              :title="row.wechat_service_status_error || ''"
            >
              {{ wechatServiceStatusLabel(row.wechat_service_status, row.wechat_service_status_error) }}
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column fixed="right" label="操作" align="center" width="360">
        <template #default="{ row }">
          <el-button type="text" size="small" @click="openInfoModal(row)">订单详情</el-button>
          <el-button
            v-permission="['updateOrderStatus,POST']"
            type="text"
            size="small"
            @click="openStatusModal(row)"
          >状态编辑</el-button>

          <el-button
            v-if="row.payment_status === 'paid'"
            v-permission="['shipOrder,POST']"
            type="text"
            size="small"
            @click="openShipModal(row)"
          >发货管理</el-button>

          <el-button
            v-if="canHandleRefund(row)"
            v-permission="['refundOrder,POST']"
            type="text"
            size="small"
            @click="handleRefund(row.id, 1)"
          >
            同意退款
          </el-button>

          <el-button
            v-if="canHandleRefund(row)"
            v-permission="['refundOrder,POST']"
            type="text"
            size="small"
            @click="handleRefund(row.id, 0)"
          >
            拒绝退款
          </el-button>
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

    <info-modal ref="InfoModalRef" :info="info" />
    <status-modal ref="StatusModalRef" @success="handleStatusDisplaySaved" />
    <ship-modal ref="ShipModalRef" @success="getData" />
    <export-excel :tabs="tabbars" ref="ExportExcelRef" />
  </el-card>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import InfoModal from './InfoModal.vue'
import StatusModal from './StatusModal.vue'
import ShipModal from './ShipModal.vue'
import ExportExcel from './ExportExcel.vue'
import { useInitTable } from '~/composables/useCommon'
import { formatTimestampValue, hideLoading, showLoading, showModal, showPrompt, toast } from '~/composables/util'
import { deleteOrder, getOrderList, refundOrder, syncWechatServiceStatus } from '~/api/order'

const {
  searchForm,
  resetSearchForm,
  multipleTableRef,
  currentPage,
  limit,
  total,
  tableData,
  getData,
  handleSelectionChange,
  handleDelete,
} = useInitTable({
  searchForm: {
    tab: 'all',
    no: null,
    starttime: null,
    endtime: null,
    name: null,
    phone: null,
  },
  getList: getOrderList,
  success: (res) => {
    total.value = res.totalCount
    tableData.value = (res.list || []).map((item) => ({
      ...item,
      statusLoading: false,
      wechatServiceStatusLoading: false,
    }))
    refreshWechatServiceStatuses()
  },
  deleteData: deleteOrder,
})

const tabbars = ref([
  { name: '全部', key: 'all' },
  { name: '待发货', key: 'noship' },
  { name: '已发货', key: 'shiped' },
  { name: '已收货', key: 'received' },
  { name: '已完成', key: 'finish' },
  { name: '已关闭', key: 'closed' },
  { name: '退款中', key: 'refunding' },
])

const handleSearch = () => getData(1)

const handleTabChange = (tabPane) => {
  searchForm.tab = tabPane?.props?.name || searchForm.tab
  getData(1)
}

const handleResetSearch = () => {
  currentPage.value = 1
  resetSearchForm()
}

const orderStatusLabels = {
  nopay: '待付款',
  noship: '待发货',
  shiped: '已发货',
  received: '已收货',
  finish: '已完成',
  closed: '已关闭',
  refunding: '退款中',
}

const getOrderStatusLabel = (status) => orderStatusLabels[status] || '待发货'
const getOrderStatusTagType = (status) => {
  if (status === 'closed') return 'info'
  if (status === 'refunding') return 'danger'
  if (status === 'nopay' || status === 'noship') return 'warning'
  return 'success'
}

const wechatShippingAppliedStates = new Set(['2', '3', '4', '6'])

const isWechatOrderEffectivelySynced = (row = {}) => (
  String(row.wechat_order_sync_status || '').trim() === 'success'
  || wechatShippingAppliedStates.has(String(row.wechat_service_status || '').trim())
)

const wechatSyncDisplayLabel = (row) => (isWechatOrderEffectivelySynced(row) ? '已同步' : '未同步')

const wechatSyncDisplayTagType = (row) => (isWechatOrderEffectivelySynced(row) ? 'success' : 'warning')

const wechatServiceStatusLabels = {
  '1': '待发货',
  '2': '已发货',
  '3': '已收货',
  '4': '已结算',
  '5': '已退款',
  '6': '待结算',
  unknown: '未同步',
}

const wechatServiceStatusLabel = (status, error) => {
  if (error) return '查询失败'
  const value = String(status || 'unknown').trim()
  return wechatServiceStatusLabels[value] || `状态 ${value}`
}

const wechatServiceStatusTagType = (status) => {
  const value = String(status || 'unknown').trim()
  if (value === '3' || value === '4') return 'success'
  if (value === '5') return 'danger'
  if (value === 'unknown') return 'info'
  return 'warning'
}

// 定时查询当前页订单的微信平台服务状态，避免依赖人工点击同步。
const refreshWechatServiceStatuses = () => {
  const paidRows = tableData.value.filter((row) => row.payment_status === 'paid')
  paidRows.forEach((row) => {
    if (row.wechatServiceStatusLoading) return
    row.wechatServiceStatusLoading = true
    syncWechatServiceStatus(row.id)
      .then((updated) => {
        row.wechat_service_status = updated?.wechat_service_status || 'unknown'
        row.wechat_service_status_error = updated?.wechat_service_status_error || ''
        row.wechat_service_status_synced_at = updated?.wechat_service_status_synced_at || 0
      })
      .catch((error) => {
        row.wechat_service_status = 'unknown'
        row.wechat_service_status_error = error?.response?.data?.message || error?.message || '查询失败'
      })
      .finally(() => {
        row.wechatServiceStatusLoading = false
      })
  })
}

let wechatServiceStatusTimer = null
onMounted(() => {
  wechatServiceStatusTimer = window.setInterval(refreshWechatServiceStatuses, 30000)
})

onBeforeUnmount(() => {
  if (wechatServiceStatusTimer) {
    window.clearInterval(wechatServiceStatusTimer)
    wechatServiceStatusTimer = null
  }
})

const isClosedOrder = (row = {}) => String(row?.order_status || '').trim() === 'closed' || Number(row?.closed || 0) === 1

const canHandleRefund = (row = {}) => {
  if (!String(row?.payment_method || '').trim()) {
    return false
  }

  if (isClosedOrder(row)) {
    return false
  }

  return String(row?.refund_status || '').trim() === 'applied'
}

const InfoModalRef = ref(null)
const info = ref(null)

const openInfoModal = (row) => {
  const detail = JSON.parse(JSON.stringify(row || {}))
  detail.order_items = (Array.isArray(detail.order_items) ? detail.order_items : []).map((item) => {
    if (item.skus_type === 1 && item.goods_skus?.skus) {
      item.sku = Object.values(item.goods_skus.skus)
        .map((sku) => sku?.value)
        .filter(Boolean)
        .join(' / ')
    }
    return item
  })
  info.value = detail
  InfoModalRef.value.open()
}

const StatusModalRef = ref(null)
const handleStatusDisplaySaved = ({ id, status } = {}) => {
  const target = tableData.value.find((row) => Number(row?.id || 0) === Number(id || 0))
  if (!target) return
  target.order_status = status
  toast('订单展示状态已更新（仅当前页面）')
}
const openStatusModal = (row) => StatusModalRef.value.open(row)

const ShipModalRef = ref(null)
const openShipModal = (row) => ShipModalRef.value.open(row)

const ExportExcelRef = ref(null)
const handleExportExcel = () => ExportExcelRef.value.open()

const handleRefund = (id, agree = 0) => {
  ;(agree ? showModal('确认同意该订单退款吗？') : showPrompt('请输入拒绝退款原因'))
    .then(({ value }) => {
      showLoading()
      const data = { agree }
      if (!agree) {
        data.disagree_reason = value
      }
      refundOrder(id, data)
        .then(() => {
          getData()
          toast('操作成功')
        })
        .finally(() => hideLoading())
    })
    .catch(() => {})
}
</script>
