// 用途：回收配置管理页的商品、选项组和选项接口。
import axios from '~/axios'
import { queryParams } from '~/composables/util'

export function getRecycleProfiles() {
    return axios.get('/admin/recycle/profiles')
}

export function getRecycleProductList(page, query = {}) {
    const q = queryParams(query, true)
    return axios.get(`/admin/recycle/products/${page}${q}`)
}

export function createRecycleProduct(data) {
    return axios.post('/admin/recycle/products', data)
}

export function updateRecycleProduct(id, data) {
    return axios.post(`/admin/recycle/products/${id}`, data)
}

export function updateRecycleProductStatus(id, status) {
    return axios.post(`/admin/recycle/products/${id}/update_status`, { status })
}

export function deleteRecycleProducts(ids) {
    return axios.post('/admin/recycle/products/delete_all', { ids })
}

export function getRecycleOptionGroups(query = {}) {
    const q = queryParams(query, true)
    return axios.get(`/admin/recycle/option-groups${q}`)
}

export function createRecycleOptionGroup(data) {
    return axios.post('/admin/recycle/option-groups', data)
}

export function updateRecycleOptionGroup(id, data) {
    return axios.post(`/admin/recycle/option-groups/${id}`, data)
}

export function updateRecycleOptionGroupStatus(id, status) {
    return axios.post(`/admin/recycle/option-groups/${id}/update_status`, { status })
}

export function deleteRecycleOptionGroup(id) {
    return axios.post(`/admin/recycle/option-groups/${id}/delete`)
}

export function deleteRecycleOptionGroups(ids) {
    return axios.post('/admin/recycle/option-groups/delete_all', { ids })
}

export function reorderRecycleOptionGroups(profileKey, groups) {
    return axios.post('/admin/recycle/option-groups/reorder', { profileKey, groups })
}

export function getRecycleOptionItems(query = {}) {
    const q = queryParams(query, true)
    return axios.get(`/admin/recycle/option-items${q}`)
}

export function createRecycleOptionItem(data) {
    return axios.post('/admin/recycle/option-items', data)
}

export function updateRecycleOptionItem(id, data) {
    return axios.post(`/admin/recycle/option-items/${id}`, data)
}

export function updateRecycleOptionItemStatus(id, status) {
    return axios.post(`/admin/recycle/option-items/${id}/update_status`, { status })
}

export function deleteRecycleOptionItem(id) {
    return axios.post(`/admin/recycle/option-items/${id}/delete`)
}

export function deleteRecycleOptionItems(ids) {
    return axios.post('/admin/recycle/option-items/delete_all', { ids })
}

export function getRecycleSubmissionList(page, query = {}) {
    const q = queryParams(query, true)
    return axios.get(`/admin/recycle/submissions/${page}${q}`)
}

export function getRecycleSubmissionReviews(id) {
    return axios.get(`/admin/recycle/submissions/${id}/reviews`)
}

export function deleteRecycleSubmissions(ids) {
    return axios.post('/admin/recycle/submissions/delete_all', { ids })
}

export function createRecycleSubmission(data) {
    return axios.post('/admin/recycle/submissions', data)
}

export function updateRecycleSubmissionInfo(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/info`, data)
}

export function getRecycleSubmissionSettlements(id) {
    return axios.get(`/admin/recycle/submissions/${id}/settlements`)
}

export function markRecycleSubmissionIncorrect(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/mark_incorrect`, data)
}

export function reviewRecycleSubmission(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/review`, data)
}

export function updateRecycleSubmissionReport(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/report`, data)
}

export function publishRecycleSubmission(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/publish`, data)
}

// 提交回收检测结果，并同步创建待审核商品与库存记录。
export function completeRecycleSubmissionInspection(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/inspection`, data)
}

export function createRecycleSubmissionSettlement(id) {
    return axios.post(`/admin/recycle/submissions/${id}/settlement/create`)
}

export function syncRecycleSubmissionSettlement(id) {
    return axios.post(`/admin/recycle/submissions/${id}/settlement/sync`)
}

export function completeAlipayRecycleSubmissionSettlement(id, data) {
    return axios.post(`/admin/recycle/submissions/${id}/settlement/manual-alipay`, data)
}
