@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\预览.cjs" (
  echo 首次运行，正在构建……
  call npm run build
)
start "" http://127.0.0.1:5178/
node "dist\预览.cjs"
