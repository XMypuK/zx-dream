class AudioOutputProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        
        this._left = null;
        this._right = null;
        this._begin = 0;
        this._end = 0;
        this._size = 0;
        this._resumeSize = 0;
        this._suspended = false;
    
        this._size = options.processorOptions.bufferSize || 2048;
        this._resumeSize = this._size * 0.75;
        this.init();
    }

    init() {
        this.port.onmessage = this.onMessage.bind(this);
        this._left = new Float32Array(this._size);
        this._right = new Float32Array(this._size);
        this._begin = 0;
        this._end = 0;
    }
    
    onMessage(e) {
        var message = e.data;
        switch (message.type) {
            case 'writeData':
                this.writeData(message.left, message.right, message.sampleCount);
                break;
        }
    }

    writeData(left, right, sampleCount) {
        var srcOffset = 0;
        var srcSampleCount = sampleCount;
        while (srcSampleCount > 0) {
            var dstCapacity = this._size - this._end;
            var copyCount = Math.min(srcSampleCount, dstCapacity);

            if (this._begin > this._end && this._begin <= (this._end + copyCount)) {
                this._begin = this._end + copyCount + 1;
                if (this._begin >= this._size) {
                    this._begin -= this._size;
                }
            }

            this._left.set(left.subarray(srcOffset, srcOffset + copyCount), this._end);
            this._right.set(right.subarray(srcOffset, srcOffset + copyCount), this._end);

            this._end += copyCount;
            if (this._end === this._size) {
                this._end = 0;
            }

            srcOffset += copyCount;
            srcSampleCount -= copyCount;
        }
    }

    process(inputs, outputs, parameters) {
        var dstLeft = outputs[0][0];
        var dstRight = outputs[0][1];
        var dstSampleCount = dstLeft.length;
        var srcSampleCount = this._end - this._begin;
        if (srcSampleCount < 0) {
            srcSampleCount += this._size;
        }
        if (this._suspended && srcSampleCount < this._resumeSize) {
            return true;
        }
        if (srcSampleCount < dstSampleCount) {
            this._suspended = true;
            return true;
        }
        this._suspended = false;
        var dstOffset = 0;
        while (dstSampleCount > 0 && this._begin !== this._end) {
            var srcBlockSize = this._begin <= this._end ? (this._end - this._begin) : (this._size - this._begin);
            var copyCount = Math.min(dstSampleCount, srcBlockSize);

            dstLeft.set(this._left.subarray(this._begin, this._begin + copyCount), dstOffset);
            dstRight.set(this._right.subarray(this._begin, this._begin + copyCount), dstOffset);

            this._begin += copyCount;
            if (this._begin === this._size) {
                this._begin = 0;
            }
            
            dstOffset += copyCount;
            dstSampleCount -= copyCount;
        }
        return true;
    }
}

registerProcessor("audio-output-processor", AudioOutputProcessor);