// Copyright placeholder.
// A first-person walker. Uses legacy axis mappings (see Config/DefaultInput.ini)
// so the scaffold is self-contained without binary Enhanced Input assets;
// migrating to Enhanced Input is a documented follow-up.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "AncestorPlayerCharacter.generated.h"

class UCameraComponent;

UCLASS()
class ANCESTORJOURNEY_API AAncestorPlayerCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AAncestorPlayerCharacter();

protected:
	virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

	void MoveForward(float Value);
	void MoveRight(float Value);

	UPROPERTY(VisibleAnywhere, Category = "Ancestor")
	TObjectPtr<UCameraComponent> FirstPersonCamera;
};
