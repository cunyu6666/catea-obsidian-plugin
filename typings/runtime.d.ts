// Source scanners can replace tsconfig's typeRoots, so load the runtime contract
// through the entry point's type-only import. Nothing is emitted into main.js.
import './node-runtime'
export {}
