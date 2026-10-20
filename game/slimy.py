#!/usr/bin/env python3
"""Slimy — a turn-based community puzzle played through GitHub issues.

Usage:
  python3 game/slimy.py "<issue title>" "<github login>"   # play a move
  python3 game/slimy.py --render                           # (re)draw board + README

Issue titles accepted (anything else is rejected):
  slimy|move|up   slimy|move|down   slimy|move|left   slimy|move|right   slimy|reset

Standard library only, no dependencies.
"""
import base64
import json
import os
import re
import sys
from pathlib import Path

from levels import LEVELS

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
STATE_FILE = GAME / "state.json"
BOARD_FILE = GAME / "board.svg"
REPLY_FILE = GAME / ".reply.md"
README = ROOT / "README.md"
SPRITES = ROOT / "assets" / "sprites"

REPO = os.environ.get("GITHUB_REPOSITORY", "NightKiiro/NightKiiro")
BRANCH = os.environ.get("SLIMY_BRANCH", "main")

DIRS = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}
ARROWS = {"up": "⬆️", "down": "⬇️", "left": "⬅️", "right": "➡️", "reset": "🔄"}
LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")


# ----------------------------------------------------------------- game logic
def parse(level_index):
    grid = [list(row) for row in LEVELS[level_index]["map"]]
    found = {}
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch in "BGE":
                found[ch] = [r, c]
                if ch != "E":
                    row[c] = "."
    return grid, found


def fresh_level(state, level_index):
    _, found = parse(level_index)
    state.update(level=level_index, blue=found["B"], green=found["G"],
                 merged=False, moves=0, facing="right")
    return state


def new_state():
    state = {"total_moves": 0, "cleared": 0, "recent": [], "players": {}, "champions": []}
    return fresh_level(state, 0)


def blocked(grid, pos):
    r, c = pos
    if not (0 <= r < len(grid) and 0 <= c < len(grid[r])):
        return True
    return grid[r][c] == "#"


def step(state, direction):
    """Apply one move. Returns 'merged', 'cleared' or None."""
    grid, found = parse(state["level"])
    dr, dc = DIRS[direction]
    if direction in ("left", "right"):
        state["facing"] = direction

    if state["merged"]:
        nxt = [state["blue"][0] + dr, state["blue"][1] + dc]
        if not blocked(grid, nxt):
            state["blue"] = state["green"] = nxt
        if state["blue"] == found["E"]:
            return "cleared"
        return None

    b = [state["blue"][0] + dr, state["blue"][1] + dc]
    g = [state["green"][0] + dr, state["green"][1] + dc]
    if not blocked(grid, b):
        state["blue"] = b
    if not blocked(grid, g):
        state["green"] = g
    if state["blue"] == state["green"]:
        state["merged"] = True
        return "cleared" if state["blue"] == found["E"] else "merged"
    return None


# ----------------------------------------------------------------- rendering
TILE = 48
GUT = 2
PAD = 16
HEADER = 44


def sheet(name):
    return base64.b64encode((SPRITES / f"{name}.png").read_bytes()).decode()


def slime_svg(name, x, y, size, cls):
    return (f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="{GUT} {GUT} 48 48">'
            f'<image class="{cls}" width="{52*6}" height="52" href="data:image/png;base64,{sheet(name)}"/></svg>')


def render(state, banner=None):
    grid, found = parse(state["level"])
    rows, cols = len(grid), len(grid[0])
    w, h = cols * TILE + 2 * PAD, rows * TILE + 2 * PAD + HEADER
    ox, oy = PAD, PAD + HEADER
    lv = LEVELS[state["level"]]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
           f'role="img" aria-label="Slimy board, level {state["level"] + 1}">',
           "<style>image{image-rendering:crisp-edges;image-rendering:pixelated}"
           ".idle{animation:idle .66s steps(6) infinite}.idle2{animation:idle .66s steps(6) -.33s infinite}"
           "@keyframes idle{to{transform:translateX(-312px)}}"
           ".exit{animation:pulse 1.4s steps(2) infinite}@keyframes pulse{50%{opacity:.45}}"
           "text{font-family:'Courier New',ui-monospace,monospace;font-weight:700}</style>",
           f'<rect width="{w}" height="{h}" rx="12" fill="#0D0B1E"/>',
           f'<text x="{PAD}" y="{PAD + 20}" font-size="18" fill="#EDE9FE">LEVEL {state["level"] + 1}/{len(LEVELS)}'
           f' · {lv["name"].upper()}</text>',
           f'<text x="{w - PAD}" y="{PAD + 20}" font-size="14" fill="#A78BFA" text-anchor="end">'
           f'moves: {state["moves"]}</text>']

    for r in range(rows):
        for c in range(cols):
            x, y = ox + c * TILE, oy + r * TILE
            if grid[r][c] == "#":
                out.append(f'<rect x="{x}" y="{y}" width="{TILE}" height="{TILE}" fill="#2A2350"/>'
                           f'<rect x="{x}" y="{y}" width="{TILE}" height="6" fill="#3B3270"/>'
                           f'<rect x="{x}" y="{y + TILE - 4}" width="{TILE}" height="4" fill="#1A1535"/>')
            else:
                out.append(f'<rect x="{x}" y="{y}" width="{TILE}" height="{TILE}" fill="#14112B" '
                           f'stroke="#1E1840" stroke-width="1"/>')

    er, ec = found["E"]
    ex, ey = ox + ec * TILE, oy + er * TILE
    out.append(f'<rect class="exit" x="{ex + 4}" y="{ey + 4}" width="{TILE - 8}" height="{TILE - 8}" '
               f'fill="#5FB3A0" opacity=".9"/>'
               f'<rect x="{ex + 10}" y="{ey + 10}" width="{TILE - 20}" height="{TILE - 14}" fill="#0D0B1E"/>'
               f'<text x="{ex + TILE / 2}" y="{ey + 30}" font-size="10" fill="#7CFC9A" '
               f'text-anchor="middle">EXIT</text>')

    face = "r" if state.get("facing", "right") == "right" else "l"
    if state["merged"]:
        r, c = state["blue"]
        size = 72
        x = ox + c * TILE + (TILE - size) // 2
        y = oy + (r + 1) * TILE - size + 6
        out.append(slime_svg(f"teal-{face}", x, y, size, "idle"))
    else:
        for name, pos, cls in (("blue", state["blue"], "idle"), ("green", state["green"], "idle2")):
            r, c = pos
            out.append(slime_svg(f"{name}-{face}", ox + c * TILE, oy + r * TILE + 4, TILE, cls))

    if banner:
        out.append(f'<rect x="0" y="{h // 2 - 26}" width="{w}" height="52" fill="#0D0B1E" opacity=".85"/>'
                   f'<text x="{w / 2}" y="{h // 2 + 7}" font-size="20" fill="#7CFC9A" '
                   f'text-anchor="middle">{banner}</text>')
    out.append("</svg>")
    BOARD_FILE.write_text("".join(out))


def issue_link(title):
    body = "Just press Submit! Your move is played automatically in about a minute."
    return f"https://github.com/{REPO}/issues/new?title={title.replace('|', '%7C')}&body={body.replace(' ', '+')}"


def readme_section(state):
    v = state["total_moves"]
    board = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/game/board.svg?v={v}"
    btn = {d: f'<a href="{issue_link("slimy|move|" + d)}">{ARROWS[d]}</a>' for d in DIRS}

    lines = [
        "<!-- SLIMY:START -->",
        '<p align="center">',
        f'  <img src="{board}" alt="Slimy board" />',
        "</p>",
        "",
        '<table align="center">',
        f'<tr><td></td><td align="center">{btn["up"]}</td><td></td></tr>',
        f'<tr><td align="center">{btn["left"]}</td><td align="center"><sub>move</sub></td>'
        f'<td align="center">{btn["right"]}</td></tr>',
        f'<tr><td></td><td align="center">{btn["down"]}</td><td></td></tr>',
        "</table>",
        "",
        f'<p align="center"><sub><a href="{issue_link("slimy|reset")}">🔄 restart this level</a> · '
        f'{state["total_moves"]} moves played · {state["cleared"]} levels cleared by the community</sub></p>',
        "",
    ]
    if state["recent"]:
        recent = " · ".join(f'{ARROWS.get(m["move"], "")} [@{m["user"]}](https://github.com/{m["user"]})'
                            for m in reversed(state["recent"]))
        lines += [f"**Last moves:** {recent}", ""]
    if state["players"]:
        top = sorted(state["players"].items(), key=lambda kv: (-kv[1], kv[0]))[:5]
        lines += ["**Top slimers:** " + " · ".join(f"[@{u}](https://github.com/{u}) ({n})" for u, n in top), ""]
    if state["champions"]:
        champs = " · ".join(f'🏆 [@{c["user"]}](https://github.com/{c["user"]}) finished '
                            f'*{c["level"]}* in {c["moves"]} moves' for c in reversed(state["champions"]))
        lines += [f"**Recent escapes:** {champs}", ""]
    lines.append("<!-- SLIMY:END -->")
    return "\n".join(lines)


def update_readme(state):
    text = README.read_text()
    new = re.sub(r"<!-- SLIMY:START -->.*?<!-- SLIMY:END -->", lambda _: readme_section(state),
                 text, flags=re.S)
    README.write_text(new)


# ----------------------------------------------------------------- entry
def load():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return new_state()


def save(state):
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def play(title, login):
    state = load()
    parts = title.strip().lower().split("|")
    if not LOGIN_RE.match(login or ""):
        REPLY_FILE.write_text("🤔 Unknown player, move ignored.")
        return False

    if parts == ["slimy", "reset"]:
        move = "reset"
    elif len(parts) == 3 and parts[:2] == ["slimy", "move"] and parts[2] in DIRS:
        move = parts[2]
    else:
        REPLY_FILE.write_text("🤔 I didn't understand that move. Use the arrow links on the profile README.")
        return False

    banner, reply = None, ""
    level_name = LEVELS[state["level"]]["name"]
    if move == "reset":
        fresh_level(state, state["level"])
        reply = f"🔄 Level **{level_name}** restarted. Good luck!"
    else:
        result = step(state, move)
        state["moves"] += 1
        state["total_moves"] += 1
        if result == "merged":
            reply = f"{ARROWS[move]} Played! **The slimes merged!** 🟦+🟩 Now get the big one to the exit."
        elif result == "cleared":
            moves = state["moves"]
            state["cleared"] += 1
            state["champions"] = (state["champions"] + [{"user": login, "level": level_name, "moves": moves}])[-3:]
            nxt = (state["level"] + 1) % len(LEVELS)
            fresh_level(state, nxt)
            banner = f"@{login} cleared {level_name}!"
            reply = (f"🎉 **You escaped!** You made the final move of *{level_name}* "
                     f"({moves} moves in total by the community). Next level: *{LEVELS[nxt]['name']}*.")
        else:
            reply = f"{ARROWS[move]} Played! Thanks for moving the slimes."
        state["players"][login] = state["players"].get(login, 0) + 1

    state["recent"] = (state["recent"] + [{"user": login, "move": move}])[-5:]
    save(state)
    render(state, banner)
    update_readme(state)
    REPLY_FILE.write_text(reply + f"\n\n[See the board](https://github.com/{REPO})")
    return True


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--render":
        st = load()
        save(st)
        render(st)
        update_readme(st)
    elif len(sys.argv) == 3:
        play(sys.argv[1], sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
