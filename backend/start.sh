#!/bin/bash

# ProCheck Backend Startup Script
# This script helps you start the FastAPI backend server

echo "🚀 Starting ProCheck Backend API..."
echo "=================================="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Creating one..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if dependencies are installed
if [ ! -f "venv/pyvenv.cfg" ]; then
    echo "❌ Virtual environment is not properly configured"
    exit 1
fi

# Install dependencies if needed
echo "📋 Checking dependencies..."
pip install -r requirements.txt --quiet

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Using default configuration."
    echo "   To configure Elasticsearch and Gemini API, create a .env file"
    echo "   based on .env.example"
fi

# Start the server
echo "🌐 Starting FastAPI server..."
echo "   API will be available at: http://localhost:8000"
echo "   Documentation: http://localhost:8000/docs"
echo "   ReDoc: http://localhost:8000/redoc"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=================================="

python3 main.py

