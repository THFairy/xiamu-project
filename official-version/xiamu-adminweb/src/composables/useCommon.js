import {
    ref,
    reactive,
    onMounted,
    computed,
    nextTick
} from 'vue'

import {
    showLoading,
    hideLoading,
    toast,
    showFullLoading,
    hideFullLoading
} from '~/composables/util.js'

// 初始化表格部分
export function useInitTable(opt = {}) {
    // 搜索相关
    let searchForm = null
    let resetSearchForm = null
    if (opt.searchForm) {
        searchForm = reactive({...opt.searchForm })
        resetSearchForm = () => {
            for (const key in opt.searchForm) {
                searchForm[key] = opt.searchForm[key]
            }
            getData(1)
        }
    }

    // 表格节点
    const multipleTableRef = ref(null)

    // 分页参数
    const currentPage = ref(1)
    const limit = ref(10)
    const total = ref(0)

    // 表格数据
    const tableData = ref([])

    // loading相关
    let loadingEl = "#list-table"
    if (opt.loading) {
        loadingEl = opt.loading
    }

    // 获取表格数据
    function getData(page = false) {
        if (typeof page == "number") currentPage.value = page
        tableData.value = []

        // 开启loading
        showLoading(loadingEl)
        opt.getList(currentPage.value, searchForm)
            .then((res) => {
                if (opt.success && typeof opt.success == "function") {
                    opt.success(res)
                } else {
                    total.value = res.totalCount
                    tableData.value = res.list
                }
            })
            .finally(() => hideLoading())
    }

    // 自动加载相关
    let autoGetData = true
    if (typeof opt.autoGetData == "boolean") {
        autoGetData = opt.autoGetData
    }
    // 页面渲染后加载数据
    onMounted(() => {
        if (autoGetData) {
            getData()
        }
    })

    // 多选处理
    const multipleSelection = ref([])
    const multipleSelectionIds = computed(() => multipleSelection.value.map(o => o.id))
    const handleSelectionChange = (val) => multipleSelection.value = val

    // 批量删除
    const handleDelete = (id) => {
        const ids = id === true ? multipleSelectionIds.value : [id]
        if (ids.length == 0) {
            return toast("请先选中要删除的信息", "error")
        }
        showFullLoading()

        opt.deleteData(ids).then(res => {
            toast("删除成功")

            // 清空选中
            if (multipleTableRef.value) {
                multipleTableRef.value.clearSelection()
            }

            // 删除后保留当前页；若当前页已被删空，则回退到最后一个有效页。
            const remainingTotal = Math.max(0, Number(total.value || 0) - ids.length)
            const nextPage = Math.min(
                currentPage.value,
                Math.max(1, Math.ceil(remainingTotal / limit.value)),
            )
            getData(nextPage)
        }).finally(() => hideFullLoading())
    }

    // 修改状态
    const handleStatusChange = (status, row) => {
        row.statusLoading = true
        opt.updateStatus(row.id, status).then(res => {
            toast("修改状态成功")
            row.status = status
        }).finally(() => row.statusLoading = false)
    }

    return {
        searchForm,
        resetSearchForm,

        multipleTableRef,
        currentPage,
        limit,
        total,
        tableData,
        getData,
        multipleSelection,
        multipleSelectionIds,
        handleSelectionChange,
        handleDelete,
        handleStatusChange
    }
}

// 初始化表单
export function useInitForm(opt = {}) {
    // 表单部分
    const editId = ref(0)
    const drawerTitle = computed(() => editId.value ? "修改" : "新增")
    const form = reactive({})
    const formRef = ref(null)
    const rules = reactive(opt.rules)

    // 表单
    const formDrawerRef = ref(null)

    async function flushActiveFieldValue() {
        if (typeof document === "undefined") {
            await nextTick()
            return
        }

        const activeElement = document.activeElement
        if (activeElement && typeof activeElement.blur === "function") {
            activeElement.blur()
        }

        await nextTick()
    }

    // 提交表单
    async function handleSubmit() {
        await flushActiveFieldValue()

        formRef.value.validate((valid) => {
            if (!valid) return false
                // 提交数据
            formDrawerRef.value.showLoading()

            // 提交之前
            if (opt.beforeSubmit && typeof opt.beforeSubmit == "function") {
                opt.beforeSubmit(form)
            }

            const fun = editId.value ? opt.updateData(editId.value, form) : opt.createData(form)

            fun.then(res => {
                    toast(drawerTitle.value + "成功")
                    if (opt.closeBeforeReload) {
                        formDrawerRef.value.close()
                        opt.getData()
                        return
                    }

                    opt.getData()
                    formDrawerRef.value.close()
                })
                .finally(() => {
                    formDrawerRef.value.hideLoading()
                })

        })
    }

    // 重置表单
    function resetForm(row = false) {
        // 清除之前表单的验证状态
        if (formRef.value) formRef.value.clearValidate()
        const nextForm = row ? { ...opt.form, ...row } : { ...opt.form }
        for (const key in nextForm) {
            form[key] = nextForm[key]
        }
    }
    // 新增
    const handleCreate = () => {
        resetForm()
        editId.value = 0
        formDrawerRef.value.open()
    }

    // 修改
    const handleEdit = (row) => {
        editId.value = row.id
        resetForm(row)
        formDrawerRef.value.open()
    }

    return {
        drawerTitle,
        form,
        formRef,
        rules,
        formDrawerRef,
        handleSubmit,
        handleCreate,
        handleEdit,
    }
}
