# CodeSage

[English](README.md) | [中文](README.zh-CN.md)

基于 Claude Code 的 AI 代码审查引擎。不只看 diff，而是理解整个工程上下文后再给出审查意见。

与传统的 diff 审查工具不同，CodeSage 利用 Claude Code CLI 主动探索你的整个代码库——阅读文件、搜索引用关系、理解调用链——然后给出结构化的审查反馈。

## 特性

- **全工程审查** — 不只看 diff，主动探索引用关系和调用链
- **Gitee 优先** — 原生支持 Gitee（含企业私有化部署），同时具备平台无关的架构
- **CLI + Webhook** — 手动命令行审查，或 Webhook 自动在 PR 创建/更新时审查
- **结构化报告** — JSON / Markdown / 终端输出，包含评分、严重等级、分类和修复建议
- **PR 评论回写** — 审查结果自动评论到 PR，支持总评和行级评论
- **多模型支持** — 通过配置切换 AI 提供商：Claude、DeepSeek、智谱 BigModel、OpenRouter 等

## 快速开始

### 安装

```bash
git clone https://github.com/Louis-XWB/CodeSage.git
cd CodeSage
pnpm install
pnpm build
npm link
```

### 配置

```bash
# AI 提供商（默认 Anthropic Claude）
codesage config set apiBaseUrl "https://api.anthropic.com"
codesage config set apiToken "your-api-key"

# 使用智谱 BigModel
codesage config set apiBaseUrl "https://open.bigmodel.cn/api/anthropic"
codesage config set apiToken "your-bigmodel-key"

# 使用 DeepSeek
codesage config set apiBaseUrl "https://api.deepseek.com"
codesage config set apiToken "your-deepseek-key"

# Gitee 令牌（审查 PR 和回写评论必需）
codesage config set giteeToken "your-gitee-token"

# 私有化部署的 Gitee
codesage config set giteeBaseUrl "https://gitee.your-company.com"
```

配置存储在本地 `~/.codesage/config.json`，不会提交到 git。

也支持环境变量（优先级高于配置文件）：

```bash
export CODESAGE_API_BASE_URL="https://open.bigmodel.cn/api/anthropic"
export CODESAGE_API_TOKEN="your-key"
export CODESAGE_GITEE_TOKEN="your-token"
export CODESAGE_GITEE_BASE_URL="https://gitee.your-company.com"
```

### 审查 PR

```bash
# 审查一个 Gitee PR
codesage review --pr https://gitee.com/org/repo/pulls/123

# 审查并回写评论到 PR
codesage review --pr https://gitee.com/org/repo/pulls/123 --comment

# 本地模式：对比两个分支（不需要 Gitee 令牌）
codesage review --repo /path/to/repo --base main --head feature/xyz

# 输出 JSON 格式
codesage review --pr https://gitee.com/org/repo/pulls/123 --format json

# 保存报告到文件
codesage review --pr https://gitee.com/org/repo/pulls/123 --output report.md --format markdown
```

### Webhook 服务（PR 自动审查）

启动服务，PR 创建或更新时自动触发审查：

```bash
codesage server --port 3000
```

在 Gitee 仓库配置 Webhook：

1. 进入仓库 **管理 > WebHooks**
2. URL 填 `http://你的服务器IP:3000/webhook/gitee`
3. 事件勾选 **Pull Request**
4. 保存

之后每次新建或更新 PR，CodeSage 会自动审查并将结果评论到 PR。

### Docker 部署

```bash
docker build -t codesage .
docker run -p 3000:3000 \
  -e CODESAGE_API_BASE_URL=https://open.bigmodel.cn/api/anthropic \
  -e CODESAGE_API_TOKEN=your-api-key \
  -e CODESAGE_GITEE_TOKEN=your-gitee-token \
  -e CODESAGE_GITEE_BASE_URL=https://gitee.your-company.com \
  codesage
```

## 工作原理

```
用户/CI ──→ CLI ──→ 核心引擎 ──→ Claude Code CLI ──→ 结构化报告
                      ↑                                   ↓
Gitee Webhook ──→ 服务端 ──→ 核心引擎              平台适配器
                                                       ↓
                                                 PR 评论回写
```

1. **触发** — CLI 命令或 Gitee Webhook 事件
2. **准备** — Clone/Fetch 仓库、Checkout PR 分支、计算 Diff
3. **分析** — Claude Code CLI 带着完整工程上下文审查（读文件、搜引用、理解调用链）
4. **报告** — 结构化 JSON，包含评分（0-100）、按严重等级分类的问题、改进建议
5. **分发** — 终端输出 / Markdown 报告 / PR 评论

## 审查输出

CodeSage 生成的审查报告包含：

- **评分**（0-100）— 代码质量整体评估
- **问题**按严重等级分组：
  - `critical` — 必须修复（Bug、安全漏洞）
  - `warning` — 建议修复（性能、设计问题）
  - `info` — 可选改进（风格、命名）
- **分类** — Bug、安全、性能、风格、设计
- **建议** — 整体改进建议

终端输出示例：

```
CodeSage Review  35/100

检测到严重安全问题。报表端点存在命令注入漏洞，认证机制不安全。

  [CRITICAL] 命令注入漏洞
    src/controllers/search.ts:56 (security)
    用户输入通过 exec() 直接拼接到 shell 命令中。
    → 使用白名单限制报表类型，避免使用 exec()。

  [WARNING] N+1 查询问题
    src/controllers/search.ts:23 (performance)
    循环中逐个调用 findUserById。
    → 预先加载所有用户到 Map，再在循环中查找。
```

## 配置说明

配置文件：`~/.codesage/config.json`

| 配置项 | 环境变量 | 默认值 | 说明 |
|-------|---------|-------|------|
| `apiBaseUrl` | `CODESAGE_API_BASE_URL` | `https://api.anthropic.com` | AI API 地址 |
| `apiToken` | `CODESAGE_API_TOKEN` | — | AI API 密钥 |
| `platform` | `CODESAGE_PLATFORM` | `gitee` | 默认平台 |
| `giteeBaseUrl` | `CODESAGE_GITEE_BASE_URL` | `https://gitee.com` | Gitee API 地址 |
| `giteeToken` | `CODESAGE_GITEE_TOKEN` | — | Gitee 访问令牌 |
| `defaultFormat` | — | `terminal` | 输出格式（terminal/json/markdown）|

优先级：环境变量 > 配置文件 > 默认值

## 支持的 AI 提供商

任何兼容 Anthropic API 的端点均可使用。已测试：

| 提供商 | apiBaseUrl |
|-------|-----------|
| Anthropic Claude | `https://api.anthropic.com`（默认）|
| 智谱 BigModel | `https://open.bigmodel.cn/api/anthropic` |
| DeepSeek | `https://api.deepseek.com` |
| OpenRouter | `https://openrouter.ai/api/v1` |

## 前置要求

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（`npm install -g @anthropic-ai/claude-code`）
- Claude 或兼容提供商的有效 API 密钥

## 开发

```bash
pnpm install
pnpm test          # 运行测试（37 个测试用例）
pnpm build         # 构建
pnpm dev           # 监听模式
```

## 路线图

- [ ] GitHub / GitLab 平台适配器
- [ ] 审查历史 Web 面板
- [ ] 自定义审查规则（`.codesage.yml`）
- [ ] tree-sitter AST 分析，更深层的代码理解
- [ ] PR 代码质量趋势分析
- [ ] npm 发布，支持 `npx codesage` 使用

## 贡献

欢迎贡献！请在 [GitHub](https://github.com/Louis-XWB/CodeSage) 上提 Issue 或 PR。

## 许可证

MIT
