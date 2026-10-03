/**
 * [WHO]: Provides LocalModelRuntime
 * [FROM]: Depends on @wllama/wllama/esm/index.js
 * [TO]: Consumed by apps/obsidian/src/local-model.ts
 * [HERE]: apps/obsidian/src/local-model-runtime.ts - bundled CPU inference in a WebAssembly worker, bounded prompts, non-thinking generation and validated JSON stopping
 */
import { Wllama } from '@wllama/wllama/esm/index.js'

declare const CATEA_LOCAL_WASM: string

export class LocalModelRuntime {
  private engine?: Wllama
  private wasmUrl?: string
  private contextWindow = 4096
  async load(model: Blob, contextWindow = 4096) {
    this.contextWindow = contextWindow
    if (typeof CATEA_LOCAL_WASM !== 'string') throw new Error('Local runtime is unavailable')
    const compressed = Uint8Array.from(atob(CATEA_LOCAL_WASM), (char) => char.charCodeAt(0))
    const wasm = await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).blob()
    this.wasmUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }))
    const quiet = () => {}
    this.engine = new Wllama(
      { 'single-thread/wllama.wasm': this.wasmUrl },
      { logger: { debug: quiet, log: quiet, warn: quiet, error: quiet }, suppressNativeLog: true },
    )
    await this.engine.loadModel([model], {
      n_ctx: contextWindow,
      n_batch: 128,
      n_threads: 1,
      ...(contextWindow === 32768
        ? { cache_type_k: 'q8_0' as const, cache_type_v: 'q8_0' as const, flash_attn: true }
        : {}),
    })
    if (this.engine.getLoadedContextInfo().n_ctx !== contextWindow)
      throw new Error('Local context initialization failed')
  }
  async generate(system: string, text: string, title: boolean, signal: AbortSignal) {
    if (!this.engine) throw new Error('Local runtime is unavailable')
    signal.throwIfAborted()
    // This model's ChatML template can disable thinking without parsing hidden reasoning.
    // Strip control tokens so supplied conversation text cannot create a new template role.
    const clean = (value: string) => value.replace(/<\|[^>]*\|>/g, '')
    const prompt = `<|im_start|>system\n${clean(system)}\n<|im_end|>\n<|im_start|>user\n${clean(text)}\n<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`
    const tokens = await this.engine.tokenize(prompt, true)
    const maxTokens = title ? 96 : 640
    if (tokens.length + maxTokens > 4096) throw new Error('Local prompt exceeds the limit')
    return this.engine.createCompletion(prompt, {
      nPredict: maxTokens,
      useCache: false,
      abortSignal: signal,
      onNewToken: (_token, _piece, text, controls) => {
        try {
          const parsed: unknown = JSON.parse(text.trim())
          if (
            parsed &&
            typeof parsed === 'object' &&
            'title' in parsed &&
            typeof parsed.title === 'string' &&
            parsed.title.trim() &&
            (title || ('body' in parsed && typeof parsed.body === 'string' && parsed.body.trim()))
          )
            controls.abortSignal()
        } catch {
          // Partial JSON is expected while generating; consumers validate the final shape.
        }
      },
      sampling: {
        temp: 0.2,
        top_p: 0.8,
        top_k: 20,
        penalty_repeat: 1.1,
      },
    })
  }
  async close() {
    try {
      await this.engine?.exit()
    } finally {
      this.engine = undefined
      if (this.wasmUrl) URL.revokeObjectURL(this.wasmUrl)
      this.wasmUrl = undefined
    }
  }

  async chat(
    system: string,
    messages: ReadonlyArray<{ role: string; content: string }>,
    signal: AbortSignal,
    delta: (text: string) => void,
  ) {
    if (!this.engine || this.contextWindow !== 32768) throw new Error('Catea Lite is unavailable')
    const clean = (text: string) => text.replace(/<\|[^>]*\|>/g, '')
    signal.throwIfAborted()
    const turns = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    const build = (items: typeof turns) =>
      `<|im_start|>system\n${clean(system)}\n<|im_end|>\n` +
      items.map((m) => `<|im_start|>${m.role}\n${clean(m.content)}\n<|im_end|>\n`).join('') +
      '<|im_start|>assistant\n<think>\n\n</think>\n\n'
    const outputBudget = 1024
    let prompt = build(turns)
    let tokens = await this.engine.tokenize(prompt, true)
    // Keep the complete saved transcript while selecting recent whole turns locally.
    // Never shorten the latest user message silently, or cut a retained turn in half.
    while (tokens.length + outputBudget > this.contextWindow && turns.length > 1) {
      signal.throwIfAborted()
      turns.shift()
      while (turns[0]?.role === 'assistant') turns.shift()
      prompt = build(turns)
      tokens = await this.engine.tokenize(prompt, true)
    }
    if (tokens.length + outputBudget > this.contextWindow)
      throw new Error('Catea Lite 32K context limit exceeded')
    let previous = ''
    const text = await this.engine.createCompletion(prompt, {
      nPredict: outputBudget,
      useCache: true,
      abortSignal: signal,
      onNewToken: (_token, _piece, current) => {
        delta(current.slice(previous.length))
        previous = current
      },
      sampling: { temp: 0.7, top_p: 0.8, top_k: 20, penalty_repeat: 1.1 },
    })
    signal.throwIfAborted()
    return text
  }
}
