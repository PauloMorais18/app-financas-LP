const rememberKey = "finanbase-remember-session";

export function remembersSession(): boolean {
  return localStorage.getItem(rememberKey) === "true";
}

export function setRememberSession(remember: boolean) {
  localStorage.setItem(rememberKey, String(remember));
}

// Preserve existing sessions until the user chooses a preference on the next login.
const sessionStore = () => localStorage.getItem(rememberKey) === "false" ? sessionStorage : localStorage;
export const authStorage = {
  getItem(key: string): string | null {
    return sessionStore().getItem(key);
  },
  setItem(key: string, value: string) {
    const chosen = sessionStore();
    chosen.setItem(key, value);
    (chosen === localStorage ? sessionStorage : localStorage).removeItem(key);
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};
