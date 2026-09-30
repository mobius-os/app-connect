import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Copy, Desktop, Pencil, Plus } from '@openai/apps-sdk-ui/components/Icon'
import {
  activeCommands,
  appendTail,
  cancelCommandPath,
  commandCapabilities,
  disconnectPresentation,
  outputPage,
  outputPath,
  statusOf,
} from './connect-state.mjs'
import { loadConnectionList, responseError, responseErrorData } from './connect-api.mjs'

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

  .cn-host { border-bottom: 1px solid var(--border); }
  .cn-host-summary, .cn-outbound { position: relative; min-height: 72px; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; column-gap: 13px; row-gap: 8px; padding: 13px 15px; }
  .cn-outbound { border-bottom: 1px solid var(--border); }
  .cn-host:last-child, .cn-outbound:last-child { border-bottom: 0; }
  .cn-host:first-child .cn-host-toggle { border-top-left-radius: 14px; border-top-right-radius: 14px; }
  .cn-host:last-child .cn-host-toggle { border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; }
  .cn-host-toggle { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: transparent; cursor: pointer; }
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

  .cn-host-details:empty { display: none; }
  .cn-disconnect, .cn-command, .cn-update, .cn-finished { min-width: 0; margin: 0; padding: 14px 15px; }
  .cn-disconnect-title, .cn-command-title, .cn-update-title { margin: 0 0 4px; font-size: 13px; font-weight: 680; }
  .cn-disconnect-copy, .cn-command-meta, .cn-update-copy { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .cn-disconnect-actions { display: flex; align-items: center; justify-content: flex-start; gap: 8px; }
  .cn-disconnect-alt, .cn-update-manual { margin-top: 12px; }
  .cn-update-manual:first-child { margin-top: 0; }
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
  .cn-command-label { display: block; margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cn-tail { max-height: 196px; overflow: auto; margin: 11px 0 0; padding: 9px 11px; border: 1px solid var(--border); border-radius: 9px; color: color-mix(in srgb, var(--text) 86%, var(--muted)); background: var(--bg); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cn-finished-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .cn-finished-head .cn-command-title { margin: 0; }
  .cn-recent-list { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0; }
  .cn-recent-list .cn-btn { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .cn-recent-list .cn-btn.is-selected { border-color: var(--cn-violet); color: var(--text); background: color-mix(in srgb, var(--cn-violet) 12%, var(--surface-2)); }
  .cn-finished .cn-tail { max-height: 320px; }
  .cn-page-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
  .cn-page-actions span { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }

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
  .cn-pair-refresh { margin-left: 5px; padding: 2px 4px; border: 0; border-radius: 4px; background: transparent; color: var(--cn-violet); font: inherit; font-weight: 680; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .cn-pair-refresh:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
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
    .cn-host-summary, .cn-outbound { grid-template-columns: 38px minmax(0, 1fr); column-gap: 10px; padding-left: 12px; padding-right: 12px; }
    .cn-host-summary .cn-toggle-mark { position: absolute; top: 21px; right: 12px; }
    .cn-host .cn-host-body { grid-column: 2; padding-right: 30px; }
    .cn-disconnect, .cn-command, .cn-update, .cn-finished { padding-left: 12px; padding-right: 12px; }
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

function PairingPanel({ pairing, copiedKey, failedKey, onCopy, onDone, onRefresh, onSelect }) {
  const expires = pairing.expires_at ? new Date(pairing.expires_at * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
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
          Installs a background service that reconnects after reboot. {expires ? `Expires at ${expires}.` : 'This command expires after 15 minutes.'} <button className="cn-pair-refresh" onClick={onRefresh}>Refresh command</button>
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
  host, busy, stale, confirmingRemove, copiedKey, failedKey, onCopy, onPair,
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
      {!host.paired ? <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onPair} disabled={busy || stale}>
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
        disabled={busy || stale}
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
  connections, open, label, command, agent, agentSupported, granting, confirmingId, revokingId, agentBusyId, stale,
  onOpen, onCancel, onLabel, onCommand, onAgent, onGrant, onConfirm, onKeep, onRevoke, onToggleAgent,
}) {
  return <section className="cn-section" aria-labelledby="cn-access-title">
    <div className="cn-section-head">
      <div className="cn-section-heading">
        <h2 className="cn-secttitle" id="cn-access-title">Can control this Möbius</h2>
        <span className="cn-count">{connections.length}</span>
      </div>
      <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={open ? onCancel : onOpen} disabled={stale && !open}>
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
        <button className="cn-btn" onClick={onGrant} disabled={stale || granting || !label.trim() || !command.trim()}>
          {granting ? 'Connecting…' : 'Grant access'}
        </button>
      </div>
    </div> : null}

    {connections.length ? <div className="cn-list" aria-label="Machines that can control this Möbius">
      {connections.map(connection => {
        const confirming = confirmingId === connection.id
        const status = connection.online ? 'Service running' : (connection.status === 'ended' ? 'Ended' : 'Needs attention')
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
                disabled={stale || agentBusyId === connection.id}
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
              disabled={stale || revokingId === connection.id}
              confirming={revokingId === connection.id}
              align="end"
            />
          </div>
        </article>
      })}
    </div> : <div className="cn-empty-row">No machines have access.</div>}
  </section>
}

function CommandPanel({ host, command, tail, confirming, stopping, stale, onConfirm, onKeep, onStop }) {
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

function FinishedOutput({ host, commands, headers }) {
  const [selectedId, setSelectedId] = useState(commands[0].id)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [previous, setPrevious] = useState([])
  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [retry, setRetry] = useState(0)
  const command = commands.find(item => item.id === selectedId) || commands[0]

  useEffect(() => {
    if (!open) return undefined
    let canceled = false
    setLoading(true)
    setLoadError(null)
    setPage(null)
    setUnavailable(false)
    const read = async () => {
      try {
        const response = await fetch(outputPath(host, command, cursor), { headers: headers() })
        if (canceled) return
        if (response.status === 404) {
          setUnavailable(true)
          return
        }
        if (!response.ok) throw new Error(await responseError(response, 'Couldn’t load this output page.'))
        const loaded = outputPage(await response.json(), cursor)
        if (!canceled) setPage(loaded)
      } catch (cause) {
        if (!canceled) setLoadError(cause.message || 'Couldn’t load this output page.')
      } finally {
        if (!canceled) setLoading(false)
      }
    }
    read()
    return () => { canceled = true }
  }, [open, cursor, host.id, command.id, headers, retry])

  const result = command.result || {}
  const preview = page?.preview || [result.stdout, result.stderr].filter(Boolean).join('\n')
  const next = () => {
    if (!page?.hasMore) return
    setPrevious(current => [...current.slice(-99), cursor])
    setCursor(page.next)
  }
  const back = () => {
    if (!previous.length) return
    setCursor(previous[previous.length - 1])
    setPrevious(current => current.slice(0, -1))
  }

  return <div className="cn-finished">
    <div className="cn-finished-head">
      <p className="cn-command-title">Recent command output</p>
      <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => setOpen(value => !value)}
        aria-expanded={open}>{open ? 'Hide output' : 'View output'}</button>
    </div>
    {open && commands.length > 1 ? <div className="cn-recent-list" aria-label="Finished commands">
      {commands.map((item, index) => <button key={item.id}
        className={`cn-btn cn-btn-ghost cn-btn-sm${item.id === command.id ? ' is-selected' : ''}`}
        aria-pressed={item.id === command.id}
        onClick={() => {
          setSelectedId(item.id)
          setCursor(0)
          setPrevious([])
        }}
      >{item.label || `Command ${index + 1}`}</button>)}
    </div> : null}
    {command.label ? <code className="cn-command-label" title={command.label}>{command.label}</code> : null}
    <p className="cn-command-meta">
      {command.finished_at ? `Finished ${relTime(command.finished_at)}` : 'Finished'}
      {(command.outcome || result.outcome) ? ` · ${command.outcome || result.outcome}` : null}
      {Number.isInteger(command.exit_code ?? result.exit_code) ? ` · exit ${command.exit_code ?? result.exit_code}` : null}
    </p>
    {open ? <div aria-live="polite">
      {loading ? <p className="cn-hint">Loading output page…</p> : null}
      {loadError ? <div role="alert">
        <p className="cn-update-result is-error">{loadError}</p>
        <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => setRetry(value => value + 1)}>Retry page</button>
      </div> : null}
      {unavailable ? <>
        <p className="cn-hint">The retained output is unavailable for this older command.
          {preview ? ' The text below is only a result preview, not the full output.' : ''}</p>
        {preview ? <pre className="cn-tail" aria-label="Result preview only">{preview}</pre> : null}
      </> : null}
      {page ? <>
        {page.text ? <pre className="cn-tail" aria-label="Retained command output page">{page.text}</pre>
          : preview && !page.complete && !page.hasMore ? <>
            <p className="cn-hint">Only a result preview is available here; this is not the full output.</p>
            <pre className="cn-tail" aria-label="Result preview only">{preview}</pre>
          </> : <p className="cn-hint">No output on this page.</p>}
        {!page.complete && !page.hasMore ? <p className="cn-hint">The retained output may be incomplete.</p> : null}
        <div className="cn-page-actions">
          <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={back} disabled={!previous.length}>Previous page</button>
          <span>Page {previous.length + 1}</span>
          <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={next} disabled={!page.hasMore}>Next page</button>
        </div>
      </> : null}
    </div> : null}
  </div>
}

function formatLimit(seconds) {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds >= 600 && seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

function UpdatePanel({
  host, copiedKey, failedKey, onCopy, onSelect,
  confirming, updating, result, onUpdate, onConfirm, onCancel, stale,
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
  const retry = currentResult?.code === 'host_busy' || currentResult?.code === 'command_expired'
  const resultMessage = currentResult?.code === 'host_busy' ? 'Another command is using this machine. When it finishes, try again; nothing was changed.'
    : currentResult?.code === 'command_expired' ? 'The machine didn’t start the update before it expired. Nothing ran; try again.'
    : currentResult?.errorMessage || (
    currentResult?.outcome === 'expired' ? 'The machine didn’t start the update before it expired. Nothing ran; try again.'
      : currentResult?.outcome === 'timed_out' ? 'The update timed out. Check the machine before trying again.'
      : currentResult?.outcome === 'canceled' ? 'The update was canceled.'
      : currentResult?.outcome === 'lost' ? 'The command result was lost. Check the runner before trying again.'
      : currentResult?.exitCode !== 0 ? `Update command failed (exit ${currentResult?.exitCode}). Review the command result and try again.`
      : null
  )
  const confirmed = updated && (currentResult?.outcome === 'completed' || !currentResult?.outcome) && currentResult?.exitCode === 0
  return <div className="cn-update">
    {!updated && !host.busy && !updating && host.online ? <InlineActionConfirm
      open={confirming}
      triggerLabel={retry ? 'Try update again' : 'Update runner'}
      confirmLabel="Confirm update"
      confirmingLabel="Updating…"
      onOpen={onUpdate}
      onCancel={onCancel}
      onConfirm={onConfirm}
      disabled={stale || updating}
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
      className={`cn-update-result${confirmed ? ' is-success' : retry || (currentResult?.exitCode === 0 && !confirmed) ? ' is-waiting' : ' is-error'}`}
      role="status"
    >{resultMessage || (confirmed ? 'Runner updated and reconnected.' : 'Installer finished; Connect has not confirmed the updated runner yet.')}</p> : null}
  </div>
}

function MachineRow({
  host, confirming, deleting, removeConfirming, renaming, renameValue, renameError, saving,
  copiedKey, failedKey, onCopy, onConfirm, onPair, onRemove, onSelect,
  onRenameStart, onRenameChange, onRenameSave, onRenameCancel,
  tails, stopConfirmingId, stoppingId, onStopConfirm, onStopKeep, onStop,
  onRemoveConfirm, onRemoveCancel,
  updateConfirming, updating, updateResult, onUpdate, onUpdateConfirm, onUpdateCancel, stale,
  headers,
}) {
  const status = statusOf(host)
  const commands = activeCommands(host)
  const meta = [
    host.platform,
    !host.online && host.paired && host.last_seen ? `Last seen ${relTime(host.last_seen)}` : null,
  ].filter(Boolean).join(' · ')
  const expanded = confirming || renaming

  return <article className="cn-host">
    <div className="cn-host-summary">
      <button
        className="cn-host-toggle"
        onClick={onConfirm}
        disabled={renaming}
        aria-expanded={confirming}
        aria-controls={`cn-details-${host.id}`}
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
              disabled={stale}
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
    </div>
    <div className="cn-host-details" id={`cn-details-${host.id}`}>
      {confirming ? <DisconnectPanel
        host={host}
        busy={deleting}
        stale={stale}
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
        stale={stale}
        onConfirm={() => onStopConfirm(command)}
        onKeep={onStopKeep}
        onStop={() => onStop(command)}
      />)}
      {confirming && host.recent_commands?.length ? <FinishedOutput
        key={host.id}
        host={host}
        commands={host.recent_commands.slice(0, 20)}
        headers={headers}
      /> : null}
      {host.runner_update_available && !host.busy && !expanded ? <UpdatePanel
        host={host}
        copiedKey={copiedKey}
        failedKey={failedKey}
        onCopy={onCopy}
        onSelect={onSelect}
        confirming={updateConfirming}
        updating={updating}
        result={updateResult}
        stale={stale}
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
        stale={stale}
      /> : null}
    </div>
  </article>
}

export default function App({ appId, token }) {
  const [hosts, setHosts] = useState([])
  const [outbound, setOutbound] = useState([])
  const [serviceActive, setServiceActive] = useState(null)
  const [serviceStale, setServiceStale] = useState(false)
  const [outboundActive, setOutboundActive] = useState(null)
  const [outboundStale, setOutboundStale] = useState(false)
  const [loadNotices, setLoadNotices] = useState([])
  const [newName, setNewName] = useState(DEFAULT_MACHINE_NAME)
  const [addingMachine, setAddingMachine] = useState(false)
  const [pairing, setPairing] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [stoppingId, setStoppingId] = useState(null)
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
  const [revokingOutboundId, setRevokingOutboundId] = useState(null)
  const [error, setError] = useState(null)
  const readySignalled = useRef(false)
  const hadServiceSnapshot = useRef(false)
  const hadOutboundSnapshot = useRef(false)
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
    setServiceActive(previous => machines.ready || (machines.transient && previous === true))
    setOutboundActive(previous => shared.ready || (shared.transient && previous === true))
    setServiceStale(!machines.ready && machines.transient && hadServiceSnapshot.current)
    setOutboundStale(!shared.ready && shared.transient && hadOutboundSnapshot.current)
    if (machines.ready) {
      hadServiceSnapshot.current = true
      setHosts(machines.items)
    } else if (!machines.transient) setHosts([])
    if (shared.ready) {
      hadOutboundSnapshot.current = true
      setOutbound(shared.items)
      setAgentSupported(shared.data?.agent_access === true)
    } else if (!shared.transient) {
      setOutbound([])
      setAgentSupported(false)
    }
    const notices = [
      machines.notice && { ...machines.notice, stale: !machines.ready && machines.transient && hadServiceSnapshot.current },
      shared.notice && { ...shared.notice, stale: !shared.ready && shared.transient && hadOutboundSnapshot.current },
    ].filter(Boolean)
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
  const runningKey = (serviceStale ? [] : hosts)
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
    if (confirmation?.kind === 'stop' && !hosts.some(host => (
      activeCommands(host).some(command => command.id === confirmation.id)
    ))) setConfirmation(null)
  }, [hosts, confirmation])

  // Follow each running command's output while it runs. Only a Möbius that
  // reports a command list has the output route; older ones show no tail.
  useEffect(() => {
    const running = (serviceStale ? [] : hosts)
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
  }, [runningKey, headers, serviceStale])

  useEffect(() => {
    if (confirmingId && hosts.some(host => (
      host.id === confirmingId && host.busy
    ))) setConfirmingId(null)
  }, [hosts, confirmingId])

  const addMachine = useCallback(async () => {
    if (creating || serviceStale) return
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
  }, [creating, headers, load, newName, serviceStale])

  const showCommand = useCallback(async (id) => {
    if (serviceStale) return
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
  }, [headers, serviceStale])

  const removeMachine = useCallback(async (host) => {
    if (deletingId || serviceStale) return
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
      setConfirmation(null)
      window.mobius.signal('item_deleted')
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t disconnect this machine.')
    } finally {
      setDeletingId(null)
    }
  }, [deletingId, headers, load, pairing, serviceStale])

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
    if (savingId || serviceStale) return
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
  }, [renameValue, savingId, headers, serviceStale])

  const stopCommand = useCallback(async (host, command) => {
    const path = cancelCommandPath(host, command)
    if (!path || stoppingId || serviceStale) return
    setStoppingId(command.id)
    setError(null)
    try {
      const response = await fetch(path, { method: 'POST', headers: headers() })
      if (!response.ok && response.status !== 404) {
        throw new Error(await responseError(response, 'Couldn’t stop this command.'))
      }
      setConfirmation(null)
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t stop this command.')
    } finally {
      setStoppingId(null)
    }
  }, [headers, load, stoppingId, serviceStale])

  const runRunnerUpdate = useCallback(async (host) => {
    if (!host.update_command || !host.online || host.busy || updatingId || serviceStale) return
    setUpdatingId(host.id)
    setConfirmation(null)
    setUpdateResult(null)
    setError(null)
    try {
      const response = await fetch(`/api/connect/hosts/${host.id}/exec`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cmd: host.update_command, timeout: 180 }),
      })
      if (!response.ok) {
        const failure = await responseErrorData(response, `Update request didn’t complete (HTTP ${response.status}).`)
        setUpdateResult({ hostId: host.id, code: failure.code, errorMessage: failure.detail })
        return
      }
      const result = await response.json()
      setUpdateResult({
        hostId: host.id,
        exitCode: result.exit_code,
        outcome: result.outcome,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      })
      await load()
    } catch (cause) {
      setUpdateResult({ hostId: host.id, errorKind: 'request', errorMessage: cause.message || 'Couldn’t update this runner.' })
    } finally {
      setUpdatingId(null)
    }
  }, [headers, load, updatingId, serviceStale])

  const grantOutboundAccess = useCallback(async () => {
    const label = accessLabel.trim()
    const command = accessCommand.trim()
    if (!label || !command || grantingAccess || outboundStale) return
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
  }, [accessAgent, accessCommand, accessLabel, grantingAccess, headers, load, outboundStale])

  const setOutboundAgent = useCallback(async (connection, agent) => {
    if (agentBusyId || outboundStale) return
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
  }, [agentBusyId, headers, load, outboundStale])

  const revokeOutboundAccess = useCallback(async (connection) => {
    if (revokingOutboundId || outboundStale) return
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
      setConfirmation(null)
      setOutbound(current => current.filter(item => item.id !== connection.id))
      window.mobius.signal('item_deleted', { type: 'outbound_access' })
      await load()
    } catch (cause) {
      setError(cause.message || 'Couldn’t revoke this access.')
    } finally {
      setRevokingOutboundId(null)
    }
  }, [headers, load, revokingOutboundId, outboundStale])

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
          {notice.message}{notice.stale ? ' Showing the last successful list; remote actions are paused until it refreshes.' : ''}
        </div>)}
      </div>

      {serviceActive === null ? <div className="cn-loading" role="status">Loading Connect…</div> : null}

      {serviceActive === true ? <section className="cn-section cn-section-first" aria-labelledby="cn-machines">
        <div className="cn-section-head">
          <div className="cn-section-heading">
            <h2 className="cn-secttitle" id="cn-machines">Machines you control</h2>
            <span className="cn-count">{hosts.length}</span>
          </div>
          <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => setAddingMachine(open => !open)} disabled={serviceStale && !addingMachine}>
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
          <button className="cn-btn" onClick={addMachine} disabled={creating || serviceStale}>
            {creating ? 'Creating…' : 'Continue'}
          </button>
        </div> : null}

        {pairing ? <PairingPanel
          pairing={pairing}
          copiedKey={copiedKey}
          failedKey={failedKey}
          onCopy={copy}
          onDone={() => setPairing(null)}
          onRefresh={() => showCommand(pairing.id)}
          onSelect={selectCommand}
        /> : null}

        {hosts.length ? <div className="cn-list">
          {hosts.map(host => <MachineRow
            key={host.id}
            host={host}
            headers={headers}
            stale={serviceStale}
            confirming={confirmingId === host.id}
            deleting={deletingId === host.id}
            removeConfirming={confirmation?.kind === 'remove' && confirmation.id === host.id}
            renaming={renamingId === host.id}
            renameValue={renameValue}
            renameError={renamingId === host.id ? renameError : null}
            saving={savingId === host.id}
            tails={tails}
            stopConfirmingId={confirmation?.kind === 'stop' ? confirmation.id : null}
            stoppingId={stoppingId}
            copiedKey={copiedKey}
            failedKey={failedKey}
            onCopy={copy}
            onConfirm={() => {
              setConfirmation(null)
              setRenamingId(null)
              setConfirmingId(current => current === host.id ? null : host.id)
            }}
            onPair={() => showCommand(host.id)}
            onRemove={() => removeMachine(host)}
            onRemoveConfirm={() => setConfirmation({ kind: 'remove', id: host.id })}
            onRemoveCancel={() => setConfirmation(null)}
            onSelect={selectCommand}
            onRenameStart={() => {
              setConfirmation(null)
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
              setConfirmingId(null)
              setRenamingId(null)
              setConfirmation({ kind: 'stop', id: command.id })
            }}
            onStopKeep={() => setConfirmation(null)}
            onStop={command => stopCommand(host, command)}
            updateConfirming={confirmation?.kind === 'update' && confirmation.id === host.id}
            updating={updatingId === host.id}
            updateResult={updateResult}
            onUpdate={() => {
              setConfirmingId(null)
              setRenamingId(null)
              setConfirmation({ kind: 'update', id: host.id })
            }}
            onUpdateConfirm={() => runRunnerUpdate(host)}
            onUpdateCancel={() => setConfirmation(null)}
          />)}
        </div> : <div className="cn-empty-row">No machines added.</div>}
      </section> : null}

      {outboundActive === true ? <OutboundAccess
        connections={outbound}
        stale={outboundStale}
        open={sharingOpen}
        label={accessLabel}
        command={accessCommand}
        granting={grantingAccess}
        agent={accessAgent}
        agentSupported={agentSupported}
        agentBusyId={agentBusyId}
        confirmingId={confirmation?.kind === 'revoke' ? confirmation.id : null}
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
        onConfirm={id => setConfirmation({ kind: 'revoke', id })}
        onKeep={() => setConfirmation(null)}
        onRevoke={revokeOutboundAccess}
      /> : null}
    </main>
  </div>
}
