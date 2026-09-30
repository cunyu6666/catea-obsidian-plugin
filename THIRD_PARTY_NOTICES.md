# Source notices

- ANNO (user-owned local source): streaming providers, transcript/attachment types and helpers, Persona definitions. Source: apps/extension/src. These are adapted for the Obsidian host.
- CatUI mem-core: packages/memory/upstream is a source snapshot; source revision and modification are recorded in packages/memory/UPSTREAM.md. GPL-3.0 license retained at packages/memory/LICENSE and in release output LICENSE. No CatUI process is required.
- ANNO / Craft Agents UI: Composer, AttachmentCards, ResponseCard and AgentActivities adapted in the design system, vendored here under packages/design-system. Craft Agents upstream attribution is retained in packages/design-system/CRAFT-AGENTS-NOTICE.
- Tabler Outline 3.48.0: MIT, TABLER-LICENSE.txt.
- beUI Loader dither variant: adapted in packages/design-system/components/src/DitherLoader.tsx. MIT, packages/design-system/BEUI-LICENSE.txt.
- Remix Icon 4.8.0: selected line/fill icons in apps/obsidian/remix-dock for the navigation dock, and ten line icons in apps/obsidian/remix-folders for folder customization. Apache-2.0, REMIX-LICENSE.txt.
- Runtime dependencies retain their respective licenses: React, react-markdown, remark-gfm, and the official MCP TypeScript SDK.

CatUI link-world: packages/integrations/src/web.ts adapts the native search/reader fallbacks and HTML parsers from extensions/builtin/link-world/index.ts (GPL-3.0, local source d6d110aa645cd5e2305dde42e04040bddafb5e6a). It adds Obsidian transport, cancellation, URL checks, output limits and capability-gated CLI calls.

CatUI standard agent loop, context-window controller and context-management tools: vendored at packages/agent-core/upstream from d6d110aa645cd5e2305dde42e04040bddafb5e6a, GPL-3.0. See packages/agent-core/UPSTREAM.md for host adaptations.
ANNO AskUserQuestion parser/schema, StreamingChatResponse and ApprovalCard are reused in the real Obsidian chat. ApprovalCard's BeUI MIT attribution is retained in its source. Motion runtime is used for the original card transitions and reduced-motion behavior.

ANNO CodeBlock and MermaidDiagram: adapted from packages/design-system/src/components/CodeBlock.tsx and apps/extension/src/MermaidDiagram.tsx. Shiki and beautiful-mermaid retain their MIT licenses. File-type icons use the existing Tabler set; fullscreen uses the native Obsidian/Electron dialog surface.


## React Git Log

The optional Git history sidebar uses `@tomplum/react-git-log` 3.5.1 by Thomas
Plumpton, licensed under Apache-2.0. Source: https://github.com/TomPlum/react-git-log.
Its license and those of its bundled dependencies (`@uidotdev/usehooks`,
`classnames`, `dayjs`, `fastpriorityqueue`, and `react-tiny-popover`) are included
as `REACT-GIT-LOG-LICENSE.txt` in the built distribution.
The component is styled for Catea; repository access is implemented separately
using bounded, local, read-only Git commands.

