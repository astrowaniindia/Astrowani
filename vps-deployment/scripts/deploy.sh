#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Configuration
BACKEND_DIR="/var/www/astrowani/backend"
ADMIN_DIR="/var/www/astrowani/admin"

echo "=========================================================="
echo "          Astrowani VPS Deployment Automation Script      "
echo "=========================================================="

# 1. Ask for Domain names if not passed as environment variables
if [ -z "$BACKEND_DOMAIN" ]; then
    read -p "Enter Astrowani Backend Domain (e.g. api.astrowaniindia.com): " BACKEND_DOMAIN
fi

if [ -z "$ADMIN_DOMAIN" ]; then
    read -p "Enter Astrowani Admin Domain (e.g. admin.astrowaniindia.com): " ADMIN_DOMAIN
fi

if [ -z "$BACKEND_DOMAIN" ] || [ -z "$ADMIN_DOMAIN" ]; then
    echo "Error: Domain names are required."
    exit 1
fi

echo "Backend Domain: $BACKEND_DOMAIN"
echo "Admin Domain:   $ADMIN_DOMAIN"
echo "----------------------------------------------------------"

# 2. Create isolated directories
echo "Creating deployment directories..."
sudo mkdir -p "$BACKEND_DIR"
sudo mkdir -p "$ADMIN_DIR"
sudo chown -R $USER:$USER /var/www/astrowani

# 3. Setup backend files and install dependencies
echo "Setting up Backend at $BACKEND_DIR..."
# This script assumes you have uploaded your backend files to a temp directory or cloned them.
# For safety, we will check if index.js exists in the current folder before copying.
if [ -f "./astrowani-backend/index.js" ]; then
    cp -r ./astrowani-backend/* "$BACKEND_DIR/"
elif [ -f "./index.js" ]; then
    cp -r ./* "$BACKEND_DIR/"
else
    echo "Warning: No backend files detected in the current directory. Please copy your backend files to $BACKEND_DIR manually."
fi

cd "$BACKEND_DIR"
if [ -f "package.json" ]; then
    echo "Installing backend production dependencies..."
    npm install --production
else
    echo "Warning: package.json not found in $BACKEND_DIR."
fi

# Create backend .env template if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating backend .env file template..."
    # JWT_SECRET is generated fresh per deployment target. It must never be a
    # committed constant — the previous template shipped one, which is how
    # production ended up signing every customer, astrologer and admin token
    # with a value that was also printed in CLAUDE.md. The backend now refuses
    # to boot on a weak or known secret, so a placeholder here would just fail.
    GENERATED_JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" 2>/dev/null \
        || openssl rand -base64 48 | tr -d '\n=+/' )"
    cat > .env << EOF
PORT=4500
JWT_SECRET=${GENERATED_JWT_SECRET}
SUPABASE_URL=https://fxpoustnddrgumhwdcma.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
ENABLEX_APP_ID_otp_message=YOUR_ENABLEX_APP_ID
ENABLEX_APP_KEY_otp_message=YOUR_ENABLEX_APP_KEY
JYOTISHAM_API_KEY=YOUR_JYOTISHAM_API_KEY
JYOTISHAM_API_BASE_URL=https://api.jyotishamastroapi.com
# Optional — background-removal service (astrologer profile photos). Default
# below matches where step 4b runs it; only set this if you moved it elsewhere.
# BG_REMOVAL_URL=http://127.0.0.1:5001
EOF
    echo "-> Please edit $BACKEND_DIR/.env with your production credentials!"
fi

# 4. Start / Restart PM2 Backend Process
echo "Configuring PM2 process..."
if command -v pm2 &> /dev/null; then
    pm2 delete astrowani-backend 2>/dev/null || true
    pm2 start index.js --name "astrowani-backend"
    pm2 save
    echo "PM2 process 'astrowani-backend' is now running."
else
    echo "Warning: PM2 is not installed. Install it using 'sudo npm install -g pm2' and run 'pm2 start index.js --name astrowani-backend' inside $BACKEND_DIR"
fi

# 4b. Background-removal service for astrologer profile photos (self-hosted, see
# astrowani-backend/bg-removal-service/README.md). Own venv, own PM2 process.
echo "Setting up background-removal service..."
BG_REMOVAL_DIR="$BACKEND_DIR/bg-removal-service"
if [ -d "$BG_REMOVAL_DIR" ]; then
    cd "$BG_REMOVAL_DIR"
    if [ ! -d venv ]; then
        sudo apt-get update -y && sudo apt-get install -y python3-venv python3-pip
        python3 -m venv venv
    fi
    ./venv/bin/pip install -r requirements.txt
    if command -v pm2 &> /dev/null; then
        pm2 delete bg-removal 2>/dev/null || true
        pm2 start "venv/bin/uvicorn app:app --host 127.0.0.1 --port 5001" --name bg-removal
        pm2 save
        echo "PM2 process 'bg-removal' is now running."
    fi
    cd "$BACKEND_DIR"
else
    echo "Warning: bg-removal-service/ not found under $BACKEND_DIR — skipping."
fi

# 5. Configure Nginx Server Blocks
echo "Configuring Nginx..."

# Path to the templates (adjust if running from subdirectories)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NGINX_TEMPLATE_DIR="$SCRIPT_DIR/../nginx"

if [ -d "$NGINX_TEMPLATE_DIR" ]; then
    # Backend Site Config
    sudo sed "s/BACKEND_DOMAIN_PLACEHOLDER/$BACKEND_DOMAIN/g" "$NGINX_TEMPLATE_DIR/astrowani-backend.conf" | sudo tee /etc/nginx/sites-available/astrowani-backend > /dev/null
    
    # Admin Site Config
    sudo sed "s/ADMIN_DOMAIN_PLACEHOLDER/$ADMIN_DOMAIN/g" "$NGINX_TEMPLATE_DIR/astrowani-admin.conf" | sudo tee /etc/nginx/sites-available/astrowani-admin > /dev/null
    
    # Enable Nginx configs
    sudo ln -sf /etc/nginx/sites-available/astrowani-backend /etc/nginx/sites-enabled/
    sudo ln -sf /etc/nginx/sites-available/astrowani-admin /etc/nginx/sites-enabled/
    
    # Test Nginx syntax
    echo "Testing Nginx configuration..."
    sudo nginx -t
    
    # Reload Nginx
    echo "Reloading Nginx..."
    sudo systemctl reload nginx
else
    echo "Error: Nginx template directory not found at $NGINX_TEMPLATE_DIR"
    exit 1
fi

# 6. Certbot SSL Configuration
echo "----------------------------------------------------------"
echo "Would you like to run Certbot to configure SSL certificates?"
echo "Note: Make sure your DNS A records point to this VPS before selecting Yes."
read -p "Configure SSL? (y/n): " RUN_CERTBOT

if [[ "$RUN_CERTBOT" =~ ^[Yy]$ ]]; then
    if command -v certbot &> /dev/null; then
        echo "Running Certbot for $BACKEND_DOMAIN and $ADMIN_DOMAIN..."
        sudo certbot --nginx -d "$BACKEND_DOMAIN" -d "$ADMIN_DOMAIN"
        echo "SSL setup complete!"
    else
        echo "Error: Certbot is not installed. Install it with: sudo apt install certbot python3-certbot-nginx"
    fi
fi

echo "=========================================================="
echo "Deployment complete! Make sure to copy the admin dist/ folder to $ADMIN_DIR/dist/"
echo "=========================================================="
