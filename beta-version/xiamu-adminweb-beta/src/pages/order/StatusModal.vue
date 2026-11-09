<!-- 订单状态编辑：仅用于后台展示，保存前需要二次确认。 -->
<template>
  <el-drawer v-model="dialogVisible" title="状态编辑" size="40%">
    <el-form label-width="80px">
      <el-form-item label="订单编号">
        <span>{{ orderNo || '-' }}</span>
      </el-form-item>
      <el-form-item label="订单状态">
        <el-radio-group v-model="form.status">
          <el-radio v-for="item in editableStatusOptions" :key="item.value" :label="item.value">
            {{ item.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submit">
          {{ loading ? '保存中...' : '保存' }}
        </el-button>
      </el-form-item>
    </el-form>
  </el-drawer>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { toast, showModal } from '~/composables/util'

const emit = defineEmits(['success'])

const statusOptions = [
  { label: '待发货', value: 'noship' },
  { label: '已发货', value: 'shiped' },
  { label: '已收货', value: 'received' },
  { label: '已完成', value: 'finish' },
  { label: '已关闭', value: 'closed' },
  { label: '退款中', value: 'refunding' },
]

const editableStatusOptions = statusOptions.filter((item) => item.value !== 'received')
const fallbackEditableStatusMap = {
  received: 'finish',
}

const dialogVisible = ref(false)
const loading = ref(false)
const orderId = ref(0)
const orderNo = ref('')
const form = reactive({ status: 'noship' })

const open = (order) => {
  orderId.value = Number(order?.id || 0)
  orderNo.value = order?.no || ''
  const normalizedStatus = String(order?.order_status || '').trim()
  const resolvedStatus = fallbackEditableStatusMap[normalizedStatus] || normalizedStatus
  form.status = editableStatusOptions.some((item) => item.value === resolvedStatus) ? resolvedStatus : 'noship'
  dialogVisible.value = true
}

const close = () => {
  dialogVisible.value = false
}

const submit = () => {
  showModal('订单状态仅用于后台展示，不会改变支付、发货或收货业务状态。确定保存吗？')
    .then(() => {
      loading.value = true
      // 仅通知父列表更新当前行的前端展示，不写入后端业务状态。
      return Promise.resolve()
    })
    .then(() => {
      toast('订单展示状态已更新')
      close()
      emit('success', { id: orderId.value, status: form.status })
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

defineExpose({ open })
</script>

<style scoped>
:deep(.el-radio-group) {
  display: grid;
  gap: 12px;
}
</style>
