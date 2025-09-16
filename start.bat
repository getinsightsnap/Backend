@echo off
echo 🚀 Starting InsightSnap Backend...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo ⚠️  .env file not found. Creating from template...
    if exist env.example (
        copy env.example .env
        echo ✅ Created .env file from template. Please edit it with your API keys.
    ) else (
        echo ❌ env.example file not found. Please create a .env file manually.
        pause
        exit /b 1
    )
)

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo 📦 Installing dependencies...
    npm install
)

REM Create logs directory
if not exist logs mkdir logs

REM Start the server
echo 🌐 Starting server on port %PORT%...
if "%NODE_ENV%"=="production" (
    npm start
) else (
    npm run dev
)

pause
