const CHUNK_LOAD_FAILURE = /(?:failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk\s+\S+\s+failed|chunkloaderror)/i

/** A deployed SPA can replace hashed route chunks while an open tab still
 * runs the earlier shell. Retrying the same React subtree requests the same
 * missing file again. A full reload is the only useful recovery. */
export function needsAppReload(error?: Error): boolean {
  if (!error) return false
  return CHUNK_LOAD_FAILURE.test(`${error.name}: ${error.message}`)
}
