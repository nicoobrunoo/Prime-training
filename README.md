# Prime Training 6.0 — IA Personal Trainer

Versión construida sobre Prime Training 5.5 estable.

## Novedades
- Check-in visual diario con foto comprimida y análisis de Prime AI.
- Prime Visual Index por pecho, hombros, espalda, brazos, piernas y core.
- Evolución visual guardada por fecha y visible desde el calendario.
- Modo Físico Objetivo con foto de referencia y plan visual orientativo.
- Foto del día integrada en el reporte PDF profesional.
- Home más minimalista, con mayor jerarquía tipográfica y menos cajas.
- Ajustes de scroll, aire visual y animaciones respetando reduce-motion.

## Instalación
1. Publicar todo el contenido manteniendo las carpetas.
2. Reemplazar `supabase/smart-handler.ts` en la Edge Function `smart-handler` y desplegar.
3. Ejecutar nuevamente `supabase/prime-training-setup.sql` para crear el bucket de fotos. No hace falta cambiar secrets.
4. Reemplazar `sw.js` y limpiar la caché/PWA anterior.

## Privacidad
Las fotos se comprimen en el dispositivo y se suben al bucket `prime-physique`; el estado compartido guarda únicamente la URL y el análisis. Los índices visuales son orientativos y no representan mediciones clínicas.
