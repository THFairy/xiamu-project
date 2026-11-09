[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$tempRoot = Join-Path $projectRoot 'remote\temp'

function Get-RelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $baseUri = New-Object System.Uri(($BasePath.TrimEnd('\') + '\'))
  $targetUri = New-Object System.Uri($TargetPath)
  $relativeUri = $baseUri.MakeRelativeUri($targetUri)
  return [System.Uri]::UnescapeDataString($relativeUri.ToString().Replace('/', '\'))
}

if (-not (Test-Path -LiteralPath $tempRoot)) {
  Write-Host 'No temporary files to clean.'
  exit 0
}

$targets = Get-ChildItem -LiteralPath $tempRoot -Force

if (-not $targets) {
  Write-Host 'No temporary files to clean.'
  exit 0
}

foreach ($target in $targets) {
  $relativePath = Get-RelativePath -BasePath $projectRoot -TargetPath $target.FullName
  if ($PSCmdlet.ShouldProcess($relativePath, 'Remove temporary file or directory')) {
    Remove-Item -LiteralPath $target.FullName -Recurse -Force
    Write-Host "Removed $relativePath"
  }
}
