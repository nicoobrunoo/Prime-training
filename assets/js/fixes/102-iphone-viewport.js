(()=>{
  'use strict';
  const root=document.documentElement;
  const body=document.body;
  const vv=window.visualViewport;
  let raf=0;
  let keyboardOpen=false;

  function syncViewport(){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      const viewport=window.visualViewport;
      const height=Math.round(viewport?.height||window.innerHeight);
      const offsetTop=Math.round(viewport?.offsetTop||0);
      const layoutHeight=Math.round(window.innerHeight);
      const delta=Math.max(0,layoutHeight-height-offsetTop);
      const active=document.activeElement;
      const editing=!!active&&(/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)||active.isContentEditable);
      const nextOpen=editing&&delta>110;

      root.style.setProperty('--pt-vv-height',height+'px');
      root.style.setProperty('--pt-vv-top',offsetTop+'px');
      root.style.setProperty('--app-height',height+'px');
      root.style.setProperty('--vvh',height+'px');
      keyboardOpen=nextOpen;
      body.classList.toggle('pt-keyboard-open',keyboardOpen);

      if(!keyboardOpen){
        const nav=document.getElementById('bottomNav');
        if(nav){
          nav.style.removeProperty('top');
          nav.style.removeProperty('bottom');
          nav.style.removeProperty('transform');
          void nav.offsetHeight;
        }
      }
    });
  }

  vv?.addEventListener('resize',syncViewport,{passive:true});
  vv?.addEventListener('scroll',syncViewport,{passive:true});
  window.addEventListener('resize',syncViewport,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(syncViewport,180),{passive:true});
  document.addEventListener('focusin',syncViewport,true);
  document.addEventListener('focusout',()=>setTimeout(syncViewport,180),true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(syncViewport,80)});

  document.querySelectorAll('.nav').forEach(nav=>nav.addEventListener('click',()=>{
    if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setTimeout(syncViewport,80);
  },{capture:true}));

  syncViewport();
})();
