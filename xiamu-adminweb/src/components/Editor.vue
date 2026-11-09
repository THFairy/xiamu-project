<!-- 用途：教程正文富文本编辑器及正文配图插入。 -->
<template>
    <div class="editor-shell">
        <div class="editor-toolbar">
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.bold }"
                @mousedown.prevent
                @click="runCommand('bold')"
            >
                加粗
            </el-button>
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.italic }"
                @mousedown.prevent
                @click="runCommand('italic')"
            >
                斜体
            </el-button>
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.underline }"
                @mousedown.prevent
                @click="runCommand('underline')"
            >
                下划线
            </el-button>
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.block === 'h2' }"
                @mousedown.prevent
                @click="formatBlock('h2')"
            >
                标题
            </el-button>
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.block === 'p' }"
                @mousedown.prevent
                @click="formatBlock('p')"
            >
                正文
            </el-button>
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.insertUnorderedList }"
                @mousedown.prevent
                @click="runCommand('insertUnorderedList')"
            >
                无序列表
            </el-button>
            <el-button
                size="small"
                class="editor-toolbar-button"
                :class="{ 'is-active': toolbarState.insertOrderedList }"
                @mousedown.prevent
                @click="runCommand('insertOrderedList')"
            >
                有序列表
            </el-button>
            <el-button size="small" class="editor-toolbar-button" @mousedown.prevent @click="clearFormatting">
                清除格式
            </el-button>
        </div>

        <div class="editor-surface-wrap" @click="focusEditor($event)">
            <div v-if="showPlaceholder" class="editor-placeholder">{{ placeholder }}</div>
            <div
                ref="editorRef"
                class="editor-surface"
                contenteditable="true"
                spellcheck="false"
                @focus="handleFocus"
                @blur="handleBlur"
                @mouseup="handleSelectionChange"
                @keyup="handleSelectionChange"
                @click="handleSurfaceClick"
                @input="handleInput"
                @compositionstart="handleCompositionStart"
                @compositionend="handleCompositionEnd"
            ></div>
        </div>

        <div class="editor-actions">
            <el-button size="small" @click="openImagePicker">插入正文配图</el-button>
            <small class="text-gray-400">可直接从本地上传图片，选中后会自动插入到正文光标位置。</small>
        </div>

        <div class="editor-helper">
            <small class="text-gray-400">正文支持直接编辑文本，也可以通过下方按钮从本地上传配图并插入正文。</small>
        </div>

        <ChooseImage ref="chooseImageRef" :limit="9" :preview="false" />

        <el-dialog
            v-model="imagePreviewVisible"
            title="正文配图预览"
            width="min(900px, 90vw)"
            append-to-body
            destroy-on-close
        >
            <div class="editor-image-preview">
                <img v-if="imagePreviewUrl" :src="imagePreviewUrl" alt="正文配图预览" />
            </div>
        </el-dialog>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ChooseImage from '~/components/ChooseImage.vue'

const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    placeholder: {
        type: String,
        default: '请输入正文内容'
    }
})

const emit = defineEmits(['update:modelValue'])

const editorRef = ref(null)
const chooseImageRef = ref(null)
const savedRange = ref(null)
const isFocused = ref(false)
const isComposing = ref(false)
const lastEmittedValue = ref('')
const imagePreviewVisible = ref(false)
const imagePreviewUrl = ref('')
const toolbarState = ref({
    bold: false,
    italic: false,
    underline: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    block: ''
})

const resetToolbarState = () => {
    toolbarState.value = {
        bold: false,
        italic: false,
        underline: false,
        insertUnorderedList: false,
        insertOrderedList: false,
        block: ''
    }
}

const syncInitialToolbarState = () => {
    if (!editorRef.value || isFocused.value) {
        return
    }

    const firstNode = Array.from(editorRef.value.childNodes)
        .find((node) => node.nodeType !== Node.TEXT_NODE || String(node.textContent || '').trim())

    if (!firstNode) {
        resetToolbarState()
        return
    }

    const firstTag = firstNode.nodeType === Node.TEXT_NODE
        ? 'p'
        : normalizeBlockTag(firstNode.nodeName)

    toolbarState.value = {
        bold: false,
        italic: false,
        underline: false,
        insertUnorderedList: false,
        insertOrderedList: false,
        block: firstTag
    }
}

const normalizeHtml = (value) => {
    const html = String(value || '').trim()
    if (!html || html === '<br>' || html === '<div><br></div>' || html === '<p><br></p>') {
        return ''
    }
    return html
}

const syncEditorContent = (value = '') => {
    if (!editorRef.value) {
        return
    }

    const nextHtml = normalizeHtml(value)
    if (editorRef.value.innerHTML !== nextHtml) {
        editorRef.value.innerHTML = nextHtml
    }

    lastEmittedValue.value = nextHtml
    syncInitialToolbarState()
}

const emitEditorContent = () => {
    if (!editorRef.value) {
        return
    }

    const nextHtml = normalizeHtml(editorRef.value.innerHTML)
    lastEmittedValue.value = nextHtml
    emit('update:modelValue', nextHtml)
}

const isSelectionInsideEditor = () => {
    if (!editorRef.value) {
        return false
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount < 1) {
        return false
    }

    const range = selection.getRangeAt(0)
    return editorRef.value.contains(range.commonAncestorContainer)
}

const normalizeBlockTag = (value = '') => {
    const normalized = String(value || '')
        .replace(/[<>]/g, '')
        .trim()
        .toLowerCase()

    if (!normalized) {
        return ''
    }

    if (normalized === 'div') {
        return 'p'
    }

    return normalized
}

const getClosestBlockTag = () => {
    if (!editorRef.value) {
        return ''
    }

    const selection = window.getSelection()
    const anchorNode = selection?.anchorNode
    let currentNode = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentNode : anchorNode

    while (currentNode && currentNode !== editorRef.value) {
        const tagName = String(currentNode.nodeName || '').toLowerCase()
        if (['h2', 'p', 'div'].includes(tagName)) {
            return normalizeBlockTag(tagName)
        }
        if (tagName === 'ul' || tagName === 'ol') {
            return ''
        }
        currentNode = currentNode.parentNode
    }

    return ''
}

const updateToolbarState = () => {
    if (!editorRef.value || !isSelectionInsideEditor()) {
        if (!isFocused.value) {
            resetToolbarState()
        }
        return
    }

    let block = normalizeBlockTag(document.queryCommandValue('formatBlock'))
    if (!block) {
        block = getClosestBlockTag()
    }

    toolbarState.value = {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        block
    }
}

const saveSelection = () => {
    if (!editorRef.value) {
        return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount < 1) {
        return
    }

    const range = selection.getRangeAt(0)
    if (editorRef.value.contains(range.commonAncestorContainer)) {
        savedRange.value = range.cloneRange()
    }
}

const handleSelectionChange = () => {
    saveSelection()
    updateToolbarState()
}

const handleSurfaceClick = (event) => {
    const image = event.target?.closest?.('img')
    if (!image || !editorRef.value?.contains(image)) {
        return
    }

    const imageUrl = String(image.currentSrc || image.src || '').trim()
    if (!imageUrl) {
        return
    }

    imagePreviewUrl.value = imageUrl
    imagePreviewVisible.value = true
}

const restoreSelection = () => {
    if (!editorRef.value) {
        return false
    }

    const selection = window.getSelection()
    if (!selection) {
        return false
    }

    editorRef.value.focus()

    if (savedRange.value) {
        selection.removeAllRanges()
        selection.addRange(savedRange.value)
        return true
    }

    return false
}

const focusEditor = (event) => {
    if (!editorRef.value) {
        return
    }

    if (event?.target && editorRef.value.contains(event.target)) {
        saveSelection()
        updateToolbarState()
        return
    }

    if (!isFocused.value) {
        editorRef.value.focus()
    }

    ensureSelection()
    updateToolbarState()
}

const focusToEnd = () => {
    if (!editorRef.value) {
        return
    }

    editorRef.value.focus()
    const range = document.createRange()
    range.selectNodeContents(editorRef.value)
    range.collapse(false)

    const selection = window.getSelection()
    if (!selection) {
        return
    }

    selection.removeAllRanges()
    selection.addRange(range)
    savedRange.value = range.cloneRange()
}

const ensureSelection = () => {
    const restored = restoreSelection()
    if (!restored) {
        focusToEnd()
    }
}

const runCommand = (command) => {
    ensureSelection()
    document.execCommand(command, false)
    saveSelection()
    emitEditorContent()
    updateToolbarState()
}

const formatBlock = (tagName) => {
    ensureSelection()
    const normalizedTag = normalizeBlockTag(tagName)
    const nextTag = toolbarState.value.block === normalizedTag && normalizedTag === 'h2' ? 'p' : normalizedTag
    document.execCommand('formatBlock', false, nextTag)
    saveSelection()
    emitEditorContent()
    updateToolbarState()
}

const clearFormatting = () => {
    ensureSelection()
    document.execCommand('removeFormat', false)
    document.execCommand('formatBlock', false, 'p')
    saveSelection()
    emitEditorContent()
    updateToolbarState()
}

const insertImages = (value) => {
    const urls = (Array.isArray(value) ? value : [value]).filter(Boolean)
    if (!urls.length) {
        return
    }

    ensureSelection()
    urls.forEach((url) => {
        document.execCommand('insertHTML', false, `<p><img src="${url}" style="width:200px;height:auto;object-fit:contain;" /></p>`)
    })
    saveSelection()
    emitEditorContent()
    updateToolbarState()
}

const openImagePicker = () => {
    saveSelection()
    if (!chooseImageRef.value || typeof chooseImageRef.value.open !== 'function') {
        return
    }

    chooseImageRef.value.open((value) => {
        nextTick(() => {
            insertImages(value)
        })
    })
}

const handleInput = () => {
    saveSelection()
    updateToolbarState()
    if (!isComposing.value) {
        emitEditorContent()
    }
}

const handleFocus = () => {
    isFocused.value = true
    saveSelection()
    updateToolbarState()
}

const handleBlur = () => {
    isFocused.value = false
    saveSelection()
    nextTick(() => {
        if (!isSelectionInsideEditor()) {
            resetToolbarState()
        }
    })
    if (!isComposing.value) {
        emitEditorContent()
    }
}

const handleCompositionStart = () => {
    isComposing.value = true
}

const handleCompositionEnd = () => {
    isComposing.value = false
    saveSelection()
    emitEditorContent()
    updateToolbarState()
}

const showPlaceholder = computed(() => !normalizeHtml(props.modelValue) && !isFocused.value)

watch(
    () => props.modelValue,
    (value) => {
        const nextHtml = normalizeHtml(value)
        if (isComposing.value) {
            return
        }
        if (isFocused.value && nextHtml === lastEmittedValue.value) {
            return
        }
        syncEditorContent(value)
    }
)

onMounted(() => {
    syncEditorContent(props.modelValue)
    document.addEventListener('selectionchange', updateToolbarState)
})

onBeforeUnmount(() => {
    document.removeEventListener('selectionchange', updateToolbarState)
})
</script>

<style scoped>
.editor-shell {
    width: 100%;
}

.editor-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.editor-toolbar :deep(.editor-toolbar-button) {
    transition: all 0.2s ease;
}

.editor-toolbar :deep(.editor-toolbar-button.is-active) {
    color: #ffffff;
    border-color: #409eff;
    background: #409eff;
    box-shadow: 0 6px 16px rgba(64, 158, 255, 0.24);
}

.editor-toolbar :deep(.editor-toolbar-button.is-active:hover) {
    color: #ffffff;
    border-color: #409eff;
    background: #409eff;
}

.editor-surface-wrap {
    position: relative;
}

.editor-placeholder {
    position: absolute;
    top: 14px;
    left: 16px;
    color: #c0c4cc;
    pointer-events: none;
    z-index: 1;
}

.editor-surface {
    min-height: 420px;
    padding: 14px 16px;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    background: #ffffff;
    line-height: 1.8;
    font-size: 14px;
    color: #303133;
    outline: none;
    overflow-y: auto;
    white-space: pre-wrap;
}

.editor-surface:focus {
    border-color: #409eff;
    box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.18);
}

.editor-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 12px;
    flex-wrap: wrap;
}

.editor-surface :deep(img) {
    width: 200px !important;
    height: auto !important;
    max-width: 100% !important;
    object-fit: contain;
    border-radius: 6px;
    cursor: zoom-in;
}

.editor-image-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 240px;
    max-height: 72vh;
    overflow: auto;
    background: #f5f7fa;
}

.editor-image-preview img {
    display: block;
    max-width: 100%;
    max-height: 68vh;
    object-fit: contain;
}

.editor-helper {
    margin-top: 12px;
}
</style>
