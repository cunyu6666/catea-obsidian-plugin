# Source notices

- ANNO (user-owned local source): streaming providers, transcript/attachment types and helpers, Persona definitions. Source: apps/extension/src. These are adapted for the Obsidian host.
- CatUI mem-core: packages/memory/upstream is a source snapshot; source revision and modification are recorded in packages/memory/UPSTREAM.md. GPL-3.0 license retained at packages/memory/LICENSE and in release output LICENSE. No CatUI process is required.
- ANNO / Craft Agents UI: Composer, AttachmentCards, ResponseCard and AgentActivities adapted in the design system, vendored here under packages/design-system. Craft Agents upstream attribution is retained in packages/design-system/CRAFT-AGENTS-NOTICE.
- Tabler Outline 3.48.0: MIT, TABLER-LICENSE.txt. The 5,166-glyph table embedded in the vendored Paper base is emptied at build time by scripts/paper-icon-prune.mjs and is not part of the shipped plugin.
- beUI Loader dither variant: adapted in packages/design-system/components/src/DitherLoader.tsx. MIT, packages/design-system/BEUI-LICENSE.txt.
- Remix Icon 4.8.0: selected line/fill icons in apps/obsidian/remix-dock for the navigation dock, ten line icons in apps/obsidian/remix-folders for folder customization, the folder and file line icons in apps/obsidian/remix-explorer for the file explorer, and 141 line icons in apps/obsidian/remix-skin/icons used by apps/obsidian/src/remix-skin.ts to replace Obsidian's native Lucide glyphs. Apache-2.0, REMIX-LICENSE.txt.
- cc-switch (src/icons/extracted): the vendor icon SVG strings in apps/obsidian/src/vendor-icons.ts are adapted from this project. MIT, Copyright (c) 2025 Jason Young. Source: https://github.com/farion1231/cc-switch. Brand marks remain the property of their respective owners and are used nominatively to identify each vendor's own service; the Groq tile is an original Catea monogram.
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

## Bundled skill presets

Two skill prompts ship inside the plugin bundle as text. They are adaptations, not
copies, and neither is ever written into the user's vault.

`packages/integrations/src/skill-creator.md` adapts `skill-creator` from
`anthropics/skills` at commit `8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`
(Apache-2.0; upstream file `skills/skill-creator/SKILL.md`, 33168 bytes,
sha256 `dcd4803e61e913e6fc27294184cd3a71f09f5e924ff20c8a9a20173e7b3c2bcf`).
Kept: intent capture from the conversation, description-as-trigger guidance,
progressive disclosure, the Principle of Lack of Surprise, and explaining why
instead of stacking MUSTs. Replaced: the evaluation loop, which is about 72% of
the upstream body and requires Python scripts, the `claude -p` CLI, subagent
fan-out, a local browser viewer and a `present_files` tool that Catea does not
have. The upstream `scripts/`, `agents/`, `assets/` and `eval-viewer/` tree
(about 192 KB) is not redistributed.

`packages/integrations/src/find-skill.md` adapts `find-skills` from
`vercel-labs/skills` at commit `3694740352eeef5cdd689af694c485f1ff62eec3`
(MIT; upstream file `skills/find-skills/SKILL.md`, 5472 bytes,
sha256 `c00eeea0e13e74fe4a9d84ba0a8542205a1b736d65f13134fe1a6647eb14976f`).
Kept: the activation list, the quality ladder of install count, source reputation
and repository standing, the structured presentation of candidates, and admitting
when nothing exists. Replaced: every `npx skills` invocation, which needs a separately installed CLI and npx environment; discovery uses the skills.sh HTTP search endpoint
through `web_fetch`, and installation uses `skill_create` after the user has read
the full text. The upstream `-y` confirmation-skipping flag is deliberately not
reproduced, because third-party text may only enter a system prompt on approval.

The full upstream license texts are included in `SKILL-CREATOR-LICENSE.txt` and
`FIND-SKILL-LICENSE.txt`, and in the release bundle header so plugin-manager
installs that download only the three required assets retain these notices.
