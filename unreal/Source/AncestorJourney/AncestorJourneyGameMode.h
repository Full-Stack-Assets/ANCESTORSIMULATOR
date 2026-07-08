// Copyright placeholder.
// Loads the first chapter on BeginPlay and spawns a waypoint marker for each
// stop, laid out by UAncestorGeo (the ported distance-compression projection).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "AncestorJourneyGameMode.generated.h"

UCLASS()
class ANCESTORJOURNEY_API AAncestorJourneyGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AAncestorJourneyGameMode();

protected:
	virtual void BeginPlay() override;

	/** Which class to spawn for each life-event stop. */
	UPROPERTY(EditDefaultsOnly, Category = "Ancestor")
	TSubclassOf<class AWaypointMarker> MarkerClass;
};
