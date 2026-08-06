window.addEventListener("load",()=>{
  const drawer=document.getElementById("drawer");
  if(drawer&&!document.getElementById("sharedDbBanner")){
    const status=document.getElementById("cloudStatus");
    status?.insertAdjacentHTML("afterend",'<div class="shared-db-banner" id="sharedDbBanner">Un único estado compartido: cualquier dispositivo que abra este enlace ve y modifica los mismos datos.</div>');
  }
  setTimeout(()=>document.getElementById("sharedLoadingOverlay")?.classList.add("hidden"),12000);
});
