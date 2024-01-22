param (
	$SourceDirectoryName = "source",
	$PublishDirectoryName = "publish"
)

$SourceDirectoryName = [System.IO.Path]::Combine($PWD, $SourceDirectoryName)
$PublishDirectoryName = [System.IO.Path]::Combine($PWD, $PublishDirectoryName)

$CurrentDirectory = $PWD
Set-Location $($MyInvocation.MyCommand.Definition | Split-Path -Parent)

if ( Test-Path -Path $PublishDirectoryName ) {
	Write-Host "Cleaning the publish directory..."
	Remove-Item -Path $PublishDirectoryName -Recurse
}

Write-Host "Copying static files..."

$temp = New-Item -Path "$PublishDirectoryName" -ItemType Directory
Copy-Item -Path @( "$SourceDirectoryName\*.html", "$SourceDirectoryName\*.php" ) -Destination "$PublishDirectoryName\"

$temp = New-Item -Path "$PublishDirectoryName\img" -ItemType Directory
Copy-Item -Path "$SourceDirectoryName\img\*" -Destination "$PublishDirectoryName\img\" -Recurse

$temp = New-Item -Path "$PublishDirectoryName\css" -ItemType Directory
Copy-Item -Path "$SourceDirectoryName\css\*" -Destination "$PublishDirectoryName\css\" -Recurse

$temp = New-Item -Path "$PublishDirectoryName\js" -ItemType Directory
Copy-Item -Path "$SourceDirectoryName\js\*" -Destination "$PublishDirectoryName\js\" -Recurse

$temp = New-Item -Path "$PublishDirectoryName\zx_files" -ItemType Directory
Copy-Item -Path "$SourceDirectoryName\zx_files\*" -Destination "$PublishDirectoryName\zx_files\" -Recurse

Write-Host "Building JavaScript modules..."
.\BuildModule.ps1 -ModName "$SourceDirectoryName\modules\spectrum.html" -BaseDirectoryName "$SourceDirectoryName\modules" -JsDirectoryName "$PublishDirectoryName\js" -CssDirectoryName "$PublishDirectoryName\css"
.\BuildModule.ps1 -ModName "$SourceDirectoryName\modules\spectrum_ui.html" -BaseDirectoryName "$SourceDirectoryName\modules" -JsDirectoryName "$PublishDirectoryName\js" -CssDirectoryName "$PublishDirectoryName\css"
.\BuildModule.ps1 -ModName "$SourceDirectoryName\modules\spectrum_hw.html" -BaseDirectoryName "$SourceDirectoryName\modules" -JsDirectoryName "$PublishDirectoryName\js" -CssDirectoryName "$PublishDirectoryName\css"
.\BuildModule.ps1 -ModName "$SourceDirectoryName\modules\spectrum_audio.html" -BaseDirectoryName "$SourceDirectoryName\modules" -JsDirectoryName "$PublishDirectoryName\js" -CssDirectoryName "$PublishDirectoryName\css"
.\BuildModule.ps1 -ModName "$SourceDirectoryName\modules\loader.html" -BaseDirectoryName "$SourceDirectoryName\modules" -JsDirectoryName "$PublishDirectoryName\js" -CssDirectoryName "$PublishDirectoryName\css"


$javacmd = Get-Command -Name java -ErrorAction SilentlyContinue -ErrorVariable errors
if ( $errors.Count -eq 0 ) {
	Write-Host "Minifying JavaScript output file..."
	java -jar .\compiler.jar --compilation_level SIMPLE_OPTIMIZATIONS --js "$PublishDirectoryName\js\spectrum.js" --js_output_file "$PublishDirectoryName\js\spectrum.min.js"
	java -jar .\compiler.jar --compilation_level SIMPLE_OPTIMIZATIONS --js "$PublishDirectoryName\js\spectrum_ui.js" --js_output_file "$PublishDirectoryName\js\spectrum_ui.min.js"
	java -jar .\compiler.jar --compilation_level SIMPLE_OPTIMIZATIONS --js "$PublishDirectoryName\js\spectrum_hw.js" --js_output_file "$PublishDirectoryName\js\spectrum_hw.min.js"
	java -jar .\compiler.jar --compilation_level SIMPLE_OPTIMIZATIONS --js "$PublishDirectoryName\js\spectrum_audio.js" --js_output_file "$PublishDirectoryName\js\spectrum_audio.min.js"
	java -jar .\compiler.jar --compilation_level SIMPLE_OPTIMIZATIONS --js "$PublishDirectoryName\js\loader.js" --js_output_file "$PublishDirectoryName\js\loader.min.js"
}
else {
	Write-Host "Java runtime environment not found. Minifying can not be perfomed."
}

Write-Host "Done."

Set-Location $CurrentDirectory