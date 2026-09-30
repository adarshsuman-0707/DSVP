# Run this in an elevated (Administrator) PowerShell window.
Import-Module WebAdministration

Write-Host "=== All App Pools ===" -ForegroundColor Cyan
Get-ChildItem IIS:\AppPools | Format-Table Name, State -AutoSize

Write-Host "`n=== Root '/' application's assigned App Pool (Default Web Site) ===" -ForegroundColor Cyan
Get-WebApplication -Site "Default Web Site" | Format-Table Path, PhysicalPath, ApplicationPool -AutoSize
(Get-Item "IIS:\Sites\Default Web Site").applicationPool

Write-Host "`n=== DSVPFrontend application's App Pool ===" -ForegroundColor Cyan
Get-WebApplication -Site "Default Web Site" -Name "DSVPFrontend" -ErrorAction SilentlyContinue |
  Format-Table Path, PhysicalPath, ApplicationPool -AutoSize

# Recreate DefaultAppPool if it's missing (this is almost always the 403.18 cause)
if (-not (Test-Path "IIS:\AppPools\DefaultAppPool")) {
  Write-Host "`nDefaultAppPool is missing — recreating it..." -ForegroundColor Yellow
  New-WebAppPool -Name "DefaultAppPool"
  Set-ItemProperty "IIS:\AppPools\DefaultAppPool" -Name managedRuntimeVersion -Value "v4.0"
}

# Point Default Web Site's root "/" back at DefaultAppPool
Set-ItemProperty "IIS:\Sites\Default Web Site" -Name applicationPool -Value "DefaultAppPool"

# If a DSVPFrontend app exists but points at a missing/wrong pool, fix it too
$feApp = Get-WebApplication -Site "Default Web Site" -Name "DSVPFrontend" -ErrorAction SilentlyContinue
if ($feApp) {
  if (-not (Test-Path "IIS:\AppPools\$($feApp.ApplicationPool)")) {
    Write-Host "DSVPFrontend's app pool '$($feApp.ApplicationPool)' is missing — assigning DefaultAppPool" -ForegroundColor Yellow
    Set-ItemProperty "IIS:\Sites\Default Web Site\DSVPFrontend" -Name applicationPool -Value "DefaultAppPool"
  }
}

Start-WebAppPool -Name "DefaultAppPool" -ErrorAction SilentlyContinue
iisreset

Write-Host "`n=== Final state ===" -ForegroundColor Green
Get-WebApplication -Site "Default Web Site" | Format-Table Path, PhysicalPath, ApplicationPool -AutoSize
