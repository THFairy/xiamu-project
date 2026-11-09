<template>
  <el-drawer v-model="dialogVisible" title="物流信息" size="40%">
    <div class="info-modal">
      <el-card shadow="never" class="mb-3 border-0">
        <div class="flex items-center">
          <el-image :src="info.logo || ''" fit="cover" :lazy="true" style="width: 60px; height: 60px" class="rounded border" />
          <div class="ml-2 text-sm">
            <p class="mb-2">物流公司：{{ info.typename || '-' }}</p>
            <p>物流单号：{{ info.number || '-' }}</p>
          </div>
        </div>
      </el-card>

      <el-card v-if="info.list.length" shadow="never" class="mb-3 border-0 border-t">
        <el-timeline class="ml-[-40px]">
          <el-timeline-item
            v-for="(item, index) in info.list"
            :key="index"
            placement="top"
            :timestamp="item.time"
          >
            {{ item.status }}
          </el-timeline-item>
        </el-timeline>
      </el-card>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'
import { getShipInfo } from '~/api/order'
import { toast } from '~/composables/util'

const dialogVisible = ref(false)
const info = ref({
  list: [],
})

const open = (id, callback = null) => {
  getShipInfo(id)
    .then((res) => {
      const payload = res?.result || res || {}
      info.value = {
        ...payload,
        list: Array.isArray(payload.list) ? payload.list : [],
      }
      dialogVisible.value = true
    })
    .catch(() => {
      toast('获取物流信息失败', 'error')
    })
    .finally(() => {
      if (callback) callback()
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
