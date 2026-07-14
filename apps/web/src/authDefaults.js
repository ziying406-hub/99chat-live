const AUTH_DEFAULTS_KEY = "chatlite-auth-defaults";

export function emptyAuthDefaults() {
  return {
    country: "+60",
    phone: "",
    password: ""
  };
}

export function readAuthDefaults(storage = globalThis.localStorage) {
  const defaults = emptyAuthDefaults();
  try {
    const value = JSON.parse(storage?.getItem(AUTH_DEFAULTS_KEY) || "{}") || {};
    if (typeof value.country === "string" && /^\+\d+$/.test(value.country)) {
      defaults.country = value.country;
    }
  } catch (_) {}
  return defaults;
}

export function saveAuthDefaults(storage = globalThis.localStorage, values = {}) {
  const country = String(values.country || "").trim();
  if (!/^\+\d+$/.test(country)) return;
  storage?.setItem(AUTH_DEFAULTS_KEY, JSON.stringify({ country }));
}
