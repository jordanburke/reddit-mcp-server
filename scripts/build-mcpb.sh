#!/bin/bash

# Build script for creating Claude Desktop Extension (.mcpb file)

set -e

# Check if script is being run from repository root
if [ ! -f "package.json" ] || [ ! -d "src" ] || [ ! -f "manifest.json" ]; then
    echo "Error: This script must be run from the repository root!"
    echo ""
    echo "Current directory: $(pwd)"
    echo ""
    echo "Please cd to the repository root and run:"
    echo "  ./scripts/build-mcpb.sh"
    exit 1
fi

# Check for icon
if [ ! -f "assets/reddit-mcp-server-icon.png" ]; then
    echo "Warning: No icon found at assets/reddit-mcp-server-icon.png"
    echo "The extension will work but won't have a custom icon."
    echo ""
fi

echo "Building Reddit MCP Server Desktop Extension..."

# Build if dist folder doesn't exist
if [ ! -d "dist" ]; then
    echo "Building TypeScript..."
    pnpm install
    pnpm build

    if [ ! -d "dist" ]; then
        echo "Error: Build failed - dist folder not found"
        exit 1
    fi
fi

# Clean up previous builds
rm -f reddit-mcp-server.mcpb
rm -rf bundle-temp

# Create temp directory
mkdir -p bundle-temp
cd bundle-temp

# Copy necessary files (manifest must be at root)
cp -r ../dist .
cp ../package.json .
cp ../manifest.json .
[ -d "../assets" ] && cp -r ../assets .
cp ../README.md .
cp ../LICENSE . 2>/dev/null || echo "Warning: LICENSE file not found"

# Install production dependencies
echo "Installing production dependencies..."
npm install --production --silent 2>/dev/null || pnpm install --prod --silent

# Create the .mcpb file
echo "Creating .mcpb bundle..."
zip -r ../reddit-mcp-server.mcpb . -q

# Clean up
cd ..
rm -rf bundle-temp

# Verify the bundle structure
echo "Verifying bundle structure..."
if unzip -l reddit-mcp-server.mcpb | grep -q "manifest.json"; then
    echo "manifest.json found at root level"
else
    echo "Error: manifest.json not at root level!"
    exit 1
fi

echo ""
echo "Desktop Extension created successfully!"
ls -lh reddit-mcp-server.mcpb
echo ""
echo "To use: Upload to GitHub Releases and users can download and open it."
