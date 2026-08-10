(()=>{
  "use strict";
  const page=document.getElementById("aiChatPage");
  if(!page)return;
  page.classList.add("prime-ai-v33");
  page.innerHTML=`<div class="prime-ai-shell">
    <aside class="prime-ai-sidebar" id="primeAiSidebar">
      <div class="prime-ai-sidebar-head"><strong>Conversaciones</strong><button class="prime-ai-icon" id="primeAiClose" aria-label="Cerrar"><svg><use href="#i-x"/></svg></button></div>
      <button class="prime-ai-new" id="primeAiNew"><svg width="18" height="18"><use href="#i-plus"/></svg> Nuevo chat</button>
      <div class="prime-ai-list" id="primeAiList"></div>
    </aside>
    <div class="prime-ai-backdrop" id="primeAiBackdrop"></div>
    <main class="prime-ai-main">
      <header class="prime-ai-header">
        <button class="prime-ai-icon" id="primeAiMenu" aria-label="Conversaciones"><svg><use href="#i-menu"/></svg></button>
        <div class="prime-ai-title"><strong id="primeAiTitle">Prime AI</strong><small>Entrenamiento y nutrición</small></div>
        <button class="prime-ai-icon prime-ai-delete" id="primeAiDelete" aria-label="Eliminar conversación" title="Eliminar conversación"><svg><use href="#i-trash"/></svg></button>
      </header>
      <div class="prime-ai-messages" id="primeAiMessages"></div>
      <div id="primeAiError"></div>
      <div class="prime-ai-bottom">
        <div class="prime-ai-suggestions" id="primeAiSuggestions">
          <button type="button">Analizá mi último entrenamiento</button><button type="button">¿Cómo vengo hoy con proteína?</button><button type="button">Compará mis últimas sesiones</button>
        </div>
        <form class="prime-ai-composer" id="primeAiComposer">
          <textarea class="prime-ai-input" id="primeAiInput" rows="1" placeholder="Escribile a Prime AI..."></textarea>
          <button class="prime-ai-send" id="primeAiSend" type="submit" aria-label="Enviar"><svg><use href="#i-up"/></svg></button>
        </form>
      </div>
    </main>
  </div>`;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const ensure=()=>{data.aiChats=Array.isArray(data.aiChats)?data.aiChats:[]}; ensure();
  let activeId=data.aiChats[0]?.id||null, busy=false;
  const current=()=>data.aiChats.find(x=>x.id===activeId)||null;
  function newChat(){const c={id:crypto.randomUUID?.()||String(Date.now()),title:"Nuevo chat",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[]};data.aiChats.unshift(c);activeId=c.id;save();render();return c}
  function plainInline(s){return esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>")}
  function md(text){
    const lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];let list=null,table=[];
    const flushList=()=>{if(list){out.push(`<${list.type}>${list.items.map(x=>`<li>${plainInline(x)}</li>`).join("")}</${list.type}>`);list=null}};
    const flushTable=()=>{if(table.length){const rows=table.map(r=>r.split("|").slice(1,-1).map(x=>x.trim()));if(rows.length>1&&rows[1].every(x=>/^:?-{3,}:?$/.test(x))){out.push(`<div class="prime-ai-table-wrap"><table><thead><tr>${rows[0].map(x=>`<th>${plainInline(x)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map(r=>`<tr>${r.map(x=>`<td>${plainInline(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`)}else out.push(`<p>${table.map(plainInline).join("<br>")}</p>`);table=[]}};
    for(const raw of lines){const line=raw.trim();if(line.startsWith("|")&&line.endsWith("|")){flushList();table.push(line);continue}flushTable();let m;if(!line){flushList();continue}if((m=line.match(/^(#{1,3})\s+(.+)/))){flushList();const n=m[1].length;out.push(`<h${n}>${plainInline(m[2])}</h${n}>`)}else if((m=line.match(/^[-*]\s+(.+)/))){if(!list||list.type!=="ul"){flushList();list={type:"ul",items:[]}}list.items.push(m[1])}else if((m=line.match(/^\d+[.)]\s+(.+)/))){if(!list||list.type!=="ol"){flushList();list={type:"ol",items:[]}}list.items.push(m[1])}else{flushList();out.push(`<p>${plainInline(line)}</p>`)}}
    flushList();flushTable();return out.join("");
  }
  function context(){return {profile,goal:profile?.goal||null,today:new Date().toISOString(),routine:data.routine||[],recent_sessions:(data.sessions||[]).slice(-12),today_meals:(data.meals||[]).filter(m=>(m.date||m.meal_date)===iso()),nutrition_settings:data.nutritionSettings||{},latest_body:(data.bodyMeasurements||[]).slice(-1)[0]||null,recent_reports:(data.dailyReports||[]).slice(-5)}}
  function showError(message=""){$("primeAiError").innerHTML=message?`<div class="prime-ai-error">${esc(message)}</div>`:""}
  function render(){ensure();const c=current();$("primeAiTitle").textContent=c?.title||"Prime AI";$("primeAiList").innerHTML=data.aiChats.length?data.aiChats.map(x=>`<div class="prime-ai-chat-row ${x.id===activeId?"active":""}"><button class="prime-ai-chat-open" data-open="${x.id}">${esc(x.title||"Nuevo chat")}</button><button class="prime-ai-chat-remove" data-remove="${x.id}" aria-label="Eliminar"><svg width="17" height="17"><use href="#i-trash"/></svg></button></div>`).join(""):`<div class="empty">Todavía no hay conversaciones.</div>`;
    $("primeAiList").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{activeId=b.dataset.open;closeSide();showError();render()});
    $("primeAiList").querySelectorAll("[data-remove]").forEach(b=>b.onclick=e=>{e.stopPropagation();removeChat(b.dataset.remove)});
    const msgs=c?.messages||[];$("primeAiMessages").innerHTML=!msgs.length&&!busy?`<div class="prime-ai-welcome"><div class="prime-ai-welcome-inner"><div class="prime-ai-orb">✦</div><h2>Hola, ${esc(profile?.name||"Nicolás")}</h2><p>Soy tu asistente de entrenamiento y nutrición. Preguntame algo puntual o pedime que analice tus registros.</p></div></div>`:msgs.map(m=>`<div class="prime-ai-msg ${m.role}"><div class="prime-ai-bubble">${m.role==="assistant"?md(m.content):`<p>${esc(m.content)}</p>`}</div></div>`).join("")+(busy?`<div class="prime-ai-msg assistant"><div class="prime-ai-bubble"><div class="prime-ai-thinking"><i></i><i></i><i></i></div></div></div>`:"");
    $("primeAiSend").disabled=busy||!$("primeAiInput").value.trim();requestAnimationFrame(()=>{$("primeAiMessages").scrollTop=$("primeAiMessages").scrollHeight});
  }
  function removeChat(id){const c=data.aiChats.find(x=>x.id===id);if(!c)return;if(!confirm(`¿Eliminar “${c.title||"este chat"}”?`))return;data.aiChats=data.aiChats.filter(x=>x.id!==id);if(activeId===id)activeId=data.aiChats[0]?.id||null;save();showError();render()}
  async function requestAI(payload){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);try{const res=await fetch(SMART_HANDLER_URL,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},body:JSON.stringify(payload),signal:controller.signal});const raw=await res.text();let result;try{result=JSON.parse(raw)}catch{throw new Error(`La función respondió ${res.status} sin JSON.`)}if(!res.ok||result.ok===false)throw new Error(result.error||result.message||`Error ${res.status}`);return result}finally{clearTimeout(timer)}}
  async function submit(text){text=text.trim();if(!text||busy)return;let c=current()||newChat();c.messages.push({role:"user",content:text,at:new Date().toISOString()});if(c.messages.length===1)c.title=text.length>38?text.slice(0,38)+"…":text;c.updatedAt=new Date().toISOString();busy=true;showError();save();render();try{const result=await requestAI({action:"expert_chat",messages:c.messages.slice(-20),context:context()});const answer=result.answer||result.message;if(!answer)throw new Error("Prime AI respondió sin contenido.");c.messages.push({role:"assistant",content:String(answer),at:new Date().toISOString()})}catch(error){console.error("Prime AI chat:",error);showError(error.name==="AbortError"?"Prime AI tardó demasiado. Volvé a intentar.":`No se pudo responder: ${error.message}`)}finally{busy=false;c.updatedAt=new Date().toISOString();save();render()}}
  const openSide=()=>{$("primeAiSidebar").classList.add("open");$("primeAiBackdrop").classList.add("open")},closeSide=()=>{$("primeAiSidebar").classList.remove("open");$("primeAiBackdrop").classList.remove("open")};
  $("primeAiMenu").onclick=openSide;$("primeAiClose").onclick=closeSide;$("primeAiBackdrop").onclick=closeSide;$("primeAiNew").onclick=()=>{newChat();closeSide();$("primeAiInput").focus()};$("primeAiDelete").onclick=()=>{const c=current();if(c)removeChat(c.id)};
  $("primeAiComposer").onsubmit=e=>{e.preventDefault();const v=$("primeAiInput").value;$("primeAiInput").value="";$("primeAiInput").style.height="auto";render();submit(v)};
  $("primeAiInput").oninput=e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,130)+"px";$("primeAiSend").disabled=busy||!e.target.value.trim()};$("primeAiInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("primeAiComposer").requestSubmit()}};
  $("primeAiSuggestions").querySelectorAll("button").forEach(b=>b.onclick=()=>{submit(b.textContent)});
  document.querySelector('[data-page="aiChatPage"]')?.addEventListener("click",()=>setTimeout(render,0));
  window.renderPrimeAI=render;render();
})();
