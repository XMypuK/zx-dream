function HWConnectorProxy(worker) {
    this._worker = worker;
    this._rpcIdCounter = 0;
    this._rpcPromises = {};
    this._eventProxies = {};
    this._workerReadyPromise = Promise.withResolvers();
    this._transferedCanvases = [];
    this._init();
}
Object.assign(HWConnectorProxy.prototype, {
    _init: function () {
        this._worker.onmessage = this._onWorkerMessage.bind(this);
        this._worker.onmessageerror = this._onWorkerMessageError.bind(this);
        this._worker.onerror = this._onError.bind(this);
    },
    _onWorkerMessage: function (e) {
        var message = e.data;
        switch (message.type) {
            case HWCONNECTOR_MESSAGE_TYPE.workerReady:
                this._workerReadyPromise.resolve();
                break;
            case HWCONNECTOR_MESSAGE_TYPE.rpcResult:
                this._processRpcResult(message.rpcId, message.result);
                break;
            case HWCONNECTOR_MESSAGE_TYPE.rpcError:
                this._processRpcError(message.rpcId, message.error);
                break;
            case HWCONNECTOR_MESSAGE_TYPE.reEmit:
                this._processReEmission(message.getMethod, message.args);
                break;
        }
    },
    _onWorkerMessageError: function (e) {
        handleError(e);
    },
    _onError: function (e) {
        handleError(e);
    },
    _rpc: function(method, args, transfer) {
        var rpcId = this._rpcIdCounter++;
        var p = Promise.withResolvers();
        this._rpcPromises[rpcId] = p;
        this._worker.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.rpc,
            rpcId: rpcId,
            method: method,
            args: args
        }, transfer || []);
        return p.promise;
    },
    _processRpcResult: function (rpcId, result) {
        var p = this._rpcPromises[rpcId];
        p.resolve(result);
        delete this._rpcPromises[rpcId];
    },
    _processRpcError: function (rpcId, error) {
        var p = this._rpcPromises[rpcId];
        p.reject(error);
        delete this._rpcPromises[rpcId];
    },
    _getEventProxy: function (getMethod) {
        return (
            this._eventProxies[getMethod] || 
            (this._eventProxies[getMethod] = new ZX_EventProxy(this, getMethod))
        );
    },
    _reSubscribe: function (getMethod) {
        this._worker.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.reSubscribe,
            getMethod: getMethod
        });
    },
    _reUnsibscribe: function (getMethod) {
        this._worker.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.reUnsubscribe,
            getMethod: getMethod
        });
    },
    _processReEmission: function (getMethod, args) {
        this._getEventProxy(getMethod).emit(args);
    },
    propagateSettings: function (settings) {
        return this._rpc('propagateSettings', [settings._container]);
    },
    bindVirtualDisplay: function (canvases) {
        var borderCanvas = this._transferedCanvases.indexOf(canvases[0]) < 0
            ? this._transferedCanvases.push(canvases[0]) && canvases[0].transferControlToOffscreen()
            : null;
        var screenCanvas = this._transferedCanvases.indexOf(canvases[1]) < 0
            ? this._transferedCanvases.push(canvases[1]) && canvases[1].transferControlToOffscreen()
            : null;
        var offscreenCanvases = [borderCanvas, screenCanvas];
        return this._rpc('bindVirtualDisplay', [offscreenCanvases], offscreenCanvases.filter(function (canvas) { return !!canvas; }));
    },
    switchKeyboardKeys: function (keys, pressed) {
        return this._rpc('switchKeyboardKeys', [keys, pressed]);
    },
    switchMouseButton: function (key, pressed) {
        return this._rpc('switchMouseButton', [key, pressed]);
    },
    moveMouse: function (offsetX, offsetY) {
        return this._rpc('moveMouse', [offsetX, offsetY]);
    },
    wheelMouse: function (offset) {
        return this._rpc('wheelMouse', [offset]);
    },
    reset: function () {
        return this._rpc('reset', []);
    },
    restoreSnapshot: function (format, data) {
        return this._rpc('restoreSnapshot', [format, data]);
    },
    takeSnapshot: function () {
        return this._rpc('takeSnapshot', []);
    },
    createDriveImage: function (driveIndex, cylCount, headCount, trdosFormat) {
        return this._rpc('createDriveImage', [driveIndex, cylCount, headCount, trdosFormat]);
    },
    setDriveImage : function (driveIndex, filename, data) {
        return this._rpc('setDriveImage', [driveIndex, filename, data]);
    },
    getDriveImageFormats: function (driveIndex) {
        return this._rpc('getDriveImageFormats', [driveIndex]);
    },
    getDriveImage: function (driveIndex, format) {
        return this._rpc('getDriveImage', [driveIndex, format]);
    },
    clearDriveImage: function (driveIndex) {
        return this._rpc('clearDriveImage', [driveIndex]);
    },
    insertTape: function (index, filename, data) {
        return this._rpc('insertTape', [index, filename, data]);
    },
    ejectTape: function (index) {
        return this._rpc('ejectTape', [index]);
    },
    playTape: function (index) {
        return this._rpc('playTape', [index]);
    },
    pauseTape: function (index) {
        return this._rpc('pauseTape', [index]);
    },
    stopTape: function (index) {
        return this._rpc('stopTape', [index]);
    },
    getTapeStructure: function (index) {
        return this._rpc('getTapeStructure', [index]);
    },
    selectTapeBlock: function (index, blockIndex) {
        return this._rpc('selectTapeBlock', [index, blockIndex]);
    },
    run: function () {
        return this._rpc('run', []);
    },
    hwReady: function () {
        return this._rpc('get_onHWReady', []);
    },
    setVolume: function (beeperVolume, psgVolume) {
        return this._rpc('setVolume', [beeperVolume, psgVolume]);
    },
    get_onKeyboardKeysStateChanged: function () {
        return this._getEventProxy('get_onKeyboardKeysStateChanged').pub;
    },
    get_onMouseAction: function () {
        return this._getEventProxy('get_onMouseAction').pub;
    },
    get_onDrive0StateChanged: function () {
        return this._getEventProxy('get_onDrive0StateChanged').pub;
    },
    get_onDrive1StateChanged: function () {
        return this._getEventProxy('get_onDrive1StateChanged').pub;
    },
    get_onDrive2StateChanged: function () {
        return this._getEventProxy('get_onDrive2StateChanged').pub;
    },
    get_onDrive3StateChanged: function () {
        return this._getEventProxy('get_onDrive3StateChanged').pub;
    },
    get_onPsgDataReady: function () {
        return this._getEventProxy('get_onPsgDataReady').pub;
    },
    get_onTape0StateChanged: function () {
        return this._getEventProxy('get_onTape0StateChanged').pub;
    },
    get_onTape0TapeEvent: function () {
        return this._getEventProxy('get_onTape0TapeEvent').pub;
    },
    get_workerReady: function () {
        return this._workerReadyPromise.promise;
    },
    notifyMainReady: function () {
        this._worker.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.mainReady
        });
    }
});

function ZX_EventProxy(hwConnectorProxy, getMethod) {
    var _event = new ZX_Event();
    var _subscribed = false;
    var _hwConnectorProxy = hwConnectorProxy;
    var _getMethod = getMethod;

    this.emit = function (args) {
        _event.emit(args);
    }
    this.pub = {
        subscribe: function (handler) {
            if (!_subscribed) {
                _hwConnectorProxy._reSubscribe(_getMethod);
                _subscribed = true;
            }
            _event.pub.subscribe(handler);
        },
        unsubscribe: function (handler) {
            _event.pub.unsubscribe(handler);
            if (_subscribed && _event.isEmpty()) {
                _hwConnectorProxy.reUnsubscribe(_getMethod);
                _subscribed = false;
            }
        }
    };
}
