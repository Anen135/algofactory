#requires -Version 7.0
<#
.SYNOPSIS
Publishes the committed Data Factory project through GitHub CLI and Actions.
.EXAMPLE
pwsh -File ./scripts/publish-pages.ps1 -Owner Anen135 -Repository algofactory -CreateRepository
.EXAMPLE
pwsh -File ./scripts/publish-pages.ps1
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9_.-]+$')][string]$Repository = 'algofactory',
    [ValidatePattern('^[a-zA-Z0-9-]*$')][string]$Owner = '',
    [switch]$CreateRepository,
    [switch]$SkipChecks,
    [switch]$NoWait,
    [ValidateRange(1, 60)][int]$TimeoutMinutes = 15
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Invoke-Cli {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments[0]) failed (exit $LASTEXITCODE)." }
}

function Invoke-ProjectGit {
    param([string[]]$Arguments)
    Invoke-Cli -File git -Arguments (@('-c', "safe.directory=$projectRoot") + $Arguments)
}

function Get-GitHubJson {
    param([string]$Endpoint, [switch]$AllowNotFound)
    $lines = & gh api $Endpoint 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = $lines -join "`n"
        if ($AllowNotFound -and $message -match 'HTTP 404') { return $null }
        throw "GitHub API $Endpoint failed: $message"
    }
    return (($lines -join "`n") | ConvertFrom-Json)
}

Push-Location $projectRoot
try {
    foreach ($tool in @('git', 'gh', 'npm')) { $null = Get-Command $tool -ErrorAction Stop }
    Invoke-Cli gh @('auth', 'status', '--hostname', 'github.com') | Out-Host
    if (!$Owner) { $Owner = (Get-GitHubJson 'user').login }
    $slug = "$Owner/$Repository"
    $branch = (Invoke-ProjectGit @('branch', '--show-current')).Trim()
    if (!$branch) { throw 'Detached HEAD: switch to the branch you want to publish.' }
    $head = (Invoke-ProjectGit @('rev-parse', 'HEAD')).Trim()
    $dirty = @(Invoke-ProjectGit @('status', '--porcelain'))
    if ($dirty.Count) { throw 'Commit or stash working-tree changes before publishing. This script never commits your files automatically.' }
    if (!(Test-Path '.github/workflows/pages.yml')) { throw 'Missing Pages workflow: .github/workflows/pages.yml' }

    $remotes = @(Invoke-ProjectGit @('remote'))
    $hasOrigin = $remotes -contains 'origin'
    if ($hasOrigin) {
        $origin = (Invoke-ProjectGit @('remote', 'get-url', 'origin')).Trim()
        $allowedOrigins = @("https://github.com/$slug.git", "https://github.com/$slug", "git@github.com:$slug.git")
        if ($origin -notin $allowedOrigins) { throw "origin points to '$origin', not '$slug'. Refusing to change it automatically." }
    }

    if (!$SkipChecks) {
        if (!(Test-Path node_modules)) { Invoke-Cli npm @('ci') | Out-Host }
        Invoke-Cli npm @('run', 'typecheck') | Out-Host
        Invoke-Cli npm @('test') | Out-Host
        Invoke-Cli npm @('run', 'build') | Out-Host
    }

    Write-Host "Publishing $slug from $branch ($head)"
    $repo = Get-GitHubJson "repos/$slug" -AllowNotFound
    if ($null -eq $repo) {
        if (!$CreateRepository) { throw "Repository $slug does not exist. Pass -CreateRepository to create a public repository." }
        Invoke-Cli gh @('repo', 'create', $slug, '--public', '--description', 'Data Factory: learn programming by building a working data factory.') | Out-Host
    }
    elseif (!$hasOrigin -and $repo.size -gt 0) {
        throw "Existing repository $slug has contents but is not origin. Connect and review it manually first."
    }
    if (!$hasOrigin) { Invoke-ProjectGit @('remote', 'add', 'origin', "https://github.com/$slug.git") | Out-Host }

    # Use the authenticated gh credential provider without changing global Git config.
    Invoke-ProjectGit @('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '--set-upstream', 'origin', "HEAD:refs/heads/$branch") | Out-Host

    $pages = Get-GitHubJson "repos/$slug/pages" -AllowNotFound
    if ($null -eq $pages) {
        Invoke-Cli gh @('api', '--method', 'POST', "repos/$slug/pages", '-f', 'build_type=workflow') | Out-Null
    }
    elseif ($pages.build_type -ne 'workflow') {
        Invoke-Cli gh @('api', '--method', 'PUT', "repos/$slug/pages", '-f', 'build_type=workflow') | Out-Null
    }

    # A newly pushed workflow can take a few seconds to be indexed by GitHub.
    $workflow = $null
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $workflow = Get-GitHubJson "repos/$slug/actions/workflows/pages.yml" -AllowNotFound
        if ($null -ne $workflow) { break }
        Start-Sleep -Seconds 5
    }
    if ($null -eq $workflow) { throw 'Pages workflow was not indexed. Check that pages.yml exists on the default branch, then retry.' }

    $deploymentId = [guid]::NewGuid().ToString('N')
    Invoke-Cli gh @('workflow', 'run', 'pages.yml', '--repo', $slug, '--ref', $branch, '-f', "deployment_id=$deploymentId") | Out-Host
    if ($NoWait) { Write-Host "Deployment requested. Follow: https://github.com/$slug/actions"; return }

    $deadline = [DateTime]::UtcNow.AddMinutes($TimeoutMinutes)
    $run = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $json = Invoke-Cli gh @('run', 'list', '--repo', $slug, '--workflow', 'pages.yml', '--branch', $branch, '--event', 'workflow_dispatch', '--limit', '20', '--json', 'databaseId,headSha,status,conclusion,url,displayTitle')
        $runs = ($json -join "`n") | ConvertFrom-Json
        $run = @($runs | Where-Object { $_.headSha -eq $head -and $_.displayTitle.Contains($deploymentId) } | Select-Object -First 1)
        if ($run.Count) {
            $run = $run[0]
            Write-Host "Deployment: $($run.status) $($run.conclusion) - $($run.url)"
            if ($run.status -eq 'completed') {
                if ($run.conclusion -ne 'success') { throw "Deployment failed: $($run.url). Inspect with: gh run view $($run.databaseId) -R $slug --log-failed" }
                break
            }
        }
        Start-Sleep -Seconds 10
    }
    if ($null -eq $run -or $run -is [array] -or $run.status -ne 'completed') { throw "Timed out waiting for deployment. Check https://github.com/$slug/actions" }

    $pages = Get-GitHubJson "repos/$slug/pages"
    $siteUrl = $pages.html_url
    $available = $false
    for ($attempt = 0; $attempt -lt 18; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $siteUrl -TimeoutSec 20
            if ($response.StatusCode -eq 200 -and $response.Content -match 'Data Factory') { $available = $true; break }
        } catch { Write-Host 'Waiting for Pages to become available...' }
        Start-Sleep -Seconds 5
    }
    if (!$available) { throw "Workflow succeeded, but the page is not available yet: $siteUrl" }
    Write-Host "Published: $siteUrl"
    Write-Host "Repository: https://github.com/$slug"
    Write-Host "Workflow: $($run.url)"
}
finally { Pop-Location }
