---
name: "connect"
description: "Run work on a laptop, workstation, server, or cluster paired through the Connect app."
---

# Run work on a paired machine

Local shell calls run inside Möbius. Use `/data/apps/connect/mach` for a machine
paired through Connect; it sends one self-contained command and returns the
remote output and exit status.

## The three useful forms

```bash
mach=/data/apps/connect/mach
"$mach" --list
"$mach" -m "My machine" 'uname -a'
"$mach" -m "My machine" -C /srv/app 'git status --short'
"$mach" -m "My machine" -- '--command-that-looks-like-a-mach-option'
```

Keep only genuinely simple commands inline. For loops, JSON, templates, nested
quotes, substitutions, or several steps, use a literal script from the first
attempt:

```bash
"$mach" -m "My machine" -C /srv/app --script --shell bash <<'MACH'
set -euo pipefail
docker compose ps --format json
for file in config/*.json; do
  printf '%s\n' "$file"
done
MACH
```

The quoted `MACH` delimiter prevents the local shell from expanding the body.
`mach` carries it literally to the selected remote shell, so do not add a local
`/bin/bash -lc` wrapper or manually escape the whole program. `--script`
defaults to `sh` on POSIX and PowerShell on Windows; use `--shell bash` only for
Bash syntax. Scripts cross the current runner through a literal data boundary;
Connect rejects obsolete runners and shows their saved machines an in-place
update command. `-C` is an exact absolute path on the remote machine.
Use `--` to end `mach` option parsing when the remote command itself begins
with a dash.

Authenticated calls connect directly to the configured Möbius address. `mach`
ignores proxy environment variables and refuses redirects rather than risking
forwarding owner authorization to another destination.

## Operating rules

- Always pass `-m`; resolve it once with `--list`, state the chosen machine,
  and reuse the same name throughout the task.
- Calls have no remembered machine, directory, or environment. Use `-C` and a
  script rather than a growing `cd … && …` one-liner.
- Batch related inspection, but keep failures legible. Label important guards
  instead of relying on a silent `test` under `set -e`.
- Every command has a time limit: 60 seconds unless you pass `-t <seconds>`
  (anything up to a year). At the limit the machine terminates the command and
  its whole process tree, reported as exit 124. Before starting anything slower
  than a quick inspection — builds, deploys, installs, downloads, test suites —
  pass a generous `-t` up front; a killed build is not a partial success.
- Output streams while the command runs. If your tool kills `mach` before the
  command finishes, the command keeps running: `"$mach" -m <machine>
  --commands` lists running ids and `"$mach" -m <machine> --attach <id>`
  resumes with its latest output and exit status. Attach instead of starting
  the work again. For work longer than your tool-call limit, expect to attach.
- A machine with a current runner runs several commands at once, so you can
  inspect it while a long command runs. Each command is independent; Connect
  never queues one behind another. Coordinate conflicting work yourself — two
  deploys on the same machine still conflict.
- An older runner runs one command at a time and answers busy instead; its
  saved machine shows an update command in Connect.
- Read-only inspection needs no extra approval. Destructive, irreversible,
  paid, or externally visible actions still require the partner's explicit
  confirmation.
- Ctrl-C (SIGINT) asks the runner to stop the exact command and its process
  tree; being killed does not. Ctrl-C while attached only stops following.
  Before re-running work you stopped, confirm with `--commands` that it is no
  longer running.

- When another Möbius granted this one access with **Full access**, commands
  on that machine already carry its agent sign-in:
  `"$mach" -m "Their Möbius" 'mapi /api/platform/status'` calls *that* instance's API as its
  agent. It is never the owner there, so owner cards still need that owner.

For sustained work made up of many remote commands, prefer a coding agent
running directly on that machine rather than turning `mach` into a high-latency
interactive shell.
