// Copyright placeholder. See WaypointMarker.h.
#include "WaypointMarker.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

AWaypointMarker::AWaypointMarker()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Pillar = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Pillar"));
	Pillar->SetupAttachment(Root);
	// Engine primitive so the scaffold renders something without authored assets.
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (CylinderMesh.Succeeded())
	{
		Pillar->SetStaticMesh(CylinderMesh.Object);
	}
	// A slim pillar ~3 m tall (engine cylinder is 100 cm; scale to taste).
	Pillar->SetRelativeScale3D(FVector(0.35f, 0.35f, 3.0f));
	Pillar->SetRelativeLocation(FVector(0.f, 0.f, 150.f));

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Root);
	Glow->SetRelativeLocation(FVector(0.f, 0.f, 340.f));
	Glow->SetIntensity(4000.f);
	Glow->SetAttenuationRadius(600.f);

	Label = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Label"));
	Label->SetupAttachment(Root);
	Label->SetRelativeLocation(FVector(0.f, 0.f, 420.f));
	Label->SetHorizontalAlignment(EHTA_Center);
	Label->SetWorldSize(48.f);
}

void AWaypointMarker::SetFromWaypoint(const FAncestorWaypoint& InWaypoint)
{
	Waypoint = InWaypoint;

	const FLinearColor Color = UAncestorConfidence::ColorFor(InWaypoint.Confidence);
	if (Glow)
	{
		Glow->SetLightColor(Color);
	}
	if (Label)
	{
		const FString Text = InWaypoint.Year > 0
			? FString::Printf(TEXT("%d  %s"), InWaypoint.Year, *InWaypoint.Event)
			: InWaypoint.Event;
		Label->SetText(FText::FromString(Text));
		Label->SetTextRenderColor(Color.ToFColor(true));
	}
}
