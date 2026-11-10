#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

# Makes the duck pet's sprites from a concept sheet (ducks on a transparent background):
# Buddy's body sheets, same names, sizes and frame counts, with the ducks cut out of the
# sheet, into src/vs/forge/browser/media/duckPet. The ducks are numbered left to right,
# top to bottom; $frames says which duck each frame of each state shows. Speech bubbles
# and the respawn effect stay Buddy's.
#
#   pwsh build/ddo/duckPetFromSheet.ps1 -Concept <sheet.png>
param([string]$Concept)
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$spriteTools = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SpriteTools
{
	public static byte[] Argb(Bitmap bmp)
	{
		var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
		var bytes = new byte[data.Stride * bmp.Height];
		Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
		bmp.UnlockBits(data);
		return bytes;
	}

	/// Bounding boxes of the opaque blobs (alpha >= threshold) bigger than minArea pixels
	public static List<Rectangle> Components(Bitmap bmp, int threshold, int minArea)
	{
		int w = bmp.Width, h = bmp.Height;
		var px = Argb(bmp);
		var seen = new bool[w * h];
		var boxes = new List<Rectangle>();
		var stack = new Stack<int>();
		for (int i = 0; i < w * h; i++)
		{
			if (seen[i] || px[i * 4 + 3] < threshold) continue;
			int minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
			stack.Push(i); seen[i] = true;
			while (stack.Count > 0)
			{
				int p = stack.Pop(); int x = p % w, y = p / w; area++;
				if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
				for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++)
				{
					int nx = x + dx, ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					int n = ny * w + nx;
					if (!seen[n] && px[n * 4 + 3] >= threshold) { seen[n] = true; stack.Push(n); }
				}
			}
			if (area >= minArea) boxes.Add(new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1));
		}
		return boxes;
	}

	/// A crop with every pixel below the alpha threshold made transparent (drops the glow)
	public static Bitmap CutOut(Bitmap bmp, Rectangle r, int threshold)
	{
		var outBmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
		for (int y = 0; y < r.Height; y++)
			for (int x = 0; x < r.Width; x++)
			{
				var c = bmp.GetPixel(r.X + x, r.Y + y);
				outBmp.SetPixel(x, y, c.A < threshold ? Color.Transparent : Color.FromArgb(255, c.R, c.G, c.B));
			}
		return outBmp;
	}
}
'@
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('SpriteTools' -as [type])) {
	Add-Type -TypeDefinition $spriteTools -ReferencedAssemblies System.Drawing, System.Drawing.Primitives, System.Drawing.Common, System.Collections, System.Runtime.InteropServices
}

$conceptBitmap = New-Object System.Drawing.Bitmap($Concept)
$boxes = [SpriteTools]::Components($conceptBitmap, 200, 2500) | Sort-Object { [int]($_.Y / 200) }, X
$ducks = @{}
function Get-Duck([int]$index) {
	if (-not $ducks.ContainsKey($index)) {
		$ducks[$index] = [SpriteTools]::CutOut($conceptBitmap, $boxes[$index], 200)
	}
	return $ducks[$index]
}

# Ducks by index (see concept-1-boxes.png) for each frame of each state
$frames = @{
	'idle'         = { param($i, $n) if ($i -ge 23 -and $i -le 27) { 22 } elseif ($i -ge 28) { 20 } else { 19 } }
	'rendering'    = { param($i, $n) if ($i -lt 20) { 5 } else { 2 } }
	'typing'       = { param($i, $n) @(7, 8)[$i % 2] }
	'sleep'        = { param($i, $n) @(13, 13, 14, 14)[$i % 4] }
	'waking'       = { param($i, $n) @(14, 14, 24, 24, 3, 3, 1, 1)[$i % 8] }
	'worry'        = { param($i, $n) 17 }
	'clapping'     = { param($i, $n) @(15, 10)[[int][Math]::Floor($i / 2) % 2] }
	'love'         = { param($i, $n) 11 }
	'press-button' = { param($i, $n) @(9, 9, 7, 7, 9, 9)[$i % 6] }
	'painting'     = { param($i, $n) @(8, 7)[$i % 2] }
	'search'       = { param($i, $n) @(2, 4, 2, 1)[$i % 4] }
	'speechless'   = { param($i, $n) 16 }
	'yapping'      = { param($i, $n) @(10, 6)[$i % 2] }
	'cool'         = { param($i, $n) if ($i -lt 2) { 6 } else { 12 } }
	'sing'         = { param($i, $n) @(10, 15)[$i % 2] }
	'dizzy'        = { param($i, $n) 18 }
	'jump'         = { param($i, $n) 6 }
	'falling'      = { param($i, $n) @(18, 16)[$i % 2] }
	'splat'        = { param($i, $n) 18 }
	'wall-impact'  = { param($i, $n) 18 }
}
$frameWidths = @{ 'typing' = 168; 'sleep' = 120; 'waking' = 120; 'press-button' = 160; 'painting' = 192; 'sing' = 164 }

$source = Join-Path $Repo 'src\vs\workbench\contrib\chat\browser\widget\media\chatPet'
$target = Join-Path $Repo 'src\vs\forge\browser\media\duckPet'
Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null

$count = 0
Get-ChildItem $source -Filter 'buddy-*.png' | ForEach-Object {
	$m = [regex]::Match($_.Name, '^buddy-(.+?)-(stable|insiders)(-tracking)?-(\d+)(\.spritesheet)?\.png$')
	if (-not $m.Success) { return }
	$state = $m.Groups[1].Value
	if (-not $frames.ContainsKey($state)) { return } # speech, respawn: not the pet's body
	$old = [System.Drawing.Image]::FromFile($_.FullName)
	$W = $old.Width; $H = $old.Height
	$old.Dispose()
	$fw = if ($frameWidths.ContainsKey($state)) { $frameWidths[$state] } else { 96 }
	$n = [Math]::Max(1, [int]($W / $fw))
	$still = -not $m.Groups[5].Success
	$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
	for ($i = 0; $i -lt $n; $i++) {
		$duck = Get-Duck (& $frames[$state] $(if ($still) { 0 } else { $i }) $n)
		# The duck in the frame's bottom-left 96 x 96 square (props may use the rest of a wider frame)
		$box = 92
		$scale = [Math]::Min($box / $duck.Height, [Math]::Min(($fw - 4), [Math]::Max($box, $duck.Width * $box / $duck.Height)) / $duck.Width)
		$dw = [int]($duck.Width * $scale); $dh = [int]($duck.Height * $scale)
		$x = $i * $fw + [int]([Math]::Max(0, ([Math]::Min($fw, 96) - $dw) / 2)); $y = $H - $dh - 2
		$g.DrawImage($duck, $x, $y, $dw, $dh)
	}
	$g.Dispose()
	$bmp.Save((Join-Path $target $_.Name), [System.Drawing.Imaging.ImageFormat]::Png)
	$bmp.Dispose()
	$count++
}
$conceptBitmap.Dispose()
"$count sheets in $target"
