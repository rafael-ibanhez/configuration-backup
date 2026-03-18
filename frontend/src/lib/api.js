const configuredBase = (import.meta.env.VITE_API_URL ?? '').trim();

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function runtimeDefaultBase() {
  if (typeof window === 'undefined') return 'http://localhost:3005';
  return `${window.location.protocol}//${window.location.hostname}:3005`;
}

function resolveBase() {
  if (!configuredBase) return runtimeDefaultBase();

  try {
    const parsed = new URL(configuredBase);
    if (typeof window !== 'undefined' && isLocalHostname(parsed.hostname) && !isLocalHostname(window.location.hostname)) {
      const port = parsed.port || '3005';
      return `${parsed.protocol}//${window.location.hostname}:${port}`;
    }
    return configuredBase.replace(/\/$/, '');
  } catch {
    return configuredBase.replace(/\/$/, '');
  }
}

const BASE = resolveBase();

async function req(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  const opts = { method, headers: {}, signal: controller.signal };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(BASE + path, opts);
    clearTimeout(timer);
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.error ?? msg; } catch { /* non-json */ }
      throw new Error(msg);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out — is the server running?');
    throw err;
  }
}

export const api = {
  equipment: {
    list:       ()         => req('GET',    '/api/equipment'),
    search:     (version)  => req('GET',    `/api/equipment/search?version=${encodeURIComponent(version)}`),
    get:        (id)       => req('GET',    `/api/equipment/${id}`),
    create:     (data)     => req('POST',   '/api/equipment', data),
    update:     (id, data) => req('PUT',    `/api/equipment/${id}`, data),
    delete:     (id)       => req('DELETE', `/api/equipment/${id}`),
    copy:       (id, data) => req('POST',   `/api/equipment/${id}/copy`, data),
    addVersion: (id, data) => req('POST',   `/api/equipment/${id}/versions`, data),
    getVersions:(id)       => req('GET',    `/api/equipment/${id}/versions`),
    getBackups: (id)       => req('GET',    `/api/equipment/${id}/backups`),
    getHardwareTree: (id, version) => req('GET', `/api/equipment/${id}/hardware-tree?version=${encodeURIComponent(version)}`),
  },
  slots: {
    create: (data)        => req('POST',   '/api/slots', data),
    update: (id, data)    => req('PUT',    `/api/slots/${id}`, data),
    delete: (id)          => req('DELETE', `/api/slots/${id}`),
    uploadImage: (id, fd) => req('POST',   `/api/slots/${id}/image`, fd),
    imageUrl: (id)        => `${BASE}/api/slots/${id}/image`,
  },
  backups: {
    upload:      (equipmentId, formData) => req('POST',   `/api/backups/upload/${equipmentId}`, formData),
    downloadUrl: (id)                    => `${BASE}/api/backups/${id}/download`,
    delete:      (id)                    => req('DELETE', `/api/backups/${id}`),
  },
  hardwareTrees: {
    list:    ()                    => req('GET',    '/api/hardware-trees'),
    get:     (id)                  => req('GET',    `/api/hardware-trees/${id}`),
    create:  (data)                => req('POST',   '/api/hardware-trees', data),
    update:  (id, data)            => req('PUT',    `/api/hardware-trees/${id}`, data),
    delete:  (id)                  => req('DELETE', `/api/hardware-trees/${id}`),
    copy:    (id, data)            => req('POST',   `/api/hardware-trees/${id}/copy`, data),
    compare: (model, from_v, to_v) => req('GET',    `/api/hardware-trees/compare?model=${encodeURIComponent(model)}&from_version=${encodeURIComponent(from_v)}&to_version=${encodeURIComponent(to_v)}`),
  },
  hardwareNodes: {
    create: (data)     => req('POST',   '/api/hardware-nodes', data),
    update: (id, data) => req('PUT',    `/api/hardware-nodes/${id}`, data),
    delete: (id)       => req('DELETE', `/api/hardware-nodes/${id}`),
  },
};
