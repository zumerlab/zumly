/**
 * Which view a trigger leads to: its view name plus the data params that set
 * it apart. `data-to="room" data-id="kitchen"` and `data-to="room" data-id="bedroom"`
 * are two siblings; a plain `data-to="room"` keeps the bare name as its key.
 */

/** Zumly's own data attributes on a trigger: they never tell views apart. */
const RESERVED = new Set(['to', 'sibling', 'title', 'deferred', 'hideTrigger', 'noSwipe'])

/**
 * The params that identify a view, from a trigger's dataset or from the props
 * passed to goTo()/zoomTo(). Zumly's own attributes (data-to, data-with-*, …),
 * empty values and non-scalar values do not count. Null when nothing is left.
 * @param {object} [props]
 * @returns {Record<string, string>|null}
 */
export function identityParams (props) {
  if (!props || typeof props !== 'object') return null
  let params = null
  for (const key of Object.keys(props).sort()) {
    if (RESERVED.has(key) || /^with[A-Z]/.test(key)) continue
    const value = props[key]
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    if (value === '') continue
    ;(params ||= {})[key] = String(value)
  }
  return params
}

// encodeURIComponent leaves . ! ~ * ' ( ) - _ alone; encode the first six too,
// so a router separator such as '.' or '>' never appears inside a param.
const encode = value => encodeURIComponent(value).replace(/[.!~*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())

/**
 * A string key for a view identity: 'room' or 'room?id=kitchen'.
 * @param {string} name
 * @param {Record<string, string>|null} [params]
 * @returns {string}
 */
export function viewKey (name, params) {
  if (!params) return name
  const keys = Object.keys(params).sort()
  if (!keys.length) return name
  return `${name}?${keys.map(key => `${encode(key)}=${encode(params[key])}`).join('&')}`
}

/**
 * Split a key from viewKey() into its name and params.
 * @param {string} key
 * @returns {{ name: string, params: Record<string, string>|null }}
 */
export function parseViewKey (key) {
  const index = typeof key === 'string' ? key.indexOf('?') : -1
  if (index === -1) return { name: key, params: null }
  let params = null
  for (const pair of key.slice(index + 1).split('&')) {
    if (!pair) continue
    const [rawKey, rawValue = ''] = pair.split('=')
    try {
      ;(params ||= {})[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue)
    } catch {
      return { name: key, params: null }
    }
  }
  return { name: key.slice(0, index), params }
}
