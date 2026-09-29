import {motion,useReducedMotion} from 'motion/react'

// Adapted from beUI's MIT-licensed Loader dither variant.
// Source: https://github.com/starc007/ui-components/blob/main/components/motion/loader.tsx
const BAYER_4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]

/** A fixed-footprint loading indicator. Color follows the surrounding text. */
export function DitherLoader({label='Loading'}:{label?:string}){
  const size=14
  const reduce=useReducedMotion()??false
  const gap=Math.max(1,size*0.05)
  const cell=(size-gap*3)/4
  return <span className="anno-dither-loader" role="status"  style={{width:size,height:size,gap,gridTemplateColumns:`repeat(4, ${cell}px)`}}><span className="catea-sr-only">{label}</span>
    {BAYER_4.map((order,index)=><motion.span key={index} aria-hidden="true" style={{width:cell,height:cell,backgroundColor:'currentColor'}} animate={{opacity:reduce?[0.3,1,0.3]:[0.1,1,0.1]}} transition={{duration:reduce?1.4:1,ease:'easeInOut',repeat:Infinity,delay:order/16}}/>)}
  </span>
}
