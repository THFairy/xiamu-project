<!-- 用途：在网页后台动态管理小程序回收收款方式、填写项和黄色提示。 -->
<template>
    <el-card shadow="never" class="border-0" id="list-table">
        <el-tabs v-model="activeName">
            <el-tab-pane label="支付设置" name="payment">
                <el-alert
                    title="这里的设置会直接影响小程序“商品回收情况填写”页面。支付宝为默认选项，微信零钱到账当前预设为隐藏。"
                    type="warning"
                    :closable="false"
                    show-icon
                    class="mt-3 mb-4"
                />

                <el-table border :data="payMethods" style="width: 100%" row-key="methodKey">
                    <el-table-column label="收款方式" min-width="230">
                        <template #default="{ row }">
                            <div class="method-name-row">
                                <el-input v-model="row.name" maxlength="64" placeholder="请输入收款方式名称" />
                                <el-tag v-if="row.default" type="success" size="small">默认</el-tag>
                            </div>
                            <small class="text-gray-500 flex mt-2">标识：{{ row.methodKey }}</small>
                        </template>
                    </el-table-column>

                    <el-table-column label="小程序显示" width="180" align="center">
                        <template #default="{ row }">
                            <el-switch
                                v-model="row.visible"
                                active-text="显示"
                                inactive-text="隐藏"
                            />
                        </template>
                    </el-table-column>

                    <el-table-column label="信息填写设置" min-width="620">
                        <template #default="{ row }">
                            <div v-for="field in row.fields" :key="field.key" class="field-setting-row">
                                <div class="field-setting-title">
                                    <strong>{{ fieldTitles[field.key] || field.key }}</strong>
                                    <el-switch
                                        v-model="field.visible"
                                        active-text="显示"
                                        inactive-text="隐藏"
                                    />
                                    <el-checkbox v-model="field.required" :disabled="!field.visible">必填</el-checkbox>
                                </div>
                                <el-input
                                    v-model="field.label"
                                    maxlength="64"
                                    placeholder="小程序字段名称"
                                >
                                    <template #prepend>名称</template>
                                </el-input>
                                <el-input
                                    v-model="field.placeholder"
                                    maxlength="128"
                                    placeholder="小程序输入提示"
                                >
                                    <template #prepend>提示</template>
                                </el-input>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>

                <div class="save-row" v-permission="['setSysSetting,POST']">
                    <el-button type="primary" :loading="savingPayment" @click="savePaymentSettings">
                        保存支付设置
                    </el-button>
                </div>
            </el-tab-pane>

            <el-tab-pane label="购物设置" name="shopping">
                <el-form label-width="160px" size="default" class="mt-4">
                    <el-form-item label="黄色提示显示">
                        <el-switch
                            v-model="notice.visible"
                            active-text="显示"
                            inactive-text="隐藏"
                        />
                    </el-form-item>
                    <el-form-item label="黄色提示内容">
                        <div class="notice-editor">
                            <el-input
                                v-model="notice.content"
                                type="textarea"
                                :rows="8"
                                maxlength="4000"
                                show-word-limit
                                placeholder="每条提示单独一行"
                            />
                            <small class="text-gray-500 flex mt-2">
                                每行会在小程序黄色提示区域单独显示；保存后无需修改小程序代码。
                            </small>
                        </div>
                    </el-form-item>
                    <el-form-item v-permission="['setSysSetting,POST']">
                        <el-button type="primary" :loading="savingNotice" @click="saveNoticeSettings">
                            保存购物设置
                        </el-button>
                    </el-form-item>
                </el-form>
            </el-tab-pane>
        </el-tabs>
    </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { hideLoading, showLoading, toast } from '~/composables/util'
import { getRecycleSettings, setRecycleSettings } from '~/api/recycle-settings'

const activeName = ref('payment')
const payMethods = ref([])
const savingPayment = ref(false)
const savingNotice = ref(false)
const notice = reactive({
    visible: true,
    content: '',
})

const fieldTitles = {
    accountNumber: '收款账号',
    realName: '真实姓名',
    orderRemark: '订单备注',
}

const applySettings = (data = {}) => {
    payMethods.value = Array.isArray(data.payMethods)
        ? data.payMethods.map(method => ({
            ...method,
            visible: Boolean(method.visible),
            default: Boolean(method.default),
            fields: Array.isArray(method.fields)
                ? method.fields.map(field => ({
                    ...field,
                    visible: Boolean(field.visible),
                    required: Boolean(field.required),
                }))
                : [],
        }))
        : []

    notice.visible = Boolean(data.notice && data.notice.visible)
    notice.content = String(data.notice && data.notice.content || '')
}

const loadSettings = async () => {
    showLoading()
    try {
        applySettings(await getRecycleSettings())
    } finally {
        hideLoading()
    }
}

const savePaymentSettings = async () => {
    if (!payMethods.value.some(method => method.visible)) {
        toast('至少需要显示一种收款方式', 'error')
        return
    }

    savingPayment.value = true
    try {
        const data = await setRecycleSettings({ payMethods: payMethods.value })
        applySettings(data)
        toast('支付设置保存成功')
    } finally {
        savingPayment.value = false
    }
}

const saveNoticeSettings = async () => {
    if (!notice.content.trim()) {
        toast('黄色提示内容不能为空', 'error')
        return
    }

    savingNotice.value = true
    try {
        const data = await setRecycleSettings({ notice })
        applySettings(data)
        toast('购物设置保存成功')
    } finally {
        savingNotice.value = false
    }
}

onMounted(loadSettings)
</script>

<style scoped>
.method-name-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.method-name-row :deep(.el-input) {
    max-width: 240px;
}

.field-setting-row {
    display: grid;
    grid-template-columns: 180px minmax(180px, 1fr) minmax(210px, 1fr);
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #ebeef5;
}

.field-setting-row:last-child {
    border-bottom: 0;
}

.field-setting-title {
    display: flex;
    align-items: center;
    gap: 10px;
}

.notice-editor {
    width: min(820px, 100%);
}

.save-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
}

@media (max-width: 1200px) {
    .field-setting-row {
        grid-template-columns: 1fr;
    }
}
</style>
