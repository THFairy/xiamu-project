// 用途：调用法律文档的网页后台读取与保存接口。
import axios from '~/axios'

export function getLegalDocument(type) {
    return axios.get(`/admin/legal-documents/${type}`)
}

export function updateLegalDocument(type, content) {
    return axios.post(`/admin/legal-documents/${type}`, { content })
}
