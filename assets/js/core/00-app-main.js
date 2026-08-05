"use strict";
const KEY="prime-training-clean-v1",LEGACY_KEY="prime-training-dark-v1",PROFILE_KEY="prime-training-profile-v2",UI_KEY="prime-training-ui-v2";
const SUPABASE_URL="https://dquhzjkaguwxchbwigap.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_B34hIIpOQVp81JwMLzmTvQ_7F5GIxEl";
const SMART_HANDLER_URL=`${SUPABASE_URL}/functions/v1/smart-handler`;
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  realtime:{params:{eventsPerSecond:10}}
});
const SHARED_STATE_ID="main";
let sharedStateReady=false,sharedRealtimeChannel=null,sharedPollTimer=null,sharedSaveVersion=0,sharedAppliedVersion=0;
let currentUser=null,cloudSyncTimer=null,cloudSyncing=false,lastCloudSync=null;
const PAGE_IDS=["homePage","routinePage","calendarPage","nutritionPage","aiChatPage"];
const PAGE_COLORS={homePage:"#8b5cf6",routinePage:"#22d3ee",calendarPage:"#22c55e",nutritionPage:"#f59e0b",aiChatPage:"#37e6ff"};
const defaults={routine:[
{day:1,name:"Lunes",muscle:"Pecho, hombros y tríceps",exercises:[["press-plano","Press plano",4,8,10,40,120,2],["press-inclinado","Press inclinado",4,8,10,16,100,2],["laterales","Elevaciones laterales",4,12,15,8,60,2],["triceps","Tríceps en polea",3,10,12,20,75,2]]},
{day:2,name:"Martes",muscle:"Espalda y bíceps",exercises:[["jalon","Jalón al pecho",4,8,12,36,100,2],["remo","Remo sentado",4,8,12,40,100,2],["martillo","Curl martillo",3,10,12,10,75,2]]},
{day:3,name:"Miércoles",muscle:"Piernas",exercises:[["sentadilla","Sentadilla",4,6,10,60,150,2],["prensa","Prensa",4,10,12,100,120,2],["femoral","Curl femoral",3,10,15,35,75,2],["gemelos","Gemelos",4,12,15,45,60,2]]},
{day:4,name:"Jueves",muscle:"Pecho y espalda",exercises:[["press-maquina","Press en máquina",4,8,12,40,100,2],["remo-mancuerna","Remo con mancuerna",4,8,12,22,100,2],["pullover","Pullover",3,10,15,25,75,2]]},
{day:5,name:"Viernes",muscle:"Hombros, brazos y piernas",exercises:[["press-militar","Press militar",4,8,10,24,100,2],["curl","Curl de bíceps",3,10,12,10,75,2],["extension","Extensión de cuádriceps",4,10,15,40,75,2]]}
].map(r=>({...r,exercises:r.exercises.map(x=>({id:x[0],name:x[1],sets:x[2],minReps:x[3],maxReps:x[4],weight:x[5],rest:x[6],rir:x[7],active:true}))})),sessions:[],bodyMeasurements:[{date:"2026-07-24",weight:70.4,height:184,bodyFat:14.6,waist:null,chest:null,arm:null,leg:null,neck:null,notes:"Registro inicial"}]};
const clone=o=>JSON.parse(JSON.stringify(o));
let data=loadData(),profile=loadProfile(),ui=loadUI(),pendingPhoto=profile.photo||"",currentMonth=new Date(),nutritionDate=new Date(),editingRoutine=-1,currentProgressTab="exercises",timerId=null,timerSeconds=0,activePage="homePage",pendingMealEstimate=null;
function loadData(){return clone(defaults)}
function normalizeData(d){
  d.routine=d.routine||clone(defaults.routine);
  d.routine.forEach(day=>{
    day.exercises=day.exercises||[];
    day.cardio=day.cardio||[];
  });
  d.sessions=Array.isArray(d.sessions)?d.sessions:[];
  d.sessions.forEach(session=>{
    session.exercises=Array.isArray(session.exercises)?session.exercises:[];
    session.cardio=Array.isArray(session.cardio)?session.cardio:[];
    session.exercises.forEach(ex=>{ex.sets=Array.isArray(ex.sets)?ex.sets:[]});
  });
  d.meals=Array.isArray(d.meals)?d.meals:[];
  d.savedMeals=Array.isArray(d.savedMeals)?d.savedMeals:[];
  d.aiInsights=d.aiInsights&&typeof d.aiInsights==="object"?d.aiInsights:{};
  d.aiChats=Array.isArray(d.aiChats)?d.aiChats:[];
  d.dailyReports=Array.isArray(d.dailyReports)?d.dailyReports:[];
  d.nutritionSettings=d.nutritionSettings&&typeof d.nutritionSettings==="object"
    ?d.nutritionSettings
    :{age:28,sex:"male",activity:1.55,goal:"maintain",proteinPerKg:1.8,adjustment:15};
  d.bodyMeasurements=Array.isArray(d.bodyMeasurements)?d.bodyMeasurements:(Array.isArray(d.body)?d.body:[]);
  return d
}
function loadProfile(){return{name:"Nicolás",goal:"Proyecto Prime",photo:""}}
function loadUI(){return{light:false,compact:false}}
function save(){queueCloudSync()}
function saveProfile(){queueCloudSync()}
function saveUI(){queueCloudSync()}
function iso(d=new Date()){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function fmt(n){return Number(n||0).toLocaleString("es-AR",{maximumFractionDigits:1})}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),2100)}
function openModal(id){document.getElementById(id).classList.add("open")}
function closeModal(id){document.getElementById(id).classList.remove("open")}
function todayRoutine(){return data.routine.find(r=>r.day===new Date().getDay())||null}
function getSession(date=iso()){return data.sessions.find(s=>s.date===date)||null}
function weekRange(date=new Date()){const s=new Date(date),day=s.getDay()||7;s.setHours(0,0,0,0);s.setDate(s.getDate()-day+1);const e=new Date(s);e.setDate(s.getDate()+6);return{start:s,end:e}}
function sessionsInRange(start,end){return data.sessions.filter(s=>{const d=new Date(s.date+"T12:00:00");return d>=start&&d<=end})}
function volume(s){return s?.exercises?.reduce((a,e)=>a+e.sets.filter(x=>x.done&&!x.warmup).reduce((b,x)=>b+(+x.weight||0)*(+x.reps||0),0),0)||0}
function latestBody(){return [...data.bodyMeasurements].sort((a,b)=>b.date.localeCompare(a.date))[0]||null}
function priorBody(){const x=[...data.bodyMeasurements].sort((a,b)=>b.date.localeCompare(a.date));return x[1]||null}
function lastExercise(id,before=iso()){const ss=data.sessions.filter(s=>s.date<before&&["completed","partial"].includes(s.status)).sort((a,b)=>b.date.localeCompare(a.date));for(const s of ss){const ex=s.exercises.find(e=>e.id===id);if(ex&&ex.sets.some(x=>x.done))return{s,ex}}return null}
function estimateRoutine(r){
  if(!r)return{sets:0,volume:0,duration:0,cardioMinutes:0};
  const sets=r.exercises.filter(e=>e.active!==false).reduce((a,e)=>a+e.sets,0);
  const vol=r.exercises.reduce((a,e)=>a+(e.weight||0)*e.sets*((e.minReps+e.maxReps)/2),0);
  const cardioMinutes=(r.cardio||[]).reduce((a,c)=>a+(Number(c.minutes)||0),0);
  return{
    sets,
    volume:vol,
    cardioMinutes,
    duration:Math.round(sets*2.2+r.exercises.reduce((a,e)=>a+(e.rest||60),0)/60+cardioMinutes)
  }
}
function streak(){const done=new Set(data.sessions.filter(s=>s.status==="completed").map(s=>s.date));let n=0,d=new Date();while(done.has(iso(d))){n++;d.setDate(d.getDate()-1)}return n}
function recommendation(ex){const sets=ex.sets.filter(s=>s.done&&!s.warmup&&+s.reps>0);if(!sets.length)return{label:"Sin datos",next:ex.suggestedWeight,why:"Todavía no completaste series efectivas."};const allMax=sets.length>=ex.targetSets&&sets.every(s=>+s.reps>=ex.maxReps&&(s.rir===""||+s.rir>=1));const low=sets.filter(s=>+s.reps<ex.minReps).length>=Math.ceil(sets.length/2);const current=Math.max(...sets.map(s=>+s.weight||0)),jump=current<20?1:current<60?2.5:5;if(allMax)return{label:"Subir",next:+(current+jump).toFixed(1),why:"Completaste el máximo del rango con margen técnico."};if(low)return{label:"Revisar",next:Math.max(0,current-jump),why:"Varias series quedaron debajo del mínimo."};return{label:"Mantener",next:current,why:"Rendimiento correcto, todavía hay margen para consolidar."}}
function createTodaySession(){
  const r=todayRoutine();
  if(!r)return null;
  let s=getSession();
  if(s)return s;
  s={
    id:crypto.randomUUID?.()||String(Date.now()),
    date:iso(),
    routineDay:r.day,
    title:r.name,
    muscle:r.muscle,
    status:"in_progress",
    startedAt:new Date().toISOString(),
    completedAt:null,
    notes:"",
    exercises:r.exercises.filter(e=>e.active!==false).map(e=>{
      const last=lastExercise(e.id),w=last?.ex?.nextWeight??e.weight;
      return{
        id:e.id,name:e.name,targetSets:e.sets,minReps:e.minReps,maxReps:e.maxReps,
        suggestedWeight:w,rest:e.rest,rirTarget:e.rir,note:"",tag:"",skipped:false,
        recommendation:"",nextWeight:w,recommendationWhy:"",
        sets:Array.from({length:e.sets},(_,i)=>({set:i+1,weight:w,reps:"",rir:"",done:false,warmup:false,failed:false}))
      }
    }),
    cardio:(r.cardio||[]).map(c=>({
      id:c.id||("cardio-"+Date.now()+Math.random()),
      type:c.type||"Cardio",
      name:c.name||"Actividad",
      minutes:Number(c.minutes)||0,
      completedMinutes:"",
      done:false,
      note:""
    }))
  };
  data.sessions.push(s);save();return s
}
function primeScore(){const {start,end}=weekRange(),ss=sessionsInRange(start,end),completed=ss.filter(s=>s.status==="completed").length,partial=ss.filter(s=>s.status==="partial").length,body=latestBody();let score=Math.min(45,completed*9+partial*4);score+=Math.min(20,Math.round(ss.reduce((a,s)=>a+volume(s),0)/1500));score+=Math.min(15,streak()*3);score+=body&&body.date>=iso(start)?10:0;score+=completed>=3?10:completed*2;return Math.min(100,score)}
function coachMessage(){const r=todayRoutine(),s=getSession(),score=primeScore();if(!r)return"Hoy es descanso. Aprovechá para recuperar, caminar y registrar cómo te sentís.";if(s?.status==="completed")return`Excelente. Completaste ${r.muscle}. Tu Prime Score está en ${score}. Mañana priorizá recuperación.`;const ready=[];data.sessions.slice().reverse().forEach(x=>x.exercises?.forEach(e=>{if(e.recommendation==="Subir"&&!ready.some(y=>y.id===e.id))ready.push(e)}));if(ready.length)return`${ready[0].name} está listo para probar ${ready[0].nextWeight} kg. Subí solo si mantenés técnica y RIR.`;return`Hoy toca ${r.muscle}. Empezá con el peso sugerido y registrá cada serie para que la próxima recomendación sea precisa.`}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));const target=document.getElementById(id);if(!target)return;target.classList.add("active");activePage=id;document.body.classList.toggle("ai-chat-active",id==="aiChatPage");document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===id));const nav=document.getElementById("bottomNav"),idx=PAGE_IDS.indexOf(id);nav.style.display=id==="workoutPage"?"none":"grid";if(idx>=0){nav.style.setProperty("--nav-index",idx);nav.style.setProperty("--nav-color",PAGE_COLORS[id])}if(id!=="aiChatPage")scrollTo({top:0,behavior:"smooth"})}
function chartMarkup(values,color,label,value){const nums=values.filter(v=>Number.isFinite(v));if(!nums.length)return`<div class="spark-card"><div class="spark-label">${label}</div><div class="spark-value">${value}</div><div class="empty" style="margin-top:10px;padding:12px">Sin historial suficiente</div></div>`;const min=Math.min(...nums),max=Math.max(...nums),range=max-min||1,pts=nums.map((v,i)=>`${i/(nums.length-1||1)*100},${45-(v-min)/range*34}`).join(" ");const area=`0,50 ${pts} 100,50`;return`<div class="spark-card"><div class="spark-head"><div><div class="spark-label">${label}</div><div class="spark-value">${value}</div></div><svg style="color:${color}"><use href="#i-trend"/></svg></div><div class="spark"><svg viewBox="0 0 100 50" preserveAspectRatio="none"><polygon points="${area}" fill="${color}" opacity=".12"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg></div></div>`}
function renderProfile(){const initials=(profile.name||"NB").split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||"").join("");["avatarInitials","drawerInitials","profileInitials"].forEach(id=>document.getElementById(id).textContent=initials);[["avatarPhoto","avatarInitials"],["drawerPhoto","drawerInitials"],["profilePreview","profileInitials"]].forEach(([imgId,txtId])=>{const img=document.getElementById(imgId),txt=document.getElementById(txtId);if(profile.photo){img.src=profile.photo;img.hidden=false;txt.hidden=true}else{img.hidden=true;txt.hidden=false}});document.getElementById("drawerName").textContent=profile.name;document.getElementById("drawerGoal").textContent=profile.goal;document.getElementById("profileName").value=profile.name;document.getElementById("profileGoal").value=profile.goal;document.getElementById("greeting").textContent=`Buen día, ${profile.name.split(" ")[0]} 👋`;document.getElementById("brandSubtitle").textContent=profile.goal}
function applyUI(){document.body.classList.toggle("light",ui.light);document.body.classList.toggle("compact",ui.compact);document.getElementById("themeSwitch").classList.toggle("on",ui.light);document.getElementById("compactSwitch").classList.toggle("on",ui.compact)}
function renderHome(){
  const r=todayRoutine(),s=getSession(),est=estimateRoutine(r),score=primeScore(),body=latestBody(),
    {start,end}=weekRange(),ws=sessionsInRange(start,end),completed=ws.filter(x=>x.status==="completed").length,
    weeklyVolume=ws.reduce((a,x)=>a+volume(x),0);

  document.getElementById("primeScore").textContent=score;
  document.getElementById("scoreRing").style.setProperty("--score",score);
  document.getElementById("scoreRing").style.setProperty("--score-color",score>=80?"var(--green)":score>=55?"var(--orange)":"var(--purple)");
  document.getElementById("heroSubtitle").textContent=score>=80?"Excelente semana. Estás siendo muy constante.":score>=55?"Buen progreso. Todavía podés cerrar mejor la semana.":"Volvamos a construir constancia paso a paso.";
  document.getElementById("coachText").textContent=coachMessage();
  document.getElementById("todayTitle").textContent=r?r.name:"Día de descanso";
  document.getElementById("todayMuscles").textContent=r?r.muscle:"Recuperación programada";
  document.getElementById("todayStatus").textContent=s?({in_progress:"En curso",completed:"Completado",partial:"Parcial",skipped:"No fui"}[s.status]||s.status):"Pendiente";

  const metrics=[
    ["i-dumbbell","Ejercicios",r?.exercises.filter(e=>e.active!==false).length||0,"rgba(139,92,246,.15)"],
    ["i-layers","Series",est.sets,"rgba(34,211,238,.13)"],
    ["i-clock","Duración",`~${est.duration} min`,"rgba(245,158,11,.13)"],
    est.cardioMinutes
      ?["i-cardio","Cardio",`${est.cardioMinutes} min`,"rgba(34,211,238,.14)"]
      :["i-chart","Volumen est.",`${fmt(est.volume)} kg`,"rgba(34,197,94,.13)"]
  ];
  document.getElementById("todayMetrics").innerHTML=metrics.map(x=>`<div class="metric" style="--metric-glow:${x[3]}"><div class="metric-head"><svg><use href="#${x[0]}"/></svg>${x[1]}</div><strong>${x[2]}</strong></div>`).join("");

  const actions=document.querySelector(".today-card .actions");
  if(s?.status==="completed"){
    actions.innerHTML=`<div class="completed-state" style="grid-column:1/-1"><span class="completed-icon"><svg><use href="#i-check"/></svg></span><span>Entrenamiento completado</span></div>`;
  }else if(s?.status==="skipped"){
    actions.innerHTML=`<div class="completed-state" style="grid-column:1/-1;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#ff8b8b"><span class="completed-icon" style="background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.28)"><svg><use href="#i-x"/></svg></span><span>Hoy no entrenaste</span></div>`;
  }else{
    actions.innerHTML=`<button class="btn btn-primary" id="startWorkoutBtn"><svg><use href="#i-play"/></svg>${s?.status==="in_progress"?"Continuar":"Empezar"}</button><button class="btn btn-secondary" id="skipTodayBtn"><svg><use href="#i-x"/></svg>No fui</button>`;
    const startBtn=document.getElementById("startWorkoutBtn");
    startBtn.disabled=!r;
    startBtn.onclick=()=>{const session=createTodaySession();if(!session)return toast("Hoy no hay rutina configurada");renderWorkout();showPage("workoutPage")};
    if(document.getElementById("skipTodayBtn"))document.getElementById("skipTodayBtn").onclick=markTodaySkipped;
  }

  document.getElementById("weeklyQuick").innerHTML=[
    ["i-check",`${completed}/5`,"Entrenamientos","rgba(34,197,94,.13)","var(--green)"],
    ["i-fire",streak(),"Racha actual","rgba(245,158,11,.13)","var(--orange)"],
    ["i-dumbbell",`${fmt(weeklyVolume)} kg`,"Volumen semanal","rgba(139,92,246,.13)","#b18cff"],
    ["i-scale",body?`${body.weight} kg`:"—","Peso actual","rgba(59,130,246,.13)","var(--blue)"]
  ].map(x=>`<div class="quick"><div class="quick-icon" style="background:${x[3]};color:${x[4]}"><svg><use href="#${x[0]}"/></svg></div><strong>${x[1]}</strong><span>${x[2]}</span></div>`).join("");

  const next=[];
  data.sessions.slice().reverse().forEach(x=>x.exercises?.forEach(e=>{if(e.recommendation&&!next.some(a=>a.id===e.id))next.push(e)}));
  document.getElementById("nextActions").innerHTML=(next.length?next.slice(0,5):r?.exercises.slice(0,3).map(e=>({...e,recommendation:"Mantener",nextWeight:e.weight,recommendationWhy:"Completá la sesión para recibir una recomendación real."}))||[])
    .map((e,i)=>`<div class="list-row"><div class="list-main"><div class="list-icon" style="color:${i%2?"var(--green)":"#b18cff"}"><svg><use href="#${i%2?"i-trend":"i-spark"}"/></svg></div><div><div class="row-title">${e.name}</div><div class="row-sub">${e.recommendationWhy||"Basado en tu última sesión."} Próximo peso: ${e.nextWeight??e.weight} kg.</div></div></div><span class="badge ${e.recommendation==="Subir"?"badge-green":"badge-purple"}">${e.recommendation}</span></div>`).join("")||'<div class="empty">Completá una sesión para generar recomendaciones.</div>';

  const weights=data.bodyMeasurements.slice(-8).map(x=>+x.weight).filter(Number.isFinite);
  const fats=data.bodyMeasurements.slice(-8).map(x=>+x.bodyFat).filter(Number.isFinite);
  const weekVolumes=[];
  for(let i=5;i>=0;i--){const d=new Date(),range=weekRange(new Date(d.setDate(d.getDate()-i*7)));weekVolumes.push(sessionsInRange(range.start,range.end).reduce((a,x)=>a+volume(x),0))}
  document.getElementById("homeCharts").innerHTML=
    chartMarkup(weights,"#3b82f6","Peso corporal",body?`${body.weight} kg`:"—")+
    chartMarkup(fats,"#d946ef","Grasa corporal",body?.bodyFat?`${body.bodyFat}%`:"—")+
    chartMarkup(weekVolumes,"#22c55e","Volumen semanal",`${fmt(weeklyVolume)} kg`)+
    chartMarkup([0,...data.sessions.slice(-7).map(x=>x.exercises.reduce((a,e)=>Math.max(a,...e.sets.filter(s=>s.done).map(s=>+s.weight||0)),0))],"#f59e0b","Peso máximo",`${Math.max(0,...data.sessions.flatMap(x=>x.exercises.flatMap(e=>e.sets.map(s=>+s.weight||0))))} kg`)
}
function renderRoutine(){
  document.getElementById("routineGrid").innerHTML=data.routine.map((r,i)=>{
    const cardio=(r.cardio||[]);
    return `<article class="card routine-card ${r.day===new Date().getDay()?"today":""}">
      <div class="routine-head"><div><div class="routine-name">${r.name}</div><div class="routine-muscle">${r.muscle}</div></div><button class="icon-button" onclick="openRoutine(${i})"><svg><use href="#i-edit"/></svg></button></div>
      <div class="chips">
        ${r.exercises.filter(e=>e.active!==false).slice(0,5).map(e=>`<span class="chip">${e.name}</span>`).join("")}
        ${cardio.map(c=>`<span class="chip" style="color:var(--cyan);border-color:rgba(34,211,238,.3)"><svg style="width:13px;height:13px;vertical-align:-2px"><use href="#i-cardio"/></svg> ${c.name} · ${c.minutes} min</span>`).join("")}
      </div>
      <div class="caption">${r.exercises.filter(e=>e.active!==false).length} ejercicios · ${r.exercises.reduce((a,e)=>a+e.sets,0)} series${cardio.length?` · ${cardio.reduce((a,c)=>a+(+c.minutes||0),0)} min cardio`:""}</div>
    </article>`
  }).join("")
}
function renderCalendar(){const y=currentMonth.getFullYear(),m=currentMonth.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7;document.getElementById("calendarTitle").textContent=currentMonth.toLocaleDateString("es-AR",{month:"long",year:"numeric"});const cells=[];for(let i=0;i<42;i++){const d=new Date(y,m,1-offset+i),date=iso(d),s=getSession(date),outside=d.getMonth()!==m;const cls=s?.status==="completed"?"completed":s?.status==="partial"?"partial":s?.status==="skipped"?"skipped":"";cells.push(`<button class="day ${cls} ${date===iso()?"today":""}" style="${outside?"opacity:.32":""}" onclick="openDayDetail('${date}')"><span class="day-number">${d.getDate()}</span><span class="day-dot"></span></button>`)}document.getElementById("calendarGrid").innerHTML=cells.join("");const key=`${y}-${String(m+1).padStart(2,"0")}`,ss=data.sessions.filter(s=>s.date.startsWith(key)),completed=ss.filter(s=>s.status==="completed").length,vol=ss.reduce((a,s)=>a+volume(s),0);document.getElementById("monthMetrics").innerHTML=[["Entrenamientos",ss.length],["Completados",completed],["Cumplimiento",`${ss.length?Math.round(completed/ss.length*100):0}%`],["Volumen",`${fmt(vol)} kg`]].map(x=>`<div class="report-metric"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("")}
function exerciseHistory(){const map={};data.sessions.filter(s=>["completed","partial"].includes(s.status)).forEach(s=>s.exercises.forEach(e=>{const sets=e.sets.filter(x=>x.done&&!x.warmup&&x.reps);if(!sets.length)return;(map[e.id]??={name:e.name,entries:[]}).entries.push({date:s.date,sets,rec:e.recommendation,next:e.nextWeight,why:e.recommendationWhy,volume:sets.reduce((a,x)=>a+(+x.weight||0)*(+x.reps||0),0)})}));return Object.values(map)}
function renderProgress(){
  const el=document.getElementById("progressContent");
  document.querySelectorAll("[data-progress-tab]").forEach(
    b=>b.classList.toggle("active",b.dataset.progressTab===currentProgressTab)
  );

  if(currentProgressTab==="exercises"){
    const history=exerciseHistory();
    const rows=history.length
      ? history.map(item=>{
          const last=item.entries.at(-1);
          const max=Math.max(...item.entries.flatMap(entry=>entry.sets.map(set=>Number(set.weight)||0)));
          const best=Math.max(...item.entries.flatMap(entry=>entry.sets.map(set=>Number(set.reps)||0)));
          return `<div class="list-row">
            <div>
              <div class="row-title">${item.name}</div>
              <div class="row-sub">${last.date} · ${last.sets.map(set=>`${set.weight}×${set.reps}`).join(" · ")}</div>
              <div class="row-sub">${last.why||""}</div>
            </div>
            <div style="text-align:right">
              <span class="badge ${last.rec==="Subir"?"badge-green":"badge-purple"}">${last.rec||"Mantener"}</span>
              <div class="row-sub">Máx. ${max} kg · ${best} reps</div>
            </div>
          </div>`;
        }).join("")
      : '<div class="empty">Todavía no hay entrenamientos completos.</div>';

    el.innerHTML='<div class="heading-row"><h2 class="heading">EVOLUCIÓN POR EJERCICIO</h2></div>'+rows;
    return;
  }

  if(currentProgressTab==="body"){
    const rows=[...data.bodyMeasurements].sort((a,b)=>b.date.localeCompare(a.date));
    const timeline=rows.length
      ? rows.map(item=>`<div class="timeline-item">
          <div class="row-title">${item.date}</div>
          <div class="row-sub">Peso ${item.weight??"—"} kg · Grasa ${item.bodyFat??"—"}% · Cintura ${item.waist??"—"} cm</div>
          <div class="row-sub">${item.notes||"Sin notas"}</div>
        </div>`).join("")
      : '<div class="empty">Sin mediciones.</div>';

    el.innerHTML=`<div class="heading-row">
      <h2 class="heading">HISTORIAL CORPORAL</h2>
      <button class="btn btn-soft" onclick="openBody()" style="min-height:38px;padding:8px 10px">Registrar</button>
    </div><div class="timeline">${timeline}</div>`;
    return;
  }

  const records=exerciseHistory()
    .map(item=>({
      name:item.name,
      max:Math.max(...item.entries.flatMap(entry=>entry.sets.map(set=>Number(set.weight)||0))),
      reps:Math.max(...item.entries.flatMap(entry=>entry.sets.map(set=>Number(set.reps)||0)))
    }))
    .sort((a,b)=>b.max-a.max);

  const recordRows=records.length
    ? records.map(item=>`<div class="list-row">
        <div class="list-main">
          <div class="list-icon" style="color:var(--orange)"><svg><use href="#i-trophy"/></svg></div>
          <div>
            <div class="row-title">${item.name}</div>
            <div class="row-sub">Mejor marca registrada</div>
          </div>
        </div>
        <div style="text-align:right">
          <strong>${item.max} kg</strong>
          <div class="row-sub">${item.reps} reps</div>
        </div>
      </div>`).join("")
    : '<div class="empty">Tus récords aparecerán al completar entrenamientos.</div>';

  el.innerHTML='<div class="heading-row"><h2 class="heading"><svg style="color:var(--orange)"><use href="#i-trophy"/></svg>CENTRO DE RÉCORDS</h2></div>'+recordRows;
}
function renderReports(){const reportWeek=document.getElementById("reportWeek"),reportMetrics=document.getElementById("reportMetrics"),reportInsights=document.getElementById("reportInsights"),reportExercises=document.getElementById("reportExercises");if(!reportWeek||!reportMetrics||!reportInsights||!reportExercises)return;const {start,end}=weekRange(),ss=sessionsInRange(start,end),complete=ss.filter(s=>s.status==="completed").length,partial=ss.filter(s=>s.status==="partial").length,skip=ss.filter(s=>s.status==="skipped").length,vol=ss.reduce((a,s)=>a+volume(s),0),sets=ss.reduce((a,s)=>a+s.exercises.reduce((b,e)=>b+e.sets.filter(x=>x.done&&!x.warmup).length,0),0),adherence=Math.round((complete+partial*.5)/5*100);reportWeek.textContent=`${start.toLocaleDateString("es-AR",{day:"2-digit",month:"short"})} – ${end.toLocaleDateString("es-AR",{day:"2-digit",month:"short"})}`;reportMetrics.innerHTML=[["Cumplimiento",`${adherence}%`,adherence],["Sesiones",`${complete} completas`,complete/5*100],["Series",sets,Math.min(100,sets/60*100)],["Volumen",`${fmt(vol)} kg`,Math.min(100,vol/15000*100)]].map(x=>`<div class="report-metric"><span>${x[0]}</span><strong>${x[1]}</strong><div class="progress-bar"><div style="width:${x[2]}%"></div></div></div>`).join("");const insights=[["i-check","Asistencia",complete+partial?`Realizaste ${complete+partial} de 5 entrenamientos planificados.`:"Todavía no entrenaste esta semana."],["i-fire","Constancia",skip?`Registraste ${skip} ausencia${skip===1?"":"s"}. Es un dato, no un castigo.`:"No registraste ausencias."],["i-dumbbell","Carga",vol?`Moviste ${fmt(vol)} kg de volumen efectivo.`:"El volumen aparecerá al completar series."],["i-spark","Coach",complete>=3?"La semana viene sólida. Priorizá técnica y recuperación.":"Todavía podés mejorar la constancia antes del cierre semanal."]];reportInsights.innerHTML=insights.map(x=>`<div class="list-row"><div class="list-main"><div class="list-icon"><svg><use href="#${x[0]}"/></svg></div><div><div class="row-title">${x[1]}</div><div class="row-sub">${x[2]}</div></div></div></div>`).join("");const recent=[];data.sessions.slice().reverse().forEach(s=>s.exercises.forEach(e=>{if(e.recommendation&&!recent.some(x=>x.id===e.id))recent.push(e)}));reportExercises.innerHTML=recent.length?recent.slice(0,8).map(e=>`<div class="list-row"><div><div class="row-title">${e.name}</div><div class="row-sub">${e.recommendationWhy}</div></div><div style="text-align:right"><span class="badge ${e.recommendation==="Subir"?"badge-green":"badge-purple"}">${e.recommendation}</span><div class="row-sub">${e.nextWeight} kg</div></div></div>`).join(""):'<div class="empty">Completá una sesión para recibir recomendaciones.</div>'}
function renderWorkout(){
  const s=getSession();if(!s)return;
  const strengthTotal=s.exercises.reduce((a,e)=>a+e.sets.filter(x=>!x.warmup&&!e.skipped).length,0);
  const strengthDone=s.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.done&&!x.warmup).length,0);
  const cardioTotal=(s.cardio||[]).length;
  const cardioDone=(s.cardio||[]).filter(c=>c.done).length;
  const total=strengthTotal+cardioTotal,done=strengthDone+cardioDone;

  document.getElementById("focusTitle").textContent=s.muscle;
  document.getElementById("focusProgress").textContent=`${done}/${total} bloques · ${Math.round(done/Math.max(1,total)*100)}%`;

  const strengthHtml=s.exercises.map((e,i)=>{
    const exDone=e.sets.filter(x=>x.done&&!x.warmup).length;
    return `<article class="card exercise-card ${exDone>=e.targetSets?"done":""}">
      <div class="exercise-head"><div class="exercise-info"><div class="number">${i+1}</div><div><div class="row-title">${e.name}</div><div class="row-sub">${e.targetSets}×${e.minReps}-${e.maxReps} · sugerido ${e.suggestedWeight} kg · RIR ${e.rirTarget}</div></div></div><span class="badge ${exDone>=e.targetSets?"badge-green":"badge-purple"}">${exDone}/${e.targetSets}</span></div>
      <div class="set-head"><span>Serie</span><span>Kg</span><span>Reps</span><span>✓</span><span></span></div>
      ${e.sets.map((x,j)=>`<div class="set-row"><span class="caption">${x.warmup?"C":x.set}</span><input class="field" type="number" step=".5" value="${x.weight}" onchange="updateSet(${i},${j},'weight',this.value)"><input class="field" type="number" value="${x.reps}" onchange="updateSet(${i},${j},'reps',this.value)"><button class="check ${x.done?"done":""}" onclick="toggleSet(${i},${j})"><svg><use href="#i-check"/></svg></button><button class="set-menu" onclick="removeSet(${i},${j})"><svg><use href="#i-x"/></svg></button></div>`).join("")}
      <div class="exercise-tools"><button class="tool" onclick="addSet(${i})">+ Serie</button><button class="tool" onclick="addWarmup(${i})">Calentamiento</button><button class="tool ${e.tag==="Me costó"?"active":""}" onclick="tagExercise(${i},'Me costó')">Me costó</button><button class="tool ${e.tag==="Dolor"?"active":""}" onclick="tagExercise(${i},'Dolor')">Dolor</button><button class="tool ${e.skipped?"active":""}" onclick="skipExercise(${i})">Saltar</button></div>
      <textarea class="field note" placeholder="Observación del ejercicio..." onchange="updateNote(${i},this.value)">${e.note||""}</textarea>
    </article>`
  }).join("");

  const cardioHtml=(s.cardio||[]).length?`
    <div class="heading-row" style="margin:17px 2px 10px"><h2 class="heading"><svg style="color:var(--cyan)"><use href="#i-cardio"/></svg>CARDIO / FUNCIONAL</h2><span class="caption">${cardioDone}/${cardioTotal}</span></div>
    ${(s.cardio||[]).map((c,i)=>`<article class="card cardio-card ${c.done?"done":""}">
      <div class="exercise-head">
        <div class="exercise-info"><div class="cardio-time">${c.minutes}<small style="font-size:.56rem;margin-left:2px">min</small></div><div><div class="row-title">${c.name}</div><div class="row-sub">${c.type} · objetivo ${c.minutes} minutos</div></div></div>
        <span class="badge ${c.done?"badge-green":"badge-purple"}">${c.done?"Completado":"Pendiente"}</span>
      </div>
      <div class="cardio-actions">
        <div class="form-group"><label>Minutos realizados</label><input class="field" type="number" min="0" value="${c.completedMinutes}" placeholder="${c.minutes}" onchange="updateCardio(${i},'completedMinutes',this.value)"></div>
        <button class="btn ${c.done?"btn-secondary":"btn-primary"}" onclick="toggleCardio(${i})"><svg><use href="#i-check"/></svg>${c.done?"Desmarcar":"Completar"}</button>
      </div>
      <textarea class="field note" placeholder="Observación de cardio..." onchange="updateCardio(${i},'note',this.value)">${c.note||""}</textarea>
    </article>`).join("")}`:"";

  document.getElementById("workoutExercises").innerHTML=strengthHtml+cardioHtml
}
function nutritionTargets(){
  const b=latestBody()||{},s=data.nutritionSettings||{};
  const weight=Number(b.weight)||70.4,height=Number(b.height)||184,age=Number(s.age)||28;
  let bmr=10*weight+6.25*height-5*age+(s.sex==="female"?-161:5);
  let calories=bmr*(Number(s.activity)||1.55);
  const adjustment=(Number(s.adjustment)||15)/100;
  if(s.goal==="cut")calories*=1-adjustment;
  if(s.goal==="gain")calories*=1+adjustment;
  calories=Math.round(calories);
  const protein=Math.round(weight*(Number(s.proteinPerKg)||1.8));
  const fat=Math.round(weight*0.8);
  const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
  return{calories,protein,carbs,fat,weight,height}
}
function mealsForDate(date=iso(nutritionDate)){return(data.meals||[]).filter(m=>m.date===date).sort((a,b)=>(a.time||"").localeCompare(b.time||""))}
function sumMealItems(items=[]){
  return (Array.isArray(items)?items:[]).reduce((sum,item)=>({
    calories:sum.calories+(Number(item?.calories)||0),
    protein:sum.protein+(Number(item?.protein_g ?? item?.protein)||0),
    carbs:sum.carbs+(Number(item?.carbs_g ?? item?.carbs)||0),
    fat:sum.fat+(Number(item?.fat_g ?? item?.fat)||0)
  }),{calories:0,protein:0,carbs:0,fat:0});
}
function resolvedMealNutrition(meal={}){
  const items=sumMealItems(meal.items);
  const stored={
    calories:Number(meal.calories)||0,
    protein:Number(meal.protein ?? meal.protein_g)||0,
    carbs:Number(meal.carbs ?? meal.carbs_g)||0,
    fat:Number(meal.fat ?? meal.fat_g)||0
  };
  const itemsHaveData=items.calories>0||items.protein>0||items.carbs>0||items.fat>0;
  const storedAllZero=stored.calories===0&&stored.protein===0&&stored.carbs===0&&stored.fat===0;
  if(itemsHaveData&&storedAllZero)return{
    calories:Math.round(items.calories),protein:+items.protein.toFixed(1),carbs:+items.carbs.toFixed(1),fat:+items.fat.toFixed(1)
  };
  return{
    calories:stored.calories||Math.round(items.calories),
    protein:stored.protein||+items.protein.toFixed(1),
    carbs:stored.carbs||+items.carbs.toFixed(1),
    fat:stored.fat||+items.fat.toFixed(1)
  };
}
function repairMealNutritionTotals(){
  let changed=false;
  (data.meals||[]).forEach(meal=>{
    const fixed=resolvedMealNutrition(meal);
    if((Number(meal.calories)||0)!==fixed.calories||(Number(meal.protein)||0)!==fixed.protein||(Number(meal.carbs)||0)!==fixed.carbs||(Number(meal.fat)||0)!==fixed.fat){
      meal.calories=fixed.calories;meal.protein=fixed.protein;meal.carbs=fixed.carbs;meal.fat=fixed.fat;changed=true;
    }
  });
  if(changed)save();
}
function nutritionTotals(date=iso(nutritionDate)){
  return mealsForDate(date).reduce((a,m)=>{const n=resolvedMealNutrition(m);return{calories:a.calories+n.calories,protein:a.protein+n.protein,carbs:a.carbs+n.carbs,fat:a.fat+n.fat}},{calories:0,protein:0,carbs:0,fat:0})
}
const FOOD_DB=[
  {keys:["huevo","huevos"],unit:"unit",cal:72,p:6.3,c:.4,f:4.8},
  {keys:["tostada integral","tostadas integrales"],unit:"unit",cal:78,p:3,c:14,f:1.2},
  {keys:["banana","plátano"],unit:"unit",cal:105,p:1.3,c:27,f:.4},
  {keys:["scoop de whey","whey","proteína en polvo"],unit:"unit",cal:120,p:24,c:3,f:2},
  {keys:["leche proteica"],unit:"100ml",cal:55,p:6,c:5,f:1.2},
  {keys:["leche"],unit:"100ml",cal:50,p:3.4,c:4.8,f:1.8},
  {keys:["milanesa de pollo","milanesa de pechuga"],unit:"portion",cal:350,p:35,c:25,f:12},
  {keys:["milanesa de carne"],unit:"portion",cal:420,p:32,c:28,f:20},
  {keys:["milanesa de cerdo"],unit:"portion",cal:410,p:31,c:27,f:19},
  {keys:["pechuga de pollo","pollo"],unit:"100g",cal:165,p:31,c:0,f:3.6},
  {keys:["carne","churrasco"],unit:"100g",cal:240,p:27,c:0,f:14},
  {keys:["arroz"],unit:"100g",cal:130,p:2.7,c:28,f:.3},
  {keys:["puré","pure de papa","puré de papa"],unit:"100g",cal:110,p:2,c:18,f:3.5},
  {keys:["papa","papas"],unit:"100g",cal:87,p:2,c:20,f:.1},
  {keys:["batata","batatas"],unit:"100g",cal:90,p:1.6,c:21,f:.1},
  {keys:["avena"],unit:"100g",cal:389,p:17,c:66,f:7},
  {keys:["pan integral"],unit:"slice",cal:75,p:3,c:13,f:1},
  {keys:["yogur griego"],unit:"100g",cal:97,p:9,c:4,f:5},
  {keys:["porotos","frijoles"],unit:"100g",cal:127,p:8.7,c:23,f:.5},
  {keys:["ensalada"],unit:"portion",cal:80,p:3,c:12,f:2},
  {keys:["aceite de oliva"],unit:"tbsp",cal:119,p:0,c:0,f:13.5},
  {keys:["queso"],unit:"30g",cal:110,p:7,c:1,f:9}
];
function extractQuantity(text,entry,key){
  const before=text.slice(Math.max(0,text.indexOf(key)-35),text.indexOf(key)+key.length+10);
  const gram=before.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos)/i);
  const ml=before.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
  const units=before.match(/(\d+(?:[.,]\d+)?)\s*(?:x|unidades?|u\b)?/i);
  if(entry.unit==="100g"&&gram)return parseFloat(gram[1].replace(",","."))/100;
  if(entry.unit==="100ml"&&ml)return parseFloat(ml[1].replace(",","."))/100;
  if(entry.unit==="30g"&&gram)return parseFloat(gram[1].replace(",","."))/30;
  if(entry.unit==="unit"&&units)return Math.max(1,parseFloat(units[1].replace(",",".")));
  if(entry.unit==="slice"&&units)return Math.max(1,parseFloat(units[1].replace(",",".")));
  return 1
}
function estimateMealLocally(description){
  const text=description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let total={calories:0,protein:0,carbs:0,fat:0},matched=[];
  FOOD_DB.forEach(entry=>{
    const key=entry.keys.find(k=>text.includes(k.normalize("NFD").replace(/[\u0300-\u036f]/g,"")));
    if(!key)return;
    const factor=extractQuantity(text,entry,key);
    total.calories+=entry.cal*factor;total.protein+=entry.p*factor;total.carbs+=entry.c*factor;total.fat+=entry.f*factor;
    matched.push(entry.keys[0])
  });
  if(!matched.length){
    total={calories:450,protein:25,carbs:50,fat:16};
    return{...total,confidence:"Baja",explanation:"No reconocí cantidades o alimentos concretos. Usé una comida promedio; corregí los valores antes de guardar."}
  }
  const vague=!/\d/.test(text);
  return{
    calories:Math.round(total.calories),
    protein:+total.protein.toFixed(1),
    carbs:+total.carbs.toFixed(1),
    fat:+total.fat.toFixed(1),
    confidence:vague?"Media":"Alta",
    explanation:`Reconocí: ${matched.join(", ")}.${vague?" No indicaste todas las cantidades, por eso es una aproximación.":""}`
  }
}
function renderNutrition(){
  const target=nutritionTargets(),tot=nutritionTotals();
  document.getElementById("nutritionDateLabel").textContent=nutritionDate.toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  document.getElementById("nutritionGoalLabel").textContent=`Objetivo ${target.calories} kcal · ${target.protein} g proteína`;
  const macros=[
    ["calories","Calorías",Math.round(tot.calories),target.calories,"kcal","i-fire"],
    ["protein","Proteínas",Math.round(tot.protein),target.protein,"g","i-dumbbell"],
    ["carbs","Carbohidratos",Math.round(tot.carbs),target.carbs,"g","i-trend"],
    ["fat","Grasas",Math.round(tot.fat),target.fat,"g","i-food"]
  ];
  document.getElementById("macroProgress").innerHTML=macros.map(m=>{
    const pct=Math.min(100,Math.round(m[2]/Math.max(1,m[3])*100)),over=m[2]>m[3];
    return`<div class="macro-card ${m[0]} ${over?"over":""}">
      <div class="macro-top"><div class="macro-label"><svg><use href="#${m[5]}"/></svg>${m[1]}</div><div class="macro-value">${m[2]} / ${m[3]} ${m[4]}</div></div>
      <div class="macro-bar"><div class="macro-fill" style="width:${pct}%"></div></div>
    </div>`
  }).join("");
  const meals=mealsForDate();
  document.getElementById("mealCountLabel").textContent=`${meals.length} registro${meals.length===1?"":"s"}`;
  const groups={};
  meals.forEach(m=>(groups[m.type]??=[]).push(m));
  document.getElementById("dailyMeals").innerHTML=meals.length?Object.entries(groups).map(([type,list])=>`
    <div class="meal-group"><div class="meal-group-title"><div class="row-title">${type}</div><span class="caption">${Math.round(list.reduce((a,m)=>a+(+m.calories||0),0))} kcal</span></div>
    ${list.map(m=>`<div class="meal-item"><div class="meal-item-head"><div><div class="meal-name">${m.description}</div><div class="meal-time">${m.time||"Sin hora"} · ${m.confidence||"Estimado"}</div></div><button class="set-menu" onclick="deleteMeal('${m.id}')"><svg><use href="#i-x"/></svg></button></div>
      <div class="meal-macros"><span class="macro-chip">${Math.round(m.calories)} kcal</span><span class="macro-chip">${m.protein} g P</span><span class="macro-chip">${m.carbs} g C</span><span class="macro-chip">${m.fat} g G</span></div></div>`).join("")}</div>`).join(""):'<div class="empty">Todavía no registraste comidas en este día.</div>'
}
function openNutritionSettings(){
  const s=data.nutritionSettings,target=nutritionTargets();
  document.getElementById("nutritionAge").value=s.age;document.getElementById("nutritionSex").value=s.sex;
  document.getElementById("nutritionActivity").value=String(s.activity);document.getElementById("nutritionGoal").value=s.goal;
  document.getElementById("proteinPerKg").value=s.proteinPerKg;document.getElementById("calorieAdjustment").value=s.adjustment;
  renderNutritionGoalPreview();openModal("nutritionSettingsModal")
}
function readNutritionSettingsFromForm(){
  return{age:+document.getElementById("nutritionAge").value||28,sex:document.getElementById("nutritionSex").value,activity:+document.getElementById("nutritionActivity").value||1.55,goal:document.getElementById("nutritionGoal").value,proteinPerKg:+document.getElementById("proteinPerKg").value||1.8,adjustment:+document.getElementById("calorieAdjustment").value||15}
}
function renderNutritionGoalPreview(){
  const old=data.nutritionSettings;data.nutritionSettings=readNutritionSettingsFromForm();const t=nutritionTargets();data.nutritionSettings=old;
  document.getElementById("nutritionGoalPreview").innerHTML=[["Calorías",`${t.calories} kcal`],["Proteínas",`${t.protein} g`],["Carbohidratos",`${t.carbs} g`],["Grasas",`${t.fat} g`]].map(x=>`<div class="goal-box"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("")
}
window.deleteMeal=async id=>{data.meals=data.meals.filter(m=>m.id!==id);save();renderNutrition();toast('Comida eliminada')}


function updateCloudStatus(mode,title,text){
  const box=document.getElementById("cloudStatus");
  if(!box)return;
  box.className=`cloud-status ${mode||""}`;
  document.getElementById("cloudStatusTitle").textContent=title;
  document.getElementById("cloudStatusText").textContent=text;
}
function renderAuthState(){
  updateCloudStatus(
    sharedStateReady?"online":"syncing",
    sharedStateReady?"Supabase conectado":"Conectando...",
    sharedStateReady
      ? (lastCloudSync?`Última actualización: ${new Date(lastCloudSync).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`:"Estado compartido activo")
      : "Cargando el estado único de Prime Training"
  );
}
function sharedPayload(){
  return{
    data,
    profile,
    ui,
    schema_version:4,
    saved_at:new Date().toISOString()
  };
}
function applySharedPayload(payload,updatedAt=null){
  if(!payload||typeof payload!=="object")return false;
  const cloudData=payload.data&&typeof payload.data==="object"?payload.data:payload;
  data=normalizeData(Object.keys(cloudData||{}).length?cloudData:clone(defaults));
  data.savedMeals=Array.isArray(data.savedMeals)?data.savedMeals:[];
  data.meals=Array.isArray(data.meals)?data.meals:[];
  data.sessions=Array.isArray(data.sessions)?data.sessions:[];
  profile=payload.profile&&typeof payload.profile==="object"
    ?payload.profile
    :{name:"Nicolás",goal:"Proyecto Prime",photo:""};
  ui=payload.ui&&typeof payload.ui==="object"
    ?payload.ui
    :{light:false,compact:false};
  lastCloudSync=updatedAt||payload.saved_at||new Date().toISOString();
  return true;
}
function queueCloudSync(){
  if(!sharedStateReady||cloudSyncing)return;
  clearTimeout(cloudSyncTimer);
  const version=++sharedSaveVersion;
  cloudSyncTimer=setTimeout(()=>syncAllToCloud(false,version),220);
}
async function syncAllToCloud(showToast=true,version=++sharedSaveVersion){
  if(!sharedStateReady&&!showToast)return;
  clearTimeout(cloudSyncTimer);
  cloudSyncing=true;
  updateCloudStatus("syncing","Guardando...","Actualizando el estado compartido en Supabase");
  try{
    const payload=sharedPayload();
    const {data:row,error}=await sb
      .from("prime_shared_state")
      .upsert({
        id:SHARED_STATE_ID,
        state:payload,
        updated_at:new Date().toISOString()
      },{onConflict:"id"})
      .select("state,updated_at")
      .single();
    if(error)throw error;
    sharedAppliedVersion=Math.max(sharedAppliedVersion,version);
    lastCloudSync=row?.updated_at||new Date().toISOString();
    updateCloudStatus("online","Supabase conectado",`Guardado: ${new Date(lastCloudSync).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`);
    if(showToast)toast("Cambios guardados en Supabase");
    return row;
  }catch(error){
    console.error("shared save:",error);
    updateCloudStatus("error","Error al guardar",error.message||"Supabase rechazó el cambio");
    if(showToast)toast(error.message||"No se pudieron guardar los cambios");
    throw error;
  }finally{
    cloudSyncing=false;
    if(sharedSaveVersion>version)queueCloudSync();
  }
}
async function loadAllFromCloud(showToast=false){
  updateCloudStatus("syncing","Conectando...","Leyendo prime_shared_state / main");
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
      await syncAllToCloud(false);
    }else{
      applySharedPayload(row.state,row.updated_at);
      sharedStateReady=true;
      renderAll();
    }
    renderAuthState();
    if(showToast)toast("Datos actualizados desde Supabase");
    return true;
  }catch(error){
    console.error("shared load:",error);
    sharedStateReady=false;
    updateCloudStatus("error","No se pudo conectar",error.message||"Revisá las políticas de prime_shared_state");
    toast(error.message||"No se pudo cargar Supabase");
    return false;
  }
}
function subscribeToSharedState(){
  if(sharedRealtimeChannel)sb.removeChannel(sharedRealtimeChannel);
  sharedRealtimeChannel=sb
    .channel("prime-shared-state-main")
    .on("postgres_changes",{
      event:"*",
      schema:"public",
      table:"prime_shared_state",
      filter:`id=eq.${SHARED_STATE_ID}`
    },payload=>{
      const row=payload.new;
      if(!row?.state)return;
      applySharedPayload(row.state,row.updated_at);
      sharedStateReady=true;
      renderAll();
      updateCloudStatus("online","Supabase conectado","Actualizado en tiempo real");
    })
    .subscribe(status=>{
      if(status==="SUBSCRIBED"){
        updateCloudStatus("online","Supabase conectado","Sincronización en tiempo real activa");
      }
    });
}
function startSharedPolling(){
  clearInterval(sharedPollTimer);
  sharedPollTimer=setInterval(()=>{
    if(document.visibilityState==="visible"&&!cloudSyncing)loadAllFromCloud(false);
  },15000);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&!cloudSyncing)loadAllFromCloud(false);
  });
  window.addEventListener("online",()=>loadAllFromCloud(false));
}
async function initializeCloud(){
  const ok=await loadAllFromCloud(false);
  if(ok){
    subscribeToSharedState();
    startSharedPolling();
    await checkAIConnection();
  }
}
async function callSmartHandler(payload){
  const response=await fetch(SMART_HANDLER_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":SUPABASE_PUBLISHABLE_KEY,
      "Authorization":`Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    },
    body:JSON.stringify(payload)
  });
  let result;
  try{result=await response.json()}
  catch{throw new Error(`La función respondió ${response.status} sin JSON`) }
  if(!response.ok||result.ok===false)throw new Error(result.error||result.message||`Error ${response.status}`);
  return result;
}
async function checkAIConnection(){
  const badges=[
    document.getElementById("aiModeBadge"),
    document.getElementById("aiModeBadgePro")
  ].filter(Boolean);
  badges.forEach(b=>{b.className="ai-connection loading";b.textContent="Conectando IA..."});
  try{
    const result=await callSmartHandler({action:"status",live:true});
    badges.forEach(b=>{b.className="ai-connection online";b.textContent="IA conectada";b.title=result.message||"Globant AI conectada"});
  }catch(error){
    console.error(error);
    badges.forEach(b=>{b.className="ai-connection error";b.textContent="IA sin conexión";b.title=error.message});
  }
}
async function saveMealRecordToCloud(){
  await syncAllToCloud(false);
}
function renderAll(){renderProfile();applyUI();renderHome();renderRoutine();renderCalendar();renderProgress();renderNutrition();renderReports();if(getSession())renderWorkout()}
window.updateSet=(ei,si,f,v)=>{const s=getSession();if(!s)return;s.exercises[ei].sets[si][f]=v===""?"":+v;save()}
window.toggleSet=(ei,si)=>{const s=getSession(),e=s?.exercises[ei],x=e?.sets[si];if(!x)return;x.done=!x.done;if(x.done&&!x.reps)x.reps=e.minReps;save();if(x.done)startTimer(e.rest||90);renderWorkout();renderHome()}
window.addSet=ei=>{const e=getSession().exercises[ei],last=e.sets.at(-1);e.sets.push({set:e.sets.filter(x=>!x.warmup).length+1,weight:last?.weight??e.suggestedWeight,reps:"",rir:"",done:false,warmup:false,failed:false});save();renderWorkout()}
window.addWarmup=ei=>{const e=getSession().exercises[ei];e.sets.unshift({set:0,weight:Math.round(e.suggestedWeight*.5*2)/2,reps:"",rir:"",done:false,warmup:true,failed:false});save();renderWorkout()}
window.removeSet=(ei,si)=>{const e=getSession().exercises[ei];if(e.sets.length<=1)return toast("Debe quedar al menos una serie");e.sets.splice(si,1);e.sets.filter(x=>!x.warmup).forEach((x,i)=>x.set=i+1);save();renderWorkout()}
window.tagExercise=(i,t)=>{const e=getSession().exercises[i];e.tag=e.tag===t?"":t;save();renderWorkout()}
window.skipExercise=i=>{const e=getSession().exercises[i];e.skipped=!e.skipped;save();renderWorkout()}
window.updateNote=(i,v)=>{getSession().exercises[i].note=v;save()}
window.openRoutine=i=>{
  editingRoutine=i;
  const r=data.routine[i];
  r.cardio=r.cardio||[];
  document.getElementById("routineModalTitle").textContent=`Editar ${r.name}`;
  document.getElementById("routineName").value=r.name;
  document.getElementById("routineMuscle").value=r.muscle;
  renderRoutineEditor();
  renderCardioEditor();
  openModal("routineModal")
}
function renderRoutineEditor(){const r=data.routine[editingRoutine];document.getElementById("routineEditor").innerHTML=r.exercises.map((e,i)=>`<div class="spark-card" style="margin-bottom:8px"><div class="form-grid"><div class="form-group" style="grid-column:1/-1"><label>Ejercicio</label><input class="field" value="${e.name}" onchange="editRoutineExercise(${i},'name',this.value)"></div><div class="form-group"><label>Series</label><input class="field" type="number" value="${e.sets}" onchange="editRoutineExercise(${i},'sets',this.value)"></div><div class="form-group"><label>Peso</label><input class="field" type="number" step=".5" value="${e.weight}" onchange="editRoutineExercise(${i},'weight',this.value)"></div><div class="form-group"><label>Reps mín.</label><input class="field" type="number" value="${e.minReps}" onchange="editRoutineExercise(${i},'minReps',this.value)"></div><div class="form-group"><label>Reps máx.</label><input class="field" type="number" value="${e.maxReps}" onchange="editRoutineExercise(${i},'maxReps',this.value)"></div><div class="form-group"><label>Descanso</label><input class="field" type="number" value="${e.rest}" onchange="editRoutineExercise(${i},'rest',this.value)"></div><div class="form-group"><label>RIR</label><input class="field" type="number" value="${e.rir}" onchange="editRoutineExercise(${i},'rir',this.value)"></div></div><button class="btn btn-danger" onclick="deleteRoutineExercise(${i})" style="width:100%;margin-top:8px">Eliminar</button></div>`).join("")}

function renderCardioEditor(){
  const list=data.routine[editingRoutine].cardio||[];
  document.getElementById("cardioEditor").innerHTML=list.length?list.map((c,i)=>`
    <div class="cardio-row">
      <div class="form-group">
        <label>Tipo</label>
        <select class="field" onchange="editCardio(${i},'type',this.value)">
          ${["Cardio","Funcional","Movilidad","Otro"].map(type=>`<option ${c.type===type?"selected":""}>${type}</option>`).join("")}
        </select>
      </div>
      <div class="form-group cardio-name"><label>Actividad</label><input class="field" value="${c.name}" placeholder="Cinta, bici, elíptico..." onchange="editCardio(${i},'name',this.value)"></div>
      <div class="form-group"><label>Minutos</label><input class="field" type="number" min="1" value="${c.minutes}" onchange="editCardio(${i},'minutes',this.value)"></div>
      <button class="set-menu cardio-delete" onclick="deleteCardio(${i})"><svg><use href="#i-x"/></svg></button>
    </div>`).join(""):'<div class="row-sub" style="padding:10px 2px 2px">No hay cardio configurado para este día.</div>'
}
window.editCardio=(i,f,v)=>{data.routine[editingRoutine].cardio[i][f]=f==="minutes"?Math.max(1,Number(v)||1):v}
window.deleteCardio=i=>{data.routine[editingRoutine].cardio.splice(i,1);renderCardioEditor()}
window.updateCardio=(i,f,v)=>{const c=getSession().cardio[i];c[f]=f==="completedMinutes"?(v===""?"":Number(v)):v;save()}
window.toggleCardio=i=>{const c=getSession().cardio[i];c.done=!c.done;if(c.done&&!c.completedMinutes)c.completedMinutes=c.minutes;save();renderWorkout();renderHome()}

window.editRoutineExercise=(i,f,v)=>{data.routine[editingRoutine].exercises[i][f]=f==="name"?v:+v}
window.deleteRoutineExercise=i=>{data.routine[editingRoutine].exercises.splice(i,1);renderRoutineEditor()}
window.openDayDetail=date=>{const s=getSession(date);document.getElementById("calendarDetailTitle").textContent=new Date(date+"T12:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});document.getElementById("calendarDetailContent").innerHTML=s?`<div class="report-grid"><div class="report-metric"><span>Estado</span><strong>${({completed:"Completado",partial:"Parcial",skipped:"No fui",in_progress:"En curso"})[s.status]||s.status}</strong></div><div class="report-metric"><span>Ejercicios</span><strong>${s.exercises.length}</strong></div><div class="report-metric"><span>Series</span><strong>${s.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.done).length,0)}</strong></div><div class="report-metric"><span>Volumen</span><strong>${fmt(volume(s))} kg</strong></div></div><div class="list" style="margin-top:10px">${s.exercises.map(e=>`<div class="list-row"><div><div class="row-title">${e.name}</div><div class="row-sub">${e.sets.filter(x=>x.done).map(x=>`${x.weight}×${x.reps}`).join(" · ")||"Sin series"}</div></div></div>`).join("")}</div>`:'<div class="empty">No hay entrenamiento registrado.</div>';openModal("calendarDetailModal")}
function openBody(){const b=latestBody();["Weight","Height","Fat","Waist","Chest","Arm","Leg","Neck"].forEach(k=>{const key={Weight:"weight",Height:"height",Fat:"bodyFat",Waist:"waist",Chest:"chest",Arm:"arm",Leg:"leg",Neck:"neck"}[k];document.getElementById("body"+k).value=b?.[key]??""});document.getElementById("bodyNotes").value="";openModal("bodyModal")}
function startTimer(sec){clearInterval(timerId);timerSeconds=sec;document.getElementById("timer").classList.add("show");tickTimer();timerId=setInterval(()=>{timerSeconds--;tickTimer();if(timerSeconds<=0){clearInterval(timerId);document.getElementById("timer").classList.remove("show");navigator.vibrate?.([180,100,180]);toast("Descanso terminado")}},1000)}
function tickTimer(){document.getElementById("timerText").textContent=`${String(Math.floor(timerSeconds/60)).padStart(2,"0")}:${String(timerSeconds%60).padStart(2,"0")}`}
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>showPage(n.dataset.page));
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
document.querySelectorAll("[data-progress-tab]").forEach(b=>b.onclick=()=>{currentProgressTab=b.dataset.progressTab;renderProgress()});
document.getElementById("menuBtn").onclick=()=>{document.getElementById("drawer").classList.add("open");document.getElementById("drawerBackdrop").classList.add("open")};
document.getElementById("drawerClose").onclick=document.getElementById("drawerBackdrop").onclick=()=>{document.getElementById("drawer").classList.remove("open");document.getElementById("drawerBackdrop").classList.remove("open")};
document.getElementById("avatarBtn").onclick=document.getElementById("drawerProfile").onclick=()=>{pendingPhoto=profile.photo||"";renderProfile();openModal("profileModal")};
document.getElementById("drawerProgressBtn").onclick=()=>{document.getElementById("drawer").classList.remove("open");document.getElementById("drawerBackdrop").classList.remove("open");showPage("progressPage")};
function markTodaySkipped(){let s=getSession()||createTodaySession();if(!s)return;s.status="skipped";s.completedAt=new Date().toISOString();save();renderAll();toast("Marcado como no fui")}
document.getElementById("leaveWorkoutBtn").onclick=()=>showPage("homePage");
document.getElementById("finishWorkoutBtn").onclick=()=>{const s=getSession();if(!s)return;const strengthTotal=s.exercises.reduce((a,e)=>a+e.sets.filter(x=>!x.warmup&&!e.skipped).length,0),strengthDone=s.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.done&&!x.warmup).length,0),cardioTotal=(s.cardio||[]).length,cardioDone=(s.cardio||[]).filter(c=>c.done).length,total=strengthTotal+cardioTotal,done=strengthDone+cardioDone;if(done<total&&!confirm(`Completaste ${done} de ${total} bloques. ¿Finalizar como entrenamiento parcial?`))return;s.exercises.forEach(e=>{const r=recommendation(e);e.recommendation=r.label;e.nextWeight=r.next;e.recommendationWhy=r.why});s.status=done===total?"completed":"partial";s.completedAt=new Date().toISOString();save();renderAll();showPage("homePage");toast(s.status==="completed"?"Entrenamiento completado":"Guardado como parcial")};
document.getElementById("registerBodyQuick").onclick=document.getElementById("registerBodyBtn").onclick=openBody;
document.getElementById("saveBodyBtn").onclick=()=>{const val=id=>{const x=document.getElementById(id).value;return x===""?null:+x};const entry={id:crypto.randomUUID?.()||String(Date.now()),date:iso(),weight:val("bodyWeight"),height:val("bodyHeight"),bodyFat:val("bodyFat"),waist:val("bodyWaist"),chest:val("bodyChest"),arm:val("bodyArm"),leg:val("bodyLeg"),neck:val("bodyNeck"),notes:document.getElementById("bodyNotes").value.trim()};if(Object.entries(entry).filter(([k])=>!["id","date","notes"].includes(k)).every(([,v])=>v===null))return toast("Cargá al menos una medida");data.bodyMeasurements.push(entry);save();closeModal("bodyModal");renderAll();toast("Medición guardada")};
document.getElementById("profilePhotoInput").onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2.5*1024*1024)return toast("Elegí una imagen menor a 2,5 MB");const r=new FileReader();r.onload=()=>{pendingPhoto=String(r.result);document.getElementById("profilePreview").src=pendingPhoto;document.getElementById("profilePreview").hidden=false;document.getElementById("profileInitials").hidden=true};r.readAsDataURL(f)};
document.getElementById("removePhotoBtn").onclick=()=>{pendingPhoto="";document.getElementById("profilePreview").hidden=true;document.getElementById("profileInitials").hidden=false};
document.getElementById("saveProfileBtn").onclick=()=>{profile={name:document.getElementById("profileName").value.trim()||"Nicolás",goal:document.getElementById("profileGoal").value.trim()||"Proyecto Prime",photo:pendingPhoto};saveProfile();closeModal("profileModal");renderProfile();toast("Perfil actualizado")};
document.getElementById("themeToggle").onclick=()=>{ui.light=!ui.light;saveUI();applyUI()};document.getElementById("compactToggle").onclick=()=>{ui.compact=!ui.compact;saveUI();applyUI()};
document.getElementById("monthPrev").onclick=document.getElementById("calendarPrev").onclick=()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);renderCalendar()};
document.getElementById("monthNext").onclick=document.getElementById("calendarNext").onclick=()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);renderCalendar()};
document.getElementById("addExerciseBtn").onclick=()=>{data.routine[editingRoutine].exercises.push({id:"ex-"+Date.now(),name:"Nuevo ejercicio",sets:3,minReps:8,maxReps:12,weight:0,rest:90,rir:2,active:true});renderRoutineEditor()};
document.getElementById("addCardioBtn").onclick=()=>{const r=data.routine[editingRoutine];r.cardio=r.cardio||[];r.cardio.push({id:"cardio-"+Date.now(),type:"Cardio",name:"Cinta",minutes:15});renderCardioEditor()};
document.getElementById("saveRoutineBtn").onclick=()=>{const r=data.routine[editingRoutine];r.name=document.getElementById("routineName").value.trim()||r.name;r.muscle=document.getElementById("routineMuscle").value.trim()||r.muscle;r.cardio=r.cardio||[];save();closeModal("routineModal");renderAll();toast("Rutina actualizada")};
document.getElementById("newRoutineDay").onclick=()=>toast("Editá cualquiera de los cinco días configurados");
document.getElementById("timerMinus").onclick=()=>{timerSeconds=Math.max(0,timerSeconds-15);tickTimer()};document.getElementById("timerPlus").onclick=()=>{timerSeconds+=15;tickTimer()};document.getElementById("timerClose").onclick=()=>{clearInterval(timerId);document.getElementById("timer").classList.remove("show")};
document.getElementById("nutritionSettingsBtn").onclick=openNutritionSettings;document.getElementById("nutritionPrev").onclick=()=>{nutritionDate.setDate(nutritionDate.getDate()-1);renderNutrition()};document.getElementById("nutritionNext").onclick=()=>{nutritionDate.setDate(nutritionDate.getDate()+1);renderNutrition()};
document.querySelectorAll("[data-meal-example]").forEach(b=>b.onclick=()=>{document.getElementById("mealDescription").value=b.dataset.mealExample});
document.getElementById("analyzeMealBtn").onclick=async()=>{const description=document.getElementById("mealDescription").value.trim(),mealType=document.getElementById("mealType").value,button=document.getElementById("analyzeMealBtn");if(description.length<3)return toast("Describí primero lo que comiste");const body=latestBody()||{},original=button.innerHTML;button.disabled=true;button.innerHTML='<svg><use href="#i-spark"/></svg>Analizando con IA...';try{const result=await callSmartHandler({action:"analyze_meal",description,mealType,userContext:{country:"Argentina",weightKg:Number(body.weight)||70.4,heightCm:Number(body.height)||184,goal:profile.goal||"Proyecto Prime"}}),a=result.analysis;pendingMealEstimate={calories:a.calories,protein:a.protein_g,carbs:a.carbs_g,fat:a.fat_g,fiber:a.fiber_g,confidence:a.confidence,confidencePercent:a.confidence_percent,explanation:[...(a.assumptions||[]),a.clarification_suggestion||""].filter(Boolean).join(" "),items:a.items||[],normalizedName:a.normalized_name,estimatedTotalWeight:a.estimated_total_weight_g,assumptions:a.assumptions||[]};document.getElementById("estimatedCalories").value=a.calories;document.getElementById("estimatedProtein").value=a.protein_g;document.getElementById("estimatedCarbs").value=a.carbs_g;document.getElementById("estimatedFat").value=a.fat_g;document.getElementById("aiExplanation").textContent=pendingMealEstimate.explanation||"Estimación generada por IA";document.getElementById("aiConfidence").textContent=`Confianza ${a.confidence_percent}%`;document.getElementById("aiMealResult").classList.add("show");toast("Comida analizada")}catch(error){console.error(error);toast(error.message||"No se pudo analizar") }finally{button.disabled=false;button.innerHTML=original}};
document.getElementById("saveMealBtn").onclick=async()=>{const description=document.getElementById("mealDescription").value.trim();if(!description)return toast("Falta la descripción");const meal={id:crypto.randomUUID?.()||String(Date.now()),date:iso(nutritionDate),type:document.getElementById("mealType").value,time:document.getElementById("mealTime").value,description,normalizedName:pendingMealEstimate?.normalizedName||description,calories:+document.getElementById("estimatedCalories").value||0,protein:+document.getElementById("estimatedProtein").value||0,carbs:+document.getElementById("estimatedCarbs").value||0,fat:+document.getElementById("estimatedFat").value||0,fiber:pendingMealEstimate?.fiber??null,confidence:pendingMealEstimate?.confidence||"Editado",confidencePercent:pendingMealEstimate?.confidencePercent||null,estimatedTotalWeight:pendingMealEstimate?.estimatedTotalWeight??null,items:pendingMealEstimate?.items||[],assumptions:pendingMealEstimate?.assumptions||[]};data.meals.push(meal);save();await saveMealRecordToCloud(meal);document.getElementById("mealDescription").value="";document.getElementById("aiMealResult").classList.remove("show");pendingMealEstimate=null;renderNutrition();toast("Comida registrada")};
["nutritionAge","nutritionSex","nutritionActivity","nutritionGoal","proteinPerKg","calorieAdjustment"].forEach(id=>document.getElementById(id).addEventListener("input",renderNutritionGoalPreview));document.getElementById("saveNutritionSettingsBtn").onclick=()=>{data.nutritionSettings=readNutritionSettingsFromForm();save();closeModal("nutritionSettingsModal");renderNutrition();toast("Objetivos actualizados")};
document.getElementById("exportBtn").onclick=()=>{const payload={data,profile,ui,exportedAt:new Date().toISOString()},blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`prime-training-${iso()}.json`;a.click();URL.revokeObjectURL(url)};
document.getElementById("importInput").onchange=async e=>{try{const p=JSON.parse(await e.target.files[0].text());data=normalizeData(p.data||p);if(p.profile)profile=p.profile;if(p.ui)ui=p.ui;save();saveProfile();saveUI();renderAll();toast("Copia importada")}catch{toast("Archivo inválido")}};
document.getElementById("resetBtn").onclick=async()=>{
  if(!confirm("Esto eliminará toda tu rutina, entrenamientos, comidas, medidas, biblioteca y configuración compartida. ¿Continuar?"))return;
  if(prompt("Escribí BORRAR para confirmar")!=="BORRAR")return toast("Operación cancelada");
  try{
    data=normalizeData(clone(defaults));
    profile={name:"Nicolás",goal:"Proyecto Prime",photo:""};
    ui={light:false,compact:false};
    sharedStateReady=true;
    await syncAllToCloud(false);
    renderAll();showPage("homePage");
    toast("Prime Training fue restablecida");
  }catch(error){toast(error.message||"No se pudo restablecer")}
};
renderAll();showPage("homePage");
initializeCloud().finally(()=>{
  document.getElementById("sharedLoadingOverlay")?.classList.add("hidden");
});
