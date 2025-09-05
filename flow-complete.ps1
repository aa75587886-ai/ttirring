param(
  [string]$Base = "http://127.0.0.1:3002",
  [string]$JobId = "J302",
  [string]$ChannelId = "CH-01",
  [string]$DriverId = "DRV-01",
  [int]$TtlSec = 30
)

Write-Host "== 예약 생성 ($JobId) ==" -ForegroundColor Cyan
$mk = @{
  jobId = $JobId
  channelId = $ChannelId
  passengerName = "홍길동"
  pickupAddr = "서울역"
  dropoffAddr = "성남시"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "$Base/v1/reservations" -Body $mk -ContentType "application/json; charset=utf-8" | Out-Null

Write-Host "== 소프트 디스패치 ($JobId->$DriverId) ==" -ForegroundColor Cyan
$soft = @{
  jobId     = $JobId
  driverId  = $DriverId
  channelId = $ChannelId
  ttlSec    = $TtlSec
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "$Base/v1/dispatch/soft" -Body $soft -ContentType "application/json; charset=utf-8" | Out-Null

Write-Host "== 상태 변경: DISPATCHED -> COMPLETED ==" -ForegroundColor Cyan
$patch1 = @{ status = "DISPATCHED" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "$Base/v1/jobs/$JobId" -Body $patch1 -ContentType "application/json; charset=utf-8" | Out-Null

$patch2 = @{ status = "COMPLETED" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "$Base/v1/jobs/$JobId" -Body $patch2 -ContentType "application/json; charset=utf-8" | Out-Null

Write-Host "== 통계 (채널 $ChannelId) ==" -ForegroundColor Cyan
Invoke-RestMethod -Method Get -Uri "$Base/v1/jobs/stats?channelId=$ChannelId" | ConvertTo-Json -Depth 4