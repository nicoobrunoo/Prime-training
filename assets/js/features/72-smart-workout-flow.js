(()=>{
  "use strict";

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const currentSession=()=>getSession();
  const effectiveSets=ex=>(ex?.sets||[]).filter(x=>!x.warmup);
  const doneSets=ex=>effectiveSets(ex).filter(x=>x.done&&Number(x.reps)>0);
  const tokenForExercise=ex=>`exercise:${ex.id}`;
  const tokenForCardio=c=>`cardio:${c.id}`;

  function ensureFlow(session){
    if(!session)return;
    session.cardio=Array.isArray(session.cardio)?session.cardio:[];
    session.workoutOrder=Array.isArray(session.workoutOrder)?session.workoutOrder:[];
    const valid=[...(session.exercises||[]).map(tokenForExercise),...(session.cardio||[]).map(tokenForCardio)];
    session.workoutOrder=session.workoutOrder.filter(x=>valid.includes(x));
    valid.forEach(x=>{if(!session.workoutOrder.includes(x))session.workoutOrder.push(x)});
    if(session.activeStepToken&&!valid.includes(session.activeStepToken))session.activeStepToken=null;
  }

  function stepInfo(session,token){
    const [kind,id]=String(token||"").split(":");
    if(kind==="exercise"){
      const index=(session.exercises||[]).findIndex(x=>String(x.id)===id);
      const item=session.exercises[index];
      return item?{kind,index,item,token,done:item.skipped||doneSets(item).length>=effectiveSets(item).length}:null;
    }
    if(kind==="cardio"){
      const index=(session.cardio||[]).findIndex(x=>String(x.id)===id);
      const item=session.cardio[index];
      return item?{kind,index,item,token,done:!!item.done}:null;
    }
    return null;
  }

  function allSteps(session){ensureFlow(session);return session.workoutOrder.map(t=>stepInfo(session,t)).filter(Boolean)}
  function completedCount(session){return allSteps(session).filter(x=>x.done).length}

  function chooseStep(token){
    const s=currentSession();if(!s)return;
    ensureFlow(s);s.activeStepToken=token;save();renderWorkout();
  }
  window.chooseWorkoutStep=chooseStep;
  window.backToWorkoutChooser=()=>{const s=currentSession();if(!s)return;s.activeStepToken=null;save();renderWorkout()};

  function chooserMarkup(session){
    const steps=allSteps(session),done=completedCount(session),pct=Math.round(done/Math.max(1,steps.length)*100);
    return `<div class="smart-workout-shell">
      <section class="smart-session-hero">
        <div><span class="smart-kicker">Entrenamiento en curso</span><h2>${session.title}</h2><p>${session.muscle}</p></div>
        <div class="smart-progress-badge"><strong>${done}/${steps.length}</strong><span>pasos</span></div>
      </section>
      <div class="smart-progress"><i style="width:${pct}%"></i></div>
      <section class="smart-picker-card">
        <div class="smart-picker-head"><div><span>Elegí cómo continuar</span><h3>¿Qué querés hacer ahora?</h3></div><small>Podés cambiar el orden libremente</small></div>
        <div class="smart-step-grid">${steps.map((step,position)=>{
          if(step.kind==="exercise"){
            const ex=step.item,sets=doneSets(ex).length,total=effectiveSets(ex).length;
            return `<button class="smart-step ${step.done?'done':''}" onclick="chooseWorkoutStep('${step.token}')">
              <span class="smart-step-index">${step.done?'✓':position+1}</span>
              <span class="smart-step-copy"><strong>${ex.name}</strong><small>${sets}/${total} series · ${ex.minReps}-${ex.maxReps} reps</small></span>
              <svg><use href="#i-right"></use></svg>
            </button>`;
          }
          const c=step.item;
          return `<button class="smart-step cardio ${step.done?'done':''}" onclick="chooseWorkoutStep('${step.token}')">
            <span class="smart-step-index">${step.done?'✓':'♥'}</span>
            <span class="smart-step-copy"><strong>${c.name||c.type||'Cardio'}</strong><small>${c.type||'Cardio'} · ${c.minutes||0} min</small></span>
            <svg><use href="#i-right"></use></svg>
          </button>`;
        }).join('')}</div>
      </section>
    </div>`;
  }

  function exerciseMarkup(session,step){
    const ex=step.item,done=doneSets(ex).length,total=effectiveSets(ex).length;
    const rows=(ex.sets||[]).map((set,si)=>`<div class="smart-set-row ${set.done?'done':''}">
      <span class="smart-set-number">${set.warmup?'C':set.set}</span>
      <label><small>kg</small><input inputmode="decimal" type="number" step=".5" value="${set.weight}" onchange="updateSet(${step.index},${si},'weight',this.value)"></label>
      <label><small>reps</small><input inputmode="numeric" type="number" value="${set.reps}" onchange="updateSet(${step.index},${si},'reps',this.value)"></label>
      <button class="smart-check ${set.done?'done':''}" onclick="toggleSet(${step.index},${si})"><svg><use href="#i-check"></use></svg></button>
    </div>`).join('');
    return `<div class="smart-workout-shell">
      <button class="smart-back" onclick="backToWorkoutChooser()"><svg><use href="#i-left"></use></svg> Todos los ejercicios</button>
      <article class="smart-active-card">
        <div class="smart-active-head"><div><span>Ejercicio</span><h2>${ex.name}</h2><p>${ex.targetSets} series · ${ex.minReps}-${ex.maxReps} reps · ${ex.suggestedWeight} kg de referencia</p></div><strong>${done}/${total}</strong></div>
        <div class="smart-set-list">${rows}</div>
        <div class="smart-actions"><button onclick="addWarmup(${step.index})">+ Calentamiento</button><button onclick="addSet(${step.index})">+ Serie</button><button class="${ex.tag==='Me costó'?'active':''}" onclick="setExerciseFlag(${step.index},'Me costó')">Me costó</button><button class="${ex.tag==='Dolor'?'active danger':''}" onclick="setExerciseFlag(${step.index},'Dolor')">Dolor</button></div>
        <textarea class="field smart-note" placeholder="Nota opcional para Prime AI..." onchange="updateNote(${step.index},this.value)">${ex.note||''}</textarea>
        <button class="smart-return" onclick="backToWorkoutChooser()">Guardar y elegir otro paso</button>
      </article>
    </div>`;
  }

  function cardioMarkup(session,step){
    const c=step.item;
    return `<div class="smart-workout-shell">
      <button class="smart-back" onclick="backToWorkoutChooser()"><svg><use href="#i-left"></use></svg> Todos los ejercicios</button>
      <article class="smart-active-card cardio-card">
        <div class="smart-cardio-icon"><svg><use href="#i-cardio"></use></svg></div>
        <span class="smart-kicker">Cardio / funcional</span><h2>${c.name||c.type||'Cardio'}</h2><p>${c.type||'Actividad cardiovascular'}</p>
        <label class="smart-cardio-minutes"><small>Minutos realizados</small><input id="smartCardioMinutes" inputmode="numeric" type="number" min="0" value="${c.completedMinutes||c.minutes||''}"><span>min</span></label>
        <textarea class="field smart-note" id="smartCardioNote" placeholder="Sensaciones, intensidad o comentario...">${c.note||''}</textarea>
        <button class="smart-cardio-complete ${c.done?'done':''}" onclick="completeCardioStep(${step.index})"><svg><use href="#i-check"></use></svg>${c.done?'Cardio completado':'Completar cardio'}</button>
      </article>
    </div>`;
  }

  window.completeCardioStep=index=>{
    const s=currentSession(),c=s?.cardio?.[index];if(!c)return;
    c.completedMinutes=Math.max(0,Number(q('#smartCardioMinutes')?.value)||Number(c.minutes)||0);
    c.note=q('#smartCardioNote')?.value||'';c.done=true;c.completedAt=new Date().toISOString();
    s.activeStepToken=null;save();navigator.vibrate?.(35);renderWorkout();renderHome();
  };

  const previousRender=window.renderWorkout;
  window.renderWorkout=function(){
    const s=currentSession();if(!s){previousRender?.();return}
    ensureFlow(s);
    const root=q('#workoutExercises');if(!root)return;
    const step=s.activeStepToken?stepInfo(s,s.activeStepToken):null;
    root.innerHTML=!step?chooserMarkup(s):step.kind==='exercise'?exerciseMarkup(s,step):cardioMarkup(s,step);
    const finish=q('#finishWorkoutBtn');if(finish){finish.disabled=false;finish.innerHTML='<svg><use href="#i-check"></use></svg>Finalizar entrenamiento';finish.onclick=finishSmartWorkout}
  };

  function calculateRecommendation(ex){
    const sets=doneSets(ex);if(!sets.length)return null;
    const min=Number(ex.minReps)||1,max=Number(ex.maxReps)||min;
    const current=Number(sets.at(-1)?.weight||ex.suggestedWeight||0);
    const increment=current<20?1:current<60?2.5:5;
    const below=sets.filter(x=>Number(x.reps)<min).length;
    const maxed=sets.length>=effectiveSets(ex).length&&sets.every(x=>Number(x.reps)>=max);
    if(ex.tag==='Dolor')return{type:'keep',label:'Mantener',proposed:current,reason:'Marcaste dolor. No corresponde subir la carga hasta revisar el ejercicio.'};
    if(maxed)return{type:'increase',label:'Aumentar',proposed:Math.round((current+increment)*2)/2,reason:`Completaste todas las series en ${max} repeticiones.`};
    if(below>=Math.ceil(sets.length/2))return{type:'decrease',label:'Bajar',proposed:Math.max(0,Math.round((current-increment)*2)/2),reason:`Varias series quedaron debajo del mínimo de ${min} repeticiones.`};
    return{type:'keep',label:'Mantener',proposed:current,reason:'El rendimiento quedó dentro de un rango adecuado.'};
  }

  function recommendations(session){return (session.exercises||[]).map((ex,index)=>({ex,index,rec:calculateRecommendation(ex)})).filter(x=>x.rec)}

  function showRecommendationModal(session){
    let modal=q('#smartRecommendationModal');
    if(!modal){
      document.body.insertAdjacentHTML('beforeend',`<div class="modal smart-recommendation-modal" id="smartRecommendationModal"><div class="sheet"><div id="smartRecommendationContent"></div></div></div>`);
      modal=q('#smartRecommendationModal');
    }
    const items=recommendations(session);session.pendingRecommendations=items.map(x=>({exerciseId:x.ex.id,choice:null,...x.rec}));
    q('#smartRecommendationContent').innerHTML=`<div class="smart-rec-head"><div class="smart-rec-icon"><svg><use href="#i-spark"></use></svg></div><span>Prime AI</span><h2>Ajustes para la próxima sesión</h2><p>Revisá cada recomendación. Para cerrar el entrenamiento tenés que decidir en todas.</p></div>
      <div class="smart-rec-list">${items.map(({ex,rec})=>`<article class="smart-rec-item" data-exercise-id="${ex.id}"><div><strong>${ex.name}</strong><small>${rec.reason}</small></div><div class="smart-rec-weight"><span>${ex.suggestedWeight} kg</span><svg><use href="#i-right"></use></svg><strong>${rec.proposed} kg</strong></div><div class="smart-rec-buttons"><button data-choice="apply" onclick="chooseRecommendation('${ex.id}','apply')">${rec.type==='increase'?'Aumentar':rec.type==='decrease'?'Bajar':'Mantener'}</button><button data-choice="keep" onclick="chooseRecommendation('${ex.id}','keep')">Dejar como está</button></div></article>`).join('')}</div>
      <button class="smart-rec-confirm" id="smartRecConfirm" disabled onclick="applyWorkoutRecommendations()">Confirmar todas las decisiones</button>`;
    modal.classList.add('open');document.body.classList.add('modal-open');
  }

  window.chooseRecommendation=(exerciseId,choice)=>{
    const s=currentSession();if(!s)return;
    const rec=(s.pendingRecommendations||[]).find(x=>String(x.exerciseId)===String(exerciseId));if(!rec)return;rec.choice=choice;
    const card=q(`[data-exercise-id="${CSS.escape(String(exerciseId))}"]`,q('#smartRecommendationContent'));
    qa('[data-choice]',card).forEach(b=>b.classList.toggle('selected',b.dataset.choice===choice));
    q('#smartRecConfirm').disabled=(s.pendingRecommendations||[]).some(x=>!x.choice);
  };

  window.applyWorkoutRecommendations=async()=>{
    const s=currentSession();if(!s||!(s.pendingRecommendations||[]).length)return;
    if(s.pendingRecommendations.some(x=>!x.choice))return;
    const routine=data.routine.find(r=>r.day===s.routineDay);
    s.pendingRecommendations.forEach(r=>{
      const ex=s.exercises.find(x=>String(x.id)===String(r.exerciseId));
      const routineEx=routine?.exercises?.find(x=>String(x.id)===String(r.exerciseId));
      const chosen=r.choice==='apply'?Number(r.proposed):Number(ex?.suggestedWeight||routineEx?.weight||0);
      if(ex){ex.nextWeight=chosen;ex.recommendation=r.choice==='apply'?r.label:'Mantener';ex.recommendationWhy=r.reason;}
      if(routineEx)routineEx.weight=chosen;
    });
    s.status=s._finishStatus;s.completedAt=new Date().toISOString();s.activeStepToken=null;delete s._finishStatus;delete s.pendingRecommendations;
    save();try{await syncAllToCloud(false)}catch(e){console.error('No se pudo confirmar el cierre:',e)}
    q('#smartRecommendationModal')?.classList.remove('open');document.body.classList.remove('modal-open');renderAll();showPage('homePage');
  };

  async function finishSmartWorkout(){
    const s=currentSession();if(!s)return;
    ensureFlow(s);
    const exerciseTotal=s.exercises.reduce((a,e)=>a+effectiveSets(e).filter(()=>!e.skipped).length,0);
    const exerciseDone=s.exercises.reduce((a,e)=>a+doneSets(e).length,0);
    const cardioTotal=s.cardio.length,cardioDone=s.cardio.filter(x=>x.done).length;
    const complete=exerciseDone===exerciseTotal&&cardioDone===cardioTotal;
    if(!complete&&!confirm(`Completaste ${exerciseDone}/${exerciseTotal} series y ${cardioDone}/${cardioTotal} pasos de cardio. ¿Finalizar como parcial?`))return;
    const btn=q('#finishWorkoutBtn');if(btn){btn.disabled=true;btn.innerHTML='<svg><use href="#i-spark"></use></svg>Analizando...'}
    try{
      const result=await callSmartHandler({action:'workout_session_analysis',context:{session:{title:s.title,muscle:s.muscle,date:s.date,exercises:s.exercises.map(e=>({name:e.name,target:`${e.targetSets}x${e.minReps}-${e.maxReps}`,sets:doneSets(e).map(x=>({weight:Number(x.weight),reps:Number(x.reps)})),tag:e.tag||null})),cardio:s.cardio.map(c=>({name:c.name,type:c.type,minutes:c.completedMinutes||c.minutes,done:c.done}))},history:data.sessions.filter(x=>x.date<s.date).slice(-6).map(x=>({date:x.date,status:x.status,volume:volume(x)}))}});
      s.sessionAI=result.analysis?.summary||result.summary||'Sesión analizada.';
    }catch(e){s.sessionAI='La sesión fue analizada con tus resultados registrados.'}
    s._finishStatus=complete?'completed':'partial';save();showRecommendationModal(s);
    if(btn){btn.disabled=false;btn.innerHTML='<svg><use href="#i-check"></use></svg>Finalizar entrenamiento'}
  }
  window.finishSmartWorkout=finishSmartWorkout;

  // Inicio más directo: saludo arriba y entrenamiento inmediatamente debajo.
  document.body.classList.add('prime-smart-workout-v42');
  if(currentSession())renderWorkout();
})();
