<!-- 用途：通用表单弹窗，提供提交、取消、加载状态和可滚动内容区域。 -->
<template>
    <el-dialog
        v-model="showDialog"
        :title="title"
        :width="responsiveWidth"
        :top="top"
        :close-on-click-modal="false"
        :destroy-on-close="destroyOnClose"
        @close="handleDialogClose"
    >
        <div class="formDialog-body" :class="bodyClass">
            <slot></slot>
        </div>
        <template v-if="showActions" #footer>
            <el-button type="primary" :loading="loading" @click="submit">{{ confirmText }}</el-button>
            <el-button type="default" @click="close">取消</el-button>
        </template>
    </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { usePhoneStrategy } from '~/phone-strategy'

const props = defineProps({
    title: String,
    width: { type: String, default: 'min(960px, 94vw)' },
    top: { type: String, default: '5vh' },
    bodyClass: { type: String, default: '' },
    destroyOnClose: { type: Boolean, default: false },
    confirmText: { type: String, default: '提交' },
    showActions: { type: Boolean, default: true },
})

const emit = defineEmits(['submit', 'close'])
const { isPhoneLayout } = usePhoneStrategy()
const responsiveWidth = computed(() => isPhoneLayout.value ? 'calc(100vw - 20px)' : props.width)
const showDialog = ref(false)
const loading = ref(false)

// 打开表单弹窗并重置提交状态。
const open = () => {
    loading.value = false
    showDialog.value = true
}

// 关闭表单弹窗并清理提交状态。
const close = () => {
    loading.value = false
    showDialog.value = false
}

const handleDialogClose = () => {
    loading.value = false
    emit('close')
}

const showLoading = () => loading.value = true
const hideLoading = () => loading.value = false
const submit = () => emit('submit')

defineExpose({ open, close, showLoading, hideLoading })
</script>

<style>
.formDialog-body {
    box-sizing: border-box;
    max-height: calc(100vh - 230px);
    overflow-y: auto;
}
</style>
