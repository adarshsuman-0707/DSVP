# Run this in an elevated (Administrator) PowerShell window.
Import-Module WebAdministration

Write-Host "=== All IIS sites & their bindings/state ===" -ForegroundColor Cyan
Get-Website | Format-Table Name, State, PhysicalPath, @{n='Bindings';e={($_.bindings.Collection.bindingInformation) -join ','}} -AutoSize

Write-Host "`n=== Whatever OS process is bound to port 80 ===" -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    [PSCustomObject]@{
      LocalAddress = $_.LocalAddress
      PID          = $_.OwningProcess
      ProcessName  = $proc.ProcessName
      Path         = $proc.Path
    }
  } | Format-Table -AutoSize

Write-Host "`n=== netsh http (any http.sys reservations on :80) ===" -ForegroundColor Cyan
netsh http show servicestate view=requestq | Select-String "Port: 80|Server session ID|-----" -Context 0,2
