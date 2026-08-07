@echo off
:: ProofChain API Management Script
cd /d D:\projects\proofchain\server

if "%1"=="start" (
    echo Starting ProofChain API...
    pm2 resurrect 2>nul || pm2 start server.js --name proofchain-api
    pm2 save
    pm2 status
) else if "%1"=="stop" (
    pm2 stop proofchain-api
) else if "%1"=="restart" (
    pm2 restart proofchain-api
) else if "%1"=="logs" (
    pm2 logs proofchain-api
) else if "%1"=="status" (
    curl -s http://localhost:3456/api/health
    echo.
    pm2 status
) else (
    echo ProofChain API Manager
    echo Usage: proofchain [start^|stop^|restart^|logs^|status]
    echo.
    pm2 status
)
