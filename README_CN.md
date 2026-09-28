# Catea

<div align="center">

<pre>
     _______________________________
    |                               |
    |        C A T E A              |
    |         P A P E R             |
    |_______________________________|
</pre>


<p><strong>世界一流的 Obsidian 插件，让你的 Obsidian 焕然一新。</strong></p>

<p>
  <img src="https://img.shields.io/badge/version-0.3.4-blue?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/Obsidian-1.8.0%2B-7C3AED?style=flat-square&logo=obsidian&logoColor=white" alt="Obsidian">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/License-GPL--3.0--blue?style=flat-square" alt="License">
</p>

<p>
  <a href="#-为什么选择-catea">为什么选择 Catea？</a> •
  <a href="#-功能特性">功能特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-架构">架构</a> •
  <a href="#-byok-配置">BYOK 配置</a> •
  <a href="#-网络使用">网络使用</a> •
  <a href="#-致谢">致谢</a>
</p>

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/English-切换-orange?style=flat-square" alt="English"></a>
  <a href="./README_CN.md"><img src="https://img.shields.io/badge/中文-Active-blue?style=flat-square" alt="中文"></a>
</p>

</div>

---

## 🌟 为什么选择 Catea

> **你的仓库，焕然一新。** 一个原生的 Catea Agent 住在 Obsidian 里——阅读、写作、搜索、记忆，把一堆静态笔记变成真正的工作空间。

Catea 不是又一个挂在 Obsidian 旁边的聊天框。它是一个**搭载原生 Catea Agent 的 Paper 工作区**——用一等公民的原生工具操作你的仓库，写入之前先征求确认，跨会话保留记忆，并把长任务执行到底。

### 有什么不一样？

| | 常见的 AI 插件 | Catea |
| --- | --- | --- |
| **工作区** | 笔记旁边的聊天框 | 一等公民的 Paper 面板，工作流式写回仓库 |
| **仓库访问** | 复制粘贴来回搬运 | 原生 `obsidian-workspace` 工具，写入需确认 |
| **记忆** | 换个会话就遗忘 | NanoMem——召回、剧集、巩固与强化 |
| **长任务** | 一问一答 | CatUI Agent 循环：256 轮 / 512 次工具调用，带检查点与上下文交接 |
| **模型** | 绑定单一供应商 | BYOK——任意 OpenAI / Anthropic 兼容端点 |
| **联网** | 没有 | 分层回退搜索：Exa MCP → agent-reach → Jina → DuckDuckGo |
| **安全** | 盲目改笔记 | `raw/` 禁止写入，`wiki/log.md` 仅追加，每次写入先确认 |

## ✨ 功能特性

- 🤖 **原生 Agent，不是一个提示词壳**——完整的 CatUI 风格 Agent 循环跑在插件内部
- 🔁 **长程执行**——单次运行最多 256 轮对话、512 次工具调用，支持检查点、续跑与停滞检测
- 🧵 **上下文交接**——`session_history`、`working_notes`、`new_context` 跨窗口拼接，思路永不中断
- 🌊 **流式回复**——ANNO `StreamingChatResponse` 平滑增量输出，支持 Markdown 与 Mermaid 渲染
- ❓ **AskUserQuestion**——意图不明时先提问（单选 / 多选、自定义输入、预览），而不是靠猜
- 🧠 **NanoMem 记忆**——剧集召回、结构化提取、强化、去重与自动 dream 生命周期
- 🧩 **Skills & MCP**——内置 `obsidian-workspace` Skill，`.catea/skills` 即放即用，MCP 在设置中显式启用
- 🔑 **BYOK**——OpenAI / Anthropic 兼容协议，草稿式模型编辑；Key 保存在 Obsidian 安全存储
- 🎭 **Persona**——Vex、Aria、Pencil，各有独特声音
- 🌐 **网络搜索与网页读取**——多层回退链路；来源可在回复卡片中展开；网页内容按不可信资料处理
- 🔍 **运行可观测**——运行轨迹、工具摘要与循环进度皆可查看

## 🚀 快速开始

### 环境要求

- **Obsidian 桌面版** ≥ 1.8.0 —— Catea 仅支持桌面端（`isDesktopOnly: true`）
- **Node.js 18+**，支持 npm workspaces
- 无需其他仓库。设计系统已随本仓库一起提供（`packages/design-system`），克隆即可完成构建。

### 构建插件

```bash
git clone https://github.com/cunyu6666/catea-obsidian-plugin.git catea
cd catea

# 设计系统已内置于 packages/design-system，本仓库克隆即为完整构建输入。

npm install
npm run build
```

构建产物全部输出到 `dist/catea-paper/`：

```
dist/catea-paper/
├── main.js         # 打包后的插件（esbuild）
├── manifest.json   # id: catea-paper · minAppVersion: 1.8.0 · 仅桌面端
└── styles.css      # 生成的样式表
```

> `npm run build` 只产生输出，不会覆盖已安装的插件。

### 安装到你的仓库

```bash
cp -R dist/catea-paper "<你的仓库>/.obsidian/plugins/catea-paper"
```

然后在 Obsidian 打开 **设置 → 第三方插件**，启用 **Catea**。文件夹名需保持 `catea-paper` 以匹配 manifest id。

### 首次使用

在 **Catea 设置**中添加模型——协议、基础地址、模型 ID 和 API Key——然后点击侧栏的 **Catea Agent** 图标。不需要 CatUI 账号或服务。

## 📐 架构

Catea 是一个 monorepo（`catea-source`），将插件宿主、Agent 与 Agent 可触达的一切清晰分层。

```
catea/
├── apps/
│   └── obsidian/          # 插件宿主 + Paper UI
│                          #   React 面板、流式对话渲染、Mermaid 图表、
│                          #   笔记预览与缩略图、Obsidian 工具绑定
├── packages/
│   ├── agent-core/        # CatUI Agent 循环 + BYOK provider + 上下文控制
│   │   └── upstream/      # 内置的上游循环机制（固定版本）
│   ├── integrations/      # vault 工具、Skills、MCP、网络搜索、存储
│   ├── memory/            # NanoMem 记忆核心 + 宿主适配（上游，GPL-3.0）
│   └── personas/          # Vex · Aria · Pencil
├── docs/ARCHITECTURE.md   # 更深入的设计说明
└── scripts/build.mjs      # esbuild 构建管线 → dist/catea-paper
```

设计组件与 Token 位于本仓库的 `packages/design-system`，通过 npm workspaces 关联——不含本地绝对路径，也不依赖本地 ANNO 或 CatUI 检出。

更深入的设计说明：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 🔁 CatUI Agent 循环

插件的心脏是一个固定上游版本的 CatUI Agent 循环，为真实的长任务而生：

- **执行预算**——单次运行 256 轮 / 512 次工具调用，含工具参数校验、只读并发、停止处理、结果补齐与重复无进展检测
- **运行中补充要求**——Agent 工作时仍可追加新要求
- **上下文交接**——窗口写满时，`session_history`、`working_notes` 与重建的 `new_context` 无缝接手；原始记录完整保留，最近工具链与最新请求持续在窗口内，工作笔记可跨窗口、跨重启恢复
- **全程流式**——网络层保留真正的 SSE，UI 层使用 ANNO `StreamingChatResponse`，停止立即显示，并支持减少动态效果偏好

## 🧠 NanoMem 记忆系统

你的 Agent 拥有的是记忆系统，而不是一份流水账：

- **剧集记忆**——会话同步为带嵌入向量的 episode
- **召回与打分**——结构化提取、相关性打分、强化、去重与淘汰，让记忆保持锐利
- **Dream 生命周期**——巩固在后台自动运行；任务持久排队、异步执行
- **隐私感知**——本地会话与记忆可能包含私人笔记，绝不作为插件分发文件

## 🔐 Obsidian 集成与安全

Agent 通过内置的 `obsidian-workspace` Skill 操作你的仓库——无需安装，安全边界内置：

- **写入前确认**——每一次改动都先提议；并检查确认期间内容是否发生变化
- **`raw/` 禁止写入**——原始素材保持原样
- **`wiki/log.md` 仅追加**——账本不可改写
- **一等公民的原生工具**——当前笔记与选区、按标题 / 正文 / 标签 / 属性搜索、在标签页或分栏中打开、分段阅读、唯一匹配编辑、新建、移动与回收站删除
- **受控的设置**——只暴露安全的 UI 开关（toolbar、Tabler 图标、隐藏属性 / 侧边栏 / 状态栏、联网、记忆）；任意 Obsidian 配置、密钥与插件管理一律不开放；修改需要确认

## 🔑 BYOK 配置

Catea 是自带密钥（bring-your-own-key）：

- **草稿式编辑**——添加或编辑模型使用独立草稿，取消不会修改现有配置
- **保存前校验**——显示名称、模型 ID、API Key 与 HTTP(S) 基础地址
- **双协议**——OpenAI 兼容与 Anthropic 兼容；切换协议会填入对应默认 API 地址，也可替换为自己的兼容服务地址
- **Key 存储**——模型元数据写入 `.catea/config.json`；API Key 保存在 Obsidian 安全存储（不可用时仅在当次运行的内存中有效）
- **无锁定**——侧栏只列出完整配置的模型并记住上次选择；没有预置模型列表，也不需要 Catea 账号

## 🌐 网络使用

Catea 只在你可见、可控的场景下联网——没有遥测、没有统计、也没有 Catea 运营的后端。

| 目标地址 | 触发时机 | 用途 |
| --- | --- | --- |
| 你配置的模型端点——`api.openai.com`、`api.anthropic.com`，或任何你设置的 OpenAI / Anthropic 兼容地址 | 每次对话 | 发送提示词、上下文与工具结果；接收模型输出 |
| Exa MCP（`mcp.exa.ai`） | Agent 执行网络搜索时 | 首选搜索引擎 |
| Jina（`r.jina.ai`、`s.jina.ai`） | 搜索回退与网页阅读 | 搜索回退与页面正文提取 |
| DuckDuckGo（`html.duckduckgo.com`、`api.duckduckgo.com`） | 搜索回退 | 最后一级搜索回退 |

- 联网可在设置中关闭；Agent 只在任务需要时发起搜索。
- 抓取的网页内容按不可信资料处理。
- 仓库数据、记忆与 `.catea/config.json` 都留在本地；API Key 保存在 Obsidian 安全存储。不会向 O-Pencil 或 Catea 发送任何数据。
- 涉及的凭证仅为你为自己 Provider 配置的 API Key。

## 📦 致谢

Catea 站在优秀的开源工作之上——完整详情见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)：

- **ANNO**——流式 provider、输入框、回复卡片、活动组件与 Persona 基础
- **CatUI**——记忆核心（GPL-3.0，内置在 `packages/memory/upstream`）、link-world 网络层与 Agent 循环（固定版本 `d6d110aa`）
- **Craft Agents UI**——`catea-design-system` 背后的设计系统基础
- **Tabler Icons**——Outline 3.48.0（MIT），见 [TABLER-LICENSE.txt](./TABLER-LICENSE.txt)

## 📄 许可证

Catea 以 **GNU General Public License v3.0** 发布——见 [LICENSE](./LICENSE)。内置与第三方组件保留其原始许可——尤其是 `packages/memory/upstream` 下的 GPL-3.0 记忆核心。完整清单见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

---

<div align="center">
  <sub>由 <a href="https://github.com/cunyu6666">Cunyu</a> 用 ✎ 打造 —— 你的仓库值得拥有一个大脑。</sub><br>
  <sub>Catea 是独立项目，与 Obsidian 官方无隶属或背书关系。</sub>
</div>
