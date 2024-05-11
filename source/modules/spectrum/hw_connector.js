function HWConnector() {
}
Object.assign(HWConnector.prototype, {
    propagateSettings: function (settings) {
        ZXContext.settings = settings;
        ZXContext.hw.bus.opt(OPT_TSTATES_PER_INTRQ, settings.get_turboMode() ? settings.get_tstatesPerIntrqTurbo() : settings.get_tstatesPerIntrq());
        ZXContext.hw.bus.opt(OPT_INTRQ_PERIOD, settings.get_intrqPeriod());
        ZXContext.hw.bus.opt(OPT_EXTENDED_MEMORY, settings.get_extendedMemory());
        ZXContext.hw.bus.opt(OPT_SEMICOLORS, settings.get_semicolors());
        ZXContext.hw.display.set_threading(settings.get_threading());
        ZXContext.hw.bus.opt(OPT_RENDERING_PARAMS, {
            scale: settings.get_scaleValue(),
            scaleType: settings.get_scaleType(),
            rendererType: settings.get_rendererType(),
            renderOnAnimationFrame: settings.get_renderOnAnimationFrame()
        });
        ZXContext.hw.tapeRecorders[0].applySettings(
            settings.get_tapePrePauseCounterPulseDuration(),
            settings.get_tapeDefaultPause(),
            settings.get_tapeAutoPlayOnStandardRoutine(),
            settings.get_tapeAutoPlayOnCustomLoader(),
            settings.get_tapeAutoStopAfterDataBlock(),
            settings.get_tapeAutoStopOnLongPostPause(),
            settings.get_tapeAutoStopOnLongPostPauseDuration(),
            settings.get_tapeAutoStopOnZeroPostPause(),
            settings.get_tapeBoostFactor(),
            settings.get_tapeGlobalAutoPlay(),
            settings.get_tapeGlobalAutoStop()
        );
        ZXContext.hw.psg.applySettings(
            settings.get_beeper(),
            settings.get_beeperVolume(),
            settings.get_psg(),
            settings.get_psgTurboSound(),
            settings.get_psgChannelLayout(),
            settings.get_psgClock(),
            settings.get_psgPacketSize(),
            settings.get_psgVolume()
        );
        return Promise.resolve();
    },
    bindVirtualDisplay: function (canvases) {
        ZXContext.hw.display.bind(canvases);
        return Promise.resolve();
    },
    switchKeyboardKeys: function (keys, pressed) {
        ZXContext.hw.keyboard.switchKeys(keys, pressed);
        return Promise.resolve();
    },
    switchMouseButton: function (key, pressed) {
        ZXContext.hw.mouse.switchButton(key, pressed);
        return Promise.resolve();
    },
    moveMouse: function (offsetX, offsetY) {
        offsetX && ZXContext.hw.mouse.moveX(offsetX);
        offsetY && ZXContext.hw.mouse.moveY(offsetY);
        return Promise.resolve();
    },
    wheelMouse: function (offset) {
        offset && ZXContext.hw.mouse.wheel(offset);
        return Promise.resolve();
    },
    reset: function () {
        ZXContext.hw.bus.reset();
        return Promise.resolve();
    },
    restoreSnapshot: function (format, data) {
        var snapshot = null;
        switch (format) {
            case 'SNA': snapshot = ZX_Snapshot.createFromSNA(data); break;
            case 'Z80': snapshot = ZX_Snapshot.createFromZ80(data); break;
        }
        if (snapshot) {
            ZX_Snapshot.restore(snapshot, ZXContext.hw.bus, ZXContext.hw.cpu, ZXContext.hw.psg);
        }
        return Promise.resolve();
    },
    takeSnapshot: function () {
        var snapshot = ZX_Snapshot.take(ZXContext.hw.bus, ZXContext.hw.cpu, ZXContext.hw.psg);
        var data = ZX_Snapshot.saveToSNA(snapshot);
        return Promise.resolve(data);
    },
    createDriveImage: function (driveIndex, cylCount, headCount, trdosFormat) {
        ZXContext.hw.drives[driveIndex].create(cylCount,headCount, trdosFormat);
        return Promise.resolve();
    },
    setDriveImage: function (driveIndex, filename, data) {
        var format = DiskImageFormat.getFromFileName(filename);
        switch (format) {
            case 'TRD': ZXContext.hw.drives[driveIndex].insertTRD(data); break;
            case 'SCL': ZXContext.hw.drives[driveIndex].insertSCL(data); break;
            case 'FDI': ZXContext.hw.drives[driveIndex].insertFDI(data); break;
            case 'TD0': ZXContext.hw.drives[driveIndex].insertTD0(data); break;
            case 'UDI': ZXContext.hw.drives[driveIndex].insertUDI(data); break;
            case 'DSK': ZXContext.hw.drives[driveIndex].insertDSK(data); break;
            default: throw new Error(ZX_Lang.ERR_IMAGE_FORMAT_NOT_SUPPORTED + ' (' + format + ')');
        }
        return Promise.resolve();
    },
    getDriveImageFormats: function (driveIndex) {
        var formats = null;
        var floppy = ZXContext.hw.drives[driveIndex];
        if (floppy.get_isReady()) {
            formats = floppy.getCompatibleFormats();
        }
        return Promise.resolve(formats);
    },
    getDriveImage: function (driveIndex, format) {
        var data;
        switch (format) {
            case 'TRD': data = ZXContext.hw.drives[driveIndex].saveToTRD(); break;
            case 'FDI': data = ZXContext.hw.drives[driveIndex].saveToFDI(); break;
            case 'SCL': data = ZXContext.hw.drives[driveIndex].saveToSCL(); break;
            case 'TD0': data = ZXContext.hw.drives[driveIndex].saveToTD0(); break;
            case 'UDI': data = ZXContext.hw.drives[driveIndex].saveToUDI(); break;
            case 'DSK': throw new Error(ZX_Lang.ERR_DSK_IMAGE_WRITING_UNSUPPORTED);
            default: throw new Error(ZX_Lang.ERR_IMAGE_FORMAT_NOT_SUPPORTED + ' (' + format + ')');
        }
        return Promise.resolve(data);
    },
    clearDriveImage: function (driveIndex) {
        ZXContext.hw.drives[driveIndex].eject();
        return Promise.resolve();
    },
    insertTape: function (index, filename, data) {
        try {
            var format = TapeFormat.getFromFileName(filename);
            switch (format) {
                case 'TAP':
                case 'SPC':
                case 'STA':
                case 'LTP':
                case 'ZXT':
                case 'TZX':
                    ZXContext.hw.tapeRecorders[index].insertTape(data, format);
                    return Promise.resolve();
                default:
                    throw new Error(ZX_Lang.ERR_IMAGE_FORMAT_NOT_SUPPORTED + ' (' + format + ')');
            }
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    ejectTape: function (index) {
        try {
            ZXContext.hw.tapeRecorders[index].ejectTape();
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    playTape: function (index) {
        try {
            ZXContext.hw.tapeRecorders[index].play(true);
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    pauseTape: function (index) {
        try {
            ZXContext.hw.tapeRecorders[index].pause(true);
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    stopTape: function (index) {
        try {
            ZXContext.hw.tapeRecorders[index].stop(true);
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    getTapeStructure: function (index) {
        try {
            var structure = ZXContext.hw.tapeRecorders[index].getStructure();
            return Promise.resolve(structure);
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    selectTapeBlock: function (index, blockIndex) {
        try {
            ZXContext.hw.tapeRecorders[index].selectBlock(blockIndex);
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    setTapeGlobalAutoPlay: function (index, value) {
        try {
            ZXContext.hw.tapeRecorders[index].set_globalAutoPlay(value);
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    setTapeGlobalAutoStop: function (index, value) {
        try {
            ZXContext.hw.tapeRecorders[index].set_globalAutoStop(value);
            return Promise.resolve();
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    run: function () {
        ZXContext.hw.clock.run();
        return Promise.resolve();
    },
    hwReady: function () {
        // ждем загрузки ПЗУ и инициализации аудио
        return Promise.all([
            ZXContext.hw.rom.get_ready$().catch(function (error) {
                handleError(ZX_Lang.ERR_ROM_LOADING_ERROR + ' ' + error);
            })
        ]);
    },
    setVolume: function (beeperVolume, psgVolume) {
        ZXContext.hw.psg.setVolume(beeperVolume, psgVolume);
        return Promise.resolve();
    },
    get_onKeyboardKeysStateChanged: function () {
        return ZXContext.hw.keyboard.get_onKeysStateChanged();
    },
    get_onMouseAction: function () {
        return ZXContext.hw.mouse.get_onAction();
    },
    get_onDrive0StateChanged: function () {
        return ZXContext.hw.drives[0].get_onStateChanged();
    },
    get_onDrive1StateChanged: function () {
        return ZXContext.hw.drives[1].get_onStateChanged();
    },
    get_onDrive2StateChanged: function () {
        return ZXContext.hw.drives[2].get_onStateChanged();
    },
    get_onDrive3StateChanged: function () {
        return ZXContext.hw.drives[3].get_onStateChanged();
    },
    get_onPsgDataReady: function () {
        return ZXContext.hw.psg.get_onDataReady();
    },
    get_onTape0StateChanged: function () {
        return ZXContext.hw.tapeRecorders[0].get_onStateChanged();
    },
    get_onTape0TapeEvent: function () {
        return ZXContext.hw.tapeRecorders[0].get_onTapeEvent();
    }
});