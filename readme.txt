================================================================================
  MOSART TEMPLATE STATS  —  User Guide
================================================================================

A real-time dashboard that shows which Viz Mosart templates are being used
(and which aren't), parsed live from Mosart log files.

--------------------------------------------------------------------------------
REQUIREMENTS
--------------------------------------------------------------------------------

  - Node.js 18 or later  (https://nodejs.org)
  - Viz Mosart running and writing log files to a folder you can access
  - Optional: ChannelTemplates.xml if you want "unused template" detection
  - Optional: NewsroomSettings.xml if you want local tag names resolved to
              standard Mosart type names


--------------------------------------------------------------------------------
QUICK START
--------------------------------------------------------------------------------

  Double-click  start.bat

  On the first run it will install dependencies automatically (requires an
  internet connection that one time). After that it starts the server and
  opens the dashboard in your browser straight away.

  Note: the first time, run start.bat as Administrator (right-click →
  "Run as administrator") so that npm can write files to the install folder.

  If you see a "Cannot find module" error, open PowerShell, navigate to the
  install folder, and run:

    npm install

  Then double-click start.bat again.

  The dashboard will update in real time as Mosart writes to its log files.
  No browser refresh is needed.

  If your log folder or other settings differ from the defaults, see the
  CONFIGURATION section below.


--------------------------------------------------------------------------------
CONFIGURATION  (.env file)
--------------------------------------------------------------------------------

  PORT
    The port the dashboard listens on.
    Default: 3002
    Example: PORT=3002

  LOG_FOLDER
    The folder containing Mosart .log (and .xml) files.
    The watcher only looks in this folder — subdirectories are NOT scanned.
    Default: C:\MMLogs\
    Example: LOG_FOLDER=C:\MMLogs\

  CHANNEL_TEMPLATES
    Path to your ChannelTemplates.xml file.
    Used to detect templates that exist in the system but haven't been used,
    and to resolve DirectTake recall numbers to template names.
    If the file is not found the server still runs — the "Unused Templates"
    feature is simply unavailable.
    Default: C:\channeltemplate\channeltemplates.xml
    Example: CHANNEL_TEMPLATES=C:\channeltemplate\channeltemplates.xml

  NEWSROOM_SETTINGS
    Path to your NewsroomSettings.xml file.
    Used to map local newsroom tag names to standard Mosart template types
    (e.g. a local tag "INDSLAG" might map to "PACKAGE").
    If the file is not found the server still runs — type names from the log
    are used as-is.
    Default: C:\channeltemplate\newsroomsettings.xml
    Example: NEWSROOM_SETTINGS=C:\channeltemplate\newsroomsettings.xml

  USE_POLLING
    Set to true if log files are on a network drive (UNC path).
    Native filesystem events often don't fire over network shares; polling
    checks the file on a fixed interval instead.
    Default: false
    Example: USE_POLLING=true

  POLLING_INTERVAL
    How often (in milliseconds) to check for file changes when polling.
    Only relevant when USE_POLLING=true.
    Default: 1000
    Example: POLLING_INTERVAL=1000

  STATS_LOG_DIR
    Where daily stats CSV files are written (see STATS LOGGING below).
    The folder is created automatically if it does not exist.
    Can also be changed in the Settings panel without restarting.
    Default: C:\MMLogs\stats-logs
    Example: STATS_LOG_DIR=C:\MMLogs\stats-logs

Network drive example:

  LOG_FOLDER=\\SERVER\Share\MosartLogs
  USE_POLLING=true
  POLLING_INTERVAL=1000


--------------------------------------------------------------------------------
THE DASHBOARD
--------------------------------------------------------------------------------

The dashboard opens at http://localhost:3002 and has two main tabs.


  HEADER BAR
  ----------
  - Connection indicator:
      Amber dot  — reading log files on startup (shows "Reading log files… N/M")
      Green dot  — live, all files loaded
      Red dot    — WebSocket disconnected, reconnecting automatically
  - The log folder currently being watched
  - Settings button (gear icon, top right)

  STAT CARDS  (top of page)
  ----------
  - Total Switches     Total number of template switch events seen since
                       the server started (or last reset)
  - Unique Templates   How many distinct template names have been seen
  - Total Templates    Total number of templates in ChannelTemplates.xml
  - Unused Templates   Templates in ChannelTemplates.xml that haven't been
                       used at all (requires CHANNEL_TEMPLATES to be set)
  - Tracking Since     When the current session started


  TAB: USAGE CHART
  ----------------
  A horizontal bar chart of the most-used templates.

  Controls:
    Search box
      Filter templates shown in the chart and Live Events by name.
      Works together with the category filter buttons below.

    Timeframe dropdown
      All time       — show everything since the server started
      Last hour      — last 60 minutes of events
      Last 24 hours  — last 24 hours of events
      Custom…        — pick a From and To date/time

    Show top (10 / 20 / 50)
      Limits how many templates appear in the chart.

    Category filter buttons  (below the controls)
      Click a coloured button to show only templates of that type.
      Click again to deselect. Multiple filters can be active at once.

        CAM  — Camera                        (green)
        PKG  — Package                       (blue)
        VO   — Voiceover                     (split blue/green)
        LIV  — Live                          (red)
        GFX  — Full-screen graphics          (amber)
        DVE  — DVE                           (split amber/red)
        JIN  — Jingles                       (grey)
        PHN  — Telephone interview           (split amber/white)
        FLT  — Floats                        (split green/blue)
        BRK  — Break                         (white)
        🔊   — Playsound / audio             (black)
        +    — Accessories                   (black)
        ⚡   — Directtakes                  (purple)

    Reset button
      Clears all collected statistics. Requires confirmation.

  Live Events panel  (right side)
    Shows the 20 most recent template switches with timestamp, hostname,
    and story name (if present in the log). Updates instantly via WebSocket.


  TAB: UNUSED TEMPLATES
  ---------------------
  Lists every template defined in ChannelTemplates.xml that has not been
  seen in the logs during the current session.

  Useful for identifying templates that could be retired or cleaned up.

    - Use the search box to filter by name.
    - Click "Refresh" to reload the list from the server.
    - The count in the tab header updates automatically as events arrive.

  If ChannelTemplates.xml was not found, an error message is shown here
  with the path the server tried to load.


  SETTINGS PANEL  (gear icon)
  ----------------------------
  Opens a slide-in panel on the right. Changes are saved to .env.

  Monitoring section:
    Log folder         — the path currently being watched
    Use polling        — toggle polling mode for network drives
    Poll interval (ms) — only shown when polling is enabled

  Channel Templates section:
    File path          — path to ChannelTemplates.xml

  Newsroom Settings section:
    File path          — path to NewsroomSettings.xml

  Stats Logging section:
    Output folder      — where CSV snapshot files are written

  Clicking "Save settings" writes to .env immediately.
  If you changed the log folder or polling settings, the server needs to
  be restarted for those changes to take effect (a warning will appear).
  All other changes (templates, newsroom settings, stats folder) apply
  immediately without restart.

  Data section:
    Download JSON / Download XML
      Downloads the current statistics. If a timeframe filter is active
      (Last hour, Last 24h, Custom), the download reflects that filter.

    Reset Statistics
      Same as the Reset button on the chart. Requires confirmation.


--------------------------------------------------------------------------------
WHAT IS TRACKED
--------------------------------------------------------------------------------

The parser watches for three types of Mosart log events:

  ExSwitchBackGrounds
    The standard template switch event. The CDATA contains the channel label,
    a numeric type code in parentheses (e.g. "(1)"), and the template name
    separated by "+". The type number is resolved to a standard Mosart type
    name via NewsroomSettings.xml or the built-in type table (e.g. 1 →
    PACKAGE, 0 → CAMERA). The story name is also captured and shown in the
    Live Events panel.

  TakeExternals
    External type events such as PLAYSOUND and ACCESSORIES. The type name and
    template name are read directly from the log. COMMAND+ events are ignored
    as they are internal Mosart control messages and not template switches.

  ExDirectTake
    Direct take events. The recall number from the log is looked up in the
    DirectTakes group in ChannelTemplates.xml to resolve the human-readable
    template name. If ChannelTemplates.xml is not loaded, the recall number
    is stored as the name.

Events are counted per unique template name. The count is cumulative for
the life of the server session (or until Reset is clicked).

The server keeps up to 200,000 events in memory for time-range filtering.
If you run for very long sessions this can be reduced in server.js.


--------------------------------------------------------------------------------
STATS LOGGING
--------------------------------------------------------------------------------

The server automatically writes a CSV summary of template usage to disk.
This is a snapshot of totals — not a per-event log — so the files stay small.

  When a file is written:
    - Every night at midnight (the scheduler starts automatically with the server)
    - Whenever the in-memory event buffer reaches 200,000 events

  Where files are written:
    C:\MMLogs\stats-logs\  (created automatically if it does not exist)
    Override with STATS_LOG_DIR= in .env or via the Settings panel.

  File naming:
    stats-YYYY-MM-DD_HH-MM-SS.csv
    The timestamp is when the file was written, not the start of the session.

  File format (CSV, opens in Excel):
    # Mosart Template Stats — 2026-03-18T23:59:00.000Z
    # Reason: midnight
    # Total switches: 8432
    # Unique templates: 61
    # Tracking since: 2026-03-18T07:00:00.000Z
    template,count
    "CAMERA 1 NEWS DESK",1204
    "FULL SOUND CLIPS",987
    ...

    Sorted by count descending. The comment lines (starting with #) are
    ignored by Excel and most CSV tools.

  The stats-logs folder is not committed to version control.


--------------------------------------------------------------------------------
LOG FILE HANDLING
--------------------------------------------------------------------------------

The watcher monitors the LOG_FOLDER for:
  - .log files  — tailed as they grow (new bytes only, like "tail -f")
  - .xml files  — parsed in full when they first appear

Each file gets its own stateful parser, so partial lines written at
the end of a chunk are buffered and completed on the next read.

If a file is removed (Mosart rotates logs), its state is cleaned up.

The watcher starts from byte 0 of every file that exists when the server
starts, so any events already in the logs will be counted immediately.
Files are read one at a time in chunks to avoid high memory usage on
startup. Progress is shown in the dashboard header.


--------------------------------------------------------------------------------
KNOWN LIMITATIONS
--------------------------------------------------------------------------------

  Directtakes entered directly in the newsroom system (NCS) — rather than
  triggered through templates or from the GUI — are not captured by this
  tool.

  Template set context is not tracked. When a template such as "CAMERA 1" is
  used, it may have been taken from any of the configured template sets. As a
  result, a used template is removed from the Unused Templates list across all
  template sets, not just the one it was actually taken from.


--------------------------------------------------------------------------------
API ENDPOINTS  (for integration / scripting)
--------------------------------------------------------------------------------

  GET  /api/stats
    Returns full statistics as JSON.
    Optional query params:
      from=<ISO datetime>   e.g. from=2024-01-15T08:00:00Z
      to=<ISO datetime>

  GET  /api/unused
    Returns templates from ChannelTemplates.xml that have not been seen.
    Returns 503 if ChannelTemplates.xml is not loaded.

  GET  /api/download?format=json|xml
    Downloads statistics as a file. Supports from= and to= params.

  GET  /api/config
    Returns current configuration (paths, polling settings, template count).

  POST /api/reset
    Clears all statistics.

  POST /api/reload-templates
    Reloads ChannelTemplates.xml and NewsroomSettings.xml from disk without
    restarting.

  POST /api/config   (JSON body)
    Updates configuration. Body fields:
      logFolder         string
      channelTemplates  string
      newsroomSettings  string
      statsLogDir       string
      usePolling        boolean
      pollingInterval   number


--------------------------------------------------------------------------------
WINDOWS SERVICE  (run on boot without logging in)
--------------------------------------------------------------------------------

You can install the app as a Windows Service so it starts automatically when
the machine boots, with no need to be logged in.

  Prerequisites:

    npm install -g node-windows

  Install the service (run once, as Administrator):

    node install-service.js

  The service will appear in services.msc as "Mosart Template Stats" and will
  start immediately. It will also restart automatically if it crashes.

  To run on a custom port:

    set PORT=3002 && node install-service.js

  To uninstall the service (run as Administrator):

    node install-service.js remove

  Notes:
    - The service reads .env on startup just like the normal server. Make sure
      .env is configured correctly before installing.
    - If you change .env after installing, restart the service via services.msc
      or: net stop "Mosart Template Stats" && net start "Mosart Template Stats"
    - Log files for the service wrapper are written next to install-service.js
      in a folder named "daemon".


--------------------------------------------------------------------------------
TROUBLESHOOTING
--------------------------------------------------------------------------------

  "ChannelTemplates: not found" in the header
    The file at CHANNEL_TEMPLATES= in .env does not exist or cannot be read.
    Check the path. The rest of the dashboard still works without it.

  No events appearing
    - Make sure LOG_FOLDER points to the correct directory.
    - Check the terminal window for "[Watcher]" messages. It should say
      which files it is tracking.
    - If logs are on a network drive, set USE_POLLING=true in .env.

  Dashboard not updating live
    - The header will show a red dot and "Reconnecting…" if the WebSocket
      drops. It reconnects automatically.
    - If the server was restarted, just reload the browser page.

  "Restart required" message after saving settings
    Changes to Log folder or polling mode only take effect after you
    restart the server (Ctrl+C in the terminal, then npm start again).

  Port already in use
    Change PORT= in .env to a free port number.


--------------------------------------------------------------------------------
FILES
--------------------------------------------------------------------------------

  server.js            Express + WebSocket server. Stats store, REST API,
                       config endpoints, XML export builder.

  watcher.js           Folder watcher using chokidar. Tails .log files as
                       they grow; parses .xml files in full on arrival.
                       Files are read sequentially in 256 KB chunks on
                       startup to avoid high memory usage.

  parser.js            Stateful line-by-line parser. Handles
                       ExSwitchBackGrounds, TakeExternals, and ExDirectTake.

  channelTemplates.js  Loads ChannelTemplates.xml and computes which
                       templates have not been used.

  newsroomSettings.js  Loads NewsroomSettings.xml and maps local newsroom
                       tag names to standard Mosart template type names.

  index.html           The single-page dashboard (served from /).

  .env                 Local configuration. See .env.example for all options.

  .env.example         Template showing all supported config options.

  start.bat            Double-click shortcut to start the server on Windows.

  install-service.js   Installs / uninstalls the app as a Windows Service
                       (see WINDOWS SERVICE section above).

  package.json         Node dependencies: express, ws, chokidar, dotenv.

  stats-logs\          Auto-created folder for daily CSV snapshots.
                       Not committed to version control.


================================================================================
