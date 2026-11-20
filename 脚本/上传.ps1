# 只负责一件事：把本仓库推到指定 GitHub 仓库（首次推送自动设好 upstream）。
# 用法：powershell -File 脚本\上传.ps1 -仓库 "https://github.com/你的名字/snowwind-novel-agent.git"
param(
  [Parameter(Mandatory = $true)][string]$仓库
)

$根 = Split-Path -Parent $PSScriptRoot
Set-Location $根

if (-not (Test-Path ".git")) {
  Write-Host "这里还不是 Git 仓库，先初始化。"
  git init -q
  git branch -m main
  git add -A
  git commit -qm "初始提交"
}

$现有 = git remote get-url origin 2>$null
if ($现有) {
  git remote set-url origin $仓库
} else {
  git remote add origin $仓库
}
Write-Host "origin = $仓库"
git push -u origin main
Write-Host "完成。如果卡在登录，请在弹窗里授权，或改用 SSH 地址（git@github.com:名字/仓库.git）。"
