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

func _ready() -> void:
	_generate_mansion()

func _generate_mansion() -> void:
	clear()
	# Draw all room blocks
	for room in ROOMS:
		var gx: int = room[0]
		var gy: int = room[1]
		_draw_room(gx * STEP_X, gy * STEP_Y)
	# Draw corridors between horizontally adjacent rooms (same row)
	for gy in range(3):
		for gx in range(2):  # gaps between col 0-1 and col 1-2
			_draw_h_corridor(gx, gy)
	# Draw corridors between vertically adjacent rooms (same col)
	for gx in range(3):
		for gy in range(2):  # gaps between row 0-1 and row 1-2
			_draw_v_corridor(gx, gy)

func _draw_room(tx: int, ty: int) -> void:
	# Fill entire block with walls
	for x in range(BLOCK_W):
		for y in range(BLOCK_H):
			set_cell(Vector2i(tx + x, ty + y), 0, WALL)
	# Fill interior with floor
	for x in range(1, BLOCK_W - 1):
		for y in range(1, BLOCK_H - 1):
			set_cell(Vector2i(tx + x, ty + y), 0, FLOOR)

func _draw_h_corridor(gx: int, gy: int) -> void:
	# Horizontal corridor: gap tile column between col gx and gx+1, at row gy
	var gap_x: int = (gx + 1) * STEP_X - 1  # the 1-tile gap column
	var room_y: int = gy * STEP_Y
	# Door opening: rows 7, 8, 9 within the block (centre of 17-tall room)
	for dy in [7, 8, 9]:
		var ty = room_y + dy
		# Replace wall on right edge of left room with door
		set_cell(Vector2i(gap_x - 1, ty), 0, DOOR)
		# Fill the gap tile as floor (walkable corridor)
		set_cell(Vector2i(gap_x, ty), 0, FLOOR)
		# Replace wall on left edge of right room with door
		set_cell(Vector2i(gap_x + 1, ty), 0, DOOR)

func _draw_v_corridor(gx: int, gy: int) -> void:
	# Vertical corridor: gap tile row between row gy and gy+1, at col gx
	var gap_y: int = (gy + 1) * STEP_Y - 1  # the 1-tile gap row
	var room_x: int = gx * STEP_X
	# Door opening: cols 9, 10, 11 within the block (centre of 20-wide room)
	for dx in [9, 10, 11]:
		var tx = room_x + dx
		# Replace wall on bottom edge of top room with door
		set_cell(Vector2i(tx, gap_y - 1), 0, DOOR)
		# Fill the gap tile as floor
		set_cell(Vector2i(tx, gap_y), 0, FLOOR)
		# Replace wall on top edge of bottom room with door
		set_cell(Vector2i(tx, gap_y + 1), 0, DOOR)
