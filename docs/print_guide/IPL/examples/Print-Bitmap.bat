@echo off
setlocal
set "IPL_SAMPLE=%~dp0bitmap-readable.ipl"
set "IPL_LOG=%~dp0print-status.txt"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $c=$null; try { $b=[IO.File]::ReadAllBytes($env:IPL_SAMPLE); $c=New-Object Net.Sockets.TcpClient; $task=$c.ConnectAsync('192.168.88.84',9100); if (-not $task.Wait(5000)) { throw 'Connection timeout' }; $s=$c.GetStream(); $s.WriteTimeout=5000; $s.Write($b,0,$b.Length); $s.Flush(); Write-Output ('SENT: '+$b.Length+' bytes to 192.168.88.84:9100. Inspect the physical label.'); exit 0 } catch { Write-Error $_; exit 1 } finally { if ($null -ne $c) { $c.Close() } }" > "%IPL_LOG%" 2>&1
set "IPL_RESULT=%ERRORLEVEL%"
type "%IPL_LOG%"
echo.
echo This sample defines graphic 90 and format 90 and requests one label.
pause
exit /b %IPL_RESULT%
