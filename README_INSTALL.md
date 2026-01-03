# Installation Instructions

## Overview
The application has been packaged as a standalone Windows installer.

## Location
After the build completes, you will find the installer in the `dist_v2_1_0` folder in your project directory:

`H:\Sales-Funnel-2.1 -Bugs Fixing and Process department\dist_v2_1_0`

The file will be named something like:
`Enterprise Lead Management System Setup 2.1.0.exe`

## Installation
1.  Double-click the `.exe` file.
2.  The application will install automatically (one-click installer).
3.  It will launch immediately after installation.
4.  A shortcut will be created on your Desktop and Start Menu.

## Troubleshooting
-   **Security Warning**: Windows might show a "Windows protected your PC" warning because the app is not signed with a paid certificate. Click **More info** -> **Run anyway**.
-   **Anti-virus**: Some anti-virus software might flag the un-signed installer. You may need to whitelist it.

## For Developers
To rebuild the installer:
```bash
npm run dist:win
```
