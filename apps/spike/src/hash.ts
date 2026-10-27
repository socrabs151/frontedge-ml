/** Hash parameters for a screen that is not the runs list. */
export function readHashParams(): URLSearchParams {
  const [, search = ""] = window.location.hash.split("?");
  return new URLSearchParams(search);
}

export function writeHashParams(path: string, params: URLSearchParams): void {
  // A screen that is unmounting must not overwrite the route that replaced it.
  const current = window.location.hash.replace(/^#/, "").split("?")[0];
  if (current !== path) return;
  const search = params.toString();
  const hash = search ? `#${path}?${search}` : `#${path}`;
  if (window.location.hash !== hash) {
    window.history.replaceState(null, "", hash);
  }
}

export function onHashChange(handler: () => void): () => void {
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}
