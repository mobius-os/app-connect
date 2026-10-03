import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from '@openai/apps-sdk-ui/components/Icon'
import { INITIAL_LIST, failureMessage, loadConnectionList, nextList } from './connect-api.mjs'

// Load a list once, then keep it fresh while `poll` is on and the page is visible.
// `interval` may depend on the current items.
export function usePolledList(url, field, label, headers, { interval = 5000, poll = true } = {}) {
  const [list, setList] = useState(INITIAL_LIST)
  const sequence = useRef(0)
  const started = useRef(false)

  const reload = useCallback(async () => {
    const request = ++sequence.current
    const result = await loadConnectionList(url, field, label, headers())
    if (request === sequence.current) setList(previous => nextList(previous, result))
  }, [url, field, label, headers])

  // A local change supersedes any read that is already in flight.
  const update = useCallback(change => {
    sequence.current += 1
    setList(previous => ({ ...previous, items: change(previous.items) }))
  }, [])

  const unsupported = list.status === 'unsupported'
  const every = typeof interval === 'function' ? interval(list.items) : interval
  useEffect(() => {
    if (unsupported || (!poll && started.current)) return undefined
    started.current = true
    reload()
    if (!poll) return undefined
    const tick = () => { if (!document.hidden) reload() }
    const timer = setInterval(tick, every)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      sequence.current += 1
    }
  }, [poll, every, unsupported, reload])

  return { ...list, reload, update }
}

// Run user actions by key: a key cannot run twice at once, and a failure shows
// the server's reason or, when there is none, the caller's fallback.
// Resolves to whether the action succeeded.
export function useAction() {
  const [pending, setPending] = useState([])
  const [error, setError] = useState(null)
  const running = useRef(new Set())

  const run = useCallback(async (key, task, fallback) => {
    if (running.current.has(key)) return false
    running.current.add(key)
    setPending([...running.current])
    setError(null)
    try {
      await task()
      return true
    } catch (cause) {
      setError(failureMessage(cause, fallback))
      return false
    } finally {
      running.current.delete(key)
      setPending([...running.current])
    }
  }, [])

  return { pending, error, run }
}

function selectContents(event) {
  const range = document.createRange()
  range.selectNodeContents(event.currentTarget)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
}

export function CopyCommand({ command, what = 'command' }) {
  const [state, setState] = useState('idle')
  const resetTimer = useRef(null)
  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const copy = async () => {
    clearTimeout(resetTimer.current)
    const copied = await window.mobius?.clipboard?.writeText(command)
    setState(copied ? 'copied' : 'failed')
    if (copied) resetTimer.current = setTimeout(() => setState('idle'), 2000)
  }

  return <>
    <div className="cn-code-row">
      <code className="cn-code" onClick={selectContents}>{command}</code>
      <button className={`cn-btn cn-btn-ghost cn-copybtn${state === 'copied' ? ' is-copied' : ''}`} onClick={copy}>
        {state === 'copied' ? <><Check size={17}/>Copied</> : <><Copy size={17}/>Copy {what}</>}
      </button>
    </div>
    {state === 'failed' ? <div className="cn-hint" role="status">
      Copy didn’t work on this device. Tap and hold the {what} to copy it.
    </div> : null}
  </>
}

// The trigger becomes the confirm button in place, with Not now beside it.
export function InlineActionConfirm({
  open, triggerLabel, confirmLabel, confirmingLabel, onOpen, onCancel,
  onConfirm, disabled = false, confirming = false,
  triggerClass = 'cn-btn cn-btn-sm cn-btn-danger', tone = 'danger',
}) {
  const confirmClass = `cn-btn cn-btn-sm${tone === 'danger' ? ' cn-btn-danger' : ''}`
  return <div className="cn-inline-confirm">
    <button
      className={`${open || confirming ? confirmClass : triggerClass} cn-inline-action`}
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

// The one copy for a list that is loading, kept from an earlier refresh, or missing.
export function ListNote({ list, loading, failed }) {
  const text = list.status === 'loading' ? loading
    : list.status === 'stale' ? 'Showing the last successful list. Changes are paused until it refreshes.'
      : list.status === 'failed' ? failed : null
  return text ? <p className="cn-browser-note" role="status">{text}</p> : null
}
