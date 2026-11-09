<!-- 用途：搜索条件栅格项，在手机端自动占满整行。 -->
<template>
    <el-col :span="responsiveSpan" :offset="0">
        <el-form-item :label="label" :prop="prop" :label-width="labelWidth">
            <slot></slot>
        </el-form-item>
    </el-col>
</template>
<script setup>
import { computed } from 'vue'
import { usePhoneStrategy } from '~/phone-strategy'

const props = defineProps({
    label:String,
    prop:String,
    labelWidth: {
        type: [String, Number],
        default: undefined,
    },
    span:{
        type:Number,
        default:8
    }
})

const { isPhoneLayout } = usePhoneStrategy()
const responsiveSpan = computed(() => isPhoneLayout.value ? 24 : props.span)
</script>
