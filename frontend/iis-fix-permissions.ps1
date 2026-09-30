# Run this in an elevated (Administrator) PowerShell window.
# Grants IIS the NTFS read+traverse rights it needs on an F:\ path
# (only C:\inetpub gets this by default).

$paths = @(
  "F:\dotnet",
  "F:\dotnet\DSVP",
  "F:\dotnet\DSVP\frontend",
  "F:\dotnet\DSVP\frontend\dist"
)

foreach ($p in $paths) {
  icacls $p /grant "IIS_IUSRS:(OI)(CI)RX" /T
}

# Make sure the "DSVPFrontend" application actually points at dist/, not
# the frontend/ project root (which has no index.html at its top level).
Import-Module WebAdministration
$app = Get-WebApplication -Site "Default Web Site" -Name "DSVPFrontend" -ErrorAction SilentlyContinue
if ($app) {
  Write-Host "Current physical path: $($app.PhysicalPath)"
  Set-ItemProperty "IIS:\Sites\Default Web Site\DSVPFrontend" -Name physicalPath -Value "F:\dotnet\DSVP\frontend\dist"
  Write-Host "Set to: F:\dotnet\DSVP\frontend\dist"
} else {
  Write-Host "No application named 'DSVPFrontend' found under Default Web Site — check the exact name in IIS Manager." -ForegroundColor Yellow
}

iisreset
