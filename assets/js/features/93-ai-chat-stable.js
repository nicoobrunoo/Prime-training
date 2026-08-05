(()=>{
  "use strict";
  const page=document.getElementById("aiChatPage");
  if(!page)return;

  // Recreate the chat once. Previous chat listeners remain attached to removed nodes.
  page.className="page prime-ai-v34";
  page.innerHTML=`<div class="pai-shell">
    <aside class="pai-sidebar" id="paiSidebar">
      <div class="pai-side-head"><div><strong>Prime AI</strong><small>Conversaciones</small></div><button class="pai-icon" id="paiClose" aria-label="Cerrar"><svg><use href="#i-x"/></svg></button></div>
      <button class="pai-new" id="paiNew"><svg><use href="#i-plus"/></svg><span>Nuevo chat</span></button>
      <div class="pai-list" id="paiList"></div>
    </aside>
    <button class="pai-backdrop" id="paiBackdrop" aria-label="Cerrar conversaciones"></button>
    <section class="pai-main">
      <header class="pai-header">
        <button class="pai-icon" id="paiMenu" aria-label="Abrir conversaciones"><svg><use href="#i-menu"/></svg></button>
        <div class="pai-heading"><strong id="paiTitle">Prime AI</strong><small>Entrenamiento y nutrición</small></div>
        <button class="pai-icon pai-delete" id="paiDelete" aria-label="Eliminar conversación"><svg><use href="#i-trash"/></svg></button>
      </header>
      <div class="pai-messages" id="paiMessages" role="log" aria-live="polite"></div>
      <div class="pai-status" id="paiStatus" hidden></div>
      <footer class="pai-footer">
        <div class="pai-prompts" id="paiPrompts"><button>Analizá mi último entrenamiento</button><button>¿Cómo vengo con proteína hoy?</button><button>Compará mis últimas sesiones</button></div>
        <form class="pai-composer" id="paiComposer">
          <textarea id="paiInput" rows="1" maxlength="5000" placeholder="Escribile a Prime AI..."></textarea>
          <button class="pai-send" id="paiSend" type="submit" aria-label="Enviar mensaje"><svg><use href="#i-up"/></svg></button>
        </form>
        <small class="pai-note">Prime AI puede equivocarse. Verificá decisiones importantes.</small>
      </footer>
    </section>
  </div>`;

  const style=document.createElement("style");
  style.id="primeAiV34Styles";
  document.getElementById(style.id)?.remove();
  style.textContent=`
  body.ai-chat-active #aiChatPage.prime-ai-v34{position:fixed!important;inset:0 0 calc(74px + env(safe-area-inset-bottom))!important;z-index:60!important;padding:0!important;overflow:hidden!important;background:#070a0f!important}
  .pai-shell{height:100%;min-height:0;display:grid;grid-template-columns:290px minmax(0,1fr);overflow:hidden;background:#070a0f;color:#f5f7fa}
  .pai-sidebar{min-width:0;display:flex;flex-direction:column;padding:14px;background:#0c1118;border-right:1px solid rgba(255,255,255,.075);z-index:130}
  .pai-side-head{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 14px}.pai-side-head strong,.pai-side-head small{display:block}.pai-side-head small{margin-top:2px;color:#7f8998;font-size:.72rem}
  .pai-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#111923;color:#edf1f6}.pai-icon svg{width:20px;height:20px}
  .pai-new{min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid rgba(255,255,255,.11);border-radius:15px;background:#151d28;color:#fff;font-weight:800}.pai-new svg{width:18px;height:18px}
  .pai-list{flex:1;min-height:0;overflow:auto;margin-top:12px;display:flex;flex-direction:column;gap:5px}
  .pai-row{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:center;border-radius:13px}.pai-row.active{background:rgba(255,255,255,.075)}
  .pai-open{min-width:0;padding:12px;border:0;background:transparent;color:#e8edf3;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:inherit}
  .pai-remove{width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:#8691a0;display:grid;place-items:center}.pai-remove svg{width:17px;height:17px}.pai-remove:hover,.pai-remove:active{color:#ff7787;background:rgba(255,92,110,.1)}
  .pai-main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:radial-gradient(circle at 50% -12%,rgba(43,199,235,.065),transparent 34%),#070a0f}
  .pai-header{flex:0 0 auto;min-height:62px;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:8px;padding:9px 13px;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(7,10,15,.91);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);z-index:4}
  .pai-heading{text-align:center;min-width:0}.pai-heading strong,.pai-heading small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pai-heading strong{font-size:.96rem}.pai-heading small{margin-top:2px;color:#7f8998;font-size:.69rem}.pai-delete{color:#ff7b8a;background:rgba(255,82,101,.07);border-color:rgba(255,92,110,.16)}
  .pai-messages{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:24px max(18px,calc((100% - 760px)/2)) 26px;scrollbar-width:thin}
  .pai-welcome{height:100%;min-height:340px;display:grid;place-items:center;text-align:center;padding:30px}.pai-welcome>div{max-width:500px}.pai-orb{width:64px;height:64px;margin:0 auto 17px;border-radius:22px;display:grid;place-items:center;font-size:1.7rem;background:linear-gradient(145deg,rgba(118,103,255,.32),rgba(38,201,234,.17));border:1px solid rgba(255,255,255,.1)}.pai-welcome h2{margin:0 0 8px;font-size:1.5rem}.pai-welcome p{margin:0;color:#8b95a4;line-height:1.55}
  .pai-msg{display:flex;margin:0 0 20px}.pai-msg.user{justify-content:flex-end}.pai-bubble{max-width:min(88%,720px);font-size:.96rem;line-height:1.62;overflow-wrap:anywhere}.pai-msg.user .pai-bubble{padding:11px 14px;border-radius:19px 19px 5px 19px;background:#182330;border:1px solid rgba(255,255,255,.08)}.pai-msg.assistant .pai-bubble{width:100%;padding:1px 0;color:#eef2f6}
  .pai-bubble p{margin:0 0 10px}.pai-bubble p:last-child{margin-bottom:0}.pai-bubble h1,.pai-bubble h2,.pai-bubble h3{margin:18px 0 9px;line-height:1.28}.pai-bubble h2{font-size:1.15rem}.pai-bubble h3{font-size:1rem}.pai-bubble ul,.pai-bubble ol{margin:8px 0 12px;padding-left:22px}.pai-bubble li{margin:5px 0}.pai-bubble code{padding:2px 5px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:#111923}
  .pai-table{overflow-x:auto;margin:12px 0;border:1px solid rgba(255,255,255,.09);border-radius:14px}.pai-table table{width:100%;min-width:480px;border-collapse:collapse;font-size:.83rem}.pai-table th,.pai-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.pai-table th{background:#101721}
  .pai-thinking{display:flex;align-items:center;gap:5px;height:32px}.pai-thinking i{width:7px;height:7px;border-radius:50%;background:#8c97a7;animation:paiDot 1s infinite ease-in-out}.pai-thinking i:nth-child(2){animation-delay:.14s}.pai-thinking i:nth-child(3){animation-delay:.28s}@keyframes paiDot{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-4px);opacity:1}}
  .pai-status{flex:0 0 auto;margin:8px max(12px,calc((100% - 790px)/2)) 0;padding:10px 12px;border-radius:13px;background:rgba(255,77,98,.1);border:1px solid rgba(255,90,110,.2);color:#ff9cab;font-size:.82rem}
  .pai-footer{flex:0 0 auto;padding:8px max(12px,calc((100% - 790px)/2)) max(9px,env(safe-area-inset-bottom));background:linear-gradient(180deg,transparent,#070a0f 18%);z-index:5}
  .pai-prompts{display:flex;gap:7px;overflow:auto;padding:0 2px 8px;scrollbar-width:none}.pai-prompts button{flex:0 0 auto;padding:8px 11px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:#0e151e;color:#98a2b0;font-size:.72rem}
  .pai-composer{display:flex;align-items:flex-end;gap:7px;min-height:56px;padding:7px 7px 7px 14px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:#121a24;box-shadow:0 16px 44px rgba(0,0,0,.32)}.pai-composer textarea{flex:1;min-width:0;resize:none;min-height:40px;max-height:130px;padding:10px 3px;border:0;outline:0;background:transparent;color:#f7f8fa;font:inherit;font-size:16px;line-height:1.35}.pai-composer textarea::placeholder{color:#707b89}
  .pai-send{flex:0 0 43px;width:43px;height:43px;border:0;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#7669ff,#26c9ea);color:white;box-shadow:0 8px 22px rgba(38,201,234,.2);transition:transform .14s,opacity .14s}.pai-send svg{width:20px;height:20px}.pai-send:active{transform:scale(.9)}.pai-send:disabled{opacity:.27;box-shadow:none}.pai-note{display:block;margin-top:6px;text-align:center;color:#586271;font-size:.62rem}
  .pai-backdrop{display:none}.pai-empty-list{padding:14px 8px;color:#707b89;font-size:.82rem}
  @media(max-width:760px){.pai-shell{grid-template-columns:1fr}.pai-sidebar{position:fixed;inset:0 auto 0 0;width:min(87vw,340px);padding-top:max(14px,env(safe-area-inset-top));transform:translateX(-104%);transition:transform .23s cubic-bezier(.2,.8,.2,1);box-shadow:25px 0 65px rgba(0,0,0,.6)}.pai-sidebar.open{transform:none}.pai-backdrop{display:block;position:fixed;inset:0;z-index:120;border:0;background:rgba(0,0,0,.62);opacity:0;pointer-events:none;transition:opacity .2s}.pai-backdrop.open{opacity:1;pointer-events:auto}.pai-header{padding-top:max(9px,env(safe-area-inset-top));min-height:calc(60px + env(safe-area-inset-top))}.pai-messages{padding:18px 15px 18px}.pai-bubble{max-width:93%}.pai-msg.assistant .pai-bubble{max-width:100%}.pai-footer{padding-left:10px;padding-right:10px;padding-bottom:8px}.pai-welcome{min-height:300px;padding:22px 18px}.pai-delete{display:grid!important}}
  `;
  document.head.appendChild(style);

  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const ensure=()=>{data.aiChats=Array.isArray(data.aiChats)?data.aiChats:[]}; ensure();
  let activeId=data.aiChats[0]?.id||null;
  let pendingChatId=null;
  let requestToken=0;
  const current=()=>data.aiChats.find(c=>c.id===activeId)||null;
  const deferSave=()=>setTimeout(()=>{try{save()}catch(e){console.warn("No se pudo programar el guardado del chat",e)}},0);

  function createChat(){const c={id:crypto.randomUUID?.()||String(Date.now()),title:"Nuevo chat",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[]};data.aiChats.unshift(c);activeId=c.id;deferSave();render();return c}
  function inline(s){return esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>")}
  function markdown(text){
    const lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];let list=null,table=[];
    const flushList=()=>{if(list){out.push(`<${list.type}>${list.items.map(x=>`<li>${inline(x)}</li>`).join("")}</${list.type}>`);list=null}};
    const flushTable=()=>{if(!table.length)return;const rows=table.map(r=>r.split("|").slice(1,-1).map(x=>x.trim()));if(rows.length>1&&rows[1].every(x=>/^:?-{3,}:?$/.test(x))){out.push(`<div class="pai-table"><table><thead><tr>${rows[0].map(x=>`<th>${inline(x)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map(r=>`<tr>${r.map(x=>`<td>${inline(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`)}else out.push(`<p>${table.map(inline).join("<br>")}</p>`);table=[]};
    for(const raw of lines){const line=raw.trim();if(line.startsWith("|")&&line.endsWith("|")){flushList();table.push(line);continue}flushTable();let m;if(!line){flushList();continue}if((m=line.match(/^(#{1,3})\s+(.+)/))){flushList();out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`)}else if((m=line.match(/^[-*]\s+(.+)/))){if(!list||list.type!=="ul"){flushList();list={type:"ul",items:[]}}list.items.push(m[1])}else if((m=line.match(/^\d+[.)]\s+(.+)/))){if(!list||list.type!=="ol"){flushList();list={type:"ol",items:[]}}list.items.push(m[1])}else{flushList();out.push(`<p>${inline(line)}</p>`)}}flushList();flushTable();return out.join("")
  }
  function appContext(){return {profile,goal:profile?.goal||null,today:new Date().toISOString(),routine:data.routine||[],recent_sessions:(data.sessions||[]).slice(-12),today_meals:(data.meals||[]).filter(m=>(m.date||m.meal_date)===iso()),nutrition_settings:data.nutritionSettings||{},latest_body:(data.bodyMeasurements||[]).slice(-1)[0]||null,recent_reports:(data.dailyReports||[]).slice(-5)}}
  function status(message=""){$("paiStatus").hidden=!message;$('paiStatus').textContent=message}
  function scrollBottom(){requestAnimationFrame(()=>{const box=$("paiMessages");box.scrollTop=box.scrollHeight})}
  function render(){
    ensure();const c=current();$("paiTitle").textContent=c?.title||"Prime AI";
    $("paiList").innerHTML=data.aiChats.length?data.aiChats.map(x=>`<div class="pai-row ${x.id===activeId?"active":""}"><button class="pai-open" data-open="${x.id}">${esc(x.title||"Nuevo chat")}</button><button class="pai-remove" data-remove="${x.id}" aria-label="Eliminar ${esc(x.title||"chat")}"><svg><use href="#i-trash"/></svg></button></div>`).join(""):`<div class="pai-empty-list">Todavía no hay conversaciones.</div>`;
    $("paiList").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{activeId=b.dataset.open;closeSidebar();status();render()});
    $("paiList").querySelectorAll("[data-remove]").forEach(b=>b.onclick=e=>{e.stopPropagation();removeChat(b.dataset.remove)});
    const msgs=c?.messages||[];const waiting=pendingChatId===activeId;
    $("paiMessages").innerHTML=!msgs.length&&!waiting?`<div class="pai-welcome"><div><div class="pai-orb">✦</div><h2>Hola, ${esc(profile?.name||"Nicolás")}</h2><p>Soy tu asistente de entrenamiento y nutrición. ¿En qué te ayudo?</p></div></div>`:msgs.map(m=>`<div class="pai-msg ${m.role}"><div class="pai-bubble">${m.role==="assistant"?markdown(m.content):`<p>${esc(m.content)}</p>`}</div></div>`).join("")+(waiting?`<div class="pai-msg assistant"><div class="pai-bubble"><div class="pai-thinking" aria-label="Prime AI está respondiendo"><i></i><i></i><i></i></div></div></div>`:"");
    $("paiSend").disabled=Boolean(pendingChatId)||!$("paiInput").value.trim();scrollBottom();
  }
  function removeChat(id){const c=data.aiChats.find(x=>x.id===id);if(!c||!confirm(`¿Eliminar “${c.title||"este chat"}”?`))return;data.aiChats=data.aiChats.filter(x=>x.id!==id);if(activeId===id)activeId=data.aiChats[0]?.id||null;if(pendingChatId===id){pendingChatId=null;requestToken++}deferSave();status();render()}
  async function callAI(payload){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),70000);try{const res=await fetch(SMART_HANDLER_URL,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},body:JSON.stringify(payload),signal:controller.signal});const raw=await res.text();let result;try{result=JSON.parse(raw)}catch{throw new Error(`Respuesta inválida (${res.status}).`)}if(!res.ok||result.ok===false)throw new Error(result.error||result.message||`Error ${res.status}`);return result}finally{clearTimeout(timer)}}
  async function submit(raw){const text=String(raw||"").trim();if(!text||pendingChatId)return;const c=current()||createChat();const chatId=c.id;const token=++requestToken;c.messages.push({role:"user",content:text,at:new Date().toISOString()});if(c.messages.length===1)c.title=text.length>42?text.slice(0,42)+"…":text;c.updatedAt=new Date().toISOString();pendingChatId=chatId;status();render();deferSave();
    try{const result=await callAI({action:"expert_chat",messages:c.messages.slice(-20),context:appContext()});if(token!==requestToken)return;const answer=result.answer||result.message;if(!answer)throw new Error("La IA respondió sin contenido.");const live=data.aiChats.find(x=>x.id===chatId);if(live)live.messages.push({role:"assistant",content:String(answer),at:new Date().toISOString()})}
    catch(error){if(token!==requestToken)return;console.error("Prime AI:",error);status(error.name==="AbortError"?"Prime AI tardó demasiado. Tocá enviar para reintentar.":`No se pudo responder: ${error.message}`)}
    finally{if(token===requestToken){pendingChatId=null;const live=data.aiChats.find(x=>x.id===chatId);if(live)live.updatedAt=new Date().toISOString();deferSave();render()}}
  }
  const openSidebar=()=>{$("paiSidebar").classList.add("open");$("paiBackdrop").classList.add("open")};
  const closeSidebar=()=>{$("paiSidebar").classList.remove("open");$("paiBackdrop").classList.remove("open")};
  $("paiMenu").onclick=openSidebar;$("paiClose").onclick=closeSidebar;$("paiBackdrop").onclick=closeSidebar;$("paiNew").onclick=()=>{createChat();closeSidebar();$("paiInput").focus()};$("paiDelete").onclick=()=>{const c=current();if(c)removeChat(c.id)};
  $("paiComposer").onsubmit=e=>{e.preventDefault();const input=$("paiInput"),value=input.value;if(!value.trim()||pendingChatId)return;input.value="";input.style.height="auto";submit(value)};
  $("paiInput").oninput=e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,130)+"px";$("paiSend").disabled=Boolean(pendingChatId)||!e.target.value.trim()};
  $("paiInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("paiComposer").requestSubmit()}};
  $("paiPrompts").querySelectorAll("button").forEach(b=>b.onclick=()=>submit(b.textContent));
  document.querySelector('[data-page="aiChatPage"]')?.addEventListener("click",()=>setTimeout(render,0));
  window.renderPrimeAI=render;render();
})();
