// 用途：将线上数据库压缩备份恢复到本机 beta 数据库，并输出逐表校验清单。
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
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
  const backupPath = path.resolve(process.argv[2] || '')
  const rootPassword = String(process.env.LOCAL_MYSQL_ROOT_PASSWORD || '')
  const env = parseEnv(path.resolve(__dirname, '../.env'))
  const targetDatabase = String(env.MYSQL_DATABASE || '').trim()

  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error('数据库备份文件不存在')
  }
  if (!rootPassword) {
    throw new Error('缺少 LOCAL_MYSQL_ROOT_PASSWORD')
  }
  if (targetDatabase !== 'miniprogram_db_beta') {
    throw new Error(`目标数据库必须是 miniprogram_db_beta，当前为 ${targetDatabase}`)
  }

  const rootConnection = await mysql.createConnection({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: 'root',
    password: rootPassword,
    multipleStatements: true,
  })

  try {
    await rootConnection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetDatabase)}`)
    await rootConnection.query(
      `CREATE DATABASE ${quoteIdentifier(targetDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    )
    await rootConnection.query(
      `GRANT ALL PRIVILEGES ON ${quoteIdentifier(targetDatabase)}.* TO 'miniapp'@'127.0.0.1'`,
    )

    const compressedBackup = fs.readFileSync(backupPath)
    const dumpSql = zlib.gunzipSync(compressedBackup).toString('utf8')
    await rootConnection.changeUser({ database: targetDatabase })
    await rootConnection.query(dumpSql)

    const [tables] = await rootConnection.query(
      `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [targetDatabase],
    )
    const rowCounts = []
    for (const table of tables) {
      const [rows] = await rootConnection.query(
        `SELECT COUNT(*) AS rowCount FROM ${quoteIdentifier(table.tableName)}`,
      )
      rowCounts.push({ tableName: table.tableName, rowCount: Number(rows[0].rowCount) })
    }

    const [[objectCounts]] = await rootConnection.query(
      `SELECT
         SUM(TABLE_TYPE = 'BASE TABLE') AS tableCount,
         SUM(TABLE_TYPE = 'VIEW') AS viewCount
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?`,
      [targetDatabase],
    )
    const [[triggerCounts]] = await rootConnection.query(
      'SELECT COUNT(*) AS triggerCount FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?',
      [targetDatabase],
    )
    const [[routineCounts]] = await rootConnection.query(
      'SELECT COUNT(*) AS routineCount FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?',
      [targetDatabase],
    )
    const [[eventCounts]] = await rootConnection.query(
      'SELECT COUNT(*) AS eventCount FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?',
      [targetDatabase],
    )

    process.stdout.write(`${JSON.stringify({
      database: targetDatabase,
      tableCount: Number(objectCounts.tableCount || 0),
      viewCount: Number(objectCounts.viewCount || 0),
      triggerCount: Number(triggerCounts.triggerCount || 0),
      routineCount: Number(routineCounts.routineCount || 0),
      eventCount: Number(eventCounts.eventCount || 0),
      rowCounts,
    }, null, 2)}\n`)
  } finally {
    await rootConnection.end()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exit(1)
})
