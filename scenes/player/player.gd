extends CharacterBody2D

const SPEED := 80.0  # pixels per second
const CHAT_RANGE := 40.0

@onready var sprite: Sprite2D = $Sprite2D

func _physics_process(_delta: float) -> void:
	var direction := Vector2(
		Input.get_axis("ui_left", "ui_right"),
		Input.get_axis("ui_up", "ui_down")
	).normalized()

	velocity = direction * SPEED
	move_and_slide()

	if direction.x != 0:
		sprite.flip_h = direction.x < 0

func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("ui_chat"):
		return
	var closest: Node2D = null
	var closest_dist := CHAT_RANGE
	for npc in get_tree().get_nodes_in_group("npc"):
		var d := global_position.distance_to(npc.global_position)
		if d < closest_dist:
			closest_dist = d
			closest = npc
	if closest:
		var chat_window = get_tree().get_first_node_in_group("chat_window")
		if chat_window:
			chat_window.open(closest.npc_id, closest.npc_name)
