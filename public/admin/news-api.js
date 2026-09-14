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
export const listPosts=()=>api('/api/admin/news');
export const getPost=id=>api(`/api/admin/news/${encodeURIComponent(id)}`);
export const createPost=body=>api('/api/admin/news',{method:'POST',json:true,body});
export const savePost=(id,body)=>api(`/api/admin/news/${encodeURIComponent(id)}`,{method:'PUT',json:true,body});
export const publishPost=id=>api(`/api/admin/news/${encodeURIComponent(id)}/publish`,{method:'POST'});
export const unpublishPost=id=>api(`/api/admin/news/${encodeURIComponent(id)}/unpublish`,{method:'POST'});
export const removePost=id=>api(`/api/admin/news/${encodeURIComponent(id)}/remove`,{method:'POST'});
export const listMedia=()=>api('/api/admin/media');
export async function uploadMedia(file){const form=new FormData();form.append('file',file);return api('/api/admin/news/media',{method:'POST',body:form});}
