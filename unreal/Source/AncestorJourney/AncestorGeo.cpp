// Copyright placeholder. See AncestorGeo.h.
#include "AncestorGeo.h"

namespace
{
	constexpr double KM_PER_DEG_LAT = 110.574;
	constexpr double LOCAL_CAP_KM = 0.15;      // up to 150 m of real travel renders 1:1
	constexpr double UNITS_PER_KM_LOCAL = 1000.0;
	constexpr double LOG_SPAN_UNITS = 130.0;   // metres added per factor-of-ten beyond the cap
	constexpr double MIN_SEPARATION = 20.0;    // metres — keep revisited places distinct
	constexpr double GOLDEN_ANGLE = 2.399963229728653;

	double KmPerDegLng(double LatDeg)
	{
		return 111.320 * FMath::Cos(FMath::DegreesToRadians(LatDeg));
	}
}

double UAncestorGeo::CompressKm(double Km)
{
	if (Km <= 0.0) return 0.0;
	if (Km <= LOCAL_CAP_KM) return Km * UNITS_PER_KM_LOCAL;
	const double Base = LOCAL_CAP_KM * UNITS_PER_KM_LOCAL;
	return Base + FMath::LogX(10.0, Km / LOCAL_CAP_KM) * LOG_SPAN_UNITS;
}

FVector2D UAncestorGeo::ResolveCollision(FVector2D P, const TArray<FVector2D>& Placed, int32 Seed)
{
	for (int32 Attempt = 0; Attempt < Placed.Num() + 4; ++Attempt)
	{
		const FVector2D* Hit = Placed.FindByPredicate([&](const FVector2D& Q)
		{
			return FVector2D::Distance(Q, P) < MIN_SEPARATION;
		});
		if (!Hit) return P;
		const double Angle = (Seed + Attempt) * GOLDEN_ANGLE;
		P = FVector2D(Hit->X + FMath::Cos(Angle) * MIN_SEPARATION, Hit->Y + FMath::Sin(Angle) * MIN_SEPARATION);
	}
	return P;
}

TArray<FVector2D> UAncestorGeo::ProjectWaypoints(const TArray<FAncestorWaypoint>& Waypoints)
{
	TArray<FVector2D> Out;
	double Cx = 0.0, Cy = 0.0;
	bool bHasPrev = false;
	double PrevLat = 0.0, PrevLng = 0.0;

	for (int32 i = 0; i < Waypoints.Num(); ++i)
	{
		const FAncestorWaypoint& Wp = Waypoints[i];
		if (!bHasPrev)
		{
			Out.Add(FVector2D(0.0, 0.0));
		}
		else
		{
			const double dLat = Wp.Lat - PrevLat;
			const double dLng = Wp.Lng - PrevLng;
			const double MidLat = (Wp.Lat + PrevLat) / 2.0;
			const double NorthKm = dLat * KM_PER_DEG_LAT;         // +Y = north
			const double EastKm = dLng * KmPerDegLng(MidLat);     // +X = east
			const double Km = FMath::Sqrt(EastKm * EastKm + NorthKm * NorthKm);
			const double Compressed = CompressKm(Km);
			const double Scale = Km > 0.0 ? Compressed / Km : 0.0;
			Cx += EastKm * Scale;
			Cy += NorthKm * Scale;
			const FVector2D Resolved = ResolveCollision(FVector2D(Cx, Cy), Out, i);
			Cx = Resolved.X;
			Cy = Resolved.Y;
			Out.Add(FVector2D(Cx, Cy));
		}
		PrevLat = Wp.Lat;
		PrevLng = Wp.Lng;
		bHasPrev = true;
	}
	return Out;
}
