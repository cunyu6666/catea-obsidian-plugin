/**
 * [WHO]: Provides McpPool, Serial, VaultTools, fileTools, listSkills, loadSkills, readJson,
 *   readSkillResource, within, writeJson
 * [FROM]: Depends on ./mcp, ./skills, ./storage, ./tools
 * [TO]: Consumed by (entry)
 * [HERE]: packages/integrations/src/index.ts - barrel re-exporting the integration surface; nothing imports it, consumers import the submodules directly
 */
export { VaultTools, fileTools } from './tools'
export { McpPool } from './mcp'
export { loadSkills, listSkills, readSkillResource } from './skills'
export { within, readJson, writeJson, Serial } from './storage'
