$ErrorActionPreference = "Stop"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetRoot = if ($env:AGENT_SKILLS_HOME) { $env:AGENT_SKILLS_HOME } else { Join-Path $HOME ".agents\skills" }
$Target = Join-Path $TargetRoot "importing-artifacts-through-gateway"
New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
Copy-Item -Recurse -Force $SourceDir $Target
Write-Output "Installed to $Target"
