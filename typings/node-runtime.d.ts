// The Node API surface used by Catea. These contracts are checked structurally
// against the lockfile's official Node declarations by verify-marketplace.mjs.
// Keep input overloads narrow and output types honest; do not add catch-all APIs.
interface Buffer<
  TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
> extends Uint8Array<TArrayBuffer> {
  toString(encoding?: 'utf8' | 'utf-8' | 'base64' | 'hex'): string
}
declare const Buffer: {
  from(value: string, encoding?: 'utf8' | 'utf-8' | 'base64' | 'hex'): Buffer
  from(value: Uint8Array): Buffer
}
declare const process: {
  env: Record<string, string | undefined>
  platform: string
  pid: number
  argv: string[]
  cwd(): string
  exit(code?: number): never
  kill(pid: number, signal?: string | number): true
  stdout: { write(value: string): boolean }
  stderr: { write(value: string): boolean }
}
declare function require(id: string): unknown
declare namespace NodeJS {
  interface ErrnoException extends Error {
    errno?: number
    code?: string
    path?: string
    syscall?: string
  }
}
declare module 'node:fs' {
  export function createReadStream(path: string): AsyncIterable<Buffer>
  export interface Stats {
    size: number
    mtimeMs: number
    mtime: Date
    isDirectory(): boolean
    isFile(): boolean
    isSymbolicLink(): boolean
  }
  export interface Dirent {
    name: string
    isDirectory(): boolean
    isFile(): boolean
    isSymbolicLink(): boolean
  }
  export function existsSync(path: string): boolean
  export function writeFileSync(path: string, data: string, encoding?: 'utf8' | 'utf-8'): void
}
declare module 'node:fs/promises' {
  export interface FileHandle {
    writeFile(data: Uint8Array): Promise<void>
    close(): Promise<void>
  }
  export function open(path: string, flags: 'wx'): Promise<FileHandle>
  export function readFile(path: string, encoding: 'utf8' | 'utf-8'): Promise<string>
  export function readFile(path: string): Promise<Buffer>
  export function readdir(path: string): Promise<string[]>
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<import('node:fs').Dirent[]>
  export function stat(path: string): Promise<import('node:fs').Stats>
  export function lstat(path: string): Promise<import('node:fs').Stats>
  export function mkdir(
    path: string,
    options: { recursive: true; mode?: number },
  ): Promise<string | undefined>
  export function writeFile(
    path: string,
    data: string | Uint8Array,
    options?: 'utf8' | 'utf-8' | { mode?: number; flag?: string },
  ): Promise<void>
  export function rename(from: string, to: string): Promise<void>
  export function realpath(path: string): Promise<string>
  export function rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>
  export function unlink(path: string): Promise<void>
  export function cp(from: string, to: string, options?: { recursive?: boolean }): Promise<void>
  export function utimes(path: string, atime: Date, mtime: Date): Promise<void>
}
declare module 'node:path' {
  export function join(...paths: string[]): string
  export function resolve(...paths: string[]): string
  export function relative(from: string, to: string): string
  export function isAbsolute(path: string): boolean
  export function dirname(path: string): string
  export function basename(path: string, suffix?: string): string
}
declare module 'node:os' {
  export function homedir(): string
}
declare module 'node:crypto' {
  export interface Hash {
    update(data: string): this
    update(data: Uint8Array): this
    digest(encoding: 'hex'): string
  }
  export function createHash(algorithm: string): Hash
  export function randomUUID(): `${string}-${string}-${string}-${string}-${string}`
}
declare module 'node:events' {
  export class EventEmitter {
    listenerCount(event: string | symbol): number
    emit(event: string | symbol, ...args: unknown[]): boolean
  }
}
declare module 'node:child_process' {
  export interface ExecFileOptions {
    cwd?: string
    encoding?: 'utf8'
    timeout?: number
    maxBuffer?: number
    windowsHide?: boolean
    signal?: AbortSignal
    env?: Record<string, string | undefined>
  }
  export interface DataStream {
    on(event: 'data', listener: (chunk: Buffer) => void): this
  }
  export interface ChildProcess {
    pid?: number
    kill(signal?: string | number): boolean
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'close', listener: (code: number | null, signal: string | null) => void): this
  }
  export interface PipedChildProcess extends ChildProcess {
    stdout: DataStream
    stderr: DataStream
  }
  export interface SpawnOptions {
    cwd?: string
    shell?: boolean
    detached?: boolean
    stdio: ['ignore', 'pipe', 'pipe']
  }
  export function spawn(command: string, options: SpawnOptions): PipedChildProcess
  export function spawn(command: string, args: string[], options: SpawnOptions): PipedChildProcess
  export function execFile(
    file: string,
    args: string[],
    options: ExecFileOptions,
    callback?: (error: Error | null, stdout: string, stderr: string) => void,
  ): ChildProcess
}
declare module 'node:util' {
  export function format(...values: unknown[]): string
  // execFile supplies Node's custom promisify implementation with two outputs.
  export function promisify(
    fn: typeof import('node:child_process').execFile,
  ): (
    file: string,
    args: string[],
    options: import('node:child_process').ExecFileOptions,
  ) => Promise<{ stdout: string; stderr: string }>
}
declare module 'node:http' {
  export interface IncomingMessage {
    statusCode?: number
    headers: Record<string, string | string[] | undefined>
    resume(): this
    destroy(error?: Error): this
    on(event: 'data', listener: (chunk: Buffer) => void): this
    on(event: 'end', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
  }
  export interface ClientRequest {
    on(event: 'error', listener: (error: Error) => void): this
    setTimeout(timeout: number, callback: () => void): this
    destroy(error?: Error): this
    write(data: string): boolean
    end(): this
  }
  export interface RequestOptions {
    method: string
    headers: Record<string, string>
    signal?: AbortSignal
  }
  export function request(
    url: URL,
    options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ): ClientRequest
}
declare module 'node:https' {
  export { request } from 'node:http'
}
