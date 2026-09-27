import vex from './vex.md'
import aria from './aria.md'
import pencil from './pencil.md'
export const personas = [{id:'vex',name:'Vex',content:vex},{id:'aria',name:'Aria',content:aria},{id:'pencil',name:'Pencil',content:pencil}] as const
export type PersonaId = typeof personas[number]['id']
export function persona(id:string) {return personas.find(p=>p.id===id) || personas[1]}
