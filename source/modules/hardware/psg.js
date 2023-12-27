function ZX_PSG() {
    var get_ready$ = $.Deferred();
    var _audioContext;
    var _audioProcessorNode;
    var _stateChangedEvent = new ZXEvent();

    var PSG_REG = {
        TONE_A_FINE: 0,
        TONE_A_COARSE: 1,
        TONE_B_FINE: 2,
        TONE_B_COARSE: 3,
        TONE_C_FINE: 4,
        TONE_C_COARSE: 5,
        NOISE: 6,
        MIXER: 7,
        VOLUME_A: 8,
        VOLUME_B: 9,
        VOLUME_C: 10,
        ENVELOPE_FINE: 11,
        ENVELOPE_COARSE: 12,
        ENVELOPE_SHAPE: 13
    };
    var AudioContext = window.AudioContext || window.webkitAudioContext || window.audioContext;

    var _bus;
    var _clock;
    var _psg = new Ayumi();
    var _regIndex = 0;
    var _regs = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    var _ayMasks = [0xFF, 0x0F, 0xFF, 0x0F, 0xFF, 0x0F, 0x1F, 0xFF, 0x1F, 0x1F, 0x1F, 0xFF, 0xFF, 0x0F, 0xFF, 0xFF];
    var _ymMasks = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
    var _masks = _ayMasks;
    var _sampleRate = 44100;
    var _psgMode = VAL_PSG_OFF;
    var _psgClock = 1773400;
    var _psgBufferSize = 0;
    var _processTask;
    var _processTaskInvalid = false;
    var _lBuffer, _rBuffer;
    var _wrIndex = 0, _rdIndex = 0;

    function connect(bus, clock) {
        _bus = bus;
        _clock = clock;
        /*
         * запись порта FFFD - запись адреса
         * чтение порта FFFD - чтение данных
         * запись порта BFFD - запись данных
         * Дешифровка порта ведется только по линиям:
         *   A1 = 0
         *   A13, A15 = 1
         *   A14 = 0 или 1
         */
        _bus.on_io_write(io_write_reg, { mask: 0xE002, value: 0xE000 });
        _bus.on_io_write(io_write_data, { mask: 0xE002, value: 0xA000 });
        _bus.on_io_read(io_read_data, { mask: 0xE002, value: 0xE000 });
        _bus.on_reset(reset);
        _bus.on_opt(function () { _processTaskInvalid = true; }, OPT_TSTATES_PER_INTRQ);
        _bus.on_opt(function () { _processTaskInvalid = true; }, OPT_INTRQ_PERIOD);
        try {
            init();
        }
        finally {
            get_ready$.resolve();
        }
    }
    
    function init() {
        destroyAudioContext();
        if (_psgMode != VAL_PSG_OFF && AudioContext) {
            _masks = _psgMode == VAL_PSG_YM_2149 ? _ymMasks : _ayMasks;
            _psg.configure(_psgMode == VAL_PSG_YM_2149, _psgClock, _sampleRate);
            _psg.setPan(0, 0.1, 0);
            _psg.setPan(1, 0.5, 0);
            _psg.setPan(2, 0.9, 0);
            reset();
            createAudioContext();
        }
    }

    function createAudioContext() {
        try {
            _audioContext = new AudioContext({ sampleRate: _sampleRate });
            _audioProcessorNode = _audioContext.createScriptProcessor(_psgBufferSize, 0, 2);
            _audioProcessorNode.onaudioprocess = fillBuffer;
            _audioProcessorNode.connect(_audioContext.destination);
            _lBuffer = new Float32Array(_audioProcessorNode.bufferSize * 2);
            _rBuffer = new Float32Array(_audioProcessorNode.bufferSize * 2);
            _rdIndex = 0;
            _wrIndex = 0;
            rescheduleProcessTask();
            onStateChange(_audioContext.state);
            _audioContext.addEventListener('statechange', function (e) { onStateChange(e.target.state); })
        }
        catch (error) {
            window.console && console.log && console.log('Ошибка при создании контекста аудио.', error);
        }
    }

    function destroyAudioContext() {
        if (_processTask) {
            _processTask.cancelled = true;
            _processTask = null;
        }
        if (_audioProcessorNode) {
            _audioProcessorNode.disconnect();
            _audioProcessorNode = null;
        }
        if (_audioContext) {
            _audioContext.close();
            _audioContext = null;
        }
    }

    function onStateChange(state) {
        _stateChangedEvent.emit(state);
    }

    function io_write_reg(address, data) {
        if (_psgMode != VAL_PSG_OFF) {
            _regIndex = data & 0x0F;
        }
    }

    function io_write_data(address, data) {
        if (_psgMode != VAL_PSG_OFF) {
            _regs[_regIndex] = data & _masks[_regIndex];
            onPsgRegisterSet();
        }
    }

    function io_read_data(address, data) {
        if (_psgMode != VAL_PSG_OFF) {
            return _regs[_regIndex];
        }
    }

    function onPsgRegisterSet() {
        switch (_regIndex) {
            case PSG_REG.TONE_A_FINE:
            case PSG_REG.TONE_A_COARSE: 
                _psg.setTone(0, (_regs[PSG_REG.TONE_A_COARSE] << 8) | _regs[PSG_REG.TONE_A_FINE]); 
                break;
            case PSG_REG.TONE_B_FINE:
            case PSG_REG.TONE_B_COARSE: 
                _psg.setTone(1, (_regs[PSG_REG.TONE_B_COARSE] << 8) | _regs[PSG_REG.TONE_B_FINE]); 
                break;
            case PSG_REG.TONE_C_FINE:
            case PSG_REG.TONE_C_COARSE: 
                _psg.setTone(2, (_regs[PSG_REG.TONE_C_COARSE] << 8) | _regs[PSG_REG.TONE_C_FINE]); 
                break;
            case PSG_REG.NOISE: 
                _psg.setNoise(_regs[PSG_REG.NOISE]); 
                break;
            case PSG_REG.MIXER: 
                _psg.channels[0].tOff = (_regs[PSG_REG.MIXER] >> 0) & 1;
                _psg.channels[1].tOff = (_regs[PSG_REG.MIXER] >> 1) & 1;
                _psg.channels[2].tOff = (_regs[PSG_REG.MIXER] >> 2) & 1;
                _psg.channels[0].nOff = (_regs[PSG_REG.MIXER] >> 3) & 1;
                _psg.channels[1].nOff = (_regs[PSG_REG.MIXER] >> 4) & 1;
                _psg.channels[2].nOff = (_regs[PSG_REG.MIXER] >> 5) & 1;
                break;
            case PSG_REG.VOLUME_A:
                _psg.setVolume(0, _regs[PSG_REG.VOLUME_A] & 0x0F);
                _psg.channels[0].eOn = !!(_regs[PSG_REG.VOLUME_A] & 0x10);
                break;
            case PSG_REG.VOLUME_B:
                _psg.setVolume(1, _regs[PSG_REG.VOLUME_B] & 0x0F);
                _psg.channels[1].eOn = !!(_regs[PSG_REG.VOLUME_B] & 0x10);
                break;
            case PSG_REG.VOLUME_C:
                _psg.setVolume(2, _regs[PSG_REG.VOLUME_C] & 0x0F);
                _psg.channels[2].eOn = !!(_regs[PSG_REG.VOLUME_C] & 0x10);
                break;
            case PSG_REG.ENVELOPE_FINE:
            case PSG_REG.ENVELOPE_COARSE: 
                _psg.setEnvelope((_regs[PSG_REG.ENVELOPE_COARSE] << 8) | _regs[PSG_REG.ENVELOPE_FINE]); 
                break;
            case PSG_REG.ENVELOPE_SHAPE: 
                _psg.setEnvelopeShape(_regs[PSG_REG.ENVELOPE_SHAPE]); 
                break;
        }
    }

    function reset() {
        for (var i = 0; i < 16; i++) {
            _regIndex = i;
            _regs[_regIndex] = 0;
            onPsgRegisterSet();
        }
    }

    function rescheduleProcessTask() {
        if (!_audioContext)
            return;
        if (_processTask) {
            _processTask.cancelled = true;
        }
        _processTask = _clock.setInterval(process, 1000 / _sampleRate, 0);
        _processTaskInvalid = false;
    }

    function process() {
        _psg.process();
        _psg.removeDC();
        _lBuffer[_wrIndex] = _psg.left;
        _rBuffer[_wrIndex] = _psg.right;
        _wrIndex++;
        if (_wrIndex == _lBuffer.length) {
            _wrIndex = 0;
        }
        if (_wrIndex == _rdIndex) {
            _rdIndex++;
            if (_rdIndex == _lBuffer.length) {
                _rdIndex = 0;
            }
        }

        if (_processTaskInvalid) {
            rescheduleProcessTask();
        }
    }

    function fillBuffer(e) {
        var lOut = e.outputBuffer.getChannelData(0);
        var rOut = e.outputBuffer.getChannelData(1);

        var readCount = lOut.length;
        var processedCount = _wrIndex - _rdIndex;
        if (processedCount < 0) {
            processedCount += _lBuffer.length;
        }
        while (processedCount < readCount) {
            process();
            processedCount++;
        }
        var outOffset = 0;
        var readEndIndex = _rdIndex + readCount;
        if (readEndIndex > _lBuffer.length) {
            lOut.set(_lBuffer.subarray(_rdIndex, _lBuffer.length), outOffset);
            rOut.set(_rBuffer.subarray(_rdIndex, _rBuffer.length), outOffset);
            outOffset += (_lBuffer.length - _rdIndex);
            _rdIndex = 0;
        }
        var readLeftover = readCount - outOffset;
        lOut.set(_lBuffer.subarray(_rdIndex, _rdIndex + readLeftover), outOffset);
        rOut.set(_rBuffer.subarray(_rdIndex, _rdIndex + readLeftover), outOffset);
        _rdIndex += readLeftover;
        return true;
    }

    this.connect = connect;
    this.get_ready$ = function () {
        return get_ready$;
    }
    this.get_audioContextState = function () {
        return _audioContext && _audioContext.state || null;
    }
    this.set_audioContextState = function (value) {
        if (!_audioContext)
            throw new Error('Контекст воспроизведения звука не создан.');
        switch (value) {
            case 'suspended': _audioContext.suspend(); break;
            case 'running': _audioContext.resume(); break;
            case 'closed': _audioContext.close(); break;
            default: throw new Error('Неверный статус контекста воспроизведения звука.');
        }
    }
    this.get_onStateChanged = function () {
        return _stateChangedEvent.pub;
    }
    this.applySettings = function (psgMode, psgClock, psgBufferSize) {
        _psgMode = psgMode;
        _psgClock = psgClock;
        _psgBufferSize = psgBufferSize;
        init();
    }
}