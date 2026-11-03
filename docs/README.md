# Screenshots

Both READMEs reference two files from this folder. Replacing a file under the same name updates both READMEs at once.

## What is committed

| File | State | Where it appears | What it shows |
|---|---|---|---|
| `preview.png` | **present** — 994×931, dark theme, 25 KB, **prompt text mosaicked** | Top of both READMEs | The right Sidebar on the **Turn timeline / 时间目录** tab, with a session spanning two calendar days so both date headers are visible |
| `guide.png` | **present** — 961×1130, dark theme, 70 KB | The **Use / 使用** section of both READMEs | The guide card list inside the right Sidebar, so readers know where to find the tab |

`preview.png` is a real conversation whose prompt column was mosaicked: dates, times and layout are untouched, the words are not. If you replace it with your own capture, redact the prompt text the same way **before** committing — once it is in git history, it is awkward to remove.

`guide.png` needs no redaction: it is the Sidebar's card list and contains no conversation content.

## Worth re-shooting when convenient

- a `preview.png` from a build that includes the `11/2 周一` date spacing (the current capture predates it),
- a crop that keeps ~200 px of the conversation to the left, so the "right sidebar" placement is obvious,
- optionally a light-theme variant, which reads better on GitHub.

## Optional extras

| File | What it should show |
|---|---|
| `jump.png` | The moment after clicking a row: the conversation scrolled to that turn. |
| `preview-dark.png` | The same view in dark mode. |

## Tips

- Take the shots at a window width above 900 px; the shipped turn rail is hidden below that, and the comparison is easier to read when both surfaces are visible.
- Crop to the sidebar plus a slice of the conversation — the plugin only owns the sidebar column.
- Keep each file under ~300 KB so the repository stays light.

## A note for npm

If this package is ever published to npm, relative image paths in the README are rewritten only when `package.json` declares a `repository` field. Until then, the images sit in this folder for GitHub viewers.
