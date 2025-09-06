# ttirring-wallet.ps1
# ✅ Approved Verbs만 사용 / 경고 없이 동작
#    - Get-WalletTransactions
#    - Invoke-WalletRecharge
#    - Invoke-WalletDebit
#    - Invoke-WalletRefund
#    - New-WalletSettlement
#    - Get-WalletSettlements

# 공통
function Get-TtirringBaseUrl {
    param([int]$Port)
    if (-not $Port) { $Port = [int]$env:PORT }
    if (-not $Port) { $Port = 3002 }
    return "http://127.0.0.1:$Port"
}
$script:ContentType = "application/json; charset=utf-8"

function Get-WalletTransactions {
    param(
        [Parameter(Mandatory=$true)][string]$UserId,
        [int]$Limit = 50,
        [int]$Port
    )
    $base = Get-TtirringBaseUrl -Port $Port
    $url  = "$base/v1/wallet_tx?userId=$UserId&limit=$Limit"
    Invoke-RestMethod -Method Get -Uri $url
}

function Invoke-WalletRecharge {
    param(
        [Parameter(Mandatory=$true)][string]$UserId,
        [Parameter(Mandatory=$true)][int]$Amount,
        [string]$Reason = "MANUAL_PLUS",
        [string]$Memo,
        [int]$Port
    )
    $base = Get-TtirringBaseUrl -Port $Port
    $body = @{ userId=$UserId; amount=$Amount; reason=$Reason; memo=$Memo } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$base/v1/wallet_tx/credit" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType $script:ContentType
}

function Invoke-WalletDebit {
    param(
        [Parameter(Mandatory=$true)][string]$UserId,
        [Parameter(Mandatory=$true)][int]$Amount,
        [Parameter(Mandatory=$true)][string]$Reason,   # CANCEL_PENALTY | WITHDRAWAL | FEE | ADJUSTMENT_MINUS ...
        [string]$JobId,
        [string]$ChannelId,
        [string]$Memo,
        [int]$Port
    )
    $base = Get-TtirringBaseUrl -Port $Port
    $body = @{
        userId=$UserId; amount=$Amount; reason=$Reason;
        jobId=$JobId; channelId=$ChannelId; memo=$Memo
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$base/v1/wallet_tx/debit" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType $script:ContentType
}

function Invoke-WalletRefund {
    param(
        [Parameter(Mandatory=$true)][string]$UserId,
        [Parameter(Mandatory=$true)][int]$Amount,
        [string]$Reason = "REFUND_PLUS",
        [string]$JobId,
        [string]$ChannelId,
        [string]$Memo,
        [int]$Port
    )
    $base = Get-TtirringBaseUrl -Port $Port
    $body = @{
        userId=$UserId; amount=$Amount; reason=$Reason;
        jobId=$JobId; channelId=$ChannelId; memo=$Memo
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$base/v1/wallet_tx/credit" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType $script:ContentType
}

function New-WalletSettlement {
    param(
        [Parameter(Mandatory=$true)][string]$ChannelId,
        [string]$Date,
        [int]$Port
    )
    # 실제 엔드포인트가 정해지면 아래 호출로 교체
    # 지금은 사용 안내만 출력
    Write-Output @{ ok=$true; message="(stub) settlement create"; channelId=$ChannelId; date=$Date }
}

function Get-WalletSettlements {
    param(
        [string]$ChannelId,
        [string]$Start,
        [string]$End,
        [int]$Port
    )
    # 실제 엔드포인트가 정해지면 아래 호출로 교체
    # 지금은 사용 안내만 출력
    Write-Output @{ ok=$true; message="(stub) settlements list"; channelId=$ChannelId; start=$Start; end=$End }
}

