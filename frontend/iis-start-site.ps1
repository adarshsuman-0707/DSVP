# Run this in an elevated (Administrator) PowerShell window.
Import-Module WebAdministration

Start-Website -Name "Default Web Site"

Write-Host "`n=== Site state ===" -ForegroundColor Cyan
Get-Website -Name "Default Web Site" | Format-Table Name, State, PhysicalPath -AutoSize

Write-Host "`n=== Applications under Default Web Site ===" -ForegroundColor Cyan
Get-WebApplication -Site "Default Web Site" | Format-Table Path, PhysicalPath, ApplicationPool -AutoSize

Write-Host "`n=== App pool states ===" -ForegroundColor Cyan
Get-ChildItem IIS:\AppPools | Format-Table Name, State -AutoSize
