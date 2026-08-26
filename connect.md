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
Bash syntax. Updated runners receive the script through a literal data boundary;
older paired runners use a compatibility wrapper until they are updated. `-C`
is an exact absolute path on the remote machine.

## Operating rules

- Always pass `-m`; resolve it once with `--list`, state the chosen machine,
  and reuse the same name throughout the task.
- Calls have no remembered machine, directory, or environment. Use `-C` and a
  script rather than a growing `cd … && …` one-liner.
- Batch related inspection, but keep failures legible. Label important guards
  instead of relying on a silent `test` under `set -e`.
- Each machine accepts one command at a time. A busy response never queues work;
  wait for completion or stop the active command in Connect.
- Read-only inspection needs no extra approval. Destructive, irreversible,
  paid, or externally visible actions still require the partner's explicit
  confirmation.
- Ctrl-C asks a current runner to stop the exact command and its process tree.
  Do not send another command until cancellation is confirmed or Connect shows
  the machine idle.

For sustained work made up of many remote commands, prefer a coding agent
running directly on that machine rather than turning `mach` into a high-latency
interactive shell.
