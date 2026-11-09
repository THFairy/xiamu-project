// 用途：仅将 beta 数据库中的线上资源域名替换为本地 beta 服务地址。
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const parseEnv = (filePath) => Object.fromEntries(
  fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const separatorIndex = line.indexOf('=')
      return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
    }),
)

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``

const main = async () => {
  const env = parseEnv(path.resolve(__dirname, '../.env'))
  const database = String(env.MYSQL_DATABASE || '').trim()
  const localBaseUrl = String(env.PUBLIC_ASSET_BASE_URL || '').trim().replace(/\/+$/, '')
  if (database !== 'miniprogram_db_beta') {
    throw new Error(`只允许修改 miniprogram_db_beta，当前为 ${database}`)
  }
  if (localBaseUrl !== 'http://127.0.0.1:8081') {
    throw new Error(`本地资源地址不符合预期：${localBaseUrl}`)
  }

  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database,
  })

  try {
    const [columns] = await connection.query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'json')
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database],
    )

    const changes = []
    for (const column of columns) {
      const tableName = quoteIdentifier(column.tableName)
      const columnName = quoteIdentifier(column.columnName)
      const [matches] = await connection.query(
        `SELECT COUNT(*) AS matchCount FROM ${tableName}
         WHERE CAST(${columnName} AS CHAR) LIKE '%xiamuclub.com%'`,
      )
      const matchCount = Number(matches[0].matchCount || 0)
      if (!matchCount) {
        continue
      }

      const replacementExpression = `REPLACE(REPLACE(CAST(${columnName} AS CHAR), 'https://xiamuclub.com', ?), 'http://xiamuclub.com', ?)`
      const updateExpression = column.dataType === 'json'
        ? `CAST(${replacementExpression} AS JSON)`
        : replacementExpression
      const [result] = await connection.query(
        `UPDATE ${tableName} SET ${columnName} = ${updateExpression}
         WHERE CAST(${columnName} AS CHAR) LIKE '%xiamuclub.com%'`,
        [localBaseUrl, localBaseUrl],
      )
      changes.push({
        tableName: column.tableName,
        columnName: column.columnName,
        matchedRows: matchCount,
        changedRows: Number(result.changedRows || 0),
      })
    }

    const remaining = []
    for (const column of columns) {
      const tableName = quoteIdentifier(column.tableName)
      const columnName = quoteIdentifier(column.columnName)
      const [matches] = await connection.query(
        `SELECT COUNT(*) AS matchCount FROM ${tableName}
         WHERE CAST(${columnName} AS CHAR) LIKE '%xiamuclub.com%'`,
      )
      const matchCount = Number(matches[0].matchCount || 0)
      if (matchCount) {
        remaining.push({ tableName: column.tableName, columnName: column.columnName, matchCount })
      }
    }

    process.stdout.write(`${JSON.stringify({ database, localBaseUrl, changes, remaining }, null, 2)}\n`)
    if (remaining.length) {
      process.exitCode = 2
    }
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exit(1)
})
