@echo off
echo ========================================
echo  Rock Paper Scissors - Local Server
echo ========================================
echo.
echo Starting local server on http://localhost:8080
echo.
echo Open your browser and go to:
echo   http://localhost:8080
echo.
echo Press Ctrl+C to stop the server.
echo.

:: Try Python 3 first
python --version >nul 2>&1
if %errorlevel% == 0 (
    python -m http.server 8080
    goto :end
)

:: Try py launcher
py --version >nul 2>&1
if %errorlevel% == 0 (
    py -m http.server 8080
    goto :end
)

:: Try Python 2
python2 --version >nul 2>&1
if %errorlevel% == 0 (
    python2 -m SimpleHTTPServer 8080
    goto :end
)

echo ERROR: Python is not installed.
echo.
echo Please install Python from https://www.python.org/downloads/
echo Or open the folder in VS Code and use the Live Server extension.
pause
:end
