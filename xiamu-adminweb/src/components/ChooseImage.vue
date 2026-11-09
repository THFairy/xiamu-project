<!-- 用途：选择并上传网页图片，上传前统一压缩为 JPG。 -->
<template>
    <template v-if="preview">
        <div class="flex flex-wrap items-start">
            <div
                v-if="typeof modelValue === 'string' && modelValue"
                class="choose-image-item mx-1 mb-2"
            >
                <el-icon
                    class="choose-image-remove"
                    size="18"
                    @click.stop="removeImage(modelValue)"
                >
                    <circle-close />
                </el-icon>
                <el-image
                    class="border rounded"
                    style="width: 100px; height: 100px"
                    :src="modelValue"
                    fit="cover"
                    :preview-src-list="[modelValue]"
                ></el-image>
            </div>

            <div v-else-if="Array.isArray(modelValue)" class="flex flex-wrap">
                <div
                    v-for="(url, index) in modelValue"
                    :key="index"
                    class="choose-image-item mx-1 mb-2"
                >
                    <el-icon
                        class="choose-image-remove"
                        size="18"
                        @click.stop="removeImage(url)"
                    >
                        <circle-close />
                    </el-icon>
                    <el-image
                        class="border rounded"
                        style="min-width: 100px; height: 100px; max-width: 100%"
                        :src="url"
                        fit="cover"
                        :initial-index="index"
                        :preview-src-list="modelValue"
                    ></el-image>
                </div>
            </div>

            <div
                style="width: 100px; height: 100px; transition: all 0.3s"
                class="choose-image-trigger mx-1 mb-2 flex cursor-pointer items-center justify-center rounded border border-dashed hover:bg-gray-100"
                @click="triggerLocalUpload"
            >
                <div class="flex flex-col items-center justify-center text-gray-400">
                    <el-icon :size="25"><plus /></el-icon>
                    <span class="mt-1 text-xs">本地上传</span>
                </div>
            </div>
        </div>
    </template>

    <input
        ref="fileInputRef"
        class="hidden"
        type="file"
        accept="image/*"
        :multiple="limit > 1"
        @change="handleLocalFileChange"
    />
</template>

<script setup>
import { ref } from 'vue'
import { uploadImage } from '~/api/image'
import { compressImageToJpg, MAX_IMAGE_INPUT_SIZE } from '~/composables/imageUpload'
import { hideFullLoading, showFullLoading, toast } from '~/composables/util'

const fileInputRef = ref(null)
const callbackFunction = ref(false)

const open = (callback = false) => {
    callbackFunction.value = callback
    triggerLocalUpload()
}

const props = defineProps({
    modelValue: [String, Array],
    limit: {
        type: Number,
        default: 1
    },
    preview: {
        type: Boolean,
        default: true
    }
})

const emit = defineEmits(['update:modelValue'])

const removeImage = (url) => {
    if (Array.isArray(props.modelValue)) {
        emit('update:modelValue', props.modelValue.filter((item) => item !== url))
    } else {
        emit('update:modelValue', '')
    }
}

const triggerLocalUpload = () => {
    if (!fileInputRef.value) {
        return
    }

    fileInputRef.value.value = ''
    fileInputRef.value.click()
}

const buildUploadFormData = (file) => {
    const formData = new FormData()
    formData.append('img', file)
    formData.append('image_class_id', '0')
    return formData
}

const handleLocalFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) {
        return
    }

    const currentUrls = Array.isArray(props.modelValue)
        ? props.modelValue.filter(Boolean)
        : (props.modelValue ? [props.modelValue] : [])
    const availableCount = props.limit === 1 ? 1 : Math.max(props.limit - currentUrls.length, 0)

    if (availableCount < 1) {
        toast(`最多只能上传 ${props.limit} 张`, 'error')
        return
    }

    const selectedFiles = props.limit === 1
        ? files.slice(0, 1)
        : files.slice(0, availableCount)
    const uploadQueue = selectedFiles.filter((file) => file.size <= MAX_IMAGE_INPUT_SIZE)
    if (uploadQueue.length !== selectedFiles.length) {
        toast('原始图片不能超过 20MB', 'error')
    }
    if (!uploadQueue.length) {
        return
    }
    const uploadedUrls = []
    let hasFailed = false
    let firstErrorMessage = ''

    showFullLoading()
    try {
        for (const file of uploadQueue) {
            try {
                const compressedFile = await compressImageToJpg(file)
                const result = await uploadImage(buildUploadFormData(compressedFile))
                if (result && result.url) {
                    uploadedUrls.push(result.url)
                } else {
                    hasFailed = true
                }
            } catch (error) {
                hasFailed = true
                firstErrorMessage = firstErrorMessage || error?.message || '图片处理或上传失败'
            }
        }
    } finally {
        hideFullLoading()
    }

    if (!uploadedUrls.length) {
        return
    }

    const value = props.limit === 1
        ? uploadedUrls[0]
        : [...currentUrls, ...uploadedUrls].slice(0, props.limit)

    emit('update:modelValue', value)

    if (!props.preview && typeof callbackFunction.value === 'function') {
        callbackFunction.value(value)
        callbackFunction.value = false
    }

    if (hasFailed) {
        toast(uploadedUrls.length
            ? '部分图片上传失败，其余图片已添加'
            : firstErrorMessage || '图片处理或上传失败', uploadedUrls.length ? 'warning' : 'error')
    } else {
        toast('图片上传成功')
    }
}

defineExpose({ open })
</script>

<style>
.c-header {
    border-bottom: 1px solid #eeeeee;
    @apply flex items-center;
}

.choose-image-item {
    position: relative;
    width: 100px;
    height: 100px;
}

.choose-image-remove {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 10;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.92);
    cursor: pointer;
}

.choose-image-trigger {
    position: relative;
}
</style>
