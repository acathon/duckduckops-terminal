#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

# Writes every icon of DuckDuckOps from resources/brand/app-icon.png (256 x 256): code.ico
# (16 to 256 px), the Start menu tiles, the installer images, the title bar icon, the @duck
# avatar, the ddo extension's icon and the Linux icon. With -Sheet, it first cuts the icon
# out of a concept sheet (-Rect x,y,size: the rounded square in the sheet).
#
#   pwsh build/ddo/appIcons.ps1 [-Sheet <concept.png> -Rect 525,221,250]
param([string]$Sheet, [int[]]$Rect = @(525, 221, 250))
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function New-Canvas([int]$w, [int]$h, $format = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb) {
	$bmp = New-Object System.Drawing.Bitmap($w, $h, $format)
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$g.InterpolationMode = 'HighQualityBicubic'
	$g.PixelOffsetMode = 'HighQuality'
	$g.CompositingQuality = 'HighQuality'
	$g.SmoothingMode = 'HighQuality'
	return @($bmp, $g)
}

# 1. The icon. From a sheet: the square cut out, centred on a 256 x 256 transparent canvas
$source = Join-Path $Repo 'resources\brand\app-icon.png'
if ($Sheet) {
	$conceptBitmap = New-Object System.Drawing.Bitmap($Sheet)
	$bmp, $g = New-Canvas 256 256
	$size = [Math]::Min(256, $Rect[2])
	$margin = [int]((256 - $size) / 2)
	$g.DrawImage($conceptBitmap, (New-Object System.Drawing.Rectangle($margin, $margin, $size, $size)), (New-Object System.Drawing.Rectangle($Rect[0], $Rect[1], $Rect[2], $Rect[2])), [System.Drawing.GraphicsUnit]::Pixel)
	$g.Dispose()
	$conceptBitmap.Dispose()
	$bmp.Save($source, [System.Drawing.Imaging.ImageFormat]::Png)
	$bmp.Dispose()
}
$icon = New-Object System.Drawing.Bitmap($source)

function Get-Scaled([int]$size) {
	$bmp, $g = New-Canvas $size $size
	$g.DrawImage($icon, 0, 0, $size, $size)
	$g.Dispose()
	return $bmp
}

function Save-Png($bmp, [string]$path) {
	$bmp.Save((Join-Path $Repo $path), [System.Drawing.Imaging.ImageFormat]::Png)
}

# 2. code.ico: PNG images from 16 to 256 px
$sizes = 16, 20, 24, 32, 40, 48, 64, 96, 128, 256
$images = foreach ($s in $sizes) {
	$b = Get-Scaled $s
	$ms = New-Object System.IO.MemoryStream
	$b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
	$b.Dispose()
	, $ms.ToArray()
}
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
	$s = $sizes[$i]
	$w.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
	$w.Write([byte]0); $w.Write([byte]0); $w.Write([UInt16]1); $w.Write([UInt16]32)
	$w.Write([UInt32]$images[$i].Length); $w.Write([UInt32]$offset)
	$offset += $images[$i].Length
}
foreach ($data in $images) { $w.Write($data) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $Repo 'resources\win32\code.ico'), $out.ToArray())

# 3. Small copies: title bar, @duck, the ddo extension, Linux
foreach ($pair in @(@(32, 'src\vs\forge\browser\media\duck-head.png'), @(64, 'extensions\ddo\media\duck.png'), @(256, 'extensions\ddo\media\icon.png'))) {
	$b = Get-Scaled $pair[0]; Save-Png $b $pair[1]; $b.Dispose()
}
$bmp, $g = New-Canvas 512 512
$g.DrawImage($icon, 0, 0, 512, 512); $g.Dispose()
Save-Png $bmp 'resources\linux\code.png'; $bmp.Dispose()

# 4. Start menu tiles: the icon on the tile colour (the manifest's BackgroundColor)
$tile = [System.Drawing.ColorTranslator]::FromHtml('#152036')
foreach ($pair in @(@(150, 'resources\win32\code_150x150.png', 96, 14), @(70, 'resources\win32\code_70x70.png', 56, 7))) {
	$size, $path, $iconSize, $top = $pair
	$bmp, $g = New-Canvas $size $size
	$g.DrawImage($icon, [int](($size - $iconSize) / 2), $top, $iconSize, $iconSize)
	$g.Dispose(); Save-Png $bmp $path; $bmp.Dispose()
}

# 5. Installer images: small on white, big on the icon's navy
Get-ChildItem (Join-Path $Repo 'resources\win32') -Filter 'inno-*.bmp' | ForEach-Object {
	$old = [System.Drawing.Image]::FromFile($_.FullName)
	$W = $old.Width; $H = $old.Height
	$old.Dispose()
	$bmp, $g = New-Canvas $W $H ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
	if ($_.Name -like 'inno-big-*') {
		$g.Clear($tile)
		$s = [int]($W * 0.82)
		$g.DrawImage($icon, [int](($W - $s) / 2), [int](($H - $s) / 2), $s, $s)
	} else {
		$g.Clear([System.Drawing.Color]::White)
		$s = [int]([Math]::Min($W, $H) * 0.94)
		$g.DrawImage($icon, [int](($W - $s) / 2), [int](($H - $s) / 2), $s, $s)
	}
	$g.Dispose()
	$bmp.Save($_.FullName, [System.Drawing.Imaging.ImageFormat]::Bmp)
	$bmp.Dispose()
}
$icon.Dispose()
'done'
