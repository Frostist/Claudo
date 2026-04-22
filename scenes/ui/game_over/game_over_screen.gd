extends CanvasLayer

signal new_game_requested()
signal quit_requested()

var _title_label: Label
var _subtitle_label: Label
var _details_label: Label
var _new_game_btn: Button
var _quit_btn: Button

func _ready() -> void:
	visible = false
	_build_ui()

func _build_ui() -> void:
	var panel := Panel.new()
	add_child(panel)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -250.0
	panel.offset_top = -180.0
	panel.offset_right = 250.0
	panel.offset_bottom = 180.0

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 12)
	panel.add_child(vbox)

	_title_label = Label.new()
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_font_size_override("font_size", 20)
	vbox.add_child(_title_label)

	_subtitle_label = Label.new()
	_subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle_label.add_theme_font_size_override("font_size", 14)
	vbox.add_child(_subtitle_label)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(spacer)

	_details_label = Label.new()
	_details_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_details_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	vbox.add_child(_details_label)

	var hbox := HBoxContainer.new()
	hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	hbox.add_theme_constant_override("separation", 16)
	vbox.add_child(hbox)

	_new_game_btn = Button.new()
	_new_game_btn.text = "New Game"
	_new_game_btn.pressed.connect(func() -> void: new_game_requested.emit())
	hbox.add_child(_new_game_btn)

	_quit_btn = Button.new()
	_quit_btn.text = "Quit"
	_quit_btn.pressed.connect(func() -> void: quit_requested.emit())
	hbox.add_child(_quit_btn)

func show_result(correct: bool, actual_murderer: String, actual_weapon: String, actual_room: String) -> void:
	visible = true
	if correct:
		_title_label.text = "Case Solved!"
		_subtitle_label.text = "You found the truth."
	else:
		_title_label.text = "Case Unsolved"
		_subtitle_label.text = "Your accusation was incorrect."
	_details_label.text = "The truth: %s with the %s in the %s." % [
		actual_murderer,
		actual_weapon,
		actual_room,
	]
