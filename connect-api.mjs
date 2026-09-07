export async function responseError(response, fallback) {
  try {
    const data = await response.json()
    return typeof data?.detail === 'string' ? data.detail : fallback
  } catch {
    return fallback
  }
}

// Each direction settles independently: unavailable sharing must not hide machines.
export async function loadConnectionList(url, field, label, headers) {
  try {
    const response = await fetch(url, { headers })
    if (response.status === 404 || response.status === 501) {
      return { ready: false, items: [], notice: {
        title: `${label} is not supported by this running Möbius`,
        message: 'Check for a Möbius platform update in Settings. Restart only if an installed update asks for it. If Möbius is up to date, ask its agent to check this missing feature; repeated restarts will not add it.',
      } }
    }
    if (response.status === 503) {
      return { ready: false, items: [], notice: {
        title: `${label} is unavailable`,
        message: 'The service could not start or is temporarily unavailable. If this continues, ask your Möbius agent to check the service. Restarting is not a confirmed fix.',
      } }
    }
    if (!response.ok) {
      throw new Error(await responseError(response, `Couldn’t load ${label.toLowerCase()} (HTTP ${response.status}).`))
    }
    const data = await response.json()
    if (!Array.isArray(data?.[field])) throw new Error('Möbius returned an unexpected response. Ask its agent to check the service.')
    return { ready: true, items: data[field], notice: null }
  } catch (cause) {
    return { ready: false, items: [], notice: {
      title: `Couldn’t load ${label.toLowerCase()}`,
      message: cause.message || 'Check your connection and try again.',
    } }
  }
}
