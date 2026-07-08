// Copyright placeholder. Build target for the editor.
using UnrealBuildTool;
using System.Collections.Generic;

public class AncestorJourneyEditorTarget : TargetRules
{
	public AncestorJourneyEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("AncestorJourney");
	}
}
