import axios from '~/axios'

function buildQuery(query = {}) {
    const params = new URLSearchParams()

    if (query.title) {
        params.set('title', String(query.title || '').trim())
    }

    if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
        params.set('limit', String(query.limit))
    }

    if (query.mode) {
        params.set('mode', String(query.mode))
    }

    if (query.tutorialCategoryId !== undefined && query.tutorialCategoryId !== null && query.tutorialCategoryId !== '') {
        params.set('tutorialCategoryId', String(query.tutorialCategoryId))
    }

    const suffix = params.toString()
    return suffix ? `?${suffix}` : ''
}

export function createContentPage(data) {
    return axios.post('/admin/content_page', data)
}

export function updateContentPage(id, data) {
    return axios.post(`/admin/content_page/${id}`, data)
}

export function getContentPageList(page, query = {}) {
    return axios.get(`/admin/content_page/${page}${buildQuery(query)}`)
}

export function updateContentPageStatus(id, status) {
    return axios.post(`/admin/content_page/${id}/update_status`, { status })
}

export function deleteContentPage(ids) {
    return axios.post(`/admin/content_page/${ids[0]}/delete`)
}

export function deleteContentPages(ids) {
    return axios.post('/admin/content_page/delete_all', { ids })
}
