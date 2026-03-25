#!/bin/bash
CURRENT_DATE=$(date +%Y%m%d-%H%M%S)
echo "Do you want to build a new image? (y/n)"
read answer
if [ "$answer" != "y" ]; then
    echo "Build cancelled."
    exit 0
fi
echo "Building image with tag: pdfpresentations:${CURRENT_DATE} in 3 seconds..."

# Update CACHE_NAME in data/public/sw.js
sed -i "s/const CACHE_NAME = '.*';/const CACHE_NAME = '${CURRENT_DATE}';/" data/public/sw.js
sed -i "s/const APP_VERSION = '.*';/const APP_VERSION = '${CURRENT_DATE}';/" data/js/app.js
echo "Updated CACHE_NAME in data/public/sw.js to ${CURRENT_DATE}"

sleep 3
docker build --build-arg BUILD_DATE="$(date '+%Y-%m-%d %H:%M')" -t pdfpresentations:${CURRENT_DATE} .
docker tag pdfpresentations:${CURRENT_DATE} pdfpresentations:latest
docker tag pdfpresentations:${CURRENT_DATE} pdfpresentations:latest-dev
echo "Build completed, tag: pdfpresentations:${CURRENT_DATE} and pdfpresentations:latest"
docker compose up -d
