<!-- 用途：展示订单关联库存编号与实物照片，并支持选择、更换和解除机器关联。 -->
<template>
  <div class="order-inventory">
    <p class="text-xs text-gray-500">库存编号：{{ inventory?.inventory_number || '未关联' }}</p>
    <div v-if="inventory?.images?.length" class="flex gap-1 mt-1">
      <el-image v-for="(url, index) in inventory.images" :key="url" :src="url"
        :preview-src-list="inventory.images" :initial-index="index" preview-teleported
        fit="cover" style="width: 40px; height: 40px" />
    </div>
    <el-button v-if="!readonly" v-permission="['updateOrderStatus,POST']" type="text" size="small" @click="open">
      {{ inventory ? '更换库存机器' : '关联库存机器' }}
    </el-button>
    <el-dialog v-model="visible" title="关联仓库机器" width="min(520px, 92vw)" append-to-body :close-on-click-modal="!saving" :show-close="!saving">
      <el-select v-model="selection" class="w-full" filterable remote clearable :remote-method="search"
        :loading="loading" :disabled="saving" placeholder="搜索机器库存编号或检测报告">
        <el-option v-for="option in options" :key="option.id" :value="option.id"
          :label="option.inventory_number || '库存记录 #' + option.id" />
      </el-select>
      <p class="text-xs text-gray-500 mt-2">仅显示未被其他订单占用的机器；清空选择后保存可解除关联。</p>
      <div v-if="selected?.images?.length" class="flex flex-wrap gap-2 mt-3">
        <el-image v-for="(url, index) in selected.images" :key="url" :src="url" :preview-src-list="selected.images"
          :initial-index="index" preview-teleported fit="contain" style="width: 80px; height: 80px" />
      </div>
      <p v-else-if="selected" class="text-xs text-gray-500 mt-3">这台机器暂无库存实物照片</p>
      <template #footer>
        <el-button :disabled="saving" @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { getOrderInventoryOptions, setOrderInventory } from '~/api/order'
import { toast } from '~/composables/util'

const props = defineProps({ orderId: Number, inventory: Object, readonly: Boolean })
const emit = defineEmits(['updated'])
const visible = ref(false)
const options = ref([])
const selection = ref(null)
const loading = ref(false)
const saving = ref(false)
let searchVersion = 0
const selected = computed(() => options.value.find((item) => item.id === selection.value) || (
  props.inventory?.id === selection.value ? props.inventory : null
))
const search = async (keyword = '') => {
  const version = ++searchVersion
  loading.value = true
  try {
    const result = await getOrderInventoryOptions(props.orderId, keyword)
    if (version === searchVersion) options.value = Array.isArray(result) ? result : []
  } catch {
    if (version === searchVersion) options.value = []
  } finally {
    if (version === searchVersion) loading.value = false
  }
}
const open = () => {
  selection.value = props.inventory?.id || null
  options.value = props.inventory ? [props.inventory] : []
  visible.value = true
  search()
}
const save = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const inventory = await setOrderInventory(props.orderId, selection.value || 0)
    emit('updated', inventory)
    visible.value = false
    toast('机器关联已更新')
  } catch {
    // 接口拦截器展示错误，保留选择供用户重试。
  } finally {
    saving.value = false
  }
}
onBeforeUnmount(() => { searchVersion++ })
</script>
