[CmdletBinding()]
param(
    [int]$MinimumMemoryGiB = 6,
    [int]$MinimumCpus = 4
)

$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
    Write-Error $message
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'Docker CLI was not found. Install and start Docker Desktop first.'
}

try {
    $info = docker info --format '{{json .}}' | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $info) {
        throw 'docker info returned no usable JSON.'
    }
} catch {
    Fail "Docker Engine is not available: $($_.Exception.Message)"
}

$memoryGiB = [math]::Floor([double]$info.MemTotal / 1GB)
if ($memoryGiB -lt $MinimumMemoryGiB) {
    Fail "Docker has $memoryGiB GiB available; configure at least $MinimumMemoryGiB GiB before starting SonarQube."
}
if ([int]$info.NCPU -lt $MinimumCpus) {
    Fail "Docker has $($info.NCPU) CPUs available; configure at least $MinimumCpus before starting SonarQube."
}

# Elasticsearch performs this check in the Linux Docker VM. The exact pinned
# SonarQube image is used and pulling is disabled: the check cannot silently
# download an unrelated helper image or start the configured stack.
try {
    docker image inspect sonarqube:26.9.0.129388-community | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'The pinned SonarQube image is not present locally.'
    }
    $preflightName = 'tls-sonar-preflight-' + [guid]::NewGuid().ToString('N')
    $mapCount = docker run --rm --init --name $preflightName --pull never --entrypoint sh sonarqube:26.9.0.129388-community -c 'sysctl -n vm.max_map_count'
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($mapCount)) {
        throw 'Docker could not read vm.max_map_count.'
    }
} catch {
    Fail 'Could not read vm.max_map_count from the Docker Linux VM. Pull the pinned SonarQube image explicitly, then rerun this preflight.'
}
if ([int]$mapCount -lt 524288) {
    Fail "vm.max_map_count is $mapCount; SonarQube requires at least 524288. Update the Docker Linux VM setting and rerun this preflight."
}

Write-Host "PASS: Docker resources ($memoryGiB GiB, $($info.NCPU) CPUs) and vm.max_map_count ($mapCount) meet this local SonarQube baseline."
