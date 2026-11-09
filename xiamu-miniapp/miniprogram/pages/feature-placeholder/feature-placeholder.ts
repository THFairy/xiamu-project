// 教程详情页及其他内容占位页的展示、互动与末尾商品跳转逻辑。
import {
  clearPublicBackendCache,
  ensureBackendSession,
  fetchContentPageDetail,
  fetchPublicNoticeDetail,
  fetchTutorialCategories,
  fetchTutorialArticles,
  recordTutorialShare,
  toggleTutorialInteraction,
  type BackendContentPage,
} from '../../utils/backend'
import { resolveBackendAssetUrl } from '../../utils/backend-config'
import { shouldIgnoreRapidBackTap } from '../../utils/navigation'
import { getStatusBarHeight } from '../../utils/system'

interface BackTapGuard {
  backTapLockedUntil?: number
}

interface FeaturePlaceholderData {
  statusBarHeight: number
  isLoading: boolean
  pageTitle: string
  imageUrl: string
  imageUrls: string[]
  helperText: string
  bodyText: string
  contentHtml: string
  contentPageId: number
  tutorialPages: TutorialPageView[]
  tutorialPageIndex: number
  tutorialPageCount: number
  isTutorialArticlePage: boolean
  tutorialViewCount: number
  tutorialLikeCount: number
  tutorialFavoriteCount: number
  tutorialShareCount: number
  tutorialLiked: boolean
  tutorialFavorited: boolean
  tutorialInteractionLoading: boolean
  endLinkProductId: number
  endLinkCategoryKey: string
  endLinkText: string
  isDirectoryPage: boolean
  isTutorialCategoryPage: boolean
  tutorialCategoryId: number
  isTutorialPage: boolean
  isFaqPage: boolean
  isNoticePage: boolean
  faqItems: FaqItem[]
  directorySearchKeyword: string
  directoryCategories: DirectoryCategoryItem[]
  directoryQuestions: DirectoryQuestionItem[]
  directoryHasResults: boolean
  directoryLoading: boolean
}

interface FaqItem {
  id: number
  question: string
  answer: string
  expanded: boolean
}

interface DirectoryCategoryItem {
  id: number
  icon: string
  title: string
  tone: string
  imageUrl?: string
  pageId?: number
}

interface DirectoryQuestionItem {
  id: number
  tag: string
  tagImageUrl?: string
  question: string
  likeCount?: number
  favoriteCount?: number
  pageId?: number
  tutorialCategoryId?: number
  tutorialCategoryTitle?: string
  showInHot?: boolean
  contentText?: string
}

interface TutorialPageView {
  pageNumber: number
  coverImages: string[]
  contentHtml: string
}

type FeaturePlaceholderOptions = {
  pageId?: string
  noticeId?: string
  title?: string
  imageUrl?: string
  helperText?: string
  tutorialCategoryId?: string
}

interface FeaturePlaceholderPage extends BackTapGuard {
  directoryCategorySource?: DirectoryCategoryItem[]
  directoryHotQuestionSource?: DirectoryQuestionItem[]
  directoryArticleSource?: DirectoryQuestionItem[]
  directoryStatsRefreshReady?: boolean
  onLoad(options: FeaturePlaceholderOptions): void
  onShow(): void
  onBackTap(): void
  onFaqItemTap(event: WechatMiniprogram.TouchEvent<{}, {}, { id?: number }>): void
  onDirectoryCategoryTap(event: WechatMiniprogram.TouchEvent<{}, {}, { categoryId?: number; keyword?: string; title?: string }>): void
  onDirectoryQuestionTap(event: WechatMiniprogram.TouchEvent<{}, {}, { pageId?: number; question?: string }>): void
  onDirectorySearchInput(event: WechatMiniprogram.Input): void
  onDirectorySearchConfirm(event: WechatMiniprogram.CustomEvent<{ value?: string }>): void
  onDirectorySearchClear(): void
  onEndLinkTap(): void
  onTutorialEndLinkTap(): void
  onPreviousTutorialPage(): void
  onNextTutorialPage(): void
  applyTutorialPage(index: number): void
  toggleTutorialAction(action: 'like' | 'favorite'): Promise<void>
  onTutorialLikeTap(): void
  onTutorialFavoriteTap(): void
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  applyDirectorySearch(keyword: string): void
  refreshDirectoryQuestionStats(): Promise<void>
}

const DEFAULT_TITLE = '功能说明'
const DEFAULT_HELPER_TEXT = '当前页面作为内容占位页，可在网页端继续维护图文内容。'
const EMPTY_CONTENT_TEXT = '暂无教程内容'
const DIRECTORY_PAGE_ID = 1
const DIRECTORY_CATEGORY_TONES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'cyan']
const DIRECTORY_IMAGE_TOKEN_PREFIX = '__directory_image__:'
const PENDING_SORT_CATEGORY_KEY = 'pending-sorts-category-key'

const safeDecodeText = (value?: string) => {
  if (!value) {
    return ''
  }

  try {
    return decodeURIComponent(value)
  } catch (_error) {
    return value
  }
}

const RICH_TEXT_ROOT_STYLE = 'font-size: 28rpx; line-height: 1.9; color: #4a5362; white-space: normal; word-break: break-word; overflow-wrap: break-word;'
const RICH_TEXT_PARAGRAPH_STYLE = 'margin: 0 0 24rpx; line-height: 1.9; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word;'
const RICH_TEXT_LIST_STYLE = 'margin: 0 0 24rpx; padding-left: 2.2em; line-height: 1.9; white-space: normal; word-break: break-word; overflow-wrap: break-word;'
const RICH_TEXT_LIST_ITEM_STYLE = 'margin: 0 0 12rpx; line-height: 1.9; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word;'
const RICH_TEXT_IMAGE_STYLE = 'display: block; width: 100%; max-width: 100%; height: auto; margin: 24rpx 0; border-radius: 18rpx; box-sizing: border-box;'

const isTemporaryDevtoolsImageUrl = (value: string) => (
  /^https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?\/__tmp__(?:\/|$)/i.test(value)
)

const decodeHtmlEntities = (value: string) => {
  return value
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const isLikelyHtml = (value: string) => /<\/?[a-z][^>]*>/i.test(value)

const mergeStyleAttribute = (attrs: string, injectedStyle: string) => {
  const normalizedAttrs = String(attrs || '')
  const styleMatch = normalizedAttrs.match(/\sstyle=(['"])([\s\S]*?)\1/i)

  if (styleMatch) {
    const existingStyle = String(styleMatch[2] || '').trim().replace(/;?$/, ';')
    return normalizedAttrs.replace(styleMatch[0], ` style="${`${existingStyle} ${injectedStyle}`.trim()}"`)
  }

  return `${normalizedAttrs} style="${injectedStyle}"`
}

const formatPlainTextLine = (value: string) => {
  const decodedLine = decodeHtmlEntities(String(value || '').replace(/\t/g, '    '))
  const escapedLine = escapeHtml(decodedLine)

  return escapedLine
    .replace(/^ +/g, (match) => '&nbsp;'.repeat(match.length))
    .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
}

const toPreviewText = (value?: string) => {
  const source = String(value || '').trim()
  if (!source) {
    return ''
  }

  return decodeHtmlEntities(
    source
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<\/?h[1-6][^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

const buildPlainTextHtml = (value: string) => {
  const lines = decodeHtmlEntities(String(value || '').replace(/\r/g, '')).split('\n')
  const paragraphs = lines
    .map((line) => `<p style="${RICH_TEXT_PARAGRAPH_STYLE}">${formatPlainTextLine(line) || '<br>'}</p>`)
    .join('')

  return `<div style="${RICH_TEXT_ROOT_STYLE}">${paragraphs}</div>`
}

const enhanceRichTextHtml = (value: string) => {
  let html = String(value || '').replace(/\r/g, '').trim()

  if (!html) {
    return ''
  }

  html = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<(p|div|section|article|blockquote|h[1-6])\b([^>]*)>/gi, (_match, tagName, attrs) => {
      return `<${tagName}${mergeStyleAttribute(String(attrs || ''), RICH_TEXT_PARAGRAPH_STYLE)}>`
    })
    .replace(/<(ul|ol)\b([^>]*)>/gi, (_match, tagName, attrs) => {
      return `<${tagName}${mergeStyleAttribute(String(attrs || ''), RICH_TEXT_LIST_STYLE)}>`
    })
    .replace(/<li\b([^>]*)>/gi, (_match, attrs) => {
      return `<li${mergeStyleAttribute(String(attrs || ''), RICH_TEXT_LIST_ITEM_STYLE)}>`
    })
    .replace(/<span\b([^>]*)>/gi, (_match, attrs) => {
      return `<span${mergeStyleAttribute(String(attrs || ''), 'white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word;')}>`
    })
    .replace(/<img\b([^>]*)\/?>/gi, (_match, attrs) => {
      const sourceAttrs = String(attrs || '')
      const sourceMatch = sourceAttrs.match(/\ssrc=(['"])([\s\S]*?)\1/i)
      const sourceUrl = decodeHtmlEntities(String(sourceMatch?.[2] || '')).trim()

      if (!sourceUrl || isTemporaryDevtoolsImageUrl(sourceUrl)) {
        return ''
      }

      const resolvedSourceUrl = resolveBackendAssetUrl(sourceUrl)
      if (!resolvedSourceUrl) {
        return ''
      }

      const normalizedAttrs = sourceAttrs
        .replace(/\swidth=(['"])[\s\S]*?\1/gi, '')
        .replace(/\sheight=(['"])[\s\S]*?\1/gi, '')
        .replace(/\ssrc=(['"])[\s\S]*?\1/i, ` src="${escapeHtml(resolvedSourceUrl)}"`)
      return `<img${mergeStyleAttribute(normalizedAttrs, RICH_TEXT_IMAGE_STYLE)} />`
    })

  return `<div style="${RICH_TEXT_ROOT_STYLE}">${html}</div>`
}

const buildRichTextHtml = (value?: string) => {
  const source = String(value || '')

  if (!source.trim()) {
    return ''
  }

  return isLikelyHtml(source) ? enhanceRichTextHtml(source) : buildPlainTextHtml(source)
}

const mapTutorialPageView = (page: any, fallbackPage?: TutorialPageView): TutorialPageView => {
  const contentHtml = String(page?.contentHtml || page?.content_html || '').trim()
  const sourceImages = Array.isArray(page?.coverImages || page?.cover_images)
    ? (page.coverImages || page.cover_images)
    : []
  return {
    pageNumber: Number(page?.pageNumber || page?.page_number || fallbackPage?.pageNumber || 1),
    coverImages: sourceImages.map((item: unknown) => resolveBackendAssetUrl(String(item || '').trim()) || String(item || '').trim()).filter(Boolean),
    contentHtml: buildRichTextHtml(contentHtml),
  }
}

const normalizeDirectorySearchKeyword = (keyword: string) => String(keyword || '').trim().toLowerCase()

const titleMatchesKeyword = (title: string, keyword: string): boolean => {
  const normalizedTitle = title.toLowerCase()
  const normalizedKeyword = keyword.replace(/\s+/g, '')

  if (!normalizedKeyword) {
    return true
  }

  let titleIndex = 0
  for (const character of normalizedKeyword) {
    titleIndex = normalizedTitle.indexOf(character, titleIndex)
    if (titleIndex === -1) {
      return false
    }
    titleIndex += 1
  }

  return true
}

const isDirectoryToneToken = (value: string) => {
  return DIRECTORY_CATEGORY_TONES.includes(String(value || '').trim().toLowerCase())
}

const extractDirectoryImageUrl = (value: string) => {
  const source = decodeHtmlEntities(String(value || '').trim())

  if (!source) {
    return ''
  }

  if (source.startsWith(DIRECTORY_IMAGE_TOKEN_PREFIX)) {
    try {
      return decodeURIComponent(source.slice(DIRECTORY_IMAGE_TOKEN_PREFIX.length))
    } catch (_error) {
      return ''
    }
  }

  const imgMatch = source.match(/<img\b[^>]*\ssrc=(['"])([\s\S]*?)\1/i)
  const imageSource = decodeHtmlEntities(String(imgMatch?.[2] || '')).trim()
  if (imageSource) {
    return resolveBackendAssetUrl(imageSource)
  }

  return resolveBackendAssetUrl(source)
}

const normalizeDirectorySourceLines = (value?: string) => {
  const source = String(value || '').replace(/\r/g, '').trim()

  if (!source) {
    return []
  }

  const normalizedSource = isLikelyHtml(source)
    ? decodeHtmlEntities(
        source
          .replace(/<script\b[\s\S]*?<\/script>/gi, '')
          .replace(/<style\b[\s\S]*?<\/style>/gi, '')
          .replace(/<img\b([^>]*)\/?>/gi, (_match, attrs) => {
            const sourceAttrs = String(attrs || '')
            const sourceMatch = sourceAttrs.match(/\ssrc=(['"])([\s\S]*?)\1/i)
            const sourceUrl = decodeHtmlEntities(String(sourceMatch?.[2] || '')).trim()
            const resolvedSourceUrl = sourceUrl ? resolveBackendAssetUrl(sourceUrl) : ''

            return resolvedSourceUrl ? `|${DIRECTORY_IMAGE_TOKEN_PREFIX}${encodeURIComponent(resolvedSourceUrl)}|` : ''
          })
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
          .replace(/<\/?h[1-6][^>]*>/gi, '\n')
          .replace(/<\/?div[^>]*>/gi, '\n')
          .replace(/<\/?section[^>]*>/gi, '\n')
          .replace(/<\/?article[^>]*>/gi, '\n')
          .replace(/<\/?blockquote[^>]*>/gi, '\n')
          .replace(/<\/?ul[^>]*>/gi, '\n')
          .replace(/<\/?ol[^>]*>/gi, '\n')
          .replace(/<li[^>]*>/gi, '\n')
          .replace(/<\/li>/gi, '\n')
          .replace(/<[^>]+>/g, ' '),
      )
    : source

  return normalizedSource
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const normalizeDirectoryHeading = (value: string) => {
  return String(value || '')
    .replace(/[【】\[\]\(\)（）\s]/g, '')
    .replace(/^[#-]+/, '')
    .replace(/[】\]]+$/, '')
    .trim()
}

const normalizeDirectoryParts = (value: string) => {
  return String(value || '')
    .split(/[|\t]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

const getDirectoryTone = (value: string, index: number) => {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (DIRECTORY_CATEGORY_TONES.includes(normalizedValue)) {
    return normalizedValue
  }

  return DIRECTORY_CATEGORY_TONES[index % DIRECTORY_CATEGORY_TONES.length]
}

const getDirectoryIcon = (value: string, title: string) => {
  const normalizedValue = String(value || '').trim()
  if (normalizedValue) {
    return normalizedValue
  }

  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) {
    return '•'
  }

  if (/^[A-Za-z0-9]{1,3}$/.test(normalizedTitle)) {
    return normalizedTitle.toUpperCase()
  }

  return normalizedTitle.slice(0, 1)
}

const parseDirectoryCategoryItem = (line: string, index: number): DirectoryCategoryItem | null => {
  const parts = normalizeDirectoryParts(line)

  if (!parts.length) {
    return null
  }

  const imageUrl = parts.map((part) => extractDirectoryImageUrl(part)).find((item) => Boolean(item)) || ''
  const tone = getDirectoryTone(parts.find((part) => isDirectoryToneToken(part)) || '', index)
  const textParts = parts.filter((part) => !extractDirectoryImageUrl(part) && !isDirectoryToneToken(part))
  const title = textParts[1] || textParts[0] || parts[1] || parts[0] || ''
  const iconSource = imageUrl ? (textParts[0] || title) : (parts[0] || title)

  return {
    id: index + 1,
    icon: getDirectoryIcon(iconSource, title),
    title,
    tone,
    imageUrl,
  }
}

const mapTutorialCategoryToDirectoryItem = (category: BackendContentPage, index: number): DirectoryCategoryItem => {
  const title = String(category.title || '').trim()
  const titleTag = String(category.titleTag || category.title_tag || '').trim()
  const imageUrl = String(category.titleTagImageUrl || category.title_tag_image || '').trim()

  return {
    id: Number(category.id || index + 1),
    icon: getDirectoryIcon(titleTag, title),
    title,
    tone: getDirectoryTone(String(category.tutorialTone || category.tutorial_tone || ''), index),
    imageUrl,
    pageId: Number(category.id || 0),
  }
}

const mapTutorialArticleToDirectoryItem = (article: BackendContentPage, index: number): DirectoryQuestionItem => {
  const contentSource = String(article.bodyText || article.contentHtml || article.content_html || '')
  const categoryTitle = String(article.tutorialCategoryTitle || article.tutorial_category_title || '').trim()

  return {
    id: Number(article.id || index + 1),
    tag: String(article.titleTag || article.title_tag || categoryTitle || '问题').trim() || '问题',
    tagImageUrl: resolveBackendAssetUrl(String(article.titleTagImageUrl || article.title_tag_image || '').trim()),
    question: String(article.title || '').trim(),
    likeCount: Number(article.likeCount || article.like_count || 0),
    favoriteCount: Number(article.favoriteCount || article.favorite_count || 0),
    pageId: Number(article.id || 0),
    tutorialCategoryId: Number(article.tutorialCategoryId || article.tutorial_category_id || 0),
    tutorialCategoryTitle: categoryTitle,
    showInHot: Number(article.showInHot || article.show_in_hot || 0) === 1,
    contentText: toPreviewText(contentSource),
  }
}

const buildTutorialCategoryItems = (
  categories: BackendContentPage[],
  referenceCategories: DirectoryCategoryItem[],
) => {
  const mappedCategories = categories.map(mapTutorialCategoryToDirectoryItem)

  if (!referenceCategories.length) {
    return mappedCategories
  }

  const mappedByTitle = new Map(mappedCategories.map((item) => [item.title, item]))
  const orderedItems = referenceCategories
    .map((referenceItem) => mappedByTitle.get(referenceItem.title))
    .filter((item): item is DirectoryCategoryItem => Boolean(item))
  const remainingItems = mappedCategories.filter((item) => !orderedItems.some((orderedItem) => orderedItem.id === item.id))

  return orderedItems.length ? [...orderedItems, ...remainingItems] : mappedCategories
}

const buildTutorialQuestionItems = (
  articles: BackendContentPage[],
  referenceQuestions: DirectoryQuestionItem[],
) => {
  const mappedQuestions = articles
    .map(mapTutorialArticleToDirectoryItem)
    .filter((item) => item.question)

  if (!referenceQuestions.length) {
    return mappedQuestions
  }

  const matchedIds = new Set<number>()
  const orderedItems = referenceQuestions
    .map((referenceItem) => {
      const matchedItem = mappedQuestions.find((item) => item.question === referenceItem.question)
      if (matchedItem) {
        matchedIds.add(matchedItem.id)
      }
      return matchedItem
    })
    .filter((item): item is DirectoryQuestionItem => Boolean(item))
  const remainingItems = mappedQuestions.filter((item) => !matchedIds.has(item.id))

  return orderedItems.length ? [...orderedItems, ...remainingItems] : mappedQuestions
}

const parseDirectoryContent = (value?: string) => {
  const lines = normalizeDirectorySourceLines(value)

  const categories: DirectoryCategoryItem[] = []
  const questions: DirectoryQuestionItem[] = []
  let currentSection = ''

  lines.forEach((line) => {
    const heading = normalizeDirectoryHeading(line)
    if (heading === '问题分类') {
      currentSection = 'categories'
      return
    }

    if (heading === '热门问题') {
      currentSection = 'questions'
      return
    }

    const parts = normalizeDirectoryParts(line)

    if (currentSection === 'categories' && parts.length) {
      const categoryItem = parseDirectoryCategoryItem(line, categories.length)
      if (categoryItem) {
        categories.push(categoryItem)
      }
      return
    }

    if (currentSection === 'questions' && parts.length) {
      const tag = parts[0] || '问题'
      const question = parts[1] || parts[0]
      questions.push({
        id: questions.length + 1,
        tag,
        question,
      })
    }
  })

  return {
    categories,
    questions,
  }
}

const filterDirectoryCategories = (items: DirectoryCategoryItem[], keyword: string) => {
  const normalizedKeyword = normalizeDirectorySearchKeyword(keyword)

  if (!normalizedKeyword) {
    return items
  }

  return items.filter((item) => titleMatchesKeyword(item.title, normalizedKeyword))
}

const filterDirectoryQuestions = (items: DirectoryQuestionItem[], keyword: string) => {
  const normalizedKeyword = normalizeDirectorySearchKeyword(keyword)

  if (!normalizedKeyword) {
    return items
  }

  return items.filter((item) => titleMatchesKeyword(item.question, normalizedKeyword))
}

const buildDirectorySearchState = (
  keyword: string,
  categories: DirectoryCategoryItem[],
  hotQuestions: DirectoryQuestionItem[],
  articles: DirectoryQuestionItem[],
) => {
  const normalizedKeyword = normalizeDirectorySearchKeyword(keyword)
  const nextCategories = filterDirectoryCategories(categories, keyword)
  const questionSource = normalizedKeyword
    ? [...articles, ...hotQuestions.filter((item) => !articles.some((article) => article.id === item.id))]
    : hotQuestions
  const nextQuestions = filterDirectoryQuestions(questionSource, keyword)

  return {
    directorySearchKeyword: keyword,
    directoryCategories: nextCategories,
    directoryQuestions: nextQuestions,
    directoryHasResults: Boolean(nextCategories.length || nextQuestions.length),
  }
}

const buildFaqItems = (): FaqItem[] => ([
  {
    id: 1,
    question: '商品支持哪些购买方式？',
    answer: '目前支持小程序下单购买，提交后可在订单页完成付款流程。',
    expanded: false,
  },
  {
    id: 2,
    question: '回收报价是最终成交价吗？',
    answer: '不是。页面报价为预估价格，最终成交价以客服验机结果为准。',
    expanded: false,
  },
  {
    id: 3,
    question: '寄快递回收要准备什么？',
    answer: '建议备份数据、恢复出厂设置，并拍清外观、屏幕、配件和问题细节。',
    expanded: false,
  },
  {
    id: 4,
    question: '订单创建后在哪里查看进度？',
    answer: '可以在“我的”页面进入对应订单列表查看，状态会持续更新。',
    expanded: false,
  },
  {
    id: 5,
    question: '遇到售后或体验问题怎么办？',
    answer: '可以先整理订单信息和问题图片，再通过联系客服处理。',
    expanded: false,
  },
])

Page<FeaturePlaceholderData, FeaturePlaceholderPage>({
  data: {
    statusBarHeight: 20,
    isLoading: false,
    pageTitle: DEFAULT_TITLE,
    imageUrl: '',
    imageUrls: [],
    helperText: DEFAULT_HELPER_TEXT,
    bodyText: '',
    contentHtml: '',
    contentPageId: 0,
    tutorialPages: [],
    tutorialPageIndex: 0,
    tutorialPageCount: 0,
    isTutorialArticlePage: false,
    tutorialViewCount: 0,
    tutorialLikeCount: 0,
    tutorialFavoriteCount: 0,
    tutorialShareCount: 0,
    tutorialLiked: false,
    tutorialFavorited: false,
    tutorialInteractionLoading: false,
    endLinkProductId: 0,
    endLinkCategoryKey: '',
    endLinkText: '立即下单',
    isDirectoryPage: false,
    isTutorialCategoryPage: false,
    tutorialCategoryId: 0,
    isTutorialPage: false,
    isFaqPage: false,
    isNoticePage: false,
    faqItems: [],
    directorySearchKeyword: '',
    directoryCategories: [],
    directoryQuestions: [],
    directoryHasResults: true,
    directoryLoading: true,
  },

  directoryCategorySource: [],
  directoryHotQuestionSource: [],
  directoryArticleSource: [],
  directoryStatsRefreshReady: false,

  applyDirectorySearch(keyword: string) {
    const categorySource = this.directoryCategorySource || []
    const hotQuestionSource = this.directoryHotQuestionSource || []
    const articleSource = this.directoryArticleSource || hotQuestionSource

    this.setData(buildDirectorySearchState(keyword, categorySource, hotQuestionSource, articleSource))
  },

  onLoad(options: FeaturePlaceholderOptions) {
    const pageTitle = safeDecodeText(options.title) || DEFAULT_TITLE
    const imageUrl = safeDecodeText(options.imageUrl)
    const isFaqPage = pageTitle === '常见问题'
    const pageId = Number(options.pageId || 0)
    const tutorialCategoryId = Number(options.tutorialCategoryId || 0)
    const isTutorialCategoryPage = tutorialCategoryId > 0
    const noticeId = Number(options.noticeId || 0)
    const isNoticePage = noticeId > 0
    const helperText = safeDecodeText(options.helperText) || (isNoticePage ? '' : DEFAULT_HELPER_TEXT)
    const isDirectoryPage = pageId === DIRECTORY_PAGE_ID
    const isTutorialPage = pageTitle === '教程' || isDirectoryPage
    const initialPreviewText = toPreviewText(helperText) || helperText
    const initialContentHtml = (pageId && !isFaqPage) || isNoticePage ? '' : buildRichTextHtml(helperText)

    this.directoryCategorySource = []
    this.directoryHotQuestionSource = []
    this.directoryArticleSource = []
    this.directoryStatsRefreshReady = false

    this.setData({
      statusBarHeight: getStatusBarHeight(),
      isLoading: Boolean(pageId || tutorialCategoryId || noticeId),
      pageTitle,
      imageUrl,
      imageUrls: [],
      helperText: initialPreviewText,
      bodyText: helperText,
      contentHtml: initialContentHtml,
      contentPageId: pageId,
      tutorialPages: [],
      tutorialPageIndex: 0,
      tutorialPageCount: 0,
      isTutorialArticlePage: false,
      tutorialViewCount: 0,
      tutorialLikeCount: 0,
      tutorialFavoriteCount: 0,
      tutorialShareCount: 0,
      tutorialLiked: false,
      tutorialFavorited: false,
      tutorialInteractionLoading: false,
      endLinkProductId: 0,
      endLinkCategoryKey: '',
      endLinkText: '立即下单',
      isDirectoryPage,
      isTutorialCategoryPage,
      tutorialCategoryId,
      isTutorialPage: isTutorialPage || isTutorialCategoryPage,
      isFaqPage,
      isNoticePage,
      faqItems: isFaqPage ? buildFaqItems() : [],
      directoryLoading: isDirectoryPage,
      ...(isDirectoryPage ? buildDirectorySearchState('', [], [], []) : {}),
    })

    if (pageId > 1) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }

    if (isNoticePage) {
      fetchPublicNoticeDetail(noticeId)
        .then((notice) => {
          if (!notice) {
            this.setData({ isLoading: false })
            return
          }

          const content = String(notice.content || '')
          const images = Array.isArray(notice.images) ? notice.images.filter(Boolean) : []
          this.setData({
            pageTitle: String(notice.title || pageTitle),
            imageUrl: images[0] || '',
            imageUrls: images,
            helperText: toPreviewText(content),
            bodyText: content,
            contentHtml: buildRichTextHtml(content),
            isLoading: false,
          })
        })
        .catch(() => this.setData({ isLoading: false }))
      return
    }

    if (!pageId || isFaqPage) {
      this.setData({ isLoading: false })
      return
    }

    const pagePromise = fetchContentPageDetail(pageId)
    // Keep the category endpoint as a fallback for backends that omit embedded directory data.
    const categoryPromise = isDirectoryPage
      ? fetchTutorialCategories()
      : Promise.resolve([] as BackendContentPage[])
    const articlePromise = isTutorialCategoryPage
      ? fetchTutorialArticles()
      : Promise.resolve([] as BackendContentPage[])

    Promise.all([
      pagePromise.catch(() => null),
      categoryPromise.catch(() => [] as BackendContentPage[]),
      articlePromise.catch(() => [] as BackendContentPage[]),
    ])
      .then((results) => {
        const page = results[0]
        const tutorialCategories = results[1]
        const tutorialArticles = results[2]
        if (!page) {
          if (isDirectoryPage) {
            this.directoryCategorySource = []
            this.setData({
              ...buildDirectorySearchState('', [], [], []),
              directoryLoading: false,
            })
          }
          this.setData({ isLoading: false })
          return
        }

        const nextContentSource = String(page.contentHtml || page.content_html || page.bodyText || '')
        const rawTutorialPages = Array.isArray(page.tutorialPages)
          ? page.tutorialPages
          : (Array.isArray(page.tutorial_pages) ? page.tutorial_pages : [])
        const tutorialPages = rawTutorialPages.length
          ? rawTutorialPages.map((item) => mapTutorialPageView(item))
          : [mapTutorialPageView({ contentHtml: nextContentSource, coverImages: page.coverImages || page.cover_images || [] })]
        const tutorialPage = tutorialPages[0]
        const isTutorialArticlePage = !isDirectoryPage && !isTutorialCategoryPage && Number(page.id || pageId) > 1
        const tutorialContentSource = tutorialPage?.contentHtml || ''
        const hasPageContent = Boolean(nextContentSource.trim())
        const nextPreviewText = hasPageContent ? toPreviewText(nextContentSource) : EMPTY_CONTENT_TEXT
        const nextDirectoryContent = isDirectoryPage ? parseDirectoryContent(nextContentSource || helperText) : null
        const pageTutorialCategories = Array.isArray(page.tutorialCategories)
          ? page.tutorialCategories
          : Array.isArray(page.tutorial_categories)
            ? page.tutorial_categories
            : []
        const pageTutorialArticles = Array.isArray(page.tutorialArticles)
          ? page.tutorialArticles
          : Array.isArray(page.tutorial_articles)
            ? page.tutorial_articles
            : []
        const resolvedTutorialCategories = pageTutorialCategories.length ? pageTutorialCategories : tutorialCategories
        const resolvedTutorialArticles = (pageTutorialArticles.length ? pageTutorialArticles : tutorialArticles)
          .filter((item) => !isTutorialCategoryPage
            || Number(item.tutorialCategoryId || item.tutorial_category_id || 0) === tutorialCategoryId)
        const tutorialCategoryItems = isDirectoryPage && resolvedTutorialCategories.length
          ? buildTutorialCategoryItems(resolvedTutorialCategories, nextDirectoryContent?.categories || [])
          : null
        const tutorialQuestionItems = (isDirectoryPage || isTutorialCategoryPage) && resolvedTutorialArticles.length
          ? buildTutorialQuestionItems(resolvedTutorialArticles, nextDirectoryContent?.questions || [])
          : []
        const hotQuestionItems = tutorialQuestionItems.filter((item) => item.showInHot)

        this.setData({
          pageTitle: page.title || pageTitle,
          imageUrl: tutorialPage?.coverImages[0] || page.coverImageUrl || imageUrl,
          imageUrls: tutorialPage?.coverImages || [],
          helperText: isTutorialArticlePage ? toPreviewText(tutorialContentSource) || EMPTY_CONTENT_TEXT : nextPreviewText,
          bodyText: isTutorialArticlePage ? toPreviewText(tutorialContentSource) : (hasPageContent ? nextContentSource : ''),
          contentHtml: isDirectoryPage || !isTutorialArticlePage || !tutorialContentSource ? '' : tutorialContentSource,
          contentPageId: Number(page.id || pageId),
          tutorialPages,
          tutorialPageIndex: 0,
          tutorialPageCount: tutorialPages.length,
          isTutorialArticlePage,
          tutorialViewCount: Number(page.viewCount || page.view_count || 0),
          tutorialLikeCount: Number(page.likeCount || page.like_count || 0),
          tutorialFavoriteCount: Number(page.favoriteCount || page.favorite_count || 0),
          tutorialShareCount: Number(page.shareCount || page.share_count || 0),
          tutorialLiked: Boolean(page.liked),
          tutorialFavorited: Boolean(page.favorited),
          endLinkProductId: isDirectoryPage ? 0 : Number(page.endLinkProductId || page.end_link_product_id || 0),
          endLinkCategoryKey: isDirectoryPage ? '' : String(page.endLinkCategoryKey || page.end_link_category_key || '').trim(),
          endLinkText: String(page.endLinkText || page.end_link_text || '立即下单').trim() || '立即下单',
          isDirectoryPage,
          isTutorialCategoryPage,
          isTutorialPage: String(page.title || pageTitle) === '教程' || isDirectoryPage,
          isFaqPage: false,
          faqItems: [],
          isLoading: false,
        })

        if (isDirectoryPage) {
          this.directoryCategorySource = tutorialCategoryItems && tutorialCategoryItems.length
            ? tutorialCategoryItems
            : (nextDirectoryContent?.categories || [])
          this.directoryArticleSource = tutorialQuestionItems
          this.directoryHotQuestionSource = hotQuestionItems.length
            ? hotQuestionItems
            : this.directoryArticleSource
          this.applyDirectorySearch(this.data.directorySearchKeyword || '')
          this.directoryStatsRefreshReady = true
          this.setData({ directoryLoading: false })
        }
        if (isTutorialCategoryPage) {
          this.directoryArticleSource = tutorialQuestionItems
          this.setData({
            directoryQuestions: tutorialQuestionItems,
            directoryHasResults: tutorialQuestionItems.length > 0,
          })
          this.directoryStatsRefreshReady = true
        }
      })
      .catch(() => {
        if (isDirectoryPage) {
          this.directoryCategorySource = []
          this.setData({
            ...buildDirectorySearchState('', [], [], []),
            directoryLoading: false,
          })
        }
        this.setData({ isLoading: false })
      })
  },

  onShow() {
    if (this.directoryStatsRefreshReady) {
      this.refreshDirectoryQuestionStats()
    }
  },

  async refreshDirectoryQuestionStats() {
    const isDirectoryPage = this.data.isDirectoryPage
    const isTutorialCategoryPage = this.data.isTutorialCategoryPage
    if (!isDirectoryPage && !isTutorialCategoryPage) {
      return
    }

    clearPublicBackendCache('tutorial-directory')

    try {
      const page = await fetchContentPageDetail(Number(this.data.contentPageId || DIRECTORY_PAGE_ID))
      const articles = isTutorialCategoryPage
        ? await fetchTutorialArticles()
        : (Array.isArray(page?.tutorialArticles)
          ? page.tutorialArticles
          : (Array.isArray(page?.tutorial_articles) ? page.tutorial_articles : []))
      const categoryArticles = isTutorialCategoryPage
        ? articles.filter((item) => Number(item.tutorialCategoryId || item.tutorial_category_id || 0) === Number(this.data.tutorialCategoryId || 0))
        : articles
      const questions = buildTutorialQuestionItems(categoryArticles, this.directoryArticleSource || [])

      this.directoryArticleSource = questions
      if (isDirectoryPage) {
        const hotQuestions = questions.filter((item) => item.showInHot)
        this.directoryHotQuestionSource = hotQuestions.length ? hotQuestions : questions
        this.applyDirectorySearch(this.data.directorySearchKeyword || '')
        return
      }

      this.setData({
        directoryQuestions: questions,
        directoryHasResults: questions.length > 0,
      })
    } catch (_error) {}
  },

  onBackTap() {
    if (shouldIgnoreRapidBackTap(this)) {
      return
    }

    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/mine/mine',
        })
      },
    })
  },

  onFaqItemTap(event) {
    const id = Number(event.currentTarget.dataset.id)

    if (!id) {
      return
    }

    this.setData({
      faqItems: this.data.faqItems.map((item) => ({
        ...item,
        expanded: item.id === id ? !item.expanded : item.expanded,
      })),
    })
  },

  onDirectoryCategoryTap(event) {
    const categoryId = Number(event.currentTarget.dataset.categoryId || 0)
    const title = String(event.currentTarget.dataset.title || '').trim()
    if (!categoryId) {
      return
    }

    wx.navigateTo({
      url: `/pages/feature-placeholder/feature-placeholder?pageId=${categoryId}&title=${encodeURIComponent(title)}&tutorialCategoryId=${categoryId}`,
    })
  },

  onDirectoryQuestionTap(event) {
    const pageId = Number(event.currentTarget.dataset.pageId || 0)

    if (pageId > 0) {
      wx.navigateTo({
        url: `/pages/feature-placeholder/feature-placeholder?pageId=${pageId}`,
      })
      return
    }

    const question = String(event.currentTarget.dataset.question || '').trim()
    if (question) {
      this.applyDirectorySearch(question)
    }
  },

  onEndLinkTap() {
    const categoryKey = String(this.data.endLinkCategoryKey || '').trim()
    if (categoryKey) {
      wx.setStorageSync(PENDING_SORT_CATEGORY_KEY, categoryKey)
      wx.reLaunch({
        url: '/pages/sorts/sorts',
        fail: () => wx.removeStorageSync(PENDING_SORT_CATEGORY_KEY),
      })
      return
    }
    const productId = Number(this.data.endLinkProductId || 0)
    if (!productId) {
      return
    }

    wx.navigateTo({
      url: `/pages/buying-confirmation/buying-confirmation?id=${productId}`,
    })
  },

  onTutorialEndLinkTap() {
    this.onEndLinkTap()
  },

  onPreviousTutorialPage() {
    if (!this.data.isTutorialArticlePage || this.data.tutorialPageIndex <= 0) return
    this.applyTutorialPage(this.data.tutorialPageIndex - 1)
  },

  onNextTutorialPage() {
    if (!this.data.isTutorialArticlePage) return
    const nextIndex = this.data.tutorialPageIndex + 1
    if (nextIndex < this.data.tutorialPageCount) {
      this.applyTutorialPage(nextIndex)
      return
    }
    this.onEndLinkTap()
  },

  applyTutorialPage(index: number) {
    const pages = this.data.tutorialPages || []
    const page = pages[index]
    if (!page) return
    this.setData({
      tutorialPageIndex: index,
      imageUrl: page.coverImages[0] || '',
      imageUrls: page.coverImages,
      bodyText: toPreviewText(page.contentHtml),
      helperText: toPreviewText(page.contentHtml) || EMPTY_CONTENT_TEXT,
      contentHtml: page.contentHtml,
    })
    wx.createSelectorQuery().select('.content').node().exec((result) => {
      const scrollView = result?.[0]?.node
      if (scrollView && typeof scrollView.scrollTo === 'function') scrollView.scrollTo({ top: 0, duration: 0 })
    })
  },

  onDirectorySearchInput(event) {
    this.applyDirectorySearch(event.detail.value || '')
  },

  onDirectorySearchConfirm(event) {
    this.applyDirectorySearch(event.detail.value || this.data.directorySearchKeyword || '')
  },

  onDirectorySearchClear() {
    this.applyDirectorySearch('')
  },

  async toggleTutorialAction(action: 'like' | 'favorite') {
    const pageId = Number(this.data.contentPageId || 0)
    if (pageId <= 1 || this.data.tutorialInteractionLoading) {
      return
    }

    this.setData({ tutorialInteractionLoading: true })
    try {
      await ensureBackendSession()
      const stats = await toggleTutorialInteraction(pageId, action)
      if (stats) {
        const nextInteractionState = action === 'like'
          ? {
              tutorialLiked: typeof stats.liked === 'boolean'
                ? stats.liked
                : !this.data.tutorialLiked,
            }
          : {
              tutorialFavorited: typeof stats.favorited === 'boolean'
                ? stats.favorited
                : !this.data.tutorialFavorited,
            }

        this.setData({
          tutorialViewCount: Number(stats.viewCount || 0),
          tutorialLikeCount: Number(stats.likeCount || 0),
          tutorialFavoriteCount: Number(stats.favoriteCount || 0),
          ...nextInteractionState,
        })
      }
    } catch (_error) {
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ tutorialInteractionLoading: false })
    }
  },

  onTutorialLikeTap() {
    this.toggleTutorialAction('like')
  },

  onTutorialFavoriteTap() {
    this.toggleTutorialAction('favorite')
  },

  onShareAppMessage() {
    const pageId = Number(this.data.contentPageId || 0)
    const title = String(this.data.pageTitle || '教程')
    if (pageId > 1) {
      void recordTutorialShare(pageId)
        .then((stats) => {
          if (stats) {
            this.setData({ tutorialShareCount: Number(stats.shareCount || 0) })
          }
        })
        .catch(() => {})
    }
    return {
      title,
      path: `/pages/feature-placeholder/feature-placeholder?pageId=${pageId}`,
    }
  },
})
