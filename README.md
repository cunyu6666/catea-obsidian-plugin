# Catea

**The only Obsidian Agent plugin you need.**

[![CI](https://github.com/cunyu6666/catea-obsidian-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/cunyu6666/catea-obsidian-plugin/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/cunyu6666/catea-obsidian-plugin?display_name=tag)](https://github.com/cunyu6666/catea-obsidian-plugin/releases/latest)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](./LICENSE)

[中文](#中文)

Your knowledge should do more than sit in a folder. Catea brings an agent into Obsidian that can read your notes, research the web, write in your vault, and carry what it learns into the next conversation.

Give it an outcome. Shape the work as it happens. Build something worth keeping.

## Put your knowledge to work

- **From a request to real work.** Find connections across notes, draft an article, organize a project, or turn scattered research into a document. Catea can search, create, edit, and organize files inside your vault.
- **An agent that can keep going.** Multi-step execution, working notes, context handoffs, and long-term memory support work that takes more than one reply. You can add direction while it works.
- **Research where you write.** Search the web, read pages, and bring sources into the same conversation as your own material.
- **Your models. Your tools.** Bring an OpenAI- or Anthropic-compatible provider, configure OpenRouter, and extend the agent with Skills and MCP servers.
- **A workspace you want to stay in.** A paper-style editor, streaming conversations, parallel sessions, and light, dark, or system appearance. Everything lives alongside your notes.

Try a task with an outcome:

> Read my project notes, identify the unresolved decisions, and draft a plan for next week.

> Research this topic, compare it with my existing notes, and write a brief with sources.

> Turn these scattered ideas into a first draft. Ask me about the gaps before you fill them in.

Our ambition is simple: make Obsidian the place where your knowledge becomes action. Catea brings the reading, reasoning, research, and writing into one workflow. You bring the direction.

## Get started

Requires **Obsidian desktop 1.8.0 or newer** and access to a compatible model provider.

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/cunyu6666/catea-obsidian-plugin/releases/latest). Place them in `<your-vault>/.obsidian/plugins/catea-paper/`.
2. Enable **Catea** in **Settings → Community plugins**.
3. Open **Catea settings → BYOK models**, add your provider and API key, then open the Catea sidebar and give it a task.

Catea can check for new releases and show an update banner. Automatic checks and a manual check are available in its settings. Building from source? See [Contributing](./CONTRIBUTING.md).

## Your vault. Your choice.

BYOK requires no Catea account and connects directly to your provider. Optional Pro uses email-based subscription billing and a Catea-hosted model endpoint; there is no telemetry. The agent runs inside Obsidian; conversations, memory, and vault settings stay in your vault. On desktops with OS-backed encryption, BYOK models and API keys are encrypted in Obsidian's machine-local data directory and shared across vaults. Existing vault models are imported when opened. If secure encryption is unavailable, models remain vault-local and keys use Obsidian's secret storage when available, otherwise they stay in memory for the current session.

Model requests send relevant prompts, notes, and tool results to your chosen provider. Web search and page reading use Exa, Jina, or DuckDuckGo; enabled MCP servers receive the inputs needed for their tools. GitHub update checks run at most once daily automatically and send no notes or keys. Web search and automatic update checks have separate off switches.

Disclosure: when you open the Catea sidebar, Catea may show a static support message — an optional invitation to leave a GitHub Star — at most once per local calendar month. It lives entirely inside the plugin's own interface, sends nothing over the network, is fully voluntary, and can be turned off in **Settings → Catea → Support prompt**.

The default **Assist** mode asks for approval for file changes and other sensitive actions. **Full access** skips those approvals; Bash commands can access files beyond your vault. See the [security model](./SECURITY.md) for details.

Versions before 0.3.12 created full-vault recovery copies under `.catea/snapshots`.
Current releases use tool-scoped file review instead and remove that obsolete,
plugin-owned snapshot directory on startup to reclaim disk space.

[GPL-3.0](./LICENSE). Built on open-source work including CatUI, ANNO, and Tabler Icons. [Credits and third-party licenses](./THIRD_PARTY_NOTICES.md).

---

## 中文

**唯一一个你需要的 Obsidian Agent 插件。**

你积累的知识，应该成为推动事情前进的力量。Catea 把 Agent 带进 Obsidian：读懂你的笔记，搜索外部资料，直接在知识库中写作，并把学到的东西带进下一次对话。

给它一个目标，在过程中调整方向，把想法推进成值得留下的成果。

### 让知识真正参与工作

- **从一句要求，到实际成果。** 串联笔记、起草文章、整理项目，把零散研究变成完整文档。Catea 可以在知识库中搜索、新建、编辑和整理文件。
- **让复杂任务继续向前。** 多步骤执行、工作笔记、上下文交接和长期记忆，支撑需要持续推进的工作。它执行时，你仍然可以补充要求。
- **研究与写作，在同一个地方。** 搜索网页、阅读资料，把外部来源与你已有的积累放进同一场对话。
- **模型与能力，由你选择。** 接入 OpenAI 或 Anthropic 兼容服务，快速配置 OpenRouter，通过 Skills 和 MCP 扩展 Agent 能做的事。
- **一个愿意长时间使用的工作区。** 纸张式编辑界面、流式对话、并行会话，以及亮色、暗色、跟随系统三种外观。工作就在笔记身边展开。

试着直接交给它一个目标：

> 阅读我的项目笔记，找出还没做出的决定，起草下周的行动计划。

> 研究这个主题，对照我已有的笔记，写一份带来源的简报。

> 把这些零散想法整理成初稿。遇到缺失的信息，先问我。

我们的野心很明确：让 Obsidian 成为知识转化为行动的地方。阅读、思考、研究、写作，由 Catea 串成一条完整的工作流。方向，由你掌握。

### 开始使用

需要 **Obsidian 桌面版 1.8.0 或更新版本**，以及可用的兼容模型服务。

1. 从[最新 Release](https://github.com/cunyu6666/catea-obsidian-plugin/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`，放入 `<你的知识库>/.obsidian/plugins/catea-paper/`。
2. 在 **设置 → 第三方插件** 中启用 **Catea**。
3. 打开 **Catea 设置 → BYOK 模型**，添加模型服务和 API Key，然后打开侧栏，把第一个任务交给它。

Catea 可检查新版本，并在顶部横幅提醒更新。设置中可以关闭自动检查，也可以手动检查。源码构建请参阅[贡献指南](./CONTRIBUTING.md)。

### 你的知识库，你做主

BYOK 无需 Catea 账号，直接连接你配置的模型服务。可选的 Pro 使用邮箱订阅与 Catea 托管模型服务；没有遥测。Agent 在 Obsidian 内运行，对话、记忆和知识库设置保存在当前知识库。若本机支持系统级安全加密，BYOK 模型和 API Key 会加密保存在 Obsidian 的本机数据目录，并在知识库间共享；打开旧知识库时会导入已有模型。若安全加密不可用，模型仍按知识库保存，密钥优先使用 Obsidian 安全存储，否则仅保留在当前会话的内存里。

模型请求会把相关提示词、笔记和工具结果发送给你选择的服务商。网络搜索与网页读取使用 Exa、Jina 或 DuckDuckGo；你启用的 MCP 服务会收到执行工具所需的输入。GitHub 自动更新检查每天最多一次，不发送笔记或密钥。网络搜索与自动检查更新各有独立开关。

披露：打开 Catea 侧栏时，Catea 可能会显示一条静态支持提示——自愿的 GitHub Star 邀请——每个本地日历月最多一次。它只存在于插件自身界面内，不发送任何网络请求，完全自愿，可在**设置 → Catea → 支持提示**中关闭。

默认的「帮我批准」模式会对文件修改等敏感操作请求确认。「完全访问」会跳过这些审批；Bash 命令可以访问知识库之外的文件。详情见[安全说明](./SECURITY.md)。

0.3.12 之前的版本会在 `.catea/snapshots` 生成知识库全量副本。当前版本已改为按工具记录文件变更，并会在启动时删除这个不再使用、由插件创建的旧快照目录，以释放磁盘空间。

采用 [GPL-3.0](./LICENSE) 许可证。感谢 CatUI、ANNO、Tabler Icons 等开源项目。[完整致谢与第三方许可](./THIRD_PARTY_NOTICES.md)。
