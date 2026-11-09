# 夏目项目版本目录

`xiamu-project` 为正式版和测试版的父目录。

| 分支 | 记录目录 | 内容 |
| --- | --- | --- |
| main | official-version | xiamu-adminweb、xiamu-miniapp、xiamu-server |
| beta | beta-version | xiamu-adminweb-beta、xiamu-miniapp-beta、xiamu-server-beta |

每套版本包含网页管理端、微信小程序和二者共用的后端。两套版本分别提交和推送。
本机可同时保留两套目录；当前分支忽略另一套目录。切换分支前请保存当前版本的未提交改动。

订单管理的商品信息显示下单时的机器编码，点击商品图片可放大预览。
可关联库存记录，查看库存编号和实物照片；更换或解除关联需要订单状态编辑权限。
后端沿用现有的库存订单关联表，启动时自动确认表结构。

依赖、构建产物、后端私密环境变量、数据库备份和历史 Git 备份不纳入版本管理。
