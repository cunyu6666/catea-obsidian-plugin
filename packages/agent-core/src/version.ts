/**
 * [WHO]: Provides PLUGIN_VERSION
 * [FROM]: Depends on (none)
 * [TO]: Consumed by packages/integrations/src/mcp.ts, packages/integrations/src/web.ts
 * [HERE]: packages/agent-core/src/version.ts - single runtime source for the plugin version; a governance test keeps it equal to manifest.json so the version cannot drift
 */

export const PLUGIN_VERSION = '0.3.13'
