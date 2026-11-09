<!-- 用途：只读展示订单已关联的库存编号与实物照片。 -->
<template>
  <div class="order-inventory">
    <p class="text-xs text-gray-500">库存编号：{{ inventory?.inventory_number || '未关联' }}</p>
    <div v-if="inventory?.images?.length" class="flex gap-1 mt-1">
      <el-image v-for="(url, index) in inventory.images" :key="url" :src="url"
        :preview-src-list="inventory.images" :initial-index="index" preview-teleported
        fit="cover" style="width: 40px; height: 40px" />
    </div>
  </div>
</template>

<script setup>
defineProps({ inventory: Object })
</script>
