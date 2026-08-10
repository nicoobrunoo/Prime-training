const CACHE_NAME = "prime-training-v640-workout-pro";
const APP_FILES = [
  "./assets/css/app.css",
  "./assets/js/core/00-app-main.js",
  "./assets/js/core/01-nutrition-shared-state.js",
  "./assets/js/core/40-shared-state-hook.js",
  "./assets/js/features/10-nutrition.js",
  "./assets/js/features/20-intelligence.js",
  "./assets/js/features/21-realtime-ai.js",
  "./assets/js/features/30-cloud-workout.js",
  "./assets/js/features/60-brand-loading.js",
  "./assets/js/features/70-training-ai.js",
  "./assets/js/features/90-expert-ai.js",
  "./assets/js/features/92-ai-chat-v33.js",
  "./assets/js/features/93-ai-chat-stable.js",
  "./assets/js/fixes/50-consistency.js",
  "./assets/js/fixes/51-final-adjustments.js",
  "./assets/js/fixes/80-mobile-runtime.js",
  "./assets/js/fixes/81-set-flicker.js",
  "./assets/js/fixes/82-v2-mobile-runtime.js",
  "./assets/js/core/99-state-manager-v5.js",
  "./assets/js/features/100-workout-report-polish.js",
  "./assets/js/features/101-final-release.js",
  "./assets/js/features/120-premium-workout-ui.js",
  "./assets/js/fixes/102-iphone-viewport.js",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy=response.clone();
    caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(r=>r||caches.match("./index.html"))));
});
