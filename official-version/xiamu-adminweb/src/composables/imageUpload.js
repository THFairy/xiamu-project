// 用途：将网页端图片统一转换为限尺寸、限体积的 JPG 文件后再上传。
import heic2any from 'heic2any'

const MAX_IMAGE_INPUT_SIZE = 20 * 1024 * 1024
const MAX_IMAGE_OUTPUT_SIZE = 500 * 1024
const MAX_IMAGE_DIMENSION = 1920
const MIN_IMAGE_DIMENSION = 640

const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

const getFileExtension = (file) => {
    const fileName = String(file?.name || '').toLowerCase()
    const extensionIndex = fileName.lastIndexOf('.')
    return extensionIndex >= 0 ? fileName.slice(extensionIndex) : ''
}

const isHeicFile = (file) => {
    const fileType = String(file?.type || '').toLowerCase()
    return HEIC_EXTENSIONS.has(getFileExtension(file))
        || fileType === 'image/heic'
        || fileType === 'image/heif'
}

const decodeHeicFile = async (file) => {
    const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.86,
    })
    return Array.isArray(converted) ? converted[0] : converted
}

const prepareImageFile = async (file) => {
    if (isHeicFile(file)) {
        try {
            return await decodeHeicFile(file)
        } catch (_error) {
            throw new Error('当前浏览器无法读取 HEIC 图片，请转换为 JPG、PNG 后重试')
        }
    }

    return file
}

const decodeImage = async (file) => {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file)
            return {
                image: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                cleanup: () => bitmap.close(),
            }
        } catch (_error) {
            // Fall back to the browser image decoder for formats unsupported by createImageBitmap.
        }
    }

    const objectUrl = URL.createObjectURL(file)
    try {
        const image = new Image()
        const loadPromise = typeof image.decode === 'function'
            ? null
            : new Promise((resolve, reject) => {
                image.onload = resolve
                image.onerror = () => reject(new Error('无法读取图片'))
            })
        image.src = objectUrl
        if (typeof image.decode === 'function') {
            await image.decode()
        } else {
            await loadPromise
        }
        return {
            image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            cleanup: () => URL.revokeObjectURL(objectUrl),
        }
    } catch (error) {
        URL.revokeObjectURL(objectUrl)
        throw error
    }
}

const canvasToJpg = (canvas, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob && blob.type === 'image/jpeg') {
            resolve(blob)
        } else {
            reject(new Error('浏览器无法压缩此图片'))
        }
    }, 'image/jpeg', quality)
})

const createJpgFile = (blob, file) => {
    const name = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${name}.jpg`, {
        type: 'image/jpeg',
        lastModified: file.lastModified || Date.now(),
    })
}

export const compressImageToJpg = async (file) => {
    if (!file || (!String(file.type || '').startsWith('image/') && !isHeicFile(file))) {
        throw new Error('请选择图片文件')
    }
    if (file.size > MAX_IMAGE_INPUT_SIZE) {
        throw new Error('原始图片不能超过 20MB')
    }

    const preparedFile = await prepareImageFile(file)
    const decoded = await decodeImage(preparedFile)
    try {
        if (!decoded.width || !decoded.height) {
            throw new Error('无法读取图片尺寸')
        }

        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height))
        const canvas = document.createElement('canvas')
        let width = Math.max(1, Math.round(decoded.width * scale))
        let height = Math.max(1, Math.round(decoded.height * scale))
        let quality = 0.82
        let blob

        const render = async () => {
            canvas.width = width
            canvas.height = height
            const context = canvas.getContext('2d')
            if (!context) {
                throw new Error('浏览器无法处理此图片')
            }
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, width, height)
            context.drawImage(decoded.image, 0, 0, width, height)
            blob = await canvasToJpg(canvas, quality)
        }

        await render()
        while (blob.size > MAX_IMAGE_OUTPUT_SIZE && quality > 0.58) {
            quality = Math.max(0.58, quality - 0.08)
            await render()
        }

        while (blob.size > MAX_IMAGE_OUTPUT_SIZE && Math.max(width, height) > MIN_IMAGE_DIMENSION) {
            const resizeScale = Math.max(MIN_IMAGE_DIMENSION / Math.max(width, height), 0.85)
            width = Math.max(1, Math.round(width * resizeScale))
            height = Math.max(1, Math.round(height * resizeScale))
            quality = 0.58
            await render()
        }

        if (blob.size > MAX_IMAGE_OUTPUT_SIZE) {
            throw new Error('图片压缩后仍超过 500KB，请更换图片')
        }

        return createJpgFile(blob, file)
    } finally {
        decoded.cleanup()
    }
}

export { MAX_IMAGE_INPUT_SIZE, MAX_IMAGE_OUTPUT_SIZE, MAX_IMAGE_DIMENSION }
