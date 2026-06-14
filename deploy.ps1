# Firebase setup + deploy helper for Tic Tac Toe
# Run from project folder:  .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== Tic Tac Toe - Firebase Deploy ===" -ForegroundColor Cyan
Write-Host ""

function Get-ConfigProjectId {
    $config = Get-Content "firebase-config.js" -Raw
    if ($config -match "projectId:\s*['`"]([^'`"]+)['`"]") {
        return $Matches[1]
    }
    return $null
}

# 1. Firebase login
$login = firebase login:list 2>&1 | Out-String
if ($login -match "No authorized accounts") {
    Write-Host "Step 1: Log in to Firebase (browser will open)..." -ForegroundColor Yellow
    Write-Host ""
    firebase login
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    $account = ($login | Select-String "Logged in as (.+)").Matches.Groups[1].Value
    Write-Host "Step 1: Logged in as $account" -ForegroundColor Green
    Write-Host ""
}

# 2. Resolve project ID from firebase-config.js
$configProjectId = Get-ConfigProjectId
if ([string]::IsNullOrWhiteSpace($configProjectId)) {
    Write-Host "Could not read projectId from firebase-config.js" -ForegroundColor Red
    exit 1
}

Write-Host "Step 2: Project from firebase-config.js -> $configProjectId" -ForegroundColor Cyan
Write-Host ""

# 3. Check project access
Write-Host "Checking access to Firebase project..." -ForegroundColor Yellow
$projectsJson = firebase projects:list --json 2>&1 | Out-String
$hasAccess = $false

try {
    $parsed = $projectsJson | ConvertFrom-Json
    if ($parsed.result) {
        foreach ($p in $parsed.result) {
            if ($p.projectId -eq $configProjectId) {
                $hasAccess = $true
                break
            }
        }
    }
} catch {
    # fall through to deploy attempt
}

if (-not $hasAccess) {
    Write-Host ""
    Write-Host "ACCESS PROBLEM DETECTED" -ForegroundColor Red
    Write-Host "Your CLI account cannot see or access '$configProjectId'." -ForegroundColor Red
    Write-Host ""
    Write-Host "This usually means the Firebase project was created with a DIFFERENT Google account."
    Write-Host ""
    Write-Host "Fix option A - log in with the account that owns the project:"
    Write-Host "  firebase logout"
    Write-Host "  firebase login"
    Write-Host "  .\deploy.ps1"
    Write-Host ""
    Write-Host "Fix option B - add this account as a member (from Firebase Console as owner):"
    Write-Host "  Project settings -> Users and permissions -> Add member"
    Write-Host "  Add your Google account with Editor or Owner role"
    Write-Host ""
    Write-Host "Fix option C - create a NEW Firebase project under your current account,"
    Write-Host "  then update firebase-config.js with the new web app config."
    Write-Host ""
    $tryAnyway = Read-Host 'Try deploy anyway? (y/n)'
    if ($tryAnyway -ne 'y') { exit 1 }
}

firebase use $configProjectId
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Could not select project '$configProjectId'." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Using project: $configProjectId" -ForegroundColor Green
Write-Host ""

# 4. Check firebase-config.js placeholders
$config = Get-Content "firebase-config.js" -Raw
if ($config -match "YOUR_API_KEY|YOUR_PROJECT") {
    Write-Host "Step 3: WARNING - firebase-config.js still has placeholder values." -ForegroundColor Red
    Write-Host ""
    $continue = Read-Host 'Deploy hosting anyway? (y/n)'
    if ($continue -ne "y") { exit 0 }
} else {
    Write-Host "Step 3: firebase-config.js looks configured." -ForegroundColor Green
    Write-Host ""
}

# 5. Deploy
Write-Host "Step 4: Deploying to Firebase Hosting + Database rules..." -ForegroundColor Yellow
Write-Host ""
npm run deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Deploy failed." -ForegroundColor Red
    Write-Host "If you saw 'permission' or '403', use the Fix options above." -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== Deploy complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Your game should be live at:"
Write-Host "  https://$configProjectId.web.app"
Write-Host "  https://$configProjectId.firebaseapp.com"
Write-Host ""
