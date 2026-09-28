declare module '*.md' {const text:string;export default text}
declare module '*.css' {const text:string;export default text}
declare module '*.png' {const url:string;export default url}

// Host-provided optional transports, externalized by esbuild.
declare module 'electron' {export const net: {fetch:typeof fetch}|undefined}
declare module '@electron/remote' {export const net: {fetch:typeof fetch}|undefined}
