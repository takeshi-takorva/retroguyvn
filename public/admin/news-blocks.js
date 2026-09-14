export function newBlock(type){
  if(type==='heading')return{type,level:2,text:''};
  if(type==='image')return{type,mediaId:'',alt:'',caption:''};
  if(type==='video')return{type,mediaId:'',caption:''};
  if(type==='gallery')return{type,mediaIds:[],caption:''};
  if(type==='quote')return{type,text:'',attribution:''};
  if(type==='link')return{type,label:'',url:''};
  return{type:'text',text:''};
}

const wordCount=value=>{const text=String(value??'').trim();return text?text.split(/\s+/u).length:0;};
const field=(label,node)=>{const wrap=document.createElement('label');wrap.className='field';const title=document.createElement('span');title.textContent=label;wrap.append(title,node);if(node?.dataset?.wordLimit){const hint=document.createElement('small');hint.className='muted small';const refresh=()=>{const count=wordCount(node.value),limit=Number(node.dataset.wordLimit);hint.textContent=`${count} / ${limit} words`;node.setCustomValidity(count>limit?`Maximum ${limit} words`:'');};node.addEventListener('input',refresh);refresh();wrap.append(hint);}return wrap;};
const input=(value,onInput,type='text')=>{const node=document.createElement('input');node.type=type;node.value=value??'';node.addEventListener('input',()=>onInput(node.value));return node;};
const textarea=(value,onInput,maxWords=0)=>{const node=document.createElement('textarea');node.value=value??'';if(maxWords)node.dataset.wordLimit=String(maxWords);node.addEventListener('input',()=>onInput(node.value));return node;};

function mediaSelect(value,media,onChange,filter='all'){
  const select=document.createElement('select');const empty=document.createElement('option');empty.value='';empty.textContent='Select media…';select.append(empty);
  media.filter(item=>filter==='all'||String(item.type||'').startsWith(`${filter}/`)).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${String(item.type||'').startsWith('video/')?'🎬':'🖼'} ${item.name||item.id}`;select.append(option);});
  select.value=value||'';select.addEventListener('change',()=>onChange(select.value));return select;
}

export function renderBlockCard(block,index,media,actions){
  const card=document.createElement('article');card.className='block-card';
  const head=document.createElement('div');head.className='block-head';const name=document.createElement('div');name.className='block-type';name.textContent=`${index+1}. ${block.type}`;
  const buttons=document.createElement('div');buttons.className='block-actions';[['↑',()=>actions.move(index,-1)],['↓',()=>actions.move(index,1)],['×',()=>actions.remove(index)]].forEach(([label,fn])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',fn);buttons.append(button);});head.append(name,buttons);
  const body=document.createElement('div');body.className='block-body';const set=(key,value)=>actions.change(index,key,value);
  if(block.type==='text')body.append(field('Text · max 2000 words',textarea(block.text,v=>set('text',v),2000)));
  else if(block.type==='heading'){
    const row=document.createElement('div');row.className='block-row';const level=document.createElement('select');[2,3].forEach(n=>{const o=document.createElement('option');o.value=String(n);o.textContent=`H${n}`;level.append(o);});level.value=String(block.level||2);level.addEventListener('change',()=>set('level',Number(level.value)));row.append(field('Level',level),field('Heading',input(block.text,v=>set('text',v))));body.append(row);
  }else if(block.type==='image')body.append(field('Image',mediaSelect(block.mediaId,media,v=>set('mediaId',v),'image')),field('Alt text',input(block.alt,v=>set('alt',v))),field('Caption',input(block.caption,v=>set('caption',v))));
  else if(block.type==='video')body.append(field('Video',mediaSelect(block.mediaId,media,v=>set('mediaId',v),'video')),field('Caption',input(block.caption,v=>set('caption',v))));
  else if(block.type==='gallery'){
    const choices=document.createElement('select');choices.multiple=true;choices.size=Math.min(6,Math.max(3,media.length));media.filter(item=>String(item.type||'').startsWith('image/')).forEach(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.name||item.id;o.selected=(block.mediaIds||[]).includes(item.id);choices.append(o);});choices.addEventListener('change',()=>set('mediaIds',[...choices.selectedOptions].map(o=>o.value)));body.append(field('Images (Ctrl/Cmd để chọn nhiều)',choices),field('Caption',input(block.caption,v=>set('caption',v))));
  }else if(block.type==='quote')body.append(field('Quote · max 2000 words',textarea(block.text,v=>set('text',v),2000)),field('Attribution',input(block.attribution,v=>set('attribution',v))));
  else if(block.type==='link')body.append(field('Label',input(block.label,v=>set('label',v))),field('URL',input(block.url,v=>set('url',v),'url')));
  card.append(head,body);return card;
}
