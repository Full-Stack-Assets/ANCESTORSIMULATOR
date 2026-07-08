// Copyright placeholder. Build target for the packaged game.
using UnrealBuildTool;
using System.Collections.Generic;

public class AncestorJourneyTarget : TargetRules
{
	public AncestorJourneyTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("AncestorJourney");
	}
}
