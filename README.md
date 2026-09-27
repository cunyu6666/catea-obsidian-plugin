# Catea

Catea Paper 的 Agent 版源码 monorepo，目标版本 0.3.0。2026-09-27 已按用户要求打包并安装 0.3.0 到当前 Obsidian，停用 CatUI ACP；原插件备份保存在用户 Library/Application Support/Catea/backups。

目录：apps/obsidian 是宿主与右侧 UI；packages/agent-core 是 loop 和 provider；packages/integrations 是 vault 工具、Skills、MCP；packages/memory 是 CatUI 记忆核心与适配；packages/personas 仅含 Vex、Aria、Pencil。
设计组件与 Token 位于相邻的 catea-design-system 独立 workspace。源码以相对 file 依赖引用，不依赖 ANNO 或 CatUI 的本地绝对路径。

详细决策、数据布局和待验收项见 docs/ARCHITECTURE.md。

## 构建与安装

本次用户要求启动实测，已执行必要的依赖安装和 npm run build；未运行 typecheck 或单元测试。首次准备先在相邻 catea-design-system 目录安装其依赖；后续在本目录运行 npm run build，会同时调用独立设计系统的 Tailwind 编译器。输出为 dist/catea-paper。这个命令仅产生输出，不自动覆盖已安装插件。

正式替换前需要完成测试 vault 验收。安装时沿用插件 id catea-paper，保留原外观设置。无需 CatUI；也不会自动停用旧 CatUI、迁移旧会话或复制其密钥。

首次使用通过 Catea 设置添加模型、Key 和协议，侧栏点击 Catea Agent。Keys 优先保存在 Obsidian 安全存储，不可用时仅当前运行有效。MCP 在设置中显式启用，Skills 放入 .catea/skills。Agent 的完整本地会话与记忆可能包含私人笔记，不应作为插件分发文件。

## 来源

ANNO：provider、输入框、回复卡片、活动组件与 Persona。CatUI：mem-core。qoder-loop：设计系统与 showcase 分离结构参考。来源与许可见 THIRD_PARTY_NOTICES.md。

## BYOK

按 ANNO 的模型配置流程实现：添加或编辑时使用独立草稿，取消不修改配置；保存前校验显示名称、模型 ID、API Key 和 HTTP(S) 基础地址。支持 OpenAI 与 Anthropic 兼容协议，切换协议时填入对应默认 API 地址，可替换为自己的兼容服务地址。

侧栏仅列出完整配置的模型，记住上次选择；所选模型删除或不可用时回退到首个完整配置。缺少 Key 时引导回设置补齐。没有预置模型列表，也不需要 CatUI 账号或服务。请求沿用 ANNO provider，通过本地传输直接发送到配置地址。

与 ANNO 浏览器宿主的区别：Obsidian 不使用 Chrome 的站点授权流程；模型元数据写入 .catea/config.json，API Key 不写入该文件，使用宿主安全存储（不可用时只保留在内存）。已安装并进行 MiniMax 实机验证。Node 证书链失败时回退到 Obsidian 宿主请求接口，保持 TLS 校验；优先尝试 Electron 的宿主流式接口；仅宿主流式不可用时才回退到缓冲响应。

## 网络搜索

Agent 的 web_search / web_fetch 适配自 CatUI link-world。搜索优先使用内置 Exa 公共 MCP 接口，再检查 agent-reach 是否提供 search 子命令；不可用时使用 Jina Search → DuckDuckGo HTML → Instant Answer。网页读取使用可用的 agent-reach fetch 或 Jina Reader → 网页直接读取。无需安装 agent-reach / mcporter，也不会自动安装它们。Exa 匿名服务有限流，失败时继续回退。设置中可关闭联网；不复用模型 Key 给搜索服务。返回的来源可在回复卡片展开，公共网页内容按不可信资料处理。搜索服务限流或要求 Key 时会继续尝试下一提供方，全部失败则明确报错。

实机验证：在 Obsidian 中由 MiniMax 调用 web_search，经 Exa 获得两条 Obsidian 搜索结果，再由 web_fetch 读取官网正文并完成带链接的回答。检索与正文读取均未调用 agent-reach 命令。

## 内置 Obsidian 操作

Agent 自动加载 `obsidian-workspace` Skill，无需安装。原生工具支持当前笔记与选区、标题/正文/标签/属性搜索、在 Obsidian 内打开标签页或分栏、分段阅读、唯一匹配编辑、新建、移动及回收站删除。写入前显示确认，并检查内容是否在确认期间变化。`raw/` 禁止写入，`wiki/log.md` 仅追加。

设置工具仅支持 Catea 的 toolbar、tablerIcons、hideProperties、hideRibbon、hideStatus、web、memory 布尔开关；不开放任意 Obsidian 配置、密钥和插件管理。修改需要确认。

## CatUI loop、上下文交接与 ANNO 交互

直接运行固定源码版本的 CatUI 标准 agentLoop：工具参数校验、只读并发、停止与工具结果补齐、运行中补充要求、输出上限恢复和重复无进展检测。调用预算沿用上游默认 256 轮 / 512 次工具调用。供应商继续使用 ANNO BYOK 适配，不启动 CatUI 进程。

上下文采用 `session_history`、`working_notes`、`new_context`：原始记录完整保留在会话 journal；模型提交交接文本，完成工具批次后才切换窗口。保留最近工具链与最新用户请求，工作笔记可跨窗口/重启恢复。没有调用旧的 LLM 压缩/摘要流程，也不再超限后静默只保留最后一轮。实际模型窗口可在 BYOK 设置填写。

流式回复复用 ANNO StreamingChatResponse（平滑增量、滚动跟随、停止直接显示、减少动态效果偏好），网络层保留真正 SSE。AskUserQuestion 复用 ANNO 的参数校验和 ApprovalCard，支持 1–4 题、单选/多选、自定义文字、预览、返回、提交与取消；等待明确提交才继续。

NanoMem 复用上游 extension 的召回、结构化提取、工具观察、episode 与自动 dream 生命周期。任务异步持久排队，Obsidian 原生工具映射到观察记录。详见 packages/memory/UPSTREAM.md 与 packages/agent-core/UPSTREAM.md。
