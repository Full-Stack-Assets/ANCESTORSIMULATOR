// Copyright placeholder.
// Loads chapter JSON from Content/Data/ (produced by
// tools/export_chapter_json.mjs). A GameInstance subsystem so it's available
// everywhere and survives level loads.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AncestorTypes.h"
#include "ChapterLoader.generated.h"

UCLASS()
class ANCESTORJOURNEY_API UChapterLoader : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	/** Read Content/Data/index.json. Returns false if it's missing/malformed. */
	UFUNCTION(BlueprintCallable, Category = "Ancestor")
	bool LoadManifest(FAncestorChapterManifest& OutManifest) const;

	/** Read a single chapter file (e.g. "william-albertson.json") from Content/Data. */
	UFUNCTION(BlueprintCallable, Category = "Ancestor")
	bool LoadChapter(const FString& FileName, FAncestorChapter& OutChapter) const;

	/** Convenience: load the first chapter listed in the manifest. */
	UFUNCTION(BlueprintCallable, Category = "Ancestor")
	bool LoadFirstChapter(FAncestorChapter& OutChapter) const;

private:
	static FString DataDir();
	static bool ReadJsonFile(const FString& AbsPath, FString& OutJson);
};
