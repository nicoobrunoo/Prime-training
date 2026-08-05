(() => {
  "use strict";

  window.activeWorkoutExerciseIndex = window.activeWorkoutExerciseIndex || 0;
  let mobileTimerTotal = 90;

  // Require Supabase session for any persisted action.
  const originalQueueCloudSync = queueCloudSync;
  queueCloudSync = function(){
    if(!currentUser){
      updateCloudStatus("error","Sin sesión","Iniciá sesión: ningún dato se guarda en el navegador");
      return;
    }
    originalQueueCloudSync();
  };

  function renderCloudOnlyNote(){
    const drawer=document.getElementById("drawer");
    if(!drawer||document.getElementById("cloudOnlyNote"))return;
    const label=[...drawer.querySelectorAll(".drawer-label")].find(x=>x.textContent.trim()==="Datos");
    if(label)label.insertAdjacentHTML("afterend",`<div class="cloud-only-note" id="cloudOnlyNote"><svg style="width:15px;height:15px"><use href="#i-check"/></svg>Persistencia exclusiva en Supabase</div>`);
  }

  function totalWorkoutProgress(session){
    const strengthTotal=session.exercises.reduce((a,e)=>a+e.sets.filter(x=>!x.warmup&&!e.skipped).length,0);
    const strengthDone=session.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.done&&!x.warmup).length,0);
    const cardioTotal=(session.cardio||[]).length;
    const cardioDone=(session.cardio||[]).filter(c=>c.done).length;
    return{total:strengthTotal+cardioTotal,done:strengthDone+cardioDone};
  }

  renderWorkout=function(){
    const session=getSession();
    if(!session)return;
    const exercises=session.exercises||[];
    if(!exercises.length){
      document.getElementById("workoutExercises").innerHTML='<div class="empty">No hay ejercicios configurados.</div>';
      return;
    }
    activeWorkoutExerciseIndex=Math.max(0,Math.min(activeWorkoutExerciseIndex,exercises.length-1));
    const exercise=exercises[activeWorkoutExerciseIndex];
    const progress=totalWorkoutProgress(session);
    const percent=Math.round(progress.done/Math.max(1,progress.total)*100);
    const completedSets=exercise.sets.filter(x=>x.done&&!x.warmup).length;

    document.getElementById("focusTitle").textContent=session.muscle;
    document.getElementById("focusProgress").textContent=`${progress.done}/${progress.total} bloques · ${percent}%`;

    const header=document.querySelector("#workoutPage .focus-header");
    let bar=header.querySelector(".workout-mobile-progress");
    if(!bar){header.insertAdjacentHTML("beforeend",'<div class="workout-mobile-progress"><div></div></div>');bar=header.querySelector(".workout-mobile-progress")}
    bar.firstElementChild.style.width=percent+"%";

    document.getElementById("workoutExercises").innerHTML=`
      <div class="exercise-pager">
        ${exercises.map((e,i)=>{
          const done=e.sets.filter(s=>s.done&&!s.warmup).length>=e.targetSets;
          return`<button class="exercise-pill ${i===activeWorkoutExerciseIndex?"active":""} ${done?"done":""}" onclick="selectWorkoutExercise(${i})">${done?"✓":i+1}</button>`
        }).join("")}
      </div>
      <article class="mobile-exercise-card">
        <div class="exercise-head">
          <div>
            <div class="eyebrow">EJERCICIO ${activeWorkoutExerciseIndex+1} DE ${exercises.length}</div>
            <div class="mobile-exercise-title">${exercise.name}</div>
            <div class="mobile-exercise-meta">${exercise.targetSets} series · ${exercise.minReps}-${exercise.maxReps} reps · sugerido ${exercise.suggestedWeight} kg · RIR ${exercise.rirTarget}</div>
          </div>
          <span class="badge ${completedSets>=exercise.targetSets?"badge-green":"badge-purple"}">${completedSets}/${exercise.targetSets}</span>
        </div>
        <div class="mobile-set-list">
          ${exercise.sets.map((set,index)=>`
            <div class="mobile-set ${set.done?"completed":""}">
              <div class="mobile-set-number">${set.warmup?"C":set.set}</div>
              <div class="mobile-input-wrap"><label>peso kg</label><input type="number" inputmode="decimal" step=".5" value="${set.weight}" onchange="updateSet(${activeWorkoutExerciseIndex},${index},'weight',this.value)"></div>
              <div class="mobile-input-wrap"><label>repeticiones</label><input type="number" inputmode="numeric" value="${set.reps}" placeholder="${exercise.minReps}" onchange="updateSet(${activeWorkoutExerciseIndex},${index},'reps',this.value)"></div>
              <button class="mobile-check ${set.done?"done":""}" onclick="toggleSet(${activeWorkoutExerciseIndex},${index})"><svg><use href="#i-check"/></svg></button>
            </div>
          `).join("")}
        </div>
        <div class="mobile-tools">
          <button class="mobile-tool" onclick="addSet(${activeWorkoutExerciseIndex})">+ Serie</button>
          <button class="mobile-tool" onclick="addWarmup(${activeWorkoutExerciseIndex})">Calentamiento</button>
          <button class="mobile-tool ${exercise.tag==="Me costó"?"active":""}" onclick="tagExercise(${activeWorkoutExerciseIndex},'Me costó')">Me costó</button>
          <button class="mobile-tool ${exercise.tag==="Dolor"?"active":""}" onclick="tagExercise(${activeWorkoutExerciseIndex},'Dolor')">Dolor</button>
          <button class="mobile-tool ${exercise.skipped?"active":""}" onclick="skipExercise(${activeWorkoutExerciseIndex})">Saltar</button>
        </div>
        <textarea class="field mobile-workout-note" placeholder="¿Cómo te sentiste en este ejercicio?" onchange="updateNote(${activeWorkoutExerciseIndex},this.value)">${exercise.note||""}</textarea>
        <div class="exercise-navigation">
          <button class="btn btn-secondary" onclick="moveWorkoutExercise(-1)" ${activeWorkoutExerciseIndex===0?"disabled":""}><svg><use href="#i-left"/></svg></button>
          <button class="btn btn-soft" onclick="startMobileRest(${exercise.rest||90})"><svg><use href="#i-clock"/></svg>Descanso</button>
          <button class="btn btn-secondary" onclick="moveWorkoutExercise(1)" ${activeWorkoutExerciseIndex===exercises.length-1?"disabled":""}><svg><use href="#i-right"/></svg></button>
        </div>
      </article>
    `;
  };

  window.selectWorkoutExercise=function(index){
    activeWorkoutExerciseIndex=index;renderWorkout();scrollTo({top:0,behavior:"smooth"})
  };
  window.moveWorkoutExercise=function(direction){
    selectWorkoutExercise(activeWorkoutExerciseIndex+direction)
  };

  // Override old timer with a clean mobile timer.
  function ensureMobileTimer(){
    let timer=document.getElementById("mobileRestTimer");
    if(timer)return timer;
    document.body.insertAdjacentHTML("beforeend",`
      <div class="mobile-timer" id="mobileRestTimer">
        <div class="mobile-timer-ring" id="mobileTimerRing"><strong id="mobileTimerText">01:30</strong></div>
        <div class="mobile-timer-copy"><strong>Tiempo de descanso</strong><span id="mobileTimerSubtitle">Recuperate para la próxima serie</span></div>
        <button class="mobile-timer-action" onclick="adjustMobileTimer(15)">+15</button>
        <button class="mobile-timer-action" onclick="closeMobileTimer()">×</button>
      </div>`);
    return document.getElementById("mobileRestTimer")
  }
  function updateMobileTimer(){
    const timer=ensureMobileTimer();
    const text=document.getElementById("mobileTimerText");
    text.textContent=`${String(Math.floor(timerSeconds/60)).padStart(2,"0")}:${String(Math.max(0,timerSeconds%60)).padStart(2,"0")}`;
    document.getElementById("mobileTimerRing").style.setProperty("--timer-progress",Math.max(0,timerSeconds)/Math.max(1,mobileTimerTotal))
  }
  window.startMobileRest=function(seconds){
    clearInterval(timerId);mobileTimerTotal=seconds;timerSeconds=seconds;
    ensureMobileTimer().classList.add("show");updateMobileTimer();
    timerId=setInterval(()=>{
      timerSeconds--;updateMobileTimer();
      if(timerSeconds<=0){
        clearInterval(timerId);ensureMobileTimer().classList.remove("show");
        navigator.vibrate?.([180,90,180]);toast("Descanso terminado")
      }
    },1000)
  };
  window.adjustMobileTimer=function(seconds){timerSeconds=Math.max(0,timerSeconds+seconds);mobileTimerTotal=Math.max(mobileTimerTotal,timerSeconds);updateMobileTimer()};
  window.closeMobileTimer=function(){clearInterval(timerId);ensureMobileTimer().classList.remove("show")};

  // Existing set completion now starts the redesigned timer.
  const originalToggleSet=window.toggleSet;
  window.toggleSet=function(exerciseIndex,setIndex){
    const session=getSession(),exercise=session?.exercises[exerciseIndex],set=exercise?.sets[setIndex];
    if(!set)return;
    const wasDone=set.done;
    set.done=!set.done;
    if(set.done&&!set.reps)set.reps=exercise.minReps;
    save();
    if(!wasDone&&set.done)startMobileRest(exercise.rest||90);
    renderWorkout();renderHome();renderCalendar()
  };

  renderCalendar=function(){
    const y=currentMonth.getFullYear(),m=currentMonth.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7;
    document.getElementById("calendarTitle").textContent=currentMonth.toLocaleDateString("es-AR",{month:"long",year:"numeric"});
    const sessionsByDate=new Map((data.sessions||[]).map(session=>[session.date,session]));
    const cells=[];
    for(let i=0;i<42;i++){
      const d=new Date(y,m,1-offset+i),date=iso(d),session=sessionsByDate.get(date),outside=d.getMonth()!==m;
      const routine=(data.routine||[]).find(day=>day.day===d.getDay());
      let state="";
      if(session?.status==="completed")state="completed";
      else if(session?.status==="partial"||session?.status==="in_progress")state="partial";
      else if(session?.status==="skipped")state="skipped";
      else if(routine?.mode==="rest")state="rest";
      cells.push(`<button class="day ${state} ${date===iso()?"today":""}" style="${outside?"opacity:.32":""}" onclick="openDayDetail('${date}')"><span class="day-number">${d.getDate()}</span><span class="day-dot"></span></button>`)
    }
    document.getElementById("calendarGrid").innerHTML=cells.join("");
    const key=`${y}-${String(m+1).padStart(2,"0")}`,sessions=(data.sessions||[]).filter(session=>session.date?.startsWith(key));
    const completed=sessions.filter(session=>session.status==="completed").length,vol=sessions.reduce((a,session)=>a+volume(session),0);
    document.getElementById("monthMetrics").innerHTML=[["Entrenamientos",sessions.length],["Completados",completed],["Cumplimiento",`${sessions.length?Math.round(completed/sessions.length*100):0}%`],["Volumen",`${fmt(vol)} kg`]].map(item=>`<div class="report-metric"><span>${item[0]}</span><strong>${item[1]}</strong></div>`).join("")
  };

  renderCloudOnlyNote();
  renderCalendar();
  if(getSession())renderWorkout();
})();
