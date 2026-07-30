// Static UI assets the browser fetches without app-managed credentials, e.g.
// the manifest link in <head>. These bypass auth so the page can install/render
// the manifest icons even when a server password is configured.
export const PUBLIC_UI_PATHS = new Set<string>([
  "/site.webmanifest",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
  // Org model policy is written by Skills Manager to a local file; the desktop
  // UI polls this without Basic credentials. Not a secret — just mode + model ids.
  "/skills/model-policy",
  // Org-shared provider IDs for「共享」badges in the model picker (not secrets).
  "/skills/org-providers",
])

export function isPublicUIPath(method: string, pathname: string) {
  return method === "GET" && PUBLIC_UI_PATHS.has(pathname)
}
