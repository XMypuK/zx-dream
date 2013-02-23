function GetAttributeValue ( $entryMatch, $attrName, $defaultValue ) {
	for ( $i = 0; $i -lt $entryMatch.Groups["attrName"].Captures.Count; $i++ ) {
		if ( $attrName.ToLower() -eq $entryMatch.Groups["attrName"].Captures[$i].Value.ToLower() ) {
			$attrValue = $entryMatch.Groups["attrValue"].Captures[$i].Value
			$singleQuoted = ( $attrValue.Length -ge 2 -and $attrValue.StartsWith('"') -and $attrValue.EndsWith('"') )
			$doubleQuoted = ( $attrValue.Length -ge 2 -and $attrValue.StartsWith("'") -and $attrValue.EndsWith("'") )
			if ( $singleQuoted -or $doubleQuoted ) {
				$attrValue = $attrValue.Substring(1, $attrValue.Length - 2)
			}
			return $attrValue
		}
	}
	return $defaultValue
}

function OpenModule ( [string]$ModName, [string]$BaseDirectoryName ) {

	$mod = New-Object psobject
	$mod | Add-Member -MemberType NoteProperty -Name BaseDirectoryName -Value $BaseDirectoryName
	$mod | Add-Member -MemberType NoteProperty -Name File -Value $(Get-Item $ModName)
	$mod | Add-Member -MemberType NoteProperty -Name Entries -Value @()
	$mod | Add-Member -MemberType NoteProperty -Name Name -Value $mod.File.Name.Remove($mod.File.Name.Length - $mod.File.Extension.Length)
	$mod | Add-Member -MemberType NoteProperty -Name DirectoryName -Value $mod.File.Directory.FullName

	if ( $mod.DirectoryName.StartsWith($mod.BaseDirectoryName, [System.StringComparison]::InvariantCultureIgnoreCase) ) {
		$mod.DirectoryName = $mod.DirectoryName.Remove(0, $mod.BaseDirectoryName.Length).Trim('\', '/')
	}

	$entryRegexp = "\<(?<type>template|style|script|include)(?:\s+(?<attrName>[\w\-]+)=(?<attrValue>[\w\-\.]*|`"[^`"]*`"|'[^']*'))*\s*(?:(?:\>(?<content>.*?)\</\1\>)|/\>)"
	# Get-Content returns an object array (separated by endline) but not a string
	$content = [System.IO.File]::ReadAllText($mod.File.FullName)
	$entryMatches = [System.Text.RegularExpressions.Regex]::Matches($content, $entryRegexp, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

	foreach ( $entryMatch in $entryMatches ) {
		$entry = New-Object psobject
		$entry | Add-Member -MemberType NoteProperty -Name Type -Value $entryMatch.Groups["type"].Value.ToLower()

		switch ( $entry.Type ) {
			'template' { 
				$entry | Add-Member -MemberType NoteProperty -Name Id -Value $(GetAttributeValue -entryMatch $entryMatch -attrName 'id' -defaultValue '')
				$entry | Add-Member -MemberType NoteProperty -Name PreserveWhitespace -Value $($(GetAttributeValue -entryMatch $entryMatch -attrName 'preserveWhitespace' -defaultValue 'false').ToLower() -eq 'true')
				$entry | Add-Member -MemberType NoteProperty -Name Content -Value $entryMatch.Groups["content"].Value
			}

			'style' { 
				$entry | Add-Member -MemberType NoteProperty -Name Content -Value $entryMatch.Groups["content"].Value
			}

			'script' { 
				$entry | Add-Member -MemberType NoteProperty -Name Content -Value $entryMatch.Groups["content"].Value
			}

			'include' { 
				$entry | Add-Member -MemberType NoteProperty -Name IncludeType -Value $(GetAttributeValue -entryMatch $entryMatch -attrName 'includeType' -defaultValue 'reference').ToLower()
				$entry | Add-Member -MemberType NoteProperty -Name Source -Value $(GetAttributeValue -entryMatch $entryMatch -attrName 'source' -defaultValue '')
				$entry | Add-Member -MemberType NoteProperty -Name SourceType -Value $(GetAttributeValue -entryMatch $entryMatch -attrName 'sourceType' -defaultValue 'auto').ToLower()

				if ( $entry.SourceType -ne 'script' -and $entry.SourceType -ne 'style' -and $entry.SourceType -ne 'module' ) {
					switch ( [System.IO.Path]::GetExtension($entry.Source).ToLower() ) {
						'.js' { $entry.SourceType = 'script' }
						'.css' { $entry.SourceType = 'style' }
						default { $entry.SourceType = 'module' }
					}
				}
			}
		}

		$mod.Entries += $entry
	}
	
	$mod | Add-Member -MemberType ScriptMethod -Name GetCssText -Value { 
		$result = ''

		foreach ( $entry in $this.Entries ) {
			switch ( $entry.Type ) {
				'include' {
					$includePath = [System.IO.Path]::Combine([System.IO.Path]::Combine($this.BaseDirectoryName, $this.DirectoryName), $entry.Source)
					switch ( $entry.SourceType ) {
						'module' { 
							$nestedMod = OpenModule -BaseDirectoryName $this.BaseDirectoryName -ModName $includePath
							if ( $entry.IncludeType -eq 'embed' ) {
								$result += $nestedMod.GetCssText()
							}
						}

						'style' { 
							$styleText = [System.IO.File]::ReadAllText($includePath)
							$result += $styleText + "`r`n"
						}
					}
				}

				'style' {
					$result += $entry.Content + "`r`n"
				}
			}
		}

		$result
	}
	
	$mod | Add-Member -MemberType ScriptMethod -Name GetJsText -Value {
		$scriptText = ''
		
		$templateMap = @{}
		$templates = @()
		
		foreach ( $entry in $this.Entries ) {
			switch ( $entry.Type ) {
				'template' {
					if ( $entry.Id -ne '' ) {
						$templateMap[$entry.Id] = $this
						$templates += $entry
					}
				}
				
				'include' {
					$includePath = [System.IO.Path]::Combine([System.IO.Path]::Combine($this.BaseDirectoryName, $this.DirectoryName), $entry.Source)
					switch ( $entry.SourceType ) {
						'module' {
							$nestedMod = OpenModule -BaseDirectoryName $this.BaseDirectoryName -ModName $includePath
							foreach ( $nestedTemplate in $nestedMod.Entries | where { $_.Type -eq 'template' } ) {
								if ( $nestedTemplate.Id -ne '' ) {
									$templateMap[$nestedTemplate.Id] = $nestedMod
								}
							}
							
							if ( $entry.IncludeType -eq 'embed' ) {
								$scriptText += $nestedMod.GetJsText() + "`r`n"
							}
						}
						
						'script' {
							$scriptText += $([System.IO.File]::ReadAllText($includePath)) + "`r`n"
						}
					}
				}
				
				'script' {
					$scriptText += $this.ProcessTemplateReferences($entry.Content, $templateMap) + "`r`n"
				}
			}
		}
		
		$templateText = ''
		if ( $templates.Count -gt 0 ) {
			$modKey = [System.IO.Path]::Combine($this.DirectoryName, $this.Name).Trim('\', '/').Replace('\','\\')
			$templateText += "var _tl = _tl || {};`r`n"
			$templateText += "_tl[`"$modKey`"] = {`r`n"
			for ( $i = 0; $i -lt $templates.Count; $i++ ) {
				$template = $templates[$i]
				
				$content = $template.Content
				if ( $template.PreserveWhitespace -eq $false ) {
					$htmlPattern = "(?<whitespace>\s*)(?<node><([a-z][\w\-]*)(\s+[a-z][\w\-]*(\s*=\s*(`"[^`"]*`"|'[^']*'|[^\s]*))?)*\s*>|</[a-z][\w\-]*>|[^\s]+)"
					$htmlEvaluator = [System.Text.RegularExpressions.MatchEvaluator] {
						param ( $match )
						$whitespace = $match.Groups["whitespace"].Value
						if ( $whitespace.Length -gt 1 ) {
							" " + $match.Groups["node"]
						}
						else {
							$whitespace + $match.Groups["node"]
						}
					}
					$content = [System.Text.RegularExpressions.Regex]::Replace($content, $htmlPattern, $htmlEvaluator, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Multiline)
				}
				
				$spCharsPattern = "[\r\n\t\\`"]"
				$spCharsEvaluator = [System.Text.RegularExpressions.MatchEvaluator] {
					param ( $match )
					switch ( $match.Value ) {
						"`r" { "\r" }
						"`n" { "\n" }
						"`t" { "\t" }
						"`"" { "\`"" }
						"\" { "\\" }
					}
				}
				$content = "`"" + [System.Text.RegularExpressions.Regex]::Replace($content, $spCharsPattern, $spCharsEvaluator) + "`""				
				
				$templateText += "`t`"$($template.Id)`": $content"
				
				if ( $i -ne $templates.Count - 1 ) {
					$templateText += ","
				}
				$templateText += "`r`n"
			}
			$templateText += "};`r`n"
		}
		
		$templateText + $scriptText
	}
	
	$mod | Add-Member -MemberType ScriptMethod -Name ProcessTemplateReferences -Value {
		param ( $text, $templateMap )
		
		$referencePattern = "`"\<\?=\s*(.*?)\s*\?\>`""
		$referenceEvaluator = [System.Text.RegularExpressions.MatchEvaluator] {
			param ( $match )
			$templateId = $match.Groups[1].Value
			$templateMod = $templateMap[$templateId]
			if ( $templateMod -ne $null ) {
                # clean ID = template ID without namespace
                $templateId = $templateId.Substring($templateId.IndexOf(':') + 1)
				$modKey = [System.IO.Path]::Combine($templateMod.DirectoryName, $templateMod.Name).Trim('\', '/').Replace('\','\\')
				"_tl[`"$modKey`"][`"$templateId`"]"
			}
			else {
				$match.Value
			}
		}
		
		[System.Text.RegularExpressions.Regex]::Replace($text, $referencePattern, $referenceEvaluator, [System.Text.RegularExpressions.RegexOptions]::Singleline)
	}

	$mod
}