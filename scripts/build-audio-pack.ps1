[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\public\assets\audio\dungeon")
)

$ErrorActionPreference = "Stop"
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$sourceRoot = "F:\# AUDIO\# SAMPLES\#SFX"

function SourcePath([string]$relativePath) {
  return Join-Path $sourceRoot $relativePath
}

# Personal sample library → browser Opus pack.
# Loudnorm + limiter keep decoded peaks under the runtime master ceiling.
$assets = @(
  [pscustomobject]@{
    Name = "ambience-cave"; Channels = 2; Bitrate = "96k"; TargetLufs = -29
    Source = SourcePath "AMBIENCE\FantasyAmbiences\FantasyAmbiences\AMBFant_Opressing Cave, Heavy Wind, Drops of Water, Organic Gurgle, Loopable_Ocular Sounds_Fantasy Ambiences_The Complete Fantasy Collection.wav"
  },
  [pscustomobject]@{
    Name = "torch-crackle"; Channels = 1; Bitrate = "48k"; TargetLufs = -25; Start = 0; Duration = 4.15
    Source = SourcePath "Fire\CinematicFire\CinematicFire\FIRETrch_Waving Torch Around, Heavy Crackle_Ocular Sounds_Cinematic Fire_The Cinematic Elements Collection.wav"
  },
  [pscustomobject]@{
    Name = "step-stone-a"; Channels = 1; Bitrate = "40k"; TargetLufs = -30; Start = 0.38; Duration = 0.18
    Tone = "highpass=f=45,equalizer=f=150:t=q:w=1.25:g=5,lowpass=f=1800"
    Source = SourcePath "FOOTSTEPS\AllRoundFootsteps\AllRoundFootsteps\FOLYFeet_Footsteps Boots One Step Concrete Distance_Ocular Sounds_All-Round Footsteps_The Complete Foley Collection.wav"
  },
  [pscustomobject]@{
    Name = "step-stone-b"; Channels = 1; Bitrate = "40k"; TargetLufs = -30; Start = 0.40; Duration = 0.22
    Tone = "highpass=f=45,equalizer=f=150:t=q:w=1.25:g=5,lowpass=f=1800"
    Source = SourcePath "FOOTSTEPS\AllRoundFootsteps\AllRoundFootsteps\FOLYFeet_Footsteps Boots One Step Concrete Gritty_Ocular Sounds_All-Round Footsteps_The Complete Foley Collection 01.wav"
  },
  [pscustomobject]@{
    Name = "step-water-a"; Channels = 1; Bitrate = "40k"; TargetLufs = -32; Start = 0.40; Duration = 0.38
    Tone = "highpass=f=55,equalizer=f=180:t=q:w=1.2:g=2,lowpass=f=2600"
    Source = SourcePath "FOOTSTEPS\AllRoundFootsteps\AllRoundFootsteps\FOLYFeet_Footsteps Boot One Step Wet Sand_Ocular Sounds_All-Round Footsteps_The Complete Foley Collection.wav"
  },
  [pscustomobject]@{
    Name = "step-water-b"; Channels = 1; Bitrate = "40k"; TargetLufs = -32; Start = 5.86; Duration = 0.48
    Tone = "highpass=f=55,equalizer=f=180:t=q:w=1.2:g=2,lowpass=f=2600"
    Source = SourcePath "FOOTSTEPS\AllRoundFootsteps\AllRoundFootsteps\FOLYFeet_Footsteps Boot One Step Wet Sand_Ocular Sounds_All-Round Footsteps_The Complete Foley Collection.wav"
  },
  [pscustomobject]@{
    Name = "ui-metal"; Channels = 1; Bitrate = "32k"; TargetLufs = -24; Start = 0.11; Duration = 0.34
    Source = SourcePath "UI\UserInterface\CLICK\UIClick_Glitchy Metal UI Click 01_B00M_ONE.wav"
  },
  [pscustomobject]@{
    Name = "pickup-stone"; Channels = 1; Bitrate = "56k"; TargetLufs = -19; Start = 0; Duration = 1.42
    Source = SourcePath "Magic\MagicSpells\MagicSpells\MAGSpel_Magic Of Metal, Fairy Spell Impact into Stones_Ocular Sounds_Magic Spells_The Complete Fantasy Collection.wav"
  },
  [pscustomobject]@{
    Name = "pickup-resolve"; Channels = 1; Bitrate = "56k"; TargetLufs = -21; Start = 0; Duration = 2.70
    Source = SourcePath "Magic\MagicSpells\MagicSpells\MAGSpel_Magic Of Shadows, Spell Launch, Fairy Resonance_Ocular Sounds_Magic Spells_The Complete Fantasy Collection.wav"
  },
  [pscustomobject]@{
    Name = "pickup-time-freeze"; Channels = 1; Bitrate = "56k"; TargetLufs = -20; Start = 0; Duration = 1.85
    Source = SourcePath "Magic\BoomLibraryMagicAlchemyDs\DSGNWhsh_WHOOSH NEUTRAL-Ice Slide_B00M_MALDS.wav"
  },
  [pscustomobject]@{
    Name = "pickup-ward"; Channels = 1; Bitrate = "56k"; TargetLufs = -20; Start = 0; Duration = 2.10
    Source = SourcePath "Magic\BoomLibraryMagicAlchemyDs\MAGMisc_IMPACT HOLY-Luminous Echoes_B00M_MALDS.wav"
  },
  [pscustomobject]@{
    Name = "enemy-alert"; Channels = 1; Bitrate = "56k"; TargetLufs = -21; Start = 0; Duration = 1.85
    Source = SourcePath "Horror\EpicStockMediaHumanoidCreatures4\OneShot\Designed\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_01.wav"
  },
  [pscustomobject]@{
    Name = "enemy-growl"; Channels = 1; Bitrate = "48k"; TargetLufs = -20; Start = 0; Duration = 1.65
    Source = SourcePath "Horror\EpicStockMediaHumanoidCreatures4\OneShot\Designed\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_01.wav"
  },
  [pscustomobject]@{
    Name = "enemy-attack"; Channels = 1; Bitrate = "56k"; TargetLufs = -18; Start = 0; Duration = 1.70
    Source = SourcePath "Horror\EpicStockMediaHumanoidCreatures4\OneShot\Designed\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_quick_hit_01.wav"
  },
  [pscustomobject]@{
    Name = "enemy-demon"; Channels = 1; Bitrate = "48k"; TargetLufs = -22; Start = 0; Duration = 1.80
    Source = SourcePath "Horror\BlastwaveFxHorrorVol2\MonsterDemon_S08AN.229.wav"
  },
  [pscustomobject]@{
    Name = "enemy-insect"; Channels = 1; Bitrate = "48k"; TargetLufs = -23; Start = 0; Duration = 1.65
    Source = SourcePath "Horror\EpicStockMediaHumanoidCreatures4\OneShot\Designed\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_alert_chatter_warning_01.wav"
  },
  [pscustomobject]@{
    Name = "enemy-ooze"; Channels = 1; Bitrate = "48k"; TargetLufs = -22; Start = 0; Duration = 1.32
    Source = SourcePath "Horror\EpicStockMediaHumanoidCreatures4\OneShot\Designed\Blob\ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_01.wav"
  },
  [pscustomobject]@{
    Name = "enemy-vermin"; Channels = 1; Bitrate = "40k"; TargetLufs = -24; Start = 0; Duration = 1.20
    Source = SourcePath "Animals\EvilbananaMegaAnimalPack\Rats\amb_animals_rat_squeak_03.ogg"
  },
  [pscustomobject]@{
    Name = "door-open"; Channels = 1; Bitrate = "48k"; TargetLufs = -23
    Source = SourcePath "Medieval\MedievalFantasySoundFxPackVol3\Dungeon\Dungeon Door Open Dry A.wav"
  },
  [pscustomobject]@{
    Name = "door-close"; Channels = 1; Bitrate = "48k"; TargetLufs = -22
    Source = SourcePath "Medieval\MedievalFantasySoundFxPackVol3\Dungeon\Dungeon Door Close Dry A.wav"
  },
  [pscustomobject]@{
    Name = "chest-open"; Channels = 1; Bitrate = "48k"; TargetLufs = -22; Start = 0; Duration = 1.35
    Source = SourcePath "WOOD\FRICTION\WOODFric_Wood Creak Low Heavy 01_B00M_ONE.wav"
  },
  [pscustomobject]@{
    Name = "chest-reward"; Channels = 1; Bitrate = "48k"; TargetLufs = -21; Start = 0; Duration = 1.55
    Source = SourcePath "Medieval\MedievalFantasySoundFxPackVol3\Dungeon\Gold Shimmer A.wav"
  },
  [pscustomobject]@{
    Name = "damage"; Channels = 1; Bitrate = "56k"; TargetLufs = -18; Start = 0; Duration = 1.35
    Source = SourcePath "Impacts\30033240DeepImpacts\DeepImpacts\DSGNImpt_Deep Single Hit Impact_Ocular Sounds_Deep Impacts_The Complete Impacts Collection.wav"
  },
  [pscustomobject]@{
    Name = "lose"; Channels = 1; Bitrate = "64k"; TargetLufs = -18; Start = 0; Duration = 2.40
    Source = SourcePath "Impacts\30033240DeepImpacts\DeepImpacts\DSGNImpt_Heavy Impact, Deep, Rumble, Distorted_Ocular Sounds_Deep Impacts_The Complete Impacts Collection.wav"
  },
  [pscustomobject]@{
    Name = "win"; Channels = 1; Bitrate = "64k"; TargetLufs = -19; Start = 0; Duration = 3.20
    Source = SourcePath "Magic\BoomLibraryMagicAlchemyDs\MAGSpel_ENCHANT HOLY-Divine Finish_B00M_MALDS.wav"
  },
  [pscustomobject]@{
    Name = "portal-open"; Channels = 1; Bitrate = "64k"; TargetLufs = -20; Start = 0; Duration = 3.60
    Source = SourcePath "Magic\MagicSpells\MagicSpells\MAGSpel_Forbidden Magic, Powerful Crystal Spell Launch_Ocular Sounds_Magic Spells_The Complete Fantasy Collection.wav"
  }
)

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
foreach ($asset in $assets) {
  if (-not (Test-Path -LiteralPath $asset.Source)) {
    throw "Missing source for $($asset.Name): $($asset.Source)"
  }
  # Opus can add a little inter-sample peak on decode. Limit before encoding so
  # decoded assets stay below the runtime -2 dBTP ceiling.
  $filter = "loudnorm=I=$($asset.TargetLufs):TP=-2:LRA=7,alimiter=limit=0.5:level=0"
  if ($asset.Tone) {
    $filter = "$($asset.Tone),$filter"
  }
  if ($null -ne $asset.Start) {
    $filter = "atrim=start=$($asset.Start):duration=$($asset.Duration),asetpts=N/SR/TB,afade=t=out:st=$([Math]::Max(0, $asset.Duration - 0.04)):d=0.04,$filter"
  }
  $output = Join-Path $OutputDirectory "$($asset.Name).opus"
  $arguments = @(
    "-y", "-hide_banner", "-loglevel", "warning", "-i", $asset.Source,
    "-map", "0:a:0", "-vn", "-ar", "48000", "-ac", $asset.Channels,
    "-af", $filter, "-c:a", "libopus", "-b:a", $asset.Bitrate, $output
  )
  & $ffmpeg @arguments
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $($asset.Name)" }
  Write-Host "Built $output"
}
