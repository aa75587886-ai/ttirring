param(
  [string]$Base = "http://127.0.0.1:3002",
  [string]$JobId = "J401",
  [string]$ChannelId = "CH-01",
  [string]$PassengerId = "USR-PASS-01",
  [string]$DriverId = "DRV-01",
  [string]$OperatorId = "OP-ADMIN",
  [int]$Fare = 20000,     # 총 요금 (예: 20,000원)
  [int]$DriverShare = 70  # 기사 배분율 (예: 70%)
)

Write-Host "== 1) 예약 생성 ($JobId) ==" -ForegroundColor Cyan
$mk = @{
  jobId = $JobId
  channelId = $ChannelId
  passengerName = "홍길동"
  pickupAddr = "서울역"
  dropoffAddr = "성남시"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "$Base/v1/reservations" -Body $mk -ContentType "application/json; charset=utf-8" | Out-Null

Write-Host "== 2) 디스패치 & 완료 ==" -ForegroundColor Cyan
$soft = @{ jobId=$JobId; driverId=$DriverId; channelId=$ChannelId; ttlSec=30 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/v1/dispatch/soft" -Body $soft -ContentType "application/json; charset=utf-8" | Out-Null
$patch1 = @{ status = "DISPATCHED" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "$Base/v1/jobs/$JobId" -Body $patch1 -ContentType "application/json; charset=utf-8" | Out-Null
$patch2 = @{ status = "COMPLETED" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "$Base/v1/jobs/$JobId" -Body $patch2 -ContentType "application/json; charset=utf-8" | Out-Null

Write-Host "== 3) 지갑 트랜잭션 (승객 차감 → 기사/운영자 배분) ==" -ForegroundColor Cyan
$driverAmt   = [math]::Round($Fare * ($DriverShare/100.0))
$operatorAmt = $Fare - $driverAmt

# (선택) 테스트용: 승객 지갑 리차지
$recharge = @{ userId=$PassengerId; amount=$Fare; method="TEST"; note="prefund" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/v1/wallet/recharge" -Body $recharge -ContentType "application/json; charset=utf-8" | Out-Null

# 승객 요금 차감(지갑 결제)
$chargePassenger = @{ userId=$PassengerId; amount=$Fare; reason="fare"; jobId=$JobId } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/v1/wallet/charge" -Body $chargePassenger -ContentType "application/json; charset=utf-8" | Out-Null

# 기사 정산분 적립
$creditDriver = @{ userId=$DriverId; amount=$driverAmt; reason="settlement"; jobId=$JobId } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/v1/wallet/recharge" -Body $creditDriver -ContentType "application/json; charset=utf-8" | Out-Null

# 운영자 수수료 적립
$creditOperator = @{ userId=$OperatorId; amount=$operatorAmt; reason="commission"; jobId=$JobId } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/v1/wallet/recharge" -Body $creditOperator -ContentType "application/json; charset=utf-8" | Out-Null

Write-Host "== 4) 채널 정산 생성 (DAILY) ==" -ForegroundColor Cyan
$settle = @{ channelId=$ChannelId; period="DAILY" } | ConvertTo-Json
$settleResp = Invoke-RestMethod -Method Post -Uri "$Base/v1/settlements/close" -Body $settle -ContentType "application/json; charset=utf-8"
$settleResp | ConvertTo-Json -Depth 6

Write-Host "== 5) 결과 점검 ==" -ForegroundColor Cyan
$stats = Invoke-RestMethod -Method Get -Uri "$Base/v1/jobs/stats?channelId=$ChannelId"
$walletP = Invoke-RestMethod -Method Get -Uri "$Base/v1/wallet/$PassengerId"
$walletD = Invoke-RestMethod -Method Get -Uri "$Base/v1/wallet/$DriverId"
$walletO = Invoke-RestMethod -Method Get -Uri "$Base/v1/wallet/$OperatorId"

[pscustomobject]@{
  JobId        = $JobId
  Fare         = $Fare
  DriverShare  = "$DriverShare%"
  DriverAmt    = $driverAmt
  OperatorAmt  = $operatorAmt
  Stats        = $stats
  PassengerBal = $walletP.balance
  DriverBal    = $walletD.balance
  OperatorBal  = $walletO.balance
} | ConvertTo-Json -Depth 6