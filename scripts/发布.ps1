# 职场英语教练 — 一键构建并发布到 GitHub（Windows PowerShell 5.1 兼容）
# 用法：在 tools 目录下执行  powershell -ExecutionPolicy Bypass -File .\发布.ps1
# 前提：同目录有 github令牌.txt（含 repo+gist 权限的令牌，不会被打印或上传）

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoName = "english-coach"

# ---------- 0. 令牌 ----------
$tokenFile = Join-Path $root "github令牌.txt"
if (-not (Test-Path $tokenFile)) { Write-Host "错误：找不到 github令牌.txt"; exit 1 }
$tok = (Get-Content $tokenFile -Raw).Trim()
$H = @{ Authorization = "token $tok"; Accept = "application/vnd.github+json"; "User-Agent" = "wec-deploy" }

# ---------- 1. 找 npm ----------
$npm = $null
$c = Get-Command npm -ErrorAction SilentlyContinue
if ($c) { $npm = $c.Source }
if (-not $npm) {
  foreach ($p in @("C:\Users\daisy.zhang01\node.js\node-v24.16.0-win-x64\npm.cmd", "C:\Program Files\nodejs\npm.cmd")) {
    if (Test-Path $p) { $npm = $p; $env:PATH = (Split-Path $p) + ";" + $env:PATH; break }
  }
}
if (-not $npm) { Write-Host "错误：找不到 npm，请先安装 Node.js"; exit 1 }

# ---------- 2. 两版构建 ----------
$app = Join-Path $root "app"
Set-Location $app
Write-Host "构建本地版（含密钥，仅留在本机）..."
& $npm run build | Out-Null
Copy-Item "dist\index.html" (Join-Path $root "职场英语教练.html") -Force

$envFile = Join-Path $app ".env.local"
$hasEnv = Test-Path $envFile
if ($hasEnv) { Rename-Item $envFile "$envFile.bak" }
Write-Host "构建线上版（无密钥）..."
& $npm run build | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root "线上部署") | Out-Null
Copy-Item "dist\index.html" (Join-Path $root "线上部署\index.html") -Force
if ($hasEnv) { Rename-Item "$envFile.bak" $envFile }

# ---------- 3. 密钥泄露校验（铁律） ----------
$leak = Select-String -Path (Join-Path $root "线上部署\index.html") -Pattern "sk-[a-f0-9]{16,}" -Quiet
if ($leak) { Write-Host "⚠️ 线上版检测到疑似密钥，已中止上传！"; exit 1 }
Write-Host "泄露校验通过 ✅"

# ---------- 4. 确保仓库存在 ----------
$user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $H
$owner = $user.login
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repoName" -Headers $H | Out-Null
  Write-Host "仓库已存在：$owner/$repoName"
} catch {
  Write-Host "创建仓库 $owner/$repoName ..."
  $body = [Text.Encoding]::UTF8.GetBytes((@{ name = $repoName; description = "Workplace English Coach - deliberate practice engine"; auto_init = $true } | ConvertTo-Json))
  Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $H -Body $body -ContentType "application/json; charset=utf-8" | Out-Null
  Start-Sleep -Seconds 3
}

# ---------- 5. 上传文件（有则更新，无则创建） ----------
function Publish-File($repoPath, $localPath) {
  if (-not (Test-Path $localPath)) { Write-Host "  跳过（本地不存在）：$localPath"; return }
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($localPath))
  $sha = $null
  try { $sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repoName/contents/$repoPath" -Headers $H).sha } catch {}
  $payload = @{ message = "update $repoPath"; content = $b64 }
  if ($sha) { $payload.sha = $sha }
  $body = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json))
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repoName/contents/$repoPath" -Method Put -Headers $H -Body $body -ContentType "application/json; charset=utf-8" | Out-Null
  Write-Host "  已上传：$repoPath"
}

Write-Host "上传文件..."
Publish-File "index.html"            (Join-Path $root "线上部署\index.html")
Publish-File "README.md"             (Join-Path $root "README-repo.md")
Publish-File "docs/PRD_v2.md"        (Join-Path $root "职场英语教练_PRD_v2.md")
Publish-File "docs/开发文档.md"       (Join-Path $root "开发文档.md")
Publish-File "scripts/发布.ps1"       (Join-Path $root "发布.ps1")
Publish-File "app/package.json"      (Join-Path $app "package.json")
Publish-File "app/package-lock.json" (Join-Path $app "package-lock.json")
Publish-File "app/vite.config.js"    (Join-Path $app "vite.config.js")
Publish-File "app/index.html"        (Join-Path $app "index.html")
Publish-File "app/src/App.jsx"       (Join-Path $app "src\App.jsx")
Publish-File "app/src/main.jsx"      (Join-Path $app "src\main.jsx")

# ---------- 6. 开启 GitHub Pages ----------
try {
  $body = [Text.Encoding]::UTF8.GetBytes((@{ source = @{ branch = "main"; path = "/" } } | ConvertTo-Json))
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repoName/pages" -Method Post -Headers $H -Body $body -ContentType "application/json; charset=utf-8" | Out-Null
  Write-Host "Pages 已开启"
} catch { Write-Host "Pages 已开启过（跳过）" }

$url = "https://$owner.github.io/$repoName/"
Write-Host ""
Write-Host "完成 ✅ 网址：$url"
Write-Host "（首次部署 Pages 生效需 1-3 分钟）"
