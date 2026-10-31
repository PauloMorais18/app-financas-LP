// Updates are installed in the background, never by reloading an active page.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.update();
    } catch (error) { console.warn("Não foi possível verificar a atualização do aplicativo.", error); }
  };
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", register, {once:true});
}
