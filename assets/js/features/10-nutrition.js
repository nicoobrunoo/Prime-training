(() => {
  "use strict";

  const MEAL_SLOTS = [
    {type:"Desayuno",label:"Desayuno",required:true},
    {type:"Colación mañana",label:"Colación de media mañana",required:false},
    {type:"Almuerzo",label:"Almuerzo",required:true},
    {type:"Colación tarde",label:"Colación de la tarde",required:false},
    {type:"Merienda",label:"Merienda",required:true},
    {type:"Colación noche",label:"Colación nocturna",required:false},
    {type:"Cena",label:"Cena",required:true}
  ];
  const REQUIRED_MEALS = ["Desayuno","Almuerzo","Merienda","Cena"];
  window.PRIME_MEAL_SLOTS=MEAL_SLOTS;
  window.PRIME_REQUIRED_MEALS=REQUIRED_MEALS;
  let currentMealSlot = "Desayuno";
  let editingSavedMealId = null;
  let editingMealIdPro = null;

  function ensureProData() {
    data.savedMeals = data.savedMeals || [];
    data.aiInsights = data.aiInsights || {};
    data.nutritionSettings = data.nutritionSettings || {age:28,sex:"male",activity:1.55,goal:"maintain",proteinPerKg:1.8,adjustment:15};
    data.routine = data.routine || [];
    const required = [
      {day:0,name:"Domingo",muscle:"Descanso",mode:"rest"},
      {day:1,name:"Lunes",muscle:"Pecho, hombros y tríceps",mode:"training"},
      {day:2,name:"Martes",muscle:"Espalda y bíceps",mode:"training"},
      {day:3,name:"Miércoles",muscle:"Piernas",mode:"training"},
      {day:4,name:"Jueves",muscle:"Pecho y espalda",mode:"training"},
      {day:5,name:"Viernes",muscle:"Hombros, brazos y piernas",mode:"training"},
      {day:6,name:"Sábado",muscle:"Descanso",mode:"rest"}
    ];
    required.forEach(base => {
      if (!data.routine.some(day => day.day === base.day)) {
        data.routine.push({...base, exercises:[], cardio:[]});
      }
    });
    data.routine.forEach(day => {
      day.exercises = day.exercises || [];
      day.cardio = day.cardio || [];
      day.mode = day.mode || ((day.exercises.length || day.cardio.length) ? "training" : "rest");
    });
    data.routine.sort((a,b)=>((a.day+6)%7)-((b.day+6)%7));
  }

  function addSymbols() {
    const defs = document.querySelector("svg[style*='display:none']");
    if (!defs || document.getElementById("i-book")) return;
    defs.insertAdjacentHTML("beforeend", `
      <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6z"/></symbol>
      <symbol id="i-rest" viewBox="0 0 24 24"><path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5z"/><path d="M17 4h4M19 2v4"/></symbol>
    `);
  }

  function buildNutritionUI() {
    const page = document.getElementById("nutritionPage");
    if (!page) return;
    page.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">ALIMENTACIÓN</div><div class="caption">Macros, cronología y biblioteca personal</div></div>
        <button class="icon-button" id="nutritionSettingsBtn"><svg><use href="#i-settings"/></svg></button>
      </div>
      <article class="card nutrition-dashboard">
        <div class="nutrition-header-row">
          <button class="icon-button" id="nutritionPrev"><svg><use href="#i-left"/></svg></button>
          <div style="text-align:center"><div class="nutrition-day-title" id="nutritionDateLabel"></div><div class="nutrition-mode" id="nutritionGoalLabel"></div></div>
          <button class="icon-button" id="nutritionNext"><svg><use href="#i-right"/></svg></button>
        </div>
        <div class="nutrition-completion">
          <div class="mini-ring" id="mealCompletionRing"><span id="mealCompletionValue">0/4</span></div>
          <div><div class="row-title" id="mealCompletionTitle">Completá tus cuatro comidas principales</div><div class="row-sub">Desayuno, almuerzo, merienda y cena. Las colaciones son opcionales.</div></div>
        </div>
        <div class="macro-grid" id="macroProgress" style="margin-top:12px"></div>
      </article>
      <article class="nutrition-ai-review">
        <div class="heading-row" style="margin-bottom:5px"><h2 class="heading"><svg style="color:var(--cyan)"><use href="#i-brain"/></svg>ANÁLISIS DEL DÍA</h2><button class="slot-action" id="reviewNutritionDayBtn">Analizar con IA</button></div>
        <div class="row-sub" id="nutritionAIReviewText">Registrá comidas y la IA analizará cómo venís respecto de tus objetivos.</div>
      </article>
      <article class="card section">
        <div class="heading-row"><h2 class="heading"><svg style="color:var(--orange)"><use href="#i-food"/></svg>CRONOLOGÍA DEL DÍA</h2><button class="slot-action" id="openMealLibraryBtn"><svg style="width:14px;height:14px"><use href="#i-book"/></svg> Biblioteca</button></div>
        <div class="meal-timeline" id="mealTimeline"></div>
      </article>
    `;
  }

  function addModals() {
    if (document.getElementById("mealComposerProModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal" id="mealComposerProModal"><div class="sheet">
        <div class="sheet-head"><div><div class="sheet-title" id="mealComposerTitle">Agregar comida</div><div class="caption">Describí libremente la comida y la IA la descompone</div></div><button class="icon-button" data-pro-close="mealComposerProModal"><svg><use href="#i-x"/></svg></button></div>
        <div class="heading-row"><h2 class="heading"><svg style="color:#c58cff"><use href="#i-brain"/></svg>ANÁLISIS PRECISO</h2><span class="ai-connection loading" id="aiModeBadgePro">Comprobando IA...</span></div>
        <div class="barcode-entry" id="barcodeEntryPro"><input class="field" id="barcodeManualPro" inputmode="numeric" placeholder="Código de barras del producto"><button class="btn btn-soft barcode-scan-btn" id="openBarcodeScannerProBtn">Escanear</button></div>
        <div class="detected-success" id="detectedSuccessPro"><svg style="width:18px;height:18px"><use href="#i-check"/></svg> Alimento detectado</div>
        <div class="verified-product-card" id="verifiedProductCardPro"><img id="verifiedProductImagePro" alt=""><div class="verified-product-main"><span class="verified-source">Información nutricional real</span><strong id="verifiedProductNamePro"></strong><small id="verifiedProductNutritionPro"></small></div><button class="icon-button" id="clearVerifiedProductProBtn" title="Quitar producto"><svg><use href="#i-x"/></svg></button></div>
        <label class="consume-all-box" id="consumeAllBoxPro"><input type="checkbox" id="consumeWholeProductPro"><div><strong>Consumí todo el producto</strong><div class="row-sub">Calcula automáticamente el total del envase y desactiva el análisis por texto.</div></div></label>
        <div class="row-sub" id="mealDescriptionHelpPro" style="margin-bottom:7px">Después de detectar el producto, describí solamente cuánto consumiste. Para alimentos naturales, describilos y agregá una foto para mejorar el cálculo visual.</div>
        <div class="meal-description-wrap"><textarea class="field meal-textarea" id="mealDescriptionPro" placeholder="Ejemplo: tomé un vaso / comí dos unidades / pechuga con arroz..."></textarea><button class="meal-photo-btn" id="mealPhotoBtnPro" title="Sacar foto del alimento"><svg><use href="#i-camera"/></svg></button><input id="mealPhotoInputPro" type="file" accept="image/*" capture="environment" hidden></div>
        <div class="meal-photo-preview" id="mealPhotoPreviewPro"><img id="mealPhotoImagePro" alt="Foto de la comida"><div><strong>Foto agregada</strong><div class="row-sub">La IA usará texto e imagen para estimar tamaño, ingredientes y porción.</div></div><button class="icon-button" id="clearMealPhotoProBtn"><svg><use href="#i-x"/></svg></button></div>
        <div class="form-grid" style="margin-top:9px"><div class="form-group"><label>Comida</label><select class="field" id="mealTypePro"></select></div><div class="form-group"><label>Hora</label><input class="field" id="mealTimePro" type="time"></div></div>
        <button class="btn btn-primary" id="analyzeMealProBtn" style="width:100%;margin-top:10px"><svg><use href="#i-spark"/></svg>Analizar con IA</button>
        <div class="ai-result" id="aiMealProResult">
          <div class="heading-row"><div><div class="row-title" id="aiNormalizedNamePro"></div><div class="row-sub" id="aiExplanationPro"></div></div><span class="confidence" id="aiConfidencePro"></span></div>
          <div class="ai-result-grid"><div class="ai-estimate"><span>Calorías</span><input class="field" id="estimatedCaloriesPro" type="number"></div><div class="ai-estimate"><span>Proteínas (g)</span><input class="field" id="estimatedProteinPro" type="number" step=".1"></div><div class="ai-estimate"><span>Carbohidratos (g)</span><input class="field" id="estimatedCarbsPro" type="number" step=".1"></div><div class="ai-estimate"><span>Grasas (g)</span><input class="field" id="estimatedFatPro" type="number" step=".1"></div></div>
          <div class="ai-precision-panel"><div class="row-title">Desglose detectado</div><div class="ai-items-list" id="aiDetectedItemsPro"></div><div class="row-sub" id="aiRangeTextPro" style="margin-top:8px"></div></div>
          <div class="clarification-box" id="clarificationBoxPro"><div class="row-title">Podemos mejorar la precisión</div><div class="row-sub" id="clarificationQuestionPro"></div><input class="field" id="mealClarificationPro" placeholder="Ejemplo: fue sin aceite y la pechuga pesaba 220 g" style="margin-top:8px;text-align:left"><button class="btn btn-soft" id="refineMealProBtn" style="width:100%;margin-top:8px">Recalcular</button></div>
          <label class="tool" style="display:flex;align-items:center;gap:7px;margin-top:10px"><input type="checkbox" id="saveToLibraryProCheck"> Guardar también en mi biblioteca</label>
          <button class="btn btn-primary" id="saveMealProBtn" style="width:100%;margin-top:10px"><svg><use href="#i-check"/></svg>Guardar comida</button>
        </div>
      </div></div>

      <div class="modal" id="barcodeScannerProModal"><div class="sheet scanner-sheet">
        <div class="sheet-head"><div><div class="sheet-title">Escanear código de barras</div><div class="caption">Alineá el código dentro del recuadro</div></div><button class="icon-button" id="closeBarcodeScannerProBtn"><svg><use href="#i-x"/></svg></button></div>
        <div class="scanner-stage"><video id="barcodeVideoPro" muted playsinline></video><div class="scanner-overlay"></div><div class="scanner-window"></div><div class="scanner-hint">Mové lentamente el envase hasta que quede enfocado</div></div>
        <div class="scanner-status row-sub" id="barcodeScannerStatusPro">Preparando cámara...</div>
        <div class="manual-barcode"><input class="field" id="scannerManualCodePro" inputmode="numeric" placeholder="O escribí el código"><button class="btn btn-soft" id="lookupManualBarcodeProBtn">Buscar</button></div>
      </div></div>

      <div class="modal" id="mealLibraryProModal"><div class="sheet">
        <div class="sheet-head"><div><div class="sheet-title">Biblioteca de comidas</div><div class="caption">Platos listos para usar</div></div><button class="icon-button" data-pro-close="mealLibraryProModal"><svg><use href="#i-x"/></svg></button></div>
        <div class="library-toolbar"><input class="field library-search" id="mealLibraryProSearch" placeholder="Buscar plato..."><button class="icon-button" id="newSavedMealProBtn"><svg><use href="#i-plus"/></svg></button></div>
        <div class="library-grid" id="mealLibraryProGrid"></div>
      </div></div>

      <div class="modal" id="savedMealProEditorModal"><div class="sheet">
        <div class="sheet-head"><div class="sheet-title">Plato predefinido</div><button class="icon-button" data-pro-close="savedMealProEditorModal"><svg><use href="#i-x"/></svg></button></div>
        <div class="form-grid"><div class="form-group" style="grid-column:1/-1"><label>Nombre</label><input class="field" id="savedMealProName"></div><div class="form-group"><label>Calorías</label><input class="field" id="savedMealProCalories" type="number"></div><div class="form-group"><label>Proteínas</label><input class="field" id="savedMealProProtein" type="number" step=".1"></div><div class="form-group"><label>Carbohidratos</label><input class="field" id="savedMealProCarbs" type="number" step=".1"></div><div class="form-group"><label>Grasas</label><input class="field" id="savedMealProFat" type="number" step=".1"></div><div class="form-group"><label>Comida habitual</label><select class="field" id="savedMealProType"></select></div></div>
        <button class="btn btn-primary" id="saveSavedMealProBtn" style="width:100%;margin-top:10px">Guardar plato</button>
      </div></div>
    `);
  }

  function enhanceNutritionSettingsModal() {
    const modal = document.getElementById("nutritionSettingsModal");
    if (!modal || modal.dataset.proEnhanced) return;
    modal.dataset.proEnhanced = "1";
    const sheet = modal.querySelector(".sheet");
    if (!sheet) return;
    const firstGrid = sheet.querySelector(".form-grid");
    if (firstGrid) {
      firstGrid.insertAdjacentHTML("beforebegin", `
        <div class="row-title" style="margin-bottom:8px">¿Qué estás haciendo ahora?</div>
        <div class="objective-selector">
          <button class="objective-option" data-pro-goal="cut">Déficit calórico<br><small>Perder grasa</small></button>
          <button class="objective-option" data-pro-goal="maintain">Mantenimiento<br><small>Mantener peso</small></button>
          <button class="objective-option" data-pro-goal="gain">Superávit calórico<br><small>Ganar músculo</small></button>
        </div>
      `);
    }
  }

  function populateType(select, current) {
    select.innerHTML = MEAL_SLOTS.map(slot => `<option ${slot.type===current?"selected":""}>${slot.type}</option>`).join("");
  }

  const originalNutritionTargets = nutritionTargets;
  nutritionTargets = function() {
    const body = latestBody() || {};
    const settings = data.nutritionSettings || {};
    const weight = Number(body.weight) || 70.4;
    const height = Number(body.height) || 184;
    const age = Number(settings.age) || 28;
    const bmr = 10*weight + 6.25*height - 5*age + (settings.sex==="female" ? -161 : 5);
    let calories = bmr * (Number(settings.activity) || 1.55);
    const adjustment = (Number(settings.adjustment) || 15)/100;
    if (settings.goal==="cut") calories *= 1-adjustment;
    if (settings.goal==="gain") calories *= 1+adjustment;
    calories = Math.round(calories);
    const protein = Math.round(weight*(Number(settings.proteinPerKg)||1.8));
    const fat = Math.round(weight*(settings.goal==="cut"?.75:.85));
    const carbs = Math.max(0,Math.round((calories-protein*4-fat*9)/4));
    return {calories,protein,carbs,fat,weight,height,bmr:Math.round(bmr)};
  };

  function goalName(goal) {
    return goal==="cut" ? "Déficit calórico" : goal==="gain" ? "Superávit calórico" : "Mantenimiento";
  }

  function completedMainMeals() {
    const types = new Set(mealsForDate().map(m=>m.type));
    return REQUIRED_MEALS.filter(type=>types.has(type)).length;
  }

  const originalRenderNutrition = renderNutrition;
  renderNutrition = function() {
    const target = nutritionTargets();
    const totals = nutritionTotals();
    const completed = completedMainMeals();
    document.getElementById("nutritionDateLabel").textContent = nutritionDate.toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
    document.getElementById("nutritionGoalLabel").textContent = `${goalName(data.nutritionSettings.goal)} · ${target.calories} kcal`;
    document.getElementById("mealCompletionValue").textContent = `${completed}/4`;
    document.getElementById("mealCompletionRing").style.setProperty("--complete",completed/4*100);
    document.getElementById("mealCompletionTitle").textContent = completed===4 ? "Día de alimentación completo" : "Completá tus cuatro comidas principales";

    const macros = [
      ["calories","Calorías",Math.round(totals.calories),target.calories,"kcal","i-fire"],
      ["protein","Proteínas",Math.round(totals.protein),target.protein,"g","i-dumbbell"],
      ["carbs","Carbohidratos",Math.round(totals.carbs),target.carbs,"g","i-trend"],
      ["fat","Grasas",Math.round(totals.fat),target.fat,"g","i-food"]
    ];
    document.getElementById("macroProgress").innerHTML = macros.map(m=>{
      const pct=Math.min(100,Math.round(m[2]/Math.max(1,m[3])*100));
      return `<div class="macro-card ${m[0]} ${m[2]>m[3]?"over":""}"><div class="macro-top"><div class="macro-label"><svg><use href="#${m[5]}"/></svg>${m[1]}</div><div class="macro-value">${m[2]} / ${m[3]} ${m[4]}</div></div><div class="macro-bar"><div class="macro-fill" style="width:${pct}%"></div></div></div>`;
    }).join("");

    const meals = mealsForDate();
    document.getElementById("mealTimeline").innerHTML = MEAL_SLOTS.map(slot=>{
      const list=meals.filter(m=>m.type===slot.type);
      return `<div class="timeline-slot ${list.length?"complete":""} ${slot.required?"":"optional"}"><div class="slot-card"><div class="slot-head"><div><div class="slot-title"><svg style="color:${slot.required?"var(--orange)":"#a174ff"}"><use href="#${slot.required?"i-food":"i-plus"}"/></svg>${slot.label}</div><div class="slot-status">${slot.required?(list.length?"Comida principal registrada":"Obligatoria para cerrar el día"):"Opcional"}</div></div><div class="slot-actions"><button class="slot-action" data-add-slot="${slot.type}">+ Agregar</button><button class="slot-action" data-lib-slot="${slot.type}">Biblioteca</button></div></div><div class="slot-meals">${list.map(m=>`<div class="timeline-meal"><div class="timeline-meal-main"><div class="timeline-meal-title">${m.normalizedName||m.description}</div><div class="timeline-meal-sub">${m.time||"Sin hora"} · ${m.description}</div><div class="timeline-meal-macros"><span class="macro-chip">${Math.round(m.calories)} kcal</span><span class="macro-chip">${m.protein} g P</span><span class="macro-chip">${m.carbs} g C</span><span class="macro-chip">${m.fat} g G</span></div></div><div class="meal-record-actions"><button class="set-menu" data-edit-pro-meal="${m.id}" aria-label="Editar comida"><svg><use href="#i-edit"/></svg></button><button class="set-menu danger" data-delete-pro-meal="${m.id}" aria-label="Eliminar comida"><svg><use href="#i-trash"/></svg></button></div></div>`).join("")}</div></div></div>`;
    }).join("");

    document.querySelectorAll("[data-add-slot]").forEach(btn=>btn.onclick=()=>openComposer(btn.dataset.addSlot));
    document.querySelectorAll("[data-lib-slot]").forEach(btn=>btn.onclick=()=>openLibrary(btn.dataset.libSlot));
    document.querySelectorAll("[data-edit-pro-meal]").forEach(btn=>btn.onclick=()=>editProMeal(btn.dataset.editProMeal));
    document.querySelectorAll("[data-delete-pro-meal]").forEach(btn=>btn.onclick=()=>deleteProMeal(btn.dataset.deleteProMeal));
    const review = data.aiInsights?.nutrition?.[iso(nutritionDate)];
    document.getElementById("nutritionAIReviewText").textContent = review?.summary || "Registrá comidas y la IA analizará cómo venís respecto de tus objetivos.";
  };

  function openComposer(slot) {
    editingMealIdPro = null;
    currentMealSlot = slot;
    pendingMealEstimate = null;
    verifiedProductPro = null;
    mealPhotoDataPro = null;
    consumeWholeProductPro = false;
    renderVerifiedProductPro();
    renderMealPhotoPro();
    document.getElementById("barcodeManualPro").value = "";
    document.getElementById("mealComposerTitle").textContent = `Agregar ${slot.toLowerCase()}`;
    populateType(document.getElementById("mealTypePro"),slot);
    document.getElementById("mealTimePro").value = new Date().toTimeString().slice(0,5);
    document.getElementById("mealDescriptionPro").value = "";
    document.getElementById("aiMealProResult").classList.remove("show");
    document.getElementById("clarificationBoxPro").classList.remove("show");
    document.getElementById("saveToLibraryProCheck").checked = false;
    openModal("mealComposerProModal");
    checkAIConnectionPro();
  }

  async function saveLibraryItemCloud(item) {
    if (!currentUser) return;
    const row = {
      id: item.id,
      user_id: currentUser.id,
      name: item.name,
      default_meal_type: item.defaultType || null,
      calories: item.calories || 0,
      protein_g: item.protein || 0,
      carbs_g: item.carbs || 0,
      fat_g: item.fat || 0,
      fiber_g: item.fiber ?? null,
      items: item.items || [],
      source: item.source || "manual",
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from("nutrition_saved_meals").upsert(row,{onConflict:"id"});
    if (error) console.error("nutrition_saved_meals:",error);
  }

  function openLibrary(slot) {
    currentMealSlot = slot || "Desayuno";
    renderLibrary();
    openModal("mealLibraryProModal");
  }

  function renderLibrary() {
    const q=(document.getElementById("mealLibraryProSearch")?.value||"").toLowerCase();
    const list=(data.savedMeals||[]).filter(m=>(m.name||"").toLowerCase().includes(q));
    document.getElementById("mealLibraryProGrid").innerHTML=list.length?list.map(m=>`
      <div class="library-card"><h4>${m.name}</h4><p>${Math.round(m.calories)} kcal · ${m.protein} g P · ${m.carbs} g C · ${m.fat} g G</p><p>Habitual: ${m.defaultType||"Sin definir"}</p><div class="library-card-actions"><button class="btn btn-primary" style="min-height:38px;padding:8px" data-use-saved="${m.id}">Agregar</button><button class="set-menu" data-edit-saved="${m.id}"><svg><use href="#i-edit"/></svg></button></div></div>
    `).join(""):'<div class="empty" style="grid-column:1/-1">Todavía no guardaste platos.</div>';
    document.querySelectorAll("[data-use-saved]").forEach(btn=>btn.onclick=()=>useSavedMeal(btn.dataset.useSaved));
    document.querySelectorAll("[data-edit-saved]").forEach(btn=>btn.onclick=()=>editSavedMeal(btn.dataset.editSaved));
  }

  async function useSavedMeal(id) {
    const item=(data.savedMeals||[]).find(m=>m.id===id);if(!item)return;
    const meal={id:crypto.randomUUID?.()||String(Date.now()),date:iso(nutritionDate),type:currentMealSlot||item.defaultType||"Almuerzo",time:new Date().toTimeString().slice(0,5),description:item.name,normalizedName:item.name,calories:item.calories,protein:item.protein,carbs:item.carbs,fat:item.fat,fiber:item.fiber??null,confidence:"high",confidencePercent:100,source:"saved_meal",items:item.items||[],assumptions:[]};
    data.meals.push(meal);save();await saveMealRecordToCloud(meal);closeModal("mealLibraryProModal");renderNutrition();toast("Plato agregado");
  }

  function editSavedMeal(id) {
    const item=(data.savedMeals||[]).find(m=>m.id===id);if(!item)return;
    editingSavedMealId=id;
    document.getElementById("savedMealProName").value=item.name;
    document.getElementById("savedMealProCalories").value=item.calories;
    document.getElementById("savedMealProProtein").value=item.protein;
    document.getElementById("savedMealProCarbs").value=item.carbs;
    document.getElementById("savedMealProFat").value=item.fat;
    populateType(document.getElementById("savedMealProType"),item.defaultType||"Desayuno");
    openModal("savedMealProEditorModal");
  }

  function editProMeal(id) {
    const meal=(data.meals||[]).find(m=>String(m.id)===String(id));if(!meal)return;
    openComposer(meal.type||"Almuerzo");
    editingMealIdPro=meal.id;
    document.getElementById("mealComposerTitle").textContent=`Editar ${(meal.type||"comida").toLowerCase()}`;
    document.getElementById("mealDescriptionPro").value=meal.description||"";
    document.getElementById("mealTimePro").value=meal.time||new Date().toTimeString().slice(0,5);
    populateType(document.getElementById("mealTypePro"),meal.type||"Almuerzo");
    pendingMealEstimate={calories:Number(meal.calories)||0,protein:Number(meal.protein)||0,carbs:Number(meal.carbs)||0,fat:Number(meal.fat)||0,fiber:meal.fiber??null,confidence:meal.confidence||"Editado",confidencePercent:meal.confidencePercent||null,normalizedName:meal.normalizedName||meal.description,estimatedTotalWeight:meal.estimatedTotalWeight??null,items:meal.items||[],assumptions:meal.assumptions||[],range:null};
    document.getElementById("estimatedCaloriesPro").value=pendingMealEstimate.calories;
    document.getElementById("estimatedProteinPro").value=pendingMealEstimate.protein;
    document.getElementById("estimatedCarbsPro").value=pendingMealEstimate.carbs;
    document.getElementById("estimatedFatPro").value=pendingMealEstimate.fat;
    document.getElementById("aiNormalizedNamePro").textContent=pendingMealEstimate.normalizedName;
    document.getElementById("aiExplanationPro").textContent="Podés corregir la descripción, recalcular con IA o editar directamente los macros.";
    document.getElementById("aiConfidencePro").textContent="Registro editable";
    document.getElementById("aiDetectedItemsPro").innerHTML=(meal.items||[]).map(item=>`<div class="component-item"><div><strong>${item.name||"Alimento"}</strong><small>${item.component||"Comida"}</small></div><div style="text-align:right"><strong>${Math.round(Number(item.estimated_weight_g)||0)||"—"} g</strong><small>${Math.round(Number(item.calories)||0)} kcal</small></div></div>`).join("")||'<div class="row-sub">Sin desglose guardado.</div>';
    document.getElementById("aiRangeTextPro").textContent="Editá y guardá para reemplazar el registro anterior.";
    document.getElementById("clarificationBoxPro").classList.remove("show");
    document.getElementById("aiMealProResult").classList.add("show");
    document.getElementById("saveMealProBtn").innerHTML='<svg><use href="#i-check"/></svg>Guardar cambios';
  }

  async function deleteProMeal(id) {
    const meal=(data.meals||[]).find(m=>String(m.id)===String(id));
    if(!meal||!confirm(`¿Eliminar “${meal.normalizedName||meal.description||"esta comida"}”?`))return;
    data.meals=data.meals.filter(m=>String(m.id)!==String(id));save();
    renderNutrition();toast("Comida eliminada");
  }


  function productNutritionLine(product){
    const base=product.calories_serving!=null
      ? `${Math.round(product.calories_serving)} kcal por ${product.serving_size||"porción"}`
      : product.calories_100g!=null ? `${Math.round(product.calories_100g)} kcal cada 100 g` : "Datos nutricionales parciales";
    return [product.brand,product.quantity_label,base].filter(Boolean).join(" · ");
  }

  function renderVerifiedProductPro(){
    const card=document.getElementById("verifiedProductCardPro");if(!card)return;
    card.classList.toggle("show",Boolean(verifiedProductPro));
    if(!verifiedProductPro)return;
    document.getElementById("verifiedProductNamePro").textContent=[verifiedProductPro.name,verifiedProductPro.brand].filter(Boolean).join(" · ");
    document.getElementById("verifiedProductNutritionPro").textContent=productNutritionLine(verifiedProductPro);
    const img=document.getElementById("verifiedProductImagePro");
    img.src=verifiedProductPro.image_url||"";img.style.display=verifiedProductPro.image_url?"block":"none";
    document.getElementById("barcodeManualPro").value=verifiedProductPro.barcode||"";
    document.getElementById("detectedSuccessPro")?.classList.add("show");
    document.getElementById("consumeAllBoxPro")?.classList.add("show");
    document.getElementById("barcodeEntryPro")?.style.setProperty("display","none");
    updateConsumeWholeProductPro();
  }

  function parsePackageAmountPro(label){
    const text=String(label||"").toLowerCase().replace(",",".");
    const m=text.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|ml|l)\b/);if(!m)return null;
    let value=Number(m[1]);const unit=m[2];if(unit==="kg"||unit==="l")value*=1000;
    return {value,unit:(unit==="ml"||unit==="l")?"ml":"g"};
  }
  function fullProductEstimatePro(){
    if(!verifiedProductPro)return null;const pkg=parsePackageAmountPro(verifiedProductPro.quantity_label);
    if(!pkg||verifiedProductPro.calories_100g==null)return null;const factor=pkg.value/100;
    const val=k=>verifiedProductPro[k]==null?0:Math.round(verifiedProductPro[k]*factor*10)/10;
    return {calories:Math.round(verifiedProductPro.calories_100g*factor),protein:val("protein_100g"),carbs:val("carbs_100g"),fat:val("fat_100g"),fiber:verifiedProductPro.fiber_100g==null?null:val("fiber_100g"),weight:pkg.value,unit:pkg.unit};
  }
  function updateConsumeWholeProductPro(){
    const checked=Boolean(document.getElementById("consumeWholeProductPro")?.checked&&verifiedProductPro);consumeWholeProductPro=checked;
    const desc=document.getElementById("mealDescriptionPro"),analyze=document.getElementById("analyzeMealProBtn"),photo=document.getElementById("mealPhotoBtnPro");
    if(desc){desc.disabled=checked;desc.placeholder=checked?"No hace falta describir: se usará el total del envase.":"Ejemplo: tomé un vaso / comí dos unidades / pechuga con arroz...";if(checked)desc.value=`Consumí todo el producto: ${verifiedProductPro.name}`}
    if(analyze)analyze.disabled=checked;if(photo)photo.disabled=checked;
    if(checked){const e=fullProductEstimatePro();if(!e){document.getElementById("consumeWholeProductPro").checked=false;consumeWholeProductPro=false;return toast("Este producto no informa el contenido total del envase con suficiente precisión")}
      pendingMealEstimate={calories:e.calories,protein:e.protein,carbs:e.carbs,fat:e.fat,fiber:e.fiber,confidence:"high",confidencePercent:99,normalizedName:verifiedProductPro.name,estimatedTotalWeight:e.weight,items:[{component:"Producto completo",name:verifiedProductPro.name,estimated_weight_g:e.weight,calories:e.calories,protein_g:e.protein,carbs_g:e.carbs,fat_g:e.fat,confidence:"high",confidence_percent:99}],assumptions:["Se consumió el envase completo según el contenido declarado"],range:{calories_min:e.calories,calories_max:e.calories,protein_min_g:e.protein,protein_max_g:e.protein}};
      document.getElementById("estimatedCaloriesPro").value=e.calories;document.getElementById("estimatedProteinPro").value=e.protein;document.getElementById("estimatedCarbsPro").value=e.carbs;document.getElementById("estimatedFatPro").value=e.fat;document.getElementById("aiNormalizedNamePro").textContent=verifiedProductPro.name;document.getElementById("aiExplanationPro").textContent=`Total exacto del envase declarado: ${e.weight} ${e.unit}`;document.getElementById("aiConfidencePro").textContent="Datos del envase";document.getElementById("aiDetectedItemsPro").innerHTML=`<div class="component-item"><div><strong>${verifiedProductPro.name}</strong><small>Producto completo</small></div><div style="text-align:right"><strong>${e.weight} ${e.unit}</strong><small>${e.calories} kcal</small></div></div>`;document.getElementById("aiRangeTextPro").textContent="Cálculo directo, sin estimación de IA";document.getElementById("clarificationBoxPro").classList.remove("show");document.getElementById("aiMealProResult").classList.add("show");
    } else if(desc){desc.disabled=false;if(desc.value.startsWith("Consumí todo el producto:"))desc.value=""}
  }
  function renderMealPhotoPro(){const box=document.getElementById("mealPhotoPreviewPro"),img=document.getElementById("mealPhotoImagePro");if(!box)return;box.classList.toggle("show",Boolean(mealPhotoDataPro));if(mealPhotoDataPro)img.src=mealPhotoDataPro}
  function readMealPhotoPro(file){if(!file)return; if(file.size>7*1024*1024)return toast("La foto es demasiado pesada");const reader=new FileReader();reader.onload=()=>{mealPhotoDataPro=String(reader.result);renderMealPhotoPro()};reader.readAsDataURL(file)}

  async function lookupBarcodePro(code){
    const barcode=String(code||"").replace(/\D/g,"");
    if(barcode.length<8)return toast("Ingresá un código de barras válido");
    if(barcodeLookupBusyPro)return;
    barcodeLookupBusyPro=true;
    const status=document.getElementById("barcodeScannerStatusPro");if(status)status.textContent="Buscando producto y datos nutricionales...";
    try{
      const result=await callSmartHandler({action:"lookup_barcode",barcode});
      verifiedProductPro=result.product;
      renderVerifiedProductPro();
      await stopBarcodeScannerPro();
      closeModal("barcodeScannerProModal");
      document.getElementById("mealDescriptionPro")?.focus();
    }catch(error){
      console.error("lookupBarcodePro",error);
      if(status)status.textContent=error.message||"No se encontró el producto";
      toast(error.message||"No se encontró el producto");
    }finally{barcodeLookupBusyPro=false}
  }

  async function stopBarcodeScannerPro(){
    try{barcodeControlsPro?.stop?.()}catch{}
    barcodeControlsPro=null;
    const video=document.getElementById("barcodeVideoPro");
    if(video?.srcObject){video.srcObject.getTracks().forEach(track=>track.stop());video.srcObject=null}
  }

  async function startBarcodeScannerPro(){
    openModal("barcodeScannerProModal");
    const status=document.getElementById("barcodeScannerStatusPro");
    if(status)status.textContent="Solicitando acceso a la cámara...";
    try{
      if(!window.ZXingBrowser?.BrowserMultiFormatReader)throw new Error("No se pudo cargar el lector de códigos.");
      barcodeReaderPro=barcodeReaderPro||new ZXingBrowser.BrowserMultiFormatReader();
      const video=document.getElementById("barcodeVideoPro");
      barcodeControlsPro=await barcodeReaderPro.decodeFromConstraints({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720},focusMode:"continuous"}},video,(result,error)=>{
        if(result?.getText){
          const code=result.getText();
          if(status)status.textContent=`Código detectado: ${code}`;
          lookupBarcodePro(code);
        }else if(error && error.name!=="NotFoundException"){
          console.debug("scanner",error);
        }
      });
      if(status)status.textContent="Cámara activa. Alineá el código dentro del recuadro.";
    }catch(error){
      console.error("startBarcodeScannerPro",error);
      if(status)status.textContent="No se pudo abrir la cámara. Revisá el permiso o escribí el código manualmente.";
    }
  }

  async function checkAIConnectionPro() {
    const badge=document.getElementById("aiModeBadgePro");
    badge.className="ai-connection loading";badge.textContent="Conectando IA...";
    try{const result=await callSmartHandler({action:"status",live:true});badge.className="ai-connection online";badge.textContent="IA conectada";badge.title=result.message||""}
    catch(error){badge.className="ai-connection error";badge.textContent="IA sin conexión";badge.title=error.message}
  }

  async function analyzeMealPro(clarification="") {
    const description=document.getElementById("mealDescriptionPro").value.trim();
    if(description.length<3)return toast("Describí primero lo que comiste");
    const button=document.getElementById(clarification?"refineMealProBtn":"analyzeMealProBtn");
    const original=button.textContent;button.disabled=true;button.textContent="Analizando...";
    try{
      const body=latestBody()||{};
      const result=await callSmartHandler({action:"analyze_meal",description,mealType:document.getElementById("mealTypePro").value,clarification,userContext:{country:"Argentina",weightKg:+body.weight||70.4,heightCm:+body.height||184,goal:data.nutritionSettings.goal},savedMeals:(data.savedMeals||[]).slice(0,12).map(m=>({name:m.name,calories:m.calories,protein_g:m.protein,carbs_g:m.carbs,fat_g:m.fat})),verifiedProduct:verifiedProductPro,imageDataUrl:mealPhotoDataPro});
      const a=result.analysis;
      const itemTotals=sumMealItems(a.items||[]);
      const totals={
        calories:(Number(a.calories)||0)||Math.round(itemTotals.calories),
        protein:(Number(a.protein_g)||0)||+itemTotals.protein.toFixed(1),
        carbs:(Number(a.carbs_g)||0)||+itemTotals.carbs.toFixed(1),
        fat:(Number(a.fat_g)||0)||+itemTotals.fat.toFixed(1)
      };
      pendingMealEstimate={calories:totals.calories,protein:totals.protein,carbs:totals.carbs,fat:totals.fat,fiber:a.fiber_g,confidence:a.confidence,confidencePercent:a.confidence_percent,normalizedName:a.normalized_name,estimatedTotalWeight:a.estimated_total_weight_g,items:a.items||[],components:a.components||[],detectedModifiers:a.detected_modifiers||[],assumptions:a.assumptions||[],range:a.plausible_range};
      document.getElementById("estimatedCaloriesPro").value=totals.calories;document.getElementById("estimatedProteinPro").value=totals.protein;document.getElementById("estimatedCarbsPro").value=totals.carbs;document.getElementById("estimatedFatPro").value=totals.fat;document.getElementById("aiNormalizedNamePro").textContent=a.normalized_name;document.getElementById("aiExplanationPro").textContent=verifiedProductPro?`Datos reales del producto por código de barras · ${(a.assumptions||[]).slice(0,2).join(" · ")}`:((mealPhotoDataPro?"Análisis combinado de descripción + imagen · ":"")+((a.assumptions||[]).slice(0,3).join(" · ")||"Estimación generada por IA"));document.getElementById("aiConfidencePro").textContent=`Confianza ${a.confidence_percent}%`;
      {
        const grouped={};
        (a.items||[]).forEach(item=>{const key=item.component||"Comida";(grouped[key]??=[]).push(item)});
        document.getElementById("aiDetectedItemsPro").innerHTML=Object.entries(grouped).map(([component,items])=>`
          <div class="component-group">
            <div class="component-title">${component}</div>
            ${items.map(i=>`<div class="component-item">
              <div><strong>${i.name}</strong><small>${i.quantity_modifier?`${i.quantity_modifier} · `:""}${i.preparation||"Preparación no especificada"}${i.assumptions?.length?` · ${i.assumptions[0]}`:""}</small></div>
              <div style="text-align:right"><strong>${i.estimated_weight_g??"—"} g</strong><small>${i.calories} kcal · confianza ${i.confidence_percent??"—"}%</small></div>
            </div>`).join("")}
          </div>`).join("");
      }
      document.getElementById("aiRangeTextPro").textContent=a.plausible_range?`Rango plausible: ${a.plausible_range.calories_min}-${a.plausible_range.calories_max} kcal · proteína ${a.plausible_range.protein_min_g}-${a.plausible_range.protein_max_g} g`:"";
      document.getElementById("clarificationBoxPro").classList.toggle("show",Boolean(a.clarification_suggestion));document.getElementById("clarificationQuestionPro").textContent=a.clarification_suggestion||"";document.getElementById("aiMealProResult").classList.add("show");
    }catch(error){
      console.error("analyzeMealPro:",error,{savedMeals:data?.savedMeals,meals:data?.meals});
      toast(error.message||"No se pudo analizar la comida");
    }finally{button.disabled=false;button.textContent=original}
  }

  async function reviewNutritionDay() {
    const button=document.getElementById("reviewNutritionDayBtn");button.disabled=true;button.textContent="Analizando...";
    try{
      const result=await callSmartHandler({action:"nutrition_day_review",context:{date:iso(nutritionDate),targets:nutritionTargets(),totals:nutritionTotals(),meals:mealsForDate().map(m=>({type:m.type,description:m.description,calories:m.calories,protein:m.protein,carbs:m.carbs,fat:m.fat})),completed_main_meals:completedMainMeals()}});
      data.aiInsights.nutrition=data.aiInsights.nutrition||{};data.aiInsights.nutrition[iso(nutritionDate)]=result.review;save();renderNutrition();toast("Análisis actualizado");
    }catch(error){toast(error.message||"No se pudo analizar el día")}finally{button.disabled=false;button.textContent="Analizar con IA"}
  }

  async function refreshCoach() {
    const button=document.getElementById("refreshCoachAIPro");if(button)button.disabled=true;
    try{
      const {start,end}=weekRange();
      const result=await callSmartHandler({action:"coach_insight",context:{date:iso(),profile:{goal:profile.goal},body:latestBody(),nutrition:{targets:nutritionTargets(),today:nutritionTotals(iso())},workouts:sessionsInRange(start,end).map(s=>({date:s.date,status:s.status,volume:volume(s)})),streak:streak(),prime_score:primeScore()}});
      data.aiInsights.coach={...result.insight,updatedAt:new Date().toISOString()};save();
      document.getElementById("coachText").textContent=`${result.insight.headline}. ${result.insight.summary}`;toast("Prime Coach actualizado");
    }catch(error){toast(error.message||"No se pudo actualizar")}finally{if(button)button.disabled=false}
  }

  function enhanceCoach() {
    const title=document.querySelector(".coach-title");
    if(!title||document.getElementById("refreshCoachAIPro"))return;
    title.insertAdjacentHTML("beforeend",`<button class="slot-action" id="refreshCoachAIPro" style="margin-left:auto">Actualizar IA</button>`);
    document.getElementById("refreshCoachAIPro").onclick=refreshCoach;
    if(data.aiInsights.coach)document.getElementById("coachText").textContent=`${data.aiInsights.coach.headline}. ${data.aiInsights.coach.summary}`;
  }

  // Rutina de 7 días y descansos
  const originalCreateTodaySession=createTodaySession;
  createTodaySession=function(){const routine=todayRoutine();if(!routine||routine.mode==="rest")return null;return originalCreateTodaySession()};

  const originalRenderRoutine=renderRoutine;
  renderRoutine=function(){
    document.getElementById("routineGrid").innerHTML=data.routine.map((r,i)=>{
      const isRest=r.mode==="rest",cardio=r.cardio||[];
      return `<article class="card routine-card ${r.day===new Date().getDay()?"today":""}"><div class="routine-head"><div><div class="routine-name">${r.name}</div><div class="routine-muscle">${r.muscle}</div></div><button class="icon-button" data-edit-day="${i}"><svg><use href="#i-edit"/></svg></button></div>${isRest?`<div class="rest-day-card" style="margin-top:12px"><div class="rest-icon"><svg><use href="#i-rest"/></svg></div><div><div class="row-title">Descanso programado</div><div class="row-sub">Se marca automáticamente en el calendario.</div></div></div>`:`<div class="chips">${r.exercises.filter(e=>e.active!==false).slice(0,5).map(e=>`<span class="chip">${e.name}</span>`).join("")}${cardio.map(c=>`<span class="chip">${c.name} · ${c.minutes} min</span>`).join("")}</div><div class="caption">${r.exercises.length} ejercicios · ${r.exercises.reduce((a,e)=>a+e.sets,0)} series</div>`}</article>`;
    }).join("");
    document.querySelectorAll("[data-edit-day]").forEach(btn=>btn.onclick=()=>openRoutinePro(+btn.dataset.editDay));
  };

  function enhanceRoutineModal() {
    const modal=document.getElementById("routineModal");if(!modal||modal.dataset.proEnhanced)return;
    modal.dataset.proEnhanced="1";
    const grid=modal.querySelector(".form-grid");
    if(grid)grid.insertAdjacentHTML("beforebegin",`<div class="day-mode-selector"><button class="day-mode-btn" data-pro-day-mode="training">Día de entrenamiento</button><button class="day-mode-btn" data-pro-day-mode="rest">Día de descanso</button></div>`);
  }

  function openRoutinePro(index) {
    editingRoutine=index;
    const r=data.routine[index];r.cardio=r.cardio||[];r.mode=r.mode||"training";
    document.getElementById("routineModalTitle").textContent=`Editar ${r.name}`;
    document.getElementById("routineName").value=r.name;document.getElementById("routineMuscle").value=r.muscle;
    renderRoutineEditor();renderCardioEditor();
    document.querySelectorAll("[data-pro-day-mode]").forEach(btn=>btn.classList.toggle("active",btn.dataset.proDayMode===r.mode));
    updateRoutineModeUI();
    openModal("routineModal");
  }

  function updateRoutineModeUI() {
    const rest=document.querySelector("[data-pro-day-mode].active")?.dataset.proDayMode==="rest";
    document.getElementById("routineEditor").style.display=rest?"none":"block";
    const cardio=document.getElementById("cardioEditor")?.closest(".cardio-config");if(cardio)cardio.style.display=rest?"none":"block";
    document.getElementById("addExerciseBtn").style.display=rest?"none":"flex";
  }

  const originalRenderCalendar=renderCalendar;
  renderCalendar=function(){
    originalRenderCalendar();
    document.querySelectorAll(".day").forEach((cell,index)=>{
      const y=currentMonth.getFullYear(),m=currentMonth.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,d=new Date(y,m,1-offset+index);
      if(!getSession(iso(d))&&data.routine.find(r=>r.day===d.getDay())?.mode==="rest")cell.classList.add("rest");
    });
  };

  function bindProEvents() {
    document.querySelectorAll("[data-pro-close]").forEach(btn=>btn.onclick=()=>closeModal(btn.dataset.proClose));
    document.getElementById("nutritionSettingsBtn").onclick=()=>{
      openNutritionSettings();
      setTimeout(()=>{
        const goal=data.nutritionSettings.goal||"maintain";
        document.querySelectorAll("[data-pro-goal]").forEach(btn=>btn.classList.toggle("active",btn.dataset.proGoal===goal));
      },0);
    };
    document.getElementById("nutritionPrev").onclick=()=>{nutritionDate.setDate(nutritionDate.getDate()-1);renderNutrition()};
    document.getElementById("nutritionNext").onclick=()=>{nutritionDate.setDate(nutritionDate.getDate()+1);renderNutrition()};
    document.getElementById("openMealLibraryBtn").onclick=()=>openLibrary("Desayuno");
    document.getElementById("reviewNutritionDayBtn").onclick=reviewNutritionDay;
    document.getElementById("openBarcodeScannerProBtn").onclick=()=>startBarcodeScannerPro();
    document.getElementById("closeBarcodeScannerProBtn").onclick=async()=>{await stopBarcodeScannerPro();closeModal("barcodeScannerProModal")};
    document.getElementById("lookupManualBarcodeProBtn").onclick=()=>lookupBarcodePro(document.getElementById("scannerManualCodePro").value);
    document.getElementById("barcodeManualPro").addEventListener("change",event=>lookupBarcodePro(event.target.value));
    document.getElementById("clearVerifiedProductProBtn").onclick=()=>{verifiedProductPro=null;consumeWholeProductPro=false;document.getElementById("consumeWholeProductPro").checked=false;document.getElementById("verifiedProductCardPro").classList.remove("show");document.getElementById("detectedSuccessPro").classList.remove("show");document.getElementById("consumeAllBoxPro").classList.remove("show");document.getElementById("barcodeEntryPro").style.display="grid";document.getElementById("barcodeManualPro").value="";updateConsumeWholeProductPro()};
    document.getElementById("consumeWholeProductPro").onchange=updateConsumeWholeProductPro;
    document.getElementById("mealPhotoBtnPro").onclick=()=>document.getElementById("mealPhotoInputPro").click();
    document.getElementById("mealPhotoInputPro").onchange=e=>readMealPhotoPro(e.target.files?.[0]);
    document.getElementById("clearMealPhotoProBtn").onclick=()=>{mealPhotoDataPro=null;document.getElementById("mealPhotoInputPro").value="";renderMealPhotoPro()};
    document.getElementById("analyzeMealProBtn").onclick=()=>analyzeMealPro("");
    document.getElementById("refineMealProBtn").onclick=()=>analyzeMealPro(document.getElementById("mealClarificationPro").value.trim());
    document.getElementById("saveMealProBtn").onclick=async()=>{
      const description=document.getElementById("mealDescriptionPro").value.trim();if(!description||!pendingMealEstimate)return toast("Analizá la comida primero");
      const previous=editingMealIdPro?(data.meals||[]).find(m=>String(m.id)===String(editingMealIdPro)):null;
      const meal={...previous,id:editingMealIdPro||crypto.randomUUID?.()||String(Date.now()),date:iso(nutritionDate),type:document.getElementById("mealTypePro").value,time:document.getElementById("mealTimePro").value,description,normalizedName:pendingMealEstimate.normalizedName,calories:+document.getElementById("estimatedCaloriesPro").value||0,protein:+document.getElementById("estimatedProteinPro").value||0,carbs:+document.getElementById("estimatedCarbsPro").value||0,fat:+document.getElementById("estimatedFatPro").value||0,fiber:pendingMealEstimate.fiber,confidence:pendingMealEstimate.confidence,confidencePercent:pendingMealEstimate.confidencePercent,estimatedTotalWeight:pendingMealEstimate.estimatedTotalWeight,items:pendingMealEstimate.items,assumptions:pendingMealEstimate.assumptions,source:verifiedProductPro?"barcode_verified":(mealPhotoDataPro?"ai_visual_estimate":(previous?.source||"ai_estimate")),verifiedProduct:verifiedProductPro||null,hasMealPhoto:Boolean(mealPhotoDataPro),consumedWholeProduct:consumeWholeProductPro};
      const existingIndex=(data.meals||[]).findIndex(m=>String(m.id)===String(meal.id));
      if(existingIndex>=0)data.meals[existingIndex]=meal;else data.meals.push(meal);
      if(document.getElementById("saveToLibraryProCheck").checked){
        const libraryItem={id:crypto.randomUUID?.()||String(Date.now()+1),name:meal.normalizedName||meal.description,calories:meal.calories,protein:meal.protein,carbs:meal.carbs,fat:meal.fat,fiber:meal.fiber,defaultType:meal.type,items:meal.items,source:"ai"};
        (data.savedMeals||(data.savedMeals=[])).push(libraryItem);
        await saveLibraryItemCloud(libraryItem);
      }
      save();await saveMealRecordToCloud(meal);
      editingMealIdPro=null;pendingMealEstimate=null;verifiedProductPro=null;mealPhotoDataPro=null;consumeWholeProductPro=false;
      document.getElementById("barcodeManualPro").value="";document.getElementById("scannerManualCodePro").value="";
      document.getElementById("verifiedProductCardPro").classList.remove("show");document.getElementById("detectedSuccessPro").classList.remove("show");document.getElementById("consumeAllBoxPro").classList.remove("show");document.getElementById("barcodeEntryPro").style.display="grid";
      document.getElementById("saveMealProBtn").innerHTML='<svg><use href="#i-check"/></svg>Guardar comida';
      closeModal("mealComposerProModal");renderNutrition();toast(existingIndex>=0?"Comida actualizada":"Comida registrada");
    };
    document.getElementById("mealLibraryProSearch").oninput=renderLibrary;
    document.getElementById("newSavedMealProBtn").onclick=()=>{editingSavedMealId=null;["Name","Calories","Protein","Carbs","Fat"].forEach(x=>document.getElementById("savedMealPro"+x).value="");populateType(document.getElementById("savedMealProType"),currentMealSlot);openModal("savedMealProEditorModal")};
    document.getElementById("saveSavedMealProBtn").onclick=()=>{
      const item={id:finalEditingSavedMealId||crypto.randomUUID?.()||String(Date.now()),name:document.getElementById("savedMealProName").value.trim(),calories:+document.getElementById("savedMealProCalories").value||0,protein:+document.getElementById("savedMealProProtein").value||0,carbs:+document.getElementById("savedMealProCarbs").value||0,fat:+document.getElementById("savedMealProFat").value||0,defaultType:document.getElementById("savedMealProType").value,source:"manual"};
      if(!item.name)return toast("Poné un nombre");const idx=(data.savedMeals||[]).findIndex(x=>x.id===item.id);if(idx>=0)data.savedMeals[idx]=item;else (data.savedMeals||(data.savedMeals=[])).push(item);save();saveLibraryItemCloud(item);closeModal("savedMealProEditorModal");renderLibrary();toast("Plato guardado");
    };
    document.querySelectorAll("[data-pro-goal]").forEach(btn=>btn.onclick=()=>{
      document.querySelectorAll("[data-pro-goal]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
      document.getElementById("nutritionGoal").value=btn.dataset.proGoal;renderNutritionGoalPreview();
    });
    document.querySelectorAll("[data-pro-day-mode]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll("[data-pro-day-mode]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");updateRoutineModeUI()});
    const saveRoutineButton=document.getElementById("saveRoutineBtn");
    saveRoutineButton.onclick=()=>{
      const r=data.routine[editingRoutine];r.name=document.getElementById("routineName").value.trim()||r.name;r.muscle=document.getElementById("routineMuscle").value.trim()||r.muscle;r.mode=document.querySelector("[data-pro-day-mode].active")?.dataset.proDayMode||"training";save();closeModal("routineModal");renderAll();toast("Rutina actualizada");
    };
  }

  window.renderVerifiedProductPro=renderVerifiedProductPro;
  window.lookupBarcodePro=lookupBarcodePro;
  window.stopBarcodeScannerPro=stopBarcodeScannerPro;
  window.startBarcodeScannerPro=startBarcodeScannerPro;

  ensureProData();
  addSymbols();
  buildNutritionUI();
  addModals();
  enhanceNutritionSettingsModal();
  enhanceRoutineModal();
  enhanceCoach();
  bindProEvents();
  save();
  renderAll();
})();
