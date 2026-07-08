// Copyright placeholder.
// Port of the web build's src/geo.js: turn a chapter's real lat/lng waypoints
// into a walkable local layout — keep the true bearing between consecutive
// stops but compress the true distance on a log curve, so an ocean crossing and
// a fifteen-mile life are both walkable. Returns positions in METRES (X = east,
// Y = north); the caller scales to Unreal cm (×100).
#pragma once

#include "CoreMinimal.h"
#include "AncestorTypes.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "AncestorGeo.generated.h"

UCLASS()
class ANCESTORJOURNEY_API UAncestorGeo : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** One local position (metres) per waypoint, in the same order. */
	UFUNCTION(BlueprintCallable, Category = "Ancestor")
	static TArray<FVector2D> ProjectWaypoints(const TArray<FAncestorWaypoint>& Waypoints);

private:
	static double CompressKm(double Km);
	static FVector2D ResolveCollision(FVector2D P, const TArray<FVector2D>& Placed, int32 Seed);
};
