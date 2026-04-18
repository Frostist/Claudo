extends CanvasLayer

@onready var room_label: Label = $RoomLabel

func update_room(room_name: String) -> void:
	room_label.text = room_name
