# Node runtime contracts for source-only analysis

`runtime.d.ts` enters the source graph through the plugin entry's type-only
import. It loads `node-runtime.d.ts`, a small authored description of only the
Node APIs used by Catea. Neither file emits JavaScript.

The marketplace source scanner did not load npm-installed Node types. A complete
copy fixed 434 unsafe-value reports in release 0.3.19, but the scanner also linted
the declarations themselves, producing six errors and many warnings. This
contract replaces those copied packages without changing runtime behavior.

`npm run check:marketplace` verifies:

- Structural compatibility with the lockfile's official Node types, with renamed
  modules/globals so declarations cannot validate themselves. The custom
  `promisify(execFile)` result is checked using the actual Node pair.
- Typechecking with installed Node/Undici types hidden, automatic types disabled,
  and custom type roots removed. Runtime sources include vendored dependencies;
  tests and the unused upstream CLI/extension are outside this simulation.
- The full official recommended ESLint rules on runtime sources and declarations.
- No compile-only Tailwind directives in browser stylesheet sources.

When adding a Node API, add only its used overloads and observable output fields,
then rerun the gate. Do not add permissive catch-all signatures or suppressions.
Normal development still installs the complete official declarations.
