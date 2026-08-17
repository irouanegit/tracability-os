param(
  [string]$KeyPath = "C:\Users\user\.tauri\tracability-os.key",
  [string]$KeyPassword = "",
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "Tauri updater private key was not found at: $KeyPath"
}

if ($CheckOnly) {
  Write-Host "Signing environment is ready."
  Write-Host "Key path: $KeyPath"
  exit 0
}

$packageJson = Get-Content -Raw -LiteralPath "package.json" | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -LiteralPath "src-tauri\tauri.conf.json" | ConvertFrom-Json
$version = $packageJson.version
$productName = $tauriConfig.productName
$installerPath = "src-tauri\target\release\bundle\nsis\$productName`_$version`_x64-setup.exe"
$signaturePath = "$installerPath.sig"

npm.cmd run tauri build -- --no-sign

if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
  throw "Installer was not found after build: $installerPath"
}

npm.cmd run tauri signer sign -- --private-key-path $KeyPath --password=$KeyPassword $installerPath

if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
  throw "Updater signature was not generated: $signaturePath"
}

Write-Host "Signed release artifacts are ready:"
Write-Host $installerPath
Write-Host $signaturePath
