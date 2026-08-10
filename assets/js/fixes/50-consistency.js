(() => {
  "use strict";

  let finalDirty = false;
  let finalWritePromise = null;
  let finalWriteQueued = false;
  let finalMutationRevision = Date.now();
  let finalCommittedRevision = 0;
  let finalRemoteRevision = 0;
  let finalStatusTimer = null;

  function cloneFinal(value){
    return typeof structuredClone==="function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function operationStatus(text,type="working",duration=1800){
    let box=document.getElementById("finalSyncOperation");
    if(!box){
      document.body.insertAdjacentHTML("beforeend",
        '<div class="sync-operation" id="finalSyncOperation"><i></i><span></span></div>');
      box=document.getElementById("finalSyncOperation");
    }
    clearTimeout(finalStatusTimer);
    box.className=`sync-operation show ${type==="working"?"":type}`;
    box.querySelector("span").textContent=text;
    if(type!=="working"){
      finalStatusTimer=setTimeout(()=>box.classList.remove("show"),duration);
    }
  }

  function setButtonState(button,state,label){
    if(!button)return;
    if(!button.dataset.originalHtml)button.dataset.originalHtml=button.innerHTML;
    button.classList.remove("action-saving","action-success","action-error");
    if(state==="saving"){
      button.disabled=true;button.classList.add("action-saving");
      if(label)button.setAttribute("aria-label",label);
    }else if(state==="success"){
      button.disabled=false;button.classList.add("action-success");
      button.innerHTML=label||"✓ Guardado";
      setTimeout(()=>{
        button.classList.remove("action-success");
        button.innerHTML=button.dataset.originalHtml||button.innerHTML;
      },1100);
    }else if(state==="error"){
      button.disabled=false;button.classList.add("action-error");
      setTimeout(()=>button.classList.remove("action-error"),650);
    }else{
      button.disabled=false;
      button.innerHTML=button.dataset.originalHtml||button.innerHTML;
    }
  }

  const originalSharedPayloadFinal = sharedPayload;
  sharedPayload = function(){
    const payload=originalSharedPayloadFinal();
    payload.revision=finalMutationRevision;
    payload.client_saved_at=new Date().toISOString();
    return payload;
  };

  queueCloudSync = function(){
    if(!sharedStateReady)return;
    finalDirty=true;
    finalMutationRevision=Math.max(Date.now(),finalMutationRevision+1);
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer=setTimeout(()=>syncAllToCloud(false),180);
  };

  syncAllToCloud = async function(showToast=true){
    if(!sharedStateReady)throw new Error("Supabase todavía no terminó de cargar");
    if(finalWritePromise){
      finalWriteQueued=true;
      return finalWritePromise;
    }

    clearTimeout(cloudSyncTimer);
    const revision=finalMutationRevision;
    const snapshot={
      id:SHARED_STATE_ID,
      state:cloneFinal(sharedPayload()),
      updated_at:new Date().toISOString()
    };

    finalWritePromise=(async()=>{
      cloudSyncing=true;
      operationStatus("Guardando en Supabase...");
      updateCloudStatus("syncing","Guardando...","Confirmando los cambios en la base");
      try{
        const {data:row,error}=await sb
          .from("prime_shared_state")
          .upsert(snapshot,{onConflict:"id"})
          .select("state,updated_at")
          .single();
        if(error)throw error;

        finalCommittedRevision=Math.max(
          finalCommittedRevision,
          Number(row?.state?.revision)||revision
        );
        finalRemoteRevision=Math.max(finalRemoteRevision,finalCommittedRevision);
        lastCloudSync=row?.updated_at||new Date().toISOString();

        if(revision===finalMutationRevision)finalDirty=false;
        updateCloudStatus(
          "online",
          "Supabase conectado",
          `Guardado: ${new Date(lastCloudSync).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`
        );
        operationStatus("Cambios guardados","success");
        if(showToast)toast("Cambios guardados");
        return row;
      }catch(error){
        console.error("final shared save:",error);
        updateCloudStatus("error","Error al guardar",error.message||"Supabase rechazó el cambio");
        operationStatus("No se pudo guardar","error",2600);
        throw error;
      }finally{
        cloudSyncing=false;
        finalWritePromise=null;
        if(finalWriteQueued||finalMutationRevision>revision){
          finalWriteQueued=false;
          queueMicrotask(()=>syncAllToCloud(false).catch(()=>{}));
        }
      }
    })();

    return finalWritePromise;
  };

  function shouldApplyRemote(row){
    if(!row?.state)return false;
    const revision=Number(row.state.revision)||0;
    if(finalDirty||cloudSyncing||finalWritePromise)return false;
    if(revision&&revision<finalCommittedRevision)return false;
    if(row.updated_at&&lastCloudSync&&new Date(row.updated_at)<new Date(lastCloudSync))return false;
    finalRemoteRevision=Math.max(finalRemoteRevision,revision);
    return true;
  }

  loadAllFromCloud = async function(showToast=false){
    if(finalDirty||cloudSyncing||finalWritePromise)return false;
    try{
      const {data:row,error}=await sb
        .from("prime_shared_state")
        .select("state,updated_at")
        .eq("id",SHARED_STATE_ID)
        .maybeSingle();
      if(error)throw error;
      if(!row){
        data=normalizeData(clone(defaults));
        profile={name:"Nicolás",goal:"Proyecto Prime",photo:""};
        ui={light:false,compact:false};
        sharedStateReady=true;
        finalDirty=true;
        finalMutationRevision=Date.now();
        await syncAllToCloud(false);
        renderAll();
        return true;
      }
      if(shouldApplyRemote(row)){
        applySharedPayload(row.state,row.updated_at);
        finalCommittedRevision=Math.max(finalCommittedRevision,Number(row.state?.revision)||0);
        sharedStateReady=true;
        renderAll();
        renderAuthState();
        if(showToast)toast("Datos actualizados");
      }
      return true;
    }catch(error){
      console.error("final shared load:",error);
      updateCloudStatus("error","No se pudo conectar",error.message||"Error al leer Supabase");
      return false;
    }
  };

  subscribeToSharedState = function(){
    if(sharedRealtimeChannel)sb.removeChannel(sharedRealtimeChannel);
    sharedRealtimeChannel=sb
      .channel("prime-shared-state-final")
      .on("postgres_changes",{
        event:"*",
        schema:"public",
        table:"prime_shared_state",
        filter:`id=eq.${SHARED_STATE_ID}`
      },payload=>{
        const row=payload.new;
        if(!shouldApplyRemote(row))return;
        applySharedPayload(row.state,row.updated_at);
        finalCommittedRevision=Math.max(finalCommittedRevision,Number(row.state?.revision)||0);
        sharedStateReady=true;
        renderAll();
        updateCloudStatus("online","Supabase conectado","Actualizado desde otro dispositivo");
      })
      .subscribe(status=>{
        if(status==="SUBSCRIBED"){
          updateCloudStatus("online","Supabase conectado","Tiempo real activo");
        }
      });
  };

  async function mutateAndCommit(mutator,{
    render=()=>renderAll(),
    success="Cambios guardados",
    button=null
  }={}){
    const before={
      data:cloneFinal(data),
      profile:cloneFinal(profile),
      ui:cloneFinal(ui)
    };
    setButtonState(button,"saving");
    try{
      mutator();
      finalDirty=true;
      finalMutationRevision=Math.max(Date.now(),finalMutationRevision+1);
      render();
      await syncAllToCloud(false);
      setButtonState(button,"success","✓ Guardado");
      toast(success);
      return true;
    }catch(error){
      data=before.data;profile=before.profile;ui=before.ui;
      render();
      setButtonState(button,"error");
      toast(error.message||"No se pudo guardar el cambio");
      return false;
    }
  }

  // Eliminación antigua y nueva: ambas quedan transaccionales.
  window.deleteMeal = async function(id){
    const element=document.querySelector(`[onclick*="deleteMeal('${id}')"]`)?.closest(".meal-item,.timeline-meal");
    element?.classList.add("meal-removing");
    const ok=await mutateAndCommit(
      ()=>{data.meals=(data.meals||[]).filter(meal=>meal.id!==id)},
      {render:()=>renderNutrition(),success:"Comida eliminada"}
    );
    if(!ok)element?.classList.remove("meal-removing");
  };

  document.addEventListener("click",async event=>{
    const deleteButton=event.target.closest("[data-delete-pro-meal]");
    if(!deleteButton)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const id=deleteButton.dataset.deleteProMeal;
    const row=deleteButton.closest(".timeline-meal,.meal-item");
    row?.classList.add("meal-removing");
    const ok=await mutateAndCommit(
      ()=>{data.meals=(data.meals||[]).filter(meal=>meal.id!==id)},
      {render:()=>renderNutrition(),success:"Comida eliminada",button:deleteButton}
    );
    if(!ok)row?.classList.remove("meal-removing");
  },true);

  // Botones de guardado fundamentales.
  const mealSave=document.getElementById("saveMealProBtn");
  if(mealSave){
    mealSave.onclick=async()=>{
      const description=document.getElementById("mealDescriptionPro").value.trim();
      if(!description||!pendingMealEstimate)return toast("Analizá la comida primero");
      const meal={
        id:crypto.randomUUID?.()||String(Date.now()),
        date:iso(nutritionDate),
        type:document.getElementById("mealTypePro").value,
        time:document.getElementById("mealTimePro").value,
        description,
        normalizedName:pendingMealEstimate.normalizedName,
        calories:+document.getElementById("estimatedCaloriesPro").value||0,
        protein:+document.getElementById("estimatedProteinPro").value||0,
        carbs:+document.getElementById("estimatedCarbsPro").value||0,
        fat:+document.getElementById("estimatedFatPro").value||0,
        fiber:pendingMealEstimate.fiber,
        confidence:pendingMealEstimate.confidence,
        confidencePercent:pendingMealEstimate.confidencePercent,
        estimatedTotalWeight:pendingMealEstimate.estimatedTotalWeight,
        items:pendingMealEstimate.items||[],
        assumptions:pendingMealEstimate.assumptions||[],
        source:verifiedProductPro?"barcode_verified":(mealPhotoDataPro?"ai_visual_estimate":"ai_estimate"),
        verifiedProduct:verifiedProductPro,hasMealPhoto:Boolean(mealPhotoDataPro),consumedWholeProduct:consumeWholeProductPro
      };
      const saveLibrary=document.getElementById("saveToLibraryProCheck").checked;
      const ok=await mutateAndCommit(()=>{
        data.meals=data.meals||[];
        data.meals.push(meal);
        if(saveLibrary){
          data.savedMeals=data.savedMeals||[];
          data.savedMeals.push({
            id:crypto.randomUUID?.()||String(Date.now()+1),
            name:meal.normalizedName||meal.description,
            calories:meal.calories,protein:meal.protein,carbs:meal.carbs,fat:meal.fat,
            fiber:meal.fiber,defaultType:meal.type,items:meal.items,source:"ai"
          });
        }
      },{
        render:()=>renderNutrition(),
        success:"Comida registrada",
        button:mealSave
      });
      if(ok){
        closeModal("mealComposerProModal");
        pendingMealEstimate=null;
      }
    };
  }

  const savedMealButton=document.getElementById("saveSavedMealProBtn");
  if(savedMealButton){
    savedMealButton.onclick=async()=>{
      const item={
        id:finalEditingSavedMealId||crypto.randomUUID?.()||String(Date.now()),
        name:document.getElementById("savedMealProName").value.trim(),
        calories:+document.getElementById("savedMealProCalories").value||0,
        protein:+document.getElementById("savedMealProProtein").value||0,
        carbs:+document.getElementById("savedMealProCarbs").value||0,
        fat:+document.getElementById("savedMealProFat").value||0,
        defaultType:document.getElementById("savedMealProType").value,
        source:"manual"
      };
      if(!item.name)return toast("Poné un nombre");
      const ok=await mutateAndCommit(()=>{
        data.savedMeals=data.savedMeals||[];
        const index=data.savedMeals.findIndex(saved=>saved.id===item.id);
        if(index>=0)data.savedMeals[index]=item;
        else data.savedMeals.push(item);
      },{
        render:()=>{
          // La biblioteca se vuelve a dibujar al reabrirse; mantenemos la vista actual estable.
          renderNutrition();
        },
        success:"Plato guardado",
        button:savedMealButton
      });
      if(ok){
        finalEditingSavedMealId=null;
        closeModal("savedMealProEditorModal");
        closeModal("mealLibraryProModal");
      }
    };
  }

  const routineButton=document.getElementById("saveRoutineBtn");
  if(routineButton){
    routineButton.onclick=async()=>{
      const ok=await mutateAndCommit(()=>{
        const routine=data.routine[editingRoutine];
        routine.name=document.getElementById("routineName").value.trim()||routine.name;
        routine.muscle=document.getElementById("routineMuscle").value.trim()||routine.muscle;
        routine.mode=document.querySelector("[data-pro-day-mode].active")?.dataset.proDayMode||routine.mode||"training";
        const time=document.getElementById("routineWorkoutTime");
        if(time)routine.workoutTime=time.value||routine.workoutTime;
      },{
        render:()=>renderRoutine(),
        success:"Rutina actualizada",
        button:routineButton
      });
      if(ok)closeModal("routineModal");
    };
  }

  const nutritionSettingsButton=document.getElementById("saveNutritionSettingsBtn");
  if(nutritionSettingsButton){
    nutritionSettingsButton.onclick=async()=>{
      const ok=await mutateAndCommit(
        ()=>{data.nutritionSettings=readNutritionSettingsFromForm()},
        {render:()=>renderNutrition(),success:"Objetivos actualizados",button:nutritionSettingsButton}
      );
      if(ok)closeModal("nutritionSettingsModal");
    };
  }

  // Restablecimiento completo y confirmado.
  const reset=document.getElementById("resetBtn");
  if(reset){
    reset.onclick=async()=>{
      if(!confirm("Se eliminará absolutamente todo el estado compartido. ¿Continuar?"))return;
      if(prompt("Escribí BORRAR para confirmar")!=="BORRAR")return toast("Operación cancelada");
      await mutateAndCommit(()=>{
        data=normalizeData(clone(defaults));
        profile={name:"Nicolás",goal:"Proyecto Prime",photo:""};
        ui={light:false,compact:false};
      },{
        render:()=>{renderAll();showPage("homePage")},
        success:"Prime Training restablecida",
        button:reset
      });
    };
  }

  // El wrapper antiguo exigía currentUser. Esta versión lo neutraliza definitivamente.
  finalDirty=false;
  if(sharedStateReady){
    finalCommittedRevision=Number(sharedPayload()?.revision)||0;
    renderAuthState();
  }
})();
