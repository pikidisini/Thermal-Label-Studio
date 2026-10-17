[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $PSScriptRoot '.env.sonar'
if (-not (Test-Path -LiteralPath $credentialPath)) {
    throw 'SonarQube MCP credentials are missing. Configure tools/mcp/.env.sonar with a dedicated USER token; never put tokens in Codex config.'
}
$settings = @{}
foreach ($line in Get-Content -LiteralPath $credentialPath) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
if (-not $settings['SONARQUBE_TOKEN'] -or $settings['SONARQUBE_TOKEN'] -match '^replace-') {
    throw 'A dedicated SonarQube USER token is required for MCP.'
}
if ($settings['SONARQUBE_URL'] -ne 'http://host.docker.internal:9004' -or $settings['SONARQUBE_READ_ONLY'] -ne 'true') {
    throw 'This launcher requires the approved local endpoint and read-only MCP mode.'
}
if ($ValidateOnly) { Write-Output 'PASS: local MCP credentials and read-only endpoint are configured.'; exit 0 }
# The singleton receives credentials only through its ignored Compose env file.
# Each Codex connection runs a cheap local STDIO bridge; it never starts a new
# upstream container and never receives the token in its client configuration.
$composePath = Join-Path $PSScriptRoot 'compose.sonar.yml'
$bridgePath = Join-Path $PSScriptRoot 'sonar_bridge.py'
$pythonPath = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $composePath) -or -not (Test-Path -LiteralPath $bridgePath) -or -not (Test-Path -LiteralPath $pythonPath)) {
    throw 'SonarQube MCP bridge files are unavailable. Install the local MCP tooling dependencies before reloading Codex.'
}
$mutex = [System.Threading.Mutex]::new($false, 'Global\ThermalLabelSonarMcpStartup')
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(30000) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Timed out waiting for shared SonarQube MCP startup.' }
    & docker compose -f $composePath up -d --no-recreate --pull never 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'The shared SonarQube MCP service could not be started.' }
    $response = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9005/health' -TimeoutSec 2
            if ($response.StatusCode -eq 200) { break }
        } catch { }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $response -or $response.StatusCode -ne 200) { throw 'The shared SonarQube MCP service did not become healthy.' }
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
& $pythonPath -B $bridgePath
exit $LASTEXITCODE
