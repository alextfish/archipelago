param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = 'public/data/series/generated'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName Microsoft.VisualBasic

function Get-SafeSlug {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $slug = $Text.Trim().ToLowerInvariant()
    $slug = $slug -replace '[^a-z0-9]+', '-'
    $slug = $slug.Trim('-')
    if ([string]::IsNullOrWhiteSpace($slug)) {
        return 'unnamed'
    }
    return $slug
}

function Get-UniqueSlug {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseSlug,

        [Parameter(Mandatory = $true)]
        [hashtable]$UsedSlugs
    )

    if (-not $UsedSlugs.ContainsKey($BaseSlug)) {
        $UsedSlugs[$BaseSlug] = 1
        return $BaseSlug
    }

    $UsedSlugs[$BaseSlug] += 1
    return "$BaseSlug-$($UsedSlugs[$BaseSlug])"
}

function Get-TrimmedCells {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string[]]$Row
    )

    return @($Row | ForEach-Object {
            if ($null -eq $_) { '' } else { $_.Trim() }
        })
}

function Test-EmptyRow {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string[]]$Row
    )

    foreach ($cell in (Get-TrimmedCells -Row $Row)) {
        if ($cell -ne '') {
            return $false
        }
    }
    return $true
}

function Get-SingleTextValue {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string[]]$Row
    )

    $nonEmptyCells = @(Get-TrimmedCells -Row $Row | Where-Object { $_ -ne '' })
    if ($nonEmptyCells.Count -ne 1) {
        return $null
    }

    return $nonEmptyCells[0]
}

function Test-GridCellToken {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Token
    )

    return $Token -match '^(6|4|--|!|see\d+|adj\d+|bri\d+)$'
}

function Test-IslandToken {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Token
    )

    return $Token -match '^(4|see\d+|adj\d+|bri\d+)$'
}

function Get-BridgeSpec {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Token
    )

    $parts = @($Token.Trim() -split '\s+' | Where-Object { $_ -ne '' })
    if ($parts.Count -ne 2) {
        return $null
    }

    if ($parts[0] -match '^(\d+)x$') {
        $count = [int]$matches[1]
        if ($parts[1] -match '^(\d+)$') {
            return @{ count = $count; length = [int]$matches[1] }
        }
    }

    if ($parts[0] -match '^(\d+)$') {
        $length = [int]$matches[1]
        if ($parts[1] -match '^x(\d+)$') {
            return @{ count = [int]$matches[1]; length = $length }
        }
    }

    return $null
}

function New-PuzzleEntry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PuzzleTitle,

        [Parameter(Mandatory = $true)]
        [object[]]$PuzzleRows,

        [Parameter(Mandatory = $true)]
        [hashtable]$UsedPuzzleIds
    )

    $gridRows = @()
    $minColumn = [int]::MaxValue
    $maxColumn = -1
    $bridgeCountsByLength = @{}

    foreach ($row in $PuzzleRows) {
        $hasGridCell = $false
        for ($column = 0; $column -lt $row.Length; $column++) {
            $cell = $row[$column].Trim().ToLowerInvariant()
            if (Test-GridCellToken -Token $cell) {
                $hasGridCell = $true
                if ($column -lt $minColumn) {
                    $minColumn = $column
                }
                if ($column -gt $maxColumn) {
                    $maxColumn = $column
                }
                continue
            }

            $bridgeSpec = Get-BridgeSpec -Token $cell
            if ($null -ne $bridgeSpec) {
                $lengthKey = [string]$bridgeSpec.length
                if (-not $bridgeCountsByLength.ContainsKey($lengthKey)) {
                    $bridgeCountsByLength[$lengthKey] = 0
                }
                $bridgeCountsByLength[$lengthKey] += $bridgeSpec.count
            }
        }

        if ($hasGridCell) {
            $gridRows += ,$row
        }
    }

    if ($gridRows.Count -eq 0) {
        throw "Puzzle '$PuzzleTitle' does not contain any grid rows."
    }

    if ($bridgeCountsByLength.Count -eq 0) {
        throw "Puzzle '$PuzzleTitle' does not contain any bridge inventory definitions."
    }

    $puzzleId = Get-UniqueSlug -BaseSlug (Get-SafeSlug -Text $PuzzleTitle) -UsedSlugs $UsedPuzzleIds
    $islands = @()
    $constraints = @(@{ type = 'AllBridgesPlacedConstraint' })
    $hasBridgeCountConstraint = $false
    $islandCounter = 1

    for ($rowIndex = 0; $rowIndex -lt $gridRows.Count; $rowIndex++) {
        $row = $gridRows[$rowIndex]
        for ($column = $minColumn; $column -le $maxColumn; $column++) {
            $token = ''
            if ($column -lt $row.Length) {
                $token = $row[$column].Trim().ToLowerInvariant()
            }

            if (-not (Test-IslandToken -Token $token)) {
                continue
            }

            $islandId = "I$islandCounter"
            $islandCounter += 1
            $islandConstraints = @()

            if ($token -match '^see(\d+)$') {
                $count = [int]$matches[1]
                $islandConstraints += "num_visible=$count"
                $constraints += @{
                    type = 'IslandVisibilityConstraint'
                    params = @{ islandId = $islandId; count = $count }
                }
            }
            elseif ($token -match '^adj(\d+)$') {
                $count = [int]$matches[1]
                $islandConstraints += "num_passing=$count"
                $islandConstraints += 'direction=adjacent'
                $constraints += @{
                    type = 'IslandPassingBridgeCountConstraint'
                    params = @{ islandId = $islandId; direction = 'adjacent'; count = $count }
                }
            }
            elseif ($token -match '^bri(\d+)$') {
                $count = [int]$matches[1]
                $islandConstraints += "num_bridges=$count"
                $hasBridgeCountConstraint = $true
            }

            $island = [ordered]@{
                id = $islandId
                x = ($column - $minColumn) + 1
                y = $rowIndex + 1
            }

            if ($islandConstraints.Count -gt 0) {
                $island.constraints = $islandConstraints
            }

            $islands += $island
        }
    }

    if ($hasBridgeCountConstraint) {
        $constraints += @{ type = 'IslandBridgeCountConstraint' }
    }

    $bridgeTypes = @()
    foreach ($length in ($bridgeCountsByLength.Keys | Sort-Object { [int]$_ })) {
        $bridgeTypes += [ordered]@{
            id = "bridge-length-$length"
            colour = '#8B4513'
            length = [int]$length
            count = [int]$bridgeCountsByLength[$length]
            width = 1
        }
    }

    $cleanTitle = $PuzzleTitle.Trim().TrimEnd(':').Trim()
    return [ordered]@{
        id = $puzzleId
        title = $cleanTitle
        description = "Generated from CSV puzzle '$cleanTitle'"
        puzzleData = [ordered]@{
            id = $puzzleId
            type = 'standard'
            size = [ordered]@{
                width = ($maxColumn - $minColumn) + 1
                height = $gridRows.Count
            }
            islands = $islands
            bridgeTypes = $bridgeTypes
            constraints = $constraints
            maxNumBridges = 2
        }
    }
}

function Get-CsvRows {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $rows = @()
    $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($Path)
    try {
        $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
        $parser.SetDelimiters(',')
        $parser.HasFieldsEnclosedInQuotes = $true

        while (-not $parser.EndOfData) {
            $rows += ,($parser.ReadFields())
        }
    }
    finally {
        $parser.Close()
    }

    return $rows
}

$resolvedInputPath = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path -Path (Get-Location) -ChildPath $OutputDir
}

New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

$rows = Get-CsvRows -Path $resolvedInputPath
$seriesCollection = @()
$currentSeries = $null
$currentPuzzleTitle = $null
$currentPuzzleRows = @()
$usedSeriesSlugs = @{}

function Complete-CurrentPuzzle {
    if ($null -eq $currentSeries -or $null -eq $currentPuzzleTitle) {
        return
    }

    $entry = New-PuzzleEntry -PuzzleTitle $currentPuzzleTitle -PuzzleRows $currentPuzzleRows -UsedPuzzleIds $currentSeries.usedPuzzleIds
    $currentSeries.puzzles += $entry
    $script:currentPuzzleTitle = $null
    $script:currentPuzzleRows = @()
}

function Complete-CurrentSeries {
    if ($null -eq $currentSeries) {
        return
    }

    Complete-CurrentPuzzle
    if ($currentSeries.puzzles.Count -gt 0) {
        for ($index = 0; $index -lt $currentSeries.puzzles.Count; $index++) {
            if ($index -eq 0) {
                $currentSeries.puzzles[$index].requiredPuzzles = @()
            }
            else {
                $currentSeries.puzzles[$index].requiredPuzzles = @($currentSeries.puzzles[$index - 1].id)
            }
        }

        $seriesJson = [ordered]@{
            id = $currentSeries.id
            title = $currentSeries.title
            description = "Generated from CSV NPC section '$($currentSeries.title)'"
            puzzles = $currentSeries.puzzles
            metadata = [ordered]@{
                tags = @('generated', 'csv-import')
            }
        }

        $jsonPath = Join-Path -Path $resolvedOutputDir -ChildPath "$($currentSeries.id).json"
        $jsonText = $seriesJson | ConvertTo-Json -Depth 20
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($jsonPath, $jsonText, $utf8NoBom)
        $script:seriesCollection += $seriesJson
        Write-Output "Wrote $jsonPath"
    }

    $script:currentSeries = $null
}

foreach ($row in $rows) {
    if (Test-EmptyRow -Row $row) {
        Complete-CurrentPuzzle
        continue
    }

    $singleValue = Get-SingleTextValue -Row $row
    if ($null -ne $singleValue) {
        if ($singleValue.StartsWith('NPC:', [System.StringComparison]::OrdinalIgnoreCase)) {
            Complete-CurrentSeries
            $seriesTitle = $singleValue.Substring(4).Trim()
            $seriesId = Get-UniqueSlug -BaseSlug (Get-SafeSlug -Text $seriesTitle) -UsedSlugs $usedSeriesSlugs
            $currentSeries = [ordered]@{
                id = $seriesId
                title = $seriesTitle
                puzzles = @()
                usedPuzzleIds = @{}
            }
            continue
        }

        Complete-CurrentPuzzle
        $currentPuzzleTitle = $singleValue.Trim()
        $currentPuzzleRows = @()
        continue
    }

    if ($null -eq $currentSeries -or $null -eq $currentPuzzleTitle) {
        continue
    }

    $currentPuzzleRows += ,$row
}

Complete-CurrentSeries