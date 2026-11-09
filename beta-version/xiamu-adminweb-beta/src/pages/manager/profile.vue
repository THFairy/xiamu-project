<!-- 管理员编辑信息页面：支持修改用户名并校验手机号必填。 -->
<template>
    <el-card v-loading="loading" shadow="never" class="border-0">
        <template #header>
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <el-button text @click="handleBack">
                        <el-icon class="mr-1"><arrow-left /></el-icon>
                        返回
                    </el-button>
                    <div class="ml-3 text-base font-semibold text-gray-800">编辑信息</div>
                </div>
                <el-button @click="loadData">刷新</el-button>
            </div>
        </template>

        <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-width="100px"
            size="default"
            class="mx-auto max-w-2xl"
        >
            <el-form-item label="管理员ID">
                <el-input :model-value="form.id ? String(form.id) : '-'" disabled />
            </el-form-item>

            <el-form-item label="权限等级">
                <el-input :model-value="form.permission || '访客'" disabled />
            </el-form-item>

            <el-form-item label="用户名" prop="username">
                <el-input
                    v-model="form.username"
                    maxlength="128"
                    placeholder="请输入用户名"
                />
            </el-form-item>

            <el-form-item label="姓名" prop="name">
                <el-input
                    v-model="form.name"
                    maxlength="128"
                    show-word-limit
                    placeholder="请输入姓名"
                />
            </el-form-item>

            <el-form-item label="手机号" prop="phone">
                <el-input
                    v-model="form.phone"
                    maxlength="11"
                    placeholder="请输入手机号"
                />
            </el-form-item>

            <el-form-item label="邮箱" prop="email">
                <el-input
                    v-model="form.email"
                    maxlength="128"
                    placeholder="请输入邮箱"
                />
            </el-form-item>

            <el-form-item label="头像" prop="avatar">
                <choose-image v-model="form.avatar" :limit="1" />
            </el-form-item>

            <el-form-item>
                <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
                <el-button @click="loadData">重置</el-button>
            </el-form-item>
        </el-form>
    </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import ChooseImage from '~/components/ChooseImage.vue'
import { getinfo, updateProfile } from '~/api/manager'
import { toast } from '~/composables/util'
import store from '~/store'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const saving = ref(false)

const form = reactive({
    id: 0,
    username: '',
    name: '',
    phone: '',
    email: '',
    permission: '',
    avatar: '',
})

const rules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
}

const syncForm = (data = {}) => {
    form.id = Number(data.id || 0)
    form.username = String(data.account || data.loginUsername || '').trim()
    form.name = String(data.name || data.nickname || data.username || '').trim()
    form.phone = String(data.phone || '').trim()
    form.email = String(data.email || '').trim()
    form.permission = String(data.permission || '访客').trim()
    form.avatar = String(data.avatar || '').trim()
}

const loadData = async () => {
    loading.value = true
    try {
        const data = await getinfo()
        syncForm(data || {})
    } finally {
        loading.value = false
    }
}

const handleSubmit = async () => {
    await formRef.value?.validate?.()

    saving.value = true
    try {
        await updateProfile({
            username: String(form.username || '').trim(),
            name: String(form.name || '').trim(),
            phone: String(form.phone || '').trim(),
            email: String(form.email || '').trim(),
            avatar: String(form.avatar || '').trim(),
        })
        toast('保存成功')
        const latest = await store.dispatch('getInfo')
        syncForm(latest || {})
    } finally {
        saving.value = false
    }
}

const handleBack = () => {
    if (window.history.length > 1) {
        router.back()
        return
    }
    router.push('/')
}

onMounted(() => {
    loadData()
})
</script>

<style scoped>
</style>
