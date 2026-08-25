# Connect

Pair an external machine — your laptop, a workstation, or an HPC login node —
with this Möbius instance, so the in-product agent can run things on it from any
device.

## How it works

Möbius stays on its own always-on server. A tiny **runner** (pure Python
stdlib, no dependencies) runs on the target machine and dials *outbound* to this
instance over ordinary HTTPS, holding an event stream open. The current runner
cleanly renews that stream every ten minutes, before common hosting response
limits, while any command keeps running independently. The agent (or this app)
can then run commands on that machine through it. No open ports, no VPN, no
relay account — the machine calls home using the operating system's standard
HTTPS and proxy behavior.

Your Möbius server is the owner-trusted rendezvous, so there is no separate
relay account or service. Each machine authenticates with a per-host bearer
token minted at pairing.

## Pairing

1. In this app, name a machine and tap **Add**.
2. Run the shown one-line command on that machine (`curl … | python3 -`).
3. It appears here as **Online**.

For an online machine, **Disconnect machine** asks the runner to uninstall
itself, revokes its access, and removes the saved connection. Connect also shows
the equivalent local command as a fallback when Möbius cannot reach the machine:

```sh
python3 ~/.mobius-connect/runner.py --uninstall
```

Running that command on the machine removes its local service and, when the
Möbius server is reachable, revokes the saved connection too. If an offline
machine is permanently unavailable, **Remove saved connection** revokes its
access and removes it from the app, but cannot remove the local service files.

## Command lifecycle

Online and available are distinct. Connect shows **Working** while a machine is
running one command and rejects parallel work rather than hiding it in a queue.
Stopping a command terminates the shell and every process it started. A command
that is not acknowledged promptly expires before the runner is allowed to
spawn it, so caller timeouts cannot become delayed side effects.

Commands keep one stable identity while the runner reconnects. The runner
retains an unsent result until Möbius accepts it, and Möbius retains the
active command plus a short-lived completed result so a lost caller can retry
without repeating the work. A routine ten-minute stream renewal therefore does
not impose a ten-minute command limit. Command text is discarded from durable
state as soon as execution starts.

Older paired runners continue to work in single-flight mode. Connect offers an
in-place update command before it enables remote cancellation for them.
