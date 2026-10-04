import { useState } from 'react'
import { Plus } from '@openai/apps-sdk-ui/components/Icon'
import { serverError } from './connect-api.mjs'
import { CopyCommand, InlineActionConfirm, ListNote, useAction, usePolledList } from './connect-ui.jsx'

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
  // A refusal is a real failure to show; only a missing route hides the section.
  const refused = list.status === 'unsupported' && list.httpStatus === 403
  if (list.status === 'unsupported' && !refused) return null
  const locked = list.status !== 'ready' || action.pending.length > 0
  return <section className="cn-section cn-shared-with-me" aria-labelledby="cn-shared-title">
    <div className="cn-section-head"><div className="cn-section-heading"><h2 className="cn-secttitle" id="cn-shared-title">Shared with me</h2></div></div>
    {unlinked ? <p className="cn-browser-note">Link your mobius.you account in Identity to see instances shared with you.</p>
      : <ListNote list={refused ? { ...list, status: 'failed' } : list} loading="Loading shared Möbius…"
        failed={refused ? 'Couldn’t load instances shared with you.' : 'Couldn’t load instances shared with you. Connect will try again.'}/>}
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
  switch (grant.status) {
    case 'active': return 'Active · Access until revoked'
    case 'invited': return 'Invited · Accepted access lasts until revoked'
    default: return 'Revoked'
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
  const links = useLinkInvitations({ headers, run: action.run, putGrant })

  const invite = recipient => action.run(`invite:${recipient}`, async () => {
    const response = await fetch(`${ENDPOINT}/accounts`, {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ recipient_handle: recipient }),
    })
    if (!response.ok) throw await serverError(response)
    const { grant } = await response.json()
    if (!grant?.id || grant.kind !== 'account') throw new Error('Unexpected response')
    // A new invitation replaces any inactive grant for the same person.
    grants.update(items => items.filter(item => !(
      item.id !== grant.id && item.kind === 'account' && item.status === 'inactive'
      && item.recipient_handle === grant.recipient_handle
    )))
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
      <LinkInvitationForm disabled={locked} creating={action.pending.includes('link:create')} onCreate={links.create}/>
    </> : null}
    {links.invitation ? <LinkInvitationPanel invitation={links.invitation} onDone={links.dismiss}/> : null}
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
            {grant.kind === 'account' && grant.status === 'inactive' ? <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => invite(grant.recipient_handle)} disabled={locked}>
              {action.pending.includes(`invite:${grant.recipient_handle}`) ? 'Inviting…' : 'Invite again'}
            </button> : null}
            {grant.kind !== 'account' ? <NewLinkButton disabled={locked} creating={action.pending.includes(`link:${grant.id}`)} onClick={() => links.reissue(grant)}/> : null}
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

// One-time link invitations: the older way to share, and the only one for
// someone without a mobius.you account. Everything specific to links is below
// this line, so the flow can be removed as a unit.

function useLinkInvitations({ headers, run, putGrant }) {
  const [invitation, setInvitation] = useState(null)
  const request = (key, url, body, label, reissued, fallback) => run(key, async () => {
    setInvitation(null)
    const response = await fetch(url, {
      method: 'POST',
      headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) throw await serverError(response)
    const result = await response.json()
    if (!result?.grant?.id || !result.join_url) throw new Error('Unexpected response')
    putGrant(result.grant)
    setInvitation({ label, url: result.join_url, reissued })
  }, fallback)
  return {
    invitation,
    dismiss: () => setInvitation(null),
    create: label => request('link:create', ENDPOINT, { label }, label, false,
      'Couldn’t confirm the invitation was created. Check the list before trying again.'),
    reissue: grant => request(`link:${grant.id}`, `${ENDPOINT}/${encodeURIComponent(grant.id)}/invitation`, null, grant.label, true,
      'Couldn’t confirm the new invitation was created. Check the list before trying again.'),
  }
}

function LinkInvitationForm({ disabled, creating, onCreate }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  return <>
    <button className="cn-btn cn-btn-ghost cn-btn-sm" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {open ? 'Hide invitation option' : 'Use one-time invitation instead'}
    </button>
    {open ? <>
      <form className="cn-browser-create" onSubmit={async event => {
        event.preventDefault()
        if (await onCreate(label.trim())) setLabel('')
      }}>
        <label className="cn-field">
          <span className="cn-label">Recipient label</span>
          <input className="cn-input" value={label} maxLength={128} placeholder="Alex" onChange={event => setLabel(event.target.value)} disabled={disabled}/>
        </label>
        <button className="cn-btn" type="submit" disabled={disabled || !label.trim()}>
          <Plus size={16}/>{creating ? 'Creating…' : 'Create invitation'}
        </button>
      </form>
      <p className="cn-browser-note">This label is assigned by you; it does not verify the recipient’s account.</p>
    </> : null}
  </>
}

function NewLinkButton({ disabled, creating, onClick }) {
  return <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onClick} disabled={disabled}
    title="For the recipient’s other browser, or after a 30-day inactive session expires. Replaces unused links without changing existing sessions or access.">
    {creating ? 'Creating…' : 'New invitation'}
  </button>
}

function LinkInvitationPanel({ invitation, onDone }) {
  return <div className="cn-browser-link" role="status">
    <div className="cn-browser-link-head">
      <strong>Invitation for {invitation.label}</strong>
      <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onDone}>Done</button>
    </div>
    <p>This one-time link is shown only now. Share it privately. It expires after one day; accepted access lasts until revoked.</p>
    {invitation.reissued ? <p>It replaces unused invitation links only. Existing browser sessions and access are unchanged.</p> : null}
    <CopyCommand command={invitation.url} what="link"/>
  </div>
}
