param (
	$ModName,
	$BaseDirectoryName,
	$JsDirectoryName,
	$CssDirectoryName
)

Import-Module -Name ".\ModuleFile.psm1" -Force

$mainMod = OpenModule -ModName $ModName -BaseDirectoryName $BaseDirectoryName
$queue = @( $mainMod )

for ( $i = 0; $i -lt $queue.Count; $i++ ) {
	$mod = $queue[$i]
	
	$jsText = $mod.GetJsText()
	if ( $jsText.Length -gt 0 ) {
		$jsTargetDirectoryName = [System.IO.Path]::Combine($JsDirectoryName, $mod.DirectoryName);
		if ( $(Test-Path -Path $jsTargetDirectoryName) -eq $false ) {
			$jsTargetDirectory = New-Item -Path $jsTargetDirectoryName -ItemType Directory
		}
		$jsTargetFileName = [System.IO.Path]::Combine($jsTargetDirectoryName, $mod.Name + ".js")
		[System.IO.File]::WriteAllText($jsTargetFileName, $jsText)
	}
	
	$cssText = $mod.GetCssText()
	if ( $cssText.Length -gt 0 ) {
		$cssTargetDirectoryName = [System.IO.Path]::Combine($cssDirectoryName, $mod.DirectoryName);
		if ( $(Test-Path -Path $cssTargetDirectoryName) -eq $false ) {
			$cssTargetDirectory = New-Item -Path $cssTargetDirectoryName -ItemType Directory
		}
		$cssTargetFileName = [System.IO.Path]::Combine($cssTargetDirectoryName, $mod.Name + ".css")
		[System.IO.File]::WriteAllText($cssTargetFileName, $cssText)
	}
	
	foreach ( $ref in $mod.Entries | where { $_.Type -eq "include" -and $_.IncludeType -eq "reference" } ) {
		$includePath = [System.IO.Path]::Combine([System.IO.Path]::Combine($BaseDirectoryName, $mod.DirectoryName), $ref.Source)
		$refMod = OpenModule -ModName $refMod -BaseDirectoryName $BaseDirectoryName
		$processed = $( $queue | where { $_.DirectoryName -eq $refMod.DirectoryName -and $_.Name -eq $refMod.Name } ) -ne $null
		if ( -not $processed ) {
			$queue += $refMod
		}
	}
}