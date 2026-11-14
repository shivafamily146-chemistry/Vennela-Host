const log=document.getElementById('log');
const tokenKey='vennela_host_token';
const apiBaseKey='vennela_host_api_base';
const queryApi=new URLSearchParams(location.search).get('api');
let apiBase=(queryApi||localStorage.getItem(apiBaseKey)||'').replace(/\\/$/,'');
if(queryApi)localStorage.setItem(apiBaseKey,apiBase);
function apiUrl(path){return apiBase+path;}
function configureApi(){
 if(location.hostname.endsWith('github.io')&&!apiBase){
  const value=prompt('Enter your Vennela Host backend HTTPS URL (example: https://panel.example.com):');
  if(!value)return false;
  const clean=value.trim().replace(/\\/$/,'');
  try{const parsed=new URL(clean);if(parsed.protocol!=='https:'&&parsed.hostname!=='localhost'&&parsed.hostname!=='127.0.0.1')throw new Error();apiBase=clean;localStorage.setItem(apiBaseKey,apiBase);}
  catch{alert('Enter a valid HTTPS backend URL.');return false;}
 }
 return true;
}
let token=sessionStorage.getItem(tokenKey)||'';
let currentPath='';
function note(message){log.textContent+='\n'+new Date().toLocaleTimeString()+'  '+message;log.scrollTop=log.scrollHeight}
async function api(url,options={}){
 const headers={...(options.headers||{}),...(token?{Authorization:'Bearer '+token}:{})};
 const response=await fetch(apiUrl(url),{...options,headers});
 const data=await response.json().catch(()=>({error:'Unexpected server response'}));
 if(response.status===401){token='';sessionStorage.removeItem(tokenKey);throw new Error('Login expired. Reload and sign in again.')}
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data;
}
async function login(){
 if(!configureApi())return false;
 const password=prompt('Enter your Vennela Host panel password:');if(password===null)return false;
 const response=await fetch(apiUrl('/api/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){alert(data.error||'Login failed');return false}
 token=data.token;sessionStorage.setItem(tokenKey,token);note('Panel login successful.');return true;
}
async function ensureLogin(){
 if(!token)return login();
 try{await api('/api/status');return true}catch(error){token='';sessionStorage.removeItem(tokenKey);return login()}
}
function uptime(seconds){const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60);return d+'d '+h+'h '+m+'m'}
async function refreshStatus(){
 try{
  const s=await api('/api/status');
  document.querySelector('header .pill').innerHTML='<i></i> '+(s.running?'Online':'Offline');
  document.getElementById('players').textContent=s.running?s.playersOnline+' / '+s.maxPlayers:'0 / 30';
  document.getElementById('memory').textContent=s.memoryMb===null?'—':s.memoryMb+' MB';
  document.getElementById('uptime').textContent=s.running?uptime(s.uptimeSeconds):'—';
 }catch(error){note(error.message)}
}
function joinPath(name){return [currentPath,name].filter(Boolean).join('/')}
async function loadFiles(folder=currentPath){
 currentPath=folder;
 try{
  const data=await api('/api/files?path='+encodeURIComponent(folder));
  const list=document.getElementById('fileList');list.replaceChildren();
  const crumb=document.createElement('div');crumb.className='filecrumb';crumb.textContent='Server files / '+(folder||'root');list.append(crumb);
  if(folder){const up=document.createElement('button');up.className='fileentry';up.textContent='⬆ Parent folder';up.onclick=()=>loadFiles(folder.split('/').slice(0,-1).join('/'));list.append(up)}
  for(const entry of data.entries){
   const row=document.createElement('div');row.className='fileentry';
   const open=document.createElement('button');open.className='fileopen';open.textContent=(entry.directory?'📁 ':'📄 ')+entry.name+(entry.directory?'/':'');
   open.onclick=()=>entry.directory?loadFiles(joinPath(entry.name)):downloadFile(joinPath(entry.name));
   row.append(open);
   if(!entry.directory&&/\.(yml|yaml|properties|json|txt|cfg|conf|toml|md)$/i.test(entry.name)){
    const edit=document.createElement('button');edit.className='fileedit';edit.textContent='Edit';edit.onclick=()=>editTextFile(joinPath(entry.name));row.append(edit);
   }
   const del=document.createElement('button');del.className='filedelete';del.textContent='Delete';del.onclick=async()=>{if(confirm('Permanently delete '+entry.name+'?')){try{await api('/api/files?path='+encodeURIComponent(joinPath(entry.name)),{method:'DELETE'});loadFiles()}catch(error){alert(error.message)}}};
   row.append(del);list.append(row);
  }
  if(!data.entries.length){const empty=document.createElement('small');empty.textContent='This folder is empty.';list.append(empty)}
 }catch(error){note('File manager: '+error.message)}
}
async function downloadFile(file){
 try{
  const response=await fetch(apiUrl('/api/files/download?path='+encodeURIComponent(file),{headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw new Error('Download failed');
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=file.split('/').pop();a.click();URL.revokeObjectURL(url);
 }catch(error){alert(error.message)}
}
async function editTextFile(file){
 try{
  const data=await api('/api/files/text?path='+encodeURIComponent(file));
  const content=prompt('Edit '+file+' (text configuration):',data.content);
  if(content===null)return;
  await api('/api/files/text',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:file,content})});
  note('Saved '+file);
 }catch(error){alert('Edit failed: '+error.message)}
}
async function uploadFiles(files){
 if(!files.length)return;
 const form=new FormData();for(const file of files)form.append('files',file);form.append('directory',currentPath);
 try{const data=await api('/api/files/upload',{method:'POST',body:form});note('Uploaded: '+data.uploaded.join(', '));document.getElementById('fileNames').textContent='Uploaded: '+data.uploaded.join(', ');loadFiles()}
 catch(error){alert('Upload failed: '+error.message)}
}
async function serverAction(action){
 try{const data=await api('/api/server/'+action,{method:'POST'});note(action.toUpperCase()+': '+(data.message||'request accepted'));setTimeout(refreshStatus,1500)}
 catch(error){alert(error.message)}
}
document.getElementById('start').onclick=()=>serverAction('start');
document.getElementById('stop').onclick=()=>serverAction('stop');
document.getElementById('restart').onclick=()=>serverAction('restart');
document.getElementById('refresh').onclick=()=>{refreshStatus();loadFiles()};
document.getElementById('browseFiles').onclick=()=>loadFiles();
document.getElementById('backup').onclick=async()=>{
 try{const response=await fetch(apiUrl('/api/backup'),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error('Backup failed');const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vennela-backup.zip';a.click();URL.revokeObjectURL(url);note('Backup downloaded.')}catch(error){alert(error.message)}
};
document.getElementById('newFolder').onclick=async()=>{
 const name=prompt('New folder name:');if(!name)return;
 try{await api('/api/files/mkdir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:joinPath(name)})});loadFiles()}
 catch(error){alert(error.message)}
};
document.getElementById('fileInput').onchange=e=>uploadFiles([...e.target.files]);
const drop=document.getElementById('drop');
drop.ondragover=e=>{e.preventDefault();drop.style.borderColor='#6ee7b7'};
drop.ondragleave=()=>drop.style.borderColor='';
drop.ondrop=e=>{e.preventDefault();drop.style.borderColor='';uploadFiles([...e.dataTransfer.files])};
document.getElementById('commandForm').onsubmit=async e=>{
 e.preventDefault();const input=document.getElementById('command'),command=input.value.trim();if(!command)return;
 try{await api('/api/console',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});note('> '+command);input.value=''}
 catch(error){alert(error.message)}
};
async function pollLogs(){
 try{const data=await api('/api/logs');const lines=data.logs.map(item=>item.at.slice(11,19)+' '+item.line).join('\n');if(lines){log.textContent=lines;log.scrollTop=log.scrollHeight}}
 catch(error){}
}
(async()=>{if(await ensureLogin()){await refreshStatus();await loadFiles('');await pollLogs();setInterval(refreshStatus,10000);setInterval(pollLogs,4000)}})();
