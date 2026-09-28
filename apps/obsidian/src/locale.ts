/**
 * [WHO]: Provides Language, contentLabel, translate, pendingReplyText
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/ChatMarkdown.tsx, apps/obsidian/src/main.tsx, apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/locale.ts - Chinese-keyed English string table with translate() and contentLabel() lookups; returns the key unchanged when unmapped
 */
export type Language="zh"|"en"
const english:Record<string,string>={
  "等待你的回答":"Waiting for your answer",
  "模型": "Model",
  "未配置模型": "No models configured",
  "先在设置中配置模型": "Configure a model in Settings",
  "补充要求，会在安全边界接入…": "Add instructions for the next step…",
  "想一起做点什么？": "What shall we work on?",
  "搜索或向 AI 提问…": "Search or ask AI…",
  "继续对话…": "Continue the conversation…",
  "消息": "Message",
  "发送": "Send",
  "移除引用": "Remove quote",
  "当前笔记已开启：发送时附带笔记内容，点击关闭": "Current note on: include its content when sending. Click to turn off.",
  "当前笔记已关闭：点击附带笔记内容": "Current note off: click to include its content when sending.",
  "停止生成": "Stop response",
  "配置 BYOK 模型 →": "Configure BYOK models →",
  "返回对话": "Back to conversation",
  "历史对话": "History",
  "新对话": "New conversation",
  "会话标签": "Conversation tabs",
  "关闭标签": "Close tab",
  "正在生成": "Generating",
  "设置": "Settings",
  "最近对话": "Recent conversations",
  "请先停止当前回复": "Stop the current response first",
  "对话会保存在当前知识库中。": "Conversations are saved in this vault.",
  "读笔记、找线索，把想法慢慢展开。": "Read notes, connect ideas, and explore together.",
  "网络搜索": "Search the web",
  "读取网页": "Read webpage",
  "联网诊断": "Network diagnostics",
  "Agent Reach 命令": "Agent Reach command",
  "当前笔记": "Current note",
  "搜索笔记": "Search notes",
  "打开笔记": "Open note",
  "阅读笔记": "Read note",
  "修改笔记": "Edit note",
  "笔记属性": "Note properties",
  "管理笔记": "Manage notes",
  "Catea 设置": "Catea settings",
  "正在思考": "Thinking",
  "跳到最新消息": "Jump to latest message",
  "排队中": "Queued",
  "下次回复接入": "Included in the next reply",
  "显示 Token 用量": "Show token usage",
  "在每条回复下显示输入、输出和缓存读取的 Token 数。默认关闭。": "Show input, output, and cache read tokens beneath each response. Off by default.",
  "调整纸张界面、Agent 和连接。设置保存在当前知识库中。": "Customize the paper workspace, Agent, and connections. Settings are saved in this vault.",
  "外观": "Appearance",
  "回滚到消息发送前": "Revert to before this message",
  "将恢复知识库文件和对话历史。回滚前会自动保留恢复备份。": "This restores vault files and conversation history. A recovery backup is saved first.",
  "删除新增文件": "Remove added files",
  "恢复修改文件": "Restore changed files",
  "重建已删文件": "Recreate deleted files",
  "知识库文件没有变化；只回退对话历史。": "Vault files are unchanged; only conversation history will be restored.",
  "确认回滚": "Revert",
  "消息操作": "Message actions",
  "从此处分支": "Branch from here",
  "回滚到发送前": "Revert to before sending",
  "思考过程": "Thinking details",
  "查看操作": "View actions",
  "工具详情": "Tool details",
  "填写其他回答": "Enter another answer",
  "提交回答": "Submit answers",
  "下一题": "Next",
  "上一题": "Previous",
  "取消回答": "Dismiss",
  "预览": "Preview",
  "回复": "Response",
  "复制": "Copy",
  "已复制": "Copied",
  "展开": "Expand",
  "正在回复": "Responding",
  "正在踩奶…": "Making biscuits…",
  "正在舔爪…": "Grooming paws…",
  "正在甩尾巴…": "Swishing tail…",
  "正在扒拉键盘…": "Pawing at keys…",
  "来源": "Sources",
  "启用纸张界面": "Enable paper appearance",
  "格式工具栏": "Formatting toolbar",
  "Tabler 图标": "Tabler icons",
  "隐藏正文属性": "Hide note properties",
  "隐藏导航栏": "Hide ribbon",
  "隐藏状态栏": "Hide status bar",
  "启用 Agent": "Enable Agent",
  "网络搜索与网页读取": "Web search and fetch",
  "网页搜索使用 Exa / Jina / DuckDuckGo；可诊断并经确认调用已安装的 Agent Reach。搜索词和目标 URL 会发送到联网服务。": "Web search uses Exa / Jina / DuckDuckGo. An installed Agent Reach can be diagnosed and called with confirmation. Queries and URLs are sent to network services.",
  "长期记忆": "Long-term memory",
  "自动提取、召回和巩固；保存在当前知识库 .catea/memory。": "Automatically extract, recall, and consolidate memories in this vault's .catea/memory directory.",
  "终端工具": "Terminal tools",
  "默认关闭；开启后每条命令仍需确认。": "Off by default. Each command requires confirmation when enabled.",
  "BYOK 模型": "BYOK models",
  "使用自己的 API Key，直接连接 OpenAI / Anthropic 兼容服务。仅显示你配置的模型。": "Use your own API key with OpenAI / Anthropic compatible services. Only configured models appear.",
  "OpenAI 兼容": "OpenAI compatible",
  "Anthropic 兼容": "Anthropic compatible",
  " · 请补充 API Key": " · API key required",
  "编辑": "Edit",
  "移除": "Remove",
  "模型移除失败，请重试": "Could not remove model. Try again.",
  "添加模型": "Add model",
  "Obsidian 操作 · 内置": "Obsidian tools · Built in",
  "随 Agent 启用：当前笔记、搜索、内部打开、阅读、编辑与属性管理；写入和设置变更需确认。": "Available with Agent: current note, search, open inside Obsidian, read, edit, and manage properties. Writes and setting changes require confirmation.",
  "将 Skill 文件夹放到 .catea/skills/<名称>/SKILL.md，再启用。": "Place skills at .catea/skills/<name>/SKILL.md, then enable them here.",
  "连接方式": "Transport",
  "本地 stdio": "Local stdio",
  "服务器地址": "Server URL",
  "可执行程序": "Executable",
  "参数（JSON 数组）": "Arguments (JSON array)",
  "移除 MCP": "Remove MCP",
  "添加 MCP": "Add MCP",
  "编辑 BYOK 模型": "Edit BYOK model",
  "添加 BYOK 模型": "Add BYOK model",
  "显示名称": "Display name",
  "协议": "Protocol",
  "API 地址": "API URL",
  "模型 ID": "Model ID",
  "上下文窗口（tokens）": "Context window (tokens)",
  "按模型实际上限填写；用于自动提示交接，默认 128000。": "Enter the model's actual limit for context handoff. Default: 128000.",
  "优先保存到 Obsidian 安全存储；不可用时仅本次运行有效，不写入 .catea。": "Saved in Obsidian secure storage when available; otherwise kept for this session only. Never written to .catea.",
  "取消": "Cancel",
  "保存模型": "Save model",
  "请检查配置": "Check your configuration",
  "保存失败，请重试": "Could not save. Try again.",
  "添加到 Catea": "Add to Catea",
  "拒绝": "Decline",
  "确认这一次": "Allow once",
  "打开 Agent": "Open Agent",
  "查看记忆概览": "View memory insights",
  "记忆概览": "Memory insights",
  "Catea Agent 需要桌面文件系统": "Catea Agent requires the desktop filesystem",
  "当前版本无安全密钥存储；密钥仅保留到本次退出": "Secure key storage is unavailable. Keys are kept for this session only.",
  "密钥无法持久保存，仅在当前运行期间使用": "Could not save the key securely. It will be used for this session only.",
  "请回答所有问题": "Please answer every question",
  "用户取消回答；不要假定答案或重复询问": "The user dismissed the question. Do not assume an answer or ask again."
}
Object.assign(english,{"更多文件操作": "More file actions", "纸张格式工具栏": "Formatting toolbar", "撤销": "Undo", "重做": "Redo", "段落样式": "Paragraph style", "正文": "Text", "正文 ▾": "Text ▾", "标题 1": "Heading 1", "标题 2": "Heading 2", "标题 3": "Heading 3", "加粗": "Bold", "斜体": "Italic", "删除线": "Strikethrough", "高亮": "Highlight", "无序列表": "Bulleted list", "有序列表": "Numbered list", "任务列表": "Task list", "引用": "Quote", "内部链接": "Internal link", "行内代码": "Inline code", "更多格式": "More formatting", "代码块": "Code block", "显示 / 隐藏笔记属性": "Show / hide note properties", "请填写显示名称、模型 ID 和 API Key": "Enter a display name, model ID, and API key", "请选择支持的协议": "Select a supported protocol", "上下文窗口需为 4096 至 2000000 的整数": "Context window must be an integer from 4096 to 2000000", "请输入有效的 API 地址": "Enter a valid API URL", "API 地址应为 HTTP(S) 基础地址，不包含账号、查询参数或片段": "Use an HTTP(S) base URL without credentials, query parameters, or fragments"})
export function translate(language:Language,text:string){return language==="en"?(english[text]||text):text}

const contentLabels:Record<string,[string,string]>={"copyCode": ["复制代码", "Copy code"], "copiedResponse": ["已复制", "Copied"], "plainText": ["纯文本", "Plain text"], "writingCode": ["正在编写", "Writing"], "viewDiagramFullscreen": ["全屏查看图表", "View diagram fullscreen"], "closeDialog": ["关闭", "Close"], "mermaidDiagram": ["Mermaid 图表", "Mermaid diagram"], "zoomOut": ["缩小", "Zoom out"], "zoomIn": ["放大", "Zoom in"], "zoomPresets": ["缩放比例", "Zoom presets"], "zoomToFit": ["适应窗口", "Fit to window"], "resetZoom": ["重置视图", "Reset view"], "copyDiagramSource": ["复制图表源码", "Copy diagram source"]}
export function contentLabel(language:Language,key:string){return contentLabels[key]?.[language==="en"?1:0]||key}

Object.assign(english,{
 '默认开启，命令执行遵循下方权限模式。':'Enabled by default. Commands follow the permission mode below.',
 '权限模式':'Permissions','帮我批准':'Help me approve','完全访问':'Full access',
 '帮我批准：自动放行 pwd、ls 等简单目录查看，其余操作请求确认。完全访问：跳过 Bash、文件修改、MCP 和记忆更新的审批，命令可访问知识库之外。':'Help me approve: automatically allow simple directory inspection (pwd and ls); ask for other actions. Full access: skip approvals for Bash, file changes, MCP, and memory updates. Commands can access files outside the vault.'
})

Object.assign(english,{'删除':'Delete','删除会话':'Delete conversation'})

Object.assign(english,{
 '添加附件或粘贴图片':'Attach files or paste an image','添加文件夹':'Attach vault folder','选择知识库文件夹':'Choose a vault folder','文件夹':'Folder','文件':'File','放下以添加文件':'Drop files to attach','放下以添加文件或文件夹':'Drop files or folders here','文件夹不会批量上传，请通过添加菜单选择知识库文件夹。':'Folders are referenced instead of uploaded. Choose a vault folder from the attachment menu.','移除附件':'Remove attachment','正在读取附件…':'Reading attachments…','请查看这些附件':'Please review these attachments',
 '个附件未导入：隐藏文件、读取失败或超过限制（单个 10 MB、合计 32 MB、64 个文件）。':'attachments skipped: hidden files, read failures, or limits exceeded (10 MB each, 32 MB total, 64 files).'
})

Object.assign(english,{'附件已保留：当前 M2 模型不支持图片或二进制文档，请切换支持该附件的模型。':'Attachments kept: this M2 model cannot read images or binary documents. Choose a model supporting these attachments.'})
Object.assign(english,{'附件已保留：当前模型不支持此类图片或二进制文档，请切换支持该附件的模型。':'Attachments kept: the selected model cannot read this image or binary document. Choose a model that supports it.'})

Object.assign(english,{'添加附件':'Add attachment','添加文件':'Add files','选区操作':'Selection actions'})

Object.assign(english,{'笔记缩略图':'Note thumbnails','文件树显示真实标题、正文和首张本地图片的缩略预览。':'Preview note titles, content, and the first local image in the file tree.'})
Object.assign(english,{'人格':'Persona','选择 Agent 的对话风格；从下一条消息开始使用。':'Choose the Agent’s conversation style. Applies from the next message.'})
Object.assign(english,{'附带当前笔记':'Include current note','发送消息时将当前笔记内容加入上下文。默认开启。':'Include the current note in messages sent to the model. On by default.'})
Object.assign(english,{
  '添加 OpenRouter':'Add OpenRouter',
  '添加其他模型':'Add another model',
  '只需 API Key；选择 Free 自动路由，或填写模型 ID。':'Enter an API key, then choose Free routing or a model ID.',
  '配置 OpenRouter':'Configure OpenRouter',
  '创建 OpenRouter API Key ↗':'Create an OpenRouter API key ↗',
  '模型选择':'Model choice',
  'Free 自动路由':'Free automatic routing',
  '指定模型 ID':'Specific model ID',
  '例如 openai/gpt-oss-120b:free；从 OpenRouter 模型页复制完整 ID。':'For example, openai/gpt-oss-120b:free. Copy the full ID from OpenRouter’s model page.',
  '在 OpenRouter 创建 Key；优先保存到 Obsidian 安全存储，不写入知识库配置。':'Create a key at OpenRouter. Catea prefers Obsidian secure storage and never writes it to the vault config.',
  'Free 会自动选择可用的免费模型；可用性、工具支持和请求限额由 OpenRouter 决定。笔记内容会发送给 OpenRouter 及其选定的模型提供方。':'Free automatically chooses an available free model. OpenRouter controls availability, tool support, and limits. Note content is sent to OpenRouter and its selected model provider.',
  '保存并使用':'Save and use',
  '请填写 OpenRouter 模型 ID，或选择 Free':'Enter an OpenRouter model ID or choose Free.',
  'OpenRouter 模型 ID 应为 provider/model 格式':'Use a provider/model OpenRouter model ID.'
})

Object.assign(english,{"请先选中回复中的文字":"Select text in the reply first","回复批注":"Reply annotation","引用选中内容并批注":"Annotate selected text"})

Object.assign(english,{"批注内容":"Annotation","针对这段回复写下你的问题或意见…":"Write a question or comment about this passage…","添加批注":"Add annotation"})
Object.assign(english,{"请按批注继续":"Please respond to these annotations"})

Object.assign(english,{"引用批注":"Annotate"})

// UI-only acknowledgements: never added to the model transcript or saved as replies.
const replyAcknowledgements = [
  [
    "明白你的诉求，让我探索一下。",
    "Got it. Let me take a closer look."
  ],
  [
    "收到，让我先理一理思路。",
    "Got it. Let me organize my thoughts."
  ],
  [
    "好的，让我仔细看看你的问题。",
    "Okay, let me look carefully at your question."
  ],
  [
    "明白，我先梳理一下重点。",
    "Understood. Let me work through the key points."
  ],
  [
    "收到，我会从你的需求出发来考虑。",
    "Got it. I'll start with what you need."
  ],
  [
    "好的，给我一点时间把思路整理清楚。",
    "Okay, give me a moment to think this through."
  ],
  [
    "让我先理解上下文，再给你回复。",
    "Let me understand the context before replying."
  ],
  [
    "明白，让我想想怎样回答更有帮助。",
    "Understood. Let me think about the most helpful response."
  ],
  [
    "收到，我先把问题拆开看看。",
    "Got it. Let me break the question down."
  ],
  [
    "好的，让我从关键的地方开始。",
    "Okay, let me start with what matters most."
  ],
  [
    "让我仔细考虑一下，再和你展开。",
    "Let me give this some thought before we go further."
  ],
  [
    "明白，我先看看有哪些需要留意的细节。",
    "Understood. Let me consider the details that matter."
  ],
  [
    "收到，让我把相关思路串起来。",
    "Got it. Let me connect the relevant ideas."
  ],
  [
    "好的，我先想想合适的切入点。",
    "Okay, let me find a useful starting point."
  ],
  [
    "让我先抓住重点，再一步步展开。",
    "Let me identify the key points, then work through them."
  ],
  [
    "明白，让我把你的要求逐项理清。",
    "Understood. Let me work through your requirements."
  ],
  [
    "收到，我会先考虑你最关心的部分。",
    "Got it. I'll start with what matters most to you."
  ],
  [
    "好的，让我先看看问题的脉络。",
    "Okay, let me get a sense of the bigger picture."
  ],
  [
    "让我想一想，怎样把这件事讲清楚。",
    "Let me think about how to explain this clearly."
  ],
  [
    "明白，我先整理一个清晰的回答思路。",
    "Understood. Let me shape a clear response."
  ],
  [
    "收到，让我从几个角度考虑一下。",
    "Got it. Let me consider a few perspectives."
  ],
  [
    "好的，我先留意一下可能遗漏的地方。",
    "Okay, let me think about what might be missing."
  ],
  [
    "让我把你的目标和细节一起考虑。",
    "Let me consider both your goal and the details."
  ],
  [
    "明白，让我先分清主要问题和补充信息。",
    "Understood. Let me separate the main question from the supporting details."
  ],
  [
    "收到，我先想想下一步怎么推进。",
    "Got it. Let me think about the next step."
  ],
  [
    "好的，让我先把思路铺开。",
    "Okay, let me explore the possibilities."
  ],
  [
    "让我围绕你的问题仔细想一想。",
    "Let me give your question a closer look."
  ],
  [
    "明白，我先考虑一下怎样更贴近你的需求。",
    "Understood. Let me think about what would best fit your needs."
  ],
  [
    "收到，让我看看各个要点之间的联系。",
    "Got it. Let me consider how the points connect."
  ],
  [
    "好的，我先整理需要回应的几个部分。",
    "Okay, let me organize the parts that need a response."
  ],
  [
    "让我先想清楚重点，再给你展开说明。",
    "Let me clarify the main points before explaining."
  ],
  [
    "明白，让我考虑一下不同的可能性。",
    "Understood. Let me consider the different possibilities."
  ],
  [
    "收到，我先从你提供的信息入手。",
    "Got it. I'll start with the information you've shared."
  ],
  [
    "好的，让我把这件事的前后关系理一理。",
    "Okay, let me think through how this fits together."
  ],
  [
    "让我先看看什么对你最有用。",
    "Let me think about what would be most useful to you."
  ],
  [
    "明白，我先把复杂的部分拆小一些。",
    "Understood. Let me break the complex parts into smaller pieces."
  ],
  [
    "收到，让我想想有哪些值得说明的地方。",
    "Got it. Let me consider what needs explanation."
  ],
  [
    "好的，我会带着你的目标来整理思路。",
    "Okay, I'll organize my thoughts with your goal in mind."
  ],
  [
    "让我先仔细理解，再组织回复。",
    "Let me understand this carefully, then put a response together."
  ],
  [
    "明白，让我看看怎样让回答更具体。",
    "Understood. Let me think about how to make the answer more concrete."
  ],
  [
    "收到，我先想想有哪些关键区别。",
    "Got it. Let me consider the key distinctions."
  ],
  [
    "好的，让我先捋顺这几个要点。",
    "Okay, let me work through these points."
  ],
  [
    "让我把注意力放在你提出的核心问题上。",
    "Let me focus on the core question you've raised."
  ],
  [
    "明白，我先考虑一下回答的顺序。",
    "Understood. Let me think about the best order to explain this."
  ],
  [
    "收到，让我把细节和整体一起看看。",
    "Got it. Let me consider the details alongside the bigger picture."
  ],
  [
    "好的，我先想想怎样把建议说得更明确。",
    "Okay, let me think about how to make the guidance clearer."
  ],
  [
    "让我先整理一下，再接着和你聊。",
    "Let me gather my thoughts before continuing."
  ],
  [
    "明白，让我沿着你的思路再往前想一步。",
    "Understood. Let me take your idea a step further."
  ],
  [
    "收到，我先认真考虑一下你的提问。",
    "Got it. Let me give your question some careful thought."
  ],
  [
    "好的，让我把要点理清后再回复你。",
    "Okay, let me sort through the key points before replying."
  ]
] as const
Object.assign(english,Object.fromEntries(replyAcknowledgements))

// The random message UUID seeds a stable choice across renders, tabs and remounts.
export function pendingReplyText(messageId:string,language:Language="zh"):string {
  let hash=2166136261
  for(let i=0;i<messageId.length;i++)hash=Math.imul(hash^messageId.charCodeAt(i),16777619)
  return translate(language,replyAcknowledgements[(hash>>>0)%replyAcknowledgements.length][0])
}
