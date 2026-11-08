# Lists the language tags whose Windows OCR recognizer is installed, one per line.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  foreach ($language in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) {
    [Console]::Out.WriteLine($language.LanguageTag)
  }
} catch {
  exit 1
}
exit 0
