(() => {
  "use strict";
  let activeExerciseIndex=0;
  const analysisTimers=new Map();
  const analysisRequests=new Map();

  function currentSession(){return getSession()}
  function effectiveSets(ex){return (ex?.sets||[]).filter(x=>!x.warmup)}
  function doneSets(ex){return effectiveSets(ex).filter(x=>x.done&&Number(x.reps)>0)}
  function ensureIndex(s){
    if(!s?.exercises?.length){activeExerciseIndex=0;return}
    activeExerciseIndex=Math.max(0,Math.min(activeExerciseIndex,s.exercises.length-1));
    const firstPending=s.exercises.findIndex(e=>!e.skipped&&doneSets(e).length<effectiveSets(e).length);
    if(firstPending>=0 && !s._aiOpened){activeExerciseIndex=firstPending;s._aiOpened=true}
  }
  function localExerciseAnalysis(ex){
    const sets=doneSets(ex), total=effectiveSets(ex).length;
    if(!sets.length)return{status:"ready",headline:"Preparado para empezar",message:`Objetivo: ${ex.targetSets} series de ${ex.minReps}-${ex.maxReps} repeticiones.`,action:`Usá ${ex.suggestedWeight} kg como referencia.`};
    const below=sets.filter(x=>Number(x.reps)<Number(ex.minReps)).length;
    const atTop=sets.filter(x=>Number(x.reps)>=Number(ex.maxReps)).length;
    const last=sets.at(-1), current=Number(last?.weight||ex.suggestedWeight||0);
    if(ex.tag==="Dolor")return{status:"warning",headline:"No fuerces este ejercicio",message:"Marcaste dolor. La prioridad es detener o reemplazar el movimiento, no completar el volumen.",action:"Evitá aumentar la carga."};
    if(below>=Math.ceil(sets.length/2))return{status:"reduce",headline:"La carga parece alta",message:`${below} de ${sets.length} series quedaron debajo de ${ex.minReps} repeticiones.`,action:`Probá bajar a ${Math.max(0,current-(current<20?1:current<60?2.5:5))} kg.`};
    if(sets.length>=total&&atTop===sets.length)return{status:"increase",headline:"Objetivo dominado",message:`Completaste todas las series en el máximo del rango.`,action:`La próxima sesión podés subir la carga.`};
    if(Number(last?.reps)<Number(ex.minReps))return{status:"adjust",headline:"Ajustá la próxima serie",message:`La última serie quedó en ${last.reps} reps, debajo del mínimo de ${ex.minReps}.`,action:"Bajá un poco el peso o descansá más."};
    return{status:"maintain",headline:"Rendimiento correcto",message:`Llevás ${sets.length}/${total} series dentro de un rendimiento razonable.`,action:"Mantené la carga y priorizá técnica."};
  }
  function aiMarkup(ex){
    const a=ex.liveAI||localExerciseAnalysis(ex),thinking=ex.aiThinking;
    return `<div class="ai-coach-card ${thinking?"thinking":""}">
      <div class="ai-coach-icon"><svg><use href="#i-spark"/></svg></div>
      <div class="ai-coach-copy"><div class="ai-coach-status">${thinking?"Prime AI analizando":"Análisis en vivo"}</div><div class="ai-coach-title">${thinking?"Evaluando tu rendimiento...":a.headline}</div><div class="ai-coach-text">${thinking?"Comparando repeticiones, carga, series previas e historial del ejercicio.":a.message}</div>${!thinking&&a.action?`<div class="ai-coach-action">${a.action}</div>`:""}</div>
    </div>`
  }
  function buildExerciseContext(s,ex){
    const history=data.sessions.filter(x=>x.date<s.date&&["completed","partial"].includes(x.status)).slice(-8).map(x=>{
      const found=(x.exercises||[]).find(y=>y.id===ex.id);return found?{date:x.date,sets:doneSets(found).map(z=>({weight:Number(z.weight)||0,reps:Number(z.reps)||0})),recommendation:found.recommendation,nextWeight:found.nextWeight}:null
    }).filter(Boolean);
    return {session:{date:s.date,title:s.title,muscle:s.muscle,completed_exercises:s.exercises.filter(e=>doneSets(e).length>=effectiveSets(e).length).length,total_exercises:s.exercises.length},exercise:{id:ex.id,name:ex.name,target_sets:ex.targetSets,min_reps:ex.minReps,max_reps:ex.maxReps,suggested_weight:ex.suggestedWeight,tag:ex.tag||null,note:ex.note||null,sets:(ex.sets||[]).map(x=>({set:x.set,warmup:!!x.warmup,weight:Number(x.weight)||0,reps:Number(x.reps)||0,done:!!x.done}))},history};
  }
  async function analyzeExercise(ei,immediate=false){
    const s=currentSession(),ex=s?.exercises?.[ei];if(!ex)return;
    clearTimeout(analysisTimers.get(ex.id));
    const run=async()=>{
      const token=(analysisRequests.get(ex.id)||0)+1;analysisRequests.set(ex.id,token);ex.aiThinking=true;renderWorkout();
      try{
        const result=await callSmartHandler({action:"workout_exercise_analysis",context:buildExerciseContext(s,ex)});
        if(analysisRequests.get(ex.id)!==token)return;
        const a=result.analysis||{};
        ex.liveAI={status:a.status||"maintain",headline:a.headline||"Análisis actualizado",message:a.message||a.reason||"La sesión continúa según lo previsto.",action:a.immediate_action||a.next_set_instruction||null,recommended_next_weight:Number(a.recommended_next_weight)||Number(ex.suggestedWeight)||0,confidence:Number(a.confidence_percent)||70};
        ex.recommendation=({increase:"Subir",reduce:"Bajar",maintain:"Mantener",adjust:"Revisar",stop:"Detener"})[a.status]||"Mantener";
        ex.nextWeight=Number(a.recommended_next_weight)||Number(ex.suggestedWeight)||0;
        ex.recommendationWhy=a.reason||a.message||ex.liveAI.message;
      }catch(err){
        ex.liveAI=localExerciseAnalysis(ex);
        console.warn("Análisis de entrenamiento no disponible",err);
      }finally{ex.aiThinking=false;save();renderWorkout();renderHome();}
    };
    if(immediate)run();else analysisTimers.set(ex.id,setTimeout(run,700));
  }
  function sessionStats(s){
    const all=s.exercises.flatMap(e=>doneSets(e));
    return{sets:all.length,volume:all.reduce((a,x)=>a+(Number(x.weight)||0)*(Number(x.reps)||0),0),doneExercises:s.exercises.filter(e=>e.skipped||doneSets(e).length>=effectiveSets(e).length).length};
  }

  window.selectWorkoutExercise=i=>{activeExerciseIndex=Number(i)||0;renderWorkout();setTimeout(()=>document.querySelector('.ai-exercise-tab.active')?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'}),30)};
  window.navigateWorkoutExercise=step=>{const s=currentSession();if(!s)return;activeExerciseIndex=Math.max(0,Math.min(s.exercises.length-1,activeExerciseIndex+Number(step)));renderWorkout()};
  window.setExerciseFlag=(i,flag)=>{const ex=currentSession()?.exercises?.[i];if(!ex)return;ex.tag=ex.tag===flag?"":flag;save();analyzeExercise(i);renderWorkout()};
  window.skipActiveExercise=i=>{const ex=currentSession()?.exercises?.[i];if(!ex)return;ex.skipped=!ex.skipped;save();renderWorkout()};

  renderWorkout=function(){
    const s=currentSession();if(!s)return;ensureIndex(s);
    const stats=sessionStats(s),allSets=s.exercises.reduce((a,e)=>a+effectiveSets(e).length,0),pct=Math.round(stats.sets/Math.max(1,allSets)*100),ex=s.exercises[activeExerciseIndex];
    document.getElementById("focusTitle").textContent=s.muscle;
    document.getElementById("focusProgress").textContent=`${stats.sets}/${allSets} series · ${pct}%`;
    const tabs=s.exercises.map((e,i)=>{const done=e.skipped||doneSets(e).length>=effectiveSets(e).length;return `<button class="ai-exercise-tab ${i===activeExerciseIndex?"active":""} ${done?"done":""}" onclick="selectWorkoutExercise(${i})">${i===activeExerciseIndex?e.name.split(/\s+/)[0]:i+1}<span class="tab-dot"></span></button>`}).join("");
    const setRows=(ex.sets||[]).map((x,j)=>`<div class="ai-set-row ${x.done?"done":""} ${!x.done&&j===(ex.sets||[]).findIndex(q=>!q.done)?"active-set":""}"><div class="ai-set-index">${x.warmup?"C":x.set}</div><label class="ai-number"><span>kg</span><input inputmode="decimal" type="number" step=".5" value="${x.weight}" onchange="updateSet(${activeExerciseIndex},${j},'weight',this.value)"></label><label class="ai-number"><span>reps</span><input inputmode="numeric" type="number" value="${x.reps}" onchange="updateSet(${activeExerciseIndex},${j},'reps',this.value)"></label><button class="ai-set-check ${x.done?"done":""}" onclick="toggleSet(${activeExerciseIndex},${j})"><svg><use href="#i-check"/></svg></button></div>`).join("");
    const html=`<div class="ai-workout-shell"><section class="ai-session-overview"><div class="ai-session-row"><div><div class="ai-session-label">Sesión inteligente</div><div class="ai-session-title">${s.title} · ${s.muscle}</div></div><span class="badge badge-purple">${pct}%</span></div><div class="ai-session-stats"><span class="ai-session-stat"><strong>${stats.sets}</strong>series</span><span class="ai-session-stat"><strong>${fmt(stats.volume)}</strong>kg volumen</span><span class="ai-session-stat"><strong>${stats.doneExercises}/${s.exercises.length}</strong>ejercicios</span></div><div class="ai-progress-track"><i style="width:${pct}%"></i></div></section><div class="ai-exercise-strip">${tabs}</div><article class="ai-main-card"><div class="ai-ex-head"><div><div class="ai-ex-kicker">Ejercicio ${activeExerciseIndex+1} de ${s.exercises.length}</div><div class="ai-ex-name">${ex.name}</div><div class="ai-ex-target">${ex.targetSets} series · ${ex.minReps}-${ex.maxReps} reps · referencia ${ex.suggestedWeight} kg</div></div><div class="ai-ex-counter">${doneSets(ex).length}/${effectiveSets(ex).length}</div></div>${aiMarkup(ex)}<div class="ai-set-list">${setRows}</div><div class="ai-quick-actions"><button class="ai-quick" onclick="addWarmup(${activeExerciseIndex})">+ Calentamiento</button><button class="ai-quick" onclick="addSet(${activeExerciseIndex})">+ Serie</button><button class="ai-quick ${ex.tag==='Me costó'?'active':''}" onclick="setExerciseFlag(${activeExerciseIndex},'Me costó')">Me costó</button><button class="ai-quick ${ex.tag==='Dolor'?'active':''}" onclick="setExerciseFlag(${activeExerciseIndex},'Dolor')">Dolor</button><button class="ai-quick ${ex.skipped?'active':''}" onclick="skipActiveExercise(${activeExerciseIndex})">${ex.skipped?'Reactivar':'Saltar'}</button></div><textarea class="field mobile-workout-note" placeholder="Nota opcional para que la IA tenga más contexto..." onchange="updateNote(${activeExerciseIndex},this.value);analyzeExercise(${activeExerciseIndex})">${ex.note||""}</textarea><div class="ai-bottom-nav"><button class="btn btn-soft" onclick="navigateWorkoutExercise(-1)" ${activeExerciseIndex===0?'disabled':''}><svg><use href="#i-left"/></svg></button><button class="ai-next-primary" onclick="navigateWorkoutExercise(1)" ${activeExerciseIndex===s.exercises.length-1?'disabled':''}>Siguiente ejercicio</button><button class="btn btn-soft" onclick="navigateWorkoutExercise(1)" ${activeExerciseIndex===s.exercises.length-1?'disabled':''}><svg><use href="#i-right"/></svg></button></div></article>${s.sessionAI?`<div class="ai-summary-panel"><strong>Lectura de la sesión</strong><p>${s.sessionAI}</p></div>`:""}</div>`;
    document.getElementById("workoutExercises").innerHTML=html;
    const finish=document.getElementById("finishWorkoutBtn");finish.parentElement?.classList.add("ai-session-finish");
  };

  const oldUpdateSet=window.updateSet;
  window.updateSet=(ei,si,f,v)=>{oldUpdateSet(ei,si,f,v);const ex=currentSession()?.exercises?.[ei];if(ex&&ex.sets?.[si]?.done)analyzeExercise(ei);};
  window.toggleSet=(ei,si)=>{
    const s=currentSession(),ex=s?.exercises?.[ei],set=ex?.sets?.[si];if(!set)return;
    set.done=!set.done;if(set.done&&!Number(set.reps))set.reps=ex.minReps;
    save();if(set.done){startTimer(ex.rest||90);navigator.vibrate?.(35);analyzeExercise(ei)}else{analyzeExercise(ei)}
    renderWorkout();renderHome();
  };
  window.addSet=ei=>{const ex=currentSession()?.exercises?.[ei];if(!ex)return;const last=ex.sets.at(-1);ex.sets.push({set:effectiveSets(ex).length+1,weight:last?.weight??ex.suggestedWeight,reps:"",done:false,warmup:false,failed:false});save();renderWorkout()};
  window.addWarmup=ei=>{const ex=currentSession()?.exercises?.[ei];if(!ex)return;ex.sets.unshift({set:0,weight:Math.round((Number(ex.suggestedWeight)||0)*.5*2)/2,reps:"",done:false,warmup:true,failed:false});save();renderWorkout()};

  async function finishAIWorkout(){
    const s=currentSession();if(!s)return;
    const total=s.exercises.reduce((a,e)=>a+effectiveSets(e).filter(()=>!e.skipped).length,0),done=s.exercises.reduce((a,e)=>a+doneSets(e).length,0);
    if(done<total&&!confirm(`Completaste ${done} de ${total} series. ¿Finalizar como entrenamiento parcial?`))return;
    const btn=document.getElementById("finishWorkoutBtn");btn.disabled=true;btn.innerHTML='<svg><use href="#i-spark"/></svg> Analizando sesión...';
    for(let i=0;i<s.exercises.length;i++){const ex=s.exercises[i];if(doneSets(ex).length){const local=localExerciseAnalysis(ex);if(!ex.liveAI)ex.liveAI=local;ex.recommendation=({increase:"Subir",reduce:"Bajar",maintain:"Mantener",adjust:"Revisar",stop:"Detener"})[ex.liveAI.status]||recommendation(ex).label;ex.nextWeight=Number(ex.liveAI.recommended_next_weight)||recommendation(ex).next;ex.recommendationWhy=ex.liveAI.message||recommendation(ex).why;}}
    try{const result=await callSmartHandler({action:"workout_session_analysis",context:{session:{title:s.title,muscle:s.muscle,date:s.date,exercises:s.exercises.map(e=>({name:e.name,target:`${e.targetSets}x${e.minReps}-${e.maxReps}`,sets:doneSets(e).map(x=>({weight:Number(x.weight),reps:Number(x.reps)})),tag:e.tag||null,recommendation:e.recommendation,next_weight:e.nextWeight}))},history:data.sessions.filter(x=>x.date<s.date).slice(-6).map(x=>({date:x.date,status:x.status,volume:volume(x)}))}});s.sessionAI=result.analysis?.summary||result.summary||"Sesión analizada y recomendaciones actualizadas.";}catch(err){s.sessionAI="La sesión se guardó correctamente. Las recomendaciones se calcularon con tus series registradas."}
    s.status=done===total?"completed":"partial";s.completedAt=new Date().toISOString();save();renderAll();showPage("homePage");
  }
  const finishBtn=document.getElementById("finishWorkoutBtn");if(finishBtn)finishBtn.onclick=finishAIWorkout;
  if(currentSession())renderWorkout();
})();
