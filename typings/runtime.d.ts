/// <reference path="./node/index.d.ts" />

// Load the official Node ambient declarations through the source import graph.
// A source-only scanner may replace tsconfig's automatic typeRoots. The plugin
// entry imports this module with `import type`, so no runtime dependency is emitted.
export {}
