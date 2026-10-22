<#
==============================================================================
CarePulse MoHFW Outpatient Queue Manager - Automated GitHub Deployment Script
Target Account: arifshaik@gmail.com
==============================================================================
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting CarePulse Automated GitHub Repository Deployment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Initialize Git Repository
if (-not (Test-Path ".git")) {
    Write-Host "--> [1/4] Initializing local git repository..." -ForegroundColor Green
    git init
} else {
    Write-Host "--> [1/4] Git repository already initialized." -ForegroundColor Yellow
}

# 2. Configure Git User Identity
Write-Host "--> [2/4] Setting Git committer identity to arifshaik@gmail.com..." -ForegroundColor Green
git config user.name "Arif Shaik"
git config user.email "arifshaik@gmail.com"

# 3. Stage All Files & Commit
Write-Host "--> [3/4] Staging files and creating initial commit..." -ForegroundColor Green
git add .
try {
    git commit -m "Initial commit: CarePulse MoHFW Queue Manager"
} catch {
    Write-Host "Working directory clean or commit already exists. Proceeding..." -ForegroundColor Yellow
}

# Set branch name to main
git branch -M main

# 4. Create Public Remote Repo & Push with GitHub CLI
Write-Host "--> [4/4] Creating public GitHub repository 'carepulse-queue-manager' and pushing code..." -ForegroundColor Green
gh repo create carepulse-queue-manager --public --source=. --remote=origin --push

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Deployment Complete! Repository is live on GitHub." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
