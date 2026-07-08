// Copyright placeholder.
// Data model for a "chapter" — mirrors the JSON emitted by
// tools/export_chapter_json.mjs (which is the same shape src/chapter.js
// produces for the web build). Field names match the JSON case-insensitively,
// so FJsonObjectConverter::JsonObjectStringToUStruct maps them directly.
#pragma once

#include "CoreMinimal.h"
#include "AncestorTypes.generated.h"

/** One documented moment in an ancestor's life — a place you walk to. */
USTRUCT(BlueprintType)
struct FAncestorWaypoint
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 Seq = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Place;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") double Lat = 0.0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") double Lng = 0.0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Date;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 Year = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Event;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Narrative;
	/** "documented" | "inferred" | "legend" — see UAncestorConfidence for colors. */
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Confidence;
};

USTRUCT(BlueprintType)
struct FAncestorChild
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Fate;
};

USTRUCT(BlueprintType)
struct FAncestorSpouse
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 BirthYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 DeathYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 MarriageYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString MarriagePlace;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Confidence;
};

USTRUCT(BlueprintType)
struct FAncestorOccupation
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Value;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Confidence;
};

/** A full playable chapter: one ancestor's life. */
USTRUCT(BlueprintType)
struct FAncestorChapter
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Id;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 BirthYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 DeathYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Summary;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") TArray<FAncestorWaypoint> Waypoints;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FAncestorSpouse Spouse;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FAncestorOccupation Occupation;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") TArray<FAncestorChild> Children;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString LegacyNote;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString ChildrenNote;
};

/** One entry in Content/Data/index.json. */
USTRUCT(BlueprintType)
struct FAncestorChapterManifestEntry
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Id;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 BirthYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 DeathYear = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") int32 Waypoints = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") FString File;
};

USTRUCT(BlueprintType)
struct FAncestorChapterManifest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Ancestor") TArray<FAncestorChapterManifestEntry> Chapters;
};

/** Confidence → display color, mirroring the web build's badge palette. */
UCLASS()
class ANCESTORJOURNEY_API UAncestorConfidence : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintPure, Category = "Ancestor")
	static FLinearColor ColorFor(const FString& Confidence)
	{
		if (Confidence.Equals(TEXT("documented"), ESearchCase::IgnoreCase)) return FLinearColor(0.231f, 0.647f, 0.361f); // #3ba55c
		if (Confidence.Equals(TEXT("inferred"), ESearchCase::IgnoreCase))   return FLinearColor(0.231f, 0.510f, 0.769f); // #3b82c4
		if (Confidence.Equals(TEXT("legend"), ESearchCase::IgnoreCase))     return FLinearColor(0.608f, 0.349f, 0.714f); // #9b59b6
		return FLinearColor(0.6f, 0.6f, 0.6f);
	}
};
