import { api,getSession,getAdminToken,setAdminToken,listPosts,getPost,createPost,savePost,publishPost,unpublishPost,removePost,listMedia,uploadMedia } from './news-api.js';
import { newBlock,renderBlockCard } from './news-blocks.js';
import { renderDraftPreview } from './news-preview.js';

const $=selector=>document.querySelector(selector);
const ui={login:$('#loginPanel'),workspace:$('#workspace'),loginForm:$('#loginForm'),token:$('#tokenInput'),connection:$('#connection'),postList:$('#postList'),postCount:$('#postCount'),search:$('#searchInput'),filter:$('#statusFilter'),empty:$('#emptyState'),form:$('#postForm'),label:$('#editorLabel'),saveState:$('#saveState'),title:$('#titleInput'),slug:$('#slugInput'),category:$('#categoryInput'),excerpt:$('#excerptInput'),tags:$('#tagsInput'),cover:$('#coverInput'),blocks:$('#blockList'),media:$('#mediaStrip'),mediaFile:$('#mediaFile'),previewPanel:$('#previewPanel'),previewBody:$('#previewBody'),toast:$('#toast')};
let posts=[],media=[],current=null,busy=false;

const emptyDraft=()=>({title:'',slug:'',excerpt:'',category:'Development',tags:[],coverMediaId:null,blocks:[]});
const toast=(message,error=false)=>{ui.toast.textContent=message;ui.toast.className=`toast${error?' error':''}`;setTimeout(()=>ui.toast.classList.add('hidden'),3200);};
const setBusy=(value,text='')=>{busy=value;document.querySelectorAll('button').forEach(button=>button.disabled=value);ui.saveState.textContent=text||(value?'Working…':'Ready');};
const fmt=value=>value?new Date(value).toLocaleString():'—';

function draftFromForm(){
  return {title:ui.title.value.trim(),slug:ui.slug.value.trim(),excerpt:ui.excerpt.value.trim(),category:ui.category.value.trim()||'Development',tags:ui.tags.value.split(',').map(v=>v.trim()).filter(Boolean),coverMediaId:ui.cover.value||null,blocks:current?.draft?.blocks||[]};
}

function syncForm(){
  const draft=current?.draft||emptyDraft();ui.title.value=draft.title||'';ui.slug.value=draft.slug||'';ui.excerpt.value=draft.excerpt||'';ui.category.value=draft.category||'Development';ui.tags.value=(draft.tags||[]).join(', ');renderMediaOptions();ui.cover.value=draft.coverMediaId||'';renderBlocks();ui.label.textContent=current?.id?`${current.title||draft.title||'Post'} · ${current.status}`:'New post';$('#unpublishBtn').disabled=current?.status!=='published';$('#deleteBtn').disabled=!current?.id;
}

function renderPosts(){
  const query=ui.search.value.trim().toLowerCase(),status=ui.filter.value;const filtered=posts.filter(post=>(status==='all'||post.status===status)&&(!query||`${post.title} ${post.slug} ${post.category}`.toLowerCase().includes(query)));
  ui.postCount.textContent=`${filtered.length} / ${posts.length}`;ui.postList.innerHTML='';
  if(!filtered.length){const div=document.createElement('div');div.className='editor-empty';div.textContent='No posts found.';ui.postList.append(div);return;}
  filtered.forEach(post=>{const button=document.createElement('button');button.type='button';button.className=`post-card${current?.id===post.id?' active':''}`;button.innerHTML=`<div class="post-title"></div><div class="post-meta"><span class="status-dot ${post.status}"></span><span>${post.status}</span><span>·</span><span>${post.category||'Development'}</span></div>`;button.querySelector('.post-title').textContent=post.title||'Untitled';button.addEventListener('click',()=>openPost(post.id));ui.postList.append(button);});
}

function renderMediaOptions(){
  const selected=ui.cover.value;ui.cover.innerHTML='<option value="">No cover</option>';media.filter(item=>String(item.type||'').startsWith('image/')).forEach(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.name||item.id;ui.cover.append(o);});if([...ui.cover.options].some(o=>o.value===selected))ui.cover.value=selected;
  ui.media.innerHTML='';media.forEach(item=>{const card=document.createElement('div');card.className='media-item';const thumb=document.createElement('div');thumb.className='media-thumb';if(String(item.type||'').startsWith('image/')){const img=document.createElement('img');img.src=item.url;img.alt='';thumb.append(img);}else thumb.textContent='VIDEO';const info=document.createElement('div');info.className='media-info';info.textContent=item.name||item.id;card.append(thumb,info);ui.media.append(card);});
}

function changeBlock(index,key,value){current.draft.blocks[index][key]=value;}
function moveBlock(index,delta){const to=index+delta;if(to<0||to>=current.draft.blocks.length)return;const [block]=current.draft.blocks.splice(index,1);current.draft.blocks.splice(to,0,block);renderBlocks();}
function removeBlock(index){current.draft.blocks.splice(index,1);renderBlocks();}
function renderBlocks(){ui.blocks.innerHTML='';const blocks=current?.draft?.blocks||[];if(!blocks.length){const empty=document.createElement('div');empty.className='empty-blocks';empty.textContent='No content blocks yet.';ui.blocks.append(empty);return;}blocks.forEach((block,index)=>ui.blocks.append(renderBlockCard(block,index,media,{change:changeBlock,move:moveBlock,remove:removeBlock})));}

async function refreshPosts(){const data=await listPosts();posts=data.items||[];renderPosts();}
async function refreshMedia(){const data=await listMedia();media=data.items||[];renderMediaOptions();if(current)renderBlocks();}
async function openPost(id){if(busy)return;setBusy(true,'Loading…');try{current=await getPost(id);ui.empty.classList.add('hidden');ui.form.classList.remove('hidden');syncForm();renderPosts();}catch(error){toast(error.message,true);}finally{setBusy(false);}}
function newPostEditor(){current={id:null,status:'draft',draft:emptyDraft()};ui.empty.classList.add('hidden');ui.form.classList.remove('hidden');syncForm();renderPosts();}

async function persistDraft(){
  if(!current)throw new Error('No post selected');const body=draftFromForm();if(!body.title)throw new Error('Title is required');current.draft={...body,blocks:current.draft.blocks};
  if(current.id)current=await savePost(current.id,current.draft);else current=await createPost(current.draft);await refreshPosts();syncForm();return current;
}

async function doSave(){setBusy(true,'Saving draft…');try{await persistDraft();toast('Draft saved.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doPublish(){setBusy(true,'Publishing…');try{await persistDraft();const result=await publishPost(current.id);current=result.post;await refreshPosts();syncForm();toast('Post published.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doUnpublish(){if(!current?.id)return;setBusy(true,'Unpublishing…');try{const result=await unpublishPost(current.id);current=result.post;await refreshPosts();syncForm();toast('Post unpublished.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doRemove(){if(!current?.id||!confirm(`Delete “${current.title||current.draft.title}”?`))return;setBusy(true,'Deleting…');try{await removePost(current.id);current=null;ui.form.classList.add('hidden');ui.empty.classList.remove('hidden');await refreshPosts();toast('Post deleted.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doUpload(){const file=ui.mediaFile.files?.[0];if(!file)return toast('Choose a file first.',true);setBusy(true,'Uploading media…');try{await uploadMedia(file);ui.mediaFile.value='';await refreshMedia();toast('Media uploaded.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
function preview(){if(!current)return;current.draft={...draftFromForm(),blocks:current.draft.blocks};renderDraftPreview(ui.previewBody,current.draft,media);ui.previewPanel.classList.remove('hidden');ui.previewPanel.scrollIntoView({behavior:'smooth',block:'start'});}

async function start(){
  try{const session=await getSession();ui.connection.textContent=session.email||session.mode||'Connected';ui.login.classList.add('hidden');ui.workspace.classList.remove('hidden');await Promise.all([refreshPosts(),refreshMedia()]);}
  catch(error){ui.connection.textContent='Authentication required';ui.workspace.classList.add('hidden');ui.login.classList.remove('hidden');if(getAdminToken()&&error.status===401)setAdminToken('');}
}

ui.loginForm.addEventListener('submit',event=>{event.preventDefault();setAdminToken(ui.token.value);start();});
$('#newBtn').addEventListener('click',newPostEditor);$('#saveBtn').addEventListener('click',doSave);$('#publishBtn').addEventListener('click',doPublish);$('#unpublishBtn').addEventListener('click',doUnpublish);$('#deleteBtn').addEventListener('click',doRemove);$('#uploadBtn').addEventListener('click',doUpload);$('#previewBtn').addEventListener('click',preview);$('#closePreviewBtn').addEventListener('click',()=>ui.previewPanel.classList.add('hidden'));ui.search.addEventListener('input',renderPosts);ui.filter.addEventListener('change',renderPosts);document.querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>{if(!current)return;current.draft.blocks.push(newBlock(button.dataset.add));renderBlocks();}));
start();
