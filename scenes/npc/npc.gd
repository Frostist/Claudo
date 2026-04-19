extends Area2D

@export var npc_name: String = "Unknown"
@export var npc_id: String = ""
@export var npc_texture: Texture2D

@onready var sprite: Sprite2D = $NPCSprite

const CHAT_RANGE := 40.0

# World-space room centres. Row 3 positions are estimated — verify visually and adjust if needed.
const ROOM_POSITIONS: Dictionary = {
	"Kitchen":       Vector2(144, 112),
	"Ballroom":      Vector2(354, 112),
	"Conservatory":  Vector2(576, 112),
	"Billiard Room": Vector2(144, 306),
	"Hall":          Vector2(354, 306),
	"Library":       Vector2(576, 306),
	"Study":         Vector2(144, 500),
	"Lounge":        Vector2(354, 500),
	"Dining Room":   Vector2(576, 500),
}

func _ready() -> void:
	if npc_texture:
		sprite.texture = npc_texture
	add_to_group("npc")
	ServerBridge.npc_moved.connect(_on_npc_moved)

func _on_npc_moved(moved_npc_id: String, room_name: String) -> void:
	if moved_npc_id != npc_id:
		return
	var target := ROOM_POSITIONS.get(room_name, global_position) as Vector2
	var tween := create_tween()
	tween.tween_property(self, "global_position", target, 1.0).set_trans(Tween.TRANS_LINEAR)
