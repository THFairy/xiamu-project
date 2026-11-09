import axios from '~/axios'

export function getHomepageSection() {
    return axios.get('/admin/homepage-section')
}

export function getHomepageSectionCategoryOptions() {
    return axios.get('/admin/homepage-section/category-options')
}

export function updateHomepageSection(data) {
    return axios.post('/admin/homepage-section', data)
}
