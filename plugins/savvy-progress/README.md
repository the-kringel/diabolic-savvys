# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward without toggling): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each savvy tier, dressed as a Diablo 2 class, animates its prop: the Sorceress floats while her staff's orb pulses, the Druid sways his leafy staff, the Paladin swings his sword behind a kite shield, the Barbarian chops with his double axe, the Assassin runs at double pace with a fluttering sash. Sonnet swarm workers are Desert Mercenaries from Lut Gholein whose spears thrust, and the Sonnet tester is Deckard Cain, whose cane taps while his Identify scroll glows. Explore agents are Amazons who tilt their bow, and other agents are Necromancers whose skull wand glows; the crab on the progress bar stays undressed. `prefers-reduced-motion` stops them.
- **Neon ravers**: Gemini Neon workers run by [savvy-limits](../savvy-limits) dress for a 90s techno rave. The Glowstick Kid (low) waves a glow stick, the Acid Raver (medium) waves two, the Vinyl DJ (high) spins a record, and the Laser Boss (xhigh) runs twin lasers and a live equalizer.
- **Hydrogen water crew**: the Raindrop Scout (low) keeps dry under an umbrella, the Wave Rider (medium) carries a surfboard, the Deep Diver (high) swings a lantern among rising bubbles, and the Tide King (xhigh) raises a trident over a rippling tide.
- **Argon lab**: the Lab Assistant (low) taps a clipboard, the Chemist (medium) swirls a bubbling flask, and the Plasma Professor (high) holds a glowing argon globe while sparks jump.
- **Side sessions as workers** (Claude Code desktop): a session this one starts with `start_session`, directly or from a proposal card you click, joins the panel as a worker. Its hero comes from its model and effort, as a subagent's does, and each row is labelled `session` or `subagent`. Click a worker's title to open it: a session switches the app to that session, a subagent opens its transcript. Hovering the row lights the title.
- **The raised hand**: while a side session waits for you (a permission dialog or a question), its hero waves a hand, its title starts with ✋, an amber line says what it waits for, and you get one notification. Auto-mode decisions raise no hand.
- **Time left and stalls**: a running worker shows an estimate of the time left (`~6 min left`) from its own pace over its reported steps, blended with how long its tier's last runs took (kept across sessions); a worker with no steps gets an estimate from its tier's history once it has three runs. A running worker with no sign of progress for over 10 minutes gets an orange `⚠ no progress for 12 min` line.
- **Cost per session**: a side session reports what it has used, its own subagents included, so its row shows cost, tokens and context fill like a subagent's, and the panel's totals include it.

**Only with savvy-flow.** Side sessions show here, open the panel and raise notifications only while a savvy-flow runs; the bar appears only for a flow, and the panel opens by itself only for savvy workers (or any subagent with `autoOpen: any`). Outside a flow the mod adds nothing to the system prompt and stays out of the way. For a panel of every subagent and side session, flow or not, use [Site crew](https://github.com/the-kringel/Site-crew).

How side sessions report: a session another one started asks the app who its parent is and writes its state to `~/.claude/savvy-progress/sessions/<session id>.json`; the orchestrator reads the files that name it as parent every 2 seconds while a flow runs. The design is in [docs/SESSION-MODE.md](../../docs/SESSION-MODE.md).

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks. Only the main session can: a call from a subagent is ignored, so a worker cannot rename, finish or reset the flow.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A side session can call it in its own loop too; its steps then show on its row in the orchestrator's panel. A worker that does not report shows its context fill in grey instead. The tool is listed up front rather than behind ToolSearch, and each `savvy-*` worker gets one line at the end of its brief asking for these reports.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate, which is what Claude Code writes on a subscription; a session that writes 5-minute entries is overestimated there.

## Settings

`language`: `auto` (default), `en`, `ru` or `he`. Hebrew draws the bar and the panel right to left. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

`autoOpen`: `savvy` (default) or `any`. With `savvy` the panel opens by itself when a `savvy-*` worker starts or a plan is reported. With `any` it also opens, once per session, when any other subagent starts. `/agents-info` toggles it either way.

Install instructions are in the [repository README](../../README.md).
