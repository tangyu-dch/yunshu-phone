@echo off
setlocal enabledelayedexpansion
for /f "delims=" %%i in ('pkg-config --static %*') do (
    set "line=%%i"
    set "line=!line:/C/pjsip-install=C:/pjsip-install!"
    set "line=!line:/c/pjsip-install=C:/pjsip-install!"
    echo !line!
)
endlocal
