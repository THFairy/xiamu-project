# xiamu-adminweb

## 前端

- `npm run dev`
- `npm run build`
- `npm run build:console`
- `npm run preview`

前端 API 基础地址来自 `.env.development` / `.env.production`。
长期运行的公开控制台请使用 `npm run build:console`，并部署到：

- `https://xiamuclub.com/console/`

网页端生产部署说明见 [deploy/DEPLOY_WEB.md](./deploy/DEPLOY_WEB.md)。

## 网页管理端后端

管理后台与微信小程序共用后端，服务位于 `../xiamu-server/`。

1. 将 `../xiamu-server/.env.example` 复制为 `../xiamu-server/.env`。
2. 填写 MySQL 和管理员凭据。
3. 当你希望商品改动同步到本地微信小程序仓库时，把 `MINIPROGRAM_REPO_PATH` 设置为本地小程序仓库路径，数据会同步到：
   - `cloud-data/local-product-catalog.json`
   - `miniprogram/data/local-product-catalog.ts`
4. 使用 `npm run backend` 启动服务端。

如果 `MINIPROGRAM_REPO_PATH` 为空，服务端只会写入后端目录内的 `cloud-data` 快照文件。
