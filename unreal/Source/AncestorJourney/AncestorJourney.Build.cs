// Copyright placeholder. Module build rules.
using UnrealBuildTool;

public class AncestorJourney : ModuleRules
{
	public AncestorJourney(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"Json",           // chapter JSON parsing
			"JsonUtilities",  // FJsonObjectConverter
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
