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
  pnpm build
  pnpm test
  pnpm lint

# Bump plugin version metadata.
version:
  pnpm version

# Install into a local Obsidian vault by symlink.
install-vault vault:
  pnpm install:vault {{vault}}

# Install into a local Obsidian vault by copying artifacts.
install-vault-copy vault:
  pnpm install:vault {{vault}} --copy
