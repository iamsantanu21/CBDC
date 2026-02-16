#!/bin/bash

# Stop all CBDC processes

echo "Stopping Token-Based CBDC services..."

# Kill processes by port
kill $(lsof -t -i:3000) 2>/dev/null
kill $(lsof -t -i:4000) 2>/dev/null
kill $(lsof -t -i:4001) 2>/dev/null
kill $(lsof -t -i:4002) 2>/dev/null

echo "✅ All services stopped"
