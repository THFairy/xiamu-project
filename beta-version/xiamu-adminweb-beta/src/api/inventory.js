import axios from '~/axios'
import { queryParams } from '~/composables/util'

export function getInventoryList(page, query = {}) {
    return axios.get(`/admin/inventory_management/${page}${queryParams(query, true)}`)
}

export function exportInventoryData(query = {}) {
    return axios.get(`/admin/inventory_management/export${queryParams(query, true)}`, {
        responseType: 'blob',
    })
}

export function getInventoryColumns() {
    return axios.get('/admin/inventory_management/columns')
}

export function getInventoryColumnPermissions() {
    return axios.get('/admin/inventory_management/column-permissions')
}

export function updateInventoryColumnPermissions(data) {
    return axios.post('/admin/inventory_management/column-permissions', data)
}

export function createInventoryColumn(data) {
    return axios.post('/admin/inventory_management/columns', data)
}

export function updateInventoryColumn(key, data) {
    return axios.post(`/admin/inventory_management/columns/${key}`, data)
}

export function deleteInventoryColumn(key) {
    return axios.post(`/admin/inventory_management/columns/${key}/delete`)
}

export function createInventoryItem(data) {
    return axios.post('/admin/inventory_management', data)
}

export function updateInventoryItem(id, data) {
    return axios.post(`/admin/inventory_management/${id}`, data)
}

export function deleteInventoryItem(id) {
    return axios.post(`/admin/inventory_management/${id}/delete`)
}

export function deleteInventoryItems(ids) {
    return axios.post('/admin/inventory_management/delete_all', { ids })
}

export function getInventoryCalculations() {
    return axios.get('/admin/inventory_management/calculations')
}

export function saveInventoryCalculation(data) {
    return axios.post('/admin/inventory_management/calculations', data)
}

export function deleteInventoryCalculation(targetColumnKey) {
    return axios.post(`/admin/inventory_management/calculations/${targetColumnKey}/delete`)
}

export function getFinanceStatistics(keyword = '', page = 1, limit = 10) {
    return axios.get('/admin/finance/statistics', { params: { keyword, page, limit } })
}
