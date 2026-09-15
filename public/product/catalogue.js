const featuredRoot=document.querySelector('#productFeatured');
const grid=document.querySelector('#productGrid');
const empty=document.querySelector('#productEmpty');

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const availabilityLabel=value=>String(value||'development').replaceAll('-',' ');

function productImage(product,eager=false){
  const frame=el('div','product-card-media');
  if(product.coverUrl){const img=document.createElement('img');img.src=product.coverUrl;img.alt=product.name||'Product';img.loading=eager?'eager':'lazy';frame.append(img);}else frame.textContent='Image coming soon';
  return frame;
}

function card(product){
  const article=el('article','product-card');article.append(productImage(product));
  const body=el('div','product-card-body');const meta=el('div','');meta.append(el('span','tag',product.category||'Product'),el('span','availability',availabilityLabel(product.availability)));
  body.append(meta,el('h3','',product.name||'Untitled product'));
  if(product.excerpt)body.append(el('p','',product.excerpt));
  const link=el('a','product-link','Explore product →');link.href=product.url||`/product/${encodeURIComponent(product.slug||'')}`;body.append(link);article.append(body);return article;
}

function renderFeatured(product){
  featuredRoot.textContent='';if(!product){featuredRoot.classList.add('hidden');return;}
  const media=el('div','product-featured-media');if(product.coverUrl){const img=document.createElement('img');img.src=product.coverUrl;img.alt=product.name||'Featured product';img.loading='eager';media.append(img);}else media.append(el('div','product-card-media','Image coming soon'));
  const copy=el('div','product-featured-copy');copy.append(el('span','tag','Featured product'),el('h2','',product.name||'Product'));
  if(product.subtitle)copy.append(el('p','product-kicker',product.subtitle));
  if(product.excerpt)copy.append(el('p','lede',product.excerpt));
  const points=el('div','product-points');for(const feature of (product.features||[]).slice(0,4))points.append(el('span','',feature.title));if(points.childNodes.length)copy.append(points);
  const actions=el('div','actions');const detail=el('a','button','View product');detail.href=product.url||`/product/${encodeURIComponent(product.slug||'')}`;actions.append(detail);if(product.cta?.href){const cta=el('a','button secondary',product.cta.label||'Learn more');cta.href=product.cta.href;actions.append(cta);}copy.append(actions);featuredRoot.append(media,copy);featuredRoot.classList.remove('hidden');
}

async function load(){
  try{
    const response=await fetch('/api/products');const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    const items=Array.isArray(data.items)?data.items:[];grid.textContent='';
    if(!items.length){empty.classList.remove('hidden');renderFeatured(null);return;}
    empty.classList.add('hidden');const featured=items.find(item=>item.id===data.featuredId)||items[0];renderFeatured(featured);for(const item of items)grid.append(card(item));
  }catch(error){grid.textContent='';empty.textContent=error.message||'Unable to load products.';empty.classList.remove('hidden');renderFeatured(null);}
}

load();
