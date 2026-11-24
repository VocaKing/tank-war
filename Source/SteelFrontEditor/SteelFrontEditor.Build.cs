using UnrealBuildTool;

public class SteelFrontEditor : ModuleRules
{
    public SteelFrontEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PrivateDependencyModuleNames.AddRange(new[] {
            "Core", "CoreUObject", "Engine", "AssetRegistry", "MeshDescription",
            "StaticMeshDescription", "UnrealEd", "SteelFront"
        });
    }
}
