# Catea Figma Bridge MVP

This is a minimal local bridge for testing Catea-to-Figma canvas writes.

## Run the bridge

```bash
npm --workspace catea-figmabeidge run start
```

The server listens on `http://127.0.0.1:38451`.

## Load the Figma plugin

1. Open Figma Desktop.
2. Open or create a Design file.
3. Open `Plugins -> Development -> Import plugin from manifest...`.
4. Select `packages/figmabeidge/plugin/manifest.json`.
5. Run `Plugins -> Development -> Catea Figma Bridge`.
6. Keep the small bridge window open.

## Smoke test

With the bridge server running and the plugin window open:

```bash
npm --workspace catea-figmabeidge run smoke
```

The plugin should render a `Catea Bridge Smoke` frame in the currently open
Figma file.

## Connector route

In Catea's Connector settings, select Figma adapter `figma_local_plugin_bridge`.
Then `connector_create`, `connector_update`, and `connector_share` enqueue write
jobs to this local bridge.
