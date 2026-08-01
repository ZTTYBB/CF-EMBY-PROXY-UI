#Requires -RunAsAdministrator

param(
  [int]$Port = 5173,
  [string]$ListenAddress = "127.0.0.1",
  [string]$Distro = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Port -le 0) {
  throw "Port must be greater than zero."
}

function Get-WslIp {
  param([string]$TargetDistro)

  if ([string]::IsNullOrWhiteSpace($TargetDistro)) {
    $wslArgs = @("--", "hostname", "-I")
  }
  else {
    $wslArgs = @("-d", $TargetDistro, "--", "hostname", "-I")
  }

  $raw = & wsl.exe @wslArgs
  if ($LASTEXITCODE -ne 0) {
    throw "wsl.exe failed while resolving the WSL IP address."
  }

  $ip = (($raw -join " ") -split "\s+" | Where-Object { $_ } | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($ip)) {
    throw "Unable to resolve the WSL IP address. Start the target distribution first."
  }

  $parsedIp = $null
  if (-not [System.Net.IPAddress]::TryParse($ip, [ref]$parsedIp) -or
      $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw "wsl.exe returned an invalid IPv4 address: $ip"
  }

  return $parsedIp.IPAddressToString
}

$wslIp = Get-WslIp -TargetDistro $Distro

Write-Host "WSL IP: $wslIp"
Write-Host "Refreshing Windows portproxy for http://${ListenAddress}:$Port ..."

& netsh interface portproxy delete v4tov4 listenaddress=$ListenAddress listenport=$Port 2>$null | Out-Null
& netsh interface portproxy add v4tov4 listenaddress=$ListenAddress listenport=$Port connectaddress=$wslIp connectport=$Port | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "netsh failed to create the Windows portproxy rule."
}

Write-Host ""
Write-Host "Windows portproxy updated:"
Write-Host "  http://${ListenAddress}:$Port"
Write-Host ""
Write-Host "For LAN access, explicitly use listenaddress 0.0.0.0 and configure the firewall."
