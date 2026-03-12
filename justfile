set shell := ["bash", "-uc"]

default:
  @just --list

# Install project dependencies.
install:
  pnpm install

# Install dependencies exactly as CI does.
install-frozen:
  pnpm install --frozen-lockfile

# Run the esbuild dev watcher.
dev:
  pnpm dev

# Build the plugin bundle.
build:
  pnpm build

# Run the test suite once.
test:
  pnpm test

# Run Vitest in watch mode.
test-watch:
  pnpm test:watch

# Run ESLint.
lint:
  pnpm lint

# Run the same verification steps as CI.
check:
  pnpm check

# Bump plugin version metadata.
version:
  pnpm version

# Store the vault path and switch to local build mode.
setup-vault vault_path:
  pnpm setup:vault "{{vault_path}}"

# Show the current plugin source mode.
plugin-status:
  pnpm plugin:status

# Switch the configured vault to local build mode.
use-local:
  pnpm plugin:use-local

# Switch the configured vault back to synced static mode.
use-synced:
  pnpm plugin:use-synced
