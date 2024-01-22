function ZX_Floppy() {
    var SEC_LENGTH_0x0080 = 0;
    var SEC_LENGTH_0x0100 = 1;
    var SEC_LENGTH_0x0200 = 2;
    var SEC_LENGTH_0x0400 = 3;

	var _isReady = false;
	var _cylinders = [];
	var _headCount = 0;
	var _isWriteProtected = true;
	var _isDoubleDensity = false;
    var _cyl = 0;
    var _head = 0;
    var _motor = 0;
    var _stateChangedEvent = new ZX_Event();

    this._debug_getRaw = function() {
        return _cylinders;
    }

    function onStateChanged() {
        _stateChangedEvent.emit({
            cyl: _cyl,
            head: _head,
            motor: !!_motor
        });
    }

    function createTrDosSector(cyl, sec, sectorSize, data, dataOffset) {
        if (typeof dataOffset === 'undefined') {
            dataOffset = 0;
        }

        var raw = [];
        raw.push(
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 
            0x4E, 0x4E); // GAP I
        raw.push(
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
            0x00, 0x00, 0x00, 0x00); // SYNC
        raw.push(
            0x1A1, 0x1A1, 0x1A1, // MFM Marker
            0xFE, // Address Marker
            cyl, // Track number
            0, // Side/Head. For TR-DOS is always 0, no matter what the actual value is.
            sec + 1, // Sector number is 1-based.
            SEC_LENGTH_0x0100);
        var crc = new CRC16();
        crc.addArray(raw, raw.length - 8); // Starting with MFM Marker
        raw.push(crc.value >> 8, crc.value & 0xFF);
        raw.push(
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E); // GAP II
        raw.push(
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
            0x00, 0x00, 0x00, 0x00); // SYNC
        raw.push(
            0x1A1, 0x1A1, 0x1A1, // MFM Marker
            0xFB // Data Marker
        );
        if (data.length - dataOffset < sectorSize)
            throw new Error(ZX_Lang.ERR_WRONG_DATA_BLOCK_SIZE + ' ' + sectorSize + ' <> ' + (data.length - dataOffset) + '.');
        raw.push.apply(raw, data.slice(dataOffset, dataOffset + sectorSize));
        crc = new CRC16();
        crc.addArray(raw, raw.length - sectorSize - 4); // Starting with MFM Marker
        raw.push(crc.value >> 8, crc.value & 0xFF);
        raw.push(
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
            0x4E, 0x4E, 0x4E, 0x4E); // GAP III
        return raw;
    }

	this.get_isReady = function() { return _isReady; }
	this.get_isWriteProtected = function() { return _isWriteProtected; }
    this.get_isDoubleDensity = function () { return _isDoubleDensity; }
	this.get_cylCount = function () { return _cylinders.length; }
	this.get_headCount = function () { return _headCount; }
    this.get_cylinder = function () { return _cyl; }
    this.set_head = function (value) { _head = value; onStateChanged(); }
    this.get_head = function () { return _head }
    this.set_motor = function (value) { _motor = +!!value; onStateChanged(); }
    this.get_motor = function () { return !!_motor; }
    this.get_onStateChanged = function () {
        return _stateChangedEvent.pub;
    }

    this.stepIn = function () {
        if (_cyl < _cylinders.length - 1) {
            _cyl++;
            onStateChanged();
        }
    }
    this.stepOut = function () {
        if (_cyl > 0) {
            _cyl--;
            onStateChanged();
        }
    }
    this.openStream = function() {
        var data;
        if (_cyl >= 0 && _cyl < _cylinders.length && _head >= 0 && _head < _headCount) {
            data = _cylinders[_cyl][_head];
        }
        else {
            data = [];
        }
        return new MemoryStream(data);
    }

    this.insertTRD = function (bin) {
        // UNDONE: имя диска из служебного сектора можно использовать как комментарий
        if ( !bin || !bin.length )
            throw new Error(ZX_Lang.ERR_TRD_IMAGE_WRONG_DATA);

        var cylCount = 0;
        var headCount = 0;
        // определяем конфигурацию диска из служебной информации
        switch ( bin[0x08e3] ) {
            case 0x16: cylCount = 80; headCount = 2; break;
            case 0x17: cylCount = 40; headCount = 2; break;
            case 0x18: cylCount = 80; headCount = 1; break;
            case 0x19: cylCount = 40; headCount = 1; break;
            // если служебная информация некорректная, то пытаемся определить
            // конфигурацию исходя из размера файла
            default:
                switch ( bin.length ) {
                    case 655360: cylCount = 80; headCount = 2; break;
                    case 327680: cylCount = 80; headCount = 1; break;
                    case 163840: cylCount = 40; headCount = 1; break;

                    // если и размер нестандартный, то бросаем исключение
                    default: throw new Error(ZX_Lang.ERR_TRD_IMAGE_UNKNOWN_TYPE);
                }
                break;
        }

        var cylinders = new Array(cylCount);
        var index = 0;
        for ( var cylIndex = 0; cylIndex < cylCount; cylIndex++ )
        for ( var headIndex = 0; headIndex < headCount; headIndex++ ) {
            var cyl = (cylinders[cylIndex] || (cylinders[cylIndex] = []));
            var track = (cyl[headIndex] || (cyl[headIndex] = []));
            var trackStream = new MemoryStream(track);
            var sectorSize = (0x0080 << SEC_LENGTH_0x0100);
            for ( var sec = 0; sec < 16; sec++) {
                if (index < bin.length) {
                    trackStream.writeMultiple(
                        createTrDosSector(cylIndex, sec, sectorSize, bin, index));
                }
                else {
                    var emptyArr = new Array(sectorSize);
                    emptyArr.fill(0);
                    trackStream.writeMultiple(
                        createTrDosSector(cylIndex, sec, sectorSize, emptyArr, 0));
                }
                index += sectorSize;
            }
        }

        _cylinders = cylinders;
        _headCount = headCount;
        _isDoubleDensity = true;
        _isWriteProtected = false;
        _isReady = true;
        onStateChanged();
    }

    this.insertSCL = function (bin) {
        var sclCatStream = new MemoryStream(bin);
        if (String.fromCharCode.apply(String, sclCatStream.readMultuple(8)) != 'SINCLAIR')
            throw new Error(ZX_Lang.ERR_SCL_IMAGE_WRONG_DATA);
            
        var fileCount = sclCatStream.read();
        if (fileCount < 0)
            throw new Error(ZX_Lang.ERR_SCL_IMAGE_WRONG_DATA);

        var sclStream = new MemoryStream(bin);
        sclStream.seek(9 + fileCount * 14, SeekOrigin.begin);

        var trdData = new Array(160 << 12); // 160 tracks; 16 sectors per track; 256 bytes per sector.
        for (var i = 0; i < trdData.length; i++) {
            trdData[i] = 0;
        }
        var trdCatStream = new MemoryStream(trdData);
        var trdStream = new MemoryStream(trdData);
        trdStream.seek(16 * 256, SeekOrigin.begin);

        for (var fileIndex = 0; fileIndex < fileCount; fileIndex++) {
            if (sclCatStream.get_position() >= (8 << 8))
                throw new Error(ZX_Lang.ERR_SCL_IMAGE_TOO_MANY_FILES);
            var fileHeader = sclCatStream.readMultuple(14);
            if (fileHeader.length != 14)
                throw new Error(ZX_Lang.ERR_SCL_IMAGE_WRONG_DATA);
            var fileSecCount = fileHeader[13];
            var trkIndex = trdStream.get_position() >> 12;
            var secIndex = (trdStream.get_position() - (trkIndex << 12)) >> 8;
            trdCatStream.writeMultiple(fileHeader);
            trdCatStream.write(secIndex);
            trdCatStream.write(trkIndex);
            trdStream.writeMultiple(sclStream.readMultuple(fileSecCount << 8));
        }
        var freeTrkIndex = trdStream.get_position() >> 12;
        var freeSecIndex = (trdStream.get_position() - (trkIndex << 12)) >> 8;
        var freeSecCount = (trdStream.get_length() - trdStream.get_position()) >> 8;
        trdCatStream.seek(8 << 8, SeekOrigin.begin);
        trdCatStream.write(0x00); // признак конца каталога
        trdCatStream.seek((8 << 8) + 0xE1, SeekOrigin.begin);
        trdCatStream.writeMultiple([
            freeSecIndex,
            freeTrkIndex,
            0x16, // дискета с 80-ю цилиндрами и двумя сторонами
            fileCount,
            freeSecCount & 0xFF,
            freeSecCount >> 8,
            0x10 // код TR-DOS'а
        ]);
        trdCatStream.seek((8 << 8) + 0xF4, SeekOrigin.begin);
        trdCatStream.writeMultiple([
            0x00, // количество удаленных файлов
            0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20 // имя диска
        ]);
        
        var crc = 0;
        var i = bin.length - 4;
        while (--i >= 0) {
            crc = (crc + bin[i]) & 0xFFFFFFFF;
        }
        var storedCrc = 
            (bin[bin.length - 1] << 24)
            | (bin[bin.length - 2] << 16)
            | (bin[bin.length - 3] << 8)
            | (bin[bin.length - 4]);
        if (crc != storedCrc) {
            handleError(ZX_Lang.ERR_SCL_IMAGE_WRONG_CRC);
        }

        this.insertTRD(trdStream.get_buffer());
    }

    this.insertFDI = function (bin) {
        if ( !bin || bin.length < 14 || bin[0] != 0x46 /*F*/ || bin[1] != 0x44 /*D*/ || bin[2] != 0x49 /*I*/ ) {
            throw new Error(ZX_Lang.ERR_FDI_IMAGE_WRONG_DATA);
        }
    
        var isWriteProtected = ( bin[3] != 0 );
        var cylCount = (( bin[5] << 8 ) | bin[4] );
        var headCount = (( bin[7] << 8 ) | bin[6] );
        var commentOffset = (( bin[9] << 8 ) | bin[8] );
        var dataOffset = (( bin[11] << 8 ) | bin[10] );
        var extraHeaderLength = (( bin[13] << 8 ) | bin[12] );
        var extraHeaderOffset = 14;
        var trackHeaderOffset = ( extraHeaderOffset + extraHeaderLength );
    
        var comment = '';
        while ( commentOffset < bin.length && bin[commentOffset] != 0 ) {
            comment += String.fromCharCode(bin[commentOffset]);
            commentOffset++;
        }
    
        var cylinders = [];
        for ( var cylIndex = 0; cylIndex < cylCount; cylIndex++ ) {
            var cyl = [];
            cylinders.push(cyl);
            for ( var headIndex = 0; headIndex < headCount; headIndex++ ) {
                var track = [];
                cyl.push(track);

                var trackDataOffset = (
                    dataOffset + 
                    (bin[trackHeaderOffset + 3] << 24) +
                    (bin[trackHeaderOffset + 2] << 16) +
                    (bin[trackHeaderOffset + 1] << 8) +
                    (bin[trackHeaderOffset + 0] << 0)
                );
    
                var secCount = bin[trackHeaderOffset + 6];
                for ( var secIndex = 0; secIndex < secCount; secIndex++ ) {
                    var secHeaderOffset = trackHeaderOffset + 7 + ( secIndex * 7 );
    
                    var cylByte = bin[secHeaderOffset + 0];
                    var headByte = bin[secHeaderOffset + 1];
                    var secByte = bin[secHeaderOffset + 2];
                    var sizeByte = bin[secHeaderOffset + 3];
                    var flags = bin[secHeaderOffset + 4];
    
                    var secDataOffset = ( 
                        trackDataOffset + 
                        ( bin[ secHeaderOffset + 6 ] << 8 ) +
                        bin[ secHeaderOffset + 5 ]
                    );
    
                    var secSize = ( 0x0080 << sizeByte );

                    track.push(
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 
                        0x4E, 0x4E); // GAP I                    
                    track.push(
                        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                        0x00, 0x00, 0x00, 0x00); // SYNC
                    track.push(
                        0x1A1, 0x1A1, 0x1A1, // MFM Marker
                        0xFE, // Address Marker
                        cylByte, // Track number
                        headByte, // Side/Head
                        secByte, // Sector number
                        sizeByte);
                    var crc = new CRC16();
                    crc.addArray(track, track.length - 8); // Starting with MFM Marker
                    track.push(crc.value >> 8, crc.value & 0xFF);
                    track.push(
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E); // GAP II
                    track.push(
                        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                        0x00, 0x00, 0x00, 0x00); // SYNC
                    track.push(
                        0x1A1, 0x1A1, 0x1A1 // MFM Marker
                    );
                    track.push(
                        (flags & 0x80) ? 0xF8 : 0xFB // Data Marker
                    );
                    for (var i = 0; i < secSize; i++) {
                        track.push(bin[secDataOffset++]);
                    }
                    var crcCalcSize = 0;
                    if ((flags & 0x01) && secSize >= 128) crcCalcSize = 128;
                    if ((flags & 0x02) && secSize >= 256) crcCalcSize = 256;
                    if ((flags & 0x04) && secSize >= 512) crcCalcSize = 512;
                    if ((flags & 0x08) && secSize >= 1024) crcCalcSize = 1024;
                    if ((flags & 0x10) && secSize >= 2048) crcCalcSize = 2048;
                    if ((flags & 0x20) && secSize >= 4096) crcCalcSize = 4096;
                    var crc = new CRC16();
                    crc.addArray(track, track.length - crcCalcSize - 4); // Starting with MFM Marker
                    track.push(crc.value >> 8, crc.value & 0xFF);
                    track.push(
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E); // GAP III
                }
    
                // передвигаем смещение на следующий заголовок дорожки
                trackHeaderOffset += ( 7 + ( 7 * secCount ));
            }
        }
    
        _cylinders = cylinders
        _headCount = headCount;
        _isDoubleDensity = true;
        _isWriteProtected = isWriteProtected;
        _isReady = true;
        onStateChanged();
    }

    this.insertTD0 = function (bin) {
        var td0Stream = new MemoryStream(bin);
        bin = null;
        var td0CrcStream = new CRCWrapper(td0Stream, CRC16GEN.poly_A097());
        var signature = String.fromCharCode.apply(String, td0CrcStream.readMultuple(2));
        if (signature != 'TD' && signature != 'td')
            throw new Error(ZX_Lang.ERR_TD0_IMAGE_WRONG_DATA);
        var sequence = td0CrcStream.read();
        if (sequence != 0x00)
            throw new Error(ZX_Lang.ERR_TD0_IMAGE_WRONG_DATA);
        var checkSequence = td0CrcStream.read();
        var tekediskVersion = td0CrcStream.read();
        var dataParams = td0CrcStream.read();
        var dataRate = dataParams & 0x03; // 0: 250kbps; 1: 300kbps; 2: 500kbps.
        var doubleDensity = !(dataParams & 0x80);
        var driveType = td0CrcStream.read(); // 1: 360k; 2: 1.2M; 3: 720k; 4: 1.44M.
        // Drive Type experimentations:
        // 0 = 5.25 96 tpi disk in 48 tpi drive
        // 1 = 5.25
        // 2 = 5.25 48-tpi
        // 3 = 3.5
        // 4 = 3.5
        // 5 = 8-inch
        // 6 = 3.5
        var stepping = td0CrcStream.read(); // 0: Single-Step; 1: Double-Step; 2: Even-only step (96 tpi disk in 48 tpi drive)
        var dosAllocation = td0CrcStream.read();
        var headCount = td0CrcStream.read() == 1 ? 1 : 2;
        var crc = td0CrcStream.readNoCrc() | (td0CrcStream.readNoCrc() << 8);
        if (crc != td0CrcStream.get_crc().get_value())
            throw new Error(ZX_Lang.ERR_TD0_IMAGE_WRONG_HEADER_CRC);

        var compressed = signature == 'td';
        var formatStream;
        if (compressed) {
            formatStream = new LZSSDecompressionStream(td0Stream);
        }
        else {
            formatStream = td0Stream;
        }
        var formatCrcStream = new CRCWrapper(formatStream, CRC16GEN.poly_A097());

        var dataOffset = 0;
        // The comment block presence is indicated by the high bit of 'Stepping' field.
        if (stepping & 0x80) {
            var cmtCrc = formatCrcStream.readNoCrc() | (formatCrcStream.readNoCrc() << 8);
            formatCrcStream.get_crc().reset();
            var cmtLength = formatCrcStream.read() | (formatCrcStream.read() << 8);
            var cmtYear = formatCrcStream.read(); // 1900-based
            var cmtMonth = formatCrcStream.read(); // 0-based
            var cmtDay = formatCrcStream.read(); // 1-based
            var cmtHour = formatCrcStream.read();
            var cmtMinute = formatCrcStream.read();
            var cmtSecond = formatCrcStream.read();
            var cmtLines = [];
            var commentLine = ''
            for (var i = 0; i < cmtLength; i++) {
                var charCode = formatCrcStream.read();
                if (charCode) {
                    commentLine += String.fromCharCode(charCode);
                }
                if (!charCode || i == cmtLength - 1) {
                    cmtLines.push(commentLine);
                    commentLine = '';
                }
            }
            if (cmtCrc != formatCrcStream.get_crc().get_value())
                throw new Error(ZX_Lang.ERR_TD0_IMAGE_WRONG_COMMENT_HEADER_CRC);
        }

        // init floppy cylinders
        var cylinders = [];

        // Data block
        while (true) { 
            formatCrcStream.get_crc().reset();
            var secCount = formatCrcStream.read();
            if (secCount == 0xFF) // FF means the end of the track list.
                break;
            var cylIndex = formatCrcStream.read();
            var headAndDensity = formatCrcStream.read();
            var headIndex = headAndDensity & 0x01;
            var trackDoubleDensity = !(headAndDensity & 0x80);
            var trackHeadrCrcLowByte = formatCrcStream.readNoCrc();
            if (trackHeadrCrcLowByte != (formatCrcStream.get_crc().get_value() & 0xFF))
                throw new Error(ZX_Lang.ERR_TD0_IMAGE_WRONG_TRACK_HEADER_CRC);

            // init floppy track
            var cyl = (cylinders[cylIndex] || (cylinders[cylIndex] = []));
            var track = (cyl[headIndex] || (cyl[headIndex] = []));
            var trackStream = new MemoryStream(track);
            var trackCrcStream = new CRCWrapper(trackStream, CRC16GEN.poly_1021());

            for (var secIndex = 0; secIndex < secCount; secIndex++) {
                var idCyl = formatStream.read();
                var idHead = formatStream.read();
                var idSecNum = formatStream.read();
                var idSecSizeByte = formatStream.read();
                var idFlags = formatStream.read();
                var sectorDataCrcLowByte = formatStream.read();

                //var sectorBogusSector = idSecNum >= 100;
                var sectorLength = (0x0080 << idSecSizeByte);
                var sectorDuplicated = !!(idFlags & 0x01);
                var sectorCrcError = !!(idFlags & 0x02);
                var sectorDeletedRecordType = !!(idFlags & 0x04);
                var sectorDataIsSkipped = !!(idFlags & 0x10); // (no data block)
                var sectorNoData = !!(idFlags & 0x20); // (no data block)
                var sectorNoHeader = !!(idFlags & 0x40); // (bogus header)


                var sectorData = [];
                if (!sectorDataIsSkipped && !sectorNoData) {
                    var sectorDataBlockSize = formatStream.read() | (formatStream.read()<< 8); // size of the data + encoding method byte
                    var sectorDataBlockEncodingMethod = formatStream.read(); // 0: raw data; 1: repeatedly two 16-bit values: count and pattern; 2: RLE.

                    switch (sectorDataBlockEncodingMethod) {
                        case 0: 
                            sectorData = formatStream.readMultuple(sectorLength);
                            break;
                        case 1:
                            while (sectorData.length < sectorLength) {
                                var count = formatStream.read() | (formatStream.read() << 8);
                                var value1 = formatStream.read(), value2 = formatStream.read();
                                while (count--) {
                                    sectorData.push(value1, value2);
                                }
                            }
                            break;
                        case 2: 
                            while (sectorData.length < sectorLength) {
                                var startValue = formatStream.read();
                                if (!startValue) {
                                    var len = formatStream.read();
                                    sectorData.push.apply(sectorData, formatStream.readMultuple(len));
                                }
                                else {
                                    var len = 2 * startValue;
                                    var repeats = formatStream.read();
                                    var sequence = formatStream.readMultuple(len);
                                    while (repeats--) {
                                        sectorData.push.apply(sectorData, sequence);
                                    }
                                }
                            }
                            break;
                    }
                    var calcCrc = CRC16GEN.poly_A097();
                    calcCrc.addArray(sectorData);
                    if (sectorDataCrcLowByte != (calcCrc.get_value() & 0xFF))
                        throw new Error(ZX_Lang.ERR_TD0_IMAGE_WRONG_SECTOR_DATA_CRC);
                }

                // GAP I
                if (trackDoubleDensity) {
                    trackStream.writeMultiple([
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 
                        0x4E, 0x4E]);
                }
                else {
                    trackStream.writeMultiple([
                        0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
                }
                // SYNC + IDAM
                if (!sectorNoHeader) {
                    if (trackDoubleDensity) {
                        trackStream.writeMultiple([
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                            0x00, 0x00, 0x00, 0x00]);
                    }
                    else {
                        trackStream.writeMultiple([
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
                    }
                    trackCrcStream.get_crc().reset();
                    if (trackDoubleDensity) {
                        trackCrcStream.writeMultiple([
                            0x1A1, 0x1A1, 0x1A1, 0xFE]);
                    }
                    else {
                        trackCrcStream.write(0x1FE);
                    }
                    trackCrcStream.writeMultiple([
                        idCyl, idHead, idSecNum, idSecSizeByte]);
                    var idCrc = trackCrcStream.get_crc().get_value();
                    trackStream.writeMultiple([
                        idCrc >> 8, idCrc & 0xFF]);
                }
                // GAP II + SYNC + DAM + DATA
                if (!sectorDataIsSkipped && !sectorNoData) {
                    if (trackDoubleDensity) {
                        trackStream.writeMultiple([
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                            0x00, 0x00]);
                    }
                    else {
                        trackStream.writeMultiple([
                            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
                            0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 
                            0x00]);
                    }
                    trackCrcStream.get_crc().reset();
                    if (trackDoubleDensity) {
                        trackCrcStream.writeMultiple([
                            0x1A1, 0x1A1, 0x1A1, (sectorDeletedRecordType ? 0xF8 : 0xFB)]);
                    }
                    else{
                        trackCrcStream.write(sectorDeletedRecordType ? 0x1F8 : 0x1FB);
                    }

                    trackCrcStream.writeMultiple(sectorData);
                    var dataCrc = trackCrcStream.get_crc().get_value();
                    if (!sectorCrcError) {
                        trackStream.writeMultiple([
                            dataCrc >> 8, dataCrc & 0xFF]);
                    }
                    else {
                        trackStream.writeMultiple([
                            dataCrc & 0xFF, dataCrc >> 8]);
                    }
                }
                // GAP III
                if (trackDoubleDensity) {
                    trackStream.writeMultiple([
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                        0x4E, 0x4E, 0x4E, 0x4E]);
                }
                else {
                    trackStream.writeMultiple([
                        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
                }
            }
        }

        _cylinders = cylinders;
        _headCount = headCount;
        _isDoubleDensity = doubleDensity;
        _isWriteProtected = false;
        _isReady = true;
        onStateChanged();
    }

    this.insertUDI = function (bin) {
        var udiRawStream = new MemoryStream(bin);
        var udiStream = new CRCWrapper(udiRawStream, CRC32GEN.poly_edb88320());
        bin = null;
        var signature = String.fromCharCode.apply(String, udiStream.readMultuple(4));
        if (signature != 'UDI!')
            throw new Error(ZX_Lang.ERR_UDI_IMAGE_WRONG_IMAGE_DATA);
        var fileSize = udiStream.read() | (udiStream.read() << 8) | (udiStream.read() << 16) | (udiStream.read() << 24);
        var version = udiStream.read();
        if (version != 0) 
            throw new Error(ZX_Lang.ERR_UDI_IMAGE_VERSION_NOT_SUPPORTED);
        var cylCount = udiStream.read() + 1;
        var headCount = udiStream.read() + 1;
        var zero = udiStream.read();
        var extHdrSize = udiStream.read() | (udiStream.read() << 8) | (udiStream.read() << 16) | (udiStream.read() << 24);
        var extHdr = udiStream.readMultuple(extHdrSize);
        // init cylinders
        var cylinders = [];
        for (var cylIndex = 0; cylIndex < cylCount; cylIndex++) {
            var cyl = (cylinders[cylIndex] || (cylinders[cylIndex] = []));
            for (var headIndex = 0; headIndex < headCount; headIndex++) {
                var track = (cyl[headIndex] || (cyl[headIndex] = []));
                var type = udiStream.read(); // 0 = MFM
                var size = udiStream.read() | (udiStream.read() << 8);
                var data = udiStream.readMultuple(size);
                var cmsize = (size >> 3) + (((size & 7) + 7) >> 3);
                for (var i = 0; i < cmsize; i++) {
                    var bits = udiStream.read();
                    if (!bits)
                        continue;
                    for (var j = 0; j < 8; j++, bits >>= 1) {
                        if (bits & 1) {
                            data[(i << 3) + j] |= 0x0100;
                        }
                    }
                }
                for (var i = 0; i < data.length; i++) {
                    track.push(data[i]);
                }
            }
        }
        var crc32 = udiRawStream.read() | (udiRawStream.read() << 8) | (udiRawStream.read() << 16) | (udiRawStream.read() << 24)
        if (crc32 != udiStream.get_crc().get_value()) {
            handleError(ZX_Lang.ERR_UDI_IMAGE_WRONG_CRC);
        }

        _cylinders = cylinders;
        _headCount = headCount;
        _isDoubleDensity = type == 0x00;
        _isWriteProtected = false;
        _isReady = true;
        onStateChanged();
    }

    this.insertDSK = function (bin) {
        // TODO: support weak data
        // TODO: support partly readable sectors
        var dskStream = new MemoryStream(bin);
        bin = null;
        var signature = String.fromCharCode.apply(String, dskStream.readMultuple(23));
        var extendedFormat = false;
        switch (signature) {
            case 'MV - CPCEMU Disk-File\r\n': extendedFormat = false; break;
            case 'EXTENDED CPC DSK File\r\n': extendedFormat = true; break;
            default: throw new Error(ZX_Lang.ERR_DSK_IMAGE_WRONG_DATA);
        }
        var signature2 = String.fromCharCode.apply(String, dskStream.readMultuple(11));
        if (signature2 != 'Disk-Info\r\n')
            throw new Error(ZX_Lang.ERR_DSK_IMAGE_WRONG_DATA);
        var creatorName = String.fromCharCode.apply(String, dskStream.readMultuple(14));
        var cylCount = dskStream.read();
        var headCount = dskStream.read();

        var cylinders = [];
        var wholeDiskIsInFM = true;
        if (extendedFormat) {
            dskStream.seek(2, SeekOrigin.current);
            var trackCount = cylCount * headCount;
            var trackAllocationTable = new Array(trackCount);
            for (var trackIndex = 0, offset = 0x0100; trackIndex < trackCount; trackIndex++) {
                var size = dskStream.read() << 8;
                trackAllocationTable[trackIndex] = [offset, size];
                offset += size;
            }
            for (var cylIndex = 0; cylIndex < cylCount; cylIndex++) {
                var cyl = cylinders[cylIndex] || (cylinders[cylIndex] = []);
                for (var headIndex = 0; headIndex < headCount; headIndex++) {
                    var track = cyl[headIndex] || (cyl[headIndex] = []);
                    var trackIndex = cylIndex * headCount + headIndex;
                    var trackDataSize = trackAllocationTable[trackIndex][1];
                    if (!trackDataSize)
                        continue;
                    var trackRawStream = new MemoryStream(track);
                    var trackStream = new CRCWrapper(trackRawStream, CRC16GEN.poly_1021());
                    var trackOffset = trackAllocationTable[trackIndex][0];
                    dskStream.seek(trackOffset, SeekOrigin.begin);
                    var trackSignature = String.fromCharCode.apply(String, dskStream.readMultuple(12));
                    if (trackSignature != 'Track-Info\r\n')
                        throw new Error(ZX_Lang.ERR_DSK_IMAGE_WRONG_DATA);
                    dskStream.seek(4, SeekOrigin.current);
                    var trCylNum = dskStream.read();
                    var trHeadNum = dskStream.read();
                    var dataRate = dskStream.read();
                    var recordingMode = dskStream.read();
                    var recordingModeIsFM = recordingMode == 1;
                    if (!recordingModeIsFM) {
                        wholeDiskIsInFM = false;
                    }
                    var spacePerSectorAllocated = (0x0080 << dskStream.read());
                    var secCount = dskStream.read();
                    var gapIIISize = dskStream.read();
                    var fillerByte = dskStream.read();
                    var sectorInfoOffset = dskStream.get_position();
                    var sectorDataOffset = trackOffset + 0x0100;
                    for (var secIndex = 0; secIndex < secCount; secIndex++) {
                        dskStream.seek(sectorInfoOffset, SeekOrigin.begin);
                        var secCylNum = dskStream.read();
                        var secHeadNum = dskStream.read();
                        var secSecNum = dskStream.read();
                        var secSizeByte = dskStream.read();
                        var secSize = (0x0080 << secSizeByte);
                        var fdcStatus1 = dskStream.read();
                        var fdcStatus2 = dskStream.read();
                        // secDataSize < secSize: controller reads only secDataSize bytes, and raises the error from fdsStatus1, fdsStatus2
                        // secDataSize == secSize: normal sector
                        // secDataSize == secSize * n: n variants of weak/random sector data
                        var secDataSize = dskStream.read() | (dskStream.read() << 8);
                        if (recordingModeIsFM) {
                            trackStream.writeMultiple([
                                0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // GAP I
                                0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // SYNC
                            trackStream.get_crc().preset(0xFFFF);
                            trackStream.write(0x1FE); // IDAM
                        }
                        else {
                            trackStream.writeMultiple([
                                0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 
                                0x4E, 0x4E, // GAP I
                                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                                0x00, 0x00, 0x00, 0x00, // SYNC
                                0x1A1, 0x1A1, 0x1A1]); // MFM MARKER
                            trackStream.get_crc().preset(0xCDB4);
                            trackStream.write(0xFE); // IDAM
                        }
                        trackStream.writeMultiple([secCylNum, secHeadNum, secSecNum, secSizeByte]); // ID
                        trackStream.writeMultiple([trackStream.get_crc().get_value() >> 8, trackStream.get_crc().get_value() & 0xFF]); // ID CRC
                        if (recordingModeIsFM) {
                            trackStream.writeMultiple([
                                0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
                                0xFF, 0xFF, 0xFF, // GAP II
                                0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // SYNC
                            trackStream.get_crc().preset(0xFFFF);
                            trackStream.write(0x1FB); // DAM
                        }
                        else {
                            trackStream.writeMultiple([
                                0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                                0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                                0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, // GAP II
                                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                                0x00, 0x00, 0x00, 0x00, // SYNC
                                0x1A1, 0x1A1, 0x1A1]); // MFM MARKER
                            trackStream.get_crc().preset(0xCDB4);
                            trackStream.write(0xFB); // DAM
                        }
                        sectorInfoOffset = dskStream.get_position();
                        dskStream.seek(sectorDataOffset, SeekOrigin.begin);
                        trackStream.writeMultiple(dskStream.readMultuple(secSize)); // DATA
                        trackStream.writeMultiple([trackStream.get_crc().get_value() >> 8, trackStream.get_crc().get_value() & 0xFF]); // DATA CRC
                        for (var i = 0; i < gapIIISize; i++) {
                            trackStream.write(recordingModeIsFM ? 0xFF : 0x4E); // GAP III
                        }
                        sectorDataOffset += secDataSize;                  
                    }
                }
            }
        }
        else {
            var spacePerTrackAllocated = dskStream.read() | (dskStream.read << 8);
            for (var cylIndex = 0; cylIndex < cylCount; cylIndex++) {
                var cyl = cylinders[cylIndex] || (cylinders[cylIndex] = []);
                for (var headIndex = 0; headIndex < headCount; headIndex++) {
                    var track = cyl[headIndex] || (cyl[headIndex] = []);
                    var trackRawStream = new MemoryStream(track);
                    var trackStream = new CRCWrapper(trackRawStream, CRC16GEN.poly_1021());
                    var trackIndex = cylIndex * headCount + headIndex;
                    var trackOffset = 0x0100 + trackIndex * spacePerTrackAllocated;
                    dskStream.seek(trackOffset, SeekOrigin.begin);
                    var trackSignature = String.fromCharCode.apply(String, dskStream.readMultuple(12));
                    if (trackSignature != 'Track-Info\r\n')
                        throw new Error(ZX_Lang.ERR_DSK_IMAGE_WRONG_DATA);
                    dskStream.seek(4, SeekOrigin.current);
                    var trCylNum = dskStream.read();
                    var trHeadNum = dskStream.read();
                    dskStream.seek(2, SeekOrigin.current);
                    var spacePerSectorAllocated = (0x0080 << dskStream.read());
                    var secCount = dskStream.read();
                    var gapIIISize = dskStream.read();
                    var fillerByte = dskStream.read();
                    for (var secIndex = 0; secIndex < secCount; secIndex++) {
                        var sectorOffset = trackOffset + 0x0100 + secIndex * spacePerSectorAllocated;
                        var secCylNum = dskStream.read();
                        var secHeadNum = dskStream.read();
                        var secSecNum = dskStream.read();
                        var secSizeByte = dskStream.read();
                        var secSize = (0x0080 << secSizeByte);
                        var fdcStatus1 = dskStream.read();
                        var fdcStatus2 = dskStream.read();
                        dskStream.seek(2, SeekOrigin.current);
                        trackStream.writeMultiple([
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 
                            0x4E, 0x4E, // GAP I
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                            0x00, 0x00, 0x00, 0x00, // SYNC
                            0x1A1, 0x1A1, 0x1A1]); // MFM MARKER
                        trackStream.get_crc().preset(0xCDB4);
                        trackStream.writeMultiple([0xFE, secCylNum, secHeadNum, secSecNum, secSizeByte]); // IDAM + ID
                        trackStream.writeMultiple([trackStream.get_crc().get_value() >> 8, trackStream.get_crc().get_value() & 0xFF]); // ID CRC
                        trackStream.writeMultiple([
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E,
                            0x4E, 0x4E, 0x4E, 0x4E, 0x4E, 0x4E, // GAP II
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                            0x00, 0x00, 0x00, 0x00, // SYNC
                            0x1A1, 0x1A1, 0x1A1]); // MFM MARKER
                        trackStream.get_crc().preset(0xCDB4);
                        trackStream.write(0xFB); // DAM
                        var currentOffset = dskStream.get_position();
                        dskStream.seek(sectorOffset, SeekOrigin.begin);
                        trackStream.writeMultiple(dskStream.readMultuple(secSize)); // DATA
                        dskStream.seek(currentOffset, SeekOrigin.begin);
                        trackStream.writeMultiple([trackStream.get_crc().get_value() >> 8, trackStream.get_crc().get_value() & 0xFF]); // DATA CRC
                        for (var i = 0; i < gapIIISize; i++) {
                            trackStream.write(0x4E); // GAP III
                        }
                    }
                }
            }
        }

        _cylinders = cylinders;
        _headCount = headCount;
        _isDoubleDensity = !wholeDiskIsInFM;
        _isWriteProtected = false;
        _isReady = true;
        onStateChanged();
    }

    this.create = function (cylCount, headCount, trdosFormat) {
        var cylinders = [];
        for (var cylIndex = 0; cylIndex < cylCount; cylIndex++)
        for (var headIndex = 0; headIndex < headCount; headIndex++) {            
            var cyl = cylinders[cylIndex] || (cylinders[cylIndex] = []);
            var track = cyl[headIndex] || (cyl[headIndex] = []);
            if (trdosFormat) {
                var trackStream = new MemoryStream(track);
                for (var secIndex = 0; secIndex < 16; secIndex++) {
                    if (cylIndex == 0 && headIndex == 0 && secIndex == 8) {
                        var diskType = (cylCount < 80) ? (headCount == 2 ? 0x17 : 0x19) : (headCount == 2 ? 0x16 : 0x18);
                        var freeSecCount = (cylCount * headCount - 1) * 16;
                        trackStream.writeMultiple(createTrDosSector(cylIndex, secIndex, 0x0100, [
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0x00, 0x01, diskType, 0x00, freeSecCount & 0xFF, freeSecCount >> 8, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20
                        ]));
                    }
                    else {
                        trackStream.writeMultiple(createTrDosSector(cylIndex, secIndex, 0x0100, [
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                        ]));
                    }
                }
            }
        
        }

        _cylinders = cylinders;
        _headCount = headCount;
        _isDoubleDensity = true;
        _isWriteProtected = false;
        _isReady = true;
        onStateChanged();
    }

    this.eject = function () {
        _isReady = false;
        _cylinders = [];
        _headCount = 0;
        _isDoubleDensity = false;
        _isWriteProtected = false;
    }

    this.getCompatibleFormats = function() {
        var formats = [];
        if (_isReady) {
            formats.push('UDI', 'TD0', 'FDI');
            if (_isDoubleDensity) {
                var sclCompatible = true;
                for (var cylIndex = 0; cylIndex < _cylinders.length; cylIndex++)
                for (var headIndex = 0; headIndex < _headCount; headIndex++) {
                    var track = _cylinders[cylIndex][headIndex];
                    var trackRawStream = new MemoryStream(track);
                    var trackStream = new CRCWrapper(trackRawStream, CRC16GEN.poly_1021());
                    var sectors = new Array(16);
                    var amDetector = new VG93AMDetector(_isDoubleDensity);
                    while (sclCompatible) {
                        var next;
                        do {
                            next = trackStream.read();
                            if (_isDoubleDensity && (next & 0x1FF) == 0x1A1) {
                                trackStream.get_crc().preset(0xCDB4);
                            }
                            else if (!_isDoubleDensity && ((next & 0x1FC) == 0x1F8 || (next & 0x1FF) == 0x1FC || (next ^ 0x1FF) == 0x1FE)) {
                                trackStream.get_crc().preset(0xFFFF);
                                trackStream.get_crc().add(next);
                            }
                            amDetector.analyseNext(next);
                        }
                        while (next >= 0 && !amDetector.get_marker());
                        if (next < 0)
                            break;
                        if (amDetector.get_marker() != 0xFE) {
                            sclCompatible = false;
                            break;
                        }
                        var idCyl = trackStream.read();
                        var idHead = trackStream.read();
                        var idSec = trackStream.read();
                        var idSize = trackStream.read();
                        if (idCyl != cylIndex 
                            || idHead != 0 
                            || idSec < 1 
                            || idSec > 16
                            || sectors[idSec-1]
                            || idSize != 1) {

                            sclCompatible = false;
                            break;
                        }
                        var idCrc = (trackStream.get_stream().read() << 8) | trackStream.get_stream().read();
                        if (idCrc != trackStream.get_crc().get_value()) {
                            sclCompatible = false;
                            break;
                        }
                        do {
                            next = trackStream.read();
                            if (_isDoubleDensity && (next & 0x1FF) == 0x1A1) {
                                trackStream.get_crc().preset(0xCDB4);
                            }
                            else if (!_isDoubleDensity && ((next & 0x1FC) == 0x1F8 || (next & 0x1FF) == 0x1FC || (next ^ 0x1FF) == 0x1FE)) {
                                trackStream.get_crc().preset(0xFFFF);
                                trackStream.get_crc().add(next);
                            }
                            amDetector.analyseNext(next);
                        }
                        while (next >= 0 && !amDetector.get_marker());
                        if (next < 0)
                            break;
                        if ((amDetector.get_marker() & 0xFC) != 0xF8) {
                            sclCompatible = false;
                            break;
                        }
                        trackStream.readMultuple(256);
                        var dataCrc = trackStream.get_stream().read() << 8 | trackStream.get_stream().read();
                        if (dataCrc != trackStream.get_crc().get_value()) {
                            sclCompatible = false;
                            break;
                        }
                        sectors[idSec-1] = true;
                    }
                    for (var i = 0; i < sectors.length; i++) {
                        if (!sectors[i]) {
                            sclCompatible = false;
                            break;
                        }
                    }
                }
                if (sclCompatible) {
                    formats.push('SCL');
                    if (_cylinders.length == 40 || _cylinders.length == 80) {
                        formats.push('TRD');
                    }
                }
            }
        }
        return formats;
    }

    this.saveToTRD = function () {
        var trdStream = new MemoryStream([]);
        for (var cylIndex = 0; cylIndex < _cylinders.length; cylIndex++)
        for (var headIndex = 0; headIndex < _headCount; headIndex++) {
            var sectors = new Array(16);
            var trackStream = new MemoryStream(_cylinders[cylIndex][headIndex]);
            var next;
            while ((next = trackStream.read()) >= 0) {
                while (next >= 0 && (next & 0x1FF) != 0x1A1) {
                    next = trackStream.read();
                }
                while (next >= 0 && next != 0xFE ) {
                    next = trackStream.read();
                }
                trackStream.seek(2, SeekOrigin.current); // skip cylinder and head number
                var sectorIndex = trackStream.read() - 1;
                trackStream.seek(3, SeekOrigin.current); // skip sector size and crc
                while (next >= 0 && (next & 0x1FF) != 0x1A1) {
                    next = trackStream.read();
                }
                while (next >= 0 && (next & 0xFC) != 0xF8) {
                    next = trackStream.read();
                }
                sectors[sectorIndex] = trackStream.readMultuple(256);
                trackStream.seek(2, SeekOrigin.current); // skip crc
            }
            for (var secIndex = 0; secIndex < sectors.length; secIndex++) {
                var data = sectors[secIndex] || [
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
                ];
                trdStream.writeMultiple(data);
            }
        }
        return trdStream.get_buffer();
    }

    this.saveToSCL = function () {
        var trdStream = new MemoryStream(this.saveToTRD());
        var files = [];
        while (trdStream.get_position() < 0x800) {
            var fileRec = trdStream.readMultuple(16);
            if (fileRec.length != 16 || !fileRec[0])
                break;
            if (fileRec[0] != 0x01) {
                var currentPosition = trdStream.get_position();
                var file = {
                    header: fileRec.slice(0, 14),
                    data: []
                };
                var fileStream = new MemoryStream(file.data);
                var secCount = fileRec[13];
                var secIndex = fileRec[14];
                var trkIndex = fileRec[15];
                trdStream.seek(0x1000 * trkIndex + 0x0100 * secIndex)
                fileStream.writeMultiple(trdStream.readMultuple(0x0100 * secCount));
                files.push(file);
                trdStream.seek(currentPosition, SeekOrigin.begin);
            }
        }

        var sclStream = new MemoryStream([]);
        sclStream.writeMultiple([0x53, 0x49, 0x4E, 0x43, 0x4C, 0x41, 0x49, 0x52]); // SINCLAIR
        sclStream.write(files.length);
        for (var i = 0; i < files.length; i++) {
            sclStream.writeMultiple(files[i].header);
        }
        for (var i = 0; i < files.length; i++) {
            sclStream.writeMultiple(files[i].data);
        }
        var crcLo = 0x0000;
        var crcHi = 0x0000;
        sclStream.seek(0, SeekOrigin.begin);
        var next;
        while ((next = sclStream.read()) >= 0) {
            crcLo += next;
            if (crcLo & 0x10000) {
                crcLo &= 0xFFFF;
                crcHi = (crcHi + 1) & 0xFFFF;
            }
        }
        sclStream.writeMultiple([
            crcLo & 0xFF, crcLo >> 8,
            crcHi & 0xFF, crcHi >> 8
        ]);
        return sclStream.get_buffer();
    }

    this.saveToFDI = function () {
        // EXTRACT DATA
        var tracks = [];
        for (var cylIndex = 0; cylIndex < _cylinders.length; cylIndex++)
        for (var headIndex = 0; headIndex < _headCount; headIndex++) {
            var sectors = [];
            var trackRawStream = new MemoryStream(_cylinders[cylIndex][headIndex]);
            var trackStream = new CRCWrapper(trackRawStream, CRC16GEN.poly_1021());
            var amDetector = new VG93AMDetector(_isDoubleDensity);
            var next;
            while (true) {
                var next;
                do {
                    next = trackStream.read();
                    if (_isDoubleDensity && (next & 0x1FF) == 0x1A1) {
                        trackStream.get_crc().preset(0xCDB4);
                    }
                    else if (!_isDoubleDensity && ((next & 0x1FC) == 0x1F8 || (next & 0x1FF) == 0x1FC || (next ^ 0x1FF) == 0x1FE)) {
                        trackStream.get_crc().preset(0xFFFF);
                        trackStream.get_crc().add(next);
                    }
                    amDetector.analyseNext(next);
                }
                while (next >= 0 && amDetector.get_marker() != 0xFE);
                if (next < 0)
                    break;
                // read ID
                var idCyl = trackStream.read();
                var idHead = trackStream.read();
                var idSec = trackStream.read();
                var idSize = trackStream.read();
                do {
                    next = trackStream.read();
                    if (_isDoubleDensity && (next & 0x1FF) == 0x1A1) {
                        trackStream.get_crc().preset(0xCDB4);
                    }
                    else if (!_isDoubleDensity && ((next & 0x1FC) == 0x1F8 || (next & 0x1FF) == 0x1FC || (next ^ 0x1FF) == 0x1FE)) {
                        trackStream.get_crc().preset(0xFFFF);
                        trackStream.get_crc().add(next);
                    }
                    amDetector.analyseNext(next);
                }
                while (next >= 0 && !amDetector.get_marker());
                if (next < 0)
                    break;
                if ((amDetector.get_marker() & 0xFC) != 0xF8) {
                    trackStream.seek(
                        _isDoubleDensity ? -2 : -1,
                        SeekOrigin.current
                    );
                    continue;
                }
                var flags = (next & 0xFE) == 0xF8 ? 0x80 : 0x00;
                var data = trackStream.readMultuple(0x0080 << idSize);
                if (data.length != (0x0080 << idSize))
                    break;
                var dataCrc = trackStream.get_crc().get_value();
                var realDataCrc = (trackStream.get_stream().read() << 8) | trackStream.get_stream().read();
                if (dataCrc == realDataCrc) {
                    flags |= (0x01 << idSize);
                }
                sectors.push({
                    id: [idCyl, idHead, idSec, idSize, flags],
                    data: data
                });
            }
            tracks.push(sectors);
        }
        // WRITE TO IMAGE
        var fdiStream = new MemoryStream([]);
        fdiStream.writeMultiple([0x46, 0x44, 0x49]); // FDI
        fdiStream.writeMultiple([
            _isWriteProtected ? 1 : 0,
            _cylinders.length & 0xFF,
            _cylinders.length >> 8,
            _headCount & 0xFF,
            _headCount >> 8
        ]);
        fdiStream.writeMultiple([
            0x00, 0x00, // Смещение тексте (LH)
            0x00, 0x00, // Смещение данных (LH)
            0x00, 0x00  // Длина расширенного заголовка (LH)
        ]);
        var trackOffset = 0x00000000;
        for (var trkIndex = 0; trkIndex < tracks.length; trkIndex++) {
            var track = tracks[trkIndex];
            fdiStream.writeMultiple([
                (trackOffset >> 0) & 0xFF,
                (trackOffset >> 8) & 0xFF,
                (trackOffset >> 16) & 0xFF,
                (trackOffset >> 24) & 0xFF,
                0,
                0
            ]);
            fdiStream.write(track.length);
            var sectorOffset = 0x0000;
            for (var secIndex = 0; secIndex < track.length; secIndex++) {
                fdiStream.writeMultiple(track[secIndex].id);
                fdiStream.writeMultiple([
                    (sectorOffset >> 0) & 0xFF,
                    (sectorOffset >> 8) & 0xFF
                ]);
                sectorOffset += (0x0080 << track[secIndex].id[3]);
            }
            trackOffset += sectorOffset;
        }
        // сохраняем смещение текста
        var currentPosition = fdiStream.get_position();
        fdiStream.seek(0x08, SeekOrigin.begin);
        fdiStream.writeMultiple([
            (currentPosition >> 0) & 0xFF,
            (currentPosition >> 8) & 0xFF
        ]);
        fdiStream.seek(currentPosition, SeekOrigin.begin);
        var desc = '\0';
        var descData = stringToBytes(desc);
        fdiStream.writeMultiple(descData);
        // сохраняем смещение данных
        currentPosition = fdiStream.get_position();
        fdiStream.seek(0x0A, SeekOrigin.begin);
        fdiStream.writeMultiple([
            (currentPosition >> 0) & 0xFF,
            (currentPosition >> 8) & 0xFF
        ]);
        fdiStream.seek(currentPosition, SeekOrigin.begin);
        // записываем данные секторов
        for (var trkIndex = 0; trkIndex < tracks.length; trkIndex++) {
            var track = tracks[trkIndex];
            for (var secIndex = 0; secIndex < track.length; secIndex++) {
                var sector = track[secIndex];
                fdiStream.writeMultiple(sector.data);
            }
        }
        
        return fdiStream.get_buffer();
    }

    this.saveToUDI = function() {
        var udiStream = new MemoryStream([]);
        udiStream.writeMultiple([0x55, 0x44, 0x49, 0x21]); // UDI!
        udiStream.writeMultiple([0x00, 0x00, 0x00, 0x00]); // File size
        udiStream.write(0x00); // Version
        udiStream.write(_cylinders.length - 1);
        udiStream.write(_headCount - 1);
        udiStream.write(0x00); // Unused
        udiStream.writeMultiple([0x00, 0x00, 0x00, 0x00]); // Extended header length
        for (var cylIndex = 0; cylIndex < _cylinders.length; cylIndex++)
        for (var headIndex = 0; headIndex < _headCount; headIndex++) {
            var track = _cylinders[cylIndex][headIndex];
            var trackStream = new MemoryStream(track);
            udiStream.write(_isDoubleDensity ? 0x00 : 0x01);
            udiStream.writeMultiple([track.length & 0xFF, track.length >> 8]);
            var next;
            while ((next = trackStream.read()) >= 0) {
                udiStream.write(next & 0xFF);
            }
            trackStream.seek(0, SeekOrigin.begin);
            var cmsize = (track.length >> 3) + (((track.length & 7) + 7) >> 3);
            for (var i = 0; i < cmsize; i++) {
                var bytes = trackStream.readMultuple(8);
                var bits = 0x00;
                for (var j = 0, mask = 1; j < bytes.length; j++, mask <<= 1) {
                    if (bytes[j] & 0x0100) {
                        bits |= mask;
                    }
                }
                udiStream.write(bits);
            }
        }
        udiStream.seek(4, SeekOrigin.begin);
        udiStream.writeMultiple([
            (udiStream.get_length() >> 0) & 0xFF,
            (udiStream.get_length() >> 8) & 0xFF,
            (udiStream.get_length() >> 16) & 0xFF,
            (udiStream.get_length() >> 24) & 0xFF
        ]);
        var crc = CRC32GEN.poly_edb88320();
        crc.addArray(udiStream.get_buffer());
        udiStream.seek(0, SeekOrigin.end);
        udiStream.writeMultiple([
            (crc.get_value() >> 0) & 0xFF,
            (crc.get_value() >> 8) & 0xFF,
            (crc.get_value() >> 16) & 0xFF,
            (crc.get_value() >> 24) & 0xFF
        ]);
        return udiStream.get_buffer();
    };

    this.saveToTD0 = function () {
        var td0RawStream = new MemoryStream([]);
        var td0Stream = new CRCWrapper(td0RawStream, CRC16GEN.poly_A097());
        td0Stream.writeMultiple([0x54, 0x44]); // TD
        td0Stream.write(0); // Sequence
        td0Stream.write(0); // Check sequence
        td0Stream.write(0x15); // Version 1.5
        td0Stream.write(_isDoubleDensity ? 0x00 : 0x80); // Single density flag & Data rate code
        td0Stream.write(0x04); // Drive type (3.5'' 1.44MB)
        td0Stream.write(0x00); // Comment block flag & Stepping code
        td0Stream.write(0x00); // DOS allocation flag
        td0Stream.write(_headCount);
        td0Stream.get_stream().writeMultiple([
            td0Stream.get_crc().get_value() & 0xFF,
            td0Stream.get_crc().get_value() >> 8
        ]);

        for (var cylIndex = 0; cylIndex < _cylinders.length; cylIndex++)
        for (var headIndex = 0; headIndex < _headCount; headIndex++) {
            var track = _cylinders[cylIndex][headIndex];
            var trackRawStream = new MemoryStream(track);
            var trackStream = new CRCWrapper(trackRawStream, CRC16GEN.poly_1021());
            
            var sectorInfoArr = [];
            var sectorInfo = null;
            var nextBogusSectorIndex = 100;
            var amDetector = new VG93AMDetector(_isDoubleDensity);
            while (true) {
                var next;
                do {
                    next = trackStream.read();
                    if (_isDoubleDensity && (next & 0x1FF) == 0x1A1) {
                        trackStream.get_crc().preset(0xCDB4);
                    }
                    else if (!_isDoubleDensity && ((next & 0x1FC) == 0x1F8 || (next & 0x1FF) == 0x1FC || (next ^ 0x1FF) == 0x1FE)) {
                        trackStream.get_crc().preset(0xFFFF);
                        trackStream.get_crc().add(next);
                    }
                    amDetector.analyseNext(next);
                }
                while (next >= 0 && !amDetector.get_marker());
                if (next < 0)
                    break;
                switch (amDetector.get_marker()) {
                    case 0xFE:
                        if (sectorInfo) {
                            // HEADER WITHOUT DATA
                            sectorInfoArr.push(sectorInfo);
                        }
                        var id = trackStream.readMultuple(4);
                        var crcCalculated = trackStream.get_crc().get_value();
                        var crcPresented = (trackStream.read() << 8) | trackStream.read();
                        sectorInfo = {
                            cyl: id[0],
                            head: id[1],
                            sec: id[2],
                            size: id[3],
                            crc1: crcPresented,
                            crc1Calc: crcCalculated
                        };
                        break;
                    case 0xF8:
                    case 0xF9:
                    case 0xFA:
                    case 0xFB:
                        if (!sectorInfo) {
                            // DATA WITHOUT ID
                            sectorInfo = {
                                cyl: cylIndex,
                                head: headIndex,
                                sec: nextBogusSectorIndex++,
                                size: -1
                            };
                        }
                        sectorInfo.dataAM = amDetector.get_marker();
                        if (sectorInfo.size >= 0) {
                            // NORMAL DATA
                            var secLen = 0x0080 << sectorInfo.size;
                            var secData = trackStream.readMultuple(secLen);
                            if (secData.length == secLen) {
                                sectorInfo.data = secData;
                                sectorInfo.crc2Calc = trackStream.get_crc().get_value();
                                sectorInfo.crc2 = (trackStream.read() << 8) | trackStream.read();
                            }
                        }
                        else {
                            // DATA WITHOUT ID
                            // get all the data till the next address marker
                            var amDetector2 = new VG93AMDetector(_isDoubleDensity);
                            var sectorDataBeginPos = trackStream.get_position();
                            var sectorDataBeginCrc = trackStream.get_crc().get_value();
                            var sectorData = [];
                            do {
                                next = trackStream.read();
                                if (_isDoubleDensity && (next & 0x1FF) == 0x1A1) {
                                    trackStream.get_crc().preset(0xCDB4);
                                }
                                else if (!_isDoubleDensity && ((next & 0x1FC) == 0x1F8 || (next & 0x1FF) == 0x1FC || (next ^ 0x1FF) == 0x1FE)) {
                                    trackStream.get_crc().preset(0xFFFF);
                                    trackStream.get_crc().add(next);
                                }
                                amDetector2.analyseNext(next);
                                if (next >= 0 && !amDetector2.get_marker()) {
                                    sectorData.push(next);
                                }
                            }
                            while (next >= 0 && !amDetector2.get_marker());
                            // try to guess sector length by looking for correct crc
                            var sectorLen = 0x2000;
                            while ((sectorData.length + 2) < sectorLen) {
                                sectorLen >>= 1;
                            }
                            while (sectorLen >= 0x0080) {
                                var crc = CRC16GEN.poly_1021();
                                crc.preset(sectorDataBeginCrc);
                                crc.addArray(sectorData, 0, sectorLen);
                                var postCrc = (sectorData[sectorLen + 1] << 8) || sectorData[sectorLen];
                                if (crc.get_value() == postCrc) {
                                    sectorInfo.data = sectorData.slice(0, sectorLen);
                                    sectorInfo.crc2 = postCrc;
                                    sectorInfo.crc2Calc = crc.get_value();
                                    var s = 0;
                                    for (var l = sectorLen; l > 0x0080; l >>= 1) {
                                        s++;
                                    }
                                    sectorInfo.size = s;
                                    break;
                                }
                            }
                            // if it failed then take the maximum possible sector size with wrong crc
                            if (!sectorInfo.data) {
                                sectorLen = 0x2000;
                                while ((sectorData.length + 2) < sectorLen) {
                                    sectorLen >>= 1;
                                }
                                if (sectorLen >= 0x0080) {
                                    var crc = CRC16GEN.poly_1021();
                                    crc.preset(sectorDataBeginCrc);
                                    crc.addArray(sectorData, 0, sectorLen);
                                    sectorInfo.data = sectorData.slice(0, sectorLen);
                                    sectorInfo.crc2 = (sectorData[sectorLen + 1] << 8) | sectorData[sectorLen];
                                    sectorInfo.crc2Calc = crc.get_value();
                                    var s = 0;
                                    for (var l = sectorLen; l > 0x0080; l >>= 1) {
                                        s++;
                                    }
                                    sectorInfo.size = s;
                                }
                            }
                            // set stream position just after the sector data block (if it exists)
                            trackStream.seek(sectorDataBeginPos, SeekOrigin.begin);
                            trackStream.get_crc().preset(sectorDataBeginCrc);
                            if (sectorInfo.size >= 0) {
                                trackStream.seek((0x0080 << sectorInfo.size) + 2, SeekOrigin.current);
                                trackStream.get_crc().addArray(sectorInfo.data);
                                trackStream.get_crc().add(sectorInfo.crc2 >> 8);
                                trackStream.get_crc().add(sectorInfo.crc2 & 0xFF);
                            }
                        }
                        sectorInfoArr.push(sectorInfo);
                        sectorInfo = null;
                        break;
                }
            }
            if (sectorInfo) {
                sectorInfoArr.push(sectorInfo);
                sectorInfo = null;
            }

            td0Stream.get_crc().preset(0);
            td0Stream.write(sectorInfoArr.length);
            td0Stream.write(cylIndex);
            td0Stream.write(headIndex);
            td0Stream.write(td0Stream.get_crc().get_value() & 0xFF);
            for (var secIndex = 0; secIndex < sectorInfoArr.length; secIndex++) {
                var sectorInfo = sectorInfoArr[secIndex];
                td0Stream.write(sectorInfo.cyl);
                td0Stream.write(sectorInfo.head);
                td0Stream.write(sectorInfo.sec);
                td0Stream.write(Math.max(sectorInfo.size, 0));
                var secFlags = 
                    ((!!sectorInfo.data && sectorInfo.crc2 != sectorInfo.crc2Calc) << 1)
                    | (((sectorInfo.dataAM & 0xFE) == 0xF8) << 2)
                    | ((!sectorInfo.data) << 5)
                    | ((sectorInfo.sec >= 100) << 6);
                td0Stream.write(secFlags);
                if (sectorInfo.data) {
                    var crc = CRC16GEN.poly_A097();
                    crc.addArray(sectorInfo.data);
                    td0Stream.write(crc.get_value() & 0xFF);
                    // UNDONE: analyze data and use different encoding methods to preserve space
                    var l = sectorInfo.data.length + 1;
                    td0Stream.write(l & 0xFF);
                    td0Stream.write(l >> 8);
                    td0Stream.write(0);
                    td0Stream.writeMultiple(sectorInfo.data);
                }
                else {
                    td0Stream.write(0); // lo(crc)
                }
            }
        }
        td0Stream.write(0xFF);

        return td0Stream.get_buffer();
    };
}
