param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [string]$Lang = "zh-Hans-CN"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Foundation, ContentType=WindowsRuntime]
$bufferExt = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, [Type]$resultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

function Write-Utf8Json($obj, [string]$path) {
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $json, $enc)
}

function Fix-Orientation([System.Drawing.Bitmap]$bmp) {
  # Respect EXIF orientation so crops and OCR share one coordinate system.
  try {
    if ($bmp.PropertyIdList -contains 274) {
      $item = $bmp.GetPropertyItem(274)
      $orientation = [int]$item.Value[0]
      switch ($orientation) {
        2 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
        3 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        4 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipX) }
        5 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipX) }
        6 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        7 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipX) }
        8 { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      }
    }
  } catch { }
  return $bmp
}

function Get-RowInk([System.Drawing.Bitmap]$bmp, [int]$maxRows = 1200) {
  # Coarse dark-pixel count per sampled row; used by the splitter to find blank gaps.
  $w = $bmp.Width; $h = $bmp.Height
  $scale = 1.0
  if ($h -gt $maxRows) { $scale = $h / [double]$maxRows }
  $sw = [int][math]::Max(1, [math]::Round($w / $scale))
  $sh = [int][math]::Max(1, [math]::Round($h / $scale))
  $small = New-Object System.Drawing.Bitmap($sw, $sh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($small)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($bmp, 0, 0, $sw, $sh)
  $g.Dispose()
  $rect = New-Object System.Drawing.Rectangle(0, 0, $sw, $sh)
  $data = $small.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $sh)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $small.UnlockBits($data)
  $small.Dispose()
  $rows = New-Object int[] $sh
  for ($y = 0; $y -lt $sh; $y++) {
    $base = $y * $stride
    $cnt = 0
    for ($x = 0; $x -lt $sw; $x++) {
      $i = $base + $x * 3
      $lum = ($bytes[$i] * 299 + $bytes[$i + 1] * 587 + $bytes[$i + 2] * 114) / 1000
      if ($lum -lt 160) { $cnt++ }
    }
    $rows[$y] = $cnt
  }
  return [pscustomobject]@{ scaleY = ($h / [double]$sh); rows = $rows }
}

$info = [pscustomobject]@{ ok = $false; path = $Path; width = 0; height = 0; lang = ""; scale = 1.0; lines = @(); rowInk = $null; rowInkScale = 1.0; error = $null }

$src = $null
$work = $null
try {
  $src = New-Object System.Drawing.Bitmap($Path)
  $src = Fix-Orientation $src
  $ow = $src.Width; $oh = $src.Height
  $info.width = $ow
  $info.height = $oh

  $scale = 1.0
  if ([math]::Min($ow, $oh) -lt 500) { $scale = 2.0 }
  $maxDim = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
  if (($ow * $scale) -gt $maxDim) { $scale = $maxDim / [double]$ow }
  if (($oh * $scale) -gt $maxDim) { $scale = [math]::Min($scale, $maxDim / [double]$oh) }
  $info.scale = $scale
  $tw = [int][math]::Max(1, [math]::Round($ow * $scale))
  $th = [int][math]::Max(1, [math]::Round($oh * $scale))

  # Draw into a 32bpp premultiplied-friendly canvas, then copy raw BGRA pixels.
  $work = New-Object System.Drawing.Bitmap($tw, $th, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($work)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($src, 0, 0, $tw, $th)
  $g.Dispose()

  $rect = New-Object System.Drawing.Rectangle(0, 0, $tw, $th)
  $data = $work.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $pixels = New-Object byte[] ($stride * $th)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $pixels.Length)
  $work.UnlockBits($data)

  if ($stride -ne ($tw * 4)) {
    # GDI+ may pad rows; repack tightly.
    $tight = New-Object byte[] ($tw * $th * 4)
    for ($y = 0; $y -lt $th; $y++) {
      [System.Array]::Copy($pixels, $y * $stride, $tight, $y * $tw * 4, $tw * 4)
    }
    $pixels = $tight
  }

  $buffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($pixels)
  $softwareBitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer(
    $buffer,
    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
    [uint32]$tw,
    [uint32]$th,
    [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied
  )

  $engine = $null
  try {
    $language = New-Object Windows.Globalization.Language($Lang)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  } catch { $engine = $null }
  if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    $info.lang = "user-profile"
  } else {
    $info.lang = $Lang
  }
  if ($null -eq $engine) { throw "no OCR engine available for language '$Lang'" }

  $result = Await ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])

  $lines = New-Object System.Collections.Generic.List[object]
  foreach ($line in $result.Lines) {
    $minX = [double]::MaxValue; $minY = [double]::MaxValue; $maxX = 0.0; $maxY = 0.0
    $words = New-Object System.Collections.Generic.List[object]
    foreach ($word in $line.Words) {
      $r = $word.BoundingRect
      if ($r.X -lt $minX) { $minX = $r.X }
      if ($r.Y -lt $minY) { $minY = $r.Y }
      if (($r.X + $r.Width) -gt $maxX) { $maxX = $r.X + $r.Width }
      if (($r.Y + $r.Height) -gt $maxY) { $maxY = $r.Y + $r.Height }
      $words.Add([pscustomobject]@{
        text = $word.Text
        x = [math]::Round($r.X / $scale, 2)
        y = [math]::Round($r.Y / $scale, 2)
        w = [math]::Round($r.Width / $scale, 2)
        h = [math]::Round($r.Height / $scale, 2)
      })
    }
    if ($words.Count -eq 0) { continue }
    $lines.Add([pscustomobject]@{
      text = $line.Text
      x = [math]::Round($minX / $scale, 2)
      y = [math]::Round($minY / $scale, 2)
      w = [math]::Round(($maxX - $minX) / $scale, 2)
      h = [math]::Round(($maxY - $minY) / $scale, 2)
      words = $words
    })
  }
  $info.lines = $lines.ToArray()

  $ink = Get-RowInk $src
  $info.rowInk = $ink.rows
  $info.rowInkScale = $ink.scaleY
  $info.ok = $true
}
catch {
  $info.error = $_.Exception.Message
}
finally {
  if ($work) { $work.Dispose() }
  if ($src) { $src.Dispose() }
}
Write-Utf8Json $info $OutFile
if (-not $info.ok) { Write-Error $info.error; exit 2 }
exit 0
