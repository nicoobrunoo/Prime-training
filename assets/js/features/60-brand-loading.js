(() => {
  "use strict";
  const previousUpdateCloudStatus = updateCloudStatus;
  updateCloudStatus = function(mode,title,text){
    previousUpdateCloudStatus(mode,title,text);
    const splashStatus=document.getElementById("primeSplashStatus");
    if(splashStatus){
      splashStatus.textContent=
        mode==="error"
          ? (text||"No se pudo conectar")
          : mode==="online"
          ? "Todo listo"
          : (text||title||"Conectando...");
    }
  };

  const overlay=document.getElementById("sharedLoadingOverlay");
  if(overlay){
    const observer=new MutationObserver(()=>{
      if(overlay.classList.contains("hidden")){
        setTimeout(()=>overlay.remove(),500);
        observer.disconnect();
      }
    });
    observer.observe(overlay,{attributes:true,attributeFilter:["class"]});
  }
})();
