'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'}).format(new Date());
const number = n => Number(n || 0).toLocaleString('zh-CN', {maximumFractionDigits:1});
const defaultProfile = {name:'行者',subtitle:'一个热爱户外、认真记录成长的人。',bio:'我相信，成长藏在日复一日的小事里。完成一次挑战，学会一项技能，或是走过一条没走过的山路，都值得被好好记住。',resume:[]};
let state = {version:1,profile:structuredClone(defaultProfile),entries:[]};
let db, filter = 'all', draftPhotos = [], draftRoute = '', activeEntry, lightboxPhotos = [], lightboxIndex = 0, toastTimer, initialized = false, processingPhotos = false;

function showToast(message) { $('#toast').textContent=message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000); }
function openDialog(id) { const dialog=$('#'+id); if(!dialog.open) dialog.showModal(); }
function closeDialogs() { $$('dialog[open]').forEach(d=>d.close()); }
function safePhoto(src, imported = false) { return typeof src==='string' && ( /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) || (!imported && /^\.\/assets\/[a-z-]+\.jpg$/.test(src))); }
function validateData(data) {
  if(!data || data.version!==1 || !data.profile || !Array.isArray(data.entries) || data.entries.length>2000) throw new Error('备份格式不正确，请选择本网站导出的 JSON 文件。');
  const p=data.profile;
  for(const [key,max] of [['name',24],['subtitle',120],['bio',2000]]) if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max) throw new Error('个人介绍格式不正确。');
  if(!Array.isArray(p.resume)||p.resume.length>100) throw new Error('履历格式不正确。');
  const profile={name:p.name,subtitle:p.subtitle,bio:p.bio,resume:p.resume.map(r=>{ if(!r||['date','title','body'].some(k=>typeof r[k]!=='string'||r[k].length>2000))throw new Error('履历条目格式不正确。'); return {date:r.date,title:r.title,body:r.body}; })};
  const ids=new Set();
  const entries=data.entries.map(e=>{
    if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(e.id)||e.id.startsWith('example-')||ids.has(e.id)||!['hike','growth'].includes(e.type)||typeof e.title!=='string'||!e.title.trim()||e.title.length>80||typeof e.body!=='string'||!e.body.trim()||e.body.length>10000||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date) throw new Error('手记数据格式不正确，未导入任何内容。');
    ids.add(e.id);
    if(typeof e.location!=='string'||e.location.length>100||!Array.isArray(e.photos)||e.photos.length>4||e.photos.some(s=>!safePhoto(s,true))||(e.routeImage && !safePhoto(e.routeImage,true))) throw new Error('手记地点或照片格式不正确。');
    for(const key of ['distance','hours','ascent']) if(e[key]!==null&&(typeof e[key]!=='number'||!Number.isFinite(e[key])||e[key]<0||e[key]>(key==='ascent'?100000:10000))) throw new Error('里程、用时或爬升数据不正确。');
    return {id:e.id,type:e.type,title:e.title,date:e.date,body:e.body,location:e.location,photos:e.photos,routeImage:e.routeImage||'',distance:e.distance,hours:e.hours,ascent:e.ascent};
  });
  return {version:1,profile,entries};
}
async function initialize() {
  try { const response=await fetch('./content.json'); if(response.ok) state=validateData(await response.json()); } catch(error) { console.warn('Using default content:',error.message); }
  try {
    db=await new Promise((resolve,reject)=>{const request=indexedDB.open('one-step-journal',1);request.onupgradeneeded=()=>request.result.createObjectStore('content');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('数据库暂不可用'));});
    const saved=await new Promise((resolve,reject)=>{const request=db.transaction('content').objectStore('content').get('journal');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    if(saved) state=validateData(saved);
  } catch(error) { db=null;showToast('本浏览器的存储不可用，请导出备份以保存修改。'); }
  initialized=true;render();
}
async function persist(next) {
  if(!db) throw new Error('本浏览器的持久存储不可用，请换用普通浏览模式后重试。');
  await new Promise((resolve,reject)=>{const transaction=db.transaction('content','readwrite');transaction.objectStore('content').put(next,'journal');transaction.oncomplete=resolve;transaction.onerror=()=>reject(new Error('保存失败，浏览器空间可能不足。请先导出备份。'));transaction.onabort=()=>reject(new Error('保存未完成，请重试。'));});
  state=next; render();
}
function render() {
  $('#profile-name').textContent=state.profile.name;$('#profile-subtitle').textContent=state.profile.subtitle;$('#profile-bio').textContent=state.profile.bio;
  document.title=`${state.profile.name} · 个人博客`;
  const resume=state.profile.resume;
  $('#timeline').innerHTML=resume.length?resume.map(r=>`<article class="timeline-item"><span class="resume-monogram" aria-hidden="true">${esc(r.title.slice(0,1))}</span><div class="resume-info"><h3>${esc(r.title)}</h3><time>${esc(r.date)}</time>${r.body && !r.body.includes('待补充')?`<p>${esc(r.body)}</p>`:''}</div></article>`).join(''):'<p class="muted">尚未添加履历。</p>';
  $('.journal-toolbar').hidden=document.body.dataset.design!=='blog'&&state.entries.length<6;
  if(state.entries.length<6){filter='all';$('#search').value='';updateFilters();}
  const selectedYear=$('#year').value;
  const visible=state.entries;
  const years=[...new Set(visible.map(e=>e.date.slice(0,4)))].sort().reverse();
  $('#year').innerHTML='<option value="all">所有年份</option>'+years.map(y=>`<option value="${y}">${y} 年</option>`).join('');
  $('#year').value=years.includes(selectedYear)?selectedYear:'all';
  renderEntries();renderManager();renderBlogExtras();$('#footer-year').textContent=today().slice(0,4);
}
function renderBlogExtras(){
  const total=$('#entry-count');if(total)total.textContent=state.entries.length;
  const hikes=state.entries.filter(e=>e.type==='hike');const hikeCount=$('#total-hikes');if(hikeCount)hikeCount.textContent=`${hikes.length} 次`;
  const measuredHikes=hikes.filter(e=>typeof e.distance==='number');const measuredDistance=measuredHikes.reduce((sum,e)=>sum+e.distance,0);const distanceLabel=$('#total-distance');if(distanceLabel)distanceLabel.textContent=measuredHikes.length?`${number(measuredDistance)} km`:'待记录';
  const archive=$('#archive-list');
  if(archive){const years={};state.entries.forEach(e=>years[e.date.slice(0,4)]=(years[e.date.slice(0,4)]||0)+1);archive.innerHTML=Object.keys(years).sort().reverse().map(y=>`<button class="archive-year" data-archive-year="${y}"><span>${y} 年</span><span>${years[y]} 篇 ↗</span></button>`).join('')||'<p class="muted">暂无手记</p>';}
  const gallery=$('#photo-collection');if(!gallery)return;
  const photos=state.entries.flatMap(e=>[...e.photos.map(photo=>({photo,id:e.id,title:e.title,label:'旅途照片'})),...(e.routeImage?[{photo:e.routeImage,id:e.id,title:e.title,label:'路线记录图'}]:[])]).slice(0,8);
  if(photos.length){gallery.className='real-photo-grid';gallery.innerHTML=photos.map(p=>`<button data-entry="${esc(p.id)}"><img src="${esc(p.photo)}" alt="${esc(p.title)} · ${p.label}" loading="lazy"><span>${esc(p.title)} · ${p.label}</span></button>`).join('');}
  else {const latest=state.entries.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];gallery.className='photo-invitation';gallery.innerHTML=`<div class="photo-invitation-copy"><span class="entry-type">路线与相册</span><h3>${latest?'为这次出发，留一组照片。':'下一次出发，记得带上相机。'}</h3><p>${latest?esc(latest.title)+'。':''}路线截图、沿途风景，或是自己在路上的样子，都可以收藏在这里。</p><button class="text-link" ${latest?`data-edit="${esc(latest.id)}"`:'data-action="new"'}>${latest?'补充路线图与照片':'开始第一条记录'} ↗</button></div><div class="photo-invitation-art" aria-hidden="true"><div class="paper-photo back"><span>↗</span></div><div class="paper-photo front"><svg viewBox="0 0 160 110"><circle cx="120" cy="25" r="11"/><path d="m10 96 45-61 32 38 20-24 42 47Z"/></svg></div></div>`;}
}
function renderEntries() {
  const source=state.entries;
  const query=$('#search').value.trim().toLocaleLowerCase();const year=$('#year').value;
  const entries=source.filter(e=>(filter==='all'||e.type===filter)&&(year==='all'||e.date.startsWith(year))&&`${e.title} ${e.location} ${e.body}`.toLocaleLowerCase().includes(query)).sort((a,b)=>b.date.localeCompare(a.date));
  $('#journal-grid').innerHTML=entries.map(e=>`<article class="journal-card"><button class="card-open ${e.photos[0]||e.routeImage?'has-photo':'has-art'}" data-entry="${esc(e.id)}" aria-label="阅读${esc(e.title)}"><div class="card-image ${!e.photos[0]&&!e.routeImage?'illustration':''}">${e.photos[0]||e.routeImage?`<img class="${!e.photos[0]?'route-cover':''}" src="${esc(e.photos[0]||e.routeImage)}" alt="${esc(e.title)}的记录照片" loading="lazy" width="600" height="420">`:`<img src="./assets/terrain.svg" alt="山野主题装饰插画" width="600" height="420" loading="lazy">`}</div><div class="card-info"><div class="card-meta"><span class="entry-type">${e.type==='hike'?'徒步':'成长'}</span><time datetime="${e.date}">${e.date.replaceAll('-','.')}</time></div><h3>${esc(e.title)}</h3>${e.location?`<p class="card-location"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 8c0 4-5 8-5 8S5 12 5 8a5 5 0 1 1 10 0Z"/><circle cx="10" cy="8" r="1.5"/></svg>${esc(e.location)}</p>`:''}<p class="card-desc">${esc(e.body.split('\n')[0])}</p>${entryStats(e)}<span class="card-read">读这篇手记 <span aria-hidden="true">↗</span></span></div></button></article>`).join('');
  $('#empty').hidden=entries.length>0;$('#empty-text').textContent=query||filter!=='all'||year!=='all'?'没有找到匹配的手记，试试其他关键词或筛选条件。':'还没有记录。';
}
function entryStats(e){const fields=[['distance','km'],['hours','小时'],['ascent','m 爬升']].filter(([key])=>e.type==='hike'&&e[key]!==null);return fields.length?`<div class="card-stats">${fields.map(([key,unit])=>`<span>${number(e[key])} ${unit}</span>`).join('')}</div>`:'';}
function openEntry(id) {
  const e=state.entries.find(e=>e.id===id);if(!e)return;activeEntry=e;
  $('#detail-content').innerHTML=`<div class="detail-top"><button class="icon-button" data-close aria-label="关闭">×</button></div><div class="detail-body"><h2>${esc(e.title)}</h2><p class="detail-meta">${e.date.replaceAll('-','.')}${e.location?' · '+esc(e.location):''}</p>${entryStats(e)}<p class="detail-text">${esc(e.body)}</p>${e.routeImage?`<div class="route-section"><h3>路线记录</h3><button class="route-image" data-photo-index="${e.photos.length}" aria-label="放大路线记录图"><img src="${esc(e.routeImage)}" alt="${esc(e.title)}的路线记录图"></button></div>`:''}${e.photos.length?`<div class="detail-photos">${e.photos.map((photo,i)=>`<button data-photo-index="${i}" aria-label="查看第 ${i+1} 张照片"><img src="${esc(photo)}" alt="${esc(e.title)}，照片 ${i+1}" loading="lazy"></button>`).join('')}</div>`:''}<div class="detail-buttons"><button class="text-link" data-edit="${esc(e.id)}">编辑</button><button class="text-link danger" data-delete="${esc(e.id)}">删除</button></div></div>`;
  openDialog('detail');
}
function openEditor(id) {
  if(!initialized){showToast('正在加载手记，请稍候。');return;}
  closeDialogs();const form=$('#entry-form');form.reset();const e=state.entries.find(e=>e.id===id);draftPhotos=e?[...e.photos]:[];draftRoute=e?.routeImage||'';
  $('#editor-title').textContent=e?'编辑记录':'写记录';$('#entry-error').textContent='';
  for(const name of ['id','type','date','title','location','distance','hours','ascent','body']) form.elements[name].value=e?(e[name]??''):(name==='date'?today():name==='type'?'hike':'');
  toggleHikeFields();renderDraftPhotos();renderDraftRoute();openDialog('editor');
}
function toggleHikeFields(){ $('.hike-fields').hidden=$('.hike-route-field').hidden=$('#entry-form').elements.type.value!=='hike'; }
function renderDraftPhotos(){ $('#photo-preview').innerHTML=draftPhotos.map((src,i)=>`<div><img src="${esc(src)}" alt="待保存的照片 ${i+1}"><button type="button" data-remove-photo="${i}" aria-label="移除第 ${i+1} 张照片">×</button></div>`).join(''); }
function renderDraftRoute(){ $('#route-preview').innerHTML=draftRoute?`<div><img src="${esc(draftRoute)}" alt="待保存的路线记录图"><button type="button" data-remove-route aria-label="移除路线图">×</button></div>`:''; }
function setPhotoProcessing(value){processingPhotos=value;$('#save-entry').disabled=value;$('#entry-form').elements.photos.disabled=value;$('#entry-form').elements.route.disabled=value;}
async function compressPhoto(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
  if(file.size>15*1024*1024) throw new Error('单张照片请控制在 15 MB 以内。');
  const objectURL=URL.createObjectURL(file);
  try { const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('无法读取这张照片，请换一张重试。'));image.src=objectURL;});
    if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>80000000)throw new Error('照片尺寸过大，请先缩小后上传。');
    const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);const context=canvas.getContext('2d');context.fillStyle='#f6f5ef';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.8);
  } finally { URL.revokeObjectURL(objectURL); }
}
$('#entry-form').elements.photos.addEventListener('change',async event=>{
  const files=[...event.target.files];$('#entry-error').textContent='';
  if(files.length+draftPhotos.length>4){$('#entry-error').textContent='每篇手记最多添加 4 张照片。';event.target.value='';return;}
  setPhotoProcessing(true);
  try{const additions=[];for(const file of files)additions.push(await compressPhoto(file));draftPhotos.push(...additions);renderDraftPhotos();}catch(error){$('#entry-error').textContent=error.message;}finally{setPhotoProcessing(false);event.target.value='';}
});
$('#entry-form').elements.route.addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;$('#entry-error').textContent='';setPhotoProcessing(true);try{draftRoute=await compressPhoto(file);renderDraftRoute();}catch(error){$('#entry-error').textContent=error.message;}finally{setPhotoProcessing(false);event.target.value='';}});
$('#entry-form').elements.type.addEventListener('change',toggleHikeFields);
$('#entry-form').addEventListener('submit',async event=>{
  event.preventDefault();if(processingPhotos)return;
  const form=event.currentTarget;$('#entry-error').textContent='';$('#save-entry').disabled=true;
  try{
    const get=name=>form.elements[name].value.trim();const hike=get('type')==='hike';
    const e={id:get('id')||crypto.randomUUID(),type:get('type'),date:get('date'),title:get('title'),location:hike?get('location'):'',body:get('body'),photos:[...draftPhotos],routeImage:hike?draftRoute:'',distance:hike&&get('distance')!==''?Number(get('distance')):null,hours:hike&&get('hours')!==''?Number(get('hours')):null,ascent:hike&&get('ascent')!==''?Number(get('ascent')):null};
    const entries=state.entries.filter(old=>old.id!==e.id);entries.push(e);
    const next=validateData({...state,entries});await persist(next);filter='all';$('#search').value='';$('#year').value='all';updateFilters();renderEntries();$('#editor').close();showToast('记录已保存。');
  }catch(error){$('#entry-error').textContent=error.message;}finally{$('#save-entry').disabled=false;}
});
function openProfile(){ if(!initialized)return;closeDialogs();const form=$('#profile-form');for(const name of ['name','subtitle','bio'])form.elements[name].value=state.profile[name];form.elements.resume.value=state.profile.resume.map(r=>[r.date,r.title,r.body].join(' | ')).join('\n');$('#profile-error').textContent='';openDialog('profile-editor'); }
$('#profile-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{const resume=form.elements.resume.value.split('\n').filter(s=>s.trim()).map(line=>{const parts=line.split('|').map(s=>s.trim());if(parts.length<2||!parts[0]||!parts[1])throw new Error('每条履历至少包含“时间 | 标题”，请检查填写格式。');return {date:parts[0],title:parts[1],body:parts.slice(2).join(' | ')};});const profile={name:form.elements.name.value.trim(),subtitle:form.elements.subtitle.value.trim(),bio:form.elements.bio.value.trim(),resume};await persist(validateData({...state,profile}));$('#profile-editor').close();showToast('个人资料已更新。');}catch(error){$('#profile-error').textContent=error.message;}finally{submit.disabled=false;}
});
function renderManager(){ $('#manage-records').innerHTML=state.entries.length?state.entries.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<div class="manage-record"><div><span>${e.date} · ${e.type==='hike'?'徒步':'随记'}</span><strong>${esc(e.title)}</strong></div><div><button class="text-link" data-edit="${e.id}">编辑</button><button class="text-link danger" data-delete="${e.id}">删除</button></div></div>`).join(''):'<p class="field-hint">目前还没有真实手记。点击右上角“写一笔”，开始你的第一条记录。</p>'; }
async function deleteEntry(id){ const entry=state.entries.find(e=>e.id===id);if(!entry||!confirm(`确定删除“${entry.title}”吗？删除后无法撤销，请先备份。`))return;try{await persist({...state,entries:state.entries.filter(e=>e.id!==id)});$('#detail').close();showToast('手记已删除。');}catch(error){showToast(error.message);} }
$('#export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`一步一程-备份-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);showToast('备份已导出，记得好好收藏。');});
$('#import-data').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;$('#manage-error').textContent='';
  try{if(file.size>80*1024*1024)throw new Error('备份文件过大（上限 80 MB）。');const next=validateData(JSON.parse(await file.text()));if(!confirm(`将导入 ${next.entries.length} 条手记和个人介绍，并替换当前浏览器内的全部内容。建议先导出备份。是否继续？`))return;await persist(next);showToast('回忆已经导入。');}catch(error){$('#manage-error').textContent=error instanceof SyntaxError?'文件不是有效的 JSON 备份。':error.message;}finally{event.target.value='';}
});
function showLightbox(index){lightboxPhotos=[...(activeEntry?.photos||[]),...(activeEntry?.routeImage?[activeEntry.routeImage]:[])];if(!lightboxPhotos.length)return;lightboxIndex=index;renderLightbox();openDialog('lightbox');}
function renderLightbox(){lightboxIndex=(lightboxIndex+lightboxPhotos.length)%lightboxPhotos.length;$('#lightbox-image').src=lightboxPhotos[lightboxIndex];$('#lightbox-image').alt=`${activeEntry.title}，第 ${lightboxIndex+1} 张照片`;$('#lightbox-counter').textContent=`${lightboxIndex+1} / ${lightboxPhotos.length}`;$('.lightbox-prev').hidden=$('.lightbox-next').hidden=lightboxPhotos.length<=1;}
$('.lightbox-prev').addEventListener('click',()=>{lightboxIndex--;renderLightbox();});$('.lightbox-next').addEventListener('click',()=>{lightboxIndex++;renderLightbox();});
document.addEventListener('keydown',event=>{if(!$('#lightbox').open)return;if(event.key==='ArrowLeft'){lightboxIndex--;renderLightbox();}if(event.key==='ArrowRight'){lightboxIndex++;renderLightbox();}});
function updateFilters(){ $$('[data-filter]').forEach(button=>{const active=button.dataset.filter===filter;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}); }
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;updateFilters();renderEntries();}));
$('#search').addEventListener('input',renderEntries);$('#year').addEventListener('change',renderEntries);
document.addEventListener('click',event=>{
  const target=event.target.closest('button,[data-action]');if(!target)return;
  if(target.hasAttribute('data-close')){target.closest('dialog')?.close();return;}
  if(target.dataset.archiveYear){$('#year').value=target.dataset.archiveYear;filter='all';updateFilters();renderEntries();$('#outdoors').scrollIntoView({behavior:'smooth'});return;}
  if(target.dataset.entry){openEntry(target.dataset.entry);return;}
  if(target.dataset.edit){openEditor(target.dataset.edit);return;}
  if(target.dataset.delete){deleteEntry(target.dataset.delete);return;}
  if(target.hasAttribute('data-remove-photo')){draftPhotos.splice(Number(target.dataset.removePhoto),1);renderDraftPhotos();return;}
  if(target.hasAttribute('data-remove-route')){draftRoute='';renderDraftRoute();return;}
  if(target.hasAttribute('data-photo-index')){showLightbox(Number(target.dataset.photoIndex));return;}
  const action=target.dataset.action;
  if(action==='new')openEditor();if(action==='profile')openProfile();if(action==='manage'){closeDialogs();$('#manage-error').textContent='';renderManager();openDialog('manager');}if(action==='credits')openDialog('credits');
});
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}));
initialize();
