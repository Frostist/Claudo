extends CanvasLayer

signal start_requested(api_key: String)

const TITLE_ART := "  _____ _                 _       \n / ____| |               | |      \n| |    | | __ _ _   _  __| | ___  \n| |    | |/ _` | | | |/ _` |/ _ \\ \n| |____| | (_| | |_| | (_| | (_) |\n \\_____|_|\\__,_|\\__,_|\\__,_|\\___/"

var _api_input: LineEdit
var _error_label: Label

func _ready() -> void:
	layer = 50
	_build_ui()

func _build_ui() -> void:
	var panel := Panel.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.05, 0.05, 0.96)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.add_child(center)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 20)
	margin.add_theme_constant_override("margin_top", 20)
	margin.add_theme_constant_override("margin_right", 20)
	margin.add_theme_constant_override("margin_bottom", 20)
	center.add_child(margin)

	var layout := VBoxContainer.new()
	layout.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	layout.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	layout.alignment = BoxContainer.ALIGNMENT_CENTER
	layout.add_theme_constant_override("separation", 16)
	margin.add_child(layout)

	var title := Label.new()
	title.text = TITLE_ART
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.clip_text = false
	title.add_theme_font_size_override("font_size", 18)
	layout.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "Enter your Google API key to start a new mystery."
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	layout.add_child(subtitle)

	_api_input = LineEdit.new()
	_api_input.placeholder_text = "GOOGLE_API_KEY"
	_api_input.custom_minimum_size = Vector2(520, 0)
	_api_input.secret = true
	_api_input.text_submitted.connect(_on_start_pressed)
	layout.add_child(_api_input)

	_error_label = Label.new()
	_error_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_error_label.modulate = Color(1.0, 0.4, 0.4)
	_error_label.visible = false
	layout.add_child(_error_label)

	var start_button := Button.new()
	start_button.text = "Start Game"
	start_button.custom_minimum_size = Vector2(220, 44)
	start_button.pressed.connect(_on_start_pressed.bind(""))
	layout.add_child(start_button)

	_api_input.grab_focus()

func _on_start_pressed(_submitted_text: String = "") -> void:
	var api_key := _api_input.text.strip_edges()
	if api_key.is_empty():
		_error_label.text = "Please enter your GOOGLE_API_KEY."
		_error_label.visible = true
		return

	_error_label.visible = false
	start_requested.emit(api_key)
	queue_free()
