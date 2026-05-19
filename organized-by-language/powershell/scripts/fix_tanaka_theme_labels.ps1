$ErrorActionPreference = "Stop"

$base = "http://10.158.102.176:3000"
$flask = "http://10.158.102.176:8000"
$user = "tanaka"
$theme = "これからのエネルギーの作り方を考える"

$encUser = [uri]::EscapeDataString($user)
$encTheme = [uri]::EscapeDataString($theme)
$getUrl = "${base}/users/${encUser}/themes/${encTheme}?language=ja"

$themeRes = Invoke-RestMethod -Method Get -Uri $getUrl
if (-not $themeRes.content) {
  throw "theme content is empty"
}

$content = $themeRes.content
$nodes = @()
if ($content.keywordNodes) {
  $nodes = @($content.keywordNodes)
} elseif ($content.nodes) {
  $nodes = @($content.nodes)
}
$edges = @()
if ($content.edges) {
  $edges = @($content.edges)
}

$labels = New-Object System.Collections.Generic.List[string]
foreach ($n in $nodes) {
  $v = [string]$n.label
  if (-not [string]::IsNullOrWhiteSpace($v)) {
    [void]$labels.Add($v.Trim())
  }
}
foreach ($e in $edges) {
  $v = [string]$e.label
  if (-not [string]::IsNullOrWhiteSpace($v)) {
    [void]$labels.Add($v.Trim())
  }
}

$uniq = $labels | Sort-Object -Unique
if ($uniq.Count -eq 0) {
  throw "no labels to translate"
}

$quoted = $uniq | ForEach-Object {
  '"' + ($_ -replace '\\', '\\\\' -replace '"', '\\"') + '"'
}
$labelsBlock = "[" + [Environment]::NewLine + ($quoted -join ("," + [Environment]::NewLine)) + [Environment]::NewLine + "]"

$prompt = @"
You are a translation engine.
Translate the following concept-map labels from English to Japanese.
Return JSON only in this format:
{
  "translations": [
    {"source":"...","target":"..."}
  ]
}
Keep terms concise and natural for junior/high-school learners.
Labels:
$labelsBlock
"@

$aiBody = @{ prompt = $prompt } | ConvertTo-Json -Depth 6
$aiRes = Invoke-RestMethod -Method Post -Uri "${flask}/api" -ContentType "application/json" -Body $aiBody
$raw = [string]$aiRes.result

$parsed = $null
try {
  $parsed = $raw | ConvertFrom-Json
} catch {
  $m = [regex]::Match($raw, '```(?:json)?\s*([\s\S]*?)\s*```')
  if ($m.Success) {
    try {
      $parsed = $m.Groups[1].Value | ConvertFrom-Json
    } catch {
    }
  }

  if (-not $parsed) {
    $s = $raw.IndexOf("{")
    $e = $raw.LastIndexOf("}")
    if ($s -ge 0 -and $e -gt $s) {
      $snippet = $raw.Substring($s, $e - $s + 1)
      try {
        $parsed = $snippet | ConvertFrom-Json
      } catch {
      }
    }
  }
}

if (-not $parsed) {
  throw "translation json parse failed"
}

$map = @{}
foreach ($row in $parsed.translations) {
  $src = ([string]$row.source).Trim()
  $tgt = ([string]$row.target).Trim()
  if ($src -and $tgt) {
    $map[$src] = $tgt
  }
}

if ($map.Count -eq 0) {
  throw "translation map empty"
}

foreach ($n in $nodes) {
  $src = ([string]$n.label).Trim()
  if ($src -and $map.ContainsKey($src)) {
    $n.label = $map[$src]
  }
}
foreach ($e in $edges) {
  $src = ([string]$e.label).Trim()
  if ($src -and $map.ContainsKey($src)) {
    $e.label = $map[$src]
  }
}

$content.language = "ja"
if ($content.keywordNodes) {
  $content.keywordNodes = $nodes
}
if ($content.nodes) {
  $content.nodes = $nodes
}
if ($content.edges) {
  $content.edges = $edges
}

$putBody = @{
  themeName = $theme
  language = "ja"
  content = $content
} | ConvertTo-Json -Depth 40

$putUrl = "${base}/users/${encUser}/themes"
$saveRes = Invoke-RestMethod -Method Put -Uri $putUrl -ContentType "application/json" -Body $putBody
Write-Output "saved=$($saveRes.saved) language=$($saveRes.language) translated=$($map.Count)"

$verify = Invoke-RestMethod -Method Get -Uri $getUrl
$vn = @()
if ($verify.content.keywordNodes) {
  $vn = @($verify.content.keywordNodes)
} elseif ($verify.content.nodes) {
  $vn = @($verify.content.nodes)
}
$vn | Select-Object -First 10 | ForEach-Object {
  Write-Output ("id=" + $_.id + " label=" + $_.label)
}
