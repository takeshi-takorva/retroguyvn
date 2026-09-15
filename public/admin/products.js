import { getSession,getAdminToken,setAdminToken,listProducts,getProduct,createProduct,saveProduct,publishProduct,unpublishProduct,removeProduct,listMedia } from './products-api.js';

const $=selector=>document.querySelector(selector);
const ui={
  login:$('#loginPanel'),workspace:$('#workspace'),loginForm:$('#loginForm'),token:$('#tokenInput'),connection:$('#connection'),
  list:$('#productList'),count:$('#productCount'),search:$('#searchInput'),filter:$('#statusFilter'),empty:$('#emptyState'),form:$('#productForm'),
  label:$('#editorLabel'),saveState:$('#saveState'),name:$('#nameInput'),slug:$('#slugInput'),subtitle:$('#subtitleInput'),excerpt:$('#excerptInput'),
  category:$('#categoryInput'),availability:$('#availabilityInput'),featured:$('#featuredInput'),sortOrder:$('#sortOrderInput'),cover:$('#coverInput'),
  description:$('#descriptionInput'),features:$('#featureList'),specs:$('#specList'),gallery:$('#galleryList'),ctaLabel:$('#ctaLabelInput'),ctaHref:$('#ctaHrefInput'),
  publicLink:$('#openPublicLink'),toast:$('#toast')
};
let products=[],media=[],current=null,busy=false;

const emptyDraft=()=>({name:'',slug:'',subtitle:'',excerpt:'',category:'Handheld',availability:'development',featured:false,sortOrder:0,coverMediaId:null,description:'',features:[],specs:[],galleryMediaIds:[],cta:{label:'Get support',href:'/support'}});
const imageMedia=()=>media.filter(item=>String(item.type||item.mimeType||'').startsWith('image/'));
const toast=(message,error=false)=>{ui.toast.textContent=message;ui.toast.className=`toast${error?' error':''}`;setTimeout(()=>ui.toast.classList.add('hidden'),3200);};
const setBusy=(value,text='')=>{busy=value;document.querySelectorAll('button').forEach(button=>button.disabled=value);ui.saveState.textContent=text||(value?'Working…':'Ready');syncLifecycleControls();};
const fmt=value=>value?new Date(value).toLocaleString():'—';

function draft(){return current?.draft||emptyDraft();}
function option(value,label,selected=false){const node=document.createElement('option');node.value=value;node.textContent=label;node.selected=selected;return node;}
function button(label,className,handler){const node=document.createElement('button');node.type='button';node.className=className||'btn';node.textContent=label;node.addEventListener('click',handler);return node;}
function input(value,maxLength,onInput){const node=document.createElement('input');node.value=value||'';if(maxLength)node.maxLength=maxLength;node.addEventListener('input',()=>onInput(node.value));return node;}
function textarea(value,maxLength,onInput){const node=document.createElement('textarea');node.value=value||'';if(maxLength)node.maxLength=maxLength;node.rows=3;node.addEventListener('input',()=>onInput(node.value));return node;}

function renderProducts(){
  const query=ui.search.value.trim().toLowerCase(),status=ui.filter.value;
  const filtered=products.filter(product=>(status==='all'||product.status===status)&&(!query||`${product.name} ${product.slug} ${product.category}`.toLowerCase().includes(query)));
  ui.count.textContent=`${filtered.length} / ${products.length}`;ui.list.textContent='';
  if(!filtered.length){const empty=document.createElement('div');empty.className='editor-empty';empty.textContent='No products found.';ui.list.append(empty);return;}
  for(const product of filtered){
    const card=button('',`post-card product-card${current?.id===product.id?' active':''}`,()=>openProduct(product.id));
    const title=document.createElement('div');title.className='post-title';title.textContent=product.name||'Untitled product';
    const meta=document.createElement('div');meta.className='product-meta';
    for(const text of [product.status,product.availability,product.featured?'featured':null,`order ${product.sortOrder||0}`].filter(Boolean)){const span=document.createElement('span');span.textContent=text;meta.append(span);}
    card.append(title,meta);ui.list.append(card);
  }
}

function renderMediaOptions(){
  const selected=ui.cover.value||draft().coverMediaId||'';ui.cover.textContent='';ui.cover.append(option('','No cover'));
  for(const item of imageMedia())ui.cover.append(option(item.id,item.name||item.id,item.id===selected));
  if(selected&&[...ui.cover.options].some(item=>item.value===selected))ui.cover.value=selected;
}

function renderFeatures(){
  ui.features.textContent='';const items=draft().features||[];
  if(!items.length){const empty=document.createElement('div');empty.className='empty-repeat';empty.textContent='No feature highlights yet.';ui.features.append(empty);return;}
  items.forEach((feature,index)=>{
    const row=document.createElement('div');row.className='repeat-row';
    row.append(input(feature.title,100,value=>feature.title=value),textarea(feature.text,500,value=>feature.text=value),button('Remove','btn danger',()=>{items.splice(index,1);renderFeatures();}));ui.features.append(row);
  });
}
export function addFeature(){if(!current)return;if(current.draft.features.length>=20)return toast('Maximum 20 features.',true);current.draft.features.push({title:'',text:''});renderFeatures();}

function renderSpecs(){
  ui.specs.textContent='';const items=draft().specs||[];
  if(!items.length){const empty=document.createElement('div');empty.className='empty-repeat';empty.textContent='No specifications yet.';ui.specs.append(empty);return;}
  items.forEach((spec,index)=>{
    const row=document.createElement('div');row.className='repeat-row';
    row.append(input(spec.label,100,value=>spec.label=value),input(spec.value,300,value=>spec.value=value),button('Remove','btn danger',()=>{items.splice(index,1);renderSpecs();}));ui.specs.append(row);
  });
}
export function addSpec(){if(!current)return;if(current.draft.specs.length>=40)return toast('Maximum 40 specifications.',true);current.draft.specs.push({label:'',value:''});renderSpecs();}

function renderGallery(){
  ui.gallery.textContent='';const ids=draft().galleryMediaIds||[],images=imageMedia();
  if(!ids.length){const empty=document.createElement('div');empty.className='empty-repeat';empty.textContent='No gallery images yet.';ui.gallery.append(empty);return;}
  ids.forEach((mediaId,index)=>{
    const row=document.createElement('div');row.className='gallery-row';const select=document.createElement('select');select.append(option('','Choose image'));
    for(const item of images)select.append(option(item.id,item.name||item.id,item.id===mediaId));select.value=mediaId||'';select.addEventListener('change',()=>ids[index]=select.value);
    row.append(select,button('Remove','btn danger',()=>{ids.splice(index,1);renderGallery();}));ui.gallery.append(row);
  });
}
function addGallery(){if(!current)return;if(current.draft.galleryMediaIds.length>=20)return toast('Maximum 20 gallery images.',true);current.draft.galleryMediaIds.push('');renderGallery();}

function syncLifecycleControls(){
  const exists=Boolean(current?.id),published=current?.status==='published';
  $('#deleteBtn').disabled=busy||!exists;$('#unpublishBtn').disabled=busy||!exists||!published;$('#saveBtn').disabled=busy||!current;$('#publishBtn').disabled=busy||!current;
  if(current?.publishedSlug){ui.publicLink.href=`/product/${encodeURIComponent(current.publishedSlug)}`;ui.publicLink.classList.remove('hidden');}else{ui.publicLink.href='/product';ui.publicLink.classList.add('hidden');}
}

function syncForm(){
  const data=draft();ui.name.value=data.name||'';ui.slug.value=data.slug||'';ui.subtitle.value=data.subtitle||'';ui.excerpt.value=data.excerpt||'';ui.category.value=data.category||'Handheld';ui.availability.value=data.availability||'development';ui.featured.checked=Boolean(data.featured);ui.sortOrder.value=Number(data.sortOrder||0);ui.description.value=data.description||'';ui.ctaLabel.value=data.cta?.label||'Get support';ui.ctaHref.value=data.cta?.href||'/support';
  renderMediaOptions();ui.cover.value=data.coverMediaId||'';renderFeatures();renderSpecs();renderGallery();
  ui.label.textContent=current?.id?`${current.name||data.name||'Product'} · ${current.status}`:'New product';syncLifecycleControls();
}

function draftFromForm(){
  const data=draft();
  return {name:ui.name.value.trim(),slug:ui.slug.value.trim(),subtitle:ui.subtitle.value.trim(),excerpt:ui.excerpt.value.trim(),category:ui.category.value.trim()||'Handheld',availability:ui.availability.value,featured:ui.featured.checked,sortOrder:Number.parseInt(ui.sortOrder.value||'0',10)||0,coverMediaId:ui.cover.value||null,description:ui.description.value,features:(data.features||[]).map(item=>({title:String(item.title||'').trim(),text:String(item.text||'').trim()})),specs:(data.specs||[]).map(item=>({label:String(item.label||'').trim(),value:String(item.value||'').trim()})),galleryMediaIds:[...new Set((data.galleryMediaIds||[]).filter(Boolean))],cta:{label:ui.ctaLabel.value.trim()||'Get support',href:ui.ctaHref.value.trim()||'/support'}};
}

async function refreshProducts(){const data=await listProducts();products=data.items||[];renderProducts();}
async function refreshMedia(){const data=await listMedia();media=data.items||[];if(current){renderMediaOptions();renderGallery();}}
async function openProduct(id){if(busy)return;setBusy(true,'Loading…');try{current=await getProduct(id);ui.empty.classList.add('hidden');ui.form.classList.remove('hidden');syncForm();renderProducts();}catch(error){toast(error.message,true);}finally{setBusy(false);}}
function newProductEditor(){current={id:null,status:'draft',publishedSlug:null,draft:emptyDraft()};ui.empty.classList.add('hidden');ui.form.classList.remove('hidden');syncForm();renderProducts();}

async function persistDraft(){if(!current)throw new Error('No product selected');const body=draftFromForm();if(!body.name)throw new Error('Name is required');current.draft=body;current=current.id?await saveProduct(current.id,body):await createProduct(body);await refreshProducts();syncForm();return current;}
async function doSave(){setBusy(true,'Saving draft…');try{await persistDraft();toast('Draft saved.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doPublish(){setBusy(true,'Publishing…');try{await persistDraft();current=await publishProduct(current.id);await refreshProducts();syncForm();toast('Product published.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doUnpublish(){if(!current?.id)return;setBusy(true,'Unpublishing…');try{current=await unpublishProduct(current.id);await refreshProducts();syncForm();toast('Product unpublished.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}
async function doRemove(){if(!current?.id||!confirm(`Remove “${current.name||draft().name}”?`))return;setBusy(true,'Removing…');try{await removeProduct(current.id);current=null;ui.form.classList.add('hidden');ui.empty.classList.remove('hidden');await refreshProducts();toast('Product removed.');}catch(error){toast(error.message,true);}finally{setBusy(false);}}

async function start(){
  try{const session=await getSession();ui.connection.textContent=session.email||session.mode||'Connected';ui.login.classList.add('hidden');ui.workspace.classList.remove('hidden');await Promise.all([refreshProducts(),refreshMedia()]);}
  catch(error){ui.connection.textContent='Authentication required';ui.workspace.classList.add('hidden');ui.login.classList.remove('hidden');if(getAdminToken()&&error.status===401)setAdminToken('');}
}

ui.loginForm.addEventListener('submit',event=>{event.preventDefault();setAdminToken(ui.token.value);start();});
$('#newBtn').addEventListener('click',newProductEditor);$('#saveBtn').addEventListener('click',doSave);$('#publishBtn').addEventListener('click',doPublish);$('#unpublishBtn').addEventListener('click',doUnpublish);$('#deleteBtn').addEventListener('click',doRemove);$('#addFeatureBtn').addEventListener('click',addFeature);$('#addSpecBtn').addEventListener('click',addSpec);$('#addGalleryBtn').addEventListener('click',addGallery);ui.search.addEventListener('input',renderProducts);ui.filter.addEventListener('change',renderProducts);
start();
