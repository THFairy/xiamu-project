const unsupportedAdminPaths = new Set([
    '/access/list',
    '/image/list',
    '/manager/list',
    '/role/list',
    '/skus/list',
])

export function isUnsupportedAdminPath(path = '') {
    return unsupportedAdminPaths.has(String(path || '').trim())
}

export function filterSupportedAdminTags(tagList = []) {
    return (Array.isArray(tagList) ? tagList : []).filter((item) => !isUnsupportedAdminPath(item?.path))
}
