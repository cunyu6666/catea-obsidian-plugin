<!-- Keep this short. Reviewers need to know what changed and why, not a restatement of the diff. -->

## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm test` passes (contract, isomorphism and version gates)
- [ ] `npm run typecheck` passes
- [ ] If an export was added, renamed or removed, its P3 `[WHO]` was updated in the same change
- [ ] If an import changed, the P3 `[FROM]` still matches the real imports
- [ ] If a consumer changed, the target file's P3 `[TO]` was updated
- [ ] If a file was added or deleted, the module's P2 member list was updated
- [ ] If the version moved, `manifest.json`, both `package.json` files, `version.ts` and `versions.json` all agree
- [ ] Documentation and code comments are in English; any new user-facing string goes through `locale.ts` or `i18n.ts`

## Verification

<!-- What did you actually run, and what did you observe? Paste the output that
     proves it. "Should work" is not evidence; neither is a command you did not run. -->