export function statusOf(host) {
  if (host?.busy) return { cls: 'busy', label: 'Working' }
  if (host?.online && host?.runner_update_available) {
    return { cls: 'wait', label: 'Update needed' }
  }
  if (host?.online) return { cls: 'on', label: 'Online' }
  if (host?.paired) return { cls: 'off', label: 'Offline' }
  return { cls: 'wait', label: 'Waiting to pair' }
}

export function commandCapabilities(host) {
  const state = host?.active_command?.state || 'dispatching'
  return {
    canStop: Boolean(host?.active_command?.id),
    stopping: state === 'canceling',
    state,
  }
}

export function cancelCommandPath(host) {
  const hostId = host?.id
  const requestId = host?.active_command?.id
  if (!hostId || !requestId) return null
  return `/api/connect/hosts/${hostId}/commands/${requestId}/cancel`
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
    description: `The button below asks ${name} to uninstall Connect, revokes its access, and removes it from this list.`,
    actionLabel: 'Disconnect machine',
    commandTitle: `Otherwise, run it on ${name}`,
    commandDescription: 'This command performs the same cleanup locally. Use it when Möbius can’t reach the machine.',
  }
}
