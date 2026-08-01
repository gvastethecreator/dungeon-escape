/** QA and explicit runtime URLs bypass the deferred Welcome shell. */
export function shouldLoadDungeonRuntime(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.has("perfAudit") || params.get("runtime") === "1";
}
