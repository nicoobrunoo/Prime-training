(()=>{
'use strict';
// Make the installed experience feel native and avoid stale Safari snapshots.
document.documentElement.classList.add('prime-v2');
const nav=document.getElementById('bottomNav');
if(nav) nav.setAttribute('aria-label','Navegación principal');
// Reorder the home feed around the daily action: Today first, then score, week and insights.
const home=document.getElementById('homePage');
if(home){const hero=home.querySelector('.hero'),today=home.querySelector('.today-card');if(hero&&today)home.insertBefore(today,hero)}
// Better iOS viewport behavior when keyboard appears.
const syncViewport=()=>{const h=window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--app-height',`${h}px`)};
syncViewport();window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(syncViewport,120),{passive:true});
// Native-feeling haptics without making every touch noisy.
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||el.disabled)return;if(el.matches('.nav,.btn-primary,.ai-set-check,.check')){try{navigator.vibrate?.(12)}catch(_){}}},{passive:true});
// Prevent double taps from zooming/checking twice during a workout.
let lastTouch=0;document.addEventListener('touchend',e=>{if(!e.target.closest('#workoutPage button'))return;const now=Date.now();if(now-lastTouch<260)e.preventDefault();lastTouch=now},{passive:false});
// Keep service worker optional: app still works when hosted without HTTPS.
if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}),{once:true});
})();
