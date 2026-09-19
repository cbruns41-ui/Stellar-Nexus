param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$demoLog = Join-Path $PSScriptRoot 'start-demo.log'
try {
    Set-Content -LiteralPath $demoLog -Value ("Demo-Start: " + (Get-Date -Format o)) -Encoding UTF8
    $demoNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (-not (Test-Path -LiteralPath $demoNode)) {
        $demoNode = (Get-Command node.exe -ErrorAction Stop).Source
    }
    Add-Content -LiteralPath $demoLog -Value ("Node: " + $demoNode)
    Write-Host 'Galaxien-Demo wird gestartet ...'
    $demoOutput = & $demoNode (Join-Path $PSScriptRoot 'launch.mjs') --no-browser 2>&1
    $demoExitCode = $LASTEXITCODE
    $demoOutput | Out-String | Add-Content -LiteralPath $demoLog
    if ($demoExitCode -ne 0) { throw "Demo-Server meldet Fehler $demoExitCode. $demoOutput" }

    $demoPort = if ($env:ARCHIPELAGO_DEMO_PORT) { [int]$env:ARCHIPELAGO_DEMO_PORT } else { 3122 }
    $demoUrl = "http://127.0.0.1:$demoPort/"
    $demoResponse = Invoke-WebRequest -Uri $demoUrl -UseBasicParsing -TimeoutSec 10
    if ($demoResponse.StatusCode -ne 200 -or $demoResponse.Content -notmatch 'Galaxien-Archipel') {
        throw 'Der Server liefert nicht die erwartete Kartendemo.'
    }
    Add-Content -LiteralPath $demoLog -Value ("HTTP 200: " + $demoUrl)
    if (-not $NoBrowser) {
        $demoChromeCandidates = @(
            (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
        )
        $demoChrome = $demoChromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($demoChrome) {
            # This is the interactive browser window requested by the user.
            Start-Process -FilePath $demoChrome -ArgumentList @('--new-window', $demoUrl) -WindowStyle Normal
            Add-Content -LiteralPath $demoLog -Value ("Chrome gestartet: " + $demoChrome)
        } else {
            Start-Process -FilePath $demoUrl
            Add-Content -LiteralPath $demoLog -Value 'Standardbrowser gestartet.'
        }
    }
    Write-Host $demoUrl
    Add-Content -LiteralPath $demoLog -Value 'Start erfolgreich abgeschlossen.'
    exit 0
} catch {
    $demoMessage = $_.Exception.Message
    Add-Content -LiteralPath $demoLog -Value ("FEHLER: " + $demoMessage) -ErrorAction SilentlyContinue
    Write-Host ("Start fehlgeschlagen: " + $demoMessage) -ForegroundColor Red
    if (-not $NoBrowser) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "Die Galaxien-Demo konnte nicht gestartet werden.`r`n`r`n$demoMessage`r`n`r`nProtokoll: $demoLog",
            'Stellar Nexus - Demo-Start', 'OK', 'Error') | Out-Null
    }
    exit 1
}
