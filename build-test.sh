#!/bin/bash
cd /tmp/org-os-dashboard

echo "Installing dependencies..."
npm install --silent

echo "Building project..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "Built files:"
    ls -la dist/
    echo ""
    echo "📁 Project ready for deployment"
    echo "🌐 Run 'npm run preview' to test locally"
else
    echo "❌ Build failed"
    exit 1
fi
