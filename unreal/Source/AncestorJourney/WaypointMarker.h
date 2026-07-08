// Copyright placeholder.
// A walkable life-event marker: a tapered pillar with a confidence-colored glow
// and a floating label. Spawned by the game mode from chapter data.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AncestorTypes.h"
#include "WaypointMarker.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;
class UTextRenderComponent;

UCLASS()
class ANCESTORJOURNEY_API AWaypointMarker : public AActor
{
	GENERATED_BODY()

public:
	AWaypointMarker();

	/** Apply a waypoint's data: label text + confidence-colored glow. */
	UFUNCTION(BlueprintCallable, Category = "Ancestor")
	void SetFromWaypoint(const FAncestorWaypoint& Waypoint);

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor")
	FAncestorWaypoint Waypoint;

protected:
	UPROPERTY(VisibleAnywhere, Category = "Ancestor") TObjectPtr<UStaticMeshComponent> Pillar;
	UPROPERTY(VisibleAnywhere, Category = "Ancestor") TObjectPtr<UPointLightComponent> Glow;
	UPROPERTY(VisibleAnywhere, Category = "Ancestor") TObjectPtr<UTextRenderComponent> Label;
};
