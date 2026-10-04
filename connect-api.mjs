export async function responseErrorData(response, fallback) {
  try {
    const data = await response.json()
    return {
      detail: typeof data?.detail === 'string' ? data.detail : fallback,
      code: typeof data?.code === 'string' ? data.code : null,
    }
  } catch {
    return { detail: fallback, code: null }
  }
}

export async function responseError(response, fallback) {
  return (await responseErrorData(response, fallback)).detail
}

// The server's own answer to a request. Any other failure (a lost connection,
// a malformed body) leaves the outcome unknown, so callers show their fallback.
export class ServerError extends Error {}

export async function serverError(response) {
  // A refusal without a reason is still a known outcome; only 5xx stays unknown.
  const fallback = response.status < 500 ? `Möbius refused this request (HTTP ${response.status}).` : ''
  return new ServerError(await responseError(response, fallback))
}

export function failureMessage(cause, fallback) {
  return (cause instanceof ServerError && cause.message) || fallback
}

// Each direction settles independently: unavailable sharing must not hide machines.
export async function loadConnectionList(url, field, label, headers) {
  try {
    const response = await fetch(url, { headers })
    if (response.status === 404 || response.status === 501) {
      return { ready: false, transient: false, status: response.status, items: [], notice: {
        title: `${label} is not supported by this running Möbius`,
        message: 'Check for a Möbius platform update in Settings. Restart only if an installed update asks for it. If Möbius is up to date, ask its agent to check this missing feature; repeated restarts will not add it.',
      } }
    }
    if (response.status === 503) {
      return { ready: false, transient: true, status: 503, items: [], notice: {
        title: `${label} is unavailable`,
        message: 'The service could not start or is temporarily unavailable. If this continues, ask your Möbius agent to check the service. Restarting is not a confirmed fix.',
      } }
    }
    if (!response.ok) {
      const { detail, code } = await responseErrorData(response, `Couldn’t load ${label.toLowerCase()} (HTTP ${response.status}).`)
      throw Object.assign(new Error(detail), { transient: response.status >= 500, status: response.status, code })
    }
    const data = await response.json()
    if (!Array.isArray(data?.[field])) throw Object.assign(new Error('Möbius returned an unexpected response. Ask its agent to check the service.'), { transient: false })
    return { ready: true, transient: false, items: data[field], notice: null, data }
  } catch (cause) {
    return { ready: false, transient: cause.transient ?? true, status: cause.status ?? null, code: cause.code ?? null, items: [], notice: {
      title: `Couldn’t load ${label.toLowerCase()}`,
      message: cause.message || 'Check your connection and try again.',
    } }
  }
}

// These answers will not change while this page is open, so polling stops.
const UNSUPPORTED = new Set([403, 404, 501])

export const INITIAL_LIST = { status: 'loading', items: [], data: null, notice: null, code: null, httpStatus: null }

// status: 'loading' | 'ready' | 'stale' (had data, now failing temporarily)
//       | 'unsupported' (403/404/501) | 'failed' (anything else; no data kept)
export function nextList(previous, result) {
  if (result.ready) return { ...INITIAL_LIST, status: 'ready', items: result.items, data: result.data }
  if (result.transient && (previous.status === 'ready' || previous.status === 'stale')) {
    return { ...previous, status: 'stale', notice: result.notice }
  }
  return {
    ...INITIAL_LIST,
    status: UNSUPPORTED.has(result.status) ? 'unsupported' : 'failed',
    notice: result.notice,
    code: result.code ?? null,
    httpStatus: result.status ?? null,
  }
}
