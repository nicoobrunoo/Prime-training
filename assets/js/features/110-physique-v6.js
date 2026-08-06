/* Prime Training 6.0 — Físico Objetivo, check-in visual y evolución.
   Capa aditiva: no reemplaza entrenamiento, nutrición, chat ni persistencia. */
(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const today=()=>new Date().toISOString().slice(0,10);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const firstName=()=>String(profile?.name||'Nicolás').trim().split(/\s+/)[0]||'Nicolás';
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
  const groups=['chest','shoulders','back','arms','legs','core'];
  const labels={chest:'Pecho',shoulders:'Hombros',back:'Espalda',arms:'Brazos',legs:'Piernas',core:'Core'};
  const colors={chest:'#7c6cff',shoulders:'#34d5ee',back:'#42df9b',arms:'#ffb14a',legs:'#ff7185',core:'#9d8cff'};

  function ensureData(){
    data.physiqueCheckins=Array.isArray(data.physiqueCheckins)?data.physiqueCheckins:[];
    data.physiqueGoal=data.physiqueGoal&&typeof data.physiqueGoal==='object'?data.physiqueGoal:null;
    data.physiqueSettings=data.physiqueSettings&&typeof data.physiqueSettings==='object'?data.physiqueSettings:{dailyPrompt:true};
  }
  ensureData();

  function saveQuiet(){
    try{return window.PrimeState?.save?.({showToast:false})||window.commitPrimeState?.()||save?.()}catch(e){console.error('Prime Physique save:',e)}
  }
  function latest(){return [...data.physiqueCheckins].sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null}
  function prior(){const a=[...data.physiqueCheckins].sort((x,y)=>String(y.date).localeCompare(String(x.date)));return a[1]||null}
  function byDate(date){return data.physiqueCheckins.find(x=>x.date===date)||null}
  function currentIndices(){
    const item=latest();
    const source=item?.analysis?.indices||item?.indices||{};
    const fallback={chest:50,shoulders:50,back:50,arms:50,legs:50,core:50};
    return Object.fromEntries(groups.map(g=>[g,clamp(source[g]??fallback[g])]));
  }

  async function compressImage(file,maxW=760,maxH=1080,quality=.68){
    if(!file)throw new Error('Seleccioná una foto.');
    if(!file.type.startsWith('image/'))throw new Error('El archivo debe ser una imagen.');
    const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('No se pudo leer la imagen.'));r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('No se pudo procesar la imagen.'));i.src=raw});
    const scale=Math.min(1,maxW/img.width,maxH/img.height),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/jpeg',quality);
  }
  function dataUrlToBlob(dataUrl){const [meta,b64]=dataUrl.split(',');const mime=(meta.match(/data:([^;]+)/)||[])[1]||'image/jpeg';const bytes=atob(b64),arr=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);return new Blob([arr],{type:mime})}
  async function uploadPhoto(kind,key,dataUrl){
    try{
      const path=`main/${kind}/${key}.jpg`;const {error}=await sb.storage.from('prime-physique').upload(path,dataUrlToBlob(dataUrl),{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});if(error)throw error;const {data:pub}=sb.storage.from('prime-physique').getPublicUrl(path);return `${pub.publicUrl}?v=${Date.now()}`
    }catch(error){console.warn('Storage no disponible; se usará respaldo comprimido en el estado.',error);return dataUrl}
  }

  function injectUI(){
    if(q('#physiqueCheckinModal'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div class="modal prime-v6-modal" id="physiqueCheckinModal"><div class="sheet prime-v6-sheet">
        <div class="prime-v6-grabber"></div>
        <div class="sheet-head"><div><div class="eyebrow">CHECK-IN VISUAL</div><div class="sheet-title">Tu físico de hoy</div><div class="caption">Misma luz, distancia y postura para comparar mejor.</div></div><button class="icon-button" data-close-v6="physiqueCheckinModal"><svg><use href="#i-x"></use></svg></button></div>
        <div class="prime-photo-stage" id="dailyPhotoStage"><div class="prime-photo-empty"><svg><use href="#i-camera"></use></svg><strong>Foto frontal del día</strong><span>La imagen queda guardada en tu historial.</span></div><img id="dailyPhotoPreview" hidden></div>
        <input type="file" accept="image/*" capture="user" id="dailyPhotoInput" hidden>
        <div class="prime-v6-actions"><button class="btn btn-primary" id="takeDailyPhoto"><svg><use href="#i-camera"></use></svg>Tomar o elegir foto</button><button class="btn btn-secondary" id="analyzeDailyPhoto" disabled><svg><use href="#i-spark"></use></svg>Analizar check-in</button></div>
        <div class="prime-analysis-progress" id="physiqueAnalysisProgress" hidden><i></i><span>Prime AI compara proporciones y evolución visual…</span></div>
        <div class="prime-v6-result" id="dailyPhotoResult" hidden></div>
        <button class="prime-skip-link" id="skipDailyPhoto">Ahora no</button>
      </div></div>

      <div class="modal prime-v6-modal" id="physiqueEvolutionModal"><div class="sheet prime-v6-sheet prime-v6-wide">
        <div class="prime-v6-grabber"></div>
        <div class="sheet-head"><div><div class="eyebrow">EVOLUCIÓN VISUAL</div><div class="sheet-title">Mi físico</div></div><button class="icon-button" data-close-v6="physiqueEvolutionModal"><svg><use href="#i-x"></use></svg></button></div>
        <div id="physiqueEvolutionContent"></div>
      </div></div>

      <div class="modal prime-v6-modal" id="physiqueGoalModal"><div class="sheet prime-v6-sheet prime-v6-wide">
        <div class="prime-v6-grabber"></div>
        <div class="sheet-head"><div><div class="eyebrow">FÍSICO OBJETIVO</div><div class="sheet-title">Definí tu referencia visual</div><div class="caption">Es una orientación, no una promesa ni una medición clínica.</div></div><button class="icon-button" data-close-v6="physiqueGoalModal"><svg><use href="#i-x"></use></svg></button></div>
        <div class="prime-photo-stage goal" id="goalPhotoStage"><div class="prime-photo-empty"><svg><use href="#i-upload"></use></svg><strong>Subí una foto objetivo</strong><span>Prime AI analizará proporciones y prioridades visuales.</span></div><img id="goalPhotoPreview" hidden></div>
        <input type="file" accept="image/*" id="goalPhotoInput" hidden>
        <div class="prime-v6-actions"><button class="btn btn-primary" id="chooseGoalPhoto"><svg><use href="#i-upload"></use></svg>Elegir referencia</button><button class="btn btn-secondary" id="analyzeGoalPhoto" disabled><svg><use href="#i-spark"></use></svg>Crear plan visual</button></div>
        <div class="prime-analysis-progress" id="goalAnalysisProgress" hidden><i></i><span>Analizando físico objetivo y prioridades…</span></div>
        <div class="prime-v6-result" id="goalAnalysisResult"></div>
      </div></div>`);

    const home=q('#homePage .hero');
    home?.insertAdjacentHTML('afterend',`<section class="prime-v6-overview" id="primePhysiqueOverview"></section>`);

    qa('[data-close-v6]').forEach(b=>b.onclick=()=>closeV6(b.dataset.closeV6));
    qa('.prime-v6-modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeV6(m.id)}));
  }
  function openV6(id){q('#'+id)?.classList.add('open');document.body.classList.add('modal-open')}
  function closeV6(id){q('#'+id)?.classList.remove('open');if(!q('.modal.open'))document.body.classList.remove('modal-open')}

  function deltaFor(group){const a=latest()?.analysis?.indices?.[group],b=prior()?.analysis?.indices?.[group];return Number.isFinite(+a)&&Number.isFinite(+b)?Math.round(+a-+b):0}
  function renderHome(){
    ensureData();const host=q('#primePhysiqueOverview');if(!host)return;
    const item=latest(),indices=currentIndices(),goal=data.physiqueGoal;
    host.innerHTML=`
      <div class="prime-v6-section-head"><div><span class="eyebrow">EVOLUCIÓN FÍSICA</span><h2>Tu mapa corporal</h2></div><button class="prime-text-button" id="openPhysiqueEvolution">Ver evolución <svg><use href="#i-right"></use></svg></button></div>
      <div class="prime-index-layout">
        <div class="prime-index-hero"><div class="prime-index-number">${item?Math.round(Object.values(indices).reduce((a,b)=>a+b,0)/groups.length):'—'}</div><span>PRIME VISUAL INDEX</span><p>${item?'Estimación comparativa basada en tus check-ins.':'Subí tu primera foto para crear una línea de base.'}</p><button class="btn btn-primary" id="homeDailyCheckin"><svg><use href="#i-camera"></use></svg>${byDate(today())?'Ver check-in de hoy':'Check-in de hoy'}</button></div>
        <div class="prime-muscle-list">${groups.map(g=>{const d=deltaFor(g);return `<div class="prime-muscle-row"><div class="prime-muscle-name"><strong>${labels[g]}</strong><span>${d>0?'↑ +'+d:d<0?'↓ '+Math.abs(d):'→ estable'}</span></div><div class="prime-index-track"><i style="width:${indices[g]}%;--prime-index-color:${colors[g]}"></i></div><b>${item?indices[g]:'—'}</b></div>`}).join('')}</div>
      </div>
      <div class="prime-goal-strip"><div><span class="eyebrow">MODO FÍSICO OBJETIVO</span><strong>${goal?'Plan visual activo':'Convertí una referencia en un plan'}</strong><p>${goal?.analysis?.summary||'Compará prioridades musculares, composición visual y próximos pasos.'}</p></div><button class="btn btn-soft" id="openPhysiqueGoal">${goal?'Ver objetivo':'Configurar'}</button></div>`;
    q('#openPhysiqueEvolution')?.addEventListener('click',openEvolution);
    q('#homeDailyCheckin')?.addEventListener('click',()=>{const existing=byDate(today());existing?openEvolution(today()):openDaily()});
    q('#openPhysiqueGoal')?.addEventListener('click',openGoal);
  }

  function renderIndexBars(indices={}){return `<div class="prime-v6-index-grid">${groups.map(g=>`<div><div><span>${labels[g]}</span><strong>${Math.round(clamp(indices[g]??50))}</strong></div><div class="prime-index-track"><i style="width:${clamp(indices[g]??50)}%;--prime-index-color:${colors[g]}"></i></div></div>`).join('')}</div>`}
  function renderAnalysis(analysis){
    return `<div class="prime-analysis-card"><div class="prime-analysis-title"><span class="prime-ai-mark">✦</span><div><span>PRIME AI</span><strong>${esc(analysis.headline||'Análisis visual')}</strong></div></div><p>${esc(analysis.summary||'Check-in registrado.')}</p>${renderIndexBars(analysis.indices)}${analysis.observations?.length?`<div class="prime-insight-list">${analysis.observations.map(x=>`<div><i></i><span>${esc(x)}</span></div>`).join('')}</div>`:''}<div class="prime-analysis-note">Índices visuales orientativos. No son porcentajes anatómicos ni diagnósticos.</div></div>`;
  }

  let dailyPhoto='';
  function openDaily(){
    const existing=byDate(today());dailyPhoto=existing?.photo||'';
    const img=q('#dailyPhotoPreview'),empty=q('#dailyPhotoStage .prime-photo-empty');
    img.hidden=!dailyPhoto;if(dailyPhoto)img.src=dailyPhoto;empty.hidden=!!dailyPhoto;
    q('#analyzeDailyPhoto').disabled=!dailyPhoto;
    q('#dailyPhotoResult').hidden=!existing?.analysis;q('#dailyPhotoResult').innerHTML=existing?.analysis?renderAnalysis(existing.analysis):'';
    openV6('physiqueCheckinModal');
  }
  function openEvolution(focusDate=''){
    const list=[...data.physiqueCheckins].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const host=q('#physiqueEvolutionContent');
    host.innerHTML=list.length?`<div class="prime-evolution-summary">${renderIndexBars(currentIndices())}</div><div class="prime-photo-timeline">${list.map((x,i)=>`<article class="prime-timeline-item ${x.date===focusDate?'focus':''}"><img src="${x.photo}" alt="Check-in ${x.date}"><div><span>${new Date(x.date+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})}</span><strong>${esc(x.analysis?.headline||'Check-in visual')}</strong><p>${esc(x.analysis?.summary||'Foto registrada.')}</p><div class="prime-timeline-meta">${x.weight?`<b>${x.weight} kg</b>`:''}<b>Índice ${Math.round(Object.values(x.analysis?.indices||{}).reduce((a,b)=>a+(+b||0),0)/(Object.keys(x.analysis?.indices||{}).length||1))}</b></div></div></article>`).join('')}</div>`:`<div class="prime-empty-state"><svg><use href="#i-camera"></use></svg><h3>Todavía no hay check-ins</h3><p>La evolución aparece cuando registrás fotos en distintos días.</p><button class="btn btn-primary" id="emptyStartCheckin">Hacer primer check-in</button></div>`;
    q('#emptyStartCheckin')?.addEventListener('click',()=>{closeV6('physiqueEvolutionModal');openDaily()});
    openV6('physiqueEvolutionModal');
  }
  function openGoal(){
    const goal=data.physiqueGoal,img=q('#goalPhotoPreview'),empty=q('#goalPhotoStage .prime-photo-empty');
    img.hidden=!goal?.photo;if(goal?.photo)img.src=goal.photo;empty.hidden=!!goal?.photo;q('#analyzeGoalPhoto').disabled=!goal?.photo;
    q('#goalAnalysisResult').innerHTML=goal?.analysis?renderGoal(goal.analysis):'';openV6('physiqueGoalModal');
  }
  function renderGoal(a){return `<div class="prime-goal-analysis"><div class="prime-analysis-title"><span class="prime-ai-mark">✦</span><div><span>PLAN VISUAL</span><strong>${esc(a.headline||'Tu físico objetivo')}</strong></div></div><p>${esc(a.summary||'')}</p><div class="prime-goal-facts"><div><span>Grasa visual estimada</span><strong>${esc(a.estimated_body_fat||'No concluyente')}</strong></div><div><span>Horizonte orientativo</span><strong>${esc(a.estimated_timeline||'A definir')}</strong></div></div>${renderIndexBars(a.target_indices)}${a.priorities?.length?`<h3>Prioridades principales</h3><div class="prime-priority-list">${a.priorities.map((x,i)=>`<div><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}</div>`:''}${a.plan?.length?`<h3>Plan inicial</h3><div class="prime-insight-list">${a.plan.map(x=>`<div><i></i><span>${esc(x)}</span></div>`).join('')}</div>`:''}<div class="prime-analysis-note">Estimación visual dependiente de pose, luz, edición y perspectiva.</div></div>`}

  async function analyzeDaily(){
    if(!dailyPhoto)return;const progress=q('#physiqueAnalysisProgress'),button=q('#analyzeDailyPhoto');button.disabled=true;progress.hidden=false;
    try{
      const body=latestBody?.()||{};const previous=byDate(today())?prior():latest();
      const result=await callSmartHandler({action:'analyze_physique_checkin',imageDataUrl:dailyPhoto,context:{date:today(),profile:{name:profile?.name,goal:profile?.goal,age:profile?.age,sex:profile?.sex},weight:body.weight,height:body.height,previous_analysis:previous?.analysis||null,recent_weights:(data.bodyMeasurements||[]).slice(-8)}});
      const analysis=result.analysis||result;const storedPhoto=await uploadPhoto('checkins',today(),dailyPhoto);const entry={id:crypto.randomUUID?.()||String(Date.now()),date:today(),createdAt:new Date().toISOString(),photo:storedPhoto,weight:Number(body.weight)||null,analysis};
      data.physiqueCheckins=data.physiqueCheckins.filter(x=>x.date!==entry.date);data.physiqueCheckins.push(entry);await saveQuiet();q('#dailyPhotoResult').hidden=false;q('#dailyPhotoResult').innerHTML=renderAnalysis(analysis);localStorage.setItem('prime-physique-prompt-'+today(),'done');renderHome();try{renderCalendar?.()}catch(_){ }toast?.('Check-in visual guardado');
    }catch(e){console.error(e);toast?.(e.message||'No se pudo analizar la foto')}
    finally{progress.hidden=true;button.disabled=false}
  }

  async function analyzeGoal(){
    const goal=data.physiqueGoal;if(!goal?.photo)return;const progress=q('#goalAnalysisProgress'),button=q('#analyzeGoalPhoto');button.disabled=true;progress.hidden=false;
    try{
      const body=latestBody?.()||{},current=latest()?.analysis||null;
      const result=await callSmartHandler({action:'analyze_physique_goal',imageDataUrl:goal.analysisImage||goal.photo,context:{profile:{goal:profile?.goal,age:profile?.age,sex:profile?.sex},current_body:{weight:body.weight,height:body.height},current_visual_analysis:current,routine:data.routine,nutrition_settings:data.nutritionSettings}});
      goal.analysis=result.analysis||result;delete goal.analysisImage;goal.updatedAt=new Date().toISOString();await saveQuiet();q('#goalAnalysisResult').innerHTML=renderGoal(goal.analysis);renderHome();toast?.('Físico objetivo analizado');
    }catch(e){console.error(e);toast?.(e.message||'No se pudo analizar el objetivo')}
    finally{progress.hidden=true;button.disabled=false}
  }

  function bind(){
    q('#takeDailyPhoto').onclick=()=>q('#dailyPhotoInput').click();
    q('#dailyPhotoInput').onchange=async e=>{try{dailyPhoto=await compressImage(e.target.files?.[0]);const img=q('#dailyPhotoPreview');img.src=dailyPhoto;img.hidden=false;q('#dailyPhotoStage .prime-photo-empty').hidden=true;q('#analyzeDailyPhoto').disabled=false;q('#dailyPhotoResult').hidden=true}catch(err){toast?.(err.message)}finally{e.target.value=''}};
    q('#analyzeDailyPhoto').onclick=analyzeDaily;
    q('#skipDailyPhoto').onclick=()=>{localStorage.setItem('prime-physique-prompt-'+today(),'skipped');closeV6('physiqueCheckinModal')};
    q('#chooseGoalPhoto').onclick=()=>q('#goalPhotoInput').click();
    q('#goalPhotoInput').onchange=async e=>{try{const photoData=await compressImage(e.target.files?.[0]);const photo=await uploadPhoto('goal','current',photoData);data.physiqueGoal={...(data.physiqueGoal||{}),photo,analysisImage:photoData,updatedAt:new Date().toISOString()};const img=q('#goalPhotoPreview');img.src=photo;img.hidden=false;q('#goalPhotoStage .prime-photo-empty').hidden=true;q('#analyzeGoalPhoto').disabled=false;q('#goalAnalysisResult').innerHTML='';await saveQuiet()}catch(err){toast?.(err.message)}finally{e.target.value=''}};
    q('#analyzeGoalPhoto').onclick=analyzeGoal;
  }

  function decorateCalendar(){
    try{
      qa('#calendarGrid .day').forEach(btn=>{const n=btn.querySelector('.day-number')?.textContent;if(!n)return;const y=currentMonth.getFullYear(),m=currentMonth.getMonth();/* visual marker is added by open detail; exact outside-month mapping stays untouched */});
    }catch(_){ }
  }
  const originalOpen=window.openDayDetail;
  window.openDayDetail=date=>{originalOpen?.(date);setTimeout(()=>{const host=q('#calendarDetailContent'),check=byDate(date);if(!host||!check)return;host.insertAdjacentHTML('beforeend',`<section class="prime-calendar-photo"><div class="prime-v6-section-head"><div><span class="eyebrow">CHECK-IN VISUAL</span><h3>Foto del día</h3></div><button class="prime-text-button" id="openEvolutionFromDay">Ver evolución</button></div><img src="${check.photo}" alt="Check-in del ${date}">${check.analysis?`<p>${esc(check.analysis.summary||'')}</p>`:''}</section>`);q('#openEvolutionFromDay')?.addEventListener('click',()=>{closeModal?.('calendarDetailModal');openEvolution(date)})},20)};

  // Añade el análisis visual al contexto de los reportes sin alterar otras acciones de IA.
  try{
    const originalCall=callSmartHandler;
    callSmartHandler=async payload=>{
      if(payload?.action==='daily_expert_report'){
        const check=byDate(payload.context?.date||today());
        payload={...payload,context:{...(payload.context||{}),physique_checkin:check?{date:check.date,weight:check.weight,analysis:check.analysis,has_photo:true}:null,physique_goal:data.physiqueGoal?.analysis||null}};
      }
      return originalCall(payload);
    };
  }catch(e){console.warn('No se pudo enriquecer contexto de reportes',e)}

  function schedulePrompt(){
    setTimeout(()=>{
      if(data.physiqueSettings?.dailyPrompt===false||byDate(today())||localStorage.getItem('prime-physique-prompt-'+today()))return;
      const hour=new Date().getHours();if(hour>=5&&hour<13&&!q('.modal.open'))openDaily();
    },1100);
  }

  injectUI();bind();renderHome();decorateCalendar();schedulePrompt();
  const oldRenderAll=window.renderAll||renderAll;
  try{window.renderAll=function(){const r=oldRenderAll.apply(this,arguments);setTimeout(()=>{ensureData();renderHome();decorateCalendar()},0);return r}}catch(_){ }
  window.PrimePhysique={openDaily,openEvolution,openGoal,render:renderHome};
})();
