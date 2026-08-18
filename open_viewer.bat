@echo off
REM Serves this folder read-only on 127.0.0.1 and opens the viewer.
REM Nothing is uploaded; the browser reads the files straight off your disk.
cd /d "%~dp0"
py -3 viewer\taimanin_server.py
