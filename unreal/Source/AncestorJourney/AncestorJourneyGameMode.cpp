// Copyright placeholder. See AncestorJourneyGameMode.h.
#include "AncestorJourneyGameMode.h"
#include "AncestorPlayerCharacter.h"
#include "WaypointMarker.h"
#include "AncestorGeo.h"
#include "ChapterLoader.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

AAncestorJourneyGameMode::AAncestorJourneyGameMode()
{
	DefaultPawnClass = AAncestorPlayerCharacter::StaticClass();
	MarkerClass = AWaypointMarker::StaticClass();
}

void AAncestorJourneyGameMode::BeginPlay()
{
	Super::BeginPlay();

	UGameInstance* GI = GetGameInstance();
	UChapterLoader* Loader = GI ? GI->GetSubsystem<UChapterLoader>() : nullptr;
	if (!Loader)
	{
		UE_LOG(LogTemp, Warning, TEXT("[AncestorJourney] ChapterLoader subsystem unavailable"));
		return;
	}

	FAncestorChapter Chapter;
	if (!Loader->LoadFirstChapter(Chapter))
	{
		UE_LOG(LogTemp, Warning, TEXT("[AncestorJourney] No chapter to load — run tools/export_chapter_json.mjs into Content/Data"));
		return;
	}

	UE_LOG(LogTemp, Display, TEXT("[AncestorJourney] Loaded '%s' (%d stops)"), *Chapter.Name, Chapter.Waypoints.Num());

	const TArray<FVector2D> Local = UAncestorGeo::ProjectWaypoints(Chapter.Waypoints);
	UWorld* World = GetWorld();
	if (!World || !*MarkerClass) return;

	for (int32 i = 0; i < Chapter.Waypoints.Num() && i < Local.Num(); ++i)
	{
		// Metres → Unreal cm (×100); +X east, +Y north, ground at Z=0.
		const FVector Loc(Local[i].X * 100.f, Local[i].Y * 100.f, 0.f);
		AWaypointMarker* Marker = World->SpawnActor<AWaypointMarker>(MarkerClass, Loc, FRotator::ZeroRotator);
		if (Marker)
		{
			Marker->SetFromWaypoint(Chapter.Waypoints[i]);
		}
	}
}
