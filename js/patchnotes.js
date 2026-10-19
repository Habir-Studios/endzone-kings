// ENDZONE KINGS — patch notes, newest first. Add a new entry at the top with every update:
// bump the version by one every update, big or small (1.0.2, 1.0.3, 1.0.4...), set the date,
// list what's new and what got fixed. The menu button shows NOTES[0].v.
export const NOTES = [
  {
    v: "1.0.3",
    date: "2026-10-19",
    added: [],
    fixed: [
      "Passing feels way better: the QB throws to where your receiver is going on his route, cuts included, so he catches it in stride instead of running to the ball",
      "Off-target throws miss a step ahead or behind on the receiver’s path instead of off to the side",
      "The two-step login code screen now tells you exactly what to look for in your authenticator app: Endzone Kings with your email under it",
      "In-game timeouts last 8 seconds with a big countdown on screen (pick your play during it), for you and the CPU",
      "Admin time-outs (temporary bans) show a live countdown and lift on their own the second it hits zero",
      "Online pause: ask to pause in an online game or Online Franchise game, your opponent accepts or declines, and it resumes when both players are ready or after 30 seconds, so nobody gets forced back in. 3 pause requests per game",
      "Forfeit button in online games: give up and your opponent gets the win",
      "A “T chat” reminder is always on screen in online games",
      "Touchdowns follow the real rule: it counts the moment the ball crosses the goal line in your hands, so diving or stretching the ball over now scores even if your body is short"
    ]
  },
  {
    v: "1.0.2",
    date: "2026-10-18",
    added: [
      "Everything follows your account between devices: coins, cards, squad, Franchise, Season, custom plays and your game settings (graphics, sound and touch controls stay per device)",
      "Changes you make on one device show up on your other devices within about a second, no reopening needed (never in the middle of a game)",
      "Feedback button on the main menu: report a bug, send a suggestion or ask for help, straight to the dev team",
      "A full two-step login guide in How to Play: setting it up, logging in, the 10-day remember option, new phones and lost phones",
      "Clearer step-by-step instructions when you turn two-step login on or off, and on the login code screen, with a link to the guide",
      "The Habir Studios admin now has an ADMIN badge next to their name on profiles, leaderboards, friends lists, crews and messages"
    ],
    fixed: [
      "Typing in some text boxes (like Feedback and dropdowns) was hard to see. Every text box now has bright, readable text, even when your browser autofills it",
      "Profile headers are evenly spaced: name, online status, level, records and followers no longer crowd each other"
    ]
  },
  {
    v: "1.0.1",
    date: "2026-10-18",
    added: [
      "Daily Reward tile on the main menu: claim your coins with a button, then a timer counts down to the next one",
      "Online and offline status on player profiles",
      "Log in with your username or your email",
      "Forgot password: get a reset link sent to the email on your account (works with your username too)",
      "A recorded announcer with a deep voice and way more energy, the same on every device",
      "Big mobile upgrade: snap, hot routes, motion, flip and timeouts on touch, a thumb-friendly playbook and bigger buttons",
      "Your receiver runs to the ball on his own after you throw it (move the stick to take over)",
      "Patch notes, right here",
      "Directional tackles: players fall the way they get hit. Hit from the side and they go the other way, from behind and they fall on their face, head-on and they go straight back. Same for trucks, stiff arms and missed tackles",
      "Online Franchise: if your opponent is offline, play their bot instead. It uses their exact roster and a game plan built from their players",
      "A tougher CPU at every difficulty",
      "Admins can delete reports",
      "Training, abilities, X-Factors and packs cost a bit more",
      "Team overall, offense and defense update the second your lineup changes, in Ultimate Team, Franchise and Online Franchise (also shown during the draft and for every team in the league)",
      "Two-step login: turn it on in Settings, scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy), and you’ll need the 6-digit code to log in. Turning it off needs a code too",
      "Two-step login has a “Remember this device for 10 days” option, just for the device you tick it on",
      "Sessions in Settings: see every device logged into your account (device, browser and system) and log any of them out instantly",
      "How to Play now covers other controllers (8BitDo, PowerA, Logitech, PC gamepads), and the game calls them a standard controller instead of Xbox",
      "The game updates itself: it checks every 10 seconds and grabs the newest version on any screen as soon as you’re out of a game (never in the middle of one)"
    ],
    fixed: [
      "Coins showing different amounts on different devices",
      "The ball floating away from the ball carrier instead of sitting in his arms",
      "After a play ends near the sideline or out of bounds, the ball is spotted on the nearest hash mark",
      "The daily reward popping up again every time you opened the game",
      "Empty gap in the main menu, and removed the live leaderboard from it",
      "The profile card, bell and patch notes button staying stuck on screen when you scroll the main menu",
      "Removed the nets behind the goal posts",
      "Quick Play now says it doesn’t count toward your record",
      "Removed Weekend League"
    ]
  }
];
