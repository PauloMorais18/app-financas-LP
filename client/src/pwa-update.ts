const reloadFlag = "finanbase-pwa-reloading";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem(reloadFlag)) return;
    sessionStorage.setItem(reloadFlag, "true");
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    sessionStorage.removeItem(reloadFlag);
  });
}
