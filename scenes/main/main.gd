extends Node2D

@onready var mansion: Node2D = $Mansion
@onready var hud = $HUD

func _ready() -> void:
	mansion.room_changed.connect(hud.update_room)
