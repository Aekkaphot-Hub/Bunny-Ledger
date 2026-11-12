@echo off
title Bunny Ledger - deploy to Firebase Hosting
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Install it once with this command, then run this file again:
  echo     winget install OpenJS.NodeJS.LTS
  echo.
  pause
  exit /b 1
)
findstr /c:"project-id" .firebaserc >nul
if not errorlevel 1 (
  echo.
  echo  Please open .firebaserc and replace the placeholder with your Firebase project ID first.
  echo.
  pause
  exit /b 1
)
echo.
echo  Step 1/2: sign in to Google (a browser window will open)...
call npx --yes firebase-tools@13 login
echo.
echo  Step 2/2: uploading the app and Firestore rules...
call npx --yes firebase-tools@13 deploy --only hosting,firestore:rules
echo.
echo  Done. Open https://YOUR-PROJECT-ID.web.app on your phone and add it to the home screen.
pause
