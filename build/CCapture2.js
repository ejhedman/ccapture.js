/**
 * A tool for presenting an ArrayBuffer as a stream for writing some simple data types.
 * 
 * By Nicholas Sherlock
 * 
 * Released under the WTFPLv2 https://en.wikipedia.org/wiki/WTFPL
 */

"use strict";

(function(){
    /*
     * Create an ArrayBuffer of the given length and present it as a writable stream with methods
     * for writing data in different formats.
     */
    var ArrayBufferDataStream = function(length) {
        this.data = new Uint8Array(length);
        this.pos = 0;
    };
    
    ArrayBufferDataStream.prototype.seek = function(offset) {
        this.pos = offset;
    };

    ArrayBufferDataStream.prototype.writeBytes = function(arr) {
        for (var i = 0; i < arr.length; i++) {
            this.data[this.pos++] = arr[i];
        }
    };

    ArrayBufferDataStream.prototype.writeByte = function(b) {
        this.data[this.pos++] = b;
    };
    
    //Synonym:
    ArrayBufferDataStream.prototype.writeU8 = ArrayBufferDataStream.prototype.writeByte;
    
    ArrayBufferDataStream.prototype.writeU16BE = function(u) {
        this.data[this.pos++] = u >> 8;
        this.data[this.pos++] = u;
    };

    ArrayBufferDataStream.prototype.writeDoubleBE = function(d) {
        var 
            bytes = new Uint8Array(new Float64Array([d]).buffer);
        
        for (var i = bytes.length - 1; i >= 0; i--) {
            this.writeByte(bytes[i]);
        }
    };

    ArrayBufferDataStream.prototype.writeFloatBE = function(d) {
        var 
            bytes = new Uint8Array(new Float32Array([d]).buffer);
        
        for (var i = bytes.length - 1; i >= 0; i--) {
            this.writeByte(bytes[i]);
        }
    };

    /**
     * Write an ASCII string to the stream
     */
    ArrayBufferDataStream.prototype.writeString = function(s) {
        for (var i = 0; i < s.length; i++) {
            this.data[this.pos++] = s.charCodeAt(i);
        }
    };

    /**
     * Write the given 32-bit integer to the stream as an EBML variable-length integer using the given byte width 
     * (use measureEBMLVarInt).
     * 
     * No error checking is performed to ensure that the supplied width is correct for the integer.
     * 
     * @param i Integer to be written
     * @param width Number of bytes to write to the stream
     */
    ArrayBufferDataStream.prototype.writeEBMLVarIntWidth = function(i, width) {
        switch (width) {
            case 1:
                this.writeU8((1 << 7) | i);
            break;
            case 2:
                this.writeU8((1 << 6) | (i >> 8));
                this.writeU8(i);
            break;
            case 3:
                this.writeU8((1 << 5) | (i >> 16));
                this.writeU8(i >> 8);
                this.writeU8(i);
            break;
            case 4:
                this.writeU8((1 << 4) | (i >> 24));
                this.writeU8(i >> 16);
                this.writeU8(i >> 8);
                this.writeU8(i);
            break;
            case 5:
                /* 
                 * JavaScript converts its doubles to 32-bit integers for bitwise operations, so we need to do a 
                 * division by 2^32 instead of a right-shift of 32 to retain those top 3 bits
                 */
                this.writeU8((1 << 3) | ((i / 4294967296) & 0x7)); 
                this.writeU8(i >> 24);
                this.writeU8(i >> 16);
                this.writeU8(i >> 8);
                this.writeU8(i);
            break;
            default:
                throw new RuntimeException("Bad EBML VINT size " + width);
        }
    };
    
    /**
     * Return the number of bytes needed to encode the given integer as an EBML VINT.
     */
    ArrayBufferDataStream.prototype.measureEBMLVarInt = function(val) {
        if (val < (1 << 7) - 1) { 
            /* Top bit is set, leaving 7 bits to hold the integer, but we can't store 127 because
             * "all bits set to one" is a reserved value. Same thing for the other cases below:
             */
            return 1;
        } else if (val < (1 << 14) - 1) {
            return 2;
        } else if (val < (1 << 21) - 1) {
            return 3;
        } else if (val < (1 << 28) - 1) {
            return 4;
        } else if (val < 34359738367) { // 2 ^ 35 - 1 (can address 32GB)
            return 5;
        } else {
            throw new RuntimeException("EBML VINT size not supported " + val);
        }
    };
    
    ArrayBufferDataStream.prototype.writeEBMLVarInt = function(i) {
        this.writeEBMLVarIntWidth(i, this.measureEBMLVarInt(i));
    };
    
    /**
     * Write the given unsigned 32-bit integer to the stream in big-endian order using the given byte width.
     * No error checking is performed to ensure that the supplied width is correct for the integer.
     * 
     * Omit the width parameter to have it determined automatically for you.
     * 
     * @param u Unsigned integer to be written
     * @param width Number of bytes to write to the stream
     */
    ArrayBufferDataStream.prototype.writeUnsignedIntBE = function(u, width) {
        if (width === undefined) {
            width = this.measureUnsignedInt(u);
        }
        
        // Each case falls through:
        switch (width) {
            case 5:
                this.writeU8(Math.floor(u / 4294967296)); // Need to use division to access >32 bits of floating point var
            case 4:
                this.writeU8(u >> 24);
            case 3:
                this.writeU8(u >> 16);
            case 2:
                this.writeU8(u >> 8);
            case 1:
                this.writeU8(u);
            break;
            default:
                throw new RuntimeException("Bad UINT size " + width);
        }
    };
    
    /**
     * Return the number of bytes needed to hold the non-zero bits of the given unsigned integer.
     */
    ArrayBufferDataStream.prototype.measureUnsignedInt = function(val) {
        // Force to 32-bit unsigned integer
        if (val < (1 << 8)) {
            return 1;
        } else if (val < (1 << 16)) {
            return 2;
        } else if (val < (1 << 24)) {
            return 3;
        } else if (val < 4294967296) {
            return 4;
        } else {
            return 5;
        }
    };

    /**
     * Return a view on the portion of the buffer from the beginning to the current seek position as a Uint8Array.
     */
    ArrayBufferDataStream.prototype.getAsDataArray = function() {
        if (this.pos < this.data.byteLength) {
            return this.data.subarray(0, this.pos);
        } else if (this.pos == this.data.byteLength) {
            return this.data;
        } else {
            throw "ArrayBufferDataStream's pos lies beyond end of buffer";
        }
    };
	
	if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
		module.exports = ArrayBufferDataStream;
	} else {
		window.ArrayBufferDataStream = ArrayBufferDataStream;
	}
}());"use strict";

/**
 * Allows a series of Blob-convertible objects (ArrayBuffer, Blob, String, etc) to be added to a buffer. Seeking and
 * overwriting of blobs is allowed.
 * 
 * You can supply a FileWriter, in which case the BlobBuffer is just used as temporary storage before it writes it 
 * through to the disk.
 * 
 * By Nicholas Sherlock
 * 
 * Released under the WTFPLv2 https://en.wikipedia.org/wiki/WTFPL
 */
(function() {
	var BlobBuffer = function(fs) {
		return function(destination) {
			var
				buffer = [],
				writePromise = Promise.resolve(),
				fileWriter = null,
				fd = null;
			
			if (typeof FileWriter !== "undefined" && destination instanceof FileWriter) {
				fileWriter = destination;
			} else if (fs && destination) {
				fd = destination;
			}
			
			// Current seek offset
			this.pos = 0;
			
			// One more than the index of the highest byte ever written
			this.length = 0;
			
			// Returns a promise that converts the blob to an ArrayBuffer
			function readBlobAsBuffer(blob) {
				return new Promise(function (resolve, reject) {
					var
						reader = new FileReader();
					
					reader.addEventListener("loadend", function () {
						resolve(reader.result);
					});
					
					reader.readAsArrayBuffer(blob);
				});
			}
			
			function convertToUint8Array(thing) {
				return new Promise(function (resolve, reject) {
					if (thing instanceof Uint8Array) {
						resolve(thing);
					} else if (thing instanceof ArrayBuffer || ArrayBuffer.isView(thing)) {
						resolve(new Uint8Array(thing));
					} else if (thing instanceof Blob) {
						resolve(readBlobAsBuffer(thing).then(function (buffer) {
							return new Uint8Array(buffer);
						}));
					} else {
						//Assume that Blob will know how to read this thing
						resolve(readBlobAsBuffer(new Blob([thing])).then(function (buffer) {
							return new Uint8Array(buffer);
						}));
					}
				});
			}
			
			function measureData(data) {
				var
					result = data.byteLength || data.length || data.size;
				
				if (!Number.isInteger(result)) {
					throw "Failed to determine size of element";
				}
				
				return result;
			}
			
			/**
			 * Seek to the given absolute offset.
			 *
			 * You may not seek beyond the end of the file (this would create a hole and/or allow blocks to be written in non-
			 * sequential order, which isn't currently supported by the memory buffer backend).
			 */
			this.seek = function (offset) {
				if (offset < 0) {
					throw "Offset may not be negative";
				}
				
				if (isNaN(offset)) {
					throw "Offset may not be NaN";
				}
				
				if (offset > this.length) {
					throw "Seeking beyond the end of file is not allowed";
				}
				
				this.pos = offset;
			};
			
			/**
			 * Write the Blob-convertible data to the buffer at the current seek position.
			 *
			 * Note: If overwriting existing data, the write must not cross preexisting block boundaries (written data must
			 * be fully contained by the extent of a previous write).
			 */
			this.write = function (data) {
				var
					newEntry = {
						offset: this.pos,
						data: data,
						length: measureData(data)
					},
					isAppend = newEntry.offset >= this.length;
				
				this.pos += newEntry.length;
				this.length = Math.max(this.length, this.pos);
				
				// After previous writes complete, perform our write
				writePromise = writePromise.then(function () {
					if (fd) {
						return new Promise(function(resolve, reject) {
							convertToUint8Array(newEntry.data).then(function(dataArray) {
								var
									totalWritten = 0,
									buffer = Buffer.from(dataArray.buffer),
									
									handleWriteComplete = function(err, written, buffer) {
										totalWritten += written;
										
										if (totalWritten >= buffer.length) {
											resolve();
										} else {
											// We still have more to write...
											fs.write(fd, buffer, totalWritten, buffer.length - totalWritten, newEntry.offset + totalWritten, handleWriteComplete);
										}
									};
								
								fs.write(fd, buffer, 0, buffer.length, newEntry.offset, handleWriteComplete);
							});
						});
					} else if (fileWriter) {
						return new Promise(function (resolve, reject) {
							fileWriter.onwriteend = resolve;
							
							fileWriter.seek(newEntry.offset);
							fileWriter.write(new Blob([newEntry.data]));
						});
					} else if (!isAppend) {
						// We might be modifying a write that was already buffered in memory.
						
						// Slow linear search to find a block we might be overwriting
						for (var i = 0; i < buffer.length; i++) {
							var
								entry = buffer[i];
							
							// If our new entry overlaps the old one in any way...
							if (!(newEntry.offset + newEntry.length <= entry.offset || newEntry.offset >= entry.offset + entry.length)) {
								if (newEntry.offset < entry.offset || newEntry.offset + newEntry.length > entry.offset + entry.length) {
									throw new Error("Overwrite crosses blob boundaries");
								}
								
								if (newEntry.offset == entry.offset && newEntry.length == entry.length) {
									// We overwrote the entire block
									entry.data = newEntry.data;
									
									// We're done
									return;
								} else {
									return convertToUint8Array(entry.data)
										.then(function (entryArray) {
											entry.data = entryArray;
											
											return convertToUint8Array(newEntry.data);
										}).then(function (newEntryArray) {
											newEntry.data = newEntryArray;
											
											entry.data.set(newEntry.data, newEntry.offset - entry.offset);
										});
								}
							}
						}
						// Else fall through to do a simple append, as we didn't overwrite any pre-existing blocks
					}
					
					buffer.push(newEntry);
				});
			};
			
			/**
			 * Finish all writes to the buffer, returning a promise that signals when that is complete.
			 *
			 * If a FileWriter was not provided, the promise is resolved with a Blob that represents the completed BlobBuffer
			 * contents. You can optionally pass in a mimeType to be used for this blob.
			 *
			 * If a FileWriter was provided, the promise is resolved with null as the first argument.
			 */
			this.complete = function (mimeType) {
				if (fd || fileWriter) {
					writePromise = writePromise.then(function () {
						return null;
					});
				} else {
					// After writes complete we need to merge the buffer to give to the caller
					writePromise = writePromise.then(function () {
						var
							result = [];
						
						for (var i = 0; i < buffer.length; i++) {
							result.push(buffer[i].data);
						}
						
						return new Blob(result, {mimeType: mimeType});
					});
				}
				
				return writePromise;
			};
		};
	};
	
	if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
		module.exports = BlobBuffer(require('fs'));
	} else {
		window.BlobBuffer = BlobBuffer(null);
	}
})();/**
 * WebM video encoder for Google Chrome. This implementation is suitable for creating very large video files, because
 * it can stream Blobs directly to a FileWriter without buffering the entire video in memory.
 * 
 * When FileWriter is not available or not desired, it can buffer the video in memory as a series of Blobs which are 
 * eventually returned as one composite Blob.
 * 
 * By Nicholas Sherlock.
 * 
 * Based on the ideas from Whammy: https://github.com/antimatter15/whammy
 * 
 * Released under the WTFPLv2 https://en.wikipedia.org/wiki/WTFPL
 */

"use strict";

(function() {
    var WebMWriter = function(ArrayBufferDataStream, BlobBuffer) {
        function extend(base, top) {
            var
                target = {};
            
            [base, top].forEach(function(obj) {
                for (var prop in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                        target[prop] = obj[prop];
                    }
                }
            });
            
            return target;
        }
        
        /**
         * Decode a Base64 data URL into a binary string.
         *
         * Returns the binary string, or false if the URL could not be decoded.
         */
        function decodeBase64WebPDataURL(url) {
            if (typeof url !== "string" || !url.match(/^data:image\/webp;base64,/i)) {
                return false;
            }
            
            return window.atob(url.substring("data:image\/webp;base64,".length));
        }
        
        /**
         * Convert a raw binary string (one character = one output byte) to an ArrayBuffer
         */
        function stringToArrayBuffer(string) {
            var
                buffer = new ArrayBuffer(string.length),
                int8Array = new Uint8Array(buffer);
            
            for (var i = 0; i < string.length; i++) {
                int8Array[i] = string.charCodeAt(i);
            }
            
            return buffer;
        }
        
        /**
         * Convert the given canvas to a WebP encoded image and return the image data as a string.
         */
        function renderAsWebP(canvas, quality) {
            var
                frame = canvas.toDataURL('image/webp', {quality: quality});
            
            return decodeBase64WebPDataURL(frame);
        }
        
        function extractKeyframeFromWebP(webP) {
            // Assume that Chrome will generate a Simple Lossy WebP which has this header:
            var
                keyframeStartIndex = webP.indexOf('VP8 ');
            
            if (keyframeStartIndex == -1) {
                throw "Failed to identify beginning of keyframe in WebP image";
            }
            
            // Skip the header and the 4 bytes that encode the length of the VP8 chunk
            keyframeStartIndex += 'VP8 '.length + 4;
            
            return webP.substring(keyframeStartIndex);
        }
        
        // Just a little utility so we can tag values as floats for the EBML encoder's benefit
        function EBMLFloat32(value) {
            this.value = value;
        }
        
        function EBMLFloat64(value) {
            this.value = value;
        }
        
        /**
         * Write the given EBML object to the provided ArrayBufferStream.
         *
         * The buffer's first byte is at bufferFileOffset inside the video file. This is used to complete offset and
         * dataOffset fields in each EBML structure, indicating the file offset of the first byte of the EBML element and
         * its data payload.
         */
        function writeEBML(buffer, bufferFileOffset, ebml) {
            // Is the ebml an array of sibling elements?
            if (Array.isArray(ebml)) {
                for (var i = 0; i < ebml.length; i++) {
                    writeEBML(buffer, bufferFileOffset, ebml[i]);
                }
            // Is this some sort of raw data that we want to write directly?
            } else if (typeof ebml === "string") {
                buffer.writeString(ebml);
            } else if (ebml instanceof Uint8Array) {
                buffer.writeBytes(ebml);
            } else if (ebml.id){
                // We're writing an EBML element
                ebml.offset = buffer.pos + bufferFileOffset;
                
                buffer.writeUnsignedIntBE(ebml.id); // ID field
                
                // Now we need to write the size field, so we must know the payload size:
                
                if (Array.isArray(ebml.data)) {
                    // Writing an array of child elements. We won't try to measure the size of the children up-front
                    
                    var
                        sizePos, dataBegin, dataEnd;
                    
                    if (ebml.size === -1) {
                        // Write the reserved all-one-bits marker to note that the size of this element is unknown/unbounded
                        buffer.writeByte(0xFF);
                    } else {
                        sizePos = buffer.pos;
                        
                        /* Write a dummy size field to overwrite later. 4 bytes allows an element maximum size of 256MB,
                         * which should be plenty (we don't want to have to buffer that much data in memory at one time
                         * anyway!)
                         */
                        buffer.writeBytes([0, 0, 0, 0]);
                    }
                    
                    dataBegin = buffer.pos;
                    
                    ebml.dataOffset = dataBegin + bufferFileOffset;
                    writeEBML(buffer, bufferFileOffset, ebml.data);
                    
                    if (ebml.size !== -1) {
                        dataEnd = buffer.pos;
                        
                        ebml.size = dataEnd - dataBegin;
                        
                        buffer.seek(sizePos);
                        buffer.writeEBMLVarIntWidth(ebml.size, 4); // Size field
                        
                        buffer.seek(dataEnd);
                    }
                } else if (typeof ebml.data === "string") {
                    buffer.writeEBMLVarInt(ebml.data.length); // Size field
                    ebml.dataOffset = buffer.pos + bufferFileOffset;
                    buffer.writeString(ebml.data);
                } else if (typeof ebml.data === "number") {
                    // Allow the caller to explicitly choose the size if they wish by supplying a size field
                    if (!ebml.size) {
                        ebml.size = buffer.measureUnsignedInt(ebml.data);
                    }
                    
                    buffer.writeEBMLVarInt(ebml.size); // Size field
                    ebml.dataOffset = buffer.pos + bufferFileOffset;
                    buffer.writeUnsignedIntBE(ebml.data, ebml.size);
                } else if (ebml.data instanceof EBMLFloat64) {
                    buffer.writeEBMLVarInt(8); // Size field
                    ebml.dataOffset = buffer.pos + bufferFileOffset;
                    buffer.writeDoubleBE(ebml.data.value);
                } else if (ebml.data instanceof EBMLFloat32) {
                    buffer.writeEBMLVarInt(4); // Size field
                    ebml.dataOffset = buffer.pos + bufferFileOffset;
                    buffer.writeFloatBE(ebml.data.value);
                } else if (ebml.data instanceof Uint8Array) {
                    buffer.writeEBMLVarInt(ebml.data.byteLength); // Size field
                    ebml.dataOffset = buffer.pos + bufferFileOffset;
                    buffer.writeBytes(ebml.data);
                } else {
                    throw "Bad EBML datatype " + typeof ebml.data;
                }
            } else {
                throw "Bad EBML datatype " + typeof ebml.data;
            }
        }
        
        return function(options) {
            var
                MAX_CLUSTER_DURATION_MSEC = 5000,
                DEFAULT_TRACK_NUMBER = 1,
            
                writtenHeader = false,
                videoWidth, videoHeight,
                
                clusterFrameBuffer = [],
                clusterStartTime = 0,
                clusterDuration = 0,
                
                optionDefaults = {
                    quality: 0.95,       // WebM image quality from 0.0 (worst) to 1.0 (best)
                    fileWriter: null,    // Chrome FileWriter in order to stream to a file instead of buffering to memory (optional)
                    fd: null,            // Node.JS file descriptor to write to instead of buffering (optional)
                    
                    // You must supply one of:
                    frameDuration: null, // Duration of frames in milliseconds
                    frameRate: null,     // Number of frames per second
                },
                
                seekPoints = {
                    Cues: {id: new Uint8Array([0x1C, 0x53, 0xBB, 0x6B]), positionEBML: null},
                    SegmentInfo: {id: new Uint8Array([0x15, 0x49, 0xA9, 0x66]), positionEBML: null},
                    Tracks: {id: new Uint8Array([0x16, 0x54, 0xAE, 0x6B]), positionEBML: null},
                },
                
                ebmlSegment,
                segmentDuration = {
                    "id": 0x4489, // Duration
                    "data": new EBMLFloat64(0)
                },
                
                seekHead,
                
                cues = [],
                
                blobBuffer = new BlobBuffer(options.fileWriter || options.fd);
    
            function fileOffsetToSegmentRelative(fileOffset) {
                return fileOffset - ebmlSegment.dataOffset;
            }
            
            /**
             * Create a SeekHead element with descriptors for the points in the global seekPoints array.
             *
             * 5 bytes of position values are reserved for each node, which lie at the offset point.positionEBML.dataOffset,
             * to be overwritten later.
             */
            function createSeekHead() {
                var
                    seekPositionEBMLTemplate = {
                        "id": 0x53AC, // SeekPosition
                        "size": 5, // Allows for 32GB video files
                        "data": 0 // We'll overwrite this when the file is complete
                    },
                    
                    result = {
                        "id": 0x114D9B74, // SeekHead
                        "data": []
                    };
                
                for (var name in seekPoints) {
                    var
                        seekPoint = seekPoints[name];
                
                    seekPoint.positionEBML = Object.create(seekPositionEBMLTemplate);
                    
                    result.data.push({
                         "id": 0x4DBB, // Seek
                         "data": [
                              {
                                  "id": 0x53AB, // SeekID
                                  "data": seekPoint.id
                              },
                              seekPoint.positionEBML
                         ]
                    });
                }
                
                return result;
            }
            
            /**
             * Write the WebM file header to the stream.
             */
            function writeHeader() {
                seekHead = createSeekHead();
                
                var
                    ebmlHeader = {
                        "id": 0x1a45dfa3, // EBML
                        "data": [
                            {
                                "id": 0x4286, // EBMLVersion
                                "data": 1
                            },
                            {
                                "id": 0x42f7, // EBMLReadVersion
                                "data": 1
                            },
                            {
                                "id": 0x42f2, // EBMLMaxIDLength
                                "data": 4
                            },
                            {
                                "id": 0x42f3, // EBMLMaxSizeLength
                                "data": 8
                            },
                            {
                                "id": 0x4282, // DocType
                                "data": "webm"
                            },
                            {
                                "id": 0x4287, // DocTypeVersion
                                "data": 2
                            },
                            {
                                "id": 0x4285, // DocTypeReadVersion
                                "data": 2
                            }
                        ]
                    },
                    
                    segmentInfo = {
                        "id": 0x1549a966, // Info
                        "data": [
                            {
                                "id": 0x2ad7b1, // TimecodeScale
                                "data": 1e6 // Times will be in miliseconds (1e6 nanoseconds per step = 1ms)
                            },
                            {
                                "id": 0x4d80, // MuxingApp
                                "data": "webm-writer-js",
                            },
                            {
                                "id": 0x5741, // WritingApp
                                "data": "webm-writer-js"
                            },
                            segmentDuration // To be filled in later
                        ]
                    },
                    
                    tracks = {
                        "id": 0x1654ae6b, // Tracks
                        "data": [
                            {
                                "id": 0xae, // TrackEntry
                                "data": [
                                    {
                                        "id": 0xd7, // TrackNumber
                                        "data": DEFAULT_TRACK_NUMBER
                                    },
                                    {
                                        "id": 0x73c5, // TrackUID
                                        "data": DEFAULT_TRACK_NUMBER
                                    },
                                    {
                                        "id": 0x9c, // FlagLacing
                                        "data": 0
                                    },
                                    {
                                        "id": 0x22b59c, // Language
                                        "data": "und"
                                    },
                                    {
                                        "id": 0x86, // CodecID
                                        "data": "V_VP8"
                                    },
                                    {
                                        "id": 0x258688, // CodecName
                                        "data": "VP8"
                                    },
                                    {
                                        "id": 0x83, // TrackType
                                        "data": 1
                                    },
                                    {
                                        "id": 0xe0,  // Video
                                        "data": [
                                            {
                                                "id": 0xb0, // PixelWidth
                                                "data": videoWidth
                                            },
                                            {
                                                "id": 0xba, // PixelHeight
                                                "data": videoHeight
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    };
                
                ebmlSegment = {
                    "id": 0x18538067, // Segment
                    "size": -1, // Unbounded size
                    "data": [
                        seekHead,
                        segmentInfo,
                        tracks,
                    ]
                };
                
                var
                    bufferStream = new ArrayBufferDataStream(256);
                    
                writeEBML(bufferStream, blobBuffer.pos, [ebmlHeader, ebmlSegment]);
                blobBuffer.write(bufferStream.getAsDataArray());
                
                // Now we know where these top-level elements lie in the file:
                seekPoints.SegmentInfo.positionEBML.data = fileOffsetToSegmentRelative(segmentInfo.offset);
                seekPoints.Tracks.positionEBML.data = fileOffsetToSegmentRelative(tracks.offset);
            };
            
            /**
             * Create a SimpleBlock keyframe header using these fields:
             *     timecode    - Time of this keyframe
             *     trackNumber - Track number from 1 to 126 (inclusive)
             *     frame       - Raw frame data payload string
             *
             * Returns an EBML element.
             */
            function createKeyframeBlock(keyframe) {
                var
                    bufferStream = new ArrayBufferDataStream(1 + 2 + 1);
                
                if (!(keyframe.trackNumber > 0 && keyframe.trackNumber < 127)) {
                    throw "TrackNumber must be > 0 and < 127";
                }
    
                bufferStream.writeEBMLVarInt(keyframe.trackNumber); // Always 1 byte since we limit the range of trackNumber
                bufferStream.writeU16BE(keyframe.timecode);
                
                // Flags byte
                bufferStream.writeByte(
                    1 << 7 // Keyframe
                );
                
                return {
                    "id": 0xA3, // SimpleBlock
                    "data": [
                         bufferStream.getAsDataArray(),
                         keyframe.frame
                    ]
                };
            }
            
            /**
             * Create a Cluster node using these fields:
             *
             *    timecode    - Start time for the cluster
             *
             * Returns an EBML element.
             */
            function createCluster(cluster) {
                return {
                    "id": 0x1f43b675,
                    "data": [
                         {
                            "id": 0xe7, // Timecode
                            "data": Math.round(cluster.timecode)
                         }
                    ]
                };
            }
            
            function addCuePoint(trackIndex, clusterTime, clusterFileOffset) {
                cues.push({
                    "id": 0xBB, // Cue
                    "data": [
                         {
                             "id": 0xB3, // CueTime
                             "data": clusterTime
                         },
                         {
                             "id": 0xB7, // CueTrackPositions
                             "data": [
                                  {
                                      "id": 0xF7, // CueTrack
                                      "data": trackIndex
                                  },
                                  {
                                      "id": 0xF1, // CueClusterPosition
                                      "data": fileOffsetToSegmentRelative(clusterFileOffset)
                                  }
                             ]
                         }
                    ]
                });
            }
            
            /**
             * Write a Cues element to the blobStream using the global `cues` array of CuePoints (use addCuePoint()).
             * The seek entry for the Cues in the SeekHead is updated.
             */
            function writeCues() {
                var
                    ebml = {
                        "id": 0x1C53BB6B,
                        "data": cues
                    },
                    
                    cuesBuffer = new ArrayBufferDataStream(16 + cues.length * 32); // Pretty crude estimate of the buffer size we'll need
                
                writeEBML(cuesBuffer, blobBuffer.pos, ebml);
                blobBuffer.write(cuesBuffer.getAsDataArray());
                
                // Now we know where the Cues element has ended up, we can update the SeekHead
                seekPoints.Cues.positionEBML.data = fileOffsetToSegmentRelative(ebml.offset);
            }
            
            /**
             * Flush the frames in the current clusterFrameBuffer out to the stream as a Cluster.
             */
            function flushClusterFrameBuffer() {
                if (clusterFrameBuffer.length == 0) {
                    return;
                }
    
                // First work out how large of a buffer we need to hold the cluster data
                var
                    rawImageSize = 0;
                
                for (var i = 0; i < clusterFrameBuffer.length; i++) {
                    rawImageSize += clusterFrameBuffer[i].frame.length;
                }
                
                var
                    buffer = new ArrayBufferDataStream(rawImageSize + clusterFrameBuffer.length * 32), // Estimate 32 bytes per SimpleBlock header
    
                    cluster = createCluster({
                        timecode: Math.round(clusterStartTime),
                    });
                    
                for (var i = 0; i < clusterFrameBuffer.length; i++) {
                    cluster.data.push(createKeyframeBlock(clusterFrameBuffer[i]));
                }
                
                writeEBML(buffer, blobBuffer.pos, cluster);
                blobBuffer.write(buffer.getAsDataArray());
                
                addCuePoint(DEFAULT_TRACK_NUMBER, Math.round(clusterStartTime), cluster.offset);
                
                clusterFrameBuffer = [];
                clusterStartTime += clusterDuration;
                clusterDuration = 0;
            }
            
            function validateOptions() {
                // Derive frameDuration setting if not already supplied
                if (!options.frameDuration) {
                    if (options.frameRate) {
                        options.frameDuration = 1000 / options.frameRate;
                    } else {
                        throw "Missing required frameDuration or frameRate setting";
                    }
                }
            }
            
            function addFrameToCluster(frame) {
                frame.trackNumber = DEFAULT_TRACK_NUMBER;
                
                // Frame timecodes are relative to the start of their cluster:
                frame.timecode = Math.round(clusterDuration);
    
                clusterFrameBuffer.push(frame);
                
                clusterDuration += frame.duration;
                
                if (clusterDuration >= MAX_CLUSTER_DURATION_MSEC) {
                    flushClusterFrameBuffer();
                }
            }
            
            /**
             * Rewrites the SeekHead element that was initially written to the stream with the offsets of top level elements.
             *
             * Call once writing is complete (so the offset of all top level elements is known).
             */
            function rewriteSeekHead() {
                var
                    seekHeadBuffer = new ArrayBufferDataStream(seekHead.size),
                    oldPos = blobBuffer.pos;
                
                // Write the rewritten SeekHead element's data payload to the stream (don't need to update the id or size)
                writeEBML(seekHeadBuffer, seekHead.dataOffset, seekHead.data);
                
                // And write that through to the file
                blobBuffer.seek(seekHead.dataOffset);
                blobBuffer.write(seekHeadBuffer.getAsDataArray());
    
                blobBuffer.seek(oldPos);
            }
            
            /**
             * Rewrite the Duration field of the Segment with the newly-discovered video duration.
             */
            function rewriteDuration() {
                var
                    buffer = new ArrayBufferDataStream(8),
                    oldPos = blobBuffer.pos;
                
                // Rewrite the data payload (don't need to update the id or size)
                buffer.writeDoubleBE(clusterStartTime);
                
                // And write that through to the file
                blobBuffer.seek(segmentDuration.dataOffset);
                blobBuffer.write(buffer.getAsDataArray());
        
                blobBuffer.seek(oldPos);
            }
            
            /**
             * Add a frame to the video. Currently the frame must be a Canvas element.
             */
            this.addFrame = function(canvas) {
                if (writtenHeader) {
                    if (canvas.width != videoWidth || canvas.height != videoHeight) {
                        throw "Frame size differs from previous frames";
                    }
                } else {
                    videoWidth = canvas.width;
                    videoHeight = canvas.height;
    
                    writeHeader();
                    writtenHeader = true;
                }
    
                var
                    webP = renderAsWebP(canvas, {quality: options.quality});
                
                if (!webP) {
                    throw "Couldn't decode WebP frame, does the browser support WebP?";
                }
                
                addFrameToCluster({
                    frame: extractKeyframeFromWebP(webP),
                    duration: options.frameDuration
                });
            };
            
            /**
             * Finish writing the video and return a Promise to signal completion.
             *
             * If the destination device was memory (i.e. options.fileWriter was not supplied), the Promise is resolved with
             * a Blob with the contents of the entire video.
             */
            this.complete = function() {
                flushClusterFrameBuffer();
                
                writeCues();
                rewriteSeekHead();
                rewriteDuration();
                
                return blobBuffer.complete('video/webm');
            };
            
            this.getWrittenSize = function() {
                return blobBuffer.length;
            };
    
            options = extend(optionDefaults, options || {});
            validateOptions();
        };
    };

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	    module.exports = WebMWriter(require("./ArrayBufferDataStream"), require("./BlobBuffer"));
    } else {
	    window.WebMWriter = WebMWriter(ArrayBufferDataStream, BlobBuffer);
    }
})();
//download.js v3.0, by dandavis; 2008-2014. [CCBY2] see http://danml.com/download.html for tests/usage
// v1 landed a FF+Chrome compat way of downloading strings to local un-named files, upgraded to use a hidden frame and optional mime
// v2 added named files via a[download], msSaveBlob, IE (10+) support, and window.URL support for larger+faster saves than dataURLs
// v3 added dataURL and Blob Input, bind-toggle arity, and legacy dataURL fallback was improved with force-download mime and base64 support

// data can be a string, Blob, File, or dataURL

		 
						 
						 
function download(data, strFileName, strMimeType) {
	
	var self = window, // this script is only for browsers anyway...
		u = "application/octet-stream", // this default mime also triggers iframe downloads
		m = strMimeType || u, 
		x = data,
		D = document,
		a = D.createElement("a"),
		z = function(a){return String(a);},
		
		
		B = self.Blob || self.MozBlob || self.WebKitBlob || z,
		BB = self.MSBlobBuilder || self.WebKitBlobBuilder || self.BlobBuilder,
		fn = strFileName || "download",
		blob, 
		b,
		ua,
		fr;

	//if(typeof B.bind === 'function' ){ B=B.bind(self); }
	
	if(String(this)==="true"){ //reverse arguments, allowing download.bind(true, "text/xml", "export.xml") to act as a callback
		x=[x, m];
		m=x[0];
		x=x[1]; 
	}
	
	
	
	//go ahead and download dataURLs right away
	if(String(x).match(/^data\:[\w+\-]+\/[\w+\-]+[,;]/)){
		return navigator.msSaveBlob ?  // IE10 can't do a[download], only Blobs:
			navigator.msSaveBlob(d2b(x), fn) : 
			saver(x) ; // everyone else can save dataURLs un-processed
	}//end if dataURL passed?
	
	try{
	
		blob = x instanceof B ? 
			x : 
			new B([x], {type: m}) ;
	}catch(y){
		if(BB){
			b = new BB();
			b.append([x]);
			blob = b.getBlob(m); // the blob
		}
		
	}
	
	
	
	function d2b(u) {
		var p= u.split(/[:;,]/),
		t= p[1],
		dec= p[2] == "base64" ? atob : decodeURIComponent,
		bin= dec(p.pop()),
		mx= bin.length,
		i= 0,
		uia= new Uint8Array(mx);

		for(i;i<mx;++i) uia[i]= bin.charCodeAt(i);

		return new B([uia], {type: t});
	 }
	  
	function saver(url, winMode){
		
		
		if ('download' in a) { //html5 A[download] 			
			a.href = url;
			a.setAttribute("download", fn);
			a.innerHTML = "downloading...";
			a.style.display = 'none';
			D.body.appendChild(a);
			setTimeout(function() {
				a.click();
				D.body.removeChild(a);
				if(winMode===true){setTimeout(function(){ self.URL.revokeObjectURL(a.href);}, 250 );}
			}, 66);
			return true;
		}
		
		//do iframe dataURL download (old ch+FF):
		var f = D.createElement("iframe");
		D.body.appendChild(f);
		if(!winMode){ // force a mime that will download:
			url="data:"+url.replace(/^data:([\w\/\-\+]+)/, u);
		}
		 
	
		f.src = url;
		setTimeout(function(){ D.body.removeChild(f); }, 333);
		
	}//end saver 
		

	if (navigator.msSaveBlob) { // IE10+ : (has Blob, but not a[download] or URL)
		return navigator.msSaveBlob(blob, fn);
	} 	
	
	if(self.URL){ // simple fast and modern way using Blob and URL:
		saver(self.URL.createObjectURL(blob), true);
	}else{
		// handle non-Blob()+non-URL browsers:
		if(typeof blob === "string" || blob.constructor===z ){
			try{
				return saver( "data:" +  m   + ";base64,"  +  self.btoa(blob)  ); 
			}catch(y){
				return saver( "data:" +  m   + "," + encodeURIComponent(blob)  ); 
			}
		}
		
		// Blob but not URL:
		fr=new FileReader();
		fr.onload=function(e){
			saver(this.result); 
		};
		fr.readAsDataURL(blob);
	}	
	return true;
} /* end download() */
(function () {
	"use strict";

	var lookup = [
			'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
			'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
			'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
			'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f',
			'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
			'o', 'p', 'q', 'r', 's', 't', 'u', 'v',
			'w', 'x', 'y', 'z', '0', '1', '2', '3',
			'4', '5', '6', '7', '8', '9', '+', '/'
		];
	function clean(length) {
		var i, buffer = new Uint8Array(length);
		for (i = 0; i < length; i += 1) {
			buffer[i] = 0;
		}
		return buffer;
	}

	function extend(orig, length, addLength, multipleOf) {
		var newSize = length + addLength,
			buffer = clean((parseInt(newSize / multipleOf) + 1) * multipleOf);

		buffer.set(orig);

		return buffer;
	}

	function pad(num, bytes, base) {
		num = num.toString(base || 8);
		return "000000000000".substr(num.length + 12 - bytes) + num;
	}	
	
	function stringToUint8 (input, out, offset) {
		var i, length;

		out = out || clean(input.length);

		offset = offset || 0;
		for (i = 0, length = input.length; i < length; i += 1) {
			out[offset] = input.charCodeAt(i);
			offset += 1;
		}

		return out;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// this prevents an ERR_INVALID_URL in Chrome (Firefox okay)
		switch (output.length % 4) {
			case 1:
				output += '=';
				break;
			case 2:
				output += '==';
				break;
			default:
				break;
		}

		return output;
	}

	window.utils = {}
	window.utils.clean = clean;
	window.utils.pad = pad;
	window.utils.extend = extend;
	window.utils.stringToUint8 = stringToUint8;
	window.utils.uint8ToBase64 = uint8ToBase64;
}());

(function () {
	"use strict";
	
/*
struct posix_header {             // byte offset
	char name[100];               //   0
	char mode[8];                 // 100
	char uid[8];                  // 108
	char gid[8];                  // 116
	char size[12];                // 124
	char mtime[12];               // 136
	char chksum[8];               // 148
	char typeflag;                // 156
	char linkname[100];           // 157
	char magic[6];                // 257
	char version[2];              // 263
	char uname[32];               // 265
	char gname[32];               // 297
	char devmajor[8];             // 329
	char devminor[8];             // 337
	char prefix[155];             // 345
                                  // 500
};
*/

	var utils = window.utils,
		headerFormat;
	
	headerFormat = [
		{
			'field': 'fileName',
			'length': 100
		},
		{
			'field': 'fileMode',
			'length': 8
		},
		{
			'field': 'uid',
			'length': 8
		},
		{
			'field': 'gid',
			'length': 8
		},
		{
			'field': 'fileSize',
			'length': 12
		},
		{
			'field': 'mtime',
			'length': 12
		},
		{
			'field': 'checksum',
			'length': 8
		},
		{
			'field': 'type',
			'length': 1
		},
		{
			'field': 'linkName',
			'length': 100
		},
		{
			'field': 'ustar',
			'length': 8
		},
		{
			'field': 'owner',
			'length': 32
		},
		{
			'field': 'group',
			'length': 32
		},
		{
			'field': 'majorNumber',
			'length': 8
		},
		{
			'field': 'minorNumber',
			'length': 8
		},
		{
			'field': 'filenamePrefix',
			'length': 155
		},
		{
			'field': 'padding',
			'length': 12
		}
	];

	function formatHeader(data, cb) {
		var buffer = utils.clean(512),
			offset = 0;

		headerFormat.forEach(function (value) {
			var str = data[value.field] || "",
				i, length;

			for (i = 0, length = str.length; i < length; i += 1) {
				buffer[offset] = str.charCodeAt(i);
				offset += 1;
			}

			offset += value.length - i; // space it out with nulls
		});

		if (typeof cb === 'function') {
			return cb(buffer, offset);
		}
		return buffer;
	}
	
	window.header = {}
	window.header.structure = headerFormat;
	window.header.format = formatHeader;
}());

(function () {
	"use strict";

	var header = window.header,
		utils = window.utils,
		recordSize = 512,
		blockSize;
	
	function Tar(recordsPerBlock) {
		this.written = 0;
		blockSize = (recordsPerBlock || 20) * recordSize;
		this.out = utils.clean(blockSize);
		this.blocks = [];
		this.length = 0;
	}

	Tar.prototype.append = function (filepath, input, opts, callback) {
		var data,
			checksum,
			mode,
			mtime,
			uid,
			gid,
			headerArr;

		if (typeof input === 'string') {
			input = utils.stringToUint8(input);
		} else if (input.constructor !== Uint8Array.prototype.constructor) {
			throw 'Invalid input type. You gave me: ' + input.constructor.toString().match(/function\s*([$A-Za-z_][0-9A-Za-z_]*)\s*\(/)[1];
		}

		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}

		opts = opts || {};

		mode = opts.mode || parseInt('777', 8) & 0xfff;
		mtime = opts.mtime || Math.floor(+new Date() / 1000);
		uid = opts.uid || 0;
		gid = opts.gid || 0;

		data = {
			fileName: filepath,
			fileMode: utils.pad(mode, 7),
			uid: utils.pad(uid, 7),
			gid: utils.pad(gid, 7),
			fileSize: utils.pad(input.length, 11),
			mtime: utils.pad(mtime, 11),
			checksum: '        ',
			type: '0', // just a file
			ustar: 'ustar  ',
			owner: opts.owner || '',
			group: opts.group || ''
		};

		// calculate the checksum
		checksum = 0;
		Object.keys(data).forEach(function (key) {
			var i, value = data[key], length;

			for (i = 0, length = value.length; i < length; i += 1) {
				checksum += value.charCodeAt(i);
			}
		});

		data.checksum = utils.pad(checksum, 6) + "\u0000 ";

		headerArr = header.format(data);

		var headerLength = Math.ceil( headerArr.length / recordSize ) * recordSize; 
		var inputLength = Math.ceil( input.length / recordSize ) * recordSize;

		this.blocks.push( { header: headerArr, input: input, headerLength: headerLength, inputLength: inputLength } );

	};

	Tar.prototype.save = function() {

		var buffers = [];
		var chunks = [];
		var length = 0;
		var max = Math.pow( 2, 20 );

		var chunk = [];
		this.blocks.forEach( function( b ) {
			if( length + b.headerLength + b.inputLength > max ) {
				chunks.push( { blocks: chunk, length: length } );
				chunk = [];
				length = 0;
			}
			chunk.push( b );
			length += b.headerLength + b.inputLength;
		} );
		chunks.push( { blocks: chunk, length: length } );

		chunks.forEach( function( c ) {

			var buffer = new Uint8Array( c.length );
			var written = 0;
			c.blocks.forEach( function( b ) {
				buffer.set( b.header, written );
				written += b.headerLength;
				buffer.set( b.input, written );
				written += b.inputLength;
			} );
			buffers.push( buffer );

		} );

		buffers.push( new Uint8Array( 2 * recordSize ) );

		return new Blob( buffers, { type: 'octet/stream' } );
		
	};

	Tar.prototype.clear = function () {
		this.written = 0;
		this.out = utils.clean(blockSize);
	};

	window.Tar = Tar;
}());
(function(c){function a(b,d){if({}.hasOwnProperty.call(a.cache,b))return a.cache[b];var e=a.resolve(b);if(!e)throw new Error('Failed to resolve module '+b);var c={id:b,require:a,filename:b,exports:{},loaded:!1,parent:d,children:[]};d&&d.children.push(c);var f=b.slice(0,b.lastIndexOf('/')+1);return a.cache[b]=c.exports,e.call(c.exports,c,c.exports,f,b),c.loaded=!0,a.cache[b]=c.exports}a.modules={},a.cache={},a.resolve=function(b){return{}.hasOwnProperty.call(a.modules,b)?a.modules[b]:void 0},a.define=function(b,c){a.modules[b]=c};var b=function(a){return a='/',{title:'browser',version:'v0.10.26',browser:!0,env:{},argv:[],nextTick:c.setImmediate||function(a){setTimeout(a,0)},cwd:function(){return a},chdir:function(b){a=b}}}();a.define('/gif.coffee',function(d,m,l,k){function g(a,b){return{}.hasOwnProperty.call(a,b)}function j(d,b){for(var a=0,c=b.length;a<c;++a)if(a in b&&b[a]===d)return!0;return!1}function i(a,b){function d(){this.constructor=a}for(var c in b)g(b,c)&&(a[c]=b[c]);return d.prototype=b.prototype,a.prototype=new d,a.__super__=b.prototype,a}var h,c,f,b,e;f=a('events',d).EventEmitter,h=a('/browser.coffee',d),e=function(d){function a(d){var a,b;this.running=!1,this.options={},this.frames=[],this.freeWorkers=[],this.activeWorkers=[],this.setOptions(d);for(a in c)b=c[a],null!=this.options[a]?this.options[a]:this.options[a]=b}return i(a,d),c={workerScript:'gif.worker.js',workers:2,repeat:0,background:'#fff',quality:10,width:null,height:null,transparent:null},b={delay:500,copy:!1},a.prototype.setOption=function(a,b){return this.options[a]=b,null!=this._canvas&&(a==='width'||a==='height')?this._canvas[a]=b:void 0},a.prototype.setOptions=function(b){var a,c;return function(d){for(a in b){if(!g(b,a))continue;c=b[a],d.push(this.setOption(a,c))}return d}.call(this,[])},a.prototype.addFrame=function(a,d){var c,e;null==d&&(d={}),c={},c.transparent=this.options.transparent;for(e in b)c[e]=d[e]||b[e];if(null!=this.options.width||this.setOption('width',a.width),null!=this.options.height||this.setOption('height',a.height),'undefined'!==typeof ImageData&&null!=ImageData&&a instanceof ImageData)c.data=a.data;else if('undefined'!==typeof CanvasRenderingContext2D&&null!=CanvasRenderingContext2D&&a instanceof CanvasRenderingContext2D||'undefined'!==typeof WebGLRenderingContext&&null!=WebGLRenderingContext&&a instanceof WebGLRenderingContext)d.copy?c.data=this.getContextData(a):c.context=a;else if(null!=a.childNodes)d.copy?c.data=this.getImageData(a):c.image=a;else throw new Error('Invalid image');return this.frames.push(c)},a.prototype.render=function(){var d,a;if(this.running)throw new Error('Already running');if(!(null!=this.options.width&&null!=this.options.height))throw new Error('Width and height must be set prior to rendering');this.running=!0,this.nextFrame=0,this.finishedFrames=0,this.imageParts=function(c){for(var b=function(){var b;b=[];for(var a=0;0<=this.frames.length?a<this.frames.length:a>this.frames.length;0<=this.frames.length?++a:--a)b.push(a);return b}.apply(this,arguments),a=0,e=b.length;a<e;++a)d=b[a],c.push(null);return c}.call(this,[]),a=this.spawnWorkers();for(var c=function(){var c;c=[];for(var b=0;0<=a?b<a:b>a;0<=a?++b:--b)c.push(b);return c}.apply(this,arguments),b=0,e=c.length;b<e;++b)d=c[b],this.renderNextFrame();return this.emit('start'),this.emit('progress',0)},a.prototype.abort=function(){var a;while(!0){if(a=this.activeWorkers.shift(),!(null!=a))break;console.log('killing active worker'),a.terminate()}return this.running=!1,this.emit('abort')},a.prototype.spawnWorkers=function(){var a;return a=Math.min(this.options.workers,this.frames.length),function(){var c;c=[];for(var b=this.freeWorkers.length;this.freeWorkers.length<=a?b<a:b>a;this.freeWorkers.length<=a?++b:--b)c.push(b);return c}.apply(this,arguments).forEach(function(a){return function(c){var b;return console.log('spawning worker '+c),b=new Worker(a.options.workerScript),b.onmessage=function(a){return function(c){return a.activeWorkers.splice(a.activeWorkers.indexOf(b),1),a.freeWorkers.push(b),a.frameFinished(c.data)}}(a),a.freeWorkers.push(b)}}(this)),a},a.prototype.frameFinished=function(a){return console.log('frame '+a.index+' finished - '+this.activeWorkers.length+' active'),this.finishedFrames++,this.emit('progress',this.finishedFrames/this.frames.length),this.imageParts[a.index]=a,j(null,this.imageParts)?this.renderNextFrame():this.finishRendering()},a.prototype.finishRendering=function(){var e,a,k,m,b,d,h;b=0;for(var f=0,j=this.imageParts.length;f<j;++f)a=this.imageParts[f],b+=(a.data.length-1)*a.pageSize+a.cursor;b+=a.pageSize-a.cursor,console.log('rendering finished - filesize '+Math.round(b/1e3)+'kb'),e=new Uint8Array(b),d=0;for(var g=0,l=this.imageParts.length;g<l;++g){a=this.imageParts[g];for(var c=0,i=a.data.length;c<i;++c)h=a.data[c],k=c,e.set(h,d),k===a.data.length-1?d+=a.cursor:d+=a.pageSize}return m=new Blob([e],{type:'image/gif'}),this.emit('finished',m,e)},a.prototype.renderNextFrame=function(){var c,a,b;if(this.freeWorkers.length===0)throw new Error('No free workers');return this.nextFrame>=this.frames.length?void 0:(c=this.frames[this.nextFrame++],b=this.freeWorkers.shift(),a=this.getTask(c),console.log('starting frame '+(a.index+1)+' of '+this.frames.length),this.activeWorkers.push(b),b.postMessage(a))},a.prototype.getContextData=function(a){return a.getImageData(0,0,this.options.width,this.options.height).data},a.prototype.getImageData=function(b){var a;return null!=this._canvas||(this._canvas=document.createElement('canvas'),this._canvas.width=this.options.width,this._canvas.height=this.options.height),a=this._canvas.getContext('2d'),a.setFill=this.options.background,a.fillRect(0,0,this.options.width,this.options.height),a.drawImage(b,0,0),this.getContextData(a)},a.prototype.getTask=function(a){var c,b;if(c=this.frames.indexOf(a),b={index:c,last:c===this.frames.length-1,delay:a.delay,transparent:a.transparent,width:this.options.width,height:this.options.height,quality:this.options.quality,repeat:this.options.repeat,canTransfer:h.name==='chrome'},null!=a.data)b.data=a.data;else if(null!=a.context)b.data=this.getContextData(a.context);else if(null!=a.image)b.data=this.getImageData(a.image);else throw new Error('Invalid frame');return b},a}(f),d.exports=e}),a.define('/browser.coffee',function(f,g,h,i){var a,d,e,c,b;c=navigator.userAgent.toLowerCase(),e=navigator.platform.toLowerCase(),b=c.match(/(opera|ie|firefox|chrome|version)[\s\/:]([\w\d\.]+)?.*?(safari|version[\s\/:]([\w\d\.]+)|$)/)||[null,'unknown',0],d=b[1]==='ie'&&document.documentMode,a={name:b[1]==='version'?b[3]:b[1],version:d||parseFloat(b[1]==='opera'&&b[4]?b[4]:b[2]),platform:{name:c.match(/ip(?:ad|od|hone)/)?'ios':(c.match(/(?:webos|android)/)||e.match(/mac|win|linux/)||['other'])[0]}},a[a.name]=!0,a[a.name+parseInt(a.version,10)]=!0,a.platform[a.platform.name]=!0,f.exports=a}),a.define('events',function(f,e,g,h){b.EventEmitter||(b.EventEmitter=function(){});var a=e.EventEmitter=b.EventEmitter,c=typeof Array.isArray==='function'?Array.isArray:function(a){return Object.prototype.toString.call(a)==='[object Array]'},d=10;a.prototype.setMaxListeners=function(a){this._events||(this._events={}),this._events.maxListeners=a},a.prototype.emit=function(f){if(f==='error'&&(!(this._events&&this._events.error)||c(this._events.error)&&!this._events.error.length))throw arguments[1]instanceof Error?arguments[1]:new Error("Uncaught, unspecified 'error' event.");if(!this._events)return!1;var a=this._events[f];if(!a)return!1;if(!(typeof a=='function'))if(c(a)){var b=Array.prototype.slice.call(arguments,1),e=a.slice();for(var d=0,g=e.length;d<g;d++)e[d].apply(this,b);return!0}else return!1;switch(arguments.length){case 1:a.call(this);break;case 2:a.call(this,arguments[1]);break;case 3:a.call(this,arguments[1],arguments[2]);break;default:var b=Array.prototype.slice.call(arguments,1);a.apply(this,b)}return!0},a.prototype.addListener=function(a,b){if('function'!==typeof b)throw new Error('addListener only takes instances of Function');if(this._events||(this._events={}),this.emit('newListener',a,b),!this._events[a])this._events[a]=b;else if(c(this._events[a])){if(!this._events[a].warned){var e;this._events.maxListeners!==undefined?e=this._events.maxListeners:e=d,e&&e>0&&this._events[a].length>e&&(this._events[a].warned=!0,console.error('(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.',this._events[a].length),console.trace())}this._events[a].push(b)}else this._events[a]=[this._events[a],b];return this},a.prototype.on=a.prototype.addListener,a.prototype.once=function(b,c){var a=this;return a.on(b,function d(){a.removeListener(b,d),c.apply(this,arguments)}),this},a.prototype.removeListener=function(a,d){if('function'!==typeof d)throw new Error('removeListener only takes instances of Function');if(!(this._events&&this._events[a]))return this;var b=this._events[a];if(c(b)){var e=b.indexOf(d);if(e<0)return this;b.splice(e,1),b.length==0&&delete this._events[a]}else this._events[a]===d&&delete this._events[a];return this},a.prototype.removeAllListeners=function(a){return a&&this._events&&this._events[a]&&(this._events[a]=null),this},a.prototype.listeners=function(a){return this._events||(this._events={}),this._events[a]||(this._events[a]=[]),c(this._events[a])||(this._events[a]=[this._events[a]]),this._events[a]}}),c.GIF=a('/gif.coffee')}.call(this,this))
//# sourceMappingURL=gif.js.map
// gif.js 0.1.6 - https://github.com/jnordberg/gif.js;(function() {

"use strict";

var objectTypes = {
'function': true,
'object': true
};

function checkGlobal(value) {
    return (value && value.Object === Object) ? value : null;
  }

/** Built-in method references without a dependency on `root`. */
var freeParseFloat = parseFloat,
  freeParseInt = parseInt;

/** Detect free variable `exports`. */
var freeExports = (objectTypes[typeof exports] && exports && !exports.nodeType)
? exports
: undefined;

/** Detect free variable `module`. */
var freeModule = (objectTypes[typeof module] && module && !module.nodeType)
? module
: undefined;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = (freeModule && freeModule.exports === freeExports)
? freeExports
: undefined;

/** Detect free variable `global` from Node.js. */
var freeGlobal = checkGlobal(freeExports && freeModule && typeof global == 'object' && global);

/** Detect free variable `self`. */
var freeSelf = checkGlobal(objectTypes[typeof self] && self);

/** Detect free variable `window`. */
var freeWindow = checkGlobal(objectTypes[typeof window] && window);

/** Detect `this` as the global object. */
var thisGlobal = checkGlobal(objectTypes[typeof this] && this);

/**
* Used as a reference to the global object.
*
* The `this` value is used if it's the global object to avoid Greasemonkey's
* restricted `window` object, otherwise the `window` object is used.
*/
var root = freeGlobal ||
((freeWindow !== (thisGlobal && thisGlobal.window)) && freeWindow) ||
  freeSelf || thisGlobal || Function('return this')();

if( !('gc' in window ) ) {
	window.gc = function(){}
}

if (!HTMLCanvasElement.prototype.toBlob) {
 Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
  value: function (callback, type, quality) {

    var binStr = atob( this.toDataURL(type, quality).split(',')[1] ),
        len = binStr.length,
        arr = new Uint8Array(len);

    for (var i=0; i<len; i++ ) {
     arr[i] = binStr.charCodeAt(i);
    }

    callback( new Blob( [arr], {type: type || 'image/png'} ) );
  }
 });
}

// @license http://opensource.org/licenses/MIT
// copyright Paul Irish 2015


// Date.now() is supported everywhere except IE8. For IE8 we use the Date.now polyfill
//   github.com/Financial-Times/polyfill-service/blob/master/polyfills/Date.now/polyfill.js
// as Safari 6 doesn't have support for NavigationTiming, we use a Date.now() timestamp for relative values

// if you want values similar to what you'd get with real perf.now, place this towards the head of the page
// but in reality, you're just getting the delta between now() calls, so it's not terribly important where it's placed


(function(){

  if ("performance" in window == false) {
      window.performance = {};
  }

  Date.now = (Date.now || function () {  // thanks IE8
	  return new Date().getTime();
  });

  if ("now" in window.performance == false){

    var nowOffset = Date.now();

    if (performance.timing && performance.timing.navigationStart){
      nowOffset = performance.timing.navigationStart
    }

    window.performance.now = function now(){
      return Date.now() - nowOffset;
    }
  }

})();


function pad( n ) {
	return String("0000000" + n).slice(-7);
}
// https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Timers

var g_startTime = window.Date.now();

function guid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function CCFrameEncoder( settings ) {

	var _handlers = {};

	this.settings = settings;

	this.on = function(event, handler) {

		_handlers[event] = handler;

	};

	this.emit = function(event) {

		var handler = _handlers[event];
		if (handler) {

			handler.apply(null, Array.prototype.slice.call(arguments, 1));

		}

	};

	this.filename = settings.name || guid();
	this.extension = '';
	this.mimeType = '';

}

CCFrameEncoder.prototype.start = function(){};
CCFrameEncoder.prototype.stop = function(){};
CCFrameEncoder.prototype.add = function(){};
CCFrameEncoder.prototype.save = function(){};
CCFrameEncoder.prototype.dispose = function(){};
CCFrameEncoder.prototype.safeToProceed = function(){ return true; };
CCFrameEncoder.prototype.step = function() { console.log( 'Step not set!' ) }

function CCTarEncoder( settings ) {

  CCFrameEncoder.call( this, settings );

  this.extension = '.tar'
  this.mimeType = 'application/x-tar'
  this.fileExtension = '';
  this.baseFilename = this.filename;

  this.tape = null
  this.count = 0;
  this.part = 1;
  this.frames = 0;

}

CCTarEncoder.prototype = Object.create( CCFrameEncoder.prototype );

CCTarEncoder.prototype.start = function(){

  this.dispose();

};

CCTarEncoder.prototype.add = function( blob ) {

  var fileReader = new FileReader();
  fileReader.onload = function() {
    this.tape.append( pad( this.count ) + this.fileExtension, new Uint8Array( fileReader.result ) );

    if( this.settings.autoSaveTime > 0 && ( this.frames / this.settings.framerate ) >= this.settings.autoSaveTime ) {
      this.save( function( blob ) {
        this.filename = this.baseFilename + '-part-' + pad( this.part );
        download( blob, this.filename + this.extension, this.mimeType );
        var count = this.count;
        this.dispose();
        this.count = count+1;
        this.part++;
        this.filename = this.baseFilename + '-part-' + pad( this.part );
        this.frames = 0;
        this.step();
      }.bind( this ) )
    } else {
      this.count++;
      this.frames++;
      this.step();
    }

  }.bind( this );
  fileReader.readAsArrayBuffer(blob);

}

CCTarEncoder.prototype.save = function( callback ) {

  callback( this.tape.save() );

}

CCTarEncoder.prototype.dispose = function() {

  this.tape = new Tar();
  this.count = 0;

}

function CCPNGEncoder( settings ) {

	CCTarEncoder.call( this, settings );

	this.type = 'image/png';
	this.fileExtension = '.png';

}

CCPNGEncoder.prototype = Object.create( CCTarEncoder.prototype );

CCPNGEncoder.prototype.add = function( canvas ) {

	canvas.toBlob( function( blob ) {
		CCTarEncoder.prototype.add.call( this, blob );
	}.bind( this ), this.type )

}

function CCJPEGEncoder( settings ) {

	CCTarEncoder.call( this, settings );

	this.type = 'image/jpeg';
	this.fileExtension = '.jpg';
	this.quality = ( settings.quality / 100 ) || .8;

}

CCJPEGEncoder.prototype = Object.create( CCTarEncoder.prototype );

CCJPEGEncoder.prototype.add = function( canvas ) {

	canvas.toBlob( function( blob ) {
		CCTarEncoder.prototype.add.call( this, blob );
	}.bind( this ), this.type, this.quality )

}

/*

	WebM Encoder

*/

function CCWebMEncoder( settings ) {

	var canvas = document.createElement( 'canvas' );
	if( canvas.toDataURL( 'image/webp' ).substr(5,10) !== 'image/webp' ){
		console.log( "WebP not supported - try another export format" )
	}

	CCFrameEncoder.call( this, settings );

	this.quality = ( settings.quality / 100 ) || .8;

	this.extension = '.webm'
	this.mimeType = 'video/webm'
	this.baseFilename = this.filename;
  this.framerate = settings.framerate;

	this.frames = 0;
	this.part = 1;

  this.videoWriter = new WebMWriter({
    quality: this.quality,
    fileWriter: null,
    fd: null,
    frameRate: this.framerate
  });

}

CCWebMEncoder.prototype = Object.create( CCFrameEncoder.prototype );

CCWebMEncoder.prototype.start = function( canvas ) {

	this.dispose();

}

CCWebMEncoder.prototype.add = function( canvas ) {

  this.videoWriter.addFrame(canvas);

	if( this.settings.autoSaveTime > 0 && ( this.frames / this.settings.framerate ) >= this.settings.autoSaveTime ) {
		this.save( function( blob ) {
			this.filename = this.baseFilename + '-part-' + pad( this.part );
			download( blob, this.filename + this.extension, this.mimeType );
			this.dispose();
			this.part++;
			this.filename = this.baseFilename + '-part-' + pad( this.part );
			this.step();
		}.bind( this ) )
	} else {
    this.frames++;
		this.step();
	}

}

CCWebMEncoder.prototype.save = function( callback ) {

  this.videoWriter.complete().then(callback);

}

CCWebMEncoder.prototype.dispose = function( canvas ) {

	this.frames = 0;
  this.videoWriter = new WebMWriter({
    quality: this.quality,
    fileWriter: null,
    fd: null,
    frameRate: this.framerate
  });

}

function CCFFMpegServerEncoder( settings ) {

	CCFrameEncoder.call( this, settings );

	settings.quality = ( settings.quality / 100 ) || .8;

	this.encoder = new FFMpegServer.Video( settings );
    this.encoder.on( 'process', function() {
        this.emit( 'process' )
    }.bind( this ) );
    this.encoder.on('finished', function( url, size ) {
        var cb = this.callback;
        if ( cb ) {
            this.callback = undefined;
            cb( url, size );
        }
    }.bind( this ) );
    this.encoder.on( 'progress', function( progress ) {
        if ( this.settings.onProgress ) {
            this.settings.onProgress( progress )
        }
    }.bind( this ) );
    this.encoder.on( 'error', function( data ) {
        alert(JSON.stringify(data, null, 2));
    }.bind( this ) );

}

CCFFMpegServerEncoder.prototype = Object.create( CCFrameEncoder.prototype );

CCFFMpegServerEncoder.prototype.start = function() {

	this.encoder.start( this.settings );

};

CCFFMpegServerEncoder.prototype.add = function( canvas ) {

	this.encoder.add( canvas );

}

CCFFMpegServerEncoder.prototype.save = function( callback ) {

    this.callback = callback;
    this.encoder.end();

}

CCFFMpegServerEncoder.prototype.safeToProceed = function() {
    return this.encoder.safeToProceed();
};

/*
	HTMLCanvasElement.captureStream()
*/

function CCStreamEncoder( settings ) {

	CCFrameEncoder.call( this, settings );

	this.framerate = this.settings.framerate;
	this.type = 'video/webm';
	this.extension = '.webm';
	this.stream = null;
	this.mediaRecorder = null;
	this.chunks = [];

}

CCStreamEncoder.prototype = Object.create( CCFrameEncoder.prototype );

CCStreamEncoder.prototype.add = function( canvas ) {

	if( !this.stream ) {
		this.stream = canvas.captureStream( this.framerate );
		this.mediaRecorder = new MediaRecorder( this.stream );
		this.mediaRecorder.start();

		this.mediaRecorder.ondataavailable = function(e) {
			this.chunks.push(e.data);
		}.bind( this );

	}
	this.step();

}

CCStreamEncoder.prototype.save = function( callback ) {

	this.mediaRecorder.onstop = function( e ) {
		var blob = new Blob( this.chunks, { 'type' : 'video/webm' });
		this.chunks = [];
		callback( blob );

	}.bind( this );

	this.mediaRecorder.stop();

}

/*function CCGIFEncoder( settings ) {

	CCFrameEncoder.call( this );

	settings.quality = settings.quality || 6;
	this.settings = settings;

	this.encoder = new GIFEncoder();
	this.encoder.setRepeat( 1 );
  	this.encoder.setDelay( settings.step );
  	this.encoder.setQuality( 6 );
  	this.encoder.setTransparent( null );
  	this.encoder.setSize( 150, 150 );

  	this.canvas = document.createElement( 'canvas' );
  	this.ctx = this.canvas.getContext( '2d' );

}

CCGIFEncoder.prototype = Object.create( CCFrameEncoder );

CCGIFEncoder.prototype.start = function() {

	this.encoder.start();

}

CCGIFEncoder.prototype.add = function( canvas ) {

	this.canvas.width = canvas.width;
	this.canvas.height = canvas.height;
	this.ctx.drawImage( canvas, 0, 0 );
	this.encoder.addFrame( this.ctx );

	this.encoder.setSize( canvas.width, canvas.height );
	var readBuffer = new Uint8Array(canvas.width * canvas.height * 4);
	var context = canvas.getContext( 'webgl' );
	context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, readBuffer);
	this.encoder.addFrame( readBuffer, true );

}

CCGIFEncoder.prototype.stop = function() {

	this.encoder.finish();

}

CCGIFEncoder.prototype.save = function( callback ) {

	var binary_gif = this.encoder.stream().getData();

	var data_url = 'data:image/gif;base64,'+encode64(binary_gif);
	window.location = data_url;
	return;

	var blob = new Blob( [ binary_gif ], { type: "octet/stream" } );
	var url = window.URL.createObjectURL( blob );
	callback( url );

}*/

function CCGIFEncoder( settings ) {

	CCFrameEncoder.call( this, settings );

	settings.quality = 31 - ( ( settings.quality * 30 / 100 ) || 10 );
	settings.workers = settings.workers || 4;

	this.extension = '.gif'
	this.mimeType = 'image/gif'

  	this.canvas = document.createElement( 'canvas' );
  	this.ctx = this.canvas.getContext( '2d' );
  	this.sizeSet = false;

  	this.encoder = new GIF({
		workers: settings.workers,
		quality: settings.quality,
		workerScript: settings.workersPath + 'gif.worker.js'
	} );

    this.encoder.on( 'progress', function( progress ) {
        if ( this.settings.onProgress ) {
            this.settings.onProgress( progress )
        }
    }.bind( this ) );

    this.encoder.on('finished', function( blob ) {
        var cb = this.callback;
        if ( cb ) {
            this.callback = undefined;
            cb( blob );
        }
    }.bind( this ) );

}

CCGIFEncoder.prototype = Object.create( CCFrameEncoder.prototype );

CCGIFEncoder.prototype.add = function( canvas ) {

	if( !this.sizeSet ) {
		this.encoder.setOption( 'width',canvas.width );
		this.encoder.setOption( 'height',canvas.height );
		this.sizeSet = true;
	}

	this.canvas.width = canvas.width;
	this.canvas.height = canvas.height;
	this.ctx.drawImage( canvas, 0, 0 );

	this.encoder.addFrame( this.ctx, { copy: true, delay: this.settings.step } );
	this.step();

	/*this.encoder.setSize( canvas.width, canvas.height );
	var readBuffer = new Uint8Array(canvas.width * canvas.height * 4);
	var context = canvas.getContext( 'webgl' );
	context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, readBuffer);
	this.encoder.addFrame( readBuffer, true );*/

}

CCGIFEncoder.prototype.save = function( callback ) {

    this.callback = callback;

	this.encoder.render();

}

function CCapture( settings ) {

	var _settings = settings || {},
		_date = new Date(),
		_verbose,
		_display,
		_time,
		_startTime,
		_performanceTime,
		_performanceStartTime,
		_step,
        _encoder,
		_timeouts = [],
		_intervals = [],
		_frameCount = 0,
		_intermediateFrameCount = 0,
		_lastFrame = null,
		_requestAnimationFrameCallbacks = [],
		_capturing = false,
        _handlers = {};

	_settings.framerate = _settings.framerate || 60;
	_settings.motionBlurFrames = 2 * ( _settings.motionBlurFrames || 1 );
	_verbose = _settings.verbose || false;
	_display = _settings.display || false;
	_settings.step = 1000.0 / _settings.framerate ;
	_settings.timeLimit = _settings.timeLimit || 0;
	_settings.frameLimit = _settings.frameLimit || 0;
	_settings.startTime = _settings.startTime || 0;

	var _timeDisplay = document.createElement( 'div' );
	_timeDisplay.style.position = 'absolute';
	_timeDisplay.style.left = _timeDisplay.style.top = 0
	_timeDisplay.style.backgroundColor = 'black';
	_timeDisplay.style.fontFamily = 'monospace'
	_timeDisplay.style.fontSize = '11px'
	_timeDisplay.style.padding = '5px'
	_timeDisplay.style.color = 'red';
	_timeDisplay.style.zIndex = 100000
	if( _settings.display ) document.body.appendChild( _timeDisplay );

	var canvasMotionBlur = document.createElement( 'canvas' );
	var ctxMotionBlur = canvasMotionBlur.getContext( '2d' );
	var bufferMotionBlur;
	var imageData;

	_log( 'Step is set to ' + _settings.step + 'ms' );

    var _encoders = {
		gif: CCGIFEncoder,
		webm: CCWebMEncoder,
		ffmpegserver: CCFFMpegServerEncoder,
		png: CCPNGEncoder,
		jpg: CCJPEGEncoder,
		'webm-mediarecorder': CCStreamEncoder
    };

    var ctor = _encoders[ _settings.format ];
    if ( !ctor ) {
		throw "Error: Incorrect or missing format: Valid formats are " + Object.keys(_encoders).join(", ");
    }
    _encoder = new ctor( _settings );
    _encoder.step = _step

	_encoder.on('process', _process);
    _encoder.on('progress', _progress);

    if ("performance" in window == false) {
    	window.performance = {};
    }

	Date.now = (Date.now || function () {  // thanks IE8
		return new Date().getTime();
	});

	if ("now" in window.performance == false){

		var nowOffset = Date.now();

		if (performance.timing && performance.timing.navigationStart){
			nowOffset = performance.timing.navigationStart
		}

		window.performance.now = function now(){
			return Date.now() - nowOffset;
		}
	}

	var _oldSetTimeout = window.setTimeout,
		_oldSetInterval = window.setInterval,
	    	_oldClearInterval = window.clearInterval,
		_oldClearTimeout = window.clearTimeout,
		_oldRequestAnimationFrame = window.requestAnimationFrame,
		_oldNow = window.Date.now,
		_oldPerformanceNow = window.performance.now,
		_oldGetTime = window.Date.prototype.getTime;
	// Date.prototype._oldGetTime = Date.prototype.getTime;

	var media = [];

	function _init() {

		_log( 'Capturer start' );

		_startTime = window.Date.now();
		_time = _startTime + _settings.startTime;
		_performanceStartTime = window.performance.now();
		_performanceTime = _performanceStartTime + _settings.startTime;

		window.Date.prototype.getTime = function(){
			return _time;
		};
		window.Date.now = function() {
			return _time;
		};

		window.setTimeout = function( callback, time ) {
			var t = {
				callback: callback,
				time: time,
				triggerTime: _time + time
			};
			_timeouts.push( t );
			_log( 'Timeout set to ' + t.time );
            return t;
		};
		window.clearTimeout = function( id ) {
			for( var j = 0; j < _timeouts.length; j++ ) {
				if( _timeouts[ j ] == id ) {
					_timeouts.splice( j, 1 );
					_log( 'Timeout cleared' );
					continue;
				}
			}
		};
		window.setInterval = function( callback, time ) {
			var t = {
				callback: callback,
				time: time,
				triggerTime: _time + time
			};
			_intervals.push( t );
			_log( 'Interval set to ' + t.time );
			return t;
		};
		window.clearInterval = function( id ) {
			_log( 'clear Interval' );
			return null;
		};
		window.requestAnimationFrame = function( callback ) {
			_requestAnimationFrameCallbacks.push( callback );
		};
		window.performance.now = function(){
			return _performanceTime;
		};

		function hookCurrentTime() { 
			if( !this._hooked ) {
				this._hooked = true;
				this._hookedTime = this.currentTime || 0;
				this.pause();
				media.push( this );
			}
			return this._hookedTime + _settings.startTime;
		};

		try {
			Object.defineProperty( HTMLVideoElement.prototype, 'currentTime', { get: hookCurrentTime } )
			Object.defineProperty( HTMLAudioElement.prototype, 'currentTime', { get: hookCurrentTime } )
		} catch (err) {
			_log(err);
		}

	}

	function _start() {
		_init();
		_encoder.start();
		_capturing = true;
	}

	function _stop() {
		_capturing = false;
		_encoder.stop();
		_destroy();
	}

	function _call( fn, p ) {
		_oldSetTimeout( fn, 0, p );
	}

	function _step() {
		//_oldRequestAnimationFrame( _process );
		_call( _process );
	}

	function _destroy() {
		_log( 'Capturer stop' );
		window.setTimeout = _oldSetTimeout;
		window.setInterval = _oldSetInterval;
		window.clearInterval = _oldClearInterval;
		window.clearTimeout = _oldClearTimeout;
		window.requestAnimationFrame = _oldRequestAnimationFrame;
		window.Date.prototype.getTime = _oldGetTime;
		window.Date.now = _oldNow;
		window.performance.now = _oldPerformanceNow;
	}

	function _updateTime() {
		var seconds = _frameCount / _settings.framerate;
		if( ( _settings.frameLimit && _frameCount >= _settings.frameLimit ) || ( _settings.timeLimit && seconds >= _settings.timeLimit ) ) {
			_stop();
			_save();
		}
		var d = new Date( null );
		d.setSeconds( seconds );
		if( _settings.motionBlurFrames > 2 ) {
			_timeDisplay.textContent = 'CCapture ' + _settings.format + ' | ' + _frameCount + ' frames (' + _intermediateFrameCount + ' inter) | ' +  d.toISOString().substr( 11, 8 );
		} else {
			_timeDisplay.textContent = 'CCapture ' + _settings.format + ' | ' + _frameCount + ' frames | ' +  d.toISOString().substr( 11, 8 );
		}
	}

	function _checkFrame( canvas ) {

		if( canvasMotionBlur.width !== canvas.width || canvasMotionBlur.height !== canvas.height ) {
			canvasMotionBlur.width = canvas.width;
			canvasMotionBlur.height = canvas.height;
			bufferMotionBlur = new Uint16Array( canvasMotionBlur.height * canvasMotionBlur.width * 4 );
			ctxMotionBlur.fillStyle = '#0'
			ctxMotionBlur.fillRect( 0, 0, canvasMotionBlur.width, canvasMotionBlur.height );
		}

	}

	function _blendFrame( canvas ) {

		//_log( 'Intermediate Frame: ' + _intermediateFrameCount );

		ctxMotionBlur.drawImage( canvas, 0, 0 );
		imageData = ctxMotionBlur.getImageData( 0, 0, canvasMotionBlur.width, canvasMotionBlur.height );
		for( var j = 0; j < bufferMotionBlur.length; j+= 4 ) {
			bufferMotionBlur[ j ] += imageData.data[ j ];
			bufferMotionBlur[ j + 1 ] += imageData.data[ j + 1 ];
			bufferMotionBlur[ j + 2 ] += imageData.data[ j + 2 ];
		}
		_intermediateFrameCount++;

	}

	function _saveFrame(){

		var data = imageData.data;
		for( var j = 0; j < bufferMotionBlur.length; j+= 4 ) {
			data[ j ] = bufferMotionBlur[ j ] * 2 / _settings.motionBlurFrames;
			data[ j + 1 ] = bufferMotionBlur[ j + 1 ] * 2 / _settings.motionBlurFrames;
			data[ j + 2 ] = bufferMotionBlur[ j + 2 ] * 2 / _settings.motionBlurFrames;
		}
		ctxMotionBlur.putImageData( imageData, 0, 0 );
		_encoder.add( canvasMotionBlur );
		_frameCount++;
		_intermediateFrameCount = 0;
		_log( 'Full MB Frame! ' + _frameCount + ' ' +  _time );
		for( var j = 0; j < bufferMotionBlur.length; j+= 4 ) {
			bufferMotionBlur[ j ] = 0;
			bufferMotionBlur[ j + 1 ] = 0;
			bufferMotionBlur[ j + 2 ] = 0;
		}
		gc();

	}

	function _capture( canvas ) {

		if( _capturing ) {

			if( _settings.motionBlurFrames > 2 ) {

				_checkFrame( canvas );
				_blendFrame( canvas );

				if( _intermediateFrameCount >= .5 * _settings.motionBlurFrames ) {
					_saveFrame();
				} else {
					_step();
				}

			} else {
				_encoder.add( canvas );
				_frameCount++;
				_log( 'Full Frame! ' + _frameCount );
			}

		}

	}

	function _process() {

		var step = 1000 / _settings.framerate;
		var dt = ( _frameCount + _intermediateFrameCount / _settings.motionBlurFrames ) * step;

		_time = _startTime + dt;
		_performanceTime = _performanceStartTime + dt;

		media.forEach( function( v ) {
			v._hookedTime = dt / 1000;
		} );

		_updateTime();
		_log( 'Frame: ' + _frameCount + ' ' + _intermediateFrameCount );

		for( var j = 0; j < _timeouts.length; j++ ) {
			if( _time >= _timeouts[ j ].triggerTime ) {
				_call( _timeouts[ j ].callback )
				//console.log( 'timeout!' );
				_timeouts.splice( j, 1 );
				continue;
			}
		}

		for( var j = 0; j < _intervals.length; j++ ) {
			if( _time >= _intervals[ j ].triggerTime ) {
				_call( _intervals[ j ].callback );
				_intervals[ j ].triggerTime += _intervals[ j ].time;
				//console.log( 'interval!' );
				continue;
			}
		}

		_requestAnimationFrameCallbacks.forEach( function( cb ) {
     		_call( cb, _time - g_startTime );
        } );
        _requestAnimationFrameCallbacks = [];

	}

	function _save( callback ) {

		if( !callback ) {
			callback = function( blob ) {
				download( blob, _encoder.filename + _encoder.extension, _encoder.mimeType );
				return false;
			}
		}
		_encoder.save( callback );

	}

	function _log( message ) {
		if( _verbose ) console.log( message );
	}

    function _on( event, handler ) {

        _handlers[event] = handler;

    }

    function _emit( event ) {

        var handler = _handlers[event];
        if ( handler ) {

            handler.apply( null, Array.prototype.slice.call( arguments, 1 ) );

        }

    }

    function _progress( progress ) {

        _emit( 'progress', progress );

    }

	return {
		start: _start,
		capture: _capture,
		stop: _stop,
		save: _save,
        on: _on
	}
}

(freeWindow || freeSelf || {}).CCapture = CCapture;

  // Some AMD build optimizers like r.js check for condition patterns like the following:
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // Define as an anonymous module so, through path mapping, it can be
    // referenced as the "underscore" module.
    define(function() {
    	return CCapture;
    });
}
  // Check for `exports` after `define` in case a build optimizer adds an `exports` object.
  else if (freeExports && freeModule) {
    // Export for Node.js.
    if (moduleExports) {
    	(freeModule.exports = CCapture).CCapture = CCapture;
    }
    // Export for CommonJS support.
    freeExports.CCapture = CCapture;
}
else {
    // Export to the global object.
    root.CCapture = CCapture;
}

}());
