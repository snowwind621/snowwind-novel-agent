# 只负责一件事：先把桌面外壳拉起来，起不来就自动退回浏览器模式。
$根 = Split-Path -Parent $PSScriptRoot
Set-Location $根
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

if (-not (Test-Path "99 构建产物\main.cjs")) {
  Write-Host "首次运行，正在构建…"
  & npm run build
}

$进程 = Start-Process -FilePath "$根\node_modules\electron\dist\electron.exe" -ArgumentList "." -WorkingDirectory $根 -PassThru
Start-Sleep -Seconds 8

if (-not (Get-Process -Id $进程.Id -ErrorAction SilentlyContinue)) {
  Write-Host "桌面外壳没能起来，改用浏览器模式（同一套代码，同一份数据）…"
  if (-not (Test-Path "99 构建产物\预览.cjs")) { & npm run build }
  Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList @("$根\99 构建产物\预览.cjs") -WorkingDirectory $根
  Start-Sleep -Seconds 2
  Start-Process "http://127.0.0.1:5178/"
}