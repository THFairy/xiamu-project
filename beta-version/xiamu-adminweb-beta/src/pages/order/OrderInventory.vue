<!-- 用途：只读展示订单已关联机器的实物照片并支持预览。 -->
<template>
  <div v-if="inventory?.images?.length" class="order-inventory flex gap-1 mt-1">
    <el-image v-for="(url, index) in inventory.images" :key="url" :src="url"
      :preview-src-list="inventory.images" :initial-index="index" preview-teleported
      fit="cover" style="width: 40px; height: 40px" />
  </div>
</template>

<script setup>
defineProps({ inventory: Object })
</script>
