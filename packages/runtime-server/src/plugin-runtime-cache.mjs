const CDN_ORIGIN = "https://cdn.jsdelivr.net";

function validInlineScriptHashes(hashes) {
  if (!Array.isArray(hashes)) return [];
  return hashes.filter((hash) => /^'sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}'$/.test(hash));
}

function contentSecurityPolicy(pluginDescriptors, inlineScriptHashes) {
  const permissions = new Set(
    pluginDescriptors.flatMap(({manifest}) => Array.isArray(manifest.permissions) ? manifest.permissions : []),
  );
  const scriptSources = ["'self'", ...validInlineScriptHashes(inlineScriptHashes)];
  const connectSources = ["'self'", "ws:"];

  if (permissions.has("runtime.wasm")) scriptSources.push("'wasm-unsafe-eval'");
  if (permissions.has("network.cdn")) {
    scriptSources.push(CDN_ORIGIN);
    connectSources.push(CDN_ORIGIN);
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function createPluginManifestSnapshot(descriptors, inlineScriptHashes) {
  const byId = new Map();
  for (const descriptor of descriptors) {
    const pluginId = descriptor?.manifest?.id;
    // Mantém a semântica anterior: se dois manifestos declararem o mesmo id,
    // o primeiro diretório descoberto é o que atende o backend.
    if (typeof pluginId === "string" && !byId.has(pluginId)) byId.set(pluginId, descriptor);
  }
  return {
    descriptors,
    byId,
    policy: contentSecurityPolicy(descriptors, inlineScriptHashes),
  };
}

export function createPluginBackendResolver({
  backendPathFor,
  statBackend,
  createBackendProxy,
  disposeBackend,
}) {
  async function resolveUncached(context, pluginId, activeWorkspaceRoot, cacheKey, descriptorsById) {
    const descriptor = descriptorsById.get(pluginId);
    if (!descriptor?.manifest.entrypoints?.backend) return undefined;
    const backendPath = backendPathFor(descriptor);
    let backendInfo;
    try {
      backendInfo = backendPath ? await statBackend(backendPath) : undefined;
    } catch {
      backendInfo = undefined;
    }
    if (!backendPath || !backendInfo?.isFile()) {
      throw new Error(`Caminho de backend inválido para o plugin: ${pluginId}`);
    }

    const cached = context.backendHandlers.get(cacheKey);
    if (cached?.mtime === backendInfo.mtimeMs) return cached.handler;
    if (cached) {
      context.backendHandlers.delete(cacheKey);
      await disposeBackend(cached.handler);
    }
    const handler = createBackendProxy({
      backendPath,
      workspaceRoot: activeWorkspaceRoot,
      pluginId,
    });
    context.backendHandlers.set(cacheKey, {mtime: backendInfo.mtimeMs, handler});
    return handler;
  }

  return function resolveBackend(context, pluginId, activeWorkspaceRoot, descriptorsById) {
    const cacheKey = `${pluginId}:${activeWorkspaceRoot}`;
    const pending = context.backendResolutions.get(cacheKey);
    if (pending) return pending;
    const resolution = resolveUncached(context, pluginId, activeWorkspaceRoot, cacheKey, descriptorsById)
      .finally(() => {
        if (context.backendResolutions.get(cacheKey) === resolution) {
          context.backendResolutions.delete(cacheKey);
        }
      });
    context.backendResolutions.set(cacheKey, resolution);
    return resolution;
  };
}
