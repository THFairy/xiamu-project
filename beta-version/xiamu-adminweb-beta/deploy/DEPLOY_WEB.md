# 管理后台网页部署

推荐的长期生产访问地址：

- `https://xiamuclub.com/console/`

推荐的生产部署结构：

- Nginx 在 `/console/` 下托管独立的控制台构建产物
- 同一个 Nginx 站点把 `/api/` 转发到小程序后端
- 生产环境前端使用同源的 `/api/admin/...` 请求

## 1. 构建前端

```powershell
npm install
npm run build:console
```

控制台生产构建会读取：

- `.env.production-console`
  - `VITE_API_BASE_URL=/api` 表示通过当前域名的 `/api` 前缀访问接口
  - `VITE_PUBLIC_BASE_PATH=/console/` 表示部署到 `/console/` 路径

## 2. 上传前端文件

把生成的 `dist/` 目录内容上传到：

```text
/usr/share/nginx/xiamuclub-backend-platform/console
```

## 3. 配置 Nginx

如果 `xiamuclub.com` 已经存在，合并下面配置中的 `/console/` 相关部分：

- `deploy/xiamuclub.com.console.conf`

示例假设：

- 前端文件位于 `/usr/share/nginx/xiamuclub-backend-platform/console`
- 网页端与小程序共用的静态文件位于 `/root/xiamu-server/static/`
- Node 后端监听 `127.0.0.1:8080`，并处理 `/api/`，包括 `/api/admin/...`

## 4. 启动后端

创建：

- `../xiamu-server/.env`

然后启动：

```powershell
npm --prefix ../xiamu-server start
```

生产环境建议使用 `pm2` 或 `systemd` 常驻运行。

## 5. 验证

打开：

- `https://xiamuclub.com/console/`

检查：

- `https://xiamuclub.com/api/health`
- `https://xiamuclub.com/api/admin/getinfo`
- 登录
- 商品列表
- 商品编辑并保存
- 图片上传

## 可选：部署到域名根目录或独立子域名

如果你希望部署到 `/` 或 `https://admin.xiamuclub.com`，请在构建前设置对应的 `VITE_PUBLIC_BASE_PATH`，并参考独立子域名示例：

```env
VITE_PUBLIC_BASE_PATH=/
```

参考配置：

- `deploy/admin.xiamuclub.com.conf`
