#!/usr/bin/env python3
"""
Test script to verify FastAPI backend setup
Run this to test basic functionality before proceeding
"""

import requests
import json
import time
import subprocess
import sys
import os

def test_api_endpoints():
    """Test basic API endpoints"""
    base_url = "http://localhost:8000"
    
    print("🧪 Testing ProCheck API endpoints...")
    
    # Test root endpoint
    try:
        response = requests.get(f"{base_url}/")
        if response.status_code == 200:
            print("✅ Root endpoint working")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Root endpoint failed: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to API. Make sure the server is running.")
        return False
    
    # Test health endpoint
    try:
        response = requests.get(f"{base_url}/health")
        if response.status_code == 200:
            print("✅ Health endpoint working")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Health endpoint failed: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to health endpoint")
        return False
    
    # Test test endpoint
    try:
        response = requests.get(f"{base_url}/test")
        if response.status_code == 200:
            print("✅ Test endpoint working")
            data = response.json()
            print(f"   Elasticsearch configured: {data['data']['elasticsearch_configured']}")
            print(f"   Gemini configured: {data['data']['gemini_configured']}")
        else:
            print(f"❌ Test endpoint failed: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to test endpoint")
        return False
    
    return True

def check_dependencies():
    """Check if required packages are installed"""
    print("📦 Checking dependencies...")
    
    required_packages = [
        'fastapi',
        'uvicorn',
        'dotenv',  # python-dotenv imports as dotenv
        'elasticsearch',
        'google.generativeai',  # google-generativeai imports as google.generativeai
        'pydantic',
        'requests'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
            print(f"✅ {package}")
        except ImportError:
            print(f"❌ {package} - not installed")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n⚠️  Missing packages: {', '.join(missing_packages)}")
        print("Run: pip install -r requirements.txt")
        return False
    
    return True

def main():
    """Main test function"""
    print("🚀 ProCheck Backend Test Suite")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not os.path.exists("main.py"):
        print("❌ Please run this script from the backend directory")
        sys.exit(1)
    
    # Check dependencies
    if not check_dependencies():
        print("\n❌ Dependency check failed. Please install missing packages.")
        sys.exit(1)
    
    print("\n" + "=" * 40)
    
    # Test API endpoints
    if not test_api_endpoints():
        print("\n❌ API tests failed. Make sure the server is running:")
        print("   python main.py")
        sys.exit(1)
    
    print("\n🎉 All tests passed! Backend is ready for the next step.")
    print("\nNext steps:")
    print("1. Set up your .env file with actual credentials")
    print("2. Test Elasticsearch connection")
    print("3. Test Gemini API integration")

if __name__ == "__main__":
    main()
