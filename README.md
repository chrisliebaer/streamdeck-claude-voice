# streamdeck-claude-voice
Talk to Claude Code from a Stream Deck key, even while another window has keyboard focus.

Claude Code only listens for its voice dictation key while its terminal is focused.
This Stream Deck plugin presses that key for you inside the Claude Code session, so you can dictate a prompt while you are in a game, an editor or a browser.
Windows only.

## What the key does
Put the **Push to Talk** action on a key, then:

* **Hold** the key to dictate. Claude Code records for as long as you hold it.
* **Release** the key to stop. The text appears in the prompt of the session and is not sent yet.
* **Hold again** to keep dictating. The new text is added to what is already there.
* **Tap** the key briefly to send the prompt.

Recording starts a moment after you press the key.
Wait for the sound before you start talking.

## Choosing the session
The plugin adds an icon to the notification area of the taskbar.
Click it to see every running Claude Code session with its name, state and folder.

* **Automatic** sends your voice to the session that was active most recently. This is the default.
* **A specific session** keeps receiving your voice until it ends. After that the plugin switches back to automatic.

Sessions that run as administrator cannot be used and are greyed out in the menu.

## Requirements
* Stream Deck software 7.1 or newer
* Claude Code with voice dictation switched on in hold mode. Run `/voice hold` in Claude Code once.

## Installation
```sh
git clone https://github.com/chrisliebaer/streamdeck-claude-voice
cd streamdeck-claude-voice
npm install
npm run package
```

Open `dist/de.chrisliebaer.claude-voice.streamDeckPlugin` to install the plugin, then drag **Push to Talk** from the **Claude Voice** category onto a key.

## Settings
Select the key in the Stream Deck software to switch its sounds on or off.

## Good to know
* **Only push the button while the prompt is visible.** The plugin sends a space bar inside the session. If Claude Code is showing a question or a menu at that moment, the key press lands there instead of starting a recording.
* **Tapping sends the prompt only right after dictating.** If you changed the prompt with the keyboard in between, send it with Enter.
* **Sending on release** is a feature of Claude Code itself. Set `"autoSubmit": true` in the `voice` section of `~/.claude/settings.json` to send the prompt as soon as you release the key. This also applies when you dictate with the keyboard.
* **A different dictation key** in Claude Code needs a matching change in `src/config.ts`. The plugin assumes the default space bar.
* **Nothing is typed into other programs.** The plugin talks to the Claude Code session directly and does not simulate keyboard input for the whole system.

## Development
* `npm run link` makes the Stream Deck software run the plugin from this folder instead of an installed copy.
* `npm run build` compiles the plugin, `npm run restart` reloads it in the Stream Deck software. Reloading requires developer mode, which `npx streamdeck dev` switches on.
* `npm run validate` checks the manifest.
* `npm run icons` and `npm run sounds` regenerate the images and sound files.
