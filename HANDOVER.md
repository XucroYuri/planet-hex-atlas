# 项目移交与服务器开发仓库说明

迁移时间：2026-11-28（Asia/Shanghai）
项目：寰宇图志 · Orbis Atlas

## 1. 权威位置

| 用途 | 位置 |
| --- | --- |
| 开发仓库（服务器） | `/home/xuyu/code/Github/01-核心产品/站点杂项/planet-hex-atlas`（`~/code` → `/mnt/Dev/code`） |
| Git 远端 | `https://github.com/XucroYuri/planet-hex-atlas.git`（`origin`） |
| 生产站点 | https://earth.xuyu.net/ |
| Cloudflare Pages 项目 | `planet-hex-atlas` |
| 迁移时提交 | `f26caef920c3060b10aaaa5148963b0238c1a197` |
| 生产快照 | `d070bcbdbf8d55fd`（上一版 `89e1c0ae4e216be2`） |

服务器为 Ubuntu（`xuyu@192.168.1.100`），用户级 Node 22 已安装到 `~/.local/lib/node22`。

## 2. 本轮迁移内容

- GitHub 仓库完整克隆（全部提交与分支），`origin` 指向 GitHub。
- 开发记录：`progress.md`（38 KB，逐轮记录）复制到仓库根目录；该文件按原 `.gitignore` 不纳入公开仓库。
- 送审交接包：`dist/standard-map-submission.zip` 归档到私有 `/home/xuyu/code/local/planet-hex-atlas-handover/artifacts/`。
- 会话迁移：
  - 当前开发会话 `session-9253b25f-c5df-4cc0-b5bd-70cdff0fc9eb`（标题“寰宇图志历史模拟开发”）；
  - 关联的反馈复查会话 `session-4806b3e4-bad4-4837-8e67-40f1370a34fc`（“审阅寰宇图志用户反馈”）；
  - 同项目 8 个 Codex 会话日志。
- 原始会话归档位于私有 `/home/xuyu/code/local/planet-hex-atlas-handover/sessions/`；DSH 可恢复副本已导入服务器 `~/.dsh/sessions/<按工作区编码的目录>/`，其 `cwd` 已改写为服务器工作区。
- 未迁移 `.releases/`（2.4 GB 发布快照）、`.venv/`、`.wrangler/`、`mcp/node_modules/`：这些均可由仓库脚本重新生成，避免把平台相关产物带入服务器。
- 校验清单：`/home/xuyu/code/local/planet-hex-atlas-handover/manifest.json`（文件大小、SHA-256、会话列表、生产快照）。

私有目录 `~/code/local/planet-hex-atlas-handover/` 位于 `~/code/local/` 下、不在 GitHub 项目索引与仓库内，不会推送到公开 GitHub。

## 3. 服务器侧验证结果

- `node --test tests/*.test.mjs`：**116 通过 / 0 失败 / 3 跳过**（Node v22.23.5）。
- `pipeline/test_release.py`：发布隔离、上一版保留、URL 别名与缓存规则通过。
- `pipeline/china_source_audit.py`：状态 `blocked`，仍为 `MAP_SOURCE`、`LEGACY_GEOMETRY`、`ISLAND_GEOMETRY` 三项。
- `gh auth status`：已登录 `XucroYuri`，具备 `repo`/`workflow` 权限。
- **Cloudflare 未登录**：服务器 `npx wrangler whoami` 显示未认证，部署前需由账户所有者在服务器执行一次 `npx wrangler login`。

## 4. 运行手册（服务器）

```bash
# Node 22（非交互 shell 默认 PATH 不含 ~/.local/bin）
export PATH="$HOME/.local/lib/node22/bin:$PATH"

cd "/home/xuyu/code/Github/01-核心产品/站点杂项/planet-hex-atlas"
npm test                                   # 116 项 Node 测试
npm run verify:pipeline                    # 发布规则 + 中国数据源审计
uv sync --frozen                           # Python 数据管线依赖
uv run --frozen python pipeline/package_site.py
```

浏览器级测试需要 Playwright 与 Chromium（服务器当前未预装）：

```bash
uv run --with playwright playwright install chromium
```

数据重建命令见 `README.md` 与 `progress.md`；其中 `pipeline/china_population_series.py` 依赖 macOS Vision OCR，Linux 上不要重跑，直接使用仓库内已提交的 `web/data/china-population-official.json`。

部署（完成 `wrangler login` 后）：

```bash
uv run --frozen python pipeline/package_site.py
npx --yes wrangler@4 pages deploy .releases/<digest> \
  --project-name planet-hex-atlas --branch main \
  --commit-hash "$(git rev-parse --short HEAD)" \
  --commit-message "deploy from ubuntu dev repo"
```

## 5. 会话与反馈复查任务

- 服务器 DSH 会话目录名：
  `--home-xuyu-code-Github-01-~6838~5fc3~4ea7~54c1-~7ad9~70b9~6742~9879-planet-hex-atlas--`
- 已导入的会话可在服务器 DSH 中按原会话 ID 打开；原始归档保留在 `/home/xuyu/code/local/planet-hex-atlas-handover/sessions/`，未改写路径，供审计与灾难恢复。
- 每日反馈复查任务原运行于 macOS DSH：
  - 任务 ID：`schedule-1018d6b6-4b4b-4f02-8936-34c80067295b`
  - 规则：每日 09:00（Asia/Shanghai）
  - 内容：只读检查 GitHub issue，静默结束；对新反馈生成 `docs/feedback-recommendations/` 建议，不自动回复/关闭 issue。
- **协调待办**：在服务器 DSH 以新路径 `/home/xuyu/code/Github/01-核心产品/站点杂项/planet-hex-atlas` 重建同一规则的任务后，再暂停 macOS 侧任务，避免双端重复处理。提示词在 `/home/xuyu/code/local/planet-hex-atlas-handover/sessions/dsh-feedback/` 对应会话与本文第 5 节可复原。
- 同项目 Codex 会话日志已归档在 `/home/xuyu/code/local/planet-hex-atlas-handover/sessions/codex/`；它们是历史审查记录，不是可继续运行的进程。

## 6. 未完成与阻塞

- 中国标准地图送审仍需外部输入：持测绘资质单位提供的权威几何、审图号及审核意见；站内标准核查状态如实显示三项阻断，且不声称合规。
- 服务器部署凭据（Cloudflare）需账户所有者登录。
- 服务器浏览器测试环境（Playwright Chromium）尚未安装。
- 反馈复查任务的服务器端重建尚未执行（见第 5 节）。

## 7. 验收清单

- [x] 仓库完整克隆、远端与当前提交一致
- [x] 开发记录、送审包、私有会话归档与 SHA-256 清单
- [x] 当前会话与反馈复查会话导入服务器 DSH（cwd 改写）
- [x] 服务器 Node 22 测试 116/116 通过
- [x] 发布规则、数据源审计在服务器通过
- [x] 私有归档位于 `~/code/local/planet-hex-atlas-handover/`，在仓库与索引之外
- [ ] 服务器 Cloudflare 登录并完成一次部署演练
- [ ] 服务器 DSH 重建每日反馈复查任务并暂停 macOS 任务
- [ ] 外部权威几何/审图号到位后关闭 3 项地图阻断
