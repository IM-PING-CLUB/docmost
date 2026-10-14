<div align="center">
    <h1><b>Docmost</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Getting started

To get started with Docmost, please refer to our [documentation](https://docmost.com/docs) or try our [cloud version](https://docmost.com/pricing) .

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License
Docmost core is licensed under the open-source AGPL 3.0 license.  
Enterprise features are available under an enterprise license (Enterprise Edition).  

All files in the following directories are licensed under the Docmost Enterprise license defined in `packages/ee/License`.
  - apps/server/src/ee
  - apps/client/src/ee
  - packages/ee

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks
Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.


<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.


## 外部系统管理员重置密码

接口：`POST /api/auth/external-password-reset`，仅供可信系统后端调用。
调用系统必须先校验操作人的管理员权限；专用密钥本身拥有重置当前工作区用户密码的权限。

在 Docmost 服务端环境变量中配置 `EXTERNAL_PASSWORD_RESET_SECRET`，并在调用系统后端保存相同值。
使用 `openssl rand -hex 32` 生成独立随机密钥（至少 32 个字符），不要复用 `APP_SECRET`、提交到 Git 或暴露给浏览器。
未配置或留空时接口拒绝所有请求。修改配置后重启服务；Docker 部署需把变量传入容器，单独修改宿主机 `.env` 不一定会传入。

```bash
curl --request POST 'https://docmost-uat.jxcq.work/api/auth/external-password-reset' \
  --header "Authorization: Bearer ${EXTERNAL_PASSWORD_RESET_SECRET}" \
  --header 'Content-Type: application/json' \
  --data '{"email":"user@example.com","password":"replace-with-new-password"}'
```

通过 HTTPS 调用，避免在应用日志中记录请求密钥或密码。邮箱查询不区分大小写，限定在请求所解析出的工作区内。
密码至少 8 个字符，最多 72 个 UTF-8 字节（bcrypt 限制，中文等字符占多个字节）。
接口不需要旧密码或邮件 token，不发送邮件、不返回登录凭证，也不修改邮箱验证状态或 MFA 配置。
启用强制 SSO 的工作区拒绝此操作。

成功响应遵循项目统一格式：

```json
{"data":{"success":true},"success":true,"status":200}
```

| HTTP 状态码 | 含义 |
| --- | --- |
| 200 | 重置成功 |
| 400 | 参数不合法、密码过长或工作区强制 SSO |
| 401 | 专用密钥未配置、未提供或不正确 |
| 404 | 用户不存在、已停用或已删除；工作区无法解析也可能返回此状态 |
| 429 | 超过现有认证接口限流（每个调用 IP 每分钟 10 次） |

重置在同一个数据库事务中更新密码哈希、作废已有密码重置 token、撤销该用户的登录会话。
用户需要使用新密码重新登录；其他用户不受影响。
同时触发现有密码重置事件用于 OAuth 授权清理，并写入来源为 `external_password_reset` 的系统审计事件。
OAuth 清理失败沿用原重置流程：记录错误日志，不回滚已完成的密码重置。
审计持久化取决于当前部署的审计实现（社区版为 No-op）；调用系统应自行记录具体管理员和操作结果，不记录密码或密钥。

## 本地 Docker 启动当前分支

根目录 `.env` 需配置有效的 `APP_SECRET`，以及启用外部重置接口所需的 `EXTERNAL_PASSWORD_RESET_SECRET`。

```bash
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml logs -f docmost
```

访问 http://localhost:3002 。此配置从当前源码构建镜像，使用本项目原有的命名数据卷，数据库启动后应用自动执行迁移。
PostgreSQL 和 Redis 分别映射到本机 `15432`、`16379`，供本机源码开发连接；容器之间使用内部地址。
若改用 `pnpm dev`，先停止应用容器以释放 3002：`docker compose -f docker-compose.local.yml stop docmost`。
停止全部服务使用 `docker compose -f docker-compose.local.yml down`，不要加 `-v`，以保留数据。

新接口的应用层错误统一返回 `statusCode`（数字）、`error`（字符串）、`message`（字符串）。参数校验有多个错误时，`message` 用分号连接。500 错误不返回内部细节。此格式仅作用于新接口的 Nest 异常处理，不改变其他接口；反向代理及请求解析阶段的错误可能由基础设施直接返回。

```json
{"statusCode":400,"error":"Bad Request","message":"email must be an email"}
```

本地 Compose 使用独立的 `Dockerfile.local`；原有 `Dockerfile` 和全局环境变量校验保持不变。专用密钥未配置或不足 32 个字符时，只拒绝新接口调用，不阻止应用启动。
