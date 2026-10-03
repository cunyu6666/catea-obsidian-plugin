# Catea Lite local inference

Catea Lite has three independent switches in **Settings → Catea → Local assistant**:
local chat, conversation titles, and diaries. Enabling any switch downloads the
same approximately 462 MiB model once and prepares it automatically. The shared
status row shows progress, retry, and deletion. There is no provider, key, server,
executable installation, or model-format setup. Both UI languages use Catea Lite.
Required upstream attribution remains in third-party notices and license files;
the display name does not claim independent model training.

## Boundaries and routing

Enabling **local chat** adds a synthetic Catea Lite profile to the right-sidebar
model picker after verification and a real loading self-test. It is not stored in
the global BYOK profile collection. Selection persists by its stable local ID.
Disabling chat stops its active turns and removes it from the picker; an existing
Lite selection stays unavailable until re-enabled or explicitly changed. It never
silently falls back to a cloud model, including when creating a new chat after restart.

Lite chat uses a separate `ModelClient` port before Agent tools, MCP, skills,
current-note preparation, memory recall/extraction, or remote compaction are reached.
It accepts only text and explicitly quoted text. Attachment actions and the skill
picker are hidden; any retained attachments must be removed before sending.
Only displayed user/assistant text and explicit quote snapshots enter local history,
not old tool output or automatically attached current-note contexts. The remote
client refuses any local-transport profile. Existing remote memory jobs can still
run in the background; Lite turns do not enqueue new ones.

Chat allocates **32,768 tokens**, including the system prompt and a reserved
**1,024-token maximum reply**. The runtime verifies the actual loaded context.
It uses Q8 KV caches and Flash Attention to stay within the WebAssembly address
space: a full FP16 cache alone occupied 3,584 MiB and failed to load. The Q8 cache
uses 1,904 MiB, plus model and runtime memory. Tokenization checks the exact
prompt. When history exceeds the budget, whole older turns leave the active
window while the saved transcript remains complete. An oversized latest input
is refused without silent shortening. This is a window over recent text, not a
remote-generated summary. Long inputs can be slow on the single-thread CPU.
A concise persona summary avoids the cost of the full Agent prompt. Chat reuses
the runtime prompt cache for subsequent turns; auxiliary tasks may invalidate it.
Replies stream, can be stopped, and partial replies remain in saved history.
Additional text stays in the draft during generation instead of queuing tools.

**Conversation titles** and **diaries** select local inference independently.
Without each local switch, that auxiliary task retains its default-model behavior.
A selected but unavailable local task never silently falls back to the cloud.
Titles retain the initial user-message fallback during preparation without
consuming a generation attempt; later turns retry. Diaries keep their durable
cursor and retry. Preparation requests diary catch-up only when local diaries
are selected. Diaries still require eligible completed conversations from a
locally recorded active date; unopened days are not fabricated.

One service serializes chat and auxiliary requests. Title input is capped at
1,800 characters and diary input at 2,400. Auxiliary requests retain a 4,096-token
budget, even when the shared worker is allocated for 32K chat. Titles use a short
prompt and enforce the existing 24-character display limit. Diaries use a factual
prompt with role mapping and an example preserving incomplete work and future
plans. JSON completion is stopped early and existing parsers validate it. Prompt
control tokens are stripped; this does not establish complete injection resistance.

## Download and runtime

`LocalModelCache` writes a unique exclusive temporary file and publishes it only
after exact size and streamed SHA-256 verification. Its pinned artifact is
484,220,320 bytes with SHA-256
`9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14`.
The revision, source and license are recorded in `THIRD_PARTY_NOTICES.md`.
Cache reuse rechecks both size and hash. Corruption triggers a new download;
failed and canceled downloads remove their temporary file. Directory confinement
refuses model symlinks that resolve outside the cache.

Weights live under `<Obsidian userData>/catea/models/catea-0.6b-q4-v1.gguf`,
outside synced vaults. The vault persists `localChat`, `localTitles`, and
`localDiary`; generated conversations, titles, and diaries use their existing
vault stores. The previous `localAuxiliaryModel` option migrates to the title and
diary switches while chat remains off. Development builds share
the public weight cache while keeping their `.catea-dev` state separate.

Downloads use Electron's native streaming network stack and OS proxy settings.
Only the pinned public weights URL and its file-delivery redirects are requested,
with credentials omitted and no referrer. Conversation contents never enter the
download request. A native main-process abort controller bridges renderer
cancellation; a renderer AbortSignal cannot be passed directly through Electron
remote. A local Response wraps native chunk reads and cleans up on cancellation,
failure or EOF. A stalled download can be turned off and is bounded to 30 minutes.

`@wllama/wllama` is pinned to 2.4.0. The single-thread CPU WebAssembly runtime
ships gzip-compressed inside `main.js`, rather than as an activation-time
executable download. `LocalModelRuntime` inflates it into a Blob URL and loads
the GGUF into a worker. Preparation includes a real short inference self-test.
The worker unloads when all three switches are off, on plugin unload, or after two minutes without work;
cached weights remain until explicitly deleted. Retrying uses the same verified
cache. There is no GPU or multithread requirement.

The build applies `scripts/local-model-runtime-patch.mjs` in memory to the npm
dependency. It checks the original `esm/index.js` SHA-256
`08e0fad5c9efdf4414ca2e27d0d8d5bdfa54d91a8054b40d9d9c90c9ce870b9d`:

- Both generated Emscripten worker environment checks use the browser path.
  Obsidian exposes Node globals in workers; the original check otherwise attempts
  to read a `blob:app://` URL with Node fs and fails.
- Worker termination runs in `finally` when exiting, including after failed load.

The installed dependency and vendored snapshots are never edited. Source changes
fail the build until this adaptation is reviewed. The same patch is used by the
optional browser smoke test. Full runtime/model licenses are copied to the build
and embedded in its header, preserving attribution in three-asset plugin installs.
The existing 5,000,000-byte main.js gate remains mandatory.

## Verification and limits

On 2026-10-03, real pinned weights ran through the production runtime and service
in a local Chrome smoke test. Preparation including self-test took about 4.5 s;
Chinese and English titles took about 7-8 s; short Chinese and English diary
samples took about 20-23 s. Cancellation was followed by another successful
title on the same worker. These timings are individual CPU measurements on the
test Mac, not performance guarantees or a broad model-quality evaluation.

An isolated Obsidian 1.13.7 profile and empty test vault also loaded the actual
plugin build. The settings toggle initiated the complete native download with
visible progress, checksum verification, worker preparation and self-test. Cached
weights then loaded successfully after the worker compatibility fix. A fresh
end-to-end download on the fixed build passed, a Chinese title generated locally
in about 10 s and a short Chinese diary in about 35 s, and turning off released
the worker while preserving the cache. Native settings screenshots were inspected. No personal
vault, credentials or conversations were used.

The previous auxiliary-only native settings check confirmed retry is hidden when ready, deletion
removes the downloaded file and switches the option off, and both action buttons
are hidden afterward. `npm ci`, 529 tests, 73 behavior regressions, typecheck,
lint, formatting, marketplace analysis, and both build identities passed.
Release `main.js` was 4,458,659 bytes; the development identity was 4,458,683 bytes.

The current three-switch version also passed an isolated native Obsidian check
with the actual loaded context reporting 32,768 tokens. Independent chat opt-in
published the picker model while title/diary switches stayed off. A two-turn
Chinese exchange recalled a supplied cat name. With the compact persona prompt,
short first replies took about 12–20 s and cached follow-ups about 2–5 s. Stopping
kept partial text; subsequent replies succeeded in about 2–3 s. An auxiliary-only configuration loaded a 4K context and generated a valid English
title while leaving chat absent from the picker. Deletion turned off all three
switches and removed the cache. Disabling chat removed
the model, retained its selection as unavailable, and refused another send.
The settings and composer screenshots were inspected. These are individual
CPU timings on a 32 GiB test Mac, not latency or memory guarantees. Full-window
32K prefill speed and recall accuracy have not been evaluated.

The current source passed 536 tests, 75 behavior regressions, typecheck, lint,
formatting, and marketplace analysis (165 files, zero unsafe-type findings).
Both build identities passed: release `main.js` is 4,469,973 bytes and the
development bundle 4,469,997 bytes, below the mandatory 5 MB limit.

Automated regressions cover cache tampering, bad size/hash, cancellation cleanup,
outside-cache symlinks, the native abort bridge, serialized jobs, self-test failure,
retry, local routing without BYOK, preservation of title retries, no cloud fallback,
independent switches and model publication only after a 32K self-test, saved
multi-turn/stopped replies, tool/note/memory/cloud isolation, whole-turn token
budgeting, oversized-input rejection, native settings states and diary attendance.

The optional real-weight smoke test is reproducible without changing project
dependencies:

```bash
node scripts/verify-local-model.mjs --model /absolute/path/to/catea-0.6b-q4-v1.gguf
# Open the printed loopback URL and click Run smoke test.
# For automation, optionally pass an existing Playwright module:
node scripts/verify-local-model.mjs --model /absolute/path/to/model.gguf \
  --playwright /absolute/path/to/playwright/index.mjs
```

This small model trades richer persona prose and reasoning quality for a
local runtime. Small-model diaries may still misstate or omit facts; the limited
samples do not establish general factual accuracy. Windows, Linux, older Obsidian
installers, GPU acceleration and large-vault diary backlogs have not been tested
here. The feature is in working source and has not been published.
