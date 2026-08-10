(()=>{
  'use strict';
  let setLock=false;
  let homeRefreshTimer=0;

  const sessionNow=()=>typeof currentSession==='function'?currentSession():(typeof getSession==='function'?getSession():null);
  const effective=e=>(e?.sets||[]).filter(x=>!x.warmup&&!e.skipped);
  const completed=e=>(e?.sets||[]).filter(x=>x.done&&!x.warmup);

  function refreshWorkoutNumbers(s,ei){
    if(!s)return;
    const all=s.exercises.reduce((n,e)=>n+effective(e).length,0);
    const done=s.exercises.reduce((n,e)=>n+completed(e).length,0);
    const pct=Math.round(done/Math.max(1,all)*100);
    const ex=s.exercises[ei];
    const volume=s.exercises.flatMap(completed).reduce((n,x)=>n+(Number(x.weight)||0)*(Number(x.reps)||0),0);
    const doneExercises=s.exercises.filter(e=>e.skipped||completed(e).length>=effective(e).length).length;
    const focus=document.getElementById('focusProgress');if(focus)focus.textContent=`${done}/${all} series · ${pct}%`;
    const badge=document.querySelector('#workoutPage .ai-session-row .badge');if(badge)badge.textContent=pct+'%';
    const bar=document.querySelector('#workoutPage .ai-progress-track i');if(bar)bar.style.width=pct+'%';
    const stats=document.querySelectorAll('#workoutPage .ai-session-stat strong');
    if(stats[0])stats[0].textContent=done;if(stats[1])stats[1].textContent=typeof fmt==='function'?fmt(volume):Math.round(volume);if(stats[2])stats[2].textContent=`${doneExercises}/${s.exercises.length}`;
    const counter=document.querySelector('#workoutPage .ai-ex-counter');if(counter&&ex)counter.textContent=`${completed(ex).length}/${effective(ex).length}`;
    const tab=document.querySelectorAll('#workoutPage .ai-exercise-tab')[ei];
    if(tab&&ex)tab.classList.toggle('done',ex.skipped||completed(ex).length>=effective(ex).length);
  }

  function refreshSetRow(ei,si,set,ex){
    const rows=document.querySelectorAll('#workoutPage .ai-set-row');
    const row=rows[si];if(!row)return;
    row.classList.toggle('done',!!set.done);
    row.classList.remove('active-set');
    const check=row.querySelector('.ai-set-check');
    if(check){check.classList.toggle('done',!!set.done);check.classList.remove('just-checked');void check.offsetWidth;if(set.done)check.classList.add('just-checked')}
    const reps=row.querySelectorAll('input')[1];if(reps&&set.done&&!Number(reps.value)){reps.value=set.reps||ex.minReps}
    const next=[...rows].find(r=>!r.classList.contains('done'));if(next)next.classList.add('active-set');
  }

  // Critical fix: update only the touched row. Do not rebuild the entire workout DOM.
  window.toggleSet=(ei,si)=>{
    if(setLock)return;
    const s=sessionNow(),ex=s?.exercises?.[ei],set=ex?.sets?.[si];if(!set)return;
    setLock=true;document.body.classList.add('prime-set-updating');
    set.done=!set.done;
    if(set.done&&!Number(set.reps))set.reps=Number(ex.minReps)||1;
    refreshSetRow(ei,si,set,ex);
    refreshWorkoutNumbers(s,ei);
    try{if(typeof save==='function')save()}catch(err){console.warn('No se pudo encolar la sincronización',err)}
    if(set.done){
      try{if(typeof startMobileRest==='function')startMobileRest(ex.rest||90);else if(typeof startTimer==='function')startTimer(ex.rest||90)}catch(err){}
      try{navigator.vibrate?.(25)}catch(err){}
    }
    clearTimeout(homeRefreshTimer);
    homeRefreshTimer=setTimeout(()=>{try{if(typeof renderHome==='function')renderHome()}catch(err){}},450);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{document.body.classList.remove('prime-set-updating');setLock=false}));
  };

  // Avoid smooth-scroll/layout work while the keyboard or a set update is active.
  window.selectWorkoutExercise=((original)=>function(i){
    if(setLock)return;
    original?.(i);
  })(window.selectWorkoutExercise);

  // iOS keyboard viewport stabilization.
  if(window.visualViewport){
    let raf=0;
    visualViewport.addEventListener('resize',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>document.documentElement.style.setProperty('--vvh',visualViewport.height+'px'))},{passive:true});
  }
})();
