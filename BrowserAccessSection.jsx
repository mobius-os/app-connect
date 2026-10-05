import { useState } from 'react'
import { Plus } from '@openai/apps-sdk-ui/components/Icon'
import { serverError } from './connect-api.mjs'
import { InlineActionConfirm, ListNote, useAction, usePolledList } from './connect-ui.jsx'

const ENDPOINT = '/api/connect/browser-access'
// Runtimes from before error codes report an unlinked account only by this text.
const UNLINKED_DETAIL = 'Link your mobius.you account in Identity first.'

const sameShare = (a, b) => a?.grant_id === b.grant_id && a?.origin === b.origin

export function useSharedDirectory(headers) {
  // Each read goes through to mobius.you, so poll slowly; the app also reloads
  // it when the Shared tab opens and whenever the page becomes visible.
  const list = usePolledList(`${ENDPOINT}/shared`, 'instances', 'Shared Möbius', headers, { interval: 60000 })
  const action = useAction()
  const respond = (instance, choice) => action.run(`respond:${instance.grant_id}`, async () => {
    const response = await fetch(`${ENDPOINT}/shared/respond`, {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ origin: instance.origin, grant_id: instance.grant_id, action: choice }),
    })
    if (!response.ok) throw await serverError(response)
    const updated = (await response.json())?.instance
    if (!sameShare(updated, instance)) throw new Error('Unexpected response')
    list.update(items => items.map(item => sameShare(item, instance) ? updated : item))
  }, 'Couldn’t confirm your response. Try again.')
  return {
    list, action, respond,
    unlinked: list.code === 'account_unlinked' || (list.httpStatus === 409 && list.notice?.message === UNLINKED_DETAIL),
    unread: list.items.filter(instance => instance.status === 'invited' && instance.unread === true).length,
  }
}

export function SharedWithMe({ directory }) {
  const { list, action, respond, unlinked } = directory
  if (list.status === 'unsupported') return null
  const locked = list.status !== 'ready' || action.pending.length > 0
  return <section className="cn-section cn-shared-with-me" aria-labelledby="cn-shared-title">
    <div className="cn-section-head"><div className="cn-section-heading"><h2 className="cn-secttitle" id="cn-shared-title">Shared with me</h2></div></div>
    {unlinked ? <p className="cn-browser-note">Link your mobius.you account in Identity to see instances shared with you.</p>
      : <ListNote list={list} loading="Loading shared Möbius…" failed="Couldn’t load instances shared with you. Connect will try again."/>}
    {action.error ? <p className="cn-browser-action-error" role="alert">{action.error}</p> : null}
    {list.status === 'ready' && !list.items.length ? <div className="cn-empty-row">No Möbius shared with this account yet.</div> : null}
    {list.items.length ? <div className="cn-list" aria-label="Instances shared with me">
      {list.items.map(instance => {
        const invited = instance.status === 'invited'
        return <article className="cn-browser-row" key={`${instance.origin}/${instance.grant_id}`}>
          <div className="cn-browser-person">
            <span className="cn-outbound-name">{instance.name}</span>
            <span className="cn-outbound-meta">Shared by {instance.owner_handle} · {instance.origin}{invited ? ' · Invited' : ''}</span>
          </div>
          <div className="cn-shared-actions">
            {invited ? <>
              <button className="cn-btn cn-btn-sm" disabled={locked} onClick={() => respond(instance, 'accept')}>
                {action.pending.includes(`respond:${instance.grant_id}`) ? 'Saving…' : 'Accept'}
              </button>
              {instance.unread ? <button className="cn-btn cn-btn-ghost cn-btn-sm" disabled={locked} onClick={() => respond(instance, 'later')}>Not now</button> : null}
            </> : instance.status === 'accepted' && list.status === 'ready'
              ? <a className="cn-btn cn-btn-ghost cn-btn-sm" href={instance.open_url} target="_blank" rel="noopener noreferrer">Open</a> : null}
          </div>
        </article>
      })}
    </div> : null}
  </section>
}

function grantMeta(grant) {
  if (grant.kind === 'account') {
    switch (grant.status) {
      case 'active': return 'Verified mobius.you account · Access until revoked'
      case 'pending': return 'mobius.you account · Registration pending · Access unavailable'
      case 'inactive': return 'mobius.you account · Needs a new invitation'
      case 'revoked': return 'mobius.you account · Revoked'
      default: return 'mobius.you account'
    }
  }
  // One-time link invitations are retired: existing ones show and revoke only.
  switch (grant.status) {
    case 'active': return 'One-time link · Access until revoked'
    case 'invited': return 'One-time link · Not accepted · Invite their mobius.you handle instead'
    default: return 'One-time link · Revoked'
  }
}

function revokeFallback(grant) {
  if (grant.directory_cleanup_pending) return 'Local access remains revoked. Couldn’t confirm directory removal; retry when available.'
  if (grant.status === 'revoked') return 'Access remains revoked. Couldn’t confirm the remaining work stopped; retry when available.'
  return 'Couldn’t confirm that access was revoked. Check the list before trying again.'
}

export default function BrowserAccessSection({ headers, poll = true, confirmation, setConfirmation }) {
  const grants = usePolledList(ENDPOINT, 'grants', 'Shared access', headers, { poll })
  const action = useAction()
  const [inviting, setInviting] = useState(false)
  const [handle, setHandle] = useState('')

  const putGrant = grant => grants.update(items => items.some(item => item.id === grant.id)
    ? items.map(item => item.id === grant.id ? grant : item)
    : [grant, ...items])

  const invite = recipient => action.run(`invite:${recipient}`, async () => {
    const response = await fetch(`${ENDPOINT}/accounts`, {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ recipient_handle: recipient }),
    })
    if (!response.ok) throw await serverError(response)
    const { grant } = await response.json()
    if (!grant?.id || grant.kind !== 'account') throw new Error('Unexpected response')
    // A new invitation revokes any inactive grant for the same person, as the
    // server does. A pending grant is retried under its reserved id instead.
    grants.update(items => items.map(item => (
      item.id !== grant.id && item.kind === 'account' && item.status === 'inactive'
      && item.recipient_handle === grant.recipient_handle
    ) ? { ...item, status: 'revoked' } : item))
    putGrant(grant)
  }, 'Couldn’t confirm account access was added. Check the list before trying again.')

  const revoke = grant => action.run(`revoke:${grant.id}`, async () => {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(grant.id)}`, { method: 'DELETE', headers: headers() })
    if (!response.ok) throw await serverError(response)
    // 202: access is revoked locally but some follow-up work is unconfirmed.
    const result = response.status === 202 ? await response.json() : { revoked: true }
    if (result?.revoked !== true) throw new Error('Unexpected response')
    putGrant({
      ...grant, status: 'revoked',
      stop_pending: Boolean(result.pending_commands?.length || result.pending_chat_ids?.length),
      directory_cleanup_pending: result.directory_cleanup_pending === true,
    })
    setConfirmation(null)
  }, revokeFallback(grant))

  const forbidden = grants.status === 'unsupported' && grants.httpStatus === 403
  if (grants.status === 'unsupported' && !forbidden) return null
  const hasList = grants.status === 'ready' || grants.status === 'stale'
  const locked = grants.status !== 'ready' || action.pending.length > 0
  const current = grants.items.filter(grant => grant.status !== 'revoked')
  const shown = grants.items.filter(grant => grant.status !== 'revoked' || grant.stop_pending || grant.directory_cleanup_pending)
  const recipient = handle.trim()

  return <section className="cn-section cn-browser-access" aria-labelledby="cn-browser-access-title">
    <div className="cn-section-head">
      <div className="cn-section-heading">
        <h2 className="cn-secttitle" id="cn-browser-access-title">People with access</h2>
        {current.length ? <span className="cn-count">{current.length}</span> : null}
      </div>
      {hasList ? <button className="cn-btn cn-btn-ghost cn-btn-sm" type="button" onClick={() => setInviting(value => !value)} aria-expanded={inviting}>
        {inviting ? 'Cancel' : <><Plus size={16}/>Invite person</>}
      </button> : null}
    </div>
    {forbidden ? <p className="cn-browser-note">Only this Möbius’s owner can manage shared access.</p> : null}
    <ListNote list={grants} loading="Loading shared access…" failed="Shared access could not be loaded. No access changes are available right now."/>
    {hasList && inviting ? <>
      <form className="cn-browser-create" onSubmit={async event => {
        event.preventDefault()
        if (await invite(recipient)) {
          setHandle('')
          setInviting(false)
        }
      }}>
        <label className="cn-field">
          <span className="cn-label">mobius.you handle</span>
          <input className="cn-input" value={handle} maxLength={31} placeholder="your-friend" autoComplete="off" autoFocus
            onChange={event => setHandle(event.target.value)} disabled={locked}/>
        </label>
        <button className="cn-btn" type="submit" disabled={locked || !recipient}>
          {action.pending.includes(`invite:${recipient}`) ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      <p className="cn-browser-warning">People with access can read shared data and take powerful actions in this Möbius. Only invite someone you trust.</p>
    </> : null}
    {action.error ? <p className="cn-browser-action-error" role="alert">{action.error}</p> : null}
    {hasList ? shown.length ? <div className="cn-list" aria-label="Browser access grants">
      {shown.map(grant => {
        const name = grant.kind === 'account' ? grant.recipient_handle || 'Account recipient' : grant.label
        const confirming = confirmation?.kind === 'revoke-person' && confirmation.id === grant.id
        return <article className="cn-browser-row" key={grant.id}>
          <div className="cn-browser-person">
            <span className="cn-outbound-name" title={name}>{name}</span>
            <span className="cn-outbound-meta">{grantMeta(grant)}</span>
            {grant.stop_pending ? <span className="cn-browser-stop-warning" role="status">Access revoked. Some work is still stopping; stop confirmation is pending.</span> : null}
            {grant.directory_cleanup_pending ? <span className="cn-browser-stop-warning" role="status">Local access revoked. Directory removal is pending; the listing may remain visible, but it cannot authorize access.</span> : null}
          </div>
          {grant.status === 'revoked' ? <button className="cn-btn cn-btn-ghost cn-btn-sm cn-browser-retry" onClick={() => revoke(grant)} disabled={locked}>
            {action.pending.includes(`revoke:${grant.id}`) ? 'Retrying…' : grant.directory_cleanup_pending ? 'Retry cleanup' : 'Retry stop'}
          </button> : <div className="cn-browser-row-action">
            {grant.kind === 'account' && (grant.status === 'inactive' || grant.status === 'pending') ? <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => invite(grant.recipient_handle)} disabled={locked}>
              {action.pending.includes(`invite:${grant.recipient_handle}`) ? 'Inviting…' : 'Invite again'}
            </button> : null}
            <InlineActionConfirm
              open={confirming}
              triggerLabel="Revoke"
              confirmLabel="Confirm revoke"
              confirmingLabel="Revoking…"
              onOpen={() => setConfirmation({ kind: 'revoke-person', id: grant.id })}
              onCancel={() => setConfirmation(null)}
              onConfirm={() => revoke(grant)}
              disabled={locked}
              confirming={action.pending.includes(`revoke:${grant.id}`)}
              triggerClass="cn-btn cn-btn-ghost cn-btn-sm"
            />
          </div>}
        </article>
      })}
    </div> : <div className="cn-empty-row">No people with access yet.</div> : null}
  </section>
}
