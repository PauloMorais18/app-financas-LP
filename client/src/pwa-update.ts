const reloadFlag = "finanbase-pwa-reloading";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem(reloadFlag)) return;
    sessionStorage.setItem(reloadFlag, "true");
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      // Atualiza todas as instalações existentes, inclusive as criadas por
      // versões antigas do app. Não esperamos apenas por `ready`, pois uma
      // instalação incompleta poderia deixar essa promessa pendente.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    } finally {
      sessionStorage.removeItem(reloadFlag);
    }
  });
}
