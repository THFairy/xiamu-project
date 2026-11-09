const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

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

exports.main = async () => {
  const [products, images] = await Promise.all([
    getAllDocuments('product_catalog'),
    getAllDocuments('product_image'),
  ])

  return {
    success: true,
    products,
    images,
    productCount: products.length,
    imageCount: images.length,
    updatedAt: Date.now(),
  }
}
