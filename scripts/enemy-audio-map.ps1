# Enemy presence/attack sources for build-audio-pack.ps1
# Canonical map: scripts/enemy-audio-sources.ts (F and G personal libraries).

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$export = Join-Path $PSScriptRoot "export-enemy-audio-sources.ts"
$raw = & bun $export
if ($LASTEXITCODE -ne 0) { throw "Failed to export enemy audio sources from TypeScript." }
$EnemyAudioAssets = $raw | ConvertFrom-Json
