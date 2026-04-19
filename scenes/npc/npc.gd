extends Area2D

@export var npc_name: String = "Unknown"
@export var npc_id: String = ""
@export var npc_texture: Texture2D

@onready var sprite: Sprite2D = $NPCSprite

func _ready() -> void:
	if npc_texture:
		sprite.texture = npc_texture
	add_to_group("npc")
