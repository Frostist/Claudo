extends Node

signal npc_reply(npc_id: String, text: String)
signal game_ready()
signal npc_moved(npc_id: String, room_name: String)
signal npc_eliminated(npc_id: String)
signal npc_clue(npc_id: String, clue_text: String)

const WS_URL := "ws://127.0.0.1:9876"
const RECONNECT_INTERVAL := 3.0
const RECONNECT_TIMEOUT := 300.0

var _socket := WebSocketPeer.new()
var _connected := false
var _reconnecting := false
var _connection_started := false  # guard so _process ignores socket before connect_to_server() is called
var _reconnect_timer := 0.0
var _reconnect_elapsed := 0.0

func _ready() -> void:
	set_process(true)

func connect_to_server() -> void:
	_connection_started = true
	print("[ServerBridge] Connecting to ", WS_URL)
	_socket.connect_to_url(WS_URL)

func _process(delta: float) -> void:
	if not _connection_started:
		return
	_socket.poll()
	var state := _socket.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN:
		if not _connected:
			_connected = true
			_reconnecting = false
			_reconnect_timer = 0.0
			_reconnect_elapsed = 0.0
			print("[ServerBridge] Connected to server")
		while _socket.get_available_packet_count() > 0:
			var raw := _socket.get_packet().get_string_from_utf8()
			_handle_message(raw)

	elif state == WebSocketPeer.STATE_CLOSED:
		if _connected or not _reconnecting:
			# Either dropped mid-game or initial connection failed — start/restart reconnect loop
			if _connected:
				print("[ServerBridge] Connection dropped — starting reconnect loop")
				_connected = false
			else:
				print("[ServerBridge] Initial connection failed — retrying every ", RECONNECT_INTERVAL, "s")
			_start_reconnect()
		else:
			# Already in reconnect loop — manage timer
			_reconnect_elapsed += delta
			_reconnect_timer += delta
			if _reconnect_elapsed >= RECONNECT_TIMEOUT:
				_on_reconnect_timeout()
			elif _reconnect_timer >= RECONNECT_INTERVAL:
				_reconnect_timer = 0.0
				_socket = WebSocketPeer.new()
				_socket.connect_to_url(WS_URL)

func _handle_message(raw: String) -> void:
	var json := JSON.new()
	if json.parse(raw) != OK:
		push_warning("[ServerBridge] Received unparseable message: ", raw.left(100))
		return
	var msg: Dictionary = json.get_data()
	var event := msg.get("event", "unknown") as String
	var data: Dictionary = msg.get("data", {})
	print("[ServerBridge] <<< event: ", event, "  data: ", data)
	match event:
		"game_ready":
			game_ready.emit()
		"npc_reply":
			var npc_id := data.get("npc_id", "") as String
			var text := data.get("text", "") as String
			print("[ServerBridge] <<< NPC reply from ", npc_id, ": ", text)
			npc_reply.emit(npc_id, text)
		"npc_moved":
			npc_moved.emit(data.get("npc_id", ""), data.get("room_name", ""))
		"npc_eliminated":
			npc_eliminated.emit(data.get("npc_id", ""))
		"npc_clue":
			npc_clue.emit(data.get("npc_id", ""), data.get("clue_text", ""))
		"state_snapshot":
			pass  # Phase 2+ will handle restoring state
		_:
			print("[ServerBridge] <<< unhandled event: ", event)

func _send(event: String, data: Dictionary) -> void:
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		push_warning("[ServerBridge] >>> cannot send '", event, "' — socket not open")
		return
	var msg := JSON.stringify({ "event": event, "data": data })
	print("[ServerBridge] >>> sending event: ", event, "  data: ", data)
	_socket.send_text(msg)

func send_player_chat(npc_id: String, message: String) -> void:
	print("[ServerBridge] >>> player_chat to ", npc_id, ": ", message)
	_send("player_chat", { "npc_id": npc_id, "message": message })

func send_player_moved(room_name: String) -> void:
	_send("player_moved", { "room_name": room_name })

func send_notebook_updated(text: String) -> void:
	_send("notebook_updated", { "text": text })

func send_body_interacted(npc_id: String) -> void:
	_send("body_interacted", { "npc_id": npc_id })

func _start_reconnect() -> void:
	_reconnecting = true
	_reconnect_elapsed = 0.0
	_reconnect_timer = RECONNECT_INTERVAL  # trigger immediately

func _on_reconnect_timeout() -> void:
	_reconnecting = false
	get_tree().change_scene_to_file("res://scenes/main/main.tscn")
