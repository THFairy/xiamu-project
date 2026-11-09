const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

const PRODUCT_COLLECTION = 'product_catalog'
const IMAGE_COLLECTION = 'product_image'

const getAllDocuments = async (collectionName) => {
  const collection = db.collection(collectionName)
  const countResult = await collection.count()
  const total = countResult && typeof countResult.total === 'number' ? countResult.total : 0

  if (!total) {
    return []
  }

  const batchSize = 100
  const tasks = []

  for (let offset = 0; offset < total; offset += batchSize) {
    tasks.push(collection.skip(offset).limit(batchSize).get())
  }

  const resultList = await Promise.all(tasks)

  return resultList.reduce((all, current) => {
    const currentData = current && Array.isArray(current.data) ? current.data : []
    return all.concat(currentData)
  }, [])
}

const normalizeProduct = (item) => {
  const id = Number(item && item.id ? item.id : 0)
  const docId = String((item && item._id) || (item && item.product_no) || `P${String(id).padStart(4, '0')}`)

  return {
    _id: docId,
    data: {
      id,
      product_no: docId,
      category_key: item && item.category_key ? String(item.category_key) : 'others',
      model_key: item && item.model_key ? String(item.model_key) : 'other',
      platform: item && item.platform ? String(item.platform) : '',
      cover_text: item && item.cover_text ? String(item.cover_text) : '',
      cover_title: item && item.cover_title ? String(item.cover_title) : '',
      title: item && item.title ? String(item.title) : '',
      subtitle: item && item.subtitle ? String(item.subtitle) : '',
      price: Number(item && item.price ? item.price : 0),
      tag_text: item && item.tag_text ? String(item.tag_text) : '',
      hero_image: item && item.hero_image ? String(item.hero_image) : '',
      in_stock: Boolean(item && item.in_stock),
      recyclable: Boolean(item && item.recyclable),
      premium_condition: Boolean(item && item.premium_condition),
      certified_price: Boolean(item && item.certified_price),
      release_order: Number(item && item.release_order ? item.release_order : 0),
      hero_theme: item && item.hero_theme ? String(item.hero_theme) : 'others',
      hero_accent: item && item.hero_accent ? String(item.hero_accent) : '',
      edition_label: item && item.edition_label ? String(item.edition_label) : '',
      feature_tags: Array.isArray(item && item.feature_tags) ? item.feature_tags.map((tag) => String(tag)) : [],
      shopping_textA: item && item.shopping_textA !== undefined ? String(item.shopping_textA) : '',
      shopping_textB: item && item.shopping_textB !== undefined ? String(item.shopping_textB) : '',
      shopping_textC: item && item.shopping_textC !== undefined ? String(item.shopping_textC) : '',
      description: item && item.description !== undefined ? String(item.description) : '',
      status: Number(item && item.status !== undefined ? item.status : 1),
      is_deleted: Number(item && item.is_deleted !== undefined ? item.is_deleted : 0),
      updated_at: Date.now(),
    },
  }
}

const normalizeImage = (item) => {
  const productNo = String(item && item.product_no ? item.product_no : '')
  const imageType = String(item && item.image_type ? item.image_type : 'detail')
  const sortOrder = Number(item && item.sort_order ? item.sort_order : 1)
  const fallbackId = `${productNo || 'PRODUCT'}_${imageType}_${sortOrder}`
  const docId = String((item && item._id) || fallbackId)

  return {
    _id: docId,
    data: {
      product_id: Number(item && item.product_id ? item.product_id : 0),
      product_no: productNo,
      image_type: imageType,
      image_url: item && item.image_url ? String(item.image_url) : '',
      sort_order: sortOrder,
      is_main: Boolean(item && item.is_main),
      status: Number(item && item.status !== undefined ? item.status : 1),
      is_deleted: Number(item && item.is_deleted !== undefined ? item.is_deleted : 0),
      updated_at: Date.now(),
    },
  }
}

const syncCollection = async (collectionName, normalizedDocs) => {
  const collection = db.collection(collectionName)
  const nextIds = new Set(normalizedDocs.map((item) => item._id))
  const existingDocs = await getAllDocuments(collectionName)
  const existingIds = existingDocs.map((item) => item._id).filter(Boolean)

  await Promise.all(
    normalizedDocs.map((item) =>
      collection.doc(item._id).set({
        data: item.data,
      }),
    ),
  )

  const staleIds = existingIds.filter((id) => !nextIds.has(id))

  await Promise.all(staleIds.map((id) => collection.doc(id).remove()))
}

exports.main = async (event) => {
  const rawProducts = Array.isArray(event && event.products) ? event.products : null
  const rawImages = Array.isArray(event && event.images) ? event.images : null

  if (!rawProducts || !rawImages) {
    return {
      success: false,
      message: 'products and images must be arrays',
    }
  }

  const normalizedProducts = rawProducts.map(normalizeProduct)
  const normalizedImages = rawImages.map(normalizeImage)

  await syncCollection(PRODUCT_COLLECTION, normalizedProducts)
  await syncCollection(IMAGE_COLLECTION, normalizedImages)

  return {
    success: true,
    productCount: normalizedProducts.length,
    imageCount: normalizedImages.length,
    updatedAt: Date.now(),
  }
}
