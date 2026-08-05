(() => {
  "use strict";
  const MEAL_SLOTS = window.PRIME_MEAL_SLOTS || [
    {type:"Desayuno",label:"Desayuno",required:true},
    {type:"Colación mañana",label:"Colación de media mañana",required:false},
    {type:"Almuerzo",label:"Almuerzo",required:true},
    {type:"Colación tarde",label:"Colación de la tarde",required:false},
    {type:"Merienda",label:"Merienda",required:true},
    {type:"Colación noche",label:"Colación nocturna",required:false},
    {type:"Cena",label:"Cena",required:true}
  ];
  const REQUIRED_MEALS = window.PRIME_REQUIRED_MEALS || ["Desayuno","Almuerzo","Merienda","Cena"];
  window.PRIME_MEAL_SLOTS = MEAL_SLOTS;
  window.PRIME_REQUIRED_MEALS = REQUIRED_MEALS;


  function ensureWorkoutTimes(){
    const defaults={1:"18:30",2:"18:30",3:"18:30",4:"18:30",5:"18:30",6:"11:00",0:"11:00"};
    (data.routine||[]).forEach(day=>{
      if(!day.workoutTime)day.workoutTime=defaults[day.day]||"18:30";
    });
  }

  function addWorkoutTimeField(){
    const modal=document.getElementById("routineModal");
    if(!modal||document.getElementById("routineWorkoutTime"))return;
    const grid=modal.querySelector(".form-grid");
    if(!grid)return;
    grid.insertAdjacentHTML("beforeend",`
      <div class="form-group">
        <label>Horario habitual de entrenamiento</label>
        <input class="field" id="routineWorkoutTime" type="time">
      </div>
    `);
    const input=document.getElementById("routineWorkoutTime");
    input.addEventListener("input",()=>{
      if(Number.isInteger(editingRoutine)&&data.routine[editingRoutine]){
        data.routine[editingRoutine].workoutTime=input.value;
      }
    });
    document.addEventListener("click",event=>{
      const edit=event.target.closest("[data-edit-day]");
      if(!edit)return;
      setTimeout(()=>{
        const routine=data.routine[+edit.dataset.editDay];
        input.value=routine?.workoutTime||"18:30";
      },0);
    },true);
  }

  function parseMinutes(value){
    if(!value||!value.includes(":"))return null;
    const [h,m]=value.split(":").map(Number);
    return h*60+m;
  }
  function mealMinute(meal){
    const parsed=parseMinutes(meal.time);
    return parsed===null?0:parsed;
  }

  function preWorkoutReadiness(){
    const routine=todayRoutine();
    if(!routine||routine.mode==="rest"){
      return{status:"rest",color:"#94a3b8",label:"Día de descanso",score:100,message:"Hoy no tenés un entrenamiento programado.",carbs:0,protein:0,lastMeal:null,hours:null}
    }
    const workoutMinute=parseMinutes(routine.workoutTime||"18:30");
    const now=new Date(),nowMinute=now.getHours()*60+now.getMinutes();
    const reference=workoutMinute??nowMinute;
    const meals=mealsForDate(iso()).filter(m=>mealMinute(m)<=reference);
    const recent=meals.filter(m=>reference-mealMinute(m)<=240&&reference-mealMinute(m)>=0);
    const carbs=recent.reduce((a,m)=>a+(+m.carbs||0),0);
    const protein=recent.reduce((a,m)=>a+(+m.protein||0),0);
    const body=latestBody()||{},weight=+body.weight||70.4;
    const carbTarget=Math.max(25,Math.round(weight*.55));
    const proteinTarget=Math.max(18,Math.round(weight*.27));
    const last=meals.slice().sort((a,b)=>mealMinute(b)-mealMinute(a))[0]||null;
    const hours=last?(reference-mealMinute(last))/60:null;
    const carbRatio=carbs/carbTarget,proteinRatio=protein/proteinTarget;
    let status="green",color="#22c55e",label="Listo para entrenar",score=Math.round(Math.min(1,(carbRatio*.65+proteinRatio*.35))*100),message="";
    if(!last||hours>5||carbRatio<.4){
      status="red";color="#ef4444";label="Combustible insuficiente";
      const missing=Math.max(0,carbTarget-Math.round(carbs));
      message=`Te convendría sumar aproximadamente ${missing} g de carbohidratos y una fuente de proteína antes de entrenar.`;
    }else if(carbRatio<.8||proteinRatio<.65||hours>3.5){
      status="yellow";color="#f59e0b";label="Podrías llegar mejor";
      const missingC=Math.max(0,carbTarget-Math.round(carbs)),missingP=Math.max(0,proteinTarget-Math.round(protein));
      message=`Sumaría ${missingC?`${missingC} g de carbohidratos`:"algo de energía rápida"}${missingP?` y cerca de ${missingP} g de proteína`:""} antes del entrenamiento.`;
    }else{
      message=`Tus comidas previas aportan una base adecuada de carbohidratos y proteína para este entrenamiento.`;
    }
    return{status,color,label,score,message,carbs:Math.round(carbs),protein:Math.round(protein),carbTarget,proteinTarget,lastMeal:last,hours,workoutTime:routine.workoutTime||"18:30"}
  }

  function renderPreWorkoutCard(){
    const todayCard=document.querySelector(".today-card");
    if(!todayCard)return;
    let card=document.getElementById("preWorkoutReadinessCard");
    if(!card){
      card=document.createElement("div");
      card.id="preWorkoutReadinessCard";
      card.className="preworkout-card";
      const actions=todayCard.querySelector(".actions");
      todayCard.insertBefore(card,actions);
    }
    const r=preWorkoutReadiness();
    card.style.setProperty("--ready-color",r.color);
    card.innerHTML=`
      <div class="preworkout-head">
        <div>
          <div class="row-title">Preparación nutricional</div>
          <div class="row-sub">${r.workoutTime?`Entrenamiento previsto: ${r.workoutTime}`:"Evaluación de hoy"}</div>
        </div>
        <span class="readiness-badge"><i class="readiness-dot"></i>${r.label}</span>
      </div>
      ${r.status==="rest"?`<div class="preworkout-suggestion">${r.message}</div>`:`
      <div class="preworkout-grid">
        <div class="preworkout-metric"><span>Carbohidratos previos</span><strong>${r.carbs} / ${r.carbTarget} g</strong></div>
        <div class="preworkout-metric"><span>Proteína previa</span><strong>${r.protein} / ${r.proteinTarget} g</strong></div>
        <div class="preworkout-metric"><span>Última comida</span><strong>${r.lastMeal?(r.hours<1?`${Math.round(r.hours*60)} min`:`${r.hours.toFixed(1)} h`):"Sin registro"}</strong></div>
      </div>
      <div class="preworkout-suggestion">${r.message}</div>`}
    `;
  }

  function remainingMealGuidance(slotType){
    const targets=nutritionTargets(),totals=nutritionTotals(),meals=mealsForDate();
    const remaining={
      calories:Math.max(0,targets.calories-totals.calories),
      protein:Math.max(0,targets.protein-totals.protein),
      carbs:Math.max(0,targets.carbs-totals.carbs),
      fat:Math.max(0,targets.fat-totals.fat)
    };
    const slotIndex=MEAL_SLOTS.findIndex(s=>s.type===slotType);
    const futureRequired=REQUIRED_MEALS.filter(type=>{
      const index=MEAL_SLOTS.findIndex(s=>s.type===type);
      return index>=slotIndex&&!meals.some(m=>m.type===type)
    }).length||1;
    const protein=Math.round(remaining.protein/futureRequired);
    const carbs=Math.round(remaining.carbs/futureRequired);
    const calories=Math.round(remaining.calories/futureRequired);
    const priorities=[
      {name:"proteína",value:remaining.protein/Math.max(1,targets.protein)},
      {name:"carbohidratos",value:remaining.carbs/Math.max(1,targets.carbs)},
      {name:"grasas",value:remaining.fat/Math.max(1,targets.fat)}
    ].sort((a,b)=>b.value-a.value);
    return{
      text:`Para acercarte al objetivo del día, apuntaría aproximadamente a ${calories} kcal, ${protein} g de proteína y ${carbs} g de carbohidratos en esta comida.`,
      priority:`La prioridad actual es ${priorities[0].name}.`,
      calories,protein,carbs
    };
  }

  function enhanceTimelineGuidance(){
    document.querySelectorAll(".timeline-slot").forEach((slot,index)=>{
      const type=MEAL_SLOTS[index]?.type;
      if(!type||slot.querySelector(".meal-guidance"))return;
      const guidance=remainingMealGuidance(type);
      const meals=slot.querySelector(".slot-meals");
      if(meals)meals.insertAdjacentHTML("beforebegin",`<div class="meal-guidance">${guidance.priority} ${guidance.text}</div>`);
    });
  }

  function addComposerGuidance(){
    const textarea=document.getElementById("mealDescriptionPro");
    if(!textarea||document.getElementById("composerMealGuidance"))return;
    textarea.insertAdjacentHTML("beforebegin",`<div class="composer-guidance" id="composerMealGuidance"></div>`);
  }

  function updateComposerGuidance(){
    const box=document.getElementById("composerMealGuidance");
    if(!box)return;
    const type=document.getElementById("mealTypePro")?.value||"Desayuno";
    const guidance=remainingMealGuidance(type);
    box.innerHTML=`<div class="row-title">Guía inteligente para ${type.toLowerCase()}</div><div class="row-sub">${guidance.priority} ${guidance.text}</div>`;
  }

  const originalRenderHomeV3=renderHome;
  renderHome=function(){
    originalRenderHomeV3();
    renderPreWorkoutCard();
  };

  const originalRenderNutritionV3=renderNutrition;
  renderNutrition=function(){
    originalRenderNutritionV3();
    enhanceTimelineGuidance();
  };

  document.addEventListener("click",event=>{
    const add=event.target.closest("[data-add-slot]");
    if(add)setTimeout(updateComposerGuidance,0);
  },true);
  document.addEventListener("change",event=>{
    if(event.target?.id==="mealTypePro")updateComposerGuidance();
  });

  // Helpers consumed by the realtime intelligence add-on.
  window.renderPreWorkoutCard=renderPreWorkoutCard;
  window.preWorkoutReadiness=preWorkoutReadiness;
  window.enhanceTimelineGuidance=enhanceTimelineGuidance;

  ensureWorkoutTimes();
  addWorkoutTimeField();
  addComposerGuidance();
  renderAll();
})();
