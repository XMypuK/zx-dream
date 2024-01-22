function AudioOutput() {
    this._audioContext = null;
    this._renderer = null;
    this._initialized = false;
    this._initializationError = null;
    this._onStateChanged = new ZX_Event();
    this._bufferSize = 0;
}
Object.assign(AudioOutput.prototype, {
    init: function () {
        if (AudioOutput.isSupported()) {
            try {
                this._audioContext = new AudioOutput.AudioContext({ sampleRate: AudioOutput.SAMPLE_RATE });
                this._renderer = new NullAudioRenderer(this._audioContext);
                this._initialized = true;
                this._initializationError = null;
                this._onStateChanged.emit(this._audioContext.state);
                this._audioContext.addEventListener('statechange', function (e) {  
                    this._onStateChanged.emit(e.target.state);
                }.bind(this));
            }
            catch (error) {
                this._renderer = new NullAudioRenderer(this._audioContext);
                this._initialized = false;
                this._initializationError = error;
            }
        }
        else {
            this._renderer = new NullAudioRenderer(this._audioContext);
            this._initialized = false;
            this._initializationError = 'Not supported';
        }
    },
    _recreateRenderer: function (rendererType, bufferSize) {
        if (this._renderer) {
            this._renderer.dispose();
            this._renderer = null;
        }

        switch (rendererType) {
            case AudioOutput.RENDERER.UNDEFINED: 
                this._renderer = new NullAudioRenderer(this._audioContext, bufferSize); 
                break;
            case AudioOutput.RENDERER.SPN: 
                this._renderer = new ScriptNodeAudioRenderer(this._audioContext, bufferSize); 
                break;
            case AudioOutput.RENDERER.WLN: 
                this._renderer = new WorkletNodeAudioRenderer(this._audioContext, bufferSize);
                break;
            default: 
                throw new Error(ZX_Lang.ERR_AUDIO_INVALID_RENDERER);
        }
    },
    get_state: function () {
        return this._audioContext && this._audioContext.state || AudioOutput.STATE.CLOSED;
    },
    set_state: function (value) {
        if (!this._initialized)
            return;
        switch (value) {
            case AudioOutput.STATE.SUSPENDED: this._audioContext.suspend(); break;
            case AudioOutput.STATE.RUNNING: this._audioContext.resume(); break;
            case AudioOutput.STATE.CLOSED: this._audioContext.close(); break;
            default: throw new Error(ZX_Lang.ERR_AUDIO_INVALID_STATE);
        }
    },
    get_onStateChanged: function () {
        return this._onStateChanged.pub;
    },
    get_rendererType: function () {
        if (this._renderer instanceof ScriptNodeAudioRenderer) 
            return AudioOutput.RENDERER.SPN;
        if (this._renderer instanceof WorkletNodeAudioRenderer)
            return AudioOutput.RENDERER.WLN;
        return AudioOutput.RENDERER.UNDEFINED;
    },
    set_rendererType: function (value) {
        var current = this.get_rendererType();
        if (current === value)
            return;
        
        this._recreateRenderer(value, this._bufferSize);
    },
    get_bufferSize: function () {
        return this._bufferSize;
    },
    set_bufferSize: function (value) {
        if (this._bufferSize !== value) {
            this._bufferSize = value;
            this._recreateRenderer(this.get_rendererType(), this._bufferSize);
        }
    },
    writeData: function (left, right, sampleCount) {
        return this._renderer.writeData(left, right, sampleCount);
    }
});
Object.assign(AudioOutput, {
    SAMPLE_RATE: 44100,
    STATE: {
        SUSPENDED: 'suspended',
        RUNNING: 'running',
        CLOSED: 'closed'
    },
    RENDERER: {
        UNDEFINED: VAL_AUDIO_RENDERER_UNDEFINED,
        SPN: VAL_AUDIO_RENDERER_SPN,
        WLN: VAL_AUDIO_RENDERER_WLN
    },
    AudioContext: typeof window && (window.AudioContext || window.webkitAudioContext || window.audioContext),
    isSupported: function () {
        return !!AudioOutput.AudioContext;
    }
});

function AudioRendererBase(audioContext, bufferSize) {
    this._audioContext = audioContext;
    this._bufferSize = bufferSize;
    this.init();
}
Object.assign(AudioRendererBase.prototype, {
    init: function () {
    },
    writeData: function (left, right, sampleCount) {
    },
    dispose: function () {
    }
});

function NullAudioRenderer() {
    NullAudioRenderer.superclass.constructor.apply(this, arguments);
}
extend(NullAudioRenderer, AudioRendererBase);
Object.assign(NullAudioRenderer.prototype, {

});

function ScriptNodeAudioRenderer() {
    this._processorNode = null;
    this._left = null;
    this._right = null;
    this._begin = 0;
    this._end = 0;
    this._size = 0
    this._resumeSize = 0;
    this._suspended = false;
    ScriptNodeAudioRenderer.superclass.constructor.apply(this, arguments);
}
extend(ScriptNodeAudioRenderer, AudioRendererBase);
Object.assign(ScriptNodeAudioRenderer.prototype, {
    init: function () {
        this._processorNode = this._audioContext.createScriptProcessor(this._bufferSize, 0, 2);
        this._size = this._processorNode.bufferSize * 3;
        this._resumeSize = this._processorNode.bufferSize * 1.5;
        this._left = new Float32Array(this._size);
        this._right = new Float32Array(this._size);
        this._begin = 0;
        this._end = 0;
        this._processorNode.onaudioprocess = this._fillBuffer.bind(this);
        this._processorNode.connect(this._audioContext.destination);
    },
    writeData: function (left, right, sampleCount) {
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
    },
    _fillBuffer: function (e) {
        var dstLeft = e.outputBuffer.getChannelData(0);
        var dstRight = e.outputBuffer.getChannelData(1);
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
    },
    dispose: function () {
        this._processorNode && this._processorNode.disconnect();
        this._processorNode = null;
        this._left = null;
        this._right = null;
        ScriptNodeAudioRenderer.superclass.dispose.call(this);
    }
});

function WorkletNodeAudioRenderer() {
    this._initialized = false;
    this._outputNode = null;
    this._rpcPromises = {};
    this._rpcIdCounter = 0;
    WorkletNodeAudioRenderer.superclass.constructor.apply(this, arguments);
}
extend(WorkletNodeAudioRenderer, AudioRendererBase);
Object.assign(WorkletNodeAudioRenderer.prototype, {
    init: function () {
        this._audioContext.audioWorklet.addModule(ZX_Lang.AUDIO_WORKLET_JS).then(function () {
            this._outputNode = new AudioWorkletNode(this._audioContext, 'audio-output-processor', { 
                outputChannelCount: [2], 
                processorOptions: { bufferSize: this._bufferSize } 
            });
            this._outputNode.port.onmessage = this.onMessage.bind(this);
            this._outputNode.connect(this._audioContext.destination);
            this._initialized = true;
        }.bind(this));
    },
    writeData: function (left, right, sampleCount) {
        if (this._initialized) {
            var rpcId = this._rpcIdCounter++;
            this._outputNode.port.postMessage({
                type: 'writeData',
                rpcId: rpcId,
                left: left,
                right: right,
                sampleCount: sampleCount
            }, [
                left.buffer,
                right.buffer
            ]);
        }
    },
    onMessage: function (e) {
    },
    dispose: function () {
        this._initialized = false;
        this._outputNode && this._outputNode.disconnect();
        this._outputNode = null;
        WorkletNodeAudioRenderer.superclass.dispose.call(this);
    }
});