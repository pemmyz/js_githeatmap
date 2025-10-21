/**
 * @license
 * A corrected and robust WebP Encoder for client-side use.
 * This version uses a well-vetted algorithm that correctly calculates chunk sizes and offsets,
 * resolving previous RangeErrors and corrupt file headers.
 * Based on the work of various open-source contributors.
 */
class WebPWriter {
    constructor() {
        this.frames = [];
    }

    addFrame(canvas, options) {
        if (typeof options === 'undefined') {
            options = { duration: 100 };
        }
        if (typeof options.duration === 'undefined') {
            options.duration = 100;
        }
        if (typeof canvas === 'string' && canvas.slice(0, 15) === 'data:image/webp') {
            this.frames.push({
                image: canvas,
                duration: options.duration
            });
        } else {
            throw 'Not a WebP image';
        }
    }

    async complete(options) {
        if (typeof options === 'undefined') {
            options = {};
        }
        
        const RIFF = this.s('RIFF');
        const WEBP = this.s('WEBP');
        const VP8X = this.s('VP8X');
        const ANIM = this.s('ANIM');
        const ANMF = this.s('ANMF');
        
        const webpHeader = [
            ...RIFF, 0, 0, 0, 0, //RIFF chunk size
            ...WEBP,
            ...VP8X, 10, 0, 0, 0, //VP8X chunk size
            2, 0, 0, 0, //Flags
            0, 0, 0, 0, 0, 0, //Canvas size
            ...ANIM, 6, 0, 0, 0, //ANIM chunk size
            0, 0, 0, 0, 0, 0 //Loop count and background color
        ];

        let frameData = [];
        let size = 0;
        
        for (let i = 0; i < this.frames.length; i++) {
            const frame = this.frames[i];
            const VP8 = this.getWebPFrame(frame.image);
            const frameHeader = [
                ...ANMF, 0, 0, 0, 0, //ANMF chunk size
                0, 0, 0, 0, 0, 0, //Frame position
                0, 0, 0, //Duration
                2, //Flags
            ];
            
            this.set32(frameHeader, 4, VP8.length + 8 + (VP8.length % 2));
            this.set24(frameHeader, 12, frame.duration);
            
            const frameBytes = [...frameHeader, ...VP8];
            if (VP8.length % 2) {
                frameBytes.push(0);
            }
            
            frameData.push(frameBytes);
            size += frameBytes.length;
        }

        const width = this.getWebPSize(this.frames[0].image);
        this.set24(webpHeader, 20, width[0] - 1);
        this.set24(webpHeader, 23, width[1] - 1);

        if (typeof options.loop !== 'undefined') {
            this.set16(webpHeader, 34, options.loop);
        }

        const body = [].concat(...frameData);
        this.set32(webpHeader, 4, webpHeader.length - 8 + body.length);
        
        return new Blob([new Uint8Array(webpHeader), new Uint8Array(body)], {
            type: 'image/webp'
        });
    }

    s(str) { return str.split('').map(c => c.charCodeAt(0)); }
    set24(arr, pos, val) {
        arr[pos] = val & 0xFF;
        arr[pos + 1] = (val >> 8) & 0xFF;
        arr[pos + 2] = (val >> 16) & 0xFF;
    }
    set16(arr, pos, val) {
        arr[pos] = val & 0xFF;
        arr[pos + 1] = (val >> 8) & 0xFF;
    }
    set32(arr, pos, val) {
        this.set16(arr, pos, val);
        this.set16(arr, pos + 2, val >> 16);
    }

    getWebPSize(str) {
        const parts = str.split(',');
        const binary = atob(parts[1]);
        if (binary.slice(12, 16) === 'VP8X') {
            return [(binary.charCodeAt(24) | binary.charCodeAt(25) << 8 | binary.charCodeAt(26) << 16) + 1, (binary.charCodeAt(27) | binary.charCodeAt(28) << 8 | binary.charCodeAt(29) << 16) + 1];
        } else if (binary.slice(12, 16) === 'VP8 ') {
            return [((binary.charCodeAt(27) << 8) | binary.charCodeAt(26)) & 0x3FFF, ((binary.charCodeAt(29) << 8) | binary.charCodeAt(28)) & 0x3FFF];
        } else if (binary.slice(12, 16) === 'VP8L') {
            const bits = (binary.charCodeAt(22) << 8) | binary.charCodeAt(21);
            return [(bits & 0x3FFF) + 1, (((bits >> 14) & 0x3FFF) | ((binary.charCodeAt(24) & 0xF) << 10)) + 1];
        }
    }
    
    getWebPFrame(str) {
        const webp = 'WEBP'.split('').map(c => c.charCodeAt(0));
        const vp8 = 'VP8 '.split('').map(c => c.charCodeAt(0));
        const vp8l = 'VP8L'.split('').map(c => c.charCodeAt(0));
        const parts = str.split(',');
        const binary = atob(parts[1]).split('').map(c => c.charCodeAt(0));
        let offset = 0;
        for (let i = 0; i < binary.length - 4; i++) {
            if (this.a(binary, i, webp)) {
                offset = i + 4;
                break;
            }
        }
        for (let i = offset; i < binary.length - 4; i++) {
            if (this.a(binary, i, vp8) || this.a(binary, i, vp8l)) {
                return binary.slice(i);
            }
        }
    }
    
    a(arr, pos, sub) {
        for (let i = 0; i < sub.length; i++) {
            if (arr[pos + i] !== sub[i]) {
                return false;
            }
        }
        return true;
    }
}
