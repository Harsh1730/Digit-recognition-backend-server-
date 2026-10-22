import os

# Port assigned by Render or default to 5000
port = os.environ.get("PORT", "5000")
bind = f"0.0.0.0:{port}"

# Single worker to fit comfortably within Render's 512MB RAM free tier
workers = 1

# Threaded concurrency
threads = 2

# Allow up to 120 seconds (Render free tier can be slow on first inference)
timeout = 120

# Keep connection alive for snappy consecutive requests
keepalive = 5
