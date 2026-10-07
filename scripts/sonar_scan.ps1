[CmdletBinding()]
param(
    [string]$SonarHostUrl = $(if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL } else { 'http://127.0.0.1:9004' }),
    [switch]$SkipSourceChecks,
    [string]$CoverageDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

# The scanner runs in a Linux container. Its 127.0.0.1 is not the Windows host,
# so translate only the documented local endpoint to Docker Desktop's host alias.
if ($SonarHostUrl -match '^http://(127\.0\.0\.1|localhost):9004/?$') {
    $SonarHostUrl = 'http://host.docker.internal:9004'
}

if ([string]::IsNullOrWhiteSpace($env:SONAR_TOKEN)) {
    throw 'SONAR_TOKEN is required. Create a project analysis token in SonarQube and set it only in the current shell or secret store.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found. Pull the pinned scanner image after Docker Desktop is running, then rerun this script.'
}

$scannerImage = 'sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0'
docker image inspect $scannerImage | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "The pinned scanner image is not present. Pull it explicitly with: docker pull $scannerImage"
}

function Copy-CuratedDirectory([string]$relativePath, [string]$destinationRoot) {
    $source = Join-Path $projectRoot $relativePath
    $destination = Join-Path $destinationRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required source directory is absent: $relativePath"
    }
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    # The selected roots already exclude tools, archives, and root caches. The
    # exclusions also prevent nested development artefacts from entering scan.
    & robocopy $source $destination /E /R:0 /W:0 /XD __pycache__ .venv node_modules .pytest_cache .mypy_cache /XF *.pyc *.zip *.tar *.tgz *.gz | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "Unable to snapshot $relativePath (robocopy exit code $LASTEXITCODE)."
    }
}

function Copy-CuratedFile([string]$relativePath, [string]$destinationRoot) {
    $source = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required source file is absent: $relativePath"
    }
    $destination = Join-Path $destinationRoot $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
}

Push-Location $projectRoot
$scanSnapshot = $null
try {
    if (-not $SkipSourceChecks) {
        & python -B scripts/check_project.py --run-source-checks
        if ($LASTEXITCODE -ne 0) {
            throw "Source gate failed with exit code $LASTEXITCODE; SonarQube analysis was not sent."
        }
    }

    $scanSnapshot = Join-Path $projectRoot ('.tmp/sonar-scan-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $scanSnapshot | Out-Null
    $scannerName = 'tls-sonar-scan-' + (Split-Path -Leaf $scanSnapshot).Replace('sonar-scan-', '')
    foreach ($directory in @('backend/app', 'backend/tests', 'backend/schema', 'engine', 'frontend/src', 'frontend/tests', 'scripts')) {
        Copy-CuratedDirectory $directory $scanSnapshot
    }
    # The repository currently carries a Windows resvg fixture. CI test paths
    # use fake subprocesses and do not execute it on Linux.
    Remove-Item -LiteralPath (Join-Path $scanSnapshot 'engine/bin') -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($file in @('requirements.txt', 'sonar-project.properties', 'Dockerfile', 'docker-compose.yml', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/tsconfig.json', 'frontend/vite.config.js', 'frontend/playwright.config.js', 'frontend/index.html', 'frontend/postcss.config.js', 'frontend/tailwind.config.js')) {
        Copy-CuratedFile $file $scanSnapshot
    }
    if ($CoverageDirectory) {
        $coverageRoot = (Resolve-Path -LiteralPath $CoverageDirectory).Path
        $temporaryRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tmp')) + [IO.Path]::DirectorySeparatorChar
        if (-not $coverageRoot.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Coverage reports must be in a project .tmp child.'
        }
        $coverageResult = Get-Content -LiteralPath (Join-Path $coverageRoot 'result.json') -Raw | ConvertFrom-Json
        if ($coverageResult.status -ne 'PASS') { throw 'Coverage test run did not pass.' }
        & python -B scripts/check_coverage.py --verify-inputs $coverageRoot
        if ($LASTEXITCODE -ne 0) { throw 'Coverage reports do not match the current source.' }
        $coverageTarget = Join-Path $scanSnapshot '.tmp/coverage'
        New-Item -ItemType Directory -Path $coverageTarget -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $coverageRoot 'python.xml') -Destination (Join-Path $coverageTarget 'python.xml')
        Copy-Item -LiteralPath (Join-Path $coverageRoot 'frontend/lcov.info') -Destination (Join-Path $coverageTarget 'frontend.lcov')
    }
    $manifest = Get-ChildItem -LiteralPath $scanSnapshot -Recurse -File |
        Sort-Object { $_.FullName.Substring($scanSnapshot.Length).Replace('\', '/') } |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($scanSnapshot.Length).Replace('\', '/')
            "$relativePath $((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
        }
    $manifestBytes = [Text.Encoding]::UTF8.GetBytes(($manifest -join "`n") + "`n")
    $snapshotHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($manifestBytes)).ToLowerInvariant()

    # SONAR_TOKEN stays in the process/container environment, never in argv.
    & docker run --rm --init --name $scannerName `
        -e "SONAR_HOST_URL=$SonarHostUrl" `
        -e 'SONAR_TOKEN' `
        -v "${scanSnapshot}:/usr/src:ro" `
        -w /usr/src `
        $scannerImage `
        '-Dsonar.working.directory=/tmp/sonar-working' `
        '-Dsonar.qualitygate.wait=true' `
        '-Dsonar.python.version=3.14' `
        "-Dsonar.buildString=snapshot-sha256=$snapshotHash"
    if ($LASTEXITCODE -ne 0) {
        throw "SonarScanner or the SonarQube quality gate failed with exit code $LASTEXITCODE."
    }
} finally {
    if ($null -ne $scanSnapshot -and $scanSnapshot -like (Join-Path $projectRoot '.tmp/sonar-scan-*')) {
        Remove-Item -LiteralPath $scanSnapshot -Recurse -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}
