import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GEAI_API_URL =
  Deno.env.get("GEAI_API_URL")?.trim() ||
  "https://api.saia.ai/proxy/openai/v1/chat/completions";

const GEAI_MODEL =
  Deno.env.get("GEAI_MODEL")?.trim() ||
  "gpt-4o";

type JsonRecord = Record<string, unknown>;

interface MealAnalysis {
  description: string;
  normalized_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  confidence: "low" | "medium" | "high";
  confidence_percent: number;
  estimated_total_weight_g: number | null;
  detected_modifiers: Array<Record<string, unknown>>;
  components: Array<Record<string, unknown>>;
  plausible_range: {
    calories_min: number;
    calories_max: number;
    protein_min_g: number;
    protein_max_g: number;
  };
  items: Array<{
    name: string;
    component: string;
    preparation: string | null;
    quantity_modifier: string | null;
    estimated_quantity: number | null;
    unit: string | null;
    estimated_weight_g: number | null;
    weight_range_min_g: number | null;
    weight_range_max_g: number | null;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: string;
    confidence_percent: number;
    assumptions: string[];
    correction_hint: string | null;
  }>;
  assumptions: string[];
  uncertainty_reasons: string[];
  clarification_suggestion: string | null;
  source: "ai_estimate";
}

function jsonResponse(data: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("La IA no devolvió un JSON válido.");
    }
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
}

function normalizeMealAnalysis(
  raw: unknown,
  originalDescription: string,
): MealAnalysis {
  if (!raw || typeof raw !== "object") {
    throw new Error("La respuesta de IA tiene un formato inválido.");
  }

  const data = raw as Record<string, unknown>;
  const range = data.plausible_range &&
      typeof data.plausible_range === "object"
    ? data.plausible_range as Record<string, unknown>
    : {};

  const items = (Array.isArray(data.items) ? data.items : []).map(
    (item): MealAnalysis["items"][number] => {
      const row = item && typeof item === "object"
        ? item as Record<string, unknown>
        : {};
      return {
        name: String(row.name || "Alimento"),
        component: String(row.component || "Comida"),
        preparation: row.preparation == null
          ? null
          : String(row.preparation),
        quantity_modifier: row.quantity_modifier == null
          ? null
          : String(row.quantity_modifier),
        estimated_quantity: row.estimated_quantity == null
          ? null
          : round(safeNumber(row.estimated_quantity), 2),
        unit: row.unit == null ? null : String(row.unit),
        estimated_weight_g: row.estimated_weight_g == null
          ? null
          : Math.max(0, Math.round(safeNumber(row.estimated_weight_g))),
        weight_range_min_g: row.weight_range_min_g == null
          ? null
          : Math.max(0, Math.round(safeNumber(row.weight_range_min_g))),
        weight_range_max_g: row.weight_range_max_g == null
          ? null
          : Math.max(0, Math.round(safeNumber(row.weight_range_max_g))),
        calories: Math.max(0, Math.round(safeNumber(row.calories))),
        protein_g: Math.max(0, round(safeNumber(row.protein_g))),
        carbs_g: Math.max(0, round(safeNumber(row.carbs_g))),
        fat_g: Math.max(0, round(safeNumber(row.fat_g))),
        confidence: ["low","medium","high"].includes(String(row.confidence))
          ? String(row.confidence)
          : "medium",
        confidence_percent: Math.round(
          clamp(safeNumber(row.confidence_percent, 60), 0, 100),
        ),
        assumptions: Array.isArray(row.assumptions)
          ? row.assumptions.map(String).slice(0, 10)
          : [],
        correction_hint: row.correction_hint == null
          ? null
          : String(row.correction_hint),
      };
    },
  );

  const confidenceRaw = String(data.confidence || "medium").toLowerCase();
  const confidence: MealAnalysis["confidence"] =
    confidenceRaw === "high" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  const itemTotals = items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein_g,
      carbs: sum.carbs + item.carbs_g,
      fat: sum.fat + item.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  // Algunos modelos completan correctamente cada ingrediente pero dejan los
  // totales superiores en cero. En ese caso, la suma de ítems es la fuente
  // más consistente y evita guardar comidas con todos los macros en 0.
  const caloriesFromModel = Math.max(0, Math.round(safeNumber(data.calories)));
  const proteinFromModel = Math.max(0, round(safeNumber(data.protein_g)));
  const carbsFromModel = Math.max(0, round(safeNumber(data.carbs_g)));
  const fatFromModel = Math.max(0, round(safeNumber(data.fat_g)));
  const hasItemTotals = items.length > 0 && itemTotals.calories > 0;
  const calorieMismatch = hasItemTotals && caloriesFromModel > 0 &&
    Math.abs(caloriesFromModel - itemTotals.calories) / Math.max(1, itemTotals.calories) > 0.05;
  const macroMismatch = hasItemTotals && (
    Math.abs(proteinFromModel - itemTotals.protein) > Math.max(2, itemTotals.protein * 0.08) ||
    Math.abs(carbsFromModel - itemTotals.carbs) > Math.max(3, itemTotals.carbs * 0.08) ||
    Math.abs(fatFromModel - itemTotals.fat) > Math.max(2, itemTotals.fat * 0.08)
  );
  // Los ingredientes desglosados son auditables. Si el encabezado contradice
  // su propia suma, se usa la suma de ítems para evitar macros incoherentes.
  const calories = calorieMismatch || !caloriesFromModel
    ? Math.round(itemTotals.calories) : caloriesFromModel;
  const protein = macroMismatch || !proteinFromModel
    ? round(itemTotals.protein) : proteinFromModel;
  const carbs = macroMismatch || !carbsFromModel
    ? round(itemTotals.carbs) : carbsFromModel;
  const fat = macroMismatch || !fatFromModel
    ? round(itemTotals.fat) : fatFromModel;

  return {
    description: originalDescription,
    normalized_name: String(data.normalized_name || originalDescription),
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: data.fiber_g == null
      ? null
      : Math.max(0, round(safeNumber(data.fiber_g))),
    confidence,
    confidence_percent: Math.round(
      clamp(safeNumber(data.confidence_percent, 60), 0, 100),
    ),
    estimated_total_weight_g: data.estimated_total_weight_g == null
      ? null
      : Math.max(0, Math.round(safeNumber(data.estimated_total_weight_g))),
    detected_modifiers: Array.isArray(data.detected_modifiers)
      ? data.detected_modifiers
      : [],
    components: Array.isArray(data.components)
      ? data.components
      : [],
    plausible_range: {
      calories_min: Math.max(
        0,
        Math.round(safeNumber(range.calories_min, calories * 0.85)),
      ),
      calories_max: Math.max(
        calories,
        Math.round(safeNumber(range.calories_max, calories * 1.15)),
      ),
      protein_min_g: Math.max(
        0,
        round(safeNumber(range.protein_min_g, protein * 0.9)),
      ),
      protein_max_g: Math.max(
        protein,
        round(safeNumber(range.protein_max_g, protein * 1.1)),
      ),
    },
    items,
    assumptions: Array.isArray(data.assumptions)
      ? data.assumptions.map(String).slice(0, 16)
      : [],
    uncertainty_reasons: Array.isArray(data.uncertainty_reasons)
      ? data.uncertainty_reasons.map(String).slice(0, 10)
      : [],
    clarification_suggestion: data.clarification_suggestion == null
      ? null
      : String(data.clarification_suggestion),
    source: "ai_estimate",
  };
}


interface VerifiedProduct {
  barcode: string;
  name: string;
  brand: string | null;
  quantity_label: string | null;
  serving_size: string | null;
  serving_quantity_g: number | null;
  image_url: string | null;
  calories_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  fiber_100g: number | null;
  calories_serving: number | null;
  protein_serving: number | null;
  carbs_serving: number | null;
  fat_serving: number | null;
  fiber_serving: number | null;
  source: "open_food_facts";
  source_url: string;
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function lookupBarcode(barcode: string): Promise<VerifiedProduct> {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length < 8 || clean.length > 14) {
    throw new Error("El código de barras no es válido.");
  }

  const fields = [
    "code", "product_name", "product_name_es", "brands", "quantity",
    "serving_size", "serving_quantity", "image_front_small_url",
    "image_front_url", "nutriments"
  ].join(",");
  const url = `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${encodeURIComponent(fields)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PrimeTraining/1.0 (nutrition barcode lookup)",
      "Accept": "application/json",
    },
  });
  if (!response.ok) throw new Error("No se pudo consultar la base nutricional.");
  const payload = await response.json() as Record<string, unknown>;
  if (Number(payload.status) !== 1 || !payload.product || typeof payload.product !== "object") {
    throw new Error("Producto no encontrado. Podés cargar los datos de la etiqueta manualmente.");
  }
  const product = payload.product as Record<string, unknown>;
  const n = product.nutriments && typeof product.nutriments === "object"
    ? product.nutriments as Record<string, unknown> : {};
  const name = String(product.product_name_es || product.product_name || "Producto sin nombre").trim();
  const calories100 = nullableNumber(n["energy-kcal_100g"]);
  const servingG = nullableNumber(product.serving_quantity);
  const perServing = (value100: number | null) =>
    value100 != null && servingG != null ? round(value100 * servingG / 100) : null;

  return {
    barcode: clean,
    name,
    brand: product.brands ? String(product.brands) : null,
    quantity_label: product.quantity ? String(product.quantity) : null,
    serving_size: product.serving_size ? String(product.serving_size) : null,
    serving_quantity_g: servingG,
    image_url: product.image_front_small_url
      ? String(product.image_front_small_url)
      : product.image_front_url ? String(product.image_front_url) : null,
    calories_100g: calories100,
    protein_100g: nullableNumber(n.proteins_100g),
    carbs_100g: nullableNumber(n.carbohydrates_100g),
    fat_100g: nullableNumber(n.fat_100g),
    fiber_100g: nullableNumber(n.fiber_100g),
    calories_serving: nullableNumber(n["energy-kcal_serving"]) ?? perServing(calories100),
    protein_serving: nullableNumber(n.proteins_serving) ?? perServing(nullableNumber(n.proteins_100g)),
    carbs_serving: nullableNumber(n.carbohydrates_serving) ?? perServing(nullableNumber(n.carbohydrates_100g)),
    fat_serving: nullableNumber(n.fat_serving) ?? perServing(nullableNumber(n.fat_100g)),
    fiber_serving: nullableNumber(n.fiber_serving) ?? perServing(nullableNumber(n.fiber_100g)),
    source: "open_food_facts",
    source_url: `https://world.openfoodfacts.org/product/${clean}`,
  };
}

function buildMealPrompt(
  description: string,
  mealType?: string,
  userContext?: Record<string, unknown>,
  clarification?: string,
  savedMeals?: unknown[],
  verifiedProduct?: Record<string, unknown>,
): string {
  return `
Sos un motor de estimación nutricional de nivel experto, especializado en
comidas argentinas y descripciones cotidianas en español rioplatense.

DESCRIPCIÓN ORIGINAL:
"${description}"

ACLARACIÓN POSTERIOR DEL USUARIO:
"${clarification || "Ninguna"}"

TIPO DE COMIDA:
"${mealType || "No especificado"}"

CONTEXTO PERSONAL:
${JSON.stringify(userContext || {}, null, 2)}

PLATOS GUARDADOS DEL USUARIO QUE PUEDEN SERVIR COMO REFERENCIA:
${JSON.stringify((savedMeals || []).slice(0, 12), null, 2)}

PRODUCTO COMERCIAL VERIFICADO POR CÓDIGO DE BARRAS:
${JSON.stringify(verifiedProduct || null, null, 2)}

REGLA DE ANÁLISIS VISUAL:
- Si se adjunta una imagen, analizala junto con el texto, nunca de forma aislada.
- Usá objetos visibles, plato, cubiertos, vaso y proporciones relativas para estimar tamaños.
- Identificá ingredientes visibles, empanado, salsas, aceite aparente, grosor y cantidad.
- La imagen mejora la estimación pero no convierte cantidades invisibles en datos exactos.
- Si texto e imagen se contradicen, señalalo en uncertainty_reasons y priorizá la aclaración explícita del usuario.
- Mencioná en assumptions qué aspectos fueron inferidos visualmente.

REGLA PARA PRODUCTO VERIFICADO:
- Si existe un producto verificado, sus valores nutricionales son la fuente principal y no se pueden reemplazar por conocimiento general.
- Interpretá la descripción del usuario únicamente para calcular cuánto consumió: gramos, mililitros, vasos, unidades, fracción del envase o porciones.
- Para líquidos, si no se informa otra equivalencia, 1 ml equivale aproximadamente a 1 g.
- Si la cantidad es ambigua, formulá una pregunta y bajá la confianza.
- Indicá en assumptions que los datos provienen del código de barras.
- El source conceptual debe ser producto verificado, no una estimación genérica.

OBJETIVO:
Estimar el total más realista posible de calorías, proteínas, carbohidratos,
grasas y fibra de toda la comida, demostrando que comprendiste cada alimento.

REGLA CRÍTICA DE DESCOMPOSICIÓN:
- Está prohibido devolver como ítem final categorías agrupadas como
  "arroz con carne", "ensalada", "bowl", "plato principal", "sándwich",
  "guiso" o "acompañamiento" si el usuario mencionó ingredientes internos.
- Cada ingrediente explícito debe aparecer como un ítem separado.
- La cantidad de ítems finales debe ser igual o superior a la cantidad de
  alimentos explícitamente mencionados.
- Podés agruparlos visualmente dentro de components, pero nunca ocultarlos.
- Ejemplo: "ensalada con lechuga, repollo, arroz y porotos" debe producir
  cuatro ítems separados: lechuga, repollo, arroz y porotos.

PROCESO OBLIGATORIO:
1. Detectá primero todos los componentes de la comida: plato principal,
   bowl, bebida, pan, postre, etc.
2. Dentro de cada componente, extraé TODOS los ingredientes mencionados.
3. Detectá modificadores lingüísticos:
   "muy poco", "poco", "un poco", "bastante", "mucho", "chico", "grande",
   "colmado", "al ras", "pedacitos", "chorrito", "fino", "grueso".
4. Convertí esos modificadores en rangos de cantidad y explicalos.
5. Interpretá medidas domésticas argentinas: cucharada sopera, cucharón,
   plato, bowl, puñado, feta, rodaja, taza, vaso, scoop y porción.
6. Estimá el peso cocido de cada ingrediente.
7. Detectá aceite, empanado, queso, salsa, aderezo, azúcar, manteca,
   mayonesa y otros agregados plausibles.
8. Las salsas siempre deben aparecer como ítem separado. Si no se conoce su
   base, elegí una preparación central razonable, indicá el supuesto y bajá
   su confianza individual.
9. Si hay un plato guardado que coincide, usalo como referencia y adaptalo.
10. Calculá macros por ingrediente y verificá que la suma de items coincida
    con el total con una tolerancia máxima del 3%.
10.b. Si el usuario da gramos, mililitros, unidades exactas o datos de etiqueta, tratálos como datos duros y no los reemplaces por una porción típica.
10.c. No agregues aceite, salsas, azúcar, queso o aderezos invisibles como hechos. Solo incluilos si fueron mencionados, son claramente visibles o los declarás como supuesto con confianza baja.
10.d. Para alimentos simples como huevo, banana, leche, arroz o carne, verificá el resultado contra valores nutricionales plausibles por 100 g antes de responder.
10.e. Si la porción es el principal factor de incertidumbre, hacé que clarification_suggestion pregunte exactamente tamaño, peso o fracción consumida.
11. Comprobá coherencia energética:
    proteína*4 + carbohidratos*4 + grasa*9 ≈ calorías.
12. Entregá valor central, rango plausible y confianza por ingrediente.
13. La confianza global no puede ser superior a la confianza de los
    ingredientes de mayor impacto calórico si sus cantidades son inciertas.
14. Si una pregunta concreta mejoraría mucho la precisión, incluila.
15. No des consejos médicos. No escribas nada fuera del JSON.

REFERENCIAS DOMÉSTICAS ORIENTATIVAS:
- Pechuga entera cocida: normalmente 180-250 g.
- Cucharada sopera de arroz cocido: normalmente 15-25 g.
- Cucharada sopera de aceite: 13-15 g.
- Tostada de pan integral: normalmente 25-35 g.
- Huevo grande: normalmente 50-60 g sin cáscara.
- Milanesa: depende mucho de tamaño, empanado y aceite; detallá supuestos.
- Puré: contemplá leche/manteca solo si se mencionan o resultan plausibles,
  y explicalo.

RESPONDÉ ÚNICAMENTE:
{
  "normalized_name": "nombre breve y natural",
  "calories": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "fiber_g": 0,
  "confidence": "low | medium | high",
  "confidence_percent": 0,
  "estimated_total_weight_g": 0,
  "plausible_range": {
    "calories_min": 0,
    "calories_max": 0,
    "protein_min_g": 0,
    "protein_max_g": 0
  },
  "detected_modifiers": [
    {
      "phrase": "muy pocos pedacitos",
      "interpreted_as": "porción pequeña",
      "impact": "se estimaron 40-60 g"
    }
  ],
  "components": [
    {
      "name": "Plato principal",
      "items": ["identificador o nombre exacto de cada item perteneciente"]
    }
  ],
  "items": [
    {
      "component": "Plato principal",
      "name": "ingrediente individual, nunca categoría agrupada",
      "preparation": "método de cocción o null",
      "quantity_modifier": "poco, mucho, chico, etc. o null",
      "estimated_quantity": 0,
      "unit": "unidad doméstica",
      "estimated_weight_g": 0,
      "weight_range_min_g": 0,
      "weight_range_max_g": 0,
      "calories": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0,
      "confidence": "low | medium | high",
      "confidence_percent": 0,
      "assumptions": ["supuesto concreto"],
      "correction_hint": "qué dato podría corregir el usuario"
    }
  ],
  "assumptions": ["suposiciones generales"],
  "uncertainty_reasons": ["motivos concretos de incertidumbre"],
  "clarification_suggestion": "pregunta concreta o null"
}
`.trim();
}

function buildCoachPrompt(context: Record<string, unknown>): string {
  return `
Sos Prime Coach, un entrenador y analista de hábitos. Analizá únicamente los
datos entregados, sin inventar información.

CONTEXTO:
${JSON.stringify(context, null, 2)}

Devolvé recomendaciones breves, accionables y prudentes. Relacioná
entrenamiento, nutrición, asistencia, peso y recuperación cuando existan datos.
No diagnostiques enfermedades ni lesiones.

RESPONDÉ SOLO:
{
  "headline": "frase principal de máximo 12 palabras",
  "summary": "resumen de máximo 45 palabras",
  "priority": "low | medium | high",
  "actions": ["acción concreta 1", "acción concreta 2", "acción concreta 3"],
  "observations": ["observación basada en datos"],
  "warnings": ["advertencia prudente, si corresponde"]
}
`.trim();
}

function buildNutritionReviewPrompt(context: Record<string, unknown>): string {
  return `
Sos un coach nutricional. Revisá el día según objetivos y comidas registradas.
No inventes alimentos ni datos. No hagas diagnóstico médico.

CONTEXTO DEL DÍA:
${JSON.stringify(context, null, 2)}

RESPONDÉ SOLO:
{
  "status": "under | balanced | over",
  "headline": "máximo 12 palabras",
  "summary": "máximo 45 palabras",
  "remaining_suggestion": "una sugerencia alimentaria general o null",
  "highlights": ["dato positivo"],
  "improvements": ["mejora concreta"]
}
`.trim();
}


function buildPreWorkoutPrompt(context: Record<string, unknown>): string {
  return `
Sos un nutricionista deportivo. Evaluá si la persona está nutricionalmente
preparada para el entrenamiento programado. Usá exclusivamente los datos
entregados. Considerá tiempo hasta entrenar, última comida, carbohidratos,
proteína, calorías, peso corporal y tipo de entrenamiento.

No diagnostiques. Si faltan datos, expresalo.

CONTEXTO:
${JSON.stringify(context, null, 2)}

RESPONDÉ SOLO:
{
  "status": "green | yellow | red",
  "score": 0,
  "headline": "máximo 10 palabras",
  "reason": "explicación breve basada en datos",
  "missing_carbs_g": 0,
  "missing_protein_g": 0,
  "timing_note": "comentario sobre tiempo desde la última comida",
  "recommendations": [
    {
      "option": "opción concreta y simple",
      "estimated_calories": 0,
      "carbs_g": 0,
      "protein_g": 0
    }
  ],
  "warning": "advertencia prudente o null"
}
`.trim();
}

function buildNextMealPrompt(context: Record<string, unknown>): string {
  return `
Sos un coach nutricional. Recomendá la composición de la próxima comida
según macros consumidos, objetivos restantes, hora, próxima comida,
entrenamiento programado y alimentos ya ingeridos.

No prescribas tratamientos ni inventes datos.

CONTEXTO:
${JSON.stringify(context, null, 2)}

RESPONDÉ SOLO:
{
  "priority_macro": "protein | carbs | fat | balanced",
  "headline": "máximo 10 palabras",
  "summary": "máximo 35 palabras",
  "target_for_meal": {
    "calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0
  },
  "suggested_structure": ["componente general 1", "componente general 2"],
  "avoid_repeating": ["algo ya excesivo o repetido"],
  "training_relation": "cómo se relaciona con el entrenamiento o null"
}
`.trim();
}

async function callGlobantAI(
  prompt: string,
  conversationId: string,
  imageDataUrl?: string,
): Promise<unknown> {
  const token = Deno.env.get("GEAI_APITOKEN")?.trim();
  if (!token) {
    throw new Error("Falta configurar GEAI_APITOKEN.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(GEAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "saia-conversation-id": conversationId,
      },
      body: JSON.stringify({
        model: GEAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Respondé siempre JSON válido, sin Markdown ni texto externo.",
          },
          { role: "user", content: imageDataUrl ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ] : prompt },
        ],
        temperature: 0.1,
        max_tokens: 2600,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Globant AI respondió ${response.status}: ${responseText.slice(0, 600)}`,
      );
    }

    const payload = JSON.parse(responseText) as Record<string, unknown>;
    const choices = Array.isArray(payload.choices)
      ? payload.choices as Array<Record<string, unknown>>
      : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    const content = message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Globant AI no devolvió contenido.");
    }

    return extractJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

async function liveStatus(): Promise<JsonRecord> {
  if (!Deno.env.get("GEAI_APITOKEN")?.trim()) {
    return {
      connected: false,
      configured: false,
      message: "Falta GEAI_APITOKEN.",
    };
  }

  try {
    const startedAt = Date.now();
    const raw = await callGlobantAI(
      '{"instruction":"Respondé únicamente con {\\"ok\\":true}"}',
      crypto.randomUUID(),
    );
    const result = raw && typeof raw === "object"
      ? raw as Record<string, unknown>
      : {};
    return {
      connected: result.ok === true,
      configured: true,
      model: GEAI_MODEL,
      latency_ms: Date.now() - startedAt,
      message: result.ok === true
        ? "IA conectada correctamente."
        : "La IA respondió, pero el test no fue el esperado.",
    };
  } catch (error) {
    return {
      connected: false,
      configured: true,
      model: GEAI_MODEL,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function saveMeal(
  req: Request,
  meal: Record<string, unknown>,
): Promise<JsonRecord> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");

  if (!supabaseUrl || !supabaseAnonKey || !authorization) {
    throw new Error("Falta autenticación para guardar la comida.");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Sesión inválida.");

  const row = {
    user_id: user.id,
    eaten_at: meal.eaten_at || new Date().toISOString(),
    meal_date: meal.meal_date || new Date().toISOString().slice(0, 10),
    meal_type: meal.meal_type || "Otro",
    description: meal.description || "",
    normalized_name: meal.normalized_name || null,
    calories: safeNumber(meal.calories),
    protein_g: safeNumber(meal.protein_g),
    carbs_g: safeNumber(meal.carbs_g),
    fat_g: safeNumber(meal.fat_g),
    fiber_g: meal.fiber_g == null ? null : safeNumber(meal.fiber_g),
    confidence: meal.confidence || "medium",
    confidence_percent: Math.round(
      clamp(safeNumber(meal.confidence_percent, 60), 0, 100),
    ),
    estimated_total_weight_g: meal.estimated_total_weight_g ?? null,
    items: meal.items || [],
    assumptions: meal.assumptions || [],
    source: meal.source || "ai_estimate",
  };

  const { data: inserted, error } = await supabase
    .from("nutrition_meals")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { saved: true, meal: inserted };
}



function buildWorkoutExercisePrompt(context: Record<string, unknown>): string {
  return `
Sos Prime Training AI, un entrenador de fuerza e hipertrofia prudente y preciso.
Analizá EN TIEMPO REAL un ejercicio dentro de una sesión. Usá únicamente los datos entregados.

CONTEXTO:
${JSON.stringify(context, null, 2)}

CRITERIOS:
- Compará series completadas con series objetivo y rango de repeticiones.
- REGLA ESTRICTA PARA SUBIR: solo podés sugerir aumentar si completó TODAS las series objetivo y TODAS alcanzaron el máximo configurado. Ejemplo 12,12,12,12 en rango 10-12. Cualquier otro patrón mantiene o baja.
- Si todas las series están dentro del rango pero alguna no llegó al máximo, MANTENER. Ejemplo 20,20,20,19 en rango 15-20 = mantener, nunca bajar.
- REGLA ESTRICTA PARA BAJAR: tiene que existir rendimiento por debajo del mínimo Y evidencia clara: varias series bajo el mínimo con promedio bajo, o una serie al menos 2 reps bajo el mínimo acompañada de una caída aproximada del 25% o más.
- Una única serie apenas 1 repetición por debajo del mínimo, si el resto está estable, NO alcanza para bajar: mantené.
- Nunca sugieras bajar por una caída de repeticiones que sigue completamente dentro del rango objetivo.
- Si faltan series objetivo, no subas: mantené hasta completar el volumen configurado.
- No confundas una caída mínima de 1-2 repeticiones dentro del rango con fatiga excesiva.
- Considerá caída de repeticiones entre series, historial reciente, notas y etiquetas como "Me costó" o "Dolor".
- Ante dolor, no incentivos continuar ni aumentar carga. Recomendá detener o reemplazar prudentemente.
- No inventes técnica, lesiones, RIR ni fatiga no registrados.
- La explicación debe mencionar el nombre del ejercicio y al menos dos datos concretos de sus series (cantidad, repeticiones, carga o caída).
- Evitá frases genéricas repetibles entre ejercicios. Cada fundamento debe ser específico para esos datos.
- La recomendación inmediata debe ser breve y aplicable a la próxima serie.
- suggested change: mancuernas o cargas menores a 20 kg normalmente 1 kg; entre 20 y 60 kg normalmente 2,5 kg; cargas mayores normalmente 5 kg, salvo que el historial sugiera algo más conservador.

RESPONDÉ SOLO JSON:
{
  "status": "increase | maintain | reduce | adjust | stop",
  "headline": "máximo 8 palabras",
  "message": "explicación clara de máximo 35 palabras",
  "reason": "fundamento basado en datos de máximo 40 palabras",
  "immediate_action": "indicación concreta para la próxima serie",
  "recommended_next_weight": 0,
  "confidence_percent": 0
}`.trim();
}

function buildWorkoutSessionPrompt(context: Record<string, unknown>): string {
  return `
Sos Prime Training AI. Analizá una sesión completa de fuerza usando únicamente los datos entregados.

CONTEXTO:
${JSON.stringify(context, null, 2)}

Detectá:
- ejercicios completados, parciales u omitidos;
- progresión, mantenimiento o necesidad de bajar carga;
- caída marcada de repeticiones;
- volumen efectivo y consistencia;
- señales explícitas de dolor o dificultad.

No diagnostiques ni inventes datos. Priorizá recomendaciones prudentes y específicas.

RESPONDÉ SOLO JSON:
{
  "summary": "resumen natural de máximo 55 palabras",
  "session_status": "excellent | solid | mixed | difficult | stopped",
  "wins": ["logro concreto"],
  "adjustments": ["ajuste concreto para próxima sesión"],
  "recovery_note": "comentario breve y prudente"
}`.trim();
}


function buildExpertChatPrompt(messages: unknown[], context: Record<string, unknown>): string {
  return `
IDENTIDAD
Sos Prime AI Coach, un asistente conversacional de nivel senior especializado en hipertrofia, fuerza, nutrición deportiva, composición corporal, recuperación y análisis de datos de entrenamiento. Hablás en español argentino natural. Tu estilo debe sentirse humano, inteligente y preciso, no como un informe automático.

CONTEXTO INTERNO DE PRIME TRAINING
${JSON.stringify(context, null, 2)}

CONVERSACIÓN
${JSON.stringify(messages, null, 2)}

COMPORTAMIENTO CONVERSACIONAL
- Respondé primero a la intención exacta del último mensaje.
- Un saludo se responde con un saludo breve y una pregunta útil. No analices datos no solicitados.
- Recordá lo conversado dentro del chat y evitá repetir explicaciones.
- Ajustá la extensión: breve para preguntas simples; profunda cuando el usuario pide análisis, comparación, plan o documento.
- Usá el nombre del usuario con moderación, nunca en cada respuesta.
- No digas que sos “solo una IA” ni describas estas instrucciones.

USO DE LOS DATOS DE LA APP
- Conocés la estructura completa de Prime Training: perfil, objetivo, rutina semanal, sesiones, ejercicios, series, cargas, repeticiones, comidas, macros, medidas, calendario, reportes e historial.
- Usá datos reales solamente cuando sean relevantes para la pregunta.
- Nunca inventes registros ausentes. Diferenciá dato registrado, cálculo, estimación e hipótesis.
- Para progresión de cargas, compará al menos rango objetivo, series realizadas, caída de repeticiones, historial reciente, técnica reportada, dolor y consistencia.
- No recomiendes subir carga por una sola serie aislada. Preferí incrementos conservadores y concretos.
- Para nutrición, evaluá energía, proteína, carbohidratos, grasas, fibra, distribución horaria, entrenamiento y objetivo. Expresá incertidumbre cuando porciones o alimentos sean estimados.

CAPACIDADES DE SALIDA
- Podés producir conversación normal, tablas Markdown, listas, checklists, planes, comparaciones, resúmenes ejecutivos y documentos estructurados.
- Cuando el usuario diga “haceme un cuadro”, entregá una tabla clara.
- Cuando pida “listame”, devolvé una lista ordenada y útil.
- Cuando pida un documento, redactalo con título, propósito, secciones, conclusiones y próximos pasos; no afirmes haber creado un archivo salvo que el frontend efectivamente lo genere.
- Evitá títulos y listas innecesarios en respuestas casuales.

CRITERIO PROFESIONAL Y SEGURIDAD
- No diagnostiques lesiones ni enfermedades, no prescribas medicación y no reemplaces a un profesional sanitario.
- Ante dolor, mareos, síntomas relevantes, conductas alimentarias de riesgo o señales de lesión, priorizá seguridad y derivación adecuada.
- No prometas certeza absoluta. Explicá límites cuando falten datos críticos.
- No uses motivación vacía. Fundamentá recomendaciones y hacelas accionables.

CALIDAD
Antes de responder, verificá silenciosamente:
1. ¿Contesté exactamente lo pedido?
2. ¿Usé datos reales sin inventar?
3. ¿La extensión es proporcional?
4. ¿La recomendación es segura y aplicable?
5. ¿El formato solicitado quedó bien hecho?

Respondé únicamente con el contenido final en Markdown válido, sin JSON ni comentarios internos.
`.trim();
}

function buildDailyExpertReportPrompt(context: Record<string, unknown>): string {
  return `
Sos el personal trainer y nutricionista deportivo senior de Prime Training. Elaborá un reporte diario crítico, específico y accionable usando EXCLUSIVAMENTE los datos entregados.

DATOS DEL DÍA:
${JSON.stringify(context, null, 2)}

REGLAS DE RIGOR:
- No felicites ni digas que el día estuvo alineado si los números no lo respaldan.
- Usá computed.totals y computed.target como fuente matemática principal cuando existan.
- Si las calorías registradas son menores al 50% del objetivo, la nutrición no puede calificarse como adecuada y nutrition.score no puede superar 45.
- Si la proteína es menor al 60% del objetivo, indicá explícitamente que fue insuficiente.
- Si hay una sola comida o un registro evidentemente incompleto, aclaralo con firmeza: no extrapoles alimentos inexistentes ni supongas que el resto del día estuvo bien.
- Separá calidad del registro de calidad nutricional. Un registro incompleto reduce la confianza.
- En entrenamiento, analizá ejercicio por ejercicio: series, rango objetivo, repeticiones, caída entre series, carga, dolor, dificultad y decisiones de carga para la próxima sesión.
- Enumerá cada aumento o reducción aplicado indicando ejercicio, peso anterior, peso nuevo y motivo.
- Si no hubo cambio de peso, explicá qué falta consolidar antes de progresar.
- Compará con historial solo cuando los datos lo permitan. No inventes tendencias.
- El puntaje global debe ser coherente con los puntajes de entrenamiento y nutrición. No uses 10/100 como escala: todos los puntajes son de 0 a 100.
- No diagnostiques ni prescribas tratamientos.

RESPONDÉ SOLO JSON VÁLIDO CON ESTA ESTRUCTURA:
{
  "score": 0,
  "headline": "conclusión honesta de máximo 12 palabras",
  "executive_summary": "síntesis crítica de 70 a 130 palabras",
  "training": {
    "score": 0,
    "summary": "evaluación concreta de la sesión",
    "exercise_analysis": [
      {
        "exercise": "nombre exacto",
        "summary": "qué ocurrió y por qué",
        "decision": "Subir | Bajar | Mantener",
        "next_weight": 0
      }
    ],
    "load_changes": [
      {"exercise":"nombre","from":0,"to":0,"reason":"motivo"}
    ],
    "strengths": ["fortaleza concreta"],
    "concerns": ["problema concreto"]
  },
  "nutrition": {
    "score": 0,
    "summary": "evaluación cuantitativa y crítica",
    "totals": {"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0},
    "target": {"calories":0,"protein":0,"carbs":0,"fat":0},
    "meal_analysis": [
      {"meal":"momento del día","summary":"análisis de esa comida"}
    ],
    "strengths": ["fortaleza real"],
    "concerns": ["déficit o exceso real"]
  },
  "priorities": ["acción concreta para mañana"],
  "warnings": ["advertencia o limitación de los datos"]
}
`.trim();
}


async function callGlobantText(prompt: string, conversationId: string): Promise<string> {
  const token = Deno.env.get("GEAI_APITOKEN")?.trim();
  if (!token) throw new Error("Falta configurar GEAI_APITOKEN.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(GEAI_API_URL, {
      method: "POST",
      headers: {"Content-Type":"application/json","Authorization":`Bearer ${token}`,"saia-conversation-id":conversationId},
      body: JSON.stringify({model:GEAI_MODEL,messages:[{role:"system",content:"Sos Prime AI Coach. Conversá como un especialista senior humano, preciso y prudente. Seguí la intención del último mensaje, usá los datos de la app solo cuando sean relevantes y jamás inventes registros. Un saludo requiere únicamente un saludo natural y una pregunta breve."},{role:"user",content:prompt}],temperature:0.55,max_tokens:5000}),
      signal: controller.signal,
    });
    const text=await response.text();
    if(!response.ok) throw new Error(`Globant AI respondió ${response.status}: ${text.slice(0,600)}`);
    const payload=JSON.parse(text) as Record<string,unknown>;
    const choices=Array.isArray(payload.choices)?payload.choices as Array<Record<string,unknown>>:[];
    const message=choices[0]?.message as Record<string,unknown>|undefined;
    const content=message?.content;
    if(typeof content!=="string"||!content.trim()) throw new Error("Globant AI no devolvió contenido.");
    return content.trim();
  } finally { clearTimeout(timeout); }
}


function buildPhysiqueCheckinPrompt(context: Record<string, unknown>): string {
  return `
Sos Prime Visual Coach, especialista prudente en seguimiento visual de progreso físico.
Analizá la foto adjunta como un check-in comparativo de entrenamiento, no como diagnóstico médico.

CONTEXTO:
${JSON.stringify(context, null, 2)}

REGLAS CRÍTICAS:
- La iluminación, pose, distancia, congestión muscular, ropa y ángulo pueden alterar mucho la percepción.
- No identifiques a la persona ni infieras enfermedades.
- No presentes grasa corporal, masa muscular ni proporciones como mediciones exactas.
- La prioridad es comparar en el tiempo, no puntuar el cuerpo de forma absoluta.
- Si es el primer registro, tratá la imagen únicamente como línea de base: no afirmes mejoras, retrocesos ni similitudes cuantificadas.
- Los índices se conservan solo como señal técnica interna para compatibilidad; nunca los describas al usuario como porcentaje, nota corporal o medición.
- Si existe análisis previo, clasificá cada grupo como improving, stable, declining o not_evaluable.
- Considerá un cambio visible solo cuando supera razonablemente las diferencias de pose, luz, distancia y congestión.
- Si la foto no permite evaluar espalda, piernas u otro grupo, marcá not_evaluable y explicá por qué.
- Priorizá observaciones útiles y concretas, sin halagos vacíos, críticas agresivas ni falsa precisión.

RESPONDÉ SOLO JSON:
{
  "headline": "máximo 8 palabras",
  "summary": "resumen comparativo prudente de máximo 55 palabras",
  "photo_quality": "low | medium | high",
  "comparison_confidence": 0,
  "baseline": true,
  "indices": {
    "chest": 50,
    "shoulders": 50,
    "back": 50,
    "arms": 50,
    "legs": 50,
    "core": 50
  },
  "trends": {
    "chest": "baseline | improving | stable | declining | not_evaluable",
    "shoulders": "baseline | improving | stable | declining | not_evaluable",
    "back": "baseline | improving | stable | declining | not_evaluable",
    "arms": "baseline | improving | stable | declining | not_evaluable",
    "legs": "baseline | improving | stable | declining | not_evaluable",
    "core": "baseline | improving | stable | declining | not_evaluable"
  },
  "evaluable_groups": ["chest", "shoulders", "arms", "core"],
  "observations": ["observación concreta 1", "observación concreta 2"],
  "limitations": ["limitación visual concreta"],
  "next_photo_tip": "cómo repetir mejor la próxima foto"
}`.trim();
}

function buildPhysiqueGoalPrompt(context: Record<string, unknown>): string {
  return `
Sos Prime Visual Coach. Analizá la foto adjunta como una referencia estética de físico objetivo.
El objetivo es convertir una imagen en prioridades de entrenamiento y nutrición prudentes, sin prometer resultados.

CONTEXTO ACTUAL DEL USUARIO:
${JSON.stringify(context, null, 2)}

REGLAS:
- No identifiques a la persona de la foto.
- Toda estimación depende de pose, luz, edición, genética, perspectiva y posible congestión muscular.
- El porcentaje de grasa debe devolverse como rango visual aproximado, nunca como medición clínica.
- No asegures cuánto músculo exacto necesita ganar. Usá categorías orientativas.
- El tiempo debe ser un rango amplio y condicionado a constancia, experiencia, sueño, entrenamiento y alimentación.
- No muestres similitudes numéricas ni porcentajes por grupo muscular.
- Los target_indices se conservan únicamente por compatibilidad técnica y no deben mencionarse en el texto.
- Describí qué rasgos destacan en la referencia y comparalos con el usuario solo mediante categorías prudentes como prioridad alta, media, similar o no evaluable.
- Generá prioridades accionables y coherentes con el contexto actual.

RESPONDÉ SOLO JSON:
{
  "headline": "máximo 10 palabras",
  "summary": "descripción prudente de máximo 60 palabras",
  "estimated_body_fat": "rango visual aproximado o no concluyente",
  "estimated_timeline": "rango orientativo amplio",
  "muscularity": "moderada | alta | muy alta | no concluyente",
  "target_indices": {
    "chest": 70,
    "shoulders": 70,
    "back": 70,
    "arms": 70,
    "legs": 70,
    "core": 70
  },
  "standout_groups": ["rasgo visual destacado 1", "rasgo visual destacado 2"],
  "comparison_to_current": {
    "chest": "prioridad alta | prioridad media | similar | no evaluable",
    "shoulders": "prioridad alta | prioridad media | similar | no evaluable",
    "back": "prioridad alta | prioridad media | similar | no evaluable",
    "arms": "prioridad alta | prioridad media | similar | no evaluable",
    "legs": "prioridad alta | prioridad media | similar | no evaluable",
    "core": "prioridad alta | prioridad media | similar | no evaluable"
  },
  "priorities": ["prioridad muscular 1", "prioridad muscular 2", "prioridad muscular 3"],
  "plan": ["ajuste concreto de entrenamiento", "ajuste concreto de nutrición", "acción de seguimiento"],
  "limitations": ["limitación importante"]
}`.trim();
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      service: "smart-handler",
      configured: Boolean(Deno.env.get("GEAI_APITOKEN")?.trim()),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Método no permitido." }, 405);
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "status") {
      const status = body.live === true
        ? await liveStatus()
        : {
          connected: Boolean(Deno.env.get("GEAI_APITOKEN")?.trim()),
          configured: Boolean(Deno.env.get("GEAI_APITOKEN")?.trim()),
          model: GEAI_MODEL,
          message: "Servicio configurado.",
        };
      return jsonResponse(
        { ok: status.connected === true, ...status },
        status.connected === true ? 200 : 503,
      );
    }

    if (action === "lookup_barcode") {
      const barcode = String(body.barcode || "").trim();
      const product = await lookupBarcode(barcode);
      return jsonResponse({ ok: true, product });
    }

    if (action === "analyze_meal") {
      const description = String(body.description || "").trim();
      if (description.length < 3 || description.length > 3000) {
        return jsonResponse(
          { ok: false, error: "Descripción inválida." },
          400,
        );
      }

      const imageDataUrl = typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")
        ? body.imageDataUrl : undefined;
      if (imageDataUrl && imageDataUrl.length > 9_000_000) {
        return jsonResponse({ ok: false, error: "La imagen es demasiado pesada." }, 413);
      }
      const conversationId = crypto.randomUUID();
      const raw = await callGlobantAI(
        buildMealPrompt(
          description,
          body.mealType ? String(body.mealType) : undefined,
          body.userContext && typeof body.userContext === "object"
            ? body.userContext as Record<string, unknown>
            : undefined,
          body.clarification ? String(body.clarification) : undefined,
          Array.isArray(body.savedMeals) ? body.savedMeals : [],
          body.verifiedProduct && typeof body.verifiedProduct === "object"
            ? body.verifiedProduct as Record<string, unknown>
            : undefined,
        ),
        conversationId,
        imageDataUrl,
      );

      const analysis = normalizeMealAnalysis(raw, description);
      return jsonResponse({
        ok: true,
        analysis,
        meta: {
          provider: "Globant Enterprise AI",
          model: GEAI_MODEL,
          conversation_id: conversationId,
          estimated: true,
        },
      });
    }



    

    

    if (action === "expert_chat" || action === "chat") {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const context = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : {};
      const answer = await callGlobantText(buildExpertChatPrompt(messages, context), crypto.randomUUID());
      return jsonResponse({ ok: true, answer });
    }

    if (action === "daily_expert_report") {
      const context = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : {};
      const report = await callGlobantAI(buildDailyExpertReportPrompt(context), crypto.randomUUID());
      return jsonResponse({ ok: true, report });
    }

    if (action === "workout_exercise_analysis") {
      const context = body.context && typeof body.context === "object"
        ? body.context as Record<string, unknown>
        : {};
      const result = await callGlobantAI(
        buildWorkoutExercisePrompt(context),
        crypto.randomUUID(),
      );
      return jsonResponse({ ok: true, analysis: result });
    }

    if (action === "workout_session_analysis") {
      const context = body.context && typeof body.context === "object"
        ? body.context as Record<string, unknown>
        : {};
      const result = await callGlobantAI(
        buildWorkoutSessionPrompt(context),
        crypto.randomUUID(),
      );
      return jsonResponse({ ok: true, analysis: result });
    }

    if (action === "coach_insight") {
      const context = body.context && typeof body.context === "object"
        ? body.context as Record<string, unknown>
        : {};
      const result = await callGlobantAI(
        buildCoachPrompt(context),
        crypto.randomUUID(),
      );
      return jsonResponse({ ok: true, insight: result });
    }

    if (action === "nutrition_day_review") {
      const context = body.context && typeof body.context === "object"
        ? body.context as Record<string, unknown>
        : {};
      const result = await callGlobantAI(
        buildNutritionReviewPrompt(context),
        crypto.randomUUID(),
      );
      return jsonResponse({ ok: true, review: result });
    }


    if (action === "preworkout_readiness") {
      const context = body.context && typeof body.context === "object"
        ? body.context as Record<string, unknown>
        : {};
      const result = await callGlobantAI(
        buildPreWorkoutPrompt(context),
        crypto.randomUUID(),
      );
      return jsonResponse({ ok: true, readiness: result });
    }

    if (action === "next_meal_guidance") {
      const context = body.context && typeof body.context === "object"
        ? body.context as Record<string, unknown>
        : {};
      const result = await callGlobantAI(
        buildNextMealPrompt(context),
        crypto.randomUUID(),
      );
      return jsonResponse({ ok: true, guidance: result });
    }

    if (action === "save_meal") {
      const meal = body.meal && typeof body.meal === "object"
        ? body.meal as Record<string, unknown>
        : null;
      if (!meal) {
        return jsonResponse({ ok: false, error: "Falta meal." }, 400);
      }
      return jsonResponse({ ok: true, ...await saveMeal(req, meal) }, 201);
    }

    return jsonResponse({ ok: false, error: "Acción inválida." }, 400);
  } catch (error) {
    console.error(error);
    const isAbort = error instanceof DOMException &&
      error.name === "AbortError";
    return jsonResponse(
      {
        ok: false,
        error: isAbort
          ? "La IA tardó demasiado en responder."
          : error instanceof Error
          ? error.message
          : "Error interno.",
      },
      isAbort ? 504 : 500,
    );
  }
}

Deno.serve(handler);