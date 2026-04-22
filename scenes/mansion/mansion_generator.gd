@tool
extends TileMapLayer

# Room definitions: [grid_col, grid_row, room_node_name]
const ROOMS = [
	[0, 0, "RoomKitchen"],
	[1, 0, "RoomBallroom"],
	[2, 0, "RoomConservatory"],
	[0, 1, "RoomBilliardRoom"],
	[1, 1, "RoomHall"],
	[2, 1, "RoomLibrary"],
	[3, 1, "RoomAccusation"],
	[0, 2, "RoomStudy"],
	[1, 2, "RoomLounge"],
	[2, 2, "RoomDiningRoom"],
]

const BLOCK_W = 20  # tiles per room block width
const BLOCK_H = 17  # tiles per room block height
const GAP = 1       # tile gap between blocks (corridor)
const STEP_X = BLOCK_W + GAP  # = 21
const STEP_Y = BLOCK_H + GAP  # = 18

const FLOOR = Vector2i(0, 0)
const WALL  = Vector2i(1, 0)
const DOOR  = Vector2i(2, 0)

const ROOM_FLOORS := {
	"RoomKitchen":      Vector2i(3, 0),
	"RoomBallroom":     Vector2i(4, 0),
	"RoomConservatory": Vector2i(5, 0),
	"RoomBilliardRoom": Vector2i(6, 0),
	"RoomHall":         Vector2i(7, 0),
	"RoomLibrary":      Vector2i(8, 0),
	"RoomStudy":        Vector2i(9, 0),
	"RoomLounge":       Vector2i(10, 0),
	"RoomDiningRoom":   Vector2i(11, 0),
	"RoomAccusation":   Vector2i(12, 0),
}

const CORRIDOR_FLOOR := Vector2i(7, 0)

func _ready() -> void:
	_generate_mansion()

func _generate_mansion() -> void:
	clear()
	# Draw all room blocks
	for room in ROOMS:
		var gx: int = room[0]
		var gy: int = room[1]
		_draw_room(gx * STEP_X, gy * STEP_Y, ROOM_FLOORS[room[2]])
	# Draw corridors between horizontally adjacent rooms (same row)
	for gy in range(3):
		for gx in range(3):  # gaps between col 0-1, col 1-2, and col 2-3
			_draw_h_corridor(gx, gy)
	# Draw corridors between vertically adjacent rooms (same col)
	for gx in range(3):
		for gy in range(2):  # gaps between row 0-1 and row 1-2
			_draw_v_corridor(gx, gy)

func _draw_room(tx: int, ty: int, floor_tile: Vector2i) -> void:
	# Fill entire block with walls
	for x in range(BLOCK_W):
		for y in range(BLOCK_H):
			set_cell(Vector2i(tx + x, ty + y), 0, WALL)
	# Fill interior with room-specific floor
	for x in range(1, BLOCK_W - 1):
		for y in range(1, BLOCK_H - 1):
			set_cell(Vector2i(tx + x, ty + y), 0, floor_tile)

func _draw_h_corridor(gx: int, gy: int) -> void:
	var gap_x: int = (gx + 1) * STEP_X - 1
	var room_y: int = gy * STEP_Y
	# Fill entire gap column with wall so no empty cells exist
	for dy in range(BLOCK_H):
		set_cell(Vector2i(gap_x, room_y + dy), 0, WALL)
	# Punch door opening at centre rows
	for dy in [7, 8, 9]:
		var ty = room_y + dy
		set_cell(Vector2i(gap_x - 1, ty), 0, DOOR)
		set_cell(Vector2i(gap_x, ty), 0, CORRIDOR_FLOOR)
		set_cell(Vector2i(gap_x + 1, ty), 0, DOOR)

func _draw_v_corridor(gx: int, gy: int) -> void:
	var gap_y: int = (gy + 1) * STEP_Y - 1
	var room_x: int = gx * STEP_X
	# Fill entire gap row with wall so no empty cells exist
	for dx in range(BLOCK_W):
		set_cell(Vector2i(room_x + dx, gap_y), 0, WALL)
	# Punch door opening at centre columns
	for dx in [9, 10, 11]:
		var tx = room_x + dx
		set_cell(Vector2i(tx, gap_y - 1), 0, DOOR)
		set_cell(Vector2i(tx, gap_y), 0, CORRIDOR_FLOOR)
		set_cell(Vector2i(tx, gap_y + 1), 0, DOOR)
