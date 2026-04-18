extends Area2D

@export var npc_name: String = "Unknown"
@export var npc_id: String = ""
@export var npc_texture: Texture2D

@onready var sprite: Sprite2D = $NPCSprite

func _ready() -> void:
	if npc_texture:
		sprite.texture = npc_texture
	input_pickable = true
	input_event.connect(_on_input_event)

func _on_input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var chat_window = get_tree().get_first_node_in_group("chat_window")
		if chat_window:
			chat_window.open(npc_id, npc_name)
