extends CanvasLayer

const TIMEOUT := 30.0  # GM GameSetup (Claude Opus call) can take 5–15 s; 30 s provides headroom

var status_label: Label
var quit_button: Button
var _elapsed := 0.0
var _active := true

func _ready() -> void:
	# Build UI programmatically to avoid complex .tscn format
	var panel := Panel.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.1, 0.1, 0.95)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_CENTER)
	vbox.set("offset_left", -150.0)
	vbox.set("offset_top", -40.0)
	vbox.set("offset_right", 150.0)
	vbox.set("offset_bottom", 40.0)
	panel.add_child(vbox)

	status_label = Label.new()
	status_label.text = "Starting game..."
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(status_label)

	quit_button = Button.new()
	quit_button.text = "Quit"
	quit_button.visible = false
	quit_button.pressed.connect(get_tree().quit)
	vbox.add_child(quit_button)

	ServerBridge.game_ready.connect(_on_game_ready)
	set_process(true)

func _process(delta: float) -> void:
	if not _active:
		return
	_elapsed += delta
	status_label.text = "Starting game... (%.0fs)" % _elapsed
	if _elapsed >= TIMEOUT:
		print("[LoadingScreen] Timed out after ", TIMEOUT, "s — server did not send game_ready")
		status_label.text = "Failed to start server.\nIs Node.js installed?"
		quit_button.visible = true
		set_process(false)

func _on_game_ready() -> void:
	_active = false
	queue_free()
