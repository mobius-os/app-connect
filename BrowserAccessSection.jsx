import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Plus } from '@openai/apps-sdk-ui/components/Icon'

const ENDPOINT = '/api/connect/browser-access'

export default function BrowserAccessSection({ headers }) {
  const [grants, setGrants] = useState([])
  const [state, setState] = useState('loading')
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [label, setLabel] = useState('')
  const [invitation, setInvitation] = useState(null)
  const [copyState, setCopyState] = useState('idle')
  const [creating, setCreating] = useState(false)
  const [reissuingId, setReissuingId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [revokingId, setRevokingId] = useState(null)
  const [pendingStops, setPendingStops] = useState({})
  const [actionError, setActionError] = useState(null)
  const requestSequence = useRef(0)
  const terminal = useRef(false)
  const actionInFlight = useRef(false)
  const revokedLocally = useRef(new Set())

  const load = useCallback(async () => {
    if (terminal.current || actionInFlight.current) return
    const sequence = ++requestSequence.current
    try {
      const response = await fetch(ENDPOINT, { headers: headers() })
      if (sequence !== requestSequence.current) return
      if (response.status === 403 || response.status === 404) {
        terminal.current = true
        setGrants([])
        setInvitation(null)
        setState(response.status === 403 ? 'forbidden' : 'unavailable')
        return
      }
      if (!response.ok) throw new Error('load')
      const data = await response.json()
      if (!Array.isArray(data?.grants)) throw new Error('shape')
      if (sequence !== requestSequence.current) return
      // A stale list must not undo a confirmed revoke or hide its pending stop.
      setGrants(current => {
        const incoming = data.grants.map(grant => revokedLocally.current.has(grant.id)
          ? { ...grant, status: 'revoked' } : grant)
        const ids = new Set(incoming.map(grant => grant.id))
        return [...incoming, ...current.filter(grant => revokedLocally.current.has(grant.id) && !ids.has(grant.id))]
      })
      setPendingStops(current => {
        const next = { ...current }
        for (const grant of data.grants) {
          if (grant.stop_pending === true) next[grant.id] = true
          else if (grant.status === 'revoked' && grant.stop_pending === false) delete next[grant.id]
        }
        return next
      })
      setHasSnapshot(true)
      setState('ready')
    } catch {
      if (sequence === requestSequence.current) setState('error')
    }
  }, [headers])

  useEffect(() => {
    terminal.current = false
    load()
    const timer = setInterval(load, 5000)
    return () => {
      clearInterval(timer)
      requestSequence.current += 1
    }
  }, [load])

  const canManage = state === 'ready' && !creating && !reissuingId && !revokingId

  const presentInvitation = (result, recipientLabel, reissued = false) => {
    if (!result?.grant?.id || !result?.join_url || !result?.invite_expires_at) {
      setActionError('An invitation may have been created, but its link could not be shown. Check the list before trying again.')
      return false
    }
    setGrants(current => current.some(item => item.id === result.grant.id)
      ? current.map(item => item.id === result.grant.id ? result.grant : item)
      : [result.grant, ...current])
    setInvitation({ label: recipientLabel, url: result.join_url, reissued })
    return true
  }

  const createInvitation = async () => {
    const recipientLabel = label.trim()
    if (!canManage || actionInFlight.current || !recipientLabel) return
    requestSequence.current += 1
    actionInFlight.current = true
    setCreating(true)
    setInvitation(null)
    setCopyState('idle')
    setActionError(null)
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ label: recipientLabel }),
      })
      if (response.status === 403 || response.status === 404) {
        terminal.current = true
        setState(response.status === 403 ? 'forbidden' : 'unavailable')
        return
      }
      if (!response.ok) throw new Error('create')
      const result = await response.json()
      if (presentInvitation(result, recipientLabel)) setLabel('')
    } catch {
      setActionError('Couldn’t confirm the invitation was created. Check the list before trying again.')
    } finally {
      actionInFlight.current = false
      setCreating(false)
    }
  }

  const newInvitation = async (grant) => {
    if (!canManage || actionInFlight.current || grant.status === 'revoked') return
    requestSequence.current += 1
    actionInFlight.current = true
    setReissuingId(grant.id)
    setConfirmingId(null)
    setInvitation(null)
    setCopyState('idle')
    setActionError(null)
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(grant.id)}/invitation`, {
        method: 'POST',
        headers: headers(),
      })
      if (response.status === 403) {
        terminal.current = true
        setState('forbidden')
        return
      }
      if (response.status === 404) {
        setActionError('Couldn’t create a new invitation for this person. The grant or invitation route may be unavailable; check the list before trying again.')
        return
      }
      if (!response.ok) throw new Error('reissue')
      presentInvitation(await response.json(), grant.label, true)
    } catch {
      setActionError('Couldn’t confirm the new invitation was created. Check the list before trying again.')
    } finally {
      actionInFlight.current = false
      setReissuingId(null)
    }
  }

  const revoke = async (grant) => {
    const retryingStop = Boolean(pendingStops[grant.id])
    if (!canManage || actionInFlight.current || (retryingStop
      ? grant.status !== 'revoked'
      : confirmingId !== grant.id || grant.status === 'revoked')) return
    requestSequence.current += 1
    actionInFlight.current = true
    setRevokingId(grant.id)
    setActionError(null)
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(grant.id)}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (response.status === 403) {
        terminal.current = true
        setState('forbidden')
        return
      }
      if (response.status === 202) {
        const result = await response.json()
        if (result?.revoked !== true) throw new Error('revoke')
        revokedLocally.current.add(grant.id)
        setGrants(current => current.map(item => item.id === grant.id ? { ...item, status: 'revoked' } : item))
        setPendingStops(current => ({ ...current, [grant.id]: true }))
        setConfirmingId(null)
        return
      }
      if (response.status !== 204) throw new Error('revoke')
      revokedLocally.current.add(grant.id)
      setGrants(current => current.map(item => item.id === grant.id ? { ...item, status: 'revoked' } : item))
      setPendingStops(current => {
        const next = { ...current }
        delete next[grant.id]
        return next
      })
      setConfirmingId(null)
    } catch {
      setActionError(retryingStop
        ? 'Access remains revoked. Couldn’t confirm the remaining work stopped; retry when available.'
        : 'Couldn’t confirm that access was revoked. Check the list before trying again.')
    } finally {
      actionInFlight.current = false
      setRevokingId(null)
    }
  }

  const copyLink = async () => {
    if (!invitation) return
    try {
      const copied = await window.mobius?.clipboard?.writeText(invitation.url)
      setCopyState(copied ? 'copied' : 'failed')
    } catch {
      setCopyState('failed')
    }
  }

  if (state === 'unavailable') return null

  return <section className="cn-section cn-browser-access" aria-labelledby="cn-browser-access-title">
    <div className="cn-section-head">
      <div className="cn-section-heading">
        <h2 className="cn-secttitle" id="cn-browser-access-title">People with browser access</h2>
        {state !== 'forbidden' && hasSnapshot ? <span className="cn-count">{grants.filter(grant => grant.status !== 'revoked').length}</span> : null}
      </div>
    </div>
    {state === 'forbidden' ? <p className="cn-browser-note">Only this Möbius’s owner can manage browser access.</p> : <>
      <p className="cn-browser-warning">People with browser access can read shared data and take powerful actions in this Möbius. Only invite someone you trust.</p>
      {state === 'error' ? <p className="cn-browser-note" role="status">
        {hasSnapshot ? 'Showing the last successful list. Invitations and revoking access are paused until it refreshes.' : 'Browser access could not be loaded. No access changes are available right now.'}
      </p> : null}
      {state === 'loading' ? <p className="cn-browser-note" role="status">Loading browser access…</p> : null}
      {hasSnapshot ? <>
        <div className="cn-browser-create">
          <label className="cn-field">
            <span className="cn-label">Recipient label</span>
            <input className="cn-input" value={label} maxLength={128} placeholder="Alex"
              onChange={event => setLabel(event.target.value)} disabled={!canManage}/>
          </label>
          <button className="cn-btn" onClick={createInvitation} disabled={!canManage || !label.trim()}>
            <Plus size={16}/>{creating ? 'Creating…' : 'Create invitation'}
          </button>
        </div>
        <p className="cn-browser-note">This label is assigned by you; it does not verify the recipient’s account.</p>
        {invitation ? <div className="cn-browser-link" role="status">
          <div className="cn-browser-link-head">
            <strong>Invitation for {invitation.label}</strong>
            <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => { setInvitation(null); setCopyState('idle') }}>Done</button>
          </div>
          <p>This one-time link is shown only now. Share it privately. It expires after one day; accepted access lasts until revoked.</p>
          {invitation.reissued ? <p>It replaces unused invitation links only. Existing browser sessions and access are unchanged.</p> : null}
          <div className="cn-code-row">
            <code className="cn-code">{invitation.url}</code>
            <button className="cn-btn cn-btn-ghost cn-copybtn" onClick={copyLink}>
              {copyState === 'copied' ? <><Check size={17}/>Copied</> : <><Copy size={17}/>Copy link</>}
            </button>
          </div>
          {copyState === 'failed' ? <p className="cn-hint">Copy didn’t work. Select the link above to copy it.</p> : null}
        </div> : null}
        {actionError ? <p className="cn-browser-action-error" role="alert">{actionError}</p> : null}
        {grants.some(grant => grant.status !== 'revoked') ? <p className="cn-browser-note">For another browser or after a 30-day inactive session expires, use New invitation. It replaces unused links without changing existing sessions or access.</p> : null}
        {grants.length ? <div className="cn-list" aria-label="Browser access grants">
          {grants.map(grant => <article className="cn-browser-row" key={grant.id}>
            <div className="cn-browser-person">
              <span className="cn-outbound-name" title={grant.label}>{grant.label}</span>
              <span className="cn-outbound-meta">{grant.status === 'active' ? 'Active · Access until revoked' : grant.status === 'invited' ? 'Invited · Accepted access lasts until revoked' : 'Revoked'}</span>
              {pendingStops[grant.id] ? <span className="cn-browser-stop-warning" role="status">Access revoked. Some work is still stopping; stop confirmation is pending.</span> : null}
            </div>
            {grant.status !== 'revoked' ? <div className="cn-browser-row-action">
              <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => newInvitation(grant)} disabled={!canManage}>
                {reissuingId === grant.id ? 'Creating…' : 'New invitation'}
              </button>
              <button className={`cn-btn cn-btn-sm ${confirmingId === grant.id ? 'cn-btn-danger' : 'cn-btn-ghost'}`}
                onClick={() => confirmingId === grant.id ? revoke(grant) : setConfirmingId(grant.id)}
                disabled={!canManage} aria-expanded={confirmingId === grant.id}>
                {revokingId === grant.id ? 'Revoking…' : confirmingId === grant.id ? 'Confirm revoke' : 'Revoke'}
              </button>
              {confirmingId === grant.id ? <button className="cn-btn cn-btn-ghost cn-btn-sm cn-inline-not-now" onClick={() => setConfirmingId(null)} disabled={Boolean(revokingId)}>Not now</button> : null}
            </div> : pendingStops[grant.id] ? <button className="cn-btn cn-btn-ghost cn-btn-sm cn-browser-retry"
              onClick={() => revoke(grant)} disabled={!canManage}>{revokingId === grant.id ? 'Retrying…' : 'Retry stop'}</button> : null}
          </article>)}
        </div> : <div className="cn-empty-row">No browser access invitations yet.</div>}
      </> : null}
    </>}
  </section>
}
