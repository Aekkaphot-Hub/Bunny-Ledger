# Bunny Ledger - tiny local web server (no install needed)
# Serves this folder at http://localhost:8642/ so Firebase sign-in and IndexedDB work properly.
param([int]$Port = 8642, [switch]$NoBrowser)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Port $Port is already in use - the program is probably open already. Opening browser..."
  if (-not $NoBrowser) { Start-Process $prefix }
  exit 0
}

Write-Host ""
Write-Host "  Bunny Ledger is running at $prefix"
Write-Host "  Keep this window open while using the program. Close it to stop."
Write-Host ""
if (-not $NoBrowser) { Start-Process $prefix }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.js' = 'application/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'
  '.md' = 'text/markdown; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.csv' = 'text/csv; charset=utf-8'; '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  '.woff2' = 'font/woff2'; '.rules' = 'text/plain; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
}
$rootFull = [System.IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($full)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
