#!/bin/bash

# Token-Based CBDC Startup Script

echo "🪙 Starting Token-Based CBDC System..."
echo ""

# Create data directories
mkdir -p central_bank/data
mkdir -p fi_node/data

# Function to check if a port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
}

# Start Central Bank
echo "Starting Central Bank on port 4000..."
cd central_bank
python app.py &
CB_PID=$!
cd ..
sleep 2

# Start SBI (FI 1)
echo "Starting SBI on port 4001..."
cd fi_node
FI_ID=sbi FI_NAME="State Bank of India" FI_PORT=4001 python app.py &
FI1_PID=$!
cd ..
sleep 2

# Start HDFC (FI 2)
echo "Starting HDFC on port 4002..."
cd fi_node
FI_ID=hdfc FI_NAME="HDFC Bank" FI_PORT=4002 python app.py &
FI2_PID=$!
cd ..
sleep 2

# Start Dashboard
echo "Starting Dashboard on port 3000..."
cd web_dashboard
python app.py &
DASH_PID=$!
cd ..
sleep 2

echo ""
echo "✅ All services started!"
echo ""
echo "📊 Dashboard: http://localhost:3000"
echo "🏛️ Central Bank: http://localhost:4000"
echo "🏦 SBI: http://localhost:4001"
echo "🏦 HDFC: http://localhost:4002"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "echo 'Stopping all services...'; kill $CB_PID $FI1_PID $FI2_PID $DASH_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
