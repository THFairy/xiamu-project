// 用途：封装后台分类分区与分类类目的接口请求。
import axios from '~/axios'

export function createCategory(data) {
    return axios.post('/admin/category', data, { skipAutoRefresh: true })
}

export function updateCategory(id, data) {
    return axios.post('/admin/category/' + id, data, { skipAutoRefresh: true })
}

export function getCategoryList(scene = 'sale', includeDisabled = true, sectionKey = '', page = 1, limit = 10) {
    return axios.get('/admin/category', {
        params: {
            scene,
            sectionKey,
            includeDisabled: includeDisabled ? 1 : 0,
            page,
            limit,
        }
    })
}

export function getCategorySections(includeDisabled = true) {
    return axios.get('/admin/category-sections', {
        params: { includeDisabled: includeDisabled ? 1 : 0 }
    })
}

export function getTutorialEndLinkCategoryOptions() {
    return axios.get('/admin/content_page/end-link-category-options')
}

export function createCategorySection(data) {
    return axios.post('/admin/category-sections', data, { skipAutoRefresh: true })
}

export function updateCategorySection(id, data) {
    return axios.post(`/admin/category-sections/${id}`, data, { skipAutoRefresh: true })
}

export function deleteCategorySection(id) {
    return axios.post(`/admin/category-sections/${id}/delete`, null, { skipAutoRefresh: true })
}

export function updateCategoryStatus(id, status) {
    return axios.post(`/admin/category/${id}/update_status`, { status }, { skipAutoRefresh: true })
}

export function deleteCategory(ids) {
    return axios.post(`/admin/category/${ids[0]}/delete`, null, { skipAutoRefresh: true })
}

export function sortCategory(data) {
    return axios.post('/admin/category/sort', { sortdata: JSON.stringify(data) })
}
