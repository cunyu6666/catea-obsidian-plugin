# General memory with writing and knowledge extensions

Catea has one memory model, one `memory_*` tool surface and one authoritative
`memories.json` per scope under `.catea/memory/{global,aria,vex,pencil}/`.
`schemaVersion` describes the file format; it does not select a second engine.

## Categories and applicability

| Type | Content | Useful structured attributes |
| --- | --- | --- |
| `fact`, `entity` | General facts and entities | Evidence and sources |
| `preference` | General user preferences | Applicability |
| `lesson`, `procedural` | General experience and procedures | Steps |
| `decision` | General decisions | Rationale |
| `pattern`, `struggle` | Recurring patterns and difficulties | Applicability |
| `event`, `episode`, `facet`, `state` | Events, experiences and temporary conditions | Sources, TTL |
| `work` | General tasks and projects | Goal, stage |
| `writing-preference` | Style, phrasing, structure and examples | Positive/negative examples, applicability |
| `writing-project` | A writing or research effort | Goal, audience, stage, open questions |
| `concept` | Claims, definitions and relationships | Evidence, counterarguments |
| `material` | Examples, quotations, ideas and historical context | Source path, heading, block ID |
| `knowledge-method` | Reusable reading, research and writing methods | Steps, applicability |
| `editorial-decision` | An accepted editorial choice | Rationale, applicability |

General categories are the default. Use the six writing/knowledge extensions only
when the content explicitly belongs to those activities; do not duplicate a fact
under both a general type and an extension.

Every record carries identity, source attribution, retention, stability,
importance, confidence, timestamps and access count. Project and note fields
constrain applicability; they do not change persona permissions. Global recall
is combined with the current persona. Automatic extraction writes only to the
current persona; explicit tools can choose global scope.

Sources distinguish user, document, assistant, inference and imported history.
Their stance is endorsed, quoted, proposed or uncertain. Extraction requires an
exact user-message excerpt for a claimed user source, marks assistant proposals
and document quotations separately, and does not grant core retention to an
unsupported claim of user endorsement. This validates provenance, not the truth
of a model's interpretation. Imported history has uncertain attribution.

## Lifecycle

After a reply is saved, the service persists its extraction job in
`pending-turns.json`. The selected BYOK model returns structured records. Invalid
output stays queued with exponential backoff capped at one hour; the host checks
pending jobs every minute. The records and processed-turn receipt commit in one
atomic rename. Retrying after a crash between record commit and queue removal
cannot duplicate the turn. Old queue jobs are accepted regardless of their old
stage field and completed through this same path.

Recall uses local hash embeddings, Chinese character/bigram matching, recency,
importance and access reinforcement. Endorsed unscoped core general or writing preferences
can be included independently of query relevance. Entries include applicability
and source stance in the prompt and are explicitly reference data rather than
instructions. Retrieval has a 600 ms service budget and a cache keyed by persona
and exact query. It makes no model request on this path. Project/note filters are
available to explicit search. Automatic recall includes a project-scoped record
only when the current query explicitly mentions that project name; note-scoped
records require the note path (naming the project alone is insufficient).
Applicability is filtered before relevance ranking. Without an explicit scope,
only unscoped records are automatically injected. This conservative rule can miss
follow-up messages such as "continue"; use explicit scoped search in that case.
Matching is lexical, not an inference of the active editor or conversation project.

Search, recall, remember, edit, conflict resolution, forget and restore operate
on the same records. Forget archives a record; it does not permanently erase
history or migration backups. Automatic extraction cannot recreate an exact
duplicate of a user-forgotten record, even from a later turn. This is exact-content
suppression, not semantic suppression of paraphrases. Explicit remember/restore
remain available. Archived entries are searchable with
`includeArchived` and can be restored. Explicit TTLs expire against `updatedAt`.
Stale low-access, low-importance ambient project records archive after 21 days;
other ambient records after 90 days. Core records do not receive this default
staleness rule. Each successful background turn runs maintenance; `memory_dream`
can also run it explicitly and merges only exact duplicates with matching
applicability and attribution. Unlike the previous extension, this does not run
an additional LLM generalization pass or autonomous session-count-based dream.

Stats, review and insights return all general and extension categories, projects, uncertain
records and existing conflict links. They no longer generate the old
programmer-persona narrative. Original conversations and tool results remain in
session storage; new memories link to session/turn evidence rather than keeping
a separate episode copy of every turn.

## One-time migration

When a scope has no canonical document, migration imports its previous flat
stores, episode files, V2 records and links, including their archives. Source
JSON text is preserved exactly inside a content-addressed
`migration-backup-<digest>.json` before the canonical document is published.
Original source files are also left untouched. Existing backups are verified on
retry. No old engine is run, and migration never writes to an old-format file.

Mapping is intentionally conservative:

| Previous content | Unified type |
| --- | --- |
| Fact, entity, preference, lesson, decision, pattern, struggle, event | Same general type |
| Work entry | Work |
| Procedure | Procedural |
| Episode, episode facet, temporary state | Episode, facet, state |

Procedure steps, observations and other context are retained with the record;
raw source fields remain recoverable from the backup. Identical old mirrors are
collapsed, their IDs become aliases, and links are remapped. An archived mirror
wins over an identical active mirror to avoid reviving forgotten content.
Different content remains distinct. Ambiguous reuse of an ID preserves the V2
ID and qualifies the older conflicting copy. Migration does not infer new user
beliefs or turn old vault names into new writing-project identities.

Once the canonical file exists, old data is never consulted again, even if the
canonical file is invalid or empty. Corrupt or unsupported canonical data causes
an error instead of resurrecting stale memories. Invalid source JSON or malformed
records stop migration without publishing a partial document. Symlinked paths
are rejected. These guarantees are covered by temporary-vault behavior tests.

This is a one-way runtime migration. Downgrading the plugin can see only the
unchanged pre-migration source files; new writes are not exported to old formats.
The backup is recovery material, not a live second store. No real vault is changed
by the repository tests.

Existing canonical records are not silently reclassified. The earlier six-type
format remains readable; this change extends the accepted categories without
rewriting user-edited records or replaying an old backup. New legacy imports
preserve general types, while already classified writing records retain their types.
