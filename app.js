const log=document.getElementById('log');
const tokenKey='vennela_host_token';
let token=sessionStorage.getItem(tokenKey)||'';
let currentPath='';
function note(s){log.textContent+='\n'+new Date().toLocaleTimeString()+'  '+s;log.scrollTop=log.scrollHeight}
async function api(path,options={}) {
  const headers={...(options.headers||{}), ...(token?{Authorization:'Bearer '+token}:{})};
  const response=await fetch(path,{...options,headers});
  const data=await response.json().catch(()=>({error:'Unexpected server response'}));
  if(response.status===401){token='';sessionStorage.removeItem(tokenKey);throw new Error('Login expired. Refresh and sign in again.')}
  if(!response.ok)throw new Error(data.error||'Request failed');
  return data;
}
async function login(){
  const password=prompt('Enter your Vennela Host panel password:');
  if(password===null)return false;
  const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){alert(data.error||'Login failed');return false}
  token=data.token;sessionStorage.setItem(tokenKey,token);note('Signed in successfully.');return true;
}
async function ensureLogin(){if(!token)return await login();try{await api('/api/status');return true}catch(e){alert(e.message);return await login()}}
function formatUptime(seconds){const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60);return d+'d '+h+'h '+m+'m'}
async function refreshStatus(){
  try{const s=await api('/api/status');document.querySelector('.pill.offline').innerHTML='<i></i> '+(s.running?'Online':'Offline');document.getElementById('uptime').textContent=s.running?formatUptime(s.uptimeSeconds):'—';document.getElementById('players').textContent='—';document.getElementById('memory').textContent='—';}
  catch(e){note(e.message)}
}
async function loadFiles(path=''){
  currentPath=path;
  try{
    const data=await api('/api/files?path='+encodeURIComponent(path));
    const list=document.getElementById('fileList');list.replaceChildren();
    const crumb=document.createElement('div');crumb.className='filecrumb';crumb.textContent='Server files / '+(path||'');list.append(crumb);
    if(path){const up=document.createElement('button');up.className='fileentry';up.textContent='⬆ ..';up.onclick=()=>loadFiles(path.split('/').slice(0,-1).join('/'));list.append(up)}
    for(const entry of data.entries){
      const row=document.createElement('div');row.className='fileentry';
      const open=document.createElement('button');open.className='fileopen';open.textContent=(entry.directory?'📁 ':'📄 ')+entry.name+(entry.directory?'/':'');open.onclick=()=>entry.directory?loadFiles([path,entry.name].filter(Boolean).join('/')):downloadFile([path,entry.name].filter(Boolean).join('/'));
      const del=document.createElement('button');del.className='filedelete';del.textContent='Delete';del.onclick=async()=>{if(confirm('Delete '+entry.name+'?')){try{await api('/api/files?path='+encodeURIComponent([path,entry.name].filter(Boolean).join('/')),{method:'DELETE'});loadFiles(path)}catch(e){alert(e.message)}}};
      row.append(open,del);list.append(row);
    }
    if(!data.entries.length){const empty=document.createElement('small');empty.textContent='This folder is empty.';list.append(empty)}
  }catch(e){note('File list: '+e.message)}
}
async function downloadFile(path){try{const response=await fetch('/api/files/download?path='+encodeURIComponent(path),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error('Download failed');const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=path.split('/').pop();a.click();URL.revokeObjectURL(a.href)}catch(e){alert(e.message)}}
async function uploadFiles(files){
  if(!files.length)return;
  const form=new FormData();for(const file of files)form.append('files',file);
  form.append('directory',currentPath);
  try{const data=await api('/api/files/upload',{method:'POST',body:form});note('Uploaded: '+data.uploaded.join(', '));document.getElementById('fileNames').textContent='Uploaded: '+data.uploaded.join(', ');loadFiles(currentPath)}
  catch(e){alert('Upload failed: '+e.message)}
}
async function serverAction(action){
  try{const data=await api('/api/server/'+action,{method:'POST'});note(action.toUpperCase()+': '+(data.message||'request accepted'));setTimeout(refreshStatus,1500)}
  catch(e){alert(e.message)}
}
document.getElementById('start').onclick=()=>serverAction('start');
document.getElementById('stop').onclick=()=>serverAction('stop');
document.getElementById('restart').onclick=()=>serverAction('restart');
document.getElementById('refresh').onclick=()=>{refreshStatus();loadFiles(currentPath)};
document.getElementById('browseFiles').onclick=()=>loadFiles(currentPath);
document.getElementById('fileInput').onchange=e=>uploadFiles([...e.target.files]);
const drop=document.getElementById('drop');
drop.ondragover=e=>{e.preventDefault();drop.style.borderColor='#6ee7b7'};
drop.ondragleave=()=>drop.style.borderColor='';
drop.ondrop=e=>{e.preventDefault();drop.style.borderColor='';uploadFiles([...e.dataTransfer.files])};
document.getElementById('commandForm').onsubmit=async e=>{
  e.preventDefault();const input=document.getElementById('command');const command=input.value.trim();if(!command)return;
  try{await api('/api/console',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});note('> '+command);input.value=''}catch(err){alert(err.message)}
};
async function pollLogs(){try{const data=await api('/api/logs');const previous=log.textContent;const next=data.logs.map(x=>x.at.slice(11,19)+' '+x.line).join('\n');if(next)log.textContent=next;log.scrollTop=log.scrollHeight}catch(e){}}
(async()=>{if(await ensureLogin()){await refreshStatus();await loadFiles();await pollLogs();setInterval(refreshStatus,10000);setInterval(pollLogs,4000)}})();
