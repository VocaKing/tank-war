using UnrealBuildTool;

public class SteelFrontEditorTarget : TargetRules
{
    public SteelFrontEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.AddRange(new[] { "SteelFront", "SteelFrontEditor" });
    }
}
