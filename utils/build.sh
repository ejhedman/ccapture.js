#!/bin/bash

./node_modules/uglify-js/bin/uglifyjs ../src/CCapture.js --compress --mangle -o ../build/CCapture.min.js

./node_modules/uglify-js/bin/uglifyjs ../src/webm-writer-0.2.0.js ../src/download.js ../src/tar.js ../src/gif.js ../src/CCapture.js --compress --mangle -o ../build/CCapture.all.min.js

./node_modules/uglify-js/bin/uglifyjs ../src/webm-writer-0.2.0.js ../src/download.js ../src/tar.js ../src/gif.js ../src/CCapture.js -o ../build/CCapture.js

cat ../src/webm-writer-0.2.0.js ../src/download.js ../src/tar.js ../src/gif.js ../src/CCapture.js > ../build/CCapture2.js
