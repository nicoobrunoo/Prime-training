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


  function readinessContext(){
    const routine=todayRoutine(),body=latestBody()||{},local=preWorkoutReadiness();
    return{
      date:iso(),
      current_time:new Date().toTimeString().slice(0,5),
      workout:{
        scheduled_time:routine?.workoutTime||null,
        mode:routine?.mode||"rest",
        muscle_group:routine?.muscle||null,
        estimated_duration:estimateRoutine(routine).duration
      },
      body:{weight_kg:+body.weight||70.4,height_cm:+body.height||184},
      local_readiness:local,
      meals:mealsForDate(iso()).map(m=>({time:m.time,type:m.type,description:m.description,calories:m.calories,protein_g:m.protein,carbs_g:m.carbs,fat_g:m.fat})),
      daily_targets:nutritionTargets(),
      daily_totals:nutritionTotals(iso())
    }
  }

  async function requestPreWorkoutAI(){
    const button=document.getElementById("preWorkoutAIButton");
    if(button){button.disabled=true;button.textContent="Analizando..."}
    try{
      const result=await callSmartHandler({action:"preworkout_readiness",context:readinessContext()});
      data.aiInsights.preworkout=data.aiInsights.preworkout||{};
      data.aiInsights.preworkout[iso()]=result.readiness;
      save();renderHome();toast("Preparación analizada con IA");
    }catch(error){toast(error.message||"No se pudo analizar la preparación")}finally{
      if(button){button.disabled=false;button.textContent="Refinar con IA"}
    }
  }

  const originalRenderPreWorkout=window.renderPreWorkoutCard||function(){};
  window.renderPreWorkoutCard=function(){
    originalRenderPreWorkout();
    const card=document.getElementById("preWorkoutReadinessCard");if(!card)return;
    const ai=data.aiInsights?.preworkout?.[iso()];
    const suggestion=card.querySelector(".preworkout-suggestion");
    if(ai&&suggestion){
      suggestion.innerHTML=`<strong>${ai.headline||"Análisis IA"}:</strong> ${ai.reason||""}${ai.recommendations?.length?`<br><span class="row-sub">${ai.recommendations.map(r=>r.option).join(" · ")}</span>`:""}`;
      card.style.setProperty("--ready-color",ai.status==="green"?"#22c55e":ai.status==="red"?"#ef4444":"#f59e0b");
    }
    if(!document.getElementById("preWorkoutAIButton")){
      card.insertAdjacentHTML("beforeend",`<button class="slot-action" id="preWorkoutAIButton" style="margin-top:10px">Refinar con IA</button>`);
      document.getElementById("preWorkoutAIButton").onclick=requestPreWorkoutAI;
    }
  };

  async function requestNextMealAI(slotType){
    const key=`${iso(nutritionDate)}:${slotType}`;
    const local=remainingMealGuidance(slotType);
    try{
      const result=await callSmartHandler({
        action:"next_meal_guidance",
        context:{
          date:iso(nutritionDate),
          current_time:new Date().toTimeString().slice(0,5),
          next_meal:slotType,
          targets:nutritionTargets(),
          totals:nutritionTotals(),
          remaining:local,
          meals:mealsForDate().map(m=>({type:m.type,time:m.time,description:m.description,calories:m.calories,protein_g:m.protein,carbs_g:m.carbs,fat_g:m.fat})),
          workout:todayRoutine()?{time:todayRoutine().workoutTime,mode:todayRoutine().mode,muscle:todayRoutine().muscle}:null
        }
      });
      data.aiInsights.nextMeal=data.aiInsights.nextMeal||{};
      data.aiInsights.nextMeal[key]=result.guidance;save();renderNutrition();toast("Guía de comida actualizada");
    }catch(error){toast(error.message||"No se pudo generar la guía")}
  }

  const originalEnhanceTimeline=window.enhanceTimelineGuidance||function(){};
  window.enhanceTimelineGuidance=function(){
    originalEnhanceTimeline();
    document.querySelectorAll(".timeline-slot").forEach((slot,index)=>{
      const type=MEAL_SLOTS[index]?.type,box=slot.querySelector(".meal-guidance");if(!type||!box)return;
      const stored=data.aiInsights?.nextMeal?.[`${iso(nutritionDate)}:${type}`];
      if(stored)box.innerHTML=`<strong>${stored.headline||"Guía IA"}:</strong> ${stored.summary||""}${stored.target_for_meal?` Objetivo aproximado: ${stored.target_for_meal.calories} kcal, ${stored.target_for_meal.protein_g} g proteína y ${stored.target_for_meal.carbs_g} g carbohidratos.`:""}`;
      if(!box.querySelector("button")){
        box.insertAdjacentHTML("beforeend",`<br><button class="slot-action" data-next-meal-ai="${type}" style="margin-top:7px">Mejorar con IA</button>`);
      }
    });
    document.querySelectorAll("[data-next-meal-ai]").forEach(btn=>btn.onclick=()=>requestNextMealAI(btn.dataset.nextMealAi));
  };

  renderAll();
})();
