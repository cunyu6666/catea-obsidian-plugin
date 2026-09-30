/**
 * [WHO]: Provides McpPool, Serial, VaultTools, createSkill, describeSkills, fileTools, listSkills,
 *   loadSkill, loadSkills, presetSkillIds, readJson, readSkillResource, within, writeJson
 * [FROM]: Depends on ./mcp, ./skills, ./storage, ./tools
 * [TO]: Consumed by (entry)
 * [HERE]: packages/integrations/src/index.ts - barrel re-exporting the integration surface; nothing imports it, consumers import the submodules directly
 */
export { VaultTools, fileTools } from './tools'
export { McpPool } from './mcp'
export {
  createSkill,
  describeSkills,
  listSkills,
  loadSkill,
  loadSkills,
  presetSkillIds,
  readSkillResource,
} from './skills'
export { within, readJson, writeJson, Serial } from './storage'
