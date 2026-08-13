(()=>{
  const body=document.body;
  body.classList.add('prime-booting');
  const overlay=document.getElementById('sharedLoadingOverlay');
  const syncBoot=()=>{
    const loading=overlay && !overlay.classList.contains('hidden');
    body.classList.toggle('prime-booting',Boolean(loading));
  };
  if(overlay){new MutationObserver(syncBoot).observe(overlay,{attributes:true,attributeFilter:['class']});syncBoot();}
  else body.classList.remove('prime-booting');

  const syncModalState=()=>{
    const open=Boolean(document.querySelector('.modal.open'));
    body.classList.toggle('prime-modal-open',open);
  };
  const modalObserver=new MutationObserver(syncModalState);
  document.querySelectorAll('.modal').forEach(m=>modalObserver.observe(m,{attributes:true,attributeFilter:['class']}));
  syncModalState();

  // Impide que un gesto dentro de un sheet desplace la pantalla de fondo.
  document.addEventListener('touchmove',e=>{
    if(!body.classList.contains('prime-modal-open')) return;
    if(!e.target.closest('.sheet')) e.preventDefault();
  },{passive:false});

  // Al cambiar de pantalla, cierra cualquier estado visual transitorio y evita saltos horizontales.
  window.addEventListener('orientationchange',()=>setTimeout(()=>window.scrollTo({top:0,left:0,behavior:'auto'}),120));
})();
