extends CanvasLayer

var _active_npc_id: String = ""
var _waiting_for_reply := false
var _histories: Dictionary = {}  # npc_id -> Array[{speaker, text}]

var _panel: Panel
var _npc_name_label: Label
var _history_vbox: VBoxContainer
var _scroll_container: ScrollContainer
var _message_input: LineEdit
var _send_button: Button

func _ready() -> void:
	add_to_group("chat_window")
	_build_ui()
	_panel.visible = false
	ServerBridge.npc_reply.connect(_on_npc_reply)

func _build_ui() -> void:
	_panel = Panel.new()
	add_child(_panel)
	_panel.anchor_left = 0.5
	_panel.anchor_top = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_bottom = 0.5
	_panel.offset_left = -250.0
	_panel.offset_top = -175.0
	_panel.offset_right = 250.0
	_panel.offset_bottom = 175.0

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 4)
	_panel.add_child(vbox)

	_npc_name_label = Label.new()
	_npc_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_npc_name_label.add_theme_font_size_override("font_size", 13)
	vbox.add_child(_npc_name_label)

	_scroll_container = ScrollContainer.new()
	_scroll_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(_scroll_container)

	_history_vbox = VBoxContainer.new()
	_history_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_history_vbox.add_theme_constant_override("separation", 2)
	_scroll_container.add_child(_history_vbox)

	var hbox := HBoxContainer.new()
	vbox.add_child(hbox)

	_message_input = LineEdit.new()
	_message_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_message_input.placeholder_text = "Say something..."
	_message_input.text_submitted.connect(_on_send)
	hbox.add_child(_message_input)

	_send_button = Button.new()
	_send_button.text = "Send"
	_send_button.pressed.connect(_on_send.bind(""))
	hbox.add_child(_send_button)

func open(npc_id: String, npc_name: String) -> void:
	_active_npc_id = npc_id
	_npc_name_label.text = npc_name
	_rebuild_history(npc_id)
	_panel.visible = true
	_message_input.grab_focus()

func _rebuild_history(npc_id: String) -> void:
	for child in _history_vbox.get_children():
		child.queue_free()
	if not _histories.has(npc_id):
		return
	for entry in _histories[npc_id]:
		_append_label(entry.speaker, entry.text)

func close() -> void:
	_panel.visible = false
	_active_npc_id = ""

func _input(event: InputEvent) -> void:
	if _panel.visible and event.is_action_pressed("ui_cancel"):
		close()
		get_viewport().set_input_as_handled()

func _on_send(_submitted_text: String = "") -> void:
	var text := _message_input.text.strip_edges()
	if text.is_empty() or _waiting_for_reply:
		return
	_message_input.clear()
	_message_input.editable = false
	_waiting_for_reply = true
	_add_message("You", text)
	ServerBridge.send_player_chat(_active_npc_id, text)

func _on_npc_reply(npc_id: String, reply_text: String) -> void:
	if npc_id != _active_npc_id:
		return
	_add_message(_npc_name_label.text, reply_text)
	_message_input.editable = true
	_waiting_for_reply = false
	_message_input.grab_focus()

func _add_message(speaker: String, text: String) -> void:
	if not _histories.has(_active_npc_id):
		_histories[_active_npc_id] = []
	_histories[_active_npc_id].append({ "speaker": speaker, "text": text })
	_append_label(speaker, text)

func _append_label(speaker: String, text: String) -> void:
	var label := RichTextLabel.new()
	label.bbcode_enabled = true
	label.fit_content = true
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.text = "[b]%s:[/b] %s" % [speaker, text]
	_history_vbox.add_child(label)
	await get_tree().process_frame
	_scroll_container.scroll_vertical = int(_scroll_container.get_v_scroll_bar().max_value)
