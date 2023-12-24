/* 
    В TR-DOS'е с режимом MFM типичной длиной дорожки 
    считается 6250 байт (6208...6464 байт), для FM - 3125 байт.
    FM - Фазовая модуляция (Одинарная плотность записи)
    MFM - Модифицированная фазовая модуляция (Двойная плотность записи)
*/

function VG93(clock) {
    this.masterReset = masterReset;
    this.write = write;
    this.read = read;
    this.get_intrq = get_intrq;
    this.get_drq = get_drq;
    this.get_headLoad = get_headLoad;
    this.get_dirc = get_dirc;
    this.set_doubleDensity = set_doubleDensity;
    this.set_headReady = set_headReady;
    this.get_floppy = get_floppy;
    this.set_floppy = set_floppy;
    this.get_timeFactor = get_timeFactor;
    this.set_timeFactor = set_timeFactor;
    this.get_state = get_state;

	// Тактовый генератор.
	// Дает возможность измерять эмулируемое время для вычисления задержек.
    var _clock = clock;
    var _floppy;
  
    var BYTES_PER_TRACK_MFM = 6312; // 6250
    var BYTES_PER_TRACK_FM = 3156; // 5125

    var _timeFactor = 1;
    var _baseIntervals = {
        REVOLUTION_INTERVAL: 200, // (частота вращения = 300 об/минуту)
        INDEX_PULSE_DURATION: 4, // 2?
        STEP_DELAYS: [6, 12, 20, 30],
        HEAD_ENGAGE_DURATION: 15
    };
    // приод оборота (и появления индексного импульса)
    var REVOLUTION_INTERVAL = 200;
	// продолжительность индексного импульса (ms)
    var INDEX_PULSE_DURATION = 4;
    var HEAD_ENGAGE_DURATION = 15;
    var STEP_DELAYS = [6, 12, 20, 30];

    // in
    var _doubleDensity = 0; // MFM
    var _headReady = 0; // HRDY
    var _ready = 0; // RDY
    // out
    var _intrq = 0;
    var _drq = 0;
    var _headLoad = 0;
    var _dirc = 1;
    // internal
    var _track = 0;
    var _sector = 1;
    var _command = 0x03;
    var _data = 0;
    var _busy = 0;
    var _intrqLocked = 0;
    var _onHeadReady = new Trigger();
    var _onReadyOn = new Trigger();
    var _onReadyOff = new Trigger();
    var _commandInstance = null;
    var _revolutionState = new RevolutionState();

    var _notBusyIndexPulseCounter = 0;

    function Trigger() {
        var handlers = [];

        this.add = function (handler) {
            handlers.push(handler);
        }
        this.remove = function (handler) {
            var i = handlers.indexOf(handler);
            if (i >= 0) {
                handlers.splice(i, 1);
            }
        }
        this.fire = function () {
            var pending = handlers.splice(0);
            for (var i = 0; i < pending.length; i++) {
                pending[i]();
            }
        }
    }

    function RevolutionState() {
        var _rotation = false;
        var _lastRevolutionBegin = 0;
        var _revolutionProgress = 0;

        var _onIndexPulse = new Trigger();
        var _indexPulse = false;
        var _indexPulseBeginTask = null;
        var _indexPulseEndTask = null;

        this.get_rotation = get_rotation;
        this.set_rotation = set_rotation;
        this.get_indexPulse = get_indexPulse;
        this.get_revolutionProgressPercent = get_revolutionProgressPercent;
        this.onIndexPulse = _onIndexPulse;

        function get_rotation() {
            return _rotation; 
        }

        function set_rotation(value) {
            if (value == _rotation)
                return;
            _rotation = value;
            if (_rotation) {
                set_indexPulse(_revolutionProgress < INDEX_PULSE_DURATION);
                _indexPulseBeginTask = _clock.setInterval(function () { set_indexPulse(true);  _lastRevolutionBegin = _clock.get_ms(); }, REVOLUTION_INTERVAL, 0, REVOLUTION_INTERVAL - _revolutionProgress);
                _indexPulseEndTask = _clock.setInterval(function () { set_indexPulse(false); }, REVOLUTION_INTERVAL, 0, _revolutionProgress < INDEX_PULSE_DURATION ? INDEX_PULSE_DURATION - _revolutionProgress : REVOLUTION_INTERVAL + INDEX_PULSE_DURATION - _revolutionProgress);
            }
            else {
                set_indexPulse(false);
                _indexPulseBeginTask.cancelled = true;
                _indexPulseEndTask.cancelled = true;
                _revolutionProgress = (_clock.get_ms() - _lastRevolutionBegin) % REVOLUTION_INTERVAL;
            }
        }

        function get_indexPulse() { 
            return _indexPulse; 
        }

        function set_indexPulse(value) {
            if (value == _indexPulse)
                return;
            _indexPulse = value;
            if (_indexPulse) {
                _onIndexPulse.fire();
            }
        }

        function get_revolutionProgressPercent() {
            if (_rotation) {
                return ((_clock.get_ms() - _lastRevolutionBegin) % REVOLUTION_INTERVAL) / REVOLUTION_INTERVAL;
            }
            else {
                return _revolutionProgress / REVOLUTION_INTERVAL;
            }
        }
    }

    function get_state() {
        var state = {
            track: _track,
            sector: _sector,
            data: _data,
            command: _command,
            status: _commandInstance.get_status(),
            intrq: _intrq,
            drq: get_drq()
        };
        return state;
    }

    function masterReset() {
        _intrqLocked = 0;
        _sector = 1;
        set_ready(1);
        _command = 0x03;
        processCommand();
    }

    function calcDiskAngle() {
        return _revolutionState.get_revolutionProgressPercent();
    }

    function get_headReady() {
        return _headReady;
    }

    function set_headReady(value) {
        if (_headReady != value) {
            _headReady = value;
            if (value) {
                _onHeadReady.fire();
            }
        }
    }

    function get_ready() {
        return _ready;
    }

    function set_ready(value) {
        value = +value;
        if (_ready != value) {
            _ready = value;
            if (value) {
                _onReadyOn.fire();
            }
            else {
                _onReadyOff.fire();
            }
        }
    }

    function get_headLoad() {
        return _headLoad;
    }

    function set_headLoad(value) {
        if (_headLoad != value) {
            _headLoad = value;
            _revolutionState.set_rotation(value);
            _floppy.set_motor(value);
        }
        set_ready(value); // In Beta Disk Interface HLD pin is directly connected to RDY pin.
    }

    function get_intrq() {
        return _intrq;
    }

    function get_drq() {
        return _drq;
    }

    function get_dirc() {
        return _dirc;
    }

    function set_doubleDensity(value) {
        _doubleDensity = +!!value;
    }

    function get_floppy() {
        return _floppy;
    }

    function set_floppy(value) {
        _floppy = value;
    }

    function get_timeFactor() {
        return _timeFactor;
    }

    function set_timeFactor(value) {
        if (_timeFactor != value) {
            _timeFactor = value;
            REVOLUTION_INTERVAL = _baseIntervals.REVOLUTION_INTERVAL * _timeFactor;
            INDEX_PULSE_DURATION = _baseIntervals.INDEX_PULSE_DURATION * _timeFactor;
            for (var i = 0; i < _baseIntervals.STEP_DELAYS.length; i++) {
                STEP_DELAYS[i] = _baseIntervals.STEP_DELAYS[i] * _timeFactor;
            }
            HEAD_ENGAGE_DURATION = _baseIntervals.HEAD_ENGAGE_DURATION * _timeFactor;
        }
    }

    function get_busy() {
        return _busy;
    }

    function set_busy(value) {
        if (_busy != value) {
            _busy = value;
            if (value) {
                _revolutionState.onIndexPulse.remove(notBusyIndexPulseHandler);
            }
            else {
                _notBusyIndexPulseCounter = 0;
                _revolutionState.onIndexPulse.add(notBusyIndexPulseHandler);
            }
        }
    }

    function notBusyIndexPulseHandler() {
        if (++_notBusyIndexPulseCounter >= 15) {
            set_headLoad(0);
        }
        else {
            _revolutionState.onIndexPulse.add(notBusyIndexPulseHandler);
        }
    }

    // Таймаут чтения или записи группы байт (ms).
    function calculateReadWriteTimeout(byteCount)  {
        return (byteCount * REVOLUTION_INTERVAL / (_doubleDensity ? BYTES_PER_TRACK_MFM : BYTES_PER_TRACK_FM)); 
    }

    function read(address) {
        switch (address) {
            case 0x00: 
                var status = _commandInstance.get_status();
                if (!_intrqLocked) {
                    _intrq = 0;
                }
                return status;
            case 0x01: return _track;
            case 0x02: return _sector;
            case 0x03: 
                var data = _data;
                var reading = get_busy()
                    && (
                        _commandInstance instanceof ReadSectorCommand
                        || _commandInstance instanceof ReadAddressCommand
                        || _commandInstance instanceof ReadTrackCommand
                    );
                if (reading) {
                    _drq = 0;
                }
                return data;
            }
    }

    function write(address, value) {
        switch (address) {
            case 0x00: _command = value; processCommand(); break;
            // case 0x01: _track = value; break;
            // case 0x02: _sector = value; break;
            case 0x01: if (!get_busy()) { _track = value; } break;
            case 0x02: if (!get_busy()) { _sector = value; } break;
            case 0x03:
                _data = value;
                var writing = get_busy()
                    && (
                        _commandInstance instanceof WriteSectorCommand
                        || _commandInstance instanceof WriteTrackCommand
                    );
                if (writing) {
                    _drq = 0;
                }
                break;
        }
    }

    function processCommand() {
        var instance = null;
        if ((_command & 0xF0) == 0xD0) {
            instance = new InterruptCommand(_command, _commandInstance);
        }
        else if (!get_busy()) {
            if (!(_command & 0x80)) {
                if (_command & 0x60) {
                    instance = new StepCommand(_command);
                }
                else {
                    instance = new SeekRestoreCommand(_command);
                }
            }
            else if (!(_command & 0x40)) {
                switch (_command & 0xE0) {
                    case 0x80: instance = new ReadSectorCommand(_command); break;
                    case 0xA0: instance = new WriteSectorCommand(_command); break;
                }
            }
            else {
                switch (_command & 0xF0) {
                    case 0xC0: instance = new ReadAddressCommand(_command); break;
                    case 0xE0: instance = new ReadTrackCommand(_command); break;
                    case 0xF0: instance = new WriteTrackCommand(_command); break;
                }
            }
        }
        if (instance) {
            // should it be like that?
            if (_commandInstance instanceof InterruptCommand) {
                _commandInstance.terminate();
            }
            _commandInstance = instance;
            _commandInstance.execute();
        }
    }

    function InterruptCommand(code, lastCommand) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var _fOnReadyOn = !!(code & 0x01);
        var _fOnReadyOff = !!(code & 0x02);
        var _fOnIndexPulse = !!(code & 0x04);
        var _fImmediate = !!(code & 0x08);
        var _fNoInterrupt = !(code & 0x0F);
        var _lastCommand = lastCommand;
        var _commandTerminated = false;

        function get_status() {
            if (_commandTerminated) {
                return _lastCommand.get_status();
            }
            else {
                return (!get_ready() << 7)
                    | (_floppy.get_isWriteProtected() << 6)
                    | (get_headLoad() << 5)
                    | (!_floppy.get_cylinder() << 2)
                    | (_revolutionState.get_indexPulse() << 1)
                    | get_busy();

            }
        }

        function execute() {
            if (get_busy()) {
                set_busy(0);
                _lastCommand.terminate();
                _commandTerminated = true;
            }
            if (_fOnReadyOn) {
                _onReadyOn.add(deferredInterrupt);
            }
            if (_fOnReadyOff) {
                _onReadyOff.add(deferredInterrupt);
            }
            if (_fOnIndexPulse) {
                _revolutionState.onIndexPulse.add(deferredInterrupt);
            }
            if (_fImmediate) {
                _intrq = 1;
            }
            // It seems that we should not lock INTRQ once we get
            // 'Immediate' flag mixed with any other conditinal flag.
            // In this case 'CAT' command in TR-DOS fails on the
            // second time.
            if (_fImmediate && !_fOnReadyOn && !_fOnReadyOff && !_fOnIndexPulse) {
                _intrqLocked = 1;
            }
            if (_fNoInterrupt) {
                _intrqLocked = 0;
            }
        }

        function deferredInterrupt() {
            _intrq = 1;
            // UNDONE: should interrupt occur on EVERY index pulse?
            // if (_fOnIndexPulse) {
            //     _onIndexPulse.add(deferredInterrupt);
            // }
        }

        function terminate() {
            _onReadyOn.remove(deferredInterrupt);
            _onReadyOff.remove(deferredInterrupt);
            _revolutionState.onIndexPulse.remove(deferredInterrupt);
        }
    }

    function WriteTrackCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var _fDelay = !!(code & 0x04);
        var _stream = null;
        var _crc = new CRC16();
        var _crcBytesWritten = 0;
        var _dataLostError = 0;
        var _writeError = 0;
        var _headEngagementTask = null;
        var _drqServiceWaitingTask = null;
        var _processTask = null;

        function get_status() {
            return (!get_ready() << 7)
                | (_floppy.get_isWriteProtected() << 6)
                | (_writeError << 5)
                | (_dataLostError << 2)
                | (_drq << 1)
                | get_busy();
        }
        
        function execute() {
            set_busy(1);
            _drq = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            _dataLostError = 0;
            _writeError = 0;
            if (_floppy.get_isReady()) {
                set_headLoad(1);
                if (_fDelay) {
                    _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
                }
                else {
                    onHeadEngaged();
                }
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            if (_headReady) {
                checkForWriteProtection();
            }
            else {
                _onHeadReady.add(checkForWriteProtection);
            }
        }

        function checkForWriteProtection() {
            if (!_floppy.get_isWriteProtected()) {
                _drq = 1;
                _drqServiceWaitingTask = _clock.setTimeout(waitDrqIsServiced, calculateReadWriteTimeout(3));
            }
            else {
                onCompleted();
            }
        }

        function waitDrqIsServiced() {
            if (!_drq) {
                _revolutionState.onIndexPulse.add(writeTrack);
            }
            else {
                _dataLostError = 1;
                onCompleted();
            }
        }

        function writeTrack() {
            _revolutionState.onIndexPulse.add(onCompleted);
            _stream = _floppy.openStream();
            _processTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0, 0);
        }

        function processNext() {
            if (_drq) {
                // drq has not been serviced
                _dataLostError = 1;
                _stream.write(0x00);
                _crc.add(0x00);
            }
            else if (_crcBytesWritten) {
                switch (_crcBytesWritten) {
                    case 1:
                        _stream.write(_crc.value & 0xFF);
                        _crcBytesWritten++
                        break;
                    case 2:
                        // Real controller has a bug here.
                        // After crc has just been transferred to a
                        // disk, the next byte is being interpreted
                        // as an ordinary value to be stored, but 
                        // not a command.
                        _stream.write(_data);
                        _crcBytesWritten = 0;
                        _drq = 1;
                        break;
                }
            }
            else if (_doubleDensity) {
                switch (_data) {
                    case 0xF5: 
                        _stream.write(0x1A1);
                        // This is the real logiс.
                        // We preset CRC16(A1, A1, A1) every time we get F5.
                        _crc.value = 0xCDB4; 
                        break;
                    case 0xF6: 
                        _stream.write(0x1C2); 
                        _crc.add(0xC2);
                        break;
                    case 0xF7: 
                        _stream.write(_crc.value >> 8); 
                        _crcBytesWritten++;
                        break;
                    default: 
                        _stream.write(_data);
                        _crc.add(_data);
                        break;
                }
                _drq = 1;
            }
            else {
                switch (_data) {
                    case 0xF7: 
                        _stream.write(_crc.value >> 8); 
                        _crcBytesWritten++;
                        break;
                    case 0xF8:
                    case 0xF9:
                    case 0xFA:
                    case 0xFB:
                    case 0xFE: 
                        _crc.value = 0xFFFF;
                        _stream.write(_data | 0x100);
                        _crc.add(_data);
                        break;
                    case 0xFC:
                        _stream.write(_data | 0x100);
                        _crc.add(_data);
                        break;
                    default: 
                        _stream.write(_data);
                        _crc.add(_data);
                        break;
                }
                _drq = 1;
            }
        }

        function onCompleted() {
            _processTask && (_processTask.cancelled = true);
            _intrq = 1;
            set_busy(0);
        }

        function terminate() {
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(checkForWriteProtection);
            _drqServiceWaitingTask && (_drqServiceWaitingTask.cancelled = true);
            _revolutionState.onIndexPulse.remove(writeTrack);
            _revolutionState.onIndexPulse.remove(onCompleted);
            _processTask && (_processTask.cancelled = true);
        }
    }

    function ReadTrackCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var _fDelay = !!(code & 0x04);
        var _stream = null;
        var _dataLostError = 0;
        var _headEngagementTask = null;
        var _readTask = null;

        function get_status() {
            return (!get_ready() << 7)
                | (_dataLostError << 2)
                | (_drq << 1)
                | get_busy();
        }

        function execute() {
            set_busy(1);
            _drq = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            _dataLostError = 0;

            if (_floppy.get_isReady()) {
                set_headLoad(1);
                if (_fDelay) {
                    _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
                }
                else {
                    onHeadEngaged();
                }
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            if (_headReady) {
                waitForTrackBegin();
            }
            else {
                _onHeadReady.add(waitForTrackBegin);
            }
        }

        function waitForTrackBegin() {
            _revolutionState.onIndexPulse.add(readTrack);
        }

        function readTrack() {
            _stream = _floppy.openStream();
            _revolutionState.onIndexPulse.add(onCompleted);
            _readTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0);
        }

        function processNext() {
            if (_drq) { 
                _dataLostError = 1;
            }

            var nextValue = _stream.read();
            if (nextValue < 0) {
                nextValue = _doubleDensity ? 0x4E : 0xFF;
            }
            _data = nextValue & 0xFF;
            _drq = 1;
        }

        function onCompleted() {
            _readTask && (_readTask.cancelled = true);
            _intrq = 1;
            set_busy(0);
        }

        function terminate() {
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(waitForTrackBegin);
            _revolutionState.onIndexPulse.remove(readTrack);
            _revolutionState.onIndexPulse.remove(onCompleted);
            _readTask && (_readTask.cancelled = true);
        }
    }

    function ReadAddressCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var _fDelay = !!(code & 0x04);
        var _stream = null;
        var _amDetector = null;
        var _idDetected = 0;
        var _bytesCounter = 0;
        var _idTrack = null;
        var _idCrc = null;
        var _indexPulsesEncountered = 0;

        var _crc = null;
        var _notFoundError = 0;
        var _crcError = 0;
        var _dataLostError = 0;

        var _headEngagementTask = null;
        var _readTask = null;

        function get_status() {
            return (!get_ready() << 7) 
                | (_notFoundError << 4)
                | (_crcError << 3)
                | (_dataLostError << 2)
                | (_drq << 1)
                | get_busy();
        }

        function execute() {
            set_busy(1);
            _drq = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            _dataLostError = 0;
            _notFoundError = 0;

            if (_floppy.get_isReady()) {
                set_headLoad(1);
                if (_fDelay) {
                    _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
                }
                else {
                    onHeadEngaged();
                }
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            if (_headReady) {
                initReading();
            }
            else {
                _onHeadReady.add(initReading);
            }
        }

        function initReading() {
            var bytesPerTrack = _doubleDensity ? BYTES_PER_TRACK_MFM : BYTES_PER_TRACK_FM;
            var startIndex = (bytesPerTrack * calcDiskAngle()) | 0;
            _stream = _floppy.openStream();
            _stream.seek(Math.min(startIndex, _stream.get_length()));
            _indexPulsesEncountered = 0;
            _amDetector = new VG93AMDetector(_doubleDensity);
            _readTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0);
            _revolutionState.onIndexPulse.add(onIndexPulse);
        }
        
        function processNext() {
            var nextValue = _stream.read();
            if (nextValue < 0) {
                nextValue = _doubleDensity ? 0x4E : 0xFF;
            }
            var nextByte = nextValue & 0xFF;
            _amDetector.analyseNext(nextValue);

            if (!_idDetected) {
                var marker = _amDetector.get_marker();
                if (marker && marker >= 0xFC && marker <= 0xFF) {
                    _idDetected = 1;
                    _bytesCounter = 0;
                    _crc = new CRC16();
                    if (_doubleDensity) {
                        _crc.addArray([0xA1, 0xA1, 0xA1]);
                    }
                    _crc.add(nextByte);
                }
            }
            else {
                if (_drq) {
                    _dataLostError = 1;
                }
                if (_bytesCounter < 4) {
                    _crc.add(nextByte);
                }
                if (_bytesCounter < 6) {
                    switch (_bytesCounter) {
                        case 0: _idTrack = nextByte; break;
                        case 4: _idCrc = nextByte << 8; break;
                        case 5: _idCrc |= nextByte; break;
                    }
                    _data = nextByte;
                    _drq = 1;
                    _bytesCounter++
                }
                else {
                    _sector = _idTrack;
                    if (_idCrc != _crc.value) {
                        _crcError = 1;
                    }
                    _readTask.cancelled = true;
                    _revolutionState.onIndexPulse.remove(onIndexPulse);
                    _amDetector = null;
                    _stream = null;
                    onCompleted();
                }
            }
        }

        function onIndexPulse() {
            _stream.seek(0);
            if (++_indexPulsesEncountered > 1) {
                _readTask.cancelled = true;
                _notFoundError = 1;
                _amDetector = null;
                _stream = null;
                onCompleted();
            }
            else {
                _revolutionState.onIndexPulse.add(onIndexPulse);
            }
        }

        function onCompleted() {
            _intrq = 1;
            set_busy(0);
        }

        function terminate() {
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(initReading);
            _readTask && (_readTask.cancelled = true);
            _revolutionState.onIndexPulse.remove(onIndexPulse);
            _amDetector = null;
            _stream = null;
        }
    }

    function ReadSectorCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var OP_STAGE = {
            DETECT_IDAM: 1,
            READ_ID: 2,
            DETECT_DAM: 3,
            READ_DATA: 4,
            READ_CRC: 5
        };

        var _fMultuple = !!(code & 0x10);
        var _fDelay = !!(code & 0x04);
        var _fHeadCompare = !!(code & 0x02);
        var _head = +!!(code & 0x08);
        var _stream = null;
        var _amDetector = null;
        var _opStage = null;
        var _idCrc = null;
        var _rwCounter = 0;
        var _dataMarkerMaxDistance = null;
        var _dataBytesLength = 0;
        var _dataCrc = null;
        var _indexPulsesEncountered = 0;

        var _crcError = 0;
        var _notFoundError = 0;
        var _dataLostError = 0;
        var _recordType = 0;

        var _headEngagementTask = null;
        var _readTask = null;

        function get_status() {
            return (!get_ready() << 7)
                | (_recordType << 5)
                | (_notFoundError << 4)
                | (_crcError << 3)
                | (_dataLostError << 2)
                | (_drq << 1)
                | get_busy();
        }

        function execute() {
            set_busy(1);
            _drq = 0;
            _dataLostError = 0;
            _notFoundError = 0;
            _recordType = 0;
            _crcError = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            var ready = _floppy.get_isReady();
            if (ready) {
                set_headLoad(1);
                if (_fDelay) {
                    _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
                }
                else {
                    onHeadEngaged();
                }
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            _headEngagementTask = null;
            if (_headReady) {
                initReading();
            }
            else {
                _onHeadReady.add(initReading);
            }
        }

        function initReading() {
            var bytesPerTrack = _doubleDensity ? BYTES_PER_TRACK_MFM : BYTES_PER_TRACK_FM;
            var startIndex = (bytesPerTrack * calcDiskAngle()) | 0;
            _stream = _floppy.openStream();
            _stream.seek(Math.min(startIndex, _stream.get_length()));
            _amDetector = new VG93AMDetector(_doubleDensity);
            _opStage = OP_STAGE.DETECT_IDAM;
            _dataMarkerMaxDistance = _doubleDensity ? 43 : 30;
            _readTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0);
            _revolutionState.onIndexPulse.add(onIndexPulse);
        }

        function processNext() {
            var nextValue = _stream.read();
            if (nextValue < 0) {
                nextValue = _doubleDensity ? 0x4E : 0xFF;
            }
            var nextByte = nextValue & 0xFF;
            _amDetector.analyseNext(nextValue);
            
            switch (_opStage) {
                case OP_STAGE.DETECT_IDAM: 
                    var marker = _amDetector.get_marker();
                    if (marker && marker >= 0xFC && marker <= 0xFF) {
                        _opStage = OP_STAGE.READ_ID;
                        _rwCounter = 0;
                        _id = new Array(6);
                        _crc = new CRC16();
                        _doubleDensity && _crc.addArray([0xA1, 0xA1, 0xA1]);
                        _crc.add(nextByte);
                    }
                    break;
                case OP_STAGE.READ_ID:
                    if (_rwCounter < 4) {
                        _crc.add(nextByte);
                    }
                    switch (_rwCounter) {
                        case 0: if (nextByte != _track) _opStage = OP_STAGE.DETECT_IDAM; break;
                        case 1: if (_fHeadCompare && nextByte != _head) _opStage = OP_STAGE.DETECT_IDAM; break;
                        case 2: if (nextByte != _sector) _opStage = OP_STAGE.DETECT_IDAM; break;
                        case 3: _dataBytesLength = (0x0080 << nextByte); break;
                        case 4: _idCrc = nextByte << 8; break;
                        case 5: _idCrc |= nextByte; break;
                    }
                    if (++_rwCounter == 6) {
                        _rwCounter = 0;
                        _crcError = (_idCrc != _crc.value);
                        _opStage = _crcError ? OP_STAGE.DETECT_IDAM : OP_STAGE.DETECT_DAM;
                    }
                    break;
                case OP_STAGE.DETECT_DAM:
                    var marker = _amDetector.get_marker();
                    if (marker && marker >= 0xF8 && marker <= 0xFB) {
                        _recordType = +(marker == 0xF8 || marker == 0xF9);
                        _crc = new CRC16();
                        _doubleDensity && _crc.addArray([0xA1, 0xA1, 0xA1]);
                        _crc.add(nextByte);
                        _rwCounter = 0;
                        _opStage = OP_STAGE.READ_DATA;
                    }
                    else if (++_rwCounter == _dataMarkerMaxDistance) {
                        _opStage = OP_STAGE.DETECT_IDAM;
                    }
                    break;
                case OP_STAGE.READ_DATA:
                    if (_drq) {
                        _dataLostError = 1;
                    }
                    _crc.add(nextByte);
                    _data = nextByte;
                    _drq = 1;
                    if (++_rwCounter == _dataBytesLength) {
                        _rwCounter = 0;
                        _opStage = OP_STAGE.READ_CRC
                    }
                    break;
                case OP_STAGE.READ_CRC:
                    if (_drq) {
                        _dataLostError = 1;
                    }
                    switch (_rwCounter) {
                        case 0: _dataCrc = nextByte << 8; break;
                        case 1: _dataCrc |= nextByte; break;
                    }
                    if (++_rwCounter == 2) {
                        if (_dataCrc != _crc.value) {
                            _crcError = 1;
                        }
                        if (_fMultuple && !_crcError) {
                            _sector++;
                            _indexPulsesEncountered = 0;
                            _rwCounter = 0;
                            _opStage = OP_STAGE.DETECT_IDAM;
                        }
                        else {
                            _readTask.cancelled = true;
                            _revolutionState.onIndexPulse.remove(onIndexPulse);
                            _amDetector = null;
                            _stream = null;
                            onCompleted();
                        }
                    }
                    break;
            }
        }

        function onIndexPulse() {
            _stream.seek(0);
            if (++_indexPulsesEncountered > 1) {
                _readTask.cancelled = true;
                _notFoundError = 1;
                _amDetector = null;
                _stream = null;
                onCompleted();
            }
            else {
                _revolutionState.onIndexPulse.add(onIndexPulse);
            }
        }

        function onCompleted() {
            _intrq = 1;
            set_busy(0);
        }

        function terminate() {
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(initReading);
            _readTask && (_readTask.cancelled = true);
            _revolutionState.onIndexPulse.remove(onIndexPulse);
            _amDetector = null;
            _stream = null;
        }
    }

    function WriteSectorCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var OP_STAGE = {
            DETECT_IDAM: 1,
            READ_ID: 2,
            DELAY: 3,
            WRITE_SYNC_AND_DAM: 4,
            WRITE_DATA: 5,
            WRITE_CRC: 6
        };

        var _fMultuple = !!(code & 0x10);
        var _fDelay = !!(code & 0x04);
        var _fHeadCompare = !!(code & 0x02);
        var _recordType = !!(code & 0x01);
        var _head = +!!(code & 0x08);
        var _stream = null;
        var _amDetector = null;
        var _opStage = null;
        var _idCrc = null;
        var _rwCounter = 0;
        var _dataBytesLength = 0;
        var _indexPulsesEncountered = 0;
        var _fmSync = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var _mfmSync = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1A1, 0x1A1, 0x1A1];

        var _crcError = 0;
        var _notFoundError = 0;
        var _dataLostError = 0;
        var _writeError = 0;

        var _headEngagementTask = null;
        var _writeTask = null;

        function get_status() {
            return (!get_ready() << 7)
                | (_floppy.get_isWriteProtected() << 6)
                | (_writeError << 5)
                | (_notFoundError << 4)
                | (_crcError << 3)
                | (_dataLostError << 2)
                | (_drq << 1)
                | get_busy();
        }

        function execute() {
            set_busy(1);
            _drq = 0;
            _dataLostError = 0;
            _notFoundError = 0;
            _recordType = 0;
            _writeError = 0;
            _crcError = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            var ready = _floppy.get_isReady();
            if (ready) {
                set_headLoad(1);
                if (_fDelay) {
                    _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
                }
                else {
                    onHeadEngaged();
                }
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            if (_headReady) {
                checkForWriteProtection();
            }
            else {
                _onHeadReady.add(checkForWriteProtection);
            }
        }

        function checkForWriteProtection() {
            if (!_floppy.get_isWriteProtected()) {
                initWriting();
            }
            else {
                onCompleted();
            }
        }

        function initWriting() {
            var bytesPerTrack = _doubleDensity ? BYTES_PER_TRACK_MFM : BYTES_PER_TRACK_FM;
            var startIndex = (bytesPerTrack * calcDiskAngle()) | 0;
            _stream = _floppy.openStream();
            _stream.seek(Math.min(startIndex, _stream.get_length()));
            _amDetector = new VG93AMDetector(_doubleDensity);
            _opStage = OP_STAGE.DETECT_IDAM;
            _writeTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0);
            _revolutionState.onIndexPulse.add(onIndexPulse);
        }
        
        function processNext() {
            if (_opStage != OP_STAGE.WRITE_SYNC_AND_DAM && _opStage != OP_STAGE.WRITE_DATA && _opStage != OP_STAGE.WRITE_CRC) {
                var nextValue = _stream.read();
                if (nextValue < 0) {
                    nextValue = _doubleDensity ? 0x4E : 0xFF;
                }
                var nextByte = nextValue & 0xFF;
                _amDetector.analyseNext(nextValue);
    
                switch (_opStage) {
                    case OP_STAGE.DETECT_IDAM: 
                        var marker = _amDetector.get_marker();
                        if (marker && marker >= 0xFC && marker <= 0xFF) {
                            _opStage = OP_STAGE.READ_ID;
                            _rwCounter = 0;
                            _id = new Array(6);
                            _crc = new CRC16();
                            _doubleDensity && _crc.addArray([0xA1, 0xA1, 0xA1]);
                            _crc.add(nextByte);
                        }
                        break;
                    case OP_STAGE.READ_ID:
                        if (_rwCounter < 4) {
                            _crc.add(nextByte);
                        }
                        switch (_rwCounter) {
                            case 0: if (nextByte != _track) _opStage = OP_STAGE.DETECT_IDAM; break;
                            case 1: if (_fHeadCompare && nextByte != _head) _opStage = OP_STAGE.DETECT_IDAM; break;
                            case 2: if (nextByte != _sector) _opStage = OP_STAGE.DETECT_IDAM; break;
                            case 3: _dataBytesLength = (0x0080 << nextByte); break;
                            case 4: _idCrc = nextByte << 8; break;
                            case 5: _idCrc |= nextByte; break;
                        }
                        if (++_rwCounter == 6) {
                            _rwCounter = 0;
                            _crcError = (_idCrc != _crc.value);
                            _opStage = _crcError ? OP_STAGE.DETECT_IDAM : OP_STAGE.DELAY;
                        }
                        break;
                    case OP_STAGE.DELAY:
                        switch (++_rwCounter) {
                            case 2: _drq = 1; break;
                            case 10: 
                                if (_drq) {
                                    _dataLostError = 1;
                                    _writeTask.cancelled = true;
                                    _revolutionState.onIndexPulse.remove(onIndexPulse);
                                    _amDetector = null;
                                    _stream = null;
                                    onCompleted();
                                }
                                break;
                            case 11: 
                                if (!_doubleDensity) {
                                    _rwCounter = 0;
                                    _opStage = OP_STAGE.WRITE_SYNC_AND_DAM;
                                }
                                break;
                            case 22: 
                                _rwCounter = 0;
                                _opStage = OP_STAGE.WRITE_SYNC_AND_DAM;
                                break;
                        }
                        break;
                }
            }
            else {
                switch (_opStage) {
                    case OP_STAGE.WRITE_SYNC_AND_DAM:
                        var sync = _doubleDensity ? _mfmSync : _fmSync;
                        if (_rwCounter < sync.length) {
                            _stream.write(sync[_rwCounter++]);
                        }
                        else {
                            var nextByte = _recordType ? 0xF8 : 0xFB;
                            _stream.write(nextByte);
                            _crc = new CRC16();
                            _doubleDensity && _crc.addArray([0xA1, 0xA1, 0xA1]);
                            _crc.add(nextByte);
                            _rwCounter = 0;
                            _opStage = OP_STAGE.WRITE_DATA;
                        }
                        break;
                    case OP_STAGE.WRITE_DATA:
                        var nextByte;
                        if (_drq) {
                            nextByte = 0;
                            _dataLostError = 1;
                        }
                        else {
                            nextByte = _data;
                        }
                        _stream.write(nextByte);
                        _crc.add(nextByte);
                        if (++_rwCounter < _dataBytesLength) {
                            _drq = 1;
                        }
                        else {
                            _opStage = OP_STAGE.WRITE_CRC;
                            _rwCounter = 0;
                        }
                        break;
                    case OP_STAGE.WRITE_CRC:
                        switch (_rwCounter) {
                            case 0: _stream.write(_crc.value >> 8); break;
                            case 1: _stream.write(_crc.value & 0xFF); break;
                            case 2: _stream.write(0xFF); break
                        }
                        if (++_rwCounter == 3) {
                            if (_fMultuple) {
                                _sector++;
                                _indexPulsesEncountered = 0;
                                _rwCounter = 0;
                                _opStage = OP_STAGE.DETECT_IDAM;
                            }
                            else {
                                _writeTask.cancelled = true;
                                _revolutionState.onIndexPulse.remove(onIndexPulse);
                                _amDetector = null;
                                _stream = null;
                                onCompleted();
                            }
                        }
                        break;
                }
            }
        }

        function onIndexPulse() {
            _stream.seek(0);
            if (++_indexPulsesEncountered > 1) {
                _writeTask.cancelled = true;
                _notFoundError = 1;
                _amDetector = null;
                _stream = null;
                onCompleted();
            }
            else {
                _revolutionState.onIndexPulse.add(onIndexPulse);
            }
        }

        function onCompleted() {
            _intrq = 1;
            set_busy(0);
        }

        function terminate() {
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(checkForWriteProtection);
            _writeTask && (_writeTask.cancelled = true);
            _revolutionState.onIndexPulse.remove(onIndexPulse);
            _amDetector = null;
            _stream = null;
    }
    }

    function StepCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;
        
        var _cmdStepIn = (code & 0x60) == 0x40;
        var _cmdStepOut = (code & 0x60) == 0x60;
        var _fUpdate = !!(code & 0x10);
        var _fHeadLoad = !!(code & 0x08);
        var _fVerify = !!(code & 0x04);
        var _rate = code & 0x03;
        var _crcError = 0;
        var _seekError = 0;

        var _stream = null;
        var _amDetector = null;
        var _idDetected = 0;
        var _idCrc = null;
        var _rwCounter = 0;
        var _crc = null;
        var _indexPulsesEncountered = 0;
        var _stepTask = null;
        var _headEngagementTask = null;
        var _verifyTask = null;

        function get_status() {
            return (!get_ready() << 7)
                | (_floppy.get_isWriteProtected() << 6)
                | (get_headLoad() << 5)
                | (_seekError << 4)
                | (_crcError << 3)
                | (!_floppy.get_cylinder() << 2)
                | (_revolutionState.get_indexPulse() << 1)
                | get_busy();
        }

        function execute() { 
            set_busy(1);
            _drq = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            _crcError = 0;
            _seekError = 0;
            set_headLoad(+_fHeadLoad);
            if (_cmdStepIn || _cmdStepOut) {
                _dirc = +_cmdStepIn;
            }
            if (_fUpdate) {
                _track += (_dirc ? 1 : -1);
            }
            if (_floppy.get_cylinder() > 0 || _dirc) {
                if (_dirc) {
                    _floppy.stepIn();
                }
                else {
                    _floppy.stepOut();
                }
                _stepTask = _clock.setTimeout(onStepCompleted, STEP_DELAYS[_rate]);
            }
            else {
                _track = 0;
                onStepCompleted();
            }
        }

        function onStepCompleted() {
            if (_fVerify) {
                set_headLoad(1);
                _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            if (_headReady) {
                verify();
            }
            else {
                _onHeadReady.add(verify);
            }
        }

        function verify() {
            var bytesPerTrack = _doubleDensity ? BYTES_PER_TRACK_MFM : BYTES_PER_TRACK_FM;
            var startIndex = (bytesPerTrack * calcDiskAngle()) | 0;
            _stream = _floppy.openStream();
            _stream.seek(Math.min(startIndex, _stream.get_length()));
            _amDetector = new VG93AMDetector(_doubleDensity);
            _indexPulsesEncountered = 0;
            _verifyTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0);
            _revolutionState.onIndexPulse.add(onIndexPulse);
        }

        function processNext() {
            var nextValue = _stream.read();
            if (nextValue < 0) {
                nextValue = _doubleDensity ? 0x4E : 0xFF;
            }
            var nextByte = nextValue & 0xFF;
            _amDetector.analyseNext(nextValue);

            if (!_idDetected) {
                var marker = _amDetector.get_marker();
                if (marker && marker >= 0xFC && marker <= 0xFF) {
                    _idDetected = 1;
                    _rwCounter = 0;
                    _id = new Array(6);
                    _crc = new CRC16();
                    _doubleDensity && _crc.addArray([0xA1, 0xA1, 0xA1]);
                    _crc.add(nextByte);
                }
            }
            else {
                if (_rwCounter < 4) {
                    _crc.add(nextByte);
                }
                switch (_rwCounter) {
                    case 0: if (nextByte != _track) _idDetected = 0; break;
                    case 4: _idCrc = nextByte << 8; break;
                    case 5: _idCrc |= nextByte; break;
                }
                if (++_rwCounter == 6) {
                    _crcError = (_idCrc != _crc.value);
                    if (_crcError) {
                        _idDetected = 0;
                    }
                    else {
                        _verifyTask.cancelled = true;
                        _revolutionState.onIndexPulse.remove(onIndexPulse);
                        _amDetector = null;
                        _stream = null;
                        onCompleted();
                    }
                }
            }
        }

        function onIndexPulse() {
            _stream.seek(0);
            if (++_indexPulsesEncountered > 1) {
                _verifyTask.cancelled = true;
                _seekError = 1;
                _amDetector = null;
                _stream = null;
                onCompleted();
            }
            else {
                _revolutionState.onIndexPulse.add(onIndexPulse);
            }
        }

        function onCompleted() {
            set_busy(0);
            _intrq = 1;
        }

        function terminate() { 
            _stepTask && (_stepTask.cancelled = true);
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(verify);
            _verifyTask && (_verifyTask.cancelled = true);
            _revolutionState.onIndexPulse.remove(onIndexPulse);
        }
    }

    function SeekRestoreCommand(code) {
        this.execute = execute;
        this.terminate = terminate;
        this.get_status = get_status;

        var _cmdSeek = !!(code & 0x10);
        var _fHeadLoad = !!(code & 0x08);
        var _fVerify = !!(code & 0x04);
        var _rate = code & 0x03;
        var _crcError = 0;
        var _seekError = 0;

        var _stream = null;
        var _amDetector = null;
        var _idDetected = 0;
        var _idCrc = null;
        var _rwCounter = 0;
        var _crc = null;
        var _indexPulsesEncountered = 0;
        var _stepTask = null;
        var _headEngagementTask = null;
        var _verifyTask = null;

        function get_status() {
            return (!get_ready() << 7) 
                | (_floppy.get_isWriteProtected() << 6)
                | (get_headLoad() << 5)
                | (_seekError << 4)
                | (_crcError << 3)
                | (!_floppy.get_cylinder() << 2)
                | (_revolutionState.get_indexPulse() << 1)
                | get_busy();
        }

        function execute() {
            set_busy(1);
            _drq = 0;
            if (!_intrqLocked) {
                _intrq = 0;
            }
            _crcError = 0;
            _seekError = 0;
            set_headLoad(+_fHeadLoad);
            if (!_cmdSeek) {
                _track = 0xFF;
                _data = 0x00;
            }
            doStep();
        }

        function doStep() {
            _stepTask = null;
            if (_track == _data) {
                onStepCompleted();
                return;
            }
            _dirc = (_data > _track) ? 1 : 0;
            _track += (_dirc ? 1 : -1);
            if (_floppy.get_cylinder() == 0 && !_dirc) {
                _track = 0;
                onStepCompleted();
                return;
            }
            if (_dirc) {
                _floppy.stepIn();
            }
            else {
                _floppy.stepOut();
            }
            _stepTask = _clock.setTimeout(doStep, STEP_DELAYS[_rate]);
        }

        function onStepCompleted() {
            if (_fVerify) {
                set_headLoad(true);
                _headEngagementTask = _clock.setTimeout(onHeadEngaged, HEAD_ENGAGE_DURATION);
            }
            else {
                onCompleted();
            }
        }

        function onHeadEngaged() {
            _headEngagementTask = null;
            if (_headReady) {
                verify();
            }
            else {
                _onHeadReady.add(verify);
            }
        }

        function verify() {
            var bytesPerTrack = _doubleDensity ? BYTES_PER_TRACK_MFM : BYTES_PER_TRACK_FM;
            var startIndex = (bytesPerTrack * calcDiskAngle()) | 0;
            _stream = _floppy.openStream();
            _stream.seek(Math.min(startIndex, _stream.get_length()));
            _amDetector = new VG93AMDetector(_doubleDensity);
            _indexPulsesEncountered = 0;
            _verifyTask = _clock.setInterval(processNext, calculateReadWriteTimeout(1), 0);
            _revolutionState.onIndexPulse.add(onIndexPulse);
        }

        function processNext() {
            var nextValue = _stream.read();
            if (nextValue < 0) {
                nextValue = _doubleDensity ? 0x4E : 0xFF;
            }
            var nextByte = nextValue & 0xFF;
            _amDetector.analyseNext(nextValue);

            if (!_idDetected) {
                var marker = _amDetector.get_marker();
                if (marker && marker >= 0xFC && marker <= 0xFF) {
                    _idDetected = 1;
                    _rwCounter = 0;
                    _id = new Array(6);
                    _crc = new CRC16();
                    _doubleDensity && _crc.addArray([0xA1, 0xA1, 0xA1]);
                    _crc.add(nextByte);
                }
            }
            else {
                if (_rwCounter < 4) {
                    _crc.add(nextByte);
                }
                switch (_rwCounter) {
                    case 0: if (nextByte != _track) _idDetected = 0; break;
                    case 4: _idCrc = nextByte << 8; break;
                    case 5: _idCrc |= nextByte; break;
                }
                if (++_rwCounter == 6) {
                    _crcError = (_idCrc != _crc.value);
                    if (_crcError) {
                        _idDetected = 0;
                    }
                    else {
                        _verifyTask.cancelled = true;
                        _revolutionState.onIndexPulse.remove(onIndexPulse);
                        _amDetector = null;
                        _stream = null;
                        onCompleted();
                    }
                }
            }
        }

        function onIndexPulse() {
            _stream.seek(0);
            if (++_indexPulsesEncountered > 1) {
                _verifyTask.cancelled = true;
                _seekError = 1;
                _amDetector = null;
                _stream = null;
                onCompleted();
            }
            else {
                _revolutionState.onIndexPulse.add(onIndexPulse);
            }
        }

        function onCompleted() {
            set_busy(0);
            _intrq = 1;
        }

        function terminate() { 
            _stepTask && (_stepTask.cancelled = true);
            _headEngagementTask && (_headEngagementTask.cancelled = true);
            _onHeadReady.remove(verify);
            _verifyTask && (_verifyTask.cancelled = true);
            _revolutionState.onIndexPulse.remove(onIndexPulse);
        }
    }
}

function VG93AMDetector(doubleDensity) {
    var _doubleDensity = doubleDensity;
    var _state = 0;
    var _marker = null;

    this.reset = function () {
        _state = 0;
        _marker = null;
    }

    this.analyseNext = function (nextValue) {
        if (_doubleDensity) {
            switch (_state) {
                case 0:
                case 2:
                    switch (nextValue) {
                        case 0x1A1:
                        case 0x1C2:
                            _state = 1;
                            _marker = null;
                            break;

                        default:
                            _state = 0;
                            _marker = null;
                    }
                    break;

                case 1:
                    switch (nextValue) {
                        case 0xF8:
                        case 0xF9:
                        case 0xFA:
                        case 0xFB:
                        case 0xFC:
                        case 0xFD:
                        case 0xFE:
                        case 0xFF:
                            _state = 2;
                            _marker = nextValue;
                            break;
                        default:
                            _state = 0;
                            _marker = null;
                            break;
                    }
                    break;
            }
        }
        else {
            switch (nextValue) {
                case 0x1F8:
                case 0x1F9:
                case 0x1FA:
                case 0x1FB:
                case 0x1FC:
                case 0x1FE:
                    _marker = nextValue & 0xFF;
                    break;
                default:
                    _marker = null;
                    break;
            }
        }
    }

    this.get_marker = function () {
        return _marker;
    }
}
