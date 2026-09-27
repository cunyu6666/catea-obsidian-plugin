/**
 * [WHO]: Provides PersonaId, persona, personas
 * [FROM]: Depends on ./aria.md, ./pencil.md, ./vex.md
 * [TO]: Consumed by apps/obsidian/src/panel.tsx, packages/agent-core/src/index.ts
 * [HERE]: packages/personas/src/index.ts - persona registry loading the Vex, Aria and Pencil prompt documents plus a persona(id) lookup defaulting to Aria
 */
import vex from './vex.md'
import aria from './aria.md'
import pencil from './pencil.md'
export const personas = [{id:'vex',name:'Vex',content:vex},{id:'aria',name:'Aria',content:aria},{id:'pencil',name:'Pencil',content:pencil}] as const
export type PersonaId = typeof personas[number]['id']
export function persona(id:string) {return personas.find(p=>p.id===id) || personas[1]}
