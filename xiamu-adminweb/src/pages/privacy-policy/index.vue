<!-- 用途：网页后台填写并保存小程序隐私政策正文。 -->
<template>
    <el-card shadow="never" class="border-0 legal-document-page">
        <template #header>
            <div class="legal-document-title">隐私政策填写</div>
        </template>

        <el-form label-width="0">
            <el-form-item>
                <el-input
                    v-model="content"
                    type="textarea"
                    :rows="18"
                    maxlength="20000"
                    show-word-limit
                    placeholder="请输入隐私政策正文"
                />
            </el-form-item>
            <el-form-item>
                <el-button v-permission="['updateLegalDocument,POST']" type="primary" :loading="saving" @click="save">保存</el-button>
            </el-form-item>
        </el-form>
    </el-card>
</template>

<script setup>
// 用途：加载并保存隐私政策正文。
import { onMounted, ref } from 'vue'
import { getLegalDocument, updateLegalDocument } from '~/api/legal-document'
import { hideLoading, showLoading, toast } from '~/composables/util'

const content = ref('')
const saving = ref(false)

const load = async () => {
    showLoading()
    try {
        const document = await getLegalDocument('privacy-policy')
        content.value = String(document?.content || '')
    } finally {
        hideLoading()
    }
}

const save = async () => {
    const nextContent = content.value.trim()
    if (!nextContent) {
        toast('请输入隐私政策正文', 'error')
        return
    }

    saving.value = true
    try {
        const document = await updateLegalDocument('privacy-policy', nextContent)
        content.value = String(document?.content || nextContent)
        toast('保存成功')
    } finally {
        saving.value = false
    }
}

onMounted(load)
</script>

<style scoped>
/* 用途：保持法律文档后台编辑页的简洁排版。 */
.legal-document-page { min-height: 520px; }
.legal-document-title { font-weight: 600; color: #303133; }
</style>
