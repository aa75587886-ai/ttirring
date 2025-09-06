# ttirring-tools.ps1
# ✅ 'start' 별칭 제거 → Start-Process 사용
# ✅ Soft-Dispatch → Invoke-SoftDispatch 로 리네임

function Get-TtirringPort {
    if ($env:PORT) { return [int]$env:PORT }
    return 3002
}

function Open-TtirringDocs {
    $port = Get-TtirringPort
    $url  = "http://127.0.0.1:$port/docs"
    Start-Process $url
}

function Invoke-SoftDispatch {
    param(
        [Parameter(Mandatory=$true)][string]$DriverId,
        [Parameter(Mandatory=$true)][string]$JobId,
        [string]$ChannelId = "CH-01",
        [int]$Port
    )
    if (-not $Port) { $Port = Get-TtirringPort }
    $base = "http://127.0.0.1:$Port"
    $body = @{ driverId=$DriverId; jobId=$JobId; channelId=$ChannelId } | ConvertTo-Json
    $ct   = "application/json; charset=utf-8"
    Invoke-RestMethod -Method Post -Uri "$base/v1/dispatch/soft" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType $ct
}

function Get-Health {
    param([int]$Port)
    if (-not $Port) { $Port = Get-TtirringPort }
    Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health"
}

# 편의: 문서 자동 열기
function Start-Ttirring {
    param([int]$Port)
    if ($Port) { $env:PORT = $Port }
    Open-TtirringDocs
}
