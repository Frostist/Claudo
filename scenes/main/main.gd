extends Node2D

@onready var mansion: Node2D = $Mansion
@onready var hud = $HUD
@onready var player: CharacterBody2D = $Player
@onready var notebook: CanvasLayer = $Notebook
@onready var chat_window: CanvasLayer = $ChatWindow
@onready var start_screen = $StartScreen
@onready var accusation_form: CanvasLayer = $AccusationForm
@onready var game_over_screen: CanvasLayer = $GameOverScreen

const LOADING_SCREEN_SCENE := preload("res://scenes/ui/loading/loading_screen.tscn")

var _server_pid := -1

func _ready() -> void:
	get_tree().auto_accept_quit = false  # required so NOTIFICATION_WM_CLOSE_REQUEST fires instead of instant quit
	mansion.room_changed.connect(hud.update_room)
	mansion.room_changed.connect(ServerBridge.send_player_moved)
	start_screen.start_requested.connect(_on_start_requested)
	accusation_form.submitted.connect(_on_accusation_submitted)
	ServerBridge.accusation_result.connect(_on_accusation_result)
	game_over_screen.new_game_requested.connect(_on_new_game)
	game_over_screen.quit_requested.connect(_on_quit)
	_set_gameplay_enabled(false)

func _on_start_requested(api_key: String) -> void:
	_set_gameplay_enabled(true)
	var loading_screen := LOADING_SCREEN_SCENE.instantiate()
	add_child(loading_screen)
	_spawn_server(api_key)

func _set_gameplay_enabled(enabled: bool) -> void:
	player.set_physics_process(enabled)
	player.set_process_input(enabled)
	player.set_process_unhandled_input(enabled)
	notebook.set_process_input(enabled)
	notebook.set_process_unhandled_input(enabled)
	chat_window.set_process_input(enabled)
	chat_window.set_process_unhandled_input(enabled)
	accusation_form.set_process_input(enabled)

func _spawn_server(api_key: String) -> void:
	var script_path := ProjectSettings.globalize_path("res://server/start.sh")
	print("[Main] Spawning server: ", script_path)
	_server_pid = OS.create_process("/bin/bash", [script_path, api_key])
	if _server_pid < 0:
		push_error("[Main] Failed to spawn server process (OS.create_process returned -1)")
		return
	print("[Main] Server process spawned — PID: ", _server_pid)
	# Wait 1.5s for the server to open the WebSocket port, then connect
	await get_tree().create_timer(1.5).timeout
	print("[Main] Connecting WebSocket to server...")
	ServerBridge.connect_to_server()

func _on_accusation_submitted(suspect_id: String, weapon: String, room: String) -> void:
	ServerBridge.send_accusation_submit(suspect_id, weapon, room)

func _on_accusation_result(correct: bool, actual_murderer: String, actual_weapon: String, actual_room: String) -> void:
	_set_gameplay_enabled(false)
	game_over_screen.show_result(correct, actual_murderer, actual_weapon, actual_room)

func _on_new_game() -> void:
	if _server_pid > 0:
		OS.kill(_server_pid)
	get_tree().change_scene_to_file("res://scenes/main/main.tscn")

func _on_quit() -> void:
	if _server_pid > 0:
		OS.kill(_server_pid)
	get_tree().quit()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		if _server_pid > 0:
			OS.kill(_server_pid)
		get_tree().quit()
