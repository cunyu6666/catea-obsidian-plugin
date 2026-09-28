export class TFolder {path='';isRoot(){return false}}
export class FuzzySuggestModal<T> {
  constructor(_app:unknown){}
  setPlaceholder(_text:string){}
  open(){}
  getItems():T[]{return []}
  getItemText(_item:T){return ''}
  onChooseItem(_item:T){}
  onClose(){}
}
export async function loadMermaid(){throw new Error('Mermaid is unavailable in the standalone preview')}
