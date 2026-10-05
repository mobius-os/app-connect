import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Desktop, Pencil, Plus } from '@openai/apps-sdk-ui/components/Icon'
import {
  activeCommands,
  appendTail,
  cancelCommandPath,
  disconnectPresentation,
  outputPage,
  outputPath,
  runnerUpdateFeedback,
  statusOf,
  platformLabel,
} from './connect-state.mjs'
import { failureMessage, responseError, responseErrorData, serverError } from './connect-api.mjs'
import { CopyCommand, InlineActionConfirm, useAction, usePolledList } from './connect-ui.jsx'
import BrowserAccessSection, { SharedWithMe, useSharedDirectory } from './BrowserAccessSection.jsx'

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

  .cn-tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin: -4px 0 24px; }
  .cn-tab { position: relative; display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 2px; border: 0; color: var(--muted); background: transparent; font: 650 13px var(--font); cursor: pointer; }
  .cn-tab[aria-selected="true"] { color: var(--text); }
  .cn-tab[aria-selected="true"]::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: var(--cn-violet); }
  .cn-tab:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
  .cn-tab-badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; color: #fff; background: var(--cn-violet); font-size: 10px; font-variant-numeric: tabular-nums; }
  .cn-tab-panel[hidden] { display: none; }
  .cn-shared-panel > .cn-section:first-child { margin-top: 0; padding-top: 0; }
  .cn-shared-actions { display: flex; align-items: center; gap: 8px; flex: none; }
  .cn-section { padding-top: 32px; margin-top: 34px; }
  .cn-section-first { padding-top: 0; margin-top: 0; }
  .cn-section-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 0 0 14px; }
  .cn-section-heading { display: flex; align-items: center; min-width: 0; gap: 9px; }
  .cn-secttitle { margin: 0; color: var(--text); font-size: 15px; font-weight: 710; letter-spacing: -.01em; }
  .cn-count { color: var(--muted); font-size: 11px; font-weight: 680; font-variant-numeric: tabular-nums; }
  .cn-list { position: relative; overflow: visible; border-top: 1px solid var(--border); }
  .cn-empty-row { min-height: 76px; display: flex; align-items: center; justify-content: center; border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent); border-radius: 15px; color: var(--muted); font-size: 13px; }

  .cn-field { min-width: 0; }
  .cn-label { display: block; margin: 0 0 7px 1px; color: var(--muted); font-size: 11.5px; font-weight: 650; }
  .cn-input { width: 100%; height: 46px; padding: 0 13px; border: 1px solid var(--border); border-radius: 11px; color: var(--text); background: var(--bg); caret-color: var(--cn-violet); font: 14px var(--font); }
  .cn-input::placeholder { color: color-mix(in srgb, var(--muted) 78%, transparent); }
  .cn-input:focus { outline: 2px solid color-mix(in srgb, var(--cn-violet) 58%, transparent); outline-offset: 1px; border-color: var(--cn-violet); }
  .cn-btn { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 15px; border: 1px solid transparent; border-radius: 11px; background: var(--cn-violet); color: #fff; font: 650 13px var(--font); cursor: pointer; white-space: nowrap; transition: background 160ms ease-out, transform 160ms ease-out; }
  .cn-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cn-violet) 88%, white); }
  .cn-btn:active:not(:disabled) { transform: scale(.98); }
  .cn-btn:disabled { opacity: .48; cursor: default; }
  .cn-btn:focus-visible, .cn-host-toggle:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
  .cn-btn-ghost { color: var(--text); background: transparent; border-color: var(--border); }
  .cn-btn-ghost:hover:not(:disabled) { background: var(--surface-2); }
  .cn-btn-danger { color: #fff; background: #c9363e; }
  .cn-btn-danger:hover:not(:disabled) { background: #d6464e; }
  .cn-btn-sm { min-height: 44px; padding: 0 13px; font-size: 12.5px; }

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
  .cn-agent-toggle { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; flex: none; padding: 0 13px; border: 1px solid var(--border); border-radius: 11px; color: var(--muted); font: 650 12.5px var(--font); white-space: nowrap; cursor: pointer; transition: background 160ms ease-out, color 160ms ease-out; }
  .cn-agent-toggle:hover { background: var(--surface-2); }
  .cn-agent-toggle.is-on { color: var(--text); border-color: color-mix(in srgb, var(--cn-violet) 45%, var(--border)); background: color-mix(in srgb, var(--cn-violet) 10%, transparent); }
  .cn-agent-toggle:focus-within { outline: 2px solid var(--text); outline-offset: 2px; }
  .cn-agent-toggle input { margin: 0; }
  .cn-agent-toggle input:focus-visible { outline: none; }

  .cn-message { margin: 0 0 16px; padding: 12px 14px; border-radius: 12px; font-size: 13px; line-height: 1.45; }
  .cn-error { color: #ffb7ba; background: color-mix(in srgb, #e5484d 12%, var(--surface)); border: 1px solid color-mix(in srgb, #e5484d 34%, var(--border)); }
  .cn-notice { background: var(--surface); border: 1px solid var(--border); }
  .cn-notice strong { display: block; margin-bottom: 2px; }
  .cn-loading { padding: 50px 0; color: var(--muted); font-size: 13px; text-align: center; }

  .cn-host { border-bottom: 1px solid var(--border); }
  .cn-host-summary, .cn-outbound { position: relative; min-height: 72px; display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; row-gap: 8px; padding: 14px 0; }
  .cn-outbound { border-bottom: 1px solid var(--border); }
  .cn-host-toggle { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: transparent; cursor: pointer; }
  .cn-host-toggle:hover:not(:disabled) { background: color-mix(in srgb, var(--surface-2) 48%, transparent); }
  .cn-host-toggle:disabled { cursor: default; }
  .cn-host-symbol { position: relative; z-index: 1; pointer-events: none; grid-column: 1; grid-row: 1; width: 24px; display: grid; place-items: center; color: var(--muted); }
  .cn-host-status { position: relative; z-index: 1; pointer-events: none; display: flex; align-items: center; gap: 8px; }
  .cn-host-body, .cn-outbound-copy { position: relative; z-index: 1; grid-column: 2; grid-row: 1; min-width: 0; }
  .cn-host-body { pointer-events: none; }
  .cn-host-top { display: flex; align-items: center; min-width: 0; gap: 8px; }
  .cn-name-edit { pointer-events: auto; flex: none; width: 44px; height: 44px; min-height: 44px; padding: 0; margin: -10px 0; border: 0; border-radius: 8px; background: transparent; color: var(--muted); }
  .cn-btn.cn-name-edit:hover:not(:disabled) { background: transparent; color: var(--text); }
  .cn-host-name { display: block; min-width: 0; max-width: min(100%, 44ch); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 14px; font-weight: 650; }
  .cn-outbound-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 14px; font-weight: 650; }
  .cn-host-meta, .cn-outbound-meta { display: block; margin-top: 4px; color: var(--muted); font-size: 11.5px; }
  .cn-pill { display: inline-flex; align-items: center; gap: 5px; padding: 0; color: var(--muted); font-size: 11px; font-weight: 680; }
  .cn-pill-dot { position: relative; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .cn-pill.on { color: #36b999; }
  .cn-pill.wait { color: #d7a848; }
  .cn-pill.busy { color: #a99afc; }
  .cn-toggle-mark { position: relative; z-index: 1; pointer-events: none; flex: none; width: 28px; height: 28px; display: grid; place-items: center; color: var(--muted); transition: transform 160ms ease-out; }
  .cn-toggle-mark.is-open { transform: rotate(180deg); }

  .cn-host-details[hidden] { display: none; }
  .cn-host-details { padding: 0 0 16px 36px; }
  .cn-activity-empty { margin: 0; padding: 12px 0; color: var(--muted); font-size: 12px; }
  .cn-outbound-actions { grid-column: 2 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .cn-outbound-actions .cn-inline-confirm { flex: 1; min-width: 0; flex-wrap: wrap; }
  .cn-outbound .cn-host-top { justify-content: space-between; flex-wrap: wrap; }
  .cn-disconnect, .cn-command, .cn-update, .cn-finished { min-width: 0; margin: 0; padding: 12px 0; }
  .cn-disconnect-title, .cn-command-title { margin: 0 0 4px; font-size: 13px; font-weight: 680; }
  .cn-disconnect-copy, .cn-command-meta { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .cn-disconnect-actions { display: flex; align-items: center; justify-content: flex-start; gap: 8px; }
  .cn-disconnect-alt, .cn-update-manual { margin-top: 12px; }
  .cn-update-manual:first-child { margin-top: 0; }
  .cn-inline-confirm { display: flex; align-items: center; gap: 8px; }
  .cn-inline-action { min-height: 44px; }
  .cn-update-result { margin: 10px 0 0; }
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

  .cn-browser-warning { max-width: 67ch; margin: 12px 0; color: var(--text); font-size: 12.5px; line-height: 1.5; }
  .cn-browser-note { margin: 9px 0 15px; color: var(--muted); font-size: 11.5px; line-height: 1.45; }
  .cn-browser-create { margin-top: 13px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; }
  .cn-browser-create > .cn-btn { min-height: 46px; }
  .cn-browser-action-error { margin: 12px 0; color: #ffb7ba; font-size: 12px; line-height: 1.45; }
  .cn-browser-row { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .cn-browser-person { min-width: 0; }
  .cn-browser-person .cn-outbound-name { display: block; }
  .cn-browser-stop-warning { display: block; max-width: 46ch; margin-top: 5px; color: #d7a848; font-size: 11.5px; line-height: 1.4; }
  .cn-browser-row-action { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .cn-browser-row-action .cn-btn { min-width: 0; padding: 0 8px; }
  .cn-browser-retry { flex: none; }
  .cn-shared-with-me .cn-browser-person { overflow-wrap: anywhere; }
  .cn-shared-with-me .cn-btn { flex: none; }

  .cn-rename { pointer-events: auto; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; }
  .cn-rename .cn-input { height: 40px; flex: 1; min-width: 0; }
  .cn-rename-actions { display: flex; gap: 8px; flex: none; }
  .cn-rename-error { flex-basis: 100%; margin: 0; color: #ffb7ba; font-size: 11.5px; line-height: 1.35; }

  @media (prefers-reduced-motion: reduce) { .cn-btn, .cn-toggle-mark, .cn-agent-toggle { transition: none; } }
  @media (max-width: 560px) {
    .cn-head-inner { padding-left: 14px; padding-right: 14px; }
    .cn-head-inner::after { left: 14px; right: 14px; }
    .cn-shell { width: calc(100% - 24px); padding-top: 22px; }
    .cn-section { padding-top: 26px; margin-top: 28px; }
    .cn-section-first { padding-top: 0; margin-top: 0; }
    .cn-secttitle { font-size: 14px; }
    .cn-machine-form { grid-template-columns: 1fr; }
    .cn-machine-form > .cn-btn { width: 100%; }
    .cn-form-footer { align-items: stretch; flex-direction: column; gap: 10px; }
    .cn-form-footer .cn-btn { width: 100%; }
    .cn-host-summary, .cn-outbound { column-gap: 10px; }
    .cn-host-details { padding-left: 0; }
    .cn-host-status { gap: 4px; }
    .cn-toggle-mark { width: 20px; }
    .cn-command-row { align-items: stretch; flex-direction: column; }
    .cn-command-row .cn-btn { flex: 1; }
    .cn-disconnect-actions { align-items: stretch; flex-direction: column-reverse; }
    .cn-disconnect-actions > .cn-btn { width: 100%; }
    .cn-rename .cn-input { flex-basis: 100%; }
    .cn-rename-actions { width: 100%; }
    .cn-rename-actions .cn-btn { flex: 1; }
    .cn-code-row { grid-template-columns: 1fr; }
    .cn-code-row .cn-btn { width: 100%; min-width: 0; }
    .cn-browser-create { grid-template-columns: 1fr; }
    .cn-browser-create > .cn-btn { width: 100%; }
    .cn-browser-row { align-items: flex-start; flex-direction: column; }
    .cn-shared-actions { width: 100%; }
    .cn-shared-actions .cn-btn { flex: 1; }
    .cn-browser-row-action { width: 100%; flex-wrap: wrap; }
    .cn-browser-row-action .cn-btn { flex: 1; }
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

function PairingPanel({ pairing, onDone, onRefresh, stale }) {
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
        <CopyCommand command={pairing.install_command}/>
        <div className="cn-hint">
          Installs a background service that reconnects after reboot. {expires ? `Expires at ${expires}.` : 'This command expires after 15 minutes.'} <button className="cn-pair-refresh" onClick={onRefresh} disabled={stale}>Refresh command</button>
        </div>
      </div>
    </div>
    <div className="cn-step">
      <span className="cn-step-n">2</span>
      <p className="cn-step-t">Leave this page open. This panel closes as soon as the machine is online.</p>
    </div>
  </section>
}

function DisconnectPanel({
  host, busy, stale, confirmingRemove, onPair, onRemoveOpen, onRemoveCancel, onRemove,
}) {
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
        confirmLabel={host.online ? 'Confirm disconnect' : 'Confirm remove'}
        confirmingLabel={host.online ? 'Disconnecting…' : 'Removing…'}
        onOpen={onRemoveOpen}
        onCancel={onRemoveCancel}
        onConfirm={onRemove}
        disabled={busy || stale}
        confirming={busy}
      />
    </div>
    {host.paired ? <div className="cn-disconnect-alt">
      <p className="cn-disconnect-alt-title">{host.online ? 'Disconnect manually' : presentation.commandTitle}</p>
      {!host.online ? <p className="cn-disconnect-alt-copy">{presentation.commandDescription}</p> : null}
      <CopyCommand command={host.disconnect_command || DISCONNECT_COMMAND}/>
    </div> : null}
  </div>
}

function OutboundAccess({
  connections, open, label, command, agent, agentSupported, pending, confirmingId, stale,
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
          <small>It can also use this Möbius the way your chats’ agent does, with owner-level authority.</small>
        </span>
      </label> : null}
      <div className="cn-form-footer">
        <p className="cn-share-warning">Full command access until you revoke it.</p>
        <button className="cn-btn" onClick={onGrant} disabled={stale || pending.includes('grant-access') || !label.trim() || !command.trim()}>
          {pending.includes('grant-access') ? 'Connecting…' : 'Grant access'}
        </button>
      </div>
    </div> : null}

    {connections.length ? <div className="cn-list" aria-label="Machines that can control this Möbius">
      {connections.map(connection => {
        const confirming = confirmingId === connection.id
        const revoking = pending.includes(`revoke:${connection.id}`)
        const status = connection.online ? 'Service running' : (connection.status === 'ended' ? 'Ended' : 'Needs attention')
        const statusClass = connection.online ? 'on' : (connection.status === 'ended' ? '' : 'wait')
        return <article className={`cn-outbound${confirming ? ' is-confirming' : ''}`} key={connection.id}>
          <div className="cn-host-symbol" aria-hidden="true">
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
              title="Also lets it use this Möbius the way your chats’ agent does. This is owner-level authority."
            >
              <input
                type="checkbox"
                checked={connection.agent}
                disabled={stale || pending.includes(`agent:${connection.id}`)}
                onChange={event => onToggleAgent(connection, event.target.checked)}
              />Full access
            </label> : null}
            <InlineActionConfirm
              open={confirming}
              triggerLabel={connection.online ? 'Revoke access' : 'Remove access'}
              confirmLabel={connection.online ? 'Confirm revoke' : 'Confirm remove'}
              confirmingLabel={connection.online ? 'Revoking…' : 'Removing…'}
              onOpen={() => onConfirm(connection.id)}
              onCancel={onKeep}
              onConfirm={() => onRevoke(connection)}
              disabled={stale}
              confirming={revoking}
            />
          </div>
        </article>
      })}
    </div> : <div className="cn-empty-row">No machines have access.</div>}
  </section>
}

function CommandPanel({ host, command, tail, confirming, stopping, stale, onConfirm, onKeep, onStop }) {
  const stoppingNow = command.state === 'canceling' || stopping
  // A Möbius from before parallel commands may report a command without its id.
  const canStop = Boolean(command.id)
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
      {canStop ? <InlineActionConfirm
        open={confirming}
        triggerLabel="Stop command"
        confirmLabel="Stop command and its processes"
        confirmingLabel="Stopping…"
        onOpen={onConfirm}
        onCancel={onKeep}
        onConfirm={onStop}
        disabled={stale}
        confirming={stoppingNow}
      /> : null}
    </div>
    {tail ? <pre className="cn-tail" aria-label="Latest output">{tail}</pre> : null}
  </div>
}

function FinishedOutput({ host, commands, headers }) {
  const [selectedCommand, setSelectedCommand] = useState(commands[0])
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [previous, setPrevious] = useState([])
  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [retry, setRetry] = useState(0)
  const command = commands.find(item => item.id === selectedCommand.id) || selectedCommand

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
          setSelectedCommand(item)
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
          <span>Output page</span>
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

function UpdatePanel({ host, confirming, updating, result, onUpdate, onConfirm, onCancel, stale }) {
  if (host.runner_managed === 'mobius') {
    return <div className="cn-update">
      <p className="cn-update-result" role="status">
        {host.name} is another Möbius. It installs the current runner the next time it restarts.
      </p>
    </div>
  }
  if (!host.update_command && !result) return null
  const currentResult = result?.hostId === host.id ? result : null
  const updated = !host.runner_update_available
  const feedback = runnerUpdateFeedback(host, currentResult, stale)
  if (!updating && feedback?.tone === 'success') return null
  const retry = feedback?.retry
  return <div className="cn-update">
    {host.update_command && !updated && !host.busy && !updating && host.online ? <InlineActionConfirm
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
      <CopyCommand command={host.update_command}/>
    </div> : null}
    {updating ? <p className="cn-update-result" role="status">Updating on {host.name}…</p> : null}
    {feedback && !updating ? <p
      className={`cn-update-result is-${feedback.tone}`}
      role="status"
    >{feedback.message}</p> : null}
  </div>
}

function MachineRow({
  host, expanded, deleting, removeConfirming, renaming, renameValue, renameError, saving,
  onExpand, onPair, onRemove, onRenameStart, onRenameChange, onRenameSave, onRenameCancel,
  tails, stopConfirmingId, pending, onStopConfirm, onStopKeep, onStop,
  onRemoveConfirm, onRemoveCancel,
  updateConfirming, updating, updateResult, onUpdate, onUpdateConfirm, onUpdateCancel, stale,
  headers,
}) {
  const status = statusOf(host)
  const commands = activeCommands(host)
  const meta = [
    platformLabel(host.platform),
    host.runner_update_available ? 'Update needed' : null,
    !host.online && host.paired && host.last_seen ? `Last seen ${relTime(host.last_seen)}` : null,
  ].filter(Boolean).join(' · ')

  return <article className="cn-host">
    <div className="cn-host-summary">
      <button
        className="cn-host-toggle"
        onClick={onExpand}
        disabled={renaming || saving}
        aria-expanded={expanded}
        aria-controls={`cn-details-${host.id}`}
        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${host.name}`}
      />
      <div className="cn-host-symbol" aria-hidden="true"><Desktop size={20}/></div>
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
                if (!saving && !stale) onRenameSave()
              } else if (event.key === 'Escape' && !saving) {
                onRenameCancel()
              }
            }}
          />
          <div className="cn-rename-actions">
            <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={onRenameCancel} disabled={saving}>
              Cancel
            </button>
            <button className="cn-btn cn-btn-sm" onClick={onRenameSave} disabled={saving || stale}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {renameError ? <p className="cn-rename-error" id={`rename-error-${host.id}`} role="alert">
            {renameError}
          </p> : null}
        </div> : <div className="cn-host-top">
          <span className="cn-host-name" title={host.name}>{host.name}</span>
          <button
            type="button"
            className="cn-btn cn-btn-ghost cn-name-edit"
            onClick={onRenameStart}
            aria-label={`Rename ${host.name}`}
            disabled={stale}
          ><Pencil size={15} aria-hidden="true"/></button>
        </div>}
        {meta ? <div className="cn-host-meta">{meta}</div> : null}
      </div>
      <div className="cn-host-status">
        <span className={`cn-pill ${status.cls}`} role="status">
          <span className="cn-pill-dot" aria-hidden="true"/>{status.label}
        </span>
        <span className={`cn-toggle-mark${expanded ? ' is-open' : ''}`} aria-hidden="true">
          <ChevronDown size={16}/>
        </span>
      </div>
    </div>
    <div className="cn-host-details" id={`cn-details-${host.id}`} hidden={!expanded}>
      {commands.map(command => <CommandPanel
        key={command.id}
        host={host}
        command={command}
        tail={tails[command.id]?.tail}
        confirming={stopConfirmingId === command.id}
        stopping={pending.includes(`stop:${command.id}`)}
        stale={stale}
        onConfirm={() => onStopConfirm(command)}
        onKeep={onStopKeep}
        onStop={() => onStop(command)}
      />)}
      {host.recent_commands?.length ? <FinishedOutput
        key={host.id}
        host={host}
        commands={host.recent_commands.slice(0, 20)}
        headers={headers}
      /> : !commands.length ? <p className="cn-activity-empty">No recent commands.</p> : null}
      {host.runner_update_available || updateResult?.hostId === host.id || updating ? <UpdatePanel
        host={host}
        confirming={updateConfirming}
        updating={updating}
        result={updateResult}
        stale={stale}
        onUpdate={onUpdate}
        onConfirm={onUpdateConfirm}
        onCancel={onUpdateCancel}
      /> : null}
      <DisconnectPanel
        host={host}
        busy={deleting}
        stale={stale || host.busy}
        confirmingRemove={removeConfirming}
        onPair={onPair}
        onRemoveOpen={onRemoveConfirm}
        onRemoveCancel={onRemoveCancel}
        onRemove={onRemove}
      />
    </div>
  </article>
}

export default function App({ appId, token }) {
  const [activeTab, setActiveTab] = useState('machines')
  const machinesTab = useRef(null)
  const sharedTab = useRef(null)
  const [newName, setNewName] = useState(DEFAULT_MACHINE_NAME)
  const [addingMachine, setAddingMachine] = useState(false)
  const [pairing, setPairing] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  // At most one confirmation is open, across both tabs: { kind, id }.
  const [confirmation, setConfirmation] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState(null)
  // The latest runner update result per machine: { [hostId]: result }.
  const [updateResults, setUpdateResults] = useState({})
  const setUpdateResult = (hostId, result) => setUpdateResults(current => ({ ...current, [hostId]: result }))
  // Latest output lines per running command: { [commandId]: { tail } }.
  const [tails, setTails] = useState({})
  const outputCursors = useRef({})
  const [accessLabel, setAccessLabel] = useState('')
  const [accessCommand, setAccessCommand] = useState('')
  const [sharingOpen, setSharingOpen] = useState(false)
  const [accessAgent, setAccessAgent] = useState(false)
  const readySignalled = useRef(false)
  const action = useAction()
  const pending = key => action.pending.includes(key)

  const headers = useCallback((extra = {}) => ({
    Authorization: `Bearer ${token}`,
    ...extra,
  }), [token])

  // Each list polls only while its tab is showing.
  const onMachines = activeTab === 'machines'
  const hosts = usePolledList('/api/connect/hosts', 'hosts', 'Connect', headers, {
    poll: onMachines,
    // Follow pairing and busy machines closely so their results show promptly.
    interval: items => pairing || items.some(host => host.busy) ? 1500 : 5000,
  })
  const outbound = usePolledList('/api/connect/outbound', 'connections', 'Shared access', headers, { poll: onMachines })
  const directory = useSharedDirectory(headers)
  const machinesStale = hosts.status === 'stale'
  const outboundStale = outbound.status === 'stale'

  const selectTab = tab => {
    if (tab === activeTab) return
    setActiveTab(tab)
    setConfirmation(null)
    if (tab === 'shared') directory.list.reload()
  }
  const onTabKeyDown = event => {
    let next
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = activeTab === 'machines' ? 'shared' : 'machines'
    else if (event.key === 'Home') next = 'machines'
    else if (event.key === 'End') next = 'shared'
    else return
    event.preventDefault()
    selectTab(next)
    ;(next === 'machines' ? machinesTab : sharedTab).current?.focus()
  }

  const notices = [hosts, outbound].filter(list => list.notice)
  const noticeTitles = notices.map(list => list.notice.title).join('\n')
  useEffect(() => {
    for (const title of noticeTitles.split('\n').filter(Boolean)) {
      window.mobius.signal('error', { message: title, source: 'load' })
    }
  }, [noticeTitles])

  const loaded = hosts.status !== 'loading' && outbound.status !== 'loading'
  useEffect(() => {
    if (!loaded || readySignalled.current) return
    readySignalled.current = true
    window.mobius.signal('app_ready', { item_count: hosts.items.length + outbound.items.length })
  }, [loaded, hosts.items, outbound.items])

  const runningKey = hosts.items
    .flatMap(host => activeCommands(host).map(command => `${host.id}/${command.id}`))
    .join(',')

  useEffect(() => {
    if (pairing && hosts.items.some(host => host.id === pairing.id && host.online)) {
      setPairing(null)
    }
  }, [hosts.items, pairing])

  useEffect(() => {
    if (confirmation?.kind === 'stop' && !hosts.items.some(host => (
      activeCommands(host).some(command => command.id === confirmation.id)
    ))) setConfirmation(null)
  }, [hosts.items, confirmation])

  // Follow each running command's output while it runs and Machines shows it.
  // Only a Möbius that reports a command list has the output route; older ones
  // show no tail. A hidden tab or a stale list pauses polling but keeps each
  // read position.
  useEffect(() => {
    const running = hosts.items
      .filter(host => Array.isArray(host.active_commands))
      .flatMap(host => host.active_commands.map(command => ({ host, command })))
    const live = new Set(running.map(({ command }) => command.id))
    setTails(current => Object.fromEntries(
      Object.entries(current).filter(([id]) => live.has(id)),
    ))
    const cursors = outputCursors.current
    for (const id of Object.keys(cursors)) if (!live.has(id)) delete cursors[id]
    if (!running.length || !onMachines || machinesStale) return undefined
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
        if (stopped) return
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
  }, [runningKey, headers, machinesStale, onMachines])

  const addMachine = () => action.run('add-machine', async () => {
    const response = await fetch('/api/connect/hosts', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: newName.trim() || DEFAULT_MACHINE_NAME }),
    })
    if (!response.ok) throw await serverError(response)
    setPairing(await response.json())
    setNewName(DEFAULT_MACHINE_NAME)
    setAddingMachine(false)
    window.mobius.signal('item_created', { type: 'machine' })
    await hosts.reload()
  }, 'Couldn’t add this machine.')

  const showCommand = id => action.run(`pairing:${id}`, async () => {
    const response = await fetch(`/api/connect/hosts/${id}/pairing`, { headers: headers() })
    if (!response.ok) throw await serverError(response)
    setPairing(await response.json())
  }, 'Couldn’t refresh the pairing command.')

  const removeMachine = host => action.run(`remove:${host.id}`, async () => {
    const force = host.paired && !host.online ? '?force=true' : ''
    const response = await fetch(`/api/connect/hosts/${host.id}${force}`, { method: 'DELETE', headers: headers() })
    if (!response.ok && response.status !== 404) throw await serverError(response)
    setPairing(current => current?.id === host.id ? null : current)
    hosts.update(items => items.filter(item => item.id !== host.id))
    setExpandedId(null)
    setConfirmation(null)
    window.mobius.signal('item_deleted')
    await hosts.reload()
  }, 'Couldn’t disconnect this machine.')

  const cancelRename = () => {
    setRenameError(null)
    setRenamingId(null)
  }

  const saveRename = host => {
    const name = renameValue.trim()
    if (!name) return setRenameError('Enter a machine name.')
    if (name === host.name) return cancelRename()
    setRenameError(null)
    // A rename failure shows in the row being edited, not in the page banner.
    return action.run(`rename:${host.id}`, async () => {
      try {
        const response = await fetch(`/api/connect/hosts/${host.id}`, {
          method: 'PATCH',
          headers: headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name }),
        })
        if (!response.ok) throw await serverError(response)
        const updated = await response.json()
        hosts.update(items => items.map(item => item.id === host.id ? { ...item, name: updated.name || name } : item))
        setRenamingId(null)
      } catch (cause) {
        setRenameError(failureMessage(cause, 'Couldn’t rename this machine.'))
      }
    })
  }

  const stopCommand = (host, command) => action.run(`stop:${command.id}`, async () => {
    const response = await fetch(cancelCommandPath(host, command), { method: 'POST', headers: headers() })
    if (!response.ok && response.status !== 404) throw await serverError(response)
    setConfirmation(null)
    await hosts.reload()
  }, 'Couldn’t stop this command.')

  // An update reports its outcome in the machine's update panel, not the banner.
  const runRunnerUpdate = host => action.run(`update:${host.id}`, async () => {
    setConfirmation(null)
    setUpdateResult(host.id, null)
    try {
      const response = await fetch(`/api/connect/hosts/${host.id}/exec`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cmd: host.update_command, timeout: 180 }),
      })
      if (!response.ok) {
        const failure = await responseErrorData(response, `Update request didn’t complete (HTTP ${response.status}).`)
        setUpdateResult(host.id, { hostId: host.id, code: failure.code, errorMessage: failure.detail })
        return
      }
      const result = await response.json()
      setUpdateResult(host.id, {
        hostId: host.id,
        exitCode: result.exit_code,
        outcome: result.outcome,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      })
      await hosts.reload()
    } catch (cause) {
      setUpdateResult(host.id, { hostId: host.id, errorKind: 'request', errorMessage: failureMessage(cause, 'Couldn’t update this runner.') })
    }
  })

  const closeSharing = () => {
    setSharingOpen(false)
    setAccessLabel('')
    setAccessCommand('')
    setAccessAgent(false)
  }

  const grantOutboundAccess = () => action.run('grant-access', async () => {
    const response = await fetch('/api/connect/outbound', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ label: accessLabel.trim(), command: accessCommand.trim(), agent: accessAgent }),
    })
    if (!response.ok) throw await serverError(response)
    closeSharing()
    window.mobius.signal('item_created', { type: 'outbound_access' })
    await outbound.reload()
  }, 'Couldn’t grant access.')

  const setOutboundAgent = (connection, agent) => action.run(`agent:${connection.id}`, async () => {
    const response = await fetch(`/api/connect/outbound/${connection.id}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ agent }),
    })
    if (!response.ok) throw await serverError(response)
    await outbound.reload()
  }, 'Couldn’t change full access.')

  const revokeOutboundAccess = connection => action.run(`revoke:${connection.id}`, async () => {
    const response = await fetch(`/api/connect/outbound/${connection.id}`, { method: 'DELETE', headers: headers() })
    if (!response.ok && response.status !== 404) throw await serverError(response)
    setConfirmation(null)
    outbound.update(items => items.filter(item => item.id !== connection.id))
    window.mobius.signal('item_deleted', { type: 'outbound_access' })
    await outbound.reload()
  }, 'Couldn’t confirm that access was revoked.')

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
        {action.error ? <div className="cn-message cn-error">{action.error}</div> : null}
        {notices.map(list => <div className="cn-message cn-notice" key={list.notice.title}>
          <strong>{list.notice.title}</strong>
          {list.notice.message}{list.status === 'stale' ? ' Showing the last successful list; remote actions are paused until it refreshes.' : ''}
        </div>)}
      </div>

      {hosts.status === 'loading' ? <div className="cn-loading" role="status">Loading Connect…</div> : null}

      <div className="cn-tabs" role="tablist" aria-label="Connect sections" onKeyDown={onTabKeyDown}>
        <button className="cn-tab" type="button" role="tab" id="cn-tab-machines" ref={machinesTab} tabIndex={onMachines ? 0 : -1} aria-controls="cn-panel-machines" aria-selected={onMachines} onClick={() => selectTab('machines')}>Machines</button>
        <button className="cn-tab" type="button" role="tab" id="cn-tab-shared" ref={sharedTab} tabIndex={onMachines ? -1 : 0} aria-controls="cn-panel-shared" aria-selected={!onMachines} onClick={() => selectTab('shared')}>Shared Möbius{onMachines && directory.unread > 0 ? <span className="cn-tab-badge" aria-label={`${directory.unread} unread invitations`}>{directory.unread}</span> : null}</button>
      </div>
      <div className="cn-tab-panel" id="cn-panel-machines" role="tabpanel" aria-labelledby="cn-tab-machines" hidden={!onMachines}>
      {hosts.status === 'ready' || machinesStale ? <section className="cn-section cn-section-first" aria-labelledby="cn-machines">
        <div className="cn-section-head">
          <div className="cn-section-heading">
            <h2 className="cn-secttitle" id="cn-machines">Machines you control</h2>
            <span className="cn-count">{hosts.items.length}</span>
          </div>
          <button className="cn-btn cn-btn-ghost cn-btn-sm" onClick={() => setAddingMachine(open => !open)} disabled={machinesStale && !addingMachine}>
            {addingMachine ? 'Cancel' : <><Plus size={16}/>Add machine</>}
          </button>
        </div>

        {addingMachine ? <form className="cn-inline-form cn-machine-form" onSubmit={event => { event.preventDefault(); addMachine() }}>
          <label className="cn-field">
            <span className="cn-label">Name</span>
            <input
              className="cn-input"
              placeholder="My MacBook"
              value={newName}
              maxLength={80}
              autoFocus
              onChange={event => setNewName(event.target.value)}
            />
          </label>
          <button className="cn-btn" type="submit" disabled={pending('add-machine') || machinesStale}>
            {pending('add-machine') ? 'Creating…' : 'Continue'}
          </button>
        </form> : null}

        {pairing ? <PairingPanel
          stale={machinesStale}
          pairing={pairing}
          onDone={() => setPairing(null)}
          onRefresh={() => showCommand(pairing.id)}
        /> : null}

        {hosts.items.length ? <div className="cn-list">
          {hosts.items.map(host => <MachineRow
            key={host.id}
            host={host}
            headers={headers}
            stale={machinesStale}
            expanded={expandedId === host.id}
            deleting={pending(`remove:${host.id}`)}
            removeConfirming={confirmation?.kind === 'remove' && confirmation.id === host.id}
            renaming={renamingId === host.id}
            renameValue={renameValue}
            renameError={renamingId === host.id ? renameError : null}
            saving={pending(`rename:${host.id}`)}
            tails={tails}
            stopConfirmingId={confirmation?.kind === 'stop' ? confirmation.id : null}
            pending={action.pending}
            onExpand={() => {
              setConfirmation(null)
              setRenamingId(null)
              setExpandedId(current => current === host.id ? null : host.id)
            }}
            onPair={() => showCommand(host.id)}
            onRemove={() => removeMachine(host)}
            onRemoveConfirm={() => setConfirmation({ kind: 'remove', id: host.id })}
            onRemoveCancel={() => setConfirmation(null)}
            onRenameStart={() => {
              setConfirmation(null)
              setRenameValue(host.name)
              setRenameError(null)
              setRenamingId(host.id)
            }}
            onRenameChange={value => {
              setRenameError(null)
              setRenameValue(value)
            }}
            onRenameSave={() => saveRename(host)}
            onRenameCancel={cancelRename}
            onStopConfirm={command => {
              setExpandedId(host.id)
              setRenamingId(null)
              setConfirmation({ kind: 'stop', id: command.id })
            }}
            onStopKeep={() => setConfirmation(null)}
            onStop={command => stopCommand(host, command)}
            updateConfirming={confirmation?.kind === 'update' && confirmation.id === host.id}
            updating={pending(`update:${host.id}`)}
            updateResult={updateResults[host.id] ?? null}
            onUpdate={() => {
              setExpandedId(host.id)
              setRenamingId(null)
              setConfirmation({ kind: 'update', id: host.id })
            }}
            onUpdateConfirm={() => runRunnerUpdate(host)}
            onUpdateCancel={() => setConfirmation(null)}
          />)}
        </div> : <div className="cn-empty-row">No machines added.</div>}
      </section> : null}

      {outbound.status === 'ready' || outboundStale ? <OutboundAccess
        connections={outbound.items}
        stale={outboundStale}
        open={sharingOpen}
        label={accessLabel}
        command={accessCommand}
        agent={accessAgent}
        agentSupported={outbound.data?.agent_access === true}
        pending={action.pending}
        confirmingId={confirmation?.kind === 'revoke' ? confirmation.id : null}
        onOpen={() => setSharingOpen(true)}
        onCancel={closeSharing}
        onLabel={setAccessLabel}
        onCommand={setAccessCommand}
        onAgent={setAccessAgent}
        onToggleAgent={setOutboundAgent}
        onGrant={grantOutboundAccess}
        onConfirm={id => setConfirmation({ kind: 'revoke', id })}
        onKeep={() => setConfirmation(null)}
        onRevoke={revokeOutboundAccess}
      /> : null}
      </div>
      <div className="cn-tab-panel cn-shared-panel" id="cn-panel-shared" role="tabpanel" aria-labelledby="cn-tab-shared" hidden={onMachines}>
        <BrowserAccessSection headers={headers} poll={!onMachines} confirmation={confirmation} setConfirmation={setConfirmation}/>
        <SharedWithMe directory={directory}/>
      </div>
    </main>
  </div>
}
