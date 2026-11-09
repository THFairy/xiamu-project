<!-- 用途：通用表单抽屉，提供提交、取消和加载状态控制。 -->
<template>
    <el-drawer
        v-model="showDrawer"
        :title="title"
        direction="rtl"
        :close-on-click-modal="false"
        :size="responsiveSize"
        :custom-class="customClass"
        :header-class="headerClass"
        :body-class="bodyClass"
        :destroy-on-close="destroyOnClose"
        @close="handleDrawerClose"
    >
        <div class="formDrawer">
            <div class="body" :style="{ bottom:(showActions ? '50px' : 0) }">
                <slot></slot>
            </div>
            <div class="actions" v-if="showActions">
                <el-button type="primary" @click="submit" :loading="loading">{{ confirmText }}</el-button>
                <el-button type="default" @click="close">取消</el-button>
            </div>
        </div>
    </el-drawer>
</template>
<script setup>
import { computed, ref } from 'vue'
import { usePhoneStrategy } from '~/phone-strategy'

const props = defineProps({
    title:String,
    size:{
        type:String,
        default:"45%"
    },
    customClass:{
        type:String,
        default:""
    },
    headerClass:{
        type:String,
        default:""
    },
    bodyClass:{
        type:String,
        default:""
    },
    destroyOnClose:{
        type:Boolean,
        default:false
    },
    confirmText:{
        type:String,
        default:"提交"
    },
    showActions:{
        type:Boolean,
        default:true
    }
})
const emit = defineEmits(["submit", "close"])
const { isPhoneLayout } = usePhoneStrategy()
const responsiveSize = computed(() => isPhoneLayout.value ? '94vw' : props.size)
const showDrawer = ref(false)
// 打开表单抽屉
const open = ()=> {
    loading.value = false
    showDrawer.value = true
}
// 关闭表单抽屉
const close = ()=> {
    loading.value = false
    showDrawer.value = false
}

const handleDrawerClose = () => {
    loading.value = false
    emit('close')
}


const loading = ref(false)
const showLoading = ()=> loading.value = true
const hideLoading = ()=> loading.value = false

// 提交
const submit = ()=> emit("submit")

defineExpose({ open,close,showLoading,hideLoading })

</script>
<style>
.formDrawer{
    height:100%;width:100%;position: relative;
    @apply flex flex-col;
}
.formDrawer .body{
    overflow-y:auto;position: absolute;top: 0;left: 0;right: 0;
    flex: 1;
}
.formDrawer .actions{
    height:50px;
    @apply mt-auto flex items-center;
}
</style>
