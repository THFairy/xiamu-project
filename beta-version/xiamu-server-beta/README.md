# xiamu-server

本目录是夏木项目唯一后端，同时服务网页管理端和微信小程序。它包含管理员、商品、订单、回收、支付、物流、用户和数据分析接口。

首次运行前执行 `npm install`，并根据 `.env.example` 准备 `.env`。

```powershell
npm start
```

语法检查：

```powershell
npm run check
```

`cloud-data/uploads` 是运行时上传目录，更新部署时不要清空或覆盖服务器已有内容。
