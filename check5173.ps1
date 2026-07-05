$u = 'http://127.0.0.1:5173/'
try {
  $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 5
  Write-Output "OK $($r.StatusCode)"
} catch {
  Write-Output "ERR $($_.Exception.Message)"
}
