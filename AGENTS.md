# AGENTS.md

Working notes for any agent picking this repository up on a fresh machine. Nothing here requires the author's session history: everything is either in the repository or reproducible from the installed DSH.

## What this is

A DSH bundle plugin (`dsh.bundle` + `dsh.client`) with two halves:

- `index.js` — Host projection unit `turnClock` on `ctx.sessionProjections`. Folds `turn/start` (time, seq) and each turn's first human prompt into `{ turns: [{ turn, t, s, p }] }`, published through `wire.view`.
- `client.js` — browser half. Registers a right-Sidebar tab type (`ctx.sidebarRightTabs`), its body under the `sidebar.right.pane.tab` keyed slot, a guide card, and the zh/en dictionaries. Reads `useProjection('turnClock')` and jumps with `ctx.sessions.binding(id).session.loadThrough(seq)` + `scrollIntoView` on the `[data-chat-turn="N"]` row.

No build step. `client.js` is hand-written in the `window.__ModuleLoader__.load({ id, factory })` format and requires nothing but `react` from the module table.

## Install on this machine

```sh
dsh plugin --profile web add github:saltedfish-T/dsh-turn-clock
# or, when working on a local checkout:
dsh plugin --profile web add file:/absolute/path/to/dsh-turn-clock
```

The local form links the directory, so later edits take effect after a page refresh (host-half edits need a DSH restart, because an imported ESM module is not re-imported).

## Verify it actually works

Do not claim success from installation alone. Check, in order:

1. `plugin_manager list_plugins` → the `turn-clock` row shows `fiberPhase: "active"`. If it is not active, the host half failed to load; the projection will be missing.
2. `cordis_inspect_query` on client `Slots.listSubTree` with `root: "sidebar.right.pane.tab"` → an occupant with key `dsh-turn-clock` and `active: true`. That proves the browser module loaded and registered.
3. Visual (needs a person or browser control): right Sidebar → Guide → the **时间目录 / Turn timeline** card → a list of turns grouped by date, each row `HH:mm` + prompt preview.
4. Click an old row that is not in the loaded transcript. Expected: history pages in, the conversation scrolls to that turn.

The panel's own failure strings distinguish the modes:

| Text | Meaning |
|---|---|
| `等待这一会话的时间数据…` | The projection value never arrived — check step 1, then the projection key. |
| `这个位置没有拿到 useProjection` | The slot did not inject the keyed projection hook — the body is registered on the wrong slot. |
| `这一轮还没进到对话里` | Paging ran but no `[data-chat-turn="N"]` row appeared. Usually a compacted turn (see limitations) or a too-short wait. |
| `拉取这段历史的请求失败了` | `loadThrough(seq)` threw. |
| `当前不在对话视图` | The Chat view is not mounted (e.g. the Trajectory view is active). |

## Run the tests

```sh
node --check index.js
node --check client.js
node test/fold.test.mjs    # 10 assertions over the projection fold
```

The test drives the unit through a fake `ctx.sessionProjections`, so it needs no DSH.

## The two internal contracts

Both are third-party dependencies on DSH internals, not documented seams. They can change between DSH releases, and this is how to re-verify them.

1. **`data-chat-turn="<n>"`** — Chat writes the turn number onto every transcript row and reads it back for its own reading-position tracking. If it is renamed, jumps stop finding rows.
2. **`binding.session.loadThrough(seq)`** — the jump loader Chat's own rail uses for turns outside the loaded window. Reached via `ctx.sessions.binding(sessionId)`.

### How to inspect DSH's shipped client code

`app.asar` is an archive: shell tools, `rg`, `glob`, and plain Node cannot see inside it, but the Host's own file reads can. To grep a shipped client bundle, extract it first:

```js
// asar layout: [u32 4][u32 pickleSize][u32 jsonSize][json][file blobs...]
const fd = fs.openSync(ASAR, 'r')
const head = Buffer.alloc(16); readExact(fd, head, 0)
const jsonLen = head.readUInt32LE(12)
const header = JSON.parse(readExact(fd, Buffer.alloc(jsonLen), 16).toString('utf8'))
const base = 16 + jsonLen           // file data starts here; entry.offset is relative to it
```

Then look in `node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js` for `data-chat-turn`, and in `dsh-api-session-controller/lib/client.js` for `loadThrough`. `dsh-session-turn-outline/lib/index.js` is the canonical example of a projection unit and is worth reading before changing the fold.

If either contract is gone, the plugin should keep listing turns (that only needs the projection seam) and report a jump failure in the panel — never throw from the body, because a throwing slot entry blanks the panel.

## Known limitations (inherited, not bugs)

- Turns removed from the session surface by compaction have no DOM row; they stay listed and cannot be jumped to. The built-in rail behaves the same.
- The jump centers the target; Chat's own rail aligns it 24 px below the top edge.
- Day labels come from `Intl.DateTimeFormat` with the browser locale, which is usually but not always the app locale.
- Timestamps are `turn/start` times, i.e. when the loop began the turn — not when a message painted.
