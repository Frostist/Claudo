extends CanvasLayer

@onready var panel: Panel = $Panel

var _backdrop: ColorRect

func _ready() -> void:
    _backdrop = ColorRect.new()
    _backdrop.color = Color(0, 0, 0, 0)
    _backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
    _backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
    _backdrop.visible = false
    _backdrop.gui_input.connect(_on_backdrop_input)
    add_child(_backdrop)
    move_child(_backdrop, 0)
    panel.move_to_front()

func _on_backdrop_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed:
        _close()

func _input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_notebook"):
        if get_viewport().gui_get_focus_owner() is TextEdit:
            return
        if panel.visible:
            _close()
        else:
            _open()
        get_viewport().set_input_as_handled()

func _open() -> void:
    panel.visible = true
    _backdrop.visible = true

func _close() -> void:
    panel.visible = false
    _backdrop.visible = false
    get_viewport().gui_release_focus()
