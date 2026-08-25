import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Copy, Desktop, Plus } from '@openai/apps-sdk-ui/components/Icon'
import {
  cancelCommandPath,
  commandCapabilities,
  disconnectPresentation,
  statusOf,
} from './connect-state.mjs'

const DISCONNECT_COMMAND = 'python3 ~/.mobius-connect/runner.py --uninstall'

const CSS = `
  * { box-sizing: border-box; }
  .cn-root {
    --cn-violet: #826df6; --cn-mint: #58cdbb; --cn-ink: #29243e;
    min-height: 100%; color: var(--text); background: var(--bg); font-family: var(--font);
  }
  .cn-head { width: 100%; border-bottom: 1px solid var(--border); background: var(--bg); }
  .cn-head-inner { width: min(760px, 100%); margin: 0 auto; display: flex; align-items: center; gap: 11px; padding: max(12px, env(safe-area-inset-top)) 16px 12px; }
  .cn-mark { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 8px; display: block; object-fit: contain; }
  .cn-head-copy { min-width: 0; }
  .cn-title { font-size: 18px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; margin: 0; }
  .cn-sub { color: var(--muted); font-size: 12px; font-weight: 500; margin: 2px 0 0; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cn-shell { width: min(720px, calc(100% - 32px)); margin: 0 auto; padding: 18px 0 56px; }

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
  .cn-btn:focus-visible, .cn-host-namebtn:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
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
  .cn-host { position: relative; min-height: 76px; display: flex; align-items: center; gap: 14px; padding: 14px 2px; border-bottom: 1px solid var(--border); }
  .cn-host.is-confirming { flex-wrap: wrap; }
  .cn-host-toggle { position: absolute; z-index: 0; inset: 0 0 auto; width: 100%; height: 75px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; }
  .cn-host-toggle:hover:not(:disabled) { background: color-mix(in srgb, var(--surface-2) 45%, transparent); }
  .cn-host-toggle:disabled { cursor: default; }
  .cn-host-toggle:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
  .cn-host-symbol { position: relative; z-index: 1; pointer-events: none; flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 11px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); }
  .cn-host-symbol.on { color: #168462; background: color-mix(in srgb, var(--cn-mint) 10%, var(--surface)); border-color: color-mix(in srgb, var(--cn-mint) 24%, var(--border)); }
  .cn-host-body { position: relative; z-index: 1; pointer-events: none; flex: 1; min-width: 0; }
  .cn-host-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .cn-host-namebtn { pointer-events: auto; max-width: min(100%, 44ch); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: -5px; padding: 5px; border: 0; border-radius: 6px; background: transparent; color: var(--text); font: 650 15px var(--font); text-align: left; cursor: text; }
  .cn-host-namebtn:hover { background: var(--surface-2); text-decoration: underline; text-underline-offset: 3px; }
  .cn-host-meta { color: var(--muted); font-size: 12.5px; margin-top: 4px; }
  .cn-toggle-mark { position: relative; z-index: 1; pointer-events: none; flex: none; width: 32px; height: 32px; display: grid; place-items: center; color: var(--muted); transition: transform 160ms ease-out; }
  .cn-toggle-mark.is-open { transform: rotate(180deg); }
  .cn-toggle-mark svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .cn-disconnect { flex: 0 0 calc(100% - 50px); margin: 2px 0 1px 50px; padding: 15px; border-radius: 13px; background: var(--surface); border: 1px solid var(--border); }
  .cn-disconnect-title { margin: 0 0 5px; font-size: 13.5px; font-weight: 700; }
  .cn-disconnect-copy { margin: 0 0 12px; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  .cn-disconnect-alt { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
  .cn-disconnect-alt-title { margin: 0 0 4px; font-size: 12.5px; font-weight: 700; }
  .cn-disconnect-alt-copy { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .cn-disconnect-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 4px 0 0; }
  .cn-command { flex: 0 0 calc(100% - 50px); margin: 2px 0 1px 50px; padding: 14px 15px; border-radius: 13px; background: color-mix(in srgb, var(--cn-violet) 6%, var(--surface)); border: 1px solid color-mix(in srgb, var(--cn-violet) 22%, var(--border)); }
  .cn-command-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .cn-command-copy { min-width: 0; }
  .cn-command-title { margin: 0; font-size: 13.5px; font-weight: 700; }
  .cn-command-meta { margin: 4px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.45; }
  .cn-command-confirm { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .cn-command-confirm p { margin: 0 0 10px; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  .cn-command-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .cn-update { flex: 0 0 calc(100% - 50px); margin: 2px 0 1px 50px; padding: 14px 15px; border-radius: 13px; background: var(--surface); border: 1px solid var(--border); }
  .cn-update-title { margin: 0 0 4px; font-size: 13.5px; font-weight: 700; }
  .cn-update-copy { margin: 0 0 11px; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  .cn-rename { pointer-events: auto; display: flex; align-items: center; gap: 8px; width: 100%; }
  .cn-rename .cn-input { height: 42px; flex: 1; min-width: 0; }
  .cn-rename-actions { display: flex; gap: 8px; flex: none; }
  .cn-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 670; color: var(--muted); background: var(--surface-2); }
  .cn-pill-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; position: relative; }
  .cn-pill.on { color: #168462; background: color-mix(in srgb, var(--cn-mint) 13%, var(--surface)); }
  .cn-pill.wait { color: #9b6d00; background: color-mix(in srgb, #e0a63a 13%, var(--surface)); }
  .cn-pill.busy { color: var(--cn-violet); background: color-mix(in srgb, var(--cn-violet) 13%, var(--surface)); }
  .cn-pill.busy .cn-pill-dot::after { content: ''; position: absolute; inset: -3px; border: 1px solid currentColor; border-radius: 50%; animation: cn-pulse 1.4s ease-out infinite; }
  .cn-pill.on .cn-pill-dot::after { content: ''; position: absolute; inset: -3px; border: 1px solid currentColor; border-radius: 50%; animation: cn-pulse 2s ease-out infinite; }
  .cn-empty { padding: 46px 10px 28px; text-align: center; color: var(--muted); }
  .cn-empty-mark { width: 46px; height: 30px; margin: 0 auto 13px; position: relative; opacity: .72; }
  .cn-empty-mark::before, .cn-empty-mark::after { content: ''; position: absolute; top: 5px; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); background: var(--bg); }
  .cn-empty-mark::before { left: 0; } .cn-empty-mark::after { right: 0; }
  .cn-empty-mark span { position: absolute; left: 15px; top: 13px; width: 17px; height: 2px; background: var(--border); }
  .cn-empty-t { margin: 0 0 5px; color: var(--text); font-size: 15px; font-weight: 680; }
  .cn-empty-b { max-width: 47ch; margin: 0 auto; font-size: 13.5px; line-height: 1.55; }
  .cn-loading { padding: 42px 0; color: var(--muted); font-size: 13px; text-align: center; }
  @keyframes cn-pulse { from { transform: scale(.7); opacity: .75; } to { transform: scale(1.8); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .cn-pill.on .cn-pill-dot::after, .cn-pill.busy .cn-pill-dot::after { animation: none; } .cn-btn, .cn-toggle-mark { transition: none; } }
  @media (max-width: 560px) {
    .cn-shell { width: calc(100% - 32px); }
    .cn-onboard { grid-template-columns: 1fr; align-items: stretch; }
    .cn-onboard > .cn-btn { width: 100%; }
    .cn-host { align-items: center; flex-wrap: nowrap; padding: 15px 2px; }
    .cn-host-body { padding-top: 0; }
    .cn-disconnect { flex-basis: 100%; margin-left: 0; }
    .cn-command, .cn-update { flex-basis: 100%; margin-left: 0; }
    .cn-command-row { align-items: stretch; flex-direction: column; }
    .cn-command-row .cn-btn { width: 100%; }
    .cn-command-actions { align-items: stretch; flex-direction: column-reverse; }
    .cn-command-actions .cn-btn { width: 100%; }
    .cn-disconnect-actions { align-items: stretch; flex-direction: column-reverse; }
    .cn-disconnect-actions .cn-btn { width: 100%; }
    .cn-menu { flex-basis: 100%; margin-left: 0; }
    .cn-rename { flex-wrap: wrap; }
    .cn-rename .cn-input { flex-basis: 100%; }
    .cn-rename-actions { width: 100%; }
    .cn-rename-actions .cn-btn { flex: 1; }
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

function DisconnectPanel({ host, busy, copiedKey, failedKey, onCopy, onPair, onRemove, onSelect }) {
  const command = host.disconnect_command || DISCONNECT_COMMAND
  const copyKey = `disconnect:${host.id}`
  const presentation = disconnectPresentation(host)
  const action = busy
    ? (host.online ? 'Disconnecting…' : 'Removing…')
    : presentation.actionLabel

  return <div className="cn-disconnect">
    <p className="cn-disconnect-title">{presentation.title}</p>
    <p className="cn-disconnect-copy">{presentation.description}</p>
    <div className="cn-disconnect-actions">
      {!host.paired ? <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onPair} disabled={busy}>
        Pair machine
      </button> : null}
      <button className="cn-btn cn-btn-danger cn-btn-sm" onClick={onRemove} disabled={busy}>
        {action}
      </button>
    </div>
    {host.paired ? <div className="cn-disconnect-alt">
      <p className="cn-disconnect-alt-title">{presentation.commandTitle}</p>
      <p className="cn-disconnect-alt-copy">{presentation.commandDescription}</p>
      <CopyCommand
        command={command}
        copyKey={copyKey}
        copiedKey={copiedKey}
        failedKey={failedKey}
        onCopy={onCopy}
        onSelect={onSelect}
      />
    </div> : null}
  </div>
}

function CommandPanel({ host, confirming, stopping, onConfirm, onKeep, onStop }) {
  const command = host.active_command || {}
  const capabilities = commandCapabilities(host)
  const stoppingNow = capabilities.stopping || stopping
  const canStop = capabilities.canStop
  const started = command.started_at ? `Started ${relTime(command.started_at)}` : 'Starting on the machine'
  const limit = command.timeout ? ` · ${command.timeout}s limit` : ''

  return <div className="cn-command">
    <div className="cn-command-row">
      <div className="cn-command-copy">
        <p className="cn-command-title">{stoppingNow ? 'Stopping command…' : 'Command in progress'}</p>
        <p className="cn-command-meta">
          {canStop ? `${started}${limit}` : 'This runner is still working, but it must be updated before Connect can stop commands remotely.'}
        </p>
      </div>
      {canStop && !confirming ? <button
        className="cn-btn cn-btn-danger cn-btn-sm"
        onClick={onConfirm}
        disabled={stoppingNow}
      >{stoppingNow ? 'Stopping…' : 'Stop command'}</button> : null}
    </div>
    {canStop && confirming ? <div className="cn-command-confirm">
      <p>Stop this command and every process it started on {host.name}?</p>
      <div className="cn-command-actions">
        <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onKeep} disabled={stopping}>
          Keep running
        </button>
        <button className="cn-btn cn-btn-danger cn-btn-sm" onClick={onStop} disabled={stopping}>
          {stopping ? 'Stopping…' : 'Stop now'}
        </button>
      </div>
    </div> : null}
  </div>
}

function UpdatePanel({ host, copiedKey, failedKey, onCopy, onSelect }) {
  if (!host.update_command) return null
  const copyKey = `update:${host.id}`
  return <div className="cn-update">
    <p className="cn-update-title">Update the Connect runner</p>
    <p className="cn-update-copy">
      Run this on {host.name}. It keeps the existing pairing and switches to the more compatible reconnecting HTTPS runner.
    </p>
    <CopyCommand
      command={host.update_command}
      copyKey={copyKey}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onSelect={onSelect}
    />
  </div>
}

function MachineRow({
  host, confirming, deleting, renaming, renameValue, saving,
  copiedKey, failedKey, onCopy, onConfirm, onPair, onRemove, onSelect,
  onRenameStart, onRenameChange, onRenameSave, onRenameCancel,
  stopConfirming, stopping, onStopConfirm, onStopKeep, onStop,
}) {
  const status = statusOf(host)
  const meta = [
    host.platform,
    !host.online && host.paired && host.last_seen ? `Last seen ${relTime(host.last_seen)}` : null,
  ].filter(Boolean).join(' · ')
  const expanded = confirming || renaming
  const wrapped = expanded || host.busy || host.runner_update_available

  return <article className={`cn-host${wrapped ? ' is-confirming' : ''}`}>
    <button
      className="cn-host-toggle"
      onClick={onConfirm}
      disabled={host.busy}
      aria-expanded={confirming}
      aria-label={`${confirming ? 'Hide' : 'Show'} details for ${host.name}`}
    />
    <div className={`cn-host-symbol${host.online ? ' on' : ''}`} aria-hidden="true">
      <Desktop size={20}/>
    </div>
    <div className="cn-host-body">
      {renaming ? <div className="cn-rename">
        <input
          className="cn-input"
          value={renameValue}
          maxLength={80}
          autoFocus
          aria-label={`Rename ${host.name}`}
          onChange={event => onRenameChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') onRenameSave()
            else if (event.key === 'Escape') onRenameCancel()
          }}
        />
        <div className="cn-rename-actions">
          <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onRenameCancel} disabled={saving}>
            Cancel
          </button>
          <button className="cn-btn cn-btn-sm" onClick={onRenameSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div> : <>
        <div className="cn-host-top">
          <button className="cn-host-namebtn" onClick={onRenameStart} title="Rename machine">
            {host.name}
          </button>
          <span className={`cn-pill ${status.cls}`} role="status">
            <span className="cn-pill-dot" aria-hidden="true"/>{status.label}
          </span>
        </div>
        {meta ? <div className="cn-host-meta">{meta}</div> : null}
      </>}
    </div>
    {!host.busy ? <span className={`cn-toggle-mark${confirming ? ' is-open' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
    </span> : null}
    {confirming ? <DisconnectPanel
      host={host}
      busy={deleting}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onPair={onPair}
      onRemove={onRemove}
      onSelect={onSelect}
    /> : null}
    {host.busy ? <CommandPanel
      host={host}
      confirming={stopConfirming}
      stopping={stopping}
      onConfirm={onStopConfirm}
      onKeep={onStopKeep}
      onStop={onStop}
    /> : null}
    {host.runner_update_available && !host.busy && !expanded ? <UpdatePanel
      host={host}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
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
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [stopConfirmingId, setStopConfirmingId] = useState(null)
  const [stoppingId, setStoppingId] = useState(null)
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

  const hasBusyHost = hosts.some(host => host.busy)

  useEffect(() => {
    load()
    const timer = setInterval(load, pairing || hasBusyHost ? 1500 : 5000)
    return () => {
      clearInterval(timer)
      loadSequence.current += 1
    }
  }, [load, pairing, hasBusyHost])

  useEffect(() => {
    if (pairing && hosts.some(host => host.id === pairing.id && host.online)) {
      setPairing(null)
    }
  }, [hosts, pairing])

  useEffect(() => {
    if (stopConfirmingId && !hosts.some(host => (
      host.id === stopConfirmingId && host.busy
    ))) setStopConfirmingId(null)
  }, [hosts, stopConfirmingId])

  useEffect(() => {
    if (confirmingId && hosts.some(host => (
      host.id === confirmingId && host.busy
    ))) setConfirmingId(null)
  }, [hosts, confirmingId])

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

  const startRename = useCallback((host) => {
    setRenameValue(host.name)
    setRenamingId(host.id)
  }, [])

  const saveRename = useCallback(async (host) => {
    const name = renameValue.trim()
    if (!name || name === host.name) {
      setRenamingId(null)
      return
    }
    if (savingId) return
    setSavingId(host.id)
    setError(null)
    try {
      const response = await fetch(`/api/connect/hosts/${host.id}`, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t rename this machine.'))
      }
      const updated = await response.json()
      setHosts(current => current.map(item => (
        item.id === host.id ? { ...item, name: updated.name || name } : item
      )))
      setRenamingId(null)
    } catch (cause) {
      setError(cause.message || 'Couldn’t rename this machine.')
    } finally {
      setSavingId(null)
    }
  }, [renameValue, savingId, headers])

  const stopCommand = useCallback(async (host) => {
    const path = cancelCommandPath(host)
    if (!path || stoppingId) return
    setStoppingId(host.id)
    setError(null)
    try {
      const response = await fetch(path, { method: 'POST', headers: headers() })
      if (!response.ok && response.status !== 404) {
        throw new Error(await responseError(response, 'Couldn’t stop this command.'))
      }
      setStopConfirmingId(null)
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t stop this command.')
    } finally {
      setStoppingId(null)
    }
  }, [headers, load, stoppingId])

  const selectCommand = useCallback((event) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(event.currentTarget)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  return <div className="cn-root">
    <style>{CSS}</style>
    <header className="cn-head">
      <div className="cn-head-inner">
        <BrandMark appId={appId}/>
        <div className="cn-head-copy">
          <h1 className="cn-title">Connect</h1>
          <p className="cn-sub">Bring a laptop, workstation, or cluster within reach of Möbius — securely, from any device.</p>
        </div>
      </div>
    </header>
    <main className="cn-shell">
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
              renaming={renamingId === host.id}
              renameValue={renameValue}
              saving={savingId === host.id}
              stopConfirming={stopConfirmingId === host.id}
              stopping={stoppingId === host.id}
              copiedKey={copiedKey}
              failedKey={failedKey}
              onCopy={copy}
              onConfirm={() => {
                setStopConfirmingId(null)
                setRenamingId(null)
                setConfirmingId(current => current === host.id ? null : host.id)
              }}
              onPair={() => showCommand(host.id)}
              onRemove={() => removeMachine(host)}
              onSelect={selectCommand}
              onRenameStart={() => {
                setStopConfirmingId(null)
                setConfirmingId(null)
                startRename(host)
              }}
              onRenameChange={setRenameValue}
              onRenameSave={() => saveRename(host)}
              onRenameCancel={() => setRenamingId(null)}
              onStopConfirm={() => {
                setConfirmingId(null)
                setRenamingId(null)
                setStopConfirmingId(host.id)
              }}
              onStopKeep={() => setStopConfirmingId(null)}
              onStop={() => stopCommand(host)}
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
