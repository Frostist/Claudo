extends Node2D

@onready var mansion: Node2D = $Mansion
@onready var hud = $HUD

var _server_pid := -1

func _ready() -> void:
	get_tree().auto_accept_quit = false  # required so NOTIFICATION_WM_CLOSE_REQUEST fires instead of instant quit
	mansion.room_changed.connect(hud.update_room)
	mansion.room_changed.connect(ServerBridge.send_player_moved)
	_spawn_server()

func _spawn_server() -> void:
	var script_path := ProjectSettings.globalize_path("res://server/start.sh")
	print("[Main] Spawning server: ", script_path)
	_server_pid = OS.create_process("/bin/bash", [script_path])
	if _server_pid < 0:
		push_error("[Main] Failed to spawn server process (OS.create_process returned -1)")
		return
	print("[Main] Server process spawned — PID: ", _server_pid)
	# Wait 1.5s for the server to open the WebSocket port, then connect
	await get_tree().create_timer(1.5).timeout
	print("[Main] Connecting WebSocket to server...")
	ServerBridge.connect_to_server()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		if _server_pid > 0:
			OS.kill(_server_pid)
		get_tree().quit()
