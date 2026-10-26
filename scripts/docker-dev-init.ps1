$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvFile = Join-Path $Root ".env.docker"
$ExampleFile = Join-Path $Root ".env.docker.example"

function New-Hex([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
    }
    finally {
        $rng.Dispose()
    }
    return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

if (Test-Path -LiteralPath $EnvFile) {
    Write-Host ".env.docker existe deja : aucune modification."
    exit 0
}

$content = Get-Content -LiteralPath $ExampleFile -Raw -Encoding UTF8
$content = $content -replace "(?m)^POSTGRES_PASSWORD=.*$", "POSTGRES_PASSWORD=$(New-Hex 16)"
$content = $content -replace "(?m)^CONFIG_MASTER_KEY=.*$", "CONFIG_MASTER_KEY=$(New-Hex 32)"
$content = $content -replace "(?m)^SESSION_SECRET=.*$", "SESSION_SECRET=$(New-Hex 32)"
$content = $content -replace "(?m)^LINK_TOKEN_KEY=.*$", "LINK_TOKEN_KEY=$(New-Hex 32)"
$content = $content -replace "(?m)^AI_PROVIDER_KEY=.*$", "AI_PROVIDER_KEY=$(New-Hex 32)"
$content = $content -replace "(?m)^WEBHOOK_SECRET_KEY=.*$", "WEBHOOK_SECRET_KEY=$(New-Hex 32)"
$adminPassword = "Admin-$(New-Hex 8)"
$content = $content -replace "(?m)^DEFAULT_ADMIN_PASSWORD=.*$", "DEFAULT_ADMIN_PASSWORD=$adminPassword"

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($EnvFile, $content, $utf8)

Write-Host "Fichier .env.docker genere (non versionne)."
Write-Host "Admin : admin@example.com"
Write-Host "Mot de passe : $adminPassword"
Write-Host ""
Write-Host "Demarrer l'environnement :"
Write-Host "  docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d"
