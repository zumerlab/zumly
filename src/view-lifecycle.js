/** Cleanup belongs to a resolved view instance, never to a cached template. */
// Drivers can be imported from a separate package entry point, so a module-local
// WeakMap would not see registrations made by the bundled core. A non-enumerable
// symbol property shares the scope through the node and is not copied by cloneNode.
const lifecycleKey = Symbol.for('zumly.viewLifecycles')

function runCleanup (cleanup) {
  try {
    const result = cleanup()
    if (result && typeof result.then === 'function') {
      result.catch(error => console.error('Zumly: view cleanup failed:', error)) // eslint-disable-line no-console
    }
  } catch (error) {
    console.error('Zumly: view cleanup failed:', error) // eslint-disable-line no-console
  }
}

/** Internal scope: accepts registrations before or after resolution finishes. */
export function createViewLifecycle () {
  let disposed = false
  const callbacks = []
  const lifecycle = {
    onCleanup (cleanup) {
      if (typeof cleanup !== 'function') throw new TypeError('Zumly: onCleanup expects a function')
      if (disposed) runCleanup(cleanup)
      else callbacks.push(cleanup)
    },
    attach (node) {
      let entries = node[lifecycleKey]
      if (!entries) {
        entries = new Set()
        Object.defineProperty(node, lifecycleKey, { value: entries, configurable: true })
      }
      entries.add(lifecycle)
    },
    dispose () {
      if (disposed) return
      disposed = true
      for (const cleanup of callbacks.splice(0).reverse()) runCleanup(cleanup)
    }
  }
  return lifecycle
}

/**
 * Dispose a view and registered descendants once. Call before permanent removal,
 * or for an unused async result; temporary detach/keepAlive must not call this.
 * Async cleanup is started here, with rejections handled, but is not awaited.
 */
export function disposeView (node) {
  if (!node) return
  // Snapshot descendants first: a framework cleanup may remove its own DOM.
  const nodes = [node, ...(node.querySelectorAll?.('*') || [])]
  for (const child of nodes.reverse()) {
    const entries = child[lifecycleKey]
    if (!entries) continue
    for (const lifecycle of entries) lifecycle.dispose()
    delete child[lifecycleKey]
  }
}
