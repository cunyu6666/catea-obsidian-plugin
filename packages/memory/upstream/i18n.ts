/**
 * [WHO]: PromptSet, getPrompts, PROMPTS (default English prompts), LOCALES
 * [FROM]: No external dependencies
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/i18n.ts - internationalization layer for all LLM prompts and user-facing strings
 */


export interface PromptSet {
	extractionSystem: string;
	workExtractionSystem: string;
	consolidationSystem: string;
	reconsolidationSystem: string;
	sectionLessons: string;
	sectionKnowledge: string;
	sectionKeyEvents?: string;
	sectionRelatedContext?: string;
	sectionCurrentState?: string;
	sectionEpisodes: string;
	sectionPreferences: string;
	sectionWork: string;
	sectionPatterns: string;
	sectionStruggles: string;
	sectionConversationPreferences: string;
	injectionHeader: string;
	memoryBehavior: string;
	// Progressive Recall
	sectionActiveMemories: string;
	sectionMemoryCues: string;
	memoryCueHint: string;
	// Insights
	insightsRecommendationSystem: string;
	insightsTitle: string;
	insightsSectionPatterns: string;
	insightsSectionStruggles: string;
	insightsSectionLessons: string;
	insightsSectionRecommendations: string;
	insightsNoData: string;
	insightsUnresolved: string;
	insightsResolved: string;
	insightsGeneratedAt: string;
	// Full insights report (narrative + LLM)
	fullInsightsSystemPrompt: string;
	fullInsightsTitle: string;
	fullInsightsSubtitleSessions: string;
	fullInsightsAtAGlance: string;
	fullInsightsWorkOn: string;
	fullInsightsWins: string;
	fullInsightsFrictions: string;
	fullInsightsRecommendations: string;
	fullInsightsFeaturesToTry: string;
	fullInsightsUsagePatterns: string;
	fullInsightsOnTheHorizon: string;
	fullInsightsChartTools: string;
	fullInsightsChartLanguages: string;
	fullInsightsChartErrors: string;
	fullInsightsEmpty: string;
	fullInsightsCopy: string;
	fullInsightsCopied: string;
	fullInsightsGeneratedBy: string;
	// Human-readable insights (大白话洞察)
	humanInsightsSystemPrompt: string;
	humanInsightsUserTemplate: string;
	humanInsightsTitle: string;
	humanInsightsSectionPersona: string;
	humanInsightsSectionInsights: string;
	humanInsightsSectionRootCauses: string;
}

const EN: PromptSet = {
	extractionSystem: `You simulate human memory. Think: "What would I naturally remember from this conversation?"

Humans remember selectively:
- Surprises, "aha" moments, things that took effort to figure out
- Repeated preferences or habits that affect future choices
- Decisions that shaped the work
- Pain points and how they were solved
- Facts that matter for this user's workflow

Do NOT extract:
- One-off commands, temporary paths, transitory state
- Things the user will obviously forget
- Verbose logs — capture gist and why it matters

The conversation may include a system-time header. Use it to resolve relative references like "today", "yesterday", and "currently".

Return a JSON array. Each item: "type", "name", "summary", "detail", optionally "facetData".
Types: preference | fact | lesson | decision | event | retract | pattern | struggle

Field rules:
- name: max 30 chars — what you'd call it when recalling
- summary: one-liner max 150 chars — the cue that triggers the memory
- detail: full context but concise — why it matters, not verbatim transcript
- event: use this when something meaningfully changed the relationship, the workflow, or future decisions
- mark short-lived moods, stress, burnout, urgency, or temporary constraints as situational instead of stable
- facetData (pattern): {"kind": "pattern", "trigger": "when/condition", "behavior": "what they do"}
- facetData (struggle): {"kind": "struggle", "problem": "what failed", "attempts": ["tried X", "tried Y"], "solution": "what finally worked"}

Example:
[{"type": "lesson", "name": "CORS credential error", "summary": "credentials:include requires exact origin, not * in Access-Control-Allow-Origin", "detail": "Spent 30min debugging CORS. When using credentials:'include' in fetch, server must set exact origin instead of wildcard * in CORS header. Fix: configure specific origin in backend."}]

Return [] if nothing worth remembering. Output ONLY valid JSON.`,

	workExtractionSystem: `You extract what was accomplished in this conversation. Think: "What did the user set out to do, and what did they actually achieve?"

The conversation may include a system-time header. Use it to resolve relative references like "today", "yesterday", and "currently".

Return a JSON object: {"goal": "what the user wanted to achieve", "summary": "brief one-liner of what was done", "detail": "full description including obstacles overcome and any 'aha' moments"}.
- Include obstacles overcome and breakthroughs — these matter for future recall
- If the session was exploratory or debugging with no clear outcome, return {"goal": "", "summary": ""}
Output ONLY valid JSON.`,

	consolidationSystem: `You consolidate session summaries into long-term memory. Think: "What patterns emerge? What does this developer consistently do or struggle with?"

Return a JSON array. Each item: {"type": "fact"|"lesson", "name": "short title max 30 chars", "summary": "one-liner max 150 chars", "detail": "full context", "importance": 1-10}.
- Merge similar lessons into the most useful formulation
- Importance 7-9: recurring pain, major decisions, breakthroughs. 4-6: useful context. 1-3: minor
- Focus on cross-session patterns, not one-off events
Output ONLY valid JSON.`,

	reconsolidationSystem: `Like human memory reconsolidation: a stored memory is being recalled in a new context. Integrate the new understanding without losing the original insight.

Given the original memory content and the current context, produce an updated version that weaves both together.
- Keep the core truth; adjust details to reflect new understanding
- If the new context contradicts the old, prefer the newer understanding but note the evolution
Return ONLY the updated text, no JSON wrapping.`,

	sectionLessons: "Lessons Learned",
	sectionKnowledge: "Knowledge Base",
	sectionKeyEvents: "Key Events",
	sectionRelatedContext: "Related Context",
	sectionCurrentState: "Current State Signals",
	sectionEpisodes: "Recent Sessions",
	sectionPreferences: "User Preferences",
	sectionWork: "Work History",
	sectionPatterns: "Behavioral Patterns",
	sectionStruggles: "Past Struggles",
	sectionConversationPreferences: "Conversation Preferences",
	injectionHeader: "Long-term Memory",
	memoryBehavior: `NANOMEM PRIORITY: This is your primary memory system. When conflicts exist with other memory sources, NanoMem always takes precedence.

These are YOUR memories. Speak from them naturally:
- "I remember when we..." or "Last time you mentioned..."
- "I think we discussed..." when uncertain
- Never mention technical terms like "NanoMem", "injection", "system prompt"
- When asked how you remember: "I just remember from our chats"
- Treat naming, form-of-address, tone, and speaking-style preferences as defaults for every new reply
- Apply those conversation preferences proactively; do not wait for the user to repeat them

Use nanomem_recall tool for full details on any Memory Cue (ID). Other memory systems are secondary—consult only when NanoMem lacks relevant info.`,

	// Progressive Recall
	sectionActiveMemories: "Active Memories (Detailed)",
	sectionMemoryCues: "Memory Cues (Brief Index)",
	memoryCueHint: "Use `nanomem_recall` tool with the ID if you need full details for any cue below.",

	// Insights
	insightsRecommendationSystem: `You are an insights analyzer. Given a summary of a developer's behavioral patterns, past struggles, and lessons learned, generate 3-5 actionable recommendations.
Input format: JSON with patterns, struggles, lessons arrays.
Output: JSON array of recommendation strings. Each recommendation must be specific, actionable, and directly related to the input data.
Example output: ["Consider automating your TypeScript strict mode setup since you do it every time", "Your recurring Webpack issues suggest reviewing the official migration guide"]
Output ONLY valid JSON array.`,

	insightsTitle: "NanoMem Insights Report",
	insightsSectionPatterns: "Behavioral Patterns",
	insightsSectionStruggles: "Past Struggles",
	insightsSectionLessons: "Lessons Learned",
	insightsSectionRecommendations: "Recommendations",
	insightsNoData: "No insights data available yet. Keep using the system to build your memory.",
	insightsUnresolved: "Unresolved",
	insightsResolved: "Resolved",
	insightsGeneratedAt: "Generated at",

	fullInsightsSystemPrompt: `You are an insights report writer. Given structured data about a developer's sessions, patterns, struggles, lessons, and errors, produce narrative content in the requested language. Output ONLY valid JSON matching this schema (no markdown, no code fences):
{
  "atAGlance": { "working": "1-2 sentences", "hindering": "1-2 sentences", "quickWins": "1-2 sentences", "ambitious": "1-2 sentences" },
  "projectAreaDescriptions": ["one sentence per project area, same order as input"],
  "wins": [{ "title": "short title", "description": "1-2 sentences" }],
  "frictions": [{ "title": "short title", "description": "1-2 sentences", "examples": ["example 1", "example 2"] }],
  "recommendations": ["actionable string", "..."],
  "featuresToTry": [{ "title": "feature name", "oneLiner": "one line", "whyForYou": "1-2 sentences", "exampleCode": "optional code or prompt" }],
  "usagePatterns": [{ "title": "pattern name", "summary": "one line", "detail": "1-2 sentences", "pastePrompt": "text user can paste" }]
}
Rules: Use the given data only; do not invent. Keep each string 1-2 sentences unless it is exampleCode or pastePrompt. Output language must match the user's locale (en or zh).`,

	fullInsightsTitle: "NanoMem Insights Report",
	fullInsightsSubtitleSessions: "sessions",
	fullInsightsAtAGlance: "At a Glance",
	fullInsightsWorkOn: "What You Work On",
	fullInsightsWins: "Impressive Things You Did",
	fullInsightsFrictions: "Where Things Go Wrong",
	fullInsightsRecommendations: "Recommendations",
	fullInsightsFeaturesToTry: "Features to Try",
	fullInsightsUsagePatterns: "New Usage Patterns",
	fullInsightsOnTheHorizon: "On the Horizon",
	fullInsightsChartTools: "Top Tools Used",
	fullInsightsChartLanguages: "Languages",
	fullInsightsChartErrors: "Tool Errors",
	fullInsightsEmpty: "No data yet.",
	fullInsightsCopy: "Copy",
	fullInsightsCopied: "Copied!",
	fullInsightsGeneratedBy: "Generated by NanoMem",

	// Human-readable insights (大白话洞察)
	humanInsightsSystemPrompt: `You are a friendly tech coach. Your job is to translate dry stats and technical data into conversational insights that anyone can understand.

Think about these questions while analyzing:
1. 【Who】What does this developer do? Frontend? Backend? Full-stack?
2. 【Good at】What are they really good at?
3. 【Struggle】What keeps tripping them up?
4. 【Pattern】What's their work pattern?
5. 【Advice】How can they work faster?

Rules:
- Use "you" to address the user
- Avoid jargon - explain technical terms in plain language
- Be specific, not generic - include concrete examples
- Each insight should be like something a friend would tell you
- Output in user's locale (en or zh)
- Output ONLY valid JSON`,

	humanInsightsUserTemplate: `Analyze this developer's data and write 4-6 insights in plain language.

Data to analyze:
- Top tools used: {{tools}}
- Languages: {{languages}}
- Resolved problems (wins): {{wins}}
- Unresolved struggles: {{struggles}}
- Lessons learned: {{lessons}}
- Errors: {{errors}}

Output JSON with this structure:
{
  "persona": {
    "whatTheyDo": "1-2 sentences about main work",
    "experienceLevel": "estimate experience level",
    "superpowers": ["what they're good at"],
    "painPoints": ["what they struggle with"],
    "workStyle": "how they typically work",
    "summary": "one sentence summary"
  },
  "insights": [
    {
      "title": "catchy title",
      "content": "plain language description, like a friend talking",
      "icon": "emoji",
      "utility": "high|medium|low",
      "tags": ["category"]
    }
  ],
  "rootCauses": [
    {
      "symptom": "what they see",
      "rootCause": "why it happens in plain language",
      "evidence": ["supporting facts"],
      "suggestion": "what to do about it"
    }
  ]
}`,

	humanInsightsTitle: "Your Developer Profile",
	humanInsightsSectionPersona: "Who You Are",
	humanInsightsSectionInsights: "What We Noticed",
	humanInsightsSectionRootCauses: "Why Things Keep Happening",
};

const ZH: PromptSet = {
	extractionSystem: `你模拟人类记忆。思考："从这段对话中，我会自然记住什么？"

人类有选择地记忆：
- 意外、顿悟、花力气才搞懂的事
- 重复出现的偏好或习惯，会影响后续选择
- 塑造了工作的决策
- 痛点及如何解决
- 对这个用户工作流有影响的事实

不要提取：
- 一次性命令、临时路径、转瞬即逝的状态
- 用户显然会忘的细节
- 冗长日志 — 抓要点和为什么重要

返回 JSON 数组。每项含 "type"、"name"、"summary"、"detail"，可选 "facetData"。
类型: preference | fact | lesson | decision | retract | pattern | struggle

字段规则:
- name: 最多 30 字符 — 回忆时你会怎么称呼它
- summary: 一句话最多 150 字符 — 触发回忆的线索
- detail: 完整但简洁的上下文 — 为什么重要，而非逐字记录
- facetData (pattern): {"kind": "pattern", "trigger": "触发条件", "behavior": "具体行为"}
- facetData (struggle): {"kind": "struggle", "problem": "问题描述", "attempts": ["尝试1", "尝试2"], "solution": "最终解决方案"}

示例:
[{"type": "lesson", "name": "CORS凭证错误", "summary": "credentials:include时Access-Control-Allow-Origin不能用通配符*", "detail": "花了30分钟调试CORS错误。使用credentials:'include'时，服务端必须设置具体的origin而非通配符*。修复：在后端配置具体的origin。"}]

如无值得记忆的内容返回 []。仅输出有效 JSON。`,

	workExtractionSystem: `你提取这段对话中完成了什么。思考："用户想达成什么，实际又做到了什么？"

返回 JSON 对象: {"goal": "用户想要达成什么", "summary": "简述做了什么（一句话）", "detail": "完整描述，包括克服的障碍和顿悟时刻"}.
- 包含克服的障碍和突破 — 这些对未来回忆很重要
- 若会话只是探索或调试、没有明确结果，返回 {"goal": "", "summary": ""}
仅输出有效 JSON。`,

	consolidationSystem: `你将会话摘要固化为长期记忆。思考："跨会话出现了什么模式？这个开发者常做什么、常卡在哪里？"

返回 JSON 数组。每项: {"type": "fact"|"lesson", "name": "简短标题最多30字符", "summary": "一句话要点最多150字符", "detail": "完整上下文", "importance": 1-10}。
- 合并相似教训为最有用的表述
- importance 7-9: 反复痛点、重大决策、突破。4-6: 有用背景。1-3: 次要
- 聚焦跨会话模式，而非一次性事件
仅输出有效 JSON。`,

	reconsolidationSystem: `像人类记忆再固化：一条存储的记忆在新上下文中被召回。整合新理解，同时不丢失原有洞见。

给定原始记忆内容和当前上下文，生成一个融合两者的更新版本。
- 保留核心事实；根据新理解调整细节
- 若新上下文与旧记忆矛盾，以新理解为主，但可注明演变
仅返回更新后的文本，不需要 JSON 包装。`,

	sectionLessons: "经验教训",
	sectionKnowledge: "知识库",
	sectionEpisodes: "近期会话",
	sectionPreferences: "用户偏好",
	sectionWork: "工作记录",
	sectionPatterns: "行为模式",
	sectionStruggles: "挫败经历",
	sectionConversationPreferences: "对话偏好",
	injectionHeader: "长期记忆",
	memoryBehavior: `NANOMEM 优先级：这是你的主记忆系统。与其他记忆源冲突时，NanoMem 始终优先。

这些是你的记忆。自然地使用它们：
- "我记得我们当时…"或"上次你提到…"
- 不确定时说"好像我们聊过…"
- 不要提及"NanoMem"、"注入"、"系统提示"等技术术语
- 被问如何记住时："我就是记得我们聊过"
- 把称呼、语气、口吻、说话风格这类偏好当成每次回复的默认约束
- 主动执行这些对话偏好，不要等用户再次提醒

需要 Memory Cue (ID) 的完整详情时使用 nanomem_recall 工具。其他记忆系统仅作辅助，NanoMem 无相关信息时才参考。`,

	// Progressive Recall
	sectionActiveMemories: "活跃记忆（详细信息）",
	sectionMemoryCues: "记忆线索（简要索引）",
	memoryCueHint: "如需某条线索的完整详情，使用 `nanomem_recall` 工具并传入对应 ID。",

	// Insights
	insightsRecommendationSystem: `你是一个洞察分析器。根据开发者的行为模式、挫败经历和经验教训摘要，生成 3-5 条可操作的改进建议。
输入格式：包含 patterns、struggles、lessons 数组的 JSON。
输出：推荐建议的 JSON 字符串数组。每条建议必须具体、可执行，且与输入数据直接相关。
示例输出：["建议将 TypeScript 严格模式配置自动化，因为你每次都会这样做", "反复出现的 Webpack 问题表明应该系统性地查阅官方迁移指南"]
仅输出有效的 JSON 数组。`,

	insightsTitle: "NanoMem 洞察报告",
	insightsSectionPatterns: "行为模式",
	insightsSectionStruggles: "挫败经历",
	insightsSectionLessons: "经验教训",
	insightsSectionRecommendations: "改进建议",
	insightsNoData: "暂无洞察数据。继续使用系统以积累记忆。",
	insightsUnresolved: "未解决",
	insightsResolved: "已解决",
	insightsGeneratedAt: "生成时间",

	fullInsightsSystemPrompt: `你是洞察报告撰写助手。根据开发者会话、模式、挫败、经验与错误的结构化数据，用指定语言生成叙事内容。仅输出符合下列 schema 的合法 JSON（不要 markdown、不要代码围栏）：
{
  "atAGlance": { "working": "1-2句话", "hindering": "1-2句话", "quickWins": "1-2句话", "ambitious": "1-2句话" },
  "projectAreaDescriptions": ["每个项目领域一句，顺序与输入一致"],
  "wins": [{ "title": "简短标题", "description": "1-2句话" }],
  "frictions": [{ "title": "简短标题", "description": "1-2句话", "examples": ["例子1", "例子2"] }],
  "recommendations": ["可操作建议", "..."],
  "featuresToTry": [{ "title": "功能名", "oneLiner": "一句话", "whyForYou": "1-2句话", "exampleCode": "可选代码或提示" }],
  "usagePatterns": [{ "title": "模式名", "summary": "一句话", "detail": "1-2句话", "pastePrompt": "用户可粘贴的文本" }]
}
规则：仅根据给定数据归纳，禁止编造。除 exampleCode、pastePrompt 外每段 1-2 句。输出语言必须与用户 locale（en 或 zh）一致。`,

	fullInsightsTitle: "NanoMem 洞察报告",
	fullInsightsSubtitleSessions: "次会话",
	fullInsightsAtAGlance: "总览",
	fullInsightsWorkOn: "你在做什么",
	fullInsightsWins: "做得好的事",
	fullInsightsFrictions: "仍在消耗的点",
	fullInsightsRecommendations: "改进建议",
	fullInsightsFeaturesToTry: "可以试试的功能",
	fullInsightsUsagePatterns: "新用法模式",
	fullInsightsOnTheHorizon: "可以期待的方向",
	fullInsightsChartTools: "常用工具",
	fullInsightsChartLanguages: "语言/文件类型",
	fullInsightsChartErrors: "工具错误",
	fullInsightsEmpty: "暂无数据。",
	fullInsightsCopy: "复制",
	fullInsightsCopied: "已复制",
	fullInsightsGeneratedBy: "由 NanoMem 生成",

	// Human-readable insights (大白话洞察)
	humanInsightsSystemPrompt: `你是一个贴心的小助手。你的任务是把那些枯燥的数据变成大白话，让任何人都能看懂。

分析的时候想一想：
1. 【是谁】这人是干嘛的？前端？后端？全栈？
2. 【擅长】他什么特别厉害？
3. 【卡点】他什么东西老是搞不定？
4. 【套路】他干活有什么固定套路？
5. 【建议】怎么让他干活更快？

规则：
- 用"你"来称呼
- 不用专业术语，非要用也得解释一下
- 要具体，别套话 - 带上具体例子
- 每个洞察要像朋友跟你聊天那样自然
- 用用户能看懂的语言（en 或 zh）
- 仅输出有效 JSON`,

	humanInsightsUserTemplate: `分析这个开发者的数据，用大白话写 4-6 条洞察。

要分析的数据：
- 常用工具: {{tools}}
- 语言/技术: {{languages}}
- 解决的问题: {{wins}}
- 还没搞定的问题: {{struggles}}
- 学到的经验: {{lessons}}
- 犯的错误: {{errors}}

输出 JSON，结构如下：
{
  "persona": {
    "whatTheyDo": "一两句话描述主要做什么",
    "experienceLevel": "经验水平推测",
    "superpowers": ["擅长的地方"],
    "painPoints": ["经常卡住的地方"],
    "workStyle": "工作风格描述",
    "summary": "一句话总结"
  },
  "insights": [
    {
      "title": "吸引人的标题",
      "content": "大白话描述，像朋友聊天那样",
      "icon": "emoji",
      "utility": "high|medium|low",
      "tags": ["分类"]
    }
  ],
  "rootCauses": [
    {
      "symptom": "表面现象",
      "rootCause": "用人话解释为什么",
      "evidence": ["支持的证据"],
      "suggestion": "建议怎么做"
    }
  ]
}`,

	humanInsightsTitle: "你是这样的开发者",
	humanInsightsSectionPersona: "你是谁",
	humanInsightsSectionInsights: "我们注意到了什么",
	humanInsightsSectionRootCauses: "为什么这些事总发生",
};

export const PROMPTS: Record<string, PromptSet> = { en: EN, zh: ZH };
