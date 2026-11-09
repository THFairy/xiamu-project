// 用途：首页及后台统计接口。
import axios from '~/axios'

export function getStatistics1() {
    return axios.get("/admin/statistics1")
}

export function getDashboardFeeStatistics(year, month) {
    return axios.get('/admin/dashboard/fee-statistics', { params: { year, month } })
}

export function getStatistics2() {
    return axios.get("/admin/statistics2")
}

export function getStatistics3(type) {
    return axios.get(`/admin/statistics3?type=${type}`)
}

export function getAddressLocationStatistics() {
    return axios.get('/admin/address-location-statistics')
}

export function getOrderTimeStatistics() {
    return axios.get('/admin/order-time-statistics')
}

export function getUserEngagementStatistics(type) {
    return axios.get(`/admin/user-engagement-statistics?type=${type}`)
}

export function getUserActivityStatistics(type) {
    return axios.get(`/admin/user-activity-statistics?type=${type}`)
}
