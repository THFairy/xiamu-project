<!-- 订单详情抽屉及微信订单同步状态。 -->
<template>
  <el-drawer v-model="dialogVisible" :title="drawerTitle" size="50%">
    <div class="info-modal">
      <el-card v-if="info" shadow="never" class="mb-3">
        <template #header><b class="text-sm">订单信息</b></template>
        <el-form label-position="left" label-width="88px">
          <el-form-item label="订单编号">
            {{ info.no || '-' }}
          </el-form-item>
          <el-form-item v-if="paymentMethodText" label="支付方式">
            {{ paymentMethodText }}
          </el-form-item>
          <el-form-item v-if="info.out_trade_no" label="商户单号">
            {{ info.out_trade_no }}
          </el-form-item>
          <el-form-item v-if="info.wechat_order_sync_status" label="微信订单">
            <el-tag size="small" :type="wechatSyncTagType">{{ wechatSyncLabel }}</el-tag>
            <span v-if="info.wechat_order_sync_error" class="ml-2 text-xs text-gray-500">{{ info.wechat_order_sync_error }}</span>
          </el-form-item>
          <el-form-item v-if="info.paid_time" label="支付时间">
            {{ formatTimestampValue(info.paid_time) || '-' }}
          </el-form-item>
          <el-form-item label="创建时间">
            {{ formatTimestampValue(info.create_time) || '-' }}
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="info.ship_data" shadow="never" class="mb-3">
        <template #header><b class="text-sm">发货信息</b></template>
        <el-form label-position="left" label-width="88px">
          <el-form-item label="物流公司">
            {{ info.ship_data.express_company || '-' }}
          </el-form-item>
          <el-form-item label="运单号">
            {{ info.ship_data.express_no || '-' }}
            <el-button :loading="loading" size="small" class="ml-3" type="text" @click="openShipInfoModal(info.id)">
              查看物流
            </el-button>
          </el-form-item>
          <el-form-item label="发货时间">
            {{ formatTimestampValue(info.ship_data.express_time) || info.ship_data.express_time || '-' }}
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="mb-3">
        <template #header><b class="text-sm">商品信息</b></template>
        <div v-for="(item, index) in info.order_items || []" :key="index" class="mb-2 flex">
          <el-image
            :src="item.goods_item ? item.goods_item.cover : ''"
            :preview-src-list="item.goods_item?.cover ? [item.goods_item.cover] : []"
            preview-teleported
            fit="cover"
            :lazy="true"
            style="width: 60px; height: 60px"
            class="rounded"
          />
          <div class="ml-2 text-sm">
            <p>{{ item.goods_item ? item.goods_item.title : '商品已删除' }}</p>
            <p class="mt-1 text-xs text-gray-600">机器编码：{{ item.machine_code || '未记录' }}</p>
            <order-inventory :order-id="item.order_id || info.id" :inventory="item.inventory" readonly />
            <p v-if="item.order_no" class="mt-1 text-xs text-gray-500">订单编号：{{ item.order_no }}</p>
            <p v-if="item.sku" class="mt-1">
              <el-tag type="info" size="small">{{ item.sku }}</el-tag>
            </p>
            <p class="mt-1">
              <b class="mr-2 text-rose-500">￥{{ item.price }}</b>
              <span class="text-xs text-gray-500">x{{ item.num || 1 }}</span>
            </p>
          </div>
        </div>
        <el-form label-position="left" label-width="88px">
          <el-form-item label="成交价">
            <span class="text-sm font-bold text-rose-500">￥{{ info.total_price || 0 }}</span>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="info.address" shadow="never" class="mb-3">
        <template #header><b class="text-sm">收货信息</b></template>
        <el-form label-position="left" label-width="88px">
          <el-form-item label="收货人">
            {{ info.address.name || '-' }}
          </el-form-item>
          <el-form-item label="联系方式">
            {{ info.address.phone || '-' }}
          </el-form-item>
          <el-form-item label="收货地址">
            {{ addressText }}
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="info.refund_status && info.refund_status !== 'pending'" shadow="never" class="mb-3">
        <template #header>
          <div class="flex items-center justify-between">
            <b class="text-sm">退款信息</b>
            <el-tag size="small" type="warning">{{ refundStatusText }}</el-tag>
          </div>
        </template>
        <el-form label-position="left" label-width="88px">
          <el-form-item v-if="info.refund_data?.reason" label="退款原因">
            {{ info.refund_data.reason }}
          </el-form-item>
          <el-form-item v-if="refundRefuseReason" label="拒绝原因">
            {{ refundRefuseReason }}
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </el-drawer>

  <ship-info-modal ref="ShipInfoModalRef" />
</template>

<script setup>
import { computed, ref } from 'vue'
import ShipInfoModal from './ShipInfoModal.vue'
import OrderInventory from './OrderInventory.vue'
import { formatTimestampValue } from '~/composables/util'

const props = defineProps({
  info: {
    type: Object,
    default: () => ({}),
  },
})

const dialogVisible = ref(false)
const loading = ref(false)
const ShipInfoModalRef = ref(false)

const drawerTitle = computed(() => '订单详情')

const paymentMethodText = computed(() => {
  if (props.info?.payment_method_label) {
    return props.info.payment_method_label
  }

  const methodMap = {
    wechat: '微信支付',
    alipay: '支付宝支付',
  }

  return methodMap[props.info?.payment_method] || ''
})

const addressText = computed(() => {
  const address = props.info?.address || {}
  return [address.province, address.city, address.district, address.address].filter(Boolean).join('')
})

const refundRefuseReason = computed(() => {
  if (!props.info?.refund_refuse) {
    return ''
  }

  if (typeof props.info.refund_refuse === 'string') {
    return props.info.refund_refuse
  }

  return props.info.refund_refuse.refund_disagree_reason || ''
})

const refundStatusText = computed(() => {
  const options = {
    pending: '未退款',
    applied: '已申请，等待审核',
    processing: '退款中',
    success: '退款成功',
    failed: '退款失败',
  }
  return props.info?.refund_status ? options[props.info.refund_status] || props.info.refund_status : ''
})

const wechatSyncLabel = computed(() => ({
  pending: '待发货同步',
  success: '已同步',
  failed: '同步失败',
  skipped: '未启用',
}[String(props.info?.wechat_order_sync_status || '').trim()] || '待同步'))

const wechatSyncTagType = computed(() => ({
  success: 'success',
  failed: 'danger',
  skipped: 'info',
}[String(props.info?.wechat_order_sync_status || '').trim()] || 'warning'))

const open = () => {
  dialogVisible.value = true
}

function openShipInfoModal(id) {
  loading.value = true
  ShipInfoModalRef.value.open(id, () => {
    loading.value = false
  })
}

defineExpose({ open })
</script>

<style scoped>
.info-modal {
  top: 60px;
  overflow-y: auto;
  @apply px-3 absolute bottom-0 left-0 right-0;
}
</style>
