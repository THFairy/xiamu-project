import axios from '~/axios'

export function createHomepageBanner(data) {
    return axios.post('/admin/homepage_banner', data)
}

export function updateHomepageBanner(id, data) {
    return axios.post(`/admin/homepage_banner/${id}`, data)
}

export function getHomepageBannerList(page, query = {}) {
    const keyword = String(query.title || '').trim()
    const suffix = keyword ? `?title=${encodeURIComponent(keyword)}` : ''
    return axios.get(`/admin/homepage_banner/${page}${suffix}`)
}

export function getHomepageBannerPrimary() {
    return axios.get('/admin/homepage_banner/primary')
}

export function updateHomepageBannerStatus(id, status) {
    return axios.post(`/admin/homepage_banner/${id}/update_status`, { status })
}

export function updateHomepageBannerPrimary(data) {
    return axios.post('/admin/homepage_banner/primary', data)
}

export function deleteHomepageBanner(ids) {
    return axios.post(`/admin/homepage_banner/${ids[0]}/delete`)
}
