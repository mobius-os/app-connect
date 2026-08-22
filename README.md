# Connect

Pair an external machine — your laptop, a workstation, or an HPC login node —
with this Möbius instance, so the in-product agent can run things on it from any
device.

## How it works

Möbius stays on its own always-on server. A tiny **runner** (pure Python
stdlib, no dependencies) runs on the target machine and dials *outbound* to this
instance over TLS, holding an SSE command channel open. The agent (or this app)
can then run commands on that machine through it. No open ports, no VPN, no
account — the machine calls home.

Your Möbius server is the owner-trusted rendezvous, so there is no separate
relay account or service. Each machine authenticates with a per-host bearer
token minted at pairing.

## Pairing

1. In this app, name a machine and tap **Add**.
2. Run the shown one-line command on that machine (`curl … | python3 -`).
3. It appears here as **Online**.

Remove a machine here to revoke its token immediately.

## Status

v0.1 supports pairing, live online/offline status, and agent-driven command
execution. The runner runs commands as you, in your environment — the same
trust model as running a coding CLI locally.
