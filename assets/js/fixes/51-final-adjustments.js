(() => {
  "use strict";

  // No mostrar mensajes emergentes en ninguna acción.
  toast = function(){};

  function silentButton(button,state,text){
    if(!button)return;
    if(!button.dataset.baseHtml)button.dataset.baseHtml=button.innerHTML;
    button.classList.remove("saving","saved","failed");
    button.classList.add("inline-save-state");
    if(state==="saving"){
      button.classList.add("saving");
      button.disabled=true;
      button.textContent=text||"Guardando...";
      return;
    }
    button.disabled=false;
    if(state==="saved"){
      button.classList.add("saved");
      button.textContent=text||"Guardado";
      setTimeout(()=>{
        button.classList.remove("saved");
        button.innerHTML=button.dataset.baseHtml;
      },850);
    }else if(state==="failed"){
      button.classList.add("failed");
      button.textContent=text||"Error al guardar";
      setTimeout(()=>{
        button.classList.remove("failed");
        button.innerHTML=button.dataset.baseHtml;
      },1300);
    }else{
      button.innerHTML=button.dataset.baseHtml;
    }
  }

  async function saveSilently(button,successLabel="Guardado"){
    silentButton(button,"saving");
    try{
      // save() marca el estado como pendiente usando el sincronizador central.
      // Luego forzamos y esperamos la confirmación real de Supabase.
      save();
      await syncAllToCloud(false);
      silentButton(button,"saved",successLabel);
      return true;
    }catch(error){
      console.error("Error guardando en Supabase:",error);
      silentButton(button,"failed","No se guardó");
      return false;
    }
  }

  // ---------------------------------------------------------
  // RIR: desaparece del editor y de toda la visualización.
  // ---------------------------------------------------------
  renderRoutineEditor = function(){
    const routine=data.routine[editingRoutine];
    const editor=document.getElementById("routineEditor");
    editor.innerHTML=(routine.exercises||[]).map((exercise,index)=>`
      <div class="spark-card routine-exercise-editor" data-exercise-index="${index}" style="margin-bottom:8px">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label>Ejercicio</label>
            <input class="field" data-field="name" value="${exercise.name||""}">
          </div>
          <div class="form-group">
            <label>Series</label>
            <input class="field" data-field="sets" type="number" min="1" value="${exercise.sets||1}">
          </div>
          <div class="form-group">
            <label>Peso sugerido (kg)</label>
            <input class="field" data-field="weight" type="number" step=".5" value="${exercise.weight||0}">
          </div>
          <div class="form-group">
            <label>Repeticiones mínimas</label>
            <input class="field" data-field="minReps" type="number" min="1" value="${exercise.minReps||1}">
          </div>
          <div class="form-group">
            <label>Repeticiones máximas</label>
            <input class="field" data-field="maxReps" type="number" min="1" value="${exercise.maxReps||1}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Descanso entre series (segundos)</label>
            <input class="field" data-field="rest" type="number" min="15" step="5" value="${exercise.rest||90}">
          </div>
        </div>
        <button class="btn btn-danger" onclick="deleteRoutineExercise(${index})" style="width:100%;margin-top:8px">Eliminar ejercicio</button>
      </div>
    `).join("");
  };

  function readRoutineEditor(){
    const routine=data.routine[editingRoutine];
    document.querySelectorAll("#routineEditor .routine-exercise-editor").forEach(card=>{
      const index=Number(card.dataset.exerciseIndex);
      const exercise=routine.exercises[index];
      if(!exercise)return;
      const value=field=>card.querySelector(`[data-field="${field}"]`)?.value;
      exercise.name=(value("name")||exercise.name).trim();
      exercise.sets=Math.max(1,Number(value("sets"))||1);
      exercise.weight=Math.max(0,Number(value("weight"))||0);
      exercise.minReps=Math.max(1,Number(value("minReps"))||1);
      exercise.maxReps=Math.max(exercise.minReps,Number(value("maxReps"))||exercise.minReps);
      exercise.rest=Math.max(15,Number(value("rest"))||90);
      delete exercise.rir;
    });
    (routine.exercises||[]).forEach(exercise=>delete exercise.rir);
  }

  const routineSave=document.getElementById("saveRoutineBtn");
  if(routineSave){
    routineSave.onclick=async()=>{
      if(editingRoutine<0||!data.routine[editingRoutine]){
        silentButton(routineSave,"failed","Día inválido");
        return;
      }
      const routine=data.routine[editingRoutine];
      const routineBackup=typeof structuredClone==="function"
        ?structuredClone(routine)
        :JSON.parse(JSON.stringify(routine));
      readRoutineEditor();
      routine.name=document.getElementById("routineName").value.trim()||routine.name;
      routine.muscle=document.getElementById("routineMuscle").value.trim()||routine.muscle;
      routine.mode=document.querySelector("[data-pro-day-mode].active")?.dataset.proDayMode||routine.mode||"training";
      routine.cardio=routine.cardio||[];
      const time=document.getElementById("routineWorkoutTime");
      if(time)routine.workoutTime=time.value||routine.workoutTime||"18:30";
      const ok=await saveSilently(routineSave,"Rutina guardada");
      if(ok){
        renderRoutine();
        renderHome();
        closeModal("routineModal");
      }else{
        data.routine[editingRoutine]=routineBackup;
        renderRoutineEditor();
      }
    };
  }

  // Limpiar RIR de textos que todavía pudieran generarse.
  function stripRirText(root=document){
    root.querySelectorAll(".mobile-exercise-meta,.row-sub,.coach-text").forEach(element=>{
      element.textContent=element.textContent
        .replace(/\s*·?\s*RIR\s*\d+/gi,"")
        .replace(/\s+y RIR\.?/gi,".");
    });
    root.querySelectorAll('label').forEach(label=>{
      if(label.textContent.trim().toUpperCase()==="RIR"){
        label.closest(".form-group")?.remove();
      }
    });
  }
  const originalRenderWorkoutNoRir=renderWorkout;
  renderWorkout=function(){
    originalRenderWorkoutNoRir();
    stripRirText(document.getElementById("workoutPage"));
  };
  const originalRenderHomeNoRir=renderHome;
  renderHome=function(){
    originalRenderHomeNoRir();
    stripRirText(document.getElementById("homePage"));
  };

  // ---------------------------------------------------------
  // Biblioteca: antes de agregar, elegir momento y horario.
  // ---------------------------------------------------------
  let pendingLibraryMealId=null;
  let finalLibraryMealSlot="Desayuno";
  let finalEditingSavedMealId=null;

  if(!document.getElementById("libraryAddOptionsModal")){
    document.body.insertAdjacentHTML("beforeend",`
      <div class="modal" id="libraryAddOptionsModal">
        <div class="sheet">
          <div class="sheet-head">
            <div>
              <div class="sheet-title">Agregar plato guardado</div>
              <div class="caption">Elegí dónde y cuándo lo consumiste</div>
            </div>
            <button class="icon-button" data-close="libraryAddOptionsModal"><svg><use href="#i-x"/></svg></button>
          </div>
          <div class="library-add-summary" id="libraryAddSummary"></div>
          <div class="form-grid">
            <div class="form-group">
              <label>Parte del día</label>
              <select class="field" id="libraryMealType"></select>
            </div>
            <div class="form-group">
              <label>Hora en que lo ingeriste</label>
              <input class="field" id="libraryMealTime" type="time">
            </div>
          </div>
          <button class="btn btn-primary" id="confirmLibraryMealBtn" style="width:100%;margin-top:10px">Agregar al día</button>
        </div>
      </div>
    `);
    document.querySelectorAll('[data-close="libraryAddOptionsModal"]').forEach(button=>{
      button.onclick=()=>closeModal("libraryAddOptionsModal");
    });
  }

  function openLibraryOptions(id){
    const item=(data.savedMeals||[]).find(meal=>meal.id===id);
    if(!item)return;
    pendingLibraryMealId=id;
    const type=document.getElementById("libraryMealType");
    const slots=window.PRIME_MEAL_SLOTS||[
      {type:"Desayuno"},{type:"Colación mañana"},{type:"Almuerzo"},
      {type:"Colación tarde"},{type:"Merienda"},{type:"Colación noche"},{type:"Cena"}
    ];
    type.innerHTML=slots.map(slot=>`<option ${slot.type===(finalLibraryMealSlot||item.defaultType)?"selected":""}>${slot.type}</option>`).join("");
    document.getElementById("libraryMealTime").value=new Date().toTimeString().slice(0,5);
    document.getElementById("libraryAddSummary").innerHTML=`
      <strong>${item.name}</strong>
      <span>${Math.round(item.calories)} kcal · ${item.protein} g proteínas · ${item.carbs} g carbohidratos · ${item.fat} g grasas</span>
    `;
    openModal("libraryAddOptionsModal");
  }

  document.addEventListener("click",event=>{
    const slotButton=event.target.closest("[data-lib-slot]");
    if(slotButton)finalLibraryMealSlot=slotButton.dataset.libSlot||"Desayuno";
  },true);

  document.addEventListener("click",event=>{
    const editButton=event.target.closest("[data-edit-saved]");
    if(editButton){
      const item=(data.savedMeals||[]).find(meal=>meal.id===editButton.dataset.editSaved);
      if(item){
        finalEditingSavedMealId=item.id;
        document.getElementById("savedMealProName").value=item.name||"";
        document.getElementById("savedMealProCalories").value=item.calories||0;
        document.getElementById("savedMealProProtein").value=item.protein||0;
        document.getElementById("savedMealProCarbs").value=item.carbs||0;
        document.getElementById("savedMealProFat").value=item.fat||0;
        const select=document.getElementById("savedMealProType");
        if(select)select.value=item.defaultType||"Desayuno";
      }
    }
  },true);

  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-use-saved]");
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openLibraryOptions(button.dataset.useSaved);
  },true);

  const confirmLibrary=document.getElementById("confirmLibraryMealBtn");
  confirmLibrary.onclick=async()=>{
    const item=(data.savedMeals||[]).find(meal=>meal.id===pendingLibraryMealId);
    if(!item)return;
    const meal={
      id:crypto.randomUUID?.()||String(Date.now()),
      date:iso(nutritionDate),
      type:document.getElementById("libraryMealType").value,
      time:document.getElementById("libraryMealTime").value,
      description:item.name,
      normalizedName:item.name,
      calories:Number(item.calories)||0,
      protein:Number(item.protein)||0,
      carbs:Number(item.carbs)||0,
      fat:Number(item.fat)||0,
      fiber:item.fiber??null,
      confidence:"high",
      confidencePercent:100,
      source:"saved_meal",
      items:item.items||[],
      assumptions:[]
    };
    data.meals=data.meals||[];
    data.meals.push(meal);
    const ok=await saveSilently(confirmLibrary,"Agregado");
    if(ok){
      closeModal("libraryAddOptionsModal");
      closeModal("mealLibraryProModal");
      renderNutrition();
      renderHome();
    }else{
      data.meals=data.meals.filter(saved=>saved.id!==meal.id);
      renderNutrition();
    }
  };

  // ---------------------------------------------------------
  // Calendario: entrenamiento + comidas y macros del día.
  // ---------------------------------------------------------
  window.openDayDetail=function(date){
    const session=getSession(date);
    const meals=(data.meals||[])
      .filter(meal=>meal.date===date)
      .sort((a,b)=>(a.time||"").localeCompare(b.time||""));
    const totals=meals.reduce((sum,meal)=>({
      calories:sum.calories+(Number(meal.calories)||0),
      protein:sum.protein+(Number(meal.protein)||0),
      carbs:sum.carbs+(Number(meal.carbs)||0),
      fat:sum.fat+(Number(meal.fat)||0)
    }),{calories:0,protein:0,carbs:0,fat:0});

    document.getElementById("calendarDetailTitle").textContent=
      new Date(date+"T12:00:00").toLocaleDateString("es-AR",{
        weekday:"long",day:"numeric",month:"long"
      });

    const workoutHtml=session?`
      <div class="calendar-section-title"><svg><use href="#i-dumbbell"/></svg>ENTRENAMIENTO</div>
      <div class="report-grid">
        <div class="report-metric"><span>Estado</span><strong>${({completed:"Completado",partial:"Parcial",skipped:"No fui",in_progress:"En curso"})[session.status]||session.status}</strong></div>
        <div class="report-metric"><span>Ejercicios</span><strong>${(session.exercises||[]).length}</strong></div>
        <div class="report-metric"><span>Series</span><strong>${(session.exercises||[]).reduce((total,exercise)=>total+(exercise.sets||[]).filter(set=>set.done).length,0)}</strong></div>
        <div class="report-metric"><span>Volumen</span><strong>${fmt(volume(session))} kg</strong></div>
      </div>
      <div class="list" style="margin-top:10px">
        ${(session.exercises||[]).map(exercise=>`
          <div class="list-row">
            <div>
              <div class="row-title">${exercise.name}</div>
              <div class="row-sub">${(exercise.sets||[]).filter(set=>set.done).map(set=>`${set.weight}×${set.reps}`).join(" · ")||"Sin series completadas"}</div>
            </div>
          </div>`).join("")}
      </div>
    `:`<div class="calendar-section-title"><svg><use href="#i-dumbbell"/></svg>ENTRENAMIENTO</div><div class="empty">No hay entrenamiento registrado.</div>`;

    const foodHtml=`
      <div class="calendar-section-title"><svg><use href="#i-food"/></svg>ALIMENTACIÓN</div>
      ${meals.length?`
        <div class="calendar-day-total">
          <div><span>Calorías</span><strong>${Math.round(totals.calories)} kcal</strong></div>
          <div><span>Proteínas</span><strong>${Math.round(totals.protein)} g</strong></div>
          <div><span>Carbohidratos</span><strong>${Math.round(totals.carbs)} g</strong></div>
          <div><span>Grasas</span><strong>${Math.round(totals.fat)} g</strong></div>
        </div>
        <div style="margin-top:9px">
          ${meals.map(meal=>`
            <div class="calendar-meal-row">
              <div class="calendar-meal-main">
                <strong>${meal.type} · ${meal.time||"Sin hora"}</strong>
                <span>${meal.normalizedName||meal.description}</span>
                <div class="calendar-macro-pills">
                  <i class="calendar-macro-pill">${Math.round(Number(meal.calories)||0)} kcal</i>
                  <i class="calendar-macro-pill">${Number(meal.protein)||0} g P</i>
                  <i class="calendar-macro-pill">${Number(meal.carbs)||0} g C</i>
                  <i class="calendar-macro-pill">${Number(meal.fat)||0} g G</i>
                </div>
              </div>
            </div>`).join("")}
        </div>
      `:`<div class="empty">No hay comidas registradas.</div>`}
    `;

    document.getElementById("calendarDetailContent").innerHTML=workoutHtml+foodHtml;
    openModal("calendarDetailModal");
  };

  // ---------------------------------------------------------
  // Ajustes útiles finales.
  // ---------------------------------------------------------

  // Al modificar alimentación, refrescar preparación nutricional y calendario.
  const originalRenderNutritionFinal=renderNutrition;
  renderNutrition=function(){
    originalRenderNutritionFinal();
    if(typeof renderPreWorkoutCard==="function")renderPreWorkoutCard();
  };

  // Actualización al volver a la pestaña, sin sobrescribir cambios pendientes.
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&!cloudSyncing){
      loadAllFromCloud(false);
    }
  });

  // Eliminar cualquier dato RIR antiguo al próximo guardado.
  (data.routine||[]).forEach(routine=>{
    (routine.exercises||[]).forEach(exercise=>delete exercise.rir);
  });
  (data.sessions||[]).forEach(session=>{
    (session.exercises||[]).forEach(exercise=>{
      delete exercise.rirTarget;
      (exercise.sets||[]).forEach(set=>delete set.rir);
    });
  });

  stripRirText();
  repairMealNutritionTotals();
renderAll();
})();
