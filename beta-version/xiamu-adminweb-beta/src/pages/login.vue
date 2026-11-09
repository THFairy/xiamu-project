<!-- 用途：后台登录与注册界面，收集管理员登录及注册资料。 -->
<!-- 用途：后台登录与注册界面，收集管理员登录及注册资料。 -->
<template>
    <el-row :gutter="0" class="min-h-screen bg-indigo-500">
        <el-col :md="12" :lg="16" :offset="0" class="flex items-center justify-center">
            <div class="px-10 sm:px-30">
                <div class="sm:text-4xl xl:text-5xl font-bold text-light-50 leading-tight mb-6">欢迎登录</div>
                <div class="sm:text-sm xl:text-md text-gray-200 font-normal">小程序商品与回收信息管理后台</div>
            </div>
        </el-col>
        <el-col :md="12" :lg="8" :offset="0" class="bg-light-50 flex flex-col items-center justify-center">
            <img :src="logoImage" alt="夏木后台 Logo" class="mb-4 h-20 w-20 rounded-2xl object-cover shadow-lg" />
            <h2 class="mt-6 text-3xl font-bold text-gray-900">{{ activeTab === 'login' ? '欢迎回来' : '创建账号' }}</h2>
            <div class="flex items-center justify-center space-x-2 mt-5 mb-8">
                <span class="h-px w-16 bg-gray-200"></span>
                <span class="text-gray-300 font-normal">{{ activeTab === 'login' ? '账号密码登录' : '用户名注册' }}</span>
                <span class="h-px w-16 bg-gray-200"></span>
            </div>
            <el-tabs v-model="activeTab" class="login-tabs mb-4" stretch>
                <el-tab-pane label="登录" name="login"></el-tab-pane>
                <el-tab-pane label="注册" name="register"></el-tab-pane>
            </el-tabs>
            <el-form :model="form" :rules="activeRules" ref="formRef" style="width:250px;" :inline="false" size="default" @submit.prevent="submit">
                <el-form-item prop="username">
                    <el-input
                        v-model="form.username"
                        placeholder="请输入用户名"
                        @input="handleUsernameInput"
                    >
                        <template #prefix>
                            <el-icon class="el-input__icon"><user /></el-icon>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item v-if="activeTab === 'register'" prop="phone">
                    <el-input v-model="form.phone" maxlength="11" placeholder="请输入手机号">
                        <template #prefix>
                            <el-icon class="el-input__icon"><phone /></el-icon>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item v-if="activeTab === 'register'" prop="email">
                    <el-input v-model="form.email" maxlength="128" placeholder="请输入邮箱号（选填）">
                        <template #prefix>
                            <el-icon class="el-input__icon"><message /></el-icon>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item prop="password">
                    <el-input v-model="form.password" placeholder="请输入密码" show-password>
                        <template #prefix>
                            <el-icon class="el-input__icon"><lock /></el-icon>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item v-if="activeTab === 'register'" prop="confirmPassword">
                    <el-input v-model="form.confirmPassword" placeholder="请再次输入密码" show-password>
                        <template #prefix>
                            <el-icon class="el-input__icon"><lock /></el-icon>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item>
                    <el-button round color="#626aef" style="width:250px;color: white;" native-type="button" @click="submit" :loading="loading">
                        {{ activeTab === 'login' ? '登录' : '注册' }}
                    </el-button>
                </el-form-item>
            </el-form>
        </el-col>
    </el-row>
</template>
<script setup>
    import { ref, reactive, computed, watch } from 'vue'
    import { useRouter } from 'vue-router'
    import { useStore } from 'vuex'
    import { ElMessage } from 'element-plus'
    import { toast } from '~/composables/util.js'
    import { register } from '~/api/manager'
    import logoImage from '~/assets/logo.jpg'

    const router = useRouter()
    const activeTab = ref("login")
    const formRef = ref(null)
    const form = reactive({
        username: "",
        phone: "",
        email: "",
        password: "",
        confirmPassword: ""
    })

    const loginRules = {
        username: [{
            required: true,
            message: '请输入用户名',
            trigger: 'blur',
        }],
        password: [{
            required: true,
            message: '密码不能为空',
            trigger: 'blur',
        }],
    }

    const registerRules = {
        username: [{
            required: true,
            message: '请输入用户名',
            trigger: 'blur',
        }, {
            validator: (_rule, value, callback) => {
                const username = String(value || '')
                if (!/^[\u4e00-\u9fffA-Za-z0-9]+$/.test(username)) {
                    callback(new Error('用户名仅支持汉字、英文和数字，不能包含空格'))
                    return
                }
                callback()
            },
            trigger: 'blur',
        }],
        phone: [{
            required: true,
            message: '请输入手机号',
            trigger: 'blur',
        }, {
            pattern: /^1\d{10}$/,
            message: '手机号格式不正确',
            trigger: 'blur',
        }],
        email: [{
            validator: (_rule, value, callback) => {
                const email = String(value || '').trim()
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    callback(new Error('邮箱格式不正确'))
                    return
                }
                callback()
            },
            trigger: 'blur',
        }],
        password: [{
            required: true,
            message: '请输入密码',
            trigger: 'blur',
        }, {
            min: 6,
            message: '密码长度不能少于 6 位',
            trigger: 'blur',
        }],
        confirmPassword: [{
            required: true,
            message: '请再次输入密码',
            trigger: 'blur',
        }, {
            validator: (_rule, value, callback) => {
                if (String(value || '') !== String(form.password || '')) {
                    callback(new Error('两次输入的密码不一致'))
                    return
                }
                callback()
            },
            trigger: 'blur',
        }],
    }

    const activeRules = computed(() => activeTab.value === 'login' ? loginRules : registerRules)

    const loading = ref(false)
    const store = useStore()
    const resolveNextPath = (menus = []) => {
        const firstPath = (Array.isArray(menus) ? menus : []).find((item) => item && item.frontpath)?.frontpath
        return firstPath || "/"
    }

    watch(activeTab, () => {
        formRef.value?.clearValidate?.()
    })

    const handleUsernameInput = (value) => {
        form.username = String(value || '').replace(/\s/g, '')
    }

    const submit = (e) => {
        if (e.key == undefined || e.key == "Enter") {
            formRef.value.validate((valid) => {
                if (!valid) return false
                loading.value = true

                if (activeTab.value === "login") {
                    store.dispatch("login", {
                        username: form.username,
                        password: form.password,
                    }).then((res) => {
                        toast("登录成功")
                        router.push(resolveNextPath(res?.menus))
                    }).finally(() => {
                        loading.value = false
                    })
                    return
                }

                register({
                    username: form.username,
                    name: form.username,
                    phone: form.phone,
                    email: form.email,
                    password: form.password,
                }).then(() => {
                    ElMessage.success("注册成功，请登录后继续完善员工信息")
                    activeTab.value = "login"
                    form.phone = ""
                    form.email = ""
                    form.password = ""
                    form.confirmPassword = ""
                }).finally(() => {
                    loading.value = false
                })
            })
        }
    }

</script>
<style scoped>
.login-tabs :deep(.el-tabs__header) {
    margin-bottom: 18px;
}
</style>
