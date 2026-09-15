const root=document.querySelector('#productDetail');
const slug=root?.dataset.productSlug||'';
const live=document.querySelector('#productLive');
const notFound=document.querySelector('#productNotFound');
const cover=document.querySelector('#productCover');
const category=document.querySelector('#productCategory');
const availability=document.querySelector('#productAvailability');
const name=document.querySelector('#productName');
const subtitle=document.querySelector('#productSubtitle');
const excerpt=document.querySelector('#productExcerpt');
const description=document.querySelector('#productDescriptionText');
const features=document.querySelector('#productFeatures');
const specs=document.querySelector('#productSpecs');
const gallery=document.querySelector('#productGallery');
const cta=document.querySelector('#productCta');

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const label=value=>String(value||'development').replaceAll('-',' ');

function render(product){
  document.title=`${product.name||'Product'} — RetroGuy VN`;
  category.textContent=product.category||'Product';availability.textContent=label(product.availability);name.textContent=product.name||'';subtitle.textContent=product.subtitle||'';excerpt.textContent=product.excerpt||'';description.textContent=product.description||'';
  cover.textContent='';if(product.coverUrl){const img=document.createElement('img');img.src=product.coverUrl;img.alt=product.name||'Product';cover.append(img);}else cover.textContent='Image coming soon';
  features.textContent='';for(const feature of (product.features||[])){const card=el('article','feature-card');card.append(el('h3','',feature.title||''));if(feature.text)card.append(el('p','',feature.text));features.append(card);}if(!features.childNodes.length)features.append(el('p','lede','No feature highlights published yet.'));
  specs.textContent='';for(const spec of (product.specs||[])){specs.append(el('dt','',spec.label||''),el('dd','',spec.value||''));}if(!specs.childNodes.length){specs.append(el('dt','','Status'),el('dd','','Specifications coming soon.'));}
  gallery.textContent='';for(const item of (product.gallery||[])){if(!item?.url)continue;const img=document.createElement('img');img.src=item.url;img.alt=product.name||'Product gallery image';img.loading='lazy';gallery.append(img);}if(!gallery.childNodes.length)gallery.append(el('p','lede','Gallery coming soon.'));
  cta.textContent='';if(product.cta?.href){const link=el('a','button',product.cta.label||'Learn more');link.href=product.cta.href;cta.append(link);}const back=el('a','button secondary','All products');back.href='/product';cta.append(back);
  notFound.classList.add('hidden');live.classList.remove('hidden');
}

function fail(message){live.classList.add('hidden');notFound.classList.remove('hidden');const lede=notFound.querySelector('.lede');if(lede&&message)lede.textContent=message;}

fetch(`/api/products/${encodeURIComponent(slug)}`).then(async response=>{
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'Product not found'),{status:response.status});render(data);
}).catch(error=>fail(error.status===404?'This product is unavailable or has not been published.':error.message||'Unable to load product.'));
