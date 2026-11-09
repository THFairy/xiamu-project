// 订单管理接口：查询、发货、退款及微信订单同步。
import axios from '~/axios'
import { queryParams } from '~/composables/util'

export function getOrderList(page, query = {}) {
    let q = queryParams(query, true)
    return axios.get(`/admin/order/${page}${q}`)
}

export function deleteOrder(ids) {
    return axios.post(`/admin/order/delete_all`, { ids })
}

export function shipOrder(id, data) {
    return axios.post(`/admin/order/${id}/ship`, data, { skipAutoRefresh: true })
}

export function syncOrderToWechat(id) {
    return axios.post(`/admin/order/${id}/sync-wechat`, null, { skipAutoRefresh: true })
}

export function syncWechatServiceStatus(id) {
    return axios.post(`/admin/order/${id}/sync-wechat-status`, null, { skipAutoRefresh: true })
}

export function refundOrder(id, data) {
    return axios.post(`/admin/order/${id}/handle_refund`, data)
}

export function updateOrderStatus(id, data) {
    return axios.post(`/admin/order/${id}/status`, data)
}

export function exportOrder(query = {}) {
    let q = queryParams(query, true)
    return axios.post(`/admin/order/excelexport${q}`, {}, {
        token: true,
        responseType: 'blob'
    })
}

export function getShipInfo(id) {
    return axios.get(`/admin/order/${id}/get_ship_info`)
}

export function getOrderInventoryOptions(id, keyword = '') {
    return axios.get(`/admin/order/${id}/inventory`, { params: { keyword } })
}

export function setOrderInventory(id, inventoryId) {
    return axios.post(`/admin/order/${id}/inventory`, { inventoryId }, { skipAutoRefresh: true })
}
