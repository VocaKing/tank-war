#pragma once

#include "Commandlets/Commandlet.h"
#include "SteelFrontBakeCommandlet.generated.h"

UCLASS()
class USteelFrontBakeCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    USteelFrontBakeCommandlet();
    int32 Main(const FString& Params) override;
};
