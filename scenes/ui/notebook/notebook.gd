extends CanvasLayer

@onready var panel: Panel = $Panel

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_notebook"):
        panel.visible = !panel.visible
        get_viewport().set_input_as_handled()
