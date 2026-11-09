import { ElLoading, ElNotification, ElMessageBox } from 'element-plus'
import NProgress from 'nprogress'
let loading = null

function normalizeToastMessage(message, type = "success") {
    const text = typeof message === "string" ? message.trim() : ""
    if (type === "error" && text && /^\?+$/.test(text)) {
        return "登录状态已失效，请重新登录"
    }

    if (type === "error" && text.includes("闁活潿")) {
        return "账号或密码错误"
    }

    if (type === "error") {
        const knownErrorMap = {
            "recycle order not found": "未找到回收单",
            "cancelled recycle order can not create settlement": "用户已取消该回收单，不能发起打款",
            "recycle order is not ready for settlement": "当前回收单还不能打款，请先完成审核后再发起",
            "invalid recycle settlement amount": "当前结款金额必须大于 0，请先填写最终估价",
        }

        if (knownErrorMap[text]) {
            return knownErrorMap[text]
        }
    }

    return message
}

// 显示全屏loading
export function showFullLoading() {
    NProgress.start()
}

// 隐藏全屏loading
export function hideFullLoading() {
    NProgress.done()
}

// 显示loading
export function showLoading(el = "#list-table") {
    el = (typeof el == "boolean" && el == true) ? "body" : el
    loading = ElLoading.service({
        target: document.querySelector(el),
        lock: true,
        text: '加载中',
    })
}

// 隐藏loading
export function hideLoading() {
    if (loading) {
        loading.close()
    }
}

// 成功提示
export function toast(message, type = "success", dangerouslyUseHTMLString = false) {
    ElNotification({
        message: normalizeToastMessage(message, type),
        type,
        dangerouslyUseHTMLString,
        duration: 3000
    })
}

// 确认框
export function showModal(content = "提示内容", type = "warning", title = "") {
    return ElMessageBox.confirm(
        content,
        title, {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type,
        }
    )
}

// 输入框
export function showPrompt(tip, value = "") {
    return ElMessageBox.prompt(tip, '', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputValue: value
    })
}


export function queryParams(data, isPrefix) {
    isPrefix = isPrefix ? isPrefix : false
    let prefix = isPrefix ? '?' : ''
    let _result = []
    for (let key in data) {
        let value = data[key]
            // 去掉为空的参数
        if (['', undefined, null].includes(value)) {
            continue
        }
        if (value.constructor === Array) {
            value.forEach(_value => {
                _result.push(encodeURIComponent(key) + '[]=' + encodeURIComponent(_value))
            })
        } else {
            _result.push(encodeURIComponent(key) + '=' + encodeURIComponent(value))
        }
    }

    return _result.length ? prefix + _result.join('&') : ''
}


export function formatDateTime(date, fmt = "yyyy-MM-dd hh:mm:ss") {
    var o = {
        "M+": date.getMonth() + 1, //月份 
        "d+": date.getDate(), //日 
        "h+": date.getHours(), //小时 
        "m+": date.getMinutes(), //分 
        "s+": date.getSeconds(), //秒 
        "q+": Math.floor((date.getMonth() + 3) / 3), //季度 
        "S": date.getMilliseconds() //毫秒 
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}

export function formatTimestampValue(value, fmt = "yyyy-MM-dd hh:mm:ss") {
    if (value === '' || value === null || value === undefined) {
        return ''
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? '' : formatDateTime(value, fmt)
    }

    if (typeof value === 'string') {
        const trimmedValue = value.trim()
        if (!trimmedValue) {
            return ''
        }

        if (/^\d+$/.test(trimmedValue)) {
            return formatTimestampValue(Number(trimmedValue), fmt)
        }

        return trimmedValue
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) {
            return ''
        }

        const normalizedValue = value < 100000000000 ? value * 1000 : value
        const date = new Date(normalizedValue)
        return Number.isNaN(date.getTime()) ? String(value) : formatDateTime(date, fmt)
    }

    return String(value)
}


function swapArray(arr, index1, index2) {
    arr[index1] = arr.splice(index2, 1, arr[index1])[0];
    return arr;
}
// 上移 将当前数组index索引与后面一个元素互换位置，向数组后面移动一位
export function useArrayMoveUp(arr, index) {
    swapArray(arr, index, index - 1);
}
// 下移 将当前数组index索引与前面一个元素互换位置，向数组前面移动一位
export function useArrayMoveDown(arr, index) {
    swapArray(arr, index, index + 1);
}

// sku排列算法
export function cartesianProductOf() {
    return Array.prototype.reduce.call(arguments, function(a, b) {
        var ret = [];
        a.forEach(function(a) {
            b.forEach(function(b) {
                ret.push(a.concat([b]));
            });
        });
        return ret;
    }, [
        []
    ]);
}
