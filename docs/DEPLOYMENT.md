# 生产部署

生产环境使用 `compose.production.yml`，默认对外端口如下：

- 用户端：`7991`
- 管理端：`7992`
- FastAPI：`7993`

复制 `deploy/production.env.example` 为服务器上的 `.env.production`，填写随机数据库密码、应用密钥及第三方 API 密钥，并将文件权限设为 `600`。不要提交该文件。

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --build
docker compose --env-file .env.production -f compose.production.yml ps
```

API 容器启动时会先运行 `alembic upgrade head`，成功后才启动 FastAPI。

部署后检查：

```bash
curl --fail http://127.0.0.1:7993/health
curl --fail http://127.0.0.1:7991/
curl --fail http://127.0.0.1:7992/
```

数据库、Redis 和上传文件都使用 Docker 卷持久化，且数据库与 Redis 不映射到宿主机端口。前端 API 地址和高德地图密钥在镜像构建时写入；变更后需要重新构建对应前端镜像。
