@echo off
setlocal DisableDelayedExpansion
rem Use the existing dev launcher from its project root, even on double-click.
pushd "%~dp0"
if errorlevel 1 (
    echo Cannot open the Thermal Label Studio project folder.
    pause
    exit /b 1
)
python -B scripts/dev.py %*
set "devExitCode=%errorlevel%"
popd
if not "%devExitCode%"=="0" (
    echo.
    echo Development launch failed. Review the error above.
    pause
)
exit /b %devExitCode%
