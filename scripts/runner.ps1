# Local job runner (Windows PowerShell 5.1+)
#
# Watches .data\request.txt. When the file appears, runs ONE job from the
# allow-list below, writes the log to .data\run-latest.md and removes the request.
# Lets a chat assistant ask for "pull / index / eval" without anyone typing commands,
# while only these fixed commands can ever run (no free-form shell).
#
#   npm run runner        (stop with Ctrl+C)
#
# request.txt format: first line = job name, e.g. "eval-answer 3"
# Optional .data\runner.env: KEY=VALUE lines, only the keys in $AllowedEnv are applied.

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$Data = Join-Path $Root ".data"
$Request = Join-Path $Data "request.txt"
$Running = Join-Path $Data "request.running"
$Log = Join-Path $Data "run-latest.md"
$EnvFile = Join-Path $Data "runner.env"
$AllowedEnv = @("ANSWER_PROVIDER", "ANSWER_MODEL_ID", "EMBED_MODEL_ID", "EMBEDDER", "EVIDENCE_THRESHOLD", "CHUNK_MODE")

New-Item -ItemType Directory -Force -Path $Data | Out-Null
Set-Location $Root

function Get-JobCommands([string]$name, [string]$arg) {
  switch ($name) {
    "pull"        { return ,@("git pull --ff-only") }
    "ci"          { return ,@("npm ci") }
    "index"       { return ,@("npm run index") }
    "eval"        { return ,@("npm run eval") }
    "eval-answer" {
      $n = 3
      if ($arg -match '^\d{1,2}$') { $n = [int]$arg }
      return ,@("npm run eval -- --answer $n")
    }
    "models"      { return ,@("npm run models") }
    "whoami"      { return ,@("aws sts get-caller-identity") }
    "check"       { return ,@("npm run lint", "npm run typecheck", "npm test") }
    "update"      { return ,@("git pull --ff-only", "npm ci") }
    default       { return $null }
  }
}

function Import-RunnerEnv {
  if (-not (Test-Path $EnvFile)) { return @() }
  $applied = @()
  foreach ($line in Get-Content -Encoding UTF8 $EnvFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $AllowedEnv -contains $Matches[1]) {
      Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
      $applied += $Matches[1]
    }
  }
  return $applied
}

Write-Host "runner: watching $Request (Ctrl+C to stop)"
while ($true) {
  if (Test-Path $Request) {
    Move-Item -Force $Request $Running
    $line = (Get-Content -Encoding UTF8 $Running | Select-Object -First 1)
    if ($null -eq $line) { $line = "" }
    $parts = $line.Trim() -split '\s+', 2
    $job = $parts[0]
    $arg = if ($parts.Count -gt 1) { $parts[1] } else { "" }
    $cmds = Get-JobCommands $job $arg
    $started = Get-Date
    $out = New-Object System.Collections.Generic.List[string]
    $out.Add("# run: $line")
    $out.Add("")
    $out.Add("started: $($started.ToString('yyyy-MM-dd HH:mm:ss'))")

    $exit = 0
    if ($null -eq $cmds) {
      $out.Add("status: rejected (unknown job '$job')")
      $exit = -1
    } else {
      $envKeys = Import-RunnerEnv
      if ($envKeys.Count -gt 0) { $out.Add("env: " + ($envKeys -join ", ")) }
      Write-Host "runner: $line"
      foreach ($c in $cmds) {
        $out.Add("")
        $out.Add("## > $c")
        $out.Add('```')
        $result = & cmd.exe /c "$c 2>&1"
        $exit = $LASTEXITCODE
        foreach ($r in $result) { $out.Add([string]$r) }
        $out.Add('```')
        $out.Add("exit: $exit")
        if ($exit -ne 0) { break }
      }
      $out.Add("")
      $out.Add("status: " + $(if ($exit -eq 0) { "ok" } else { "failed" }))
    }
    $out.Add("finished: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
    [System.IO.File]::WriteAllLines($Log, $out, (New-Object System.Text.UTF8Encoding($false)))
    Remove-Item -Force $Running
    Write-Host "runner: done ($line) exit=$exit"
  }
  Start-Sleep -Seconds 3
}
