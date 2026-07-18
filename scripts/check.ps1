$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    throw "Virtual environment not found: $python"
}

Push-Location $root
try {
    & $python -m compileall -q backend\app backend\tests
    & $python -m pytest backend\tests
    pnpm build
    pnpm test
} finally {
    Pop-Location
}
