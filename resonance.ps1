#!/usr/bin/env pwsh
# Resonance entrypoint (vendored, do not edit by hand). Dispatches to the engine.
param([Parameter(Position=0)][string]$Command = "check")
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$engine = Join-Path $here ".agents/.runtime/resonance_sync.py"
$py = $null
foreach ($c in @("py","python","python3")) {
  $g = Get-Command $c -ErrorAction SilentlyContinue
  if ($g) { $py = $g.Source; break }
}
if (-not $py) { Write-Host "resonance: python not found"; exit 0 }
& $py $engine $Command --repo $here @args
