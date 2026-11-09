<template>
  <el-drawer v-model="dialogVisible" title="导出订单" size="40%">
    <el-form :model="form" size="default" label-width="80px">
      <el-form-item label="订单类型" prop="tab">
        <el-select v-model="form.tab" placeholder="请选择">
          <el-option v-for="item in tabs" :key="item.key" :label="item.name" :value="item.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="时间范围" prop="time">
        <el-date-picker
          v-model="form.time"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="submit">
          {{ loading ? '导出中...' : '导出' }}
        </el-button>
      </el-form-item>
    </el-form>
  </el-drawer>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { exportOrder } from '~/api/order'
import { toast } from '~/composables/util'

defineProps({
  tabs: Array,
})

const dialogVisible = ref(false)

const open = () => {
  dialogVisible.value = true
}

const close = () => {
  dialogVisible.value = false
}

const form = reactive({
  tab: null,
  time: '',
})

const loading = ref(false)

const submit = () => {
  if (!form.tab) return toast('订单类型不能为空', 'error')

  loading.value = true
  let starttime = null
  let endtime = null

  if (Array.isArray(form.time)) {
    starttime = form.time[0]
    endtime = form.time[1]
  }

  exportOrder({
    tab: form.tab,
    starttime,
    endtime,
  })
    .then((data) => {
      const url = window.URL.createObjectURL(new Blob([data]))
      const link = document.createElement('a')
      link.style.display = 'none'
      link.href = url
      link.setAttribute('download', `${Date.now()}.xlsx`)
      document.body.appendChild(link)
      link.click()
      close()
    })
    .finally(() => {
      loading.value = false
    })
}

defineExpose({ open })
</script>
