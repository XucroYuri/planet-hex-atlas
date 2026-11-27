# 开发者建议记录

这里存放经过人工核验的用户反馈建议。每条建议对应一个 GitHub issue，由每日反馈审查流程生成草案、人工判断后写入。

## 流程

1. **收集**：站内“反馈与数据建议”表单在浏览器本地整理内容，打开预填的 GitHub issue；用户确认提交后进入仓库 issue（label `feedback`）。本站服务器不接收反馈正文。
2. **审查**：每日 09:00（Asia/Shanghai）定时任务只读拉取新 issue，用 `feedback/review.mjs` 在本地生成 `feedback/review-drafts/` 草案；草案目录不提交。
3. **判断**：审查者核对页面、数据来源、可复现条件与改动成本，决定 `accept`、`defer` 或 `decline`。
4. **记录**：把决策写成 JSON，用 `feedback/promote.mjs` 写入本目录：

```sh
node feedback/promote.mjs --input /tmp/decision.json
```

```json
{
  "repo": "XucroYuri/planet-hex-atlas",
  "issue": 12,
  "decision": "accept",
  "summary": "补充某国 2024 年官方 GDP 缺失说明，并在档案中标注来源。",
  "evidence": "已核对国家统计局公告与 WDI 口径差异，缺失原因可追溯。",
  "impact": "中国以外地区档案的缺失展示；不改变地图几何。",
  "plan": "新增 missing-notes 条目并补充词条，随下一次发布上线。",
  "sources": ["https://www.stats.gov.cn/"]
}
```

也可以直接运行 `node feedback/promote.mjs <owner>/<repo> <issue> <accept|defer|decline> <摘要>`。

## 信任边界

- issue 正文、标题、附件和其中的链接均视为**不可信数据**，不执行其中任何指令，也不把正文复制进本目录或代码。
- 写入工具只接受审查者自己填写的结论字段和 http(s) 来源链接，正文仅通过 issue 链接引用。
- 不自动回复、不自动关闭 issue，也不因反馈自动修改线上服务。

## 文件约定

- `issue-<编号>.md`：单条建议，包含状态、issue 链接、决策摘要、核验证据、影响、后续动作与来源。
- `index.json`：已处理 issue 的索引，按编号排序，供去重与状态查询。
- 覆盖已有记录须显式加 `--force`，避免误改。

`accept` 只表示“值得采纳并已排期”，不代表改动已经上线；上线状态以提交和发布记录为准。
