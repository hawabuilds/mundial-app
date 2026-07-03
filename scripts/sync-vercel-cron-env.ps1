# Sync cron-critical env vars from .env.local to Vercel production.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw "Missing .env.local" }

$vars = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "X_BEARER_TOKEN",
  "X_MATCH_ACCOUNT",
  "TXODDS_API_TOKEN",
  "TXODDS_API_ORIGIN",
  "CRON_SECRET",
  "COLLECT_SECRET"
)

$map = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $idx = $_.IndexOf('=')
  $name = $_.Substring(0, $idx).Trim()
  $value = $_.Substring($idx + 1)
  $map[$name] = $value
}

Push-Location $root
try {
  foreach ($name in $vars) {
    if (-not $map.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($map[$name])) {
      Write-Host "skip $name (missing in .env.local)"
      continue
    }
    Write-Host "sync $name -> production"
    vercel env rm $name production --yes 2>$null | Out-Null
    vercel env add $name production --value $map[$name] --yes --force 2>&1 | Out-Null
  }
} finally {
  Pop-Location
}

Write-Host "Done."
