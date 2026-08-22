import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Copy, Desktop, Plus, Trash } from '@openai/apps-sdk-ui/components/Icon'

const DISCONNECT_COMMAND = 'python3 ~/.mobius-connect/runner.py --uninstall'

const CSS = `
  * { box-sizing: border-box; }
  .cn-root {
    --cn-violet: #826df6; --cn-mint: #58cdbb; --cn-ink: #29243e;
    min-height: 100%; color: var(--text); background: var(--bg); font-family: var(--font);
    padding: clamp(20px, 4vw, 42px) 18px 56px;
  }
  .cn-shell { width: min(760px, 100%); margin: 0 auto; }
  .cn-head { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; margin-bottom: 28px; }
  .cn-mark { width: 58px; height: 58px; display: block; filter: drop-shadow(0 8px 14px color-mix(in srgb, var(--cn-violet) 20%, transparent)); }
  .cn-title { font-size: clamp(28px, 5vw, 38px); font-weight: 730; letter-spacing: -0.035em; line-height: 1; margin: 0; }
  .cn-sub { color: var(--muted); font-size: 14px; margin: 8px 0 0; line-height: 1.55; max-width: 62ch; }

  .cn-main { border-top: 1px solid var(--border); }
  .cn-onboard { padding: 22px 0 24px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
  .cn-field { min-width: 0; }
  .cn-label { display: block; font-size: 12px; font-weight: 670; color: var(--muted); margin: 0 0 8px 2px; }
  .cn-input { width: 100%; height: 48px; background: var(--surface); border: 1px solid var(--border); border-radius: 13px; color: var(--text); font: 15px var(--font); padding: 0 14px; }
  .cn-input::placeholder { color: color-mix(in srgb, var(--muted) 80%, transparent); }
  .cn-input:focus { outline: 2px solid color-mix(in srgb, var(--cn-violet) 75%, white); outline-offset: 2px; border-color: var(--cn-violet); }
  .cn-btn { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid transparent; border-radius: 12px; padding: 0 17px; background: var(--cn-violet); color: #fff; font: 650 14px var(--font); cursor: pointer; white-space: nowrap; transition: transform 160ms ease-out, background 160ms ease-out, border-color 160ms ease-out; }
  .cn-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cn-violet) 88%, white); }
  .cn-btn:active:not(:disabled) { transform: scale(.98); }
  .cn-btn:disabled { opacity: .52; cursor: default; }
  .cn-btn:focus-visible, .cn-iconbtn:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
  .cn-btn-ghost { background: transparent; color: var(--text); border-color: var(--border); }
  .cn-btn-ghost:hover:not(:disabled) { background: var(--surface-2); }
  .cn-btn-danger { background: #c9363e; color: #fff; }
  .cn-btn-sm { min-height: 44px; padding: 0 14px; font-size: 13px; }

  .cn-message { padding: 14px 16px; border-radius: 12px; margin: 0 0 16px; font-size: 13.5px; line-height: 1.5; }
  .cn-error { color: #9e242a; background: color-mix(in srgb, #e5484d 10%, var(--surface)); border: 1px solid color-mix(in srgb, #e5484d 35%, var(--border)); }
  .cn-notice { background: var(--surface); border: 1px solid var(--border); }
  .cn-notice strong { display: block; margin-bottom: 3px; }

  .cn-pairing { position: relative; overflow: hidden; background: var(--surface); border: 1px solid color-mix(in srgb, var(--cn-violet) 36%, var(--border)); border-radius: 18px; padding: 18px; margin: 2px 0 24px; }
  .cn-pairing::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 3px; background: linear-gradient(90deg, var(--cn-violet), var(--cn-mint)); }
  .cn-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 17px; }
  .cn-card-title { font-size: 16px; font-weight: 700; margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cn-card-title span { color: var(--cn-violet); }
  .cn-step { display: grid; grid-template-columns: 25px minmax(0, 1fr); gap: 11px; margin-top: 15px; }
  .cn-step-n { width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--cn-violet) 14%, var(--surface)); color: var(--cn-violet); font-size: 12px; font-weight: 750; display: grid; place-items: center; }
  .cn-step-t { font-size: 13.5px; line-height: 1.5; margin: 2px 0 8px; }
  .cn-code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: stretch; }
  .cn-code { min-width: 0; max-height: 106px; overflow: auto; padding: 11px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); color: var(--text); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; cursor: text; user-select: all; -webkit-user-select: all; }
  .cn-hint { color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 7px; }
  .cn-copybtn { min-width: 132px; }
  .cn-copybtn.is-copied { color: #168462; border-color: color-mix(in srgb, var(--cn-mint) 42%, var(--border)); background: color-mix(in srgb, var(--cn-mint) 10%, var(--surface)); }

  .cn-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 25px 2px 10px; }
  .cn-secttitle { font-size: 13px; font-weight: 720; margin: 0; }
  .cn-count { color: var(--muted); font-size: 12px; }
  .cn-list { border-top: 1px solid var(--border); }
  .cn-host { min-height: 76px; display: flex; align-items: center; gap: 14px; padding: 14px 2px; border-bottom: 1px solid var(--border); }
  .cn-host.is-confirming { flex-wrap: wrap; }
  .cn-host-symbol { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 11px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); }
  .cn-host-symbol.on { color: #168462; background: color-mix(in srgb, var(--cn-mint) 10%, var(--surface)); border-color: color-mix(in srgb, var(--cn-mint) 24%, var(--border)); }
  .cn-host-body { flex: 1; min-width: 0; }
  .cn-host-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .cn-host-name { font-size: 15px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cn-host-meta { color: var(--muted); font-size: 12.5px; margin-top: 4px; }
  .cn-actions { display: flex; align-items: center; gap: 8px; flex: none; }
  .cn-disconnect { flex: 0 0 calc(100% - 50px); margin: 2px 0 1px 50px; padding: 15px; border-radius: 13px; background: var(--surface); border: 1px solid var(--border); }
  .cn-disconnect-title { margin: 0 0 5px; font-size: 13.5px; font-weight: 700; }
  .cn-disconnect-copy { margin: 0 0 12px; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  .cn-disconnect-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .cn-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 670; color: var(--muted); background: var(--surface-2); }
  .cn-pill-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; position: relative; }
  .cn-pill.on { color: #168462; background: color-mix(in srgb, var(--cn-mint) 13%, var(--surface)); }
  .cn-pill.wait { color: #9b6d00; background: color-mix(in srgb, #e0a63a 13%, var(--surface)); }
  .cn-pill.on .cn-pill-dot::after { content: ''; position: absolute; inset: -3px; border: 1px solid currentColor; border-radius: 50%; animation: cn-pulse 2s ease-out infinite; }
  .cn-iconbtn { width: 44px; height: 44px; display: grid; place-items: center; flex: none; border-radius: 12px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; }
  .cn-iconbtn:hover:not(:disabled) { color: var(--text); background: var(--surface-2); }
  .cn-empty { padding: 46px 10px 28px; text-align: center; color: var(--muted); }
  .cn-empty-mark { width: 46px; height: 30px; margin: 0 auto 13px; position: relative; opacity: .72; }
  .cn-empty-mark::before, .cn-empty-mark::after { content: ''; position: absolute; top: 5px; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); background: var(--bg); }
  .cn-empty-mark::before { left: 0; } .cn-empty-mark::after { right: 0; }
  .cn-empty-mark span { position: absolute; left: 15px; top: 13px; width: 17px; height: 2px; background: var(--border); }
  .cn-empty-t { margin: 0 0 5px; color: var(--text); font-size: 15px; font-weight: 680; }
  .cn-empty-b { max-width: 47ch; margin: 0 auto; font-size: 13.5px; line-height: 1.55; }
  .cn-loading { padding: 42px 0; color: var(--muted); font-size: 13px; text-align: center; }
  @keyframes cn-pulse { from { transform: scale(.7); opacity: .75; } to { transform: scale(1.8); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .cn-pill.on .cn-pill-dot::after { animation: none; } .cn-btn { transition: none; } }
  @media (max-width: 560px) {
    .cn-root { padding-inline: 14px; }
    .cn-head { grid-template-columns: 48px 1fr; gap: 12px; margin-bottom: 22px; }
    .cn-mark { width: 48px; height: 48px; }
    .cn-onboard { grid-template-columns: 1fr; align-items: stretch; }
    .cn-onboard > .cn-btn { width: 100%; }
    .cn-host { align-items: center; flex-wrap: nowrap; padding: 15px 2px; }
    .cn-host-body { padding-top: 0; }
    .cn-actions { width: auto; padding-left: 0; }
    .cn-disconnect { flex-basis: 100%; margin-left: 0; }
    .cn-disconnect-actions { align-items: stretch; flex-direction: column-reverse; }
    .cn-disconnect-actions .cn-btn { width: 100%; }
    .cn-code-row { grid-template-columns: 1fr; }
    .cn-code-row .cn-btn { width: 100%; min-width: 0; }
  }
`

function BrandMark({ appId }) {
  return <img className="cn-mark" src={`/api/apps/${appId}/icon?size=128`} alt="" />
}

function relTime(timestamp) {
  if (!timestamp) return null
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function statusOf(host) {
  if (host.online) return { cls: 'on', label: 'Online' }
  if (host.paired) return { cls: 'off', label: 'Offline' }
  return { cls: 'wait', label: 'Waiting to pair' }
}

async function responseError(response, fallback) {
  try {
    const data = await response.json()
    return typeof data?.detail === 'string' ? data.detail : fallback
  } catch {
    return fallback
  }
}

function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState(null)
  const [failedKey, setFailedKey] = useState(null)
  const resetTimer = useRef(null)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const copy = useCallback(async (key, text) => {
    clearTimeout(resetTimer.current)
    const copied = await window.mobius?.clipboard?.writeText(text)
    if (!copied) {
      setCopiedKey(null)
      setFailedKey(key)
      return
    }
    setFailedKey(null)
    setCopiedKey(key)
    resetTimer.current = setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  return { copiedKey, failedKey, copy }
}

function CopyCommand({ command, copyKey, copiedKey, failedKey, onCopy, onSelect }) {
  const copied = copiedKey === copyKey
  return <>
    <div className="cn-code-row">
      <code className="cn-code" onClick={onSelect}>{command}</code>
      <button
        className={`cn-btn cn-btn-ghost cn-copybtn${copied ? ' is-copied' : ''}`}
        onClick={() => onCopy(copyKey, command)}
      >
        {copied ? <><Check size={17}/>Copied</> : <><Copy size={17}/>Copy command</>}
      </button>
    </div>
    {failedKey === copyKey ? <div className="cn-hint" role="status">
      Copy didn’t work on this device. Tap and hold the command to copy it.
    </div> : null}
  </>
}

function PairingPanel({ pairing, copiedKey, failedKey, onCopy, onDone, onSelect }) {
  return <section className="cn-pairing" aria-labelledby="cn-pair-title">
    <div className="cn-card-head">
      <h2 className="cn-card-title" id="cn-pair-title">
        Pair <span>{pairing.name}</span>
      </h2>
      <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onDone}>Done</button>
    </div>
    <div className="cn-step">
      <span className="cn-step-n">1</span>
      <div>
        <p className="cn-step-t">Run this command on the machine. It only needs Python 3.</p>
        <CopyCommand
          command={pairing.install_command}
          copyKey="pairing"
          copiedKey={copiedKey}
          failedKey={failedKey}
          onCopy={onCopy}
          onSelect={onSelect}
        />
        <div className="cn-hint">
          Installs a background service that reconnects after reboot. This command expires after 15 minutes.
        </div>
      </div>
    </div>
    <div className="cn-step">
      <span className="cn-step-n">2</span>
      <p className="cn-step-t">Leave this page open. This panel closes as soon as the machine is online.</p>
    </div>
  </section>
}

function DisconnectPanel({ host, busy, copiedKey, failedKey, onCopy, onKeep, onRemove, onSelect }) {
  const command = host.disconnect_command || DISCONNECT_COMMAND
  const copyKey = `disconnect:${host.id}`
  const title = host.paired
    ? (host.online ? 'Disconnect this machine?' : 'Stop Connect on this machine first')
    : 'Remove this unpaired machine?'
  const description = host.paired
    ? (host.online
      ? 'Connect will stop and remove the daemon, then revoke this machine.'
      : 'This machine is offline, so run this command on it before removing the saved connection.')
    : 'No daemon has connected yet, so only this saved entry will be removed.'
  const action = busy
    ? (host.online ? 'Disconnecting…' : 'Removing…')
    : (host.online ? 'Disconnect' : host.paired ? 'Remove saved connection' : 'Remove')

  return <div className="cn-disconnect">
    <p className="cn-disconnect-title">{title}</p>
    <p className="cn-disconnect-copy">{description}</p>
    {host.paired ? <CopyCommand
      command={command}
      copyKey={copyKey}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onSelect={onSelect}
    /> : null}
    <div className="cn-disconnect-actions">
      <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onKeep} disabled={busy}>
        Keep machine
      </button>
      <button className="cn-btn cn-btn-danger cn-btn-sm" onClick={onRemove} disabled={busy}>
        {action}
      </button>
    </div>
  </div>
}

function MachineRow({ host, confirming, deleting, copiedKey, failedKey, onCopy, onConfirm, onKeep, onPair, onRemove, onSelect }) {
  const status = statusOf(host)
  const meta = [
    host.platform,
    !host.online && host.paired && host.last_seen ? `Last seen ${relTime(host.last_seen)}` : null,
  ].filter(Boolean).join(' · ')

  return <article className={`cn-host${confirming ? ' is-confirming' : ''}`}>
    <div className={`cn-host-symbol${host.online ? ' on' : ''}`} aria-hidden="true">
      <Desktop size={20}/>
    </div>
    <div className="cn-host-body">
      <div className="cn-host-top">
        <span className="cn-host-name">{host.name}</span>
        <span className={`cn-pill ${status.cls}`} role="status">
          <span className="cn-pill-dot" aria-hidden="true"/>{status.label}
        </span>
      </div>
      {meta ? <div className="cn-host-meta">{meta}</div> : null}
    </div>
    {!confirming ? <div className="cn-actions">
      {!host.paired ? <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onPair}>
        Pair machine
      </button> : null}
      <button
        className="cn-iconbtn"
        onClick={onConfirm}
        aria-label={`Disconnect ${host.name}`}
        title="Disconnect machine"
      >
        <Trash size={17}/>
      </button>
    </div> : null}
    {confirming ? <DisconnectPanel
      host={host}
      busy={deleting}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onKeep={onKeep}
      onRemove={onRemove}
      onSelect={onSelect}
    /> : null}
  </article>
}

export default function App({ appId, token }) {
  const [hosts, setHosts] = useState([])
  const [serviceActive, setServiceActive] = useState(null)
  const [newName, setNewName] = useState('')
  const [pairing, setPairing] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)
  const readySignalled = useRef(false)
  const loadSequence = useRef(0)
  const { copiedKey, failedKey, copy } = useCopyFeedback()

  const headers = useCallback((extra = {}) => ({
    Authorization: `Bearer ${token}`,
    ...extra,
  }), [token])

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    try {
      const response = await fetch('/api/connect/hosts', { headers: headers() })
      if (sequence !== loadSequence.current) return
      if ([404, 501, 503].includes(response.status)) {
        setServiceActive(false)
        setError(null)
        return
      }
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t refresh your machines.'))
      }
      const data = await response.json()
      const nextHosts = Array.isArray(data.hosts) ? data.hosts : []
      setServiceActive(true)
      setHosts(nextHosts)
      setError(null)
      if (!readySignalled.current) {
        readySignalled.current = true
        window.mobius.signal('app_ready', { item_count: nextHosts.length })
      }
    } catch (cause) {
      if (sequence !== loadSequence.current) return
      const message = cause.message || 'Couldn’t refresh your machines.'
      setError(message)
      window.mobius.signal('error', { message, source: 'load' })
    }
  }, [headers])

  useEffect(() => {
    load()
    const timer = setInterval(load, pairing ? 1500 : 5000)
    return () => {
      clearInterval(timer)
      loadSequence.current += 1
    }
  }, [load, pairing])

  useEffect(() => {
    if (pairing && hosts.some(host => host.id === pairing.id && host.online)) {
      setPairing(null)
    }
  }, [hosts, pairing])

  const addMachine = useCallback(async () => {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/connect/hosts', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: newName.trim() || 'My machine' }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t add this machine.'))
      }
      setPairing(await response.json())
      setNewName('')
      window.mobius.signal('item_created', { type: 'machine' })
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t add this machine.')
    } finally {
      setCreating(false)
    }
  }, [creating, headers, load, newName])

  const showCommand = useCallback(async (id) => {
    setError(null)
    try {
      const response = await fetch(`/api/connect/hosts/${id}/pairing`, {
        headers: headers(),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t refresh the pairing command.'))
      }
      setPairing(await response.json())
    } catch (cause) {
      setError(cause.message || 'Couldn’t refresh the pairing command.')
    }
  }, [headers])

  const removeMachine = useCallback(async (host) => {
    if (deletingId) return
    setDeletingId(host.id)
    setError(null)
    try {
      const force = host.paired && !host.online ? '?force=true' : ''
      const response = await fetch(`/api/connect/hosts/${host.id}${force}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!response.ok && response.status !== 404) {
        throw new Error(await responseError(response, 'Couldn’t disconnect this machine.'))
      }
      if (pairing?.id === host.id) setPairing(null)
      setHosts(current => current.filter(item => item.id !== host.id))
      setConfirmingId(null)
      window.mobius.signal('item_deleted')
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t disconnect this machine.')
    } finally {
      setDeletingId(null)
    }
  }, [deletingId, headers, load, pairing])

  const selectCommand = useCallback((event) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(event.currentTarget)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  return <div className="cn-root">
    <style>{CSS}</style>
    <main className="cn-shell">
      <header className="cn-head">
        <BrandMark appId={appId}/>
        <div>
          <h1 className="cn-title">Connect</h1>
          <p className="cn-sub">Bring a laptop, workstation, or cluster within reach of Möbius — securely, from any device.</p>
        </div>
      </header>
      <div className="cn-main">
        <div aria-live="polite">
          {error ? <div className="cn-message cn-error">
            {error} Try again, or check that Möbius is online.
          </div> : null}
          {serviceActive === false ? <div className="cn-message cn-notice">
            <strong>Connect needs a restart</strong>
            The service is installed, but it won’t accept machines until Möbius restarts.
          </div> : null}
        </div>

        {serviceActive !== false ? <div className="cn-onboard">
          <label className="cn-field">
            <span className="cn-label">New machine</span>
            <input
              className="cn-input"
              placeholder="For example, MacBook or GPU workstation"
              value={newName}
              maxLength={80}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') addMachine() }}
            />
          </label>
          <button className="cn-btn" onClick={addMachine} disabled={creating}>
            {creating ? 'Creating…' : <><Plus size={18}/>Add machine</>}
          </button>
        </div> : null}

        {pairing ? <PairingPanel
          pairing={pairing}
          copiedKey={copiedKey}
          failedKey={failedKey}
          onCopy={copy}
          onDone={() => setPairing(null)}
          onSelect={selectCommand}
        /> : null}

        {serviceActive === null ? <div className="cn-loading" role="status">
          Checking your machines…
        </div> : null}

        {serviceActive === true && hosts.length > 0 ? <section aria-labelledby="cn-machines">
          <div className="cn-section-head">
            <h2 className="cn-secttitle" id="cn-machines">Your machines</h2>
            <span className="cn-count">{hosts.length} {hosts.length === 1 ? 'machine' : 'machines'}</span>
          </div>
          <div className="cn-list">
            {hosts.map(host => <MachineRow
              key={host.id}
              host={host}
              confirming={confirmingId === host.id}
              deleting={deletingId === host.id}
              copiedKey={copiedKey}
              failedKey={failedKey}
              onCopy={copy}
              onConfirm={() => setConfirmingId(host.id)}
              onKeep={() => setConfirmingId(null)}
              onPair={() => showCommand(host.id)}
              onRemove={() => removeMachine(host)}
              onSelect={selectCommand}
            />)}
          </div>
        </section> : null}

        {serviceActive === true && hosts.length === 0 && !pairing ? <div className="cn-empty">
          <div className="cn-empty-mark" aria-hidden="true"><span/></div>
          <p className="cn-empty-t">Your machines will meet here</p>
          <p className="cn-empty-b">Name one above, then run the one-line pairing command on it. No open ports or separate account needed.</p>
        </div> : null}
      </div>
    </main>
  </div>
}
