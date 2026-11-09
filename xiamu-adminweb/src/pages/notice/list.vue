<!-- 用途：公告列表浏览及公告内容编辑页面。 -->
<template>
    <el-card shadow="never" class="border-0">
        <!-- 新增,批量删除 | 刷新,列设置,导出 -->
        <list-header 
        :permissions="{
            create:'createNotice,POST',
            refresh:'getNoticeList,GET'
        }"
        @create="handleCreate"
        @refresh="getData"
        ></list-header>

        <!-- 表格 -->
        <el-table
        id="list-table" 
        :data="tableData" 
        style="width: 100%" 
        stripe
            lazy>
            <el-table-column label="公告标题" prop="title"/>
		    <el-table-column label="公告图片" width="180" align="center">
                <template #default="{ row }">
                    <div v-if="row.images && row.images.length" class="flex items-center justify-center">
                        <img
                            class="rounded border"
                            style="width: 48px; height: 48px"
                            :src="row.images[0]"
                            alt="公告图片"
                        />
                        <span v-if="row.images.length > 1" class="ml-2 text-xs text-gray-400">
                            共 {{ row.images.length }} 张
                        </span>
                    </div>
                    <span v-else class="text-gray-400">无</span>
                </template>
            </el-table-column>
		    <el-table-column align="center" width="380" label="发布时间">
                <template #default="{ row }">{{ formatTimestampValue(row.create_time) || '-' }}</template>
            </el-table-column>
            <el-table-column v-permission="['updateNotice,POST','deleteNotice,POST']" fixed="right" label="操作" width="180" align="center">
                <template #default="{ row }">

                    <el-button v-permission="['updateNotice,POST']" type="text" size="small" @click="handleEdit(row)">修改</el-button>

                    <el-popconfirm title="是否要删除该记录？" @confirm="handleDelete(row.id)" confirm-button-text="是" cancel-button-text="否">
                        <template #reference>
                            <el-button v-permission="['deleteNotice,POST']" type="text" size="small">删除</el-button>
                        </template>
                    </el-popconfirm>
                </template>
            </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="mt-5 flex justify-center">
            <el-pagination 
            :currentPage="currentPage" 
            background 
            layout="prev, pager, next" 
            :page-size="limit" 
            :total="total" 
            @current-change="getData"></el-pagination>
        </div>

        <!-- 新增|修改表单 -->
        <form-drawer 
        ref="formDrawerRef" 
        :title="drawerTitle" 
        @submit="handleSubmit">
            <el-form :model="form" ref="formRef" :rules="rules" label-width="80px" :inline="false" size="default">
                <el-form-item label="公告标题" prop="title">
                    <el-input v-model="form.title" placeholder="公告标题"></el-input>
                </el-form-item>
                <el-form-item label="公告内容" prop="content">
                    <el-input type="textarea" v-model="form.content" placeholder="公告内容" :rows="5"></el-input>
                </el-form-item>
                <el-form-item label="公告图片" prop="images">
                    <choose-image v-model="form.images" :limit="9"></choose-image>
                </el-form-item>
            </el-form>
        </form-drawer>

    </el-card>
</template>
<script setup>
    import ListHeader from '~/components/ListHeader.vue'
    import FormDrawer from '~/components/FormDrawer.vue'
    import ChooseImage from '~/components/ChooseImage.vue'
    import { useInitTable,useInitForm } from '~/composables/useCommon'
    import { formatTimestampValue } from '~/composables/util'
    import { 
        createNotice,
        updateNotice,
        getNoticeList,
        deleteNotice 
    } from '~/api/notice'


    // 初始化表格数据
    const {
        // 分页
        currentPage,
        limit,
        total,
        // 表格数据
        tableData,
        // 获取数据方法
        getData,
        handleDelete,
        handleStatusChange
    } = useInitTable({
        // 获取数据的方法
        getList:getNoticeList,
        // 删除/批量删除api
        deleteData:deleteNotice,
    })


    // 初始化表格
    const {
        drawerTitle,
        form,
        formRef,
        rules,
        formDrawerRef,
        handleSubmit,
        handleCreate,
        handleEdit
    } = useInitForm({
        // 表单初始数据
        form:{
            id: null,
            title:"",
			content:"",
            images:[],
        },
        // 表单验证规则
        rules:{
            title:[{ 
                required:true,
                message:"公告标题不能为空",
                trigger:'blur' ,
            }],
        },
        // 获取数据方法
        getData,
        // 新增数据api
        createData:createNotice,
        // 修改数据api
        updateData:updateNotice,
    })

</script>

<style>

</style>
