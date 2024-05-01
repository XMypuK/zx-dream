function ZX_TapeRecorder() {
    'use strict';

    this.connect = connect;
    this.insertTape = insertTape;
    this.ejectTape = ejectTape;
    this.play = play;
    this.pause = pause;
    this.stop = stop;
    this.getStructure = getStructure;
    this.selectBlock = selectBlock;
    this.applySettings = applySettings;
    this.get_state = get_state;
    this.get_onStateChanged = get_onStateChanged;
    this.get_onTapeEvent = get_onTapeEvent;
    this.get_prePauseCounterPulseDuration = get_prePauseCounterPulseDuration;
    this.get_defaultPause = get_defaultPause;
    this.get_autoPlayOnStandardRoutine = get_autoPlayOnStandardRoutine;
    this.get_autoStopAfterDataBlock = get_autoStopAfterDataBlock;
    this.get_autoStopOnLongPostPause = get_autoStopOnLongPostPause;
    this.get_autoStopOnLongPostPauseDuration = get_autoStopOnLongPostPauseDuration;
    this.get_autoStopOnZeroPostPause = get_autoStopOnZeroPostPause;
    this.get_boostFactor = get_boostFactor;

    var TSTATES_PER_MS = 3500;
    
    var TZX_BLOCK_ID = {
        STANDARD_SPEED: 0x10,
        TURBO_SPEED: 0x11,
        PURE_TONE: 0x12,
        PULSE_SEQUENCE: 0x13,
        PURE_DATA: 0x14,
        DIRECT_RECORD: 0x15,
        C64_STANDARD: 0x16,
        C64_TURBO: 0x17,
        CSW_RECORD: 0x18,
        GENERAL_RECORD: 0x19,
        PAUSE: 0x20,
        GROUP_START: 0x21,
        GROUP_END: 0x22,
        JUMP: 0x23,
        LOOP_START: 0x24,
        LOOP_END: 0x25,
        CALL: 0x26,
        RETURN: 0x27,
        SELECT: 0x28,
        STOP_48K: 0x2A,
        LEVEL: 0x2B,
        DESCRIPTION: 0x30,
        MESSAGE: 0x31,
        ARCHIVE_INFO: 0x32,
        HARDWARE: 0x33,
        EMULATION_INFO: 0x34,
        CUSTOM_INFO: 0x35,
        SNAPSHOT: 0x40,
        GLUE: 0x5A
    };

    var CSW_COMPRESSION = {
        RLE: 1,
        ZRLE: 2
    };

    var _bus;
    var _clock;
    var _state = VAL_TR_EMPTY;
    var _pulseEnumerator = null;
    var _baseTstates = 0;
    var _onStateChanged = new ZX_Event();
    var _onTapeEvent = new ZX_Event();
    var _prePauseCounterPulseDuration = 1;
    var _defaultPause = 1500;
    var _autoPlayOnStandardRoutine = true;
    var _autoStopAfterDataBlock = VAL_TAPACT_SIMPLE_TAPES;
    var _autoStopOnLongPostPause = VAL_TAPACT_SIMPLE_TAPES;
    var _autoStopOnLongPostPauseDuration = 3500;
    var _autoStopOnZeroPostPause = true;
    var _boostFactor = 8;

    function connect(bus, clock) {
        _bus = bus;
        _clock = clock;
        bus.on_io_read(io_read_fe, { mask: 0x01, value: 0x00 });
        bus.on_instruction_read(instruction_read_0556, { mask: 0xFFFF, value: 0x0556 });
        bus.on_var_write(write_7ffd, 'port_7ffd_value');
        bus.on_var_write(write_intrq, 'intrq');
    }

    function insertTape(data, format) {
        if (_state === VAL_TR_PLAYBACK) {
            stop();
        }
        var options = {
            format: format,
            callback: onTZXEvent
        };
        switch (format) {
            case TapeFormat.TZX: 
                _pulseEnumerator = new TZXPulseEnumerator(data, options);
                _pulseEnumerator.set_mode48(!!(ZXContext.hw.bus.var_read('port_7ffd_value') & 0x20));
                break;
            default: 
                _pulseEnumerator = new PulseEnumerator(data, options);
                break;
        }
        propogateSettingsToPulseEnumerator();
        _baseTstates = 0;
        setState(VAL_TR_INITIALIZED);
    }

    function ejectTape() {
        if (_state === VAL_TR_PLAYBACK) {
            stop();
        }
        _pulseEnumerator = null;
        setState(VAL_TR_EMPTY);
    }

    function play() {
        if (_state === VAL_TR_EMPTY)
            throw new Error(ZX_Lang.ERR_TR_EMPTY);
        _baseTstates = _clock.get_tstates();
        setState(VAL_TR_PLAYBACK);
    }

    function pause() {
        if (_state === VAL_TR_EMPTY)
            throw new Error(ZX_Lang.ERR_TR_EMPTY);
        _pulseEnumerator.resetBlock();
        setState(VAL_TR_SUSPENDED);
    }

    function stop() {
        if (_state === VAL_TR_EMPTY)
            throw new Error(ZX_Lang.ERR_TR_EMPTY);
        _pulseEnumerator.reset();
        setState(VAL_TR_INITIALIZED);
    }

    function getStructure() {
        if (_state === VAL_TR_EMPTY)
            return null;
        var structure = _pulseEnumerator.get_structure();
        return structure;
    }
    
    function selectBlock(index) {
        if (_state === VAL_TR_EMPTY)
            throw new Error(ZX_Lang.ERR_TR_EMPTY);
        if (_state === VAL_TR_PLAYBACK) {
            pause();
        }
        _pulseEnumerator.selectBlock(index);
        setState(VAL_TR_SUSPENDED);
    }

    function get_state() {
        return _state;
    }

    function get_onStateChanged() {
        return _onStateChanged.pub;
    }

    function get_onTapeEvent() {
        return _onTapeEvent.pub;
    }
    
    function applySettings(
        prePauseCounterPulseDuration,
        defaultPause,
        autoPlayOnStandardRoutine,
        autoStopAfterDataBlock,
        autoStopOnLongPostPause,
        autoStopOnLongPostPauseDuration,
        autoStopOnZeroPostPause,
        boostFactor) {

        _prePauseCounterPulseDuration = prePauseCounterPulseDuration;
        _defaultPause = defaultPause;
        _autoPlayOnStandardRoutine = autoPlayOnStandardRoutine;
        _autoStopAfterDataBlock = autoStopAfterDataBlock;
        _autoStopOnLongPostPause = autoStopOnLongPostPause;
        _autoStopOnLongPostPauseDuration = autoStopOnLongPostPauseDuration;
        _autoStopOnZeroPostPause = autoStopOnZeroPostPause;
        _boostFactor = boostFactor;
        
        propogateSettingsToPulseEnumerator();
    }

    function propogateSettingsToPulseEnumerator() {
        if (!_pulseEnumerator)
            return; 

        var structure = _pulseEnumerator.get_structure();
        var structureIsSimple = isSimpleStructure(structure);

        _pulseEnumerator.set_prePauseCounterPulseDuration(_prePauseCounterPulseDuration);
        _pulseEnumerator.set_defaultPause(_defaultPause);
        switch (_autoStopAfterDataBlock) {
            case VAL_TAPACT_NO: _pulseEnumerator.set_autoStopAfterDataBlock(false); break;
            case VAL_TAPACT_ALL_TAPES: _pulseEnumerator.set_autoStopAfterDataBlock(true); break;
            case VAL_TAPACT_SIMPLE_TAPES: _pulseEnumerator.set_autoStopAfterDataBlock(structureIsSimple); break;
        }

        if (!(_pulseEnumerator instanceof TZXPulseEnumerator))
            return;
        
        switch (_autoStopOnLongPostPause) {
            case VAL_TAPACT_NO: _pulseEnumerator.set_autoStopOnLongPostPauseDuration(0); break;
            case VAL_TAPACT_ALL_TAPES: _pulseEnumerator.set_autoStopOnLongPostPauseDuration(_autoStopOnLongPostPauseDuration); break;
            case VAL_TAPACT_SIMPLE_TAPES: _pulseEnumerator.set_autoStopOnLongPostPauseDuration(structureIsSimple ? _autoStopOnLongPostPauseDuration : 0); break;
        }
        _pulseEnumerator.set_autoStopOnZeroPostPause(_pulseEnumerator.set_autoStopOnZeroPostPause());
    }

    function get_prePauseCounterPulseDuration() {
        return _prePauseCounterPulseDuration;
    }

    function get_defaultPause() {
        return _defaultPause;
    }

    function get_autoPlayOnStandardRoutine() {
        return _autoPlayOnStandardRoutine;
    }

    function get_autoStopAfterDataBlock() {
        return _autoStopAfterDataBlock;
    }

    function get_autoStopOnLongPostPause() {
        return _autoStopOnLongPostPause;
    }

    function get_autoStopOnLongPostPauseDuration() {
        return _autoStopOnLongPostPauseDuration;
    }

    function get_autoStopOnZeroPostPause() {
        return _autoStopOnZeroPostPause;
    }

    function get_boostFactor() {
        return _boostFactor;
    }

    function isSimpleStructure(structure) {
        if (!structure)
            return true;

        var headerEncountered = false;
        for (var i = 0; i < structure.blocks.length; i++) {
            var block = structure.blocks[i];
            if (!headerEncountered) {
                if (structure.format === TapeFormat.TZX) {
                    switch (block.id) {
                        case TZX_BLOCK_ID.STANDARD_SPEED:
                            if (!(block instanceof TapeHeaderBlockInfo))
                                return false;
                            headerEncountered = true;
                            break;
                        case TZX_BLOCK_ID.PAUSE:
                        case TZX_BLOCK_ID.GROUP_START:
                        case TZX_BLOCK_ID.GROUP_END:
                        case TZX_BLOCK_ID.JUMP:
                        case TZX_BLOCK_ID.LOOP_START:
                        case TZX_BLOCK_ID.LOOP_END:
                        case TZX_BLOCK_ID.CALL:
                        case TZX_BLOCK_ID.RETURN:
                        case TZX_BLOCK_ID.SELECT:
                        case TZX_BLOCK_ID.STOP_48K:
                        case TZX_BLOCK_ID.DESCRIPTION:
                        case TZX_BLOCK_ID.MESSAGE:
                        case TZX_BLOCK_ID.ARCHIVE_INFO:
                        case TZX_BLOCK_ID.HARDWARE:
                        case TZX_BLOCK_ID.EMULATION_INFO:
                        case TZX_BLOCK_ID.CUSTOM_INFO:
                        case TZX_BLOCK_ID.SNAPSHOT:
                        case TZX_BLOCK_ID.GLUE:
                            break;
                        default:
                            return false;
                    }
                }
                else {
                    if (!(block instanceof TapeHeaderBlockInfo))
                        return false;
                    headerEncountered = true;
                }
            }
            else {
                if (structure.format === TapeFormat.TZX) {
                    switch (block.id) {
                        case TZX_BLOCK_ID.STANDARD_SPEED:
                            if (block instanceof TapeHeaderBlockInfo)
                                return false;
                            headerEncountered = false;
                            break;
                        default:
                            return false;
                    }
                }
                else {
                    if (block instanceof TapeHeaderBlockInfo)
                        return false;
                    headerEncountered = false;
                }
            }
        }
        return true;
    }

    function readTape() {
        var tstates = _clock.get_tstates();
        do {
            var pattern = _pulseEnumerator.get_current();
            if (!pattern)
                continue;
            var patternStart = _baseTstates + pattern.shift;
            if (tstates < patternStart)
                return 0xBF;
            var patternEnd = patternStart + pattern.duration * pattern.count;
            if (tstates < patternEnd) {
                var pulseIndex = ((tstates - patternStart) / pattern.duration) | 0;
                var level = (pattern.index + pulseIndex + 1) & 1;
                return level ? 0xFF : 0xBF;
            }
        } while (_pulseEnumerator.next());
        // A tape is playing while the enumerator.next() returns true.
        // Once it returned false, we have reached either the end of a tape or a pause command.
        // In the latter case, the user should continue playback manually.
        if (_pulseEnumerator.get_currentBlockIndex() !== null) {
            _pulseEnumerator.resetBlock();
            setState(VAL_TR_SUSPENDED);
        }
        else {
            _pulseEnumerator.reset();
            setState(VAL_TR_INITIALIZED);
        }
        return 0xBF;
    }

    function io_read_fe(address) {
        if (_state !== VAL_TR_PLAYBACK)
            return 0xBF;
        return readTape();
    }

    function instruction_read_0556(address) {
        if (!_autoPlayOnStandardRoutine || _state === VAL_TR_EMPTY)
            return;
        var rom_trdos = _bus.var_read('rom_trdos');
        if (rom_trdos)
            return;
        var rom_sos128 = !(_bus.var_read('port_7ffd_value') & 0x10);
        if (rom_sos128)
            return;
        if (_state === VAL_TR_PLAYBACK) {
            if (_pulseEnumerator.get_autoStopChance()) {
                _pulseEnumerator.supressAutoStop();
            }
        }
        else {
            play();
        }
    }

    function write_7ffd(variable, value) {
        if (_pulseEnumerator && _pulseEnumerator instanceof TZXPulseEnumerator) {
            _pulseEnumerator.set_mode48(!!(value & 0x20));
        }
    }

    function write_intrq(variable, value) {
        if (value && _state === VAL_TR_PLAYBACK) {
            readTape();
        }
    }

    function onTZXEvent(event) {
        _onTapeEvent.emit(event);
    }

    function setState(value) {
        if (_state != value) {
            _state = value;
            _bus.opt(OPT_TAPE_BOOST_FACTOR, _state === VAL_TR_PLAYBACK ? _boostFactor : 1);
            _onStateChanged.emit({ state: value });
        }
    }

    function PulseEnumerator(data, options) {
        var _blocks = [];
        var _block = null;
        var _initialized = false;
        var _patterns = new PulseBuffer();
        var _callback = options && typeof options.callback === 'function' && options.callback || (function () {});
        var _format = options && options.format || TapeFormat.TAP;
        var _size = data.length;
        var _prePauseCounterPulseDuration = 1;
        var _defaultPause = 1500;
        var _autoStopAfterDataBlock = true;
        var _autoStopChance = false;

        var BP_STATE = {
            PRE: 0,
            PILOT_PROCESSING: 1,
            DATA_PROCESSING: 2,
            PAUSE_PROCESSING: 3,
            POST: 4
        };

        buildBlockMap(data);

        this.get_prePauseCounterPulseDuration = function () {
            return _prePauseCounterPulseDuration;
        }
        this.set_prePauseCounterPulseDuration = function (value) {
            _prePauseCounterPulseDuration = value;
        }
        this.get_defaultPause = function () {
            return _defaultPause;
        }
        this.set_defaultPause = function (value) {
            _defaultPause = value;
        }
        this.get_autoStopAfterDataBlock = function () {
            return _autoStopAfterDataBlock;
        }
        this.set_autoStopAfterDataBlock = function (value) {
            _autoStopAfterDataBlock = value;
        }

        this.get_autoStopChance = function () {
            return _autoStopChance;
        }
        
        this.get_current = function () {
            return _patterns.get_current();
        }

        this.get_currentBlockIndex = function () {
            return _block ? _block.index : null;
        }
        this.get_structure = function () {
            var tapeInfo = new TapeInfo();
            tapeInfo.format = _format;
            tapeInfo.formatVersion = null;
            tapeInfo.size = _size;
            tapeInfo.blocks = _blocks.map(function (b) {
                var isHeader = (b.data.length === 19 || b.data.length === 18 && _format == TapeFormat.STA) && !(b.data[0] & 0x80);
                var info = createBlockInfo(b, isHeader ? TapeHeaderBlockInfo : TapeDataBlockInfo);
                info.size = b.data.length + 2;
                if (isHeader) {
                    appendHeaderInfo(b, info);
                }
                return info;
            });
            tapeInfo.currentIndex = _block ? _block.index : null;
            return tapeInfo;
        }

        this.next = function () {
            var result = _patterns.next();
            if (!result) {
                prepareBuffer();
                result = !!_patterns.get_current();
                if (!result) {
                    _patterns.clear();
                }
            }
            return result;
        }

        this.reset = function () {
            if (_block) {
                _block.__state = BP_STATE.PRE;
            }
            _block = null;
            _initialized = false;
            _patterns.clear();
        }

        this.resetBlock = function () {
            if (!_block)
                return;
            _block.__state = BP_STATE.PRE;
            _patterns.clear();
        }

        this.selectBlock = function (index) {
            if (index < 0 || index >= _blocks.length)
                throw new Error(ZX_Lang.ERR_TAPE_BLOCK_OUT_OF_RANGE);

            _block = _blocks[index];
            _patterns.clear();
            _initialized = true;
        }

        this.supressAutoStop = function () {
            _autoStopChance = false;
        }

        function buildBlockMap(data) {
            var input = new MemoryStream(data);
            if (_format == TapeFormat.ZXT) {
                input.seek(128, SeekOrigin.begin);
            }
            while (1) {
                var blockSizeArr = input.readMultuple(2);
                if (blockSizeArr.length == 0)
                    break;
                if (blockSizeArr.length < 2)
                    throw new Error(ZX_Lang.ERR_TR_UNEXPECTED_STREAM_END);
                var blockSize = (blockSizeArr[1] << 8) | blockSizeArr[0];
                switch (_format) {
                    case TapeFormat.SPC:
                    case TapeFormat.LTP:
                        blockSize += 2;
                        break;
                    case TapeFormat.STA:
                        blockSize += 1;
                        break;
                }
                var block = {
                    index: _blocks.length,
                    data: input.readMultuple(blockSize),
                    __state: BP_STATE.PRE
                };
                _blocks.push(block);
            }
        }

        function prepareBuffer() {
            if (!_initialized && _blocks.length > 0) {
                _block = _blocks[0];
                _initialized = true;
            }
            if (!_block)
                return;
            switch (_block.__state) {
                case BP_STATE.PRE: {
                    _autoStopChance = false;
                    _block.__data = new MemoryStream(_block.data);
                    var flag = _block.data.length > 0 ? _block.data[0] : 0;
                    _patterns.appendComplement(2168, (flag & 0x80) ? 3223 : 8063);
                    _patterns.appendComplement(667, 1);
                    _patterns.appendComplement(735, 1);
                    _block.__flag = flag;
                    _block.__parity = flag;
                    _block.__state = BP_STATE.DATA_PROCESSING;
                    break;
                }
                case BP_STATE.DATA_PROCESSING: {
                    var leftover = _block.__data.get_length() - _block.__data.get_position();
                    if (leftover > 0) {
                        var last = leftover === 1;
                        var value = _block.__data.read();
                        if (value < 0)
                            throw new Error(ZX_Lang.ERR_TR_UNEXPECTED_STREAM_END);
                        if (last && _format == TapeFormat.SPC) {
                            value ^= _block.__flag;
                        }
                        _block.__parity ^= value;
                        _patterns.appendBits(value, 8, 855, 1710);
                        if (last) {
                            if (_format == TapeFormat.STA) {
                                _patterns.appendByte(_block.__parity, 8, 855, 1710);
                            }
                            _autoStopChance = _autoStopAfterDataBlock && !(_block.data.length === 19 && !(_block.data[0] & 0x80));
                        }
                    }
                    else {
                        _block.__state = BP_STATE.PAUSE_PROCESSING;
                        prepareBuffer();
                    }
                    break;
                }
                case BP_STATE.PAUSE_PROCESSING: {
                    _patterns.appendPause(
                        _prePauseCounterPulseDuration * TSTATES_PER_MS, 
                        _defaultPause * TSTATES_PER_MS);
                    if (!_autoStopChance) {
                        _block.__state = BP_STATE.PRE;
                        goToNextBlock();
                    }
                    else {
                        _block.__state = BP_STATE.POST;
                    }
                    break;
                }
                case BP_STATE.POST: {
                    _block.__state = BP_STATE.PRE;
                    goToNextBlock();
                    break;
                }
            }
        }

        function goToNextBlock() {
            var nextBlockIndex = _block.index + 1;
            _block = (nextBlockIndex >= 0 || nextBlockIndex < _blocks.length)
                ?_blocks[nextBlockIndex]
                : null;
            if (!_block) {
                _patterns.appendPause(
                    _prePauseCounterPulseDuration * TSTATES_PER_MS, 
                    0);
            }
        }

        function createBlockInfo(block, BlockInfoType) {
            var info = new BlockInfoType();
            info.index = block.index;
            info.id = null;
            info.idDescription = ZX_Lang.TPINF_BLK_STANDARD;
            return info;
        }

        function appendHeaderInfo(block, info) {
            info.type = block.data[1];
            info.typeDescription = getHeaderBlockTypeDescription(block.data[1]);
            info.filename = String.fromCharCode.apply(String, block.data.slice(2, 12));
            info.binLength = (block.data[13] << 8) | block.data[12];
            info.param1 = (block.data[15] << 8) | block.data[14];
            info.param2 = (block.data[17] << 8) | block.data[16];
        }

        function getHeaderBlockTypeDescription(type) {
            switch (type) {
                case 0: return ZX_Lang.TPINF_HDR_PROGRAM;
                case 1: return ZX_Lang.TPINF_HDR_NUMBER_ARRAY;
                case 2: return ZX_Lang.TPINF_HDR_CHARACTER_ARRAY;
                case 3: return ZX_Lang.TPINF_HDR_CODE;
                default: return '';
            }
        }      
    }

    function TZXPulseEnumerator(data, options) {
        var BP_STATE = {
            PRE: 0,
            PILOT_PROCESSING: 1,
            DATA_PROCESSING: 2,
            PAUSE_PROCESSING: 3,
            POST: 4
        };

        var _verMajor;
        var _verMinor;
        var _size = data.length;
        var _blocks = [];
        var _block = null;
        var _initialized = false;
        var _patterns = new PulseBuffer();
        var _callStack = [];
        var _loopStack = [];
        var _groupLevel = 0;
        var _callback = options && typeof options.callback === 'function' && options.callback || (function () {});
        var _mode48 = false;
        var _prePauseCounterPulseDuration = 1;
        var _defaultPause = 1500;
        var _autoStopAfterDataBlock = true;
        var _autoStopOnLongPostPauseDuration = 3500;
        var _autoStopOnZeroPostPause = true;
        var _autoStopChance = false;
        
        this.get_current = get_current;
        this.get_currentBlockIndex = get_currentBlockIndex;
        this.get_structure = get_structure;
        this.reset = reset;
        this.resetBlock = resetBlock;
        this.next = next;
        this.selectBlock = selectBlock;

        this.get_mode48 = function () {
            return _mode48;
        }
        this.set_mode48 = function (value) {
            _mode48 = value;
        }
        this.get_prePauseCounterPulseDuration = function () {
            return _prePauseCounterPulseDuration;
        }
        this.set_prePauseCounterPulseDuration = function (value) {
            _prePauseCounterPulseDuration = value;
        }
        this.get_defaultPause = function () {
            return _defaultPause;
        }
        this.set_defaultPause = function (value) {
            _defaultPause = value;
        }
        this.get_autoStopAfterDataBlock = function () {
            return _autoStopAfterDataBlock;
        }
        this.set_autoStopAfterDataBlock = function (value) {
            _autoStopAfterDataBlock = value;
        }
        this.get_autoStopOnLongPostPauseDuration = function () {
            return _autoStopOnLongPostPauseDuration;
        }
        this.set_autoStopOnLongPostPauseDuration = function (value) {
            _autoStopOnLongPostPauseDuration = value;
        }
        this.get_autoStopOnZeroPostPause = function () {
            return _autoStopOnZeroPostPause;
        }
        this.set_autoStopOnZeroPostPause = function (value) {
            _autoStopOnZeroPostPause = value;
        }
        this.get_autoStopChance = function () {
            return _autoStopChance;
        }
        this.supressAutoStop = function () {
            _autoStopChance = false;
        }

        buildBlockMap(data);

        function get_current() {
            return _patterns.get_current();
        }

        function get_currentBlockIndex() {
            return _block ? _block.index : null;
        }

        function get_structure() {
            return createStructureInfo(_blocks);
        }

        function reset() {
            if (_block && '__state' in _block) {
                _block.__state = BP_STATE.PRE;
            }
            _block = null;
            _initialized = false;
            _patterns.clear();
            _callStack = [];
            _loopStack = [];
        }

        function resetBlock() {
            if (!_block)
                return;
            if ('__state' in _block) {
                _block.__state = BP_STATE.PRE;
            }
            _patterns.clear();
        }

        function next() {
            var result = _patterns.next();
            if (!result) {
                prepareBuffer();
                result = !!_patterns.get_current();
                if (!result) {
                    _patterns.clear();
                }
            }
            return result;
        }

        function selectBlock(index) {
            if (index < 0 || index >= _blocks.length)
                throw new Error(ZX_Lang.ERR_TAPE_BLOCK_OUT_OF_RANGE);

                goToBlock(index);
            _initialized = true;
            _patterns.clear();
        }

        function buildBlockMap(data) {
            var input = new MemoryStream(data);
            var header = readByteArray(input, 8);
            if (String.fromCharCode.apply(String, header) !== 'ZXTape!\x1A')
                throw new Error(ZX_Lang.ERR_TAPE_WRONG_TZX_HEADER);
            var ver = readByteArray(input, 2);
            _verMajor = ver[0];
            _verMinor = ver[1];

            var blockId;
            while ((blockId = input.read()) >= 0) {
                var block = {
                    index: _blocks.length,
                    id: blockId
                };
                _blocks.push(block);
                switch (block.id) {
                    case TZX_BLOCK_ID.STANDARD_SPEED: readStandardSpeedBlock(input, block); break;
                    case TZX_BLOCK_ID.TURBO_SPEED: readTurboSpeedBlock(input, block); break;
                    case TZX_BLOCK_ID.PURE_TONE: readPureToneBlock(input, block); break;
                    case TZX_BLOCK_ID.PULSE_SEQUENCE: readPulseSequenceBlock(input, block); break;
                    case TZX_BLOCK_ID.PURE_DATA: readPureDataBlock(input, block); break;
                    case TZX_BLOCK_ID.DIRECT_RECORD: readDirectRecordBlock(input, block); break;
                    case TZX_BLOCK_ID.C64_STANDARD: readC64StandardBlock(input, block); break;
                    case TZX_BLOCK_ID.C64_TURBO: readC64TurboBlock(input, block); break;
                    case TZX_BLOCK_ID.CSW_RECORD: readCswRecordBlock(input, block); break;
                    case TZX_BLOCK_ID.GENERAL_RECORD: readGeneralRecordBlock(input, block); break;
                    case TZX_BLOCK_ID.PAUSE: readPauseBlock(input, block); break;
                    case TZX_BLOCK_ID.GROUP_START: readGroupStartBlock(input, block); break;
                    case TZX_BLOCK_ID.GROUP_END: readGroupEndBlock(input, block); break;
                    case TZX_BLOCK_ID.JUMP: readJumpBlock(input, block); break;
                    case TZX_BLOCK_ID.LOOP_START: readLoopStartBlock(input, block); break;
                    case TZX_BLOCK_ID.LOOP_END: readLoopEndBlock(input, block); break;
                    case TZX_BLOCK_ID.CALL: readCallBlock(input, block); break;
                    case TZX_BLOCK_ID.RETURN: readReturnBlock(input, block); break;
                    case TZX_BLOCK_ID.SELECT: readSelectBlock(input, block); break;
                    case TZX_BLOCK_ID.STOP_48K: readStop48kBlock(input, block); break;
                    case TZX_BLOCK_ID.LEVEL: readLevelBlock(input, block); break;
                    case TZX_BLOCK_ID.DESCRIPTION: readDescriptionBlock(input, block); break;
                    case TZX_BLOCK_ID.MESSAGE: readMessageBlock(input, block); break;
                    case TZX_BLOCK_ID.ARCHIVE_INFO: readArchiveInfoBlock(input, block); break;
                    case TZX_BLOCK_ID.HARDWARE: readHardwareBlock(input, block); break;
                    case TZX_BLOCK_ID.EMULATION_INFO: readEmulationInfoBlock(input, block); break;
                    case TZX_BLOCK_ID.CUSTOM_INFO: readCustomInfoBlock(input, block); break;
                    case TZX_BLOCK_ID.SNAPSHOT: readSnapshotBlock(input, block); break;
                    case TZX_BLOCK_ID.GLUE: readGlueBlock(input, block); break;
                    default: readUnsupportedBlock(input, block); break;
                }
            }
        }

        function prepareBuffer() {
            if (!_initialized && _blocks.length > 0) {
                _block = _blocks[0];
                _initialized = true;
            }
            if (!_block) 
                return;
            switch (_block.id) {
                case TZX_BLOCK_ID.STANDARD_SPEED: processDataBlock(_block, false, false); break;
                case TZX_BLOCK_ID.TURBO_SPEED: processDataBlock(_block, true, false); break;
                case TZX_BLOCK_ID.PURE_TONE: processPureToneBlock(_block); break;
                case TZX_BLOCK_ID.PULSE_SEQUENCE: processPulseSequenceBlock(_block); break;
                case TZX_BLOCK_ID.PURE_DATA: processDataBlock(_block, true, true); break;
                case TZX_BLOCK_ID.DIRECT_RECORD: processDirectRecordBlock(_block); break;
                case TZX_BLOCK_ID.C64_STANDARD: goToNextBlock(); prepareBuffer(); break;
                case TZX_BLOCK_ID.C64_TURBO: goToNextBlock(); prepareBuffer(); break;
                case TZX_BLOCK_ID.CSW_RECORD: processCswRecordBlock(_block); break;
                case TZX_BLOCK_ID.GENERAL_RECORD: processGeneralRecordBlock(_block); break;
                case TZX_BLOCK_ID.PAUSE: processPauseBlock(_block); break;
                case TZX_BLOCK_ID.GROUP_START: processGroupStartBlock(_block); break;
                case TZX_BLOCK_ID.GROUP_END: processGroupEndBlock(_block); break;
                case TZX_BLOCK_ID.JUMP: processJumpBlock(_block); break;
                case TZX_BLOCK_ID.LOOP_START: processLoopStartBlock(_block); break;
                case TZX_BLOCK_ID.LOOP_END: processLoopEndBlock(_block); break;
                case TZX_BLOCK_ID.CALL: processCallBlock(_block); break;
                case TZX_BLOCK_ID.RETURN: processReturnBlock(_block); break;
                case TZX_BLOCK_ID.SELECT: processSelectBlock(_block); break;
                case TZX_BLOCK_ID.STOP_48K: processStop48kBlock(_block); break;
                case TZX_BLOCK_ID.LEVEL: processLevelBlock(_block); break;
                case TZX_BLOCK_ID.DESCRIPTION: processDescriptionBlock(_block); break;
                case TZX_BLOCK_ID.MESSAGE: processMessageBlock(_block); break;
                case TZX_BLOCK_ID.ARCHIVE_INFO: processArchiveInfoBlock(_block); break;
                case TZX_BLOCK_ID.HARDWARE: processHardwareBlock(_block); break;
                case TZX_BLOCK_ID.EMULATION_INFO: goToNextBlock(); prepareBuffer(); break;
                case TZX_BLOCK_ID.CUSTOM_INFO: processCustomInfoBlock(_block); break;
                case TZX_BLOCK_ID.SNAPSHOT: processSnapshotBlock(_block); break;
                case TZX_BLOCK_ID.GLUE: goToNextBlock(); prepareBuffer(); break;
                default: goToNextBlock(); prepareBuffer(); break;
            }
        }

        function getAutoStopChance(postPauseMs, isHeader) {
            var result = !_groupLevel && (
                _autoStopOnZeroPostPause && !postPauseMs
                || _autoStopOnLongPostPauseDuration && postPauseMs >= _autoStopOnLongPostPauseDuration
                || _autoStopAfterDataBlock && !isHeader
            );
            return result;
        }

        // 10
        function readStandardSpeedBlock(input, block) {
            block.postPauseMs = readWord(input);
            var dataLength = readWord(input);
            block.data = readByteArray(input, dataLength);
            block.__state = BP_STATE.PRE;
        }

        // 11
        function readTurboSpeedBlock(input, block) {
            block.pilotPulseDuration = readWord(input);
            block.syncPulse1Duration = readWord(input);
            block.syncPulse2Duration = readWord(input);
            block.bit0PulseDuration = readWord(input);
            block.bit1PulseDuration = readWord(input);
            block.pilotPulseCount = readWord(input);
            block.lastByteValuableBits = readByte(input);
            block.postPauseMs = readWord(input);
            var dataLength = read3BytesInteger(input);
            block.data = readByteArray(input, dataLength);
            block.__state = BP_STATE.PRE;
        }

        // 14
        function readPureDataBlock(input, block) {
            block.bit0PulseDuration = readWord(input);
            block.bit1PulseDuration = readWord(input);
            block.lastByteValuableBits = readByte(input);
            block.postPauseMs = readWord(input);
            var dataLength = read3BytesInteger(input);
            block.data = readByteArray(input, dataLength);
            block.__state = BP_STATE.PRE;
        }

        // 10, 11, 14
        function processDataBlock(block, turbo, noTone) {
            switch (block.__state) {
                case BP_STATE.PRE: {
                    _autoStopChance = false;
                    block.__data = new MemoryStream(block.data);
                    if (noTone) {
                        block.__state = BP_STATE.DATA_PROCESSING;
                        processDataBlock(block, turbo, noTone);
                        break;
                    }
                    if (turbo) {
                        _patterns.appendComplement(block.pilotPulseDuration, block.pilotPulseCount);
                        _patterns.appendComplement(block.syncPulse1Duration, 1);
                        _patterns.appendComplement(block.syncPulse2Duration, 1);
                    }
                    else {
                        var flag = block.data.length > 0 ? block.data[0] : 0;
                        _patterns.appendComplement(2168, (flag & 0x80) ? 3223 : 8063);
                        _patterns.appendComplement(667, 1);
                        _patterns.appendComplement(735, 1);
                    }
                    block.__state = BP_STATE.DATA_PROCESSING;
                    break;
                }
                case BP_STATE.DATA_PROCESSING: {
                    var leftover = block.__data.get_length() - block.__data.get_position();
                    if (leftover > 0) {
                        var last = leftover === 1;
                        var bits = last && turbo ? block.lastByteValuableBits : 8;
                        var value = readByte(block.__data);
                        _patterns.appendBits(
                            value, 
                            bits, 
                            turbo ? block.bit0PulseDuration : 855, 
                            turbo ? block.bit1PulseDuration : 1710);
                        if (last) {
                            _autoStopChance = getAutoStopChance(
                                block.postPauseMs, 
                                block.data.length === 19 && !(block.data[0] & 0x80));
                        }
                    }
                    else {
                        block.__state = BP_STATE.PAUSE_PROCESSING;
                        processDataBlock(block, turbo, noTone);
                    }
                    break;
                }
                case BP_STATE.PAUSE_PROCESSING: {
                    if (!_autoStopChance) {
                        if (block.postPauseMs) {
                            _patterns.appendPause(
                                _prePauseCounterPulseDuration * TSTATES_PER_MS,
                                block.postPauseMs * TSTATES_PER_MS);
                        }
                        goToNextBlock();
                        if (!block.postPauseMs) {
                            prepareBuffer();
                        }
                        block.__state = BP_STATE.PRE;
                    }
                    else {
                        _patterns.appendPause(
                            _prePauseCounterPulseDuration * TSTATES_PER_MS, 
                            _defaultPause * TSTATES_PER_MS);
                        block.__state = BP_STATE.POST;
                    }
                    break;
                }
                case BP_STATE.POST: {
                    goToNextBlock();
                    block.__state = BP_STATE.PRE;
                    break;
                }
            }
        }

        // 12
        function readPureToneBlock(input, block) {
            block.pulseDuration = readWord(input);
            block.pulseCount = readWord(input);
        }

        // 12
        function processPureToneBlock(block) {
            _patterns.appendComplement(block.pulseDuration, block.pulseCount);
            goToNextBlock();
        }

        // 13
        function readPulseSequenceBlock(input, block) {
            var pulseCount = readByte(input);
            block.pulseDurations = [];
            while (pulseCount--) {
                block.pulseDurations.push(readWord(input, block.pulseCount));
            }
        }

        // 13
        function processPulseSequenceBlock(block) {
            for (var i = 0; i < block.pulseDurations.length; i++) {
                _patterns.appendComplement(block.pulseDurations[i], 1);
            }
            goToNextBlock();
        }

        // 15
        function readDirectRecordBlock(input, block) {
            block.bitPulseDuration = readWord(input);
            block.postPauseMs = readWord(input);
            block.lastByteValuableBits = readByte(input);
            var dataLength = read3BytesInteger(input);
            block.data = readByteArray(input, dataLength);
            block.__state = BP_STATE.PRE;
        }

        // 15
        function processDirectRecordBlock(block) {
            switch (block.__state) {
                case BP_STATE.PRE: {
                    _autoStopChance = false;
                    block.__data = new MemoryStream(block.data);
                    block.__state = BP_STATE.DATA_PROCESSING;
                    processDirectRecordBlock(block);
                    break;
                }
                case BP_STATE.DATA_PROCESSING: {
                    var leftover = block.__data.get_length() - block.__data.get_position();
                    if (leftover > 0) {
                        var last = leftover === 1;
                        var value = readByte(block.__data);
                        _patterns.appendBitsExplicitly(
                            value,
                            last ? block.lastByteValuableBits : 8,
                            block.bitPulseDuration);
                        if (last) {
                            _autoStopChance = getAutoStopChance(block.postPauseMs, false);
                        }
                    }
                    else {
                        block.__state = BP_STATE.PAUSE_PROCESSING;
                        processDirectRecordBlock(block);
                    }
                    break;
                }
                case BP_STATE.PAUSE_PROCESSING: {
                    if (!_autoStopChance) {
                        if (block.postPauseMs) {
                            _patterns.appendComplement(0, 1);
                            _patterns.appendPause(
                                0,
                                block.postPauseMs * TSTATES_PER_MS);
                        }
                        goToNextBlock();
                        if (!block.postPauseMs) {
                            prepareBuffer();
                        }
                        block.__state = BP_STATE.PRE;
                    }
                    else {
                        _patterns.appendComplement(0, 1);
                        _patterns.appendPause(
                            0,
                            _defaultPause * TSTATES_PER_MS);
                        block.__state = BP_STATE.POST;
                    }
                    break;
                }
                case BP_STATE.POST: {
                    goToNextBlock();
                    block.__state = BP_STATE.PRE;
                    break;
                }
            }
        }

        function readC64StandardBlock(input, block) {
            block.length = readDoubleWord(input);
            block.data = readByteArray(input, block.length - 4);
        }

        function readC64TurboBlock(input, block) {
            block.length = readDoubleWord(input);
            block.data = readByteArray(input, block.length - 4);
        }

        // 18
        function readCswRecordBlock(input, block) {
            block.length = readDoubleWord(input);
            block.postPauseMs = readWord(input);
            block.sampleRate = read3BytesInteger(input);
            block.compressionType = readByte(input);
            block.sampleDuration = 3500000 / block.sampleRate;
            block.pulseCount = readDoubleWord(input);
            block.data = readByteArray(input, block.length - 10);
            block.__state = BP_STATE.PRE;
        }

        // 18
        function processCswRecordBlock(block) {
            switch (block.__state) {
                case BP_STATE.PRE: {
                    _autoStopChance = false;
                    if (block.compressionType == CSW_COMPRESSION.ZRLE) {
                        var decompressedData = pako.inflate(new Uint8Array(block.data));
                        block.__data = new MemoryStream(decompressedData);
                    }
                    else {
                        block.__data = new MemoryStream(block.data);
                    }
                    block.__state = BP_STATE.DATA_PROCESSING;
                    processCswRecordBlock(block);
                    break;
                }
                case BP_STATE.DATA_PROCESSING: {
                    var leftover = block.__data.get_length() - block.__data.get_position();
                    if (leftover > 0) {
                        var last = leftover === 1;
                        var samples = readByte(block.__data);
                        if (!samples) {
                            samples = readDoubleWord(block.__data);
                        }
                        _patterns.appendComplement(Math.round(samples * block.sampleDuration), 1);
                        if (last) {
                            _autoStopChance = getAutoStopChance(block.postPauseMs, false);
                        }
                    }
                    else {
                        block.__state = BP_STATE.PAUSE_PROCESSING;
                        processCswRecordBlock(block);
                    }
                    break;
                }
                case BP_STATE.PAUSE_PROCESSING: {
                    if (!_autoStopChance) {
                        if (block.postPauseMs) {
                            _patterns.appendComplement(0, 1);
                            _patterns.appendPause(
                                0,
                                block.postPauseMs * TSTATES_PER_MS);
                        }
                        goToNextBlock();
                        if (!block.postPauseMs) {
                            prepareBuffer();
                        }
                        block.__state = BP_STATE.PRE;
                    }
                    else {
                        _patterns.appendComplement(0, 1);
                        _patterns.appendPause(
                            0,
                            _defaultPause * TSTATES_PER_MS);
                        block.__state = BP_STATE.POST;
                    }
                    break;
                }
                case BP_STATE.POST: {
                    goToNextBlock();
                    block.__state = BP_STATE.PRE;
                    break;
                }
            }

        }

        // 19
        function readGeneralRecordBlock(input, block) {
            block.length = readDoubleWord(input);
            block.postPauseMs = readWord(input);
            block.pilotTotalSymbols = readDoubleWord(input);
            block.pilotPulsesPerSymbol = readByte(input);
            var pilotAlphabetSize = readByte(input) || (block.pilotPulsesPerSymbol ? 0x100 : 0);
            block.dataTotalSymbols = readDoubleWord(input);
            block.dataPulsesPerSymbol = readByte(input);
            var dataAlphabetSize = readByte(input) || (block.dataPulsesPerSymbol ? 0x100 : 0);
            block.dataBitsPerSymbol = Math.ceil(Math.log2(dataAlphabetSize));
            block.pilotAlphabet = [];
            for (var i = 0; i < pilotAlphabetSize && block.pilotTotalSymbols; i++) {
                var symbolDef = {
                    flags: readByte(input),
                    pulses: []
                };
                for (var j = 0; j < block.pilotPulsesPerSymbol; j++) {
                    symbolDef.pulses.push(readWord(input));
                }
                block.pilotAlphabet.push(symbolDef);
            }
            block.pilotSymbols = [];
            for (var i = 0; i < block.pilotTotalSymbols; i++) {
                var prleEntry = {
                    symbol: readByte(input),
                    count: readWord(input)
                };
                block.pilotSymbols.push(prleEntry);
            }
            block.dataAlphabet = [];
            for (var i = 0; i < dataAlphabetSize && block.dataTotalSymbols; i++) {
                var symbolDef = {
                    flags: readByte(input),
                    pulses: []
                };
                for (var j = 0; j < block.dataPulsesPerSymbol; j++) {
                    symbolDef.pulses.push(readWord(input));
                }
                block.dataAlphabet.push(symbolDef);
            }
            var dataLength = Math.ceil(block.dataBitsPerSymbol * block.dataTotalSymbols / 8);
            block.dataSymbols = readByteArray(input, dataLength);
            block.__state = BP_STATE.PRE;
        }

        //19
        function processGeneralRecordBlock(block) {
            switch (block.__state) {
                case BP_STATE.PRE: {
                    _autoStopChance = false;
                    block.__pilotSymbolIndex = 0;
                    block.__dataSymbolIndex = 0;
                    block.__dataReader = new BitReader(
                        block.dataSymbols, 
                        block.dataBitsPerSymbol * block.dataTotalSymbols);
                    block.__state = BP_STATE.PILOT_PROCESSING;
                    processGeneralRecordBlock(block);                  
                    break;
                }
                case BP_STATE.PILOT_PROCESSING: {
                    if (block.__pilotSymbolIndex < block.pilotTotalSymbols) {
                        var prleEntry = block.pilotSymbols[block.__pilotSymbolIndex];
                        var symbolDef = block.pilotAlphabet[prleEntry.symbol];
                        for ( var i = 0; i < prleEntry.count; i++ ) {
                            for ( var j = 0; j < symbolDef.pulses.length; j++ ) {
                                var pulseDuration = symbolDef.pulses[j];
                                if (!pulseDuration)
                                    break;
                                if (j > 0 || !(symbolDef.flags & 0x03)) {
                                    _patterns.appendComplement(pulseDuration, 1);
                                }
                                else if (symbolDef.flags & 0x02) {
                                    _patterns.appendLevel(!!(symbolDef.flags & 0x01), pulseDuration);
                                }
                                else {
                                    _patterns.appendSupplement(pulseDuration, 1);
                                }
                            }
                        }
                        block.__pilotSymbolIndex++;
                    }
                    else {
                        block.__state = BP_STATE.DATA_PROCESSING;
                        processGeneralRecordBlock(block);
                    }
                    break;
                }
                case BP_STATE.DATA_PROCESSING: {
                    var leftover = block.__dataReader.get_length() - block.__dataReader.get_position();
                    if (leftover > 0) {
                        var last = leftover === 1;
                        var symbol = block.__dataReader.read(block.dataBitsPerSymbol);
                        var symbolDef = block.dataAlphabet[symbol];
                        for ( var i = 0; i < symbolDef.pulses.length; i++ ) {
                            var pulseDuration = symbolDef.pulses[i];
                            if (!pulseDuration)
                                break;
                            if (i > 0 || !(symbolDef.flags & 0x03)) {
                                _patterns.appendComplement(pulseDuration, 1);
                            }
                            else if (symbolDef.flags & 0x02) {
                                _patterns.appendLevel(!!(symbolDef.flags & 0x01), pulseDuration);
                            }
                            else {
                                _patterns.appendSupplement(pulseDuration, 1);
                            }
                        }
                        if (last) {
                            _autoStopChance = getAutoStopChance(block.postPauseMs, false);
                        }
                    }
                    else {
                        block.__state = BP_STATE.PAUSE_PROCESSING;
                        processGeneralRecordBlock(block);
                    }
                    break;
                }
                case BP_STATE.PAUSE_PROCESSING: {
                    if (!_autoStopChance) {
                        if (block.postPauseMs) {
                            // WORKING METHOD 1:
                            // _patterns.appendComplement(0, 1);
                            // _patterns.appendPause(
                            //     _prePauseCounterPulseDuration,
                            //     block.postPauseMs * TSTATES_PER_MS);
                            // WORKING METHOD 2:
                            _patterns.appendPause(
                                0,
                                block.postPauseMs * TSTATES_PER_MS);
                            // (don't know which one of them is better)
                        }
                        goToNextBlock();
                        if (!block.postPauseMs) {
                            prepareBuffer();
                        }
                        block.__state = BP_STATE.PRE;
                    }
                    else {
                        // WORKING METHOD 1:
                        // _patterns.appendComplement(0, 1);
                        // _patterns.appendPause(
                        //     _prePauseCounterPulseDuration,
                        //     _defaultPause * TSTATES_PER_MS);
                        // WORKING METHOD 2:
                        _patterns.appendPause(
                            0,
                            _defaultPause * TSTATES_PER_MS);
                        block.__state = BP_STATE.POST;
                        // (don't know which one of them is better)
                    }
                    break;
                }
                case BP_STATE.POST: {
                    goToNextBlock();
                    block.__state = BP_STATE.PRE;
                    break;
                }
            }
        }

        function readPauseBlock(input, block) {
            block.duration = readWord(input);
            block.__state = BP_STATE.PRE;
        }
        
        function processPauseBlock(block) {
            switch (block.__state) {
                case BP_STATE.PRE:
                    if (block.duration > 0) {
                        _patterns.appendPause(
                            _prePauseCounterPulseDuration * TSTATES_PER_MS, 
                            block.duration * TSTATES_PER_MS);
                        goToNextBlock();
                    }
                    else {
                        _patterns.appendPause(
                            _prePauseCounterPulseDuration * TSTATES_PER_MS,
                            0);
                        block.__state = BP_STATE.POST;
                    }
                    break;
                case BP_STATE.POST: {
                    goToNextBlock();
                    block.__state = BP_STATE.PRE;
                    break;
                }
            }
        }

        function readGroupStartBlock(input, block) {
            block.length = readByte(input);
            block.name = readByteArray(input, block.length);
        }

        function processGroupStartBlock(block) {
            _groupLevel++;
            goToNextBlock();
            prepareBuffer();
        }

        function readGroupEndBlock(block) {
        }

        function processGroupEndBlock(block) {
            _groupLevel--;
            goToNextBlock();
            prepareBuffer();
        }

        function readJumpBlock(input, block) {
            block.offset = readWord(input);
        }

        function processJumpBlock(block) {
            goToBlock(block.index + (block.offset || 1));
            prepareBuffer();
        }

        function readLoopStartBlock(input, block) {
            block.count = readWord(input);
        }

        function processLoopStartBlock(block) {
            block.__backcounter = block.count;
            _loopStack.push(block.index);
            goToNextBlock();
            prepareBuffer();
        }

        function readLoopEndBlock(block) {
        }

        function processLoopEndBlock(block) {
            var loopStartBlockIndex = _loopStack.pop();
            var loopStartBlock = (loopStartBlockIndex !== undefined) ? _blocks[loopStartBlockIndex] : null;
            if (loopStartBlock && --loopStartBlock.__backcounter) {
                _loopStack.push(loopStartBlock);
                goToBlock(loopStartBlockIndex + 1);
            }
            else {
                goToNextBlock();
            }
            prepareBuffer();
        }

        function readCallBlock(input, block) {
            block.count = readWord(input);
            block.offsets = [];
            for (var i = 0; i < block.count; i++) {
                block.offsets.push(readWord(input));
            }
            block.__state = BP_STATE.PRE;
        }

        function processCallBlock(block) {
            switch (block.__state) {
                case BP_STATE.PRE: {
                    block.__loopIndex = -1;
                    block.__state = BP_STATE.DATA_PROCESSING;
                    processCallBlock(block);
                    break;
                }
                case BP_STATE.DATA_PROCESSING: {
                    if (++block.__loopIndex < block.count) {
                        _callStack.push(block.index);
                        var offset = block.offsets[block.__loopIndex] || 1;
                        goToBlock(block.index + offset);
                    }
                    else {
                        block.__state = BP_STATE.PRE;
                        goToNextBlock();
                    }
                    prepareBuffer();
                    break;
                }
            }
        }

        function readReturnBlock(input, block) {
        }

        function processReturnBlock(block) {
            var callBlockIndex = _callStack.pop();
            if (callBlockIndex !== undefined) {
                goToBlock(callBlockIndex);
            }
            else {
                goToNextBlock();
            }
            prepareBuffer();
        }

        function readSelectBlock(input, block) {
            block.length = readWord(input);
            var count = readByte(input);
            block.options = [];
            for (var i = 0; i < count; i++) {
                var option = {};
                option.offset = readWord(input);
                var descriptionLength = readByte(input);
                option.description = readByteArray(input, descriptionLength);
                block.options.push(option);
            }
            block.__state = BP_STATE.PRE;
        }

        function processSelectBlock(block) {
            switch (block.__state) {
                case BP_STATE.PRE:
                    _patterns.appendPause(
                        _prePauseCounterPulseDuration * TSTATES_PER_MS,
                        0);
                    block.__state = BP_STATE.POST;
                    break;
                case BP_STATE.POST: {
                    _callback({
                        type: TAPE_EVENT.SELECTION,
                        options: block.options.map(function (o) {
                            return {
                                block: block.index + o.offset,
                                description: String.fromCharCode.apply(String, o.description)
                            };
                        })
                    });
                    goToNextBlock();
                    block.__state = BP_STATE.PRE;
                    break;
                }
            }            
        }

        function readStop48kBlock(input, block) {
            block.length = readDoubleWord(input);
            block.data = readByteArray(input, block.length);
        }

        function processStop48kBlock(block) {
            goToNextBlock();
            if (!_mode48) {
                prepareBuffer();
            }
        }

        function readLevelBlock(input, block) {
            block.length = readDoubleWord(input);
            block.level = readByte(input);
            block.data = readByteArray(input, block.length - 1);
        }

        function processLevelBlock(block) {
            _patterns.appendLevel(block.level, 0);
            goToNextBlock();
        }

        function readDescriptionBlock(input, block) {
            var descriptionLength = readByte(input);
            block.description = readByteArray(input, descriptionLength);
        }

        function processDescriptionBlock(block) {
            _callback({
                type: TAPE_EVENT.DESCRIPTION,
                description: String.fromCharCode.apply(String, block.description)
            });
            goToNextBlock();
            prepareBuffer();
        }

        function readMessageBlock(input, block) {
            block.duration = readByte(input);
            var messageLength = readByte(input);
            block.message = readByteArray(input, messageLength);
        }

        function processMessageBlock(block) {
            _callback({
                type: TAPE_EVENT.MESSAGE,
                duration: block.duration,
                message: String.fromCharCode.apply(String, block.message)
            });
            goToNextBlock();
            prepareBuffer();
        }

        function readArchiveInfoBlock(input, block) {
            block.length = readWord(input);
            var stringCount = readByte(input);
            block.records = [];
            for ( var i = 0; i < stringCount; i++ ) {
                var record = {};
                record.type = readByte(input);
                var textLength = readByte(input);
                record.text = readByteArray(input, textLength);
                block.records.push(record);
            }
        }

        function processArchiveInfoBlock(block) {
            _callback({
                type: TAPE_EVENT.ARCHIVE_INFO,
                records: block.records.map(function (r) {
                    return {
                        type: r.type,
                        text: String.fromCharCode.apply(String, r.text)
                    };
                })
            });
            goToNextBlock();
            prepareBuffer();
        }

        function readHardwareBlock(input, block) {
            var recordCount = readByte(input);
            block.records = [];
            for ( var i = 0; i < recordCount; i++ ) {
                var rec = {};
                rec.hwType = readByte(input);
                rec.hwId = readByte(input);
                rec.recType = readByte(input);
                block.records.push(rec);
            }
        }

        function processHardwareBlock(block) {
            _callback({
                type: TAPE_EVENT.HARDWARE_INFO,
                records: block.records.map(function (r) {
                    return {
                        hwType: r.hwType,
                        hwId: r.hwId,
                        recType: r.recType,
                    };
                })
            });
            goToNextBlock();
            prepareBuffer();
        }

        function readEmulationInfoBlock(input, block) {
            block.flags = readWord(input);
            block.screenRefreshDelay = readByte(input);
            block.interruptFrequency = readWord(input);
            block.reserved = readByteArray(input, 3);
        }

        function readCustomInfoBlock(input, block) {
            block.infoId = readByteArray(input, 16);
            var infoLength = readDoubleWord(input);
            block.info = readByteArray(input, infoLength);
        }

        function processCustomInfoBlock(block) {
            _callback({
                type: TAPE_EVENT.CUSTOM_INFO,
                id: block.infoId,
                info: block.info
            });
            goToNextBlock();
            prepareBuffer();
        }

        function readSnapshotBlock(input, block) {
            block.format = readByte(input);
            var snapshotLength = read3BytesInteger(input);
            block.snapshot = readByteArray(input, snapshotLength);
        }

        function processSnapshotBlock(block) {
            _callback({
                type: TAPE_EVENT.SNAPSHOT_RESTORATION,
                format: block.format ? 'SNA' : 'Z80',
                snapshot: block.data
            });
        }

        function readGlueBlock(input, block) {
            readByteArray(input, 9);
        }

        function readUnsupportedBlock(input, block) {
            block.length = readDoubleWord(input);
            block.data = readByteArray(input, block.length);
        }

        function goToBlock(index) {
            _block = (index >= 0 || index < _blocks.length)
                ? _blocks[index]
                : null;
            if (!_block) {
                _patterns.appendPause(
                    _prePauseCounterPulseDuration * TSTATES_PER_MS, 
                    0);
            }
        }

        function goToNextBlock() {
            goToBlock(_block.index + 1);
        }

        function readByte(input) {
            var value = input.read();
            if (value < 0)
                throw new Error(ZX_Lang.ERR_TR_UNEXPECTED_STREAM_END);
            return value;
        }

        function readByteArray(input, count, optional) {
            var arr = input.readMultuple(count);
            if (!optional && arr.length != count)
                throw new Error(ZX_Lang.ERR_TR_UNEXPECTED_STREAM_END);
            return arr;
        }

        function readWord(input) {
            var arr = readByteArray(input, 2);
            return (arr[1] << 8) | arr[0];
        }

        function read3BytesInteger(input) {
            var arr = readByteArray(input, 3);
            return (arr[2] << 16) | (arr[1] << 8) | arr[0];
        }

        function readDoubleWord(input) {
            var arr = readByteArray(input, 4);
            return (arr[3] << 24) | (arr[2] << 16) | (arr[1] << 8) | arr[0];
        }

        function createStructureInfo(blocks) {
            var result = new TapeInfo();
            result.format = 'TZX';
            result.formatVersion = [_verMajor, _verMinor].filter(function (v) { return !!v; }).join('.');
            result.size = _size;
            result.blocks = [];
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                var info;
                switch (block.id) {
                    case TZX_BLOCK_ID.STANDARD_SPEED:
                        var isHeader = block.data.length === 19 && !(block.data[0] & 0x80);
                        info = createBlockInfo(block, isHeader ? TapeHeaderBlockInfo : TapeDataBlockInfo);
                        info.size = block.data.length + 5;
                        info.postPause = block.postPauseMs;
                        if (isHeader) {
                            appendHeaderInfo(block, info);
                        }
                        break;
                    case TZX_BLOCK_ID.TURBO_SPEED:
                        var isHeader = block.data.length === 19 && !(block.data[0] & 0x80);
                        info = createBlockInfo(block, isHeader ? TapeHeaderBlockInfo : TapeDataBlockInfo);
                        info.size = block.data.length + 19;
                        info.postPause = block.postPauseMs;
                        if (isHeader) {
                            appendHeaderInfo(block, info);
                        }
                        break;
                    case TZX_BLOCK_ID.PURE_TONE: 
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 5;
                        break;
                    case TZX_BLOCK_ID.PULSE_SEQUENCE:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.pulseDurations.length * 2 + 1;
                        break;
                    case TZX_BLOCK_ID.PURE_DATA:
                        var isHeader = block.data.length === 19 && !(block.data[0] & 0x80);
                        info = createBlockInfo(block, isHeader ? TapeHeaderBlockInfo : TapeDataBlockInfo);
                        info.size = block.data.length + 11;
                        info.postPause = block.postPauseMs;
                        if (isHeader) {
                            appendHeaderInfo(block, info);
                        }
                        break;
                    case TZX_BLOCK_ID.DIRECT_RECORD:
                        info = createBlockInfo(block, TapeDataBlockInfo);
                        info.size = block.data.length + 9;
                        info.postPause = block.postPauseMs;
                        break;
                    case TZX_BLOCK_ID.C64_STANDARD:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.length + 1;
                        break;
                    case TZX_BLOCK_ID.C64_TURBO:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.length + 1;
                        break;
                    case TZX_BLOCK_ID.CSW_RECORD:
                        info = createBlockInfo(block, TapeDataBlockInfo);
                        info.size = block.length + 5;
                        info.postPause = block.postPauseMs;
                        break;
                    case TZX_BLOCK_ID.GENERAL_RECORD:
                        info = createBlockInfo(block, TapeDataBlockInfo);
                        info.size = block.length + 5;
                        info.postPause = block.postPauseMs;
                        break;
                    case TZX_BLOCK_ID.PAUSE:
                        info = createBlockInfo(block, TapePauseBlockInfo);
                        info.size = 3;
                        info.duration = block.duration;
                        break;
                    case TZX_BLOCK_ID.GROUP_START:
                        info = createBlockInfo(block, TapeGroupBlockInfo);
                        info.size = block.length + 2;
                        info.name = String.fromCharCode.apply(String, block.name);
                        break;
                    case TZX_BLOCK_ID.GROUP_END:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 1;
                        break;
                    case TZX_BLOCK_ID.JUMP:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 3;
                        break;
                    case TZX_BLOCK_ID.LOOP_START:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 3;
                        break;
                    case TZX_BLOCK_ID.LOOP_END:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 1;
                        break;
                    case TZX_BLOCK_ID.CALL:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.offsets.length * 2 + 3;
                        break;;
                    case TZX_BLOCK_ID.RETURN:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 1;
                        break;
                    case TZX_BLOCK_ID.SELECT:
                        info = createBlockInfo(block, TapeSelectBlockInfo);
                        info.size = block.length + 3;
                        for (var optIndex = 0; optIndex < block.options.length; optIndex++) {
                            var opt = block.options[optIndex];
                            var optInfo = new TapeSelectBlockInfoOption();
                            optInfo.blockIndex = block.index + opt.offset;
                            optInfo.description = String.fromCharCode.apply(String, opt.description);
                            info.options.push(optInfo);
                        }
                        break;
                    case TZX_BLOCK_ID.STOP_48K:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.length + 1;
                        break;
                    case TZX_BLOCK_ID.LEVEL:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.length + 1;
                        break;
                    case TZX_BLOCK_ID.DESCRIPTION:
                        info = createBlockInfo(block, TapeDescriptionBlockInfo);
                        info.size = block.description.length + 2;
                        info.description = String.fromCharCode.apply(String, block.description);
                        break;
                    case TZX_BLOCK_ID.MESSAGE:
                        info = createBlockInfo(block, TapeMessageBlockInfo);
                        info.size = block.message.length + 3;
                        info.message = String.fromCharCode.apply(String, block.message);
                        info.duration = block.duration;
                        break;
                    case TZX_BLOCK_ID.ARCHIVE_INFO:
                        info = createBlockInfo(block, TapeArchiveBlockInfo);
                        info.size = block.length + 3;
                        for (var recIndex = 0; recIndex < block.records.length; recIndex++) {
                            var rec = block.records[recIndex];
                            var recInfo = new TapeArchiveBlockInfoRecord();
                            recInfo.infoId = rec.type;
                            recInfo.infoIdDescription = getArchiveRecordIdDescrption(rec.type);
                            recInfo.infoText = String.fromCharCode.apply(String, rec.text);
                            info.records.push(recInfo);
                        }
                        break;
                    case TZX_BLOCK_ID.HARDWARE:
                        info = createBlockInfo(block, TapeHardwareTypeBlockInfo);
                        info.size = block.records.length * 3 + 2;
                        for (var recIndex = 0; recIndex < block.records.length; recIndex++) {
                            var rec = block.records[recIndex];
                            var recInfo = new TapeHardwareTypeBlockInfoRecord();
                            recInfo.type = rec.hwType;
                            recInfo.typeDescription = getHardwareTypeDescription(rec.hwType);
                            recInfo.id = rec.hwId;
                            recInfo.idDescription = getHardwareIdDescription(rec.hwType, rec.hwId);
                            recInfo.relation = rec.recType;
                            recInfo.relationDescription = getHardwareRelationDescription(rec.recType);
                            info.records.push(recInfo);
                        }
                        break;
                    case TZX_BLOCK_ID.EMULATION_INFO:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 9;
                        break;
                    case TZX_BLOCK_ID.CUSTOM_INFO:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.info.length + 15;
                        break;
                    case TZX_BLOCK_ID.SNAPSHOT:
                        info = createBlockInfo(block, TapeSnapshotBlockInfo);
                        info.size = block.snapshot.length + 5;
                        switch (block.format) {
                            case 0: info.format = 'Z80'; break;
                            case 1: info.format = 'SNA'; break;
                        }
                        break;
                    case TZX_BLOCK_ID.GLUE:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = 10;
                        break;
                    default:
                        info = createBlockInfo(block, TapeBlockInfo);
                        info.size = block.length + 5;
                        break;
                }
                result.blocks.push(info);
            }
            result.currentIndex = _block ? _block.index : null;
            return result;
        }

        function createBlockInfo(block, BlockInfoType) {
            var info = new BlockInfoType();
            info.index = block.index;
            info.id = block.id;
            info.idDescription = getBlockIdDescription(block.id);
            return info;
        }

        function appendHeaderInfo(block, info) {
            info.type = block.data[1];
            info.typeDescription = getHeaderBlockTypeDescription(block.data[1]);
            info.filename = String.fromCharCode.apply(String, block.data.slice(2, 12));
            info.binLength = (block.data[13] << 8) | block.data[12];
            info.param1 = (block.data[15] << 8) | block.data[14];
            info.param2 = (block.data[17] << 8) | block.data[16];
        }

        function getBlockIdDescription(blockId) {
            switch (blockId) {
                case TZX_BLOCK_ID.STANDARD_SPEED: return ZX_Lang.TPINF_BLK_STANDARD;
                case TZX_BLOCK_ID.TURBO_SPEED: return ZX_Lang.TPINF_BLK_TURBO;
                case TZX_BLOCK_ID.PURE_TONE: return ZX_Lang.TPINF_BLK_PURE_TONE;
                case TZX_BLOCK_ID.PULSE_SEQUENCE: return ZX_Lang.TPINF_BLK_PULSE_SEQUENCE;
                case TZX_BLOCK_ID.PURE_DATA: return ZX_Lang.TPINF_BLK_PURE_DATA;
                case TZX_BLOCK_ID.DIRECT_RECORD: return ZX_Lang.TPINF_BLK_DIRECT_RECORDING;
                case TZX_BLOCK_ID.C64_STANDARD: return ZX_Lang.TPINF_BLK_COMMODORE_64_STANDARD;
                case TZX_BLOCK_ID.C64_TURBO: return ZX_Lang.TPINF_BLK_COMMODORE_64_TURBO;
                case TZX_BLOCK_ID.CSW_RECORD: return ZX_Lang.TPINF_BLK_CSW;
                case TZX_BLOCK_ID.GENERAL_RECORD: return ZX_Lang.TPINF_BLK_GENERALIZED_DATA;
                case TZX_BLOCK_ID.PAUSE: return ZX_Lang.TPINF_BLK_PAUSE;
                case TZX_BLOCK_ID.GROUP_START: return ZX_Lang.TPINF_BLK_GROUP_START;
                case TZX_BLOCK_ID.GROUP_END: return ZX_Lang.TPINF_BLK_GROUP_END;
                case TZX_BLOCK_ID.JUMP: return ZX_Lang.TPINF_BLK_JUMP;
                case TZX_BLOCK_ID.LOOP_START: return ZX_Lang.TPINF_BLK_LOOP_START;
                case TZX_BLOCK_ID.LOOP_END: return ZX_Lang.TPINF_BLK_LOOP_END;
                case TZX_BLOCK_ID.CALL: return ZX_Lang.TPINF_BLK_CALL;
                case TZX_BLOCK_ID.RETURN: return ZX_Lang.TPINF_BLK_RETURN;
                case TZX_BLOCK_ID.SELECT: return ZX_Lang.TPINF_BLK_SELECTION_MENU;
                case TZX_BLOCK_ID.STOP_48K: return ZX_Lang.TPINF_BLK_STOP_48;
                case TZX_BLOCK_ID.LEVEL: return ZX_Lang.TPINF_BLK_LEVEL;
                case TZX_BLOCK_ID.DESCRIPTION: return ZX_Lang.TPINF_BLK_TEXT_DESCRIPTION;
                case TZX_BLOCK_ID.MESSAGE: return ZX_Lang.TPINF_BLK_MESSAGE;
                case TZX_BLOCK_ID.ARCHIVE_INFO: return ZX_Lang.TPINF_BLK_ARCHIVE_INFO;
                case TZX_BLOCK_ID.HARDWARE: return ZX_Lang.TPINF_BLK_HARDWARE_TYPE;
                case TZX_BLOCK_ID.EMULATION_INFO: return ZX_Lang.TPINF_BLK_EMULATION_INFO;
                case TZX_BLOCK_ID.CUSTOM_INFO: return ZX_Lang.TPINF_BLK_CUSTOM_INFO;
                case TZX_BLOCK_ID.SNAPSHOT: return ZX_Lang.TPINF_BLK_SNAPSHOT;
                case TZX_BLOCK_ID.GLUE: return ZX_Lang.TPINF_BLK_GLUE;
                default: return '';
            }
        }

        function getArchiveRecordIdDescrption(id) {
            switch (id) {
                case 0: return ZX_Lang.TPINF_PROP_FULL_TITLE;
                case 1: return ZX_Lang.TPINF_PROP_PUBLISHER;
                case 2: return ZX_Lang.TPINF_PROP_AUTHORS;
                case 3: return ZX_Lang.TPINF_PROP_YEAR;
                case 4: return ZX_Lang.TPINF_PROP_LANGUANGE;
                case 5: return ZX_Lang.TPINF_PROP_PROD_TYPE;
                case 6: return ZX_Lang.TPINF_PROP_PRICE;
                case 7: return ZX_Lang.TPINF_PROP_LOADER;
                case 8: return ZX_Lang.TPINF_PROP_ORIGIN;
                case 0xFF: return ZX_Lang.TPINF_PROP_COMMENTS;
                default: return '';
            }
        }

        function getHardwareTypeDescription(type) {
            switch (type) {
                case 0: return ZX_Lang.TPINF_HW_COMPUTER;
                case 1: return ZX_Lang.TPINF_HW_EXT_STORAGE;
                case 2: return ZX_Lang.TPINF_HW_ROMRAM;
                case 3: return ZX_Lang.TPINF_HW_SOUND;
                case 4: return ZX_Lang.TPINF_HW_JOYSTICK;
                case 5: return ZX_Lang.TPINF_HW_MOUSE;
                case 6: return ZX_Lang.TPINF_HW_CONTROLLER;
                case 7: return ZX_Lang.TPINF_HW_SERIAL_PORT;
                case 8: return ZX_Lang.TPINF_HW_PARALLEL_PORT;
                case 9: return ZX_Lang.TPINF_HW_PRINTER;
                case 10: return ZX_Lang.TPINF_HW_MODEM;
                case 11: return ZX_Lang.TPINF_HW_DIGITIZER;
                case 12: return ZX_Lang.TPINF_HW_NETWORK_ADAPTER;
                case 13: return ZX_Lang.TPINF_HW_KEYBOARD;
                case 14: return ZX_Lang.TPINF_HW_AD_DA;
                case 15: return ZX_Lang.TPINF_HW_EPROM_PROGRAMMER;
                case 16: return ZX_Lang.TPINF_HW_GRAPHICS;
                default: return '';
            }
        }

        function getHardwareIdDescription(type, id) {
            switch ((type << 8) | id) {
                case 0x0000: return 'ZX Spectrum 16k';
                case 0x0001: return 'ZX Spectrum 48k, Plus';
                case 0x0002: return 'ZX Spectrum 48k, ISSUE 1';
                case 0x0003: return 'ZX Spectrum 128k +(Sinclair)';
                case 0x0004: return 'ZX Spectrum 128k +2(grey case)';
                case 0x0005: return 'ZX Spectrum 128k +2A, +3';
                case 0x0006: return 'Times Sinclair TC-2048';
                case 0x0007: return 'Times Sinclair TS-2068';
                case 0x0008: return 'Pentagon 128';
                case 0x0009: return 'Sam Coupe';
                case 0x000A: return 'Didaktik M';
                case 0x000B: return 'Didaktik Gama';
                case 0x000C: return 'ZX-80';
                case 0x000D: return 'ZX-81';
                case 0x000E: return 'ZX Spectrum 128k, Spanish version';
                case 0x000F: return 'ZX Spectrum, Arabic version';
                case 0x0010: return 'Microdigital TK 90-X';
                case 0x0011: return 'Microdigital TK 95';
                case 0x0012: return 'Byte';
                case 0x0013: return 'Elwro 800-3';
                case 0x0014: return 'ZS Scorpion 256';
                case 0x0015: return 'Amstrad CPC 464';
                case 0x0016: return 'Amstrad CPC 664';
                case 0x0017: return 'Amstrad CPC 6128';
                case 0x0018: return 'Amstrad CPC 464+';
                case 0x0019: return 'Amstrad CPC 6128+';
                case 0x001A: return 'Jupiter ACE';
                case 0x001B: return 'Enterprise';
                case 0x001C: return 'Commodore 64';
                case 0x001D: return 'Commodore 128';
                case 0x001E: return 'Inves Spectrum+';
                case 0x001F: return 'Profi';
                case 0x0020: return 'GrandRomMax';
                case 0x0021: return 'Kay 1024';
                case 0x0022: return 'Ice Felix HC 91';
                case 0x0023: return 'Ice Felix HC 2000';
                case 0x0024: return 'Amaterske RADIO Mistrum';
                case 0x0025: return 'Quorum 128';
                case 0x0026: return 'MicroART ATM';
                case 0x0027: return 'MicroART ATM Turbo 2';
                case 0x0028: return 'Chrome';
                case 0x0029: return 'ZX Badaloc';
                case 0x002A: return 'TS-1500';
                case 0x002B: return 'Lambda';
                case 0x002C: return 'TK-65';
                case 0x002D: return 'ZX-97';
                case 0x0100: return 'ZX Microdrive';
                case 0x0101: return 'Opus Discovery';
                case 0x0102: return 'MGT Disciple';
                case 0x0103: return 'MGT Plus-D';
                case 0x0104: return 'Rotronics Wafadrive';
                case 0x0105: return 'TR-DOS (BetaDisk)';
                case 0x0106: return 'Byte Drive';
                case 0x0107: return 'Watsford';
                case 0x0108: return 'FIZ';
                case 0x0109: return 'Radofin';
                case 0x010A: return 'Didaktik disk drives';
                case 0x010B: return 'BS-DOS (MB-02)';
                case 0x010C: return 'ZX Spectrum +3 disk drive';
                case 0x010D: return 'JLO (Oliger) disk interface';
                case 0x010E: return 'Timex FDD3000';
                case 0x010F: return 'Zebra disk drive';
                case 0x0110: return 'Ramex Millenia';
                case 0x0111: return 'Larken';
                case 0x0112: return 'Kempston disk interface';
                case 0x0113: return 'Sandy';
                case 0x0114: return 'ZX Spectrum +3e hard disk';
                case 0x0115: return 'ZXATASP';
                case 0x0116: return 'DivIDE';
                case 0x0117: return 'ZXCF';
                case 0x0200: return 'Sam Ram';
                case 0x0201: return 'Multiface ONE';
                case 0x0202: return 'Multiface 128k';
                case 0x0203: return 'Multiface +3';
                case 0x0204: return 'MultiPrint';
                case 0x0205: return 'MB-02 ROM/RAM expansion';
                case 0x0206: return 'SoftROM';
                case 0x0207: return '1k';
                case 0x0208: return '16k';
                case 0x0209: return '48k';
                case 0x020A: return 'Memory in 8-16k used';
                case 0x0300: return 'Classic AY hardware (compatible with 128k ZXs)';
                case 0x0301: return 'Fuller Box AY sound hardware';
                case 0x0302: return 'Currah microSpeech';
                case 0x0303: return 'SpecDrum';
                case 0x0304: return 'AY ACB stereo (A+C=left, B+C=right); Melodik';
                case 0x0305: return 'AY ABC stereo (A+B=left, B+C=right)';
                case 0x0306: return 'RAM Music Machine';
                case 0x0307: return 'Covox';
                case 0x0308: return 'General Sound';
                case 0x0309: return 'Intec Electronics Digital Interface B8001';
                case 0x030A: return 'Zon-X AY';
                case 0x030B: return 'QuickSilva AY';
                case 0x030C: return 'Jupiter ACE';
                case 0x0400: return 'Kempston';
                case 0x0401: return 'Cursor, Protek, AGF';
                case 0x0402: return 'Sinclair 2 Left (12345)';
                case 0x0403: return 'Sinclair 1 Right (67890)';
                case 0x0404: return 'Fuller';
                case 0x0500: return 'AMX mouse';
                case 0x0501: return 'Kempston mouse';
                case 0x0600: return 'Trickstick';
                case 0x0601: return 'ZX Light Gun';
                case 0x0602: return 'Zebra Graphics Tablet';
                case 0x0603: return 'Defender Light Gun';
                case 0x0700: return 'ZX Interface 1';
                case 0x0701: return 'ZX Spectrum 128k';
                case 0x0800: return 'Kempston S';
                case 0x0801: return 'Kempston E';
                case 0x0802: return 'ZX Spectrum +3';
                case 0x0803: return 'Tasman';
                case 0x0804: return 'DK\'Tronics';
                case 0x0805: return 'Hilderbay';
                case 0x0806: return 'INES Printerface';
                case 0x0807: return 'ZX LPrint Interface 3';
                case 0x0808: return 'MultiPrint';
                case 0x0809: return 'Opus Discovery';
                case 0x080A: return 'Standard 8255 chip with ports 31,63,95';
                case 0x0900: return 'ZX Printer, Alphacom 32 & compatibles';
                case 0x0901: return 'Generic printer';
                case 0x0902: return 'EPSON compatible';
                case 0x0A00: return 'Prism VTX 5000';
                case 0x0A01: return 'T/S 2050 or Westridge 2050';
                case 0x0B00: return 'RD Digital Tracer';
                case 0x0B01: return 'DK\'Tronics Light Pen';
                case 0x0B02: return 'British MicroGraph Pad';
                case 0x0B03: return 'Romantic Robot Videoface';
                case 0x0C00: return 'ZX Interface 1';
                case 0x0D00: return 'Keypad for ZX Spectrum 128k';
                case 0x0E00: return 'Harley Systems ADC 8.2';
                case 0x0E01: return 'Blackboard Electronics';
                case 0x0F00: return 'Orme Electronics';
                case 0x1000: return 'WRX Hi-Res';
                case 0x1001: return 'G007';
                case 0x1002: return 'Memotech';
                case 0x1003: return 'Lambda Colour';
                default: return '';
            }
        }

        function getHardwareRelationDescription(relation) {
            switch (relation) {
                case 0: return ZX_Lang.TPINF_HWREL_RUNS_AND_MAY_USE;
                case 1: return ZX_Lang.TPINF_HWREL_RUNS_AND_USES;
                case 2: return ZX_Lang.TPINF_HWREL_RUNS_AND_DOES_NOT_USE;
                case 3: return ZX_Lang.TPINF_HWREL_DOES_NOT_RUN;
                default: return '';
            }
        }
        
        function getHeaderBlockTypeDescription(type) {
            switch (type) {
                case 0: return ZX_Lang.TPINF_HDR_PROGRAM;
                case 1: return ZX_Lang.TPINF_HDR_NUMBER_ARRAY;
                case 2: return ZX_Lang.TPINF_HDR_CHARACTER_ARRAY;
                case 3: return ZX_Lang.TPINF_HDR_CODE;
                default: return '';
            }
        }
    }

    function PulseBuffer(baseLevel) {
        var CLEANUP_COUNT = 500;
        var BIT_COUNT_MASK = [0x00, 0x80, 0xC0, 0xE0, 0xF0, 0xF8, 0xFC, 0xFE, 0xFF];

        var _baseLevel = baseLevel || 0;
        var _patterns = [];
        var _currentPatternIndex = -1;
        var _nextPulseShift = 0;
        var _nextPulseIndex = 0;
        
        this.get_base_level = get_base_level;
        this.set_base_level = set_base_level;
        this.get_current = get_current;
        this.next = next;
        this.clear = clear;
        this.appendComplement = appendComplement;
        this.appendSupplement = appendSupplement;
        this.appendLevel = appendLevel;
        this.appendBits = appendBits;
        this.appendBitsExplicitly = appendBitsExplicitly;
        this.appendPause = appendPause;

        function get_base_level() {
            return _baseLevel;
        }

        function set_base_level(value) {
            _baseLevel = value ? 1 : 0;
        }

        function get_current() {
            if (_currentPatternIndex < 0 || _currentPatternIndex >= _patterns.length)
                return null;
            return _patterns[_currentPatternIndex];
        }

        function next() {
            if (_currentPatternIndex >= _patterns.length) 
                return false;
            _currentPatternIndex++;
            if (_currentPatternIndex > CLEANUP_COUNT) {
                _patterns = _patterns.slice(CLEANUP_COUNT);
                _currentPatternIndex -= CLEANUP_COUNT;
            }            
            return (_currentPatternIndex < _patterns.length);
        }

        function clear() {
            _patterns = [];
            _currentPatternIndex = -1;
            _nextPulseShift = 0
            _nextPulseIndex = 0;
        }

        function appendComplement(duration, count) {
            _patterns.push({
                index: _nextPulseIndex,
                shift: _nextPulseShift,
                duration: duration,
                count: count
            });
            _nextPulseIndex += count;
            _nextPulseShift += duration * count;
        }

        function appendSupplement(duration, count) {
            appendComplement(0, 1);
            appendComplement(duration, count);
        }

        function appendLevel(level, duration) {
            var currentLevel = (_baseLevel + _nextPulseIndex) & 1;
            if (currentLevel ^ level) {
                appendComplement(duration, 1);
            }
            else {
                appendSupplement(duration, 1);
            }
        }

        function appendBits(value, count, duration0, duration1) {
            var mask = BIT_COUNT_MASK[count];
            while (mask & 0x80) {
                appendComplement((value & 0x80) ? duration1 : duration0, 2);
                mask <<= 1;
                value <<= 1;
            }
        }

        function appendBitsExplicitly(value, count, duration) {
            var mask = BIT_COUNT_MASK[count];
            while (mask & 0x80) {
                appendLevel((value & 0x80) ? 1 : 0, duration);
                mask <<= 1;
                value <<= 1;
            }
        }

        function appendPause(counterPulseDuration, duration) {
            if (counterPulseDuration && _nextPulseIndex) {
                appendComplement(counterPulseDuration, 1);
            }
            appendComplement(duration, 1);
        }
    }
}