# Allow-lists for scripts\runner.ps1. Re-read on every request.
# Only the commands below can run. Never add a job that takes free-form input.

$AllowedEnv = @("ANSWER_PROVIDER", "ANSWER_MODEL_ID", "EMBED_MODEL_ID", "EMBEDDER", "EVIDENCE_THRESHOLD", "CHUNK_MODE", "GLOSSARY", "LEXICAL_WEIGHT", "ALERT_EMAIL")

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
    "demo"        { return ,@("npm run demo:build") }
    "whoami"      { return ,@("aws sts get-caller-identity") }
    "sam-build"   { return ,@("set PYTHONUTF8=1&& sam build") }
    # Creates/updates AWS resources (S3, DynamoDB, Lambda, budget). Run only after the user approved it in chat.
    "sam-deploy"  { return ,@("set PYTHONUTF8=1&& sam build", "set PYTHONUTF8=1&& sam deploy --no-confirm-changeset --no-fail-on-empty-changeset --parameter-overrides AlertEmail=%ALERT_EMAIL%") }
    "aws-upload"  { return ,@("npm run aws:upload") }
    "aws-status"  { return ,@("npm run aws:status") }
    "ask-check"   { return ,@("npm run ask:check") }
    "check"       { return ,@("npm run lint", "npm run typecheck", "npm test") }
    "update"      { return ,@("git pull --ff-only", "npm ci") }
    default       { return $null }
  }
}
