# Prime Training 6.5 — Progressive Overload

Base: Prime Training 6.4 suministrada por el usuario.

## Entrenamiento
- Se conserva el check verde inmediato de 6.4.
- Si el campo de reps estaba vacío al tocar check, se carga el máximo configurado, aunque una capa anterior intentara cargar el mínimo.
- Las imágenes de ejercicio se muestran completas (`object-fit: contain`) y no se recortan.

## Progressive Overload
Al finalizar vuelve a aparecer la revisión obligatoria por ejercicio.

Reglas:
1. SUBIR: únicamente si todas las series objetivo alcanzaron el máximo configurado.
2. MANTENER: si el rendimiento está dentro/cerca del rango y todavía no se consolidó el máximo.
3. BAJAR: solo con rendimiento claramente por debajo del mínimo (varias series bajas o caída fuerte con una serie claramente baja).
4. Una caída pequeña dentro del rango nunca provoca una bajada.
5. Mantener no requiere decisión. Subir/bajar permite aplicar el cambio o conservar el peso.

Los cambios aceptados se guardan en la rutina de la próxima sesión.

## Instalación
Publicar todo el proyecto y reemplazar `sw.js`.
Para que las recomendaciones de IA en otros puntos respeten exactamente las mismas reglas, desplegar también `supabase/smart-handler.ts`.
