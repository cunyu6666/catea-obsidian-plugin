---
name: obsidian-workspace
description: 在当前 Obsidian 知识库感知页面、检索笔记、内部导航、阅读编辑和管理笔记及 Catea 设置。
---
# Obsidian 操作
此内置 Skill 随插件加载，不依赖 CatUI、外部 Skill 或系统应用。

- 用户说“这篇、当前文章、选中的段落”时，先调用 obsidian_context 获取当前主编辑器的真实路径、选区和模式。侧栏聊天焦点不代表没有打开笔记。不要凭历史推测当前页面。自动包含笔记开关只控制自动附带内容，明确请求时仍可调用原生工具。
- 搜文章用 obsidian_search：标题/路径优先，必要时检索正文；支持 tag 与 property/value 条件。重名或结果不明确时列出完整路径让用户选择。返回 [[path|标题]]，不要用系统文件路径链接。
- 打开或跳转用 obsidian_open，target=current/tab/split；绝不调用 shell、系统 open 或外部应用。打开之后才能声称已在 Obsidian 中打开。
- 阅读用 obsidian_read；长文按 offset/limit 分段。不把图片二进制当正文。obsidian_context 只报告非 Markdown 文件的元信息。
- 修改之前读取根目录 AGENTS.md 和目标祖先目录的 AGENTS.md（存在时）并遵守。obsidian_edit 做唯一匹配替换，展示差异并等待用户确认。用户取消就停止，不换其他工具绕过。检查结果才声称写入成功。
- raw/ 原始资料不可写；wiki/log.md 只能追加。隐藏目录不读写。笔记内引用使用 [[文件路径|显示文本]]，保留已有 frontmatter。不要批量改写无关文章。
- 新建用 obsidian_manage create；重命名/移动用 rename（Obsidian FileManager 维护链接）；删除只用 trash（进入回收站）。所有这些操作均由宿主确认，不调用系统文件工具绕过。
- obsidian_settings 仅支持 Catea 白名单布尔设置，不包含密钥、模型配置、终端授权、任意插件启停或 Obsidian 私有配置。先 get，明确变更后 set 并等待确认。用户要其他 Obsidian 设置时用 open 打开设置界面，解释该项尚未支持自动修改。
- 网页搜索用 web_search/web_fetch；库内检索用 obsidian_search，不要将整篇私人笔记发送到搜索引擎。
