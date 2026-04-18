# Phase 0 — Graphical Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully navigable static visual prototype in Godot 4.6 — 9 rooms, a walking player, 6 NPC placeholders, speech bubble indicators, HUD room name, and a toggleable notebook — with zero AI or server logic.

**Architecture:** Single Godot project. One large TileMapLayer scene for the mansion. Player is a CharacterBody2D with 4-directional movement. NPCs are static Area2D scenes. All UI (HUD, Notebook, Speech Bubble) is CanvasLayer. No autoloads or singletons yet — keep it simple.

**Tech Stack:** Godot 4.6, GDScript 2.0, TileMapLayer, CharacterBody2D, CanvasLayer

> **Note on testing:** This phase is entirely visual. There is no logic to unit-test. Each task's verification step is "run the scene and confirm visually." Automated tests begin in Phase 1.

> **Note on assets:** All sprites and tiles start as coloured placeholder PNGs generated in-editor or by script. Structure every scene to make swapping in real pixel art a one-file change later (Sprite2D with a dedicated texture property, not inline ColorRects).

---

## File Map

| File | Responsibility |
|------|---------------|
| `scenes/main/main.tscn` | Root scene — composes mansion, player, camera, UI |
| `scenes/mansion/mansion.tscn` | TileMapLayer with all 9 rooms and corridors |
| `scenes/mansion/mansion.gd` | Exports room Area2D nodes; emits `room_changed(name)` signal |
| `scenes/player/player.tscn` | CharacterBody2D + Sprite2D + CollisionShape2D |
| `scenes/player/player.gd` | WASD/arrow 4-directional movement + sprite flip |
| `scenes/npc/npc.tscn` | Base NPC scene: Area2D + Sprite2D + speech_bubble child |
| `scenes/npc/npc.gd` | Exports `npc_name`, `sprite_color`; no behaviour yet |
| `scenes/ui/hud/hud.tscn` | CanvasLayer: room name label in top-left |
| `scenes/ui/hud/hud.gd` | Listens to `room_changed`; updates label |
| `scenes/ui/notebook/notebook.tscn` | CanvasLayer panel: 3-tab static notebook |
| `scenes/ui/notebook/notebook.gd` | Toggle visibility on `N` key |
| `scenes/ui/speech_bubble/speech_bubble.tscn` | Small sprite above NPC head |
| `assets/tilesets/mansion_tiles.png` | 16×16 placeholder tile sheet (floor, wall, door) |
| `assets/sprites/player/player_placeholder.png` | 16×16 coloured square |
| `assets/sprites/npcs/npc_N.png` (×6) | 16×16 distinct coloured squares |

---

## Task 1: Folder Structure

**Files:**
- Create: `scenes/main/`, `scenes/mansion/`, `scenes/player/`, `scenes/npc/`, `scenes/ui/hud/`, `scenes/ui/notebook/`, `scenes/ui/speech_bubble/`, `assets/tilesets/`, `assets/sprites/player/`, `assets/sprites/npcs/`

- [ ] **Step 1: Create directory tree**

Run from the project root:
```bash
cd /Users/willfrost/CodingProjects/Claudo
mkdir -p scenes/main scenes/mansion scenes/player scenes/npc \
          scenes/ui/hud scenes/ui/notebook scenes/ui/speech_bubble \
          assets/tilesets assets/sprites/player assets/sprites/npcs
```

- [ ] **Step 2: Add .gitignore entries**

Append to (or create) `.gitignore` at project root:
```
.godot/
.superpowers/
*.import
```

- [ ] **Step 3: Commit**
```bash
git init
git add .gitignore
git commit -m "chore: initialise project structure"
```

---

## Task 2: Generate Placeholder Assets

**Files:**
- Create: `assets/tilesets/mansion_tiles.png`
- Create: `assets/sprites/player/player_placeholder.png`
- Create: `assets/sprites/npcs/npc_1.png` through `npc_6.png`

All tiles are 16×16 pixels. Generate them with this standalone GDScript tool scene — run it once, then delete it.

- [ ] **Step 1: Create the asset generator scene**

Create `tools/generate_assets.gd`:
```gdscript
@tool
extends EditorScript

func _run() -> void:
    _make_tileset()
    _make_player()
    _make_npcs()
    print("Assets generated.")

func _make_tileset() -> void:
    # 3 tiles side by side: floor (grey), wall (dark), door (brown)
    var img := Image.create(48, 16, false, Image.FORMAT_RGBA8)
    # Floor tile (col 0) — mid grey
    img.fill_rect(Rect2i(0, 0, 16, 16), Color(0.45, 0.42, 0.38))
    # Wall tile (col 1) — dark charcoal
    img.fill_rect(Rect2i(16, 0, 16, 16), Color(0.18, 0.16, 0.14))
    # Door tile (col 2) — warm brown
    img.fill_rect(Rect2i(32, 0, 16, 16), Color(0.55, 0.35, 0.15))
    img.save_png("res://assets/tilesets/mansion_tiles.png")

func _make_player() -> void:
    var img := Image.create(16, 16, false, Image.FORMAT_RGBA8)
    img.fill(Color(0.2, 0.6, 1.0))   # blue
    # Simple "head" indicator — white 4×4 square top-centre
    img.fill_rect(Rect2i(6, 1, 4, 4), Color.WHITE)
    img.save_png("res://assets/sprites/player/player_placeholder.png")

func _make_npcs() -> void:
    var colors := [
        Color(0.9, 0.2, 0.2),   # npc_1 red   — The Liar (murderer archetype)
        Color(0.9, 0.7, 0.1),   # npc_2 gold  — The Gossip
        Color(0.3, 0.3, 0.8),   # npc_3 navy  — The Recluse
        Color(0.2, 0.75, 0.3),  # npc_4 green — The Witness
        Color(0.7, 0.3, 0.8),   # npc_5 purple— The Protector
        Color(0.9, 0.5, 0.1),   # npc_6 orange— The Red Herring
    ]
    for i in colors.size():
        var img := Image.create(16, 16, false, Image.FORMAT_RGBA8)
        img.fill(colors[i])
        img.fill_rect(Rect2i(5, 1, 6, 5), Color.WHITE)  # head
        img.save_png("res://assets/sprites/npcs/npc_%d.png" % (i + 1))
```

- [ ] **Step 2: Run the generator**

In Godot editor: open `tools/generate_assets.gd` → Script menu → Run. Verify 8 PNG files appear in FileSystem panel under `assets/`.

- [ ] **Step 3: Delete the tool**
```bash
rm -rf tools/
```

- [ ] **Step 4: Commit**
```bash
git add assets/
git commit -m "feat: add placeholder tile and sprite assets"
```

---

## Task 3: Mansion Tilemap

**Files:**
- Create: `scenes/mansion/mansion.tscn`
- Create: `scenes/mansion/mansion.gd`

The mansion is one continuous TileMapLayer. 9 rooms in a 3×3 grid, each room 18×14 tiles interior, separated by 3-tile-wide corridors with a 3-tile-wide door opening centred on each shared wall.

Tile IDs (from `mansion_tiles.png` atlas, 16px tile size):
- `(0,0)` = floor
- `(1,0)` = wall
- `(2,0)` = door (walkable, visual only)

Room top-left origins (in tile coords) — corridors are 3 tiles wide:

| Room | Tile Origin (col, row) |
|------|------------------------|
| Kitchen | (0, 0) |
| Ballroom | (21, 0) |
| Conservatory | (42, 0) |
| Billiard Room | (0, 17) |
| Hall | (21, 17) |
| Library | (42, 17) |
| Study | (0, 34) |
| Lounge | (21, 34) |
| Dining Room | (42, 34) |

Each room block = 20 tiles wide × 17 tiles tall (18 interior + 1 wall each side). Corridors fit in the 1-tile gap between rooms plus a 3-tile opening.

- [ ] **Step 1: Create the TileSet resource in Godot editor**

  1. In FileSystem, right-click `assets/tilesets/` → New Resource → `TileSet` → save as `assets/tilesets/mansion_tileset.tres`
  2. Open the TileSet in the inspector. Set tile size to `16 × 16`.
  3. Add a new Atlas Source. Point it at `mansion_tiles.png`. Set the atlas texture region size to `16 × 16`.
  4. In the TileSet editor, assign tile IDs: tile at atlas coords `(0,0)` = floor, `(1,0)` = wall, `(2,0)` = door.
  5. For the wall tile, add a Physics layer on the TileSet and paint the wall tile as solid collision. Floor and door tiles have no collision.

- [ ] **Step 2: Create the mansion scene**

  In Godot editor: Scene → New Scene → Root node: `Node2D` → rename to `Mansion` → save as `scenes/mansion/mansion.tscn`.

  Add a child `TileMapLayer`. In inspector: set TileSet to `mansion_tileset.tres`.

- [ ] **Step 3: Paint the tilemap**

  Select the TileMapLayer. Open the TileMap editor panel. Paint the 9-room layout:
  - Each room: fill interior (18×14) with floor tile. Surround with wall tiles (1 tile border).
  - Corridor openings: replace the 3 wall tiles in the centre of each shared wall with door tiles on both sides.
  - Corridors between rooms: fill the 3-tile-wide, 1-tile-long gap between rooms with floor tiles.

  > Tip: Use the TileMap's bucket fill (Ctrl+drag) for large floor areas.

- [ ] **Step 4: Add Room Area2D zones**

  For each of the 9 rooms, add a child `Area2D` to the Mansion node. Name it `RoomKitchen`, `RoomBallroom`, etc. Add a `CollisionShape2D` child sized to the interior floor area of that room (18×14 tiles = 288×224 px). Set the CollisionShape2D layer to a dedicated "rooms" physics layer (layer 2) — do not overlap with the player collision layer.

- [ ] **Step 5: Write mansion.gd**

Create `scenes/mansion/mansion.gd`:
```gdscript
extends Node2D

signal room_changed(room_name: String)

const ROOM_NAMES := {
    "RoomKitchen": "Kitchen",
    "RoomBallroom": "Ballroom",
    "RoomConservatory": "Conservatory",
    "RoomBilliardRoom": "Billiard Room",
    "RoomHall": "Hall",
    "RoomLibrary": "Library",
    "RoomStudy": "Study",
    "RoomLounge": "Lounge",
    "RoomDiningRoom": "Dining Room",
}

func _ready() -> void:
    for area in get_children():
        if area is Area2D and ROOM_NAMES.has(area.name):
            area.body_entered.connect(_on_room_entered.bind(area.name))

func _on_room_entered(body: Node2D, area_name: String) -> void:
    if body.is_in_group("player"):
        room_changed.emit(ROOM_NAMES[area_name])
```

Attach `mansion.gd` to the Mansion node.

- [ ] **Step 6: Verify**

Run the Mansion scene in isolation (F6). Confirm the tilemap renders 9 rooms connected by corridors. No player yet — just check the layout looks correct.

- [ ] **Step 7: Commit**
```bash
git add scenes/mansion/
git commit -m "feat: add mansion tilemap with 9 rooms and room detection areas"
```

---

## Task 4: Player Scene and Movement

**Files:**
- Create: `scenes/player/player.tscn`
- Create: `scenes/player/player.gd`

- [ ] **Step 1: Create player scene**

  Scene → New Scene → Root: `CharacterBody2D` → rename to `Player` → save as `scenes/player/player.tscn`.

  Add children:
  - `Sprite2D` — set texture to `assets/sprites/player/player_placeholder.png`
  - `CollisionShape2D` — `RectangleShape2D`, size `14 × 14` (slightly smaller than 16px tile)

  Add `Player` to group `"player"` (Node tab → Groups).

- [ ] **Step 2: Write player.gd**

Create `scenes/player/player.gd`:
```gdscript
extends CharacterBody2D

const SPEED := 80.0  # pixels per second

@onready var sprite: Sprite2D = $Sprite2D

func _physics_process(delta: float) -> void:
    var direction := Vector2(
        Input.get_axis("ui_left", "ui_right"),
        Input.get_axis("ui_up", "ui_down")
    ).normalized()

    velocity = direction * SPEED
    move_and_slide()

    if direction.x != 0:
        sprite.flip_h = direction.x < 0
```

Attach `player.gd` to the Player root node.

- [ ] **Step 3: Verify player movement**

Run the Player scene in isolation (F6 with player.tscn open). Confirm the sprite renders. You won't be able to move without the full scene but confirm it loads without errors.

- [ ] **Step 4: Commit**
```bash
git add scenes/player/
git commit -m "feat: add player scene with 4-directional movement"
```

---

## Task 5: HUD — Room Name Display

**Files:**
- Create: `scenes/ui/hud/hud.tscn`
- Create: `scenes/ui/hud/hud.gd`

- [ ] **Step 1: Create HUD scene**

  Scene → New Scene → Root: `CanvasLayer` → rename to `HUD` → save as `scenes/ui/hud/hud.tscn`.

  Add a `Label` child. In inspector:
  - Name: `RoomLabel`
  - Text: `"Hall"` (placeholder)
  - Anchors: top-left (Anchor Preset → Top Left)
  - Position: `(8, 8)`
  - Theme override — font size: `12`

- [ ] **Step 2: Write hud.gd**

Create `scenes/ui/hud/hud.gd`:
```gdscript
extends CanvasLayer

@onready var room_label: Label = $RoomLabel

func update_room(room_name: String) -> void:
    room_label.text = room_name
```

Attach `hud.gd` to the HUD root node.

- [ ] **Step 3: Commit**
```bash
git add scenes/ui/hud/
git commit -m "feat: add HUD with room name label"
```

---

## Task 6: Notebook UI

**Files:**
- Create: `scenes/ui/notebook/notebook.tscn`
- Create: `scenes/ui/notebook/notebook.gd`

- [ ] **Step 1: Create notebook scene**

  Scene → New Scene → Root: `CanvasLayer` → rename to `Notebook` → save as `scenes/ui/notebook/notebook.tscn`.

  Scene tree:
  ```
  Notebook (CanvasLayer)
  └── Panel
      ├── VBoxContainer
      │   ├── Label ("Detective's Notebook")
      │   └── TabContainer
      │       ├── TextEdit (tab name: "Suspects")
      │       ├── TextEdit (tab name: "Weapons")
      │       └── TextEdit (tab name: "Rooms")
  ```

  Panel settings:
  - Anchor Preset: Centre
  - Size: `500 × 350`
  - Visible: `false` (starts hidden)

  Each `TextEdit`:
  - Placeholder text: `"Write your notes here..."`
  - Size Flags: Fill + Expand

  Label font size: 14, bold.

- [ ] **Step 2: Write notebook.gd**

Create `scenes/ui/notebook/notebook.gd`:
```gdscript
extends CanvasLayer

@onready var panel: Panel = $Panel

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_notebook"):
        panel.visible = !panel.visible
        get_viewport().set_input_as_handled()
```

Attach `notebook.gd` to the Notebook root node.

- [ ] **Step 3: Register the notebook input action**

  In Godot: Project → Project Settings → Input Map → Add Action: `ui_notebook` → assign key `N`.

- [ ] **Step 4: Commit**
```bash
git add scenes/ui/notebook/
git commit -m "feat: add toggleable notebook UI with three text pages"
```

---

## Task 7: Speech Bubble

**Files:**
- Create: `scenes/ui/speech_bubble/speech_bubble.tscn`

This is a small visual indicator floating above an NPC's head. Static — no interaction yet.

- [ ] **Step 1: Create speech bubble scene**

  Scene → New Scene → Root: `Node2D` → rename to `SpeechBubble` → save as `scenes/ui/speech_bubble/speech_bubble.tscn`.

  Add children:
  - `Sprite2D` — name `BubbleSprite`
    - Create a 12×10 white rounded-rectangle PNG at `assets/sprites/ui/speech_bubble.png` (or draw one in the editor using a 9-patch). For the placeholder: use a plain white 12×10 PNG.
    - Position: `(0, -20)` (above NPC origin)
  - `Label` — name `BubbleLabel`
    - Text: `"?"`
    - Font size: 8
    - Horizontal align: Centre
    - Position: `(-2, -24)`

- [ ] **Step 2: Generate speech bubble PNG**

Add to the asset generator (or run inline in the Godot script editor):
```gdscript
var img := Image.create(12, 10, false, Image.FORMAT_RGBA8)
img.fill(Color.WHITE)
# Add a 1px dark border
for x in 12:
    img.set_pixel(x, 0, Color.BLACK)
    img.set_pixel(x, 9, Color.BLACK)
for y in 10:
    img.set_pixel(0, y, Color.BLACK)
    img.set_pixel(11, y, Color.BLACK)
img.save_png("res://assets/sprites/ui/speech_bubble.png")
```

Run this once from the Script editor (attach to any temporary node, run scene, delete).

- [ ] **Step 3: Commit**
```bash
git add scenes/ui/speech_bubble/ assets/sprites/ui/
git commit -m "feat: add speech bubble scene for NPC interaction indicator"
```

---

## Task 8: NPC Base Scene

**Files:**
- Create: `scenes/npc/npc.tscn`
- Create: `scenes/npc/npc.gd`

- [ ] **Step 1: Create NPC scene**

  Scene → New Scene → Root: `Area2D` → rename to `NPC` → save as `scenes/npc/npc.tscn`.

  Children:
  - `Sprite2D` — name `NPCSprite`, texture: `assets/sprites/npcs/npc_1.png` (default; overridden per instance)
  - `CollisionShape2D` — `CircleShape2D`, radius `8`
  - Instance of `scenes/ui/speech_bubble/speech_bubble.tscn` — name `SpeechBubble`

- [ ] **Step 2: Write npc.gd**

Create `scenes/npc/npc.gd`:
```gdscript
extends Area2D

@export var npc_name: String = "Unknown"
@export var npc_texture: Texture2D

@onready var sprite: Sprite2D = $NPCSprite

func _ready() -> void:
    if npc_texture:
        sprite.texture = npc_texture
```

Attach `npc.gd` to the NPC root node.

- [ ] **Step 3: Commit**
```bash
git add scenes/npc/
git commit -m "feat: add base NPC scene with speech bubble and exported properties"
```

---

## Task 9: Main Scene — Assembly

**Files:**
- Create: `scenes/main/main.tscn`
- Create: `scenes/main/main.gd`

This is the final assembly — wires everything together.

- [ ] **Step 1: Create main scene**

  Scene → New Scene → Root: `Node2D` → rename to `Main` → save as `scenes/main/main.tscn`.

  Add children in this order:
  1. Instance `scenes/mansion/mansion.tscn` → name `Mansion`
  2. Instance `scenes/player/player.tscn` → name `Player`
     - Set position to centre of Hall room (tile coords `(21+9, 17+7)` × 16px = approximately `(480, 384)`)
  3. `Camera2D` → name `Camera`
     - Set `position_smoothing_enabled = true`, `position_smoothing_speed = 5.0`
     - Set `limit_left`, `limit_top` to 0; set `limit_right`, `limit_bottom` to the full mansion pixel size
  4. Instance `scenes/ui/hud/hud.tscn` → name `HUD`
  5. Instance `scenes/ui/notebook/notebook.tscn` → name `Notebook`

- [ ] **Step 2: Place 6 NPC instances**

  For each NPC, instance `scenes/npc/npc.tscn` as a child of Mansion. Set properties:

  | Instance Name | `npc_name` | `npc_texture` | Room | Position (approx pixel) |
  |---------------|-----------|---------------|------|-------------------------|
  | NPCScarlett | "Miss Scarlett" | `npc_1.png` | Kitchen | `(144, 112)` |
  | NPCMustard | "Col. Mustard" | `npc_2.png` | Ballroom | `(354, 112)` |
  | NPCWhite | "Mrs. White" | `npc_3.png` | Conservatory | `(576, 112)` |
  | NPCGreen | "Rev. Green" | `npc_4.png` | Billiard Room | `(144, 306)` |
  | NPCPeacock | "Mrs. Peacock" | `npc_5.png` | Hall | `(354, 306)` |
  | NPCPlum | "Prof. Plum" | `npc_6.png` | Library | `(576, 306)` |

- [ ] **Step 3: Write main.gd**

Create `scenes/main/main.gd`:
```gdscript
extends Node2D

@onready var camera: Camera2D = $Camera
@onready var player: CharacterBody2D = $Player
@onready var mansion: Node2D = $Mansion
@onready var hud = $HUD

func _ready() -> void:
    camera.reparent(player)  # Camera follows player
    mansion.room_changed.connect(hud.update_room)
```

Attach `main.gd` to the Main root.

- [ ] **Step 4: Set main scene as project default**

  Project → Project Settings → Application → Run → Main Scene → select `scenes/main/main.tscn`.

- [ ] **Step 5: Run and verify full walkthrough**

  Press F5. Verify:
  - [ ] Player spawns in the Hall
  - [ ] WASD/arrows move the player smoothly
  - [ ] Camera follows the player
  - [ ] Player cannot walk through walls (wall tiles block movement)
  - [ ] Walking into a room updates the HUD room name in the top-left corner
  - [ ] All 6 NPC sprites are visible with speech bubbles floating above them
  - [ ] Pressing `N` toggles the notebook panel open/closed
  - [ ] All 9 rooms are reachable by walking through doorways

- [ ] **Step 6: Final commit**
```bash
git add scenes/main/ scenes/
git commit -m "feat: assemble main scene — navigable 9-room mansion with NPCs and UI"
```

---

## Done

Phase 0 is complete when the player can walk through all 9 rooms, see all 6 NPCs with speech bubbles, read the room name in the HUD, and open/close the notebook — with no errors in the Godot output panel.

Next: **Phase 1 — Core Infrastructure** (Node.js server, WebSocket bridge, NPC chat).
