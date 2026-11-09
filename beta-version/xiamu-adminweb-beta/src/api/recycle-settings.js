// 用途：读取和保存回收收款方式及黄色提示配置。
import axios from '~/axios'

export function getRecycleSettings() {
    return axios.get('/admin/recycle-settings')
}

export function setRecycleSettings(data) {
    return axios.post('/admin/recycle-settings', data, { skipAutoRefresh: true })
}
