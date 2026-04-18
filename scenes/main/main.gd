extends Node2D

@onready var camera: Camera2D = $Camera
@onready var player: CharacterBody2D = $Player
@onready var mansion: Node2D = $Mansion
@onready var hud = $HUD

func _ready() -> void:
	camera.reparent(player)
	mansion.room_changed.connect(hud.update_room)
