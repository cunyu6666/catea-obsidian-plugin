/**
 * [WHO]: Provides Language, contentLabel, humanizeError, translate, pendingReplyText
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/ChatMarkdown.tsx, apps/obsidian/src/main.tsx, apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/locale.ts - Chinese-keyed English strings, error wording and waiting acknowledgements; returns unknown labels unchanged
 */
export type Language = 'zh' | 'en'
const english: Record<string, string> = {
  视频生成: 'Video generation',
  语音合成: 'Speech synthesis',
  启用视频生成: 'Enable video generation',
  启用语音合成: 'Enable speech synthesis',
  '视频 API 地址': 'Video API URL',
  视频模型名: 'Video model name',
  '视频 API Key': 'Video API key',
  '音频 API 地址': 'Audio API URL',
  音频模型名: 'Audio model name',
  '音频 API Key': 'Audio API key',
  语音音色: 'Speech voice',
  生成视频: 'Generate video',
  合成语音: 'Generate speech',
  生成的视频: 'Generated video',
  生成的音频: 'Generated audio',
  '使用 DashScope 异步视频接口，保存 MP4 并在对话中播放。停止等待不会取消云端任务。':
    'Use the asynchronous DashScope video API, save an MP4 and play it in chat. Stopping polling does not cancel the remote task.',
  '使用 DashScope 语音合成接口，保存 MP3 并在对话中播放。':
    'Use the DashScope speech API, save an MP3 and play it in chat.',

  图像生成: 'Image generation',
  生成图片: 'Generate image',
  启用生图工具: 'Enable image generation',
  '使用独立模型生成图片，保存到 Attachments/Catea，并在对话中预览。':
    'Generate images with a separate model, save them in Attachments/Catea and preview them in chat.',
  生图协议: 'Image API protocol',
  '阿里云 DashScope': 'Alibaba Cloud DashScope',
  '生图 API 地址': 'Image API URL',
  生图模型名: 'Image model name',
  '生图 API Key': 'Image API key',
  '密钥保存在 Obsidian 安全存储；不支持时仅在本次会话内使用。':
    'The key is held in Obsidian secure storage, or only in memory when secure storage is unavailable.',
  生成的图片: 'Generated image',

  '无法保存文件夹图标，请重试。': 'Could not save the folder icon. Please try again.',
  '文件夹已不存在。': 'The folder no longer exists.',
  恢复默认: 'Reset to default',
  棕色: 'Brown',
  金色: 'Gold',
  橙色: 'Orange',
  红色: 'Red',
  粉色: 'Pink',
  紫色: 'Purple',
  蓝色: 'Blue',
  青色: 'Teal',
  森林绿: 'Forest',
  灰绿: 'Sage',
  盆栽: 'Plant',
  烧瓶: 'Flask',
  地球: 'Globe',
  档案盒: 'Archive box',
  灯泡: 'Light bulb',
  调色盘: 'Palette',
  耳机: 'Headphones',
  相机: 'Camera',
  公文包: 'Briefcase',
  书本: 'Book',
  颜色: 'Color',
  图标: 'Icon',
  保存: 'Save',
  自定义文件夹图标: 'Customize folder icon',
  '已清理旧版 Catea 全量快照，释放知识库空间':
    'Removed obsolete full-vault Catea snapshots to reclaim vault space',
  '旧版 Catea 快照清理失败，可手动删除 .catea/snapshots':
    'Could not remove obsolete Catea snapshots. You can delete .catea/snapshots manually',
  '如果 Catea 对你有一点帮助': 'If Catea has been a little helpful',
  'Catea 仍在持续打磨。如果它恰好对你的写作或整理有所帮助，愿意的话，可以去 GitHub 点一颗 Star。':
    'Catea is still being carefully improved. If it has helped with your writing or organization, you are welcome to leave a Star on GitHub.',
  '这会让更多人看到项目，也给维护带来一点鼓励。完全自愿，关闭即可继续使用。':
    'It helps more people discover the project and gives its maintenance a little encouragement. It is entirely optional; close this dialog to continue.',
  暂时不用: 'Not now',
  '前往 GitHub': 'Open GitHub',
  支持提示: 'Support prompt',
  '打开 Catea 侧栏时偶尔显示一条项目支持信息，每个本地月最多一次；关闭后不再显示。':
    'Occasionally shows a note about supporting the project when the Catea sidebar opens, at most once per local calendar month. Nothing is shown once this is off.',
  刷新: 'Refresh',
  关闭: 'Close',
  'Git 历史': 'Git history',
  '打开 Git 历史': 'Open Git history',
  知识库历史: 'Vault history',
  '本地 Git 时间线': 'Local Git timeline',
  '在右侧栏显示知识库的本地 Git 时间线。默认关闭，不执行提交或同步。':
    'Show local Git history in the right sidebar. Off by default; never commits or syncs.',
  '在设置中开启 Git 历史以查看时间线。': 'Enable Git history in Settings to view the timeline.',
  '未找到 Git，请安装 Git 后重启 Obsidian。':
    'Git was not found. Install Git and restart Obsidian.',
  '当前知识库不在 Git 仓库中。': 'This vault is not in a Git repository.',
  '无法读取 Git 历史，请检查仓库权限或稍后重试。':
    'Cannot read Git history. Check repository permissions or try again later.',
  '知识库还没有提交记录。': 'No commits in this vault yet.',
  '正在读取 Git 历史…': 'Reading Git history…',
  '正在读取提交详情…': 'Reading commit details…',
  '无法读取提交详情，请稍后重新选择。':
    'Cannot read commit details. Select the commit again later.',
  '分支图暂不可用，以下为提交列表。':
    'The branch graph is unavailable. Commit history is shown below.',
  无提交说明: 'No commit message',
  加载更早的提交: 'Load earlier commits',
  '已显示最近 1000 条提交。': 'Showing the latest 1,000 commits.',
  缩小编辑器文字: 'Decrease editor text size',
  放大编辑器文字: 'Increase editor text size',
  恢复编辑器文字大小: 'Reset editor text size',
  等待你的回答: 'Waiting for your answer',
  模型: 'Model',
  未配置模型: 'No models configured',
  先在设置中配置模型: 'Configure a model in Settings',
  '补充要求，会在安全边界接入…': 'Add instructions for the next step…',
  '想一起做点什么？': 'What shall we work on?',
  '搜索或向 AI 提问…': 'Search or ask AI…',
  '继续对话…': 'Continue the conversation…',
  继续刚才的任务: 'Continue the previous task',
  消息: 'Message',
  发送: 'Send',
  移除引用: 'Remove quote',
  '当前笔记已开启：发送时附带笔记内容，点击关闭':
    'Current note on: include its content when sending. Click to turn off.',
  '当前笔记已关闭：点击附带笔记内容':
    'Current note off: click to include its content when sending.',
  停止生成: 'Stop response',
  '配置 BYOK 模型 →': 'Configure BYOK models →',
  返回对话: 'Back to conversation',
  历史对话: 'History',
  新对话: 'New conversation',
  会话标签: 'Conversation tabs',
  关闭标签: 'Close tab',
  正在生成: 'Generating',
  设置: 'Settings',
  最近对话: 'Recent conversations',
  请先停止当前回复: 'Stop the current response first',
  '对话会保存在当前知识库中。': 'Conversations are saved in this vault.',
  '读笔记、找线索，把想法慢慢展开。': 'Read notes, connect ideas, and explore together.',
  网络搜索: 'Search the web',
  读取网页: 'Read webpage',
  联网诊断: 'Network diagnostics',
  'Agent Reach 命令': 'Agent Reach command',
  当前笔记: 'Current note',
  搜索笔记: 'Search notes',
  打开笔记: 'Open note',
  阅读笔记: 'Read note',
  修改笔记: 'Edit note',
  笔记属性: 'Note properties',
  管理笔记: 'Manage notes',
  'Catea 设置': 'Catea settings',
  正在思考: 'Thinking',
  跳到最新消息: 'Jump to latest message',
  排队中: 'Queued',
  下次回复接入: 'Included in the next reply',
  '显示 Token 用量': 'Show token usage',
  输入: 'Input',
  输出: 'Output',
  缓存命中: 'Cache hit',
  '在每条回复下显示输入、输出和缓存命中的 Token 数。默认关闭。':
    'Show input, output, and cache hit tokens beneath each response. Off by default.',
  '调整纸张界面、Agent 和连接。设置保存在当前知识库中。':
    'Customize the paper workspace, Agent, and connections. Settings are saved in this vault.',
  外观: 'Appearance',
  消息操作: 'Message actions',
  从此处分支: 'Branch from here',
  文件更改: 'File changes',
  查看文件更改: 'View file changes',
  思考过程: 'Thinking details',
  查看操作: 'View actions',
  工具详情: 'Tool details',
  填写其他回答: 'Enter another answer',
  提交回答: 'Submit answers',
  下一题: 'Next',
  上一题: 'Previous',
  取消回答: 'Dismiss',
  预览: 'Preview',
  回复: 'Response',
  复制: 'Copy',
  已复制: 'Copied',
  展开: 'Expand',
  正在回复: 'Responding',
  '正在踩奶…': 'Making biscuits…',
  '正在舔爪…': 'Grooming paws…',
  '正在甩尾巴…': 'Swishing tail…',
  '正在扒拉键盘…': 'Pawing at keys…',
  来源: 'Sources',
  'Catea 有新版本': 'A Catea update is available',
  前往更新: 'Go to update',
  忽略此版本: 'Skip this version',
  '更新偏好保存失败，请重试': 'Could not save update preferences. Please try again.',
  自动检查更新: 'Automatically check for updates',
  '每天从 GitHub 检查一次正式版本，不发送笔记或密钥。':
    'Check GitHub for a stable release once a day. No notes or keys are sent.',
  插件更新: 'Plugin updates',
  '检查是否有兼容当前 Obsidian 的新版本。':
    'Check for a new version compatible with your Obsidian installation.',
  检查更新: 'Check for updates',
  '正在检查…': 'Checking\u2026',
  '暂时无法检查更新，请稍后重试': 'Could not check for updates. Please try again later.',
  没有可用的兼容更新: 'No compatible update is available',
  更新: 'Updates',
  请先停止当前回复再更新插件: 'Stop the current response before updating the plugin',
  '请打开设置 → 第三方插件，检查更新并更新 Catea。':
    'Open Settings \u2192 Community plugins, check for updates, and update Catea.',
  '在已安装插件中检查更新，然后更新 Catea。':
    'Check for updates under Installed plugins, then update Catea.',
  主题: 'Theme',
  亮色: 'Light',
  暗色: 'Dark',
  跟随系统: 'Follow system',
  '选择亮色、暗色，或跟随操作系统外观。':
    'Choose light, dark, or follow the operating system appearance.',
  启用纸张界面: 'Enable paper appearance',
  格式工具栏: 'Formatting toolbar',
  'Tabler 图标': 'Tabler icons',
  隐藏正文属性: 'Hide note properties',
  隐藏导航栏: 'Hide ribbon',
  隐藏状态栏: 'Hide status bar',
  '启用 Agent': 'Enable Agent',
  网络搜索与网页读取: 'Web search and fetch',
  '网页搜索使用 Exa / Jina / DuckDuckGo；可诊断并经确认调用已安装的 Agent Reach。搜索词和目标 URL 会发送到联网服务。':
    'Web search uses Exa / Jina / DuckDuckGo. An installed Agent Reach can be diagnosed and called with confirmation. Queries and URLs are sent to network services.',
  长期记忆: 'Long-term memory',
  '自动提取、召回和巩固；保存在当前知识库 .catea/memory。':
    "Automatically extract, recall, and consolidate memories in this vault's .catea/memory directory.",
  终端工具: 'Terminal tools',
  '默认关闭；开启后每条命令仍需确认。':
    'Off by default. Each command requires confirmation when enabled.',
  'BYOK 模型': 'BYOK models',
  '使用自己的 API Key，直接连接 OpenAI / Anthropic 兼容服务。仅显示你配置的模型。':
    'Use your own API key with OpenAI / Anthropic compatible services. Only configured models appear.',
  'OpenAI 兼容': 'OpenAI compatible',
  'Anthropic 兼容': 'Anthropic compatible',
  ' · 请补充 API Key': ' · API key required',
  编辑: 'Edit',
  移除: 'Remove',
  '模型移除失败，请重试': 'Could not remove model. Try again.',
  添加模型: 'Add model',
  'Obsidian 操作 · 内置': 'Obsidian tools · Built in',
  '随 Agent 启用：当前笔记、搜索、内部打开、阅读、编辑与属性管理；写入和设置变更需确认。':
    'Available with Agent: current note, search, open inside Obsidian, read, edit, and manage properties. Writes and setting changes require confirmation.',
  '将 Skill 文件夹放到 .catea/skills/<名称>/SKILL.md，再启用。':
    'Place skills at .catea/skills/<name>/SKILL.md, then enable them here.',
  '随插件分发的 Skill 预设已列在这里；同名知识库目录优先于预设。':
    'Skill presets shipped with the plugin are listed here; a vault directory of the same id takes precedence.',
  ' · 内置预设': ' · Built-in preset',
  查看技能: 'List skills',
  创建技能: 'Create skill',
  读取技能资源: 'Read skill resource',
  连接方式: 'Transport',
  '本地 stdio': 'Local stdio',
  服务器地址: 'Server URL',
  可执行程序: 'Executable',
  '参数（JSON 数组）': 'Arguments (JSON array)',
  '移除 MCP': 'Remove MCP',
  '添加 MCP': 'Add MCP',
  '编辑 BYOK 模型': 'Edit BYOK model',
  '添加 BYOK 模型': 'Add BYOK model',
  显示名称: 'Display name',
  协议: 'Protocol',
  'API 地址': 'API URL',
  '模型 ID': 'Model ID',
  '上下文窗口（tokens）': 'Context window (tokens)',
  '按模型实际上限填写；用于自动提示交接，默认 128000。':
    "Enter the model's actual limit for context handoff. Default: 128000.",
  '优先保存到 Obsidian 安全存储；不可用时仅本次运行有效，不写入 .catea。':
    'Saved in Obsidian secure storage when available; otherwise kept for this session only. Never written to .catea.',
  取消: 'Cancel',
  保存模型: 'Save model',
  请检查配置: 'Check your configuration',
  '保存失败，请重试': 'Could not save. Try again.',
  '添加到 Catea': 'Add to Catea',
  拒绝: 'Decline',
  确认这一次: 'Allow once',
  '打开 Agent': 'Open Agent',
  查看记忆概览: 'View memory insights',
  记忆概览: 'Memory insights',
  'Catea Agent 需要桌面文件系统': 'Catea Agent requires the desktop filesystem',
  '当前版本无安全密钥存储；密钥仅保留到本次退出':
    'Secure key storage is unavailable. Keys are kept for this session only.',
  '密钥无法持久保存，仅在当前运行期间使用':
    'Could not save the key securely. It will be used for this session only.',
  请回答所有问题: 'Please answer every question',
  '用户取消回答；不要假定答案或重复询问':
    'The user dismissed the question. Do not assume an answer or ask again.',
}
Object.assign(english, {
  更多文件操作: 'More file actions',
  纸张格式工具栏: 'Formatting toolbar',
  撤销: 'Undo',
  重做: 'Redo',
  段落样式: 'Paragraph style',
  正文: 'Text',
  '正文 ▾': 'Text ▾',
  '标题 1': 'Heading 1',
  '标题 2': 'Heading 2',
  '标题 3': 'Heading 3',
  加粗: 'Bold',
  斜体: 'Italic',
  删除线: 'Strikethrough',
  高亮: 'Highlight',
  无序列表: 'Bulleted list',
  有序列表: 'Numbered list',
  任务列表: 'Task list',
  引用: 'Quote',
  内部链接: 'Internal link',
  行内代码: 'Inline code',
  更多格式: 'More formatting',
  代码块: 'Code block',
  '显示 / 隐藏笔记属性': 'Show / hide note properties',
  '请填写显示名称、模型 ID 和 API Key': 'Enter a display name, model ID, and API key',
  请选择支持的协议: 'Select a supported protocol',
  '上下文窗口需为 4096 至 2000000 的整数': 'Context window must be an integer from 4096 to 2000000',
  '请输入有效的 API 地址': 'Enter a valid API URL',
  'API 地址应为 HTTP(S) 基础地址，不包含账号、查询参数或片段':
    'Use an HTTP(S) base URL without credentials, query parameters, or fragments',
})
Object.assign(english, {
  '调整纸张界面、Agent 和连接。BYOK 模型可在本机跨知识库共享；其他设置保存在当前知识库中。':
    'Customize the paper workspace, Agent, and connections. BYOK models can be shared across vaults on this device; other settings stay in this vault.',
  本机共享: 'Shared on this device',
  'BYOK 模型和密钥已加密保存在本机，切换知识库后可使用。':
    'BYOK models and keys are encrypted on this device and available in other vaults.',
  '本机安全加密不可用；BYOK 模型保存在当前知识库，密钥优先使用 Obsidian 安全存储。':
    'Local secure encryption is unavailable. BYOK models remain in this vault; keys use Obsidian secret storage when available.',
  '无法读取本机共享 BYOK，继续使用当前知识库配置':
    'Could not read shared BYOK data. Using this vault configuration.',
  '在 OpenRouter 创建 Key；加密保存在本机，跨知识库共享。':
    'Create a key at OpenRouter. It is encrypted on this device and shared across vaults.',
  '加密保存在本机，跨知识库共享；不写入 .catea。':
    'Encrypted on this device and shared across vaults. Never written to .catea.',
  '另一知识库更新了本机 BYOK，请重新打开当前知识库后重试':
    'Another vault changed shared BYOK data. Reopen this vault and try again.',
})
Object.assign(english, {
  添加: 'Add',
  已添加: 'Added',
  '需要本机已安装 Node.js / npx。': 'Requires Node.js and npx installed locally.',
  '读取 Figma 设计稿的结构与样式，供 Agent 参考实现。添加后填入 Figma 个人访问令牌。':
    'Reads the structure and styles of Figma designs for the Agent to implement against. Add it, then fill in a Figma personal access token.',
  'GitHub 官方远程 MCP：仓库、Issue 与 PR 工具。填入个人访问令牌，可用范围由令牌权限决定。':
    'Official GitHub remote MCP: repository, issue and PR tools. Fill in a personal access token; the available scope follows the token permissions.',
  '查询库与框架的最新文档。无需密钥；匿名调用受上游速率限制。':
    'Looks up current library and framework documentation. No key required; anonymous calls are rate-limited upstream.',
  '就公开 GitHub 仓库的结构与实现提问。无需密钥。':
    'Asks questions about the structure and implementation of public GitHub repositories. No key required.',
  '保存在 Obsidian 密钥存储，连接时作为环境变量注入；不写入知识库配置。':
    'Stored in Obsidian secret storage and injected as an environment variable at connect time; never written to vault configuration.',
})
Object.assign(english, {
  选择技能: 'Select a skill',
  无匹配技能: 'No matching skills',
  已启用: 'Enabled',
  移除技能: 'Remove skill',
})
Object.assign(english, {
  '添加厂商（预设）': 'Add a vendor (preset)',
  '从常用官方厂商中选择；协议、地址和默认模型已自动填好，只需填写 API Key。':
    'Pick from common official vendors; the protocol, endpoint and default model are prefilled, so you only enter an API key.',
  搜索厂商: 'Search vendors',
  没有找到匹配的厂商: 'No matching vendor',
  '获取 API Key ↗': 'Get an API key ↗',
  返回厂商列表: 'Back to vendors',
  '模型 ID 已按厂商默认预填，可修改；请求直连该厂商，笔记内容会发送给它。':
    'The model ID is prefilled with the vendor default and stays editable; requests go directly to this vendor, which receives your note content.',
})
export function translate(language: Language, text: string) {
  return language === 'en' ? english[text] || text : text
}

export function humanizeError(raw: string, language: Language = 'zh') {
  if (raw.startsWith('MCP_UNAVAILABLE ')) {
    try {
      const issue = JSON.parse(raw.slice('MCP_UNAVAILABLE '.length)) as {
        id: string
        reason: string
      }
      const reason =
        issue.reason === 'missing-command'
          ? language === 'en'
            ? 'Obsidian cannot find its executable (such as npx). Install Node.js if needed, or set an absolute executable path in MCP settings.'
            : 'Obsidian 找不到启动程序（例如 npx）。请确认已安装 Node.js，或在 MCP 设置中填写可执行程序的绝对路径。'
          : issue.reason === 'timeout'
            ? language === 'en'
              ? 'Startup timed out.'
              : '启动超时。'
            : language === 'en'
              ? 'Connection or tool discovery failed. Check the server address, credentials and configuration.'
              : '连接或工具发现失败，请检查服务地址、凭据和配置。'
      return language === 'en'
        ? `MCP “${issue.id}” was skipped. ${reason} Chat remains available. Open Catea settings → MCP; after correcting the configuration, send another message to retry.`
        : `已跳过 MCP「${issue.id}」。${reason} 普通聊天仍可继续。请打开 Catea 设置 → MCP；修改配置后，再次发送消息即可重试。`
    } catch {
      /* Fall through for malformed diagnostics. */
    }
  }
  const detail = raw.trim()
  const message = detail.replace(/^(?:上下文压缩失败|Context compaction failed)[:：]\s*/i, '')
  const pick = (zh: string, en: string) => (language === 'en' ? en : zh)
  const compaction = message !== detail
  let friendly: string
  if (/^(?:aborted|AbortError|Request was aborted|已停止)$/i.test(message))
    friendly = pick(
      '本次生成已中断。可发送“继续刚才的任务”接着处理。',
      'This response was interrupted. Send “Continue the previous task” to resume.',
    )
  else if (/No complete earlier turn can be compacted/i.test(message))
    friendly = pick(
      '当前还没有可压缩的已完成步骤。若模型无法继续，请换上下文更大的模型或新建对话。',
      'There are no completed steps to compress yet. If the model cannot continue, use a larger context window or start a new chat.',
    )
  else if (
    /context[_ ]length|context window exceeded|maximum context|prompt is too long|too many tokens|input too long/i.test(
      message,
    )
  )
    friendly = pick(
      '当前模型装不下这次任务的全部内容。请换上下文更大的模型，或在新对话中概述任务后继续。',
      'This task exceeds the model’s context window. Choose a model with a larger window, or summarize the task in a new chat.',
    )
  else if (
    /(?:^|\b)(?:ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN)(?:\b|$)|模型连接超时|timed? out|network error|fetch failed/i.test(
      message,
    )
  )
    friendly = pick(
      '模型连接中断或超时。请检查网络和模型服务，然后重试。',
      'The model connection failed or timed out. Check the network and model service, then retry.',
    )
  else if (/模型请求失败（429）|\b(?:HTTP\s*)?429\b/.test(message))
    friendly = pick(
      '模型服务暂时繁忙或已达到请求限额。请稍后重试，或切换模型。',
      'The model service is busy or rate limited. Try again later or switch models.',
    )
  else if (/模型请求失败（(?:401|403)）|\b(?:HTTP\s*)?(?:401|403)\b/.test(message))
    friendly = pick(
      '模型服务拒绝了请求。请检查 API Key、余额和模型权限。',
      'The model service rejected the request. Check the API key, balance, and model access.',
    )
  else if (/模型请求失败（(?:400|422)）|\b(?:HTTP\s*)?(?:400|422)\b/.test(message))
    friendly = pick(
      '模型服务不接受这次请求。请检查所选模型是否支持当前工具和附件，或切换模型。',
      'The model service rejected this request. Check whether the model supports these tools and attachments, or switch models.',
    )
  else if (/模型请求失败（5\d\d）|\b(?:HTTP\s*)?5\d\d\b|模型响应失败/i.test(message))
    friendly = pick(
      '模型服务暂时没有正常响应。请稍后重试，或切换模型。',
      'The model service did not respond normally. Try again later or switch models.',
    )
  else if (/(?:^|\b)EISDIR\b|不是 Markdown 笔记/i.test(message))
    friendly = pick(
      '选中的路径不是可读取的笔记文件。请先查看目录，再选择具体文件。',
      'That path is not a readable note. Inspect the folder and choose a file.',
    )
  else if (/文件超过 1 MB/i.test(message))
    friendly = pick(
      '文件超过 1 MB。请缩小读取范围，或只读取需要的片段。',
      'The file exceeds 1 MB. Narrow the read to the part you need.',
    )
  else if (/Validation failed for tool/i.test(message))
    friendly = pick(
      '工具参数不符合要求。请调整参数后重试。',
      'The tool arguments were invalid. Adjust them and retry.',
    )
  else if (/Summary model returned (?:no text|an empty checkpoint)/i.test(message))
    friendly = pick(
      '模型没有生成可用的上下文摘要。请重试，或切换模型。',
      'The model did not produce a usable context summary. Retry or switch models.',
    )
  else if (/Stopped after detecting a repeated no-progress tool cycle/i.test(message))
    friendly = pick(
      '工具反复返回相同结果，自动调整后仍未恢复，已停止以避免继续重复。请查看上方工具记录中的失败原因或任务状态。',
      'Tools kept returning identical results after an automatic recovery attempt. The run stopped to prevent further repetition. Check the tool records above for errors or pending task status.',
    )
  else if (
    /Provider stream ended without a final assistant message|Model stream ended without a final response/i.test(
      message,
    )
  )
    friendly = pick(
      '模型没有返回完整回复。请重试，或切换模型。',
      'The model did not return a complete response. Retry or switch models.',
    )
  else friendly = translate(language, message)
  return compaction
    ? `${pick('上下文整理未完成：', 'Context compression did not finish: ')}${friendly}`
    : friendly
}

const contentLabels: Record<string, [string, string]> = {
  copyCode: ['复制代码', 'Copy code'],
  copiedResponse: ['已复制', 'Copied'],
  plainText: ['纯文本', 'Plain text'],
  writingCode: ['正在编写', 'Writing'],
  viewDiagramFullscreen: ['全屏查看图表', 'View diagram fullscreen'],
  closeDialog: ['关闭', 'Close'],
  mermaidDiagram: ['Mermaid 图表', 'Mermaid diagram'],
  zoomOut: ['缩小', 'Zoom out'],
  zoomIn: ['放大', 'Zoom in'],
  zoomPresets: ['缩放比例', 'Zoom presets'],
  zoomToFit: ['适应窗口', 'Fit to window'],
  resetZoom: ['重置视图', 'Reset view'],
  copyDiagramSource: ['复制图表源码', 'Copy diagram source'],
}
export function contentLabel(language: Language, key: string) {
  return contentLabels[key]?.[language === 'en' ? 1 : 0] || key
}

Object.assign(english, {
  '默认开启，命令执行遵循下方权限模式。':
    'Enabled by default. Commands follow the permission mode below.',
  权限模式: 'Permissions',
  帮我批准: 'Help me approve',
  完全访问: 'Full access',
  '帮我批准：自动放行 pwd、ls 等简单目录查看，其余操作请求确认。完全访问：跳过 Bash、文件修改、MCP 和记忆更新的审批，命令可访问知识库之外。':
    'Help me approve: automatically allow simple directory inspection (pwd and ls); ask for other actions. Full access: skip approvals for Bash, file changes, MCP, and memory updates. Commands can access files outside the vault.',
})

Object.assign(english, { 删除: 'Delete', 删除会话: 'Delete conversation' })

Object.assign(english, {
  添加附件或粘贴图片: 'Attach files or paste an image',
  添加文件夹: 'Attach vault folder',
  选择知识库文件夹: 'Choose a vault folder',
  文件夹: 'Folder',
  文件: 'File',
  放下以添加文件: 'Drop files to attach',
  放下以添加文件或文件夹: 'Drop files or folders here',
  '文件夹不会批量上传，请通过添加菜单选择知识库文件夹。':
    'Folders are referenced instead of uploaded. Choose a vault folder from the attachment menu.',
  移除附件: 'Remove attachment',
  '正在读取附件…': 'Reading attachments…',
  请查看这些附件: 'Please review these attachments',
  '个附件未导入：隐藏文件、读取失败或超过限制（单个 10 MB、合计 32 MB、64 个文件）。':
    'attachments skipped: hidden files, read failures, or limits exceeded (10 MB each, 32 MB total, 64 files).',
})

Object.assign(english, {
  '附件已保留：当前 M2 模型不支持图片或二进制文档，请切换支持该附件的模型。':
    'Attachments kept: this M2 model cannot read images or binary documents. Choose a model supporting these attachments.',
})
Object.assign(english, {
  '附件已保留：当前模型不支持此类图片或二进制文档，请切换支持该附件的模型。':
    'Attachments kept: the selected model cannot read this image or binary document. Choose a model that supports it.',
})

Object.assign(english, {
  添加附件: 'Add attachment',
  添加文件: 'Add files',
  选区操作: 'Selection actions',
})

Object.assign(english, {
  笔记缩略图: 'Note thumbnails',
  '文件树显示真实标题、正文和首张本地图片的缩略预览。':
    'Preview note titles, content, and the first local image in the file tree.',
})
Object.assign(english, {
  人格: 'Persona',
  '选择 Agent 的对话风格；从下一条消息开始使用。':
    'Choose the Agent’s conversation style. Applies from the next message.',
})
Object.assign(english, {
  附带当前笔记: 'Include current note',
  '发送消息时将当前笔记内容加入上下文。默认开启。':
    'Include the current note in messages sent to the model. On by default.',
})
Object.assign(english, {
  '添加 OpenRouter': 'Add OpenRouter',
  添加其他模型: 'Add another model',
  '只需 API Key；选择 Free 自动路由，或填写模型 ID。':
    'Enter an API key, then choose Free routing or a model ID.',
  '配置 OpenRouter': 'Configure OpenRouter',
  '创建 OpenRouter API Key ↗': 'Create an OpenRouter API key ↗',
  模型选择: 'Model choice',
  'Free 自动路由': 'Free automatic routing',
  '指定模型 ID': 'Specific model ID',
  '例如 openai/gpt-oss-120b:free；从 OpenRouter 模型页复制完整 ID。':
    'For example, openai/gpt-oss-120b:free. Copy the full ID from OpenRouter’s model page.',
  '在 OpenRouter 创建 Key；优先保存到 Obsidian 安全存储，不写入知识库配置。':
    'Create a key at OpenRouter. Catea prefers Obsidian secure storage and never writes it to the vault config.',
  'Free 会自动选择可用的免费模型；可用性、工具支持和请求限额由 OpenRouter 决定。笔记内容会发送给 OpenRouter 及其选定的模型提供方。':
    'Free automatically chooses an available free model. OpenRouter controls availability, tool support, and limits. Note content is sent to OpenRouter and its selected model provider.',
  保存并使用: 'Save and use',
  '请填写 OpenRouter 模型 ID，或选择 Free': 'Enter an OpenRouter model ID or choose Free.',
  'OpenRouter 模型 ID 应为 provider/model 格式': 'Use a provider/model OpenRouter model ID.',
})

Object.assign(english, {
  请先选中回复中的文字: 'Select text in the reply first',
  回复批注: 'Reply annotation',
  引用选中内容并批注: 'Annotate selected text',
})

Object.assign(english, {
  批注内容: 'Annotation',
  '针对这段回复写下你的问题或意见…': 'Write a question or comment about this passage…',
  添加批注: 'Add annotation',
})
Object.assign(english, { 请按批注继续: 'Please respond to these annotations' })

Object.assign(english, { 引用批注: 'Annotate' })

Object.assign(english, {
  套餐: 'Plan',
  当前套餐: 'Current plan',
  订阅套餐: 'Subscribe',
  一键订阅: 'Quick subscribe',
  '订阅 Catea 套餐': 'Subscribe to a Catea plan',
  'Free 自备 API Key；Pro 订阅后无需 API Key，即可使用 Catea 托管 AI 额度。':
    'Free uses your own API key. Pro includes Catea-hosted AI usage with no API key required.',
  '输入邮箱即可开通 Pro，立即使用 Catea 托管 AI 额度。':
    'Enter your email to start Pro and use Catea-hosted AI usage right away.',
  订阅邮箱: 'Subscription email',
  支付币种: 'Payment currency',
  人民币支付暂不可用: 'CNY payments are not available yet',
  '自备 API Key': 'Bring your own API key',
  '适合已有模型服务的用户。': 'For users who already have a model provider.',
  '使用你自己的 API Key': 'Use your own API key',
  '模型和密钥仍保存在本机': 'Models and keys stay on this device',
  '基础 Agent 和笔记工作流': 'Basic agent and note workflows',
  当前默认套餐: 'Current default plan',
  限时折扣: 'Limited-time offer',
  月付订阅: 'Monthly subscription',
  '开箱即用，无需配置 API Key。': 'Ready out of the box. No API key setup required.',
  '包含 Catea 托管 AI 额度': 'Includes Catea-hosted AI usage',
  '更多用量，适合长文档和 Agent 工作流':
    'More usage for long documents and agent workflows',
  '额度自动恢复，月度周期重置': 'Allowance restores automatically and resets monthly',
  '高级功能优先开放：连接器、自定义 Persona、媒体生成':
    'Priority access to advanced features: connectors, custom personas, and media generation',
  '订阅 Pro': 'Subscribe to Pro',
  '同步套餐状态': 'Sync plan status',
  '支付完成后回到这里刷新状态。': 'After payment, return here and refresh.',
  刷新套餐状态: 'Refresh plan status',
  '已切换到 Pro 套餐': 'Switched to the Pro plan',
  '当前为 Free 套餐': 'You are on the Free plan',
  'Free · 自备 API Key 使用 BYOK。订阅 Pro 后可直接使用 Catea 托管额度。':
    'Free · Use BYOK with your own API key. Subscribe to Pro to use Catea-hosted usage directly.',
  'Free · 自备 API Key': 'Free · Bring your own API key',
  'Pro · 开箱即用': 'Pro · Ready out of the box',
  本月剩余额度: 'Monthly usage remaining',
  上次检查: 'Last checked',
  '支付链接创建失败，请稍后重试': 'Could not create a payment link. Try again later.',
  '无法读取 Pro 状态，请稍后重试': 'Could not read Pro status. Try again later.',
  请先填写有效邮箱: 'Enter a valid email first',
  '支付页已打开，完成后回到这里刷新套餐状态':
    'The payment page is open. After payment, return here and refresh plan status.',
})

Object.assign(english, {
  切换会话: 'Switch conversation',
  关闭当前会话: 'Close current conversation',
})

Object.assign(english, {
  '在回复卡片中显示引用批注按钮，可选中文字后添加批注。默认关闭。':
    'Show an annotation button on replies to comment on selected text. Off by default.',
})

Object.assign(english, { '猫咪奔跑了 {elapsed}': 'Cat ran for {elapsed}' })

// UI-only acknowledgements: never added to the model transcript or saved as replies.
const replyAcknowledgements = [
  ['明白你的诉求，让我探索一下。', 'Got it. Let me take a closer look.'],
  ['收到，让我先理一理思路。', 'Got it. Let me organize my thoughts.'],
  ['好的，让我仔细看看你的问题。', 'Okay, let me look carefully at your question.'],
  ['明白，我先梳理一下重点。', 'Understood. Let me work through the key points.'],
  ['收到，我会从你的需求出发来考虑。', "Got it. I'll start with what you need."],
  ['好的，给我一点时间把思路整理清楚。', 'Okay, give me a moment to think this through.'],
  ['让我先理解上下文，再给你回复。', 'Let me understand the context before replying.'],
  ['明白，让我想想怎样回答更有帮助。', 'Understood. Let me think about the most helpful response.'],
  ['收到，我先把问题拆开看看。', 'Got it. Let me break the question down.'],
  ['好的，让我从关键的地方开始。', 'Okay, let me start with what matters most.'],
  ['让我仔细考虑一下，再和你展开。', 'Let me give this some thought before we go further.'],
  ['明白，我先看看有哪些需要留意的细节。', 'Understood. Let me consider the details that matter.'],
  ['收到，让我把相关思路串起来。', 'Got it. Let me connect the relevant ideas.'],
  ['好的，我先想想合适的切入点。', 'Okay, let me find a useful starting point.'],
  ['让我先抓住重点，再一步步展开。', 'Let me identify the key points, then work through them.'],
  ['明白，让我把你的要求逐项理清。', 'Understood. Let me work through your requirements.'],
  ['收到，我会先考虑你最关心的部分。', "Got it. I'll start with what matters most to you."],
  ['好的，让我先看看问题的脉络。', 'Okay, let me get a sense of the bigger picture.'],
  ['让我想一想，怎样把这件事讲清楚。', 'Let me think about how to explain this clearly.'],
  ['明白，我先整理一个清晰的回答思路。', 'Understood. Let me shape a clear response.'],
  ['收到，让我从几个角度考虑一下。', 'Got it. Let me consider a few perspectives.'],
  ['好的，我先留意一下可能遗漏的地方。', 'Okay, let me think about what might be missing.'],
  ['让我把你的目标和细节一起考虑。', 'Let me consider both your goal and the details.'],
  [
    '明白，让我先分清主要问题和补充信息。',
    'Understood. Let me separate the main question from the supporting details.',
  ],
  ['收到，我先想想下一步怎么推进。', 'Got it. Let me think about the next step.'],
  ['好的，让我先把思路铺开。', 'Okay, let me explore the possibilities.'],
  ['让我围绕你的问题仔细想一想。', 'Let me give your question a closer look.'],
  [
    '明白，我先考虑一下怎样更贴近你的需求。',
    'Understood. Let me think about what would best fit your needs.',
  ],
  ['收到，让我看看各个要点之间的联系。', 'Got it. Let me consider how the points connect.'],
  ['好的，我先整理需要回应的几个部分。', 'Okay, let me organize the parts that need a response.'],
  ['让我先想清楚重点，再给你展开说明。', 'Let me clarify the main points before explaining.'],
  ['明白，让我考虑一下不同的可能性。', 'Understood. Let me consider the different possibilities.'],
  ['收到，我先从你提供的信息入手。', "Got it. I'll start with the information you've shared."],
  ['好的，让我把这件事的前后关系理一理。', 'Okay, let me think through how this fits together.'],
  ['让我先看看什么对你最有用。', 'Let me think about what would be most useful to you.'],
  [
    '明白，我先把复杂的部分拆小一些。',
    'Understood. Let me break the complex parts into smaller pieces.',
  ],
  ['收到，让我想想有哪些值得说明的地方。', 'Got it. Let me consider what needs explanation.'],
  ['好的，我会带着你的目标来整理思路。', "Okay, I'll organize my thoughts with your goal in mind."],
  [
    '让我先仔细理解，再组织回复。',
    'Let me understand this carefully, then put a response together.',
  ],
  [
    '明白，让我看看怎样让回答更具体。',
    'Understood. Let me think about how to make the answer more concrete.',
  ],
  ['收到，我先想想有哪些关键区别。', 'Got it. Let me consider the key distinctions.'],
  ['好的，让我先捋顺这几个要点。', 'Okay, let me work through these points.'],
  ['让我把注意力放在你提出的核心问题上。', "Let me focus on the core question you've raised."],
  [
    '明白，我先考虑一下回答的顺序。',
    'Understood. Let me think about the best order to explain this.',
  ],
  [
    '收到，让我把细节和整体一起看看。',
    'Got it. Let me consider the details alongside the bigger picture.',
  ],
  [
    '好的，我先想想怎样把建议说得更明确。',
    'Okay, let me think about how to make the guidance clearer.',
  ],
  ['让我先整理一下，再接着和你聊。', 'Let me gather my thoughts before continuing.'],
  ['明白，让我沿着你的思路再往前想一步。', 'Understood. Let me take your idea a step further.'],
  ['收到，我先认真考虑一下你的提问。', 'Got it. Let me give your question some careful thought.'],
  ['好的，让我把要点理清后再回复你。', 'Okay, let me sort through the key points before replying.'],
] as const
Object.assign(english, Object.fromEntries(replyAcknowledgements))

// The random message UUID seeds a stable choice across renders, tabs and remounts.
export function pendingReplyText(messageId: string, language: Language = 'zh'): string {
  let hash = 2166136261
  for (let i = 0; i < messageId.length; i++)
    hash = Math.imul(hash ^ messageId.charCodeAt(i), 16777619)
  return translate(language, replyAcknowledgements[(hash >>> 0) % replyAcknowledgements.length][0])
}
