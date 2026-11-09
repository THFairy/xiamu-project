<template>
    <el-card shadow="never" class="border-0" id="list-table">
        <el-form :model="form" size="default" label-width="160px">
            <el-divider content-position="left">顺丰上门取件寄件地址</el-divider>
            <el-form-item label="姓名">
                <el-input v-model="form.sfExpressSender.recipientName" style="width: 50%;" placeholder="请输入寄件联系人姓名"></el-input>
            </el-form-item>
            <el-form-item label="电话">
                <el-input v-model="form.sfExpressSender.recipientPhone" style="width: 50%;" placeholder="请输入寄件联系人电话"></el-input>
            </el-form-item>
            <el-form-item label="公司名称">
                <el-input v-model="form.sfExpressSender.company" style="width: 50%;" placeholder="请输入公司名称（可选）"></el-input>
            </el-form-item>
            <el-form-item label="省">
                <el-input v-model="form.sfExpressSender.province" style="width: 50%;" placeholder="请输入省"></el-input>
            </el-form-item>
            <el-form-item label="市">
                <el-input v-model="form.sfExpressSender.city" style="width: 50%;" placeholder="请输入市"></el-input>
            </el-form-item>
            <el-form-item label="区 / 县">
                <el-input v-model="form.sfExpressSender.district" style="width: 50%;" placeholder="请输入区或县"></el-input>
            </el-form-item>
            <el-form-item label="详细地址">
                <el-input v-model="form.sfExpressSender.addressDetail" style="width: 50%;" placeholder="请输入详细地址"></el-input>
            </el-form-item>
            <el-form-item v-permission="['setSysSetting,POST']">
                <el-button type="primary" size="small" @click="submit">保存</el-button>
            </el-form-item>
        </el-form>
    </el-card>
</template>
<script setup>
    import { reactive,onMounted } from 'vue'
    import { showLoading,hideLoading,toast } from '~/composables/util'
    import { 
        getSysconfig,
        setSysconfig,
    } from '~/api/sysconfig'

    const form = reactive({
        sfExpressSender: {
            recipientName: '',
            recipientPhone: '',
            company: '',
            province: '',
            city: '',
            district: '',
            addressDetail: '',
        },
    })

    function getData(){
        showLoading()
        getSysconfig().then(d=>{
            const sender = d.sfExpressSender && typeof d.sfExpressSender === 'object' ? d.sfExpressSender : {}
            Object.keys(form.sfExpressSender).forEach((key) => {
                form.sfExpressSender[key] = sender[key] || ''
            })
        }).finally(()=>{
            hideLoading()
        })
    }

    onMounted(()=>getData())

    const submit = ()=>{
        showLoading()
        setSysconfig(form).then(res=>{
            toast("修改成功")
            getData()
        }).finally(()=>{
            hideLoading()
        })
    }
</script>
