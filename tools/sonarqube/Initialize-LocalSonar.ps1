[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$baseUrl = 'http://127.0.0.1:9004'
$authPath = Join-Path $PSScriptRoot '.env.auth'
$mcpPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'mcp/.env.sonar'
if (Test-Path -LiteralPath $authPath) { throw 'Local administrator credentials already exist. Refusing to replace them.' }
if (Test-Path -LiteralPath $mcpPath) { throw 'Local MCP credentials already exist. Refusing to replace them.' }
if ((Invoke-RestMethod "$baseUrl/api/system/status" -TimeoutSec 10).status -ne 'UP') { throw 'SonarQube is not UP yet.' }
function BasicHeaders([string]$login, [string]$password) {
    return @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${login}:$password")) }
}
function PostSonar([string]$route, [hashtable]$body, [hashtable]$headers) {
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/$route" -Headers $headers -Body $body -TimeoutSec 30
}
$adminPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant() + 'Aa1!'
$initialHeaders = BasicHeaders 'admin' 'admin'
PostSonar 'users/change_password' @{login='admin'; previousPassword='admin'; password=$adminPassword} $initialHeaders | Out-Null
# Write immediately after password change, so later setup errors cannot lose access.
Set-Content -LiteralPath $authPath -Value @('SONAR_ADMIN_LOGIN=admin', ('SONAR_ADMIN_PASSWORD='+$adminPassword)) -Encoding ascii
$adminHeaders = BasicHeaders 'admin' $adminPassword
PostSonar 'projects/create' @{project='thermal-label-studio'; name='Thermal Label Studio'; visibility='private'} $adminHeaders | Out-Null
$scan = PostSonar 'user_tokens/generate' @{name='tls-local-scanner'; type='PROJECT_ANALYSIS_TOKEN'; projectKey='thermal-label-studio'} $adminHeaders
Set-Content -LiteralPath (Join-Path $PSScriptRoot '.env.scan') -Value @(('SONAR_TOKEN='+$scan.token),'SONAR_HOST_URL=http://host.docker.internal:9004') -Encoding ascii
$mcpPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant() + 'Aa1!'
PostSonar 'users/create' @{login='codex-reader'; name='Codex Read Only'; password=$mcpPassword; local='true'} $adminHeaders | Out-Null
foreach ($permission in @('user','codeviewer')) {
    PostSonar 'permissions/add_user' @{login='codex-reader'; projectKey='thermal-label-studio'; permission=$permission} $adminHeaders | Out-Null
}
$mcpHeaders = BasicHeaders 'codex-reader' $mcpPassword
$mcp = PostSonar 'user_tokens/generate' @{name='tls-codex-reader'; type='USER_TOKEN'} $mcpHeaders
Set-Content -LiteralPath $mcpPath -Value @(('SONARQUBE_TOKEN='+$mcp.token),'SONARQUBE_URL=http://host.docker.internal:9004','SONARQUBE_READ_ONLY=true','SONARQUBE_TOOLSETS=issues,quality-gates,rules,measures,coverage','SONARQUBE_LOG_TO_FILE_DISABLED=true','TELEMETRY_DISABLED=true') -Encoding ascii
Write-Output 'PASS: private project, dedicated analysis token, and read-only Codex USER token created. Credentials stored only in ignored local files.'
