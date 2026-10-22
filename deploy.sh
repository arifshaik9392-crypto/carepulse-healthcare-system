#!/usr/bin/env bash
# ==============================================================================
# CarePulse MoHFW Outpatient Queue Manager - Automated GitHub Deployment Script
# Target Account: arifshaik@gmail.com
# ==============================================================================

set -e

echo "=========================================================="
echo " Starting CarePulse Automated GitHub Repository Deployment"
echo "=========================================================="

# 1. Initialize Git Repository
if [ ! -d ".git" ]; then
    echo "--> [1/4] Initializing local git repository..."
    git init
else
    echo "--> [1/4] Git repository already initialized."
fi

# 2. Configure Git User Identity
echo "--> [2/4] Setting Git committer identity..."
git config user.name "Arif Shaik"
git config user.email "arifshaik@gmail.com"

# 3. Stage All Files & Commit
echo "--> [3/4] Staging files and creating initial commit..."
git add .
git commit -m "Initial commit: CarePulse MoHFW Queue Manager" || echo "Working tree clean, proceeding..."

# Set branch to main
git branch -M main

# 4. Create Public Remote Repo & Push with GitHub CLI
echo "--> [4/4] Creating public GitHub repository 'carepulse-queue-manager' and pushing..."
gh repo create carepulse-queue-manager --public --source=. --remote=origin --push

echo "=========================================================="
echo " Deployment Complete! Repository is live on GitHub."
echo "=========================================================="
