/*
 * Slimy (web) — levels, in the same format as the Java game:
 *   #  wall          S  spawn (1st = blue, 2nd = green)    E  exit door (2 tiles high, one per slime)
 *   c  light crate   H  heavy block (merged slime only)   ^  spikes
 *   p  light plate   P  heavy plate (needs the merged slime or a heavy block)
 *   D  door          plates / doors: channel numbers in reading order (like the [links] section)
 * A gap in the bottom row is the void.
 */
(function (root) {
  const LEVELS = [
  {
    "name": "WAKE-UP CALL",
    "hint": "BOTH SLIMES COPY YOUR MOVES",
    "map": [
      "##################################################",
      "#                                                #",
      "#                                                #",
      "#                                                #",
      "#                                                #",
      "#                                                #",
      "#                                                #",
      "#                                              EE#",
      "#                    ##                        EE#",
      "# S S       ##       ##          ##           ####",
      "###########################   ########  ##########"
    ]
  },
  {
    "name": "STEP BY STEP",
    "hint": "PUSH THE CRATE AND CLIMB ON IT",
    "map": [
      "############################################",
      "#                                          #",
      "#                                          #",
      "#                                          #",
      "#                                          #",
      "#                                          #",
      "#                                          #",
      "#                     ###                EE#",
      "#                     ###                EE#",
      "# S S      c          ###       ##      ####",
      "############################################"
    ]
  },
  {
    "name": "HEAVY LIFTING",
    "hint": "F TO FUSE  -  ONLY A BIG SLIME MOVES HEAVY BLOCKS",
    "map": [
      "##################################################",
      "#                         #                      #",
      "#                         #                      #",
      "#                         #                      #",
      "#                         #                      #",
      "#                         #                      #",
      "#                         #                      #",
      "#                         D                    EE#",
      "#                         D                    EE#",
      "# S S      H        P     D         ##        ####",
      "##################################################"
    ],
    "plates": [
      1
    ],
    "doors": [
      1
    ]
  },
  {
    "name": "TIGHT SQUEEZE",
    "hint": "ONLY SMALL SLIMES FIT IN TUNNELS",
    "map": [
      "##################################################",
      "#                                  #             #",
      "#                                  #             #",
      "#                                  #             #",
      "#                                  #             #",
      "#                                  #             #",
      "#            ############          #             #",
      "#            ############          D           EE#",
      "#            ############          D           EE#",
      "# S S                       H   P  D     ^    ####",
      "##################################################"
    ],
    "plates": [
      1
    ],
    "doors": [
      1
    ]
  },
  {
    "name": "DEAD WEIGHT",
    "hint": "A CRATE CAN HOLD A PLATE FOR YOU",
    "map": [
      "########################################################",
      "#                               #                      #",
      "#                               #                      #",
      "#                               #                      #",
      "#                               #                      #",
      "#                               #                      #",
      "#                               D                      #",
      "#                               D                    EE#",
      "#                               D           ##       EE#",
      "# S S     c        p      ^     D     ^     ##      ####",
      "########################################################"
    ],
    "plates": [
      1
    ],
    "doors": [
      1
    ]
  },
  {
    "name": "THE GREAT ESCAPE",
    "hint": "EVERYTHING YOU LEARNED",
    "map": [
      "################################################################",
      "#                   #                       #                  #",
      "#                   #                       #                  #",
      "#                   #                       #                  #",
      "#                   #                       #                  #",
      "#                   #                       #                  #",
      "#                   D                       D                  #",
      "#                   D   ########            D                EE#",
      "#                   D   ########            D            #   EE#",
      "# S S    c      p   D              H    P   D    ^       #  ####",
      "#####################################################  #########"
    ],
    "plates": [
      1,
      2
    ],
    "doors": [
      1,
      2
    ]
  }
];
  if (typeof module !== "undefined" && module.exports) module.exports = LEVELS;
  else root.SLIMY_LEVELS = LEVELS;
})(typeof window !== "undefined" ? window : globalThis);
