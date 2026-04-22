extends CanvasLayer

signal cancelled()
signal submitted(suspect_id: String, weapon: String, room: String)

var _suspect_dropdown: OptionButton
var _weapon_dropdown: OptionButton
var _room_dropdown: OptionButton
var _panel: Panel
var _confirm_button: Button

func _ready() -> void:
	visible = false
	_build_ui()

func _build_ui() -> void:
	_panel = Panel.new()
	add_child(_panel)
	_panel.set_anchors_preset(Control.PRESET_CENTER)
	_panel.offset_left = -200.0
	_panel.offset_top = -180.0
	_panel.offset_right = 200.0
	_panel.offset_bottom = 180.0

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 8)
	_panel.add_child(vbox)

	var title := Label.new()
	title.text = "Make Your Accusation"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 16)
	vbox.add_child(title)

	_suspect_dropdown = _create_dropdown("Suspect:", _get_suspects())
	vbox.add_child(_suspect_dropdown.get_parent())

	_weapon_dropdown = _create_dropdown("Weapon:", _get_weapons())
	vbox.add_child(_weapon_dropdown.get_parent())

	_room_dropdown = _create_dropdown("Room:", _get_rooms())
	vbox.add_child(_room_dropdown.get_parent())

	var hbox := HBoxContainer.new()
	hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_child(hbox)

	var cancel_btn := Button.new()
	cancel_btn.text = "Cancel"
	cancel_btn.pressed.connect(_on_cancel)
	hbox.add_child(cancel_btn)

	_confirm_button = Button.new()
	_confirm_button.text = "Submit Accusation"
	_confirm_button.pressed.connect(_on_submit)
	hbox.add_child(_confirm_button)

func _create_dropdown(label_text: String, items: Array) -> OptionButton:
	var hbox := HBoxContainer.new()
	hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var label := Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(80, 0)
	hbox.add_child(label)

	var dropdown := OptionButton.new()
	dropdown.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for item in items:
		dropdown.add_item(item.display)
		dropdown.set_item_metadata(dropdown.item_count - 1, item.id)
	hbox.add_child(dropdown)

	dropdown.item_selected.connect(_on_selection_changed)
	return dropdown

func _on_selection_changed(_index: int) -> void:
	_confirm_button.disabled = (
		_suspect_dropdown.selected == -1 or
		_weapon_dropdown.selected == -1 or
		_room_dropdown.selected == -1
	)

func _on_cancel() -> void:
	visible = false
	cancelled.emit()

func _on_submit() -> void:
	var suspect_id: String = _suspect_dropdown.get_item_metadata(_suspect_dropdown.selected)
	var weapon: String = _weapon_dropdown.get_item_metadata(_weapon_dropdown.selected)
	var room: String = _room_dropdown.get_item_metadata(_room_dropdown.selected)
	visible = false
	submitted.emit(suspect_id, weapon, room)

func open() -> void:
	visible = true
	_confirm_button.disabled = true
	_suspect_dropdown.select(-1)
	_weapon_dropdown.select(-1)
	_room_dropdown.select(-1)

func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		_on_cancel()
		get_viewport().set_input_as_handled()

func _get_suspects() -> Array:
	return [
		{ id = "npc_scarlett", display = "Miss Scarlett" },
		{ id = "npc_mustard", display = "Col. Mustard" },
		{ id = "npc_white", display = "Mrs. White" },
		{ id = "npc_green", display = "Rev. Green" },
		{ id = "npc_peacock", display = "Mrs. Peacock" },
		{ id = "npc_plum", display = "Prof. Plum" },
	]

func _get_weapons() -> Array:
	return [
		{ id = "Candlestick", display = "Candlestick" },
		{ id = "Knife", display = "Knife" },
		{ id = "Lead Pipe", display = "Lead Pipe" },
		{ id = "Revolver", display = "Revolver" },
		{ id = "Rope", display = "Rope" },
		{ id = "Wrench", display = "Wrench" },
	]

func _get_rooms() -> Array:
	return [
		{ id = "Kitchen", display = "Kitchen" },
		{ id = "Ballroom", display = "Ballroom" },
		{ id = "Conservatory", display = "Conservatory" },
		{ id = "Billiard Room", display = "Billiard Room" },
		{ id = "Hall", display = "Hall" },
		{ id = "Library", display = "Library" },
		{ id = "Accusation Room", display = "Accusation Room" },
		{ id = "Study", display = "Study" },
		{ id = "Lounge", display = "Lounge" },
		{ id = "Dining Room", display = "Dining Room" },
	]
