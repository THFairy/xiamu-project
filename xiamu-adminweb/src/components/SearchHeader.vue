<!-- 用途：列表搜索区域，在手机端纵向排列搜索项和操作按钮。 -->
<template>
    <el-form v-if="canSearch" :model="model" size="small" label-width="80px" class="mb-3 phone-search-header" @submit.prevent="$emit('search')">
        <el-row :gutter="20">
            <slot></slot>
            <template v-if="showSearch">
                <slot name="show"></slot>
            </template>

            <el-col :span="actionSpan" :offset="offset" >
                <div class="flex items-center justify-end phone-search-actions">
                    <el-button type="primary" native-type="button" @click="$emit('search')">搜索</el-button>
                    <el-button native-type="button" @click="$emit('reset')">重置</el-button>
                    <el-button v-if="hasShowSearch" type="text" native-type="button" @click="showSearch = !showSearch">
                        {{ showSearch ? "收起" : "展开" }}
                        <el-icon class="ml-1">
                            <component :is="showSearch ? 'arrow-up-bold' : 'arrow-down-bold'"></component>
                        </el-icon>
                    </el-button>
                </div>
            </el-col>
        </el-row>
    </el-form>
</template>
<script setup>
    import { ref, computed, useSlots } from 'vue'
    import { hasPermission } from '~/directive/permission'
    import { usePhoneStrategy } from '~/phone-strategy'

    const props = defineProps({
        model:Object,
        permission: {
            type: String,
            default: '',
        },
        actionsRightOnExpand: {
            type: Boolean,
            default: false,
        },
    })

    defineEmits(["search","reset"])
    const canSearch = computed(() => !props.permission || hasPermission([props.permission]))
    const { isPhoneLayout } = usePhoneStrategy()
    const actionSpan = computed(() => isPhoneLayout.value ? 24 : 8)
    const showSearch = ref(false)
    
    const offset = computed(() => {
        if (isPhoneLayout.value) {
            return 0
        }

        if (showSearch.value && props.actionsRightOnExpand) {
            return 16
        }

        return (!onlyOne.value || showSearch.value) ? 0 : 8
    })

    const slots = useSlots()
    const onlyOne = ref(true)
    if(slots.default){
       onlyOne.value = (slots.default()).length == 1 
    }

    const hasShowSearch = ref(!!slots.show)
</script>
