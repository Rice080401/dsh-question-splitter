param(
  [Parameter(Mandatory=$true)][string]$SpecFile,
  [Parameter(Mandatory=$true)][string]$OutFile
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Write-Utf8Json($obj, [string]$path) {
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $json, $enc)
}

function Fix-Orientation([System.Drawing.Bitmap]$bmp) {
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

$specText = [System.IO.File]::ReadAllText($SpecFile, [System.Text.Encoding]::UTF8)
$spec = $specText | ConvertFrom-Json
$result = [pscustomobject]@{ ok = $false; items = @(); error = $null }
$src = $null

try {
  $outDir = [string]$spec.outDir
  $thumbDir = [string]$spec.thumbDir
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
  if ($thumbDir -and -not (Test-Path $thumbDir)) { New-Item -ItemType Directory -Force -Path $thumbDir | Out-Null }

  $src = New-Object System.Drawing.Bitmap([string]$spec.image)
  $src = Fix-Orientation $src
  $iw = $src.Width; $ih = $src.Height

  $format = "png"
  if ($spec.format) { $format = [string]$spec.format }
  $quality = 92
  if ($spec.quality) { $quality = [int]$spec.quality }
  $thumbWidth = 420
  if ($spec.thumbWidth) { $thumbWidth = [int]$spec.thumbWidth }

  $jpegCodec = $null
  $encoderParams = $null
  if ($format -eq "jpg") {
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
  }

  $items = New-Object System.Collections.Generic.List[object]
  foreach ($seg in $spec.segments) {
    $sx = [int][math]::Max(0, [math]::Round([double]$seg.x))
    $sy = [int][math]::Max(0, [math]::Round([double]$seg.y))
    $sw = [int][math]::Min($iw - $sx, [math]::Round([double]$seg.w))
    $sh = [int][math]::Min($ih - $sy, [math]::Round([double]$seg.h))
    if ($sw -lt 8 -or $sh -lt 8) { continue }

    $crop = New-Object System.Drawing.Bitmap($sw, $sh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($crop)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $sw, $sh)), (New-Object System.Drawing.Rectangle($sx, $sy, $sw, $sh)), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    $filePath = Join-Path $outDir ([string]$seg.fileName)
    if ($format -eq "jpg") {
      $crop.Save($filePath, $jpegCodec, $encoderParams)
    } else {
      $crop.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    $thumbPath = $null
    if ($thumbDir) {
      $tw = [int][math]::Min($thumbWidth, $sw)
      $th = [int][math]::Max(1, [math]::Round($sh * ($tw / [double]$sw)))
      $thumb = New-Object System.Drawing.Bitmap($tw, $th, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $tg = [System.Drawing.Graphics]::FromImage($thumb)
      $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $tg.DrawImage($crop, 0, 0, $tw, $th)
      $tg.Dispose()
      $thumbPath = Join-Path $thumbDir ([string]$seg.thumbName)
      $thumb.Save($thumbPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      $thumb.Dispose()
    }

    $items.Add([pscustomobject]@{
      index = [int]$seg.index
      label = [string]$seg.label
      questionNo = $seg.questionNo
      file = $filePath
      fileName = [string]$seg.fileName
      thumb = $thumbPath
      width = $sw
      height = $sh
    })
    $crop.Dispose()
  }
  $result.items = $items.ToArray()
  $result.ok = $true
}
catch {
  $result.error = $_.Exception.Message
}
finally {
  if ($src) { $src.Dispose() }
}
Write-Utf8Json $result $OutFile
if (-not $result.ok) { Write-Error $result.error; exit 2 }
exit 0
