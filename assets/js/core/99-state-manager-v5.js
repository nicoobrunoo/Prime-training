(()=>{
  "use strict";

  const BACKUP_KEY="prime-training-v5-backup";
  const META_KEY="prime-training-v5-sync-meta";
  const STATUS_EVENT="prime:sync-status";

  const clone=value=>typeof structuredClone==="function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

  const nowRevision=previous=>Math.max(Date.now(),Number(previous||0)+1);

  let dirty=false;
  let localRevision=Number(sharedPayload?.()?.revision)||0;
  let committedRevision=localRevision;
  let remoteRevision=localRevision;
  let writePromise=null;
  let queued=false;
  let debounceTimer=null;
  let channel=null;
  let initialized=false;
  let lastError=null;

  function emit(state,detail=""){
    try{
      updateCloudStatus?.(
        state==="saved"?"online":state==="saving"?"syncing":"error",
        state==="saved"?"Supabase conectado":state==="saving"?"Guardando...":"Error al guardar",
        detail
      );
    }catch(_){ }
    window.dispatchEvent(new CustomEvent(STATUS_EVENT,{detail:{state,detail,dirty,localRevision,committedRevision}}));
  }

  function snapshot(){
    const payload=sharedPayload();
    const revision=nowRevision(Math.max(localRevision,Number(payload.revision)||0));
    localRevision=revision;
    payload.revision=revision;
    payload.saved_at=new Date().toISOString();
    payload.client_saved_at=payload.saved_at;
    return {id:SHARED_STATE_ID,state:clone(payload),updated_at:payload.saved_at};
  }

  function backup(row){
    try{
      localStorage.setItem(BACKUP_KEY,JSON.stringify(row));
      localStorage.setItem(META_KEY,JSON.stringify({revision:row.state.revision,savedAt:row.updated_at}));
    }catch(error){console.warn("No se pudo crear el respaldo local",error)}
  }


  async function ensureCloudReady(timeoutMs=10000){
    if(sharedStateReady)return true;
    const started=Date.now();
    while(!sharedStateReady&&Date.now()-started<timeoutMs){
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(sharedStateReady)return true;
    // Last-resort bootstrap: verify the shared row directly. This prevents a
    // harmless UI initialization error from permanently disabling all saves.
    const {data:row,error}=await sb
      .from("prime_shared_state")
      .select("state,updated_at")
      .eq("id",SHARED_STATE_ID)
      .maybeSingle();
    if(error)throw error;
    if(row?.state){
      applySharedPayload(row.state,row.updated_at);
      const revision=Number(row.state.revision)||0;
      localRevision=Math.max(localRevision,revision);
      committedRevision=Math.max(committedRevision,revision);
      remoteRevision=Math.max(remoteRevision,revision);
    }
    sharedStateReady=true;
    return true;
  }

  function markDirty(){
    dirty=true;
    localRevision=nowRevision(localRevision);
  }

  async function write({showToast=false}={}){
    await ensureCloudReady();
    if(writePromise){queued=true;return writePromise}
    clearTimeout(debounceTimer);
    const row=snapshot();
    dirty=true;
    backup(row);
    emit("saving","Confirmando una única versión del estado");

    writePromise=(async()=>{
      try{
        const {data:confirmed,error}=await sb
          .from("prime_shared_state")
          .upsert(row,{onConflict:"id"})
          .select("state,updated_at")
          .single();
        if(error)throw error;
        const confirmedRevision=Number(confirmed?.state?.revision)||row.state.revision;
        committedRevision=Math.max(committedRevision,confirmedRevision);
        remoteRevision=Math.max(remoteRevision,confirmedRevision);
        lastCloudSync=confirmed?.updated_at||row.updated_at;
        if(localRevision<=confirmedRevision)dirty=false;
        lastError=null;
        emit("saved",`Guardado ${new Date(lastCloudSync).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`);
        if(showToast)toast?.("Cambios guardados");
        return confirmed;
      }catch(error){
        lastError=error;
        dirty=true;
        emit("error",error.message||"Supabase rechazó el cambio");
        if(showToast)toast?.(error.message||"No se pudo guardar");
        throw error;
      }finally{
        writePromise=null;
        if(queued||dirty&&localRevision>row.state.revision){
          queued=false;
          queueMicrotask(()=>write({showToast:false}).catch(()=>{}));
        }
      }
    })();
    return writePromise;
  }

  function schedule(delay=220){
    markDirty();
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>write({showToast:false}).catch(error=>console.error("PrimeState save",error)),delay);
  }

  function shouldApply(row){
    if(!row?.state)return false;
    const revision=Number(row.state.revision)||0;
    if(writePromise||dirty)return false;
    if(revision&&revision<=Math.max(committedRevision,remoteRevision))return false;
    if(row.updated_at&&lastCloudSync&&new Date(row.updated_at)<=new Date(lastCloudSync))return false;
    return true;
  }

  function apply(row,{render=true}={}){
    if(!shouldApply(row))return false;
    applySharedPayload(row.state,row.updated_at);
    const revision=Number(row.state.revision)||0;
    remoteRevision=Math.max(remoteRevision,revision);
    committedRevision=Math.max(committedRevision,revision);
    localRevision=Math.max(localRevision,revision);
    dirty=false;
    sharedStateReady=true;
    if(render){renderAll?.();renderAuthState?.()}
    emit("saved","Actualizado desde otro dispositivo");
    return true;
  }

  async function load({force=false,showToast=false}={}){
    if(!force&&(dirty||writePromise))return false;
    const {data:row,error}=await sb
      .from("prime_shared_state")
      .select("state,updated_at")
      .eq("id",SHARED_STATE_ID)
      .maybeSingle();
    if(error)throw error;
    if(!row){
      sharedStateReady=true;
      markDirty();
      await write({showToast:false});
      return true;
    }
    if(force){
      applySharedPayload(row.state,row.updated_at);
      const revision=Number(row.state.revision)||0;
      localRevision=committedRevision=remoteRevision=revision;
      dirty=false;
      sharedStateReady=true;
      renderAll?.();renderAuthState?.();
    }else apply(row);
    if(showToast)toast?.("Datos actualizados");
    return true;
  }

  function subscribe(){
    try{if(sharedRealtimeChannel)sb.removeChannel(sharedRealtimeChannel)}catch(_){ }
    try{if(channel)sb.removeChannel(channel)}catch(_){ }
    channel=sb.channel("prime-state-v5")
      .on("postgres_changes",{event:"*",schema:"public",table:"prime_shared_state",filter:`id=eq.${SHARED_STATE_ID}`},event=>apply(event.new))
      .subscribe(status=>{
        if(status==="SUBSCRIBED")emit("saved","Sincronización protegida activa");
      });
    sharedRealtimeChannel=channel;
  }

  async function reset(){
    data=normalizeData(clone(defaults));
    profile={name:"Nicolás",goal:"Proyecto Prime",photo:""};
    ui={light:false,compact:false};
    markDirty();
    renderAll?.();
    const confirmed=await write({showToast:false});
    const remote=confirmed?.state;
    if(!remote||Number(remote.revision)!==committedRevision)throw new Error("Supabase no confirmó el restablecimiento.");
    showPage?.("homePage");
    return true;
  }

  // Se reemplazan todas las puertas públicas de persistencia por una sola cola.
  queueCloudSync=()=>schedule(220);
  syncAllToCloud=(showToast=true)=>{markDirty();return write({showToast})};
  loadAllFromCloud=(showToast=false)=>load({showToast});
  subscribeToSharedState=subscribe;
  startSharedPolling=function(){
    clearInterval(sharedPollTimer);
    sharedPollTimer=setInterval(()=>{
      if(document.visibilityState==="visible"&&!dirty&&!writePromise)load().catch(()=>{});
    },60000);
  };
  window.save=()=>schedule(180);
  window.saveProfile=()=>schedule(180);
  window.saveUI=()=>schedule(180);
  window.commitPrimeState=()=>{markDirty();return write({showToast:false})};

  window.PrimeState={
    save:options=>{markDirty();return write(options)},
    schedule,
    load,
    reset,
    backup:()=>{const row=snapshot();backup(row);return row},
    restoreBackup:async()=>{
      const raw=localStorage.getItem(BACKUP_KEY);
      if(!raw)throw new Error("No existe un respaldo local.");
      const row=JSON.parse(raw);
      applySharedPayload(row.state,row.updated_at);
      markDirty();
      renderAll?.();
      return write({showToast:true});
    },
    status:()=>({dirty,writing:Boolean(writePromise),queued,localRevision,committedRevision,remoteRevision,lastCloudSync,lastError:lastError?.message||null})
  };

  const resetButton=document.getElementById("resetBtn");
  if(resetButton){
    resetButton.onclick=async()=>{
      if(!confirm("Se eliminarán rutinas, comidas, entrenamientos, chats y medidas. ¿Continuar?"))return;
      if(prompt("Escribí BORRAR para confirmar")!=="BORRAR")return toast?.("Operación cancelada");
      resetButton.disabled=true;
      const original=resetButton.innerHTML;
      resetButton.textContent="Restableciendo...";
      try{
        await reset();
        toast?.("Todos los datos fueron restablecidos");
      }catch(error){
        console.error("PrimeState reset",error);
        toast?.(error.message||"No se pudo restablecer");
      }finally{
        resetButton.disabled=false;
        resetButton.innerHTML=original;
      }
    };
  }

  // Cancela el polling agresivo anterior; el nuevo corre cada minuto y nunca pisa cambios pendientes.
  clearInterval(sharedPollTimer);
  subscribe();
  startSharedPolling();
  initialized=true;
  console.info("PrimeState v5 activo",window.PrimeState.status());
})();
