const node=(tag,text,className='')=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};

export function renderDraftPreview(target,draft,media){
  target.innerHTML='';target.append(node('h1',draft.title||'Untitled post'));
  if(draft.excerpt)target.append(node('p',draft.excerpt,'muted'));
  const mediaName=id=>media.find(item=>item.id===id)?.name||id||'No media selected';
  for(const block of draft.blocks||[]){
    if(block.type==='text')target.append(node('p',block.text));
    else if(block.type==='heading')target.append(node(block.level===3?'h3':'h2',block.text));
    else if(block.type==='quote'){const q=node('blockquote',block.text);if(block.attribution)q.append(node('div',`— ${block.attribution}`,'muted small'));target.append(q);}
    else if(block.type==='link'){const a=node('a',block.label||'Open link','btn');a.href=block.url||'#';a.target='_blank';a.rel='noopener';target.append(a);}
    else if(block.type==='gallery')target.append(node('div',`Gallery: ${(block.mediaIds||[]).map(mediaName).join(', ')||'No images selected'}`,'preview-media'));
    else if(block.type==='image'||block.type==='video')target.append(node('div',`${block.type==='video'?'Video':'Image'}: ${mediaName(block.mediaId)}`,'preview-media'));
  }
}
