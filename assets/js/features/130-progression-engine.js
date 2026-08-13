/* Prime Training 6.5 — Progressive Overload Engine
   La decisión de carga es determinista. Prime AI puede contextualizar,
   pero nunca puede contradecir las reglas objetivas de progresión. */
(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const fmt=n=>Number.isInteger(Number(n))?String(Number(n)):Number(n).toFixed(1).replace('.',',');
  const roundHalf=n=>Math.round(Number(n)*2)/2;
  const session=()=>{try{return getSession?.()}catch(_){return null}};
  const effectiveSets=ex=>(ex?.sets||[]).filter(s=>!s.warmup);
  const doneSets=ex=>effectiveSets(ex).filter(s=>s.done&&Number(s.reps)>0);

  function loadIncrement(ex,current){
    const name=String(ex?.name||'').toLowerCase();
    const isolation=/lateral|curl|bíceps|biceps|tríceps|triceps|face pull|apertura|cruce|fly|pullover|gemelo|pantorrilla/.test(name);
    if(isolation){
      if(current<20)return 1;
      if(current<50)return 2.5;
      return 5;
    }
    if(current<20)return 1;
    if(current<60)return 2.5;
    return 5;
  }

  function metrics(ex){
    const sets=doneSets(ex);
    const min=Math.max(1,Number(ex.minReps)||1);
    const max=Math.max(min,Number(ex.maxReps)||min);
    const target=Math.max(1,Number(ex.targetSets)||effectiveSets(ex).length||1);
    const reps=sets.map(s=>Number(s.reps)||0);
    const weights=sets.map(s=>Number(s.weight)||0);
    const current=weights.length?(weights[weights.length-1]||Math.max(...weights)):Number(ex.suggestedWeight)||0;
    const best=reps.length?Math.max(...reps):0;
    const worst=reps.length?Math.min(...reps):0;
    const first=reps[0]||0,last=reps.at(-1)||0;
    const avg=reps.length?reps.reduce((a,b)=>a+b,0)/reps.length:0;
    const below=reps.filter(r=>r<min);
    const within=reps.filter(r=>r>=min&&r<=max);
    const drop=first>0?Math.max(0,(first-last)/first):0;
    const spread=best-worst;
    return {sets,min,max,target,reps,weights,current,best,worst,first,last,avg,belowCount:below.length,withinCount:within.length,drop,spread,completed:sets.length};
  }

  function decide(ex){
    const m=metrics(ex);
    const inc=loadIncrement(ex,m.current);
    const allTargetDone=m.completed>=m.target;
    const allAtMax=allTargetDone && m.reps.slice(0,m.target).every(r=>r>=m.max);
    const tag=String(ex.tag||'').toLowerCase();

    if(!m.completed){
      return {status:'maintain',current:m.current,proposed:m.current,tone:'maintain',m,
        reason:`No hay series efectivas completas de ${ex.name}. No hay evidencia suficiente para modificar la carga.`};
    }

    if(tag.includes('dolor')){
      return {status:'maintain',current:m.current,proposed:m.current,tone:'warning',m,
        reason:`Marcaste dolor en ${ex.name}. Prime Training no cambia la carga automáticamente con dolor registrado; primero conviene resolver la molestia y revisar la ejecución.`};
    }

    // ÚNICA puerta para aumentar: todas las series objetivo en el máximo.
    if(allAtMax && !tag.includes('costó') && !tag.includes('costo')){
      return {status:'increase',current:m.current,proposed:roundHalf(m.current+inc),tone:'increase',m,
        reason:`Completaste ${m.target}/${m.target} series de ${ex.name} en ${m.reps.slice(0,m.target).join(' · ')} reps con ${fmt(m.current)} kg. Alcanzaste el máximo de ${m.max} en todas: ya consolidaste el rango y corresponde probar un aumento pequeño.`};
    }

    // Para bajar tiene que existir rendimiento BAJO EL MÍNIMO + evidencia fuerte.
    const averageBelow=m.avg<m.min;
    const severalBelow=m.belowCount>=Math.max(2,Math.ceil(m.completed/2));
    const clearlyBelow=m.worst<=m.min-2;
    const markedDrop=m.drop>=0.25 && m.worst<m.min;
    const repeatedFailure=severalBelow && (averageBelow||clearlyBelow);
    const sharpFailure=clearlyBelow && markedDrop;

    if(repeatedFailure||sharpFailure){
      return {status:'reduce',current:m.current,proposed:Math.max(0,roundHalf(m.current-inc)),tone:'reduce',m,
        reason:`En ${ex.name} registraste ${m.reps.join(' · ')} reps con mínimo ${m.min}. ${m.belowCount} serie${m.belowCount===1?' quedó':'s quedaron'} por debajo del rango${markedDrop?` y la caída fue de ${Math.round(m.drop*100)}%`:''}. La diferencia ya es suficiente para bajar levemente y recuperar series de calidad.`};
    }

    // Todo lo demás se mantiene. Incluso una caída de 1 rep dentro del rango.
    let detail;
    if(allAtMax && (tag.includes('costó')||tag.includes('costo'))){
      detail=`Llegaste al máximo en todas las series, pero marcaste “Me costó”. Consolidá una sesión más antes de subir.`;
    }else if(!allTargetDone){
      detail=`Completaste ${m.completed}/${m.target} series efectivas. Antes de modificar la carga conviene completar el volumen objetivo.`;
    }else if(m.belowCount===0){
      detail=`Tus series fueron ${m.reps.join(' · ')} dentro del rango ${m.min}-${m.max}. Estás cerca, pero solo se sube cuando todas alcanzan ${m.max}.`;
    }else{
      detail=`Tus series fueron ${m.reps.join(' · ')}. Hubo ${m.belowCount} serie${m.belowCount===1?'':'s'} apenas por debajo de ${m.min}, pero la caída no es suficiente para justificar bajar la carga.`;
    }
    return {status:'maintain',current:m.current,proposed:m.current,tone:'maintain',m,
      reason:`${ex.name}: ${detail} Mantené ${fmt(m.current)} kg.`};
  }

  function card(rec){
    const m=rec.m;
    const label=rec.status==='increase'?'SUBIR CARGA':rec.status==='reduce'?'BAJAR CARGA':'MANTENER';
    const choices=rec.status!=='maintain';
    return `<article class="prime-progression-card ${rec.tone}" data-progression-id="${String(rec.id).replace(/"/g,'&quot;')}">
      <div class="prime-progression-head">
        <div><span>${label}</span><h3>${rec.name}</h3></div>
        <strong>${fmt(rec.current)} kg</strong>
      </div>
      <div class="prime-progression-series">
        ${m.reps.map((r,i)=>`<span class="${r>=m.max?'max':r<m.min?'low':'range'}"><b>S${i+1}</b>${r}</span>`).join('')}
      </div>
      <p>${rec.reason}</p>
      ${choices?`
        <div class="prime-progression-change"><span>${fmt(rec.current)} kg</span><b>→</b><strong>${fmt(rec.proposed)} kg</strong></div>
        <div class="prime-progression-actions">
          <button type="button" data-choice="apply" onclick="PrimeProgression.choose('${String(rec.id).replace(/'/g,"\\'")}','apply')">${rec.status==='increase'?'Aplicar aumento':'Aplicar reducción'}</button>
          <button type="button" data-choice="keep" onclick="PrimeProgression.choose('${String(rec.id).replace(/'/g,"\\'")}','keep')">Dejar ${fmt(rec.current)} kg</button>
        </div>`:
        `<div class="prime-progression-maintain"><i></i><div><strong>Se mantiene en ${fmt(rec.current)} kg</strong><span>No tenés que elegir nada para este ejercicio.</span></div></div>`}
    </article>`;
  }

  function ensureModal(){
    let modal=q('#primeProgressionModal');
    if(modal)return modal;
    document.body.insertAdjacentHTML('beforeend',`
      <div class="modal prime-progression-modal" id="primeProgressionModal" aria-modal="true" role="dialog">
        <div class="sheet prime-progression-sheet">
          <div class="prime-progression-content" id="primeProgressionContent"></div>
        </div>
      </div>`);
    return q('#primeProgressionModal');
  }

  function renderReview(s){
    const modal=ensureModal();
    const recs=s.primeProgression||[];
    const pending=recs.some(r=>r.status!=='maintain'&&!r.choice);
    q('#primeProgressionContent').innerHTML=`
      <div class="prime-progression-hero">
        <div class="prime-progression-ai">✦</div>
        <span>PRIME PROGRESSION</span>
        <h2>Ajustes para la próxima sesión</h2>
        <p>La carga solo sube al completar todas las series en el máximo. Se baja únicamente cuando el rendimiento cae de forma clara por debajo del mínimo.</p>
      </div>
      <div class="prime-progression-list">${recs.map(card).join('')}</div>
      <button type="button" class="prime-progression-confirm" id="primeProgressionConfirm" ${pending?'disabled':''}>Confirmar y finalizar entrenamiento</button>`;
    q('#primeProgressionConfirm').onclick=PrimeProgression.confirm;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  async function finish(){
    const s=session();if(!s)return;
    const total=(s.exercises||[]).reduce((n,e)=>n+effectiveSets(e).length,0);
    const done=(s.exercises||[]).reduce((n,e)=>n+doneSets(e).length,0);
    const cardio=(s.cardio||[]);
    const cardioDone=cardio.filter(c=>c.done).length;
    const complete=done===total&&cardioDone===cardio.length;
    if(!complete&&!confirm(`Completaste ${done}/${total} series y ${cardioDone}/${cardio.length} pasos de cardio. ¿Finalizar como entrenamiento parcial?`))return;

    const button=q('#finishWorkoutBtn');
    if(button){button.disabled=true;button.textContent='Analizando progresión…'}

    try{
      const recs=(s.exercises||[]).filter(e=>doneSets(e).length).map(ex=>{
        const d=decide(ex);
        return {id:ex.id,name:ex.name,...d,choice:d.status==='maintain'?'maintain':null};
      });
      s._primeFinishStatus=complete?'completed':'partial';
      s.primeProgression=recs;
      try{save?.()}catch(_){}
      if(recs.length)renderReview(s);
      else await confirm();
    }finally{
      if(button){button.disabled=false;button.innerHTML='<svg><use href="#i-check"></use></svg>Finalizar entrenamiento'}
    }
  }

  function choose(id,choice){
    const s=session();if(!s)return;
    const rec=(s.primeProgression||[]).find(r=>String(r.id)===String(id));
    if(!rec||rec.status==='maintain')return;
    rec.choice=choice;
    const card=q(`[data-progression-id="${CSS.escape(String(id))}"]`,q('#primeProgressionContent'));
    qa('[data-choice]',card).forEach(b=>b.classList.toggle('selected',b.dataset.choice===choice));
    const confirmBtn=q('#primeProgressionConfirm');
    if(confirmBtn)confirmBtn.disabled=(s.primeProgression||[]).some(r=>r.status!=='maintain'&&!r.choice);
  }

  async function confirm(){
    const s=session();if(!s)return;
    if((s.primeProgression||[]).some(r=>r.status!=='maintain'&&!r.choice))return;

    const button=q('#primeProgressionConfirm');
    if(button){button.disabled=true;button.textContent='Guardando cambios…'}

    try{
      const routine=(data.routine||[]).find(d=>d.day===s.routineDay);
      const applied=[];

      (s.primeProgression||[]).forEach(rec=>{
        const sx=(s.exercises||[]).find(e=>String(e.id)===String(rec.id));
        const rx=(routine?.exercises||[]).find(e=>String(e.id)===String(rec.id)||e.name===rec.name);
        const apply=rec.status!=='maintain'&&rec.choice==='apply';
        const next=apply?Number(rec.proposed):Number(rec.current);

        if(sx){
          sx.nextWeight=next;
          sx.recommendation=apply?(rec.status==='increase'?'Subir':'Bajar'):'Mantener';
          sx.recommendationWhy=rec.reason;
          sx.recommendationDecision=rec.status==='maintain'?'maintain':rec.choice;
        }
        if(rx&&apply)rx.weight=next;
        if(apply)applied.push({exercise:rec.name,from:rec.current,to:rec.proposed,type:rec.status,reason:rec.reason});
      });

      s.loadChanges=applied;
      s.status=s._primeFinishStatus||'completed';
      s.completedAt=new Date().toISOString();
      s.activeStepToken=null;
      delete s._primeFinishStatus;
      delete s.primeProgression;

      try{save?.()}catch(_){}
      if(window.PrimeState?.save)await window.PrimeState.save({showToast:false});
      else if(window.commitPrimeState)await window.commitPrimeState();

      q('#primeProgressionModal')?.classList.remove('open');
      document.body.classList.remove('modal-open');
      try{dismissRestTimer?.()}catch(_){}
      try{renderAll?.()}catch(_){}
      try{showPage?.('homePage')}catch(_){}
      window.scrollTo({top:0,behavior:'auto'});
    }catch(error){
      console.error('Prime Progression:',error);
      if(button){button.disabled=false;button.textContent='Reintentar guardado'}
      alert('No se pudo guardar el cierre del entrenamiento. Tus series siguen registradas y podés reintentar.');
    }
  }

  function bindFinish(){
    const btn=q('#finishWorkoutBtn');
    if(btn){
      btn.onclick=finish;
      btn.classList.add('premium-final-button','prime-progression-finish');
    }
  }

  const previousRenderWorkout=window.renderWorkout;
  if(typeof previousRenderWorkout==='function'){
    window.renderWorkout=function(){
      const result=previousRenderWorkout.apply(this,arguments);
      bindFinish();
      return result;
    };
  }
  setTimeout(bindFinish,0);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(bindFinish,30)});

  window.PrimeProgression={finish,choose,confirm,decide,metrics};
})();