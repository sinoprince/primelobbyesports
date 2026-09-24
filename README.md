# 🎮 Discord Bot: Role & Access, Tournament & Support Ticket System

A comprehensive, production-ready Discord Bot built with **Discord.js v14** providing:
1. 🛡️ **Role & Access Management**: Auto-assigns `Visitor` role upon join, restricts visibility strictly to `#rules`, and promotes to `Member` with full channel access upon reaction / verification button click.
2. 🏆 **Tournament Management**: Interactive tournament creation for eFootball, BGMI (Mobile/PC), Call of Duty: Warzone, and custom games. Includes GPay payment instructions, participant caps, prize pool distribution, live updating dashboard embed, and auto-generated private event category & channels with admin-controlled closure.
3. 🎫 **Support Ticket System**: Reaction/Button helpdesk desk generating private ticket channels with staff controls, chat transcripts, and a dedicated Support Voice Channel where non-admins are auto-muted and can only be unmuted by Admins.

---

## 📋 Table of Contents
- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Step 1: Discord Developer Portal Setup](#-step-1-discord-developer-portal-setup)
- [Step 2: Bot Installation & Configuration](#-step-2-bot-installation--configuration)
- [Step 3: Server Setup Workflow](#-step-3-server-setup-workflow)
- [Commands Reference](#-commands-reference)
- [Modules Walkthrough](#-modules-walkthrough)
  - [1. Role & Access Management](#1-role--access-management)
  - [2. Tournament Management](#2-tournament-management)
  - [3. Support Ticket & Voice Moderation](#3-support-ticket--voice-moderation)
- [Project Architecture](#-project-architecture)

---

## ✨ Features

### 🛡️ 1. Role & Access Management
- **Automated Onboarding**: When a new user joins, the bot automatically assigns them the `Visitor` role.
- **Rules Gatekeeping**: New visitors can only see the `#rules` channel and are blocked from chatting or viewing other server channels.
- **Dual Verification Options**:
  - **Modern Button**: Click the `✅ Verify / Accept Rules` interactive button.
  - **Classic Reaction**: React with `✅` to the official rules message.
- **Automatic Promotion**: Instantly removes `Visitor` role and grants `Member` role, unlocking general chat and voice channels.

### 🏆 2. Tournament Management
- **Preset & Custom Games**: Supports `eFootball`, `BGMI Mobile`, `BGMI PC / Emulator`, `CoD Warzone`, `Valorant`, `Free Fire MAX`, and custom games.
- **Configurable Parameters**: Slots (e.g. 16, 32, 64), Entry Fee, GPay/UPI payment instructions, and Prize Pool (1st, 2nd, 3rd places).
- **Automated Event Channels Provisioning**:
  - Automatically creates a dedicated category: `🏆 ╎ {Tournament Name}`
  - `#📌-announcements` (Host announcements)
  - `#💬-match-chat` (Match coordination)
  - `#📸-scores-and-proof` (Screenshot submissions)
  - `🔊 Match Room 1`, `🔊 Match Room 2`, `🔊 Tournament Lounge`
- **Live Updating Dashboard Embed**: Shows real-time participant roster, remaining slots, payment details, and one-click Register / Leave buttons.
- **Admin-Controlled Lifecycle**: Only Admins/Hosts can end tournaments (`/tournament end` or Admin End Button), announce winners, and clean up or archive event channels.

### 🎫 3. Support Ticket System & Voice Moderation
- **One-Click Ticket Helpdesk**: Dropdown menu and buttons to open categorized tickets (`Tournament Support`, `General Support`, `Report Cheater`, `Voice Support`).
- **Private Channels**: Creates isolated channels `ticket-{username}` where only the user and staff can chat.
- **Staff Toolkit**: Claim ticket, add referee/player, download full text transcript upon closure.
- **Support Voice Waiting Room**:
  - Automatically mutes non-admins upon joining (`🔊 Support Waiting Room`).
  - Admins can speak freely and grant microphone un-mute permissions with 1-click in the ticket or using `/ticket unmute-voice @user`.

---

## 📦 Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- A Discord Account and a Discord Server where you have Administrator permissions.

---

## 🚀 Step 1: Discord Developer Portal Setup

1. Go to the **[Discord Developer Portal](https://discord.com/developers/applications)**.
2. Click **"New Application"**, give it a name (e.g., `Esports & Community Bot`), and accept the Terms.
3. In the left sidebar, click on **"Bot"**:
   - Click **"Reset Token"** (or "Copy Token") to get your **Bot Token**. Save this token for `.env`.
   - Scroll down to **"Privileged Gateway Intents"** and **enable all three**:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent** *(Crucial for auto-assigning Visitor/Member roles)*
     - ✅ **Message Content Intent** *(Crucial for reading reactions and commands)*
   - Click **"Save Changes"**.
4. In the left sidebar, click on **"OAuth2"** -> **"URL Generator"**:
   - In **Scopes**, check: `bot` and `applications.commands`.
   - In **Bot Permissions**, check: `Administrator` (or View Channels, Manage Channels, Manage Roles, Send Messages, Manage Messages, Embed Links, Attach Files, Connect, Speak, Mute Members, Move Members).
   - Copy the generated URL at the bottom, paste it into your browser, and invite the bot to your Discord server.
5. In your Discord Server:
   - Go to **Server Settings** -> **Roles**.
   - Make sure the **Bot's role is placed ABOVE** the `Visitor` and `Member` roles in the role list hierarchy so the bot has permission to assign and remove them.

---

## ⚙️ Step 2: Bot Installation & Configuration

1. In the project folder, open `.env` and fill in your credentials:
   ```env
   # Discord Bot Credentials
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_bot_client_id_here
   GUILD_ID=your_discord_server_id_here

   # Staff & Admin Settings
   ADMIN_ROLE_NAME=Admin
   STAFF_ROLE_NAME=Support Staff

   # Default GPay / Payment Details for Tournaments
   DEFAULT_GPAY_UPI=yourname@okaxis
   DEFAULT_GPAY_PHONE=+919876543210
   ```

2. *(Optional)* Customize server role names, channels, or theme colors in `config.json`.

3. Start the bot:
   ```bash
   npm start
   ```
   *For development auto-reload on file changes:*
   ```bash
   npm run dev
   ```

---

## 🛠️ Step 3: Server Setup Workflow

Once the bot is online in your server, run the setup command:

### 🌟 Quick One-Click Setup
Run:
```
/setup all
```
This automatically:
1. Creates the `Visitor` and `Member` roles with proper permissions.
2. Posts the official **Rules & Verification Panel** in the current channel.
3. Posts the **Support Ticket Helpdesk** in the current channel.
4. Creates the **Support Waiting Room** voice channel with default mute rules.

### 🔧 Modular Setup Commands
If you prefer configuring individual channels:
- `/setup roles` — Creates and verifies `Visitor` and `Member` roles.
- `/setup rules #rules-channel` — Posts the Rules Embed with verification button & reaction support.
- `/setup tickets #support-channel` — Posts the Ticket Desk embed.
- `/setup support-voice` — Sets up the auto-muted Support Voice Room.

---

## 📖 Commands Reference

| Command | Permission | Description |
| :--- | :--- | :--- |
| `/help` | Everyone | Displays command guide, bot features, and setup help. |
| `/setup all` | Admin | One-click setup for roles, rules, tickets, and voice. |
| `/setup roles` | Admin | Creates/verifies Visitor and Member roles. |
| `/setup rules [channel]` | Admin | Deploys the Rules Verification Panel. |
| `/setup tickets [channel]` | Admin | Deploys the Support Ticket Desk Panel. |
| `/setup support-voice` | Admin | Creates/configures the auto-muted Support Voice Room. |
| `/tournament create` | Admin / Host | Launches a tournament with automated event channels & dashboard. |
| `/tournament list` | Everyone | Shows active open tournaments in the server. |
| `/tournament info <id>` | Everyone | Displays tournament details, slots, rules, and participant list. |
| `/tournament end <id>` | Admin / Host | Closes tournament, announces winners, and manages channel cleanup. |
| `/tournament kick <id> <user>` | Admin / Host | Removes a registered participant from the tournament. |
| `/ticket panel [channel]` | Admin | Deploys the Support Ticket Desk embed. |
| `/ticket close` | Staff / User | Closes the current ticket and generates a transcript. |
| `/ticket claim` | Staff | Claims the ticket for the staff member. |
| `/ticket add <user>` | Staff | Adds a user/player to the private ticket channel. |
| `/ticket unmute-voice <user>` | Admin / Staff | Unmutes a user in the Support Voice waiting room. |
| `/ticket mute-voice <user>` | Admin / Staff | Re-mutes a user in the Support Voice waiting room. |

---

## 🕹️ Modules Walkthrough

### 1. Role & Access Management
```
[New User Joins Server] 
         │
         ▼
[Auto-assigned "Visitor" Role] ───► Only `#rules` channel visible
         │
         ▼
[Clicks "Verify / Accept Rules" or Reacts ✅]
         │
         ▼
["Visitor" Role Removed & "Member" Role Granted]
         │
         ▼
[Full Access to General Chat, Voice, and Community Channels]
```

### 2. Tournament Management
1. **Admin creates tournament**:
   ```
   /tournament create game:eFootball title:Weekly Champions Cup max_participants:16 entry_fee:₹50 prize_pool:1st: ₹500 | 2nd: ₹250 gpay_info:UPI: gamer@okhdfcbank
   ```
2. **Automated channel creation**:
   - Creates category `🏆 ╎ Weekly Champions Cup`
   - Creates `#📌-announcements`, `#💬-match-chat`, `#📸-scores-and-proof`, `🔊 Match Room 1`, `🔊 Match Room 2`, `🔊 Tournament Lounge`
3. **Interactive Dashboard**:
   - Posts live embed in `#active-tournaments` with real-time slot counter (`0/16`).
   - Players click **"Register for Tournament"**, enter their in-game name/ID and GPay transaction reference.
   - Dashboard instantly updates to show registered players.
4. **Admin Conclusion**:
   - Admin executes `/tournament end` or clicks **"Admin: End & Close Tournament"**.
   - Posts winner podium announcement in `#📌-announcements` and optionally archives/cleans up match channels.

### 3. Support Ticket & Voice Moderation
1. **User needs help or payment verification**:
   - Clicks **"Open Support Ticket"** or selects category from the dropdown on the Helpdesk panel.
   - Bot generates private text channel `ticket-username` visible only to the user and Staff.
2. **Support Voice Waiting Room**:
   - User joins `🔊 Support Waiting Room`.
   - Bot immediately server-mutes the user (preventing voice spam/disruptions).
   - Staff in the ticket channel clicks **"Unmute in Voice"** or runs `/ticket unmute-voice @user` to let them speak.
3. **Ticket Closure**:
   - Staff or user clicks **"Close Ticket"** or runs `/ticket close`.
   - Bot generates a timestamped `.txt` transcript, sends it to the user's DMs, and safely deletes the channel after 5 seconds.

---

## 🏗️ Project Architecture

```
├── package.json               # Dependencies (discord.js, dotenv) & scripts
├── .env.example               # Environment variables template
├── .env                       # Local environment configuration
├── config.json                # Customizable roles, channels, preset games, colors
├── test/
│   └── verify_bot.js          # Unit & schema verification test suite
├── data/
│   └── storage.json           # Atomic JSON database for persistent state
└── src/
    ├── index.js               # Main bot client initialization & error handling
    ├── database/
    │   └── db.js              # Database manager (tournaments, tickets, guild settings)
    ├── utils/
    │   └── embedBuilder.js    # Standardized rich embed designs & action rows
    ├── handlers/
    │   ├── roleHandler.js     # Visitor/Member role lifecycle & permissions
    │   ├── tournamentHandler.js # Tournament creation, registration, automated channels
    │   ├── ticketHandler.js   # Ticket channel creation, transcripts, permissions
    │   └── voiceHandler.js    # Support voice auto-mute & admin un-mute controls
    ├── commands/
    │   ├── admin/setup.js     # /setup commands
    │   ├── tournament/tournament.js # /tournament commands
    │   ├── tickets/ticket.js  # /ticket commands
    │   └── general/help.js    # /help guide command
    └── events/
        ├── ready.js           # Client ready & slash command auto-registration
        ├── guildMemberAdd.js  # Auto-assign Visitor role on join
        ├── interactionCreate.js # Routes slash commands, buttons, dropdowns, modals
        ├── messageReactionAdd.js # Reaction verification & reaction ticket creation
        └── voiceStateUpdate.js # Support Voice default-mute enforcement
```

---

## 🔒 Security & Best Practices
- **Role Hierarchy**: Bot checks role hierarchy and ensures permissions are isolated so visitors cannot access restricted channels.
- **SQL / Injection Safe**: Pure JS atomic storage eliminates SQL injection vectors.
- **Anti-Crash Handlers**: `unhandledRejection` and `uncaughtException` listeners ensure 24/7 uptime without sudden crashes.
- **Admin Authentication**: All tournament creation, ticket moderation, and voice overrides strictly verify Discord `Administrator` or configured staff permissions.
