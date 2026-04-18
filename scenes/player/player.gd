extends CharacterBody2D

const SPEED := 80.0  # pixels per second

@onready var sprite: Sprite2D = $Sprite2D

func _physics_process(delta: float) -> void:
	var direction := Vector2(
		Input.get_axis("ui_left", "ui_right"),
		Input.get_axis("ui_up", "ui_down")
	).normalized()

	velocity = direction * SPEED
	move_and_slide()

	if direction.x != 0:
		sprite.flip_h = direction.x < 0
