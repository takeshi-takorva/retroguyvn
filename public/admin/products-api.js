let token=sessionStorage.getItem('rg_admin_token')||'';

export function setAdminToken(value){token=String(value||'').trim();if(token)sessionStorage.setItem('rg_admin_token',token);else sessionStorage.removeItem('rg_admin_token');}
export function getAdminToken(){return token;}

export async function api(path,options={}){
  const headers={...(token?{Authorization:`Bearer ${token}`} : {}),...(options.json?{'content-type':'application/json'}:{}),...(options.headers||{})};
  const init={...options,headers};delete init.json;
  if(options.json&&options.body&&typeof options.body!=='string')init.body=JSON.stringify(options.body);
  const response=await fetch(path,init);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{status:response.status,data});
  return data;
}

export const getSession=()=>api('/api/admin/session');
export const listProducts=()=>api('/api/admin/products');
export const getProduct=id=>api(`/api/admin/products/${encodeURIComponent(id)}`);
export const createProduct=body=>api('/api/admin/products',{method:'POST',json:true,body});
export const saveProduct=(id,body)=>api(`/api/admin/products/${encodeURIComponent(id)}`,{method:'PUT',json:true,body});
export const publishProduct=id=>api(`/api/admin/products/${encodeURIComponent(id)}/publish`,{method:'POST'});
export const unpublishProduct=id=>api(`/api/admin/products/${encodeURIComponent(id)}/unpublish`,{method:'POST'});
export const removeProduct=id=>api(`/api/admin/products/${encodeURIComponent(id)}/remove`,{method:'POST'});
export const listMedia=()=>api('/api/admin/media');
