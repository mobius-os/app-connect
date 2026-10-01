// Lines of live output shown under each running command.
export const TAIL_LINES = 12

export function activeCommands(host) {
  if (Array.isArray(host?.active_commands)) return host.active_commands
  // A Möbius from before parallel commands reports at most one.
  return host?.active_command ? [host.active_command] : []
}

export function platformLabel(platform) {
  if (!platform) return ''
  if (/^(darwin|macos|mac os)/i.test(platform)) return 'macOS'
  if (/^windows/i.test(platform)) return 'Windows'
  if (/^linux/i.test(platform)) return 'Linux'
  return platform
}

export function statusOf(host) {
  const running = activeCommands(host).length
  if (running > 1) return { cls: 'busy', label: `Working · ${running}` }
  if (running || host?.busy) return { cls: 'busy', label: 'Working' }
  if (host?.online) return { cls: 'on', label: 'Online' }
  if (host?.paired) return { cls: 'off', label: 'Offline' }
  return { cls: 'wait', label: 'Waiting to pair' }
}

// Updating a runner can restart the service that would report the installer’s
// exit status. Confirm that update from a fresh, current runner connection;
// never reinterpret a lost ordinary command as successful.
export function runnerUpdateFeedback(host, result, stale = false) {
  if (!result || result.hostId !== host?.id) return null
  const feedback = (tone, message, retry = false) => ({ tone, message, retry })
  if (result.code === 'host_busy') {
    return feedback('waiting', 'Another command is using this machine. When it finishes, try again; nothing was changed.', true)
  }
  if (result.code === 'command_expired' || result.outcome === 'expired') {
    return feedback('waiting', 'The machine didn’t start the update before it expired. Nothing ran; try again.', true)
  }
  if (result.errorMessage) return feedback('error', result.errorMessage)
  if (result.outcome === 'timed_out') {
    return feedback('error', 'The update timed out. Check the machine before trying again.')
  }
  if (result.outcome === 'canceled') return feedback('error', 'The update was canceled.')

  const currentRunner = !stale && host.paired === true && host.online === true
    && host.runner_update_available === false
  if (result.outcome === 'lost') {
    return currentRunner
      ? feedback('success', 'Runner updated and reconnected. The installer’s final report wasn’t received.')
      : feedback('waiting', 'The update’s final result wasn’t reported. Connect has not confirmed a current runner; check the machine before retrying.')
  }
  if (result.exitCode !== 0) {
    return feedback('error', `Update command failed (exit ${result.exitCode}). Review the command result and try again.`)
  }
  if (currentRunner && (result.outcome === 'completed' || !result.outcome)) {
    return feedback('success', 'Runner updated and reconnected.')
  }
  return feedback('waiting', 'Installer finished; Connect has not confirmed the updated runner yet.')
}

export function commandCapabilities(command) {
  const state = command?.state || 'dispatching'
  return {
    canStop: Boolean(command?.id),
    stopping: state === 'canceling',
    state,
  }
}

function commandPath(host, command, suffix) {
  const hostId = host?.id
  const requestId = command?.id
  if (!hostId || !requestId) return null
  return `/api/connect/hosts/${hostId}/commands/${requestId}/${suffix}`
}

export function cancelCommandPath(host, command) {
  return commandPath(host, command, 'cancel')
}

export function outputPath(host, command, after) {
  const path = commandPath(host, command, 'output')
  return path ? `${path}?after=${after}` : null
}

// Keep only the current server-bounded page in the UI. A cursor advances by
// sequence number, not by chunk count (gaps can exist in older output).
export function outputPage(view, after) {
  if (!Array.isArray(view?.chunks) || !Number.isSafeInteger(view.next)
      || view.next < after || typeof view.has_more !== 'boolean') {
    throw new Error('Connect returned an invalid output page.')
  }
  if (view.has_more && view.next <= after) {
    throw new Error('Connect did not advance the output page. Try again later.')
  }
  return {
    text: view.chunks.map(chunk => chunk.text || '').join(''),
    next: view.next,
    hasMore: view.has_more,
    complete: view.output_complete === true,
    preview: [view.result?.stdout, view.result?.stderr].filter(Boolean).join('\n'),
  }
}

// Characters kept even when output has no line breaks.
export const TAIL_CHARS = 4000

// Fold newly delivered chunks into the last few lines of a command's output.
export function appendTail(tail, chunks, maxLines = TAIL_LINES, maxChars = TAIL_CHARS) {
  const text = (tail || '') + (chunks || []).map(chunk => chunk.text).join('')
  const lines = text.split('\n')
  const trailingNewline = lines.length > 1 && lines[lines.length - 1] === ''
  const kept = lines.slice(trailingNewline ? -(maxLines + 1) : -maxLines).join('\n')
  return kept.length > maxChars ? kept.slice(-maxChars) : kept
}

export function disconnectPresentation(host) {
  const name = host?.name || 'this machine'

  if (!host?.paired) {
    return {
      title: `${name} hasn’t paired yet`,
      description: 'Show a fresh pairing command, or remove this saved entry.',
      actionLabel: 'Remove machine',
      commandTitle: null,
      commandDescription: null,
    }
  }

  if (!host?.online) {
    return {
      title: `${name} is offline`,
      description: 'Möbius can’t ask it to uninstall Connect right now.',
      actionLabel: 'Remove saved connection',
      commandTitle: `Remove Connect on ${name}`,
      commandDescription: 'Run this command on the machine to remove the local service. Then remove its saved connection here.',
    }
  }

  return {
      title: `Disconnect ${name}?`,
      description: 'You’ll confirm before Connect is uninstalled and this saved connection is removed.',
    actionLabel: 'Disconnect machine',
    commandTitle: `Otherwise, run it on ${name}`,
    commandDescription: 'This command performs the same cleanup locally. Use it when Möbius can’t reach the machine.',
  }
}
