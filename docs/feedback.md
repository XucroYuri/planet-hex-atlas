# 网站反馈与 issue 审查

浏览器在站点原点提交 `POST /api/feedback`。独立的 Worker 校验表单、限流和 Turnstile，通过后向配置指定的私有仓库创建一条 issue。浏览器收到 `201` 和 `{ "ok": true }`。

## 表单接入

后续接入时，将 `feedback/form.mjs` 和它依赖的 `feedback/protocol.mjs` 纳入站点构建。表单字段名为 `feedback`（必填意见）和 `sourceUrl`（可选来源链接）。在表单内挂载 Turnstile widget，使用公开 site key，并将 `data-action` 设为 `feedbackFormConfig.action`（`website_feedback`）。widget 的默认响应字段为 `cf-turnstile-response`。

提交监听器调用 `event.preventDefault()`，再调用 `await submitFeedback(form)`。适配器向表单所在文档的原点发送 UTF-8 JSON。通过响应的状态和 `code` 显示界面结果。每次尝试后重置 Turnstile，并让用户决定是否重试。

- Worker 要求请求 URL 和 `Origin` 都匹配配置的 HTTPS 原点。若浏览器发送 `Sec-Fetch-Site`，其值须为 `same-origin`。响应不授予 CORS 权限。
- 请求体上限为 16 KiB，同时校验申报长度和实读字节。意见上限为 2,000 个 UTF-16 代码单元，来源 URL 和 Turnstile 令牌各上限为 2,048。`sourceUrl` 接受绝对的 HTTP 或 HTTPS URL，拒绝内嵌用户名和密码。
- GitHub 保存固定标题、意见和可选来源链接。意见与链接作为未信任的 Markdown 字面文本展示。Worker 不访问来源链接，也不向 GitHub 发送访问者 IP、Cookie 或 Turnstile 令牌。提交前请提醒用户移除个人信息与凭据，包括链接查询参数和片段内的敏感值。
- `400` 表示表单无效，`403` 表示来源或 Turnstile 校验失败，`413` 表示请求过大，`415` 表示媒体类型或编码不受支持，`429` 表示触发限流，`503` 表示服务关闭或依赖不可用。接口仅返回通用状态，不返回私有 issue 编号、链接和上游响应。

## 启用配置

独立配置文件为 `feedback/wrangler.toml`。未来启用时，将站点所在 Cloudflare 代理域名的 Workers 路由 `<站点主机>/api/feedback` 指向该 Worker。保留关闭的 `workers.dev` 和 Preview URL。设置 `FEEDBACK_ORIGIN` 为站点的标准 HTTPS 原点，形如 `https://feedback.example.com`，省略尾部斜杠。设置 `FEEDBACK_GITHUB_REPO` 为目标私有仓库的 `<owner>/<repo>`，并确认该仓库已启用 Issues。全部条件就绪后才将 `FEEDBACK_ENABLED` 设为字符串 `true`。

在 Worker 的同一部署环境中设置以下 secrets 和绑定。

- `TURNSTILE_SECRET_KEY` 是表单 widget 的服务端密钥。widget 的授权主机名应匹配 `FEEDBACK_ORIGIN`，其对应的 site key 提供给浏览器。Siteverify 须返回成功、匹配的 `hostname` 及 `website_feedback` action。
- `GITHUB_ISSUE_TOKEN` 是专用 fine-grained GitHub PAT，仅选择该目标仓库，授予 `Issues: Read and write` 与 GitHub 强制的 `Metadata: Read-only`。预先完成所属组织要求的令牌审批。Worker 仅向 `api.github.com` 的固定仓库 `/issues` 发起 `POST`，并拒绝跟随重定向。
- `FEEDBACK_RATE_KEY` 是独立生成的 32 字节随机密钥，以 64 个十六进制字符录入。Worker 用它计算访问者 IP 的 HMAC。可在受控终端运行 `openssl rand -hex 32 | wrangler secret put FEEDBACK_RATE_KEY --config feedback/wrangler.toml`，由管道传递生成值。
- `FEEDBACK_RATE_LIMITER` 是 Worker 内部的 SQLite Durable Object 命名空间绑定，类名为 `FeedbackRateLimiter`。配置中的 `new_sqlite_classes` migration 提供 SQLite 存储。启用的每个站点入口应使用同一命名空间中的 `website-feedback` 对象。

Worker 通过固定对象名将所有实例的请求汇集到同一个 Durable Object。每次预留在 `transactionSync` 中检查重放和配额并写入记录。任意滚动 60 秒内允许单个 Cloudflare 客户端 IP 最多 5 次准备就绪的请求，同一命名空间全站最多 60 次。配额在请求 Siteverify 前消耗。存储使用 IP 的 HMAC、令牌的 SHA-256 和预留时间，记录在 10 分钟后失效，由后续请求或 alarm 删除。绑定缺失、异常或返回未知状态时停止处理。GitHub 请求只发一次，超时时服务端的创建结果可能未知。

使用 Worker secrets 或受保护的部署环境注入凭据。配置模板的原点和仓库均为空，开关关闭。缺少任一运行时 secret、限流绑定或有效配置时，接口返回 `503`。应用层不记录表单或凭据，配置关闭 Worker 观测。未来操作 Cloudflare 时，使用有权管理该 Worker 及目标站点域名路由的部署身份。

## 定时审查

使用 Node.js 24 或更新版和已认证的 `gh`。给定时任务提供独立的只读身份，建议使用仅选中目标仓库、权限为 `Issues: Read-only` 与 `Metadata: Read-only` 的 fine-grained token。通过任务的 secret store 注入 `GH_TOKEN`，或由运行账号使用已有的 `gh` 登录。第二个参数是写入 PAT 的所属 GitHub 登录名。定时任务可将下列命令中的脚本路径换成绝对路径。

```sh
node feedback/review.mjs '<owner>/<repo>' '<issue-创建账号>'
```

脚本仅通过 `gh api --method GET` 分页读取目标仓库 issue，以创建者和正文标记筛选反馈。建议由固定规则生成，正文和标题明确标注未信任并按字面文本渲染。脚本不会读取正文里的指令执行命令、访问其中的 URL 或写回 GitHub。

草案位于 `feedback/review-drafts/<owner>/<repo>/issue-<编号>.md`，仓库路径分量统一转小写。目录由 `.gitignore` 排除。脚本先完整写入权限为 `0600` 的临时文件，再以独占硬链接发布。它会保留已有文件及人工编辑，并发运行只会创建一份草案。新草案为零时安静退出，失败时返回非零并输出通用提示。运行账户需要对草案目录有写权限，所在文件系统须支持硬链接。

## 本地测试

```sh
node --test tests/feedback*.test.mjs
```

测试使用合成表单、模拟上游和本地 SQLite，覆盖请求门禁、限流与重放、GitHub 写入范围，以及草案的只读获取和幂等发布。
