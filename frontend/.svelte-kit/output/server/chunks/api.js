const configuredBase = "http://localhost:3005".trim();
function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
function runtimeDefaultBase() {
  if (typeof window === "undefined") return "http://localhost:3005";
  return `${window.location.protocol}//${window.location.hostname}:3005`;
}
function resolveBase() {
  if (!configuredBase) return runtimeDefaultBase();
  try {
    const parsed = new URL(configuredBase);
    if (typeof window !== "undefined" && isLocalHostname(parsed.hostname) && !isLocalHostname(window.location.hostname)) {
      const port = parsed.port || "3005";
      return `${parsed.protocol}//${window.location.hostname}:${port}`;
    }
    return configuredBase.replace(/\/$/, "");
  } catch {
    return configuredBase.replace(/\/$/, "");
  }
}
resolveBase();
