# Run this in an elevated (Administrator) PowerShell window.
Import-Module WebAdministration

Write-Host "`n=== Sites ===" -ForegroundColor Cyan
Get-Website | Format-Table Name, State, PhysicalPath, @{n='Bindings';e={($_.bindings.Collection.bindingInformation) -join ','}} -AutoSize

Write-Host "`n=== Applications under Default Web Site ===" -ForegroundColor Cyan
Get-WebApplication -Site "Default Web Site" | Format-Table Path, PhysicalPath, ApplicationPool -AutoSize

Write-Host "`n=== Default Documents (Default Web Site) ===" -ForegroundColor Cyan
Get-WebConfiguration -Filter "/system.webServer/defaultDocument/files/add" -PSPath "IIS:\Sites\Default Web Site" |
  Select-Object Value

Write-Host "`n=== Static Content feature ===" -ForegroundColor Cyan
Get-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent | Select-Object State

Write-Host "`n=== dist folder contents ===" -ForegroundColor Cyan
Get-ChildItem "F:\dotnet\DSVP\frontend\dist"

Write-Host "`n=== NTFS permissions on dist folder (IIS_IUSRS) ===" -ForegroundColor Cyan
icacls "F:\dotnet\DSVP\frontend\dist" | Select-String "IIS_IUSRS|Everyone|IUSR"

Write-Host "`n=== Traverse permission on parent folders ===" -ForegroundColor Cyan
icacls "F:\dotnet" | Select-String "IIS_IUSRS|Everyone|IUSR"
icacls "F:\dotnet\DSVP" | Select-String "IIS_IUSRS|Everyone|IUSR"
icacls "F:\dotnet\DSVP\frontend" | Select-String "IIS_IUSRS|Everyone|IUSR"
