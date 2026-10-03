// Browser entry for the optional real-weight smoke test. Only the disk cache is
// injected by its build; inference and task routing use the production classes.
import { LocalModelService } from '../apps/obsidian/src/local-model.ts'
import { generateConversationTitle } from '../packages/agent-core/src/conversation-title.ts'

window.cateaSmoke = async (report = () => {}) => {
  let enabled = true
  let chatEnabled = false
  const service = new LocalModelService({
    enabled: () => enabled,
    chatEnabled: () => chatEnabled,
    changed: () => report(service.state.phase),
    cache: {
      available: async () => true,
      download: async () => {},
      blob: async () => (await fetch('/model.gguf')).blob(),
    },
  })
  const started = performance.now()
  const results = { prepareMs: 0, samples: [] }
  try {
    await service.initialize()
    results.prepareMs = Math.round(performance.now() - started)
    const model = (await service.select(new AbortController().signal)).model
    for (const [user, assistant] of [
      ['帮我整理小说人物关系。', '我们梳理了主人公与妹妹的矛盾，以及他们如何和解。'],
      [
        'How can I organize research notes for my thesis?',
        'Group notes by research question, keep sources with each excerpt, and review unanswered questions weekly.',
      ],
    ]) {
      report('Generating title…')
      const before = performance.now()
      const title = await generateConversationTitle(
        service,
        model,
        user,
        assistant,
        AbortSignal.timeout(120000),
      )
      if (!title) throw new Error('Invalid title')
      results.samples.push({ task: 'title', title, ms: Math.round(performance.now() - before) })
    }
    for (const english of [false, true]) {
      report('Generating diary…')
      const before = performance.now()
      let text = ''
      for await (const event of service.stream(
        {
          model,
          system: `You are Aria, an AI companion. ${english ? 'Write in English.' : 'Write in Chinese.'} Return JSON {"title":"...","body":"..."}.`,
          transcript: [
            {
              role: 'user',
              content: JSON.stringify({
                date: '2026-10-03',
                conversationExcerpts: english
                  ? 'User: I want to organize my research notes, but have not started. Assistant: We can group notes by question and keep sources beside excerpts. User: I like that. I will try tomorrow.'
                  : 'User: 我想整理小说人物关系，但今天还没写。Assistant: 我们可以先梳理主人公与妹妹的矛盾，再考虑和解的契机。User: 这个建议我喜欢，明天试试。',
              }),
            },
          ],
          tools: [],
          attachments: new Map(),
        },
        AbortSignal.timeout(120000),
      )) {
        if (event.type === 'done') text = event.reply.text
      }
      const diary = JSON.parse(text)
      if (!diary.title?.trim() || !diary.body?.trim()) throw new Error('Invalid diary')
      results.samples.push({
        task: 'diary',
        english,
        ...diary,
        ms: Math.round(performance.now() - before),
      })
    }
    report('Preparing the 32K chat context…')
    chatEnabled = true
    const beforeChat = performance.now()
    await service.prepare()
    results.chatPrepareMs = Math.round(performance.now() - beforeChat)
    const chatModel = service.chatModel()
    if (chatModel?.contextWindow !== 32768) throw new Error('Incorrect chat context')
    const history = []
    for (const question of ['我的猫叫米粒。请只回复“记住了”。', '我的猫叫什么？请用一句话回答。']) {
      history.push({ role: 'user', content: question })
      let reply = '',
        deltas = 0
      const before = performance.now()
      for await (const event of service.streamChat(
        {
          model: chatModel,
          system: '你是 Catea Lite，一个聊天助手。请简短回答，只使用中文。',
          transcript: history,
          tools: [],
          attachments: new Map(),
        },
        AbortSignal.timeout(120000),
      )) {
        if (event.type === 'delta') deltas++
        if (event.type === 'done') reply = event.reply.text
      }
      if (!reply.trim() || !deltas) throw new Error('Chat failed to stream')
      history.push({ role: 'assistant', content: reply })
      results.samples.push({
        task: 'chat',
        question,
        reply,
        deltas,
        ms: Math.round(performance.now() - before),
      })
    }
    report('Checking cancellation and worker recovery…')
    const signal = AbortSignal.timeout(5)
    try {
      for await (const _event of service.stream(
        {
          model,
          system: 'Return {"title":"..."}',
          transcript: [{ role: 'user', content: 'Give this conversation a title.' }],
          tools: [],
          attachments: new Map(),
        },
        signal,
      )) {
      }
      throw new Error('Cancellation did not interrupt generation')
    } catch (error) {
      if (!signal.aborted) throw error
    }
    const recovered = await generateConversationTitle(
      service,
      model,
      'Discuss gardening plans',
      'We planned to plant herbs tomorrow.',
      AbortSignal.timeout(120000),
    )
    if (!recovered) throw new Error('Worker did not recover after cancellation')
    results.recoveredTitle = recovered
    return results
  } finally {
    enabled = false
    await service.close()
  }
}
