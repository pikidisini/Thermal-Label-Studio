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
# Credentials are passed through an ignored env file, never command-line values.
# No workspace, Docker socket, application data, or host directory is mounted.
$containerName = 'tls-sonar-mcp-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
& docker run --name $containerName --rm --init --pull never -i --env-file $credentialPath sonarsource/sonarqube-mcp:1.19.0.2785
exit $LASTEXITCODE
