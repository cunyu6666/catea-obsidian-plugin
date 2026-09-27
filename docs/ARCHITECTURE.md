# Catea Agent 架构与实现状态

状态：第一版源码已接线；未安装依赖、未构建、未做类型检查或运行测试，未替换当前已安装的 Catea Paper 0.2.6。

## 需求映射

| 要求 | 当前实现 |
| --- | --- |
| CatUI 标准 loop + ANNO provider | 固定版本标准 loop 源码、工具校验与调度、停止恢复、运行中补充要求；原始 journal 与新版模型交接 |
| CatUI 工具 | read/write/edit/ls/find/grep/bash/time，以及问用户工具；终端默认关闭，修改与终端操作逐次确认 |
| Skills / MCP | .catea/skills 的显式启用、资源读取；MCP SDK 的 HTTP / stdio、工具发现、会话复用及关闭 |
| Persona | Vex / Aria / Pencil，来源 ANNO。用户所称 arial 对应现有 Aria |
| 完整记忆核心 | CatUI mem-core 完整源码快照；分层召回、工作/情节/语义/程序记忆、关联、强化、遗忘、归档恢复、冲突解决、巩固与洞察 |
| UI / 设计系统 | 独立 catea-design-system workspace，tokens/components/showcase；ANNO Composer / StreamingChatResponse / AgentActivities / ApprovalCard，Tabler 图标 |

## ADR 001：直接进程内 loop

选择：Obsidian 宿主直接执行 loop，通过 Node HTTP(S) 流式调用模型。没有 CatUI ACP 子进程，也没有中转服务器。
原因：缩短 UI 到首 token 的链路，复用 ANNO 的 provider 协议映射。磁盘持久化节流，记忆抽取放到回复结束后。
权衡：网络、工具生命周期由插件管理；目前尚未测量首 token 或全轮耗时，不能宣称已比 CatUI 快。

## ADR 002：保留 CatUI 记忆核心，替换宿主适配

保留 mem-core 源码而非简化成一张记忆表。明确 memoryDir 优先于 CatUI 全局环境变量，防止写到 ~/.nanomem。
.catea/memory/global 与各 Persona 子目录隔离。会话结束将提取任务入持久队列，逐阶段记录进度；失败保留错误和退避时间，重启后继续处理。
召回在首 token 路径最多等待 600ms；超时使用该 Persona 的已有缓存，后台刷新。巩固、归档在队列里串行执行。
引擎和 NanoMem extension 生命周期源码一起复用；通过 MemoryHost 注入知识库、Persona、结构化 BYOK 和事件，没有嵌入 CatUI TUI。
权衡：自动记忆提取可能产生额外模型调用；引擎为 GPL-3.0，保留许可与来源信息。不是向已有 ~/.catui 目录迁移数据，现有 CatUI 记忆未读取或更改。

## ADR 003：独立设计系统 monorepo

catea-design-system 有自己的 package.json / workspaces：packages/tokens、packages/components、apps/showcase。
业务主仓只消费组件接口，不在组件内导入 Obsidian、文件系统、模型或记忆。此处参考 qoder-loop 的组件包与 showcase 分离方式。
两个目录目前仍位于用户的 vault 仓库下；没有擅自新建远程 Git 仓库。可独立版本化与迁出。

## 运行目录

```text
.catea/
  config.json              # 模型元数据、开关、MCP 配置；不含 API Key / Token
  sessions/index.json
  sessions/<id>.json       # 原始对话与工具 transcript
  skills/<id>/SKILL.md
  memory/pending-turns.json
  memory/global/
  memory/aria/
  memory/vex/
  memory/pencil/
```

密钥使用 Obsidian secretStorage；不可用时只在内存中使用，界面明确提示不能持久化。Shell 默认关闭；开启后每条命令显示工作目录及原命令，明确它不是沙箱。MCP stdio 在首次对话发现工具时启动用户启用的配置，所有 MCP 工具调用逐次确认。

## 发布前验收（尚未执行）

1. 构建插件并在测试 vault 加载；确认原纸张总开关恢复、独立 Agent 开关、面板卸载与弹窗取消。
2. OpenAI 兼容 / Anthropic 各做一轮流式文本及多步工具调用；在模型响应、工具、确认弹窗阶段分别取消。
3. read/write/edit 的路径越界、符号链接、确认期间文件变化、raw/ 保护与 log 只追加。
4. MCP HTTP 与 stdio 的初始化、分页工具发现、错误响应、进程退出、重新配置与拒绝调用。
5. Skill 的启用、相对资源读取、禁用与越界；三个 Persona 切换、当前笔记勾选与长文件截断。
6. 记忆提取/召回/工作/情节/巩固/遗忘/冲突/恢复，与 CatUI 相同样例对照；重启恢复、队列重试、关闭开关取消。
7. 固定同一个模型、输入与工具，对 ANNO/CatUI/Catea 测量首 token、工具周转和整轮耗时。

## 2026-09-27 实机验收补充

- CatUI 标准 loop 源码及 AI 支撑模块 24 个文件逐字节核对原始提交，指纹见 agent-core/upstream/SOURCE_HASHES.json。
- MiniMax 在 Obsidian 实际调用 time → working_notes write → session_history list → AskUserQuestion；选择并提交后成功继续回复。
- 实际 SSE delivery 记录显示 7 个文本增量，首文本约 2.4 秒、该次响应约 4.6 秒；这是单次实测，不是吞吐性能承诺。
- 分段合成历史会话执行 new_context，在完整工具结果之后生成 context-window checkpoint。后续请求输入从 27078 降到 16754 tokens；session_history search 返回早期原始 user 记录，windows 返回 1 个窗口；全部 31 条原始 transcript 记录仍保留。
- 单条超大历史记录的例子按上游安全保留策略延期交接，未切断记录。accepted 表示请求入队，不等于已切换，最终以窗口记录为准。
- 多轮后台记忆队列完成、持久化 episode 且队列清空。复杂冲突、遗忘、归档恢复算法复用上游，未在本次真实知识库中逐项制造数据进行破坏性验证。
- 未运行 typecheck、单元测试或全量测试套件。构建用于实际插件交付。
