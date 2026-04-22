extends Node2D

signal room_changed(room_name: String)

const ROOM_NAMES := {
	"RoomKitchen": "Kitchen",
	"RoomBallroom": "Ballroom",
	"RoomConservatory": "Conservatory",
	"RoomBilliardRoom": "Billiard Room",
	"RoomHall": "Hall",
	"RoomLibrary": "Library",
	"RoomAccusation": "Accusation Room",
	"RoomStudy": "Study",
	"RoomLounge": "Lounge",
	"RoomDiningRoom": "Dining Room",
}

func _ready() -> void:
	for area in get_children():
		if area is Area2D and ROOM_NAMES.has(area.name):
			area.body_entered.connect(_on_room_entered.bind(area.name))

func _on_room_entered(body: Node2D, area_name: String) -> void:
	if body.is_in_group("player"):
		room_changed.emit(ROOM_NAMES[area_name])
