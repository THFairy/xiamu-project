<!-- 用途：订单发货弹窗，选择发货方式后保存物流信息或同步微信订单。 -->
<template>
    <el-drawer v-model="dialogVisible" title="订单发货" size="40%">
        <el-form :model="form" size="default" label-width="80px">
		    <el-form-item label="发货方式" prop="delivery_type" required>
		      <el-select v-model="form.delivery_type" placeholder="请选择状态" @change="handleDeliveryTypeChange">
		          <el-option label="物流快递" value="logistics" />
		          <el-option label="同城配送" value="same_city" />
		          <el-option label="虚拟发货" value="virtual" />
		        </el-select>
		    </el-form-item>
		    <el-form-item label="快递公司" prop="express_company">
		      <el-select v-model="form.express_company" placeholder="请选择" :disabled="isVirtualDelivery">
		          <el-option
		            v-for="(item,index) in express_company_options"
		            :key="index" :label="item.name" 
                    :value="item.name"/>
		        </el-select>
		    </el-form-item>
		    <el-form-item label="快递单号" prop="express_no">
		      <el-input type="text" v-model="form.express_no" :disabled="isVirtualDelivery"/>
		    </el-form-item>
            <el-form-item>
                <div class="ship-actions">
                    <el-button type="success" :loading="syncing" :disabled="saving" @click="syncWechat">
                        同步微信
                    </el-button>
                    <el-button type="primary" :loading="saving" :disabled="syncing" @click="save">
                        保存
                    </el-button>
                    <el-button :disabled="saving || syncing" @click="close">取消</el-button>
                </div>
            </el-form-item>
		</el-form>
    </el-drawer>
</template>
<script setup>
    import { computed, reactive, ref } from 'vue'
    import { ElMessageBox } from 'element-plus'
    import { toast, showFullLoading, hideFullLoading } from '~/composables/util'

    import {
        getExpressCompanyList
    } from '~/api/express_company'

    import {
        shipOrder,
        syncOrderToWechat,
    } from '~/api/order'

    const dialogVisible = ref(false)
    const emit = defineEmits(['success'])
    const express_company_options = ref([])
    const shipId = ref(0)
    const open = (order)=> {
        shipId.value = Number(order?.id || order || 0)
        const shipData = order?.ship_data || {}
        form.delivery_type = shipData.delivery_type || (shipData.express_company || shipData.express_no ? 'logistics' : '')
        form.express_company = shipData.delivery_type === 'virtual' ? null : (shipData.express_company || null)
        form.express_no = shipData.delivery_type === 'virtual' ? null : (shipData.express_no || null)
        showFullLoading()
        getExpressCompanyList().then(res=>{
            express_company_options.value = res.list
            dialogVisible.value = true
        }).finally(()=>hideFullLoading())
    }
    const close = ()=> dialogVisible.value = false

    const form = reactive({
        delivery_type:'',
        express_company:null,
        express_no:null
    })

    const isVirtualDelivery = computed(() => form.delivery_type === 'virtual')
    const handleDeliveryTypeChange = (deliveryType) => {
        if (deliveryType === 'virtual') {
            form.express_company = null
            form.express_no = null
        }
    }

    const saving = ref(false)
    const syncing = ref(false)
    const validate = () => {
        if (!shipId.value) {
            toast('未找到订单', 'warning')
            return false
        }
        if (!form.delivery_type) {
            toast('请选择发货方式', 'warning')
            return false
        }
        if (!isVirtualDelivery.value && (!String(form.express_company || '').trim() || !String(form.express_no || '').trim())) {
            toast('请填写快递公司和快递单号', 'warning')
            return false
        }
        return true
    }
    const save = () => {
        if (!validate()) return
        saving.value = true
        shipOrder(shipId.value, form)
            .then(() => {
                toast('发货信息已保存')
                close()
                emit('success')
            })
            .finally(() => { saving.value = false })
    }
    const syncWechat = () => {
        if (!validate()) return
        ElMessageBox.confirm(
            '确认后将保存物流信息并同步到微信小程序平台，是否继续？',
            '同步微信',
            {
                confirmButtonText: '确认',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
            .then(() => {
                syncing.value = true
                return shipOrder(shipId.value, form)
                    .then(() => syncOrderToWechat(shipId.value))
                    .then((data) => {
                        if (data?.wechat_order_sync_status === 'success') {
                            toast('微信订单同步成功')
                        } else {
                            const detail = String(data?.wechat_order_sync_error || '').trim()
                            toast(detail ? `已保存发货信息，但微信订单未同步：${detail}` : '已保存发货信息，但微信订单未同步', 'warning')
                        }
                        close()
                        emit('success')
                    })
                    .finally(() => { syncing.value = false })
            })
            .catch(() => {})
    }

    defineExpose({ open })
</script>

<style scoped>
.ship-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}
</style>
