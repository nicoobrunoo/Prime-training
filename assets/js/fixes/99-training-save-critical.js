(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let fallbackTimer=0;

  async function commitPrimeState(){
    if(typeof sb==='undefined'||typeof sharedPayload!=='function') throw new Error('La conexión con Supabase todavía no está lista.');
    const payload=sharedPayload();
    payload.client_saved_at=new Date().toISOString();
    payload.revision=Math.max(Number(payload.revision)||0,Date.now());
    const {data:row,error}=await sb.from('prime_shared_state').upsert({
      id:typeof SHARED_STATE_ID!=='undefined'?SHARED_STATE_ID:'main',
      state:payload,
      updated_at:new Date().toISOString()
    },{onConflict:'id'}).select('updated_at').single();
    if(error)throw error;
    try{lastCloudSync=row?.updated_at||new Date().toISOString();updateCloudStatus?.('online','Supabase conectado','Cambios confirmados en la base');}catch(_){ }
    return row;
  }
  window.commitPrimeState=commitPrimeState;

  // Cada cambio sigue usando el sincronizador normal y además tiene un respaldo
  // directo, debounced, para evitar que una cola previa deje datos sin guardar.
  const baseSave=window.save;
  window.save=function(){
    try{baseSave?.()}catch(error){console.warn('Cola de guardado:',error)}
    clearTimeout(fallbackTimer);
    fallbackTimer=setTimeout(()=>commitPrimeState().catch(error=>console.error('Respaldo de guardado:',error)),550);
  };

  function buttonState(button,state){
    if(!button)return;
    if(!button.dataset.original)button.dataset.original=button.innerHTML;
    button.disabled=state==='saving';
    button.classList.remove('saving','saved','failed');
    button.classList.add(state);
    button.textContent=state==='saving'?'Guardando…':state==='saved'?'Rutina guardada':state==='failed'?'No se guardó':button.dataset.original;
    if(state==='saved'||state==='failed')setTimeout(()=>{button.classList.remove(state);button.innerHTML=button.dataset.original;button.disabled=false},1200);
  }

  function readRoutineForm(){
    const routine=data.routine?.[editingRoutine];
    if(!routine)throw new Error('No se encontró el día de rutina.');
    routine.name=q('#routineName')?.value.trim()||routine.name;
    routine.muscle=q('#routineMuscle')?.value.trim()||routine.muscle;
    routine.mode=q('[data-pro-day-mode].active')?.dataset.proDayMode||routine.mode||'training';
    const time=q('#routineWorkoutTime');if(time)routine.workoutTime=time.value||routine.workoutTime;
    qa('#routineEditor .routine-exercise-editor').forEach((card,index)=>{
      const ex=routine.exercises[index];if(!ex)return;
      const value=f=>card.querySelector(`[data-field="${f}"]`)?.value;
      ex.name=(value('name')||ex.name||'Ejercicio').trim();
      ex.sets=Math.max(1,Number(value('sets'))||1);
      ex.weight=Math.max(0,Number(value('weight'))||0);
      ex.minReps=Math.max(1,Number(value('minReps'))||1);
      ex.maxReps=Math.max(ex.minReps,Number(value('maxReps'))||ex.minReps);
      ex.rest=Math.max(15,Number(value('rest'))||90);
    });
    routine.cardio=Array.isArray(routine.cardio)?routine.cardio:[];
    qa('#cardioEditor .cardio-row').forEach((row,index)=>{
      if(!routine.cardio[index])return;
      const fields=row.querySelectorAll('select,input');
      routine.cardio[index].type=fields[0]?.value||routine.cardio[index].type;
      routine.cardio[index].name=fields[1]?.value||routine.cardio[index].name;
      routine.cardio[index].minutes=Math.max(1,Number(fields[2]?.value)||routine.cardio[index].minutes||1);
    });
  }

  document.addEventListener('click',async event=>{
    const button=event.target.closest('#saveRoutineBtn');
    if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    buttonState(button,'saving');
    try{
      readRoutineForm();
      await commitPrimeState();
      renderRoutine?.();renderHome?.();closeModal?.('routineModal');
      buttonState(button,'saved');
    }catch(error){
      console.error('Guardar rutina:',error);buttonState(button,'failed');
      try{updateCloudStatus?.('error','No se pudo guardar',error.message)}catch(_){ }
    }
  },true);

  const effectiveSets=ex=>(ex?.sets||[]).filter(x=>!x.warmup);
  const doneSets=ex=>effectiveSets(ex).filter(x=>x.done&&Number(x.reps)>0);

  // Check inmediato, verde y sin reconstrucciones múltiples.
  window.toggleSet=function(ei,si){
    const session=getSession?.(),ex=session?.exercises?.[ei],set=ex?.sets?.[si];if(!set)return;
    set.done=!set.done;
    if(set.done&&!Number(set.reps))set.reps=Number(ex.minReps)||1;
    const rows=qa('.smart-set-row');
    const row=rows[si];
    if(row){
      row.classList.toggle('done',set.done);
      const check=row.querySelector('.smart-check');check?.classList.toggle('done',set.done);
      const reps=row.querySelectorAll('input')[1];if(reps&&set.done&&!Number(reps.value))reps.value=set.reps;
    }
    const badge=q('.smart-active-head > strong');if(badge)badge.textContent=`${doneSets(ex).length}/${effectiveSets(ex).length}`;
    window.save();
    if(set.done){try{startMobileRest?.(ex.rest||90)}catch(_){try{startTimer?.(ex.rest||90)}catch(__){}}navigator.vibrate?.(25)}
    setTimeout(()=>renderHome?.(),250);
  };

  function localRecommendation(ex){
    const sets=doneSets(ex);if(!sets.length)return null;
    const min=Number(ex.minReps)||1,max=Number(ex.maxReps)||min;
    const current=Number(sets.at(-1)?.weight||ex.suggestedWeight||0);
    const increment=current<20?1:current<60?2.5:5;
    const below=sets.filter(x=>Number(x.reps)<min).length;
    const maxed=sets.length>=effectiveSets(ex).length&&sets.every(x=>Number(x.reps)>=max);
    if(ex.tag==='Dolor')return{type:'maintain',proposed:current,reason:'Marcaste dolor. Conviene mantener la carga y revisar técnica o molestias antes de progresar.'};
    if(maxed)return{type:'increase',proposed:Math.round((current+increment)*2)/2,reason:`Completaste todas las series alcanzando ${max} repeticiones con la carga actual.`};
    if(below>=Math.ceil(sets.length/2))return{type:'decrease',proposed:Math.max(0,Math.round((current-increment)*2)/2),reason:`La mayoría de las series quedó debajo del mínimo de ${min} repeticiones.`};
    return{type:'maintain',proposed:current,reason:`Cumpliste el rango previsto, pero todavía no consolidaste el máximo de ${max} repeticiones en todas las series.`};
  }

  async function intelligentRecommendation(ex){
    const local=localRecommendation(ex);if(!local)return null;
    try{
      const result=await callSmartHandler({action:'workout_exercise_analysis',context:{exercise:{name:ex.name,min_reps:ex.minReps,max_reps:ex.maxReps,current_weight:Number(ex.suggestedWeight)||0,completed_sets:doneSets(ex).map(s=>({weight:Number(s.weight),reps:Number(s.reps)})),tag:ex.tag||null,note:ex.note||null},instruction:'Recomendá aumentar, mantener o bajar carga para la próxima sesión. Explicá el motivo de forma concreta.'}});
      const ai=result.analysis||{};
      const map={increase:'increase',reduce:'decrease',maintain:'maintain',adjust:local.type,stop:'maintain'};
      const type=map[ai.status]||local.type;
      return{type,proposed:type==='maintain'?(Number(ex.suggestedWeight)||local.proposed):(Number(ai.recommended_next_weight)||local.proposed),reason:ai.reason||ai.message||local.reason};
    }catch(error){console.warn('Recomendación IA local:',error);return local}
  }

  function recommendationModal(session,recs){
    let modal=q('#smartRecommendationModal');
    if(!modal){document.body.insertAdjacentHTML('beforeend','<div class="modal smart-recommendation-modal" id="smartRecommendationModal"><div class="sheet"><div id="smartRecommendationContent"></div></div></div>');modal=q('#smartRecommendationModal')}
    session.pendingRecommendations=recs.map(r=>({...r,choice:null}));
    q('#smartRecommendationContent').innerHTML=`<div class="smart-rec-head"><div class="smart-rec-icon"><svg><use href="#i-spark"></use></svg></div><span>Prime AI</span><h2>Ajustes para la próxima sesión</h2><p>Elegí una decisión para cada ejercicio. Los cambios se guardarán en tu rutina antes de cerrar.</p></div><div class="smart-rec-list">${recs.map(r=>`<article class="smart-rec-item" data-exercise-id="${r.exerciseId}"><div><strong>${r.name}</strong><small>${r.reason}</small></div><div class="smart-rec-weight"><span>${r.current} kg</span><svg><use href="#i-right"></use></svg><strong>${r.proposed} kg</strong></div><div class="smart-rec-buttons">${r.type==='maintain'?`<button data-choice="keep" onclick="chooseRecommendation('${r.exerciseId}','keep')">Mantener</button>`:`<button data-choice="apply" onclick="chooseRecommendation('${r.exerciseId}','apply')">${r.type==='increase'?'Aumentar':'Bajar'} a ${r.proposed} kg</button><button data-choice="keep" onclick="chooseRecommendation('${r.exerciseId}','keep')">Dejar como está</button>`}</div></article>`).join('')}</div><button class="smart-rec-confirm" id="smartRecConfirm" disabled>Confirmar todas las decisiones</button>`;
    q('#smartRecConfirm').onclick=window.applyWorkoutRecommendations;
    modal.classList.add('open');document.body.classList.add('modal-open');
  }

  window.chooseRecommendation=function(id,choice){
    const session=getSession?.();if(!session)return;
    const rec=session.pendingRecommendations?.find(x=>String(x.exerciseId)===String(id));if(!rec)return;
    rec.choice=choice;
    const card=q(`[data-exercise-id="${CSS.escape(String(id))}"]`,q('#smartRecommendationContent'));
    qa('[data-choice]',card).forEach(b=>b.classList.toggle('selected',b.dataset.choice===choice));
    q('#smartRecConfirm').disabled=session.pendingRecommendations.some(x=>!x.choice);
  };

  window.applyWorkoutRecommendations=async function(){
    const session=getSession?.();if(!session||session.pendingRecommendations?.some(x=>!x.choice))return;
    const button=q('#smartRecConfirm');if(button){button.disabled=true;button.textContent='Guardando ajustes…'}
    try{
      const routine=data.routine.find(r=>r.day===session.routineDay);
      session.pendingRecommendations.forEach(rec=>{
        const sessionEx=session.exercises.find(x=>String(x.id)===String(rec.exerciseId));
        const routineEx=routine?.exercises?.find(x=>String(x.id)===String(rec.exerciseId));
        const chosen=rec.choice==='apply'?Number(rec.proposed):Number(rec.current);
        if(sessionEx){sessionEx.nextWeight=chosen;sessionEx.recommendation=rec.type;sessionEx.recommendationWhy=rec.reason}
        if(routineEx)routineEx.weight=chosen;
      });
      session.status=session._finishStatus||'completed';session.completedAt=new Date().toISOString();session.activeStepToken=null;
      delete session._finishStatus;delete session.pendingRecommendations;
      await commitPrimeState();
      q('#smartRecommendationModal')?.classList.remove('open');document.body.classList.remove('modal-open');
      renderAll?.();showPage?.('homePage');window.scrollTo({top:0,behavior:'instant'});
    }catch(error){console.error('Cerrar entrenamiento:',error);if(button){button.disabled=false;button.textContent='Reintentar guardado'}alert('No se pudo guardar el entrenamiento. Revisá la conexión e intentá nuevamente.')}
  };

  async function finishWorkoutFixed(){
    const session=getSession?.();if(!session)return;
    const total=session.exercises.reduce((n,e)=>n+effectiveSets(e).length,0);
    const done=session.exercises.reduce((n,e)=>n+doneSets(e).length,0);
    const cardioTotal=(session.cardio||[]).length,cardioDone=(session.cardio||[]).filter(c=>c.done).length;
    const complete=done===total&&cardioDone===cardioTotal;
    if(!complete&&!confirm(`Completaste ${done}/${total} series y ${cardioDone}/${cardioTotal} pasos de cardio. ¿Finalizar como parcial?`))return;
    const button=q('#finishWorkoutBtn');if(button){button.disabled=true;button.textContent='Prime AI está analizando…'}
    try{
      const eligible=session.exercises.filter(ex=>doneSets(ex).length);
      const analyses=await Promise.all(eligible.map(async ex=>({ex,rec:await intelligentRecommendation(ex)})));
      const recs=analyses.filter(x=>x.rec).map(({ex,rec})=>({exerciseId:ex.id,name:ex.name,current:Number(ex.suggestedWeight)||Number(doneSets(ex).at(-1)?.weight)||0,...rec}));
      session._finishStatus=complete?'completed':'partial';
      recommendationModal(session,recs);
    }finally{if(button){button.disabled=false;button.innerHTML='<svg><use href="#i-check"></use></svg>Finalizar entrenamiento'}}
  }

  const baseRenderWorkout=window.renderWorkout;
  window.renderWorkout=function(){baseRenderWorkout?.();const finish=q('#finishWorkoutBtn');if(finish)finish.onclick=finishWorkoutFixed};
  if(getSession?.())window.renderWorkout();

  const css=document.createElement('style');css.textContent=`
    .smart-set-row.done{border-color:rgba(54,255,139,.4)!important;background:rgba(30,190,105,.12)!important}
    .smart-set-row.done .smart-set-number{color:#53f59a!important}
    .smart-check.done{background:#28d982!important;border-color:#53f59a!important;color:#07120c!important;box-shadow:0 0 0 4px rgba(40,217,130,.12)!important}
    .smart-check.done svg{stroke-width:3!important}
    .smart-rec-item small{display:block;margin-top:7px;line-height:1.5;color:#aab5c3}
    .smart-rec-buttons button.selected{border-color:#28d9ee!important;background:linear-gradient(135deg,rgba(110,96,255,.45),rgba(0,205,230,.3))!important;color:#fff!important}
  `;document.head.appendChild(css);
})();
