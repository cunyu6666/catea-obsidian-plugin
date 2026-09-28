/**
 * [WHO]: Provides installNoteThumbnails
 * [FROM]: Depends on obsidian, ./main
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/note-thumbnails.ts - paints 108x144 canvas file-tree thumbnails from title, excerpt and first local raster under 5 MB; 2 MB Markdown cap, 256-entry cache, concurrency 2
 */
import {TFile} from 'obsidian'
import type Catea from './main'

/** Small local content previews. No screenshots, external requests or vault writes. */
export function installNoteThumbnails(plugin:Catea){
  const cache=new Map<string,{mtime:number;url:string}>(),pending=new Set<HTMLElement>()
  const observed=new Set<HTMLElement>(),visible=new Set<HTMLElement>()
  let stopped=false,active=0,scheduled=0,generation=0
  const pathOf=(row:HTMLElement)=>row.dataset.path||row.closest<HTMLElement>('[data-path]')?.dataset.path||''
  const remove=(row:HTMLElement)=>{row.querySelector('.catea-note-thumbnail')?.remove();row.classList.remove('catea-has-thumbnail')}
  const render=async(file:TFile)=>{
    const hit=cache.get(file.path);if(hit?.mtime===file.stat.mtime)return hit.url
    const mtime=file.stat.mtime
    const raw=(await plugin.app.vault.cachedRead(file)).slice(0,20000).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'')
    const canvas=createEl('canvas');canvas.width=108;canvas.height=144
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,108,144)
    const title=raw.match(/^#\s+(.+)$/m)?.[1]||file.basename
    const wrap=(text:string,y:number,font:string,color:string,maxLines:number)=>{
      ctx.font=font;ctx.fillStyle=color;let line='',count=0
      for(const char of text){if(char==='\n'||ctx.measureText(line+char).width>88){ctx.fillText(line,10,y);y+=9;line='';if(++count>=maxLines)return y;if(char==='\n')continue}line+=char}
      if(line){ctx.fillText(line,10,y);y+=9}return y
    }
    let y=wrap(title,15,'bold 8px sans-serif','#25352e',3)+5
    // Only resolve local raster embeds. SVG/HTML and remote resources never execute here.
    const embed=plugin.app.metadataCache.getFileCache(file)?.embeds?.find(e=>/\.(png|jpe?g|webp|gif)(?:[|#]|$)/i.test(e.link)&&!/^https?:/i.test(e.link))
    const imageFile=embed&&plugin.app.metadataCache.getFirstLinkpathDest(embed.link.split(/[|#]/)[0],file.path)
    if(imageFile instanceof TFile&&imageFile.stat.size<5*1024*1024){
      const image=new Image()
      const loaded=await new Promise<boolean>(resolve=>{const timeout=window.setTimeout(()=>resolve(false),1500);image.onload=()=>{window.clearTimeout(timeout);resolve(true)};image.onerror=()=>{window.clearTimeout(timeout);resolve(false)};image.src=plugin.app.vault.getResourcePath(imageFile)})
      if(loaded&&image.naturalWidth){const h=Math.min(42,88*image.naturalHeight/image.naturalWidth);ctx.drawImage(image,10,y,88,h);y+=h+10}
    }
    const excerpt=raw.replace(/^#\s+.+$/m,'').replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g,'').replace(/<[^>]*>/g,'').replace(/[`#*>_]/g,'').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g,(_match:string,p:string,l:string)=>l||p).trim()
    wrap(excerpt,y,'6px sans-serif','#829088',Math.max(0,Math.floor((136-y)/9)))
    let url:string;try{url=canvas.toDataURL('image/png')}catch{return ''}
    if(cache.size>=256)cache.delete(cache.keys().next().value!)
    cache.set(file.path,{mtime,url});return url
  }
  const pump=()=>{
    if(stopped||plugin.agentSettings.noteThumbnails===false)return
    while(active<2&&pending.size){
      const row=pending.values().next().value!;pending.delete(row)
      const path=pathOf(row),file=plugin.app.vault.getAbstractFileByPath(path),version=generation
      if(!(file instanceof TFile)||file.extension!=='md'||!row.isConnected||file.stat.size>2*1024*1024)continue
      active++
      void render(file).then(url=>{
        if(!url||stopped||version!==generation||!row.isConnected||pathOf(row)!==path||plugin.agentSettings.noteThumbnails===false)return
        let image=row.querySelector<HTMLImageElement>('.catea-note-thumbnail')
        if(!image){image=row.createEl('img');image.className='catea-note-thumbnail';image.alt='';image.setAttribute('aria-hidden','true');row.prepend(image)}
        image.src=url;row.classList.add('catea-has-thumbnail')
      }).catch(()=>{}).finally(()=>{active--;pump()})
    }
  }
  const intersection=new IntersectionObserver(entries=>{for(const entry of entries){const row=entry.target as HTMLElement;if(entry.isIntersecting){visible.add(row);pending.add(row)}else visible.delete(row)}pump()},{rootMargin:'80px'})
  const scan=()=>{
    scheduled=0
    for(const row of observed)if(!row.isConnected){intersection.unobserve(row);observed.delete(row);visible.delete(row);pending.delete(row)}
    for(const row of document.querySelectorAll<HTMLElement>('.nav-files-container .nav-file-title'))if(!observed.has(row)){observed.add(row);intersection.observe(row)}
  }
  const schedule=()=>{if(!scheduled)scheduled=window.requestAnimationFrame(scan)}
  const mutation=new MutationObserver(schedule);mutation.observe(document.body,{childList:true,subtree:true})
  const refresh=()=>{
    generation++;cache.clear();pending.clear()
    for(const row of observed)remove(row)
    if(plugin.agentSettings.noteThumbnails!==false)for(const row of visible)pending.add(row)
    schedule();pump()
  }
  plugin.registerEvent(plugin.app.vault.on('modify',refresh));plugin.registerEvent(plugin.app.vault.on('rename',refresh));plugin.registerEvent(plugin.app.vault.on('delete',refresh))
  plugin.registerEvent(plugin.app.workspace.on('layout-change',schedule));schedule()
  plugin.register(()=>{stopped=true;window.cancelAnimationFrame(scheduled);mutation.disconnect();intersection.disconnect();for(const row of observed)remove(row);cache.clear();pending.clear()})
  return refresh
}
