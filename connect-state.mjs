// Lines of live output shown under each running command.
export const TAIL_LINES = 12

export function activeCommands(host) {
  if (Array.isArray(host?.active_commands)) return host.active_commands
  // A Möbius from before parallel commands reports at most one.
  return host?.active_command ? [host.active_command] : []
}

export function statusOf(host) {
  const running = activeCommands(host).length
  if (running > 1) return { cls: 'busy', label: `Working · ${running}` }
  if (running || host?.busy) return { cls: 'busy', label: 'Working' }
  if (host?.online && host?.runner_update_available) {
    return { cls: 'wait', label: 'Update needed' }
  }
  if (host?.online) return { cls: 'on', label: 'Online' }
  if (host?.paired) return { cls: 'off', label: 'Offline' }
  return { cls: 'wait', label: 'Waiting to pair' }
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
