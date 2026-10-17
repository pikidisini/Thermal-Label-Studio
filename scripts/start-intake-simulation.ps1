param([switch]$NoStorage, [switch]$Check)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$configPath = Join-Path $projectRoot '.env.simulation.ps1'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Local simulation token configuration is missing.'
}
# Trusted, ignored local configuration. Never echo its contents.
. $configPath
$ledgerConfigPath = Join-Path $projectRoot '.env.intake-ledger.ps1'
if (Test-Path -LiteralPath $ledgerConfigPath -PathType Leaf) {
    . $ledgerConfigPath
}
$devArguments = @('-B', (Join-Path $PSScriptRoot 'dev.py'))
if ($NoStorage) { $devArguments += '--no-storage' }
if ($Check) { $devArguments += '--check' }
Push-Location $projectRoot
try {
    & python @devArguments
    if ($LASTEXITCODE -ne 0) { throw 'Development launch failed.' }
} finally {
    Pop-Location
}
