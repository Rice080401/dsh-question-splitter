param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [int]$MaxEdge = 1600,
  [int]$Quality = 85
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Fix-Orientation($bmp) {
  try {
    if ($bmp.PropertyIdList -contains 274) {
      $orientation = [int]$bmp.GetPropertyItem(274).Value[0]
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

$src = $null
$out = $null
try {
  $src = Fix-Orientation (New-Object System.Drawing.Bitmap($Path))
  $w = $src.Width
  $h = $src.Height
  $scale = [math]::Min(1.0, $MaxEdge / [double][math]::Max($w, $h))
  $tw = [int][math]::Max(1, [math]::Round($w * $scale))
  $th = [int][math]::Max(1, [math]::Round($h * $scale))
  $out = New-Object System.Drawing.Bitmap($tw, $th, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $tw, $th)
  $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
  $out.Save($OutFile, $codec, $params)
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output ("{""ok"":true,""width"":{0},""height"":{1}}" -f $tw, $th)
}
catch {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output ("{""ok"":false,""error"":{0}}" -f (ConvertTo-Json $_.Exception.Message))
  exit 2
}
finally {
  if ($out) { $out.Dispose() }
  if ($src) { $src.Dispose() }
}
