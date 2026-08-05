"use strict";
(()=>{
  const RELEASE="5.3";
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const round=(n,d=1)=>{const f=10**d;return Math.round(n*f)/f};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  function bodyEntries(){
    return (Array.isArray(data.bodyMeasurements)?data.bodyMeasurements:[])
      .filter(x=>Number.isFinite(Number(x.weight)))
      .slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  function isoWeekKey(date=new Date()){
    const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
    const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
    const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil((((d-yearStart)/86400000)+1)/7)).padStart(2,"0")}`;
  }
  function estimateBodyFat(weight,height,age,sex){
    weight=Number(weight);height=Number(height);age=Number(age)||28;
    if(!weight||!height)return null;
    const bmi=weight/((height/100)**2);
    const sexFactor=sex==="female"?0:1;
    return round(clamp(1.2*bmi+0.23*age-10.8*sexFactor-5.4,5,45),1);
  }
  function weeklyTrend(){
    const rows=bodyEntries();
    if(rows.length<2)return {change:null,rate:null,weeks:0};
    const last=rows.at(-1),first=rows[Math.max(0,rows.length-5)];
    const days=Math.max(1,(new Date(last.date)-new Date(first.date))/86400000);
    const weeks=days/7,change=Number(last.weight)-Number(first.weight);
    return {change:round(change,1),rate:round(change/weeks,2),weeks:round(weeks,1)};
  }
  function goalLabel(goal){return goal==="cut"?"Déficit":goal==="gain"?"Superávit":"Mantenimiento"}
  function trendMessage(){
    const t=weeklyTrend(),goal=data.nutritionSettings?.goal||"maintain";
    if(t.change===null)return "Con dos registros semanales Prime podrá analizar la tendencia.";
    const sign=t.rate>0?"+":"";
    if(goal==="gain"){
      if(t.rate>0.45)return `Subís ${sign}${t.rate} kg/semana. Es una velocidad alta; revisá el superávit si se sostiene.`;
      if(t.rate<0.05)return `La tendencia es ${sign}${t.rate} kg/semana. Si se mantiene, puede faltar energía para ganar peso.`;
      return `Tendencia ${sign}${t.rate} kg/semana: ritmo razonable para una etapa de ganancia.`;
    }
    if(goal==="cut"){
      if(t.rate<-0.8)return `Bajás ${t.rate} kg/semana. Es rápido; priorizá rendimiento, proteína y recuperación.`;
      if(t.rate>-0.1)return `La tendencia es ${sign}${t.rate} kg/semana. Si buscás perder grasa, el déficit podría ser insuficiente.`;
      return `Tendencia ${t.rate} kg/semana: descenso progresivo y controlado.`;
    }
    if(Math.abs(t.rate)>.3)return `Cambiaste ${sign}${t.rate} kg/semana. Para mantenimiento conviene observar otra semana.`;
    return `Peso estable (${sign}${t.rate} kg/semana), coherente con mantenimiento.`;
  }
  function refreshEstimate(){
    const w=Number(document.getElementById("bodyWeight")?.value),h=Number(document.getElementById("bodyHeight")?.value);
    const settings=data.nutritionSettings||{};
    const estimate=estimateBodyFat(w,h,settings.age,settings.sex);
    const out=document.getElementById("bodyFatEstimate"),hidden=document.getElementById("bodyFat");
    if(out)out.textContent=estimate==null?"—":`${estimate}% aprox.`;
    if(hidden)hidden.value=estimate??"";
    const preview=document.getElementById("weightTargetPreview");
    if(preview&&w){
      const previous=latestBody?.();const delta=previous?.weight!=null?round(w-Number(previous.weight),1):null;
      preview.innerHTML=`<div><span>Objetivo actual</span><strong>${goalLabel(settings.goal)}</strong></div><div><span>Variación</span><strong>${delta==null?"Primer registro":`${delta>0?"+":""}${delta} kg`}</strong></div>`;
    }
  }
  function openWeightCheckin(mandatory=false){
    const latest=latestBody?.()||{};
    const title=document.getElementById("bodyModalTitle"),close=document.getElementById("bodyModalClose");
    if(title)title.textContent=mandatory?"Chequeo semanal":"Registrar peso";
    if(close)close.hidden=mandatory;
    const modal=document.getElementById("bodyModal");
    if(modal)modal.dataset.mandatory=mandatory?"true":"false";
    document.getElementById("bodyWeight").value=latest.weight??"";
    document.getElementById("bodyHeight").value=latest.height??184;
    document.getElementById("bodyNotes").value="";
    refreshEstimate();openModal("bodyModal");
    setTimeout(()=>document.getElementById("bodyWeight")?.select(),160);
  }
  window.openBody=()=>openWeightCheckin(false);

  function overrideOpeners(){
    ["registerBodyQuick","registerBodyBtn"].forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=()=>openWeightCheckin(false)});
  }
  async function saveWeight(){
    const button=document.getElementById("saveBodyBtn");
    const weight=Number(document.getElementById("bodyWeight")?.value),height=Number(document.getElementById("bodyHeight")?.value);
    if(!Number.isFinite(weight)||weight<35||weight>250)return toast("Ingresá un peso válido");
    if(!Number.isFinite(height)||height<120||height>230)return toast("Ingresá una altura válida");
    const settings=data.nutritionSettings||{};
    const bodyFat=estimateBodyFat(weight,height,settings.age,settings.sex);
    const previous=latestBody?.();
    const entry={id:crypto.randomUUID?.()||String(Date.now()),date:iso(),weight:round(weight,1),height:round(height,1),bodyFat,bodyFatEstimated:true,notes:document.getElementById("bodyNotes")?.value.trim()||"Chequeo semanal",weekKey:isoWeekKey()};
    data.bodyMeasurements=(data.bodyMeasurements||[]).filter(x=>x.date!==entry.date);
    data.bodyMeasurements.push(entry);
    data.bodyMeasurements.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    data.weeklyWeightCheckins=data.weeklyWeightCheckins||{};data.weeklyWeightCheckins[entry.weekKey]=entry.date;
    button.disabled=true;button.innerHTML="Guardando…";
    try{
      if(window.PrimeState?.save)await window.PrimeState.save();else save();
      closeModal("bodyModal");
      renderAll();
      if(typeof renderNutrition==="function")renderNutrition();
      toast(`Peso guardado${previous?.weight!=null?` · ${weight>=previous.weight?"+":""}${round(weight-Number(previous.weight),1)} kg`:""}`);
    }catch(e){console.error("Guardar peso:",e);toast("No se pudo guardar el peso")}
    finally{button.disabled=false;button.innerHTML='<svg><use href="#i-check"></use></svg>Guardar peso y recalcular objetivos'}
  }
  function installWeightSave(){const b=document.getElementById("saveBodyBtn");if(b)b.onclick=saveWeight;["bodyWeight","bodyHeight"].forEach(id=>document.getElementById(id)?.addEventListener("input",refreshEstimate))}

  function sparkline(rows){
    if(!rows.length)return "";
    const values=rows.map(x=>Number(x.weight)),min=Math.min(...values),max=Math.max(...values),range=Math.max(.4,max-min);
    const points=values.map((v,i)=>`${10+(i/Math.max(1,values.length-1))*280},${78-((v-min)/range)*58}`).join(" ");
    return `<svg class="weight-chart-svg" viewBox="0 0 300 92" preserveAspectRatio="none"><defs><linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity=".32"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs><polygon points="10,84 ${points} 290,84" fill="url(#weightArea)"/><polyline points="${points}" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${values.map((v,i)=>`<circle cx="${10+(i/Math.max(1,values.length-1))*280}" cy="${78-((v-min)/range)*58}" r="4" fill="#07111a" stroke="#5ee7ff" stroke-width="3"/>`).join("")}</svg>`;
  }
  function renderWeightEvolution(){
    const rows=bodyEntries().slice(-12),latest=rows.at(-1),previous=rows.at(-2),delta=latest&&previous?round(Number(latest.weight)-Number(previous.weight),1):null;
    const el=document.getElementById("progressContent");if(!el)return;
    el.innerHTML=`<div class="heading-row"><div><h2 class="heading">EVOLUCIÓN DE PESO</h2><div class="caption">Chequeo semanal · ${goalLabel(data.nutritionSettings?.goal)}</div></div><button class="btn btn-soft" onclick="openBody()" style="min-height:38px;padding:8px 12px">Registrar peso</button></div>
      <div class="weight-evolution-summary"><div><span>Peso actual</span><strong>${latest?`${fmt(latest.weight)} kg`:"—"}</strong></div><div><span>Último cambio</span><strong class="${delta>0?"up":delta<0?"down":""}">${delta==null?"—":`${delta>0?"+":""}${delta} kg`}</strong></div><div><span>Grasa estimada</span><strong>${latest?.bodyFat?`${latest.bodyFat}%`:"—"}</strong></div></div>
      <div class="weight-chart-card">${rows.length>1?sparkline(rows):'<div class="empty">Agregá otro registro semanal para ver la curva.</div>'}<div class="weight-chart-labels"><span>${rows[0]?.date||""}</span><span>${rows.at(-1)?.date||""}</span></div></div>
      <div class="trend-coach"><span>PRIME COACH</span><p>${esc(trendMessage())}</p></div>
      <div class="weight-history">${rows.slice().reverse().map((x,i)=>{const prior=rows[rows.length-2-i],d=prior?round(Number(x.weight)-Number(prior.weight),1):null;return `<div class="weight-history-row"><div><strong>${fmt(x.weight)} kg</strong><span>${new Date(`${x.date}T12:00:00`).toLocaleDateString("es-AR",{weekday:"short",day:"2-digit",month:"short"})}</span></div><div><strong>${x.bodyFat?`${x.bodyFat}% aprox.`:"—"}</strong><span>${d==null?"Primer registro":`${d>0?"+":""}${d} kg`}</span></div></div>`}).join("")}</div>`;
  }
  const baseRenderProgress=window.renderProgress;
  window.renderProgress=function(){if(currentProgressTab==="body")return renderWeightEvolution();return baseRenderProgress.apply(this,arguments)};

  function enhanceHome(){
    const charts=document.getElementById("homeCharts");if(!charts)return;
    let panel=document.getElementById("weeklyWeightPanel");
    if(!panel){panel=document.createElement("div");panel.id="weeklyWeightPanel";panel.className="weekly-weight-panel";charts.parentElement.insertBefore(panel,charts)}
    const latest=latestBody?.(),target=typeof nutritionTargets==="function"?nutritionTargets():null;
    panel.innerHTML=`<div class="weekly-weight-copy"><span>CONTROL SEMANAL</span><strong>${latest?`${fmt(latest.weight)} kg`:`Registrá tu peso`}</strong><p>${esc(trendMessage())}</p></div><div class="weekly-weight-goals"><div><span>Calorías</span><strong>${target?.calories||"—"}</strong></div><div><span>Proteína</span><strong>${target?.protein?`${target.protein} g`:"—"}</strong></div><button class="icon-button" id="weeklyWeightOpen"><svg><use href="#i-scale"></use></svg></button></div>`;
    document.getElementById("weeklyWeightOpen").onclick=()=>openWeightCheckin(false);
  }
  const baseRenderHome=window.renderHome;
  window.renderHome=function(){const result=baseRenderHome.apply(this,arguments);enhanceHome();return result};

  function maybeWeeklyPrompt(){
    const now=new Date();if(now.getDay()!==1)return;
    const key=isoWeekKey(now),has=(data.bodyMeasurements||[]).some(x=>x.weekKey===key||x.date===iso(now));
    if(has)return;
    setTimeout(()=>openWeightCheckin(true),700);
  }
  function protectMandatoryClose(){
    document.getElementById("bodyModal")?.addEventListener("click",e=>{if(e.target.id==="bodyModal"&&e.currentTarget.dataset.mandatory==="true"){e.stopPropagation();toast("Registrá tu peso semanal para continuar")}},true)
  }

  function init(){
    data.weeklyWeightCheckins=data.weeklyWeightCheckins||{};
    overrideOpeners();installWeightSave();protectMandatoryClose();
    try{renderHome();if(currentProgressTab==="body")renderProgress()}catch(e){console.warn("Prime final UI:",e)}
    maybeWeeklyPrompt();
    document.documentElement.dataset.primeRelease=RELEASE;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
