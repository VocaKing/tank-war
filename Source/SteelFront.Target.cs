using UnrealBuildTool;

public class SteelFrontTarget : TargetRules
{
    public SteelFrontTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.Add("SteelFront");
    }
}
