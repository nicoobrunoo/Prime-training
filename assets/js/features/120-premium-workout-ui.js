/* Prime Training 6.1 — Workout premium, exercise media, Home order and iPhone nav. */
(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const effectiveSets=ex=>(ex?.sets||[]).filter(s=>!s.warmup);
  const completedSets=ex=>effectiveSets(ex).filter(s=>s.done&&Number(s.reps)>0);
  let activeIndex=0;

  async function compressImage(file,maxW=1100,maxH=820,quality=.76){
    if(!file||!file.type?.startsWith('image/'))throw new Error('Seleccioná una imagen válida.');
    const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('No se pudo leer la imagen.'));r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('No se pudo procesar la imagen.'));i.src=raw});
    const scale=Math.min(1,maxW/img.width,maxH/img.height),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/jpeg',quality);
  }
  function dataUrlToBlob(dataUrl){const [meta,b64]=dataUrl.split(',');const mime=(meta.match(/data:([^;]+)/)||[])[1]||'image/jpeg';const bytes=atob(b64),arr=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);return new Blob([arr],{type:mime})}
  async function storeExerciseImage(ex,dataUrl){
    try{
      if(typeof sb==='undefined'||!sb?.storage)throw new Error('Storage no listo');
      const id=ex.id||crypto.randomUUID?.()||String(Date.now());ex.id=id;
      const path=`main/exercises/${id}.jpg`;
      const {error}=await sb.storage.from('prime-physique').upload(path,dataUrlToBlob(dataUrl),{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});
      if(error)throw error;
      const {data:pub}=sb.storage.from('prime-physique').getPublicUrl(path);
      return `${pub.publicUrl}?v=${Date.now()}`;
    }catch(error){console.warn('Imagen guardada en estado local:',error);return dataUrl}
  }

  // Editor de rutina con imagen por ejercicio.
  const baseRenderRoutineEditor=window.renderRoutineEditor;
  window.renderRoutineEditor=function(){
    const routine=data.routine?.[editingRoutine],editor=q('#routineEditor');
    if(!routine||!editor){baseRenderRoutineEditor?.();return}
    editor.innerHTML=(routine.exercises||[]).map((ex,index)=>`
      <article class="routine-exercise-editor premium-ex-editor" data-exercise-index="${index}">
        <div class="premium-ex-media ${ex.image?'has-image':''}">
          ${ex.image?`<img src="${esc(ex.image)}" alt="${esc(ex.name)}">`:`<div class="premium-ex-placeholder"><svg><use href="#i-camera"></use></svg><span>Imagen del ejercicio</span></div>`}
          <div class="premium-media-actions">
            <button type="button" onclick="PrimeWorkoutMedia.pick(${index})"><svg><use href="#i-upload"></use></svg>${ex.image?'Cambiar':'Agregar imagen'}</button>
            ${ex.image?`<button type="button" class="danger" onclick="PrimeWorkoutMedia.remove(${index})"><svg><use href="#i-trash"></use></svg></button>`:''}
          </div>
          <input type="file" accept="image/*" data-exercise-image-input="${index}" hidden>
        </div>
        <div class="premium-ex-fields">
          <label class="wide"><span>Ejercicio</span><input class="field" data-field="name" value="${esc(ex.name||'')}"></label>
          <label><span>Series</span><input class="field" data-field="sets" type="number" min="1" value="${Number(ex.sets)||1}"></label>
          <label><span>Peso sugerido</span><input class="field" data-field="weight" type="number" step=".5" value="${Number(ex.weight)||0}"></label>
          <label><span>Reps mínimas</span><input class="field" data-field="minReps" type="number" min="1" value="${Number(ex.minReps)||1}"></label>
          <label><span>Reps máximas</span><input class="field" data-field="maxReps" type="number" min="1" value="${Number(ex.maxReps)||1}"></label>
          <label class="wide"><span>Descanso entre series</span><div class="premium-input-unit"><input class="field" data-field="rest" type="number" min="15" step="5" value="${Number(ex.rest)||90}"><b>seg</b></div></label>
        </div>
        <button class="premium-delete-ex" type="button" onclick="deleteRoutineExercise(${index})"><svg><use href="#i-trash"></use></svg>Eliminar ejercicio</button>
      </article>`).join('');
    qa('[data-exercise-image-input]',editor).forEach(input=>input.onchange=async event=>{
      const index=Number(input.dataset.exerciseImageInput),ex=routine.exercises[index],file=event.target.files?.[0];if(!ex||!file)return;
      try{toast?.('Procesando imagen…');const compressed=await compressImage(file);ex.image=await storeExerciseImage(ex,compressed);await (window.PrimeState?.save?.({showToast:false})||window.commitPrimeState?.()||save?.());window.renderRoutineEditor();toast?.('Imagen guardada')}
      catch(e){console.error(e);toast?.(e.message||'No se pudo guardar la imagen')}
      finally{event.target.value=''}
    });
  };
  window.PrimeWorkoutMedia={
    pick(index){q(`[data-exercise-image-input="${index}"]`)?.click()},
    async remove(index){const ex=data.routine?.[editingRoutine]?.exercises?.[index];if(!ex)return;delete ex.image;await (window.PrimeState?.save?.({showToast:false})||window.commitPrimeState?.()||save?.());window.renderRoutineEditor()}
  };

  // Copia la imagen configurada a la sesión nueva sin alterar la creación original.
  const baseCreate=window.createTodaySession;
  if(typeof baseCreate==='function')window.createTodaySession=function(){
    const session=baseCreate.apply(this,arguments);if(!session)return session;
    const routine=data.routine?.find(r=>r.day===session.routineDay)||todayRoutine?.();
    (session.exercises||[]).forEach(ex=>{const source=routine?.exercises?.find(r=>String(r.id)===String(ex.id))||routine?.exercises?.find(r=>r.name===ex.name);if(source?.image)ex.image=source.image});
    return session;
  };

  function setRow(ex,ei,set,si){
    return `<div class="premium-set-row ${set.done?'done':''}" data-ei="${ei}" data-si="${si}">
      <button class="premium-set-index ${set.done?'done':''}" onclick="toggleSet(${ei},${si})">${set.done?'✓':set.warmup?'C':set.set}</button>
      <label><span>Peso (kg)</span><div class="premium-stepper"><button type="button" onclick="PrimeWorkoutUI.step(${ei},${si},'weight',-.5)">−</button><input inputmode="decimal" type="number" step=".5" value="${set.weight}" onchange="updateSet(${ei},${si},'weight',this.value)"><button type="button" onclick="PrimeWorkoutUI.step(${ei},${si},'weight',.5)">+</button></div></label>
      <label><span>Reps</span><input class="premium-reps premium-field" inputmode="numeric" type="number" value="${set.reps}" placeholder="${ex.maxReps}" onchange="updateSet(${ei},${si},'reps',this.value)"></label>
      <button class="premium-check ${set.done?'done':''}" onclick="toggleSet(${ei},${si})"><svg><use href="#i-check"></use></svg></button>
    </div>`;
  }
  function getSessionSafe(){try{return getSession?.()}catch(_){return null}}
  function renderWorkoutPremium(){
    const session=getSessionSafe(),root=q('#workoutExercises');if(!session||!root)return false;
    const exercises=session.exercises||[];if(!exercises.length)return false;
    activeIndex=Math.max(0,Math.min(activeIndex,exercises.length-1));
    const ex=exercises[activeIndex],done=completedSets(ex).length,total=effectiveSets(ex).length;
    const allDone=exercises.filter(x=>completedSets(x).length>=effectiveSets(x).length).length;
    const pct=Math.round(allDone/Math.max(1,exercises.length)*100);
    const image=ex.image||data.routine?.flatMap(r=>r.exercises||[]).find(r=>String(r.id)===String(ex.id))?.image||'';
    root.innerHTML=`<div class="premium-workout">
      <section class="premium-session-top">
        <div><span>Entrenamiento</span><h1>${esc(session.title||session.muscle||'Sesión')}</h1></div>
        <div class="premium-session-time"><svg><use href="#i-clock"></use></svg><span id="premiumElapsed">00:00</span></div>
      </section>
      <section class="premium-session-progress"><div><span>Ejercicio ${activeIndex+1} de ${exercises.length}</span><strong>${pct}% completado</strong></div><i><b style="width:${pct}%"></b></i></section>
      <article class="premium-exercise-card">
        <header><div><span class="premium-kicker">Ejercicio actual</span><h2>${esc(ex.name)}</h2><p>${total} series · ${ex.minReps}-${ex.maxReps} reps · ${ex.rest||90}s descanso</p></div><strong>${done}/${total}</strong></header>
        <div class="premium-exercise-image ${image?'':'empty'}">
          ${image?`<img src="${esc(image)}" alt="${esc(ex.name)}">`:`<div><svg><use href="#i-dumbbell"></use></svg><strong>${esc(ex.name)}</strong><span>Agregá una imagen desde la configuración de la rutina</span></div>`}
          <div class="premium-image-overlay"><span>${esc(session.muscle||'Entrenamiento')}</span><b>${ex.minReps}-${ex.maxReps} reps</b></div>
        </div>
        <div class="premium-set-head"><span>Serie</span><span>Peso</span><span>Reps</span><span></span></div>
        <div class="premium-set-list">${(ex.sets||[]).map((set,si)=>setRow(ex,activeIndex,set,si)).join('')}</div>
        <div class="premium-tools"><button onclick="addWarmup(${activeIndex})">+ Calentamiento</button><button onclick="addSet(${activeIndex})">+ Serie</button><button class="${ex.tag==='Me costó'?'active':''}" onclick="setExerciseFlag?.(${activeIndex},'Me costó')||tagExercise?.(${activeIndex},'Me costó')">Me costó</button><button class="danger ${ex.tag==='Dolor'?'active':''}" onclick="setExerciseFlag?.(${activeIndex},'Dolor')||tagExercise?.(${activeIndex},'Dolor')">Dolor</button></div>
        <textarea class="field premium-note" placeholder="Nota opcional para Prime AI…" onchange="updateNote(${activeIndex},this.value)">${esc(ex.note||'')}</textarea>
      </article>
      <section class="premium-exercise-nav">
        <button ${activeIndex===0?'disabled':''} onclick="PrimeWorkoutUI.go(-1)"><svg><use href="#i-left"></use></svg><span>Anterior</span></button>
        <button class="finish-current" onclick="PrimeWorkoutUI.completeCurrent()"><svg><use href="#i-check"></use></svg><span>Finalizar ejercicio</span></button>
        <button ${activeIndex===exercises.length-1?'disabled':''} onclick="PrimeWorkoutUI.go(1)"><span>Siguiente</span><svg><use href="#i-right"></use></svg></button>
      </section>
      <section class="premium-exercise-list">
        <div class="premium-list-title"><span>Ejercicios de la sesión</span><strong>${allDone}/${exercises.length}</strong></div>
        ${exercises.map((item,i)=>{const completed=completedSets(item).length>=effectiveSets(item).length;return `<button class="premium-list-item ${i===activeIndex?'active':''} ${completed?'done':''}" onclick="PrimeWorkoutUI.select(${i})">${item.image?`<img src="${esc(item.image)}" alt="">`:`<span class="premium-list-number">${completed?'✓':i+1}</span>`}<span><strong>${esc(item.name)}</strong><small>${item.targetSets||effectiveSets(item).length} series · ${item.minReps}-${item.maxReps} reps</small></span><i>${completed?'✓':'○'}</i></button>`}).join('')}
      </section>
    </div>`;
    q('#finishWorkoutBtn')?.classList.add('premium-final-button');
    updateElapsed(session);
    return true;
  }
  function updateElapsed(session){
    const target=q('#premiumElapsed');if(!target)return;const start=new Date(session.startedAt||Date.now()).getTime();const sec=Math.max(0,Math.floor((Date.now()-start)/1000));target.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  }
  setInterval(()=>{const s=getSessionSafe();if(s&&q('#workoutPage.active'))updateElapsed(s)},1000);
  const baseRenderWorkout=window.renderWorkout;
  window.renderWorkout=function(){if(!renderWorkoutPremium())baseRenderWorkout?.apply(this,arguments)};
  window.PrimeWorkoutUI={
    select(i){activeIndex=Math.max(0,Math.min(Number(i)||0,(getSessionSafe()?.exercises?.length||1)-1));window.renderWorkout();scrollTo({top:0,behavior:'smooth'})},
    go(d){this.select(activeIndex+Number(d||0))},
    step(ei,si,field,delta){const s=getSessionSafe(),set=s?.exercises?.[ei]?.sets?.[si];if(!set)return;set[field]=Math.max(0,(Number(set[field])||0)+Number(delta||0));save?.();window.renderWorkout()},
    completeCurrent(){const s=getSessionSafe(),ex=s?.exercises?.[activeIndex];if(!ex)return;effectiveSets(ex).forEach(set=>{if(!set.done){set.done=true;if(!Number(set.reps))set.reps=Number(ex.maxReps)||Number(ex.minReps)||1}});save?.();navigator.vibrate?.(35);if(activeIndex<s.exercises.length-1)activeIndex++;window.renderWorkout();renderHome?.()}
  };

  // Home: saludo, entrenamiento, evolución corporal y después el resto.
  function reorderHome(){
    const home=q('#homePage'),hero=home?.querySelector('.hero'),today=home?.querySelector('.today-card'),physique=q('#primePhysiqueOverview');if(!home||!hero||!today)return;
    if(hero.nextElementSibling!==today)hero.after(today);
    if(physique){physique.classList.add('inside-home');today.after(physique)}
  }
  const observeHome=new MutationObserver(()=>requestAnimationFrame(reorderHome));const home=q('#homePage');if(home)observeHome.observe(home,{childList:true,subtree:false});
  const baseRenderHome=window.renderHome;window.renderHome=function(){const r=baseRenderHome?.apply(this,arguments);setTimeout(reorderHome,0);return r};setTimeout(reorderHome,50);

  // Check-in diario: botones separados para cámara y galería.
  function upgradeDailyPhoto(){
    const actions=q('#physiqueCheckinModal .prime-v6-actions'),input=q('#dailyPhotoInput');if(!actions||!input||q('#chooseDailyGallery'))return;
    const camera=q('#takeDailyPhoto');
    if(camera){camera.innerHTML='<svg><use href="#i-camera"></use></svg>Tomar foto';camera.onclick=()=>{input.setAttribute('capture','user');input.click()}}
    camera?.insertAdjacentHTML('afterend','<button class="btn btn-secondary" id="chooseDailyGallery"><svg><use href="#i-upload"></use></svg>Elegir de galería</button>');
    q('#chooseDailyGallery').onclick=()=>{input.removeAttribute('capture');input.click()};
  }
  setTimeout(upgradeDailyPhoto,100);

  // Navegación global consistente en iPhone, incluidos Chat, Reportes y Progreso.
  function normalizeNav(){
    const nav=q('#bottomNav');if(!nav)return;
    nav.style.setProperty('position','fixed','important');nav.style.setProperty('left','50%','important');nav.style.setProperty('right','auto','important');nav.style.setProperty('top','auto','important');nav.style.setProperty('bottom','max(8px, env(safe-area-inset-bottom))','important');nav.style.setProperty('transform','translate3d(-50%,0,0)','important');nav.style.setProperty('margin','0','important');
  }
  ['resize','orientationchange','pageshow'].forEach(name=>window.addEventListener(name,()=>setTimeout(normalizeNav,80),{passive:true}));
  window.visualViewport?.addEventListener('resize',()=>{if(!document.body.classList.contains('pt-keyboard-open'))setTimeout(normalizeNav,120)},{passive:true});
  document.addEventListener('focusout',()=>[80,250,600].forEach(t=>setTimeout(normalizeNav,t)),true);
  document.addEventListener('click',e=>{if(e.target.closest('.nav'))setTimeout(normalizeNav,80)},true);
  normalizeNav();

  // Prime Training 6.4 — feedback visual robusto para series completadas.
  function primePaintCompletedSet(ei,si){
    try{
      const session=getSession?.();
      const ex=session?.exercises?.[ei], set=ex?.sets?.[si];
      if(!ex||!set)return;
      const row=document.querySelector(`.premium-set-row[data-ei="${ei}"][data-si="${si}"]`);
      if(!row)return;
      row.classList.toggle('done',!!set.done);
      row.setAttribute('aria-checked',set.done?'true':'false');
      const index=row.querySelector('.premium-set-index');
      const check=row.querySelector('.premium-check');
      if(index){
        index.classList.toggle('done',!!set.done);
        index.innerHTML=set.done?'<span class="premium-checkmark-inline">✓</span>':String(set.warmup?'C':(set.set||si+1));
      }
      if(check){
        check.classList.toggle('done',!!set.done);
        check.setAttribute('aria-pressed',set.done?'true':'false');
        check.innerHTML=set.done?'<span class="premium-check-icon">✓</span>':'<span class="premium-check-icon">✓</span>';
      }
      const reps=row.querySelector('.premium-reps');
      if(reps)reps.value=set.reps??'';
      if(set.done){
        row.classList.remove('prime-set-pop');
        void row.offsetWidth;
        row.classList.add('prime-set-pop');
      }
      const effective=(ex.sets||[]).filter(s=>!s.warmup);
      const completed=effective.filter(s=>s.done&&Number(s.reps)>0).length;
      const counter=document.querySelector('.premium-exercise-card > header > strong');
      if(counter)counter.textContent=`${completed}/${effective.length}`;
    }catch(error){console.warn('Feedback visual de serie:',error)}
  }

  const previousToggleSet=window.toggleSet;
  window.toggleSet=function(ei,si){
    try{
      const session=getSession?.();
      const ex=session?.exercises?.[ei],set=ex?.sets?.[si];
      if(!set)return previousToggleSet?.(ei,si);
      const shouldComplete=!set.done;
      const repsWereEmpty=!Number(set.reps);

      if(typeof previousToggleSet==='function'){
        previousToggleSet(ei,si);
      }else{
        set.done=shouldComplete;
      }

      // El check rápido SIEMPRE usa el máximo cuando el campo estaba vacío
      // antes del toque. Esto corrige capas antiguas que cargaban el mínimo.
      if(shouldComplete){
        set.done=true;
        if(repsWereEmpty){
          set.reps=Number(ex.maxReps)||Number(ex.minReps)||1;
        }
      }

      primePaintCompletedSet(ei,si);
      requestAnimationFrame(()=>primePaintCompletedSet(ei,si));
      setTimeout(()=>primePaintCompletedSet(ei,si),60);
    }catch(error){
      console.error('Error marcando serie:',error);
      if(typeof previousToggleSet==='function')return previousToggleSet(ei,si);
    }
  };

  // Corrige cualquier serie ya marcada al renderizar o volver al ejercicio.
  function repaintVisibleSets(){
    try{
      const session=getSession?.();
      if(!session)return;
      (session.exercises||[]).forEach((ex,ei)=>(ex.sets||[]).forEach((set,si)=>{
        if(document.querySelector(`.premium-set-row[data-ei="${ei}"][data-si="${si}"]`))primePaintCompletedSet(ei,si);
      }));
    }catch(_){}
  }
  window.addEventListener('pageshow',()=>setTimeout(repaintVisibleSets,50));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(repaintVisibleSets,50)});

})();
