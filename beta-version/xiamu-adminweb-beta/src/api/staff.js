import axios from '~/axios'
import { queryParams } from '~/composables/util'

export function getStaffList(page, query = {}) {
    const q = queryParams(query, true)
    return axios.get(`/admin/staff/${page}${q}`)
}

export function createStaff(data) {
    return axios.post('/admin/staff', data)
}

export function updateStaff(id, data) {
    return axios.post(`/admin/staff/${id}`, data)
}

export function getStaffPermissions(id) {
    return axios.get(`/admin/staff/${id}/permissions`)
}

export function updateStaffPermissions(id, data) {
    return axios.post(`/admin/staff/${id}/permissions`, data)
}

export function deleteStaff(id) {
    return axios.post(`/admin/staff/${id}/delete`)
}
