import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Copy, Desktop, Pencil, Plus } from '@openai/apps-sdk-ui/components/Icon'
import {
  activeCommands,
  appendTail,
  cancelCommandPath,
  commandCapabilities,
  disconnectPresentation,
  outputPath,
  statusOf,
} from './connect-state.mjs'
import { loadConnectionList, responseError } from './connect-api.mjs'

const DISCONNECT_COMMAND = 'python3 ~/.mobius-connect/runner.py --uninstall'
const DEFAULT_MACHINE_NAME = 'My machine'

const CSS = `
  * { box-sizing: border-box; }
  ::selection { background: color-mix(in srgb, #7c67f8 38%, transparent); color: var(--text); }
  * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--muted) 45%, transparent) transparent; }
  .cn-root {
    --cn-violet: #7c67f8; --cn-mint: #43c6aa;
    min-height: 100%; color: var(--text); background: var(--bg); font-family: var(--font);
  }
  .cn-head { width: 100%; background: var(--bg); }
  .cn-head-inner { position: relative; width: min(760px, 100%); margin: 0 auto; display: flex; align-items: center; gap: 10px; padding: max(16px, env(safe-area-inset-top)) 16px 15px; }
  .cn-head-inner::after { content: ''; position: absolute; left: 16px; right: 16px; bottom: 0; height: 1px; background: var(--border); }
  .cn-mark { flex: none; width: 30px; height: 30px; border-radius: 8px; display: block; object-fit: contain; }
  .cn-head-copy { min-width: 0; }
  .cn-title { margin: 0; font-size: 19px; font-weight: 720; letter-spacing: -.018em; line-height: 1; }
  .cn-sub { margin: 4px 0 0; color: var(--muted); font-size: 11.5px; line-height: 1.2; }
  .cn-shell { width: min(728px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 64px; }

  .cn-section { padding-top: 32px; margin-top: 34px; border-top: 1px solid var(--border); }
  .cn-section-first { padding-top: 0; margin-top: 0; border-top: 0; }
  .cn-section-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 0 0 14px; }
  .cn-section-heading { display: flex; align-items: center; min-width: 0; gap: 9px; }
  .cn-secttitle { margin: 0; color: var(--text); font-size: 15px; font-weight: 710; letter-spacing: -.01em; }
  .cn-count { min-width: 22px; height: 22px; display: inline-grid; place-items: center; padding: 0 7px; border-radius: 999px; color: var(--muted); background: var(--surface-2); font-size: 11px; font-weight: 680; font-variant-numeric: tabular-nums; }
  .cn-list { position: relative; overflow: visible; border: 1px solid var(--border); border-radius: 15px; background: var(--surface); }
  .cn-empty-row { min-height: 76px; display: flex; align-items: center; justify-content: center; border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent); border-radius: 15px; color: var(--muted); font-size: 13px; }

  .cn-field { min-width: 0; }
  .cn-label { display: block; margin: 0 0 7px 1px; color: var(--muted); font-size: 11.5px; font-weight: 650; }
  .cn-input { width: 100%; height: 46px; padding: 0 13px; border: 1px solid var(--border); border-radius: 11px; color: var(--text); background: var(--bg); caret-color: var(--cn-violet); font: 14px var(--font); }
  .cn-input::placeholder { color: color-mix(in srgb, var(--muted) 78%, transparent); }
  .cn-input:focus { outline: 2px solid color-mix(in srgb, var(--cn-violet) 58%, transparent); outline-offset: 1px; border-color: var(--cn-violet); }
  .cn-btn { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 15px; border: 1px solid transparent; border-radius: 11px; background: var(--cn-violet); color: #fff; font: 650 13px var(--font); cursor: pointer; white-space: nowrap; transition: background 160ms ease-out, transform 160ms ease-out; }
  .cn-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cn-violet) 88%, white); }
  .cn-btn:active:not(:disabled) { transform: scale(.98); }
  .cn-btn:disabled { opacity: .48; cursor: default; }
  .cn-btn:focus-visible, .cn-host-edit:focus-visible, .cn-host-toggle:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
  .cn-btn-ghost { color: var(--text); background: transparent; border-color: var(--border); }
  .cn-btn-ghost:hover:not(:disabled) { background: var(--surface-2); }
  .cn-btn-danger { color: #fff; background: #c9363e; }
  .cn-btn-danger:hover:not(:disabled) { background: #d6464e; }
  .cn-btn-sm { min-height: 40px; padding: 0 13px; font-size: 12.5px; }

  .cn-inline-form { margin: 0 0 14px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
  .cn-machine-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
  .cn-machine-form > .cn-btn { min-height: 46px; }
  .cn-share-grid { display: grid; grid-template-columns: 1fr; gap: 13px; }
  .cn-command-input { min-height: 76px; resize: vertical; padding-top: 11px; padding-bottom: 9px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cn-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 13px; }
  .cn-share-warning { margin: 0; color: var(--muted); font-size: 11.5px; line-height: 1.4; }
  .cn-agent-choice { display: flex; align-items: flex-start; gap: 9px; margin-top: 13px; font-size: 13px; line-height: 1.4; cursor: pointer; }
  .cn-agent-choice input, .cn-agent-toggle input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--cn-violet); flex: none; }
  .cn-agent-choice small { display: block; color: var(--muted); font-size: 11.5px; }
  .cn-agent-toggle { min-height: 40px; display: inline-flex; align-items: center; gap: 8px; flex: none; padding: 0 13px; border: 1px solid var(--border); border-radius: 11px; color: var(--muted); font: 650 12.5px var(--font); white-space: nowrap; cursor: pointer; transition: background 160ms ease-out, color 160ms ease-out; }
  .cn-agent-toggle:hover { background: var(--surface-2); }
  .cn-agent-toggle.is-on { color: var(--text); border-color: color-mix(in srgb, var(--cn-violet) 45%, var(--border)); background: color-mix(in srgb, var(--cn-violet) 10%, transparent); }
  .cn-agent-toggle:focus-within { outline: 2px solid var(--text); outline-offset: 2px; }
  .cn-agent-toggle input { margin: 0; }
  .cn-agent-toggle input:focus-visible { outline: none; }
  .cn-outbound-actions { grid-column: 3; grid-row: 1; display: flex; align-items: center; gap: 8px; }

  .cn-message { margin: 0 0 16px; padding: 12px 14px; border-radius: 12px; font-size: 13px; line-height: 1.45; }
  .cn-error { color: #ffb7ba; background: color-mix(in srgb, #e5484d 12%, var(--surface)); border: 1px solid color-mix(in srgb, #e5484d 34%, var(--border)); }
  .cn-notice { background: var(--surface); border: 1px solid var(--border); }
  .cn-notice strong { display: block; margin-bottom: 2px; }
  .cn-loading { padding: 50px 0; color: var(--muted); font-size: 13px; text-align: center; }

  .cn-host, .cn-outbound { position: relative; min-height: 72px; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; column-gap: 13px; row-gap: 8px; padding: 13px 15px; border-bottom: 1px solid var(--border); }
  .cn-host:last-child, .cn-outbound:last-child { border-bottom: 0; }
  .cn-host:first-child > .cn-host-toggle { border-top-left-radius: 14px; border-top-right-radius: 14px; }
  .cn-host:last-child > .cn-host-toggle { border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; }
  .cn-host-toggle { position: absolute; z-index: 0; inset: 0 0 auto; width: 100%; height: 71px; border: 0; border-radius: 14px; background: transparent; cursor: pointer; }
  .cn-host-toggle:hover:not(:disabled) { background: color-mix(in srgb, var(--surface-2) 48%, transparent); }
  .cn-host-toggle:disabled { cursor: default; }
  .cn-host-symbol { position: relative; z-index: 1; pointer-events: none; grid-column: 1; grid-row: 1; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; color: var(--muted); background: var(--surface-2); }
  .cn-host-symbol.on { color: #36b999; background: color-mix(in srgb, var(--cn-mint) 13%, var(--surface-2)); }
  .cn-host-body, .cn-outbound-copy { position: relative; z-index: 1; grid-column: 2; grid-row: 1; min-width: 0; }
  .cn-host-body { pointer-events: none; }
  .cn-host-body button, .cn-host-body input { pointer-events: auto; }
  .cn-host-top { display: flex; align-items: center; min-width: 0; gap: 8px; }
  .cn-host-name { max-width: min(100%, 44ch); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 14px; font-weight: 650; }
  .cn-host-edit { pointer-events: auto; flex: none; width: 44px; height: 44px; display: inline-grid; place-items: center; margin: -12px -8px; padding: 0; border: 0; border-radius: 9px; color: var(--muted); background: transparent; cursor: pointer; }
  .cn-host-edit:hover:not(:disabled) { color: var(--text); background: var(--surface-2); }
  .cn-host-edit:disabled { opacity: .48; cursor: default; }
  .cn-outbound-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 14px; font-weight: 650; }
  .cn-host-meta, .cn-outbound-meta { display: block; margin-top: 4px; color: var(--muted); font-size: 11.5px; }
  .cn-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 999px; color: var(--muted); background: var(--surface-2); font-size: 10.5px; font-weight: 680; }
  .cn-pill-dot { position: relative; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .cn-pill.on { color: #36b999; background: color-mix(in srgb, var(--cn-mint) 12%, var(--surface-2)); }
  .cn-pill.wait { color: #d7a848; background: color-mix(in srgb, #d7a848 11%, var(--surface-2)); }
  .cn-pill.busy { color: #a99afc; background: color-mix(in srgb, var(--cn-violet) 14%, var(--surface-2)); }
  .cn-pill.on .cn-pill-dot::after, .cn-pill.busy .cn-pill-dot::after { content: ''; position: absolute; inset: -3px; border: 1px solid currentColor; border-radius: 50%; animation: cn-pulse 1.8s ease-out infinite; }
  .cn-toggle-mark { position: relative; z-index: 1; pointer-events: none; flex: none; width: 28px; height: 28px; display: grid; place-items: center; color: var(--muted); transition: transform 160ms ease-out; }
  .cn-toggle-mark.is-open { transform: rotate(180deg); }
  .cn-toggle-mark svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .cn-disconnect, .cn-command, .cn-update { grid-column: 2 / -1; min-width: 0; margin: 2px 0 0; padding: 13px 14px; border-radius: 12px; background: var(--surface-2); }
  .cn-disconnect-title, .cn-command-title, .cn-update-title { margin: 0 0 4px; font-size: 13px; font-weight: 680; }
  .cn-disconnect-copy, .cn-command-meta, .cn-update-copy { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .cn-disconnect-actions { display: flex; align-items: center; justify-content: flex-start; gap: 8px; }
  .cn-disconnect-alt, .cn-update-manual { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .cn-inline-confirm { width: 100%; display: flex; align-items: center; gap: 8px; }
  .cn-inline-action { min-height: 40px; }
  .cn-action-anchor { position: relative; z-index: 3; display: inline-flex; align-items: center; }
  .cn-action-popover { position: absolute; z-index: 30; top: calc(100% + 8px); left: 0; width: min(320px, calc(100vw - 32px)); padding: 14px; border: 1px solid var(--border); border-radius: 12px; color: var(--text); background: var(--surface); box-shadow: 0 12px 28px rgb(0 0 0 / 28%); }
  .cn-action-anchor.align-end .cn-action-popover { left: auto; right: 0; }
  .cn-action-popover h3 { margin: 0 0 5px; font-size: 13px; font-weight: 700; }
  .cn-action-popover p { margin: 0 0 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .cn-action-popover-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .cn-update-result { margin: 10px 0 0; }
  .cn-update-result.is-success { color: #36b999; }
  .cn-update-result.is-waiting { color: #d7a848; }
  .cn-update-result.is-error { color: #ffb7ba; }
  .cn-disconnect-alt-title, .cn-update-manual-title { margin: 0 0 9px; font-size: 12px; font-weight: 680; }
  .cn-disconnect-alt-copy { margin: 0 0 9px; color: var(--muted); font-size: 11.5px; line-height: 1.45; }
  .cn-command-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .cn-command-copy { min-width: 0; }
  .cn-command + .cn-command { margin-top: -7px; }
  .cn-command-label { display: block; margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cn-tail { max-height: 196px; overflow: auto; margin: 11px 0 0; padding: 9px 11px; border: 1px solid var(--border); border-radius: 9px; color: color-mix(in srgb, var(--text) 86%, var(--muted)); background: var(--bg); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }

  .cn-pairing { margin: 0 0 14px; padding: 15px; border-radius: 14px; background: var(--surface); border: 1px solid color-mix(in srgb, var(--cn-violet) 34%, var(--border)); }
  .cn-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .cn-card-title { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 680; }
  .cn-card-title span { color: #a99afc; }
  .cn-step { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 9px; margin-top: 12px; }
  .cn-step-n { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; color: #a99afc; background: color-mix(in srgb, var(--cn-violet) 13%, var(--surface-2)); font-size: 11px; font-weight: 720; }
  .cn-step-t { margin: 2px 0 7px; font-size: 12.5px; line-height: 1.45; }
  .cn-code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: stretch; }
  .cn-code { min-width: 0; max-height: 100px; overflow: auto; padding: 10px 11px; border-radius: 9px; background: var(--bg); border: 1px solid var(--border); color: var(--text); font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; cursor: text; user-select: all; -webkit-user-select: all; }
  .cn-hint { margin-top: 6px; color: var(--muted); font-size: 11.5px; line-height: 1.4; }
  .cn-copybtn { min-width: 120px; }
  .cn-copybtn.is-copied { color: #36b999; border-color: color-mix(in srgb, var(--cn-mint) 35%, var(--border)); background: color-mix(in srgb, var(--cn-mint) 9%, var(--surface)); }

  .cn-rename { pointer-events: auto; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; }
  .cn-rename .cn-input { height: 40px; flex: 1; min-width: 0; }
  .cn-rename-actions { display: flex; gap: 8px; flex: none; }
  .cn-rename-error { flex-basis: 100%; margin: 0; color: #ffb7ba; font-size: 11.5px; line-height: 1.35; }

  @keyframes cn-pulse { from { transform: scale(.7); opacity: .72; } to { transform: scale(1.9); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .cn-pill-dot::after { animation: none !important; } .cn-btn, .cn-toggle-mark, .cn-agent-toggle { transition: none; } }
  @media (max-width: 560px) {
    .cn-head-inner { padding-left: 14px; padding-right: 14px; }
    .cn-head-inner::after { left: 14px; right: 14px; }
    .cn-shell { width: calc(100% - 24px); padding-top: 22px; }
    .cn-section { padding-top: 26px; margin-top: 28px; }
    .cn-section-first { padding-top: 0; margin-top: 0; }
    .cn-section-head { align-items: center; }
    .cn-secttitle { font-size: 14px; }
    .cn-machine-form { grid-template-columns: 1fr; }
    .cn-machine-form > .cn-btn { width: 100%; }
    .cn-form-footer { align-items: stretch; flex-direction: column; gap: 10px; }
    .cn-form-footer .cn-btn { width: 100%; }
    .cn-host, .cn-outbound { grid-template-columns: 38px minmax(0, 1fr); column-gap: 10px; padding-left: 12px; padding-right: 12px; }
    .cn-host .cn-toggle-mark { position: absolute; top: 21px; right: 12px; }
    .cn-host .cn-host-body { grid-column: 2; padding-right: 30px; }
    .cn-disconnect, .cn-command, .cn-update { grid-column: 1 / -1; }
    .cn-command-row { align-items: stretch; flex-direction: column; }
    .cn-command-row .cn-action-anchor, .cn-command-row .cn-btn { width: 100%; }
    .cn-disconnect-actions { align-items: stretch; flex-direction: column-reverse; }
    .cn-disconnect-actions > .cn-action-anchor, .cn-disconnect-actions > .cn-btn,
    .cn-disconnect-actions .cn-action-anchor > .cn-btn { width: 100%; }
    .cn-action-popover-actions { align-items: stretch; flex-direction: column-reverse; }
    .cn-action-popover-actions .cn-btn { width: 100%; }
    .cn-outbound-actions { grid-column: 2; grid-row: 2; }
    .cn-outbound .cn-action-anchor { flex: 1; }
    .cn-outbound .cn-action-anchor > .cn-btn { width: 100%; }
    .cn-action-popover { max-width: calc(100vw - 40px); }
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

function ActionConfirm({
  id, open, title, description, triggerLabel, confirmLabel, confirmingLabel,
  onOpen, onCancel, onConfirm, disabled = false, confirming = false,
  triggerClass = 'cn-btn cn-btn-ghost cn-btn-sm', tone = 'danger', align = 'start',
}) {
  return <div className={`cn-action-anchor${align === 'end' ? ' align-end' : ''}`}>
    <button
      className={triggerClass}
      onClick={open ? onCancel : onOpen}
      disabled={disabled || confirming}
      aria-expanded={open}
      aria-controls={open ? id : undefined}
    >{triggerLabel}</button>
    {open ? <section
      className="cn-action-popover"
      id={id}
      role="group"
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onKeyDown={event => { if (event.key === 'Escape') onCancel() }}
    >
      <h3 id={`${id}-title`}>{title}</h3>
      {description ? <p id={`${id}-description`}>{description}</p> : null}
      <div className="cn-action-popover-actions">
        <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onCancel} disabled={confirming} autoFocus>
          {confirming ? 'Working…' : 'Not now'}
        </button>
        <button
          className={`cn-btn cn-btn-sm${tone === 'danger' ? ' cn-btn-danger' : ''}`}
          onClick={onConfirm}
          disabled={disabled || confirming}
        >{confirming ? confirmingLabel : confirmLabel}</button>
      </div>
    </section> : null}
  </div>
}

function InlineActionConfirm({
  open, triggerLabel, confirmLabel, confirmingLabel, onOpen, onCancel,
  onConfirm, disabled = false, confirming = false,
  triggerClass = 'cn-btn cn-btn-sm', tone = 'danger',
}) {
  return <div className="cn-inline-confirm">
    <button
      className={`${triggerClass} cn-inline-action${tone === 'danger' ? ' cn-btn-danger' : ''}`}
      onClick={open ? onConfirm : onOpen}
      disabled={disabled || confirming}
      aria-expanded={open}
    >{confirming ? confirmingLabel : open ? confirmLabel : triggerLabel}</button>
    {open ? <button
      className="cn-btn cn-btn-ghost cn-btn-sm cn-inline-not-now"
      onClick={onCancel}
      disabled={confirming}
    >Not now</button> : null}
  </div>
}

function DisconnectPanel({
  host, busy, confirmingRemove, copiedKey, failedKey, onCopy, onPair,
  onRemoveOpen, onRemoveCancel, onRemove, onSelect,
}) {
  const command = host.disconnect_command || DISCONNECT_COMMAND
  const copyKey = `disconnect:${host.id}`
  const presentation = disconnectPresentation(host)
  const action = busy
    ? (host.online ? 'Disconnecting…' : 'Removing…')
    : presentation.actionLabel

  return <div className="cn-disconnect">
    {!host.online ? <>
      <p className="cn-disconnect-title">{presentation.title}</p>
      <p className="cn-disconnect-copy">{presentation.description}</p>
    </> : null}
    <div className="cn-disconnect-actions">
      {!host.paired ? <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onPair} disabled={busy}>
        Pair machine
      </button> : null}
      <InlineActionConfirm
        open={confirmingRemove}
        triggerLabel={action}
        triggerClass="cn-btn cn-btn-sm"
        confirmLabel={host.online ? 'Confirm disconnect' : (host.paired ? 'Confirm remove' : 'Confirm remove')}
        confirmingLabel={host.online ? 'Disconnecting…' : 'Removing…'}
        onOpen={onRemoveOpen}
        onCancel={onRemoveCancel}
        onConfirm={onRemove}
        disabled={busy}
        confirming={busy}
        tone="danger"
      />
    </div>
    {host.paired ? <div className="cn-disconnect-alt">
      <p className="cn-disconnect-alt-title">{host.online ? 'Disconnect manually' : presentation.commandTitle}</p>
      {!host.online ? <p className="cn-disconnect-alt-copy">{presentation.commandDescription}</p> : null}
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

function OutboundAccess({
  connections, open, label, command, agent, agentSupported, granting, confirmingId, revokingId, agentBusyId,
  onOpen, onCancel, onLabel, onCommand, onAgent, onGrant, onConfirm, onKeep, onRevoke, onToggleAgent,
}) {
  return <section className="cn-section" aria-labelledby="cn-access-title">
    <div className="cn-section-head">
      <div className="cn-section-heading">
        <h2 className="cn-secttitle" id="cn-access-title">Can control this Möbius</h2>
        <span className="cn-count">{connections.length}</span>
      </div>
      <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={open ? onCancel : onOpen}>
        {open ? 'Cancel' : <><Plus size={16}/>Grant access</>}
      </button>
    </div>

    {open ? <div className="cn-inline-form cn-access-form">
      <div className="cn-share-grid">
        <label className="cn-field">
          <span className="cn-label">Name</span>
          <input
            className="cn-input"
            value={label}
            maxLength={80}
            autoFocus
            placeholder="Alex’s Möbius"
            onChange={event => onLabel(event.target.value)}
          />
        </label>
        <label className="cn-field">
          <span className="cn-label">Connect command</span>
          <textarea
            className="cn-input cn-command-input"
            value={command}
            rows={1}
            spellCheck={false}
            placeholder="Paste their curl … | sh command"
            onChange={event => onCommand(event.target.value)}
          />
        </label>
      </div>
      {agentSupported ? <label className="cn-agent-choice">
        <input type="checkbox" checked={agent} onChange={event => onAgent(event.target.checked)}/>
        <span>Full access
          <small>It can also use this Möbius the way your chats’ agent does, but can’t answer your approvals.</small>
        </span>
      </label> : null}
      <div className="cn-form-footer">
        <p className="cn-share-warning">Full command access until you revoke it.</p>
        <button className="cn-btn" onClick={onGrant} disabled={granting || !label.trim() || !command.trim()}>
          {granting ? 'Connecting…' : 'Grant access'}
        </button>
      </div>
    </div> : null}

    {connections.length ? <div className="cn-list" aria-label="Machines that can control this Möbius">
      {connections.map(connection => {
        const confirming = confirmingId === connection.id
        const status = connection.online ? 'Active' : (connection.status === 'ended' ? 'Ended' : 'Needs attention')
        const statusClass = connection.online ? 'on' : (connection.status === 'ended' ? '' : 'wait')
        return <article className={`cn-outbound${confirming ? ' is-confirming' : ''}`} key={connection.id}>
          <div className={`cn-host-symbol${connection.online ? ' on' : ''}`} aria-hidden="true">
            <Desktop size={20}/>
          </div>
          <div className="cn-outbound-copy">
            <div className="cn-host-top">
              <span className="cn-outbound-name">{connection.label}</span>
              <span className={`cn-pill ${statusClass}`}><span className="cn-pill-dot" aria-hidden="true"/>{status}</span>
            </div>
            <span className="cn-outbound-meta">{connection.target}</span>
          </div>
          <div className="cn-outbound-actions">
            {agentSupported && connection.status === 'active' ? <label
              className={`cn-agent-toggle${connection.agent ? ' is-on' : ''}`}
              title="Also lets it use this Möbius the way your chats’ agent does. It can’t answer your approvals."
            >
              <input
                type="checkbox"
                checked={connection.agent}
                disabled={agentBusyId === connection.id}
                onChange={event => onToggleAgent(connection, event.target.checked)}
              />Full access
            </label> : null}
            <ActionConfirm
              id={`cn-revoke-${connection.id}`}
              open={confirming}
              title={`Revoke access for ${connection.label}?`}
              description="This machine will no longer be able to run commands through this Möbius."
              triggerLabel={connection.online ? 'Revoke' : 'Remove'}
              confirmLabel={connection.online ? 'Revoke access' : 'Remove access'}
              confirmingLabel={connection.online ? 'Revoking…' : 'Removing…'}
              onOpen={() => onConfirm(connection.id)}
              onCancel={onKeep}
              onConfirm={() => onRevoke(connection)}
              disabled={revokingId === connection.id}
              confirming={revokingId === connection.id}
              align="end"
            />
          </div>
        </article>
      })}
    </div> : <div className="cn-empty-row">No machines have access.</div>}
  </section>
}

function CommandPanel({ host, command, tail, confirming, stopping, onConfirm, onKeep, onStop }) {
  const capabilities = commandCapabilities(command)
  const stoppingNow = capabilities.stopping || stopping
  const canStop = capabilities.canStop
  const started = command.started_at ? `Started ${relTime(command.started_at)}` : 'Starting on the machine'
  const limit = command.timeout ? ` · ${formatLimit(command.timeout)} limit` : ''

  return <div className="cn-command">
    <div className="cn-command-row">
      <div className="cn-command-copy">
        <p className="cn-command-title">{stoppingNow ? 'Stopping command…' : 'Command in progress'}</p>
        {command.label ? <code className="cn-command-label" title={command.label}>{command.label}</code> : null}
        <p className="cn-command-meta">
          {canStop ? `${started}${limit}` : 'Connect is waiting for the command details before it can offer a stop action.'}
        </p>
      </div>
      {canStop ? <ActionConfirm
        id={`cn-stop-${host.id}-${command.id}`}
        open={confirming}
        title="Stop this command?"
        description={`This also stops every process it started on ${host.name}.`}
        triggerLabel={stoppingNow ? 'Stopping…' : 'Stop command'}
        confirmLabel="Stop now"
        confirmingLabel="Stopping…"
        onOpen={onConfirm}
        onCancel={onKeep}
        onConfirm={onStop}
        disabled={stoppingNow}
        confirming={stoppingNow}
        triggerClass="cn-btn cn-btn-danger cn-btn-sm"
        align="end"
      /> : null}
    </div>
    {tail ? <pre className="cn-tail" aria-label="Latest output">{tail}</pre> : null}
  </div>
}

function formatLimit(seconds) {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds >= 600 && seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

function UpdatePanel({
  host, copiedKey, failedKey, onCopy, onSelect,
  confirming, updating, result, onUpdate, onConfirm, onCancel,
}) {
  if (host.runner_managed === 'mobius') {
    return <div className="cn-update">
      <p className="cn-update-result" role="status">
        {host.name} is another Möbius. It installs the current runner the next time it restarts.
      </p>
    </div>
  }
  if (!host.update_command && !result) return null
  const copyKey = `update:${host.id}`
  const currentResult = result?.hostId === host.id ? result : null
  const updated = !host.runner_update_available
  const resultOutput = `${currentResult?.stdout || ''}\n${currentResult?.stderr || ''}`
  const runnerRestarted = currentResult?.exitCode === 125
    && /runner restarted before the command result was reported/i.test(resultOutput)
  const fallback = currentResult && /NOT a reboot|background/i.test(
    resultOutput,
  )
  const failure = currentResult?.errorKind === 'expired'
    ? 'The machine didn’t start the update before it expired. Nothing ran; try again.'
    : currentResult?.exitCode === 125 && !runnerRestarted
    ? 'Another command is using this machine, so the update is waiting. This can be work from another Möbius instance. When it finishes, try again; nothing was changed.'
    : currentResult?.errorKind === 'request'
      ? currentResult.errorMessage
      : `Update command failed (exit ${currentResult?.exitCode}). Review the command result and try again.`
  return <div className="cn-update">
    {!updated && !host.busy && !updating ? <InlineActionConfirm
      open={confirming}
      triggerLabel={currentResult?.exitCode === 125 ? 'Try update again' : 'Update runner'}
      confirmLabel="Confirm update"
      confirmingLabel="Updating…"
      onOpen={onUpdate}
      onCancel={onCancel}
      onConfirm={onConfirm}
      disabled={updating}
      confirming={updating}
      triggerClass="cn-btn cn-btn-sm"
      tone="primary"
    /> : null}
    {host.update_command ? <div className="cn-update-manual">
      <p className="cn-update-manual-title">Update manually</p>
      <CopyCommand
        command={host.update_command}
        copyKey={copyKey}
        copiedKey={copiedKey}
        failedKey={failedKey}
        onCopy={onCopy}
        onSelect={onSelect}
      />
    </div> : null}
    {updating ? <p className="cn-update-result" role="status">Updating on {host.name}…</p> : null}
    {currentResult && !updating ? <p
      className={`cn-update-result${(currentResult.exitCode === 0 || runnerRestarted) && updated ? ' is-success' : currentResult.exitCode === 125 || currentResult.errorKind === 'expired' ? ' is-waiting' : ' is-error'}`}
      role="status"
    >{currentResult.errorKind || (currentResult.exitCode !== 0 && !runnerRestarted)
      ? failure
      : runnerRestarted && updated
        ? 'Runner updated and reconnected.'
        : runnerRestarted
          ? 'The runner restarted, but Connect still reports an update is available. Check that it is online before trying again.'
      : fallback
        ? 'The runner reconnected, but the installer used a temporary background process. It may not restart after a reboot.'
        : updated
          ? 'Runner updated and reconnected.'
          : 'Installer finished; Connect has not confirmed the updated runner yet.'}</p> : null}
  </div>
}

function MachineRow({
  host, confirming, deleting, removeConfirming, renaming, renameValue, renameError, saving,
  copiedKey, failedKey, onCopy, onConfirm, onPair, onRemove, onSelect,
  onRenameStart, onRenameChange, onRenameSave, onRenameCancel,
  tails, stopConfirmingId, stoppingId, onStopConfirm, onStopKeep, onStop,
  onRemoveConfirm, onRemoveCancel,
  updateConfirming, updating, updateResult, onUpdate, onUpdateConfirm, onUpdateCancel,
}) {
  const status = statusOf(host)
  const commands = activeCommands(host)
  const meta = [
    host.platform,
    !host.online && host.paired && host.last_seen ? `Last seen ${relTime(host.last_seen)}` : null,
  ].filter(Boolean).join(' · ')
  const expanded = confirming || renaming
  return <article className="cn-host">
    <button
      className="cn-host-toggle"
      onClick={onConfirm}
      disabled={host.busy || renaming}
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
          aria-invalid={Boolean(renameError)}
          aria-describedby={renameError ? `rename-error-${host.id}` : undefined}
          onChange={event => onRenameChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!saving) onRenameSave()
            } else if (event.key === 'Escape' && !saving) {
              onRenameCancel()
            }
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
        {renameError ? <p className="cn-rename-error" id={`rename-error-${host.id}`} role="alert">
          {renameError}
        </p> : null}
      </div> : <>
        <div className="cn-host-top">
          <span className="cn-host-name">{host.name}</span>
          <button
            type="button"
            className="cn-host-edit"
            onClick={onRenameStart}
            aria-label={`Rename ${host.name}`}
            title="Rename machine"
          >
            <Pencil size={15} aria-hidden="true"/>
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
      confirmingRemove={removeConfirming}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onPair={onPair}
      onRemoveOpen={onRemoveConfirm}
      onRemoveCancel={onRemoveCancel}
      onRemove={onRemove}
      onSelect={onSelect}
    /> : null}
    {commands.map(command => <CommandPanel
      key={command.id}
      host={host}
      command={command}
      tail={tails[command.id]?.tail}
      confirming={stopConfirmingId === command.id}
      stopping={stoppingId === command.id}
      onConfirm={() => onStopConfirm(command)}
      onKeep={onStopKeep}
      onStop={() => onStop(command)}
    />)}
    {host.runner_update_available && !host.busy && !expanded ? <UpdatePanel
      host={host}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onSelect={onSelect}
      confirming={updateConfirming}
      updating={updating}
      result={updateResult}
      onUpdate={onUpdate}
      onConfirm={onUpdateConfirm}
      onCancel={onUpdateCancel}
    /> : null}
    {updateResult?.hostId === host.id && !host.runner_update_available && !host.busy ? <UpdatePanel
      host={host}
      copiedKey={copiedKey}
      failedKey={failedKey}
      onCopy={onCopy}
      onSelect={onSelect}
      confirming={false}
      updating={updating}
      result={updateResult}
    /> : null}
  </article>
}

export default function App({ appId, token }) {
  const [hosts, setHosts] = useState([])
  const [outbound, setOutbound] = useState([])
  const [serviceActive, setServiceActive] = useState(null)
  const [outboundActive, setOutboundActive] = useState(null)
  const [loadNotices, setLoadNotices] = useState([])
  const [newName, setNewName] = useState(DEFAULT_MACHINE_NAME)
  const [addingMachine, setAddingMachine] = useState(false)
  const [pairing, setPairing] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [removeConfirmingId, setRemoveConfirmingId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [stopConfirmingId, setStopConfirmingId] = useState(null)
  const [stoppingId, setStoppingId] = useState(null)
  const [updateConfirmingId, setUpdateConfirmingId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [updateResult, setUpdateResult] = useState(null)
  // Latest output lines per running command: { [commandId]: { tail } }.
  const [tails, setTails] = useState({})
  const outputCursors = useRef({})
  const [accessLabel, setAccessLabel] = useState('')
  const [accessCommand, setAccessCommand] = useState('')
  const [sharingOpen, setSharingOpen] = useState(false)
  const [grantingAccess, setGrantingAccess] = useState(false)
  const [accessAgent, setAccessAgent] = useState(false)
  const [agentBusyId, setAgentBusyId] = useState(null)
  const [agentSupported, setAgentSupported] = useState(false)
  const [outboundConfirmId, setOutboundConfirmId] = useState(null)
  const [revokingOutboundId, setRevokingOutboundId] = useState(null)
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
    const [machines, shared] = await Promise.all([
      loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', headers()),
      loadConnectionList('/api/connect/outbound', 'connections', 'Shared access', headers()),
    ])
    if (sequence !== loadSequence.current) return
    setServiceActive(machines.ready)
    setOutboundActive(shared.ready)
    setHosts(machines.items)
    setOutbound(shared.items)
    setAgentSupported(shared.data?.agent_access === true)
    const notices = [machines.notice, shared.notice].filter(Boolean)
    setLoadNotices(notices)
    for (const notice of notices) {
      window.mobius.signal('error', { message: notice.title, source: 'load' })
    }
    if (!readySignalled.current) {
      readySignalled.current = true
      window.mobius.signal('app_ready', { item_count: machines.items.length + shared.items.length })
    }
  }, [headers])

  const hasBusyHost = hosts.some(host => host.busy)
  const runningKey = hosts
    .flatMap(host => activeCommands(host).map(command => `${host.id}/${command.id}`))
    .join(',')

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
      activeCommands(host).some(command => command.id === stopConfirmingId)
    ))) setStopConfirmingId(null)
  }, [hosts, stopConfirmingId])

  // Follow each running command's output while it runs. Only a Möbius that
  // reports a command list has the output route; older ones show no tail.
  useEffect(() => {
    const running = hosts
      .filter(host => Array.isArray(host.active_commands))
      .flatMap(host => host.active_commands.map(command => ({ host, command })))
    const live = new Set(running.map(({ command }) => command.id))
    setTails(current => Object.fromEntries(
      Object.entries(current).filter(([id]) => live.has(id)),
    ))
    const cursors = outputCursors.current
    for (const id of Object.keys(cursors)) if (!live.has(id)) delete cursors[id]
    if (!running.length) return undefined
    let stopped = false
    let inFlight = false
    const poll = async () => {
      // A slow round must finish before the next starts, or two polls would
      // read the same cursor and append the same lines twice.
      if (inFlight) return
      inFlight = true
      try {
        await pollOnce()
      } finally {
        inFlight = false
      }
    }
    const pollOnce = async () => {
      for (const { host, command } of running) {
        const path = outputPath(host, command, cursors[command.id] ?? 0)
        try {
          const response = await fetch(path, { headers: headers() })
          if (!response.ok || stopped) continue
          const view = await response.json()
          if (stopped || !Array.isArray(view?.chunks)) continue
          cursors[command.id] = view.next
          if (view.chunks.length) {
            setTails(current => ({
              ...current,
              [command.id]: { tail: appendTail(current[command.id]?.tail, view.chunks) },
            }))
          }
        } catch {
          // The next poll retries; a missing tail never blocks the controls.
        }
      }
    }
    poll()
    const timer = setInterval(poll, 1500)
    return () => {
      stopped = true
      clearInterval(timer)
    }
    // runningKey captures exactly which commands are live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey, headers])

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
        body: JSON.stringify({ name: newName.trim() || DEFAULT_MACHINE_NAME }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t add this machine.'))
      }
      setPairing(await response.json())
      setNewName(DEFAULT_MACHINE_NAME)
      setAddingMachine(false)
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
      setRemoveConfirmingId(null)
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
    setRenameError(null)
    setRenamingId(host.id)
  }, [])

  const cancelRename = useCallback(() => {
    if (savingId) return
    setRenameError(null)
    setRenamingId(null)
  }, [savingId])

  const saveRename = useCallback(async (host) => {
    const name = renameValue.trim()
    if (!name) {
      setRenameError('Enter a machine name.')
      return
    }
    if (name === host.name) {
      setRenameError(null)
      setRenamingId(null)
      return
    }
    if (savingId) return
    setSavingId(host.id)
    setRenameError(null)
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
      setRenameError(cause.message || 'Couldn’t rename this machine.')
    } finally {
      setSavingId(null)
    }
  }, [renameValue, savingId, headers])

  const stopCommand = useCallback(async (host, command) => {
    const path = cancelCommandPath(host, command)
    if (!path || stoppingId) return
    setStoppingId(command.id)
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

  const runRunnerUpdate = useCallback(async (host) => {
    if (!host.update_command || host.busy || updatingId) return
    setUpdatingId(host.id)
    setUpdateConfirmingId(null)
    setUpdateResult(null)
    setError(null)
    try {
      const response = await fetch(`/api/connect/hosts/${host.id}/exec`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cmd: host.update_command, timeout: 180 }),
      })
      if (!response.ok) {
        const detail = await responseError(response, `Update request didn’t complete (HTTP ${response.status}).`)
        if (response.status === 504 && /did not start the command before it expired/i.test(detail)) {
          setUpdateResult({ hostId: host.id, errorKind: 'expired', errorMessage: detail })
        } else if (response.status === 409 && /busy|running a command/i.test(detail)) {
          setUpdateResult({ hostId: host.id, exitCode: 125, errorMessage: detail })
        } else {
          setUpdateResult({ hostId: host.id, errorKind: 'request', errorMessage: detail })
        }
        return
      }
      const result = await response.json()
      setUpdateResult({
        hostId: host.id,
        exitCode: result.exit_code,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      })
      await load()
    } catch (cause) {
      setUpdateResult({ hostId: host.id, errorKind: 'request', errorMessage: cause.message || 'Couldn’t update this runner.' })
    } finally {
      setUpdatingId(null)
    }
  }, [headers, load, updatingId])

  const grantOutboundAccess = useCallback(async () => {
    const label = accessLabel.trim()
    const command = accessCommand.trim()
    if (!label || !command || grantingAccess) return
    setGrantingAccess(true)
    setError(null)
    try {
      const response = await fetch('/api/connect/outbound', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ label, command, agent: accessAgent }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t grant access.'))
      }
      setAccessLabel('')
      setAccessCommand('')
      setAccessAgent(false)
      setSharingOpen(false)
      window.mobius.signal('item_created', { type: 'outbound_access' })
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t grant access.')
    } finally {
      setGrantingAccess(false)
    }
  }, [accessAgent, accessCommand, accessLabel, grantingAccess, headers, load])

  const setOutboundAgent = useCallback(async (connection, agent) => {
    if (agentBusyId) return
    setAgentBusyId(connection.id)
    setError(null)
    try {
      const response = await fetch(`/api/connect/outbound/${connection.id}`, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ agent }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Couldn’t change full access.'))
      }
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t change full access.')
    } finally {
      setAgentBusyId(null)
    }
  }, [agentBusyId, headers, load])

  const revokeOutboundAccess = useCallback(async (connection) => {
    if (revokingOutboundId) return
    setRevokingOutboundId(connection.id)
    setError(null)
    try {
      const response = await fetch(`/api/connect/outbound/${connection.id}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!response.ok && response.status !== 404) {
        throw new Error(await responseError(response, 'Couldn’t confirm that access was revoked.'))
      }
      setOutboundConfirmId(null)
      setOutbound(current => current.filter(item => item.id !== connection.id))
      window.mobius.signal('item_deleted', { type: 'outbound_access' })
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t revoke this access.')
    } finally {
      setRevokingOutboundId(null)
    }
  }, [headers, load, revokingOutboundId])

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
          <p className="cn-sub">Remote access, both ways.</p>
        </div>
      </div>
    </header>
    <main className="cn-shell">
      <div aria-live="polite">
        {error ? <div className="cn-message cn-error">{error}</div> : null}
        {loadNotices.map(notice => <div className="cn-message cn-notice" key={notice.title}>
          <strong>{notice.title}</strong>
          {notice.message}
        </div>)}
      </div>

      {serviceActive === null ? <div className="cn-loading" role="status">Loading Connect…</div> : null}

      {serviceActive === true ? <section className="cn-section cn-section-first" aria-labelledby="cn-machines">
        <div className="cn-section-head">
          <div className="cn-section-heading">
            <h2 className="cn-secttitle" id="cn-machines">Machines you control</h2>
            <span className="cn-count">{hosts.length}</span>
          </div>
          <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => setAddingMachine(open => !open)}>
            {addingMachine ? 'Cancel' : <><Plus size={16}/>Add machine</>}
          </button>
        </div>

        {addingMachine ? <div className="cn-inline-form cn-machine-form">
          <label className="cn-field">
            <span className="cn-label">Name</span>
            <input
              className="cn-input"
              placeholder="My MacBook"
              value={newName}
              maxLength={80}
              autoFocus
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') addMachine() }}
            />
          </label>
          <button className="cn-btn" onClick={addMachine} disabled={creating}>
            {creating ? 'Creating…' : 'Continue'}
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

        {hosts.length ? <div className="cn-list">
          {hosts.map(host => <MachineRow
            key={host.id}
            host={host}
            confirming={confirmingId === host.id}
            deleting={deletingId === host.id}
            removeConfirming={removeConfirmingId === host.id}
            renaming={renamingId === host.id}
            renameValue={renameValue}
            renameError={renamingId === host.id ? renameError : null}
            saving={savingId === host.id}
            tails={tails}
            stopConfirmingId={stopConfirmingId}
            stoppingId={stoppingId}
            copiedKey={copiedKey}
            failedKey={failedKey}
            onCopy={copy}
            onConfirm={() => {
              setRemoveConfirmingId(null)
              setOutboundConfirmId(null)
              setUpdateConfirmingId(null)
              setStopConfirmingId(null)
              setRenamingId(null)
              setConfirmingId(current => current === host.id ? null : host.id)
            }}
            onPair={() => showCommand(host.id)}
            onRemove={() => removeMachine(host)}
            onRemoveConfirm={() => {
              setStopConfirmingId(null)
              setOutboundConfirmId(null)
              setUpdateConfirmingId(null)
              setRemoveConfirmingId(host.id)
            }}
            onRemoveCancel={() => setRemoveConfirmingId(null)}
            onSelect={selectCommand}
            onRenameStart={() => {
              setStopConfirmingId(null)
              setRemoveConfirmingId(null)
              setConfirmingId(null)
              startRename(host)
            }}
            onRenameChange={value => {
              setRenameError(null)
              setRenameValue(value)
            }}
            onRenameSave={() => saveRename(host)}
            onRenameCancel={cancelRename}
            onStopConfirm={command => {
              setRemoveConfirmingId(null)
              setOutboundConfirmId(null)
              setUpdateConfirmingId(null)
              setConfirmingId(null)
              setRenamingId(null)
              setStopConfirmingId(command.id)
            }}
            onStopKeep={() => setStopConfirmingId(null)}
            onStop={command => stopCommand(host, command)}
            updateConfirming={updateConfirmingId === host.id}
            updating={updatingId === host.id}
            updateResult={updateResult}
            onUpdate={() => {
              setRemoveConfirmingId(null)
              setOutboundConfirmId(null)
              setConfirmingId(null)
              setRenamingId(null)
              setStopConfirmingId(null)
              setUpdateConfirmingId(host.id)
            }}
            onUpdateConfirm={() => runRunnerUpdate(host)}
            onUpdateCancel={() => setUpdateConfirmingId(null)}
          />)}
        </div> : <div className="cn-empty-row">No machines added.</div>}
      </section> : null}

      {outboundActive === true ? <OutboundAccess
        connections={outbound}
        open={sharingOpen}
        label={accessLabel}
        command={accessCommand}
        granting={grantingAccess}
        agent={accessAgent}
        agentSupported={agentSupported}
        agentBusyId={agentBusyId}
        confirmingId={outboundConfirmId}
        revokingId={revokingOutboundId}
        onOpen={() => setSharingOpen(true)}
        onCancel={() => {
          setSharingOpen(false)
          setAccessLabel('')
          setAccessCommand('')
          setAccessAgent(false)
        }}
        onLabel={setAccessLabel}
        onCommand={setAccessCommand}
        onAgent={setAccessAgent}
        onToggleAgent={setOutboundAgent}
        onGrant={grantOutboundAccess}
        onConfirm={id => {
          setRemoveConfirmingId(null)
          setStopConfirmingId(null)
          setUpdateConfirmingId(null)
          setOutboundConfirmId(id)
        }}
        onKeep={() => setOutboundConfirmId(null)}
        onRevoke={revokeOutboundAccess}
      /> : null}
    </main>
  </div>
}
