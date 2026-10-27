# Customizing

## Change a worker's model or effort

Edit the frontmatter in `plugins/savvy-flow/agents/<agent>.md`:

```yaml
model: opus              # opus, sonnet, haiku, or a full ID such as claude-sonnet-5-5
effort: medium           # low, medium, high, xhigh
```

Then update the matching row in two places so the docs and the panel agree:

- the tier table in `plugins/savvy-flow/skills/savvy-flow/SKILL.md`, section 3;
- `TIER_MODEL` in `plugins/savvy-progress/hooks/register.tsx` (the label shown for planned tasks).

## Change how the orchestrator picks tiers

Everything lives in section 3 ("Tiering") of `SKILL.md`: the paragraph under the heading sets the defaults, the heuristics below the table set the tie-breakers. Section 5 sets how failed tasks escalate.

## Add a worker

1. Copy an agent file in `plugins/savvy-flow/agents/` to `savvy-<name>.md`, and change `name`, `description`, `model`, `effort` and the rules. Keep the `savvy-` prefix: the panel only recognizes `savvy-*` agents as tiers.
2. Add it to SKILL.md: section 0 (list of workers), the tier table, and a heuristic saying when to use it.
3. In `plugins/savvy-progress/hooks/register.tsx`:
   - add `<name>: '#RRGGBB'` to `TIER_COLOR`;
   - add `<name>: ['Model', 'effort']` to `TIER_MODEL`;
   - add a costume to `COSTUMES` (next section). Without one, the worker shows as a plain crab.
4. Bump the versions in both `plugin.json` files and `.claude-plugin/marketplace.json`, and add a CHANGELOG entry.

## Draw a hero

Costumes are 30×26 pixel art on top of the shared crab body. In `COSTUMES`, a costume is a function `(f, t) => { ... }`:

- `crabBody(f, -4)` draws the crab; `-4` raises the right claw to hold a prop.
- `f(x, y, w, h, color, cls?)` fills a rectangle.
- `stamp(f, x, y, rows, palette, cls?)` draws rows of characters, one pixel each; `.` is transparent and every other character maps to a color in `palette`.
- `t` is the tier color; use it for one accent so heroes stay recognizable.
- `cls` puts pixels in a named group that you can animate. Add the animation to `CRAB_CSS` as `.c-<name>.run .<cls>{animation: ...}`. Groups `la`/`lb` are the legs and `bd` the body.

Keep `prefers-reduced-motion` working: `CRAB_CSS` already stops every animation under it.

After changing heroes, copy the costume into `docs/gen-lineup.js` and run `node docs/gen-lineup.js` to regenerate `docs/lineup.svg`.

## Test your changes

```bash
claude plugin validate plugins/savvy-flow
```

```bash
claude plugin validate plugins/savvy-progress
```

The mod's tests (`hooks/*.test.ts*`) need Claude Code's mod test harness (`claude-code/testing`), so they only run inside Claude Code's mod tooling. To see changes for real, load the plugin folders by hand (see the README) and start a new session.
