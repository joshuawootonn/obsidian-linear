# Obsidian Linear

Obsidian Linear connects Linear issue links to Markdown tasks inside an Obsidian vault.

## What it does

- Turns pasted Linear issue URLs into Markdown task items.
- Renders Linear issue links with a richer card that shows the issue title and current status.
- Uses Linear workflow colors and Linear-style status category icons.
- Embeds a historical daily view of issues planned in a `Today` status and issues completed that day.
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

## Daily view and historical snapshots

Add a `linear-day` block to a daily note:

````md
```linear-day
date: 2026-08-17
status: Today
workspace: type-the-word
```
````

- `date` defaults to a `YYYY-MM-DD` daily note filename, then to the current local date.
- `status` defaults to `Today`.
- `workspace` can be omitted when exactly one workspace is connected.
- The view contains every assigned issue observed in the configured status plus every assigned issue completed during that local calendar day.
- Select an issue's colored status control to move it to any workflow state available for its Linear team.
- While the current-day view is open, it refreshes every five minutes. Observed plan membership is append-only, so moving an issue later does not rewrite history.
- Snapshots are stored in plugin data and mirrored into an invisible `obsidian-linear-day-snapshots` HTML comment in the note for portability and recovery.

The plugin can only record status membership that it observes while Obsidian has the view open. Completed issues are queried by Linear's `completedAt` timestamp and can be reconstructed later.

## Development setup

1. Install dependencies:

```bash
pnpm install
```

2. Build in watch mode:

```bash
pnpm dev
```

3. Configure your local vault and switch it to local build mode:

```bash
pnpm setup:vault /absolute/path/to/your/vault
```

This stores the vault path in `.obsidian-dev.json` and points:

```text
<vault>/.obsidian/plugins/obsidian-linear
```

at this repo-local plugin output folder:

```text
<repo>/.obsidian/plugins/obsidian-linear
```

## Local vs Synced Mode

- Local build mode: `<vault>/.obsidian/plugins/<plugin-id>` is a symlink to `<repo>/.obsidian/plugins/<plugin-id>`, so local builds from this repo are what Obsidian loads.
- Synced static mode: `<vault>/.obsidian/plugins/<plugin-id>` is restored to a normal directory so Obsidian Sync can manage it again.
- When switching away from a real synced plugin folder, backups are stored under `<vault>/.obsidian/plugin-backups/<plugin-id>/`.

Use these commands:

```bash
just setup-vault /abs/vault/path
just dev
just plugin-status
just use-local
just use-synced
```

`just setup-vault /abs/vault/path` saves the vault path in `.obsidian-dev.json`. After that, `just plugin-status`, `just use-local`, and `just use-synced` use the saved path automatically.

## Commands

- `Paste links as tasks`
- `Refresh linked issue statuses in current file`
- `Sync linked issue statuses across vault`
- `Open workspace settings`

## Sync behavior

- Checked tasks are pushed to a completed Linear workflow state.
- Unchecked tasks reopen the issue using the last known open state when possible.
- Polling defaults to every 30 minutes and can be turned off in settings.
- Issue reads are cached for 30 minutes, overlapping vault syncs are coalesced, and background sync pauses automatically when Linear reports an exhausted rate limit.
- Manual refresh commands are available if you want to avoid background polling.
- Opening a note refreshes linked issues in that file automatically.
- In Reading view and Live Preview, linked tasks render a status icon inline before the issue ID without changing the Markdown source.
- Plain Source mode keeps the raw Markdown text without rendered icons.

## Release artifacts

Obsidian community plugins need these files at the top level of the plugin folder:

- `manifest.json`
- `main.js`
- `styles.css`
