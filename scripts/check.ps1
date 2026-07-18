$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.venv\Scripts\python.exe'
$tempRoot = Join-Path $root 'runtime\check-temp'
$pytestTemp = Join-Path $tempRoot ([guid]::NewGuid().ToString('N'))

function Assert-NativeSuccess {
    param([Parameter(Mandatory = $true)][string]$Step)

    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path -LiteralPath $python)) {
    throw "Virtual environment not found: $python"
}

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
$env:TMPDIR = $tempRoot
$env:TEMP = $tempRoot
$env:TMP = $tempRoot

Push-Location $root
try {
    & $python -m compileall -q backend\app backend\tests
    Assert-NativeSuccess 'Python compileall'
    & $python -m pytest backend\tests -p no:cacheprovider --basetemp $pytestTemp
    Assert-NativeSuccess 'Backend tests'
    & $python scripts\static_audit.py
    Assert-NativeSuccess 'Static audit'
    & $python -m pip check
    Assert-NativeSuccess 'Python dependency check'
    pnpm typecheck
    Assert-NativeSuccess 'Frontend typecheck'
    pnpm test
    Assert-NativeSuccess 'Frontend tests'
    pnpm build
    Assert-NativeSuccess 'Frontend production build'
    pnpm test:e2e
    Assert-NativeSuccess 'Browser end-to-end tests'
} finally {
    Pop-Location
}
