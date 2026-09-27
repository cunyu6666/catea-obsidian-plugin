# Source notices

- ANNO (user-owned local source): streaming providers, transcript/attachment types and helpers, Persona definitions. Source: apps/extension/src. These are adapted for the Obsidian host.
- CatUI mem-core: packages/memory/upstream is a source snapshot; source revision and modification are recorded in packages/memory/UPSTREAM.md. GPL-3.0 license retained at packages/memory/LICENSE and in release output LICENSE. No CatUI process is required.
- ANNO / Craft Agents UI: Composer, ResponseCard and AgentActivities adapted in the separate catea-design-system repository. Craft Agents upstream attribution is retained there.
- Tabler Outline 3.48.0: MIT, TABLER-LICENSE.txt.
- Runtime dependencies retain their respective licenses: React, react-markdown, remark-gfm, and the official MCP TypeScript SDK.

CatUI link-world: packages/integrations/src/web.ts adapts the native search/reader fallbacks and HTML parsers from extensions/builtin/link-world/index.ts (GPL-3.0, local source d6d110aa645cd5e2305dde42e04040bddafb5e6a). It adds Obsidian transport, cancellation, URL checks, output limits and capability-gated CLI calls.

CatUI standard agent loop, context-window controller and context-management tools: vendored at packages/agent-core/upstream from d6d110aa645cd5e2305dde42e04040bddafb5e6a, GPL-3.0. See packages/agent-core/UPSTREAM.md for host adaptations.
ANNO AskUserQuestion parser/schema, StreamingChatResponse and ApprovalCard are reused in the real Obsidian chat. ApprovalCard's BeUI MIT attribution is retained in its source. Motion runtime is used for the original card transitions and reduced-motion behavior.

ANNO CodeBlock and MermaidDiagram: adapted from packages/design-system/src/components/CodeBlock.tsx and apps/extension/src/MermaidDiagram.tsx. Shiki and beautiful-mermaid retain their MIT licenses. File-type icons use the existing Tabler set; fullscreen uses the native Obsidian/Electron dialog surface.
