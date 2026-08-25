# Running work on a Connect-paired machine

Read this when the partner asks to do something **on a paired machine** — "on my
machine", "on the server", "on <name>", or pull/build/test/deploy/inspect
something that lives on their laptop, workstation, or box. Connect (app slug
`connect`) pairs external machines with this Möbius instance over a secure tunnel
the machine opens outbound; there are no inbound ports and no SSH keys to manage.

Commands you run normally execute in the Möbius container. Reaching a paired
machine is an explicit bridge — `./mach` — not a mode you enter. There is no way
to make later local commands transparently run on the machine.

## Use `./mach`, not hand-written curl

The Connect app ships a helper at `/data/apps/connect/mach`. It sends ONE command
to a named machine and prints the retained remote stdout/stderr, exiting with the
remote exit code — so it reads like a local shell instead of a curl + JSON
envelope you have to write and parse every time.

```bash
mach=/data/apps/connect/mach
"$mach" --list                                   # machines: name, status, host id
"$mach" -m "My machine" 'ls -la ~/projects'      # run one command on that machine
"$mach" -m laptop 'cd ~/app && git pull && npm test'   # batch multi-step in ONE call
"$mach" -m gpu -t 600 'python train.py'          # raise timeout (default 60s, max 3600)
```

## Always name the machine — and stay consistent

`mach` **requires** `-m <machine>` even when only one machine is paired. This is
deliberate: every command in the transcript records where it ran, and adding a
second machine can never silently redirect commands. `<machine>` matches a name
substring (case-insensitive) or the host id from `mach --list`.

To stay consistent across a multi-step job: at the start, resolve the target
once (from what the partner said, or `mach --list` if unsure) and **state which
machine you're working on** in the chat, then pass that same `-m <name>` on every
call. If the partner named a machine ("on the laptop"), use that name. If several
are online and they didn't say which, infer from context or ask — never guess.

## No hidden state

Each `mach` call is self-contained: no remembered working directory, no "current
machine". If you need a directory or environment, put it in the command
(`cd ~/app && …`). Each call is still one tool round-trip — the wrapper cuts the
per-command *tokens*, not the number of calls; **batch** with `&&`/`;` to cut
round-trips.

## Trust and safety

The runner executes whatever it is given, as the owner, in their environment —
the same trust model as running a coding CLI on that machine. Read-only
inspection is fine to just do; anything destructive or irreversible on their
machine (deleting data, force-push, stopping services, paid actions) waits for
explicit confirmation first.

## When native execution is the better tool

`mach` is the bridge for reaching a machine *from a Möbius chat*. For sustained,
command-heavy work that lives entirely on one machine, running a coding agent
directly on that machine (it has its own shell, no bridge overhead) can be the
better regime. Connect does not try to replace that.

## Fallback / mechanics

`mach` wraps `POST /api/connect/hosts/<id>/exec` with
`{"cmd","timeout","request_id"}`, authorized by the agent token, returning
`{stdout, stderr, exit_code}`. List hosts with `GET /api/connect/hosts`. An
offline machine returns 409; a timeout returns 504. Möbius bounds very large
output; when that happens, `mach` prints the retained output and an explicit
truncation warning. If its connection to Möbius is interrupted, `mach` retries
with the same request id; the server rejoins the existing command or returns
its recently completed result instead of running it again.

Each machine deliberately accepts one command at a time. A second call gets a
clear `409 busy` response instead of entering a hidden queue. Ctrl-C asks a
current runner to stop the exact command and its whole process tree; do not
send another command until `mach` confirms that cancellation or Connect shows
the machine idle. A paired runner that predates cancellation stays single-flight
but cannot be stopped remotely; Connect shows its safe in-place update command.
