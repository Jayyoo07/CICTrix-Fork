# Generates docs/plans/index.html from the plan files' frontmatter.
# Run after any plan or session-summary change:
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1
# Never hand-edit index.html; this script owns it.
#
# Keep this file ASCII-only. Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI,
# so any non-ASCII character in the source is mangled in the output.
#
# Reads:  docs/plans/*.md (skips files starting with _), docs/session-summaries/*.md
# Writes: docs/plans/index.html

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$plansDir    = $PSScriptRoot
$docsDir     = Split-Path -Parent $plansDir
$summariesDir = Join-Path $docsDir 'session-summaries'
$outFile     = Join-Path $plansDir 'index.html'

function ConvertTo-HtmlText {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return '' }
    $Text = $Text -replace '&', '&amp;'
    $Text = $Text -replace '<', '&lt;'
    $Text = $Text -replace '>', '&gt;'
    $Text = $Text -replace '"', '&quot;'
    return $Text
}

# Reads the YAML-ish frontmatter block at the top of a markdown file.
# Only flat `key: value` lines are supported, which is all the template uses.
function Get-FrontMatter {
    param([string]$Path)

    $meta = @{}
    $lines = Get-Content -LiteralPath $Path -Encoding UTF8
    if ($lines.Count -lt 2 -or $lines[0].Trim() -ne '---') { return $meta }

    for ($i = 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line.Trim() -eq '---') { break }
        if ($line -match '^\s*#') { continue }
        $idx = $line.IndexOf(':')
        if ($idx -lt 1) { continue }
        $key = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($key) { $meta[$key] = $value }
    }
    return $meta
}

function Get-DocEntry {
    param([System.IO.FileInfo]$File)

    $meta = Get-FrontMatter -Path $File.FullName
    $title = $meta['title']
    if ([string]::IsNullOrWhiteSpace($title)) {
        # Older summaries have no frontmatter; their first H1 is the title.
        $heading = Get-Content -LiteralPath $File.FullName -Encoding UTF8 |
            Where-Object { $_ -match '^#\s+\S' } |
            Select-Object -First 1
        if ($heading) { $title = ($heading -replace '^#\s+', '').Trim() }
    }
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
    }

    $date = $meta['date']
    if ([string]::IsNullOrWhiteSpace($date)) {
        # Fall back to the YYYY-MM-DD prefix of the filename.
        if ($File.Name -match '^(\d{4}-\d{2}-\d{2})') { $date = $Matches[1] }
        else { $date = '' }
    }

    $status = $meta['status']
    if ([string]::IsNullOrWhiteSpace($status)) { $status = 'Unknown' }

    [pscustomobject]@{
        File    = $File.Name
        Title   = $title
        Date    = $date
        Status  = $status
        Summary = [string]$meta['summary']
        Plan    = [string]$meta['plan']
        SortKey = $(if ($date) { $date } else { '0000-00-00' })
    }
}

function Get-StatusClass {
    param([string]$Status)
    switch -Regex ($Status.Trim().ToLowerInvariant()) {
        '^done|complete'      { return 'success' }
        '^in progress|^active' { return 'info' }
        '^approved'           { return 'primary' }
        '^blocked|^cancel'    { return 'danger' }
        '^draft'              { return 'neutral' }
        default               { return 'neutral' }
    }
}

$plans = @(Get-ChildItem -LiteralPath $plansDir -Filter '*.md' -File |
    Where-Object { -not $_.Name.StartsWith('_') } |
    ForEach-Object { Get-DocEntry -File $_ })
$plans = @($plans | Sort-Object -Property @{ Expression = 'SortKey'; Descending = $true }, @{ Expression = 'File'; Descending = $true })

$summaries = @()
if (Test-Path -LiteralPath $summariesDir) {
    $summaries = @(Get-ChildItem -LiteralPath $summariesDir -Filter '*.md' -File |
        Where-Object { -not $_.Name.StartsWith('_') } |
        ForEach-Object { Get-DocEntry -File $_ })
    $summaries = @($summaries | Sort-Object -Property @{ Expression = 'SortKey'; Descending = $true }, @{ Expression = 'File'; Descending = $true })
}

function New-Rows {
    param($Entries, [string]$HrefPrefix, [switch]$ShowStatus)

    $sb = New-Object System.Text.StringBuilder
    foreach ($e in $Entries) {
        $body = '<a href="{0}{1}">{2}</a>' -f $HrefPrefix, [uri]::EscapeDataString($e.File), (ConvertTo-HtmlText $e.Title)
        if ($e.Summary) {
            $body += '<p class="summary">' + (ConvertTo-HtmlText $e.Summary) + '</p>'
        }
        if ($e.Plan) {
            $planFile = [System.IO.Path]::GetFileName([string]$e.Plan)
            $body += '<p class="meta">Plan: <a href="{0}">{1}</a></p>' -f [uri]::EscapeDataString($planFile), (ConvertTo-HtmlText $planFile)
        }

        $null = $sb.AppendLine('      <tr>')
        $null = $sb.AppendLine(('        <td class="date">{0}</td>' -f (ConvertTo-HtmlText $e.Date)))
        $null = $sb.AppendLine(('        <td>{0}</td>' -f $body))
        if ($ShowStatus) {
            $null = $sb.AppendLine(('        <td class="status"><span class="badge badge-{0}">{1}</span></td>' -f (Get-StatusClass -Status $e.Status), (ConvertTo-HtmlText $e.Status)))
        }
        $null = $sb.AppendLine('      </tr>')
    }
    return $sb.ToString().TrimEnd()
}

$planCount = @($plans).Count
$doneCount = @($plans | Where-Object { $_.Status -match '^(Done|Complete)' }).Count

$planRows = New-Rows -Entries $plans -HrefPrefix '' -ShowStatus
$summaryRows = New-Rows -Entries $summaries -HrefPrefix '../session-summaries/'

$css = @'
    :root {
      --color-primary: #363EE8;
      --color-primary-700: #191FA8;
      --color-primary-50: #EEF0FF;
      --text-primary: #111827;
      --text-secondary: #4B5563;
      --text-tertiary: #6B7280;
      --bg-page: #F7F8FA;
      --bg-surface: #FFFFFF;
      --border-subtle: #E5E7EB;
      --success-100: #DCFCE7; --success-700: #0F7A40;
      --warning-100: #FCE8C8; --warning-700: #A8590A;
      --info-100: #E0E5FF; --info-700: #191FA8;
      --error-100: #FDE2E1; --error-700: #A11212;
      --neutral-100: #F0F1F4; --neutral-700: #4B5563;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 24px 64px;
      background: var(--bg-page);
      color: var(--text-primary);
      font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    main { max-width: 1080px; margin: 0 auto; }
    h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -0.01em; }
    .lede { margin: 0 0 28px; color: var(--text-secondary); }
    .counts { color: var(--text-tertiary); font-size: 13px; }
    section { margin-bottom: 40px; }
    h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); }
    table { width: 100%; border-collapse: collapse; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 10px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 16px; vertical-align: top; border-bottom: 1px solid var(--border-subtle); }
    th { background: var(--color-primary-50); color: var(--color-primary-700); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    tbody tr:last-child td { border-bottom: 0; }
    td.date { white-space: nowrap; color: var(--text-tertiary); font-variant-numeric: tabular-nums; width: 112px; }
    td a { color: var(--color-primary); text-decoration: none; font-weight: 600; }
    td a:hover { text-decoration: underline; }
    .summary { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; }
    .meta { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; }
    .meta a { font-weight: 500; color: var(--text-tertiary); }
    td.status { width: 132px; }
    .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .badge-success { background: var(--success-100); color: var(--success-700); }
    .badge-warning { background: var(--warning-100); color: var(--warning-700); }
    .badge-info    { background: var(--info-100);    color: var(--info-700); }
    .badge-primary { background: var(--color-primary-50); color: var(--color-primary-700); }
    .badge-danger  { background: var(--error-100);   color: var(--error-700); }
    .badge-neutral { background: var(--neutral-100); color: var(--neutral-700); }
    .empty { padding: 20px 16px; color: var(--text-tertiary); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 10px; }
    footer { margin-top: 8px; color: var(--text-tertiary); font-size: 12px; }
'@

function New-TableSection {
    param([string]$Heading, [string]$Rows, [string]$ColumnLabel, [string]$EmptyMessage, [switch]$ShowStatus)

    $sb = New-Object System.Text.StringBuilder
    $null = $sb.AppendLine('    <section>')
    $null = $sb.AppendLine(('      <h2>{0}</h2>' -f (ConvertTo-HtmlText $Heading)))
    if ($Rows) {
        $null = $sb.AppendLine('      <table>')
        if ($ShowStatus) {
            $null = $sb.AppendLine(('        <thead><tr><th>Date</th><th>{0}</th><th>Status</th></tr></thead>' -f (ConvertTo-HtmlText $ColumnLabel)))
        }
        else {
            $null = $sb.AppendLine(('        <thead><tr><th>Date</th><th>{0}</th></tr></thead>' -f (ConvertTo-HtmlText $ColumnLabel)))
        }
        $null = $sb.AppendLine('        <tbody>')
        $null = $sb.AppendLine($Rows)
        $null = $sb.AppendLine('        </tbody>')
        $null = $sb.AppendLine('      </table>')
    }
    else {
        $null = $sb.AppendLine(('      <p class="empty">{0}</p>' -f (ConvertTo-HtmlText $EmptyMessage)))
    }
    $null = $sb.AppendLine('    </section>')
    return $sb.ToString().TrimEnd()
}

$page = New-Object System.Text.StringBuilder
$null = $page.AppendLine('<!DOCTYPE html>')
$null = $page.AppendLine('<html lang="en">')
$null = $page.AppendLine('<head>')
$null = $page.AppendLine('  <meta charset="utf-8">')
$null = $page.AppendLine('  <meta name="viewport" content="width=device-width, initial-scale=1">')
$null = $page.AppendLine('  <title>Plans - CICTrix HRIS</title>')
$null = $page.AppendLine('  <!-- Generated by build-plans-index.ps1. Do not edit by hand. -->')
$null = $page.AppendLine('  <style>')
$null = $page.AppendLine($css)
$null = $page.AppendLine('  </style>')
$null = $page.AppendLine('</head>')
$null = $page.AppendLine('<body>')
$null = $page.AppendLine('  <main>')
$null = $page.AppendLine('    <h1>Plans</h1>')
$null = $page.AppendLine('    <p class="lede">Feature plans and their session summaries. Newest first.</p>')
$null = $page.AppendLine(('    <p class="counts">{0} plans &middot; {1} done</p>' -f $planCount, $doneCount))
$null = $page.AppendLine()
$null = $page.AppendLine((New-TableSection -Heading 'Plans' -Rows $planRows -ColumnLabel 'Plan' -EmptyMessage 'No plan files yet.' -ShowStatus))
$null = $page.AppendLine()
$null = $page.AppendLine((New-TableSection -Heading 'Session summaries' -Rows $summaryRows -ColumnLabel 'Summary' -EmptyMessage 'No session summaries yet.'))
$null = $page.AppendLine()
$null = $page.AppendLine('    <footer>Regenerate with <code>powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1</code></footer>')
$null = $page.AppendLine('  </main>')
$null = $page.AppendLine('</body>')
$null = $page.AppendLine('</html>')

$html = $page.ToString()

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $html, $utf8NoBom)

Write-Host ("Wrote {0} ({1} plans, {2} summaries)" -f $outFile, $planCount, @($summaries).Count)
