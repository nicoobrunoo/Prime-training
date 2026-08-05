(()=>{
  "use strict";

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const clone=v=>typeof structuredClone==="function"?structuredClone(v):JSON.parse(JSON.stringify(v));
  const effectiveSets=ex=>(ex?.sets||[]).filter(set=>!set.warmup);
  const completedSets=ex=>effectiveSets(ex).filter(set=>set.done&&Number(set.reps)>0);
  const roundHalf=n=>Math.round(Number(n||0)*2)/2;
  const formatNumber=n=>new Intl.NumberFormat("es-AR",{maximumFractionDigits:1}).format(Number(n)||0);

  // ------------------------------------------------------------
  // 1) El descanso vive exclusivamente dentro del entrenamiento.
  // ------------------------------------------------------------
  function dismissRestTimer(){
    try{window.closeMobileTimer?.()}catch(_){ }
    q('#mobileRestTimer')?.classList.remove('show');
    q('#timer')?.classList.remove('show');
  }
  const baseShowPage=window.showPage;
  window.showPage=function(id){
    if(id!=="workoutPage")dismissRestTimer();
    return baseShowPage?.(id);
  };
  document.querySelectorAll('.nav').forEach(nav=>{
    nav.addEventListener('click',()=>{if(nav.dataset.page!=="workoutPage")dismissRestTimer()},{capture:true});
  });

  // ----------------------------------------------------------------
  // 2) Check optimista: verde instantáneo, sin esperar un re-render.
  // ----------------------------------------------------------------
  function locateSmartSet(button){
    const session=getSession?.();
    if(!session)return null;
    const token=String(session.activeStepToken||'');
    if(!token.startsWith('exercise:'))return null;
    const exerciseId=token.slice('exercise:'.length);
    const exerciseIndex=(session.exercises||[]).findIndex(ex=>String(ex.id)===exerciseId);
    const exercise=session.exercises?.[exerciseIndex];
    const row=button.closest('.smart-set-row');
    const rows=qa('.smart-set-row',row?.parentElement||document);
    const setIndex=rows.indexOf(row);
    if(!exercise||setIndex<0||!exercise.sets?.[setIndex])return null;
    return{session,exercise,exerciseIndex,set:exercise.sets[setIndex],setIndex,row};
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('.smart-check');
    if(!button)return;
    const found=locateSmartSet(button);
    if(!found)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const {exercise,set,row}=found;
    set.done=!set.done;
    if(set.done&&!Number(set.reps))set.reps=Number(exercise.minReps)||1;
    const reps=row.querySelector('label:nth-of-type(2) input');
    if(reps&&set.done&&!Number(reps.value))reps.value=String(set.reps);
    row.classList.toggle('done',set.done);
    button.classList.toggle('done',set.done);
    button.setAttribute('aria-pressed',String(set.done));
    const count=completedSets(exercise).length,total=effectiveSets(exercise).length;
    const badge=q('.smart-active-head > strong');
    if(badge)badge.textContent=`${count}/${total}`;
    try{navigator.vibrate?.(set.done?24:10)}catch(_){ }
    save?.();
    if(set.done)window.startMobileRest?.(Number(exercise.rest)||90);
  },true);

  // ----------------------------------------------------------------
  // 3) Recomendaciones específicas por ejercicio y cierre consistente.
  // ----------------------------------------------------------------
  function exerciseMetrics(ex){
    const sets=completedSets(ex),target=effectiveSets(ex).length;
    const reps=sets.map(s=>Number(s.reps)||0),weights=sets.map(s=>Number(s.weight)||0);
    const current=weights.at(-1)||Number(ex.suggestedWeight)||0;
    const first=reps[0]||0,last=reps.at(-1)||0;
    return{
      completed:sets.length,target,min:Number(ex.minReps)||1,max:Number(ex.maxReps)||1,
      reps,weights,current,average:reps.length?reps.reduce((a,b)=>a+b,0)/reps.length:0,
      first,last,drop:first>0?Math.max(0,(first-last)/first):0,
      volume:sets.reduce((sum,s)=>sum+(Number(s.weight)||0)*(Number(s.reps)||0),0)
    };
  }
  function localRecommendation(ex){
    const m=exerciseMetrics(ex);if(!m.completed)return null;
    const increment=m.current<20?1:m.current<60?2.5:5;
    const allAtMax=m.completed>=m.target&&m.reps.every(r=>r>=m.max);
    const below=m.reps.filter(r=>r<m.min).length;
    const majorDrop=m.drop>=.35&&m.completed>=2;
    if(ex.tag==='Dolor')return{status:'maintain',proposed:m.current,severity:'warning',reason:`En ${ex.name} marcaste dolor. La carga queda en ${formatNumber(m.current)} kg y conviene revisar técnica, recorrido y molestias antes de progresar.`,metrics:m};
    if(allAtMax&&!majorDrop)return{status:'increase',proposed:roundHalf(m.current+increment),severity:'positive',reason:`Completaste ${m.completed}/${m.target} series de ${ex.name} alcanzando ${m.max} repeticiones en todas, sin una caída marcada. Es una señal consistente para probar un aumento conservador.`,metrics:m};
    if(below>=Math.ceil(m.completed/2)||majorDrop)return{status:'reduce',proposed:Math.max(0,roundHalf(m.current-increment)),severity:'negative',reason:majorDrop?`En ${ex.name} las repeticiones bajaron de ${m.first} a ${m.last} (${Math.round(m.drop*100)}% de caída). Reducir un poco la carga puede ayudarte a sostener el rango objetivo.`:`En ${ex.name}, ${below} de ${m.completed} series quedaron debajo del mínimo de ${m.min} repeticiones. Conviene bajar levemente para recuperar calidad y volumen.`,metrics:m};
    return{status:'maintain',proposed:m.current,severity:'neutral',reason:`En ${ex.name} completaste ${m.completed}/${m.target} series con un promedio de ${m.average.toFixed(1)} repeticiones dentro del rango ${m.min}-${m.max}. Mantené ${formatNumber(m.current)} kg hasta consolidar el extremo alto.`,metrics:m};
  }
  async function smartRecommendation(ex,session){
    const local=localRecommendation(ex);if(!local)return null;
    const history=(data.sessions||[]).filter(s=>s.date<session.date).slice(-10).map(s=>{
      const old=(s.exercises||[]).find(item=>String(item.id)===String(ex.id)||item.name===ex.name);
      return old?{date:s.date,sets:completedSets(old).map(x=>({weight:Number(x.weight)||0,reps:Number(x.reps)||0})),recommendation:old.recommendation,next_weight:old.nextWeight}:null;
    }).filter(Boolean).slice(-5);
    try{
      const response=await callSmartHandler({action:'workout_exercise_analysis',context:{
        exercise:{name:ex.name,target_sets:local.metrics.target,min_reps:local.metrics.min,max_reps:local.metrics.max,current_weight:local.metrics.current,completed_sets:completedSets(ex).map(s=>({weight:Number(s.weight)||0,reps:Number(s.reps)||0})),tag:ex.tag||null,note:ex.note||null},
        history,
        session:{muscle:session.muscle,date:session.date},
        instruction:'Analizá exclusivamente este ejercicio. La explicación debe citar sus series, repeticiones, carga y caída concreta. Evitá frases genéricas que puedan aplicarse a cualquier ejercicio.'
      }});
      const ai=response.analysis||response;
      let status=String(ai.status||local.status).toLowerCase();
      if(status==='decrease')status='reduce';
      if(!['increase','reduce','maintain'].includes(status))status=local.status;
      let proposed=Number(ai.recommended_next_weight);
      if(!Number.isFinite(proposed)||proposed<0)proposed=local.proposed;
      if(status==='increase'&&proposed<=local.metrics.current)proposed=local.proposed;
      if(status==='reduce'&&proposed>=local.metrics.current)proposed=local.proposed;
      if(status==='maintain')proposed=local.metrics.current;
      const aiReason=String(ai.reason||ai.message||'').trim();
      return{...local,status,proposed:roundHalf(proposed),reason:aiReason.length>35?aiReason:local.reason,confidence:Number(ai.confidence_percent)||70};
    }catch(error){console.warn(`Análisis de ${ex.name}:`,error);return local}
  }

  function recommendationCard(rec){
    const label=rec.status==='increase'?'Subir carga':rec.status==='reduce'?'Bajar carga':'Se mantiene';
    const tone=rec.status==='increase'?'increase':rec.status==='reduce'?'reduce':'maintain';
    const needsChoice=rec.status!=='maintain';
    return `<article class="prime-rec-card ${tone}" data-exercise-id="${rec.exerciseId}">
      <div class="prime-rec-top"><div><span class="prime-rec-status">${label}</span><h3>${rec.name}</h3></div><span class="prime-rec-confidence">${rec.confidence||'—'}${rec.confidence?'%':''}</span></div>
      <p>${rec.reason}</p>
      <div class="prime-rec-metrics"><span>${rec.metrics.completed}/${rec.metrics.target} series</span><span>${rec.metrics.average.toFixed(1)} reps prom.</span><span>${formatNumber(rec.metrics.volume)} kg volumen</span></div>
      ${needsChoice?`<div class="prime-rec-change"><span>${formatNumber(rec.current)} kg</span><b>→</b><strong>${formatNumber(rec.proposed)} kg</strong></div><div class="prime-rec-actions"><button data-choice="apply" onclick="choosePrimeRecommendation('${rec.exerciseId}','apply')">${rec.status==='increase'?'Aplicar aumento':'Aplicar reducción'}</button><button data-choice="keep" onclick="choosePrimeRecommendation('${rec.exerciseId}','keep')">Dejar ${formatNumber(rec.current)} kg</button></div>`:`<div class="prime-rec-maintain"><i></i><strong>Se mantiene en ${formatNumber(rec.current)} kg</strong><span>No necesitás decidir nada.</span></div>`}
    </article>`;
  }
  function openRecommendationReview(session,recs){
    let modal=q('#smartRecommendationModal');
    if(!modal){document.body.insertAdjacentHTML('beforeend','<div class="modal smart-recommendation-modal" id="smartRecommendationModal"><div class="sheet"><div id="smartRecommendationContent"></div></div></div>');modal=q('#smartRecommendationModal')}
    session.pendingRecommendations=recs.map(rec=>({...rec,choice:rec.status==='maintain'?'maintain':null}));
    q('#smartRecommendationContent').innerHTML=`<div class="smart-rec-head"><div class="smart-rec-icon"><svg><use href="#i-spark"></use></svg></div><span>Prime AI</span><h2>Revisión de tu entrenamiento</h2><p>Cada ejercicio fue evaluado con sus propias series. Solo decidí cuando Prime AI propone cambiar la carga.</p></div><div class="prime-rec-list">${recs.map(recommendationCard).join('')}</div><button class="smart-rec-confirm" id="smartRecConfirm" ${session.pendingRecommendations.some(r=>!r.choice)?'disabled':''}>Finalizar y guardar entrenamiento</button>`;
    q('#smartRecConfirm').onclick=window.applyPrimeWorkoutRecommendations;
    modal.classList.add('open');document.body.classList.add('modal-open');
  }
  window.choosePrimeRecommendation=(id,choice)=>{
    const session=getSession?.();const rec=session?.pendingRecommendations?.find(r=>String(r.exerciseId)===String(id));if(!rec)return;
    rec.choice=choice;
    const card=q(`[data-exercise-id="${CSS.escape(String(id))}"]`,q('#smartRecommendationContent'));
    qa('[data-choice]',card).forEach(btn=>btn.classList.toggle('selected',btn.dataset.choice===choice));
    const confirm=q('#smartRecConfirm');if(confirm)confirm.disabled=session.pendingRecommendations.some(r=>!r.choice);
  };
  window.applyPrimeWorkoutRecommendations=async()=>{
    const session=getSession?.();if(!session||session.pendingRecommendations?.some(r=>!r.choice))return;
    const button=q('#smartRecConfirm');if(button){button.disabled=true;button.textContent='Guardando entrenamiento…'}
    try{
      const routine=(data.routine||[]).find(day=>day.day===session.routineDay);
      session.pendingRecommendations.forEach(rec=>{
        const sessionEx=(session.exercises||[]).find(ex=>String(ex.id)===String(rec.exerciseId));
        const routineEx=(routine?.exercises||[]).find(ex=>String(ex.id)===String(rec.exerciseId));
        const applied=rec.choice==='apply';
        const next=applied?Number(rec.proposed):Number(rec.current);
        if(sessionEx){sessionEx.nextWeight=next;sessionEx.recommendation=rec.status==='increase'&&applied?'Subir':rec.status==='reduce'&&applied?'Bajar':'Mantener';sessionEx.recommendationWhy=rec.reason;sessionEx.recommendationDecision=rec.choice}
        if(routineEx&&applied)routineEx.weight=next;
      });
      session.status=session._finishStatus||'completed';session.completedAt=new Date().toISOString();session.activeStepToken=null;
      session.loadChanges=session.pendingRecommendations.filter(r=>r.choice==='apply').map(r=>({exercise:r.name,from:r.current,to:r.proposed,type:r.status,reason:r.reason}));
      delete session._finishStatus;delete session.pendingRecommendations;
      await (window.PrimeState?.save?.({showToast:false})||window.commitPrimeState?.());
      q('#smartRecommendationModal')?.classList.remove('open');document.body.classList.remove('modal-open');dismissRestTimer();
      renderAll?.();showPage?.('homePage');window.scrollTo({top:0,behavior:'auto'});
    }catch(error){console.error('Finalizar entrenamiento:',error);if(button){button.disabled=false;button.textContent='Reintentar guardado'}alert('No se pudo confirmar el entrenamiento en Supabase. Tus datos siguen respaldados y podés reintentar.')}
  };
  window.finishPrimeWorkout=async()=>{
    const session=getSession?.();if(!session)return;
    const total=(session.exercises||[]).reduce((n,ex)=>n+effectiveSets(ex).length,0),done=(session.exercises||[]).reduce((n,ex)=>n+completedSets(ex).length,0);
    const cardioTotal=(session.cardio||[]).length,cardioDone=(session.cardio||[]).filter(c=>c.done).length;
    const complete=done===total&&cardioDone===cardioTotal;
    if(!complete&&!confirm(`Completaste ${done}/${total} series y ${cardioDone}/${cardioTotal} actividades de cardio. ¿Finalizar como parcial?`))return;
    const button=q('#finishWorkoutBtn');if(button){button.disabled=true;button.textContent='Prime AI analiza cada ejercicio…'}
    try{
      const eligible=(session.exercises||[]).filter(ex=>completedSets(ex).length);
      const recs=(await Promise.all(eligible.map(async ex=>{
        const result=await smartRecommendation(ex,session);return result?{exerciseId:ex.id,name:ex.name,current:result.metrics.current,...result}:null;
      }))).filter(Boolean);
      try{
        const overall=await callSmartHandler({action:'workout_session_analysis',context:{session:{title:session.title,muscle:session.muscle,date:session.date,exercises:eligible.map(ex=>({name:ex.name,target:`${ex.targetSets}x${ex.minReps}-${ex.maxReps}`,sets:completedSets(ex).map(s=>({weight:Number(s.weight),reps:Number(s.reps)})),tag:ex.tag||null,recommendation:recs.find(r=>r.exerciseId===ex.id)?.status}))},history:(data.sessions||[]).filter(s=>s.date<session.date).slice(-6).map(s=>({date:s.date,status:s.status,volume:typeof volume==='function'?volume(s):0}))}});
        session.sessionAI=overall.analysis?.summary||overall.summary||'';
      }catch(_){session.sessionAI=`Se analizaron ${recs.length} ejercicios con sus series registradas.`}
      session._finishStatus=complete?'completed':'partial';save?.();
      if(recs.length)openRecommendationReview(session,recs);else{session.pendingRecommendations=[];await window.applyPrimeWorkoutRecommendations()}
    }finally{if(button){button.disabled=false;button.innerHTML='<svg><use href="#i-check"></use></svg>Finalizar entrenamiento'}}
  };
  const priorRenderWorkout=window.renderWorkout;
  window.renderWorkout=function(){priorRenderWorkout?.();const finish=q('#finishWorkoutBtn');if(finish)finish.onclick=window.finishPrimeWorkout};

  // ------------------------------------------------------------
  // 4) Reporte diario profesional y crítico.
  // ------------------------------------------------------------
  function mealsFor(date){return(data.meals||[]).filter(m=>(m.date||m.meal_date)===date)}
  function mealTotals(meals){return meals.reduce((a,m)=>({calories:a.calories+(Number(m.calories)||0),protein:a.protein+(Number(m.protein??m.protein_g)||0),carbs:a.carbs+(Number(m.carbs??m.carbs_g)||0),fat:a.fat+(Number(m.fat??m.fat_g)||0),fiber:a.fiber+(Number(m.fiber??m.fiber_g)||0)}),{calories:0,protein:0,carbs:0,fat:0,fiber:0})}
  function targets(){try{return nutritionTargets()}catch(_){return{calories:0,protein:0,carbs:0,fat:0}}}
  function deterministicReport(date,session,meals,error){
    const totals=mealTotals(meals),target=targets();
    const caloriePct=target.calories?totals.calories/target.calories:0,proteinPct=target.protein?totals.protein/target.protein:0;
    const nutritionScore=Math.max(0,Math.min(100,Math.round((Math.min(1,caloriePct)*.45+Math.min(1,proteinPct)*.55)*100)));
    const trainingScore=session?.status==='completed'?85:session?.status==='partial'?60:35;
    const score=Math.round((session?trainingScore*.55:0)+(nutritionScore*.45));
    return{score,headline:score>=80?'Día sólido, con ajustes puntuales':score>=60?'Buen entrenamiento, alimentación incompleta':'Día insuficiente para el objetivo',executive_summary:`Se registraron ${meals.length} comidas por ${Math.round(totals.calories)} kcal y ${Math.round(totals.protein)} g de proteína.${session?' El entrenamiento quedó '+(session.status==='completed'?'completo.':'parcial.'):' No hubo entrenamiento registrado.'}`,training:{score:trainingScore,summary:session?'Revisá el detalle de cada ejercicio y las cargas definidas para la próxima sesión.':'No hay entrenamiento para evaluar.',exercise_analysis:(session?.exercises||[]).filter(ex=>completedSets(ex).length).map(ex=>({exercise:ex.name,summary:ex.recommendationWhy||localRecommendation(ex)?.reason||'Ejercicio registrado.',decision:ex.recommendation||'Mantener',next_weight:ex.nextWeight||ex.suggestedWeight})),load_changes:session?.loadChanges||[]},nutrition:{score:nutritionScore,summary:meals.length<=1?'La ingesta registrada es claramente insuficiente para evaluar el día como adecuado. Una sola comida no cubre energía, proteína, carbohidratos, grasas ni micronutrientes.':`El día alcanzó ${Math.round(caloriePct*100)}% de las calorías y ${Math.round(proteinPct*100)}% de la proteína objetivo.`,totals,target,meal_analysis:meals.map(m=>({meal:m.type||m.meal_type||'Comida',summary:`${m.description||m.normalizedName||m.normalized_name}: ${Math.round(Number(m.calories)||0)} kcal, ${formatNumber(m.protein??m.protein_g)} g de proteína.`}))},priorities:['Completar el registro de todas las comidas','Aplicar los ajustes de carga aceptados en la próxima sesión'],warnings:[error?.message].filter(Boolean)};
  }
  async function generateDailyReportPro(date=new Date().toISOString().slice(0,10)){
    const old=(data.dailyReports||[]).find(r=>r.date===date);if(old&&!confirm('Ya existe un reporte para este día. ¿Querés regenerarlo?'))return old;
    const session=getSession?.(date),meals=mealsFor(date),body=(data.bodyMeasurements||[]).filter(x=>x.date<=date).slice(-1)[0]||null;
    const totals=mealTotals(meals),target=targets();
    let report;
    try{
      const result=await callSmartHandler({action:'daily_expert_report',context:{date,profile,nutrition_settings:data.nutritionSettings,body,session,meals,computed:{totals,target,meal_count:meals.length,main_meals:[...new Set(meals.map(m=>m.type||m.meal_type))],calorie_coverage:target.calories?totals.calories/target.calories:null,protein_coverage:target.protein?totals.protein/target.protein:null,load_changes:session?.loadChanges||[]},recent_sessions:(data.sessions||[]).filter(s=>s.date<date).slice(-8),recent_reports:(data.dailyReports||[]).slice(-5)}});
      report=result.report||result.analysis||result;
    }catch(error){report=deterministicReport(date,session,meals,error)}
    report={id:crypto.randomUUID?.()||String(Date.now()),date,createdAt:new Date().toISOString(),...report};
    data.dailyReports=(data.dailyReports||[]).filter(r=>r.date!==date);data.dailyReports.unshift(report);
    await(window.PrimeState?.save?.({showToast:false})||window.commitPrimeState?.());
    try{renderDailyReports?.()}catch(_){ }
    window.downloadPrimeReportPro(report);return report;
  }
  function wrap(doc,text,width){return doc.splitTextToSize(String(text||''),width)}
  function sectionTitle(doc,title,y,color=[20,205,226]){doc.setFillColor(...color);doc.roundedRect(14,y-5,4,9,2,2,'F');doc.setTextColor(18,28,40);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(title,22,y+1);return y+9}
  function textBlock(doc,text,x,y,width,size=9.5,color=[62,72,84]){doc.setFont('helvetica','normal');doc.setFontSize(size);doc.setTextColor(...color);const lines=wrap(doc,text,width);doc.text(lines,x,y);return y+lines.length*(size*.42)+4}
  function ensurePage(doc,y,needed=30){if(y+needed>282){doc.addPage();return 20}return y}
  window.downloadPrimeReportPro=function(input){
    const report=typeof input==='string'?(data.dailyReports||[]).find(r=>r.id===input):input;if(!report)return;
    const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)return alert('No se pudo cargar el generador PDF.');
    const doc=new jsPDF({unit:'mm',format:'a4'}),training=report.training||{},nutrition=report.nutrition||{},totals=nutrition.totals||{},target=nutrition.target||{};
    doc.setFillColor(7,14,23);doc.rect(0,0,210,48,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('PRIME TRAINING',14,18);doc.setFontSize(10);doc.setTextColor(157,173,190);doc.text(`Reporte profesional · ${new Date(report.date+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`,14,27);
    const score=Math.max(0,Math.min(100,Number(report.score)||0));doc.setFillColor(18,31,45);doc.circle(179,22,14,'F');doc.setDrawColor(29,210,226);doc.setLineWidth(2.4);doc.circle(179,22,14,'S');doc.setTextColor(255,255,255);doc.setFontSize(18);doc.text(String(score),179,24,{align:'center'});doc.setFontSize(7);doc.text('PRIME SCORE',179,30,{align:'center'});
    let y=59;doc.setTextColor(13,24,36);doc.setFontSize(17);doc.text(report.headline||'Cierre diario',14,y);y+=8;y=textBlock(doc,report.executive_summary||report.summary||'',14,y,182,10.5);
    y=ensurePage(doc,y,35);y=sectionTitle(doc,'Resumen de indicadores',y);
    const cards=[['Entrenamiento',training.score??'—',[113,92,255]],['Nutrición',nutrition.score??'—',[21,202,228]],['Comidas',nutrition.meal_analysis?.length??0,[255,158,67]]];
    cards.forEach((c,i)=>{const x=14+i*61;doc.setFillColor(245,248,251);doc.roundedRect(x,y,56,22,3,3,'F');doc.setTextColor(104,116,130);doc.setFontSize(8);doc.text(c[0],x+5,y+7);doc.setTextColor(...c[2]);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(String(c[1]),x+5,y+17)});y+=31;
    y=ensurePage(doc,y,45);y=sectionTitle(doc,'Entrenamiento',y,[113,92,255]);y=textBlock(doc,training.summary||report.training_analysis||'Sin datos suficientes.',14,y,182);
    const exercises=training.exercise_analysis||[];exercises.slice(0,8).forEach(ex=>{y=ensurePage(doc,y,18);doc.setFillColor(247,249,252);doc.roundedRect(14,y-3,182,14,2,2,'F');doc.setTextColor(20,30,42);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(String(ex.exercise||ex.name||'Ejercicio'),18,y+2);doc.setTextColor(87,99,114);doc.setFont('helvetica','normal');doc.setFontSize(8);const summary=wrap(doc,ex.summary||ex.reason||'',126).slice(0,2);doc.text(summary,18,y+7);doc.setTextColor(15,160,180);doc.setFont('helvetica','bold');doc.text(`${ex.decision||'Mantener'} · ${formatNumber(ex.next_weight||0)} kg`,191,y+3,{align:'right'});y+=17});
    y=ensurePage(doc,y,55);y=sectionTitle(doc,'Nutrición y macros',y,[21,202,228]);y=textBlock(doc,nutrition.summary||report.nutrition_analysis||'Sin datos suficientes.',14,y,182);
    [['Calorías',totals.calories,target.calories,'kcal'],['Proteína',totals.protein,target.protein,'g'],['Carbohidratos',totals.carbs,target.carbs,'g'],['Grasas',totals.fat,target.fat,'g']].forEach(([name,value,goal,unit])=>{y=ensurePage(doc,y,12);const pct=goal?Math.max(0,Math.min(1,Number(value||0)/Number(goal))):0;doc.setTextColor(49,61,75);doc.setFontSize(8);doc.text(`${name}: ${Math.round(Number(value)||0)} / ${Math.round(Number(goal)||0)} ${unit}`,14,y);doc.setFillColor(231,236,241);doc.roundedRect(75,y-3,121,4,2,2,'F');doc.setFillColor(pct<.6?238:21,pct<.6?92:202,pct<.6?100:228);doc.roundedRect(75,y-3,121*pct,4,2,2,'F');y+=9});
    const priorities=report.priorities||report.tomorrow_plan||[];if(priorities.length){y=ensurePage(doc,y,30);y=sectionTitle(doc,'Prioridades para mañana',y,[255,158,67]);priorities.forEach((p,i)=>{y=ensurePage(doc,y,10);doc.setFillColor(255,245,232);doc.circle(17,y-1,3,'F');doc.setTextColor(154,91,28);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(String(i+1),17,y+1,{align:'center'});y=textBlock(doc,p,23,y+1,170,9,[65,72,82])})}
    const warnings=report.warnings||[];if(warnings.length){y=ensurePage(doc,y,25);y=sectionTitle(doc,'Alertas y calidad del registro',y,[238,92,100]);warnings.forEach(w=>{y=textBlock(doc,'• '+w,16,y,178,8.5,[112,62,68])})}
    doc.setFontSize(7);doc.setTextColor(140,149,160);doc.text('Generado por Prime AI. Las estimaciones nutricionales dependen de la precisión de las porciones registradas.',14,291);
    doc.save(`Prime-Training-Reporte-${report.date}.pdf`);
  };
  window.downloadPrimeReport=window.downloadPrimeReportPro;
  const reportButton=q('#generateDailyReportBtn');
  if(reportButton){const clean=reportButton.cloneNode(true);reportButton.replaceWith(clean);clean.addEventListener('click',()=>generateDailyReportPro())}

  const css=document.createElement('style');css.id='prime-v52-polish';css.textContent=`
    body:not(:has(#workoutPage.active)) #mobileRestTimer,body:not(:has(#workoutPage.active)) #timer{display:none!important}
    .smart-set-row.done{background:rgba(0,208,125,.11)!important;border-color:rgba(0,231,140,.34)!important;transition:background .15s,border-color .15s,transform .15s}.smart-set-row.done .smart-set-number{color:#55f2a1!important}.smart-check.done{background:#00d77f!important;border-color:#25efa0!important;color:#03150d!important;box-shadow:0 0 0 4px rgba(0,215,127,.11)!important}.smart-check.done:active{transform:scale(.9)}
    .prime-rec-list{display:grid;gap:12px}.prime-rec-card{padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:#091823}.prime-rec-card.increase{border-color:rgba(0,217,166,.27)}.prime-rec-card.reduce{border-color:rgba(255,99,114,.28)}.prime-rec-card.maintain{border-color:rgba(255,190,66,.26);background:linear-gradient(145deg,rgba(255,190,66,.055),#091823)}.prime-rec-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.prime-rec-top h3{margin:5px 0 0;font-size:1.05rem}.prime-rec-status{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#7fe8ff}.prime-rec-card.maintain .prime-rec-status{color:#ffc760}.prime-rec-card.reduce .prime-rec-status{color:#ff8793}.prime-rec-confidence{padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.06);font-size:.69rem;color:#91a1b1}.prime-rec-card p{margin:12px 0;color:#b3c0cd;line-height:1.55;font-size:.88rem}.prime-rec-metrics{display:flex;gap:6px;flex-wrap:wrap}.prime-rec-metrics span{padding:6px 8px;border-radius:9px;background:rgba(255,255,255,.045);color:#8192a3;font-size:.68rem}.prime-rec-change{display:flex;justify-content:center;align-items:center;gap:12px;margin:14px 0 10px;font-size:1rem}.prime-rec-change span{color:#778899}.prime-rec-change strong{font-size:1.3rem;color:#fff}.prime-rec-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.prime-rec-actions button{min-height:45px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:#101f2b;color:#acb8c5;font-weight:800}.prime-rec-actions button.selected{background:linear-gradient(135deg,#6b61ff,#05bedc);border-color:transparent;color:#fff}.prime-rec-maintain{display:grid;grid-template-columns:10px 1fr;column-gap:8px;margin-top:14px;padding:12px;border-radius:13px;background:rgba(255,190,66,.09);color:#ffd174}.prime-rec-maintain i{width:8px;height:8px;margin-top:4px;border-radius:50%;background:#ffc047}.prime-rec-maintain strong{font-size:.85rem}.prime-rec-maintain span{grid-column:2;color:#a49472;font-size:.72rem;margin-top:2px}.smart-rec-confirm{position:sticky;bottom:0;z-index:3;box-shadow:0 -14px 30px rgba(4,12,19,.86)}
  `;document.head.appendChild(css);
  if(getSession?.())window.renderWorkout();
})();
