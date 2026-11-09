[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$IncludeMergeWorktree
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Keep this list conservative so the script only removes files that are clearly
# transient local artifacts for this repo.
$targetRelativePaths = @(
  'remote/temp/gcm-diagnose.log',
  'remote/temp/tmp-admin-out.log',
  'remote/temp/tmp-admin-err.log',
  'remote/temp/tmp-backend-out.log',
  'remote/temp/tmp-backend-err.log'
)

if ($IncludeMergeWorktree) {
  $targetRelativePaths += 'remote/temp/_main_merge_worktree'
}

$targets = foreach ($relativePath in $targetRelativePaths) {
  $fullPath = Join-Path $repoRoot $relativePath

  if (Test-Path -LiteralPath $fullPath) {
    Get-Item -LiteralPath $fullPath -Force
  }
}

if (-not $targets) {
  Write-Host 'No temporary files found.'
  return
}

$removedCount = 0

foreach ($target in $targets) {
  $isDirectory = $target.PSIsContainer
  $description = if ($isDirectory) { "directory $($target.FullName)" } else { "file $($target.FullName)" }

  if (-not $PSCmdlet.ShouldProcess($target.FullName, 'Remove temporary artifact')) {
    continue
  }

  if ($isDirectory) {
    Remove-Item -LiteralPath $target.FullName -Recurse -Force
  } else {
    Remove-Item -LiteralPath $target.FullName -Force
  }

  $removedCount += 1
  Write-Host "Removed $description"
}

Write-Host "Cleanup complete. Removed $removedCount item(s)."
