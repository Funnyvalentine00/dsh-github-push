# @dsh-external/dsh-github-push

> 一个 DSH 超级模组（toolkit 形态）：**一句话上传项目到 GitHub**。  
> 只要给出仓库 URL，它会自动处理 README、git init、add/commit、remote、push，一步到位。

## 解决什么问题

以前上传项目到 GitHub 需要手动：

1. 建仓库
2. `git init`
3. 写 README
4. `git add .`
5. `git commit`
6. `git remote add`
7. `git push`

这个插件把上面全部封装成一个工具：

```
dev_github_push
```

## 核心功能

- ✅ 自动识别/初始化 git 仓库
- ✅ 自动 `git add -A` 并提交
- ✅ 自动设置/更新 GitHub remote
- ✅ 自动推送到 `main` 分支
- ✅ 可选通过 `gh` CLI 自动创建不存在的仓库
- ✅ **自动处理 README**：
  - 没有 README → 自动生成一份较详细的 README
  - README 太简短 → 自动替换为更完整的版本
  - README 已有内容 → 自动补齐缺失的常用章节（安装 / 使用 / 项目结构 / License）
  - 可用 `readmeMode=keep` 跳过，或 `readmeMode=rewrite` 强制重写
- ✅ **自动设置 GitHub About topics**：
  - 根据项目元数据自动推断 topic（如 `dsh`、`dsh-plugin`、`deepseek-harness`、项目名等）
  - 支持通过 `topics` 参数追加自定义 topic
  - 优先用 `gh repo edit`，没有 gh 时用 GitHub REST API（需要 `GITHUB_TOKEN` / `GH_TOKEN`）

## 工具说明

### `dev_github_push`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `url` | string | 是 | GitHub 仓库 URL |
| `dir` | string | 否 | 要上传的项目目录，默认当前工作目录 |
| `message` | string | 否 | 提交信息，默认 `Update project` |
| `branch` | string | 否 | 分支，默认 `main` |
| `visibility` | string | 否 | 新建仓库可见性：`public` / `private`，默认 `public` |
| `readmeMode` | string | 否 | README 处理：`auto` / `keep` / `rewrite`，默认 `auto` |
| `topics` | string | 否 | 额外 GitHub topics，逗号分隔，例如 `dsh,plugin,automation` |

## 使用示例

```json
{
  "name": "dev_github_push",
  "arguments": {
    "url": "https://github.com/Funnyvalentine00/my-project",
    "dir": "E:/my-project"
  }
}
```

或直接对 AI 说：

> “上传 `E:/my-project` 到 https://github.com/Funnyvalentine00/my-project，private”

## README 自动生成规则

- 读取项目 `package.json` 的 `name` / `description` / `scripts` / `license`
- 扫描项目文件树（自动忽略 `node_modules`、`.git` 等）
- 生成或补齐以下章节：
  - 项目名 + 简介
  - 项目结构
  - 安装
  - 使用
  - License

## Topics 自动推断规则

自动收集以下来源（去重、最多 20 个）：

- `package.json` 的 `keywords`
- 如果是 DSH 插件：`dsh`、`dsh-plugin`、`deepseek-harness`
- 项目目录名
- 调用时传入的 `topics` 参数（逗号分隔）

设置方式：

1. 优先使用 `gh repo edit <repo> --add-topic <topic>`
2. 如果没有 `gh`，则使用 GitHub REST API：
   ```
   PUT /repos/{owner}/{repo}/topics
   ```
   需要环境变量 `GITHUB_TOKEN` 或 `GH_TOKEN`

## 安装

### 方式 A：直接注入（当前环境）

```bash
# 在 DSH 内对 AI 说：
dev_inject_plugin {"dir": "E:/dsh插件/router/dsh-github-push"}
```

### 方式 B：从源码构建

```bash
DSH_CHECKOUT=<checkout> bash scripts/build.sh
dev_inject_plugin {"dir": "<本目录>"}
```

## 依赖

- `@deepseek-ai/dsh-tools`
- `cordis`
- `schemastery`

## 注意

- 如果仓库不存在且本机没有 `gh` CLI，工具会提示你先在 GitHub 手动建仓库。
- 自动生成的 README 是基于项目元数据的模板；需要更“智能”的文案时，可以让 AI 在推送前再人工/LLM 完善。
- 已存在的 README 不会被覆盖，除非它太短或你显式指定 `readmeMode=rewrite`。
- 自动设置 topics 需要 `gh` CLI 已登录，或设置 `GITHUB_TOKEN` / `GH_TOKEN`；否则会跳过并提示。

## License

MIT

