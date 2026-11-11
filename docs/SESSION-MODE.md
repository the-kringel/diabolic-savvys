# Session mode: design spec

Status: agreed 2026-11-11. Built and live-checked: the progress bar fix (§8), session workers in the panel and the raised hand (§3). Not built yet: ETA, stall detection, the savvy-flow session mode (§1, §2, §4–§7) and cost per session (§9).

The main session acts as an **orchestrator**. It plans the work and sends each piece either to a **side session** (started with `start_session`) or to a **subagent**. It keeps the main chat down to short status lines and decisions. savvy-progress shows both kinds of worker in one panel.

## 1. Session or subagent: the rule the orchestrator follows

**A session for each deliverable, a subagent for each question.**

| Send it to a **session** when | Send it to a **subagent** when |
| --- | --- |
| it ends in something of its own: a branch, PR, asset, balance pass | the orchestrator needs the result in this turn (research, exploring code, review, tests) |
| it may need the user's approval or a decision partway through | it is short and fully specified, and will not need the user |
| the user may want to watch, steer or take it over | it is a parallel fan-out (swarm, tester) |
| it runs longer than a few minutes | nothing about it needs to outlive the turn |

Both keep the main context small: a subagent returns a summary, a session returns a short note. The choice is about what kind of work it is, not about tokens.

## 2. Model and effort

- The orchestrator picks model and effort per worker. It never goes **above the main session's** model or effort unless the user asks for it.
- Going lower is encouraged where the work allows it: Sonnet for narrow tasks and testing, Opus at low effort for mechanical work.
- Sessions: `start_session` with `model`, then `set_session_effort`. Subagents: the existing savvy tiers.

## 3. The panel: one worker card for both kinds

- **The same heroes for both.** The hero follows the **tier, set by model and effort** (Barbarian = Opus/medium, Paladin = Opus/high, Assassin = Opus/low, Mercenary = Sonnet …), whether the worker is a session or a subagent.
- Each card carries a small **`session` / `subagent`** label.
- A card shows: title, hero/tier, model and effort, the current step note, `done/total`, an **ETA** ("~8 min"), its state, and cost.
- **The title is the click target.** A session's title asks the app to show that session (`open_session_in`, `focus`, then `split`; a toast points to the sidebar if the app refuses). A subagent's title opens its transcript (`$.ui.view`). Hovering anywhere on the row, hero included, lights the title in the accent colour: the row and the title share one hover group.
- Why not the hero itself: the desktop draws a worker's drawing (`Svg`) as an image that takes no click, and the clickable custom region (`Client`) cannot hold drawings. A `claude://` link is drawn as plain text, too: the desktop panel only makes `https:` links clickable.
- **ETA**: from the worker's own pace (time per step reported so far × steps left), blended with past run times per tier kept in `$.store`. Always approximate, never an exact time.
- **Stall detection**: a running worker with no step report for X minutes (default 10) gets a ⚠. The orchestrator can then send it a message.

### The raised hand

Every desktop session that runs savvy-progress writes its own state to `~/.claude/savvy-progress/sessions/<local_…>.json`: `running | waiting | idle`, plus `reason`, its steps, its model and its parent. The ID is the app's, from `CLAUDE_CODE_HOST_SESSION_ID`. One file per session, so concurrent writers never overwrite each other (the lesson from the savvy-api EPERM fix). The orchestrator reads them every 2 s.

- `waiting` is set when a **permission dialog actually opens** (`classic.PermissionRequest`) and while an `AskUserQuestion` is open. A `tool.check` of `ask` is not used: in auto mode that goes to the classifier, not to a person, and raised false alarms.
- The orchestrator's panel draws that worker's hero **with a waving hand**, starts its title with ✋, and shows the reason in amber ("needs you: Bash: git push"). It sends one native notification per wait.

**How the orchestrator finds its side sessions.** The app gives a side session no parent ID in its environment, and a card the person clicks starts a session without a `start_session` call the panel could see. So every brief the orchestrator sends gets one line, `(savvy-progress: parent local_… key …)`. On its first turn the side session copies parent and key into its status file. The orchestrator scans the folder for files that name it as parent and looks up title, model and effort it kept under the key. Starting directly, from "start it", or from a clicked card all work the same way.

**Only the session the person talks to can start sessions.** A session asked to start one by another session's brief gets a card instead. So the orchestrator is always the session the person talks to, never a side session.

## 4. Decisions: answerable from either side

- **Questions and design decisions** a side session needs: the side session ends its turn with the question, and its note reaches the orchestrator. The orchestrator puts it in its **normal decision box** with a short background ("Session *18-R4-BAL* asks: …"). The user answers **either** in the main session (the orchestrator forwards the answer with `send_message`, quoting the user's words) **or** directly in the side session. Whichever answer comes first wins; the orchestrator then drops its pending question.
- **Tool permission prompts** (allow this Bash command, this push …) are answered **in the side session**: the raised hand plus a one-click jump. The main session does not approve them on the side session's behalf, because a model approving its own workers' permissions would bypass the permission system. To keep such prompts rare, side sessions start in `auto` mode where the user allows it.
- **No sidebar workaround.** No fake groups and no unread dots: the orchestrator reports what is done, and the panel shows what is waiting.

## 5. A clean main chat

The orchestrator writes one line per event and nothing more:

```
▶ 18-R4-BAL Ring IV balance: session · Barbarian (Opus/medium)
✓ 17-GW-G the Gravewright's gates: done → PR #41
✋ 18-R4-MON build: needs you: "Keep the Rope-Drowned at 3 HP or 4?"
```

Everything else (steps, ETA, cost) lives in the panel. Decisions go to the decision box.

## 6. Waves

- The orchestrator keeps at most **N side sessions running** (default 4) and starts the next queued one when one finishes.
- One writer per set of files: sessions that write code each get their own worktree.

## 7. Cleanup after work is done (approved by the user)

When a side session's PR is merged, the orchestrator, without asking again:

1. archives the side session (`archive_session`);
2. removes its worktree (`clean_up_worktrees` / `git worktree remove`);
3. deletes the merged branch locally and on the remote (`git branch -d`, `git push origin --delete`), **only if it is fully merged** into the default branch;
4. runs `git fetch --prune` and `git worktree prune`.

The orchestrator never deletes unmerged branches, branches it did not create, or anything with uncommitted changes. It reports those instead.

## 8. The progress bar (fix)

Today the bar's total comes only from the orchestrator's `progress` call (`hooks/register.tsx` `total`), so it shows **0/0 while workers run**. New rule:

- **total = workers the panel can see** (running + waiting + done + failed, sessions and subagents) **+ planned tasks that have no worker yet**;
- **done = accepted tasks** from the orchestrator. Where nothing is reported, **finished workers**.

The bar is never empty while a worker runs.

## 9. Cost per session

Session cost comes from `get_usage` / the session's own report, shown on its card and summed in the header. Useful to see whether the cheaper-model runs actually save money.

## Build order

1. **Prototype the status handoff**: per-session status files and polling from the orchestrator. Confirm that a side session's state shows up within ~2 s.
2. **Fix the progress bar** (§8). Independent of everything else; can ship right away.
3. **Session workers in the panel**: same heroes, label, click to open, ETA, stall ⚠.
4. **The raised hand** and the native notification.
5. **savvy-flow session mode**: the routing rule (§1), effort cap (§2), one-line chat (§5), decision forwarding (§4), waves (§6), cleanup (§7).
6. Cost per session (§9).
