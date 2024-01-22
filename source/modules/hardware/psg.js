function ZX_PSG() {
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

    var _bus;
    var _clock;
    var _rom_trdos = false;
    var _set0 = {
        psg: new Ayumi(),
        regIndex: 0,
        regs: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    };
    var _set1 = {
        psg: new Ayumi(),
        regIndex: 0,
        regs: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    };
    var _activeSet = _set0;
    var _ayMasks = [0xFF, 0x0F, 0xFF, 0x0F, 0xFF, 0x0F, 0x1F, 0xFF, 0x1F, 0x1F, 0x1F, 0xFF, 0xFF, 0x0F, 0xFF, 0xFF];
    var _ymMasks = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
    var _masks = _ayMasks;
    var _sampleRate = 44100;
    var _psgMode = VAL_PSG_OFF;
    var _turboSound = VAL_TS_OFF;
    var _turboSoundAutoDetected = false;
    var _channelLayout = VAL_CHANNELS_ABC;
    var _psgClock = 1773400;
    var _psgVolume = 1.0;
    var _processTask;
    var _processTaskInvalid = false;
    var _sampleBufferSize = 512;
    var _sampleBufferIndex = 0;
    var _sampleBufferLeft = new Float32Array(_sampleBufferSize);
    var _sampleBufferRight = new Float32Array(_sampleBufferSize);
    var _onDataReady = new ZX_Event();
    var _beeper = true;
    var _beeperBit = 0;
    var _beeperVolume = 0.5;
    var _lastConfig = {
        psgMode: null,
        psgClock: null,
        channelLayout: null,
    };

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
         * 
         * В режиме NedoPC для второго чипа используются те же адреса, однако
         * при записи в порт FFFD значения FF выбирается первый чип, а при
         * записи FE - второй.
         * 
         * В режиме Power of Sound для второго чипа используются те же адреса,
         * однако при записи в порт 1F (не в режиме TR-DOS) значения 0 выбирается
         * первый чип, при записи 1 - второй.
         * 
         * В режиме QUADRO-AY для второго чипа используются следующие адреса:
         * запись порта EFFD - запись адреса
         * чтение порта EFFD - чтение данных
         * запись порта AFFD - запись данных
         * Дешифрация производится по тем же адресным линиям, но при выборе 
         * нужного чипа учитывается также линия A12.
         */
        _bus.on_io_write(io_write_reg, { mask: 0xE002, value: 0xE000 });
        _bus.on_io_write(io_write_data, { mask: 0xE002, value: 0xA000 });
        _bus.on_io_write(io_write_fe, { mask: 0x01, value: 0x00 });
        _bus.on_io_write(io_write_1f, { mask: 0xFF, value: 0x1F });
        _bus.on_io_read(io_read_data, { mask: 0xE002, value: 0xE000 });
        _bus.on_var_write(var_write_rom_trdos, 'rom_trdos');
        _bus.on_reset(reset);
        _bus.on_opt(function () { _processTaskInvalid = true; }, OPT_TSTATES_PER_INTRQ);
        _bus.on_opt(function () { _processTaskInvalid = true; }, OPT_INTRQ_PERIOD);
        configure();
        reset();
    }
    
    function configure() {
        if (_psgMode != VAL_PSG_OFF) {
            if (_psgMode !== _lastConfig.psgMode || _psgClock !== _lastConfig.psgClock) {
                _masks = _psgMode == VAL_PSG_YM_2149 ? _ymMasks : _ayMasks;
                _set0.psg.configure(_psgMode == VAL_PSG_YM_2149, _psgClock, _sampleRate);
                _set1.psg.configure(_psgMode == VAL_PSG_YM_2149, _psgClock, _sampleRate);
                _lastConfig.psgMode = _psgMode;
                _lastConfig.psgClock = _psgClock;
            }
            if (_channelLayout !== _lastConfig.channelLayout) {
                switch (_channelLayout) {
                    case VAL_CHANNELS_ABC:
                        _set0.psg.setPan(0, 0.1, 0);
                        _set0.psg.setPan(1, 0.5, 0);
                        _set0.psg.setPan(2, 0.9, 0);
                        _set1.psg.setPan(0, 0.1, 0);
                        _set1.psg.setPan(1, 0.5, 0);
                        _set1.psg.setPan(2, 0.9, 0);
                        break;
                    case VAL_CHANNELS_ACB:
                        _set0.psg.setPan(0, 0.1, 0);
                        _set0.psg.setPan(1, 0.9, 0);
                        _set0.psg.setPan(2, 0.5, 0);
                        _set1.psg.setPan(0, 0.1, 0);
                        _set1.psg.setPan(1, 0.9, 0);
                        _set1.psg.setPan(2, 0.5, 0);
                        break;
                }
                _lastConfig.channelLayout = _channelLayout;
            }
        }
        if (_beeper || _psgMode != VAL_PSG_OFF) {
            scheduleProcessTask();
        }
        else {
            cancelProcessTask();
        }
    }

    function reset() {
        for (var i = 0; i < 16; i++) {
            _set0.regIndex = i;
            _set0.regs[i] = 0;
            onPsgRegisterSet(_set0);
            _set1.regIndex = i;
            _set1.regs[i] = 0;
            onPsgRegisterSet(_set1)
        }
        _set0.regIndex = 0;
        _set1.regIndex = 0;
    }

    function scheduleProcessTask() {
        if (_processTask) {
            _processTask.cancelled = true;
        }
        _processTask = _clock.setInterval(process, 1000 / _sampleRate, 0);
        _processTaskInvalid = false;
    }

    function cancelProcessTask() {
        if (_processTask) {
            _processTask.cancelled = true;
            _processTask = null;
        }
    }

    function var_write_rom_trdos(name, value) {
		_rom_trdos = value;
	}

    function io_write_1f(address, data) {
        if (_psgMode === VAL_PSG_OFF || _rom_trdos)
            return;

        if (_turboSound === VAL_TS_AUTO) {
            _turboSound = VAL_TS_POWER_OF_SOUND;
            _turboSoundAutoDetected = true;
        }
        if (_turboSound !== VAL_TS_POWER_OF_SOUND)
            return;

        switch (data) {
            case 0: _activeSet = _set0; break;
            case 1: _activeSet = _set1; break;
        }
    }

    function io_write_reg(address, data) {
        if (_psgMode === VAL_PSG_OFF)
            return;

        if (data < 0x10) {
            var set = (_turboSound === VAL_TS_QUADRO_AY)
                ? ((address & 0x1000) ? _set0 : _set1)
                : _activeSet;
            set.regIndex = data;
        }
        else if ((data & 0xFE) === 0xFE) {
            if (_turboSound === VAL_TS_AUTO) {
                _turboSound = VAL_TS_NEDO_PC;
                _turboSoundAutoDetected = true;
            }
            if (_turboSound !== VAL_TS_NEDO_PC)
                return;

            _activeSet = (data & 1) ? _set0 : _set1;
        }
    }

    function io_write_data(address, data) {
        if (_psgMode === VAL_PSG_OFF)
            return;

        if (!(address & 0x1000) && _turboSound === VAL_TS_AUTO) {
            _turboSound = VAL_TS_QUADRO_AY;
            _turboSoundAutoDetected = true;
        }

        var set = (_turboSound === VAL_TS_QUADRO_AY)
            ? ((address & 0x1000) ? _set0 : _set1)
            : _activeSet;
        set.regs[set.regIndex] = data & _masks[set.regIndex];
        onPsgRegisterSet(set);
    }

    function io_read_data(address, data) {
        if (_psgMode === VAL_PSG_OFF)
            return;

        var set = (_turboSound === VAL_TS_QUADRO_AY)
            ? ((address & 0x1000) ? _set0 : _set1)
            : _activeSet;
        return set.regs[set.regIndex];
    }

    function io_write_fe(address, data) {
        _beeperBit = +!!(data & 0x10);
    }

    function onPsgRegisterSet(set) {
        switch (set.regIndex) {
            case PSG_REG.TONE_A_FINE:
            case PSG_REG.TONE_A_COARSE: 
                set.psg.setTone(0, (set.regs[PSG_REG.TONE_A_COARSE] << 8) | set.regs[PSG_REG.TONE_A_FINE]); 
                break;
            case PSG_REG.TONE_B_FINE:
            case PSG_REG.TONE_B_COARSE: 
                set.psg.setTone(1, (set.regs[PSG_REG.TONE_B_COARSE] << 8) | set.regs[PSG_REG.TONE_B_FINE]); 
                break;
            case PSG_REG.TONE_C_FINE:
            case PSG_REG.TONE_C_COARSE: 
                set.psg.setTone(2, (set.regs[PSG_REG.TONE_C_COARSE] << 8) | set.regs[PSG_REG.TONE_C_FINE]); 
                break;
            case PSG_REG.NOISE: 
                set.psg.setNoise(set.regs[PSG_REG.NOISE]); 
                break;
            case PSG_REG.MIXER: 
                set.psg.channels[0].tOff = (set.regs[PSG_REG.MIXER] >> 0) & 1;
                set.psg.channels[1].tOff = (set.regs[PSG_REG.MIXER] >> 1) & 1;
                set.psg.channels[2].tOff = (set.regs[PSG_REG.MIXER] >> 2) & 1;
                set.psg.channels[0].nOff = (set.regs[PSG_REG.MIXER] >> 3) & 1;
                set.psg.channels[1].nOff = (set.regs[PSG_REG.MIXER] >> 4) & 1;
                set.psg.channels[2].nOff = (set.regs[PSG_REG.MIXER] >> 5) & 1;
                break;
            case PSG_REG.VOLUME_A:
                set.psg.setVolume(0, set.regs[PSG_REG.VOLUME_A] & 0x0F);
                set.psg.channels[0].eOn = !!(set.regs[PSG_REG.VOLUME_A] & 0x10);
                break;
            case PSG_REG.VOLUME_B:
                set.psg.setVolume(1, set.regs[PSG_REG.VOLUME_B] & 0x0F);
                set.psg.channels[1].eOn = !!(set.regs[PSG_REG.VOLUME_B] & 0x10);
                break;
            case PSG_REG.VOLUME_C:
                set.psg.setVolume(2, set.regs[PSG_REG.VOLUME_C] & 0x0F);
                set.psg.channels[2].eOn = !!(set.regs[PSG_REG.VOLUME_C] & 0x10);
                break;
            case PSG_REG.ENVELOPE_FINE:
            case PSG_REG.ENVELOPE_COARSE: 
                set.psg.setEnvelope((set.regs[PSG_REG.ENVELOPE_COARSE] << 8) | set.regs[PSG_REG.ENVELOPE_FINE]); 
                break;
            case PSG_REG.ENVELOPE_SHAPE: 
                set.psg.setEnvelopeShape(set.regs[PSG_REG.ENVELOPE_SHAPE]); 
                break;
        }
    }

    function process() {
        var beeperValue = _beeper ? (_beeperBit ? _beeperVolume : 0.0) : 0.0;
        if (_turboSound === VAL_TS_OFF || _turboSound === VAL_TS_AUTO) {
            _activeSet.psg.process();
            _activeSet.psg.removeDC();
            _sampleBufferLeft[_sampleBufferIndex] = _activeSet.psg.left * _psgVolume + beeperValue;
            _sampleBufferRight[_sampleBufferIndex] = _activeSet.psg.right * _psgVolume + beeperValue;
        }
        else {
            _set0.psg.process();
            _set0.psg.removeDC();
            _set1.psg.process();
            _set1.psg.removeDC();
            _sampleBufferLeft[_sampleBufferIndex] = (_set0.psg.left + _set1.psg.left) * _psgVolume + beeperValue;
            _sampleBufferRight[_sampleBufferIndex] = (_set0.psg.right + _set1.psg.right) * _psgVolume + beeperValue;
        }

        if (++_sampleBufferIndex == _sampleBufferLeft.length) {
            _onDataReady.emit({
                left: _sampleBufferLeft,
                right: _sampleBufferRight,
                sampleCount: _sampleBufferLeft.length
            });
            _sampleBufferLeft = new Float32Array(_sampleBufferSize);
            _sampleBufferRight = new Float32Array(_sampleBufferSize);
            _sampleBufferIndex = 0;
        }

        if (_processTaskInvalid) {
            scheduleProcessTask();
        }
    }

    this.connect = connect;
    this.applySettings = function (beeper, beeperVolume, psgMode, turboSound, channelLayout, psgClock, psgPacketSize, psgVolume) {
        _beeper = beeper;
        _beeperVolume = beeperVolume;
        _psgMode = psgMode;
        if (turboSound !== VAL_TS_AUTO || !_turboSoundAutoDetected) {
            _turboSound = turboSound;
        }
        _channelLayout = channelLayout;
        _psgClock = psgClock;
        _sampleBufferSize = psgPacketSize || 512;
        _psgVolume = psgVolume;
        configure();
    }
    this.getVolume = function () {
        return {
            beeperVolume: _beeperVolume,
            psgVolume: _psgVolume
        };
    }
    this.setVolume = function (beeperVolume, psgVolume) {
        _beeperVolume = beeperVolume;
        _psgVolume = psgVolume;
    }
    this.getState = function () {
        return {
            psg0: {
                address: _set0.regIndex,
                registers: _set0.regs.slice()
            },
            psg1: {
                address: _set1.registers,
                registers: _set1.regs.slice()
            },
            activePsg: _activeSet === _set0 ? 0 : 1
        };
    }
    this.setState = function (value) {
        if (value && value.psg0) {
            for (var i = 0; i < 16; i++) {
                _set0.regIndex = i;
                _set0.regs[i] = value.psg0.registers[i];
                onPsgRegisterSet(_set0);
            }
            _set0.regIndex = value.psg0.address;
        }
        if (value && value.psg1) {
            for (var i = 0; i < 16; i++) {
                _set1.regIndex = i;
                _set1.regs[i] = value.psg1.registers[i];
                onPsgRegisterSet(_set1);
            }
            _set1.regIndex = value.psg1.address;
        }
        if (value && value.activePsg !== 'undefined') {
            _activeSet = value.activePsg === 0 ? _set0 : _set1;
        }
        else if (value && value.psg0) {
            _activeSet = _set0;
        }
    }
    this.get_onDataReady = function () {
        return _onDataReady.pub;
    }
}