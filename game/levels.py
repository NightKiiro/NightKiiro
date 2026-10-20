"""Slimy levels.

# wall   . floor   B blue slime   G green slime   E exit

Both slimes receive the SAME move. A slime that hits a wall stays put.
When both slimes end up on the same tile they merge into one big slime.
The level is cleared when the merged slime reaches the exit.
"""

LEVELS = [
    {
        "name": "Wake up",
        "map": [
            "##########",
            "#B......G#",
            "#.######.#",
            "#........#",
            "####E#####",
        ],
    },
    {
        "name": "Lab corridors",
        "map": [
            "##########",
            "#B...#...#",
            "#.##.#.#.#",
            "#....#.#G#",
            "##.#...#.#",
            "#E.......#",
            "##########",
        ],
    },
    {
        "name": "Containment",
        "map": [
            "###########",
            "#B..#.....#",
            "#.#.#.###.#",
            "#.#...#G..#",
            "#.#####.#.#",
            "#...E...#.#",
            "###########",
        ],
    },
    {
        "name": "Server room",
        "map": [
            "############",
            "#B.#.......#",
            "#..#.####..#",
            "#.....#G...#",
            "####..#.####",
            "#E....#....#",
            "############",
        ],
    },
]
