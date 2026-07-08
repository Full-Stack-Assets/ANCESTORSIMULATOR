// Copyright placeholder. See ChapterLoader.h.
#include "ChapterLoader.h"
#include "JsonObjectConverter.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

FString UChapterLoader::DataDir()
{
	return FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data"));
}

bool UChapterLoader::ReadJsonFile(const FString& AbsPath, FString& OutJson)
{
	if (!FPaths::FileExists(AbsPath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[AncestorJourney] Chapter data not found: %s"), *AbsPath);
		return false;
	}
	return FFileHelper::LoadFileToString(OutJson, *AbsPath);
}

bool UChapterLoader::LoadManifest(FAncestorChapterManifest& OutManifest) const
{
	FString Json;
	if (!ReadJsonFile(FPaths::Combine(DataDir(), TEXT("index.json")), Json)) return false;
	if (!FJsonObjectConverter::JsonObjectStringToUStruct(Json, &OutManifest, 0, 0))
	{
		UE_LOG(LogTemp, Warning, TEXT("[AncestorJourney] index.json failed to parse"));
		return false;
	}
	return true;
}

bool UChapterLoader::LoadChapter(const FString& FileName, FAncestorChapter& OutChapter) const
{
	FString Json;
	if (!ReadJsonFile(FPaths::Combine(DataDir(), FileName), Json)) return false;
	if (!FJsonObjectConverter::JsonObjectStringToUStruct(Json, &OutChapter, 0, 0))
	{
		UE_LOG(LogTemp, Warning, TEXT("[AncestorJourney] %s failed to parse"), *FileName);
		return false;
	}
	return true;
}

bool UChapterLoader::LoadFirstChapter(FAncestorChapter& OutChapter) const
{
	FAncestorChapterManifest Manifest;
	if (!LoadManifest(Manifest) || Manifest.Chapters.Num() == 0) return false;
	return LoadChapter(Manifest.Chapters[0].File, OutChapter);
}
