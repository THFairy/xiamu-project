<!-- 用途：库存管理列计算规则配置界面。 -->
<template>
    <div class="container calculation-page">
        <div class="page-heading">
            <el-page-header title="返回" content="列计算" @back="router.push('/inventory/list')" />
            <p class="page-description">配置数值计算或时间节点和差计算；时间节点记录格式为 YYYY/M/D HH:mm:ss。</p>
        </div>

        <el-row :gutter="20" align="top">
            <el-col :xs="24" :lg="15">
                <el-card shadow="never" class="border-0">
                    <template #header><span class="font-medium">新增或编辑计算规则</span></template>
                    <el-form label-width="96px">
                        <el-form-item label="计算类型">
                            <el-button-group class="calculation-type-switch">
                                <el-button :type="calculationType === 'number' ? 'primary' : 'default'" @click="changeCalculationType('number')">常规计算</el-button>
                                <el-button :type="calculationType === 'time' ? 'primary' : 'default'" @click="changeCalculationType('time')">时间计算</el-button>
                            </el-button-group>
                        </el-form-item>
                        <el-form-item label="计算列">
                            <el-select v-model="targetColumnKey" class="full-width" placeholder="请选择计算结果要写入的列" @change="handleTargetChange">
                                <el-option v-for="column in targetColumns" :key="column.key" :label="column.label" :value="column.key" />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="计算公式">
                            <div class="formula-editor">
                                <div class="formula-preview">{{ formulaText || '请依次添加列和运算符' }}</div>
                                <div class="formula-tokens">
                                    <el-tag v-for="(token, index) in expression" :key="`${index}-${token.value}`" :type="token.type === 'operator' ? 'warning' : 'info'">
                                        {{ token.type === 'column' ? token.label : token.value }}
                                    </el-tag>
                                </div>
                            </div>
                        </el-form-item>
                        <el-form-item :label="calculationType === 'time' ? '时间节点' : '添加列'">
                            <div class="column-buttons">
                                <el-button v-for="column in sourceColumns" :key="column.key" size="small" :disabled="lastTokenType === 'column'" @click="appendColumn(column)">
                                    {{ column.label }}
                                </el-button>
                                <span v-if="calculationType === 'time' && !sourceColumns.length" class="empty-time-node-tip">请先在库存管理的“列设置”中新增时间节点列</span>
                            </div>
                        </el-form-item>
                        <el-form-item label="运算符">
                            <div class="operator-buttons">
                                <el-button v-for="operator in operators" :key="operator" type="warning" plain :disabled="lastTokenType !== 'column'" @click="appendOperator(operator)">
                                    {{ operator }}
                                </el-button>
                                <el-button plain :disabled="!expression.length" @click="removeLastToken">删除末项</el-button>
                                <el-button plain :disabled="!expression.length" @click="clearExpression">清空</el-button>
                            </div>
                        </el-form-item>
                    </el-form>
                    <div class="example-note">
                        {{ calculationType === 'time'
                            ? '示例：存放库存时间 = 卖出时间 - 创建时间，结果格式：x天x时x分x秒'
                            : '示例：利润 = 最终售价 - 卖出运费 - 回收运费 - 平台费' }}
                    </div>
                    <template #footer>
                        <div class="form-actions">
                            <el-button type="primary" :loading="saving" :disabled="!canSave" @click="saveRule">保存计算规则</el-button>
                        </div>
                    </template>
                </el-card>
            </el-col>

            <el-col :xs="24" :lg="9" class="rules-column">
                <el-card shadow="never" class="border-0">
                    <template #header><span class="font-medium">已配置规则</span></template>
                    <el-empty v-if="!rules.length" description="暂无计算规则" />
                    <div v-for="rule in rules" :key="rule.targetColumnKey" class="rule-item">
                        <div>
                            <div class="rule-title">{{ rule.targetColumnLabel }}<el-tag v-if="rule.calculationType === 'time'" size="small" type="success" class="time-rule-tag">时间节点</el-tag></div>
                            <div class="rule-expression">{{ displayExpression(rule.expression) }}</div>
                        </div>
                        <div class="rule-actions">
                            <el-button type="primary" link @click="editRule(rule)">编辑</el-button>
                            <el-button type="danger" link @click="removeRule(rule)">删除</el-button>
                        </div>
                    </div>
                </el-card>
            </el-col>
        </el-row>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { toast } from '~/composables/util'
import { deleteInventoryCalculation, getInventoryCalculations, getInventoryColumns, saveInventoryCalculation } from '~/api/inventory'

const router = useRouter()
const numberOperators = ['+', '-', '*', '/']
const timeOperators = ['+', '-']
const columns = ref([])
const rules = ref([])
const targetColumnKey = ref('')
const expression = ref([])
const saving = ref(false)
const calculationType = ref('number')

const lastTokenType = computed(() => expression.value[expression.value.length - 1]?.type || '')
const canSave = computed(() => Boolean(targetColumnKey.value && expression.value.length >= 3 && lastTokenType.value === 'column'))
const formulaText = computed(() => expression.value.map((token) => token.type === 'column' ? token.label : token.value).join(' '))
const isTimeColumn = (column) => String(column?.fieldType || column?.field_type || '').toLowerCase() === 'time'
const isImageColumn = (column) => String(column?.fieldType || column?.field_type || '').toLowerCase() === 'image'
const sourceColumns = computed(() => columns.value.filter((column) => calculationType.value === 'time' ? isTimeColumn(column) : !isImageColumn(column) && !isTimeColumn(column)))
const targetColumns = computed(() => columns.value.filter((column) => !isImageColumn(column) && (calculationType.value !== 'time' || !isTimeColumn(column))))
const operators = computed(() => calculationType.value === 'time' ? timeOperators : numberOperators)

const defaultProfitExpression = () => ['final_sale_price', 'sale_freight', 'recycle_freight', 'platform_fee']
    .flatMap((key, index, list) => index === list.length - 1 ? [{ type: 'column', value: key, label: columns.value.find((column) => column.key === key)?.label || key }] : [
        { type: 'column', value: key, label: columns.value.find((column) => column.key === key)?.label || key },
        { type: 'operator', value: '-' },
    ])

const setExpressionFromRule = (rule) => {
    calculationType.value = rule?.calculationType === 'time' ? 'time' : 'number'
    expression.value = rule ? rule.expression.map((token) => ({ ...token })) : targetColumnKey.value === 'profit' ? defaultProfitExpression() : []
}

const handleTargetChange = () => setExpressionFromRule(rules.value.find((rule) => rule.targetColumnKey === targetColumnKey.value))
const changeCalculationType = (type) => {
    if (calculationType.value === type) return
    calculationType.value = type
    expression.value = []
    if (!targetColumns.value.some((column) => column.key === targetColumnKey.value)) {
        targetColumnKey.value = targetColumns.value[0]?.key || ''
    }
}

const appendColumn = (column) => expression.value.push({ type: 'column', value: column.key, label: column.label })
const appendOperator = (operator) => expression.value.push({ type: 'operator', value: operator })
const removeLastToken = () => expression.value.pop()
const clearExpression = () => { expression.value = [] }
const displayExpression = (tokens = []) => tokens.map((token) => token.type === 'column' ? token.label : token.value).join(' ')
const editRule = (rule) => {
    targetColumnKey.value = rule.targetColumnKey
    setExpressionFromRule(rule)
}

const loadPage = async () => {
    const [columnData, ruleData] = await Promise.all([getInventoryColumns(), getInventoryCalculations()])
    columns.value = Array.isArray(columnData) ? columnData : []
    rules.value = Array.isArray(ruleData) ? ruleData : []
    calculationType.value = rules.value[0]?.calculationType === 'time' ? 'time' : 'number'
    targetColumnKey.value = rules.value[0]?.targetColumnKey || columns.value.find((column) => column.key === 'profit')?.key || targetColumns.value[0]?.key || ''
    setExpressionFromRule(rules.value.find((rule) => rule.targetColumnKey === targetColumnKey.value))
}

const saveRule = async () => {
    if (!canSave.value) {
        toast('请选择计算列并完成计算公式', 'warning')
        return
    }
    saving.value = true
    try {
        const saved = await saveInventoryCalculation({
            targetColumnKey: targetColumnKey.value,
            calculationType: calculationType.value,
            expression: expression.value.map(({ type, value }) => ({ type, value })),
        })
        rules.value = [...rules.value.filter((rule) => rule.targetColumnKey !== targetColumnKey.value), saved]
        window.dispatchEvent(new CustomEvent('inventory-management-updated', {
            detail: { action: 'calculation', source: 'inventory-calculations-page' },
        }))
        toast('计算规则已保存')
    } finally {
        saving.value = false
    }
}

const removeRule = async (rule) => {
    await ElMessageBox.confirm(`确定删除“${rule.targetColumnLabel}”的计算规则吗？`, '删除计算规则', { type: 'warning' })
    await deleteInventoryCalculation(rule.targetColumnKey)
    rules.value = rules.value.filter((item) => item.targetColumnKey !== rule.targetColumnKey)
    if (targetColumnKey.value === rule.targetColumnKey) {
        targetColumnKey.value = targetColumns.value[0]?.key || ''
        handleTargetChange()
    }
    window.dispatchEvent(new CustomEvent('inventory-management-updated', {
        detail: { action: 'calculation', source: 'inventory-calculations-page' },
    }))
    toast('计算规则已删除')
}

onMounted(loadPage)
</script>

<style scoped>
.calculation-page { padding-bottom: 24px; }
.page-heading { margin-bottom: 20px; }
.page-description { margin: 12px 0 0 40px; color: #909399; font-size: 13px; }
.full-width { width: 100%; }
.formula-editor { width: 100%; padding: 12px; border: 1px solid #dcdfe6; border-radius: 6px; background: #f8fafc; }
.formula-preview { min-height: 24px; color: #303133; font-weight: 600; }
.formula-tokens, .column-buttons, .operator-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.formula-tokens { margin-top: 12px; }
.column-buttons { width: 100%; }
.empty-time-node-tip { color: #909399; font-size: 13px; line-height: 32px; }
.calculation-type-switch { display: inline-flex; }
.example-note { margin-left: 96px; color: #909399; font-size: 13px; }
.form-actions { display: flex; justify-content: flex-end; }
.rules-column { margin-top: 0; }
.rule-item { display: flex; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid #ebeef5; }
.rule-item:last-child { border-bottom: 0; }
.rule-actions { display: flex; align-items: center; flex-shrink: 0; }
.rule-title { color: #303133; font-weight: 600; }
.time-rule-tag { margin-left: 8px; vertical-align: 1px; }
.rule-expression { margin-top: 6px; color: #606266; font-size: 13px; line-height: 1.6; word-break: break-word; }
@media (max-width: 991px) { .rules-column { margin-top: 20px; } }
</style>
