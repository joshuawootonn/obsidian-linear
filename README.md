# Obsidian Linear

Obsidian Linear connects Linear issue links to Markdown tasks inside an Obsidian vault.

## What it does

- Turns pasted Linear issue URLs into Markdown task items.
- Renders Linear issue links with a richer card that shows the issue title and current status.
- Supports multiple Linear workspaces by mapping each workspace slug to a personal API token.
- Syncs Linear completion state into Obsidian checkboxes and pushes checkbox changes back to Linear.
- Refreshes the active note automatically when you focus it.

## How workspace tokens work

Linear personal API tokens are workspace-scoped. This plugin extracts the workspace slug from each issue URL:

```text
https://linear.app/type-the-word/issue/TYP-37/reach-out-to-these-people-after-the-google-classroom-trial
```

In the example above, `type-the-word` is the workspace slug. Add that slug and its token in **Settings -> Obsidian Linear**.

If a note contains a Linear link for a workspace that is not configured yet, the preview card shows a missing-connection message. Clicking that card opens the plugin settings so you can add the token.

## Task format

Pasted and normalized tasks use inline Markdown links:

```md
- [ ] [TYP-50](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner-and-ask-him-to-connect-you-with-the-school-his) Text Matt Penner and ask him to connect you with the school his daughter goes to
```

Older two-line tasks are still recognized and will be migrated to the inline-link format the next time the plugin refreshes the note.

## Development setup

1. Install dependencies:

```bash
pnpm install
```

2. Build in watch mode:

```bash
pnpm dev
```

3. Install into a local vault:

```bash
pnpm install:vault /absolute/path/to/your/vault
```

The install script creates or updates:

```text
<vault>/.obsidian/plugins/obsidian-linear
```

By default it symlinks the project folder into the vault for fast local iteration. Use `--copy` if you want to copy built artifacts instead:

```bash
pnpm install:vault /absolute/path/to/your/vault --copy
```

## Commands

- `Paste links as tasks`
- `Refresh linked issue statuses in current file`
- `Sync linked issue statuses across vault`
- `Open workspace settings`

## Sync behavior

- Checked tasks are pushed to a completed Linear workflow state.
- Unchecked tasks reopen the issue using the last known open state when possible.
- Polling defaults to every 5 minutes and can be turned off in settings.
- Manual refresh commands are available if you want to avoid background polling.
- Opening a note refreshes linked issues in that file automatically.
- In Reading view and Live Preview, linked tasks render a status icon inline before the issue ID without changing the Markdown source.
- Plain Source mode keeps the raw Markdown text without rendered icons.

## Release artifacts

Obsidian community plugins need these files at the top level of the plugin folder:

- `manifest.json`
- `main.js`
- `styles.css`
