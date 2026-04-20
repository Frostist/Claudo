extends Area2D

@export var npc_name: String = "Unknown"
@export var npc_id: String = ""
@export var npc_texture: Texture2D

@onready var sprite: Sprite2D = $NPCSprite

var _move_tween: Tween
var _is_dead: bool = false

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
	ServerBridge.npc_eliminated.connect(_on_npc_eliminated)
	ServerBridge.npc_clue.connect(_on_npc_clue)

func _on_npc_moved(moved_npc_id: String, room_name: String) -> void:
	if moved_npc_id != npc_id:
		return
	var target := ROOM_POSITIONS.get(room_name, global_position) as Vector2
	if _move_tween and _move_tween.is_valid():
		_move_tween.kill()
	_move_tween = create_tween()
	_move_tween.tween_property(self, "global_position", target, 1.0).set_trans(Tween.TRANS_LINEAR)

func _on_npc_eliminated(eliminated_npc_id: String) -> void:
	if eliminated_npc_id != npc_id:
		return
	_is_dead = true
	if _move_tween and _move_tween.is_valid():
		_move_tween.kill()
	sprite.modulate = Color(0.4, 0.4, 0.4, 1.0)

func _on_npc_clue(clue_npc_id: String, clue_text: String) -> void:
	if clue_npc_id != npc_id:
		return
	var chat_window = get_tree().get_first_node_in_group("chat_window")
	if chat_window:
		chat_window.show_clue(npc_name, clue_text, _dismiss_body)

func _dismiss_body() -> void:
	_is_dead = false
	sprite.visible = false
